/* supa - Kova's file store on Supabase Storage (used when Kova runs on
   Vercel, which has no Netlify Blobs).

   It has the same five calls as the Netlify Blobs store media.js was
   written against - get, set, setJSON, list, delete - so media.js does
   not know which one it is talking to. Files stay in 3 MB parts (a
   Vercel function takes at most 4.5 MB per request), each part its own
   object in one private bucket, "kova-media" by default.

   Only the server talks to Supabase, with the project's secret key
   (SUPABASE_SECRET_KEY, "sb_secret_..."), which never reaches the page.
   The bucket is private and has no policies, so the publishable key
   cannot read it either: the only way to a file is a link the server
   signed (media.js). The bucket is created on first use, so there is no
   SQL to paste.

   Supabase wants a secret key on the apikey header only. A legacy
   service_role key (a JWT, "eyJ...") also goes on Authorization: Bearer.
   If Storage turns a request down for want of a Bearer token, the
   request is sent once more with both, and that choice is kept. */

class SupaError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function makeSupaStore(deps) {
  const url = String(deps.url || '').replace(/\/+$/, '');
  const key = String(deps.key || '');
  const bucket = deps.bucket || 'kova-media';
  const f = deps.fetch || ((...a) => global.fetch(...a));
  if (!/^https:\/\/[\w.-]+(:\d+)?$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) throw new SupaError(500, 'SUPABASE_URL must look like https://abcd.supabase.co');
  if (!key) throw new SupaError(500, 'SUPABASE_SECRET_KEY is not set');
  let bearer = /^eyJ/.test(key);
  let made = false;

  const enc = (k) => String(k).split('/').map(encodeURIComponent).join('/');
  const obj = (k) => `${url}/storage/v1/object/${bucket}/${enc(k)}`;

  function headers(extra) {
    const h = Object.assign({ apikey: key }, extra || {});
    if (bearer) h.authorization = `Bearer ${key}`;
    return h;
  }
  async function errText(r) {
    try { return (await r.text()).slice(0, 300); } catch (e) { return ''; }
  }
  /* Storage answers a missing object with 404, or with 400 and
     {"statusCode":"404"} on older versions */
  function missingObject(status, txt) {
    return status === 404 || (status === 400 && /"statusCode"\s*:\s*"?404|not.?found/i.test(txt) && !/bucket/i.test(txt));
  }
  function missingBucket(txt) { return /bucket not found/i.test(txt); }
  function wantsJwt(status, txt) { return (status === 400 || status === 401 || status === 403) && /jwt|bearer|authorization|invalid compact jws|headers must have/i.test(txt); }

  async function call(method, u, opts, retried) {
    opts = opts || {};
    const r = await f(u, { method, headers: headers(opts.headers), body: opts.body });
    if (r.ok) return r;
    const txt = await errText(r);
    if (!retried && !bearer && wantsJwt(r.status, txt)) { bearer = true; return call(method, u, opts, true); }
    const e = new SupaError(r.status, `Supabase Storage ${method} ${r.status}: ${txt}`);
    e.body = txt;
    throw e;
  }

  async function ensureBucket() {
    if (made) return;
    try {
      await call('POST', `${url}/storage/v1/bucket`, {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: bucket, name: bucket, public: false })
      });
    } catch (e) {
      if (!/already exists|duplicate|409/i.test(e.body || '') && e.status !== 409) throw e;
    }
    made = true;
  }
  /* run fn; if the bucket is not there yet, make it and run fn again */
  async function withBucket(fn) {
    try { return await fn(); }
    catch (e) {
      if (!missingBucket(e.body || '')) throw e;
      await ensureBucket();
      return fn();
    }
  }

  async function get(k, o) {
    const type = (o && o.type) || 'text';
    let r;
    try { r = await call('GET', obj(k)); }
    catch (e) {
      if (missingObject(e.status, e.body || '') || missingBucket(e.body || '')) return null;
      throw e;
    }
    if (type === 'json') { try { return JSON.parse(await r.text()); } catch (e) { return null; } }
    if (type === 'arrayBuffer') return r.arrayBuffer();
    return r.text();
  }
  async function put(k, body, type) {
    return withBucket(() => call('POST', obj(k), {
      headers: { 'content-type': type, 'x-upsert': 'true', 'cache-control': 'no-store' },
      body
    }));
  }
  const set = (k, v) => put(k, Buffer.isBuffer(v) || v instanceof Uint8Array ? v : Buffer.from(String(v)), 'application/octet-stream');
  const setJSON = (k, v) => put(k, JSON.stringify(v), 'application/json');

  /* Netlify's list is flat: every key under the prefix. Supabase lists
     one folder at a time, so walk the folders. */
  async function listDir(dir) {
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      let page;
      try {
        const r = await call('POST', `${url}/storage/v1/object/list/${bucket}`, {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prefix: dir, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
        });
        page = await r.json();
      } catch (e) {
        if (missingBucket(e.body || '')) return out;
        throw e;
      }
      if (!Array.isArray(page)) break;
      out.push(...page);
      if (page.length < 1000) break;
    }
    return out;
  }
  async function list(o) {
    const prefix = String((o && o.prefix) || '');
    const cut = prefix.lastIndexOf('/');
    const start = cut >= 0 ? prefix.slice(0, cut) : '';
    const blobs = [];
    async function walk(dir, depth) {
      if (depth > 12) return;
      for (const it of await listDir(dir)) {
        const full = dir ? `${dir}/${it.name}` : it.name;
        /* a folder has no id; only walk the ones the prefix can be under */
        if (it.id == null) { if ((full + '/').startsWith(prefix) || prefix.startsWith(full + '/')) await walk(full, depth + 1); }
        else if (full.startsWith(prefix)) blobs.push({ key: full });
      }
    }
    await walk(start, 0);
    return { blobs };
  }
  async function del(k) {
    try { await call('DELETE', obj(k)); }
    catch (e) { if (!missingObject(e.status, e.body || '') && !missingBucket(e.body || '')) throw e; }
  }

  return { get, set, setJSON, list, delete: del, bucket, _bearer: () => bearer };
}

/* the store, or null when this server has no Supabase settings */
function fromEnv(env, fetch) {
  env = env || process.env;
  const url = env.SUPABASE_URL, key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return makeSupaStore({ url, key, bucket: env.SUPABASE_BUCKET || 'kova-media', fetch });
}

module.exports = { makeSupaStore, fromEnv, SupaError };
