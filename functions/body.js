/* body - a rough body-fat range from a progress photo (POST /body/estimate).

   What the video's dashboard does with "take a picture, AI tells me my
   estimated body fat", done carefully:
     - always a range, never one number, at least 4 points wide, because
       a photo cannot do better than that;
     - with the previous photo of the same pose, one plain sentence on what
       changed, read from the two pictures, not guessed from the weights;
     - no comments on looks, no shame words, nothing for anyone who looks
       under 18 or a photo without a person in it;
     - a range under the essential-fat floor comes back with a note to
       check in with a professional instead of a target to chase.
   The photo is read and dropped: nothing is stored here. The page keeps
   the answer next to the photo. */

const SYSTEM = `You estimate body composition from progress photos for a fitness app.

Look at the person's visible muscle definition, abdominal and oblique outline, vascularity, and fat distribution (waist, hips, chest, arms). Use the profile numbers if given (sex, age, height, weight) as a sanity check, not as the answer.

RULES:
- Give a body-fat RANGE in percent, at least 4 points wide. Photos are rough; say so through the range and the confidence, not with hedging prose.
- "conf" 0-100 is how readable the photo is: lighting, pose, clothing, how much of the body shows. A dim, clothed, cropped photo is about 30; a well-lit full-body photo in fitted clothing is about 75. Never above 85.
- "notes": up to 3 short, neutral observations a coach would make (e.g. "Upper abs outlined in this light", "Most stored fat around the lower back and hips"). No comments on attractiveness. No words like fat-shaming, ugly, gross, skinny-fat.
- If a previous photo is given, "change" is one plain sentence on what visibly changed between the two (e.g. "Waist looks narrower and the obliques are more defined than 21 days ago."). If nothing clearly changed, say that. If no previous photo, "change" is "".
- "tip": one practical line to make the next photo easier to compare (same light, same distance, same time of day), or "".
- If there is no person, the body is not visible, or the person may be under 18, return {"none":true,"why":"<one short reason>"} and nothing else.

Respond with ONLY JSON, no prose, no markdown:
{"lo":14,"hi":18,"conf":62,"notes":["..."],"change":"...","tip":"..."}`;

class BodyError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const B64 = /^[A-Za-z0-9+/=]+$/;
const MAX_ONE = 1.9 * 1024 * 1024;     // base64 characters per photo
const MAX_ALL = 4.0 * 1024 * 1024;     // a Vercel request takes 4.5 MB at most

function img(raw, mime, which) {
  const b64 = String(raw || '').replace(/^data:[^,]*,/, '');
  if (!B64.test(b64) || b64.length < 100) throw new BodyError(400, `Send the ${which} photo as base64 JPEG.`);
  if (b64.length > MAX_ONE) throw new BodyError(413, `The ${which} photo is too large. Kova shrinks it first; try again.`);
  return { b64, mime: /^image\/(jpeg|png|webp)$/.test(mime) ? mime : 'image/jpeg' };
}
const num = (v, lo, hi) => { const n = +v; return isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null; };
const line = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

/* sex m/f; essential fat is about 3 % for men and 12 % for women */
function floorOf(sex) { return sex === 'f' ? 12 : 3; }

function parse(text, sex) {
  const raw = String(text || '').replace(/```json|```/g, '').trim();
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('no json');
  const j = JSON.parse(raw.slice(a, b + 1));
  if (j.none) return { none: true, why: line(j.why, 140) || 'No body to read in that photo.' };
  let lo = num(j.lo, 2, 70), hi = num(j.hi, 2, 75);
  if (lo == null || hi == null) throw new Error('no range');
  if (hi < lo) { const t = lo; lo = hi; hi = t; }
  /* a photo cannot do better than about ±2 points */
  if (hi - lo < 4) { const mid = (lo + hi) / 2; lo = Math.round((mid - 2) * 10) / 10; hi = Math.round((mid + 2) * 10) / 10; }
  const out = {
    lo: Math.max(2, Math.round(lo)), hi: Math.round(hi),
    conf: Math.min(85, Math.max(5, Math.round(+j.conf || 40))),
    notes: (Array.isArray(j.notes) ? j.notes : []).map((x) => line(x, 140)).filter(Boolean).slice(0, 3),
    change: line(j.change, 220),
    tip: line(j.tip, 140)
  };
  if (out.lo <= floorOf(sex) + 1) out.care = 'This is near the lowest level a body can safely hold. If you are trying to go lower, check in with a doctor or dietitian first.';
  return out;
}

async function estimate({ cfg, body, fetch }) {
  fetch = fetch || ((...a) => global.fetch(...a));
  body = body || {};
  if (!cfg.anthropicKey) throw new BodyError(503, 'Photo estimates are not set up on the server yet.');
  const now = img(body.image, body.mime, 'new');
  const prev = body.prev ? img(body.prev, body.prevMime, 'earlier') : null;
  if (now.b64.length + (prev ? prev.b64.length : 0) > MAX_ALL) throw new BodyError(413, 'Those photos are too large together. Try again.');
  const sex = body.sex === 'f' ? 'f' : body.sex === 'm' ? 'm' : '';
  const prof = [
    sex && `sex ${sex === 'f' ? 'female' : 'male'}`,
    num(body.age, 13, 100) && `age ${num(body.age, 13, 100)}`,
    num(body.cm, 120, 230) && `height ${num(body.cm, 120, 230)} cm`,
    num(body.kg, 30, 300) && `weight today ${num(body.kg, 30, 300)} kg`
  ].filter(Boolean).join(', ');
  const days = num(body.days, 0, 3650);
  const prevKg = num(body.prevKg, 30, 300);
  const pose = line(body.pose, 10);
  const content = [];
  if (prev) {
    content.push({ type: 'text', text: `EARLIER photo${days != null ? `, ${Math.round(days)} days ago` : ''}${prevKg ? `, weight then ${prevKg} kg` : ''}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: prev.mime, data: prev.b64 } });
  }
  content.push({ type: 'text', text: `${prev ? 'NEW photo' : 'Photo'}${pose ? ` (${pose} view)` : ''}${prof ? `. Profile: ${prof}.` : '.'}` });
  content.push({ type: 'image', source: { type: 'base64', media_type: now.mime, data: now.b64 } });
  const model = cfg.bodyModel || cfg.model;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 600, temperature: 0, system: SYSTEM, messages: [{ role: 'user', content }] })
  });
  if (!r.ok) {
    console.error('body estimate', r.status, (await r.text().catch(() => '')).slice(0, 300));
    throw new BodyError(503, 'Could not read the photo right now.');
  }
  const j = await r.json();
  const text = (j.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('\n');
  try { return Object.assign(parse(text, sex), { model }); }
  catch (e) { throw new BodyError(502, 'The estimate came back garbled. Try again.'); }
}

module.exports = { estimate, parse, BodyError, SYSTEM };
