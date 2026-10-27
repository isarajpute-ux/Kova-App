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
  ck('the cycle screen is drawn when it opens, not at start', sec() && !sec().children.length);
  w.go('vitals'); await wait(80);
  const sum = d.getElementById('kcSum');
  ck('Vitals has a Cycle & fertility section with a way in', !!sum && /Cycle & fertility/.test(sum.closest('.vsec').textContent) && /Start tracking/.test(sum.textContent));
  sum.querySelector('[data-go="cycle"]').click(); await wait(80);
  ck('it opens the cycle\'s own screen, s-cycle, in Vitals\' colours', d.getElementById('s-cycle').classList.contains('on') && !!sec().closest('#s-cycle') && d.getElementById('app').getAttribute('data-pillar') === 'vitals' && /Cycle/.test(d.querySelector('#s-cycle .title-s').textContent));
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
  ck('anything that opens "cycle" (Today\'s card, search, old links) lands on the cycle screen', d.getElementById('s-cycle').classList.contains('on') && sec().querySelectorAll('.kcx-calc,.kcx-prof,.kcx-tips').length === 3);
  w.go('vitals'); await wait(30);
  ck('Vitals sums it up: day, phase and next period, with Open Cycle', /Day:/.test(d.getElementById('kcSum').textContent) && /Next period:/.test(d.getElementById('kcSum').textContent) && /Open Cycle/.test(d.getElementById('kcSum').textContent));
  w.go('cycle'); await wait(30); w.goBack(); await wait(30);
  ck('Back from the cycle screen returns to Vitals', d.getElementById('s-vitals').classList.contains('on'));
  K._set({ on: true, days: { [key(sod() - 3 * DAY)]: true }, sym: { [key(sod() - DAY)]: ['cramps', 'tender', 'cravings'] } });
  const w2 = boot({ kova_cycle_v1: JSON.stringify({ on: true, days: { [key(sod() - 3 * DAY)]: true }, sym: { [key(sod() - DAY)]: ['cramps', 'tender', 'cravings'] }, temp: {} }), 'kova.sex': JSON.stringify('female') });
  await wait(900);
  const s2 = w2.KovaCycle._data().sev[key(sod() - DAY)];
  ck('the old one-tap symptoms carry over (tender becomes breast pain, cravings appetite)', s2 && s2.cramps === 2 && s2.breast === 2 && s2.appetite === 2 && w2.KovaCycle.today().day === 4);

  // a new phone: the synced copy arrives after the page loaded
  const w4 = boot({ 'kova.sex': JSON.stringify('female') });
  await wait(900);
  const synced = { on: true, sync: true, saved: Date.now(), flow: { [key(sod() - 6 * DAY)]: 'med', [key(sod() - 5 * DAY)]: 'heavy' }, days: {}, sev: {}, temp: {} };
  w4.KP.set('cycle', synced); w4.dispatchEvent(new w4.Event('kova:cloud')); await wait(60);
  ck('with cycle sync on, the copy from your account lands on a new phone without a reload', Object.keys(w4.KovaCycle._data().flow).length === 2 && w4.KovaCycle.today().day === 7);
  w4.KP.set('cycle', Object.assign({}, synced, { saved: 1, flow: {} })); w4.dispatchEvent(new w4.Event('kova:cloud')); await wait(30);
  ck('an older copy from the account never overwrites newer data here', Object.keys(w4.KovaCycle._data().flow).length === 2);
  w4.KP.set('cycle', null); w4.dispatchEvent(new w4.Event('kova:cloud'));
  ck('with sync off nothing comes from the account', Object.keys(w4.KovaCycle._data().flow).length === 2);

  // p45: a month you can tap, the next 3 periods, this phase's tips
  w2.go('cycle'); await wait(60);
  const d2 = w2.document, sec2 = () => d2.getElementById('kcSec');
  const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const days = () => [...sec2().querySelectorAll('.kcx-cd')];
  ck('the calendar shows every day of this month', days().length === dim && sec2().querySelector('.kcx-calh b').textContent.includes(now.toLocaleDateString('en-US', { month: 'long' })));
  ck('days still to come cannot be marked', days().filter((b) => b.disabled).length === dim - now.getDate());
  ck('every day says what it is to a screen reader', days().every((b) => /\d/.test(b.getAttribute('aria-label') || '')));
  const tk = key(sod());
  sec2().querySelector('[data-d="' + tk + '"]').click(); await wait(20);
  ck('tapping today marks a period day (and it is saved)', w2.KovaCycle._data().flow[tk] === 'med' && /"med"/.test(w2.localStorage.getItem('kova_cycle_v1')) && sec2().querySelector('[data-d="' + tk + '"]').classList.contains('p'));
  sec2().querySelector('[data-d="' + tk + '"]').click(); await wait(20);
  ck('tapping it again clears it', !w2.KovaCycle._data().flow[tk]);
  const np = w2.KovaCycle.nextPeriods(3), st3 = sod() - 3 * DAY;
  ck('the next 3 periods are predicted, a cycle apart', np.length === 3 && Math.round((np[0].a - st3) / DAY) === 28 && Math.round((np[2].a - np[1].a) / DAY) === 28);
  const sd = new Date(st3 + DAY / 2), want = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() + 28).getTime();
  ck('predicted days land on midnight, also across a clock change (TZ=America/New_York in late October)', np.every((p) => new Date(p.a).getHours() === 0) && np[0].a === want && new Date(w2.KovaCycle.today().next).getHours() === 0);
  ck('they are listed under the calendar', /Next 3 periods/.test(sec2().textContent) && sec2().querySelectorAll('.kcx-next b').length === 1);
  const lbl = () => sec2().querySelector('.kcx-calh b').textContent;
  const m0 = lbl(); sec2().querySelector('[data-k="calm"][data-v="1"]').click(); await wait(20);
  const nm = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  ck('Next month moves the calendar on, with the expected period on it', lbl() !== m0 && lbl().includes(nm.toLocaleDateString('en-US', { month: 'long' })) && sec2().querySelectorAll('.kcx-cd.pp').length >= 1);
  sec2().querySelector('[data-k="calm"][data-v="-1"]').click(); await wait(20);
  ck('Previous month comes back', lbl() === m0);
  const tips = sec2().querySelector('.kcx-tips');
  ck('this phase says what it means for training, recovery and food', tips && tips.textContent.includes(w2.KovaCycle.PHASE[w2.KovaCycle.today().phase].n + ': for you now') && tips.querySelectorAll('.kcx-tip').length === 3 && /^Train/.test(tips.querySelector('.kcx-tip').textContent));
  ck('the tips are short (12 words or fewer)', [...tips.querySelectorAll('.kcx-tip span')].every((x) => x.textContent.trim().split(/\s+/).length <= 12));

  // a man
  const w3 = boot({ 'kova.sex': JSON.stringify('male') });
  await wait(900);
  ck('a man sees no cycle section in Vitals', !w3.document.querySelector('.kcx-vsec'));

  const css = fs.readFileSync(__dirname + '/../src/p08_cycle.css', 'utf8');
  ck('three appearances are styled', /body\.soft-light \.kcx/.test(css) && /body\.light-mode \.kcx/.test(css));
  ck('no page errors', errors.length === 0 || (console.error(errors.slice(0, 5)), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
