/* The seven wellness metrics the agent audits, read from what the app has
   already synced - nothing here asks the person for anything new.

     Vitals & workout   1 resting heart rate   2 HRV   3 training load
     Sleep              4 sleep duration       5 bedtime consistency
     Fuel               6 food (protein and calories)   7 hydration

   Where the numbers come from (all written by the app or the watch sync):
     users/{uid}/store/kova_health_v2     latest watch values + baselines
     users/{uid}/store/kova_sleeplog_v1   one entry per night
     users/{uid}/store/kova_log_v1        one entry per workout
     users/{uid}/store/kova_profile_v2    food log, water, plan, body weight
     srv/health/{uid}                     the Apple Health relay's latest
     srv/healthDays/{uid}/{YYYY-MM-DD}    the relay's one-row-per-day history

   Every metric says how fresh its data is, so "no data for three days" is
   a finding of its own (neglect), not a silent zero. Pure functions - the
   tests feed them plain objects. */

const DAY = 864e5;

const METRICS = [
  { id: 'rhr',        n: 'Resting heart rate',   cat: 'vitals', catN: 'Vitals & workout' },
  { id: 'hrv',        n: 'HRV',                  cat: 'vitals', catN: 'Vitals & workout' },
  { id: 'training',   n: 'Training load',        cat: 'vitals', catN: 'Vitals & workout' },
  { id: 'sleep',      n: 'Sleep duration',       cat: 'sleep',  catN: 'Sleep' },
  { id: 'bedtime',    n: 'Bedtime consistency',  cat: 'sleep',  catN: 'Sleep' },
  { id: 'food',       n: 'Protein and calories', cat: 'fuel',   catN: 'Fuel' },
  { id: 'hydration',  n: 'Hydration',            cat: 'fuel',   catN: 'Fuel' }
];
const IDS = METRICS.map((m) => m.id);
const WINDOWS = ['morning', 'evening', 'night'];

/* ---------------------------------------------------------------- time */
/* the person's local clock, from their IANA zone (sent by the app) */
function local(now, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date(now));
  } catch (e) { return local(now, 'UTC'); }
  const g = (t) => (parts.find((p) => p.type === t) || {}).value;
  const hour = (+g('hour')) % 24, minute = +g('minute');
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour, minute, mins: hour * 60 + minute,
           weekday: g('weekday'), tz: tz || 'UTC', text: `${g('weekday')} ${g('hour')}:${g('minute')}` };
}
/* the person's "day" turns over at 4am, so a night audit at 00:30 still
   belongs to the evening before */
function dayOf(t, tz) { return local(t - 4 * 3600e3, tz).date; }
/* morning 04:00-11:59, evening 12:00-20:59, night 21:00-03:59 */
function windowOf(mins) {
  if (mins >= 240 && mins < 720) return 'morning';
  if (mins >= 720 && mins < 1260) return 'evening';
  return 'night';
}

/* ---------------------------------------------------------------- read */
function parse(v) {
  if (v == null) return null;
  if (typeof v === 'object' && typeof v.v === 'string') { try { return JSON.parse(v.v); } catch (e) { return null; } }
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } }
  return v;
}
async function gather(db, uid, now) {
  const val = async (p) => (await db.ref(p).once('value')).val();
  const [store, relay, days] = await Promise.all([
    val(`users/${uid}/store`), val(`srv/health/${uid}`), val(`srv/healthDays/${uid}`)
  ]);
  const s = store || {};
  const profile = parse(s.kova_profile_v2) || {};
  return {
    health: parse(s.kova_health_v2) || {},
    sleeplog: parse(s.kova_sleeplog_v1) || {},
    sessions: parse(s.kova_log_v1) || [],
    profile,
    relay: relay || {},
    days: days || {},
    now
  };
}

/* ---------------------------------------------------------------- math */
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : (typeof x === 'string' && x.trim() && isFinite(+x) ? +x : null));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(mean(a.map((x) => (x - m) * (x - m)))) : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const pct = (a, b) => (a == null || !b ? null : Math.round((a / b - 1) * 100));
function daysAgo(now, t) { return t ? Math.floor((now - t) / DAY) : null; }
/* "7h 20m", "440", 440 -> minutes */
function toMins(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v > 24 ? Math.round(v) : Math.round(v * 60);
  const s = String(v);
  const hm = s.match(/(\d+)\s*h(?:\s*(\d+)\s*m)?/i);
  if (hm) return +hm[1] * 60 + (+hm[2] || 0);
  const n = num(s);
  return n == null ? null : (n > 24 ? Math.round(n) : Math.round(n * 60));
}
/* minutes after 18:00, so 23:30 and 00:30 are an hour apart, not 23 */
function bedMins(v) {
  if (v == null) return null;
  let h, m;
  if (typeof v === 'number' && v > 1e11) { const d = new Date(v); h = d.getHours(); m = d.getMinutes(); }
  else {
    const x = String(v).trim().match(/^(\d{1,2}):(\d{2})\s*([ap])?/i);
    if (!x) return null;
    h = +x[1]; m = +x[2];
    if (x[3]) h = h % 12 + (/p/i.test(x[3]) ? 12 : 0);      // "12:15 a" is 00:15, "11:20 p" is 23:20
  }
  return ((h * 60 + m) - 18 * 60 + 1440) % 1440;
}

/* history of one relay field, newest last, from srv/healthDays */
function series(days, field, now, n) {
  return Object.keys(days || {}).sort()
    .filter((k) => Date.parse(k + 'T12:00:00Z') > now - (n + 1) * DAY)
    .map((k) => num((days[k] || {})[field])).filter((x) => x != null);
}
function latest(d, field) {
  const a = num(((d.relay || {}).f || {})[field]);
  const b = num(((d.health || {}).f || {})[field]);
  const ta = (d.relay || {}).ts || 0, tb = (d.health || {}).ts || 0;
  if (a != null && (b == null || ta >= tb)) return { v: a, t: ta };
  if (b != null) return { v: b, t: tb };
  return { v: null, t: 0 };
}

/* ---------------------------------------------------------------- cycle phase
   From the cycle tracker's period days (synced only if the person chose
   to). A higher resting heart rate and lower HRV are normal in the luteal
   phase, so the audit widens its limits there instead of calling it a fix. */
function cyclePhase(cy, now) {
  if (!cy || !cy.on || !cy.days) return '';
  const DAY_MS = 864e5;
  const p = (k) => { const a = k.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]).getTime(); };
  const ks = Object.keys(cy.days).filter((k) => cy.days[k]).sort();
  const st = ks.filter((k, i) => i === 0 || p(k) - p(ks[i - 1]) > 2 * DAY_MS);
  if (!st.length) return '';
  const lens = [];
  for (let i = 1; i < st.length; i++) { const l = Math.round((p(st[i]) - p(st[i - 1])) / DAY_MS); if (l >= 18 && l <= 45) lens.push(l); }
  const avg = lens.length ? Math.round(lens.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, lens.length)) : 28;
  const day = Math.floor((now - p(st[st.length - 1])) / DAY_MS) + 1;
  if (day > avg + 7) return 'late';
  if (day <= 5) return 'menstrual';
  return day >= avg - 13 ? 'luteal' : 'follicular';
}

/* ---------------------------------------------------------------- targets */
function targets(profile) {
  const p = profile || {};
  const q = p.quiz || {}, me = p.me || {};
  const bwLb = num(q.bw) || num(q.weight) || num(me.weight) || num((p.baseline || {}).bw);
  const bwKg = bwLb ? (bwLb > 140 ? bwLb * 0.4536 : bwLb) : null;
  const plan = p.plan || {};
  return {
    sleepMins: toMins(q.sleepGoal || me.sleepGoal) || 480,
    protein: num(q.protein) || (bwKg ? Math.round(bwKg * 1.6) : 120),
    kcal: num(q.kcal) || num(plan.kcal) || null,
    waterL: num(q.water) || 3,
    sessions: num(plan.days) || num(q.days) || (Array.isArray(plan.week) ? plan.week.filter(Boolean).length : null) || 3
  };
}

/* ---------------------------------------------------------------- the seven */
function metrics(d, now, tz) {
  const L = local(now, tz);
  const T = targets(d.profile);
  const phase = d.cyclePhase || cyclePhase(d.cycle || (d.profile || {}).cycle, now);
  const lut = phase === 'luteal';
  const out = {};
  const meta = (id) => METRICS.find((m) => m.id === id);
  const mk = (id, o) => { out[id] = Object.assign({ id, name: meta(id).n, category: meta(id).catN, status: 'ok', flags: [] }, o); };

  // 1. resting heart rate: today against your own 28-day normal
  {
    const cur = latest(d, 'hr');
    const hist = series(d.days, 'hr', now, 28);
    const base = num(((d.relay || {}).f || {}).rhr_base) || num(((d.health || {}).f || {}).rhr_base) || (hist.length >= 5 ? mean(hist) : null);
    const diff = cur.v != null && base != null ? cur.v - base : null;
    const o = { status: 'ok', flags: [], value: cur.v, unit: 'bpm', baseline: r1(base), change: r1(diff), last3: hist.slice(-3), stale: daysAgo(now, cur.t) };
    if (cur.v == null || o.stale > 2) { o.status = 'neglect'; o.flags.push('No resting heart rate from the watch in ' + (cur.v == null ? 'a while' : o.stale + ' days') + '.'); }
    if (lut) o.cycle = 'luteal';
    if (o.status === 'neglect') { /* already said */ }
    else if (diff != null && diff >= (lut ? 10 : 7)) { o.status = 'fix'; o.flags.push(`Resting heart rate is ${Math.round(diff)} bpm above normal - often strain, illness or poor sleep.`); }
    else if (diff != null && diff >= (lut ? 6 : 4)) { o.status = 'watch'; o.flags.push(`Resting heart rate is ${Math.round(diff)} bpm above normal${lut ? ' (some rise is normal in the luteal phase)' : ''}.`); }
    mk('rhr', o);
  }
  // 2. HRV: today and the 3-day average against normal
  {
    const cur = latest(d, 'hrv');
    const hist = series(d.days, 'hrv', now, 28);
    const base = num(((d.relay || {}).f || {}).hrv_base) || num(((d.health || {}).f || {}).hrv_base) || (hist.length >= 5 ? mean(hist) : null);
    const three = hist.length >= 3 ? mean(hist.slice(-3)) : null;
    const o = { status: 'ok', flags: [], value: cur.v, unit: 'ms', baseline: r1(base), change_pct: pct(cur.v, base), three_day_pct: pct(three, base), stale: daysAgo(now, cur.t) };
    if (cur.v == null || o.stale > 2) { o.status = 'neglect'; o.flags.push('No HRV reading lately - wear the watch to bed.'); }
    else if ((o.change_pct != null && o.change_pct <= (lut ? -28 : -20)) || (o.three_day_pct != null && o.three_day_pct <= (lut ? -22 : -15))) { o.status = 'fix'; o.flags.push(`HRV is ${Math.abs(o.change_pct)}% under normal - recovery is behind.`); }
    else if (o.change_pct != null && o.change_pct <= (lut ? -15 : -10)) { o.status = 'watch'; o.flags.push(`HRV is ${Math.abs(o.change_pct)}% under normal${lut ? ' (lower HRV is normal in the luteal phase)' : ''}.`); }
    mk('hrv', o);
  }
  // 3. training load: sessions this week against the plan, and time since the last
  {
    const list = (Array.isArray(d.sessions) ? d.sessions : []).filter((s) => s && num(s.t) && !s.seed);
    const week = list.filter((s) => s.t > now - 7 * DAY);
    const month = list.filter((s) => s.t > now - 28 * DAY);
    const lastT = list.reduce((m, s) => Math.max(m, s.t), 0);
    const vol7 = week.reduce((s, x) => s + (num(x.vol) || 0), 0);
    const avgWeek = month.length ? month.reduce((s, x) => s + (num(x.vol) || 0), 0) / 4 : null;
    const o = { status: 'ok', flags: [], value: week.length, unit: 'sessions in 7 days', target: T.sessions, days_since_last: lastT ? daysAgo(now, lastT) : null,
                volume_7d: Math.round(vol7), volume_week_avg_28d: avgWeek == null ? null : Math.round(avgWeek) };
    const hrvLow = out.hrv && out.hrv.status === 'fix';
    if (!list.length) { o.status = 'neglect'; o.flags.push('No workouts logged yet.'); }
    else if (o.days_since_last >= 5) { o.status = 'fix'; o.flags.push(`${o.days_since_last} days since the last workout.`); }
    else if (week.length < T.sessions - 1) { o.status = 'watch'; o.flags.push(`${week.length} of ${T.sessions} planned sessions this week.`); }
    if (avgWeek && vol7 > avgWeek * 1.5 && hrvLow) { o.status = 'fix'; o.flags.push('Volume is 50% over your usual week while HRV is down - overreaching.'); }
    mk('training', o);
  }
  // 4 + 5. sleep: last night, the week's average and debt; bedtime spread
  {
    const nights = Object.keys(d.sleeplog || {}).sort().filter((k) => Date.parse(k + 'T12:00:00Z') > now - 8 * DAY)
      .map((k) => Object.assign({ k }, d.sleeplog[k]));
    let mins = nights.map((n) => toMins(n.mins != null ? n.mins : n.total)).filter((x) => x != null);
    const cur = latest(d, 'sleep');
    const lastNight = mins.length ? mins[mins.length - 1] : toMins(cur.v);
    if (!mins.length && lastNight != null) mins = [lastNight];
    const avg = mins.length ? mean(mins) : null;
    const debt = mins.length ? Math.max(0, Math.round(mins.reduce((s, x) => s + (T.sleepMins - x), 0))) : null;
    const newest = nights.length ? nights[nights.length - 1] : null;
    const staleN = newest ? daysAgo(now, Date.parse(newest.k + 'T12:00:00Z')) : (cur.t ? daysAgo(now, cur.t) : null);
    const o = { status: 'ok', flags: [], value: lastNight, unit: 'minutes last night', target: T.sleepMins, avg_7d: avg == null ? null : Math.round(avg),
                debt_7d_mins: debt, nights: mins.length, stale: staleN };
    if (lastNight == null || staleN > 2) { o.status = 'neglect'; o.flags.push('No sleep data for the last couple of nights.'); }
    else if (lastNight < T.sleepMins - 90 || (avg != null && avg < T.sleepMins - 60)) { o.status = 'fix'; o.flags.push(`Slept ${Math.floor(lastNight / 60)}h ${lastNight % 60}m against ${T.sleepMins / 60}h; week average ${Math.floor(avg / 60)}h ${Math.round(avg % 60)}m.`); }
    else if (avg != null && avg < T.sleepMins - 30) { o.status = 'watch'; o.flags.push(`Week average is ${Math.round(T.sleepMins - avg)} minutes under target.`); }
    mk('sleep', o);

    const beds = nights.map((n) => bedMins(n.bed != null ? n.bed : n.start)).filter((x) => x != null);
    const spread = beds.length >= 3 ? Math.round(sd(beds)) : null;
    const avgBed = beds.length ? Math.round(mean(beds)) : null;
    const clock = avgBed == null ? null : (() => { const t = (avgBed + 18 * 60) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; })();
    const b = { status: 'ok', flags: [], value: spread, unit: 'minutes of spread', avg_bedtime: clock, nights: beds.length };
    if (beds.length < 3) { b.status = 'neglect'; b.flags.push('Not enough bedtimes logged to judge consistency.'); }
    else if (spread > 75) { b.status = 'fix'; b.flags.push(`Bedtime swings by about ${spread} minutes night to night.`); }
    else if (spread > 45) { b.status = 'watch'; b.flags.push(`Bedtime varies by about ${spread} minutes.`); }
    mk('bedtime', b);
  }
  // 6. food: today and the 3-day protein average
  {
    const log = (Array.isArray(d.profile.foodlog) ? d.profile.foodlog : []).filter((e) => e && num(e.at) && e.src !== 'seed');
    const dayOf = (t) => local(t, tz).date;
    const today = log.filter((e) => dayOf(e.at) === L.date);
    const by = {};
    log.filter((e) => e.at > now - 3 * DAY).forEach((e) => { const k = dayOf(e.at); by[k] = (by[k] || 0) + (num(e.p) || 0); });
    const p3 = Object.keys(by).length ? mean(Object.values(by)) : null;
    const lastT = log.reduce((m, e) => Math.max(m, e.at), 0);
    const o = { status: 'ok', flags: [], value: Math.round(today.reduce((s, e) => s + (num(e.p) || 0), 0)), unit: 'g protein today', target: T.protein,
                kcal_today: Math.round(today.reduce((s, e) => s + (num(e.kcal) || 0), 0)), kcal_target: T.kcal,
                protein_3d_avg: p3 == null ? null : Math.round(p3), meals_today: today.length, days_since_log: lastT ? daysAgo(now, lastT) : null };
    if (!log.length || o.days_since_log >= 2) { o.status = 'neglect'; o.flags.push(log.length ? `No food logged for ${o.days_since_log} days.` : 'No food logged yet.'); }
    else if (p3 != null && p3 < T.protein * 0.7) { o.status = 'fix'; o.flags.push(`Protein is averaging ${Math.round(p3)} g against ${T.protein} g.`); }
    else if (L.mins >= 1080 && o.value < T.protein * 0.6) { o.status = 'watch'; o.flags.push(`${o.value} g of ${T.protein} g protein so far today.`); }
    mk('food', o);
  }
  // 7. hydration: where you should be by this time of day
  {
    const w = d.profile.water || {};
    let litres = null;
    if (num(w.l) != null && (!w.day || w.day === L.date)) litres = num(w.l);
    const rel = latest(d, 'water');
    if (litres == null && rel.v != null && local(rel.t || now, tz).date === L.date) litres = rel.v > 20 ? rel.v / 1000 : rel.v;
    const awake = Math.min(1, Math.max(0, (L.mins - 7 * 60) / (15 * 60)));   // 7am to 10pm
    const expected = Math.round(T.waterL * awake * 10) / 10;
    const o = { status: 'ok', flags: [], value: litres, unit: 'litres today', target: T.waterL, expected_by_now: expected };
    if (litres == null) { o.status = L.mins >= 600 ? 'neglect' : 'ok'; if (L.mins >= 600) o.flags.push('No water logged today.'); }
    else if (L.mins >= 720 && litres < expected * 0.5) { o.status = 'fix'; o.flags.push(`${litres} L so far - about ${expected} L would be on track by now.`); }
    else if (L.mins >= 600 && litres < expected * 0.75) { o.status = 'watch'; o.flags.push(`${litres} L of ${T.waterL} L - a little behind.`); }
    mk('hydration', o);
  }
  return { local: L, window: windowOf(L.mins), targets: T, cycle: phase || null, metrics: IDS.map((id) => out[id]) };
}

/* ---------------------------------------------------------------- plain rules
   The same audit without the model: used when the agent cannot run, and
   given to the agent as a starting point it can overrule. */
const ADVICE = {
  rhr:       { morning: 'Keep today easy: swap intervals for a 30-minute walk or zone 2, and drink 500 ml of water now.',
               evening: 'Skip late caffeine and alcohol tonight; both push resting heart rate up overnight.',
               night:   'Lights out 30 minutes earlier than usual - one good night usually brings it back down.' },
  hrv:       { morning: 'Train at 70% today - technique work or zone 2, no max efforts.',
               evening: 'Ten minutes of slow breathing (4 in, 6 out) before bed.',
               night:   'Cool, dark room and no screens for the last 30 minutes.' },
  training:  { morning: 'Get one session in today, even 30 minutes - Kova has the plan ready under Workout.',
               evening: 'A 20-minute session still counts - open Workout and press Start.',
               night:   'Lay out kit for a morning session so it happens tomorrow.' },
  sleep:     { morning: 'Get 10 minutes of daylight in the next hour and hold caffeine until 90 minutes after waking.',
               evening: 'Last caffeine was due by 2pm; plan dinner at least 3 hours before bed.',
               night:   'Aim for bed 45 minutes earlier tonight to start paying the debt back.' },
  bedtime:   { morning: 'Wake at the same time as yesterday, even if you slept badly - it anchors tonight.',
               evening: 'Set a wind-down alarm 45 minutes before your target bedtime.',
               night:   'Same bedtime as your average tonight, within 15 minutes.' },
  food:      { morning: 'Start with 30-40 g of protein at breakfast (eggs, Greek yogurt, a shake).',
               evening: 'Make dinner protein-first: a palm-and-a-half of meat, fish or tofu.',
               night:   'If you are still short, a casein shake or cottage cheese before bed.' },
  hydration: { morning: 'Drink 500 ml now and keep a bottle in sight.',
               evening: 'Two more glasses before 8pm, then taper so sleep is not broken.',
               night:   'Small sips only now; start tomorrow with a full glass.' }
};
/* "be in bed by 10:30 pm": 45 minutes before your own usual bedtime */
function bedBy(audit) {
  const b = (audit.metrics || []).find((m) => m.id === 'bedtime');
  const m = b && /^(\d{2}):(\d{2})$/.exec(b.avg_bedtime || '');
  if (!m) return null;
  const clock = (x) => { x = ((x % 1440) + 1440) % 1440; const h = Math.floor(x / 60), mm = String(x % 60).padStart(2, '0'); return `${h % 12 || 12}:${mm} ${h < 12 ? 'am' : 'pm'}`; };
  const usual = +m[1] * 60 + +m[2];
  return { by: clock(usual - 45), usual: clock(usual) };
}

function rulesAlerts(audit) {
  const win = audit.window;
  const bed = bedBy(audit);
  return audit.metrics.filter((m) => m.status === 'fix' || (m.status === 'neglect' && ['rhr', 'sleep', 'food'].includes(m.id)))
    .map((m) => ({
      metric: m.id, category: m.category, window: win,
      severity: m.status === 'fix' ? 'urgent' : 'soon',
      title: m.status === 'neglect' ? `${m.name}: no recent data` : `${m.name} needs attention`,
      wrong: m.flags[0] || '',
      action: m.status === 'neglect' ? (m.id === 'food' ? 'Log your meals today - even a rough entry helps Kova coach you.' : 'Wear your watch tonight and let it sync in the morning.')
                                     : (m.id === 'sleep' && win !== 'morning' && bed ? `Be in bed by ${bed.by} tonight, 45 minutes before your usual ${bed.usual}.` : ADVICE[m.id][win]),
      source: 'rules'
    }));
}

module.exports = { METRICS, IDS, WINDOWS, local, dayOf, windowOf, cyclePhase, gather, metrics, rulesAlerts, targets, toMins, bedMins, ADVICE, bedBy };
