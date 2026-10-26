/* Every inline <script> in index.html must parse. The file is one
   document with ~46 of them; a syntax error in any one silently kills
   that block and everything after it in the same tag. */
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let fail = 0;
blocks.forEach((b, i) => {
  try { new Function(b); }
  catch (e) { fail++; console.error('FAIL inline block ' + i + ': ' + e.message); }
});
console.log(blocks.length - fail + '/' + blocks.length + ' inline scripts parse');
if (fail) process.exit(1);
