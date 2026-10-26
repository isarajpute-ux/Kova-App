/* p43e, the owner: "why can I not save it?". Nearly everything (Work OS
   tasks, food, the plan) lives in one synced value, kova_profile_v2, and
   the device that saved last used to replace the other's copy whole: a
   task added on the laptop vanished as soon as the phone saved anything.
   Two devices share one fake cloud here; each runs the real KovaCloud. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* one cloud: a path -> value store, child_changed delivered to every device */
const store = {}, listeners = {};
function refFor(path) {
  return {
    child(sub) { return refFor(path + '/' + sub); },
    set(v) { store[path] = JSON.parse(JSON.stringify(v)); const parent = path.split('/').slice(0, -1).join('/'), key = path.split('/').pop();
      setTimeout(() => (listeners[parent] || []).forEach((l) => l.evt === 'child_changed' && l.fn({ val: () => store[path], key })), 5); return Promise.resolve(); },
    update() { return Promise.resolve(); },
    remove() { delete store[path]; return Promise.resolve(); },
    once() { const pre = path + '/', out = {}; Object.keys(store).forEach((k) => { if (k.startsWith(pre)) out[k.slice(pre.length)] = store[k]; }); return Promise.resolve({ val: () => (Object.keys(out).length ? out : null) }); },
    on(evt, fn) { (listeners[path] = listeners[path] || []).push({ evt, fn }); return fn; },
    off() {}
  };
}
function device(name) {
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => ({ currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() }),
    database: () => ({ ref: refFor }), storage: () => ({ ref: () => ({}) }), analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  ['kova.auth.skipped', 'kova.auth.local'].forEach((k) => w.localStorage.setItem(k, '1'));
  w.localStorage.setItem('kova_mode_v1', 'live');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.localStorage.setItem('kova_profile_v2', JSON.stringify({ tourSeen: true }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  return { w, errors, name };
}
const tasks = (d) => d.w.WorkOS.list('items').map((i) => i.name).sort().join('|');

(async () => {
  const lap = device('laptop'), phone = device('phone');
  await wait(1200);
  const M = lap.w.KovaCloud._merge;
  ck('the merge is there', typeof M === 'function');

  /* KP stamps a field only when it really changes */
  const KP = lap.w.KP;
  KP.set('quiz', { a: 1 }); const t1 = KP.all().__ts.quiz; await wait(15);
  KP.set('quiz', { a: 1 }); const t2 = KP.all().__ts.quiz;
  KP.set('quiz', { a: 2 }); const t3 = KP.all().__ts.quiz;
  ck('each field remembers when it last really changed (saving the same thing again does not count)', t1 && t1 === t2 && t3 > t2);

  /* the merge on its own */
  const L = { __ts: { foodlog: 300, plan: 100, work_os: 100 }, foodlog: ['phone meal'], plan: 'old plan',
    work_os: { v: 1, items: [{ id: 'a', name: 'Chem homework', created: 50 }], activity: [{ id: 'x1', at: 50 }] } };
  const Rm = { __ts: { foodlog: 200, plan: 250, work_os: 260 }, foodlog: ['laptop meal'], plan: 'new plan',
    work_os: { v: 1, items: [{ id: 'b', name: 'Gym at 5', created: 240 }], activity: [{ id: 'x2', at: 240 }] } };
  const m = M(L, Rm, false);
  ck('field by field: the newer food log (here) and the newer plan (there) both survive', m.out.foodlog[0] === 'phone meal' && m.out.plan === 'new plan');
  ck('Work OS task by task: a task from each device, both kept, the newest activity first', m.out.work_os.items.map((i) => i.name).sort().join() === 'Chem homework,Gym at 5' && m.out.work_os.activity[0].id === 'x2' && m.ours);
  const m2 = M(m.out, m.out, true);
  ck('…and two copies that already agree do not ping-pong', !m2.ours && JSON.stringify(m2.out) === JSON.stringify(m.out));
  const edited = M({ work_os: { items: [{ id: 'a', name: 'Chem homework, ch 5', created: 50, updated: 400 }] } }, { work_os: { items: [{ id: 'a', name: 'Chem homework', created: 50 }] } }, false);
  ck('the newest edit of the same task wins', edited.out.work_os.items[0].name === 'Chem homework, ch 5' && edited.ours);
  const del = M({ work_os: { items: [], gone: { a: 500 } } }, { work_os: { items: [{ id: 'a', name: 'Chem homework', created: 50 }] } }, false);
  ck('a deleted task stays deleted (the other device does not bring it back)', del.out.work_os.items.length === 0 && del.ours);

  /* two real devices on one account */
  lap.w.KovaCloud.start('u1'); phone.w.KovaCloud.start('u1'); await wait(300);
  lap.w.WorkOS.create('items', { name: 'Chem homework ch 5', status: 'Not Started' });
  await wait(1300);                                          /* pushed after 0.9 s, delivered to the phone */
  ck('a task added on the laptop reaches the phone', /Chem homework ch 5/.test(tasks(phone)));
  /* the phone saves something of its own: the laptop's task must survive */
  phone.w.WorkOS.create('items', { name: 'Gym at 5 pm', status: 'Not Started' });
  phone.w.KP.set('water', 6);
  await wait(1500);
  ck('the phone saving its own task does not wipe the laptop’s (both on both)', tasks(lap) === tasks(phone) && /Chem homework ch 5/.test(tasks(lap)) && /Gym at 5 pm/.test(tasks(lap)) || (console.log(tasks(lap), '/', tasks(phone)), false));
  /* the phone was asleep (offline) while the laptop added one; it then saves on its own */
  const listenersBak = listeners['users/u1/store']; listeners['users/u1/store'] = listenersBak.filter((l, i) => i === 0);   /* only the laptop hears */
  lap.w.WorkOS.create('items', { name: 'E-commerce: product photos', status: 'Not Started' }); await wait(1200);
  phone.w.WorkOS.create('items', { name: 'App: fix the dial', status: 'Not Started' }); await wait(1200);
  listeners['users/u1/store'] = listenersBak; await wait(100);
  /* the phone comes back: its copy (without the laptop's newest task) reached the cloud; the laptop merges and sends back the whole */
  await wait(1500);
  const all = ['Chem homework ch 5', 'Gym at 5 pm', 'E-commerce: product photos', 'App: fix the dial'];
  ck('a phone that was asleep and saved a stale copy no longer erases a task (everything ends up on both)', all.every((n) => tasks(lap).includes(n)) && all.every((n) => tasks(phone).includes(n)) || (console.log(tasks(lap), '/', tasks(phone)), false));
  const gone = phone.w.WorkOS.list('items').filter((i) => i.name === 'Gym at 5 pm')[0];
  phone.w.WorkOS.remove('items', gone.id); await wait(1500);
  ck('deleting on one device deletes on the other', !/Gym at 5 pm/.test(tasks(lap)) && !/Gym at 5 pm/.test(tasks(phone)));
  ck('no script errors', ![...lap.errors, ...phone.errors].filter((x) => !/Not implemented/i.test(x)).length || (console.log([...lap.errors, ...phone.errors].slice(0, 3)), false));
  let p = 0; R.forEach(([n, c]) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (c) p++; });
  console.log(p + '/' + R.length + ' sync');
  process.exit(p === R.length ? 0 : 1);
})();
