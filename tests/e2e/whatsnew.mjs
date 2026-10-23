/* p34 in a real browser, phone size, live mode, dark / soft light / light
   glass (and iPhone's engine with ENGINE=webkit): a returning user gets
   the "New in Kova" card; Show me walks the light to the newest things
   (p38: the Dream physique card on Workout); the Zone 2 page tour plays
   above the page the first time it opens.
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
const seen = { home: 1, today: 1, move: 1, workteam: 1, session: 1, customize: 1, 'new-2026-10-24': 1 };
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
  ck(theme + ': Show me goes to Workout and lights up Kova in the sidebar (Ask Kova)', c1.t === 'Ask Kova' && c1.scr === 's-move');
  const spot = async (sel) => p.evaluate((sel) => { const s = document.getElementById('ksSpot').getBoundingClientRect(), k = document.querySelector(sel).getBoundingClientRect(); return s.left <= k.left + 2 && s.right >= k.right - 2 && s.top <= k.top + 2; }, sel);
  await p.waitForTimeout(900);                                  /* the light slides into place */
  ck(theme + ': …with the light around it', await spot('#kgOrb'));
  await p.locator('#ksCoach [data-t="next"]').click(); await p.waitForTimeout(1100);
  ck(theme + ': …then the ? beside Workout\u2019s title (tours for every card)', (await p.evaluate(() => (document.querySelector('#ksCoach .ks-ct') || {}).textContent)) === 'Tours for every card' && await spot('#s-move .kt-help'));
  await p.screenshot({ path: join(shots, `whatsnew-step1-${theme}.png`) });
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
