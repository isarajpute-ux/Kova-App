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

ANALYSIS ORDER:
1. Scene segmentation: identify every distinct food item visible.
2. Context inference: read cooking mediums (glistening = oil or butter) and moisture (sauce, dressing).
3. Reference scaling: use plate size, cutlery or container to estimate physical volume in cubic cm.
4. Density mapping: convert volume to grams using standard cooked-food densities.
5. Cross-reference each ingredient against USDA FoodData Central standard profiles.

RULES:
- Give one definitive integer per field. Never a range.
- Itemise invisible cooking fat: if anything looks grilled, sauteed or pan-fried, add its own row of 5 to 15 g of cooking oil or butter unless the user text says otherwise. Never fold it into another row.
- confidence_percentage reflects visual clarity: an intact apple is about 95, a blended soup about 30.
- Portion estimation is the weakest step, so let confidence carry that doubt rather than shading the weight.
- If the photo contains no food, return [].

Respond with ONLY a valid JSON array, no prose and no markdown fences:
[{"ingredient":"Grilled Chicken Breast","estimated_weight_grams":140,"volume_clue":"deck of cards, roughly 120 cubic cm","confidence_percentage":88,"calories":231,"protein_grams":43,"carbs_grams":0,"fat_grams":5,"fiber_grams":0,"sodium_mg":90,"potassium_mg":360,"calcium_mg":21,"iron_mg":1.5,"magnesium_mg":41,"vitamin_c_mg":0,"vitamin_d_ug":0.1,"vitamin_b12_ug":0.5,"folate_ug":6}]
Estimate the micronutrient fields from USDA profiles for the same weight; use 0 when a food has none.`;

const NUM = ['estimated_weight_grams', 'confidence_percentage', 'calories', 'protein_grams', 'carbs_grams', 'fat_grams',
  'fiber_grams', 'sodium_mg', 'potassium_mg', 'calcium_mg', 'iron_mg', 'magnesium_mg', 'vitamin_c_mg', 'vitamin_d_ug', 'vitamin_b12_ug', 'folate_ug'];

class MealError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function parseItems(text) {
  let raw = String(text || '').replace(/```json|```/g, '').trim();
  const arr = raw.indexOf('['), obj = raw.indexOf('{');
  let v;
  if (arr >= 0 && (obj < 0 || arr < obj)) v = JSON.parse(raw.slice(arr, raw.lastIndexOf(']') + 1));
  else if (obj >= 0) { const w = JSON.parse(raw.slice(obj, raw.lastIndexOf('}') + 1)); v = w.items || w.ingredients || []; }
  else v = [];
  if (!Array.isArray(v)) v = [];
  return v.filter((i) => i && typeof i.ingredient === 'string').slice(0, 20).map((i) => {
    const o = { ingredient: i.ingredient.slice(0, 80), volume_clue: String(i.volume_clue || '').slice(0, 120) };
    NUM.forEach((k) => { const n = +i[k]; o[k] = isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0; });
    o.confidence_percentage = Math.min(100, Math.round(o.confidence_percentage));
    return o;
  });
}

async function readMeal({ cfg, body, fetch }) {
  fetch = fetch || ((...a) => global.fetch(...a));
  body = body || {};
  if (!cfg.anthropicKey) throw new MealError(503, 'Photo reading is not configured on the server yet.');
  const b64 = String(body.image || '').replace(/^data:[^,]*,/, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 100) throw new MealError(400, 'Send the photo as base64 JPEG.');
  if (b64.length > 4.2 * 1024 * 1024) throw new MealError(413, 'That photo is too large. Kova shrinks it first; try again.');
  const mime = /^image\/(jpeg|png|webp)$/.test(body.mime) ? body.mime : 'image/jpeg';
  const note = String(body.note || '').slice(0, 300).trim();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: cfg.model, max_tokens: 1600, temperature: 0, system: SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
        { type: 'text', text: note ? 'User context, trust this for hidden ingredients: ' + note : 'What food is on this plate?' }
      ] }]
    })
  });
  if (!r.ok) {
    console.error('meal read', r.status, (await r.text().catch(() => '')).slice(0, 300));
    throw new MealError(503, 'Could not read the photo right now.');
  }
  const j = await r.json();
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  try { return { items: parseItems(text) }; }
  catch (e) { throw new MealError(502, 'The photo read came back garbled. Try again.'); }
}

module.exports = { readMeal, parseItems, MealError, SYSTEM };
