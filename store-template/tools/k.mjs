import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--no-sandbox'] });
for (const w of [390, 1280]) {
const p = await b.newPage({ viewport: { width: w, height: 900 } });
const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
await p.addStyleTag({url:'/assets/ag-xmas.css'}); await p.addStyleTag({url:'/assets/ag-xmas2.css'}); await p.addScriptTag({url:'/assets/ag-gallery.js'});
await p.waitForTimeout(600);
const g = p.locator('.agP__media'); await g.screenshot({ path: `g_${w}.png` });
await p.locator('.agGN__b').nth(1).click(); await p.waitForTimeout(800);
const gi = await p.evaluate(()=>document.querySelector('.agGN__fill').style.transform);
await g.screenshot({ path: `g2_${w}.png` });
const k = p.locator('.agK'); await k.scrollIntoViewIfNeeded(); await k.screenshot({ path: `k_${w}.png` });
if (w < 900) { await p.locator('[data-k-next]').click(); await p.waitForTimeout(700); await k.screenshot({ path: `k2_${w}.png` }); }
console.log(w, JSON.stringify({errs, gi, sw: await p.evaluate(()=>document.documentElement.scrollWidth)}));
}
await b.close();
