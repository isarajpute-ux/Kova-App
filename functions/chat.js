/* chat - the server half of Kova's chat, as a plain function.

   Used by the POST /chat route in api.js (the page calls it through
   KovaLink.authFetch, with the Firebase ID token) and by the old
   kovaChat callable in index.js, kept for builds already installed on
   phones.

   Why this is on a server at all: an API key placed in the page is
   readable by anyone who opens dev tools. So the page never talks to
   the model; it talks to this, which holds the key and checks who is
   asking first. */

const { KNOWLEDGE } = require('./knowledge');

const MAX_TURNS = 24;            // history sent per request
const MAX_MSG_CHARS = 4000;      // per message

const PILLAR_NAMES = {
  sleep: 'Sleep', move: 'Workout', fuel: 'Fuel', vitals: 'Vitals',
  work: 'Work OS', home: 'Home', settings: 'Settings'
};

class ChatError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function systemPrompt(ctx) {
  const where = PILLAR_NAMES[ctx.pillar] || 'Home';
  return `You are Kova, the assistant inside the Kova health and productivity app.

You are a knowledgeable, direct coach across sleep, training, nutrition, vitals and focused work. You answer the actual question with specifics - numbers, mechanisms, what to do tonight or this week - not generic wellness advice. When the person's own data is available below, use it: name their numbers and compare them to their own baseline, not to an average person.

How you answer:
- Lead with the answer. Then the reason. Then, if useful, one concrete next step.
- Be conversational and plain. Short paragraphs. Use a list only when the content is genuinely a list.
- Cite the reference body when you give a threshold ("the AASM recommends...", "ISSN puts protein at...").
- Where the evidence is mixed or preliminary, say so plainly instead of sounding certain.
- You can discuss any topic the person raises, not only the app. Stay helpful on tangents.
- Use the Kova thresholds below so you never contradict a number shown elsewhere in the app.
- You are not a doctor. For the red flags listed below, say clearly that it needs a medical professional, and for emergency signs tell them to seek emergency care now. Do not diagnose.
- Never give calorie targets, macro numbers, or weight-loss plans to anyone showing signs of disordered eating; respond with care and point them to support instead.
- Never invent the person's data. If something is not in the snapshot, say you do not have it rather than guessing.

The person is currently on the ${where} screen, so questions without a subject probably refer to it.

${KNOWLEDGE}

=== THIS PERSON'S DATA (snapshot from their device; may be partial) ===
${ctx.snapshot || '(no data shared)'}`;
}

/* Only user/assistant turns with string content go through - the client
   cannot smuggle a system message in. */
function cleanMessages(msgs) {
  const clean = (Array.isArray(msgs) ? msgs : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MSG_CHARS) }));
  if (!clean.length) throw new ChatError(400, 'invalid-argument', 'No message.');
  if (clean[clean.length - 1].role !== 'user') throw new ChatError(400, 'invalid-argument', 'Last message must be from the user.');
  return clean;
}

/* A cheap per-user daily counter in the Realtime Database. Not a billing
   system - a guard so one runaway client cannot spend the whole budget.
   Guest accounts are free to create, so there is a project-wide cap too. */
async function underLimit(db, uid, cfg) {
  const day = new Date().toISOString().slice(0, 10);
  const res = await db.ref(`chatQuota/${uid}/${day}`).transaction((n) => (n || 0) + 1);
  if ((res.snapshot.val() || 0) > (cfg.chatDaily || 150)) return false;
  const all = await db.ref(`chatQuota/_all/${day}`).transaction((n) => (n || 0) + 1);
  return (all.snapshot.val() || 0) <= (cfg.chatGlobalDaily || 5000);
}

async function answer({ db, cfg, uid, body, fetch }) {
  body = body || {};
  fetch = fetch || ((...a) => global.fetch(...a));
  const clean = cleanMessages(body.messages);
  if (!cfg.anthropicKey) throw new ChatError(503, 'unavailable', 'The assistant is not configured on the server yet.');
  if (!(await underLimit(db, uid, cfg))) throw new ChatError(429, 'resource-exhausted', 'Daily chat limit reached. It resets tomorrow.');
  const ctx = {
    pillar: typeof body.pillar === 'string' ? body.pillar : 'home',
    snapshot: typeof body.snapshot === 'string' ? body.snapshot.slice(0, 6000) : ''
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 1200, system: systemPrompt(ctx), messages: clean })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('model error', r.status, t.slice(0, 500));
    throw new ChatError(503, 'unavailable', 'The assistant is unavailable right now.');
  }
  const j = await r.json();
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { text: text || 'I did not get a reply back. Try asking again.' };
}

module.exports = { answer, systemPrompt, cleanMessages, underLimit, ChatError, MAX_TURNS, MAX_MSG_CHARS };
