/* Netlify build: copy only the public files into dist/, so the repo's
   server code, tests and node_modules are never published as static files. */
import fs from 'node:fs';
const PUBLIC = ['index.html', 'manifest.webmanifest', 'sw.js', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist');
for (const f of PUBLIC) fs.copyFileSync(f, 'dist/' + f);
console.log('dist/ ready:', PUBLIC.join(', '));
