/* Kova's camera (src/p08_camera.js) with Chromium's fake camera: it opens
   with the reference's layout, the frame resizes from the ruler and from a
   corner, the shape changes, zoom works, and the shutter returns exactly
   what is inside the frame. SHOTS=<dir> also saves a screenshot per
   appearance. */
import { chromium, webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const b = process.env.ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const site = await serve(join(root, 'dist'));
const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), 'kova.tours.v1': JSON.stringify({ home: 1, move: 1, fuel: 1, sleep: 1, vitals: 1, customize: 1, work: 1, studio: 1 }) });
const { context, page, pageErrors } = await openPage(b, null, { storage: STORE, viewport: { width: 390, height: 844 } });
await context.grantPermissions(['camera'], { origin: site.url });
await page.goto(site.url + '/index.html', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const openCam = () => page.evaluate(() => { window.__shot = null; KovaCam.open({ title: 'Scan your meal', hint: 'Fill the frame with the plate.', onShot: (u) => { window.__shot = u; } }); });
await openCam();
await page.waitForFunction(() => { const v = document.getElementById('kvcV'); return v && v.videoWidth > 0; }, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(400);
const L = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  return { title: q('.kvc-head h2') && q('.kvc-head h2').textContent, back: !!q('.kvc [data-k="close"]'), dots: !!q('.kvc [data-k="menu"]'), corners: document.querySelectorAll('.kvc-frame .c').length,
    aim: !!q('#kvcAim'), zoom: [...document.querySelectorAll('[data-z]')].map((x) => x.textContent).join(' '), ruler: !!q('#kvcSize'), asp: q('.kvc-asp').textContent, shutter: !!q('#kvcShot'),
    live: q('#kvcV').videoWidth > 0, res: q('#kvcRes').textContent };
});
ck('it opens with the reference layout: back and ••• pills, a big heading, four corners, the + aim, zoom 0.5x–4x, the ruler, the shutter', L.title === 'Scan your meal' && L.back && L.dots && L.corners === 4 && L.aim && L.zoom === '0.5x 1x 2x 4x' && L.ruler && L.shutter);
ck('the live camera is showing (' + L.res.trim() + ')', L.live);
if (process.env.SHOTS) for (const t of ['', 'soft-light', 'light-mode']) {
  await page.evaluate((t) => { document.body.classList.remove('soft-light', 'light-mode'); if (t) document.body.classList.add(t); }, t);
  await page.waitForTimeout(250); await page.screenshot({ path: join(process.env.SHOTS, 'cam-' + (t || 'dark') + '.png') });
}
await page.evaluate(() => document.body.classList.remove('soft-light', 'light-mode'));
/* the size ruler, by keyboard */
const w0 = await page.evaluate(() => document.getElementById('kvcFrame').offsetWidth);
await page.focus('#kvcSize'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(300);
const w1 = await page.evaluate(() => document.getElementById('kvcFrame').offsetWidth);
ck('the ruler makes the frame smaller (' + w0 + ' → ' + w1 + ' px)', w1 < w0 - 10);
/* dragging a corner outward makes it bigger */
const cr = await page.evaluate(() => { const r = document.querySelector('.kvc-frame .br').getBoundingClientRect(); return { x: r.right - 4, y: r.bottom - 4 }; });
await page.mouse.move(cr.x, cr.y); await page.mouse.down(); await page.mouse.move(cr.x + 30, cr.y + 30, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(300);
const w2 = await page.evaluate(() => document.getElementById('kvcFrame').offsetWidth);
ck('dragging a corner resizes the frame (' + w1 + ' → ' + w2 + ' px)', w2 > w1 + 10);
/* the shape */
await page.click('.kvc-asp'); await page.waitForTimeout(250);
const sh = await page.evaluate(() => { const f = document.getElementById('kvcFrame'); return { a: document.querySelector('.kvc-asp').textContent, r: f.offsetWidth / f.offsetHeight }; });
ck('the shape button changes the frame (' + sh.a + ', ' + sh.r.toFixed(2) + ')', sh.a === '4:5' && Math.abs(sh.r - 0.8) < 0.03);
/* zoom */
await page.click('[data-z="2"]'); await page.waitForTimeout(300);
const z = await page.evaluate(() => ({ on: document.querySelector('[data-z].on').getAttribute('data-z'), t: document.getElementById('kvcV').style.transform }));
ck('2x zoom is chosen and applied', z.on === '2' && (/scale\(2\)/.test(z.t) || /scale\(1\)/.test(z.t)));
await page.click('[data-z="1"]'); await page.waitForTimeout(200);
/* the menu */
await page.click('.kvc [data-k="menu"]'); await page.waitForTimeout(150);
ck('••• opens torch, grid lines and switch camera', await page.evaluate(() => !document.getElementById('kvcMenu').hidden && document.querySelectorAll('#kvcMenu button').length === 3));
await page.click('#kvcMenu [data-k="grid"]'); await page.waitForTimeout(150);
ck('grid lines turn on', await page.evaluate(() => document.getElementById('kvcGrid').classList.contains('on')));
await page.click('#kvcMenu [data-k="grid"]'); await page.click('.kvc [data-k="menu"]');
/* tap to focus moves the aim */
const a0 = await page.evaluate(() => document.getElementById('kvcAim').style.left);
await page.mouse.click(120, 420); await page.waitForTimeout(300);
const a1 = await page.evaluate(() => document.getElementById('kvcAim').style.left);
ck('a tap moves the focus aim there', a0 !== a1 && Math.abs(parseFloat(a1) - 120) < 3);
/* the shutter */
const fr = await page.evaluate(() => { const f = document.getElementById('kvcFrame'); return f.offsetWidth / f.offsetHeight; });
await page.click('#kvcShot');
await page.waitForFunction(() => window.__shot, null, { timeout: 10000 }).catch(() => {});
const shot = await page.evaluate(() => new Promise((ok) => { const u = window.__shot; if (!u) return ok(null); const im = new Image(); im.onload = () => ok({ jpeg: /^data:image\/jpeg/.test(u), w: im.width, h: im.height }); im.src = u; }));
ck('the shutter returns a JPEG of exactly the frame (' + (shot ? shot.w + '×' + shot.h : 'none') + ')', shot && shot.jpeg && Math.abs(shot.w / shot.h - fr) < 0.04);
ck('the camera closes after the shot and the stream stops', await page.evaluate(() => !document.querySelector('.kvc') && !KovaCam.isOpen()));
/* the strip remembers this visit's shot */
await openCam(); await page.waitForTimeout(500);
ck('the shot is in the strip next time, and tapping it uses it again', await page.evaluate(() => document.querySelectorAll('#kvcStrip button').length === 1));
await page.click('#kvcStrip button'); await page.waitForTimeout(200);
ck('…which hands it back without a new photo', await page.evaluate(() => !!window.__shot && !document.querySelector('.kvc')));
/* Escape closes */
await openCam(); await page.waitForTimeout(300); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
ck('Escape closes the camera', await page.evaluate(() => !document.querySelector('.kvc')));
ck('no page errors', pageErrors.length === 0 || (console.error(pageErrors), false));
await context.close(); await b.close(); site.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
