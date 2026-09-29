// deployment sync marker: 2026-09-28T20:10:00.000Z
import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const databaseUrl = String(process.env.DATABASE_URL || '').replace(/([?&])sslmode=(prefer|require|verify-ca)(?=(&|$))/i, '$1sslmode=verify-full');
const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const allowedOrigins = new Set([
  ...String(process.env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean),
  'https://mostafaatteef-eng.github.io',
  'https://ntss-schools.edu.eg',
  'https://www.ntss-schools.edu.eg',
]);
const isAllowedOrigin = (origin: string) => allowedOrigins.has(origin.replace(/\/$/, ''));
const tokenHash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const scryptPasswordHash = (password: string) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return ['scrypt', salt, derived].join(':');
};
const isScryptPasswordHash = (hash: string) => String(hash || '').startsWith('scrypt:');
const verifyScryptPassword = (password: string, stored: string) => {
  const parts = String(stored || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !parts[1] || !/^[0-9a-f]+$/i.test(parts[2])) return false;
  const expected = Buffer.from(parts[2], 'hex');
  if (!expected.length) return false;
  const computed = crypto.scryptSync(password, parts[1], expected.length);
  return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
};

const dummyPasswordSalt = 'ntss-login-timing-equalizer';
const consumeDummyPasswordHash = (password: string) => legacyPasswordHash(password, dummyPasswordSalt, 10000);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginKey = (request: Request, identifier: string) => {
  const forwarded = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return tokenHash(`${forwarded || 'unknown'}|${identifier.toLowerCase()}`);
};
const consumeLoginAttempt = async (key: string) => {
  const windowSeconds=Math.floor(LOGIN_WINDOW_MS/1000);
  try {
    const q=await pool.query(`INSERT INTO login_rate_limits(key_hash,attempts,window_started_at,updated_at)
      VALUES($1,1,now(),now())
      ON CONFLICT(key_hash) DO UPDATE SET
        attempts=CASE WHEN login_rate_limits.window_started_at <= now()-($2::int * interval '1 second') THEN 1 ELSE login_rate_limits.attempts+1 END,
        window_started_at=CASE WHEN login_rate_limits.window_started_at <= now()-($2::int * interval '1 second') THEN now() ELSE login_rate_limits.window_started_at END,
        updated_at=now()
      RETURNING attempts,window_started_at`,[key,windowSeconds]);
    const row=q.rows[0];
    const retryAfter=Math.max(1,windowSeconds-Math.floor((Date.now()-new Date(row.window_started_at).getTime())/1000));
    return {allowed:Number(row.attempts)<=LOGIN_MAX_ATTEMPTS,retryAfter:Number(row.attempts)>LOGIN_MAX_ATTEMPTS?retryAfter:0};
  } catch (error:any) {
    if (String(error?.code||'') !== '42P01') throw error;
    console.error(JSON.stringify({ marker: 'NTSS_RATE_LIMIT_SCHEMA_MISSING', table: 'login_rate_limits' }));
    // Schema changes belong to versioned migrations, never to the login hot path.
    // Fail closed until the required migration has been applied.
    return { allowed: false, retryAfter: windowSeconds };
  }
};
const clearLoginAttempts = async (key: string) => {
  try { await pool.query('DELETE FROM login_rate_limits WHERE key_hash=$1',[key]); }
  catch (error:any) { if (String(error?.code||'') !== '42P01') throw error; }
};

const legacyPasswordHash = (password: string, salt: string, iterations: number) => {
  let digest = crypto.createHmac('sha256', salt).update(password + salt).digest();
  for (let i = 1; i < Math.max(1, Number(iterations || 10000)); i++) {
    digest = crypto.createHmac('sha256', salt).update(digest.toString('hex')).digest();
  }
  return digest.toString('hex');
};
const verifyPassword = (password: string, user: any) => {
  const stored = String(user.password_hash || '');
  if (isScryptPasswordHash(stored)) return { valid: verifyScryptPassword(password, stored), legacy: false };
  const computed = Buffer.from(legacyPasswordHash(password, String(user.password_salt || ''), Number(user.password_iterations || 10000)));
  const expected = Buffer.from(stored);
  return { valid: computed.length === expected.length && crypto.timingSafeEqual(computed, expected), legacy: true };
};
const upgradeLegacyPassword = async (userId: string, password: string) => {
  const hash = scryptPasswordHash(password);
  await pool.query('UPDATE users SET password_hash=$2,password_salt=NULL,password_iterations=NULL,updated_at=now() WHERE id=$1', [userId, hash]);
};


function json(data: unknown, status = 200, origin = '', extraHeaders: Record<string,string> = {}) {
  const requestId = extraHeaders['x-request-id'] || crypto.randomUUID();
  const payload = status >= 400 && data && typeof data === 'object' && !Array.isArray(data)
    ? { ...(data as Record<string,unknown>), requestId }
    : data;
  return new Response(JSON.stringify(payload), { status, headers: {
    'content-type': 'application/json',
    'x-request-id': requestId,
    ...(origin ? { 'access-control-allow-origin': origin } : {}),
    'access-control-allow-headers': 'content-type, authorization, cache-control, pragma',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-credentials': 'true',
    'cache-control': 'no-store, no-cache, must-revalidate, private',
    pragma: 'no-cache',