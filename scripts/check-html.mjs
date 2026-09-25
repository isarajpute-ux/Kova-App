/* Syntax-checks every inline <script> in index.html. One stray brace in a
   39k-line file silently kills a whole feature at runtime; this catches it
   in CI instead. Also verifies every file the page references locally exists. */
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');
let n = 0, bad = 0;
const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html))) {
  const attrs = m[1] || '';
  if (/\bsrc=/.test(attrs) || /type=["'](?!text\/javascript|module)/.test(attrs)) continue;
  n++;
  const line = html.slice(0, m.index).split('\n').length;
  try { new vm.Script(m[2], { filename: 'index.html:' + line }); }
  catch (e) { bad++; console.error(`index.html:${line} ${e.message}`); }
}
for (const f of ['manifest.webmanifest', 'sw.js', 'icon-180.png', 'icon-192.png']) {
  if (html.includes(f) && !fs.existsSync(f)) { bad++; console.error('missing referenced file: ' + f); }
}
console.log(`${n} inline scripts checked, ${bad} problem(s)`);
process.exit(bad ? 1 : 0);
