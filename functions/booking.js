/* booking - your own booking link, like Calendly (Work OS).

   You pick a link name (kova.app/book/isa), what the call is ("Intro
   call"), how long, which days and hours, how far ahead and how much
   notice. Anyone with the link sees only your FREE times, in their own
   time zone: your working hours, minus what is on your Google Calendar
   (when it is connected), minus your Work OS meetings (the app sends
   their times), minus calls already booked. They pick one and leave a
   name and email; then:
     - the time is claimed first, so two people can never book the same slot;
     - with Google connected, the event goes on your calendar with them
       invited, and Google emails them the invite;
     - it lands in your Work OS Meetings and you get a notification.
   You can cancel from the app; the slot opens again and, with Google, they
   are told.

   Nothing private leaves: the page sees your display name, the call's name
   and the free times, never your events or other bookings.

   Stores:
     srv/bookSlug/{slug}          -> uid (who owns a link name)
     srv/bookCfg/{uid}            -> your settings
     srv/bookBusy/{uid}           -> Work OS meeting times the app sent
     srv/bookTimes/{uid}/{start}  -> booking id (the claim)
     users/{uid}/bookings/{id}    -> the bookings */

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const MIN = 60e3, HOUR = 36e5, DAY = 864e5;
const MINS = [15, 20, 30, 45, 60, 90];

class BookError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const hm = (v, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : d);
const toMin = (s) => +s.slice(0, 2) * 60 + +s.slice(3, 5);
const slugOk = (s) => /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(s);
const RESERVED = new Set(['api', 'admin', 'book', 'kova', 'help', 'support', 'login', 'settings', 'www', 'setup', 'busy', 'list', 'cancel']);
const EMAIL = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function validTz(tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; } }

/* minutes the zone is ahead of UTC at an instant */
function offset(t, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t));
  const g = (k) => +p.find((x) => x.type === k).value;
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - Math.floor(t / 1000) * 1000) / MIN;
}
/* a wall-clock time in a zone, as an instant */
function zoned(y, mo, d, mins, tz) {
  const guess = Date.UTC(y, mo, d, 0, mins);
  const o1 = offset(guess, tz);
  let t = guess - o1 * MIN;
  const o2 = offset(t, tz);
  if (o2 !== o1) t = guess - o2 * MIN;
  return t;
}
/* the calendar date in a zone */
function dateIn(t, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(t));
  const g = (k) => +p.find((x) => x.type === k).value;
  return { y: g('year'), m: g('month') - 1, d: g('day') };
}

function cleanCfg(b) {
  b = b || {};
  const slug = str(b.slug, 30).toLowerCase();
  const days = (Array.isArray(b.days) ? b.days : [1, 2, 3, 4, 5]).map(Number).filter((d, i, a) => d >= 0 && d <= 6 && a.indexOf(d) === i).sort();
  const from = hm(b.from, '09:00'), to = hm(b.to, '17:00');
  const tz = validTz(b.tz) ? String(b.tz) : 'UTC';
  return {
    slug, name: str(b.name, 60) || 'Kova user', title: str(b.title, 60) || 'Call',
    mins: MINS.includes(+b.mins) ? +b.mins : 30, days: days.length ? days : [1, 2, 3, 4, 5],
    from, to: toMin(to) > toMin(from) ? to : '17:00', tz,
    ahead: Math.max(1, Math.min(60, Math.round(+b.ahead || 14))),
    buffer: Math.max(0, Math.min(60, Math.round(+b.buffer || 0))),
    notice: Math.max(0, Math.min(72, Math.round(b.notice == null ? 4 : +b.notice))),
    on: b.on !== false
  };
}

function makeBooking(deps) {
  const { db } = deps;
  const tokens = deps.tokens || null, push = deps.push || null;
  const fetch = deps.fetch || ((...a) => global.fetch(...a));
  const now = deps.now || (() => Date.now());
  const iso = (t) => new Date(t).toISOString();

  async function google(uid) {
    if (!tokens) return null;
    try { const t = await tokens.get(uid, 'google'); return /calendar\.events|auth\/calendar(\s|$)/.test(t.scope || '') ? t : null; } catch (e) { return null; }
  }
  async function call(t, url, opts) {
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' }, (opts || {}).headers || {}) }));
    if (!r.ok && r.status !== 404 && r.status !== 410) throw new BookError(502, 'Google Calendar refused (' + r.status + ').');
    return r.status === 204 ? {} : r.json().catch(() => ({}));
  }

  /* ---------------- your settings ---------------- */
  async function setup(uid, body) {
    const c = cleanCfg(body);
    if (!slugOk(c.slug)) throw new BookError(400, 'Pick a link name of 3 to 30 letters, numbers or dashes, like "isa" or "isa-rajput".');
    if (RESERVED.has(c.slug)) throw new BookError(409, 'That link name is taken. Try another.');
    const ref = db.ref(`srv/bookSlug/${c.slug}`);
    const r = await ref.transaction((cur) => (cur == null || cur === uid ? uid : undefined));
    if (!r.committed || r.snapshot.val() !== uid) throw new BookError(409, 'That link name is taken. Try another.');
    const old = (await db.ref(`srv/bookCfg/${uid}`).once('value')).val();
    if (old && old.slug && old.slug !== c.slug) await db.ref(`srv/bookSlug/${old.slug}`).remove();
    await db.ref(`srv/bookCfg/${uid}`).set(c);
    return Object.assign({ path: '/book/' + c.slug, google: !!(await google(uid)) }, c);
  }
  async function get(uid) {
    const c = (await db.ref(`srv/bookCfg/${uid}`).once('value')).val();
    return c ? Object.assign({ path: '/book/' + c.slug, google: !!(await google(uid)) }, c) : { none: true, google: !!(await google(uid)) };
  }
  /* the app sends the times of its Work OS meetings, so they are busy too */
  async function setBusy(uid, body) {
    const t = now();
    const list = (Array.isArray(body && body.busy) ? body.busy : []).map((b) => ({ start: +b.start || 0, end: +b.end || 0 }))
      .filter((b) => b.end > b.start && b.end > t && b.start < t + 61 * DAY && b.end - b.start <= 12 * HOUR).slice(0, 300);
    await db.ref(`srv/bookBusy/${uid}`).set(list);
    return { ok: true, count: list.length };
  }

  async function owner(slug) {
    slug = str(slug, 30).toLowerCase();
    if (!slugOk(slug)) throw new BookError(404, 'No booking page here.');
    const uid = (await db.ref(`srv/bookSlug/${slug}`).once('value')).val();
    if (!uid) throw new BookError(404, 'No booking page here.');
    const c = (await db.ref(`srv/bookCfg/${uid}`).once('value')).val();
    if (!c || !c.on) throw new BookError(404, 'This booking page is closed right now.');
    return { uid, c };
  }

  /* ---------------- the free times ---------------- */
  async function busyOf(uid, c, from, to) {
    const out = [];
    const mine = (await db.ref(`srv/bookBusy/${uid}`).once('value')).val() || [];
    (Array.isArray(mine) ? mine : Object.values(mine)).forEach((b) => out.push({ start: b.start, end: b.end }));
    const taken = (await db.ref(`srv/bookTimes/${uid}`).once('value')).val() || {};
    Object.keys(taken).forEach((k) => { const s = +k, e = +(taken[k] && taken[k].end) || s + c.mins * MIN; out.push({ start: s, end: e }); });
    const g = await google(uid);
    if (g) {
      const q = new URLSearchParams({ timeMin: iso(from), timeMax: iso(to), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
      const list = await call(g, `${CAL}?${q}`, { method: 'GET' });
      (list.items || []).forEach((e) => {
        if (e.status === 'cancelled' || e.transparency === 'transparent') return;
        const s = Date.parse((e.start && (e.start.dateTime || e.start.date)) || ''), en = Date.parse((e.end && (e.end.dateTime || e.end.date)) || '');
        if (s && en) out.push({ start: s, end: en });
      });
    }
    return out;
  }
  function free(c, busy, t) {
    const out = [], step = c.mins * MIN, buf = c.buffer * MIN, earliest = t + c.notice * HOUR;
    const d0 = dateIn(t, c.tz);
    for (let i = 0; i <= c.ahead && out.length < 300; i++) {
      const day = new Date(Date.UTC(d0.y, d0.m, d0.d + i));
      if (!c.days.includes(day.getUTCDay())) continue;
      const y = day.getUTCFullYear(), m = day.getUTCMonth(), d = day.getUTCDate();
      const open = zoned(y, m, d, toMin(c.from), c.tz), close = zoned(y, m, d, toMin(c.to), c.tz);
      for (let s = open; s + step <= close; s += step) {
        if (s < earliest) continue;
        const e = s + step;
        if (busy.some((b) => s < b.end + buf && e > b.start - buf)) continue;
        out.push({ start: s, end: e });
      }
    }
    return out;
  }
  async function slots(slug) {
    const { uid, c } = await owner(slug);
    const t = now();
    const busy = await busyOf(uid, c, t, t + (c.ahead + 1) * DAY);
    return { name: c.name, title: c.title, mins: c.mins, tz: c.tz, slots: free(c, busy, t) };
  }

  /* ---------------- booking one ---------------- */
  async function book(slug, body) {
    const { uid, c } = await owner(slug);
    const b = body || {};
    const name = str(b.name, 80), email = str(b.email, 120).toLowerCase(), note = str(b.note, 600), start = Math.round(+b.start || 0);
    if (!name) throw new BookError(400, 'Add your name.');
    if (!EMAIL.test(email)) throw new BookError(400, 'Check your email address.');
    const t = now();
    const busy = await busyOf(uid, c, t, t + (c.ahead + 1) * DAY);
    const slot = free(c, busy, t).find((x) => x.start === start);
    if (!slot) throw new BookError(409, 'That time was just taken. Pick another.');
    const id = 'bk_' + t.toString(36) + Math.random().toString(36).slice(2, 7);
    /* claim the time first: two people can never get the same slot */
    const claim = await db.ref(`srv/bookTimes/${uid}/${start}`).transaction((cur) => (cur == null ? { id, end: slot.end } : undefined));
    if (!claim.committed) throw new BookError(409, 'That time was just taken. Pick another.');
    const rec = { id, slug: c.slug, title: c.title, start: slot.start, end: slot.end, name, email, note, created: t, state: 'booked', eventId: '' };
    const g = await google(uid);
    if (g) {
      try {
        const made = await call(g, CAL + '?sendUpdates=all', { method: 'POST', body: JSON.stringify({
          summary: `${c.title} with ${name}`, description: (note ? note + '\n\n' : '') + 'Booked through your Kova booking link.',
          start: { dateTime: iso(slot.start) }, end: { dateTime: iso(slot.end) },
          attendees: [{ email, displayName: name }], extendedProperties: { private: { kovaBooking: id } },
          reminders: { useDefault: true } }) });
        rec.eventId = str(made.id, 200);
      } catch (e) { rec.calendarError = 'Not added to Google Calendar: ' + str(e.message, 120); }
    }
    await db.ref(`users/${uid}/bookings/${id}`).set(rec);
    if (push) {
      try {
        const when = new Date(slot.start).toLocaleString('en-US', { timeZone: c.tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        await push.send(uid, { id, kind: 'booking', screen: 'workmeetings', title: 'New booking', body: `${name} · ${c.title}, ${when}` });
      } catch (e) { /* the app still shows it */ }
    }
    return { ok: true, id, title: c.title, with: c.name, start: slot.start, end: slot.end, invited: !!rec.eventId };
  }

  async function list(uid) {
    const all = (await db.ref(`users/${uid}/bookings`).once('value')).val() || {};
    const t = now();
    return Object.values(all).filter((b) => b && b.end > t - DAY).sort((a, b) => a.start - b.start).slice(0, 100);
  }
  async function cancel(uid, id) {
    id = str(id, 40);
    const ref = db.ref(`users/${uid}/bookings/${id}`);
    const rec = (await ref.once('value')).val();
    if (!rec) throw new BookError(404, 'No such booking.');
    if (rec.state === 'cancelled') return { ok: true };
    await ref.update({ state: 'cancelled', cancelled: now() });
    await db.ref(`srv/bookTimes/${uid}/${rec.start}`).remove();
    const g = rec.eventId ? await google(uid) : null;
    if (g) { try { await call(g, `${CAL}/${encodeURIComponent(rec.eventId)}?sendUpdates=all`, { method: 'DELETE' }); } catch (e) { /* the slot is free anyway */ } }
    return { ok: true };
  }

  return { setup, get, setBusy, slots, book, list, cancel, free, owner };
}

module.exports = { makeBooking, BookError, cleanCfg, zoned, offset, dateIn, slugOk, EMAIL };
