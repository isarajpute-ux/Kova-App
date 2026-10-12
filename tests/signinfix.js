/* Sign-in on the live link (p25):
     - Google or Apple refused (the site is not on Firebase's allow list)
       says so on the welcome screen instead of a pop-up that flashes
       and leaves a blank screen;
     - signing in from the sign-in sheet goes on to the setup questions,
       not past them;
     - the age step takes the full date of birth and counts the birthday:
       sixteen tomorrow is fifteen today. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kovactive.vercel.app/', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  const auth = { currentUser: null, cbs: [], onAuthStateChanged(cb) { this.cbs.push(cb); cb(null); }, signOut: () => Promise.resolve(),
    signInAnonymously: () => Promise.reject(new Error('off')), setPersistence: () => Promise.resolve(),
    signInWithPopup: () => Promise.reject({ code: 'auth/unauthorized-domain', message: 'unauthorized' }) };
  const A = () => auth; A.GoogleAuthProvider = function () { this.addScope = () => {}; this.setCustomParameters = () => {}; }; A.OAuthProvider = A.GoogleAuthProvider;
  w.firebase = { initializeApp() {}, apps: [{}], auth: A,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null, exists: () => false }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  w.localStorage.setItem('kova.consent', JSON.stringify({ a: false, at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document, auth };
}
const text = (doc) => (doc.getElementById('authInner') || { textContent: '' }).textContent;
function dob(w, doc, d, m, y) {
  [['afDay', d], ['afMonth', m], ['afYear', y]].forEach(([id, v]) => { const el = doc.getElementById(id); el.value = String(v); el.dispatchEvent(new w.Event('change')); });
}

(async () => {
  /* Google refused */
  const A = boot();
  await wait(400);
  ck('the welcome screen is up and the sign-in sheet is not stacked on it', !!A.doc.getElementById('afEmail') && A.doc.getElementById('kova-auth-modal').style.display !== 'flex');
  ck('the welcome screen has a place for sign-in problems', !!A.doc.getElementById('afErr'));
  A.doc.getElementById('authGoogle').click(); await wait(60);
  ck('the age step asks day, month and year', !!A.doc.getElementById('afDay') && !!A.doc.getElementById('afMonth') && !!A.doc.getElementById('afYear'));
  ck('Continue waits for all three', A.doc.getElementById('afAgeGo').disabled);
  dob(A.w, A.doc, 31, 1, 1990);
  ck('31 February is refused, and it says why', A.doc.getElementById('afAgeGo').disabled && /February 1990 has no day 31/.test(A.doc.getElementById('afAgeErr').textContent));
  dob(A.w, A.doc, 29, 1, 1992);
  ck('29 February in a leap year is a real date', !A.doc.getElementById('afAgeGo').disabled);
  A.doc.getElementById('afAgeGo').click(); await wait(120);
  const err = (A.doc.getElementById('afErr') || { textContent: '' }).textContent;
  ck('Google refused: the welcome screen says so, naming the address', /Google sign-in is not switched on for kovactive\.vercel\.app/.test(err));
  ck('and the way forward is still on screen', !!A.doc.getElementById('afEmail') && !!A.doc.getElementById('authSkip'));
  ck('only the yes is kept, never the birthday', /"at":\d+/.test(A.w.localStorage.getItem('kova.age16') || '') && !/1992|29/.test((A.w.localStorage.getItem('kova.age16') || '').replace(/"at":\d+/, '')));

  /* sixteen tomorrow */
  const B = boot();
  await wait(400);
  B.doc.getElementById('authSkip').click(); await wait(60);
  const t = new Date(Date.now() + 864e5);
  dob(B.w, B.doc, t.getDate(), t.getMonth(), t.getFullYear() - 16);
  B.doc.getElementById('afAgeGo').click(); await wait(60);
  ck('turning 16 tomorrow is still under 16 today: stopped, nothing kept', /16 and over/.test(text(B.doc)) && !B.w.localStorage.getItem('kova.age16') && !B.doc.getElementById('afYear'));
  const C = boot();
  await wait(400);
  C.doc.getElementById('authSkip').click(); await wait(60);
  const s = new Date();
  dob(C.w, C.doc, s.getDate(), s.getMonth(), s.getFullYear() - 16);
  C.doc.getElementById('afAgeGo').click(); await wait(60);
  ck('16 today is let in', !!C.w.localStorage.getItem('kova.age16'));

  /* signed in from the sheet: the setup questions come next */
  const D = boot();
  await wait(400);
  D.auth.currentUser = { uid: 'u1', email: 'sam@example.com', isAnonymous: false, getIdToken: () => Promise.resolve('t') };
  D.auth.cbs.forEach((cb) => cb(D.auth.currentUser));
  await wait(120);
  ck('signing in goes on to the setup questions instead of skipping them', /What do you want Kova for/.test(text(D.doc)));
  D.auth.cbs.forEach((cb) => cb(D.auth.currentUser));
  await wait(60);
  ck('a second "signed in" does not restart the questions', /What do you want Kova for/.test(text(D.doc)));

  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
