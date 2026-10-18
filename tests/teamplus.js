/* p31: the AI team, the rest of the Grok Bot way (src/p08_teamplus.js),
   all real: the team chat with @names (in turn, each seeing the others,
   @everyone through the Chief of Staff), Do it again / Save as a skill /
   Make it a routine (and the schedule running, here and on the server),
   attachments (the photo reaches the model, storage keeps only words),
   Meet your team and the ready-made routines, Watch a page (server reads,
   compares, reports only what changed), search over the team's work, and
   Share into Kova (Android share menu). */
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
const calls = []; let script = []; const bodies = []; let inbox = []; let watchReply = null;
const reply = (j, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)) });
w.fetch = (u, o) => {
  u = String(u); calls.push([u, o]);
  if (/\/crew\/inbox$/.test(u)) return reply({ items: inbox.splice(0) });
  if (/\/crew\/(cloud|inbox\/ack)$/.test(u)) return reply({ ok: true });
  if (/\/crew\/watch\/check$/.test(u)) return reply(watchReply || { first: true, title: 'Pricing' });
  if (/\/crew\/step$/.test(u)) { bodies.push(JSON.parse(o.body)); const next = script.shift(); return next ? reply(next) : reply({ content: [{ type: 'text', text: 'ok' }] }); }
  return reply({});
};
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

const api = require(__dirname + '/../functions/api.js');
const crewSrv = require(__dirname + '/../functions/crew.js');

/* a tiny in-memory Realtime Database for the server parts */
function memDb(init) {
  const root = init || {};
  const parts = (p) => String(p).split('/').filter(Boolean);
  const get = (p) => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), root);
  const put = (p, v) => { const k = parts(p); let o = root; k.slice(0, -1).forEach((x) => { if (o[x] == null || typeof o[x] !== 'object') o[x] = {}; o = o[x]; }); if (v == null) delete o[k[k.length - 1]]; else o[k[k.length - 1]] = JSON.parse(JSON.stringify(v)); };
  const ref = (p) => ({ once: () => Promise.resolve({ val: () => { const v = get(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }),
    set: (v) => { put(p, v); return Promise.resolve(); }, remove: () => { put(p, null); return Promise.resolve(); }, child: (k) => ref(p + '/' + k) });
  return { ref, root };
}

(async () => {
  await wait(1900);
  const doc = w.document, C = w.KovaCrew, T = w.KovaTeamPlus, W = w.WorkOS, DAY = 864e5;
  const FB = w.KOVA_FB; if (FB) { FB.ok = true; FB.auth = FB.auth || {}; FB.auth.currentUser = user; }
  const done = async (j, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms && j && !/done|failed|stopped/.test(j.state)) await wait(30); return j; };
  const tpl = (t) => C.emps().filter((e) => e.tpl === t)[0];
  const host = () => doc.getElementById('workTeamHost') || doc.querySelector('.crw');
  const view = (nav, tab) => { doc.getElementById('s-workteam').classList.add('on'); C._S.view = 'team'; C._S.nav = nav; C._S.tab = tab || 'all'; C.paint(); };
  ck('the team module loaded', !!T && !!C);
  w.localStorage.removeItem('kova.crew.jobs.v1'); C._S.jobs = {};

  // ---- 4. meet your team (a team with no jobs yet)
  view('team');
  const meet = doc.querySelector('.tp-meet');
  ck('a new team shows Meet your team with what you want help with', !!meet && /What do you want help with/.test(meet.textContent) && meet.querySelectorAll('[data-tp="need"]').length >= 6);
  meet.querySelector('[data-k="train"]').click(); doc.querySelector('.tp-meet [data-k="plan"]').click();
  const meet2 = doc.querySelector('.tp-meet');
  ck('picking needs names the teammates and their first jobs', /Atlas/.test(meet2.textContent) && /Ava/.test(meet2.textContent) && /First job/.test(meet2.textContent) && /Start with Atlas/.test(meet2.textContent));
  doc.querySelector('[data-tp="meetgo"]').click(); await wait(60);
  const atlas = tpl('training'), ava = tpl('chief');
  const stTrain = (C.emp(atlas.id).skills || []).filter((x) => x.id === 'st_train')[0], stBrief = (C.emp(ava.id).skills || []).filter((x) => x.id === 'st_brief')[0];
  ck('Start turns on the ready-made routines for what you picked', stTrain && stTrain.every && stTrain.every.time === '07:00' && stBrief && stBrief.every.freq === 'daily');
  ck('…marked to run on the server too when signed in', stTrain.every.cloud === true);
  ck('…and the first teammate starts their first job, on their own page', C.jobsOf(atlas.id).length === 1 && /train today/.test(C.jobsOf(atlas.id)[0].text) && C._S.tab === atlas.id);
  await done(C.jobsOf(atlas.id)[0]);
  view('team');
  ck('Meet your team does not come back once used', !doc.querySelector('.tp-meet'));

  // ---- ready-made routines on the Routines page
  view('routines');
  const st = doc.querySelector('.tp-starters');
  ck('Routines lists the ready-made routines with switches', !!st && /Morning brief/.test(st.textContent) && /Inbox sweep/.test(st.textContent) && /Comments roundup/.test(st.textContent) && /Watch a page/.test(st.textContent));
  ck('…the ones you turned on show as on', st.querySelector('[data-k="brief"]').getAttribute('aria-checked') === 'true' && st.querySelector('[data-k="inbox"]').getAttribute('aria-checked') === 'false');
  st.querySelector('[data-tp="starter"][data-k="inbox"]').click();
  ck('a switch turns one on, on the right teammate', (C.emp(tpl('inbox').id).skills || []).some((x) => x.id === 'st_inbox' && x.every && x.every.freq === 'weekdays'));
  doc.querySelector('.tp-starters [data-tp="starter"][data-k="inbox"]').click();
  ck('…and off again', !(C.emp(tpl('inbox').id).skills || []).some((x) => x.id === 'st_inbox'));

  // ---- 1. team chat
  view('chat');
  ck('the AI team has a Chat page with a pill in its menu', !!doc.querySelector('.crd-pill[data-n="chat"]') && /Team chat/.test(host().textContent));
  ck('the chat box has @ chips for everyone and each teammate', !!doc.querySelector('[data-tp="at"][data-n="everyone"]') && !!doc.querySelector('[data-tp="at"][data-n="Sage"]') && !!doc.getElementById('tpChat'));
  doc.querySelector('[data-tp="at"][data-n="Sage"]').click(); doc.querySelector('[data-tp="at"][data-n="Maya"]').click();
  ck('tapping a chip writes @name into the box', /@Sage @Maya/.test(doc.getElementById('tpChat').value));
  const m = T.mentions('@sage and @Maya, plan it');
  ck('@names are found in order, any case', m.list.length === 2 && m.list[0].n === 'Sage' && m.list[1].n === 'Maya');
  const n0 = bodies.length;
  script = [{ content: [{ type: 'text', text: 'Train legs Tuesday; eat 140 g protein.' }] }, { content: [{ type: 'text', text: 'Post the leg day on Tuesday evening.' }] }];
  doc.getElementById('tpChat').value = '@Sage @Maya plan this week’s posts around my training';
  doc.querySelector('[data-tp="chatsend"]').click();
  const t0 = Date.now(); while (Date.now() - t0 < 4000 && T.chat().round) await wait(40);
  const b1 = bodies[n0], b2 = bodies[n0 + 1];
  const first = (b) => { const c = b.messages[0].content; return typeof c === 'string' ? c : c.map((x) => x.text || '').join(' '); };
  ck('the first @name answers first, told it is a team chat', b1 && /You are Sage/.test(b1.system) && /TEAM CHAT/.test(first(b1)) && /teammates Maya/.test(first(b1)));
  ck('the next one sees what the first said and builds on it', b2 && /You are Maya/.test(b2.system) && /already answered/.test(first(b2)) && /140 g protein/.test(first(b2)));
  const msgs = T.chat().msgs;
  ck('the chat keeps your message and both answers, in order', msgs.length === 3 && msgs[0].who === 'you' && msgs[1].who === tpl('nutrition').id && msgs[2].who === tpl('social').id && T.chat().round === null);
  view('chat');
  const thread = doc.querySelector('.tp-chat').textContent;
  ck('the chat shows both answers with who said them', /Sage/.test(thread) && /140 g protein/.test(thread) && /Post the leg day/.test(thread));
  ck('each answer is a real job on that teammate’s page', C.jobsOf(tpl('nutrition').id).some((j) => j.source === 'chat' && j.state === 'done'));

  script = [{ content: [{ type: 'text', text: 'You have two meetings.' }] }];
  T.send('what is on today?', null);
  await wait(400);
  const ms2 = T.chat().msgs;
  ck('no @name: Kova picks who owns it and says so', ms2.some((x) => x.who === 'sys' && /Kova gave it to/.test(x.t)));
  await wait(300);
  const n1 = bodies.length;
  script = [{ content: [{ type: 'text', text: 'Here is the team view.' }] }];
  T.send('@everyone what should I focus on?', null);
  const t1 = Date.now(); while (Date.now() - t1 < 3000 && T.chat().round) await wait(40);
  ck('@everyone goes to the Chief of Staff, who is told to bring the team in', bodies[n1] && /You are Ava/.test(bodies[n1].system) && /use delegate/.test(first(bodies[n1])) && bodies[n1].tools.some((t) => t.name === 'delegate'));

  // a hand-off inside the chat shows as the next teammate's message
  script = [{ content: [{ type: 'tool_use', id: 'h1', name: 'hand_off', input: { to: 'Maya', job: 'Draft the caption' } }] }, { content: [{ type: 'text', text: 'Handed it to Maya.' }] }, { content: [{ type: 'text', text: 'Caption: Leg day.' }] }];
  T.send('@Sage write the caption', null);
  await wait(1500); view('chat');
  ck('a teammate’s hand-off shows in the chat', /handed over by Sage/.test(doc.querySelector('.tp-chat').textContent) && /Caption: Leg day/.test(doc.querySelector('.tp-chat').textContent));

  // ---- 3. attachments
  const sage = tpl('nutrition');
  view('team', sage.id);
  ck('a teammate’s message box has attach and voice buttons', !!doc.querySelector('[data-tp="attach"][data-box="crwEmpAsk"]'));
  const txt = await T.readFile(new w.File(['Lunch: chicken 200 g, rice 150 g'], 'lunch.txt', { type: 'text/plain' }));
  ck('a text file is read into words', txt && txt.k === 'text' && /chicken 200 g/.test(txt.text));
  const bad = await T.readFile(new w.File(['x'], 'a.docx', { type: 'application/msword' })).catch((e) => e);
  ck('a file Kova cannot read says so, plainly', bad && bad.message && /Photos, videos, PDFs and text files work/.test(bad.message));
  T._S.pend.crwEmpAsk = [{ n: 'plate.jpg', k: 'image', imgs: ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ'], th: 'data:image/jpeg;base64,/9j/th' }, txt];
  C.paint();
  ck('picked files show under the box, each removable', doc.querySelectorAll('.tp-pend .tp-file').length === 2 && !!doc.querySelector('[data-tp="unattach"]'));
  const n2 = bodies.length;
  script = [{ content: [{ type: 'text', text: 'That plate is about 45 g protein.' }] }];
  doc.getElementById('crwEmpAsk').value = 'How much protein is this?';
  doc.querySelector('[data-c="empask"]').click();
  await wait(400);
  const pb = bodies[n2], pc = pb && pb.messages[0].content;
  ck('the photo goes to Kova’s AI as an image, with the file’s words', Array.isArray(pc) && pc[0].type === 'image' && pc[0].source.media_type === 'image/jpeg' && /chicken 200 g/.test(pc[pc.length - 1].text) && /plate\.jpg/.test(pc[pc.length - 1].text));
  const stored = w.localStorage.getItem('kova.crew.jobs.v1');
  ck('storage keeps the words but never the photo itself', stored.indexOf('/9j/4AAQSkZJRgABAQ') < 0);
  view('team', sage.id);
  ck('the job shows what was attached', /plate\.jpg/.test(doc.querySelector('.crw-you').parentNode.parentNode.textContent) || [...doc.querySelectorAll('.crw-you')].some((x) => /plate\.jpg/.test(x.textContent)));
  ck('the server keeps a real photo and drops a fake one', (() => {
    const ok = api.cleanCrew({ messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }, { type: 'image', source: { type: 'base64', media_type: 'text/html', data: 'PGh0bWw+' } }, { type: 'text', text: 'hi' }] }] });
    const c = ok.messages[0].content; return c.length === 2 && c[0].type === 'image' && c[1].type === 'text';
  })());
  ck('…at most four photos in a job, and they do not count as text', (() => {
    const im = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'A'.repeat(300000) } };
    const c = api.cleanCrew({ messages: [{ role: 'user', content: [im, im, im, im, im, { type: 'text', text: 'x' }] }] }).messages[0].content;
    return c.filter((x) => x.type === 'image').length === 4;
  })());

  // ---- 2. do it again, save as a skill, make it a routine
  view('team', sage.id);
  const again = doc.querySelector('.tp-again');
  ck('a finished job offers Do it again, Save as a skill and Make it a routine', !!again && /Do it again/.test(again.textContent) && /Save as a skill/.test(again.textContent) && /Make it a routine/.test(again.textContent));
  const lastJob = C.jobsOf(sage.id).filter((j) => j.state === 'done').slice(-1)[0];
  doc.querySelector('#job-' + lastJob.id + ' [data-tp="saveskill"]').click();
  ck('Save as a skill keeps it on the teammate', (C.emp(sage.id).skills || []).some((x) => x.text === lastJob.text));
  view('team', sage.id);
  ck('their page lists the saved skill with Run', /Saved skills/.test(host().textContent) && !!doc.querySelector('[data-tp="skrun"]'));
  doc.querySelector('#job-' + lastJob.id + ' [data-tp="pick"]').click();
  const pick = doc.querySelector('.tp-pick');
  ck('Make it a routine asks how often, when, and whether to run while closed', !!pick && !!pick.querySelector('[data-tpf="freq"]') && !!pick.querySelector('[data-tpf="time"]') && !!pick.querySelector('[data-tpf="cloud"]'));
  const fsel = pick.querySelector('[data-tpf="freq"]'); fsel.value = 'weekly'; fsel.dispatchEvent(new w.Event('change', { bubbles: true }));
  const dsel = doc.querySelector('.tp-pick [data-tpf="dow"]'); dsel.value = '3'; dsel.dispatchEvent(new w.Event('change', { bubbles: true }));
  const tin = doc.querySelector('.tp-pick [data-tpf="time"]'); tin.value = '18:30'; tin.dispatchEvent(new w.Event('input', { bubbles: true }));
  doc.querySelector('.tp-pick [data-tp="picksave"]').click();
  const sk = (C.emp(sage.id).skills || []).filter((x) => x.text === lastJob.text)[0];
  ck('…and saves it as its own routine (weekly, the day and time you picked)', sk && sk.every && sk.every.freq === 'weekly' && sk.every.dow === 3 && sk.every.time === '18:30' && sk.every.cloud === true);
  // a schedule whose time has come runs, once
  const now = new Date(), hh = ('0' + Math.max(0, now.getHours() - 1)).slice(-2) + ':00';
  T.setEvery(C.emp(sage.id), sk.id, { freq: 'daily', time: hh }); W.update('agents', sage.id, { skills: C.emp(sage.id).skills.map((x) => x.id === sk.id ? Object.assign({}, x, { last: Date.now() - 2 * DAY }) : x) }, 'user');
  script = [{ content: [{ type: 'text', text: 'Scheduled run done.' }] }];
  const before = C.jobsOf(sage.id).length;
  T.tick(); await wait(300); T.tick();
  ck('a saved skill runs when its time comes, once', C.jobsOf(sage.id).length === before + 1 && C.jobsOf(sage.id).slice(-1)[0].source === 'skill');
  // the server learns the schedules and watched pages
  calls.length = 0; C._S.cloudKey = null;
  T.setEvery(C.emp(sage.id), sk.id, { freq: 'daily', time: '06:15', cloud: true });
  await wait(100);
  const cl = calls.filter((c) => /\/crew\/cloud$/.test(c[0])).map((c) => JSON.parse(c[1].body)).slice(-1)[0];
  ck('saved skills marked "also while closed" are registered with the server', cl && cl.emps.some((x) => x.id === sage.id && x.sk === sk.id && x.time === '06:15'));

  // ---- 5. watch a page
  const ravi = tpl('research');
  view('team', ravi.id);
  ck('the Research teammate’s page has Watch a page', !!doc.getElementById('tpWatch') && !!doc.getElementById('tpWUrl'));
  doc.getElementById('tpWUrl').value = 'rival.com/pricing'; doc.getElementById('tpWNote').value = 'prices';
  calls.length = 0; watchReply = { first: true, title: 'Pricing' };
  doc.querySelector('[data-tp="watchadd"]').click(); await wait(200);
  const wl = C.emp(ravi.id).watches || [];
  ck('Watch it saves the page (https added) and takes its first copy', wl.length === 1 && wl[0].url === 'https://rival.com/pricing' && calls.some((c) => /\/crew\/watch\/check$/.test(c[0]) && /rival\.com/.test(c[1].body)));
  ck('…and says what happens next', /saved how it looks now/.test(C.emp(ravi.id).watches[0].res));
  inbox = [{ id: 'wz1', emp: ravi.id, text: 'Watch https://rival.com/pricing', at: Date.now(), watch: wl[0].id, steps: [{ t: 'Read Pricing', k: 'read' }], proposals: [], report: { title: 'What changed on rival.com', summary: '1 new line', metrics: [], sections: [{ heading: 'New on the page', text: '- Pro $29/mo' }] }, say: 'rival.com changed: 1 new, 0 gone.' }];
  watchReply = { changed: true, added: 1, removed: 0, id: 'wz1' };
  await T.checkWatch(C.emp(ravi.id), wl[0].id); await wait(300);
  ck('a change is reported as a job with what is new', C.jobsOf(ravi.id).some((j) => j.source === 'watch' && j.report && /Pro \$29/.test(j.report.sections[0].text)) && /It changed: 1 new/.test(C.emp(ravi.id).watches[0].res));
  view('team', ravi.id);
  ck('a watch report is not offered as "Do it again"', ![...doc.querySelectorAll('.crw-jobw')].some((x) => /Watch https/.test(x.textContent) && x.querySelector('.tp-again')));
  calls.length = 0; C._S.cloudKey = null; C.syncCloud(); await wait(100);
  const cl2 = calls.filter((c) => /\/crew\/cloud$/.test(c[0])).map((c) => JSON.parse(c[1].body)).slice(-1)[0];
  ck('watched pages are registered with the server', cl2 && cl2.watches.some((x) => x.url === 'https://rival.com/pricing' && x.emp === ravi.id && x.note === 'prices'));

  // a skill that ran on the server marks the skill, not the routine
  const lr = C.emp(sage.id).lastRoutine || 0, at = Date.now();
  C.importCloud({ id: 'cs1', emp: sage.id, sk: sk.id, text: 'skill text', at, steps: [], proposals: [], say: 'Ran.' });
  ck('a skill run on the server marks that skill, not the routine', (C.emp(sage.id).skills.filter((x) => x.id === sk.id)[0].last || 0) >= at && (C.emp(sage.id).lastRoutine || 0) === lr);

  // ---- 6. search finds the team's work
  const rows = w.KovaCmd.build('rival.com');
  ck('search finds the watch report and the watched page under Team work', rows.some((r) => r.group === 'Team work' && /What changed on rival\.com/.test(r.t)) && rows.some((r) => r.group === 'Team work' && /Watching rival\.com/.test(r.t)));
  const rows2 = w.KovaCmd.build('protein');
  ck('…and a past job by what was said in it', rows2.some((r) => r.group === 'Team work' && r.kind === 'job'));

  // ---- 7. share into Kova
  const store = {};
  w.caches = { open: () => Promise.resolve({ match: (k) => Promise.resolve(store[k] ? { json: () => Promise.resolve(store[k]), blob: () => Promise.resolve(new w.Blob([store[k]])) } : null) }), delete: () => { Object.keys(store).forEach((k) => delete store[k]); return Promise.resolve(true); } };
  store['share-in/meta'] = { title: 'Rival launches Pro', text: 'They cut prices', url: 'https://rival.com/blog', files: [] };
  w.history.replaceState(null, '', '/?shared=1');
  await T.checkShare();
  const sh = doc.getElementById('tpShare');
  ck('a share opens "Shared to Kova" with the text and every teammate', !!sh && /Rival launches Pro/.test(sh.textContent) && /Team chat/.test(sh.textContent) && sh.querySelectorAll('[data-tp="shareto"]').length > 3);
  ck('…and the address is cleaned up', !/shared=1/.test(w.location.search));
  sh.querySelector('[data-tp="shareto"][data-e="chat"]').click(); await wait(300);
  ck('sending it to the team chat fills the chat box', C._S.nav === 'chat' && /Rival launches Pro/.test((doc.getElementById('tpChat') || {}).value || '') && !doc.getElementById('tpShare'));
  store['share-in/meta'] = { title: 'Call the printer', text: '', url: '', files: [] }; w.history.replaceState(null, '', '/?shared=1');
  await T.checkShare(); doc.querySelector('[data-tp="sharetask"]').click();
  ck('…or it becomes a task', W.list('items').some((i) => i.name === 'Call the printer'));
  const man = JSON.parse(fs.readFileSync(__dirname + '/../manifest.webmanifest', 'utf8'));
  const sw = fs.readFileSync(__dirname + '/../sw.js', 'utf8');
  ck('Kova is in the Android share menu (photos, videos, PDFs, text)', man.share_target && man.share_target.method === 'POST' && man.share_target.params.files[0].accept.includes('image/*') && /share-in/.test(sw) && /shared=1/.test(sw));

  // ---- the server: schedules, page watching
  const cc = crewSrv.cleanCloud({ tz: 'Europe/London', emps: [{ id: 'e1', freq: 'daily', time: '07:00' }, { id: 'e1', sk: 'k9', freq: 'weekly', dow: 3, time: '18:30' }],
    watches: [{ id: 'w1', url: 'https://rival.com/p', emp: 'e2', note: 'prices' }, { id: 'w2', url: 'javascript:alert(1)', emp: 'e2' }] });
  ck('server: a skill’s schedule is its own entry, bad addresses are dropped', cc.emps.e1 && cc.emps['e1~k9'] && cc.emps['e1~k9'].dow === 3 && cc.watches.w1 && !cc.watches.w2);
  const t = Date.UTC(2026, 9, 21, 6, 10);   /* a Wednesday, 07:10 in London */
  const db = memDb({ srv: { crewCloud: { u1: Object.assign(cc, { wchk: { w1: t - 7 * 3600e3 } }) } } });
  const due = await crewSrv.due(db, t);
  ck('server: a daily routine and a watch older than 6 hours are due', due.some((d) => d.emp === 'e1') && due.some((d) => d.emp === 'watch~w1'));
  db.root.srv.crewCloud.u1.wchk.w1 = t - 3600e3;
  ck('server: a page checked an hour ago is not read again yet', !(await crewSrv.due(db, t)).some((d) => d.emp === 'watch~w1'));
  db.root.users = { u1: { store: { kova_profile_v2: { work_os: { agents: [{ id: 'e1', crew: true, enabled: true, n: 'Sage', title: 'Nutrition Coach', job: 'x', routine: { freq: 'daily', job: 'Routine job' }, skills: [{ id: 'k9', text: 'Weekly skill job' }] }] } } } } };
  const sent = [];
  const mk = crewSrv.makeCrew({ db, cfg: { anthropicKey: 'k' }, now: () => t, fetch: (u, o) => { sent.push(JSON.parse(o.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ content: [{ type: 'text', text: 'Done it.' }] }) }); } });
  await mk.run('u1', 'e1~k9', { slotAgo: 10 });
  const items = Object.values(db.root.users.u1.crewInbox || {});
  ck('server: a scheduled skill runs its own words, and the result says which skill', sent[0] && sent[0].messages[0].content === 'Weekly skill job' && items.some((x) => x.sk === 'k9') && db.root.srv.crewCloud.u1.ran['e1~k9']);
  let page = { title: 'Pricing', text: 'Basic $9/mo.\nPro $19/mo.\nContact us.' };
  const wk = crewSrv.makeCrew({ db, cfg: {}, now: () => t, fetchPage: () => Promise.resolve(page) });
  const r1 = await wk.watch('u1', 'w1');
  ck('server: the first read keeps a copy and reports nothing', r1.first === true && db.root.srv.crewCloud.u1.wsnap.w1.lines.length >= 3);
  const r2 = await wk.watch('u1', 'w1');
  ck('server: the same page again is no change', r2.changed === false);
  page = { title: 'Pricing', text: 'Basic $9/mo.\nPro $29/mo.\nContact us.\nNew: team plan.' };
  const r3 = await wk.watch('u1', 'w1');
  const rep = Object.values(db.root.users.u1.crewInbox).filter((x) => x.watch === 'w1')[0];
  ck('server: a change becomes a report of only what is new and what is gone', r3.changed && r3.added === 2 && r3.removed === 1 && rep && /Pro \$29/.test(rep.report.sections[0].text) && /Pro \$19/.test(rep.report.sections[1].text));
  ck('server: what you watch for comes first (prices)', /^- Pro \$29/.test(rep.report.sections[0].text));
  ck('server: re-registering keeps the page copies', (() => { const s = fs.readFileSync(__dirname + '/../functions/api.js', 'utf8'); return /\['ran', 'wchk', 'wsnap'\]/.test(s) && /\/crew\/watch\/check/.test(s); })());

  ck('no script errors', !errors.filter((e) => !/Not implemented|navigation/i.test(e)).length);
  const bad2 = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  if (errors.length) console.log(errors.slice(0, 5).join('\n'));
  console.log(`${R.length - bad2.length}/${R.length} teamplus`);
  process.exit(bad2.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
