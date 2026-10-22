/* p39: the strength check-in (Settings > Strength check-in), after the
   owner's notes: the boxes take numbers only; "6-8" reps is a range (7),
   not 68; the weight says what it is (each dumbbell or both together; the
   total or the plates on each side, a barbell adding its 45 lb bar); and
   the long list of derived starting weights sits behind one button. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
['kova.auth.skipped', 'kova.auth.local'].forEach((k) => w.localStorage.setItem(k, '1'));
w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
w.localStorage.setItem('kova_mode_v1', 'live');
w.localStorage.setItem('kova_profile_v2', JSON.stringify({ tourSeen: true, baseline: { bw: 180 } }));
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
(async () => {
  await wait(1200);
  const d = w.document;
  w.go('strength'); await wait(150);
  const card = (m) => d.querySelector('#stList .stcard[data-m="' + m + '"]');
  const type = (m, f, v) => { const el = card(m).querySelector('.stin[data-f="' + f + '"]'); el.value = v; el.dispatchEvent(new w.Event('input')); return el; };
  const ST = () => JSON.parse(w.localStorage.getItem('kova_strength_v1') || '{}');
  let el = type('Chest', 'w', 'abc185lb');
  ck('the weight box keeps numbers only (letters are taken out as you type)', el.value === '185' && ST().Chest.w === '185');
  el = type('Chest', 'r', '6-8');
  ck('reps take a range: "6-8" stays 6-8', el.value === '6-8' && ST().Chest.r === '6-8');
  const top = card('Chest').querySelector('.lbl').textContent;
  ck('…and counts as 7, not 68 (185 x 7 reps: about 228 lb max)', /EST 1RM 228 LB/.test(top));
  el = type('Chest', 'r', 'x6--8 reps');
  ck('…stray letters and dashes are cleaned out', el.value === '6-8');
  /* dumbbells: each dumbbell by default, or both together */
  d.querySelector('#stList .stpick[data-m="Shoulders"][data-n="Dumbbell shoulder press"]').click(); await wait(20);
  type('Shoulders', 'w', '90'); type('Shoulders', 'r', '8');
  const sh = card('Shoulders');
  ck('a dumbbell lift asks per dumbbell ("90s, one in each hand") by default', /Each dumbbell/.test(sh.textContent) && sh.querySelector('.stu[data-u="each"]').classList.contains('on') && /EST 1RM 114 LB/.test(sh.querySelector('.lbl').textContent));
  sh.querySelector('.stu[data-u="both"]').click(); await wait(20);
  ck('…or both together, which is halved for each dumbbell', /EST 1RM 57 LB/.test(card('Shoulders').querySelector('.lbl').textContent) && ST().Shoulders.u === 'both');
  /* barbell: the total, or the plates on each side plus the bar */
  type('Quads', 'w', '135'); type('Quads', 'r', '5');
  ck('a barbell lift is the total on the bar by default', /Total \(bar \+ plates\)/.test(card('Quads').textContent) && /EST 1RM 158 LB/.test(card('Quads').querySelector('.lbl').textContent));
  card('Quads').querySelector('.stu[data-u="side"]').click(); await wait(20);
  ck('…or the plates on each side, counted as both sides plus the 45 lb bar (135 a side = 315)', /EST 1RM 368 LB/.test(card('Quads').querySelector('.lbl').textContent));
  /* the bottom: one line, the list behind a button */
  const der = d.getElementById('stDerived');
  ck('the starting weights are one line with a button, not a long list', der.querySelectorAll('.card').length === 1 && /Starting weights for \d+ exercises/.test(der.textContent) && !!d.getElementById('stDerivOpen'));
  d.getElementById('stDerivOpen').click(); await wait(20);
  ck('…See them opens the full list in a pop-up', /Your starting weights/.test(d.getElementById('sheetIn').textContent) && /Push|Legs/.test(d.getElementById('sheetIn').textContent));
  w.closeSheet();
  /* saving: real weights and whole reps */
  d.getElementById('stSave').click(); await wait(20);
  const H = JSON.parse(w.localStorage.getItem('kova_hist_v1') || '{}');
  ck('saving writes the real numbers: 7 reps for 6-8, per dumbbell for dumbbells, the full bar for plates a side', H['Barbell bench press'].slice(-1)[0].sets[0].r === 7 && H['Dumbbell shoulder press'].slice(-1)[0].sets[0].w === 45 && H['Barbell back squat'].slice(-1)[0].sets[0].w === 315);
  ck('no script errors', !errors.filter((e) => !/Not implemented|navigation/i.test(e)).length);
  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  if (errors.length) console.log(errors.slice(0, 3).join('\n'));
  console.log(`${R.length - failed.length}/${R.length} strength`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
