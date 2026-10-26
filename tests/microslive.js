/* With your own data (live mode) the Fuel screen hides its sample-only
   cards. The vitamins and minerals card counts your real log, so it must
   stay (p28: it was hidden along with the samples, so the Micronutrients
   card and its tour stop never showed). */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: new VirtualConsole() });
const w = dom.window;
w.localStorage.setItem('kova.auth.skipped', '1');
w.localStorage.setItem('kova_mode_v1', 'live');
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
(async () => {
  await wait(1500);
  const doc = w.document;
  w.KovaFuel.add({ src: 'usda', kcal: 105, p: 1, c: 27, f: 0, m: { fib: 3.1, k: 422, c: 10.3, a: 3, vk: 0.5, zn: 0.2 }, items: [{ n: 'Banana' }] });
  w.go('fuel'); await wait(300);
  if (w.KovaMicros) w.KovaMicros.paint(); await wait(50);
  const g = doc.getElementById('microGrid');
  const shown = (el) => { for (let x = el; x && x !== doc.body; x = x.parentElement) { if (w.getComputedStyle(x).display === 'none' || x.hasAttribute('data-demo')) return false; } return true; };
  ck('own data: the vitamins card is not marked sample-only', g && !g.hasAttribute('data-demo'));
  ck('own data: it is shown, with its heading', shown(g) && (!g.previousElementSibling || !g.previousElementSibling.hasAttribute('data-demo')));
  ck('it counts the logged banana, zinc and vitamins A and K included', /Potassium/.test(g.textContent) && /Zinc/.test(g.textContent) && /Vitamin A/.test(g.textContent) && /Vitamin K/.test(g.textContent));
  ck('the sample-only Fuel cards are still hidden (energy curve)', doc.getElementById('nrgCard').hasAttribute('data-demo'));
  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
