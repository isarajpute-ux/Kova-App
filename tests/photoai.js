/* p52: photos read by Kova's AI do not spend the owner's credit by surprise:
   the cheaper model, the same photo never paid for twice, a daily cap per
   person, one switch on the server and one in Settings. */
const Module = require('module');
const path = require('path');
const fs = require('fs');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, n = 160) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) {} await wait(50); } return false; };

/* ---------- server, with an in-memory database and fake auth ---------- */
const store = {};
function get(p) { let o = store; for (const k of p.split('/').filter(Boolean)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : JSON.parse(JSON.stringify(o)); }
function set(p, v) { const parts = p.split('/').filter(Boolean); let o = store; parts.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || !o[k]) o[k] = {}; o = o[k]; }); if (v == null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = JSON.parse(JSON.stringify(v)); }
function ref(p = '') { return { child: (c) => ref(p + '/' + c), once: async () => ({ val: () => get(p) }), set: async (v) => set(p, v), remove: async () => set(p, null),
  update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); }, transaction: async (fn) => { const v = fn(get(p)); set(p, v); return { snapshot: { val: () => v } }; } }; }
const fakeAdmin = { initializeApp() {}, database: () => ({ ref }), auth: () => ({
  verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5), firebase: { sign_in_provider: 'google.com' } };
    if (t.startsWith('anon-')) return { uid: t.slice(5), firebase: { sign_in_provider: 'anonymous' } }; throw new Error('bad'); } }) };
const origLoad = Module._load;
Module._load = function (req, ...rest) { if (req === 'firebase-admin') return fakeAdmin; return origLoad.call(this, req, ...rest); };
const api = require(path.join(__dirname, '..', 'functions', 'api.js'));
Module._load = origLoad;
let upstream = (body) => ({ status: 200, body: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1 } } });
const sent = [];
const nodeFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  sent.push({ url: String(url), opts });
  if (String(url).startsWith('https://api.anthropic.com')) { const r = upstream(JSON.parse(opts.body)); return { ok: r.status < 400, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) }; }
  return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
};
const cfg = { base: 'https://example.test/api', anthropicKey: 'sk-test-123456789', model: 'claude-test' };
function call(method, url, { body, token, c } = {}) {
  const headers = {}; if (token) headers.authorization = 'Bearer ' + token;
  const req = { method, path: url, body: body || {}, query: {}, ip: '1.2.3.4', get: (h) => headers[h.toLowerCase()] };
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, status(s) { this.statusCode = s; return this; }, set() { return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); }, send(t) { resolve({ status: this.statusCode, body: t }); } };
    api.handle(req, res, c || cfg);
  });
}
const IMG = (mt, data) => ({ type: 'image', source: { type: 'base64', media_type: mt, data: data || 'iVBORw0KGgo=' } });

const user = (content) => ({ messages: [{ role: 'user', content }] });

(async () => {
  const c1 = Object.assign({}, cfg, { photoModel: 'claude-photo-cheap', photoDaily: 3 });
  let n0 = sent.length;
  const a = await call('POST', '/ai/ask', { token: 'good-p1', c: c1, body: user([IMG('image/jpeg', 'AAAA'), { type: 'text', text: 'what machine is this' }]) });
  ck('a photo is read by the cheaper photo model', a.status === 200 && JSON.parse(sent[sent.length - 1].opts.body).model === 'claude-photo-cheap' && sent.length === n0 + 1);
  n0 = sent.length;
  const b = await call('POST', '/ai/ask', { token: 'good-p1', c: c1, body: user([IMG('image/jpeg', 'AAAA'), { type: 'text', text: 'what machine is this' }]) });
  ck('the same photo and question again: answered from the saved answer, no credit used', b.status === 200 && b.body.cached === true && b.body.content[0].text === 'ok' && sent.length === n0);
  ck('…saved for that person only', !!get('srv/aicache/p1') && !get('srv/aicache/p2'));
  n0 = sent.length;
  await call('POST', '/ai/ask', { token: 'good-p1', c: c1, body: user('plan my week') });
  ck('a question with no photo keeps the main model', JSON.parse(sent[sent.length - 1].opts.body).model === 'claude-test');
  // the daily cap: 3 paid photo reads (one already used above)
  for (const d of ['BBBB', 'CCCC']) await call('POST', '/ai/ask', { token: 'good-p1', c: c1, body: user([IMG('image/jpeg', d), { type: 'text', text: 'read it' }]) });
  n0 = sent.length;
  const cap = await call('POST', '/ai/ask', { token: 'good-p1', c: c1, body: user([IMG('image/jpeg', 'DDDD'), { type: 'text', text: 'read it' }]) });
  ck('past today’s photo reads it stops before asking Claude', cap.status === 429 && sent.length === n0);
  const again = await call('POST', '/ai/ask', { token: 'good-p1', c: c1, body: user([IMG('image/jpeg', 'BBBB'), { type: 'text', text: 'read it' }]) });
  ck('…but a photo already read is still free', again.status === 200 && again.body.cached === true);
  // the owner's switch
  const cOff = Object.assign({}, cfg, { photoAi: 'off' });
  n0 = sent.length;
  const off = await call('POST', '/ai/ask', { token: 'good-p9', c: cOff, body: user([IMG('image/jpeg', 'EEEE'), { type: 'text', text: 'read it' }]) });
  ck('KOVA_PHOTO_AI=off: photos are refused, nothing is sent, and it says no credit is used', off.status === 403 && /no credit is used/.test(off.body.error) && sent.length === n0);
  const offText = await call('POST', '/ai/ask', { token: 'good-p9', c: cOff, body: user('just text') });
  ck('…text questions still work', offText.status === 200);
  const offMeal = await call('POST', '/meal/read', { token: 'good-p9', c: cOff, body: { image: 'AAAA', mime: 'image/jpeg' } });
  const offLab = await call('POST', '/labs/extract', { token: 'good-p9', c: cOff, body: { image: 'AAAA', mime: 'image/jpeg' } });
  ck('…and the switch covers meal and lab report photos too', (offMeal.status === 403 || offMeal.status === 402) && (offLab.status === 403 || offLab.status === 402) && sent.length === n0 + 1);
  const env = require(path.join(__dirname, '..', 'functions', 'env.js'));
  const E = (env.fromEnv || env)({ KOVA_PHOTO_AI: 'off' });
  ck('env: the photo model defaults to Claude Haiku 5.5, the cap to 40, and the switch reads KOVA_PHOTO_AI', E.photoModel === 'claude-haiku-5-5' && E.photoDaily === 40 && E.photoAi === 'off');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  ck('Settings has a switch to stop Kova reading photos', /Read photos with Kova’s AI/.test(html) && /kova\.photoai\.v1/.test(html));

  // the page: Settings switch, and nothing leaves the device when it is off
  const { JSDOM, VirtualConsole } = require('jsdom');
  const vc = new VirtualConsole(); const errs = []; vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window; const out = [];
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = function (u, o) { if (this !== w && this !== undefined) throw new Error('bad this'); out.push(String(u)); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ content: [{ type: 'text', text: 'read' }] }) }); };
  w.localStorage.setItem('kova.auth.skipped', '1'); w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(900);
  const P = w.KovaPhotoAI, d = w.document;
  w.go('settings'); await wait(100); P.paint();
  const rowEl = d.getElementById('kpaRow');
  ck('Settings shows "Read photos with Kova’s AI", on by default', !!rowEl && /Read photos with Kova\u2019s AI/.test(rowEl.textContent) && rowEl.querySelector('.kpa-tog').getAttribute('aria-checked') === 'true');
  const photoBody = JSON.stringify({ messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }] }] });
  await w.fetch('https://x.test/api/ai/ask', { method: 'POST', body: photoBody });
  ck('on: a photo goes to Kova’s AI as before', out.length === 1);
  rowEl.querySelector('.kpa-tog').click(); await wait(10);
  ck('tapping it turns it off and says photos use no credit', !P.on() && /use no credit/.test(d.getElementById('kpaRow').textContent));
  const r1 = await w.fetch('https://x.test/api/ai/ask', { method: 'POST', body: photoBody });
  const r2 = await w.fetch('/api/meal/read', { method: 'POST', body: JSON.stringify({ image: 'AAAA', mime: 'image/jpeg' }) });
  const j1 = await r1.json();
  ck('off: photo requests stop on the device with a plain reason (nothing sent)', out.length === 1 && r1.status === 403 && r2.status === 403 && /no credit was used/.test(j1.error));
  await w.fetch('https://x.test/api/ai/ask', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'plan my week' }] }) });
  await w.fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: photoBody });
  ck('off: typing still works, and a key of your own is not blocked', out.length === 3);
  ck('Dream physique: a new picture waits for a tap instead of reading again by itself', !/arOf\(d,which\); if\(S\.out&&!S\.busy\) compare\(\)/.test(html));
  ck('the switch is styled in dark, soft light and light', /body\.soft-light \.kpa/.test(html) && /body\.light-mode \.kpa/.test(html));
  ck('no page errors', errs.length === 0 || (console.error(errs.slice(0, 4)), false));

  R.forEach((r) => console.log((r[1] ? 'ok   ' : 'FAIL ') + r[0]));
  const f = R.filter((r) => !r[1]).length;
  console.log(f ? f + ' failed' : 'all ' + R.length + ' passed');
  process.exit(f ? 1 : 0);
})();
