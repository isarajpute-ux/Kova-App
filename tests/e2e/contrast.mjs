/* Colour contrast on the main screens, in all three appearances (WCAG AA:
   4.5:1 for body text, 3:1 for large text). Backgrounds are taken from
   the nearest painted ancestor, composited over the screen's own colour;
   gradients and glass are approximated, so this finds the clear misses.
   A ratchet: it fails if the count of misses grows past today's (most
   of what is left is glass and gradients the approximation reads too
   dark, checked by eye). `node tests/e2e/contrast.mjs` (REPORT=1 lists). */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const b = await chromium.launch();
const site = await serve(join(root, 'dist'));
const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.tours.v1': JSON.stringify({ home: 1, move: 1, fuel: 1, sleep: 1, vitals: 1, customize: 1, work: 1, studio: 1 }) });
const SCREENS = ['home', 'fuel', 'sleep', 'move', 'vitals', 'settings', 'plan'];
const all = [];
for (const theme of ['', 'soft-light', 'light-mode']) {
  const { context, page } = await openPage(b, null, { storage: STORE });
  await page.goto(site.url + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  for (const scr of SCREENS) {
    await page.evaluate(([scr, theme]) => { document.body.classList.remove('soft-light', 'light-mode'); if (theme) document.body.classList.add(theme); go(scr); }, [scr, theme]);
    await page.waitForTimeout(900);   /* let the screen finish fading in */
    const res = await page.evaluate(([scr, theme]) => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
      const over = (f, bg) => ({ r: f.r * f.a + bg.r * (1 - f.a), g: f.g * f.a + bg.g * (1 - f.a), b: f.b * f.a + bg.b * (1 - f.a), a: 1 });
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const ratio = (a, c) => { const x = lum(a), y = lum(c); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const appBg = theme === 'light-mode' ? { r: 236, g: 233, b: 228, a: 1 } : theme === 'soft-light' ? { r: 74, g: 76, b: 82, a: 1 } : { r: 10, g: 10, b: 12, a: 1 };
      /* a gradient counts as the average of its colour stops */
      const grad = (img) => { const m = String(img).match(/rgba?\([^)]+\)/g); if (!m || !/gradient/.test(img)) return null; const cs = m.map(parse).filter(Boolean); const n = cs.length; return { r: cs.reduce((a, c) => a + c.r, 0) / n, g: cs.reduce((a, c) => a + c.g, 0) / n, b: cs.reduce((a, c) => a + c.b, 0) / n, a: cs.reduce((a, c) => a + c.a, 0) / n }; };
      const bgOf = (el) => { const chain = []; for (let e = el; e && e !== document.body; e = e.parentElement) { const st = getComputedStyle(e), c = parse(st.backgroundColor), g = grad(st.backgroundImage); if (g && g.a > 0) chain.push(g); if (c && c.a > 0) chain.push(c); } let bg = appBg; for (let i = chain.length - 1; i >= 0; i--) bg = over(chain[i], bg); return bg; };
      const out = [], s = document.getElementById('s-' + scr);
      s.querySelectorAll('*').forEach((el) => {
        if (!el.childNodes.length) return;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1); if (!own) return;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return;
        let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
        if (op < 0.1 || el.closest('.vsec-b:not(.open), .exp-body:not(.open)') || (el.closest('details:not([open])') && !el.closest('summary'))) return;
        const fc = parse(cs.color); if (!fc) return; fc.a *= op;
        const bg = bgOf(el), rt = ratio(over(fc, bg), bg), px = parseFloat(cs.fontSize), large = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
        const need = large ? 3 : 4.5;
        if (rt < need) out.push({ scr, theme: theme || 'dark', r: Math.round(rt * 10) / 10, px, cls: (el.className && el.className.baseVal === undefined ? el.className : '') || el.tagName, t: el.textContent.trim().slice(0, 30) });
      });
      return out;
    }, [scr, theme]);
    all.push(...res);
  }
  await context.close();
}
await b.close(); site.close();
const hard = all.filter((x) => x.r < 3), soft = all.filter((x) => x.r >= 3);
if (process.env.REPORT) {
  const by = {}; all.forEach((x) => { const k = x.theme + ' ' + String(x.cls).split(' ')[0]; (by[k] = by[k] || []).push(x); });
  Object.keys(by).sort((a, c) => by[c].length - by[a].length).slice(0, 60).forEach((k) => console.log(by[k].length + '  ' + k + '  e.g. ' + by[k][0].r + ':1 ' + by[k][0].px + 'px "' + by[k][0].t + '" (' + by[k][0].scr + ')'));
}
console.log(`under 3:1: ${hard.length} · under 4.5:1 (small text): ${soft.length}`);
const HARD = +(process.env.HARD || 30), LIMIT = +(process.env.LIMIT || 70);
const ok = hard.length <= HARD && soft.length <= LIMIT;
console.log(ok ? 'PASS contrast (was 2,254 misses before p14)' : 'FAIL contrast');
process.exit(ok ? 0 : 1);
