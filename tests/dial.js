/* p43, the owner's Ron Design Lab dial (src/p08_dial.js): "press one button
   and all of them pop up all around... it's not like buttons, it's kind of
   like a slider". Segments round a centre button, the one in the slot is the
   choice, it goes all the way round, keys and taps move it, the centre
   button does the page's own thing. */
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
w.localStorage.setItem('kova_profile_v2', JSON.stringify({ tourSeen: true }));
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(1200);
  const doc = w.document, KD = w.KovaDial;
  ck('the dial loaded', !!KD && typeof KD.mount === 'function');
  const box = doc.createElement('div'); doc.body.appendChild(box);
  box.innerHTML = KD.html({ label: 'Muscle', centre: { label: 'Switch' } });
  const items = ['All', 'Legs', 'Glutes', 'Back', 'Chest', 'Arms', 'Core'].map((x) => ({ id: x.toLowerCase(), label: x, icon: KD.mus(x === 'All' ? 'all' : x) }));
  const picks = []; let taps = 0;
  const D = KD.mount(box.firstChild, { items, sel: 0, onPick: (i, it) => picks.push(it.id), centre: { icon: 'swap', label: 'Switch', onTap: () => taps++ } });
  const el = box.firstChild;
  ck('it draws a glass segment and a label for each choice, round a centre button', el.querySelectorAll('.kdl-s').length === 7 && el.querySelectorAll('.kdl-l').length === 7 && !!el.querySelector('.kdl-c svg'));
  ck('…it is a radio group: the one in the slot is checked', el.getAttribute('role') === 'radiogroup' && el.querySelector('.kdl-l.on').textContent === 'All' && el.querySelector('.kdl-l.on').getAttribute('aria-checked') === 'true');
  ck('segment icons come from Kova’s own body map (the muscle’s real shape)', /<path d="M/.test(KD.mus('Chest')) && /kdl-mus/.test(KD.mus('Chest')) && /viewBox="[\d. -]+"/.test(KD.mus('Glutes')));
  await wait(900);
  const op = (i) => +el.querySelectorAll('.kdl-s')[i].style.opacity;
  ck('it goes all the way round: with the first one chosen, the last sits on the other side of it', op(6) > 0.5 && op(1) > 0.5);
  /* tap a segment: it slides into the slot, the nearest way round */
  el.querySelectorAll('.kdl-l')[6].click(); await wait(900);
  ck('tapping a segment slides it into the slot and says so once', D.sel() === 6 && picks.join() === 'core' && el.querySelector('.kdl-l.on').textContent === 'Core');
  ck('…the nearest way round (one step back, not six forward)', D._st.pos === 6 && Math.abs(D._st.pos - 6) < 0.01);
  el.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await wait(900);
  ck('the arrow keys turn it, and it wraps round (Core, then All)', D.sel() === 0 && picks.join() === 'core,all');
  el.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await wait(900);
  ck('…and back', D.sel() === 6);
  el.querySelector('.kdl-c').click();
  ck('the centre button does the page’s own thing', taps === 1);
  /* the swap: everything goes back into the hub, the new set comes out */
  D.swap(['Any', 'Barbell', 'Cable'].map((x) => ({ id: x, label: x })), 1); await wait(1300);
  ck('a new set of segments comes out all round', [...el.querySelectorAll('.kdl-l')].map((x) => x.textContent).join() === 'Any,Barbell,Cable' && el.querySelector('.kdl-l.on').textContent === 'Barbell');
  ck('the card’s arrows: open and close drawings', /<svg/.test(KD.arrows(false)) && KD.arrows(true) !== KD.arrows(false));
  ck('no script errors', !errors.filter((x) => !/Not implemented/i.test(x)).length);
  if (errors.length) console.log(errors.slice(0, 3));
  let p = 0; R.forEach(([n, c]) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (c) p++; });
  console.log(p + '/' + R.length + ' dial');
  process.exit(p === R.length ? 0 : 1);
})();
