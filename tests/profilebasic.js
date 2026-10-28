/* The profile (p50b), after research into Strava, Fitbit, WHOOP,
   MyFitnessPal and Linear: sections of rows (Profile, Account, Watch,
   Preferences, Your data); each row opens its own page and every change is
   real:
     - name; age, sex, height, weight go into the calorie calculator's
       record (Fuel follows), weight into the weight log too; units switch;
     - email: not signed in, a contact email; signed in with a password, the
       sign-in email changes through a link to the new address (Firebase
       verifyBeforeUpdateEmail); with Google, it points to the Google account;
     - phone with its country code, marked not verified; password reset link;
       sign out; Download my data and Delete my account are the real ones. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

function boot(store) {
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  Object.keys(store || {}).forEach((k) => w.localStorage.setItem(k, store[k]));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}
(async () => {
  const w = boot({});
  await wait(900);
  const d = w.document, $ = (q) => d.querySelector(q);
  w.KP.set('me', { name: 'Sam Lee Jones', role: 'Designer', org: 'Acme', since: Date.now() });
  w.go('profile'); await wait(40);
  const rowTxt = (k) => ($('#s-profile [data-ed="' + k + '"]') || {}).textContent || '';
  const open = async (k) => { $('#s-profile [data-ed="' + k + '"]').click(); await wait(20); return $('#sheetIn .pf-ed'); };
  const put = (el, k, v) => { const n = el.querySelector('[data-in="' + k + '"]'); n.value = v; };
  const tap = async (el, k) => { el.querySelector('[data-pf="' + k + '"]').click(); await wait(30); };
  const msg = (el) => (el.querySelector('.pf-msg') || {}).textContent || '';
  ck('sections like the big apps: Profile, Account, Watch, Preferences, Your data', [...d.querySelectorAll('#s-profile .pf-sec')].map((x) => x.textContent).join() === 'Profile,Account,Watch,Preferences,Your data');
  ck('rows for name, age, sex, height, weight, email, phone, sign in, units, download, delete', ['name', 'age', 'sex', 'height', 'weight', 'email', 'phone', 'signin', 'units', 'export', 'delete'].every((k) => !!$('#s-profile [data-ed="' + k + '"]')));
  ck('the old extras are gone (post counts, linked platforms, shortcuts)', !$('#pfStats') && !$('#pfConn') && !$('#pfCards') && !/Posts|Projects|Connected accounts/.test($('#s-profile').textContent));

  let el = await open('name');
  ck('a row opens its own page with Back', !!el && $('#sheet').classList.contains('on') && el.querySelectorAll('[data-in]').length === 2 && el.querySelector('[data-in="first"]').value === 'Sam' && el.querySelector('[data-in="last"]').value === 'Lee Jones');
  put(el, 'first', 'Sam'); put(el, 'last', 'Lee'); await tap(el, 'save');
  let m = w.KP.get('me');
  ck('name: first and last saved, the full name kept for greetings', m.first === 'Sam' && m.last === 'Lee' && m.name === 'Sam Lee' && /Sam Lee/.test($('#pfName').textContent) && !$('#sheet').classList.contains('on'));

  el = await open('age'); put(el, 'age', '12'); await tap(el, 'save');
  ck('age out of range is refused, with why', /16 to 100/.test(msg(el)) && !(w.KP.get('maint') || {}).age);
  put(el, 'age', '30'); await tap(el, 'save');
  ck('age goes into the calorie calculator\'s record', w.KP.get('maint').age === 30 && /30/.test(rowTxt('age')));
  el = await open('sex'); await tap(el, 'f');
  ck('sex: one tap, saved for calories and body fat', w.KP.get('maint').sex === 'f' && /Female/.test(rowTxt('sex')));
  el = await open('height'); put(el, 'ft', '5'); put(el, 'in', '10'); await tap(el, 'save');
  ck('height in feet and inches, kept in cm', Math.abs(w.KP.get('maint').hcm - 177.8) < 0.2 && /5 ft 10 in/.test(rowTxt('height')));
  el = await open('weight'); put(el, 'w', '170'); await tap(el, 'save');
  const mt = w.KP.get('maint'), wl = w.KP.get('wlog') || [];
  ck('weight in pounds, kept in kg, and added to the weight log (Fuel follows)', Math.abs(mt.kg - 77.11) < 0.05 && wl.length >= 1 && Math.abs(wl[wl.length - 1].kg - 77.11) < 0.05 && /170 lb/.test(rowTxt('weight')));
  el = await open('units'); await tap(el, 'kg');
  ck('units switch to metric: the same body shown in cm and kg', w.KP.get('maint').unit === 'kg' && /178 cm/.test(rowTxt('height')) && /77\.1 kg/.test(rowTxt('weight')) && /Metric/.test(rowTxt('units')) && w.localStorage.getItem('kova.units') === 'metric');

  el = await open('email'); put(el, 'email', 'nope'); await tap(el, 'save');
  ck('not signed in: a wrong email is refused', /does not look right/.test(msg(el)));
  put(el, 'email', 'sam@example.com'); await tap(el, 'save');
  ck('not signed in: the email is saved as how to reach you, and it offers sign in', w.KP.get('me').email === 'sam@example.com' && /sam@example\.com/.test(rowTxt('email')));
  el = await open('phone'); put(el, 'phone', '123'); await tap(el, 'save');
  ck('a phone without a real length is refused, saying to add the country code', /country code/.test(msg(el)) && !w.KP.get('me').phone);
  put(el, 'phone', '(555) 123-4567'); await tap(el, 'save');
  ck('phone: a US number gets +1, shown neatly and marked not verified', w.KP.get('me').phone === '+15551234567' && /\+1 555 123 4567/.test(rowTxt('phone')) && /Not verified/.test(rowTxt('phone')));
  el = await open('phone'); await tap(el, 'clear');
  ck('the phone number can be removed', w.KP.get('me').phone === '');

  // signed in with email and password
  const CA = w.KovaCloudAuth, calls = { change: [], reset: 0, out: 0 };
  let failNext = null;
  CA.status = () => ({ signedIn: true, anon: false, email: 'sam@old.com', provider: 'password' });
  CA.changeEmail = (e) => { calls.change.push(e); if (failNext) { const c = failNext; failNext = null; return Promise.reject({ code: c }); } return Promise.resolve(); };
  CA.resetPassword = () => { calls.reset++; return Promise.resolve(); };
  CA.signOut = () => { calls.out++; };
  w.go('home'); await wait(10); w.go('profile'); await wait(30);
  ck('signed in: the email row is the sign-in email, with Password, Signed in with and Sign out', /sam@old\.com/.test(rowTxt('email')) && !!$('#s-profile [data-ed="password"]') && /Signed in with\s*Email/.test($('#pfAccount').textContent) && !!$('#s-profile [data-ed="signout"]'));
  el = await open('email'); put(el, 'email', 'sam@new.com'); failNext = 'auth/requires-recent-login'; await tap(el, 'save'); await wait(20);
  ck('changing it asks Firebase to send a link to the new address; a stale sign-in says what to do', calls.change[0] === 'sam@new.com' && /sign in again/.test(msg(el)));
  await tap(el, 'save'); await wait(20);
  ck('…and once sent, it says to open the link; the row shows the change is waiting', calls.change.length === 2 && /Link sent to sam@new\.com/.test(msg(el)) && w.KP.get('me').pendingEmail === 'sam@new.com' && /Change waiting/.test(rowTxt('email')));
  el = await open('password'); await tap(el, 'save'); await wait(20);
  ck('password: a reset link to the sign-in email', calls.reset === 1 && /Link sent/.test(msg(el)));
  el = await open('signout'); await tap(el, 'go');
  ck('sign out asks first, then signs out', calls.out === 1);
  CA.status = () => ({ signedIn: true, anon: false, email: 'sam@gmail.com', provider: 'google.com' });
  w.go('home'); await wait(10); w.go('profile'); await wait(30);
  el = await open('email');
  ck('signed in with Google: the email is Google\'s, with a way to change it there (no Password row)', /Google account/.test(el.textContent) && /myaccount\.google\.com/.test(el.innerHTML) && !$('#s-profile [data-ed="password"]'));
  try { w.closeSheet(); } catch (e) {}

  const pv = { ex: 0, del: 0 }; w.KovaPrivacy = Object.assign(w.KovaPrivacy || {}, { exportAll: () => { pv.ex++; }, startDelete: () => { pv.del++; } });
  await open('export'); await open('delete');
  ck('Download my data and Delete my account are the real ones', pv.ex === 1 && pv.del === 1);
  ck('no watch: it says so, with Connect', /No watch connected/.test($('#pfWatch').textContent) && /Connect/.test($('#pfWatchBtn').textContent));
  w.go('settings'); await wait(30);
  ck('Settings shows whether this device is backed up', !!$('#s-settings #pfSync') && /backed up|Backed up|Backing up|Offline|not available/.test($('#pfSync').textContent));
  ck('no page errors', errors.length === 0 || (console.error(errors.slice(0, 5)), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
