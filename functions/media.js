/* media - photos and videos on Netlify Blobs.

   Firebase Storage needs the paid Blaze plan since February 2026, so on
   Netlify the files live in Netlify Blobs instead (part of the free
   plan's credits). Same job as before: form-check videos, food photos,
   machine scans, avatars, and the media a post publishes.

   A Netlify function takes at most 6 MB per request, so the page sends
   a file in 3 MB parts; each part is its own blob and a small record
   says how they fit together. Reading stitches the parts back, including
   byte ranges, which YouTube's resumable upload needs.

   Links are signed: /api/media/file?p=<path>&e=<expiry>&s=<hmac>. e=0 is
   a link that does not expire - the equivalent of a Firebase download
   URL, which is what the page keeps in its media list. Platforms that
   fetch a video by URL (Instagram, Threads) get a 3-hour link. A
   streamed response is capped at 20 MB, so those platforms can pull
   files up to 20 MB this way; YouTube, TikTok and LinkedIn upload from
   the server and have no such cap. */

const crypto = require('crypto');
const { Readable } = require('stream');

const CH = 3 * 1024 * 1024;          // bytes per part
const MAX_PARTS = 40;                // 120 MB per file
const KINDS = ['form', 'food', 'machine', 'avatar', 'doc', 'post', 'lab', 'body'];
/* progress photos never get a link that lasts forever (POST /media/link
   hands out fresh 15-minute ones) */
const SHORT = { body: 3600e3 };

class MediaError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function makeMedia(deps) {
  const { store, secret } = deps;
  const base = () => (typeof deps.base === 'function' ? deps.base() : deps.base || '').replace(/\/+$/, '');
  const now = deps.now || Date.now;
  const part = (path, i) => `${path}::${i}`;
  const metaKey = (path) => `${path}::meta`;

  const sign = (p, e) => crypto.createHmac('sha256', secret).update(`${p}|${e}`).digest('base64url').slice(0, 32);
  function link(p, ttlMs) {
    const e = ttlMs ? Math.floor((now() + ttlMs) / 1000) : 0;
    return `${base()}/media/file?p=${encodeURIComponent(p)}&e=${e}&s=${sign(p, e)}`;
  }
  function verify(p, e, s) {
    if (!p || typeof s !== 'string') return false;
    const want = Buffer.from(sign(p, String(e || 0)));
    const got = Buffer.from(s);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return false;
    return !+e || +e * 1000 > now();
  }

  async function meta(path) {
    const m = await store.get(metaKey(path), { type: 'json' });
    if (!m) throw new MediaError(404, 'No such file.');
    return m;
  }

  /* one part of an upload; the last one writes the record */
  async function putPart(uid, q, body) {
    const kind = String(q.kind || '');
    if (!KINDS.includes(kind)) throw new MediaError(400, 'Unknown kind.');
    const id = String(q.id || '');
    if (!/^[0-9a-z_-]{4,40}$/i.test(id)) throw new MediaError(400, 'Bad upload id.');
    const ext = String(q.ext || '').toLowerCase();
    if (!/^[a-z0-9]{2,5}$/.test(ext)) throw new MediaError(400, 'Bad file type.');
    const i = +q.i, n = +q.n;
    if (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || n > MAX_PARTS || i < 0 || i >= n) throw new MediaError(400, 'Bad part number.');
    const buf = Buffer.isBuffer(body) ? body : (body instanceof Uint8Array ? Buffer.from(body) : null);
    if (!buf || !buf.length) throw new MediaError(400, 'Empty part.');
    if (buf.length > CH) throw new MediaError(413, 'Part too big.');
    if (i < n - 1 && buf.length !== CH) throw new MediaError(400, 'Every part but the last is 3 MB.');
    const path = `users/${uid}/${kind}/${id}.${ext}`;
    await store.set(part(path, i), buf);
    if (i < n - 1) return { ok: true, part: i };
    /* the last part: check they are all there before calling it a file.
       One listing, not a download of every part: fetching 60 MB back to
       check a phone video ran out of time and the upload failed. */
    if (n > 1) {
      const have = new Set(((await store.list({ prefix: part(path, '') })).blobs || []).map((b) => b.key));
      for (let k = 0; k < n - 1; k++) {
        if (!have.has(part(path, k))) throw new MediaError(409, `Part ${k + 1} of ${n} is missing. Send it again.`);
      }
    }
    const size = (n - 1) * CH + buf.length;
    const type = String(q.type || '').slice(0, 80) || 'application/octet-stream';
    await store.setJSON(metaKey(path), { size, type, n, ch: CH, at: now() });
    return { ok: true, path, url: link(path, SHORT[kind] || 0), bytes: size, type };
  }

  /* bytes [start, end] inclusive */
  async function read(path, start, end) {
    const m = await meta(path);
    start = Math.max(0, start || 0);
    end = Math.min(m.size - 1, end == null ? m.size - 1 : end);
    if (end < start) return Buffer.alloc(0);
    const out = [];
    for (let k = Math.floor(start / m.ch); k <= Math.floor(end / m.ch); k++) {
      const ab = await store.get(part(path, k), { type: 'arrayBuffer' });
      if (!ab) throw new MediaError(410, 'Part of that file is missing.');
      const b = Buffer.from(ab);
      const s0 = k * m.ch;
      out.push(b.subarray(Math.max(0, start - s0), Math.min(b.length, end - s0 + 1)));
    }
    return Buffer.concat(out);
  }

  /* a Node stream over a range, part by part, so memory stays at 3 MB */
  function readStream(path, start, end) {
    let m = null, k = 0, last = 0, pos = 0;
    return new Readable({
      async read() {
        try {
          if (!m) {
            m = await meta(path);
            pos = Math.max(0, start || 0);
            last = Math.min(m.size - 1, end == null ? m.size - 1 : end);
            k = Math.floor(pos / m.ch);
          }
          if (pos > last) { this.push(null); return; }
          const s0 = k * m.ch;
          const b = Buffer.from(await store.get(part(path, k), { type: 'arrayBuffer' }));
          const chunk = b.subarray(pos - s0, Math.min(b.length, last - s0 + 1));
          pos += chunk.length; k++;
          this.push(chunk);
        } catch (e) { this.destroy(e); }
      }
    });
  }

  async function list(prefix) {
    const r = await store.list({ prefix });
    const keys = (r && r.blobs ? r.blobs : []).map((b) => b.key).filter((k) => k.endsWith('::meta'));
    const out = [];
    for (const k of keys) {
      const p = k.slice(0, -6);
      const m = await store.get(k, { type: 'json' });
      out.push({ path: p, bytes: m ? m.size : 0, type: m ? m.type : '', url: link(p, 0) });
    }
    return out;
  }

  async function removePrefix(prefix) {
    const r = await store.list({ prefix });
    for (const b of (r && r.blobs) || []) await store.delete(b.key);
  }

  /* the Firebase Storage bucket shape publish.js already uses */
  const bucket = {
    file(path) {
      return {
        getMetadata: async () => { const m = await meta(path); return [{ size: m.size, contentType: m.type }]; },
        download: async () => [await read(path)],
        createReadStream: (o) => readStream(path, o && o.start, o && o.end),
        getSignedUrl: async (o) => [link(path, Math.max(60e3, ((o && o.expires) || now() + 3 * 3600e3) - now()))]
      };
    },
    deleteFiles: async (o) => removePrefix((o && o.prefix) || '')
  };

  /* GET /media/file for a web Request -> Response (streamed, with Range) */
  async function serve(url, headers) {
    const q = url.searchParams;
    const p = q.get('p') || '';
    if (!verify(p, q.get('e') || '0', q.get('s') || '')) return new Response('Link expired or invalid.', { status: 403 });
    let m;
    try { m = await meta(p); } catch (e) { return new Response('Not found.', { status: 404 }); }
    const rng = /^bytes=(\d*)-(\d*)$/.exec((headers.get && headers.get('range')) || '');
    let start = 0, end = m.size - 1, status = 200;
    if (rng) {
      if (rng[1] === '' && rng[2] !== '') { start = Math.max(0, m.size - +rng[2]); }
      else { start = +rng[1] || 0; if (rng[2] !== '') end = Math.min(end, +rng[2]); }
      if (start > end || start >= m.size) return new Response('', { status: 416, headers: { 'content-range': `bytes */${m.size}` } });
      status = 206;
    }
    const h = { 'content-type': m.type, 'content-length': String(end - start + 1), 'accept-ranges': 'bytes',
                'cache-control': +q.get('e') ? 'private, max-age=600' : 'private, max-age=86400' };
    if (status === 206) h['content-range'] = `bytes ${start}-${end}/${m.size}`;
    return new Response(Readable.toWeb(readStream(p, start, end)), { status, headers: h });
  }

  return { putPart, read, readStream, list, removePrefix, bucket, link, verify, serve, meta };
}

module.exports = { makeMedia, MediaError, CH, MAX_PARTS, KINDS };
