/* The picker (src/p08_dial.js) for Exercises, Stretch and attachments. It was
   a radial dial (p43-p43e); the owner asked for it to be deleted until a new
   reference comes, so it is a plain row of tabs with the page's action at
   the end. The API stayed: one checked, taps and arrow keys pick, it wraps,
   swap brings a new set, the action button does the page's own thing. */
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
  const D = KD.mount(box.firstChild, { items, sel: 0, onPick: (i, it) => picks.push(it.id), centre: { icon: 'play', label: 'Stretch with me', short: 'Stretch with me', onTap: () => taps++ } });
  const el = box.firstChild;
  ck('the dial is gone: a row of tabs, one per choice, no rings, wedge or brown form', el.classList.contains('kdl-row') && el.querySelectorAll('.kdl-l').length === 7 && !el.querySelector('svg.kdl-svg,.kdl-hub,.kdl-dome,.kdl-tr'));
  ck('…a radio group: the chosen one is checked', el.getAttribute('role') === 'radiogroup' && el.querySelector('.kdl-l.on').textContent === 'All' && el.querySelector('.kdl-l.on').getAttribute('aria-checked') === 'true' && el.querySelectorAll('.kdl-l[aria-checked="true"]').length === 1);
  ck('every body part keeps its own drawn icon', ['Quads', 'Hamstrings', 'Calves', 'Glutes', 'Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'skill', 'all'].every((g) => /kdl-mi/.test(KD.mus(g)) && /class="f"/.test(KD.mus(g))) && KD.mus('Legs') === KD.mus('Quads') && KD.mus('Quads') !== KD.mus('Hamstrings'));
  ck('the page’s action is a button at the end of the row, in words', !el.querySelector('.kdl-c').hidden && /Stretch with me/.test(el.querySelector('.kdl-c').textContent));
  el.querySelectorAll('.kdl-l')[6].click();
  ck('tapping a tab picks it and says so once', D.sel() === 6 && picks.join() === 'core' && el.querySelector('.kdl-l.on').textContent === 'Core');
  el.querySelectorAll('.kdl-l')[6].click();
  ck('…tapping it again does not say it twice', picks.join() === 'core');
  el.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  ck('the arrow keys move along it, and it wraps round (Core, then All)', D.sel() === 0 && picks.join() === 'core,all');
  el.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  ck('…and back', D.sel() === 6);
  el.querySelector('.kdl-c').click();
  ck('the action button does the page’s own thing', taps === 1);
  D.swap(['Any', 'Barbell', 'Cable'].map((x) => ({ id: x, label: x })), 1, { icon: 'swap', label: 'Switch' });
  ck('a new set of tabs replaces the old one', [...el.querySelectorAll('.kdl-l')].map((x) => x.textContent).join() === 'Any,Barbell,Cable' && el.querySelector('.kdl-l.on').textContent === 'Barbell');
  ck('…a switch with no word stays hidden (Exercises has its own Muscle / Equipment switch)', el.querySelector('.kdl-c').hidden);
  ck('the card’s arrows: open and close drawings', /<svg/.test(KD.arrows(false)) && KD.arrows(true) !== KD.arrows(false));
  ck('no script errors', !errors.filter((x) => !/Not implemented/i.test(x)).length);
  if (errors.length) console.log(errors.slice(0, 3));
  let p = 0; R.forEach(([n, c]) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (c) p++; });
  console.log(p + '/' + R.length + ' dial');
  process.exit(p === R.length ? 0 : 1);
})();
