/* KovaPrivacy (src/p08_account.js): Settings rows, Export my data,
   Delete my account (both steps, server first, phone second), the
   privacy policy, and the analytics filter that keeps health values out
   of every event. Runs the real page in jsdom with a stubbed Firebase
   and a stubbed api. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const policy = fs.readFileSync(__dirname + '/../privacy.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const user = opts.signedIn ? { uid: 'u1', email: 'a@b.c', getIdToken: () => Promise.resolve('tok') } : null;
  let signedOut = 0;
  const auth = { get currentUser() { return user; }, onAuthStateChanged(cb) { cb(user); }, signOut: () => { signedOut++; return Promise.resolve(); } };
  const events = [];
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent(n, p) { events.push([n, p]); }, setUserId() {} }) };
  const reqs = [];
  w.fetch = (url, o = {}) => {
    const u = String(url);
    reqs.push({ url: u, o });
    if (/privacy\.html$/.test(u)) return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(policy) });
    if (/\/account\/export$/.test(u)) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ kova_export: 1, synced: { store: { meals: 3 } }, connectedAccounts: [] }) });
    if (/\/account\/delete$/.test(u)) {
      const st = opts.deleteStatus || 200;
      return Promise.resolve({ ok: st < 400, status: st, json: () => Promise.resolve(st < 400 ? { ok: true, problems: [] } : { ok: false, problems: ['files: timeout'] }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  };
  const downloads = [];
  w.URL.createObjectURL = (b) => { downloads.push(b); return 'blob:x'; };
  w.URL.revokeObjectURL = () => {};
  w.localStorage.setItem('kova_mode_v1', 'sample');
  w.localStorage.setItem('kova_meals_v1', JSON.stringify([{ n: 'oats' }]));
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  return { w, doc: w.document, reqs, downloads, events, signedOut: () => signedOut };
}

(async () => {
  // ---------- rows ----------
  const A = boot({ signedIn: true });
  await wait(500);
  const { w, doc } = A;
  ck('Settings has Export, What Kova reads, Privacy policy, Delete', ['kpvExport', 'kpvReads', 'kpvPolicy', 'kpvDelete'].every((id) => !!doc.getElementById(id)));
  ck('the old "Delete all data" placeholder is gone', !doc.querySelector('#s-settings [data-toast^="This clears everything"]'));
  ck('the rows sit under Data & privacy', (() => { const e = doc.getElementById('kpvExport'); let p = e.previousElementSibling; while (p && !p.classList.contains('sec-h')) p = p.previousElementSibling; return p && /Data & privacy/.test(p.textContent); })());

  // ---------- export ----------
  await w.KovaPrivacy.exportAll();
  const pkg = JSON.parse(await A.downloads[0].text());
  ck('export downloads one file', A.downloads.length === 1);
  ck('it has everything on this phone', pkg.onThisDevice.kova_meals_v1 && pkg.onThisDevice.kova_meals_v1[0].n === 'oats');
  ck('and everything on the server, fetched with the ID token', pkg.server && pkg.server.synced.store.meals === 3 &&
    A.reqs.some((r) => /\/api\/account\/export$/.test(r.url) && r.o.headers.Authorization === 'Bearer tok'));

  // ---------- policy ----------
  w.KovaPrivacy.openPolicy(); await wait(80);
  const pol = doc.querySelector('#sheetIn .kpv-doc');
  ck('the privacy policy opens in the app', !!pol && /Privacy Policy/.test(pol.textContent) && /Sell your data/.test(pol.textContent));
  ck('the policy says health data never goes to analytics or ads', /never sent to analytics/i.test(policy) && /never used for ads/i.test(policy));
  w.KovaPrivacy.openReads(); await wait(30);
  ck('"What Kova reads and why" lists every type with its reason', doc.querySelectorAll('#sheetIn .kpv-row').length >= 8);

  // ---------- delete, signed in, server ok ----------
  doc.getElementById('kpvDelete').click(); await wait(30);
  let s = doc.querySelector('#sheetIn .kpv');
  ck('step 1 says exactly what goes', /Your Kova account/.test(s.textContent) && /Connected accounts/.test(s.textContent) && /Your files/.test(s.textContent));
  ck('step 1 offers an export first', !!s.querySelector('[data-kp="export"]'));
  s.querySelector('[data-kp="next"]').click(); await wait(30);
  s = doc.querySelector('#sheetIn .kpv');
  const go = s.querySelector('[data-kp="go"]'), inp = doc.getElementById('kpvWord');
  ck('step 2 needs DELETE typed', go.disabled === true);
  inp.value = 'delete'; inp.dispatchEvent(new w.Event('input'));
  ck('lower case is not enough', go.disabled === true);
  inp.value = 'DELETE'; inp.dispatchEvent(new w.Event('input'));
  ck('DELETE unlocks the button', go.disabled === false);
  go.click(); await wait(150);
  const dr = A.reqs.find((r) => /\/api\/account\/delete$/.test(r.url));
  ck('the server delete is called with the ID token and the confirm word', dr && dr.o.headers.Authorization === 'Bearer tok' && JSON.parse(dr.o.body).confirm === 'DELETE');
  ck('then this phone is cleared', w.localStorage.getItem('kova_meals_v1') === null);
  ck('and it signs out', A.signedOut() === 1);
  ck('it says it is done', /Deleted/.test(doc.querySelector('#sheetIn .kpv').textContent));

  // ---------- delete, server fails: nothing removed ----------
  const B = boot({ signedIn: true, deleteStatus: 500 });
  await wait(500);
  let err = null;
  try { await B.w.KovaPrivacy._run(true); } catch (e) { err = e; }
  ck('if the server fails, the phone keeps its data', !!err && B.w.localStorage.getItem('kova_meals_v1') !== null && B.signedOut() === 0);
  ck('and the reason is shown plainly', err && /could not be deleted|refused/.test(err.message));

  // ---------- delete, never signed in ----------
  const C = boot({ signedIn: false });
  await wait(500);
  C.doc.getElementById('kpvDelete').click(); await wait(30);
  ck('signed out, step 1 says only this phone is cleared', /nothing is stored on a server/.test(C.doc.querySelector('#sheetIn .kpv').textContent));
  await C.w.KovaPrivacy._run(false);
  ck('signed out, no server call is made', !C.reqs.some((r) => /account\/delete/.test(r.url)) && C.w.localStorage.getItem('kova_meals_v1') === null);

  // ---------- analytics never carries health values ----------
  const clean = w.KovaAnalytics.clean({ kcal: 540, protein: 32, hr: 61, weight: 70, slot: 'lunch', src: 'photo', screen_name: 'fuel' });
  ck('health values are dropped from analytics events', clean.kcal === undefined && clean.protein === undefined && clean.hr === undefined && clean.weight === undefined);
  ck('ordinary usage fields still go through', clean.slot === 'lunch' && clean.src === 'photo' && clean.screen_name === 'fuel');
  ck('log_food no longer sends calories or protein', !/track\('log_food',\s*\{\s*kcal/.test(html));

  const failed = R.filter((r) => !r[1]);
  R.forEach((r) => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
