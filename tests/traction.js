/* Traction (numbers, drop-off, audience and comments read back from each
   platform, new comments as notifications, "What should I fix?") and the
   business card. Real traction.js / card.js / providers.js against an
   in-memory database and fake platforms. */
const Module = require('module');
const path = require('path');

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
  return { child: (c) => ref(p + '/' + c), once: async () => ({ val: () => get(p) }), set: async (v) => set(p, v),
           remove: async () => set(p, null), update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); },
           transaction: async (fn) => { const v = fn(get(p)); set(p, v); return { committed: true, snapshot: { val: () => v } }; } };
}
const fakeDb = { ref };
Module._load = ((orig) => function (req, ...rest) {
  if (req === 'firebase-admin') return { initializeApp() {}, database: () => fakeDb,
    auth: () => ({ verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad'); } }) };
  return orig.call(this, req, ...rest);
})(Module._load);

const FN = path.join(__dirname, '..', 'functions');
const { makeTraction, trendOf, dropOff } = require(path.join(FN, 'traction.js'));
const { makeCard, withBlock, START } = require(path.join(FN, 'card.js'));
const { makeOAuth } = require(path.join(FN, 'providers.js'));
const api = require(path.join(FN, 'api.js'));

const calls = []; let routes = [];
const R = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } });
const on = (method, test, h) => routes.push([(m, u) => m === method && (typeof test === 'string' ? u.startsWith(test) : test.test(u)), h]);
global.fetch = async (url, o = {}) => {
  const c = { method: (o.method || 'GET').toUpperCase(), url: String(url), headers: o.headers || {}, body: o.body instanceof URLSearchParams ? Object.fromEntries(o.body) : (typeof o.body === 'string' ? JSON.parse(o.body) : o.body) };
  calls.push(c);
  for (const [m, h] of routes) if (m(c.method, c.url)) return h(c);
  c.unexpected = true; return R(500, { error: { message: 'unexpected ' + c.method + ' ' + c.url } });
};
const T = []; const ck = (n, c) => T.push([n, !!c]);
const cfg = { base: 'https://x.test/api', model: 'claude-sonnet-5', anthropicKey: 'sk-ant-test-123456', igVersion: 'v23.0', fbVersion: 'v23.0',
              googleId: 'g', googleSecret: 'gsecret-123456', igId: 'i', igSecret: 'isecret-123456', fbId: 'f', fbSecret: 'fsecret-123456',
              tiktokKey: 't', tiktokSecret: 'tsecret-123456' };
function call(method, url, { body, token } = {}) {
  const headers = {}; if (token) headers.authorization = 'Bearer ' + token;
  const req = { method, path: url, body: body || {}, query: {}, ip: '1.2.3.4', get: (h) => headers[h.toLowerCase()] };
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, status(s) { this.statusCode = s; return this; }, set(k, v) { this.headers[k] = v; return this; },
                  json(o) { resolve({ status: this.statusCode, body: o }); }, send(t) { resolve({ status: this.statusCode, body: t }); } };
    api.handle(req, res, cfg);
  });
}

(async () => {
  const FAR = Date.now() + 365 * 864e5;
  const NOW = Date.now();
  set('srv/oauth/al', {
    google: { access_token: 'g-at', refresh_token: 'r', expires_at: FAR, scope: 'openid youtube.readonly youtube.upload https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.force-ssl', label: 'me' },
    instagram: { access_token: 'ig-at', expires_at: FAR, scope: 'x', extra: { igId: '1784' } },
    facebook: { access_token: 'fb-user', expires_at: FAR, scope: 'x', extra: { pages: [{ id: 'P1', name: 'Kova Store', token: 'page-tok' }], target: 'P1' } },
    tiktok: { access_token: 'tt-at', expires_at: FAR, scope: 'user.info.basic,video.publish,video.list' }
  });
  set('srv/posts/al/post1', { state: 'done', createdAt: NOW - 5 * 864e5, finishedAt: NOW - 5 * 864e5,
    payload: { title: 'Tote launch', media: [{ type: 'video', dur: 30, w: 1080, h: 1920 }], text: { instagram: { caption: 'Four colours, one bag.' } } },
    results: { youtube: { state: 'ok', id: 'yt1' }, instagram: { state: 'ok', id: 'igm1' }, facebook: { state: 'ok', id: '9001' }, tiktok: { state: 'ok', id: 'pub1', post: '7300' } } });
  set('srv/posts/al/old', { state: 'done', finishedAt: NOW - 60 * 864e5, payload: { title: 'Old' }, results: { youtube: { state: 'ok', id: 'yt0' } } });

  // ---- fake platforms
  let ytComments = [{ id: 'c1', snippet: { topLevelComment: { snippet: { authorDisplayName: 'Ana', textOriginal: 'How much is it?', publishedAt: new Date(NOW - 3600e3).toISOString(), likeCount: 3 } } } }];
  on('GET', 'https://www.googleapis.com/youtube/v3/videos', () => R(200, { items: [{ statistics: { viewCount: '1200', likeCount: '80', commentCount: '14' }, snippet: {}, contentDetails: {} }] }));
  on('GET', /youtubeanalytics\.googleapis\.com\/v2\/reports\?.*metrics=averageViewDuration/, () => R(200, { rows: [[12.5, 41.7, 9, 3]] }));
  on('GET', /youtubeanalytics.*metrics=audienceWatchRatio/, () => R(200, { rows: [[0, 1], [0.1, 0.62], [0.2, 0.55], [0.5, 0.4], [1, 0.22]] }));
  on('GET', /youtubeanalytics.*metrics=viewerPercentage/, () => R(200, { rows: [['age18-24', 'female', 30], ['age18-24', 'male', 20], ['age25-34', 'female', 35], ['age25-34', 'male', 15]] }));
  on('GET', /youtubeanalytics.*metrics=views&dimensions=day/, () => R(200, { rows: [['2026-09-20', 400], ['2026-09-21', 300], ['2026-09-22', 250], ['2026-09-23', 150], ['2026-09-24', 60], ['2026-09-25', 40]] }));
  on('GET', 'https://www.googleapis.com/youtube/v3/commentThreads', () => R(200, { items: ytComments }));
  on('GET', 'https://graph.instagram.com/v23.0/igm1?fields', () => R(200, { media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://instagram.com/reel/x', like_count: 50, comments_count: 4 }));
  on('GET', 'https://graph.instagram.com/v23.0/igm1/insights', () => R(200, { data: [{ name: 'views', values: [{ value: 3000 }] }, { name: 'reach', values: [{ value: 2400 }] },
    { name: 'saved', values: [{ value: 40 }] }, { name: 'ig_reels_avg_watch_time', values: [{ value: 8300 }] }] }));
  on('GET', 'https://graph.instagram.com/v23.0/igm1/comments', () => R(200, { data: [{ id: 'k1', text: 'Does it come in black?', username: 'bea', timestamp: new Date(NOW).toISOString() }] }));
  let igDemo = 0;
  on('GET', /graph\.instagram\.com\/v23\.0\/1784\/insights.*breakdown=gender/, () => { igDemo++; return R(200, { data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: ['F'], value: 70 }, { dimension_values: ['M'], value: 30 }] }] } }] }); });
  on('GET', /graph\.instagram\.com\/v23\.0\/1784\/insights.*breakdown=age/, () => R(200, { data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: ['18-24'], value: 60 }, { dimension_values: ['25-34'], value: 40 }] }] } }] }));
  on('GET', 'https://graph.facebook.com/v23.0/9001?fields', () => R(200, { permalink_url: '/reel/9001', likes: { summary: { total_count: 22 } }, comments: { summary: { total_count: 2 } } }));
  on('GET', 'https://graph.facebook.com/v23.0/9001/video_insights', () => R(200, { data: [{ name: 'total_video_views', values: [{ value: 900 }] }, { name: 'total_video_avg_time_watched', values: [{ value: 7400 }] },
    { name: 'total_video_retention_graph', values: [{ value: { 0: 1, 10: 0.7, 20: 0.5, 40: 0.2 } }] }] }));
  on('GET', 'https://graph.facebook.com/v23.0/9001/comments', () => R(200, { data: [{ id: 'f1', message: 'Love the colours', from: { name: 'Cal' }, created_time: new Date(NOW).toISOString() }] }));
  on('POST', 'https://open.tiktokapis.com/v2/video/query/', (c) => R(200, { data: { videos: [{ id: c.body.filters.video_ids[0], view_count: 5000, like_count: 300, comment_count: 12, share_count: 20, share_url: 'https://tiktok.com/@k/video/7300' }] } }));

  const tr = makeTraction({ db: fakeDb, cfg, tokens: makeOAuth({ db: fakeDb, cfg }) });
  let r = await tr.collect('al');
  const P = get('users/al/traction/posts/post1');
  ck('recent posts are read back from all four platforms; month-old ones are left', r.read === 4 && P && !get('users/al/traction/posts/old'));
  ck('YouTube: views, likes, average view duration and percentage', P.platforms.youtube.metrics.views === 1200 && P.platforms.youtube.metrics.watch_avg_s === 12.5 && P.platforms.youtube.metrics.completion_pct === 41.7);
  ck('YouTube: the retention curve and who is watching', P.platforms.youtube.retention.length === 5 && P.platforms.youtube.audience.gender.Women === 65 && P.platforms.youtube.audience.age['25-34'] === 50);
  ck('YouTube: views per day', P.platforms.youtube.daily.length === 6);
  ck('Instagram: views, reach, saves and Reels watch time in seconds', P.platforms.instagram.metrics.views === 3000 && P.platforms.instagram.metrics.saves === 40 && P.platforms.instagram.metrics.watch_avg_s === 8.3);
  ck('Instagram: the account audience by gender and age', P.platforms.instagram.audience.gender.Women === 70 && P.platforms.instagram.audience.age['18-24'] === 60 && /this month/.test(P.platforms.instagram.audience.scope));
  ck('Facebook: Reel views, average watch time and the retention graph', P.platforms.facebook.metrics.views === 900 && P.platforms.facebook.metrics.watch_avg_s === 7.4 && P.platforms.facebook.retention[1][1] === 0.7);
  ck('TikTok: the counts, and it says what TikTok keeps to itself', P.platforms.tiktok.metrics.views === 5000 && /counts only/.test(P.platforms.tiktok.limits.join()));
  ck('comments from each platform are kept with who said them', P.platforms.youtube.comments[0].author === 'Ana' && P.platforms.instagram.comments[0].author === '@bea' && P.platforms.facebook.comments[0].author === 'Cal');
  ck('the first read does not flood notifications with old comments', r.notified === 0 && !get('users/al/traction/feed'));
  ck('the trend reads falling views as falling', P.trend.dir === 'falling' && P.trend.change < -15);

  ytComments = ytComments.concat([{ id: 'c2', snippet: { topLevelComment: { snippet: { authorDisplayName: 'Ben', textOriginal: 'Shipping to Canada?', publishedAt: new Date().toISOString(), likeCount: 0 } } } }]);
  r = await tr.collect('al');
  const feed = Object.values(get('users/al/traction/feed') || {});
  ck('a new comment becomes one notification, with the post and platform', r.notified === 1 && feed.length === 1 && feed[0].author === 'Ben' && feed[0].platform === 'youtube' && feed[0].title === 'Tote launch');
  ck('the Instagram audience is cached for a day, not re-read every half hour', igDemo === 1);

  ck('drop-off: biggest fall and what is kept', JSON.stringify(dropOff([[0, 1], [0.1, 0.6], [0.5, 0.45], [1, 0.3]], { dur: 30 })) === JSON.stringify({ biggest_drop_at: '3s', kept_at_25pct: 60, kept_at_50pct: 45, kept_at_end: 30 }));
  ck('trend: too early with under four days', trendOf({ a: { x: 1 } }, {}).dir === 'too-early');

  // ---- advice
  let sent = null;
  on('POST', 'https://api.anthropic.com/v1/messages', (c) => { sent = c.body; return R(200, { content: [{ type: 'text', text: JSON.stringify({
    trend: 'falling', headline: 'Views fell 80% since day one; most people leave in the first 3 seconds.', working: ['Saves are high on Instagram (40).'],
    fix: ['Open on the bag in hand, not the logo.'], angles: ['Show all four colours in 5 seconds.', 'Answer "how much" in the first line.'],
    themes: [{ theme: 'Price questions', share: 40, sentiment: 'neutral', quote: 'How much is it?' }], audience: 'Mostly women 18-34.',
    decision: 'new angle', next: { hook: 'Four bags, one outfit', length: '15-20s', when: 'Weekdays 7pm' }, extra: 'dropped' }) }] }); });
  const adv = await tr.advice('al', 'post1', 'business');
  ck('advice gets the numbers, drop-off, audience and comments - business mode', sent && JSON.parse(sent.messages[0].content).mode === 'business'
    && JSON.parse(sent.messages[0].content).platforms.some((p) => p.retention && p.retention.biggest_drop_at === '3s')
    && JSON.parse(sent.messages[0].content).platforms[0].comments.length >= 1 && /never invent/.test(sent.system));
  ck('advice comes back clean and is stored for the post', adv.decision === 'new angle' && adv.themes[0].share === 40 && !adv.extra && get('users/al/traction/advice/post1/headline'));
  const a2 = await call('POST', '/traction/post1/advice', { token: 'good-al', body: { mode: 'creator' } });
  ck('the advice route works for the signed-in owner', a2.status === 200 && JSON.parse(sent.messages[0].content).mode === 'creator');
  ck('a post with no numbers yet says so', (await call('POST', '/traction/nope/advice', { token: 'good-al' })).status === 404);
  const rf = await call('POST', '/traction/refresh', { token: 'good-al', body: { postId: 'post1' } });
  ck('Refresh reads one post on demand', rf.status === 200 && rf.body.read === 4);

  // ---- hashtag ideas: grouped, with a size band, never a fake live count
  routes = routes.filter(([m]) => !m('POST', 'https://api.anthropic.com/v1/messages'));
  on('POST', 'https://api.anthropic.com/v1/messages', (c) => { sent = c.body; return R(200, { content: [{ type: 'text', text: JSON.stringify({ tags: [
    { tag: '#totebag', group: 'mid', tier: 'medium', why: 'Shoppers looking for totes' }, { tag: 'fashion', group: 'broad', tier: 'huge', why: 'Everyone' },
    { tag: 'workbag', group: 'niche', tier: 'niche', why: 'Commuters' }, { tag: 'Tote Carry', group: 'weird', tier: 'infinite', why: 'x' }, { tag: 'totebag', group: 'mid', tier: 'medium', why: 'dupe' }] }) }] }); });
  const ht = await call('POST', '/hashtags', { token: 'good-al', body: { platforms: ['instagram', 'nope'], heading: 'The Everyday Tote', caption: 'Four colours' } });
  ck('hashtag ideas come back grouped with a size band', ht.status === 200 && ht.body.tags[0].tag === 'totebag' && ht.body.tags[0].tier === 'medium' && ht.body.tags[1].group === 'broad');
  ck('hashtags are cleaned: no #, no spaces, no duplicates, unknown bands blank', ht.body.tags.some((t) => t.tag === 'ToteCarry' && t.tier === '' && t.group === 'mid') && ht.body.tags.filter((t) => t.tag.toLowerCase() === 'totebag').length === 1);
  ck('the model is told these are estimates and to skip spam tags', /estimate/.test(sent.system) && /followforfollow/.test(sent.system) && JSON.parse(sent.messages[0].content).platforms.join() === 'instagram');
  ck('the answer says sizes are estimates', /estimates/.test(ht.body.note));

  // ---- the agent drafts; only an approved email is sent
  routes = routes.filter(([m]) => !m('POST', 'https://api.anthropic.com/v1/messages'));
  on('POST', 'https://api.anthropic.com/v1/messages', (c) => { sent = c.body; return R(200, { content: [{ type: 'text', text: JSON.stringify({ type: 'email', to: 'sam@shop.test', subject: 'March invoice', body: 'Hi Sam,\nThe March invoice is [10] days late.' }) }] }); });
  const as = await call('POST', '/assist', { token: 'good-al', body: { text: 'email sam@shop.test that the march invoice is late', tz: 'America/New_York' } });
  ck('the agent drafts an email and sends nothing', as.status === 200 && as.body.type === 'email' && as.body.to === 'sam@shop.test' && !calls.some((c) => /gmail/.test(c.url)));
  ck('the agent is told to leave brackets instead of inventing facts', /Never invent/.test(sent.system) && JSON.parse(sent.messages[0].content).today.length === 10);
  let gm = null;
  on('POST', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', (c) => { gm = c; return R(200, { id: 'm1' }); });
  on('POST', 'https://gmail.googleapis.com/gmail/v1/users/me/drafts', (c) => { gm = c; return R(200, { id: 'd1' }); });
  set('srv/oauth/al/google/scope', get('srv/oauth/al/google/scope') + ' https://www.googleapis.com/auth/gmail.compose');
  const se = await call('POST', '/assist/email', { token: 'good-al', body: { to: 'sam@shop.test', subject: 'March invoice', body: 'Hi Sam', send: true } });
  const decoded = gm && Buffer.from(gm.body.raw, 'base64url').toString('utf8');
  ck('approving sends exactly that email through Gmail', se.status === 200 && se.body.sent && /To: sam@shop\.test/.test(decoded) && gm.headers.authorization === 'Bearer g-at');
  await call('POST', '/assist/email', { token: 'good-al', body: { to: 'sam@shop.test', subject: 'x', body: 'Draft only', send: false } });
  ck('or it saves a Gmail draft instead', /drafts$/.test(gm.url) && gm.body.message && gm.body.message.raw);
  ck('a bad address is refused', (await call('POST', '/assist/email', { token: 'good-al', body: { to: 'sam', subject: 'x', body: 'y' } })).status === 400);

  // ---- business card
  ck('the card block replaces only Kova’s part of a description', withBlock(`Hi\n\n${START}\nold\n— —\n\nMore`, { email: 'a@b.co' }).split(START).length === 2
    && /Email: a@b\.co/.test(withBlock(`Hi\n\n${START}\nold\n— —\n\nMore`, { email: 'a@b.co' })) && /More$/.test(withBlock(`Hi\n\n${START}\nold\n— —\n\nMore`, { email: 'a@b.co' })));
  let fbSet = null, ytPut = null;
  on('POST', 'https://graph.facebook.com/v23.0/P1', (c) => { fbSet = c.body; return R(200, { success: true }); });
  on('GET', 'https://www.googleapis.com/youtube/v3/channels', () => R(200, { items: [{ id: 'UC1', brandingSettings: { channel: { description: 'Bags made in Lisbon.', keywords: 'bags' } } }] }));
  on('PUT', 'https://www.googleapis.com/youtube/v3/channels', (c) => { ytPut = c.body; return R(200, { id: 'UC1' }); });
  const cp = await call('POST', '/card/push', { token: 'good-al', body: { card: { email: 'hello@kova.shop', phone: '+1 555 0100', website: 'https://kova.shop', bio: 'Bags for every day', booking: 'javascript:alert(1)' } } });
  ck('Facebook Page gets the email, phone and website', cp.status === 200 && cp.body.results.facebook.state === 'ok' && fbSet.emails === '["hello@kova.shop"]' && fbSet.website === 'https://kova.shop' && fbSet.access_token === 'page-tok');
  ck('YouTube keeps the description and adds the business block', cp.body.results.youtube.state === 'ok' && /^Bags made in Lisbon\.\n\n— Business inquiries —/.test(ytPut.brandingSettings.channel.description)
    && ytPut.brandingSettings.channel.keywords === 'bags');
  ck('the card is cleaned: an unsafe link is dropped', cp.body.card.booking === '' && /Email: hello@kova\.shop/.test(cp.body.text));
  ck('an empty card is refused', (await call('POST', '/card/push', { token: 'good-al', body: { card: { bio: 'hi' } } })).status === 400);
  ck('no call went somewhere unexpected', !calls.some((c) => c.unexpected));

  let p = 0, f = 0;
  T.forEach(([n, ok]) => { console.log((ok ? 'PASS' : 'FAIL') + ' - ' + n); ok ? p++ : f++; });
  const odd = calls.filter((c) => c.unexpected).map((c) => c.method + ' ' + c.url);
  if (odd.length) console.log('unexpected:\n  ' + odd.join('\n  '));
  console.log('\n' + p + '/' + (p + f) + ' passing');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
