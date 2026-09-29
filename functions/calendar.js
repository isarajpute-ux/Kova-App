/* calendar - Work OS blocks <-> Google Calendar, both ways
   (POST /calendar/sync).

   The page plans the day's blocks (deep work in your sharpest hours,
   light work in the dip, moved when readiness is low) and sends them
   here. Each block becomes an event in your primary calendar, tagged
   with its Kova id in the event's private properties, so:
     - sending again updates the same event instead of adding another;
     - if you drag an event to a new time in Google Calendar, the next
       sync hands the new time back and the page moves the block;
     - your other events come back as busy times, so blocks never land
       on a meeting.
   A block removed in Kova is removed from the calendar too. */

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

class CalError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function cleanBlocks(list) {
  return (Array.isArray(list) ? list : []).slice(0, 30).map((b) => ({
    id: String(b && b.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40),
    title: String(b && b.title || 'Focus').slice(0, 120),
    start: +(b && b.start) || 0, end: +(b && b.end) || 0,
    why: String(b && b.why || '').slice(0, 300)
  })).filter((b) => b.id && b.start > 0 && b.end > b.start && b.end - b.start <= 8 * 3600e3);
}

function makeCalendar(deps) {
  const { db, tokens } = deps;
  const fetch = deps.fetch || ((...a) => global.fetch(...a));
  const iso = (t) => new Date(t).toISOString();

  async function call(t, url, opts) {
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' }, (opts || {}).headers || {}) }));
    if (r.status === 403) throw new CalError(403, 'Reconnect Google and allow Kova to add events to your calendar.');
    if (!r.ok && r.status !== 404 && r.status !== 410) throw new CalError(502, 'Google Calendar refused (' + r.status + ').');
    return r.status === 204 ? {} : r.json().catch(() => ({}));
  }

  async function sync(uid, body) {
    const t = await tokens.get(uid, 'google');
    if (!/calendar\.events|auth\/calendar(\s|$)/.test(t.scope || '')) throw new CalError(403, 'Reconnect Google and allow Kova to add events to your calendar.');
    const blocks = cleanBlocks(body && body.blocks);
    const from = +(body && body.from) || Date.now() - 12 * 3600e3, to = +(body && body.to) || Date.now() + 36 * 3600e3;
    const mapRef = db.ref(`srv/calmap/${uid}`);
    const map = (await mapRef.once('value')).val() || {};

    /* what is on the calendar now, in the window */
    const q = new URLSearchParams({ timeMin: iso(from), timeMax: iso(to), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    const list = await call(t, `${CAL}?${q}`, { method: 'GET' });
    const items = list.items || [];
    const byKova = {}, busy = [];
    items.forEach((e) => {
      const kid = e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.kovaId;
      const s = Date.parse((e.start && (e.start.dateTime || e.start.date)) || ''), en = Date.parse((e.end && (e.end.dateTime || e.end.date)) || '');
      if (kid) byKova[kid] = { ev: e, start: s, end: en };
      else if (e.status !== 'cancelled' && e.transparency !== 'transparent' && s && en && e.start.dateTime) busy.push({ start: s, end: en, title: String(e.summary || 'Busy').slice(0, 80) });
    });

    /* moved in Google since the last sync: Google's time wins */
    const moved = [];
    Object.keys(byKova).forEach((kid) => {
      const k = byKova[kid], m = map[kid];
      if (m && (k.start !== m.start || k.end !== m.end)) moved.push({ id: kid, start: k.start, end: k.end });
    });

    /* write the blocks */
    let created = 0, updated = 0;
    const movedIds = new Set(moved.map((x) => x.id));
    for (const b of blocks) {
      if (movedIds.has(b.id)) continue;                                   // the person moved it; do not move it back
      const ev = { summary: b.title, description: (b.why ? b.why + '\n\n' : '') + 'Planned by Kova.',
        start: { dateTime: iso(b.start) }, end: { dateTime: iso(b.end) },
        extendedProperties: { private: { kovaId: b.id } }, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 5 }] } };
      const have = byKova[b.id] || (map[b.id] && map[b.id].eventId ? { ev: { id: map[b.id].eventId } } : null);
      if (have) { await call(t, `${CAL}/${encodeURIComponent(have.ev.id)}`, { method: 'PATCH', body: JSON.stringify(ev) }); map[b.id] = { eventId: have.ev.id, start: b.start, end: b.end }; updated++; }
      else { const made = await call(t, CAL, { method: 'POST', body: JSON.stringify(ev) }); if (made.id) { map[b.id] = { eventId: made.id, start: b.start, end: b.end }; created++; } }
    }
    moved.forEach((x) => { if (map[x.id]) { map[x.id].start = x.start; map[x.id].end = x.end; } });

    /* blocks Kova no longer plans, in this window: take them off the calendar */
    const keep = new Set(blocks.map((b) => b.id).concat(moved.map((x) => x.id)));
    let removed = 0;
    for (const kid of Object.keys(byKova)) {
      if (keep.has(kid)) continue;
      await call(t, `${CAL}/${encodeURIComponent(byKova[kid].ev.id)}`, { method: 'DELETE' });
      delete map[kid]; removed++;
    }
    await mapRef.set(map);
    return { ok: true, created, updated, removed, moved, busy };
  }

  return { sync, cleanBlocks };
}

module.exports = { makeCalendar, CalError, cleanBlocks };
