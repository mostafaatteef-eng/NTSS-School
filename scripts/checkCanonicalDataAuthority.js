import fs from 'node:fs';

const backup = fs.readFileSync('src/services/backupRestoreService.ts','utf8');
if (!backup.includes('isPostgresBackendEnabled()')) throw new Error('Backup/restore must explicitly guard PostgreSQL authority.');
if (!backup.includes('تم رفض الاستعادة المحلية')) throw new Error('PostgreSQL restore fail-closed guard is missing.');

const notifications = fs.readFileSync('src/services/notificationService.ts','utf8');
for (const seed of ['NOTIF-01','NOTIF-02','homework-seed-math-01','attendance-seed-abs-02']) {
  if (notifications.includes(seed)) throw new Error(`Fabricated production notification seed remains: ${seed}`);
}

console.log('Canonical data authority guard passed.');
