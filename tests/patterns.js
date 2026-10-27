/* Patterns Kova found (src/p08_patterns.js), on the workout summary:
     - volume after 7+ hours of sleep against after less, and with cycle
       tracking on, the follicular phase against the luteal;
     - only with 5 workouts on each side, else one line with the counts;
     - from your own log, and it says it is not cause and effect. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

function boot(store) {
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
  Object.keys(store || {}).forEach((k) => w.localStorage.setItem(k, store[k]));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}
const now = new Date();
const at = (daysAgo, h) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h || 18).getTime();
const key = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const sess = (daysAgo, vol) => ({ t: at(daysAgo), date: key(at(daysAgo)), day: 'Push', mins: 50, vol, hard: 10, mode: 'guided', ex: [] });
const card = (w) => w.document.querySelector('#sdBody .kpt');

(async () => {
  // ---------- no history yet ----------
  const w0 = boot({});
  await wait(900);
  w0.go('sessdone'); await wait(60);
  ck('the summary gets a Patterns Kova found card', !!card(w0) && /PATTERNS KOVA FOUND/.test(card(w0).textContent));
  ck('with too few workouts it says what it needs and how many there are, no numbers made up', /5 workouts after 7\+ hours of sleep and 5 after less\. So far: 0 and 0/.test(card(w0).textContent) && !card(w0).querySelector('.kpt-row'));

  // ---------- six good nights, six short ones ----------
  const log = [], sl = {};
  for (let i = 0; i < 12; i++) {
    const d = 2 + i * 2, good = i % 2 === 0;
    log.push(sess(d, good ? 12000 : 10000));
    sl[key(at(d))] = { mins: good ? 480 : 360, t: at(d, 7) };
  }
  const w1 = boot({ kova_log_v1: JSON.stringify(log), kova_sleeplog_v1: JSON.stringify(sl) });
  await wait(900);
  const P = w1.KovaPatterns.all(), s = P.filter((x) => x.id === 'sleep')[0];
  ck('it pairs each workout with the sleep that ended that morning (6 and 6)', s.n[0] === 6 && s.n[1] === 6);
  ck('the averages and the difference are right (12,000 vs 10,000: +20%)', s.r && s.r.a === 12000 && s.r.b === 10000 && s.r.pct === 20);
  w1.go('sessdone'); await wait(60);
  const c1 = card(w1);
  ck('the card shows the pattern: +20%, in plain words, with the counts', !!c1 && /\+20%/.test(c1.querySelector('[data-kpt="sleep"] .kpt-n').textContent) && /More volume after 7\+ hours of sleep/.test(c1.textContent) && /6 and 6 workouts/.test(c1.textContent));
  ck('and says it is not cause and effect', /not cause and effect/.test(c1.textContent));
  ck('no cycle line when cycle tracking is off', !c1.querySelector('[data-kpt="cycle"]'));
  w1.document.getElementById('sdBody').innerHTML = '<div class="card">redrawn</div>'; await wait(30);
  ck('drawn again when the summary redraws', !!card(w1));
  const w2 = boot({ kova_log_v1: JSON.stringify(log.slice(0, 9)), kova_sleeplog_v1: JSON.stringify(sl) });
  await wait(900);
  ck('4 short nights is not enough: no pattern yet', !w2.KovaPatterns.all()[0].r && w2.KovaPatterns.all()[0].n[1] === 4);

  // ---------- cycle: three 28-day cycles, follicular days stronger ----------
  const flow = {};
  [84, 56, 28].forEach((x) => { for (let k = 0; k < 5; k++) flow[key(at(x - k, 9))] = 'med'; });
  const clog = [];
  [84, 56, 28].forEach((x) => { clog.push(sess(x - 7, 11000), sess(x - 9, 11000), sess(x - 19, 10000), sess(x - 23, 10000)); });
  const w3 = boot({ kova_log_v1: JSON.stringify(clog), kova_cycle_v1: JSON.stringify({ on: true, flow, days: {} }), 'kova.sex': JSON.stringify('female') });
  await wait(900);
  const C = w3.KovaCycle;
  ck('the phase on a past day comes from the period start before it', w3.KovaPatterns.phaseAt(at(84 - 7), C) === 'follicular' && w3.KovaPatterns.phaseAt(at(84 - 19), C) === 'luteal' && w3.KovaPatterns.phaseAt(at(84 - 1), C) === 'menstrual');
  const cy = w3.KovaPatterns.all().filter((x) => x.id === 'cycle')[0];
  ck('with cycle tracking on: follicular against luteal (6 and 6, +10%)', cy && cy.n[0] === 6 && cy.n[1] === 6 && cy.r && cy.r.pct === 10);
  w3.go('sessdone'); await wait(60);
  ck('the cycle pattern is on the card', /More volume in your follicular phase than luteal/.test(card(w3).textContent) && /\+10%/.test(card(w3).textContent));

  const css = fs.readFileSync(__dirname + '/../src/p08_patterns.css', 'utf8');
  ck('styled with the app\'s own colours (works in all three looks)', /var\(--acc\)/.test(css) && /var\(--txt-2\)/.test(css) && !/#[0-9A-Fa-f]{6}/.test(css));
  ck('no page errors', errors.length === 0 || (console.error(errors.slice(0, 5)), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
