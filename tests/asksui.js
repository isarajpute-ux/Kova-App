/* The app side of talking to your AI team (src/p08_asks.js + hooks in
   p08_crew.js, p07_ui.js and p08_cut.js): "at 11" / "by 5pm" / a link sends
   the job to the server so it is done while Kova is closed; the team's
   "On it" list and Take back; the check-in and meeting-prep switches;
   Maya as the Social Media Manager (and the old Maya renamed Theo); the
   new tools; and Send to Maya end to end. Server and Studio are faked. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
const user = { uid: 'u1', getIdToken: () => Promise.resolve('t') };
w.firebase = {
  initializeApp() {}, apps: [{}],
  auth: () => ({ currentUser: user, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() }),
  database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
    remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
  storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} }),
  functions: () => ({ httpsCallable: () => () => Promise.resolve({ data: { text: '' } }) })
};
const calls = []; let inbox = []; let plan = { prep: { on: false, time: '18:00' }, checkin: { on: false, time: '11:00' } };
const reply = (j, ok = true, status = 200) => Promise.resolve({ ok, status, json: () => Promise.resolve(j), text: () => Promise.resolve(JSON.stringify(j)) });
w.fetch = (u, o) => {
  u = String(u); const b = o && o.body && typeof o.body === 'string' ? JSON.parse(o.body) : null; calls.push([u, b]);
  if (/\/crew\/ask$/.test(u)) return reply({ id: 'a1', runAt: (b.deliverAt || Date.now()) - 240000, deliverAt: b.deliverAt || Date.now(), now: !b.deliverAt });
  if (/\/crew\/asks$/.test(u)) return reply({ items: [{ id: 'a9', emp: '', kind: 'ask', text: 'Find three venues', deliverAt: Date.now() + 7200e3, state: 'queued', created: Date.now() }] });
  if (/\/crew\/ask\/cancel$/.test(u)) return reply({ ok: true });
  if (/\/crew\/plan$/.test(u)) { if (b) plan = { prep: Object.assign({ on: false, time: '18:00' }, b.prep), checkin: Object.assign({ on: false, time: '11:00' }, b.checkin) }; return reply(plan); }
  if (/\/crew\/fetch$/.test(u)) return reply({ url: b.url, title: 'Acme Pricing', text: 'Starter $19', links: [] });
  if (/\/crew\/caption$/.test(u)) return reply({ heading: 'Pasta in 10 minutes', caption: 'Dinner, sorted.\nSave this one.', tags: '#pasta #dinner' });
  if (/\/traction\/refresh$/.test(u)) return reply({ read: 1 });
  if (/\/traction\/[^/]+\/advice$/.test(u)) return reply({ headline: 'People want the recipe.', themes: [{ theme: 'Recipe please', share: 50, sentiment: 'positive', quote: 'recipe?' }], working: [], fix: [], next: {} });
  if (/\/crew\/inbox$/.test(u)) return reply({ items: inbox.splice(0) });
  if (/\/crew\/(cloud|inbox\/ack)$/.test(u)) return reply({ ok: true });
  return reply({});
};
/* an older team: the original four, with the analyst called Maya */
w.localStorage.setItem('kova.auth.skipped', '1');
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(1900);
  const doc = w.document, C = w.KovaCrew, K = w.KovaAsk, W = w.WorkOS;
  const FB = w.KOVA_FB; if (FB) { FB.ok = true; FB.auth = FB.auth || {}; FB.auth.currentUser = user; }
  const by = (t) => C.emps().filter((e) => e.title === t)[0];

  /* ---- the team ---- */
  ck('Maya is the Social Media Manager, Theo the Growth Analyst, Ravi researches', by('Social Media Manager').n === 'Maya' && by('Growth Analyst').n === 'Theo' && by('Research Analyst').n === 'Ravi');
  ck('Maya can post and read comments; Ravi can read web pages', C.toolsFor(by('Social Media Manager')).includes('publish_post') && C.toolsFor(by('Social Media Manager')).includes('post_feedback') && C.toolsFor(by('Research Analyst')).includes('fetch_page'));
  ck('posting is something you approve, reading is not', C.TOOLS.publish_post.kind === 'external' && C.TOOLS.post_feedback.kind === 'read' && C.TOOLS.fetch_page.kind === 'read');
  /* an older team gets Maya and Ravi, and its Maya-the-analyst becomes Theo */
  const team = C.emps();
  team.filter((e) => e.tpl === 'social' || e.tpl === 'research').forEach((e) => W.remove('agents', e.id));
  const an = by('Growth Analyst'); W.update('agents', an.id, { n: 'Maya' }, 'user');
  w.KP.set('crewV20', false); C.migrate();
  ck('an older team: the analyst called Maya becomes Theo, and Maya and Ravi join', by('Growth Analyst').n === 'Theo' && by('Social Media Manager').n === 'Maya' && !!by('Research Analyst'));

  /* ---- when ---- */
  const nine = new w.Date(2026, 9, 12, 9, 0, 0).getTime();
  const hh = (x) => { const d = new w.Date(x.at); return [d.getDate(), d.getHours(), d.getMinutes()].join(':'); };
  ck('when: "tell me at 11" is 11:00 today', hh(K.parseWhen('Ravi, tell me at 11 what you find', nine)) === '12:11:0');
  ck('when: "by 5pm" is 17:00 today, "at 5" in working hours is 17:00 too', hh(K.parseWhen('do it by 5pm', nine)) === '12:17:0' && hh(K.parseWhen('ping me at 5', nine)) === '12:17:0');
  ck('when: "tomorrow at 9" is tomorrow 9:00', hh(K.parseWhen('tomorrow at 9 please', nine)) === '13:9:0');
  ck('when: "in 2 hours", "tonight", and "11 o’clock"', hh(K.parseWhen('in 2 hours', nine)) === '12:11:0' && hh(K.parseWhen('tonight', nine)) === '12:20:0' && hh(K.parseWhen("at 11 o'clock", nine)) === '12:11:0');
  ck('when: a time already gone today means tomorrow', hh(K.parseWhen('at 8am', nine)) === '13:8:0');
  ck('when: no time, no time', K.parseWhen('Triage my overdue tasks', nine) === null);
  ck('a link is found in the words', K.urlIn('Read https://acme.test/pricing, then tell me') === 'https://acme.test/pricing');

  /* ---- the team screen ---- */
  w.go('workteam'); await wait(120); C.paint(); await wait(60);
  const body = doc.getElementById('wtmBody');
  ck('under the box: Tell me Now, In 1 hour, Tonight, Tomorrow 9 am, or At a time', !!body.querySelector('.kas-when') && body.querySelectorAll('.kas-when [data-ka="when"]').length === 4 && !!body.querySelector('.kas-when input[type="time"]'));
  ck('"Your team checks on you": a check-in and tomorrow’s meetings prepped', /Your team checks on you/.test(body.textContent) && body.querySelectorAll('[data-ka="plan"]').length === 2);
  await wait(60); C.paint(); await wait(20);
  ck('what the team is on shows, with Take back', /On it \(1\)/.test(body.textContent) && /Find three venues/.test(body.textContent) && !!body.querySelector('[data-ka="cancel"][data-v="a9"]'));
  body.querySelector('[data-ka="cancel"][data-v="a9"]').click(); await wait(40);
  ck('Take back cancels it on the server', calls.some((c) => /\/crew\/ask\/cancel$/.test(c[0]) && c[1].id === 'a9') && !/Find three venues/.test(body.textContent));

  /* send with a time and a link */
  const jobsBefore = Object.keys(C.jobs()).length;
  const ta = doc.getElementById('crwAsk');
  ta.value = 'Ravi, read https://acme.test/pricing and tell me at 11 what we can use';
  body.querySelector('[data-c="ask"]').click(); await wait(80);
  const ask = calls.filter((c) => /\/crew\/ask$/.test(c[0])).pop();
  ck('a time and a link: it goes to the server for Ravi, with the link and the time', ask && ask[1].emp === by('Research Analyst').id && ask[1].url === 'https://acme.test/pricing' && ask[1].deliverAt > Date.now());
  ck('and no job starts in the app (it is done while Kova is closed)', Object.keys(C.jobs()).length === jobsBefore);
  /* a time chip */
  body.querySelector('[data-ka="when"][data-v="1h"]').click(); await wait(20);
  ck('a time chip shows as picked', body.querySelector('[data-ka="when"][data-v="1h"]').classList.contains('on'));
  doc.getElementById('crwAsk').value = 'Draft my follow-ups';
  body.querySelector('[data-c="ask"]').click(); await wait(80);
  const ask2 = calls.filter((c) => /\/crew\/ask$/.test(c[0])).pop();
  ck('with a chip picked, even plain words go to the server for an hour from now', ask2[1].text === 'Draft my follow-ups' && Math.abs(ask2[1].deliverAt - (Date.now() + 3600e3)) < 120e3);
  /* no time, no link: the app runs it as before */
  doc.getElementById('crwAsk').value = 'Triage my overdue tasks';
  body.querySelector('[data-c="ask"]').click(); await wait(80);
  ck('no time and no link: it runs right away in the app, as before', Object.keys(C.jobs()).length === jobsBefore + 1);

  /* the switches (on the whole team's tab) */
  C._S.tab = 'all'; C.paint(); await wait(20);
  body.querySelector('[data-ka="plan"][data-v="prep"]').click(); await wait(60);
  const pl = calls.filter((c) => /\/crew\/plan$/.test(c[0]) && c[1]).pop();
  ck('meeting prep on: saved with your time zone and Mia’s spot', pl && pl[1].prep.on === true && pl[1].prep.time === '18:00' && typeof pl[1].tz === 'string');

  /* the results come back as finished jobs */
  const ravi = by('Research Analyst');
  inbox = [{ id: 'a1', emp: ravi.id, text: 'Read https://acme.test/pricing and tell me at 11', at: Date.now(), steps: [{ t: 'Read Acme Pricing', k: 'read' }], proposals: [],
    report: { title: 'Acme pricing', summary: 'They charge $19 and $49.', sections: [] }, say: 'Done.', ask: { kind: 'ask', deliverAt: Date.now() + 60e3, url: 'https://acme.test/pricing' } }];
  await C.pullCloud(); await wait(60);
  const back = C.jobs().jc_a1;
  ck('the answer arrives in Ravi’s jobs, saying it was ready for the time you asked', back && back.emp === ravi.id && /ready for .* as you asked/.test(back.steps[0].t) && back.report.title === 'Acme pricing');

  /* ---- the tools ---- */
  const fp = await C.TOOLS.fetch_page.run({ url: 'https://acme.test/pricing' });
  ck('fetch_page reads the page through the server', fp.title === 'Acme Pricing' && calls.some((c) => /\/crew\/fetch$/.test(c[0])));

  /* ---- Send to Maya ---- */
  const KP0 = w.KovaPost;
  const published = [];
  KP0.linkState = (k) => (k === 'instagram' || k === 'youtube' ? 'on' : 'off');
  KP0.publish = (p, mode) => { p.status = 'sent'; KP0.save(p); published.push({ id: p.id, mode, targets: p.targets.slice(), short: p.opts.youtube.short, ig: (p.place || {}).instagram, caption: p.caption, heading: p.heading, when: p.when }); return Promise.resolve(p); };
  const post = KP0.blank(); post.title = 'Pasta in 10'; post.media = [{ id: 'm1', kind: 'video', w: 1080, h: 1920, dur: 42, on: true }]; post.format = 'video'; KP0.save(post);
  K.offerSend(post); await wait(80);
  const sheet = doc.getElementById('kasSend');
  ck('Send to Maya: she writes the caption in your voice', !!sheet && sheet.querySelector('[data-s="caption"]').value === 'Dinner, sorted.\nSave this one.' && sheet.querySelector('[data-s="heading"]').value === 'Pasta in 10 minutes');
  ck('the connected accounts are ticked: a Reel on Instagram and a Short on YouTube for a 42-second vertical video', sheet.querySelectorAll('[data-s="plat"].on').length === 2 && /Reel/.test(sheet.textContent) && /Short/.test(sheet.textContent) && !!sheet.querySelector('[data-s="plat"][data-v="tiktok"][disabled]'));
  sheet.querySelector('[data-s="go"]').click(); await wait(120);
  ck('Post with Maya publishes to exactly those accounts, as a Short and a Reel, with her caption', published.length === 1 && published[0].targets.sort().join() === 'instagram,youtube' && published[0].short === true && published[0].ig === 'reel' && /Dinner, sorted/.test(published[0].caption) && published[0].mode === 'now');
  const cm = calls.filter((c) => /\/crew\/ask$/.test(c[0])).pop();
  ck('and asks Maya to read the comments an hour later', cm[1].kind === 'comments' && cm[1].ref === post.id && cm[1].emp === by('Social Media Manager').id && Math.abs(cm[1].deliverAt - (Date.now() + 3600e3)) < 120e3);
  const mj = C.jobsOf(by('Social Media Manager').id).pop();
  ck('Maya’s jobs say what she did and when she will report back', mj && /Posted to .*Instagram|Posted to .*YouTube/.test(mj.say) && /tell you what people are saying/.test(mj.say));
  const fb = await C.TOOLS.post_feedback.run({ post: 'latest' });
  ck('post_feedback: "what are people saying" reads the comments into themes', fb.themes && fb.themes[0].theme === 'Recipe please' && /recipe/.test(fb.headline));
  ck('the Studio offers Send to Maya as a next step, and the video editor offers it after saving', /n-maya/.test(html) && /KovaAsk\.offerSend\(done\)/.test(html));
  const css = fs.readFileSync(__dirname + '/../src/p08_asks.css', 'utf8');
  ck('styles for dark, soft light and light glass', /body\.light-mode \.kas-chip/.test(css) && /body\.soft-light \.kas-in/.test(css));
  ck('no page errors', errors.length === 0 || (console.error(errors), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})();
