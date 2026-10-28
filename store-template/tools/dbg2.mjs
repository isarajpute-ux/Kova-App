import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
p.on('console', m => console.log('console:', m.text()));
await p.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
console.log(await p.evaluate(() => {
  const root = document.querySelector('[data-ag-product]');
  const out = { inited: !!root.__ag, mrInRoot: !!root.querySelector('[data-ag-mr]'), stickyInRoot: !!root.querySelector('[data-ag-sticky]'), atcInRoot: !!root.querySelector('[data-ag-atc]') };
  document.querySelector('[data-mr-next]').click();
  out.tr = document.querySelector('[data-mr-track]').style.transform;
  out.scripts = document.querySelectorAll('script[src*="ag-sternify"]').length;
  return JSON.stringify(out);
}));
await b.close();
