/* voice - Kova's natural voice for Coach me, the workout player (p41).

   The owner: "make it sound like a more natural voice, like ElevenLabs
   voices". The page's built-in voice (speechSynthesis) is the phone's own
   and often robotic; this turns a short line ("Set two of three. Eight
   reps at 135 pounds.") into speech with ElevenLabs when the server has
   ELEVENLABS_API_KEY (owner-side, in Vercel). Without the key it says so
   (503) and the page keeps the best voice the phone has.

   The key never reaches the page. Coach me's lines are short and repeat a
   lot ("Go.", "Ten seconds."), so each one is kept in memory and asked for
   once per server instance. p43: the AI team's "Read it to me" sends a
   whole passage (up to 1200 characters, `long`), and the owner found the
   voice too fast and robotic: ElevenLabs' docs put voice and model first,
   then settings, so the default model is now the expressive
   eleven_multilingual_v2 (was the fast, flatter Flash), a touch slower
   than normal (speed 0.94 of 0.7-1.2), stability a little under the 0.5
   baseline for a livelier read, and line breaks left in (the model pauses
   there). */

const MAX = 200, LONG = 1200;
const KEEP = 300;
const cache = new Map();

const SETTINGS = { stability: 0.42, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true, speed: 0.94 };

class VoiceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function clean(t, long) {
  const s = String(t == null ? '' : t);
  return long ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, LONG) : s.replace(/\s+/g, ' ').trim().slice(0, MAX);
}

async function say({ cfg, text, long, fetch }) {
  fetch = fetch || ((...a) => global.fetch(...a));
  const t = clean(text, long);
  if (!t) throw new VoiceError(400, 'Nothing to say.');
  if (!cfg.elevenKey) throw new VoiceError(503, 'The natural voice is not set up on the server yet.');
  const voice = cfg.elevenVoice, k = voice + '|' + t;
  if (cache.has(k)) return cache.get(k);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': cfg.elevenKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: t, model_id: cfg.elevenModel, voice_settings: SETTINGS })
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

module.exports = { say, clean, VoiceError, MAX, LONG, SETTINGS, _cache: cache };
