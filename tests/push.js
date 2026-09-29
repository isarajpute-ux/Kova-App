/* KovaPush (src/p08_push.js) + sw.js: reminders that arrive with Kova
   closed. Checks the permission is only asked in context, the device
   and the reminder list reach the api in the shape the server takes,
   the list is re-sent when it changes, a notification opens its screen,
   and the service worker never caches the api. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const sw = fs.readFileSync(__dirname + '/../sw.js', 'utf8');
const { cleanList } = require(__dirname + '/../functions/push.js');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/' + (opts.qs || ''), virtualConsole: vc });
  const w = dom.window;
  const user = { uid: 'u1', email: 'a@b.c', getIdToken: () => Promise.resolve('tok') };
  const asked = [];
  w.Notification = function () {};
  w.Notification.permission = 'default';
  w.Notification.requestPermission = () => { asked.push(1); w.Notification.permission = 'granted'; return Promise.resolve('granted'); };
  Object.defineProperty(w.navigator, 'serviceWorker', { value: { ready: Promise.resolve({ scope: '/' }), register: () => Promise.resolve({}), addEventListener() {} } });
  const auth = { get currentUser() { return user; }, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() };
  let tokenCalls = 0;
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }),
    messaging: () => ({ getToken: (o) => { tokenCalls++; return Promise.resolve(o && o.vapidKey ? 'fcm-web-token-0123456789abcdef' : ''); }, onMessage() {}, deleteToken: () => Promise.resolve() }) };
  const reqs = [];
  w.fetch = (url, o = {}) => {
    reqs.push({ url: String(url), o, body: o.body && typeof o.body === 'string' ? JSON.parse(o.body) : null });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }), text: () => Promise.resolve('') });
  };
  if (opts.vapid) w.KOVA_FB_VAPID = 'BPublicWebPushKey_for_tests';
  w.localStorage.setItem('kova_mode_v1', 'sample');
  w.localStorage.setItem('kova.auth.skipped', '1');
  const gone = [];
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  const og = w.go;
  w.go = function (id) { gone.push(id); return og.apply(this, arguments); };
  return { w, doc: w.document, reqs, asked, gone, tokens: () => tokenCalls };
}

(async () => {
  const A = boot({ vapid: true });
  await wait(600);
  const { w, doc } = A;
  ck('nothing is asked on launch', A.asked.length === 0 && A.tokens() === 0);
  ck('the note says reminders only show while Kova is open', /only show while Kova is open/.test(doc.getElementById('kpuNote').textContent));

  // the list, in the server's shape
  const items = w.KovaPush.items();
  ck('bedtime wind-down goes out 30 minutes early (22:30 - 30)', items.bed && items.bed.time === '22:00' && items.bed.kind === 'wind_down' && items.bed.screen === 'sleep');
  ck('weekday lunch maps to Monday-Friday (1-5, Sunday = 0)', JSON.stringify(items.lunch.days) === '[1,2,3,4,5]' && items.lunch.screen === 'fuel');
  ck('training opens the workout screen', items.train.screen === 'move' && items.train.kind === 'workout');
  const cl = cleanList(w.KovaPush.payload());
  ck('the server accepts every reminder as sent', Object.keys(cl.items).length === Object.keys(items).length && typeof cl.tz === 'string');

  // switching a reminder on offers push, in context
  const i = w.__alerts.get().findIndex((a) => !a.on);
  doc.querySelector(`.altog[data-i="${i}"]`).click();
  await wait(120);
  const offer = doc.querySelector('#sheetIn .kpv');
  ck('switching a reminder on offers to send it with Kova closed', !!offer && /Kova closed/.test(offer.textContent));
  ck('it still has not asked the browser', A.asked.length === 0);
  offer.querySelector('[data-kpu="no"]').click();
  ck('"Only while Kova is open" asks nothing', A.asked.length === 0 && !w.KovaPush.active());

  // turning it on
  await w.KovaPush.enable();
  ck('turning it on asks the browser once and gets a token', A.asked.length === 1 && A.tokens() === 1);
  const dev = A.reqs.find((r) => /\/api\/devices$/.test(r.url));
  ck('the device token goes to the api with the ID token', dev && dev.body.token === 'fcm-web-token-0123456789abcdef' && dev.body.platform === 'web' && dev.o.headers.Authorization === 'Bearer tok');
  const rem = A.reqs.filter((r) => /\/api\/reminders$/.test(r.url));
  ck('then the reminder list follows', rem.length === 1 && rem[0].body.items.bed.time === '22:00');
  ck('the note now says they arrive with Kova closed', w.KovaPush.active() && /even when Kova is closed/.test(doc.getElementById('kpuNote').textContent));

  // changes are re-sent
  const a0 = w.__alerts.get()[0]; a0.t = '23:00'; w.__alerts.save();
  await wait(1500);
  const rem2 = A.reqs.filter((r) => /\/api\/reminders$/.test(r.url));
  ck('moving a reminder re-sends the list', rem2.length === 2 && rem2[1].body.items.bed.time === '22:30');

  // quiet hours
  doc.querySelector('#kpuNote [data-kpu="quiet"]').click();
  await wait(1500);
  const rem3 = A.reqs.filter((r) => /\/api\/reminders$/.test(r.url)).pop();
  ck('quiet hours are off by default and cycle on', rem3.body.quiet && rem3.body.quiet.from === '22:00' && /22:00/.test(doc.getElementById('kpuNote').textContent));

  // without the web push key
  const B = boot({});
  await wait(600);
  let err = null;
  try { await B.w.KovaPush.enable(); } catch (e) { err = e; }
  ck('without the web push key it says so plainly and asks nothing', err && /web push key/.test(err.message) && B.asked.length === 0);

  // a tapped notification opens its screen
  const C = boot({ qs: '?go=sleep' });
  await wait(1200);
  ck('?go=sleep opens the Sleep screen', C.gone.includes('sleep'));
  ck('and the address is cleaned up', !/go=/.test(C.w.location.search));

  // service worker
  ck('the service worker never caches the api', /\\\/api\\\//.test(sw) && /if \(\/\\\/api\\\/\|/.test(sw));
  ck('the service worker loads push in a try, so an offline install still works', /try \{\s*importScripts\('https:\/\/www\.gstatic\.com\/firebasejs\/9\.23\.0\/firebase-app-compat\.js'/.test(sw) && /catch \(e\)/.test(sw));
  ck('the page does not double a reminder the push already showed', /KovaPush&&KovaPush\.active\(\)&&document\.hidden/.test(html));

  const failed = R.filter((r) => !r[1]);
  R.forEach((r) => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
