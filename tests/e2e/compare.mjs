/* The built site (dist/) against the source page (index.html), in a real
   browser: every screen has the same elements and the same elements answer
   taps, and neither throws. This is what proves moving Work OS into a
   later file changed nothing but when it loads.
     npm run build && node tests/e2e/compare.mjs */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, snapshot, SIGNED_OUT_LOCAL } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);

const browser = await chromium.launch();
const src = await serve(root), dist = await serve(join(root, 'dist'));
async function run(url, waitWork) {
  const { context, page, pageErrors } = await openPage(browser, url + '/index.html', { storage: SIGNED_OUT_LOCAL });
  await page.waitForLoadState('load');
  if (waitWork) await page.waitForFunction(() => window.__kovaWork === 1 && window.KovaTraction, null, { timeout: 15000 });
  await page.waitForTimeout(2500);                       // the modules that start themselves late
  const ids = await page.evaluate(() => [...document.querySelectorAll('.screen')].map((s) => s.id.slice(2)));
  const snap = await snapshot(page, ids);
  const errs = await page.evaluate(() => window.__errs.slice());
  await context.close();
  return { ids, snap, errs: errs.concat(pageErrors) };
}
const A = await run(src.url, false), B = await run(dist.url, true);
ck('the source page opens all ' + A.ids.length + ' screens without an error', A.errs.length === 0 || (console.error(A.errs.slice(0, 5)), false));
ck('the built site opens all ' + B.ids.length + ' screens without an error', B.errs.length === 0 || (console.error(B.errs.slice(0, 5)), false));
const diff = [];
for (const id of A.ids) {
  /* ids with a random suffix (gradient ids like rgBloom_x8k2pq) differ on every load */
  const norm = (x) => x && Object.assign({}, x, { ids: x.ids.map((i) => i.replace(/_[a-z0-9]{6}$/, '_*')), bound: x.bound.map((i) => i.replace(/_[a-z0-9]{6}$/, '_*')) });
  const a = norm(A.snap[id]), b = norm(B.snap[id]);
  if (!a || !b) { diff.push(id + ': missing'); continue; }
  const lostB = a.bound.filter((x, i) => b.bound.indexOf(x) < 0), gainB = b.bound.filter((x) => a.bound.indexOf(x) < 0);
  const lostId = a.ids.filter((x) => b.ids.indexOf(x) < 0), gainId = b.ids.filter((x) => a.ids.indexOf(x) < 0);
  if (lostB.length || gainB.length || lostId.length || gainId.length || a.on !== b.on)
    diff.push(id + ': handlers -' + lostB.slice(0, 6).join(',') + ' +' + gainB.slice(0, 6).join(',') + ' | ids -' + lostId.slice(0, 6).join(',') + ' +' + gainId.slice(0, 6).join(',') + (a.on !== b.on ? ' | not shown' : '') + ' | elements ' + a.n + '/' + b.n);
}
ck('every screen has the same elements and the same ones answer taps (' + A.ids.length + ' screens)', diff.length === 0 || (console.error(diff.join('\n')), false));

/* a Work screen opened before its code has arrived is drawn once it does */
{
  const { context, page, pageErrors } = await openPage(browser, null, { storage: SIGNED_OUT_LOCAL });
  await context.route(/\/m\/work\.[0-9a-f]+\.js$/, async (r) => { await new Promise((ok) => setTimeout(ok, 2500)); r.continue(); });
  await page.goto(dist.url + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.go('worktasks'));
  const early = await page.evaluate(() => !window.__kovaWork);
  await page.waitForFunction(() => window.__kovaWork === 1, null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  const late = (await snapshot(page, ['worktasks'])).worktasks;
  const ref = A.snap.worktasks, norm = (l) => l.map((i) => i.replace(/_[a-z0-9]{6}$/, '_*'));
  ck('opening Work before its code arrives: it loads at once and the screen is drawn the same', early && late.on && JSON.stringify(norm(late.bound)) === JSON.stringify(norm(ref.bound)) && JSON.stringify(norm(late.ids)) === JSON.stringify(norm(ref.ids)) && pageErrors.length === 0);
  await context.close();
}
await browser.close(); src.close(); dist.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
