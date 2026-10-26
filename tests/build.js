/* The modules in src/ are the source of the blocks inside index.html
   (p07-studio, p08-*). Rebuilding a copy of the page from src/ must give
   exactly the page in the repo; if not, someone edited a block inside
   index.html directly and the next rebuild would silently undo it. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const tmp = path.join(os.tmpdir(), 'kova-build-check-' + process.pid + '.html');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
fs.copyFileSync(path.join(root, 'index.html'), tmp);
try {
  execFileSync('python3', [path.join(root, 'src', 'inject_p07.py'), tmp], { stdio: 'pipe' });
  const a = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), b = fs.readFileSync(tmp, 'utf8');
  let at = -1;
  if (a !== b) { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { at = i; break; } }
  ck('src/ rebuilds index.html exactly' + (at >= 0 ? ` (first difference at line ${a.slice(0, at).split('\n').length})` : ''), a === b);
  const mods = fs.readdirSync(path.join(root, 'src')).filter((f) => /^p08_.*\.(js|css)$/.test(f));
  ck(`every src/ module is in the page (${mods.length})`, mods.every((f) => a.includes((f.endsWith('.js') ? '<script id="' : '<style id="') + f.replace(/\.(js|css)$/, '').replace(/_/g, '-') + '">')));
} finally { fs.rmSync(tmp, { force: true }); }
const failed = R.filter((r) => !r[1]);
R.forEach((r) => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
