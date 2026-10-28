import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1400, height: 300 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:8765/logo.html', { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
const fam = await p.evaluate(() => document.fonts.check("600 96px 'Cormorant Garamond'"));
await p.locator('#w').screenshot({ path: 'auraglow-wordmark.png', omitBackground: true });
console.log('font loaded:', fam);
await b.close();
