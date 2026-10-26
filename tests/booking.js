/* Your booking link, like Calendly (functions/booking.js, the routes in
   api.js, book.html and src/p08_booking.js): free times from your hours in
   your time zone, minus Google Calendar, your Work OS meetings and calls
   already booked; no double booking; Google invites; cancel; the public
   page booking end to end; and bookings arriving in Meetings.
   In-memory database, fake Google; no keys. */
const Module = require('module');
const path = require('path');
const fs = require('fs');

const store = {};
function get(p) { let o = store; for (const k of p.split('/').filter(Boolean)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : JSON.parse(JSON.stringify(o)); }
function set(p, v) { const parts = p.split('/').filter(Boolean); let o = store; parts.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || !o[k]) o[k] = {}; o = o[k]; }); if (v === null || v === undefined) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = JSON.parse(JSON.stringify(v)); }
function ref(p = '') {
  return { child: (c) => ref(p + '/' + c), once: async () => ({ val: () => get(p) }), set: async (v) => set(p, v), remove: async () => set(p, null),
    update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); },
    transaction: async (fn) => { const v = fn(get(p)); if (v !== undefined) set(p, v); return { committed: v !== undefined, snapshot: { val: () => get(p) } }; } };
}
const db = { ref };
Module._load = ((orig) => function (req, ...rest) {
  if (req === 'firebase-admin') return { initializeApp() {}, apps: [{}], database: () => db, messaging: () => null,
    auth: () => ({ verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad'); } }) };
  return orig.call(this, req, ...rest);
})(Module._load);

const FN = path.join(__dirname, '..', 'functions');
const B = require(path.join(FN, 'booking.js'));
const api = require(path.join(FN, 'api.js'));
const R = []; const ck = (n, c) => R.push([n, !!c]);
const MIN = 6e4, HOUR = 36e5, DAY = 864e5;

(async () => {
  /* ---- time zones ---- */
  const ny = B.zoned(2026, 9, 12, 9 * 60, 'America/New_York');
  ck('9:00 in New York on 12 Oct is 13:00 UTC (summer time)', new Date(ny).toISOString() === '2026-10-12T13:00:00.000Z');
  ck('and in January it is 14:00 UTC', new Date(B.zoned(2027, 0, 12, 9 * 60, 'America/New_York')).toISOString() === '2027-01-12T14:00:00.000Z');
  ck('9:00 in Tokyo is midnight UTC', new Date(B.zoned(2026, 9, 12, 9 * 60, 'Asia/Tokyo')).toISOString() === '2026-10-12T00:00:00.000Z');
  ck('names: 3 to 30 letters, numbers or dashes', B.slugOk('isa') && B.slugOk('isa-rajput') && !B.slugOk('ab') && !B.slugOk('-isa') && !B.slugOk('isa_r') && !B.slugOk('Isa'));
  const c0 = B.cleanCfg({ slug: 'ISA', mins: 7, days: [9, 1, 1, 3], from: '18:00', to: '09:00', tz: 'Nowhere/Land', ahead: 400, notice: -3 });
  ck('settings are cleaned: a known length, real days, hours that make sense, a real zone, limits', c0.slug === 'isa' && c0.mins === 30 && c0.days.join() === '1,3' && c0.to === '17:00' && c0.tz === 'UTC' && c0.ahead === 60 && c0.notice === 0);

  /* ---- free times ---- */
  let clock = Date.UTC(2026, 9, 12, 12, 0);            // Mon 12 Oct 2026, 08:00 in New York
  const gEvents = [];
  const gCalls = [];
  const gfetch = async (url, o) => {
    gCalls.push([String(url), o && o.method, o && o.body ? JSON.parse(o.body) : null]);
    if (/events\?/.test(url) && (o.method || 'GET') === 'GET') return { ok: true, status: 200, json: async () => ({ items: gEvents }) };
    if (/sendUpdates=all/.test(url) && o.method === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'gev1' }) };
    if (o.method === 'DELETE') return { ok: true, status: 204, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  let hasGoogle = false;
  const tokens = { get: async () => { if (!hasGoogle) throw new Error('no google'); return { access_token: 't', scope: 'https://www.googleapis.com/auth/calendar.events' }; } };
  const pushed = [];
  const push = { send: async (uid, n) => { pushed.push([uid, n]); return { sent: 1 }; } };
  const M = B.makeBooking({ db, tokens, push, fetch: gfetch, now: () => clock });
  const cfg = await M.setup('u1', { slug: 'isa', name: 'Isa', title: 'Intro call', mins: 30, days: [1, 2, 3, 4, 5], from: '09:00', to: '12:00', tz: 'America/New_York', ahead: 7, notice: 2, buffer: 0 });
  ck('setup: the link name is yours and the settings are saved', cfg.path === '/book/isa' && get('srv/bookSlug/isa') === 'u1' && get('srv/bookCfg/u1').title === 'Intro call');
  let e409 = null; try { await M.setup('u2', { slug: 'isa' }); } catch (e) { e409 = e; }
  ck('setup: someone else cannot take your link name', e409 && e409.status === 409);
  let eRes = null; try { await M.setup('u2', { slug: 'setup' }); } catch (e) { eRes = e; }
  ck('setup: words the server uses are not link names', eRes && eRes.status === 409);
  let s = await M.slots('isa');
  const first = s.slots[0];
  ck('the page sees your name, the call, its length and your zone, and nothing else', s.name === 'Isa' && s.title === 'Intro call' && s.mins === 30 && s.tz === 'America/New_York' && Object.keys(s).length === 5);
  ck('first free time is 10:00 New York (09:00 is inside the 2 hours of notice)', new Date(first.start).toISOString() === '2026-10-12T14:00:00.000Z');
  ck('only weekdays, inside 9 to 12, every 30 minutes', s.slots.every((x) => { const d = new Date(x.start - 4 * HOUR); return d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && d.getUTCHours() >= 9 && d.getUTCHours() < 12 && (x.end - x.start) === 30 * MIN; }));
  ck('Saturday and Sunday have no times', !s.slots.some((x) => [0, 6].includes(new Date(x.start - 4 * HOUR).getUTCDay())));
  /* your Work OS meetings */
  await M.setBusy('u1', { busy: [{ start: Date.UTC(2026, 9, 13, 14, 0), end: Date.UTC(2026, 9, 13, 15, 0) }, { start: 5, end: 3 }] });
  s = await M.slots('isa');
  ck('a Work OS meeting Tue 10-11 New York hides 10:00 and 10:30', !s.slots.some((x) => x.start >= Date.UTC(2026, 9, 13, 14, 0) && x.start < Date.UTC(2026, 9, 13, 15, 0)) && s.slots.some((x) => x.start === Date.UTC(2026, 9, 13, 15, 0)));
  ck('nonsense busy times are dropped', get('srv/bookBusy/u1').length === 1);
  /* Google Calendar */
  hasGoogle = true;
  gEvents.push({ status: 'confirmed', start: { dateTime: '2026-10-14T15:00:00Z' }, end: { dateTime: '2026-10-14T16:00:00Z' } });
  gEvents.push({ status: 'confirmed', transparency: 'transparent', start: { dateTime: '2026-10-14T13:00:00Z' }, end: { dateTime: '2026-10-14T14:00:00Z' } });
  s = await M.slots('isa');
  ck('a Google event Wed 11-12 New York is busy; an event marked "free" is not', !s.slots.some((x) => x.start === Date.UTC(2026, 9, 14, 15, 0)) && s.slots.some((x) => x.start === Date.UTC(2026, 9, 14, 13, 0)));

  /* ---- booking ---- */
  let bad = null; try { await M.book('isa', { start: first.start, name: 'Sam', email: 'not-an-email' }); } catch (e) { bad = e; }
  ck('booking: a bad email is refused', bad && bad.status === 400 && /email/.test(bad.message));
  bad = null; try { await M.book('isa', { start: first.start + 7 * MIN, name: 'Sam', email: 'sam@acme.test' }); } catch (e) { bad = e; }
  ck('booking: only a real free time can be booked', bad && bad.status === 409);
  const bk = await M.book('isa', { start: first.start, name: 'Sam Lee', email: 'Sam@Acme.test', note: 'Pricing questions' });
  ck('booking: it is saved for you', bk.ok && get('users/u1/bookings/' + bk.id).name === 'Sam Lee' && get('users/u1/bookings/' + bk.id).email === 'sam@acme.test');
  const ev = gCalls.filter((c) => /sendUpdates=all/.test(c[0]) && c[1] === 'POST')[0];
  ck('booking: with Google, the event goes on your calendar with them invited (Google emails them)', !!ev && ev[2].attendees[0].email === 'sam@acme.test' && /Intro call with Sam Lee/.test(ev[2].summary) && bk.invited);
  ck('booking: you get a notification that opens Meetings', pushed.some(([u, n]) => u === 'u1' && n.screen === 'workmeetings' && /Sam Lee/.test(n.body)));
  s = await M.slots('isa');
  ck('booking: that time is gone from the page', !s.slots.some((x) => x.start === first.start));
  bad = null; try { await M.book('isa', { start: first.start, name: 'Ana', email: 'ana@acme.test' }); } catch (e) { bad = e; }
  ck('booking: nobody else can book the same time', bad && bad.status === 409 && /just taken/.test(bad.message));
  /* two at once: the claim decides */
  const second = s.slots[0].start;
  const both = await Promise.allSettled([M.book('isa', { start: second, name: 'A', email: 'a@x.test' }), M.book('isa', { start: second, name: 'B', email: 'b@x.test' })]);
  ck('two people booking the same time at once: exactly one gets it', both.filter((r) => r.status === 'fulfilled').length === 1);
  const L = await M.list('u1');
  ck('your list has them, soonest first', L.length === 2 && L[0].start <= L[1].start);
  await M.cancel('u1', bk.id);
  ck('cancel: marked cancelled, the time opens again, and Google is told', get('users/u1/bookings/' + bk.id).state === 'cancelled' && (await M.slots('isa')).slots.some((x) => x.start === first.start) && gCalls.some((c) => c[1] === 'DELETE' && /gev1/.test(c[0])));
  await M.setup('u1', Object.assign({}, get('srv/bookCfg/u1'), { on: false }));
  let closed = null; try { await M.slots('isa'); } catch (e) { closed = e; }
  ck('a closed link says so', closed && closed.status === 404 && /closed/.test(closed.message));
  await M.setup('u1', Object.assign({}, get('srv/bookCfg/u1'), { on: true, slug: 'isa-r' }));
  ck('changing your link name frees the old one', get('srv/bookSlug/isa') === null && get('srv/bookSlug/isa-r') === 'u1');

  /* ---- routes ---- */
  function call(method, url, body, token) {
    const headers = token === null ? {} : { authorization: 'Bearer ' + (token || 'good-u3') };
    const req = { method, path: url, body: body || {}, query: {}, ip: '1.2.3.' + Math.floor(Math.random() * 250), get: (h) => headers[h.toLowerCase()] };
    return new Promise((resolve) => {
      const res = { statusCode: 200, headers: {}, status(s2) { this.statusCode = s2; return this; }, set() { return this; }, json(o) { resolve({ status: this.statusCode, body: o }); }, send(x) { resolve({ status: this.statusCode, body: x }); } };
      api.handle(req, res, { base: 'https://x.test/api', model: 'm' });
    });
  }
  const g0 = await call('GET', '/book/setup');
  ck('route: no link yet says so', g0.status === 200 && g0.body.none);
  const su = await call('POST', '/book/setup', { slug: 'ravi-k', name: 'Ravi', title: 'Chat', mins: 60, days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '23:30', tz: 'UTC', ahead: 3, notice: 0 });
  ck('route: setting up your link needs sign-in and saves it', su.status === 200 && su.body.path === '/book/ravi-k' && (await call('POST', '/book/setup', { slug: 'x-y-z' }, null)).status === 401);
  const pub = await call('GET', '/book/ravi-k', null, null);
  ck('route: the page loads with no sign-in', pub.status === 200 && pub.body.slots.length > 10 && pub.body.name === 'Ravi');
  const pb = await call('POST', '/book/ravi-k', { start: pub.body.slots[2].start, name: 'Jo', email: 'jo@x.test' }, null);
  ck('route: anyone with the link can book', pb.status === 200 && pb.body.ok);
  const lst = await call('GET', '/book/list');
  ck('route: your bookings, signed in', lst.status === 200 && lst.body.items.length === 1 && lst.body.items[0].name === 'Jo');
  ck('route: an unknown link is a 404', (await call('GET', '/book/nobody-here', null, null)).status === 404);
  ck('route: cancel needs sign-in', (await call('POST', '/book/cancel', { id: pb.body.id }, null)).status === 401 && (await call('POST', '/book/cancel', { id: pb.body.id })).status === 200);

  /* ---- the public page ---- */
  const { JSDOM, VirtualConsole } = require('jsdom');
  const page = fs.readFileSync(path.join(__dirname, '..', 'book.html'), 'utf8');
  const vc = new VirtualConsole(); const perr = []; vc.on('jsdomError', (e) => perr.push(e.message));
  const posts = [];
  const pdom = new JSDOM(page, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://kova.test/book/ravi-k', virtualConsole: vc,
    beforeParse(win) {
      win.fetch = (u, o) => {
        if (o && o.method === 'POST') { posts.push([u, JSON.parse(o.body)]); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, id: 'bk_1', title: 'Chat', with: 'Ravi', start: pub.body.slots[5].start, end: pub.body.slots[5].end, invited: true }) }); }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(pub.body) });
      };
    } });
  await new Promise((r) => setTimeout(r, 150));
  const pd = pdom.window.document;
  ck('page: it reads the link name from the address and shows the call', /Chat with/.test(pd.getElementById('hTitle').textContent) && /Ravi/.test(pd.getElementById('hTitle').textContent) && /60 minutes/.test(pd.getElementById('hSub').textContent));
  ck('page: days to pick from, the first one chosen, and its times', pd.querySelectorAll('#days .day').length >= 1 && pd.querySelectorAll('#days .day.on').length === 1 && pd.querySelectorAll('#times .time').length >= 1);
  ck('page: the form waits until a time is picked', pd.getElementById('form').hidden);
  pd.querySelectorAll('#times .time')[0].dispatchEvent(new pdom.window.MouseEvent('click', { bubbles: true }));
  ck('page: picking a time shows the form with the time written out', !pd.getElementById('form').hidden && /min/.test(pd.getElementById('picked').textContent));
  pd.getElementById('fName').value = 'Jo'; pd.getElementById('fEmail').value = 'bad';
  pd.getElementById('form').dispatchEvent(new pdom.window.Event('submit', { bubbles: true, cancelable: true }));
  ck('page: a bad email is caught before sending', /email/.test(pd.getElementById('fMsg').textContent) && !posts.length);
  pd.getElementById('fEmail').value = 'jo@x.test'; pd.getElementById('fNote').value = 'Hi';
  pd.getElementById('form').dispatchEvent(new pdom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 50));
  ck('page: booking sends the time, name, email and note to /api/book/ravi-k', posts.length === 1 && /\/api\/book\/ravi-k$/.test(posts[0][0]) && posts[0][1].name === 'Jo' && posts[0][1].email === 'jo@x.test' && posts[0][1].note === 'Hi');
  ck('page: then "You’re booked" with the invite on its way and a calendar file to save', !pd.getElementById('done').hidden && /invite is on its way to jo@x\.test/.test(pd.getElementById('dMail').textContent) && !!pd.getElementById('dIcs'));
  ck('page: light and dark, and it never comes from the app’s offline cache', /prefers-color-scheme:light/.test(page) && /\\\/book\(\\\.html\|\\\/\)/.test(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8')));
  ck('page: Vercel and Netlify send /book/<name> to it', /"\/book\/:slug", "destination": "\/book\.html"/.test(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8')) && /\/book\/\*  \/book\.html  200/.test(fs.readFileSync(path.join(__dirname, '..', '_redirects'), 'utf8')));
  ck('page: no errors', perr.length === 0);

  /* ---- in the app: Meetings ---- */
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const vc2 = new VirtualConsole(); const aerr = []; vc2.on('jsdomError', (e) => aerr.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc2 });
  const w = dom.window;
  const user = { uid: 'u1', getIdToken: () => Promise.resolve('t') };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: user, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} }), functions: () => ({ httpsCallable: () => () => Promise.resolve({ data: { text: '' } }) }) };
  const sent = []; let setupBody = null;
  let items = [{ id: 'bk_a', title: 'Intro call', name: 'Sam Lee', email: 'sam@acme.test', note: 'Pricing', start: Date.now() + DAY, end: Date.now() + DAY + 30 * MIN, state: 'booked' }];
  const reply = (j, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(j) });
  w.fetch = (u, o) => {
    u = String(u); const b = o && o.body && typeof o.body === 'string' ? JSON.parse(o.body) : null; sent.push([u, b]);
    if (/\/book\/setup$/.test(u) && b) { setupBody = b; return reply(Object.assign({ path: '/book/' + b.slug, google: true }, b)); }
    if (/\/book\/setup$/.test(u)) return reply(setupBody ? Object.assign({ path: '/book/' + setupBody.slug, google: true }, setupBody) : { none: true, google: true });
    if (/\/book\/list$/.test(u)) return reply({ items });
    if (/\/book\/busy$/.test(u)) return reply({ ok: true, count: b.busy.length });
    if (/\/book\/cancel$/.test(u)) return reply({ ok: true });
    return reply({});
  };
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.tours.v1', JSON.stringify({ workmeetings: 1, workmeeting: 1, work: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  await new Promise((r) => setTimeout(r, 2000));
  const FB = w.KOVA_FB; if (FB) { FB.ok = true; if (FB.auth) FB.auth.currentUser = user; }
  const doc = w.document, K = w.KovaBook, WO = w.WorkOS;
  w.go('workmeetings'); await new Promise((r) => setTimeout(r, 100));
  await K.refresh(true); await new Promise((r) => setTimeout(r, 50));
  const card = () => doc.querySelector('#wmBody .kbk');
  ck('app: Meetings has a "Your booking link" card, offering to set one up', !!card() && /Set up my link/.test(card().textContent));
  card().querySelector('[data-kb="setup"]').click(); await new Promise((r) => setTimeout(r, 30));
  ck('app: setup opens in a pop-up with link, name, call, length, days and hours', !!doc.getElementById('kbkS') && !!doc.getElementById('kbkSlug') && doc.querySelectorAll('#kbkMins [data-m]').length === 6 && doc.querySelectorAll('#kbkDays [data-d]').length === 7);
  doc.getElementById('kbkSlug').value = 'Isa Rajput!'; doc.getElementById('kbkSlug').dispatchEvent(new w.Event('input'));
  ck('app: the link name is tidied as you type', doc.getElementById('kbkSlug').value === 'isa-rajput-');
  doc.querySelector('#kbkMins [data-m="45"]').click();
  doc.querySelector('#kbkDays [data-d="6"]').click();
  doc.querySelector('#kbkS [data-ks="save"]').click(); await new Promise((r) => setTimeout(r, 60));
  ck('app: saving sends your choices and your time zone', setupBody && setupBody.slug === 'isa-rajput' && setupBody.mins === 45 && setupBody.days.includes(6) && !!setupBody.tz);
  ck('app: the card then shows your link with Copy, Share and Edit', /\/book\/isa-rajput/.test(card().textContent) && !!card().querySelector('[data-kb="copy"]') && !!card().querySelector('[data-kb="share"]'));
  ck('app: a booking arrives as a Work OS meeting, with their note as prep', WO.list('meetings', (m) => m.bookingId === 'bk_a' && m.title === 'Intro call with Sam Lee' && /Pricing/.test(m.prep)).length === 1);
  const mine = WO.create('meetings', { title: 'Board review', at: Date.now() + 2 * DAY, prep: '', notes: '' }, 'user');
  K._S.busySig = ''; await K.sendBusy();
  const bz = sent.filter((x) => /\/book\/busy$/.test(x[0])).pop();
  ck('app: your own meetings are sent as busy times (not the booked ones)', bz && bz[1].busy.some((b) => b.start === mine.at) && !bz[1].busy.some((b) => b.start === items[0].start));
  K.paint();
  ck('app: the card lists the booking', /Sam Lee/.test(card().textContent) && /Booked \(1\)/.test(card().textContent));
  card().querySelector('[data-kb="cancel"]').click(); await new Promise((r) => setTimeout(r, 10));
  ck('app: cancel asks for a second tap', /Tap again to cancel/.test(card().textContent) && !sent.some((x) => /\/book\/cancel$/.test(x[0])));
  card().querySelector('[data-kb="cancel"]').click(); await new Promise((r) => setTimeout(r, 50));
  ck('app: the second tap cancels, and the meeting goes from Meetings', sent.some((x) => /\/book\/cancel$/.test(x[0]) && x[1].id === 'bk_a') && WO.list('meetings', (m) => m.bookingId === 'bk_a').length === 0);
  ck('app: styles for dark, soft light and light glass', /body\.light-mode \.kbk/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'p08_booking.css'), 'utf8')) && /body\.soft-light \.kbk/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'p08_booking.css'), 'utf8')));
  const abad = aerr.filter((e) => !/Not implemented|Could not parse CSS|csstree/i.test(e));
  ck('app: no page errors', abad.length === 0);
  if (abad.length) console.log(abad.slice(0, 5).join('\n'));

  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
