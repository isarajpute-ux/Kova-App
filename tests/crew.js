/* AI employees in the Work OS (p10), modelled on Grok Bot's agent teams.

   Checks the parts that make an employee an employee rather than a text box:
   editable job descriptions that routing actually uses, a real multi-step
   tool loop with Claude (mocked here) that reads and changes Work OS data,
   approvals that pause the job (and can be edited), tools an employee does
   not have being refused, hand-offs between teammates, offline routines
   that still do real work, undo, routines on a schedule, the numbers the
   built-in work analysis produces, and hiring / editing from the UI. */
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
const calls = []; let script = []; const crewBodies = [];
const reply = (j, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)) });
w.fetch = (u, o) => {
  u = String(u); calls.push([u, o]);
  if (/\/crew\/step$/.test(u)) { crewBodies.push(JSON.parse(o.body)); const next = script.shift(); return next ? reply(next) : reply({ error: 'no script' }, false, 500); }
  if (/\/assist\/email$/.test(u)) return reply({ ok: true });
  return reply({});
};
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));



(async () => {
  await wait(1900);
  const doc = w.document, C = w.KovaCrew, W = w.WorkOS, DAY = 864e5, now = Date.now(), sod = W.startOfDay();
  ck('KovaCrew is on the page', !!C && typeof C.start === 'function');
  const E = () => C.emps(); const by = (t) => E().filter((e) => e.title === t)[0];
  ck('the starter team is hired: Chief of Staff, Project Manager, Growth Analyst, Client Success',
    E().map((e) => e.title).join('|') === 'Chief of Staff|Project Manager|Growth Analyst|Client Success');
  ck('starter routines are off until you turn them on', E().every((e) => e.routine.freq === 'off'));
  ck('nine roles to hire from, each with a job and a playbook', C.TPL.length === 9 && C.TPL.every((t) => t.job.length > 60 && t.playbook.length > 40));

  // ---- data to work on
  W.list('items').forEach((i) => W.remove('items', i.id, 'system'));
  const mk = (o) => W.create('items', Object.assign({ status: 'Not Started', priority: 'Medium', checklist: [] }, o), 'system');
  const d1 = mk({ name: 'Ship the Harper proposal', status: 'Completed', created: now - 9 * DAY, due: sod - DAY, completedAt: now - 2 * DAY });
  mk({ name: 'Update the price list', status: 'Completed', created: now - 4 * DAY, due: sod + 2 * DAY, completedAt: now - 1 * DAY });
  mk({ name: 'Record the demo', status: 'Completed', created: now - 3 * DAY, completedAt: now - 3 * DAY });
  mk({ name: 'Old launch post', status: 'Completed', created: now - 20 * DAY, completedAt: now - 10 * DAY });
  const late1 = mk({ name: 'Invoice Harper for March', priority: 'High', due: sod - 5 * DAY, created: now - 12 * DAY });
  const late2 = mk({ name: 'Reply to the Lumen lead', priority: 'Low', due: sod - 2 * DAY, created: now - 6 * DAY });
  const wt = mk({ name: 'Waiting on the printer quote', status: 'Waiting', created: now - 8 * DAY }); W.find('items', wt.id).updated = now - 5 * DAY; W.save();
  mk({ name: 'Plan the April shoot', due: sod + 3 * DAY, created: now - DAY });

  // ---- analysis
  const a = C.analyze(7);
  ck('analyze: 3 finished in 7 days vs 1 the week before (+200%)', a.completed === 3 && a.prevCompleted === 1 && a.change === 200);
  ck('analyze: 2 overdue, the oldest 5 days late', a.overdue === 2 && a.oldestOverdue && a.oldestOverdue.name === 'Invoice Harper for March' && a.oldestOverdue.days === 5);
  ck('analyze: finds work stuck waiting for over 3 days', a.stuck.length === 1 && a.stuck[0] === 'Waiting on the printer quote');
  ck('analyze: on-time rate and cycle time come from real dates (7 + 3 + 0 days)', a.onTimeRate === 100 && a.avgCycleDays === 3.3);
  ck('analyze: a 14-day series of finished tasks', a.series.length === 14 && a.series.reduce((x, y) => x + y, 0) === 4);
  ck('analyze: findings are sentences with the numbers in them', /Completed 3 tasks in the last 7 days, up 200%/.test(a.findings[0]) && a.findings.some((f) => /2 overdue/.test(f)));

  // ---- routing by job description
  const RT = (q) => (C.route(q) || {}).emp.title;
  ck('routing: a report on the numbers goes to the Growth Analyst', RT('Write my weekly report on the numbers') === 'Growth Analyst');
  ck('routing: overdue tasks go to the Project Manager', RT('Triage the overdue tasks') === 'Project Manager');
  ck('routing: emailing a client goes to Client Success', RT('Email the client about the unpaid invoice') === 'Client Success');
  ck('routing: naming someone sends it to them', RT('Leo, can you look at this?') === 'Project Manager');
  ck('routing: nobody owns it, so the Chief of Staff takes it', RT('zzz qqq') === 'Chief of Staff');
  const jade = by('Client Success');
  W.update('agents', jade.id, { job: jade.job + ' I also own the bakery wholesale accounts.' }, 'user');
  ck('routing reads the job description you write', RT('Anything new from the bakery wholesale accounts?') === 'Client Success');

  // ---- a full job through the Kova server brain (Claude mocked)
  const FB = w.KOVA_FB; if (FB) { FB.ok = true; FB.auth = FB.auth || {}; FB.auth.currentUser = user; }
  ck('the team thinks with the Kova server when you are signed in', C.brain() === 'server');
  script = [
    { content: [{ type: 'text', text: 'Looking at what is overdue.' }, { type: 'tool_use', id: 't1', name: 'list_tasks', input: { filter: 'overdue' } }, { type: 'tool_use', id: 't2', name: 'read_work', input: {} }], stop_reason: 'tool_use' },
    { content: [{ type: 'tool_use', id: 't3', name: 'create_task', input: { name: 'Call Harper about the March invoice', priority: 'High', due: 'tomorrow' } },
      { type: 'tool_use', id: 't4', name: 'draft_email', input: { to: 'harper@example.com', subject: 'Invoice', body: 'Hi Harper, a reminder that the March invoice is now 5 days overdue.' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'tool_use', id: 't5', name: 'write_report', input: { title: 'Harper follow-up', summary: 'Reminder sent and a call booked for tomorrow.', metrics: [{ label: 'Overdue', value: '2', note: 'oldest 5 d' }] } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Done. Harper has the reminder.' }], stop_reason: 'end_turn' }
  ];
  const job = C.start(C.emp(jade.id), 'Chase Harper about the late March invoice', 'you');
  await wait(300);
  ck('the job sent Jade’s job description, playbook and tools to Claude', crewBodies[0] && /You are Jade, Client Success/.test(crewBodies[0].system) && /bakery wholesale/.test(crewBodies[0].system)
    && crewBodies[0].tools.some((t) => t.name === 'draft_email') && !crewBodies[0].tools.some((t) => t.name === 'post_draft'));
  ck('tool results go back with the matching ids', crewBodies[1] && crewBodies[1].messages.slice(-1)[0].content.map((r) => r.tool_use_id).join() === 't1,t2');
  ck('the overdue list Claude saw is the real one', /Invoice Harper for March/.test(crewBodies[1].messages.slice(-1)[0].content[0].content));
  ck('a Work OS change inside Kova goes ahead (approval: only email)', W.list('items').some((i) => i.name === 'Call Harper about the March invoice'));
  ck('the email waits for you', job.state === 'waiting' && job.ask && job.ask.name === 'draft_email');
  doc.getElementById('s-workteam').classList.add('on'); C._S.view = 'emp'; C._S.emp = jade.id; C.paint(); await wait(60);
  const ap = doc.querySelector('.crw-appr');
  ck('the approval card shows the email to edit', !!ap && ap.querySelector('[data-f="to"]').value === 'harper@example.com' && /March invoice/.test(ap.querySelector('[data-f="body"]').value));
  ap.querySelector('[data-f="subject"]').value = 'Invoice #12 reminder';
  ap.querySelector('[data-c="ok"][data-a="send"]').click(); await wait(300);
  const sent = calls.filter((c) => /\/assist\/email$/.test(c[0])).map((c) => JSON.parse(c[1].body))[0];
  ck('approving sends your edited version', sent && sent.subject === 'Invoice #12 reminder' && sent.send === true && sent.to === 'harper@example.com');
  ck('Claude hears the email went out', crewBodies[2] && /"sent":true/.test(crewBodies[2].messages.slice(-1)[0].content.filter((r) => r.tool_use_id === 't4')[0].content));
  ck('the job finishes with a report', job.state === 'done' && job.report && job.report.title === 'Harper follow-up' && /Harper has the reminder/.test(job.say));
  C.paint(); await wait(30);
  const th = doc.querySelector('.crw-thread').textContent;
  ck('the thread shows the work log, the report and the closing line', /Listed 2 overdue tasks/.test(th) && /Created task/.test(th) && /Sent email to harper@example.com/.test(th) && /Harper follow-up/.test(th));
  const undoBtn = [...doc.querySelectorAll('[data-c="undo"]')].pop();
  ck('changes can be undone', !!undoBtn && /Undo 1 change/.test(undoBtn.textContent));
  undoBtn.click(); await wait(30);
  ck('undo removes what the job created', !W.list('items').some((i) => i.name === 'Call Harper about the March invoice'));

  // ---- a tool the employee does not have is refused
  const leo = by('Project Manager');
  script = [{ content: [{ type: 'tool_use', id: 'b1', name: 'draft_email', input: { to: 'x@example.com', subject: 's', body: 'b' } }], stop_reason: 'tool_use' },
            { content: [{ type: 'text', text: 'That is Jade’s job.' }], stop_reason: 'end_turn' }];
  const jb = C.start(C.emp(leo.id), 'Email the printer', 'you'); await wait(200);
  const refused = crewBodies.slice(-1)[0].messages.slice(-1)[0].content[0];
  ck('a tool outside the job is refused, and the employee is told why', refused.is_error === true && /do not have the draft_email tool/.test(refused.content) && jb.steps.some((s) => s.k === 'blocked'));
  ck('nothing was sent', calls.filter((c) => /\/assist\/email$/.test(c[0])).length === 1);

  // ---- approval: every change
  W.update('agents', leo.id, { approval: 'all' }, 'user');
  script = [{ content: [{ type: 'tool_use', id: 'c1', name: 'update_task', input: { name: 'Reply to the Lumen lead', due: '+3d' } }], stop_reason: 'tool_use' },
            { content: [{ type: 'text', text: 'Moved.' }], stop_reason: 'end_turn' }];
  const jc = C.start(C.emp(leo.id), 'Move the Lumen reply', 'you'); await wait(200);
  ck('with "every change", even a task edit waits for you', jc.state === 'waiting' && W.find('items', late2.id).due === sod - 2 * DAY);
  C.skip(jc.id); await wait(200);
  ck('skipping tells Claude you declined, and the job carries on', /declined/.test(crewBodies.slice(-1)[0].messages.slice(-1)[0].content[0].content) && jc.state === 'done');
  W.update('agents', leo.id, { approval: 'external' }, 'user');

  // ---- hand-off to a teammate
  const ava = by('Chief of Staff'), maya = by('Growth Analyst');
  script = [{ content: [{ type: 'tool_use', id: 'h1', name: 'hand_off', input: { to: 'Maya', job: 'Write the weekly numbers report.' } }], stop_reason: 'tool_use' },
            { content: [{ type: 'text', text: 'Maya has it.' }], stop_reason: 'end_turn' },
            { content: [{ type: 'text', text: 'Report coming.' }], stop_reason: 'end_turn' }];
  C.start(C.emp(ava.id), 'I need the weekly numbers', 'team'); await wait(400);
  const mj = C.jobsOf(maya.id).slice(-1)[0];
  ck('a hand-off starts the teammate’s job, marked as handed over', mj && mj.source === 'handoff' && /weekly numbers report/.test(mj.text) && mj.steps[0] && /Handed over by Ava/.test(mj.steps[0].t));

  // ---- offline: real work without a model
  C._S.down.server = true;
  ck('with no server and no key the team says it is offline', C.brain() === 'local');
  const jl = C.start(C.emp(leo.id), 'Triage my overdue tasks', 'you'); await wait(200);
  ck('offline triage re-dates overdue work by priority (High to tomorrow, Low to a week)', jl.state === 'done'
    && W.find('items', late1.id).due === sod + DAY && W.find('items', late2.id).due === sod + 7 * DAY && jl.report && jl.report.title === 'Overdue triage');
  ck('offline work is labelled as a routine, not AI', /not AI/.test(jl.say));
  C.undo(jl.id);
  ck('undo puts the old dates back', W.find('items', late1.id).due === sod - 5 * DAY && W.find('items', late2.id).due === sod - 2 * DAY);
  const ja = C.start(C.emp(maya.id), 'How is the work going?', 'you'); await wait(200);
  ck('offline analysis reports the real numbers', ja.report && ja.report.metrics[0].value === '3' && /\+200%/.test(ja.report.metrics[0].note) && ja.report.metrics[1].value === '2');
  const jn = C.start(C.emp(jade.id), 'Write a poem about spring', 'you'); await wait(100);
  ck('offline, a job it cannot do says what it needs', jn.state === 'done' && /Kova server or your own Claude key/.test(jn.say));
  C._S.down.server = false;

  // ---- routines
  const e = Object.assign({}, C.emp(leo.id), { routine: { freq: 'weekdays', time: '09:00', job: 'x' }, lastRoutine: 0 });
  const wed905 = new Date(2026, 8, 30, 9, 5).getTime(), sat = new Date(2026, 9, 3, 9, 5).getTime();
  ck('a weekday routine is due at 9:05 on a Wednesday', C.slot(e, wed905) === new Date(2026, 8, 30, 9, 0).getTime());
  ck('it does not run twice', C.slot(Object.assign({}, e, { lastRoutine: wed905 }), wed905 + 60e3) === null);
  ck('it does not run on a Saturday', C.slot(e, sat) === null);
  ck('a weekly routine only runs on its day', C.slot(Object.assign({}, e, { routine: { freq: 'weekly', dow: 1, time: '09:00', job: 'x' } }), wed905) === null);
  ck('it catches up when Kova opens later the same day', C.slot(e, new Date(2026, 8, 30, 16, 0).getTime()) !== null);

  // ---- the dashboard, laid out like the reference
  C._S.view = 'team'; C._S.nav = 'team'; C._S.tab = 'all'; C.paint(); await wait(30);
  const body = doc.getElementById('wtmBody');
  ck('pill navigation and three round icons along the top', body.querySelectorAll('.crd-nav .crd-pill').length === 5 && body.querySelectorAll('.crd-top .crd-icons .crd-circ').length === 3);
  ck('an "Updated" line over a large title', /Updated/.test(body.querySelector('.crd-upd').textContent) && /team$/.test(body.querySelector('.crd-title').textContent));
  ck('four labelled stats with the real numbers', body.querySelectorAll('.crd-stat').length === 4 && /Finished3/.test(body.querySelector('.crd-stats').textContent.replace(/\s+/g, '')));
  ck('a stage timeline and a focus card with the wireframe globe', !!body.querySelector('.crd-flow .crd-step') && !!body.querySelector('.crd-focus .crd-globe'));
  ck('one tab per employee, plus Hire', body.querySelectorAll('.crd-tabs [data-c="tab"]').length === 5 && !!body.querySelector('.crd-tabs [data-c="hire"]'));
  ck('five tiles, the big one with a date range, every one with a chart', body.querySelectorAll('.crd-tiles .crd-t').length === 5 && !!body.querySelector('.crd-t.t-big .crd-date') && body.querySelectorAll('.crd-tiles svg.crd-ch').length === 5);
  body.querySelector('.crd-t.t-big .crd-date').click(); await wait(10);
  ck('the date range changes', /–/.test(body.querySelector('.crd-t.t-big .crd-date').textContent) && C._S.range === 90);
  for (const n of ['jobs', 'approvals', 'routines', 'reports']) { body.querySelector('.crd-nav [data-n="' + n + '"]').click(); await wait(10); }
  ck('every page under the pills works (Reports shows the reports with charts)', /Reports/.test(body.querySelector('.crd-title').textContent) && !!body.querySelector('.crw-rep'));
  body.querySelector('.crd-nav [data-n="team"]').click(); await wait(10);

  // ---- every role does real work: numbers, charts and advice
  const all9 = C.TPL.map((t) => { const tmp = { id: 'tmp_' + t.id, tpl: t.id, n: t.n, title: t.title, job: t.job, tools: t.tools, enabled: true }; const r = C.SK[C.skillsOf(tmp)[0]].build(tmp, '', null); return { id: t.id, r }; });
  ck('all nine roles return 4+ metrics, a chart and advice from the data', all9.every((x) => x.r.metrics.length >= 4 && x.r.charts.length >= 1 && x.r.sections.length >= 1 && x.r.summary));
  ck('every chart type draws', ['bars', 'line', 'donut', 'gauge', 'hills', 'week', 'matrix'].every((t) => /<svg/.test(C.chart({ type: t, value: 50, data: [{ label: 'a', value: 2, x: 1, y: 3 }, { label: 'b', value: 5, x: 2, y: 2 }] }, 'card'))));
  const brief = all9.find((x) => x.id === 'chief').r;
  ck('the Chief of Staff ranks what to do first and blocks out the day', /Invoice Harper for March/.test(brief.sections[0].text) && /09:00/.test(brief.sections[1].text));
  const zoe = C.hire(C.TPL.find((t) => t.id === 'content'));
  const zr = C.snapshot(C.emp(zoe.id));
  ck('Zoe plans 7 posts: day, platform, format, hook, outline, caption and hashtags', zr.ideas.length === 7 && zr.ideas.every((x) => x.day && x.platform && x.format && x.hook.length > 10 && x.beats.length === 3 && x.caption && /#/.test(x.tags)));
  ck('Zoe sets goals for the week, with numbers', /Post 7 times this week/.test(zr.sections[0].text));
  ck('Zoe charts the content mix', zr.charts[0].type === 'donut' && zr.charts[0].data.reduce((a2, b2) => a2 + b2.value, 0) === 7);
  C.paint(); await wait(10);
  body.querySelector('.crd-tabs [data-t="' + zoe.id + '"]').click(); await wait(20);
  ck('her tab shows the skill live: title, stats, tiles with charts and the 7 ideas', /Zoe/.test(body.querySelector('.crd-title').textContent) && body.querySelectorAll('.crd-stat').length === 4 && body.querySelectorAll('.crd-t').length === 5 && body.querySelectorAll('.crd-idea').length === 7);
  const posts0 = w.KovaPost.all().length;
  body.querySelector('.crd-idea [data-c="idea"]').click(); await wait(20);
  ck('"Save as a Studio draft" puts that idea in the Studio', w.KovaPost.all().length === posts0 + 1 && /Saved in the Studio/.test(body.querySelector('.crd-idea [data-c="idea"]').textContent));
  C._S.down.server = true;
  const zj = C.start(C.emp(zoe.id), 'Draft this week’s posts in the Studio', 'you'); await wait(250);
  ck('asked to draft, Zoe writes 3 posts into the Studio and reports with charts', zj.state === 'done' && zj.report.ideas.length === 7 && zj.report.charts.length >= 3 && w.KovaPost.all().length === posts0 + 4);
  const lj = C.start(C.emp(leo.id), 'Write 3 posts about our tote bags', 'you'); await wait(350);
  ck('a job in a teammate’s lane is handed over, even offline', lj.state === 'done' && /handed it over/.test(lj.say) && C.jobsOf(zoe.id).some((j) => j.source === 'handoff'));
  C._S.down.server = false;
  const sys = C.system(C.emp(zoe.id)), wr = C.toolDefs(C.emp(zoe.id)).find((t) => t.name === 'write_report');
  ck('on the server, Claude gets the role’s brief and Kova’s analysis to start from', /WHAT GOOD WORK LOOKS LIKE/.test(sys) && /5 to 7 concrete post ideas/.test(sys) && /ANALYSIS BEFORE YOU START/.test(sys));
  ck('and its reports can carry charts and post ideas', !!wr.input_schema.properties.charts && !!wr.input_schema.properties.ideas);

  // ---- hiring and editing, with grouped suggestions
  C._S.view = 'team'; C._S.tab = 'all'; C.paint(); await wait(10);
  body.querySelector('.crd-tabs [data-c="hire"]').click(); await wait(20);
  [...body.querySelectorAll('[data-c="tpl"]')].filter((b) => /Content Producer/.test(b.textContent))[0].click(); await wait(20);
  ck('hiring opens the job to edit before they join', !!doc.getElementById('crwJ') && /content pipeline/.test(doc.getElementById('crwJ').value));
  ck('suggestions are one closed menu per field, not rows of buttons', body.querySelectorAll('.crd-sug').length >= 4 && [...body.querySelectorAll('.crd-menu')].every((m) => m.hidden));
  body.querySelector('[data-c="sug"][data-s="j"]').click(); await wait(10);
  const jm = body.querySelector('[data-s="j"]').closest('.crd-sug').querySelector('.crd-menu');
  ck('opening one shows its groups', !jm.hidden && /Start like a role/.test(jm.textContent) && /Add a rule/.test(jm.textContent));
  doc.body.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(10);
  ck('clicking elsewhere closes it', [...body.querySelectorAll('.crd-menu')].every((m) => m.hidden));
  doc.getElementById('crwN').value = 'Robin';
  body.querySelector('[data-c="grp"][data-g="email"]').click(); await wait(20);
  body.querySelector('[data-c="save"]').click(); await wait(30);
  const robin = E().filter((x) => x.n === 'Robin')[0];
  ck('the new hire joins with your name and tools', !!robin && robin.title === 'Content Producer' && robin.tools.indexOf('email') >= 0 && robin.tools.indexOf('content') >= 0);
  ck('a hire from the gallery keeps the suggested routine', robin.routine.freq === 'off' && /three posts/.test(robin.routine.job));
  body.querySelector('[data-c="edit"]').click(); await wait(20);
  doc.getElementById('crwJ').value = 'I own the podcast and the newsletter.';
  const fq = doc.getElementById('crwFreq'); fq.value = 'weekdays'; fq.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(20);
  ck('choosing a routine shows its time and job', !!doc.getElementById('crwTime') && !!doc.getElementById('crwRJ'));
  body.querySelector('[data-c="save"]').click(); await wait(20);
  ck('editing saves the job description and the routine', C.emp(robin.id).job === 'I own the podcast and the newsletter.' && C.emp(robin.id).routine.freq === 'weekdays');
  ck('and routing follows the new description', RT('What should go in the next newsletter?') === 'Content Producer');
  ck('three appearances are styled', /body\.soft-light \.crd\{/.test(html) && /body\.light-mode \.crd\{/.test(html) && /body\.soft-light \.crw\{/.test(html));
  ck('Work OS uses the main background in soft light and light glass', /body\.light-mode \.app\.app\[data-pillar="work"\]\{background:radial-gradient\(ellipse 140% 105% at 50% -10%,#EAE8E4/.test(html) && /body\.soft-light \.app\.app\[data-pillar="work"\]\{background:radial-gradient\(ellipse 135% 100% at 50% -8%,#5C5E66/.test(html));

  // ---- the server route
  const { cleanCrew } = require('../functions/api.js');
  const cc = cleanCrew({ system: 's', tools: [{ name: 'list_tasks', description: 'd', input_schema: { type: 'object', properties: {} } }, { name: 'bad name' }, { name: 'web_search' }],
    messages: [{ role: 'user', content: 'go' }, { role: 'assistant', content: [{ type: 'text', text: 'ok' }, { type: 'image', source: {} }] }], web: 'yes' });
  ck('server: keeps valid tools, drops bad names and a smuggled web_search', cc.tools.map((t) => t.name).join() === 'list_tasks');
  ck('server: drops block types it does not pass on, and web must be exactly true', cc.messages[1].content.length === 1 && cc.web === false);
  let threw = ''; try { cleanCrew({ messages: [{ role: 'assistant', content: 'hi' }] }); } catch (x) { threw = x.message; }
  ck('server: a job must start with the person’s message', /starts with your message/.test(threw));

  let p = 0, f = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? p++ : f++; });
  console.log('\n' + p + '/' + (p + f) + ' passing');
  if (errors.length) { console.log('runtime errors: ' + errors.length); errors.slice(0, 6).forEach((e) => console.log('  ' + e)); }
  process.exit(f || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
