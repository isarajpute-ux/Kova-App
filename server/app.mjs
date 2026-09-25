/* ==========================================================================
   Kova backend router.

   Implements the contract index.html has been calling all along (KovaLink,
   Studio publish, Inbound, the content engine, email sign-in) plus the new
   routes for food search, the assistant, and health ingest.

   Identity is the Firebase ID token in `Authorization: Bearer ...` - the
   same account the app already signs into for cloud sync. Nothing trusts a
   uid the browser merely claims.

   Every dependency (storage, token verification, fetch, Claude) is injected,
   so test/app.test.mjs runs the whole router in memory.
   ========================================================================== */
import { PROVIDERS, isConfigured, authorizeUrl, exchangeCode, refreshToken } from './providers.mjs';
import { seal, open, signState, verifyState, pkcePair, randomToken, sha256, sixDigitCode } from './crypto.mjs';
import { normalizeAny, WEARABLES } from './health.mjs';
import { PUBLISHERS } from './publish.mjs';
import { searchFoods } from './food.mjs';
import * as AI from './ai.mjs';
import { safeKey } from './store.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...extra }
  });
}
function html(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);

function donePage(ok, title, sub) {
  return html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0d;color:#fff;font:15px/1.5 -apple-system,system-ui,sans-serif;text-align:center;padding:24px">
<div><div style="font-size:40px">${ok ? '✓' : '✕'}</div><h1 style="font-size:20px;margin:8px 0">${escHtml(title)}</h1>
<p style="opacity:.7;max-width:320px">${escHtml(sub)}</p></div>
<script>setTimeout(function(){try{window.close()}catch(e){}},${ok ? 1200 : 6000})</script></body>`, ok ? 200 : 400);
}

export function createApp(deps) {
  const { env, store, fetch, verifyIdToken, users, sleep = ms => new Promise(r => setTimeout(r, ms)) } = deps;
  const claude = deps.claude !== undefined ? deps.claude : AI.makeClaude(env);
  const SECRET = env.TOKEN_ENCRYPTION_KEY;

  function origin(req) { return (env.PUBLIC_URL || env.URL || new URL(req.url).origin).replace(/\/+$/, ''); }

  async function authed(req) {
    const h = req.headers.get('authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (!m) throw httpError(401, 'sign in required');
    try { return await verifyIdToken(m[1]); } catch { throw httpError(401, 'invalid or expired session'); }
  }

  function needStore() {
    if (!store) throw httpError(503, 'server storage not configured (FIREBASE_SERVICE_ACCOUNT)');
    if (!SECRET) throw httpError(503, 'TOKEN_ENCRYPTION_KEY is not set');
  }

  async function readBody(req) {
    const t = await req.text();
    if (!t) return {};
    if (t.length > 8_000_000) throw httpError(413, 'body too large');
    try { return JSON.parse(t); } catch { throw httpError(400, 'body must be JSON'); }
  }

  /* ---- token storage ---------------------------------------------------- */
  const linkPath = (uid, p) => `_server/links/${safeKey(uid)}/${p}`;

  async function loadLink(uid, p) {
    const row = await store.get(linkPath(uid, p));
    if (!row || !row.sealed) return null;
    try { return { ...row, token: open(row.sealed, SECRET) }; } catch { return null; }
  }
  async function saveLink(uid, p, token, meta) {
    await store.set(linkPath(uid, p), {
      sealed: seal(token, SECRET), label: meta.label || '', linkedAt: meta.linkedAt || Date.now()
    });
  }
  /* a usable access token, refreshed if it expires within 2 minutes */
  async function accessToken(uid, p) {
    const row = await loadLink(uid, p);
    if (!row) throw httpError(409, p + ' is not linked');
    let t = row.token;
    if (t.exp && t.exp - Date.now() < 120e3) {
      try {
        t = { ...t, ...(await refreshToken(fetch, p, env, t)) };
        await saveLink(uid, p, t, row);
      } catch (e) {
        throw httpError(409, p + ' session expired, reconnect it (' + e.message + ')');
      }
    }
    return t;
  }

  /* ---- AI quota ---------------------------------------------------------- */
  async function spendAI(user) {
    if (!claude) throw httpError(503, 'assistant not configured (ANTHROPIC_API_KEY)');
    if (!store) return;
    const cap = user.anonymous ? Number(env.AI_DAILY_LIMIT_GUEST || 15) : Number(env.AI_DAILY_LIMIT || 60);
    const n = await store.incr(`_server/usage/${safeKey(user.uid)}/${today()}`);
    if (n > cap) throw httpError(429, 'daily assistant limit reached');
  }

  /* ---- routes ------------------------------------------------------------ */
  const routes = [];
  const on = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern + '$'), fn });

  on('GET', '/ping', async () => json({
    ok: true, service: 'kova',
    storage: !!store && !!SECRET, ai: !!claude, mail: !!env.RESEND_API_KEY,
    providers: Object.fromEntries(Object.entries(PROVIDERS).map(([id, P]) =>
      [id, { name: P.name, kind: P.kind, configured: isConfigured(id, env) }]))
  }));

  /* --- linked accounts --- */
  on('GET', '/status', async (req) => {
    const u = await authed(req); needStore();
    const rows = (await store.get(`_server/links/${safeKey(u.uid)}`)) || {};
    const out = {};
    for (const [id, P] of Object.entries(PROVIDERS)) {
      out[id] = { linked: !!(rows[id] && rows[id].sealed), label: (rows[id] && rows[id].label) || '',
        kind: P.kind, name: P.name, configured: isConfigured(id, env) };
    }
    return json(out);
  });

  on('POST', '/connect/([a-z]+)', async (req, [p]) => {
    const u = await authed(req); needStore();
    if (!PROVIDERS[p]) throw httpError(404, 'unknown provider');
    if (!isConfigured(p, env)) throw httpError(501, PROVIDERS[p].name + ' is not set up on the server yet');
    const nonce = randomToken(12);
    const pk = PROVIDERS[p].pkce ? pkcePair() : null;
    if (pk) await store.set(`_server/pkce/${nonce}`, { v: pk.verifier, exp: Date.now() + 600e3 });
    const state = signState({ uid: u.uid, p, n: nonce }, SECRET);
    return json({ url: authorizeUrl(p, env, origin(req), state, pk && pk.challenge) });
  });

  on('GET', '/callback/([a-z]+)', async (req, [p]) => {
    const q = new URL(req.url).searchParams;
    const P = PROVIDERS[p];
    if (!P) return donePage(false, 'Unknown service', 'This link is not for a service Kova knows.');
    if (q.get('error')) return donePage(false, P.name + ' not connected', q.get('error_description') || q.get('error'));
    needStore();
    const st = verifyState(q.get('state'), SECRET);
    if (!st || st.p !== p) return donePage(false, 'Link expired', 'Go back to Kova and tap Connect again.');
    let verifier = null;
    if (P.pkce) {
      const row = await store.get(`_server/pkce/${st.n}`);
      await store.remove(`_server/pkce/${st.n}`);
      if (!row || row.exp < Date.now()) return donePage(false, 'Link expired', 'Go back to Kova and tap Connect again.');
      verifier = row.v;
    }
    try {
      const t = await exchangeCode(fetch, p, env, origin(req), q.get('code'), verifier);
      let prof = { label: P.name, accountId: '' };
      try { prof = await P.profile(fetch, t, env); } catch { /* label is cosmetic */ }
      t.accountId = prof.accountId || t.userId || '';
      await saveLink(st.uid, p, t, { label: prof.label });
      return donePage(true, P.name + ' connected', 'Connected as ' + prof.label + '. You can close this tab and go back to Kova.');
    } catch (e) {
      console.error('callback', p, e.message);
      return donePage(false, P.name + ' not connected', e.message);
    }
  });

  on('POST', '/disconnect/([a-z]+)', async (req, [p]) => {
    const u = await authed(req); needStore();
    await store.remove(linkPath(u.uid, p));
    return json({ ok: true });
  });

  /* Authorised pass-through to the provider's own API. The base URL is fixed
     per provider, so this can only ever reach that provider, with this
     user's own token. */
  on('POST', '/call/([a-z]+)', async (req, [p]) => {
    const u = await authed(req); needStore();
    const P = PROVIDERS[p];
    if (!P) throw httpError(404, 'unknown provider');
    const spec = await readBody(req);
    const path = String(spec.path || '');
    if (path === '/kova/publish') {
      const v = spec.body || {};
      const plat = v.platform === 'x' ? 'x' : v.platform;
      if (!PUBLISHERS[plat]) throw httpError(400, 'cannot publish to ' + plat);
      const token = await accessToken(u.uid, p);
      let out;
      try { out = await PUBLISHERS[plat]({ fetch, token, env, v, sleep }); }
      catch (e) { out = { ok: false, error: 'provider_error', note: e.message }; }
      if (store) await store.set(`_server/publishlog/${safeKey(u.uid)}/${Date.now()}`, { platform: plat, ok: !!out.ok, id: out.id || '', note: out.note || '' });
      return json({ status: out.ok ? 200 : 400, body: JSON.stringify(out) });
    }
    if (!path.startsWith('/') || path.includes('..') || /^\/\//.test(path)) throw httpError(400, 'bad path');
    const token = await accessToken(u.uid, p);
    const method = String(spec.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw httpError(400, 'bad method');
    const r = await fetch(P.apiBase + path, {
      method,
      headers: { Authorization: 'Bearer ' + token.access, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: method === 'GET' || spec.body == null ? undefined : JSON.stringify(spec.body)
    });
    return json({ status: r.status, body: await r.text() });
  });

  /* --- comments across linked accounts, in the shape Inbound renders --- */
  on('GET', '/inbound', async (req) => {
    const u = await authed(req); needStore();
    const items = [];
    const errors = {};
    await Promise.all([
      (async () => {
        const t = await accessToken(u.uid, 'youtube');
        const ch = await (await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',
          { headers: { Authorization: 'Bearer ' + t.access } })).json();
        const cid = ch.items && ch.items[0] && ch.items[0].id;
        if (!cid) return;
        const j = await (await fetch('https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&maxResults=50&order=time&allThreadsRelatedToChannelId=' + cid,
          { headers: { Authorization: 'Bearer ' + t.access } })).json();
        for (const th of j.items || []) {
          const s = th.snippet.topLevelComment.snippet;
          items.push({ id: 'yt_' + th.id, platform: 'youtube', post: th.snippet.videoId || '', author: s.authorDisplayName,
            text: s.textOriginal, at: s.publishedAt, likes: s.likeCount || 0 });
        }
      })().catch(e => { errors.youtube = e.message; }),
      (async () => {
        const t = await accessToken(u.uid, 'instagram');
        const media = await (await fetch('https://graph.instagram.com/v21.0/me/media?fields=id,caption&limit=10&access_token=' + encodeURIComponent(t.access))).json();
        await Promise.all((media.data || []).map(async (m) => {
          const c = await (await fetch(`https://graph.instagram.com/v21.0/${m.id}/comments?fields=id,text,username,timestamp,like_count&access_token=` + encodeURIComponent(t.access))).json();
          for (const x of c.data || []) {
            items.push({ id: 'ig_' + x.id, platform: 'instagram', post: (m.caption || '').slice(0, 60), author: '@' + x.username,
              text: x.text, at: x.timestamp, likes: x.like_count || 0 });
          }
        }));
      })().catch(e => { errors.instagram = e.message; })
    ]);
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return json({ items, errors });
  });

  /* --- AI --- */
  on('POST', '/chat', async (req) => {
    const u = await authed(req); await spendAI(u);
    return json(await AI.chat(claude, await readBody(req)));
  });
  on('POST', '/script', async (req) => {
    const u = await authed(req); await spendAI(u);
    return json(await AI.script(claude, await readBody(req)));
  });
  on('POST', '/ai', async (req) => {
    const u = await authed(req); await spendAI(u);
    return json(await AI.proxy(claude, await readBody(req)));
  });

  /* --- food --- */
  on('GET', '/food/search', async (req) => {
    await authed(req);
    return json({ items: await searchFoods(fetch, env, new URL(req.url).searchParams.get('q')) });
  });

  /* --- email code sign-in -> Firebase custom token --- */
  on('POST', '/auth/code', async (req) => {
    needStore();
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw httpError(503, 'email sign-in not configured (RESEND_API_KEY, MAIL_FROM)');
    const { email } = await readBody(req);
    const e = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 200) throw httpError(400, 'invalid email');
    const key = `_server/codes/${sha256(e)}`;
    const prev = await store.get(key);
    if (prev && prev.sent && Date.now() - prev.sent < 30e3) throw httpError(429, 'wait 30 seconds before asking for another code');
    const code = sixDigitCode();
    await store.set(key, { h: sha256(code + ':' + e), exp: Date.now() + 10 * 60e3, tries: 0, sent: Date.now() });
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM, to: [e], subject: 'Your Kova code: ' + code,
        text: `Your Kova sign-in code is ${code}\n\nIt expires in 10 minutes. If you did not ask for it, ignore this email.`
      })
    });
    if (!r.ok) throw httpError(502, 'could not send the email (HTTP ' + r.status + ')');
    return json({ ok: true });
  });

  on('POST', '/auth/verify', async (req) => {
    needStore();
    const { email, code } = await readBody(req);
    const e = String(email || '').trim().toLowerCase();
    const key = `_server/codes/${sha256(e)}`;
    const row = await store.get(key);
    if (!row || row.exp < Date.now() || row.tries >= 5) {
      await store.remove(key);
      return json({ ok: false, reason: 'expired' });
    }
    if (sha256(String(code || '').trim() + ':' + e) !== row.h) {
      await store.set(key, { ...row, tries: row.tries + 1 });
      return json({ ok: false, reason: 'mismatch' });
    }
    await store.remove(key);
    const acct = await users.findOrCreateByEmail(e);
    return json({ ok: true, name: acct.name || '', token: await users.customToken(acct.uid) });
  });

  /* --- health: webhook ingest from any phone/watch bridge --- */
  on('POST', '/health/key', async (req) => {
    const u = await authed(req); needStore();
    const old = await store.get(`_server/ingestkeys/${safeKey(u.uid)}`);
    if (old) await store.remove(`_server/ingest/${old}`);
    const key = randomToken(24), h = sha256(key);
    await store.set(`_server/ingest/${h}`, { uid: u.uid, created: Date.now() });
    await store.set(`_server/ingestkeys/${safeKey(u.uid)}`, h);
    const o = origin(req);
    return json({ key, ingestUrl: `${o}/api/health/ingest?k=${key}`, relayUrl: `${o}/api/health/latest?k=${key}` });
  });

  async function uidForKey(k) {
    if (!k) throw httpError(401, 'missing key');
    const row = await store.get(`_server/ingest/${sha256(k)}`);
    if (!row) throw httpError(401, 'unknown key');
    return row.uid;
  }

  on('POST', '/health/ingest', async (req) => {
    needStore();
    const uid = await uidForKey(new URL(req.url).searchParams.get('k'));
    const fields = normalizeAny(await readBody(req));
    const n = Object.keys(fields).length;
    if (n) {
      const cur = (await store.get(`_server/health/${safeKey(uid)}`)) || {};
      await store.set(`_server/health/${safeKey(uid)}`, { ...cur, ...fields, _ts: Date.now() });
    }
    return json({ ok: true, fields: n });
  });

  on('GET', '/health/latest', async (req) => {
    needStore();
    const uid = await uidForKey(new URL(req.url).searchParams.get('k'));
    const row = (await store.get(`_server/health/${safeKey(uid)}`)) || {};
    const { _ts, ...fields } = row;
    return json({ ...fields, synced_at: _ts || null });
  });

  /* --- health: pull from linked cloud wearables --- */
  on('GET', '/wearables/sync', async (req) => {
    const u = await authed(req); needStore();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(new URL(req.url).searchParams.get('date') || '')
      ? new URL(req.url).searchParams.get('date') : today();
    const rows = (await store.get(`_server/links/${safeKey(u.uid)}`)) || {};
    const fields = {}, sources = {};
    /* earlier in this list wins a tie: dedicated recovery devices first */
    for (const p of ['whoop', 'oura', 'fitbit', 'withings']) {
      if (!rows[p]) continue;
      try {
        const t = await accessToken(u.uid, p);
        const get = async (path, init = {}) => {
          const r = await fetch(PROVIDERS[p].apiBase + path, { ...init, headers: { Authorization: 'Bearer ' + t.access, ...(init.headers || {}) } });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        };
        const got = await WEARABLES[p](get, date);
        const added = Object.keys(got).filter(k => k !== 'device' && fields[k] === undefined);
        for (const k of added) fields[k] = got[k];
        if (added.length && !fields.device) fields.device = got.device;
        sources[p] = { ok: true, fields: added.length };
      } catch (e) {
        sources[p] = { ok: false, error: e.message };
      }
    }
    return json({ date, fields, sources });
  });

  return async function handle(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/(\.netlify\/functions\/api|api)/, '') || '/';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      try {
        return await r.fn(req, m.slice(1));
      } catch (e) {
        const status = e.status || 500;
        if (status >= 500) console.error(req.method, path, e);
        return json({ error: e.message || 'error' }, status);
      }
    }
    return json({ error: 'not found' }, 404);
  };
}
