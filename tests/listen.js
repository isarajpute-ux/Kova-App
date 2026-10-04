/* p10: call an AI employee by name, fill-in options on the hire form, and
   tours that wait for the real element instead of a fixed pause. */
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
const recs = [];
class FakeSR { constructor() { recs.push(this); this.started = false; this.aborted = false; } start() { this.started = true; } abort() { this.aborted = true; this.started = false; } stop() { this.started = false; } }
w.webkitSpeechRecognition = FakeSR;
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));



(async () => {
  await wait(2200);
  const doc = w.document, L = w.KovaListen, C = w.KovaCrew;
  const say = (t, fin) => { const r = recs[recs.length - 1]; r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: !!fin })] }); };
  ck('listening is off until you turn it on', L && L.on() === false && recs.length === 0);
  ck('names are found anywhere in a sentence', L.find('good evening maya').e.n === 'Maya' && L.find('hey Leo can you help').e.n === 'Leo' && !L.find('nothing to see here'));
  ck('the job is the words after the name', L.request('Hey Maya, can you write the weekly report', 'maya') === 'Can you write the weekly report');
  ck('a greeting alone is not a job', L.request('Good morning Maya', 'maya') === '' && L.request('Maya hello', 'maya') === '');

  w.go('workteam'); await wait(100);
  const sw = doc.querySelector('#wtmBody [data-c="listen"]');
  ck('the AI team screen has the "Call them by name" switch', !!sw && /Call them by name/.test(doc.querySelector('.crw-listen').textContent));
  sw.click(); await wait(50);
  const rec = recs[recs.length - 1];
  ck('turning it on starts continuous listening', L.on() && rec && rec.started && rec.continuous === true && rec.interimResults === true);
  ck('a "Listening" pill stays on screen', !!doc.getElementById('klPill') && /Listening for/.test(doc.getElementById('klPill').textContent));

  say('good evening maya', false); await wait(20);
  ck('saying the name pops the box up straight away', !!doc.getElementById('klPop') && /Maya/.test(doc.getElementById('klPop').textContent));
  say('good evening maya', true); await wait(20);
  ck('with only the name, Maya asks what you need', /What do you need/.test(doc.getElementById('klPop').textContent));
  const before = Object.keys(C.jobs()).length;
  say('how did the work go this week', true); await wait(50);
  ck('the next sentence becomes the job, with a countdown', /how did the work go this week/i.test(doc.querySelector('.kl2-job').textContent) && /Sending in 3/.test(doc.getElementById('klPop').textContent));
  await wait(3300);
  const j = Object.values(C.jobs()).filter((x) => x.source === 'voice').pop();
  ck('after 3 seconds it goes to Maya', Object.keys(C.jobs()).length === before + 1 && j && C.emp(j.emp).n === 'Maya' && /work go this week/i.test(j.text));
  ck('the box says she is on it, with a way to open her', /Maya is on it/.test(doc.getElementById('klPop').textContent));
  L.close(); await wait(300);

  say('hey leo triage my overdue tasks', true); await wait(30);
  ck('name and job in one breath: Leo’s box, job filled in', /Leo/.test(doc.querySelector('.kl2-h').textContent) && /Triage my overdue tasks/.test(doc.querySelector('.kl2-job').textContent));
  doc.querySelector('#klPop [data-k="close"]').click(); await wait(3400);
  ck('Cancel stops it being sent', !Object.values(C.jobs()).some((x) => x.source === 'voice' && /triage/i.test(x.text)));
  say('jade', true); await wait(30); doc.querySelector('#klPop [data-k="type"]').click(); await wait(20);
  const ta = doc.getElementById('klAsk'); ck('you can type instead', !!ta);
  ta.value = 'Draft a follow-up to Harper'; doc.querySelector('#klPop [data-k="send"]').click(); await wait(50);
  ck('typed jobs go too', Object.values(C.jobs()).some((x) => x.source === 'voice' && /Harper/.test(x.text)));
  L.close(); await wait(300);
  say('what is the weather like', true); await wait(30);
  ck('sentences without a name do nothing', !doc.getElementById('klPop'));
  const leo = C.emps().find((e) => e.n === 'Leo'); w.WorkOS.update('agents', leo.id, { enabled: false }, 'user');
  say('leo are you there', true); await wait(30);
  ck('a switched-off employee is not called', !doc.getElementById('klPop'));
  w.WorkOS.update('agents', leo.id, { enabled: true }, 'user');

  doc.dispatchEvent(Object.assign(new w.Event('visibilitychange'))); Object.defineProperty(doc, 'hidden', { value: true, configurable: true }); doc.dispatchEvent(new w.Event('visibilitychange'));
  ck('it stops listening when Kova is in the background', rec.aborted === true);
  Object.defineProperty(doc, 'hidden', { value: false, configurable: true }); doc.dispatchEvent(new w.Event('visibilitychange')); await wait(20);
  ck('and starts again when you come back', recs[recs.length - 1].started === true);
  doc.getElementById('klPill').click(); await wait(20);
  ck('tapping the pill turns it off', L.on() === false && !doc.getElementById('klPill'));
  L.set(true); await wait(20); recs[recs.length - 1].onerror({ error: 'not-allowed' }); await wait(20);
  ck('a refused microphone turns it off and says why', L.on() === false && /permission was refused/.test(doc.querySelector('.crw-listen').textContent));
  ck('the choice is remembered', JSON.parse(w.localStorage.getItem('kova.listen.v1')).on === false);

  // fill-in options on the hire form
  C._S.view = 'hire'; C.paint(); await wait(20);
  doc.querySelector('#wtmBody [data-c="tpl"][data-t=""]').click(); await wait(20);
  const txt = doc.getElementById('wtmBody').textContent;
  ck('blank form offers name, title, job, rule and step suggestions (in menus)', /Names not on your team yet/.test(txt) && /Roles with a built-in skill/.test(txt) && /Start like a role/.test(txt) && /Add a rule/.test(txt) && /Add a step/.test(txt));
  doc.querySelector('[data-c="fill"][data-t="crwT"][data-v="Social Media Manager"]').click(); await wait(20);
  ck('picking a title fills it, and a matching job when the job is empty', doc.getElementById('crwT').value === 'Social Media Manager' && /social accounts/.test(doc.getElementById('crwJ').value));
  doc.querySelector('[data-c="fill"][data-t="crwJ"][data-m="append"]').click(); await wait(20);
  ck('"Add a rule" appends to the job', /social accounts[\s\S]*without your OK/.test(doc.getElementById('crwJ').value));
  const steps = [...doc.querySelectorAll('[data-c="fill"][data-t="crwP"]')];
  steps[0].click(); await wait(20); doc.querySelectorAll('[data-c="fill"][data-t="crwP"]')[3].click(); await wait(20);
  ck('"Add a step" numbers the playbook', doc.getElementById('crwP').value === '1. Read the work first.\n2. Draft it, then wait for my approval.');
  doc.querySelector('[data-c="fill"][data-t="crwN"]').click(); await wait(20);
  ck('name ideas skip names already on the team', doc.getElementById('crwN').value && !['Ava', 'Leo', 'Maya', 'Jade'].includes(doc.getElementById('crwN').value));

  // tours: wait for the element, skip what is not there
  const T = w.KovaTour; let done = false;
  T.run([{ t: 'A', d: 'a', el: () => doc.querySelector('#s-fuel .card') }, { t: 'Gone', d: 'x', el: () => null }, { t: 'C', d: 'c', el: () => doc.querySelector('#microGrid') }], { done: () => { done = true; } });
  await wait(60);
  ck('a tour step shows at once when its element is there', /A/.test(doc.getElementById('ksCoach').textContent) && /1 \/ 3/.test(doc.getElementById('ksCoach').textContent));
  doc.querySelector('#ksCoach [data-t="next"]').click(); await wait(1700);
  for (let i = 0; i < 20 && !/3 \/ 3/.test((doc.getElementById('ksCoach') || {}).textContent || ''); i++) await wait(100);   // slower under a busy machine
  ck('a step whose element is missing is skipped, not left blank', /3 \/ 3/.test(doc.getElementById('ksCoach').textContent));
  doc.querySelector('#ksCoach [data-t="next"]').click(); await wait(30);
  ck('the tour ends cleanly', done && !doc.getElementById('ksTour'));
  let reached = [];
  w.KovaScreenTour.run('move'); await wait(80);
  for (let i = 0; i < 12 && doc.getElementById('ksTour'); i++) { reached.push(doc.querySelector('.screen.on').id + ':' + doc.querySelector('#ksCoach .ks-ct').textContent); doc.querySelector('#ksCoach [data-t="next"]').click(); await wait(250); }
  ck('the Workout tour walks every stop, moving to Customize for the plan steps', reached.length >= 8 && reached.some((r) => r.indexOf('s-customize:') === 0) && reached[0].indexOf('s-move:') === 0);
  ck('the home tour ends at the orb, not the removed chat button', /#kgOrb/.test(html) && !/'Ask Kova','Questions about your data, any time\.','#kovaFab'/.test(html));

  let p = 0, f = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? p++ : f++; });
  console.log('\n' + p + '/' + (p + f) + ' passing');
  if (errors.length) { console.log('runtime errors: ' + errors.length); errors.slice(0, 6).forEach((e) => console.log('  ' + e)); }
  process.exit(f || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
