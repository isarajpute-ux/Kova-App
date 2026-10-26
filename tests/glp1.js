/* KovaGLP1 (src/p08_glp1.js): protein floor, fiber and water lead Fuel
   instead of calories; dose log with a reminder and site rotation; side
   effects linked to food and sleep; strength prompts; no red for eating
   little; a clear note that Kova gives no dosing advice. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;

function boot() {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova_mode_v1', 'live');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document };
}

(async () => {
  const { w, doc } = boot();
  await wait(800);
  const G = w.KovaGLP1;
  ck('off: Fuel offers GLP-1 mode, calories as usual', !!doc.getElementById('kg1Off') && !doc.getElementById('s-fuel').classList.contains('glp1-on'));
  G.setup(); await wait(30);
  ck('the setup says Kova gives no dosing advice', /does not give dosing advice/.test(doc.querySelector('#sheetIn .kg1s').textContent));
  doc.getElementById('kg1Med').value = 'Mounjaro (tirzepatide)';
  doc.getElementById('kg1Dose').value = '5 mg';
  doc.getElementById('kg1Day').value = '4';
  doc.getElementById('kg1Goal').value = '80';
  doc.getElementById('kg1Ppk').value = '1.4';
  doc.querySelector('#sheetIn [data-s="save"]').click(); await wait(50);
  ck('turning it on sets a protein floor from goal weight (80 kg x 1.4 = 112 g)', G.on() && G.targets().p === 112);
  const fuel = doc.getElementById('s-fuel');
  ck('the calorie ring gives way to protein, fiber and water rings', fuel.classList.contains('glp1-on') && doc.querySelectorAll('#kg1 .kg1-ring').length === 3 && /Protein floor/.test(doc.getElementById('kg1').textContent));
  ck('it says calories are not the goal, and nothing is red', /Calories are not the goal/.test(doc.querySelector('.kg1-credit').textContent) && !/--bad|kg1-bad/.test(doc.getElementById('kg1').innerHTML));
  w.KovaFuel.add({ src: 'manual', kcal: 350, p: 60, c: 20, f: 10, m: { fib: 8 }, items: [{ n: 'Greek yogurt and berries' }] });
  w.KovaFuel.add({ src: 'manual', kcal: 420, p: 55, c: 30, f: 12, m: { fib: 6 }, items: [{ n: 'Chicken salad' }] });
  await wait(30);
  ck('hitting the floor is the credit, even on 770 kcal', /Protein floor hit/.test(doc.querySelector('.kg1-credit').textContent) && doc.querySelector('.kg1-credit').classList.contains('hit'));
  ck('fiber adds up from logged food', G.today().fib === 14);
  doc.querySelector('#kg1 [data-g="w"][data-v="0.5"]').click(); await wait(10);
  ck('water logs in one tap', G.today().water === 0.5);

  // doses and sites
  const first = G.nextSite();
  doc.querySelector('#kg1 [data-g="dose"]').click(); await wait(10);
  ck('a dose is logged at the suggested site', G._D().doses.length === 1 && G._D().doses[0].site === first);
  ck('the next suggestion rotates to a site not used', G.nextSite() !== first);
  doc.querySelector('#kg1 [data-g="site"][data-v="thigh-r"]').click(); await wait(10);
  ck('any site can be chosen instead', G._D().doses[1].site === 'thigh-r');
  const rem = w.__alerts.get().find((a) => a.id === 'glp1');
  ck('dose day gets a reminder (Thursday, 09:00)', rem && rem.on && rem.t === '09:00' && rem.days[3] === 1 && rem.days.reduce((a, b) => a + b, 0) === 1);
  ck('the push reminder goes out on Thursday and opens Fuel', (() => { const it = w.KovaPush.items().glp1; return it && JSON.stringify(it.days) === '[4]' && it.screen === 'fuel' && it.kind === 'glp1'; })());
  w.__alerts.reload();
  ck('and it survives the reminder list reloading', !!w.__alerts.get().find((a) => a.id === 'glp1'));

  // side effects linked to food and sleep
  doc.querySelector('#kg1 [data-g="fx"][data-k="nausea"][data-v="2"]').click(); await wait(10);
  ck('side effects log in one tap', G._D().fx[w.KovaFuel.dayKey(Date.now())].nausea === 2);
  ck('with too few days it says what it needs, not a guess', /needs \d+ more logged days/.test(doc.getElementById('kg1').textContent));
  const D = G._D(); const sl = {};
  for (let i = 1; i <= 8; i++) {
    const t = Date.now() - i * DAY; const k = w.KovaFuel.dayKey(t);
    D.fx[k] = { nausea: i % 2 ? 3 : 0 };
    w.KovaFuel.add({ at: t, src: 'manual', kcal: 500, p: i % 2 ? 45 : 90, c: 40, f: 10, items: [{ n: 'meal' }] });
    sl[k] = { mins: i % 2 ? 360 : 450, bed: '11:00 p' };
  }
  w.localStorage.setItem('kova_sleeplog_v1', JSON.stringify(sl));
  G._set(D); await wait(10);
  const links = G.links();
  ck('nausea is linked to protein, with the day counts', /On moderate or strong nausea days you ate 34% less protein/.test(links[0].t) && links[0].n === '5 vs 4 days');
  ck('and to sleep the night before', /slept 90 minutes less/.test(links[1].t));
  ck('every link says it is a comparison, not a cause', /not a cause/.test(doc.getElementById('kg1').textContent));

  // strength and the note
  ck('strength sessions are prompted (0 of 2)', /Strength sessions this week: 0 of 2/.test(doc.getElementById('kg1').textContent));
  ck('the no-dosing-advice note stays on the screen', /does not give dosing advice/.test(doc.getElementById('kg1').textContent));

  // Today card
  w.KovaToday.pop('fuel'); await wait(10);
  const eat = [...doc.querySelectorAll('#sheetIn .kt .kt-row')].find((r) => r.querySelector('.kt-l').textContent === 'Eat');
  ck('the Fuel box on Today leads with the protein floor, not calories', eat && /of 112/.test(eat.textContent) && /g protein floor/.test(eat.textContent) && !/kcal/.test(eat.querySelector('.kt-v').textContent));
  if (w.closeSheet) w.closeSheet();

  // off again
  G.setup(); await wait(20);
  doc.querySelector('#sheetIn [data-s="off"]').click(); await wait(20);
  ck('turning it off brings the calorie ring back', !fuel.classList.contains('glp1-on') && !doc.getElementById('kg1'));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
