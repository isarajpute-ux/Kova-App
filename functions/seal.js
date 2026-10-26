/* seal - connected-account tokens are encrypted at rest.

   The database rules already close srv/ to every client, but a leaked
   database export or a mis-set rule would still have handed out working
   Google, Instagram or TikTok tokens. So every secret value written
   under srv/oauth/ and srv/mastoApps/ is encrypted with AES-256-GCM on
   the way in and decrypted on the way out, by wrapping the database the
   server code uses. Nothing else changes: providers.js, publish.js and
   traction.js read and write plain objects as before.

   Which values: any field named like a secret (access_token,
   refresh_token, token, secret, password, webhook...), at any depth, so
   a Facebook Page's own token inside extra.pages is covered too.

   The key: KOVA_TOKEN_KEY (32 random bytes, base64 or hex) if set;
   otherwise derived from the Firebase private key the server already
   holds. Set KOVA_TOKEN_KEY once and keep it - if the key changes,
   stored tokens cannot be read and people reconnect their accounts.
   Values written before this existed are read as they are and sealed
   the next time they are saved. */

const crypto = require('crypto');

const SEALED = ['srv/oauth', 'srv/mastoApps'];
const SECRET = /^(access_token|refresh_token|token|secret|client_secret|access_secret|oauth_token_secret|password|app_password|webhook|bot_token|accessJwt|refreshJwt)$/i;
const TAG = 'enc:v1:';

let KEY = null;
function keyFrom(env) {
  env = env || process.env;
  const k = env.KOVA_TOKEN_KEY;
  if (k) {
    const b = /^[0-9a-f]{64}$/i.test(k) ? Buffer.from(k, 'hex') : Buffer.from(k, 'base64');
    if (b.length === 32) return b;
    return crypto.createHash('sha256').update(String(k)).digest();
  }
  const base = env.FIREBASE_PRIVATE_KEY || env.FIREBASE_SERVICE_ACCOUNT || '';
  if (!base) return null;                       // no key material: store as before
  return crypto.createHash('sha256').update('kova-token-seal:' + base).digest();
}
function configure(env) { KEY = keyFrom(env); return !!KEY; }

function enc(v) {
  if (!KEY || typeof v !== 'string' || !v || v.startsWith(TAG)) return v;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([c.update(v, 'utf8'), c.final()]);
  return TAG + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}
function dec(v) {
  if (typeof v !== 'string' || !v.startsWith(TAG)) return v;
  if (!KEY) throw new Error('A sealed token needs KOVA_TOKEN_KEY.');
  const b = Buffer.from(v.slice(TAG.length), 'base64url');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

/* walk a value; f is enc or dec; name is the field the value sits in */
function walk(v, f, name) {
  if (Array.isArray(v)) return v.map((x) => walk(x, f, name));
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach((k) => { o[k] = walk(v[k], f, k); });
    return o;
  }
  return name && SECRET.test(name) ? f(v) : v;
}

const norm = (p) => String(p || '').split('/').filter(Boolean).join('/');
const covered = (p) => SEALED.some((s) => p === s || p.indexOf(s + '/') === 0);
const last = (p) => { const a = p.split('/'); return a[a.length - 1]; };

function wrapSnap(snap, p) {
  return Object.assign(Object.create(snap), { val: () => walk(snap.val(), dec, last(p)) });
}

function wrapRef(ref, p) {
  if (!covered(p) && !SEALED.some((s) => s.indexOf(p + '/') === 0 || p === '')) return ref;
  const inside = covered(p);
  const w = Object.create(ref);
  w.child = (c) => wrapRef(ref.child(c), norm(p + '/' + c));
  if (!inside) {
    /* a parent of a sealed path (the root, srv/): children are wrapped, and
       a multi-path update seals the keys that land inside */
    w.update = (o) => {
      const out = {};
      Object.keys(o || {}).forEach((k) => { const full = norm(p + '/' + k); out[k] = covered(full) ? walk(o[k], enc, last(full)) : o[k]; });
      return ref.update(out);
    };
    return w;
  }
  w.set = (v) => ref.set(walk(v, enc, last(p)));
  w.update = (o) => {
    const out = {};
    Object.keys(o || {}).forEach((k) => { out[k] = walk(o[k], enc, last(norm(p + '/' + k))); });
    return ref.update(out);
  };
  w.once = async (...a) => wrapSnap(await ref.once(...a), p);
  w.transaction = async (fn, ...a) => {
    const r = await ref.transaction((cur) => {
      const out = fn(walk(cur, dec, last(p)));
      return out === undefined ? undefined : walk(out, enc, last(p));
    }, ...a);
    return r && r.snapshot ? Object.assign({}, r, { snapshot: wrapSnap(r.snapshot, p) }) : r;
  };
  return w;
}

const cache = new WeakMap();
/* the database, with srv/oauth and srv/mastoApps sealed */
function database(db) {
  if (KEY === null && process.env && !configure(process.env)) return db;
  if (!KEY) return db;
  if (cache.has(db)) return cache.get(db);
  const w = Object.create(db);
  w.ref = (p) => wrapRef(db.ref(p), norm(p));
  cache.set(db, w);
  return w;
}

module.exports = { database, configure, enc, dec, walk, SECRET, SEALED };
