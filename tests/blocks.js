/* Work OS for one person: time blocks that follow readiness (src/p08_blocks.js)
   and Google Calendar both ways (functions/calendar.js). */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const { makeCalendar } = require(__dirname + '/../functions/calendar.js');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60000;

function fakeDb() {
  const store = {};
  const get = (p) => { let o = store; for (const k of p.split('/').filter(Boolean)) { if (o == null) return null; o = o[k]; } return o === undefined ? null : JSON.parse(JSON.stringify(o)); };
  const set = (p, v) => { const a = p.split('/').filter(Boolean); let o = store; a.slice(0, -1).forEach((k) => { if (!o[k]) o[k] = {}; o = o[k]; }); if (v == null) delete o[a[a.length - 1]]; else o[a[a.length - 1]] = JSON.parse(JSON.stringify(v)); };
  return { ref: (p) => ({ once: async () => ({ val: () => get(p) }), set: async (v) => set(p, v) }), get };
}

(async () => {
  // ---------- the calendar, both ways ----------
  const db = fakeDb();
  const events = {}; let seq = 0; const calls = [];
  const day = new Date(); day.setHours(0, 0, 0, 0); const D = day.getTime();
  events.meet = { id: 'meet', summary: 'Client call', start: { dateTime: new Date(D + 10 * 3600e3).toISOString() }, end: { dateTime: new Date(D + 11 * 3600e3).toISOString() } };
  const gfetch = async (url, o = {}) => {
    calls.push([o.method, url]);
    const json = (x, s = 200) => ({ ok: s < 400, status: s, json: async () => x });
    const id = decodeURIComponent((url.split('/events/')[1] || '').split('?')[0]);
    if (o.method === 'GET') return json({ items: Object.values(events) });
    if (o.method === 'POST') { const b = JSON.parse(o.body); const e = Object.assign({ id: 'ev' + (++seq) }, b); events[e.id] = e; return json(e); }
    if (o.method === 'PATCH') { Object.assign(events[id], JSON.parse(o.body)); return json(events[id]); }
    if (o.method === 'DELETE') { delete events[id]; return { ok: true, status: 204, json: async () => ({}) }; }
    return json({}, 500);
  };
  const tokens = { get: async () => ({ access_token: 'at', scope: 'openid https://www.googleapis.com/auth/calendar.events' }) };
  const C = makeCalendar({ db, tokens, fetch: gfetch });
  const b1 = { id: 'b-1', title: 'Write the proposal', start: D + 9 * 3600e3, end: D + 10 * 3600e3, why: 'Sharpest window' };
  const r1 = await C.sync('ana', { blocks: [b1], from: D, to: D + 864e5 });
  ck('a block becomes a calendar event, tagged with its Kova id', r1.created === 1 && Object.values(events).some((e) => e.extendedProperties && e.extendedProperties.private.kovaId === 'b-1'));
  ck('other events come back as busy time', r1.busy.length === 1 && r1.busy[0].title === 'Client call');
  const r2 = await C.sync('ana', { blocks: [b1], from: D, to: D + 864e5 });
  ck('syncing again updates the same event, not a copy', r2.created === 0 && r2.updated === 1 && Object.values(events).filter((e) => e.extendedProperties).length === 1);
  const ev = Object.values(events).find((e) => e.extendedProperties);
  ev.start.dateTime = new Date(D + 14 * 3600e3).toISOString(); ev.end.dateTime = new Date(D + 15 * 3600e3).toISOString();
  const r3 = await C.sync('ana', { blocks: [b1], from: D, to: D + 864e5 });
  ck('a block dragged in Google comes back with its new time, and is not moved back', r3.moved.length === 1 && r3.moved[0].start === D + 14 * 3600e3 && Date.parse(ev.start.dateTime) === D + 14 * 3600e3);
  const r4 = await C.sync('ana', { blocks: [], from: D, to: D + 864e5 });
  ck('a block Kova no longer plans leaves the calendar', r4.removed === 1 && !Object.values(events).some((e) => e.extendedProperties));
  let err = null;
  try { await makeCalendar({ db, tokens: { get: async () => ({ access_token: 'x', scope: 'calendar.readonly' }) }, fetch: gfetch }).sync('ana', {}); } catch (e) { err = e; }
  ck('with read-only access it asks to reconnect Google', err && err.status === 403 && /Reconnect Google/.test(err.message));

  // ---------- the plan ----------
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova_mode_v1', 'live');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(600);
  const B = w.KovaBlocks;
  ck('Work > Today has one "Plan my day" button', !!w.document.getElementById('kbPlan'));
  const due = D + 20 * 3600e3;
  const W = w.WorkOS;
  W.create('items', { name: 'Write the investor update', due, cog: 9, status: 'Not started' });
  W.create('items', { name: 'Design the pricing page', due, cog: 8, status: 'Not started' });
  W.create('items', { name: 'Reply to emails', due, cog: 2, status: 'Not started' });
  W.create('items', { name: 'Review the contract', due, cog: 5, status: 'Not started' });
  const at6 = D + 6 * 3600e3;
  // good night: woke 07:00, readiness high
  w.KovaToday.readiness = () => ({ score: 80, sleep: { mins: 480, wake: 7 * 60 }, hrv: 60 });
  let P = B.plan(at6);
  const find = (n) => P.blocks.find((b) => b.title === n);
  const inv = find('Write the investor update');
  ck('deep work lands in the sharpest window (9-11, two to four hours after waking)', inv && new Date(inv.start).getHours() >= 9 && inv.end <= D + 11 * 3600e3);
  ck('on a good day it gets 90 minutes', inv && inv.end - inv.start === 90 * MIN);
  const em = find('Reply to emails');
  ck('light work goes in the after-lunch dip', em && new Date(em.start).getHours() >= 13 && new Date(em.start).getHours() < 15);
  ck('every block says why it sits there', P.blocks.every((b) => b.why.length > 20) && /sharpest window/.test(inv.why));
  ck('blocks never overlap', P.blocks.every((b, i) => i === 0 || b.start >= P.blocks[i - 1].end));
  // low readiness: one short deep block, the rest moves
  w.KovaToday.readiness = () => ({ score: 42, sleep: { mins: 330, wake: 6 * 60 + 30 }, hrv: 30 });
  P = B.plan(at6);
  const deep = P.blocks.filter((b) => b.kind === 'deep');
  ck('on a low-readiness day deep work is one 45-minute block', deep.length === 1 && deep[0].end - deep[0].start === 45 * MIN && /readiness is 42/.test(deep[0].why));
  ck('the other deep task moves to tomorrow, and says why', P.later.length === 1 && /Readiness is 42/.test(P.later[0].why));
  // meetings from the calendar are respected
  w.KovaToday.readiness = () => ({ score: 80, sleep: { mins: 480, wake: 7 * 60 }, hrv: 60 });
  const S = B._S(); S.busy = [{ start: D + 9 * 3600e3, end: D + 10.5 * 3600e3, title: 'Client call' }]; B._set(S);
  P = B.plan(at6);
  ck('no block lands on a meeting', P.blocks.every((b) => !(b.start < D + 10.5 * 3600e3 && b.end > D + 9 * 3600e3)));
  // the sheet
  B.open(); await wait(20);
  const sheetText = w.document.querySelector('#sheetIn .kbk').textContent;
  ck('the plan opens as one sheet with times and reasons (or what moved)', w.document.querySelectorAll('#sheetIn .kbk-b').length === B._S().blocks.length && /Your day, blocked/.test(sheetText) && (B._S().blocks.length === 0 || /window|dip|peak|moved/i.test(sheetText)));
  const css = fs.readFileSync(__dirname + '/../src/p08_billing.js', 'utf8');
  const plans = fs.readFileSync(__dirname + '/../src/p08_plans.js', 'utf8');
  ck('the plan screen sells where you end up, not features or price', /has it handled/.test(plans) && /Where you will be/.test(plans) && !/One person, one price/.test(css + plans));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
