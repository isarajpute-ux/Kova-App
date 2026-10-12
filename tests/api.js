/* functions/api.js: behaviour, not presence.

   Runs the real router against an in-memory Realtime Database, a fake
   Firebase Auth, and a fake network, so every route is exercised end to
   end without deploying anything or holding any real key. */
const Module = require('module');
const path = require('path');

// ---------------------------------------------------------- fake admin
const store = {};
function get(p) {
  const parts = p.split('/').filter(Boolean);
  let o = store;
  for (const k of parts) { if (o == null || typeof o !== 'object') return null; o = o[k]; }
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
    child: (c) => ref(p + '/' + c),
    once: async () => ({ val: () => get(p) }),
    set: async (v) => set(p, v),
    remove: async () => set(p, null),
    update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); },
    transaction: async (fn) => { const v = fn(get(p)); set(p, v); return { snapshot: { val: () => v } }; }
  };
}
const users = {};
const fakeAdmin = {
  initializeApp() {},
  database: () => ({ ref }),
  auth: () => ({
    verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad'); },
    getUserByEmail: async (e) => { if (users[e]) return users[e]; const x = new Error('nf'); x.code = 'auth/user-not-found'; throw x; },
    createUser: async ({ email }) => (users[email] = { uid: 'u_' + email.split('@')[0], email, emailVerified: true }),
    updateUser: async () => {},
    createCustomToken: async (uid) => 'custom-' + uid
  })
};
const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'firebase-admin') return fakeAdmin;
  return origLoad.call(this, req, ...rest);
};
const api = require(path.join(__dirname, '..', 'functions', 'api.js'));

// ---------------------------------------------------------- fake network
const sent = [];
global.fetch = async (url, opts = {}) => {
  sent.push({ url: String(url), opts });
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (u.startsWith('https://api.resend.com')) return json({ id: 'm1' });
  if (u === 'https://oauth2.googleapis.com/token') {
    const b = new URLSearchParams(opts.body);
    if (b.get('grant_type') === 'authorization_code') return json({ access_token: 'at1', refresh_token: 'rt1', expires_in: 3600, scope: 'openid https://www.googleapis.com/auth/youtube.readonly' });
    return json({ access_token: 'at2', expires_in: 3600 });
  }
  if (u.includes('/oauth2/v3/userinfo')) return json({ email: 'me@gmail.com' });
  if (u.includes('/calendar/v3/')) return json({ items: [{ summary: 'Standup', start: { dateTime: '2026-09-24T09:00:00Z' } }] });
  if (u.includes('/youtube/v3/channels')) return json({ items: [{ id: 'CH1' }] });
  if (u.includes('/youtube/v3/commentThreads')) return json({ items: [{ id: 'c1', snippet: { videoId: 'v1', topLevelComment: { snippet: { authorDisplayName: '@a', textOriginal: 'how do I start?', publishedAt: '2026-09-23T10:00:00Z', likeCount: 3 } } } }] });
  if (u.includes('/youtube/v3/videos')) return json({ items: [{ id: 'v1', snippet: { title: 'My split' } }] });
  if (u.includes('oauth2.googleapis.com/revoke')) return json({});
  if (u.startsWith('https://api.anthropic.com')) return json({ content: [{ type: 'text', text: '```json\n{"twitter_x_payload":"hi","task_scheduler_instructions":[{"task_id":"t1","action":"defer","reason":"low HRV"}]}\n```' }] });
  return json({ error: 'unexpected ' + u }, 500);
};

// ---------------------------------------------------------- harness
const cfg = {
  base: 'https://example.test/api', anthropicKey: 'sk-test-123456789', googleId: 'gid',
  googleSecret: 'gsecret-123456', resendKey: 're_test_123456', mailFrom: 'Kova <a@b.c>', model: 'm'
};
function call(method, url, { body, token, c } = {}) {
  const [p, qs] = url.split('?');
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  const req = { method, path: p, body: body || {}, query: Object.fromEntries(new URLSearchParams(qs || '')), ip: '1.2.3.4', get: (h) => headers[h.toLowerCase()] };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      status(s) { this.statusCode = s; return this; },
      set(k, v) { if (typeof k === 'string') this.headers[k] = v; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); },
      send(t) { resolve({ status: this.statusCode, body: t }); }
    };
    api.handle(req, res, c || cfg);
  });
}

const R = [];
const ck = (n, c) => R.push([n, !!c]);

(async () => {
  ck('ping answers', (await call('GET', '/ping')).body.ok);
  ck('CORS preflight is answered', (await call('OPTIONS', '/status')).status === 204);
  ck('unknown route is 404', (await call('GET', '/nope')).status === 404);

  // auth gate
  ck('status without a token is 401', (await call('GET', '/status')).status === 401);
  ck('status with a forged token is 401', (await call('GET', '/status', { token: 'forged' })).status === 401);
  { const f = await call('GET', '/status', { token: 'forged' }), keys = require('../functions/env').capabilities().firebaseAdmin;
    ck('a server without its Firebase keys says so, instead of "your session expired"', keys || /missing its Firebase keys/.test(JSON.stringify(f.body))); }

  // health relay
  const t1 = await call('POST', '/health/token', { token: 'good-alice' });
  const url = t1.body.url || '';
  ck('health token issues a personal URL', /^https:\/\/example\.test\/api\/health\/[A-Za-z0-9_-]{30,}$/.test(url));
  const tok = url.split('/').pop();
  ck('same account gets the same URL back', (await call('POST', '/health/token', { token: 'good-alice' })).body.url === url);
  const hae = { data: { metrics: [
    { name: 'resting_heart_rate', data: [{ date: '2026-09-23 07:00', qty: 57, source: 'Apple Watch Ultra' }] },
    { name: 'heart_rate_variability', data: [{ date: '2026-09-23 07:00', qty: 62.4 }] },
    { name: 'step_count', data: [{ date: '2026-09-23 10:00', qty: 4000 }, { date: '2026-09-23 18:00', qty: 5000 }, { date: '2026-09-22 18:00', qty: 99999 }] },
    { name: 'sleep_analysis', data: [{ date: '2026-09-23', totalSleep: 7.2 }] }
  ] } };
  const p1 = await call('POST', '/health/' + tok, { body: hae });
  ck('Health Auto Export payload is accepted', p1.status === 200 && p1.body.fields >= 4);
  const g1 = (await call('GET', '/health/' + tok)).body;
  ck('resting HR stored', g1.hr === 57);
  ck('HRV stored', g1.hrv === 62.4);
  ck('steps summed for the latest day only', g1.steps === 9000);
  ck('sleep converted to minutes', g1.sleep === '432');
  ck('device captured', /Ultra/.test(g1.device));
  ck('pull carries the server timestamp', g1.ts > 0);
  await call('POST', '/health/' + tok, { body: { steps: 12000, evil: '<script>' } });
  const g2 = (await call('GET', '/health/' + tok)).body;
  ck('a partial sync merges, not overwrites', g2.steps === 12000 && g2.hr === 57);
  ck('unknown fields are dropped', !('evil' in g2));
  ck('junk payload is rejected', (await call('POST', '/health/' + tok, { body: { nope: 1 } })).status === 422);
  ck('unknown sync address is 404', (await call('GET', '/health/' + 'x'.repeat(32))).status === 404);
  const rot = await call('POST', '/health/token', { token: 'good-alice', body: { rotate: true } });
  ck('rotate issues a new address', rot.body.url && rot.body.url !== url);
  ck('rotated-away address stops working', (await call('GET', '/health/' + tok)).status === 404);

  // OAuth
  const noG = await call('POST', '/connect/google', { token: 'good-alice', c: Object.assign({}, cfg, { googleSecret: 'unset' }) });
  ck('unconfigured provider says so (503)', noG.status === 503);
  const c1 = await call('POST', '/connect/google', { token: 'good-alice' });
  const cu = new URL(c1.body.url);
  ck('connect returns Google consent URL', cu.host === 'accounts.google.com');
  ck('consent asks for offline access', cu.searchParams.get('access_type') === 'offline');
  ck('redirect goes back to this server', cu.searchParams.get('redirect_uri') === 'https://example.test/api/oauth/callback');
  const state = cu.searchParams.get('state');
  const bad = await call('GET', '/oauth/callback?code=x&state=forged');
  ck('callback with a forged state is refused', bad.status === 400);
  const cb = await call('GET', '/oauth/callback?code=abc&state=' + state);
  ck('callback exchanges the code', cb.status === 200 && /Connected/.test(cb.body));
  ck('state is single-use', (await call('GET', '/oauth/callback?code=abc&state=' + state)).status === 400);
  ck('tokens are stored server-side only', get('srv/oauth/alice/google/refresh_token') === 'rt1');
  const st = (await call('GET', '/status', { token: 'good-alice' })).body;
  ck('status shows Google linked with its account', st.google.linked && st.google.label === 'me@gmail.com');
  ck('status mirrors YouTube from the Google scope', st.youtube.linked);
  ck('status never leaks tokens', !JSON.stringify(st).includes('rt1') && !JSON.stringify(st).includes('at1'));
  ck('another user is not linked', !(await call('GET', '/status', { token: 'good-bob' })).body.google.linked);

  const cal = await call('POST', '/call/google', { token: 'good-alice', body: { path: '/calendar/v3/calendars/primary/events?maxResults=5' } });
  ck('calendar proxy returns the body as a string', typeof cal.body.body === 'string' && JSON.parse(cal.body.body).items[0].summary === 'Standup');
  ck('proxy refuses APIs outside the allow list', (await call('POST', '/call/google', { token: 'good-alice', body: { path: '/gmail/v1/users/me/messages' } })).status === 403);
  ck('proxy refuses path traversal', (await call('POST', '/call/google', { token: 'good-alice', body: { path: '/calendar/v3/../../gmail/v1/x' } })).status === 403);
  set('srv/oauth/alice/google/expires_at', 1);
  await call('POST', '/call/google', { token: 'good-alice', body: { path: '/calendar/v3/x' } });
  ck('expired access token is refreshed', get('srv/oauth/alice/google/access_token') === 'at2');

  const ib = (await call('GET', '/inbound', { token: 'good-alice' })).body;
  ck('inbound returns YouTube comments', ib.items.length === 1 && ib.items[0].platform === 'youtube');
  ck('inbound item carries the video title', ib.items[0].post === 'My split');
  ck('inbound with nothing linked is empty, not an error', (await call('GET', '/inbound', { token: 'good-bob' })).body.items.length === 0);

  ck('disconnect works', (await call('POST', '/disconnect/google', { token: 'good-alice' })).body.ok);
  ck('disconnect removes the tokens', get('srv/oauth/alice/google') === null);

  // email code
  const code1 = await call('POST', '/auth/code', { body: { email: 'New@Example.com' } });
  ck('code is emailed', code1.body.ok && sent.some((x) => x.url.startsWith('https://api.resend.com')));
  const mail = JSON.parse(sent.filter((x) => x.url.startsWith('https://api.resend.com')).pop().opts.body);
  const code = (mail.subject.match(/\d{6}/) || [])[0];
  ck('code is not stored in plain text', !JSON.stringify(store.srv.emailCodes).includes(code));
  ck('wrong code is refused', !(await call('POST', '/auth/verify', { body: { email: 'new@example.com', code: '000000' === code ? '111111' : '000000' } })).body.ok);
  const v = (await call('POST', '/auth/verify', { body: { email: 'new@example.com', code } })).body;
  ck('right code signs in with a Firebase custom token', v.ok && v.token === 'custom-u_new');
  ck('code is single-use', !(await call('POST', '/auth/verify', { body: { email: 'new@example.com', code } })).body.ok);
  await call('POST', '/auth/code', { body: { email: 'brute@example.com' } });
  for (let i = 0; i < 5; i++) await call('POST', '/auth/verify', { body: { email: 'brute@example.com', code: '99999' + i } });
  const m2 = JSON.parse(sent.filter((x) => x.url.startsWith('https://api.resend.com')).pop().opts.body);
  const real = m2.subject.match(/\d{6}/)[0];
  ck('five wrong guesses burn the code', !(await call('POST', '/auth/verify', { body: { email: 'brute@example.com', code: real } })).body.ok);
  for (let i = 0; i < 5; i++) await call('POST', '/auth/code', { body: { email: 'spam@example.com' } });
  ck('code requests are rate limited', (await call('POST', '/auth/code', { body: { email: 'spam@example.com' } })).status === 429);
  ck('bad email is refused', (await call('POST', '/auth/code', { body: { email: 'nope' } })).status === 400);

  // script engine
  ck('script needs sign-in', (await call('POST', '/script', { body: {} })).status === 401);
  const sc = await call('POST', '/script', { token: 'good-alice', body: { universal_workflow_ingestion: { user_raw_input: 'idea' }, open_tasks: [{ id: 't1', name: 'Edit', cog: 8 }] } });
  ck('script returns parsed engine JSON (fences stripped)', sc.body.twitter_x_payload === 'hi' && sc.body.task_scheduler_instructions[0].task_id === 't1');
  const req = JSON.parse(sent.filter((x) => x.url.startsWith('https://api.anthropic.com')).pop().opts.body);
  ck('script sends the key server-side, never from the page', sent.filter((x) => x.url.startsWith('https://api.anthropic.com')).pop().opts.headers['x-api-key'] === cfg.anthropicKey);
  ck('script forwards the open tasks', /"t1"/.test(req.messages[0].content));

  let p = 0, f = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? p++ : f++; });
  console.log('\n' + p + '/' + (p + f) + ' passing');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
