/* Work OS: what you put in gets read (p29, src/p08_look.js).

   Studio      "Check my photo or clip": stills of the media go to Kova's AI,
               which reports the opening, framing, light, text, each app,
               and writes a caption about what is there ("Use this caption"
               puts it in the post). "Write it with Kova" and Maya's caption
               send the same stills, so they write about the real media.
   Compose     signed in, Kova's AI writes each platform's version (the
               templates show first and stay if the AI fails, and it says
               which you are looking at). The header icon no longer crashes.
   Workspace   Make reads the files you picked (text, PDF, photos), not only
               their names.
   Files       the file itself is kept (it used to keep a name and a link
               that died on reload); "Read it" gives a summary, key points
               and to-dos, and "Add these as tasks" puts them in Tasks.
   Server      /write and /crew/caption accept up to 4 stills, safely. */
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, n = 120) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) {} await wait(50); } return false; };

/* ---------- the app, signed in ---------- */
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: new VirtualConsole() });
const w = dom.window, doc = w.document, calls = [];
const u = { uid: 'u1', email: 'a@b.c', isAnonymous: false, getIdToken: () => Promise.resolve('tok-1') };
w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: u, onAuthStateChanged(cb) { cb(u); return () => {}; }, onIdTokenChanged(cb) { cb(u); return () => {}; }, signOut: () => Promise.resolve() }),
  database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
  storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} }) };
let aiFail = false;
w.fetch = (url, o = {}) => {
  const s = String(url);
  if (/\/ai\/ask$/.test(s)) {
    const b = JSON.parse(o.body); calls.push({ url: s, body: b });
    if (aiFail) return Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({ error: 'Kova’s AI could not answer just now.' }) });
    let text = '{}';
    if (/review the media of one social media post/.test(b.system)) text = JSON.stringify({ seen: 'A person climbing a rock wall at sunset.', hook: { verdict: 'weak', why: 'Frame 1 is a dark wide shot of the parking lot.', fix: 'Open on the top move.' },
      checks: [{ area: 'Light', verdict: 'fix', note: 'The face is in shadow in frames 2 and 3.', fix: 'Film facing the light.' }, { area: 'Framing', verdict: 'good', note: 'The climber fills the frame.', fix: '' }],
      apps: [{ app: 'TikTok', note: 'Vertical, fits full screen.' }], caption: 'Sent my first 6b at golden hour.', tags: '#climbing #bouldering Sunset' });
    if (/several platform versions/.test(b.system)) text = JSON.stringify({ versions: { tiktok: { caption: 'I shipped the auth rewrite in a week. Here is what broke first.', tags: ['#buildinpublic', '#devlife'], script: { visual: 'Laptop, terminal', s0: 'It broke on day two.', s1: 'The middle', s2: 'Follow for part 2' } },
      youtube: { caption: 'How the auth rewrite went, day by day.', title: 'I rewrote our auth in a week', tags: ['#auth'] } } });
    if (/You read one file for the person/.test(b.system)) text = JSON.stringify({ what: 'Meeting notes for the website launch.', summary: 'The team agreed to launch on Friday. Sam owns the copy.', points: ['Launch Friday', 'Sam owns copy'],
      todos: [{ title: 'Send the deck to Sam', due: 'Friday' }, { title: 'Book the launch call', due: '' }], questions: ['Who signs off on pricing?'] });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ content: [{ type: 'text', text }] }) });
  }
  return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
};
w.localStorage.setItem('kova.auth.skipped', '1');
w.localStorage.setItem('kova_mode_v1', 'live');
w.HTMLElement.prototype.scrollIntoView = function () {};
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(2200);
  try { w.__kovaLoadWork && w.__kovaLoadWork(); } catch (e) {}
  await until(() => w.KovaModel && w.KovaModel.viaServer() && w.KovaLook && w.KovaStudio);
  const $ = (s) => doc.querySelector(s), click = (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const sheetTxt = () => { const s = $('#sheet.on') || $('.sheet.on'); return s ? s.textContent : ''; };
  const toasts = []; w.toast = (m) => toasts.push(String(m));
  const errs = []; w.addEventListener('error', (e) => errs.push(e.message));

  /* Studio: the media check */
  const post = Object.assign(w.KovaPost.blank(), { title: 'Climb', targets: ['tiktok', 'instagram'], media: [{ id: 'm1', kind: 'video', name: 'climb.mp4', w: 1080, h: 1920, dur: 22, thumb: 'data:image/jpeg;base64,/9j/AAA=', on: true }] });
  w.KovaPost.save(post);
  ck('Studio’s next steps include "Check my photo or clip"', /Check my photo or clip/.test(fs.readFileSync(__dirname + '/../src/p07_ui.js', 'utf8')) && /case 'n-look'/.test(html));
  w.KovaLook.open(post);
  await until(() => /Use this caption/.test(sheetTxt()));
  const look = calls.filter((c) => /review the media/.test(c.body.system)).pop();
  const lt = sheetTxt();
  ck('the clip’s stills go to Kova’s AI as photos, with the apps, length and shape', look && look.body.messages[0].content.some((x) => x.type === 'image') && /seconds\\?":22/.test(JSON.stringify(look.body)) && /vertical/.test(JSON.stringify(look.body)) && /TikTok/.test(JSON.stringify(look.body)));
  ck('it reports what the clip shows, the opening, each check and each app', /What it shows/.test(lt) && /climbing a rock wall/.test(lt) && /Weak opening/.test(lt) && /Open on the top move/.test(lt) && /Light/.test(lt) && /Fix: Film facing the light/.test(lt) && /TikTok/.test(lt));
  ck('…and a caption about what is there, with clean tags', /Sent my first 6b at golden hour/.test(lt) && /#climbing #bouldering #sunset/.test(lt));
  click($('[data-klk="cap"]')); click($('[data-klk="tags"]'));
  const saved = w.KovaPost.find(post.id) || post;
  ck('"Use this caption" and "Use these tags" put them in the post', saved.caption === 'Sent my first 6b at golden hour.' && saved.tags === '#climbing #bouldering #sunset');
  const before = calls.length; w.KovaLook.open(post); await wait(100);
  ck('opening it again shows the same review without asking again', calls.length === before && /Use this caption/.test(sheetTxt()));
  w.KovaLook.open(Object.assign(w.KovaPost.blank(), { media: [] }));
  ck('with no photo or clip, it says to add one first', /Add a photo or clip first/.test(toasts[toasts.length - 1]));
  ck('stills are sent to the writers as {mime, data}', JSON.stringify(w.KovaLook.asImages(['data:image/jpeg;base64,QUJD', 'nope'])) === '[{"mime":"image/jpeg","data":"QUJD"}]');
  ck('"Write it with Kova" and Maya’s caption send the stills', /images:imgs/.test(fs.readFileSync(__dirname + '/../src/p07_logic.js', 'utf8')) && /images:imgs/.test(fs.readFileSync(__dirname + '/../src/p08_asks.js', 'utf8')));
  w.closeSheet();

  /* Compose: Kova's AI writes each version; templates stay if it fails */
  w.go('workcompose'); await wait(200);
  const hb = $('#wcHist'); click(hb); await wait(50);
  ck('Compose’s header icon no longer crashes, and opens Studio home', !errs.some((e) => /not a function/.test(e)) && $('.screen.on').id === 's-work');
  w.go('workcompose'); await wait(150);
  ck('with your own data and no workouts logged, Compose shows no made-up training numbers (it showed "Week volume 23.6k lbs")', !/23\.6k|Days on plan/.test($('#wcSig').textContent));
  click($('#kdcSend'));
  ck('the send arrow says what is missing instead of doing nothing', /Connect an account|Pick where it goes|Write something/.test(toasts[toasts.length - 1] || ''));
  ck('signed out, the booking-link card has a way to sign in', /data-kb="signin"/.test(html));
  w.KovaStudio.prime('how I shipped the auth rewrite in a week', '', [{ n: 'notes.txt', t: 'text', text: 'Day 2: the session store broke.' }]);
  await wait(80);
  click($('#wcGo'));
  await until(() => /Written by Kova’s AI/.test($('#wcOut').textContent));
  const out = $('#wcOut').textContent, cw = calls.filter((c) => /several platform versions/.test(c.body.system)).pop();
  ck('signed in, Compose’s versions are written by Kova’s AI from the brief and the files', /Written by Kova’s AI from your brief and your files/.test(out) && /Here is what broke first/.test(out) && /I rewrote our auth in a week/.test(out));
  ck('…the file’s text went with the brief, and each app’s limit', cw && /session store broke/.test(cw.body.messages[0].content[0].text) && /TikTok \d+ characters/.test(cw.body.messages[0].content[0].text));
  ck('…and it lists the files and whether they were read', /Files: notes\.txt \(read\)/.test(out));
  aiFail = true; click($('#wcRedo')); await until(() => /Kova’s templates/.test($('#wcOut').textContent));
  ck('if the AI fails, the template versions stay and it says so', /could not write these/.test($('#wcOut').textContent) && /variant/.test($('#wcOut').textContent));
  aiFail = false;

  /* Workspace: Make reads the files you picked */
  const R2 = await w.KovaComposeAI.read([{ id: 'a', n: 'brief.md', t: 'text' }, { id: 'b', n: 'old.pdf', t: 'pdf' }, { id: 'c', n: 'clip.mov', t: 'video' }], { a: new w.File(['Launch on Friday. Price is $29.'], 'brief.md', { type: 'text/markdown' }), c: new w.File(['x'], 'clip.mov', { type: 'video/quicktime' }) });
  ck('Workspace files are read: text kept, an unread file says why', R2[0].text === 'Launch on Friday. Price is $29.' && /only its name/.test(R2[1].note) && /not read here yet/.test(R2[2].note));
  ck('Make hands the files to Compose (not only their names)', /R\.read\(s2,RAW\)/.test(html) && /KovaStudio\.prime\(parts\.join\(' '\), angle\.join\(' '\), files\)/.test(html));

  /* Files: kept, read, to-dos to tasks */
  const fo = w.WorkOS.create('folders', { name: 'Launch' }, 'user');
  const fileRec = w.WorkOS.create('files', { n: 'notes.txt', size: 40, mime: 'text/plain', blob: 'fb_test', folderId: fo.id }, 'user');
  await w.KovaBlobs.put('fb_test', new w.Blob(['We launch Friday. Send the deck to Sam. Book the launch call.'], { type: 'text/plain' }));
  ck('Files keeps the file itself on this device (not a link that dies on reload)', /KovaBlobs\.put\(base\.blob,file\)/.test(html) && !/base\.url=url; res\(base\)/.test(html) && /KovaMedia\.attach\('doc',f,/.test(html));
  w.KovaFileAI.open(fileRec);
  await until(() => /Add these 2 as tasks/.test(sheetTxt()));
  const ft = sheetTxt(), fc = calls.filter((c) => /You read one file/.test(c.body.system)).pop();
  ck('"Read it" sends the file’s contents to Kova’s AI', fc && /Send the deck to Sam/.test(JSON.stringify(fc.body)));
  ck('…and shows what it is, a summary, key points, to-dos and open questions', /Meeting notes for the website launch/.test(ft) && /launch on Friday/.test(ft) && /Sam owns copy/.test(ft) && /Send the deck to Sam/.test(ft) && /Who signs off on pricing/.test(ft));
  const n0 = w.WorkOS.list('items').length;
  click($('[data-kfa="tasks"]'));
  const items = w.WorkOS.list('items');
  ck('"Add these as tasks" puts the to-dos in Tasks, once', items.length === n0 + 2 && items.some((i) => i.name === 'Send the deck to Sam' && /Friday/.test(i.notes)) && /2 tasks added/.test(toasts[toasts.length - 1]));
  click($('[data-kfa="tasks"]'));
  ck('…adding them again does not duplicate them', w.WorkOS.list('items').length === n0 + 2);
  w.closeSheet();
  w.KovaFileAI.open({ id: 'x2', n: 'contract.docx', mime: '' });
  await until(() => /Word files are not read yet/.test(sheetTxt()));
  ck('a Word file says plainly it is not read yet', /Word files are not read yet/.test(sheetTxt()));
  w.KovaFileAI.open({ id: 'x3', n: 'gone.txt', mime: 'text/plain', blob: 'nope' });
  await until(() => /only its name/.test(sheetTxt()));
  ck('a file whose contents are not here says so instead of pretending', /only its name/.test(sheetTxt()));

  /* Meetings: dictate notes, and Kova's AI finds the decisions and to-dos */
  w.closeSheet();
  const mt = w.WorkOS.create('meetings', { title: 'Kickoff', attendees: 'Sam', at: Date.now() - 36e5, notes: '' }, 'user');
  w.__workMeet.open(mt.id); await wait(100);
  ck('a meeting has Dictate and "Find decisions and to-dos"', !!$('#wmdDict') && !!$('#wmdRead'));
  click($('#wmdDict'));
  ck('Dictate says plainly when the browser cannot listen', /cannot listen/.test(toasts[toasts.length - 1]));
  $('#wmdNotes').value = 'We launch Friday. Sam sends the deck. Book the launch call.';
  click($('#wmdRead'));
  await until(() => /Add these 2 as tasks/.test(sheetTxt()));
  const mc = calls.filter((c) => /You read one file/.test(c.body.system)).pop();
  ck('the notes go to Kova’s AI and are saved', /Sam sends the deck/.test(JSON.stringify(mc.body)) && /Sam sends the deck/.test(w.WorkOS.find('meetings', mt.id).notes));
  click($('[data-kfa="tasks"]'));
  ck('…its to-dos become tasks under this meeting’s action items', w.WorkOS.list('items', (i) => i.meetingId === mt.id).length === 2);

  /* ---------- server: the writers accept stills ---------- */
  const asks = require(path.join(__dirname, '..', 'functions', 'asks.js'));
  const IB = asks.imageBlocks([{ mime: 'image/jpeg', data: 'QUJD' }, 'data:image/png;base64,QUJD', { mime: 'image/svg+xml', data: 'QUJD' }, { mime: 'image/jpeg', data: 'A'.repeat(1.7e6) }, { mime: 'image/jpeg', data: 'QUJD' }, { mime: 'image/jpeg', data: 'QUJD' }]);
  ck('the server takes up to 4 stills of real photo types, drops oversized ones', IB.length === 2 && IB[0].source.media_type === 'image/jpeg' && IB[1].source.media_type === 'image/png');
  let sentBody = null;
  await asks.caption({ cfg: { anthropicKey: 'k', model: 'm' }, fetch: async (u2, o) => { sentBody = JSON.parse(o.body); return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"heading":"h","caption":"c","tags":"#t"}' }] }) }; } },
    { title: 'Climb', notes: 'n', images: [{ mime: 'image/jpeg', data: 'QUJD' }] });
  ck('Maya’s caption is written with the stills in front of the AI', Array.isArray(sentBody.messages[0].content) && sentBody.messages[0].content[0].type === 'image' && /actually visible/.test(sentBody.system));
  ck('/write sends the stills too, and says to write only what is visible', /asksMod\.imageBlocks\(b\.images\)/.test(fs.readFileSync(__dirname + '/../functions/api.js', 'utf8')) && /Write about what is actually visible/.test(fs.readFileSync(__dirname + '/../functions/api.js', 'utf8')));

  const bad = R.filter((r) => !r[1]);
  R.forEach((r) => console.log((r[1] ? 'ok   ' : 'FAIL ') + r[0]));
  console.log(bad.length ? bad.length + ' failed' : 'all ' + R.length + ' passed');
  process.exit(bad.length ? 1 : 0);
})();
