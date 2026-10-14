/* The nutrition coach's check-in on Fuel (p30): the owner asked for a
   daily check-in through the week, from the Fuel coach, across every
   metric. Checks the card shows the coach, this week from the user's own
   logs (and says so when there is nothing), "Check in now" starts a real
   job for the coach, "Every evening" turns on their daily routine, and
   "Message" opens the coach's own page. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
const user = { uid: 'u1', getIdToken: () => Promise.resolve('t') };
w.firebase = { initializeApp() {}, apps: [{}],
  auth: () => ({ currentUser: user, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() }),
  database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
  analytics: () => ({ logEvent() {}, setUserId() {} }) };
w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'offline test' }), text: () => Promise.resolve('') });
w.localStorage.setItem('kova_mode_v1', 'live');
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(1900);
  const doc = w.document, K = w.KovaCheckin, C = w.KovaCrew, DAY = 864e5;
  ck('the check-in is on the page and has a slot on Fuel', !!K && !!doc.getElementById('kciSlot') && !!doc.querySelector('#s-fuel #kciSlot'));
  const sage = K.coach();
  ck('its coach is the AI team’s Nutrition Coach', sage && sage.title === 'Nutrition Coach');

  /* nothing logged: no made-up numbers */
  w.go('fuel'); await wait(30);
  const t0 = doc.getElementById('kciSlot').textContent;
  ck('with nothing logged it says so, never a number', /0 of 7 days/.test(t0) && /No food logged yet/.test(t0) && /No nights yet/.test(t0) && /No weigh-ins yet/.test(t0) && /No check-in yet/.test(t0));

  /* a real week */
  w.KovaFuel.add({ src: 'manual', kcal: 2000, p: 150, c: 200, f: 60, items: [{ n: 'Lunch' }] });
  w.KovaFuel.add({ src: 'manual', kcal: 400, p: 30, c: 40, f: 10, items: [{ n: 'Snack' }] });
  w.localStorage.setItem('kova_log_v1', JSON.stringify([{ t: Date.now() - DAY, day: 'Push', mins: 50, vol: 9000 }, { t: Date.now() - 20 * DAY, day: 'Old', mins: 40 }]));
  w.KP.set('wlog', [{ t: Date.now() - 9 * DAY, kg: 82.4 }, { t: Date.now(), kg: 81.6 }]);
  const wk = K.week();
  ck('this week is read from your own logs: 1 day of food, 2,400 kcal, 180 g protein, 1 workout, weight down 0.8 kg', wk.logged === 1 && Math.round(wk.kcal) === 2400 && Math.round(wk.protein) === 180 && wk.sessions === 1 && Math.abs(wk.weightChange + 0.8) < 1e-6);
  K.paint();
  const t1 = doc.getElementById('kciSlot').textContent;
  ck('the card shows it', /1 of 7 days/.test(t1) && /2,400/.test(t1) && /180 g/.test(t1) && /-0\.8 kg this week/.test(t1));

  /* Check in now: a real job for the coach */
  const before = C.jobsOf(sage.id).length;
  doc.querySelector('[data-kci="now"]').click(); await wait(50);
  const jobs = C.jobsOf(sage.id);
  ck('"Check in now" gives the coach a real job: read the week, one thing to do today', jobs.length === before + 1 && /Daily check-in/.test(jobs[jobs.length - 1].text) && /one thing to do today/.test(jobs[jobs.length - 1].text));
  await wait(2500);
  ck('when it is done the card shows what the coach said', /No check-in yet/.test(doc.getElementById('kciSlot').textContent) === false);

  /* Every evening */
  doc.querySelector('[data-kci="tog"]').click(); await wait(20);
  const s2 = C.emp(sage.id);
  ck('"Every evening" turns on the coach’s daily routine at 8 pm, with the check-in as the job', s2.routine.freq === 'daily' && s2.routine.time === '20:00' && /Daily check-in/.test(s2.routine.job) && /every evening at 8 pm/.test(doc.getElementById('kciSlot').textContent));
  doc.querySelector('[data-kci="tog"]').click(); await wait(20);
  ck('and off again', C.emp(sage.id).routine.freq === 'off' && /check-ins are off/.test(doc.getElementById('kciSlot').textContent));

  /* Message */
  doc.querySelector('[data-kci="msg"]').click(); await wait(400);
  ck('"Message" opens the coach’s own page with the message box', doc.getElementById('s-workteam').classList.contains('on') && C._S.tab === sage.id && !!doc.getElementById('crwEmpAsk'));
  ck('no page errors', !errors.filter((e) => !/Not implemented|offline test/.test(e)).length);
  if (errors.length) console.log(errors.slice(0, 3));
  let fail = 0; for (const [n, ok] of R) { console.log((ok ? 'PASS ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passing');
  process.exit(fail ? 1 : 0);
})();
