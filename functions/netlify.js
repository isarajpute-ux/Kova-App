/* netlify - runs the same server on Netlify's free plan.

   Firebase Cloud Functions need the paid Blaze plan. Netlify Functions
   do not, so this file runs the exact router in api.js there:

     netlify/functions/api.mjs                -> /api/*  (every route)
     netlify/functions/worker-background.mjs  -> publishing, wellness audits,
                                                 traction reads (up to 15 min)
     netlify/functions/cron.mjs               -> every 5 minutes: scheduled
                                                 posts, reminders, who is due
                                                 an audit, traction

   On Google, database triggers started the long jobs. Netlify has none,
   so the api "kicks" the background worker after it queues a job, and
   the 5-minute timer kicks it again for anything left waiting. The
   worker claims each job in a transaction first, so two runs never
   publish the same post twice.

   The Realtime Database, Auth and push notifications stay on Firebase's
   free Spark plan; only the server and the files moved. */

const crypto = require('crypto');
const envMod = require('./env');
const { makeMedia } = require('./media');
const seal = require('./seal');

const PREFIXES = ['/.netlify/functions/api', '/api'];
const CLAIM_MS = 16 * 60e3;        // a claimed job older than this was abandoned

function internalKey(cfg) {
  return crypto.createHmac('sha256', cfg.mediaSecret || 'kova').update('kova-internal-worker').digest('hex').slice(0, 40);
}

function routePath(url) {
  let p = url.pathname;
  for (const pre of PREFIXES) if (p === pre || p.indexOf(pre + '/') === 0) { p = p.slice(pre.length); break; }
  return p || '/';
}

/* a web Request -> the Express-style request api.js was written against */
async function toReq(request, context, path) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const type = (headers['content-type'] || '').toLowerCase();
  let body = {};
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const buf = Buffer.from(await request.arrayBuffer());
    if (!buf.length) body = {};
    else if (type.includes('application/json')) { try { body = JSON.parse(buf.toString('utf8')); } catch (e) { body = buf.toString('utf8'); } }
    else if (type.includes('application/x-www-form-urlencoded')) body = Object.fromEntries(new URLSearchParams(buf.toString('utf8')));
    else if (type.startsWith('text/')) body = buf.toString('utf8');
    else body = buf;                                    // raw bytes: media parts, Shortcuts payloads
  }
  return {
    method: request.method,
    path,
    url: url.pathname + url.search,
    query: Object.fromEntries(url.searchParams),
    headers,
    body,
    ip: (context && context.ip) || headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || '0.0.0.0',
    get: (h) => headers[String(h).toLowerCase()]
  };
}

/* the Express-style response, collected into a web Response */
function run(handle, req, cfg) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      status(s) { this.statusCode = s; return this; },
      set(k, v) {
        if (k && typeof k === 'object') Object.keys(k).forEach((x) => { this.headers[x.toLowerCase()] = String(k[x]); });
        else this.headers[String(k).toLowerCase()] = String(v);
        return this;
      },
      json(o) {
        if (!this.headers['content-type']) this.headers['content-type'] = 'application/json; charset=utf-8';
        resolve(new Response(JSON.stringify(o), { status: this.statusCode, headers: this.headers }));
      },
      send(t) {
        const noBody = this.statusCode === 204 || this.statusCode === 304;
        resolve(new Response(noBody ? null : (t == null ? '' : t), { status: this.statusCode, headers: this.headers }));
      },
      redirect(a, b) { const code = typeof a === 'number' ? a : 302; this.status(code).set('location', typeof a === 'number' ? b : a).send(''); }
    };
    Promise.resolve(handle(req, res, cfg)).catch(reject);
  });
}

function blobStore(getStore) {
  /* consistency 'strong': a part written by one request is read by the
     next one straight away */
  return getStore({ name: 'kova-media', consistency: 'strong' });
}

function config(deps, origin) {
  const env = deps.env || process.env;
  const cfg = envMod.fromEnv(env);
  if (!cfg.base && origin) cfg.base = origin + '/api';
  if (deps.getStore) cfg.media = makeMedia({ store: blobStore(deps.getStore), secret: cfg.mediaSecret, base: () => cfg.base });
  /* start the background worker; it answers 202 at once */
  const site = (env.URL || origin || '').replace(/\/+$/, '');
  const f = deps.fetch || ((...a) => global.fetch(...a));
  cfg.kick = async (kind) => {
    if (!site) return;
    try {
      await f(`${site}/.netlify/functions/worker-background`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-kova-internal': internalKey(cfg) },
        body: JSON.stringify({ kind })
      });
    } catch (e) { console.error('kick', kind, e.message); }  // the 5-minute timer picks it up
  };
  return cfg;
}

/* ---------------------------------------------------------------- api */

function makeApi(deps) {
  envMod.initAdmin(deps.admin, deps.env);
  const api = deps.api || require('./api');
  return async function (request, context) {
    const url = new URL(request.url);
    const cfg = config(deps, url.origin);
    const path = routePath(url);
    /* files stream straight out, with byte ranges, not through res.send */
    if (request.method === 'GET' && path === '/media/file') {
      if (!cfg.media) return new Response('No file storage here.', { status: 404 });
      const r = await cfg.media.serve(url, request.headers);
      r.headers.set('access-control-allow-origin', '*');
      return r;
    }
    const req = await toReq(request, context, path);
    try {
      return await run(api.handle, req, cfg);
    } catch (e) {
      console.error(path, e);
      return new Response(JSON.stringify({ error: 'Server error.' }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
  };
}

/* -------------------------------------------------------------- worker */

/* take a queued job for this run, or null if another run has it */
async function claim(db, p, t) {
  const r = await db.ref(p).transaction((cur) => {
    if (!cur) return cur;                                  // gone: leave it
    if (cur.claimed && t - cur.claimed < CLAIM_MS) return undefined;   // someone else's
    return Object.assign({}, cur, { claimed: t });
  });
  const v = r && r.snapshot && r.snapshot.val();
  return r && r.committed !== false && v && v.claimed === t ? v : null;
}

function makeWorker(deps) {
  const admin = envMod.initAdmin(deps.admin, deps.env);
  const db = seal.database(admin.database());
  const now = deps.now || Date.now;
  const mods = {
    oauth: deps.makeOAuth || require('./providers').makeOAuth,
    publisher: deps.makePublisher || require('./publish').makePublisher,
    agent: deps.makeAgent || require('./agent').makeAgent,
    traction: deps.makeTraction || require('./traction').makeTraction,
    crew: deps.makeCrew || require('./crew').makeCrew,
    push: deps.makePush || require('./push').makePush
  };

  async function publishAll(cfg) {
    const q = (await db.ref('srv/queue').once('value')).val() || {};
    const tokens = mods.oauth({ db, cfg });
    const pub = mods.publisher({ db, bucket: cfg.media ? cfg.media.bucket : null, cfg, tokens });
    let n = 0;
    for (const uid of Object.keys(q)) {
      for (const pid of Object.keys(q[uid] || {})) {
        const p = `srv/queue/${uid}/${pid}`;
        if (!(await claim(db, p, now()))) continue;
        try { await pub.run(uid, pid); n++; }
        catch (e) { console.error('publish', uid, pid, e.message); }
        finally { await db.ref(p).remove(); }
      }
    }
    return n;
  }
  async function auditAll(cfg) {
    const q = (await db.ref('srv/agentQueue').once('value')).val() || {};
    let n = 0;
    for (const uid of Object.keys(q)) {
      const p = `srv/agentQueue/${uid}`;
      const job = await claim(db, p, now());
      if (!job) continue;
      try { await mods.agent({ db, cfg }).run(uid, { window: job.window }); n++; }
      catch (e) { console.error('audit', uid, e.message); }
      finally { await db.ref(p).remove(); }
    }
    return n;
  }
  /* AI team routines due while Kova is closed (functions/crew.js) */
  async function crewAll(cfg) {
    const q = (await db.ref('srv/crewQueue').once('value')).val() || {};
    const push = mods.push({ db, messaging: admin.messaging ? admin.messaging() : null, cfg });
    const crew = mods.crew({ db, cfg, push });
    let n = 0;
    for (const uid of Object.keys(q)) {
      for (const emp of Object.keys(q[uid] || {})) {
        const p = `srv/crewQueue/${uid}/${emp}`;
        const job = await claim(db, p, now());
        if (!job) continue;
        try { await crew.run(uid, emp, { slotAgo: job.slotAgo }); n++; }
        catch (e) { console.error('crew', uid, emp, e.message); }
        finally { await db.ref(p).remove(); }
      }
    }
    return n;
  }
  async function tractionAll(cfg) {
    const users = Object.keys((await db.ref('srv/posts').once('value')).val() || {});
    const tr = mods.traction({ db, cfg, tokens: mods.oauth({ db, cfg }) });
    for (const uid of users) {
      try { await tr.collect(uid); } catch (e) { console.error('traction', uid, e.message); }
    }
    return users.length;
  }

  return async function (request) {
    const url = new URL(request.url);
    const cfg = config(deps, url.origin);
    if (request.headers.get('x-kova-internal') !== internalKey(cfg)) return new Response('', { status: 403 });
    let kind = 'all';
    try { kind = (await request.json()).kind || 'all'; } catch (e) { /* default */ }
    const out = {};
    if (kind === 'publish' || kind === 'all') out.published = await publishAll(cfg);
    if (kind === 'agent' || kind === 'all') out.audits = await auditAll(cfg);
    if (kind === 'crew' || kind === 'all') out.crew = await crewAll(cfg);
    if (kind === 'traction') out.traction = await tractionAll(cfg);
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

/* ---------------------------------------------------------------- cron */

function makeCron(deps) {
  const admin = envMod.initAdmin(deps.admin, deps.env);
  const db = seal.database(admin.database());
  const now = deps.now || Date.now;
  const moveDue = deps.moveDue || require('./publish').moveDue;
  const due = deps.due || require('./agent').due;
  const crewDue = deps.crewDue || require('./crew').due;
  const makePush = deps.makePush || require('./push').makePush;

  return async function () {
    const t = now();
    const cfg = config(deps, '');
    const out = {};
    /* scheduled posts whose time has come */
    try { out.moved = await moveDue(db, t); } catch (e) { console.error('moveDue', e.message); }
    /* reminders */
    try { out.push = await makePush({ db, messaging: admin.messaging ? admin.messaging() : null, cfg }).tick(); }
    catch (e) { console.error('push', e.message); }
    /* wellness audits due in each person's time zone */
    try {
      const jobs = await due(db, t);
      for (const j of jobs) await db.ref(`srv/agentQueue/${j.uid}`).set({ window: j.window, at: t, why: 'schedule' });
      out.audits = jobs.length;
    } catch (e) { console.error('due', e.message); }
    /* AI team routines whose time has come, for people who turned on
       "Also run when Kova is closed" */
    try {
      const runs = await crewDue(db, t);
      for (const r of runs) await db.ref(`srv/crewQueue/${r.uid}/${r.emp}`).set({ at: t, slotAgo: r.slotAgo, date: r.date });
      out.crew = runs.length;
    } catch (e) { console.error('crewDue', e.message); }
    /* anything waiting goes to the background worker */
    const waiting = (await db.ref('srv/queue').once('value')).val();
    const auditing = (await db.ref('srv/agentQueue').once('value')).val();
    const crewing = (await db.ref('srv/crewQueue').once('value')).val();
    if (waiting || auditing || crewing) await cfg.kick('all');
    /* traction every half hour */
    if (new Date(t).getUTCMinutes() % 30 < 5) await cfg.kick('traction');
    return out;
  };
}

module.exports = { makeApi, makeWorker, makeCron, toReq, run, routePath, claim, internalKey, config };
