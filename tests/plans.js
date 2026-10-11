/* Plans (p19): Health is the base, Training and Work OS + AI team are
   add-ons, sold as four plans (health, health_train, health_work, all) yearly with 30
   days free and monthly with 14. The app builds the plan, buys the right
   package and shows what is not in it; the server checks each paid route
   against the part it belongs to and sends one "trial ends in 2 days"
   push. RevenueCat and Firebase are faked; nothing is charged. */
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 864e5;

function boot(opts) {
  opts = opts || {};
  const vc = new VirtualConsole(); const errors = [];
  vc.on('jsdomError', (e) => errors.push(String(e && (e.message || e))));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const user = { uid: 'u1', email: 'a@b.c', getIdToken: () => Promise.resolve('tok') };
  const auth = { get currentUser() { return user; }, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  const P = (id, price) => ({ identifier: id, packageType: 'CUSTOM', webBillingProduct: { currentPrice: { formattedPrice: price } } });
  const pk = [P('health_year', '€49.99'), P('health_month', '€8.99'), P('health_train_year', '€74.99'), P('health_train_month', '€12.99'), P('health_work_year', '€94.99'), P('health_work_month', '€15.99'), P('all_year', '€109.99'), P('all_month', '€17.99')];
  const rc = { purchases: [] };
  let active = null;
  const ci = () => ({ managementURL: 'x', entitlements: { active: active || {} } });
  const inst = {
    getOfferings: () => Promise.resolve({ current: { availablePackages: pk } }),
    purchase: (p) => { rc.purchases.push(p.rcPackage.identifier); active = { health: { periodType: 'TRIAL', willRenew: true, expirationDate: new Date(Date.now() + 14 * DAY) } }; return Promise.resolve({ customerInfo: ci() }); },
    getCustomerInfo: () => Promise.resolve(ci())
  };
  if (opts.rc) {
    w.Purchases = { Purchases: { isConfigured: () => true, getSharedInstance: () => inst, configure: () => inst } };
    w.KOVA_RC = { web: 'rcb_test_public', ios: '', android: '', entitlement: 'kova_pro' };
  }
  w.localStorage.setItem('kova_mode_v1', 'sample');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  return { w, doc: w.document, rc, errors };
}

(async () => {
  /* ===================== the app ===================== */
  const A = boot({});
  await wait(500);
  A.w.go('plan'); await wait(60);
  const fine = () => A.doc.getElementById('planFine').textContent;
  ck('plan: Health is the base and always in, Training and Work OS are add-ons', /has it handled/.test(A.doc.getElementById('planBody').textContent)
    && A.doc.querySelector('.pln-row.fixed') && /Health/.test(A.doc.querySelector('.pln-row.fixed').textContent)
    && !!A.doc.querySelector('[data-add="train"]') && !!A.doc.querySelector('[data-add="work"]'));
  ck('plan: it opens on Everything, yearly, 30 days free, $119.99', /Everything/.test(A.doc.querySelector('.pln-sum').textContent) && /\$119\.99/.test(A.doc.getElementById('planTotal').textContent) && /Start 30 days free/.test(A.doc.getElementById('planGo').textContent));
  const sum = () => A.doc.querySelector('.pln-sum').textContent, total = () => A.doc.getElementById('planTotal').textContent;
  const on = (k) => A.doc.querySelector('[data-add="' + k + '"]').getAttribute('aria-checked') === 'true';
  ck('plan: both add-ons start on; each shows what it adds ($15 Training, $35 Work OS a year) and the bundle saving', /\+\$15\.00\/yr/.test(A.doc.querySelector('[data-add="train"]').textContent) && /\+\$35\.00\/yr/.test(A.doc.querySelector('[data-add="work"]').textContent) && /save \$10\.00 a year/.test(A.doc.getElementById('planBody').textContent));
  ck('plan: neither add-on is locked or "included" in the other', !A.doc.querySelector('.pln-row.fixed [data-add]') && !/Included with Work OS/.test(A.doc.getElementById('planBody').textContent));
  A.doc.querySelector('[data-add="work"]').click(); await wait(5);
  ck('plan: pressing Work OS turns off only Work OS; Training stays on ($84.99)', !on('work') && on('train') && /Health \+ Training/.test(sum()) && /\$84\.99/.test(total()));
  A.doc.querySelector('[data-add="train"]').click(); await wait(5);
  ck('plan: then pressing Training turns it off: Health alone, $59.99 a year', !on('train') && !on('work') && /\$59\.99/.test(total()) && /then \$59\.99 a year/.test(fine()));
  A.doc.querySelector('[data-add="work"]').click(); await wait(5);
  ck('plan: Work OS on its own is Health + Work OS, $104.99 (no Training forced in)', on('work') && !on('train') && /Health \+ Work OS/.test(sum()) && /\$104\.99/.test(total()));
  A.doc.querySelector('[data-add="work"]').click(); await wait(5);
  A.doc.querySelector('[data-add="train"]').click(); await wait(5);
  ck('plan: adding Training is +$25.00 a year, $84.99 in all', /Health \+ Training/.test(sum()) && /\$84\.99/.test(total()));
  A.doc.querySelector('#planTog [data-p="month"]').click(); await wait(5);
  ck('plan: monthly is 14 days free', /Start 14 days free/.test(A.doc.getElementById('planGo').textContent) && /Free for 14 days, then \$13\.99 a month/.test(fine()));
  A.doc.querySelector('[data-more="health"]').click();
  const hd = A.doc.getElementById('plnDrop-health').textContent;
  ck('plan: Health opens to say exactly what is inside, in short lines: scan, barcode, recipes, sleep, watch, Ask Kova', !A.doc.getElementById('plnDrop-health').hidden && /barcode/.test(hd) && /Recipes/.test(hd) && /sleep score/i.test(hd) && /HRV/.test(hd) && /bloated/.test(hd) && A.doc.querySelectorAll('#plnDrop-health li b').length >= 6);
  A.doc.querySelector('[data-more="work"]').click();
  ck('plan: Work OS names its AI team, Maya posting, meeting prep and the booking link', /AI team/.test(A.doc.getElementById('plnDrop-work').textContent) && /Maya/.test(A.doc.getElementById('plnDrop-work').textContent) && /booking link/i.test(A.doc.getElementById('plnDrop-work').textContent) && A.doc.querySelector('[data-more="work"]').getAttribute('aria-expanded') === 'true');
  ck('plan: each line is short (no paragraphs)', [...A.doc.querySelectorAll('.pln-drop li')].every((li) => li.textContent.length <= 90));
  ck('plan: no feature list and no price talk, an arc of where you will be instead', /Where you will be/.test(A.doc.getElementById('planBody').textContent) && !/What each part gives you|One person, one price/.test(A.doc.getElementById('planBody').textContent));
  ck('without payments switched on, every part is open and nothing is locked', A.w.KovaBilling.has('train') && A.w.KovaBilling.has('work') && !A.doc.querySelector('.kbl'));

  const B = boot({ rc: true });
  await wait(500);
  B.w.go('plan'); await wait(200);
  ck('store prices replace the defaults for every plan', /€109\.99/.test(B.doc.getElementById('planTotal').textContent) && /€17\.99/.test(B.doc.querySelector('#planTog [data-p="month"]').textContent));
  ck('a store price for Health + Work OS shows when only Work OS is on', (B.doc.querySelector('[data-add="train"]').click(), /€94\.99/.test(B.doc.getElementById('planTotal').textContent)));
  B.doc.querySelector('[data-add="train"]').click(); await wait(5);
  B.doc.querySelector('[data-add="work"]').click(); await wait(5);
  B.doc.querySelector('#planTog [data-p="month"]').click(); await wait(5);
  B.doc.getElementById('planGo').click(); await wait(200);
  ck('Health + Training, monthly, buys exactly that package', B.rc.purchases[0] === 'health_train_month');

  /* what is in the plan */
  const until = new Date(Date.now() + 20 * DAY);
  B.w.KovaBilling._take({ managementURL: 'x', entitlements: { active: { health: { periodType: 'NORMAL', willRenew: true, expirationDate: until } } } });
  ck('a Health plan has Health, not Training or Work', B.w.KovaBilling.has('health') && !B.w.KovaBilling.has('train') && !B.w.KovaBilling.has('work') && B.w.KovaBilling.planName() === 'Health');
  B.w.go('move'); await wait(60);
  const lock = B.doc.querySelector('#s-move .kbl[data-part="train"]');
  ck('Workout still opens, with one card about the outcome (get stronger) and what adding it costs', !!lock && /Get stronger every week/.test(lock.textContent) && /\$4\.00 a month/.test(lock.textContent));
  const start = B.doc.getElementById('startBtn');
  if (start) start.click(); await wait(200);
  ck('starting a workout without Training opens the plans with Training ticked and Work not', B.doc.getElementById('s-plan').classList.contains('on')
    && B.doc.querySelector('[data-add="train"]').getAttribute('aria-checked') === 'true' && B.doc.querySelector('[data-add="work"]').getAttribute('aria-checked') === 'false');
  B.w.KovaBilling._take({ managementURL: 'x', entitlements: { active: { kova_pro: { periodType: 'TRIAL', willRenew: true, expirationDate: until } } } });
  B.w.go('move'); await wait(60);
  ck('the old single entitlement (kova_pro) still means everything, and the card goes', B.w.KovaBilling.has('work') && B.w.KovaBilling.has('train') && !B.doc.querySelector('#s-move .kbl'));
  ck('Settings names the plan and the trial end', /Everything · free trial until/.test(B.doc.querySelector('#s-settings [data-go="plan"] .li-sub').textContent));
  ck('no page errors', A.errors.concat(B.errors).length === 0 || (console.error(A.errors, B.errors), false));

  /* ===================== the server ===================== */
  const store = {};
  const get = (p) => { let o = store; for (const k of p.split('/').filter(Boolean)) { if (o == null) return null; o = o[k]; } return o === undefined ? null : JSON.parse(JSON.stringify(o)); };
  const set = (p, v) => { const parts = p.split('/').filter(Boolean); let o = store; parts.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || !o[k]) o[k] = {}; o = o[k]; }); if (v == null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = JSON.parse(JSON.stringify(v)); };
  const ref = (p = '') => ({ child: (c) => ref(p + '/' + c), once: async () => ({ val: () => get(p) }), set: async (v) => set(p, v), remove: async () => set(p, null),
    update: async (o) => { for (const k of Object.keys(o)) set(p + '/' + k, o[k]); }, transaction: async (fn) => { const v = fn(get(p)); set(p, v); return { committed: true, snapshot: { val: () => v } }; } });
  const fakeAdmin = { initializeApp() {}, database: () => ({ ref }), auth: () => ({ verifyIdToken: async (t) => { if (t.startsWith('good-')) return { uid: t.slice(5) }; throw new Error('bad'); } }) };
  const orig = Module._load;
  Module._load = function (req, ...rest) { if (req === 'firebase-admin') return fakeAdmin; return orig.call(this, req, ...rest); };
  const { makeBilling } = require(path.join(__dirname, '..', 'functions', 'billing.js'));
  const api = require(path.join(__dirname, '..', 'functions', 'api.js'));
  const now = Date.now();
  const iso = (t) => new Date(t).toISOString();
  const bill = makeBilling({ db: { ref }, cfg: { rcSecret: 'sk_test' }, now: () => now });
  const a1 = bill.activeFrom({ entitlements: { kova_pro: { expires_date: iso(now + DAY), period_type: 'trial' } } });
  ck('server: the old kova_pro entitlement is all three parts', a1.pro && a1.parts.health && a1.parts.train && a1.parts.work && a1.period === 'trial');
  const a2 = bill.activeFrom({ entitlements: { health: { expires_date: iso(now + 10 * DAY), period_type: 'normal' }, train: { expires_date: iso(now - DAY) } } });
  ck('server: an expired add-on does not count', a2.pro && a2.parts.health && !a2.parts.train && !a2.parts.work);
  ck('server: nothing active is no plan', bill.activeFrom({ entitlements: {} }).pro === false);

  set('srv/pro/hu', { pro: true, until: now + 10 * DAY, period: 'normal', parts: { health: true, train: false, work: false }, at: now });
  set('srv/pro/wu', { pro: true, until: now + 10 * DAY, period: 'normal', parts: { health: true, train: true, work: true }, at: now });
  const cfg = { base: 'https://k/api', rcSecret: 'sk_test', anthropicKey: '', model: 'm', mealModel: 'm', chatDaily: 150, chatGlobalDaily: 5000, fdcKey: 'DEMO_KEY' };
  function call(method, url, body, token) {
    const headers = { authorization: 'Bearer ' + token };
    const req = { method, path: url, body: body || {}, query: {}, ip: '1.1.1.' + Math.floor(Math.random() * 250), get: (h) => headers[h.toLowerCase()] };
    return new Promise((resolve) => {
      const res = { statusCode: 200, headers: {}, status(s) { this.statusCode = s; return this; }, set() { return this; }, json(o) { resolve({ status: this.statusCode, body: o }); }, send(t) { resolve({ status: this.statusCode, body: t }); } };
      api.handle(req, res, cfg);
    });
  }
  const IMG = Buffer.from('x'.repeat(300)).toString('base64');
  /* RevenueCat for someone with no cached answer: no entitlements */
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ subscriber: { entitlements: {} } }), text: async () => '' });
  const m1 = await call('POST', '/meal/read', { image: IMG }, 'good-hu');
  ck('server: a Health plan reads meal photos (gets past the plan check)', m1.status !== 402);
  const c1 = await call('POST', '/crew/step', { emp: 'ava', messages: [] }, 'good-hu');
  ck('server: a Health plan cannot run the AI team: 402 naming the Work OS add-on', c1.status === 402 && /Work OS and the AI team/.test(c1.body.error));
  const c2 = await call('POST', '/crew/step', { emp: 'ava', messages: [] }, 'good-wu');
  ck('server: Everything runs the AI team', c2.status !== 402);
  const n1 = await call('POST', '/meal/read', { image: IMG }, 'good-nobody');
  ck('server: no plan at all is 402 for Health features', n1.status === 402 && /Health plan/.test(n1.body.error));

  /* the trial reminder */
  set('srv/pro/t1', { pro: true, until: now + 1.5 * DAY, period: 'trial', parts: { health: true }, at: now });
  set('srv/pro/t2', { pro: true, until: now + 5 * DAY, period: 'trial', parts: { health: true }, at: now });
  set('srv/pro/t3', { pro: true, until: now + 1.5 * DAY, period: 'normal', parts: { health: true }, at: now });
  const sent = [];
  const push = { send: async (uid, note) => { sent.push([uid, note]); return { sent: 1 }; } };
  const r1 = await bill.trialReminders(push);
  const r2 = await bill.trialReminders(push);
  ck('server: "your free trial ends in 2 days" goes once, only to a trial ending within 2 days', r1 === 1 && r2 === 0 && sent.length === 1 && sent[0][0] === 't1' && /ends in 2 days/.test(sent[0][1].title) && sent[0][1].screen === 'plan');
  ck('server: it says how to stop before being charged', /cancel before/.test(sent[0][1].body) && /not charged/.test(sent[0][1].body));
  const netlify = fs.readFileSync(path.join(__dirname, '..', 'functions', 'netlify.js'), 'utf8');
  ck('server: the 5-minute timer runs the trial reminders (Netlify and Vercel share it)', /trialReminders\(pusher\)/.test(netlify));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
