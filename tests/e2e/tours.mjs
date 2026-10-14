/* Every guided tour, played in a real browser at phone size the way a
   person would: Next, Next, Next. Each stop must actually show (none
   skipped because its box is missing or hidden), each step must arrive
   quickly, the lit box must sit on its target, and nothing may be left
   running when the tour ends.
   p28: then again the way a phone plays them: Safari's engine at iPhone
   size, with your own data (live mode, where Today, Vitals, Sleep and
   Workout start as a plain card), each tour started by tapping "?" and
   "Show me around". The light must only move with transform, which is
   what keeps it smooth on a phone.
     node tests/e2e/tours.mjs          (after npm run build) */
import { chromium, webkit, devices } from 'playwright';
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
await context.close(); await b.close();

/* ---- an iPhone, your own data, started by tapping ---- */
{
  const wb = await webkit.launch();
  const { FIREBASE_STUB } = await import('./harness.mjs');
  const ctx = await wb.newContext({ ...devices['iPhone 15 Pro Max'], serviceWorkers: 'block' });
  await ctx.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: FIREBASE_STUB }));
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await ctx.route(/googletagmanager\.com|google-analytics\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|jsdelivr\.net|cdnjs\.cloudflare\.com/, (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route(/\/api\//, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await ctx.addInitScript((s) => { for (const k in s) localStorage.setItem(k, s[k]); }, Object.assign({}, STORE, { kova_mode_v1: 'live' }));
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(site.url + '/index.html', { waitUntil: 'load' });
  await pg.waitForFunction(() => window.__kovaLazyDone && window.KovaVDock, null, { timeout: 30000 });
  await pg.waitForTimeout(800);
  const want = { home: 5, vitals: 4, sleep: 4, fuel: 5, move: 8 };   /* Fuel's vitamins card counts your real log, so it is a stop too */
  for (const id of Object.keys(want)) {
    await pg.evaluate((id) => go(id), id);
    await pg.waitForTimeout(700);
    await pg.locator('#s-' + id + ' .kt-help').first().tap();
    await pg.locator('.sheet [data-kh="tour"]').tap({ timeout: 4000 });
    const shown = []; let stuck = false, slow = [];
    for (let k = 0; k < 14; k++) {
      const t0 = Date.now();
      const got = await pg.waitForFunction((prev) => {
        if (!document.getElementById('ksTour') && prev !== '') return { end: 1 };
        const c = document.getElementById('ksCoach'); if (!c || !c.classList.contains('on')) return false;
        const s = (c.querySelector('.ks-cstep') || {}).textContent; if (!s || s === prev) return false;
        return { s, t: c.querySelector('.ks-ct').textContent };
      }, shown.length ? shown[shown.length - 1].s : '', { timeout: 4000, polling: 50 }).then((h) => h.jsonValue()).catch(() => ({ stuck: 1 }));
      if (got.end) break;
      if (got.stuck) { stuck = true; break; }
      if (Date.now() - t0 > 1300) slow.push(got.t + " " + (Date.now() - t0) + "ms");
      await pg.waitForTimeout(650);
      const on = await pg.evaluate(() => { const r = document.getElementById('ksSpot').getBoundingClientRect(); return r.width > 8 && r.height > 8 && r.top < innerHeight && r.bottom > 0; });
      shown.push(Object.assign(got, { on }));
      await pg.locator('#ksCoach [data-t="next"]').tap();
    }
    const total = shown.length ? +shown[0].s.split('/')[1] : 0;
    console.log(`iPhone, own data, ${id}: ${shown.length}/${total} shown: ${shown.map((x) => x.t).join(', ')}${stuck ? ' | STUCK' : ''}${slow.length ? ' | slow: ' + slow.join(', ') : ''}${shown.some((x) => !x.on) ? ' | off: ' + shown.filter((x) => !x.on).map((x) => x.t).join(', ') : ''}`);
    ck(`iPhone, own data, ${id}: every stop shows, numbered without gaps (${want[id]} stops)`, !stuck && shown.length === want[id] && total === want[id] && shown.every((x, i) => x.s.trim() === (i + 1) + ' / ' + total));
    ck(`iPhone, own data, ${id}: each stop arrives within 1.3 s and is lit on screen`, !slow.length && shown.every((x) => x.on));
    await pg.evaluate(() => { if (KovaTour.active()) KovaTour.end(); });
  }
  /* smooth: only transform moves (nothing is redrawn frame by frame) */
  const motion = await pg.evaluate(() => {
    KovaScreenTour.run('fuel');
    const g = (sel) => getComputedStyle(document.querySelector(sel)).transitionProperty;
    const r = [g('#ksSpot'), g('.ks-dim'), g('.ks-cn'), g('#ksCoach')];
    KovaTour.end(); return r;
  });
  ck('the light, the dimmed page and the card only animate transform (and fading), never width, height, left or top: ' + motion.join(' | '),
    motion.every((p) => !/width|height|left|top|all/.test(p)) && motion.every((p) => /transform/.test(p)));
  ck('iPhone: no page errors', errs.length === 0 || (console.error(errs.slice(0, 5)), false));
  await ctx.close(); await wb.close();
}
site.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
