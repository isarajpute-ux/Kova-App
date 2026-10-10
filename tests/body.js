/* KovaBody (src/p08_body.js): Fuel's Weight trend card with real weigh-ins,
   progress photos (front, side, back) with a compare slider, a private
   backup, and a body-fat range read from the photo by the server. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const css = fs.readFileSync(__dirname + '/../src/p08_body.css', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;
/* a real 1x1 JPEG */
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function boot() {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(String(e && (e.message || e))));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova_mode_v1', 'live');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document, auth, errors };
}

(async () => {
  const { w, doc, auth, errors } = boot();
  await wait(800);
  const B = w.KovaBody, KP = w.KP;
  const card = () => doc.querySelector('[data-kbody]');
  w.go('fuel'); await wait(60);

  /* ---- the card ---- */
  ck('the Weight trend card is Kova’s own now, not the sample chart', !!card() && !/Jul 1|174\.0/.test(card().textContent));
  ck('on the live site it stands on its own, outside the hidden sample charts', !card().closest('#fuelTrends') && !card().hasAttribute('data-demo'));
  ck('with no weigh-ins it says how the graph starts', /No weigh-ins yet/.test(card().textContent) && /second/.test(card().textContent));
  ck('the photos row invites the first photo', /Progress photos/.test(doc.getElementById('kbPics').textContent) && /Add your first/.test(doc.getElementById('kbPics').textContent));

  doc.getElementById('kbWIn').value = '180';
  doc.getElementById('kbWSave').click(); await wait(20);
  const wl = KP.get('wlog');
  ck('"Log today" writes the weigh-in in kg (180 lb = 81.6 kg)', wl.length === 1 && Math.abs(wl[0].kg - 81.65) < 0.05);
  ck('the button now offers to update today, and the point says it is the first', /Update today/.test(doc.getElementById('kbWSave').textContent) && /first weigh-in/.test(doc.getElementById('wtPtTxt').textContent));
  doc.getElementById('kbWIn').value = '18';
  doc.getElementById('kbWSave').click(); await wait(10);
  ck('a number that is not a bodyweight is turned down', KP.get('wlog').length === 1 && Math.abs(KP.get('wlog')[0].kg - 81.65) < 0.05);

  /* four weeks of weigh-ins, kg profile */
  KP.set('maint', { v: 1, unit: 'kg', sex: 'm', age: 31, hcm: 180, kg: 82, train: { days: 4, mins: 60, type: 'wmod' }, applied: false });
  const now = Date.now(), W = [];
  for (let i = 0; i < 12; i++) W.push({ t: now - (24 - i * 2) * DAY, kg: Math.round((82 - i * 0.2) * 10) / 10 });
  KP.set('wlog', W); B.paint(); await wait(10);
  ck('in kg the card reads kg, with the 4-week trend per week', /Trend −0\.7 kg a week/.test(card().textContent) && /kg/.test(doc.querySelector('.kb-u').textContent));
  ck('the month change shows in the header', /−\d[\d.]* KG THIS MONTH/.test(card().querySelector('.kb-chg').textContent));
  ck('every weigh-in is a point on the graph', card().querySelectorAll('circle.kb-dot').length === 12 && !!card().querySelector('polyline.kb-line'));
  const svg = doc.getElementById('wtChart');
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 280, height: 130 });
  svg.dispatchEvent(new w.MouseEvent('mousedown', { clientX: 1, bubbles: true }));
  await wait(5);
  ck('tapping the start of the graph shows the first weigh-in', /82 kg/.test(doc.getElementById('wtPtLbl').textContent.toLowerCase()));
  doc.getElementById('kbWIn').value = '79.4';
  doc.getElementById('kbWSave').click(); await wait(20);
  ck('logging updates your targets’ weight the way the calculator does', KP.get('maint').kg === 79.4 && KP.get('wlog').slice(-1)[0].kg === 79.4);

  /* ---- photos ---- */
  let first = await B.add(JPG, 'front');
  ck('a photo is saved with its pose and today’s weight', B.pics().length === 1 && B.pics()[0].pose === 'front' && B.pics()[0].kg === 79.4);
  ck('the card counts it', /1 photo · last today/.test(doc.getElementById('kbPics').textContent));
  B.open(); await wait(20);
  const sheet = () => doc.getElementById('kbS');
  ck('the pop-up opens on Front, with a count', /Front\s*1/.test(sheet().querySelector('.kbs-seg .on').textContent) && sheet().querySelector('.kbs-seg .on').getAttribute('aria-selected') === 'true');
  ck('one photo: it says the next one unlocks the slider', /One more front photo/.test(sheet().textContent) && !sheet().querySelector('.kb-cmp'));
  ck('it says the photos are private and never posted', /Only you can see these/.test(sheet().textContent) && /Never posted/.test(sheet().textContent));
  /* make the first one three weeks old */
  const l = KP.get('bodypics'); l[0].t = now - 21 * DAY; l[0].kg = 81.4; KP.set('bodypics', l);
  const second = await B.add(JPG, 'front');
  await wait(20);
  ck('two photos: the compare slider appears with dates, days apart and the weight change', !!sheet().querySelector('.kb-cmp .kb-rng') && /21 days/.test(sheet().querySelector('.kb-cap').textContent) && /−2 kg/.test(sheet().querySelector('.kb-cap').textContent));
  const rng = sheet().querySelector('.kb-rng'); rng.value = '30'; rng.dispatchEvent(new w.Event('input', { bubbles: true }));
  ck('sliding moves the split', sheet().querySelector('.kb-cmp').style.getPropertyValue('--kb-x') === '30%');
  ck('the tiles mark Then and Now', [...sheet().querySelectorAll('.kbs-tile em')].map((e) => e.textContent).sort().join() === 'Now,Then');
  sheet().querySelector('[data-b="pose"][data-v="side"]').click(); await wait(5);
  ck('Side is its own timeline', /No side photos yet/.test(sheet().textContent));
  sheet().querySelector('[data-b="pose"][data-v="front"]').click(); await wait(5);

  /* ---- private backup when signed in ---- */
  const uploads = [], removed = [];
  auth.currentUser = { uid: 'u1', isAnonymous: false, getIdToken: () => Promise.resolve('tok') };
  w.KovaMedia.upload = (kind, blob, name) => { uploads.push({ kind, size: blob.size, name }); return Promise.resolve({ path: 'users/u1/body/' + uploads.length + '.jpg', url: 'x' }); };
  w.KovaMedia.remove = (p) => { removed.push(p); return Promise.resolve(); };
  const third = await B.add(JPG, 'back'); await wait(20);
  const t3 = B.pics().find((p) => p.id === third);
  ck('signed in, the photo is backed up privately as a "body" file', uploads.length === 1 && uploads[0].kind === 'body' && uploads[0].name === 'back.jpg' && t3.path === 'users/u1/body/1.jpg' && t3.up === 'ok');
  ck('signed out photos stay on this phone only', !B.pics().find((p) => p.id === first).path);

  /* ---- the estimate ---- */
  const calls = [];
  let reply = { status: 200, body: { lo: 15, hi: 19, conf: 61, notes: ['Upper abs outlined'], change: 'Waist looks narrower than 21 days ago.', tip: 'Same lamp next time.' } };
  w.KovaLink.authFetch = (path, o) => { calls.push({ path, body: o && o.json }); return Promise.resolve({ ok: reply.status < 400, status: reply.status, json: () => Promise.resolve(reply.body) }); };
  B._S.open = second; B.open(second); await wait(10);
  ck('a photo opens on its own with "Estimate body fat"', !!sheet().querySelector('[data-b="est"]') && /next to your/.test(sheet().textContent));
  sheet().querySelector('[data-b="est"]').click();
  await wait(80);
  const c0 = calls.find((c) => c.path === '/body/estimate');
  ck('it sends the photo and the earlier one of the same pose to /body/estimate', !!c0 && c0.body.image.length > 20 && !!c0.body.prev && c0.body.days === 21 && c0.body.pose === 'front');
  ck('with the profile: sex, age, height and that day’s weight', c0.body.sex === 'm' && c0.body.age === 31 && c0.body.cm === 180 && c0.body.kg === 79.4 && c0.body.prevKg === 81.4);
  const est = B.pics().find((p) => p.id === second).est;
  ck('the answer is kept with the photo (it syncs with the list)', est && est.lo === 15 && est.hi === 19 && est.vs === first);
  ck('it shows a range, the photo clarity and what changed', /15–19/.test(sheet().textContent) && /Photo clarity 61%/.test(sheet().textContent) && /Waist looks narrower/.test(sheet().textContent));
  ck('it says a photo is rough', /use the range for direction, not as a number/.test(sheet().textContent));
  B.open(); await wait(10);
  sheet().querySelector('[data-b="pose"][data-v="front"]').click(); await wait(5);
  ck('the tile shows the range too', /15–19%/.test(sheet().textContent));

  let paywalled = '';
  w.KovaBilling.paywall = (f) => { paywalled = f; };
  reply = { status: 402, body: { error: 'Kova Pro' } };
  await B.estimate(first); await wait(10);
  ck('without Pro (once billing is on) it opens the plan screen', paywalled === 'body');
  B._S.open = first; B.open(first); await wait(5);
  reply = { status: 503, body: { error: 'Photo estimates are not set up on the server yet.' } };
  await B.estimate(first); await wait(10);
  ck('a server that is not set up says so, and the photo stays', /not set up on the server yet/.test(sheet().querySelector('.kb-err').textContent) && !!B.pics().find((p) => p.id === first));
  const keep = w.KovaLink; w.KovaLink = undefined;
  await B.estimate(first); await wait(5);
  ck('with no server at all it says estimates need one', /need the Kova server/.test(sheet().textContent));
  w.KovaLink = keep;

  /* ---- another phone: bytes come from a fresh short link ---- */
  let linked = '';
  w.KovaLink.authFetch = (path, o) => { linked = path + ':' + (o && o.json && o.json.path); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ url: 'https://kova.local/api/media/file?p=x&e=99&s=y' }) }); };
  w.fetch = (u) => Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new w.Blob(['jpg'], { type: 'image/jpeg' })) });
  const far = { id: 'bpfar', t: now - 3 * DAY, pose: 'front', path: 'users/u1/body/far.jpg' };
  const got = await B._bytes(far);
  ck('a photo backed up from another phone is fetched through a fresh link', linked === '/media/link:users/u1/body/far.jpg' && got && got.full && got.full.size === 3);

  /* ---- delete ---- */
  B._S.open = third; B.open(third); await wait(5);
  const del = sheet().querySelector('[data-b="del"]'); del.click(); await wait(5);
  ck('delete asks for a second tap', /Tap again/.test(sheet().querySelector('[data-b="del"]').textContent) && B.pics().length === 3);
  sheet().querySelector('[data-b="del"]').click(); await wait(20);
  ck('the second tap deletes it here and from the backup', B.pics().length === 2 && removed[0] === 'users/u1/body/1.jpg');

  /* ---- three appearances ---- */
  ck('styles for dark, soft light and light glass', /body\.light-mode \.kbs-seg button\.on\{color:#fff\}/.test(css) && /body\.soft-light \.kb-log \.sfield/.test(css) && /body\.light-mode \.kb-log \.sfield/.test(css));
  ck('no page errors', errors.length === 0 || (console.error(errors), false));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})();
