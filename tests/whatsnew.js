/* p34: every update comes with a tour of what is new (src/p08_whatsnew.js),
   and the Zone 2 page has its own tour (src/p08_zone2.js): someone who
   already uses Kova gets the "New in Kova" card once (Later brings it back
   once more), someone new is not interrupted, Show me walks to each new
   thing on its own screen, search plays it any time; the Zone 2 page tour
   plays the first time the page opens, sits above it, and the ? replays it. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const LOCAL = { 'kova.auth.skipped': '1', 'kova.auth.local': '1', 'kova.onboarded': JSON.stringify({ at: 1 }), 'kova_profile_v2': JSON.stringify({ tourSeen: true }) };
function boot(store) {
  store = Object.assign({}, LOCAL, store || {});
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
  const w = dom.window;
  Object.keys(store || {}).forEach((k) => w.localStorage.setItem(k, store[k]));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  return w;
}

(async () => {
  /* someone new: no card, the release counts as seen */
  const a = boot({ kova_mode_v1: 'live' });
  await wait(1500);
  ck('the What’s new module loaded, with a release first in the list', !!a.KovaWhatsNew && /^new-/.test(a.KovaWhatsNew.REL[0].id) && a.KovaWhatsNew.REL[0].steps.length >= 1);
  a.KovaWhatsNew.check();
  ck('someone new is not interrupted (their first-run tours show everything)', !a.document.getElementById('kwn') && a.KovaTour.seen(a.KovaWhatsNew.REL[0].id));

  /* someone who has used Kova before */
  const w = boot({ kova_mode_v1: 'live', 'kova.tours.v1': JSON.stringify({ home: 1, move: 1, workteam: 1 }) });
  await wait(1600);
  const doc = w.document, N = w.KovaWhatsNew, rel = N.REL[0], r25 = N.REL.filter((r) => r.id === 'new-2026-10-25')[0], r24 = N.REL.filter((r) => r.id === 'new-2026-10-24')[0], r21 = N.REL.filter((r) => r.id === 'new-2026-10-21')[0], r22 = N.REL.filter((r) => r.id === 'new-2026-10-22')[0], r23 = N.REL.filter((r) => r.id === 'new-2026-10-23')[0];
  ck('someone who has been here before counts as returning', N.returning());
  N.check(); await wait(20);
  const card = doc.getElementById('kwn');
  ck('they get the "New in Kova" card, Kova’s glass card, with what is new', !!card && card.classList.contains('card') && /NEW IN KOVA/.test(card.textContent) && card.querySelectorAll('li').length === rel.lines.length);
  ck('…inside the app, so the three looks apply', card.parentNode === (doc.getElementById('app') || doc.body));
  doc.querySelector('#kwn [data-kwn="later"]').click();
  ck('Later puts it away for now', !doc.getElementById('kwn') && !w.KovaTour.seen(rel.id));
  N.check(); await wait(10);
  ck('…it comes back on the next open', !!doc.getElementById('kwn'));
  doc.querySelector('#kwn .kwn-b [data-kwn="later"]').click();
  ck('…and after a second Later it does not come back', w.KovaTour.seen(rel.id) && (N.check(), !doc.getElementById('kwn')));

  /* the steps point at the real new things */
  w.go('move'); await wait(200);
  if (w.KovaExPage) w.KovaExPage.decorate();
  if (w.KovaZone2) w.KovaZone2.decorate();
  await wait(100);
  const S = r21.steps;
  const moveSteps = S.filter((t) => t[0] === 'move');
  ck('on Workout the steps find Exercises, Stretch and the Zone 2 card', moveSteps.length === 3 && moveSteps.every((t) => !!t[3]()) && /Exercises/.test(moveSteps[0][3]().textContent) && moveSteps[2][3]().id === 'kz2Card');
  /* p37, the newest release: attachments, plain words, easier how-to */
  if (w.KovaExPage) w.KovaExPage.decorate(); await wait(20);
  const r26 = N.REL.filter((r) => r.id === 'new-2026-10-26')[0];
  ck('the p42 release, the bigger library and every attachment, points at Exercises on Workout', r26.steps.length === 2 && r26.steps[0][0] === 'move' && r26.steps[1][0] === 'session' && r26.steps[0][3]() && r26.steps[0][3]().getAttribute('data-kxp') === 'lib');
  if (w.KovaDream) w.KovaDream.decorate(); await wait(20);
  const r27 = N.REL.filter((r) => r.id === 'new-2026-10-27')[0];
  const r28 = N.REL.filter((r) => r.id === 'new-2026-10-28')[0];
  const r29 = N.REL.filter((r) => r.id === 'new-2026-10-29')[0];
  const r30 = N.REL.filter((r) => r.id === 'new-2026-10-30')[0];
  const r32 = N.REL.filter((r) => r.id === 'new-2026-11-02')[0];
  ck('the newest release: a plain profile, its step on the edit button', rel.id === 'new-2026-11-10' && rel.steps.length === 1 && rel.steps[0][0] === 'profile' && rel.lines.every((l) => l.split(' ').length <= 10));
  const r32b = N.REL.filter((r) => r.id === 'new-2026-11-02')[0];
  ck('the p44 release: Back one page at a time, brown Workout, Customize, when to stretch; both steps in the workout', r32b.id === 'new-2026-11-02' && r32b.steps.length === 2 && r32b.steps.every((t) => t[0] === 'session') && r32b.lines.every((l) => l.split(' ').length <= 10));
  const r31 = N.REL.filter((r) => r.id === 'new-2026-11-01')[0]; void r32;
  ck('the p43f release: tasks stay saved (Work OS tasks first), then the plain tabs on Exercises and Stretch', r31.id === 'new-2026-11-01' && r31.steps.length === 2 && r31.steps[0][0] === 'worktasks' && r31.steps[1][0] === 'move' && r31.steps[1][3]() && r31.steps[1][3]().getAttribute('data-kxp') === 'str' && r31.lines.every((l) => l.split(' ').length <= 10));
  ck('the p43d release, the dial redone: Stretch on Workout, then attachments in the workout', r30.steps.length === 2 && r30.steps[0][3]() && r30.steps[0][3]().getAttribute('data-kxp') === 'str' && r30.steps[1][0] === 'session' && r30.lines.every((l) => l.split(' ').length <= 10));
  ck('the p43c release: Dream physique fixed, the glass dial, the workout buttons, each step finding its place', r29.steps.length === 3 && r29.steps[0][3]() && r29.steps[0][3]().id === 'kdpCard' && r29.steps[1][3]() && r29.steps[1][3]().getAttribute('data-kxp') === 'lib' && r29.steps[2][0] === 'session' && r29.lines.every((l) => l.split(' ').length <= 10));
  ck('the p43b release, the dial: Exercises, Stretch and attachments, each step finding its button', r28.id === 'new-2026-10-28' && r28.steps.length === 3 && r28.steps[0][3]() && r28.steps[0][3]().getAttribute('data-kxp') === 'lib' && r28.steps[1][3]() && r28.steps[1][3]().getAttribute('data-kxp') === 'str' && r28.steps[2][0] === 'session' && r28.lines.every((l) => l.split(' ').length <= 10));
  ck('the p43 release: Dream physique, pages instead of pop-ups, a calmer voice, each step finding its place', r27.id === 'new-2026-10-27' && r27.steps.length === 3 && r27.steps[0][3]() && r27.steps[0][3]().id === 'kdpCard' && r27.steps[1][3]() && r27.steps[1][3]().getAttribute('data-kxp') === 'lib' && r27.steps[2][0] === 'session' && r27.lines.every((l) => l.split(' ').length <= 10));
  ck('the p40/p41 release points at Kova in the sidebar and Workout\u2019s ?', r25.steps.length === 3 && r25.steps[0][3]() && r25.steps[0][3]().id === 'kgOrb' && r25.steps[1][3]() && r25.steps[1][3]().getAttribute('data-ktour') === 'move');
  ck('the p38 release, Dream physique, points at its card on Workout', !!r24 && r24.steps.length === 1 && r24.steps[0][0] === 'move');
  if (w.KovaDream) w.KovaDream.decorate(); await wait(20);
  ck('…it finds the Dream physique card', r24.steps[0][3]() && r24.steps[0][3]().id === 'kdpCard');
  ck('the p37 release has a step for attachments, the muscles list and the how-to', r23.steps.map((t) => t[0]).join() === 'session,customize,move');
  w.go('customize'); await wait(150);
  ck('…it finds the muscles list', r23.steps[1][3]() && r23.steps[1][3]().id === 'volList');
  w.go('move'); await wait(150);
  /* the release before: muscle recovery and Coach me */
  if (w.KovaRecovery) w.KovaRecovery.decorate();
  await wait(50);
  const nm = r22.steps.filter((t) => t[0] === 'move');
  ck('the p35/p36 release finds, on Workout, the recovery card, Train what’s fresh, the Stretch card and Exercises', r22.id === 'new-2026-10-22' && nm.length === 4 && nm[0][3]().id === 'krcCard'
    && nm[1][3]().getAttribute('data-krc') === 'fresh' && nm[2][3]().id === 'krsCard' && /Exercises/.test(nm[3][3]().textContent));
  const mc = r22.steps.filter((t) => t[0] === 'machine')[0], st = r22.steps.filter((t) => t[0] === 'settings')[0];
  w.go('machine'); await wait(150);
  ck('…the new ways in on Scan a machine (photo or video, a link)', !!mc && !!mc[3]() && /Paste a link/.test(mc[3]().textContent));
  w.go('settings'); await wait(200);
  ck('…and the phone alerts note in Settings', !!st && !!st[3]());
  w.go('session'); await wait(200);
  if (w.KovaPlayer) w.KovaPlayer.decorate();
  const fa = r22.steps.filter((t) => t[0] === 'session')[0];
  ck('…and the Coach me button in the workout', !!fa && !!fa[3]() && /Coach me/.test(fa[3]().textContent));
  ck('the p40/p41 release finds the Coach me button too', !!r25.steps[2][3]() && /Coach me/.test(r25.steps[2][3]().textContent));
  const r1103 = N.REL.filter((r) => r.id === 'new-2026-11-03')[0];
  ck('the task-reminder release finds New task in Work OS', !!r1103.steps[0][3]() && r1103.steps[0][3]().id === 'wtNewTask');
  w.KovaCycle._set({ on: true, flow: { [new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)]: 'med' } }); w.go('cycle'); await wait(80);
  const r1104 = N.REL.filter((r) => r.id === 'new-2026-11-04')[0];
  ck('the calendar release finds the calendar on the cycle screen', r1104.steps[0][0] === 'cycle' && !!r1104.steps[0][3]() && r1104.steps[0][3]().classList.contains('kcx-cal'));
  const r1105 = N.REL.filter((r) => r.id === 'new-2026-11-05')[0];
  ck('the cycle-page release finds the phase card on the cycle screen', !!r1105.steps[0][3]() && r1105.steps[0][3]().classList.contains('kcx-prof') && !!r1105.steps[0][3]().closest('#s-cycle'));
  w.go('sleep'); await wait(30);
  const r1106 = N.REL.filter((r) => r.id === 'new-2026-11-06')[0];
  ck('the Sleep release finds the Cycle link on Sleep', !!r1106.steps[0][3]() && r1106.steps[0][3]().classList.contains('kc-slp'));
  w.go('fuel'); await wait(30);
  const r1107 = N.REL.filter((r) => r.id === 'new-2026-11-07')[0];
  ck('the Plates release finds the cycle tip on Fuel', r1107.steps.length === 2 && !!r1107.steps[1][3]() && r1107.steps[1][3]().classList.contains('kc-fuel'));
  if (w.KovaLift) { w.KovaLift.plates(225, 'lb'); await wait(20); }
  ck('…and the plate calculator on its own screen', !!r1107.steps[0][3]() && !!r1107.steps[0][3]().closest('#s-platecalc'));
  w.go('sessdone'); await wait(60);
  const r1108 = N.REL.filter((r) => r.id === 'new-2026-11-08')[0];
  ck('the patterns release finds Patterns Kova found on the summary', !!r1108.steps[0][3]() && r1108.steps[0][3]().classList.contains('kpt'));
  w.go('profile'); await wait(30);
  ck('the newest release finds the profile\'s edit button', !!rel.steps[0][3]() && rel.steps[0][3]().id === 'pfEditBtn');
  ck('the p37 attachment step finds the attachment button, or + Exercise in an empty workout', !!r23.steps[0][3]() && /katt-chip|addExBtn/.test(r23.steps[0][3]().className + ' ' + r23.steps[0][3]().id));
  w.go('workteam'); await wait(300);
  if (w.KovaCrew) { w.KovaCrew._S.view = 'team'; w.KovaCrew._S.nav = 'team'; w.KovaCrew.paint(); }
  const chat = S.filter((t) => t[0] === 'workteam')[0];
  ck('in the AI team it finds the Chat pill', !!chat && !!chat[3]() && /Chat/.test(chat[3]().textContent));
  w.go('move'); await wait(100);
  ck('Show me starts Kova’s own tour with a step for each new thing', N.start() && w.KovaTour.active() && N.steps(rel).length === rel.steps.length);
  ck('…and it counts as seen', w.KovaTour.seen(rel.id));
  w.KovaTour.end();
  const rows = w.KovaCmd.build('what’s new');
  ck('search plays it any time ("what’s new")', rows.some((r) => /What.s new in Kova/.test(r.t)) && w.KovaCmd.build('updates').some((r) => /What.s new/.test(r.t)));

  /* the Zone 2 page has its own tour */
  w.KovaZone2.open(); await wait(900);
  ck('the first time the Zone 2 page opens, its tour plays', w.KovaTour.active() && w.KovaTour.seen('zone2page'));
  ck('…above the page', doc.getElementById('ksTour') && doc.getElementById('ksTour').style.zIndex === '9700');
  ck('…with a stop for each part of the page', w.KovaZone2.TOUR.length === 6 && w.KovaZone2.TOUR.every((t) => !!doc.querySelector('#kz2 ' + t[0])));
  w.KovaTour.end(); w.KovaZone2.close(); w.KovaZone2.open(); await wait(900);
  ck('it does not play by itself again', !w.KovaTour.active());
  doc.querySelector('#kz2 [data-z2="tour"]').click(); await wait(50);
  ck('the ? next to the title plays it again', w.KovaTour.active() && doc.querySelector('#kz2 [data-z2="tour"]').getAttribute('aria-label') === 'Show me around Zone 2');
  w.KovaTour.end(); w.KovaZone2.close();

  ck('no script errors', !errors.filter((e) => !/Not implemented|navigation/i.test(e)).length);
  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  if (errors.length) console.log(errors.slice(0, 4).join('\n'));
  console.log(`${R.length - failed.length}/${R.length} whatsnew`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
