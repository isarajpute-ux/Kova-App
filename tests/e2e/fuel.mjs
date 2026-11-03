/* p51, the owner: "I'm going to start using the fuel metric on my account...
   make everything work, fuel doesn't have to be connected to the watch".
   A new account in live mode, no watch, signed out, in a real browser:
     - Water and Streak are real (they were sample numbers, hidden);
     - Quick add logs any food (calories added up from the macros when
       left empty), saves it to My foods; Recent, Favorites and My foods
       work; typing finds your own foods first;
     - search says why USDA is out of reach and searches Open Food Facts;
     - the barcode page: type the numbers, or the camera reads them (on
       WebKit, the iPhone engine, through the zxing reader), and the
       product logs to Fuel from the Scanner;
     - Energy balance waits for the burn questions instead of guessing.
     npm run build && node tests/e2e/fuel.mjs        (ENGINE=webkit too) */
import { chromium, webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const ENG = process.env.ENGINE === 'webkit' ? webkit : chromium;
const b = await ENG.launch(); const site = await serve(join(root, 'dist'));
const seen = { home: 1, move: 1, session: 1, fuel: 1, work: 1, recipes: 1, scanner: 1 };
const CODE = '5901234123457';
/* a profile saved from the Profile page: age, height, weight, nothing about steps or training */
const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', 'kova.tours.v1': JSON.stringify(seen), 'kova.units': 'imperial',
  kova_profile_v2: JSON.stringify({ theme: 'dark', tourSeen: true, tours: seen, maint: { v: 1, unit: 'lb', sex: 'm', age: 17, hcm: 178, kg: 72 } }) });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(/gstatic\.com|googletagmanager|google-analytics|fonts\.g|cdnjs/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
await ctx.route(/\/api\//, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no server in tests"}' }));
const offHits = [];
await ctx.route(/openfoodfacts\.org/, (r) => {
  const u = r.request().url(); offHits.push(u);
  if (/search\.pl/.test(u)) return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ products: [
    { code: '1', product_name: 'Turkey breast, sliced', brands: 'Deli Co', nutriments: { 'energy-kcal_100g': 104, proteins_100g: 17, carbohydrates_100g: 4, fat_100g: 2, sodium_100g: 1.0 } },
    { code: '2', product_name: 'No numbers here', nutriments: {} }] }) });
  if (u.indexOf(CODE) >= 0) return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 1, product: { code: CODE, product_name: 'Test Protein Bar', brands: 'Kova Test', serving_size: '60 g', ingredients_text: 'milk protein, oats',
    nutriments: { 'energy-kcal_100g': 400, proteins_100g: 33, carbohydrates_100g: 40, fat_100g: 13, 'energy-kcal_serving': 240, proteins_serving: 20, carbohydrates_serving: 24, fat_serving: 8 } } }) });
  return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"status":0}' });
});
await ctx.addInitScript((S) => { try { if (!localStorage.getItem('__seeded')) { for (const k in S) localStorage.setItem(k, S[k]); localStorage.setItem('__seeded', '1'); } } catch (e) {} }, STORE);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const boot = async () => { await p.goto(site.url + '/index.html'); await p.waitForFunction(() => window.__kovaLazyDone && window.KovaFoodLog && window.KovaFuel, null, { timeout: 40000 }); await p.evaluate(() => document.querySelectorAll('#kwn,#ksTour').forEach((x) => x.remove())); };
const sheet = () => p.evaluate(() => document.getElementById('sheetIn').innerText.replace(/\s+/g, ' '));
await boot();
await p.evaluate(() => go('fuel')); await p.waitForTimeout(700);

/* ---------- Water and Streak, real ---------- */
const cards = await p.evaluate(() => { const g = document.getElementById('kflCards'); return g && g.offsetHeight > 0 ? g.innerText.replace(/\s+/g, ' ') : ''; });
ck('Water and Streak show in live mode, from nothing (no sample 1.4 L or 12 days)', /WATER 0 oz of 88 oz/.test(cards) && /STREAK 0 days logged/.test(cards) && /Log a meal to start one/.test(cards) && !/1\.4|12 days/.test(cards) || (console.log(cards), false));
ck('a 17-year-old boy\'s target is 2.6 L of drinks (US National Academies), shown as 11 cups', /0 of 11 cups/.test(cards));
await p.locator('#kflCards [data-w="1"]').click(); await p.locator('#kflCards [data-w="1"]').click(); await p.waitForTimeout(100);
ck('+ adds a cup each time (2 cups = 16 oz)', await p.evaluate(() => KovaFoodLog.water() === 474) && /16 oz of 88 oz/.test(await p.locator('#kflCards').innerText()));
await p.locator('#kflCards [data-drop="4"]').click(); await p.waitForTimeout(100);
ck('tapping the 5th drop fills to 5 cups; tapping it again takes one off', await p.evaluate(() => KovaFoodLog.water() === 5 * 237) && (await p.locator('#kflCards [data-drop="4"]').click(), await p.waitForTimeout(80), await p.evaluate(() => KovaFoodLog.water() === 4 * 237)));

/* ---------- Energy balance waits for the burn questions ---------- */
const bal = await p.locator('#fuelBal').innerText();
ck('Energy balance does not guess a burn from a profile with no steps or training (no "7,000, your usual")', /doesn.t know your burn yet/.test(bal) && !/7,000/.test(bal) || (console.log(bal), false));

/* ---------- Log food: the chips, Quick add, My foods, favorites ---------- */
await p.locator('#logBtn').click(); await p.waitForTimeout(400);
ck('Log food has Quick add and Barcode at the top', await p.locator('#sheetIn [data-kfl="quick"]').count() === 1 && await p.locator('#sheetIn [data-kfl="bar"]').count() === 1);
await p.locator('#sheetIn .chip[data-t="recent"]').click(); await p.waitForTimeout(100);
ck('Recent with nothing logged says what will show there (it did nothing before)', /Foods you log show up here/.test(await sheet()) && await p.locator('#foodResults').isHidden());
await p.locator('#sheetIn .chip[data-t="custom"]').click(); await p.waitForTimeout(100);
ck('My foods has a New food button', /Foods you make with Quick add live here/.test(await sheet()) && await p.locator('#sheetIn [data-kfl="new"]').count() === 1);
await p.locator('#sheetIn [data-kfl="new"]').click(); await p.waitForTimeout(300);
ck('Quick add opens as its own page, Save to My foods already ticked from New food', /Quick add/.test(await sheet()) && await p.locator('#kflSave').isChecked());
await p.fill('#kflN', 'Turkey sandwich'); await p.fill('#kflP', '30'); await p.fill('#kflC', '40'); await p.fill('#kflF', '10');
await p.locator('#sheetIn [data-meal="Lunch"]').click(); await p.locator('#kflGo').click(); await p.waitForTimeout(300);
const e1 = await p.evaluate(() => { const t = KovaFuel.today(); return t[t.length - 1]; });
ck('Quick add with no calories adds them up from the macros (30p 40c 10f = 370 kcal), at Lunch', e1 && e1.kcal === 370 && e1.p === 30 && e1.meal === 'Lunch' && e1.items[0].n === 'Turkey sandwich' || (console.log(e1), false));
ck('…and the ring and the meal list show it', /370/.test(await p.locator('#fuelLogged').innerText()) && /Turkey sandwich/.test(await p.locator('#mealLog').innerText()));
await p.locator('#logBtn').click(); await p.waitForTimeout(300);
await p.locator('#sheetIn [data-kfl="quick"]').click(); await p.waitForTimeout(200);
await p.locator('#kflGo').click(); await p.waitForTimeout(100);
ck('Quick add refuses an empty food and says why', /Add calories or macros/.test(await p.locator('#kflMsg').innerText()));
await p.fill('#kflK', '9000'); await p.locator('#kflGo').click(); await p.waitForTimeout(100);
ck('…and a number too big for one food', /too big/.test(await p.locator('#kflMsg').innerText()));
await p.fill('#kflN', 'Iced latte'); await p.fill('#kflK', '190'); await p.locator('#kflGo').click(); await p.waitForTimeout(300);
ck('calories typed in are kept as typed (190), not saved to My foods unless ticked', await p.evaluate(() => { const t = KovaFuel.today(); const e = t[t.length - 1]; return e.kcal === 190 && !KovaFoodLog.mine().some((x) => x.n === 'Iced latte'); }));
await p.locator('#logBtn').click(); await p.waitForTimeout(300);
await p.locator('#sheetIn .chip[data-t="custom"]').click(); await p.waitForTimeout(100);
ck('My foods lists the saved sandwich', /Turkey sandwich 370 kcal/.test(await sheet()));
await p.locator('#sheetIn .chip[data-t="recent"]').click(); await p.waitForTimeout(100);
ck('Recent lists both, newest first', /Recent.*Iced latte.*Turkey sandwich/.test(await sheet()));
await p.locator('#kflMine [data-star="1"]').click(); await p.waitForTimeout(100);
await p.locator('#sheetIn .chip[data-t="fav"]').click(); await p.waitForTimeout(100);
ck('the star puts a food in Favorites', /Turkey sandwich/.test(await p.locator('#kflMine').innerText()) && !/Iced latte/.test(await p.locator('#kflMine').innerText()));
await p.locator('#kflMine .kfl-add').first().click(); await p.waitForTimeout(300);
ck('+ on a favorite logs it again', await p.evaluate(() => KovaFuel.today().filter((e) => e.items[0].n === 'Turkey sandwich').length === 2));

/* ---------- search: your foods first, then Open Food Facts when USDA is out of reach ---------- */
await p.locator('#logBtn').click(); await p.waitForTimeout(300);
await p.fill('#foodSearch', 'turk'); await p.waitForTimeout(1300);
const s1 = await sheet();
ck('typing finds your own foods first ("Yours")', /Yours Turkey sandwich/i.test(s1) || (console.log(s1), false));
ck('signed out, search says to sign in for USDA and searches Open Food Facts instead', /Sign in for USDA search/.test(s1) && /Open Food Facts · per 100 g/.test(s1) && /Deli Co Turkey breast, sliced/.test(s1) && !/No numbers here/.test(s1) && offHits.some((u) => /search\.pl.*turk/.test(u)));
await p.locator('#usdaResults .kmi-g').first().fill('150'); await p.locator('#usdaResults .kmi-add').first().click(); await p.waitForTimeout(300);
const e2 = await p.evaluate(() => { const t = KovaFuel.today(); return t[t.length - 1]; });
ck('an Open Food Facts food logs by the grams typed (150 g: 156 kcal, 26 g protein, sodium 1500 mg)', e2 && e2.src === 'off' && e2.kcal === 156 && e2.p === 26 && e2.m && e2.m.na === 1500 || (console.log(e2), false));

/* ---------- barcode: typed numbers ---------- */
await p.locator('#fuelScanIcon').click(); await p.waitForTimeout(400);
ck('Fuel\'s header icon ("Scan a barcode") opens the barcode page, not the meal camera', /Scan a barcode/.test(await sheet()) && await p.locator('#kbcCode').count() === 1 && await p.evaluate(() => !document.querySelector('.kcam.on,#kcam.on')));
await p.fill('#kbcCode', '1234'); await p.locator('#kbcGo').click(); await p.waitForTimeout(100);
ck('a wrong number of digits is refused with what to type', /8, 12 or 13 numbers/.test(await p.locator('#kbcSay').innerText()));
await p.fill('#kbcCode', CODE); await p.locator('#kbcGo').click(); await p.waitForTimeout(1200);
ck('typed numbers open the product on the Scanner screen', await p.evaluate(() => document.getElementById('s-scanner').classList.contains('on')) && /Test Protein Bar/.test(await p.locator('#scnName').innerText()));
await p.locator('#scnLogBtn').click(); await p.waitForTimeout(400);
ck('Log to Fuel logs one serving (240 kcal, 20 g protein)', await p.evaluate(() => KovaFuel.today().some((e) => e.src === 'scanner' && e.kcal === 240 && e.p === 20)));

/* ---------- barcode: the camera reads it, through the zxing reader where the browser has none ---------- */
await p.evaluate(() => go('fuel')); await p.waitForTimeout(300);
await p.evaluate((code) => {
  try { delete window.BarcodeDetector; } catch (e) {} window.BarcodeDetector = undefined;
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const Rr = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLG', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const d = code.split('').map(Number); let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PAR[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010'; for (let i = 7; i <= 12; i++) bits += Rr[d[i]]; bits += '101';
  const c = document.createElement('canvas'); c.width = 640; c.height = 480; const x = c.getContext('2d');
  const draw = () => { x.fillStyle = '#fff'; x.fillRect(0, 0, 640, 480); x.fillStyle = '#000'; for (let i = 0; i < bits.length; i++) if (bits[i] === '1') x.fillRect(130 + i * 4, 150, 4, 180); };
  draw(); setInterval(draw, 100);
  const st = c.captureStream(15);
  navigator.mediaDevices.getUserMedia = () => Promise.resolve(st);
}, CODE);
await p.locator('#logBtn').click(); await p.waitForTimeout(300);
await p.locator('#sheetIn [data-kfl="bar"]').click();
const read = await p.waitForFunction(() => document.getElementById('s-scanner').classList.contains('on') && /Test Protein Bar/.test(document.getElementById('scnName').textContent), null, { timeout: 30000 }).then(() => true, () => false);
ck('the camera reads the barcode with the browser\'s reader missing (the zxing reader loads), and the product opens', read || (console.log(await p.evaluate(() => (document.getElementById('kbcSay') || {}).textContent)), false));
ck('the barcode page closes once it has read', await p.evaluate(() => !document.getElementById('sheet').classList.contains('on')));

/* ---------- streak and water survive a reload; yesterday counts ---------- */
await p.evaluate(() => { const y = Date.now() - 864e5; KovaFuel.add({ at: y, kcal: 500, p: 30, c: 50, f: 15, items: [{ n: 'Yesterday dinner' }] }); });
await boot(); await p.evaluate(() => go('fuel')); await p.waitForTimeout(600);
const c2 = await p.locator('#kflCards').innerText();
ck('after a reload: 2 days logged in a row, and the water is still 4 cups', /2\s*days logged/.test(c2) && /4 of 11 cups/.test(c2) || (console.log(c2), false));

/* ---------- the three looks ---------- */
for (const th of ['soft', 'light']) {
  await p.evaluate((t) => { document.body.classList.remove('soft-light', 'light-mode'); document.body.classList.add(t === 'soft' ? 'soft-light' : 'light-mode'); }, th);
  const vis = await p.evaluate(() => { const d = document.querySelector('#kflCards .kfl-drop:not(.on)'), cs = getComputedStyle(d); return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent'; });
  ck(th + ': an empty water drop is still visible', vis);
}
ck('no page errors', !errs.length || (console.log(errs.slice(0, 3)), false));
let n = 0; R.forEach(([t, c]) => { console.log((c ? 'PASS ' : 'FAIL ') + t); if (c) n++; });
console.log(n + '/' + R.length + ' passing');
await b.close(); site.close();
process.exit(n === R.length ? 0 : 1);
