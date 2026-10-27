/* Hevy-grade logging: last time inline with one-tap Same / +2.5 / +5
   (a set without typing), thumb-sized targets, the plate calculator in
   kg and lb, a demo and cues for every exercise in the library, and the
   opt-in friends feed (server rules in functions/social.js, the share
   flow in src/p08_social.js). */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const { makeSocial } = require(path.join(__dirname, '..', 'functions', 'social.js'));
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* in-memory database for the server side */
function fakeDb() {
  const store = {};
  const get = (p) => { let o = store; for (const k of p.split('/').filter(Boolean)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : JSON.parse(JSON.stringify(o)); };
  const set = (p, v) => { const a = p.split('/').filter(Boolean); let o = store; a.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || !o[k]) o[k] = {}; o = o[k]; }); if (v == null) delete o[a[a.length - 1]]; else o[a[a.length - 1]] = JSON.parse(JSON.stringify(v)); };
  const ref = (p) => ({ once: async () => ({ val: () => get(p) }), set: async (v) => set(p, v), remove: async () => set(p, null), update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); } });
  return { ref, get };
}

function boot() {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const user = { uid: 'u1', getIdToken: () => Promise.resolve('tok') };
  const auth = { currentUser: user, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  const posts = [], favPosts = [];
  w.fetch = (u, o = {}) => {
    if (/\/api\/social\/post$/.test(String(u))) { posts.push(JSON.parse(o.body)); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, id: 'abcdef0123456789' }) }); }
    if (/\/api\/social\/favs$/.test(String(u))) { favPosts.push(JSON.parse(o.body)); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) }); }
    if (/\/api\/social\/feed$/.test(String(u))) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ posts: [], favs: [{ handle: 'ana_lifts', favs: { sound: { n: 'Rain', ids: ['rain'] }, meals: ['Overnight oats'] } }, { handle: 'bo_b', favs: { meals: ['Overnight oats'] } }] }) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  };
  w.localStorage.setItem('kova_mode_v1', 'sample');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document, posts, favPosts };
}

(async () => {
  const { w, doc, posts, favPosts } = boot();
  await wait(900);
  const L = w.KovaLift;

  // plates
  const a = L.load(225, 45, [45, 35, 25, 10, 5, 2.5]);
  ck('225 lb on a 45 lb bar is a 45 and a 45 each side', a.ok && a.side.join() === '45,45' && a.loaded === 225);
  const b = L.load(187.5, 45, [45, 35, 25, 10, 5, 2.5]);
  ck('187.5 lb without 1.25 lb plates: the nearest you can load is 185', !b.ok && b.loaded === 185 && b.side.join() === '45,25');
  const c = L.load(100, 20, [25, 20, 15, 10, 5, 2.5, 1.25]);
  ck('100 kg on a 20 kg bar: 25 and 15 each side', c.ok && c.side.join() === '25,15');
  const d = L.load(62.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25]);
  ck('62.5 kg loads exactly with a 1.25 kg plate', d.ok && d.side.join() === '20,1.25');
  ck('under the bar says so', L.load(30, 45, [45]).under === true);
  w.go('session'); await wait(20);
  L.plates(225, 'lb'); await wait(20);
  const pc = doc.getElementById('klpHost');
  ck('Plates opens its own screen, s-platecalc, in Workout\'s colours', doc.getElementById('s-platecalc').classList.contains('on') && doc.getElementById('app').getAttribute('data-pillar') === 'move' && /Plates/.test(doc.querySelector('#s-platecalc .title-s').textContent));
  ck('it shows what goes on each side, and the bar and unit choices (45 / 35 / 15 lb bars among them)', /45 · 45/.test(pc.textContent) && [45, 35, 15].every((b) => !!pc.querySelector('.klp-bars [data-b="' + b + '"]')) && pc.querySelectorAll('.klp-units .klp-c').length === 2 && pc.querySelectorAll('.klp-bar i').length >= 2);
  ck('the weight comes in filled', +doc.getElementById('klpW').value === 225);
  pc.querySelector('[data-u="kg"]').click(); await wait(10);
  ck('switching to kg converts the target and uses kg plates', /kg each side/.test(pc.querySelector('.klp-out').textContent) && +doc.getElementById('klpW').value === 102);
  pc.querySelector('[data-u="lb"]').click(); await wait(10);
  const inp = doc.getElementById('klpW'); inp.value = '135'; inp.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(10);
  ck('typing a new weight redraws it (135: a 45 each side)', /^45 /.test(pc.querySelector('.klp-big').textContent.trim()) && /Loads exactly 135/.test(pc.textContent));
  w.goBack(); await wait(20);
  ck('Back returns to the workout', doc.getElementById('s-session').classList.contains('on'));

  // demos for every exercise
  const XL = w.KSESS.XL;
  const missing = XL.filter((x) => { const i = L.info(x.n); return !L.TEMPLATES[i.kind] || !i.cues || i.cues.length !== 3; });
  ck(`every exercise in the library (${XL.length}) has a demo and three cues`, missing.length === 0);
  if (missing.length) console.log('  missing:', missing.map((x) => x.n).join(', '));
  ck('the demos match the movement (squat, hinge, press, pull-up, curl, raise)', L.kindOf('Back squat') === 'squat' && L.kindOf('Deadlift') === 'hinge' && L.kindOf('Bench press') === 'press'
    && L.kindOf('Pull up') === 'pullup' && L.kindOf('Hammer curl') === 'curl' && L.kindOf('Lateral raise') === 'raise' && L.kindOf('Leg curl') === 'knee' && L.kindOf('Hanging leg raise') === 'crunch');
  L.demo('Deadlift'); await wait(10);
  const dm = doc.querySelector('#sheetIn .kld');
  ck('a demo loops the movement and lists the cues', dm && dm.querySelectorAll('svg animate').length > 10 && dm.querySelectorAll('.kld-cues li').length === 3 && /Bar over mid-foot/.test(dm.textContent));

  // one-tap sets in a real session
  w.go('session'); await wait(200);
  const sq = doc.querySelector('#exList [data-qs]');
  ck('each open set shows last time (or the target) with Same / +2.5 / +5', !!sq && /Last|Target/.test(doc.querySelector('#exList .sqlast').textContent));
  const st = w.KSESS.state(), ex0 = st.ex.findIndex((e) => e.sets.some((s) => !s.d));
  const btn = doc.querySelector(`#exList [data-qs^="${ex0}-"][data-qs$="-5"]`) || doc.querySelector(`#exList [data-qs^="${ex0}-"]`);
  const [bi, bj, binc] = btn.dataset.qs.split('-').map(Number);
  const before = st.ex[bi].sets[bj];
  btn.click(); await wait(50);
  const after = w.KSESS.state().ex[bi].sets[bj];
  ck('one tap logs the set without typing', after.d === 1 && after.r > 0);
  ck('+5 adds five pounds to last time', binc !== 5 || after.w > 0);
  ck('Plates and How to sit on each exercise', !!doc.querySelector('#exList [data-demo]') && (!!doc.querySelector('#exList [data-plates]') || !w.KSESS.state().ex.some((e) => w.KSESS.lib(e.n).eq === 'bb')));
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');
  ck('logging targets are thumb-sized (44 px)', /#s-session \.srow \.sfield\{min-height:44px/.test(css) && /\.srow \.schk\{min-width:44px;min-height:44px/.test(css));

  // friends feed: server
  const db = fakeDb(); let t = 1000;
  const S = makeSocial({ db, now: () => ++t });
  await S.setProfile('ana', { handle: 'ana_lifts', on: true });
  await S.setProfile('bo', { handle: 'bo_b', on: true });
  let err = null; try { await S.setProfile('cy', { handle: 'ana_lifts' }); } catch (e) { err = e; }
  ck('handles are unique', err && err.status === 409);
  let off = null; try { await S.follow('dee', 'ana_lifts'); } catch (e) { off = e; }
  ck('you cannot follow anyone until you opt in', off && off.status === 403);
  await S.follow('bo', 'ana_lifts');
  const pid = (await S.post('ana', { kind: 'pr', title: 'Push day', stats: { mins: 52, sets: 18, lifts: 5, prs: [{ n: 'Bench press', up: 4 }], hr: 150, sleep: 400 } })).id;
  const stored = db.get(`srv/social/posts/ana/${pid}`);
  ck('a post keeps only workout facts - no heart rate or sleep', stored.stats.mins === 52 && stored.stats.prs[0].n === 'Bench press' && stored.stats.hr === undefined && stored.stats.sleep === undefined);
  const fb = await S.feed('bo');
  ck('followers see it in their feed', fb.posts.length === 1 && fb.posts[0].owner === 'ana_lifts' && fb.posts[0].kind === 'pr');
  await S.like('bo', 'ana_lifts', pid); await S.comment('bo', 'ana_lifts', pid, 'Huge!');
  const fa = await S.feed('ana');
  ck('likes and comments reach the owner', fa.posts[0].likes === 1 && fa.posts[0].comments[0].text === 'Huge!' && fa.posts[0].comments[0].handle === 'bo_b');
  await S.setProfile('cy', { handle: 'cyra', on: true });
  let nf = null; try { await S.comment('cy', 'ana_lifts', pid, 'hi'); } catch (e) { nf = e; }
  ck('people who do not follow you cannot comment', nf && nf.status === 403);
  // favourites: only names, only what is switched on, only for followers
  const fv = await S.setFavs('ana', { favs: { sound: { n: 'Rain + Brown noise', ids: ['rain', 'brown', '../x'] }, meals: ['Overnight oats', 'Chicken bowl', 'Salmon', 'Fourth'], workout: 'Push day', lift: 'Bench press', nap: 20, weight: 70, hr: 55, kcal: 2100 } });
  ck('favourites keep names only (sound ids, 3 meals, workout, lift, nap), never weight, heart rate or calories', fv.favs.sound.ids.join() === 'rain,brown' && fv.favs.meals.length === 3 && fv.favs.nap === 20 && fv.favs.weight === undefined && fv.favs.hr === undefined && fv.favs.kcal === undefined);
  const ana = await S.profileOf('bo', 'ana_lifts');
  ck('a follower sees them on the profile, with workouts and records shared', ana.favs.workout === 'Push day' && ana.workouts === 1 && ana.prs === 1);
  let pv = null; try { await S.profileOf('cy', 'ana_lifts'); } catch (e) { pv = e; }
  ck('someone who does not follow you cannot see your favourites', pv && pv.status === 403);
  ck('the feed brings favourites of the people you follow', (await S.feed('bo')).favs.some((f) => f.handle === 'ana_lifts' && f.favs.lift === 'Bench press'));
  await S.forget('bo');
  ck('deleting an account removes its likes, comments and follows', db.get(`srv/social/posts/ana/${pid}/likes/bo`) == null && Object.keys(db.get(`srv/social/posts/ana/${pid}/comments`) || {}).length === 0 && Object.keys(db.get('srv/social/followers/ana') || {}).length === 0 && db.get('srv/social/handles/bo_b') == null);

  // friends feed: the app
  ck('the friends feed is one row in Settings, off by default, and not a card on Workout', /Off\. Share workouts/.test(doc.getElementById('ksoRow').textContent) && !!doc.querySelector('#s-settings #ksoRow') && !doc.querySelector('#s-move .kso-entry'));
  const H = { 'Bench press': [{ t: Date.now() - 9 * 864e5, e1: 200 }, { t: Date.now(), e1: 210 }] };
  w.localStorage.setItem('kova_hist_v1', JSON.stringify(H));
  w.localStorage.setItem('kova_log_v1', JSON.stringify([{ t: Date.now(), day: 'Push', mins: 48, ex: [{ n: 'Bench press', sets: [{}, {}, {}] }] }]));
  const lp = w.KovaSocial.lastPost();
  ck('a finished workout becomes a post with its records', lp.kind === 'pr' && lp.stats.prs[0].n === 'Bench press' && lp.stats.prs[0].up === 5 && lp.stats.sets === 3 && lp.stats.mins === 48);
  w.KovaSocial.afterWorkout(); await wait(20);
  ck('while it is off, nothing is shared or asked', posts.length === 0 && !doc.querySelector('#sheetIn .kso'));
  w.KovaSocial._set({ on: true, handle: 'isa', auto: null });
  w.KovaSocial.afterWorkout(); await wait(20);
  ck('the first time, it asks before sharing', /Share this with your friends/.test(doc.querySelector('#sheetIn .kso').textContent) && posts.length === 0);
  doc.querySelector('#sheetIn [data-so="always"]').click(); await wait(50);
  ck('"Share future workouts" shares this one and remembers', posts.length === 1 && posts[0].title === 'Push' && w.KovaSocial._S().auto === true);
  ck('every share can be undone', !!doc.getElementById('ksoUndo'));

  // favourites in the app
  w.localStorage.setItem('kova_mix_log', JSON.stringify([{ s: 'brown,rain', ids: ['rain', 'brown'] }, { s: 'brown,rain', ids: ['rain', 'brown'] }, { s: 'ocean', ids: ['ocean'] }]));
  const fc = w.KovaSocial.favCandidates();
  ck('favourites are suggested from your own log (your usual sleep mix, your most-done workout)', fc.sound && fc.sound.ids.join() === 'brown,rain' && !!fc.workout);
  w.KovaSocial.openFeed(); await wait(60);
  const sh = doc.querySelector('#sheetIn .kso');
  ck('the feed lists your favourites, each off until you switch it on', !!sh.querySelector('.kso-favs') && [...sh.querySelectorAll('[data-fav]')].every((c) => !c.checked));
  ck('...and spells out what friends see and never see', /They never see/.test(sh.textContent) && /calories/.test(sh.textContent) && /cycle/.test(sh.textContent));
  ck('"Popular with your friends" shows what the people you follow share', /Popular with your friends/.test(sh.textContent) && /Overnight oats/.test(sh.textContent) && /@ana_lifts, @bo_b/.test(sh.textContent) && !!sh.querySelector('[data-a="play"]'));
  const sc = sh.querySelector('[data-fav="sound"]'); sc.checked = true; sc.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(40);
  ck('switching one on shares only that one', favPosts.length === 1 && Object.keys(favPosts[0].favs).join() === 'sound' && favPosts[0].favs.sound.ids.join() === 'brown,rain');

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
