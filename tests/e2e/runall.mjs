/* Dev helper: every tests/*.js, a few at a time, failures shown with
   their FAIL lines. `node tests/e2e/runall.mjs` (CI runs them one by one). */
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const P = +(process.env.P || 6), res = [];
let i = 0;
async function worker() {
  while (i < files.length) {
    const f = files[i++];
    const out = await new Promise((ok) => { let t = ''; const c = spawn('node', [join(dir, f)]); c.stdout.on('data', (d) => t += d); c.stderr.on('data', (d) => t += d); c.on('close', (code) => ok({ f, code, t })); });
    res.push(out);
  }
}
await Promise.all(Array.from({ length: P }, worker));
const bad = res.filter((r) => r.code !== 0);
for (const r of bad) console.log('FAIL ' + r.f + '\n' + r.t.split('\n').filter((l) => /^FAIL|Error|rror:/.test(l)).slice(0, 8).join('\n'));
console.log(`${files.length - bad.length}/${files.length} test files pass`);
process.exit(bad.length ? 1 : 0);
