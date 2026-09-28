// deployment sync marker: timetable validation rollout
import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const allowedOrigins = new Set([
  ...String(process.env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean),
  'https://mostafaatteef-eng.github.io',
  'https://ntss-schools.edu.eg',
  'https://www.ntss-schools.edu.eg',
]);
const isAllowedOrigin = (origin: string) => allowedOrigins.has(origin.replace(/\/$/, ''));
const tokenHash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const dummyPasswordSalt = 'ntss-login-timing-equalizer';
const consumeDummyPasswordHash = (password: string) => legacyPasswordHash(password, dummyPasswordSalt, 10000);

const legacyPasswordHash = (password: string, salt: string, iterations: number) => {
  let digest = crypto.createHmac('sha256', salt).update(password + salt).digest();
  for (let i = 1; i < Math.max(1, Number(iterations || 10000)); i++) {
    digest = crypto.createHmac('sha256', salt).update(digest.toString('hex')).digest();
  }
  return digest.toString('hex');
};

function json(data: unknown, status = 200, origin = '') {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': origin || '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    vary: 'Origin',
  }});
}

async function authenticate(request: Request) {
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
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

const ntssHandler = {
  async fetch(request: Request) {
    const origin = String(request.headers.get('origin') || '').trim();
    const hasOrigin = Boolean(origin);
    const originAllowed = !hasOrigin || isAllowedOrigin(origin);
    const corsOrigin = hasOrigin && originAllowed ? origin.replace(/\/$/, '') : '';
    if (hasOrigin && !originAllowed) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 403, headers: { vary: 'Origin' } });
      return json({ status: 'error', code: 'ORIGIN_NOT_ALLOWED' }, 403, '');
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      ...(corsOrigin ? { 'access-control-allow-origin': corsOrigin } : {}),
      'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET,POST,OPTIONS', vary: 'Origin'
    }});

    console.log(JSON.stringify({ marker: 'NTSS_REQ', method: request.method, origin, corsOrigin, url: request.url }));
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';

    try {
      if (request.method === 'GET' && path === '/health') {
        await pool.query('SELECT 1');
        console.log(JSON.stringify({ marker: 'NTSS_HEALTH_OK', corsOrigin }));
        return json({ status: 'success', serviceAvailable: true, backend: 'vercel-postgres', version: '1.0.2' }, 200, corsOrigin);
      }

      if (request.method === 'POST' && path === '/student/login') {
        const startedAt = performance.now();
        const requestId = crypto.randomUUID();
        const body: any = await request.json();
        const studentCode = String(body.studentCode || '').trim();
        const password = String(body.password || '');
        if (!studentCode || !password) return json({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
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
          return json({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        }
        const user = result.rows[0];
        if (!user.is_active || user.status !== 'Active') return json({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        const computed = Buffer.from(legacyPasswordHash(password, String(user.password_salt || ''), Number(user.password_iterations || 10000)));
        const expected = Buffer.from(String(user.password_hash || ''));
        if (computed.length !== expected.length || !crypto.timingSafeEqual(computed, expected)) {
          console.log(JSON.stringify({ marker: 'NTSS_STUDENT_LOGIN_DENIED', requestId, reason: 'password', totalMs: Math.round(performance.now()-startedAt) }));
          return json({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        }
        const token = crypto.randomBytes(32).toString('base64url');
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 86400000);
        await Promise.all([
          pool.query('INSERT INTO sessions(id,user_id,token_hash,active_school_id,expires_at) VALUES($1,$2,$3,$4,$5)', [sessionId,user.id,tokenHash(token),user.school_id,expiresAt]),
          pool.query('UPDATE users SET last_login_at=now(), updated_at=now() WHERE id=$1', [user.id])
        ]);
        console.log(JSON.stringify({ marker: 'NTSS_STUDENT_LOGIN_SUCCESS', requestId, userId:user.id, totalMs:Math.round(performance.now()-startedAt) }));
        return json({ status:'success', sessionToken:token, expiresAt:expiresAt.toISOString(), user:{
          id:user.id, fullName:user.full_name, role:'Student', accessScope:'SELF', schoolId:user.school_id,
          activeSchoolId:user.school_id, allowedSchoolIds:[user.school_id], studentId:user.student_id, studentCode:user.student_code
        }},200,corsOrigin);
      }

      if (request.method === 'POST' && path === '/login') {
        const loginStartedAt = performance.now();
        const requestId = crypto.randomUUID();
        const body: any = await request.json();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        if (!email || !password) return json({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        const dbStartedAt = performance.now();
        const query = await pool.query(
          `SELECT id,email,full_name,role,access_scope,school_id,employee_id,password_hash,password_salt,password_iterations,is_active,status
           FROM users WHERE lower(email)=$1 LIMIT 1`,
          [email]
        );
        const dbMs = Math.round(performance.now() - dbStartedAt);
        const user = query.rows[0];
        if (user?.role === 'Student') return json({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        if (!user || !user.is_active || user.status !== 'Active') {
          consumeDummyPasswordHash(password);
          console.log(JSON.stringify({ marker: 'NTSS_LOGIN_DENIED', requestId, reason: 'user', dbMs, totalMs: Math.round(performance.now() - loginStartedAt) }));
          return json({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        }

        const authStartedAt = performance.now();
        const computed = Buffer.from(legacyPasswordHash(password, String(user.password_salt || ''), Number(user.password_iterations || 10000)));
        const expected = Buffer.from(String(user.password_hash || ''));
        const authMs = Math.round(performance.now() - authStartedAt);
        if (computed.length !== expected.length || !crypto.timingSafeEqual(computed, expected)) {
          console.log(JSON.stringify({ marker: 'NTSS_LOGIN_DENIED', requestId, reason: 'password', dbMs, authMs, totalMs: Math.round(performance.now() - loginStartedAt) }));
          return json({ status: 'error', code: 'INVALID_CREDENTIALS' }, 401, corsOrigin);
        }

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
        console.log(JSON.stringify({ marker: 'NTSS_LOGIN_SUCCESS', requestId, userId: user.id, dbMs, authMs, sessionMs, totalMs }));
        return json({ status: 'success', sessionToken: token, expiresAt: expiresAt.toISOString(), user: {
          id: user.id, email: user.email, fullName: user.full_name, role: user.role, accessScope: user.access_scope,
          schoolId: user.school_id || '', activeSchoolId: user.school_id || '', allowedSchoolIds: access.rows.map((x: any) => x.school_id), employeeId: user.employee_id || '', studentId: user.student_id || ''
        }}, 200, corsOrigin);
      }

      const user = await authenticate(request);
      if (!user) return json({ status: 'error', code: 'UNAUTHORIZED' }, 401, corsOrigin);

      if (request.method === 'GET' && path === '/student/me') {
        if (user.role !== 'Student' || user.access_scope !== 'SELF' || !user.student_id || !user.school_id) {
          return json({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        }
        const studentResult = await pool.query(
          `SELECT id,student_code,full_name,grade,classroom,section,status
           FROM students WHERE school_id=$1 AND id=$2 LIMIT 1`,
          [user.school_id, user.student_id]
        );
        const student = studentResult.rows[0];
        if (!student) return json({ status: 'error', code: 'STUDENT_NOT_FOUND' }, 404, corsOrigin);
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
        return json({ status: 'success', message: 'تم إنهاء الجلسة.' }, 200, corsOrigin);
      }

      if (request.method === 'GET' && path === '/schools') {
        const query = user.access_scope === 'GLOBAL'
          ? await pool.query("SELECT id,code,name,status FROM schools WHERE status='ACTIVE' ORDER BY name")
          : await pool.query("SELECT id,code,name,status FROM schools WHERE id=$2 OR id IN (SELECT school_id FROM user_school_access WHERE user_id=$1) ORDER BY name", [user.user_id, user.school_id]);
        return json({ status: 'success', data: query.rows }, 200, corsOrigin);
      }

      if (request.method === 'POST' && path === '/schools/create') {
        if (user.role !== 'SystemAdmin' || user.access_scope !== 'GLOBAL') return json({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const body: any = await request.json();
        const schoolId = String(body.schoolId || '').trim().toUpperCase();
        const code = String(body.schoolCode || '').trim().toUpperCase();
        const name = String(body.schoolName || '').trim();
        if (!schoolId || !code || !name) return json({ status: 'error', code: 'INVALID_SCHOOL' }, 400, corsOrigin);
        try {
          const created = await pool.query(
            "INSERT INTO schools(id,code,name,status) VALUES($1,$2,$3,'ACTIVE') RETURNING id,code,name,status,created_at,updated_at",
            [schoolId, code, name]
          );
          await pool.query('INSERT INTO user_school_access(user_id,school_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [user.user_id, schoolId]);
          return json({ status: 'success', data: created.rows[0] }, 201, corsOrigin);
        } catch (error: any) {
          if (String(error?.code || '') === '23505') return json({ status: 'error', code: 'SCHOOL_EXISTS' }, 409, corsOrigin);
          throw error;
        }
      }

      if (request.method === 'POST' && path === '/schools/update') {
        if (user.role !== 'SystemAdmin' || user.access_scope !== 'GLOBAL') return json({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const body: any = await request.json();
        const schoolId = String(body.schoolId || '').trim().toUpperCase();
        const code = body.schoolCode === undefined ? null : String(body.schoolCode || '').trim().toUpperCase();
        const name = body.schoolName === undefined ? null : String(body.schoolName || '').trim();
        const status = body.status === undefined ? null : (String(body.status).toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');
        if (!schoolId || code === '' || name === '') return json({ status: 'error', code: 'INVALID_SCHOOL' }, 400, corsOrigin);
        try {
          const updated = await pool.query(
            `UPDATE schools SET code=COALESCE($2,code),name=COALESCE($3,name),status=COALESCE($4,status),updated_at=now()
             WHERE id=$1 RETURNING id,code,name,status,created_at,updated_at`,
            [schoolId, code, name, status]
          );
          if (!updated.rowCount) return json({ status: 'error', code: 'SCHOOL_NOT_FOUND' }, 404, corsOrigin);
          return json({ status: 'success', data: updated.rows[0] }, 200, corsOrigin);
        } catch (error: any) {
          if (String(error?.code || '') === '23505') return json({ status: 'error', code: 'SCHOOL_CODE_EXISTS' }, 409, corsOrigin);
          throw error;
        }
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

      if (request.method === 'POST' && path === '/users/manage') {
        if (!['SystemAdmin','SchoolAdmin','Admin'].includes(user.role)) return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
        const body: any = await request.json();
        const action=String(body.action||''); const data: any=body.data||{};
        const project = async (row: any) => {
          const access=await pool.query('SELECT school_id FROM user_school_access WHERE user_id=$1 ORDER BY school_id',[row.id]);
          return {id:row.id,email:row.email,username:row.username,fullName:row.full_name,role:row.role,accessScope:row.access_scope,schoolId:row.school_id||'',employeeId:row.employee_id||undefined,studentId:row.student_id||undefined,status:row.status,allowedSchoolIds:access.rows.map((x:any)=>x.school_id),createdAt:row.created_at,updatedAt:row.updated_at,lastLogin:row.last_login_at};
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
          if(!studentId||!schoolId||password.length<8)return json({status:'error',code:'INVALID_STUDENT_ACCOUNT'},400,corsOrigin);
          if(!(await canAccessSchool(user,schoolId)))return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
          const studentResult=await pool.query('SELECT id,student_code,full_name FROM students WHERE school_id=$1 AND id=$2 LIMIT 1',[schoolId,studentId]);
          if(!studentResult.rowCount)return json({status:'error',code:'STUDENT_NOT_FOUND'},404,corsOrigin);
          const student=studentResult.rows[0];
          if(!String(student.student_code||'').trim())return json({status:'error',code:'STUDENT_CODE_REQUIRED'},409,corsOrigin);
          const bound=await pool.query('SELECT id FROM users WHERE school_id=$1 AND student_id=$2 LIMIT 1',[schoolId,studentId]);
          if(bound.rowCount)return json({status:'error',code:'STUDENT_ACCOUNT_EXISTS'},409,corsOrigin);
          const id='STU-'+crypto.randomBytes(8).toString('hex').toUpperCase();
          const salt=crypto.randomBytes(16).toString('hex'); const iterations=10000; const hash=legacyPasswordHash(password,salt,iterations);
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
          if(!targetScope.rowCount)return json({status:'error',code:'NOT_FOUND'},404,corsOrigin);
          if(targetScope.rows[0].role==='SystemAdmin' && user.role!=='SystemAdmin')return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
          const targetSchoolId=String(targetScope.rows[0].school_id||'').trim();
          if(!targetSchoolId && targetId!==user.user_id && user.role!=='SystemAdmin')return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
          if(targetSchoolId && !(await canAccessSchool(user,targetSchoolId)))return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
        }
        if(action==='deleteUser'){
          if(!targetId)return json({status:'error',code:'TARGET_REQUIRED'},400,corsOrigin);
          if(targetId===user.user_id)return json({status:'error',code:'SELF_DELETE_DENIED'},409,corsOrigin);
          const client=await pool.connect();
          try {
            await client.query('BEGIN');
            const target=await client.query('SELECT role FROM users WHERE id=$1 FOR UPDATE',[targetId]);
            if(!target.rowCount){ await client.query('ROLLBACK'); return json({status:'error',code:'NOT_FOUND'},404,corsOrigin); }
            if(target.rows[0].role==='SystemAdmin'){
              await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
              const admins=await client.query("SELECT count(*)::int n FROM users WHERE role='SystemAdmin' AND is_active=true AND status='Active'");
              if(Number(admins.rows[0].n)<=1){ await client.query('ROLLBACK'); return json({status:'error',code:'LAST_SYSTEM_ADMIN_PROTECTED'},409,corsOrigin); }
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
          if(password.length<8)return json({status:'error',code:'PASSWORD_TOO_SHORT'},400,corsOrigin);
          const salt=crypto.randomBytes(16).toString('hex'); const iterations=10000;
          const hash=legacyPasswordHash(password,salt,iterations);
          const client=await pool.connect();
          try {
            await client.query('BEGIN');
            const u=await client.query('UPDATE users SET password_hash=$2,password_salt=$3,password_iterations=$4,updated_at=now() WHERE id=$1 RETURNING id',[targetId,hash,salt,iterations]);
            if(!u.rowCount){ await client.query('ROLLBACK'); return json({status:'error',code:'NOT_FOUND'},404,corsOrigin); }
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
          if(targetId===user.user_id && String(data.newStatus)!=='Active')return json({status:'error',code:'SELF_DISABLE_DENIED'},409,corsOrigin);
          const status=['Active','Inactive','Suspended'].includes(String(data.newStatus))?String(data.newStatus):'Inactive';
          const client=await pool.connect();
          let updatedUser:any;
          try {
            await client.query('BEGIN');
            const u=await client.query('UPDATE users SET status=$2,is_active=$3,updated_at=now() WHERE id=$1 RETURNING *',[targetId,status,status==='Active']);
            if(!u.rowCount){ await client.query('ROLLBACK'); return json({status:'error',code:'NOT_FOUND'},404,corsOrigin); }
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
        if(action!=='saveUser')return json({status:'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
        const email=String(data.email||'').trim().toLowerCase(); const username=String(data.username||'').trim().toLowerCase();
        const role=String(data.role||'').trim(); const fullName=String(data.fullName||'').trim();
        const assignableRoles=new Set(['SystemAdmin','SchoolAdmin','SchoolDirector','StudentAffairs','TeacherAffairs','QualityOfficer','TrainingOfficer','SocialSpecialist','Teacher','AdministrativeEmployee','Admin']);
        if(role==='Student')return json({status:'error',code:'STUDENT_ACCOUNT_REQUIRES_ACTIVATION'},400,corsOrigin);
        if(role && !assignableRoles.has(role))return json({status:'error',code:'INVALID_ROLE'},400,corsOrigin);
        if(role==='SystemAdmin' && user.role!=='SystemAdmin')return json({status:'error',code:'ROLE_ESCALATION_DENIED'},403,corsOrigin);
        const allowed: string[]=Array.isArray(data.allowedSchoolIds)?[...new Set<string>(data.allowedSchoolIds.map((x:any)=>String(x||'').trim().toUpperCase()).filter(Boolean))]:[];
        const requestedSchoolId=String(data.schoolId||'').trim().toUpperCase();
        if(requestedSchoolId && !(await canAccessSchool(user,requestedSchoolId)))return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
        for(const sid of allowed) if(!(await canAccessSchool(user,sid)))return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
        if(!targetId){
          if(user.role!=='SystemAdmin' && !requestedSchoolId)return json({status:'error',code:'SCHOOL_REQUIRED'},400,corsOrigin);
          const password=String(data.password||''); if(!email||!username||!fullName||password.length<8)return json({status:'error',code:'INVALID_USER'},400,corsOrigin);
          const id='USR-'+crypto.randomBytes(8).toString('hex').toUpperCase(); const salt=crypto.randomBytes(16).toString('hex'); const iterations=10000; const hash=legacyPasswordHash(password,salt,iterations);
          const scope=role==='SystemAdmin'?'GLOBAL':'SCHOOL'; const schoolId=scope==='GLOBAL'?null:String(data.schoolId||'').trim().toUpperCase()||null;
          const s=await pool.query('INSERT INTO users(id,email,username,full_name,role,access_scope,school_id,employee_id,password_hash,password_salt,password_iterations,status,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,NULLIF($8,\'\'),$9,$10,$11,\'Active\',true) RETURNING *',[id,email,username,fullName,role,scope,schoolId,String(data.employeeId||''),hash,salt,iterations]);
          for(const sid of allowed.length?allowed:(schoolId?[schoolId]:[])) await pool.query('INSERT INTO user_school_access(user_id,school_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM schools WHERE id=$2) ON CONFLICT DO NOTHING',[id,sid]);
          return json({status:'success',message:'تم إنشاء الحساب.',user:await project(s.rows[0])},201,corsOrigin);
        }
        const existing=await pool.query('SELECT * FROM users WHERE id=$1',[targetId]); if(!existing.rowCount)return json({status:'error',code:'NOT_FOUND'},404,corsOrigin);
        const old=existing.rows[0]; if(old.role==='Student')return json({status:'error',code:'STUDENT_ACCOUNT_MANAGED_SEPARATELY'},400,corsOrigin); const nextRole=role||old.role; const scope=nextRole==='SystemAdmin'?'GLOBAL':'SCHOOL'; const schoolId=scope==='GLOBAL'?null:(data.schoolId===undefined?old.school_id:String(data.schoolId||'').trim().toUpperCase()||null);
        if(user.role!=='SystemAdmin' && !schoolId)return json({status:'error',code:'SCHOOL_REQUIRED'},400,corsOrigin);
        const u=await pool.query('UPDATE users SET email=COALESCE(NULLIF($2,\'\'),email),username=COALESCE(NULLIF($3,\'\'),username),full_name=COALESCE(NULLIF($4,\'\'),full_name),role=$5,access_scope=$6,school_id=$7,employee_id=CASE WHEN $8=\'\' THEN employee_id ELSE $8 END,updated_at=now() WHERE id=$1 RETURNING *',[targetId,email,username,fullName,nextRole,scope,schoolId,String(data.employeeId||'')]);
        if(data.allowedSchoolIds!==undefined){await pool.query('DELETE FROM user_school_access WHERE user_id=$1',[targetId]);for(const sid of allowed.length?allowed:(schoolId?[schoolId]:[]))await pool.query('INSERT INTO user_school_access(user_id,school_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM schools WHERE id=$2) ON CONFLICT DO NOTHING',[targetId,sid]);}
        return json({status:'success',message:'تم تحديث الحساب.',user:await project(u.rows[0])},200,corsOrigin);
      }

      if (request.method === 'POST' && path === '/settings/manage') {
        const body: any=await request.json(); const action=String(body.action||''); const data:any=body.data||{};
        const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();
        if(!(await canAccessSchool(user,schoolId)))return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
        if(action==='getSettings'){
          const row=await pool.query("SELECT details FROM audit_logs WHERE school_id=$1 AND entity='SYSTEM_SETTINGS' AND action='SNAPSHOT' ORDER BY created_at DESC,id DESC LIMIT 1",[schoolId]);
          if(!row.rowCount)return json({status:'success',data:null},200,corsOrigin);
          try{return json({status:'success',data:JSON.parse(String(row.rows[0].details||'{}'))},200,corsOrigin);}catch{return json({status:'success',data:null},200,corsOrigin);}
        }
        if(action!=='saveSettings')return json({status:'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
        const allowedRoles=new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector']);
        if(!allowedRoles.has(String(user.role||'')))return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
        const safe={...data};
        delete safe.googleAppsScriptUrl; delete safe.sessionToken; delete safe.password; delete safe.passwordHash; delete safe.databaseUrl;
        await pool.query("INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,'SNAPSHOT','SYSTEM_SETTINGS','CURRENT',$5)",[schoolId,user.user_id,user.email,user.role,JSON.stringify(safe)]);
        return json({status:'success',message:'تم حفظ إعدادات المدرسة في PostgreSQL.',data:safe},200,corsOrigin);
      }

      if (request.method === 'POST' && path === '/academic-years/manage') {
        const body: any=await request.json(); const action=String(body.action||''); const data:any=body.data||{};
        const schoolId=String(body.schoolId||user.active_school_id||user.school_id||'').trim();
        if(!(await canAccessSchool(user,schoolId)))return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
        const allowedRoles=new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector']);
        if(!allowedRoles.has(String(user.role||'')))return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
        const toClient=(r:any)=>({...(r.payload||{}),id:(r.payload&&r.payload.id)||String(r.id).replace(schoolId+'::',''),schoolId:r.school_id,name:r.name,startDate:r.start_date?String(r.start_date).slice(0,10):undefined,endDate:r.end_date?String(r.end_date).slice(0,10):undefined,status:r.is_active?'ACTIVE':((r.payload&&r.payload.status)||'CLOSED'),isDefault:Boolean(r.is_active)});
        if(action==='getAcademicYears'){
          const rows=await pool.query('SELECT * FROM academic_years WHERE school_id=$1 ORDER BY start_date DESC NULLS LAST,name DESC',[schoolId]);
          return json({status:'success',data:rows.rows.map(toClient)},200,corsOrigin);
        }
        const clientId=String(data.id||'').trim()||('AY-'+Date.now()); const dbId=schoolId+'::'+clientId;
        if(action==='deleteAcademicYear'){
          const used=await pool.query('SELECT 1 FROM schedule WHERE school_id=$1 AND academic_year_id=$2 LIMIT 1',[schoolId,dbId]);
          if(used.rowCount)return json({status:'error',code:'ACADEMIC_YEAR_IN_USE',message:'لا يمكن حذف عام دراسي مرتبط بجدول دراسي.'},409,corsOrigin);
          const d=await pool.query('DELETE FROM academic_years WHERE school_id=$1 AND id=$2 RETURNING id',[schoolId,dbId]);
          return d.rowCount?json({status:'success'},200,corsOrigin):json({status:'error',code:'NOT_FOUND'},404,corsOrigin);
        }
        if(action!=='saveAcademicYear')return json({status:'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
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
        if(!saved.rowCount)return json({status:'error',code:'ACADEMIC_YEAR_WRITE_REJECTED'},409,corsOrigin);
        await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'UPSERT','ACADEMIC_YEAR',clientId,'Saved through Neon API']);
        return json({status:'success',data:toClient(saved.rows[0])},200,corsOrigin);
      }

      if (request.method === 'POST' && path === '/schedule/manage') {
        const body: any = await request.json();
        const action = String(body.action || '');
        const data: any = body.data || {};
        const schoolId = String(body.schoolId || user.active_school_id || user.school_id || '').trim();
        if (!(await canAccessSchool(user, schoolId))) return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
        const allowedRoles = new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','Supervisor','TeacherAffairs']);
        if (!allowedRoles.has(String(user.role || ''))) return json({status:'error',code:'FORBIDDEN'},403,corsOrigin);
        if (action === 'getSchedule') {
          const rows=await pool.query('SELECT * FROM schedule WHERE school_id=$1 ORDER BY weekday,period_no,id',[schoolId]);
          return json({status:'success',data:rows.rows.map((r:any)=>({...(r.payload||{}),id:r.id,schoolId:r.school_id,academicYearId:r.academic_year_id,teacherId:r.teacher_id,grade:r.grade,classroom:r.classroom,weekday:r.weekday,periodNo:r.period_no}))},200,corsOrigin);
        }
        const id=String(data.id||'').trim() || ('SCH-'+schoolId+'-'+crypto.randomBytes(8).toString('hex').toUpperCase());
        if (action === 'deleteScheduleEntry') {
          const d=await pool.query('DELETE FROM schedule WHERE school_id=$1 AND id=$2 RETURNING id',[schoolId,id]);
          if(!d.rowCount)return json({status:'error',code:'NOT_FOUND'},404,corsOrigin);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'DELETE','SCHEDULE',id,'Deleted through Neon API']);
          return json({status:'success',message:'تم حذف الحصة من الجدول'},200,corsOrigin);
        }
        if (action !== 'saveScheduleEntry') return json({status:'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
        const collision=await pool.query('SELECT school_id FROM schedule WHERE id=$1 AND school_id<>$2',[id,schoolId]);
        if(collision.rowCount)return json({status:'error',code:'CROSS_SCHOOL_ID_COLLISION'},409,corsOrigin);
        const weekday=String(data.weekday||data.dayOfWeek||data.dayName||data.day||'').trim();
        const periodNo=Number(data.periodNo||data.periodNumber||data.period||0);
        const teacherId=String(data.teacherId||'').trim();
        const classroom=String(data.classroomId||data.classroom||'').trim();
        const subject=String(data.subjectId||data.subject||'').trim();
        if(!weekday||!Number.isInteger(periodNo)||periodNo<=0||!teacherId||!classroom||!subject){
          return json({status:'error',code:'INVALID_SCHEDULE_SLOT',message:'بيانات الحصة غير مكتملة: اليوم والحصة والمعلم والفصل والمادة مطلوبة.'},400,corsOrigin);
        }
        const teacherOk=await pool.query('SELECT 1 FROM employees WHERE school_id=$1 AND id=$2 AND COALESCE(status,\'Active\')=\'Active\' LIMIT 1',[schoolId,teacherId]);
        if(!teacherOk.rowCount)return json({status:'error',code:'INVALID_TEACHER_ASSIGNMENT',message:'المعلم المحدد غير موجود أو غير نشط في هذه المدرسة.'},409,corsOrigin);
        const slotConflicts=await pool.query(
          `SELECT id,teacher_id,classroom,payload FROM schedule
           WHERE school_id=$1 AND id<>$2 AND weekday=$3 AND period_no=$4
             AND (teacher_id=$5 OR classroom=$6 OR NULLIF(payload->>'room','')=NULLIF($7,''))
           LIMIT 1`,
          [schoolId,id,weekday,periodNo,teacherId,String(data.classroom||classroom),String(data.roomId||data.room||data.roomNumber||'')]
        );
        if(slotConflicts.rowCount)return json({status:'error',code:'SCHEDULE_CONFLICT',message:'يوجد تعارض في نفس اليوم والحصة للمعلم أو الفصل أو القاعة.'},409,corsOrigin);
        const payload=JSON.stringify({...data,id,schoolId,weekday,periodNo});
        const saved=await pool.query(
          `INSERT INTO schedule(id,school_id,academic_year_id,teacher_id,grade,classroom,weekday,period_no,payload)
           VALUES($1,$2,NULLIF($3,''),NULLIF($4,''),$5,$6,$7,$8,$9::jsonb)
           ON CONFLICT(id) DO UPDATE SET academic_year_id=EXCLUDED.academic_year_id,teacher_id=EXCLUDED.teacher_id,grade=EXCLUDED.grade,classroom=EXCLUDED.classroom,weekday=EXCLUDED.weekday,period_no=EXCLUDED.period_no,payload=EXCLUDED.payload,updated_at=now()
           WHERE schedule.school_id=EXCLUDED.school_id RETURNING *`,
          [id,schoolId,data.academicYearId ? schoolId+'::'+String(data.academicYearId) : '',teacherId,String(data.grade||''),String(data.classroom||classroom),weekday,periodNo,payload]
        );
        if(!saved.rowCount)return json({status:'error',code:'SCHEDULE_WRITE_REJECTED'},409,corsOrigin);
        await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'UPSERT','SCHEDULE',id,'Saved through Neon API']);
        const r:any=saved.rows[0];
        return json({status:'success',message:'تم حفظ الحصة في الجدول بنجاح',data:{...(r.payload||{}),id:r.id,schoolId:r.school_id}},200,corsOrigin);
      }

      if (request.method === 'POST' && path === '/my-requests') {
        const body: any=await request.json(); const action=String(body.action||''); const data:any=body.data||{};
        const employeeId=String(user.employee_id||'').trim();
        if(!employeeId)return json({status:'error',code:'EMPLOYEE_CONTEXT_REQUIRED',message:'الحساب غير مربوط بسجل موظف معتمد.'},409,corsOrigin);
        const emp=await pool.query('SELECT * FROM employees WHERE id=$1 AND school_id IN (SELECT school_id FROM user_school_access WHERE user_id=$2 UNION SELECT school_id FROM users WHERE id=$2) LIMIT 1',[employeeId,user.user_id]);
        if(!emp.rowCount)return json({status:'error',code:'EMPLOYEE_CONTEXT_INVALID'},403,corsOrigin);
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
          if(!startDate||!endDate||endDate<startDate)return json({status:'error',code:'INVALID_DATES'},400,corsOrigin);
          const id='LEV-'+schoolId+'-'+crypto.randomBytes(8).toString('hex').toUpperCase();
          const payload={...data,id,employeeId,employeeName:e.full_name,department:e.department||'',status:'قيد المراجعة',createdBy:user.user_id};
          const q=await pool.query("INSERT INTO leaves(id,school_id,employee_id,start_date,end_date,status,payload) VALUES($1,$2,$3,$4::date,$5::date,'قيد المراجعة',$6::jsonb) RETURNING *",[id,schoolId,employeeId,startDate,endDate,JSON.stringify(payload)]);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'CREATE_SELF','LEAVE',id,'Self-service leave request']);
          return json({status:'success',message:'تم إرسال طلب الإجازة بنجاح.',leave:mapLeave(q.rows[0])},201,corsOrigin);
        }
        if(action==='createMyPermissionRequest'){
          const date=String(data.date||'').trim(); if(!date)return json({status:'error',code:'INVALID_DATE'},400,corsOrigin);
          const id='PER-'+schoolId+'-'+crypto.randomBytes(8).toString('hex').toUpperCase();
          const payload={...data,id,employeeId,employeeName:e.full_name,department:e.department||'',status:'قيد المراجعة',createdBy:user.user_id};
          const q=await pool.query("INSERT INTO permissions(id,school_id,employee_id,permission_date,status,payload) VALUES($1,$2,$3,$4::date,'قيد المراجعة',$5::jsonb) RETURNING *",[id,schoolId,employeeId,date,JSON.stringify(payload)]);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'CREATE_SELF','PERMISSION',id,'Self-service permission request']);
          return json({status:'success',message:'تم إرسال طلب الإذن بنجاح.',permission:mapPermission(q.rows[0])},201,corsOrigin);
        }
        return json({status:'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
      }

      if (request.method === 'POST' && path === '/leave-management') {
        const body: any = await request.json();
        const action = String(body.action || '');
        const data: any = body.data || {};
        const schoolId = String(body.schoolId || user.active_school_id || user.school_id || '').trim();
        if (!(await canAccessSchool(user, schoolId))) return json({ status:'error', code:'FORBIDDEN' },403,corsOrigin);
        const allowedRoles = new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','TeacherAffairs']);
        if (!allowedRoles.has(String(user.role || ''))) return json({ status:'error', code:'FORBIDDEN' },403,corsOrigin);
        const mapRow = (row: any, kind: string) => ({ ...(row.payload || {}), id:row.id, schoolId:row.school_id, employeeId:row.employee_id, status:row.status, ...(kind==='leave'?{startDate:String(row.start_date||'').slice(0,10),endDate:String(row.end_date||'').slice(0,10)}:{date:String(row.permission_date||'').slice(0,10)}) });
        if (action === 'getLeaveManagementData') {
          const [lr,pr] = await Promise.all([pool.query('SELECT * FROM leaves WHERE school_id=$1 ORDER BY created_at DESC',[schoolId]),pool.query('SELECT * FROM permissions WHERE school_id=$1 ORDER BY created_at DESC',[schoolId])]);
          return json({status:'success',data:{leaves:lr.rows.map((x:any)=>mapRow(x,'leave')),permissions:pr.rows.map((x:any)=>mapRow(x,'permission'))}},200,corsOrigin);
        }
        const isLeave = ['createManagedLeave','approveManagedLeave','rejectManagedLeave','deleteLeave'].includes(action);
        const isPerm = ['createManagedPermission','approveManagedPermission','rejectManagedPermission','deletePermission'].includes(action);
        if (!isLeave && !isPerm) return json({status:'error',code:'ACTION_NOT_MIGRATED'},400,corsOrigin);
        const table=isLeave?'leaves':'permissions'; const id=String(data.id||'').trim() || (isLeave?'LEV-':'PER-')+crypto.randomBytes(8).toString('hex').toUpperCase();
        if (action==='deleteLeave'||action==='deletePermission') {
          const d=await pool.query(`DELETE FROM ${table} WHERE school_id=$1 AND id=$2 RETURNING id`,[schoolId,id]);
          return d.rowCount?json({status:'success'},200,corsOrigin):json({status:'error',code:'NOT_FOUND'},404,corsOrigin);
        }
        if (action.startsWith('approve')||action.startsWith('reject')) {
          const status=action.startsWith('approve')?'مقبولة':'مرفوضة';
          const u=await pool.query(`UPDATE ${table} SET status=$3,payload=payload || $4::jsonb WHERE school_id=$1 AND id=$2 RETURNING *`,[schoolId,id,status,JSON.stringify({decisionReason:String(data.reason||''),approvedBy:user.full_name||user.email})]);
          if(!u.rowCount)return json({status:'error',code:'NOT_FOUND'},404,corsOrigin);
          return json({status:'success',[isLeave?'leave':'permission']:mapRow(u.rows[0],isLeave?'leave':'permission')},200,corsOrigin);
        }
        const employeeId=String(data.employeeId||'').trim();
        const emp=await pool.query('SELECT id FROM employees WHERE school_id=$1 AND id=$2',[schoolId,employeeId]);
        if(!emp.rowCount)return json({status:'error',code:'EMPLOYEE_NOT_FOUND'},404,corsOrigin);
        const payload=JSON.stringify(data);
        let s;
        if(isLeave)s=await pool.query('INSERT INTO leaves(id,school_id,employee_id,start_date,end_date,status,payload) VALUES($1,$2,$3,$4::date,$5::date,$6,$7::jsonb) RETURNING *',[id,schoolId,employeeId,String(data.startDate||''),String(data.endDate||''),'قيد المراجعة',payload]);
        else s=await pool.query('INSERT INTO permissions(id,school_id,employee_id,permission_date,status,payload) VALUES($1,$2,$3,$4::date,$5,$6::jsonb) RETURNING *',[id,schoolId,employeeId,String(data.date||''),'قيد المراجعة',payload]);
        await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[schoolId,user.user_id,user.email,user.role,'CREATE',isLeave?'LEAVE':'PERMISSION',id,'Created through Neon API']);
        return json({status:'success',[isLeave?'leave':'permission']:mapRow(s.rows[0],isLeave?'leave':'permission')},201,corsOrigin);
      }

      if (request.method === 'POST' && (path === '/students/manage' || path === '/employees/manage')) {
        const body: any = await request.json();
        const action = String(body.action || '');
        const data: any = body.data || {};
        const isStudent = path === '/students/manage';
        const allowedRoles = isStudent
          ? new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','StudentAffairs'])
          : new Set(['SystemAdmin','Admin','SchoolAdmin','SchoolDirector','TeacherAffairs']);
        if (!allowedRoles.has(String(user.role || ''))) return json({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const schoolId = String(body.schoolId || user.active_school_id || user.school_id || '').trim();
        if (!(await canAccessSchool(user, schoolId))) return json({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
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
          return json({ status: 'error', code: 'ACTION_NOT_MIGRATED' }, 400, corsOrigin);
        }
        const targetId = String(data.id || '').trim() || (isStudent ? 'STD-' : 'EMP-') + crypto.randomBytes(8).toString('hex').toUpperCase();
        if (action === deleteAction) {
          const deleted = await pool.query(`DELETE FROM ${table} WHERE school_id=$1 AND id=$2 RETURNING id`, [schoolId, targetId]);
          if (!deleted.rowCount) return json({ status: 'error', code: 'NOT_FOUND' }, 404, corsOrigin);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [schoolId,user.user_id,user.email,user.role,'DELETE',entity,targetId,'Deleted through Neon API']);
          return json({ status: 'success', data: { id: targetId } }, 200, corsOrigin);
        }
        if (action === statusAction) {
          const status = String(data.status || '').trim();
          const updated = await pool.query(`UPDATE ${table} SET status=$3,updated_at=now() WHERE school_id=$1 AND id=$2 RETURNING *`, [schoolId,targetId,status]);
          if (!updated.rowCount) return json({ status: 'error', code: 'NOT_FOUND' }, 404, corsOrigin);
          await pool.query('INSERT INTO audit_logs(school_id,user_id,username,role,action,entity,target_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [schoolId,user.user_id,user.email,user.role,'STATUS',entity,targetId,status]);
          return json({ status: 'success', data: updated.rows[0], [isStudent ? 'student' : 'employee']: updated.rows[0] }, 200, corsOrigin);
        }
        const fullName = String(data.fullName || data.name || '').trim();
        if (!fullName) return json({ status: 'error', code: 'FULL_NAME_REQUIRED' }, 400, corsOrigin);
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
        if (!allowedRoles.has(String(user.role || ''))) return json({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const schoolId = String(body.schoolId || user.active_school_id || user.school_id || '').trim();
        if (!(await canAccessSchool(user, schoolId))) return json({ status: 'error', code: 'FORBIDDEN' }, 403, corsOrigin);
        const date = String(body.date || '').slice(0,10);
        const records = Array.isArray(body.records) ? body.records : [];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || records.length > 500) return json({ status: 'error', code: 'INVALID_BATCH' }, 400, corsOrigin);
        const canonical: any[] = [];
        const normalizedIds = records.map((rec: any) => String((isStudent ? rec.studentId : rec.employeeId) || '').trim());
        if (normalizedIds.some((id: string) => !id)) return json({ status: 'error', code: 'INVALID_BATCH' }, 400, corsOrigin);
        const requestedIds = [...new Set(normalizedIds)];
        const personTable = isStudent ? 'students' : 'employees';
        const people = requestedIds.length
          ? await pool.query(`SELECT id,full_name FROM ${personTable} WHERE school_id=$1 AND id = ANY($2::text[])`, [schoolId, requestedIds])
          : { rows: [] };
        const namesById = new Map(people.rows.map((row: any) => [String(row.id), String(row.full_name || '')]));
        const missingId = requestedIds.find(id => !namesById.has(id));
        if (missingId) return json({ status:'error', code:isStudent?'STUDENT_NOT_FOUND':'EMPLOYEE_NOT_FOUND', [isStudent?'studentId':'employeeId']:missingId },404,corsOrigin);
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
      console.error(JSON.stringify({ marker: 'NTSS_API_ERROR', message: String((error as any)?.message || error), stack: String((error as any)?.stack || '') }));
      return json({ status: 'error', code: 'INTERNAL_ERROR' }, 500, corsOrigin);
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
