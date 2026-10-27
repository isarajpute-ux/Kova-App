/* The profile's details, kept basic (p49, the owner: "make it basic",
   most people here are a designer, a CEO, an owner):
     - Name, What do you do? (a tap, or your own words), Company or school;
     - no character counters, no examples that look like someone's details;
     - a website or About saved before stays in the record. */
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
  const d = w.document, $ = (s) => d.querySelector(s);
  w.KP.set('me', { name: 'Old Name', role: '', org: '', site: 'old.example', bio: 'kept', since: Date.now() });
  w.go('profile'); await wait(30);
  ck('with no role yet, the profile says how to add one', /Tap the pencil to add what you do/.test($('#pfRole').textContent));
  $('#pfEditBtn').click(); await wait(20);
  const f = $('#pfFields');
  ck('the form is three things: Name, What do you do?, Company or school', $('#pfForm').style.display === '' && f.querySelectorAll('input,textarea').length === 3 && /Name/.test(f.textContent) && /What do you do\?/.test(f.textContent) && /Company or school \(optional\)/.test(f.textContent));
  ck('no Website or About, no counters, no example that looks filled in', !/Website|About/.test(f.textContent) && !f.querySelector('.wcount') && !/ \/ \d/.test(f.textContent) && !/Developer & product owner|kova\.app|Independent/.test(f.innerHTML));
  const chips = [...f.querySelectorAll('[data-role]')];
  ck('one tap for the usual roles (Founder or CEO, Business owner, Designer, Developer, Creator, Student, Manager, Freelancer)', chips.length === 8 && ['Founder or CEO', 'Business owner', 'Designer', 'Student'].every((r) => chips.some((c) => c.textContent === r)));
  const chip = (r) => f.querySelector('[data-role="' + r + '"]');
  chip('Designer').click();
  ck('tapping one picks it', chip('Designer').getAttribute('aria-pressed') === 'true' && chip('Designer').classList.contains('on') && f.querySelectorAll('[data-role].on').length === 1);
  const set = (k, v) => { const n = f.querySelector('[data-f="' + k + '"]'); n.value = v; n.dispatchEvent(new w.Event('input', { bubbles: true })); };
  set('name', 'Sam Lee'); set('org', 'Acme');
  $('#pfSave').click(); await wait(20);
  let m = w.KP.get('me');
  ck('saving keeps name, role and company', m.name === 'Sam Lee' && m.role === 'Designer' && m.org === 'Acme' && /Designer · Acme/.test($('#pfRole').textContent));
  ck('a website and About saved before are kept', m.site === 'old.example' && m.bio === 'kept');
  $('#pfEditBtn').click(); await wait(20);
  ck('editing again shows the pick, with the own-words box empty', $('#pfFields [data-role="Designer"]').classList.contains('on') && $('#pfFields [data-f="role"]').value === '');
  const f2 = $('#pfFields'); const r2 = f2.querySelector('[data-f="role"]'); r2.value = 'Head of growth'; r2.dispatchEvent(new w.Event('input', { bubbles: true }));
  ck('typing your own words clears the pick', !f2.querySelector('[data-role].on'));
  $('#pfSave').click(); await wait(20);
  ck('your own words are saved as the role', w.KP.get('me').role === 'Head of growth' && /Head of growth · Acme/.test($('#pfRole').textContent));
  $('#pfEditBtn').click(); await wait(20);
  ck('…and shown back in the box next time', $('#pfFields [data-f="role"]').value === 'Head of growth');
  $('#pfFields [data-role="Student"]').click(); $('#pfFields [data-role="Student"]').click();
  $('#pfSave').click(); await wait(20);
  ck('tapping a pick twice clears it', w.KP.get('me').role === '');
  ck('no page errors', errors.length === 0 || (console.error(errors.slice(0, 5)), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
