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
const ensureLoginRateLimitStorage = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS login_rate_limits (
    key_hash text PRIMARY KEY,
    attempts integer NOT NULL DEFAULT 0,
    window_started_at timestamptz NOT NULL DEFAULT now(),
    blocked_until timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
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
    await ensureLoginRateLimitStorage();
    return consumeLoginAttempt(key);
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
    expires: '0',
    vary: 'Origin',
    ...extraHeaders,
  }});
}

async function authenticate(request: Request) {
  const bearer = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const cookieHeader = String(request.headers.get('cookie') || '');
  const cookieToken = cookieHeader.split(';').map(x => x.trim()).find(x => x.startsWith('ntss_session='))?.slice('ntss_session='.length) || '';
  const token = bearer || decodeURIComponent(cookieToken);
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT s.id session_id,s.expires_at,s.active_school_id,u.id user_id,u.email,u.full_name,u.role,u.access_scope,u.school_id,u.employee_id,u.student_id
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.status='ACTIVE' AND s.revoked_at IS NULL
       AND s.expires_at>now() AND u.is_active=true AND u.status='Active' LIMIT 1`,
    [tokenHash(token)]
  );
  return rows[0] || null;
}

async function canAccessSchool(user: any, schoolId: string) {
  if (!schoolId) return false;
  if (user.access_scope === 'GLOBAL') {
    const school = await pool.query("SELECT 1 FROM schools WHERE id=$1 AND status='ACTIVE' LIMIT 1", [schoolId]);
    return school.rowCount > 0;
  }
  if (user.school_id === schoolId) {
    const school = await pool.query("SELECT 1 FROM schools WHERE id=$1 AND status='ACTIVE' LIMIT 1", [schoolId]);
    return school.rowCount > 0;
  }
  const result = await pool.query(
    "SELECT 1 FROM user_school_access usa JOIN schools s ON s.id=usa.school_id WHERE usa.user_id=$1 AND usa.school_id=$2 AND s.status='ACTIVE' LIMIT 1",
    [user.user_id, schoolId]
  );
  return result.rowCount > 0;
}

export const ntssHandler = {
  async fetch(request: Request) {
    const traceRequestId = String(request.headers.get('x-request-id') || crypto.randomUUID());
    const respond = (data: unknown, status = 200, origin = '', extraHeaders: Record<string,string> = {}) => json(data,status,origin,{...extraHeaders,'x-request-id':traceRequestId});
    const origin = String(request.headers.get('origin') || '').trim();
    const hasOrigin = Boolean(origin);
    const originAllowed = !hasOrigin || isAllowedOrigin(origin);
    const corsOrigin = hasOrigin && originAllowed ? origin.replace(/\/$/, '') : '';
    if (hasOrigin && !originAllowed) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 403, headers: { vary: 'Origin' } });
      return respond({ status: 'error', code: 'ORIGIN_NOT_ALLOWED' }, 403, '');
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      ...(corsOrigin ? { 'access-control-allow-origin': corsOrigin } : {}),
      'access-control-allow-headers': 'content-type, authorization, cache-control, pragma', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-credentials': 'true', vary: 'Origin'
    }});

    console.log(JSON.stringify({ marker: 'NTSS_REQ', requestId: traceRequestId, method: request.method, origin, corsOrigin, url: request.url }));
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';

    try {
      if (request.method === 'GET' && path === '/health') {
        await pool.query('SELECT 1');
        console.log(JSON.stringify({ marker: 'NTSS_HEALTH_OK', corsOrigin }));
        return json({ status: 'success', serviceAvailable: true, backend: 'ntss-postgres', version: '1.1.0' }, 200, corsOrigin);
      }

      if (request.method === 'POST' && path === '/student/login') {
        const startedAt = performance.now();
        const requestId = crypto.randomUUID();
        const body: any = await request.json();
        const studentCode = String(body.studentCode || '').trim();
        const password = String(body.password || '');
        if (!studentCode || !password) return respond({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        const studentLoginKey = loginKey(request, studentCode);
        const studentRate = await consumeLoginAttempt(studentLoginKey);
        if (!studentRate.allowed) return respond({ status: 'error', code:'RATE_LIMITED', retryAfter:studentRate.retryAfter },429,corsOrigin);
        const result = await pool.query(
          `SELECT u.id,u.full_name,u.role,u.access_scope,u.school_id,u.student_id,u.password_hash,u.password_salt,u.password_iterations,u.is_active,u.status,s.student_code
           FROM users u JOIN students s ON s.school_id=u.school_id AND s.id=u.student_id
           WHERE u.role='Student' AND u.access_scope='SELF' AND s.student_code=$1
           LIMIT 2`,
          [studentCode]
        );
        if (result.rowCount !== 1) {
          consumeDummyPasswordHash(password);
          console.log(JSON.stringify({ marker: 'NTSS_STUDENT_LOGIN_DENIED', requestId, reason: 'identifier', totalMs: Math.round(performance.now()-startedAt) }));
          return respond({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        }
        const user = result.rows[0];
        if (!user.is_active || user.status !== 'Active') return respond({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        const passwordCheck = verifyPassword(password, user);
        if (!passwordCheck.valid) {
          console.log(JSON.stringify({ marker: 'NTSS_STUDENT_LOGIN_DENIED', requestId, reason: 'password', totalMs: Math.round(performance.now()-startedAt) }));
          return respond({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        }
        if (passwordCheck.legacy) await upgradeLegacyPassword(user.id, password);
        const token = crypto.randomBytes(32).toString('base64url');
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 86400000);
        await Promise.all([
          pool.query('INSERT INTO sessions(id,user_id,token_hash,active_school_id,expires_at) VALUES($1,$2,$3,$4,$5)', [sessionId,user.id,tokenHash(token),user.school_id,expiresAt]),
          pool.query('UPDATE users SET last_login_at=now(), updated_at=now() WHERE id=$1', [user.id])
        ]);
        await clearLoginAttempts(studentLoginKey);
        console.log(JSON.stringify({ marker: 'NTSS_STUDENT_LOGIN_SUCCESS', requestId, userId:user.id, totalMs:Math.round(performance.now()-startedAt) }));
        return json({ status:'success', sessionToken: token, expiresAt:expiresAt.toISOString(), user:{
          id:user.id, fullName:user.full_name, role:'Student', accessScope:'SELF', schoolId:user.school_id,
          activeSchoolId:user.school_id, allowedSchoolIds:[user.school_id], studentId:user.student_id, studentCode:user.student_code
        }},200,corsOrigin, {'set-cookie': `ntss_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=86400`});
      }

      if (request.method === 'POST' && path === '/login') {
        const loginStartedAt = performance.now();
        const requestId = crypto.randomUUID();
        const body: any = await request.json();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        if (!email || !password) return respond({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        const staffLoginKey = loginKey(request, email);
        const staffRate = await consumeLoginAttempt(staffLoginKey);
        if (!staffRate.allowed) return respond({ status: 'error', code:'RATE_LIMITED', retryAfter:staffRate.retryAfter },429,corsOrigin);
        const dbStartedAt = performance.now();
        const query = await pool.query(
          `SELECT id,email,full_name,role,access_scope,school_id,employee_id,password_hash,password_salt,password_iterations,is_active,status
           FROM users WHERE lower(email)=$1 LIMIT 1`,
          [email]
        );
        const dbMs = Math.round(performance.now() - dbStartedAt);
        const user = query.rows[0];
        if (user?.role === 'Student') return respond({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        if (!user || !user.is_active || user.status !== 'Active') {
          consumeDummyPasswordHash(password);
          console.log(JSON.stringify({ marker: 'NTSS_LOGIN_DENIED', requestId, reason: 'user', dbMs, totalMs: Math.round(performance.now() - loginStartedAt) }));
          return respond({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        }

        const authStartedAt = performance.now();
        const passwordCheck = verifyPassword(password, user);
        const authMs = Math.round(performance.now() - authStartedAt);
        if (!passwordCheck.valid) {
          console.log(JSON.stringify({ marker: 'NTSS_LOGIN_DENIED', requestId, reason: 'password', dbMs, authMs, totalMs: Math.round(performance.now() - loginStartedAt) }));
          return respond({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        }

        if (passwordCheck.legacy) await upgradeLegacyPassword(user.id, password);
        const token = crypto.randomBytes(32).toString('base64url');
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 86400000);
        const sessionStartedAt = performance.now();
        const [, access] = await Promise.all([
          pool.query('INSERT INTO sessions(id,user_id,token_hash,active_school_id,expires_at) VALUES($1,$2,$3,$4,$5)', [sessionId, user.id, tokenHash(token), user.school_id || null, expiresAt]),
          pool.query('SELECT school_id FROM user_school_access WHERE user_id=$1', [user.id]),
        ]);
        const sessionMs = Math.round(performance.now() - sessionStartedAt);
        const totalMs = Math.round(performance.now() - loginStartedAt);
        await clearLoginAttempts(staffLoginKey);
        console.log(JSON.stringify({ marker: 'NTSS_LOGIN_SUCCESS', requestId, userId: user.id, dbMs, authMs, sessionMs, totalMs }));
        return json({ status: 'success', sessionToken: token, expiresAt: expiresAt.toISOString(), user: {
          id: user.id, email: user.email, fullName: user.full_name, role: user.role, accessScope: user.access_scope,
          schoolId: user.school_id || '', activeSchoolId: user.school_id || '', allowedSchoolIds: user.role === 'SystemAdmin' && user.access_scope === 'GLOBAL' ? (await pool.query("SELECT id FROM schools WHERE status='ACTIVE' ORDER BY name")).rows.map((x: any) => x.id) : access.rows.map((x: any) => x.school_id), employeeId: user.employee_id || '', studentId: user.student_id || ''
        }}, 200, corsOrigin, {'set-cookie': `ntss_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=86400`});
      }

      const user = await authenticate(request);
      if (!user) return respond({ status: 'error', code: 'UNAUTHORIZED' }, 401, corsOrigin);

      if (request.method === 'GET' && path === '/student/me') {
        if (user.role !== 'Student' || user.access_scope !== 'SELF' || !user.student_id || !user.school_id) {
          return respond({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        }
        const studentResult = await pool.query(
          `SELECT id,student_code,full_name,grade,classroom,section,status
           FROM students WHERE school_id=$1 AND id=$2 LIMIT 1`,
          [user.school_id, user.student_id]
        );
        const student = studentResult.rows[0];
        if (!student) return respond({ status: 'error', code: 'STUDENT_NOT_FOUND' }, 404, corsOrigin);
        const attendance = await pool.query(
          `SELECT attendance_date,status FROM student_attendance
           WHERE school_id=$1 AND student_id=$2
           ORDER BY attendance_date DESC LIMIT 180`,
          [user.school_id, user.student_id]
        );
        const summary = attendance.rows.reduce((acc: any, row: any) => {
          const status = String(row.status || '');
          acc.total += 1;
          if (status === 'غائب' || /absent/i.test(status)) acc.absent += 1;
          else if (status === 'متأخر' || /late/i.test(status)) acc.late += 1;
          else acc.present += 1;
          return acc;
        }, { total: 0, present: 0, absent: 0, late: 0 });
        return json({ status: 'success', data: { student, attendance: attendance.rows, attendanceSummary: summary } }, 200, corsOrigin);
      }

      if (request.method === 'POST' && path === '/validate-session') {
        const isSelfScopedStudent = user.role === 'Student' && user.access_scope === 'SELF';
        const access = isSelfScopedStudent
          ? { rows: user.school_id ? [{ school_id: user.school_id }] : [] }
          : user.access_scope === 'GLOBAL'
            ? await pool.query("SELECT id AS school_id FROM schools WHERE status='ACTIVE' ORDER BY id")
            : await pool.query("SELECT usa.school_id FROM user_school_access usa JOIN schools s ON s.id=usa.school_id WHERE usa.user_id=$1 AND s.status='ACTIVE' ORDER BY usa.school_id", [user.user_id]);
        const allowedSchoolIds = access.rows.map((x: any) => x.school_id);
        const activeSchoolId = isSelfScopedStudent
          ? (user.school_id || '')
          : (user.active_school_id && allowedSchoolIds.includes(user.active_school_id) ? user.active_school_id : (user.school_id && allowedSchoolIds.includes(user.school_id) ? user.school_id : ''));
        return json({ status: 'success', valid: true, expiresAt: user.expires_at, user: {
          id: user.user_id, email: user.email, fullName: user.full_name, role: user.role, accessScope: user.access_scope,
          schoolId: user.school_id || '', activeSchoolId, allowedSchoolIds, employeeId: user.employee_id || '', studentId: user.student_id || ''
        }}, 200, corsOrigin);
      }

      if (request.method === 'POST' && path === '/logout') {
        await pool.query("UPDATE sessions SET status='REVOKED',revoked_at=now() WHERE id=$1 AND user_id=$2 AND status='ACTIVE'", [user.session_id, user.user_id]);
        return json({ status: 'success', message: 'تم إنهاء الجلسة.' }, 200, corsOrigin, {'set-cookie':'ntss_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0'});
      }

      if (request.method === 'GET' && path === '/schools') {
        const query = user.access_scope === 'GLOBAL'
          ? await pool.query("SELECT id,code,name,status FROM schools WHERE status='ACTIVE' ORDER BY name")
          : await pool.query("SELECT id,code,name,status FROM schools WHERE id=$2 OR id IN (SELECT school_id FROM user_school_access WHERE user_id=$1) ORDER BY name", [user.user_id, user.school_id]);
        return json({ status: 'success', data: query.rows }, 200, corsOrigin);
      }

      if (request.method === 'POST' && path === '/schools/create') {
        if (user.role !== 'SystemAdmin' || user.access_scope !== 'GLOBAL') return respond({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const body: any = await request.json();
        const schoolId = String(body.schoolId || '').trim().toUpperCase();
        const code = String(body.schoolCode || '').trim().toUpperCase();
        const name = String(body.schoolName || '').trim();
        if (!schoolId || !code || !name) return respond({ status: 'error', code: 'INVALID_SCHOOL' }, 400, corsOrigin);
        try {
          const created = await pool.query(
            "INSERT INTO schools(id,code,name,status) VALUES($1,$2,$3,'ACTIVE') RETURNING id,code,name,status,created_at,updated_at",
            [schoolId, code, name]
          );
          await pool.query('INSERT INTO user_school_access(user_id,school_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [user.user_id, schoolId]);
          return json({ status: 'success', data: created.rows[0] }, 201, corsOrigin);
        } catch (error: any) {
          if (String(error?.code || '') === '23505') return respond({ status: 'error', code: 'SCHOOL_EXISTS' }, 409, corsOrigin);
          throw error;
        }
      }

      if (request.method === 'POST' && path === '/schools/update') {
        if (user.role !== 'SystemAdmin' || user.access_scope !== 'GLOBAL') return respond({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const body: any = await request.json();
        const schoolId = String(body.schoolId || '').trim().toUpperCase();
        const code = body.schoolCode === undefined ? null : String(body.schoolCode || '').trim().toUpperCase();
        const name = body.schoolName === undefined ? null : String(body.schoolName || '').trim();
        const status = body.status === undefined ? null : (String(body.status).toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
        if (!schoolId || code === '' || name === '') return respond({ status: 'error', code: 'INVALID_SCHOOL' }, 400, corsOrigin);
        try {
          const updated = await pool.query(
            `UPDATE schools SET code=COALESCE($2,code),name=COALESCE($3,name),status=COALESCE($4,status),updated_at=now()
             WHERE id=$1 RETURNING id,code,name,status,created_at,updated_at`,
            [schoolId, code, name, status]
          );
          if (!updated.rowCount) return respond({ status: 'error', code: 'SCHOOL_NOT_FOUND' }, 404, corsOrigin);
          return json({ status: 'success', data: updated.rows[0] }, 200, corsOrigin);
        } catch (error: any) {
          if (String(error?.code || '') === '23505') return respond({ status: 'error', code: 'SCHOOL_CODE_EXISTS' }, 409, corsOrigin);
          throw error;
        }
      }

      if (request.method === 'GET' && path === '/system-overview') {
        if (user.role !== 'SystemAdmin' || user.access_scope !== 'GLOBAL') {
          return respond({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        }
        const result = await pool.query(
          `WITH student_counts AS (
             SELECT school_id,count(*)::int AS count FROM students GROUP BY school_id
           ), employee_counts AS (
             SELECT school_id,count(*)::int AS count FROM employees GROUP BY school_id
           )
           SELECT s.id AS "schoolId", s.code AS "schoolCode", s.name AS "schoolName", s.status,
                  COALESCE(sc.count,0)::int AS "studentsCount",
                  COALESCE(ec.count,0)::int AS "employeesCount"
           FROM schools s
           LEFT JOIN student_counts sc ON sc.school_id=s.id
           LEFT JOIN employee_counts ec ON ec.school_id=s.id
           ORDER BY s.name`
        
        );
        const schools = result.rows.map((s: any) => ({
          ...s,
          status: String(s.status || '').toUpperCase() === 'ACTIVE' ? 'Active' : 'Inactive',
          dataStatus: String(s.status || '').toUpperCase() === 'ACTIVE' ? 'AVAILABLE' : 'INACTIVE',
          studentsCount: String(s.status || '').toUpperCase() === 'ACTIVE' ? Number(s.studentsCount || 0) : null,
          employeesCount: String(s.status || '').toUpperCase() === 'ACTIVE' ? Number(s.employeesCount || 0) : null,
        }));
        const available = schools.filter((s: any) => s.dataStatus === 'AVAILABLE');
        return json({ status: 'success', data: {
          summary: {
            studentsTotal: available.reduce((n: number, s: any) => n + s.studentsCount, 0),
            employeesTotal: available.reduce((n: number, s: any) => n + s.employeesCount, 0),
            schoolsIncluded: available.length,
            schoolsUnavailable: schools.length - available.length,
          },
          schools,
          generatedAt: new Date().toISOString(),
        }}, 200, corsOrigin);
      }

      if (request.method === 'POST' && path === '/switch-school') {
        const body: any = await request.json();
        const schoolId = String(body.schoolId || '');
        if (!(await canAccessSchool(user, schoolId))) return respond({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        await pool.query('UPDATE sessions SET active_school_id=$1 WHERE id=$2', [schoolId, user.session_id]);
        return json({ status: 'success', activeSchoolId: schoolId }, 200, corsOrigin);
      }

      if (request.method === 'POST' && path === '/users/manage') {
        if (!['SystemAdmin','SchoolAdmin','Admin'].includes(user.role)) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const body: any = await request.json();
        const action=String(body.action||''); const data: any=body.data||{};
        const project = async (row: any) => {
          const access=await pool.query('SELECT school_id FROM user_school_access WHERE user_id=$1 ORDER BY school_id',[row.id]);
          return {id:row.id,email:row.email,username:row.username,fullName:row.full_name,role:row.role,accessScope:row.access_scope,schoolId:row.school_id||'',employeeId:row.employee_id||undefined,studentId:row.student_id||undefined,status:row.status,allowedSchoolIds: row.role === 'SystemAdmin' && row.access_scope === 'GLOBAL' ? (await pool.query("SELECT id FROM schools WHERE status='ACTIVE' ORDER BY name")).rows.map((x:any)=>x.id) : access.rows.map((x:any)=>x.school_id),createdAt:row.created_at,updatedAt:row.updated_at,lastLogin:row.last_login_at};
        };
        if(action==='adminGetUsers'){
          const rows=user.access_scope==='GLOBAL'
            ? await pool.query('SELECT * FROM users ORDER BY full_name')
            : await pool.query(
                `SELECT u.* FROM users u
                 WHERE u.id=$1
                    OR (
                      u.role <> 'SystemAdmin'
                      AND u.school_id IS NOT NULL
                      AND EXISTS (
                        SELECT 1 FROM user_school_access usa
                        WHERE usa.user_id=$1 AND usa.school_id=u.school_id
                      )
                    )
                 ORDER BY u.full_name`,
                [user.user_id]
              );
          const userIds=rows.rows.map((row:any)=>String(row.id));
          const accessRows=userIds.length
            ? await pool.query('SELECT user_id,school_id FROM user_school_access WHERE user_id = ANY($1::text[]) ORDER BY user_id,school_id',[userIds])
            : {rows:[]};
          const accessByUser=new Map<string,string[]>();
          for(const access of accessRows.rows){const key=String(access.user_id);const list=accessByUser.get(key)||[];list.push(String(access.school_id));accessByUser.set(key,list);}
          const out=rows.rows.map((row:any)=>({id:row.id,email:row.email,username:row.username,fullName:row.full_name,role:row.role,accessScope:row.access_scope,schoolId:row.school_id||'',employeeId:row.employee_id||undefined,studentId:row.student_id||undefined,status:row.status,allowedSchoolIds:accessByUser.get(String(row.id))||[],createdAt:row.created_at,updatedAt:row.updated_at,lastLogin:row.last_login_at}));
          return json({status:'success',data:out},200,corsOrigin);
        }
        if(action==='activateStudentAccount'){
          const studentId=String(data.studentId||'').trim();
          const schoolId=String(data.schoolId||'').trim().toUpperCase();
          const password=String(data.password||'');
          if(!studentId||!schoolId||password.length<8)return respond({status: 'error',code:'INVALID_STUDENT_ACCOUNT'},400,corsOrigin);
          if(!(await canAccessSchool(user,schoolId)))return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
          const studentResult=await pool.query('SELECT id,student_code,full_name FROM students WHERE school_id=$1 AND id=$2 LIMIT 1',[schoolId,studentId]);
          if(!studentResult.rowCount)return respond({status: 'error',code:'STUDENT_NOT_FOUND'},404,corsOrigin);
          const student=studentResult.rows[0];
          if(!String(student.student_code||'').trim())return respond({status: 'error',code:'STUDENT_CODE_REQUIRED'},409,corsOrigin);
          const bound=await pool.query('SELECT id FROM users WHERE school_id=$1 AND student_id=$2 LIMIT 1',[schoolId,studentId]);
          if(bound.rowCount)return respond({status: 'error',code:'STUDENT_ACCOUNT_EXISTS'},409,corsOrigin);
          const id='STU-'+crypto.randomBytes(8).toString('hex').toUpperCase();
          const salt=null; const iterations=null; const hash=scryptPasswordHash(password);
          const syntheticEmail=`${id.toLowerCase()}@student.local`;
          const created=await pool.query(
            `INSERT INTO users(id,email,username,full_name,role,access_scope,school_id,student_id,password_hash,password_salt,password_iterations,status,is_active)
             VALUES($1,$2,$3,$4,'Student','SELF',$5,$6,$7,$8,$9,'Active',true) RETURNING *`,
            [id,syntheticEmail,String(student.student_code).trim().toLowerCase(),student.full_name,schoolId,studentId,hash,salt,iterations]
          );
          return json({status:'success',message:'تم تفعيل حساب الطالب.',user:await project(created.rows[0])},201,corsOrigin);
        }
        const targetId=String(data.id||data.userId||'').trim();
        if(targetId){
          const targetScope=await pool.query('SELECT id,school_id,role FROM users WHERE id=$1 LIMIT 1',[targetId]);
          if(!targetScope.rowCount)return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin);
          if(targetScope.rows[0].role==='SystemAdmin' && user.role!=='SystemAdmin')return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
          const targetSchoolId=String(targetScope.rows[0].school_id||'').trim();
          if(!targetSchoolId && targetId!==user.user_id && user.role!=='SystemAdmin')return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
          if(targetSchoolId && !(await canAccessSchool(user,targetSchoolId)))return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        }
        if(action==='deleteUser'){
          if(!targetId)return respond({status: 'error',code:'TARGET_REQUIRED'},400,corsOrigin);
          if(targetId===user.user_id)return respond({status: 'error',code:'SELF_DELETE_DENIED'},409,corsOrigin);
          const client=await pool.connect();
          try {
            await client.query('BEGIN');
            const target=await client.query('SELECT role FROM users WHERE id=$1 FOR UPDATE',[targetId]);
            if(!target.rowCount){ await client.query('ROLLBACK'); return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin); }
            if(target.rows[0].role==='SystemAdmin'){
              await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
              const admins=await client.query("SELECT count(*)::int n FROM users WHERE role='SystemAdmin' AND is_active=true AND status='Active'");
              if(Number(admins.rows[0].n)<=1){ await client.query('ROLLBACK'); return respond({status: 'error',code:'LAST_SYSTEM_ADMIN_PROTECTED'},409,corsOrigin); }
            }
            await client.query('DELETE FROM users WHERE id=$1',[targetId]);
            await client.query('COMMIT');
            return json({status:'success',message:'تم حذف الحساب.'},200,corsOrigin);
          } catch(error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        }
        if(action==='resetUserPassword'){
          const password=String(data.newPassword||'');
          if(password.length<8)return respond({status: 'error',code:'PASSWORD_TOO_SHORT'},400,corsOrigin);
          const salt=null; const iterations=null;
          const hash=scryptPasswordHash(password);
          const client=await pool.connect();
          try {
            await client.query('BEGIN');
            const u=await client.query('UPDATE users SET password_hash=$2,password_salt=$3,password_iterations=$4,updated_at=now() WHERE id=$1 RETURNING id',[targetId,hash,salt,iterations]);
            if(!u.rowCount){ await client.query('ROLLBACK'); return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin); }
            await client.query("UPDATE sessions SET status='REVOKED',revoked_at=now() WHERE user_id=$1 AND status='ACTIVE'",[targetId]);
            await client.query('COMMIT');
            return json({status:'success',message:'تم تحديث كلمة المرور وإلغاء الجلسات السابقة.'},200,corsOrigin);
          } catch(error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        }
        if(action==='toggleUserStatus'){
          if(targetId===user.user_id && String(data.newStatus)!=='Active')return respond({status: 'error',code:'SELF_DISABLE_DENIED'},409,corsOrigin);
          const status=['Active','Inactive','Suspended'].includes(String(data.newStatus))?String(data.newStatus):'Inactive';
          const client=await pool.connect();
          let updatedUser:any;
          try {
            await client.query('BEGIN');
            const u=await client.query('UPDATE users SET status=$2,is_active=$3,updated_at=now() WHERE id=$1 RETURNING *',[targetId,status,status==='Active']);
            if(!u.rowCount){ await client.query('ROLLBACK'); return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin); }
            updatedUser=u.rows[0];
            if(status!=='Active')await client.query("UPDATE sessions SET status='REVOKED',revoked_at=now() WHERE user_id=$1 AND status='ACTIVE'",[targetId]);
            await client.query('COMMIT');
          } catch(error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
          return json({status:'success',message:'تم تحديث حالة الحساب.',user:await project(updatedUser)},200,corsOrigin);
        }
        if(action==='revokeUserSessions'){
          await pool.query("UPDATE sessions SET status='REVOKED',revoked_at=now() WHERE user_id=$1 AND status='ACTIVE'",[targetId]);
          return json({status:'success',message:'تم إلغاء جلسات المستخدم.'},200,corsOrigin);
        }
        if(action!=='saveUser')return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
        const email=String(data.email||'').trim().toLowerCase(); const username=String(data.username||'').trim().toLowerCase();
        const role=String(data.role||'').trim(); const fullName=String(data.fullName||'').trim();
        const assignableRoles=new Set(['SystemAdmin','SchoolAdmin','SchoolDirector','StudentAffairs','TeacherAffairs','QualityOfficer','TrainingOfficer','SocialSpecialist','Teacher','AdministrativeEmployee','Admin']);
        if(role==='Student')return respond({status: 'error',code:'STUDENT_ACCOUNT_REQUIRES_ACTIVATION'},400,corsOrigin);
        if(role && !assignableRoles.has(role))return respond({status: 'error',code:'INVALID_ROLE'},400,corsOrigin);
        if(role==='SystemAdmin' && user.role!=='SystemAdmin')return respond({status: 'error',code:'ROLE_ESCALATION_DENIED'},403,corsOrigin);
        const allowed: string[]=Array.isArray(data.allowedSchoolIds)?[...new Set<string>(data.allowedSchoolIds.map((x:any)=>String(x||'').trim().toUpperCase()).filter(Boolean))]:[];
        const requestedSchoolId=String(data.schoolId||'').trim().toUpperCase();
        if(requestedSchoolId && !(await canAccessSchool(user,requestedSchoolId)))return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        for(const sid of allowed) if(!(await canAccessSchool(user,sid)))return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        if(!targetId){
          if(user.role!=='SystemAdmin' && !requestedSchoolId)return respond({status: 'error',code:'SCHOOL_REQUIRED'},400,corsOrigin);
          const password=String(data.password||''); if(!email||!username||!fullName||password.length<8)return respond({status: 'error',code:'INVALID_USER'},400,corsOrigin);
          const id='USR-'+crypto.randomBytes(8).toString('hex').toUpperCase(); const salt=null; const iterations=null; const hash=scryptPasswordHash(password);
          const scope=role==='SystemAdmin'?'GLOBAL':'SCHOOL'; const schoolId=scope==='GLOBAL'?null:String(data.schoolId||'').trim().toUpperCase()||null;
          const s=await pool.query('INSERT INTO users(id,email,username,full_name,role,access_scope,school_id,employee_id,password_hash,password_salt,password_iterations,status,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,NULLIF($8,\'\'),$9,$10,$11,\'Active\',true) RETURNING *',[id,email,username,fullName,role,scope,schoolId,String(data.employeeId||''),hash,salt,iterations]);
          for(const sid of allowed.length?allowed:(schoolId?[schoolId]:[])) await pool.query('INSERT INTO user_school_access(user_id,school_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM schools WHERE id=$2) ON CONFLICT DO NOTHING',[id,sid]);
          return json({status:'success',message:'تم إنشاء الحساب.',user:await project(s.rows[0])},201,corsOrigin);
        }
        const existing=await pool.query('SELECT * FROM users WHERE id=$1',[targetId]); if(!existing.rowCount)return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin);
        const old=existing.rows[0]; if(old.role==='Student')return respond({status: 'error',code:'STUDENT_ACCOUNT_MANAGED_SEPARATELY'},400,corsOrigin); const nextRole=role||old.role; const scope=nextRole==='SystemAdmin'?'GLOBAL':'SCHOOL'; const schoolId=scope==='GLOBAL'?null:(data.schoolId===undefined?old.school_id:String(data.schoolId||'').trim().toUpperCase()||null);
        if(user.role!=='SystemAdmin' && !schoolId)return respond({status: 'error',code:'SCHOOL_REQUIRED'},400,corsOrigin);
        const u=await pool.query('UPDATE users SET email=COALESCE(NULLIF($2,\'\'),email),username=COALESCE(NULLIF($3,\'\'),username),full_name=COALESCE(NULLIF($4,\'\'),full_name),role=$5,access_scope=$6,school_id=$7,employee_id=CASE WHEN $8=\'\' THEN employee_id ELSE $8 END,updated_at=now() WHERE id=$1 RETURNING *',[targetId,email,username,fullName,nextRole,scope,schoolId,String(data.employeeId||'')]);
        if(data.allowedSchoolIds!==undefined){await pool.query('DELETE FROM user_school_access WHERE user_id=$1',[targetId]);for(const sid of allowed.length?allowed:(schoolId?[schoolId]:[]))await pool.query('INSERT INTO user_school_access(user_id,school_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM schools WHERE id=$2) ON CONFLICT DO NOTHING',[targetId,sid]);}
        return json({status:'success',message:'تم تحديث الحساب.',user:await project(u.rows[0])},200,corsOrigin);
      }

      if (request.method === 'POST' && path === '/settings/manage') {
        const body: any=await request.json(); const action=String(body.action||''); const data:any=body.data||{};
        const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();
        if(!(await canAccessSchool(user,schoolId)))return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        if(action==='getSettings'){
          const row=await pool.query("SELECT details FROM audit_logs WHERE school_id=$1 AND entity='SYSTEM_SETTINGS' AND action='SNAPSHOT' ORDER BY created_at DESC,id DESC LIMIT 1",[schoolId]);
          if(!row.rowCount)return json({status:'success',data:null},200,corsOrigin);
          try{return json({status:'success',data:JSON.parse(String(row.rows[0].details||'{}'))},200,corsOrigin);}catch{return json({status:'success',data:null},200,corsOrigin);}
        }
        if(action!=='saveSettings')return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
        const allowedRoles=new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector']);
        if(!allowedRoles.has(String(user.role||'')))return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const safe={...data};
        delete safe.googleAppsScriptUrl; delete safe.sessionToken; delete safe.password; delete safe.passwordHash; delete safe.databaseUrl;
        await pool.query("INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,'SNAPSHOT','SYSTEM_SETTINGS','CURRENT',$5)",[schoolId,user.user_id,user.email,user.role,JSON.stringify(safe)]);
        return json({status:'success',message:'تم حفظ إعدادات المدرسة في PostgreSQL.',data:safe},200,corsOrigin);
      }

      if (request.method === 'POST' && path === '/academic-years/manage') {
        const body: any=await request.json(); const action=String(body.action||''); const data:any=body.data||{};
        const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();
        if(!(await canAccessSchool(user,schoolId)))return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const allowedRoles=new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector']);
        if(!allowedRoles.has(String(user.role||'')))return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const toClient=(r:any)=>({...(r.payload||{}),id:(r.payload&&r.payload.id)||String(r.id).replace(schoolId+'::',''),schoolId:r.school_id,name:r.name,startDate:r.start_date?String(r.start_date).slice(0,10):undefined,endDate:r.end_date?String(r.end_date).slice(0,10):undefined,status:r.is_active?'ACTIVE':((r.payload&&r.payload.status)||'CLOSED'),isDefault:Boolean(r.is_active)});
        if(action==='getAcademicYears'){
          const rows=await pool.query('SELECT * FROM academic_years WHERE school_id=$1 ORDER BY start_date DESC NULLS LAST,name DESC',[schoolId]);
          return json({status:'success',data:rows.rows.map(toClient)},200,corsOrigin);
        }
        const clientId=String(data.id||'').trim()||('AY-'+Date.now()); const dbId=schoolId+'::'+clientId;
        if(action==='deleteAcademicYear'){
          const used=await pool.query('SELECT 1 FROM schedule WHERE school_id=$1 AND academic_year_id=$2 LIMIT 1',[schoolId,dbId]);
          if(used.rowCount)return respond({status: 'error',code:'ACADEMIC_YEAR_IN_USE',message:'لا يمكن حذف عام دراسي مرتبط بجدول دراسي.'},409,corsOrigin);
          const d=await pool.query('DELETE FROM academic_years WHERE school_id=$1 AND id=$2 RETURNING id',[schoolId,dbId]);
          return d.rowCount?json({status:'success'},200,corsOrigin):respond({status:'error',code:'NOT_FOUND'},404,corsOrigin);
        }
        if(action!=='saveAcademicYear')return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
        const active=String(data.status||'').toUpperCase()==='ACTIVE'||data.isDefault===true;
        if(active)await pool.query('UPDATE academic_years SET is_active=false,payload=jsonb_set(payload,\'{status}\',\'"CLOSED"\'::jsonb,true) WHERE school_id=$1 AND id<>$2',[schoolId,dbId]);
        const payload=JSON.stringify({...data,id:clientId,status:active?'ACTIVE':String(data.status||'CLOSED'),isDefault:active});
        const saved=await pool.query(
          `INSERT INTO academic_years(id,school_id,name,start_date,end_date,is_active,payload)
           VALUES($1,$2,$3,NULLIF($4,'')::date,NULLIF($5,'')::date,$6,$7::jsonb)
           ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,is_active=EXCLUDED.is_active,payload=EXCLUDED.payload
           WHERE academic_years.school_id=EXCLUDED.school_id RETURNING *`,
          [dbId,schoolId,String(data.name||clientId),String(data.startDate||''),String(data.endDate||''),active,payload]
        );
        if(!saved.rowCount)return respond({status: 'error',code:'ACADEMIC_YEAR_WRITE_REJECTED'},409,corsOrigin);
        await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'UPSERT','ACADEMIC_YEAR',clientId,'Saved through Neon API']);
        return json({status:'success',data:toClient(saved.rows[0])},200,corsOrigin);
      }

      if (request.method === 'POST' && path === '/schedule/manage') {
        const body: any = await request.json();
        const action = String(body.action || '');
        const data: any = body.data || {};
        const schoolId = String(body.schoolId || user.active_school_id || user.school_id || '').trim();
        if (!(await canAccessSchool(user, schoolId))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const allowedRoles = new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','Supervisor','TeacherAffairs']);
        if (!allowedRoles.has(String(user.role || ''))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        if (action === 'getSchedule') {
          const rows=await pool.query('SELECT * FROM schedule WHERE school_id=$1 ORDER BY weekday,period_no,id',[schoolId]);
          return json({status:'success',data:rows.rows.map((r:any)=>({...(r.payload||{}),id:r.id,schoolId:r.school_id,academicYearId:r.academic_year_id,teacherId:r.teacher_id,grade:r.grade,classroom:r.classroom,weekday:r.weekday,periodNo:r.period_no}))},200,corsOrigin);
        }
        const id=String(data.id||'').trim() || ('SCH-'+schoolId+'-'+crypto.randomBytes(8).toString('hex').toUpperCase());
        if (action === 'deleteScheduleEntry') {
          const linked=await pool.query("SELECT 1 FROM curriculum_distributions WHERE school_id=$1 AND schedule_item_id=$2 AND status<>'Cancelled' LIMIT 1",[schoolId,id]);
          if(linked.rowCount)return respond({status: 'error',code:'SCHEDULE_LINKED_TO_CURRICULUM',message:'لا يمكن حذف الحصة لأنها مرتبطة بتوزيع منهج نشط. ألغِ توزيع المنهج المرتبط أولاً.'},409,corsOrigin);
          const d=await pool.query('DELETE FROM schedule WHERE school_id=$1 AND id=$2 RETURNING id',[schoolId,id]);
          if(!d.rowCount)return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'DELETE','SCHEDULE',id,'Deleted unlinked schedule slot through Neon API']);
          return json({status:'success',message:'تم حذف الحصة غير المرتبطة بخطة منهج'},200,corsOrigin);
        }
        if (action !== 'saveScheduleEntry') return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
        const collision=await pool.query('SELECT school_id FROM schedule WHERE id=$1 AND school_id<>$2',[id,schoolId]);
        if(collision.rowCount)return respond({status: 'error',code:'CROSS_SCHOOL_ID_COLLISION'},409,corsOrigin);
        const weekday=String(data.weekday||data.dayOfWeek||data.dayName||data.day||'').trim();
        const periodNo=Number(data.periodNo||data.periodNumber||data.period||0);
        const teacherId=String(data.teacherId||'').trim();
        const classroom=String(data.classroomId||data.classroom||'').trim();
        const subject=String(data.subjectId||data.subject||'').trim();
        if(!weekday||!Number.isInteger(periodNo)||periodNo<=0||!teacherId||!classroom||!subject){
          return respond({status: 'error',code:'INVALID_SCHEDULE_SLOT',message:'بيانات الحصة غير مكتملة: اليوم والحصة والمعلم والفصل والمادة مطلوبة.'},400,corsOrigin);
        }
        const client=await pool.connect();
        let saved:any;
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[schoolId+'|'+weekday+'|'+periodNo]);
          const collision=await client.query('SELECT school_id FROM schedule WHERE id=$1 AND school_id<>$2',[id,schoolId]);
          if(collision.rowCount){await client.query('ROLLBACK');return respond({status: 'error',code:'CROSS_SCHOOL_ID_COLLISION'},409,corsOrigin);}
          const teacherOk=await client.query('SELECT 1 FROM employees WHERE school_id=$1 AND id=$2 AND COALESCE(status,\'Active\')=\'Active\' LIMIT 1',[schoolId,teacherId]);
          if(!teacherOk.rowCount){await client.query('ROLLBACK');return respond({status: 'error',code:'INVALID_TEACHER_ASSIGNMENT',message:'المعلم المحدد غير موجود أو غير نشط في هذه المدرسة.'},409,corsOrigin);}
          const slotConflicts=await client.query(
            `SELECT id,teacher_id,classroom,payload FROM schedule
             WHERE school_id=$1 AND id<>$2 AND weekday=$3 AND period_no=$4
               AND (teacher_id=$5 OR classroom=$6 OR NULLIF(COALESCE(payload->>'roomId',payload->>'room',payload->>'roomNumber'),'')=NULLIF($7,''))
             LIMIT 1 FOR UPDATE`,
            [schoolId,id,weekday,periodNo,teacherId,String(data.classroom||classroom),String(data.roomId||data.room||data.roomNumber||'')]
          );
          if(slotConflicts.rowCount){await client.query('ROLLBACK');return respond({status: 'error',code:'SCHEDULE_CONFLICT',message:'يوجد تعارض في نفس اليوم والحصة للمعلم أو الفصل أو القاعة.'},409,corsOrigin);}
          const payload=JSON.stringify({...data,id,schoolId,weekday,periodNo});
          saved=await client.query(
            `INSERT INTO schedule(id,school_id,academic_year_id,teacher_id,grade,classroom,weekday,period_no,payload)
             VALUES($1,$2,NULLIF($3,''),NULLIF($4,''),$5,$6,$7,$8,$9::jsonb)
             ON CONFLICT(id) DO UPDATE SET academic_year_id=EXCLUDED.academic_year_id,teacher_id=EXCLUDED.teacher_id,grade=EXCLUDED.grade,classroom=EXCLUDED.classroom,weekday=EXCLUDED.weekday,period_no=EXCLUDED.period_no,payload=EXCLUDED.payload,updated_at=now()
             WHERE schedule.school_id=EXCLUDED.school_id RETURNING *`,
            [id,schoolId,data.academicYearId ? schoolId+'::'+String(data.academicYearId) : '',teacherId,String(data.grade||''),String(data.classroom||classroom),weekday,periodNo,payload]
          );
          if(!saved.rowCount){await client.query('ROLLBACK');return respond({status: 'error',code:'SCHEDULE_WRITE_REJECTED'},409,corsOrigin);}
          await client.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'UPSERT','SCHEDULE',id,'Saved through Neon API']);
          await client.query('COMMIT');
        } catch(error:any) {
          await client.query('ROLLBACK');
          if(String(error?.code||'')==='23505') return respond({status: 'error',code:'SCHEDULE_CONFLICT',message:'يوجد تعارض في نفس اليوم والحصة.'},409,corsOrigin);
          throw error;
        } finally { client.release(); }
        const r:any=saved.rows[0];
        return json({status:'success',message:'تم حفظ الحصة في الجدول بنجاح',data:{...(r.payload||{}),id:r.id,schoolId:r.school_id}},200,corsOrigin);
      }


      if (request.method === 'POST' && path === '/curriculum/manage') {
        const body:any=await request.json(); const action=String(body.action||''); const data:any=body.data||{};
        const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();
        if(!(await canAccessSchool(user,schoolId)))return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const adminRoles=new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','TeacherAffairs']);
        const isAdmin=adminRoles.has(String(user.role||'')); const isTeacher=String(user.role||'')==='Teacher';
        if(!isAdmin&&!isTeacher)return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const actorTeacherId=String(user.employee_id||user.user_id||'').trim();
        const mapPlan=(r:any,items:any[]=[])=>({id:r.id,schoolId:r.school_id,academicYear:r.academic_year,term:r.term,grade:r.grade,gradeId:r.grade_id,classroom:(r.file_meta&&r.file_meta.classroom)||'',subject:r.subject,subjectId:r.subject_id,version:r.version,status:r.status,uploadedBy:r.uploaded_by,uploadedByName:r.uploaded_by_name,uploadedAt:r.uploaded_at,updatedAt:r.updated_at,fileMeta:r.file_meta,items});
        if(action==='getPlans'){
          const ps=await pool.query(
            isTeacher
              ? `SELECT p.* FROM curriculum_plans p
                   WHERE p.school_id=$1 AND (
                     p.uploaded_by=$2 OR EXISTS (
                       SELECT 1 FROM schedule s
                       WHERE s.school_id=p.school_id AND s.teacher_id=$2
                         AND lower(trim(s.grade))=lower(trim(p.grade))
                         AND lower(trim(s.classroom))=lower(trim(COALESCE(p.file_meta->>'classroom','')))
                         AND lower(trim(COALESCE(s.payload->>'subject','')))=lower(trim(p.subject))
                     )
                   ) ORDER BY p.updated_at DESC`
              : 'SELECT * FROM curriculum_plans WHERE school_id=$1 ORDER BY updated_at DESC',
            isTeacher?[schoolId,actorTeacherId]:[schoolId]
          );
          const ids=ps.rows.map((r:any)=>r.id); let items:any[]=[];
          if(ids.length){const iq=await pool.query('SELECT * FROM curriculum_plan_items WHERE plan_id=ANY($1::text[]) ORDER BY week,sort_order,id',[ids]);items=iq.rows;}
          return json({status:'success',data:ps.rows.map((p:any)=>mapPlan(p,items.filter((i:any)=>i.plan_id===p.id).map((i:any)=>({id:i.id,week:i.week,unit:i.unit,lessonTitle:i.lesson_title,objectives:i.objectives||'',resources:i.resources||'',assessment:i.assessment||'',estimatedPeriods:i.estimated_periods,notes:i.notes||'',order:i.sort_order}))))},200,corsOrigin);
        }

        if(action==='getDistributions'){
          const q=await pool.query(
            isTeacher
              ? `SELECT d.*, i.week AS curriculum_week FROM curriculum_distributions d LEFT JOIN curriculum_plan_items i ON i.id=d.plan_item_id AND i.plan_id=d.plan_id WHERE d.school_id=$1 AND d.teacher_id=$2 ORDER BY d.day_of_week,d.period_number,d.id`
              : `SELECT d.*, i.week AS curriculum_week FROM curriculum_distributions d LEFT JOIN curriculum_plan_items i ON i.id=d.plan_item_id AND i.plan_id=d.plan_id WHERE d.school_id=$1 ORDER BY d.day_of_week,d.period_number,d.id`,
            isTeacher?[schoolId,actorTeacherId]:[schoolId]
          );
          return json({status:'success',data:q.rows.map((r:any)=>({id:r.id,schoolId:r.school_id,planId:r.plan_id,planItemId:r.plan_item_id,scheduleItemId:r.schedule_item_id,teacherId:r.teacher_id,teacherName:r.teacher_name,grade:r.grade,classroom:r.classroom,subject:r.subject,dayOfWeek:r.day_of_week,periodNumber:r.period_number,week:Number(r.curriculum_week||0)||undefined,targetDate:r.target_date?String(r.target_date).slice(0,10):undefined,status:r.status,notes:r.notes,createdAt:r.created_at,updatedAt:r.updated_at}))},200,corsOrigin);
        }
        if(action==='saveDistribution'){
          const planId=String(data.planId||''),planItemId=String(data.planItemId||''),scheduleItemId=String(data.scheduleItemId||''),teacherId=String(data.teacherId||'');
          if(!planId||!planItemId||!teacherId)return respond({status: 'error',code:'INVALID_DISTRIBUTION'},400,corsOrigin);
          if(isTeacher&&teacherId!==actorTeacherId)return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
          const pq=await pool.query('SELECT status,grade,subject,file_meta FROM curriculum_plans WHERE id=$1 AND school_id=$2',[planId,schoolId]);
          if(!pq.rowCount)return respond({status: 'error',code:'PLAN_NOT_FOUND'},404,corsOrigin);
          const isCancellation=String(data.status||'Planned')==='Cancelled';
          if(!isCancellation&&pq.rows[0].status!=='Approved')return respond({status: 'error',code:'PLAN_NOT_APPROVED'},409,corsOrigin);
          const iq=await pool.query('SELECT week FROM curriculum_plan_items WHERE id=$1 AND plan_id=$2',[planItemId,planId]);if(!iq.rowCount)return respond({status: 'error',code:'PLAN_ITEM_NOT_FOUND'},404,corsOrigin);
          const curriculumWeek=Number(iq.rows[0].week||0);
          if(scheduleItemId&&!isCancellation){const sq=await pool.query('SELECT teacher_id,grade,classroom,weekday,period_no,payload FROM schedule WHERE id=$1 AND school_id=$2',[scheduleItemId,schoolId]);if(!sq.rowCount)return respond({status: 'error',code:'SCHEDULE_NOT_FOUND'},404,corsOrigin);const s=sq.rows[0];if(isTeacher&&s.teacher_id!==actorTeacherId)return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);if(String(s.teacher_id||'')!==teacherId)return respond({status: 'error',code:'SCHEDULE_TEACHER_MISMATCH',message:'المعلم المحدد لا يطابق المعلم المسند لهذه الحصة في الجدول.'},409,corsOrigin);const planClassroom=String((pq.rows[0].file_meta||{}).classroom||'').trim();const norm=(v:any)=>String(v||'').trim().toLowerCase();if(norm(s.grade)!==norm(pq.rows[0].grade)||norm((s.payload||{}).subject)!==norm(pq.rows[0].subject)||(planClassroom&&norm(s.classroom)!==norm(planClassroom)))return respond({status: 'error',code:'SCHEDULE_PLAN_MISMATCH',message:'الحصة لا تطابق مادة أو صف أو فصل خطة المنهج.'},409,corsOrigin);data.grade=s.grade;data.classroom=s.classroom;data.dayOfWeek=s.weekday;data.periodNumber=s.period_no;data.subject=(s.payload||{}).subject||data.subject;
            const occupied=await pool.query(`SELECT d.id FROM curriculum_distributions d JOIN curriculum_plan_items pi ON pi.id=d.plan_item_id AND pi.plan_id=d.plan_id WHERE d.school_id=$1 AND d.schedule_item_id=$2 AND d.status<>'Cancelled' AND pi.week=$3 AND d.id<>$4 LIMIT 1`,[schoolId,scheduleItemId,curriculumWeek,String(data.id||'')]);
            if(occupied.rowCount)return respond({status: 'error',code:'CURRICULUM_SLOT_OCCUPIED',message:'هذه الحصة مرتبطة بالفعل بموضوع آخر في نفس أسبوع المنهج.'},409,corsOrigin);
          }
          const id=String(data.id||('DIST-'+crypto.randomBytes(8).toString('hex').toUpperCase()));
          const q=await pool.query(`INSERT INTO curriculum_distributions(id,school_id,plan_id,plan_item_id,schedule_item_id,teacher_id,teacher_name,grade,classroom,subject,day_of_week,period_number,target_date,status,notes)
            VALUES($1,$2,$3,$4,NULLIF($5,''),$6,$7,$8,$9,$10,$11,$12,NULLIF($13,'')::date,$14,$15)
            ON CONFLICT(id) DO UPDATE SET schedule_item_id=EXCLUDED.schedule_item_id,teacher_id=EXCLUDED.teacher_id,teacher_name=EXCLUDED.teacher_name,grade=EXCLUDED.grade,classroom=EXCLUDED.classroom,subject=EXCLUDED.subject,day_of_week=EXCLUDED.day_of_week,period_number=EXCLUDED.period_number,status=EXCLUDED.status,target_date=EXCLUDED.target_date,notes=EXCLUDED.notes,updated_at=now()
            WHERE curriculum_distributions.school_id=EXCLUDED.school_id AND curriculum_distributions.teacher_id=EXCLUDED.teacher_id RETURNING *`,
            [id,schoolId,planId,planItemId,scheduleItemId,teacherId,String(data.teacherName||''),String(data.grade||''),String(data.classroom||''),String(data.subject||''),String(data.dayOfWeek||''),Number(data.periodNumber||0),String(data.targetDate||''),String(data.status||'Planned'),String(data.notes||'')]);
          if(!q.rowCount)return respond({status: 'error',code:'WRITE_REJECTED'},409,corsOrigin);await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,isCancellation?'CANCEL_DISTRIBUTION':'UPSERT_DISTRIBUTION','CURRICULUM',id,`Curriculum distribution ${String(data.status||'Planned')}`]);return json({status:'success',data:{id:q.rows[0].id}},200,corsOrigin);
        }
        if(action==='deletePlan'){
          if(!isAdmin)return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
          const id=String(data.id||'').trim();if(!id)return respond({status: 'error',code:'PLAN_ID_REQUIRED'},400,corsOrigin);
          const existing=await pool.query('SELECT id,status FROM curriculum_plans WHERE id=$1 AND school_id=$2',[id,schoolId]);
          if(!existing.rowCount)return respond({status: 'error',code:'PLAN_NOT_FOUND'},404,corsOrigin);
          if(['Submitted','Approved'].includes(String(existing.rows[0].status)))return respond({status: 'error',code:'PLAN_DELETE_LOCKED',message:'لا يمكن حذف خطة مرسلة للمراجعة أو معتمدة.'},409,corsOrigin);
          await pool.query('DELETE FROM curriculum_plans WHERE id=$1 AND school_id=$2',[id,schoolId]);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'DELETE_PLAN','CURRICULUM',id,'Deleted draft/rejected curriculum plan']);
          return json({status:'success'},200,corsOrigin);
        }
        if(action==='savePlan'){
          const status=String(data.status||'Draft'); const classroom=String(data.classroom||'').trim(); if(!classroom)return respond({status: 'error',code:'CLASSROOM_REQUIRED',message:'يجب تحديد الفصل؛ لكل فصل خطة منهج مستقلة.'},400,corsOrigin); if(isTeacher&&!['Draft','Submitted'].includes(status))return respond({status: 'error',code:'FORBIDDEN_STATUS'},403,corsOrigin);
          if(isTeacher){
            const norm=(v:any)=>String(v||'').trim().toLowerCase();
            const assignment=await pool.query(`SELECT 1 FROM schedule WHERE school_id=$1 AND teacher_id=$2 AND lower(trim(grade))=$3 AND lower(trim(classroom))=$4 AND lower(trim(COALESCE(payload->>'subject','')))=$5 LIMIT 1`,[schoolId,actorTeacherId,norm(data.grade),norm(classroom),norm(data.subject)]);
            if(!assignment.rowCount)return respond({status: 'error',code:'TEACHER_ASSIGNMENT_REQUIRED',message:'لا يمكن للمعلم حفظ خطة لمادة أو صف أو فصل غير مسند إليه في الجدول.'},403,corsOrigin);
          }
          const id=String(data.id||('PLAN-'+crypto.randomBytes(8).toString('hex').toUpperCase()));
          const existing=await pool.query('SELECT * FROM curriculum_plans WHERE id=$1',[id]);
          if(existing.rowCount){
            const e=existing.rows[0];
            if(e.school_id!==schoolId||(isTeacher&&e.uploaded_by!==actorTeacherId))return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
            if(e.status==='Approved')return respond({status: 'error',code:'PLAN_LOCKED',message:'الخطة المعتمدة مقفلة ولا يمكن تعديل محتواها مباشرة؛ أنشئ نسخة جديدة للتعديل.'},409,corsOrigin);
            if(isTeacher&&e.status==='Submitted')return respond({status: 'error',code:'PLAN_UNDER_REVIEW',message:'الخطة مرسلة للمراجعة ولا يمكن تعديل محتواها أو حالتها حتى تعتمدها الإدارة أو ترفضها.'},409,corsOrigin);
            if(isAdmin&&status==='Submitted'&&!['Draft','Rejected'].includes(String(e.status)))return respond({status: 'error',code:'INVALID_PLAN_TRANSITION'},409,corsOrigin);
            if(isAdmin&&['Approved','Rejected'].includes(status)&&e.status!=='Submitted')return respond({status: 'error',code:'INVALID_PLAN_TRANSITION',message:'يجب إرسال الخطة للمراجعة قبل اعتمادها أو رفضها.'},409,corsOrigin);
          } else if(['Approved','Rejected'].includes(status)) {
            return respond({status: 'error',code:'INVALID_PLAN_TRANSITION',message:'لا يمكن إنشاء خطة جديدة بحالة اعتماد أو رفض.'},409,corsOrigin);
          }
          if(status==='Approved'){
            const duplicate=await pool.query(`SELECT id FROM curriculum_plans WHERE school_id=$1 AND id<>$2 AND status='Approved' AND academic_year=$3 AND term=$4 AND lower(trim(grade))=lower(trim($5)) AND lower(trim(subject))=lower(trim($6)) AND lower(trim(COALESCE(file_meta->>'classroom','')))=lower(trim($7)) LIMIT 1`,[schoolId,id,String(data.academicYear||existing.rows[0]?.academic_year||'2026-2027'),String(data.term||existing.rows[0]?.term||''),String(data.grade||existing.rows[0]?.grade||''),String(data.subject||existing.rows[0]?.subject||''),classroom]);
            if(duplicate.rowCount)return respond({status: 'error',code:'APPROVED_PLAN_CONFLICT',message:'توجد بالفعل خطة معتمدة لنفس المادة والصف والفصل والفصل الدراسي.'},409,corsOrigin);
          }
          const client=await pool.connect();try{await client.query('BEGIN');
            const q=await client.query(`INSERT INTO curriculum_plans(id,school_id,academic_year,term,grade,grade_id,subject,subject_id,version,status,uploaded_by,uploaded_by_name,file_meta)
              VALUES($1,$2,$3,$4,$5,NULLIF($6,''),$7,NULLIF($8,''),1,$9,$10,$11,$12::jsonb)
              ON CONFLICT(id) DO UPDATE SET term=EXCLUDED.term,grade=EXCLUDED.grade,grade_id=EXCLUDED.grade_id,subject=EXCLUDED.subject,subject_id=EXCLUDED.subject_id,status=EXCLUDED.status,file_meta=EXCLUDED.file_meta,version=curriculum_plans.version+1,updated_at=now()
              WHERE curriculum_plans.school_id=EXCLUDED.school_id RETURNING *`,
              [id,schoolId,String(data.academicYear||'2026-2027'),String(data.term||''),String(data.grade||''),String(data.gradeId||''),String(data.subject||''),String(data.subjectId||''),status,existing.rows[0]?.uploaded_by||actorTeacherId,String(user.full_name||user.email||''),JSON.stringify({...((data.fileMeta&&typeof data.fileMeta==='object')?data.fileMeta:{}),classroom})]);
            if(!q.rowCount)throw new Error('WRITE_REJECTED'); await client.query('DELETE FROM curriculum_plan_items WHERE plan_id=$1',[id]);
            for(const [idx,it] of (Array.isArray(data.items)?data.items:[]).entries()){await client.query('INSERT INTO curriculum_plan_items(id,plan_id,week,unit,lesson_title,objectives,resources,assessment,estimated_periods,notes,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[String(it.id||('ITEM-'+crypto.randomBytes(8).toString('hex').toUpperCase())),id,Number(it.week),String(it.unit||''),String(it.lessonTitle||''),String(it.objectives||''),String(it.resources||''),String(it.assessment||''),Math.max(1,Number(it.estimatedPeriods||1)),String(it.notes||''),Number(it.order||idx)]);
            } await client.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,existing.rowCount?'UPDATE_PLAN':'CREATE_PLAN','CURRICULUM',id,`Curriculum plan status ${status}`]); await client.query('COMMIT'); return json({status:'success',data:mapPlan(q.rows[0],data.items||[])},200,corsOrigin);
          }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
        }
        return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
      }

      if (request.method === 'POST' && path === '/my-requests') {
        const body: any=await request.json(); const action=String(body.action||''); const data:any=body.data||{};
        const employeeId=String(user.employee_id||'').trim();
        if(!employeeId)return respond({status: 'error',code:'EMPLOYEE_CONTEXT_REQUIRED',message:'الحساب غير مربوط بسجل موظف معتمد.'},409,corsOrigin);
        const emp=await pool.query('SELECT * FROM employees WHERE id=$1 AND school_id IN (SELECT school_id FROM user_school_access WHERE user_id=$2 UNION SELECT school_id FROM users WHERE id=$2) LIMIT 1',[employeeId,user.user_id]);
        if(!emp.rowCount)return respond({status: 'error',code:'EMPLOYEE_CONTEXT_INVALID'},403,corsOrigin);
        const e=emp.rows[0]; const schoolId=e.school_id;
        const mapLeave=(r:any)=>({...(r.payload||{}),id:r.id,employeeId:r.employee_id,startDate:r.start_date?String(r.start_date).slice(0,10):'',endDate:r.end_date?String(r.end_date).slice(0,10):'',status:r.status,createdAt:r.created_at});
        const mapPermission=(r:any)=>({...(r.payload||{}),id:r.id,employeeId:r.employee_id,date:r.permission_date?String(r.permission_date).slice(0,10):'',status:r.status,createdAt:r.created_at});
        if(action==='getMyRequests'){
          const [ls,ps]=await Promise.all([
            pool.query('SELECT * FROM leaves WHERE school_id=$1 AND employee_id=$2 ORDER BY created_at DESC',[schoolId,employeeId]),
            pool.query('SELECT * FROM permissions WHERE school_id=$1 AND employee_id=$2 ORDER BY created_at DESC',[schoolId,employeeId])
          ]);
          return json({status:'success',data:{profile:{employeeId,employeeName:e.full_name,department:e.department||'',employeeNumber:e.employee_code||''},leaves:ls.rows.map(mapLeave),permissions:ps.rows.map(mapPermission)}},200,corsOrigin);
        }
        if(action==='createMyLeaveRequest'){
          const startDate=String(data.startDate||'').trim(),endDate=String(data.endDate||'').trim();
          if(!startDate||!endDate||endDate<startDate)return respond({status: 'error',code:'INVALID_DATES'},400,corsOrigin);
          const id='LEV-'+schoolId+'-'+crypto.randomBytes(8).toString('hex').toUpperCase();
          const payload={...data,id,employeeId,employeeName:e.full_name,department:e.department||'',status:'قيد المراجعة',createdBy:user.user_id};
          const q=await pool.query("INSERT INTO leaves(id,school_id,employee_id,start_date,end_date,status,payload) VALUES($1,$2,$3,$4::date,$5::date,'قيد المراجعة',$6::jsonb) RETURNING *",[id,schoolId,employeeId,startDate,endDate,JSON.stringify(payload)]);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'CREATE_SELF','LEAVE',id,'Self-service leave request']);
          return json({status:'success',message:'تم إرسال طلب الإجازة بنجاح.',leave:mapLeave(q.rows[0])},201,corsOrigin);
        }
        if(action==='createMyPermissionRequest'){
          const date=String(data.date||'').trim(); if(!date)return respond({status: 'error',code:'INVALID_DATE'},400,corsOrigin);
          const id='PER-'+schoolId+'-'+crypto.randomBytes(8).toString('hex').toUpperCase();
          const payload={...data,id,employeeId,employeeName:e.full_name,department:e.department||'',status:'قيد المراجعة',createdBy:user.user_id};
          const q=await pool.query("INSERT INTO permissions(id,school_id,employee_id,permission_date,status,payload) VALUES($1,$2,$3,$4::date,'قيد المراجعة',$5::jsonb) RETURNING *",[id,schoolId,employeeId,date,JSON.stringify(payload)]);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'CREATE_SELF','PERMISSION',id,'Self-service permission request']);
          return json({status:'success',message:'تم إرسال طلب الإذن بنجاح.',permission:mapPermission(q.rows[0])},201,corsOrigin);
        }
        return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
      }

      if (request.method === 'POST' && path === '/quality/manage') {
        const body:any=await request.json();
        const action=String(body.action||'');
        const data:any=body.data||{};
        const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();
        if(!(await canAccessSchool(user,schoolId))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const canRead=new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','QualityOfficer','Supervisor']);
        const canWrite=new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','QualityOfficer','Supervisor']);
        const canApprove=new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector']);
        if(!canRead.has(String(user.role||''))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const reportTypes=new Set(['TEACHER_VISIT','DAILY_REPORT','COMPREHENSIVE_EVALUATION']);
        const allowedTypes=new Set([...reportTypes,'CORRECTIVE_ACTION','QUALITY_STANDARD']);
        const recordType=String(data.recordType||body.recordType||'').toUpperCase();
        if(action==='list'){
          const params:any[]=[schoolId]; let sql='SELECT * FROM quality_records WHERE school_id=$1';
          if(recordType){if(!allowedTypes.has(recordType))return respond({status: 'error',code:'INVALID_RECORD_TYPE'},400,corsOrigin);params.push(recordType);sql+=' AND record_type=$2';}
          sql+=' ORDER BY updated_at DESC';
          const q=await pool.query(sql,params);
          return json({status:'success',data:q.rows.map((r:any)=>({...r.payload,id:r.id,schoolId:r.school_id,recordType:r.record_type,status:r.record_type==='CORRECTIVE_ACTION'?(r.payload?.status||'OPEN'):r.status,workflowStatus:r.status,createdAt:r.created_at,updatedAt:r.updated_at,approvedAt:r.approved_at}))},200,corsOrigin);
        }
        if(!canWrite.has(String(user.role||''))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const suppliedId=String(data.id||'').trim();
        if((action==='delete'||action==='approve')&&!suppliedId)return respond({status: 'error',code:'INVALID_ID'},400,corsOrigin);
        const id=suppliedId||('QLT-'+crypto.randomBytes(8).toString('hex').toUpperCase());
        if(action==='delete'){
          const existing=await pool.query('SELECT status,record_type FROM quality_records WHERE school_id=$1 AND id=$2',[schoolId,id]);
          if(!existing.rowCount)return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin);
          if(reportTypes.has(String(existing.rows[0].record_type)) && String(existing.rows[0].status).toUpperCase()!=='DRAFT')return respond({status: 'error',code:'FINALIZED_RECORD_LOCKED'},409,corsOrigin);
          await pool.query('DELETE FROM quality_records WHERE school_id=$1 AND id=$2',[schoolId,id]);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'DELETE','QUALITY',id,JSON.stringify({recordType:existing.rows[0].record_type,status:existing.rows[0].status})]);
          return json({status:'success'},200,corsOrigin);
        }
        if(action==='approve'){
          if(!canApprove.has(String(user.role||'')))return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
          const typeCheck=await pool.query('SELECT record_type FROM quality_records WHERE school_id=$1 AND id=$2',[schoolId,id]);
          if(!typeCheck.rowCount)return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin);
          if(!reportTypes.has(String(typeCheck.rows[0].record_type)))return respond({status: 'error',code:'APPROVAL_NOT_SUPPORTED'},409,corsOrigin);
          const q=await pool.query("UPDATE quality_records SET status='APPROVED',approved_by=$3,approved_at=now(),updated_at=now() WHERE school_id=$1 AND id=$2 AND upper(status)='SUBMITTED' RETURNING *",[schoolId,id,user.user_id]);
          if(!q.rowCount)return respond({status: 'error',code:'INVALID_STATUS_TRANSITION'},409,corsOrigin);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'APPROVE','QUALITY',id,'Approved quality record']);
          return json({status:'success',data:{...q.rows[0].payload,id,status:'APPROVED'}},200,corsOrigin);
        }
        if(action!=='save'||!allowedTypes.has(recordType))return respond({status: 'error',code:'INVALID_ACTION'},400,corsOrigin);
        const existing=await pool.query('SELECT status FROM quality_records WHERE school_id=$1 AND id=$2',[schoolId,id]);
        if(existing.rowCount&&['APPROVED','FINALIZED'].includes(String(existing.rows[0].status).toUpperCase()))return respond({status: 'error',code:'FINALIZED_RECORD_LOCKED'},409,corsOrigin);
        const requestedStatus=String(data.workflowStatus||data.status||'DRAFT').toUpperCase();
        const domainStatus=String(data.status||'').toUpperCase();
        const status=reportTypes.has(recordType)
          ? requestedStatus
          : (recordType==='QUALITY_STANDARD' ? (data.isActive===false?'INACTIVE':'ACTIVE') : 'ACTIVE');
        if(reportTypes.has(recordType)&&!['DRAFT','SUBMITTED','REQUIRES_REVISION'].includes(status))return respond({status: 'error',code:'INVALID_STATUS'},400,corsOrigin);
        if(recordType==='CORRECTIVE_ACTION'&&domainStatus&&!['OPEN','IN_PROGRESS','RESOLVED','CLOSED','OVERDUE'].includes(domainStatus))return respond({status: 'error',code:'INVALID_ACTION_STATUS'},400,corsOrigin);
        const payload=JSON.stringify({...data,id,schoolId,recordType,status:recordType==='CORRECTIVE_ACTION'?(domainStatus||'OPEN'):data.status});
        const q=await pool.query(`INSERT INTO quality_records(id,school_id,record_type,status,payload,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6)
          ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=now()
          WHERE quality_records.school_id=EXCLUDED.school_id RETURNING *`,[id,schoolId,recordType,status,payload,user.user_id]);
        if(!q.rowCount)return respond({status: 'error',code:'QUALITY_WRITE_REJECTED'},409,corsOrigin);
        await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'UPSERT','QUALITY',id,recordType]);
        return json({status:'success',data:{...q.rows[0].payload,id,status:q.rows[0].status}},200,corsOrigin);
      }

      if (request.method === 'POST' && path === '/audit/manage') {
        const body:any=await request.json();
        const action=String(body.action||'');
        const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();
        if(!(await canAccessSchool(user,schoolId))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const role=String(user.role||'');
        if(action==='list') {
          if(!['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','HR','TeacherAffairs'].includes(role)) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
          const limit=Math.min(500,Math.max(1,Number(body.limit)||200));
          const q=await pool.query('SELECT id,school_id,user_id,username,role,action,entity,target_id,details,request_id,created_at FROM audit_logs WHERE school_id=$1 ORDER BY created_at DESC LIMIT $2',[schoolId,limit]);
          return json({status:'success',data:q.rows.map((r:any)=>({id:String(r.id),schoolId:r.school_id,userId:r.user_id,username:r.username,userRole:r.role,action:r.action,entity:r.entity,targetId:r.target_id,details:r.details,requestId:r.request_id,timestamp:new Date(r.created_at).toISOString()}))},200,corsOrigin);
        }
        if(action==='append') {
          const data=body.data||{};
          const auditAction=String(data.action||'').trim();
          if(!auditAction)return respond({status: 'error',code:'ACTION_REQUIRED'},400,corsOrigin);
          const entity=String(data.entity||'SYSTEM').trim().slice(0,100);
          const targetId=data.targetId?String(data.targetId).slice(0,200):null;
          const details=String(data.details||'').slice(0,4000);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email||user.username,user.role,auditAction,entity,targetId,details]);
          return json({status:'success'},201,corsOrigin);
        }
        return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
      }

      if (request.method === 'POST' && path === '/notifications/manage') {
        const body:any=await request.json();
        const action=String(body.action||'');
        const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();
        if(!(await canAccessSchool(user,schoolId))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        if(action==='capability') {
          const q=await pool.query("SELECT to_regclass('public.notifications') AS notifications, to_regclass('public.notification_reads') AS reads");
          return json({status:'success',available:Boolean(q.rows[0]?.notifications&&q.rows[0]?.reads)},200,corsOrigin);
        }
        const userId=String(user.user_id||'');
        const role=String(user.role||'');
        if(action==='list') {
          const q=await pool.query(`SELECT n.*, (nr.user_id IS NOT NULL) AS is_read, nr.read_at
            FROM notifications n
            LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=$2
            WHERE n.school_id=$1
              AND (n.expires_at IS NULL OR n.expires_at>now())
              AND (n.target_user_id IS NULL OR n.target_user_id=$2)
              AND (n.target_role IS NULL OR n.target_role='ALL' OR n.target_role=$3 OR $3 IN ('SystemAdmin','Admin'))
            ORDER BY n.created_at DESC LIMIT 100`,[schoolId,userId,role]);
          const data=q.rows.map((r:any)=>({id:r.id,type:r.type,category:r.category,title:r.title,message:r.message,targetUserId:r.target_user_id||undefined,targetRole:r.target_role||undefined,targetStudentId:r.target_student_id||undefined,relatedEntity:r.related_entity||undefined,relatedEntityId:r.related_entity_id||undefined,priority:r.priority,isRead:Boolean(r.is_read),readAt:r.read_at?new Date(r.read_at).toISOString():undefined,createdAt:new Date(r.created_at).toISOString(),expiresAt:r.expires_at?new Date(r.expires_at).toISOString():undefined,actionUrl:r.action_url||undefined,createdBySystem:Boolean(r.created_by_system),deduplicationKey:r.deduplication_key||undefined}));
          return json({status:'success',data},200,corsOrigin);
        }
        if(action==='read'||action==='read-all') {
          if(action==='read') {
            const id=String(body.id||'').trim();
            const visible=await pool.query(`SELECT 1 FROM notifications WHERE id=$1 AND school_id=$2 AND (target_user_id IS NULL OR target_user_id=$3) AND (target_role IS NULL OR target_role='ALL' OR target_role=$4 OR $4 IN ('SystemAdmin','Admin'))`,[id,schoolId,userId,role]);
            if(!visible.rowCount)return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin);
            await pool.query('INSERT INTO notification_reads(notification_id,user_id) VALUES($1,$2) ON CONFLICT(notification_id,user_id) DO UPDATE SET read_at=now()',[id,userId]);
          } else {
            await pool.query(`INSERT INTO notification_reads(notification_id,user_id)
              SELECT id,$2 FROM notifications WHERE school_id=$1 AND (target_user_id IS NULL OR target_user_id=$2) AND (target_role IS NULL OR target_role='ALL' OR target_role=$3 OR $3 IN ('SystemAdmin','Admin'))
              ON CONFLICT(notification_id,user_id) DO UPDATE SET read_at=now()`,[schoolId,userId,role]);
          }
          return json({status:'success'},200,corsOrigin);
        }
        if(action==='delete') {
          const id=String(body.id||'').trim();
          const canDelete=['SystemAdmin','Admin','SchoolAdmin','SchoolDirector'].includes(role);
          if(!canDelete)return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
          const q=await pool.query('DELETE FROM notifications WHERE id=$1 AND school_id=$2 RETURNING id',[id,schoolId]);
          if(!q.rowCount)return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'DELETE','NOTIFICATION',id,'']);
          return json({status:'success'},200,corsOrigin);
        }
        return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
      }

      if (request.method === 'POST' && path === '/master-data/manage') {
        const body:any=await request.json();
        const action=String(body.action||'');
        const data:any=body.data||{};
        const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();
        if(!(await canAccessSchool(user,schoolId))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const canManage=new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector']);
        const mapItem=(row:any)=>({...row.payload,id:row.id,category:row.category,typeKey:row.type_key,code:row.code,nameAr:row.name_ar,nameEn:row.name_en||'',description:row.description||'',parentId:row.parent_id||undefined,sortOrder:Number(row.sort_order||0),isActive:Boolean(row.is_active),isSystemProtected:Boolean(row.is_system_protected),effectiveFrom:row.effective_from?String(row.effective_from).slice(0,10):undefined,effectiveTo:row.effective_to?String(row.effective_to).slice(0,10):undefined,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()});
        if(action==='capability') {
          const q=await pool.query("SELECT to_regclass('public.master_data_items') AS table_name");
          return json({status:'success',available:Boolean(q.rows[0]?.table_name)},200,corsOrigin);
        }
        if(action==='list') {
          const q=await pool.query('SELECT * FROM master_data_items WHERE school_id=$1 ORDER BY category,type_key,sort_order,name_ar',[schoolId]);
          return json({status:'success',data:q.rows.map(mapItem)},200,corsOrigin);
        }
        if(!canManage.has(String(user.role||''))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        if(action==='save') {
          const id=String(data.id||'').trim()||'MD-'+crypto.randomBytes(8).toString('hex').toUpperCase();
          const category=String(data.category||'').trim(),typeKey=String(data.typeKey||'').trim(),code=String(data.code||'').trim().toUpperCase(),nameAr=String(data.nameAr||'').trim();
          if(!category||!typeKey||!code||!nameAr)return respond({status: 'error',code:'MISSING_FIELDS'},400,corsOrigin);
          const payload=JSON.stringify(data.metaData===undefined?{}:{metaData:data.metaData});
          const duplicate=await pool.query('SELECT id FROM master_data_items WHERE school_id=$1 AND category=$2 AND type_key=$3 AND code=$4 AND id<>$5 LIMIT 1',[schoolId,category,typeKey,code,id]);
          if(duplicate.rowCount)return respond({status:'error',code:'MASTER_DATA_CODE_EXISTS',message:'يوجد بالفعل عنصر بنفس الكود داخل نفس النوع.'},409,corsOrigin);
          let q;
          try {
            q=await pool.query(`INSERT INTO master_data_items(id,school_id,category,type_key,code,name_ar,name_en,description,parent_id,sort_order,is_active,is_system_protected,payload,effective_from,effective_to)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,NULLIF($14,'')::date,NULLIF($15,'')::date)
              ON CONFLICT(id) DO UPDATE SET category=EXCLUDED.category,type_key=EXCLUDED.type_key,code=EXCLUDED.code,name_ar=EXCLUDED.name_ar,name_en=EXCLUDED.name_en,description=EXCLUDED.description,parent_id=EXCLUDED.parent_id,sort_order=EXCLUDED.sort_order,is_active=EXCLUDED.is_active,is_system_protected=EXCLUDED.is_system_protected,payload=EXCLUDED.payload,effective_from=EXCLUDED.effective_from,effective_to=EXCLUDED.effective_to,updated_at=now()
              WHERE master_data_items.school_id=EXCLUDED.school_id RETURNING *`,[id,schoolId,category,typeKey,code,nameAr,String(data.nameEn||''),String(data.description||''),data.parentId||null,Number(data.sortOrder||0),data.isActive!==false,Boolean(data.isSystemProtected),payload,String(data.effectiveFrom||''),String(data.effectiveTo||'')]);
          } catch(error:any) {
            if(String(error?.code||'')==='23505')return respond({status:'error',code:'MASTER_DATA_CODE_EXISTS',message:'يوجد بالفعل عنصر بنفس الكود داخل نفس النوع.'},409,corsOrigin);
            throw error;
          }
          if(!q.rowCount)return respond({status: 'error',code:'MASTER_DATA_WRITE_REJECTED'},409,corsOrigin);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'UPSERT','MASTER_DATA',id,`${category}/${typeKey}/${code}`]);
          return json({status:'success',data:mapItem(q.rows[0])},200,corsOrigin);
        }
        if(action==='toggle') {
          const id=String(data.id||'').trim();
          const q=await pool.query('UPDATE master_data_items SET is_active=NOT is_active,updated_at=now() WHERE school_id=$1 AND id=$2 RETURNING *',[schoolId,id]);
          if(!q.rowCount)return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'TOGGLE','MASTER_DATA',id,String(q.rows[0].is_active)]);
          return json({status:'success',data:mapItem(q.rows[0])},200,corsOrigin);
        }
        return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
      }

      if (request.method === 'POST' && path === '/attendance-month-closing') {
        const body:any=await request.json();
        const action=String(body.action||'');
        const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();
        if(!(await canAccessSchool(user,schoolId))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const allowedRoles=new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','TeacherAffairs','HR']);
        if(!allowedRoles.has(String(user.role||''))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        const month=Number(body.month), year=Number(body.year);
        if(!Number.isInteger(month)||month<1||month>12||!Number.isInteger(year)||year<2000||year>2200) return respond({status: 'error',code:'INVALID_PERIOD'},400,corsOrigin);
        const mapClosing=(row:any)=>row?({...row.payload,id:`CLOSE-${row.year}-${String(row.month).padStart(2,'0')}`,schoolId:row.school_id,month:Number(row.month),year:Number(row.year),status:row.status,closedAt:row.closed_at?new Date(row.closed_at).toISOString():undefined}):undefined;
        if(action==='capability') {
          const q=await pool.query("SELECT to_regclass('public.attendance_month_closings') AS table_name");
          return json({status:'success',available:Boolean(q.rows[0]?.table_name)},200,corsOrigin);
        }
        if(action==='get') {
          const q=await pool.query('SELECT * FROM attendance_month_closings WHERE school_id=$1 AND year=$2 AND month=$3 LIMIT 1',[schoolId,year,month]);
          return json({status:'success',data:mapClosing(q.rows[0])||null},200,corsOrigin);
        }
        if(action==='close') {
          const from=`${year}-${String(month).padStart(2,'0')}-01`;
          const [employees,summary]=await Promise.all([
            pool.query("SELECT count(*)::int total FROM employees WHERE school_id=$1 AND status='Active'",[schoolId]),
            pool.query(`SELECT count(DISTINCT employee_id)::int recorded,
              count(*) FILTER (WHERE status='حاضر')::int present,
              count(*) FILTER (WHERE status='غائب')::int absent,
              COALESCE(sum(CASE WHEN COALESCE(payload->>'lateMinutes','') ~ '^-?[0-9]+([.][0-9]+)?
              FROM employee_attendance WHERE school_id=$1 AND attendance_date >= $2::date AND attendance_date < ($2::date + interval '1 month')`,[schoolId,from])
          ]);
          const s=summary.rows[0]||{};
          const payload={totalEmployees:Number(employees.rows[0]?.total||0),recordedEmployees:Number(s.recorded||0),totalPresentDays:Number(s.present||0),totalAbsentDays:Number(s.absent||0),totalLateMinutes:Number(s.late_minutes||0),totalOvertimeHours:Number(s.overtime_hours||0),closedBy:user.full_name||user.email,notes:String(body.notes||''),isPayrollGenerated:false,version:1};
          const q=await pool.query(`INSERT INTO attendance_month_closings(school_id,year,month,status,payload,closed_by,closed_at)
            VALUES($1,$2,$3,'CLOSED',$4::jsonb,$5,now())
            ON CONFLICT(school_id,year,month) DO UPDATE SET status='CLOSED',payload=EXCLUDED.payload,closed_by=EXCLUDED.closed_by,closed_at=now(),updated_at=now()
            RETURNING *`,[schoolId,year,month,JSON.stringify(payload),user.user_id]);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'CLOSE','ATTENDANCE_PERIOD',`${year}-${String(month).padStart(2,'0')}`,String(body.notes||'')]);
          return json({status:'success',data:mapClosing(q.rows[0])},200,corsOrigin);
        }
        if(action==='reopen') {
          if(!['SystemAdmin','Admin','SchoolAdmin','SchoolDirector'].includes(String(user.role||''))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
          const reason=String(body.reason||'').trim();
          if(!reason) return respond({status: 'error',code:'REASON_REQUIRED'},400,corsOrigin);
          const q=await pool.query(`UPDATE attendance_month_closings SET status='OPEN',payload=payload || $4::jsonb,updated_at=now()
            WHERE school_id=$1 AND year=$2 AND month=$3 RETURNING *`,[schoolId,year,month,JSON.stringify({reopenReason:reason,reopenedBy:user.full_name||user.email,reopenedAt:new Date().toISOString()})]);
          if(!q.rowCount)return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'REOPEN','ATTENDANCE_PERIOD',`${year}-${String(month).padStart(2,'0')}`,reason]);
          return json({status:'success',data:mapClosing(q.rows[0])},200,corsOrigin);
        }
        return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
      }

      if (request.method === 'POST' && path === '/leave-management') {
        const body: any = await request.json();
        const action = String(body.action || '');
        const data: any = body.data || {};
        const schoolId = String(body.schoolId || user.active_school_id || user.school_id || '').trim();
        if (!(await canAccessSchool(user, schoolId))) return respond({ status: 'error', code:'FORBIDDEN' },403,corsOrigin);
        const allowedRoles = new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','TeacherAffairs']);
        if (!allowedRoles.has(String(user.role || ''))) return respond({ status: 'error', code:'FORBIDDEN' },403,corsOrigin);
        const mapRow = (row: any, kind: string) => ({ ...(row.payload || {}), id:row.id, schoolId:row.school_id, employeeId:row.employee_id, status:row.status, ...(kind==='leave'?{startDate:String(row.start_date||'').slice(0,10),endDate:String(row.end_date||'').slice(0,10)}:{date:String(row.permission_date||'').slice(0,10)}) });
        if (action === 'getLeaveManagementData') {
          const [lr,pr] = await Promise.all([pool.query('SELECT * FROM leaves WHERE school_id=$1 ORDER BY created_at DESC',[schoolId]),pool.query('SELECT * FROM permissions WHERE school_id=$1 ORDER BY created_at DESC',[schoolId])]);
          return json({status:'success',data:{leaves:lr.rows.map((x:any)=>mapRow(x,'leave')),permissions:pr.rows.map((x:any)=>mapRow(x,'permission'))}},200,corsOrigin);
        }
        const isLeave = ['createManagedLeave','approveManagedLeave','rejectManagedLeave','deleteLeave'].includes(action);
        const isPerm = ['createManagedPermission','approveManagedPermission','rejectManagedPermission','deletePermission'].includes(action);
        if (!isLeave && !isPerm) return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
        const table=isLeave?'leaves':'permissions'; const id=String(data.id||'').trim() || (isLeave?'LEV-':'PER-')+crypto.randomBytes(8).toString('hex').toUpperCase();
        if (action==='deleteLeave'||action==='deletePermission') {
          const d=await pool.query(`DELETE FROM ${table} WHERE school_id=$1 AND id=$2 RETURNING id`,[schoolId,id]);
          return d.rowCount?json({status:'success'},200,corsOrigin):json({status:'error',code:'NOT_FOUND'},404,corsOrigin);
        }
        if (action.startsWith('approve')||action.startsWith('reject')) {
          const status=action.startsWith('approve')?'مقبولة':'مرفوضة';
          const u=await pool.query(`UPDATE ${table} SET status=$3,payload=payload || $4::jsonb WHERE school_id=$1 AND id=$2 RETURNING *`,[schoolId,id,status,JSON.stringify({decisionReason:String(data.reason||''),approvedBy:user.full_name||user.email})]);
          if(!u.rowCount)return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin);
          return json({status:'success',[isLeave?'leave':'permission']:mapRow(u.rows[0],isLeave?'leave':'permission')},200,corsOrigin);
        }
        const employeeId=String(data.employeeId||'').trim();
        const emp=await pool.query('SELECT id FROM employees WHERE school_id=$1 AND id=$2',[schoolId,employeeId]);
        if(!emp.rowCount)return respond({status: 'error',code:'EMPLOYEE_NOT_FOUND'},404,corsOrigin);
        const payload=JSON.stringify(data);
        let s;
        if(isLeave)s=await pool.query('INSERT INTO leaves(id,school_id,employee_id,start_date,end_date,status,payload) VALUES($1,$2,$3,$4::date,$5::date,$6,$7::jsonb) RETURNING *',[id,schoolId,employeeId,String(data.startDate||''),String(data.endDate||''),'قيد المراجعة',payload]);
        else s=await pool.query('INSERT INTO permissions(id,school_id,employee_id,permission_date,status,payload) VALUES($1,$2,$3,$4::date,$5,$6::jsonb) RETURNING *',[id,schoolId,employeeId,String(data.date||''),'قيد المراجعة',payload]);
        await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'CREATE',isLeave?'LEAVE':'PERMISSION',id,'Created through Neon API']);
        return json({status:'success',[isLeave?'leave':'permission']:mapRow(s.rows[0],isLeave?'leave':'permission')},201,corsOrigin);
      }

      if (request.method === 'POST' && path === '/teacher-accounts/manage') {
        const body:any=await request.json();
        const action=String(body.action||'');
        const data:any=body.data||{};
        const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();
        const allowedRoles=new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','TeacherAffairs']);
        if(!allowedRoles.has(String(user.role||''))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        if(!(await canAccessSchool(user,schoolId))) return respond({status: 'error',code:'FORBIDDEN'},403,corsOrigin);
        if(action==='getEmployees'){
          const r=await pool.query('SELECT id,employee_code AS "teacherCode",full_name AS name,job_title AS "jobTitle",department AS specialization,status,payload FROM employees WHERE school_id=$1 ORDER BY full_name',[schoolId]);
          return json({status:'success',data:r.rows.map((x:any)=>({...x,...(x.payload||{}),id:x.id,name:x.name,teacherCode:x.teacherCode||x.employee_code||x.id}))},200,corsOrigin);
        }
        if(action==='getTeacherAccounts'){
          const r=await pool.query(`SELECT u.id,u.employee_id AS "employeeId",u.username,u.status,u.is_active AS "isActive",u.last_login_at AS "lastLoginAt",u.created_at AS "createdAt",u.updated_at AS "updatedAt",e.employee_code AS "teacherCode"
            FROM users u JOIN employees e ON e.school_id=$1 AND e.id=u.employee_id
            WHERE u.school_id=$1 AND u.role='Teacher' ORDER BY e.full_name`,[schoolId]);
          return json({status:'success',data:r.rows},200,corsOrigin);
        }
        const employeeId=String(data.employeeId||'').trim();
        if(!employeeId)return respond({status: 'error',code:'MISSING_FIELDS'},400,corsOrigin);
        const emp=await pool.query('SELECT id,full_name,employee_code FROM employees WHERE school_id=$1 AND id=$2 LIMIT 1',[schoolId,employeeId]);
        if(!emp.rowCount)return respond({status: 'error',code:'EMPLOYEE_NOT_FOUND'},404,corsOrigin);
        const existing=await pool.query("SELECT id FROM users WHERE school_id=$1 AND employee_id=$2 AND role='Teacher' LIMIT 1",[schoolId,employeeId]);
        if(action==='createTeacherAccount'){
          if(existing.rowCount)return respond({status: 'error',code:'ACCOUNT_EXISTS'},409,corsOrigin);
          const username=String(data.username||'').trim().toLowerCase(), password=String(data.temporaryPassword||'');
          if(!/^[a-zA-Z0-9._-]+$/.test(username)||password.length<8)return respond({status: 'error',code:'INVALID_ACCOUNT_DATA'},400,corsOrigin);
          const duplicate=await pool.query('SELECT 1 FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1) LIMIT 1',[username]);
          if(duplicate.rowCount)return respond({status: 'error',code:'USERNAME_EXISTS'},409,corsOrigin);
          const id='USR-'+crypto.randomBytes(8).toString('hex').toUpperCase(), hash=scryptPasswordHash(password);
          const email=username+'@teacher.ntss.local';
          const saved=await pool.query(`INSERT INTO users(id,email,username,full_name,role,access_scope,school_id,employee_id,password_hash,password_salt,password_iterations,is_active,status)
            VALUES($1,$2,$3,$4,'Teacher','SCHOOL',$5,$6,$7,NULL,NULL,true,'Active') RETURNING id,employee_id AS "employeeId",username,status,is_active AS "isActive",created_at AS "createdAt",updated_at AS "updatedAt"`,
            [id,email,username,String(emp.rows[0].full_name||username),schoolId,employeeId,hash]);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'CREATE','TEACHER_ACCOUNT',id,employeeId]);
          return json({status:'success',data:saved.rows[0]},201,corsOrigin);
        }
        if(!existing.rowCount)return respond({status: 'error',code:'NOT_FOUND'},404,corsOrigin);
        const targetUserId=String(existing.rows[0].id);
        if(action==='resetTeacherPassword'){
          const password=String(data.temporaryPassword||'');
          if(password.length<8)return respond({status: 'error',code:'INVALID_PASSWORD'},400,corsOrigin);
          await pool.query('UPDATE users SET password_hash=$2,password_salt=NULL,password_iterations=NULL,updated_at=now() WHERE id=$1',[targetUserId,scryptPasswordHash(password)]);
          await pool.query("UPDATE sessions SET status='REVOKED',revoked_at=now() WHERE user_id=$1 AND status='ACTIVE'",[targetUserId]);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'RESET_PASSWORD','TEACHER_ACCOUNT',targetUserId,employeeId]);
          return json({status:'success'},200,corsOrigin);
        }
        if(action==='setTeacherAccountStatus'){
          const status=String(data.status||'');
          if(!['Active','Suspended','Inactive'].includes(status))return respond({status: 'error',code:'INVALID_STATUS'},400,corsOrigin);
          await pool.query('UPDATE users SET status=$2,is_active=$3,updated_at=now() WHERE id=$1',[targetUserId,status,status==='Active']);
          if(status!=='Active')await pool.query("UPDATE sessions SET status='REVOKED',revoked_at=now() WHERE user_id=$1 AND status='ACTIVE'",[targetUserId]);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'STATUS_CHANGE','TEACHER_ACCOUNT',targetUserId,JSON.stringify({employeeId,status})]);
          return json({status:'success'},200,corsOrigin);
        }
        return respond({status: 'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
      }

      if (request.method === 'POST' && (path === '/students/manage' || path === '/employees/manage')) {
        const body: any = await request.json();
        const action = String(body.action || '');
        const data: any = body.data || {};
        const isStudent = path === '/students/manage';
        const allowedRoles = isStudent
          ? new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','StudentAffairs'])
          : new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','TeacherAffairs']);
        if (!allowedRoles.has(String(user.role || ''))) return respond({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const schoolId = String(body.schoolId || user.active_school_id || user.school_id || '').trim();
        if (!(await canAccessSchool(user, schoolId))) return respond({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const table = isStudent ? 'students' : 'employees';
        const entity = isStudent ? 'STUDENT' : 'EMPLOYEE';
        const readAction = isStudent ? 'getStudents' : 'getEmployees';
        if (action === readAction) {
          const rows = await pool.query(`SELECT * FROM ${table} WHERE school_id=$1 ORDER BY full_name`, [schoolId]);
          return json({ status: 'success', data: rows.rows }, 200, corsOrigin);
        }
        const createAction = isStudent ? 'createManagedStudent' : 'createManagedEmployee';
        const updateAction = isStudent ? 'updateManagedStudent' : 'updateManagedEmployee';
        const statusAction = isStudent ? 'setManagedStudentStatus' : 'setManagedEmployeeStatus';
        const deleteAction = isStudent ? 'deleteStudent' : 'deleteEmployee';
        if (![createAction, updateAction, statusAction, deleteAction].includes(action)) {
          return respond({ status: 'error', code: 'ACTION_NOT_MIGRATED' }, 400, corsOrigin);
        }
        const targetId = String(data.id || '').trim() || (isStudent ? 'STD-' : 'EMP-') + crypto.randomBytes(8).toString('hex').toUpperCase();
        if (action === deleteAction) {
          // Destructive deletion is intentionally retired from normal management flows.
          // Archive records instead so attendance, timetable and audit history remain referentially intact.
          const archivedStatus = isStudent ? 'غير نشط' : 'Inactive';
          const archived = await pool.query(`UPDATE ${table} SET status=$3,updated_at=now() WHERE school_id=$1 AND id=$2 RETURNING *`, [schoolId, targetId, archivedStatus]);
          if (!archived.rowCount) return respond({ status: 'error', code: 'NOT_FOUND' }, 404, corsOrigin);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [schoolId,user.user_id,user.email,user.role,'ARCHIVE',entity,targetId,'Archived through Neon API; physical deletion retired']);
          return json({ status: 'success', data: archived.rows[0], [isStudent ? 'student' : 'employee']: archived.rows[0], message: 'تمت الأرشفة مع الاحتفاظ بالسجل التاريخي.' }, 200, corsOrigin);
        }
        if (action === statusAction) {
          const status = String(data.status || '').trim();
          const updated = await pool.query(`UPDATE ${table} SET status=$3,updated_at=now() WHERE school_id=$1 AND id=$2 RETURNING *`, [schoolId,targetId,status]);
          if (!updated.rowCount) return respond({ status: 'error', code: 'NOT_FOUND' }, 404, corsOrigin);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [schoolId,user.user_id,user.email,user.role,'STATUS',entity,targetId,status]);
          return json({ status: 'success', data: updated.rows[0], [isStudent ? 'student' : 'employee']: updated.rows[0] }, 200, corsOrigin);
        }
        const fullName = String(data.fullName || data.name || '').trim();
        if (!fullName) return respond({ status: 'error', code: 'FULL_NAME_REQUIRED' }, 400, corsOrigin);
        const payload = JSON.stringify(data);
        let saved;
        if (isStudent) {
          saved = await pool.query(
            `INSERT INTO students(id,school_id,student_code,full_name,grade,classroom,section,status,payload)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
             ON CONFLICT(school_id,id) DO UPDATE SET student_code=EXCLUDED.student_code,full_name=EXCLUDED.full_name,grade=EXCLUDED.grade,classroom=EXCLUDED.classroom,section=EXCLUDED.section,status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=now()
             RETURNING *`,
            [targetId,schoolId,String(data.studentCode||''),fullName,String(data.grade||''),String(data.classroom||''),String(data.section||''),String(data.status||'نشط'),payload]
          );
        } else {
          saved = await pool.query(
            `INSERT INTO employees(id,school_id,employee_code,full_name,department,job_title,status,payload)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
             ON CONFLICT(school_id,id) DO UPDATE SET employee_code=EXCLUDED.employee_code,full_name=EXCLUDED.full_name,department=EXCLUDED.department,job_title=EXCLUDED.job_title,status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=now()
             RETURNING *`,
            [targetId,schoolId,String(data.employeeCode||data.employeeId||''),fullName,String(data.department||''),String(data.jobTitle||''),String(data.status||'Active'),payload]
          );
        }
        await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [schoolId,user.user_id,user.email,user.role,action===createAction?'CREATE':'UPDATE',entity,targetId,'Saved through Neon API']);
        return json({ status: 'success', data: saved.rows[0], [isStudent ? 'student' : 'employee']: saved.rows[0] }, action===createAction?201:200, corsOrigin);
      }

      if (request.method === 'POST' && (path === '/student-attendance/batch' || path === '/employee-attendance/batch')) {
        const body: any = await request.json();
        const isStudent = path === '/student-attendance/batch';
        const allowedRoles = isStudent
          ? new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','StudentAffairs'])
          : new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','TeacherAffairs']);
        if (!allowedRoles.has(String(user.role || ''))) return respond({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const schoolId = String(body.schoolId || user.active_school_id || user.school_id || '').trim();
        if (!(await canAccessSchool(user, schoolId))) return respond({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const date = String(body.date || '').slice(0,10);
        const records = Array.isArray(body.records) ? body.records : [];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || records.length > 500) return respond({ status: 'error', code: 'INVALID_BATCH' }, 400, corsOrigin);
        const canonical: any[] = [];
        const normalizedIds = records.map((rec: any) => String((isStudent ? rec.studentId : rec.employeeId) || '').trim());
        if (normalizedIds.some((id: string) => !id)) return respond({ status: 'error', code: 'INVALID_BATCH' }, 400, corsOrigin);
        const requestedIds = [...new Set(normalizedIds)];
        const personTable = isStudent ? 'students' : 'employees';
        const people = requestedIds.length
          ? await pool.query(`SELECT id,full_name FROM ${personTable} WHERE school_id=$1 AND id = ANY($2::text[])`, [schoolId, requestedIds])
          : { rows: [] };
        const namesById = new Map(people.rows.map((row: any) => [String(row.id), String(row.full_name || '')]));
        const missingId = requestedIds.find(id => !namesById.has(id));
        if (missingId) return respond({ status: 'error', code:isStudent?'STUDENT_NOT_FOUND':'EMPLOYEE_NOT_FOUND', [isStudent?'studentId':'employeeId']:missingId },404,corsOrigin);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const rec of records) {
          if (isStudent) {
            const studentId = String(rec.studentId || '').trim();
            const payload = JSON.stringify({ lateMinutes:Number(rec.lateMinutes||0), notes:String(rec.notes||'') });
            const saved = await client.query(
              `INSERT INTO student_attendance(school_id,student_id,attendance_date,status,payload) VALUES($1,$2,$3::date,$4,$5::jsonb)
               ON CONFLICT(school_id,student_id,attendance_date) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload RETURNING id,student_id,attendance_date,status,payload`,
              [schoolId,studentId,date,String(rec.status||'لم يسجل'),payload]
            );
            const row=saved.rows[0]; canonical.push({ id:String(row.id),schoolId,studentId:row.student_id,studentName:namesById.get(studentId)||'',date:String(row.attendance_date).slice(0,10),status:row.status,...(row.payload||{}) });
          } else {
            const employeeId = String(rec.employeeId || '').trim();
            const payload = JSON.stringify({ notes:String(rec.notes||'') });
            const checkIn = String(rec.checkIn||'').trim();
            const checkOut = String(rec.checkOut||'').trim();
            const saved = await client.query(
              `INSERT INTO employee_attendance(school_id,employee_id,attendance_date,status,check_in,check_out,payload)
               VALUES($1,$2,$3::date,$4,CASE WHEN $5='' THEN NULL ELSE ($3::date + $5::time) END,CASE WHEN $6='' THEN NULL ELSE ($3::date + $6::time) END,$7::jsonb)
               ON CONFLICT(school_id,employee_id,attendance_date) DO UPDATE SET status=EXCLUDED.status,check_in=EXCLUDED.check_in,check_out=EXCLUDED.check_out,payload=EXCLUDED.payload
               RETURNING id,employee_id,attendance_date,status,check_in,check_out,payload`,
              [schoolId,employeeId,date,String(rec.status||''),checkIn,checkOut,payload]
            );
            const row=saved.rows[0]; canonical.push({ id:String(row.id),schoolId,employeeId:row.employee_id,employeeName:namesById.get(employeeId)||'',date:String(row.attendance_date).slice(0,10),status:row.status,checkIn:checkIn,checkOut:checkOut,...(row.payload||{}) });
          }
        }
          await client.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,details) VALUES($1,$2,$3,$4,$5,$6,$7)', [schoolId,user.user_id,user.email,user.role,'BATCH_UPSERT',isStudent?'STUDENT_ATTENDANCE':'ATTENDANCE',`Saved ${canonical.length} records for ${date}`]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
        return json({ status:'success', savedCount:canonical.length, records:canonical },200,corsOrigin);
      }

      if (request.method === 'GET' && (path === '/student-attendance' || path === '/employee-attendance')) {
        const schoolId = String(url.searchParams.get('schoolId') || user.active_school_id || user.school_id || '');
        if (!(await canAccessSchool(user, schoolId))) return respond({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const from = String(url.searchParams.get('from') || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
        const to = String(url.searchParams.get('to') || new Date().toISOString().slice(0, 10));
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const pageSize = Math.min(200, Math.max(10, Number(url.searchParams.get('pageSize') || 100)));
        const offset = (page - 1) * pageSize;
        const isStudent = path === '/student-attendance';
        const table = isStudent ? 'student_attendance' : 'employee_attendance';
        const personTable = isStudent ? 'students' : 'employees';
        const personColumn = isStudent ? 'student_id' : 'employee_id';
        const count = await pool.query(
          `SELECT count(*)::int total FROM ${table} WHERE school_id=$1 AND attendance_date BETWEEN $2::date AND $3::date`,
          [schoolId, from, to]
        );
        const data = await pool.query(
          `SELECT a.*,p.full_name AS person_name
           FROM ${table} a JOIN ${personTable} p ON p.school_id=a.school_id AND p.id=a.${personColumn}
           WHERE a.school_id=$1 AND a.attendance_date BETWEEN $2::date AND $3::date
           ORDER BY a.attendance_date DESC,p.full_name LIMIT $4 OFFSET $5`,
          [schoolId, from, to, pageSize, offset]
        );
        return json({ status: 'success', data: data.rows, pagination: {
          page, pageSize, total: Number(count.rows[0]?.total || 0),
          pages: Math.ceil(Number(count.rows[0]?.total || 0) / pageSize)
        }}, 200, corsOrigin);
      }

      if (request.method === 'GET' && (path === '/students' || path === '/employees')) {
        const schoolId = String(url.searchParams.get('schoolId') || user.active_school_id || user.school_id || '');
        if (!(await canAccessSchool(user, schoolId))) return respond({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const table = path.slice(1);
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || 50)));
        const offset = (page - 1) * pageSize;
        const count = await pool.query(`SELECT count(*)::int total FROM ${table} WHERE school_id=$1`, [schoolId]);
        const data = await pool.query(`SELECT * FROM ${table} WHERE school_id=$1 ORDER BY full_name LIMIT $2 OFFSET $3`, [schoolId, pageSize, offset]);
        return json({ status: 'success', data: data.rows, pagination: { page, pageSize, total: count.rows[0].total, pages: Math.ceil(count.rows[0].total / pageSize) } }, 200, corsOrigin);
      }

      return respond({ status: 'error', code: 'NOT_FOUND' }, 404, corsOrigin);
    } catch (error) {
      console.error(JSON.stringify({ marker: 'NTSS_API_ERROR', requestId: traceRequestId, message: String((error as any)?.message || error), stack: String((error as any)?.stack || '') }));
      return respond({ status: 'error', code: 'INTERNAL_ERROR' }, 500, corsOrigin);
    }
  }
};

export default async function vercelHandler(request: any, response: any) {
  const protocol = request.headers['x-forwarded-proto'] || 'https';
  const host = request.headers.host;
  const url = protocol + '://' + host + request.url;
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers || {})) {
    if (Array.isArray(value)) value.forEach(v => headers.append(key, String(v)));
    else if (value != null) headers.set(key, String(value));
  }
  let body: any = undefined;
  if (!['GET','HEAD'].includes(String(request.method || 'GET').toUpperCase())) {
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
  }
  const webRequest = new Request(url, { method: request.method, headers, body });
  const webResponse = await ntssHandler.fetch(webRequest);
  response.status(webResponse.status);
  webResponse.headers.forEach((value, key) => response.setHeader(key, value));
  response.send(Buffer.from(await webResponse.arrayBuffer()));
}
