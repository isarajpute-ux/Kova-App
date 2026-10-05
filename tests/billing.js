/* KovaBilling (src/p08_billing.js): the trial button takes money through
   RevenueCat, the price shows before the checkout opens, cancel and
   restore are one tap, the answer is cached for offline, trial / subscribe
   / cancel reach analytics, and a 402 from the server opens the paywall.
   RevenueCat's web SDK is stubbed; nothing is charged. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const user = { uid: 'u1', email: 'a@b.c', getIdToken: () => Promise.resolve('tok') };
  const auth = { get currentUser() { return user; }, onAuthStateChanged(cb) { cb(user); }, signOut: () => Promise.resolve() };
  const events = [];
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent(n, p) { events.push([n, p]); }, setUserId() {} }) };
  const reqs = [];
  w.fetch = (url, o = {}) => {
    reqs.push(String(url));
    if (/\/chat$/.test(String(url))) return Promise.resolve({ ok: false, status: 402, json: () => Promise.resolve({ error: 'This needs Kova Pro.' }) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
  };
  const rc = { configured: [], purchases: [], mode: opts.mode || 'trial' };
  const ANNUAL = { identifier: '$rc_annual', packageType: '$rc_annual', webBillingProduct: { currentPrice: { formattedPrice: '€54.99' } } };
  const MONTHLY = { identifier: '$rc_monthly', packageType: '$rc_monthly', webBillingProduct: { currentPrice: { formattedPrice: '€12.99' } } };
  const ci = (active) => ({ managementURL: active ? 'https://pay.rev.cat/manage/u1' : null,
    entitlements: { active: active ? { kova_pro: { periodType: active.period, willRenew: active.will !== false, expirationDate: new Date(Date.now() + 10 * 864e5) } } : {} } });
  let current = null;
  const inst = {
    getOfferings: () => Promise.resolve({ current: { annual: ANNUAL, monthly: MONTHLY, availablePackages: [ANNUAL, MONTHLY] } }),
    purchase: (p) => { rc.purchases.push(p.rcPackage.identifier);
      if (rc.mode === 'cancel') { const e = new Error('User cancelled'); e.errorCode = 1; return Promise.reject(e); }
      current = { period: 'trial' }; return Promise.resolve({ customerInfo: ci(current) }); },
    getCustomerInfo: () => Promise.resolve(ci(current))
  };
  if (opts.rc) {
    w.Purchases = { Purchases: { isConfigured: () => rc.configured.length > 0, getSharedInstance: () => inst,
      configure: (o) => { rc.configured.push(o); return inst; } } };
  }
  if (opts.rc) w.KOVA_RC = { web: 'rcb_test_public', ios: '', android: '', entitlement: 'kova_pro' };
  const opened = [];
  w.open = (u) => { opened.push(u); return null; };
  w.localStorage.setItem('kova_mode_v1', 'sample');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.consent', JSON.stringify({ a: true, at: 1 }));   // analytics allowed (the banner's yes)
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  return { w, doc: w.document, events, rc, opened, reqs, setCurrent: (c) => { current = c; } };
}

(async () => {
  // ---------- payments not switched on ----------
  const A = boot({});
  await wait(500);
  A.w.go('plan'); await wait(80);
  ck('the price and trial terms show before any checkout', /\$59\.99 a year/.test(A.doc.getElementById('planFine').textContent) && /Cancel any time/.test(A.doc.getElementById('planFine').textContent));
  A.doc.getElementById('planGo').click(); await wait(60);
  ck('without keys the button says payments are off and nothing was charged', /not switched on yet\. Nothing was charged/.test(A.doc.getElementById('kbiMsg').textContent));
  ck('and no checkout script is loaded', !A.doc.querySelector('script[src*="purchases-js"]'));
  ck('Manage or cancel and Restore are on the plan screen', !!A.doc.querySelector('#planBody [data-kbi="manage"]') && !!A.doc.querySelector('#planBody [data-kbi="restore"]'));
  ck('and in Settings, one tap each', !!A.doc.getElementById('kbiManage') && !!A.doc.getElementById('kbiRestore'));

  // ---------- web checkout through RevenueCat ----------
  const B = boot({ rc: true });
  await wait(500);
  B.w.go('plan'); await wait(150);
  ck('the store\'s own prices replace the defaults', /€54\.99/.test(B.doc.querySelector('#planTog [data-p="year"] .plan-opt-p').textContent) && /€54\.99/.test(B.doc.getElementById('planFine').textContent));
  ck('the fine print says who bills (Stripe via RevenueCat on the web)', /Stripe through RevenueCat/.test(B.doc.getElementById('planBody').textContent));
  B.doc.getElementById('planGo').click(); await wait(150);
  ck('RevenueCat is configured with the Firebase uid as the customer', B.rc.configured.length === 1 && B.rc.configured[0].appUserId === 'u1' && B.rc.configured[0].apiKey === 'rcb_test_public');
  ck('the yearly plan (the default) is bought', B.rc.purchases[0] === '$rc_annual');
  ck('the trial has started and is cached for offline', B.w.KovaBilling.isPro() && JSON.parse(B.w.localStorage.getItem('kova.pro.v1')).period === 'trial');
  ck('the screen says so plainly', /free trial has started/i.test(B.doc.getElementById('kbiMsg').textContent));
  ck('trial_start reaches analytics, with no price or health data', B.events.some((e) => e[0] === 'trial_start' && e[1].plan === 'year' && !('price' in e[1])));
  B.doc.querySelector('#planBody [data-kbi="manage"]').click(); await wait(30);
  ck('Manage opens the billing page in one tap', B.opened[0] === 'https://pay.rev.cat/manage/u1');
  B.w.KovaBilling._take({ managementURL: 'x', entitlements: { active: { kova_pro: { periodType: 'TRIAL', willRenew: false, expirationDate: new Date(Date.now() + 864e5) } } } });
  B.w.KovaBilling._take({ managementURL: 'x', entitlements: { active: { kova_pro: { periodType: 'TRIAL', willRenew: false, expirationDate: new Date(Date.now() + 864e5) } } } });
  ck('a cancellation is counted once', B.events.filter((e) => e[0] === 'cancel').length === 1);
  ck('Settings shows it is cancelled and when it ends', /cancelled, ends then/.test(B.doc.querySelector('#s-settings [data-go="plan"] .li-sub').textContent));

  // ---------- the person backs out ----------
  const Cx = boot({ rc: true, mode: 'cancel' });
  await wait(500);
  Cx.w.go('plan'); await wait(120);
  Cx.doc.getElementById('planGo').click(); await wait(150);
  ck('backing out of checkout says nothing was charged', /Nothing was charged/.test(Cx.doc.getElementById('kbiMsg').textContent) && !Cx.w.KovaBilling.isPro());

  // ---------- restore ----------
  const D = boot({ rc: true });
  await wait(500);
  D.setCurrent({ period: 'normal' });
  await D.w.KovaBilling.restore();
  ck('Restore purchases brings Pro back on a new install', D.w.KovaBilling.isPro());

  // ---------- the server says 402 ----------
  const E = boot({ rc: true });
  await wait(500);
  E.w.KovaChat.open(); E.w.KovaChat.send('how much protein do I need');
  /* wait for the answer and the plan screen, not a fixed time: jsdom is slow on a page this size */
  for (let i = 0; i < 50 && !E.doc.getElementById('kbiMsg'); i++) await wait(100);
  ck('a 402 from /chat still answers from the on-device guide', /Kova Pro/.test(E.doc.getElementById('kcFoot').textContent) && !!E.doc.querySelector('.kc-a'));
  ck('and opens the plan screen with the reason', E.doc.getElementById('s-plan').classList.contains('on') && /assistant are part of Kova Pro/.test((E.doc.getElementById('kbiMsg') || {}).textContent || ''));

  const failed = R.filter((r) => !r[1]);
  R.forEach((r) => console.log((r[1] ? 'PASS ' : 'FAIL ') + r[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
