/* One goal, everywhere (p29, src/p08_goal.js). What you train for steers:
     Workout   a "Built around" card: Train / Eat / Sleep for this goal, and
               for a sport the week written out (laps in lengths, drills,
               intervals, the long day), each session opening to the full
               set with its words explained, "How to get faster" and your
               test number that sets every pace
     Machines  sets, reps and rest from your goal, why that machine matters
               for your sport, "Add to my program" really adds it; cardio
               machines (bike, rower, stair climber, elliptical) are known
     Fuel      what the goal asks of food, protein in grams from your weight;
               swims, hikes and rides count as training; the goal list
               lines up with the Workout quiz (it used to point at the
               wrong goals) and a swimmer stays a swimmer
     Sleep     the hours this goal needs, against your own nights
   Runs with your own data (live mode), where Workout starts as a plain
   card: the goal card, Check my form and Scan a machine must still show. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f) => { for (let i = 0; i < 80; i++) { try { if (f()) return true; } catch (e) {} await wait(50); } return false; };
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: new VirtualConsole() });
const w = dom.window;
w.localStorage.setItem('kova.auth.skipped', '1');
w.localStorage.setItem('kova_mode_v1', 'live');
w.HTMLElement.prototype.scrollIntoView = function () {};
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
(async () => {
  await wait(2200);
  const doc = w.document, $ = (s) => doc.querySelector(s), G = w.KovaGoal;
  const click = (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const sheetTxt = () => { const s = $('#sheet.on') || $('.sheet.on'); return s ? s.textContent : ''; };
  const toasts = []; w.toast = (m) => toasts.push(String(m));
  const quiz = (goal) => { const i = ['bodybuilding', 'athletic', 'showprep', 'powerlifting', 'weightloss', 'toning', 'health', 'calisthenics', 'endurance', 'swimming', 'hiking', 'hikebike'].indexOf(goal);
    w.KP.set('quiz', { a: { goal: i, exp: 1, days: 4, mins: 60, gear: [0], limits: [5], bw: 180 }, goal, days: 4, mins: 60, gear: ['gym'], limits: ['none'], at: Date.now() }); G.paint(); };
  ck('the goal module loaded', !!G);

  /* no goal yet: one clear way in, nothing invented on Fuel or Sleep */
  w.go('move'); await wait(150);
  ck('with no goal, Workout asks what you train for', /Pick my goal/.test($('#goalSlot').textContent));
  ck('with no goal, Fuel and Sleep add nothing', !$('#goalFuel').textContent.trim() && !$('#goalSleep').textContent.trim());
  ck('with your own data, the goal card is not hidden by the live panel', $('#goalSlot').classList.contains('kl-keep') && $('#s-move').classList.contains('kl-gated'));
  const panel = ($('#s-move .kl-panel') || {}).textContent || '';
  ck('with your own data, Workout still has Check my form and Scan a machine', /Check my form/.test(panel) && /Scan a machine/.test(panel));

  /* swimming: the week, in lengths, with drills explained */
  quiz('swimming'); w.go('move'); await wait(150);
  const slot = $('#goalSlot').textContent;
  ck('Workout says what it is built around', /Built around/i.test(slot) && /Swimming/.test(slot));
  ck('Train, Eat and Sleep each say what swimming asks of them', /swims \+ \d gym days/.test(slot) && /Carbs before swims/.test(slot) && /8–9 hours/.test(slot));
  ck('the swims are written out with distances in lengths', doc.querySelectorAll('#goalSlot .kg-ses').length >= 4 && /\d+ lengths/.test(slot) && /Threshold/.test(slot) && /Technique/.test(slot));
  click([...doc.querySelectorAll('#goalSlot .kg-ses')].find((b) => /Technique/.test(b.textContent))); await wait(60);
  const st = sheetTxt();
  ck('a swim opens to warm-up, drills, main set and cool-down', /Warm-up/.test(st) && /Drills/.test(st) && /Main/.test(st) && /Cool-down/.test(st));
  ck('the drills are explained in plain words', /What the words mean/i.test(st) && /Catch-up/.test(st) && /One hand waits in front/.test(st) && /Fingertip drag/.test(st));
  ck('"kick" is not explained where nobody kicks', !/Legs only, holding a kickboard/.test(st));
  w.closeSheet(); click($('#goalSlot [data-kg="guide"]')); await wait(60);
  const gs = sheetTxt();
  ck('How to swim faster covers the words, strokes, technique, drills, volume, dryland and the pool', ['A length is one end', 'Freestyle (front crawl)', 'Head down', 'Breathe out under water', 'Count strokes', 'Catch-up', 'How much to swim', 'dryland', 'circle swimming'].every((x) => gs.indexOf(x) > -1));

  /* your test number sets the pace, and this week's set shows in the session */
  w.closeSheet(); click($('#goalSlot [data-kg="test"]')); await wait(60);
  ck('the swim pace pop-up explains the CSS test and asks for the pool and level', /CSS test/.test(sheetTxt()) && /25 yd/.test(sheetTxt()) && /400 without stopping/.test(sheetTxt()));
  $('#kgTest').value = '2:00'; click($('#sheet [data-kg="savetest"]')); await wait(150);
  ck('saving it keeps the number and starts week 1', w.KovaSport.vals().css === '2:00' && /CSS test: 2:00|CSS test.*2:00/.test($('#goalSlot').textContent) && /WEEK 1 OF 12/.test($('#goalSlot').textContent));
  const thr = [...doc.querySelectorAll('#goalSlot .kg-ses')].find((b) => /Threshold/.test(b.textContent));
  ck('the threshold swim shows this week’s set, not a different one', /This week: \d+ × 100 at CSS/.test(thr.textContent));
  click(thr); await wait(60);
  ck('…and its main set inside the session matches it', /This week \(week 1\)/.test(sheetTxt()) && /Main\d+ × 100 at CSS, \d+ s rest/.test(sheetTxt().replace(/\s+/g, ' ').replace(/Main /, 'Main')));
  w.closeSheet();
  const easy = [...doc.querySelectorAll('#goalSlot .kg-ses')].find((b) => /Technique/.test(b.textContent)); click(easy); await wait(60);
  ck('easy swims get a pace from your CSS (2:08–2:10 per 100)', /2:08–2:10 \/ 100/.test(sheetTxt()));
  w.closeSheet();

  /* the other sports */
  quiz('hiking'); await wait(60); click($('#goalSlot [data-kg="guide"]')); await wait(60);
  const hk = sheetTxt();
  ck('hiking: trails by distance and climbing, a ladder of hikes, timing, up, down, pack, food and the gym', ['elevation gain', '500 ft per mile', 'Your ladder', '3 to 5 miles', 'Naismith', 'rest step', 'Coming down', 'hip belt', '0.5 L', 'Step-ups'].every((x) => hk.indexOf(x) > -1));
  ck('hiking week has the uphill day and the long hike with the pack', /Uphill intervals/.test($('#goalSlot').textContent) && /Long hike.*lb in the pack/.test($('#goalSlot').textContent));
  w.closeSheet(); quiz('hikebike'); await wait(60); click($('#goalSlot [data-kg="guide"]')); await wait(60);
  const bk = sheetTxt();
  ck('cycling: where to ride (road, gravel, green/blue/black trails), how far, how hard, cadence, fit, fuel, gym', ['Road', 'gravel', 'green', 'blue', 'black', '30 to 60 miles', 'FTP', '80 to 95 pedal turns', 'knee is slightly bent', '30 to 60 g of carbs', 'Squats or leg press', 'core'].every((x) => bk.indexOf(x) > -1));
  ck('cycling zones read "55–75% FTP", not "55% FTP–75% FTP"', /55–75% FTP/.test($('#goalSlot').textContent) && !/% FTP–\d/.test($('#goalSlot').textContent));
  w.closeSheet(); quiz('endurance'); await wait(60);
  ck('running: easy, intervals and a long run that grows week to week', /Easy run/.test($('#goalSlot').textContent) && /Intervals/.test($('#goalSlot').textContent) && /Long run/.test($('#goalSlot').textContent) && /This week: [\d.]+ mi/.test($('#goalSlot').textContent));
  quiz('toning'); await wait(60);
  ck('lean and defined: cardio this week and the lean guide', /YOUR CARDIO THIS WEEK/i.test($('#goalSlot').textContent) && /How to look lean and defined/.test($('#goalSlot').textContent));
  click($('#goalSlot [data-kg="pillar"][data-p="eat"]')); await wait(60);
  ck('Eat for lean: a small deficit and protein in grams from your weight (180 lb)', /slightly under what you burn/.test(sheetTxt()) && /145 to 180 g/.test(sheetTxt()));
  w.closeSheet();

  /* Fuel and Sleep follow the goal, with your own numbers */
  quiz('swimming'); w.go('fuel'); await wait(150);
  ck('Fuel says what swimming asks of food, with protein in grams from your weight', /Swimming/i.test($('#goalFuel').textContent) && /Carbs before swims/.test($('#goalFuel').textContent) && /115–145 g protein a day/.test($('#goalFuel').textContent));
  w.go('sleep'); await wait(150);
  ck('Sleep says the hours swimming needs and waits for real nights before comparing', /8–9 hours a night/.test($('#goalSleep').textContent) && /once your watch sends three/.test($('#goalSleep').textContent));
  for (let d = 1; d <= 4; d++) w.KovaSleepLog.record({ t: Date.now() - d * 864e5, mins: 400 });
  G.paint();
  ck('…then compares them: 6 h 40 min average, about 1 h 20 min short', /You averaged 6 h 40 min over 4 nights, about 1 h 20 min short/.test($('#goalSleep').textContent));
  ck('Sleep’s goal card shows with your own data', $('#goalSleep').classList.contains('kl-keep'));

  /* the calorie calculator knows a swimmer, and the goals line up */
  const M = w.KovaMaint;
  ck('swims, hikes and rides count as training in Fuel', ['swim', 'hike', 'ride'].every((id) => M.TYPES.some((t) => t.id === id && t.met > 4)));
  ck('a swimmer’s Fuel starts on swimming as their training', M.draft().train.type === 'swim');
  quiz('powerlifting');
  M.sendWorkout(Object.assign(M.draft(), { goal: 'strength', kg: 80 }));
  ck('Fuel’s "Get stronger" sends Powerlifting to Workout (it used to land on Athletic)', w.KP.get('quiz').a.goal === 3 && w.KP.get('quiz').goal === 'powerlifting');
  quiz('swimming');
  M.sendWorkout(Object.assign(M.draft(), { goal: 'cut', kg: 80 }));
  ck('a swimmer who wants to lose fat is still a swimmer in Workout', w.KP.get('quiz').goal === 'swimming' && w.KP.get('quiz').a.goal === 9);

  /* machine scan: sets and reps by goal, why it matters, really added */
  quiz('swimming'); w.KP.set('plan', null); w.go('machine'); await wait(150);
  const names = w.__kovaMachines.map((m) => m.n);
  ck('the scan knows the stationary bike, rowing machine, stair climber and elliptical', ['Stationary bike', 'Rowing machine', 'Stair climber', 'Elliptical'].every((n) => names.indexOf(n) > -1) && names.indexOf('Stationary bike') < names.indexOf('Not sure / not listed'));
  ck('…and they are in the list you can pick from', /Rowing machine/.test($('#mcList').textContent));
  const pick = (re) => click([...doc.querySelectorAll('#mcList .mcopt')].find((e) => re.test(e.textContent)));
  pick(/Lat pulldown/); await wait(80);
  const rx = ($('#mcResult .kg-rx') || {}).textContent || '';
  const PG = w.KovaPlan.goals.swimming.rep.comp;
  ck('Lat pulldown for a swimmer: sets, reps and rest from the goal', /For your goal: Swimming/.test(rx) && new RegExp('REPS' + PG[0] + '-' + PG[1]).test(rx.replace(/\s+/g, '')) && /SETS3/.test(rx.replace(/\s+/g, '')) && /REST1–1.5min/.test(rx.replace(/\s+/g, '')));
  ck('…and why it matters: it is the swimming pull', /This is the swimming pull/.test(rx));
  click($('#mcAdd')); await wait(30);
  ck('with no plan yet, Add says to build one first', /Build your plan first/.test(toasts[toasts.length - 1] || ''));
  w.KP.set('plan', { name: 'swim', days: [{ n: 'Dryland A · pull and shoulders', ex: [{ e: 'Pull up', s: 3, r: 10 }] }, { n: 'Dryland B · legs, starts and core', ex: [] }] });
  click($('#mcAdd')); await wait(30);
  const P1 = w.KP.get('plan');
  ck('Add to my program really adds Lat pulldown to the pull day', P1.days[0].ex.some((e) => e.e === 'Lat pulldown' && e.s === 3) && !P1.days[1].ex.length && /added to Dryland A/.test(toasts[toasts.length - 1]));
  click($('#mcAdd')); await wait(30);
  ck('adding it twice says it is already there', /already in Dryland A/.test(toasts[toasts.length - 1]) && w.KP.get('plan').days[0].ex.filter((e) => e.e === 'Lat pulldown').length === 1);
  quiz('hiking'); w.go('machine'); pick(/Stair climber/); await wait(80);
  const sc = ($('#mcResult .kg-rx') || {}).textContent || '';
  ck('a stair climber for a hiker: what to do on it, and no lifting "Add" button', /Steady climb/.test(sc) && /Climb intervals/.test(sc) && /closest thing to a trail/.test(sc) && !$('#mcAdd'));
  w.KP.set('plan', { name: 'hike', days: [{ n: 'Upper · carrying the pack', ex: [] }, { n: 'Legs A · the climb', ex: [] }] });
  pick(/Dumbbells/); await wait(80);
  const chip = [...doc.querySelectorAll('#mcResult .kg-add')].find((c) => c.getAttribute('data-n') === 'Step up');
  ck('dumbbells for a hiker: the best moves for hiking, one tap to add', !!chip && /Best moves for your hiking/.test($('#mcResult .kg-rx').textContent));
  click(chip); await wait(30);
  ck('…and Step up lands on the legs day', w.KP.get('plan').days[1].ex.some((e) => e.e === 'Step up') && !w.KP.get('plan').days[0].ex.length);

  /* Form Check uses the same helper, first on the day */
  quiz('bodybuilding'); w.KP.set('plan', { name: 'bb', days: [{ n: 'Lower', ex: [{ e: 'Leg press', s: 3, r: 10 }] }] });
  G.addToPlan('Back squat', 3, '8-12', true);
  ck('Form Check’s add puts the lift first on the matching day', w.KP.get('plan').days[0].ex[0].e === 'Back squat');
  ck('reps follow the goal: powerlifting low, toning higher', /^[1-5]-[3-6]$/.test(G.rx('Leg press', 'powerlifting').r) && +G.rx('Leg extension', 'toning').r.split('-')[1] >= 15);

  const bad = R.filter((r) => !r[1]);
  R.forEach((r) => console.log((r[1] ? 'ok   ' : 'FAIL ') + r[0]));
  console.log(bad.length ? bad.length + ' failed' : 'all ' + R.length + ' passed');
  process.exit(bad.length ? 1 : 0);
})();
