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

console.log('Canonical API runtime guard passed.');
