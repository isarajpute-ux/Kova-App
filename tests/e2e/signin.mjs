/* The email sign-in in a real browser (server answered locally):
   a slip in the email gets a "Did you mean", a typed code waits a beat
   before it is checked, a wrong code keeps the digits and says how many
   tries are left, and the right code ends on "You're in". Run with
   SHOTS=1 to save screenshots in .look/. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage } from './harness.mjs';

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
await page.waitForSelector('#afCode1', { timeout: 5000 });
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
await context.close(); await b.close(); site.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
