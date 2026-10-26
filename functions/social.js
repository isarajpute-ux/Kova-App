/* social - the opt-in follow feed (friends see finished workouts and PRs).

   Off until someone picks a handle and switches it on. Then:
     - they can follow people by handle, and be followed;
     - finished workouts and personal records post to their followers
       (the app asks before the first one, and each can be taken back);
     - followers can like and comment.
   A post carries only what a lifter shares anyway - the session name,
   minutes, sets, and which lifts hit a record and by how much. Never
   heart rate, sleep, food, body data or anything from Health.

     srv/social/profiles/{uid}   {handle, name, on, at}
     srv/social/handles/{handle} uid
     srv/social/follows/{uid}/{target}    at
     srv/social/followers/{target}/{uid}  at
     srv/social/posts/{uid}/{pid}  {kind, title, stats, at, likes:{uid:1}, comments:{cid:{uid,handle,text,at}}}
     srv/social/profiles/{uid}/favs {sound:{n,ids}, meals[], workout, lift, nap}  only what you switched on

   srv/ is closed to clients by the rules; everything goes through here. */

const crypto = require('crypto');

class SocialError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const HANDLE = /^[a-z0-9_]{3,20}$/;
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

function makeSocial(deps) {
  const { db } = deps;
  const now = deps.now || Date.now;
  const val = async (p) => (await db.ref(p).once('value')).val();

  async function me(uid) {
    const p = (await val(`srv/social/profiles/${uid}`)) || null;
    const following = Object.keys((await val(`srv/social/follows/${uid}`)) || {});
    const followers = Object.keys((await val(`srv/social/followers/${uid}`)) || {});
    const handles = async (ids) => (await Promise.all(ids.map((id) => val(`srv/social/profiles/${id}/handle`)))).filter(Boolean);
    return { profile: p, following: await handles(following), followers: await handles(followers) };
  }

  async function setProfile(uid, b) {
    b = b || {};
    const handle = String(b.handle || '').toLowerCase().trim();
    if (!HANDLE.test(handle)) throw new SocialError(400, 'A handle is 3-20 letters, numbers or _.');
    const owner = await val(`srv/social/handles/${handle}`);
    if (owner && owner !== uid) throw new SocialError(409, 'That handle is taken.');
    const prev = (await val(`srv/social/profiles/${uid}`)) || {};
    if (prev.handle && prev.handle !== handle) await db.ref(`srv/social/handles/${prev.handle}`).remove();
    await db.ref(`srv/social/handles/${handle}`).set(uid);
    const rec = { handle, name: clean(b.name, 40), on: b.on !== false, at: prev.at || now() };
    await db.ref(`srv/social/profiles/${uid}`).set(rec);
    return rec;
  }

  async function uidOf(handle) {
    const h = String(handle || '').toLowerCase().replace(/^@/, '').trim();
    if (!HANDLE.test(h)) throw new SocialError(400, 'That handle does not look right.');
    const id = await val(`srv/social/handles/${h}`);
    if (!id) throw new SocialError(404, `No one is @${h} on Kova.`);
    const p = await val(`srv/social/profiles/${id}`);
    if (!p || !p.on) throw new SocialError(404, `No one is @${h} on Kova.`);
    return id;
  }
  async function mustBeOn(uid) {
    const p = await val(`srv/social/profiles/${uid}`);
    if (!p || !p.on) throw new SocialError(403, 'Turn on the friends feed first.');
    return p;
  }

  async function follow(uid, handle, on) {
    await mustBeOn(uid);
    const t = await uidOf(handle);
    if (t === uid) throw new SocialError(400, 'That is you.');
    if (on === false) {
      await db.ref(`srv/social/follows/${uid}/${t}`).remove();
      await db.ref(`srv/social/followers/${t}/${uid}`).remove();
      return { ok: true, following: false };
    }
    const n = Object.keys((await val(`srv/social/follows/${uid}`)) || {}).length;
    if (n >= 500) throw new SocialError(429, 'You follow 500 people already.');
    await db.ref(`srv/social/follows/${uid}/${t}`).set(now());
    await db.ref(`srv/social/followers/${t}/${uid}`).set(now());
    return { ok: true, following: true };
  }
  async function removeFollower(uid, handle) {
    const t = await uidOf(handle).catch(() => null);
    if (!t) return { ok: true };
    await db.ref(`srv/social/followers/${uid}/${t}`).remove();
    await db.ref(`srv/social/follows/${t}/${uid}`).remove();
    return { ok: true };
  }

  function cleanStats(s) {
    s = s || {};
    const n = (v, max) => { const x = Math.round(+v || 0); return x > 0 && x <= max ? x : 0; };
    const prs = (Array.isArray(s.prs) ? s.prs : []).slice(0, 5).map((p) => ({ n: clean(p && p.n, 48), up: n(p && p.up, 500) })).filter((p) => p.n);
    return { mins: n(s.mins, 600), sets: n(s.sets, 200), lifts: n(s.lifts, 40), prs };
  }
  async function post(uid, b) {
    const p = await mustBeOn(uid);
    b = b || {};
    const kind = b.kind === 'pr' ? 'pr' : 'workout';
    const pid = crypto.randomBytes(8).toString('hex');
    const rec = { kind, title: clean(b.title, 60) || (kind === 'pr' ? 'New personal record' : 'Workout'), stats: cleanStats(b.stats), at: now(), handle: p.handle };
    await db.ref(`srv/social/posts/${uid}/${pid}`).set(rec);
    /* keep the last 60 */
    const all = (await val(`srv/social/posts/${uid}`)) || {};
    const ids = Object.keys(all).sort((a, c) => (all[a].at || 0) - (all[c].at || 0));
    for (const id of ids.slice(0, Math.max(0, ids.length - 60))) await db.ref(`srv/social/posts/${uid}/${id}`).remove();
    return { ok: true, id: pid };
  }
  async function unpost(uid, pid) {
    if (!/^[0-9a-f]{16}$/.test(String(pid))) throw new SocialError(400, 'Bad post.');
    await db.ref(`srv/social/posts/${uid}/${pid}`).remove();
    return { ok: true };
  }

  /* only your posts and the people you follow; a post you can see is one you can like */
  async function canSee(uid, owner) {
    if (owner === uid) return true;
    return !!(await val(`srv/social/follows/${uid}/${owner}`));
  }
  async function feed(uid) {
    await mustBeOn(uid);
    const who = [uid].concat(Object.keys((await val(`srv/social/follows/${uid}`)) || {}));
    const out = [];
    for (const id of who) {
      const prof = await val(`srv/social/profiles/${id}`);
      if (!prof || !prof.on) continue;
      const ps = (await val(`srv/social/posts/${id}`)) || {};
      Object.keys(ps).forEach((pid) => {
        const x = ps[pid];
        const comments = Object.keys(x.comments || {}).map((c) => x.comments[c]).sort((a, b) => a.at - b.at).slice(-20)
          .map((c) => ({ handle: c.handle, text: c.text, at: c.at, mine: c.uid === uid }));
        out.push({ owner: prof.handle, mine: id === uid, id: pid, kind: x.kind, title: x.title, stats: x.stats || {}, at: x.at,
          likes: Object.keys(x.likes || {}).length, liked: !!(x.likes || {})[uid], comments });
      });
    }
    const favs = [];
    for (const id of who) { if (id === uid) continue; const f = await val(`srv/social/profiles/${id}/favs`); const h = await val(`srv/social/profiles/${id}/handle`); if (f && h) favs.push({ handle: h, favs: f }); }
    return { posts: out.sort((a, b) => b.at - a.at).slice(0, 50), favs };
  }
  async function like(uid, handle, pid, on) {
    await mustBeOn(uid);
    const owner = await uidOf(handle);
    if (!(await canSee(uid, owner))) throw new SocialError(403, 'Follow them to react.');
    if (!(await val(`srv/social/posts/${owner}/${pid}`))) throw new SocialError(404, 'That post is gone.');
    const r = db.ref(`srv/social/posts/${owner}/${pid}/likes/${uid}`);
    if (on === false) await r.remove(); else await r.set(1);
    return { ok: true };
  }
  async function comment(uid, handle, pid, text) {
    const me2 = await mustBeOn(uid);
    const owner = await uidOf(handle);
    if (!(await canSee(uid, owner))) throw new SocialError(403, 'Follow them to comment.');
    if (!(await val(`srv/social/posts/${owner}/${pid}`))) throw new SocialError(404, 'That post is gone.');
    const t = clean(text, 280);
    if (!t) throw new SocialError(400, 'Write something first.');
    const cid = crypto.randomBytes(6).toString('hex');
    await db.ref(`srv/social/posts/${owner}/${pid}/comments/${cid}`).set({ uid, handle: me2.handle, text: t, at: now() });
    return { ok: true, id: cid };
  }

  /* favourites (p14): the small things friends like to swap - a sleep
     mix, the meals you eat most, your usual workout, a favourite lift, how
     long you nap. Each one is shared only if you switch it on; never an
     amount of food, a calorie, a weight, a heart rate or a sleep score. */
  const ID = /^[a-z0-9_-]{1,32}$/;
  function cleanFavs(f) {
    f = f || {};
    const out = {};
    if (f.sound && typeof f.sound === 'object') {
      const n = clean(f.sound.n, 48), ids = (Array.isArray(f.sound.ids) ? f.sound.ids : []).filter((x) => ID.test(String(x))).slice(0, 6);
      if (n && ids.length) out.sound = { n, ids };
    }
    const meals = (Array.isArray(f.meals) ? f.meals : []).map((x) => clean(x, 48)).filter(Boolean).slice(0, 3);
    if (meals.length) out.meals = meals;
    ['workout', 'lift'].forEach((k) => { const v = clean(f[k], 40); if (v) out[k] = v; });
    const nap = Math.round(+f.nap || 0); if (nap >= 5 && nap <= 120) out.nap = nap;
    return out;
  }
  async function setFavs(uid, b) {
    await mustBeOn(uid);
    const favs = cleanFavs(b && b.favs);
    await db.ref(`srv/social/profiles/${uid}/favs`).set(Object.keys(favs).length ? favs : null);
    return { ok: true, favs };
  }
  /* someone's profile: only for yourself or the people you follow */
  async function profileOf(uid, handle) {
    await mustBeOn(uid);
    const owner = await uidOf(handle);
    if (!(await canSee(uid, owner))) throw new SocialError(403, 'Follow them to see their favourites.');
    const p = (await val(`srv/social/profiles/${owner}`)) || {};
    const followers = Object.keys((await val(`srv/social/followers/${owner}`)) || {}).length;
    const ps = (await val(`srv/social/posts/${owner}`)) || {};
    const prs = Object.keys(ps).filter((k) => ps[k].kind === 'pr').length;
    return { handle: p.handle, favs: p.favs || {}, since: p.at || null, followers, workouts: Object.keys(ps).length, prs, mine: owner === uid };
  }

  /* account deletion: out of everyone's lists too */
  async function forget(uid) {
    const p = await val(`srv/social/profiles/${uid}`);
    if (p && p.handle) await db.ref(`srv/social/handles/${p.handle}`).remove();
    for (const t of Object.keys((await val(`srv/social/follows/${uid}`)) || {})) await db.ref(`srv/social/followers/${t}/${uid}`).remove();
    for (const f of Object.keys((await val(`srv/social/followers/${uid}`)) || {})) await db.ref(`srv/social/follows/${f}/${uid}`).remove();
    for (const q of ['profiles', 'follows', 'followers', 'posts']) await db.ref(`srv/social/${q}/${uid}`).remove();
    /* their likes and comments on other people's posts */
    const all = (await val('srv/social/posts')) || {};
    for (const owner of Object.keys(all)) {
      for (const pid of Object.keys(all[owner] || {})) {
        const x = all[owner][pid] || {};
        if ((x.likes || {})[uid]) await db.ref(`srv/social/posts/${owner}/${pid}/likes/${uid}`).remove();
        for (const cid of Object.keys(x.comments || {})) if (x.comments[cid].uid === uid) await db.ref(`srv/social/posts/${owner}/${pid}/comments/${cid}`).remove();
      }
    }
  }

  return { me, setProfile, follow, removeFollower, post, unpost, feed, like, comment, forget, cleanStats, cleanFavs, setFavs, profileOf };
}

module.exports = { makeSocial, SocialError, HANDLE };
