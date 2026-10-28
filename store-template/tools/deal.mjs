import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--no-sandbox'] });
for (const [w,f] of [[390,'deal_m.png'],[1280,'deal_d.png']]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1300);
  const a = await p.locator('.agP__priceRow').boundingBox();
  const z = await p.locator('.agB').boundingBox();
  await p.screenshot({ path: f, clip: { x: Math.max(0,a.x-16), y: a.y - 10, width: Math.min(w, (w>500? 560: w)), height: z.y - a.y + 20 }, fullPage: true });
  const r = { clock: await p.locator('[data-deal-clock]').textContent(), top: await p.locator('.agTop__clock').textContent() };
  await p.locator('.agDeal__code').click(); r.copied = await p.locator('.agDeal__code [data-copy-label]').textContent();
  console.log(f, JSON.stringify(r).replace(/\\n\s*/g,''), JSON.stringify(errs));
  await p.close();
}
await b.close();
