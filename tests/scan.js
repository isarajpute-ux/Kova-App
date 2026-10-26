/* p36 Scan a machine (src/p08_machine.js) and the link reader
   (functions/webpage.js linkPreview, POST /scan/link).

   App: a photo, a video or a link goes in; a sure answer opens; an unsure
   one shows the best guess with its picture and what it looks like, and
   the next most likely ones as pictures to tap; a picture with no equipment
   says what to do; a dropped connection retries once, then offers Try
   again; signed out, it says to sign in and the picture list is right
   there. The list shows a picture and what each machine looks like, and
   search finds by look ("pad", "seat"). A link's title goes to the model
   with its picture.

   Server: YouTube and TikTok links give their title and thumbnail, any
   other page its og:image; private addresses and non-pictures are
   refused; the route needs a real sign-in. */
const Module = require('module');
const path = require('path');
const fs = require('fs');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, n = 160) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) {} await wait(50); } return false; };

/* ---------- server ---------- */
const fakeAdmin = { initializeApp() {}, database: () => ({ ref: () => ({ child() { return this; }, once: async () => ({ val: () => null }), set: async () => {}, update: async () => {}, transaction: async (fn) => ({ snapshot: { val: () => fn(null) } }) }) }),
  auth: () => ({ verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5), firebase: { sign_in_provider: 'google.com' } };
    if (t.startsWith('anon-')) return { uid: t.slice(5), firebase: { sign_in_provider: 'anonymous' } }; throw new Error('bad'); } }) };
const origLoad = Module._load;
Module._load = function (req, ...rest) { if (req === 'firebase-admin') return fakeAdmin; return origLoad.call(this, req, ...rest); };
const api = require(path.join(__dirname, '..', 'functions', 'api.js'));
const WP = require(path.join(__dirname, '..', 'functions', 'webpage.js'));
Module._load = origLoad;
function call(method, url, { body, token } = {}) {
  const headers = {}; if (token) headers.authorization = 'Bearer ' + token;
  const req = { method, path: url, body: body || {}, query: {}, ip: '1.2.3.4', get: (h) => headers[h.toLowerCase()] };
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, status(s) { this.statusCode = s; return this; }, set() { return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); }, send(t) { resolve({ status: this.statusCode, body: t }); } };
    api.handle(req, res, { base: 'https://example.test/api' });
  });
}
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const resp = (status, type, body, extra) => ({ ok: status < 400, status, headers: { get: (h) => (h.toLowerCase() === 'content-type' ? type : (extra || {})[h.toLowerCase()] || null) },
  text: async () => String(body), arrayBuffer: async () => (Buffer.isBuffer(body) ? body : Buffer.from(String(body))), body: null });
const pub = async () => [{ address: '93.184.216.34', family: 4 }];
const seen = [];
const fakeFetch = async (url) => {
  url = String(url); seen.push(url);
  if (url.startsWith('https://www.youtube.com/oembed')) return resp(200, 'application/json', JSON.stringify({ title: 'How to use the hack squat machine', author_name: 'Gym Coach' }));
  if (url.startsWith('https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg')) return resp(200, 'image/jpeg', JPG);
  if (url.startsWith('https://www.tiktok.com/oembed')) return resp(200, 'application/json', JSON.stringify({ title: 'Leg press day', thumbnail_url: 'https://p16.tiktokcdn.com/t.jpg' }));
  if (url.startsWith('https://p16.tiktokcdn.com/')) return resp(200, 'image/jpeg', JPG);
  if (url.startsWith('https://gym.example/machine')) return resp(200, 'text/html', '<html><head><title>Pendulum squat</title><meta property="og:image" content="/img/p.png"></head><body><main>' + 'x'.repeat(10) + '</main></body></html>');
  if (url.startsWith('https://gym.example/img/p.png')) return resp(200, 'image/png', JPG);
  if (url.startsWith('https://gym.example/page.html')) return resp(200, 'text/html', '<html></html>');
  return resp(404, 'text/plain', '');
};

(async () => {
  ck('YouTube links of every shape give the video id', WP.youTubeId('https://www.youtube.com/watch?v=abcdefghijk&t=3') === 'abcdefghijk' && WP.youTubeId('https://youtu.be/abcdefghijk') === 'abcdefghijk'
    && WP.youTubeId('https://youtube.com/shorts/abcdefghijk?x=1') === 'abcdefghijk' && WP.youTubeId('https://example.com/watch?v=abcdefghijk') === '');
  let r = await WP.linkPreview('https://youtu.be/abcdefghijk', { fetch: fakeFetch, lookup: pub });
  ck('a YouTube link: its title and its thumbnail as a picture', r.site === 'YouTube' && /hack squat/.test(r.title) && /^data:image\/jpeg;base64,/.test(r.image));
  r = await WP.linkPreview('https://www.tiktok.com/@a/video/1', { fetch: fakeFetch, lookup: pub });
  ck('a TikTok link: its title and thumbnail', r.site === 'TikTok' && r.title === 'Leg press day' && /^data:image\/jpeg/.test(r.image));
  r = await WP.linkPreview('https://gym.example/machine', { fetch: fakeFetch, lookup: pub });
  ck('any other page: its title and its og:image', r.title === 'Pendulum squat' && /^data:image\/png/.test(r.image));
  let err = await WP.fetchImage('https://gym.example/page.html', { fetch: fakeFetch, lookup: pub }).catch((e) => e);
  ck('a page that is not a picture is refused as a picture', err && err.status === 415);
  err = await WP.fetchImage('http://internal.example/x.png', { fetch: fakeFetch, lookup: async () => [{ address: '10.0.0.2', family: 4 }] }).catch((e) => e);
  ck('…and so is anything on a private address', err && err.status === 400);
  ck('the route needs a sign-in, and a guest session is refused', (await call('POST', '/scan/link', { body: { url: 'https://youtu.be/abcdefghijk' } })).status === 401
    && (await call('POST', '/scan/link', { token: 'anon-x', body: { url: 'https://youtu.be/abcdefghijk' } })).status === 403);

  /* ---------- the app ---------- */
  const { JSDOM, VirtualConsole } = require('jsdom');
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  function boot({ signedIn = true } = {}) {
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: new VirtualConsole() });
    const w = dom.window, calls = [], replies = [];
    const u = { uid: 'u1', email: 'a@b.c', isAnonymous: false, getIdToken: () => Promise.resolve('tok-1') };
    const authObj = { currentUser: signedIn ? u : null, onAuthStateChanged(cb) { cb(signedIn ? u : null); return () => {}; }, onIdTokenChanged(cb) { cb(signedIn ? u : null); return () => {}; }, signOut: () => Promise.resolve() };
    w.firebase = { initializeApp() {}, apps: [{}], auth: () => authObj,
      database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
      storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} }) };
    w.fetch = (url, o = {}) => {
      const s = String(url);
      if (/\/ai\/ask$/.test(s)) {
        const b = JSON.parse(o.body); calls.push(b);
        const next = replies.length ? replies.shift() : { text: '{}' };
        if (next.status) return Promise.resolve({ ok: false, status: next.status, text: () => Promise.resolve('busy'), json: () => Promise.resolve({}) });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ content: [{ type: 'text', text: next.text }] }) });
      }
      if (/\/scan\/link$/.test(s)) { calls.push({ link: JSON.parse(o.body) }); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ site: 'YouTube', title: 'How to use the hack squat machine', image: 'data:image/jpeg;base64,/9j/AA==' }) }); }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
    };
    w.localStorage.setItem('kova.auth.skipped', '1');
    w.localStorage.setItem('kova_mode_v1', 'live');
    w.HTMLElement.prototype.scrollIntoView = function () {};
    w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
    return { w, doc: w.document, calls, replies };
  }
  const A = boot();
  await until(() => A.w.KovaModel && A.w.KovaModel.viaServer());
  A.w.go('machine'); await wait(150);
  const doc = A.doc, banner = () => (doc.getElementById('mcIdent') || {}).textContent || '';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const send = (inp) => { const f = new A.w.File([png], 'm.png', { type: 'image/png' }); Object.defineProperty(inp, 'files', { value: [f], configurable: true }); inp.dispatchEvent(new A.w.Event('change')); };
  ck('there are three ways in: the camera, a photo or video, and a link', !!doc.getElementById('mcUp') && /image\/\*,video\/\*/.test(doc.getElementById('mcUp').accept) && !!doc.querySelector('#s-machine [data-mc="link"]'));

  /* unsure: best guess with its picture, and the others as pictures */
  A.replies.push({ text: '{"match":"Leg press","machine_name":"Leg press","brand_detected":"Unknown","confidence":55,"seen":"sled with foot plate","alternatives":["Smith machine","Squat rack or power cage","Not sure / not listed"]}' });
  send(doc.getElementById('mcUp'));
  await until(() => /BEST GUESS/.test(banner()));
  ck('an unsure answer: the best guess, with what it looks like and a picture', /BEST GUESS/.test(banner()) && /Leg press/.test(banner()) && /push a heavy sled/.test(banner()) && !!doc.querySelector('#mcIdent .mc-big svg'));
  const alts = [...doc.querySelectorAll('#mcIdent .mc-alt')];
  ck('…and the next most likely as pictures to tap ("Not sure" is never one of them)', alts.length === 2 && /Smith machine/.test(alts[0].textContent) && alts.every((a) => a.querySelector('svg')) && !/Not sure/.test(banner()));
  alts[0].click(); await wait(50);
  ck('tapping one opens it', /Smith machine/.test(doc.getElementById('mcResult').textContent) && doc.getElementById('mcResult').style.display === 'block');
  ck('the request asked for alternatives and does not give up when there is equipment', /alternatives/.test(A.calls[0].system) && /Only when there is no gym equipment/.test(A.calls[0].system));

  /* the list: pictures and looks; search by look */
  const rows = [...doc.querySelectorAll('#mcList .mcopt')];
  ck('the list below shows a picture and what each one looks like', rows.length >= 20 && rows.filter((r) => r.querySelector('.mc-pic svg')).length >= 14 && rows.every((r) => r.querySelector('.mc-look')));
  const srch = doc.getElementById('mcSearch'); srch.value = 'shins'; srch.dispatchEvent(new A.w.Event('input'));
  ck('search finds a machine by how it looks ("shins" finds Leg extension)', /Leg extension/.test(doc.getElementById('mcList').textContent));
  srch.value = ''; srch.dispatchEvent(new A.w.Event('input'));

  /* no equipment at all */
  A.replies.push({ text: '{"match":"NONE","machine_name":"Not sure / not listed","confidence":12,"seen":"a dark blurry room","alternatives":[]}' });
  send(doc.getElementById('mcUp'));
  await until(() => /could not tell/.test(banner()));
  ck('a picture with nothing to read says what to do (step back, from the side) and offers another photo', /could not tell from this picture/.test(banner()) && /from the side/.test(banner()) && !!doc.querySelector('#mcIdent [data-mc="again"]'));

  /* a dropped connection: one quiet retry, then Try again */
  const n0 = A.calls.length;
  A.replies.push({ status: 503 }, { status: 503 });
  send(doc.getElementById('mcUp'));
  await until(() => /could not read this one/.test(banner()), 120);
  ck('a dropped connection is retried once by itself, then says so with Try again', A.calls.length - n0 === 2 && !!doc.querySelector('#mcIdent [data-mc="retry"]'));
  A.replies.push({ text: '{"match":"Lat pulldown","machine_name":"Lat pulldown","confidence":93,"seen":"wide bar","alternatives":[]}' });
  doc.querySelector('#mcIdent [data-mc="retry"]').click();
  await until(() => /Lat pulldown/.test(doc.getElementById('mcResult').textContent));
  ck('…and Try again reads it', /Lat pulldown/.test(doc.getElementById('mcResult').textContent));

  /* a link */
  doc.querySelector('#s-machine [data-mc="link"]').click(); await wait(30);
  doc.getElementById('mcUrl').value = 'https://youtu.be/abcdefghijk';
  A.replies.push({ text: '{"match":"NONE","machine_name":"Hack squat machine","brand_detected":"Unknown","confidence":88,"seen":"angled sled with shoulder pads","primary_muscles":["Quadriceps","Glutes"],"secondary_muscles":["Adductors","Calves"],"setup_steps":["Set the shoulder pads","Feet mid platform","Release the safety"],"execution_cues":["Lower under control","Knees track the toes","Drive through the whole foot"],"common_mistakes":[["Heels lifting","Loads the knees"],["Bouncing","Loses tension"]],"alternatives":["Leg press"]}' });
  const n1 = A.calls.length;
  doc.getElementById('mcUrlGo').click();
  await until(() => A.calls.length > n1 + 1);
  const linkCall = A.calls.slice(n1).find((c) => c.link), ai = A.calls.slice(n1).find((c) => c.system);
  const txt = ai && ai.messages[0].content.find((b) => b.type === 'text');
  ck('a pasted link goes to Kova, and its picture and title go to the model', linkCall && linkCall.link.url === 'https://youtu.be/abcdefghijk' && !!ai.messages[0].content.find((b) => b.type === 'image') && /titled "How to use the hack squat machine"/.test(txt.text));
  await until(() => /Hack squat machine/.test(banner() + doc.getElementById('mcResult').textContent));
  ck('…and a machine Kova does not list is still named and explained', /Hack squat machine/.test(banner() + doc.getElementById('mcResult').textContent));

  /* signed out */
  const B = boot({ signedIn: false });
  await wait(1200);
  B.w.go('machine'); await wait(150);
  const f2 = new B.w.File([png], 'm.png', { type: 'image/png' }); const up2 = B.doc.getElementById('mcUp');
  Object.defineProperty(up2, 'files', { value: [f2] }); up2.dispatchEvent(new B.w.Event('change'));
  await until(() => /Sign in and Kova reads it/.test((B.doc.getElementById('mcIdent') || {}).textContent || ''));
  ck('signed out: it says to sign in, and the picture list is right there (no dead end)', /Sign in and Kova reads it/.test(B.doc.getElementById('mcIdent').textContent) && B.doc.getElementById('mcPick').style.display === 'block' && B.doc.querySelectorAll('#mcList .mcopt').length >= 20 && B.doc.getElementById('mcList').style.display !== 'none');

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  console.log(`${R.length - failed.length}/${R.length} scan`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
