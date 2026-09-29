/* The hidden Launch check (src/p08_launch.js) and what /api/ping reports
   (functions/env.js capabilities): one row per dependency, green when set,
   red with the exact thing to set and where, never a key's value. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const env = require(__dirname + '/../functions/env.js');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot(pingAnswer) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  const calls = [];
  w.fetch = (u) => { calls.push(String(u));
    if (/\/ping$/.test(String(u))) return pingAnswer ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(pingAnswer) }) : Promise.reject(new Error('offline'));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }); };
  w.KOVA_RC = { web: 'rcb_public_web_1234567890', ios: '', android: '', entitlement: 'kova_pro' };
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document, calls };
}

(async () => {
  // ---------- the server side ----------
  const has = env.capabilities({ ANTHROPIC_API_KEY: 'sk-ant-secret-value', GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 's', FDC_API_KEY: 'DEMO_KEY' });
  const flat = JSON.stringify(has);
  ck('/api/ping says which keys are set as yes/no only, never a value', has.ai === true && has.oauth.google === true && has.oauth.x === false && has.firebaseAdmin === false && !/secret-value|"g"|"s"/.test(flat) && /^[{}\[\]":,a-zA-Z]+$/.test(flat));
  ck('the shared USDA DEMO_KEY does not count as your own key', has.usda === false);
  const api = fs.readFileSync(__dirname + '/../functions/api.js', 'utf8');
  ck('/api/ping returns them', /path === '\/ping'\) return res\.json\(\{ ok: true, service: 'kova-api', has: cfg\.has/.test(api));

  // ---------- the app ----------
  const A = boot({ ok: true, service: 'kova-api', has });
  await wait(600);
  const d = A.doc;
  A.w.go('settings'); await wait(50);
  const ver = [...d.querySelectorAll('#s-settings .list-item')].find((r) => (r.querySelector('.li-name') || {}).textContent === 'Version');
  for (let i = 0; i < 6; i++) ver.click();
  await wait(50);
  ck('six taps on Version do nothing special (hidden from normal use)', !d.querySelector('#sheetIn .kla'));
  ver.click(); await wait(300);
  const box = d.querySelector('#sheetIn .kla');
  ck('the 7th tap opens the Launch check', box && /Launch check/.test(box.textContent));
  const rowOf = (name) => [...box.querySelectorAll('.kla-r')].find((r) => r.querySelector('b').textContent.startsWith(name));
  ck('the server shows as reachable', rowOf('Server reachable').classList.contains('ok'));
  ck('a key the server has is green', rowOf('AI answers').classList.contains('ok') && rowOf('Google').classList.contains('ok'));
  const adm = rowOf('Database, delete');
  ck('a missing required key is red and names exactly what to set and where', adm.classList.contains('bad') && /FIREBASE_CLIENT_EMAIL \+ FIREBASE_PRIVATE_KEY/.test(adm.textContent) && /Netlify/.test(adm.textContent) && /Service accounts/.test(adm.textContent));
  ck('app-side keys too: RevenueCat iOS and the web push key', rowOf('Payments on iPhone').classList.contains('bad') && /KOVA_RC\.ios/.test(rowOf('Payments on iPhone').textContent) && rowOf('Web push key').classList.contains('bad') && /KOVA_FB_VAPID/.test(rowOf('Web push key').textContent));
  ck('a set key shows as set, and its value appears nowhere', rowOf('Payments on the web').classList.contains('ok') && !/rcb_public_web_1234567890/.test(d.getElementById('sheet').innerHTML));
  ck('optional ones (email, USDA key, other sign-ins) are marked optional, not missing', rowOf('Email').classList.contains('opt') && rowOf('USDA').classList.contains('opt') && rowOf('X').classList.contains('opt'));
  ck('the Health plugin row says it is only in the app on the web', rowOf('Apple Health').classList.contains('na'));
  ck('every red row says what to set', [...box.querySelectorAll('.kla-r.bad')].every((r) => r.querySelector('.kla-t span') && r.querySelector('.kla-t span').textContent.length > 15));

  const B = boot(null);
  await wait(600);
  B.w.go('settings'); await wait(50);
  await B.w.KovaLaunch.open(); await wait(50);
  const bx = B.doc.querySelector('#sheetIn .kla');
  const srv = [...bx.querySelectorAll('.kla-r')].find((r) => /Server reachable/.test(r.textContent));
  ck('with no server it says so, and how to fix it', srv.classList.contains('bad') && /Deploy the site on Netlify/.test(srv.textContent) && [...bx.querySelectorAll('.kla-r')].filter((r) => /Needs the server first/.test(r.textContent)).length >= 5);

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
