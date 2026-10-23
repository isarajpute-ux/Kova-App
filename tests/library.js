/* p42, the owner: "a whole library of all the workouts... cable attachments,
   any attachment that's known... a little section on the top right, what
   attachment, and it pops up... for the leg press, where you put your feet".
   Checked: the new drawings (popular and the different ones), each in the
   workout's own list so it can be added; the library by muscle, equipment
   and "the different ones"; every attachment drawn, by body area; the leg
   press feet on a plate, said honestly; Coach me's top-right button, and the
   leg press drawing following your feet. */
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
w.localStorage.setItem('kova_profile_v2', JSON.stringify({ tourSeen: true, tours: { playerpage: 1 } }));
w.speechSynthesis = { cancel() {}, speak() {}, getVoices() { return []; }, addEventListener() {} };
w.SpeechSynthesisUtterance = function (t) { this.text = t; };
w.Audio = function () { this.play = () => Promise.resolve(); this.pause = () => {}; };
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(1600);
  const doc = w.document, D = w.KovaDemo, X = w.KovaExPage, A = w.KovaAttach, K = w.KSESS, PL = w.KovaPlayer;
  /* the drawings */
  const NEW = D.MORE.map((r) => r.split('|')[0]);
  ck('at least 50 new exercises are drawn, each its own picture that moves', NEW.length >= 50 && NEW.every((n) => { const d = D.LIB[n.toLowerCase()]; return d && d.K.length >= 2 && d.mus && d.mus.p.length; }));
  ck('…the popular ones and the different ones (sissy squat, Bayesian curl, Jefferson curl, dragon flag, Copenhagen plank, reverse Nordic, Meadows row...)', ['T-bar row', 'Push press', 'Decline bench press', 'Hip abduction machine', 'Sissy squat', 'Bayesian curl', 'Jefferson curl', 'Dragon flag', 'Copenhagen plank', 'Reverse Nordic', 'Meadows row', 'Seal row', 'JM press', 'Zercher squat'].every((n) => NEW.indexOf(n) >= 0) && D.DIFF.length >= 20);
  ck('every drawing draws (no script errors in any frame)', NEW.every((n) => [0, 0.5, 1].every((u) => /<svg/.test(D.svg(n, u)))));
  ck('…and each one works the right muscles: the hip thrust family the glutes, a Bayesian curl the biceps, a dragon flag the abs', D.LIB['single leg hip thrust'].mus.p.includes('glutes') && D.LIB['bayesian curl'].mus.p.includes('biceps') && D.LIB['dragon flag'].mus.p.includes('abs') && D.LIB['hip adduction machine'].mus.p.includes('adductors'));
  ck('they join the workout’s own list with a start weight, so they can be added to today', NEW.every((n) => K.XL.some((x) => x.n === n)) && K.lib('Belt squat').w === 135 && K.lib('Belt squat').eq === 'mach');
  /* the library */
  w.go('move'); await wait(200); X.decorate && X.decorate(); await wait(20);
  const libBtn = doc.querySelector('#s-move .kxp-act[data-kxp="lib"]');
  ck('Workout’s Exercises button is there', !!libBtn);
  libBtn.click(); await wait(30);
  const sh = () => doc.getElementById('sheetIn');
  const count = () => sh().querySelectorAll('.kxp-cell').length;
  const all = count();
  ck('the library shows them all (130+ with a moving picture)', all >= 130 && /\d+ with a moving picture/.test(sh().textContent));
  sh().querySelector('[data-kxp="e"][data-e="cable"]').click(); await wait(20);
  const cab = [...sh().querySelectorAll('.kxp-cell b')].map((b) => b.textContent);
  ck('…by equipment: Cable shows only cable ones', cab.length > 5 && cab.length < all && cab.every((n) => (K.XL.find((x) => x.n === n) || {}).eq === 'cable'));
  sh().querySelector('[data-kxp="e"][data-e="all"]').click(); await wait(20);
  sh().querySelector('[data-kxp="d"]').click(); await wait(20);
  const dif = [...sh().querySelectorAll('.kxp-cell b')].map((b) => b.textContent);
  ck('…"The different ones" shows only the odd-looking ones that work, each tagged', dif.length >= 15 && dif.every((n) => D.DIFF.indexOf(n) >= 0) && sh().querySelectorAll('.kxp-dif').length === dif.length);
  sh().querySelector('[data-kxp="d"]').click(); await wait(20);
  sh().querySelector('[data-kxp="g"][data-g="Back"]').click(); await wait(20);
  ck('…and by muscle (Back has the new rows)', /T-bar row/.test(sh().textContent) && /Seal row/.test(sh().textContent) && !/Sissy squat/.test(sh().textContent));
  w.closeSheet();
  /* the attachments */
  ck('31 attachments, each drawn, with what it is for and the body areas it serves', A.CAT.length >= 30 && A.CAT.every((c) => c[0] && c[3] && c[2].length && /<(path|circle|rect|ellipse)/.test(c[4])));
  ck('…including the owner’s: V-bar, straight bar, the curved bar, the bar like bicycle handlebars, the weighted belt', ['V-bar', 'Straight bar', 'EZ bar', 'Wide lat bar', 'Dip belt', 'Rope', 'MAG grip', 'Trap bar', 'Landmine'].every((n) => A.CAT.some((c) => c[0] === n)) && /bicycle/.test(A.CAT.find((c) => c[0] === 'Wide lat bar')[3]));
  /* the picker from Coach me's top right */
  w.go('session'); await wait(200);
  const S = K.state(); let i = S.ex.findIndex((e) => /leg press/i.test(e.n));
  if (i < 0) { K.api.build ? 0 : 0; S.ex.push({ n: 'Leg press', tgt: { lo: 8, hi: 12 }, sets: [{ role: 'work' }, { role: 'work' }] }); i = S.ex.length - 1; }
  S.act = i; PL.open(); await wait(60);
  const pg = () => doc.getElementById('kpl');
  const ab = pg().querySelector('[data-kpl="att"]');
  ck('Coach me has a button at the top right: on a leg press, where your feet go', !!ab && /\+ Feet/.test(ab.textContent) && ab.closest('.kpl-wh'));
  ab.click(); await wait(30);
  ck('…it pops up above Coach me with the feet on a plate: middle, high, low, wide, narrow, one leg', /Where your feet go/.test(sh().textContent) && sh().querySelectorAll('.katt-pl8').length === 6 && ['Feet middle', 'Feet high', 'Feet low', 'Feet wide', 'Feet narrow', 'One leg'].every((n) => sh().textContent.indexOf(n) >= 0));
  ck('…said honestly: high works the glutes and hamstrings more, low the quads, wide the inner thighs; width changes less than height', /more glutes and hamstrings/.test(sh().textContent) && /Low on the plate: more quads/.test(sh().textContent) && /inner thighs/.test(sh().textContent) && /Height on the plate changes more than width/.test(sh().textContent));
  ck('…and every attachment is there too, by body area', sh().querySelectorAll('.katt-all .katt-t').length >= 30 && !!sh().querySelector('[data-katt-area="Back"]'));
  sh().querySelector('[data-katt-area="Legs"]').click(); await wait(20);
  ck('…Legs shows the leg gear only', [...sh().querySelectorAll('.katt-all .katt-t b')].every((b) => A.CAT.find((c) => c[0] === b.textContent)[2].indexOf('Legs') >= 0) && /Belt/.test(sh().querySelector('.katt-all').textContent));
  sh().querySelector('[data-katt-v="Feet high"]').click(); await wait(40);
  ck('picking "Feet high" saves it for the leg press and closes the pop-up', A.get('Leg press') === 'Feet high' && !doc.getElementById('sheet').classList.contains('on'));
  ck('…Coach me now shows the leg press with the feet high, and the button says so', pg().querySelector('.kpl-fig').getAttribute('data-kpl-fig') === 'Leg press (feet high)' && /Feet high/.test(pg().querySelector('[data-kpl="att"]').textContent));
  PL.close();
  /* any other exercise: its best attachments first */
  A.pickSheet('Rope pushdown'); await wait(20);
  ck('a cable exercise gets its best attachments first, drawn (rope, straight bar, V-bar...)', /Best for this one/.test(sh().textContent) && [...sh().querySelectorAll('.katt-best .katt-t b')].map((b) => b.textContent).slice(0, 3).join() === 'Rope,Straight bar,V-bar' && sh().querySelectorAll('.katt-best .katt-ic').length >= 3);
  w.closeSheet();
  ck('no script errors', !errors.filter((x) => !/Not implemented|navigation/i.test(x)).length);
  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  if (errors.length) console.log(errors.slice(0, 3).join('\n'));
  console.log(`${R.length - failed.length}/${R.length} library`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
