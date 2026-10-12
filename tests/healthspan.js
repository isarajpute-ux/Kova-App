/* Healthspan, honest (p26):
     - with your own data and no readings, no fitness age is shown (it used
       to fill in example readings: 68 bpm, 38 ms, 5 h, 8,412 steps, age 19);
     - only real readings count, and the weights re-balance over them;
     - your age comes from Fuel > Find my maintenance, or it asks for it;
     - the biggest ageing factor is named in years, straight from the sum;
     - the 30-day trend comes from one saved reading a day, after 7 days;
     - and the exercise "how to" sheet (KovaFormCues). */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function boot(mode, pre) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova_mode_v1', mode);
  w.localStorage.setItem('kova.auth.skipped', '1');
  Object.keys(pre || {}).forEach((k) => w.localStorage.setItem(k, pre[k]));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document, t: (id) => (w.document.getElementById(id) || { textContent: '' }).textContent };
}
const key = (d) => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);

(async () => {
  /* your own data, nothing recorded yet */
  const A = boot('live');
  await wait(500); A.w.__paintHealthSpan();
  ck('own data, no readings: no fitness age, it says no readings yet', A.t('hsAge') === '—' && /No readings yet/.test(A.t('hsVerdictTitle')) && /does not guess/.test(A.t('hsKova')));
  ck('and no example numbers in the inputs', !/68 bpm|38 ms|8,412/.test(A.t('hsInputs')) && (A.t('hsInputs').match(/No data/g) || []).length === 4);
  ck('the date bar follows today, not "Aug 3"', !/Aug 3/.test(A.t('hsPrevLbl')));

  /* one real reading (HRV from the watch), no age yet */
  const hrv = A.w.KOVA_SIG.filter((r) => r.n === 'HRV')[0]; hrv.v = '50ms'; hrv.real = true;
  A.w.__paintHealthSpan();
  ck('one real reading counts on its own: HRV 50 ms is 1.5 years under, the rest say no data', /1\.5 years under your age/.test(A.t('hsKova')) && (A.t('hsInputs').match(/No data/g) || []).length === 3);
  ck('without an age it asks for one instead of assuming 19', A.t('hsAge') === '—' && /Add your age in Fuel > Find my maintenance/.test(A.t('hsKova')));
  ck('what helps most is named in years, from the sum: HRV takes 1.5 years off', /HRV is doing the most for you: it takes about 1\.5 years off/.test(A.t('hsKova')));
  ck('missing readings are listed, not invented', /Not counted yet \(no readings\): resting hr, sleep, daily steps/.test(A.t('hsKova')));

  /* your age, and a reading that drags */
  A.w.KP.set('maint', { v: 1, kg: 80, age: 30, sex: 'm' });
  const rhr = A.w.KOVA_SIG.filter((r) => r.n === 'Resting HR')[0]; rhr.v = '76bpm'; rhr.real = true;
  A.w.__paintHealthSpan();
  /* RHR 76: band(76,45,80 inverted) = 11; HRV 50: 60. Weights .32/.28 over .60:
     score = (11*.32 + 60*.28)/.60 = 33.87, shift = -2.42; RHR share = (11-50)*.32/.60/10*1.5 = -3.12 */
  ck('your real age is used: 30 + 2.4 = 32.4', A.t('hsAge') === '32.4');
  ck('the biggest ageing factor is named in years: resting HR adds about 3.1 years', /Resting HR is your biggest ageing factor right now: it is adding about 3\.1 years\. Fix this first/.test(A.t('hsKova')));
  ck('trend: after the first day it says how many more days it needs', /Trend: 6 more days of readings/.test(A.t('hsTrend')));

  /* a week of your own days, improving 0.1 year a day */
  const days = []; for (let i = 6; i >= 1; i--) { const d = new Date(Date.now() - i * 864e5); days.push({ d: key(d), shift: -2.42 - i * 0.1 }); }
  A.w.localStorage.setItem('kova.hs.hist', JSON.stringify(days));
  A.w.__paintHealthSpan();
  ck('with 7 days: on track to be about 3.0 years younger in 30 days', /On track to be about 3\.0 years younger in 30 days/.test(A.t('hsTrend')));
  const hist = JSON.parse(A.w.localStorage.getItem('kova.hs.hist'));
  ck('one reading a day is kept, today replaced not duplicated', hist.length === 7 && hist.filter((x) => x.d === key(new Date())).length === 1);

  /* the example week still shows its example */
  const B = boot('sample');
  await wait(500); B.w.__paintHealthSpan();
  ck('example mode still shows the example fitness age', /^\d+\.\d$/.test(B.t('hsAge')) && /years (over|under) your age/.test(B.t('hsKova')) && !/Trend/.test(B.t('hsTrend')));

  /* exercise how-to */
  const F = A.w.KovaFormCues;
  const need = ['Squat', 'Deadlift', 'Bench Press', 'Overhead Press', 'Romanian Deadlift', 'Pull-up', 'Barbell Row', 'Lunge', 'Hip Thrust', 'Lat Pulldown', 'Leg Press', 'Leg Curl', 'Leg Extension', 'Incline Press', 'Dumbbell Row', 'Face Pull', 'Lateral Raise', 'Bicep Curl', 'Tricep Extension', 'Cable Fly', 'Bulgarian Split Squat', 'Box Jump', 'Kettlebell Swing', 'Plank', 'Push-up', 'Dip', 'Chin-up', 'Arnold Press', 'Hack Squat', 'Good Morning'];
  const miss = need.filter((n) => !F.find(n));
  ck('the 30 most common lifts all have cues (' + (miss.join(', ') || 'none missing') + ')', !miss.length);
  ck('names match the right lift: Romanian deadlift is not a deadlift, front squat is not a squat, chin-up is not a pull-up',
    F.find('Single leg Romanian deadlift')[1] === 'Romanian deadlift' && F.find('Front squat')[1] === 'Front squat' && F.find('Chin-up')[1] === 'Chin-up' && F.find('Seated cable row')[1] === 'Seated cable row' && F.find('Leg curl')[1] === 'Leg curl');
  ck('every entry has muscles, 3 to 5 cues and at least 2 mistakes', need.every((n) => { const f = F.find(n); return f[2] && f[4].length >= 3 && f[4].length <= 5 && f[5].length >= 1; }));
  const b = A.doc.createElement('button'); b.setAttribute('data-exinfo', 'Romanian deadlift'); A.doc.body.appendChild(b); b.click(); await wait(20);
  const sh = A.t('sheetIn');
  ck('the (i) button opens the sheet: muscles, how to do it, mistakes, and Form Check', /Hamstrings, glutes/.test(sh) && /Push the hips back/.test(sh) && /Common mistakes/.test(sh) && /Check my form on video/.test(sh));
  ck('an exercise without cues says so and offers Form Check, nothing made up', /no written cues/.test(F.html('Zercher carry')) && /Open Form Check/.test(F.html('Zercher carry')));
  ck('the (i) sits on every exercise in a workout and in the program, with a spoken name', /class="exinfo" data-exinfo="'\+String\(e\.n\)/.test(html) && /class="exinfo" data-exinfo="'\+String\(e\.e\)/.test(html) && /aria-label="How to do '\+String\(e\.n\)/.test(html));

  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
