import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { memoryStore } from '../server/store.mjs';
import { verifyState } from '../server/crypto.mjs';

const ENV = {
  TOKEN_ENCRYPTION_KEY: 'test-secret', PUBLIC_URL: 'https://kova.test',
  X_CLIENT_ID: 'xid', X_CLIENT_SECRET: 'xsec',
  LINKEDIN_CLIENT_ID: 'lid', LINKEDIN_CLIENT_SECRET: 'lsec',
  OURA_CLIENT_ID: 'oid', OURA_CLIENT_SECRET: 'osec',
  RESEND_API_KEY: 're_test', MAIL_FROM: 'Kova <hi@kova.test>', AI_DAILY_LIMIT: '2'
};

/* fake network: route table keyed by "METHOD url-prefix" */
function fakeFetch(routes, log = []) {
  return async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    log.push({ method, url: String(url), init });
    for (const [k, fn] of Object.entries(routes)) {
      const [m, prefix] = k.split(' ');
      if (m === method && String(url).startsWith(prefix)) {
        const out = await fn(String(url), init);
        const status = out.status || 200;
        return new Response(typeof out.body === 'string' ? out.body : JSON.stringify(out.body ?? out),
          { status, headers: out.headers || { 'content-type': 'application/json' } });
      }
    }
    return new Response('{"error":"no route"}', { status: 404 });
  };
}

function setup(routes = {}, over = {}) {
  const store = memoryStore();
  const log = [];
  const aiCalls = [];
  const app = createApp({
    env: { ...ENV, ...(over.env || {}) }, store, fetch: fakeFetch(routes, log),
    verifyIdToken: async t => { if (t === 'bad') throw new Error('bad'); return { uid: 'u1', email: 'a@b.co', anonymous: t === 'anon' }; },
    users: { findOrCreateByEmail: async e => ({ uid: 'mail-' + e, name: '' }), customToken: async uid => 'ct:' + uid },
    claude: over.claude !== undefined ? over.claude : async (p) => {
      aiCalls.push(p);
      if (p.output_config && p.output_config.format) {
        return { content: [{ type: 'text', text: JSON.stringify({ linkedin_payload: 'L', twitter_x_payload: 'X', short_form_video_script: 'V', task_scheduler_instructions: [] }) }], stop_reason: 'end_turn' };
      }
      return { content: [{ type: 'text', text: 'hello from claude' }], stop_reason: 'end_turn' };
    },
    sleep: async () => {}
  });
  const call = (method, path, { body, token = 'good', headers = {} } = {}) => app(new Request('https://kova.test/api' + path, {
    method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  }));
  return { app, store, log, call, aiCalls };
}

async function linkX(t, extra = {}) {
  const res = await t.call('POST', '/connect/x');
  assert.equal(res.status, 200);
  const { url } = await res.json();
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://x.com/i/oauth2/authorize');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://kova.test/api/callback/x');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  const cb = await t.call('GET', '/callback/x?code=abc&state=' + encodeURIComponent(u.searchParams.get('state')), { token: null });
  assert.equal(cb.status, 200, await cb.clone().text());
  return u;
}

const X_ROUTES = (expires = 7200) => ({
  'POST https://api.x.com/2/oauth2/token': (url, init) => {
    const b = new URLSearchParams(init.body);
    if (b.get('grant_type') === 'refresh_token') return { access_token: 'x-access-2', refresh_token: 'x-refresh-2', expires_in: 7200 };
    assert.ok(b.get('code_verifier'), 'pkce verifier sent');
    assert.match(init.headers.Authorization, /^Basic /);
    return { access_token: 'x-access', refresh_token: 'x-refresh', expires_in: expires };
  },
  'GET https://api.x.com/2/users/me': () => ({ data: { id: '42', username: 'kova' } }),
  'POST https://api.x.com/2/tweets': (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer x-access');
    return { data: { id: '999', text: JSON.parse(init.body).text } };
  }
});

test('ping reports configuration without auth', async () => {
  const t = setup();
  const j = await (await t.call('GET', '/ping', { token: null })).json();
  assert.equal(j.ok, true);
  assert.equal(j.providers.x.configured, true);
  assert.equal(j.providers.tiktok.configured, false);
});

test('protected routes reject missing or bad tokens', async () => {
  const t = setup();
  assert.equal((await t.call('GET', '/status', { token: null })).status, 401);
  assert.equal((await t.call('GET', '/status', { token: 'bad' })).status, 401);
});

test('OAuth connect -> callback stores an encrypted token and status shows it linked', async () => {
  const t = setup(X_ROUTES());
  await linkX(t);
  const raw = JSON.stringify(t.store._root);
  assert.ok(!raw.includes('x-access'), 'token is not stored in plaintext');
  const st = await (await t.call('GET', '/status')).json();
  assert.deepEqual([st.x.linked, st.x.label], [true, '@kova']);
  assert.equal(st.linkedin.linked, false);
});

test('callback rejects a forged or tampered state', async () => {
  const t = setup(X_ROUTES());
  const res = await t.call('GET', '/callback/x?code=abc&state=eyJ1aWQiOiJldmlsIn0.forged', { token: null });
  assert.equal(res.status, 400);
  assert.equal(verifyState('eyJ1aWQiOiJldmlsIn0.forged', 'test-secret'), null);
});

test('unconfigured provider refuses to start a login', async () => {
  const t = setup();
  const res = await t.call('POST', '/connect/tiktok');
  assert.equal(res.status, 501);
});

test('publish to X posts the caption with the linked token', async () => {
  const t = setup(X_ROUTES());
  await linkX(t);
  const res = await t.call('POST', '/call/x', { body: { path: '/kova/publish', body: { platform: 'x', caption: 'Shipped it', tags: ['build'] } } });
  const j = await res.json();
  const out = JSON.parse(j.body);
  assert.equal(out.ok, true);
  assert.equal(out.url, 'https://x.com/i/web/status/999');
  const sent = t.log.find(l => l.url === 'https://api.x.com/2/tweets');
  assert.equal(JSON.parse(sent.init.body).text, 'Shipped it\n\n#build');
});

test('expiring token is refreshed before use', async () => {
  const t = setup({ ...X_ROUTES(30), 'POST https://api.x.com/2/tweets': (u, init) => {
    assert.equal(init.headers.Authorization, 'Bearer x-access-2');
    return { data: { id: '1' } };
  } });
  await linkX(t);
  const j = await (await t.call('POST', '/call/x', { body: { path: '/kova/publish', body: { platform: 'x', caption: 'hi' } } })).json();
  assert.equal(JSON.parse(j.body).ok, true);
});

test('video platforms say they need media instead of pretending', async () => {
  const t = setup({ 'POST https://oauth2.googleapis.com/token': () => ({ access_token: 'g', expires_in: 3600 }) },
    { env: { GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 's' } });
  const { url } = await (await t.call('POST', '/connect/youtube')).json();
  const state = new URL(url).searchParams.get('state');
  await t.call('GET', '/callback/youtube?code=c&state=' + encodeURIComponent(state), { token: null });
  const j = await (await t.call('POST', '/call/youtube', { body: { path: '/kova/publish', body: { platform: 'youtube', caption: 'x' } } })).json();
  assert.deepEqual(JSON.parse(j.body).error, 'needs_media');
});

test('LinkedIn post goes to /rest/posts as the member', async () => {
  const t = setup({
    'POST https://www.linkedin.com/oauth/v2/accessToken': () => ({ access_token: 'li', expires_in: 5000000 }),
    'GET https://api.linkedin.com/v2/userinfo': () => ({ sub: 'abc123', name: 'Isa R' }),
    'POST https://api.linkedin.com/rest/posts': (u, init) => {
      const b = JSON.parse(init.body);
      assert.equal(b.author, 'urn:li:person:abc123');
      assert.equal(init.headers['X-Restli-Protocol-Version'], '2.0.0');
      return { status: 201, body: '', headers: { 'x-restli-id': 'urn:li:share:7' } };
    }
  });
  const { url } = await (await t.call('POST', '/connect/linkedin')).json();
  await t.call('GET', '/callback/linkedin?code=c&state=' + encodeURIComponent(new URL(url).searchParams.get('state')), { token: null });
  const j = await (await t.call('POST', '/call/linkedin', { body: { path: '/kova/publish', body: { platform: 'linkedin', caption: 'Hello' } } })).json();
  assert.equal(JSON.parse(j.body).ok, true);
});

test('generic /call is pinned to the provider API base', async () => {
  const t = setup({ ...X_ROUTES(), 'GET https://api.x.com/2/users/42': () => ({ data: { id: '42' } }) });
  await linkX(t);
  const ok = await (await t.call('POST', '/call/x', { body: { path: '/2/users/42' } })).json();
  assert.equal(ok.status, 200);
  assert.equal((await t.call('POST', '/call/x', { body: { path: '//evil.com/x' } })).status, 400);
  assert.equal((await t.call('POST', '/call/x', { body: { path: '/a/../b' } })).status, 400);
});

test('health webhook: key -> ingest (Health Auto Export) -> latest', async () => {
  const t = setup();
  const k = await (await t.call('POST', '/health/key')).json();
  assert.match(k.ingestUrl, /^https:\/\/kova\.test\/api\/health\/ingest\?k=/);
  const hae = { data: { metrics: [
    { name: 'resting_heart_rate', units: 'count/min', data: [{ date: '2026-09-24 07:00:00', qty: 54, source: 'Amazfit GTR 4' }] },
    { name: 'step_count', data: [{ date: '2026-09-24 09:00', qty: 4000 }, { date: '2026-09-24 12:00', qty: 3100 }] },
    { name: 'sleep_analysis', data: [{ date: '2026-09-24', totalSleep: 7.25, deep: 1.1, rem: 1.5 }] }
  ] } };
  const ing = await (await t.call('POST', '/health/ingest?k=' + k.key, { body: hae, token: null })).json();
  assert.equal(ing.ok, true);
  const latest = await (await t.call('GET', '/health/latest?k=' + k.key, { token: null })).json();
  assert.equal(latest.hr, 54);
  assert.equal(latest.steps, 7100);
  assert.equal(latest.sleep, '435');
  assert.equal(latest.deep, 66);
  assert.equal(latest.device, 'Amazfit GTR 4');
  assert.equal((await t.call('GET', '/health/latest?k=nope', { token: null })).status, 401);
});

test('health webhook accepts flat JSON from any bridge and drops junk', async () => {
  const t = setup();
  const k = await (await t.call('POST', '/health/key')).json();
  await t.call('POST', '/health/ingest?k=' + k.key, { body: { hr: '61', hrv: 48, steps: -5, evil: '<script>' }, token: null });
  const latest = await (await t.call('GET', '/health/latest?k=' + k.key, { token: null })).json();
  assert.equal(latest.hr, 61);
  assert.equal(latest.hrv, 48);
  assert.equal(latest.steps, undefined);
  assert.equal(latest.evil, undefined);
});

test('rotating the ingest key revokes the old one', async () => {
  const t = setup();
  const a = await (await t.call('POST', '/health/key')).json();
  await t.call('POST', '/health/key');
  assert.equal((await t.call('POST', '/health/ingest?k=' + a.key, { body: { hr: 50 }, token: null })).status, 401);
});

test('wearable sync pulls Oura into app fields', async () => {
  const t = setup({
    'POST https://api.ouraring.com/oauth/token': () => ({ access_token: 'oa', refresh_token: 'or', expires_in: 86400 }),
    'GET https://api.ouraring.com/v2/usercollection/personal_info': () => ({ email: 'a@b.co', id: 'o1' }),
    'GET https://api.ouraring.com/v2/usercollection/sleep': () => ({ data: [{ type: 'long_sleep', total_sleep_duration: 26100, deep_sleep_duration: 4800, rem_sleep_duration: 5400, light_sleep_duration: 15900, awake_time: 1800, average_hrv: 52, lowest_heart_rate: 49, average_breath: 14.5 }] }),
    'GET https://api.ouraring.com/v2/usercollection/daily_readiness': () => ({ data: [{ score: 81, temperature_deviation: -0.2 }] }),
    'GET https://api.ouraring.com/v2/usercollection/daily_activity': () => ({ data: [{ steps: 8123, active_calories: 420, equivalent_walking_distance: 6500 }] }),
    'GET https://api.ouraring.com/v2/usercollection/daily_spo2': () => ({ status: 500 })
  });
  const { url } = await (await t.call('POST', '/connect/oura')).json();
  await t.call('GET', '/callback/oura?code=c&state=' + encodeURIComponent(new URL(url).searchParams.get('state')), { token: null });
  const j = await (await t.call('GET', '/wearables/sync?date=2026-09-24')).json();
  assert.equal(j.sources.oura.ok, true);
  assert.deepEqual(
    [j.fields.sleep, j.fields.deep, j.fields.hrv, j.fields.hr, j.fields.score, j.fields.steps, j.fields.distance, j.fields.temp, j.fields.device],
    ['7h15m', 80, 52, 49, 81, 8123, 6.5, '-0.2°C', 'Oura']);
});

test('email code sign-in issues a Firebase custom token, once', async () => {
  let sent = '';
  const t = setup({ 'POST https://api.resend.com/emails': (u, init) => { sent = JSON.parse(init.body).text; return { id: 'e1' }; } });
  assert.equal((await t.call('POST', '/auth/code', { body: { email: 'Me@Example.com' }, token: null })).status, 200);
  const code = /(\d{6})/.exec(sent)[1];
  const bad = await (await t.call('POST', '/auth/verify', { body: { email: 'me@example.com', code: '000000' === code ? '111111' : '000000' }, token: null })).json();
  assert.equal(bad.ok, false);
  const ok = await (await t.call('POST', '/auth/verify', { body: { email: 'me@example.com', code }, token: null })).json();
  assert.deepEqual([ok.ok, ok.token], [true, 'ct:mail-me@example.com']);
  const again = await (await t.call('POST', '/auth/verify', { body: { email: 'me@example.com', code }, token: null })).json();
  assert.equal(again.ok, false, 'codes are single use');
  assert.equal((await t.call('POST', '/auth/code', { body: { email: 'me@example.com' }, token: null })).status, 200);
  assert.equal((await t.call('POST', '/auth/code', { body: { email: 'me@example.com' }, token: null })).status, 429);
});

test('chat answers through Claude and enforces the daily cap', async () => {
  const t = setup();
  const body = { messages: [{ role: 'user', content: 'how much protein?' }], snapshot: { weight: 80 } };
  const a = await (await t.call('POST', '/chat', { body })).json();
  assert.equal(a.text, 'hello from claude');
  assert.match(t.aiCalls[0].system[1].text, /"weight":80/);
  await t.call('POST', '/chat', { body });
  assert.equal((await t.call('POST', '/chat', { body })).status, 429);
});

test('AI proxy pins params the current models reject', async () => {
  const t = setup();
  const j = await (await t.call('POST', '/ai', { body: { model: 'whatever', temperature: 0, max_tokens: 99999, system: 's', messages: [{ role: 'user', content: 'x' }] } })).json();
  assert.equal(j.content[0].text, 'hello from claude');
  const p = t.aiCalls[0];
  assert.equal(p.temperature, undefined);
  assert.equal(p.model, undefined, 'model is chosen by makeClaude, not the client');
  assert.equal(p.max_tokens, 4000);
});

test('content engine returns schema-shaped JSON', async () => {
  const t = setup();
  const j = await (await t.call('POST', '/script', { body: { universal_workflow_ingestion: { user_raw_input: 'I shipped auth' }, open_tasks: [{ id: 't1', name: 'Deck' }] } })).json();
  assert.equal(j.linkedin_payload, 'L');
  assert.equal(t.aiCalls[0].output_config.format.type, 'json_schema');
});

test('AI routes explain when no key is configured', async () => {
  const t = setup({}, { claude: null });
  const r = await t.call('POST', '/chat', { body: { messages: [{ role: 'user', content: 'hi' }] } });
  assert.equal(r.status, 503);
});
