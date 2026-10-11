/* Work OS automations that do what the best tools do (src/p08_flow.js),
   the search bar (src/p08_cmdk.js), "How the best tools do it"
   (src/p08_apps.js) and the AI team's two new tools (p08_crew.js):
   rules said in words, multi-step rules with filters and waits, the new
   time triggers (a call about to start, every weekday at 8, a task gone
   quiet), Test it, action items pulled from a call's notes, and ⌘K.
   Everything runs end to end in the page; the server is faked. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
const user0 = { uid: 'u1', getIdToken: () => Promise.resolve('t') };
w.firebase = {
  initializeApp() {}, apps: [{}],
  auth: () => ({ currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() }),
  database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
    remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
  storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} }),
  functions: () => ({ httpsCallable: () => () => Promise.resolve({ data: { text: '' } }) })
};
const calls = [];
const reply = (j, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)) });
w.fetch = (u, o) => {
  u = String(u); const b = o && o.body && typeof o.body === 'string' ? JSON.parse(o.body) : null; calls.push([u, b]);
  if (/\/crew\/ask$/.test(u)) return reply({ id: 'a1', runAt: Date.now(), deliverAt: b.deliverAt || Date.now(), now: !b.deliverAt });
  if (/\/crew\/(asks|plan|inbox)$/.test(u)) return reply({ items: [] });
  return reply({});
};
w.localStorage.setItem('kova.auth.skipped', '1');
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(1900);
  const doc = w.document, F = w.KovaFlow, W = w.WorkOS, U = w.WorkAuto, C = w.KovaCrew, A = w.KovaApps, K = w.KovaCmd;
  const $ = (s) => doc.querySelector(s);
  const click = (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const key = (el, k, o = {}) => el.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, o)));
  const rules = () => W.list('automations');
  const ruleNamed = (n) => rules().filter((r) => r.name === n)[0];
  ck('the three modules load', !!F && !!A && !!K);

  /* ---- say it in words ---- */
  const P = (s) => F.parse(s);
  let p = P('When a call ends, make a write-up task, wait 2 days, then remind me');
  ck('words: "when a call ends" is the trigger', p.spec && p.spec.trigger === 'meeting_ended');
  ck('words: three steps in order: write-up task today, wait 2 days, notify', p.spec.steps.map((s) => s.a).join() === 'create_task,wait,notify'
    && p.spec.steps[0].cfg.name === 'Write up {name}' && p.spec.steps[0].cfg.due === 'today' && p.spec.steps[1].cfg.n === '2' && p.spec.steps[1].cfg.u === 'days');
  p = P('30 minutes before every call, prep me');
  ck('words: "30 minutes before every call, prep me" asks the team to prep, 30 min ahead', p.spec.trigger === 'meeting_soon' && p.spec.tcfg.min === '30' && p.spec.steps[0].a === 'ask_team' && /\{name\}/.test(p.spec.steps[0].cfg.text));
  p = P('Every weekday at 8, ask Ravi to brief me');
  ck('words: "every weekday at 8, ask Ravi" is a weekday 08:00 schedule for Ravi', p.spec.trigger === 'schedule' && p.spec.tcfg.time === '08:00' && p.spec.tcfg.days === 'weekdays' && p.spec.steps[0].cfg.who === 'Ravi');
  p = P('When a waiting task sits for 3 days, remind me to chase it');
  ck('words: a task gone quiet for 3 days in Waiting, then a reminder naming it', p.spec.trigger === 'item_stale' && p.spec.tcfg.days === '3' && p.spec.tcfg.st === 'Waiting' && p.spec.steps[0].cfg.msg === 'Chase it: {name}');
  p = P('When a critical task is done, wait 1 week then create a task to check the result');
  ck('words: a filter (critical) and a week’s wait', p.spec.trigger === 'status_changes' && p.spec.tcfg.to === 'Completed' && p.spec.filters[0].c === 'priority_is' && p.spec.filters[0].cfg.p === 'Critical' && p.spec.steps[0].cfg.n === '7');
  p = P('When a task is overdue, move it to waiting and notify me');
  ck('words: "and" joins two steps', p.spec.trigger === 'due_passed' && p.spec.steps.map((s) => s.a).join() === 'set_status,notify' && p.spec.steps[0].cfg.s === 'Waiting');
  p = P('When a task called invoice is done, notify me');
  ck('words: "a task called invoice" in the when part is a filter; in a step it is the new task\u2019s name', p.spec.filters[0].c === 'name_has' && p.spec.filters[0].cfg.t === 'invoice'
    && !P('When a task is done, create a task called Tell the client').spec.filters.length && P('When a task is done, create a task called Tell the client').spec.steps[0].cfg.name === 'Tell the client');
  ck('words: "tomorrow" is a date, not "to morrow"', P('When a task is done, create a follow-up task tomorrow').spec.steps[0].cfg.due === 'tomorrow');
  ck('words: no trigger or no steps says what is missing', /when it should run/.test(P('remind me').error) && /what it should do/.test(P('When a task is done').error));
  ck('a rule cannot end on a wait', /cannot end on a wait/.test(F.check({ trigger: 'item_created', steps: [{ a: 'wait', cfg: { n: '1', u: 'days' } }] })));

  /* ---- a multi-step rule runs when the data changes ---- */
  const t1 = W.create('items', { name: 'Send the proposal', status: 'In Progress', priority: 'High', checklist: [] }, 'user');
  const r1 = F.make(F.parse('When a task is done, create a follow-up task tomorrow, then notify me it is done').spec);
  ck('a rule from words is saved in the existing store, in its existing shape', r1 && r1.action === 'flow' && r1.acfg.rule === r1.id && r1.enabled && /When a task moves to Completed/.test(U.describe(r1)));
  W.update('items', t1.id, { status: 'Completed' }, 'user');
  const fu = W.list('items', (i) => i.name === 'Follow up on Send the proposal')[0];
  ck('done -> the follow-up task exists, due tomorrow', !!fu && fu.due === W.startOfDay() + DAY);
  ck('and the notification is in the inbox', U.notes().some((n) => /It is done: Send the proposal/.test(n.msg)));
  ck('the run is in the rule’s history as ran', W.find('automations', r1.id).lastResult === 'ok' && /created/.test(W.find('automations', r1.id).runs[0].detail));
  W.update('automations', r1.id, { enabled: false }, 'user');

  /* a filter stops it */
  const r2 = F.make(F.parse('When a critical task is done, create a task called Tell the client').spec);
  const t2 = W.create('items', { name: 'Small fix', status: 'In Progress', priority: 'Low', checklist: [] }, 'user');
  W.update('items', t2.id, { status: 'Completed' }, 'user');
  ck('filter: a low-priority task does not pass "critical", and the skip is logged', !W.list('items', (i) => i.name === 'Tell the client').length && W.find('automations', r2.id).lastResult === 'skip');
  const t3 = W.create('items', { name: 'Launch', status: 'In Progress', priority: 'Critical', checklist: [] }, 'user');
  W.update('items', t3.id, { status: 'Completed' }, 'user');
  ck('filter: a critical one runs', W.list('items', (i) => i.name === 'Tell the client').length === 1);
  W.update('automations', r2.id, { enabled: false }, 'user');

  /* ---- waits survive and carry on later ---- */
  const r3 = F.make(F.parse('When a task is done, wait 2 days, then remind me to check the result').spec);
  const t4 = W.create('items', { name: 'Ship v2', status: 'In Progress', priority: 'High', checklist: [] }, 'user');
  W.update('items', t4.id, { status: 'Completed' }, 'user');
  ck('wait: the rest is parked and saved', F.waits().length === 1 && F.waits()[0].from === 1 && w.KP.get('flow_waits').length === 1);
  ck('wait: nothing yet', !U.notes().some((n) => /Check the result: Ship v2/.test(n.msg)));
  F.resume();
  ck('wait: still parked an hour later', F.waits().length === 1);
  F._setNow(() => Date.now() + 2 * DAY + 60e3);
  F.resume();
  F._setNow(null);
  ck('wait: two days later the reminder fires, naming the task', U.notes().some((n) => n.msg === 'Check the result: Ship v2'));
  ck('wait: the queue is empty and the run says "after the wait"', F.waits().length === 0 && /after the wait/.test(W.find('automations', r3.id).runs[0].detail));
  /* a rule switched off while waiting is dropped */
  W.update('items', W.create('items', { name: 'Ship v3', status: 'In Progress', checklist: [] }, 'user').id, { status: 'Completed' }, 'user');
  W.update('automations', r3.id, { enabled: false }, 'user');
  F._setNow(() => Date.now() + 3 * DAY); F.resume(); F._setNow(null);
  ck('wait: a rule switched off meanwhile does not carry on', F.waits().length === 0 && !U.notes().some((n) => /Ship v3/.test(n.msg)));

  /* ---- time triggers ---- */
  const before = C.jobs ? Object.keys(C.jobs()).length : 0;
  const m1 = W.create('meetings', { title: 'Call with Sam', attendees: 'Sam', at: Date.now() + 20 * 60e3, prep: 'Pricing', notes: '' }, 'user');
  const r4 = F.make(F.parse('30 minutes before every call, prep me').spec);
  F.sweep();
  const jobs = C.jobs ? Object.values(C.jobs()) : [];
  ck('a call 20 minutes away: the team is asked to prep (in the app when there is no server)', W.find('automations', r4.id).lastResult === 'ok' && jobs.length > before
    && jobs.some((j) => /Prep me for Call with Sam with Sam/.test(j.text) && /Pricing/.test(j.text) === false || /Prep me for Call with Sam/.test(j.text)));
  const n4 = W.find('automations', r4.id).runs.length;
  F.sweep();
  ck('it fires once per call, not every minute', W.find('automations', r4.id).runs.length === n4);
  /* with the server, it goes to the server now, whatever times the words mention */
  const FB = w.KOVA_FB; const user = user0;
  const auth0 = FB && FB.auth, cu0 = auth0 && auth0.currentUser;
  if (FB) { FB.ok = true; if (FB.auth) FB.auth.currentUser = user; }
  W.create('meetings', { title: 'Board review at 3pm', attendees: 'Ana', at: Date.now() + 25 * 60e3, prep: '', notes: '' }, 'user');
  F.sweep(); await wait(80);
  const sent = calls.filter((c) => /\/crew\/ask$/.test(c[0]) && /Board review/.test(c[1].text))[0];
  ck('with the server: it is sent to run there, now (not at "3pm")', !!sent && sent[1].deliverAt === 0);
  if (FB) { FB.ok = false; if (FB.auth) FB.auth.currentUser = cu0 || null; }
  W.update('automations', r4.id, { enabled: false }, 'user');

  const r5 = F.make(F.parse('Every weekday at 8, remind me to plan the day').spec);
  const mon = new w.Date(2026, 9, 12, 8, 5).getTime();
  F._setNow(() => mon); w.KovaFlow.sweep();
  ck('schedule: Monday 8:05, the 8:00 rule runs', W.find('automations', r5.id).lastResult === 'ok' && U.notes().some((n) => n.msg === 'Plan the day'));
  const n5 = W.find('automations', r5.id).runs.length;
  F._setNow(() => mon + 30 * 60e3); F.sweep();
  ck('schedule: once a day', W.find('automations', r5.id).runs.length === n5);
  F._setNow(() => mon + DAY + 6 * 36e5); F.sweep();
  ck('schedule: opened at 2pm the next day, a morning brief is too late, so it is skipped', W.find('automations', r5.id).runs.length === n5);
  F._setNow(() => mon + 5 * DAY + 60e3); F.sweep();
  ck('schedule: not on Saturday', W.find('automations', r5.id).runs.length === n5);
  F._setNow(null);
  W.update('automations', r5.id, { enabled: false }, 'user');

  const r6 = F.make(F.parse('When a waiting task sits for 3 days, remind me to chase it, then create a task called Chase {name} today').spec);
  const t6 = W.create('items', { name: 'Contract from Acme', status: 'Waiting', checklist: [] }, 'user');
  W.update('items', t6.id, { statusAt: Date.now() - 4 * DAY }, 'system');
  const t7 = W.create('items', { name: 'Fresh wait', status: 'Waiting', statusAt: Date.now(), checklist: [] }, 'user');
  F.sweep();
  ck('quiet: 4 days in Waiting -> a reminder and a chase task due today', U.notes().some((n) => n.msg === 'Chase it: Contract from Acme') && W.list('items', (i) => i.name === 'Chase Contract from Acme' && i.due === W.startOfDay()).length === 1);
  ck('quiet: one that just started waiting is left alone', !U.notes().some((n) => /Fresh wait/.test(n.msg)));
  const statusMove = W.create('items', { name: 'Track me', status: 'Not Started', checklist: [] }, 'user');
  W.update('items', statusMove.id, { status: 'Waiting' }, 'user');
  ck('quiet: a status change is stamped, so "quiet for" counts from it', W.find('items', statusMove.id).statusAt >= Date.now() - 5000 && t7);
  W.update('automations', r6.id, { enabled: false }, 'user');

  /* ---- Test it: what would happen, writing nothing ---- */
  const n0 = W.list('items').length, a0 = W.list('activity') ? W.all().activity.length : 0;
  const tr = F.test(F.parse('When a task is done, create a task called Celebrate {name}, wait 1 day, then remind me').spec);
  ck('Test it: shows the record it used and each step in words', tr.ok && tr.lines[0].k === 'Using' && tr.lines.some((l) => /create the task “Celebrate /.test(l.v)) && tr.lines.some((l) => /wait 1 day/.test(l.v)));
  ck('Test it: writes nothing', W.list('items').length === n0);
  ck('Test it: a step that needs a task, on a schedule, says it would fail', /would fail/.test(F.test({ trigger: 'schedule', tcfg: { time: '08:00' }, steps: [{ a: 'set_priority', cfg: { p: 'High' } }] }).lines[1].v));

  /* ---- the screens: say the rule, the builder, Test it, Save ---- */
  w.go('workauto'); await wait(50); if (w.__workAuto) w.__workAuto.draw(); await wait(60);
  const say = $('#waBody .kfl-say');
  ck('Automations: a "Say the rule" box with examples and a link to how the best tools do it', !!say && say.querySelectorAll('[data-kf="ex"]').length === 3 && !!say.querySelector('[data-kf="apps"]'));
  ck('Automations: the honest line now says server steps run with Kova closed', /runs on the server/.test($('#waBody').textContent));
  ck('Recipes: five new ready-made rules (ten in all)', U.TEMPLATES.length === 10 && U.TEMPLATES.some((t) => t.name === 'Prep me 30 minutes before every call'));
  click(say.querySelectorAll('[data-kf="ex"]')[0]); click(say.querySelector('[data-kf="build"]')); await wait(30);
  ck('Build it: the builder opens with the rule from the words', !!$('#kflB') && $('#kflTrig').value === 'meeting_soon' && $('#kflB').querySelectorAll('[data-si]').length === 1);
  click($('#kflB [data-kb="adds"]')); await wait(10);
  ck('Add a step', $('#kflB').querySelectorAll('[data-si]').length === 2);
  click($('#kflB [data-kb="addf"]')); await wait(10);
  const fsel = $('#kflB [data-fi="0"]'); fsel.value = 'with_people'; fsel.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(10);
  ck('Add a filter, and change it', $('#kflB [data-fi="0"]').value === 'with_people');
  click($('#kflB [data-kb="test"]')); await wait(10);
  ck('Test it in the builder shows the steps', !!$('#kflB .kfl-test') && /Step 1/.test($('#kflB .kfl-test').textContent));
  const nm = $('#kflName'); nm.value = 'Prep and remind'; nm.dispatchEvent(new w.Event('input', { bubbles: true }));
  const cnt = rules().length;
  click($('#kflB [data-kb="save"]')); await wait(30);
  const saved = ruleNamed('Prep and remind');
  ck('Save: the rule is saved and switched on, with the filter and both steps', rules().length === cnt + 1 && saved && saved.enabled && saved.condition === 'all' && saved.ccfg.list[0].c === 'with_people' && saved.acfg.steps.length === 2);
  click($('#waNew')); await wait(20);
  ck('+ on Automations opens the builder', !!$('#kflB'));
  if (w.closeSheet) w.closeSheet();
  /* a recipe gets its own copy */
  const ix = U.TEMPLATES.findIndex((t) => t.name === 'After a call: write-up today, check in two days later');
  const ra = U.addTemplate(ix), rb = U.addTemplate(ix);
  ck('Recipe: each added copy is its own rule with its own steps', ra.acfg !== rb.acfg && ra.acfg.rule === ra.id && rb.acfg.rule === rb.id && ra.acfg.steps.length === 3);
  W.remove('automations', rb.id);
  /* the AI team's run shows as an ask, and the describe is plain */
  ck('Describe: plain words', /^When a meeting finishes: create “Write up \{name\}” due today, then wait 2 days, then notify me/.test(U.describe(ra)));
  W.update('automations', ra.id, { enabled: false }, 'user');

  /* ---- how the best tools do it ---- */
  ck('apps: 86, in 9 groups, each with five reasons, what Kova took, and how solid the evidence is',
    A.all().length === 86 && Object.keys(A.GROUPS).length === 9 && A.all().every((a) => a.why.length === 5 && a.take && A.EV[a.ev] && A.GO[a.go] && A.GROUPS[a.g]));
  ck('apps: no app twice', new Set(A.all().map((a) => a.id)).size === 86);
  ck('apps: the best for "action items from meeting notes" is Fireflies', A.recommend('action items from meeting notes')[0].id === 'fireflies');
  ck('apps: "keyboard shortcuts, fast" finds Linear or Superhuman first', ['linear', 'superhuman'].includes(A.recommend('fast keyboard shortcuts')[0].id));
  w.go('workauto'); if (w.__workAuto) w.__workAuto.draw(); await wait(60);
  click($('#waBody [data-kf="apps"]')); await wait(30);
  ck('the link opens the pop-up with the nine groups closed', !!$('#kapRoot') && doc.querySelectorAll('#kapRoot .kap-grp').length === 9 && !$('#kapRoot .kap-app'));
  click($('#kapRoot [data-ap="grp"][data-v="auto"]')); await wait(10);
  ck('a group opens to its apps', doc.querySelectorAll('#kapRoot .kap-app').length === 12);
  click($('#kapRoot [data-ap="tog"][data-v="zapier"]')); await wait(10);
  const zb = $('#kapRoot [data-app="zapier"] .kap-bd');
  ck('an app opens to its 5 reasons, what Kova took, and the evidence', !!zb && zb.querySelectorAll('li').length === 5 && /What Kova took/.test(zb.textContent) && /user reviews/.test(zb.textContent) && !!zb.querySelector('[data-ap="go"]'));
  type($('#kapQ'), 'follow-ups'); await wait(10);
  ck('search inside the pop-up', doc.querySelectorAll('#kapRoot .kap-app').length >= 1 && !$('#kapRoot .kap-grp'));
  if (w.closeSheet) w.closeSheet();

  /* ---- the AI team ---- */
  ck('every teammate can check the app guide; teammates with tasks can make rules', C.emps().every((e) => C.toolsFor(e).includes('best_tools')) && C.emps().some((e) => C.toolsFor(e).includes('create_automation')));
  const bt = C.TOOLS.best_tools.run({ need: 'notes and action items from calls' });
  ck('best_tools: answers with apps, reasons and what Kova does', bt.apps.length && bt.apps[0].name === 'Fireflies' && bt.apps[0].reasons.length === 5 && !!bt.apps[0].in_kova);
  const undo = [];
  const ca = C.TOOLS.create_automation.run({ rule: 'When a call ends, create a write-up task' }, { undo: (c) => undo.push(c) });
  ck('create_automation: the team makes a rule from a sentence, and it can be undone', ca.ok && W.find('automations', ca.id).madeBy === 'ai' && undo[0].coll === 'automations' && undo[0].created);
  ck('create_automation: is a write (follows your approval setting)', C.TOOLS.create_automation.kind === 'write');
  ck('create_automation: a sentence it cannot read says why', /when it should run/.test(C.TOOLS.create_automation.run({ rule: 'make it nice' }, {}).error));
  W.remove('automations', ca.id);

  /* ---- action items from a call ---- */
  const notes = "Sam will send the deck by Friday\nTODO: book the venue\n@Ana review the copy tomorrow\nWe decided to go with plan B\nRevenue is up 10%\nI'll draft the proposal next week\nThe client will love it.";
  const x = F.actions(notes, { attendees: 'Sam, Ana' }, new w.Date(2026, 9, 12, 10).getTime());
  ck('notes: four action items, the chatter left out', x.items.length === 4 && x.items.map((i) => i.text).join('|') === 'Send the deck|Book the venue|Review the copy|Draft the proposal');
  ck('notes: owners (Sam, Ana, you) and dates (Friday, tomorrow, next week)', x.items[0].owner === 'Sam' && x.items[2].owner === 'Ana' && x.items[3].owner === 'me'
    && new w.Date(x.items[0].due).getDay() === 5 && x.items[2].due === new w.Date(2026, 9, 13).getTime() && x.items[3].due === new w.Date(2026, 9, 19).getTime() && x.items[1].due === null);
  ck('notes: decisions are kept apart', x.decisions.length === 1 && /plan B/.test(x.decisions[0]));
  ck('dates: "by end of week", "in 2 days", "3/14"', F.dueIn('by end of week', new w.Date(2026, 9, 12).getTime()).at === new w.Date(2026, 9, 16).getTime()
    && F.dueIn('in 2 days', new w.Date(2026, 9, 12).getTime()).at === new w.Date(2026, 9, 14).getTime() && new w.Date(F.dueIn('by 3/14', new w.Date(2026, 9, 12).getTime()).at).getMonth() === 2);
  const mt = W.create('meetings', { title: 'Kickoff', attendees: 'Sam, Ana', at: Date.now() - 36e5, prep: '', notes: notes }, 'user');
  w.__workMeet.open(mt.id); await wait(60);
  const pull = $('#wmdBody .kfl-pull');
  ck('Meeting: "Pull action items from the notes" sits under the notes', !!pull);
  click(pull); await wait(30);
  ck('the pop-up lists them ticked, with owner and date, and the decision', doc.querySelectorAll('#kflP .kfl-ai').length === 4 && /Sam/.test($('#kflP').textContent) && /Decided/.test($('#kflP').textContent));
  const box = $('#kflP [data-pi="1"]'); box.checked = false; box.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(10);
  ck('untick one: the button counts three', /Add 3 tasks/.test($('#kflP [data-pk="add"]').textContent));
  click($('#kflP [data-pk="add"]')); await wait(30);
  const made = W.list('items', (i) => i.meetingId === mt.id);
  ck('three tasks on the board, tied to the call, with the owner in the name', made.length === 3 && made.some((i) => i.name === 'Send the deck (Sam)') && made.some((i) => i.owner === 'me'));
  ck('the meeting keeps its decisions', W.find('meetings', mt.id).decisions.length === 1 && !!W.find('meetings', mt.id).actionsPulled);
  ck('the meeting screen shows them as action items', /Send the deck \(Sam\)/.test($('#wmdBody').textContent));

  /* ---- the search bar ---- */
  ck('quick add: "Call Sam tomorrow !high #Launch"', (() => { const pr = W.create('projects', { name: 'Launch plan' }, 'user'); const q = K.quick('Call Sam tomorrow !high #launch'); return q.name === 'Call Sam' && q.priority === 'High' && q.project && q.project.id === pr.id && q.due === W.startOfDay() + DAY; })());
  ck('quick add: weekdays and "in 3 days"', new w.Date(K.quick('Pay rent fri').due).getDay() === 5 && K.quick('Renew in 3 days').due === W.startOfDay() + 3 * DAY && K.quick('Renew in 3 days').name === 'Renew');
  key(doc, 'k', { metaKey: true }); await wait(10);
  ck('⌘K opens the bar', !!$('#kcmd') && !$('#kcmd').hidden && K.isOpen());
  ck('empty: new task, ask your team, new rule, then screens', /New task/.test($('#kcmdL').textContent) && /Ask your AI team/.test($('#kcmdL').textContent) && /New rule/.test($('#kcmdL').textContent) && /Go to/.test($('#kcmdL').textContent));
  const q = $('#kcmdQ');
  type(q, 'kickoff'); await wait(10);
  ck('finds the meeting', K._S.rows.some((r) => r.kind === 'meeting' && r.t === 'Kickoff'));
  type(q, 'send the deck'); await wait(10);
  ck('finds the task', K._S.rows.some((r) => r.kind === 'task' && r.t === 'Send the deck (Sam)'));
  type(q, 'ravi'); await wait(10);
  ck('finds the teammate', K._S.rows.some((r) => r.kind === 'mate' && r.t === 'Ravi'));
  type(q, 'zapier'); await wait(10);
  ck('finds the app guide', K._S.rows.some((r) => r.kind === 'app' && r.t === 'Zapier'));
  type(q, 'slep'); await wait(10);
  ck('letters in order still find a screen ("slep" -> Sleep)', K._S.rows.some((r) => r.kind === 'screen' && r.t === 'Sleep') || K._S.rows.some((r) => r.t === 'Sleep sounds'));
  type(q, 'meet'); await wait(10);
  key(q, 'ArrowDown'); key(q, 'ArrowDown'); await wait(5);
  ck('arrow keys move the selection', K._S.sel === 2 && !!$('#kcmdL .kcmd-r.on'));
  key(q, 'Escape'); await wait(5);
  ck('Esc closes it', $('#kcmd').hidden && !K.isOpen());
  K.open(); type($('#kcmdQ'), 'Pay the invoice friday !high'); await wait(10);
  ck('a line you type becomes "New task" first', K._S.rows[0].key === 'do:task' && /Pay the invoice/.test(K._S.rows[0].t) && /High/.test(K._S.rows[0].s));
  key($('#kcmdQ'), 'Enter'); await wait(20);
  const inv = W.list('items', (i) => i.name === 'Pay the invoice')[0];
  ck('Enter adds it: due Friday, High', !!inv && new w.Date(inv.due).getDay() === 5 && inv.priority === 'High' && !K.isOpen());
  const jb = Object.keys(C.jobs()).length;
  K.open(); type($('#kcmdQ'), 'Ravi, research three venues in Austin'); await wait(10);
  ck('"Ravi, …" becomes "Ask Ravi" first', K._S.rows[0].key === 'do:ask' && /Ask Ravi/.test(K._S.rows[0].t));
  key($('#kcmdQ'), 'Enter'); await wait(40);
  ck('Enter: Ravi takes the job', Object.values(C.jobs()).some((j) => /three venues in Austin/.test(j.text) && C.emp(j.emp).n === 'Ravi') && Object.keys(C.jobs()).length === jb + 1);
  K.open(); type($('#kcmdQ'), 'When a call ends, remind me to write it up'); await wait(10);
  ck('a sentence that is a rule offers "Make a rule"', K._S.rows[0].key === 'do:rule');
  key($('#kcmdQ'), 'Enter'); await wait(250);
  ck('Enter: the builder opens with it', !!$('#kflB') && $('#kflTrig').value === 'meeting_ended');
  if (w.closeSheet) w.closeSheet();
  K.open(); await wait(5);
  ck('what you opened comes back under Recent', K._S.rows.some((r) => r.group === 'Recent'));
  K.close();
  ck('the dead search icons on Fuel, Sleep, Vitals, Move and Learn now open it', ['fuel', 'sleep', 'vitals', 'move', 'learn'].every((s) => !!doc.querySelector('#s-' + s + ' .hdr-r [data-kcmd]')));
  ck('Work gets one next to Settings', !!doc.querySelector('#s-work .hdr-r [data-kcmd]') && !!doc.querySelector('#s-work .hdr-r [data-go="worksettings"]'));
  click(doc.querySelector('#s-fuel .hdr-r [data-kcmd]')); await wait(10);
  ck('tapping one opens the bar', K.isOpen() && doc.activeElement === $('#kcmdQ'));
  K.close();

  const bad = errors.filter((e) => !/Not implemented|Could not parse CSS|csstree/i.test(e));
  ck('no page errors', bad.length === 0);
  if (bad.length) console.log(bad.slice(0, 5).join('\n'));

  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
