import fs from 'node:fs';

const operationalFiles = [
  'src/components/layout/Header.tsx',
  'src/components/timetable/ExamScheduleView.tsx',
  'src/components/timetable/SupervisionView.tsx',
  'src/components/timetable/TeacherLoadView.tsx',
];

const violations = [];
for (const file of operationalFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes("'2026/2027'") || source.includes('"2026/2027"')) violations.push(`${file}: hardcoded academic year`);
  if (/\|\|\s*['"]FIRST['"]/.test(source)) violations.push(`${file}: hardcoded current-term fallback`);
}
if (violations.length) throw new Error(`Operational academic context must be authoritative:\n${violations.join('\n')}`);
console.log('Academic context guard passed.');
