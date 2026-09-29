/* Shared by the browser tests: a small static server, a stubbed Firebase
   (no network, signed out), and per-page instrumentation that records page
   errors and marks every element that gets an event handler, so two builds
   can be compared handler for handler. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, constants as zc } from 'node:zlib';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

/* serves dir; with brotli:true it compresses like Netlify does, so byte
   counts and timings match what a phone downloads */
export function serve(dir, { brotli = false } = {}) {
  const cache = new Map();
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = normalize(join(dir, p));
      if (!f.startsWith(normalize(dir))) { res.writeHead(403).end(); return; }
      await stat(f);
      let body = await readFile(f);
      const headers = { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
      if (brotli && /\.(html|js|css|json|webmanifest)$/.test(f) && /\bbr\b/.test(req.headers['accept-encoding'] || '')) {
        if (!cache.has(f)) cache.set(f, brotliCompressSync(body, { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }));
        body = cache.get(f); headers['Content-Encoding'] = 'br';
      }
      res.writeHead(200, headers).end(body);
    } catch (e) { res.writeHead(404).end('not found'); }
  });
  /* compress up front, as a CDN has it ready, so no request waits on it */
  const warm = brotli ? (async () => {
    const { readdir } = await import('node:fs/promises');
    for (const sub of ['', 'm']) {
      let names = []; try { names = await readdir(join(dir, sub)); } catch (e) { continue; }
      for (const n of names) if (/\.(html|js|css|json|webmanifest)$/.test(n)) {
        const f = normalize(join(dir, sub, n));
        cache.set(f, brotliCompressSync(await readFile(f), { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }));
      }
    }
  })() : Promise.resolve();
  return warm.then(() => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ url: 'http://127.0.0.1:' + server.address().port, close: () => server.close() }))));
}

const FIREBASE_STUB = `
(function(){
  var auth={currentUser:null,onAuthStateChanged:function(cb){setTimeout(function(){cb(null)},0);return function(){}},signOut:function(){return Promise.resolve()},
    signInAnonymously:function(){return Promise.reject(new Error('offline test'))},signInWithEmailAndPassword:function(){return Promise.reject(new Error('offline test'))},
    createUserWithEmailAndPassword:function(){return Promise.reject(new Error('offline test'))},sendPasswordResetEmail:function(){return Promise.resolve()},
    signInWithPopup:function(){return Promise.reject(new Error('offline test'))},setPersistence:function(){return Promise.resolve()}};
  function A(){ return auth; } A.GoogleAuthProvider=function(){ this.addScope=function(){}; this.setCustomParameters=function(){}; }; A.OAuthProvider=A.GoogleAuthProvider;
  A.Auth={Persistence:{LOCAL:'local'}};
  function ref(){ var r={child:function(){return r},set:function(){return Promise.resolve()},update:function(){return Promise.resolve()},remove:function(){return Promise.resolve()},
    once:function(){return Promise.resolve({val:function(){return null},exists:function(){return false}})},on:function(){},off:function(){},push:function(){return r},
    orderByChild:function(){return r},limitToLast:function(){return r},equalTo:function(){return r}}; return r; }
  function D(){ return {ref:ref,goOnline:function(){},goOffline:function(){}}; } D.ServerValue={TIMESTAMP:0};
  window.firebase={apps:[],initializeApp:function(){window.firebase.apps.push({});return {}},auth:A,database:D,
    analytics:function(){return {logEvent:function(){},setUserId:function(){},setUserProperties:function(){}}}};
})();`;

/* a page with Firebase, fonts and analytics answered locally */
export async function openPage(browser, url, { viewport = { width: 390, height: 844 }, storage = {}, throttle = null } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await context.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: FIREBASE_STUB }));
  await context.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await context.route(/googletagmanager\.com|google-analytics\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|jsdelivr\.net|cdnjs\.cloudflare\.com/, (r) =>
    r.fulfill({ contentType: /fonts\.googleapis/.test(r.request().url()) ? 'text/css' : 'text/javascript', body: '' }));
  await context.route(/\/api\//, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no server in tests"}' }));
  await context.addInitScript(({ storage }) => {
    try { for (const k in storage) localStorage.setItem(k, storage[k]); } catch (e) {}
    window.__errs = [];
    addEventListener('error', (e) => window.__errs.push(String(e.message || e.error)));
    addEventListener('unhandledrejection', (e) => { const m = String((e.reason && e.reason.message) || e.reason); if (!/offline test|no server in tests/.test(m)) window.__errs.push('rejection: ' + m); });
    /* mark elements that get a handler, either way it can be attached */
    const mark = (el) => { try { if (el && el.nodeType === 1) el.__h = 1; } catch (e) {} };
    const ael = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (t, f, o) { mark(this); return ael.call(this, t, f, o); };
    for (const p of ['onclick', 'oninput', 'onchange', 'onkeydown', 'onkeyup', 'onsubmit', 'onpointerdown', 'onmousedown', 'ontouchstart', 'onfocus', 'onblur', 'onscroll']) {
      const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, p);
      if (d && d.set) Object.defineProperty(HTMLElement.prototype, p, { configurable: true, enumerable: d.enumerable, get: d.get, set(v) { if (v) mark(this); d.set.call(this, v); } });
    }
  }, { storage });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  if (throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: throttle.rtt, downloadThroughput: throttle.down / 8, uploadThroughput: throttle.up / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle.cpu });
  }
  const t0 = Date.now();
  if (url) await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  return { context, page, pageErrors, loadMs: Date.now() - t0 };
}

export const SIGNED_OUT_LOCAL = { 'kova.auth.skipped': '1', 'kova.auth.local': '1', 'kova.onboarded': JSON.stringify({ at: 1 }) };

/* every screen, what is in it and which elements respond to input */
export async function snapshot(page, ids) {
  const out = {};
  for (const id of ids) {
    await page.evaluate((id) => { try { window.go(id); } catch (e) { window.__errs.push('go ' + id + ': ' + e.message); } }, id);
    await page.waitForTimeout(120);
    out[id] = await page.evaluate((id) => {
      const s = document.getElementById('s-' + id); if (!s) return null;
      const all = s.getElementsByTagName('*'), bound = [], ids = [];
      for (const el of all) { if (el.id) ids.push(el.id); if (el.__h) bound.push(el.id || (el.tagName.toLowerCase() + '.' + String(el.className && el.className.baseVal !== undefined ? '' : el.className).split(' ')[0])); }
      return { n: all.length, bound: bound.sort(), ids: ids.sort(), on: s.classList.contains('on') };
    }, id);
  }
  return out;
}
