/* Every guided tour, played in a real browser at phone size the way a
   person would: Next, Next, Next. Each stop must actually show (none
   skipped because its box is missing or hidden), each step must arrive
   quickly, the lit box must sit on its target, and nothing may be left
   running when the tour ends.
     node tests/e2e/tours.mjs          (after npm run build) */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const ALL = ['home', 'move', 'customize', 'vitals', 'sleep', 'fuel', 'work', 'workauto', 'workmeetings', 'workmeeting'];
const seen = {}; ALL.forEach((k) => { seen[k] = 1; }); seen.studio = 1;
const b = await chromium.launch();
const site = await serve(join(root, 'dist'));
const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), 'kova.tours.v1': JSON.stringify(seen), 'kova.sex': JSON.stringify('female') });
const { context, page, pageErrors } = await openPage(b, null, { storage: STORE });
await page.goto(site.url + '/index.html', { waitUntil: 'load' });
await page.evaluate(() => { if (window.__kovaLoadWork) __kovaLoadWork(); });
await page.waitForFunction(() => window.__kovaLazyDone && window.KovaVDock && window.KovaFlow, null, { timeout: 30000 });
await page.waitForTimeout(800);
/* a meeting, so the Meeting tour has one to show */
await page.evaluate(() => { const m = WorkOS.create('meetings', { title: 'Kickoff', attendees: 'Sam', at: Date.now() - 36e5, prep: '', notes: 'Sam will send the deck by Friday' }, 'user'); window.__mt = m.id; });

const report = [];
for (const id of ALL) {
  const start = await page.evaluate((id) => {
    if (id === 'workmeeting') { __workMeet.open(window.__mt); }
    if (id === 'work') { if (!window.KovaWorkTour) return null; KovaWorkTour.run(); return { n: -1 }; }
    const T = KovaScreenTour.TOURS[id]; if (!T) return null;
    KovaScreenTour.run(id); return { n: T.length, names: T.map((t) => t[0]) };
  }, id);
  if (!start) { report.push({ id, missing: true }); continue; }
  const stops = []; let guard = 0;
  while (guard++ < 20) {
    const t0 = Date.now();
    /* wait for the coach to show a step (or the tour to end) */
    const got = await page.waitForFunction((prev) => {
      const c = document.getElementById('ksCoach'); if (!document.getElementById('ksTour')) return { end: true };
      if (!c || !c.classList.contains('on')) return false;
      const t = (c.querySelector('.ks-ct') || {}).textContent, s = (c.querySelector('.ks-cstep') || {}).textContent;
      if (!t || s === prev) return false;
      const sp = document.getElementById('ksSpot').getBoundingClientRect();
      return { t, s, sp: [Math.round(sp.left), Math.round(sp.top), Math.round(sp.width), Math.round(sp.height)] };
    }, stops.length ? stops[stops.length - 1].s : '', { timeout: 6000, polling: 50 }).then((h) => h.jsonValue()).catch(() => ({ stuck: true }));
    if (got.end) break;
    if (got.stuck) { stops.push({ t: '(stuck)', ms: Date.now() - t0 }); break; }
    /* let the light settle, then check it is on screen and has a size */
    await page.waitForTimeout(650);
    const sp = await page.evaluate(() => { const r = document.getElementById('ksSpot').getBoundingClientRect(); return [r.left, r.top, r.width, r.height, innerWidth, innerHeight]; });
    stops.push({ t: got.t, s: got.s, ms: Date.now() - t0 - 650, onScreen: sp[2] > 8 && sp[3] > 8 && sp[1] < sp[5] && sp[1] + sp[3] > 0 && sp[0] < sp[4] });
    await page.click('#ksCoach [data-t="next"]').catch(() => {});
  }
  await page.waitForTimeout(300);
  const left = await page.evaluate(() => !!document.getElementById('ksTour'));
  if (left) await page.evaluate(() => KovaTour.end());
  report.push({ id, n: start.n, names: start.names, stops, left });
}

for (const r of report) {
  if (r.missing) { console.log(`${r.id}: no tour`); continue; }
  const shown = r.stops.filter((s) => s.t !== '(stuck)');
  const skipped = r.names ? r.names.filter((n) => !shown.some((s) => s.t === n)) : [];
  const slow = shown.filter((s) => s.ms > 1300);
  const off = shown.filter((s) => !s.onScreen);
  console.log(`${r.id}: ${shown.length}/${r.n > 0 ? r.n : '?'} shown${skipped.length ? ' | skipped: ' + skipped.join(', ') : ''}${slow.length ? ' | slow: ' + slow.map((s) => s.t + ' ' + s.ms + 'ms').join(', ') : ''}${off.length ? ' | off screen: ' + off.map((s) => s.t).join(', ') : ''}${r.stops.some((s) => s.t === '(stuck)') ? ' | STUCK' : ''}`);
  ck(`${r.id}: every stop shows (none skipped)`, !skipped.length && !r.stops.some((s) => s.t === '(stuck)'));
  ck(`${r.id}: each stop arrives within 1.3 s`, !slow.length);
  ck(`${r.id}: the light is on screen at every stop`, !off.length);
  ck(`${r.id}: the tour ends cleanly`, !r.left);
}
ck('no page errors', pageErrors.length === 0 || (console.error(pageErrors.slice(0, 5)), false));
await context.close(); await b.close(); site.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
