/* Your own wearable (p28):
     - the Watch screen draws the device that actually sent the data, read
       from the sending app's name: Apple Watch, Ultra, Pixel Watch, Galaxy
       Watch, Garmin (its app is called "Connect"), Fitbit, WHOOP, Oura,
       Ultrahuman, Galaxy Ring, Polar, COROS, Suunto, Amazfit, Withings;
     - when several apps wrote the same day, the wearable is named, not
       the phone that counted steps (server and app agree);
     - with nothing synced, you choose yours by tapping the picture; the
       choice is kept, and synced data that names a device wins;
     - each choice says honestly how its data reaches Kova (WHOOP keeps HRV
       back from Apple Health; Fitbit and Pixel do not share with it);
     - every drawing is a valid picture, with no clashing ids. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { clean } = require('../functions/health');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function boot() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document };
}
(async () => {
  const A = boot(); await wait(300);
  const W = A.w.KovaWearables, KH = A.w.KovaHealth;
  const cases = [['Isa’s Apple Watch', 'apple'], ['Apple Watch Ultra 2', 'ultra'], ['Oura', 'oura'], ['WHOOP', 'whoop'], ['Connect', 'garmin'], ['Garmin Forerunner 265', 'garmin'],
    ['Fitbit Charge 6', 'fitband'], ['Fitbit Sense 2', 'fitsq'], ['Pixel Watch 3', 'pixel'], ['Galaxy Watch7', 'galaxy'], ['Galaxy Ring', 'gring'], ['Ultrahuman', 'uhring'],
    ['Polar Flow', 'polar'], ['COROS', 'coros'], ['Suunto', 'suunto'], ['Zepp', 'amazfit'], ['Health Mate', 'withings'], ['Isa’s iPhone', 'phone'], ['', null], ['Strava', null]];
  const bad = cases.filter(([raw, want]) => W.detect(raw) !== want).map(([raw, want]) => raw + '->' + W.detect(raw) + ' (want ' + want + ')');
  ck('each device is recognised from the app that sent the data (' + (bad.join(', ') || cases.length + ' names') + ')', !bad.length);

  /* several apps wrote the same day */
  const mixed = { data: { metrics: [
    { name: 'step_count', units: 'count', data: [{ date: '2026-10-13 00:00:00 -0700', qty: 4000, source: 'Isa’s iPhone' }] },
    { name: 'resting_heart_rate', units: 'count/min', data: [{ date: '2026-10-13 00:00:00 -0700', qty: 54, source: 'Isa’s Apple Watch|Isa’s iPhone' }] }] } };
  ck('the server names the watch, not the phone that counted steps', clean(mixed).device === 'Isa’s Apple Watch');
  ck('and the app does the same', KH.normalizeHAE(mixed).device === 'Isa’s Apple Watch');

  /* nothing synced: you choose */
  A.w.go('watch'); await wait(50);
  const dev = A.doc.getElementById('wchDev'), cap = () => A.doc.getElementById('wchDevName').textContent;
  ck('with nothing synced it asks you to choose, on a tappable picture', dev.getAttribute('data-family') === 'unknown' && /Tap to choose your watch, ring or band/.test(cap()) && dev.getAttribute('role') === 'button');
  dev.dispatchEvent(new A.w.MouseEvent('click', { bubbles: true })); await wait(60);
  const opts = A.doc.querySelectorAll('.sheet .kw-opt');
  ck('tapping it opens "What do you wear?" with 16 choices, each drawn', opts.length === 16 && [...opts].every((o) => o.querySelector('svg path, svg rect, svg circle')));
  A.doc.querySelector('.sheet [data-kw="whoop"]').click(); await wait(30);
  ck('choosing WHOOP draws a WHOOP and names it', dev.getAttribute('data-family') === 'whoop' && /WHOOP/.test(cap()) && /Change/.test(cap()));
  ck('and says honestly how it reaches Kova: Apple Health, without HRV', /Turn on Apple Health in the WHOOP app\. WHOOP does not share HRV there\./.test(A.doc.getElementById('kwHow').textContent));
  ck('the choice is kept (this device and your synced profile)', A.w.localStorage.getItem('kova.wear') === 'whoop' && A.w.KP.get('wearable') === 'whoop');
  A.doc.querySelector('.sheet [data-kw="fitband"]').click(); await wait(30);
  ck('Fitbit says it does not share with Apple Health', /Fitbit does not share with Apple Health/.test(A.doc.getElementById('kwHow').textContent));
  A.doc.querySelector('.sheet [data-kw="pixel"]').click(); await wait(30);
  ck('Pixel Watch says it needs an Android phone', /Pixel Watch needs an Android phone/.test(A.doc.getElementById('kwHow').textContent));

  /* synced data that names a device wins */
  KH.ingest({ device: 'Oura', hr: 51 }, 'test'); KH.apply(); await wait(30);
  ck('once Oura data arrives, the Oura ring shows instead of your pick', dev.getAttribute('data-family') === 'oura' && /Oura/.test(cap()));

  /* drawings */
  const ids = W.ids;
  const parsed = ids.map((id) => new A.w.DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 144">' + W.draw(id) + '</svg>', 'image/svg+xml'));
  ck('every drawing (' + ids.length + ') is a valid picture', ids.length === 18 && parsed.every((d) => !d.querySelector('parsererror') && d.querySelectorAll('path,rect,circle,ellipse,line').length > 3));
  const all = [...A.doc.querySelectorAll('svg [id^="kw"]')].map((e) => e.id);
  ck('no two drawings share a gradient id', all.length > 0 && new Set(all).size === all.length);
  ck('the tours speak of any watch, ring or band', !/Link Apple Watch for real readings/.test(html) && /Link your watch, ring or band for real readings/.test(html));
  ck('the picker loads after the first screen', /const LAZY = \[[^\]]*'p08-wearables'/.test(fs.readFileSync(__dirname + '/../build/site.mjs', 'utf8')));

  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
