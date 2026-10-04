/* Dev helper: look at the built site in a real browser.
     node tests/e2e/look.mjs shots '<json [{screen,theme,w,h,scale,action,wait,clip,out}]>'   screenshots
     node tests/e2e/look.mjs eval '<js expression>'                                       prints the result
   ENGINE=webkit uses Safari's engine; W=320 sets the width for eval.
   Firebase and fonts are stubbed (harness.mjs). Not part of CI. */
import { chromium, webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [mode, arg] = process.argv.slice(2);
const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.tours.v1': JSON.stringify({ home: 1, move: 1, fuel: 1, sleep: 1, vitals: 1, customize: 1, work: 1, studio: 1 }) });
const b = await engine.launch();
const site = await serve(join(root, 'dist'));
async function open(w, h, scale) {
  const o = await openPage(b, null, { storage: STORE, viewport: { width: w, height: h }, scale: scale || 1 });
  await o.page.goto(site.url + '/index.html', { waitUntil: 'load' });
  await o.page.waitForFunction(() => window.__kovaWork === 1, null, { timeout: 20000 }).catch(() => {});
  await o.page.waitForTimeout(1200);
  return o;
}
if (mode === 'eval') {
  const { context, page } = await open(+(process.env.W || 375), +(process.env.H || 812));
  console.log(JSON.stringify(await page.evaluate(arg), null, 1));
  await context.close();
} else {
  for (const s of JSON.parse(arg)) {
    const { context, page, pageErrors } = await open(s.w || 375, s.h || 812, s.scale);
    await page.evaluate(([scr, t]) => { document.body.classList.remove('soft-light', 'light-mode'); if (t) document.body.classList.add(t); if (scr) go(scr); }, [s.screen || 'home', s.theme || '']);
    await page.waitForTimeout(900);
    if (s.action) { try { await page.evaluate(s.action); } catch (e) { console.log('action error', e.message); } await page.waitForTimeout(s.wait || 800); }
    await page.screenshot({ path: s.out, clip: s.clip });
    if (pageErrors.length) console.log(s.out, 'errors', pageErrors.slice(0, 3));
    await context.close();
  }
  console.log('ok');
}
await b.close(); site.close();
