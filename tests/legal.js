/* The legal pack: the pages exist and say what they must, they ship with
   the site and the app, Settings links them, the privacy banner gives two
   equal choices and nothing analytic loads before a yes, business details
   and blanks show in the Launch check, and the product-data credit is on
   the scanner. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const errors = [];

(async () => {
  const P = { privacy: read('privacy.html'), terms: read('terms.html'), refunds: read('refunds.html'), cookies: read('cookies.html'), licenses: read('licenses.html') };
  ck('privacy: what is collected and why, processors, retention, rights, children 16+, no recording of sound', /What Kova collects, and why/.test(P.privacy) && /Who else processes it/.test(P.privacy) && /How long it is kept/.test(P.privacy) && /Your rights and choices/.test(P.privacy) && /16 and over/.test(P.privacy) && /No sound is recorded/.test(P.privacy));
  ck('terms: 16+, not medical advice, not birth control, cancel in one tap, AI can be wrong', /at least 16/.test(P.terms) && /not a medical device/.test(P.terms) && /not a method of birth control/.test(P.terms) && /one tap/.test(P.terms) && /They can be wrong/.test(P.terms));
  ck('refunds: trials, App Store, Google Play and the web, each spelled out', /Free trials/.test(P.refunds) && /reportaproblem\.apple\.com/.test(P.refunds) && /Google Play/.test(P.refunds) && /14 days/.test(P.refunds));
  ck('cookies: what is needed, analytics only with a yes, no advertising', /Needed to run Kova/.test(P.cookies) && /only if you allow it/.test(P.cookies) && /Advertising/.test(P.cookies));
  ck('licences: fonts (OFL), icons (MIT), Open Food Facts (ODbL), Unsplash, software', /Open Font License/.test(P.licenses) && /Tabler Icons/.test(P.licenses) && /Open Database License/.test(P.licenses) && /Unsplash/.test(P.licenses) && /Apache 2\.0/.test(P.licenses));
  ck('every page links the others, with relative links (so they work on GitHub Pages under /Kova-App/ too)', Object.values(P).every((t) => /href="terms\.html"/.test(t) && /href="licenses\.html"/.test(t) && !/href="\/\w+\.html"/.test(t)));
  ck('business details are marked as blanks until filled in', Object.values(P).every((t) => /class="todo"/.test(t)));
  const site = read('build/site.mjs'), red = read('_redirects'), nat = read('native/scripts/copy-web.mjs');
  ck('they ship with the site and the app, with short addresses', ['terms', 'refunds', 'cookies', 'licenses'].every((p) => site.includes("'" + p + ".html'") && nat.includes("'" + p + ".html'") && red.includes('/' + p + ' ')));
  ck('no analytics tag in the page head: it loads only after consent', !/<script async src="https:\/\/www\.googletagmanager\.com/.test(html) && /gtag\('consent', 'default'/.test(html));
  ck('the scanner credits Open Food Facts (ODbL)', /Product data from <a href="https:\/\/world\.openfoodfacts\.org"/.test(html));

  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  const pages = { '/privacy.html': P.privacy, '/terms.html': P.terms, '/refunds.html': P.refunds, '/cookies.html': P.cookies, '/licenses.html': P.licenses };
  w.fetch = (u) => { const p = '/' + String(u).replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, ''); return Promise.resolve(pages[p] ? { ok: true, status: 200, text: () => Promise.resolve(pages[p]), json: () => Promise.resolve({}) } : { ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') }); };
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(900);
  const d = w.document, L = w.KovaLegal;
  d.getElementById('app').classList.remove('auth-locked');   // past the welcome screen
  L.banner(); await wait(20);
  const ban = d.getElementById('klgBanner');
  const btns = ban ? [...ban.querySelectorAll('[data-klg]')] : [];
  ck('the banner offers two choices, same element, same class: "Allow analytics" and "Only what is needed"', btns.length === 2 && btns[0].className === btns[1].className && /Allow analytics/.test(btns[0].textContent) && /Only what is needed/.test(btns[1].textContent) && /Cookie policy/.test(ban.textContent));
  btns[1].click(); await wait(20);
  ck('"Only what is needed" stores a no, and analytics stays off', JSON.parse(w.localStorage.getItem('kova.consent')).a === false && !w.KovaAnalytics.allowed());
  L.banner(); await wait(10);
  ck('once chosen, the banner does not come back', !d.querySelector('#klgBanner.on') || d.querySelectorAll('#klgBanner').length === 0);
  ck('Settings has Privacy choices (an analytics switch) and Legal (terms, refunds, cookies, licences, business details)', !!d.querySelector('#s-settings #klgAna [role="switch"]') && ['terms', 'refunds', 'cookies', 'licenses'].every((p) => !!d.getElementById('klg-' + p)) && !!d.getElementById('klgBiz'));
  d.querySelector('#klgAna [role="switch"]').click(); await wait(10);
  ck('the switch turns analytics on (and back off)', w.KovaAnalytics.allowed() && (d.querySelector('#klgAna [role="switch"]').click(), !w.KovaAnalytics.allowed()));
  const rows = await L.checks();
  ck('the Launch check goes red for empty business details and for blanks in the pages', rows.length === 2 && rows.every((r) => r.s === 'bad') && /KOVA_BIZ/.test(rows[0].fix) && /Fill the red blanks/.test(rows[1].fix));
  w.KOVA_BIZ = { name: 'Kova Ltd', address: '1 Test St', email: 'hi@example.com', country: 'UK' };
  ck('...and green for the details once they are filled in', (await L.checks())[0].s === 'ok');
  ck('no page errors', errors.length === 0 || (console.error(errors.slice(0, 5)), false));
  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
