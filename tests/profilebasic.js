/* The profile's details, kept basic (p49, the owner: "make it basic",
   then "no recommendations, just a normal profile"):
     - Name, Role, Company: three plain boxes, no suggested roles;
     - no character counters, no examples that look like someone's details;
     - a website or About saved before stays in the record;
     - in the dark look the profile card is dark grey, not pale blue. */
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
  ck('with no role yet, the profile says how to add one', /Tap the pencil to add your role/.test($('#pfRole').textContent));
  $('#pfEditBtn').click(); await wait(20);
  const f = $('#pfFields');
  ck('the form is three plain boxes: Name, Role, Company', $('#pfForm').style.display === '' && f.querySelectorAll('input,textarea').length === 3 && [...f.querySelectorAll('.wfield-k')].map((x) => x.textContent).join() === 'Name,Role,Company');
  ck('no suggested roles, no Website or About, no counters, no example that looks filled in', !f.querySelector('[data-role],.wpill,button') && !/Website|About/.test(f.textContent) && !f.querySelector('.wcount') && !/ \/ \d/.test(f.textContent) && !/Developer & product owner|kova\.app|Independent/.test(f.innerHTML) && [...f.querySelectorAll('input')].map((x) => x.placeholder).join() === 'Your name,Your role,Your company');
  const set = (k, v) => { const n = f.querySelector('[data-f="' + k + '"]'); n.value = v; n.dispatchEvent(new w.Event('input', { bubbles: true })); };
  set('name', 'Sam Lee'); set('role', 'Designer'); set('org', 'Acme');
  $('#pfSave').click(); await wait(20);
  const m = w.KP.get('me');
  ck('saving keeps name, role and company', m.name === 'Sam Lee' && m.role === 'Designer' && m.org === 'Acme' && /Designer · Acme/.test($('#pfRole').textContent));
  ck('a website and About saved before are kept', m.site === 'old.example' && m.bio === 'kept');
  $('#pfEditBtn').click(); await wait(20);
  ck('editing again shows what was saved', $('#pfFields [data-f="role"]').value === 'Designer' && $('#pfFields [data-f="org"]').value === 'Acme');
  $('#pfCancel').click(); await wait(20);
  const css = html.slice(0, html.indexOf('</head>'));
  ck('in the dark look the profile card is dark grey (the pale blue glow stays out of it)', /body:not\(\.light-mode\):not\(\.soft-light\) #s-profile \.wglow\{background:radial-gradient\([^)]*#3A3B40/.test(css));
  ck('the Cancel button\'s words are readable in the dark look', /id="pfCancel"[^>]*color:var\(--txt\)/.test(html));
  ck('no page errors', errors.length === 0 || (console.error(errors.slice(0, 5)), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
