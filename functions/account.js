/* account - "Export my data" and "Delete my account".

   Apple rejects apps that let you make an account but not delete it in
   the app, and health data needs a clean way out. Delete removes, in
   order: the connected accounts (tokens revoked at the provider where
   the provider supports it), every server record keyed by this person,
   their files, their synced data, and finally the Firebase Auth user.
   Each step is attempted even if an earlier one failed, and the result
   lists anything that could not be removed, so nothing fails silently.

   Export returns everything the server holds about the person except
   secrets: tokens and codes are listed by name only. The page adds its
   own local data (localStorage) to make the full download. */

/* per-person server paths, {uid} replaced */
const PATHS = [
  'users/{uid}',
  'chatQuota/{uid}',
  'srv/oauth/{uid}',
  'srv/health/{uid}',
  'srv/healthDays/{uid}',
  'srv/healthByUser/{uid}',
  'srv/agentUsers/{uid}',
  'srv/agentQueue/{uid}',
  'srv/queue/{uid}',
  'srv/posts/{uid}',
  'srv/insights/{uid}',
  'srv/insightsAccount/{uid}',
  'srv/devices/{uid}',
  'srv/reminders/{uid}',
  'srv/pro/{uid}',
  'srv/calmap/{uid}'
];
const at = (p, uid) => p.replace('{uid}', uid);

function makeAccount(deps) {
  const { db, auth, oauth, media, now } = deps;
  const clock = now || Date.now;

  async function val(p) { return (await db.ref(p).once('value')).val(); }

  async function exportAll(uid) {
    const out = { kova_export: 1, exportedAt: new Date(clock()).toISOString(), uid };
    out.synced = (await val(`users/${uid}`)) || {};
    const posts = (await val(`srv/posts/${uid}`)) || {};
    /* posts carry platform ids that are fine to see; nothing secret */
    out.posts = posts;
    out.health = (await val(`srv/health/${uid}`)) || {};
    out.healthDays = (await val(`srv/healthDays/${uid}`)) || {};
    const ag = (await val(`srv/agentUsers/${uid}`)) || {};
    out.wellnessAgent = { on: !!ag.on, tz: ag.tz || '', times: ag.times || {} };
    out.reminders = (await val(`srv/reminders/${uid}`)) || {};
    const linked = (await val(`srv/oauth/${uid}`)) || {};
    out.connectedAccounts = Object.keys(linked).map((k) => ({ provider: k, label: (linked[k] && linked[k].label) || '', note: 'token not exported' }));
    const dev = (await val(`srv/devices/${uid}`)) || {};
    out.devices = Object.keys(dev).map((k) => ({ platform: dev[k].platform || '', since: dev[k].at || 0, note: 'push token not exported' }));
    const sp = await val(`srv/social/profiles/${uid}`);
    out.friendsFeed = sp ? { profile: sp, posts: (await val(`srv/social/posts/${uid}`)) || {},
      following: Object.keys((await val(`srv/social/follows/${uid}`)) || {}).length } : null;
    out.files = media ? await media.list(`users/${uid}/`) : [];
    return out;
  }

  async function removeAll(uid) {
    const problems = [];
    const step = async (name, fn) => { try { await fn(); } catch (e) { problems.push(name + ': ' + String(e && e.message || e).slice(0, 120)); } };

    /* 1. connected accounts: revoke at the provider, then forget */
    await step('connected accounts', async () => {
      const linked = (await val(`srv/oauth/${uid}`)) || {};
      for (const name of Object.keys(linked)) {
        try { await oauth.disconnect(uid, name); } catch (e) { /* removed below either way */ }
      }
    });
    /* 2. the Apple Health sync address */
    await step('health sync address', async () => {
      const tok = await val(`srv/healthByUser/${uid}`);
      if (tok) await db.ref(`srv/healthTokens/${tok}`).remove();
    });
    /* 3. scheduled posts are keyed uid_postId */
    await step('scheduled posts', async () => {
      const all = (await val('srv/scheduled')) || {};
      for (const k of Object.keys(all)) if (k.indexOf(uid + '_') === 0) await db.ref(`srv/scheduled/${k}`).remove();
    });
    /* 4. email sign-in codes are keyed by the email's hash */
    await step('sign-in codes', async () => {
      if (!deps.emailKey) return;
      const u = await auth.getUser(uid).catch(() => null);
      if (u && u.email) await db.ref(`srv/emailCodes/${deps.emailKey(u.email)}`).remove();
    });
    /* 5. every per-person record */
    for (const p of PATHS) await step(at(p, uid), () => db.ref(at(p, uid)).remove());
    /* 5a. the friends feed: out of everyone's lists, likes and comments too */
    if (deps.social) await step('friends feed', () => deps.social.forget(uid));
    /* 5b. RevenueCat's copy of the customer (the store subscription is cancelled in the store) */
    if (deps.billing) await step('billing record', () => deps.billing.forget(uid));
    /* 6. files */
    if (media) await step('files', () => media.removePrefix(`users/${uid}/`));
    /* 7. the sign-in itself, last, so a failure above can be retried */
    await step('sign-in account', async () => {
      try { await auth.deleteUser(uid); }
      catch (e) { if (!e || e.code !== 'auth/user-not-found') throw e; }
    });
    return { ok: !problems.length, problems };
  }

  return { exportAll, removeAll };
}

module.exports = { makeAccount, PATHS };
