/* The accessibility pass (src/p08_a11y.js + .css): on every screen of the
   app, nothing you can press is nameless, no field is labelled only by its
   placeholder, clickable non-buttons work from the keyboard, focus is
   visible, motion can be turned off and small icon buttons have 44 pt tap
   areas. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova_mode_v1', 'live');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(700);
  const d = w.document;
  const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const hasName = (el) => el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || txt(el) || (el.querySelector('img[alt]') || {}).alt;
  const nameless = [], unlabelled = [];
  const scan = (where) => {
    d.querySelectorAll('button,a[href],[role="button"],[onclick]').forEach((el) => { if (!el.closest('[aria-hidden="true"]') && !hasName(el)) nameless.push(where + ': ' + el.outerHTML.slice(0, 90)); });
    d.querySelectorAll('input:not([type="hidden"]):not([type="file"]),select,textarea').forEach((el) => {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label') || el.title || (el.id && d.querySelector('label[for="' + el.id + '"]'))) return;
      unlabelled.push(where + ': ' + el.outerHTML.slice(0, 90));
    });
  };
  scan('start');
  const screens = [...d.querySelectorAll('.screen[id^="s-"]')].map((s) => s.id.slice(2));
  for (const s of screens) { try { w.go(s); } catch (e) {} await wait(300); scan(s); }
  ck('on all ' + screens.length + ' screens every button, link and tappable thing has a name', nameless.length === 0 || (console.error(nameless.slice(0, 5)), false));
  /* p47: icon-only buttons carry their name in the page itself (not only once the script runs) */
  const markup = html.split(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/);
  const bare = [];
  markup.forEach((seg) => { for (const m of seg.matchAll(/<div\b([^>]*\bclass="(?:[^"]*\s)?(?:iconbtn|back)(?:\s[^"]*)?"[^>]*)>([\s\S]*?)<\/div>/g)) { if (!/aria-label/.test(m[1]) && !m[2].replace(/<[^>]+>/g, '').trim()) bare.push(m[1].slice(0, 60)); } });
  ck('every icon-only button and Back in the page has a label written in (not added later)', bare.length === 0 || (console.error(bare.slice(0, 5)), false));
  const typing = d.activeElement; w.go('home'); await wait(30);
  ck('…but not while typing in something over the screens (Ask Kova)', typing && typing.id === 'kcIn' && d.activeElement === typing);
  typing.blur(); w.go('sleep'); await wait(30);
  ck('opening a screen moves focus to its title, for screen readers', d.activeElement && d.activeElement.closest('#s-sleep') && /Sleep/.test(d.activeElement.textContent) && d.activeElement.getAttribute('tabindex') === '-1');
  ck('every text field, picker and slider has a label, not just a placeholder', unlabelled.length === 0 || (console.error(unlabelled.slice(0, 5)), false));
  const back = d.querySelector('.hdr .back');
  ck('the header back chevron reads "Back"', back && back.getAttribute('aria-label') === 'Back' && back.getAttribute('role') === 'button' && back.getAttribute('tabindex') === '0');

  w.go('move'); await wait(100);
  w.openSheet('<div class="iconbtn" onclick="closeSheet()" style="width:28px;height:28px"><svg class="ic"><use href="#i-x"/></svg></div><p>Sheet</p>');
  await wait(350);
  const x = d.querySelector('#sheetIn .iconbtn');
  ck('a sheet\'s x is a "Close" button you can Tab to', x.getAttribute('aria-label') === 'Close' && x.getAttribute('role') === 'button' && x.getAttribute('tabindex') === '0');
  /* jsdom does not run onclick="" attributes (browsers do), so listen for the click itself */
  let pressed = 0; x.addEventListener('click', () => { pressed++; w.closeSheet(); });
  x.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  x.dispatchEvent(new w.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  x.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  ck('Enter and Space press it (the sheet closes); other keys do nothing', pressed === 2 && !d.getElementById('sheet').classList.contains('on'));
  const svg = [...d.querySelectorAll('svg[role="img"]')];
  ck('charts are named from their card; icons inside named controls are hidden from screen readers', svg.length > 0 && svg.every((s) => /chart$/.test(s.getAttribute('aria-label'))) && d.querySelector('.hdr .back svg').getAttribute('aria-hidden') === 'true');

  const css = fs.readFileSync(__dirname + '/../src/p08_a11y.css', 'utf8');
  ck('focus is visible for keyboard users in every appearance (drawn in the text colour)', /:focus-visible\{\s*outline:2px solid currentColor/.test(css));
  ck('Reduce Motion turns animation and transitions off everywhere', /prefers-reduced-motion: reduce\)\{\s*\*,\*::before,\*::after\{animation-duration:\.01ms!important/.test(css));
  ck('small round icon buttons get a 44 pt tap area (28 px + 8 px each side)', /::after\{content:"";position:absolute;inset:-8px/.test(css));
  /* contrast of 28,26,23 ink at alpha a over the light-glass ground (237,238,240) */
  const lum = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (r, g, b) => 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
  const alpha = +(css.match(/html body\.light-mode \.sub,html body\.light-mode \.li-sub\{color:rgba\(28,26,23,([.\d]+)\)/) || [])[1];
  const mix = (c, g) => c * alpha + g * (1 - alpha);
  const ratio = (L(237, 238, 240) + 0.05) / (L(mix(28, 237), mix(26, 238), mix(23, 240)) + 0.05);
  ck('light glass secondary text is at least 4.5:1 (' + ratio.toFixed(1) + ':1)', ratio >= 4.5);
  ck('the photos you take have a description', /id="fcImg" alt="/.test(html) && /id="mcImg" alt="/.test(html));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
