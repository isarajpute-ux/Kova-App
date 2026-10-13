/* Your face, not a letter for everyone (p27):
     - the rail said "I" and Settings said "K" for every person; now every
       avatar shows your photo, your initials once you have a name, or a
       plain person outline until then;
     - signed in with Google (a real name on the account), that name fills
       the profile; a name that is only the email address is not used;
     - the Studio's mark is Kova's script K, not an eight-armed sparkle,
       and its welcome card says what Work OS does in four short lines. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function boot(pre) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova.auth.skipped', '1');
  Object.keys(pre || {}).forEach((k) => w.localStorage.setItem(k, pre[k]));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document };
}
const ava = (doc, id) => { const e = doc.getElementById(id); return e ? { t: e.textContent.trim(), svg: !!e.querySelector('svg') } : null; };

(async () => {
  ck('the markup no longer carries a letter for everyone', !/id="avatar"[^>]*>I<\/div>/.test(html) && !/id="setMeAva"[^>]*>K<\/div>/.test(html));
  const A = boot();
  await wait(300);
  A.w.go('settings'); await wait(30);
  const r = ava(A.doc, 'avatar'), s = ava(A.doc, 'setMeAva');
  ck('no name yet: the rail shows a person outline, not "I"', r && r.t === '' && r.svg);
  ck('no name yet: Settings shows a person outline, not "K", and asks for a name', s && s.t === '' && s.svg && /Add your name/.test(A.doc.getElementById('setMeName').textContent));
  A.w.go('profile'); await wait(30);
  ck('no name yet: the profile shows a person outline too', ava(A.doc, 'pfAva').svg && ava(A.doc, 'pfAva').t === '');
  A.w.KP.set('me', { name: 'Isa Rajpute', since: Date.now() }); A.w.KovaProfile.paintAll();
  ck('with a name: initials everywhere (IR)', ava(A.doc, 'avatar').t === 'IR' && ava(A.doc, 'setMeAva').t === 'IR' && ava(A.doc, 'pfAva').t === 'IR');

  const B = boot({ 'kova.auth': JSON.stringify({ name: 'Sam Rivera', email: 'sam@example.com', uid: 'u1' }) });
  await wait(300);
  ck('signed in with a named account: that name fills the profile', B.w.KP.get('me') && B.w.KP.get('me').name === 'Sam Rivera' && ava(B.doc, 'avatar').t === 'SR');
  const C = boot({ 'kova.auth': JSON.stringify({ name: 'sam.r', email: 'sam.r@example.com', uid: 'u2' }) });
  await wait(300);
  ck('a "name" that is only the email address is not used', !(C.w.KP.get('me') && C.w.KP.get('me').name) && ava(C.doc, 'avatar').svg);

  /* the Studio */
  const ui = fs.readFileSync(__dirname + '/../src/p07_ui.js', 'utf8');
  ck('the Studio mark is Kova’s cut K and dot, and the old sparkle is gone', /kova:'<g transform="scale\(\.24\) translate\(-2 0\)" fill="currentColor"[^']*M12 10h21v34l33-34h26L33 70v20H12z[^']*<circle cx="74" cy="76" r="14"/.test(ui) && !/ic\('ast'\)/.test(ui) && !/ast:'<path/.test(ui));
  ck('the sign-in logo and the app icon use the same mark (brand/kova-mark.svg)', /M12 10h21v34l33-34h26L33 70v20H12z/.test(fs.readFileSync(__dirname + '/../brand/kova-mark.svg', 'utf8')) && /\.af-mark::before,\.ksi-brand::before\{[^}]*mask:url\("data:image\/svg\+xml[^"]*M12 10h21v34l33-34h26L33 70v20H12z/.test(html));
  ck('the welcome card says what it does in four short lines', /Your content, handled/.test(ui) && (ui.match(/<li><b>/g) || []).length >= 4 && /Your AI team writes it/.test(ui) && /You tap post/.test(ui));
  const rs = fs.readFileSync(__dirname + '/../src/p08_responsive.css', 'utf8');
  ck('on a phone the card is compact and scrolls inside itself', /#s-workstudio \.ks-start\{padding:22px 18px 16px;[^}]*max-height:calc\(100dvh - 32px\);overflow-y:auto/.test(rs));

  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
