import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile:true, hasTouch:true });
const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
await p.addStyleTag({url:'/assets/ag-xmas.css'}); await p.waitForTimeout(800);
for (const [sel,f] of [['.agP__media','x_media.png'],['.agB','x_bund.png'],['.agP__ugc','x_ugc.png'],['.agP__feats','x_feat.png'],['.agCmp','x_cmp.png'],['.agRv','x_rv.png']]) {
  const el = p.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: f });
}
console.log(JSON.stringify({errs, sw: await p.evaluate(()=>document.documentElement.scrollWidth)}));
await b.close();
