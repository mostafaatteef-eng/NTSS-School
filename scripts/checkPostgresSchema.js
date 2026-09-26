import fs from 'node:fs';
const path='database/schema.sql'; if(!fs.existsSync(path)) throw new Error('Missing database/schema.sql');
const sql=fs.readFileSync(path,'utf8');
for(const table of ['schools','users','user_school_access','sessions','employees','students','academic_years','audit_logs','student_attendance','employee_attendance']) if(!new RegExp('CREATE TABLE IF NOT EXISTS\\s+'+table+'\\b','i').test(sql)) throw new Error('Missing table: '+table);
if(!/REFERENCES\s+schools\s*\(id\)/i.test(sql)) throw new Error('School tenant foreign keys are required');
console.log('PostgreSQL schema check passed');
