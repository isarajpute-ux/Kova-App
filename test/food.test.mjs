import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromUSDA, fromOFF, searchFoods } from '../server/food.mjs';

test('USDA branded food scales per-100g values to the label serving', () => {
  const r = fromUSDA({
    fdcId: 1, description: 'GREEK YOGURT', brandName: 'FAGE', servingSize: 170, servingSizeUnit: 'g',
    foodNutrients: [
      { nutrientId: 1008, value: 59 }, { nutrientId: 1003, value: 10.3 }, { nutrientId: 1005, value: 3.6 },
      { nutrientId: 1004, value: 0.4 }, { nutrientId: 1093, value: 36 }
    ]
  });
  assert.equal(r.kcal, 100);
  assert.equal(r.p, 17.5);
  assert.equal(r.sodium, 61);
  assert.equal(r.n, 'FAGE · GREEK YOGURT, 170g');
});

test('Open Food Facts product converts sodium g -> mg', () => {
  const r = fromOFF({ code: '3017', product_name: 'Nutella', brands: 'Ferrero', serving_quantity: 15,
    nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, sodium_100g: 0.0428 } });
  assert.equal(r.kcal, 81);
  assert.equal(r.sodium, 6);
});

test('search merges both sources and survives one being down', async () => {
  const fetch = async (url) => String(url).includes('nal.usda.gov')
    ? new Response(JSON.stringify({ foods: [{ fdcId: 2, description: 'Banana, raw', foodNutrients: [{ nutrientId: 1008, value: 89 }] }] }))
    : new Response('down', { status: 503 });
  const items = await searchFoods(fetch, {}, 'banana');
  assert.equal(items.length, 1);
  assert.equal(items[0].kcal, 89);
  assert.deepEqual(await searchFoods(fetch, {}, 'b'), []);
});
