/* Form Check with a real video, in a real browser (p28/p29).

   A 10-second clip of a figure doing five squat-like reps is drawn and
   recorded in the browser itself (WebM from MediaRecorder, which, like
   many browser-made clips, carries no length; Form Check must still read
   it). Then, signed in, the way a person would:
     upload it          Kova measures the reps from the motion
     the plan           sets, reps and rest follow your goal
     Check my technique still frames from the reps go to Kova's AI (the
                        server is answered by this test), at most 6, as
                        JPEG photos, and the review shows each finding
     Add to my program  the lift really lands first on the matching day
     node tests/e2e/formai.mjs          (after npm run build) */
import { chromium, webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const b = await chromium.launch();
const site = await serve(join(root, 'dist'));

/* 1. the clip */
const b0 = b; const maker = await b0.newPage();
await maker.goto(site.url + '/licenses.html').catch(() => {});
const clip = await maker.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 360; c.height = 640; const x = c.getContext('2d');
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' }); const parts = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  const T = 10000, REP = 1.8, t0 = performance.now();
  rec.start(200);
  await new Promise((done) => {
    (function frame() {
      const t = (performance.now() - t0) / 1000;
      const k = t < 0.5 || t > 9.5 ? 0 : (1 - Math.cos(2 * Math.PI * (t - 0.5) / REP)) / 2;
      x.fillStyle = '#2a2d33'; x.fillRect(0, 0, 360, 640);
      x.fillStyle = '#3c4048'; for (let i = 0; i < 8; i++) x.fillRect(i * 48, 560, 30, 80);
      const y = 120 + k * 150;
      x.fillStyle = '#e8c39e'; x.beginPath(); x.arc(180, y, 30, 0, 7); x.fill();
      x.fillStyle = '#4f7bd9'; x.fillRect(140, y + 34, 80, 170 - k * 60);
      x.fillStyle = '#e04e4e'; x.fillRect(90, y + 40, 180, 14);
      x.fillStyle = '#222'; x.fillRect(150, y + 204 - k * 60, 22, 560 - (y + 204 - k * 60)); x.fillRect(188, y + 204 - k * 60, 22, 560 - (y + 204 - k * 60));
      if (t * 1000 < T) requestAnimationFrame(frame); else done();
    })();
  });
  rec.stop(); await new Promise((r) => (rec.onstop = r));
  const blob = new Blob(parts, { type: 'video/webm' });
  return await new Promise((r) => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(blob); });
});
await maker.close();
ck('a test clip was recorded in the browser', clip && clip.length > 10000);

/* 2. signed in (a real account, not a guest), Kova's AI answered by this test */
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
const PLAN = { name: 'bb', days: [{ n: 'Push day', ex: [{ e: 'Bench press', s: 3, r: 10 }] }, { n: 'Lower day', ex: [{ e: 'Leg press', s: 3, r: 10 }] }] };
const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), 'kova.tours.v1': JSON.stringify({ home: 1, move: 1 }),
  'kova_profile_v2': JSON.stringify({ quiz: { a: { goal: 3, exp: 1, days: 4, mins: 60, bw: 180 }, goal: 'powerlifting', days: 4, mins: 60, at: 1 }, plan: PLAN, tourSeen: true }) });
const bw = process.env.ENGINE === 'webkit' ? await webkit.launch() : b;
const { context, page, pageErrors } = await openPage(bw, null, { storage: STORE });
await context.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
const asks = [];
await context.route(/\/api\/ai\/ask$/, async (r) => {
  const body = JSON.parse(r.request().postData() || '{}'); asks.push({ body, auth: r.request().headers().authorization });
  const n = ((body.messages || [])[0] || { content: [] }).content.filter((x) => x.type === 'image').length;
  if (/You name the exercise/.test(body.system)) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ exercise: 'Back squat', match: 'Back squat', pattern: 'squat', equipment: 'barbell', view: 'side', confidence: 92, also: ['Front squat'], why: 'A bar on the upper back and the hips sink to knee height.' }) }] }) });
  await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ view: 'side', overall: 'Depth is consistent across the set.',
    findings: [{ area: 'Depth', seen: 'Hips reach knee height in frame 2', verdict: 'good', cue: 'Keep it', frames: [2] },
      { area: 'Bar path', seen: 'The bar drifts forward in frame ' + n, verdict: 'fix', cue: 'Keep the bar over mid-foot', frames: [n] },
      { area: 'Knees', seen: 'Knees are hidden behind the bar in this angle', verdict: 'unclear', cue: 'Film from the side', frames: [] }], safety: '' }) }] }) });
});
await page.goto(site.url + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__kovaLazyDone && window.KovaFormAI && window.KovaGoal && window.KovaModel && KovaModel.viaServer(), null, { timeout: 30000 });
ck('signed in with no key of your own, Kova’s AI is on', await page.evaluate(() => KovaModel.connected() && KovaModel.providerName() === 'Kova’s AI'));

/* 3. upload it */
await page.evaluate(() => go('formcheck'));
const t0 = Date.now();
await page.setInputFiles('#fcFile', { name: 'squat.webm', mimeType: 'video/webm', buffer: Buffer.from(clip, 'base64') });
const got = await page.waitForFunction(() => {
  const r = document.getElementById('fcResult'); if (r && r.style.display === 'block' && document.getElementById('fcAI')) return 'result';
  if (document.getElementById('fcSetup').style.display !== 'none' && /Pick the exercise/.test(document.getElementById('fcDetected').textContent)) return 'pick';
  if (/could not (read|be opened)/i.test(document.getElementById('s-formcheck').textContent)) return 'unreadable';
  return false;
}, null, { timeout: 60000, polling: 200 }).then((h) => h.jsonValue()).catch(() => 'timeout');
const secs = (Date.now() - t0) / 1000, clipLen = await page.evaluate(() => document.getElementById('fcVideo').duration);
console.log('read a ' + clipLen.toFixed(1) + ' s clip in ' + secs.toFixed(1) + ' s');
ck('a clip with no stated length is still read (not "could not read this video")', got === 'result' || got === 'pick');
const named = asks.filter((a) => /You name the exercise/.test(a.body.system));
const nImgs = named.length ? named[0].body.messages[0].content.filter((x) => x.type === 'image') : [];
ck('Kova’s AI is asked to name the exercise, from 4 stills of the clip (JPEG photos)', named.length === 1 && nImgs.length === 4 && nImgs.every((x) => x.source.media_type === 'image/jpeg' && x.source.data.length > 1000));
const det = await page.evaluate(() => ({ t: document.getElementById('fcDetected').innerText, list: document.getElementById('fcPickWrap').style.display }));
ck('the exercise is named for you: "Kova identified this: Back squat", with one-tap alternatives and no list to scroll', /KOVA IDENTIFIED THIS/i.test(det.t) && /Back squat/.test(det.t) && /Front squat/.test(det.t) && det.list !== 'block');
ck('the clip is read fast: tracking plus naming within 20 s (it used to take over a minute on a phone)', got === 'result' && secs < 20);
if (got === 'pick') {
  await page.fill('#fcSearch', 'squat');
  await page.click('#fcLiftList .fcl');
  await page.waitForFunction(() => document.getElementById('fcResult').style.display === 'block' && document.getElementById('fcAI'), null, { timeout: 15000 });
}
const res = await page.evaluate(() => document.getElementById('fcResult').innerText);
const lift = await page.evaluate(() => (document.querySelector('#fcResult .title-s') || {}).textContent || '');
const measured = await page.evaluate(() => (document.getElementById('fcMeasured').innerText || '') + ' ' + document.getElementById('fcResult').innerText);
console.log('lift:', lift, '| reps line:', (measured.match(/\d+ reps?[^\n]*/i) || [''])[0]);
ck('the plan is for the lift Kova named', lift.trim() === 'Back squat');
ck('reps and rest follow your goal (powerlifting: low reps, long rest)', /REPS\s*\n?\s*[1-5]-[3-6]/.test(res) && /3–5 min/.test(res) && /set for your goal: Powerlifting/.test(res));
ck('Check my technique is offered, signed in', /Check my technique/.test(res));

/* 4. the AI review */
await page.click('#fcAI [data-fai="run"]');
await page.waitForFunction(() => /Bar path/.test(document.getElementById('fcAI').textContent) || /did not work/.test(document.getElementById('fcAI').textContent), null, { timeout: 30000 });
const tech = asks.filter((a) => !/You name the exercise/.test(a.body.system));
const ai = tech[tech.length - 1] || { body: { messages: [{ content: [] }] } };
const imgs = ai.body.messages[0].content.filter((x) => x.type === 'image');
ck('frames from the set went to Kova’s AI with your sign-in, not a key', tech.length === 1 && ai.auth === 'Bearer tok-1' && asks.every((a) => a.auth === 'Bearer tok-1'));
ck('between 3 and 6 frames, each a JPEG photo', imgs.length >= 3 && imgs.length <= 6 && imgs.every((x) => x.source.media_type === 'image/jpeg' && x.source.data.length > 1000));
ck('the request is small enough for the server (under 4.5 MB)', JSON.stringify(ai.body).length < 4.5e6);
const review = await page.evaluate(() => document.getElementById('fcAI').innerText);
const strip = await page.evaluate(() => document.querySelectorAll('#fcAI .fai-strip img').length);
ck('the review shows the frames and each finding: good, fix, can’t tell', strip === imgs.length && /Good/.test(review) && /Fix/.test(review) && /Can’t tell from this angle/.test(review) && /Cue: Keep the bar over mid-foot/.test(review));
ck('it says it is the AI’s read and which angle it saw', /AI read/.test(review) && /filmed from the side/.test(review));

/* 5. add it to the plan */
await page.click('#fcAdd');
const plan = await page.evaluate(() => KP.get('plan'));
const want = /press|bench|push/i.test(lift) ? /Push/ : /Lower/, other = /Push/.test(String(want)) ? /Lower/ : /Push/;
const day = plan.days.find((d) => want.test(d.n)), rest = plan.days.find((d) => other.test(d.n));
ck('Add to my program puts the lift first on the matching day, and nowhere else', day && day.ex[0].e === lift.trim() && rest.ex.length === 1);

ck('no page errors', !pageErrors.length);
if (pageErrors.length) console.log(pageErrors);
if (bw !== b) await bw.close();
await b.close(); site.close();
const bad = R.filter((r) => !r[1]);
R.forEach((r) => console.log((r[1] ? 'ok   ' : 'FAIL ') + r[0]));
console.log(bad.length ? bad.length + ' failed' : 'all ' + R.length + ' passed');
process.exit(bad.length ? 1 : 0);
