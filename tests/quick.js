/* KovaQuick (src/p08_quick.js): a meal in two taps from anywhere.
   Camera from the rail (tap 1), the plate read by /api/meal/read, one
   "Log it" (tap 2); the Kova-only line uses sleep, cycle and training;
   recent meals and "Same as yesterday" log in one tap; taps are measured.
   Also the server side of the read (functions/meal.js). */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const { parseItems, readMeal } = require(__dirname + '/../functions/meal.js');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PLATE = [
  { ingredient: 'Grilled chicken', estimated_weight_grams: 150, confidence_percentage: 85, calories: 250, protein_grams: 46, carbs_grams: 0, fat_grams: 6, iron_mg: 1.2 },
  { ingredient: 'Jasmine rice', estimated_weight_grams: 180, confidence_percentage: 80, calories: 234, protein_grams: 4, carbs_grams: 52, fat_grams: 0 },
  { ingredient: 'Olive oil', estimated_weight_grams: 10, confidence_percentage: 60, calories: 88, protein_grams: 0, carbs_grams: 0, fat_grams: 10 }
];

function boot(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const user = { uid: 'u1', email: 'a@b.c', getIdToken: () => Promise.resolve('tok') };
  const auth = { get currentUser() { return user; }, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() };
  const events = [];
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent(n, p) { events.push([n, p]); }, setUserId() {} }) };
  const reads = [];
  w.fetch = (url, o = {}) => {
    const u = String(url);
    if (/\/api\/meal\/read$/.test(u)) {
      reads.push(JSON.parse(o.body));
      if (opts.status) return Promise.resolve({ ok: false, status: opts.status, json: () => Promise.resolve({ error: 'x' }) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: PLATE }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, url: 'https://kova.local/api/media/file?p=x', path: 'x' }), text: () => Promise.resolve('') });
  };
  w.localStorage.setItem('kova_mode_v1', 'live');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.consent', JSON.stringify({ a: true, at: 1 }));   // analytics allowed (the banner's yes)
  if (opts.seed) w.localStorage.setItem('kova_foodlog', JSON.stringify(opts.seed));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  const cam = { opened: 0, onShot: null };
  w.KovaCam = { open: (o) => { cam.opened++; cam.onShot = o.onShot; }, close() {} };
  return { w, doc: w.document, events, reads, cam };
}

(async () => {
  // ---------- server: the read ----------
  const items = parseItems('```json\n[{"ingredient":"Egg","estimated_weight_grams":"50","calories":72,"protein_grams":6.3,"confidence_percentage":140}]\n```');
  ck('the server read is sanitised (numbers, confidence capped at 100)', items.length === 1 && items[0].estimated_weight_grams === 50 && items[0].confidence_percentage === 100);
  ck('a reply with no food is an empty list', parseItems('[]').length === 0);
  const sk = parseItems('[{"n":"Rice","g":180,"c":90,"kcal":234,"p":4.3,"cb":51,"f":0.5,"fib":0.6,"na":2,"fe":0.3,"v":"one cup"}]');
  ck('the short keys the fast reader writes come back as the long names the page reads', sk.length === 1 && sk[0].ingredient === 'Rice' && sk[0].calories === 234 && sk[0].carbs_grams === 51 && sk[0].iron_mg === 0.3 && sk[0].volume_clue === 'one cup');
  let sent = null;
  const out = await readMeal({ cfg: { anthropicKey: 'k', model: 'm' }, body: { image: 'A'.repeat(400), note: 'olive oil' },
    fetch: async (u, o) => { sent = JSON.parse(o.body); return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(PLATE) }] }) }; } });
  ck('the photo goes to the model as an image, with the note as context', sent.messages[0].content[0].type === 'image' && /olive oil/.test(sent.messages[0].content[1].text) && sent.temperature === 0);
  ck('and three items come back', out.items.length === 3);
  let refused = null;
  try { await readMeal({ cfg: { anthropicKey: 'k' }, body: { image: 'not base64 !!' } }); } catch (e) { refused = e; }
  ck('a malformed image is refused (400)', refused && refused.status === 400);

  // ---------- two taps ----------
  const A = boot({});
  await wait(600);
  const { w, doc } = A;
  w.KOVA_WEEK = [{ deep: 60, rem: 60, light: 220 }];          // 5h 40m last night
  ck('no camera on the side rail, none on Today', !doc.getElementById('kqRail') && !doc.getElementById('kqHome'));
  w.go('fuel'); await wait(50);
  const rail = doc.getElementById('scanBtn');
  rail.click();
  ck('tap 1: "Scan food" on Fuel opens the meal camera straight away', A.cam.opened === 1);
  A.cam.onShot('data:image/jpeg;base64,' + 'B'.repeat(600));
  await wait(3000);
  const sh = doc.querySelector('#sheetIn .kq');
  ck('the plate is read by the Kova server, photo shrunk first', A.reads.length === 1 && A.reads[0].mime === 'image/jpeg' && A.reads[0].image.length > 100);
  ck('the result shows calories and protein', sh && /572\s*kcal/.test(sh.querySelector('.kq-big').textContent.replace(/\s+/g, ' ')) && /50 g protein/.test(sh.textContent));
  ck('it says how sure it is and where the number came from', /Estimated from photo, ±20%/.test(sh.textContent));
  ck('the Kova line uses last night\'s sleep', /You slept 5h 40m: aim for \+20 g protein today/.test(sh.querySelector('.kq-line').textContent));
  ck('there is exactly one Log it button', sh.querySelectorAll('[data-kq="log"]').length === 1);
  const before = w.KovaFuel.today().length;
  sh.querySelector('[data-kq="log"]').click();
  await wait(50);
  const logged = w.KovaFuel.today();
  ck('tap 2 logs it', logged.length === before + 1 && logged[logged.length - 1].kcal === 572 && logged[logged.length - 1].src === 'photo');
  const ql = A.events.filter((e) => e[0] === 'quick_log');
  ck('it took 2 taps, and that number is measured', ql.length === 1 && ql[0][1].taps === 2 && ql[0][1].src === 'photo');
  ck('the confidence is kept with the entry', logged[logged.length - 1].conf === 60);

  // ---------- one tap from Fuel ----------
  await wait(50);
  const chip = doc.querySelector('#kqFuel [data-kq="r"]');
  ck('the meal shows up as a one-tap chip on Fuel', !!chip && /Grilled chicken/.test(chip.textContent));
  chip.click(); await wait(50);
  const ql2 = A.events.filter((e) => e[0] === 'quick_log');
  ck('a recent meal logs in one tap', w.KovaFuel.today().length === before + 2 && ql2[ql2.length - 1][1].taps === 1);

  // ---------- portions ----------
  rail.click(); A.cam.onShot('data:image/jpeg;base64,' + 'C'.repeat(600)); await wait(3000);
  doc.querySelector('#sheetIn .kq [data-kq="s"][data-v="0.5"]').click();
  ck('a portion chip halves it in one tap', /286/.test(doc.querySelector('#sheetIn .kq-big').textContent));

  // ---------- cycle ----------
  const B = boot({});
  await wait(600);
  B.w.KOVA_WEEK = [{ deep: 90, rem: 100, light: 280 }];
  B.w.KovaCycle.phase = () => 'luteal';
  ck('in the luteal phase the line says so', /^Luteal phase: appetite runs higher/.test(B.w.KovaQuick.line({ kcal: 400, p: 30 })));

  // ---------- same as yesterday ----------
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const C = boot({});
  await wait(600);
  C.w.KovaFuel.add({ at: yest.getTime(), src: 'manual', kcal: 410, p: 30, c: 40, f: 12, items: [{ n: 'Oats and berries' }] });
  C.w.KovaQuick.paintHome();
  const y = C.doc.querySelector('#kqFuel [data-kq="y"]');
  ck('"Same as yesterday" appears with yesterday\'s meal at this time of day', !!y && /410 kcal/.test(y.textContent));
  const n0 = C.w.KovaFuel.today().length;
  y.click(); await wait(30);
  ck('and logs it in one tap', C.w.KovaFuel.today().length === n0 + 1 && C.w.KovaFuel.today().slice(-1)[0].kcal === 410);

  // ---------- no Pro ----------
  const D = boot({ status: 402 });
  await wait(600);
  D.doc.getElementById('scanBtn').click(); D.cam.onShot('data:image/jpeg;base64,' + 'D'.repeat(600)); await wait(3000);
  ck('without Pro it says so plainly and offers search', /part of Kova Pro/.test(D.doc.querySelector('#sheetIn .kq').textContent) && !!D.doc.querySelector('#sheetIn [data-kq="search"]'));

  // ---------- the old photo sheet no longer wipes the meal list ----------
  ck('the scan sheet updates its own button, not the Fuel meal list', !/getElementById\('mealLog'\)\.textContent/.test(html) && /KovaFuel\.add\(\{src:'photo'/.test(html));

  const failed = R.filter((r) => !r[1]);
  R.forEach((r) => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
