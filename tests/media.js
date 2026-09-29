/* Media wiring.

   The point of this file: KovaMedia previously existed with ZERO call
   sites, which is the same failure as the saveHealthData() block it
   replaced. So these tests do not check that the module exists - they
   drive the actual capture paths and assert an upload was attempted,
   and that a failed upload leaves the local feature intact.

   Files go to the Kova api now (POST /api/media/upload in 3 MB parts,
   Netlify Blobs behind it) instead of Firebase Storage, which needs the
   paid Blaze plan since February 2026. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

const R = [];
const ck = (n, c) => R.push([n, !!c]);

// ---- static: the call sites exist at all --------------------------
const sites = [...html.matchAll(/KovaMedia\.attach\('(\w+)'/g)].map(m => m[1]);
['form', 'food', 'machine', 'avatar', 'doc'].forEach(k => {
  ck('capture point wired for ' + k, sites.indexOf(k) >= 0);
});
/* the same kind may come from two flows (food: the meal scanner and the
   two-tap quick log), but each flow names itself with its own ref */
const refs = [...html.matchAll(/KovaMedia\.attach\('(\w+)',[\s\S]{0,120}?ref:\s*'([\w-]+)'/g)].map(m => m[1] + '/' + m[2]);
const twice = sites.filter((k, i) => sites.indexOf(k) !== i);
ck('no kind is wired twice by accident (a second flow carries its own ref)', twice.every(k => refs.filter(r => r.startsWith(k + '/')).length === sites.filter(x => x === k).length && new Set(refs.filter(r => r.startsWith(k + '/'))).size === sites.filter(x => x === k).length));

// ---- behavioural --------------------------------------------------
const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => errors.push(e.message));

const dom = new JSDOM(html, {
  runScripts: 'outside-only', pretendToBeVisual: true,
  url: 'https://kova.local/', virtualConsole: vc,
});
const { window } = dom;

// minimal firebase stub: signed in. The fake api records each upload part.
const uploads = [];
let failNext = false;
const me = { uid: 'u1', email: 'a@b.c', getIdToken: () => Promise.resolve('tok') };
window.firebase = {
  initializeApp() {}, apps: [{}],
  auth: () => ({
    currentUser: me,
    onAuthStateChanged(cb) { cb(me); },
    signOut: () => Promise.resolve(),
  }),
  database: () => ({
    ref: () => ({
      child() { return this; }, set: () => Promise.resolve(),
      update: () => Promise.resolve(), remove: () => Promise.resolve(),
      once: () => Promise.resolve({ val: () => null }),
      on() {}, off() {},
    }),
  }),
  analytics: () => ({ logEvent() {}, setUserId() {} }),
};
// jsdom has no fetch for data: URLs, and Blob from a data URL is what
// KovaMedia.toBlob relies on - provide a minimal stand-in. The upload
// route answers the way functions/media.js does.
window.fetch = (u, o = {}) => {
  u = String(u);
  if (/\/api\/media\/upload\?/.test(u)) {
    const q = new URL(u).searchParams;
    const path = 'users/u1/' + q.get('kind') + '/' + q.get('id') + '.' + q.get('ext');
    uploads.push({ path, type: q.get('type'), i: +q.get('i'), n: +q.get('n'), auth: (o.headers || {}).Authorization });
    if (failNext) { failNext = false; return Promise.reject(new TypeError('network request failed')); }
    const last = +q.get('i') === +q.get('n') - 1;
    const body = last
      ? { ok: true, path, url: 'https://kova.local/api/media/file?p=' + encodeURIComponent(path) + '&e=0&s=sig', bytes: 2, type: q.get('type') }
      : { ok: true, part: +q.get('i') };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  }
  return Promise.resolve({
    ok: true, status: 200, json: () => Promise.resolve({}),
    blob: () => Promise.resolve(new window.Blob([u.slice(0, 64)], { type: 'image/jpeg' })),
  });
};

window.eval(
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n')
);

setTimeout(() => {
  ck('KovaMedia.attach exists', typeof window.KovaMedia.attach === 'function');
  ck('KovaMedia.indexed exists', typeof window.KovaMedia.indexed === 'function');

  // a data-URL capture (machine scan / food photo route)
  window.KovaMedia.attach('machine', 'data:image/jpeg;base64,AAAA', { name: 'm.jpg' })
    .then(() => {
      const hit = uploads.filter(u => u.path.indexOf('users/u1/machine/') === 0);
      ck('data-URL capture reaches storage', hit.length === 1);
      ck('upload is scoped to the user path', hit.length && /^users\/u1\//.test(hit[0].path));
      ck('upload carries the ID token', hit.length && hit[0].auth === 'Bearer tok');

      // a File capture (form check / workspace route)
      const f = new window.File(['xx'], 'clip.mp4', { type: 'video/mp4' });
      return window.KovaMedia.attach('form', f, { name: 'clip.mp4' });
    })
    .then(() => {
      const hit = uploads.filter(u => u.path.indexOf('users/u1/form/') === 0);
      ck('File capture reaches storage', hit.length === 1);
      ck('file keeps its extension', hit.length && /\.mp4$/.test(hit[0].path));
      ck('a small file goes up as one part', hit.length && hit[0].i === 0 && hit[0].n === 1);

      // indexed in KP so the list syncs
      const idx = window.KovaMedia.indexed();
      ck('uploads are indexed in KP', idx.length >= 2);
      ck('index records the signed link', idx[0] && /\/api\/media\/file\?p=users%2Fu1%2F/.test(idx[0].url));
      ck('index is filterable by kind', window.KovaMedia.indexed('form').length === 1);

      // failure must not throw and must report honestly
      failNext = true;
      let seen = null;
      return window.KovaMedia.attach('food', 'data:image/jpeg;base64,BBBB', {
        name: 'x.jpg', onState: (st, msg) => { if (st === 'error') seen = msg; },
      }).then((res) => {
        ck('failed upload resolves rather than throwing', res === null);
        ck('failed upload says the file is still on the device', seen && /this device/i.test(seen));
        ck('failed upload is NOT added to the index',
            window.KovaMedia.indexed('food').length === 0);
        // a big file is split into 3 MB parts, in order
        uploads.length = 0;
        const big = new window.Blob([new Uint8Array(7 * 1024 * 1024)], { type: 'video/mp4' });
        return window.KovaMedia.upload('form', big, 'long.mp4').then((r) => {
          ck('a 7 MB file goes up in three parts, in order', uploads.length === 3 && uploads.map(u => u.i).join() === '0,1,2' && uploads.every(u => u.n === 3));
          ck('the finished upload returns the signed link', r && /\/api\/media\/file\?/.test(r.url));
          report();
        });
      });
    })
    .catch((e) => { console.error('unexpected throw: ' + e.message); ck('no unexpected throw', false); report(); });
}, 500);

function report() {
  let pass = 0, fail = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? pass++ : fail++; });
  console.log('\n' + pass + '/' + (pass + fail) + ' passing');
  if (errors.length) { console.log('runtime errors: ' + errors.length); errors.slice(0, 5).forEach(e => console.log('  ' + e)); }
  process.exit(fail || errors.length ? 1 : 0);
}
