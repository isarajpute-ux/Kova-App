/* p44, the owner: "if I pull my information in... my workout, my fuel, my
   recipes... I really think it's not going to save anything the next day".
   Live mode (your own data, nothing seeded), in a real browser: log a
   workout, a recipe and a food, add a task, then come back tomorrow and a
   week later (the clock moved forward) and everything is still there.
     npm run build && node tests/e2e/keep.mjs */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const b = await chromium.launch(); const site = await serve(join(root, 'dist'));
const seen = { home: 1, move: 1, session: 1, fuel: 1, work: 1, worktasks: 1, recipes: 1, progress: 1 };
const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', 'kova.tours.v1': JSON.stringify(seen), kova_profile_v2: JSON.stringify({ theme: 'dark', tourSeen: true, tours: seen }) });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(/gstatic\.com|googletagmanager|google-analytics|fonts\.g|jsdelivr|cdnjs/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
await ctx.route(/\/api\//, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no server in tests"}' }));
/* the first visit seeds the storage once; a moved clock (__shift) makes it "tomorrow" */
await ctx.addInitScript((S) => {
  try { if (!localStorage.getItem('__seeded')) { for (const k in S) localStorage.setItem(k, S[k]); localStorage.setItem('__seeded', '1'); } } catch (e) {}
  const sh = +localStorage.getItem('__shift') || 0;
  if (sh) { const D = Date; class FD extends D { constructor(...a) { if (!a.length) super(D.now() + sh); else super(...a); } static now() { return D.now() + sh; } } window.Date = FD; }
}, STORE);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const boot = async () => { await p.goto(site.url + '/index.html'); await p.waitForFunction(() => window.__kovaLazyDone && window.KSESS && window.KovaFuel && window.WorkOS, null, { timeout: 40000 }); await p.evaluate(() => document.querySelectorAll('#kwn,#ksTour').forEach((x) => x.remove())); };
await boot();
const day1 = await p.evaluate(() => KovaFuel.dayKey());

/* a workout: two sets ticked, finished the way the button does */
await p.evaluate(async () => { go('session'); await new Promise((r) => setTimeout(r, 600)); const S = KSESS.state(); S.ex[0].sets.forEach((s) => { s.w = s.w || 95; s.r = s.r || 8; }); KSESS.api.toggle(0, 1); KSESS.api.toggle(0, 2); KSESS.finish(); });
const lift = await p.evaluate(() => KSESS.state().ex[0].n);
/* a recipe, logged from its page */
await p.evaluate(() => go('recipes')); await p.waitForTimeout(900);
await p.waitForSelector('#s-recipes .rcard', { timeout: 8000 }).catch(() => {});
await p.locator('#s-recipes .rcard').first().click(); await p.waitForTimeout(600);
const rcpOpen = await p.locator('#s-recipe.on #rcpLog').count();
const rcpName = await p.evaluate(() => (document.getElementById('rcpTitle') || {}).textContent || '');
if (rcpOpen) { await p.locator('#rcpLog').click(); await p.waitForTimeout(400); }
/* a food added by hand */
await p.evaluate(() => KovaFuel.add({ meal: 'Snack', kcal: 210, p: 20, c: 18, f: 6, items: [{ n: 'Test protein bar' }] }));
/* a task, from Work OS's New task */
await p.evaluate(() => go('worktasks')); await p.waitForTimeout(500);
await p.locator('#wtNewTask').click({ force: true }); await p.waitForTimeout(300);
await p.fill('#ntName', 'Chem homework ch 5'); await p.locator('#ntGo').click(); await p.waitForTimeout(400);
ck('today: the workout, the recipe, the food and the task are logged', await p.evaluate(({ lift, day1 }) => { const h = JSON.parse(localStorage.getItem('kova_hist_v1') || '{}'); return !!(h[lift] && h[lift].length) && KovaFuel.forDay(day1).length >= 2 && WorkOS.list('items').some((i) => /Chem homework/.test(i.name)); }, { lift, day1 }) && rcpOpen === 1);

for (const [label, days] of [['tomorrow', 1], ['a week later', 7]]) {
  await p.evaluate((d) => localStorage.setItem('__shift', String(d * 864e5)), days);
  await boot();
  const now = await p.evaluate(({ lift, day1 }) => {
    const h = JSON.parse(localStorage.getItem('kova_hist_v1') || '{}'), log = JSON.parse(localStorage.getItem('kova_log_v1') || '[]');
    const food = KovaFuel.forDay(day1).map((e) => (e.items || []).map((i) => i.n).join('+'));
    return { today: KovaFuel.dayKey(), hist: (h[lift] || []).length, sessions: log.length, food, todayFood: KovaFuel.today ? KovaFuel.forDay(KovaFuel.dayKey()).length : -1, task: WorkOS.list('items').some((i) => /Chem homework/.test(i.name)) };
  }, { lift, day1 });
  ck(label + ': the clock really moved (a new day in Fuel)', now.today !== day1 && now.todayFood === 0 || (console.log(now), false));
  ck(label + ': the workout is still in your history and log', now.hist >= 1 && now.sessions >= 1 || (console.log(now), false));
  ck(label + ': the recipe and the food are still on that day', now.food.length >= 2 && now.food.some((n) => /Test protein bar/.test(n)) && rcpName && rcpName !== 'Recipe' && now.food.some((n) => n.indexOf(rcpName.slice(0, 8)) >= 0) || (console.log(now, rcpName), false));
  ck(label + ': the task is still there', now.task);
  await p.evaluate(() => go('worktasks')); await p.waitForTimeout(500);
  ck(label + ': …and on the Tasks screen', /Chem homework ch 5/.test(await p.locator('#s-worktasks').innerText()));
}
ck('no page errors', !errs.length || (console.log(errs.slice(0, 3)), false));
let n = 0; R.forEach(([t, c]) => { console.log((c ? 'PASS ' : 'FAIL ') + t); if (c) n++; });
console.log(n + '/' + R.length + ' passing');
await b.close(); site.close();
process.exit(n === R.length ? 0 : 1);
