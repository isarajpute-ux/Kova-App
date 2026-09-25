/* ==========================================================================
   Publishing. One function per platform, each doing exactly what that
   platform's public API allows a normal (non-partner) developer app to do:

     linkedin   text (+ one image) to your own profile        - live
     x          text post                                      - live
     youtube    video upload; private until Google audits app  - live
     instagram  image post or Reel (Business/Creator account)  - live
     tiktok     video sent to your TikTok inbox as a draft;    - live
                direct posting needs TikTok's content audit

   Video platforms need a media_url: the app uploads the file to Firebase
   Storage and sends the download URL. Nothing is faked: a platform that
   cannot take the post returns {ok:false, error} with the reason.
   ========================================================================== */

const MAX_MEDIA_BYTES = 250 * 1024 * 1024;

async function fetchMedia(fetch, url) {
  if (!/^https:\/\//.test(url || '')) throw new Error('media_url must be an https URL');
  const r = await fetch(url);
  if (!r.ok) throw new Error('could not download media: HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_MEDIA_BYTES) throw new Error('media is larger than 250 MB');
  return { buf, type: r.headers.get('content-type') || 'application/octet-stream' };
}

function isVideo(v) { return /^video\//.test(v.media_type || '') || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(v.media_url || ''); }

function withTags(caption, tags, cap) {
  const t = (tags || []).map(x => '#' + String(x).replace(/^#/, '').replace(/\s+/g, '')).join(' ');
  const full = t && !caption.includes(t) ? caption + '\n\n' + t : caption;
  return full.length > cap ? full.slice(0, cap - 1) + '…' : full;
}

export const PUBLISHERS = {
  async linkedin({ fetch, token, env, v }) {
    const author = 'urn:li:person:' + token.accountId;
    const H = {
      Authorization: 'Bearer ' + token.access,
      'LinkedIn-Version': env.LINKEDIN_VERSION || '202601',
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json'
    };
    const post = {
      author, commentary: withTags(v.caption || '', v.tags, 3000), visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false
    };
    if (v.media_url && !isVideo(v)) {
      const init = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
        method: 'POST', headers: H, body: JSON.stringify({ initializeUploadRequest: { owner: author } })
      });
      if (!init.ok) throw new Error('linkedin image init: HTTP ' + init.status);
      const { value } = await init.json();
      const media = await fetchMedia(fetch, v.media_url);
      const up = await fetch(value.uploadUrl, { method: 'PUT', headers: { Authorization: H.Authorization }, body: media.buf });
      if (!up.ok) throw new Error('linkedin image upload: HTTP ' + up.status);
      post.content = { media: { id: value.image, altText: (v.title || '').slice(0, 120) } };
    }
    const r = await fetch('https://api.linkedin.com/rest/posts', { method: 'POST', headers: H, body: JSON.stringify(post) });
    if (r.status !== 201 && !r.ok) throw new Error('linkedin post: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const id = r.headers.get('x-restli-id') || '';
    return { ok: true, id, url: id ? 'https://www.linkedin.com/feed/update/' + id : '' };
  },

  async x({ fetch, token, v }) {
    const r = await fetch('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token.access, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: withTags(v.caption || '', v.tags, 280) })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('x post: HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
    return { ok: true, id: j.data && j.data.id, url: j.data ? 'https://x.com/i/web/status/' + j.data.id : '' };
  },

  async youtube({ fetch, token, v }) {
    if (!v.media_url || !isVideo(v)) return { ok: false, error: 'needs_media', note: 'YouTube needs a video file attached.' };
    const media = await fetchMedia(fetch, v.media_url);
    const meta = {
      snippet: { title: (v.title || v.caption || 'Untitled').slice(0, 100), description: withTags(v.caption || '', v.tags, 5000), categoryId: '22' },
      /* 'draft' mode uploads private so you can review it in Studio first */
      status: { privacyStatus: v.mode === 'direct' ? 'public' : 'private', selfDeclaredMadeForKids: false }
    };
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token.access, 'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': media.type, 'X-Upload-Content-Length': String(media.buf.length)
      },
      body: JSON.stringify(meta)
    });
    if (!init.ok) throw new Error('youtube init: HTTP ' + init.status + ' ' + (await init.text()).slice(0, 200));
    const loc = init.headers.get('location');
    const up = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': media.type }, body: media.buf });
    const j = await up.json().catch(() => ({}));
    if (!up.ok) throw new Error('youtube upload: HTTP ' + up.status);
    return {
      ok: true, id: j.id, url: j.id ? 'https://youtu.be/' + j.id : '',
      note: 'Apps that have not passed Google’s API audit have uploads locked to private.'
    };
  },

  async instagram({ fetch, token, v, sleep }) {
    const igId = token.accountId || token.userId;
    const base = 'https://graph.instagram.com/v21.0/';
    const call = async (path, params, method = 'POST') => {
      const q = new URLSearchParams({ ...params, access_token: token.access });
      const r = await fetch(base + path + (method === 'GET' ? '?' + q : ''), method === 'GET' ? {} : {
        method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q.toString()
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error('instagram ' + path + ': ' + ((j.error && j.error.message) || 'HTTP ' + r.status));
      return j;
    };
    let container = v.container_id;
    if (!container) {
      if (!v.media_url) return { ok: false, error: 'needs_media', note: 'Instagram needs a photo or video attached.' };
      const params = { caption: withTags(v.caption || '', v.tags, 2200) };
      if (isVideo(v)) { params.media_type = 'REELS'; params.video_url = v.media_url; } else { params.image_url = v.media_url; }
      container = (await call(igId + '/media', params)).id;
    }
    /* videos are transcoded by Instagram before they can be published */
    for (let i = 0; i < 8; i++) {
      const s = await call(container, { fields: 'status_code' }, 'GET');
      if (s.status_code === 'FINISHED' || !s.status_code) break;
      if (s.status_code === 'ERROR') throw new Error('instagram could not process the media');
      if (i === 7) return { ok: false, error: 'processing', container_id: container,
        note: 'Instagram is still processing the video. Publish again in a minute to finish.' };
      await sleep(2000);
    }
    const pub = await call(igId + '/media_publish', { creation_id: container });
    return { ok: true, id: pub.id };
  },

  async tiktok({ fetch, token, v }) {
    if (!v.media_url || !isVideo(v)) return { ok: false, error: 'needs_media', note: 'TikTok needs a video attached.' };
    const media = await fetchMedia(fetch, v.media_url);
    if (media.buf.length > 64 * 1024 * 1024) return { ok: false, error: 'too_large', note: 'Keep TikTok uploads under 64 MB.' };
    const direct = v.mode === 'direct';
    const body = {
      source_info: { source: 'FILE_UPLOAD', video_size: media.buf.length, chunk_size: media.buf.length, total_chunk_count: 1 }
    };
    /* unaudited apps may only post SELF_ONLY; inbox drafts sidestep that */
    if (direct) body.post_info = { title: withTags(v.caption || '', v.tags, 2200), privacy_level: 'SELF_ONLY' };
    const init = await fetch('https://open.tiktokapis.com/v2/post/publish/' + (direct ? 'video' : 'inbox/video') + '/init/', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token.access, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(body)
    });
    const j = await init.json().catch(() => ({}));
    if (!init.ok || (j.error && j.error.code !== 'ok')) throw new Error('tiktok init: ' + ((j.error && j.error.message) || init.status));
    const up = await fetch(j.data.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': media.type, 'Content-Range': `bytes 0-${media.buf.length - 1}/${media.buf.length}` },
      body: media.buf
    });
    if (!up.ok) throw new Error('tiktok upload: HTTP ' + up.status);
    return {
      ok: true, id: j.data.publish_id,
      note: direct ? 'Posted as private until TikTok audits the app.' : 'Sent to your TikTok inbox. Open TikTok to finish and post.'
    };
  }
};
