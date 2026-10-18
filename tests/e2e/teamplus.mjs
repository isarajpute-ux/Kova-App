/* The AI team's p31 additions in a real browser, at phone size, signed
   in, in dark, soft light and light glass (and on iPhone's engine with
   ENGINE=webkit):
     Team chat   tap the Chat pill, tap @Sage and @Maya, send; both answer
                 in turn (the server is answered by this test), the box
                 stays usable, nothing runs off the side of the screen
     Do it again a finished job offers Do it again / Save as a skill /
                 Make it a routine; the routine picker opens and saves
     Routines    the ready-made routines have working switches
     Watch       the Research teammate's page has the Watch a page form
     node tests/e2e/teamplus.mjs          (after npm run build) */
import { chromium, webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = join(root, 'tests', 'e2e', 'shots'); mkdirSync(shots, { recursive: true });
const R = []; const ck = (n, c) => R.push([n, !!c]);
const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
const b = await engine.launch();
const site = await serve(join(root, 'dist'));

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

for (const theme of ['dark', 'soft', 'light']) {
  const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live',
    'kova_profile_v2': JSON.stringify({ theme, tourSeen: true }), 'kova.crew.meet.v1': JSON.stringify({ at: 1, skipped: true }) });
  const o = await openPage(b, null, { storage: STORE });
  const { context, page } = o;
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await context.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  const steps = [];
  await context.route(/\/crew\/step$/, async (r) => {
    const body = JSON.parse(r.request().postData() || '{}'); steps.push(body);
    const who = /You are (\w+)/.exec(body.system || '');
    const text = who && who[1] === 'Sage' ? 'Eat 140 g protein on leg day, Tuesday.' : 'Post the leg day on Tuesday at 6 pm, with the protein tip.';
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text }], usage: null }) });
  });
  await context.route(/\/crew\/(cloud|inbox|inbox\/ack)$/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, items: [] }) }));
  await page.goto(site.url + '/index.html');
  await page.waitForFunction(() => window.KovaTeamPlus && window.KovaCrew && window.KovaCrew.emps().length > 0, null, { timeout: 30000 });
  await page.evaluate(() => { go('workteam'); });
  await page.waitForTimeout(500);
  await page.locator('.crd-nav .crd-pill[data-n="chat"]').click();
  await page.waitForSelector('#tpChat');
  await page.locator('[data-tp="at"][data-n="Sage"]').click();
  await page.locator('[data-tp="at"][data-n="Maya"]').click();
  await page.locator('#tpChat').type('plan this week’s posts around my training');
  await page.locator('[data-tp="chatsend"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.tp-m.mate .tp-say').length >= 2, null, { timeout: 15000 }).catch(() => {});
  const chat = await page.evaluate(() => ({
    text: (document.querySelector('.tp-chat') || {}).textContent || '',
    over: document.documentElement.scrollWidth - window.innerWidth,
    box: (() => { const r = document.querySelector('.tp-cbox').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: window.innerHeight }; })(),
    send: getComputedStyle(document.querySelector('[data-tp="chatsend"]')).backgroundColor,
    bubble: (() => { const y = document.querySelector('.tp-m.you .tp-b'); const s = y && getComputedStyle(y); return s ? [s.backgroundColor, s.color] : null; })()
  }));
  ck(theme + ': Sage then Maya answer in the team chat', /140 g protein/.test(chat.text) && /Post the leg day/.test(chat.text) && steps.length >= 2 && /already answered/.test(JSON.stringify(steps[1].messages)));
  ck(theme + ': nothing runs off the side of the phone', chat.over <= 1);
  ck(theme + ': the chat box stays on screen', chat.box.bottom <= chat.box.h + 1 && chat.box.top < chat.box.h);
  ck(theme + ': your message bubble has readable contrast', chat.bubble && chat.bubble[0] !== chat.bubble[1]);
  await page.screenshot({ path: join(shots, `teamplus-chat-${theme}.png`) });

  /* do it again on the finished job, on Sage's page */
  await page.evaluate(() => { const s = KovaCrew.emps().filter((e) => e.n === 'Sage')[0]; KovaCrew.openMate(s.id); });
  await page.waitForSelector('.tp-again');
  const ag = await page.locator('.tp-again').first().textContent();
  ck(theme + ': a finished job offers Do it again, Save as a skill, Make it a routine', /Do it again/.test(ag) && /Save as a skill/.test(ag) && /Make it a routine/.test(ag));
  await page.locator('.tp-again [data-tp="pick"]').first().click();
  await page.waitForSelector('.tp-pick');
  await page.locator('.tp-pick [data-tpf="freq"]').selectOption('weekdays');
  await page.locator('.tp-pick [data-tp="picksave"]').click();
  const every = await page.evaluate(() => { const s = KovaCrew.emps().filter((e) => e.n === 'Sage')[0]; return ((s.skills || [])[0] || {}).every || null; });
  ck(theme + ': Make it a routine saves a weekday schedule', every && every.freq === 'weekdays');
  await page.locator('.tp-again').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(shots, `teamplus-again-${theme}.png`) });

  /* ready-made routines */
  await page.locator('.crd-nav .crd-pill[data-n="routines"]').click();
  await page.waitForSelector('.tp-starters');
  await page.locator('.tp-starters [data-tp="starter"][data-k="brief"]').click();
  const on = await page.locator('.tp-starters [data-tp="starter"][data-k="brief"]').getAttribute('aria-checked');
  ck(theme + ': the Morning brief switch turns on', on === 'true');
  await page.screenshot({ path: join(shots, `teamplus-routines-${theme}.png`) });

  /* watch a page */
  await page.locator('.tp-starters [data-tp="openwatch"]').click();
  await page.waitForSelector('#tpWatch');
  const wv = await page.evaluate(() => { const r = document.getElementById('tpWatch').getBoundingClientRect(); return { w: r.width, over: document.documentElement.scrollWidth - window.innerWidth }; });
  ck(theme + ': Watch a page opens on the Research teammate, inside the screen', wv.w > 200 && wv.over <= 1);
  await page.screenshot({ path: join(shots, `teamplus-watch-${theme}.png`) });
  ck(theme + ': no page errors', !errs.length || (console.error(errs.slice(0, 3)), false));
  await context.close();
}
await b.close(); site.close();
const bad = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS' : 'FAIL') + ' ' + x[0]));
console.log(`${R.length - bad.length}/${R.length} passing`);
process.exit(bad.length ? 1 : 0);
