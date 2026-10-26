/* p44, the owner: "why am I not getting any notifications when I put my
   information? ... school assignments... gym, creating the app, e-commerce".
   A task can have a time and when to be reminded; Kova says so at that
   moment (a card while open, the system notification in a background tab),
   once, across devices; and the server gets a one-off for each upcoming
   reminder, so pushes reach a closed app once the push key is set. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const { cleanList, dueItems } = require(__dirname + '/../functions/push.js');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
['kova.auth.skipped', 'kova.auth.local'].forEach((k) => w.localStorage.setItem(k, '1'));
w.localStorage.setItem('kova_mode_v1', 'live');
w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
w.localStorage.setItem('kova_profile_v2', JSON.stringify({ tourSeen: true }));
let clock = null; const realNow = Date.now;
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
w.Date.now = () => (clock == null ? realNow() : clock);

(async () => {
  await wait(1200);
  const doc = w.document, T = w.KovaTaskAlert, WO = w.WorkOS;
  ck('the reminders are there', !!T && typeof T.check === 'function');
  /* New task: a time, and when to be reminded */
  clock = WO.startOfDay() + 10 * 36e5;                         /* 10 AM today */
  w.go('worktasks'); await wait(200);
  doc.getElementById('wtNewTask').click(); await wait(50);
  ck('New task asks for a time (optional)', !!doc.getElementById('ntTime') && doc.getElementById('ntRemW').hidden);
  doc.getElementById('ntName').value = 'Chem homework ch 5';
  const t = doc.getElementById('ntTime'); t.value = '17:00'; t.dispatchEvent(new w.Event('input'));
  ck('…with a time, it asks when to remind: at the time, 15 min, 1 hour or 1 day before', !doc.getElementById('ntRemW').hidden && [...doc.querySelectorAll('.ntr')].map((x) => x.textContent).join() === 'At the time,15 min before,1 hour before,1 day before');
  doc.querySelector('.ntr[data-v="15"]').click();
  doc.getElementById('ntGo').click(); await wait(50);
  const it = WO.list('items').filter((i) => i.name === 'Chem homework ch 5')[0];
  ck('the task keeps its time and reminder', it && it.time === '17:00' && it.remind === 15 && it.due);
  const due = T.dueAt(it);
  ck('…due today at 5 PM, reminded at 4:45', new Date(due).getHours() === 17 && T.remindAt(it) === due - 15 * 60000 && T.fmt('17:00') === '5 PM');
  ck('the task list says the time', /5 PM/.test(doc.getElementById('s-worktasks').textContent));
  WO.create('items', { name: 'No time task', status: 'Not Started', due: WO.startOfDay() });
  WO.create('items', { name: 'Finished one', status: 'Completed', due: WO.startOfDay(), time: '17:00', remind: 15 });
  /* before its moment: nothing */
  clock = due - 20 * 60000; T.check();
  ck('nothing before its moment', !doc.querySelector('#kta .kta-c'));
  clock = due - 14 * 60000; T.check();
  const cards = () => [...doc.querySelectorAll('#kta .kta-c')].map((c) => c.querySelector('b').textContent);
  ck('at 4:46 a card at the top: the task and "Due in 14 min", with Open, Done and In 10 min', cards().join() === 'Chem homework ch 5' && /Due in 14 min/.test(doc.querySelector('#kta .kta-c').textContent) && doc.querySelectorAll('#kta [data-kta]').length === 3);
  ck('…a task with no time, or one already done, never reminds', !cards().includes('No time task') && !cards().includes('Finished one'));
  ck('…written on the task, so it is said once (the other device sees it too)', WO.find('items', it.id).alerted === T.remindAt(it));
  T.check(); ck('…once', cards().length === 1);
  doc.querySelector('#kta [data-kta="later"]').click();
  ck('In 10 min: the card goes and comes back 10 minutes later', !doc.querySelector('#kta .kta-c') && WO.find('items', it.id).snooze > 0);
  clock += 5 * 60000; T.check(); ck('…not after 5', !doc.querySelector('#kta .kta-c'));
  clock += 6 * 60000; T.check(); ck('…after 10', cards().join() === 'Chem homework ch 5');
  doc.querySelector('#kta [data-kta="done"]').click();
  ck('Done marks the task completed and it stays quiet', WO.find('items', it.id).status === 'Completed' && !doc.querySelector('#kta .kta-c'));
  clock += 30 * 60000; T.check(); ck('…for good', !doc.querySelector('#kta .kta-c'));
  /* the server's list: one-offs for what is coming */
  clock = null;
  const gym = WO.create('items', { name: 'Gym: legs', status: 'Not Started', due: WO.startOfDay() + 864e5, time: '17:00', remind: 60 });
  const P = T.pushItems();
  const k = Object.keys(P).filter((x) => P[x].title === 'Gym: legs')[0];
  ck('each upcoming reminder goes to the server as a one-off on its date and time (tomorrow, 4 PM)', k && P[k].kind === 'task' && P[k].time === '16:00' && /^\d{4}-\d{2}-\d{2}$/.test(P[k].date) && P[k].screen === 'worktasks');
  ck('…in the push list KovaPush sends', w.KovaPush && Object.keys(w.KovaPush.items()).includes(k));
  const L = cleanList({ tz: 'UTC', items: { [k]: Object.assign({}, P[k], { date: '2026-10-27', time: '16:00', days: [2] }) } });
  ck('the server keeps the date and sends it only on that day', L.items[k].date === '2026-10-27' && dueItems(L, {}, Date.parse('2026-10-27T16:02:00Z')).length === 1 && dueItems(L, {}, Date.parse('2026-11-03T16:02:00Z')).length === 0);
  ck('a task’s page can change its time and reminder', (w.__openWorkItem(gym.id), await wait(50), !!doc.getElementById('wiTime') && doc.querySelectorAll('.wiRem').length === 4 && doc.querySelector('.wiRem.on').getAttribute('data-v') === '60'));
  ck('no script errors', !errors.filter((x) => !/Not implemented/i.test(x)).length || (console.log(errors.slice(0, 3)), false));
  let p = 0; R.forEach(([n, c]) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (c) p++; });
  console.log(p + '/' + R.length + ' taskalert');
  process.exit(p === R.length ? 0 : 1);
})();
