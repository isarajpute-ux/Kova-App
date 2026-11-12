/* meal - read a plate from a photo (POST /meal/read).

   Before this, a meal photo was only read when the person had pasted
   their own model key into Settings; everyone else got "nothing read
   it". This runs the same analysis on the server with Kova's key, so the
   two-tap log (camera, then "Log it") works for anyone with Kova Pro.

   The contract is the one the page already used: ordered visual
   reasoning, then a strict JSON array, cooking fat itemised as its own
   row, one integer per field, and a confidence per item that carries the
   doubt instead of shading the weight. */

const SYSTEM = `You are a nutritional analysis engine for image-based food logging.

ANALYSIS ORDER (do this silently, do not write it out):
1. Scene segmentation: identify every distinct food item visible.
2. Context inference: read cooking mediums (glistening = oil or butter) and moisture (sauce, dressing).
3. Reference scaling: use plate size, cutlery or container to estimate physical volume.
4. Density mapping: convert volume to grams using standard cooked-food densities.
5. Cross-reference each ingredient against USDA FoodData Central standard profiles.

RULES:
- One definitive number per field. Never a range.
- Itemise invisible cooking fat: if anything looks grilled, sauteed or pan-fried, add its own row of 5 to 15 g of cooking oil or butter unless the user text says otherwise. Never fold it into another row.
- "c" (confidence 0-100) reflects visual clarity: an intact apple is about 95, a blended soup about 30. Let confidence carry the doubt rather than shading the weight.
- Packaged food: if a Nutrition Facts label is readable, use its per-serving numbers for the amount you see.
- If the photo contains no food, return [].

Respond with ONLY a JSON array, no prose, no markdown, one object per item with these short keys:
n name, g grams, c confidence, kcal, p protein g, cb carbs g, f fat g, fib fiber g, na sodium mg, k potassium mg, ca calcium mg, fe iron mg, mg magnesium mg, vc vitamin C mg, vd vitamin D ug, b12 vitamin B12 ug, fol folate ug, va vitamin A ug RAE, vk vitamin K ug, zn zinc mg, v a few words on the size clue.
Example: [{"n":"Grilled chicken breast","g":140,"c":88,"kcal":231,"p":43,"cb":0,"f":5,"fib":0,"na":90,"k":360,"ca":21,"fe":1.5,"mg":41,"vc":0,"vd":0.1,"b12":0.5,"fol":6,"va":13,"vk":0.4,"zn":1.4,"v":"deck of cards"}]
Micronutrients come from the USDA profile for that weight; 0 when the food has none.`;

const NUM = ['estimated_weight_grams', 'confidence_percentage', 'calories', 'protein_grams', 'carbs_grams', 'fat_grams',
  'fiber_grams', 'sodium_mg', 'potassium_mg', 'calcium_mg', 'iron_mg', 'magnesium_mg', 'vitamin_c_mg', 'vitamin_d_ug', 'vitamin_b12_ug', 'folate_ug', 'vitamin_a_ug', 'vitamin_k_ug', 'zinc_mg'];
/* the model answers in short keys (fewer words to write is most of the
   speed); the page still gets the long names it has always read */
const SHORT = { n: 'ingredient', g: 'estimated_weight_grams', c: 'confidence_percentage', kcal: 'calories', p: 'protein_grams', cb: 'carbs_grams', f: 'fat_grams',
  fib: 'fiber_grams', na: 'sodium_mg', k: 'potassium_mg', ca: 'calcium_mg', fe: 'iron_mg', mg: 'magnesium_mg', vc: 'vitamin_c_mg', vd: 'vitamin_d_ug',
  b12: 'vitamin_b12_ug', fol: 'folate_ug', va: 'vitamin_a_ug', vk: 'vitamin_k_ug', zn: 'zinc_mg', v: 'volume_clue' };
function longKeys(i) {
  if (!i || typeof i !== 'object' || typeof i.ingredient === 'string') return i;
  const o = {};
  Object.keys(i).forEach((k) => { o[SHORT[k] || k] = i[k]; });
  return o;
}

const claude = require('./claude');
/* the fast reader first, then the bigger ones */
const MEAL_FALLBACK = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-sonnet-4-5'];

class MealError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function parseItems(text) {
  let raw = String(text || '').replace(/```json|```/g, '').trim();
  const arr = raw.indexOf('['), obj = raw.indexOf('{');
  let v;
  if (arr >= 0 && (obj < 0 || arr < obj)) v = JSON.parse(raw.slice(arr, raw.lastIndexOf(']') + 1));
  else if (obj >= 0) { const w = JSON.parse(raw.slice(obj, raw.lastIndexOf('}') + 1)); v = w.items || w.ingredients || []; }
  else v = [];
  if (!Array.isArray(v)) v = [];
  return v.map(longKeys).filter((i) => i && typeof i.ingredient === 'string').slice(0, 20).map((i) => {
    const o = { ingredient: i.ingredient.slice(0, 80), volume_clue: String(i.volume_clue || '').slice(0, 120) };
    NUM.forEach((k) => { const n = +i[k]; o[k] = isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0; });
    o.confidence_percentage = Math.min(100, Math.round(o.confidence_percentage));
    return o;
  });
}

/* Speed: the photo arrives already shrunk to about 1024 px (enough for the
   model, a fraction of the upload), the answer uses short keys, and the
   default reader is the fast model (KOVA_MEAL_MODEL, Claude Haiku 5.5), so
   a plate comes back in about two to three seconds. Set KOVA_MEAL_MODEL to
   a bigger model to trade speed for a little accuracy. */
async function readMeal({ cfg, body, fetch }) {
  fetch = fetch || ((...a) => global.fetch(...a));
  body = body || {};
  if (!cfg.anthropicKey) throw new MealError(503, 'Photo reading is not configured on the server yet.');
  const b64 = String(body.image || '').replace(/^data:[^,]*,/, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 100) throw new MealError(400, 'Send the photo as base64 JPEG.');
  if (b64.length > 4.2 * 1024 * 1024) throw new MealError(413, 'That photo is too large. Kova shrinks it first; try again.');
  const mime = /^image\/(jpeg|png|webp)$/.test(body.mime) ? body.mime : 'image/jpeg';
  const note = String(body.note || '').slice(0, 300).trim();
  /* p51b: through claude.ask like the rest of Kova's AI, so a failure names
     its reason (out of credit, key refused, busy) and a model that is gone
     moves on to the next one (the reader asked for Haiku 4.5 by name, with
     no fallback, and every failure read "Could not read the photo") */
  let out;
  try {
    out = await claude.ask(cfg, {
      model: cfg.mealModel || cfg.model, max_tokens: 1400, temperature: 0, system: SYSTEM, output_config: { effort: 'low' },
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
        { type: 'text', text: note ? 'User context, trust this for hidden ingredients: ' + note : 'What food is on this plate?' }
      ] }]
    }, { fetch, tag: 'meal', models: MEAL_FALLBACK });
  } catch (e) {
    const m = new MealError(e.status || 503, e.message || 'Could not read the photo right now.'); m.code = e.code; throw m;
  }
  const j = out.json;
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  try { return { items: parseItems(text), model: out.model }; }
  catch (e) { throw new MealError(502, 'The photo read came back garbled. Try again.'); }
}

module.exports = { readMeal, parseItems, MealError, SYSTEM, MEAL_FALLBACK };
