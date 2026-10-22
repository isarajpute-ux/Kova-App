/* p35 the muscle recovery map and Follow along (the workout player) in a
   real browser, phone size, live mode, in dark, soft light and light glass
   (and iPhone's engine with ENGINE=webkit): the Muscle recovery card under
   Training with the body coloured from your logged sets, a muscle tapped
   opening its page, Train what's fresh building today's workout from ready
   muscles, Follow along opening with its tour the first time, Done set
   logging the set and starting the rest ring, Skip rest, the page fitting
   the phone, and Finish putting the workout in your log.
     node tests/e2e/recplayer.mjs          (after npm run build) */
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
const now = Date.now(), H = 36e5;
const s3 = (w, h) => [{ t: now - h * H, sets: [{ w, r: 8, role: 'work' }, { w, r: 8, role: 'work' }, { w, r: 7, role: 'work' }], top: w, e1: Math.round(w * 1.27) }];
const hist = { 'Barbell back squat': s3(185, 20), 'Romanian deadlift': s3(165, 20), 'Leg press': s3(270, 20), 'Barbell bench press': s3(155, 70) };
const seen = { home: 1, move: 1, session: 1, customize: 1, workteam: 1, 'new-2026-10-21': 1, 'new-2026-10-22': 1, zone2page: 1 };
for (const theme of ['dark', 'soft', 'light']) {
  const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', 'kova.pl.voice': 'false',
    kova_hist_v1: JSON.stringify(hist), 'kova.tours.v1': JSON.stringify(seen), kova_profile_v2: JSON.stringify({ theme, tourSeen: true, tours: seen }) });
  const { context, page: p } = await openPage(b, null, { storage: STORE });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(site.url + '/index.html');
  await p.waitForFunction(() => window.KovaRecovery && window.KovaPlayer && window.KSESS, null, { timeout: 30000 });
  await p.evaluate(() => go('move')); await p.waitForTimeout(900);
  await p.waitForSelector('#krcCard', { timeout: 8000 }).catch(() => {});
  const card = await p.evaluate(() => { const c = document.getElementById('krcCard'); if (!c) return null; c.scrollIntoView({ block: 'center' });
    const f = (cl) => { const m = c.querySelector('.krc-body .m.' + cl); return m ? getComputedStyle(m).fill : ''; };
    return { t: c.textContent, inside: !!c.parentNode.closest('.kv-card'), next: c.nextElementSibling && c.nextElementSibling.nextElementSibling && c.nextElementSibling.nextElementSibling.id, ready: f('r-ready'), rest: f('r-rest'), glass: getComputedStyle(c).backdropFilter || getComputedStyle(c).webkitBackdropFilter || '' }; });
  ck(theme + ': the Muscle recovery card sits under Training, before Zone 2, in Kova’s glass', card && !card.inside && card.next === 'kz2Card' && /blur/.test(card.glass));
  ck(theme + ': legs trained 20 h ago show as resting, the rest as ready, in two different colours', card && /Quads \d+%/.test(card.t) && /Ready:/.test(card.t) && card.ready && card.rest && card.ready !== card.rest);
  const st = await p.evaluate(() => { const c = document.getElementById('krsCard'); return c && { after: c.previousElementSibling && c.previousElementSibling.id, pics: c.querySelectorAll('.krs-c svg').length, t: c.textContent }; });
  ck(theme + ': the Stretch card sits right after recovery, with three pictures', st && st.after === 'krcCard' && st.pics === 3 && /Stretch with me/.test(st.t));
  await p.locator('#krsCard [data-krs="with"]').click(); await p.waitForTimeout(500);
  ck(theme + ': Stretch with me opens the first stretch with its timer', await p.locator('#kxpTimer').count() === 1);
  await p.evaluate(() => { KovaExPage.stopTimer(); closeSheet(); }); await p.waitForTimeout(400);
  await p.locator('#krcCard .krc-body .m.r-rest').first().click({ force: true }); await p.waitForTimeout(500);
  const sh = await p.locator('#sheetIn').textContent();
  ck(theme + ': tapping a resting muscle opens its page (when it is ready, exercises, stretches)', /Ready (in about|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(sh) && /Exercises for it/.test(sh) && /Stretch it/.test(sh));
  await p.evaluate(() => closeSheet()); await p.waitForTimeout(400);
  await p.locator('#krcCard [data-krc="fresh"]').click(); await p.waitForTimeout(900);
  const ses = await p.evaluate(() => ({ on: document.querySelector('.screen.on').id, ex: KSESS.state().ex.map((e) => e.n) }));
  ck(theme + ': Train what’s fresh opens today’s workout with no leg lifts', ses.on === 's-session' && ses.ex.length >= 4 && !ses.ex.some((n) => /squat|leg press|deadlift|lunge/i.test(n)));
  await p.waitForSelector('.kpl-chip', { timeout: 5000 }).catch(() => {});
  await p.locator('.kpl-chip').first().click(); await p.waitForTimeout(700);
  await p.waitForSelector('#ksCoach.on', { timeout: 4000 }).catch(() => {});
  ck(theme + ': Follow along opens, and the first time it shows you around', await p.locator('#kpl').count() === 1 && await p.locator('#ksCoach .ks-ct').count() === 1);
  for (let i = 0; i < 8; i++) { if (await p.locator('#ksTour [data-t="skip"]').count()) await p.locator('#ksTour [data-t="skip"]').first().click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(250); }
  const pg = await p.evaluate(() => { const el = document.getElementById('kpl'); return el && { inApp: !!el.closest('.app'), font: getComputedStyle(el.querySelector('.title')).fontFamily, fig: !!el.querySelector('.kpl-fig svg'), over: document.documentElement.scrollWidth - innerWidth, t: el.textContent }; });
  ck(theme + ': the player is inside the app, in Kova’s font, with the moving picture, and fits the phone', pg && pg.inApp && /Outfit/.test(pg.font) && pg.fig && pg.over <= 1);
  await p.screenshot({ path: join(shots, `player-work-${theme}.png`) });
  const before = await p.evaluate(() => { const c = KovaPlayer.cur(); return { i: c.i, j: c.j }; });
  await p.locator('#kpl [data-kpl="done"]').click(); await p.waitForTimeout(500);
  const rest = await p.evaluate((b) => ({ d: KSESS.state().ex[b.i].sets[b.j].d, left: KSESS.api.restLeft(), ring: !!document.querySelector('#kpl .kpl-ring') }), before);
  ck(theme + ': Done set logs the set and starts the rest ring', rest.d === 1 && rest.left > 0 && rest.ring);
  await p.screenshot({ path: join(shots, `player-rest-${theme}.png`) });
  await p.locator('#kpl [data-kpl="skip"]').click(); await p.waitForTimeout(700);
  ck(theme + ': Skip rest goes straight to the next set', await p.locator('#kpl [data-kpl="done"]').count() === 1);
  await p.evaluate(() => { let g = 0; while (!KovaPlayer.cur().done && g++ < 60) { KovaPlayer.done(); KSESS.api.skipRest(); } KovaPlayer.close(); KovaPlayer.open(); }); await p.waitForTimeout(500);
  const n0 = await p.evaluate(() => KSESS.log().length);
  await p.locator('#kpl [data-kpl="finish"]').click(); await p.waitForTimeout(900);
  ck(theme + ': Finish workout puts it in your log', await p.evaluate((n) => KSESS.log().length === n + 1 && !document.getElementById('kpl'), n0));
  ck(theme + ': no page errors', !errs.length || (console.error(errs.slice(0, 3)), false));
  await context.close();
}
await b.close(); site.close();
const bad = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS' : 'FAIL') + ' ' + x[0]));
console.log(`${R.length - bad.length}/${R.length} passing`);
process.exit(bad.length ? 1 : 0);
