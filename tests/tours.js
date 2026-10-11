/* Guided tours (src/p07_ui.js KovaTour / KovaScreenTour): a Back button
   from the second stop on, the keyboard (left, right, Esc), and the new
   tours that load with their parts of Kova: Vitals walks the dock and opens
   each section as it goes; Automations and a Meeting have their own, each
   with a "?" beside the title. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
w.localStorage.setItem('kova.auth.skipped', '1');
w.localStorage.setItem('kova.sex', JSON.stringify('female'));
/* every tour counts as seen, so none starts by itself mid-test */
w.localStorage.setItem('kova.tours.v1', JSON.stringify({ home: 1, move: 1, vitals: 1, sleep: 1, fuel: 1, work: 1, workauto: 1, workmeeting: 1, workmeetings: 1, customize: 1, studio: 1 }));
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(2200);
  const doc = w.document, T = w.KovaTour, S = w.KovaScreenTour, $ = (s) => doc.querySelector(s);
  const coach = () => (doc.getElementById('ksCoach') || {}).textContent || '';
  const btn = (k) => doc.querySelector('#ksCoach [data-t="' + k + '"]');
  const until = async (re) => { for (let i = 0; i < 40 && !re.test(coach()); i++) await wait(60); return re.test(coach()); };
  const key = (k) => doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));

  /* ---- Back ---- */
  let done = false;
  T.run([{ t: 'One', d: 'a', el: () => $('#s-fuel .card') }, { t: 'Gone', d: 'x', el: () => null }, { t: 'Three', d: 'c', el: () => $('#microGrid') }, { t: 'Four', d: 'd', el: () => $('#s-fuel .card') }], { done: () => { done = true; } });
  await until(/One/);
  ck('the first stop has Skip and Next, and no Back', !!btn('skip') && !!btn('next') && !btn('back'));
  btn('next').click(); await until(/Three/);
  ck('from the second stop shown on, there is a Back button', /3 \/ 4/.test(coach()) && !!btn('back') && /Back/.test(btn('back').textContent));
  btn('back').click(); await until(/One/);
  ck('Back returns to the stop you saw before (skipping one that was never shown)', /1 \/ 4/.test(coach()) && /One/.test(coach()) && !btn('back'));
  key('ArrowRight'); await until(/Three/);
  ck('the right arrow key goes to the next stop', /Three/.test(coach()));
  key('ArrowRight'); await until(/Four/);
  key('ArrowLeft'); await until(/Three/);
  ck('the left arrow key goes back', /Three/.test(coach()) && T.step() === 2);
  key('Escape'); await wait(30);
  ck('Esc ends the tour, like Skip', !doc.getElementById('ksTour') && done && !T.active());

  /* ---- Vitals walks the dock ---- */
  w.go('vitals'); await wait(300);
  const V = w.KovaVDock;
  ck('the Vitals tour is the dock tour once Vitals has its dock', S.TOURS.vitals[0][0] === 'Pick a part of Vitals' && S.TOURS.vitals.length === 11);
  S.run('vitals'); await until(/Pick a part of Vitals/);
  ck('it starts on the dock', /1 \/ 11/.test(coach()));
  btn('next').click(); await until(/Where you are/);
  btn('next').click(); await until(/Recovery/);
  ck('the Recovery stop opens Today', V.current() === 'today' && /Recovery/.test(coach()));
  for (let i = 0; i < 3; i++) { btn('next').click(); await wait(120); }
  await until(/Steadiest and most off/);
  ck('the next stops open Readings & signals by themselves', V.current() === 'signals' && /Steadiest and most off/.test(coach()));
  btn('back').click(); await until(/Sleep and trend/);
  ck('Back goes to the stop before and opens its section again', V.current() === 'today' && /Sleep and trend/.test(coach()));
  let seen = [];
  for (let i = 0; i < 12 && doc.getElementById('ksTour'); i++) { seen.push((doc.querySelector('#ksCoach .ks-ct') || {}).textContent); btn('next').click(); await wait(200); }
  ck('the tour reaches Heart, Health and the search', seen.includes('Heart and stress') && seen.includes('Health and actions') && seen.includes('Find anything'));
  ck('and ends cleanly', !doc.getElementById('ksTour'));

  /* ---- Automations and a Meeting ---- */
  ck('Automations, a Meeting and the Meetings list have tours', S.TOURS.workauto && S.TOURS.workauto.length === 7 && S.TOURS.workmeeting && S.TOURS.workmeeting.length === 5 && S.TOURS.workmeetings && S.TOURS.workmeetings[1][0] === 'Your booking link');
  w.go('workauto'); await wait(150); if (w.__workAuto) w.__workAuto.draw(); await wait(80);
  ck('a "?" sits beside the Automations title', !!doc.querySelector('#s-workauto .kt-help[data-ktour="workauto"]'));
  S.run('workauto'); await until(/Say the rule/);
  seen = [];
  for (let i = 0; i < 9 && doc.getElementById('ksTour'); i++) { seen.push((doc.querySelector('#ksCoach .ks-ct') || {}).textContent); btn('next').click(); await wait(200); }
  ck('the Automations tour shows every stop', ['Say the rule', 'Ready examples', 'Build it', 'How the best tools do it', 'Your rules', 'Recipes', 'New rule'].every((t) => seen.includes(t)));
  const m = w.WorkOS.create('meetings', { title: 'Kickoff', attendees: 'Sam', at: Date.now() - 36e5, prep: '', notes: '' }, 'user');
  w.__workMeet.open(m.id); await wait(150);
  ck('a "?" sits beside the Meeting title', !!doc.querySelector('#s-workmeeting .kt-help[data-ktour="workmeeting"]'));
  S.run('workmeeting'); await until(/The call/);
  seen = [];
  for (let i = 0; i < 7 && doc.getElementById('ksTour'); i++) { seen.push((doc.querySelector('#ksCoach .ks-ct') || {}).textContent); btn('next').click(); await wait(200); }
  ck('the Meeting tour shows every stop, including Pull action items', ['The call', 'Before the call', 'After the call', 'Pull action items', 'Action items'].every((t) => seen.includes(t)));

  const bad = errors.filter((e) => !/Not implemented|Could not parse CSS|csstree/i.test(e));
  ck('no page errors', bad.length === 0);
  if (bad.length) console.log(bad.slice(0, 5).join('\n'));
  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
