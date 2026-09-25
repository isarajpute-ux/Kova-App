/* Small crypto helpers. Node's built-in crypto only - nothing here needs a
   dependency, and every extra package on the token path is attack surface. */
import crypto from 'node:crypto';

/* Any string works as the secret; it is stretched to a 32-byte key so a
   user pasting "hunter2" into Netlify still gets AES-256, just a weak one. */
export function keyFrom(secret) {
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/* AES-256-GCM. Output is iv.tag.ciphertext, base64url. OAuth tokens are
   stored encrypted so a leaked database export is not a leaked set of
   everyone's LinkedIn/YouTube/Fitbit logins. */
export function seal(obj, secret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map(b => b.toString('base64url')).join('.');
}

export function open(sealed, secret) {
  const [iv, tag, ct] = String(sealed).split('.').map(s => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', keyFrom(secret), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
}

/* Signed, expiring blob for the OAuth `state` parameter. It carries the uid
   through the provider's redirect, so the callback knows whose account was
   linked without trusting anything the browser sends back. */
export function signState(payload, secret, ttlMs = 10 * 60e3) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url');
  const mac = crypto.createHmac('sha256', keyFrom(secret)).update(body).digest('base64url');
  return body + '.' + mac;
}

export function verifyState(state, secret) {
  const [body, mac] = String(state || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', keyFrom(secret)).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!p || typeof p.exp !== 'number' || p.exp < Date.now()) return null;
  return p;
}

export function pkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function randomToken(bytes = 24) { return crypto.randomBytes(bytes).toString('base64url'); }

export function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

export function sixDigitCode() { return String(crypto.randomInt(0, 1e6)).padStart(6, '0'); }
