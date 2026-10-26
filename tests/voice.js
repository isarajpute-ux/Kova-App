/* p43, the owner: "this AI sounds so excruciating... speaking way too fast,
   doesn't sound like a human at all... make it sound like ElevenLabs" and,
   about the AI team's report, "it feels like I'm reading a whole book, make
   it more organized and less clustered". One voice (src/p08_voice.js):
   written for the ear, a sentence at a time with breaths, a little slower,
   the phone's best voice; signed in, the whole passage from Kova's natural
   voice. The report: each part a small block of rows. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, n = 80) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) {} await wait(50); } return false; };
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
['kova.auth.skipped', 'kova.auth.local'].forEach((k) => w.localStorage.setItem(k, '1'));
w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
w.localStorage.setItem('kova_profile_v2', JSON.stringify({ tourSeen: true }));
const spoken = [], played = [];
const V = (name, lang, d) => ({ name, lang, default: !!d });
/* a phone voice that takes a moment per sentence, then says it ended */
w.speechSynthesis = { cancel() {}, speak(u) { spoken.push({ t: u.text, v: u.voice && u.voice.name, rate: u.rate, at: Date.now() }); setTimeout(() => u.onend && u.onend(), 20); }, getVoices() { return [V('Fred', 'en-US'), V('Samantha', 'en-US', 1), V('Ava (Premium)', 'en-US')]; }, addEventListener() {} };
w.SpeechSynthesisUtterance = function (t) { this.text = t; };
w.Audio = function () { this.play = () => { played.push(this.src); return Promise.resolve(); }; this.pause = () => {}; };
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(1500);
  const KV = w.KovaVoice, C = w.KovaCrew, doc = w.document;
  ck('the shared voice loaded', !!KV && typeof KV.speak === 'function');
  /* written for the ear */
  const said = KV.passage(KV.prep('## Your day\n- 09:00–09:45 Fill in your profile (one short block)\n- 13:30–14:00 Email\n- 17:30 Stop\nRest 90 s. 8 reps at 135 lb, 75%.'));
  ck('times are said as times, a breath after them: "9 to 9:45 AM, Fill in…", "1:30 to 2 PM", "5:30 PM"', /9 to 9:45 AM, Fill in your profile/.test(said) && /1:30 to 2 PM, Email/.test(said) && /5:30 PM, Stop/.test(said));
  ck('…brackets become a pause, units become words (seconds, pounds, percent), no symbols are read', /profile, one short block\./.test(said) && /90 seconds/.test(said) && /135 pounds/.test(said) && /75 percent/.test(said) && !/[()#*%–]/.test(said));
  ck('…a heading and its lines stay one part, with a longer break before the next part', /^Your day\. 9 to/.test(said) && /\n\nRest 90 seconds/.test(said));
  /* the phone's voice: one sentence at a time, slower, with breaths */
  spoken.length = 0;
  KV.speak('Ava. Here is your day. Three things are late.');
  await until(() => spoken.length >= 3);
  ck('signed out, it speaks one sentence at a time (not one long run-on)', spoken.length === 3 && spoken[0].t === 'Ava.' && spoken[2].t === 'Three things are late.');
  ck('…a little slower than normal, with the phone’s best voice', spoken.every((x) => x.rate < 1 && x.rate >= 0.85) && spoken.every((x) => x.v === 'Ava (Premium)'));
  ck('…with a breath between sentences (about a third of a second)', spoken[1].at - spoken[0].at >= 300 && spoken[2].at - spoken[1].at >= 300);
  KV.stop();
  /* signed in: the whole passage from the natural voice */
  const tts = [];
  w.KOVA_FB = { auth: { currentUser: { uid: 'u1' } } };
  w.KovaLink = Object.assign(w.KovaLink || {}, { authFetch: (u, o) => { tts.push([u, o.json]); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ type: 'audio/mpeg', audio: 'QUJD' }) }); } });
  spoken.length = 0;
  KV.speak('## Do first\n- **Fill in your profile**: Critical, 11 days late\n## At risk\n- 3 overdue.');
  await until(() => played.length);
  ck('signed in, the whole passage goes to Kova’s natural voice in one request, its parts on their own lines', tts.length === 1 && tts[0][0] === '/tts' && tts[0][1].long === true && /Do first\. Fill in your profile: Critical, 11 days late\.\n\nAt risk\. 3 overdue\./.test(tts[0][1].text));
  ck('…and it plays (the phone’s voice stays quiet)', played[0] === 'data:audio/mpeg;base64,QUJD' && spoken.length === 0);
  KV.stop(); w.KOVA_FB = null;
  /* the AI team's report, organized */
  const rep = { title: 'Your day', summary: 'Nothing due today, 3 overdue.', sections: [
    { heading: 'Do first', text: '- **Fill in your business profile**: Critical, 11 days late\n- **Add your first real goal**: High, 10 days late' },
    { heading: 'Your day, blocked out', text: '- 09:00–09:45  Fill in your business profile\n- 17:30  Stop. Note tomorrow’s first task' },
    { heading: 'My advice', text: '- Guard your first 90 minutes for “Fill in your business profile”.' }] };
  const box = doc.createElement('div'); box.innerHTML = C.reportCard(rep, null);
  const secs = box.querySelectorAll('.crw-part');
  ck('each part of a report is its own small block with a short label', secs.length === 3 && secs[0].querySelector('.crw-pl').textContent === 'Do first');
  const r0 = secs[0].querySelector('.crw-pr');
  ck('…a task is a row: its name, then small tags (priority coloured, how late)', r0.querySelector('b').textContent === 'Fill in your business profile' && r0.querySelector('.crw-tag.p-critical').textContent === 'Critical' && /11 days late/.test(r0.querySelector('.crw-tags').textContent));
  const t0 = secs[1].querySelector('.crw-time');
  ck('…a time is a column, the task beside it (no bullets, no paragraphs)', t0 && t0.querySelector('time').textContent === '09:00' && t0.querySelector('span').textContent === 'Fill in your business profile' && !box.querySelector('.crw-part ul'));
  /* the brief itself says less */
  const src = fs.readFileSync(__dirname + '/../src/p08_crew.js', 'utf8');
  ck('the morning brief says less: no "(one short block today)", "Email and replies", advice in one short line', !/one short block today/.test(src) && /Email and replies/.test(src) && !/re-dated by priority in one go/.test(src));
  ck('the "without AI" note is short and quiet, and is not read aloud', /Quick answer from your numbers, without AI/.test(src) && /crw-fb/.test(src) && /without AI \\\(\/\.test\(job\.say/.test(src));
  ck('"Read it to me" is a small Listen pill that stops when tapped again', /crw-listen[^]*Listen<\/button>/.test(src) && /KovaVoice\.talking\(\)\)\{ KovaVoice\.stop\(\)/.test(src));
  ck('no script errors', !errors.length);
  if (errors.length) console.log(errors.slice(0, 3));
  let p = 0; R.forEach(([n, c]) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (c) p++; });
  console.log(p + '/' + R.length + ' voice');
  process.exit(p === R.length ? 0 : 1);
})();
