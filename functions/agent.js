/* The wellness agent - an audit loop built on the Claude Agent SDK
   (@anthropic-ai/claude-agent-sdk, the TypeScript/Node build of
   claude-agent-sdk).

   Three times a day (morning, evening, night, in the person's own time
   zone) and whenever they tap "Check now", it:

     1. reads the seven metrics through its own tools, one category at a
        time, in a fixed order - vitals & workout, then sleep, then fuel;
     2. records a finding for every metric, in order (ok / watch / fix /
        neglect) - the loop is sequential and the server checks that all
        seven were looked at;
     3. raises an alert for each thing that needs fixing, with the window it
        belongs to (morning / evening / night), what is wrong in numbers,
        and one exact action;
     4. finishes with a one-line summary.

   The model gets NO built-in tools (no shell, files or web) - only the
   seven-metric tools below, all read-only except the two that record its
   findings. Its alerts land in users/{uid}/agent, which the app listens to
   and shows as a pop-up.

   If the SDK or the model is unavailable the same audit runs on plain
   rules (wellness.js), so the pop-up never goes quiet because of an
   outage. */

const os = require('os');
const path = require('path');
const W = require('./wellness');

const SYSTEM = `You are Kova's wellness auditor. You check one person's seven core metrics and tell them exactly what to fix, and when.

Work in this exact order, one step at a time:
1. Call get_time_context.
2. Call read_vitals_workout, then record_finding for rhr, hrv and training (in that order).
3. Call read_sleep, then record_finding for sleep and bedtime.
4. Call read_fuel, then record_finding for food and hydration.
5. For every metric that needs action, call raise_alert once. Put each action in the window where it can still be done:
   - morning: things to do today (hydration catch-up, training focus, protein at breakfast, daylight)
   - evening: afternoon and evening fixes (caffeine cut-off, dinner, a short session, wind-down plan)
   - night: final recovery and bedtime prep (bedtime target, room, screens, late snack)
   The current window comes first; only use a later window when the fix belongs there.
6. Call finish with a one-sentence summary.

Rules:
- Use the person's own numbers and baselines from the tools. Never invent a number.
- "neglect" means the data is missing or stale - say what to log or wear, not a health judgement.
- severity: urgent = act today; soon = within a day or two; fyi = worth knowing.
- One alert per metric at most. No alert for metrics that are fine.
- Actions are specific and doable: an amount, a time, a duration. No generic wellness advice.
- You are not a doctor. If resting heart rate is 10+ bpm above normal for days, or anything looks like illness, the action is to rest and check in with a doctor if it persists.`;

function makeAgent(deps) {
  const { db, cfg } = deps;
  const now = deps.now || Date.now;
  const loadSdk = deps.sdk || (() => import('@anthropic-ai/claude-agent-sdk'));
  const loadZod = deps.zod || (() => import('zod'));

  /* the tools, the loop, and what it recorded */
  async function viaAgent(audit) {
    const sdk = await loadSdk();
    const zmod = await loadZod();
    const z = zmod.z || zmod.default || zmod;
    const { query, tool, createSdkMcpServer } = sdk;
    const got = { reads: [], findings: [], alerts: [], summary: '' };
    const txt = (o) => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] });
    const pick = (ids) => audit.metrics.filter((m) => ids.includes(m.id));

    const server = createSdkMcpServer({
      name: 'kova', version: '1.0.0',
      tools: [
        tool('get_time_context', 'The person\'s local time, weekday and current action window (morning, evening or night), plus their targets.',
          {}, async () => { got.reads.push('time'); return txt({ local: audit.local.text, date: audit.local.date, window: audit.window, targets: audit.targets }); }),
        tool('read_vitals_workout', 'Resting heart rate, HRV and training load: latest values, personal baselines, recent trend, days since data.',
          {}, async () => { got.reads.push('vitals'); return txt(pick(['rhr', 'hrv', 'training'])); }),
        tool('read_sleep', 'Sleep duration (last night, 7-day average, sleep debt) and bedtime consistency (spread in minutes, average bedtime).',
          {}, async () => { got.reads.push('sleep'); return txt(pick(['sleep', 'bedtime'])); }),
        tool('read_fuel', 'Protein and calories (today, 3-day average, targets) and hydration (litres so far, where they should be by now).',
          {}, async () => { got.reads.push('fuel'); return txt(pick(['food', 'hydration'])); }),
        tool('record_finding', 'Record the audit result for one metric. Call once per metric, in order.',
          { metric: z.enum(W.IDS), status: z.enum(['ok', 'watch', 'fix', 'neglect']), note: z.string().max(240) },
          async (a) => {
            const want = W.IDS[got.findings.length];
            if (a.metric !== want) return txt(`Out of order: audit ${want} next.`);
            got.findings.push(a);
            return txt(`${got.findings.length}/7 recorded.`);
          }),
        tool('raise_alert', 'Tell the person about one thing to fix. Shows as a pop-up in the app.',
          { metric: z.enum(W.IDS), severity: z.enum(['urgent', 'soon', 'fyi']), window: z.enum(W.WINDOWS),
            title: z.string().max(70), wrong: z.string().max(260), action: z.string().max(320) },
          async (a) => {
            if (got.alerts.some((x) => x.metric === a.metric)) return txt('Already raised for that metric.');
            got.alerts.push(a); return txt('Raised.');
          }),
        tool('finish', 'End the audit with a one-sentence summary.', { summary: z.string().max(240) },
          async (a) => { got.summary = a.summary; return txt('Done.'); })
      ]
    });

    const tmp = path.join(os.tmpdir(), 'kova-agent');
    const names = ['get_time_context', 'read_vitals_workout', 'read_sleep', 'read_fuel', 'record_finding', 'raise_alert', 'finish'];
    const q = query({
      prompt: `Run the ${audit.window} audit now. It is ${audit.local.text} for this person.`,
      options: {
        systemPrompt: SYSTEM,
        model: cfg.agentModel || cfg.model,
        tools: [],                                             // no built-in tools at all
        mcpServers: { kova: server },
        allowedTools: names.map((n) => `mcp__kova__${n}`),
        permissionMode: 'dontAsk',                              // anything not listed is refused
        settingSources: [],
        persistSession: false,
        maxTurns: 30,
        maxBudgetUsd: cfg.agentBudgetUsd || 0.4,
        cwd: os.tmpdir(),
        env: Object.assign({}, process.env, {
          ANTHROPIC_API_KEY: cfg.anthropicKey, HOME: tmp, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'),
          CLAUDE_AGENT_SDK_CLIENT_APP: 'kova-wellness/1.0'
        })
      }
    });
    let result = null;
    for await (const msg of q) {
      if (msg && msg.type === 'result') result = msg;
    }
    if (!result || result.subtype !== 'success' || result.is_error) {
      throw new Error('agent ended: ' + (result ? result.subtype : 'no result'));
    }
    return Object.assign(got, { cost: result.total_cost_usd || 0, turns: result.num_turns || 0 });
  }

  /* The same audit on the plain Messages API: the same seven tools and
     rules, a tool-use loop written out by hand. Used where the SDK cannot
     start its own process (Netlify functions), or when KOVA_AGENT_MODE=api. */
  async function viaApi(audit) {
    const fetch = deps.fetch || ((...a) => global.fetch(...a));
    const got = { reads: [], findings: [], alerts: [], summary: '' };
    const pick = (ids) => audit.metrics.filter((m) => ids.includes(m.id));
    const obj = (props, req) => ({ type: 'object', properties: props || {}, required: req || [] });
    const tools = [
      { name: 'get_time_context', description: 'The person\'s local time, weekday and current action window (morning, evening or night), plus their targets.', input_schema: obj() },
      { name: 'read_vitals_workout', description: 'Resting heart rate, HRV and training load: latest values, personal baselines, recent trend, days since data.', input_schema: obj() },
      { name: 'read_sleep', description: 'Sleep duration (last night, 7-day average, sleep debt) and bedtime consistency (spread in minutes, average bedtime).', input_schema: obj() },
      { name: 'read_fuel', description: 'Protein and calories (today, 3-day average, targets) and hydration (litres so far, where they should be by now).', input_schema: obj() },
      { name: 'record_finding', description: 'Record the audit result for one metric. Call once per metric, in order.',
        input_schema: obj({ metric: { type: 'string', enum: W.IDS }, status: { type: 'string', enum: ['ok', 'watch', 'fix', 'neglect'] }, note: { type: 'string', maxLength: 240 } }, ['metric', 'status', 'note']) },
      { name: 'raise_alert', description: 'Tell the person about one thing to fix. Shows as a pop-up in the app.',
        input_schema: obj({ metric: { type: 'string', enum: W.IDS }, severity: { type: 'string', enum: ['urgent', 'soon', 'fyi'] }, window: { type: 'string', enum: W.WINDOWS },
          title: { type: 'string', maxLength: 70 }, wrong: { type: 'string', maxLength: 260 }, action: { type: 'string', maxLength: 320 } }, ['metric', 'severity', 'window', 'title', 'wrong', 'action']) },
      { name: 'finish', description: 'End the audit with a one-sentence summary.', input_schema: obj({ summary: { type: 'string', maxLength: 240 } }, ['summary']) }
    ];
    const cut = (v, n) => String(v == null ? '' : v).slice(0, n);
    function runTool(name, a) {
      a = a || {};
      if (name === 'get_time_context') { got.reads.push('time'); return { local: audit.local.text, date: audit.local.date, window: audit.window, targets: audit.targets }; }
      if (name === 'read_vitals_workout') { got.reads.push('vitals'); return pick(['rhr', 'hrv', 'training']); }
      if (name === 'read_sleep') { got.reads.push('sleep'); return pick(['sleep', 'bedtime']); }
      if (name === 'read_fuel') { got.reads.push('fuel'); return pick(['food', 'hydration']); }
      if (name === 'record_finding') {
        const want = W.IDS[got.findings.length];
        if (a.metric !== want) return `Out of order: audit ${want} next.`;
        if (!['ok', 'watch', 'fix', 'neglect'].includes(a.status)) return 'Status is ok, watch, fix or neglect.';
        got.findings.push({ metric: a.metric, status: a.status, note: cut(a.note, 240) });
        return `${got.findings.length}/7 recorded.`;
      }
      if (name === 'raise_alert') {
        if (!W.IDS.includes(a.metric)) return 'Unknown metric.';
        if (got.alerts.some((x) => x.metric === a.metric)) return 'Already raised for that metric.';
        got.alerts.push({ metric: a.metric, severity: ['urgent', 'soon', 'fyi'].includes(a.severity) ? a.severity : 'soon',
          window: W.WINDOWS.includes(a.window) ? a.window : audit.window, title: cut(a.title, 70), wrong: cut(a.wrong, 260), action: cut(a.action, 320) });
        return 'Raised.';
      }
      if (name === 'finish') { got.summary = cut(a.summary, 240); return 'Done.'; }
      return 'Unknown tool.';
    }
    const messages = [{ role: 'user', content: `Run the ${audit.window} audit now. It is ${audit.local.text} for this person.` }];
    let turns = 0, inTok = 0, outTok = 0;
    while (turns < 30 && !got.summary) {
      turns++;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: cfg.agentModel || cfg.model, max_tokens: 1024, system: SYSTEM, tools, messages })
      });
      if (!r.ok) throw new Error('model HTTP ' + r.status);
      const j = await r.json();
      inTok += (j.usage && j.usage.input_tokens) || 0; outTok += (j.usage && j.usage.output_tokens) || 0;
      messages.push({ role: 'assistant', content: j.content || [] });
      const uses = (j.content || []).filter((b) => b.type === 'tool_use');
      if (!uses.length) break;
      messages.push({ role: 'user', content: uses.map((b) => {
        const out = runTool(b.name, b.input);
        return { type: 'tool_result', tool_use_id: b.id, content: typeof out === 'string' ? out : JSON.stringify(out) };
      }) });
      /* a rough spend guard: $3 in / $15 out per million tokens */
      if ((inTok * 3 + outTok * 15) / 1e6 > (cfg.agentBudgetUsd || 0.4)) break;
    }
    if (!got.findings.length && !got.summary) throw new Error('agent ended without an audit');
    return Object.assign(got, { cost: (inTok * 3 + outTok * 15) / 1e6, turns });
  }

  /* one audit for one person; writes the alerts the app shows */
  async function run(uid, o) {
    o = o || {};
    const set = (await db.ref(`srv/agentUsers/${uid}`).once('value')).val() || {};
    const t = now();
    const tz = o.tz || set.tz || 'UTC';
    const data = await W.gather(db, uid, t);
    const audit = W.metrics(data, t, tz);
    if (o.window && W.WINDOWS.includes(o.window)) audit.window = o.window;
    const rules = W.rulesAlerts(audit);

    let out, source = 'rules', err = '';
    if (cfg.anthropicKey && !o.rulesOnly) {
      try {
        if (cfg.agentMode === 'api') out = await viaApi(audit);
        else {
          try { out = await viaAgent(audit); }
          catch (e) {
            /* the SDK needs its own process; where it cannot start one, the API loop does the same audit */
            if (!/Cannot find (module|package)|ERR_MODULE_NOT_FOUND|spawn|ENOENT|executable/i.test(String(e && e.message || e))) throw e;
            out = await viaApi(audit);
          }
        }
        source = 'agent';
        // every metric gets a finding, even if the model stopped early
        const seen = out.findings.map((f) => f.metric);
        audit.metrics.forEach((m) => { if (!seen.includes(m.id)) out.findings.push({ metric: m.id, status: m.status, note: m.flags[0] || '', filled: true }); });
      } catch (e) {
        err = String(e && e.message || e).slice(0, 200);
        console.error('wellness agent', uid, err);
      }
    }
    if (!out) {
      out = { findings: audit.metrics.map((m) => ({ metric: m.id, status: m.status, note: m.flags[0] || '' })),
              alerts: rules, summary: summaryOf(audit), cost: 0, turns: 0 };
    }

    /* one open alert per metric per day: a newer one replaces it */
    const ref = db.ref(`users/${uid}/agent`);
    const open = (await ref.child('alerts').once('value')).val() || {};
    const day = W.dayOf(t, tz);
    const upd = {};
    const made = [];
    for (const a of out.alerts) {
      const meta = W.METRICS.find((m) => m.id === a.metric);
      const id = `${day}_${a.metric}`;
      const prev = open[id];
      if (prev && prev.state === 'done') continue;               // already fixed today
      const rec = { id, at: t, day, window: a.window || audit.window, metric: a.metric, category: meta ? meta.catN : '',
                    severity: a.severity || 'soon', title: a.title || '', wrong: a.wrong || '', action: a.action || '',
                    source: a.source || source, state: prev && prev.state === 'seen' && prev.action === a.action ? 'seen' : 'new' };
      upd[`alerts/${id}`] = rec; made.push(rec);
    }
    // alerts older than a week go
    Object.keys(open).forEach((k) => { if ((open[k].at || 0) < t - 7 * 864e5) upd[`alerts/${k}`] = null; });
    upd.last = { at: t, window: audit.window, local: audit.local.text, source, summary: out.summary || summaryOf(audit),
                 findings: out.findings, cost: Math.round((out.cost || 0) * 10000) / 10000, error: err || null };
    await ref.update(upd);
    await db.ref(`srv/agentUsers/${uid}/ran/${audit.window}`).set(day);
    return { source, window: audit.window, alerts: made, findings: out.findings, summary: upd.last.summary };
  }

  return { run, viaAgent, viaApi };
}

function summaryOf(audit) {
  const bad = audit.metrics.filter((m) => m.status === 'fix').map((m) => m.name.toLowerCase());
  const miss = audit.metrics.filter((m) => m.status === 'neglect').map((m) => m.name.toLowerCase());
  if (!bad.length && !miss.length) return 'All seven look fine right now.';
  return [bad.length ? `Fix: ${bad.join(', ')}.` : '', miss.length ? `No recent data: ${miss.join(', ')}.` : ''].filter(Boolean).join(' ');
}

/* which people are due an audit now: their local time has passed the
   window's check time and it has not run for that window today */
const CHECK = { morning: 7 * 60 + 30, evening: 17 * 60 + 30, night: 21 * 60 + 30 };
async function due(db, t) {
  const all = (await db.ref('srv/agentUsers').once('value')).val() || {};
  const out = [];
  for (const uid of Object.keys(all)) {
    const u = all[uid] || {};
    if (!u.on) continue;
    const L = W.local(t, u.tz || 'UTC');
    const win = W.windowOf(L.mins);
    const at = (u.times && u.times[win] != null ? u.times[win] : CHECK[win]);
    const after = win === 'night' && L.mins < 240 ? true : L.mins >= at;
    if (after && (u.ran || {})[win] !== W.dayOf(t, u.tz)) out.push({ uid, window: win });
  }
  return out;
}

module.exports = { makeAgent, due, SYSTEM, CHECK };
