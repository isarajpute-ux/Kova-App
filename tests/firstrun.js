/* The first ten seconds and the first week:
     - first run: three questions (goal, cycle, activity), then a first
       win, with no biometric, permission or recap screens in between;
     - KovaFirstWeek: the funnel events, the first win, the plan offered
       only after it, one prompt a day for what the first run skipped;
     - KovaToday: each week box pops up that area's day with its reason;
       the morning brief is written from real numbers; the 7:00 message. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const events = [];
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve(),
    signInAnonymously: () => Promise.resolve({ user: { uid: 'anon', getIdToken: () => Promise.resolve('t') } }) };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent(n, p) { events.push([n, p]); }, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  w.localStorage.setItem('kova_mode_v1', opts.mode || 'sample');
  (opts.pre || []).forEach(([k, v]) => w.localStorage.setItem(k, v));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const cam = { opened: 0 };
  w.KovaCam = { open: () => { cam.opened++; }, close() {} };
  return { w, doc: w.document, events, cam, names: () => events.map((e) => e[0]) };
}
const wallText = (doc) => (doc.getElementById('authInner') || { textContent: '' }).textContent;
const pick = (doc, v) => { const b = doc.querySelector('.ob-opt[data-v="' + v + '"]'); if (b) b.click(); return !!b; };

(async () => {
  // ---------- the first run ----------
  const A = boot({});
  await wait(700);
  const { w, doc } = A;
  ck('first open logs app_install', A.names().includes('app_install'));
  const skip = doc.getElementById('authSkip');
  ck('the welcome screen offers Kova without an account', !!skip);
  skip.click(); await wait(80);
  ck('no biometric prompt before the first win', !/Enable biometric unlock/.test(wallText(doc)));
  ck('question 1 comes straight away: what Kova is for, several allowed', /Three quick questions, then your day/.test(wallText(doc)) && /What do you want Kova for/.test(wallText(doc)) && doc.getElementById('obNext').disabled);
  pick(doc, 'fuel'); doc.getElementById('obNext').click(); await wait(30);
  ck('question 2 is your body: female, male or prefer not to say', /Which body is Kova reading/.test(wallText(doc)) && ['female', 'male', 'skip'].every((v) => !!doc.querySelector('.ob-opt[data-v="' + v + '"]')));
  pick(doc, 'female'); await wait(20);
  ck('female adds a small follow-up on the same screen: track the cycle (yes by default)', !!doc.querySelector('[data-cy="yes"].on') && !!doc.querySelector('[data-cy="no"]'));
  doc.getElementById('obNext').click(); await wait(30);
  ck('question 3 is activity', /How active are you/.test(wallText(doc)));
  pick(doc, '4'); doc.getElementById('obNext').click(); await wait(30);
  ck('then the first win, not permissions or a recap', /Your first win/.test(wallText(doc)) && !/Two permissions/.test(wallText(doc)) && doc.querySelectorAll('#authInner [data-w]').length === 3);
  doc.querySelector('[data-w="meal"]').click();
  await wait(900);
  const od = A.events.find((e) => e[0] === 'onboarding_done');
  ck('onboarding_done is logged with how long it took', od && od[1].result === 'meal' && typeof od[1].count === 'number' && od[1].count < 60);
  ck('the answers are saved (areas, sex, cycle, activity), and the picks are logged', (() => { const o = w.KP.get('onboard'); return o.focus === 'fuel' && JSON.stringify(o.areas) === '["fuel"]' && o.sex === 'female' && o.cycle === 'yes' && o.days === 4; })() && A.events.some((e) => e[0] === 'areas_picked' && e[1].answer === 'fuel' && e[1].count === 1));
  ck('"yes" to tracking turns cycle tracking on, and the micronutrient ranges are set for women', w.KovaCycle._data().on === true && JSON.parse(w.localStorage.getItem('kova.micro.sex')) === 'f');
  for (let i = 0; i < 30 && A.cam.opened !== 1; i++) await wait(100);   // slower under a busy machine
  ck('"Snap your next meal" lands on Fuel and opens its camera', doc.getElementById('s-fuel').classList.contains('on') && A.cam.opened === 1);

  // ---------- the next launch goes straight in ----------
  const dump = [];
  for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); dump.push([k, w.localStorage.getItem(k)]); }
  const A2 = boot({ pre: dump });
  await wait(700);
  const wall2 = A2.doc.getElementById('authWall');
  ck('after "Use Kova without one", the next launch skips the sign-in screen', !A2.doc.getElementById('authSkip') && (!wall2 || wall2.classList.contains('gone') || wall2.style.display === 'none'));
  ck('and there is no second sign-in form on top of the welcome screen', (() => { const m = A.doc.getElementById('kova-auth-modal'); return !m || m.style.display !== 'flex'; })());

  // ---------- the first win, then the plan ----------
  w.KOVA_RC = { web: 'rcb_test', ios: '', android: '', entitlement: 'kova_pro' };
  ck('no plan offer before the first win', !doc.querySelector('#sheetIn .kfw'));
  w.KovaFuel.add({ src: 'manual', kcal: 400, p: 30, c: 40, f: 10, items: [{ n: 'Toast and eggs' }] });
  await wait(2100);
  ck('the first logged meal is the first win', A.events.some((e) => e[0] === 'first_win' && e[1].kind === 'meal'));
  ck('only then is the free trial offered, with the price promise', !!doc.querySelector('#sheetIn .kfw') && /price is on the next screen/.test(doc.querySelector('#sheetIn .kfw').textContent));
  w.KovaFuel.add({ src: 'manual', kcal: 100, p: 5, c: 10, f: 2, items: [{ n: 'Apple' }] });
  ck('first_win is logged once', A.events.filter((e) => e[0] === 'first_win').length === 1);

  // ---------- one prompt a day ----------
  if (w.closeSheet) w.closeSheet();
  w.KovaFirstWeek.paint();
  let card = doc.getElementById('kfwCard');
  ck('after the win, the device question comes back as one card on Today', card && /Wearing anything/.test(card.textContent));
  card.querySelector('.kfw-o[data-v="none"]').click();
  ck('answering removes it and saves the answer', !doc.getElementById('kfwCard') && w.KP.get('onboard').device === 'none');
  w.KovaFirstWeek.paint();
  ck('one prompt a day: nothing else today', !doc.getElementById('kfwCard'));
  // tomorrow
  const S = w.KovaFirstWeek._S();
  S.install -= 864e5; S.lastPrompt = '0'; S.shownId = null; w.KovaFirstWeek._reset(S);
  w.document.dispatchEvent(new w.Event('visibilitychange'));
  await wait(20);
  card = doc.getElementById('kfwCard');
  ck('the next day brings the wind-down reminder question', card && /wind-down/.test(card.textContent));
  ck('and day 1 is counted for retention', A.events.some((e) => e[0] === 'day1_return') && A.events.some((e) => e[0] === 'return_day' && e[1].day === 1));
  card.querySelector('.kfw-o[data-v="on"]').click(); await wait(600);
  ck('"Yes" switches the bedtime reminder on', w.__alerts.get().find((a) => a.id === 'bed').on === true);
  // day 7
  const S7 = w.KovaFirstWeek._S(); S7.install = Date.now() - 7 * 864e5; S7.lastPrompt = '0'; S7.prompts = { device: 'done', winddown: 'done', lock: 'done', target: 'done' }; w.KovaFirstWeek._reset(S7);
  w.KovaFirstWeek.paint();
  card = doc.getElementById('kfwCard');
  ck('on day 7 Kova asks how it is doing, 1 to 5', card && /How is Kova doing/.test(card.textContent) && card.querySelectorAll('.kfw-o').length === 5);
  card.querySelector('.kfw-o[data-v="4"]').click();
  ck('the rating is logged', A.events.some((e) => e[0] === 'kova_rating' && e[1].rating === 4));

  // ---------- the week boxes pop up each area's day ----------
  const B = boot({ pre: [['kova.auth.skipped', '1'], ['kova.onboarded', JSON.stringify({ at: 1 })]] });
  await wait(800);
  B.w.localStorage.setItem('kova_log_v1', '[]');
  B.w.KP.set('plan', { days: [{ n: 'Push' }, { n: 'Pull' }, { n: 'Legs' }, { n: 'Upper' }, { n: 'Lower' }, { n: 'Full' }, { n: 'Arms' }] });
  B.w.KovaToday.paint();
  ck('no extra "your day" card on Today', !B.doc.getElementById('ktoday'));
  const brief = [...B.doc.querySelectorAll('#s-home .card.kova')].find((c) => /MORNING BRIEF/.test(c.textContent));
  ck('the morning brief writes itself from real numbers', brief && brief.style.display !== 'none' && /You slept \d+h \d+m/.test(brief.querySelector('.kova-txt').textContent) && !/quads are 8 sets behind/.test(brief.textContent));
  const boxes = [...B.doc.querySelectorAll('#wheelBoxes [data-wp]')].map((b) => b.dataset.wp);
  ck('the four week boxes (Sleep, Workout, Fuel, Vitals) are tappable', ['sleep', 'move', 'fuel', 'vitals'].every((k) => boxes.includes(k)));
  const popWhy = async (k) => { B.doc.querySelector(`#wheelBoxes [data-wp="${k}"]`).click(); await wait(20); const el = B.doc.querySelector('#sheetIn .kt'); return el ? el.textContent : ''; };
  let t = await popWhy('sleep');
  ck('Sleep pops up readiness and where it comes from', /Readiness/.test(t) && /of sleep/.test(t) && /(your own baseline|sleep length alone)/.test(t) && /Open Sleep/.test(t));
  t = await popWhy('fuel');
  ck('Fuel pops up today\'s target and why it moved', /Eat/.test(t) && /(Moved today|Nothing logged|left)/.test(t));
  const src = (k) => [...B.doc.querySelectorAll('#sheetIn .kt-src')].map((e) => e.textContent).join(' ');
  ck('...and says where the estimate comes from and how sure it is', /Estimate: (Mifflin-St Jeor|Katch-McArdle)|average adult until you answer five questions/.test(src()));
  await popWhy('sleep');
  ck('readiness names its source and how many nights it rests on', /Source: (your sleep log|your watch|Apple Health|Health Connect)/.test(src()) && /(night|sleep length alone)/.test(src()));
  t = await popWhy('move');
  ck('Workout pops up today\'s day of the plan and how hard to go', /of your 7-day plan/.test(t));
  B.w.localStorage.setItem('kova_log_v1', JSON.stringify([{ t: Date.now(), mins: 48, vol: 9100 }]));
  t = await popWhy('move');
  ck('once today\'s session is logged, it says done', /Logged today, 48 min/.test(t));
  B.doc.querySelector('#sheetIn [data-kt="go"]').click(); await wait(30);
  ck('"Open Workout" goes there', B.doc.getElementById('s-move').classList.contains('on'));
  await popWhy('sleep');
  B.doc.querySelector('#sheetIn [data-kt="am"]').click(); await wait(50);
  const am = B.w.__alerts.get().find((a) => a.id === 'today');
  ck('"Send me my day at 7:00" adds a 7:00 reminder carrying the summary', am && am.on && am.t === '07:00' && /Readiness|Eat/.test(am.body));
  ck('the widget summary is written for the native app', /"lines"/.test(B.w.localStorage.getItem('kova.today.widget') || ''));
  ck('How it connects is one row on Today, not a long rail', !!B.doc.querySelector('#s-home #klRail.kl-row1') && !B.doc.querySelector('#s-home .kl-row'));
  B.doc.getElementById('klRail').click(); await wait(20);
  ck('...and opens the comparisons in a pop-up', B.doc.querySelectorAll('#sheetIn .kl-sheet .kl-c').length >= 3);
  // live mode, nothing connected: no invented numbers
  const C = boot({ mode: 'live', pre: [['kova.auth.skipped', '1'], ['kova.onboarded', JSON.stringify({ at: 1 })]] });
  await wait(800);
  C.doc.querySelector('#wheelBoxes [data-wp="sleep"]').click(); await wait(20);
  ck('with no data, readiness says what would fill it instead of inventing a number', /Connect a watch or log last night/.test(C.doc.querySelector('#sheetIn .kt').textContent));
  ck('...and an empty line claims no source', !C.doc.querySelector('#sheetIn .kt-row.empty .kt-src'));
  C.w.closeSheet(); C.w.go('home'); await wait(100);
  const row = C.doc.querySelector('.kl-panel[data-p="home"] .kl-row[data-act="fuel"]');
  if (row) row.click(); await wait(30);
  ck('in live mode the Today rows pop up the same day view (with Open Fuel), instead of jumping away', row && C.doc.getElementById('sheet').classList.contains('on') && /Open Fuel/.test(C.doc.querySelector('#sheetIn .kt').textContent) && !C.doc.getElementById('s-fuel').classList.contains('on'));

  const failed = R.filter((r) => !r[1]);
  R.forEach((r) => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
