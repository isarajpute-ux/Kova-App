/* Vitamins and minerals in the food log (p09).

   The built-in foods carry USDA values, the Micronutrients card counts what
   you actually logged against the NIH daily targets (women / men / adults,
   sodium as a limit), USDA search goes through the server and scales per
   100 g to the grams typed, and the server keeps only the ten nutrients. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
const user = { uid: 'u1', getIdToken: () => Promise.resolve('t') };
w.firebase = {
  initializeApp() {}, apps: [{}],
  auth: () => ({ currentUser: user, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() }),
  database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
    remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
  storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} }),
  functions: () => ({ httpsCallable: () => () => Promise.resolve({ data: { text: '' } }) })
};
const calls = [];
const FOODS = { foods: [{ id: 1, n: 'Spinach, raw', type: 'SR Legacy', kcal: 23, p: 2.9, c: 3.6, f: 0.4, m: { fib: 2.2, na: 79, k: 558, ca: 99, fe: 2.7, mg: 79, c: 28.1, d: 0, b12: 0, fol: 194 } }] };
w.fetch = (u, o) => { calls.push([String(u), o]); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(/foods\/search/.test(u) ? FOODS : {}) }); };
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));


(async () => {
  await wait(900);
  const doc = w.document, F = w.KovaFuel, M = w.KovaMicros;
  ck('KovaMicros is on the page', !!M && typeof M.paint === 'function' && M.N.length === 10);
  ck('the built-in foods carry USDA micronutrients', /name:'Salmon'[^}]*m:\{fib:0,na:104,k:653,ca:26,fe:\.6,mg:51,c:0,d:26,b12:4\.8,fol:58\}/.test(html) || /d:26,b12:4\.8/.test(html));
  ck('the meal photo reader asks for the ten nutrients', /vitamin_d_ug/.test(html) && /folate_ug/.test(html) && /magnesium_mg/.test(html));

  // live data: log two foods with micros and one without
  w.localStorage.setItem('kova.micro.sex', JSON.stringify('f'));
  F.add({ src: 'search', kcal: 208, p: 20, c: 0, f: 13, m: { fib: 0, na: 104, k: 653, ca: 26, fe: 0.6, mg: 51, c: 0, d: 26, b12: 4.8, fol: 58 }, items: [{ n: 'Salmon' }] });
  F.add({ src: 'search', kcal: 105, p: 1, c: 27, f: 0, m: { fib: 3.1, na: 1, k: 422, ca: 6, fe: 0.3, mg: 32, c: 10.3, d: 0, b12: 0, fol: 24 }, items: [{ n: 'Banana' }] });
  F.add({ src: 'manual', kcal: 300, p: 10, c: 30, f: 10, items: [{ n: 'Quick add' }] });
  const T = M.totals();
  ck('today is summed from the log', Math.round(T.t.k) === 1075 && Math.round(T.t.d) === 26 && T.withM === 2 && T.all === 3);
  M.paint();
  const g = doc.getElementById('microGrid'), txt = g ? g.textContent : '';
  ck('the card says how many foods have the data', /2 of 3 foods have vitamin and mineral data/.test(txt));
  ck('one dropdown bar with a dot per nutrient', g && g.querySelectorAll('.kmi-dd').length === 1 && g.querySelectorAll('.kmi-dots i').length === 10);
  ck('the dropdown starts closed and opens to ten compact rows', doc.getElementById('kmiMenu').hidden === true && (g.querySelector('.kmi-dd').click(), doc.getElementById('kmiMenu').hidden === false) && g.querySelectorAll('.kmi-r').length === 10);
  ck('the closed bar says what is met and what is low', /\d+ met \u00b7 \d+ low/.test(g.querySelector('.kmi-dd').textContent));
  ck('women\'s iron target is 18 mg', /Iron0\.9 mgof 18 mg/.test(txt.replace(/\s+/g, '')) || /Iron\s*0\.9 mg\s*of 18 mg/.test(txt));
  ck('vitamin D met is marked met', [...g.querySelectorAll('.kmi-r')].some((c) => /Vitamin D/.test(c.textContent) && c.classList.contains('s-met')));
  ck('sodium reads as a limit', /limit 2,300 mg/.test(txt));
  g.querySelector('[data-sx="m"]').click(); await wait(20);
  ck('switching to men changes iron to 8 mg', /of 8 mg/.test(doc.getElementById('microGrid').textContent));
  ck('the source is named', /Dietary Reference Intakes/.test(doc.getElementById('microGrid').textContent));

  // USDA search through the server
  let box = doc.getElementById('foodResults');
  if (!box) { box = doc.createElement('div'); box.id = 'foodResults'; doc.body.appendChild(box); }
  M.searchUSDA('spinach'); await wait(700);
  const call = calls.find((c) => /\/foods\/search$/.test(c[0]));
  ck('search posts the query to /foods/search', !!call && JSON.parse(call[1].body).q === 'spinach');
  const row = doc.querySelector('#usdaResults .kmi-f');
  ck('a USDA row shows per 100 g', !!row && /Spinach, raw/.test(row.textContent) && /23 kcal/.test(row.textContent));
  row.querySelector('.kmi-g').value = '50'; row.querySelector('.kmi-add').click(); await wait(20);
  const last = F.today().slice(-1)[0];
  ck('adding 50 g halves everything, micros included', last.src === 'usda' && last.kcal === 12 && last.m.fe === 1.4 && last.m.fol === 97 && /50 g/.test(last.items[0].n));
  M.searchUSDA('sp'); ck('under 3 letters clears the list', doc.getElementById('usdaResults').innerHTML === '');

  // server parser
  const { fdcFood } = require('../functions/api.js');
  const x = fdcFood({ fdcId: 9, description: 'Oats', dataType: 'Foundation', foodNutrients: [{ nutrientId: 2047, value: 379 }, { nutrientId: 1003, value: 13.2 }, { nutrientId: 1079, value: 10.1 }, { nutrientId: 1177, value: 32 }, { nutrientId: 1093, value: 6 }, { nutrientId: 1234, value: 5 }] });
  ck('the server reads Atwater energy when 1008 is missing', x.kcal === 379 && x.p === 13.2);
  ck('the server keeps only the ten nutrients', JSON.stringify(Object.keys(x.m).sort()) === JSON.stringify(['fib', 'fol', 'na']));
  ck('a food with no energy is skipped', fdcFood({ description: 'x', foodNutrients: [] }) === null);
  const api = require('fs').readFileSync(__dirname + '/../functions/api.js', 'utf8');
  ck('/foods/search is routed and signed-in only', /path === '\/foods\/search'\) return await foodsSearch/.test(api) && /async function foodsSearch[\s\S]{0,80}requireUser/.test(api));

  let p = 0, f = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? p++ : f++; });
  console.log('\n' + p + '/' + (p + f) + ' passing');
  if (errors.length) { console.log('runtime errors: ' + errors.length); errors.slice(0, 6).forEach((e) => console.log('  ' + e)); }
  process.exit(f || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
