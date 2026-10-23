/* voice - Kova's natural voice for Coach me, the workout player (p41).

   The owner: "make it sound like a more natural voice, like ElevenLabs
   voices". The page's built-in voice (speechSynthesis) is the phone's own
   and often robotic; this turns a short line ("Set two of three. Eight
   reps at 135 pounds.") into speech with ElevenLabs when the server has
   ELEVENLABS_API_KEY (owner-side, in Vercel). Without the key it says so
   (503) and the page keeps the best voice the phone has.

   The key never reaches the page. Lines are short (at most 200 characters)
   and repeat a lot ("Go.", "Ten seconds."), so each one is kept in memory
   and asked for once per server instance. */

const MAX = 200;
const KEEP = 300;
const cache = new Map();

class VoiceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function clean(t) {
  return String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, MAX);
}

async function say({ cfg, text, fetch }) {
  fetch = fetch || ((...a) => global.fetch(...a));
  const t = clean(text);
  if (!t) throw new VoiceError(400, 'Nothing to say.');
  if (!cfg.elevenKey) throw new VoiceError(503, 'The natural voice is not set up on the server yet.');
  const voice = cfg.elevenVoice, k = voice + '|' + t;
  if (cache.has(k)) return cache.get(k);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': cfg.elevenKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: t, model_id: cfg.elevenModel, voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
  });
  if (!r.ok) {
    const e = await r.text().catch(() => '');
    console.error('voice error', r.status, e.slice(0, 300));
    throw new VoiceError(r.status === 401 ? 503 : 502, r.status === 401 ? 'The natural voice key was refused.' : 'The natural voice is unavailable right now.');
  }
  const out = { type: 'audio/mpeg', audio: Buffer.from(await r.arrayBuffer()).toString('base64') };
  cache.set(k, out);
  if (cache.size > KEEP) cache.delete(cache.keys().next().value);
  return out;
}

module.exports = { say, clean, VoiceError, MAX, _cache: cache };
