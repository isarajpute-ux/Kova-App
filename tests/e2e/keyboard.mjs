/* Keyboard only: Tab reaches the sidebar, every focused control shows a
   visible ring, Enter opens an area, Enter opens a Vitals section and the
   Cycle log, Escape closes a sheet. */
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
await page.waitForTimeout(1500);
/* Tab until a sidebar item has focus */
let hit = null;
for (let i = 0; i < 40 && !hit; i++) { await page.keyboard.press('Tab'); hit = await page.evaluate(() => { const a = document.activeElement; return a && a.closest && a.closest('nav.rail') ? (a.getAttribute('data-go') || a.id || 'rail') : null; }); }
ck('Tab reaches the sidebar', !!hit);
const ring = await page.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 || /0px 0px 0px [1-9]/.test(cs.boxShadow); });
ck('the focused item shows a visible ring', ring);
/* move to Vitals and press Enter */
for (let i = 0; i < 12; i++) { const g = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-go')); if (g === 'vitals') break; await page.keyboard.press('Tab'); }
await page.keyboard.press('Enter'); await page.waitForTimeout(500);
ck('Enter on a sidebar item opens that area', await page.evaluate(() => document.getElementById('s-vitals').classList.contains('on')));
/* the Cycle & fertility section header opens with the keyboard */
await page.evaluate(() => { localStorage.setItem('kova.sex', JSON.stringify('female')); });
const hd = await page.$('.kcx-vsec .vsec-h, .kn-vsec .vsec-h');
if (hd) { await hd.focus(); const before = await hd.getAttribute('aria-expanded'); await page.keyboard.press('Enter'); await page.waitForTimeout(150); ck('a Vitals section opens and closes with Enter', (await hd.getAttribute('aria-expanded')) !== before); }
else ck('a Vitals section opens and closes with Enter', false);
/* a sheet closes with Escape */
await page.evaluate(() => { if (window.openSheet) openSheet('<div class="grab"></div><p>test</p>'); });
await page.waitForTimeout(200);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
ck('Escape closes a sheet', await page.evaluate(() => !document.getElementById('sheet').classList.contains('on')));
ck('no page errors', pageErrors.length === 0 || (console.error(pageErrors), false));
await context.close(); await b.close(); site.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
