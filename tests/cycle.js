/* Cycle and fertility, a section of Vitals (src/p08_cycle.js):
     - it lives inside Vitals (no page of its own; old links land there);
     - symptoms are grouped, one graph card per group, and a group opens
       to every symptom of it on one graph;
     - "Log today" logs flow, every symptom (none/mild/moderate/severe),
       mucus, LH, basal temperature, sexual activity and tests;
     - predictions say how sure they are: calendar, LH test, temperature;
       hormonal birth control hides the fertile window, pregnancy pauses;
     - patterns ("cramps the day before your period") need two cycles;
     - irregular, infrequent, prolonged and spotting are flagged, and the
       report for a doctor has cycles, flags, symptoms and tests;
     - a man sees no cycle section; the old one-tap symptoms carry over. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;
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
const key = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const sod = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
/* periods that started `agos` days ago, `plen` days each */
function periods(agos, plen) { const f = {}; agos.forEach((a) => { for (let i = 0; i < (plen || 5) && a - i >= 0; i++) f[key(sod() - (a - i) * DAY)] = i < 2 ? 'heavy' : 'med'; }); return f; }

(async () => {
  // ---------- a woman who tracks ----------
  const w = boot({ 'kova.sex': JSON.stringify('female') });
  await wait(900);
  const d = w.document, K = w.KovaCycle;
  const sec = () => d.getElementById('kcSec');
  ck('there is no separate cycle page: it is a section of Vitals', !d.getElementById('s-cycle') && !!sec() && !!sec().closest('#s-vitals') && /Cycle & fertility/.test(sec().closest('.vsec').textContent));
  ck('before tracking: one card that asks when the last period started', /When did your last period start/.test(sec().textContent) && !!d.getElementById('kcxStart'));
  d.getElementById('kcxStart').value = key(sod() - 30 * DAY);
  sec().querySelector('[data-k="start"]').click(); await wait(30);
  ck('saving it turns tracking on and shows the cycle profile', K._data().on && /Cycle profile/.test(sec().textContent) && /Day:31/.test(sec().textContent.replace(/\s+/g, '')));

  // three regular cycles, symptoms the day before each period
  const flow = periods([86, 58, 30, 2]);
  const sev = {};
  [86, 58, 30, 2].forEach((a) => { sev[key(sod() - (a + 1) * DAY)] = { cramps: 2, bloating: 1 }; sev[key(sod() - a * DAY)] = { cramps: 3, back: 2 }; });
  K._set({ on: true, flow, sev, days: {} });
  await wait(20);
  let t = K.today();
  ck('a 28-day average from the logged cycles, day 3, period phase', t.stats.avg === 28 && t.stats.cycles === 3 && t.day === 3 && t.phase === 'menstrual');
  ck('the fertile window is the 5 days before ovulation and the day of it (calendar estimate)', t.method === 'calendar' && Math.round((t.fertile[1] - t.fertile[0]) / DAY) === 5 && Math.round((t.next - t.ov) / DAY) === 14);
  ck('and it says it is a calendar estimate', /Calendar estimate, from 3 cycles/.test(sec().textContent));
  ck('the profile shows this cycle as a dashed line with period, fertile window, ovulation and today', !!sec().querySelector('.kcx-dash i.p') && !!sec().querySelector('.kcx-dash i.fw') && !!sec().querySelector('.kcx-dash i.ov') && !!sec().querySelector('.kcx-dash i.now'));

  // grouped graphs
  const cards = [...sec().querySelectorAll('.kcx-g')];
  ck('one graph card per group: Pain, Digestion, Mood & energy, Skin & hair, Hot & cold, Other', cards.map((c) => c.querySelector('.kcx-gh').textContent.trim()).join('|') === 'Pain|Digestion|Mood & energy|Skin & hair|Hot & cold|Other');
  ck('each card has a dot plot of past cycles against the usual, this cycle ringed', cards.every((c) => !!c.querySelector('svg.kcx-dp')) && !!cards[0].querySelector('.kcx-dp .rg'));
  ck('Pain counts the days with any pain this cycle (the day before belongs to the last one)', /^1/.test(cards[0].querySelector('.kcx-gv').textContent.trim()));
  cards[0].click(); await wait(20);
  const det = sec().querySelector('.kcx-det');
  ck('opening Pain puts every pain on one graph: five rows, one column a cycle day', !!det && det.querySelectorAll('.kcx-hr:not(.ax)').length === 5 && det.querySelectorAll('.kcx-hr:not(.ax)')[0].querySelectorAll('.kcx-hc i').length >= 28 && !!det.querySelector('.kcx-hc i.s3'));

  // patterns and the heads-up
  const pt = K.patterns();
  ck('patterns need two cycles and come from your own log: cramps the day before your period', pt.some((p) => p.id === 'cramps' && p.kind === 'before' && p.o === 1 && /day before your period/.test(p.t)));
  ck('lower back pain on day 1 of the period', pt.some((p) => p.id === 'back' && p.kind === 'during' && p.o === 1));

  // logging
  sec().querySelector('[data-k="log"]').click(); await wait(30);
  const sh = () => d.querySelector('#sheetIn .kcl');
  ck('Log today opens one sheet: period flow, grouped symptoms, fertility signs, tests', !!sh() && /Period/.test(sh().textContent) && sh().querySelectorAll('.kcl-tabs button').length === 6 && /Cervical mucus/.test(sh().textContent) && /Ovulation \(LH\) test/.test(sh().textContent) && /Basal body temperature/.test(sh().textContent) && /Pregnancy test/.test(sh().textContent) && /Progesterone/.test(sh().textContent));
  sh().querySelector('[data-l="tab"][data-v="gut"]').click(); await wait(10);
  sh().querySelector('[data-l="sev"][data-s="nausea"][data-v="3"]').click(); await wait(10);
  ck('a symptom is none, mild, moderate or severe, saved as you tap', K._data().sev[key(Date.now())].nausea === 3 && !!sh().querySelector('[data-s="nausea"][data-v="3"].on'));
  sh().querySelector('[data-l="mucus"][data-v="egg"]').click(); await wait(10);
  ck('egg-white mucus is saved', K._data().mucus[key(Date.now())] === 'egg');

  // LH then temperature
  const lhDay = key(sod() - 16 * DAY);
  K._set(Object.assign(K._data(), { flow: periods([86, 58, 30]), lh: { [lhDay]: 'pos' } }));
  t = K.today();
  ck('a positive LH test moves ovulation to the next day and says so', t.method === 'lh' && key(t.ov) === key(sod() - 15 * DAY) && /positive ovulation test/.test(sec().textContent));
  const bbt = {}; for (let i = 0; i < 12; i++) bbt[key(sod() - (24 - i) * DAY)] = i < 7 ? 36.4 + (i % 2) * 0.05 : 36.75;
  K._set(Object.assign(K._data(), { bbt }));
  t = K.today();
  ck('a sustained basal temperature rise confirms ovulation (after the fact)', t.method === 'temp' && t.confirmed && key(t.ov) === key(sod() - 18 * DAY) && /confirmed by temperature/.test(sec().textContent));

  // status
  K._set(Object.assign(K._data(), { lh: {}, bbt: {}, status: { preg: false, lact: false, contra: 'pill' } }));
  t = K.today();
  ck('on the pill: no fertile window, and it says why', t.hormonal && !sec().querySelector('.kcx-dash i.fw') && /Hormonal birth control: no fertile window shown/.test(sec().textContent));
  K._set(Object.assign(K._data(), { status: { preg: false, lact: false, contra: 'iudc' } }));
  ck('a copper IUD does not stop ovulation: the window is back', !K.today().hormonal && !!sec().querySelector('.kcx-dash i.fw'));
  K._set(Object.assign(K._data(), { status: { preg: true, lact: false, contra: 'none', pregAt: sod() - 20 * DAY } }));
  ck('pregnant: predictions paused', K.today().paused && /Pregnancy: predictions paused/.test(sec().textContent) && /Paused/.test(sec().textContent));

  // flags
  K._set({ on: true, flow: Object.assign(periods([120, 60, 40], 9), { [key(sod() - 50 * DAY)]: 'spot', [key(sod() - 49 * DAY)]: 'spot', [key(sod() - 48 * DAY)]: 'spot', [key(sod() - 47 * DAY)]: 'spot', [key(sod() - 46 * DAY)]: 'spot' }), sev: { [key(sod() - 3 * DAY)]: { pelvic: 3 }, [key(sod() - 4 * DAY)]: { pelvic: 3 } }, days: {} });
  const fl = K.flags().map((f) => f.k);
  ck('Kova flags infrequent periods, prolonged bleeding, persistent spotting and severe pelvic pain', ['infrequent', 'prolonged', 'spotting', 'pelvic'].every((k) => fl.includes(k)));
  const chk = sec().querySelector('.kcx-check');
  ck('...in a Cycle check card: Length, Bleeding, Spotting, Pain, with a risk chip', !!chk && /Worth a check|Tell your doctor/.test(chk.querySelector('.kcx-risk').textContent) && /Length/.test(chk.textContent) && /Prolonged/.test(chk.textContent) && /Persistent/.test(chk.textContent) && /Severe/.test(chk.textContent));
  ck('the dial card: three numbers, a curved Day / Fertile / Regular switch and a half dial', !!sec().querySelector('.kcx-s3') && sec().querySelectorAll('.kcx-arc button').length === 3 && !!sec().querySelector('.kcx-hd .nd'));
  sec().querySelector('.kcx-arc [data-v="reg"]').click(); await w.Promise.resolve();
  ck('Regular shows a tick ruler with how much the cycles vary', !!sec().querySelector('.kcx-ticks i.m') && /vary by \d+ days?/.test(sec().textContent));
  ck('the fertility curve: chance by day (Wilcox), pills, and a log button', !!sec().querySelector('.kcx-cv .ln') && /Wilcox 1995/.test(sec().textContent) && !!sec().querySelector('[data-k="logsigns"]'));
  const rep = K.reportHTML();
  ck('the report for a doctor has cycles, what is worth discussing, symptoms and the ranges it used', /Cycle summary/.test(rep) && /Cycles/.test(rep) && /Infrequent periods/.test(rep) && /Prolonged period/.test(rep) && /Pelvic pain/.test(rep) && /ACOG, FIGO/.test(rep));

  // old links and old data
  w.go('home'); await wait(10); w.go('cycle'); await wait(250);
  ck('anything that still opens "cycle" lands on Vitals, at the section', d.getElementById('s-vitals').classList.contains('on'));
  K._set({ on: true, days: { [key(sod() - 3 * DAY)]: true }, sym: { [key(sod() - DAY)]: ['cramps', 'tender', 'cravings'] } });
  const w2 = boot({ kova_cycle_v1: JSON.stringify({ on: true, days: { [key(sod() - 3 * DAY)]: true }, sym: { [key(sod() - DAY)]: ['cramps', 'tender', 'cravings'] }, temp: {} }), 'kova.sex': JSON.stringify('female') });
  await wait(900);
  const s2 = w2.KovaCycle._data().sev[key(sod() - DAY)];
  ck('the old one-tap symptoms carry over (tender becomes breast pain, cravings appetite)', s2 && s2.cramps === 2 && s2.breast === 2 && s2.appetite === 2 && w2.KovaCycle.today().day === 4);

  // a man
  const w3 = boot({ 'kova.sex': JSON.stringify('male') });
  await wait(900);
  ck('a man sees no cycle section in Vitals', !w3.document.getElementById('kcSec') && !w3.document.querySelector('.kcx-vsec'));

  const css = fs.readFileSync(__dirname + '/../src/p08_cycle.css', 'utf8');
  ck('three appearances are styled', /body\.soft-light \.kcx/.test(css) && /body\.light-mode \.kcx/.test(css));
  ck('no page errors', errors.length === 0 || (console.error(errors.slice(0, 5)), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
