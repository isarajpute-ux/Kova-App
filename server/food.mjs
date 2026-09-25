/* ==========================================================================
   Food search. The in-app list had eight foods in it; this puts USDA
   FoodData Central (generic + ~400k branded US foods) and Open Food Facts
   (international packaged foods) behind the same search box.

   Output rows use the app's own shape - {n, kcal, p, c, f} - plus fiber,
   sugar and sodium, so the logger can use them unchanged.
   ========================================================================== */

const NUTR = { kcal: [1008, 2047, 2048], p: [1003], c: [1005], f: [1004], fiber: [1079], sugar: [2000, 1063], sodium: [1093] };

function pick(nutrients, ids) {
  for (const id of ids) {
    const n = nutrients.find(x => x.nutrientId === id);
    if (n && typeof n.value === 'number') return n.value;
  }
  return null;
}
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);

export function fromUSDA(food) {
  const N = food.foodNutrients || [];
  const per100 = {};
  for (const k of Object.keys(NUTR)) per100[k] = pick(N, NUTR[k]);
  if (per100.kcal == null) return null;
  /* search results report per 100 g; scale to the label serving when it is in grams */
  const g = (food.servingSizeUnit || '').toLowerCase() === 'g' && food.servingSize ? food.servingSize : 100;
  const s = g / 100;
  const name = [food.brandName || food.brandOwner, food.description].filter(Boolean).join(' · ');
  return {
    n: (name + ', ' + Math.round(g) + 'g').slice(0, 90),
    kcal: Math.round(per100.kcal * s), p: r1(per100.p * s), c: r1(per100.c * s), f: r1(per100.f * s),
    fiber: r1(per100.fiber != null ? per100.fiber * s : null), sugar: r1(per100.sugar != null ? per100.sugar * s : null),
    sodium: per100.sodium != null ? Math.round(per100.sodium * s) : null,
    grams: Math.round(g), src: 'USDA', id: 'fdc:' + food.fdcId
  };
}

export function fromOFF(p) {
  const n = p.nutriments || {};
  const kcal100 = n['energy-kcal_100g'];
  if (typeof kcal100 !== 'number' || !p.product_name) return null;
  const g = Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : 100;
  const s = g / 100;
  const v = k => (typeof n[k] === 'number' ? n[k] * s : null);
  return {
    n: ([p.brands && p.brands.split(',')[0], p.product_name].filter(Boolean).join(' · ') + ', ' + Math.round(g) + 'g').slice(0, 90),
    kcal: Math.round(kcal100 * s), p: r1(v('proteins_100g')), c: r1(v('carbohydrates_100g')), f: r1(v('fat_100g')),
    fiber: r1(v('fiber_100g')), sugar: r1(v('sugars_100g')),
    sodium: v('sodium_100g') != null ? Math.round(v('sodium_100g') * 1000) : null,
    grams: Math.round(g), src: 'Open Food Facts', id: 'off:' + (p.code || '')
  };
}

async function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })])
    .finally(() => clearTimeout(t));
}

export async function searchFoods(fetch, env, q) {
  q = String(q || '').trim().slice(0, 80);
  if (q.length < 2) return [];
  const usda = withTimeout(fetch('https://api.nal.usda.gov/fdc/v1/foods/search?' + new URLSearchParams({
    api_key: env.USDA_API_KEY || 'DEMO_KEY', query: q, pageSize: '20',
    dataType: 'Foundation,SR Legacy,Survey (FNDDS),Branded'
  })).then(r => (r.ok ? r.json() : { foods: [] })), 6000)
    .then(j => (j.foods || []).map(fromUSDA).filter(Boolean)).catch(() => []);
  const off = withTimeout(fetch('https://world.openfoodfacts.org/cgi/search.pl?' + new URLSearchParams({
    search_terms: q, search_simple: '1', action: 'process', json: '1', page_size: '10',
    fields: 'code,product_name,brands,nutriments,serving_quantity'
  }), { headers: { 'User-Agent': 'Kova/1.0 (health app food search)' } })
    .then(r => (r.ok ? r.json() : { products: [] })), 6000)
    .then(j => (j.products || []).map(fromOFF).filter(Boolean)).catch(() => []);
  const [a, b] = await Promise.all([usda, off]);
  const seen = new Set();
  return [...a, ...b].filter(x => {
    const k = x.n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 25);
}
