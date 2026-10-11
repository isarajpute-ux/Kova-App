/* AI team routines while Kova is closed (p15).

   An employee whose routine you mark "Also run when Kova is closed" is
   registered here (POST /crew/cloud). Every 5 minutes the timer looks for
   routines whose time has come in your time zone; the background worker
   then does the job with Claude against your synced Work OS (the copy in
   your own users/<uid>/store, the same data the app shows).

   It never edits Work OS on the server: the app on your phone may be
   changing the same data at that moment, and a server write could undo
   your edits. Instead it reads, writes the report, and PROPOSES each
   change (a task to add, a date to move, an email to send). The result
   lands in users/<uid>/crewInbox and a push tells you it is done. When
   you open Kova the job appears with its changes waiting for one tap
   each (and undo), exactly like a job that ran in the app.

   Limits: the employee's weekly step budget, at most 6 thinking steps a
   run, and a routine runs at most once a day. If the app was open and
   already ran it (its lastRoutine is after the slot), the server skips. */

const W = require('./wellness');

const DAY = 864e5;
const MAX_TURNS = 6;
const MODELS = { haiku: 'claude-haiku-4-5-20251001', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
const AUTO = { chief: 'sonnet', pm: 'haiku', analyst: 'sonnet', inbox: 'haiku', content: 'sonnet', research: 'sonnet', finance: 'haiku', sched: 'haiku', coach: 'haiku', social: 'sonnet' };
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/* the open app gets the first few minutes to run it itself */
const GRACE = 6, WINDOW = 40;

function parse(v) {
  if (v == null) return null;
  if (typeof v === 'object' && typeof v.v === 'string') { try { return JSON.parse(v.v); } catch (e) { return null; } }
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } }
  return v;
}
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : -1; };

/* ---- the registry the app keeps up to date ---- */
function cleanCloud(b) {
  const list = Array.isArray(b && b.emps) ? b.emps : [];
  const tz = String((b && b.tz) || 'UTC').slice(0, 64);
  const out = {};
  list.slice(0, 20).forEach((e) => {
    const id = String((e && e.id) || '').replace(/[^\w-]/g, '').slice(0, 40);
    const freq = ['daily', 'weekdays', 'weekly'].includes(e && e.freq) ? e.freq : null;
    const t = hm(e && e.time);
    if (!id || !freq || t < 0) return;
    out[id] = { freq, time: e.time, dow: Math.max(0, Math.min(6, +e.dow || 0)) };
  });
  return { tz, emps: out };
}

/* ---- whose routine is due now ---- */
function slotDue(r, L) {
  const at = hm(r.time); if (at < 0) return false;
  const wd = DOW[L.weekday];
  if (r.freq === 'weekdays' && (wd === 0 || wd === 6)) return false;
  if (r.freq === 'weekly' && wd !== (+r.dow % 7)) return false;
  return L.mins >= at + GRACE && L.mins < at + WINDOW;
}
async function due(db, t) {
  const all = (await db.ref('srv/crewCloud').once('value')).val() || {};
  const out = [];
  for (const uid of Object.keys(all)) {
    const u = all[uid] || {}, L = W.local(t, u.tz || 'UTC');
    for (const id of Object.keys(u.emps || {})) {
      const r = u.emps[id];
      if (!slotDue(r, L)) continue;
      if (((u.ran || {})[id]) === L.date) continue;
      out.push({ uid, emp: id, date: L.date, slotAgo: L.mins - hm(r.time) });
    }
  }
  return out;
}

/* ---- the person's Work OS, read only ---- */
async function workOf(db, uid) {
  const raw = (await db.ref(`users/${uid}/store/kova_profile_v2`).once('value')).val();
  const profile = parse(raw) || {};
  const w = profile.work_os || {};
  return { items: w.items || [], projects: w.projects || [], goals: w.goals || [], meetings: w.meetings || [], agents: w.agents || [], profile: w.profile || {} };
}
function sod(t, tz) { const L = W.local(t, tz); return t - (L.mins * 60e3) - (new Date(t).getSeconds() * 1000); }
function readWork(w, now, tz) {
  const s = sod(now, tz), open = w.items.filter((i) => i.status !== 'Completed');
  const od = open.filter((i) => i.due && i.due < s);
  const today = open.filter((i) => i.due && i.due >= s && i.due < s + DAY);
  const week = open.filter((i) => i.due && i.due >= s && i.due < s + 7 * DAY);
  const done7 = w.items.filter((i) => i.status === 'Completed' && (i.completedAt || i.updated || 0) >= now - 7 * DAY);
  const byStatus = {}; w.items.forEach((i) => { const k = i.status || 'Not Started'; byStatus[k] = (byStatus[k] || 0) + 1; });
  return { open: open.length, overdue: od.length, due_today: today.length, due_this_week: week.length, completed_7d: done7.length, by_status: byStatus,
    projects: w.projects.map((p) => ({ name: p.name, due: p.due ? new Date(p.due).toISOString().slice(0, 10) : null })),
    goals: w.goals.map((g) => ({ name: g.name, current: g.current, target: g.target, unit: g.unit || '' })),
    meetings_next_7d: w.meetings.filter((m) => m.at && m.at > now && m.at < now + 7 * DAY).map((m) => ({ title: m.title || m.name, at: new Date(m.at).toISOString() })) };
}
function listTasks(w, a, now, tz) {
  const s = sod(now, tz), f = (a && a.filter) || 'open';
  const keep = { overdue: (i) => i.status !== 'Completed' && i.due && i.due < s, today: (i) => i.status !== 'Completed' && i.due && i.due >= s && i.due < s + DAY,
    week: (i) => i.status !== 'Completed' && i.due && i.due >= s && i.due < s + 7 * DAY, open: (i) => i.status !== 'Completed', waiting: (i) => i.status === 'Waiting',
    done_recent: (i) => i.status === 'Completed' && (i.completedAt || 0) >= now - 7 * DAY, all: () => true }[f] || ((i) => i.status !== 'Completed');
  return w.items.filter(keep).slice(0, Math.min(50, +(a && a.limit) || 25)).map((i) => ({ name: i.name, status: i.status, priority: i.priority,
    due: i.due ? new Date(i.due).toISOString().slice(0, 10) : 'no date', notes: String(i.notes || '').slice(0, 160) }));
}

/* ---- the tools: reading is real, changing is proposed ---- */
const S = { type: 'string' }, N = { type: 'number' };
const obj = (p, r) => ({ type: 'object', properties: p, required: r || [] });
const PRI = { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low'] }, STA = { type: 'string', enum: ['Not Started', 'In Progress', 'Waiting', 'Completed'] };
const TOOLS = {
  read_work: { d: 'Overview of all the work right now: counts by status, overdue, due today and this week, projects, goals, meetings.', s: obj({}) },
  list_tasks: { d: 'List tasks. filter: overdue, today, week, open, waiting, done_recent or all.', s: obj({ filter: { type: 'string', enum: ['overdue', 'today', 'week', 'open', 'waiting', 'done_recent', 'all'] }, limit: N }) },
  create_task: { d: 'Propose a new task (the user approves it when they open Kova).', s: obj({ name: S, priority: PRI, due: { type: 'string', description: 'today, tomorrow, +3d or YYYY-MM-DD' }, notes: S }, ['name']), propose: true },
  update_task: { d: 'Propose a change to an existing task, by name: status, priority, due or notes.', s: obj({ name: S, status: STA, priority: PRI, due: S, notes: S }, ['name']), propose: true },
  draft_email: { d: 'Write an email for the user to approve and send. to = email address.', s: obj({ to: S, subject: S, body: S }, ['to', 'subject', 'body']), propose: true },
  write_report: { d: 'Finish with a report: title, summary, up to 5 metrics {label,value,note}, and sections {heading,text}.',
    s: obj({ title: S, summary: S, metrics: { type: 'array', items: obj({ label: S, value: S, note: S }, ['label', 'value']) }, sections: { type: 'array', items: obj({ heading: S, text: S }, ['heading', 'text']) } }, ['title', 'summary']) }
};
const GROUP = { create_task: 'tasks', update_task: 'tasks', draft_email: 'email' };
function toolsFor(e) {
  const g = ['read', 'always'].concat(e.tools || []);
  return Object.keys(TOOLS).filter((k) => !GROUP[k] || g.includes(GROUP[k]));
}
function systemFor(e, w, now, tz) {
  const L = W.local(now, tz);
  return `You are ${e.n}, ${e.title} on the user's team inside Kova Work OS, running your routine while the app is closed.\n\n`
    + `YOUR JOB\n${String(e.job || '').slice(0, 4000)}\n\n${e.playbook ? 'HOW YOU WORK\n' + String(e.playbook).slice(0, 4000) + '\n\n' : ''}`
    + 'RULES\n- Read the work first, then do the job with real numbers from it. Never invent a figure.\n'
    + '- You cannot change anything directly now: create_task, update_task and draft_email are PROPOSALS the user approves when they open Kova. Propose only what is clearly worth doing (at most 6).\n'
    + '- Finish by calling write_report exactly once, then reply with one short closing sentence.\n- Write plainly, like a capable colleague. No emojis.\n\n'
    + `ABOUT THE BUSINESS\n${JSON.stringify(w.profile).slice(0, 1500)}\n\nNow: ${L.text} (${tz}).`;
}

function makeCrew(deps) {
  const { db, cfg } = deps;
  const now = deps.now || Date.now;
  const fetchFn = deps.fetch || globalThis.fetch;

  async function run(uid, empId, opts) {
    opts = opts || {};
    const t = now();
    const reg = ((await db.ref(`srv/crewCloud/${uid}`).once('value')).val()) || {};
    const tz = reg.tz || 'UTC', L = W.local(t, tz);
    const w = await workOf(db, uid);
    const e = (w.agents || []).find((a) => a && a.id === empId && a.crew);
    const mark = () => db.ref(`srv/crewCloud/${uid}/ran/${empId}`).set(L.date);
    if (!e || !e.enabled || !e.routine || !e.routine.job) { await mark(); return { skipped: 'no such routine' }; }
    /* the open app already did it after the slot */
    if (opts.slotAgo != null && e.lastRoutine && e.lastRoutine >= t - opts.slotAgo * 60e3) { await mark(); return { skipped: 'ran in the app' }; }
    if (!cfg.anthropicKey) { await mark(); return { skipped: 'no Claude key on the server' }; }
    /* the weekly step budget, shared with the app's count only roughly */
    const wk = W.local(t - ((DOW[L.weekday] + 6) % 7) * DAY, tz).date;
    const useRef = db.ref(`srv/crewUse/${uid}/${wk}/${empId}`);
    let used = (await useRef.once('value')).val() || 0;
    const budget = +e.budget || 150;
    const model = (e.model && MODELS[e.model]) ? e.model : (AUTO[e.tpl] || 'sonnet');
    const tools = toolsFor(e).map((k) => ({ name: k, description: TOOLS[k].d, input_schema: TOOLS[k].s }));
    const convo = [{ role: 'user', content: String(e.routine.job).slice(0, 4000) }];
    const steps = [], proposals = [];
    let report = null, say = '', turns = 0;
    while (turns < MAX_TURNS) {
      if (used >= budget) { say = `I stopped: I have used my ${budget} steps for this week.`; break; }
      const r = await fetchFn('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODELS[model], max_tokens: 2000, system: systemFor(e, w, t, tz), tools, messages: convo }) });
      used++; turns++;
      if (!r.ok) { say = 'I could not think just now; I will try again at the next routine.'; break; }
      const j = await r.json();
      const content = Array.isArray(j.content) ? j.content : [];
      convo.push({ role: 'assistant', content });
      content.forEach((b) => { if (b.type === 'text' && b.text && b.text.trim()) say = b.text.trim(); });
      const uses = content.filter((b) => b.type === 'tool_use');
      if (!uses.length) break;
      const results = uses.map((u) => {
        let out;
        if (!toolsFor(e).includes(u.name)) out = { error: `You do not have the ${u.name} tool.` };
        else if (u.name === 'read_work') { out = readWork(w, t, tz); steps.push({ t: `Read the work: ${out.open} open, ${out.overdue} overdue, ${out.due_today} due today`, k: 'read' }); }
        else if (u.name === 'list_tasks') { out = listTasks(w, u.input, t, tz); steps.push({ t: `Listed ${out.length} task${out.length === 1 ? '' : 's'} (${(u.input && u.input.filter) || 'open'})`, k: 'read' }); }
        else if (u.name === 'write_report') { report = u.input || null; out = { ok: true }; steps.push({ t: 'Wrote the report', k: 'report' }); }
        else if (TOOLS[u.name] && TOOLS[u.name].propose) {
          if (proposals.length >= 6) out = { error: 'That is enough proposals for one run.' };
          else { proposals.push({ name: u.name, input: u.input || {} }); out = { ok: true, proposed: true, note: 'The user approves this when they open Kova.' }; steps.push({ t: `Proposed: ${u.name.replace(/_/g, ' ')} "${(u.input && (u.input.name || u.input.subject)) || ''}"`, k: 'wait' }); }
        } else out = { error: 'unknown tool' };
        return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 9000), is_error: !!out.error };
      });
      convo.push({ role: 'user', content: results });
    }
    await useRef.set(used);
    const id = 'c' + t.toString(36) + '_' + empId.replace(/[^\w]/g, '').slice(-8) + Math.random().toString(36).slice(2, 6);
    const item = { id, emp: empId, text: String(e.routine.job).slice(0, 4000), at: t, model, steps, proposals, report, say: say.slice(0, 2000) };
    await db.ref(`users/${uid}/crewInbox/${id}`).set(item);
    await mark();
    if (deps.push) {
      try { await deps.push.send(uid, { id, kind: 'crew', screen: 'workteam', title: `${e.n} finished your routine`,
        body: proposals.length ? `${proposals.length} change${proposals.length > 1 ? 's' : ''} to approve. ${say}`.slice(0, 180) : (say || String(e.routine.job)).slice(0, 180) }); }
      catch (x) { /* no devices, or push not set up */ }
    }
    return { id, proposals: proposals.length, turns };
  }
  return { run };
}

module.exports = { makeCrew, due, cleanCloud, slotDue, readWork, listTasks, toolsFor, workOf, parse, TOOLS, MODELS, AUTO, GRACE, WINDOW };
