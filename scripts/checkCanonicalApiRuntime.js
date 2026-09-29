import fs from 'node:fs';

const rootPackage = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const serverPackage = JSON.parse(fs.readFileSync(new URL('../server/package.json', import.meta.url), 'utf8'));

const forbidden = /postgres-api\.js/i;
const commands = [
  rootPackage.scripts?.['api:dev'],
  rootPackage.scripts?.['api:start'],
  rootPackage.scripts?.['api:start:canonical'],
  serverPackage.scripts?.start,
  serverPackage.scripts?.dev,
].filter(Boolean);

if (commands.some(command => forbidden.test(String(command)))) {
  throw new Error('Legacy server/postgres-api.js must never be a default runtime target.');
}
if (!String(rootPackage.scripts?.['api:build'] || '').includes('server/canonical-api.ts')) {
  throw new Error('Root API build must use server/canonical-api.ts.');
}
if (!String(serverPackage.scripts?.build || '').includes('canonical-api.ts')) {
  throw new Error('Server package build must use canonical-api.ts.');
}

const neonAdapter = fs.readFileSync(new URL('../functions/api.ts', import.meta.url), 'utf8');
if (!neonAdapter.includes("from '../api/index.ts'") || !neonAdapter.includes('ntssHandler')) {
  throw new Error('Neon function must delegate to the canonical api/index.ts handler.');
}
for (const forbiddenAdapterLogic of ['new Pool', 'pool.query', 'CREATE TABLE', "path === '/"]) {
  if (neonAdapter.includes(forbiddenAdapterLogic)) {
    throw new Error(`Neon compatibility adapter contains forbidden business/runtime logic: ${forbiddenAdapterLogic}`);
  }
}

const canonicalApi = fs.readFileSync(new URL('../api/index.ts', import.meta.url), 'utf8');
const schemaSql = fs.readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8');
if (/CREATE TABLE IF NOT EXISTS login_rate_limits/i.test(canonicalApi) || canonicalApi.includes('ensureLoginRateLimitStorage')) {
  throw new Error('Login request path must never create rate-limit schema at runtime.');
}
if (!/CREATE TABLE IF NOT EXISTS login_rate_limits/i.test(schemaSql)) {
  throw new Error('Versioned database schema must define login_rate_limits.');
}
const vercelHandlerCount = canonicalApi.split('export default async function vercelHandler').length - 1;
if (vercelHandlerCount !== 1) throw new Error(`Canonical API must contain exactly one Vercel adapter; found ${vercelHandlerCount}.`);
const handlerStart = canonicalApi.indexOf('export const ntssHandler = {');
const handlerEnd = canonicalApi.indexOf('export default async function vercelHandler', handlerStart);
const handlerBody = canonicalApi.slice(handlerStart, handlerEnd);
if (/json\(\{\s*status\s*:\s*['"]error['"]/.test(handlerBody)) {
  throw new Error('Canonical handler errors must use respond() so the request trace ID is preserved, including ternaries.');
}

const auditStart = canonicalApi.indexOf("path === '/audit/manage'");
const notificationsStart = canonicalApi.indexOf("path === '/notifications/manage'");
if (auditStart < 0 || notificationsStart < 0 || notificationsStart <= auditStart) throw new Error('Canonical audit/notification route boundaries are invalid.');
const auditBlock = canonicalApi.slice(auditStart, notificationsStart);
if (auditBlock.includes('NOTIFICATION_CONTENT_REQUIRED') || auditBlock.includes("INSERT INTO notifications")) {
  throw new Error('Notification creation logic leaked into the audit route.');
}
const notificationsBlock = canonicalApi.slice(notificationsStart, canonicalApi.indexOf("path === '/master-data/manage'", notificationsStart));
if (!notificationsBlock.includes("action==='create'") || !notificationsBlock.includes('INSERT INTO notifications')) {
  throw new Error('Authoritative notification creation is missing from the notifications route.');
}

console.log('Canonical API runtime guard passed.');
