/* p52: the AI team in your linked accounts (functions/apps.js, POST /crew/apps, the read_calendar and add_calendar_event tools). */
const Module = require('module');
const path = require('path');

const store = {};
function get(p) {
  let o = store;
  for (const k of p.split('/').filter(Boolean)) { if (o == null || typeof o !== 'object') return null; o = o[k]; }
  return o === undefined ? null : JSON.parse(JSON.stringify(o));
}
function set(p, v) {
  const parts = p.split('/').filter(Boolean);
  let o = store;
  parts.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || !o[k]) o[k] = {}; o = o[k]; });
  if (v === null || v === undefined) delete o[parts[parts.length - 1]];
  else o[parts[parts.length - 1]] = JSON.parse(JSON.stringify(v));
}
function ref(p = '') {
  return {
    child: (c) => ref(p + '/' + c), once: async () => ({ val: () => get(p) }), set: async (v) => set(p, v), remove: async () => set(p, null),
    update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); },
    transaction: async (fn) => { const v = fn(get(p)); if (v !== undefined) set(p, v); return { committed: v !== undefined, snapshot: { val: () => get(p) } }; }
  };
}
const fakeDb = { ref };
Module._load = ((orig) => function (req, ...rest) {
  if (req === 'firebase-admin') return { initializeApp() {}, apps: [{}], database: () => fakeDb,
    auth: () => ({ verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad'); } }) };
  return orig.call(this, req, ...rest);
})(Module._load);

const FN = path.join(__dirname, '..', 'functions');
const C = require(path.join(FN, 'crew.js'));
const api = require(path.join(FN, 'api.js'));
const T = []; const ck = (n, c) => T.push([n, !!c]);
const DAY = 864e5;
function call(method, url, { body, token } = {}) {
  const headers = {}; if (token) headers.authorization = 'Bearer ' + token;
  const req = { method, path: url, body: body || {}, query: {}, ip: '1.2.3.4', get: (h) => headers[h.toLowerCase()] };
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, status(s) { this.statusCode = s; return this; }, set(k, v) { this.headers[k] = v; return this; },
      json(o) { resolve({ status: this.statusCode, body: o }); }, send(t) { resolve({ status: this.statusCode, body: t }); } };
    api.handle(req, res, { base: 'https://x.test/api', model: 'm' });
  });
}
const { makeApps, AppsError } = require(path.join(FN, 'apps.js'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const NOW = Date.parse('2026-11-20T15:00:00Z');
  const seen = [];
  const tokens = {
    status: async () => ({ google: { linked: true, label: 'isa@example.com' }, instagram: { linked: true, label: '@kova' }, tiktok: { linked: false }, youtube: { linked: true } }),
    get: async (uid, k) => { if (k !== 'google') throw new Error('no'); return { access_token: 'g-token', scope: 'openid https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.compose' }; }
  };
  const gfetch = async (url, o = {}) => {
    seen.push({ url: String(url), o });
    if (o.method === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'ev1' }) };
    return { ok: true, status: 200, json: async () => ({ items: [
      { summary: 'Physics test', start: { dateTime: '2026-11-21T14:00:00Z' }, end: { dateTime: '2026-11-21T15:00:00Z' }, location: 'Room 4' },
      { summary: 'Gone', status: 'cancelled', start: { dateTime: '2026-11-22T14:00:00Z' } },
      { summary: 'Holiday', start: { date: '2026-11-26' }, end: { date: '2026-11-27' } }] }) };
  };
  const A = makeApps({ tokens, fetch: gfetch, now: () => NOW });

  const c = await A.connections('u1');
  ck('connections: what is linked and what each lets the team do, in plain words', c.linked.length === 2 && c.linked[0].app === 'google' && c.linked[0].can.includes('read and add calendar events') && c.linked[0].can.includes('write Gmail drafts') && c.linked[1].can.includes('post to Instagram'));
  ck('…and what is not linked yet', c.not_linked.includes('tiktok') && !c.linked.some((x) => x.app === 'youtube'));

  const L = await A.calendarList('u1', { days: 99 });
  const q = new URL(seen[0].url);
  ck('calendar: reads the primary calendar with your Google sign-in, at most 14 days ahead', /calendars\/primary\/events/.test(q.pathname) && seen[0].o.headers.authorization === 'Bearer g-token' && L.days === 14 && Date.parse(q.searchParams.get('timeMax')) - NOW === 14 * 864e5);
  ck('…cancelled events left out, all-day events marked', L.count === 2 && L.events[0].title === 'Physics test' && L.events[0].where === 'Room 4' && L.events[1].all_day === true);

  const add = await A.calendarAdd('u1', { title: 'Cancel the Get Hooked trial', start: '2026-11-25T15:00:00Z' });
  const sentBody = JSON.parse(seen[seen.length - 1].o.body);
  ck('adding: one event, 30 minutes by default, marked as made by the team', add.ok && add.id === 'ev1' && Date.parse(sentBody.end.dateTime) - Date.parse(sentBody.start.dateTime) === 30 * 60e3 && sentBody.extendedProperties.private.kova === 'team');
  const bad = async (a) => { try { await A.calendarAdd('u1', a); return null; } catch (e) { return e; } };
  const e1 = await bad({ start: '2026-11-25T15:00:00Z' }), e2 = await bad({ title: 'x', start: 'soon' }), e3 = await bad({ title: 'x', start: '2026-11-19T10:00:00Z' }), e4 = await bad({ title: 'x', start: '2026-11-25T15:00:00Z', end: '2026-11-26T15:00:00Z' });
  ck('…a missing title or start, a time already passed, or an end over 12 hours later is refused before Google is asked', [e1, e2, e3, e4].every((e) => e instanceof AppsError && e.status === 400));
  const noCal = makeApps({ tokens: { get: async () => ({ access_token: 't', scope: 'openid' }) }, fetch: gfetch, now: () => NOW });
  let e5 = null; try { await noCal.calendarList('u1', {}); } catch (e) { e5 = e; }
  ck('without calendar permission it says to reconnect Google', e5 && e5.status === 409 && /Reconnect Google/.test(e5.message));
  const refused = makeApps({ tokens, fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }), now: () => NOW });
  let e6 = null; try { await refused.calendarList('u1', {}); } catch (e) { e6 = e; }
  ck('if Google refuses, it says so plainly', e6 && e6.status === 409 && /Google refused/.test(e6.message));

  // the route
  ck('/crew/apps needs sign-in', (await call('POST', '/crew/apps', { body: { action: 'connections' } })).status === 401);
  const r1 = await call('POST', '/crew/apps', { token: 'good-u1', body: { action: 'nope' } });
  ck('/crew/apps asks which action', r1.status === 400 && /connections, calendar_list or calendar_add/.test(r1.body.error));
  const r2 = await call('POST', '/crew/apps', { token: 'good-u1', body: { action: 'calendar_list' } });
  ck('/crew/apps: with Google not linked, a plain reason (not a crash)', r2.status === 409 || r2.status === 503);

  // routines while Kova is closed: the calendar is read for real, adding is only proposed
  ck('routines: read_calendar is a reading tool every teammate has', C.toolsFor({ tools: [] }).includes('read_calendar') && !C.TOOLS.read_calendar.propose);
  ck('routines: add_calendar_event is only proposed, for teammates with tasks', C.TOOLS.add_calendar_event.propose === true && C.toolsFor({ tools: ['tasks'] }).includes('add_calendar_event') && !C.toolsFor({ tools: [] }).includes('add_calendar_event'));
  const src = require('fs').readFileSync(path.join(FN, 'netlify.js'), 'utf8');
  ck('the timer gives routines the Google sign-in to read the calendar', /crew\(\{[^)]*tokens: mods\.oauth/.test(src));

  // the page's teammates
  const page = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'p08_crew.js'), 'utf8');
  ck('in the app: connected_apps and read_calendar read, add_calendar_event waits for your OK', /connected_apps:\{g:'read', ?kind:'read'/.test(page.replace(/\s+/g, ' ')) && /read_calendar:\{g:'read', ?kind:'read'/.test(page.replace(/\s+/g, ' ')) && /add_calendar_event:\{g:'tasks', ?kind:'external'/.test(page.replace(/\s+/g, ' ')));
  ck('…offline it says so instead of failing', /You are offline right now; linked accounts are read once you are back online/.test(page));

  // the page: the teammates' tools really call the server
  const { JSDOM, VirtualConsole } = require('jsdom');
  const html = require('fs').readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const vc = new VirtualConsole(); const errs = []; vc.on('jsdomError', (e) => errs.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova.auth.skipped', '1'); w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(900);
  const posted = [];
  w.KovaLink.authFetch = (p, o) => { posted.push([p, o.json]); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(o.json.action === 'calendar_list' ? { days: 3, count: 1, events: [{ title: 'Physics test', start: '2026-11-21T14:00:00Z' }] } : { ok: true, title: o.json.title, start: o.json.start }) }); };
  const KT = w.KovaCrew.TOOLS;
  const rl = await KT.read_calendar.run({ days: 3 });
  ck('in the app: read_calendar asks the server for the real calendar', posted[0][0] === '/crew/apps' && posted[0][1].action === 'calendar_list' && posted[0][1].days === 3 && rl.count === 1);
  const ra = await KT.add_calendar_event.run({ title: 'Cancel the trial', start: '2026-11-25T15:00:00Z' });
  ck('…add_calendar_event adds it once approved, and says what was added', posted[1][1].action === 'calendar_add' && ra.ok && /Added “Cancel the trial” to your calendar/.test(KT.add_calendar_event.label(ra, { title: 'Cancel the trial', start: '2026-11-25T15:00:00Z' })));
  ck('…and it is an "external" step, so it waits for your OK', KT.add_calendar_event.kind === 'external');
  Object.defineProperty(w.navigator, 'onLine', { value: false, configurable: true });
  const off = await KT.read_calendar.run({ days: 3 });
  ck('…offline it answers with a plain reason and sends nothing', /offline/.test(off.error) && posted.length === 2);
  ck('no page errors', errs.length === 0 || (console.error(errs.slice(0, 4)), false));

  T.forEach((r) => console.log((r[1] ? 'ok   ' : 'FAIL ') + r[0]));
  const f = T.filter((r) => !r[1]).length;
  console.log(f ? f + ' failed' : 'all ' + T.length + ' passed');
  process.exit(f ? 1 : 0);
})();
