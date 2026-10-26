/* push - reminders that arrive with the app closed.

   Before this, bedtime, water, meds and meal reminders were timers in
   the page: they fired only while Kova was open. Now the page registers
   each device's push token (Firebase Cloud Messaging - free on the Spark
   plan) and keeps a copy of the reminder list on the server; a
   scheduled function checks every 5 minutes who is due, in their own
   time zone, outside their quiet hours, and sends it.

   Every notification carries the screen it belongs to, so tapping it
   opens that screen.

     srv/devices/{uid}/{hash}   = {token, platform, at}
     srv/reminders/{uid}        = {tz, quiet:{from,to}, items:{id:{...}}}

   Tokens live under srv/, which the database rules close to clients. */

const crypto = require('crypto');
const W = require('./wellness');

const KINDS = ['bedtime', 'wind_down', 'water', 'meds', 'meal', 'workout', 'weigh_in', 'glp1', 'custom', 'today', 'recap', 'task'];
const SCREENS = /^[a-z][a-z0-9_-]{0,30}$/;
/* Kova's one alert sound (src/p08_chime.js): the phone has kova_kova.wav
   and, on Android, a kova_kova channel that plays it. Every push uses it. */
const SOUNDS = ['kova'];
function soundOpts() {
  return { apns: { payload: { aps: { sound: 'kova_kova.wav' } } }, android: { priority: 'high', notification: { channelId: 'kova_kova' } } };
}
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : -1; };
const WINDOW = 10;                   // minutes after the set time a reminder may still go out

function cleanItem(x) {
  x = x || {};
  const t = hm(x.time);
  if (t < 0) return null;
  const days = Array.isArray(x.days) ? x.days.map(Number).filter((d) => d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6];
  return {
    kind: KINDS.includes(x.kind) ? x.kind : 'custom',
    title: String(x.title || 'Kova').slice(0, 60),
    body: String(x.body || '').slice(0, 160),
    time: String(x.time),
    days: days.length ? Array.from(new Set(days)).sort() : [0, 1, 2, 3, 4, 5, 6],
    on: x.on !== false,
    screen: SCREENS.test(String(x.screen || '')) ? String(x.screen) : 'home',
    /* p44: a one-off on its own date (a task's reminder), YYYY-MM-DD in the person's time zone */
    ...(/^\d{4}-\d{2}-\d{2}$/.test(String(x.date || '')) ? { date: String(x.date) } : {})
  };
}

function cleanList(b) {
  b = b || {};
  const items = {};
  const src = b.items && typeof b.items === 'object' ? b.items : {};
  Object.keys(src).slice(0, 40).forEach((id) => {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return;
    const it = cleanItem(src[id]);
    if (it) items[id] = it;
  });
  const q = b.quiet || {};
  const quiet = hm(q.from) >= 0 && hm(q.to) >= 0 ? { from: q.from, to: q.to } : null;
  const tz = typeof b.tz === 'string' && b.tz.length <= 64 ? b.tz : 'UTC';
  const sound = 'kova';
  return { tz, quiet, sound, items };
}

function inQuiet(quiet, mins) {
  if (!quiet) return false;
  const a = hm(quiet.from), b = hm(quiet.to);
  if (a === b) return false;
  return a < b ? mins >= a && mins < b : mins >= a || mins < b;
}

const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/* which reminders are due at time t for one person's list */
function dueItems(list, sent, t) {
  const L = W.local(t, list.tz || 'UTC');
  const dow = DOW[L.weekday];
  const out = [];
  Object.keys(list.items || {}).forEach((id) => {
    const it = list.items[id];
    if (!it || !it.on || !it.days.includes(dow)) return;
    if (it.date && it.date !== L.date) return;                 // a one-off: only on its day
    const at = hm(it.time);
    if (L.mins < at || L.mins >= at + WINDOW) return;
    if ((sent || {})[id] === L.date) return;                  // once a day
    if (inQuiet(list.quiet, L.mins) && it.kind !== 'bedtime' && it.kind !== 'wind_down') return;
    out.push({ id, it, date: L.date });
  });
  return out;
}

function makePush(deps) {
  const { db, messaging, cfg } = deps;
  const now = deps.now || Date.now;
  const base = () => ((cfg && cfg.base) || '').replace(/\/api$/, '');

  async function register(uid, b) {
    const token = String((b && b.token) || '');
    if (token.length < 20 || token.length > 4096) throw Object.assign(new Error('Bad token.'), { status: 400 });
    const platform = ['web', 'ios', 'android'].includes(b.platform) ? b.platform : 'web';
    const k = crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
    await db.ref(`srv/devices/${uid}/${k}`).set({ token, platform, at: now() });
    return { ok: true, device: k };
  }
  async function unregister(uid, b) {
    const token = String((b && b.token) || '');
    const k = crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
    await db.ref(`srv/devices/${uid}/${k}`).remove();
    return { ok: true };
  }
  async function save(uid, b) {
    const list = cleanList(b);
    const prev = (await db.ref(`srv/reminders/${uid}`).once('value')).val() || {};
    await db.ref(`srv/reminders/${uid}`).set(Object.assign(list, { sent: prev.sent || {}, at: now() }));
    return { ok: true, count: Object.keys(list.items).length };
  }

  async function send(uid, note) {
    const dev = (await db.ref(`srv/devices/${uid}`).once('value')).val() || {};
    const keys = Object.keys(dev);
    if (!keys.length) return { sent: 0 };
    const link = `${base()}/?go=${encodeURIComponent(note.screen)}`;
    const r = await messaging.sendEachForMulticast({
      tokens: keys.map((k) => dev[k].token),
      notification: { title: note.title, body: note.body },
      data: { screen: note.screen, rid: note.id || '', kind: note.kind || '' },
      webpush: { fcmOptions: { link }, notification: { icon: '/icon-192.png', badge: '/icon-192.png', tag: 'kova-' + (note.id || note.kind) } },
      ...soundOpts(note.sound)
    });
    /* forget devices the push service says are gone */
    (r.responses || []).forEach((x, i) => {
      const code = x && x.error && x.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        db.ref(`srv/devices/${uid}/${keys[i]}`).remove();
      }
    });
    return { sent: r.successCount || 0 };
  }

  /* the 5-minute tick */
  async function tick() {
    const t = now();
    const all = (await db.ref('srv/reminders').once('value')).val() || {};
    let n = 0;
    for (const uid of Object.keys(all)) {
      const list = all[uid] || {};
      for (const d of dueItems(list, list.sent, t)) {
        await db.ref(`srv/reminders/${uid}/sent/${d.id}`).set(d.date);   // mark first: never twice
        try { n += (await send(uid, Object.assign({ id: d.id, sound: list.sound }, d.it))).sent; }
        catch (e) { console.error('push', uid, d.id, e.message); }
      }
    }
    return { sent: n };
  }

  return { register, unregister, save, send, tick };
}

module.exports = { makePush, cleanList, cleanItem, dueItems, inQuiet, KINDS, SOUNDS, soundOpts };
