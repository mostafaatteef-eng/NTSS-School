import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function checkGasSyntax(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const tempFile = path.join(os.tmpdir(), `gas-syntax-check-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  try {
    fs.writeFileSync(tempFile, code, 'utf8');
    execFileSync(process.execPath, ['--check', tempFile], { stdio: 'pipe' });
    return { success: true };
  } catch (err) {
    const errorOutput = err.stderr ? err.stderr.toString() : (err.stdout ? err.stdout.toString() : err.message);
    return { success: false, error: errorOutput };
  } finally {
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch (_) {}
  }
}

const currentFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFilePath)) {
  const target = process.argv[2] || path.resolve(process.cwd(), 'google-apps-script/Code.gs');
  const res = checkGasSyntax(target);
  if (!res.success) {
    console.error(`❌ GAS Syntax Error in ${target}:\n`, res.error);
    process.exit(1);
  }
  console.log(`✅ GAS Syntax Check Passed: ${target}`);
  process.exit(0);
}
