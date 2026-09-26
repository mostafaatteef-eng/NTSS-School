import fs from 'node:fs';
import pg from 'pg';
const { Pool } = pg;

const file=process.argv[2];
if(!file) throw new Error('Usage: npm run db:import -- export.json');
const source=JSON.parse(fs.readFileSync(file,'utf8'));
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:undefined});

const arr=(v)=>Array.isArray(v)?v:[];
const val=(o,...keys)=>{for(const k of keys) if(o?.[k]!==undefined&&o[k]!==null&&String(o[k]).trim()!=='') return o[k]; return '';};
const schoolId=String(source.schoolId||process.env.IMPORT_SCHOOL_ID||'').trim();
if(!schoolId) throw new Error('schoolId is required in export JSON or IMPORT_SCHOOL_ID');

const client=await pool.connect();
const report={schoolId,source:{},database:{}};
try{
 await client.query('BEGIN');
 const school=source.school||{};
 await client.query(`INSERT INTO schools(id,code,name,status) VALUES($1,$2,$3,$4)
 ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,status=EXCLUDED.status,updated_at=now()`,
 [schoolId,String(school.code||school.schoolCode||schoolId),String(school.name||school.schoolName||schoolId),String(school.status||'ACTIVE')]);

 for(const s of arr(source.students)){
   const id=String(val(s,'id','studentId','studentCode')); if(!id) continue;
   await client.query(`INSERT INTO students(id,school_id,student_code,full_name,grade,classroom,section,status,payload)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
   ON CONFLICT(id) DO UPDATE SET school_id=EXCLUDED.school_id,student_code=EXCLUDED.student_code,full_name=EXCLUDED.full_name,grade=EXCLUDED.grade,classroom=EXCLUDED.classroom,section=EXCLUDED.section,status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=now()`,
   [id,schoolId,String(val(s,'studentCode','code')),String(val(s,'fullName','name','studentName')||id),String(val(s,'grade')),String(val(s,'classroom','class')),String(val(s,'section')),String(val(s,'status')),JSON.stringify(s)]);
 }
 for(const e of arr(source.employees)){
   const id=String(val(e,'id','employeeId','employeeCode')); if(!id) continue;
   await client.query(`INSERT INTO employees(id,school_id,employee_code,full_name,department,job_title,status,payload)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
   ON CONFLICT(id) DO UPDATE SET school_id=EXCLUDED.school_id,employee_code=EXCLUDED.employee_code,full_name=EXCLUDED.full_name,department=EXCLUDED.department,job_title=EXCLUDED.job_title,status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=now()`,
   [id,schoolId,String(val(e,'employeeCode','code')),String(val(e,'fullName','name')||id),String(val(e,'department')),String(val(e,'jobTitle','position')),String(val(e,'status')),JSON.stringify(e)]);
 }
 for(const y of arr(source.academicYears)){
   const id=String(val(y,'id','academicYearId')); if(!id) continue;
   await client.query(`INSERT INTO academic_years(id,school_id,name,start_date,end_date,is_active,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
   ON CONFLICT(id) DO UPDATE SET school_id=EXCLUDED.school_id,name=EXCLUDED.name,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,is_active=EXCLUDED.is_active,payload=EXCLUDED.payload`,
   [id,schoolId,String(val(y,'name')||id),val(y,'startDate')||null,val(y,'endDate')||null,Boolean(y.isActive),JSON.stringify(y)]);
 }
 report.source={students:arr(source.students).length,employees:arr(source.employees).length,academicYears:arr(source.academicYears).length};
 for(const [key,table] of Object.entries({students:'students',employees:'employees',academicYears:'academic_years'})){
   const r=await client.query(`SELECT count(*)::int count FROM ${table} WHERE school_id=$1`,[schoolId]); report.database[key]=r.rows[0].count;
 }
 report.matches=Object.keys(report.source).every(k=>report.source[k]===report.database[k]);
 if(!report.matches) throw new Error('Reconciliation failed: '+JSON.stringify(report));
 await client.query('COMMIT');
 console.log(JSON.stringify({...report,status:'success'},null,2));
}catch(err){await client.query('ROLLBACK'); console.error(err.message); process.exitCode=1;}
finally{client.release();await pool.end();}
