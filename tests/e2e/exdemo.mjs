/* p32 in a real browser, phone size, live mode, in dark, soft light and
   light glass (and on iPhone's engine with ENGINE=webkit): Workout's
   Exercises and Stretch buttons, the library with a picture on every
   exercise, the exercise page (the picture moves, pauses, the muscles
   light up), a stretch timer, and the pictures next to the exercises in
   a workout, which open the page when tapped.
     node tests/e2e/exdemo.mjs          (after npm run build) */
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
  const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', kova_profile_v2: JSON.stringify({ theme, tourSeen: true }) });
  const { context, page: p } = await openPage(b, null, { storage: STORE });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(site.url + '/index.html');
  await p.waitForFunction(() => window.KovaExPage && window.KovaDemo, null, { timeout: 30000 });
  /* the once-per-screen tour can open a moment late: wait for it and close it */
  const skip = async () => { for (let i = 0; i < 8; i++) { if (await p.locator('#ksTour [data-t="skip"]').count()) { await p.locator('#ksTour [data-t="skip"]').first().click({ timeout: 3000 }).catch(() => {}); } await p.waitForTimeout(250); } };
  await p.evaluate(() => go('move')); await p.waitForTimeout(800); await skip();
  await p.waitForSelector('.kxp-act[data-kxp="lib"]', { timeout: 8000 }).catch(() => {});
  ck(theme + ': Workout has Exercises and Stretch next to Check my form', await p.locator('#s-move .kxp-act[data-kxp="lib"]').count() === 1 && await p.locator('#s-move .kxp-act[data-kxp="str"]').count() === 1);
  await p.locator('#s-move .kxp-act[data-kxp="lib"]').click(); await p.waitForTimeout(500);
  await p.waitForTimeout(900);                                  /* the dial pops out */
  const cells = await p.evaluate(() => ({ n: document.querySelectorAll('#sheetIn #kxpCard .kdl-t').length, svg: document.querySelectorAll('#sheetIn #kxpCard .kdl-t svg').length, over: document.documentElement.scrollWidth - innerWidth }));
  ck(theme + ': the library shows every exercise with its picture, inside the screen', cells.n >= 80 && cells.svg >= 80 && cells.over <= 1);
  /* p43: the dial, as in the owner's Ron Design Lab reference */
  /* p43e: measured from the reference: a band of frosted glass, a wedge past it, a lime button, a brown form on a light dotted backdrop */
  const geo = await p.evaluate(() => { const d = document.querySelector('#sheetIn .kdl'), r = d.getBoundingClientRect(), on = d.querySelector('.kdl-l.on');
    const far = (x) => { const L = x.getTotalLength(); let m = 0; for (let i = 0; i <= 80; i++) { const q = x.getPointAtLength(L * i / 80); m = Math.max(m, Math.hypot(q.x - 160, q.y - 160)); } return m; };
    const shown = [...d.querySelectorAll('.kdl-l')].filter((x) => +x.style.opacity > 0.5).length, dome = d.querySelector('.kdl-dome').getBoundingClientRect(), bg = getComputedStyle(document.getElementById('sheet')).backgroundImage;
    const ob = on.getBoundingClientRect(), oa = Math.atan2(ob.top + ob.height / 2 - (r.top + r.height / 2), ob.left + ob.width / 2 - (r.left + r.width / 2)) * 57.3;
    return { w: r.width, inView: r.left >= 0 && r.right <= innerWidth, shown, sel: on && on.textContent.trim(), oa, farSel: far(d.querySelector('.kdl-s')), farBand: far(d.querySelector('.kdl-tr')), yel: getComputedStyle(d.querySelector('.kdl-c')).backgroundImage, dot: !!d.querySelector('.kdl-c .kdl-dot'), dome: dome.width > r.width, dots: /radial-gradient/.test(bg), over: document.documentElement.scrollWidth - innerWidth }; });
  ck(theme + ': a band of frosted glass round a lime button with a black dot, on a brown form against a dotted backdrop, on screen, 3 to 5 showing at once', geo.inView && geo.w >= 300 && geo.shown >= 3 && geo.shown <= 5 && /223, 225, 85/.test(geo.yel) && geo.dot && geo.dome && geo.dots && geo.over <= 1 || (console.error(theme, geo), false));
  ck(theme + ': …the chosen one sits in the wedge a little right of straight down, the wedge reaching past the band', geo.sel === 'All' && Math.abs(geo.oa - 82) < 6 && geo.farSel > geo.farBand + 8 || (console.error(theme, geo), false));
  /* drag round the track: it slides, then settles on the one in the slot */
  const box = await p.locator('#sheetIn .kdl').boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2, R = box.width * 0.32;
  await p.mouse.move(cx + R * Math.cos(1.4), cy + R * Math.sin(1.4)); await p.mouse.down();
  for (let k = 1; k <= 12; k++) { const a = 1.4 + k * 0.14; await p.mouse.move(cx + R * Math.cos(a), cy + R * Math.sin(a)); await p.waitForTimeout(16); }
  await p.mouse.up(); await p.waitForTimeout(900);
  const dragged = await p.evaluate(() => ({ sel: document.querySelector('#sheetIn .kdl-l.on').textContent.trim(), card: document.querySelector('#kxpCard .kdl-name').textContent }));
  ck(theme + ': dragging round it slides the segments; the one that lands in the slot fills the card', dragged.sel !== 'All' && dragged.card.toLowerCase().indexOf(dragged.sel.toLowerCase().slice(0, 4)) === 0 || (console.error(theme, dragged), false));
  await p.screenshot({ path: join(shots, `exdemo-dial-${theme}.png`) });
  /* All now sits in the gap at the top left (hidden): turn the dial back to it */
  await p.evaluate(() => KovaExPage.dial().set(0)); await p.waitForTimeout(900);
  await p.locator('#sheetIn #kxpCard .kdl-t[data-exinfo="Romanian deadlift"]').click(); await p.waitForTimeout(400);
  const f1 = await p.evaluate(() => document.querySelector('#sheetIn .kxp-fig').innerHTML);
  await p.waitForTimeout(700);
  const f2 = await p.evaluate(() => document.querySelector('#sheetIn .kxp-fig').innerHTML);
  ck(theme + ': the exercise page picture moves', f1 !== f2 && /<svg/.test(f2));
  /* p36c: smooth on a phone - after the first loop every frame comes from memory, at most 30 a second */
  await p.waitForTimeout(6000);
  const pf = await p.evaluate(() => new Promise((ok) => { const d0 = KovaDemo.stats.draws; let n = 0, ch = 0; const el = document.querySelector('#sheetIn .kxp-fig');
    const mo = new MutationObserver(() => ch++); mo.observe(el, { childList: true });
    const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else { mo.disconnect(); ok({ draws: KovaDemo.stats.draws - d0, frames: n, changes: ch }); } }; requestAnimationFrame(f); }));
  ck(theme + ': the moving picture plays almost entirely from memory after its first loops, 30 changes a second at most, the page stays smooth', pf.draws <= 8 && pf.changes <= 64 && pf.changes >= 20 && pf.frames >= 50 || (console.error(theme, pf), false));
  const lit = await p.evaluate(() => [...document.querySelectorAll('#sheetIn .kxp-body .m.p')].map((m) => getComputedStyle(m).fill));
  const acc = theme === 'light' ? 'rgb(200, 87, 26)' : 'rgb(232, 122, 60)';
  ck(theme + ': the hamstrings and glutes light up in the Workout colour', lit.length >= 4 && lit.every((c) => c === acc) || (console.error(theme, lit.slice(0, 3)), false));
  await p.locator('#sheetIn [data-kxp="pause"]').click(); await p.waitForTimeout(150);
  const s1 = await p.evaluate(() => document.querySelector('#sheetIn .kxp-fig').innerHTML); await p.waitForTimeout(500);
  const s2 = await p.evaluate(() => document.querySelector('#sheetIn .kxp-fig').innerHTML);
  ck(theme + ': pause holds it still', s1 === s2);
  await p.screenshot({ path: join(shots, `exdemo-page-${theme}.png`) });
  await p.evaluate(() => closeSheet());
  await p.locator('#s-move .kxp-act[data-kxp="str"]').click(); await p.waitForTimeout(400);
  await p.waitForTimeout(900);
  await p.locator('#sheetIn #kxpSCard .kdl-t[data-kxp="stretch"]').first().click(); await p.waitForTimeout(300);
  await p.locator('#sheetIn [data-kxp="hold"]').click(); await p.waitForTimeout(1300);
  const tm = await p.evaluate(() => (document.getElementById('kxpTimer') || {}).textContent || '');
  ck(theme + ': a stretch timer counts the hold', /^\d+/.test(tm) && /side|Hold/.test(tm));
  await p.screenshot({ path: join(shots, `exdemo-stretch-${theme}.png`) });
  await p.evaluate(() => { closeSheet(); go('session'); }); await p.waitForTimeout(1500); await skip(); await p.waitForTimeout(300); await skip();
  await p.waitForSelector('.exhead .kxp-tb', { timeout: 8000 }).catch(() => {});
  const th = await p.evaluate(() => ({ n: document.querySelectorAll('.exhead .kxp-tb').length, rows: document.querySelectorAll('.exhead').length, live: !!document.querySelector('.exrow.act .kxp-tb [data-kxd]') }));
  ck(theme + ': every exercise in the workout has its picture; the current one moves', th.n === th.rows && th.n > 0 && th.live);
  await p.locator('.exhead .kxp-tb').nth(1).click(); await p.waitForTimeout(400);
  ck(theme + ': tapping a picture opens that exercise', await p.locator('#sheetIn .kxp-fig svg').count() === 1);
  await p.evaluate(() => closeSheet());
  ck(theme + ': no page errors', !errs.length || (console.error(errs.slice(0, 3)), false));
  await context.close();
}
await b.close(); site.close();
const bad = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS' : 'FAIL') + ' ' + x[0]));
console.log(`${R.length - bad.length}/${R.length} passing`);
process.exit(bad.length ? 1 : 0);
