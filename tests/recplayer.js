/* p35: the muscle recovery map (src/p08_recovery.js) and the workout
   player (src/p08_player.js), all real: recovery comes from the sets you
   logged (warm-ups do not count, today's ticked sets do), fades on each
   muscle's own clock and says when it is ready; "Train what's fresh"
   builds today's workout from ready muscles with 2-3 working sets; the
   player logs every set through the workout's own logic, rests, says
   what is next, and finishes the workout the usual way. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.env.KOVA_HTML || (__dirname + '/../index.html'), 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const H = 36e5, now = Date.now();
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
const set3 = (wt, h, warm) => ({ t: now - h * H, sets: [].concat(warm ? [{ w: wt * 0.5, r: 10, role: 'warm' }] : [], [{ w: wt, r: 8, role: 'work' }, { w: wt, r: 8, role: 'work' }, { w: wt, r: 7, role: 'work' }]), top: wt, e1: wt });
['kova.auth.skipped', 'kova.auth.local'].forEach((k) => w.localStorage.setItem(k, '1'));
w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
w.localStorage.setItem('kova_mode_v1', 'live');
w.localStorage.setItem('kova_profile_v2', JSON.stringify({ tourSeen: true }));
w.localStorage.setItem('kova_hist_v1', JSON.stringify({ 'Barbell back squat': [set3(185, 20, true)], 'Leg press': [set3(270, 20)], 'Barbell bench press': [set3(155, 70)] }));
const spoken = [];
w.speechSynthesis = { cancel() {}, speak(u) { spoken.push(u.text); }, getVoices() { return []; }, addEventListener() {}, speaking: false };
w.SpeechSynthesisUtterance = function (t) { this.text = t; };
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(1600);
  const doc = w.document, RC = w.KovaRecovery, PL = w.KovaPlayer, K = w.KSESS;
  ck('both modules loaded, and the workout engine has its hook', !!RC && !!PL && !!K.api && typeof K.api.toggle === 'function');
  const M = RC.state(now);
  const ex = (h, tau) => Math.exp(-h / tau);
  const quadF = 6 * ex(20, 30);                                     /* squat 3 + leg press 3, 20 h ago, warm-up not counted */
  ck('quads: 6 hard sets 20 h ago read ' + Math.round(100 * Math.exp(-quadF / 4)) + '% (the warm-up does not count)', M.quads.pct === Math.round(100 * Math.exp(-quadF / 4)) && M.quads.st === 'rest');
  ck('chest: 3 sets three days ago is ready', M.chest.pct >= 85 && M.chest.st === 'ready');
  ck('helpers count half: adductors from the squat’s helpers', M.adductors.F > 0 && Math.abs(M.adductors.F - 3 * 0.5 * ex(20, 30)) < 1e-6);
  ck('when it is ready: the hours until 85%', M.quads.readyIn === Math.ceil(30 * Math.log(quadF / 0.65)));
  ck('never-trained muscles are fresh', M.biceps.pct === 100 && M.biceps.st === 'ready' && M.biceps.readyIn === 0);
  ck('small muscles recover faster than big ones', RC.TAU.biceps < RC.TAU.quads);
  ck('this week’s hard sets per muscle', M.quads.week === 6 && M.quads.by['Barbell back squat'] === 3);

  /* train what's fresh */
  const plan = RC.freshPlan(M);
  const restOK = plan.every((x) => RC.musclesOf(x[0]).p.every((m) => M[m].st === 'ready'));
  ck('Train what’s fresh picks only ready muscles (no squats today)', plan.length >= 4 && restOK && !plan.some((x) => /squat|leg press|deadlift|lunge/i.test(x[0])));
  ck('…compound lifts first, 2–3 working sets each plus a warm-up', /press|row|pull/i.test(plan[0][0]) && plan.every((x) => x[1] === 3 || x[1] === 4));
  const built = RC.trainFresh();
  ck('…and builds today’s workout from it', built && K.state().ex.map((e) => e.n).join() === plan.map((x) => x[0]).join() && K.state().day === 'Fresh today');

  /* the card on Workout */
  w.go('move'); await wait(200);
  let host = doc.querySelector('#s-move .kl-acts');
  if (!host) { doc.getElementById('s-move').insertAdjacentHTML('afterbegin', '<div class="kv-card" id="fakeT"></div><div class="kl-acts"><div class="chip">Check my form</div></div>'); host = doc.querySelector('#s-move .kl-acts'); }
  RC.decorate(); w.KovaZone2.decorate(); RC.decorate(); await wait(20);
  const card = doc.getElementById('krcCard'), z2 = doc.getElementById('kz2Card');
  ck('the Muscle recovery card sits under Training, before Zone 2', !!card && card.nextElementSibling === z2 && card.previousElementSibling === (host.closest('.kv-card') || host));
  ck('…your body figure coloured by recovery, without copying its ids', card.querySelectorAll('.krc-body .m.r-rest').length >= 2 && card.querySelectorAll('.krc-body .m.r-ready').length >= 6 && !card.querySelector('.krc-body [id]'));
  ck('…what is resting with its %, and the two buttons', /Quads \d+%/.test(card.textContent) && !!card.querySelector('[data-krc="fresh"]') && !!card.querySelector('[data-krc="play"]'));
  card.querySelector('.krc-body .m.r-rest').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(20);
  const sh = doc.getElementById('sheetIn').textContent;
  ck('tapping a muscle opens its page: %, when it is ready, this week, exercises, stretches', /Needs rest|Recovering/.test(sh) && /Ready (in about|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/.test(sh) && /hard sets/.test(sh) && /Exercises for it/.test(sh) && /Stretch it/.test(sh));
  card.querySelector('[data-krc="about"]').click(); await wait(10);
  ck('the (i) explains how it is worked out, and that it is an estimate', /Warm-up sets do not count/.test(doc.getElementById('sheetIn').textContent) && /estimate/.test(doc.getElementById('sheetIn').textContent));

  /* the player */
  w.localStorage.setItem('kova.pl.voice', 'true'); PL._P.voice = true;
  w.go('session'); await wait(200);
  PL.decorate(); await wait(10);
  ck('the workout has a Follow along button next to + Exercise', !!doc.querySelector('.kpl-chip') && doc.querySelector('.kpl-chip').nextElementSibling.id === 'addExBtn');
  const S = K.state();
  PL.open(); await wait(50);
  const pg = () => doc.getElementById('kpl');
  ck('Follow along opens over the app with the exercise, its moving picture and the set', !!pg() && pg().closest('.app') !== null && /Barbell bench press|Overhead press|Barbell row|Pull up|Lat pulldown/.test(pg().querySelector('.title').textContent) && !!pg().querySelector('.kpl-fig svg') && /Warm-up set|Set 1 of/.test(pg().textContent));
  ck('Up next says the working sets, the warm-up apart (plans are 2–3 working sets)', /Warm-up \+ [23] sets/.test(pg().querySelector('.kpl-up').textContent) && !/[45] sets/.test(pg().querySelector('.kpl-up').textContent));
  ck('…and the voice says the set', spoken.some((t) => /(Warm-up set|Set one of)/.test(t) && /reps/.test(t)));
  const c0 = PL.cur(), e0 = c0.e;
  PL._P.w = 100; PL._P.r = 9;
  doc.querySelector('#kpl [data-kpl="w+"]').click(); doc.querySelector('#kpl [data-kpl="r-"]').click();
  ck('- and + change the weight and reps', PL._P.w === 105 && PL._P.r === 8);
  doc.querySelector('#kpl [data-kpl="done"]').click(); await wait(30);
  ck('Done set logs exactly that set in the workout', e0.sets[c0.j].d === 1 && e0.sets[c0.j].w === 105 && e0.sets[c0.j].r === 8);
  ck('…then rests, with a ring and what is next, and says the rest', K.api.restLeft() > 0 && !!pg().querySelector('.kpl-ring') && /Next/.test(pg().textContent) && spoken.some((t) => /^Rest /.test(t)));
  K.api.startRest(9); PL._P.cue = {}; await wait(600);
  ck('ten seconds before the end it says so', spoken.some((t) => /Ten seconds/.test(t)));
  doc.querySelector('#kpl [data-kpl="skip"]').click(); await wait(600);
  ck('when the rest ends: back to the next set, "Go."', K.api.restLeft() === 0 && !!pg().querySelector('[data-kpl="done"]') && spoken.some((t) => /^Go\./.test(t)));
  const i0 = PL.cur().i;
  doc.querySelector('#kpl [data-kpl="next"]').click();
  ck('the arrows move between exercises', PL.cur().i === i0 + 1 && K.state().act === i0 + 1);
  doc.querySelector('#kpl [data-kpl="prev"]').click();
  doc.querySelector('#kpl [data-kpl="count"]').click();
  ck('Count my reps starts the count (and the button says Stop counting)', !!PL._P.count && /Stop counting/.test(pg().textContent));
  doc.querySelector('#kpl [data-kpl="count"]').click();
  ck('…and stops it', !PL._P.count);
  doc.querySelector('#kpl [data-kpl="voice"]').click();
  ck('the voice can be turned off (and stays off)', PL._P.voice === false && w.localStorage.getItem('kova.pl.voice') === 'false');
  /* every set */
  let guard = 0;
  while (!PL.cur().done && guard++ < 60) { PL.done(); K.api.skipRest(); }
  await wait(50); PL.close(); PL.open(); await wait(30);
  ck('after the last set: all done, and Finish workout', /All done/.test(pg().querySelector('.title').textContent) && !!pg().querySelector('[data-kpl="finish"]'));
  const before = K.log().length;
  doc.querySelector('#kpl [data-kpl="finish"]').click(); await wait(100);
  ck('Finish ends the workout the usual way (it is in your log, and the player closes)', K.log().length === before + 1 && !pg());
  const M2 = RC.state();
  ck('…and the recovery map now counts those sets', M2.chest.F > M.chest.F && M2.chest.st !== 'ready');
  ck('the player shows you around the first time', w.KovaTour.seen('playerpage'));

  ck('no script errors', !errors.filter((e) => !/Not implemented|navigation/i.test(e)).length);
  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  if (errors.length) console.log(errors.slice(0, 4).join('\n'));
  console.log(`${R.length - failed.length}/${R.length} recplayer`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
