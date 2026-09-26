import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const allowedOrigins = new Set(String(process.env.CORS_ORIGINS || 'https://mostafaatteef-eng.github.io').split(',').map(x => x.trim()).filter(Boolean));
const tokenHash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function json(data: unknown, status = 200, origin = '') {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    vary: 'Origin',
  }});
}

async function authenticate(request: Request) {
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT s.id session_id,s.expires_at,s.active_school_id,u.id user_id,u.email,u.full_name,u.role,u.access_scope,u.school_id,u.employee_id
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.status='ACTIVE' AND s.revoked_at IS NULL
       AND s.expires_at>now() AND u.is_active=true LIMIT 1`,
    [tokenHash(token)]
  );
  return rows[0] || null;
}

async function canAccessSchool(user: any, schoolId: string) {
  if (!schoolId) return false;
  if (user.access_scope !== 'GLOBAL' && user.school_id === schoolId) {
    const school = await pool.query("SELECT 1 FROM schools WHERE id=$1 AND status='ACTIVE' LIMIT 1", [schoolId]);
    return school.rowCount > 0;
  }
  const result = await pool.query(
    "SELECT 1 FROM user_school_access usa JOIN schools s ON s.id=usa.school_id WHERE usa.user_id=$1 AND usa.school_id=$2 AND s.status='ACTIVE' LIMIT 1",
    [user.user_id, schoolId]
  );
  return result.rowCount > 0;
}

export default {
  async fetch(request: Request) {
    const origin = String(request.headers.get('origin') || '');
    const corsOrigin = allowedOrigins.has(origin) ? origin : '';
    if (request.method === 'OPTIONS') return new Response(null, { status: corsOrigin ? 204 : 403, headers: {
      'access-control-allow-origin': corsOrigin, 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET,POST,OPTIONS'
    }});

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';

    try {
      if (request.method === 'GET' && path === '/health') {
        await pool.query('SELECT 1');
        return json({ status: 'success', serviceAvailable: true, backend: 'neon-function', version: '1.0.0' }, 200, corsOrigin);
      }

      if (request.method === 'POST' && path === '/login') {
        const body: any = await request.json();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const query = await pool.query('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1', [email]);
        const user = query.rows[0];
        if (!user || !user.is_active || user.status !== 'Active') return json({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);

        let digest = crypto.createHmac('sha256', String(user.password_salt || '')).update(password + String(user.password_salt || '')).digest();
        for (let i = 1; i < Math.max(1, Number(user.password_iterations || 10000)); i++) {
          digest = crypto.createHmac('sha256', String(user.password_salt || '')).update(digest.toString('hex')).digest();
        }
        const computed = Buffer.from(digest.toString('hex'));
        const expected = Buffer.from(String(user.password_hash || ''));
        if (computed.length !== expected.length || !crypto.timingSafeEqual(computed, expected)) return json({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);

        const token = crypto.randomBytes(32).toString('base64url');
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 86400000);
        await pool.query('INSERT INTO sessions(id,user_id,token_hash,active_school_id,expires_at) VALUES($1,$2,$3,$4,$5)', [sessionId, user.id, tokenHash(token), user.school_id || null, expiresAt]);
        const access = await pool.query('SELECT school_id FROM user_school_access WHERE user_id=$1', [user.id]);
        return json({ status: 'success', sessionToken: token, expiresAt: expiresAt.toISOString(), user: {
          id: user.id, email: user.email, fullName: user.full_name, role: user.role, accessScope: user.access_scope,
          schoolId: user.school_id || '', activeSchoolId: user.school_id || '', allowedSchoolIds: access.rows.map((x: any) => x.school_id), employeeId: user.employee_id || ''
        }}, 200, corsOrigin);
      }

      const user = await authenticate(request);
      if (!user) return json({ status: 'error', code: 'UNAUTHORIZED' }, 401, corsOrigin);

      if (request.method === 'POST' && path === '/validate-session') {
        return json({ status: 'success', valid: true, expiresAt: user.expires_at, user: {
          id: user.user_id, email: user.email, fullName: user.full_name, role: user.role, accessScope: user.access_scope,
          schoolId: user.school_id || '', activeSchoolId: user.active_school_id || '', employeeId: user.employee_id || ''
        }}, 200, corsOrigin);
      }

      if (request.method === 'GET' && path === '/schools') {
        const query = user.access_scope === 'GLOBAL'
          ? await pool.query("SELECT s.id,s.code,s.name,s.status FROM schools s JOIN user_school_access usa ON usa.school_id=s.id WHERE usa.user_id=$1 ORDER BY s.name", [user.user_id])
          : await pool.query("SELECT id,code,name,status FROM schools WHERE id=$2 OR id IN (SELECT school_id FROM user_school_access WHERE user_id=$1) ORDER BY name", [user.user_id, user.school_id]);
        return json({ status: 'success', data: query.rows }, 200, corsOrigin);
      }

      if (request.method === 'GET' && path === '/system-overview') {
        if (user.role !== 'SystemAdmin' || user.access_scope !== 'GLOBAL') {
          return json({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
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
           JOIN user_school_access usa ON usa.school_id=s.id AND usa.user_id=$1
           LEFT JOIN student_counts sc ON sc.school_id=s.id
           LEFT JOIN employee_counts ec ON ec.school_id=s.id
           ORDER BY s.name`,
          [user.user_id]
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
        if (!(await canAccessSchool(user, schoolId))) return json({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        await pool.query('UPDATE sessions SET active_school_id=$1 WHERE id=$2', [schoolId, user.session_id]);
        return json({ status: 'success', activeSchoolId: schoolId }, 200, corsOrigin);
      }

      if (request.method === 'GET' && (path === '/student-attendance' || path === '/employee-attendance')) {
        const schoolId = String(url.searchParams.get('schoolId') || user.active_school_id || user.school_id || '');
        if (!(await canAccessSchool(user, schoolId))) return json({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
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
        if (!(await canAccessSchool(user, schoolId))) return json({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const table = path.slice(1);
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') || 50)));
        const offset = (page - 1) * pageSize;
        const count = await pool.query(`SELECT count(*)::int total FROM ${table} WHERE school_id=$1`, [schoolId]);
        const data = await pool.query(`SELECT * FROM ${table} WHERE school_id=$1 ORDER BY full_name LIMIT $2 OFFSET $3`, [schoolId, pageSize, offset]);
        return json({ status: 'success', data: data.rows, pagination: { page, pageSize, total: count.rows[0].total, pages: Math.ceil(count.rows[0].total / pageSize) } }, 200, corsOrigin);
      }

      return json({ status: 'error', code: 'NOT_FOUND' }, 404, corsOrigin);
    } catch (error) {
      console.error(error);
      return json({ status: 'error', code: 'INTERNAL_ERROR' }, 500, corsOrigin);
    }
  }
};
