/* Publishing: one post, several platforms.

   A post arrives from Work OS Studio already shaped per platform (the
   page composes each caption and checks each limit before sending), with
   its media uploaded to Firebase Storage under users/{uid}/post/. This
   file moves those files to each platform the way that platform wants
   them:

     YouTube    resumable upload, streamed from Storage
     Instagram  container -> (wait for video processing) -> publish;
                sliders are child containers under a CAROUSEL container.
                Instagram fetches the media itself, so it gets a
                short-lived signed URL, never a public one.
     TikTok     FILE_UPLOAD in chunks; "draft" goes to the creator's
                TikTok inbox to finish in the app
     LinkedIn   images/video registered, uploaded, then one post
     X          v2 media upload (chunked for video), then the post

   Nothing here throws past run(): every platform ends in a result the
   Studio can show - ok, draft, skipped, or error with a reason in plain
   words. One platform failing never stops the others. */

const { Readable } = require('stream');
const { makeAds } = require('./ads');

const MB = 1024 * 1024;

class PubError extends Error {}

const clip = (s, n) => {
  const a = Array.from(String(s || ''));
  return a.length > n ? a.slice(0, n).join('') : a.join('');
};
const len = (s) => Array.from(String(s || '')).length;

function msgOf(j, fallback) {
  if (!j) return fallback || 'no details';
  const e = j.error;
  if (e && typeof e === 'object') return e.message || e.error_user_msg || e.code || fallback || 'no details';
  return j.error_description || j.message || j.detail || j.title || (typeof e === 'string' ? e : '') || fallback || 'no details';
}
async function errText(r) {
  const t = await r.text().catch(() => '');
  try { return msgOf(JSON.parse(t), `HTTP ${r.status}`); } catch (e) { return t.slice(0, 200) || `HTTP ${r.status}`; }
}

/* LinkedIn "little text": reserved characters must be escaped or the post
   is rejected; hashtags are rebuilt as real hashtag entities. */
function liText(s) {
  const esc = (t) => t.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => '\\' + c);
  const str = String(s || '');
  const re = /#([\p{L}\p{N}_]+)/gu;
  const out = [];
  let last = 0, m;
  while ((m = re.exec(str))) {
    out.push(esc(str.slice(last, m.index)));
    out.push(`{hashtag|\\#|${esc(m[1])}}`);
    last = m.index + m[0].length;
  }
  out.push(esc(str.slice(last)));
  return out.join('');
}

/* X counts every URL as 23 and most other characters as 1 (CJK and
   emoji as 2). Close enough to refuse what X would refuse. */
function xLength(s) {
  const noUrl = String(s || '').replace(/https?:\/\/\S+/g, '#'.repeat(23));
  let n = 0;
  for (const ch of Array.from(noUrl)) {
    const c = ch.codePointAt(0);
    n += (c <= 0x10FF || (c >= 0x2000 && c <= 0x200D) || (c >= 0x2010 && c <= 0x201F) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2;
  }
  return n;
}

function makePublisher(deps) {
  const { db, bucket, cfg } = deps;
  const fetch = deps.fetch || ((...a) => global.fetch(...a));
  const now = deps.now || Date.now;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const tokens = deps.tokens;                  // makeOAuth(...) - get(uid, provider)

  /* ---------------- media access ---------------- */
  async function meta(m) {
    const [md] = await bucket.file(m.path).getMetadata();
    return { size: +md.size, mime: md.contentType || m.mime || 'application/octet-stream' };
  }
  async function whole(m) {
    const [buf] = await bucket.file(m.path).download();
    return buf;
  }
  function range(m, start, end) {
    return new Promise((res, rej) => {
      const parts = [];
      bucket.file(m.path).createReadStream({ start, end })
        .on('data', (d) => parts.push(d)).on('end', () => res(Buffer.concat(parts))).on('error', rej);
    });
  }
  function stream(m) { return Readable.toWeb(bucket.file(m.path).createReadStream()); }
  async function signed(m) {
    const [u] = await bucket.file(m.path).getSignedUrl({ version: 'v4', action: 'read', expires: now() + 3 * 3600e3 });
    return u;
  }

  /* ---------------- YouTube ---------------- */
  async function youtube(post, ctx) {
    const vids = post.media.filter((m) => m.type === 'video');
    if (post.media.length !== 1 || vids.length !== 1) throw new PubError('YouTube takes exactly one video.');
    const t = await ctx.token('google');
    if (!/youtube\.upload/.test(t.scope || '')) throw new PubError('Reconnect Google and allow uploads to YouTube.');
    const m = vids[0];
    const md = await meta(m);
    const tx = post.text.youtube || {};
    const o = (post.options && post.options.youtube) || {};
    const want = ['public', 'unlisted', 'private'].includes(o.privacy) ? o.privacy : 'public';
    const privacy = post.draft ? 'private' : want;
    const noAngles = (s) => String(s || '').replace(/[<>]/g, '');
    const body = {
      snippet: {
        title: clip(noAngles(tx.title) || 'Untitled', 100),
        /* a Short is a vertical video of 3 minutes or less; the tag helps YouTube file it */
        description: clip(noAngles(o.short && !/#shorts/i.test(tx.description || '') ? `${tx.description || ''}\n\n#Shorts`.trim() : tx.description), 5000),
        tags: (Array.isArray(tx.tags) ? tx.tags : []).slice(0, 30),
        categoryId: '22'
      },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: !!o.madeForKids }
    };
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${t.access_token}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-length': String(md.size),
        'x-upload-content-type': md.mime
      },
      body: JSON.stringify(body)
    });
    if (!init.ok) throw new PubError('YouTube refused the upload: ' + await errText(init));
    const loc = init.headers.get('location');
    if (!loc) throw new PubError('YouTube did not return an upload address.');
    const up = await fetch(loc, {
      method: 'PUT',
      headers: { 'content-type': md.mime, 'content-length': String(md.size) },
      body: stream(m), duplex: 'half'
    });
    if (!up.ok) throw new PubError('YouTube upload failed: ' + await errText(up));
    const v = await up.json().catch(() => ({}));
    if (!v.id) throw new PubError('YouTube did not confirm the video.');
    const got = (v.status && v.status.privacyStatus) || privacy;
    let msg = '';
    if (post.draft) msg = 'Uploaded as private - publish it from YouTube Studio when ready.';
    else if (got !== want) msg = 'YouTube kept it ' + got + '. Uploads from apps Google has not audited yet stay private.';
    else if (got !== 'public') msg = 'Uploaded as ' + got + '.';
    return { state: post.draft ? 'draft' : 'ok', id: v.id, url: `https://youtu.be/${v.id}`, msg };
  }

  /* ---------------- Instagram ---------------- */
  async function instagram(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'Instagram has no drafts through its API. It stays saved in Kova.' };
    const items = post.media;
    if (!items.length) throw new PubError('Instagram needs at least one photo or video.');
    if (items.length > 10) throw new PubError('Instagram sliders take up to 10 items.');
    for (const m of items) {
      if (m.type === 'image' && !/jpe?g/i.test(m.mime || '')) throw new PubError('Instagram only takes JPEG photos.');
    }
    const t = await ctx.token('instagram');
    const igId = t.extra && t.extra.igId;
    if (!igId) throw new PubError('Reconnect Instagram - Kova does not have the account id.');
    const G = `https://graph.instagram.com/${cfg.igVersion}`;
    const tok = t.access_token;
    const caption = clip((post.text.instagram || {}).caption, 2200);

    async function create(params) {
      const r = await fetch(`${G}/${igId}/media`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(Object.assign({}, params, { access_token: tok }))
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new PubError('Instagram refused the media: ' + msgOf(j, `HTTP ${r.status}`));
      return j.id;
    }
    async function ready(id) {
      for (let i = 0; i < 72; i++) {
        const r = await fetch(`${G}/${id}?fields=status_code,status&access_token=${encodeURIComponent(tok)}`);
        const j = await r.json().catch(() => ({}));
        if (j.status_code === 'FINISHED' || j.status_code === 'PUBLISHED') return;
        if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') {
          throw new PubError('Instagram could not process the media: ' + (j.status || j.status_code));
        }
        await sleep(5000);
      }
      throw new PubError('Instagram took too long to process the video.');
    }

    /* where it goes: the feed (a post), Reels, or a 24-hour Story */
    const place = ((post.options || {}).instagram || {}).place || 'post';
    let creation;
    if (place === 'story') {
      if (items.length !== 1) throw new PubError('An Instagram Story takes one photo or one clip.');
      const m = items[0];
      creation = await create(m.type === 'video' ? { media_type: 'STORIES', video_url: await signed(m) }
                                                 : { media_type: 'STORIES', image_url: await signed(m) });
    } else if (place === 'reel') {
      if (items.length !== 1 || items[0].type !== 'video') throw new PubError('A Reel is one video.');
      creation = await create({ media_type: 'REELS', video_url: await signed(items[0]), caption, share_to_feed: 'true' });
    } else if (items.length === 1) {
      const m = items[0];
      if (m.type === 'video') {
        creation = await create({ media_type: 'REELS', video_url: await signed(m), caption, share_to_feed: 'true' });
      } else {
        creation = await create({ image_url: await signed(m), caption });
      }
    } else {
      const kids = [];
      for (const m of items) {
        const id = m.type === 'video'
          ? await create({ media_type: 'VIDEO', video_url: await signed(m), is_carousel_item: 'true' })
          : await create({ image_url: await signed(m), is_carousel_item: 'true' });
        if (m.type === 'video') await ready(id);
        kids.push(id);
      }
      creation = await create({ media_type: 'CAROUSEL', children: kids.join(','), caption });
    }
    await ready(creation);

    const pr = await fetch(`${G}/${igId}/media_publish`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ creation_id: creation, access_token: tok })
    });
    const pj = await pr.json().catch(() => ({}));
    if (!pr.ok || !pj.id) throw new PubError('Instagram did not publish it: ' + msgOf(pj, `HTTP ${pr.status}`));
    let url = '';
    try {
      const l = await fetch(`${G}/${pj.id}?fields=permalink&access_token=${encodeURIComponent(tok)}`);
      url = ((await l.json()) || {}).permalink || '';
    } catch (e) { /* the link is a nicety */ }
    return { state: 'ok', id: pj.id, url, msg: place === 'story' ? 'Story is up for 24 hours.' : (place === 'reel' ? 'Reel is live.' : '') };
  }

  /* ---------------- TikTok ---------------- */
  async function tiktok(post, ctx) {
    const vids = post.media.filter((m) => m.type === 'video');
    if (post.media.length !== 1 || vids.length !== 1) {
      throw new PubError(post.media.some((m) => m.type === 'image')
        ? 'TikTok photo posts need a media domain verified with TikTok, which Kova does not have yet. Post a video instead.'
        : 'TikTok takes one video.');
    }
    const t = await ctx.token('tiktok');
    const m = vids[0];
    const md = await meta(m);
    const size = md.size;
    /* TikTok: one chunk up to 64 MB; otherwise 10 MB chunks with the
       remainder folded into the last one */
    let chunk = size, count = 1;
    if (size > 64 * MB) { chunk = 10 * MB; count = Math.floor(size / chunk); }
    const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count };
    const H = { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json; charset=UTF-8' };
    const o = (post.options && post.options.tiktok) || {};
    const draft = !!(post.draft || o.mode === 'draft');

    let init;
    if (draft) {
      init = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
        method: 'POST', headers: H, body: JSON.stringify({ source_info })
      });
    } else {
      const ci = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST', headers: H });
      const cj = await ci.json().catch(() => ({}));
      const opts = (cj.data && cj.data.privacy_level_options) || ['SELF_ONLY'];
      const want = o.privacy || 'PUBLIC_TO_EVERYONE';
      const privacy = opts.includes(want) ? want : (opts.includes('SELF_ONLY') ? 'SELF_ONLY' : opts[0]);
      init = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST', headers: H,
        body: JSON.stringify({
          post_info: {
            title: clip((post.text.tiktok || {}).caption, 2200), privacy_level: privacy,
            disable_comment: false, disable_duet: false, disable_stitch: false
          },
          source_info
        })
      });
    }
    const ij = await init.json().catch(() => ({}));
    const code = ij.error && ij.error.code;
    if (!init.ok || (code && code !== 'ok')) throw new PubError('TikTok refused the upload: ' + msgOf(ij, `HTTP ${init.status}`));
    const publishId = ij.data && ij.data.publish_id;
    const uploadUrl = ij.data && ij.data.upload_url;
    if (!publishId || !uploadUrl) throw new PubError('TikTok did not return an upload address.');

    for (let i = 0; i < count; i++) {
      const start = i * chunk;
      const end = i === count - 1 ? size - 1 : start + chunk - 1;
      const buf = await range(m, start, end);
      const r = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': md.mime, 'content-length': String(buf.length), 'content-range': `bytes ${start}-${end}/${size}` },
        body: buf
      });
      if (!r.ok) throw new PubError(`TikTok upload failed on part ${i + 1} of ${count}.`);
    }

    let status = '', postId = '';
    for (let i = 0; i < 24; i++) {
      const s = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
        method: 'POST', headers: H, body: JSON.stringify({ publish_id: publishId })
      });
      const sj = await s.json().catch(() => ({}));
      status = (sj.data && sj.data.status) || '';
      postId = ((sj.data && sj.data.publicaly_available_post_id) || [])[0] || postId;   // TikTok's spelling
      if (status === 'FAILED') throw new PubError('TikTok could not process it: ' + ((sj.data && sj.data.fail_reason) || 'no reason given'));
      if (status === 'PUBLISH_COMPLETE' || status === 'SEND_TO_USER_INBOX') break;
      await sleep(5000);
    }
    if (draft) return { state: 'draft', id: publishId, msg: 'In your TikTok inbox - open TikTok to finish and post it.' };
    return { state: 'ok', id: publishId, post: postId ? String(postId) : '',
             msg: status === 'PUBLISH_COMPLETE' ? '' : 'Uploaded. TikTok is still processing it.' };
  }

  /* ---------------- LinkedIn ---------------- */
  async function linkedin(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'LinkedIn has no drafts through its API. It stays saved in Kova.' };
    const t = await ctx.token('linkedin');
    const sub = t.extra && t.extra.sub;
    if (!sub) throw new PubError('Reconnect LinkedIn - Kova does not have the member id.');
    const author = `urn:li:person:${sub}`;
    const H = {
      authorization: `Bearer ${t.access_token}`,
      'linkedin-version': cfg.linkedinVersion,
      'x-restli-protocol-version': '2.0.0',
      'content-type': 'application/json'
    };
    const imgs = post.media.filter((m) => m.type === 'image');
    const vids = post.media.filter((m) => m.type === 'video');
    if (imgs.length && vids.length) throw new PubError('LinkedIn posts take photos or one video, not both.');
    if (vids.length > 1) throw new PubError('LinkedIn takes one video per post.');
    if (imgs.length > 20) throw new PubError('LinkedIn takes up to 20 photos.');
    const text = (post.text.linkedin || {}).text || '';
    if (len(text) > 3000) throw new PubError('LinkedIn posts are limited to 3,000 characters.');

    const urns = [];
    for (const m of imgs) {
      const r = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
        method: 'POST', headers: H, body: JSON.stringify({ initializeUploadRequest: { owner: author } })
      });
      const j = await r.json().catch(() => ({}));
      const v = j.value || {};
      if (!r.ok || !v.uploadUrl) throw new PubError('LinkedIn refused the photo: ' + msgOf(j, `HTTP ${r.status}`));
      const up = await fetch(v.uploadUrl, { method: 'PUT', headers: { authorization: `Bearer ${t.access_token}` }, body: await whole(m) });
      if (!up.ok) throw new PubError('LinkedIn photo upload failed.');
      urns.push(v.image);
    }
    let videoUrn = '';
    if (vids.length) {
      const m = vids[0];
      const md = await meta(m);
      const r = await fetch('https://api.linkedin.com/rest/videos?action=initializeUpload', {
        method: 'POST', headers: H,
        body: JSON.stringify({ initializeUploadRequest: { owner: author, fileSizeBytes: md.size, uploadCaptions: false, uploadThumbnail: false } })
      });
      const j = await r.json().catch(() => ({}));
      const v = j.value || {};
      if (!r.ok || !v.video) throw new PubError('LinkedIn refused the video: ' + msgOf(j, `HTTP ${r.status}`));
      const etags = [];
      for (const ins of v.uploadInstructions || []) {
        const buf = await range(m, ins.firstByte, ins.lastByte);
        const up = await fetch(ins.uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: buf });
        if (!up.ok) throw new PubError('LinkedIn video upload failed.');
        etags.push(up.headers.get('etag'));
      }
      const fin = await fetch('https://api.linkedin.com/rest/videos?action=finalizeUpload', {
        method: 'POST', headers: H,
        body: JSON.stringify({ finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken || '', uploadedPartIds: etags } })
      });
      if (!fin.ok) throw new PubError('LinkedIn could not finish the video: ' + await errText(fin));
      videoUrn = v.video;
    }

    const body = {
      author, commentary: liText(text), visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false
    };
    if (videoUrn) body.content = { media: { id: videoUrn, title: clip((post.text.linkedin || {}).title || '', 200) } };
    else if (urns.length === 1) body.content = { media: { id: urns[0] } };
    else if (urns.length > 1) body.content = { multiImage: { images: urns.map((id) => ({ id })) } };

    const r = await fetch('https://api.linkedin.com/rest/posts', { method: 'POST', headers: H, body: JSON.stringify(body) });
    if (!r.ok) throw new PubError('LinkedIn did not publish it: ' + await errText(r));
    const id = r.headers.get('x-restli-id') || '';
    return { state: 'ok', id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : '' };
  }

  /* ---------------- X ---------------- */
  async function x(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'X has no drafts through its API. It stays saved in Kova.' };
    const text = (post.text.x || {}).text || '';
    if (xLength(text) > 280) throw new PubError('X posts are limited to 280 characters.');
    const imgs = post.media.filter((m) => m.type === 'image');
    const vids = post.media.filter((m) => m.type === 'video');
    if (imgs.length && vids.length) throw new PubError('X posts take photos or one video, not both.');
    if (imgs.length > 4) throw new PubError('X takes up to 4 photos.');
    if (vids.length > 1) throw new PubError('X takes one video per post.');
    if (!text.trim() && !post.media.length) throw new PubError('Nothing to post to X.');
    const t = await ctx.token('x');
    const A = { authorization: `Bearer ${t.access_token}` };
    const ids = [];

    for (const m of imgs) {
      const fd = new FormData();
      fd.append('media', new Blob([await whole(m)], { type: m.mime || 'image/jpeg' }), 'photo.jpg');
      fd.append('media_category', 'tweet_image');
      const r = await fetch('https://api.x.com/2/media/upload', { method: 'POST', headers: A, body: fd });
      const j = await r.json().catch(() => ({}));
      const id = j.data && j.data.id;
      if (!r.ok || !id) throw new PubError('X refused the photo: ' + msgOf(j, `HTTP ${r.status}`));
      ids.push(id);
    }
    if (vids.length) {
      const m = vids[0];
      const md = await meta(m);
      const r = await fetch('https://api.x.com/2/media/upload/initialize', {
        method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, A),
        body: JSON.stringify({ media_type: md.mime, total_bytes: md.size, media_category: 'tweet_video' })
      });
      const j = await r.json().catch(() => ({}));
      const id = j.data && j.data.id;
      if (!r.ok || !id) throw new PubError('X refused the video: ' + msgOf(j, `HTTP ${r.status}`));
      const seg = 4 * MB;
      for (let i = 0, off = 0; off < md.size; i++, off += seg) {
        const fd = new FormData();
        fd.append('segment_index', String(i));
        fd.append('media', new Blob([await range(m, off, Math.min(md.size, off + seg) - 1)]), 'chunk');
        const a = await fetch(`https://api.x.com/2/media/upload/${id}/append`, { method: 'POST', headers: A, body: fd });
        if (!a.ok) throw new PubError(`X video upload failed on part ${i + 1}.`);
      }
      const fin = await fetch(`https://api.x.com/2/media/upload/${id}/finalize`, { method: 'POST', headers: A });
      const fj = await fin.json().catch(() => ({}));
      if (!fin.ok) throw new PubError('X could not finish the video: ' + msgOf(fj, `HTTP ${fin.status}`));
      let info = fj.data && fj.data.processing_info;
      for (let i = 0; info && info.state !== 'succeeded' && i < 60; i++) {
        if (info.state === 'failed') throw new PubError('X could not process the video: ' + ((info.error && info.error.message) || 'no reason given'));
        await sleep(((info.check_after_secs || 3) * 1000));
        const s = await fetch(`https://api.x.com/2/media/upload?media_id=${id}&command=STATUS`, { headers: A });
        const sj = await s.json().catch(() => ({}));
        info = sj.data && sj.data.processing_info;
      }
      ids.push(id);
    }

    const body = { text };
    if (ids.length) body.media = { media_ids: ids };
    const r = await fetch('https://api.x.com/2/tweets', {
      method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, A), body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    const id = j.data && j.data.id;
    if (!r.ok || !id) throw new PubError('X did not publish it: ' + msgOf(j, `HTTP ${r.status}`));
    return { state: 'ok', id, url: `https://x.com/i/status/${id}` };
  }

  /* ---------------- shared by the new ones ---------------- */
  const FBV = () => cfg.fbVersion || 'v23.0';
  const graphemes = (s) => {
    try { return Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(String(s || ''))).length; }
    catch (e) { return len(s); }
  };
  const formPost = (url, params, headers) => fetch(url, {
    method: 'POST', headers: Object.assign({ 'content-type': 'application/x-www-form-urlencoded' }, headers || {}),
    body: new URLSearchParams(params)
  });
  const onlyPhotos = (post, n, who) => {
    if (post.media.some((m) => m.type === 'video')) throw new PubError(`${who} posts from Kova take photos, not video.`);
    if (post.media.length > n) throw new PubError(`${who} takes up to ${n} photo${n === 1 ? '' : 's'}.`);
  };
  const noMix = (post, who) => {
    const v = post.media.filter((m) => m.type === 'video').length;
    if (v && v !== post.media.length) throw new PubError(`${who} posts take photos or one video, not both.`);
    if (v > 1) throw new PubError(`${who} takes one video per post.`);
  };

  /* ---------------- Facebook Page ---------------- */
  async function facebook(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'Facebook Page drafts are not open to apps. It stays saved in Kova.' };
    const t = await ctx.token('facebook');
    const x = t.extra || {};
    const page = (x.pages || []).filter((p) => p.id === x.target)[0] || (x.pages || [])[0];
    if (!page) throw new PubError('Reconnect Facebook - Kova has no Page to post to.');
    noMix(post, 'Facebook');
    if (post.media.filter((m) => m.type === 'image').length > 10) throw new PubError('Facebook takes up to 10 photos from Kova.');
    const G = `https://graph.facebook.com/${FBV()}`;
    const tok = page.token;
    const text = (post.text.facebook || {}).text || '';
    const place = ((post.options || {}).facebook || {}).place || 'post';
    if (place === 'reel') return fbReel(post, page, text);
    if (place === 'story') return fbStory(post, page);
    let id = '';
    const need = async (r, what) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok || (!j.id && !j.post_id)) throw new PubError(`Facebook refused the ${what}: ` + msgOf(j, `HTTP ${r.status}`));
      return j;
    };
    if (!post.media.length) {
      id = (await need(await formPost(`${G}/${page.id}/feed`, { message: text, access_token: tok }), 'post')).id;
    } else if (post.media[0].type === 'video') {
      const m = post.media[0];
      const j = await need(await formPost(`https://graph-video.facebook.com/${FBV()}/${page.id}/videos`,
        { file_url: await signed(m), description: text, title: clip((post.text.facebook || {}).title, 250), access_token: tok }), 'video');
      return { state: 'ok', id: j.id, url: `https://www.facebook.com/${page.id}/videos/${j.id}`, msg: 'Facebook is processing the video.' };
    } else if (post.media.length === 1) {
      const j = await need(await formPost(`${G}/${page.id}/photos`, { url: await signed(post.media[0]), caption: text, access_token: tok }), 'photo');
      id = j.post_id || j.id;
    } else {
      const ids = [];
      for (const m of post.media) {
        const j = await need(await formPost(`${G}/${page.id}/photos`, { url: await signed(m), published: 'false', access_token: tok }), 'photo');
        ids.push(j.id);
      }
      const params = { message: text, access_token: tok };
      ids.forEach((mid, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: mid }); });
      id = (await need(await formPost(`${G}/${page.id}/feed`, params), 'post')).id;
    }
    return { state: 'ok', id, url: `https://www.facebook.com/${id}` };
  }

  /* Page Reels and Stories: start -> hand Facebook the file by link -> finish */
  async function fbUpload(page, edge, m) {
    const G = `https://graph.facebook.com/${FBV()}`;
    const r = await formPost(`${G}/${page.id}/${edge}`, { upload_phase: 'start', access_token: page.token });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.video_id) throw new PubError('Facebook did not start the upload: ' + msgOf(j, `HTTP ${r.status}`));
    const u = await fetch(`https://rupload.facebook.com/video-upload/${FBV()}/${j.video_id}`, {
      method: 'POST', headers: { authorization: `OAuth ${page.token}`, file_url: await signed(m) }
    });
    const uj = await u.json().catch(() => ({}));
    if (!u.ok || uj.success === false) throw new PubError('Facebook did not take the video: ' + msgOf(uj, `HTTP ${u.status}`));
    return j.video_id;
  }
  async function fbReel(post, page, text) {
    const m = post.media[0];
    if (post.media.length !== 1 || !m || m.type !== 'video') throw new PubError('A Facebook Reel is one video.');
    const vid = await fbUpload(page, 'video_reels', m);
    const r = await formPost(`https://graph.facebook.com/${FBV()}/${page.id}/video_reels`,
      { upload_phase: 'finish', video_id: vid, video_state: 'PUBLISHED', description: text, access_token: page.token });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new PubError('Facebook did not publish the Reel: ' + msgOf(j, `HTTP ${r.status}`));
    return { state: 'ok', id: vid, url: `https://www.facebook.com/reel/${vid}`, msg: 'Facebook is processing the Reel.' };
  }
  async function fbStory(post, page) {
    const m = post.media[0];
    if (post.media.length !== 1 || !m) throw new PubError('A Facebook Story takes one photo or one clip.');
    const G = `https://graph.facebook.com/${FBV()}`;
    let j;
    if (m.type === 'video') {
      const vid = await fbUpload(page, 'video_stories', m);
      const r = await formPost(`${G}/${page.id}/video_stories`, { upload_phase: 'finish', video_id: vid, access_token: page.token });
      j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new PubError('Facebook did not post the Story: ' + msgOf(j, `HTTP ${r.status}`));
    } else {
      const ph = await formPost(`${G}/${page.id}/photos`, { url: await signed(m), published: 'false', access_token: page.token });
      const pj = await ph.json().catch(() => ({}));
      if (!ph.ok || !pj.id) throw new PubError('Facebook refused the photo: ' + msgOf(pj, `HTTP ${ph.status}`));
      const r = await formPost(`${G}/${page.id}/photo_stories`, { photo_id: pj.id, access_token: page.token });
      j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new PubError('Facebook did not post the Story: ' + msgOf(j, `HTTP ${r.status}`));
    }
    return { state: 'ok', id: j.post_id || '', url: j.post_id ? `https://www.facebook.com/${j.post_id}` : '', msg: 'Story is up for 24 hours.' };
  }

  /* ---------------- Meta Ads (ads.js) ----------------
     The media library upload, or the whole paused campaign -> ad set ->
     ads, filled in and waiting in Ads Manager. */
  const ads = makeAds({ fetch, formPost: (u, p) => formPost(u, p), msgOf, signed, whole, sleep, now, PubError, version: FBV });
  async function metaads(post, ctx) {
    return ads.run(post, await ctx.token('metaads'), ctx);
  }

  /* ---------------- Threads ---------------- */
  async function threads(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'Threads has no drafts through its API. It stays saved in Kova.' };
    const text = (post.text.threads || {}).text || '';
    if (len(text) > 500) throw new PubError('Threads posts are limited to 500 characters.');
    if (post.media.length > 20) throw new PubError('Threads takes up to 20 items.');
    if (!text.trim() && !post.media.length) throw new PubError('Nothing to post to Threads.');
    const t = await ctx.token('threads');
    const me = (t.extra || {}).userId;
    if (!me) throw new PubError('Reconnect Threads - Kova does not have the account id.');
    const B = 'https://graph.threads.net/v1.0';
    const create = async (params) => {
      const r = await formPost(`${B}/${me}/threads`, Object.assign({}, params, { access_token: t.access_token }));
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new PubError('Threads refused it: ' + msgOf(j, `HTTP ${r.status}`));
      return j.id;
    };
    const ready = async (id) => {
      for (let i = 0; i < 60; i++) {
        const r = await fetch(`${B}/${id}?fields=status,error_message&access_token=${encodeURIComponent(t.access_token)}`);
        const j = await r.json().catch(() => ({}));
        if (j.status === 'FINISHED' || j.status === 'PUBLISHED') return;
        if (j.status === 'ERROR' || j.status === 'EXPIRED') throw new PubError('Threads could not process it: ' + (j.error_message || j.status));
        await sleep(3000);
      }
      throw new PubError('Threads took too long to process the media.');
    };
    const item = async (m, child) => {
      const p = m.type === 'video' ? { media_type: 'VIDEO', video_url: await signed(m) } : { media_type: 'IMAGE', image_url: await signed(m) };
      if (child) p.is_carousel_item = 'true';
      return p;
    };
    let creation;
    if (!post.media.length) creation = await create({ media_type: 'TEXT', text });
    else if (post.media.length === 1) creation = await create(Object.assign(await item(post.media[0], false), { text }));
    else {
      const kids = [];
      for (const m of post.media) { const id = await create(await item(m, true)); await ready(id); kids.push(id); }
      creation = await create({ media_type: 'CAROUSEL', children: kids.join(','), text });
    }
    await ready(creation);
    const r = await formPost(`${B}/${me}/threads_publish`, { creation_id: creation, access_token: t.access_token });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new PubError('Threads did not publish it: ' + msgOf(j, `HTTP ${r.status}`));
    let url = '';
    try { url = ((await (await fetch(`${B}/${j.id}?fields=permalink&access_token=${encodeURIComponent(t.access_token)}`)).json()) || {}).permalink || ''; } catch (e) { /* nicety */ }
    return { state: 'ok', id: j.id, url };
  }

  /* ---------------- Pinterest ---------------- */
  async function pinterest(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'Pinterest has no drafts through its API. It stays saved in Kova.' };
    if (!post.media.length) throw new PubError('A Pin needs a photo or video.');
    noMix(post, 'Pinterest');
    if (post.media.length > 5) throw new PubError('Pinterest carousels take up to 5 photos.');
    const t = await ctx.token('pinterest');
    const A = { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' };
    const P = 'https://api.pinterest.com/v5';
    let board = (t.extra || {}).target;
    if (!board) {
      const r = await fetch(`${P}/boards`, { method: 'POST', headers: A, body: JSON.stringify({ name: 'Kova', privacy: 'PUBLIC' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new PubError('Pinterest would not create a board: ' + msgOf(j, `HTTP ${r.status}`));
      board = j.id;
      await ctx.patch('pinterest', { 'extra/target': board });
    }
    const tx = post.text.pinterest || {};
    let source;
    if (post.media[0].type === 'video') {
      const m = post.media[0];
      const r = await fetch(`${P}/media`, { method: 'POST', headers: A, body: JSON.stringify({ media_type: 'video' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.media_id || !j.upload_url) throw new PubError('Pinterest refused the video: ' + msgOf(j, `HTTP ${r.status}`));
      const fd = new FormData();
      Object.keys(j.upload_parameters || {}).forEach((k) => fd.append(k, j.upload_parameters[k]));
      fd.append('file', new Blob([await whole(m)], { type: m.mime || 'video/mp4' }), 'video.mp4');
      const up = await fetch(j.upload_url, { method: 'POST', body: fd });
      if (!up.ok) throw new PubError('Pinterest video upload failed.');
      for (let i = 0; i < 60; i++) {
        const s = await (await fetch(`${P}/media/${j.media_id}`, { headers: A })).json().catch(() => ({}));
        if (s.status === 'succeeded') break;
        if (s.status === 'failed') throw new PubError('Pinterest could not process the video.');
        await sleep(5000);
      }
      source = { source_type: 'video_id', media_id: j.media_id, cover_image_key_frame_time: 1 };
    } else if (post.media.length === 1) {
      source = { source_type: 'image_url', url: await signed(post.media[0]) };
    } else {
      const items = [];
      for (const m of post.media) items.push({ url: await signed(m) });
      source = { source_type: 'multiple_image_urls', items };
    }
    const body = { board_id: board, title: clip(tx.title, 100), description: clip(tx.description, 800), media_source: source };
    if (tx.link) body.link = tx.link;
    const r = await fetch(`${P}/pins`, { method: 'POST', headers: A, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new PubError('Pinterest did not create the Pin: ' + msgOf(j, `HTTP ${r.status}`));
    return { state: 'ok', id: j.id, url: `https://www.pinterest.com/pin/${j.id}/` };
  }

  /* ---------------- Bluesky ---------------- */
  function facets(text) {
    const out = [];
    const bytesTo = (i) => Buffer.byteLength(text.slice(0, i), 'utf8');
    let m;
    const link = /https?:\/\/[^\s)]+/g;
    while ((m = link.exec(text))) {
      out.push({ index: { byteStart: bytesTo(m.index), byteEnd: bytesTo(m.index + m[0].length) },
                 features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
    }
    const tag = /(^|\s)#([\p{L}\p{N}_]+)/gu;
    while ((m = tag.exec(text))) {
      const start = m.index + m[1].length;
      out.push({ index: { byteStart: bytesTo(start), byteEnd: bytesTo(start + 1 + m[2].length) },
                 features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2] }] });
    }
    return out;
  }
  async function bluesky(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'Bluesky has no drafts. It stays saved in Kova.' };
    const text = (post.text.bluesky || {}).text || '';
    if (graphemes(text) > 300) throw new PubError('Bluesky posts are limited to 300 characters.');
    onlyPhotos(post, 4, 'Bluesky');
    if (!text.trim() && !post.media.length) throw new PubError('Nothing to post to Bluesky.');
    const t = await ctx.token('bluesky');
    const x = t.extra || {};
    const pds = x.pds || 'https://bsky.social';
    const A = { authorization: `Bearer ${t.access_token}` };
    const images = [];
    for (const m of post.media) {
      const buf = await whole(m);
      if (buf.length > 1000000) throw new PubError('Bluesky photos must be under 1 MB.');
      const r = await fetch(`${pds}/xrpc/com.atproto.repo.uploadBlob`, { method: 'POST', headers: Object.assign({ 'content-type': m.mime || 'image/jpeg' }, A), body: buf });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.blob) throw new PubError('Bluesky refused the photo: ' + msgOf(j, `HTTP ${r.status}`));
      const img = { alt: '', image: j.blob };
      if (m.w && m.h) img.aspectRatio = { width: m.w, height: m.h };
      images.push(img);
    }
    const record = { $type: 'app.bsky.feed.post', text, createdAt: new Date(now()).toISOString() };
    const fc = facets(text);
    if (fc.length) record.facets = fc;
    if (images.length) record.embed = { $type: 'app.bsky.embed.images', images };
    const r = await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, A),
      body: JSON.stringify({ repo: x.did, collection: 'app.bsky.feed.post', record })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.uri) throw new PubError('Bluesky did not publish it: ' + msgOf(j, `HTTP ${r.status}`));
    return { state: 'ok', id: j.uri, url: `https://bsky.app/profile/${x.handle}/post/${j.uri.split('/').pop()}` };
  }

  /* ---------------- Reddit ---------------- */
  async function reddit(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'Reddit has no drafts through its API. It stays saved in Kova.' };
    const tx = post.text.reddit || {};
    if (!String(tx.title || '').trim()) throw new PubError('Reddit needs a title. Write a heading.');
    onlyPhotos(post, 1, 'Reddit');
    const t = await ctx.token('reddit');
    const UA = 'web:app.kova.studio:1.0 (by /u/kova_app)';
    const A = { authorization: `Bearer ${t.access_token}`, 'user-agent': UA };
    const sr = String(((post.options || {}).reddit || {}).subreddit || '').replace(/^\/?r\//, '').trim() || `u_${(t.extra || {}).name || ''}`;
    const params = { api_type: 'json', sr, title: clip(tx.title, 300), resubmit: 'true', sendreplies: 'true' };
    if (post.media.length) {
      const m = post.media[0];
      const lr = await formPost('https://oauth.reddit.com/api/media/asset.json', { filepath: m.name || 'photo.jpg', mimetype: m.mime || 'image/jpeg' }, A);
      const lj = await lr.json().catch(() => ({}));
      const args = lj.args || {};
      if (!lr.ok || !args.action) throw new PubError('Reddit refused the photo: ' + msgOf(lj, `HTTP ${lr.status}`));
      const fd = new FormData();
      let key = '';
      (args.fields || []).forEach((fl) => { fd.append(fl.name, fl.value); if (fl.name === 'key') key = fl.value; });
      fd.append('file', new Blob([await whole(m)], { type: m.mime || 'image/jpeg' }), m.name || 'photo.jpg');
      const action = args.action.startsWith('//') ? 'https:' + args.action : args.action;
      const up = await fetch(action, { method: 'POST', body: fd });
      if (!up.ok) throw new PubError('Reddit photo upload failed.');
      params.kind = 'image';
      params.url = `${action}/${key}`;
    } else {
      params.kind = 'self';
      params.text = clip(tx.text, 40000);
    }
    const r = await formPost('https://oauth.reddit.com/api/submit', params, A);
    const j = await r.json().catch(() => ({}));
    const errs = ((j.json || {}).errors || []);
    if (!r.ok || errs.length) throw new PubError('Reddit did not post it: ' + (errs.length ? errs.map((e) => e[1] || e[0]).join('; ') : `HTTP ${r.status}`));
    const d = (j.json || {}).data || {};
    return { state: 'ok', id: d.name || d.id || '', url: d.url || `https://www.reddit.com/${sr.startsWith('u_') ? 'user/' + sr.slice(2) : 'r/' + sr}/new/`,
             msg: params.kind === 'image' ? 'Reddit is processing the photo post.' : '' };
  }

  /* ---------------- Tumblr ---------------- */
  async function tumblr(post, ctx) {
    const t = await ctx.token('tumblr');
    const blog = (t.extra || {}).target;
    if (!blog) throw new PubError('Reconnect Tumblr - Kova has no blog to post to.');
    if (post.media.length > 10) throw new PubError('Tumblr takes up to 10 items.');
    const tx = post.text.tumblr || {};
    const content = [];
    if (String(tx.text || '').trim()) content.push({ type: 'text', text: tx.text });
    const fd = new FormData();
    for (let i = 0; i < post.media.length; i++) {
      const m = post.media[i], idf = 'media' + i;
      const type = m.mime || (m.type === 'video' ? 'video/mp4' : 'image/jpeg');
      content.push(m.type === 'video' ? { type: 'video', media: { type, identifier: idf } } : { type: 'image', media: [{ type, identifier: idf }] });
      fd.append(idf, new Blob([await whole(m)], { type }), m.name || idf);
    }
    if (!content.length) throw new PubError('Nothing to post to Tumblr.');
    fd.append('json', JSON.stringify({ content, tags: (tx.tags || []).join(','), state: post.draft ? 'draft' : 'published' }));
    const r = await fetch(`https://api.tumblr.com/v2/blog/${blog}/posts`, { method: 'POST', headers: { authorization: `Bearer ${t.access_token}` }, body: fd });
    const j = await r.json().catch(() => ({}));
    const id = (j.response || {}).id_string || (j.response || {}).id;
    if (!r.ok || !id) throw new PubError('Tumblr did not post it: ' + msgOf(j.meta || j, `HTTP ${r.status}`));
    return post.draft
      ? { state: 'draft', id: String(id), msg: 'Saved as a draft on your Tumblr blog.' }
      : { state: 'ok', id: String(id), url: `https://${blog}.tumblr.com/post/${id}` };
  }

  /* ---------------- Mastodon ---------------- */
  async function mastodon(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'Mastodon has no drafts. It stays saved in Kova.' };
    const t = await ctx.token('mastodon');
    const x = t.extra || {};
    const text = (post.text.mastodon || {}).text || '';
    if (len(text) > (x.maxChars || 500)) throw new PubError(`Your Mastodon server allows ${x.maxChars || 500} characters.`);
    noMix(post, 'Mastodon');
    if (post.media.length > 4) throw new PubError('Mastodon takes up to 4 photos.');
    const H = `https://${x.instance}`;
    const A = { authorization: `Bearer ${t.access_token}` };
    const ids = [];
    for (const m of post.media) {
      const fd = new FormData();
      fd.append('file', new Blob([await whole(m)], { type: m.mime || 'image/jpeg' }), m.name || 'media');
      const r = await fetch(`${H}/api/v2/media`, { method: 'POST', headers: A, body: fd });
      const j = await r.json().catch(() => ({}));
      if (!(r.status === 200 || r.status === 202) || !j.id) throw new PubError('Mastodon refused the media: ' + msgOf(j, `HTTP ${r.status}`));
      let ready = !!j.url;
      for (let i = 0; !ready && i < 40; i++) {
        await sleep(3000);
        const s = await fetch(`${H}/api/v1/media/${j.id}`, { headers: A });
        const sj = await s.json().catch(() => ({}));
        ready = s.status === 200 && !!sj.url;
      }
      ids.push(j.id);
    }
    const r = await fetch(`${H}/api/v1/statuses`, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, A),
      body: JSON.stringify({ status: text, media_ids: ids, visibility: 'public' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new PubError('Mastodon did not post it: ' + msgOf(j, `HTTP ${r.status}`));
    return { state: 'ok', id: j.id, url: j.url || '' };
  }

  /* ---------------- Discord ---------------- */
  async function discord(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'Discord has no drafts. It stays saved in Kova.' };
    const t = await ctx.token('discord');
    const text = (post.text.discord || {}).text || '';
    if (len(text) > 2000) throw new PubError('Discord messages are limited to 2,000 characters.');
    if (post.media.length > 10) throw new PubError('Discord takes up to 10 files.');
    let total = 0;
    const fd = new FormData();
    const attachments = [];
    for (let i = 0; i < post.media.length; i++) {
      const m = post.media[i];
      const buf = await whole(m);
      total += buf.length;
      if (total > 25 * MB) throw new PubError('Discord takes up to 25 MB of files per message.');
      const name = m.name || `kova_${i}.${m.type === 'video' ? 'mp4' : 'jpg'}`;
      fd.append(`files[${i}]`, new Blob([buf], { type: m.mime || 'application/octet-stream' }), name);
      attachments.push({ id: i, filename: name });
    }
    if (!text.trim() && !attachments.length) throw new PubError('Nothing to post to Discord.');
    fd.append('payload_json', JSON.stringify({ content: text, attachments }));
    const r = await fetch(`${t.access_token}?wait=true`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new PubError('Discord did not post it: ' + msgOf(j, `HTTP ${r.status}`));
    const x = t.extra || {};
    return { state: 'ok', id: j.id, url: x.guild ? `https://discord.com/channels/${x.guild}/${j.channel_id || x.channel}/${j.id}` : '' };
  }

  /* ---------------- Telegram ---------------- */
  async function telegram(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'Telegram channels have no drafts. It stays saved in Kova.' };
    const t = await ctx.token('telegram');
    const x = t.extra || {};
    const B = `https://api.telegram.org/bot${t.access_token}`;
    const text = (post.text.telegram || {}).text || '';
    if (post.media.length > 10) throw new PubError('Telegram albums take up to 10 items.');
    const ok = async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new PubError('Telegram did not post it: ' + (j.description || `HTTP ${r.status}`));
      return j.result;
    };
    let res;
    if (!post.media.length) {
      if (len(text) > 4096) throw new PubError('Telegram messages are limited to 4,096 characters.');
      res = await ok(await fetch(`${B}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: x.chat, text }) }));
    } else {
      if (len(text) > 1024) throw new PubError('Telegram captions are limited to 1,024 characters.');
      const fd = new FormData();
      fd.append('chat_id', x.chat);
      const file = async (m, i) => {
        const buf = await whole(m);
        if (m.type === 'image' && buf.length > 10 * MB) throw new PubError('Telegram photos must be under 10 MB.');
        if (buf.length > 50 * MB) throw new PubError('Telegram bots can send files up to 50 MB.');
        return new Blob([buf], { type: m.mime || 'application/octet-stream' });
      };
      if (post.media.length === 1) {
        const m = post.media[0];
        const kind = m.type === 'video' ? 'video' : 'photo';
        fd.append(kind, await file(m, 0), m.name || kind);
        if (text) fd.append('caption', text);
        res = await ok(await fetch(`${B}/${kind === 'video' ? 'sendVideo' : 'sendPhoto'}`, { method: 'POST', body: fd }));
      } else {
        const media = [];
        for (let i = 0; i < post.media.length; i++) {
          const m = post.media[i];
          fd.append('f' + i, await file(m, i), m.name || 'f' + i);
          const e = { type: m.type === 'video' ? 'video' : 'photo', media: 'attach://f' + i };
          if (i === 0 && text) e.caption = text;
          media.push(e);
        }
        fd.append('media', JSON.stringify(media));
        const list = await ok(await fetch(`${B}/sendMediaGroup`, { method: 'POST', body: fd }));
        res = Array.isArray(list) ? list[0] : list;
      }
    }
    const mid = res && res.message_id;
    return { state: 'ok', id: String(mid || ''), url: x.username && mid ? `https://t.me/${x.username}/${mid}` : '' };
  }

  /* ---------------- Google Business Profile ---------------- */
  async function gbusiness(post, ctx) {
    if (post.draft) return { state: 'skipped', msg: 'Business Profile updates have no drafts. It stays saved in Kova.' };
    onlyPhotos(post, 1, 'Google Business Profile');
    const text = (post.text.gbusiness || {}).text || '';
    if (!text.trim()) throw new PubError('A Business Profile update needs some words.');
    if (len(text) > 1500) throw new PubError('Business Profile updates are limited to 1,500 characters.');
    const t = await ctx.token('gbusiness');
    const x = t.extra || {};
    const loc = (x.locations || []).filter((l) => l.id === x.target)[0] || (x.locations || [])[0];
    if (!loc) throw new PubError('Reconnect Google Business Profile - Kova has no location to post to.');
    const body = { languageCode: 'en', summary: text, topicType: 'STANDARD' };
    if (post.media.length) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: await signed(post.media[0]) }];
    const r = await fetch(`https://mybusiness.googleapis.com/v4/${loc.account}/${loc.id}/localPosts`, {
      method: 'POST', headers: { authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.name) throw new PubError('Google did not post the update: ' + msgOf(j, `HTTP ${r.status}`));
    return { state: 'ok', id: j.name, url: j.searchUrl || '' };
  }

  const PLATFORMS = { youtube, instagram, tiktok, linkedin, x, facebook, metaads, threads, pinterest,
                      bluesky, reddit, tumblr, mastodon, discord, telegram, gbusiness };

  /* ---------------- the job ---------------- */
  async function run(uid, id) {
    const ref = db.ref(`srv/posts/${uid}/${id}`);
    const post = (await ref.once('value')).val();
    if (!post || post.state === 'cancelled') return null;
    await ref.update({ state: 'publishing', startedAt: now() });
    const results = Object.assign({}, post.results || {});
    const started = now();
    let target = '';
    const ctx = {
      token: (name) => tokens.get(uid, name),
      patch: (name, upd) => db.ref(`srv/oauth/${uid}/${name}`).update(upd),
      /* ids a platform has already been given, so a second pass carries on */
      memo: {
        get: async () => (await ref.child(`work/${target}`).once('value')).val() || {},
        set: (v) => ref.child(`work/${target}`).set(v)
      },
      deadline: started + 7 * 60e3            // the worker is stopped at 9 minutes
    };
    const body = Object.assign({ media: [], text: {}, options: {} }, post.payload || {});

    for (target of body.targets || []) {
      if (!PLATFORMS[target]) continue;
      const prev = results[target];
      if (prev && ['ok', 'draft', 'skipped'].includes(prev.state)) continue;   // a retry never double-posts
      await ref.child(`results/${target}`).set({ state: 'working', at: now() });
      let res;
      try {
        res = await PLATFORMS[target](body, ctx);
      } catch (e) {
        const known = e instanceof PubError || (e && e.status === 409);
        if (!known) console.error('publish', target, e);
        res = { state: 'error', msg: known ? e.message : 'Something went wrong on the server. Try again.' };
      }
      results[target] = Object.assign({ at: now() }, res);
      await ref.child(`results/${target}`).set(results[target]);
    }

    /* a platform still waiting on its side (Meta processing a video) gets
       another pass in a few minutes; everything done so far is kept */
    const later = (body.targets || []).filter((k) => (results[k] || {}).state === 'later');
    const tries = (post.passes || 0) + 1;
    if (later.length && tries < 6) {
      const at = now() + 4 * 60e3;
      for (const k of later) {
        results[k] = Object.assign({}, results[k], { state: 'working' });
        await ref.child(`results/${k}`).set(results[k]);
      }
      await ref.update({ state: 'scheduled', when: at, passes: tries, updatedAt: now() });
      await db.ref(`srv/scheduled/${uid}_${id}`).set({ uid, id, at });
      return { state: 'scheduled', results };
    }
    for (const k of later) {
      results[k] = { at: now(), state: 'error', msg: 'Meta took too long to process the videos. Tap Retry - what is already there is kept.' };
      await ref.child(`results/${k}`).set(results[k]);
    }

    const states = (body.targets || []).map((k) => (results[k] || {}).state);
    const bad = states.filter((s) => s === 'error').length;
    const state = !bad ? 'done' : (bad === states.length ? 'failed' : 'partial');
    await ref.update({ state, finishedAt: now() });
    return { state, results };
  }

  return { run, PLATFORMS };
}

/* Scheduled posts whose time has come move into the worker's queue. Run
   by publishDue every five minutes; kept here so it can be tested. */
async function moveDue(db, now) {
  const t = now || Date.now();
  const due = (await db.ref('srv/scheduled').orderByChild('at').endAt(t).limitToFirst(50).once('value')).val() || {};
  let moved = 0;
  for (const key of Object.keys(due)) {
    const j = due[key];
    if (j && j.uid && j.id) {
      const post = (await db.ref(`srv/posts/${j.uid}/${j.id}`).once('value')).val();
      if (post && post.state === 'scheduled') {
        await db.ref(`srv/posts/${j.uid}/${j.id}`).update({ state: 'queued', updatedAt: t });
        await db.ref(`srv/queue/${j.uid}/${j.id}`).set({ at: t });
        moved++;
      }
    }
    await db.ref(`srv/scheduled/${key}`).remove();
  }
  return moved;
}

module.exports = { makePublisher, moveDue, liText, xLength, PubError };
