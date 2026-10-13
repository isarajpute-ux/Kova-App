/* Apple Health / Health Auto Export normaliser - server copy.

   Same rules as normalizeHAE() in index.html, so a payload means the same
   thing whether it was pasted into the app or POSTed here by a Shortcut.
   The output is the flat field set KovaHealth.ingest() understands. */

const FIELDS = {
  hr: 'n', hrv: 'n', sleep: 's', steps: 'n', score: 'n', temp: 's', water: 'n',
  resp: 'n', spo2: 'n', energy: 'n', exercise: 'n', stand: 'n', distance: 'n',
  weight: 's', vo2: 'n', workout: 's', device: 's', rhr_base: 'n', hrv_base: 'n'
};

const HAE_MAP = [
  ['restingheartrate', 'hr'],
  ['heartratevariability', 'hrv'],
  ['stepcount', 'steps'],
  ['respiratoryrate', 'resp'],
  ['bloodoxygensaturation', 'spo2'],
  ['oxygensaturation', 'spo2'],
  ['activeenergy', 'energy'],
  ['appleexercisetime', 'exercise'],
  ['applestandhour', 'stand'],
  ['walkingrunningdistance', 'distance'],
  ['vo2max', 'vo2'],
  ['bodymass', 'weight'],
  ['sleepingwristtemperature', 'temp'],
  ['dietarywater', 'water'],
  ['sleepanalysis', 'sleep']
];
const CUMULATIVE = { steps: 1, energy: 1, exercise: 1, stand: 1, distance: 1, water: 1 };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function haeField(name) {
  const n = norm(name);
  let best = null, bestLen = 0;
  for (const [k, f] of HAE_MAP) {
    // longest match wins, so restingheartrate never loses to heartrate
    if (n.includes(k) && k.length > bestLen) { best = f; bestLen = k.length; }
  }
  return best;
}

function haeValue(s) {
  if (!s || typeof s !== 'object') return null;
  for (const k of ['qty', 'Avg', 'avg', 'value', 'Max']) {
    if (typeof s[k] === 'number') return s[k];
  }
  return null;
}

function haeSleep(s) {
  if (!s || typeof s !== 'object') return null;
  const h = (k) => (typeof s[k] === 'number' ? s[k] : 0);
  let total = h('totalSleep') || h('asleep');
  if (!total) total = h('deep') + h('rem') + h('core') + h('light');
  if (!total) return null;
  // reported in hours; anything above 24 is already minutes
  return Math.round(total > 24 ? total : total * 60);
}

/* "2026-10-13 07:02:11 -0700" -> ms */
function haeTime(x) {
  const m = String(x || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*(?:([+-])(\d{2}):?(\d{2})|Z)?$/);
  if (!m) return NaN;
  return Date.parse(m[1] + 'T' + m[2] + (m[3] ? m[3] + m[4] + ':' + m[5] : 'Z'));
}
const haeWhen = (s) => String((s && (s.date || s.endDate || s.startDate)) || '');

/* Summarize Data off: sleep arrives as stages (Core, REM, Deep, Asleep,
   Awake, In Bed) with a start and an end. Last night = every asleep stage
   that ended within 16 hours of the last one; overlapping stages (a watch
   and a sleep app both writing) are counted once. */
function haeSleepNight(data) {
  let segs = [], end = 0;
  for (const s of data) {
    if (!s || !/^(core|rem|deep|asleep|unspecified)$/i.test(String(s.value || ''))) continue;
    const a = haeTime(s.startDate), b = haeTime(s.endDate);
    if (!(a < b)) continue;
    segs.push([a, b]); if (b > end) end = b;
  }
  segs = segs.filter((x) => x[1] > end - 16 * 3600e3).sort((x, y) => x[0] - y[0]);
  let ms = 0, cs = -1, ce = -1;
  for (const x of segs) {
    if (x[0] > ce) { if (ce > cs) ms += ce - cs; cs = x[0]; ce = x[1]; }
    else if (x[1] > ce) ce = x[1];
  }
  if (ce > cs) ms += ce - cs;
  const min = Math.round(ms / 60000);
  return min > 0 ? min : null;
}

function haeDevice(metrics) {
  for (const m of metrics) {
    if (!m || !m.data) continue;
    for (const s of m.data) {
      const v = s && (s.source || s.sourceName || s.device || s.Source);
      if (v) return String(v);
    }
    if (m.source) return String(m.source);
  }
  return '';
}

function normalizeHAE(payload) {
  const metrics = payload && payload.data && payload.data.metrics;
  if (!Array.isArray(metrics) || !metrics.length) return null;
  const out = {};
  const dev = haeDevice(metrics);
  if (dev) out.device = dev;
  for (const m of metrics) {
    const field = haeField(m && m.name);
    if (!field || !Array.isArray(m.data) || !m.data.length) continue;
    const sorted = m.data.slice().sort((a, b) => haeWhen(b).localeCompare(haeWhen(a)));
    const latest = sorted[0];
    if (field === 'sleep') {
      const staged = m.data.some((s) => s && typeof s.value === 'string' && s.startDate);
      const min = staged ? haeSleepNight(m.data) : haeSleep(latest);
      if (min) out.sleep = String(min);
      continue;
    }
    if (CUMULATIVE[field]) {
      // daily totals: sum the latest day rather than take one sample
      const day = haeWhen(latest).slice(0, 10);
      let sum = 0, got = false;
      for (const s of m.data) {
        if (haeWhen(s).slice(0, 10) !== day) continue;
        const v = haeValue(s);
        if (v !== null) { sum += v; got = true; }
      }
      if (got && sum > 0) {
        out[field] = (field === 'water' || field === 'distance')
          ? Math.round(sum * 100) / 100 : Math.round(sum);
      }
      continue;
    }
    const v = haeValue(latest);
    if (v !== null) out[field] = Math.round(v * 10) / 10;
  }
  return Object.keys(out).length ? out : null;
}

/* Accepts Health Auto Export, a flat Shortcut dictionary, or either
   wrapped in {data:{...}}. Returns only known fields with sane values -
   this is written to the database, so nothing unrecognised gets through. */
function clean(payload) {
  let o = normalizeHAE(payload);
  if (!o) {
    o = payload;
    if (o && o.data && typeof o.data === 'object' && !o.data.metrics) o = o.data;
  }
  if (!o || typeof o !== 'object') return {};
  const out = {};
  for (const k of Object.keys(FIELDS)) {
    const raw = o[k];
    if (raw === null || raw === undefined || raw === '') continue;
    if (FIELDS[k] === 'n') {
      const v = +raw;
      if (Number.isFinite(v) && v > 0 && v < 1e7) out[k] = v;
    } else {
      out[k] = String(raw).slice(0, 80);
    }
  }
  return out;
}

module.exports = { clean, normalizeHAE, FIELDS };
