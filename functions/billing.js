/* billing - who has Kova Pro, from RevenueCat.

   One entitlement, "kova_pro", sold three ways and all landing in the
   same RevenueCat customer (the Firebase uid): App Store and Google Play
   in-app purchase inside the app (Apple requires IAP for digital
   subscriptions), and Stripe through RevenueCat Web Billing on the web.

   The server checks the entitlement before the routes that cost money to
   run (the model, publishing), so a modified page cannot skip the
   paywall. The answer is cached in srv/pro/{uid} for 30 minutes, and
   RevenueCat's webhook refreshes it the moment something changes
   (a trial starts, a renewal, a cancellation, a refund).

   Until REVENUECAT_SECRET_KEY is set, billing is off and every feature is
   open - nothing locks before payments exist. */

const TTL = 30 * 60e3;

function makeBilling(deps) {
  const { db, cfg } = deps;
  const fetch = deps.fetch || ((...a) => global.fetch(...a));
  const now = deps.now || Date.now;
  const ent = cfg.rcEntitlement || 'kova_pro';
  const configured = () => !!cfg.rcSecret;

  function activeFrom(sub) {
    const e = sub && sub.entitlements && sub.entitlements[ent];
    if (!e) return { pro: false, until: 0, period: '' };
    const exp = e.expires_date ? Date.parse(e.expires_date) : Infinity;
    const grace = e.grace_period_expires_date ? Date.parse(e.grace_period_expires_date) : 0;
    const until = Math.max(exp, grace);
    return { pro: until > now(), until: until === Infinity ? 0 : until, period: e.period_type || '', product: e.product_identifier || '' };
  }

  async function refresh(uid) {
    const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { authorization: `Bearer ${cfg.rcSecret}`, 'content-type': 'application/json' }
    });
    if (!r.ok) throw new Error('RevenueCat HTTP ' + r.status);
    const j = await r.json();
    const st = Object.assign(activeFrom(j.subscriber || {}), { at: now() });
    await db.ref(`srv/pro/${uid}`).set(st);
    return st;
  }

  async function status(uid) {
    if (!configured()) return { configured: false, pro: true, until: 0 };
    const c = (await db.ref(`srv/pro/${uid}`).once('value')).val();
    if (c && now() - (c.at || 0) < TTL && !(c.pro && c.until && c.until < now())) return Object.assign({ configured: true }, c);
    try { return Object.assign({ configured: true }, await refresh(uid)); }
    catch (e) {
      /* RevenueCat down: trust the last answer rather than lock people out */
      if (c) return Object.assign({ configured: true, stale: true }, c);
      throw e;
    }
  }

  /* RevenueCat -> POST /billing/webhook, with the Authorization value set
     in its dashboard. The event is only a hint; the state comes from the
     REST API, so a forged body cannot grant anything. */
  async function webhook(headers, body) {
    if (!cfg.rcWebhookAuth || (headers.authorization || '') !== cfg.rcWebhookAuth) return { ok: false, status: 401 };
    const ev = (body && body.event) || {};
    const ids = [ev.app_user_id].concat(ev.aliases || [], ev.transferred_to || []).filter((x) => typeof x === 'string' && /^[A-Za-z0-9_-]{6,128}$/.test(x));
    for (const uid of Array.from(new Set(ids))) {
      try { await refresh(uid); } catch (e) { console.error('billing webhook', uid, e.message); }
    }
    return { ok: true, status: 200, type: ev.type || '' };
  }

  /* on account deletion: RevenueCat's copy of the customer goes too
     (the store subscription itself is cancelled in the store) */
  async function forget(uid) {
    await db.ref(`srv/pro/${uid}`).remove();
    if (!configured()) return;
    await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      method: 'DELETE', headers: { authorization: `Bearer ${cfg.rcSecret}` }
    });
  }

  return { configured, status, refresh, webhook, forget, activeFrom };
}

module.exports = { makeBilling, TTL };
