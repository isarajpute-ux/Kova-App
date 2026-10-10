/* Kova on Vercel: functions/vercel.js (the same api.js router, jobs in
   waitUntil, the timer behind CRON_SECRET), functions/supa.js (files in
   Supabase Storage, against a fake of its REST API), vercel.json and the
   GitHub timer. Real Request/Response objects, no network, no keys. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { makeSupaStore, fromEnv } = require('../functions/supa');
const { makeMedia, CH } = require('../functions/media');
const vercel = require('../functions/vercel');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = 'fake-secret-for-tests';
const URL0 = 'https://abcd.supabase.co';

/* ---------- a fake Supabase Storage: the REST calls supa.js makes ---------- */
function fakeSupa(opt) {
  opt = opt || {};
  const objs = new Map(); let bucket = null; const log = [];
  const res = (status, body, type) => new Response(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body),
    { status, headers: { 'content-type': type || 'application/json' } });
  async function f(url, o) {
    o = o || {};
    const u = new URL(url), h = o.headers || {}, m = o.method || 'GET';
    log.push({ m, p: u.pathname, h });
    if (h.apikey !== (opt.key || KEY)) return res(401, { message: 'Invalid API key' });
    if (opt.needBearer && h.authorization !== 'Bearer ' + (opt.key || KEY)) return res(400, { statusCode: '403', error: 'Unauthorized', message: "headers must have required property 'authorization'" });
    const noBucket = () => res(400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    if (u.pathname === '/storage/v1/bucket' && m === 'POST') {
      if (bucket) return res(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      bucket = JSON.parse(o.body); return res(200, { name: bucket.name });
    }
    const lst = u.pathname.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
    if (lst) {
      if (!bucket || bucket.id !== lst[1]) return noBucket();
      const b = JSON.parse(o.body), pre = b.prefix ? b.prefix + '/' : '';
      const seen = new Map();
      for (const k of objs.keys()) {
        if (!k.startsWith(pre)) continue;
        const rest = k.slice(pre.length), cut = rest.indexOf('/');
        if (cut >= 0) seen.set(rest.slice(0, cut), { name: rest.slice(0, cut), id: null });
        else seen.set(rest, { name: rest, id: 'id-' + rest, metadata: { size: objs.get(k).length } });
      }
      const all = [...seen.values()].sort((a, c) => (a.name < c.name ? -1 : 1));
      return res(200, all.slice(b.offset || 0, (b.offset || 0) + (b.limit || 100)));
    }
    const ob = u.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (ob) {
      if (!bucket || bucket.id !== ob[1]) return noBucket();
      const k = ob[2].split('/').map(decodeURIComponent).join('/');
      if (m === 'GET') return objs.has(k) ? res(200, new Uint8Array(objs.get(k)), 'application/octet-stream') : res(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      if (m === 'POST') {
        if (objs.has(k) && h['x-upsert'] !== 'true') return res(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
        const body = typeof o.body === 'string' ? Buffer.from(o.body) : Buffer.from(o.body);
        objs.set(k, body); return res(200, { Key: ob[1] + '/' + k });
      }
      if (m === 'DELETE') { if (!objs.has(k)) return res(400, { statusCode: '404', error: 'not_found', message: 'Object not found' }); objs.delete(k); return res(200, [{ name: k }]); }
    }
    return res(404, { message: 'no route' });
  }
  return { f, objs, log, bucket: () => bucket };
}

(async () => {
  /* ===================== supa.js ===================== */
  {
    const S = fakeSupa();
    const st = makeSupaStore({ url: URL0, key: KEY, fetch: S.f });
    ck('supa: a missing file reads as null, not an error (and no bucket yet is fine)', (await st.get('users/u1/x::meta', { type: 'json' })) === null);
    await st.set('users/u1/form/a.mp4::0', Buffer.from('hello'));
    ck('supa: the first write makes the private bucket "kova-media" by itself', S.bucket() && S.bucket().id === 'kova-media' && S.bucket().public === false);
    ck('supa: bytes go in and come back the same', Buffer.from(await st.get('users/u1/form/a.mp4::0', { type: 'arrayBuffer' })).toString() === 'hello');
    await st.setJSON('users/u1/form/a.mp4::meta', { size: 5 });
    ck('supa: JSON goes in and comes back', (await st.get('users/u1/form/a.mp4::meta', { type: 'json' })).size === 5);
    await st.set('users/u1/form/a.mp4::0', Buffer.from('HELLO'));
    ck('supa: writing the same part again replaces it (x-upsert)', Buffer.from(await st.get('users/u1/form/a.mp4::0', { type: 'arrayBuffer' })).toString() === 'HELLO');
    await st.set('users/u1/body/b.jpg::0', Buffer.from('b'));
    await st.set('users/u2/body/c.jpg::0', Buffer.from('c'));
    const all = (await st.list({ prefix: 'users/u1/' })).blobs.map((b) => b.key).sort();
    ck('supa: list is flat and walks the folders, like Netlify Blobs', all.join() === ['users/u1/body/b.jpg::0', 'users/u1/form/a.mp4::0', 'users/u1/form/a.mp4::meta'].join());
    ck('supa: a prefix inside a file name works too', (await st.list({ prefix: 'users/u1/form/a.mp4' })).blobs.length === 2);
    ck('supa: one person’s list never includes another’s files', !all.some((k) => k.includes('u2')));
    await st.delete('users/u1/body/b.jpg::0');
    await st.delete('users/u1/body/never.jpg::0');
    ck('supa: delete removes a file, and deleting a missing one is not an error', !S.objs.has('users/u1/body/b.jpg::0'));
    ck('supa: the secret key goes on the apikey header only', S.log.every((l) => l.h.apikey === KEY && !l.h.authorization));
    const env = fromEnv({ SUPABASE_URL: URL0, SUPABASE_SECRET_KEY: KEY }, S.f);
    ck('supa: SUPABASE_URL + SUPABASE_SECRET_KEY make a store; without them there is none', !!env && fromEnv({}) === null && fromEnv({ SUPABASE_URL: URL0 }) === null);
    let bad = ''; try { makeSupaStore({ url: 'abcd.supabase.co', key: KEY }); } catch (e) { bad = e.message; }
    ck('supa: a URL without https:// is caught with a plain message', /must look like https:\/\/abcd\.supabase\.co/.test(bad));
  }
  {
    const S = fakeSupa({ needBearer: true });
    const st = makeSupaStore({ url: URL0, key: KEY, fetch: S.f });
    await st.set('k::0', Buffer.from('x'));
    ck('supa: if Storage wants a Bearer token too, it retries once with both and keeps that', st._bearer() === true && S.objs.has('k::0'));
    const L = makeSupaStore({ url: URL0, key: 'eyJhbGciOi.legacy', fetch: fakeSupa({ key: 'eyJhbGciOi.legacy', needBearer: true }).f });
    await L.set('k::0', Buffer.from('x'));
    ck('supa: a legacy service_role key (a JWT) is sent as Bearer from the start', L._bearer() === true);
  }

  /* ===================== media.js on Supabase ===================== */
  {
    const S = fakeSupa();
    const store = makeSupaStore({ url: URL0, key: KEY, fetch: S.f });
    const media = makeMedia({ store, secret: 'sek', base: 'https://kova-app.vercel.app/api' });
    const big = Buffer.alloc(CH, 7), tail = Buffer.from('the end');
    const p1 = await media.putPart('u1', { kind: 'form', id: 'clip1', ext: 'mp4', i: 0, n: 2, type: 'video/mp4' }, big);
    const p2 = await media.putPart('u1', { kind: 'form', id: 'clip1', ext: 'mp4', i: 1, n: 2, type: 'video/mp4' }, tail);
    ck('media on Supabase: a 3 MB part and a last part make one file', p1.ok && p2.path === 'users/u1/form/clip1.mp4' && p2.bytes === CH + 7);
    ck('media on Supabase: links point at the Vercel address', p2.url.startsWith('https://kova-app.vercel.app/api/media/file?p='));
    const r = await media.serve(new URL(p2.url), new Headers({ range: `bytes=${CH - 3}-${CH + 2}` }));
    const got = Buffer.from(await r.arrayBuffer());
    ck('media on Supabase: a byte range across two parts streams back right (206)', r.status === 206 && got.length === 6 && got[0] === 7 && got.slice(3).toString() === 'the' && r.headers.get('content-range') === `bytes ${CH - 3}-${CH + 2}/${CH + 7}`);
    const ph = await media.putPart('u1', { kind: 'body', id: 'pic1', ext: 'jpg', i: 0, n: 1, type: 'image/jpeg' }, Buffer.from('jpeg'));
    const e = +new URL(ph.url).searchParams.get('e');
    ck('media: a progress photo gets a link that expires within the hour, not a forever link', e > Date.now() / 1000 && e <= Date.now() / 1000 + 3601);
    ck('media: list finds the files, removePrefix deletes every part', (await media.list('users/u1/')).length === 2
      && (await media.removePrefix('users/u1/'), [...S.objs.keys()].filter((k) => k.startsWith('users/u1/')).length === 0));
  }

  /* ===================== vercel.js ===================== */
  const fakeAdmin = { apps: [{}], initializeApp() {}, database: () => ({ ref: () => ({}) }) };
  const env = { VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'kova-app.vercel.app', KOVA_MEDIA_SECRET: 'sek', SUPABASE_URL: URL0, SUPABASE_SECRET_KEY: KEY, CRON_SECRET: 'tick-tock' };
  const S = fakeSupa();
  const jobsRan = [];
  const makeJobs = () => async (cfg, kind) => { await wait(40); jobsRan.push(kind); return { kind }; };
  const fakeApi = { handle: async (req, res, cfg) => {
    if (req.path === '/kick') { await cfg.kick('publish'); return res.json({ kicked: true }); }
    if (req.path === '/boom') throw new Error('boom');
    return res.status(200).json({ path: req.path, query: req.query, url: req.url, ip: req.ip, method: req.method, body: req.body, base: cfg.base, media: !!cfg.media });
  } };
  const waited = [];
  const handler = vercel.makeApi({ admin: fakeAdmin, env, api: fakeApi, fetch: S.f, makeJobs, waitUntil: (p) => waited.push(p) });
  const call = async (u, o) => { const r = await handler(new Request(u, o)); return { r, j: await r.clone().json().catch(() => null) }; };

  let { j } = await call('https://kova-app.vercel.app/api/index?__p=/meal/read&x=1', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '1.2.3.4' }, body: '{"a":1}' });
  ck('vercel: /api/meal/read arrives as path /meal/read (vercel.json rewrite, __p)', j.path === '/meal/read' && j.method === 'POST');
  ck('vercel: the rewrite’s __p is not left in the query or the url', j.query.x === '1' && !('__p' in j.query) && j.url === '/meal/read?x=1');
  ck('vercel: the JSON body and the caller’s IP come through', j.body.a === 1 && j.ip === '1.2.3.4');
  ck('vercel: links are built on the production address (VERCEL_PROJECT_PRODUCTION_URL)', j.base === 'https://kova-app.vercel.app/api' && j.media === true);
  ({ j } = await call('https://kova-app.vercel.app/api/index?__p=/health/abc', {}));
  ck('vercel: deeper paths keep their parts', j.path === '/health/abc');
  ({ j } = await call('https://kova-app.vercel.app/api/index?__p=/', {}));
  ck('vercel: /api alone is the root route', j.path === '/');
  ({ j } = await call('https://kova-app.vercel.app/api/ping', {}));
  ck('vercel: without the rewrite the path still comes from the URL', j.path === '/ping');
  ({ j } = await call('https://kova-app.vercel.app/api/index?__p=/media/upload&kind=body', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array([1, 2, 3]) }));
  ck('vercel: raw bytes (a photo part) arrive as bytes', j.body && j.body.type === 'Buffer' && j.body.data.join() === '1,2,3');
  const t0 = Date.now();
  ({ j } = await call('https://kova-app.vercel.app/api/index?__p=/kick', { method: 'POST' }));
  const answered = Date.now() - t0;
  ck('vercel: a route that queues work answers at once; the job runs in waitUntil', j.kicked === true && answered < 35 && waited.length === 1 && jobsRan.length === 0);
  await Promise.all(waited);
  ck('vercel: ...and the job does run after the answer', jobsRan.join() === 'publish');
  let rr = await call('https://kova-app.vercel.app/api/index?__p=/boom', {});
  ck('vercel: a crash in a route is a plain 500, not a hang', rr.r.status === 500 && rr.j.error === 'Server error.');

  /* a real file through the real file route */
  const media = makeMedia({ store: makeSupaStore({ url: URL0, key: KEY, fetch: S.f }), secret: 'sek', base: 'https://kova-app.vercel.app/api' });
  const up = await media.putPart('u9', { kind: 'body', id: 'front1', ext: 'jpg', i: 0, n: 1, type: 'image/jpeg' }, Buffer.from('JPEGDATA'));
  const fr = await handler(new Request(up.url, { headers: { range: 'bytes=0-3' } }));
  ck('vercel: /api/media/file streams a stored photo with Range and CORS', fr.status === 206 && (await fr.text()) === 'JPEG' && fr.headers.get('access-control-allow-origin') === '*');
  const forged = up.url.replace(/s=[^&]+/, 's=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  ck('vercel: a forged link is refused', (await handler(new Request(forged))).status === 403);
  const noStore = vercel.makeApi({ admin: fakeAdmin, env: { VERCEL: '1' }, api: fakeApi });
  ck('vercel: without Supabase settings the file route says there is no storage', (await noStore(new Request('https://x.vercel.app/api/media/file?p=a&e=0&s=b'))).status === 404);

  /* the timer */
  jobsRan.length = 0;
  const ticks = [];
  const makeTick = () => async (cfg) => { ticks.push(cfg.base); await cfg.kick('all'); return { moved: 2 }; };
  const cron = vercel.makeCron({ admin: fakeAdmin, env, makeTick, makeJobs, fetch: S.f });
  const c401 = await cron(new Request('https://kova-app.vercel.app/api/cron'));
  const cBad = await cron(new Request('https://kova-app.vercel.app/api/cron', { headers: { authorization: 'Bearer nope' } }));
  ck('timer: no key or a wrong key is refused', c401.status === 401 && cBad.status === 401 && ticks.length === 0);
  const cOk = await cron(new Request('https://kova-app.vercel.app/api/cron', { headers: { authorization: 'Bearer tick-tock' } }));
  const cj = await cOk.json();
  ck('timer: with CRON_SECRET it runs one tick and the queued jobs before answering', cOk.status === 200 && cj.ok && cj.moved === 2 && jobsRan.join() === 'all');
  const open = vercel.makeCron({ admin: fakeAdmin, env: { VERCEL: '1' }, makeTick, makeJobs });
  ck('timer: with no CRON_SECRET only Vercel’s own daily timer gets in',
    (await open(new Request('https://x.vercel.app/api/cron', { headers: { 'user-agent': 'vercel-cron/1.0' } }))).status === 200
    && (await open(new Request('https://x.vercel.app/api/cron', { headers: { 'user-agent': 'curl/8' } }))).status === 401);

  /* ===================== the files Vercel reads ===================== */
  const vj = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  ck('vercel.json: builds with npm run build and serves dist/', vj.buildCommand === 'npm run build' && vj.outputDirectory === 'dist' && vj.framework === null);
  ck('vercel.json: /api and /api/... go to the one api function with __p, before the app’s catch-all',
    vj.rewrites[0].source === '/api' && vj.rewrites[1].source === '/api/:path*' && vj.rewrites[1].destination === '/api/index?__p=/:path*' && vj.rewrites[vj.rewrites.length - 1].destination === '/index.html');
  ck('vercel.json: /privacy and the other short links open their pages', ['privacy', 'terms', 'refunds', 'cookies', 'licenses'].every((p) => vj.rewrites.some((r) => r.source === '/' + p && r.destination === '/' + p + '.html')));
  const fns = Object.keys(vj.functions);
  ck('vercel.json: every function it configures exists, within the free plan’s 300 s', fns.length === 2 && fns.every((f) => fs.existsSync(path.join(root, f)) && vj.functions[f].maxDuration <= 300));
  const cronExpr = vj.crons[0].schedule.split(' ');
  ck('vercel.json: Vercel’s own timer runs once a day (the free plan refuses more)', vj.crons.length === 1 && vj.crons[0].path === '/api/cron' && /^\d+$/.test(cronExpr[0]) && /^\d+$/.test(cronExpr[1]) && cronExpr.slice(2).join(' ') === '* * *');
  ck('vercel.json: the service worker is never cached, hashed files are cached for good', vj.headers.some((h) => h.source === '/sw.js' && /no-store/.test(h.headers[0].value)) && vj.headers.some((h) => h.source === '/m/(.*)' && /immutable/.test(h.headers[0].value)));
  const idx = fs.readFileSync(path.join(root, 'api/index.mjs'), 'utf8'), cr = fs.readFileSync(path.join(root, 'api/cron.mjs'), 'utf8');
  ck('api/index.mjs and api/cron.mjs run functions/vercel.js, with waitUntil from @vercel/functions', /makeApi\(\{ admin, waitUntil \}\)/.test(idx) && /from '@vercel\/functions'/.test(idx) && /makeCron\(\{ admin \}\)/.test(cr) && /export default \{ fetch/.test(idx + cr));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  ck('package.json has what the functions import (Vercel installs only the root)', pkg.dependencies['@vercel/functions'] && pkg.dependencies['firebase-admin']);
  const m = await import(path.join(root, 'api/index.mjs'));
  ck('api/index.mjs loads and exports a fetch handler', typeof m.default.fetch === 'function');
  const timer = fs.readFileSync(path.join(root, '.github/workflows/timer.yml'), 'utf8');
  ck('GitHub timer: every 5 minutes, sends CRON_SECRET to KOVA_SITE_URL/api/cron, idle until set up', /cron: '\*\/5 \* \* \* \*'/.test(timer) && /Authorization: Bearer \$CRON_SECRET/.test(timer) && /\/api\/cron/.test(timer) && /if: vars\.KOVA_SITE_URL != ''/.test(timer));
  const dep = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
  ck('GitHub Pages publishes only when chosen (KOVA_API_URL set), so a Vercel setup has no failing job', /vars\.KOVA_API_URL != ''/.test(dep));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
