/* Meta Ads - from the Studio straight into Ads Manager.

   Two ways, picked per post in the Studio's Ad setup sheet:

     library  the photos and videos go into the ad account's media library
              (adimages / advideos), ready to pick when you build the ad.
     ads      Kova builds the whole thing, switched OFF:
                campaign   objective, PAUSED
                  ad set   daily budget, countries, pixel + event, PAUSED
                    ad     one per photo or video - primary text, headline,
                           description, button and shop link, PAUSED
              Open Ads Manager and every ad is already filled in. Nothing
              spends until you switch the campaign on there yourself.

   Every id Meta hands back is written down as it arrives (ctx.memo), so a
   retry - or the second pass after Meta finishes processing a video -
   carries on where it stopped instead of building a second campaign.

   Budgets are in the ad account's own currency; Meta counts them in the
   currency's smallest unit (cents), except for the handful of currencies
   that have none. */

const OFFSET1 = ['CLP', 'COP', 'CRC', 'HUF', 'ISK', 'IDR', 'JPY', 'KRW', 'PYG', 'TWD', 'VND'];
const GOALS = {
  sales:     { objective: 'OUTCOME_SALES',     opt: 'OFFSITE_CONVERSIONS', dest: 'WEBSITE', pixel: true, n: 'Sales' },
  traffic:   { objective: 'OUTCOME_TRAFFIC',   opt: 'LINK_CLICKS',         dest: 'WEBSITE', n: 'Traffic' },
  awareness: { objective: 'OUTCOME_AWARENESS', opt: 'REACH',               n: 'Awareness' }
};
const CTAS = ['SHOP_NOW', 'LEARN_MORE', 'ORDER_NOW', 'BUY_NOW', 'GET_OFFER', 'SIGN_UP', 'SUBSCRIBE', 'CONTACT_US'];
const EVENTS = ['PURCHASE', 'ADD_TO_CART', 'INITIATED_CHECKOUT', 'ADD_PAYMENT_INFO', 'LEAD', 'COMPLETE_REGISTRATION', 'VIEW_CONTENT'];
/* Meta's automatic "enhancements" re-crop media and rewrite text. The
   person set the shape and the words on purpose, so they are asked off. */
const KEEP_AS_MADE = { creative_features_spec: {
  text_optimizations: { enroll_status: 'OPT_OUT' },
  image_touchups: { enroll_status: 'OPT_OUT' },
  image_uncrop: { enroll_status: 'OPT_OUT' },
  video_auto_crop: { enroll_status: 'OPT_OUT' }
} };

const enc = encodeURIComponent;
const minor = (amount, cur) => Math.round((+amount || 0) * (OFFSET1.includes(cur) ? 1 : 100));
const major = (units, cur) => (+units || 0) / (OFFSET1.includes(cur) ? 1 : 100);
function money(units, cur) {
  const v = major(units, cur);
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: v % 1 ? 2 : 0 }).format(v); }
  catch (e) { return `${v} ${cur || ''}`.trim(); }
}
/* the shape an ad will show in, from the file's own pixels */
function ratioOf(m) {
  if (!m || !m.w || !m.h) return '';
  const r = m.w / m.h;
  const known = [['9:16', 9 / 16], ['4:5', 4 / 5], ['1:1', 1], ['1.91:1', 1.91], ['16:9', 16 / 9]];
  let best = known[0];
  known.forEach((k) => { if (Math.abs(k[1] - r) < Math.abs(best[1] - r)) best = k; });
  return best[0];
}
function compact(o) {
  const out = {};
  Object.keys(o).forEach((k) => { if (o[k] !== '' && o[k] != null) out[k] = o[k]; });
  return out;
}

function makeAds(h) {
  const { fetch, formPost, msgOf, signed, whole, sleep, now, PubError } = h;
  const G = () => `https://graph.facebook.com/${h.version()}`;

  async function read(path, tok) {
    const r = await fetch(`${G()}/${path}${path.includes('?') ? '&' : '?'}access_token=${enc(tok)}`);
    const j = await r.json().catch(() => ({}));
    return { r, j };
  }
  async function send(path, params, tok, what) {
    const r = await formPost(`${G()}/${path}`, Object.assign({}, params, { access_token: tok }));
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error || (!j.id && !j.images)) {
      throw new PubError(`Meta refused the ${what}: ${msgOf(j, `HTTP ${r.status}`)}`);
    }
    return j;
  }

  /* ---- 1. files into the ad account's media library ---- */
  async function upload(post, tok, act, memo, save) {
    memo.files = memo.files || {};
    for (let i = 0; i < post.media.length; i++) {
      const m = post.media[i], key = 'f' + i;
      if (memo.files[key] && memo.files[key].path === m.path) continue;
      let rec;
      if (m.type === 'image') {
        const buf = await whole(m);
        const j = await send(`${act}/adimages`, { bytes: buf.toString('base64'), name: m.name || `kova-${i + 1}.jpg` }, tok, 'image');
        const img = j.images && Object.values(j.images)[0];
        if (!img || !img.hash) throw new PubError('Meta refused the image: no image came back.');
        rec = { path: m.path, type: 'image', hash: img.hash };
      } else {
        const j = await send(`${act}/advideos`, { file_url: await signed(m), name: m.name || `Kova video ${i + 1}` }, tok, 'video');
        rec = { path: m.path, type: 'video', video: j.id };
      }
      memo.files[key] = rec;
      await save();
    }
  }

  /* ---- 2. an ad can only use a video Meta has finished processing ---- */
  async function thumbOf(vid, tok) {
    const { j } = await read(`${vid}/thumbnails`, tok);
    const list = j.data || [];
    const pick = list.filter((t) => t.is_preferred)[0] || list[0];
    return pick ? pick.uri : '';
  }
  async function videosReady(post, memo, tok, deadline, save) {
    for (;;) {
      let waiting = 0;
      for (let i = 0; i < post.media.length; i++) {
        const f = memo.files['f' + i];
        if (!f || f.type !== 'video' || f.thumb) continue;
        const { j } = await read(`${f.video}?fields=status,picture`, tok);
        const st = (j.status && j.status.video_status) || '';
        if (st === 'error') throw new PubError(`Meta could not process ${post.media[i].name || 'a video'}. Export it as MP4 (H.264) and try again.`);
        if (st === 'ready') {
          f.thumb = (await thumbOf(f.video, tok)) || j.picture || '';
          if (f.thumb) { await save(); continue; }
        }
        waiting++;
      }
      if (!waiting) return true;
      if (now() + 15e3 > deadline) return false;
      await sleep(8000);
    }
  }

  /* ---- what the ad says and where it sends people ---- */
  function story(f, t, spec, withIg) {
    const button = spec.link ? { type: spec.cta, value: { link: spec.link } } : null;
    const who = compact({ page_id: spec.page, instagram_user_id: withIg ? spec.ig : '' });
    if (f.type === 'image') {
      if (!spec.link) return Object.assign(who, { photo_data: compact({ image_hash: f.hash, caption: t.primary }) });
      return Object.assign(who, { link_data: compact({ image_hash: f.hash, link: spec.link, message: t.primary,
        name: t.headline, description: t.description, call_to_action: button }) });
    }
    return Object.assign(who, { video_data: compact({ video_id: f.video, image_url: f.thumb, message: t.primary,
      title: t.headline, link_description: t.description, call_to_action: button }) });
  }
  /* newest API shape first, then without the extras an older setup refuses */
  async function creative(act, tok, name, f, t, spec) {
    const tries = [[true, true], [false, true], [false, false]].filter(([, ig]) => ig || spec.ig);
    let last = null;
    for (const [keep, ig] of tries) {
      const params = { name, object_story_spec: JSON.stringify(story(f, t, spec, ig)) };
      if (keep) params.degrees_of_freedom_spec = JSON.stringify(KEEP_AS_MADE);
      try {
        const j = await send(`${act}/adcreatives`, params, tok, 'ad');
        return { id: j.id, kept: keep };
      } catch (e) { last = e; }
    }
    throw last;
  }

  async function account(act, tok) {
    const { r, j } = await read(`${act}?fields=name,currency,min_daily_budget`, tok);
    if (!r.ok || j.error) throw new PubError('Meta did not open the ad account: ' + msgOf(j, `HTTP ${r.status}`));
    return { name: j.name || '', currency: j.currency || 'USD', min: +j.min_daily_budget || 0 };
  }

  /* ---- the whole job ---- */
  async function run(post, t, ctx) {
    const o = (post.options && post.options.metaads) || {};
    const x = t.extra || {};
    const act = x.target, tok = t.access_token;
    if (!act) throw new PubError('Reconnect Meta Ads - Kova has no ad account to upload to.');
    if (!post.media.length) throw new PubError('Add the photos or videos to send to your ad account.');
    const memo = (ctx.memo && (await ctx.memo.get())) || {};
    const save = async () => { if (ctx.memo) await ctx.memo.set(memo); };
    const num = String(act).replace(/^act_/, '');

    await upload(post, tok, act, memo, save);
    if (o.build !== 'ads') {
      const n = post.media.length;
      return { state: 'ok', url: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${num}`,
               msg: `${n} file${n === 1 ? '' : 's'} added to your ad account's media library. Pick them when you build the ad.` };
    }

    const goal = GOALS[o.goal] || GOALS.sales;
    const page = x.page || ((x.pages || [])[0] || {}).id || '';
    if (!page) throw new PubError('Meta ads run as a Facebook Page. Create a Page (or get added to one), then reconnect Meta Ads.');
    const link = /^https:\/\//.test(o.link || '') ? o.link : '';
    if (goal.dest && !link) throw new PubError('Add your shop link (https://...) in Ad setup - the button sends people there.');
    /* one pixel, or the Instagram account linked to the ad account, needs no picking */
    if (memo.pixel == null) {
      let px = x.pixel || '';
      if (!px && goal.pixel) { const l = (await read(`${act}/adspixels?fields=id&limit=5`, tok)).j.data || []; if (l.length === 1) px = l[0].id; }
      memo.pixel = px;
    }
    if (memo.ig == null) {
      memo.ig = x.ig != null && x.ig !== '' ? x.ig : ((((await read(`${act}/instagram_accounts?fields=id`, tok)).j.data || [])[0] || {}).id || '');
    }
    if (goal.pixel && !memo.pixel) { memo.pixel = null; throw new PubError('Sales campaigns need your Meta pixel. Pick it in Ad setup, or switch the goal to Traffic.'); }
    const acct = memo.acct || (memo.acct = await account(act, tok));
    const cur = acct.currency;
    const budget = minor(o.budget, cur);
    if (!(budget > 0)) throw new PubError('Set a daily budget in Ad setup.');
    if (acct.min && budget < acct.min) throw new PubError(`Meta's lowest daily budget for this ad account is ${money(acct.min, cur)}.`);

    const deadline = ctx.deadline || now() + 6 * 60e3;
    if (!(await videosReady(post, memo, tok, deadline, save))) {
      return { state: 'later', msg: 'Meta is still processing your videos. Kova carries on by itself in a few minutes - nothing is built twice.' };
    }

    const title = String(post.title || 'Kova ad').slice(0, 80);
    const day = new Date(now()).toISOString().slice(0, 10);
    const countries = (o.countries && o.countries.length ? o.countries : ['US']);
    if (!memo.campaign) {
      const j = await send(`${act}/campaigns`, { name: `${title} - Kova ${day}`, objective: goal.objective, status: 'PAUSED',
        special_ad_categories: '[]', is_adset_budget_sharing_enabled: 'false' }, tok, 'campaign');
      memo.campaign = j.id; await save();
    }

    const each = o.split === 'each' && post.media.length > 1;
    const groups = each ? post.media.map((_, i) => [i]) : [post.media.map((_, i) => i)];
    memo.adsets = memo.adsets || {};
    const targeting = { geo_locations: { countries }, age_min: 18, targeting_automation: { advantage_audience: 1 } };
    for (let g = 0; g < groups.length; g++) {
      const key = 's' + g;
      if (memo.adsets[key]) continue;
      const first = post.media[groups[g][0]];
      const params = {
        name: each ? `${g + 1}. ${first.name || 'Ad'} - ${countries.join(', ')}` : `${title} - ${countries.join(', ')} - ${money(budget, cur)}/day`,
        campaign_id: memo.campaign, daily_budget: String(budget), billing_event: 'IMPRESSIONS',
        optimization_goal: goal.opt, bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        targeting: JSON.stringify(targeting), status: 'PAUSED'
      };
      if (goal.dest) params.destination_type = goal.dest;
      if (goal.pixel) params.promoted_object = JSON.stringify({ pixel_id: memo.pixel, custom_event_type: EVENTS.includes(o.event) ? o.event : 'PURCHASE' });
      const j = await send(`${act}/adsets`, params, tok, 'ad set');
      memo.adsets[key] = j.id; await save();
    }

    const tx = post.text.metaads || {};
    const words = { primary: tx.primary || '', headline: tx.headline || '', description: tx.description || '' };
    const spec = { page, ig: memo.ig || '', link, cta: CTAS.includes(o.cta) ? o.cta : 'SHOP_NOW' };
    memo.creatives = memo.creatives || {};
    memo.ads = memo.ads || {};
    for (let i = 0; i < post.media.length; i++) {
      const key = 'a' + i;
      if (memo.ads[key]) continue;
      const m = post.media[i], f = memo.files['f' + i];
      const shape = ratioOf(m);
      const name = `${i + 1}. ${m.name || (m.type === 'video' ? 'Video' : 'Photo')}${shape ? ' - ' + shape : ''}`;
      if (!memo.creatives[key]) {
        const c = await creative(act, tok, name, f, words, spec);
        memo.creatives[key] = c.id; if (!c.kept) memo.tweaked = true; await save();
      }
      const set = memo.adsets['s' + (each ? i : 0)];
      const j = await send(`${act}/ads`, { name, adset_id: set, creative: JSON.stringify({ creative_id: memo.creatives[key] }), status: 'PAUSED' }, tok, 'ad');
      memo.ads[key] = j.id; await save();
    }
    const tweaked = !!memo.tweaked;

    const nSets = groups.length, nAds = post.media.length;
    const msg = `Built and switched off: 1 campaign (${goal.n}), ${nSets} ad set${nSets === 1 ? '' : 's'} at ${money(budget, cur)}/day${each ? ' each' : ''}, `
      + `${nAds} ad${nAds === 1 ? '' : 's'}. Open Ads Manager, check them, then switch the campaign on.`
      + (tweaked ? ' Meta’s automatic text and crop tweaks are on for these - turn them off per ad if you want them exactly as made.' : '');
    return { state: 'ok', id: memo.campaign, msg,
             url: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${num}&selected_campaign_ids=${memo.campaign}` };
  }

  /* ---- what the Ad setup sheet shows: account, Page, pixel ---- */
  async function setup(t) {
    const x = t.extra || {}, tok = t.access_token, act = x.target;
    const out = { accounts: (x.accounts || []).map((a) => ({ id: a.id, name: a.name })), account: act || '',
                  pages: (x.pages || []).map((p) => ({ id: p.id, name: p.name })), page: x.page || '',
                  pixels: [], pixel: x.pixel || '', instagram: null, currency: 'USD', minBudget: 0 };
    if (!out.pages.length) {
      const { j } = await read('me/accounts?fields=id,name&limit=100', tok);
      out.pages = (j.data || []).map((p) => ({ id: p.id, name: p.name }));
    }
    if (!out.page && out.pages[0]) out.page = out.pages[0].id;
    if (act) {
      const [a, px, ig] = await Promise.all([
        read(`${act}?fields=name,currency,min_daily_budget`, tok),
        read(`${act}/adspixels?fields=id,name&limit=50`, tok),
        read(`${act}/instagram_accounts?fields=id,username`, tok)
      ]);
      out.currency = a.j.currency || 'USD';
      out.minBudget = major(a.j.min_daily_budget, out.currency);
      out.pixels = (px.j.data || []).map((p) => ({ id: p.id, name: p.name || p.id }));
      if (!out.pixel && out.pixels.length === 1) out.pixel = out.pixels[0].id;
      const i = (ig.j.data || [])[0];
      if (i) out.instagram = { id: i.id, username: i.username || '' };
    }
    return out;
  }
  /* the fields to store after a choice - only ids Meta just listed */
  async function choose(t, want) {
    const x = t.extra || {};
    const cur = await setup(t);
    const upd = {};
    if (want.account && want.account !== cur.account) {
      const a = cur.accounts.filter((i) => i.id === want.account)[0];
      if (!a) throw new PubError('That ad account is not one of yours.');
      return { upd: { target: a.id, pixel: '', ig: '' }, label: a.name };
    }
    if (want.page) {
      if (!cur.pages.some((p) => p.id === want.page)) throw new PubError('That Page is not one of yours.');
      upd.page = want.page;
    }
    if (want.pixel != null) {
      if (want.pixel && !cur.pixels.some((p) => p.id === want.pixel)) throw new PubError('That pixel is not on this ad account.');
      upd.pixel = want.pixel;
    }
    if (!x.page && cur.page && !upd.page) upd.page = cur.page;
    if (!x.pixel && cur.pixel && !('pixel' in upd)) upd.pixel = cur.pixel;
    upd.ig = cur.instagram ? cur.instagram.id : '';
    return { upd };
  }

  return { run, setup, choose };
}

module.exports = { makeAds, GOALS, CTAS, EVENTS, OFFSET1, minor, major, money, ratioOf };
