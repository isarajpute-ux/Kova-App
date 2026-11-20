/* photoai - photos read by Kova's AI without spending the owner's credit by
   surprise (p52, the owner: "make sure the app doesn't use my credits when I
   use a picture on the Kova app").

   Every photo Kova's AI reads is paid for with the server's Claude key, so:
     - the owner can switch photo reading off for the whole server
       (KOVA_PHOTO_AI=off), and each person can switch it off in Settings;
     - photos go to the fast, cheaper model (KOVA_PHOTO_MODEL, Claude Haiku
       5.5 by default) instead of the main one, except lab reports, where
       every number has to be right;
     - the same photo with the same question is never paid for twice: the
       answer is kept for 7 days for that person and given again for free;
     - at most KOVA_PHOTO_DAILY photo reads a day per person (40). */
const crypto = require('crypto');

const DAY = 864e5, KEEP = 7 * DAY, MAX_KEEP = 60000;

/* how many photos a request carries (Claude messages, or a single image field) */
function countImages(body) {
  if (!body) return 0;
  let n = body.image ? 1 : 0;
  (Array.isArray(body.messages) ? body.messages : []).forEach((m) => {
    if (m && Array.isArray(m.content)) m.content.forEach((b) => { if (b && b.type === 'image') n++; });
  });
  return n;
}

function keyOf(obj) { return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 40); }

function makePhotoAI({ db, cfg, rateLimit, HttpError, now }) {
  now = now || Date.now;
  const off = () => String(cfg.photoAi || 'on').toLowerCase() === 'off';
  return {
    model: () => cfg.photoModel || cfg.mealModel || cfg.model,
    /* refuses when switched off; nothing is sent to Claude then */
    check(n) { if (n && off()) throw new HttpError(403, 'Reading photos with Kova’s AI is switched off on this server, so no credit is used.'); },
    key: keyOf,
    async cached(uid, key) {
      try {
        const v = (await db.ref(`srv/aicache/${uid}/${key}`).once('value')).val();
        if (v && v.r && now() - (+v.at || 0) < KEEP) return v.r;
      } catch (e) { /* no cache, just ask */ }
      return null;
    },
    async keep(uid, key, r) {
      try { const s = JSON.stringify(r); if (s.length < MAX_KEEP) await db.ref(`srv/aicache/${uid}/${key}`).set({ at: now(), r }); } catch (e) { /* not kept; fine */ }
    },
    /* counts toward today's photo reads (only real, paid reads) */
    async spend(uid, n) { if (n) await rateLimit(`photo_${uid}`, Math.max(1, +cfg.photoDaily || 40), DAY); }
  };
}

module.exports = { makePhotoAI, countImages, keyOf };
