/* asks - messages to your AI team that get done while Kova is closed (p20).

   You do not have to check on the team; it comes back to you. Say it the
   way you would to a person:
       "Ravi, read https://example.com/pricing and tell me at 11 what we can use"
       "Leo, triage my overdue work by 5pm"
   The app turns that into a request here (POST /crew/ask). The timer
   starts it a few minutes before the time you asked for; the teammate does
   the job with Claude - reading your synced Work OS, searching the web,
   reading the page you gave (webpage.js) - and the answer lands in your
   team inbox with a push at that time. Like the routines (crew.js), it
   never edits Work OS on the server: changes come back as proposals you
   approve with one tap.

   Four kinds:
     ask       what you asked for
     prep      tomorrow's meetings from Google Calendar: what each is about,
               who is coming, what to bring, what to ask (each evening)
     checkin   the team checks on you: your day in two lines, one thing they
               can take off your plate, one question (at the time you set)
     comments  an hour after a post goes out, what people are saying

     srv/crewAsk/{uid}/{id}  {id, emp, text, url, kind, ref, created, runAt, deliverAt, state, tries}
     srv/crewPlan/{uid}      {tz, prep:{on,time,emp}, checkin:{on,time,emp}, ran:{prep,checkin}} */

const W = require('./wellness');
const crew = require('./crew');
const { fetchPage, checkUrl } = require('./webpage');

const DAY = 864e5;
const KINDS = ['ask', 'prep', 'checkin', 'comments'];
const LEAD = 4 * 60e3;          // start this long before the time you asked for
const MAX_PENDING = 25;
const MAX_TURNS = 8;
const PLAN_WINDOW = 40;         // minutes after the set time a daily one may still start
/* who does it when you did not name anyone */
const DEFAULT_TPL = { ask: 'chief', prep: 'sched', checkin: 'chief', comments: 'social' };

class AskError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const s = (v, n) => String(v == null ? '' : v).slice(0, n);
const hm = (x) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(x || '')); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : -1; };
const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

function cleanAsk(body, now) {
  body = body || {};
  const kind = KINDS.includes(body.kind) ? body.kind : 'ask';
  const text = s(body.text, 2000).trim();
  if (kind === 'ask' && text.length < 3) throw new AskError(400, 'Tell them what you need.');
  let url = s(body.url, 600).trim() || ((text.match(URL_RE) || [])[0] || '');
  if (url) url = checkUrl(url.replace(/[.,;:!?]+$/, '')).href;
  const emp = s(body.emp, 40).replace(/[^\w-]/g, '');
  let deliverAt = Math.round(+body.deliverAt || 0);
  if (!(deliverAt > now)) deliverAt = now;
  if (deliverAt > now + 30 * DAY) throw new AskError(400, 'Pick a time within the next 30 days.');
  const ref = s(body.ref, 64).replace(/[^\w-]/g, '');
  if (kind === 'comments' && !ref) throw new AskError(400, 'Which post?');
  const runAt = kind === 'comments' ? deliverAt : Math.max(now, deliverAt - LEAD);
  return { kind, text, url, emp, deliverAt, runAt, ref };
}

function cleanPlan(b) {
  b = b || {};
  const one = (x) => {
    x = x || {};
    const t = hm(x.time) >= 0 ? x.time : null;
    return { on: !!x.on && !!t, time: t || '18:00', emp: s(x.emp, 40).replace(/[^\w-]/g, '') };
  };
  return { tz: s(b.tz || 'UTC', 64), prep: one(b.prep), checkin: one(b.checkin) };
}

/* ---------------- the prompts ---------------- */
function aboutUser(w) { return JSON.stringify(w.profile || {}).slice(0, 1500); }
function systemFor(e, kind, w, t, tz, a) {
  const L = W.local(t, tz);
  const head = `You are ${e.n}, ${e.title} on the user's team inside Kova. You are working on the Kova server while their app is closed; what you finish is delivered to them${a.deliverAt > t + 60e3 ? ' at ' + new Date(a.deliverAt).toISOString() : ' now'} as a notification.\n\n`
    + `YOUR JOB\n${s(e.job, 3000)}\n\n${e.playbook ? 'HOW YOU WORK\n' + s(e.playbook, 3000) + '\n\n' : ''}`;
  const rules = 'RULES\n- Never invent a fact, price, number or quote. If you could not find something, say so plainly.\n'
    + '- You cannot change Work OS directly: create_task, update_task and draft_email are PROPOSALS the user approves with one tap (at most 6).\n'
    + '- Finish by calling write_report exactly once, then reply with one short closing sentence.\n- Plain words, like a capable colleague. No emojis.\n\n';
  const tail = `ABOUT THE USER AND THEIR BUSINESS\n${aboutUser(w)}\n\nNow: ${L.text} (${tz}).`;
  if (kind === 'prep') return head + 'TODAY\'S JOB: prepare the user for tomorrow\'s meetings, listed in the message.\n'
    + '- One section per meeting, heading "HH:MM Title". In each: what it is most likely about (from the title, notes and who is coming), who is coming, what to bring or have ready, and 2-3 sharp questions to ask.\n'
    + '- Use web_search only to look up an outside company or person when it would really help (at most 3 searches). Mention the joining link if there is one.\n'
    + '- The summary says how many meetings, the first one\'s time, and the single most important thing to prepare.\n' + rules + tail;
  if (kind === 'checkin') return head + 'TODAY\'S JOB: check in on the user, the way a good chief of staff does. Read the work first.\n'
    + '- write_report: title "Checking in", a 2-sentence summary of where their day stands, then two short sections: "I can take this off your plate" (one concrete thing, and propose it as a task or a hand-off) and "A question for you" (one question that would unblock something).\n'
    + '- Keep it short enough to read on a lock screen.\n' + rules + tail;
  return head + 'THE USER SENT YOU A REQUEST (in the message). Do it completely.\n'
    + '- Use web_search to find things out and fetch_page to read a page in full: always read the page the user gave you.\n'
    + '- write_report: a clear title, a 1-2 sentence summary that answers the request directly, then sections. For research use "What I found", "What we can use" and "Next steps". End with a "Sources" section listing the links you used.\n'
    + rules + tail;
}

/* ---------------- the tools ---------------- */
const STR = { type: 'string' };
const FETCH_TOOL = { name: 'fetch_page', description: 'Read one web page in full: its title, description, readable text and links. Use it for any address the user gave you.', input_schema: { type: 'object', properties: { url: STR }, required: ['url'] } };
function toolDefs(e) {
  return crew.toolsFor(e).map((k) => ({ name: k, description: crew.TOOLS[k].d, input_schema: crew.TOOLS[k].s })).concat([FETCH_TOOL]);
}

function makeAsks(deps) {
  const { db, cfg } = deps;
  const now = deps.now || Date.now;
  const fetchFn = deps.fetch || ((...a) => global.fetch(...a));
  const page = deps.fetchPage || ((u) => fetchPage(u, { fetch: fetchFn, lookup: deps.lookup }));

  /* ---- the app's side ---- */
  async function create(uid, body) {
    const t = now();
    const a = cleanAsk(body, t);
    const ref = db.ref(`srv/crewAsk/${uid}`);
    const all = (await ref.once('value')).val() || {};
    /* tidy: finished ones older than a week go */
    const old = {}; Object.keys(all).forEach((k) => { const x = all[k] || {}; if (x.state !== 'queued' && x.state !== 'running' && (x.created || 0) < t - 7 * DAY) old[k] = null; });
    if (Object.keys(old).length) await ref.update(old);
    const pending = Object.keys(all).filter((k) => all[k] && all[k].state === 'queued').length;
    if (pending >= MAX_PENDING) throw new AskError(429, 'Your team already has 25 requests waiting. Let them finish a few first.');
    const id = 'a' + t.toString(36) + Math.random().toString(36).slice(2, 7);
    const rec = Object.assign({ id, created: t, state: 'queued', tries: 0 }, a);
    await ref.child(id).set(rec);
    /* due now: straight onto the worker's queue */
    if (rec.runAt <= t + 60e3) await db.ref(`srv/crewQueue/${uid}/ask_${id}`).set({ ask: id, at: t });
    return { id, runAt: rec.runAt, deliverAt: rec.deliverAt, now: rec.runAt <= t + 60e3 };
  }
  async function list(uid) {
    const all = (await db.ref(`srv/crewAsk/${uid}`).once('value')).val() || {};
    return Object.keys(all).map((k) => all[k]).filter(Boolean).sort((a, b) => b.created - a.created).slice(0, 30)
      .map((x) => ({ id: x.id, emp: x.emp, kind: x.kind, text: x.text, url: x.url, deliverAt: x.deliverAt, state: x.state, created: x.created, doneAt: x.doneAt || 0 }));
  }
  async function cancel(uid, id) {
    id = s(id, 40).replace(/[^\w-]/g, '');
    const ref = db.ref(`srv/crewAsk/${uid}/${id}`);
    const x = (await ref.once('value')).val();
    if (!x) throw new AskError(404, 'That request is gone.');
    if (x.state === 'running') throw new AskError(409, 'They are already working on it.');
    await ref.remove();
    await db.ref(`srv/crewQueue/${uid}/ask_${id}`).remove();
    return { ok: true };
  }
  async function setPlan(uid, body) {
    const p = cleanPlan(body);
    const ref = db.ref(`srv/crewPlan/${uid}`);
    const prev = (await ref.once('value')).val() || {};
    if (!p.prep.on && !p.checkin.on) { await ref.remove(); return { ok: true, prep: p.prep, checkin: p.checkin }; }
    await ref.set(Object.assign(p, prev.ran ? { ran: prev.ran } : {}));
    return { ok: true, prep: p.prep, checkin: p.checkin };
  }
  async function getPlan(uid) {
    const p = (await db.ref(`srv/crewPlan/${uid}`).once('value')).val() || {};
    return { tz: p.tz || '', prep: p.prep || { on: false, time: '18:00' }, checkin: p.checkin || { on: false, time: '11:00' } };
  }

  /* ---- the timer's side: what is due now ---- */
  async function due(t) {
    t = t || now();
    /* the daily ones first: they become asks */
    const plans = (await db.ref('srv/crewPlan').once('value')).val() || {};
    for (const uid of Object.keys(plans)) {
      const p = plans[uid] || {}, L = W.local(t, p.tz || 'UTC');
      for (const kind of ['prep', 'checkin']) {
        const c = p[kind] || {}, at = hm(c.time);
        if (!c.on || at < 0 || L.mins < at || L.mins >= at + PLAN_WINDOW) continue;
        if (((p.ran || {})[kind]) === L.date) continue;
        await db.ref(`srv/crewPlan/${uid}/ran/${kind}`).set(L.date);           // mark first: never twice
        const id = kind[0] + t.toString(36) + Math.random().toString(36).slice(2, 6);
        await db.ref(`srv/crewAsk/${uid}/${id}`).set({ id, kind, emp: c.emp || '', text: kind === 'prep' ? 'Prepare me for tomorrow\'s meetings.' : 'Check in on me.',
          url: '', ref: '', created: t, runAt: t, deliverAt: t, state: 'queued', tries: 0 });
      }
    }
    const all = (await db.ref('srv/crewAsk').once('value')).val() || {};
    const out = [];
    for (const uid of Object.keys(all)) {
      for (const id of Object.keys(all[uid] || {})) {
        const a = all[uid][id];
        if (!a) continue;
        /* a run that died half way (the function was stopped): try twice more */
        if (a.state === 'running' && (a.startedAt || 0) < t - 20 * 60e3) {
          if ((a.tries || 0) < 2) { await db.ref(`srv/crewAsk/${uid}/${id}`).update({ state: 'queued', tries: (a.tries || 0) + 1, runAt: t }); out.push({ uid, id }); }
          else await db.ref(`srv/crewAsk/${uid}/${id}`).update({ state: 'failed', doneAt: t });
          continue;
        }
        if (a.state === 'queued' && a.runAt <= t) out.push({ uid, id });
      }
    }
    return out;
  }

  /* ---- doing one ---- */
  function pickEmp(w, a) {
    const team = (w.agents || []).filter((x) => x && x.crew && x.enabled !== false);
    return team.find((x) => x.id === a.emp) || team.find((x) => x.tpl === DEFAULT_TPL[a.kind]) || team.find((x) => x.tpl === 'chief') || team[0] || null;
  }
  async function think(model, system, convo, tools, web) {
    const all = tools.slice(); if (web) all.push({ type: 'web_search_20250305', name: 'web_search', max_uses: web });
    const r = await fetchFn('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: crew.MODELS[model] || crew.MODELS.sonnet, max_tokens: 3000, system, tools: all, messages: convo }) });
    if (!r.ok) throw new Error('Claude ' + r.status);
    return r.json();
  }

  async function run(uid, id, opts) {
    opts = opts || {};
    const t = now();
    const ref = db.ref(`srv/crewAsk/${uid}/${id}`);
    const a = (await ref.once('value')).val();
    if (!a || a.state !== 'queued') return { skipped: 'not waiting' };
    await ref.update({ state: 'running', startedAt: t });
    const w = await crew.workOf(db, uid);
    const e = pickEmp(w, a);
    const plan = (await db.ref(`srv/crewPlan/${uid}`).once('value')).val() || {};
    const cloud = (await db.ref(`srv/crewCloud/${uid}`).once('value')).val() || {};
    const tz = plan.tz || cloud.tz || 'UTC';
    const deliver = async (item, title) => {
      const full = Object.assign({ id, emp: e ? e.id : '', text: a.text, at: now(), steps: [], proposals: [], report: null, say: '', model: '' }, item,
        { ask: { kind: a.kind, url: a.url || '', deliverAt: a.deliverAt, ref: a.ref || '' } });
      await db.ref(`users/${uid}/crewInbox/${id}`).set(full);
      await ref.update({ state: 'done', doneAt: now() });
      if (deps.push) {
        try { await deps.push.send(uid, { id, kind: 'crew', screen: 'workteam', title: s(title, 80),
          body: s((full.report && full.report.summary) || full.say || a.text, 180) }); } catch (x) { /* no devices yet */ }
      }
      return { id, delivered: true, proposals: (full.proposals || []).length };
    };
    if (!e) return deliver({ say: 'Hire someone on your AI team first, then send this again.' }, 'Your AI team');
    const name = e.n;

    /* ---------- comments: Maya reads them an hour after the post ---------- */
    if (a.kind === 'comments') {
      if (!deps.traction) return deliver({ say: 'Reading comments is not set up on this server yet.' }, `${name}: comments`);
      let adv = null, why = '';
      try { await deps.traction.collect(uid, a.ref); adv = await deps.traction.advice(uid, a.ref, 'creator'); }
      catch (x) { why = String((x && x.message) || x); }
      const post = (await db.ref(`users/${uid}/traction/posts/${a.ref}`).once('value')).val() || {};
      const count = Object.keys(post.platforms || {}).reduce((n, k) => n + (((post.platforms[k] || {}).comments) || []).length, 0);
      if ((!adv || !count) && (a.tries || 0) < 3) {
        await ref.update({ state: 'queued', tries: (a.tries || 0) + 1, runAt: now() + 45 * 60e3 });
        return { requeued: true };
      }
      if (!adv) return deliver({ say: `No comments to read on that post yet${why ? ' (' + why + ')' : ''}. I will look again when you ask.` }, `${name}: no comments yet`);
      const themes = (adv.themes || []).slice(0, 5);
      const report = { title: `What people are saying about “${s(post.title || 'your post', 60)}”`, summary: s(adv.headline, 400),
        metrics: Object.keys(post.platforms || {}).slice(0, 3).map((k) => { const m = (post.platforms[k] || {}).metrics || {}; return { label: k, value: String(m.views != null ? m.views : (m.likes || 0)), note: m.views != null ? 'views' : 'likes' }; }),
        sections: [
          { heading: 'The top things people say', text: themes.length ? themes.map((x, i) => `${i + 1}. ${x.theme} (${x.share}% of comments, ${x.sentiment})${x.quote ? ': “' + x.quote + '”' : ''}`).join('\n') : 'Too few comments to see a pattern yet.' },
          (adv.working || []).length ? { heading: 'What is working', text: adv.working.map((x) => '- ' + x).join('\n') } : null,
          (adv.fix || []).length ? { heading: 'What to change next time', text: adv.fix.map((x) => '- ' + x).join('\n') } : null,
          adv.next && adv.next.hook ? { heading: 'Your next video', text: `Hook: ${adv.next.hook}${adv.next.length ? '\nLength: ' + adv.next.length : ''}${adv.next.when ? '\nPost: ' + adv.next.when : ''}` } : null
        ].filter(Boolean) };
      return deliver({ report, say: themes.length ? `Most common: ${themes[0].theme}.` : 'Here is how it is doing.', steps: [{ t: `Read ${count} comment${count === 1 ? '' : 's'}`, k: 'read' }, { t: 'Grouped them into themes', k: 'report' }] },
        `${name}: here is what people are saying`);
    }

    if (!cfg.anthropicKey) return deliver({ say: 'The Kova server has no Claude key yet, so I could not do this. Add ANTHROPIC_API_KEY on the server.' }, `${name} could not start`);

    /* ---------- prep: tomorrow's calendar ---------- */
    let firstMsg = a.text;
    if (a.kind === 'prep') {
      const L = W.local(t, tz);
      const start = t - L.mins * 60e3 + DAY - (new Date(t).getSeconds() * 1000);
      let evs = null;
      try { evs = await deps.calendar.events(uid, start, start + DAY); }
      catch (x) { return deliver({ say: 'I could not see your calendar. Connect Google (with Calendar) in Settings and I will prep your meetings every evening.' }, `${name}: connect your calendar`); }
      if (!evs.length) return deliver({ report: { title: 'Tomorrow: no meetings', summary: 'Nothing on your calendar tomorrow. A clear day for deep work.', sections: [] }, say: 'No meetings tomorrow.' }, `${name}: tomorrow is clear`);
      firstMsg = 'Tomorrow\'s meetings (times are ' + tz + '):\n' + JSON.stringify(evs.map((x) => ({ time: W.local(x.start, tz).text, minutes: Math.round((x.end - x.start) / 60e3), title: x.title, notes: x.description, organizer: x.organizer, attendees: x.attendees, location: x.location, link: x.link })));
    } else if (a.url) firstMsg = a.text + (a.text.indexOf(a.url) < 0 ? '\n\nThe page: ' + a.url : '');

    /* ---------- the loop ---------- */
    const L = W.local(t, tz);
    const wk = W.local(t - ((({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[L.weekday] + 6) % 7) * DAY, tz).date;
    const useRef = db.ref(`srv/crewUse/${uid}/${wk}/${e.id}`);
    let used = (await useRef.once('value')).val() || 0;
    const budget = +e.budget || 150;
    const model = (e.model && crew.MODELS[e.model]) ? e.model : (a.kind === 'prep' || a.kind === 'checkin' ? 'haiku' : (crew.AUTO[e.tpl] || 'sonnet'));
    const tools = toolDefs(e);
    const web = a.kind === 'checkin' ? 0 : (a.kind === 'prep' ? 3 : 5);
    const system = systemFor(e, a.kind, w, t, tz, a);
    const convo = [{ role: 'user', content: s(firstMsg, 12000) }];
    const steps = [], proposals = [], sources = [];
    let report = null, say = '', turns = 0;
    while (turns < MAX_TURNS) {
      if (used >= budget) { say = `I stopped: I have used my ${budget} steps for this week.`; break; }
      let j;
      try { j = await think(model, system, convo, tools, web); }
      catch (x) { say = 'I could not think just now. Send it again and I will retry.'; break; }
      used++; turns++;
      const content = Array.isArray(j.content) ? j.content : [];
      convo.push({ role: 'assistant', content });
      content.forEach((b) => {
        if (b.type === 'text' && b.text && b.text.trim()) say = b.text.trim();
        if (b.type === 'server_tool_use' && b.name === 'web_search') steps.push({ t: `Searched the web: ${s(b.input && b.input.query, 100)}`, k: 'read' });
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.slice(0, 5).forEach((x) => { if (x && x.url && sources.length < 12 && !sources.some((y) => y.url === x.url)) sources.push({ title: s(x.title, 120), url: s(x.url, 300) }); });
      });
      const uses = content.filter((b) => b.type === 'tool_use');
      if (!uses.length) { if (j.stop_reason === 'pause_turn') continue; break; }
      const results = [];
      for (const u of uses) {
        let out;
        const inp = u.input || {};
        if (u.name === 'fetch_page') {
          try { const pg = await page(inp.url); out = pg; steps.push({ t: `Read ${pg.title || new URL(pg.url).hostname}`, k: 'read' }); if (sources.length < 12 && !sources.some((y) => y.url === pg.url)) sources.push({ title: s(pg.title || pg.url, 120), url: pg.url }); }
          catch (x) { out = { error: String((x && x.message) || x) }; steps.push({ t: `Could not read ${s(inp.url, 80)}: ${out.error}`, k: 'blocked' }); }
        } else if (!crew.toolsFor(e).includes(u.name)) out = { error: `You do not have the ${u.name} tool.` };
        else if (u.name === 'read_work') { out = crew.readWork(w, t, tz); steps.push({ t: `Read the work: ${out.open} open, ${out.overdue} overdue, ${out.due_today} due today`, k: 'read' }); }
        else if (u.name === 'list_tasks') { out = crew.listTasks(w, inp, t, tz); steps.push({ t: `Listed ${out.length} task${out.length === 1 ? '' : 's'} (${inp.filter || 'open'})`, k: 'read' }); }
        else if (u.name === 'write_report') { report = inp; out = { ok: true }; steps.push({ t: 'Wrote the report', k: 'report' }); }
        else if (crew.TOOLS[u.name] && crew.TOOLS[u.name].propose) {
          if (proposals.length >= 6) out = { error: 'That is enough proposals for one run.' };
          else { proposals.push({ name: u.name, input: inp }); out = { ok: true, proposed: true }; steps.push({ t: `Proposed: ${u.name.replace(/_/g, ' ')} “${s(inp.name || inp.subject, 80)}”`, k: 'wait' }); }
        } else out = { error: 'unknown tool' };
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 14000), is_error: !!out.error });
      }
      convo.push({ role: 'user', content: results });
    }
    await useRef.set(used);
    if (report && sources.length && !(report.sections || []).some((x) => /source/i.test(x.heading || ''))) {
      report.sections = (report.sections || []).concat([{ heading: 'Sources', text: sources.map((x) => `- ${x.title}: ${x.url}`).join('\n') }]);
    }
    const title = a.kind === 'prep' ? `${name}: tomorrow’s meetings are prepped` : a.kind === 'checkin' ? `${name} is checking in`
      : `${name}: ${s(a.text.replace(URL_RE, '').replace(/\s+/g, ' ').trim(), 50) || 'your request'}`;
    return deliver({ steps, proposals, report, say: s(say, 2000), model }, title);
  }

  return { create, list, cancel, setPlan, getPlan, due, run };
}

/* a caption, title and hashtags for a video, in the user's voice (the
   "Send to Maya" sheet asks for it before posting) */
const CAPTION_SYSTEM = `You write social posts for the user, in their voice. You get the video's title, notes, length, shape and the platforms.
Return ONE JSON object, nothing else: {"heading": string (a YouTube title, under 70 characters, no clickbait words like "shocking"), "caption": string (2-4 short lines for Instagram and TikTok, the first line a hook, ending with a soft call to action), "tags": string (5-8 hashtags separated by spaces, specific before broad)}.
Never invent facts about the video beyond what you are given. No emojis unless the notes use them.`;
async function caption(deps, body) {
  const { cfg } = deps;
  const f = deps.fetch || ((...a) => global.fetch(...a));
  if (!cfg.anthropicKey) throw new AskError(503, 'Captions need the Kova server’s Claude key.');
  const b = body || {};
  const ask = { title: s(b.title, 200), notes: s(b.notes, 1500), seconds: Math.round(+b.dur || 0), shape: s(b.shape, 20), platforms: (Array.isArray(b.platforms) ? b.platforms : []).slice(0, 6).map((x) => s(x, 20)), voice: s(b.voice, 400) };
  const r = await f('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.mealModel || cfg.model, max_tokens: 600, temperature: 0.7, system: CAPTION_SYSTEM, messages: [{ role: 'user', content: JSON.stringify(ask) }] }) });
  if (!r.ok) throw new AskError(502, 'Could not write the caption right now.');
  const j = await r.json();
  const text = (j.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('');
  let o = null;
  try { const i = text.indexOf('{'), k = text.lastIndexOf('}'); o = JSON.parse(text.slice(i, k + 1)); } catch (x) { o = null; }
  if (!o) throw new AskError(502, 'The caption came back garbled. Try again.');
  return { heading: s(o.heading, 100), caption: s(o.caption, 2000), tags: s(o.tags, 300) };
}

module.exports = { makeAsks, cleanAsk, cleanPlan, caption, AskError, KINDS, LEAD, CAPTION_SYSTEM };
