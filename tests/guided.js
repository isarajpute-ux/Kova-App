/* p41, the owner's list: "I don't know why we have a Follow along, what does
   that mean?" (it is now "Coach me"), "warm-up set 11 reps at 100
   pounds" (a warm-up is now 8 light reps at about half the weight, and the
   screen says what it is), "make it sound like a more natural voice, like
   ElevenLabs" (Kova's natural voice from the server when its key is set,
   else the best voice the phone has) and "the leg press movement is
   completely wrong" (seated and reclined, the knees come toward the chest,
   the feet travel up the sled on a plate across it). */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, n = 60) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) {} await wait(50); } return false; };
const now = Date.now();
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
['kova.auth.skipped', 'kova.auth.local'].forEach((k) => w.localStorage.setItem(k, '1'));
w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
w.localStorage.setItem('kova_mode_v1', 'live');
w.localStorage.setItem('kova_profile_v2', JSON.stringify({ tourSeen: true, tours: { playerpage: 1 } }));
w.localStorage.setItem('kova_hist_v1', JSON.stringify({ 'Romanian deadlift': [{ t: now - 72 * 36e5, sets: [{ w: 185, r: 8, role: 'work' }, { w: 185, r: 8, role: 'work' }], top: 185 }] }));
const spoken = [], played = [], tts = [];
const V = (name, lang, d) => ({ name, lang, default: !!d });
w.speechSynthesis = { cancel() {}, speak(u) { spoken.push({ t: u.text, v: u.voice && u.voice.name }); setTimeout(() => u.onend && u.onend(), 10); }, getVoices() { return [V('Fred', 'en-US'), V('Samantha', 'en-US', 1), V('Ava (Premium)', 'en-US'), V('Thomas', 'fr-FR'), V('Zarvox', 'en-US')]; }, addEventListener() {} };
w.SpeechSynthesisUtterance = function (t) { this.text = t; };
w.Audio = function () { this.play = () => { played.push(this.src); return Promise.resolve(); }; this.pause = () => {}; };
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(1600);
  const doc = w.document, PL = w.KovaPlayer, K = w.KSESS;
  /* the name */
  w.go('session'); await wait(200); PL.decorate(); await wait(10);
  ck('the button in the workout says what it does: Coach me (not "Guided", the workout\u2019s own mode)', /Coach me/.test((doc.querySelector('.kpl-chip') || {}).textContent || '') && !/Follow along/.test(doc.getElementById('s-session').textContent));
  /* stretching inside the workout (the owner could not find it) */
  let opened = 0; const X = w.KovaExPage, o1 = X.openStretch; X.openStretch = () => { opened++; };
  doc.querySelector('.kpl-str').click();
  ck('the workout has a Stretch button next to Coach me, and it opens the stretches (today\u2019s muscles first)', /Stretch/.test(doc.querySelector('.kpl-str').textContent) && opened === 1);
  X.openStretch = o1;
  /* the warm-up */
  const S = K.state(), i = S.ex.findIndex((e) => /Romanian deadlift/.test(e.n));
  let e = S.ex[i];
  if (i < 0) { w.KovaGoal && w.KovaGoal.addToPlan ? 0 : 0; }
  const anyWarm = S.ex.map((x, k) => [x, k]).filter(([x]) => x.sets.some((s) => s.role === 'warm'))[0];
  ck('there is a warm-up set in today’s workout to check', !!anyWarm);
  const [ex, k] = anyWarm, j = ex.sets.findIndex((s) => s.role === 'warm'), ph = K.api.ph(ex, j), work = K.api.ph(ex, j + 1);
  ck('a warm-up is 8 light reps at about half the weight (it was your reps + 3, like "11 reps at 100 lb")', ph.r === 8 && (!work.w || Math.abs(ph.w - Math.round(work.w * 0.5 / 5) * 5) <= 5));
  S.act = k; PL.open(); await wait(60);
  const pg = () => doc.getElementById('kpl');
  ck('Coach me opens, named so', /COACH · /.test(pg().textContent) && pg().getAttribute('aria-label') === 'Coach me');
  ck('on a warm-up the screen says what it is: light, to get ready, not counted', /A light set to get ready\. Not counted\./.test(pg().textContent));
  /* p43: the voice says one sentence at a time, with a breath between */
  await until(() => spoken.some((x) => /Warm-up set, light, to get ready\. eight reps/.test(x.t)));
  ck('…and the voice says it plainly', spoken.some((x) => /Warm-up set, light, to get ready\. eight reps/.test(x.t)));
  /* the voice: signed out, the best voice the phone has */
  const voiced = spoken.filter((x) => x.v);
  ck('signed out, it speaks with the best voice on the phone (a Premium one), never a novelty or another language', voiced.length && voiced.every((x) => x.v === 'Ava (Premium)'));
  ck('…the voices are ranked: Premium over the plain default, novelty voices never', PL.voice.score(V('Ava (Premium)', 'en-US')) > PL.voice.score(V('Samantha', 'en-US', 1)) && PL.voice.score(V('Zarvox', 'en-US')) < 0 && PL.voice.score(V('Thomas', 'fr-FR')) < 0);
  /* signed in: Kova's natural voice from the server */
  w.KOVA_FB = { ok: true, auth: { currentUser: { uid: 'u1', getIdToken: () => Promise.resolve('tok') } } };
  let srv = 200;
  w.KovaLink = { authFetch: (u, o = {}) => { if (u !== '/tts') return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }); tts.push([u, o.json.text]); return Promise.resolve(srv === 200 ? { ok: true, status: 200, json: () => Promise.resolve({ type: 'audio/mpeg', audio: 'QUJD' }) } : { ok: false, status: srv, json: () => Promise.resolve({ error: 'The natural voice is not set up on the server yet.' }) }); } };
  const n0 = spoken.length;
  PL.voice.speak('Ten seconds.'); await until(() => played.some((x) => /audio\/mpeg/.test(x)));
  ck('signed in, the line comes from Kova’s natural voice (POST /tts) and plays', tts[0] && tts[0][0] === '/tts' && tts[0][1] === 'Ten seconds.' && played.some((s) => s === 'data:audio/mpeg;base64,QUJD') && spoken.length === n0);
  PL.voice.speak('Ten seconds.'); await wait(30);
  ck('…each line is fetched once and kept', tts.length === 1);
  srv = 503; PL.voice.state.ok = null;
  PL.voice.speak('Go.'); await until(() => spoken.length > n0);
  ck('no natural voice on the server: it falls back to the phone’s best voice at once', spoken.slice(n0).some((x) => x.t === 'Go.' && x.v === 'Ava (Premium)'));
  PL.voice.speak('Rest ninety seconds.'); await wait(30);
  ck('…and stops asking the server', tts.length === 2 && spoken.some((x) => x.t === 'Rest ninety seconds.'));
  /* the end of Coach me offers the stretches for what you trained */
  let routed = null; const rt0 = X.routine; X.routine = (l) => { routed = l; };
  S.ex.forEach((x) => x.sets.forEach((st) => { st.d = 1; })); PL.close(); PL.open(); await wait(60);
  ck('when the workout is done, Coach me offers Stretch now', /Stretch now/.test(pg().textContent));
  pg().querySelector('[data-kpl="stretch"]').click(); await wait(20);
  ck('…which closes Coach me and walks through the stretches for today\u2019s muscles', !doc.getElementById('kpl') && Array.isArray(routed) && routed.length > 0);
  X.routine = rt0;
  /* the server half */
  const voice = require('../functions/voice.js');
  let req = null;
  const fetch = (u, o) => { req = [u, o]; return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) }); };
  let err = null; try { await voice.say({ cfg: {}, text: 'Go.', fetch }); } catch (x) { err = x; }
  ck('server: without its key it says the natural voice is not set up (503), and asks nobody', err && err.status === 503 && !req);
  const cfg = { elevenKey: 'k', elevenVoice: 'v1', elevenModel: 'm1' };
  const r1 = await voice.say({ cfg, text: '  Set   one of three. ', fetch });
  ck('server: with the key it asks ElevenLabs for that line, the key in a header, never in the page', /api\.elevenlabs\.io\/v1\/text-to-speech\/v1\?/.test(req[0]) && req[1].headers['xi-api-key'] === 'k' && JSON.parse(req[1].body).text === 'Set one of three.' && JSON.parse(req[1].body).model_id === 'm1' && r1.audio === 'AQID' && r1.type === 'audio/mpeg');
  req = null; await voice.say({ cfg, text: 'Set one of three.', fetch });
  ck('server: a line it already said is not asked for again', req === null);
  const api = fs.readFileSync(__dirname + '/../functions/api.js', 'utf8');
  /* p43: the owner found it too fast and robotic: the expressive model, a touch slower, line breaks kept for a long passage */
  req = null; await voice.say({ cfg: Object.assign({}, cfg), text: 'Do first.\n\nFill in your profile.', long: true, fetch });
  const bd = JSON.parse(req[1].body);
  ck('server: a passage keeps its line breaks (the model pauses there), at a touch under normal speed, livelier than the old settings', bd.text === 'Do first.\n\nFill in your profile.' && bd.voice_settings.speed < 1 && bd.voice_settings.speed >= 0.9 && bd.voice_settings.stability < 0.5 && bd.voice_settings.use_speaker_boost === true);
  ck('server: the default model is the expressive one, not the fast Flash', require('../functions/env.js').fromEnv({}).elevenModel === 'eleven_multilingual_v2');
  ck('server: POST /tts needs sign-in and has a daily limit', /async function voiceRoute[\s\S]{0,120}requireUser[\s\S]{0,80}rateLimit/.test(api) && /path === '\/tts'/.test(api));
  /* the leg press */
  const D = w.KovaDemo.LIB['leg press'], J0 = w.KovaDemo.joints(D.K[0]), J1 = w.KovaDemo.joints(D.K[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const ang = (a, b, c) => { const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]]; return Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI; };
  ck('leg press: at the bottom the knees come toward the chest (above the hip-to-foot line), not down and away', cross(J0.hip, J0.aN, J0.kN) < 0 && J0.kN[1] < J0.hip[1] - 30);
  ck('…about a right angle at the knee at the bottom, soft (not locked) at the top', Math.abs(ang(J0.hip, J0.kN, J0.aN) - 90) < 12 && ang(J1.hip, J1.kN, J1.aN) > 155 && ang(J1.hip, J1.kN, J1.aN) < 178);
  const d0 = Math.atan2(J0.aN[1] - J0.hip[1], J0.aN[0] - J0.hip[0]), d1 = Math.atan2(J1.aN[1] - J1.hip[1], J1.aN[0] - J1.hip[0]);
  ck('…the feet travel in a straight line up the sled (the same direction from the hip, about 40 degrees)', Math.abs(d0 - d1) < 0.06 && Math.abs(-d1 * 180 / Math.PI - 40) < 6);
  const plat = (D.eq.filter((q) => q.k === 'plat')[0] || {}).ang;
  ck('…on a plate across the sled (it was drawn along it), sitting reclined', Math.abs(((plat - (d1 * 180 / Math.PI) + 360) % 180) - 90) < 8 && J0.t < -40 && J0.t > -70);
  ck('no script errors', !errors.filter((x) => !/Not implemented|navigation/i.test(x)).length);
  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  if (errors.length) console.log(errors.slice(0, 3).join('\n'));
  console.log(`${R.length - failed.length}/${R.length} guided`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
