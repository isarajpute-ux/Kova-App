/* p38 Dream physique (src/p08_dream.js): the picture of the body you want
   (and yours, if you add it) goes to Kova's AI once; the rest is Kova's
   own maths, the same engine as Fuel.

   Checked here, with the AI's answers scripted:
     - the request: the instructions forbid saying who it is, ask for the
       visible halves, cues, confidence and body-fat anchors; one image, or
       two with your photo; your sex, age, height and weight go with it;
     - a full-body goal: your body fat from your height, weight and age,
       the weight that look is on your frame, fat to lose and muscle to
       build, the phase, calories and macros identical to KovaMaint.plan,
       a time estimate; the muscles to build listed (lit on a photo when
       there is one, in Kova's orange with glass labels; no body diagram);
       your change at 3 months, 6 months and a year (the owner's chart
       reference) from the same maths and pace; the plan as Train / Eat /
       Steps;
     - an upper-body-only or lower-body-only picture compares only that
       half and says so; a rough read says so;
     - your photo sets your body fat and your muscle starting point;
     - a man's body as a woman's goal is worked out for a woman (+9 points);
       a stage-lean goal is aimed at a level you can hold; under 18 no cut;
     - missing numbers ask for them; a picture with no body says why;
     - Use this plan switches Fuel; Add to my plan puts the focus muscles'
       exercises in your split; it is saved and the Workout card shows it;
     - a dropped connection retries once; signed out it says to sign in. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, n = 120) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) {} await wait(50); } return false; };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const MAINT = (o) => JSON.stringify(Object.assign({ v: 1, unit: 'lb', sex: 'm', age: 28, hcm: 178, kg: 84, bf: null, goal: 'maint', rate: 0, steps: 7000, sleepH: 7.5, train: { days: 4, mins: 60, type: 'wmod', cardioMin: 0, cardioLvl: 'easy' }, macros: null, applied: false }, o || {}));
function boot({ maint = MAINT(), model = true } = {}) {
  const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
  const w = dom.window, calls = [], replies = [];
  ['kova.auth.skipped', 'kova.auth.local'].forEach((k) => w.localStorage.setItem(k, '1'));
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.localStorage.setItem('kova_mode_v1', 'live');
  const prof = { tourSeen: true, tours: { dreampage: 1 } };
  if (model) prof.model = { p: 'anthropic', key: 'sk-test-dream', model: 'test' };
  if (maint) prof.maint = JSON.parse(maint);
  w.localStorage.setItem('kova_profile_v2', JSON.stringify(prof));
  w.fetch = (u, o = {}) => {
    if (/anthropic\.com|\/ai\/ask/.test(String(u))) {
      const b = JSON.parse(o.body); calls.push(b);
      const nx = replies.length ? replies.shift() : { text: '{}' };
      if (nx.status) return Promise.resolve({ ok: false, status: nx.status, text: () => Promise.resolve('busy'), json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ content: [{ type: 'text', text: typeof nx.text === 'string' ? nx.text : JSON.stringify(nx.text) }] }) });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  };
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  return { w, doc: w.document, calls, replies, errors };
}
const T = (o) => Object.assign({ ok: true, target: { sex: 'male', visible: { upper: true, lower: true }, cues: ['clear six-pack', 'visible obliques', 'round shoulders'], bodyfat: [10, 13], confidence: 'high', build: 'athletic', muscle: 'a lot', standout: ['delts', 'abs', 'lats'], looks: 'A lean, athletic build with broad shoulders and a narrow waist.', caveat: 'Good light and a slight pump.' }, you: null, focus: [{ m: 'delts', why: 'Wider, rounder shoulders make the waist look narrow' }, { m: 'lats', why: 'A wider back gives the V shape' }, { m: 'quads', why: 'Fuller thighs balance the upper body' }] }, o || {});

(async () => {
  const A = boot();
  await wait(1500);
  const { w, doc } = A, D = w.KovaDream;
  w.KovaModel.fit = (d) => Promise.resolve(d);
  ck('the module loaded and knows you from Fuel (man, 28, 178 cm, 84 kg)', !!D && D.you().kg === 84 && D.you().hcm === 178 && D.you().sex === 'm' && D.you().bf > 10);
  /* the card on Workout */
  w.go('move'); await wait(250); D.decorate(); await wait(20);
  const card = doc.getElementById('kdpCard');
  ck('the Dream physique card is on Workout, right under Training', !!card && /DREAM PHYSIQUE/.test(card.textContent) && /Find my dream physique/.test(card.textContent));
  card.querySelector('[data-kdp="open"]').click(); await wait(50);
  const pg = () => doc.getElementById('kdp');
  ck('it opens a page inside the app, Compare waiting for a picture', !!pg() && pg().closest('.app') !== null && pg().querySelector('[data-kdp="compare"]').disabled);
  ck('…your numbers are shown, to change if they are wrong', /You: man, 28/.test(pg().textContent) && /lb/.test(pg().textContent));
  /* full body */
  D._S.want = PNG; A.replies.push({ text: T() });
  D.compare(); await until(() => /YOUR CHANGE/.test(pg().textContent));
  const req = A.calls[0], txt = req.messages[0].content.find((c) => c.type === 'text').text;
  ck('the request: never say who it is, the visible halves, cues, confidence and body-fat anchors', /Never say or guess who the person is/.test(req.system) && /"visible"/.test(req.system) && /"cues"/.test(req.system) && /confidence/.test(req.system) && /clear six-pack and visible obliques 10-12/.test(req.system));
  ck('…one picture, with your sex, age, height and weight', req.messages[0].content.filter((c) => c.type === 'image').length === 1 && /man, 28 years, 178 cm, 84 kg/.test(txt) && req.temperature === 0);
  const o = D._S.out, Y = D.you();
  const lean = 84 * (1 - Y.bf / 100), mus = 2 * 3.5, goalKg = (lean + mus) / (1 - 11.5 / 100);
  ck('the maths: your body fat now, the goal (11.5%), the weight that look is on your frame', o.bf === Math.round(Y.bf) && o.tbf === 12 && Math.abs(o.goalKg - goalKg) < 0.01);
  ck('…fat to lose and muscle to build (a man, untrained to "a lot": about 7 kg)', Math.abs(o.fat - Math.round((84 * Y.bf / 100 - goalKg * 0.115) * 10) / 10) < 0.11 && o.musMid === 7 && o.muscle[0] === 4.9 && o.muscle[1] === 9.1);
  const M = w.KovaMaint, q = JSON.parse(JSON.stringify(o.q)), P = M.plan(q);
  ck('…the phase and calories and macros are exactly what Fuel’s engine gives', /^(cut|lean)$/.test(o.phase) && o.kcal === P.kcal && o.p === P.p && o.c === P.c && o.f === P.f && o.maint === P.maint);
  ck('…and a time estimate', o.weeks > 4 && o.weeks < 200);
  ck('without your photo: the muscles to build are listed with why, and a button adds your photo (nothing drawn without marks)', !pg().querySelector('.kdp-pf') && /WHAT TO BUILD/.test(pg().textContent) && pg().querySelectorAll('.kdp-mus li').length === 3 && !!pg().querySelector('.kdp-photos [data-kdp="me"]'));
  ck('no body diagram any more (the owner found it goofy) and no yellow labels', !doc.getElementById('kdpNow') && !pg().querySelector('.kdp-fig') && !/FFE14D|uppercase/i.test(fs.readFileSync(__dirname + '/../src/p08_dream.css', 'utf8').split('/* 1.')[1].split('/* 2.')[0]));
  ck('…what that body looks like, what Kova saw, how sure it is', /broad shoulders/.test(pg().textContent) && /Kova saw: clear six-pack/.test(pg().textContent) && /A clear read/.test(pg().textContent));
  /* your change over time (the owner's chart reference) */
  const tl = pg().querySelector('.kdp-tl'), at = (wk) => D.at(o, wk), big = () => pg().querySelector('.kdp-fn').textContent;
  ck('your change: 3 months, 6 months and 1 year, 7 points in time, the dream as the orange tick at the top of each', !!tl && tl.querySelectorAll('.kdp-pills button').length === 3 && tl.querySelectorAll('.kdp-col').length === 7 && tl.querySelectorAll('.kdp-col .kdp-tg').length === 7);
  const cut = o.fat / o.lossWk;
  ck('…Kova’s maths at the plan’s pace: nothing at the start, the fat first, then the muscle, all of it by the time estimate, at the goal weight', at(0).pct === 0 && Math.abs(at(cut).lost - o.fat) < 0.01 && at(cut).built === 0 && at(cut + 5).built > 0 && at(o.weeks + 1).pct === 100 && Math.abs(at(o.weeks + 1).kg - o.goalKg) < 0.6);
  const wk0 = { 3: 13, 6: 26, 12: 52 }[o.weeks <= 13 ? 3 : o.weeks <= 26 ? 6 : 12];
  ck('…the floating card: how far along you are at the end of the span (the big number) and the weight change', new RegExp('^' + at(wk0).pct + '%').test(big()) && /lb/.test(big()));
  pg().querySelector('.kdp-pills [data-s="3"]').click(); await wait(20);
  pg().querySelectorAll('.kdp-col')[3].click(); await wait(20);
  ck('…a pill changes the span and a tap on a point in time moves the card there', new RegExp('^' + at(13 * 3 / 6).pct + '%').test(big()) && /at 6 weeks/.test(pg().querySelector('.kdp-fl').textContent) && pg().querySelectorAll('.kdp-col')[3].classList.contains('on'));
  ck('…what to change in all, what to train more (with the exercise)', /fat to lose/.test(pg().textContent) && /muscle to build/.test(pg().textContent) && /Shoulders/.test(pg().textContent) && /Lateral raise/.test(pg().querySelector('.kdp-tab').textContent));
  pg().querySelector('[data-kdp="tab"][data-t="eat"]').click(); await wait(20);
  ck('…Eat: your calories and macros, the same as Fuel', new RegExp(o.kcal + '').test(pg().querySelector('.kdp-tab').textContent) && new RegExp(o.p + ' g').test(pg().querySelector('.kdp-tab').textContent));
  pg().querySelector('[data-kdp="tab"][data-t="do"]').click(); await wait(20);
  ck('…Steps: Kova’s own, from your numbers, before you ask anything', new RegExp('Eat about ' + o.kcal + ' calories').test(pg().querySelector('.kdp-tab').textContent) && /Train shoulders, lats, quads twice a week/.test(pg().querySelector('.kdp-tab').textContent));
  ck('…and honest: without your photo it assumed an untrained build; a photo read is an estimate', /assumed an untrained build/.test(pg().textContent) && /within about 3 points/.test(pg().textContent));
  /* upper body only */
  A.replies.push({ text: T({ target: Object.assign(T().target, { visible: { upper: true, lower: false } }) }) });
  D.compare(); await until(() => A.calls.length === 2 && !D._S.busy); await wait(30);
  ck('an upper-body-only picture compares only the upper body (quads dropped) and says so', !D._S.out.focus.some((f) => f.m === 'quads') && D._S.out.focus.length === 2 && /Only the upper body is in the picture/.test(pg().textContent) && /Upper body only/.test(pg().textContent));
  /* lower body only */
  A.replies.push({ text: T({ target: Object.assign(T().target, { visible: { upper: false, lower: true }, confidence: 'low', standout: ['glutes', 'delts'] }), focus: [{ m: 'glutes', why: 'Rounder glutes' }, { m: 'delts', why: 'x' }, { m: 'hams', why: 'Fuller hamstrings' }] }) });
  D.compare(); await until(() => A.calls.length === 3 && !D._S.busy); await wait(30);
  ck('a lower-body-only picture compares glutes and legs only, says so, and calls it a rough read', D._S.out.focus.map((f) => f.m).join() === 'glutes,hams' && D._S.out.standout.join() === 'glutes' && /Only the lower body/.test(pg().textContent) && /A rough read/.test(pg().textContent));
  /* with your photo */
  D._S.me = PNG;
  A.replies.push({ text: T({ you: { visible: { upper: true, lower: true }, cues: ['soft waist'], bodyfat: [24, 27], confidence: 'medium', build: 'average', muscle: 'some' },
    marks: [{ img: 2, m: 'delts', x: 0.32, y: 0.24, len: 0.1, wid: 0.07, a: -20 }, { img: 2, m: 'delts', x: 0.68, y: 0.24, len: 0.1, wid: 0.07, a: 20 }, { img: 2, m: 'lats', x: 0.4, y: 0.4, w: 0.12, h: 0.15 },
      { img: 2, m: 'abs', x: 0.5, y: 0.45, w: 0.1, h: 0.1 }, { img: 2, m: 'quads', x: 2, y: 0.7, w: 0.1, h: 0.1 }, { img: 1, m: 'delts', x: 0.3, y: 0.22, w: 0.1, h: 0.08 }] }) });
  D.compare(); await until(() => A.calls.length === 4 && !D._S.busy); await wait(30);
  const o2 = D._S.out;
  const yp = pg().querySelector('.kdp-you-p');
  ck('with your photo, the muscles to build are lit on YOUR body, with a switch to see them on the goal', !!yp && yp.querySelectorAll('.kdp-mk').length === 3 && /Shoulders/.test(yp.textContent) && /Lats/.test(yp.textContent) && /WHAT TO BUILD, ON YOU/.test(pg().textContent) && !!pg().querySelector('.kdp-photos [data-kdp="flip"]'));
  const el0 = yp.querySelector('.kdp-mk[data-m="delts"]');
  ck('…in Kova’s look: an orange glow shaped and angled along the muscle, a dot, a line and a small glass label (no yellow capitals)', el0 && /rotate\(-20 /.test(el0.getAttribute('transform')) && /url\(#kdpg\d+\)/.test(el0.getAttribute('fill')) && yp.querySelectorAll('.kdp-ln').length === 2 && yp.querySelectorAll('.kdp-dot').length === 2 && yp.querySelectorAll('.kdp-ml').length === 2 && !!yp.querySelector('.kdp-ml-L') && !/[A-Z]{3}/.test(yp.querySelector('.kdp-ml').textContent));
  ck('…an older mark shape (w, h) still works', !!yp.querySelector('.kdp-mk[data-m="lats"]'));
  ck('…a mark off the photo or for a muscle that is not a focus is dropped', !yp.querySelector('[data-m="abs"]') && !yp.querySelector('[data-m="quads"]'));
  pg().querySelector('.kdp-photos [data-kdp="flip"]').click(); await wait(20);
  const onGoal = pg().querySelectorAll('.kdp-goal-p .kdp-mk').length === 1 && !pg().querySelector('.kdp-you-p');
  pg().querySelector('.kdp-photos [data-kdp="flip"]').click(); await wait(20);
  ck('…the switch shows them on the goal photo, and back', onGoal && !!pg().querySelector('.kdp-you-p'));
  ck('…and it says your photo is not saved', /Your photo stays on this phone for now and is not saved/.test(pg().textContent) && !JSON.stringify(w.KP.get('dream') || {}).includes('iVBORw0KGgo'));
  ck('the request asks where each focus muscle is on each photo', /"marks"/.test(A.calls[3].system) && /one mark per muscle per side/.test(A.calls[3].system) && /under clothes too/.test(A.calls[3].system));
  ck('with your photo: two pictures go, and your body fat and muscle come from it (25.5%, one level up to go)', A.calls[3].messages[0].content.filter((c) => c.type === 'image').length === 2 && o2.bf === 26 && o2.bfFrom === 'your photo' && o2.musMid === 3.5 && /In your photo: soft waist/.test(pg().textContent));
  /* clothes */
  A.replies.push({ text: T({ target: Object.assign(T().target, { clothed: true, confidence: 'medium' }), you: { visible: { upper: true, lower: true }, clothed: true, cues: ['loose hoodie'], bodyfat: [20, 23], confidence: 'low', build: 'average', muscle: 'none' } }) });
  D.compare(); await until(() => A.calls.length === 5 && !D._S.busy); await wait(30);
  ck('a body under clothes is still read, and it says it was read through clothing (and a rough read)', /read the goal body through clothing/.test(pg().textContent) && /read your body through clothing/.test(pg().textContent) && /A rough read/.test(pg().textContent) && D._S.out.bf === 22);
  /* Ask Kova: the question goes with the compare, and comes back as a plan */
  const ANS = { answer: 'Train your glutes three times a week with heavy hip thrusts and split squats, and eat enough protein.', steps: ['Hip thrust first on glute days', 'Add weight each week'],
    split: [{ day: 'Day 1', focus: 'Glutes and hamstrings', ex: [{ n: 'Hip thrust', sets: 5, reps: '8-12', note: 'pause at the top' }, { n: 'Romanian deadlift', sets: 3, reps: '8-10', note: '' }] },
      { day: 'Day 2', focus: 'Upper body', ex: [{ n: 'Lat pulldown', sets: 3, reps: '10-12', note: '' }] }],
    meals: [{ meal: 'Breakfast', food: 'Greek yogurt 250 g, oats 60 g, berries', kcal: 800, p: 60, c: 90, f: 18 }, { meal: 'Lunch', food: 'Chicken 200 g, rice 150 g', kcal: 900, p: 70, c: 100, f: 20 }, { meal: 'Dinner', food: 'Salmon 180 g, potatoes', kcal: 700, p: 55, c: 60, f: 28 }], tips: ['Sleep 8 hours'] };
  D._S.q = 'How do I make my glutes bigger like this?';
  A.replies.push({ text: T() }, { text: ANS });
  D.compare(); await until(() => /Train your glutes three times/.test(pg().textContent), 200);
  const cq = A.calls[A.calls.length - 1], ctxt = typeof cq.messages[0].content === 'string' ? cq.messages[0].content : '';
  ck('Ask Kova: the question goes to Kova with your numbers, the focus muscles and your training days', /You are Kova/.test(cq.system) && /How do I make my glutes bigger/.test(ctxt) && new RegExp(D._S.out.kcal + ' calories').test(ctxt) && /Trains 4 days a week/.test(ctxt) && /delts/.test(ctxt));
  ck('…the rules: 2 or 3 working sets, meals that add up within 5%, never who anyone is', /2 or 3 working sets/.test(cq.system) && /within 5%/.test(cq.system) && /Never say who anyone in a photo is/.test(cq.system));
  const tab = (t) => { pg().querySelector('[data-kdp="tab"][data-t="' + t + '"]').click(); return pg().querySelector('.kdp-tab').textContent; };
  const tTrain = tab('train'), tEat = tab('eat'), tDo = tab('do');
  ck('…the answer on top; Train: the split by day; Eat: a day of meals; Steps: what to do', /Train your glutes three times a week/.test(pg().querySelector('.kdp-aa').textContent) && /Your split, 2 days/.test(tTrain) && /Glutes and hamstrings/.test(tTrain) && /Greek yogurt/.test(tEat) && /Hip thrust first/.test(tDo) && /Sleep 8 hours/.test(tDo));
  tab('train'); pg().querySelector('[data-kdp="day"][data-i="0"]').click(); await wait(20);
  ck('…a day opens in a pop-up with its exercises; 5 sets is brought back to 3 (plans are 2-3 working sets)', D._S.ans.split[0].ex[0].sets === 3 && /Hip thrust/.test(doc.getElementById('sheetIn').textContent) && /3 \u00d7 8-12/.test(doc.getElementById('sheetIn').textContent) && /pause at the top/.test(doc.getElementById('sheetIn').textContent));
  w.closeSheet();
  ck('…the meals are added up by Kova and checked against your target', D._S.ans.tot.kcal === 2400 && D._S.ans.tot.p === 185 && /Adds up to 2400 calories and 185 g protein/.test(tEat) && (Math.abs(2400 - D._S.out.kcal) <= D._S.out.kcal * 0.08 ? /on your target/ : /adjust the portions/).test(tEat));
  w.KP.set('plan', { days: [{ n: 'Lower A', ex: [] }, { n: 'Upper A', ex: [] }] });
  pg().querySelector('[data-kdp="addsplit"]').click(); await wait(30);
  ck('…Add these exercises puts them in your plan', w.KP.get('plan').days.flatMap((d) => (d.ex || []).map((e) => e.e || e.n)).includes('Hip thrust'));
  pg().querySelector('#kdpAsk').value = 'And what about my arms?'; A.replies.push({ text: Object.assign({}, ANS, { answer: 'For arms, curls and pushdowns twice a week.' }) });
  pg().querySelector('[data-kdp="ask"]').click(); await until(() => /For arms, curls/.test(pg().textContent), 160);
  ck('…and you can ask a follow-up in the box', /For arms, curls/.test(pg().textContent) && /And what about my arms/.test(pg().textContent));
  await until(() => w.KP.get('dream') && w.KP.get('dream').ans, 80);
  ck('…the answer is kept with your dream physique', /For arms/.test((w.KP.get('dream').ans || {}).answer || ''));
  D._S.q = '';
  /* use this plan / add to my plan */
  tab('eat'); pg().querySelector('[data-kdp="useplan"]').click(); await wait(30);
  const mp = M.prof();
  ck('Use this plan switches Fuel to it (the phase, the goal weight, applied)', mp && mp.applied === true && mp.goal === D._S.out.phase && M.plan(mp).kcal === D._S.out.kcal);
  w.KP.set('plan', { days: [{ n: 'Upper A', ex: [] }, { n: 'Lower A', ex: [] }, { n: 'Upper B', ex: [] }] });
  tab('train'); pg().querySelector('[data-kdp="addplan"]').click(); await wait(30);
  const days = w.KP.get('plan').days, all = days.flatMap((d) => (d.ex || []).map((e) => e.e || e.n));
  ck('Add to my plan puts an exercise for each focus muscle in your split', ['Lateral raise', 'Lat pulldown', 'Leg press'].every((n) => all.includes(n)));
  /* saved, and the card shows it */
  await until(() => w.KP.get('dream'), 80);
  D.close(); await wait(20); D.decorate(); await wait(20);
  ck('it is saved, and the Workout card shows you now and your goal and what to do', !!w.KP.get('dream') && /you now/.test(doc.getElementById('kdpCard').textContent) && /your goal/.test(doc.getElementById('kdpCard').textContent) && /Open my dream physique/.test(doc.getElementById('kdpCard').textContent));
  /* pure maths cases */
  const base = { target: { sex: 'male', bodyfat: [10, 12], muscle: 'some', visible: { upper: true, lower: true } }, focus: [] };
  const F = { p: { kg: 64, hcm: 165, age: 30, sex: 'f', train: { days: 3, mins: 60, type: 'wmod' } }, sex: 'f', kg: 64, hcm: 165, age: 30, bf: 30, how: 'x', unit: 'lb' };
  ck('a man’s body as a woman’s goal is worked out for a woman (11 + 9 = 20%)', D.plan(base, F).tbf === 20 && /worked out the same look on a woman/.test(D.plan(base, F).note.join(' ')));
  ck('a stage-lean goal (5-7%) is aimed at 8% for a man, and it says why', D.plan({ target: { sex: 'male', bodyfat: [5, 7], muscle: 'some' }, focus: [] }, Object.assign({}, F, { sex: 'm', bf: 18, p: Object.assign({}, F.p, { sex: 'm' }) })).tbf === 8);
  ck('under 18: no calorie deficit (recomp), and it says so', (() => { const r = D.plan(base, Object.assign({}, F, { sex: 'm', age: 16, bf: 22, p: Object.assign({}, F.p, { sex: 'm', age: 16 }) })); return r.phase === 'maint' && /Under 18/.test(r.note.join(' ')); })());
  ck('no height or weight: it asks for them instead of guessing', D.plan(base, { p: {}, sex: 'm', kg: null, hcm: null, age: null, bf: null, unit: 'lb' }).need === 'numbers');
  ck('a body-fat answer that is not a real range is refused (no made-up numbers)', D.plan({ target: { bodyfat: [0, 900] }, focus: [] }, F) === null);
  /* no body, retry, signed out */
  A.replies.push({ text: { ok: false, why_not: 'This is a picture of a car, not a body.' } });
  D.open(); D._S.want = PNG; D.compare(); await until(() => /picture of a car/.test(pg().textContent));
  ck('a picture with no body says why, nothing invented', /picture of a car/.test(pg().textContent));
  const n0 = A.calls.length;
  A.replies.push({ status: 503 }, { text: T() });
  D.compare(); await until(() => A.calls.length === n0 + 2 && !D._S.busy, 160); await wait(30);
  ck('a dropped connection is retried once by itself', A.calls.length === n0 + 2 && /YOUR CHANGE/.test(pg().textContent));
  const B = boot({ model: false }); await wait(1500);
  B.w.KovaDream.open(); B.w.KovaDream._S.want = PNG; B.w.KovaDream.compare(); await wait(100);
  ck('signed out: it says to sign in, with the button', /Sign in and Kova’s AI reads the picture/.test(B.doc.getElementById('kdp').textContent) && !!B.doc.querySelector('#kdp [data-kdp="signin"]'));
  ck('no script errors', !A.errors.filter((e) => !/Not implemented|navigation/i.test(e)).length || (console.log(A.errors.slice(0, 3)), false));
  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  console.log(`${R.length - failed.length}/${R.length} dream`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
