/* p52: one app on a phone and a laptop. Every main tab opens, fits the
   width with no sideways scroll, and has no script errors, at phone size
   (390 x 844) and laptop size (1280 x 800), in dark, soft light and light.
     node tests/e2e/fit.mjs          (after npm run build) */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const b = await chromium.launch();
const site = await serve(join(root, 'dist'));
const TABS = ['home', 'fuel', 'move', 'vitals', 'work', 'workteam', 'worktasks', 'settings'];
const SIZES = [['phone', { width: 390, height: 844 }], ['laptop', { width: 1280, height: 800 }]];
for (const [name, viewport] of SIZES) {
  for (const theme of ['dark', 'soft-light', 'light-mode']) {
    const { page, pageErrors, context } = await openPage(b, site.url + '/', { viewport, storage: SIGNED_OUT_LOCAL });
    await page.waitForTimeout(1500);
    await page.evaluate((t) => { document.body.classList.remove('soft-light', 'light-mode'); if (t !== 'dark') document.body.classList.add(t); }, theme);
    const wide = [], blank = [];
    for (const t of TABS) {
      await page.evaluate((t) => { try { go(t); } catch (e) {} }, t);
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const s = document.querySelector('.screen.on');
        return { id: s && s.id, over: document.documentElement.scrollWidth - innerWidth, text: s ? s.innerText.trim().length : 0 };
      });
      if (r.over > 2) wide.push(t + ' (' + r.over + 'px)');
      if (!r.id || r.text < 20) blank.push(t);
    }
    ck(`${name}, ${theme}: every main tab fits the width (no sideways scroll)`, !wide.length || (console.log('  too wide: ' + wide.join(', ')), false));
    ck(`${name}, ${theme}: every main tab opens with content`, !blank.length || (console.log('  empty: ' + blank.join(', ')), false));
    const errs = pageErrors.concat(await page.evaluate(() => window.__errs || []));
    ck(`${name}, ${theme}: no script errors`, !errs.length || (console.log('  ' + errs.slice(0, 3).join(' | ')), false));
    await context.close();
  }
}
await b.close(); site.close();
R.forEach((r) => console.log((r[1] ? 'ok   ' : 'FAIL ') + r[0]));
const bad = R.filter((r) => !r[1]);
console.log(bad.length ? bad.length + ' failed' : 'all ' + R.length + ' passed');
process.exit(bad.length ? 1 : 0);
