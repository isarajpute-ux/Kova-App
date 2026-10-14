/* The second question for hiking, cycling and calisthenics (p30). The
   owner: pick Hiking and it asks what kind (rock climbing, bouldering...);
   Cycling asks "Do you compete?", the date and the distance, and says how
   long there is to train; Calisthenics asks which skills and gives the
   steps (pike push-ups first for a handstand push-up). */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
w.localStorage.setItem('kova_mode_v1', 'live');
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
(async () => {
  await wait(1500);
  const doc = w.document, G = w.KovaGoalPlus, DAY = 864e5;
  const setGoal = (g) => { const q = w.KP.get('quiz') || {}; q.goal = g; w.KP.set('quiz', q); };
  const card = () => (doc.getElementById('gpSlot') || { textContent: '' }).textContent;
  const fire = (sel, v) => { const f = doc.querySelector(sel); f.value = v; f.dispatchEvent(new w.Event('change', { bubbles: true })); };
  ck('the module is on the page', !!G);

  /* cycling */
  setGoal('hikebike'); w.go('move'); G.paint(); await wait(20);
  ck('Cycling asks "Do you compete?" on Workout', /Your riding/.test(card()) && /Do you compete\?/.test(card()));
  doc.querySelector('[data-gp="comp"][data-v="1"]').click(); await wait(10);
  ck('yes: it asks what you race, the date, the distance and a target time', /Gravel race/.test(card()) && /Time trial/.test(card()) && !!doc.querySelector('[data-gpf="date"]') && !!doc.querySelector('[data-gpf="dist"]') && !!doc.querySelector('[data-gpf="time"]'));
  doc.querySelector('[data-gp="type"][data-v="gravel"]').click(); await wait(10);
  const d = new Date(Date.now() + 10 * 7 * DAY + 2 * DAY); const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  fire('[data-gpf="date"]', iso); fire('[data-gpf="dist"]', '100'); fire('[data-gpf="time"]', '4:00'); await wait(10);
  const c1 = card();
  ck('it counts down: 10 weeks to go, Build phase, race pace 25 km/h (16 mph)', /10 weeks to go/.test(c1) && /Build phase/.test(c1) && /race pace 25 km\/h \(16 mph\)/.test(c1));
  ck('and says how long a 100 km event usually takes to train for (12 weeks) and that this plan grows faster', /about 12 weeks/.test(c1) && /grows the long ride faster/.test(c1));
  ck('this week: threshold, VO2 max and a long ride of about 70 km (43 mi)', /Threshold/.test(c1) && /VO2 max/.test(c1) && /70 km \(43 mi\)/.test(c1));
  ck('phases follow the weeks left: 14 base, 8 build, 4 peak, 1 taper, 0 race week', G.phase(14) === 'Base' && G.phase(8) === 'Build' && G.phase(4) === 'Peak' && G.phase(1) === 'Taper' && G.phase(0) === 'Race week');
  doc.querySelector('[data-gp="comp"][data-v="0"]').click(); await wait(10);
  ck('no: a fitness week with a long ride that grows 10% a week', /ride for fitness/i.test(card()) && /add 10% a week/.test(card()));

  /* calisthenics */
  setGoal('calisthenics'); G.paint(); await wait(10);
  ck('Calisthenics says what it is built on and asks which skills', /strong shoulders, chest and upper back/.test(card()) && /Which skills do you want\?/.test(card()) && /Handstand push-up/.test(card()) && /Muscle-up/.test(card()));
  doc.querySelector('[data-gp="skill"][data-v="hspu"]').click(); await wait(10);
  ck('handstand push-up starts with pike push-ups, 3 sets, and says when to move on', /Step 1 of 8/.test(card()) && /Pike push-up/.test(card()) && /3 x 8/.test(card()) && /Move on when: 3 x 12 clean/.test(card()));
  doc.querySelector('[data-gp="up"][data-v="hspu"]').click(); await wait(10);
  ck('"I can do this" moves to the next step, and it is kept', /Step 2 of 8/.test(card()) && /Feet-raised pike push-up/.test(card()) && w.KP.get('goalPlus').calis.at.hspu === 1);
  ck('no step is more than 3 sets', G.SKILL.every((k) => k.L.every((l) => !/^[4-9] x/.test(l[1]))));

  /* hiking */
  setGoal('hiking'); G.paint(); await wait(10);
  ck('Hiking asks what kind: day hikes, backpacking, mountains, rock climbing, bouldering', ['Day hikes', 'Backpacking', 'Mountains and peaks', 'Rock climbing', 'Bouldering'].every((n) => card().indexOf(n) >= 0));
  doc.querySelector('[data-gp="hike"][data-v="rock"]').click(); await wait(10);
  ck('rock climbing: finger strength (only after a year), pulling, and the opposite muscles', /Hangboard/.test(card()) && /after a year of climbing/.test(card()) && /Pull-ups 3x5/.test(card()));

  /* the quiz pop-up */
  w.go('quiz'); await wait(30);
  const opt = [...doc.querySelectorAll('#qBody .qopt')].find((o) => /^Cycling/.test(o.textContent.trim()));
  ck('the quiz offers Cycling', !!opt);
  if (opt) { opt.click(); await wait(400); }
  ck('picking Cycling in the quiz asks the follow-up right away, as a pop-up', doc.getElementById('sheet').classList.contains('on') && /Your riding/.test(doc.getElementById('sheet').textContent) && /Do you compete\?/.test(doc.getElementById('sheet').textContent));
  ck('no page errors', !errors.filter((e) => !/Not implemented/.test(e)).length);
  if (errors.length) console.log(errors.slice(0, 3));
  let fail = 0; for (const [n, ok] of R) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passing');
  process.exit(fail ? 1 : 0);
})();
