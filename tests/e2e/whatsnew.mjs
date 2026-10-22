/* p34 in a real browser, phone size, live mode, dark / soft light / light
   glass (and iPhone's engine with ENGINE=webkit): a returning user gets
   the "New in Kova" card; Show me walks the light to the newest things
   (p35: the Muscle recovery card and Train what's fresh on Workout, then
   Follow along in the workout); the Zone 2 page tour plays above the page
   the first time it opens.
     node tests/e2e/whatsnew.mjs          (after npm run build) */
import { chromium, webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = join(root, 'tests', 'e2e', 'shots'); mkdirSync(shots, { recursive: true });
const R = []; const ck = (n, c) => R.push([n, !!c]);
const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
const b = await engine.launch(); const site = await serve(join(root, 'dist'));
const seen = { home: 1, today: 1, move: 1, workteam: 1, session: 1, customize: 1 };
for (const theme of ['dark', 'soft', 'light']) {
  const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', 'kova.tours.v1': JSON.stringify(seen),
    kova_profile_v2: JSON.stringify({ theme, tourSeen: true, tours: seen }) });
  const { context, page: p } = await openPage(b, null, { storage: STORE });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(site.url + '/index.html');
  await p.waitForSelector('#kwn', { timeout: 20000 }).catch(() => {});
  const card = await p.evaluate(() => { const c = document.getElementById('kwn'); if (!c) return null; const r = c.getBoundingClientRect(); return { t: c.textContent, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, glass: getComputedStyle(c).backdropFilter || getComputedStyle(c).webkitBackdropFilter || '' }; });
  ck(theme + ': a returning user gets the "New in Kova" card, on screen, in Kova glass', card && /NEW IN KOVA/.test(card.t) && card.inView && /blur/.test(card.glass));
  await p.screenshot({ path: join(shots, `whatsnew-card-${theme}.png`) });
  await p.locator('#kwn [data-kwn="show"]').click();
  await p.waitForSelector('#ksCoach.on', { timeout: 8000 }).catch(() => {});
  const c1 = await p.evaluate(() => ({ t: (document.querySelector('#ksCoach .ks-ct') || {}).textContent, scr: (document.querySelector('.screen.on') || {}).id }));
  ck(theme + ': Show me goes to Workout and lights up Muscle recovery first', c1.t === 'Muscle recovery' && c1.scr === 's-move');
  const spot = async (id) => p.evaluate((id) => { const s = document.getElementById('ksSpot').getBoundingClientRect(), k = document.querySelector(id).getBoundingClientRect(); return s.left <= k.left + 2 && s.right >= k.right - 2 && s.top <= k.top + 2; }, id);
  await p.waitForTimeout(900);                                  /* the light slides into place */
  ck(theme + ': …with the light around the recovery card', await spot('#krcCard'));
  await p.screenshot({ path: join(shots, `whatsnew-step1-${theme}.png`) });
  await p.locator('#ksCoach [data-t="next"]').click(); await p.waitForTimeout(900);
  ck(theme + ': Next lights up Train what\u2019s fresh', await p.evaluate(() => (document.querySelector('#ksCoach .ks-ct') || {}).textContent) === 'Train what\u2019s fresh' && await spot('#krcCard [data-krc="fresh"]'));
  await p.locator('#ksCoach [data-t="next"]').click(); await p.waitForTimeout(1000);
  ck(theme + ': Next lights up the Stretch card beside it', await p.evaluate(() => (document.querySelector('#ksCoach .ks-ct') || {}).textContent) === 'Stretch' && await spot('#krsCard'));
  await p.locator('#ksCoach [data-t="next"]').click(); await p.waitForTimeout(1000);
  ck(theme + ': then the clearer exercise pictures (Exercises)', await p.evaluate(() => (document.querySelector('#ksCoach .ks-ct') || {}).textContent) === 'Pictures that show the work');
  await p.locator('#ksCoach [data-t="next"]').click(); await p.waitForTimeout(1300);
  const c3 = await p.evaluate(() => ({ t: (document.querySelector('#ksCoach .ks-ct') || {}).textContent, scr: (document.querySelector('.screen.on') || {}).id }));
  ck(theme + ': then the workout, with the light on Follow along', c3.t === 'Follow along' && c3.scr === 's-session' && await spot('.kpl-chip'));
  await p.screenshot({ path: join(shots, `whatsnew-player-${theme}.png`) });
  await p.locator('#ksCoach [data-t="next"]').click(); await p.waitForTimeout(1300);
  ck(theme + ': then Scan a machine, with the light on the new ways in', await p.evaluate(() => (document.querySelector('#ksCoach .ks-ct') || {}).textContent) === 'Scan any machine' && await spot('#s-machine .mc-ways'));
  await p.locator('#ksCoach [data-t="next"]').click(); await p.waitForTimeout(1300);
  ck(theme + ': and last the phone alerts in Settings', await p.evaluate(() => (document.querySelector('#ksCoach .ks-ct') || {}).textContent) === 'Alerts on your phone' && await p.evaluate(() => (document.querySelector('.screen.on') || {}).id) === 's-settings');
  await p.locator('#ksCoach [data-t="skip"]').click(); await p.waitForTimeout(400);
  ck(theme + ': Skip ends it, and the card does not come back', await p.locator('#ksTour').count() === 0 && await p.locator('#kwn').count() === 0);
  await p.evaluate(() => go('move')); await p.waitForTimeout(500);
  await p.locator('#kz2Card [data-z2="go"]').click();
  await p.waitForSelector('#ksCoach.on', { timeout: 8000 }).catch(() => {});
  const z = await p.evaluate(() => ({ t: (document.querySelector('#ksCoach .ks-ct') || {}).textContent, zi: +getComputedStyle(document.getElementById('ksTour')).zIndex, top: (() => { const r = document.getElementById('ksCoach').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + 10); return !!(el && el.closest('#ksTour')); })() }));
  ck(theme + ': the Zone 2 page plays its own tour the first time, above the page', z.t === 'Your run, live' && z.zi > 9500 && z.top);
  await p.screenshot({ path: join(shots, `whatsnew-z2tour-${theme}.png`) });
  ck(theme + ': no page errors', !errs.length || (console.error(errs.slice(0, 3)), false));
  await context.close();
}
await b.close(); site.close();
const bad = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS' : 'FAIL') + ' ' + x[0]));
console.log(`${R.length - bad.length}/${R.length} passing`);
process.exit(bad.length ? 1 : 0);
