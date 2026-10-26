/* The other platforms: Facebook Pages, the Meta Ads media library,
   Threads, Pinterest, Bluesky, Reddit, Tumblr, Mastodon, Discord,
   Telegram and Google Business Profile - plus the sign-in that returns to
   the app. Same harness as tests/publish.js: real providers.js, publish.js
   and api.js against an in-memory database, bucket and fake platforms. */
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
  xId: 'xid', xSecret: 'xsecret-123456',
  fbId: 'fbapp', fbSecret: 'fbsecret-123456', fbVersion: 'v23.0',
  threadsId: 'thapp', threadsSecret: 'thsecret-123456',
  pinId: 'pinapp', pinSecret: 'pinsecret-123456',
  redditId: 'rdapp', redditSecret: 'rdsecret-123456',
  tumblrId: 'tbapp', tumblrSecret: 'tbsecret-123456'
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
      json(o) { resolve({ status: this.statusCode, body: o, headers: this.headers }); },
      send(t) { resolve({ status: this.statusCode, body: t, headers: this.headers }); }
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
  addFile('users/alice/post/i1.jpg', 200 * 1024, 'image/jpeg');
  addFile('users/alice/post/i2.jpg', 180 * 1024, 'image/jpeg');
  addFile('users/alice/post/big.jpg', 1200 * 1024, 'image/jpeg');
  addFile('users/alice/post/v1.mp4', 5 * MB, 'video/mp4');
  const im1 = { path: 'users/alice/post/i1.jpg', type: 'image', mime: 'image/jpeg', w: 1080, h: 1350, name: 'i1.jpg' };
  const im2 = { path: 'users/alice/post/i2.jpg', type: 'image', mime: 'image/jpeg', w: 1080, h: 1080, name: 'i2.jpg' };
  const big = { path: 'users/alice/post/big.jpg', type: 'image', mime: 'image/jpeg', name: 'big.jpg' };
  const vid = { path: 'users/alice/post/v1.mp4', type: 'video', mime: 'video/mp4', name: 'v1.mp4' };
  let n;

  // =================================================== back to the app after sign-in
  on('POST', 'https://oauth2.googleapis.com/token', () => R(200, { access_token: 'g-at', refresh_token: 'g-rt', expires_in: 3600, scope: 'openid youtube.upload' }));
  on('GET', 'https://www.googleapis.com/oauth2/v3/userinfo', () => R(200, { email: 'me@gmail.com' }));
  let c = await call('POST', '/connect/google', { token: 'good-alice', body: { return: 'https://kova.example/app?x=1' } });
  let state = new URL(c.body.url).searchParams.get('state');
  let cb = await call('GET', `/oauth/callback?code=g1&state=${state}`);
  ck('sign-in returns to the app it came from', cb.status === 302 && /^https:\/\/kova\.example\/app\?x=1&kova_linked=google$/.test(cb.headers.location || ''));
  c = await call('POST', '/connect/google', { token: 'good-alice', body: { return: 'javascript:alert(1)' } });
  state = new URL(c.body.url).searchParams.get('state');
  ck('an unsafe return address is dropped', !get(`srv/oauthState/${state}`).ret);
  c = await call('POST', '/connect/google', { token: 'good-alice', body: { return: 'http://localhost:8766/' } });
  state = new URL(c.body.url).searchParams.get('state');
  cb = await call('GET', `/oauth/callback?error=access_denied&state=${state}`);
  ck('cancelling on the provider page comes back with a reason', cb.status === 302 && /kova_link_error=cancelled/.test(cb.headers.location || ''));

  // =================================================== Facebook Pages + Meta Ads
  on('GET', 'https://graph.facebook.com/v23.0/oauth/access_token?client_id', (c2) => R(200, { access_token: /fb_exchange_token/.test(c2.url) ? 'fb-long' : 'fb-short', expires_in: 5184000 }));
  on('GET', 'https://graph.facebook.com/v23.0/oauth/access_token?grant_type', () => R(200, { access_token: 'fb-long', expires_in: 5184000 }));
  on('GET', 'https://graph.facebook.com/v23.0/me/accounts', () => R(200, { data: [{ id: 'P1', name: 'Kova Store', access_token: 'page-tok-1' }, { id: 'P2', name: 'Kova Outlet', access_token: 'page-tok-2' }] }));
  on('GET', 'https://graph.facebook.com/v23.0/me/adaccounts', () => R(200, { data: [{ id: 'act_111', name: 'Kova Ads', account_status: 1 }, { id: 'act_222', name: 'Old', account_status: 2 }] }));
  c = await call('POST', '/connect/facebook', { token: 'good-alice', body: {} });
  let u = new URL(c.body.url);
  ck('Facebook consent asks to post to Pages', u.host === 'www.facebook.com' && /pages_manage_posts/.test(u.searchParams.get('scope')));
  await call('GET', `/oauth/callback?code=fb1&state=${u.searchParams.get('state')}`);
  const fb = get('srv/oauth/alice/facebook');
  ck('Facebook keeps a Page token for each Page', fb && fb.extra.pages.length === 2 && fb.extra.pages[0].token === 'page-tok-1');
  ck('Facebook posts as the first Page by default', fb.extra.target === 'P1' && fb.label === 'Kova Store');
  const tg = await call('GET', '/targets/facebook', { token: 'good-alice' });
  ck('the Page list never exposes Page tokens', tg.body.items.length === 2 && !JSON.stringify(tg.body).includes('page-tok'));
  const set2 = await call('POST', '/targets/facebook', { token: 'good-alice', body: { id: 'P2' } });
  ck('choosing another Page switches the label', set2.body.label === 'Kova Outlet' && get('srv/oauth/alice/facebook/extra/target') === 'P2');
  ck('a Page that is not yours is refused', (await call('POST', '/targets/facebook', { token: 'good-alice', body: { id: 'P9' } })).status === 400);

  c = await call('POST', '/connect/metaads', { token: 'good-alice', body: {} });
  u = new URL(c.body.url);
  ck('Meta Ads consent asks for ads_management only there', /ads_management/.test(u.searchParams.get('scope')) && !/pages_manage_posts/.test(u.searchParams.get('scope')));
  await call('GET', `/oauth/callback?code=ma1&state=${u.searchParams.get('state')}`);
  ck('Meta Ads keeps only active ad accounts', get('srv/oauth/alice/metaads/extra/accounts').length === 1 && get('srv/oauth/alice/metaads/extra/target') === 'act_111');

  let pc = 0;
  on('POST', 'https://graph.facebook.com/v23.0/P2/photos', (c2) => R(200, c2.body.published === 'false' ? { id: 'ph' + (++pc) } : { id: 'ph9', post_id: 'P2_77' }));
  on('POST', 'https://graph.facebook.com/v23.0/P2/feed', () => R(200, { id: 'P2_88' }));
  on('POST', 'https://graph-video.facebook.com/v23.0/P2/videos', () => R(200, { id: 'vid5' }));
  n = calls.length;
  let r = await runPost('f1', { targets: ['facebook'], media: [im1, im2], text: { facebook: { text: 'Two photos' } } });
  const feed = find(since(n), 'POST', 'https://graph.facebook.com/v23.0/P2/feed')[0];
  ck('Facebook: photos staged unpublished, then one post with both', find(since(n), 'POST', 'https://graph.facebook.com/v23.0/P2/photos').every((x) => x.body.published === 'false')
    && feed && feed.body['attached_media[0]'] === '{"media_fbid":"ph1"}' && feed.body['attached_media[1]'] === '{"media_fbid":"ph2"}');
  ck('Facebook: posts with the chosen Page token', feed && feed.body.access_token === 'page-tok-2');
  ck('Facebook: result links to the post', r.results.facebook.url === 'https://www.facebook.com/P2_88');
  n = calls.length;
  r = await runPost('f2', { targets: ['facebook'], media: [vid], text: { facebook: { text: 'clip' } } });
  ck('Facebook: a video goes to the video endpoint by signed link', find(since(n), 'POST', 'https://graph-video.facebook.com/v23.0/P2/videos')[0].body.file_url.startsWith('https://signed.test/') && r.results.facebook.state === 'ok');
  r = await runPost('f3', { targets: ['facebook'], text: { facebook: { text: 'words only' } } });
  ck('Facebook: text-only posts to the feed', r.results.facebook.url === 'https://www.facebook.com/P2_88');

  // where on Facebook: Reel and Story
  let fbStart = 0;
  on('POST', 'https://graph.facebook.com/v23.0/P2/video_reels', (c2) => R(200, c2.body.upload_phase === 'start' ? { video_id: 'rv' + (++fbStart), upload_url: 'x' } : { success: true }));
  on('POST', 'https://graph.facebook.com/v23.0/P2/video_stories', (c2) => R(200, c2.body.upload_phase === 'start' ? { video_id: 'sv' + (++fbStart), upload_url: 'x' } : { success: true, post_id: 'P2_st1' }));
  on('POST', 'https://graph.facebook.com/v23.0/P2/photo_stories', () => R(200, { success: true, post_id: 'P2_st2' }));
  on('POST', /^https:\/\/rupload\.facebook\.com\/video-upload\/v23\.0\//, () => R(200, { success: true }));
  n = calls.length;
  r = await runPost('fr1', { targets: ['facebook'], media: [vid], text: { facebook: { text: 'reel words' } }, options: { facebook: { place: 'reel' } } });
  let got8 = since(n);
  const rs = find(got8, 'POST', 'https://graph.facebook.com/v23.0/P2/video_reels');
  const ru = find(got8, 'POST', 'https://rupload.facebook.com/video-upload/v23.0/rv1')[0];
  ck('Facebook Reel: start, hand over the file by signed link, then publish', rs.length === 2 && rs[0].body.upload_phase === 'start' && ru && /^https:\/\/signed\.test\//.test(ru.headers.file_url)
    && ru.headers.authorization === 'OAuth page-tok-2' && rs[1].body.upload_phase === 'finish' && rs[1].body.video_state === 'PUBLISHED' && rs[1].body.description === 'reel words');
  ck('Facebook Reel: result links to the Reel', r.results.facebook.state === 'ok' && r.results.facebook.url === 'https://www.facebook.com/reel/rv1');
  n = calls.length;
  r = await runPost('fs1', { targets: ['facebook'], media: [im1], options: { facebook: { place: 'story' } } });
  got8 = since(n);
  ck('Facebook photo Story: unpublished photo, then a photo story', find(got8, 'POST', 'https://graph.facebook.com/v23.0/P2/photos')[0].body.published === 'false'
    && find(got8, 'POST', 'https://graph.facebook.com/v23.0/P2/photo_stories')[0].body.photo_id && r.results.facebook.url === 'https://www.facebook.com/P2_st2');
  r = await runPost('fs2', { targets: ['facebook'], media: [vid], options: { facebook: { place: 'story' } } });
  ck('Facebook video Story: started, uploaded, finished', r.results.facebook.state === 'ok' && r.results.facebook.url === 'https://www.facebook.com/P2_st1');
  r = await runPost('fr2', { targets: ['facebook'], media: [im1], options: { facebook: { place: 'reel' } } });
  ck('Facebook Reel refuses a photo', r.results.facebook.state === 'error' && /one video/.test(r.results.facebook.msg));

  on('POST', 'https://graph.facebook.com/v23.0/act_111/adimages', (c2) => R(200, { images: { [c2.body.name]: { hash: 'h_' + c2.body.name, url: 'x' } } }));
  on('POST', 'https://graph.facebook.com/v23.0/act_111/advideos', () => R(200, { id: 'advid1' }));
  n = calls.length;
  r = await runPost('ma1', { targets: ['metaads'], media: [im1, im2, vid] });
  const ai = find(since(n), 'POST', 'https://graph.facebook.com/v23.0/act_111/adimages');
  ck('Meta Ads: each photo lands in the ad account library', ai.length === 2 && ai[0].body.bytes.length > 1000);
  ck('Meta Ads: the video goes to the library by signed link', find(since(n), 'POST', 'https://graph.facebook.com/v23.0/act_111/advideos')[0].body.file_url.startsWith('https://signed.test/'));
  ck('Meta Ads: says where to find them', r.results.metaads.state === 'ok' && /3 files added/.test(r.results.metaads.msg) && /act=111/.test(r.results.metaads.url));
  ck('Meta Ads: never creates a campaign or anything that spends', !since(n).some((x) => /\/(campaigns|adsets|ads)\b/.test(x.url) && x.method === 'POST'));

  // =================================================== Threads
  on('POST', 'https://graph.threads.net/oauth/access_token', () => R(200, { access_token: 'th-short', user_id: 555 }));
  on('GET', 'https://graph.threads.net/access_token?grant_type=th_exchange_token', () => R(200, { access_token: 'th-long', expires_in: 5184000 }));
  on('GET', 'https://graph.threads.net/v1.0/me', () => R(200, { id: '555', username: 'kova' }));
  c = await call('POST', '/connect/threads', { token: 'good-alice', body: {} });
  await call('GET', `/oauth/callback?code=th1&state=${new URL(c.body.url).searchParams.get('state')}`);
  ck('Threads: long-lived token and account id kept', get('srv/oauth/alice/threads/access_token') === 'th-long' && get('srv/oauth/alice/threads/extra/userId') === '555');
  let tc = 0;
  on('POST', 'https://graph.threads.net/v1.0/555/threads_publish', () => R(200, { id: 'thp1' }));
  on('POST', 'https://graph.threads.net/v1.0/555/threads', () => R(200, { id: 'tc' + (++tc) }));
  on('GET', /^https:\/\/graph\.threads\.net\/v1\.0\/tc\d+\?fields=status/, () => R(200, { status: 'FINISHED' }));
  on('GET', 'https://graph.threads.net/v1.0/thp1?fields=permalink', () => R(200, { permalink: 'https://www.threads.net/@kova/post/abc' }));
  n = calls.length;
  r = await runPost('t1', { targets: ['threads'], media: [im1, vid], text: { threads: { text: 'mixed carousel' } } });
  const th = since(n).filter((x) => x.method === 'POST' && x.url === 'https://graph.threads.net/v1.0/555/threads');
  ck('Threads: carousel children then a CAROUSEL container', th.length === 3 && th[0].body.is_carousel_item === 'true' && th[1].body.media_type === 'VIDEO' && th[2].body.media_type === 'CAROUSEL' && th[2].body.children === 'tc1,tc2');
  ck('Threads: published with a permalink', r.results.threads.url === 'https://www.threads.net/@kova/post/abc');
  r = await runPost('t2', { targets: ['threads'], text: { threads: { text: 'x'.repeat(501) } } });
  ck('Threads: over 500 characters is refused', r.results.threads.state === 'error' && /500/.test(r.results.threads.msg));

  // =================================================== Pinterest
  on('POST', 'https://api.pinterest.com/v5/oauth/token', () => R(200, { access_token: 'pin-at', refresh_token: 'pin-rt', expires_in: 2592000 }));
  on('GET', 'https://api.pinterest.com/v5/user_account', () => R(200, { username: 'kovastore' }));
  on('GET', 'https://api.pinterest.com/v5/boards', () => R(200, { items: [] }));
  n = calls.length;
  c = await call('POST', '/connect/pinterest', { token: 'good-alice', body: {} });
  await call('GET', `/oauth/callback?code=pn1&state=${new URL(c.body.url).searchParams.get('state')}`);
  const ptok = find(since(n), 'POST', 'https://api.pinterest.com/v5/oauth/token')[0];
  ck('Pinterest: token call uses Basic auth, no client id in the body', ptok && /^Basic /.test(ptok.headers.authorization) && !ptok.body.client_id);
  on('POST', 'https://api.pinterest.com/v5/boards', () => R(201, { id: 'B1' }));
  on('POST', 'https://api.pinterest.com/v5/pins', () => R(201, { id: 'PIN1' }));
  n = calls.length;
  r = await runPost('p1', { targets: ['pinterest'], media: [im1, im2], text: { pinterest: { title: 'Summer drop', description: 'Two looks', link: 'https://shop.example/p' } } });
  const pin = find(since(n), 'POST', 'https://api.pinterest.com/v5/pins')[0];
  ck('Pinterest: makes a "Kova" board when there is none', find(since(n), 'POST', 'https://api.pinterest.com/v5/boards')[0].body.name === 'Kova' && get('srv/oauth/alice/pinterest/extra/target') === 'B1');
  ck('Pinterest: two photos become a carousel Pin with the shop link', pin && pin.body.media_source.source_type === 'multiple_image_urls' && pin.body.media_source.items.length === 2 && pin.body.link === 'https://shop.example/p');
  ck('Pinterest: result links to the Pin', r.results.pinterest.url === 'https://www.pinterest.com/pin/PIN1/');

  // =================================================== Bluesky (form)
  on('POST', 'https://bsky.social/xrpc/com.atproto.server.createSession', (c2) => c2.body.password === 'abcd-efgh-ijkl-mnop'
    ? R(200, { accessJwt: 'bs-at', refreshJwt: 'bs-rt', did: 'did:plc:k1', handle: 'kova.bsky.social', didDoc: { service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.test' }] } })
    : R(401, { error: 'AuthenticationRequired' }));
  ck('Bluesky: a wrong app password is refused', (await call('POST', '/link/bluesky', { token: 'good-alice', body: { fields: { handle: '@kova.bsky.social', password: 'nope' } } })).status === 401);
  const bl = await call('POST', '/link/bluesky', { token: 'good-alice', body: { fields: { handle: '@kova.bsky.social', password: 'abcd-efgh-ijkl-mnop' } } });
  ck('Bluesky: links with the handle', bl.body.ok && get('srv/oauth/alice/bluesky/label') === '@kova.bsky.social');
  ck('Bluesky: the password itself is never stored', !JSON.stringify(get('srv/oauth/alice/bluesky')).includes('abcd-efgh'));
  ck('Bluesky: posts go to the account’s own server', get('srv/oauth/alice/bluesky/extra/pds') === 'https://pds.test');
  on('POST', 'https://pds.test/xrpc/com.atproto.repo.uploadBlob', () => R(200, { blob: { $type: 'blob', ref: { $link: 'b1' }, mimeType: 'image/jpeg', size: 1 } }));
  on('POST', 'https://pds.test/xrpc/com.atproto.repo.createRecord', () => R(200, { uri: 'at://did:plc:k1/app.bsky.feed.post/3kx', cid: 'c' }));
  n = calls.length;
  r = await runPost('b1', { targets: ['bluesky'], media: [im1], text: { bluesky: { text: 'New drop ✨ https://shop.example #summer' } } });
  const rec = find(since(n), 'POST', 'https://pds.test/xrpc/com.atproto.repo.createRecord')[0];
  const fcs = rec && rec.body.record.facets;
  ck('Bluesky: link and hashtag made clickable at the right byte offsets', fcs && fcs.length === 2
    && Buffer.from('New drop ✨ https://shop.example #summer').slice(fcs[0].index.byteStart, fcs[0].index.byteEnd).toString() === 'https://shop.example'
    && Buffer.from('New drop ✨ https://shop.example #summer').slice(fcs[1].index.byteStart, fcs[1].index.byteEnd).toString() === '#summer');
  ck('Bluesky: photo embedded with its shape', rec && rec.body.record.embed.images[0].aspectRatio.width === 1080);
  ck('Bluesky: result links to the post', r.results.bluesky.url === 'https://bsky.app/profile/kova.bsky.social/post/3kx');
  r = await runPost('b2', { targets: ['bluesky'], media: [big] });
  ck('Bluesky: photos over 1 MB are refused with the reason', r.results.bluesky.state === 'error' && /1 MB/.test(r.results.bluesky.msg));
  set('srv/oauth/alice/bluesky/expires_at', 1);
  on('POST', 'https://pds.test/xrpc/com.atproto.server.refreshSession', () => R(200, { accessJwt: 'bs-at-2', refreshJwt: 'bs-rt-2' }));
  await makeOAuth({ db: fakeDb, cfg }).get('alice', 'bluesky');
  ck('Bluesky: the session refreshes itself', get('srv/oauth/alice/bluesky/access_token') === 'bs-at-2' && get('srv/oauth/alice/bluesky/refresh_token') === 'bs-rt-2');

  // =================================================== Reddit
  on('POST', 'https://www.reddit.com/api/v1/access_token', () => R(200, { access_token: 'rd-at', refresh_token: 'rd-rt', expires_in: 86400 }));
  on('GET', 'https://oauth.reddit.com/api/v1/me', () => R(200, { name: 'kovastore' }));
  c = await call('POST', '/connect/reddit', { token: 'good-alice', body: {} });
  u = new URL(c.body.url);
  ck('Reddit: asks for a permanent link', u.searchParams.get('duration') === 'permanent');
  n = calls.length;
  await call('GET', `/oauth/callback?code=rd1&state=${u.searchParams.get('state')}`);
  ck('Reddit: every call carries a real User-Agent', since(n).filter((x) => /reddit\.com/.test(x.url)).every((x) => /kova/.test(x.headers['user-agent'] || '')));
  on('POST', 'https://oauth.reddit.com/api/submit', () => R(200, { json: { errors: [], data: { url: 'https://www.reddit.com/r/test/comments/1/x/', name: 't3_1' } } }));
  n = calls.length;
  r = await runPost('r1', { targets: ['reddit'], text: { reddit: { title: 'Launch day', text: 'details' } }, options: { reddit: { subreddit: 'test' } } });
  const sub = find(since(n), 'POST', 'https://oauth.reddit.com/api/submit')[0];
  ck('Reddit: text post to the chosen subreddit', sub && sub.body.kind === 'self' && sub.body.sr === 'test' && sub.body.title === 'Launch day');
  ck('Reddit: result links to the post', r.results.reddit.url === 'https://www.reddit.com/r/test/comments/1/x/');
  n = calls.length;
  r = await runPost('r2', { targets: ['reddit'], text: { reddit: { title: 'Profile post' } } });
  ck('Reddit: with no subreddit it posts to your profile', find(since(n), 'POST', 'https://oauth.reddit.com/api/submit')[0].body.sr === 'u_kovastore');
  r = await runPost('r3', { targets: ['reddit'], text: { reddit: { title: '' } } });
  ck('Reddit: a title is required', r.results.reddit.state === 'error' && /title/.test(r.results.reddit.msg));

  // =================================================== Tumblr
  on('POST', 'https://api.tumblr.com/v2/oauth2/token', () => R(200, { access_token: 'tb-at', refresh_token: 'tb-rt', expires_in: 2520 }));
  on('GET', 'https://api.tumblr.com/v2/user/info', () => R(200, { response: { user: { blogs: [{ name: 'kovablog', title: 'Kova', primary: true }] } } }));
  c = await call('POST', '/connect/tumblr', { token: 'good-alice', body: {} });
  await call('GET', `/oauth/callback?code=tb1&state=${new URL(c.body.url).searchParams.get('state')}`);
  on('POST', 'https://api.tumblr.com/v2/blog/kovablog/posts', () => R(201, { meta: { status: 201 }, response: { id: 999, id_string: '999' } }));
  n = calls.length;
  r = await runPost('tb1', { targets: ['tumblr'], media: [im1], draft: true, text: { tumblr: { text: 'hello', tags: ['a', 'b'] } } });
  const tbp = find(since(n), 'POST', 'https://api.tumblr.com/v2/blog/kovablog/posts')[0];
  const tj = tbp && JSON.parse(tbp.body.json);
  ck('Tumblr: photo sent as NPF with its file part', tj && tj.content[1].type === 'image' && tj.content[1].media[0].identifier === 'media0' && tbp.body.media0.blob > 0);
  ck('Tumblr: a draft is a real Tumblr draft', tj && tj.state === 'draft' && r.results.tumblr.state === 'draft');

  // =================================================== Mastodon (any server)
  on('POST', 'https://fosstodon.org/api/v1/apps', () => R(200, { client_id: 'm-id', client_secret: 'm-secret' }));
  on('POST', 'https://fosstodon.org/oauth/token', () => R(200, { access_token: 'm-at', scope: 'read write:media write:statuses' }));
  on('GET', 'https://fosstodon.org/api/v1/accounts/verify_credentials', () => R(200, { username: 'kova' }));
  on('GET', 'https://fosstodon.org/api/v2/instance', () => R(200, { configuration: { statuses: { max_characters: 800 } } }));
  ck('Mastodon: a made-up server name is refused', (await call('POST', '/connect/mastodon', { token: 'good-alice', body: { instance: 'not a server' } })).status === 400);
  c = await call('POST', '/connect/mastodon', { token: 'good-alice', body: { instance: 'https://Fosstodon.org/@someone' } });
  u = new URL(c.body.url);
  ck('Mastodon: Kova registers itself with that server', u.host === 'fosstodon.org' && u.searchParams.get('client_id') === 'm-id' && get('srv/mastoApps/fosstodon_org/secret') === 'm-secret');
  n = calls.length;
  await call('POST', '/connect/mastodon', { token: 'good-alice', body: { instance: 'fosstodon.org' } });
  ck('Mastodon: registration is reused, not repeated', !find(since(n), 'POST', 'https://fosstodon.org/api/v1/apps').length);
  await call('GET', `/oauth/callback?code=m1&state=${u.searchParams.get('state')}`);
  ck('Mastodon: links with the full handle and the server’s own limit', get('srv/oauth/alice/mastodon/label') === '@kova@fosstodon.org' && get('srv/oauth/alice/mastodon/extra/maxChars') === 800);
  on('POST', 'https://fosstodon.org/api/v2/media', () => R(202, { id: 'md1', url: null }));
  on('GET', 'https://fosstodon.org/api/v1/media/md1', () => R(200, { id: 'md1', url: 'https://files/x.jpg' }));
  on('POST', 'https://fosstodon.org/api/v1/statuses', () => R(200, { id: 's1', url: 'https://fosstodon.org/@kova/s1' }));
  n = calls.length;
  r = await runPost('m1', { targets: ['mastodon'], media: [im1], text: { mastodon: { text: 'hi' } } });
  ck('Mastodon: waits for the media to process, then posts with it', find(since(n), 'POST', 'https://fosstodon.org/api/v1/statuses')[0].body.media_ids.join() === 'md1' && r.results.mastodon.url === 'https://fosstodon.org/@kova/s1');

  // =================================================== Discord (webhook)
  const hook = 'https://discord.com/api/webhooks/123/abc-DEF_1';
  ck('Discord: a non-webhook link is refused', (await call('POST', '/link/discord', { token: 'good-alice', body: { fields: { webhook: 'https://evil.example/x' } } })).status === 400);
  on('GET', hook, () => R(200, { id: '123', name: 'drops', guild_id: 'G1', channel_id: 'C1' }));
  await call('POST', '/link/discord', { token: 'good-alice', body: { fields: { webhook: hook } } });
  ck('Discord: links to the webhook’s channel', get('srv/oauth/alice/discord/label') === 'drops');
  on('POST', hook + '?wait=true', () => R(200, { id: 'MSG1', channel_id: 'C1' }));
  n = calls.length;
  r = await runPost('d1', { targets: ['discord'], media: [im1, im2], text: { discord: { text: 'new stock' } } });
  const dp = find(since(n), 'POST', hook + '?wait=true')[0];
  ck('Discord: message with both files attached', dp && JSON.parse(dp.body.payload_json).attachments.length === 2 && dp.body['files[1]'].blob > 0);
  ck('Discord: result links to the message', r.results.discord.url === 'https://discord.com/channels/G1/C1/MSG1');

  // =================================================== Telegram (bot)
  const BT = 'https://api.telegram.org/bot123456:' + 'A'.repeat(35);
  on('GET', BT + '/getMe', () => R(200, { ok: true, result: { id: 42, username: 'kova_bot' } }));
  let role = 'member';
  on('GET', BT + '/getChatMember', () => R(200, { ok: true, result: { status: role } }));
  on('GET', BT + '/getChat?', () => R(200, { ok: true, result: { id: -100777, title: 'Kova Drops', username: 'kovadrops' } }));
  const tl1 = await call('POST', '/link/telegram', { token: 'good-alice', body: { fields: { token: '123456:' + 'A'.repeat(35), chat: 'https://t.me/kovadrops' } } });
  ck('Telegram: says to make the bot an admin first', tl1.status === 400 && /admin/.test(tl1.body.error));
  role = 'administrator';
  await call('POST', '/link/telegram', { token: 'good-alice', body: { fields: { token: '123456:' + 'A'.repeat(35), chat: 'kovadrops' } } });
  ck('Telegram: links to the channel', get('srv/oauth/alice/telegram/label') === 'Kova Drops' && get('srv/oauth/alice/telegram/extra/chat') === '-100777');
  on('POST', BT + '/sendMediaGroup', () => R(200, { ok: true, result: [{ message_id: 55 }, { message_id: 56 }] }));
  n = calls.length;
  r = await runPost('tg1', { targets: ['telegram'], media: [im1, vid], text: { telegram: { text: 'album' } } });
  const mg = find(since(n), 'POST', BT + '/sendMediaGroup')[0];
  const media = mg && JSON.parse(mg.body.media);
  ck('Telegram: photos and video as one album, caption on the first', media && media.length === 2 && media[0].caption === 'album' && media[1].type === 'video' && mg.body.f1.blob > 0);
  ck('Telegram: result links to the channel post', r.results.telegram.url === 'https://t.me/kovadrops/55');

  // =================================================== Google Business Profile
  on('GET', 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts', () => R(200, { accounts: [{ name: 'accounts/9' }] }));
  on('GET', 'https://mybusinessbusinessinformation.googleapis.com/v1/accounts/9/locations', () => R(200, { locations: [{ name: 'locations/7', title: 'Kova Store Downtown' }] }));
  c = await call('POST', '/connect/gbusiness', { token: 'good-alice', body: {} });
  u = new URL(c.body.url);
  ck('Business Profile asks for its own permission', /business\.manage/.test(u.searchParams.get('scope')) && !/youtube/.test(u.searchParams.get('scope')));
  await call('GET', `/oauth/callback?code=gb1&state=${u.searchParams.get('state')}`);
  ck('Business Profile: links to the store location', get('srv/oauth/alice/gbusiness/label') === 'Kova Store Downtown');
  on('POST', 'https://mybusiness.googleapis.com/v4/accounts/9/locations/7/localPosts', () => R(200, { name: 'accounts/9/locations/7/localPosts/1', searchUrl: 'https://g.page/x' }));
  n = calls.length;
  r = await runPost('g1', { targets: ['gbusiness'], media: [im1], text: { gbusiness: { text: 'Open late this Friday' } } });
  const lp = find(since(n), 'POST', 'https://mybusiness.googleapis.com/v4/accounts/9/locations/7/localPosts')[0];
  ck('Business Profile: an update with the photo by signed link', lp && lp.body.summary === 'Open late this Friday' && lp.body.media[0].sourceUrl.startsWith('https://signed.test/') && r.results.gbusiness.state === 'ok');

  // =================================================== Meta Ads: the whole paused campaign
  const G = 'https://graph.facebook.com/v23.0';
  const first = (method, test, handler) => routes.unshift([
    (m, u2) => m === method && (typeof test === 'string' ? u2.startsWith(test) : test.test(u2)), handler]);
  addFile('users/alice/post/v2.mp4', 6 * MB, 'video/mp4');
  const vidA = { path: 'users/alice/post/v1.mp4', type: 'video', mime: 'video/mp4', name: 'hook.mp4', w: 1080, h: 1920 };
  const vidB = { path: 'users/alice/post/v2.mp4', type: 'video', mime: 'video/mp4', name: 'demo.mp4', w: 1080, h: 1350 };
  const ma = get('srv/oauth/alice/metaads/extra');
  ck('Meta Ads remembers which Pages the ads can run as, without Page tokens', ma.pages.length === 2 && ma.page === 'P1' && !JSON.stringify(ma).includes('page-tok'));

  let vn = 0, polls = {}, cn = 0, sn = 0, an = 0, failAd = 0, refuseKeep = false, slow = false;
  first('GET', `${G}/act_111?fields`, () => R(200, { name: 'Kova Ads', currency: 'USD', min_daily_budget: 100 }));
  first('GET', `${G}/act_111/adspixels`, () => R(200, { data: [{ id: 'PX1', name: 'Kova Pixel' }] }));
  first('GET', `${G}/act_111/instagram_accounts`, () => R(200, { data: [{ id: 'IG1', username: 'kova.store' }] }));
  first('POST', `${G}/act_111/advideos`, () => R(200, { id: 'advid' + (++vn) }));
  first('GET', /graph\.facebook\.com\/v23\.0\/advid\d+\?fields=status/, (c2) => {
    const id = c2.url.match(/advid\d+/)[0];
    polls[id] = (polls[id] || 0) + 1;
    const ready = !slow && polls[id] > 1;
    return R(200, { id, status: { video_status: ready ? 'ready' : 'processing' }, picture: 'https://pic/' + id });
  });
  first('GET', /graph\.facebook\.com\/v23\.0\/advid\d+\/thumbnails/, (c2) => R(200, { data: [{ uri: 'https://thumb/' + c2.url.match(/advid\d+/)[0], is_preferred: true }] }));
  first('POST', `${G}/act_111/campaigns`, () => R(200, { id: 'C' + (++cn) }));
  first('POST', `${G}/act_111/adsets`, () => R(200, { id: 'S' + (++sn) }));
  first('POST', `${G}/act_111/adcreatives`, (c2) => (refuseKeep && c2.body.degrees_of_freedom_spec)
    ? R(400, { error: { message: 'Invalid parameter' } }) : R(200, { id: 'CR' + c2.body.name.slice(0, 1) + '_' + cn }));
  first('POST', /graph\.facebook\.com\/v23\.0\/act_111\/ads$/, () => { if (failAd && --failAd === 0) return R(500, { error: { message: 'Temporary error' } }); return R(200, { id: 'AD' + (++an) }); });

  let su = await call('GET', '/ads/setup', { token: 'good-alice' });
  ck('Ad setup lists the account currency, its pixel and linked Instagram', su.status === 200 && su.body.currency === 'USD' && su.body.minBudget === 1
    && su.body.pixels[0].id === 'PX1' && su.body.pixel === 'PX1' && su.body.instagram.username === 'kova.store' && su.body.pages.length === 2);
  su = await call('POST', '/ads/setup', { token: 'good-alice', body: { page: 'P2' } });
  ck('choosing a Page stores it with the pixel and Instagram account', get('srv/oauth/alice/metaads/extra/page') === 'P2'
    && get('srv/oauth/alice/metaads/extra/pixel') === 'PX1' && get('srv/oauth/alice/metaads/extra/ig') === 'IG1' && su.body.page === 'P2');
  ck('a Page that is not yours is refused for ads', (await call('POST', '/ads/setup', { token: 'good-alice', body: { page: 'P9' } })).status === 400);
  ck('a pixel from another account is refused', (await call('POST', '/ads/setup', { token: 'good-alice', body: { pixel: 'PX9' } })).status === 400);

  const adOpts = { build: 'ads', goal: 'sales', budget: 20, split: 'one', countries: ['US', 'CA'], cta: 'SHOP_NOW', event: 'PURCHASE', link: 'https://shop.test/p' };
  const adText = { metaads: { primary: 'Four colours, one bag.', headline: 'The Everyday Tote', description: 'Free shipping' } };
  n = calls.length; sleeps = 0;
  r = await runPost('ad1', { title: 'Tote launch', targets: ['metaads'], media: [im1, vidA, vidB], text: adText, options: { metaads: adOpts } });
  let got = since(n);
  const camp = find(got, 'POST', `${G}/act_111/campaigns`);
  const sets = find(got, 'POST', `${G}/act_111/adsets`);
  const crs = find(got, 'POST', `${G}/act_111/adcreatives`);
  const onlyAds = (list) => list.filter((x) => x.method === 'POST' && x.url === `${G}/act_111/ads`);
  const adsMade = onlyAds(got);
  ck('Ads: one campaign, Sales, switched off', camp.length === 1 && camp[0].body.objective === 'OUTCOME_SALES' && camp[0].body.status === 'PAUSED' && camp[0].body.special_ad_categories === '[]');
  const s0 = sets[0] && sets[0].body;
  ck('Ads: one ad set with the $20/day budget in cents, switched off', sets.length === 1 && s0.daily_budget === '2000' && s0.status === 'PAUSED' && s0.campaign_id === 'C1');
  ck('Ads: the ad set optimises for purchases on the pixel', s0.optimization_goal === 'OFFSITE_CONVERSIONS' && JSON.parse(s0.promoted_object).pixel_id === 'PX1'
    && JSON.parse(s0.promoted_object).custom_event_type === 'PURCHASE' && s0.destination_type === 'WEBSITE');
  ck('Ads: the ad set targets the chosen countries', JSON.stringify(JSON.parse(s0.targeting).geo_locations.countries) === '["US","CA"]');
  const photoSpec = crs[0] && JSON.parse(crs[0].body.object_story_spec);
  ck('Ads: the photo ad has the primary text, headline, description, button and link', photoSpec && photoSpec.page_id === 'P2' && photoSpec.instagram_user_id === 'IG1'
    && photoSpec.link_data.image_hash === 'h_i1.jpg' && photoSpec.link_data.message === 'Four colours, one bag.' && photoSpec.link_data.name === 'The Everyday Tote'
    && photoSpec.link_data.description === 'Free shipping' && photoSpec.link_data.call_to_action.type === 'SHOP_NOW' && photoSpec.link_data.call_to_action.value.link === 'https://shop.test/p');
  const vidSpec = crs[1] && JSON.parse(crs[1].body.object_story_spec);
  ck('Ads: each video ad uses its own processed video and thumbnail', vidSpec && vidSpec.video_data.video_id === 'advid1' && vidSpec.video_data.image_url === 'https://thumb/advid1'
    && vidSpec.video_data.message === 'Four colours, one bag.' && vidSpec.video_data.title === 'The Everyday Tote' && JSON.parse(crs[2].body.object_story_spec).video_data.video_id === 'advid2');
  ck('Ads: Meta is asked not to re-crop or rewrite them', crs.every((x) => /text_optimizations/.test(x.body.degrees_of_freedom_spec || '')));
  ck('Ads: each ad is named with its shape', crs[1].body.name === '2. hook.mp4 - 9:16' && crs[2].body.name === '3. demo.mp4 - 4:5');
  ck('Ads: three ads in the ad set, all switched off', adsMade.length === 3 && adsMade.every((x) => x.body.adset_id === 'S1' && x.body.status === 'PAUSED'));
  ck('Ads: nothing is ever switched on', !got.some((x) => x.body && typeof x.body === 'object' && x.body.status === 'ACTIVE'));
  ck('Ads: waits for Meta to finish processing the videos first', sleeps >= 1 && got.findIndex((x) => /adcreatives/.test(x.url)) > got.findIndex((x) => /advid1\?fields=status/.test(x.url)));
  ck('Ads: the result opens the campaign in Ads Manager', r.results.metaads.state === 'ok' && /selected_campaign_ids=C1/.test(r.results.metaads.url)
    && /\$20\/day/.test(r.results.metaads.msg) && /3 ads/.test(r.results.metaads.msg));

  // a failure part-way, then a retry: nothing is built twice
  failAd = 2; n = calls.length;
  r = await runPost('ad2', { title: 'Retry', targets: ['metaads'], media: [im1, im2], text: adText, options: { metaads: adOpts } });
  ck('Ads: a refused ad is an error with Meta’s reason', r.results.metaads.state === 'error' && /Temporary error/.test(r.results.metaads.msg));
  set('srv/posts/alice/ad2/state', 'queued');
  r = await pub.run('alice', 'ad2');
  got = since(n);
  ck('Ads: the retry carries on - one campaign, one ad set, each file uploaded once', find(got, 'POST', `${G}/act_111/campaigns`).length === 1
    && find(got, 'POST', `${G}/act_111/adsets`).length === 1 && find(got, 'POST', `${G}/act_111/adimages`).length === 2 && r.results.metaads.state === 'ok');
  const pr2 = await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'ad2', targets: ['metaads'], media: [im1] } } });
  ck('Ads: publishing the same post again keeps what Meta already has', pr2.status === 200 && get('srv/posts/alice/ad2/work/metaads/campaign') === 'C2');

  // one ad set per file, Traffic
  n = calls.length;
  r = await runPost('ad3', { title: 'Split', targets: ['metaads'], media: [im1, im2], text: adText,
    options: { metaads: Object.assign({}, adOpts, { goal: 'traffic', split: 'each', budget: 12.5 }) } });
  got = since(n);
  const sets3 = find(got, 'POST', `${G}/act_111/adsets`), ads3 = onlyAds(got);
  ck('Ads: one ad set per file, each with the budget', sets3.length === 2 && sets3.every((x) => x.body.daily_budget === '1250' && x.body.optimization_goal === 'LINK_CLICKS' && !x.body.promoted_object)
    && ads3[0].body.adset_id !== ads3[1].body.adset_id && /each/.test(r.results.metaads.msg));

  // Meta refuses the no-tweaks request: the ad is still made, and it says so
  refuseKeep = true;
  r = await runPost('ad4', { title: 'Old', targets: ['metaads'], media: [im1], text: adText, options: { metaads: adOpts } });
  ck('Ads: falls back when Meta refuses the no-tweaks setting, and says so', r.results.metaads.state === 'ok' && /tweaks are on/.test(r.results.metaads.msg));
  refuseKeep = false;

  // what is missing is said before anything is built
  n = calls.length;
  r = await runPost('ad5', { targets: ['metaads'], media: [im1], text: adText, options: { metaads: Object.assign({}, adOpts, { link: '' }) } });
  ck('Ads: Sales without a shop link is refused before anything is built', r.results.metaads.state === 'error' && /shop link/.test(r.results.metaads.msg)
    && !find(since(n), 'POST', `${G}/act_111/campaigns`).length);
  r = await runPost('ad6', { targets: ['metaads'], media: [im1], text: adText, options: { metaads: Object.assign({}, adOpts, { budget: 0.5 }) } });
  ck('Ads: a budget under Meta’s minimum is refused with the minimum', r.results.metaads.state === 'error' && /\$1/.test(r.results.metaads.msg));

  // videos still processing when time runs out: carries on later by itself
  slow = true;
  let clock = Date.now();
  const pubSlow = makePublisher({ db: fakeDb, bucket, cfg, tokens: makeOAuth({ db: fakeDb, cfg }), now: () => clock, sleep: async (ms) => { clock += ms; } });
  set('srv/posts/alice/ad7', { payload: { id: 'ad7', title: 'Slow', targets: ['metaads'], media: [vidA], text: adText, options: { metaads: adOpts } }, state: 'queued' });
  r = await pubSlow.run('alice', 'ad7');
  const job = get('srv/scheduled/alice_ad7');
  ck('Ads: still processing -> the post comes back by itself in a few minutes', r.state === 'scheduled' && job && job.at > clock
    && get('srv/posts/alice/ad7/state') === 'scheduled' && get('srv/posts/alice/ad7/results/metaads/state') === 'working'
    && /still processing/.test(get('srv/posts/alice/ad7/results/metaads/msg')) && get('srv/posts/alice/ad7/work/metaads/files/f0/video'));
  slow = false; clock = job.at + 1;
  await moveDue(fakeDb, clock);
  const beforeVids = vn;
  r = await pubSlow.run('alice', 'ad7');
  ck('Ads: the next pass finishes without uploading the video again', r.state === 'done' && r.results.metaads.state === 'ok' && vn === beforeVids);

  // the options arrive cleaned
  const pr3 = await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'ad8', targets: ['metaads'], media: [im1],
    text: { metaads: { primary: 'x', headline: 'y'.repeat(400) } },
    options: { metaads: { build: 'ads', budget: '20.555', countries: ['us', 'usa', 'CA', 'ca'], cta: 'HACK', event: 'NOPE', link: 'http://plain.test' } } } } });
  const o8 = get('srv/posts/alice/ad8/payload/options/metaads');
  ck('Ads options are cleaned: budget, countries, button, event, https link', pr3.status === 200 && o8.budget === 20.56 && o8.countries.join() === 'US,CA'
    && o8.cta === 'SHOP_NOW' && o8.event === 'PURCHASE' && o8.link === '' && get('srv/posts/alice/ad8/payload/text/metaads/headline').length === 255);

  // =================================================== publish route knows every platform
  const st = (await call('GET', '/status', { token: 'good-alice' })).body;
  ck('status lists every new platform', ['facebook', 'metaads', 'threads', 'pinterest', 'bluesky', 'reddit', 'tumblr', 'mastodon', 'discord', 'telegram', 'gbusiness'].every((k) => st[k] && st[k].linked));
  ck('status says how each one connects', st.bluesky.kind === 'form' && st.mastodon.kind === 'instance' && st.facebook.kind === 'oauth' && st.facebook.choose === true);
  const pr = await call('POST', '/publish', { token: 'good-alice', body: { post: { id: 'all1', targets: ['facebook', 'metaads', 'reddit'], media: [im1],
    text: { reddit: { title: 'T' } }, options: { reddit: { subreddit: 'r/test!!' } } } } });
  ck('publish accepts the new platforms', pr.status === 200 && pr.body.targets.join() === 'facebook,metaads,reddit');
  ck('subreddit names are cleaned', get('srv/posts/alice/all1/payload/options/reddit/subreddit') === 'rtest');
  ck('no call went somewhere unexpected', !calls.some((x) => x.unexpected));

  let p = 0, f = 0;
  T.forEach(([name, ok]) => { console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name); ok ? p++ : f++; });
  const odd = calls.filter((x) => x.unexpected).map((x) => x.method + ' ' + x.url);
  if (odd.length) console.log('unexpected calls:\n  ' + odd.join('\n  '));
  console.log('\n' + p + '/' + (p + f) + ' passing');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
