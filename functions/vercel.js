/* vercel - runs the same server on Vercel's free (Hobby) plan.

   The exact router in api.js, the same as on Netlify (netlify.js), with
   three differences:

     api/index.mjs  -> /api/*   every route. vercel.json rewrites
                                /api/anything to /api/index?__p=/anything,
                                so the route comes from __p.
     api/cron.mjs   -> /api/cron  the timer: scheduled posts, reminders,
                                who is due an audit, AI-team routines.
     files          -> Supabase Storage (supa.js) instead of Netlify Blobs.

   Netlify has background functions that run for 15 minutes; Vercel has
   waitUntil, which keeps a function going after it has answered (up to
   300 s on Hobby). So where Netlify "kicks" its worker over HTTP, this
   runs the same jobs (netlify.js makeJobs) inside waitUntil.

   Vercel's own timer runs at most once a day on the free plan. The
   5-minute beat comes from GitHub Actions (.github/workflows/timer.yml)
   calling /api/cron with CRON_SECRET; Vercel's daily run is the backstop
   and carries the same secret. Without CRON_SECRET only Vercel's own
   timer is let in. */

const crypto = require('crypto');
const envMod = require('./env');
const { makeMedia } = require('./media');
const supa = require('./supa');
const net = require('./netlify');

/* the route: /api/index?__p=/meal/read -> /meal/read */
function pathOf(url) {
  const p = url.searchParams.get('__p');
  if (p == null) return net.routePath(url);
  url.searchParams.delete('__p');
  const clean = ('/' + p).replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  return clean || '/';
}

function config(deps, origin) {
  const env = deps.env || process.env;
  const cfg = envMod.fromEnv(env);
  if (!cfg.base && origin) cfg.base = origin + '/api';
  let store = deps.store;
  if (store === undefined) {
    try { store = supa.fromEnv(env, deps.fetch); }
    catch (e) { console.error('supabase', e.message); store = null; }
  }
  if (store) cfg.media = makeMedia({ store, secret: cfg.mediaSecret, base: () => cfg.base });
  return cfg;
}

function lazyJobs(deps) {
  let jobs = null;
  return () => jobs || (jobs = (deps.makeJobs || net.makeJobs)(deps));
}

function json(o, status) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json' } });
}

/* ---------------------------------------------------------------- api */

function makeApi(deps) {
  envMod.initAdmin(deps.admin, deps.env);
  const api = deps.api || require('./api');
  const jobs = lazyJobs(deps);
  return async function (request) {
    const url = new URL(request.url);
    const path = pathOf(url);
    const cfg = config(deps, url.origin);
    /* the slow parts run after the answer has gone */
    cfg.kick = async (kind) => {
      const p = Promise.resolve().then(() => jobs()(cfg, kind)).catch((e) => console.error('jobs', kind, e.message));
      if (deps.waitUntil) deps.waitUntil(p); else await p;
    };
    if (request.method === 'GET' && path === '/media/file') {
      if (!cfg.media) return new Response('No file storage here.', { status: 404 });
      const r = await cfg.media.serve(url, request.headers);
      r.headers.set('access-control-allow-origin', '*');
      return r;
    }
    const ip = request.headers.get('x-real-ip') || String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '0.0.0.0';
    const req = await net.toReq(request, { ip }, path);
    delete req.query.__p;
    req.url = path + (url.search || '');
    try {
      return await net.run(api.handle, req, cfg);
    } catch (e) {
      console.error(path, e);
      return json({ error: 'Server error.' }, 500);
    }
  };
}

/* ---------------------------------------------------------------- cron */

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function makeCron(deps) {
  envMod.initAdmin(deps.admin, deps.env);
  const tick = (deps.makeTick || net.makeTick)(deps);
  const jobs = lazyJobs(deps);
  return async function (request) {
    const env = deps.env || process.env;
    const secret = String(env.CRON_SECRET || '');
    const auth = request.headers.get('authorization') || '';
    const ua = request.headers.get('user-agent') || '';
    const ok = secret ? same(auth, 'Bearer ' + secret) : /^vercel-cron\//.test(ua);
    if (!ok) return json({ error: secret ? 'Wrong or missing timer key.' : 'Set CRON_SECRET to call the timer from outside Vercel.' }, 401);
    const cfg = config(deps, new URL(request.url).origin);
    /* already in the background here: run the jobs before answering */
    cfg.kick = async (kind) => {
      try { return await jobs()(cfg, kind); } catch (e) { console.error('jobs', kind, e.message); return null; }
    };
    const out = await tick(cfg);
    console.log('cron', JSON.stringify(out));
    return json(Object.assign({ ok: true }, out));
  };
}

module.exports = { makeApi, makeCron, pathOf, config };
