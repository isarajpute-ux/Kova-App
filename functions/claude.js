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
          body: JSON.stringify(Object.assign({}, body, { model: list[i] }))
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

module.exports = { ask, why, FALLBACK, URL };
