/* Copies the web app (the same files Netlify / Firebase Hosting serve) into
   www/, which Capacitor bundles into the app. The service worker is left
   out: inside the app the files are already on the device, and a worker
   would only add a second cache that can go stale. */
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const www = join(here, '..', 'www');
const FILES = ['index.html', 'privacy.html', 'recipes.json', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const f of FILES) {
  const src = join(root, f);
  if (!existsSync(src)) { console.error('missing ' + f); process.exit(1); }
  cpSync(src, join(www, f));
}
/* no service worker in the app shell */
const page = join(www, 'index.html');
const html = readFileSync(page, 'utf8');
const out = html.replace(/navigator\.serviceWorker\.register\(/g, '(window.Capacitor?function(){ return Promise.resolve(); }:navigator.serviceWorker.register.bind(navigator.serviceWorker))(');
writeFileSync(page, out);
console.log('copied ' + FILES.length + ' files to www/' + (out !== html ? ' (service worker off in the app)' : ''));
