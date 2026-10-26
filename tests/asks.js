/* Requests to your AI team that get done while Kova is closed
   (functions/asks.js), the page reader they use (functions/webpage.js),
   tomorrow's meeting prep from the calendar, the check-in, Maya's
   comments report an hour after a post, the routes, the timer and the
   worker. In-memory database, scripted Claude, fake web; no keys. */
const Module = require('module');
const path = require('path');

const store = {};
function get(p) { let o = store; for (const k of p.split('/').filter(Boolean)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : JSON.parse(JSON.stringify(o)); }
function set(p, v) { const parts = p.split('/').filter(Boolean); let o = store; parts.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || !o[k]) o[k] = {}; o = o[k]; }); if (v === null || v === undefined) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = JSON.parse(JSON.stringify(v)); }
function ref(p = '') {
  return { child: (c) => ref(p + '/' + c), once: async () => ({ val: () => get(p) }), set: async (v) => set(p, v), remove: async () => set(p, null),
    update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); },
    transaction: async (fn) => { const v = fn(get(p)); if (v !== undefined) set(p, v); return { committed: v !== undefined, snapshot: { val: () => get(p) } }; } };
}
const db = { ref };
Module._load = ((orig) => function (req, ...rest) {
  if (req === 'firebase-admin') return { initializeApp() {}, apps: [{}], database: () => db,
    auth: () => ({ verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad'); } }) };
  return orig.call(this, req, ...rest);
})(Module._load);

const FN = path.join(__dirname, '..', 'functions');
const { fetchPage, readable, checkUrl, privateIp } = require(path.join(FN, 'webpage.js'));
const A = require(path.join(FN, 'asks.js'));
const api = require(path.join(FN, 'api.js'));
const net = require(path.join(FN, 'netlify.js'));
const R = []; const ck = (n, c) => R.push([n, !!c]);
const DAY = 864e5;

(async () => {
  /* ===================== webpage.js ===================== */
  const bad = (u) => { try { checkUrl(u); return false; } catch (e) { return true; } };
  ck('page: only http and https, normal ports, no passwords in the address', bad('ftp://a.com/x') && bad('file:///etc/passwd') && bad('https://u:p@a.com') && bad('http://a.com:8080/') && !bad('https://example.com/pricing'));
  ck('page: never this machine or a private network', bad('http://localhost/') && bad('http://127.0.0.1/') && bad('http://10.0.0.5/') && bad('http://169.254.169.254/latest/meta-data') && bad('http://[::1]/') && bad('http://printer.local/'));
  ck('page: private and metadata addresses are known as private', privateIp('192.168.1.1') && privateIp('172.20.0.1') && privateIp('100.64.0.1') && privateIp('::ffff:127.0.0.1') && privateIp('fd00::1') && !privateIp('93.184.216.34'));
  const html = '<html><head><title>Acme Pricing</title><meta name="description" content="Plans for teams"></head><body><nav>Home About</nav>'
    + '<script>var secret=1</script><main><h1>Pricing</h1><p>Starter is $19 a month.</p><p>Pro is $49 a month and includes AI.</p>' + 'x '.repeat(250) + '<a href="/signup">Sign up</a></main><footer>(c) Acme</footer></body></html>';
  const rd = readable(html, 'https://acme.test/pricing');
  ck('page: title, description and the readable text, without scripts, navigation or footer', rd.title === 'Acme Pricing' && rd.description === 'Plans for teams'
    && /Starter is \$19 a month/.test(rd.text) && !/secret|Home About|\(c\) Acme/.test(rd.text));
  ck('page: links come back as full addresses', rd.links.some((l) => l.url === 'https://acme.test/signup' && l.text === 'Sign up'));
  const hdr = (o) => ({ get: (k) => o[k.toLowerCase()] || null });
  const pageFetch = (map) => async (u) => { const r = map[u]; if (!r) throw new Error('no route ' + u); return Object.assign({ ok: r.status < 400 }, r, { headers: hdr(r.headers || { 'content-type': 'text/html' }), arrayBuffer: async () => Buffer.from(r.body || '') }); };
  const publicDns = async (h) => (h === 'evil.test' ? [{ address: '10.1.2.3' }] : [{ address: '93.184.216.34' }]);
  const pg = await fetchPage('https://acme.test/pricing', { fetch: pageFetch({ 'https://acme.test/pricing': { status: 200, body: html } }), lookup: publicDns });
  ck('page: a public page is read', pg.title === 'Acme Pricing' && /Pro is \$49/.test(pg.text) && pg.url === 'https://acme.test/pricing');
  let e1 = ''; try { await fetchPage('https://evil.test/', { fetch: pageFetch({}), lookup: publicDns }); } catch (e) { e1 = e.message; }
  ck('page: a name that points inside a private network is refused', /not on the public web/.test(e1));
  let e2 = ''; try { await fetchPage('https://acme.test/go', { fetch: pageFetch({ 'https://acme.test/go': { status: 302, headers: { location: 'http://169.254.169.254/' } } }), lookup: publicDns }); } catch (e) { e2 = e.message; }
  ck('page: a redirect into a private address is refused', /not on the public web/.test(e2));
  let e3 = ''; try { await fetchPage('https://acme.test/file.pdf', { fetch: pageFetch({ 'https://acme.test/file.pdf': { status: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF' } }), lookup: publicDns }); } catch (e) { e3 = e.message; }
  ck('page: a file that is not a page is refused', /not a page/.test(e3));

  /* ===================== asks.js ===================== */
  const NOW = Date.parse('2026-10-12T13:00:00Z');    // Monday 09:00 in New York
  const TZ = 'America/New_York';
  const work = {
    items: [{ id: 'i1', name: 'Send the Harper proposal', status: 'Not Started', priority: 'High', due: NOW + 3600e3 }],
    projects: [], goals: [], meetings: [], profile: { business: 'Studio Kova' },
    agents: [
      { id: 'e_ava', crew: true, enabled: true, tpl: 'chief', n: 'Ava', title: 'Chief of Staff', job: 'I run the team.', tools: ['tasks'], budget: 150 },
      { id: 'e_ravi', crew: true, enabled: true, tpl: 'research', n: 'Ravi', title: 'Research Analyst', job: 'I find things out.', tools: ['research', 'tasks'], budget: 150 },
      { id: 'e_mia', crew: true, enabled: true, tpl: 'sched', n: 'Mia', title: 'Scheduler', job: 'I handle time.', tools: ['meetings', 'tasks'], budget: 150 },
      { id: 'e_maya', crew: true, enabled: true, tpl: 'social', n: 'Maya', title: 'Social Media Manager', job: 'I post and read comments.', tools: ['content', 'publish'], budget: 150 }
    ]
  };
  set('users/u1/store/kova_profile_v2', { v: JSON.stringify({ work_os: work }), t: 1 });
  set('srv/crewPlan/u1', { tz: TZ, prep: { on: false, time: '18:00' }, checkin: { on: false, time: '11:00' } });
  let t = NOW;
  const sent = [], calls = [];
  const push = { send: async (uid, note) => { sent.push([uid, note]); return { sent: 1 }; } };
  let script = [];
  const claude = async (url, o) => { const b = JSON.parse(o.body); calls.push(b); const next = script.shift() || { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' }; return { ok: true, json: async () => next }; };
  const pages = [];
  const calendar = { evs: [], fail: false, events: async (uid, from, to) => { if (calendar.fail) throw new Error('no google'); calendar.span = [from, to]; return calendar.evs; } };
  const traction = { comments: 0, collect: async () => ({ read: 1 }), advice: async () => ({ headline: 'Strong hook, people want the recipe.', themes: [{ theme: 'Asking for the recipe', share: 40, sentiment: 'positive', quote: 'recipe please' }, { theme: 'Love the editing', share: 25, sentiment: 'positive', quote: 'so clean' }], working: ['The first 2 seconds'], fix: ['Pin the recipe link'], next: { hook: 'The 3-ingredient version', length: '30s', when: 'Tue 7pm' } }) };
  const M = A.makeAsks({ db, cfg: { anthropicKey: 'sk-test', model: 'm' }, now: () => t, fetch: claude, push, calendar, traction,
    fetchPage: async (u) => { pages.push(u); return { url: u, title: 'Acme Pricing', text: 'Starter is $19 a month.', links: [] }; } });

  /* the request */
  let err = ''; try { await M.create('u1', { text: 'hi' }); } catch (e) { err = e.message; }
  ck('asks: an empty request is turned down', /Tell them what you need/.test(err));
  err = ''; try { await M.create('u1', { text: 'Read http://localhost/admin' }); } catch (e) { err = e.message; }
  ck('asks: a link to a private address is turned down before anything runs', /not on the public web/.test(err));
  const at11 = Date.parse('2026-10-12T15:00:00Z');
  const c1 = await M.create('u1', { emp: 'e_ravi', text: 'Read https://acme.test/pricing and tell me at 11 what we can use', deliverAt: at11 });
  const a1 = get('srv/crewAsk/u1/' + c1.id);
  ck('asks: the link is taken from the words, and it starts 4 minutes before 11', a1.url === 'https://acme.test/pricing' && a1.runAt === at11 - A.LEAD && a1.state === 'queued' && !c1.now);
  const c2 = await M.create('u1', { text: 'What is overdue?' });
  ck('asks: one with no time goes straight onto the worker’s queue', c2.now && !!get('srv/crewQueue/u1/ask_' + c2.id));
  err = ''; try { await M.create('u1', { text: 'later', deliverAt: NOW + 40 * DAY }); } catch (e) { err = e.message; }
  ck('asks: more than 30 days out is turned down', /30 days/.test(err));
  ck('asks: the list shows what is waiting', (await M.list('u1')).length === 2);

  /* due */
  let due = await M.due(t);
  ck('asks: at 09:00 only the one asked for now is due', due.length === 1 && due[0].id === c2.id);
  t = at11 - 3 * 60e3;
  due = await M.due(t);
  ck('asks: at 10:57 the 11:00 one is due too', due.some((x) => x.id === c1.id));

  /* doing it: search, read the page, report, propose */
  script = [
    { content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'acme pricing 2026' } },
      { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://news.test/acme', title: 'Acme raises prices' }] },
      { type: 'tool_use', id: 't1', name: 'fetch_page', input: { url: 'https://acme.test/pricing' } }], stop_reason: 'tool_use' },
    { content: [{ type: 'tool_use', id: 't2', name: 'create_task', input: { name: 'Match Acme’s Starter price', priority: 'High', due: 'tomorrow' } },
      { type: 'tool_use', id: 't3', name: 'write_report', input: { title: 'Acme pricing', summary: 'Acme charges $19 and $49; we can undercut Starter.', sections: [{ heading: 'What I found', text: 'Starter $19.' }] } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Report is ready.' }], stop_reason: 'end_turn' }
  ];
  const r1 = await M.run('u1', c1.id);
  const inbox = get('users/u1/crewInbox/' + c1.id);
  ck('run: the teammate you named did it, with web search and the page read', r1.delivered && inbox.emp === 'e_ravi' && pages[0] === 'https://acme.test/pricing'
    && inbox.steps.some((x) => /Searched the web: acme pricing/.test(x.t)) && inbox.steps.some((x) => /Read Acme Pricing/.test(x.t)));
  ck('run: Claude got the web search tool and the fetch_page tool', calls[0].tools.some((x) => x.type === 'web_search_20250305') && calls[0].tools.some((x) => x.name === 'fetch_page'));
  ck('run: the report comes back with the sources it used', inbox.report.title === 'Acme pricing' && inbox.report.sections.some((x) => x.heading === 'Sources' && /news\.test\/acme/.test(x.text) && /acme\.test\/pricing/.test(x.text)));
  ck('run: a change is proposed, never made on the server', inbox.proposals.length === 1 && inbox.proposals[0].name === 'create_task' && get('users/u1/store/kova_profile_v2').v.indexOf('Match Acme') < 0);
  ck('run: a notification goes out with who and what', sent.some((x) => x[0] === 'u1' && /^Ravi: Read and tell me at 11 what we can use/.test(x[1].title) && /undercut/.test(x[1].body)));
  ck('run: the request is marked done and the inbox knows when you wanted it', get('srv/crewAsk/u1/' + c1.id).state === 'done' && inbox.ask.deliverAt === at11 && inbox.ask.url === 'https://acme.test/pricing');
  ck('run: a finished request does not run twice', (await M.run('u1', c1.id)).skipped === 'not waiting');

  /* tomorrow's meetings */
  await M.setPlan('u1', { tz: TZ, prep: { on: true, time: '18:00', emp: 'e_mia' }, checkin: { on: true, time: '11:00', emp: 'e_ava' } });
  ck('plan: meeting prep and the check-in are saved with their times', get('srv/crewPlan/u1').prep.on && get('srv/crewPlan/u1').checkin.time === '11:00' && (await M.getPlan('u1')).prep.time === '18:00');
  t = Date.parse('2026-10-12T22:05:00Z');              // 18:05 in New York
  due = await M.due(t);
  const prepId = Object.keys(get('srv/crewAsk/u1')).find((k) => get('srv/crewAsk/u1/' + k).kind === 'prep');
  ck('plan: at 18:05 tomorrow’s prep becomes a request, once', !!prepId && due.some((x) => x.id === prepId) && (await M.due(t + 60e3)).filter((x) => get('srv/crewAsk/u1/' + x.id).kind === 'prep').length <= 1 && get('srv/crewPlan/u1').ran.prep === '2026-10-12');
  calendar.evs = [{ id: 'ev1', title: 'Harper pitch', start: Date.parse('2026-10-13T14:00:00Z'), end: Date.parse('2026-10-13T14:30:00Z'), description: 'Go through the proposal', organizer: 'you', attendees: [{ email: 'cto@harper.test', name: 'Dana', you: false }], location: '', link: 'https://meet.google.com/abc' }];
  calls.length = 0;
  script = [{ content: [{ type: 'tool_use', id: 'p1', name: 'write_report', input: { title: 'Tomorrow', summary: 'One meeting at 10:00: the Harper pitch. Bring the proposal.', sections: [{ heading: '10:00 Harper pitch', text: 'Bring the proposal.' }] } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Prepped.' }], stop_reason: 'end_turn' }];
  await M.run('u1', prepId);
  const prep = get('users/u1/crewInbox/' + prepId);
  ck('prep: Mia reads tomorrow’s calendar (the whole next day in your time zone) and preps each meeting', prep.emp === 'e_mia' && calendar.span[0] === Date.parse('2026-10-13T04:00:00Z') && /Harper pitch/.test(calls[0].messages[0].content) && /cto@harper\.test/.test(calls[0].messages[0].content) && /10:00 Harper pitch/.test(prep.report.sections[0].heading));
  ck('prep: the notification says the meetings are prepped', sent.some((x) => /^Mia: tomorrow’s meetings are prepped/.test(x[1].title)));
  ck('prep: it uses the quick model and only a few searches', /haiku/.test(calls[0].model) && calls[0].tools.find((x) => x.type === 'web_search_20250305').max_uses === 3);
  /* no meetings, no calendar */
  const p2 = await M.create('u1', { kind: 'prep', text: 'x' }); calendar.evs = [];
  await M.run('u1', p2.id);
  ck('prep: no meetings tomorrow says the day is clear, without spending a model call', /no meetings/i.test(get('users/u1/crewInbox/' + p2.id).report.title));
  const p3 = await M.create('u1', { kind: 'prep', text: 'x' }); calendar.fail = true;
  await M.run('u1', p3.id);
  ck('prep: no calendar connected says how to connect it', /Connect Google/.test(get('users/u1/crewInbox/' + p3.id).say));
  calendar.fail = false;

  /* check-in */
  t = Date.parse('2026-10-13T15:05:00Z');              // 11:05 the next day
  due = await M.due(t);
  const ciId = Object.keys(get('srv/crewAsk/u1')).find((k) => get('srv/crewAsk/u1/' + k).kind === 'checkin');
  calls.length = 0;
  script = [{ content: [{ type: 'tool_use', id: 'c1', name: 'read_work', input: {} }], stop_reason: 'tool_use' },
    { content: [{ type: 'tool_use', id: 'c2', name: 'write_report', input: { title: 'Checking in', summary: 'One thing is due: the Harper proposal.', sections: [{ heading: 'I can take this off your plate', text: 'I can draft it.' }, { heading: 'A question for you', text: 'Price first or scope first?' }] } }], stop_reason: 'tool_use' },
    { content: [{ type: 'text', text: 'Checked in.' }], stop_reason: 'end_turn' }];
  await M.run('u1', ciId);
  ck('check-in: at 11:05 Ava checks in on you, without web search', !!ciId && get('users/u1/crewInbox/' + ciId).emp === 'e_ava' && !calls[0].tools.some((x) => x.type === 'web_search_20250305')
    && /A question for you/.test(JSON.stringify(get('users/u1/crewInbox/' + ciId).report)) && sent.some((x) => /^Ava is checking in/.test(x[1].title)));

  /* comments an hour after a post */
  set('users/u1/traction/posts/post1', { title: 'Pasta in 10', platforms: { instagram: { metrics: { views: 1200 }, comments: [] } } });
  const cm = await M.create('u1', { kind: 'comments', ref: 'post1', emp: 'e_maya', text: 'What are people saying?', deliverAt: t + 3600e3 });
  ck('comments: it waits for the hour after the post', get('srv/crewAsk/u1/' + cm.id).runAt === t + 3600e3);
  t = t + 3600e3;
  const rq = await M.run('u1', cm.id);
  ck('comments: no comments yet, so Maya looks again in 45 minutes', rq.requeued && get('srv/crewAsk/u1/' + cm.id).state === 'queued' && get('srv/crewAsk/u1/' + cm.id).tries === 1);
  set('users/u1/traction/posts/post1/platforms/instagram/comments', [{ text: 'recipe please' }, { text: 'so clean' }, { text: 'recipe?' }]);
  await M.run('u1', cm.id);
  const cr = get('users/u1/crewInbox/' + cm.id);
  ck('comments: Maya reports the top things people say, with their share and a quote', cr.emp === 'e_maya' && /1\. Asking for the recipe \(40% of comments, positive\): “recipe please”/.test(cr.report.sections[0].text)
    && cr.report.sections.some((x) => x.heading === 'What to change next time') && cr.report.sections.some((x) => /Your next video/.test(x.heading)));
  ck('comments: the notification says what people are saying', sent.some((x) => /^Maya: here is what people are saying/.test(x[1].title)));

  /* cancel, no key */
  const later = await M.create('u1', { text: 'Find three venues', deliverAt: t + DAY });
  await M.cancel('u1', later.id);
  ck('cancel: a request that has not started can be taken back', !get('srv/crewAsk/u1/' + later.id));
  const M2 = A.makeAsks({ db, cfg: {}, now: () => t, fetch: claude, push });
  const nk = await M2.create('u1', { text: 'Anything?' });
  await M2.run('u1', nk.id);
  ck('no Claude key on the server: it says so instead of failing silently', /no Claude key/.test(get('users/u1/crewInbox/' + nk.id).say));

  /* a stuck run is retried */
  set('srv/crewAsk/u1/stuck', { id: 'stuck', kind: 'ask', text: 'x', state: 'running', startedAt: t - 30 * 60e3, runAt: t - 31 * 60e3, created: t - 31 * 60e3, tries: 0 });
  due = await M.due(t);
  ck('a run that died half way is tried again', due.some((x) => x.id === 'stuck') && get('srv/crewAsk/u1/stuck').state === 'queued');

  /* ===================== routes ===================== */
  function call(method, url, body, token) {
    const headers = { authorization: 'Bearer ' + (token || 'good-u2') };
    const req = { method, path: url, body: body || {}, query: {}, ip: '1.2.3.' + Math.floor(Math.random() * 250), get: (h) => headers[h.toLowerCase()] };
    return new Promise((resolve) => {
      const res = { statusCode: 200, headers: {}, status(s) { this.statusCode = s; return this; }, set() { return this; }, json(o) { resolve({ status: this.statusCode, body: o }); }, send(x) { resolve({ status: this.statusCode, body: x }); } };
      api.handle(req, res, { base: 'https://x.test/api', model: 'm', kick: async (k) => { kicked.push(k); } });
    });
  }
  const kicked = [];
  const ra = await call('POST', '/crew/ask', { text: 'What is overdue right now?' });
  ck('route: /crew/ask makes the request and starts the worker straight away', ra.status === 200 && ra.body.now && kicked.includes('crew') && !!get('srv/crewAsk/u2/' + ra.body.id));
  const rl = await call('GET', '/crew/asks');
  ck('route: /crew/asks lists them', rl.status === 200 && rl.body.items.length === 1);
  const rb = await call('POST', '/crew/fetch', { url: 'http://127.0.0.1:8080/' });
  ck('route: /crew/fetch refuses a private address with a plain 400', rb.status === 400 && /public web|normal web ports/.test(rb.body.error));
  const rp = await call('POST', '/crew/plan', { tz: TZ, checkin: { on: true, time: '09:30' } });
  ck('route: /crew/plan saves the check-in time', rp.status === 200 && rp.body.checkin.on && (await call('GET', '/crew/plan')).body.checkin.time === '09:30');
  ck('route: signed in only', (await call('POST', '/crew/ask', { text: 'x y z' }, 'nope')).status === 401);

  /* ===================== timer and worker ===================== */
  set('srv/crewAsk/u9/aa', { id: 'aa', kind: 'ask', text: 'x', state: 'queued', runAt: 1, created: 1 });
  const fakeAdmin = { apps: [{}], initializeApp() {}, database: () => db, messaging: () => null };
  const tick = net.makeTick({ admin: fakeAdmin, now: () => t, moveDue: async () => 0, due: async () => [], crewDue: async () => [], makePush: () => ({ tick: async () => ({ sent: 0 }) }),
    makeBilling: () => ({ trialReminders: async () => 0 }) });
  const out = await tick({ kick: async () => {} });
  ck('timer: requests whose time has come go onto the worker’s queue', out.asks >= 1 && !!get('srv/crewQueue/u9/ask_aa'));
  const ran = [];
  const jobs = net.makeJobs({ admin: fakeAdmin, now: () => t, makeAsks: () => ({ run: async (uid, id) => { ran.push(uid + ':' + id); } }), makeCrew: () => ({ run: async () => {} }), makePush: () => ({}) });
  await jobs({}, 'crew');
  ck('worker: it runs each queued request once and clears the queue', ran.includes('u9:aa') && !get('srv/crewQueue/u9/ask_aa'));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
