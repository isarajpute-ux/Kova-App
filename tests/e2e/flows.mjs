/* The core journeys on the built site, by tapping, in a real browser at
   phone size (390 x 844) with Firebase stubbed: a new person skips sign-in,
   answers the three questions, logs a meal from search, finishes a
   one-set workout, opens GLP-1 mode from its card on Fuel and opens the
   plan screen. Any page error fails it.
     npm run build && node tests/e2e/flows.mjs */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const browser = await chromium.launch();
const site = await serve(join(root, 'dist'));
const { context, page, pageErrors } = await openPage(browser, site.url + '/index.html', {});
/* a first visit to a screen may start its short tour; a person taps Skip */
const skipTour = async () => { if (await page.locator('#ksTour [data-t="skip"]').count()) { await page.locator('#ksTour [data-t="skip"]').first().click(); await page.waitForTimeout(150); } };
const tap = async (sel) => { await skipTour(); await page.locator(sel).first().click(); };
const on = () => page.evaluate(() => (document.querySelector('.screen.on') || {}).id);

try {
  // ---------- first run ----------
  await page.waitForSelector('#authSkip', { timeout: 20000 });
  await tap('#authSkip');
  await page.waitForSelector('#afYear'); await page.selectOption('#afYear', '1995'); await tap('#afAgeGo');
  await page.waitForSelector('text=What do you want Kova for?');
  ck('a new person can skip sign-in and gets the first question', true);
  await tap('.ob-opt[data-v="fuel"]'); await tap('#obNext');
  await page.waitForSelector('text=Which body is Kova reading'); await tap('#obSkip');
  await page.waitForSelector('text=How active are you'); await tap('.ob-opt[data-v="4"]'); await tap('#obNext');
  await page.waitForSelector('[data-w="today"]'); await tap('[data-w="today"]');
  await page.waitForFunction(() => document.getElementById('s-home').classList.contains('on'), null, { timeout: 10000 });
  await page.waitForTimeout(600);
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.rail .rnav[data-go]')].filter((n) => n.offsetParent && n.getAttribute('data-go') !== 'settings').map((n) => n.getAttribute('data-go')));
  ck('three questions and a first win land on Today, with every area in the tab bar', JSON.stringify(tabs) === '["home","fuel","sleep","move","vitals","work"]');
  ck('nothing is hidden: Work OS is on Today and there is no More button', await page.evaluate(() => !!document.getElementById('osHero').offsetParent && !document.getElementById('kfMore')));

  // ---------- a meal from search ----------
  await tap('.rail .rnav[data-go="fuel"]');
  const k0 = await page.evaluate(() => KovaFuel.totals().kcal);
  await tap('#logBtn');
  await page.fill('#foodSearch', 'rice');
  await page.waitForSelector('#foodResults .foodpick');
  await tap('#foodResults .foodpick');
  await page.waitForTimeout(400);
  const k1 = await page.evaluate(() => KovaFuel.totals().kcal);
  ck('a meal is logged from search in three taps (' + k0 + ' -> ' + k1 + ' kcal)', k1 > k0 && await on() === 's-fuel');

  // ---------- a one-set workout ----------
  /* Fuel's first-visit tour may be running; the app moving elsewhere ends it */
  await page.waitForTimeout(1400);
  const tourOnFuel = await page.locator('#ksTour').count();
  await page.evaluate(() => go('move'));
  await page.waitForTimeout(300);
  ck('a tour ends when the app moves to a screen it does not cover (and stays there)', !tourOnFuel || (!(await page.locator('#ksTour').count()) && await on() === 's-move'));
  const n0 = await page.evaluate(() => JSON.parse(localStorage.getItem('kova_log_v1') || '[]').length);
  await tap('#startBtn');
  await page.waitForSelector('#s-session.on .sqb[data-qs="0-0-0"]');
  await tap('#s-session .sqb[data-qs="0-0-0"]');
  const sets = await page.textContent('#hudSets');
  await tap('#finishBtn');
  await page.waitForFunction(() => document.getElementById('s-sessdone').classList.contains('on'), null, { timeout: 10000 });
  const n1 = await page.evaluate(() => JSON.parse(localStorage.getItem('kova_log_v1') || '[]').length);
  ck('one set logged with one tap ("Same"), then Finish saves the session (' + sets.trim() + ')', /^1\//.test(sets.trim()) && n1 === n0 + 1);

  // ---------- GLP-1 mode from its card on Fuel ----------
  await page.evaluate(() => go('fuel'));
  await page.waitForSelector('#kg1Off');
  await tap('#kg1Off');
  await page.waitForFunction(() => /GLP-1/.test((document.getElementById('sheetIn') || {}).textContent || '') && document.getElementById('sheet').classList.contains('on'), null, { timeout: 5000 });
  ck('GLP-1 mode opens from its card on Fuel', true);
  await page.evaluate(() => closeSheet());

  // ---------- the plan ----------
  await page.evaluate(() => go('plan'));
  await page.waitForSelector('#planGo');
  const plan = await page.textContent('#s-plan');
  ck('the plan screen shows the price and the trial terms before any purchase', /\$\d+\.\d\d/.test(plan) && /days free/i.test(plan) && /remind you 2 days before/.test(plan) && /pay nothing/.test(plan));
} catch (e) {
  ck('journeys ran to the end (' + e.message.split('\n')[0] + ')', false);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  console.error(await page.evaluate(() => ({ on: (document.querySelector('.screen.on') || {}).id, tour: !!document.querySelector('#ksTour.on, .kt-tour.on, #ksTour'), top: (() => { const el = document.elementFromPoint(195, 600); return el && (el.id || el.className); })() })).catch(() => null));
}
const errs = await page.evaluate(() => window.__errs.slice()).catch(() => []);
ck('no page errors along the way', errs.length + pageErrors.length === 0 || (console.error(errs.concat(pageErrors).slice(0, 5)), false));
await context.close(); await browser.close(); site.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
