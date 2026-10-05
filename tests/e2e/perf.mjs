/* The first visit on a mid-range phone, the way reviewers measure it:
   slow 4G (1.6 Mbps down, 150 ms round trips) and a CPU 4x slower, files
   served brotli-compressed as Netlify does. Firebase and fonts are answered
   locally, so this is the app's own cost.
     npm run build && node tests/e2e/perf.mjs          (budgets checked)
     node tests/e2e/perf.mjs --source                   (the unbuilt page, for comparison) */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = process.argv.includes('--source');
/* bytes and elements are exact, so they are held tightly; time depends on
   the machine, so CI (slower, shared) gets headroom and still catches a
   regression. Elements: the app builds every screen up front (all 71 are
   wired at start); this ratchet stops it growing while that changes. */
const BUDGET = { firstLoadKB: 450, usableMs: process.env.CI ? 6000 : 3000, elements: 10800 };
const THROTTLE = { rtt: 150, down: 1.6e6, up: 0.75e6, cpu: 4 };
if (process.argv.includes('--cpu-only')) Object.assign(THROTTLE, { rtt: 0, down: -1, up: -1 });
if (process.argv.includes('--fast4g')) Object.assign(THROTTLE, { rtt: 60, down: 9e6, up: 1.5e6 });

const browser = await chromium.launch();
const site = await serve(SOURCE ? root : join(root, 'dist'), { brotli: true });
const { context, page, pageErrors } = await openPage(browser, null, { storage: SIGNED_OUT_LOCAL, throttle: THROTTLE });
await page.addInitScript(() => {
  window.__lt = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
});
await page.goto(site.url + '/index.html', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => document.querySelectorAll('#wheelBoxes [data-wp], .kl-panel[data-p="home"] .kl-row').length > 0, null, { timeout: 60000 });
await page.waitForTimeout(6000);                                   // let the late starters and the Work OS file finish
const m = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0;
  /* usable: the first moment after the first screen with 1 s of no long task */
  const lt = window.__lt.slice().sort((a, b) => a[0] - b[0]);
  let t = Math.max(fcp, nav.domContentLoadedEventEnd);
  for (const [s, d] of lt) { if (s + d < t) continue; if (s - t >= 1000) break; t = s + d; }
  /* bytes on the wire from this site (Firebase and fonts are stubbed here) */
  const res = performance.getEntriesByType('resource').filter((r) => r.name.startsWith(location.origin));
  const firstBytes = nav.transferSize + res.filter((r) => r.responseEnd <= nav.loadEventEnd).reduce((a, r) => a + r.transferSize, 0);
  const bytes = nav.transferSize + res.reduce((a, r) => a + r.transferSize, 0);
  return { firstBytes, bytes, fcp: Math.round(fcp), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), usable: Math.round(t),
    elements: document.getElementsByTagName('*').length, longTasks: lt.length };
});
await context.close(); await browser.close(); site.close();

const kb = (b) => Math.round(b / 1024), { firstBytes, bytes } = m;
console.log(`${SOURCE ? 'source index.html' : 'built site (dist/)'} on slow 4G + 4x CPU:`);
console.log(`  first paint ${(m.fcp / 1000).toFixed(1)} s · usable ${(m.usable / 1000).toFixed(1)} s · load event ${(m.load / 1000).toFixed(1)} s`);
console.log(`  downloaded before the load event ${kb(firstBytes)} KB, ${kb(bytes)} KB in all · ${m.elements} elements · ${m.longTasks} long tasks`);
if (SOURCE) process.exit(0);
const R = [];
R.push(['first load within ' + BUDGET.firstLoadKB + ' KB (' + kb(firstBytes) + ' KB)', kb(firstBytes) <= BUDGET.firstLoadKB]);
R.push(['usable within ' + BUDGET.usableMs / 1000 + ' s on a throttled phone (' + (m.usable / 1000).toFixed(1) + ' s)', m.usable <= BUDGET.usableMs]);
R.push(['at most ' + BUDGET.elements + ' elements at start (' + m.elements + ')', m.elements <= BUDGET.elements]);
R.push(['no page errors', pageErrors.length === 0 || (console.error(pageErrors), false)]);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### First visit, slow 4G + 4x CPU\n\n| | this build | budget |\n|---|---|---|\n'
    + '| first load | ' + kb(firstBytes) + ' KB | ' + BUDGET.firstLoadKB + ' KB |\n| first paint | ' + (m.fcp / 1000).toFixed(1) + ' s | |\n'
    + '| usable | ' + (m.usable / 1000).toFixed(1) + ' s | ' + BUDGET.usableMs / 1000 + ' s |\n| elements at start | ' + m.elements + ' | ' + BUDGET.elements + ' |\n| after first screen | ' + kb(bytes - firstBytes) + ' KB | |\n\n');
}
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
process.exit(R.every((x) => x[1]) ? 0 : 1);
