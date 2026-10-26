/* Recipe photos live in Kova (p28): opening a recipe used to load its photo
   from images.unsplash.com, which sends your address to a third party (an
   App Store privacy flag). Now:
     - no Unsplash address is left in the app or its offline cache rules;
     - every recipe photo is in food/ in the three sizes the screens use
       (400 and 800 px squares for cards, the whole photo at 1200 px for
       the recipe page), as real WebP images;
     - the cards ask for the square sizes, the recipe page for the whole one;
     - the build and the phone app both carry the folder, the offline cache
       keeps them, and the photographers are still credited. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(root + '/index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  ck('no Unsplash address is left in the app', !/unsplash\.com/i.test(html));
  const ids = [...new Set([...html.matchAll(/img:'(food\/photo-[0-9a-f-]+)'/g)].map((m) => m[1]))];
  const sizes = ['s400', 's800', 'full'];
  const missing = []; const notWebp = [];
  ids.forEach((id) => sizes.forEach((s) => {
    const f = root + '/' + id + '-' + s + '.webp';
    if (!fs.existsSync(f)) return missing.push(id + '-' + s);
    const b = fs.readFileSync(f); if (b.slice(0, 4).toString() !== 'RIFF' || b.slice(8, 12).toString() !== 'WEBP') notWebp.push(id + '-' + s);
  }));
  ck('all ' + ids.length + ' recipe photos are in Kova in 3 sizes (' + (missing.join(', ') || 'none missing') + ')', ids.length === 25 && !missing.length);
  ck('and they are real WebP images', !notWebp.length);
  const big = ids.map((id) => fs.statSync(root + '/' + id + '-full.webp').size).sort((a, b) => b - a)[0];
  ck('none is heavy: the largest whole photo is ' + Math.round(big / 1024) + ' KB', big < 450 * 1024);

  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: new VirtualConsole() });
  const w = dom.window; w.localStorage.setItem('kova.auth.skipped', '1');
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  await wait(800);
  const r = w.__RECIPES.find((x) => x.img);
  const card = w.KovaFood.art(r, '120px', ''), full = w.KovaFood.art(r, '', 'full');
  ck('a card asks for the 400 px square, and 800 px on sharp screens', card.includes('src="' + r.img + '-s400.webp"') && card.includes(r.img + '-s800.webp 800w'));
  ck('the recipe page shows the whole photo, uncropped', full.includes(r.img + '-full.webp') && !/unsplash/.test(card + full));
  ck('a broken photo still falls back to the drawn plate', /onerror="this.remove\(\)"/.test(card));

  const site = fs.readFileSync(root + '/build/site.mjs', 'utf8'), cw = fs.readFileSync(root + '/native/scripts/copy-web.mjs', 'utf8');
  ck('the site build publishes food/', /cpSync\(join\(root, 'food'\), join\(out, 'food'\), \{ recursive: true \}\)/.test(site));
  ck('the iPhone and Android app carry it too', /cpSync\(join\(here, '\.\.', '\.\.', 'food'\), join\(www, 'food'\), \{ recursive: true \}\)/.test(cw));
  const sw = fs.readFileSync(root + '/sw.js', 'utf8');
  ck('the offline cache keeps them, and no longer mentions Unsplash in its rules', /food\\\/photo-\[0-9a-f-\]\+-\(s400\|s800\|full\)\\\.webp/.test(sw) && !/images\\\.unsplash/.test(sw));
  ck('the photographers are still credited', /Unsplash License/.test(fs.readFileSync(root + '/licenses.html', 'utf8')) && /does not contact Unsplash/.test(fs.readFileSync(root + '/licenses.html', 'utf8')));
  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
