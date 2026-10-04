/* Every AI employee, every way they work (Work OS > Your team):
     - all nine roles can be hired and each has a working tab;
     - on the Kova server, every role uses every one of its tools (the model
       is scripted to call them all), approvals pause and resume the job,
       hand-offs reach the teammate, and no tool ever throws;
     - with no server and no key, every role's every "Run it now" skill
       finishes on the device with a result;
     - the Run button on each employee's tab starts their job;
     - calling an employee by name finds them;
     - undo removes what a job created.
   tests/crew.js covers the details of each of these; this covers breadth. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const vc = new VirtualConsole(); const pageErrors = []; vc.on('jsdomError', (e) => pageErrors.push(e.message));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
const user = { uid: 'u1', getIdToken: () => Promise.resolve('t') };
w.firebase = { initializeApp() {}, apps: [{}],
  auth: () => ({ currentUser: user, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() }),
  database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
    remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
  analytics: () => ({ logEvent() {}, setUserId() {} }) };

/* a scripted model: the first turn calls every tool the employee was given,
   the second ends the job. A handed-over job just answers. */
let names = [], projectName = '', T = 0;
function inputFor(tool) {
  const s = tool.input_schema || {}, p = s.properties || {}, req = s.required || [], out = {};
  for (const k of Object.keys(p)) {
    const d = p[k] || {}, optional = req.indexOf(k) < 0;
    if (optional && !/^(filter|to|job|title|summary|text|name)$/.test(k)) continue;
    if (d.enum) { out[k] = d.enum[0]; continue; }
    if (d.type === 'number' || d.type === 'integer') { out[k] = 1; continue; }
    if (d.type === 'array') { out[k] = k === 'metrics' ? [{ label: 'Done', value: '3' }] : []; continue; }
    if (d.type === 'object') { out[k] = {}; continue; }
    if (d.type === 'boolean') { out[k] = false; continue; }
    out[k] = /^(to)$/.test(k) && tool.name === 'hand_off' ? 'Leo'
      : k === 'to' ? 'client@example.com'
      : /task|item|name/.test(k) && /assign|update|complete|move|set|reschedule/.test(tool.name) ? names[0]
      : /project/.test(k) ? projectName
      : /due|date|when/.test(k) ? 'tomorrow'
      : k === 'job' ? 'HANDED: check the overdue list'
      : 'Test ' + k;
  }
  return out;
}
const reply = (j, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)) });
const called = {};
w.fetch = (u, o) => {
  u = String(u);
  if (/\/crew\/step$/.test(u)) {
    const b = JSON.parse(o.body), first = b.messages.length === 1, text = JSON.stringify(b.messages[0].content);
    if (/HANDED/.test(text)) return reply({ content: [{ type: 'text', text: 'Handled the hand-over.' }], stop_reason: 'end_turn' });
    if (first) return reply({ content: [{ type: 'text', text: 'Using every tool.' }].concat(b.tools.filter((t) => t.name && t.input_schema).map((t) => {
      called[t.name] = (called[t.name] || 0) + 1;
      return { type: 'tool_use', id: 'tu' + (++T), name: t.name, input: inputFor(t) };
    })), stop_reason: 'tool_use' });
    return reply({ content: [{ type: 'text', text: 'All done.' }], stop_reason: 'end_turn' });
  }
  if (/\/assist\/email$/.test(u)) return reply({ ok: true, sent: true });
  return reply({});
};
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

async function settle(C, job, ms) {
  const end = Date.now() + (ms || 8000);
  while (Date.now() < end) {
    if (job.state === 'waiting') C.approve(job.id);
    if (job.state === 'done' || job.state === 'failed' || job.state === 'stopped') return job.state;
    await wait(40);
  }
  return job.state;
}

(async () => {
  await wait(1900);
  const doc = w.document, C = w.KovaCrew, W = w.WorkOS, DAY = 864e5, now = Date.now(), sod = W.startOfDay();
  /* work to do */
  W.list('items').forEach((i) => W.remove('items', i.id, 'system'));
  const mk = (o) => W.create('items', Object.assign({ status: 'Not Started', priority: 'Medium', checklist: [] }, o), 'system');
  mk({ name: 'Invoice Harper for March', priority: 'High', due: sod - 5 * DAY, created: now - 12 * DAY });
  mk({ name: 'Reply to the Lumen lead', priority: 'Low', due: sod - 2 * DAY, created: now - 6 * DAY });
  mk({ name: 'Waiting on the printer quote', status: 'Waiting', created: now - 8 * DAY });
  mk({ name: 'Prep for the Monday client call', due: sod + DAY, created: now - DAY });
  mk({ name: 'Ship the pricing page', status: 'Completed', created: now - 9 * DAY, due: sod - DAY, completedAt: now - 2 * DAY });
  const pr = W.create('projects', { name: 'Spring launch', status: 'Active' }, 'system'); projectName = pr.name;
  try { W.create('goals', { name: 'Monthly revenue', target: 10000, current: 4200, unit: '$', created: now - 10 * DAY, deadline: now + 20 * DAY }, 'system'); } catch (e) {}
  try { W.create('meetings', { name: 'Harper check-in', at: now - DAY }, 'system'); } catch (e) {}
  names = W.list('items').filter((i) => i.status !== 'Completed').map((i) => i.name);

  /* catch any tool that throws, however it is called */
  const threw = [];
  Object.keys(C.TOOLS).forEach((k) => { const T0 = C.TOOLS[k], run = T0.run; T0.run = function () { try { return run.apply(this, arguments); } catch (e) { threw.push(k + ': ' + e.message); throw e; } }; });

  // ---------- all nine roles ----------
  const have = C.emps().map((e) => e.tpl);
  C.TPL.forEach((t) => { if (have.indexOf(t.id) < 0) C.hire(t, null, true); });
  const team = C.emps();
  ck('all nine roles are on the team (' + team.map((e) => e.n).join(', ') + ')', team.length === 9 && C.TPL.every((t) => team.some((e) => e.tpl === t.id)));

  // ---------- on the server: every role, every tool ----------
  const FB = w.KOVA_FB; FB.ok = true; FB.auth = FB.auth || {}; FB.auth.currentUser = user;
  ck('signed in, the team thinks with the Kova server', C.brain() === 'server');
  const bad = [];
  for (const e of team) {
    const tools = C.toolsFor(e);
    const job = C.start(C.emp(e.id), 'Do your whole job for this test, ' + e.n, 'you');
    const st = await settle(C, job, 10000);
    const errs = (job.steps || []).filter((s) => s.k === 'error').map((s) => s.t);
    if (st !== 'done') bad.push(e.n + ' ended ' + st + (job.note ? ' (' + job.note + ')' : ''));
    if (!tools.length) bad.push(e.n + ' has no tools');
    if (errs.some((t) => /is not a function|undefined|null|Cannot read/i.test(t))) bad.push(e.n + ': ' + errs.join('; '));
  }
  await wait(300);
  const all = Object.keys(C.TOOLS).filter((k) => team.some((e) => C.toolsFor(e).indexOf(k) >= 0));
  ck('every role finished a full job on the server, using all of its tools', bad.length === 0 || (console.error(bad), false));
  ck('every tool the team has was used (' + Object.keys(called).length + ' of ' + all.length + ')', all.every((k) => called[k]));
  ck('no tool threw an error', threw.length === 0 || (console.error(threw), false));
  ck('approvals paused the jobs that send email, and approving finished them', Object.values(C.jobs()).some((j) => (j.steps || []).some((s) => /approved/i.test(s.t))));
  ck('a hand-off reached the teammate and they finished it', Object.values(C.jobs()).some((j) => j.source === 'handoff' && j.state === 'done'));

  // ---------- on the device: every role's every "Run it now" ----------
  FB.auth.currentUser = null; FB.ok = false;
  ck('signed out, the team works on this device', C.brain() === 'local');
  const offline = [];
  let runs = 0;
  for (const e of team) {
    for (const sk of C.skillsOf(e)) {
      const q = C.RUN_JOB[sk]; if (!q) continue;
      runs++;
      const job = C.start(C.emp(e.id), q, 'you');
      const st = await settle(C, job, 6000);
      const out = job.report || job.say || '';
      if (st !== 'done' || !out) offline.push(e.n + ' / ' + sk + ': ' + st + ' ' + (job.note || ''));
    }
  }
  ck('offline, every role’s every skill (' + runs + ' runs) finishes with a result', runs >= 9 && (offline.length === 0 || (console.error(offline), false)));

  // ---------- the Run button on every tab ----------
  doc.getElementById('s-workteam').classList.add('on');
  const noBtn = [];
  for (const e of team) {
    C._S.view = 'team'; C._S.nav = 'team'; C._S.tab = e.id; C.paint(); await wait(20);
    const btn = doc.querySelector('#s-workteam [data-c="run"][data-id="' + e.id + '"]');
    const before = C.jobsOf(e.id).length;
    if (!btn) { noBtn.push(e.n + ': no button'); continue; }
    btn.click(); await wait(60);
    if (C.jobsOf(e.id).length !== before + 1) noBtn.push(e.n + ': no job started');
  }
  ck('each employee’s tab has a Run button that starts their job', noBtn.length === 0 || (console.error(noBtn), false));
  for (const j of Object.values(C.jobs())) await settle(C, j, 4000);

  // ---------- by name, and undo ----------
  const L = w.KovaListen;
  ck('calling an employee by name finds them ("Noah, chase my late invoices")', L && L.find && (L.find('Noah, chase my late invoices') || {}).e && L.find('Noah, chase my late invoices').e.n === 'Noah');
  const made = Object.values(C.jobs()).filter((j) => (j.changes || []).some((c) => c.created));
  const j0 = made[0];
  const count0 = W.list('items').length, n = j0 ? C.undo(j0.id) : 0;
  ck('undo removes what a job created', j0 && n > 0 && W.list('items').length < count0);
  if (process.env.SHOW) Object.values(C.jobs()).forEach((j) => (j.steps || []).filter((s) => s.k === 'error' || s.k === 'blocked').forEach((s) => console.log('  step', C.emp(j.emp) && C.emp(j.emp).n, s.k, s.t)));
  ck('no page errors along the way', pageErrors.length === 0 || (console.error(pageErrors.slice(0, 5)), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
