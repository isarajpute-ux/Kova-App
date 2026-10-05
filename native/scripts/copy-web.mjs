/* Copies the web app (the same files Netlify / Firebase Hosting serve) into
   www/, which Capacitor bundles into the app. The service worker is left
   out: inside the app the files are already on the device, and a worker
   would only add a second cache that can go stale. */
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const www = join(here, '..', 'www');
const FILES = ['index.html', 'privacy.html', 'terms.html', 'refunds.html', 'cookies.html', 'licenses.html', 'recipes.json', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];

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

/* Kova's alert sounds (src/p08_chime.js), rendered by the same synth the
   page plays. Android finds them in res/raw (one channel per sound, made
   by the page on start). iPhone gets them in Library/Sounds at run time
   (the page writes them there with @capacitor/filesystem), so no Xcode
   step is needed; a copy also lands in sounds/ for anyone who would
   rather add them to the app bundle by hand. */
const { KovaChime } = createRequire(import.meta.url)(join(root, 'src', 'p08_chime.js'));
const outs = [join(here, '..', 'sounds')];
const raw = join(here, '..', 'android', 'app', 'src', 'main', 'res', 'raw');
if (existsSync(join(here, '..', 'android'))) outs.push(raw);
let made = 0;
for (const dir of outs) {
  mkdirSync(dir, { recursive: true });
  for (const x of KovaChime.LIST) {
    if (x.id === 'default' || x.id === 'silent') continue;
    writeFileSync(join(dir, KovaChime.file(x.id) + '.wav'), KovaChime.wav(x.id, 44100));
    made++;
  }
}
console.log('wrote ' + made + ' alert sounds (' + outs.map((d) => d.replace(join(here, '..') + '/', '')).join(', ') + ')');
