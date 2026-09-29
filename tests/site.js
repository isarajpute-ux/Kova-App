/* The page phones actually download (build/site.mjs -> dist/): minified,
   under 500 KB compressed, no render-blocking PDF reader, and still the same
   app: Home, the wheel pop-ups and Work OS's AI team (which arrives after
   the first screen) all work from the built page. */
const fs = require('fs');
const vm = require('vm');
const zlib = require('zlib');
const { JSDOM, VirtualConsole } = require('jsdom');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');

(async () => {
  const { minifyPage, split } = await import(__dirname + '/../build/site.mjs');
  const { page: min } = minifyPage(src);
  const { page, files } = split(min);
  const inline = [...page.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let bad = 0; inline.forEach((c) => { try { new vm.Script(c); } catch (e) { bad++; console.error(e.message); } });
  ck('every script in the built page still parses (' + inline.length + ')', bad === 0 && inline.length > 50);
  const br = zlib.brotliCompressSync(Buffer.from(page), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  ck('the first load is under 500 KB compressed (' + Math.round(br / 1024) + ' KB)', br < 500 * 1024);
  const head = page.slice(0, page.indexOf('</head>'));
  const upfront = [...head.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  ck('only sign-in and sync (Firebase) load before the first screen: the PDF reader and push load when used',
    upfront.every((u) => /firebasejs\/[\d.]+\/firebase-(app|auth|database|analytics)-compat\.js$|googletagmanager/.test(u)) && upfront.length === 5 && /window\.KovaPdf=/.test(page));
  ck('the AI team and Traction are separate files, loaded after the first screen', Object.keys(files).length === 4 && /id="kova-lazy"/.test(page) && !/id="p08-crew">/.test(page));
  const crewLink = page.indexOf('<link rel="stylesheet" id="p08-crew"'), help = page.indexOf('<style id="p08-help">');
  ck('their styles keep their place in the cascade (the <link> sits where the <style> was)', crewLink > 0 && crewLink < help);

  const vc = new VirtualConsole();
  const errs = []; vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(page, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
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
  w.eval(inline.join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(600);
  const d = w.document;
  ck('Home paints from the built page: the four boxes of the week', d.querySelectorAll('#wheelBoxes [data-wp]').length === 4);
  d.querySelector('#wheelBoxes [data-wp="sleep"]').click(); await wait(50);
  ck('a box opens its pop-up', d.getElementById('sheet').classList.contains('on') && /eadiness/.test(d.getElementById('sheetIn').textContent));
  ck('before the AI team arrives nothing breaks: callers check it is there', !w.KovaCrew && typeof w.KovaAgent === 'object');
  for (const f of Object.keys(files).filter((f) => f.endsWith('.js'))) w.eval(files[f]);
  await wait(400);
  ck('when it arrives the AI team starts itself', w.KovaCrew && typeof w.KovaCrew.emps === 'function' && w.KovaTraction && w.__workTeam && w.__workTeam.draw === w.KovaCrew.paint);
  ck('no errors while booting the built page', errs.length === 0 || (console.error(errs.slice(0, 3)), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
