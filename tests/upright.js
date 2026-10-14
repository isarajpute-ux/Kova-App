/* Kova stays upright (p28), like the phone's home screen:
     - the installed app asks for portrait (Android honours it) and, when it
       runs from the home screen, locks the screen upright where it can;
     - iPhones ignore both, so a phone on its side gets a plain "turn your
       phone upright" screen instead of a squashed sideways layout;
     - tablets and computers are never covered: the rule only matches a
       short, touch-only screen lying on its side;
     - the screen reads well in dark, soft light and light glass. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function boot(standalone) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: new VirtualConsole() });
  const w = dom.window, locked = [];
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.matchMedia = (q) => ({ matches: standalone && /standalone/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(w.screen, 'orientation', { configurable: true, value: { lock: (o) => { locked.push(o); return Promise.resolve(); } } });
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document, locked };
}
(async () => {
  const man = JSON.parse(fs.readFileSync(__dirname + '/../manifest.webmanifest', 'utf8'));
  ck('the installed app asks for portrait and opens like an app', man.orientation === 'portrait' && man.display === 'standalone');
  const A = boot(true); await wait(200);
  ck('from the home screen it locks the screen upright', A.locked[0] === 'portrait');
  const u = A.doc.getElementById('kUpright');
  ck('the "turn your phone upright" screen is there, and read out when it shows', u && u.getAttribute('role') === 'alert' && /Turn your phone upright/.test(u.textContent));
  const B = boot(false); await wait(200);
  ck('in a browser tab it does not try to lock anything', B.locked.length === 0);
  const css = fs.readFileSync(__dirname + '/../src/p08_upright.css', 'utf8');
  ck('it only covers a phone on its side (short, touch-only, landscape), never a tablet or computer', /@media \(orientation:landscape\) and \(max-height:500px\) and \(pointer:coarse\)/.test(css) && /^\.k-upright\{display:none\}/m.test(css));
  ck('it reads well in light glass (dark words on the light page)', /body\.light-mode \.k-upright\{background:#E7E5E0;color:#1C1A17\}/.test(css));
  ck('it is in the app and loads after the first screen', /<script id="p08-upright">/.test(html) && /'p08-upright'\]/.test(fs.readFileSync(__dirname + '/../build/site.mjs', 'utf8')));
  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
