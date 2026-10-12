/* The AI team answers anything, about your body too (p25):
     - Henry (Nutrition Coach) and Luna (Sleep Coach) are on the team;
     - every teammate can read your health (read_health) and is told to
       answer any question, not only their own area;
     - without AI they still answer sleep and food questions from your
       own numbers, and say exactly why AI is off;
     - a missing calorie target is said, never invented;
     - "hey Henry ..." by voice keeps the box open and shows the answer. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: new VirtualConsole() });
const w = dom.window;
const user = { uid: 'u1', getIdToken: () => Promise.resolve('t') };
w.firebase = {
  initializeApp() {}, apps: [{}],
  auth: () => ({ currentUser: user, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() }),
  database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
    remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
  storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} })
};
/* the server is up but has no Claude key: what the live site says today */
let crewCalls = 0;
w.fetch = (u) => {
  if (/\/crew\/step/.test(String(u))) { crewCalls++; return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({ error: 'AI employees need the Kova server’s Claude key.' }) }); }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
};
const recs = [];
class FakeSR { constructor() { recs.push(this); } start() { this.started = true; } abort() { this.started = false; } stop() {} }
w.webkitSpeechRecognition = FakeSR;
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(2200);
  const C = w.KovaCrew, L = w.KovaListen, doc = w.document;
  const by = (t) => C.emps().filter((e) => e.tpl === t)[0];
  const henry = by('nutrition'), luna = by('sleep'), ava = by('chief');
  ck('Henry the Nutrition Coach and Luna the Sleep Coach are on the team', henry && henry.n === 'Henry' && henry.title === 'Nutrition Coach' && luna && luna.n === 'Luna' && luna.title === 'Sleep Coach');
  ck('every teammate can read your health, not just the coaches', C.emps().every((e) => C.toolsFor(e).indexOf('read_health') >= 0));
  const sys = C.system(ava);
  ck('the brief says: answer whatever is asked, never "I only handle one area"', /Answer whatever the user asks you/.test(sys) && /Never say you only handle one area/.test(sys));
  ck('and it carries your health: the nights and the food target (or that there is none)', /YOUR HEALTH \(from Kova\)/.test(sys) && /Sleep, last \d+ nights/.test(sys) && /(No personal calorie target yet|Daily target)/.test(sys));
  ck('a question gets a direct answer, a report only for real work', /A question gets a direct answer/.test(sys));
  const h = C.health();
  ck('read_health returns the nights with stages, bedtime and onset, labelled as example data in sample mode', h.nights >= 3 && h.sleep[0].asleep_min > 0 && 'onset_min' in h.sleep[0] && 'bedtime' in h.sleep[0] && /example data/.test(h.source));

  /* without AI: Ava is asked about sleep */
  const j1 = C.start(C.emp(ava.id), 'How is my sleep? Everything in one summary, and what makes it bad', 'you');
  for (let i = 0; i < 40 && j1.state === 'running'; i++) await wait(50);
  ck('the server was tried first', crewCalls >= 1);
  ck('Ava answers the sleep question herself, from the nights (no hand-off, no work report)', j1.state === 'done' && j1.report && j1.report.title === 'Sleep summary' && !(j1.after && j1.after.length));
  ck('the summary has the averages: hours, score, onset, deep, REM, bedtime', j1.report.metrics.length === 6 && /Asleep/.test(j1.report.metrics[0].label) && j1.report.charts.length === 2);
  const txt = j1.report.sections.map((s) => s.heading + ' ' + s.text).join(' ');
  ck('it names what is hurting sleep and tonight’s wind-down: phone away, a book, lights low, a cool room', /What is hurting your sleep/.test(txt) && /Phone out of the bedroom/.test(txt) && /paper book/.test(txt) && /18 °C/.test(txt));
  ck('it says it answered without AI, and why: the server has no Claude key', /without AI \(AI employees need the Kova server.s Claude key/.test(j1.say));

  const j2 = C.start(C.emp(luna.id), 'Why do I have dark circles?', 'you');
  for (let i = 0; i < 40 && j2.state === 'running'; i++) await wait(50);
  ck('dark circles: the answer covers it, with when to see a doctor', j2.report && j2.report.sections.some((s) => /Dark circles/.test(s.heading) && /doctor/.test(s.text)));

  /* Henry, with no calorie target set */
  const j3 = C.start(C.emp(henry.id), 'How is my daily intake of calories and what can I do to bulk up?', 'you');
  for (let i = 0; i < 40 && j3.state === 'running'; i++) await wait(50);
  ck('no target set: Henry says so and how to set one, without inventing a number', j3.report && /no calorie target/i.test(j3.report.summary) && /Find my maintenance/.test(j3.report.summary) && !j3.report.metrics.some((m) => /Bulk target/.test(m.label)));
  /* with a target from "Find my maintenance" */
  w.__fuelTargets = () => ({ kcal: 2600, p: 170, c: 290, f: 80, base: { src: 'calc' } });
  w.KovaFuel.totals = () => ({ kcal: 1400, p: 90, c: 150, f: 50 });
  const j4 = C.start(C.emp(henry.id), 'hey Henry how is my daily intake calories and what can I do to bulk up', 'you');
  for (let i = 0; i < 40 && j4.state === 'running'; i++) await wait(50);
  const m4 = j4.report && j4.report.metrics;
  ck('with a target: eaten vs a bulking number 300 over maintenance', m4 && m4[0].value === '1400' && m4[1].label === 'Bulk target' && m4[1].value === '2900');
  ck('and what to do: calories and protein left, what to eat, and to lift', /1500 kcal and 80 g protein/.test(j4.report.sections[0].text) && /peanut butter/.test(j4.report.sections[0].text) && /weights/.test(j4.report.sections[0].text));

  /* by voice */
  L.set(true); await wait(50);
  const rec = recs[recs.length - 1];
  const say = (t, fin) => rec.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: !!fin })] });
  say('hey Henry how are my calories today and how do I bulk up', true); await wait(50);
  ck('"hey Henry ..." opens Henry’s box with the question', /Henry/.test(doc.getElementById('klPop').textContent) && /calories today/i.test(doc.getElementById('klPop').textContent));
  for (let i = 0; i < 60 && !/Ask Henry more/.test((doc.getElementById('klPop') || {}).textContent || ''); i++) await wait(100);
  const pop = (doc.getElementById('klPop') || {}).textContent || '';
  ck('the answer shows in the box: Food check, the numbers', /Food check/.test(pop) && /2900/.test(pop) && /Bulk target/.test(pop));
  await wait(5600);
  ck('and the box stays until you close it', !!doc.getElementById('klPop') && /Ask Henry more/.test(doc.getElementById('klPop').textContent));
  doc.querySelector('#klPop [data-k="again"]').click(); await wait(30);
  ck('"Ask Henry more" opens a box to type the next question', !!doc.getElementById('klAsk'));
  L.close(); L.set(false);

  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
