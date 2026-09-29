/* Traction - what happens after a post goes out.

   Every half hour (tractionWatch) and when the person taps Refresh, this
   reads each published post back from its platform:

     YouTube    views, likes, comments, shares, average view duration and
                percentage (YouTube Analytics), the audience-retention curve,
                viewers by age and gender, views per day, the comments
     Instagram  views, reach, likes, comments, shares, saves, Reels average
                watch time, the comments, and the account's engaged audience
                by age and gender (Instagram gives demographics per account,
                not per post, and only past 100 engaged accounts)
     Facebook   reactions, comments, shares; for videos and Reels the views,
                average watch time and the retention graph; the comments
     TikTok     views, likes, comments, shares - TikTok does not give apps the
                comments, watch time or audience, and the page says so

   New comments become notifications (users/{uid}/traction/feed), which the
   app pops up. "What should I fix?" sends the numbers and the comments to
   the model, which answers in plain words: trend, what works, what to fix,
   new angles, what the comments are really saying - business advice for a
   brand or shop, creator advice otherwise.

   Everything is best effort per platform: a metric a platform refuses is
   left out and named, never guessed. */

const DAY = 864e5;
const enc = encodeURIComponent;
const n = (x) => (x == null || x === '' || isNaN(+x) ? null : +x);
const ymd = (t) => new Date(t).toISOString().slice(0, 10);

function makeTraction(deps) {
  const { db, cfg, tokens } = deps;
  const fetch = deps.fetch || ((...a) => global.fetch(...a));
  const now = deps.now || Date.now;

  async function getJ(url, headers) {
    const r = await fetch(url, headers ? { headers } : undefined);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = new Error((j.error && (j.error.message || j.error)) || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return j;
  }
  const soft = async (p) => { try { return await p; } catch (e) { return null; } };

  /* ---------------- YouTube ---------------- */
  async function youtube(id, since) {
    const t = await tokens.get(this.uid, 'google');
    const H = { authorization: `Bearer ${t.access_token}` };
    const out = { metrics: {}, limits: [] };
    const v = await getJ(`https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${enc(id)}`, H);
    const it = (v.items || [])[0];
    if (!it) throw new Error('YouTube no longer has that video.');
    const st = it.statistics || {};
    Object.assign(out.metrics, { views: n(st.viewCount), likes: n(st.likeCount), comments: n(st.commentCount) });
    out.url = `https://youtu.be/${id}`;
    if (/yt-analytics/.test(t.scope || '')) {
      const A = (q) => `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&startDate=${ymd(since - DAY)}&endDate=${ymd(now())}&filters=video==${enc(id)}&${q}`;
      const [sum, ret, demo, daily] = await Promise.all([
        soft(getJ(A('metrics=averageViewDuration,averageViewPercentage,shares,subscribersGained'), H)),
        soft(getJ(A('metrics=audienceWatchRatio&dimensions=elapsedVideoTimeRatio'), H)),
        soft(getJ(A('metrics=viewerPercentage&dimensions=ageGroup,gender'), H)),
        soft(getJ(A('metrics=views&dimensions=day&sort=day'), H))
      ]);
      const s0 = sum && (sum.rows || [])[0];
      if (s0) Object.assign(out.metrics, { watch_avg_s: n(s0[0]), completion_pct: n(s0[1]), shares: n(s0[2]), followers_gained: n(s0[3]) });
      if (ret && (ret.rows || []).length) out.retention = ret.rows.map((r) => [n(r[0]), Math.round(n(r[1]) * 1000) / 1000]);
      if (demo && (demo.rows || []).length) out.audience = audienceOf(demo.rows.map((r) => ({ age: String(r[0]).replace(/^age/, ''), gender: String(r[1]), pct: n(r[2]) })), 'this video');
      if (daily && (daily.rows || []).length) out.daily = daily.rows.map((r) => [r[0], n(r[1])]);
    } else out.limits.push('Reconnect Google to see watch time, drop-off and who is watching.');
    const c = await soft(getJ(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${enc(id)}&maxResults=50&order=time`, H));
    out.comments = ((c && c.items) || []).map((x) => {
      const s = x.snippet.topLevelComment.snippet;
      return { id: x.id, author: s.authorDisplayName || '', text: s.textOriginal || '', at: Date.parse(s.publishedAt) || 0, likes: s.likeCount || 0 };
    });
    return out;
  }

  /* ---------------- Instagram ---------------- */
  async function instagram(id) {
    const t = await tokens.get(this.uid, 'instagram');
    const G = `https://graph.instagram.com/${cfg.igVersion || 'v23.0'}`;
    const tok = `access_token=${enc(t.access_token)}`;
    const out = { metrics: {}, limits: [] };
    const m = await getJ(`${G}/${enc(id)}?fields=media_type,media_product_type,permalink,timestamp,like_count,comments_count&${tok}`);
    out.url = m.permalink || '';
    Object.assign(out.metrics, { likes: n(m.like_count), comments: n(m.comments_count) });
    const reel = m.media_product_type === 'REELS', story = m.media_product_type === 'STORY';
    const sets = story ? [['views', 'reach', 'replies', 'shares', 'navigation']]
      : [reel ? ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time']
              : ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'],
         ['reach', 'likes', 'comments', 'saved']];
    for (const set of sets) {
      const j = await soft(getJ(`${G}/${enc(id)}/insights?metric=${set.join(',')}&${tok}`));
      if (!j) continue;
      (j.data || []).forEach((d) => {
        const val = d.total_value ? d.total_value.value : ((d.values || [])[0] || {}).value;
        const key = { saved: 'saves', ig_reels_avg_watch_time: 'watch_avg_s', ig_reels_video_view_total_time: 'watch_total_s' }[d.name] || d.name;
        let v = n(val);
        if (v != null && /watch_/.test(key)) v = Math.round(v / 100) / 10;      // Instagram counts milliseconds
        if (v != null) out.metrics[key] = v;
      });
      break;
    }
    if (!Object.keys(out.metrics).some((k) => ['views', 'reach'].includes(k))) out.limits.push('Reconnect Instagram and allow insights to see views and reach.');
    const c = await soft(getJ(`${G}/${enc(id)}/comments?fields=id,text,username,timestamp,like_count&limit=50&${tok}`));
    out.comments = ((c && c.data) || []).map((x) => ({ id: x.id, author: x.username ? '@' + x.username : '', text: x.text || '', at: Date.parse(x.timestamp) || 0, likes: x.like_count || 0 }));
    /* the audience is the account's, fetched at most once a day */
    const igId = (t.extra || {}).igId;
    if (igId) {
      const cache = (await db.ref(`srv/insightsAccount/${this.uid}/instagram`).once('value')).val();
      if (cache && cache.at > now() - DAY) out.audience = cache.audience;
      else {
        const rows = [];
        for (const b of ['gender', 'age']) {
          const j = await soft(getJ(`${G}/${igId}/insights?metric=engaged_audience_demographics&period=lifetime&timeframe=this_month&metric_type=total_value&breakdown=${b}&${tok}`));
          const res = j && (((((j.data || [])[0] || {}).total_value || {}).breakdowns || [])[0] || {}).results;
          (res || []).forEach((r) => rows.push({ [b]: String((r.dimension_values || [])[0] || ''), count: n(r.value) || 0 }));
        }
        if (rows.length) {
          out.audience = audienceCounts(rows, 'people who engaged with your account this month');
          await db.ref(`srv/insightsAccount/${this.uid}/instagram`).set({ at: now(), audience: out.audience });
        } else out.limits.push('Instagram shows who is watching once 100+ accounts engage in a month.');
      }
    }
    return out;
  }

  /* ---------------- Facebook Page ---------------- */
  async function facebook(id) {
    const t = await tokens.get(this.uid, 'facebook');
    const x = t.extra || {};
    const page = (x.pages || []).filter((p) => p.id === x.target)[0] || (x.pages || [])[0];
    if (!page) throw new Error('Reconnect Facebook.');
    const G = `https://graph.facebook.com/${cfg.fbVersion || 'v23.0'}`;
    const tok = `access_token=${enc(page.token)}`;
    const out = { metrics: {}, limits: [] };
    const video = !/_/.test(id);                       // Page posts are PAGEID_POSTID; videos and Reels are one number
    const p = await soft(getJ(`${G}/${enc(id)}?fields=${video ? 'permalink_url,likes.summary(true),comments.summary(true)' : 'permalink_url,shares,reactions.summary(total_count),comments.summary(total_count)'}&${tok}`));
    if (p) {
      out.url = p.permalink_url ? (/^https?:/.test(p.permalink_url) ? p.permalink_url : 'https://www.facebook.com' + p.permalink_url) : '';
      out.metrics.likes = n(((p.reactions || p.likes || {}).summary || {}).total_count);
      out.metrics.comments = n(((p.comments || {}).summary || {}).total_count);
      if (p.shares) out.metrics.shares = n(p.shares.count);
    }
    if (video) {
      const j = await soft(getJ(`${G}/${enc(id)}/video_insights?metric=total_video_views,total_video_avg_time_watched,total_video_impressions_unique,total_video_retention_graph&${tok}`));
      ((j && j.data) || []).forEach((d) => {
        const val = ((d.values || [])[0] || {}).value;
        if (d.name === 'total_video_views') out.metrics.views = n(val);
        if (d.name === 'total_video_avg_time_watched') out.metrics.watch_avg_s = n(val) == null ? null : Math.round(n(val) / 100) / 10;
        if (d.name === 'total_video_impressions_unique') out.metrics.reach = n(val);
        if (d.name === 'total_video_retention_graph' && val && typeof val === 'object') {
          const keys = Object.keys(val).map(Number).sort((a, b) => a - b), last = keys[keys.length - 1] || 1;
          out.retention = keys.map((k) => [Math.round(k / last * 100) / 100, n(val[k])]);
        }
      });
    } else {
      const j = await soft(getJ(`${G}/${enc(id)}/insights?metric=post_impressions_unique,post_clicks&${tok}`));
      ((j && j.data) || []).forEach((d) => {
        const val = ((d.values || [])[0] || {}).value;
        if (d.name === 'post_impressions_unique') out.metrics.reach = n(val);
        if (d.name === 'post_clicks') out.metrics.clicks = n(val);
      });
    }
    const c = await soft(getJ(`${G}/${enc(id)}/comments?fields=id,message,from{name},created_time,like_count&order=reverse_chronological&limit=50&${tok}`));
    out.comments = ((c && c.data) || []).map((k) => ({ id: k.id, author: (k.from && k.from.name) || 'Someone', text: k.message || '', at: Date.parse(k.created_time) || 0, likes: k.like_count || 0 }));
    out.limits.push('Facebook no longer shares who is watching (age and gender) with apps.');
    return out;
  }

  /* ---------------- TikTok ---------------- */
  async function tiktok(id) {
    const t = await tokens.get(this.uid, 'tiktok');
    const out = { metrics: {}, limits: ['TikTok gives apps the counts only - not the comments, watch time or who is watching. Those are in TikTok Studio.'] };
    if (!/video\.list/.test(t.scope || '')) { out.limits.unshift('Reconnect TikTok to let Kova read your video counts.'); return out; }
    const r = await fetch('https://open.tiktokapis.com/v2/video/query/?fields=id,title,view_count,like_count,comment_count,share_count,share_url', {
      method: 'POST', headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ filters: { video_ids: [String(id)] } })
    });
    const j = await r.json().catch(() => ({}));
    const v = ((j.data || {}).videos || [])[0];
    if (!v) throw new Error('TikTok did not return the video yet.');
    Object.assign(out.metrics, { views: n(v.view_count), likes: n(v.like_count), comments: n(v.comment_count), shares: n(v.share_count) });
    out.url = v.share_url || '';
    return out;
  }

  const READ = { youtube, instagram, facebook, tiktok };
  /* the id each platform knows the post by */
  const idOf = (k, r) => (k === 'tiktok' ? r.post || '' : r.id || '');

  /* ---------------- one person: every recent post ---------------- */
  async function collect(uid, only) {
    const posts = (await db.ref(`srv/posts/${uid}`).once('value')).val() || {};
    const t = now();
    const feed = [];
    let read = 0;
    for (const pid of Object.keys(posts)) {
      if (only && pid !== only) continue;
      const rec = posts[pid] || {};
      if ((rec.finishedAt || rec.updatedAt || 0) < t - 30 * DAY) continue;
      const res = rec.results || {};
      const title = (rec.payload && rec.payload.title) || 'Your post';
      const since = rec.finishedAt || rec.createdAt || t - 7 * DAY;
      const plat = {};
      for (const k of Object.keys(READ)) {
        const r = res[k];
        if (!r || r.state !== 'ok' || !idOf(k, r)) continue;
        let got;
        try { got = await READ[k].call({ uid }, idOf(k, r), since); read++; }
        catch (e) { got = { error: String(e.message || e).slice(0, 160), metrics: {}, limits: [] }; }
        /* comments not seen before become notifications */
        const seenRef = db.ref(`srv/insights/${uid}/${pid}/${k}/seen`);
        const seen = (await seenRef.once('value')).val() || {};
        const first = !Object.keys(seen).length && !(await db.ref(`srv/insights/${uid}/${pid}/${k}/at`).once('value')).val();
        const fresh = (got.comments || []).filter((c) => c.id && !seen[key(c.id)]);
        if (fresh.length) {
          const upd = {}; fresh.forEach((c) => { upd[key(c.id)] = true; }); await seenRef.update(upd);
          if (!first) fresh.slice(0, 10).forEach((c) => feed.push({ at: c.at || t, postId: pid, title, platform: k, author: c.author, text: String(c.text).slice(0, 300), kind: 'comment' }));
        }
        await db.ref(`srv/insights/${uid}/${pid}/${k}/at`).set(t);
        got.comments = (got.comments || []).slice(0, 40);
        got.at = t;
        plat[k] = got;
      }
      if (!Object.keys(plat).length) continue;
      /* one total per platform per day, so the chart has a line to draw */
      const ref = db.ref(`users/${uid}/traction/posts/${pid}`);
      const prev = (await ref.child('days').once('value')).val() || {};
      const today = ymd(t);
      const day = {};
      Object.keys(plat).forEach((k) => { const v = plat[k].metrics.views != null ? plat[k].metrics.views : plat[k].metrics.likes; if (v != null) day[k] = v; });
      prev[today] = day;
      const keep = Object.keys(prev).sort().slice(-30);
      const days = {}; keep.forEach((d) => { days[d] = prev[d]; });
      await ref.set({ title, at: t, publishedAt: since, platforms: plat, days, trend: trendOf(days, plat) });
    }
    if (feed.length) {
      const f = db.ref(`users/${uid}/traction/feed`);
      const upd = {};
      feed.forEach((x, i) => { upd[`${x.at}_${i}_${x.platform}`] = x; });
      await f.update(upd);
      const all = (await f.once('value')).val() || {};
      const old = Object.keys(all).sort().slice(0, -60);
      if (old.length) { const rm = {}; old.forEach((k) => { rm[k] = null; }); await f.update(rm); }
    }
    return { read, notified: feed.length };
  }
  const key = (id) => String(id).replace(/[.#$/[\]]/g, '_');

  /* ---------------- "What should I fix?" ---------------- */
  async function advice(uid, pid, mode) {
    if (!cfg.anthropicKey) throw Object.assign(new Error('The advice engine is not configured on the server yet.'), { status: 503 });
    const rec = (await db.ref(`users/${uid}/traction/posts/${pid}`).once('value')).val();
    if (!rec) throw Object.assign(new Error('No numbers for that post yet - refresh first.'), { status: 404 });
    const post = (await db.ref(`srv/posts/${uid}/${pid}/payload`).once('value')).val() || {};
    const words = post.text || {};
    const brief = {
      mode: mode === 'business' ? 'business' : 'creator',
      title: rec.title, published: ymd(rec.publishedAt || now()), trend: rec.trend,
      words: { heading: (words.youtube || {}).title || '', caption: (words.instagram || {}).caption || (words.tiktok || {}).caption || '',
               primary: (words.facebook || {}).text || (words.linkedin || {}).text || '' },
      media: (post.media || []).map((m) => ({ type: m.type, seconds: m.dur || null, shape: m.w && m.h ? `${m.w}x${m.h}` : null })),
      platforms: Object.keys(rec.platforms || {}).map((k) => {
        const p = rec.platforms[k];
        return { platform: k, metrics: p.metrics, retention: p.retention ? dropOff(p.retention, (post.media || [])[0]) : null,
                 audience: p.audience || null, comments: (p.comments || []).slice(0, 40).map((c) => ({ text: String(c.text).slice(0, 220), likes: c.likes || 0 })),
                 not_available: p.limits || [] };
      }),
      days: rec.days
    };
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 1400, system: ADVICE_SYSTEM, messages: [{ role: 'user', content: JSON.stringify(brief) }] })
    });
    if (!r.ok) throw Object.assign(new Error('The advice engine is unavailable right now.'), { status: 502 });
    const j = await r.json();
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    let out = null;
    try { out = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); }
    catch (e) { const a = text.indexOf('{'), b = text.lastIndexOf('}'); if (a >= 0 && b > a) { try { out = JSON.parse(text.slice(a, b + 1)); } catch (e2) { out = null; } } }
    if (!out || typeof out !== 'object') throw Object.assign(new Error('The advice came back unreadable. Try again.'), { status: 502 });
    const clean = sanitizeAdvice(out);
    clean.at = now(); clean.mode = brief.mode;
    await db.ref(`users/${uid}/traction/advice/${pid}`).set(clean);
    return clean;
  }

  return { collect, advice, READ };
}

/* ---------------- shared helpers ---------------- */
/* views per day from the daily totals; rising / steady / falling */
function trendOf(days, plat) {
  const ks = Object.keys(days || {}).sort();
  const tot = ks.map((d) => Object.values(days[d] || {}).reduce((s, v) => s + (+v || 0), 0));
  const per = tot.slice(1).map((v, i) => Math.max(0, v - tot[i]));
  const yt = plat && plat.youtube && plat.youtube.daily;
  const series = yt && yt.length >= 4 ? yt.map((r) => r[1] || 0) : per;
  if (series.length < 4) return { dir: 'too-early', perDay: series };
  const last = series.slice(-3).reduce((s, v) => s + v, 0), before = series.slice(-6, -3).reduce((s, v) => s + v, 0);
  const change = before ? Math.round((last / before - 1) * 100) : null;
  const dir = change == null ? 'too-early' : (change >= 15 ? 'rising' : (change <= -15 ? 'falling' : 'steady'));
  return { dir, change, perDay: series.slice(-14) };
}
/* where the biggest drop happens, in seconds when the length is known */
function dropOff(ret, media) {
  const pts = (ret || []).filter((p) => p[0] != null && p[1] != null);
  if (pts.length < 3) return null;
  let worst = null;
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i - 1][1] - pts[i][1];
    if (!worst || d > worst.d) worst = { d, at: pts[i][0] };
  }
  const secs = media && media.dur ? Math.round(worst.at * media.dur) : null;
  const at = (f) => { const p = pts.reduce((b, x) => (Math.abs(x[0] - f) < Math.abs(b[0] - f) ? x : b), pts[0]); return Math.round(p[1] * 100); };
  return { biggest_drop_at: secs != null ? `${secs}s` : `${Math.round(worst.at * 100)}% in`, kept_at_25pct: at(0.25), kept_at_50pct: at(0.5), kept_at_end: at(1) };
}
function audienceOf(rows, scope) {
  const g = {}, a = {};
  rows.forEach((r) => {
    const gender = /female/i.test(r.gender) ? 'Women' : (/male/i.test(r.gender) ? 'Men' : 'Other');
    g[gender] = (g[gender] || 0) + (r.pct || 0);
    a[r.age] = (a[r.age] || 0) + (r.pct || 0);
  });
  const round = (o) => { const x = {}; Object.keys(o).forEach((k) => { x[k] = Math.round(o[k] * 10) / 10; }); return x; };
  return { gender: round(g), age: round(a), scope };
}
function audienceCounts(rows, scope) {
  const g = {}, a = {};
  let gt = 0, at = 0;
  rows.forEach((r) => {
    if (r.gender != null) { const k = r.gender === 'F' ? 'Women' : (r.gender === 'M' ? 'Men' : 'Other'); g[k] = (g[k] || 0) + r.count; gt += r.count; }
    if (r.age != null) { a[r.age] = (a[r.age] || 0) + r.count; at += r.count; }
  });
  const pct = (o, t) => { const x = {}; Object.keys(o).forEach((k) => { x[k] = t ? Math.round(o[k] / t * 1000) / 10 : 0; }); return x; };
  return { gender: pct(g, gt), age: pct(a, at), scope };
}
const ADVICE_SYSTEM = `You are Kova's content coach. You get one published post: its words, its media, and what each platform reported - views, watch time, where people stopped watching, who watched (age and gender), and the comments.

Return ONE JSON object, nothing else:
{
  "trend": "rising" | "steady" | "falling" | "too-early",
  "headline": string,                       // one sentence: how it is doing and the single biggest lever
  "working": [string],                      // 1-3 things to keep, each tied to a number or a comment
  "fix": [string],                          // 1-4 specific fixes (the hook, the first 3 seconds, length, caption, thumbnail, call to action, posting time)
  "angles": [string],                       // 2-3 new angles to test next, concrete enough to film tomorrow
  "themes": [{"theme": string, "share": number, "sentiment": "positive" | "neutral" | "negative", "quote": string}],  // what the comments are really about; share = % of comments; quote copied from a comment
  "audience": string,                       // who is actually watching and what that means for the next post; "" if unknown
  "decision": "keep" | "tweak" | "new angle",   // keep running it, tweak it, or change the angle
  "next": {"hook": string, "length": string, "when": string}
}

Mode "business": the post is selling something. Judge it on buying intent - questions about price, sizing, shipping, where to buy, objections and doubts in the comments - and say what the ad or post needs to answer so viewers convert. If views are falling for 3+ days or most viewers leave before the offer, say to change the angle.
Mode "creator": judge it on watch time, shares, saves and follow-worthy moments; no sales talk.

Rules: use only the numbers and comments given - never invent a statistic, a percentage or a quote. Name the platform when a number comes from one. If there is too little data (under ~200 views or under 3 days), say "too-early" and give only the fixes that do not depend on data (hook, first frame, caption). Short, plain sentences. No emojis, no hashtags walls.`;

function sanitizeAdvice(o) {
  const s = (x, n2) => String(x == null ? '' : x).slice(0, n2);
  const list = (x, k, n2) => (Array.isArray(x) ? x : []).slice(0, k).map((y) => s(y, n2)).filter(Boolean);
  return {
    trend: ['rising', 'steady', 'falling', 'too-early'].includes(o.trend) ? o.trend : 'too-early',
    headline: s(o.headline, 300), working: list(o.working, 3, 260), fix: list(o.fix, 4, 260), angles: list(o.angles, 3, 260),
    themes: (Array.isArray(o.themes) ? o.themes : []).slice(0, 6).map((t) => ({ theme: s(t.theme, 80), share: Math.max(0, Math.min(100, Math.round(+t.share || 0))),
      sentiment: ['positive', 'neutral', 'negative'].includes(t.sentiment) ? t.sentiment : 'neutral', quote: s(t.quote, 200) })),
    audience: s(o.audience, 300), decision: ['keep', 'tweak', 'new angle'].includes(o.decision) ? o.decision : 'tweak',
    next: { hook: s((o.next || {}).hook, 200), length: s((o.next || {}).length, 60), when: s((o.next || {}).when, 80) }
  };
}

module.exports = { makeTraction, trendOf, dropOff, audienceOf, audienceCounts, sanitizeAdvice, ADVICE_SYSTEM };
