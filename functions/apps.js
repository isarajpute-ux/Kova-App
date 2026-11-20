/* apps - what the AI team can see and do in your connected accounts
   (p52, the owner: "how Grok has multiple agents and it connects through all
   your apps... I want all the backend to actually work, where it actually
   does it for you").

   The AI team already acted inside Kova (tasks, Studio, automations), wrote
   Gmail drafts and posted to social accounts. What it could not do was look
   at your real calendar or know which accounts you had linked, so a "plan my
   week" ignored the meetings you really have. Three actions, all through the
   Google link the person already made (no new permission asked):

     connections   which accounts are linked, and what each lets the team do
     calendar_list your Google Calendar events for the next 1 to 14 days
     calendar_add  one event in your primary calendar. The page only sends it
                   after you approve the teammate's proposal; while Kova is
                   closed it is only ever proposed (functions/crew.js).

   Reading Gmail is not here: Google calls gmail.readonly a restricted scope
   and only allows it after an app review, which is the owner's step. */

class AppsError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const DAY = 864e5;

/* what a linked account lets the team do, in plain words */
const CAN = {
  google: (s) => [/calendar/.test(s) && 'read and add calendar events', /gmail\.(compose|send)/.test(s) && 'write Gmail drafts', /youtube/.test(s) && 'read YouTube comments and post videos'].filter(Boolean),
  instagram: () => ['post to Instagram', 'read comments'], facebook: () => ['post to a Facebook Page'], tiktok: () => ['post TikTok videos'],
  linkedin: () => ['post to LinkedIn'], x: () => ['post to X'], threads: () => ['post to Threads'], pinterest: () => ['save Pins'],
  meta_ads: () => ['build Meta ads (saved paused)'], gbp: () => ['read your Google Business profile']
};

function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }

function makeApps(deps) {
  const { tokens } = deps;
  const fetch = deps.fetch || ((...a) => global.fetch(...a));
  const now = deps.now || Date.now;

  async function google(uid) {
    let t;
    try { t = await tokens.get(uid, 'google'); } catch (e) { throw new AppsError(409, 'Google is not connected. Connect it in Work OS, under Accounts.'); }
    if (!/calendar/.test(t.scope || '')) throw new AppsError(409, 'Reconnect Google and allow Kova to see your calendar.');
    return t;
  }
  async function call(t, url, opts) {
    const r = await fetch(url, Object.assign({}, opts, { headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' } }));
    if (r.status === 401 || r.status === 403) throw new AppsError(409, 'Google refused. Reconnect Google in Work OS and allow the calendar.');
    if (!r.ok) throw new AppsError(502, `Google Calendar did not answer (${r.status}).`);
    return r.json().catch(() => ({}));
  }

  async function connections(uid) {
    const st = (tokens.status ? await tokens.status(uid) : {}) || {};
    let gScope = '';
    if (st.google && st.google.linked) { try { gScope = (await tokens.get(uid, 'google')).scope || ''; } catch (e) { gScope = ''; } }
    const out = [];
    Object.keys(st).forEach((k) => {
      const v = st[k];
      if (!v || !v.linked || k === 'youtube') return;
      const can = CAN[k] ? CAN[k](k === 'google' ? gScope : '') : ['linked'];
      out.push({ app: k, account: v.label || '', can: can.length ? can : ['linked'] });
    });
    const missing = Object.keys(st || {}).filter((k) => st[k] && !st[k].linked && st[k].configured !== false && k !== 'youtube').slice(0, 12);
    return { linked: out, not_linked: missing, note: out.length ? '' : 'No accounts are linked yet. The user connects them in Work OS, under Accounts.' };
  }

  async function calendarList(uid, a) {
    const t = await google(uid);
    const days = Math.max(1, Math.min(14, Math.round(+(a && a.days) || 7)));
    const from = now(), to = from + days * DAY;
    const q = new URLSearchParams({ timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '50' });
    const j = await call(t, `${CAL}?${q}`);
    const events = (j.items || []).filter((e) => e && e.status !== 'cancelled').map((e) => ({
      title: clean(e.summary || '(no title)', 120),
      start: (e.start && (e.start.dateTime || e.start.date)) || '',
      end: (e.end && (e.end.dateTime || e.end.date)) || '',
      all_day: !!(e.start && e.start.date && !e.start.dateTime),
      where: clean(e.location, 120),
      kova: !!(e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.kova)
    }));
    return { days, count: events.length, events };
  }

  async function calendarAdd(uid, a) {
    const title = clean(a && a.title, 120);
    const start = Date.parse(a && a.start), end = Date.parse(a && a.end) || (start + 30 * 60e3);
    if (!title) throw new AppsError(400, 'The event needs a title.');
    if (!isFinite(start)) throw new AppsError(400, 'The event needs a start time.');
    if (!(end > start) || end - start > 12 * 3600e3) throw new AppsError(400, 'The end time does not look right.');
    if (start < now() - 3600e3) throw new AppsError(400, 'That time has already passed.');
    const t = await google(uid);
    const body = { summary: title, description: clean(a && a.notes, 1500), start: { dateTime: new Date(start).toISOString() }, end: { dateTime: new Date(end).toISOString() },
      extendedProperties: { private: { kova: 'team' } } };
    const j = await call(t, CAL, { method: 'POST', body: JSON.stringify(body) });
    return { ok: true, id: String(j.id || ''), title, start: body.start.dateTime, end: body.end.dateTime };
  }

  return { connections, calendarList, calendarAdd };
}

module.exports = { makeApps, AppsError };
