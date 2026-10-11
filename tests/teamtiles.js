/* Work OS > Your team: the four tiles (On time, Work by status, Content,
   Needs you) say what their number means, and each opens a pop-up with
   the breakdown, the trend, the tasks or posts behind it and what to do.
   Also: every area stays in the tab bar, with no More button. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;

(async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova_mode_v1', 'live');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(700);
  const d = w.document, C = w.KovaCrew, W = w.WorkOS;

  // ---------- everything shows ----------
  const tabs = [...d.querySelectorAll('.rail .rnav[data-go]')].filter((n) => n.style.display !== 'none').map((n) => n.getAttribute('data-go'));
  ck('every area is in the tab bar and there is no More button', ['home', 'fuel', 'sleep', 'move', 'vitals', 'work'].every((t) => tabs.includes(t)) && !d.getElementById('kfMore') && !w.KovaFocus);

  // ---------- empty: the tiles say so in words ----------
  W.list('items').forEach((i) => W.remove && W.remove('items', i.id));
  w.go('workteam'); await wait(400); C.paint();
  const tile = (k) => d.querySelector('.crd-tiles [data-k="' + k + '"]');
  ck('with nothing finished yet, On time says "No score yet" and what starts it', /No score yet/.test(tile('ontime').textContent) && /Starts with the first dated task you finish|due soon/.test(tile('ontime').textContent));
  ck('with no posts, Content says "No posts yet" and where to start', /No posts yet/.test(tile('content').textContent) && /Studio/.test(tile('content').textContent));
  ck('Needs you with nothing waiting says "All clear"', /All clear/.test(tile('needs').textContent));

  // ---------- real work ----------
  const now = Date.now(), sod = new Date(new Date().toDateString()).getTime();
  const mk = (o) => W.create('items', Object.assign({ status: 'Not Started', priority: 'Medium' }, o));
  mk({ name: 'Ship the pricing page', status: 'Completed', due: sod - 5 * DAY, completedAt: sod - 6 * DAY, created: sod - 9 * DAY });
  mk({ name: 'Send the investor update', status: 'Completed', due: sod - 4 * DAY, completedAt: sod - 4 * DAY + 3600e3, created: sod - 8 * DAY });
  mk({ name: 'Fix the checkout bug', status: 'Completed', due: sod - 10 * DAY, completedAt: sod - 7 * DAY, created: sod - 12 * DAY });
  mk({ name: 'Renew the domain', status: 'Completed', completedAt: sod - 2 * DAY, created: sod - 3 * DAY });
  mk({ name: 'Reply to the lawyer', due: sod - 2 * DAY, priority: 'High' });
  mk({ name: 'Draft the Q4 plan', due: sod + DAY, priority: 'Critical', status: 'In Progress' });
  mk({ name: 'Hear back from the printer', status: 'Waiting', updated: now - 5 * DAY, created: now - 6 * DAY });
  C.paint(); await wait(50);
  ck('On time: 2 of 3 dated tasks finished by their date is 67%', /67%/.test(tile('ontime').textContent) && /2 of 3 by their date/.test(tile('ontime').textContent));
  ck('Work by status: open count, overdue in the line, and four labelled bars', /3/.test(tile('status').querySelector('.crd-tv').textContent) && /1 overdue/.test(tile('status').textContent)
    && [...tile('status').querySelectorAll('.crd-srows .r span')].map((s) => s.textContent).join() === 'To do,Doing,Waiting,Done');
  ck('each tile is a named button that opens its details', ['ontime', 'status', 'content', 'needs'].every((k) => tile(k).getAttribute('role') === 'button' && /Open the details/.test(tile(k).getAttribute('aria-label'))));

  // Jobs done: a real chart, one column a day, tap one to read it
  const JD = (dd, emp) => ({ id: 'jd' + dd + emp.id, emp: emp.id, text: 'Job ' + dd, state: 'done', at: now - dd * DAY, end: now - dd * DAY, source: 'you', steps: [], results: [], messages: [] });
  const [e0, e1] = C.emps();
  [JD(0, e0), JD(0, e1), JD(1, e0), JD(3, e1)].forEach((j) => { C._S.jobs[j.id] = j; });
  C.paint(); await wait(30);
  const jt = d.querySelector('.crd-jd');
  ck('Jobs done: 4 in 30 days, one column a day for 30 days', /4/.test(jt.querySelector('.crd-tv').textContent) && jt.querySelectorAll('.crd-jc .jb').length === 30 && jt.querySelectorAll('.crd-jc .jb .v').length === 3);
  ck('...today is marked, and the light sweeps across the columns', !!jt.querySelector('.jb.now .v') && !!jt.querySelector('.crd-jc .sw rect') && /@keyframes jcSweep/.test(fs.readFileSync(__dirname + '/../src/p08_crew.css', 'utf8')));
  jt.querySelector('.jb.now').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(20);
  ck('...tapping a column reads it out: 2 today, who did them', /2/.test(d.querySelector('.crd-jd .crd-jtip').textContent) && new RegExp(e0.n + ' 1').test(d.querySelector('.crd-jd .crd-jtip').textContent));
  d.querySelector('.crd-jd [data-c="jrange"][data-r="7"]').click(); await wait(20);
  ck('...7d / 30d / 90d right on the tile (90 days is 13 weekly columns)', d.querySelectorAll('.crd-jd .crd-jc .jb').length === 7 && (d.querySelector('.crd-jd [data-c="jrange"][data-r="90"]').click(), d.querySelectorAll('.crd-jd .crd-jc .jb').length === 13));
  ck('...each employee with their count, one tap to open them', [...d.querySelectorAll('.crd-jd .crd-jav')].some((b) => b.getAttribute('data-id') === e0.id && /2/.test(b.textContent)));
  C._S.range = 30; C.paint();
  d.querySelector('.crd-jd [data-k="jobs"]').click(); await wait(30);
  let jp = d.querySelector('#s-workteam .cwd-page');
  ck('...and its title opens a page: the bigger chart, who did them, the latest jobs', jp && /Jobs done/.test(jp.querySelector('.cwd-t').textContent) && jp.querySelectorAll('.crd-jc .jb').length === 30 && jp.querySelectorAll('.cwd-who').length === C.emps().length && jp.querySelectorAll('[data-cd="job"]').length === 4);
  jp.querySelector('.jb.now').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(30);
  jp = d.querySelector('#s-workteam .cwd-page');
  ck('...where a column filters the list to that day', jp.querySelectorAll('[data-cd="job"]').length === 2 && /Today/.test(jp.textContent));
  jp.querySelector('[data-cd="back"]').click(); await wait(30);
  ck('...and Back returns to the team', !d.querySelector('#s-workteam .cwd-page') && !!tile('ontime'));
  ['jd0' + e0.id, 'jd0' + e1.id, 'jd1' + e0.id, 'jd3' + e1.id].forEach((k) => delete C._S.jobs[k]); C.paint();

  // On time, in depth
  tile('ontime').click(); await wait(50);
  let sh = d.querySelector('#s-workteam .cwd-page');
  ck('On time opens a page of its own (not a sheet): 67%, with on time / late / no date / overdue counts', sh && /67%/.test(sh.textContent) && /2 of 3 finished by their date; 1 late, by 2 days on average/.test(sh.textContent)
    && [...sh.querySelectorAll('.cwd-st')].map((x) => x.textContent).join('|') === '2On time|1Late|1Done, no date|1Overdue now');
  ck('...a six-week chart of on time and late', !!sh.querySelector('svg.cwd-chart rect.ok') && !!sh.querySelector('svg.cwd-chart rect.late') && /on time/.test(sh.querySelector('svg.cwd-chart').getAttribute('aria-label')));
  ck('...what is at risk now (overdue, and due in 3 days) and what was late', /Reply to the lawyer2 d overdue/.test(sh.textContent) && /Draft the Q4 plandue tomorrow/.test(sh.textContent) && /Fix the checkout bug2 days late/.test(sh.textContent));
  ck('...and how it is counted', /marked done by the end of its due day/.test(sh.textContent));
  sh.querySelector('[data-cd="range"][data-r="7"]').click(); await wait(30);
  sh = d.querySelector('#s-workteam .cwd-page');
  ck('7 / 30 / 90 days switch the period', sh.querySelector('[data-r="7"]').classList.contains('on') && /100%/.test(sh.textContent) && /2 of 2 finished by their date/.test(sh.textContent));
  sh.querySelector('[data-cd="item"]').click(); await wait(300);
  ck('tapping a task opens it', d.getElementById('s-workitem').classList.contains('on'));

  // Work by status, in depth
  w.go('workteam'); await wait(100); C._S.view = 'team'; C.paint(); tile('status').click(); await wait(50);
  sh = d.querySelector('#s-workteam .cwd-page');
  ck('Work by status: a bar for To do / Doing / Waiting / Done with counts', /To do 1/.test(sh.textContent) && /Doing 1/.test(sh.textContent) && /Waiting 1/.test(sh.textContent) && /Done 4/.test(sh.textContent));
  ck('...this week: added, finished, net and time to finish', /Added/.test(sh.textContent) && /Finished/.test(sh.textContent) && /Avg to finish/.test(sh.textContent));
  ck('...open by priority (Critical in red)', /1Critical/.test(sh.textContent) && sh.querySelector('.cwd-st.bad') && /Critical/.test(sh.querySelector('.cwd-st.bad').textContent));
  ck('...what needs a push: overdue and stuck waiting', /Reply to the lawyer2 d overdue/.test(sh.textContent) && /Hear back from the printerwaiting 5 d/.test(sh.textContent));
  ck('...and every task by status, one tap to open', sh.querySelectorAll('.cwd-det').length === 4 && sh.querySelectorAll('.cwd-det [data-cd="item"]').length === 7);
  ck('...with a way to hand the late ones to the team', !!sh.querySelector('[data-cd="ask"][data-q="Triage my overdue tasks"]'));

  // Content, in depth
  C._S.view = 'team'; C.paint(); await wait(20);
  const P = w.KovaPost;
  const p1 = Object.assign(P.blank(), { title: 'Launch reel', targets: ['instagram', 'tiktok'], status: 'sent', results: { instagram: { state: 'ok', at: now - DAY }, tiktok: { state: 'error', msg: 'Video too long', at: now - DAY } } });
  const p2 = Object.assign(P.blank(), { title: 'Friday tips', targets: ['linkedin'], status: 'scheduled', when: now + 2 * DAY });
  const p3 = Object.assign(P.blank(), { title: 'Idea: behind the scenes', targets: ['x'] });
  [p1, p2, p3].forEach((p) => P.save(p));
  C.paint(); await wait(30);
  ck('Content: 33% published, 1 of 3 posts live, 1 scheduled', /33%/.test(tile('content').textContent) && /1 of 3 posts live · 1 scheduled/.test(tile('content').textContent));
  tile('content').click(); await wait(50);
  sh = d.querySelector('#s-workteam .cwd-page');
  ck('...the pipeline: drafts, scheduled, published, failed', /1Drafts/.test(sh.textContent) && /1Scheduled/.test(sh.textContent) && /1Published/.test(sh.textContent) && /1Failed/.test(sh.textContent));
  ck('...next up, recently published, each platform, and why one failed', /Friday tips/.test(sh.textContent) && /Launch reel1 of 2 live/.test(sh.textContent) && /Instagram1 live/.test(sh.textContent) && /LinkedIn1 scheduled/.test(sh.textContent) && /TikTok: Video too long/.test(sh.textContent));

  // Needs you, in depth
  C._S.view = 'team'; C.paint(); await wait(20);
  const e = C.emps()[0];
  const job = { id: 'jtest', emp: e.id, text: 'Chase Rosa for invoice 12', state: 'waiting', at: now - 2 * 3600e3, source: 'you', steps: [{ k: 'wait', t: 'Waiting' }], results: [], messages: [],
    ask: { name: 'draft_email', input: { to: 'rosa@example.com', subject: 'Invoice 12', body: 'Hi Rosa,\nA quick reminder about invoice 12.' } },
    queue: [{ id: 'tu1', name: 'draft_email', input: { to: 'rosa@example.com', subject: 'Invoice 12', body: 'Hi Rosa' } }] };
  C._S.jobs.jtest = job;
  C.paint(); await wait(30);
  ck('Needs you: 1 approval, and how long it has waited', /1/.test(tile('needs').querySelector('.crd-tv').textContent) && /Oldest waiting 2 h/.test(tile('needs').textContent));
  tile('needs').click(); await wait(50);
  sh = d.querySelector('#s-workteam .cwd-page');
  ck('...shows who wants what, to whom, and the first line, before you approve', new RegExp(e.n + ' wants to').test(sh.textContent) && /To rosa@example\.com · Invoice 12 · Hi Rosa,/.test(sh.textContent) && /2 h ago/.test(sh.textContent));
  ck('...plus tasks waiting on someone else and what is overdue', /Hear back from the printerwaiting 5 d/.test(sh.textContent) && /Reply to the lawyer2 d overdue/.test(sh.textContent));
  sh.querySelector('[data-cd="nav"][data-n="approvals"]').click(); await wait(50);
  ck('"Review and approve" opens the full approval, editable, on the Approvals page', /Approvals/.test(d.getElementById('s-workteam').textContent) && !!d.querySelector('#s-workteam .crw-appr [data-f="subject"]'));

  // hiring in one tap
  C._S.view = 'hire'; C.paint(); await wait(20);
  const hv = d.getElementById('s-workteam'), before = C.emps().length;
  ck('Hire shows how many roles are on the team and the ones ready to hire', new RegExp(before + ' of 10 roles on your team').test(hv.textContent) && hv.querySelectorAll('[data-c="hirenow"]').length === 10 - before);
  const zoeBtn = hv.querySelector('[data-c="hirenow"][data-t="content"]');
  ck('each role says what they do, what to ask them, and has Hire and Customize', /Hire Zoe/.test(zoeBtn.textContent) && /Ask Zoe/.test(zoeBtn.closest('.crd-role').textContent) && !!zoeBtn.closest('.crd-role').querySelector('[data-c="tpl"]'));
  zoeBtn.click(); await wait(30);
  ck('one tap hires them and opens their page', C.emps().length === before + 1 && C._S.view === 'team' && C.emp(C._S.tab).n === 'Zoe' && /Zoe/.test(d.querySelector('#s-workteam .crd-title').textContent));
  C._S.view = 'hire'; C.paint(); d.querySelector('#s-workteam [data-c="tpl"][data-t="research"]').click(); await wait(20);
  const form = d.getElementById('s-workteam');
  ck('Customize shows name, title and job first; the rest sits behind "More settings"', !!form.querySelector('#crwN') && !!form.querySelector('[data-c="more2"]') && form.querySelector('.crd-morewrap').hidden);
  form.querySelector('[data-c="more2"]').click(); await wait(20);
  ck('...which opens playbook, tools, approvals and schedule', !d.querySelector('#s-workteam .crd-morewrap').hidden && !!d.querySelector('#s-workteam #crwP') && !!d.querySelector('#s-workteam [data-c="grp"]'));
  C._S.view = 'team'; C._S.draft = null; C.paint();

  // styles
  const css = fs.readFileSync(__dirname + '/../src/p08_crew.css', 'utf8');
  ck('on phones the four tiles are full-width rows (words left, chart right)', /@container \(max-width:559px\)\{[\s\S]*\.crd-tiles\{grid-template-columns:minmax\(0,1fr\)/.test(css) && /\.crd-t:not\(\.t-big\) \.crd-tc\{grid-column:2/.test(css));
  ck('the pop-ups use the sheet\'s tokens, with light-glass colours of their own', /\.cwd\{--c0:/.test(css) && /body\.light-mode #sheet \.cwd\{--c0:/.test(css) && /\.cwd-st\.bad b\{color:var\(--bad\)\}/.test(css));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
