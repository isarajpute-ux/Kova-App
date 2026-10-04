/* The scanner's body-effects read (src/p08_impact.js): by body area,
   every reason with its evidence and source, tied to today (caffeine and
   bedtime, salt so far, protein after training, pregnancy), "next time"
   tips, and no claim the evidence does not support. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(800);
  const I = w.KovaImpact, S = w.KovaScanner, d = w.document;
  const P = (o) => S.shape(Object.assign({ code: '1', product_name: 'Test', nutriments: {}, additives_tags: [], categories_tags: [], labels_tags: [], ingredients_text: '' }, o));
  const ctx = (o) => Object.assign({ now: new Date(2026, 9, 4, 20, 0), bed: 23 * 60, phase: '', preg: false, naToday: null, trained: false, lowHRV: false }, o);

  // an energy drink at 8 pm
  const cola = P({ product_name: 'Energy drink', categories_tags: ['en:beverages', 'en:energy-drinks'], nova_group: 4, ingredients_text: 'carbonated water, sugar, caffeine, taurine',
    nutriments: { 'sugars_100g': 11.5, 'caffeine_100g': 0.032, 'energy-kcal_100g': 46, 'sugars_serving': 28.75, 'energy-kcal_serving': 115 } });
  let r = I.analyze(cola, ctx());
  ck('a drink is judged per 100 ml: 11.5 g sugar is high for a drink', r.drink && r.areas.sugar.verdict === 'bad' && r.items.some((o) => o.t === 'High in sugar' && /5[78]% of the WHO daily limit/.test(o.d)));
  ck('caffeine is read in mg (32 mg per 100 ml) and filed under Sleep', r.items.some((o) => /Caffeine \(32 mg per 100 ml\)/.test(o.t)) && !!r.areas.sleep);
  ck('at 8 pm with an 11 pm bedtime, it says how much will still be working', r.personal.some((p) => p.area === 'Sleep' && /3 h 0 m away, so about 66%/.test(p.t)));
  ck('every reason names its evidence and source', r.items.every((o) => ['strong', 'some', 'early', 'rule'].includes(o.ev) && o.src));
  ck('ultra-processed cites the controlled trial', r.items.some((o) => o.t === 'Ultra-processed' && /Hall 2019/.test(o.src)));
  ck('next time: what to look for on the label', r.next.some((x) => /2\.5 g sugar per 100 ml/.test(x)) && r.next.some((x) => /decaf/.test(x)));

  // cured meat
  const ham = P({ categories_tags: ['en:meats', 'en:hams'], additives_tags: ['en:e250'], nutriments: { 'salt_100g': 2.2, 'saturated-fat_100g': 2, 'proteins_100g': 20, 'energy-kcal_100g': 110, 'sodium_serving': 0.44 } });
  r = I.analyze(ham, ctx({ naToday: 1700 }));
  ck('processed meat with nitrite: a known cause of bowel cancer, strong evidence', r.items.some((o) => /IARC group 1/.test(o.d) && o.ev === 'strong'));
  ck('high salt, and today’s sodium against the WHO limit', r.areas.heart.verdict !== 'good' && r.personal.some((p) => /440 mg sodium: 2,140 of the WHO/.test(p.t)));
  ck('and high protein is still credited', r.items.some((o) => o.t === 'High in protein'));

  // sugar-free sweets
  const gum = P({ additives_tags: ['en:e420', 'en:e965'], nutriments: { 'sugars_100g': 0.5 } });
  r = I.analyze(gum, ctx());
  ck('sugar alcohols: bloating, with the EU warning rule', r.areas.gut.verdict !== 'good' && r.items.some((o) => /polyols/.test(o.t) && /10%/.test(o.d)));

  // beer when pregnant, after training, HRV low
  const beer = P({ categories_tags: ['en:beverages', 'en:alcoholic-beverages', 'en:beers'], nutriments: { 'alcohol_100g': 5 } });
  r = I.analyze(beer, ctx({ preg: true, trained: true, lowHRV: true }));
  ck('alcohol: sleep, recovery and pregnancy, tied to a low HRV, today’s training and the pregnancy', !!r.areas.sleep && !!r.areas.horm && r.personal.some((p) => p.area === 'Vitals') && r.personal.some((p) => p.area === 'Workout') && r.personal.some((p) => p.area === 'Pregnancy'));

  // fertility and cycle
  const cereal = P({ ingredients_text: 'oats, folic acid, iron', nutriments: { 'iron_100g': 0.008, 'fiber_100g': 7, 'proteins_100g': 10, 'energy-kcal_100g': 380 } });
  r = I.analyze(cereal, ctx({ phase: 'menstrual' }));
  ck('iron (8 mg) and folic acid are good for the cycle and pregnancy; on a period it says why', r.items.some((o) => o.t === 'Iron-rich') && r.items.some((o) => /Folate/.test(o.t)) && r.personal.some((p) => p.area === 'Cycle'));
  ck('high fibre is good for digestion and blood sugar', r.items.some((o) => o.t === 'High in fibre' && o.a.includes('gut') && o.a.includes('sugar')));
  const soy = P({ ingredients_text: 'soya beans, water' });
  ck('soy: says plainly there is no good evidence of harm at normal amounts', I.analyze(soy, ctx()).items.some((o) => o.t === 'Soy' && o.v === 0 && /do not lower testosterone/.test(o.d)));

  // the scanner shows it
  w.go('scanner'); await wait(50);
  S.show({ code: '1', product_name: 'Energy drink', categories_tags: ['en:beverages', 'en:energy-drinks'], nova_group: 4, additives_tags: ['en:e951'], ingredients_text: 'carbonated water, caffeine', nutriments: { 'sugars_100g': 11.5, 'caffeine_100g': 0.032 } });
  await wait(30);
  const grid = d.getElementById('scnImpactGrid');
  ck('the scanner shows body areas with a verdict, each opening to its reasons', grid.querySelectorAll('details.kim-a').length >= 3 && !!grid.querySelector('.kim-a li small i'));
  ck('"For you, today" replaces goal alignment', /FOR YOU, TODAY/.test(d.getElementById('scnGoalCard').textContent) && !!d.querySelector('#scnGoalBody .kim-p'));
  ck('no "hormone disruption" bar from sugar any more', !/Hormone disruption/.test(grid.textContent));
  ck('aspartame is described as IARC 2B, limited evidence, not as a danger', /2B/.test(grid.textContent) && /limited evidence/.test(grid.textContent));
  ck('no page errors', errors.length === 0 || (console.error(errors.slice(0, 5)), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
