/* The wellness agent: the seven metrics (wellness.js), the audit loop on
   the Claude Agent SDK (agent.js), the schedule, the API routes, and the
   daily health history. The SDK's own tool() is used for real; query() is
   a scripted model that calls the tools the way the system prompt asks, so
   no API key or network is needed. */
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
    child: (c) => ref(p + '/' + c),
    once: async () => ({ val: () => get(p) }),
    set: async (v) => set(p, v),
    remove: async () => set(p, null),
    update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); },
    transaction: async (fn) => { const v = fn(get(p)); set(p, v); return { committed: true, snapshot: { val: () => v } }; }
  };
}
const fakeDb = { ref };
Module._load = ((orig) => function (req, ...rest) {
  if (req === 'firebase-admin') return { initializeApp() {}, database: () => fakeDb,
    auth: () => ({ verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad'); } }) };
  return orig.call(this, req, ...rest);
})(Module._load);

const FN = path.join(__dirname, '..', 'functions');
const W = require(path.join(FN, 'wellness.js'));
const { makeAgent, due } = require(path.join(FN, 'agent.js'));
const api = require(path.join(FN, 'api.js'));

const T = [];
const ck = (n, c) => T.push([n, !!c]);
const DAY = 864e5;
function call(method, url, { body, token } = {}) {
  const headers = {}; if (token) headers.authorization = 'Bearer ' + token;
  const [p, qs] = url.split('?');
  const req = { method, path: p, body: body || {}, query: Object.fromEntries(new URLSearchParams(qs || '')), ip: '1.2.3.4', get: (h) => headers[h.toLowerCase()] };
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, status(s) { this.statusCode = s; return this; }, set(k, v) { this.headers[k] = v; return this; },
                  json(o) { resolve({ status: this.statusCode, body: o }); }, send(t) { resolve({ status: this.statusCode, body: t }); } };
    api.handle(req, res, { base: 'https://x.test/api', model: 'm' });
  });
}

/* ---- a person whose week has something wrong in all seven places ---- */
const NOW = Date.parse('2026-09-28T19:00:00Z');       // 15:00 in New York - the evening window
const TZ = 'America/New_York';
function badWeek(uid) {
  const days = {};
  for (let i = 1; i <= 20; i++) {
    const d = new Date(NOW - i * DAY).toISOString().slice(0, 10);
    days[d] = { hr: 56, hrv: 50 };
  }
  ['2026-09-26', '2026-09-27', '2026-09-28'].forEach((d, i) => { days[d] = { hr: 63 + i, hrv: 36 }; });
  const sleeplog = {
    '2026-09-22': { mins: 340, bed: '11:10 p' }, '2026-09-23': { mins: 300, bed: '1:40 a' }, '2026-09-24': { mins: 330, bed: '10:20 p' },
    '2026-09-25': { mins: 310, bed: '2:05 a' }, '2026-09-26': { mins: 290, bed: '11:50 p' }, '2026-09-27': { mins: 320, bed: '12:55 a' },
    '2026-09-28': { mins: 300, bed: '1:30 a' }
  };
  const sessions = [{ t: NOW - 6 * DAY, vol: 12000, mins: 50 }, { t: NOW - 12 * DAY, vol: 11000 }];
  const foodlog = [{ at: NOW - 2 * DAY, p: 60, kcal: 1500 }, { at: NOW - DAY, p: 55, kcal: 1400 }, { at: NOW - 3 * 3600e3, p: 20, kcal: 500 }];
  const profile = { quiz: { bw: 180 }, foodlog, water: { l: 0.4, day: '2026-09-28' } };
  const wrap = (o) => ({ v: JSON.stringify(o), t: NOW });
  set(`users/${uid}/store`, { kova_profile_v2: wrap(profile), kova_log_v1: wrap(sessions), kova_sleeplog_v1: wrap(sleeplog),
                              kova_health_v2: wrap({ ts: NOW - 3600e3, f: { hr: 65, hrv: 35 } }) });
  set(`srv/healthDays/${uid}`, days);
}

/* ---- a scripted model: calls the tools in the order the prompt asks ---- */
function scriptedSdk(realTool, opts) {
  opts = opts || {};
  const seen = { options: null, calls: [] };
  const sdk = {
    tool: realTool,
    createSdkMcpServer: (o) => ({ type: 'sdk', name: o.name, tools: o.tools }),
    query: ({ prompt, options }) => {
      seen.options = options; seen.prompt = prompt;
      const tools = {};
      options.mcpServers.kova.tools.forEach((t) => { tools[t.name] = t; });
      return (async function* () {
        const use = async (name, args) => {
          const t = tools[name];
          const z = require(require.resolve('zod', { paths: [FN] }));
          z.object(t.inputSchema).parse(args || {});          // the MCP layer validates like this
          seen.calls.push(name);
          return (await t.handler(args || {}, {})).content[0].text;
        };
        const ctx = JSON.parse(await use('get_time_context'));
        const vit = JSON.parse(await use('read_vitals_workout'));
        seen.outOfOrder = await use('record_finding', { metric: 'hrv', status: 'fix', note: 'jumped ahead' });
        for (const m of vit) await use('record_finding', { metric: m.id, status: m.status, note: m.flags[0] || 'fine' });
        const sl = JSON.parse(await use('read_sleep'));
        for (const m of sl) await use('record_finding', { metric: m.id, status: m.status, note: m.flags[0] || 'fine' });
        const fu = JSON.parse(await use('read_fuel'));
        if (!opts.stopEarly) for (const m of fu) await use('record_finding', { metric: m.id, status: m.status, note: m.flags[0] || 'fine' });
        for (const m of vit.concat(sl, opts.stopEarly ? [] : fu)) {
          if (m.status === 'fix') await use('raise_alert', { metric: m.id, severity: 'urgent', window: m.id === 'bedtime' ? 'night' : ctx.window,
            title: m.name + ' is off', wrong: m.flags[0], action: 'Do the specific thing for ' + m.id + '.' });
        }
        seen.dupe = await use('raise_alert', { metric: 'rhr', severity: 'soon', window: 'evening', title: 'again', wrong: 'x', action: 'y' });
        await use('finish', { summary: 'Recovery is behind and sleep is short.' });
        yield { type: 'assistant', message: {} };
        yield { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.0123, num_turns: 14, result: 'done' };
      })();
    }
  };
  return { sdk, seen };
}

(async () => {
  const { pathToFileURL } = require('url');
  const from = (m) => pathToFileURL(require.resolve(m, { paths: [FN] })).href;
  const real = await import(from('@anthropic-ai/claude-agent-sdk'));
  const zod = await import(from('zod'));

  // =================================================== the clock and the windows
  ck('07:30 is the morning window', W.windowOf(7 * 60 + 30) === 'morning');
  ck('15:00 and 20:00 are the evening window', W.windowOf(15 * 60) === 'evening' && W.windowOf(20 * 60) === 'evening');
  ck('22:00 and 02:00 are the night window', W.windowOf(22 * 60) === 'night' && W.windowOf(2 * 60) === 'night');
  ck('local time follows the person’s zone', W.local(NOW, TZ).text === 'Mon 15:00' && W.local(NOW, 'Asia/Tokyo').hour === 4);
  ck('a night audit after midnight still counts for the day before', W.dayOf(Date.parse('2026-09-29T05:30:00Z'), TZ) === '2026-09-28');
  ck('bedtimes across midnight are close together', Math.abs(W.bedMins('11:40 p') - W.bedMins('12:10 a')) === 30);

  // =================================================== the seven metrics
  badWeek('u1');
  const audit = W.metrics(await W.gather(fakeDb, 'u1', NOW), NOW, TZ);
  const by = {}; audit.metrics.forEach((m) => { by[m.id] = m; });
  ck('seven metrics in the fixed order', audit.metrics.map((m) => m.id).join() === 'rhr,hrv,training,sleep,bedtime,food,hydration');
  ck('three categories', [...new Set(audit.metrics.map((m) => m.category))].join('|') === 'Vitals & workout|Sleep|Fuel');
  ck('resting heart rate 9 bpm over normal is a fix', by.rhr.status === 'fix' && by.rhr.baseline > 55 && by.rhr.change >= 7);
  ck('HRV 30% under normal is a fix', by.hrv.status === 'fix' && by.hrv.change_pct <= -20);
  ck('six days since the last workout is a fix', by.training.status === 'fix' && by.training.days_since_last === 6);
  ck('short sleep all week is a fix, with the debt', by.sleep.status === 'fix' && by.sleep.debt_7d_mins > 1000 && by.sleep.avg_7d < 360);
  ck('bedtime swinging by hours is a fix', by.bedtime.status === 'fix' && by.bedtime.value > 75);
  ck('protein under 70% of target is a fix', by.food.status === 'fix' && by.food.target === 131 && by.food.protein_3d_avg < 92);
  ck('0.4 L of water by 3pm is a fix', by.hydration.status === 'fix' && by.hydration.expected_by_now > 1.2);
  ck('the audit knows it is the evening window', audit.window === 'evening');

  const empty = W.metrics({ health: {}, sleeplog: {}, sessions: [], profile: {}, relay: {}, days: {} }, NOW, TZ);
  ck('missing data is neglect, not a zero', ['rhr', 'hrv', 'training', 'sleep', 'bedtime', 'food'].every((id) => empty.metrics.find((m) => m.id === id).status === 'neglect'));
  const fine = W.metrics({ health: { ts: NOW, f: { hr: 55, hrv: 52, rhr_base: 55, hrv_base: 50 } },
    sleeplog: { '2026-09-26': { mins: 470, bed: '22:40' }, '2026-09-27': { mins: 480, bed: '22:50' }, '2026-09-28': { mins: 490, bed: '22:35' } },
    sessions: [{ t: NOW - DAY, vol: 1 }, { t: NOW - 3 * DAY, vol: 1 }, { t: NOW - 5 * DAY, vol: 1 }],
    profile: { quiz: { bw: 180 }, foodlog: [{ at: NOW - 2 * DAY, p: 140 }, { at: NOW - DAY, p: 135 }, { at: NOW - 3600e3, p: 90 }], water: { l: 2, day: '2026-09-28' } },
    relay: {}, days: {} }, NOW, TZ);
  ck('a good week is all ok', fine.metrics.every((m) => m.status === 'ok'));

  // the luteal phase: a higher resting heart rate and lower HRV are normal there
  const dd = await W.gather(fakeDb, 'u1', NOW);
  const startK = new Date(NOW - 20 * DAY).toISOString().slice(0, 10), startK0 = new Date(NOW - 48 * DAY).toISOString().slice(0, 10);
  dd.cycle = { on: true, days: { [startK0]: true, [startK]: true } };
  ck('the cycle phase is read from the period days', W.cyclePhase(dd.cycle, NOW) === 'luteal');
  const lut = W.metrics(dd, NOW, TZ), lr = lut.metrics.find((m) => m.id === 'rhr');
  ck('in the luteal phase a 9 bpm rise is watched, not called a fix', lut.cycle === 'luteal' && lr.status === 'watch' && /luteal/.test(lr.flags[0]));

  const rules = W.rulesAlerts(audit);
  ck('plain rules raise one alert per fix, in the current window, with an action', rules.length === 7 && rules.every((a) => a.window === 'evening' && a.action.length > 20 && a.wrong));

  // =================================================== the agent loop (Claude Agent SDK)
  set('srv/agentUsers/u1', { on: true, tz: TZ });
  const { sdk, seen } = scriptedSdk(real.tool);
  let agent = makeAgent({ db: fakeDb, cfg: { anthropicKey: 'sk-ant-test', model: 'claude-sonnet-5' }, now: () => NOW,
                          sdk: async () => sdk, zod: async () => zod });
  let r = await agent.run('u1');
  const o = seen.options;
  ck('the agent gets no built-in tools', Array.isArray(o.tools) && o.tools.length === 0);
  ck('only Kova’s tools are allowed, everything else is refused', o.permissionMode === 'dontAsk' && o.allowedTools.every((n) => n.startsWith('mcp__kova__')) && o.allowedTools.length === 7);
  ck('no session files, no user settings, scratch home', o.persistSession === false && o.settingSources.length === 0 && /kova-agent/.test(o.env.HOME) && o.env.ANTHROPIC_API_KEY === 'sk-ant-test');
  ck('turns and spend are capped', o.maxTurns === 30 && o.maxBudgetUsd === 0.4);
  ck('it reads the three categories in order', seen.calls.filter((c) => /^read_/.test(c)).join() === 'read_vitals_workout,read_sleep,read_fuel');
  ck('a finding out of order is sent back', /Out of order: audit rhr next/.test(seen.outOfOrder));
  ck('a second alert for the same metric is refused', /Already raised/.test(seen.dupe));
  ck('the audit is recorded as the agent’s, with all seven findings in order', r.source === 'agent' && r.findings.map((f) => f.metric).join() === W.IDS.join());
  const alerts = get('users/u1/agent/alerts');
  ck('alerts land where the app listens, one per metric per day', Object.keys(alerts).length === 7 && alerts['2026-09-28_rhr'] && alerts['2026-09-28_rhr'].state === 'new');
  ck('each alert says what is wrong and what to do, and when', alerts['2026-09-28_bedtime'].window === 'night' && alerts['2026-09-28_sleep'].window === 'evening'
    && /Do the specific thing for sleep/.test(alerts['2026-09-28_sleep'].action) && alerts['2026-09-28_sleep'].category === 'Sleep');
  const last = get('users/u1/agent/last');
  ck('the last audit keeps its summary, window and cost', last.summary === 'Recovery is behind and sleep is short.' && last.window === 'evening' && last.cost === 0.0123 && last.source === 'agent');
  ck('the evening run is marked done for today', get('srv/agentUsers/u1/ran/evening') === '2026-09-28');

  // a person who fixed one: it is not raised again today
  set('users/u1/agent/alerts/2026-09-28_hydration/state', 'done');
  await agent.run('u1');
  ck('an alert marked done stays done today', get('users/u1/agent/alerts/2026-09-28_hydration/state') === 'done');

  // the model stops early: the rest are still audited
  const early = scriptedSdk(real.tool, { stopEarly: true });
  agent = makeAgent({ db: fakeDb, cfg: { anthropicKey: 'k', model: 'm' }, now: () => NOW, sdk: async () => early.sdk, zod: async () => zod });
  r = await agent.run('u1');
  ck('if the model stops early, the missing findings are filled from the numbers', r.findings.length === 7 && r.findings.filter((f) => f.filled).length === 2);

  // the SDK cannot start: plain rules instead of silence
  agent = makeAgent({ db: fakeDb, cfg: { anthropicKey: 'k', model: 'm' }, now: () => NOW, sdk: async () => { throw new Error('binary missing'); }, zod: async () => zod });
  const errWas = console.error; console.error = () => {};
  r = await agent.run('u1', { window: 'night' });
  console.error = errWas;
  ck('when the agent cannot run, the rules still raise the alerts', r.source === 'rules' && r.alerts.length >= 5 && r.alerts.every((a) => a.window === 'night'));
  ck('and the reason is kept for the logs', /binary missing/.test(get('users/u1/agent/last/error')));
  agent = makeAgent({ db: fakeDb, cfg: { model: 'm' }, now: () => NOW });
  r = await agent.run('u1');
  ck('with no API key it goes straight to the rules', r.source === 'rules');

  // =================================================== the schedule
  set('srv/agentUsers/u2', { on: true, tz: TZ, ran: {} });
  set('srv/agentUsers/u3', { on: false, tz: TZ });
  set('srv/agentUsers/u4', { on: true, tz: 'Asia/Tokyo' });
  let d = await due(fakeDb, Date.parse('2026-09-28T22:00:00Z'));    // 18:00 New York, 07:00 Tokyo
  ck('due: past 17:30 in New York and not yet run -> evening audit', d.some((j) => j.uid === 'u2' && j.window === 'evening'));
  ck('due: already ran this evening -> not again', !d.some((j) => j.uid === 'u1'));
  ck('due: switched off -> never', !d.some((j) => j.uid === 'u3'));
  ck('due: 07:00 in Tokyo is before the 07:30 morning check', !d.some((j) => j.uid === 'u4'));
  d = await due(fakeDb, Date.parse('2026-09-28T23:00:00Z'));        // 08:00 Tokyo
  ck('due: 08:00 in Tokyo -> morning audit', d.some((j) => j.uid === 'u4' && j.window === 'morning'));

  // =================================================== the app's routes
  let a = await call('POST', '/agent/settings', { token: 'good-u5', body: { on: true, tz: 'Europe/London', times: { morning: 420, night: 1350, bogus: 5 } } });
  ck('settings switch the audits on with the time zone', a.status === 200 && get('srv/agentUsers/u5/on') === true && get('srv/agentUsers/u5/tz') === 'Europe/London'
    && get('srv/agentUsers/u5/times/morning') === 420 && get('srv/agentUsers/u5/times/bogus') === null);
  ck('a made-up time zone is ignored', (await call('POST', '/agent/settings', { token: 'good-u6', body: { on: true, tz: 'x"; drop' } })).status === 200 && !get('srv/agentUsers/u6/tz'));
  a = await call('POST', '/agent/run', { token: 'good-u5', body: { window: 'morning' } });
  ck('Check now queues an audit for the worker', a.status === 200 && get('srv/agentQueue/u5/window') === 'morning');
  ck('a second Check now while one runs is refused', (await call('POST', '/agent/run', { token: 'good-u5' })).status === 409);
  ck('the routes need a signed-in person', (await call('POST', '/agent/run', {})).status === 401);
  a = await call('POST', '/agent/alerts/2026-09-28_sleep', { token: 'good-u1', body: { state: 'done' } });
  ck('an alert can be ticked off', a.status === 200 && get('users/u1/agent/alerts/2026-09-28_sleep/state') === 'done');
  ck('only seen or done', (await call('POST', '/agent/alerts/2026-09-28_sleep', { token: 'good-u1', body: { state: 'deleted' } })).status === 400);
  ck('only real alert ids', (await call('POST', '/agent/alerts/..%2F..%2Fsrv', { token: 'good-u1', body: { state: 'done' } })).status === 400);
  a = await call('GET', '/agent', { token: 'good-u1' });
  ck('GET /agent returns the last audit and the alerts, newest first', a.status === 200 && a.body.alerts.length >= 5 && a.body.last && a.body.on === true);

  // =================================================== the watch sync keeps a daily row
  set('srv/healthTokens/tokABCDEFGHIJKLMNOPQRSTUV', 'u5');
  a = await call('POST', '/health/tokABCDEFGHIJKLMNOPQRSTUV', { body: { hr: 58, hrv: 47, sleep: '7h 10m' } });
  const today = W.dayOf(Date.now(), 'Europe/London');
  ck('each watch sync also writes the day’s row for trends', a.status === 200 && get(`srv/healthDays/u5/${today}/hr`) === 58 && get(`srv/healthDays/u5/${today}/hrv`) === 47);

  let p = 0, f = 0;
  T.forEach(([n, ok]) => { console.log((ok ? 'PASS' : 'FAIL') + ' - ' + n); ok ? p++ : f++; });
  console.log('\n' + p + '/' + (p + f) + ' passing');
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
