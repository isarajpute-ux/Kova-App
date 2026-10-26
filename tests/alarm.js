/* KovaAlarm (src/p08_alarm.js): wakes at the lightest moment in the
   window from watch heart rate or movement, falls back to the latest time
   without data, rings with the app closed (local notification), and logs
   wake time and grogginess. App only; the website shows nothing. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60000;

function boot(nativeApp) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  const sched = [];
  if (nativeApp) {
    const LN = { requestPermissions: () => Promise.resolve({ display: 'granted' }), cancel: () => Promise.resolve(), schedule: (o) => { sched.push(o.notifications[0]); return Promise.resolve(); } };
    const Health = { isAvailable: () => Promise.resolve({ available: true, platform: 'ios' }), requestAuthorization: () => Promise.resolve({}), readSamples: () => Promise.resolve({ samples: [] }) };
    w.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', registerPlugin: (n) => (n === 'LocalNotifications' ? LN : n === 'Health' ? Health : null) };
  }
  w.localStorage.setItem('kova_mode_v1', 'live');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document, sched };
}

(async () => {
  const A = boot(false);
  await wait(500);
  const K = A.w.KovaAlarm;
  const latest = Date.UTC(2026, 8, 29, 13, 0), from = latest - 30 * MIN;
  const night = []; for (let t = from - 90 * MIN; t < from; t += 5 * MIN) night.push({ t, bpm: 52 + (t / MIN % 2) });
  ck('before the window it never rings', K.decide({ now: from - MIN, latest, window: 30, hr: night }).wake === false);
  ck('in the window, deeper sleep (steady heart rate) waits', K.decide({ now: from + 10 * MIN, latest, window: 30, hr: night.concat([{ t: from + 8 * MIN, bpm: 53 }]) }).wake === false);
  const up = K.decide({ now: from + 12 * MIN, latest, window: 30, hr: night.concat([{ t: from + 9 * MIN, bpm: 60 }, { t: from + 11 * MIN, bpm: 61 }]) });
  ck('a heart rate 6+ bpm over the night\'s baseline is a light moment: it rings', up.wake && up.why === 'heart rate rising');
  ck('moving in bed is a light moment too', K.decide({ now: from + 5 * MIN, latest, window: 30, hr: [], steps: [{ t: from + 4 * MIN, n: 12 }] }).why === 'movement');
  const none = K.decide({ now: from + 20 * MIN, latest, window: 30, hr: [] });
  ck('without watch data it waits for the latest time', none.wake === false && none.why === 'no data yet' && K.decide({ now: latest, latest, window: 30, hr: [] }).why === 'latest');
  ck('on the website there is no alarm row (a browser cannot wake a phone)', !A.doc.getElementById('kalRow'));

  const B = boot(true);
  await wait(500);
  const row = B.doc.getElementById('kalRow');
  ck('in the app, Sleep has one Smart alarm row, off by default', row && /Smart alarm/.test(row.textContent) && /Off/.test(row.textContent));
  const on = B.doc.getElementById('kalOn'); on.checked = true; on.dispatchEvent(new B.w.Event('change', { bubbles: true }));
  await wait(50);
  ck('turning it on schedules a real alarm at the latest time, which rings with Kova closed', B.sched.length === 1 && new Date(B.sched[0].schedule.at).getHours() === 7 && B.sched[0].schedule.allowWhileIdle === true);
  ck('the row says what happens without the phone on the charger', /Otherwise it rings at 07:00/.test(B.doc.getElementById('kalRow').textContent));
  B.w.KovaAlarm.fire('heart rate rising'); await wait(20);
  ck('when it fires, the morning question replaces the row', /How groggy did you wake/.test(B.doc.getElementById('kalRow').textContent));
  B.doc.querySelector('#kalRow [data-r="2"]').click(); await wait(10);
  const log = JSON.parse(B.w.localStorage.getItem('kova_sleeplog_v1'));
  const today = Object.keys(log).pop();
  ck('grogginess and wake time land in the sleep log', log[today].groggy === 2 && /^\d\d:\d\d$/.test(log[today].wake) && log[today].woke === 'heart rate rising');

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
