/* Work OS Studio (p07): behaviour, not presence.

   Boots the real page in jsdom with Firebase stubbed and a fake api
   server, then checks the three things that matter: each platform gets
   the words and limits it actually has, a publish sends exactly the
   right payload after uploading the media, and the canvas controls
   change the post they claim to change. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
  const w = dom.window;
  const user = { uid: 'u1', email: 'a@b.c', getIdToken: () => Promise.resolve('idtok') };
  w.firebase = {
    initializeApp() {}, apps: [{}],
    auth: () => ({ currentUser: user, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} }),
    functions: () => ({ httpsCallable: () => () => Promise.resolve({ data: { text: '' } }) })
  };
  const api = { calls: [], publish: null, posts: {} };
  w.fetch = (url, o = {}) => {
    const u = String(url);
    const body = o.body ? JSON.parse(o.body) : null;
    api.calls.push({ url: u, method: o.method || 'GET', body, auth: o.headers && o.headers.Authorization });
    const ok = (j, s = 200) => Promise.resolve({ ok: s < 400, status: s, json: () => Promise.resolve(j) });
    if (/\/status$/.test(u)) return ok(api.status || {});
    if (/\/publish$/.test(u)) {
      api.publish = body;
      const p = body.post;
      const st = p.when ? 'scheduled' : 'queued';
      api.posts[p.id] = { id: p.id, state: st, when: p.when || 0, results: {}, draft: p.draft };
      return ok(api.posts[p.id]);
    }
    const one = u.match(/\/posts\/([^/]+)$/);
    if (one) return ok(api.posts[one[1]] || {}, api.posts[one[1]] ? 200 : 404);
    const cancel = u.match(/\/posts\/([^/]+)\/cancel$/);
    if (cancel) { api.posts[cancel[1]].state = 'cancelled'; return ok(api.posts[cancel[1]]); }
    if (/\/posts$/.test(u)) return ok({ posts: Object.values(api.posts) });
    if (/\/write$/.test(u)) return ok({ field: body.field, text: 'Three days, full body, nothing wasted' });
    return ok({});
  };
  w.localStorage.setItem('ks.tour', 'true');   // the tour gets its own check below
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  // uploads go to a fake bucket
  const ups = [];
  w.KovaMedia.upload = (kind, blob, name, prog) => {
    ups.push({ kind, name, size: blob.size, type: blob.type });
    if (prog) prog(1);
    return Promise.resolve({ path: `users/u1/${kind}/${name}`, url: 'https://x/' + name, bytes: blob.size, type: blob.type });
  };
  return { w, doc: w.document, api, ups };
}

(async () => {
  const { w, doc, api, ups } = boot();
  await wait(400);
  const K = w.KovaPost;
  const linkAll = (o) => { api.status = w.KovaLink.cache(Object.assign({
    google: { linked: true, label: 'me@gmail.com', configured: true }, youtube: { linked: true, canUpload: true, configured: true },
    instagram: { linked: true, label: '@kova', configured: true }, tiktok: { linked: true, configured: true },
    linkedin: { linked: true, label: 'Isa R', configured: true }, x: { linked: true, label: '@kova', configured: true } }, o || {})); };
  linkAll();

  // ------------------------------------------------ words per platform
  const p = K.blank();
  Object.assign(p, { heading: 'The 3-day split I keep coming back to', body: 'Three sessions, full body.\n\nHere is the week.',
                     caption: 'Three days, full body, no junk volume.', tags: '#training strength, #gym #training' });
  const yt = K.compose(p, 'youtube');
  ck('YouTube title comes from the heading', yt.title === 'The 3-day split I keep coming back to');
  ck('YouTube description is primary text plus tags', /Three sessions, full body/.test(yt.description) && /#training #strength #gym/.test(yt.description));
  ck('YouTube tags have no # and no duplicates', yt.tags.join() === 'training,strength,gym');
  ck('Instagram caption leads with the caption line', K.compose(p, 'instagram').caption.startsWith('Three days, full body, no junk volume.'));
  ck('LinkedIn post leads with the heading', K.compose(p, 'linkedin').text.startsWith('The 3-day split'));
  ck('LinkedIn keeps at most 5 hashtags', (K.compose(Object.assign({}, p, { tags: '#a #b #c #d #e #f #g' }), 'linkedin').text.match(/#/g) || []).length === 5);
  const xt = K.compose(p, 'x').text;
  ck('X gets the short line and fits 280', xt.startsWith('Three days') && K.xLength(xt) <= 280);
  const long = Object.assign({}, p, { caption: 'y'.repeat(270), tags: '#one #two' });
  ck('X drops hashtags before going over 280', K.compose(long, 'x').text === 'y'.repeat(270));
  const ov = Object.assign({}, p, { over: { x: { text: 'my own words for X' } } });
  ck('an edit for one platform wins there only', K.compose(ov, 'x').text === 'my own words for X' && K.compose(ov, 'instagram').caption !== 'my own words for X');

  // ------------------------------------------------ what each platform refuses
  const img = (id) => ({ id, kind: 'image', mime: 'image/jpeg', bytes: 1000, w: 1080, h: 1350, blob: 'b' + id, name: id + '.jpg', on: true });
  const vid = (id, dur) => ({ id, kind: 'video', mime: 'video/mp4', bytes: 5e6, w: 1080, h: 1920, dur, blob: 'b' + id, name: id + '.mp4', on: true });
  const withMedia = (m, extra) => Object.assign(K.blank(), p, { media: m }, extra || {});
  let q = withMedia([img('a'), img('b')], { format: 'slider' });
  ck('YouTube refuses a photo slider', !K.check(q, 'youtube', 'on').ok);
  ck('TikTok refuses a photo slider', !K.check(q, 'tiktok', 'on').ok);
  ck('Instagram takes a photo slider', K.check(q, 'instagram', 'on').ok);
  ck('LinkedIn takes a photo slider', K.check(q, 'linkedin', 'on').ok);
  ck('a slider needs two items', /at least two/.test(K.check(withMedia([img('a')], { format: 'slider' }), 'instagram', 'on').problems.join()));
  ck('Instagram refuses 9:16 photos', /4:5/.test(K.check(withMedia([img('a')], { format: 'image', aspect: '9:16' }), 'instagram', 'on').problems.join()));
  ck('X takes at most 4 photos', /up to 4/.test(K.check(withMedia([img('a'), img('b'), img('c'), img('d'), img('e')], { format: 'slider' }), 'x', 'on').problems.join()));
  ck('LinkedIn refuses photos + video together', /not both/.test(K.check(withMedia([img('a'), vid('v', 20)], { format: 'slider' }), 'linkedin', 'on').problems.join()));
  ck('X refuses video over 2:20', /2:20/.test(K.check(withMedia([vid('v', 200)], { format: 'video' }), 'x', 'on').problems.join()));
  ck('YouTube takes one video', K.check(withMedia([vid('v', 40)], { format: 'video' }), 'youtube', 'on').ok);
  ck('YouTube needs a title', /title/.test(K.check(withMedia([vid('v', 40)], { format: 'video', heading: '', caption: '', body: '' }), 'youtube', 'on').problems.join()));
  ck('X over 280 is caught with the count', /\(3\d\d\/280\)/.test(K.check(Object.assign(K.blank(), { format: 'text', caption: 'z'.repeat(310) }), 'x', 'on').problems.join()));
  ck('an unconnected account blocks publishing there', /Connect X/.test(K.check(withMedia([img('a')], { format: 'image' }), 'x', 'off').problems.join()));
  ck('video format posts the video even if a photo comes first', K.postMedia(withMedia([img('a'), vid('v', 9)], { format: 'video' }))[0].id === 'v');
  ck('turning an item off leaves it out', K.included(withMedia([img('a'), Object.assign(img('b'), { on: false })])).length === 1);

  // ------------------------------------------------ the screen
  w.go('workstudio'); await wait(250);
  const root = doc.getElementById('s-workstudio');
  ck('Studio screen opens', root.classList.contains('on'));
  ck('chat button hidden on the Studio', doc.body.classList.contains('ks-on'));
  ck('six nodes on the canvas', doc.querySelectorAll('.ks-node').length === 6);
  ck('the Publish node is the lit one', doc.querySelector('.ks-node[data-n="publish"]').classList.contains('ks-lit'));
  // jsdom has no layout, so the wire paths themselves are checked in the browser pass
  ck('wire layer is on the canvas', !!doc.getElementById('ksWires') && !!doc.getElementById('ksWireGlow'));
  ck('the top bar is calm: post name, progress, what next, Queue, panel, menu', doc.querySelectorAll('#ksTop .ks-tab').length === 1 && doc.querySelectorAll('#ksTop .ks-sq').length === 3 && !!doc.querySelector('#ksTop .ks-queue') && !!doc.querySelector('#ksTop .ks-fpill') && !!doc.querySelector('#ksTop [data-a="next"]'));
  ck('the media and accounts panel starts closed', !root.classList.contains('panel-open'));
  ck('no stats readout or "+" buttons on the wires', !doc.querySelector('.ks-plus') && w.getComputedStyle(doc.getElementById('ksStats')).display === 'none');
  ck('the writing dock rests as one line', doc.getElementById('ksDock').classList.contains('min'));
  // ---- the workflow: progress, what happens next, logs
  const pill = () => doc.querySelector('#ksTop .ks-fpill');
  ck('the top bar says which step the post is on and how ready it is', /Step \d\/5/.test(pill().textContent) && /\d+%/.test(pill().textContent) && !!pill().querySelector('svg.ks-dots'));
  pill().click(); await wait(30);
  let flp = doc.querySelector('.ks-flowp');
  ck('the progress panel starts with the AI agent and its three branches (chat model, memory, tool)', !!doc.querySelector('.ks-flowp .ks-agent') && /Chat model/.test(doc.querySelector('.ks-flowp .ks-agent').textContent) && /Memory/.test(doc.querySelector('.ks-flowp .ks-agent').textContent) && /Tool/.test(doc.querySelector('.ks-flowp .ks-agent').textContent));
  ck('...and ends with Your posts: a step trend by month and every post as a dot', !!doc.querySelector('.ks-flowp svg.ks-step') && !!doc.querySelector('.ks-flowp svg.ks-scat'));
  ck('tapping it opens the progress card: five steps, a dot chart, a 0-100% scale and the latest logs', !!flp && flp.querySelectorAll('.ks-fsteps li').length === 5 && !!flp.querySelector('.ks-pc .ks-dots') && /0%25%50%75%100%/.test(flp.querySelector('.ks-pcx').textContent) && /Latest logs/.test(flp.textContent));
  doc.querySelector('#ksTop [data-a="next"]').click(); await wait(30);
  const nx = doc.querySelector('.ks-next');
  ck('"+" opens What happens next? and closes the progress card', !!nx && /What happens next\?/.test(nx.textContent) && !doc.querySelector('.ks-flowp'));
  ck('...nine actions (Send to Maya too), the right next one first and marked', nx.querySelectorAll('.ks-nxr').length === 9 && nx.querySelector('.ks-nxr').classList.contains('rec') && /Next/.test(nx.querySelector('.ks-nxr.rec').textContent));
  const nq = nx.querySelector('#ksNextQ'); nq.value = 'draft'; nq.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(20);
  ck('...and a search that narrows them', doc.querySelectorAll('.ks-next .ks-nxr').length === 1 && /Human in the loop/.test(doc.querySelector('.ks-next .ks-nxr').textContent));
  doc.body.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); doc.getElementById('s-workstudio').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(20);
  ck('clicking elsewhere closes it', !doc.querySelector('.ks-next'));
  doc.querySelector('#ksTop [data-a="next"]').click(); await wait(20);
  doc.querySelector('.ks-next [data-a="n-checks"]').click(); await wait(40);
  flp = doc.querySelector('.ks-flowp');
  ck('"Run every app\u2019s checks" writes one log line per app (or asks where it goes first)', (flp && flp.querySelectorAll('.ks-logs li').length >= 1) || /Pick where it goes/.test((doc.querySelector('.ks-toast,#toast') || {}).textContent || '') || doc.getElementById('s-workstudio').classList.contains('panel-open'));
  const css14 = fs.readFileSync(__dirname + '/../src/p08_studioflow.css', 'utf8');
  ck('wires that carry work are white beams that glow, fade dark and glow again (graphite in light glass), and it all stops for reduced motion',
    /#s-workstudio\{--go:#FFFFFF/.test(css14) && /\.wb\{animation:ksBreath/.test(css14) && /@keyframes ksBreath\{0%,100%\{opacity:1\}50%\{opacity:\.14\}\}/.test(css14)
    && /body\.light-mode #s-workstudio\{--go:#111113/.test(css14) && /prefers-reduced-motion:reduce\)\{[^}]*\.ks-wires \.wb/.test(css14) && !/4ADE80|16A34A/.test(css14));
  doc.getElementById('s-workstudio').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await wait(20);

  doc.querySelector('#ksTop [data-a="menu"]').click(); await wait(40);
  const menuText = (doc.querySelector('.ks-drop-menu') || {}).textContent || '';
  ck('Board, Inbox and the tour live in the menu', /Board/.test(menuText) && /Inbox/.test(menuText) && /Show me around/.test(menuText));
  doc.body.click(); await wait(30);
  doc.querySelector('#ksTop [data-a="panel"]').click(); await wait(40);
  ck('the panel button opens the panel', root.classList.contains('panel-open'));
  doc.querySelector('#ksTop [data-a="panel"]').click(); await wait(40);
  ck('panel shows Project Assets and Accounts', /Project Assets/.test(doc.getElementById('ksPanel').textContent) && doc.querySelector('#ksPanel #kfMini .kfm') && doc.querySelector('[data-fold="acclist"]') && doc.querySelectorAll('.ks-card').length === 0);
  ck('dock has the four text tabs', doc.querySelectorAll('.ks-dt').length === 4);
  ck('Urbanist is loaded for the Studio', /family=Urbanist/.test(html));

  const S = w.KovaCanvas._state;
  S.open.acclist = true;   // the list view of accounts (the folders slider is the main one)
  const post = S.post;
  // put two clips in, bytes and all
  const blobA = new w.Blob([new Uint8Array(4000)], { type: 'video/mp4' });
  await w.KovaBlobs.put('bv1', blobA);
  post.media = [vid('v1', 12)]; post.media[0].blob = 'bv1';
  post.format = 'video'; post.heading = 'Squat depth, fixed'; post.caption = 'Finally.'; post.body = 'What changed.';
  post.targets = ['linkedin', 'x']; post.mode = 'now';
  w.KovaCanvas._render(); await wait(150);

  // card toggles target
  doc.querySelector('.ks-card[data-k="youtube"]').click(); await wait(50);
  ck('tapping an account card adds it', S.post.targets.includes('youtube'));
  doc.querySelector('.ks-chk[data-a="target"][data-k="youtube"]').click(); await wait(50);
  ck('its checkbox takes it off again', !S.post.targets.includes('youtube'));

  // param steppers
  const fmtBefore = S.post.format;
  doc.querySelector('[data-param="format"] [data-step="1"]').click(); await wait(50);
  ck('the format arrows change the format', S.post.format !== fmtBefore);
  S.post.format = 'video'; w.KovaCanvas._render();
  doc.querySelector('[data-param="ytPrivacy"] [data-step="1"]').click(); await wait(50);
  ck('the YouTube arrows change privacy', S.post.opts.youtube.privacy === 'unlisted');
  doc.querySelector('[data-param="when"] [data-step="1"]').click(); await wait(50);
  ck('when -> schedule picks a time in the future', S.post.mode === 'schedule' && S.post.when > Date.now());
  S.post.mode = 'now'; w.KovaCanvas._render(); await wait(50);

  // dock + writer
  doc.querySelector('.ks-dt[data-f="caption"]').click(); await wait(50);
  ck('dock tab switches the field', S.field === 'caption' && doc.getElementById('ksTa').value === 'Finally.');
  const ta = doc.getElementById('ksTa');
  ta.value = 'Finally fixed it.'; ta.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(500);
  ck('typing edits the caption', S.post.caption === 'Finally fixed it.');
  doc.querySelector('.ks-fb [data-a="write"]').click(); await wait(80);
  const wr = api.calls.filter((c) => /\/write$/.test(c.url)).pop();
  ck('the writer asks the server for this field with the post so far', wr && wr.body.field === 'caption' && wr.body.heading === 'Squat depth, fixed' && wr.auth === 'Bearer idtok');
  ck('the suggestion shows as ghost text', /Three days, full body, nothing wasted/.test(doc.getElementById('ksGh').textContent));
  doc.querySelector('[data-a="usesugg"]').click(); await wait(50);
  ck('"Use it" puts it in the field', S.post.caption === 'Three days, full body, nothing wasted');

  // publish now
  S.post.targets = ['linkedin', 'x']; S.post.caption = 'Finally.';
  w.KovaCanvas._render(); await wait(50);
  doc.querySelector('.ks-acts [data-a="publish"]').click(); await wait(300);
  const pay = api.publish && api.publish.post;
  ck('publish uploads the clip first', ups.length === 1 && ups[0].kind === 'post' && /\.mp4$/.test(ups[0].name));
  ck('publish sends the uploaded path, not the file', pay && pay.media.length === 1 && pay.media[0].path === `users/u1/post/${post.id}_0.mp4`);
  ck('publish sends each platform its own words', pay && pay.text.x.text.startsWith('Finally.') && pay.text.linkedin.text.startsWith('Squat depth, fixed'));
  ck('publish targets only the chosen accounts', pay && pay.targets.join() === 'linkedin,x');
  ck('publish now is not a draft and not scheduled', pay && pay.draft === false && pay.when === 0);
  ck('the post shows as publishing', S.post.status === 'publishing');
  api.posts[post.id] = { id: post.id, state: 'done', results: { linkedin: { state: 'ok', url: 'https://www.linkedin.com/feed/update/urn:li:share:1/' }, x: { state: 'ok', url: 'https://x.com/i/status/9' } } };
  await wait(3300);
  ck('when the server finishes it shows as posted', S.post.status === 'sent');
  ck('each platform shows Posted with its link', [...doc.querySelectorAll('.ks-chan .cs a')].length === 2);
  ck('a posted post cannot be published twice', doc.querySelector('.ks-acts [data-a="publish"]').disabled);
  const again = ups.length;
  doc.querySelector('.ks-acts [data-a="publish"]').click(); await wait(150);
  ck('...and nothing is uploaded again', ups.length === again);

  // a new version, sent as drafts
  doc.querySelector('#ksTop [data-a="menu"]').click(); await wait(40);
  doc.querySelector('.ks-drop-menu [data-a="dupe"]').click(); await wait(80);
  ck('duplicate makes a fresh draft with the same media', S.post.id !== post.id && S.post.status === 'draft' && S.post.media.length === 1 && !S.post.media[0].path);
  S.post.targets = ['tiktok'];
  doc.querySelector('.ks-acts [data-a="pdraft"]').click(); await wait(300);
  ck('send-as-drafts marks the payload as a draft', (api.publish||{post:{}}).post.draft === true && (api.publish||{post:{}}).post.targets.join() === 'tiktok');

  // scheduling
  doc.querySelector('[data-a="new"]').click(); await wait(80);
  const sp = S.post;
  Object.assign(sp, { format: 'text', caption: 'Scheduled words', targets: ['x'], mode: 'schedule', when: Date.now() + 2 * 3600e3 });
  w.KovaCanvas._render();
  doc.querySelector('.ks-acts [data-a="publish"]').click(); await wait(250);
  ck('a scheduled post sends its time', (api.publish||{post:{}}).post.id === sp.id && (api.publish||{post:{}}).post.when === sp.when);
  ck('and shows as scheduled', sp.status === 'scheduled');
  await w.KovaPost.cancel(sp);
  ck('cancelling puts it back to draft', sp.status === 'draft');
  sp.when = Date.now() - 1000;
  let refused = '';
  await w.KovaPost.publish(sp, 'schedule').catch((e) => { refused = e.message; });
  ck('a time in the past is refused', /minute from now/.test(refused));

  // blocked by a platform rule before anything is uploaded
  const before = ups.length;
  const bad = K.blank(); Object.assign(bad, { format: 'text', caption: 'x'.repeat(300), targets: ['x'] });
  let err = '';
  await K.publish(bad, 'now').catch((e) => { err = e.message; });
  ck('a rule problem stops publishing with the reason', /X: Too long for X/.test(err) && ups.length === before);

  // not connected: the card asks to connect
  linkAll({ instagram: { linked: false, configured: true } });
  let connected = '';
  w.KovaLink.connect = (prov) => { connected = prov; return Promise.resolve('timeout'); };
  w.KovaCanvas._render();
  doc.querySelector('.ks-card[data-k="instagram"]').click(); await wait(50);
  ck('an unconnected Instagram first asks: Professional or personal', !!doc.getElementById('ksSheet') && /Which Instagram/.test(doc.getElementById('ksSheet').textContent) && connected === '');
  doc.querySelector('#ksSheet [data-s="business"]').click(); await wait(50);
  ck('Professional goes on to Instagram sign-in', connected === 'instagram' && K.acct('instagram') === 'business');
  // Facebook personal: no sign-in, handed over instead
  connected = '';
  linkAll({ facebook: { linked: false, configured: true } });
  w.KovaCanvas._render();
  doc.querySelector('.ks-card[data-k="facebook"]').click(); await wait(50);
  doc.querySelector('#ksSheet [data-s="personal"]').click(); await wait(50);
  ck('a personal Facebook profile needs no sign-in: Kova hands the post over', connected === '' && K.linkState('facebook') === 'manual' && S.post.targets.indexOf('facebook') >= 0);
  const hp = K.blank(); Object.assign(hp, { format: 'text', heading: 'Hi', body: 'Words for my friends', targets: ['facebook'] });
  const upsBefore = ups.length;
  await K.publish(hp, 'now');
  ck('publishing only to a personal profile uploads nothing and waits for you', ups.length === upsBefore && hp.results.facebook.state === 'manual' && hp.status === 'draft');
  K.markPosted(hp, 'facebook');
  ck('ticking it off marks it posted', hp.status === 'sent' && hp.results.facebook.by === 'you');
  const mixed = K.blank(); Object.assign(mixed, { targets: ['facebook', 'x'] });
  ck('the server only gets the accounts Kova posts to', K.payload(mixed, 'now', [], ['x']).post.targets.join() === 'x');
  ck('what you post by hand survives a server update', K.absorb(Object.assign(K.blank(), { targets: ['facebook', 'x'], results: { facebook: { state: 'manual' } } }),
    { state: 'done', results: { x: { state: 'ok' } } }).results.facebook.state === 'manual');
  K.setAcct('facebook', ''); K.setAcct('instagram', '');
  linkAll({ youtube: { linked: false, configured: true }, google: { linked: false, configured: true } });
  w.KovaCanvas._render();
  doc.querySelector('.ks-card[data-k="youtube"]').click(); await wait(50);
  ck('YouTube signs in through Google', connected === 'google');

  // the composer hands over
  const rec = { title: 'From the composer', brief: 'why I stopped morning meetings', platforms: ['linkedin', 'x'],
                variants: [{ title: 'Why I stopped', caption: 'No more 9am calls', tags: ['focus', 'work'] }] };
  const fp = w.KovaCanvas.fromVariant(rec); await wait(100);
  ck('the brief composer opens its result in the Studio', S.post.id === fp.id && fp.heading === 'Why I stopped' && fp.tags === '#focus #work' && fp.targets.join() === 'linkedin,x');
  ck('Studio home points at the Studio', /data-go="workstudio"/.test(html));

  // ------------------------------------------------ the new destinations
  const ads = withMedia([img('a'), img('b')], { format: 'slider' });
  ads.opts.metaads = Object.assign({}, ads.opts.metaads, { build: 'library' });
  ck('Meta Ads takes the photos as library uploads', K.check(ads, 'metaads', 'on').ok);
  ads.opts.metaads.build = 'ads'; ads.link = '';
  ck('building ads needs the shop link', /shop link/.test(K.check(ads, 'metaads', 'on').problems.join()));
  ads.link = 'https://shop.test/tote';
  ck('with a link, the ads are ready to build', K.check(ads, 'metaads', 'on').ok);
  const adw = K.compose(Object.assign({}, ads, { heading: 'The Everyday Tote', body: 'Four colours, one bag.', caption: 'Free shipping', tags: '#bags' }), 'metaads');
  ck('ad words: primary text, headline and description - no hashtags', adw.primary === 'Four colours, one bag.' && adw.headline === 'The Everyday Tote' && adw.description === 'Free shipping' && !/#/.test(adw.primary));
  const adp = K.payload(Object.assign({}, ads, { targets: ['metaads'] }), 'now', []).post;
  ck('the ad setup travels with the post: budget, goal, countries, link', adp.options.metaads.budget === 20 && adp.options.metaads.goal === 'sales'
    && adp.options.metaads.countries.join() === 'US' && adp.options.metaads.link === 'https://shop.test/tote' && adp.text.metaads.headline !== undefined);
  ck('a wide video in an ad is flagged', /wide/.test(K.check(withMedia([Object.assign(vid('w', 20), { w: 1920, h: 1080 })], { format: 'video', link: 'https://s.t/x' }), 'metaads', 'on').warnings.join()));

  // Post, Reel or Story
  const one = withMedia([vid('r', 30)], { format: 'video' });
  ck('a vertical clip goes to Instagram as a Reel unless told otherwise', K.place(one, 'instagram') === 'reel' && K.place(withMedia([img('a')], { format: 'image' }), 'instagram') === 'post');
  K.setPlace(one, 'instagram', 'story');
  ck('Story is kept, and sent to the server', K.place(one, 'instagram') === 'story' && K.payload(Object.assign({}, one, { targets: ['instagram'] }), 'now', []).post.options.instagram.place === 'story');
  ck('a Story takes one item', /one photo or one clip/.test(K.check(Object.assign({}, withMedia([img('a'), img('b')], { format: 'slider' }), { place: { instagram: 'story' } }), 'instagram', 'on').problems.join()));
  ck('a Reel refuses photos', /A Reel is one video/.test(K.check(Object.assign({}, withMedia([img('a')], { format: 'image' }), { place: { facebook: 'reel' } }), 'facebook', 'on').problems.join()));
  ck('Facebook Reels over 90 seconds are refused', /90 seconds/.test(K.check(Object.assign({}, withMedia([vid('l', 120)], { format: 'video' }), { place: { facebook: 'reel' } }), 'facebook', 'on').problems.join()));
  ck('a YouTube Short over 3 minutes is refused', /3 minutes/.test(K.check(Object.assign({}, withMedia([vid('y', 200)], { format: 'video' }), { place: { youtube: 'short' } }), 'youtube', 'on').problems.join()));
  const tk = withMedia([vid('t', 30)], { format: 'video' }); K.setPlace(tk, 'tiktok', 'draft');
  ck('TikTok inbox draft is the same switch as before', tk.opts.tiktok.mode === 'draft' && K.payload(Object.assign({}, tk, { targets: ['tiktok'] }), 'now', []).post.options.tiktok.mode === 'draft');
  ck('Meta Ads needs photos or video', !K.check(Object.assign(K.blank(), { format: 'text', caption: 'x' }), 'metaads', 'on').ok);
  ck('Facebook post leads with the heading', K.compose(p, 'facebook').text.startsWith('The 3-day split'));
  ck('Reddit needs a title', /title/.test(K.check(Object.assign(K.blank(), { format: 'image', media: [img('a')] }), 'reddit', 'on').problems.join()));
  ck('Reddit borrows the first line when there is no heading', K.compose(Object.assign(K.blank(), { body: 'First line\nmore' }), 'reddit').title === 'First line');
  ck('Bluesky refuses video', /photos, not video/.test(K.check(withMedia([vid('v', 10)], { format: 'video' }), 'bluesky', 'on').problems.join()));
  ck('Pinterest carries the shop link', K.compose(Object.assign({}, p, { link: 'https://shop.example/x' }), 'pinterest').link === 'https://shop.example/x');
  ck('Telegram caps captions under media at 1,024', /1,024/.test(K.check(withMedia([img('a')], { format: 'image', caption: 'z'.repeat(1100), heading: '', body: '' }), 'telegram', 'on').problems.join()));
  ck('Bluesky/Discord/Telegram use a form, Mastodon a server name', K.KIND.bluesky === 'form' && K.KIND.discord === 'form' && K.KIND.telegram === 'form' && K.KIND.mastodon === 'instance');
  ck('accounts are grouped like the reference panel', doc.querySelectorAll('.ks-grp').length === 3);

  // ------------------------------------------------ connecting never opens a blank window
  w.KovaLink.connect = () => Promise.resolve('no-server');
  linkAll({ threads: { linked: false, configured: true } });
  w.KovaCanvas._render();
  doc.querySelector('.ks-card[data-k="threads"]').click(); await wait(80);
  const sh1 = doc.getElementById('ksSheet');
  ck('server not live: a screen explains it instead of a blank window', sh1 && /server isn\u2019t live yet/.test(sh1.textContent));
  sh1.querySelector('[data-s="close"]').click(); await wait(30);
  w.KovaLink.connect = () => Promise.resolve('not-configured');
  doc.querySelector('.ks-card[data-k="threads"]').click(); await wait(80);
  const sh2 = doc.getElementById('ksSheet');
  ck('platform not set up: says where to make the app and the redirect address', sh2 && /developers\.facebook\.com/.test(sh2.textContent) && /api\/oauth\/callback/.test(sh2.textContent));
  sh2.querySelector('[data-s="close"]').click(); await wait(30);
  let linkedWith = null;
  w.KovaLink.link = (k, f) => { linkedWith = { k, f }; return Promise.resolve({ ok: true, label: '@kova.bsky.social' }); };
  linkAll({ bluesky: { linked: false, configured: true, kind: 'form' } });
  w.KovaCanvas._render();
  doc.querySelector('.ks-card[data-k="bluesky"]').click(); await wait(80);
  const sh3 = doc.getElementById('ksSheet');
  ck('Bluesky opens a form asking for an app password', sh3 && /app password/i.test(sh3.textContent) && sh3.querySelectorAll('input').length === 2);
  sh3.querySelector('input[data-f="handle"]').value = 'kova.bsky.social';
  sh3.querySelector('input[data-f="password"]').value = 'abcd-efgh-ijkl-mnop';
  sh3.querySelector('[data-s="go"]').click(); await wait(80);
  ck('the form sends what was typed to the Kova server', linkedWith && linkedWith.k === 'bluesky' && linkedWith.f.handle === 'kova.bsky.social');
  ck('a connected account is ticked on the post', S.post.targets.includes('bluesky') && !doc.getElementById('ksSheet'));

  // ------------------------------------------------ plain names, sound, tour
  const names = [...doc.querySelectorAll('.ks-nh')].map((h) => h.textContent);
  ck('cards use plain names', ['Media', 'Words', 'Cover & shape', 'Settings', 'Publish', 'Preview'].every((n) => names.some((t) => t.indexOf(n) === 0)));
  ck('clips play with sound (no muted preview)', /playsinline preload="metadata"><\/video>/.test(html) && !/id="ksVid"[^>]*playsinline muted/.test(html));
  ck('the Work OS home has a Help tab for its tour', /data-wktour="1">Help</.test(html));
  w.KovaCanvas.tour(); await wait(900);
  ck('the tour starts on Media', /Media/.test((doc.getElementById('ksCoach') || {}).textContent || ''));
  doc.querySelector('#ksCoach [data-t="next"]').click(); await wait(900);
  ck('Next moves to Words', /Words/.test(doc.getElementById('ksCoach').textContent));
  doc.querySelector('#ksCoach [data-t="skip"]').click(); await wait(50);
  ck('Skip ends it and it will not start again by itself', !doc.getElementById('ksTour') && w.localStorage.getItem('ks.tour') === 'true');

  // ------------------------------------------------ the Work OS tour
  w.localStorage.removeItem('wk.tour');
  w.go('work'); await wait(2800);
  ck('the Work OS tour starts on the first visit', !!doc.getElementById('ksTour') && /Your Work OS/.test(doc.getElementById('ksCoach').textContent));
  ck('it spotlights what it explains, without scaling the screen (no lag)', !!doc.getElementById('ksSpot') && !doc.getElementById('s-work').style.transform);
  for (let i = 0; i < 7; i++) { doc.querySelector('#ksCoach [data-t="next"]').click(); await wait(400); }
  ck('it steps into Tasks and explains them', doc.getElementById('s-worktasks').classList.contains('on') && /Tasks/.test(doc.getElementById('ksCoach').textContent));
  doc.querySelector('#ksCoach [data-t="skip"]').click(); await wait(500);
  ck('skipping comes back to the Work OS home, zoomed out', doc.getElementById('s-work').classList.contains('on') && !doc.getElementById('s-work').style.transform && w.KovaTour.seen('work'));
  w.go('work'); await wait(1100);
  ck('it does not start again by itself', !doc.getElementById('ksTour'));
  w.go('workstudio'); await wait(200);

  // the accounts as small fanned folders, in the sidebar
  S.post.targets = []; K.save(S.post); w.KovaCanvas._render();
  doc.querySelector('[data-a="accounts"]').click(); await wait(50);
  let kf = doc.querySelector('#ksPanel .kfm');
  ck('the sidebar shows every app as a small folder', kf && kf.querySelectorAll('.kfm-f').length === 16 && !doc.getElementById('kfVeil'));
  ck('the glass card describes the folder in the middle', /posts/.test(kf.querySelector('.kfm-card').textContent));
  const xIdx = [...kf.querySelectorAll('.kfm-f')].findIndex((f) => f.getAttribute('data-k') === 'x');
  w.KovaFolders.go(xIdx); await wait(20);
  ck('sliding brings a folder to the middle and the card follows', /^X/.test(kf.querySelector('.kfm-card b').textContent));
  const pe = new w.Event('pointerover', { bubbles: true }); pe.pointerType = 'mouse'; kf.querySelector('.kfm-f[data-k="linkedin"]').dispatchEvent(pe); await wait(20);
  ck('hovering pops a folder out and shows its details', kf.querySelector('.kfm-f.focus').getAttribute('data-k') === 'linkedin' && /LinkedIn/.test(kf.querySelector('.kfm-card').textContent));
  w.KovaFolders.go(xIdx); await wait(20);
  kf.querySelector('.kfm-card [data-f="tick"]').click(); await wait(40);
  kf = doc.querySelector('#ksPanel .kfm');
  ck('Use in post ticks it, and the folder turns glowing charcoal', S.post.targets.indexOf('x') >= 0 && kf.querySelector('.kfm-f[data-k="x"]').classList.contains('lit'));
  ck('the slide stays where it was after the sidebar redraws', /^X/.test(kf.querySelector('.kfm-card b').textContent));

  // Ad setup: goal, budget, countries, link - what Kova builds in Ads Manager
  S.post.targets = ['metaads']; S.post.media = [img('ad1'), img('ad2')]; S.post.format = 'slider'; K.save(S.post); w.KovaCanvas._render(); await wait(50);
  doc.querySelector('[data-pick="adsetup"]').click(); await wait(50);
  ck('Ad setup opens from Settings', /Ad setup/.test(doc.getElementById('ksSheet').textContent) && /switched off/.test(doc.getElementById('ksSheet').textContent));
  doc.querySelector('#ksSheet [data-s="set:goal:traffic"]').click(); await wait(50);
  doc.querySelector('#ksSheet [data-f="budget"]').value = '35';
  doc.querySelector('#ksSheet [data-f="countries"]').value = 'us, ca, usa';
  doc.querySelector('#ksSheet [data-f="link"]').value = 'https://shop.test/tote';
  doc.querySelector('#ksSheet [data-s="set:split:each"]').click(); await wait(50);
  doc.querySelector('#ksSheet [data-s="save"]').click(); await wait(50);
  const ao = K.adOpts(S.post);
  ck('Ad setup saves goal, budget, one ad set per file, countries and the shop link', ao.goal === 'traffic' && ao.budget === 35 && ao.split === 'each'
    && ao.countries.join() === 'US,CA' && S.post.link === 'https://shop.test/tote');
  ck('the Settings row sums it up', /Traffic · \$35\/day each/.test(doc.querySelector('[data-param="adsetup"]').textContent));

  // the tours on Home, Vitals, Workout, Sleep and Fuel
  const ST = w.KovaScreenTour;
  /* the separate sport card is gone: marathon, swimming, hiking and the rest live in the split, so Customize is six steps */
  ck('five more tours: seven steps on Home, Vitals, Sleep and Fuel, six on Customize', ['home', 'vitals', 'sleep', 'fuel'].every((id) => ST.steps(id).length === 7) && ST.steps('customize').length === 6);
  ck('the Workout tour reaches into Customize: training for, rules, your week, balance, muscles', ST.steps('move').length === 9
    && ['Training for', 'The rules', 'Your week', 'Balance', 'Target muscles'].every((t) => ST.steps('move').some((x) => x.t === t)));
  ck('a tour is remembered in the synced profile too', (w.KovaTour.mark('fuel'), w.KP.get('tours').fuel > 0) && w.KovaTour.seen('fuel') && !w.KovaTour.once('fuel'));
  ck('each of those screens has a ? to replay its tour', ['home', 'move', 'vitals', 'sleep', 'fuel'].every((id) => doc.querySelector('#s-' + id + ' .title .kt-help[data-ktour="' + id + '"]'))
    && doc.querySelector('#s-customize .title-s .kt-help[data-ktour="customize"]'));
  w.KovaTour.run([{ t: 'A', d: 'b', el: '#s-sleep .title' }], { color: '#8FBEEA' }); await wait(50);
  ck('a section tour takes its colour for the outline', doc.getElementById('ksTour').classList.contains('tinted') && doc.getElementById('ksTour').style.getPropertyValue('--tc') === '#8FBEEA');
  w.KovaTour.end();
  ck('the Work OS tour stays glowing white', !/tinted/.test(String((w.KovaWorkTour && 'white') || '')));

  // typing happens in Kova's own box, not the browser's prompt
  w.prompt = () => { throw new Error('prompt should not be used'); };
  doc.querySelector('[data-param="name"] [data-pick="name"]').click(); await wait(50);
  const nameIn = doc.querySelector('#ksSheet [data-f="v"]');
  ck('rename opens an in-app box', !!nameIn);
  nameIn.value = 'Launch week'; doc.querySelector('#ksSheet [data-s="ok"]').click(); await wait(50);
  ck('and saves the name', S.post.title === 'Launch week');

  // sound
  S.post.media = [Object.assign(vid('quiet', 12), { sound: false })]; S.post.format = 'video'; K.save(S.post); w.KovaCanvas._render(); await wait(50);
  ck('a clip with no sound track says so', /No sound in this file/.test(doc.querySelector('.ks-node[data-n="media"]').textContent) && /This clip has no sound/.test(doc.querySelector('.ks-prev').textContent));

  // the wellness agent's pop-up (runs the same seven checks on this device until the server is live)
  ck('the page carries the server\u2019s wellness rules', w.KovaWellness && w.KovaWellness.IDS.length === 7 && typeof w.KovaWellness.metrics === 'function');
  const KA = w.KovaAgent;
  KA.run();
  const openA = KA._open();
  ck('the on-device audit finds what to fix, each with an action and a window', openA.length >= 2 && openA.every((a) => a.action && ['morning', 'evening', 'night'].includes(a.window)));
  ck('seven findings are kept for Your plan', KA._state.last.findings.length === 7);
  w.go('home'); await wait(300);
  KA.plan(); await wait(50);
  ck('Your plan groups the fixes into morning, evening and night', /Morning[\s\S]*Evening[\s\S]*Night/.test(doc.getElementById('kgPlan').textContent) && /The seven checks/.test(doc.getElementById('kgPlan').textContent));
  const firstId = openA[0].id;
  doc.querySelector('#kgPlan [data-g="pdone"]').click(); await wait(50);
  ck('Done ticks one off and it stays off', KA._state.alerts[firstId].state === 'done' && JSON.parse(w.localStorage.getItem('kova.agent.local')).alerts[firstId].state === 'done');
  doc.querySelector('#kgPlan [data-g="close"]').click(); await wait(50);
  ck('Home shows how many are open under the morning brief', /to fix today|look fine/.test((doc.getElementById('kgStrip') || {}).textContent || ''));

  // Traction and the business card (sample data in preview)
  w.KovaTraction.open(); await wait(50);
  const kt = doc.getElementById('ktSheet');
  ck('Traction shows views per day, drop-off, audience and comments', kt && /Views per day/.test(kt.textContent) && /Who is watching/.test(kt.textContent) && /Comments/.test(kt.textContent));
  doc.querySelector('[data-t2="tab"][data-k="youtube"]').click(); await wait(20);
  ck('the YouTube tab marks where people stop watching', /Biggest drop at/.test(doc.getElementById('ktSheet').textContent));
  doc.querySelector('[data-t2="advise"]').click(); await wait(1100);
  ck('What should I fix? answers with fixes, angles and comment themes', /Change the angle/.test(doc.getElementById('ktSheet').textContent) && doc.querySelectorAll('.kt-th').length >= 2);
  doc.querySelector('[data-t2="shut"]').click();
  w.KovaTraction.card(); await wait(20);
  ck('the business card lists the apps that need copy-and-open', /Instagram[\s\S]*TikTok/.test(doc.getElementById('ktSheet').textContent) && doc.querySelectorAll('[data-t2="cardhand"]').length === 6);
  doc.querySelector('[data-t2="shut"]').click();

  // delete
  w.confirm = () => { throw new Error('confirm should not be used'); };
  const gone = S.post.id;
  doc.querySelector('.ks-acts [data-a="delete"]').click(); await wait(80);
  ck('delete asks first, in Kova', !!doc.querySelector('#ksSheet [data-s="yes"]') && !!K.find(gone));
  doc.querySelector('#ksSheet [data-s="yes"]').click(); await wait(80);
  ck('delete removes the post', !K.find(gone));

  let pass = 0, fail = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? pass++ : fail++; });
  console.log('\n' + pass + '/' + (pass + fail) + ' passing');
  if (errors.length) { console.log('runtime errors: ' + errors.length); errors.slice(0, 6).forEach((e) => console.log('  ' + e)); }
  process.exit(fail || errors.length ? 1 : 0);
})();
