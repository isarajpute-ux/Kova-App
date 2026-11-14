/* claude - one way for Kova's server to ask Claude, so a failure says why.

   p43c, the owner: "I kept on pressing compare and it just did nothing...
   the connection dropped, try again". Every failure from Anthropic used to
   become one vague line ("could not answer just now"), which the page then
   showed as a dropped connection. Now the reason is named in plain words
   (out of credit, key refused, model not available, photo too big, busy),
   a busy or overloaded moment is tried once more, and a model that is not
   available moves on to the next one in the list, so one wrong name in
   Vercel (KOVA_MODEL) does not switch Kova's AI off. */
const { HttpError } = require('./providers');

const URL = 'https://api.anthropic.com/v1/messages';
const FALLBACK = ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-sonnet-4-5'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Anthropic's answer, in words the owner can act on */
function why(status, text) {
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  const type = (j && j.error && j.error.type) || '', msg = String((j && j.error && j.error.message) || text || '');
  if (/credit balance|billing|purchase credits/i.test(msg)) return { status: 503, code: 'credit', message: 'Kova’s AI has run out of credit. The owner adds credit at console.anthropic.com, under Billing.' };
  if (status === 401 || type === 'authentication_error') return { status: 503, code: 'key', message: 'Kova’s AI key was refused. The owner checks ANTHROPIC_API_KEY in Vercel.' };
  if (status === 403 || type === 'permission_error') return { status: 503, code: 'key', message: 'Kova’s AI key is not allowed to do this. The owner checks the key in the Anthropic console.' };
  if (status === 404 || type === 'not_found_error') return { status: 503, code: 'model', message: 'The AI model Kova asked for is not available. The owner checks KOVA_MODEL in Vercel.' };
  if (status === 413 || type === 'request_too_large' || /image.{0,40}(exceed|too (large|big))|too many images/i.test(msg)) return { status: 413, code: 'image', message: 'That photo is too big for Kova’s AI. Try a smaller one, or a screenshot of it.' };
  if (status === 429 || type === 'rate_limit_error') return { status: 503, code: 'busy', message: 'Kova’s AI is busy right now. Try again in a minute.' };
  if (status === 529 || type === 'overloaded_error' || status >= 500) return { status: 503, code: 'busy', message: 'Kova’s AI is overloaded right now. Try again in a minute.' };
  if (status === 400) return { status: 502, code: 'request', message: 'Kova’s AI could not take this request (' + msg.slice(0, 120) + ').' };
  return { status: 502, code: 'other', message: 'Kova’s AI could not answer just now. Try again in a moment.' };
}

/* p51b: the newest models refuse what older ones took. Claude Haiku 5.5 and
   Sonnet 5.5 return a 400 for a temperature (or top_p / top_k) other than the
   default, and Opus 4.7 and later, Sonnet 5 and Fable remove them altogether;
   Kova sent temperature 0 for steady numbers. Kept only for the older
   models that accept it. Effort (output_config) is the reverse: the 5.x
   models take it, Haiku 4.5 and Sonnet 4.5 refuse it. Thinking counts
   against max_tokens on the 5.x models (it is on by default), so a short
   cap gets room to finish its answer. */
const SAMPLING_OK = /^claude-(opus-4-6|sonnet-4-6|haiku-4-5|sonnet-4-5|opus-4-5|opus-4-1|opus-4-0|sonnet-4-0|opus-4-2|sonnet-4-2|3)/;
const EFFORT_NO = /^claude-(haiku-4-5|sonnet-4-5|sonnet-4-0|opus-4-1|opus-4-0|3)/;
function fit(model, body) {
  const o = Object.assign({}, body, { model });
  const m = String(model || '');
  if (!SAMPLING_OK.test(m)) { delete o.temperature; delete o.top_p; delete o.top_k; }
  if (EFFORT_NO.test(m)) delete o.output_config;
  else if (/^claude-(haiku|sonnet|opus|fable|mythos)-5/.test(m) && o.max_tokens && o.max_tokens < 4000) o.max_tokens = 4000;
  return o;
}

/* body is Anthropic's message body; its model (or cfg.model) is tried first */
async function ask(cfg, body, opts = {}) {
  const f = opts.fetch || ((...a) => global.fetch(...a));
  const wait = opts.sleep || sleep;
  const list = [body.model || cfg.model].concat(opts.models || FALLBACK).filter((m, i, a) => m && a.indexOf(m) === i);
  let last = null;
  for (let i = 0; i < list.length; i++) {
    for (let k = 0; k < 2; k++) {
      let r;
      try {
        r = await f(URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify(fit(list[i], body))
        });
      } catch (e) {
        last = { status: 503, code: 'busy', message: 'Kova’s server could not reach its AI just now. Try again in a minute.' };
        console.error('claude fetch', list[i], e && e.message);
        if (k === 0) { await wait(1000); continue; }
        break;
      }
      if (r.ok) return { json: await r.json(), model: list[i], tried: i };
      const t = await r.text().catch(() => '');
      last = why(r.status, t);
      console.error('claude', (opts.tag || ''), list[i], r.status, t.slice(0, 300));
      if (last.code === 'busy' && k === 0) { await wait(1200); continue; }
      break;
    }
    /* only a model that is not there moves on to the next one */
    if (!last || last.code !== 'model') break;
  }
  const e = new HttpError(last.status, last.message);
  e.code = last.code;
  throw e;
}

/* p52: does the AI really answer? The owner's scans kept failing and the
   reason (no credit, a key, a model) could only be seen by a signed-in
   phone. This asks each reader one tiny question ("reply ok"), remembers
   the answer for ten minutes, and says only ok or the reason in words. No
   one's data is involved and nothing a person typed is sent. */
let HEALTH = null;
async function probe(cfg, model, models, opts) {
  try {
    const out = await ask(cfg, { model, max_tokens: 16, output_config: { effort: 'low' }, messages: [{ role: 'user', content: 'Reply with the single word: ok' }] },
      { fetch: opts.fetch, sleep: opts.sleep, tag: 'health', models });
    return { ok: true, model: out.model };
  } catch (e) { return { ok: false, code: e.code || 'error', message: e.message }; }
}
async function health(cfg, opts = {}) {
  const now = opts.now || Date.now();
  if (!opts.force && HEALTH && now - HEALTH.at < 10 * 60e3) return Object.assign({}, HEALTH.v, { checked: HEALTH.at });
  let v;
  if (!cfg || !cfg.anthropicKey) v = { ok: false, code: 'config', message: 'Kova’s AI is not set up on the server yet (ANTHROPIC_API_KEY in Vercel).' };
  else {
    const photo = await probe(cfg, cfg.mealModel || cfg.model, opts.photoModels, opts);
    /* out of credit or a refused key is the same for every model: one call says it */
    const main = !photo.ok && (photo.code === 'credit' || photo.code === 'key') ? photo : await probe(cfg, cfg.model, undefined, opts);
    v = { ok: photo.ok && main.ok, photo, main };
    if (!v.ok) { const bad = photo.ok ? main : photo; v.code = bad.code; v.message = bad.message; }
  }
  HEALTH = { at: now, v };
  return Object.assign({}, v, { checked: now });
}

module.exports = { ask, why, fit, health, FALLBACK, URL };
