import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
await p.locator('[data-mr-next]').click(); await p.waitForTimeout(600);
const r = { tr: await p.locator('[data-mr-track]').evaluate(e => e.style.transform) };
for (const y of [0, 1000, 1500, 2000, 2600, 3500]) {
  await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(500);
  r['y' + y] = await p.evaluate(() => { const a = document.querySelector('[data-ag-atc]').getBoundingClientRect(); return Math.round(a.top) + ':' + document.querySelector('[data-ag-sticky]').className; });
}
await p.evaluate(() => window.scrollTo(0, 2600)); await p.waitForTimeout(500);
await p.screenshot({ path: 'sticky.png' });
console.log(JSON.stringify(r, null, 1));
await b.close();
