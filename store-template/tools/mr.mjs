import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--no-sandbox'] });
for (const [w,f] of [[390,'mr_m.png'],[1280,'mr_d.png']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
  const el = p.locator('[data-ag-mr]'); await el.scrollIntoViewIfNeeded();
  const bb = await el.boundingBox();
  await p.screenshot({ path: f, clip: { x: Math.max(0,bb.x-20), y: bb.y - 140 + (await p.evaluate(()=>window.scrollY)), width: Math.min(w, bb.width+40), height: bb.height + 300 }, fullPage: true });
  console.log(f, JSON.stringify(errs));
  await p.close();
}
await b.close();
