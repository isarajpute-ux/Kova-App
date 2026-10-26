/* Every button a person can see has a name a screen reader can say
   (VoiceOver reads the name; an icon alone is silent). Walks all ~70
   screens at phone size in both the example and your-own-data modes and
   counts visible buttons and links with no text, aria-label, title or
   labelled-by. App Store accessibility review checks the same thing.
     node tests/e2e/names.mjs          (after npm run build) */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const b = await chromium.launch();
const site = await serve(join(root, 'dist'));
for (const mode of ['sample', 'live']) {
  const { context, page, pageErrors } = await openPage(b, null, { storage: Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: mode }) });
  await page.goto(site.url + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__kovaLazyDone, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const ids = await page.evaluate(() => [...document.querySelectorAll('.screen[id^="s-"]')].map((s) => s.id.slice(2)));
  let total = 0; const bad = [];
  for (const id of ids) {
    await page.evaluate((id) => { try { window.go(id); } catch (e) {} }, id);
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const vis = (el) => { const q = el.getBoundingClientRect(), cs = getComputedStyle(el); return q.width > 2 && q.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && q.bottom > 0 && q.top < innerHeight * 3; };
      const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || (el.getAttribute('aria-labelledby') || '').split(' ').map((i) => (document.getElementById(i) || {}).textContent || '').join('') || el.textContent || '').trim()
        || [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join('').trim();
      const els = [...document.querySelectorAll('button,[role="button"],a[href]')].filter(vis);
      return { n: els.length, bad: els.filter((e) => !name(e)).slice(0, 5).map((e) => (e.id ? '#' + e.id : '') + '.' + String(e.className || '').split(' ')[0]) };
    });
    total += r.n; if (r.bad.length) bad.push(id + ': ' + r.bad.join(', '));
  }
  console.log(mode + ': ' + ids.length + ' screens, ' + total + ' visible buttons and links' + (bad.length ? '\n  unnamed: ' + bad.join('\n  ') : ''));
  ck(mode + ': all ' + ids.length + ' screens visited, ' + total + ' buttons checked', ids.length >= 60 && total > 500);
  ck(mode + ': every visible button and link has a name', bad.length === 0);
  ck(mode + ': no page errors', pageErrors.length === 0 || (console.error(pageErrors.slice(0, 3)), false));
  await context.close();
}
await b.close(); site.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
