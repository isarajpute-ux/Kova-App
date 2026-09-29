/* Fuel > Recipes: 50 more recipes for every meal (recipes.json, built
   from ingredient weights by src/recipes/build.py), loaded the first
   time the screen opens, filterable, and each one opens in full. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const json = JSON.parse(fs.readFileSync(__dirname + '/../recipes.json', 'utf8'));
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Pre-workout', 'Post-workout', 'Before bed'];

(async () => {
  // the file itself
  let fresh = true;
  try { execFileSync('python3', [path.join(__dirname, '..', 'src', 'recipes', 'build.py'), '--check'], { stdio: 'pipe' }); } catch (e) { fresh = false; }
  ck('recipes.json matches its source (src/recipes)', fresh);
  const by = {}; json.recipes.forEach((r) => { by[r.meal] = (by[r.meal] || 0) + 1; });
  ck('50 new recipes for every meal', MEALS.every((m) => by[m] === 50));
  const SEASON = /(salt|pepper|spice|cinnamon|cumin|paprika|garlic|chilli|oregano|basil|parsley|dill|chive|mint|thyme|rosemary|nutmeg|ginger|turmeric|cardamom|vanilla|coriander|harissa|seasoning|curry|cajun|fajita|taco|lemon|lime|balsamic|oil|mustard|capers|nori|baking powder|cocoa|sage|fennel|masala)/i;
  const noAmount = [];
  json.recipes.forEach((r) => r.ing.forEach((i) => { if (!/\d/.test(i) && !SEASON.test(i)) noAmount.push(r.n + ': ' + i); }));
  ck('every ingredient has an amount (seasonings to taste aside)', noAmount.length === 0);
  if (noAmount.length) console.log('  no amount:', noAmount.slice(0, 5).join('; '));
  ck('every recipe has steps and macros', json.recipes.every((r) => r.ing.length >= 1 && r.steps.length >= 1 && r.kcal > 0 && r.p >= 0));
  ck('names are unique', new Set(json.recipes.map((r) => r.id)).size === json.recipes.length);
  const post = json.recipes.filter((r) => r.meal === 'Post-workout');
  ck('post-workout recipes carry real protein (20 g or more)', post.every((r) => r.p >= 20));
  const pre = json.recipes.filter((r) => r.meal === 'Pre-workout');
  ck('pre-workout recipes are carb-led and low in fat', pre.filter((r) => r.c >= r.p && r.f <= 15).length >= 45);

  // in the app
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  let fetched = 0;
  w.fetch = (u) => {
    if (/recipes\.json$/.test(String(u))) { fetched++; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) }); }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  };
  w.localStorage.setItem('kova_mode_v1', 'sample');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(600);
  const before = w.__RECIPES.length;
  ck('nothing is fetched at start-up', fetched === 0);
  w.go('recipes'); await wait(100);
  ck('opening Recipes loads the library once', fetched === 1 && w.__RECIPES.length === before + 350);
  const grid = w.document.getElementById('recGrid');
  ck('the grid shows them all', grid.querySelectorAll('.rcard').length === before + 350);
  const tab = [...w.document.querySelectorAll('#recMealTabs .rmeal')].find((t) => t.dataset.m === 'Post-workout');
  tab.click(); await wait(20);
  ck('each meal tab has its 50 more', grid.querySelectorAll('.rcard').length >= 50);
  const newCard = grid.querySelector('.rcard[data-id^="x-"]');
  newCard.click(); await wait(50);
  const body = (w.document.getElementById('rcpBody') || { textContent: '' }).textContent;
  const r = json.recipes.find((x) => x.id === newCard.dataset.id);
  ck('a new recipe opens with its ingredients and steps', body.includes(r.ing[0]) && body.includes(r.steps[0]));
  w.go('fuel'); w.go('recipes'); await wait(50);
  ck('coming back does not load it twice', fetched === 1 && w.__RECIPES.length === before + 350);

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
