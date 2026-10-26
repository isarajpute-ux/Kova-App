/* GitHub Pages: the site built with `npm run build:pages` works under
   /Kova-App/ (a project site's address), reaches the server on another
   address (KOVA_API_URL), and every file it asks for exists there.
   Builds into a temporary folder; the normal dist/ is left alone.
     node tests/e2e/pages.mjs */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, existsSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const API = 'https://kova-api.example/api';

/* build for Pages, then put it at /Kova-App/ in a temporary site root */
const keep = join(root, 'dist'), saved = existsSync(keep) ? mkdtempSync(join(tmpdir(), 'kova-dist-')) : null;
if (saved) { rmSync(saved, { recursive: true, force: true }); renameSync(keep, saved); }
let site;
try {
  execFileSync('node', ['build/site.mjs', '--pages'], { cwd: root, env: Object.assign({}, process.env, { KOVA_API_URL: API, PAGES_BASE: '/Kova-App/' }), stdio: 'pipe' });
  site = mkdtempSync(join(tmpdir(), 'kova-pages-'));
  cpSync(join(root, 'dist'), join(site, 'Kova-App'), { recursive: true });
} finally {
  rmSync(keep, { recursive: true, force: true });
  if (saved) renameSync(saved, keep);
}
const out = join(site, 'Kova-App');
ck('the Pages build adds .nojekyll and 404.html and drops Netlify’s _redirects', existsSync(join(out, '.nojekyll')) && existsSync(join(out, '404.html')) && !existsSync(join(out, '_redirects')));
ck('404.html sends you back to the app under /Kova-App/', /url=\/Kova-App\//.test(readFileSync(join(out, '404.html'), 'utf8')));
ck('/privacy, /terms… without .html still open the pages', ['privacy', 'terms', 'refunds', 'cookies', 'licenses'].every((p) => /\.\.\/\w+\.html/.test(readFileSync(join(out, p, 'index.html'), 'utf8'))));
const man = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'));
ck('the install manifest is relative, so a home-screen install opens under /Kova-App/', man.start_url === './index.html' && man.scope === './');
const sw = readFileSync(join(out, 'sw.js'), 'utf8');
ck('the offline cache lists its files relative to where it lives', /'\.\/index\.html'/.test(sw) && /'\.\/m\//.test(sw) && !/'\/index\.html'/.test(sw));

const b = await chromium.launch();
const srv = await serve(site);
const { context, page, pageErrors } = await openPage(b, null, { storage: Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }) }) });
const missing = [], apiCalls = [];
page.on('response', (r) => { if (r.url().startsWith(srv.url) && r.status() === 404 && !/favicon/.test(r.url())) missing.push(r.url().slice(srv.url.length)); });
await context.route(/kova-api\.example/, (r) => { apiCalls.push(r.request().url()); r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
await page.goto(srv.url + '/Kova-App/index.html', { waitUntil: 'load' });
await page.waitForTimeout(5000);
ck('the app runs under /Kova-App/', await page.evaluate(() => typeof go === 'function' && !!document.querySelector('.screen.on')));
ck('every file the page asks for is there (' + (missing.join(', ') || 'none missing') + ')', missing.length === 0);
ck('the files that load after the first screen came from /Kova-App/m/', await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /\/Kova-App\/m\//.test(e.name))));
ck('the app talks to the server it was built with', await page.evaluate((api) => window.KovaLink && KovaLink.server() === api, API));
const legal = await page.evaluate(() => { const a = document.createElement('a'); a.href = 'terms.html'; return a.href; });
ck('legal links resolve under /Kova-App/', /\/Kova-App\/terms\.html$/.test(legal));
await page.evaluate((api) => fetch(api + '/ping').then((r) => r.json()), API);
ck('a call to the server goes to its own address', apiCalls.some((u) => u === API + '/ping'));
const pr = await context.newPage(); await pr.goto(srv.url + '/Kova-App/privacy/'); await pr.waitForTimeout(500);
ck('/Kova-App/privacy/ lands on the privacy policy', /\/Kova-App\/privacy\.html/.test(pr.url()) && /Privacy/.test(await pr.title()));
ck('no page errors', pageErrors.length === 0 || (console.error(pageErrors), false));
await context.close(); await b.close(); srv.close();
rmSync(site, { recursive: true, force: true });
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
