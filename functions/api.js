/* api - the one HTTP server behind Kova.

   Replaces the two Cloudflare Workers the page was written against
   (relay-worker.js and integrations-worker.js), which were never
   deployed. Same route contract the page already calls, with one
   change: callers are identified by a Firebase ID token in the
   Authorization header, not by a random install id in the query string.
   An install id is a bearer secret anyone can copy out of a URL; an ID
   token is signed by Google and expires in an hour.

   Routes
     GET  /ping                         health check; `has` says which keys are set (yes/no only)
     POST /auth/code    {email}         email a 6-digit sign-in code
     POST /auth/verify  {email,code}    -> {ok, token, name}  (Firebase custom token)
     POST /health/token                 -> {url}  personal Apple Health sync URL      [auth]
     POST /health/:token                Shortcut / Health Auto Export posts here
     GET  /health/:token                the app pulls the merged latest values
     GET  /status                       which providers are linked                    [auth]
     POST /connect/:provider {return,instance}  -> {url} provider consent screen      [auth]
     POST /link/:provider {fields}      Bluesky / Discord / Telegram                  [auth]
     GET  /targets/:provider            Pages, ad accounts, boards, locations, blogs  [auth]
     POST /targets/:provider {id}       choose which one to post to                   [auth]
     GET  /ads/setup                    Meta Ads: ad account, Page, pixel, currency   [auth]
     POST /ads/setup {account,page,pixel}  choose them                                [auth]
     GET  /oauth/callback               provider redirects here
     POST /disconnect/:provider                                                        [auth]
     POST /call/:provider {path,method,body}  proxied provider API call               [auth]
     GET  /inbound                      recent YouTube comments on your videos        [auth]
     POST /script                       Work OS "Creator Script" engine               [auth]
     POST /publish      {post}          publish now, schedule, or send as a draft     [auth]
     GET  /posts                        recent posts and each platform's result       [auth]
     GET  /posts/:id                    one post                                      [auth]
     POST /posts/:id/cancel             unschedule a post that has not run yet        [auth]
     POST /write        {field,...}     write one field of a post with the model      [auth]
     POST /foods/search {q}          USDA FoodData Central: calories, macros and 10 micronutrients per 100 g [auth]
     POST /crew/step   {system,messages,tools,web}  one step of an AI employee's job (Claude with tools) [auth]
     POST /hashtags     {post words}    hashtag ideas, grouped, with a rough size band [auth]
     POST /assist       {text}          the agent drafts a job: an email, a task, or an answer [auth]
     POST /assist/email {to,subject,body,send}  send the APPROVED email, or save it as a Gmail draft [auth]
     POST /traction/refresh {postId?}   read posts' numbers and comments back now     [auth]
     POST /traction/:id/advice {mode}   "What should I fix?" - business or creator    [auth]
     POST /card/push    {card}          business inquiries onto Facebook Page, YouTube [auth]
     GET  /agent                        wellness agent: settings, last audit, alerts  [auth]
     POST /agent/settings {on,tz,times} switch the three daily audits on or off       [auth]
     POST /agent/run    {window?}       queue an audit now ("Check now")              [auth]
     POST /agent/alerts/:id {state}     seen / done                                    [auth]
     POST /chat         {messages,pillar,snapshot}  -> {text}  the chat (was the kovaChat callable) [auth]
     GET  /account/export               everything the server holds about you, no secrets [auth]
     POST /account/delete {confirm:"DELETE"}  delete the account and every record of it [auth]
     POST /media/upload?kind&id&ext&i&n&type   one 3 MB part of a file (Netlify only)   [auth]
     GET  /media/file?p&e&s             a signed link to a file (Netlify only, streamed)
     POST /media/remove {path}          delete one of your files (Netlify only)         [auth]
     POST /meal/read    {image,mime,note}  -> {items}  read a plate from a photo (Pro)   [auth]
     POST /labs/extract {text | image,mime}  -> {rows}  lab results, extraction only (Pro) [auth]
     POST /calendar/sync {blocks,from,to}  Work OS blocks <-> Google Calendar, both ways [auth]
     POST /devices      {token,platform}  this device's push token                     [auth]
     POST /devices/remove {token}       stop pushing to this device                     [auth]
     POST /reminders    {tz,quiet,items}  the reminder list the push schedule uses      [auth]
     GET  /social/me                    your friends-feed profile, followers, following [auth]
     GET  /social/feed                  the opt-in friends feed: workouts and PRs of people you follow [auth]
     POST /social/profile {handle,on}   switch the feed on or off, pick a handle        [auth]
     POST /social/follow {handle,on}    follow or unfollow someone                     [auth]
     POST /social/followers/remove {handle}  remove a follower                          [auth]
     POST /social/post  {stats}         share a finished workout or PR (no health data) [auth]
     POST /social/unpost {id}           take a share back                               [auth]
     POST /social/like  {handle,id,on}  like or unlike a friend's post                  [auth]
     POST /social/comment {handle,id,text}  comment on a friend's post                  [auth]
     GET  /billing/status               {configured, pro, until}  Kova Pro, from RevenueCat [auth]
     POST /billing/webhook              RevenueCat events (its own Authorization value)

   Routes that run the model or publish answer 402 without Kova Pro once
   billing is configured (REVENUECAT_SECRET_KEY); see billing.js.

   Publishing itself runs in the publishWorker function (index.js), which
   picks jobs up from srv/queue - a video upload can take minutes, longer
   than a request should stay open. publishDue moves scheduled posts into
   that queue when their time comes.

   Everything this writes lives under srv/ in the Realtime Database. The
   rules deny all client access there (root is ".read": false), so tokens
   and codes are reachable only through the Admin SDK in this file. */

const crypto = require('crypto');
const admin = require('firebase-admin');
const { clean: cleanHealth } = require('./health');
const { makeOAuth, HttpError, configured } = require('./providers');
const { makeAds, CTAS, EVENTS } = require('./ads');
const { dayOf, WINDOWS } = require('./wellness');
const { makeTraction } = require('./traction');
const { makeCard } = require('./card');
const chat = require('./chat');
const { makeAccount } = require('./account');
const { makePush } = require('./push');
const { makeBilling } = require('./billing');
const meal = require('./meal');
const labs = require('./labs');
const { makeCalendar, CalError } = require('./calendar');
const { makeSocial, SocialError } = require('./social');

const seal = require('./seal');
const db = () => seal.database(admin.database());
const now = () => Date.now();
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rand = (n) => crypto.randomBytes(n).toString('base64url');
const emailKey = (e) => sha(String(e).trim().toLowerCase()).slice(0, 40);

const oauth = (cfg) => makeOAuth({ db: db(), cfg });

/* ---------- auth ------------------------------------------------------ */

async function requireUser(req) {
  const h = req.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new HttpError(401, 'Sign in first.');
  try {
    return await admin.auth().verifyIdToken(m[1]);
  } catch (e) {
    throw new HttpError(401, 'Your session expired. Sign in again.');
  }
}

/* Fixed-window counter. Good enough to stop a loop or a script from
   spending the budget; not a billing system. */
async function rateLimit(key, limit, windowMs) {
  const bucket = Math.floor(now() / windowMs);
  const ref = db().ref(`srv/rate/${key}/${bucket}`);
  const res = await ref.transaction((n) => (n || 0) + 1);
  if ((res.snapshot.val() || 0) > limit) throw new HttpError(429, 'Too many requests. Try again later.');
}

/* Kova Pro, for the routes that cost money to run. Off until
   REVENUECAT_SECRET_KEY is set (see billing.js). 402 tells the page to
   show the paywall. */
const billing = (cfg) => makeBilling({ db: db(), cfg });
async function requirePro(u, cfg) {
  if (!cfg || !cfg.rcSecret) return;
  const st = await billing(cfg).status(u.uid);
  if (!st.pro) throw new HttpError(402, 'This needs Kova Pro. Start the free trial to use it.');
}

/* ---------- email code sign-in ---------------------------------------- */

const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

async function authCode(req, res, cfg) {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!validEmail(email)) throw new HttpError(400, 'That email does not look right.');
  if (!configured(cfg.resendKey)) throw new HttpError(503, 'Email sign-in is not configured on the server yet.');

  const k = emailKey(email);
  await rateLimit(`code_${k}`, 5, 3600e3);
  await rateLimit(`code_ip_${sha(req.ip).slice(0, 16)}`, 30, 3600e3);

  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  await db().ref(`srv/emailCodes/${k}`).set({
    h: sha(k + ':' + code), exp: now() + 10 * 60e3, tries: 0
  });

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.resendKey}` },
    body: JSON.stringify({
      from: cfg.mailFrom,
      to: [email],
      subject: `${code} is your Kova code`,
      text: `Your Kova sign-in code is ${code}\n\nIt expires in 10 minutes. If you did not ask for it, ignore this email.`
    })
  });
  if (!r.ok) {
    console.error('resend', r.status, (await r.text().catch(() => '')).slice(0, 300));
    throw new HttpError(502, 'Could not send the email. Try again in a minute.');
  }
  res.json({ ok: true });
}

async function authVerify(req, res) {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const code = String((req.body && req.body.code) || '').replace(/\D/g, '');
  if (!validEmail(email) || code.length !== 6) return res.json({ ok: false });

  const k = emailKey(email);
  const ref = db().ref(`srv/emailCodes/${k}`);
  const rec = (await ref.once('value')).val();
  if (!rec || rec.exp < now() || rec.tries >= 5) {
    await ref.remove();
    return res.json({ ok: false, expired: true });
  }
  const a = Buffer.from(rec.h), b = Buffer.from(sha(k + ':' + code));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await ref.child('tries').set((rec.tries || 0) + 1);
    return res.json({ ok: false, left: Math.max(0, 5 - ((rec.tries || 0) + 1)) });
  }
  await ref.remove();

  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
    if (!user.emailVerified) await admin.auth().updateUser(user.uid, { emailVerified: true });
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    user = await admin.auth().createUser({ email, emailVerified: true });
  }
  const token = await admin.auth().createCustomToken(user.uid);
  res.json({ ok: true, token, name: user.displayName || '' });
}

/* ---------- Apple Health relay ----------------------------------------
   Each person gets one unguessable URL. A Shortcut or Health Auto Export
   POSTs to it; the app GETs from it. The URL is the credential, which is
   the only thing those tools can carry - so it is long, random, and can
   be rotated from the app. */

async function healthToken(req, res, cfg) {
  const u = await requireUser(req);
  const cur = (await db().ref(`srv/healthByUser/${u.uid}`).once('value')).val();
  let token = cur;
  if (!token || (req.body && req.body.rotate)) {
    if (cur) await db().ref(`srv/healthTokens/${cur}`).remove();
    token = rand(24);
    await db().ref().update({
      [`srv/healthTokens/${token}`]: u.uid,
      [`srv/healthByUser/${u.uid}`]: token
    });
  }
  res.json({ url: `${cfg.base}/health/${token}` });
}

async function healthUid(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new HttpError(404, 'Unknown sync address.');
  const uid = (await db().ref(`srv/healthTokens/${token}`).once('value')).val();
  if (!uid) throw new HttpError(404, 'Unknown sync address.');
  return uid;
}

async function healthPost(req, res, token) {
  const uid = await healthUid(token);
  await rateLimit(`health_${uid}`, 120, 3600e3);
  let body = req.body;
  // Shortcuts may send JSON as text/plain or octet-stream
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  // Shortcuts can also send plain query parameters
  if (!body || !Object.keys(body).length) body = req.query;
  const f = cleanHealth(body);
  const n = Object.keys(f).length;
  if (!n) throw new HttpError(422, 'Nothing Kova recognises in that payload.');
  const ref = db().ref(`srv/health/${uid}`);
  const upd = { ts: now() };
  for (const k of Object.keys(f)) upd[`f/${k}`] = f[k];
  await ref.update(upd);
  /* one row per day as well, so the wellness agent sees trends, not just today */
  const tz = (await db().ref(`srv/agentUsers/${uid}/tz`).once('value')).val() || 'UTC';
  const day = dayOf(now(), tz);
  const row = {};
  for (const k of Object.keys(f)) if (typeof f[k] === 'number' || typeof f[k] === 'string') row[k] = f[k];
  await db().ref(`srv/healthDays/${uid}/${day}`).update(row);
  res.json({ ok: true, fields: n });
}

async function healthGet(req, res, token) {
  const uid = await healthUid(token);
  const v = (await db().ref(`srv/health/${uid}`).once('value')).val() || {};
  res.set('cache-control', 'no-store');
  // flat shape, exactly what KovaHealth.ingest() takes
  res.json(Object.assign({}, v.f || {}, { ts: v.ts || 0 }));
}

/* ---------- OAuth integrations ----------------------------------------
   The per-platform detail lives in providers.js. */

async function status(req, res, cfg) {
  const u = await requireUser(req);
  const out = await oauth(cfg).status(u.uid);
  out._engine = { configured: configured(cfg.anthropicKey) };
  res.set('cache-control', 'no-store');
  res.json(out);
}

async function connect(req, res, cfg, name) {
  const u = await requireUser(req);
  const b = req.body || {};
  res.json({ url: await oauth(cfg).start(u.uid, name, { ret: b.return, instance: b.instance }) });
}

async function linkRoute(req, res, cfg, name) {
  const u = await requireUser(req);
  await rateLimit(`link_${u.uid}`, 30, 3600e3);
  res.json(await oauth(cfg).link(u.uid, name, (req.body || {}).fields));
}

async function targetsRoute(req, res, cfg, name) {
  const u = await requireUser(req);
  const o = oauth(cfg);
  if (req.method === 'POST') return res.json(await o.setTarget(u.uid, name, String((req.body || {}).id || '')));
  res.set('cache-control', 'no-store');
  res.json(await o.targets(u.uid, name));
}

/* Meta Ads: which ad account, Page and pixel the ads are built with */
class Refused extends HttpError { constructor(m) { super(400, m); } }
const adsTool = (cfg) => makeAds({
  fetch: (...a) => fetch(...a), version: () => cfg.fbVersion || 'v23.0', PubError: Refused,
  msgOf: (j, f) => (j && j.error && j.error.message) || f
});
async function adsSetup(req, res, cfg) {
  const u = await requireUser(req);
  const t = await oauth(cfg).get(u.uid, 'metaads');
  const ads = adsTool(cfg);
  if (req.method === 'POST') {
    const b = req.body || {};
    const str = (v) => String(v == null ? '' : v).slice(0, 40).replace(/[^A-Za-z0-9_]/g, '');
    const { upd, label } = await ads.choose(t, { account: str(b.account), page: str(b.page), pixel: b.pixel == null ? null : str(b.pixel) });
    const patch = {};
    Object.keys(upd).forEach((k) => { patch['extra/' + k] = upd[k]; });
    if (label) patch.label = label;
    await db().ref(`srv/oauth/${u.uid}/metaads`).update(patch);
    t.extra = Object.assign({}, t.extra, upd);
  }
  res.set('cache-control', 'no-store');
  res.json(await ads.setup(t));
}

/* back to the app the person came from, with the outcome in the URL */
function backTo(res, ret, key, val) {
  const u = new URL(ret);
  u.searchParams.set(key, val);
  res.status(302).set('location', u.toString()).send('');
}

function page(res, title, msg, ok) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  res.status(ok ? 200 : 400).set('content-type', 'text/html; charset=utf-8').send(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
    `<body style="font-family:-apple-system,system-ui,sans-serif;background:#040003;color:#e3e3e3;display:grid;place-items:center;min-height:90vh;text-align:center;padding:24px">` +
    `<div><div style="font-size:28px;font-weight:300;letter-spacing:.02em">kova</div>` +
    `<p style="font-size:17px;margin:18px 0 6px">${esc(title)}</p><p style="opacity:.6;font-size:14px">${esc(msg)}</p></div>` +
    (ok ? '<script>setTimeout(function(){window.close()},1200)</script>' : '') + '</body>');
}

async function callback(req, res, cfg) {
  const { code, state, error } = req.query;
  if (error) {
    const st = state ? (await db().ref(`srv/oauthState/${String(state).slice(0, 64)}`).once('value')).val() : null;
    if (st && st.ret) { await db().ref(`srv/oauthState/${String(state).slice(0, 64)}`).remove(); return backTo(res, st.ret, 'kova_link_error', 'cancelled'); }
    return page(res, 'Not connected', 'Sign-in was cancelled. You can close this tab.', false);
  }
  if (!state || !code) return page(res, 'Not connected', 'That link is incomplete.', false);
  const r = await oauth(cfg).finish(state, code);
  if (r.ret) return backTo(res, r.ret, r.ok ? 'kova_linked' : 'kova_link_error', r.ok ? r.provider : (r.msg || r.why || 'refused'));
  if (r.ok) return page(res, 'Connected', 'You can close this tab and go back to Kova.', true);
  if (r.why === 'expired') return page(res, 'Link expired', 'Go back to Kova and tap connect again.', false);
  return page(res, 'Not connected', r.msg || 'The provider refused the sign-in. Try again from Kova.', false);
}

async function disconnect(req, res, cfg, name) {
  const u = await requireUser(req);
  await oauth(cfg).disconnect(u.uid, name);
  res.json({ ok: true });
}

async function proxy(req, res, cfg, name) {
  const u = await requireUser(req);
  await rateLimit(`call_${u.uid}`, 300, 3600e3);
  const o = oauth(cfg);
  const p = o.provider(name);
  if (!p.paths) throw new HttpError(403, 'That API is not allowed.');
  const spec = req.body || {};
  const path = String(spec.path || '');
  if (!p.paths.some((re) => re.test(path)) || path.includes('..')) throw new HttpError(403, 'That API is not allowed.');
  const method = String(spec.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) throw new HttpError(400, 'Bad method.');
  const t = await o.get(u.uid, name);
  const r = await fetch(p.api + path, {
    method,
    headers: Object.assign({ authorization: `Bearer ${t.access_token}` },
      spec.body ? { 'content-type': 'application/json' } : {}),
    body: spec.body && method !== 'GET' ? JSON.stringify(spec.body) : undefined
  });
  const body = await r.text();
  // the page expects the provider's body as a string it parses itself
  res.json(r.ok ? { status: r.status, body } : { status: r.status, error: true, body });
}

/* ---------- inbound comments ------------------------------------------
   YouTube only. Instagram and TikTok comment APIs need an approved
   business app on their side, which no amount of code here replaces. */

async function inbound(req, res, cfg) {
  const u = await requireUser(req);
  await rateLimit(`inbound_${u.uid}`, 60, 3600e3);
  let token;
  try { token = (await oauth(cfg).get(u.uid, 'google')).access_token; } catch (e) { return res.json({ items: [] }); }
  const yt = async (path) => {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) throw new HttpError(502, 'YouTube did not answer.');
    return r.json();
  };
  const ch = await yt('channels?part=id&mine=true');
  const channelId = ch.items && ch.items[0] && ch.items[0].id;
  if (!channelId) return res.json({ items: [] });
  const threads = await yt(`commentThreads?part=snippet&allThreadsRelatedToChannelId=${channelId}&maxResults=50&order=time`);
  const vids = {};
  const items = (threads.items || []).map((t) => {
    const s = t.snippet.topLevelComment.snippet;
    vids[t.snippet.videoId] = 1;
    return {
      id: t.id, platform: 'youtube', videoId: t.snippet.videoId, post: '',
      author: s.authorDisplayName || '', text: s.textOriginal || '',
      at: s.publishedAt, likes: s.likeCount || 0
    };
  });
  const ids = Object.keys(vids).slice(0, 50);
  if (ids.length) {
    const v = await yt(`videos?part=snippet&id=${ids.join(',')}`).catch(() => ({ items: [] }));
    const titles = {};
    (v.items || []).forEach((x) => { titles[x.id] = x.snippet.title; });
    items.forEach((i) => { i.post = titles[i.videoId] || 'Your video'; });
  }
  res.set('cache-control', 'no-store');
  res.json({ items });
}

/* ---------- Creator Script engine ------------------------------------- */

const SCRIPT_SYSTEM = `You are the planning engine inside Kova's Work OS. You receive a creator's raw input (an idea, notes, or a transcript), optional biometric context, and their open tasks.

Return ONE JSON object and nothing else - no prose, no code fences. Shape:
{
  "linkedin_payload": string,           // a ready-to-post LinkedIn draft, 80-220 words, plain text
  "twitter_x_payload": string,          // a single post under 270 characters
  "short_form_video_script": {          // 30-60 second vertical video
    "hook": string, "beats": [string], "cta": string
  },
  "task_scheduler_instructions": [      // only for tasks in open_tasks
    { "task_id": string, "action": "defer" | "keep" | "split", "reason": string }
  ]
}

Rules:
- Write in the creator's own voice from their input. No hashtags walls, no emojis unless they used them.
- task_id must be copied exactly from open_tasks. Never invent one.
- If biometric context says readiness is low, defer high-"cog" tasks that are not due today, and say why in under 120 characters.
- If there is no raw input, return empty strings for the payloads and only scheduling advice.`;

async function script(req, res, cfg) {
  const u = await requireUser(req);
  await requirePro(u, cfg);
  if (!configured(cfg.anthropicKey)) throw new HttpError(503, 'The engine is not configured on the server yet.');
  await rateLimit(`script_${u.uid}`, 40, 24 * 3600e3);
  const b = req.body || {};
  const ing = b.universal_workflow_ingestion || {};
  const input = {
    raw_input: String(ing.user_raw_input || '').slice(0, 8000),
    strategic_angle: ing.strategic_angle ? String(ing.strategic_angle).slice(0, 400) : undefined,
    biometric_context: b.optional_biometric_context || { is_connected: false },
    open_tasks: (Array.isArray(b.open_tasks) ? b.open_tasks : []).slice(0, 40).map((t) => ({
      id: String(t.id || '').slice(0, 64), name: String(t.name || '').slice(0, 160),
      cog: +t.cog || 5, due: t.due || ''
    }))
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: cfg.model, max_tokens: 1500, system: SCRIPT_SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(input) }]
    })
  });
  if (!r.ok) {
    console.error('script model', r.status, (await r.text().catch(() => '')).slice(0, 300));
    throw new HttpError(502, 'The engine is unavailable right now.');
  }
  const j = await r.json();
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  let obj = null;
  try { obj = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); } catch (e) {
    const i = text.indexOf('{'), k = text.lastIndexOf('}');
    if (i >= 0 && k > i) { try { obj = JSON.parse(text.slice(i, k + 1)); } catch (e2) { obj = null; } }
  }
  if (!obj) throw new HttpError(502, 'The engine returned something unreadable. Try again.');
  res.json(obj);
}

/* ---------- publishing -----------------------------------------------
   The page sends a post already shaped per platform. This checks it,
   files it under srv/posts/{uid}/{id}, and either queues it for the
   publishWorker now or files it for publishDue to queue later. */

const TARGETS = ['youtube', 'instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'metaads', 'threads', 'pinterest',
                 'bluesky', 'reddit', 'tumblr', 'mastodon', 'discord', 'telegram', 'gbusiness'];
const NAMES = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', x: 'X',
                facebook: 'Facebook', metaads: 'Meta Ads', threads: 'Threads', pinterest: 'Pinterest', bluesky: 'Bluesky',
                reddit: 'Reddit', tumblr: 'Tumblr', mastodon: 'Mastodon', discord: 'Discord', telegram: 'Telegram',
                gbusiness: 'Google Business Profile' };
const TT_PRIVACY = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];

function cleanPost(uid, body) {
  const p = (body && body.post) || {};
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  const id = s(p.id, 64).replace(/[^A-Za-z0-9_-]/g, '');
  if (!id) throw new HttpError(400, 'Missing post id.');
  const targets = (Array.isArray(p.targets) ? p.targets : []).filter((t, i, a) => TARGETS.includes(t) && a.indexOf(t) === i);
  if (!targets.length) throw new HttpError(400, 'Pick at least one platform.');
  const media = (Array.isArray(p.media) ? p.media : []).slice(0, 20).map((m) => ({
    path: s(m && m.path, 300), type: m && m.type === 'video' ? 'video' : 'image',
    mime: s(m && m.mime, 60), bytes: +(m && m.bytes) || 0, w: +(m && m.w) || 0, h: +(m && m.h) || 0,
    dur: +(m && m.dur) || 0, name: s(m && m.name, 120)
  }));
  for (const m of media) {
    if (!m.path.startsWith(`users/${uid}/post/`) || m.path.includes('..')) throw new HttpError(403, 'That media is not yours.');
  }
  const t = p.text || {};
  const g = (k) => t[k] || {};
  const text = {
    youtube: { title: s(g('youtube').title, 200), description: s(g('youtube').description, 6000),
               tags: (Array.isArray(g('youtube').tags) ? g('youtube').tags : []).slice(0, 30).map((x) => s(x, 60)) },
    instagram: { caption: s(g('instagram').caption, 2400) },
    tiktok: { caption: s(g('tiktok').caption, 2400) },
    linkedin: { text: s(g('linkedin').text, 3200), title: s(g('linkedin').title, 200) },
    x: { text: s(g('x').text, 1000) },
    facebook: { text: s(g('facebook').text, 64000), title: s(g('facebook').title, 250) },
    metaads: { primary: s(g('metaads').primary, 5000), headline: s(g('metaads').headline, 255), description: s(g('metaads').description, 255) },
    threads: { text: s(g('threads').text, 1000) },
    pinterest: { title: s(g('pinterest').title, 200), description: s(g('pinterest').description, 1000),
                 link: /^https?:\/\//.test(g('pinterest').link || '') ? s(g('pinterest').link, 2000) : '' },
    bluesky: { text: s(g('bluesky').text, 1000) },
    reddit: { title: s(g('reddit').title, 400), text: s(g('reddit').text, 40000) },
    tumblr: { text: s(g('tumblr').text, 20000), tags: (Array.isArray(g('tumblr').tags) ? g('tumblr').tags : []).slice(0, 30).map((x) => s(x, 60)) },
    mastodon: { text: s(g('mastodon').text, 5000) },
    discord: { text: s(g('discord').text, 2500) },
    telegram: { text: s(g('telegram').text, 5000) },
    gbusiness: { text: s(g('gbusiness').text, 2000) }
  };
  const o = p.options || {};
  const oy = o.youtube || {}, ot = o.tiktok || {}, orr = o.reddit || {}, om = o.metaads || {};
  const oi = o.instagram || {}, of = o.facebook || {};
  const PLACE = ['post', 'reel', 'story'];
  const options = {
    youtube: { privacy: ['public', 'unlisted', 'private'].includes(oy.privacy) ? oy.privacy : 'public', madeForKids: !!oy.madeForKids, short: !!oy.short },
    instagram: { place: PLACE.includes(oi.place) ? oi.place : 'post' },
    facebook: { place: PLACE.includes(of.place) ? of.place : 'post' },
    tiktok: { mode: ot.mode === 'draft' ? 'draft' : 'direct', privacy: TT_PRIVACY.includes(ot.privacy) ? ot.privacy : 'PUBLIC_TO_EVERYONE' },
    reddit: { subreddit: s(orr.subreddit, 60).replace(/[^A-Za-z0-9_]/g, '') },
    metaads: {
      build: om.build === 'ads' ? 'ads' : 'library',
      goal: ['sales', 'traffic', 'awareness'].includes(om.goal) ? om.goal : 'sales',
      budget: Math.min(1e6, Math.max(0, Math.round((+om.budget || 0) * 100) / 100)),
      split: om.split === 'each' ? 'each' : 'one',
      countries: (Array.isArray(om.countries) ? om.countries : []).map((c) => s(c, 2).toUpperCase())
        .filter((c, i, a) => /^[A-Z]{2}$/.test(c) && a.indexOf(c) === i).slice(0, 25),
      cta: CTAS.includes(om.cta) ? om.cta : 'SHOP_NOW',
      event: EVENTS.includes(om.event) ? om.event : 'PURCHASE',
      link: /^https:\/\//.test(om.link || '') ? s(om.link, 2000) : ''
    }
  };
  return { id, targets, media, text, options, draft: !!p.draft, when: +p.when || 0,
           title: s(p.title, 120), format: s(p.format, 20) };
}

function summary(id, r) {
  const pl = r.payload || {};
  return { id, state: r.state, when: r.when || 0, createdAt: r.createdAt || 0, updatedAt: r.updatedAt || 0,
           finishedAt: r.finishedAt || 0, title: pl.title || '', targets: pl.targets || [], draft: !!pl.draft,
           results: r.results || {} };
}

async function publishRoute(req, res, cfg) {
  const u = await requireUser(req);
  await requirePro(u, cfg);
  const post = cleanPost(u.uid, req.body);
  const st = await oauth(cfg).status(u.uid);
  const missing = post.targets.filter((k) => !(k === 'youtube' ? st.youtube.canUpload : (st[k] && st[k].linked)));
  if (missing.length) throw new HttpError(409, `Connect ${missing.map((k) => NAMES[k]).join(', ')} first.`);
  if (post.when && post.when > now() + 180 * 864e5) throw new HttpError(400, 'Schedule it within the next 180 days.');
  await rateLimit(`publish_${u.uid}`, 60, 24 * 3600e3);

  const ref = db().ref(`srv/posts/${u.uid}/${post.id}`);
  const prev = (await ref.once('value')).val();
  if (prev && ['queued', 'publishing'].includes(prev.state)) throw new HttpError(409, 'That post is already being published.');
  /* a retry keeps what already went out, so nothing is posted twice */
  const kept = {};
  Object.keys((prev && prev.results) || {}).forEach((k) => {
    const r = prev.results[k];
    if (r && ['ok', 'draft', 'skipped'].includes(r.state) && post.targets.includes(k)) kept[k] = r;
  });
  const scheduled = post.when > now() + 60e3;
  const rec = {
    payload: post, state: scheduled ? 'scheduled' : 'queued', results: kept,
    createdAt: (prev && prev.createdAt) || now(), updatedAt: now(), when: scheduled ? post.when : 0
  };
  if (prev && prev.work) rec.work = prev.work;       // ids a platform already has - a retry carries on
  await ref.set(rec);
  await db().ref(`srv/scheduled/${u.uid}_${post.id}`).remove();
  if (scheduled) await db().ref(`srv/scheduled/${u.uid}_${post.id}`).set({ uid: u.uid, id: post.id, at: post.when });
  else {
    await db().ref(`srv/queue/${u.uid}/${post.id}`).set({ at: now() });
    if (cfg.kick) await cfg.kick('publish');
  }
  res.json(summary(post.id, rec));
}

async function postsRoute(req, res, id) {
  const u = await requireUser(req);
  res.set('cache-control', 'no-store');
  if (id) {
    const r = (await db().ref(`srv/posts/${u.uid}/${id}`).once('value')).val();
    if (!r) throw new HttpError(404, 'No such post.');
    return res.json(summary(id, r));
  }
  const all = (await db().ref(`srv/posts/${u.uid}`).once('value')).val() || {};
  const list = Object.keys(all).map((k) => summary(k, all[k]))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 50);
  res.json({ posts: list });
}

async function cancelRoute(req, res, id) {
  const u = await requireUser(req);
  const ref = db().ref(`srv/posts/${u.uid}/${id}`);
  const r = (await ref.once('value')).val();
  if (!r) throw new HttpError(404, 'No such post.');
  if (r.state !== 'scheduled') throw new HttpError(409, 'Only a scheduled post can be cancelled.');
  await db().ref(`srv/scheduled/${u.uid}_${id}`).remove();
  await ref.update({ state: 'cancelled', updatedAt: now() });
  res.json(summary(id, Object.assign({}, r, { state: 'cancelled' })));
}

/* ---------- writing one field -------------------------------------------- */

const WRITE_SYSTEM = `You write social media copy inside Kova's Work OS Studio. You get the post so far (heading, primary text, caption, hashtags), which platforms it is going to, what media is attached, and which ONE field to write.

Return only the text for that field. No quotes around it, no labels, no preamble, no markdown.

Fields:
- heading: the title / headline. Under 90 characters. Specific, no clickbait, no emojis.
- body: the primary text. 40-150 words, plain sentences, short paragraphs separated by a blank line.
- caption: the short line that sits with the media. One or two sentences, under 150 characters.
- tags: 3 to 8 relevant hashtags, lowercase, separated by single spaces, each starting with #.

Rules:
- Keep the person's own voice and facts from what they already wrote. Never invent numbers, names or claims.
- If an instruction is given, follow it.
- No emojis unless the person already used them.
- Avoid these words: delve, testament, crucial, game-changer, leverage, seamless, unlock, revolutionize, "in today's fast-paced world".`;

async function writeRoute(req, res, cfg) {
  const u = await requireUser(req);
  await requirePro(u, cfg);
  if (!configured(cfg.anthropicKey)) throw new HttpError(503, 'The writer is not configured on the server yet.');
  await rateLimit(`write_${u.uid}`, 120, 24 * 3600e3);
  const b = req.body || {};
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  const field = ['heading', 'body', 'caption', 'tags'].includes(b.field) ? b.field : 'caption';
  const ask = {
    field,
    platforms: (Array.isArray(b.platforms) ? b.platforms : []).filter((k) => TARGETS.includes(k)),
    format: s(b.format, 20),
    media: (Array.isArray(b.media) ? b.media : []).slice(0, 10).map((m) => ({ type: s(m && m.type, 10), name: s(m && m.name, 80) })),
    post: { heading: s(b.heading, 300), body: s(b.body, 4000), caption: s(b.caption, 600), tags: s(b.tags, 400) },
    instruction: s(b.instruction, 500)
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 700, system: WRITE_SYSTEM,
                           messages: [{ role: 'user', content: JSON.stringify(ask) }] })
  });
  if (!r.ok) {
    console.error('write model', r.status, (await r.text().catch(() => '')).slice(0, 300));
    throw new HttpError(502, 'The writer is unavailable right now.');
  }
  const j = await r.json();
  let text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  text = text.replace(/^["“]|["”]$/g, '').trim();
  if (!text) throw new HttpError(502, 'The writer came back empty. Try again.');
  res.json({ field, text });
}

/* ---------- hashtag ideas -------------------------------------------------
   No platform gives apps a live post count for a hashtag, so this never
   pretends to: the model groups ideas and gives each a SIZE BAND from what
   it knows, which the page labels "est.". The person's own results per tag
   come from Traction, on the page. */
const TAG_SYSTEM = `You suggest hashtags for one social post. You get the post's words, its format and which apps it goes to.

Return ONE JSON object, nothing else:
{"tags":[{"tag":string,"group":"broad"|"mid"|"niche"|"brand","tier":"huge"|"big"|"medium"|"niche","why":string}]}

- 14 to 18 tags: about 4 broad, 5 mid (the post's topic), 5 niche (specific enough to rank in), and 1 to 3 brand/community tags if a brand or community is named.
- tag: no # sign, no spaces, as people actually type it (camel case only if common).
- tier is your best estimate of how many public posts use the tag: huge = 50M+, big = 5M-50M, medium = 500K-5M, niche = under 500K. It is an estimate; do not pretend precision.
- why: under 12 words - who uses it and why it fits this post.
- Only relevant tags. No banned or spammy tags (#followforfollow, #like4like...). No tags that misdescribe the post.`;
const TIERS = ['huge', 'big', 'medium', 'niche'];
const TGROUPS = ['broad', 'mid', 'niche', 'brand'];
/* ---------- USDA FoodData Central search ----------
   Generic foods only (Foundation, SR Legacy, FNDDS): their values are per
   100 g, so the page can scale by the grams you type. FDC_API_KEY is a free
   api.data.gov key; DEMO_KEY works but is rate-limited per IP. */
const FDC_N = { kcal: [1008, 2047, 2048], p: [1003], c: [1005], f: [1004],
  fib: [1079], na: [1093], k: [1092], ca: [1087], fe: [1089], mg: [1090], c_: [1162], d: [1114], b12: [1178], fol: [1177, 1190] };
function fdcFood(x) {
  const by = {};
  (x.foodNutrients || []).forEach((n) => {
    const id = +(n.nutrientId || (n.nutrient && n.nutrient.id));
    const v = +(n.value != null ? n.value : n.amount);
    if (id && isFinite(v) && by[id] == null) by[id] = v;
  });
  const pick = (ids) => { for (const i of ids) if (by[i] != null) return by[i]; return null; };
  const r1 = (v) => Math.round((v || 0) * 10) / 10;
  const m = {};
  ['fib', 'na', 'k', 'ca', 'fe', 'mg', 'c_', 'd', 'b12', 'fol'].forEach((k) => { const v = pick(FDC_N[k]); if (v != null) m[k === 'c_' ? 'c' : k] = r1(v); });
  const kcal = pick(FDC_N.kcal);
  if (kcal == null) return null;
  return { id: x.fdcId, n: String(x.description || '').slice(0, 120), type: x.dataType || '',
    kcal: r1(kcal), p: r1(pick(FDC_N.p)), c: r1(pick(FDC_N.c)), f: r1(pick(FDC_N.f)), m };
}
async function foodsSearch(req, res, cfg) {
  const u = await requireUser(req);
  await rateLimit(`fdc_${u.uid}`, 300, 24 * 3600e3);
  const q = String((req.body || {}).q || '').trim().slice(0, 80);
  if (q.length < 2) throw new HttpError(400, 'Type at least two letters.');
  const r = await fetch('https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(cfg.fdcKey || 'DEMO_KEY'), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: q, dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)'], pageSize: 12 })
  });
  if (r.status === 429) throw new HttpError(429, 'USDA search is busy. Try again in a minute.');
  if (!r.ok) throw new HttpError(502, 'USDA search is unavailable right now.');
  const j = await r.json();
  const foods = (j.foods || []).map(fdcFood).filter(Boolean).slice(0, 8);
  return res.json({ foods, source: 'USDA FoodData Central', per: '100 g' });
}

/* ---------- AI employees: one step of an employee's job ----------
   The page runs the loop. It sends the conversation so far and the tools
   that employee is allowed; Claude answers with text and tool calls; the
   page carries the calls out on the person's own Work OS data, asking
   first for anything that leaves Kova, and sends the results back. Web
   search is the one tool that runs here (on Anthropic's side), and only
   for employees whose job includes research. */
const CREW_TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;
const CREW_BLOCKS = ['text', 'tool_use', 'tool_result', 'server_tool_use', 'web_search_tool_result'];
function cleanCrew(b) {
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  const tools = (Array.isArray(b.tools) ? b.tools : []).slice(0, 24)
    .filter((t) => t && CREW_TOOL_NAME.test(String(t.name || '')) && t.name !== 'web_search')
    .map((t) => ({
      name: t.name, description: s(t.description, 800),
      input_schema: t.input_schema && t.input_schema.type === 'object' ? t.input_schema : { type: 'object', properties: {} }
    }));
  const block = (x) => (x && CREW_BLOCKS.includes(x.type) ? x : null);
  const messages = (Array.isArray(b.messages) ? b.messages : []).slice(-40)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? s(m.content, 12000)
        : (Array.isArray(m.content) ? m.content.slice(0, 40).map(block).filter(Boolean) : '')
    }))
    .filter((m) => (typeof m.content === 'string' ? m.content.trim() : m.content.length));
  if (!messages.length || messages[0].role !== 'user') throw new HttpError(400, 'A job starts with your message.');
  if (JSON.stringify(messages).length > 240000) throw new HttpError(413, 'This job has grown too long. Start a new one.');
  return { system: s(b.system, 24000), tools, messages, web: b.web === true };
}
async function crewStep(req, res, cfg) {
  const u = await requireUser(req);
  await requirePro(u, cfg);
  if (!configured(cfg.anthropicKey)) throw new HttpError(503, 'AI employees need the Kova server\'s Claude key.');
  await rateLimit(`crew_${u.uid}`, 400, 24 * 3600e3);
  const c = cleanCrew(req.body || {});
  const tools = c.tools.slice();
  if (c.web) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 2000, system: c.system, tools, messages: c.messages })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('crew', r.status, t.slice(0, 300));
    throw new HttpError(502, 'Your employee could not think just now. Try again in a moment.');
  }
  const j = await r.json();
  return res.json({ content: Array.isArray(j.content) ? j.content : [], stop_reason: j.stop_reason || '', usage: j.usage || null });
}

async function hashtagsRoute(req, res, cfg) {
  const u = await requireUser(req);
  await requirePro(u, cfg);
  if (!configured(cfg.anthropicKey)) throw new HttpError(503, 'Hashtag sizes need the Kova server\'s Claude key.');
  await rateLimit(`tags_${u.uid}`, 40, 24 * 3600e3);
  const b = req.body || {};
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  const ask = {
    platforms: (Array.isArray(b.platforms) ? b.platforms : []).filter((k) => TARGETS.includes(k)),
    format: s(b.format, 20), heading: s(b.heading, 300), body: s(b.body, 3000), caption: s(b.caption, 600), current: s(b.tags, 400),
    media: (Array.isArray(b.media) ? b.media : []).slice(0, 10).map((m) => ({ type: s(m && m.type, 10), name: s(m && m.name, 80) }))
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 1200, system: TAG_SYSTEM, messages: [{ role: 'user', content: JSON.stringify(ask) }] })
  });
  if (!r.ok) throw new HttpError(502, 'Hashtag ideas are unavailable right now.');
  const j = await r.json();
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  let out = null;
  try { out = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); }
  catch (e) { const a = text.indexOf('{'), z = text.lastIndexOf('}'); if (a >= 0 && z > a) { try { out = JSON.parse(text.slice(a, z + 1)); } catch (e2) { out = null; } } }
  const seen = {};
  const tags = ((out && out.tags) || []).map((t) => ({
    tag: s(t && t.tag, 60).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''),
    group: TGROUPS.includes(t && t.group) ? t.group : 'mid',
    tier: TIERS.includes(t && t.tier) ? t.tier : '',
    why: s(t && t.why, 120)
  })).filter((t) => t.tag && !seen[t.tag.toLowerCase()] && (seen[t.tag.toLowerCase()] = 1)).slice(0, 24);
  if (!tags.length) throw new HttpError(502, 'No hashtag ideas came back. Try again.');
  res.json({ tags, note: 'Sizes are estimates. No app can read live hashtag counts.' });
}

/* ---------- the agent's "do it for me" ------------------------------------
   The model only drafts. Nothing leaves until the person approves it in the
   app, and then /assist/email sends exactly what they approved. */
const ASSIST_SYSTEM = `You are Kova's work assistant inside the person's Work OS. They ask you to do a job. You DRAFT it; they approve it before anything happens.

Return ONE JSON object, nothing else. One of:
{"type":"email","to":string,"subject":string,"body":string}
{"type":"task","name":string,"due":"YYYY-MM-DD" or "","notes":string}
{"type":"answer","text":string}

- email: plain, friendly, specific; sign off with the person's first name if given, otherwise no name. Use the address they gave; if they gave only a name, leave "to" empty so they fill it in. Never invent facts, amounts or dates they did not give - leave a [bracket] for them to fill instead.
- task: a short action name starting with a verb; turn "Friday", "tomorrow" into a date using today's date given.
- answer: when it is a question, not a job. Under 120 words.`;
async function assistRoute(req, res, cfg) {
  const u = await requireUser(req);
  await requirePro(u, cfg);
  if (!configured(cfg.anthropicKey)) throw new HttpError(503, 'The agent needs the Kova server\'s Claude key.');
  await rateLimit(`assist_${u.uid}`, 60, 24 * 3600e3);
  const b = req.body || {};
  const text = String(b.text || '').slice(0, 2000);
  if (!text.trim()) throw new HttpError(400, 'Tell the agent what to do.');
  let today = new Date().toISOString().slice(0, 10);
  try { today = new Intl.DateTimeFormat('en-CA', { timeZone: String(b.tz || 'UTC') }).format(new Date()); } catch (e) { /* UTC */ }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 900, system: ASSIST_SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify({ today, request: text }) }] })
  });
  if (!r.ok) throw new HttpError(502, 'The agent is unavailable right now.');
  const j = await r.json();
  const raw = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  let o = null;
  try { o = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); }
  catch (e) { const a = raw.indexOf('{'), z = raw.lastIndexOf('}'); if (a >= 0 && z > a) { try { o = JSON.parse(raw.slice(a, z + 1)); } catch (e2) { o = null; } } }
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  if (!o || !['email', 'task', 'answer'].includes(o.type)) return res.json({ type: 'answer', text: s(raw, 1200) || 'I could not draft that. Try saying it another way.' });
  if (o.type === 'email') return res.json({ type: 'email', to: s(o.to, 200), subject: s(o.subject, 200), body: s(o.body, 8000) });
  if (o.type === 'task') return res.json({ type: 'task', name: s(o.name, 200), due: /^\d{4}-\d{2}-\d{2}$/.test(o.due || '') ? o.due : '', notes: s(o.notes, 2000) });
  return res.json({ type: 'answer', text: s(o.text, 2000) });
}
async function assistEmail(req, res, cfg) {
  const u = await requireUser(req);
  await rateLimit(`mail_${u.uid}`, 30, 24 * 3600e3);
  const b = req.body || {};
  const to = String(b.to || '').trim(), subject = String(b.subject || '').replace(/[\r\n]+/g, ' ').slice(0, 200), body = String(b.body || '').slice(0, 20000);
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(to)) throw new HttpError(400, 'Add a real email address in To.');
  if (!body.trim()) throw new HttpError(400, 'The email is empty.');
  let t;
  try { t = await oauth(cfg).get(u.uid, 'google'); } catch (e) { throw new HttpError(409, 'Connect Google in Work OS first, and allow Gmail drafts.'); }
  if (!/gmail\.compose|gmail\.send/.test(t.scope || '')) throw new HttpError(409, 'Reconnect Google and allow Kova to write Gmail drafts.');
  const enc = (x) => `=?UTF-8?B?${Buffer.from(x, 'utf8').toString('base64')}?=`;
  const mime = [`To: ${to}`, `Subject: ${enc(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(body, 'utf8').toString('base64')].join('\r\n');
  const rawMsg = Buffer.from(mime, 'utf8').toString('base64url');
  const send = !!b.send;
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${send ? 'messages/send' : 'drafts'}`, {
    method: 'POST', headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify(send ? { raw: rawMsg } : { message: { raw: rawMsg } })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, 'Gmail refused it: ' + ((j.error && j.error.message) || `HTTP ${r.status}`));
  res.json({ ok: true, sent: send, id: j.id || '' });
}

/* ---------- traction and the business card ---------------------------- */

async function tractionRefresh(req, res, cfg) {
  const u = await requireUser(req);
  await rateLimit(`traction_${u.uid}`, 30, 3600e3);
  const only = String((req.body || {}).postId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  const out = await makeTraction({ db: db(), cfg, tokens: oauth(cfg) }).collect(u.uid, only || null);
  res.json(out);
}
async function tractionAdvice(req, res, cfg, pid) {
  const u = await requireUser(req);
  await requirePro(u, cfg);
  await rateLimit(`advice_${u.uid}`, 20, 24 * 3600e3);
  const id = String(pid).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  try {
    res.json(await makeTraction({ db: db(), cfg, tokens: oauth(cfg) }).advice(u.uid, id, (req.body || {}).mode));
  } catch (e) {
    if (e.status) throw new HttpError(e.status, e.message);
    throw e;
  }
}
async function cardPush(req, res, cfg) {
  const u = await requireUser(req);
  await rateLimit(`card_${u.uid}`, 20, 3600e3);
  const b = req.body || {};
  try {
    res.json(await makeCard({ cfg, tokens: oauth(cfg) }).push(u.uid, b.card, Array.isArray(b.only) ? b.only : null));
  } catch (e) {
    if (e.status) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/* ---------- wellness agent -------------------------------------------- */

async function agentGet(req, res) {
  const u = await requireUser(req);
  const [set, mine] = await Promise.all([
    db().ref(`srv/agentUsers/${u.uid}`).once('value'), db().ref(`users/${u.uid}/agent`).once('value')
  ]);
  const s = set.val() || {}, a = mine.val() || {};
  res.set('cache-control', 'no-store');
  res.json({ on: !!s.on, tz: s.tz || '', times: s.times || null, last: a.last || null,
             alerts: Object.values(a.alerts || {}).sort((x, y) => (y.at || 0) - (x.at || 0)) });
}
async function agentSettings(req, res) {
  const u = await requireUser(req);
  const b = req.body || {};
  const upd = { on: !!b.on };
  if (typeof b.tz === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(b.tz) && b.tz.length <= 64) upd.tz = b.tz;
  if (b.times && typeof b.times === 'object') {
    const t = {};
    WINDOWS.forEach((w) => { const v = +b.times[w]; if (v >= 0 && v < 1440) t[w] = Math.round(v); });
    upd.times = t;
  }
  await db().ref(`srv/agentUsers/${u.uid}`).update(upd);
  res.json({ ok: true, on: upd.on });
}
async function agentRun(req, res, cfg) {
  const u = await requireUser(req);
  await requirePro(u, cfg);
  await rateLimit(`agent_${u.uid}`, 8, 24 * 3600e3);
  const q = db().ref(`srv/agentQueue/${u.uid}`);
  if ((await q.once('value')).val()) throw new HttpError(409, 'An audit is already running.');
  const b = req.body || {};
  if (typeof b.tz === 'string' && b.tz.length <= 64) await db().ref(`srv/agentUsers/${u.uid}/tz`).set(b.tz);
  await q.set({ window: WINDOWS.includes(b.window) ? b.window : null, at: now(), why: 'now' });
  if (cfg && cfg.kick) await cfg.kick('agent');
  res.json({ ok: true, queued: true });
}
async function agentAlert(req, res, id) {
  const u = await requireUser(req);
  if (!/^[0-9-]{10}_[a-z]+$/.test(id)) throw new HttpError(400, 'Bad alert id.');
  const state = (req.body || {}).state;
  if (!['seen', 'done'].includes(state)) throw new HttpError(400, 'State is seen or done.');
  const ref = db().ref(`users/${u.uid}/agent/alerts/${id}`);
  if (!(await ref.once('value')).val()) throw new HttpError(404, 'No such alert.');
  await ref.update({ state, [state + 'At']: now() });
  res.json({ ok: true });
}

/* ---------- chat -------------------------------------------------------- */

async function chatRoute(req, res, cfg) {
  const u = await requireUser(req);
  await requirePro(u, cfg);
  try {
    res.json(await chat.answer({ db: db(), cfg, uid: u.uid, body: req.body }));
  } catch (e) {
    if (e instanceof chat.ChatError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/* ---------- account: export and delete ---------------------------------- */

/* Firebase Storage when running on Google; Netlify passes its own store */
function mediaOf(cfg) {
  if (cfg.media) return cfg.media;
  return {
    list: async () => [],
    removePrefix: async (prefix) => { if (admin.storage) await admin.storage().bucket().deleteFiles({ prefix }); }
  };
}
const account = (cfg) => makeAccount({ db: db(), auth: admin.auth(), oauth: oauth(cfg), media: mediaOf(cfg), emailKey, billing: billing(cfg), social: social() });

async function accountExport(req, res, cfg) {
  const u = await requireUser(req);
  await rateLimit(`export_${u.uid}`, 10, 3600e3);
  res.set('cache-control', 'no-store');
  res.json(await account(cfg).exportAll(u.uid));
}
async function accountDelete(req, res, cfg) {
  const u = await requireUser(req);
  if (String((req.body || {}).confirm || '') !== 'DELETE') throw new HttpError(400, 'Confirm with DELETE.');
  await rateLimit(`delete_${u.uid}`, 5, 3600e3);
  const r = await account(cfg).removeAll(u.uid);
  res.status(r.ok ? 200 : 500).json(r);
}

/* ---------- media (Netlify Blobs) --------------------------------------- */

async function mediaUpload(req, res, cfg) {
  const u = await requireUser(req);
  if (!cfg.media) throw new HttpError(501, 'File storage is not set up on this server.');
  await rateLimit(`media_${u.uid}`, 400, 3600e3);
  try {
    res.json(await cfg.media.putPart(u.uid, req.query || {}, req.body));
  } catch (e) {
    if (e && e.status) throw new HttpError(e.status, e.message);
    throw e;
  }
}

/* ---------- meal photo read -------------------------------------------- */

async function mealRead(req, res, cfg) {
  const u = await requireUser(req);
  await requirePro(u, cfg);
  await rateLimit(`meal_${u.uid}`, 60, 24 * 3600e3);
  try { res.json(await meal.readMeal({ cfg, body: req.body })); }
  catch (e) { if (e instanceof meal.MealError) throw new HttpError(e.status, e.message); throw e; }
}

async function labsExtract(req, res, cfg) {
  const u = await requireUser(req);
  await requirePro(u, cfg);
  await rateLimit(`labs_${u.uid}`, 30, 24 * 3600e3);
  try { res.json(await labs.extract({ cfg, body: req.body })); }
  catch (e) { if (e instanceof labs.LabError) throw new HttpError(e.status, e.message); throw e; }
}

async function calendarSync(req, res, cfg) {
  const u = await requireUser(req);
  await rateLimit(`cal_${u.uid}`, 120, 3600e3);
  try { res.json(await makeCalendar({ db: db(), tokens: oauth(cfg) }).sync(u.uid, req.body)); }
  catch (e) { if (e instanceof CalError) throw new HttpError(e.status, e.message); throw e; }
}

async function mediaRemove(req, res, cfg) {
  const u = await requireUser(req);
  if (!cfg.media) throw new HttpError(501, 'File storage is not set up on this server.');
  const p = String((req.body || {}).path || '');
  /* only your own files, and only a whole file (its parts and its record) */
  if (p.indexOf(`users/${u.uid}/`) !== 0 || p.includes('..') || p.includes('::')) throw new HttpError(403, 'Not your file.');
  await cfg.media.removePrefix(p + '::');
  res.json({ ok: true });
}

/* ---------- push reminders ---------------------------------------------- */

const pushOf = (cfg) => makePush({ db: db(), messaging: admin.messaging ? admin.messaging() : null, cfg });
async function devicesRoute(req, res, cfg, remove) {
  const u = await requireUser(req);
  await rateLimit(`devices_${u.uid}`, 30, 3600e3);
  try {
    res.json(remove ? await pushOf(cfg).unregister(u.uid, req.body) : await pushOf(cfg).register(u.uid, req.body));
  } catch (e) {
    if (e && e.status) throw new HttpError(e.status, e.message);
    throw e;
  }
}
async function remindersRoute(req, res, cfg) {
  const u = await requireUser(req);
  await rateLimit(`reminders_${u.uid}`, 60, 3600e3);
  res.json(await pushOf(cfg).save(u.uid, req.body));
}

/* ---------- the friends feed (opt-in) -------------------------------------- */

const social = () => makeSocial({ db: db() });
async function socialRoute(req, res, fn) {
  const u = await requireUser(req);
  await rateLimit(`social_${u.uid}`, 300, 3600e3);
  try { res.set('cache-control', 'no-store'); res.json(await fn(social(), u.uid, req.body || {})); }
  catch (e) { if (e instanceof SocialError) throw new HttpError(e.status, e.message); throw e; }
}

/* ---------- billing ------------------------------------------------------ */

async function billingStatus(req, res, cfg) {
  const u = await requireUser(req);
  res.set('cache-control', 'no-store');
  res.json(await billing(cfg).status(u.uid));
}
async function billingWebhook(req, res, cfg) {
  const r = await billing(cfg).webhook(req.headers || {}, req.body || {});
  res.status(r.status).json({ ok: r.ok });
}

/* ---------- router ---------------------------------------------------- */

async function handle(req, res, cfg) {
  res.set('access-control-allow-origin', '*');
  res.set('access-control-allow-headers', 'authorization, content-type');
  res.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  const path = req.path.replace(/\/+$/, '') || '/';
  const seg = path.split('/').filter(Boolean);
  const M = req.method;

  try {
    if (M === 'GET' && path === '/ping') return res.json({ ok: true, service: 'kova-api', has: cfg.has || null });
    if (M === 'POST' && path === '/auth/code') return await authCode(req, res, cfg);
    if (M === 'POST' && path === '/auth/verify') return await authVerify(req, res, cfg);
    if (M === 'POST' && path === '/health/token') return await healthToken(req, res, cfg);
    if (seg[0] === 'health' && seg.length === 2) {
      if (M === 'POST') return await healthPost(req, res, seg[1]);
      if (M === 'GET') return await healthGet(req, res, seg[1]);
    }
    if (M === 'GET' && path === '/status') return await status(req, res, cfg);
    if (M === 'POST' && seg[0] === 'connect' && seg.length === 2) return await connect(req, res, cfg, seg[1]);
    if (M === 'POST' && seg[0] === 'link' && seg.length === 2) return await linkRoute(req, res, cfg, seg[1]);
    if ((M === 'GET' || M === 'POST') && seg[0] === 'targets' && seg.length === 2) return await targetsRoute(req, res, cfg, seg[1]);
    if ((M === 'GET' || M === 'POST') && path === '/ads/setup') return await adsSetup(req, res, cfg);
    if (M === 'GET' && path === '/oauth/callback') return await callback(req, res, cfg);
    if (M === 'POST' && seg[0] === 'disconnect' && seg.length === 2) return await disconnect(req, res, cfg, seg[1]);
    if (M === 'POST' && seg[0] === 'call' && seg.length === 2) return await proxy(req, res, cfg, seg[1]);
    if (M === 'GET' && path === '/inbound') return await inbound(req, res, cfg);
    if (M === 'POST' && path === '/script') return await script(req, res, cfg);
    if (M === 'POST' && path === '/publish') return await publishRoute(req, res, cfg);
    if (M === 'GET' && path === '/posts') return await postsRoute(req, res, '');
    if (M === 'GET' && seg[0] === 'posts' && seg.length === 2) return await postsRoute(req, res, seg[1]);
    if (M === 'POST' && seg[0] === 'posts' && seg.length === 3 && seg[2] === 'cancel') return await cancelRoute(req, res, seg[1]);
    if (M === 'POST' && path === '/write') return await writeRoute(req, res, cfg);
    if (M === 'POST' && path === '/foods/search') return await foodsSearch(req, res, cfg);
    if (M === 'POST' && path === '/crew/step') return await crewStep(req, res, cfg);
    if (M === 'POST' && path === '/hashtags') return await hashtagsRoute(req, res, cfg);
    if (M === 'POST' && path === '/assist') return await assistRoute(req, res, cfg);
    if (M === 'POST' && path === '/assist/email') return await assistEmail(req, res, cfg);
    if (M === 'POST' && path === '/traction/refresh') return await tractionRefresh(req, res, cfg);
    if (M === 'POST' && seg[0] === 'traction' && seg.length === 3 && seg[2] === 'advice') return await tractionAdvice(req, res, cfg, seg[1]);
    if (M === 'POST' && path === '/card/push') return await cardPush(req, res, cfg);
    if (M === 'GET' && path === '/agent') return await agentGet(req, res);
    if (M === 'POST' && path === '/agent/settings') return await agentSettings(req, res);
    if (M === 'POST' && path === '/agent/run') return await agentRun(req, res, cfg);
    if (M === 'POST' && seg[0] === 'agent' && seg[1] === 'alerts' && seg.length === 3) return await agentAlert(req, res, seg[2]);
    if (M === 'POST' && path === '/chat') return await chatRoute(req, res, cfg);
    if (M === 'GET' && path === '/account/export') return await accountExport(req, res, cfg);
    if (M === 'POST' && path === '/account/delete') return await accountDelete(req, res, cfg);
    if (M === 'POST' && path === '/media/upload') return await mediaUpload(req, res, cfg);
    if (M === 'POST' && path === '/media/remove') return await mediaRemove(req, res, cfg);
    if (M === 'POST' && path === '/meal/read') return await mealRead(req, res, cfg);
    if (M === 'POST' && path === '/labs/extract') return await labsExtract(req, res, cfg);
    if (M === 'POST' && path === '/calendar/sync') return await calendarSync(req, res, cfg);
    if (M === 'POST' && path === '/devices') return await devicesRoute(req, res, cfg, false);
    if (M === 'POST' && path === '/devices/remove') return await devicesRoute(req, res, cfg, true);
    if (M === 'POST' && path === '/reminders') return await remindersRoute(req, res, cfg);
    if (M === 'GET' && path === '/billing/status') return await billingStatus(req, res, cfg);
    if (M === 'GET' && path === '/social/me') return await socialRoute(req, res, (S, uid) => S.me(uid));
    if (M === 'GET' && path === '/social/feed') return await socialRoute(req, res, (S, uid) => S.feed(uid));
    if (M === 'POST' && path === '/social/profile') return await socialRoute(req, res, (S, uid, b) => S.setProfile(uid, b));
    if (M === 'POST' && path === '/social/follow') return await socialRoute(req, res, (S, uid, b) => S.follow(uid, b.handle, b.on));
    if (M === 'POST' && path === '/social/followers/remove') return await socialRoute(req, res, (S, uid, b) => S.removeFollower(uid, b.handle));
    if (M === 'POST' && path === '/social/post') return await socialRoute(req, res, (S, uid, b) => S.post(uid, b));
    if (M === 'POST' && path === '/social/unpost') return await socialRoute(req, res, (S, uid, b) => S.unpost(uid, b.id));
    if (M === 'POST' && path === '/social/like') return await socialRoute(req, res, (S, uid, b) => S.like(uid, b.handle, b.id, b.on));
    if (M === 'POST' && path === '/social/comment') return await socialRoute(req, res, (S, uid, b) => S.comment(uid, b.handle, b.id, b.text));
    if (M === 'POST' && path === '/billing/webhook') return await billingWebhook(req, res, cfg);
    return res.status(404).json({ error: 'Not found.' });
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error(path, e);
    return res.status(500).json({ error: 'Server error.' });
  }
}

module.exports = { handle, HttpError, configured, cleanPost, fdcFood, cleanCrew };
