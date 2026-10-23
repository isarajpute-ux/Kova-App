/* p37 in a real browser, phone size, live mode, dark / soft light / light
   glass (and iPhone's engine with ENGINE=webkit): the attachment button on
   each exercise in the workout, choosing Rope, the button in "Add to
   today" not adding the exercise, and the muscles list in plain words.
     node tests/e2e/attach.mjs          (after npm run build) */
import { chromium, webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = join(root, 'tests', 'e2e', 'shots'); mkdirSync(shots, { recursive: true });
const R = []; const ck = (n, c) => R.push([n, !!c]);
const engine = process.env.ENGINE === 'webkit' ? webkit : chromium;
const b = await engine.launch(); const site = await serve(join(root, 'dist'));
const seen = { home: 1, move: 1, session: 1, customize: 1, 'new-2026-10-21': 1, 'new-2026-10-22': 1, 'new-2026-10-23': 1, playerpage: 1 };
for (const theme of ['dark', 'soft', 'light']) {
  const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', 'kova.tours.v1': JSON.stringify(seen), kova_profile_v2: JSON.stringify({ theme, tourSeen: true, tours: seen }) });
  const { context, page: p } = await openPage(b, null, { storage: STORE });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(site.url + '/index.html');
  await p.waitForFunction(() => window.KovaAttach && window.KSESS && KSESS.api, null, { timeout: 30000 });
  await p.evaluate(() => { KSESS.api.build([['Rope pushdown', 3, 10, 15], ['Barbell curl', 3, 8, 12]], 'Arms'); go('session'); }); await p.waitForTimeout(800);
  await p.waitForSelector('#s-session .katt-chip', { timeout: 5000 }).catch(() => {});
  ck(theme + ': each exercise in the workout has an attachment button', await p.locator('#s-session .katt-chip').count() === 2);
  await p.locator('#s-session .katt-chip').first().click(); await p.waitForTimeout(400);
  await p.locator('#sheetIn [data-katt-v="Rope"]').first().click(); await p.waitForTimeout(500);
  ck(theme + ': choosing Rope puts it on the button and remembers it', /Rope/.test(await p.locator('#s-session .katt-chip').first().textContent()) && await p.evaluate(() => KovaAttach.get('Rope pushdown') === 'Rope'));
  await p.screenshot({ path: join(shots, `attach-session-${theme}.png`) });
  const n0 = await p.evaluate(() => KSESS.state().ex.length);
  await p.locator('#addExBtn').click(); await p.waitForTimeout(500);
  await p.locator('#sheet .chip.gp[data-g="Triceps"]').click(); await p.waitForTimeout(400);
  await p.locator('#sheet .exadd[data-n="Skull crusher"] .katt-add').click(); await p.waitForTimeout(300);
  ck(theme + ': in "Add to today" the button opens the choices and does not add the exercise', await p.evaluate(() => KSESS.state().ex.length) === n0 && await p.locator('#sheet .katt-p').count() === 1);
  await p.screenshot({ path: join(shots, `attach-add-${theme}.png`) });
  await p.locator('#sheet .katt-p [data-katt-v="EZ bar"]').first().click(); await p.waitForTimeout(300);
  await p.locator('#sheet .exadd[data-n="Skull crusher"]').click(); await p.waitForTimeout(600);
  ck(theme + ': an exercise added afterwards comes with the attachment you chose', await p.evaluate(() => { const e = KSESS.state().ex; return e[e.length - 1].n === 'Skull crusher' && e[e.length - 1].att === 'EZ bar'; }));
  /* the muscles list in plain words */
  await p.evaluate(() => go('customize')); await p.waitForTimeout(800);
  const vol = await p.evaluate(() => [...document.querySelectorAll('#volList .volval')].map((x) => x.textContent));
  ck(theme + ': the muscles list says how each muscle is doing, no numbers like 5/16', vol.length >= 4 && vol.every((t) => !/\d+\/\d+/.test(t)) && vol.every((t) => /^(Weak|Mild|Needs work|Stronger|Sore)$/.test(t)));
  await p.evaluate(() => { const c = document.getElementById('volList'); if (c) c.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(300);
  await p.screenshot({ path: join(shots, `attach-muscles-${theme}.png`) });
  ck(theme + ': no page errors', !errs.length || (console.error(errs.slice(0, 3)), false));
  await context.close();
}
await b.close(); site.close();
const bad = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS' : 'FAIL') + ' ' + x[0]));
console.log(`${R.length - bad.length}/${R.length} passing`);
process.exit(bad.length ? 1 : 0);
