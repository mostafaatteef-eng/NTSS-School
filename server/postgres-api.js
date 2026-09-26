import express from 'express';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const app = express();
app.disable('x-powered-by');
const allowedOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',').map(x => x.trim()).filter(Boolean);
app.use((req,res,next) => {
  const origin=String(req.headers.origin||'');
  if(origin && allowedOrigins.includes(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.method==='OPTIONS') return res.sendStatus(origin && allowedOrigins.includes(origin) ? 204 : 403);
  next();
});
app.use(express.json({ limit: '2mb' }));

const rateBuckets=new Map();
function rateLimit({windowMs,max}){
  return (req,res,next)=>{
    const key=(req.ip||req.socket?.remoteAddress||'unknown')+':'+req.path;
    const now=Date.now(); const current=rateBuckets.get(key);
    if(!current||current.reset<=now){rateBuckets.set(key,{count:1,reset:now+windowMs});return next();}
    current.count+=1;
    if(current.count>max) return res.status(429).json({status:'error',code:'RATE_LIMITED'});
    next();
  };
}
app.use('/api',rateLimit({windowMs:15*60*1000,max:Number(process.env.RATE_LIMIT_MAX||300)}));
app.use('/api/login',rateLimit({windowMs:15*60*1000,max:Number(process.env.LOGIN_RATE_LIMIT_MAX||20)}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const PORT = Number(process.env.PORT || 8787);
const SESSION_HOURS = 24;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

async function auth(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    String(req.body?.sessionToken || '');
  if (!token) return res.status(401).json({ status:'error', code:'AUTH_REQUIRED', message:'Session token required' });
  const { rows } = await pool.query(
    `SELECT s.id AS session_id,s.user_id,s.active_school_id,s.expires_at,u.email,u.full_name,u.role,u.access_scope,u.school_id,u.employee_id,u.is_active,u.status
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.status='ACTIVE' AND s.revoked_at IS NULL AND s.expires_at>now() LIMIT 1`,
    [hashToken(token)]
  );
  if (!rows[0] || !rows[0].is_active || rows[0].status !== 'Active')
    return res.status(401).json({ status:'error', code:'INVALID_SESSION', message:'Invalid or expired session' });
  req.auth = rows[0]; req.sessionToken = token; next();
}

app.get('/health', async (_req,res) => {
  try { await pool.query('SELECT 1'); res.json({status:'success',serviceAvailable:true,backend:'postgresql-api',version:'1.0.0'}); }
  catch { res.status(503).json({status:'error',serviceAvailable:false}); }
});

app.post('/api/login', async (req,res) => {
  const email=String(req.body?.email||'').trim().toLowerCase();
  const password=String(req.body?.password||'');
  if(!email||!password) return res.status(400).json({status:'error',code:'CREDENTIALS_REQUIRED'});
  const {rows}=await pool.query('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1',[email]);
  const user=rows[0];
  if(!user||!user.is_active||user.status!=='Active') return res.status(401).json({status:'error',code:'INVALID_CREDENTIALS'});
  // Phase-1 migration supports the existing iterated HMAC credential format.
  let digest=crypto.createHmac('sha256',String(user.password_salt||'')).update(password+String(user.password_salt||'')).digest();
  const rounds=Math.max(1,Number(user.password_iterations||10000));
  for(let i=1;i<rounds;i++) digest=crypto.createHmac('sha256',String(user.password_salt||'')).update(digest.toString('hex')).digest();
  const computed=digest.toString('hex');
  const a=Buffer.from(computed); const b=Buffer.from(String(user.password_hash||''));
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return res.status(401).json({status:'error',code:'INVALID_CREDENTIALS'});
  const token=randomToken(), sessionId=crypto.randomUUID(), expiresAt=new Date(Date.now()+SESSION_HOURS*3600000);
  await pool.query('INSERT INTO sessions(id,user_id,token_hash,active_school_id,expires_at) VALUES($1,$2,$3,$4,$5)',[sessionId,user.id,hashToken(token),user.school_id||null,expiresAt]);
  await pool.query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id]);
  const access=await pool.query('SELECT school_id FROM user_school_access WHERE user_id=$1',[user.id]);
  res.json({status:'success',sessionToken:token,expiresAt:expiresAt.toISOString(),user:{id:user.id,email:user.email,fullName:user.full_name,role:user.role,accessScope:user.access_scope,schoolId:user.school_id||'',activeSchoolId:user.school_id||'',allowedSchoolIds:access.rows.map(x=>x.school_id),employeeId:user.employee_id||''}});
});

app.post('/api/validate-session', auth, (req,res) => {
  const u=req.auth;
  res.json({status:'success',valid:true,expiresAt:u.expires_at,user:{id:u.user_id,email:u.email,fullName:u.full_name,role:u.role,accessScope:u.access_scope,schoolId:u.school_id||'',activeSchoolId:u.active_school_id||'',employeeId:u.employee_id||''}});
});

app.post('/api/switch-school', auth, async (req,res) => {
  const schoolId=String(req.body?.schoolId||'').trim();
  if(!(await canAccessSchool(req,schoolId))) return res.status(403).json({status:'error',code:'FORBIDDEN'});
  await pool.query('UPDATE sessions SET active_school_id=$1 WHERE id=$2',[schoolId,req.auth.session_id]);
  const {rows}=await pool.query('SELECT id,code,name,status FROM schools WHERE id=$1 LIMIT 1',[schoolId]);
  res.json({status:'success',activeSchoolId:schoolId,school:rows[0]||null});
});

app.post('/api/logout', auth, async (req,res) => {
  await pool.query('UPDATE sessions SET status=\'REVOKED\',revoked_at=now() WHERE id=$1',[req.auth.session_id]);
  res.json({status:'success'});
});

app.get('/api/dashboard', auth, async (req,res) => {
  const schoolId=String(req.query.schoolId||req.auth.active_school_id||req.auth.school_id||'');
  if(!schoolId) return res.status(400).json({status:'error',code:'SCHOOL_CONTEXT_REQUIRED'});
  if(!(await canAccessSchool(req,schoolId))) return res.status(403).json({status:'error',code:'FORBIDDEN'});
  const [students,employees,attendance]=await Promise.all([
    pool.query('SELECT count(*)::int AS count FROM students WHERE school_id=$1',[schoolId]),
    pool.query('SELECT count(*)::int AS count FROM employees WHERE school_id=$1',[schoolId]),
    pool.query('SELECT count(*)::int AS count FROM student_attendance WHERE school_id=$1 AND attendance_date=CURRENT_DATE',[schoolId])
  ]);
  res.json({status:'success',data:{studentsCount:students.rows[0].count,employeesCount:employees.rows[0].count,todayAttendanceCount:attendance.rows[0].count}});
});


function resolveSchoolId(req) {
  return String(req.query?.schoolId || req.body?.schoolId || req.auth?.active_school_id || req.auth?.school_id || '').trim();
}
async function canAccessSchool(req, schoolId) {
  if (!schoolId) return false;
  if (req.auth.access_scope === 'GLOBAL' || schoolId === req.auth.school_id) return true;
  const { rowCount } = await pool.query(
    'SELECT 1 FROM user_school_access WHERE user_id=$1 AND school_id=$2 LIMIT 1',
    [req.auth.user_id, schoolId]
  );
  return rowCount > 0;
}

app.get('/api/students', auth, async (req,res) => {
  const schoolId=resolveSchoolId(req);
  if(!schoolId) return res.status(400).json({status:'error',code:'SCHOOL_CONTEXT_REQUIRED'});
  if(!(await canAccessSchool(req,schoolId))) return res.status(403).json({status:'error',code:'FORBIDDEN'});
  const page=Math.max(1,Number(req.query.page||1));
  const pageSize=Math.min(100,Math.max(10,Number(req.query.pageSize||50)));
  const offset=(page-1)*pageSize;
  const q=String(req.query.q||'').trim();
  const params=[schoolId,pageSize,offset];
  let where='school_id=$1';
  if(q){params.push('%'+q+'%');where+=' AND (full_name ILIKE $4 OR student_code ILIKE $4)';}
  const [data,total]=await Promise.all([
    pool.query(`SELECT id,student_code AS "studentCode",full_name AS "fullName",grade,classroom,section,status
                FROM students WHERE ${where} ORDER BY full_name LIMIT $2 OFFSET $3`,params),
    pool.query(`SELECT count(*)::int count FROM students WHERE ${q?'school_id=$1 AND (full_name ILIKE $2 OR student_code ILIKE $2)':'school_id=$1'}`,q?[schoolId,'%'+q+'%']:[schoolId])
  ]);
  res.json({status:'success',data:data.rows,pagination:{page,pageSize,total:total.rows[0].count,pages:Math.ceil(total.rows[0].count/pageSize)}});
});

app.get('/api/employees', auth, async (req,res) => {
  const schoolId=resolveSchoolId(req);
  if(!schoolId) return res.status(400).json({status:'error',code:'SCHOOL_CONTEXT_REQUIRED'});
  if(!(await canAccessSchool(req,schoolId))) return res.status(403).json({status:'error',code:'FORBIDDEN'});
  const page=Math.max(1,Number(req.query.page||1));
  const pageSize=Math.min(100,Math.max(10,Number(req.query.pageSize||50)));
  const offset=(page-1)*pageSize;
  const [data,total]=await Promise.all([
    pool.query('SELECT id,employee_code AS "employeeCode",full_name AS "fullName",department,job_title AS "jobTitle",status FROM employees WHERE school_id=$1 ORDER BY full_name LIMIT $2 OFFSET $3',[schoolId,pageSize,offset]),
    pool.query('SELECT count(*)::int count FROM employees WHERE school_id=$1',[schoolId])
  ]);
  res.json({status:'success',data:data.rows,pagination:{page,pageSize,total:total.rows[0].count,pages:Math.ceil(total.rows[0].count/pageSize)}});
});

app.get('/api/student-attendance', auth, async (req,res) => {
  const schoolId=resolveSchoolId(req);
  if(!schoolId) return res.status(400).json({status:'error',code:'SCHOOL_CONTEXT_REQUIRED'});
  if(!(await canAccessSchool(req,schoolId))) return res.status(403).json({status:'error',code:'FORBIDDEN'});
  const from=String(req.query.from||new Date().toISOString().slice(0,10));
  const to=String(req.query.to||from);
  const {rows}=await pool.query(
    `SELECT a.id,a.student_id AS "studentId",s.full_name AS "studentName",a.attendance_date AS "attendanceDate",a.status
     FROM student_attendance a JOIN students s ON s.id=a.student_id
     WHERE a.school_id=$1 AND a.attendance_date BETWEEN $2::date AND $3::date
     ORDER BY a.attendance_date DESC,s.full_name LIMIT 500`,[schoolId,from,to]);
  res.json({status:'success',data:rows});
});

app.get('/api/schools', auth, async (req,res) => {
  const params=[]; let sql='SELECT id,code,name,status FROM schools WHERE status=\'ACTIVE\'';
  if(req.auth.access_scope!=='GLOBAL'){
    params.push(req.auth.user_id,req.auth.school_id);
    sql += ' AND (id=$2 OR id IN (SELECT school_id FROM user_school_access WHERE user_id=$1))';
  }
  sql += ' ORDER BY name';
  const {rows}=await pool.query(sql,params);
  res.json({status:'success',data:rows});
});

app.get('/api/employees', auth, async (req,res) => {
  const schoolId=resolveSchoolId(req);
  if(!schoolId) return res.status(400).json({status:'error',code:'SCHOOL_CONTEXT_REQUIRED'});
  if(!(await canAccessSchool(req,schoolId))) return res.status(403).json({status:'error',code:'FORBIDDEN'});
  const page=Math.max(1,Number(req.query.page||1)), pageSize=Math.min(100,Math.max(10,Number(req.query.pageSize||50))), offset=(page-1)*pageSize;
  const q=String(req.query.q||'').trim(); const values=[schoolId]; let where='school_id=$1';
  if(q){values.push('%'+q+'%'); where+=' AND (full_name ILIKE $2 OR employee_code ILIKE $2)';}
  const count=await pool.query('SELECT count(*)::int total FROM employees WHERE '+where,values);
  values.push(pageSize,offset); const li=values.length-1, oi=values.length;
  const data=await pool.query('SELECT * FROM employees WHERE '+where+' ORDER BY full_name LIMIT $'+li+' OFFSET $'+oi,values);
  res.json({status:'success',data:data.rows,pagination:{page,pageSize,total:count.rows[0].total,pages:Math.ceil(count.rows[0].total/pageSize)}});
});


app.use((err,_req,res,_next)=>{ console.error(err); res.status(500).json({status:'error',code:'INTERNAL_SERVER_ERROR'}); });
app.listen(PORT,()=>console.log(`NTSS PostgreSQL API listening on :${PORT}`));
