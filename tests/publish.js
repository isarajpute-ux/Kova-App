/* Publishing and account linking: behaviour, not presence.

   Runs the real providers.js / publish.js / api.js against an in-memory
   Realtime Database, an in-memory Storage bucket and fake YouTube,
   Instagram, TikTok, LinkedIn and X servers. Each fake answers the way
   the platform's documentation says it does, so what is checked here is
   the sequence Kova sends: the right endpoints, in order, with the right
   headers, ids and byte ranges - and that one platform failing never
   takes the others down or posts anything twice. */
const Module = require('module');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

// ------------------------------------------------------------ fake database
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
    child: (c) => ref(p + '/' + c),
    once: async () => ({ val: () => get(p) }),
    set: async (v) => set(p, v),
    remove: async () => set(p, null),
    update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); },
    transaction: async (fn) => { const v = fn(get(p)); set(p, v); return { snapshot: { val: () => v } }; },
    orderByChild: (field) => {
      let hi = Infinity, n = Infinity;
      const q = {
        endAt(v) { hi = v; return q; },
        limitToFirst(k) { n = k; return q; },
        once: async () => {
          const all = get(p) || {};
          const keys = Object.keys(all).filter((k) => (all[k][field] || 0) <= hi)
            .sort((a, b) => all[a][field] - all[b][field]).slice(0, n);
          const out = {}; keys.forEach((k) => { out[k] = all[k]; });
          return { val: () => (keys.length ? out : null) };
        }
      };
      return q;
    }
  };
}
const fakeDb = { ref };
const fakeAdmin = {
  initializeApp() {},
  database: () => fakeDb,
  auth: () => ({
    verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad'); }
  })
};
const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'firebase-admin') return fakeAdmin;
  return origLoad.call(this, req, ...rest);
};
const FN = path.join(__dirname, '..', 'functions');
const api = require(path.join(FN, 'api.js'));
const { makeOAuth } = require(path.join(FN, 'providers.js'));
const { makePublisher, moveDue, liText, xLength } = require(path.join(FN, 'publish.js'));

// ------------------------------------------------------------ fake bucket
const files = {};
const MB = 1024 * 1024;
function addFile(p, size, type) { files[p] = { size, type }; }
const bucket = {
  file(p) {
    return {
      getMetadata: async () => {
        if (!files[p]) throw new Error('No such object: ' + p);
        return [{ size: String(files[p].size), contentType: files[p].type }];
      },
      download: async () => [Buffer.alloc(files[p].size, 1)],
      createReadStream: (o = {}) => {
        const s = o.start || 0;
        const e = o.end === undefined ? files[p].size - 1 : o.end;
        return Readable.from([Buffer.alloc(e - s + 1, 2)]);
      },
      getSignedUrl: async () => [`https://signed.test/${encodeURIComponent(p)}?sig=1`]
    };
  }
};

// ------------------------------------------------------------ fake platforms
const calls = [];
let routes = [];
function R(status, body, headers = {}) {
  const h = {};
  Object.keys(headers).forEach((k) => { h[k.toLowerCase()] = headers[k]; });
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: (k) => (h[k.toLowerCase()] === undefined ? null : h[k.toLowerCase()]) },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}
function bodyOf(b) {
  if (b == null) return null;
  if (b instanceof URLSearchParams) return Object.fromEntries(b);
  if (typeof FormData !== 'undefined' && b instanceof FormData) {
    const o = {};
    for (const [k, v] of b) o[k] = (v && typeof v === 'object' && 'size' in v) ? { blob: v.size } : v;
    return o;
  }
  if (Buffer.isBuffer(b)) return { bytes: b.length };
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return b; } }
  return 'stream';
}
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  const headers = {};
  Object.keys(opts.headers || {}).forEach((k) => { headers[k.toLowerCase()] = opts.headers[k]; });
  const c = { method, url: u, headers, body: bodyOf(opts.body) };
  calls.push(c);
  for (const [match, handler] of routes) {
    if (match(method, u)) return handler(c);
  }
  c.unexpected = true;
  return R(500, { error: 'unexpected ' + method + ' ' + u });
};
const on = (method, test, handler) => routes.push([
  (m, u) => m === method && (typeof test === 'string' ? u.startsWith(test) : test.test(u)), handler]);
const since = (n) => calls.slice(n);
const find = (list, method, prefix) => list.filter((c) => c.method === method && c.url.startsWith(prefix));

// ------------------------------------------------------------ harness
const cfg = {
  base: 'https://example.test/api', anthropicKey: 'sk-test-123456789', model: 'm',
  googleId: 'gid', googleSecret: 'gsecret-123456', resendKey: 're_test_123456', mailFrom: 'Kova <a@b.c>',
  igId: 'igapp', igSecret: 'igsecret-123456', igVersion: 'v23.0',
  tiktokKey: 'ttkey', tiktokSecret: 'ttsecret-123456',
  linkedinId: 'liid', linkedinSecret: 'lisecret-123456', linkedinVersion: '202603',
  xId: 'xid', xSecret: 'xsecret-123456'
};
function call(method, url, { body, token, c } = {}) {
  const [p, qs] = url.split('?');
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  const req = { method, path: p, body: body || {}, query: Object.fromEntries(new URLSearchParams(qs || '')), ip: '1.2.3.4',
                get: (h) => headers[h.toLowerCase()] };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      status(s) { this.statusCode = s; return this; },
      set(k, v) { this.headers[k] = v; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); },
      send(t) { resolve({ status: this.statusCode, body: t }); }
    };
    api.handle(req, res, c || cfg);
  });
}
async function link(provider, code) {
  const r = await call('POST', '/connect/' + provider, { token: 'good-alice' });
  const url = new URL(r.body.url);
  const state = url.searchParams.get('state');
  const cb = await call('GET', `/oauth/callback?code=${code}&state=${state}`);
  return { url, state, cb };
}

const T = [];
const ck = (n, c) => T.push([n, !!c]);
let sleeps = 0;
const pub = makePublisher({ db: fakeDb, bucket, cfg, tokens: makeOAuth({ db: fakeDb, cfg }),
                            sleep: async () => { sleeps++; } });
async function runPost(id, payload) {
  set(`srv/posts/alice/${id}`, { payload: Object.assign({ id, media: [], text: {}, options: {}, draft: false }, payload),
                                 state: 'queued', createdAt: Date.now() });
  return pub.run('alice', id);
}

(async () => {
  // =================================================== account linking
  // Google, with upload rights
  on('POST', 'https://oauth2.googleapis.com/token', () => R(200, {
    access_token: 'g-at', refresh_token: 'g-rt', expires_in: 3600,
    scope: 'openid email https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload' }));
  on('GET', 'https://www.googleapis.com/oauth2/v3/userinfo', () => R(200, { email: 'me@gmail.com' }));
  const g = await link('google', 'gcode');
  ck('Google consent asks for YouTube uploads', /youtube\.upload/.test(g.url.searchParams.get('scope')));
  ck('Google links', g.cb.status === 200);

  // Instagram: short token -> long-lived token -> account id
  on('POST', 'https://api.instagram.com/oauth/access_token', () => R(200, {
    data: [{ access_token: 'ig-short', user_id: 17841, permissions: 'instagram_business_basic,instagram_business_content_publish' }] }));
  on('GET', 'https://graph.instagram.com/access_token?grant_type=ig_exchange_token', () => R(200, { access_token: 'ig-long', expires_in: 5184000 }));
  on('GET', 'https://graph.instagram.com/v23.0/me', () => R(200, { user_id: '17841', username: 'kova.test' }));
  const ig = await link('instagram', 'igcode');
  ck('Instagram consent goes to instagram.com', ig.url.host === 'www.instagram.com');
  ck('Instagram consent asks to publish', /instagram_business_content_publish/.test(ig.url.searchParams.get('scope')));
  const igTok = get('srv/oauth/alice/instagram');
  ck('Instagram one-hour token swapped for the 60-day one', igTok && igTok.access_token === 'ig-long');
  ck('Instagram account id kept for publishing', igTok && igTok.extra.igId === '17841');
  ck('Instagram label is the handle', igTok && igTok.label === '@kova.test');

  // TikTok: client_key, not client_id
  on('POST', 'https://open.tiktokapis.com/v2/oauth/token/', (c) => R(200, {
    access_token: 'tt-at', refresh_token: 'tt-rt', expires_in: 86400, open_id: 'o1', scope: 'user.info.basic,video.upload,video.publish',
    _sent: c.body }));
  on('GET', 'https://open.tiktokapis.com/v2/user/info/', () => R(200, { data: { user: { username: 'kovatt', open_id: 'o1' } } }));
  const n0 = calls.length;
  const tt = await link('tiktok', 'ttcode');
  ck('TikTok consent uses client_key', tt.url.searchParams.get('client_key') === 'ttkey' && !tt.url.searchParams.get('client_id'));
  ck('TikTok consent asks to post and upload', /video\.publish/.test(tt.url.searchParams.get('scope')) && /video\.upload/.test(tt.url.searchParams.get('scope')));
  const ttx = find(since(n0), 'POST', 'https://open.tiktokapis.com/v2/oauth/token/')[0];
  ck('TikTok token exchange sends client_key + secret', ttx && ttx.body.client_key === 'ttkey' && ttx.body.client_secret === 'ttsecret-123456');
  ck('TikTok links with its handle', get('srv/oauth/alice/tiktok/label') === '@kovatt');

  // LinkedIn: no refresh token, 60-day access token, member id from OpenID
  on('POST', 'https://www.linkedin.com/oauth/v2/accessToken', () => R(200, { access_token: 'li-at', expires_in: 5184000, scope: 'openid,profile,email,w_member_social' }));
  on('GET', 'https://api.linkedin.com/v2/userinfo', () => R(200, { sub: 'abc123', name: 'Isa R' }));
  const li = await link('linkedin', 'licode');
  ck('LinkedIn consent asks to post', /w_member_social/.test(li.url.searchParams.get('scope')));
  ck('LinkedIn member id kept for publishing', get('srv/oauth/alice/linkedin/extra/sub') === 'abc123');

  // X: PKCE + Basic auth
  on('POST', 'https://api.x.com/2/oauth2/token', () => R(200, { access_token: 'x-at', refresh_token: 'x-rt', expires_in: 7200, scope: 'tweet.write media.write offline.access' }));
  on('GET', 'https://api.x.com/2/users/me', () => R(200, { data: { id: '42', username: 'kova' } }));
  const n1 = calls.length;
  const xr = await link('x', 'xcode');
  ck('X consent carries a PKCE challenge', xr.url.searchParams.get('code_challenge_method') === 'S256' && !!xr.url.searchParams.get('code_challenge'));
  const xtx = find(since(n1), 'POST', 'https://api.x.com/2/oauth2/token')[0];
  ck('X token exchange uses HTTP Basic auth', xtx && xtx.headers.authorization === 'Basic ' + Buffer.from('xid:xsecret-123456').toString('base64'));
  const verifierOk = xtx && crypto.createHash('sha256').update(xtx.body.code_verifier || '').digest('base64url') === xr.url.searchParams.get('code_challenge');
  ck('X verifier matches the challenge it was issued with', verifierOk);
  ck('X links with its handle', get('srv/oauth/alice/x/label') === '@kova');
  ck('PKCE verifier never reaches the browser', !String(xr.url).includes(xtx && xtx.body.code_verifier));

  const st = (await call('GET', '/status', { token: 'good-alice' })).body;
  ck('status: every platform linked', ['google', 'instagram', 'tiktok', 'linkedin', 'x'].every((k) => st[k].linked));
  ck('status: YouTube can upload', st.youtube.canUpload === true);
  ck('status: says which platforms the server has keys for', st.instagram.configured === true && st.x.configured === true);
  ck('status: engine flag present', st._engine && st._engine.configured === true);
  ck('status never leaks tokens', !/ig-long|tt-at|li-at|x-at|g-at|g-rt/.test(JSON.stringify(st)));
  const noIg = (await call('GET', '/status', { token: 'good-alice', c: Object.assign({}, cfg, { igSecret: 'unset' }) })).body;
  ck('a platform without keys reports configured:false', noIg.instagram.configured === false);
  ck('connecting a platform without keys says so (503)',
    (await call('POST', '/connect/tiktok', { token: 'good-alice', c: Object.assign({}, cfg, { tiktokSecret: 'unset' }) })).status === 503);

  // token lifecycles
  const o = makeOAuth({ db: fakeDb, cfg });
  set('srv/oauth/alice/instagram/expires_at', Date.now() + 5 * 864e5);
  on('GET', 'https://graph.instagram.com/refresh_access_token', () => R(200, { access_token: 'ig-long-2', expires_in: 5184000 }));
  await o.get('alice', 'instagram');
  ck('Instagram token refreshed ahead of expiry', get('srv/oauth/alice/instagram/access_token') === 'ig-long-2');
  set('srv/oauth/alice/tiktok/expires_at', 1);
  on('POST', 'https://open.tiktokapis.com/v2/oauth/token/', () => R(200, { access_token: 'tt-at-2', refresh_token: 'tt-rt-2', expires_in: 86400 }));
  routes.unshift([(m, u) => m === 'POST' && u === 'https://open.tiktokapis.com/v2/oauth/token/', () => R(200, { access_token: 'tt-at-2', refresh_token: 'tt-rt-2', expires_in: 86400 })]);
  await o.get('alice', 'tiktok');
  ck('TikTok token refreshed with its refresh token', get('srv/oauth/alice/tiktok/access_token') === 'tt-at-2');
  ck('TikTok rotated refresh token is kept', get('srv/oauth/alice/tiktok/refresh_token') === 'tt-rt-2');
  routes.shift();
  const liSaved = get('srv/oauth/alice/linkedin');
  set('srv/oauth/alice/linkedin/expires_at', 1);
  let liErr = '';
  try { await o.get('alice', 'linkedin'); } catch (e) { liErr = e.message; }
  ck('expired LinkedIn token asks for a reconnect', /LinkedIn is not connected|reconnected/.test(liErr));
  ck('expired LinkedIn shows as not linked', (await call('GET', '/status', { token: 'good-alice' })).body.linkedin.linked === false);
  set('srv/oauth/alice/linkedin', liSaved);

  // =================================================== the /publish route
  addFile('users/alice/post/v1.mp4', 5 * MB, 'video/mp4');
  addFile('users/alice/post/i1.jpg', 200 * 1024, 'image/jpeg');
  addFile('users/alice/post/i2.jpg', 180 * 1024, 'image/jpeg');
  addFile('users/alice/post/i3.png', 150 * 1024, 'image/png');
  addFile('users/alice/post/big.mp4', 79167488, 'video/mp4');
  const vid = { path: 'users/alice/post/v1.mp4', type: 'video', mime: 'video/mp4' };
  const im1 = { path: 'users/alice/post/i1.jpg', type: 'image', mime: 'image/jpeg' };
  const im2 = { path: 'users/alice/post/i2.jpg', type: 'image', mime: 'image/jpeg' };
  const png = { path: 'users/alice/post/i3.png', type: 'image', mime: 'image/png' };

  ck('publish needs a platform', (await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'p0', targets: [] } } })).status === 400);
  ck('publish refuses someone else’s media',
    (await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'p0', targets: ['x'], media: [{ path: 'users/bob/post/a.jpg' }] } } })).status === 403);
  ck('publish refuses path tricks',
    (await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'p0', targets: ['x'], media: [{ path: 'users/alice/post/../../bob/a.jpg' }] } } })).status === 403);
  const nb = await call('POST', '/publish', { token: 'good-bob', body: { post: { id: 'p0', targets: ['instagram', 'x'] } } });
  ck('publish to an unlinked platform says which to connect', nb.status === 409 && /Instagram, X/.test(nb.body.error));
  ck('publish needs sign-in', (await call('POST', '/publish', { body: { post: { id: 'p0', targets: ['x'] } } })).status === 401);

  const p1 = await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'p1', targets: ['x'], text: { x: { text: 'hello' } } } } });
  ck('publish now is queued for the worker', p1.body.state === 'queued' && !!get('srv/queue/alice/p1'));
  ck('the same post cannot be queued twice', (await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'p1', targets: ['x'] } } })).status === 409);

  const later = Date.now() + 3600e3;
  const p2 = await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'p2', targets: ['x'], when: later, text: { x: { text: 'later' } } } } });
  ck('a future time is scheduled, not queued', p2.body.state === 'scheduled' && !get('srv/queue/alice/p2') && get('srv/scheduled/alice_p2/at') === later);
  ck('scheduling more than 180 days out is refused',
    (await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'p9', targets: ['x'], when: Date.now() + 200 * 864e5 } } })).status === 400);
  const cx = await call('POST', '/posts/p2/cancel', { token: 'good-alice' });
  ck('a scheduled post can be cancelled', cx.body.state === 'cancelled' && !get('srv/scheduled/alice_p2'));
  ck('a queued post cannot be cancelled', (await call('POST', '/posts/p1/cancel', { token: 'good-alice' })).status === 409);

  await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'p3', targets: ['x'], when: Date.now() + 120e3 } } });
  ck('nothing moves before its time', (await moveDue(fakeDb, Date.now())) === 0);
  const moved = await moveDue(fakeDb, Date.now() + 180e3);
  ck('due posts move into the queue', moved === 1 && !!get('srv/queue/alice/p3') && get('srv/posts/alice/p3/state') === 'queued');
  ck('the schedule entry is cleared', !get('srv/scheduled/alice_p3'));
  ck('a cancelled post is never moved', (await moveDue(fakeDb, Date.now() + 999e6)) === 0 && !get('srv/queue/alice/p2'));

  const list = (await call('GET', '/posts', { token: 'good-alice' })).body.posts;
  ck('posts list returns this user’s posts', Array.isArray(list) && list.some((x) => x.id === 'p1') && list.some((x) => x.id === 'p2'));
  ck('posts list never includes the media paths', !JSON.stringify(list).includes('users/alice/post'));
  ck('one post by id', (await call('GET', '/posts/p1', { token: 'good-alice' })).body.state === 'queued');
  ck('another user cannot read it', (await call('GET', '/posts/p1', { token: 'good-bob' })).status === 404);

  // =================================================== YouTube
  on('POST', 'https://www.googleapis.com/upload/youtube/v3/videos', () => R(200, {}, { location: 'https://upload.test/yt-session' }));
  let ytPrivacy = 'public';
  routes.unshift([(m, u) => m === 'PUT' && u === 'https://upload.test/yt-session', () => R(200, { id: 'yt1', status: { privacyStatus: ytPrivacy } })]);
  let n = calls.length;
  let r = await runPost('y1', { targets: ['youtube'], media: [vid],
    text: { youtube: { title: 'My <best> set', description: 'Desc', tags: ['gym'] } }, options: { youtube: { privacy: 'public' } } });
  const yi = find(since(n), 'POST', 'https://www.googleapis.com/upload/youtube/v3/videos')[0];
  ck('YouTube: resumable upload session opened', yi && /uploadType=resumable/.test(yi.url));
  ck('YouTube: size and type declared up front', yi && yi.headers['x-upload-content-length'] === String(5 * MB) && yi.headers['x-upload-content-type'] === 'video/mp4');
  ck('YouTube: angle brackets stripped from the title', yi && yi.body.snippet.title === 'My best set');
  ck('YouTube: the video is streamed to the session URL', find(since(n), 'PUT', 'https://upload.test/yt-session')[0].body === 'stream');
  ck('YouTube: result links to the video', r.results.youtube.state === 'ok' && r.results.youtube.url === 'https://youtu.be/yt1');
  ytPrivacy = 'private';
  r = await runPost('y2', { targets: ['youtube'], media: [vid], text: { youtube: { title: 't' } } });
  ck('YouTube: an unaudited app kept private is explained', /audited/.test(r.results.youtube.msg));
  n = calls.length;
  r = await runPost('y3', { targets: ['youtube'], media: [vid], draft: true, text: { youtube: { title: 't' } } });
  ck('YouTube draft uploads as private', find(since(n), 'POST', 'https://www.googleapis.com/upload/youtube/v3/videos')[0].body.status.privacyStatus === 'private');
  ck('YouTube draft result says draft', r.results.youtube.state === 'draft');
  r = await runPost('y4', { targets: ['youtube'], media: [im1, im2] });
  ck('YouTube refuses photos', r.results.youtube.state === 'error' && /one video/.test(r.results.youtube.msg));

  // =================================================== Instagram
  let igN = 0;
  const igStatus = {};
  on('POST', 'https://graph.instagram.com/v23.0/17841/media_publish', () => R(200, { id: 'igpost1' }));
  on('POST', 'https://graph.instagram.com/v23.0/17841/media', (c) => {
    const id = 'c' + (++igN);
    if (c.body.media_type === 'VIDEO' || c.body.media_type === 'REELS') igStatus[id] = ['IN_PROGRESS', 'FINISHED'];
    return R(200, { id });
  });
  on('GET', /^https:\/\/graph\.instagram\.com\/v23\.0\/c\d+\?fields=status_code/, (c) => {
    const id = c.url.match(/(c\d+)\?/)[1];
    const q = igStatus[id];
    return R(200, { status_code: q && q.length ? q.shift() : 'FINISHED' });
  });
  on('GET', 'https://graph.instagram.com/v23.0/igpost1?fields=permalink', () => R(200, { permalink: 'https://www.instagram.com/p/abc/' }));
  n = calls.length; sleeps = 0;
  r = await runPost('ig1', { targets: ['instagram'], media: [im1, vid, im2], text: { instagram: { caption: 'Slide caption #gym' } } });
  const igc = find(since(n), 'POST', 'https://graph.instagram.com/v23.0/17841/media').filter((c) => !/media_publish/.test(c.url));
  ck('Instagram slider: one child container per item', igc.length === 4 && igc.slice(0, 3).every((c) => c.body.is_carousel_item === 'true'));
  ck('Instagram slider: the video child is a VIDEO item', igc[1].body.media_type === 'VIDEO' && /signed\.test/.test(igc[1].body.video_url));
  ck('Instagram gets signed links, never public ones', igc[0].body.image_url.startsWith('https://signed.test/'));
  ck('Instagram waits for the video to process', sleeps >= 1);
  ck('Instagram slider: CAROUSEL container lists the children in order', igc[3].body.media_type === 'CAROUSEL' && igc[3].body.children === 'c1,c2,c3' && igc[3].body.caption === 'Slide caption #gym');
  const igp = find(since(n), 'POST', 'https://graph.instagram.com/v23.0/17841/media_publish')[0];
  ck('Instagram publishes the carousel container', igp && igp.body.creation_id === 'c4');
  ck('Instagram result carries the permalink', r.results.instagram.state === 'ok' && r.results.instagram.url === 'https://www.instagram.com/p/abc/');
  n = calls.length;
  r = await runPost('ig2', { targets: ['instagram'], media: [vid], text: { instagram: { caption: 'reel' } } });
  const reel = find(since(n), 'POST', 'https://graph.instagram.com/v23.0/17841/media').filter((c) => !/media_publish/.test(c.url))[0];
  ck('Instagram: a single video goes up as a Reel shared to the feed', reel.body.media_type === 'REELS' && reel.body.share_to_feed === 'true');
  r = await runPost('ig3', { targets: ['instagram'], media: [png] });
  ck('Instagram refuses PNG before calling it', r.results.instagram.state === 'error' && /JPEG/.test(r.results.instagram.msg));
  n = calls.length;
  r = await runPost('ig4', { targets: ['instagram'], media: [im1], draft: true });
  ck('Instagram has no drafts: skipped, not faked', r.results.instagram.state === 'skipped' && since(n).every((c) => !/graph\.instagram/.test(c.url)));

  // where on Instagram: Story and Reel
  n = calls.length;
  r = await runPost('ig5', { targets: ['instagram'], media: [im1], text: { instagram: { caption: 'no caption on stories' } }, options: { instagram: { place: 'story' } } });
  const story = find(since(n), 'POST', 'https://graph.instagram.com/v23.0/17841/media').filter((c) => !/media_publish/.test(c.url))[0];
  ck('Instagram Story: a STORIES container with the photo, no caption', story && story.body.media_type === 'STORIES' && /signed\.test/.test(story.body.image_url) && !story.body.caption
    && r.results.instagram.state === 'ok' && /24 hours/.test(r.results.instagram.msg));
  r = await runPost('ig6', { targets: ['instagram'], media: [im1, im2], options: { instagram: { place: 'story' } } });
  ck('Instagram Story refuses two items', r.results.instagram.state === 'error' && /one photo or one clip/.test(r.results.instagram.msg));
  n = calls.length;
  r = await runPost('ig7', { targets: ['instagram'], media: [vid], options: { instagram: { place: 'story' } } });
  ck('Instagram Story takes a clip', find(since(n), 'POST', 'https://graph.instagram.com/v23.0/17841/media')[0].body.video_url.startsWith('https://signed.test/'));
  r = await runPost('ig8', { targets: ['instagram'], media: [im1], options: { instagram: { place: 'reel' } } });
  ck('Instagram Reel refuses a photo', r.results.instagram.state === 'error' && /A Reel is one video/.test(r.results.instagram.msg));
  n = calls.length;
  r = await runPost('y5', { targets: ['youtube'], media: [vid], text: { youtube: { title: 't', description: 'Desc' } }, options: { youtube: { privacy: 'public', short: true } } });
  ck('YouTube Short: tagged #Shorts in the description', /Desc\n\n#Shorts$/.test(find(since(n), 'POST', 'https://www.googleapis.com/upload/youtube/v3/videos')[0].body.snippet.description));

  // =================================================== TikTok
  let ttOptions = ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS'];
  on('POST', 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/', () => R(200, { data: { privacy_level_options: ttOptions }, error: { code: 'ok' } }));
  on('POST', 'https://open.tiktokapis.com/v2/post/publish/video/init/', () => R(200, { data: { publish_id: 'pub1', upload_url: 'https://tt-upload.test/u1' }, error: { code: 'ok' } }));
  on('POST', 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', () => R(200, { data: { publish_id: 'pub2', upload_url: 'https://tt-upload.test/u2' }, error: { code: 'ok' } }));
  on('PUT', 'https://tt-upload.test/', () => R(201, {}));
  let ttStatus = ['PROCESSING_UPLOAD', 'PUBLISH_COMPLETE'];
  on('POST', 'https://open.tiktokapis.com/v2/post/publish/status/fetch/', () => R(200, { data: { status: ttStatus.length ? ttStatus.shift() : 'PUBLISH_COMPLETE' }, error: { code: 'ok' } }));
  n = calls.length;
  r = await runPost('tt1', { targets: ['tiktok'], media: [vid], text: { tiktok: { caption: 'my caption' } } });
  const tti = find(since(n), 'POST', 'https://open.tiktokapis.com/v2/post/publish/video/init/')[0];
  ck('TikTok: asks the creator’s allowed privacy first', find(since(n), 'POST', 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/').length === 1);
  ck('TikTok: falls back to private when public is not allowed', tti && tti.body.post_info.privacy_level === 'SELF_ONLY');
  ck('TikTok: caption sent as the title', tti && tti.body.post_info.title === 'my caption');
  ck('TikTok: a small video is one chunk', tti && tti.body.source_info.total_chunk_count === 1 && tti.body.source_info.chunk_size === 5 * MB);
  const ttp = find(since(n), 'PUT', 'https://tt-upload.test/u1');
  ck('TikTok: the chunk carries its byte range', ttp.length === 1 && ttp[0].headers['content-range'] === `bytes 0-${5 * MB - 1}/${5 * MB}`);
  ck('TikTok: waits for processing, then ok', r.results.tiktok.state === 'ok' && r.results.tiktok.msg === '');
  n = calls.length;
  r = await runPost('tt2', { targets: ['tiktok'], media: [{ path: 'users/alice/post/big.mp4', type: 'video', mime: 'video/mp4' }] });
  const bigInit = find(since(n), 'POST', 'https://open.tiktokapis.com/v2/post/publish/video/init/')[0];
  const bigPuts = find(since(n), 'PUT', 'https://tt-upload.test/u1');
  ck('TikTok: a large video is split into 10 MB chunks', bigInit.body.source_info.chunk_size === 10 * MB && bigInit.body.source_info.total_chunk_count === 7);
  ck('TikTok: the last chunk takes the remainder', bigPuts.length === 7 && bigPuts[6].headers['content-range'] === 'bytes 62914560-79167487/79167488');
  ck('TikTok: every chunk is exactly its range', bigPuts.every((c) => {
    const m = c.headers['content-range'].match(/bytes (\d+)-(\d+)\//); return c.body.bytes === (+m[2]) - (+m[1]) + 1; }));
  n = calls.length;
  r = await runPost('tt3', { targets: ['tiktok'], media: [vid], draft: true });
  ck('TikTok draft goes to the inbox endpoint', find(since(n), 'POST', 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/').length === 1
    && find(since(n), 'POST', 'https://open.tiktokapis.com/v2/post/publish/video/init/').length === 0);
  ck('TikTok draft says where it went', r.results.tiktok.state === 'draft' && /inbox/.test(r.results.tiktok.msg));
  r = await runPost('tt4', { targets: ['tiktok'], media: [im1, im2] });
  ck('TikTok photos explain the verified-domain rule', r.results.tiktok.state === 'error' && /verified/.test(r.results.tiktok.msg));

  // =================================================== LinkedIn
  let liImg = 0;
  on('POST', 'https://api.linkedin.com/rest/images?action=initializeUpload', () => {
    liImg++; return R(200, { value: { uploadUrl: `https://li-upload.test/img${liImg}`, image: `urn:li:image:I${liImg}` } });
  });
  on('PUT', 'https://li-upload.test/img', () => R(201, {}));
  on('POST', 'https://api.linkedin.com/rest/videos?action=initializeUpload', () => R(200, { value: {
    video: 'urn:li:video:V1', uploadToken: 'tok1',
    uploadInstructions: [
      { uploadUrl: 'https://li-upload.test/vid/p1', firstByte: 0, lastByte: 4194303 },
      { uploadUrl: 'https://li-upload.test/vid/p2', firstByte: 4194304, lastByte: 5 * MB - 1 }
    ] } }));
  on('PUT', 'https://li-upload.test/vid/', (c) => R(200, {}, { etag: c.url.endsWith('p1') ? 'e1' : 'e2' }));
  on('POST', 'https://api.linkedin.com/rest/videos?action=finalizeUpload', () => R(200, {}));
  on('POST', 'https://api.linkedin.com/rest/posts', () => R(201, {}, { 'x-restli-id': 'urn:li:share:777' }));
  n = calls.length;
  r = await runPost('li1', { targets: ['linkedin'], media: [im1, im2], text: { linkedin: { text: 'Ship it (today) #buildlog' } } });
  const lpost = find(since(n), 'POST', 'https://api.linkedin.com/rest/posts')[0];
  ck('LinkedIn: each photo registered to the member', find(since(n), 'POST', 'https://api.linkedin.com/rest/images?action=initializeUpload').length === 2);
  ck('LinkedIn: photos uploaded to their URLs', find(since(n), 'PUT', 'https://li-upload.test/img').length === 2);
  ck('LinkedIn: author is the member urn', lpost && lpost.body.author === 'urn:li:person:abc123');
  ck('LinkedIn: two photos become a multi-image post', lpost && lpost.body.content.multiImage.images.map((i) => i.id).join() === 'urn:li:image:I1,urn:li:image:I2');
  ck('LinkedIn: reserved characters escaped, hashtag kept live', lpost && lpost.body.commentary === 'Ship it \\(today\\) {hashtag|\\#|buildlog}');
  ck('LinkedIn: versioned REST headers sent', lpost && lpost.headers['linkedin-version'] === '202603' && lpost.headers['x-restli-protocol-version'] === '2.0.0');
  ck('LinkedIn: result links to the post', r.results.linkedin.url === 'https://www.linkedin.com/feed/update/urn:li:share:777/');
  n = calls.length;
  r = await runPost('li2', { targets: ['linkedin'], media: [vid], text: { linkedin: { text: 'video post', title: 'Heading' } } });
  const vparts = find(since(n), 'PUT', 'https://li-upload.test/vid/');
  ck('LinkedIn video: uploaded in the ranges LinkedIn asked for', vparts.length === 2 && vparts[0].body.bytes === 4194304 && vparts[1].body.bytes === 5 * MB - 4194304);
  const fin = find(since(n), 'POST', 'https://api.linkedin.com/rest/videos?action=finalizeUpload')[0];
  ck('LinkedIn video: finalized with the part ETags in order', fin && fin.body.finalizeUploadRequest.uploadedPartIds.join() === 'e1,e2');
  ck('LinkedIn video: posted with the video urn', find(since(n), 'POST', 'https://api.linkedin.com/rest/posts')[0].body.content.media.id === 'urn:li:video:V1');
  r = await runPost('li3', { targets: ['linkedin'], media: [im1, vid] });
  ck('LinkedIn refuses photos + video together', r.results.linkedin.state === 'error' && /not both/.test(r.results.linkedin.msg));
  ck('LinkedIn has no drafts: skipped', (await runPost('li4', { targets: ['linkedin'], draft: true })).results.linkedin.state === 'skipped');

  // =================================================== X
  let xm = 0;
  on('POST', 'https://api.x.com/2/media/upload/initialize', () => R(200, { data: { id: 'mv1' } }));
  on('POST', /^https:\/\/api\.x\.com\/2\/media\/upload\/mv1\/append$/, () => R(200, {}));
  on('POST', /^https:\/\/api\.x\.com\/2\/media\/upload\/mv1\/finalize$/, () => R(200, { data: { id: 'mv1', processing_info: { state: 'pending', check_after_secs: 1 } } }));
  on('GET', 'https://api.x.com/2/media/upload?media_id=mv1', () => R(200, { data: { processing_info: { state: 'succeeded' } } }));
  on('POST', 'https://api.x.com/2/media/upload', () => R(200, { data: { id: 'm' + (++xm) } }));
  on('POST', 'https://api.x.com/2/tweets', () => R(201, { data: { id: '1900' } }));
  n = calls.length;
  r = await runPost('x1', { targets: ['x'], media: [im1, im2], text: { x: { text: 'two photos' } } });
  const xup = find(since(n), 'POST', 'https://api.x.com/2/media/upload').filter((c) => c.url === 'https://api.x.com/2/media/upload');
  ck('X: each photo uploaded as tweet_image', xup.length === 2 && xup.every((c) => c.body.media_category === 'tweet_image' && c.body.media.blob > 0));
  const tw = find(since(n), 'POST', 'https://api.x.com/2/tweets')[0];
  ck('X: the post carries both media ids', tw && tw.body.media.media_ids.join() === 'm1,m2' && tw.body.text === 'two photos');
  ck('X: result links to the post', r.results.x.url === 'https://x.com/i/status/1900');
  n = calls.length;
  r = await runPost('x2', { targets: ['x'], media: [vid], text: { x: { text: 'clip' } } });
  const ap = find(since(n), 'POST', 'https://api.x.com/2/media/upload/mv1/append');
  ck('X video: 5 MB goes up in two 4 MB segments', ap.length === 2 && ap[0].body.segment_index === '0' && ap[1].body.segment_index === '1');
  ck('X video: waits for processing before posting', find(since(n), 'GET', 'https://api.x.com/2/media/upload?media_id=mv1').length === 1);
  ck('X video: posted with the video id', find(since(n), 'POST', 'https://api.x.com/2/tweets')[0].body.media.media_ids.join() === 'mv1');
  r = await runPost('x3', { targets: ['x'], text: { x: { text: 'x'.repeat(281) } } });
  ck('X refuses more than 280 characters', r.results.x.state === 'error' && /280/.test(r.results.x.msg));
  ck('X counts a link as 23', xLength('see https://example.com/a-very-long-path-that-goes-on-and-on') === 27);
  r = await runPost('x4', { targets: ['x'], media: [im1, im2, im1, im2, im1] });
  ck('X refuses a fifth photo', r.results.x.state === 'error' && /4 photos/.test(r.results.x.msg));

  // =================================================== the job as a whole
  n = calls.length;
  r = await runPost('m1', { targets: ['youtube', 'linkedin', 'x'], media: [im1],
    text: { linkedin: { text: 'multi' }, x: { text: 'multi' } } });
  ck('one platform failing does not stop the others', r.results.youtube.state === 'error' && r.results.linkedin.state === 'ok' && r.results.x.state === 'ok');
  ck('mixed outcome is "partial"', r.state === 'partial' && get('srv/posts/alice/m1/state') === 'partial');
  ck('each platform’s result is stored', get('srv/posts/alice/m1/results/linkedin/url') === 'https://www.linkedin.com/feed/update/urn:li:share:777/');
  const liBefore = find(calls, 'POST', 'https://api.linkedin.com/rest/posts').length;
  const xBefore = find(calls, 'POST', 'https://api.x.com/2/tweets').length;
  await pub.run('alice', 'm1');
  ck('a retry never posts twice', find(calls, 'POST', 'https://api.linkedin.com/rest/posts').length === liBefore
    && find(calls, 'POST', 'https://api.x.com/2/tweets').length === xBefore);
  r = await runPost('m2', { targets: ['youtube', 'tiktok'], media: [im1] });
  ck('everything failing is "failed"', r.state === 'failed');

  routes.unshift([(m, u) => u.startsWith('https://api.x.com/2/tweets'), () => { throw new TypeError('fetch failed'); }]);
  r = await runPost('m3', { targets: ['x'], text: { x: { text: 'net down' } } });
  routes.shift();
  ck('a network crash becomes a plain error, not a crash', r.results.x.state === 'error' && /Something went wrong/.test(r.results.x.msg));
  set('srv/posts/alice/m4', { payload: { id: 'm4', targets: ['x'], text: { x: { text: 'no' } } }, state: 'cancelled' });
  n = calls.length;
  ck('a cancelled post never runs', (await pub.run('alice', 'm4')) === null && since(n).length === 0);

  // retry through the route keeps what already went out
  set('srv/queue/alice/m1', null);
  const rt = await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'm1', targets: ['youtube', 'linkedin', 'x'], media: [im1] } } });
  ck('re-publishing a partial post keeps the platforms that succeeded', rt.body.results.linkedin && rt.body.results.linkedin.state === 'ok' && !rt.body.results.youtube);

  // =================================================== writing
  on('POST', 'https://api.anthropic.com/v1/messages', () => R(200, { content: [{ type: 'text', text: '"How I finally fixed my squat"' }] }));
  n = calls.length;
  const w = await call('POST', '/write', { token: 'good-alice', body: { field: 'heading', platforms: ['youtube', 'bogus'], body: 'fixed my squat depth', instruction: 'punchy' } });
  ck('writer returns just the text, quotes stripped', w.body.text === 'How I finally fixed my squat' && w.body.field === 'heading');
  const wreq = find(since(n), 'POST', 'https://api.anthropic.com/v1/messages')[0];
  const wask = JSON.parse(wreq.body.messages[0].content);
  ck('writer sends the post so far and only real platforms', wask.post.body === 'fixed my squat depth' && wask.platforms.join() === 'youtube');
  ck('writer key stays on the server', wreq.headers['x-api-key'] === cfg.anthropicKey);
  ck('writer needs sign-in', (await call('POST', '/write', { body: { field: 'heading' } })).status === 401);
  ck('writer without a key says so', (await call('POST', '/write', { token: 'good-alice', c: Object.assign({}, cfg, { anthropicKey: 'unset' }) })).status === 503);

  ck('LinkedIn text helper escapes underscores inside hashtags', liText('#build_log') === '{hashtag|\\#|build\\_log}');
  ck('no call went somewhere unexpected', !calls.some((c) => c.unexpected));

  let p = 0, f = 0;
  T.forEach(([name, ok]) => { console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name); ok ? p++ : f++; });
  const odd = calls.filter((c) => c.unexpected).map((c) => c.method + ' ' + c.url);
  if (odd.length) console.log('unexpected calls:\n  ' + odd.join('\n  '));
  console.log('\n' + p + '/' + (p + f) + ' passing');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
