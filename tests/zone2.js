/* p33: Zone 2 running (src/p08_zone2.js), all real: the range comes from
   your heart-rate reserve when Kova has your resting heart rate, else
   from your max, and one you set wins; GPS points that are jumps or
   noise do not count as distance; a run with a strap times the minutes
   in the zone, speaks up when you drift for 10 seconds, and saves time
   in zone, average heart rate, distance and aerobic pace; a run with no
   strap counts as "by feel", never as measured; the Workout card adds up
   the week against the goal and shows how aerobic pace moved. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.env.KOVA_HTML || (__dirname + '/../index.html'), 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
w.localStorage.setItem('kova_mode_v1', 'live');
const spoken = [];
w.speechSynthesis = { cancel() {}, speak(u) { spoken.push(u.text); }, getVoices() { return []; }, addEventListener() {}, speaking: false };
w.SpeechSynthesisUtterance = function (t) { this.text = t; };
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(1600);
  const doc = w.document, Z = w.KovaZone2, KP = w.KP;
  ck('the Zone 2 module loaded', !!Z && !!w.KovaHR);
  KP.set('me', Object.assign({}, KP.get('me') || {}, { age: 30 }));
  let z = Z.zone();
  ck('no resting heart rate: 60–70% of max (Tanaka, 208 − 0.7 × 30 = 187)', z.lo === 112 && z.hi === 131 && z.src === 'max' && /max of 187/.test(z.how));
  const realH = w.KovaHealth;
  w.KovaHealth = { has: (k) => k === 'rhr', get: () => 55 };
  z = Z.zone();
  ck('with resting 55 from a watch: 60–70% of heart-rate reserve (134–147)', z.lo === 134 && z.hi === 147 && z.src === 'hrr' && /resting 55/.test(z.how));
  ck('…and 180 − age is offered as a cross-check, not instead', z.maf === 150);
  KP.set('z2zone', { lo: 128, hi: 142 });
  ck('a range you set wins', Z.zone().lo === 128 && Z.zone().src === 'own');
  KP.set('z2zone', null); w.KovaHealth = realH;
  z = Z.zone();
  ck('in, above, below, and no reading', Z.state(120, z) === 'in' && Z.state(140, z) === 'above' && Z.state(100, z) === 'below' && Z.state(0, z) === 'none');

  /* GPS */
  const run = { pts: [], dist: 0, zDist: 0, paused: false, cur: 'in' };
  const at = (i, dLat, acc, dt) => ({ lat: 51.5 + i * dLat, lon: -0.12, acc: acc || 8, t: 1e12 + i * (dt || 3000) });
  for (let i = 0; i < 11; i++) Z.addPoint(run, at(i, 0.00009));            /* 10 m every 3 s */
  ck('a straight 100 m counts as 100 m', Math.abs(run.dist - 100) < 2 && Math.abs(run.zDist - 100) < 2);
  const d0 = run.dist;
  Z.addPoint(run, at(11, 0.002));                                           /* 220 m in 3 s */
  Z.addPoint(run, Object.assign(at(12, 0.00009), { acc: 60 }));
  Z.addPoint(run, Object.assign(at(13, 0.0000001), { lat: run.pts[run.pts.length - 1].lat + 0.0000001 }));
  ck('a GPS jump, a fuzzy fix and standing still add nothing', run.dist === d0);
  ck('pace from the last 30 seconds (10 m every 3 s = 2:41 per km)', Z.paceText.call(null, 0.3) !== '' && Math.abs(Z.curPace(run) - 0.3) < 0.02);

  /* a run with a strap, minute by minute */
  let T = Date.now(); w.Date.now = () => T;
  let bpm = 120; w.KovaHR.bpm = () => bpm;
  Z.start('indoor');
  ck('the run screen opens with the heart rate and what to do', !!doc.getElementById('kz2') && /120/.test(doc.getElementById('kz2').textContent) && /In Zone 2/.test(doc.getElementById('kz2').textContent));
  for (let s = 0; s < 600; s++) { T += 1000; Z.tick(); }
  bpm = 150;
  for (let s = 0; s < 30; s++) { T += 1000; Z.tick(); }
  ck('drifting above for 10 seconds speaks up once', spoken.filter((t) => /Ease off/.test(t)).length === 1);
  ck('…and the screen says to ease off', /Above Zone 2/.test(doc.getElementById('kz2').textContent));
  bpm = 122;
  for (let s = 0; s < 20; s++) { T += 1000; Z.tick(); }
  ck('back in the zone it says so', spoken.some((t) => /Back in Zone 2/.test(t)));
  Z.pause(); for (let s = 0; s < 120; s++) { T += 1000; Z.tick(); } Z.pause();
  const r1 = Z.finish(true);
  ck('the run is saved: time in zone, time above, average heart rate', r1 && Math.abs(r1.inZone / 1000 - 620) <= 3 && Math.abs(r1.above / 1000 - 30) <= 2 && r1.hr === true && r1.avg > 119 && r1.avg < 130);
  ck('paused time is not run time', Math.abs(r1.dur / 1000 - 650) <= 3);
  ck('afterwards a summary shows the minutes in Zone 2 and the week', /minutes in Zone 2/.test(doc.getElementById('sheetIn').textContent) && /This week/.test(doc.getElementById('sheetIn').textContent) && !doc.getElementById('kz2'));

  /* a run with no strap */
  bpm = 0;
  Z.start('indoor');
  ck('with no heart rate it is a talk-test run', /By feel/.test(doc.getElementById('kz2').textContent) && /conversational/.test(doc.getElementById('kz2').textContent));
  for (let s = 0; s < 900; s++) { T += 1000; Z.tick(); }
  const r2 = Z.finish(true);
  ck('…saved as by feel, never as measured minutes', r2 && r2.hr === false && r2.inZone === 0 && /by feel/.test(doc.getElementById('sheetIn').textContent));
  const wk = Z.week(T);
  ck('the week adds measured minutes and by-feel minutes separately', wk.measured === 10 && wk.feel === 15);
  Z.start('indoor'); T += 20000; Z.tick();
  ck('a run under a minute is not saved', Z.finish(true) === null && Z.runs().length === 2);

  /* aerobic pace: two measured outdoor runs a month apart */
  const L = Z.runs();
  L.push({ t: T - 30 * 864e5, dur: 1800e3, hr: true, inZone: 1800e3, zMoving: 1800e3, zDist: 5000, dist: 5000, lo: 112, hi: 131 });
  L.push({ t: T - 864e5, dur: 1800e3, hr: true, inZone: 1800e3, zMoving: 1800e3, zDist: 5400, dist: 5400, lo: 112, hi: 131 });
  L.sort((a, b) => a.t - b.t); KP.set('z2runs', L);
  const ae = Z.aerobic();
  ck('aerobic pace compares the latest run with one 3+ weeks before', ae && ae.now < ae.then && Math.abs(ae.now - 1800 / 5400) < 1e-6);
  try { w.localStorage.setItem('kova.z2.unit', JSON.stringify('km')); } catch (e) {}
  const c = Z.card();
  ck('the Workout card: minutes this week of the goal, the range, the trend', /\/ 150 min/.test(c) && /112–131 bpm/.test(c) && /s faster/.test(c) && /Start a Zone 2 run/.test(c));
  let host = doc.querySelector('#s-move .kl-acts');
  if (!host) { doc.getElementById('s-move').insertAdjacentHTML('afterbegin', '<div class="kv-card" id="fakeTraining"></div><div class="kl-acts"><div class="chip">Check my form</div></div>'); host = doc.querySelector('#s-move .kl-acts'); }
  Z.decorate(); await wait(20);
  const cardEl = doc.getElementById('kz2Card');
  ck('it sits right under the Training card on Workout, never inside it', !!cardEl && cardEl.previousElementSibling === (host.closest('.kv-card') || host) && !cardEl.parentNode.closest('.kv-card') && cardEl.classList.contains('kv-card'));
  ck('…and Exercises and Stretch are not added to it', !cardEl.querySelector('.kxp-act'));
  doc.querySelector('#kz2Card [data-z2="go"]').click(); await wait(20);
  ck('Start shows the choices: outdoor with GPS, or treadmill', /Outdoor run \(GPS\)/.test(doc.getElementById('sheetIn').textContent) && /Treadmill/.test(doc.getElementById('sheetIn').textContent));
  doc.querySelector('#kz2Card [data-z2="what"]').click(); await wait(20);
  ck('What is Zone 2 explains it and how your range was worked out', /conversational/.test(doc.getElementById('sheetIn').textContent) && /60–70%/.test(doc.getElementById('sheetIn').textContent));
  doc.querySelector('#kz2Card [data-z2="setup"]').click(); await wait(20);
  doc.getElementById('kz2Lo').value = '125'; doc.getElementById('kz2Hi').value = '140';
  doc.querySelector('#sheetIn [data-z2="saveRange"]').click();
  ck('you can set your own range from a test', Z.zone().lo === 125 && Z.zone().hi === 140);
  doc.querySelector('#kz2Card [data-z2="setup"]').click(); await wait(10);
  doc.querySelector('#sheetIn [data-z2="goal"][data-m="180"]').click();
  ck('and change the weekly goal', Z.goal() === 180);

  ck('no script errors', !errors.filter((e) => !/Not implemented|navigation/i.test(e)).length);
  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  if (errors.length) console.log(errors.slice(0, 4).join('\n'));
  console.log(`${R.length - failed.length}/${R.length} zone2`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
