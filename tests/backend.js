/* The previous Firebase block failed not because it was wrong but
   because it was never called - saveHealthData() existed and had zero
   call sites. So these tests assert BEHAVIOUR, not presence: a write to
   a real app key has to actually reach the fake db, and a remote value
   has to actually land in localStorage and repaint.

   Firebase is stubbed rather than mocked-away, so the code under test is
   the real KovaCloud with its real code path. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

// ---------------------------------------------------------------- stub
function makeFirebase() {
  const store = {};              // path -> value
  const listeners = {};          // path -> [fn]
  const authCbs = [];   // real Firebase allows many listeners
  let user = null;

  function refFor(path) {
    return {
      child(sub) { return refFor(path + '/' + sub); },
      set(v) { store[path] = v; fire(path); return Promise.resolve(); },
      update(v) { store[path] = Object.assign({}, store[path], v); return Promise.resolve(); },
      remove() { delete store[path]; return Promise.resolve(); },
      once() {
        const prefix = path + '/';
        const out = {};
        Object.keys(store).forEach(k => {
          if (k.startsWith(prefix)) out[k.slice(prefix.length)] = store[k];
        });
        return Promise.resolve({ val: () => (Object.keys(out).length ? out : null) });
      },
      on(evt, fn) { (listeners[path] = listeners[path] || []).push({ evt, fn }); return fn; },
      off() {}
    };
  }
  function fire(path) {
    const parent = path.split('/').slice(0, -1).join('/');
    const key = path.split('/').pop();
    (listeners[parent] || []).forEach(l => {
      if (l.evt === 'child_changed') l.fn({ val: () => store[path], key });
    });
  }

  return {
    _store: store,
    _signIn(u) { user = u; authCbs.forEach(cb => cb(u)); },
    initializeApp() {},
    apps: [{}],
    auth: () => ({
      get currentUser() { return user; },
      onAuthStateChanged(cb) { authCbs.push(cb); cb(user); },
      signInWithEmailAndPassword: () => Promise.resolve(),
      createUserWithEmailAndPassword: () => Promise.resolve(),
      signInAnonymously: () => Promise.resolve(),
      sendPasswordResetEmail: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
    }),
    database: () => ({ ref: refFor }),
    storage: () => ({ ref: () => ({ put: () => ({ on() {} }) }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }),
  };
}

const vc = new VirtualConsole();
const errors = [];
vc.on('jsdomError', e => errors.push(e.message));

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'https://kova.local/',
  virtualConsole: vc,
});
const { window } = dom;

// install the stub BEFORE the page scripts run
window.firebase = makeFirebase();
window.eval(
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1])
    .join('\n;\n')
);

const R = [];
const ck = (n, c) => R.push([n, !!c]);

setTimeout(() => {
  const fb = window.firebase;

  // ---- modules exist ------------------------------------------------
  ck('KovaCloud module present', window.KovaCloud);
  ck('KovaMedia module present', window.KovaMedia);
  ck('KovaAnalytics module present', window.KovaAnalytics);
  ck('KovaCloudAuth module present', window.KovaCloudAuth);
  ck('KP.reload added for post-pull refresh', window.KP && typeof window.KP.reload === 'function');
  ck('KovaFuel.emit added for post-pull refresh', window.KovaFuel && typeof window.KovaFuel.emit === 'function');

  // ---- the key list covers what the app really writes ---------------
  const keys = window.KovaCloud.keys();
  ['kova_profile_v2', 'kova_hist_v1', 'kova_log_v1', 'kova_strength_v1',
   'kova_sport_v1', 'kova_rhythm_v1', 'kova.health.v2', 'kova.ws'].forEach(k => {
    ck('syncs ' + k, keys.indexOf(k) >= 0);
  });
  ck('tracks dynamic nap keys by prefix', window.KovaCloud.tracked('kova_nap_2026-09-18'));
  ck('ignores unrelated keys', !window.KovaCloud.tracked('some_other_app_key'));

  // ---- sign in starts the sync --------------------------------------
  fb._signIn({ uid: 'u1', email: 'a@b.c', isAnonymous: false });

  setTimeout(() => {
    ck('sign-in starts sync', window.KovaCloud.status().signedIn === true);
    ck('sign-in records uid', window.KovaCloud.status().uid === 'u1');

    // ---- a real app write must reach the db -------------------------
    // This is the assertion the old code would have failed: writing a
    // lift history entry the way the app does, and checking it lands.
    window.localStorage.setItem('kova_hist_v1', JSON.stringify({ 'Barbell bench press': [{ top: 185 }] }));

    setTimeout(() => {
      const wrote = Object.keys(fb._store).filter(p => p.indexOf('users/u1/store/kova_hist_v1') === 0);
      ck('writing lift history reaches the cloud', wrote.length === 1);
      const rec = fb._store[wrote[0]];
      ck('record carries value + timestamp', rec && typeof rec.v === 'string' && typeof rec.t === 'number');
      ck('record round-trips the real data', rec && rec.v.indexOf('Barbell bench press') >= 0);

      // a KP write (fuel/profile) must also sync
      window.KP.set('foodlog', [{ kcal: 420, n: 'test meal' }]);

      setTimeout(() => {
        const kp = Object.keys(fb._store).filter(p => p.indexOf('users/u1/store/kova_profile_v2') === 0);
        ck('KP writes (fuel, profile, plan) reach the cloud', kp.length === 1);
        ck('fuel data is inside that record', kp.length && fb._store[kp[0]].v.indexOf('test meal') >= 0);

        // ---- a newer remote value must land locally -----------------
        const future = Date.now() + 60000;
        fb._store['users/u1/store/kova_strength_v1'] =
          { v: JSON.stringify({ Chest: { w: 225, r: 3 } }), t: future, key: 'kova_strength_v1' };

        window.KovaCloud.pull().then(() => {
          const got = window.localStorage.getItem('kova_strength_v1');
          ck('newer remote value lands in localStorage', got && got.indexOf('225') >= 0);

          // ---- an OLDER remote value must NOT clobber local ----------
          window.localStorage.setItem('kova_sport_v1', JSON.stringify({ local: 'wins' }));
          setTimeout(() => {
            fb._store['users/u1/store/kova_sport_v1'] =
              { v: JSON.stringify({ stale: 'remote' }), t: 1000, key: 'kova_sport_v1' };
            window.KovaCloud.pull().then(() => {
              const sp = window.localStorage.getItem('kova_sport_v1');
              ck('older remote value does NOT overwrite newer local', sp.indexOf('local') >= 0);

              // ---- media API shape ---------------------------------
              ck('KovaMedia.upload is callable', typeof window.KovaMedia.upload === 'function');
              ck('KovaMedia.list is callable', typeof window.KovaMedia.list === 'function');
              window.KovaMedia.upload('form', 'not-a-blob').then(
                () => ck('upload rejects unsupported input', false),
                () => ck('upload rejects unsupported input', true)
              ).then(report);
            });
          }, 1100);
        });
      }, 1100);
    }, 1100);
  }, 60);
}, 400);

function report() {
  let pass = 0, fail = 0;
  R.forEach(([n, o]) => { console.log((o ? 'PASS' : 'FAIL') + ' - ' + n); o ? pass++ : fail++; });
  console.log('\n' + pass + '/' + (pass + fail) + ' passing');
  if (errors.length) { console.log('runtime errors: ' + errors.length); errors.slice(0, 5).forEach(e => console.log('  ' + e)); }
  process.exit(fail || errors.length ? 1 : 0);
}
