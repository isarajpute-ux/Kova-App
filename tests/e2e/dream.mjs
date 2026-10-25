/* p38 Dream physique in a real browser, phone size, live mode, in dark,
   soft light and light glass (and iPhone's engine with ENGINE=webkit):
   the card on Workout, a photo of the body you want and one of you added
   through the phone's picker, Compare (the AI answer scripted), the
   muscles to build lit on your own photo (and on the goal's, by the
   switch), your change at 3 months / 6 months / 1 year, the plan as
   Train / Eat / Steps, Use this plan switching Fuel, and the page fitting
   the phone.
     node tests/e2e/dream.mjs          (after npm run build) */
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
const seen = { home: 1, move: 1, session: 1, customize: 1, 'new-2026-10-21': 1, 'new-2026-10-22': 1, 'new-2026-10-23': 1, 'new-2026-10-24': 1 };
const MAINT = { v: 1, unit: 'lb', sex: 'm', age: 28, hcm: 178, kg: 84, bf: null, goal: 'maint', rate: 0, steps: 7000, sleepH: 7.5, train: { days: 4, mins: 60, type: 'wmod', cardioMin: 0, cardioLvl: 'easy' }, macros: null, applied: false };
const ANSWER = { ok: true, target: { sex: 'male', visible: { upper: true, lower: true }, cues: ['clear six-pack', 'visible obliques', 'round shoulders'], bodyfat: [10, 13], confidence: 'high', build: 'athletic', muscle: 'a lot', standout: ['delts', 'abs', 'lats'], looks: 'A lean, athletic build with broad shoulders and a narrow waist.', caveat: 'Good light and a slight pump.' },
  you: { visible: { upper: true, lower: true }, cues: ['soft waist', 'no ab lines'], bodyfat: [21, 24], confidence: 'medium', build: 'average', muscle: 'some' },
  focus: [{ m: 'delts', why: 'Wider, rounder shoulders make the waist look narrow' }, { m: 'lats', why: 'A wider back gives the V shape' }, { m: 'quads', why: 'Fuller thighs balance the upper body' }],
  marks: [{ img: 2, m: 'delts', x: 0.3, y: 0.25, len: 0.12, wid: 0.08, a: -25 }, { img: 2, m: 'delts', x: 0.7, y: 0.25, len: 0.12, wid: 0.08, a: 25 }, { img: 2, m: 'lats', x: 0.42, y: 0.4, len: 0.16, wid: 0.08, a: 10 }, { img: 2, m: 'quads', x: 0.43, y: 0.72, len: 0.18, wid: 0.08, a: 0 },
    { img: 1, m: 'delts', x: 0.3, y: 0.22, len: 0.12, wid: 0.08, a: -25 }, { img: 1, m: 'lats', x: 0.4, y: 0.38, len: 0.16, wid: 0.08, a: 10 }] };
const COACH = { answer: 'Make your shoulders and back wider: press and raise twice a week, pull down twice a week, and keep protein high.', steps: ['Lateral raises every upper day', 'Add a rep or a little weight each week'],
  split: [{ day: 'Day 1', focus: 'Shoulders and back', ex: [{ n: 'Overhead press', sets: 3, reps: '6-10', note: '' }, { n: 'Lateral raise', sets: 3, reps: '12-15', note: 'slow down' }] }, { day: 'Day 2', focus: 'Legs', ex: [{ n: 'Leg press', sets: 3, reps: '10-12', note: '' }] }],
  meals: [{ meal: 'Breakfast', food: 'Eggs 3, oats 80 g', kcal: 700, p: 40, c: 80, f: 22 }, { meal: 'Lunch', food: 'Chicken 200 g, rice 200 g', kcal: 850, p: 70, c: 100, f: 15 }, { meal: 'Dinner', food: 'Beef 180 g, potatoes 300 g', kcal: 750, p: 75, c: 65, f: 25 }], tips: ['Sleep 8 hours'] };
for (const theme of ['dark', 'soft', 'light']) {
  let first = 0;
  const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', 'kova.tours.v1': JSON.stringify(Object.assign({ dreampage: theme !== 'dark' ? 1 : undefined }, seen)),
    kova_profile_v2: JSON.stringify({ theme, tourSeen: true, tours: seen, maint: MAINT, model: { p: 'anthropic', key: 'sk-test-e2e', model: 'test' } }) });
  const { context, page: p } = await openPage(b, null, { storage: STORE });
  let coached = 0;
  await context.route('https://api.anthropic.com/**', (r) => { const b = JSON.parse(r.request().postData() || '{}'), isCoach = /You are Kova/.test(b.system || ''); if (isCoach) coached++; else first++;
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(isCoach ? COACH : ANSWER) }] }) }); });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(site.url + '/index.html');
  await p.waitForFunction(() => window.KovaDream && window.KovaMaint, null, { timeout: 30000 });
  await p.evaluate(() => go('move')); await p.waitForTimeout(900);
  await p.waitForSelector('#kdpCard', { timeout: 8000 }).catch(() => {});
  ck(theme + ': the Dream physique card is on Workout', await p.locator('#kdpCard').count() === 1);
  await p.locator('#kdpCard [data-kdp="open"]').click(); await p.waitForTimeout(600);
  for (let i = 0; i < 6; i++) { if (await p.locator('#ksTour [data-t="skip"]').count()) await p.locator('#ksTour [data-t="skip"]').first().click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(200); }
  ck(theme + ': it opens its page inside the app', await p.locator('#kdp').count() === 1 && await p.evaluate(() => !!document.getElementById('kdp').closest('.app')));
  const pickFile = async (sel) => { const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.locator(sel).click()]); await fc.setFiles(join(root, 'icon-512.png')); await p.waitForTimeout(500); };
  await pickFile('#kdp [data-kdp="want"]');
  ck(theme + ': a picture of the body you want, picked from the phone, shows', await p.locator('#kdp .kdp-slot.on[data-kdp="want"] img').count() === 1 && !(await p.locator('#kdp [data-kdp="compare"]').isDisabled()));
  /* p43c: the page had no frame (edge to edge); now a centred column with room at the sides */
  const fr = await p.evaluate(() => { const w = document.querySelector('#kdp .kz2p-wrap').getBoundingClientRect(), c = document.querySelector('#kdp .kdp-in').getBoundingClientRect(); return { l: c.left, r: innerWidth - c.right }; });
  ck(theme + ': the page has room at the sides (not edge to edge)', fr.l >= 12 && fr.r >= 12 || (console.error(theme, fr), false));
  await pickFile('#kdp [data-kdp="me"]');
  ck(theme + ': …and your own photo, side by side with it', await p.locator('#kdp .kdp-slot.on[data-kdp="me"] img').count() === 1);
  await p.locator('#kdpQ').fill('How do I get my shoulders and back wider like him?');
  await p.locator('#kdp [data-kdp="compare"]').click();
  await p.waitForSelector('#kdp .kdp-tl', { timeout: 15000 }).catch(() => {});
  ck(theme + ': Compare: the muscles lit on your own photo, your change over time and your plan (no body diagram)', await p.locator('#kdp .kdp-you-p').count() === 1 && await p.locator('#kdp .kdp-tl .kdp-col').count() === 7 && await p.locator('#kdp .kdp-ans').count() === 1 && await p.locator('#kdpNow').count() === 0 && first === 1);
  const txt = await p.locator('#kdp').textContent();
  ck(theme + ': the muscles to build are drawn on your photo (orange glow, angled, a line to a glass label)', await p.locator('#kdp .kdp-you-p .kdp-mk').count() === 4 && await p.locator('#kdp .kdp-you-p .kdp-ml').count() === 3 && await p.locator('#kdp .kdp-you-p .kdp-ln').count() === 3);
  const fits = await p.evaluate(() => { const b = document.querySelector('#kdp .kdp-you-p .kdp-pw').getBoundingClientRect(); return [...document.querySelectorAll('#kdp .kdp-you-p .kdp-ml')].every((l) => { const r = l.getBoundingClientRect(); return r.left >= b.left - 1 && r.right <= b.right + 1; }); });
  ck(theme + ': …every label sits inside the photo', fits);
  const box = await p.evaluate(() => { const i = document.querySelector('#kdp .kdp-you-p img').getBoundingClientRect(), v = document.querySelector('#kdp .kdp-you-p svg').getBoundingClientRect(); return Math.abs(i.width - v.width) < 1 && Math.abs(i.height - v.height) < 1; });
  ck(theme + ': …the marks sit exactly over the photo', box);
  await p.locator('#kdp .kdp-photos [data-kdp="flip"]').click(); await p.waitForTimeout(200);
  const goalMarks = await p.locator('#kdp .kdp-goal-p .kdp-mk').count();
  await p.locator('#kdp .kdp-photos [data-kdp="flip"]').click(); await p.waitForTimeout(200);
  ck(theme + ': …the switch shows them on the goal photo, and back', goalMarks === 2 && await p.locator('#kdp .kdp-you-p').count() === 1);
  await p.waitForSelector('#kdp .kdp-rows', { timeout: 15000 }).catch(() => {});
  const ans = await p.locator('#kdp .kdp-ans').textContent();
  await p.locator('#kdp [data-kdp="tab"][data-t="eat"]').click(); await p.waitForTimeout(150);
  const eat = await p.locator('#kdp .kdp-tab').textContent();
  ck(theme + ': your question is answered: the answer, a split, and a day of meals that Kova adds up', coached === 1 && /shoulders and back wider/.test(ans) && /Your split, 2 days/.test(ans) && /Adds up to 2300 calories/.test(eat));
  ck(theme + ': …what to change, your change, your plan, and what Kova saw', /fat to lose/.test(txt) && /YOUR CHANGE/.test(txt) && /YOUR PLAN/.test(txt) && /Kova saw: clear six-pack/.test(txt) && /In your photo: soft waist/.test(txt));
  const c0 = await p.locator('#kdp .kdp-fl').textContent();
  await p.locator('#kdp .kdp-pills [data-s="12"]').click(); await p.waitForTimeout(150);
  await p.locator('#kdp .kdp-col').nth(2).click(); await p.waitForTimeout(150);
  const c1 = await p.locator('#kdp .kdp-fl').textContent();
  ck(theme + ': your change: a pill and a tap on a point in time move the floating card', c0 !== c1 && /at 4 months/.test(c1) && await p.locator('#kdp .kdp-col.on').count() === 1);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ck(theme + ': the page fits the phone', over <= 1);
  await p.waitForTimeout(1800);
  for (const [sel, name] of [['.kdp-photos', 'photos'], ['.kdp-tl', 'change'], ['.kdp-ans', 'plan']]) {
    await p.evaluate((q) => { const r = document.querySelector('#kdp ' + q); if (r) r.scrollIntoView({ block: 'start' }); }, sel);
    await p.waitForTimeout(300);
    await p.screenshot({ path: join(shots, `dream-${name}-${theme}.png`) });
  }
  await p.locator('#kdp [data-kdp="useplan"]').click(); await p.waitForTimeout(300);
  ck(theme + ': Use this plan switches Fuel to it', await p.evaluate(() => { const m = KovaMaint.prof(); return m && m.applied && /cut|lean/.test(m.goal); }));
  await p.locator('#kdp [data-kdp="close"]').click(); await p.waitForTimeout(500);
  ck(theme + ': the Workout card now shows you now and your goal', /you now/.test(await p.locator('#kdpCard').textContent()));
  await p.evaluate(() => { const c = document.getElementById('kdpCard'); if (c) c.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(300);
  await p.screenshot({ path: join(shots, `dream-card-${theme}.png`) });
  ck(theme + ': no page errors', !errs.length || (console.error(errs.slice(0, 3)), false));
  await context.close();
}
await b.close(); site.close();
const bad = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS' : 'FAIL') + ' ' + x[0]));
console.log(`${R.length - bad.length}/${R.length} passing`);
process.exit(bad.length ? 1 : 0);
