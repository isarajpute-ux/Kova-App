/* p33 Zone 2 running in a real browser, phone size, live mode, in dark,
   soft light and light glass (and iPhone's engine with ENGINE=webkit):
   the Zone 2 card under Training on Workout, Start -> outdoor run with
   the browser's GPS moving (emulated) and a heart-rate strap's readings
   (fed in the way the strap feeds them, KovaHR.push), the run screen
   fitting the phone, distance growing, the state changing colour, and
   Finish saving the run and showing it on the card.
     node tests/e2e/zone2.mjs          (after npm run build) */
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
for (const theme of ['dark', 'soft', 'light']) {
  const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', 'kova.z2.unit': JSON.stringify('km'),
    kova_profile_v2: JSON.stringify({ theme, tourSeen: true, me: { age: 30 } }) });
  const { context, page: p } = await openPage(b, null, { storage: STORE });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  if (process.env.ENGINE !== 'webkit') await context.grantPermissions(['geolocation']);
  let lat = 51.5; await context.setGeolocation({ latitude: lat, longitude: -0.12, accuracy: 6 });
  await p.goto(site.url + '/index.html');
  await p.waitForFunction(() => window.KovaZone2 && window.KovaHR, null, { timeout: 30000 });
  /* the once-per-screen tour can open a moment late: wait for it and close it */
  const skip = async () => { for (let i = 0; i < 8; i++) { if (await p.locator('#ksTour [data-t="skip"]').count()) { await p.locator('#ksTour [data-t="skip"]').first().click({ timeout: 3000 }).catch(() => {}); } await p.waitForTimeout(250); } };
  await p.evaluate(() => go('move')); await p.waitForTimeout(900); await skip();
  await p.waitForSelector('#kz2Card', { timeout: 8000 }).catch(() => {});
  const card = await p.evaluate(() => { const c = document.getElementById('kz2Card'); return c && { t: c.textContent, inside: !!c.parentNode.closest('.kv-card'), prev: c.previousElementSibling && c.previousElementSibling.className }; });
  ck(theme + ': the Zone 2 card sits under Training, not inside it, with your range (112–131 at 30)', card && /112–131/.test(card.t) && !card.inside && /kv-card|kl-acts/.test(card.prev));
  await p.locator('#kz2Card [data-z2="go"]').click(); await p.waitForTimeout(300);
  /* the page's own tour plays the first time (p34); close it like a person would */
  await p.waitForSelector('#ksCoach.on', { timeout: 4000 }).catch(() => {});
  ck(theme + ': the first time, the Zone 2 page shows you around', await p.locator('#ksCoach .ks-ct').count() === 1);
  await skip();
  const pg = await p.evaluate(() => { const el = document.getElementById('kz2'); return el && { inApp: !!el.closest('.app'), cards: el.querySelectorAll('.card').length, glass: getComputedStyle(el.querySelector('.card')).backdropFilter || getComputedStyle(el.querySelector('.card')).webkitBackdropFilter || '', font: getComputedStyle(el.querySelector('.title')).fontFamily }; });
  ck(theme + ': Open Zone 2 opens the page inside the app, in Kova\u2019s frosted glass and font', pg && pg.inApp && pg.cards >= 4 && /blur/.test(pg.glass) && /Outfit/.test(pg.font));
  await p.locator('#kz2 [data-z2="start"]').click(); await p.waitForTimeout(400);
  for (let i = 0; i < 12; i++) {
    lat += 0.000045; await context.setGeolocation({ latitude: lat, longitude: -0.12, accuracy: 6 });
    await p.evaluate((bpm) => window.KovaHR.push(bpm), i < 8 ? 122 : 150);
    await p.waitForTimeout(1050);
  }
  const live = await p.evaluate(() => { const el = document.getElementById('kz2'); return { num: el.querySelector('.kz2p-num').textContent, say: el.querySelector('.kz2p-say').textContent, bar: el.querySelector('.kz2p-t').textContent, over: document.documentElement.scrollWidth - innerWidth, tag: el.querySelector('.kz2p-gauge .kz2p-tag').textContent }; });
  ck(theme + ': the page shows your heart rate live and what to do', /150/.test(live.num) && /(Above Zone 2|In Zone 2)/.test(live.say));
  ck(theme + ': the heart-rate card names the zone you are in', /Zone 4/.test(live.tag));
  ck(theme + ': GPS distance grows as you move', process.env.ENGINE === 'webkit' || /0\.0[4-9] km/.test(live.bar));
  ck(theme + ': the page fits the phone', live.over <= 1);
  await p.screenshot({ path: join(shots, `zone2-run-${theme}.png`) });
  for (const c of ['bar', 'pie', 'line', 'funnel']) await p.locator(`#kz2 [data-z2="chart"][data-v="${c}"]`).click();
  ck(theme + ': Funnel, Bar, Pie and Line all draw', await p.locator('#kz2 .kz2p-ch ellipse').count() === 5);
  await p.evaluate(() => { const R = KovaZone2._R(); R.t0 -= 10 * 60000; });
  await p.locator('#kz2 [data-z2="finish"]').click(); await p.waitForTimeout(500);
  const sum = await p.locator('#kz2').textContent();
  ck(theme + ': Finish saves the run and the page shows it and the week', /Saved/.test(sum) && /measured in Zone 2 this week/.test(sum));
  await p.screenshot({ path: join(shots, `zone2-summary-${theme}.png`) });
  await p.locator('#kz2 [data-z2="close"]').first().click(); await p.waitForTimeout(400);
  ck(theme + ': the card shows the last run', /Last run/.test(await p.locator('#kz2Card').textContent()));
  await p.screenshot({ path: join(shots, `zone2-card-${theme}.png`) });
  ck(theme + ': no page errors', !errs.length || (console.error(errs.slice(0, 3)), false));
  await context.close();
}
await b.close(); site.close();
const bad = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS' : 'FAIL') + ' ' + x[0]));
console.log(`${R.length - bad.length}/${R.length} passing`);
process.exit(bad.length ? 1 : 0);
