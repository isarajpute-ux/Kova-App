/* The email and password screen (src/p08_signin.js + KovaCloudAuth in
   index.html): two clear modes, a reset mode, a tidy email with "Did you
   mean", Show/Hide, the new-password rules and the second box, and errors
   that carry the next step as a button. Firebase is faked. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (code) => Promise.reject(Object.assign(new Error(code), { code }));

function boot() {
  const vc = new VirtualConsole(); const errors = [];
  vc.on('jsdomError', (e) => errors.push(String(e && (e.message || e))));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const calls = [];
  let cb = null;
  const auth = {
    currentUser: null,
    onAuthStateChanged(f) { cb = f; f(null); },
    signOut: () => Promise.resolve(),
    signInWithEmailAndPassword: (e, p) => { calls.push(['in', e, p]); return auth._in(e, p); },
    createUserWithEmailAndPassword: (e, p) => { calls.push(['up', e, p]); return auth._up(e, p); },
    sendPasswordResetEmail: (e) => { calls.push(['reset', e]); return Promise.resolve(); },
    signInAnonymously: () => Promise.resolve(),
    _in: () => fail('auth/invalid-credential'),
    _up: () => fail('auth/email-already-in-use')
  };
  const authFn = () => auth;
  authFn.EmailAuthProvider = { credential: (e, p) => ({ e, p }) };
  authFn.GoogleAuthProvider = function () {};
  w.firebase = { initializeApp() {}, apps: [{}], auth: authFn,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document, auth, calls, errors, fire: (u) => cb && cb(u) };
}

(async () => {
  const { w, doc, auth, calls, errors } = boot();
  await wait(600);
  const $ = (id) => doc.getElementById(id);
  const msg = () => ($('kova-auth-err').hidden ? '' : $('kova-auth-err').textContent);
  const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input')); };
  const toasts = []; w.toast = (m) => toasts.push(m);

  w.KovaCloudAuth.open({ mode: 'in' }); await wait(10);
  ck('the screen opens on Sign in, with Sign in and Create account as two clear tabs', $('kova-auth-modal').style.display === 'flex'
    && /Welcome back/.test($('ksiH').textContent) && doc.querySelector('.ksi-seg [data-m="in"]').getAttribute('aria-selected') === 'true');
  ck('the email box has autocorrect, autocapitalise and spellcheck off', $('kova-email').getAttribute('autocorrect') === 'off' && $('kova-email').getAttribute('autocapitalize') === 'off' && $('kova-email').getAttribute('spellcheck') === 'false');
  type('kova-email', ' Isa.Ratu@GMIAL.com ');
  ck('a misspelt domain gets "Did you mean", with the address tidied', /Did you mean isa\.ratu@gmail\.com\?/.test($('ksiTip').textContent));
  $('ksiFix').click();
  ck('tapping the suggestion fixes it', $('kova-email').value === 'isa.ratu@gmail.com');
  ck('the old "isa.gmail.com" kind of mangling cannot happen: the address is only trimmed and lower-cased', w.KovaSignIn.clean(' Isa.Ratu@Gmail.com ') === 'isa.ratu@gmail.com' && w.KovaSignIn.suggest('isa.ratu@gmail.com') === '');
  $('ksiEye').click();
  ck('Show reveals the password and says Hide', $('kova-password').type === 'text' && $('ksiEye').textContent === 'Hide' && $('ksiEye').getAttribute('aria-pressed') === 'true');
  $('ksiEye').click();

  $('kova-auth-go').click(); await wait(5);
  ck('no password: it asks for it, nothing is sent', /Type your password/.test(msg()) && calls.length === 0);
  type('kova-password', 'wrongpass1');
  $('kova-auth-go').click(); await wait(20);
  ck('a wrong password names the exact address and offers both ways forward', /does not match an account for isa\.ratu@gmail\.com/.test(msg())
    && [...$('kova-auth-err').querySelectorAll('button')].map((b) => b.textContent).join('|') === 'Reset password|New here? Create an account');
  ck('it signed in with exactly that address', calls[0][0] === 'in' && calls[0][1] === 'isa.ratu@gmail.com');
  $('kova-auth-err').querySelectorAll('button')[1].click(); await wait(5);
  ck('"Create an account" switches to that tab and keeps the email', /Create your account/.test($('ksiH').textContent) && $('kova-email').value === 'isa.ratu@gmail.com' && !!$('kova-password2'));

  /* create account */
  type('kova-password', 'short');
  ck('the rules tick off as you type', doc.querySelectorAll('#ksiRules li.ok').length === 0);
  type('kova-password', 'kova2026');
  ck('8 characters with a letter and a number ticks both', doc.querySelectorAll('#ksiRules li.ok').length === 2);
  type('kova-password2', 'kova2027');
  ck('a second box that does not match says so', /do not match yet/.test($('ksiMatch').textContent));
  $('kova-auth-go').click(); await wait(5);
  ck('and creating is held back until they match', /two passwords do not match/.test(msg()) && calls.filter((c) => c[0] === 'up').length === 0);
  type('kova-password', 'password'); type('kova-password2', 'password');
  $('kova-auth-go').click(); await wait(5);
  ck('a password without a number is turned down before sending', /letter and a number/.test(msg()) && calls.filter((c) => c[0] === 'up').length === 0);
  type('kova-password', 'kova2026'); type('kova-password2', 'kova2026');
  ck('matching passwords say so', /Passwords match/.test($('ksiMatch').textContent));
  $('kova-auth-go').click(); await wait(20);
  ck('an email that already has an account says so, with Sign in instead, Continue with Google and Reset password', /already have a Kova account with isa\.ratu@gmail\.com/.test(msg()) && /Continue with Google/.test($('kova-auth-err').textContent)
    && /Sign in instead/.test($('kova-auth-err').textContent));
  $('kova-auth-err').querySelector('button').click(); await wait(5);
  ck('"Sign in instead" goes back to Sign in with the email kept', /Welcome back/.test($('ksiH').textContent) && $('kova-email').value === 'isa.ratu@gmail.com');

  /* success: a guest keeps their data */
  let linked = null, verified = 0;
  auth.currentUser = { uid: 'g1', isAnonymous: true, linkWithCredential: (cr) => { linked = cr; return Promise.resolve({ user: { uid: 'g1', email: cr.e, sendEmailVerification: () => { verified++; } } }); } };
  w.KovaCloudAuth.open({ mode: 'up', email: 'new.person@icloud.com' }); await wait(5);
  type('kova-password', 'Strong2026'); type('kova-password2', 'Strong2026');
  $('kova-auth-go').click(); await wait(30);
  ck('a guest who creates an account keeps everything: the guest account is upgraded, not replaced', linked && linked.e === 'new.person@icloud.com' && calls.filter((c) => c[0] === 'up').length === 1);
  ck('a confirmation email is sent and the screen closes with a clear note', verified === 1 && $('kova-auth-modal').style.display === 'none' && toasts.some((t) => /Account created for new\.person@icloud\.com/.test(t)));
  auth.currentUser = null;

  /* reset */
  w.KovaCloudAuth.open({ mode: 'in', email: 'isa.ratu@gmail.com' }); await wait(5);
  doc.querySelector('.ksi-link[data-m="reset"]').click(); await wait(5);
  ck('"Forgot password?" opens the reset step with the email kept', /Reset your password/.test($('ksiH').textContent) && $('kova-email').value === 'isa.ratu@gmail.com' && !$('kova-password'));
  $('kova-auth-go').click(); await wait(20);
  ck('reset sends the link and says honestly it only arrives if the account exists', calls.some((c) => c[0] === 'reset' && c[1] === 'isa.ratu@gmail.com') && /If there is an account for isa\.ratu@gmail\.com/.test(msg()) && $('kova-auth-err').classList.contains('good'));

  /* right password */
  auth._in = (e) => Promise.resolve({ user: { uid: 'u1', email: e } });
  w.KovaCloudAuth.open({ mode: 'in', email: 'isa.ratu@gmail.com' }); await wait(5);
  type('kova-password', 'kova2026');
  $('kova-auth-go').click(); await wait(20);
  ck('the right password signs in and says who you are signed in as', toasts.some((t) => /Signed in as isa\.ratu@gmail\.com/.test(t)));

  /* the welcome screen links here */
  ck('the email-code welcome screen offers "Sign in with it" for anyone who has a password', /Have a password\? <b id="afPw"/.test(html) && /Use a password instead/.test(html));
  ck('the tests that read the source still find Google, guest and reset', /KovaCloudAuth\.google\(\)/.test(html) && /KovaCloudAuth\.guest\(\)/.test(html) && /KovaCloudAuth\.reset\(/.test(html));
  const css = fs.readFileSync(__dirname + '/../src/p08_signin.css', 'utf8');
  ck('styles for dark, soft light and light glass', /body\.light-mode #kova-auth-modal/.test(css) && /body\.soft-light #kova-auth-modal/.test(css) && /\.ksi-msg\[hidden\]/.test(css));
  ck('no page errors', errors.length === 0 || (console.error(errors), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})();
