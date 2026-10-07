/* AI team routines while Kova is closed (functions/crew.js): the registry
   the app keeps, which routines are due in the person's time zone, the job
   done on the server against their synced Work OS with Claude (scripted
   here), changes PROPOSED not made, the inbox the app picks up, the push,
   the weekly budget, skipping what the open app already ran, the timer and
   worker wiring, and account deletion. */
const Module = require('module');
const path = require('path');

const store = {};
function get(p) {
  let o = store;
  for (const k of p.split('/').filter(Boolean)) { if (o == null || typeof o !== 'object') return null; o = o[k]; }
  return o === undefined ? null : JSON.parse(JSON.stringify(o));
}
function set(p, v) {
  const parts = p.split('/').filter(Boolean);
  let o = store;
  parts.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || !o[k]) o[k] = {}; o = o[k]; });
  if (v === null || v === undefined) delete o[parts[parts.length - 1]];
  else o[parts[parts.length - 1]] = JSON.parse(JSON.stringify(v));
}
function ref(p = '') {
  return {
    child: (c) => ref(p + '/' + c), once: async () => ({ val: () => get(p) }), set: async (v) => set(p, v), remove: async () => set(p, null),
    update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); },
    transaction: async (fn) => { const v = fn(get(p)); if (v !== undefined) set(p, v); return { committed: v !== undefined, snapshot: { val: () => get(p) } }; }
  };
}
const fakeDb = { ref };
Module._load = ((orig) => function (req, ...rest) {
  if (req === 'firebase-admin') return { initializeApp() {}, apps: [{}], database: () => fakeDb,
    auth: () => ({ verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad'); } }) };
  return orig.call(this, req, ...rest);
})(Module._load);

const FN = path.join(__dirname, '..', 'functions');
const C = require(path.join(FN, 'crew.js'));
const api = require(path.join(FN, 'api.js'));
const T = []; const ck = (n, c) => T.push([n, !!c]);
const DAY = 864e5;
function call(method, url, { body, token } = {}) {
  const headers = {}; if (token) headers.authorization = 'Bearer ' + token;
  const req = { method, path: url, body: body || {}, query: {}, ip: '1.2.3.4', get: (h) => headers[h.toLowerCase()] };
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, status(s) { this.statusCode = s; return this; }, set(k, v) { this.headers[k] = v; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); }, send(t) { resolve({ status: this.statusCode, body: t }); } };
    api.handle(req, res, { base: 'https://x.test/api', model: 'm' });
  });
}

(async () => {
  /* Monday 29 Sep 2026, 08:40 in New York (12:40 UTC): Ava's 08:30 brief is due */
  const NOW = Date.parse('2026-09-28T12:40:00Z') + DAY;
  const TZ = 'America/New_York';
  const sodNY = Date.parse('2026-09-29T04:00:00Z');
  const work = {
    items: [
      { id: 'i1', name: 'Invoice Harper for March', status: 'Not Started', priority: 'High', due: sodNY - 5 * DAY },
      { id: 'i2', name: 'Plan the April shoot', status: 'In Progress', priority: 'Medium', due: sodNY + 2 * 3600e3 },
      { id: 'i3', name: 'Record the demo', status: 'Completed', completedAt: NOW - 2 * DAY }
    ],
    projects: [{ id: 'p1', name: 'Spring launch' }], goals: [], meetings: [],
    agents: [
      { id: 'e_ava', crew: true, enabled: true, tpl: 'chief', n: 'Ava', title: 'Chief of Staff', job: 'I run the team.', tools: ['tasks'], model: 'auto', budget: 150,
        routine: { freq: 'weekdays', time: '08:30', job: 'Brief me on today.', cloud: true }, lastRoutine: 0 },
      { id: 'e_leo', crew: true, enabled: true, tpl: 'pm', n: 'Leo', title: 'Project Manager', job: 'Tasks.', tools: ['tasks'], budget: 150,
        routine: { freq: 'weekly', dow: 3, time: '17:30', job: 'Triage.', cloud: true } }
    ],
    profile: { business: 'Studio' }
  };
  set('users/u1/store/kova_profile_v2', { v: JSON.stringify({ work_os: work }), t: 1 });
  const before = JSON.stringify(get('users/u1/store'));

  // ---- the registry
  const reg = C.cleanCloud({ tz: TZ, emps: [{ id: 'e_ava', freq: 'weekdays', time: '08:30' }, { id: 'e_leo', freq: 'weekly', time: '17:30', dow: 3 }, { id: '../x', freq: 'hourly', time: '9' }] });
  ck('the registry keeps only real daily, weekday or weekly routines with a time', Object.keys(reg.emps).join() === 'e_ava,e_leo' && reg.tz === TZ);
  set('srv/crewCloud/u1', reg);

  // ---- what is due
  const due0 = await C.due(fakeDb, Date.parse('2026-09-29T12:33:00Z'));
  ck('the open app gets the first ' + C.GRACE + ' minutes: not due at 08:33', due0.length === 0);
  const due1 = await C.due(fakeDb, NOW);
  ck('at 08:40 New York time Ava’s weekday brief is due (and Leo’s Wednesday triage is not)', due1.length === 1 && due1[0].emp === 'e_ava' && due1[0].slotAgo === 10);
  ck('a weekend skips a weekday routine', (await C.due(fakeDb, Date.parse('2026-10-03T12:40:00Z'))).length === 0);
  ck('long after the window it is not run late', (await C.due(fakeDb, Date.parse('2026-09-29T14:00:00Z'))).length === 0);

  // ---- the job on the server (Claude scripted)
  const bodies = [], pushes = [];
  let script = [
    { content: [{ type: 'text', text: 'Reading the work.' }, { type: 'tool_use', id: 't1', name: 'read_work', input: {} }, { type: 'tool_use', id: 't2', name: 'list_tasks', input: { filter: 'overdue' } }] },
    { content: [{ type: 'tool_use', id: 't3', name: 'create_task', input: { name: 'Call Harper about March', priority: 'High', due: 'today' } },
      { type: 'tool_use', id: 't4', name: 'draft_email', input: { to: 'h@x.com', subject: 'Invoice', body: 'Hi' } }] },
    { content: [{ type: 'tool_use', id: 't5', name: 'write_report', input: { title: 'Today', summary: '1 overdue, 1 due today.', metrics: [{ label: 'Overdue', value: '1' }] } }] },
    { content: [{ type: 'text', text: 'Your brief is ready.' }] }
  ];
  const fetch = async (u, o) => { const b = JSON.parse(o.body); bodies.push(b); const next = script.shift(); return { ok: !!next, json: async () => next || {} }; };
  const crew = C.makeCrew({ db: fakeDb, cfg: { anthropicKey: 'k' }, now: () => NOW, fetch, push: { send: async (uid, n) => { pushes.push([uid, n]); return { sent: 1 }; } } });
  const out = await crew.run('u1', 'e_ava', { slotAgo: 10 });
  ck('Claude is asked as Ava, with her job, on Sonnet (Auto for a Chief of Staff)', /You are Ava, Chief of Staff/.test(bodies[0].system) && bodies[0].model === 'claude-sonnet-5-5' && /Brief me on today/.test(bodies[0].messages[0].content));
  const r1 = JSON.parse(bodies[1].messages[2].content[0].content), r2 = JSON.parse(bodies[1].messages[2].content[1].content);
  ck('it reads the real synced work: 2 open, 1 overdue, 1 due today in New York', r1.open === 2 && r1.overdue === 1 && r1.due_today === 1 && r2.length === 1 && r2[0].name === 'Invoice Harper for March');
  ck('an employee without email cannot draft one (boundaries hold on the server too)', /do not have the draft_email/.test(bodies[2].messages[4].content[1].content));
  const inbox = get('users/u1/crewInbox/' + out.id);
  ck('what it did lands in the inbox: the report, the steps and the proposed task', inbox && inbox.report.title === 'Today' && inbox.proposals.length === 1 && inbox.proposals[0].name === 'create_task' && inbox.steps.length >= 3 && inbox.say === 'Your brief is ready.');
  ck('nothing in Work OS was changed on the server: changes are proposals', JSON.stringify(get('users/u1/store')) === before);
  ck('a push says it is done and what needs approving', pushes.length === 1 && pushes[0][1].screen === 'workteam' && /Ava finished/.test(pushes[0][1].title) && /1 change to approve/.test(pushes[0][1].body));
  ck('it is marked done for today and counted against the week', get('srv/crewCloud/u1/ran/e_ava') === '2026-09-29' && Object.values(get('srv/crewUse/u1') || {})[0].e_ava === 4);
  ck('so it is not due again today', (await C.due(fakeDb, NOW + 5 * 60e3)).length === 0);

  // ---- the open app already ran it
  set('srv/crewCloud/u1/ran', null);
  const w2 = JSON.parse(JSON.stringify(work)); w2.agents[0].lastRoutine = NOW - 5 * 60e3;
  set('users/u1/store/kova_profile_v2', { v: JSON.stringify({ work_os: w2 }), t: 2 });
  const n0 = bodies.length;
  const sk = await crew.run('u1', 'e_ava', { slotAgo: 10 });
  ck('if the open app ran it after the slot, the server does not run it again', sk.skipped === 'ran in the app' && bodies.length === n0);

  // ---- the weekly budget
  set('users/u1/store/kova_profile_v2', { v: JSON.stringify({ work_os: work }), t: 3 });
  const wk = Object.keys(get('srv/crewUse/u1'))[0]; set('srv/crewUse/u1/' + wk + '/e_ava', 150);
  const bu = await crew.run('u1', 'e_ava', {});
  ck('at the weekly limit it stops without thinking and says so', bodies.length === n0 && /150 steps/.test(get('users/u1/crewInbox/' + bu.id).say));

  // ---- the routes
  const no = await call('GET', '/crew/inbox');
  ck('the inbox needs you signed in', no.status === 401);
  const ib = await call('GET', '/crew/inbox', { token: 'good-u1' });
  ck('GET /crew/inbox returns your results, oldest first', ib.status === 200 && ib.body.items.length === 2 && ib.body.items[0].at <= ib.body.items[1].at);
  const ack = await call('POST', '/crew/inbox/ack', { token: 'good-u1', body: { ids: ib.body.items.map((x) => x.id) } });
  ck('POST /crew/inbox/ack clears what the app picked up', ack.body.removed === 2 && Object.keys(get('users/u1/crewInbox') || {}).length === 0);
  const cl = await call('POST', '/crew/cloud', { token: 'good-u2', body: { tz: 'Europe/London', emps: [{ id: 'e_x', freq: 'daily', time: '07:00' }] } });
  ck('POST /crew/cloud registers your routines', cl.body.routines === 1 && get('srv/crewCloud/u2').emps.e_x.time === '07:00');
  await call('POST', '/crew/cloud', { token: 'good-u2', body: { tz: 'Europe/London', emps: [] } });
  ck('turning them all off removes the registry', get('srv/crewCloud/u2') === null);

  // ---- account deletion knows about it
  const acc = require('fs').readFileSync(path.join(FN, 'account.js'), 'utf8');
  ck('deleting an account deletes the crew registry, queue and counts', /srv\/crewCloud\/\{uid\}/.test(acc) && /srv\/crewQueue\/\{uid\}/.test(acc) && /srv\/crewUse\/\{uid\}/.test(acc));
  const nl = require('fs').readFileSync(path.join(FN, 'netlify.js'), 'utf8');
  ck('the 5-minute timer queues due routines and the worker runs them', /crewDue\(db, t\)/.test(nl) && /srv\/crewQueue/.test(nl) && /crew\.run\(uid, emp/.test(nl));

  const failed = T.filter((x) => !x[1]);
  T.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${T.length - failed.length}/${T.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
