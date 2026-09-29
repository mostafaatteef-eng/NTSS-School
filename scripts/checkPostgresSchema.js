import fs from 'node:fs';
const path='database/schema.sql'; if(!fs.existsSync(path)) throw new Error('Missing database/schema.sql');
const sql=fs.readFileSync(path,'utf8');
for(const table of ['schools','users','user_school_access','sessions','employees','students','academic_years','audit_logs','student_attendance','employee_attendance','schedule','curriculum_plans','curriculum_plan_items','curriculum_distributions']) if(!new RegExp('CREATE TABLE IF NOT EXISTS\\s+'+table+'\\b','i').test(sql)) throw new Error('Missing table: '+table);
if(!/REFERENCES\s+schools\s*\(id\)/i.test(sql)) throw new Error('School tenant foreign keys are required');
console.log('PostgreSQL schema check passed');

for(const relation of [
  ['curriculum_plan_items','curriculum_plans'],
  ['curriculum_distributions','curriculum_plans'],
  ['curriculum_distributions','curriculum_plan_items']
]) {
  const [child,parent]=relation;
  if(!new RegExp('CREATE TABLE IF NOT EXISTS\\s+'+child+'[\\s\\S]*?REFERENCES\\s+'+parent+'\\b','i').test(sql)) throw new Error('Missing curriculum relation: '+child+' -> '+parent);
}

const curriculumPlanBlock=(sql.match(/CREATE TABLE IF NOT EXISTS\s+curriculum_plans\s*\(([\s\S]*?)\);/i)||[])[1]||'';
if(!/\bclassroom\s+text\s+NOT\s+NULL\b/i.test(curriculumPlanBlock)) throw new Error('curriculum_plans.classroom must be a canonical required column');
if(/FOREIGN KEY\s*\(school_id\s*,\s*employee_id\)[\s\S]{0,160}?ON DELETE SET NULL/i.test(sql)) throw new Error('Composite employee FK must not null required school_id');

for(const indexName of ['schedule_teacher_slot_unique_idx','schedule_class_slot_unique_idx']) {
  if(!new RegExp('CREATE UNIQUE INDEX IF NOT EXISTS\\s+'+indexName+'\\b','i').test(sql)) throw new Error('Missing timetable concurrency index: '+indexName);
}
if(!/schedule_teacher_school_fkey/i.test(sql)) throw new Error('Missing school-scoped teacher FK for schedule');
