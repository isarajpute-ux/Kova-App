/* Closed screens are parked (src/p08_park.js): at idle the page holds only
   the screen in view, and every screen comes back whole when it is opened
   or when code looks inside it. Opens every screen in turn. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const b = await chromium.launch();
const site = await serve(join(root, 'dist'));
const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), 'kova.tours.v1': JSON.stringify({ home: 1, move: 1, fuel: 1, sleep: 1, vitals: 1, customize: 1, work: 1, studio: 1 }) });
const { context, page, pageErrors } = await openPage(b, null, { storage: STORE });
await page.goto(site.url + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.KovaPark && KovaPark.stats.done, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
const idle = await page.evaluate(() => ({ n: document.getElementsByTagName('*').length, parked: KovaPark.parked().length, back: KovaPark.stats.back }));
ck('closed screens are parked at idle (' + idle.parked + ')', idle.parked > 40);
ck('under 1,500 elements at idle (' + idle.n + ')', idle.n < 1500);
ck('nothing wakes a parked screen on its own (' + idle.back + ' woke)', idle.back <= 3);
/* a lookup by id brings its screen back, connected and filled */
const byId = await page.evaluate(() => { const s = KovaPark.parked()[0]; const el = document.getElementById(s); const kid = el && el.firstElementChild; return { s, back: !el.hasAttribute('data-kpark'), kid: !!kid }; });
ck('looking inside a parked screen brings it back (' + byId.s + ')', byId.back && byId.kid);
/* every screen opens with its content */
const ids = await page.evaluate(() => [...document.querySelectorAll('.screen')].map((s) => s.id.replace(/^s-/, '')).filter((id) => !document.getElementById('s-' + id).hasAttribute('data-parked')));
const empty = [];
for (const id of ids) {
  const r = await page.evaluate((i) => { go(i); const s = document.querySelector('.screen.on'); return s ? { id: s.id, kids: s.children.length, parked: s.hasAttribute('data-kpark') } : null; }, id);
  if (r && (r.parked || (r.kids === 0 && r.id !== 's-workstudio'))) empty.push(r.id);
}
ck('every screen opens with its content (' + ids.length + ' screens)', empty.length === 0 || (console.error('empty:', empty), false));
ck('Vitals still has its sections after a round trip', await page.evaluate(() => { go('vitals'); return document.querySelectorAll('#s-vitals .vsec').length > 2; }));
ck('no page errors', pageErrors.length === 0 || (console.error(pageErrors), false));
await context.close(); await b.close(); site.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
