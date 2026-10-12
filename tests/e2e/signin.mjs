/* The email sign-in in a real browser (server answered locally):
   a slip in the email gets a "Did you mean", a typed code waits a beat
   before it is checked, a wrong code keeps the digits and says how many
   tries are left, and the right code ends on "You're in". Run with
   SHOTS=1 to save screenshots in .look/. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, FIREBASE_STUB } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const b = await chromium.launch();
const site = await serve(join(root, 'dist'));
const { context, page, pageErrors } = await openPage(b, null, { storage: {} });
let verifies = 0, codeAt = [];
await context.route(/\/api\/auth\/code$/, (r) => { codeAt.push(Date.now()); r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); });
await context.route(/\/api\/auth\/verify$/, (r) => {
  verifies++; const body = JSON.parse(r.request().postData() || '{}');
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(body.code === '123456' ? { ok: true, name: 'Sam' } : { ok: false, left: 4 }) });
});
await page.goto(site.url + '/index.html', { waitUntil: 'load' });
await page.waitForSelector('#afEmail', { timeout: 15000 });
const shot = async (n) => { if (process.env.SHOTS) await page.screenshot({ path: join(root, '.look', n + '.png') }); };

await page.fill('#afEmail', ' Sam@Gmial.con ');
await page.waitForTimeout(100);
ck('a misspelt domain gets a gentle "Did you mean", not an error', /did you mean/i.test(await page.textContent('#afTip')) && /sam@gmail\.com/.test(await page.textContent('#afTip')));
await shot('signin-suggest');
await page.click('#afFix');
ck('one tap fixes it', (await page.inputValue('#afEmail')) === 'sam@gmail.com' && !(await page.isDisabled('#afSend')));
await page.click('#afSend');
await page.waitForSelector('#afYear', { timeout: 5000 });
ck('the first way in asks the date of birth (16 and over), neutrally', (await page.isDisabled('#afAgeGo')) && /16 and over/.test(await page.textContent('#authInner')) && !!(await page.$('#afDay')) && !!(await page.$('#afMonth')));
await page.selectOption('#afDay', '31'); await page.selectOption('#afMonth', '1'); await page.selectOption('#afYear', '1990');
ck('31 February is not a date: Continue stays off and it says why', (await page.isDisabled('#afAgeGo')) && /February 1990 has no day 31/.test(await page.textContent('#afAgeErr')));
await page.selectOption('#afDay', '14'); await page.selectOption('#afMonth', '5');
await page.selectOption('#afYear', String(new Date().getFullYear() - 30));
await page.click('#afAgeGo');
await page.waitForSelector('#afCode1', { timeout: 5000 });
ck('only the yes is kept, not the birthday', await page.evaluate(() => { const v = localStorage.getItem('kova.age16'); return !!v && !/19\d\d|20\d\d-/.test(v.replace(/"at":\d+/, '')); }));
ck('the code step slides in after the email', await page.evaluate(() => document.getElementById('authInner').classList.contains('af-in')));
await page.type('#afCode1', '123465', { delay: 40 });
await page.waitForTimeout(250);
ck('a typed code is not checked the instant the sixth digit lands', verifies === 0);
await page.waitForTimeout(900);
ck('it is checked after a short pause', verifies === 1);
await page.waitForTimeout(150);
const tip = await page.textContent('#afTip');
ck('a wrong code says how many tries are left, calmly', /do not match/.test(tip) && /4 tries left/.test(tip) && await page.evaluate(() => document.getElementById('afCodeW').classList.contains('soft')));
ck('and the digits are kept to fix', (await page.inputValue('#afCode1')) === '123465');
await shot('signin-wrong');
ck('"Send a new code" waits 30 s before it can be tapped again', /in \d+ s/.test(await page.textContent('#afWait')));
await page.fill('#afCode1', '123456');
await page.waitForTimeout(80);
await page.keyboard.press('Enter');
await page.waitForSelector('.af-done', { timeout: 5000 }).catch(() => {});
ck('the right code ends on "You\'re in"', /You.re in, Sam/.test(await page.textContent('#authInner')));
await shot('signin-done');
ck('no page errors', pageErrors.length === 0 || (console.error(pageErrors), false));
await context.close();
/* someone under 16 */
const kid = await openPage(b, null, { storage: {} });
await kid.page.goto(site.url + '/index.html', { waitUntil: 'load' });
await kid.page.waitForSelector('#authSkip', { timeout: 15000 });
ck('the welcome screen says continuing means agreeing to the Terms and the Privacy Policy', /agree to the Terms/.test(await kid.page.textContent('#authInner')));
await kid.page.click('#authSkip');
await kid.page.waitForSelector('#afYear');
/* sixteen tomorrow is still fifteen today */
const tmr = new Date(Date.now() + 864e5);
await kid.page.selectOption('#afDay', String(tmr.getDate())); await kid.page.selectOption('#afMonth', String(tmr.getMonth()));
await kid.page.selectOption('#afYear', String(tmr.getFullYear() - 16));
await kid.page.click('#afAgeGo');
await kid.page.waitForTimeout(300);
ck('under 16 (even turning 16 tomorrow): Kova stops there, nothing saved', /16 and over/.test(await kid.page.textContent('#authInner')) && !(await kid.page.evaluate(() => localStorage.getItem('kova.age16'))) && !(await kid.page.$('#afYear')));
await kid.context.close();
/* Firebase answering "nobody signed in" while the page is still loading
   (what the real one does) used to open its sign-in sheet on top of the
   welcome screen: two sign-in screens stacked */
const early = await openPage(b, null, { storage: {} });
await early.context.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat\.js/, (r) => r.fulfill({ contentType: 'text/javascript', body: FIREBASE_STUB.replace('setTimeout(function(){cb(null)},0)', 'cb(null)') }));
await early.page.goto(site.url + '/index.html', { waitUntil: 'load' });
await early.page.waitForSelector('#afEmail', { timeout: 15000 });
await early.page.waitForTimeout(600);
ck('one sign-in screen, not two stacked', await early.page.evaluate(() => getComputedStyle(document.getElementById('kova-auth-modal')).display === 'none'));
ck('the welcome screen has a line where Google and Apple problems are shown', !!(await early.page.$('#afErr')));
await early.context.close(); await b.close(); site.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
