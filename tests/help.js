/* Help (p10): every "?" and the Work OS Help tab offer two choices, the
   tour or "Find anything", and search takes you to the real place instead
   of answering with an apology. Also: the AI team is one tap from Work OS. */
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
  const doc = w.document, H = w.KovaHelp;
  let sheet = ''; w.openSheet = (h) => { sheet = h; const d = doc.getElementById('sheetIn') || doc.body.appendChild(doc.createElement('div')); d.id = 'sheetIn'; d.innerHTML = h; };
  w.closeSheet = () => { const d = doc.getElementById('sheetIn'); if (d) d.innerHTML = ''; };
  let toured = ''; w.KovaScreenTour.run = (id) => { toured = id; return true; }; w.KovaWorkTour.run = () => { toured = 'work'; };

  const q = doc.querySelector('#s-fuel .kt-help[data-ktour="fuel"]') || doc.querySelector('.kt-help[data-ktour]');
  ck('a ? button exists', !!q);
  q.click(); await wait(20);
  ck('the ? opens two choices instead of jumping into the tour', /Show me around/.test(sheet) && /Find anything/.test(sheet) && toured === '');
  doc.querySelector('[data-kh="tour"]').click(); await wait(320);
  ck('"Show me around" runs this screen’s tour', toured === q.getAttribute('data-ktour'));
  toured = '';
  const helpTab = doc.querySelector('#s-work [data-wktour]');
  helpTab.click(); await wait(20);
  ck('the Work OS Help tab opens the same two choices', /Find anything/.test(sheet) && toured === '');
  doc.querySelector('[data-kh="find"]').click(); await wait(20);
  ck('Find anything shows a search box and popular places', !!doc.getElementById('khQ') && doc.querySelectorAll('#khList .kh-row').length >= 5);
  const find = (t) => H.search(t).items.map((e) => e.t);
  ck('"vitamins" finds the vitamins and minerals card', find('vitamins')[0] === 'Vitamins and minerals');
  ck('"dark mode" finds appearance', /Appearance/.test(find('dark mode')[0]));
  ck('"employees" finds the AI team', /AI team/.test(find('employees')[0]));
  ck('"period" finds cycle tracking', find('period')[0] === 'Cycle tracking');
  ck('a typo still lands ("vitamns")', find('vitamns')[0] === 'Vitamins and minerals');
  ck('card titles on screens are searchable ("micronutrients")', find('micronutrients').length > 0);
  const junk = H.search('qwxz blorf');
  ck('nonsense still shows the closest places, never an apology', junk.items.length > 0 && junk.mode === 'near');
  const ta = doc.getElementById('khQ'); ta.value = 'vitamins'; ta.oninput(); await wait(10);
  ck('typing updates the list live', /Vitamins and minerals/.test(doc.getElementById('khList').textContent));
  doc.querySelector('#khList .kh-row').click(); await wait(700);
  ck('picking a result opens the screen', doc.getElementById('s-fuel').classList.contains('on'));
  ck('and highlights the exact card', !!doc.querySelector('.kh-spot') && !!doc.querySelector('.kh-tag'));
  ck('no apology text anywhere in the help', !/sorry|not my|cannot help/i.test(require('fs').readFileSync(__dirname + '/../index.html', 'utf8').match(/window\.KovaHelp=[\s\S]*?\n\}\)\(\);/)[0].replace(/never answers with "sorry"/, '')));

  // the AI team is easy to find
  w.go('work'); await wait(80);
  const tab = doc.querySelector('#s-work .wk-tabs [data-go="workteam"]');
  ck('Work OS home has an "AI team" tab', !!tab && tab.textContent === 'AI team');
  ck('there is no AI team card on the Work OS home screen, only the tab', !doc.getElementById('crwHome'));
  tab.click(); await wait(200);
  ck('tapping the tab opens the team', doc.getElementById('s-workteam').classList.contains('on') && !!doc.querySelector('#wtmBody .crw-hero'));
  await wait(1500);
  ck('and it stays open', doc.getElementById('s-workteam').classList.contains('on'));
  ck('three appearances styled', /body\.light-mode \.kh\{/.test(html) && /body\.soft-light \.kh\{/.test(html));

  let p = 0, f = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? p++ : f++; });
  console.log('\n' + p + '/' + (p + f) + ' passing');
  if (errors.length) { console.log('runtime errors: ' + errors.length); errors.slice(0, 6).forEach((e) => console.log('  ' + e)); }
  process.exit(f || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
