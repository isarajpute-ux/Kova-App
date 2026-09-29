/* The server on Netlify (functions/netlify.js and what it adds):
   the /api adapter, sign-in on every private route, /chat, files on
   Netlify Blobs with signed, ranged links, account export and delete,
   push reminders, the background worker's claim (nothing publishes
   twice) and the 5-minute timer. Runs against in-memory fakes of
   Firebase, Netlify Blobs and the network; nothing is deployed. */
const path = require('path');
const Module = require('module');

// ---------------------------------------------------------- fake Firebase
const store = {};
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function get(p) {
  let o = store;
  for (const k of p.split('/').filter(Boolean)) { if (o == null || typeof o !== 'object') return null; o = o[k]; }
  return o === undefined ? null : clone(o);
}
function set(p, v) {
  const parts = p.split('/').filter(Boolean);
  let o = store;
  parts.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || !o[k]) o[k] = {}; o = o[k]; });
  if (v === null || v === undefined) delete o[parts[parts.length - 1]];
  else o[parts[parts.length - 1]] = clone(v);
}
function ref(p = '') {
  return {
    child: (c) => ref(p + '/' + c),
    once: async () => ({ val: () => get(p) }),
    set: async (v) => set(p, v),
    remove: async () => set(p, null),
    update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); },
    transaction: async (fn) => {
      const v = fn(get(p));
      if (v === undefined) return { committed: false, snapshot: { val: () => get(p) } };
      set(p, v);
      return { committed: true, snapshot: { val: () => clone(v) } };
    }
  };
}
const deletedUsers = [];
const pushes = [];
const fakeAdmin = {
  apps: [],
  initializeApp(o) { this.apps.push(o); this.opts = o; },
  credential: { cert: (sa) => ({ sa }) },
  database: () => ({ ref }),
  auth: () => ({
    verifyIdToken: async (t) => { if (String(t).startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad'); },
    getUser: async (uid) => ({ uid, email: uid + '@x.test' }),
    deleteUser: async (uid) => { deletedUsers.push(uid); }
  }),
  messaging: () => ({
    sendEachForMulticast: async (m) => {
      pushes.push(m);
      return { successCount: m.tokens.filter((t) => !t.startsWith('dead')).length,
               responses: m.tokens.map((t) => (t.startsWith('dead') ? { error: { code: 'messaging/registration-token-not-registered' } } : {})) };
    }
  })
};
const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'firebase-admin') return fakeAdmin;
  return origLoad.call(this, req, ...rest);
};

// ---------------------------------------------------------- fake Blobs
const blobs = new Map();
const getStore = () => ({
  set: async (k, v) => { blobs.set(k, Buffer.from(v)); },
  setJSON: async (k, v) => { blobs.set(k, Buffer.from(JSON.stringify(v))); },
  get: async (k, o) => {
    if (!blobs.has(k)) return null;
    const b = blobs.get(k);
    if (o && o.type === 'json') return JSON.parse(b.toString('utf8'));
    if (o && o.type === 'arrayBuffer') return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
    return b.toString('utf8');
  },
  delete: async (k) => { blobs.delete(k); },
  list: async ({ prefix }) => ({ blobs: Array.from(blobs.keys()).filter((k) => k.startsWith(prefix || '')).map((key) => ({ key })) })
});

// ---------------------------------------------------------- fake network
const kicks = [];
const rcCalls = [];
const rcState = {};
let modelReplies = [];
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.includes('/.netlify/functions/worker-background')) { kicks.push(JSON.parse(opts.body).kind); return json({}, 202); }
  if (u.startsWith('https://api.anthropic.com')) {
    const body = JSON.parse(opts.body);
    if (body.tools && modelReplies.length) return json(modelReplies.shift());
    return json({ content: [{ type: 'text', text: 'Aim for 7.5 hours tonight.' }] });
  }
  if (u.includes('revoke')) return json({});
  if (u.startsWith('https://api.revenuecat.com/v1/subscribers/')) {
    rcCalls.push({ u, m: opts.method || 'GET', auth: (opts.headers || {}).authorization });
    if (opts.method === 'DELETE') return json({});
    const id = decodeURIComponent(u.split('/').pop());
    const e = rcState[id];
    return json({ subscriber: { entitlements: e ? { kova_pro: e } : {} } });
  }
  return json({ error: 'unexpected ' + u }, 500);
};

const netlify = require(path.join(__dirname, '..', 'functions', 'netlify.js'));
const envMod = require(path.join(__dirname, '..', 'functions', 'env.js'));
const { makeMedia, CH } = require(path.join(__dirname, '..', 'functions', 'media.js'));
const push = require(path.join(__dirname, '..', 'functions', 'push.js'));
const { makeAgent } = require(path.join(__dirname, '..', 'functions', 'agent.js'));

const ENV = {
  URL: 'https://kova.example', ANTHROPIC_API_KEY: 'sk-test-1234567890', KOVA_MEDIA_SECRET: 'media-secret-for-tests',
  FIREBASE_CLIENT_EMAIL: 'svc@kova.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n'
};
const api = netlify.makeApi({ admin: fakeAdmin, getStore, env: ENV });

async function call(method, p, { body, token, raw, type, headers } = {}) {
  const h = Object.assign({}, headers || {});
  if (token) h.authorization = 'Bearer ' + token;
  let b;
  if (raw) { b = raw; h['content-type'] = type || 'application/octet-stream'; }
  else if (body !== undefined) { b = JSON.stringify(body); h['content-type'] = 'application/json'; }
  const r = await api(new Request('https://kova.example' + p, { method, headers: h, body: b }), { ip: '1.2.3.4' });
  const text = Buffer.from(await r.arrayBuffer());
  let j = null;
  try { j = JSON.parse(text.toString('utf8')); } catch (e) { /* not json */ }
  return { status: r.status, body: j, bytes: text, headers: r.headers };
}

const R = [];
const ck = (n, c) => R.push([n, !!c]);

(async () => {
  // settings and Firebase Admin
  const c = envMod.fromEnv(ENV);
  ck('the api address defaults to the site URL + /api', c.base === 'https://kova.example/api');
  ck('Firebase Admin gets the service account from the environment', fakeAdmin.opts.credential.sa.client_email === ENV.FIREBASE_CLIENT_EMAIL);
  ck('escaped newlines in the private key are turned back into real ones', /KEY-----\nabc\n-----END/.test(fakeAdmin.opts.credential.sa.private_key));
  ck('missing settings are listed plainly', envMod.missing({}).length === 2 && envMod.missing(ENV).length === 0);

  // routing
  ck('/api/ping answers', (await call('GET', '/api/ping')).body.ok === true);
  ck('the rewritten path answers too', (await call('GET', '/.netlify/functions/api/ping')).body.ok === true);
  ck('CORS preflight is 204', (await call('OPTIONS', '/api/status')).status === 204);
  ck('an unknown route is 404', (await call('GET', '/api/nope')).status === 404);

  // every private route refuses a missing or forged token
  /* every route ROUTES.md marks as signed-in only, from the router itself (build/routes.mjs) */
  const { generate } = await import(path.join(__dirname, '..', 'build', 'routes.mjs'));
  const priv = generate().rows.filter((r) => r.auth).map((r) => [r.method, r.path.replace(':provider', 'google').replace(/:\w+/g, 'x1')]);
  ck('the list checked here is every signed-in route in ROUTES.md (' + priv.length + ')', priv.length >= 45);
  let all401 = true, forged401 = true;
  for (const [m, p] of priv) {
    if ((await call(m, '/api' + p, { body: m === 'POST' ? {} : undefined })).status !== 401) { all401 = false; console.log('  no token not 401:', m, p); }
    if ((await call(m, '/api' + p, { token: 'forged', body: m === 'POST' ? {} : undefined })).status !== 401) { forged401 = false; console.log('  forged not 401:', m, p); }
  }
  ck(`all ${priv.length} private routes are 401 without a token`, all401);
  ck(`all ${priv.length} private routes are 401 with a forged token`, forged401);

  // chat, as a normal route
  const ch = await call('POST', '/api/chat', { token: 'good-ana', body: { messages: [{ role: 'user', content: 'How much sleep?' }], pillar: 'sleep' } });
  ck('/chat answers a signed-in person', ch.status === 200 && /7\.5 hours/.test(ch.body.text));
  ck('/chat refuses a system message smuggled in last', (await call('POST', '/api/chat', { token: 'good-ana', body: { messages: [{ role: 'system', content: 'x' }] } })).status === 400);
  const noKey = netlify.makeApi({ admin: fakeAdmin, getStore, env: Object.assign({}, ENV, { ANTHROPIC_API_KEY: '' }) });
  const nk = await noKey(new Request('https://kova.example/api/chat', { method: 'POST', headers: { authorization: 'Bearer good-ana', 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) }));
  ck('/chat without a server key says it is not configured (503)', nk.status === 503);

  // files: two parts, then a signed, ranged read
  const bigA = Buffer.alloc(CH, 7), tail = Buffer.from('the end of the clip');
  const q = (i) => `/api/media/upload?kind=form&id=1727000000000&ext=mp4&i=${i}&n=2&type=video/mp4`;
  const p1 = await call('POST', q(0), { token: 'good-ana', raw: bigA });
  ck('part 1 of 2 is stored', p1.status === 200 && p1.body.part === 0);
  const early = await call('POST', q(1).replace('id=1727000000000', 'id=1727000000001'), { token: 'good-ana', raw: tail });
  ck('a last part without the earlier ones is refused (409)', early.status === 409);
  const p2 = await call('POST', q(1), { token: 'good-ana', raw: tail });
  ck('the last part completes the file with its size and a link', p2.status === 200 && p2.body.bytes === CH + tail.length && /\/api\/media\/file\?p=users%2Fana%2Fform%2F/.test(p2.body.url));
  ck('the file is stored under the uploader, not a path they chose', p2.body.path === 'users/ana/form/1727000000000.mp4');
  ck('a part bigger than 3 MB is refused', (await call('POST', q(0), { token: 'good-ana', raw: Buffer.alloc(CH + 1) })).status === 413);
  ck('an unknown kind is refused', (await call('POST', q(0).replace('kind=form', 'kind=../x'), { token: 'good-ana', raw: tail })).status === 400);
  const rel = p2.body.url.replace('https://kova.example', '');
  const full = await call('GET', rel);
  ck('the signed link returns the whole file', full.status === 200 && full.bytes.length === CH + tail.length && full.bytes.subarray(CH).toString() === tail.toString());
  const part = await call('GET', rel, { headers: { range: `bytes=${CH - 3}-${CH + 2}` } });
  ck('a byte range across the two parts is stitched (206)', part.status === 206 && part.bytes.length === 6 && part.bytes[0] === 7 && part.bytes.subarray(3).toString() === 'the' && part.headers.get('content-range') === `bytes ${CH - 3}-${CH + 2}/${CH + tail.length}`);
  ck('a forged signature is refused (403)', (await call('GET', rel.replace(/s=[^&]+/, 's=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'))).status === 403);
  const m = makeMedia({ store: getStore(), secret: ENV.KOVA_MEDIA_SECRET, base: 'https://kova.example/api', now: () => 1000e3 });
  const old = m.link('users/ana/form/1727000000000.mp4', 60e3).replace('https://kova.example', '');
  ck('an expired link is refused (403)', (await call('GET', old)).status === 403);
  const bucket = netlify.config({ getStore, env: ENV }, '').media.bucket;
  const [md] = await bucket.file('users/ana/form/1727000000000.mp4').getMetadata();
  const [whole] = await bucket.file('users/ana/form/1727000000000.mp4').download();
  ck('publishing reads files through the same bucket shape as Firebase Storage', md.size === CH + tail.length && md.contentType === 'video/mp4' && whole.length === md.size);
  const [signed] = await bucket.file('users/ana/form/1727000000000.mp4').getSignedUrl({ expires: Date.now() + 3 * 3600e3 });
  ck('platforms that fetch by URL get a link that expires', /&e=\d{9,}&s=/.test(signed));
  const tmpUp = await call('POST', '/api/media/upload?kind=food&id=1727000000009&ext=jpg&i=0&n=1&type=image/jpeg', { token: 'good-ana', raw: Buffer.from('plate') });
  ck('someone else\'s file cannot be removed', (await call('POST', '/api/media/remove', { token: 'good-bo', body: { path: tmpUp.body.path } })).status === 403);
  const rm = await call('POST', '/api/media/remove', { token: 'good-ana', body: { path: tmpUp.body.path } });
  ck('your own file is removed, parts and record', rm.status === 200 && !Array.from(blobs.keys()).some((k) => k.startsWith('users/ana/food/1727000000009.jpg')));
  ck('and the other file is untouched', blobs.has('users/ana/form/1727000000000.mp4::meta'));

  // push reminders
  ck('a device registers', (await call('POST', '/api/devices', { token: 'good-ana', body: { token: 'fcm-token-aaaaaaaaaaaaaaaaaaaa', platform: 'web' } })).body.ok);
  await call('POST', '/api/devices', { token: 'good-ana', body: { token: 'dead-token-bbbbbbbbbbbbbbbbbbbb', platform: 'ios' } });
  const saved = await call('POST', '/api/reminders', { token: 'good-ana', body: { tz: 'America/Chicago', quiet: { from: '23:00', to: '07:00' },
    items: { bed: { kind: 'bedtime', title: 'Bedtime in 30 minutes', body: 'Start winding down.', time: '22:00', screen: 'sleep' },
             water: { kind: 'water', title: 'Water', time: '06:30', screen: 'fuel' },
             bad: { kind: 'water', time: '25:99' } } } });
  ck('reminders are saved, bad times dropped', saved.body.count === 2);
  // 22:03 in Chicago on 2026-09-28 (CDT, UTC-5) = 03:03 UTC on the 29th
  const at = Date.UTC(2026, 8, 29, 3, 3);
  const P = push.makePush({ db: fakeAdmin.database(), messaging: fakeAdmin.messaging(), cfg: { base: 'https://kova.example/api' }, now: () => at });
  const t1 = await P.tick();
  ck('the bedtime reminder goes out at 22:00 in their time zone', t1.sent === 1 && pushes.length === 1 && pushes[0].notification.title === 'Bedtime in 30 minutes');
  ck('the notification opens the right screen', pushes[0].data.screen === 'sleep' && pushes[0].webpush.fcmOptions.link === 'https://kova.example/?go=sleep');
  ck('a device the push service no longer knows is forgotten', Object.keys(get('srv/devices/ana')).length === 1);
  ck('it is not sent twice the same day', (await P.tick()).sent === 0);
  const quietT = Date.UTC(2026, 8, 29, 11, 31);        // 06:31 Chicago, inside quiet hours
  ck('a water reminder inside quiet hours waits', push.dueItems(get('srv/reminders/ana'), {}, quietT).length === 0);
  ck('quiet hours wrap past midnight', push.inQuiet({ from: '23:00', to: '07:00' }, 60) && !push.inQuiet({ from: '23:00', to: '07:00' }, 12 * 60));

  // background worker: claims, so nothing publishes twice
  set('srv/queue/ana/p1', { at: 1 });
  let runs = 0;
  const worker = () => netlify.makeWorker({ admin: fakeAdmin, getStore, env: ENV,
    makeOAuth: () => ({}), makePublisher: () => ({ run: async () => { runs++; await new Promise((r) => setTimeout(r, 20)); } }),
    makeAgent: () => ({ run: async () => ({}) }), makeTraction: () => ({ collect: async () => ({}) }) });
  const key = netlify.internalKey(envMod.fromEnv(ENV));
  const wreq = () => new Request('https://kova.example/.netlify/functions/worker-background', { method: 'POST', headers: { 'x-kova-internal': key, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'publish' }) });
  const [w1, w2] = await Promise.all([worker()(wreq()), worker()(wreq())]);
  ck('two workers at once publish the post once', runs === 1 && get('srv/queue/ana/p1') === null && (await w1.json()).published + (await w2.json()).published === 1);
  const bad = await worker()(new Request('https://kova.example/.netlify/functions/worker-background', { method: 'POST', body: '{}' }));
  ck('the worker refuses callers without the internal key', bad.status === 403);
  set('srv/queue/ana/p2', { at: 1, claimed: Date.now() });
  await worker()(wreq());
  ck('a job another run is holding is left alone', runs === 1 && get('srv/queue/ana/p2') !== null);
  set('srv/queue/ana/p2', null);

  // publishing kicks the worker
  kicks.length = 0;
  const cfgK = netlify.config({ getStore, env: ENV }, 'https://kova.example');
  await cfgK.kick('publish');
  ck('queuing work starts the background worker', kicks[0] === 'publish');

  // cron
  kicks.length = 0;
  set('srv/queue/bo/p9', { at: 1 });
  const cron = netlify.makeCron({ admin: fakeAdmin, getStore, env: ENV, now: () => Date.UTC(2026, 8, 29, 3, 31),
    moveDue: async () => 2, due: async () => [{ uid: 'cy', window: 'night' }], makePush: () => ({ tick: async () => ({ sent: 0 }) }) });
  const co = await cron();
  ck('the timer moves due posts and queues due audits', co.moved === 2 && co.audits === 1 && get('srv/agentQueue/cy').window === 'night');
  ck('the timer hands waiting work to the worker, and traction on the half hour', kicks.includes('all') && kicks.includes('traction'));
  set('srv/queue/bo', null); set('srv/agentQueue/cy', null);

  // the wellness audit as a plain tool-use loop (no Agent SDK process)
  set('srv/agentUsers/ana', { on: true, tz: 'UTC' });
  const ids = ['rhr', 'hrv', 'training', 'sleep', 'bedtime', 'food', 'hydration'];
  let n = 0;
  const tu = (name, input) => ({ id: 'tu' + (++n), type: 'tool_use', name, input });
  modelReplies = [
    { content: [tu('get_time_context', {})] },
    { content: [tu('read_vitals_workout', {}), tu('read_sleep', {}), tu('read_fuel', {})] },
    { content: ids.map((id) => tu('record_finding', { metric: id, status: id === 'sleep' ? 'fix' : 'ok', note: id })) },
    { content: [tu('raise_alert', { metric: 'sleep', severity: 'urgent', window: 'night', title: 'Bed by 22:30', wrong: '5h 40m last night', action: 'Lights out at 22:30.' }), tu('finish', { summary: 'Sleep needs fixing.' })] }
  ];
  const ag = await makeAgent({ db: fakeAdmin.database(), cfg: Object.assign(envMod.fromEnv(ENV), { model: 'm' }) }).run('ana', {});
  ck('the audit runs on the plain API loop on Netlify', ag.source === 'agent' && ag.findings.length === 7 && ag.alerts.length === 1 && ag.summary === 'Sleep needs fixing.');
  ck('its alert lands where the app shows it', !!get('users/ana/agent/alerts/' + ag.alerts[0].id));

  // tokens are encrypted at rest
  const seal = require(path.join(__dirname, '..', 'functions', 'seal.js'));
  const sdb = seal.database(fakeAdmin.database());
  await sdb.ref('srv/oauth/zed/facebook').set({ access_token: 'at-plain-123', refresh_token: 'rt-plain', label: 'My Page', expires_at: 5,
    extra: { pages: [{ id: 'p1', name: 'Shop', token: 'page-token-9' }], target: 'p1' } });
  const raw = get('srv/oauth/zed/facebook');
  ck('stored tokens are encrypted in the database', /^enc:v1:/.test(raw.access_token) && /^enc:v1:/.test(raw.refresh_token) && /^enc:v1:/.test(raw.extra.pages[0].token));
  ck('labels and times stay readable (status lists need them)', raw.label === 'My Page' && raw.expires_at === 5 && raw.extra.target === 'p1');
  const back = (await sdb.ref('srv/oauth/zed/facebook').once('value')).val();
  ck('the server reads them back in plain', back.access_token === 'at-plain-123' && back.extra.pages[0].token === 'page-token-9');
  ck('a whole-account read decrypts too', (await sdb.ref('srv/oauth/zed').once('value')).val().facebook.refresh_token === 'rt-plain');
  await sdb.ref('srv/oauth/zed/facebook').update({ access_token: 'refreshed-1', 'extra/target': 'p2' });
  ck('a partial update is sealed as well', /^enc:v1:/.test(get('srv/oauth/zed/facebook/access_token')) && get('srv/oauth/zed/facebook/extra/target') === 'p2');
  await sdb.ref().update({ 'srv/oauth/zed/google/access_token': 'multi-path', 'srv/health/zed/ts': 1 });
  ck('a multi-path update from the root is sealed where it lands in srv/oauth', /^enc:v1:/.test(get('srv/oauth/zed/google/access_token')) && get('srv/health/zed/ts') === 1);
  set('srv/oauth/zed/x', { access_token: 'legacy-plain' });
  ck('tokens saved before sealing still read', (await sdb.ref('srv/oauth/zed/x').once('value')).val().access_token === 'legacy-plain');
  ck('health data outside srv/oauth is untouched', get('srv/health/zed/ts') === 1);
  ck('a tampered value is refused, not misread', (() => { try { seal.dec(raw.access_token.slice(0, -4) + 'AAAA'); return false; } catch (e) { return true; } })());
  set('srv/oauth/zed', null);

  // payments: off until configured, then the costly routes need Kova Pro
  ck('with billing unset, chat is open to everyone', (await call('POST', '/api/chat', { token: 'good-free1', body: { messages: [{ role: 'user', content: 'hi' }] } })).status === 200);
  const PAY = Object.assign({}, ENV, { REVENUECAT_SECRET_KEY: 'sk_rc_test_123', REVENUECAT_WEBHOOK_AUTH: 'Bearer hook-secret' });
  const paid = netlify.makeApi({ admin: fakeAdmin, getStore, env: PAY });
  const pcall = async (m, p, o = {}) => {
    const h = { 'content-type': 'application/json' };
    if (o.token) h.authorization = 'Bearer ' + o.token;
    Object.assign(h, o.headers || {});
    const r = await paid(new Request('https://kova.example' + p, { method: m, headers: h, body: o.body ? JSON.stringify(o.body) : undefined }));
    let j = null; try { j = await r.json(); } catch (e) { /* none */ }
    return { status: r.status, body: j };
  };
  const msg = { messages: [{ role: 'user', content: 'hi' }] };
  ck('without Pro, chat answers 402 so the page shows the paywall', (await pcall('POST', '/api/chat', { token: 'good-free1', body: msg })).status === 402);
  ck('publishing needs Pro too', (await pcall('POST', '/api/publish', { token: 'good-free1', body: {} })).status === 402);
  ck('tracking routes stay free (reminders)', (await pcall('POST', '/api/reminders', { token: 'good-free1', body: { items: {} } })).status === 200);
  rcState.payer1 = { expires_date: new Date(Date.now() + 9 * 864e5).toISOString(), period_type: 'trial', product_identifier: 'kova_year' };
  ck('with an active trial, chat works', (await pcall('POST', '/api/chat', { token: 'good-payer1', body: msg })).status === 200);
  ck('RevenueCat is asked with the secret key, server side', rcCalls.some((c) => /payer1$/.test(c.u) && c.auth === 'Bearer sk_rc_test_123'));
  const before = rcCalls.length;
  await pcall('POST', '/api/chat', { token: 'good-payer1', body: msg });
  ck('the answer is cached, not asked every time', rcCalls.length === before);
  const bs = await pcall('GET', '/api/billing/status', { token: 'good-payer1' });
  ck('billing status tells the page it is Pro, and until when', bs.body.configured && bs.body.pro && bs.body.period === 'trial' && bs.body.until > Date.now());
  // a cancellation arrives by webhook
  rcState.payer1 = { expires_date: new Date(Date.now() - 1000).toISOString(), period_type: 'normal' };
  ck('a webhook without the shared secret is refused', (await pcall('POST', '/api/billing/webhook', { body: { event: { app_user_id: 'payer1' } } })).status === 401);
  ck('a forged webhook cannot grant Pro (state comes from RevenueCat)', (await pcall('POST', '/api/billing/webhook', { headers: { authorization: 'Bearer hook-secret' }, body: { event: { app_user_id: 'payer1', type: 'EXPIRATION' } } })).status === 200);
  ck('after it expires, the gate closes again', (await pcall('POST', '/api/chat', { token: 'good-payer1', body: msg })).status === 402);

  // account export and delete
  set('users/ana/store', { kova_meals: [1, 2] });
  set('srv/oauth/ana/google', { access_token: 'secret-token', label: 'me@gmail.com' });
  set('srv/healthByUser/ana', 'tokABC');
  set('srv/healthTokens/tokABC', 'ana');
  set('srv/posts/ana/p1', { state: 'ok' });
  set('srv/scheduled/ana_p7', { uid: 'ana', id: 'p7', at: 9 });
  set('srv/scheduled/bo_p1', { uid: 'bo', id: 'p1', at: 9 });
  set('users/bo/store', { keep: true });
  const ex = await call('GET', '/api/account/export', { token: 'good-ana' });
  ck('export includes synced data, posts and files', ex.status === 200 && ex.body.synced.store.kova_meals.length === 2 && ex.body.posts.p1 && ex.body.files.length === 1);
  ck('export never includes tokens', !JSON.stringify(ex.body).includes('secret-token') && ex.body.connectedAccounts[0].provider === 'google' && !JSON.stringify(ex.body).includes('fcm-token-'));
  ck('delete needs the word DELETE', (await call('POST', '/api/account/delete', { token: 'good-ana', body: {} })).status === 400);
  const del = await call('POST', '/api/account/delete', { token: 'good-ana', body: { confirm: 'DELETE' } });
  ck('delete succeeds', del.status === 200 && del.body.ok === true);
  ck('it removes their synced data, tokens, health address, posts and reminders',
    get('users/ana') === null && get('srv/oauth/ana') === null && get('srv/healthTokens/tokABC') === null && get('srv/posts/ana') === null && get('srv/reminders/ana') === null && get('srv/devices/ana') === null);
  ck('it removes their scheduled posts and nobody else\'s', get('srv/scheduled/ana_p7') === null && get('srv/scheduled/bo_p1') !== null && get('users/bo/store').keep === true);
  ck('it removes their files', Array.from(blobs.keys()).filter((k) => k.startsWith('users/ana/')).length === 0);
  ck('it deletes the sign-in account last', deletedUsers[deletedUsers.length - 1] === 'ana');

  const failed = R.filter((r) => !r[1]);
  R.forEach((r) => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
