/* The body map looks like you (p30): female or male, your build from
   height, weight and age (or the body fat you entered), and it leans out
   as your weigh-ins come down. The figure is reshaped point by point, so
   every muscle stays a muscle you can tap. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
const num = (d) => (String(d).match(/-?\d*\.?\d+/g) || []).map(Number);
(async () => {
  await wait(1200);
  const doc = w.document, B = w.KovaBodyShape, svg = doc.getElementById('bodySvg');
  const outline = () => svg.querySelector('g path:not([data-hair])');
  /* the trunk's half-width at a height: the innermost outline point in that
     band (the arms are further out); the shoulders: the outermost */
  const pts = () => { const n = num(outline().getAttribute('d')); const o = []; for (let i = 0; i + 1 < n.length; i += 2) o.push([Math.abs(n[i] - 100), n[i + 1]]); return o; };
  const widthAt = (y0, y1) => { const v = pts().filter((p) => p[1] >= y0 && p[1] <= y1 && p[0] > 15).map((p) => p[0]); return y0 < 100 ? Math.max(...v) : Math.min(...v); };
  const muscles = svg.querySelectorAll('.m').length;
  ck('the module is on the page and the map has its muscles', !!B && muscles > 10);
  const d0 = outline().getAttribute('d');
  const set = (m, wl) => { w.KP.set('maint', Object.assign({ v: 1 }, m)); w.KP.set('wlog', wl || []); return B.apply(); };

  const man = set({ sex: 'm', kg: 78, hcm: 180, age: 30 });
  const manShoulder = widthAt(80, 90), manWaist = widthAt(195, 205), manHip = widthAt(225, 240);
  ck('an average man: about 20% body fat from height, weight and age, close to the original figure', Math.round(man.bf) === 20 && Math.abs(manWaist - 36) < 2 && !svg.querySelector('[data-hair]'));
  const woman = set({ sex: 'f', kg: 56, hcm: 168, age: 27 });
  ck('a woman: narrower shoulders, a smaller waist, wider hips, and hair', widthAt(80, 90) < manShoulder - 4 && widthAt(195, 205) < manWaist && widthAt(225, 240) > manHip * 0.97 && svg.querySelectorAll('[data-hair]').length === 2);
  const lean = widthAt(195, 205);
  set({ sex: 'f', kg: 95, hcm: 163, age: 40 });
  ck('a heavier build has a fuller waist', widthAt(195, 205) > lean + 6);
  ck('every muscle is still there to tap (nothing added, nothing lost)', svg.querySelectorAll('.m').length === muscles);
  ck('the note says what it is drawn from', /a woman, about \d+% body fat, from your height, weight and age/.test(doc.getElementById('bodyShapeNote').textContent));

  /* it follows your weigh-ins */
  w.KP.set('shape0', null);
  set({ sex: 'm', kg: 100, hcm: 178, age: 35 }, [{ t: Date.now() - 60 * 864e5, kg: 100 }]);
  const before = widthAt(195, 205);
  set({ sex: 'm', kg: 100, hcm: 178, age: 35 }, [{ t: Date.now() - 60 * 864e5, kg: 100 }, { t: Date.now(), kg: 90 }]);
  ck('as the weigh-ins come down, the figure leans out, and the note says by how much', widthAt(195, 205) < before - 2 && /Since you started: -\d+\.\d points, and the figure has leaned out with you/.test(doc.getElementById('bodyShapeNote').textContent));
  ck('body fat you entered is used instead of the estimate', Math.round(set({ sex: 'f', kg: 60, hcm: 165, age: 30, bf: 22 }).bf) === 22 && /the body fat you entered/.test(doc.getElementById('bodyShapeNote').textContent));
  w.KP.set('maint', null); w.KP.set('wlog', []); w.KP.set('onboard', null);
  B.apply();
  ck('with nothing known, the original figure, and it says what to add', outline().getAttribute('d') === d0 && /Add your height and weight/.test(doc.getElementById('bodyShapeNote').textContent));
  ck('no page errors', !errors.filter((e) => !/Not implemented/.test(e)).length);
  if (errors.length) console.log(errors.slice(0, 3));
  let fail = 0; for (const [n, ok] of R) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passing');
  process.exit(fail ? 1 : 0);
})();
