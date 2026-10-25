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
  /* p43: the library is the dial (muscle, or equipment with the centre button) and one card */
  const tiles = () => [...sh().querySelectorAll('#kxpCard .kdl-t b')].map((b) => b.textContent);
  const pick = async (label) => { const b = [...sh().querySelectorAll('.kdl-l')].find((x) => x.textContent.trim() === label); if (b) b.click(); await wait(900); return !!b; };
  const all = tiles().length;
  ck('the library shows them all (130+ with a moving picture), under one short title', all >= 130 && sh().querySelector('.kdl-top b').textContent === 'Exercises');
  ck('…on a dial of muscles round a centre button, no rows of chips', sh().querySelectorAll('.kdl-l').length === 10 && !!sh().querySelector('.kdl-c') && !sh().querySelector('[data-kxp="g"]'));
  sh().querySelector('[data-kxp="ring"][data-r="e"]').click(); await wait(1300);
  ck('…Equipment turns it into an equipment dial (Any, Barbell, Dumbbell, Cable, Machine, Bodyweight, Different)', [...sh().querySelectorAll('.kdl-l')].map((x) => x.textContent.trim()).join() === 'Any,Barbell,Dumbbell,Cable,Machine,Bodyweight,Different');
  await pick('Cable');
  const cab = tiles();
  ck('…by equipment: Cable shows only cable ones', cab.length > 5 && cab.length < all && cab.every((n) => (K.XL.find((x) => x.n === n) || {}).eq === 'cable'));
  await pick('Different');
  const dif = tiles();
  ck('…"Different" shows only the odd-looking ones that work', dif.length >= 15 && dif.every((n) => D.DIFF.indexOf(n) >= 0));
  await pick('Any');
  sh().querySelector('.kdl-c').click(); await wait(1300);
  await pick('Back');
  ck('…and by muscle (Back has the new rows), the card named for it', /T-bar row/.test(sh().textContent) && /Seal row/.test(sh().textContent) && !/Sissy squat/.test(sh().querySelector('#kxpCard').textContent) && /^Back/.test(sh().querySelector('#kxpCard .kdl-name').textContent));
  w.closeSheet();
  /* the attachments */
  ck('31 attachments, each drawn, with what it is for and the body areas it serves', A.CAT.length >= 30 && A.CAT.every((c) => c[0] && c[3] && c[2].length && /<(path|circle|rect|ellipse)/.test(c[4])));
  ck('…including the owner’s: V-bar, straight bar, the curved bar, the bar like bicycle handlebars, the weighted belt', ['V-bar', 'Straight bar', 'EZ bar', 'Wide lat bar', 'Dip belt', 'Rope', 'MAG grip', 'Trap bar', 'Landmine'].every((n) => A.CAT.some((c) => c[0] === n)));
  ck('the owner: “8 words, not 28”: every attachment and foot position says what it is for in 4 words or fewer', A.CAT.every((c) => c[3].split(/\s+/).length <= 4) && A.FEET.every((f) => f[1].split(/\s+/).length <= 4));
  /* the picker from Coach me's top right */
  w.go('session'); await wait(200);
  const S = K.state(); let i = S.ex.findIndex((e) => /leg press/i.test(e.n));
  if (i < 0) { K.api.build ? 0 : 0; S.ex.push({ n: 'Leg press', tgt: { lo: 8, hi: 12 }, sets: [{ role: 'work' }, { role: 'work' }] }); i = S.ex.length - 1; }
  S.act = i; PL.open(); await wait(60);
  const pg = () => doc.getElementById('kpl');
  const ab = pg().querySelector('[data-kpl="att"]');
  ck('Coach me has a button at the top right: on a leg press, where your feet go', !!ab && /\+ Feet/.test(ab.textContent) && ab.closest('.kpl-wh'));
  ab.click(); await wait(30);
  const dl = () => [...sh().querySelectorAll('.kdl-l')].map((x) => x.textContent.trim());
  ck('…it pops up above Coach me as a dial of where your feet go: middle, high, low, wide, narrow, one leg, each a plate', dl().join() === 'middle,high,low,wide,narrow,One leg' && sh().querySelectorAll('.kdl-l .katt-pl8').length === 6 && !!sh().querySelector('.kdl-c'));
  ck('…the card shows the leg press that way, in a few honest words, with Use', /Feet middle/i.test(sh().querySelector('#kattCard .kdl-name').textContent) && /Quads and glutes/.test(sh().querySelector('#kattCard').textContent) && /Height matters more than width/.test(sh().querySelector('#kattCard').textContent) && !!sh().querySelector('#kattCard [data-kxd="Leg press"]'));
  [...sh().querySelectorAll('.kdl-l')].find((x) => x.textContent.trim() === 'high').click(); await wait(900);
  ck('…turning the dial to High shows feet high: more glutes and hamstrings', /Feet high/i.test(sh().querySelector('#kattCard .kdl-name').textContent) && /More glutes, hamstrings/.test(sh().querySelector('#kattCard').textContent) && !!sh().querySelector('#kattCard [data-kxd="Leg press (feet high)"]'));
  sh().querySelector('.kdl-c').click(); await wait(1300);
  ck('…the centre button switches the dial to gear, by body area', dl().join() === 'Back,Legs,Glutes,Arms,Chest,Shoulders,Core' && sh().querySelectorAll('#kattCard .kdl-t').length >= 5);
  sh().querySelector('.kdl-c').click(); await wait(1300);
  sh().querySelector('#kattCard [data-katt-v="Feet high"]').click(); await wait(40);
  ck('Use feet high saves it for the leg press and closes the page', A.get('Leg press') === 'Feet high' && !doc.getElementById('sheet').classList.contains('on'));
  ck('…Coach me now shows the leg press with the feet high, and the button says so', pg().querySelector('.kpl-fig').getAttribute('data-kpl-fig') === 'Leg press (feet high)' && /Feet high/.test(pg().querySelector('[data-kpl="att"]').textContent));
  PL.close();
  /* any other exercise: its own area, the ones that fit first */
  A.pickSheet('Rope pushdown'); await wait(20);
  ck('a cable exercise opens on its own area (a pushdown: Arms), the cable ones first, drawn (rope, straight bar...)', A._PK().area === 'Arms' && [...sh().querySelectorAll('#kattCard .kdl-t b')].map((b) => b.textContent).slice(0, 2).join() === 'Rope,Straight bar' && sh().querySelectorAll('#kattCard .kdl-t svg').length >= 4 && !/Best for this one/.test(sh().textContent));
  w.closeSheet();
  ck('no script errors', !errors.filter((x) => !/Not implemented|navigation/i.test(x)).length);
  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  if (errors.length) console.log(errors.slice(0, 3).join('\n'));
  console.log(`${R.length - failed.length}/${R.length} library`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
