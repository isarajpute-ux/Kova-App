/* Work OS media, in a real browser (p29): what you put in gets read.
     Studio   a real clip is recorded in the browser and added to a post;
              "Check my photo or clip" sends 4 stills to Kova's AI (answered
              by this test) and shows the review; "Use this caption" puts it
              in the post
     Files    a text file and a photo are added to a folder; the files are
              kept on the device (they used to be a name and a dead link),
              "Read it" reads them, and the to-dos become tasks
   In dark and light glass, at phone size, signed in.
     node tests/e2e/worklook.mjs          (after npm run build) */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const b = await chromium.launch();
const site = await serve(join(root, 'dist'));

/* a 6-second clip, made in the browser */
const maker = await b.newPage();
await maker.goto(site.url + '/licenses.html').catch(() => {});
const clip = await maker.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 360; c.height = 640; const x = c.getContext('2d');
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' }), parts = [];
  rec.ondataavailable = (e) => parts.push(e.data); rec.start(200); const t0 = performance.now();
  await new Promise((done) => { (function f() { const t = (performance.now() - t0) / 1000;
    x.fillStyle = '#204060'; x.fillRect(0, 0, 360, 640); x.fillStyle = '#f0c040'; x.beginPath(); x.arc(180, 120 + t * 60, 40, 0, 7); x.fill();
    if (t < 6) requestAnimationFrame(f); else done(); })(); });
  rec.stop(); await new Promise((r) => (rec.onstop = r));
  const blob = new Blob(parts, { type: 'video/webm' });
  return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(blob); });
});
await maker.close();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR42mP8z8AARIwMjAwMAB0SAgJ0Bd6vAAAAAElFTkSuQmCC', 'base64');

const STUB = `(function(){
  var u={uid:'u1',email:'me@test.dev',isAnonymous:false,getIdToken:function(){return Promise.resolve('tok-1')}};
  var auth={currentUser:u,onAuthStateChanged:function(cb){setTimeout(function(){cb(u)},0);return function(){}},onIdTokenChanged:function(cb){setTimeout(function(){cb(u)},0);return function(){}},
    signOut:function(){return Promise.resolve()},setPersistence:function(){return Promise.resolve()}};
  function A(){ return auth; } A.GoogleAuthProvider=function(){ this.addScope=function(){}; this.setCustomParameters=function(){}; }; A.OAuthProvider=A.GoogleAuthProvider; A.Auth={Persistence:{LOCAL:'local'}};
  function ref(){ var r={child:function(){return r},set:function(){return Promise.resolve()},update:function(){return Promise.resolve()},remove:function(){return Promise.resolve()},
    once:function(){return Promise.resolve({val:function(){return null},exists:function(){return false}})},on:function(){},off:function(){},push:function(){return r},
    orderByChild:function(){return r},limitToLast:function(){return r},equalTo:function(){return r}}; return r; }
  function D(){ return {ref:ref,goOnline:function(){},goOffline:function(){}}; } D.ServerValue={TIMESTAMP:0};
  window.firebase={apps:[],initializeApp:function(){window.firebase.apps.push({});return {}},auth:A,database:D,analytics:function(){return {logEvent:function(){},setUserId:function(){},setUserProperties:function(){}}}};
})();`;
const asks = [];
async function boot(theme) {
  const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', 'kova_profile_v2': JSON.stringify(theme ? { theme, tourSeen: true } : { tourSeen: true }) });
  const o = await openPage(b, null, { storage: STORE });
  await o.context.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await o.context.route(/\/api\/ai\/ask$/, async (r) => {
    const body = JSON.parse(r.request().postData() || '{}'); asks.push(body);
    let text = '{}';
    if (/review the media/.test(body.system)) text = JSON.stringify({ seen: 'A yellow ball drops across a blue background.', hook: { verdict: 'ok', why: 'Frame 1 shows the ball at the top, nothing happening yet.', fix: 'Start mid-drop.' },
      checks: [{ area: 'Framing', verdict: 'good', note: 'The ball stays centred.', fix: '' }, { area: 'Text on screen', verdict: 'unclear', note: 'No text in the frames.', fix: 'Add a short title in the top third.' }],
      apps: [{ app: 'TikTok', note: 'Vertical, fits full screen.' }], caption: 'A ball, a drop, six seconds.', tags: '#motion #loop' });
    if (/You read one file/.test(body.system)) text = JSON.stringify({ what: 'Launch notes.', summary: 'Launch is on Friday.', points: ['Friday launch'], todos: [{ title: 'Email the press list', due: 'Thursday' }], questions: [] });
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text }] }) });
  });
  await o.page.goto(site.url + '/index.html', { waitUntil: 'load' });
  await o.page.evaluate(() => { if (window.__kovaLoadWork) __kovaLoadWork(); });
  await o.page.waitForFunction(() => window.__kovaLazyDone && window.KovaLook && window.KovaFileAI && window.KovaCanvas && window.KovaModel && KovaModel.viaServer(), null, { timeout: 40000 });
  await o.page.evaluate(() => { try { Object.keys(KovaScreenTour.TOURS).concat(['work', 'studio']).forEach((k) => KovaTour.mark(k)); } catch (e) {} });
  return o;
}

for (const theme of ['dark', 'light']) {
  const { context, page, pageErrors } = await boot(theme);
  /* Studio: a real clip, then the review */
  await page.evaluate(() => go('workstudio')); await page.waitForTimeout(900);
  await page.setInputFiles('#ksFile', { name: 'drop.webm', mimeType: 'video/webm', buffer: Buffer.from(clip, 'base64') });
  await page.waitForFunction(() => { const p = KovaCanvas._post(); return p && p.media && p.media.length && p.media[0].dur > 0; }, null, { timeout: 20000 }).catch(() => {});
  const n0 = asks.length;
  await page.evaluate(() => KovaCanvas._act ? KovaLook.open(KovaCanvas._post()) : null);
  await page.waitForFunction(() => /Use this caption/.test((document.getElementById('sheet') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
  const lk = asks.slice(n0).find((x) => /review the media/.test(x.system));
  const imgs = lk ? lk.messages[0].content.filter((x) => x.type === 'image') : [];
  ck(theme + ': a real clip’s stills (4, as JPEG photos) go to Kova’s AI', imgs.length === 4 && imgs.every((x) => x.source.media_type === 'image/jpeg' && x.source.data.length > 500));
  const sh = await page.evaluate(() => document.getElementById('sheet').innerText);
  ck(theme + ': the review shows what it shows, the opening, the checks and a caption', /What it shows/.test(sh) && /Could be stronger/.test(sh) && /Start mid-drop/.test(sh) && /Can’t tell from stills/.test(sh) && /A ball, a drop, six seconds/.test(sh));
  await page.screenshot({ path: join(tmpdir(), 'worklook-studio-' + theme + '.png') }).catch(() => {});
  await page.click('[data-klk="cap"]');
  ck(theme + ': "Use this caption" puts it in the post', await page.evaluate(() => KovaCanvas._post().caption === 'A ball, a drop, six seconds.'));
  await page.evaluate(() => closeSheet());

  /* Files: add a text file and a photo, they survive a reload, Read it */
  const fid = await page.evaluate(() => WorkOS.create('folders', { name: 'Launch' }, 'user').id);
  await page.evaluate(() => go('workfiles')); await page.waitForTimeout(300);
  await page.evaluate((id) => { const e = document.querySelector('#s-workfiles [data-id="' + id + '"]') || [...document.querySelectorAll('#s-workfiles *')].find((x) => x.textContent.trim() === 'Launch'); e && e.click(); }, fid);
  await page.waitForTimeout(400);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#wfoPick')]);
  await fc.setFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Launch Friday. Email the press list by Thursday.') }, { name: 'logo.png', mimeType: 'image/png', buffer: PNG }]);
  await page.waitForFunction(() => document.querySelectorAll('#wfoBody .wfoRead').length === 2, null, { timeout: 10000 }).catch(() => {});
  const thumb = await page.evaluate(() => { const i = document.querySelector('#wfoBody .fthumb img'); return i ? i.getAttribute('src').slice(0, 15) : ''; });
  ck(theme + ': a photo’s picture is kept as a small image, not a link that dies on reload', /^data:image\/jpeg/.test(thumb));
  /* what a reload keeps: the record (no blob: link) and the bytes in this device's file store */
  const kept = await page.evaluate(() => new Promise((ok) => {
    const f = WorkOS.list('files').find((x) => x.n === 'notes.txt'); if (!f) return ok(null);
    const rq = indexedDB.open('kova-studio', 1);
    rq.onsuccess = () => { const g = rq.result.transaction('media', 'readonly').objectStore('media').get(f.blob); g.onsuccess = () => ok({ url: f.url || '', bytes: g.result ? g.result.size : 0 }); g.onerror = () => ok({ bytes: 0 }); };
    rq.onerror = () => ok({ bytes: 0 });
  }));
  ck(theme + ': the file itself is kept on this device (it used to be a name and a link that died on reload)', kept && kept.bytes > 20 && !/^blob:/.test(kept.url));
  const rec = await page.evaluate(() => WorkOS.list('files').find((f) => f.n === 'notes.txt'));
  const n1 = asks.length;
  await page.evaluate((id) => KovaFileAI.open(WorkOS.find('files', id)), rec.id);
  await page.waitForFunction(() => /Add it as tasks|Add these/.test((document.getElementById('sheet') || {}).textContent || ''), null, { timeout: 20000 }).catch(() => {});
  const fr = asks.slice(n1).find((x) => /You read one file/.test(x.system));
  ck(theme + ': "Read it" reads the file and sends its words', fr && /Email the press list by Thursday/.test(JSON.stringify(fr)));
  await page.waitForTimeout(700);
  ck(theme + ': the file pop-up sits fully on screen', await page.evaluate(() => { const r = document.getElementById('sheet').getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1; }));
  await page.screenshot({ path: join(tmpdir(), 'worklook-files-' + theme + '.png') }).catch(() => {});
  await page.click('[data-kfa="tasks"]');
  ck(theme + ': its to-do becomes a task', await page.evaluate(() => WorkOS.list('items').some((i) => i.name === 'Email the press list')));
  ck(theme + ': no page errors', !pageErrors.length);
  if (pageErrors.length) console.log(pageErrors);
  await context.close();
}
await b.close(); site.close();
const bad = R.filter((r) => !r[1]);
R.forEach((r) => console.log((r[1] ? 'ok   ' : 'FAIL ') + r[0]));
console.log(bad.length ? bad.length + ' failed' : 'all ' + R.length + ' passed');
process.exit(bad.length ? 1 : 0);
