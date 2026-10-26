/* Supersets and live heart rate in the workout session (p10).

   Pairs two exercises, labels them A1/A2, goes straight from A1 to A2 with
   no rest and starts the full rest after the pair, remembers the pair by
   name, and records heart rate: the standard BLE measurement is parsed
   (8- and 16-bit), each checked set keeps the bpm, and the log gets
   average, peak and minutes per zone. */
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
  const doc = w.document, K = w.KSESS, H = w.KovaHR;
  K.enter(); await wait(50);
  const S = K.state();
  S.mode = 'guided'; S.act = 0; K.render();
  ck('the session has at least three exercises', S.ex.length >= 3);
  const n0 = S.ex[0].n, n1 = S.ex[1].n;
  const btn = doc.querySelector('[data-ss="0"]');
  ck('each exercise but the last offers + Superset', !!btn && !doc.querySelector('[data-ss="' + (S.ex.length - 1) + '"]'));
  btn.click(); await wait(20);
  ck('pairing sets the flag and remembers the pair by name', S.ex[0].ss === true && JSON.parse(w.localStorage.getItem('kova.ss.v1'))[n0 + '>' + n1] === 1);
  const nums = [...doc.querySelectorAll('#exList .exnum')].map((e) => e.textContent);
  ck('the pair is labelled A1 / A2 and the third keeps its number', nums[0] === 'A1' && nums[1] === 'A2' && nums[2] === '3');
  ck('both halves of the active pair are open', doc.querySelectorAll('#exList .exwrap[data-ex="0"] .srow').length > 0 && doc.querySelectorAll('#exList .exwrap[data-ex="1"] .srow').length > 0);
  ck('a rail and a tag mark the superset', doc.querySelector('.exwrap.ss.ss-a .ss-tag') && doc.querySelector('.exwrap.ss.ss-z'));

  // heart rate while lifting
  const dv = (bytes) => new w.DataView(new Uint8Array(bytes).buffer);
  ck('parses 8-bit bpm', H.parse(dv([0x00, 142])) === 142);
  ck('parses 16-bit bpm', H.parse(dv([0x01, 0x2c, 0x01])) === 300);
  w.localStorage.setItem('kova.hr.age', '30');
  ck('max HR by Tanaka: 208 - 0.7 x 30 = 187', H.max().v === 187);
  ck('150 bpm is zone 4 at max 187', H.zone(150) === 3);
  for (let i = 0; i < 8; i++) { H._st.samples.push([Date.now() - (8 - i) * 40, 120 + i * 5]); }
  H.push(150); await wait(10);
  ck('the HUD shows live bpm and the zone', /150/.test(doc.getElementById('hrSlot').textContent) && /Z4/.test(doc.getElementById('hrSlot').textContent));

  // the flow: A1 -> A2 with no rest, rest after the pair
  const chk = (i) => { const e = S.ex[i]; const j = e.sets.findIndex((s) => !s.d); doc.querySelector('[data-chk="' + i + '-' + j + '"]').click(); return j; };
  const j0 = chk(0); await wait(10);
  ck('checking A1 goes straight to A2', S.act === 1);
  ck('no rest between A1 and A2', !doc.getElementById('hudRestCell').classList.contains('on'));
  ck('the set kept the heart rate', S.ex[0].sets[j0].hr === 150);
  chk(1); await wait(10);
  ck('after A2 the rest starts', doc.getElementById('hudRestCell').classList.contains('on'));
  ck('and it goes back to A1 for the next round', S.act === 0);
  // finish both
  while (S.ex[0].sets.some((s) => !s.d) || S.ex[1].sets.some((s) => !s.d)) { const a = S.act; if (a > 1) break; chk(a); await wait(5); }
  ck('when the pair is done it moves past it', S.act === 2);

  // unpair, then pair again from the remembered map
  S.act = 0; K.render();
  doc.querySelector('[data-ss="0"]').click(); await wait(10);
  ck('tapping again removes the superset', S.ex[0].ss === false && !doc.querySelector('.exwrap.ss'));
  S.act = 0; K.render(); doc.querySelector('[data-ss="0"]').click(); await wait(10);

  // log
  K.finish(); await wait(30);
  const L = K.log().slice(-1)[0];
  ck('the log keeps the pair and per-set heart rate', L.ex[0].ss === 1 && L.ex[0].sets[0].hr === 150);
  ck('the log has avg / peak / minutes per zone', L.hr && L.hr.max >= 150 && L.hr.avg > 100 && L.hr.zones.length === 5);

  // honest support note when there is no Web Bluetooth
  let opened = ''; w.openSheet = (h) => { opened = h; };
  H.sheet();
  ck('without Web Bluetooth it says iPhone needs the Kova app', /every browser on iPhone/.test(opened) && /Kova app on iPhone/.test(opened));
  ck('it names the straps that work', /Polar H10/.test(opened) && /HeartCast/.test(opened));

  let p = 0, f = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? p++ : f++; });
  console.log('\n' + p + '/' + (p + f) + ' passing');
  if (errors.length) { console.log('runtime errors: ' + errors.length); errors.slice(0, 6).forEach((e) => console.log('  ' + e)); }
  process.exit(f || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
