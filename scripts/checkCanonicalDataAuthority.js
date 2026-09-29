import fs from 'node:fs';

const backup = fs.readFileSync('src/services/backupRestoreService.ts','utf8');
if (!backup.includes('isPostgresBackendEnabled()')) throw new Error('Backup/restore must explicitly guard PostgreSQL authority.');
if (!backup.includes('تم رفض الاستعادة المحلية')) throw new Error('PostgreSQL restore fail-closed guard is missing.');

const notifications = fs.readFileSync('src/services/notificationService.ts','utf8');
for (const seed of ['NOTIF-01','NOTIF-02','homework-seed-math-01','attendance-seed-abs-02']) {
  if (notifications.includes(seed)) throw new Error(`Fabricated production notification seed remains: ${seed}`);
}

console.log('Canonical data authority guard passed.');

const app = fs.readFileSync('src/App.tsx','utf8');
if (!app.includes("if (!isPostgresBackendEnabled())")) throw new Error('Legacy startup migrations must be isolated from PostgreSQL mode.');
const guarded = app.slice(app.indexOf("if (!isPostgresBackendEnabled())"), app.indexOf("if (!isPostgresBackendEnabled())") + 900);
for (const scope of ['008','009','010','011','013','014','015']) {
  if (!guarded.includes(`runMigrationScope${scope}`)) throw new Error(`Migration scope ${scope} escaped the PostgreSQL legacy guard.`);
}
if (guarded.includes('runMigrationScope012RemoveLocalPasswords')) throw new Error('Security sanitation migration 012 should remain outside the legacy-only guard.');

const qualityView = fs.readFileSync('src/components/quality/QualityModule.tsx','utf8');
if (qualityView.includes('migrateLocalQualityToBackend(')) throw new Error('Quality UI must never auto-inject browser data into PostgreSQL.');
for (const legacyRead of ['getQualityStandards(schoolId)','getDailyQualityReports(schoolId)','getTeacherVisitReports(schoolId)','getComprehensiveEvaluations(schoolId)','getCorrectiveActions(schoolId)']) {
  if (qualityView.includes(legacyRead)) throw new Error(`Quality UI still treats browser data as Production authority: ${legacyRead}`);
}

const storage = fs.readFileSync('src/services/storageService.ts','utf8');
const qualityMigrationStart = storage.indexOf('public async migrateLocalQualityToBackend');
const qualityMigrationEnd = storage.indexOf('// --- Corrective Actions ---', qualityMigrationStart);
const qualityMigration = storage.slice(qualityMigrationStart, qualityMigrationEnd);
if (!qualityMigration.includes('QUALITY_BROWSER_MIGRATION_DISABLED')) throw new Error('Legacy quality browser migration must fail closed in PostgreSQL mode.');
if (qualityMigration.includes('saveAuthoritativeQualityRecord(')) throw new Error('Legacy quality browser migration still promotes local records to PostgreSQL.');
