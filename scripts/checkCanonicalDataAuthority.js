import fs from 'node:fs';

const backup = fs.readFileSync('src/services/backupRestoreService.ts','utf8');
if (!backup.includes('isPostgresBackendEnabled()')) throw new Error('Backup/restore must explicitly guard PostgreSQL authority.');
if (!backup.includes('تم رفض الاستعادة المحلية')) throw new Error('PostgreSQL restore fail-closed guard is missing.');

const notifications = fs.readFileSync('src/services/notificationService.ts','utf8');
for (const seed of ['NOTIF-01','NOTIF-02','homework-seed-math-01','attendance-seed-abs-02']) {
  if (notifications.includes(seed)) throw new Error(`Fabricated production notification seed remains: ${seed}`);
}
if (!notifications.includes('isPostgresBackendEnabled()')) throw new Error('Notification legacy mutations must explicitly guard PostgreSQL authority.');
if (!notifications.includes('LEGACY_LOCAL_NOTIFICATION_WRITE_DISABLED')) throw new Error('Notification local mutation fail-closed guard is missing.');

const backupExport = fs.readFileSync('src/components/backup/BackupExportView.tsx','utf8');
if (!backupExport.includes('isPostgresBackendEnabled')) throw new Error('Backup export view must detect PostgreSQL authority.');
if (!backupExport.includes('if (postgresMode) return')) throw new Error('Browser backup export must fail closed in PostgreSQL mode.');
if (backupExport.includes('كافة جداول وقواعد بيانات المدرسة')) throw new Error('Browser export must not claim to be a full production database backup.');

const operations = fs.readFileSync('src/services/operationsService.ts','utf8');
if (!operations.includes('LEGACY_MUTATING_UAT_DISABLED_IN_POSTGRES_MODE')) throw new Error('Mutating browser UAT must be disabled in PostgreSQL mode.');
const uatStart = operations.indexOf('public static runAutomatedSecurityUAT');
const uatEnd = operations.indexOf('public static getUatTestCases', uatStart);
const uatBlock = operations.slice(uatStart, uatEnd);
if (!uatBlock.includes('isPostgresBackendEnabled()')) throw new Error('Operations UAT must explicitly guard PostgreSQL production before local mutations.');

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

const hr = fs.readFileSync('src/services/hrService.ts','utf8');
for (const guard of ['LEGACY_LOCAL_MONTH_CLOSING_DISABLED','LEGACY_LOCAL_MONTH_REOPEN_DISABLED','LEGACY_LOCAL_SALARY_MUTATION_DISABLED']) {
  if (!hr.includes(guard)) throw new Error(`HR legacy mutation guard missing: ${guard}`);
}

if (!storage.includes("'/audit/manage'")) throw new Error('Client audit events must be mirrored to authoritative PostgreSQL.');
if (!storage.includes('getAuthoritativeAuditLogs')) throw new Error('Authoritative audit reader is missing.');
if (!app.includes('getAuthoritativeAuditLogs(300)')) throw new Error('Displayed audit trail must refresh from PostgreSQL authority.');

for (const fakeQuality of ['overallQualityScore: overall || 85','averagePercentage: evalCount > 0 ? Math.round(sumPct / evalCount) : 85',"{ domain: 'البيئة المدرسية والسلامة', averagePercentage: 90"]) {
  if (storage.includes(fakeQuality)) throw new Error(`Fabricated quality KPI detected: ${fakeQuality}`);
}
const qualityModule = fs.readFileSync('src/components/quality/QualityModule.tsx','utf8');
if (!qualityModule.includes('getQualityMetricOverview(schoolId,{ daily,visits,evals,actions:acts,standards:stds })')) throw new Error('Quality dashboard metrics must use authoritative loaded records.');
if (!storage.includes('const overall=availableScores.length ? availableScores.reduce((a,b)=>a+b,0)/availableScores.length : null;')) throw new Error('Missing quality samples must remain null, not fabricated percentages.');

const qualityDashboard = fs.readFileSync('src/components/quality/QualityDashboardSection.tsx','utf8');
if (qualityDashboard.includes('إجمالي المعايير المقيمة: {da.count}')) throw new Error('Quality dashboard must not label configured standards as evaluated.');
if (!qualityDashboard.includes('لم يتم تقييم هذا المجال بعد')) throw new Error('Quality dashboard needs an explicit no-evaluation state.');

const pgRuntime = fs.readFileSync('src/services/backend/postgresRuntime.ts','utf8');
if (!pgRuntime.includes("response.headers.get('x-request-id')")) throw new Error('PostgreSQL client must preserve server request IDs for traceability.');

const masterManager = fs.readFileSync('src/components/masterdata/MasterDataManagerView.tsx','utf8');
if (!masterManager.includes('currentUser?.activeSchoolId') || !masterManager.includes('currentUser?.sessionToken')) throw new Error('Master Data must refresh when school/session context changes.');
if (!masterManager.includes('isPostgresBackendEnabled() ? [] : MasterDataService.getMasterData()')) throw new Error('Master Data must fail closed instead of falling back to browser authority in PostgreSQL mode.');
const apiSource = fs.readFileSync('api/index.ts','utf8');
if (!apiSource.includes("code:'MASTER_DATA_CODE_EXISTS'")) throw new Error('Master Data duplicate codes need a deterministic 409 contract.');
