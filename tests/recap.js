/* KovaRecap (src/p08_recap.js): "How your week connected" on Sundays,
   built from the real correlation engine, personal records, streaks and
   one goal; 9:16 pictures to share; no raw health numbers unless the
   person switches them on. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;

function boot() {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova_mode_v1', 'sample');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document };
}

(async () => {
  const { w, doc } = boot();
  await wait(1000);
  const Rc = w.KovaRecap;
  // a Sunday, and personal records inside that week
  const sun = new Date(); sun.setHours(12, 0, 0, 0); sun.setDate(sun.getDate() - ((sun.getDay() + 7) % 7));
  const wk = Rc.weekOf(sun.getTime());
  ck('the week runs Monday to Sunday', new Date(wk.from).getDay() === 1 && Math.round((wk.to + 1 - wk.from) / DAY) === 7);
  const h = { 'Bench press': [{ t: wk.from - 10 * DAY, e1: 100 }, { t: wk.from + 2 * DAY, e1: 104.5 }], 'Squat': [{ t: wk.from - 5 * DAY, e1: 140 }, { t: wk.from + 3 * DAY, e1: 138 }] };
  w.localStorage.setItem('kova_hist_v1', JSON.stringify(h));
  const r = Rc.build(sun.getTime());
  ck('it uses the real "How it connects" comparisons, up to three', r.links.length >= 1 && r.links.length <= 3 && r.links.every((c) => typeof c.diff === 'number'));
  ck('personal records this week are found (bench up, squat not)', r.prs.length === 1 && r.prs[0].n === 'Bench press' && r.prs[0].up === 5);
  ck('streaks count workouts, food days and nights', typeof r.streaks.workouts === 'number' && typeof r.streaks.foodDays === 'number');
  ck('there is exactly one goal for next week, with its reason', r.goal && r.goal.t && r.goal.why);

  // no raw health numbers by default
  const P = Rc.panes(r);
  const text = P.map((p) => p.big + ' ' + p.line + ' ' + p.foot).join(' | ');
  ck('by default the pictures carry percentages, not hours, minutes or kilos', !/\d+h \d+m|min asleep|\d+(\.\d)?k\b|est\. 1RM/.test(text) && /%/.test(text));
  Rc._S.numbers = true;
  const P2 = Rc.panes(Rc.build(sun.getTime()));
  ck('"Show my numbers" adds them', /est\. 1RM/.test(P2.map((p) => p.line).join(' ')) || /After 7h\+:/.test(P2.map((p) => p.foot).join(' ')));
  Rc._S.numbers = false;
  ck('every picture says a comparison is not a cause', P.filter((p) => p.kind === 'link').every((p) => /not a cause/.test(p.foot)));

  // no card on Today; it opens from "How it connects" and from Settings
  Rc.paintCard(sun.getTime());
  ck('no recap card on Today (less to scroll)', !doc.getElementById('krcCard'));
  Rc.open();
  await wait(30);
  ck('opening it shows every part as a 9:16 card to share', doc.querySelectorAll('#sheetIn .krc-p').length === P.length);
  ck('it is in Settings any day', !!doc.getElementById('krcRow'));
  w.KovaLinks.open(); await wait(20);
  ck('and one tap from "How it connects"', !!doc.querySelector('#sheetIn [data-kl="recap"]'));

  // sharing where the browser cannot draw: honest, no throw
  const ok = await Rc.share(0);
  ck('where pictures cannot be drawn, sharing says so instead of failing silently', ok === false);

  // the Sunday reminder
  Rc.open(); await wait(20);
  doc.getElementById('krcSun').checked = true;
  doc.getElementById('krcSun').dispatchEvent(new w.Event('change'));
  const it = w.KovaPush.items().recap;
  ck('"Remind me every Sunday" adds an 18:00 Sunday-only reminder', it && it.time === '18:00' && JSON.stringify(it.days) === '[0]');
  w.__alerts.reload();
  ck('and it survives the reminder list reloading', !!w.__alerts.get().find((a) => a.id === 'recap'));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
