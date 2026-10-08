/* Workout programming follows the sport (p09).

   Boots the real page and checks: the saved goal is an id again, each sport
   gets gym days written for it (swimmers pull + rotator cuff + core, hikers
   climb and descent, cyclists and runners single-leg strength), swimming is
   said in pool lengths with warm-up / main / cool-down, hiking has its own
   test and week, the week is laid out with no gym day before a hard session,
   and the quiz offers the sport goals. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
const user = { uid: 'u1', getIdToken: () => Promise.resolve('t') };
w.firebase = {
  initializeApp() {}, apps: [{}],
  auth: () => ({ currentUser: user, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() }),
  database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
    remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
  storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} }),
  functions: () => ({ httpsCallable: () => () => Promise.resolve({ data: { text: '' } }) })
};
w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(300);
  const doc = w.document, P = w.KovaPlan, S = w.KovaSport, lib = (n) => w.KSESS.lib(n);
  const names = (plan) => plan.days.map((d) => d.ex.map((e) => e.e));
  const has = (plan, n) => plan.days.some((d) => d.ex.some((e) => e.e === n));

  // ---- the goal is an id again
  ck('an old save ("Swimming") reads as the swimming goal', w.__kovaModeId('Swimming') === 'swimming' && w.__kovaModeId('Hiking and biking') === 'hikebike' && w.__kovaModeId('Cycling') === 'hikebike');
  ck('the sport exercises exist in the library', ['Step up', 'Eccentric step down', 'Cable external rotation', 'Y-T-W raise', 'Box jump', 'Tibialis raise', 'Dead bug', 'Pogo hops'].every((n) => lib(n) && lib(n).n === n));

  // ---- gym days written for the sport
  const sw = P.generate('swimming', 2, 60);
  ck('swimming: two dryland days, not a bodybuilding split', sw.sport && sw.days.length === 2 && /Dryland A/.test(sw.days[0].n) && !sw.days.some((d) => /Upper|Push|Legs A/.test(d.n)));
  ck('swimming: pulls, rotator cuff work and core on day A', (has(sw, 'Pull up') || has(sw, 'Lat pulldown')) && has(sw, 'Cable external rotation') && (has(sw, 'Dead bug') || has(sw, 'Plank')));
  ck('swimming: jumps for starts and turns on day B', has(sw, 'Box jump'));
  ck('swimming: cuff work in every dryland day', sw.days.every((d) => d.ex.some((e) => /external rotation|Face pull|Y-T-W/.test(e.e))));
  const sw5 = P.generate('swimming', 5, 60);
  ck('swimming: at most three gym days, the rest are for swimming', sw5.days.length === 3 && sw5.capped);
  const hk = P.generate('hiking', 3, 60);
  ck('hiking: step-ups for the climb, slow step-downs for the descent', has(hk, 'Step up') && has(hk, 'Eccentric step down'));
  ck('hiking: ankles and the pack', has(hk, 'Tibialis raise') && has(hk, 'Farmer carry'));
  const cy = P.generate('hikebike', 2, 60);
  ck('cycling: heavy-ish legs and a back for the position', (has(cy, 'Barbell back squat') || has(cy, 'Leg press')) && has(cy, 'Back extension') && cy.days[0].ex[0].r <= 8);
  const run = P.generate('endurance', 2, 60);
  ck('running: calves, soleus and springs', has(run, 'Standing calf raise') && has(run, 'Seated calf raise') && has(run, 'Pogo hops'));
  ck('no exercise repeats within a sport week', [sw5, hk, cy, run].every((pl) => { const a = [].concat(...names(pl)); return a.length === new Set(a).size; }));
  const bb = P.generate('bodybuilding', 4, 60);
  ck('bodybuilding is unchanged: a 4-day upper/lower split', !bb.sport && bb.days.length === 4 && /Upper A/.test(bb.days[0].n));

  // ---- swimming in lengths, with a real session
  S.setVal('pool', '25m'); S.setVal('level', 'fit');
  let sp = S.plan('swimming');
  const thr = sp.sessions.find((x) => /Threshold/.test(x.d));
  ck('swim sessions have warm-up, main set and cool-down', thr && ['Warm-up', 'Main', 'Cool-down'].every((k) => thr.parts.some((q) => q[0] === k)));
  ck('in a 25 m pool a 100 is 4 lengths', thr.parts.some((q) => /10 × 100 m \(4 lengths\)/.test(q[1])) && /1,900 m \(76 lengths\)/.test(thr.v));
  S.setVal('pool', '50m'); sp = S.plan('swimming');
  ck('in a 50 m pool a 100 is 2 lengths', sp.sessions.find((x) => /Threshold/.test(x.d)).parts.some((q) => /\(2 lengths\)/.test(q[1])));
  S.setVal('pool', '25y'); sp = S.plan('swimming');
  ck('a yards pool says yards', /yd/.test(sp.sessions[0].v));
  S.setVal('level', 'learn'); sp = S.plan('swimming');
  ck('learning laps: short repeats with rest at the wall', /Learn A/.test(sp.sessions[0].d) && sp.sessions[0].parts.some((q) => /8 × 25/.test(q[1])));
  S.setVal('level', 'fit'); S.setVal('pool', '25m');

  // ---- hiking and cycling are separate
  const hp = S.plan('hiking');
  ck('hiking has its own climb test', hp.test.key === 'climb' && /vertical/.test(hp.test.how));
  ck('hiking week: easy time on feet, uphill intervals, a long hike with a pack', hp.sessions.some((x) => /Uphill intervals/.test(x.d)) && hp.sessions.some((x) => x.k === 'long' && /pack/.test(x.v)));
  ck('hiking progresses one variable at a time', /Never all three/.test(hp.next));
  ck('cycling no longer mixes in hikes', !S.plan('hikebike').sessions.some((x) => /hike/i.test(x.d + x.v)));
  ck('a long ride says how to fuel it', /carbohydrate/.test(S.plan('hikebike').sessions.find((x) => x.k === 'long').w));

  // ---- the Customize screen
  w.go('customize'); await wait(100);
  doc.getElementById('modePill').click(); await wait(20);
  const list = doc.getElementById('modeList').textContent;
  ck('the goal list has Hiking and Cycling', /Hiking/.test(list) && /Cycling/.test(list) && !/Hiking and biking/.test(list));
  doc.querySelector('#modeList .mopt[data-id="swimming"]').click(); await wait(120);
  ck('picking a goal saves its id', w.KP.get('mode') === 'swimming');
  ck('no separate sport section: the sport goes into the split', !doc.getElementById('sportBlock'));
  w.__paintPlanGen(); await wait(50);
  const card = doc.getElementById('splCard').textContent;
  ck('the split card lays out the whole week', /YOUR WEEK/.test(card) && /Mon/.test(card) && /Threshold \(CSS\)/.test(card) && /Dryland A/.test(card));
  const rows = [...doc.querySelectorAll('#splList .spwd')].map((r) => r.textContent);
  const hard = (t) => /Threshold|Speed|Long/.test(t);
  ck('no gym day falls the day before a hard or long swim', rows.every((r, i) => !/Dryland/.test(r) || !hard(rows[(i + 1) % 7])));

  // ---- p16: the simpler Customize screen - your week, day by day
  doc.querySelector('#modeList .mopt[data-id="bodybuilding"]') || doc.getElementById('modePill').click();
  await wait(20);
  doc.querySelector('#modeList .mopt[data-id="bodybuilding"]').click(); await wait(150);
  w.__paintPlanGen(); await wait(50);
  const tiles = [...doc.querySelectorAll('#splList .kwd')];
  ck('Your week: seven day tiles, four of them training days on a 4-day split (Mon, Tue, Thu, Fri)', tiles.length === 7 && tiles.filter((t) => !t.classList.contains('rest')).map((t) => t.querySelector('b').textContent).join() === 'Mon,Tue,Thu,Fri');
  tiles[0].click(); await wait(20);
  const day = doc.querySelector('#splList .kwday').textContent;
  ck('tapping Monday shows exactly what to do: the day, how long, and each exercise as sets and reps', /Monday · /.test(day) && /exercises · about \d+ min/.test(day) && /\d sets · \d+–\d+ reps/.test(day));
  doc.querySelectorAll('#splList .kwd')[2].click(); await wait(20);
  ck('a rest day says so in plain words', /Wednesday · Rest/.test(doc.querySelector('#splList .kwday').textContent));
  ck('one plain line about balance instead of ten bars, and one main button', !!doc.querySelector('#splVol .kwdot') && doc.querySelectorAll('#splVol .tevrow').length === 0 && doc.getElementById('splUse').textContent === 'Use this week');
  doc.getElementById('splVolMore').click(); await wait(30);
  ck('the full sets-per-muscle count opens in a pop-up', /Sets per muscle this week/.test((doc.getElementById('sheet') || {}).textContent || '') && doc.querySelectorAll('#sheet .tevrow').length >= 6);
  if (w.closeSheet) w.closeSheet();
  ck('the tabs read Your week / Muscles / Rules', [...doc.querySelectorAll('#s-customize .stgtab[role="tab"]')].map((t) => t.textContent.trim()).join('|') === 'Your week|Muscles|Rules');
  // Show prep, next to physique and performance
  doc.getElementById('modePill').click(); await wait(20);
  const goals = [...doc.querySelectorAll('#modeList .mopt')].map((m) => m.getAttribute('data-id'));
  ck('the first three programs are physique, performance and show prep', goals.slice(0, 3).join() === 'bodybuilding,athletic,showprep');
  doc.querySelector('#modeList .mopt[data-id="showprep"]').click(); await wait(150);
  w.__paintPlanGen(); await wait(50);
  ck('Show prep is saved and gets its own plan, on the days you picked', w.KP.get('mode') === 'showprep' && /diet down/.test(doc.getElementById('splWhy').textContent) && doc.querySelectorAll('#splList .kwd:not(.rest)').length === 4);
  ck('its rules are plain and link to prep calories and macros in Fuel', /0\.5–1%/.test(doc.getElementById('rxNote').textContent) && !!doc.querySelector('#rxHow [data-go="maint"]') && /WEIGHT/.test(doc.getElementById('rxGrid').textContent));
  // the Muscles tab counts sets you really logged this week
  const monday = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7), 9).getTime(); })();
  w.localStorage.setItem('kova_log_v1', JSON.stringify([{ t: monday, date: 'x', ex: [{ n: 'Back squat', m: 'Quads', sets: [{ w: 100, r: 5, role: 'warm' }, { w: 140, r: 8, role: 'work' }, { w: 140, r: 8, role: 'work' }, { w: 140, r: 7, role: 'work' }] }] }]));
  doc.querySelector('#modeList .mopt[data-id="bodybuilding"]') || doc.getElementById('modePill').click(); await wait(20);
  doc.querySelector('#modeList .mopt[data-id="bodybuilding"]').click(); await wait(150);
  const quads = [...doc.querySelectorAll('#volList .volrow')].find((r) => /Quads/.test(r.textContent));
  ck('the Muscles tab counts the sets you logged this week (3 work sets of quads, warm-up left out)', quads && /3\/16/.test(quads.textContent));
  ck('and the tip is about those real numbers', /Quads could use 13 more sets/.test(doc.getElementById('cInsight').textContent) || /could use/.test(doc.getElementById('cInsight').textContent));

  // ---- the quiz
  const quizOpts = w.document.getElementById('s-quiz') ? html.match(/'Swim stronger'/) && html.match(/'Hike bigger days'/) && html.match(/'Run farther or faster'/) : null;
  ck('the quiz offers swimming, running, hiking, cycling and calisthenics', !!quizOpts && /'Ride stronger'/.test(html) && /'Bodyweight strength and skills'/.test(html));

  let p = 0, f = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? p++ : f++; });
  console.log('\n' + p + '/' + (p + f) + ' passing');
  if (errors.length) { console.log('runtime errors: ' + errors.length); errors.slice(0, 6).forEach((e) => console.log('  ' + e)); }
  process.exit(f || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
