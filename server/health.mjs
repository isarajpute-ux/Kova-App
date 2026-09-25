/* ==========================================================================
   Health data: one flat shape, many ways in.

   The app's KovaHealth store understands a flat object of known fields
   (hr, hrv, sleep, deep, rem, steps, ...). Everything here turns some
   device's native format into that shape:

     - Health Auto Export (iOS)  -> Apple Health, i.e. Apple Watch and every
                                    watch/ring/scale whose app writes to Health
     - any JSON webhook          -> flat keys pass straight through
     - Oura / Fitbit / WHOOP / Withings cloud APIs, pulled on demand
   ========================================================================== */

export const FIELDS = {
  hr: 'n', hrv: 'n', sleep: 's', deep: 'n', rem: 'n', core: 'n', awake: 'n',
  steps: 'n', score: 'n', temp: 's', water: 'n', resp: 'n', spo2: 'n',
  energy: 'n', exercise: 'n', stand: 'n', distance: 'n', weight: 's',
  vo2: 'n', workout: 's', device: 's', rhr_base: 'n', hrv_base: 'n'
};

/* keep only known fields with sane values - the same rule the client's
   ingest() applies, enforced here too so garbage never reaches storage */
export function cleanFlat(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of Object.keys(FIELDS)) {
    const v = o[k];
    if (v === null || v === undefined || v === '') continue;
    if (FIELDS[k] === 'n') {
      const n = +v;
      if (Number.isFinite(n) && n > 0) out[k] = Math.round(n * 100) / 100;
    } else {
      out[k] = String(v).slice(0, 80);
    }
  }
  return out;
}

/* ---- Health Auto Export -------------------------------------------------
   Port of normalizeHAE in index.html so webhook payloads are understood
   exactly the way file imports are. */
const HAE_MAP = [
  ['restingheartrate', 'hr'], ['heartratevariability', 'hrv'], ['stepcount', 'steps'],
  ['respiratoryrate', 'resp'], ['bloodoxygensaturation', 'spo2'], ['oxygensaturation', 'spo2'],
  ['activeenergy', 'energy'], ['appleexercisetime', 'exercise'], ['applestandhour', 'stand'],
  ['walkingrunningdistance', 'distance'], ['vo2max', 'vo2'], ['bodymass', 'weight'],
  ['sleepingwristtemperature', 'temp'], ['dietarywater', 'water'], ['sleepanalysis', 'sleep']
];
const HAE_CUMULATIVE = { steps: 1, energy: 1, exercise: 1, stand: 1, distance: 1, water: 1 };
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function haeField(name) {
  const n = norm(name);
  let best = null, len = 0;
  for (const [k, f] of HAE_MAP) if (n.includes(k) && k.length > len) { best = f; len = k.length; }
  return best;
}
function haeValue(s) {
  if (!s || typeof s !== 'object') return null;
  for (const k of ['qty', 'Avg', 'avg', 'value', 'Max']) if (typeof s[k] === 'number') return s[k];
  return null;
}
function haeSleep(s) {
  if (!s || typeof s !== 'object') return null;
  const h = k => (typeof s[k] === 'number' ? s[k] : 0);
  let total = h('totalSleep') || h('asleep');
  if (!total) total = h('deep') + h('rem') + h('core') + h('light');
  if (!total) return null;
  return Math.round(total > 24 ? total : total * 60);
}

export function normalizeHAE(payload) {
  const metrics = payload && payload.data && payload.data.metrics;
  if (!Array.isArray(metrics) || !metrics.length) return null;
  const out = {};
  let hit = false;
  outer: for (const m of metrics) {
    for (const s of (m && m.data) || []) {
      const v = s && (s.source || s.sourceName || s.device || s.Source);
      if (v) { out.device = String(v); hit = true; break outer; }
    }
  }
  for (const m of metrics) {
    const field = haeField(m && m.name);
    if (!field || !m.data || !m.data.length) continue;
    const sorted = m.data.slice().sort((a, b) => String((b && b.date) || '').localeCompare(String((a && a.date) || '')));
    const latest = sorted[0];
    if (field === 'sleep') {
      const min = haeSleep(latest);
      if (min) {
        out.sleep = String(min); hit = true;
        const h = k => (typeof latest[k] === 'number' ? latest[k] : 0);
        const toMin = v => Math.round(v > 24 ? v : v * 60);
        if (h('deep')) out.deep = toMin(h('deep'));
        if (h('rem')) out.rem = toMin(h('rem'));
        if (h('core')) out.core = toMin(h('core'));
        if (h('awake')) out.awake = toMin(h('awake'));
      }
      continue;
    }
    if (HAE_CUMULATIVE[field]) {
      const day = String((latest && latest.date) || '').slice(0, 10);
      let sum = 0, got = false;
      for (const s of m.data) {
        if (String((s && s.date) || '').slice(0, 10) !== day) continue;
        const v = haeValue(s);
        if (v !== null) { sum += v; got = true; }
      }
      if (got && sum > 0) {
        out[field] = (field === 'water' || field === 'distance') ? Math.round(sum * 100) / 100 : Math.round(sum);
        hit = true;
      }
      continue;
    }
    const v = haeValue(latest);
    if (v === null) continue;
    out[field] = Math.round(v * 10) / 10;
    hit = true;
  }
  return hit ? out : null;
}

/* Any inbound payload -> flat fields. Accepts HAE, {data:{...flat}}, or flat. */
export function normalizeAny(body) {
  const hae = normalizeHAE(body);
  if (hae) return cleanFlat(hae);
  let o = body;
  if (o && o.data && typeof o.data === 'object' && !o.data.metrics) o = o.data;
  return cleanFlat(o);
}

/* ---- cloud wearables ---------------------------------------------------- */
export function hm(min) {
  min = Math.round(min);
  return Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0') + 'm';
}
function ymd(d) { return d.toISOString().slice(0, 10); }
function daysBefore(date, n) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return ymd(d); }
const last = arr => (Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null);

/* each fetcher: (get, date) -> flat fields. `get(pathOrUrl, init)` is an
   authorised JSON fetch against the provider's API base. Every section is
   isolated so one missing scope does not blank the rest. */
async function part(fn) { try { return (await fn()) || {}; } catch { return {}; } }

export const WEARABLES = {
  async oura(get, date) {
    const q = `?start_date=${daysBefore(date, 1)}&end_date=${date}`;
    const out = { device: 'Oura' };
    Object.assign(out, await part(async () => {
      const all = (await get('/v2/usercollection/sleep' + q)).data || [];
      const s = last(all.filter(x => x.type === 'long_sleep')) || last(all);
      if (!s) return;
      return {
        sleep: s.total_sleep_duration ? hm(s.total_sleep_duration / 60) : undefined,
        deep: s.deep_sleep_duration / 60, rem: s.rem_sleep_duration / 60,
        core: s.light_sleep_duration / 60, awake: s.awake_time / 60,
        hrv: s.average_hrv, hr: s.lowest_heart_rate, resp: s.average_breath
      };
    }));
    Object.assign(out, await part(async () => {
      const r = last((await get('/v2/usercollection/daily_readiness' + q)).data);
      if (!r) return;
      const t = r.temperature_deviation;
      return { score: r.score, temp: typeof t === 'number' ? (t >= 0 ? '+' : '') + t.toFixed(1) + '°C' : undefined };
    }));
    Object.assign(out, await part(async () => {
      const a = last((await get('/v2/usercollection/daily_activity' + q)).data);
      if (!a) return;
      return { steps: a.steps, energy: a.active_calories, distance: a.equivalent_walking_distance / 1000 };
    }));
    Object.assign(out, await part(async () => {
      const o = last((await get('/v2/usercollection/daily_spo2' + q)).data);
      return o && o.spo2_percentage ? { spo2: o.spo2_percentage.average } : null;
    }));
    return cleanFlat(out);
  },

  async fitbit(get, date) {
    const out = { device: 'Fitbit' };
    Object.assign(out, await part(async () => {
      const s = (await get(`/1/user/-/activities/date/${date}.json`)).summary;
      if (!s) return;
      const tot = (s.distances || []).find(d => d.activity === 'total');
      return {
        steps: s.steps, energy: s.activityCalories, hr: s.restingHeartRate,
        exercise: (s.veryActiveMinutes || 0) + (s.fairlyActiveMinutes || 0),
        distance: tot && tot.distance
      };
    }));
    Object.assign(out, await part(async () => {
      const j = await get(`/1.2/user/-/sleep/date/${date}.json`);
      const s = j.summary;
      if (!s || !s.totalMinutesAsleep) return;
      const st = s.stages || {};
      return { sleep: hm(s.totalMinutesAsleep), deep: st.deep, rem: st.rem, core: st.light, awake: st.wake };
    }));
    Object.assign(out, await part(async () => {
      const h = (await get(`/1/user/-/hrv/date/${date}.json`)).hrv;
      return h && h[0] ? { hrv: h[0].value.dailyRmssd } : null;
    }));
    Object.assign(out, await part(async () => {
      const s = await get(`/1/user/-/spo2/date/${date}.json`);
      return s && s.value ? { spo2: s.value.avg } : null;
    }));
    Object.assign(out, await part(async () => {
      const b = (await get(`/1/user/-/br/date/${date}.json`)).br;
      return b && b[0] ? { resp: b[0].value.breathingRate } : null;
    }));
    return cleanFlat(out);
  },

  async whoop(get) {
    const out = { device: 'WHOOP' };
    Object.assign(out, await part(async () => {
      const r = (await get('/v2/recovery?limit=1')).records?.[0]?.score;
      if (!r) return;
      return {
        score: r.recovery_score, hr: r.resting_heart_rate, hrv: r.hrv_rmssd_milli,
        spo2: r.spo2_percentage,
        temp: typeof r.skin_temp_celsius === 'number' ? r.skin_temp_celsius.toFixed(1) + '°C' : undefined
      };
    }));
    Object.assign(out, await part(async () => {
      const s = (await get('/v2/activity/sleep?limit=1')).records?.[0]?.score;
      if (!s || !s.stage_summary) return;
      const st = s.stage_summary, m = v => (v || 0) / 60000;
      const asleep = m(st.total_light_sleep_time_milli) + m(st.total_slow_wave_sleep_time_milli) + m(st.total_rem_sleep_time_milli);
      return {
        sleep: asleep ? hm(asleep) : undefined, deep: m(st.total_slow_wave_sleep_time_milli),
        rem: m(st.total_rem_sleep_time_milli), core: m(st.total_light_sleep_time_milli),
        awake: m(st.total_awake_time_milli), resp: s.respiratory_rate
      };
    }));
    Object.assign(out, await part(async () => {
      const c = (await get('/v2/cycle?limit=1')).records?.[0]?.score;
      return c && c.kilojoule ? { energy: c.kilojoule / 4.184 } : null;
    }));
    return cleanFlat(out);
  },

  async withings(get, date) {
    const out = { device: 'Withings' };
    const post = (path, params) => get(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString()
    }).then(j => { if (j.status !== 0) throw new Error('withings ' + j.status); return j.body; });
    Object.assign(out, await part(async () => {
      const b = await post('/measure', { action: 'getmeas', meastype: '1', category: '1' });
      const g = b.measuregrps && b.measuregrps[0];
      const m = g && g.measures.find(x => x.type === 1);
      return m ? { weight: (m.value * Math.pow(10, m.unit)).toFixed(1) + ' kg' } : null;
    }));
    Object.assign(out, await part(async () => {
      const b = await post('/v2/measure', { action: 'getactivity', startdateymd: daysBefore(date, 1), enddateymd: date });
      const a = last(b.activities);
      return a ? { steps: a.steps, distance: a.distance / 1000, energy: a.calories } : null;
    }));
    Object.assign(out, await part(async () => {
      const b = await post('/v2/sleep', {
        action: 'getsummary', startdateymd: daysBefore(date, 1), enddateymd: date,
        data_fields: 'deepsleepduration,remsleepduration,lightsleepduration,wakeupduration,hr_min,rr_average,sleep_score'
      });
      const d = last(b.series)?.data;
      if (!d) return;
      const asleep = ((d.deepsleepduration || 0) + (d.remsleepduration || 0) + (d.lightsleepduration || 0)) / 60;
      return {
        sleep: asleep ? hm(asleep) : undefined, deep: d.deepsleepduration / 60, rem: d.remsleepduration / 60,
        core: d.lightsleepduration / 60, awake: d.wakeupduration / 60, hr: d.hr_min, resp: d.rr_average
      };
    }));
    return cleanFlat(out);
  }
};
