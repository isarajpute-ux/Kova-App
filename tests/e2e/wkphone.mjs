/* p52, the owner: "a more concise, simpler version of the Work OS only on
   mobile. For computer it can be where it has right now. Just like how
   Claude has: you can use code on desktop, but you can't on your phone...
   but let it work on the integration apps."
   In a real browser, live mode, signed out, three looks:
     - on a phone the Work OS home is the short one (Today, Meetings, AI
       team, Apps, On a computer) from your own tasks and meetings;
     - tick a task and it is Completed; add one and it is due today;
     - a meeting opens; Ask your team lands in the team chat; Apps opens
       the connections;
     - Studio, Automations, Workspace and Files say they are on a computer,
       and "Open here anyway" opens them (once said, not asked again);
     - on a computer nothing changed: the full home, no gate;
     - the Work tour walks the phone home on a phone.
     npm run build && node tests/e2e/wkphone.mjs      (ENGINE=webkit too; SHOTS=1 saves previews) */
import { chromium, webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const ENG = process.env.ENGINE === 'webkit' ? webkit : chromium;
const OUT = process.env.HOME + '/Kova/previews/p52/';
const b = await ENG.launch(); const site = await serve(join(root, 'dist'));
const seen = { home: 1, move: 1, fuel: 1, work: 1, worktoday: 1, workteam: 1, worktasks: 1, workmeetings: 1, workmeeting: 1, workauto: 1, 'new-2026-11-15': 1 };
const errs = [];

async function open(th, w, h) {
  const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'kova.consent': JSON.stringify({ a: false, at: 1 }), kova_mode_v1: 'live', 'kova.tours.v1': JSON.stringify(seen), 'wk.tour': '1',
    kova_profile_v2: JSON.stringify({ theme: th, tourSeen: true, tours: seen }) });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.route(/gstatic\.com|googletagmanager|google-analytics|cdnjs/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await ctx.route(/\/api\//, (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no server in tests"}' }));
  await ctx.addInitScript((S) => { try { if (!localStorage.getItem('__seeded')) { for (const k in S) localStorage.setItem(k, S[k]); localStorage.setItem('__seeded', '1'); } } catch (e) {} }, STORE);
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(th + ' ' + w + ': ' + e.message));
  await p.goto(site.url + '/index.html');
  await p.waitForFunction(() => window.__kovaLazyDone && window.KovaWorkPhone && window.KovaCrew && window.KovaTeamPlus && window.WorkOS, null, { timeout: 40000 });
  await p.evaluate(() => { document.querySelectorAll('#kwn,#ksTour').forEach((x) => x.remove()); });
  return { ctx, p };
}
/* your own work: one late task, two for today (one at 3 pm), one for next week, a meeting tomorrow */
const seed = (p) => p.evaluate(() => {
  const W = WorkOS, d0 = W.startOfDay();
  W.list('items').forEach((i) => W.remove('items', i.id));
  W.list('meetings').forEach((m) => W.remove('meetings', m.id));
  W.create('items', { id: 'late1', name: 'Send the chemistry lab report', status: 'Not Started', priority: 'High', due: d0 - 864e5 });
  W.create('items', { id: 'tod1', name: 'Film the unboxing clip', status: 'Not Started', priority: 'Medium', due: d0, time: '15:00' });
  W.create('items', { id: 'tod2', name: 'Reply to the supplier', status: 'Not Started', priority: 'Low', due: d0 });
  W.create('items', { id: 'next1', name: 'Plan the launch week', status: 'Not Started', priority: 'Low', due: d0 + 6 * 864e5 });
  W.create('meetings', { id: 'mt1', title: 'Call with the supplier', url: '', platform: 'phone', at: d0 + 864e5 + 10 * 36e5 });
  go('home'); go('work');
});
const txt = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e && e.offsetHeight > 0 ? e.innerText.replace(/\s+/g, ' ') : ''; }, sel);
const cur = (p) => p.evaluate(() => { const s = document.querySelector('.screen.on'); return s ? s.id : ''; });
const sheetOn = (p) => p.evaluate(() => document.getElementById('sheet').classList.contains('on'));

/* ================= a phone ================= */
for (const th of ['dark', 'soft', 'light']) {
  const { ctx, p } = await open(th, 390, 844);
  await seed(p); await p.waitForTimeout(500);
  const first = th === 'dark';
  const today = await txt(p, '#wkpToday');
  if (first) {
    ck('on a phone the Work OS home is the short one, and the computer home is out of sight', await p.evaluate(() => document.body.classList.contains('wk-phone') && document.getElementById('wkPhone').offsetHeight > 0
      && document.querySelector('#s-work .wk-tabs').offsetHeight === 0 && document.getElementById('wkRing').getBoundingClientRect().height === 0));
    ck('Today counts what is due now, late first (3: one late, two today; next week is not in it)', /3 tasks to do/.test(today) && /1 late/.test(today) && !/launch week/.test(today)
      && today.indexOf('chemistry lab') < today.indexOf('unboxing') && today.indexOf('unboxing') < today.indexOf('supplier') || (console.log(today), false));
    ck('a timed task shows its time, a late one says Late', /unboxing clip 3:00\s?PM/i.test(today) && /lab report Late/.test(today) || (console.log(today), false));
    const meet = await txt(p, '#wkpMeet');
    ck('Meetings shows the next one with its day and time', /Call with the supplier/.test(meet) && /Tomorrow · 10:00\s?AM/i.test(meet) || (console.log(meet), false));
    const team = await txt(p, '#wkpTeam');
    ck('AI team has a message box, and says honestly there are no reports yet', !!(await p.$('#wkpMsg')) && /No reports yet/.test(team));
    const apps = await txt(p, '#wkpApps');
    ck('Apps says how many are connected (none, signed out) and names them', /^APPS 0 of \d+ connected/i.test(apps) && /Email/.test(apps) && /TikTok/.test(apps) && /Connect apps/.test(apps) && /Inbox/.test(apps) || (console.log(apps), false));
    ck('the computer tools are named, not hidden', /ON A COMPUTER Studio Automations Workspace Files/i.test(await txt(p, '#wkpDesk')));
    ck('nothing runs off the side of a phone', await p.evaluate(() => { const m = document.getElementById('wkPhone').getBoundingClientRect(); return m.right <= innerWidth + 1 && [...document.querySelectorAll('#wkPhone *')].every((e) => e.getBoundingClientRect().right <= innerWidth + 1); }));
    ck('every button on it has a name and is big enough to tap (32 px or more)', await p.evaluate(() => [...document.querySelectorAll('#wkPhone button')].every((x) => ((x.innerText || '').trim() || x.getAttribute('aria-label')) && (x.getBoundingClientRect().height >= 32 || getComputedStyle(x, '::after').position === 'absolute'))));
  }
  if (process.env.SHOTS) await p.screenshot({ path: OUT + 'phone-home-' + th + '.png' });
  ck(th + ': the words can be read (task name and sub line are not near-invisible)', await p.evaluate(() => {
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    const a = lum(getComputedStyle(document.querySelector('#wkpToday .wkp-name')).color), bg = document.body.classList.contains('light-mode') ? 1 : document.body.classList.contains('soft-light') ? .4 : .05;
    return Math.abs(a - bg) > .45;
  }));

  if (first) {
    /* tick one off */
    await p.locator('#wkpToday .wkp-row[data-id="tod2"] .wkp-tick').click(); await p.waitForTimeout(600);
    ck('ticking a task marks it Completed for real, and the count drops', await p.evaluate(() => WorkOS.find('items', 'tod2').status === 'Completed') && /2 tasks to do/.test(await txt(p, '#wkpToday')));
    /* add one */
    await p.fill('#wkpNew', 'Buy poster board'); await p.press('#wkpNew', 'Enter'); await p.waitForTimeout(400);
    ck('Add a task puts it on today, in Work OS itself', await p.evaluate(() => { const i = WorkOS.list('items').filter((x) => x.name === 'Buy poster board')[0]; return !!i && i.due >= WorkOS.startOfDay() && i.due < WorkOS.startOfDay() + 864e5 && i.status !== 'Completed'; })
      && /3 tasks to do/.test(await txt(p, '#wkpToday')) && /Buy poster board/.test(await txt(p, '#wkpToday')) && (await p.inputValue('#wkpNew')) === '');
    await p.click('#wkpAdd .wkp-send'); await p.waitForTimeout(150);
    ck('an empty box adds nothing', await p.evaluate(() => WorkOS.list('items').filter((x) => x.status !== 'Completed').length === 4));
    /* a task opens */
    await p.locator('#wkpToday .wkp-row[data-id="tod1"] .wkp-name').click(); await p.waitForTimeout(400);
    ck('tapping a task opens that task', (await cur(p)) === 's-workitem' && /Film the unboxing clip/.test(await txt(p, '#s-workitem')));
    await p.evaluate(() => go('work')); await p.waitForTimeout(300);
    /* the board, all tasks */
    await p.click('#wkpToday [data-wkp="tasks"]'); await p.waitForTimeout(300);
    ck('All tasks opens the task list', (await cur(p)) === 's-worktasks');
    await p.evaluate(() => go('work')); await p.waitForTimeout(300);
    /* a meeting opens */
    await p.click('#wkpMeet [data-wkp="meeting"]'); await p.waitForTimeout(400);
    ck('tapping a meeting opens it', (await cur(p)) === 's-workmeeting' && /Call with the supplier/.test(await txt(p, '#s-workmeeting')));
    await p.evaluate(() => go('work')); await p.waitForTimeout(300);
    /* apps */
    await p.click('#wkpApps [data-wkp="apps"] >> nth=0'); await p.waitForTimeout(400);
    ck('Apps opens the connections page (Email, TikTok, Instagram...)', (await cur(p)) === 's-workintegrations' && /TikTok/.test(await txt(p, '#s-workintegrations')));
    await p.evaluate(() => go('work')); await p.waitForTimeout(300);

    /* the computer tools */
    await p.click('#wkpDesk [data-id="workstudio"]'); await p.waitForTimeout(450);
    const g1 = await txt(p, '#sheetIn');
    ck('Studio on a phone says it is on a computer, and stays on Work', (await sheetOn(p)) && /Studio is on a computer/.test(g1) && /Open here anyway/.test(g1) && (await cur(p)) === 's-work' || (console.log(g1), false));
    if (process.env.SHOTS) await p.screenshot({ path: OUT + 'phone-gate-' + th + '.png' });
    await p.click('#sheetBack'); await p.waitForTimeout(350);
    ck('Back closes that page', !(await sheetOn(p)) && (await cur(p)) === 's-work');
    await p.evaluate(() => go('workauto')); await p.waitForTimeout(400);
    ck('Automations too, from anywhere (search, a link)', (await sheetOn(p)) && /Automations are on a computer/.test(await txt(p, '#sheetIn')) && (await cur(p)) === 's-work');
    await p.click('#wkpAny'); await p.waitForTimeout(500);
    ck('"Open here anyway" opens it', !(await sheetOn(p)) && (await cur(p)) === 's-workauto');
    await p.evaluate(() => go('work')); await p.waitForTimeout(250);
    await p.click('#wkpDesk [data-id="workspace"]'); await p.waitForTimeout(450);
    ck('once said, it is not asked again this visit', !(await sheetOn(p)) && (await cur(p)) === 's-workspace');
    await p.evaluate(() => go('work')); await p.waitForTimeout(300);

    /* the tour on a phone */
    ck('the Work tour walks the phone home on a phone (every stop is on screen)', await p.evaluate(() => KovaWorkTour.steps.length === 5 && KovaWorkTour.steps[0].t === 'Today' && KovaWorkTour.steps.every((s) => { const e = s.el(); return e && e.offsetHeight > 0; })));
    await p.evaluate(() => KovaWorkTour.run()); await p.waitForTimeout(900);
    ck('and it plays', await p.evaluate(() => KovaTour.active()));
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);

    /* ask the team: last, it leaves a job running */
    await p.fill('#wkpMsg', 'What should I do first today?'); await p.click('#wkpAsk .wkp-send'); await p.waitForTimeout(900);
    ck('Ask your team sends it to the team chat and opens the chat', (await cur(p)) === 's-workteam' && await p.evaluate(() => KovaTeamPlus.chat().msgs.some((m) => m.who === 'you' && /do first today/.test(m.t)))
      && /What should I do first today/.test(await txt(p, '#s-workteam')));
    await p.evaluate(() => go('work')); await p.waitForTimeout(500);
    const t2 = await txt(p, '#wkpTeam');
    ck('back on the home, a typed message is not left in the box', (await p.inputValue('#wkpMsg')) === '' && /AI TEAM/i.test(t2));
  }
  await ctx.close();
}

/* ================= a computer ================= */
{
  const { ctx, p } = await open('dark', 1280, 800);
  await seed(p); await p.waitForTimeout(500);
  ck('on a computer the Work OS home is the full one, unchanged', await p.evaluate(() => !document.body.classList.contains('wk-phone') && document.querySelector('#s-work .wk-tabs').offsetHeight > 0
    && document.getElementById('wkRing').getBoundingClientRect().height > 0 && (!document.getElementById('wkPhone') || document.getElementById('wkPhone').offsetHeight === 0)));
  await p.evaluate(() => go('workstudio')); await p.waitForTimeout(500);
  ck('and Studio just opens', (await cur(p)) === 's-workstudio' && !(await sheetOn(p)));
  ck('the Work tour is the computer one there', await p.evaluate(() => KovaWorkTour.steps.length > 5 && KovaWorkTour.steps[0].t === 'Your Work OS'));
  /* a narrow window is a phone; widening it brings the full home back */
  await p.evaluate(() => go('work')); await p.setViewportSize({ width: 420, height: 800 }); await p.waitForTimeout(400);
  const narrow = await p.evaluate(() => document.body.classList.contains('wk-phone') && document.getElementById('wkPhone').offsetHeight > 0);
  await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(400);
  ck('a narrow window gets the phone home, a wide one the full home again', narrow && await p.evaluate(() => !document.body.classList.contains('wk-phone') && document.querySelector('#s-work .wk-tabs').offsetHeight > 0));
  await ctx.close();
}

ck('no script errors', errs.length === 0 || (console.log(errs.slice(0, 5)), false));
let pass = 0; R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); if (o) pass++; });
console.log('\n' + pass + '/' + R.length + ' wkphone');
await b.close(); site.close();
process.exit(pass === R.length ? 0 : 1);
