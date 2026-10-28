/* The profile (p50, the owner: "a normal profile: first name, last
   name, email, number, watch connected"):
     - photo and name at the top, then First name, Last name, Email,
       Phone number and Save, then the watch;
     - an old single name splits into first and last;
     - the sign-in email is shown and cannot be changed here;
     - a website, About, role or company saved before stays in the record;
     - the watch says if one is connected, with Connect or Manage. */
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
  w.KP.set('me', { name: 'Sam Lee Jones', role: 'Designer', org: 'Acme', site: 'old.example', bio: 'kept', since: Date.now() });
  w.go('profile'); await wait(40);
  const f = $('#pfFields'), val = (k) => f.querySelector('[data-f="' + k + '"]').value;
  ck('the profile is photo and name, then the details, then the watch', !!$('#pfAva') && !!$('#pfAvaBtn') && /Sam Lee Jones/.test($('#pfName').textContent) && !!$('#pfWatch') && !!$('#pfSave'));
  ck('the details are First name, Last name, Email, Phone number', [...f.querySelectorAll('.wfield-k')].map((x) => x.textContent).join() === 'First name,Last name,Email,Phone number' && f.querySelector('[data-f="email"]').type === 'email' && f.querySelector('[data-f="phone"]').type === 'tel');
  ck('the old extras are gone (post counts, linked platforms, shortcuts, pencil)', !$('#pfStats') && !$('#pfConn') && !$('#pfCards') && !$('#pfEditBtn') && !/Posts|Projects|Connected accounts/.test($('#s-profile').textContent));
  ck('an old single name splits into first and last', val('first') === 'Sam' && val('last') === 'Lee Jones');
  const set = (k, v) => { const n = f.querySelector('[data-f="' + k + '"]'); n.value = v; n.dispatchEvent(new w.Event('input', { bubbles: true })); };
  set('first', 'Sam'); set('last', 'Lee'); set('email', 'not-an-email'); $('#pfSave').click(); await wait(20);
  ck('a wrong email is not saved', !w.KP.get('me').email);
  set('email', 'sam@example.com'); set('phone', '+1 (555) 010-2233'); $('#pfSave').click(); await wait(20);
  const m = w.KP.get('me');
  ck('saving keeps first, last, email and phone, and the full name', m.first === 'Sam' && m.last === 'Lee' && m.name === 'Sam Lee' && m.email === 'sam@example.com' && m.phone === '+1 (555) 010-2233');
  ck('the top shows the name and email', /Sam Lee/.test($('#pfName').textContent) && /sam@example\.com/.test($('#pfRole').textContent));
  ck('what was saved before (website, About, role, company) is kept', m.site === 'old.example' && m.bio === 'kept' && m.role === 'Designer' && m.org === 'Acme');
  set('phone', '12'); $('#pfSave').click(); await wait(20);
  ck('a phone number that is too short is not saved', w.KP.get('me').phone === '+1 (555) 010-2233');
  ck('no watch: it says so, with Connect', /No watch connected/.test($('#pfWatch').textContent) && /Connect/.test($('#pfWatchBtn').textContent));
  w.KovaCloudAuth = Object.assign({}, w.KovaCloudAuth, { status: () => ({ signedIn: true, anon: false, email: 'sam@signin.com' }) });
  w.go('home'); await wait(10); w.go('profile'); await wait(30);
  const em = $('#pfFields [data-f="email"]');
  ck('signed in: the sign-in email shows and cannot be changed here', em.value === 'sam@signin.com' && em.readOnly && /The email you sign in with/.test($('#pfFields').textContent));
  w.go('settings'); await wait(30);
  ck('Settings shows whether this device is backed up (moved from the old profile page)', !!$('#s-settings #pfSync') && /backed up|Backed up|Backing up|Offline|not available/.test($('#pfSync').textContent));
  const css = html.slice(0, html.indexOf('</head>'));
  ck('plain cards in every look (no pale glow card on the profile)', !/<section class="screen" id="s-profile">[\s\S]*?class="wglow[\s\S]*?<\/section>/.test(html.slice(html.indexOf('id="s-profile"') - 40, html.indexOf('id="s-settings"'))) && /\.pf-top\{/.test(css));
  ck('no page errors', errors.length === 0 || (console.error(errors.slice(0, 5)), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
