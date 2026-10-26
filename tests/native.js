/* The native app bridge (p10): with a Capacitor shell and the Health plugin
   present, Kova asks for read-only access from a button, turns HealthKit /
   Health Connect samples into KovaHealth fields, logs the night for the
   "How it connects" cards, gives wrist temperature as a deviation, and
   feeds heart rate to the workout HUD. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
const user = { uid: 'u1', getIdToken: () => Promise.resolve('t') };
w.firebase = {
  initializeApp() {}, apps: [{}],
  auth: () => ({ currentUser: user, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() }),
  database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
    remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
  storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} }),
  functions: () => ({ httpsCallable: () => () => Promise.resolve({ data: { text: '' } }) })
};
const calls = [];
const FOODS = { foods: [{ id: 1, n: 'Spinach, raw', type: 'SR Legacy', kcal: 23, p: 2.9, c: 3.6, f: 0.4, m: { fib: 2.2, na: 79, k: 558, ca: 99, fe: 2.7, mg: 79, c: 28.1, d: 0, b12: 0, fol: 194 } }] };
w.fetch = (u, o) => { calls.push([String(u), o]); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(/foods\/search/.test(u) ? FOODS : {}) }); };
const NOW = Date.now(), iso = (t) => new Date(t).toISOString(), H = 3600e3;
const SAMPLES = {
  sleep: [
    { value: 1, sleepState: 'rem', startDate: iso(NOW - 3 * H), endDate: iso(NOW - 2 * H) },
    { value: 1, sleepState: 'deep', startDate: iso(NOW - 5 * H), endDate: iso(NOW - 4 * H) },
    { value: 1, sleepState: 'light', startDate: iso(NOW - 8 * H), endDate: iso(NOW - 5 * H) },
    { value: 1, sleepState: 'light', startDate: iso(NOW - 4 * H), endDate: iso(NOW - 3 * H) },
    { value: 1, sleepState: 'awake', startDate: iso(NOW - 2 * H - 600e3), endDate: iso(NOW - 2 * H) }],
  heartRateVariability: [{ value: 48 }, { value: 52 }],
  restingHeartRate: [{ value: 54.4 }],
  steps: [{ value: 3000 }, { value: 1200 }],
  oxygenSaturation: [{ value: 0.97 }],
  appleSleepingWristTemperature: [{ value: 36.4 }, { value: 36.1 }, { value: 36.1 }, { value: 36.1 }],
  heartRate: [{ value: 131, endDate: iso(NOW) }]
};
const asked = [];
w.Capacitor = { isNativePlatform: () => true, registerPlugin: () => ({
  isAvailable: () => Promise.resolve({ available: true, platform: 'ios' }),
  requestAuthorization: (o) => { asked.push(o); return Promise.resolve({ readAuthorized: o.read }); },
  readSamples: (o) => Promise.resolve({ samples: SAMPLES[o.dataType] || [] })
}) };
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));



(async () => {
  await wait(900);
  const doc = w.document, N = w.KovaNative;
  ck('the bridge sees the app shell', N && N.isNative() === true && doc.documentElement.classList.contains('is-native'));
  ck('nothing is requested on launch', asked.length === 0);
  const card = doc.getElementById('knCard');
  ck('a quiet Apple Health card sits on Vitals', !!card && /Apple Health/.test(card.textContent) && /Read only/i.test(card.textContent));
  // the reason comes before the system dialog; "Not now" asks nothing
  const pNo = N.connect().then(() => 'connected', (e) => (e && e.skipped ? 'skipped' : 'error'));
  await wait(60);
  const why = doc.querySelector('#sheetIn .kpv');
  ck('an explanation sheet comes before the Health prompt', !!why && /Before you connect/.test(why.textContent) && /never writes/i.test(why.textContent) && asked.length === 0);
  ck('it lists what is read and why', why && why.querySelectorAll('.kpv-row').length >= 8 && /not sent to analytics/i.test(why.textContent));
  why.querySelector('[data-kp="no"]').click();
  ck('"Not now" asks the system for nothing', (await pNo) === 'skipped' && asked.length === 0);
  const pGo = N.connect();
  await wait(60);
  doc.querySelector('#sheetIn .kpv [data-kp="go"]').click();
  const r = await pGo;
  ck('it asks for read access only', asked.length === 1 && asked[0].write.length === 0 && asked[0].read.includes('sleep') && asked[0].read.includes('heartRateVariability'));
  const f = w.KovaHealth.all().f;
  ck('sleep minutes exclude awake time (6h)', f.sleep === '6h 0m' && f.deep === 60 && f.rem === 60 && f.core === 240 && f.awake === 10);
  ck('HRV, resting HR, steps, SpO2 map to Kova fields', f.hrv === 50 && f.hr === 54 && f.steps === 4200 && f.spo2 === 97);
  ck('wrist temperature is a deviation from recent nights', f.temp === '+0.3°C');
  ck('the source is Apple Health', f.device === 'Apple Health' && w.KovaHealth.all().src === 'healthkit');
  const log = JSON.parse(w.localStorage.getItem('kova_sleeplog_v1') || '{}');
  const night = Object.values(log).find((n) => n.src === 'health');
  ck('the night lands in the sleep log', night && night.mins === 360 && /a$|p$/.test(night.bed));
  ck('connect reports how many fields arrived', r.fields >= 8);
  N._hrLoop(true); await wait(30);
  ck('during a workout heart rate reaches the HUD', w.KovaHR.bpm() === 131);
  N._hrLoop(false);
  ck('KovaHR knows live HR comes from the app', w.KovaHR.supported() === false && N.hasLiveHR() === true);

  let p = 0, fl = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? p++ : fl++; });
  console.log('\n' + p + '/' + (p + fl) + ' passing');
  if (errors.length) { console.log('runtime errors: ' + errors.length); errors.slice(0, 6).forEach((e) => console.log('  ' + e)); }
  process.exit(fl || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
