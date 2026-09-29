/* The app references these by name. A missing one does not throw - it
   404s quietly and the PWA simply never installs, which is the kind of
   failure you only notice weeks later. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const need = [
  'index.html', 'manifest.webmanifest', 'sw.js',
  'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'icon-180.png',
  'firebase.json', 'database.rules.json', 'storage.rules', '.firebaserc',
  'netlify.toml', '_redirects'
];
let fail = 0;
need.forEach(f => {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) { console.error('MISSING ' + f); fail++; }
  else if (fs.statSync(p).size === 0) { console.error('EMPTY ' + f); fail++; }
});

// manifest must list icons that actually exist
const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
man.icons.forEach(i => {
  if (!fs.existsSync(path.join(root, i.src))) { console.error('manifest references missing ' + i.src); fail++; }
});

// rules must not be left wide open
const rules = fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8');
if (/"\.read"\s*:\s*true/.test(rules) || /"\.write"\s*:\s*true/.test(rules)) {
  console.error('database.rules.json contains an unconditional true'); fail++;
}
const srules = fs.readFileSync(path.join(root, 'storage.rules'), 'utf8');
if (/allow read, write: if true/.test(srules)) {
  console.error('storage.rules is world writable'); fail++;
}

console.log(fail ? fail + ' file problems' : 'all ' + need.length + ' deploy files present and sane');
if (fail) process.exit(1);
