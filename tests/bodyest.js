/* functions/body.js and its routes: POST /body/estimate reads a progress
   photo (and the earlier one) into a body-fat range, carefully; POST
   /media/link hands out a fresh 15-minute link to your own file only.
   The real router, a fake Firebase Auth, a fake model, no keys. */
const Module = require('module');
const path = require('path');
const R = [];
const ck = (n, c) => R.push([n, !!c]);

const fakeAdmin = {
  initializeApp() {},
  database: () => ({ ref: () => ({ child() { return this; }, once: async () => ({ val: () => null }), set: async () => {}, transaction: async (fn) => { const v = fn(null); return { committed: true, snapshot: { val: () => v } }; } }) }),
  auth: () => ({ verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad'); } })
};
const origLoad = Module._load;
Module._load = function (req, ...rest) { if (req === 'firebase-admin') return fakeAdmin; return origLoad.call(this, req, ...rest); };
const api = require(path.join(__dirname, '..', 'functions', 'api.js'));
const body = require(path.join(__dirname, '..', 'functions', 'body.js'));
const { makeMedia } = require(path.join(__dirname, '..', 'functions', 'media.js'));

const IMG = Buffer.from('fake jpeg bytes that are long enough to count as a photo '.repeat(4)).toString('base64');
let sent = [], answer = '{"lo":15,"hi":18,"conf":66,"notes":["Upper abs outlined","Fat mostly at the hips"],"change":"Waist narrower than 21 days ago.","tip":"Same light next time."}', upstream = 200;
const fakeFetch = async (url, o) => {
  sent.push({ url, body: JSON.parse(o.body) });
  if (upstream !== 200) return { ok: false, status: upstream, text: async () => 'nope', json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: answer }] }) };
};
global.fetch = fakeFetch;

/* in-memory store for media */
const blobs = new Map();
const store = { get: async (k, o) => { const v = blobs.get(k); if (v == null) return null; return o && o.type === 'json' ? JSON.parse(v) : o && o.type === 'arrayBuffer' ? v : String(v); },
  set: async (k, v) => { blobs.set(k, v); }, setJSON: async (k, v) => { blobs.set(k, JSON.stringify(v)); },
  list: async ({ prefix }) => ({ blobs: [...blobs.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }), delete: async (k) => { blobs.delete(k); } };
const cfg = { base: 'https://kova-app.vercel.app/api', anthropicKey: 'sk-test', model: 'claude-sonnet-5-5', media: makeMedia({ store, secret: 'sek', base: 'https://kova-app.vercel.app/api' }) };

function call(method, url, { body: b, token, c } = {}) {
  const headers = {}; if (token) headers.authorization = 'Bearer ' + token;
  const req = { method, path: url, body: b || {}, query: {}, ip: '1.2.3.' + Math.floor(Math.random() * 200), get: (h) => headers[h.toLowerCase()] };
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, status(s) { this.statusCode = s; return this; }, set() { return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); }, send(t) { resolve({ status: this.statusCode, body: t }); } };
    api.handle(req, res, c || cfg);
  });
}

(async () => {
  /* ---------- the parser's rules ---------- */
  const p1 = body.parse('{"lo":15,"hi":16,"conf":99,"notes":["a","b","c","d"]}', 'm');
  ck('a range narrower than 4 points is widened around its middle', p1.lo === 14 && p1.hi === 18);
  ck('photo clarity never claims more than 85 %', p1.conf === 85);
  ck('at most three notes', p1.notes.length === 3);
  const p2 = body.parse('```json\n{"lo":22,"hi":17,"conf":40}\n```', 'f');
  ck('a reversed range is put the right way round, markdown fences are ignored', p2.lo === 17 && p2.hi === 22);
  ck('a range near the essential-fat floor comes with a note to see a professional', !!body.parse('{"lo":4,"hi":8,"conf":50}', 'm').care && !!body.parse('{"lo":12,"hi":16,"conf":50}', 'f').care && !body.parse('{"lo":15,"hi":19,"conf":50}', 'm').care);
  const p3 = body.parse('{"none":true,"why":"No person in the photo."}', 'm');
  ck('no person (or someone who may be under 18): no number, a reason', p3.none === true && /No person/.test(p3.why) && p3.lo === undefined);
  ck('the instructions forbid comments on looks and ask for nothing from anyone under 18', /No comments on attractiveness/.test(body.SYSTEM) && /under 18/.test(body.SYSTEM) && /RANGE/.test(body.SYSTEM));

  /* ---------- the route ---------- */
  ck('/body/estimate needs you signed in', (await call('POST', '/body/estimate', { body: { image: IMG } })).status === 401);
  sent = [];
  const r = await call('POST', '/body/estimate', { token: 'good-u1', body: { image: IMG, mime: 'image/jpeg', prev: IMG, days: 21, prevKg: 81.4, pose: 'front', sex: 'm', age: 31, cm: 180, kg: 79.4 } });
  ck('it answers with the range, clarity, notes, what changed and a tip', r.status === 200 && r.body.lo === 15 && r.body.hi === 19 && r.body.conf === 66 && r.body.notes.length === 2 && /Waist narrower/.test(r.body.change) && /Same light/.test(r.body.tip));
  const msg = sent[0] && sent[0].body;
  const imgs = msg.messages[0].content.filter((x) => x.type === 'image'), texts = msg.messages[0].content.filter((x) => x.type === 'text').map((x) => x.text).join(' | ');
  ck('the model gets the earlier photo first, then the new one', imgs.length === 2 && /EARLIER photo, 21 days ago, weight then 81.4 kg/.test(texts) && /NEW photo \(front view\)/.test(texts));
  ck('with the profile as a sanity check', /sex male, age 31, height 180 cm, weight today 79.4 kg/.test(texts));
  ck('it uses Kova’s model at temperature 0, with the careful instructions', msg.model === 'claude-sonnet-5-5' && msg.temperature === 0 && msg.system === body.SYSTEM);
  sent = [];
  const solo = await call('POST', '/body/estimate', { token: 'good-u1', body: { image: IMG } });
  ck('one photo alone works, with "change" left empty by the model', solo.status === 200 && sent[0].body.messages[0].content.filter((x) => x.type === 'image').length === 1);
  ck('not base64: a plain 400', (await call('POST', '/body/estimate', { token: 'good-u1', body: { image: 'not a photo!' } })).status === 400);
  ck('too large for one request: 413 before anything is sent', (await call('POST', '/body/estimate', { token: 'good-u1', body: { image: 'A'.repeat(2.1 * 1024 * 1024) } })).status === 413);
  const noKey = await call('POST', '/body/estimate', { token: 'good-u1', body: { image: IMG }, c: Object.assign({}, cfg, { anthropicKey: '' }) });
  ck('no model key on the server: 503 that says it is not set up yet', noKey.status === 503 && /not set up/.test(noKey.body.error));
  upstream = 500;
  ck('the model failing is a 503, not a crash', (await call('POST', '/body/estimate', { token: 'good-u1', body: { image: IMG } })).status === 503);
  upstream = 200; answer = 'I think about fifteen percent';
  ck('an answer that is not JSON is a 502 "try again"', (await call('POST', '/body/estimate', { token: 'good-u1', body: { image: IMG } })).status === 502);

  /* ---------- /media/link ---------- */
  await cfg.media.putPart('u1', { kind: 'body', id: 'front1', ext: 'jpg', i: 0, n: 1, type: 'image/jpeg' }, Buffer.from('JPEG'));
  const ok = await call('POST', '/media/link', { token: 'good-u1', body: { path: 'users/u1/body/front1.jpg' } });
  const e = ok.body.url ? +new URL(ok.body.url).searchParams.get('e') : 0;
  ck('/media/link gives you a link to your own photo that expires in 15 minutes', ok.status === 200 && e > Date.now() / 1000 + 800 && e <= Date.now() / 1000 + 901 && cfg.media.verify('users/u1/body/front1.jpg', String(e), new URL(ok.body.url).searchParams.get('s')));
  ck('...never to someone else’s', (await call('POST', '/media/link', { token: 'good-u2', body: { path: 'users/u1/body/front1.jpg' } })).status === 403);
  ck('...no tricks with ../', (await call('POST', '/media/link', { token: 'good-u1', body: { path: 'users/u1/../u2/body/x.jpg' } })).status === 403);
  ck('...and a deleted file is a 404', (await call('POST', '/media/link', { token: 'good-u1', body: { path: 'users/u1/body/gone.jpg' } })).status === 404);
  ck('...signed in only', (await call('POST', '/media/link', { body: { path: 'users/u1/body/front1.jpg' } })).status === 401);

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
