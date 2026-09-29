/* Show new people less (src/p08_focus.js + the first question): the tab
   bar and Home show only the areas picked, never more than five tabs; the
   rest and the extras are one tap from More; after the first win the
   areas not picked come back one a day. People who skipped the question,
   or set up Kova before it, keep everything. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot(onboard) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  const events = [];
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent(n, p) { events.push([n, p]); }, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.auth.local', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  if (onboard) w.localStorage.setItem('kova.profile.onboard', JSON.stringify(onboard));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  if (onboard) w.KP.set('onboard', onboard);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document, events };
}
const tabsShown = (d) => [...d.querySelectorAll('.rail .rnav[data-go]')].filter((n) => n.getAttribute('data-go') !== 'settings' && !n.classList.contains('kf-off') && n.style.display !== 'none').map((n) => n.getAttribute('data-go'));

(async () => {
  // ---------- a food-only person ----------
  const A = boot({ focus: 'fuel', areas: ['fuel'] });
  await wait(700);
  const d = A.doc;
  A.w.KovaFocus.paint();
  ck('a food-only person sees Home and Fuel in the tab bar, nothing else', JSON.stringify(tabsShown(d)) === '["home","fuel"]');
  ck('...and no Work OS on Home on day one', d.getElementById('osHero').classList.contains('kf-off') && A.w.getComputedStyle(d.getElementById('osHero')).display === 'none');
  const tiles = [...d.querySelectorAll('#s-home .grid2 > .card[data-go]')].filter((c) => !c.classList.contains('kf-off')).map((c) => c.getAttribute('data-go'));
  ck('Home shows the Fuel tile only, filling its row', JSON.stringify(tiles) === '["fuel"]' && d.querySelector('#s-home .card[data-go="fuel"]').classList.contains('kf-wide'));
  ck('the extras wait: no GLP-1 card on Fuel, no lab results card on Vitals', d.body.classList.contains('kf-focus') && !d.body.classList.contains('kf-glp1') && !d.body.classList.contains('kf-labs'));
  const more = d.getElementById('kfMore');
  ck('More sits at the bottom of the rail, above Settings, and is a named button', more && more.nextElementSibling && more.nextElementSibling.getAttribute('data-go') === 'settings' && more.getAttribute('role') === 'button' && /More/.test(more.getAttribute('aria-label')));
  more.click(); await wait(50);
  const sheet = d.querySelector('#sheetIn .kf');
  const hid = [...sheet.querySelectorAll('[data-kf-go]')].map((b) => b.getAttribute('data-kf-go'));
  ck('More lists every area not picked (Training, Sleep & recovery, Work), each one tap to open', JSON.stringify(hid.sort()) === '["move","sleep","work"]' && /Sleep & recovery/.test(sheet.textContent));
  ck('...and the extras: AI team, Studio, voice, lab results, GLP-1 mode', ['crew', 'studio', 'voice', 'labs', 'glp1'].every((k) => sheet.querySelector('[data-kf-x="' + k + '"]')));
  sheet.querySelector('[data-kf-go="sleep"]').click(); await wait(50);
  ck('Open goes straight there', d.getElementById('s-sleep').classList.contains('on'));
  A.w.KovaFocus.open(); await wait(30);
  d.querySelector('#sheetIn [data-kf-add="sleep"]').click(); await wait(30);
  ck('"Add to tabs" brings Sleep & recovery into the tab bar (Sleep and Vitals)', JSON.stringify(tabsShown(d)) === '["home","fuel","sleep","vitals"]' && A.events.some((e) => e[0] === 'area_added' && e[1].answer === 'sleep'));
  A.w.KovaFocus.open(); await wait(30);
  d.querySelector('#sheetIn [data-kf-x="labs"]').click(); await wait(400);
  ck('turning lab results on from More shows its card', d.body.classList.contains('kf-labs'));
  A.w.closeSheet();

  // ---------- never more than five ----------
  const all = ['fuel', 'move', 'sleep', 'work'];
  let worst = 0, bad = [];
  for (let m = 1; m < 16; m++) {
    const pick = all.filter((x, i) => m & (1 << i));
    A.w.KovaFocus._set({ extra: [], adv: {}, all: false });
    A.w.KP.set('onboard', { areas: pick, focus: pick[0] }); A.w.KovaFocus.paint();
    const t = tabsShown(d); worst = Math.max(worst, t.length);
    if (t.length > 5 || t[0] !== 'home') bad.push(pick.join('+') + ': ' + t.join(','));
  }
  ck('for all 15 combinations of areas the tab bar has at most 5 tabs (' + worst + ' at most)', !bad.length || (console.error(bad), false));
  A.w.KP.set('onboard', { areas: all, focus: 'fuel' }); A.w.KovaFocus.paint();
  A.w.KovaFocus.open(); await wait(30);
  const capped = [...d.querySelectorAll('#sheetIn [data-kf-go]')].map((b) => b.getAttribute('data-kf-go'));
  ck('with all four picked, Vitals is the one under More, one tap away', JSON.stringify(tabsShown(d)) === '["home","fuel","sleep","move","work"]' && JSON.stringify(A.w.KovaFocus.hidden()) === '["vitals"]' && JSON.stringify(capped) === '["vitals"]');
  A.w.closeSheet();

  // ---------- one a day after the first win ----------
  const B = boot({ focus: 'move', areas: ['move'] });
  await wait(700);
  const F = B.w.KovaFirstWeek;
  ck('before the first win, no area is suggested', !F.PROMPTS.some((p) => /^area-/.test(p.id)));
  B.w.KovaAnalytics.track('first_win', { kind: 'meal' });
  const st = F._S(); st.win = 'meal'; F._reset(st);
  await wait(20);
  const S2 = F._S(); S2.install = Date.now() - 2 * 864e5; S2.lastPrompt = '0'; S2.prompts = { device: 'done', winddown: 'done', lock: 'done', target: 'done' }; F._reset(S2);
  const p = F.next();
  ck('after it, the areas not picked come back as the day\'s one suggestion', p && /^area-/.test(p.id) && /too/.test(p.q));
  p.pick('add');
  ck('"Add it" puts that area in the tab bar', B.w.KovaFocus.areas().length === 2);

  // ---------- nobody loses anything ----------
  const C = boot(null);
  await wait(700);
  C.w.KovaFocus.paint();
  ck('someone who skipped the question (or set up before it) keeps every area, at five tabs', JSON.stringify(tabsShown(C.doc)) === '["home","fuel","sleep","move","work"]' && C.doc.body.classList.contains('kf-glp1') && C.doc.body.classList.contains('kf-labs') && !C.doc.getElementById('osHero').classList.contains('kf-off'));
  ck('...and their four Home tiles', [...C.doc.querySelectorAll('#s-home .grid2 > .card[data-go]')].every((c) => !c.classList.contains('kf-off')));

  const css = fs.readFileSync(__dirname + '/../src/p08_focus.css', 'utf8');
  ck('the More sheet uses theme tokens only (dark, soft light, light glass)', !/#[0-9a-f]{3,6}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
