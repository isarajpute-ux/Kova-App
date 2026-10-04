/* Hearing & noise (src/p08_noise.js): the NIOSH maths, A-weighting, a
   day's dose, the alert after a minute at 85 dB or more, the workout
   summary, the Vitals section laid out like the record card, the chip in
   a workout, and an honest message where there is no microphone. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(900);
  const d = w.document, N = w.KovaNoise;

  ck('85 dB is safe for 8 hours, every 3 dB louder halves it (88: 4 h, 100: 15 min)', N.safeMins(85) === 480 && N.safeMins(88) === 240 && Math.round(N.safeMins(100)) === 15 && N.safeMins(70) === Infinity);
  ck('A-weighting: 0 at 1 kHz, about -19 dB at 100 Hz, about -2.5 dB at 10 kHz', Math.abs(N.aWeight(1000)) < 0.1 && Math.abs(N.aWeight(100) + 19.1) < 0.3 && Math.abs(N.aWeight(10000) + 2.5) < 0.3);

  // a minute and a half at 91 dB
  N._S.on = true;
  for (let i = 0; i < 59; i++) N._tick(91, 1);
  ck('no alert in the first minute', !d.querySelector('#knAlert.on'));
  for (let i = 0; i < 31; i++) N._tick(91, 1);
  const al = d.getElementById('knAlert');
  ck('after a minute at 85 dB or more, an alert: how loud, safe for how long, what to do', !!al && al.classList.contains('on') && /~91 dB/.test(al.textContent) && /Safe for:2 h/.test(al.textContent.replace(/\s+/g, ' ')) && /Earplugs/.test(al.textContent));
  const dose = N._D().days[Object.keys(N._D().days)[0]].dose;
  ck('the day’s dose adds up the NIOSH way (90 s at 91 dB is about 1.25%)', Math.abs(dose - 1.25) < 0.05);
  al.querySelector('[data-n="mute"]').click(); await wait(10);
  ck('"Quiet for 1 h" closes it', !al.classList.contains('on'));
  const sm = N.summary(Date.now() - 5 * 60e3);
  ck('a workout gets average, peak and minutes over 85', sm && sm.avg === 91 && sm.max === 91 && sm.loudMin === 2 && sm.est === true);
  ck('the session log saves it with the workout', /noise:\(window\.KovaNoise&&KovaNoise\.summary\)\?KovaNoise\.summary\(/.test(html));

  // Vitals
  N.paint(); await wait(10);
  const sec = d.getElementById('knSec');
  ck('Vitals has a Hearing & noise section', !!sec && /Hearing & noise/.test(sec.closest('.vsec').textContent));
  ck('laid out like the record card: a Record row, then Now / Safe for / Level, exposure and trend, hearing risk', /Record:\s*Loud spells this week/.test(sec.textContent) && /Now:/.test(sec.textContent) && /Safe for:/.test(sec.textContent) && /Level:/.test(sec.textContent) && /Exposure and trend/.test(sec.textContent) && !!sec.querySelector('.kn-dash') && /Hearing risk/.test(sec.textContent));
  ck('it says the reading is an estimate until calibrated, and that nothing is recorded', /estimate ±5–10 dB/.test(sec.textContent) && /nothing is recorded, kept or sent/.test(sec.textContent));
  N._S.db = 91; N._D().cal = null;
  ck('calibrating against a meter sets the offset', N.calibrate(80) && N._D().cal != null && Math.round(N._S.db) === 80);

  // a workout
  w.go('session'); await wait(80);
  d.body.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(80);
  ck('in a workout, a chip under the heart rate offers to listen', !!d.getElementById('knChip'));

  // no microphone in this browser
  N.stop(); await N.start('manual'); N.paint();
  ck('without a microphone it says so instead of failing quietly', /cannot measure sound/.test(d.getElementById('knSec').textContent));

  const css = fs.readFileSync(__dirname + '/../src/p08_noise.css', 'utf8');
  ck('three appearances are styled, and motion stops when reduced', /body\.soft-light \.knx/.test(css) && /body\.light-mode \.knx/.test(css) && /prefers-reduced-motion/.test(css));
  ck('no page errors', errors.length === 0 || (console.error(errors.slice(0, 5)), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
