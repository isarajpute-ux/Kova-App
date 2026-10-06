/* The AI team's Grok-style upgrades (p15), all real:
   the model router (per job, or pinned per employee) and the server
   honouring it; weekly step limits; the loop guard on hand-offs; stepping
   in (pause, change the next step, say something, hand back); the Chief
   of Staff running teammates in parallel; teach by showing (record what
   you do in Work OS, replay it, undo it); the bot's screen and Usage. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
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
const calls = []; let script = []; const crewBodies = [];
const reply = (j, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)) });
w.fetch = (u, o) => {
  u = String(u); calls.push([u, o]);
  if (/\/crew\/step$/.test(u)) { crewBodies.push(JSON.parse(o.body)); const next = script.shift(); return next ? reply(next) : reply({ error: 'no script' }, false, 500); }
  if (/\/assist\/email$/.test(u)) return reply({ ok: true });
  return reply({});
};
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));



const { cleanCrew } = require(__dirname + '/../functions/api.js');

(async () => {
  await wait(1900);
  const doc = w.document, C = w.KovaCrew, W = w.WorkOS, DAY = 864e5, sod = W.startOfDay();
  const FB = w.KOVA_FB; if (FB) { FB.ok = true; FB.auth = FB.auth || {}; FB.auth.currentUser = user; }
  const by = (t) => C.emps().filter((e) => e.title === t)[0];
  const pm = by('Project Manager'), an = by('Growth Analyst'), chief = by('Chief of Staff'), cs = by('Client Success');
  const done = async (j, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms && !/done|failed|stopped/.test(j.state)) await wait(30); return j; };
  const lastUser = (b) => b.messages.slice(-1)[0];

  // ---- the model router
  script = [{ content: [{ type: 'text', text: 'ok' }] }, { content: [{ type: 'text', text: 'ok' }] }];
  await done(C.start(C.emp(pm.id), 'Triage the overdue tasks', 'you'));
  await done(C.start(C.emp(an.id), 'How is the work going?', 'you'));
  ck('Auto sends quick triage to Haiku and analysis to Sonnet', crewBodies[0].model === 'haiku' && crewBodies[1].model === 'sonnet');
  W.update('agents', pm.id, { model: 'opus' }, 'user');
  script = [{ content: [{ type: 'text', text: 'ok' }] }];
  await done(C.start(C.emp(pm.id), 'Plan the quarter', 'you'));
  ck('a model pinned on an employee is the one used', crewBodies[2].model === 'opus');
  W.update('agents', pm.id, { model: 'auto' }, 'user');
  ck('the server keeps haiku, sonnet or opus and drops anything else', cleanCrew({ model: 'opus', messages: [{ role: 'user', content: 'x' }] }).model === 'opus'
    && cleanCrew({ model: 'gpt-9', messages: [{ role: 'user', content: 'x' }] }).model === '');
  ck('every think is counted against the week, by model', C.use().steps[pm.id] === 2 && C.use().models.haiku === 1 && C.use().models.opus === 1);

  // ---- weekly limit
  const u = C.use(); u.steps[cs.id] = 150; w.localStorage.setItem('kova.crew.use.v1', JSON.stringify(u));
  const n0 = crewBodies.length;
  const lim = await done(C.start(C.emp(cs.id), 'Draft my follow-ups', 'you'));
  ck('at the weekly limit a job stops without thinking, and says why', crewBodies.length === n0 && lim.state === 'done' && /150 steps/.test(lim.say));
  u.steps[cs.id] = 0; w.localStorage.setItem('kova.crew.use.v1', JSON.stringify(u));

  // ---- the loop guard
  const a1 = C.start(C.emp(pm.id), 'x', 'handoff'); a1.state = 'done';
  const a2 = C.start(C.emp(an.id), 'y', 'handoff', { parent: a1.id }); a2.state = 'done';
  const back = C.start(C.emp(pm.id), 'z', 'handoff', { parent: a2.id });
  ck('a hand-off that comes back to the same employee is stopped, and logged', back === null && C.use().loops === 1 && a2.steps.some((s) => /Loop stopped/.test(s.t)));

  // ---- stepping in: pause, change the next step, say something, hand back
  script = [{ content: [{ type: 'tool_use', id: 's1', name: 'create_task', input: { name: 'Call the printer', priority: 'Medium', due: 'tomorrow' } }] },
    { content: [{ type: 'text', text: 'Done.' }] }];
  const f0 = w.fetch; w.fetch = (u2, o2) => new Promise((ok) => setTimeout(() => ok(f0(u2, o2)), 200));
  const sj = C.start(C.emp(pm.id), 'Chase the printer', 'you');
  await wait(100); C.pause(sj.id); await wait(250); w.fetch = f0;
  ck('Step in pauses the job before it acts: the next step waits', sj.state === 'paused' && sj.queue.length === 1 && !W.list('items').some((i) => i.name === 'Call the printer'));
  doc.getElementById('s-workteam').classList.add('on'); C._S.view = 'team'; C._S.nav = 'team'; C._S.tab = pm.id; C.paint(); await wait(60);
  const scr = doc.querySelector('.crw-scr.paused');
  ck('the bot\'s screen shows it paused, the next step, and fields to change it', !!scr && /Next/.test(scr.textContent) && /Call the printer/.test(scr.textContent) && !!scr.querySelector('.crw-edit input[data-f="name"]'));
  C.tell(sj.id, 'Make it urgent please'); await wait(120);
  doc.querySelector('.crw-scr.paused .crw-edit input[data-f="name"]').value = 'Call the printer today';
  doc.querySelector('[data-c="resume"]').click();
  await done(sj);
  ck('Hand it back runs the step with your change', W.list('items').some((i) => i.name === 'Call the printer today') && !W.list('items').some((i) => i.name === 'Call the printer'));
  const tb = crewBodies[crewBodies.length - 1];
  ck('what you said reaches it with the next step\'s results', lastUser(tb).content.some((c) => c.type === 'text' && /Make it urgent please/.test(c.text)));

  // ---- parallel: the Chief of Staff runs two teammates at once
  const nP = crewBodies.length;
  script = [{ content: [{ type: 'tool_use', id: 'd1', name: 'delegate', input: { jobs: [{ to: 'Leo', job: 'List what is late' }, { to: 'Maya', job: 'Give me the numbers' }] } }] },
    { content: [{ type: 'text', text: 'Late: the invoice.' }] }, { content: [{ type: 'text', text: 'Numbers: 3 done.' }] },
    { content: [{ type: 'text', text: 'Here is the brief.' }] }];
  const cj = await done(C.start(C.emp(chief.id), 'Brief me with the team', 'you'), 5000);
  ck('only the Chief of Staff has the delegate tool', crewBodies[nP].tools.some((t) => t.name === 'delegate') && !crewBodies[0].tools.some((t) => t.name === 'delegate'));
  const res = (crewBodies[crewBodies.length - 1] && lastUser(crewBodies[crewBodies.length - 1]).content[0].content) || '';
  ck('both teammates worked in parallel and the Chief got both results', cj.state === 'done' && /Late: the invoice/.test(res) && /Numbers: 3 done/.test(res) && C.use().parallel === 1);

  // ---- teach by showing
  C.teachStart(C.emp(cs.id));
  ck('teaching shows a recording bar', !!doc.getElementById('crwTeach') && /Teaching/.test(doc.getElementById('crwTeach').textContent));
  const it = W.create('items', { name: 'Send the weekly invoice', priority: 'High', status: 'Not Started', due: sod + 2 * DAY, checklist: [] }, 'user');
  W.update('items', it.id, { status: 'In Progress' }, 'user');
  W.create('items', { name: 'Not me', status: 'Not Started', checklist: [] }, 'Leo');
  C.teachDone();
  const taught = C.emp(cs.id).taught;
  ck('it records your steps (not the team\'s), with dates kept relative', taught && taught.steps.length === 2 && taught.steps[0].tool === 'create_task' && taught.steps[0].input.due === '+2d' && taught.steps[1].input.status === 'In Progress');
  W.remove('items', it.id, 'user');
  const tj = await done(C.runTaught(C.emp(cs.id), 'you'), 4000);
  const made = W.list('items').filter((i) => i.name === 'Send the weekly invoice');
  ck('Do it now replays the steps through the employee\'s own tools', tj.state === 'done' && made.length === 1 && made[0].status === 'In Progress' && made[0].priority === 'High');
  ck('…and the replay can be undone', C.undo(tj.id) >= 1 && !W.list('items').some((i) => i.name === 'Send the weekly invoice'));

  // ---- Usage
  C._S.view = 'team'; C._S.nav = 'usage'; C.paint(); await wait(40);
  const pg = doc.getElementById('s-workteam').textContent;
  ck('Usage shows each week\'s steps against the limit, the model mix, the guards and what each one can touch', /Usage and limits/.test(pg) && /Which model did the thinking/.test(pg) && /What each one can touch/.test(pg) && /Loops stopped/.test(pg));

  ck('no errors', errors.length === 0 || (console.error(errors.slice(0, 3)), false));
  const failed = R.filter((r) => !r[1]);
  R.forEach((r) => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})();
