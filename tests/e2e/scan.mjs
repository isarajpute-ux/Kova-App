/* p36 Scan a machine in a real browser, phone size, live mode, in dark,
   soft light and light glass (and iPhone's engine with ENGINE=webkit):
   the three ways in, the picture list with what each machine looks like,
   search by look, a tap on a row opening the machine, the page fitting the
   phone, and Settings and the subscription page in Work OS's colours.
     node tests/e2e/scan.mjs          (after npm run build) */
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
const seen = { home: 1, move: 1, session: 1, settings: 1, machine: 1, 'new-2026-10-21': 1, 'new-2026-10-22': 1 };
for (const theme of ['dark', 'soft', 'light']) {
  const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', 'kova.tours.v1': JSON.stringify(seen), kova_profile_v2: JSON.stringify({ theme, tourSeen: true, tours: seen }) });
  const { context, page: p } = await openPage(b, null, { storage: STORE });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(site.url + '/index.html');
  await p.waitForFunction(() => window.__kovaMachines && document.querySelector('#s-machine .mc-ways'), null, { timeout: 30000 });
  await p.evaluate(() => go('machine')); await p.waitForTimeout(700);
  ck(theme + ': three ways in (camera, photo or video, a link)', await p.locator('#s-machine .mc-ways .chip').count() === 2 && await p.locator('#mcDrop').count() === 1);
  /* the picture list, as someone who does not know the names would use it */
  await p.evaluate(() => { document.getElementById('mcPick').style.display = 'block'; }); await p.waitForTimeout(400);
  const L = await p.evaluate(() => { const r = [...document.querySelectorAll('#mcList .mcopt')]; return { n: r.length, pics: r.filter((x) => x.querySelector('.mc-pic svg')).length, looks: r.filter((x) => x.querySelector('.mc-look')).length, over: document.documentElement.scrollWidth - innerWidth }; });
  ck(theme + ': every machine in the list has what it looks like, most with a picture, and it fits the phone', L.n >= 20 && L.looks === L.n && L.pics >= 14 && L.over <= 1);
  await p.locator('#mcSearch').fill('shins'); await p.waitForTimeout(200);
  ck(theme + ': search by look ("shins") finds Leg extension', /Leg extension/.test(await p.locator('#mcList').textContent()));
  await p.screenshot({ path: join(shots, `scan-list-${theme}.png`) });
  await p.locator('#mcList .mcopt').first().click(); await p.waitForTimeout(500);
  ck(theme + ': a tap on a row opens that machine', /Leg extension/.test(await p.locator('#mcResult').textContent()) && await p.locator('#mcResult').isVisible());
  await p.locator('#s-machine [data-mc="link"]').click(); await p.waitForTimeout(400);
  ck(theme + ': Paste a link opens a box for the link', await p.locator('#mcUrl').count() === 1);
  await p.evaluate(() => closeSheet()); await p.waitForTimeout(300);
  /* Settings and the subscription page wear Work OS's colours */
  await p.evaluate(() => go('settings')); await p.waitForTimeout(600);
  const set = await p.evaluate(() => { const a = document.getElementById('app'); return { pillar: a.getAttribute('data-pillar'), acc: getComputedStyle(a).getPropertyValue('--acc').trim(), grid: getComputedStyle(a, '::before').backgroundImage }; });
  await p.evaluate(() => go('plan')); await p.waitForTimeout(600);
  const plan = await p.evaluate(() => ({ pillar: document.getElementById('app').getAttribute('data-pillar'), acc: getComputedStyle(document.getElementById('app')).getPropertyValue('--acc').trim() }));
  ck(theme + ': Settings and the subscription page use Settings’ colours, never Workout’s', set.pillar === 'settings' && plan.pillar === 'settings');
  if (theme === 'dark') ck('dark: both in Work OS’s cool accent with its dot grid', /^#DCE3EC$/i.test(set.acc) && /^#DCE3EC$/i.test(plan.acc) && /radial-gradient/.test(set.grid));
  await p.screenshot({ path: join(shots, `scan-plan-${theme}.png`) });
  ck(theme + ': no page errors', !errs.length || (console.error(errs.slice(0, 3)), false));
  await context.close();
}
await b.close(); site.close();
const bad = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS' : 'FAIL') + ' ' + x[0]));
console.log(`${R.length - bad.length}/${R.length} passing`);
process.exit(bad.length ? 1 : 0);
