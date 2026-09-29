/* One Kova in the corner (p10): the glowing orb replaces the chat button,
   and the agent's Your 7 / Plan / Do it for me live as tabs inside the
   chat panel, so there is one place to talk to Kova. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
const user = { uid: 'u1', getIdToken: () => Promise.resolve('t') };
w.firebase = {
  initializeApp() {}, apps: [{}],
  auth: () => ({ currentUser: user, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() }),
  database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
    remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
  storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} }),
  functions: () => ({ httpsCallable: () => () => Promise.resolve({ data: { text: '' } }) })
};
const calls = [];
const FOODS = { foods: [{ id: 1, n: 'Spinach, raw', type: 'SR Legacy', kcal: 23, p: 2.9, c: 3.6, f: 0.4, m: { fib: 2.2, na: 79, k: 558, ca: 99, fe: 2.7, mg: 79, c: 28.1, d: 0, b12: 0, fol: 194 } }] };
w.fetch = (u, o) => { calls.push([String(u), o]); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(/foods\/search/.test(u) ? FOODS : {}) }); };
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));



(async () => {
  await wait(1900);
  const doc = w.document, orb = doc.getElementById('kgOrb'), panel = doc.getElementById('kovaPanel');
  ck('the old chat button is hidden by the stylesheet', /#kovaFab\{display:none!important\}/.test(html));
  ck('one orb sits in the corner', !!orb && doc.querySelectorAll('#kgOrb').length === 1);
  ck('the tab row sits inside the chat panel', !!panel.querySelector('#kcTabs') && !!panel.querySelector('#kcAgent'));
  w.go('sleep'); await wait(40);
  ck('the orb is a dark grey glass sphere', /\.ko-core\{[^}]*rgba\(58,60,65,\.82\)/.test(html));

  orb.click(); await wait(120);
  const tabs = () => [...doc.querySelectorAll('#kcTabs button')];
  ck('tapping the orb opens the Kova panel', panel.classList.contains('on'));
  ck('four tabs: Chat, Your 7, Plan, Do it for me', tabs().map((b) => b.childNodes[0].textContent.trim()).join('|') === 'Chat|Your 7|Plan|Do it for me');
  ck('it opens on Chat with the message box showing', tabs()[0].classList.contains('on') && !panel.classList.contains('agent-mode'));
  ck('the orb steps aside while the panel is open', orb.classList.contains('ko-hide'));

  tabs()[1].click(); await wait(60);
  const ag = doc.getElementById('kcAgent');
  ck('Your 7 shows the seven metrics in the same panel', panel.classList.contains('agent-mode') && ag.querySelectorAll('.kop-m').length === 7);
  ck('the chat stays in the panel, just hidden', !!doc.getElementById('kcIn') && panel.contains(doc.getElementById('kcIn')));
  tabs()[2].click(); await wait(40);
  ck('Plan lists morning, evening and night', /Morning/.test(ag.textContent) && /Evening/.test(ag.textContent) && /Night/.test(ag.textContent));
  tabs()[3].click(); await wait(40);
  ck('Do it for me keeps the approve-first promise', !!doc.getElementById('kopAsk') && /Nothing is sent or saved until you approve it/.test(ag.textContent));
  tabs()[0].click(); await wait(40);
  ck('back to Chat', !panel.classList.contains('agent-mode'));

  w.KovaOrb.badge(3, false); await wait(10);
  ck('the Plan tab carries the count', /Plan\s*3/.test(tabs()[2].textContent));

  doc.getElementById('kovaClose').click(); await wait(60);
  ck('closing the panel brings the orb back', !panel.classList.contains('on') && !orb.classList.contains('ko-hide'));

  w.KovaOrb.open('plan'); await wait(80);
  ck('"Your plan" links open the panel on Plan', panel.classList.contains('on') && tabs()[2].classList.contains('on') && panel.classList.contains('agent-mode'));
  w.KovaChat.close(); await wait(40);
  w.KOVA_ASK('How much protein do I need?'); await wait(200);
  ck('"Ask Kova about this" always lands on Chat', panel.classList.contains('on') && tabs()[0].classList.contains('on') && !panel.classList.contains('agent-mode'));
  w.KovaChat.close(); await wait(40);
  w.go('chat'); await wait(80);
  ck('the chat route opens the same panel', panel.classList.contains('on') && tabs()[0].classList.contains('on'));

  let p = 0, f = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? p++ : f++; });
  console.log('\n' + p + '/' + (p + f) + ' passing');
  if (errors.length) { console.log('runtime errors: ' + errors.length); errors.slice(0, 6).forEach((e) => console.log('  ' + e)); }
  process.exit(f || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
