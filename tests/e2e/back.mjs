/* p44, the owner: "when there's a back arrow, it takes me through the whole
   entire thing all the way out... take me to the last page". Their path:
   Workout > today's workout > the (i) on Barbell back squat > scroll down to
   Stretch after > a quad stretch > Back: it should land on the squat page.
     npm run build && node tests/e2e/back.mjs */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const b = await chromium.launch(); const site = await serve(join(root, 'dist'));
for (const theme of ['dark', 'light']) {
  const seen = { home: 1, move: 1, session: 1, playerpage: 1 };
  const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', 'kova.tours.v1': JSON.stringify(seen), kova_profile_v2: JSON.stringify({ theme, tourSeen: true, tours: seen }) });
  const { context, page: p } = await openPage(b, null, { storage: STORE });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(site.url + '/index.html');
  await p.waitForFunction(() => window.__kovaLazyDone && window.KovaExPage && window.KSESS, null, { timeout: 40000 });
  await p.evaluate(() => document.querySelectorAll('#kwn,#ksTour').forEach((x) => x.remove()));
  await p.evaluate(() => go('session')); await p.waitForTimeout(700);
  const title = () => p.evaluate(() => { const h = document.querySelector('#sheetIn .kxp-h b, #sheetIn .kdl-top b'); return document.getElementById('sheet').classList.contains('on') ? (h && h.textContent.trim()) : null; });
  /* the (i) next to the first exercise */
  const ex = await p.evaluate(() => KSESS.state().ex[0].n);
  await p.locator('#s-session [data-exinfo]').first().click(); await p.waitForTimeout(700);
  ck(theme + ': the (i) opens the exercise page', (await title()) === ex || (console.log(await title(), ex), false));
  await p.evaluate(() => { const s = document.querySelector('#sheetIn .kxp-sts'); if (s) s.scrollIntoView(); });
  const sc1 = await p.evaluate(() => document.getElementById('sheetIn').scrollTop);
  const st = await p.locator('#sheetIn .kxp-st[data-kxp="stretch"]').first().getAttribute('data-n');
  ck(theme + ': it says stretch after training, and to warm up with sets before', /Stretch after training/i.test(await p.locator('#sheetIn').innerText()) && /warm-up sets, not long holds/i.test(await p.locator('#sheetIn').innerText()));
  await p.locator('#sheetIn .kxp-st[data-kxp="stretch"]').first().click(); await p.waitForTimeout(600);
  ck(theme + ': a stretch from it opens its own page', (await title()) === st || (console.log(await title(), st), false));
  await p.locator('#sheetBack').click(); await p.waitForTimeout(500);
  const back1 = await p.evaluate(() => ({ t: (document.querySelector('#sheetIn .kxp-h b') || {}).textContent, on: document.getElementById('sheet').classList.contains('on'), top: document.getElementById('sheetIn').scrollTop, scr: (document.querySelector('.screen.on') || {}).id }));
  ck(theme + ': Back goes to the exercise page, where you were on it (not all the way out)', back1.on && back1.t === ex && Math.abs(back1.top - sc1) < 40 || (console.log(back1, sc1), false));
  /* it plays from memory after its first loops: watch the picture itself change */
  await p.evaluate(() => { document.getElementById('sheetIn').scrollTop = 0; }); await p.waitForTimeout(150);
  const moves = await p.evaluate(() => new Promise((ok) => { const f = document.querySelector('#sheetIn .kxp-fig, #sheetIn [data-kxd]'); if (!f) return ok(-1); let n = 0; const mo = new MutationObserver((m) => { n += m.length; }); mo.observe(f, { subtree: true, childList: true, attributes: true }); setTimeout(() => { mo.disconnect(); ok(n); }, 900); }));
  ck(theme + ': …its moving picture still moves', moves > 3 || await p.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches) || (console.log('moves', moves), false));
  await p.locator('#sheetBack').click(); await p.waitForTimeout(500);
  ck(theme + ': Back again closes it, onto the workout', await p.evaluate(() => !document.getElementById('sheet').classList.contains('on') && document.querySelector('.screen.on').id === 's-session'));
  /* Stretch, from Workout: a body part, a stretch, Back to the same body part */
  await p.evaluate(() => { go('move'); KovaExPage.openStretch(); }); await p.waitForTimeout(900);
  await p.locator('#sheetIn .kdl-l').nth(1).click(); await p.waitForTimeout(300);
  const part = await p.evaluate(() => document.querySelector('#sheetIn .kdl-l.on').textContent.trim());
  await p.locator('#sheetIn .kdl-t[data-kxp="stretch"]').first().click(); await p.waitForTimeout(600);
  await p.locator('#sheetBack').click(); await p.waitForTimeout(500);
  ck(theme + ': Stretch > a body part > a stretch > Back: the Stretch page on the same body part', (await title()) === 'Stretch' && await p.evaluate(() => document.querySelector('#sheetIn .kdl-l.on').textContent.trim()) === part);
  /* a page redrawn in place is not a new step: Add to today's muscle tabs */
  await p.locator('#sheetBack').click(); await p.waitForTimeout(300);
  await p.evaluate(() => go('session')); await p.waitForTimeout(400);
  await p.locator('#addExBtn').click(); await p.waitForTimeout(400);
  for (const g of ['Hamstrings', 'Glutes', 'Back']) { await p.locator('#sheet .chip.gp[data-g="' + g + '"]').click(); await p.waitForTimeout(200); }
  await p.locator('#sheetBack').click(); await p.waitForTimeout(400);
  ck(theme + ': Add to today: tapping muscles does not stack up pages; one Back closes it', await p.evaluate(() => !document.getElementById('sheet').classList.contains('on')));
  /* an action that finishes closes everything */
  await p.locator('#s-session [data-exinfo]').first().click(); await p.waitForTimeout(500);
  await p.locator('#sheetIn .kxp-st[data-kxp="stretch"]').first().click(); await p.waitForTimeout(500);
  await p.evaluate(() => closeSheet()); await p.waitForTimeout(200);
  await p.locator('#s-session [data-exinfo]').first().click(); await p.waitForTimeout(500);
  await p.locator('#sheetBack').click(); await p.waitForTimeout(300);
  ck(theme + ': after a page is closed, nothing old is left to go back to', await p.evaluate(() => !document.getElementById('sheet').classList.contains('on')));
  ck(theme + ': no page errors', !errs.length || (console.log(errs.slice(0, 3)), false));
  await context.close();
}
let n = 0; R.forEach(([t, c]) => { console.log((c ? 'PASS ' : 'FAIL ') + t); if (c) n++; });
console.log(n + '/' + R.length + ' passing');
await b.close(); site.close();
process.exit(n === R.length ? 0 : 1);
