import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('http://localhost:8765/index.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(3000);
console.log(await p.evaluate(() => { const i = [...document.querySelectorAll('.agSnow i')]; const vis = i.filter(e => { const r = e.getBoundingClientRect(); return r.top > 0 && r.top < innerHeight; }).length; return i.length + ' flakes, ' + vis + ' in view, opacity ' + getComputedStyle(i[0]).opacity; }));
await p.screenshot({ path: 'snow_m.png', clip: { x: 0, y: 140, width: 390, height: 420 } });
await b.close();
