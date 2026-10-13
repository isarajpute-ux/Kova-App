/* Runs one browser suite on GitHub's machines (p27).

   Two things the plain "node tests/e2e/x.mjs" did not do:
     - its FAIL lines (and a crash's last words) become GitHub annotations,
       which anyone can read on the run page and through the public API,
       so a red check always says what failed;
     - a suite that fails is run once more. GitHub's shared runners are
       about half the speed of a laptop and a few waits run out there; a
       pass on the second try is still flagged, as a warning naming what
       failed the first time, so a flaky check cannot hide.
   node tests/e2e/ci.mjs "<title>" <command ...>                          */
import { spawn } from 'node:child_process';
const [title, ...cmd] = process.argv.slice(2);
if (!title || !cmd.length) { console.error('usage: ci.mjs "<title>" <command ...>'); process.exit(2); }
const clean = (s) => String(s).replace(/[\r\n]+/g, ' ').replace(/::/g, ': :').slice(0, 300);
function run() {
  return new Promise((ok) => {
    /* one command line: plain words stay as they are (so ENGINE=webkit
       still sets a variable), anything else is quoted for the shell */
    const line = cmd.map((a) => /^[A-Za-z0-9_\/.=:,@%+-]+$/.test(a) ? a : "'" + a.replace(/'/g, "'\\''") + "'").join(' ');
    const p = spawn(line, { shell: true, env: process.env });
    let out = '';
    p.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    p.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    p.on('close', (code) => ok({ code, out }));
  });
}
function why(out) {
  const L = out.split('\n');
  const fails = L.filter((l) => /^\s*FAIL\b/.test(l)).slice(0, 6);
  if (fails.length) return fails;
  const err = L.filter((l) => /Error|Timeout|timed out|exceeded/i.test(l)).slice(0, 3);
  return err.length ? err : L.filter((l) => l.trim()).slice(-3);
}
const first = await run();
if (first.code === 0) process.exit(0);
const w1 = why(first.out);
w1.forEach((l) => console.log(`::error title=${title} (first try)::${clean(l)}`));
console.log(`\n--- ${title}: failed, running it once more ---\n`);
const second = await run();
if (second.code === 0) {
  console.log(`::warning title=${title}::passed on the second try. First try: ${clean(w1.join(' | '))}`);
  process.exit(0);
}
why(second.out).forEach((l) => console.log(`::error title=${title} (second try)::${clean(l)}`));
process.exit(second.code || 1);
