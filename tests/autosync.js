/* Automatic sync with Health Auto Export (p28):
     - a real Health Auto Export send (Export Version 2, Summarize Data on,
       Time Grouping Day) is read the same way by the server and the app:
       last night's sleep, today's steps, the newest resting HR and HRV;
     - with Summarize Data off, sleep arrives as stages: the asleep stages
       of last night are added up, awake and in-bed time are not, and a
       sleep app writing over the watch is not counted twice;
     - "Get my sync address" needs a real sign-in (it used to say "Could
       not reach the Kova server" when you were signed out);
     - the address is copied inside the tap (Safari refuses a copy after
       a wait), a new one replaces the old, and the setup steps show;
     - "Sync now" pulls what the server holds into the app. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { clean } = require('../functions/health');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function boot() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova_mode_v1', 'live');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document };
}
const tz = ' -0700';
const summarized = { data: { metrics: [
  { name: 'sleep_analysis', units: 'hr', data: [
    { date: '2026-10-12 00:00:00' + tz, totalSleep: 6.5, core: 3.5, deep: 1, rem: 2, sleepStart: '2026-10-11 23:40:00' + tz, sleepEnd: '2026-10-12 06:40:00' + tz, inBed: 7, source: 'Apple Watch' },
    { date: '2026-10-13 00:00:00' + tz, totalSleep: 7.2, core: 4.1, deep: 1.2, rem: 1.9, sleepStart: '2026-10-12 23:10:00' + tz, sleepEnd: '2026-10-13 06:40:00' + tz, inBed: 7.5, source: 'Apple Watch' }] },
  { name: 'resting_heart_rate', units: 'count/min', data: [{ date: '2026-10-12 00:00:00' + tz, qty: 57 }, { date: '2026-10-13 00:00:00' + tz, qty: 54 }] },
  { name: 'heart_rate_variability', units: 'ms', data: [{ date: '2026-10-12 00:00:00' + tz, qty: 48 }, { date: '2026-10-13 00:00:00' + tz, qty: 61.37 }] },
  { name: 'step_count', units: 'count', data: [{ date: '2026-10-12 00:00:00' + tz, qty: 11234 }, { date: '2026-10-13 00:00:00' + tz, qty: 4321.6 }] },
  { name: 'active_energy', units: 'kcal', data: [{ date: '2026-10-13 00:00:00' + tz, qty: 388.4 }] },
  { name: 'apple_exercise_time', units: 'min', data: [{ date: '2026-10-13 00:00:00' + tz, qty: 22 }] },
  { name: 'heart_rate', units: 'count/min', data: [{ date: '2026-10-13 00:00:00' + tz, Min: 48, Avg: 71, Max: 140 }] }
] } };
const seg = (v, a, b, src) => ({ startDate: a + tz, endDate: b + tz, value: v, qty: 0, source: src || 'Apple Watch' });
const staged = { data: { metrics: [
  { name: 'sleep_analysis', units: 'hr', data: [
    seg('Core', '2026-10-11 23:30:00', '2026-10-12 06:30:00'),                 /* the night before: not counted */
    seg('In Bed', '2026-10-12 22:45:00', '2026-10-13 06:45:00'),               /* in bed is not asleep */
    seg('Core', '2026-10-12 23:00:00', '2026-10-13 01:00:00'),
    seg('Deep', '2026-10-13 01:00:00', '2026-10-13 02:00:00'),
    seg('Awake', '2026-10-13 02:00:00', '2026-10-13 02:15:00'),
    seg('REM', '2026-10-13 02:15:00', '2026-10-13 04:00:00'),
    seg('Core', '2026-10-13 04:00:00', '2026-10-13 06:30:00'),
    seg('Asleep', '2026-10-12 23:30:00', '2026-10-13 01:30:00', 'AutoSleep')  /* inside the watch's stages: counted once */
  ] },
  { name: 'step_count', units: 'count', data: [
    { startDate: '2026-10-12 20:00:00' + tz, endDate: '2026-10-12 20:30:00' + tz, qty: 900 },
    { startDate: '2026-10-13 08:00:00' + tz, endDate: '2026-10-13 08:30:00' + tz, qty: 500 },
    { startDate: '2026-10-13 09:00:00' + tz, endDate: '2026-10-13 09:30:00' + tz, qty: 700 }] }
] } };

(async () => {
  /* the server */
  const s1 = clean(summarized);
  ck('server, summarized: sleep 7.2 h = 432 min, HR 54, HRV 61.4, steps 4,322 today, energy 388, exercise 22',
    s1.sleep === '432' && s1.hr === 54 && s1.hrv === 61.4 && s1.steps === 4322 && s1.energy === 388 && s1.exercise === 22);
  ck('server, summarized: plain heart rate is not mistaken for resting HR', s1.hr === 54);
  const s2 = clean(staged);
  ck('server, stages: last night = 3 h + 4 h 15 = 435 min (no awake, no in bed, no night before, no double count)', s2.sleep === '435');
  ck('server, single samples: today’s steps only (500 + 700)', s2.steps === 1200);

  /* the app reads both the same way */
  const A = boot();
  await wait(400);
  const KH = A.w.KovaHealth;
  const c1 = KH.normalizeHAE(summarized), c2 = KH.normalizeHAE(staged);
  ck('app, summarized: the same numbers as the server', c1.sleep === s1.sleep && c1.hr === s1.hr && c1.hrv === s1.hrv && c1.steps === s1.steps && c1.energy === s1.energy);
  ck('app, stages: the same 435 min and 1,200 steps', c2.sleep === '435' && c2.steps === 1200);

  /* the button */
  const toast = () => { const t = A.doc.querySelectorAll('.kova-sync-toast'); return t.length ? t[t.length - 1].textContent : ''; };
  const tap = async (act) => { const b = A.doc.querySelector('.sheet .syncbtn[data-act="' + act + '"]'); if (b) b.click(); await wait(80); return !!b; };
  let opened = null; A.w.KovaCloudAuth.open = (o) => { opened = o; };
  const urls = []; const U1 = 'https://kovactive.vercel.app/api/health/' + 'a'.repeat(32), U2 = 'https://kovactive.vercel.app/api/health/' + 'b'.repeat(32);
  A.w.KovaLink.healthUrl = (rot) => { urls.push(!!rot); return new Promise((r) => setTimeout(() => { const u = rot ? U2 : U1; KH.relay(u); r(u); }, 30)); };
  let copied = null, wrote = null, writeAt = -1, prompted = null;
  A.w.prompt = (m, v) => { prompted = v; };
  A.w.__watchSetup(); await wait(100);
  ck('the sheet says it needs Health Auto Export Premium, free for 7 days', /Premium \(free for 7 days\)/.test(A.doc.getElementById('kovaAdvWrap').textContent));
  await tap('relay');
  ck('signed out: it asks you to sign in instead of blaming the server', /Sign in first/.test(toast()) && opened && opened.mode === 'in' && !urls.length);

  A.w.KovaCloudAuth.status = () => ({ signedIn: true, anon: false });
  /* Safari: a ClipboardItem handed over inside the tap, filled when the server answers */
  Object.defineProperty(A.w.navigator, 'clipboard', { configurable: true, value: {
    write: (items) => { writeAt = urls.length; wrote = items[0].o['text/plain']; return wrote.then(() => {}); },
    writeText: (t) => { copied = t; return Promise.resolve(); } } });
  A.w.ClipboardItem = function (o) { this.o = o; };
  const t0 = Date.now();
  A.w.__watchSetup(); await wait(100);
  await tap('relay'); await wait(120);
  const blob = wrote && await wrote;
  ck('signed in, first time: the copy is handed to the phone during the tap, before the server answers', writeAt === 1 && blob && blob.size === U1.length && Date.now() - t0 > 30);
  ck('and it says it was copied, no box to copy from', /Sync address copied/.test(toast()) && prompted === null);
  const adv = () => A.doc.getElementById('kovaAdvWrap');
  ck('the section stays open and shows the exact Health Auto Export settings', adv() && adv().classList.contains('open') &&
    /REST API/.test(adv().textContent) && /Summarize Data on/.test(adv().textContent) && /Time Grouping Day/.test(adv().textContent) &&
    /Date Range Today/.test(adv().textContent) && /every 1 hour/.test(adv().textContent) && /Manual Export/.test(adv().textContent));
  ck('your address is shown, with Sync now and a way to make a new one', adv().textContent.indexOf(U1) > -1 && A.doc.querySelector('.sheet [data-act="pull"]') && A.doc.querySelector('.sheet [data-act="relaynew"]'));
  await tap('relay');
  ck('later taps copy the saved address at once, no server trip', copied === U1 && urls.length === 1);

  A.w.confirm = () => false;
  await tap('relaynew');
  ck('a new address asks first', urls.length === 1);
  A.w.confirm = () => true;
  await tap('relaynew'); await wait(120);
  ck('a new address replaces the old one and is copied', urls[1] === true && KH.relay() === U2 && wrote && (await wrote).size === U2.length && /New address copied/.test(toast()));

  /* Sync now pulls what the server holds */
  A.w.fetch = (u) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(u === U2 ? { hr: 54, hrv: 61.4, sleep: '432', steps: 4322, ts: Date.now() - 120000 } : {}) });
  await tap('pull'); await wait(80);
  ck('Sync now brings the readings in, aged from when the watch sent them', KH.get('hr') === 54 && KH.sleepMinutes() === 432 && KH.ageText() === '2m ago' && /Synced 4 fields/.test(toast()));

  /* toasts stay readable in light mode */
  ck('the toast text is white on its dark pill in every look', /background:rgba\(20,20,22,\.94\);color:#FFFFFF/.test(html));

  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
