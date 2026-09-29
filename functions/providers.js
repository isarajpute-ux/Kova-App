/* Linking accounts: every platform Kova can post to.

   Three ways in, because the platforms differ:
     oauth     the platform's own sign-in page, then back to Kova
               (Google/YouTube, Google Business Profile, Facebook Pages,
               Instagram, Threads, TikTok, LinkedIn, X, Pinterest,
               Reddit, Tumblr)
     instance  OAuth against the server the person names (Mastodon);
               Kova registers itself with that server on first use
     form      the person pastes something their platform gives them:
               a Bluesky app password, a Discord webhook, a Telegram bot

   The small, load-bearing differences live in the table below - TikTok
   calls the client id "client_key", X wants PKCE, Pinterest and Reddit
   want HTTP Basic auth, Instagram and Threads hand back one-hour tokens
   that must be swapped for 60-day ones, Facebook posts with a Page token
   rather than the person's own, LinkedIn usually gives no refresh token.

   Tokens are stored server-side only, under srv/oauth/{uid}/{provider}:
     { access_token, refresh_token, expires_at, scope, label, extra }
   `extra` carries the ids publishing needs (account ids, Page tokens,
   the chosen board / Page / location). */

const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

/* A secret set to "unset" (what the deploy prompt gets when you do not
   have that key yet) means the feature is off, and the route says so. */
function configured(v) {
  return typeof v === 'string' && v.length > 8 && v !== 'unset';
}

const form = { 'content-type': 'application/x-www-form-urlencoded' };
const basic = (id, secret) => 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
const enc = encodeURIComponent;
const FOREVER = 10 * 365 * 86400;            // seconds - tokens that do not expire
const REDDIT_UA = 'web:app.kova.studio:1.0 (by /u/kova_app)';

function defs(cfg) {
  const fbv = cfg.fbVersion || 'v23.0';
  const googleOk = configured(cfg.googleSecret) && !!cfg.googleId;
  return {
    google: {
      name: 'Google', kind: 'oauth', ok: googleOk,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      idParam: 'client_id', clientId: cfg.googleId, clientSecret: cfg.googleSecret,
      scope: [
        'openid', 'email',
        // two-way: Work OS blocks become events and moved events come back (calendar.js)
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/youtube.upload',
        // Traction: watch time, drop-off and who is watching; the business card on the channel
        'https://www.googleapis.com/auth/yt-analytics.readonly',
        'https://www.googleapis.com/auth/youtube.force-ssl',
        // the agent's "do it for me": drafts (and, once approved, sends) email
        'https://www.googleapis.com/auth/gmail.compose'
      ].join(' '),
      extra: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
      api: 'https://www.googleapis.com',
      // /call is a proxy, so it is fenced to the APIs Kova actually uses
      paths: [/^\/calendar\/v3\//, /^\/youtube\/v3\//, /^\/oauth2\/v3\/userinfo/],
      async profile(fetch, tok) {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } });
        const j = await r.json().catch(() => ({}));
        return { label: j.email || '', extra: {} };
      },
      async revoke(fetch, t) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${enc(t.refresh_token || t.access_token)}`, { method: 'POST' });
      }
    },

    /* Google Business Profile - the "listing". Same Google client as
       above, its own consent, so Calendar users are not asked for it. */
    gbusiness: {
      name: 'Google Business Profile', kind: 'oauth', ok: googleOk,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      idParam: 'client_id', clientId: cfg.googleId, clientSecret: cfg.googleSecret,
      scope: 'openid email https://www.googleapis.com/auth/business.manage',
      extra: { access_type: 'offline', prompt: 'consent' },
      async profile(fetch, tok) {
        const A = { authorization: `Bearer ${tok.access_token}` };
        const ar = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { headers: A });
        const aj = await ar.json().catch(() => ({}));
        const locations = [];
        for (const a of (aj.accounts || []).slice(0, 5)) {
          const lr = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title&pageSize=100`, { headers: A });
          const lj = await lr.json().catch(() => ({}));
          (lj.locations || []).forEach((l) => locations.push({ id: l.name, name: l.title || l.name, account: a.name }));
        }
        const first = locations[0];
        return { label: first ? first.name : '', extra: { locations, target: first ? first.id : '' } };
      },
      async revoke(fetch, t) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${enc(t.refresh_token || t.access_token)}`, { method: 'POST' });
      }
    },

    /* Facebook Pages. The person signs in; Kova keeps a Page token for
       each Page they manage (Page tokens made from a long-lived user
       token do not expire) and posts as the chosen Page. */
    facebook: {
      name: 'Facebook', kind: 'oauth',
      ok: configured(cfg.fbSecret) && !!cfg.fbId,
      authUrl: `https://www.facebook.com/${fbv}/dialog/oauth`,
      idParam: 'client_id', clientId: cfg.fbId, clientSecret: cfg.fbSecret,
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,read_insights,pages_read_user_content,pages_manage_metadata',
      extra: {},
      async exchange(fetch, code, redirect, p) {
        const G = `https://graph.facebook.com/${fbv}`;
        const q = new URLSearchParams({ client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: redirect, code });
        const r = await fetch(`${G}/oauth/access_token?${q}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.access_token) return null;
        const q2 = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: p.clientId, client_secret: p.clientSecret, fb_exchange_token: j.access_token });
        const r2 = await fetch(`${G}/oauth/access_token?${q2}`);
        const j2 = await r2.json().catch(() => ({}));
        const user = j2.access_token || j.access_token;
        const pr = await fetch(`${G}/me/accounts?fields=id,name,access_token&limit=100&access_token=${enc(user)}`);
        const pj = await pr.json().catch(() => ({}));
        const pages = (pj.data || []).map((x) => ({ id: x.id, name: x.name, token: x.access_token }));
        if (!pages.length) throw new HttpError(409, 'That Facebook account manages no Pages. Kova posts to a Page - create one, or ask to be made an admin of one.');
        return { access_token: user, refresh_token: '', expires_in: FOREVER, scope: p.scope,
                 extra: { pages, target: pages[0].id }, label: pages[0].name };
      },
      async profile(fetch, tok) { return { label: tok.label || '', extra: {} }; },
      async revoke(fetch, t) {
        await fetch(`https://graph.facebook.com/${fbv}/me/permissions?access_token=${enc(t.access_token)}`, { method: 'DELETE' });
      }
    },

    /* Meta Ads. The photos and videos go to the ad account's library, or
       Kova builds a paused campaign -> ad set -> ads from them (ads.js).
       Same Meta app as Facebook Pages, its own consent (ads_management,
       plus reading which Pages the ads can run as). Everything is made
       switched off - nothing spends until it is switched on in Ads
       Manager. */
    metaads: {
      name: 'Meta Ads', kind: 'oauth',
      ok: configured(cfg.fbSecret) && !!cfg.fbId,
      authUrl: `https://www.facebook.com/${fbv}/dialog/oauth`,
      idParam: 'client_id', clientId: cfg.fbId, clientSecret: cfg.fbSecret,
      scope: 'ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,pages_manage_ads',
      extra: {},
      async exchange(fetch, code, redirect, p) {
        const G = `https://graph.facebook.com/${fbv}`;
        const q = new URLSearchParams({ client_id: p.clientId, client_secret: p.clientSecret, redirect_uri: redirect, code });
        const r = await fetch(`${G}/oauth/access_token?${q}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.access_token) return null;
        const q2 = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: p.clientId, client_secret: p.clientSecret, fb_exchange_token: j.access_token });
        const r2 = await fetch(`${G}/oauth/access_token?${q2}`);
        const j2 = await r2.json().catch(() => ({}));
        const user = j2.access_token || j.access_token;
        const ar = await fetch(`${G}/me/adaccounts?fields=id,name,account_status&limit=100&access_token=${enc(user)}`);
        const aj = await ar.json().catch(() => ({}));
        const accounts = (aj.data || []).filter((a) => a.account_status === 1 || a.account_status === undefined)
          .map((a) => ({ id: a.id, name: a.name || a.id }));
        if (!accounts.length) throw new HttpError(409, 'That Facebook login has no active ad accounts. Open Ads Manager once to create one, then connect again.');
        // the Pages the ads can run as (no Page tokens are kept here)
        const pr = await fetch(`${G}/me/accounts?fields=id,name&limit=100&access_token=${enc(user)}`);
        const pages = ((await pr.json().catch(() => ({}))).data || []).map((x) => ({ id: x.id, name: x.name }));
        // user tokens last about 60 days; Meta gives no refresh token, so it asks again then
        return { access_token: user, refresh_token: '', expires_in: j2.expires_in || 5184000, scope: p.scope,
                 extra: { accounts, target: accounts[0].id, pages, page: pages[0] ? pages[0].id : '' }, label: accounts[0].name };
      },
      async profile(fetch, tok) { return { label: tok.label || '', extra: {} }; }
    },

    /* Instagram API with Instagram Login - works with a Professional
       (Business or Creator) account, no Facebook Page needed. */
    instagram: {
      name: 'Instagram', kind: 'oauth',
      ok: configured(cfg.igSecret) && !!cfg.igId,
      authUrl: 'https://www.instagram.com/oauth/authorize',
      tokenUrl: 'https://api.instagram.com/oauth/access_token',
      idParam: 'client_id', clientId: cfg.igId, clientSecret: cfg.igSecret,
      scope: 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights,instagram_business_manage_comments',
      extra: { enable_fb_login: '0', force_authentication: '1' },
      /* the code buys a one-hour token; swap it for the 60-day one */
      async afterExchange(fetch, j, p) {
        const short = (j.data && j.data[0]) || j;
        const r = await fetch('https://graph.instagram.com/access_token?grant_type=ig_exchange_token'
          + `&client_secret=${enc(p.clientSecret)}&access_token=${enc(short.access_token)}`);
        const long = await r.json().catch(() => ({}));
        if (!r.ok || !long.access_token) throw new HttpError(502, 'Instagram did not issue a long-lived token.');
        return { access_token: long.access_token, expires_in: long.expires_in || 5184000, refresh_token: '',
                 scope: short.permissions || '', extra: { igId: String(short.user_id || '') } };
      },
      /* long-lived tokens refresh themselves in place, no refresh token */
      async refresh(fetch, t) {
        const r = await fetch('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token'
          + `&access_token=${enc(t.access_token)}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.access_token) return null;
        return { access_token: j.access_token, expires_in: j.expires_in || 5184000 };
      },
      refreshEarly: 10 * 864e5,
      async profile(fetch, tok) {
        const r = await fetch(`https://graph.instagram.com/${cfg.igVersion}/me?fields=user_id,username&access_token=${enc(tok.access_token)}`);
        const j = await r.json().catch(() => ({}));
        return { label: j.username ? '@' + j.username : '', extra: { igId: String(j.user_id || j.id || (tok.extra && tok.extra.igId) || '') } };
      }
    },

    /* Threads API - same short-then-long token dance as Instagram */
    threads: {
      name: 'Threads', kind: 'oauth',
      ok: configured(cfg.threadsSecret) && !!cfg.threadsId,
      authUrl: 'https://threads.net/oauth/authorize',
      tokenUrl: 'https://graph.threads.net/oauth/access_token',
      idParam: 'client_id', clientId: cfg.threadsId, clientSecret: cfg.threadsSecret,
      scope: 'threads_basic,threads_content_publish',
      extra: {},
      async afterExchange(fetch, j, p) {
        const r = await fetch('https://graph.threads.net/access_token?grant_type=th_exchange_token'
          + `&client_secret=${enc(p.clientSecret)}&access_token=${enc(j.access_token)}`);
        const long = await r.json().catch(() => ({}));
        if (!r.ok || !long.access_token) throw new HttpError(502, 'Threads did not issue a long-lived token.');
        return { access_token: long.access_token, expires_in: long.expires_in || 5184000, refresh_token: '',
                 scope: p.scope, extra: { userId: String(j.user_id || '') } };
      },
      async refresh(fetch, t) {
        const r = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${enc(t.access_token)}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.access_token) return null;
        return { access_token: j.access_token, expires_in: j.expires_in || 5184000 };
      },
      refreshEarly: 10 * 864e5,
      async profile(fetch, tok) {
        const r = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${enc(tok.access_token)}`);
        const j = await r.json().catch(() => ({}));
        return { label: j.username ? '@' + j.username : '', extra: { userId: String(j.id || (tok.extra && tok.extra.userId) || '') } };
      }
    },

    tiktok: {
      name: 'TikTok', kind: 'oauth',
      ok: configured(cfg.tiktokSecret) && !!cfg.tiktokKey,
      authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
      tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
      idParam: 'client_key', clientId: cfg.tiktokKey, clientSecret: cfg.tiktokSecret,
      scope: 'user.info.basic,video.upload,video.publish,video.list',
      extra: {},
      async profile(fetch, tok) {
        const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username',
          { headers: { authorization: `Bearer ${tok.access_token}` } });
        const j = await r.json().catch(() => ({}));
        const u = (j.data && j.data.user) || {};
        return { label: u.username ? '@' + u.username : (u.display_name || ''), extra: { openId: u.open_id || '' } };
      },
      async revoke(fetch, t, p) {
        await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', { method: 'POST', headers: form,
          body: new URLSearchParams({ client_key: p.clientId, client_secret: p.clientSecret, token: t.access_token }) });
      }
    },

    /* "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect",
       both self-serve products. Posts go to the member's own feed. */
    linkedin: {
      name: 'LinkedIn', kind: 'oauth',
      ok: configured(cfg.linkedinSecret) && !!cfg.linkedinId,
      authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      idParam: 'client_id', clientId: cfg.linkedinId, clientSecret: cfg.linkedinSecret,
      scope: 'openid profile email w_member_social',
      extra: {},
      async profile(fetch, tok) {
        const r = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } });
        const j = await r.json().catch(() => ({}));
        return { label: j.name || j.email || '', extra: { sub: j.sub || '' } };
      },
      async revoke(fetch, t, p) {
        await fetch('https://www.linkedin.com/oauth/v2/revoke', { method: 'POST', headers: form,
          body: new URLSearchParams({ client_id: p.clientId, client_secret: p.clientSecret, token: t.access_token }) });
      }
    },

    x: {
      name: 'X', kind: 'oauth',
      ok: configured(cfg.xSecret) && !!cfg.xId,
      authUrl: 'https://x.com/i/oauth2/authorize',
      tokenUrl: 'https://api.x.com/2/oauth2/token',
      idParam: 'client_id', clientId: cfg.xId, clientSecret: cfg.xSecret,
      scope: 'tweet.read tweet.write users.read media.write offline.access',
      extra: {},
      pkce: true,
      basicAuth: true,
      async profile(fetch, tok) {
        const r = await fetch('https://api.x.com/2/users/me', { headers: { authorization: `Bearer ${tok.access_token}` } });
        const j = await r.json().catch(() => ({}));
        const d = j.data || {};
        return { label: d.username ? '@' + d.username : '', extra: { userId: d.id || '' } };
      },
      async revoke(fetch, t, p) {
        await fetch('https://api.x.com/2/oauth2/revoke', { method: 'POST',
          headers: Object.assign({ authorization: basic(p.clientId, p.clientSecret) }, form),
          body: new URLSearchParams({ token: t.access_token, token_type_hint: 'access_token', client_id: p.clientId }) });
      }
    },

    pinterest: {
      name: 'Pinterest', kind: 'oauth',
      ok: configured(cfg.pinSecret) && !!cfg.pinId,
      authUrl: 'https://www.pinterest.com/oauth/',
      tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
      idParam: 'client_id', clientId: cfg.pinId, clientSecret: cfg.pinSecret,
      scope: 'boards:read,boards:write,pins:read,pins:write,user_accounts:read',
      extra: {},
      basicAuth: true, bodyId: false,
      async profile(fetch, tok) {
        const A = { authorization: `Bearer ${tok.access_token}` };
        const r = await fetch('https://api.pinterest.com/v5/user_account', { headers: A });
        const j = await r.json().catch(() => ({}));
        const br = await fetch('https://api.pinterest.com/v5/boards?page_size=100', { headers: A });
        const bj = await br.json().catch(() => ({}));
        const boards = (bj.items || []).map((b) => ({ id: b.id, name: b.name }));
        return { label: j.username ? '@' + j.username : '', extra: { boards, target: boards[0] ? boards[0].id : '' } };
      }
    },

    reddit: {
      name: 'Reddit', kind: 'oauth',
      ok: configured(cfg.redditSecret) && !!cfg.redditId,
      authUrl: 'https://www.reddit.com/api/v1/authorize',
      tokenUrl: 'https://www.reddit.com/api/v1/access_token',
      idParam: 'client_id', clientId: cfg.redditId, clientSecret: cfg.redditSecret,
      scope: 'identity submit',
      extra: { duration: 'permanent' },
      basicAuth: true, bodyId: false, headers: { 'user-agent': REDDIT_UA },
      async profile(fetch, tok) {
        const r = await fetch('https://oauth.reddit.com/api/v1/me', { headers: { authorization: `Bearer ${tok.access_token}`, 'user-agent': REDDIT_UA } });
        const j = await r.json().catch(() => ({}));
        return { label: j.name ? 'u/' + j.name : '', extra: { name: j.name || '' } };
      },
      async revoke(fetch, t, p) {
        await fetch('https://www.reddit.com/api/v1/revoke_token', { method: 'POST',
          headers: Object.assign({ authorization: basic(p.clientId, p.clientSecret), 'user-agent': REDDIT_UA }, form),
          body: new URLSearchParams({ token: t.refresh_token || t.access_token, token_type_hint: t.refresh_token ? 'refresh_token' : 'access_token' }) });
      }
    },

    tumblr: {
      name: 'Tumblr', kind: 'oauth',
      ok: configured(cfg.tumblrSecret) && !!cfg.tumblrId,
      authUrl: 'https://www.tumblr.com/oauth2/authorize',
      tokenUrl: 'https://api.tumblr.com/v2/oauth2/token',
      idParam: 'client_id', clientId: cfg.tumblrId, clientSecret: cfg.tumblrSecret,
      scope: 'basic write offline_access',
      extra: {},
      async profile(fetch, tok) {
        const r = await fetch('https://api.tumblr.com/v2/user/info', { headers: { authorization: `Bearer ${tok.access_token}` } });
        const j = await r.json().catch(() => ({}));
        const blogs = (((j.response || {}).user || {}).blogs || []).map((b) => ({ id: b.name, name: b.title || b.name, primary: !!b.primary }));
        const main = blogs.filter((b) => b.primary)[0] || blogs[0];
        return { label: main ? main.id : '', extra: { blogs, target: main ? main.id : '' } };
      }
    },

    /* Mastodon: any server. Kova registers itself with the named server
       the first time someone from there connects, and reuses that. */
    mastodon: {
      name: 'Mastodon', kind: 'instance', ok: true,
      scope: 'read write:media write:statuses',
      async profile(fetch, tok) {
        const inst = tok.extra.instance;
        const A = { authorization: `Bearer ${tok.access_token}` };
        const r = await fetch(`https://${inst}/api/v1/accounts/verify_credentials`, { headers: A });
        const j = await r.json().catch(() => ({}));
        let max = 500;
        try {
          const ir = await fetch(`https://${inst}/api/v2/instance`);
          const ij = await ir.json();
          max = (((ij.configuration || {}).statuses || {}).max_characters) || 500;
        } catch (e) { /* 500 is the default */ }
        return { label: j.username ? `@${j.username}@${inst}` : inst, extra: { instance: inst, maxChars: max } };
      }
    },

    /* Bluesky: an app password (Settings -> Privacy and security -> App
       passwords), never the real one. Only the session tokens are kept. */
    bluesky: {
      name: 'Bluesky', kind: 'form', ok: true,
      async link(fetch, fields) {
        const handle = String(fields.handle || '').trim().replace(/^@/, '');
        const password = String(fields.password || '').trim();
        if (!handle || !password) throw new HttpError(400, 'Enter your Bluesky handle and an app password.');
        const r = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ identifier: handle, password })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.accessJwt) throw new HttpError(401, 'Bluesky did not accept that handle and app password.');
        const svc = ((j.didDoc || {}).service || []).filter((s) => /atproto_pds/.test(s.id || '') || s.type === 'AtprotoPersonalDataServer')[0];
        return { access_token: j.accessJwt, refresh_token: j.refreshJwt, expires_in: 6000,
                 label: '@' + (j.handle || handle), extra: { did: j.did, handle: j.handle || handle, pds: (svc && svc.serviceEndpoint) || 'https://bsky.social' } };
      },
      async refresh(fetch, t) {
        const r = await fetch(`${(t.extra && t.extra.pds) || 'https://bsky.social'}/xrpc/com.atproto.server.refreshSession`, {
          method: 'POST', headers: { authorization: `Bearer ${t.refresh_token}` }
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.accessJwt) return null;
        return { access_token: j.accessJwt, refresh_token: j.refreshJwt, expires_in: 6000 };
      }
    },

    /* Discord: a channel webhook (Channel settings -> Integrations). */
    discord: {
      name: 'Discord', kind: 'form', ok: true,
      async link(fetch, fields) {
        const url = String(fields.webhook || '').trim();
        if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) {
          throw new HttpError(400, 'That is not a Discord webhook link. It starts with https://discord.com/api/webhooks/');
        }
        const r = await fetch(url);
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.id) throw new HttpError(400, 'Discord did not recognise that webhook. Copy it again from the channel settings.');
        return { access_token: url, refresh_token: '', expires_in: FOREVER, label: j.name || 'Discord channel',
                 extra: { guild: j.guild_id || '', channel: j.channel_id || '' } };
      }
    },

    /* Telegram: a bot from @BotFather, made an admin of the channel. */
    telegram: {
      name: 'Telegram', kind: 'form', ok: true,
      async link(fetch, fields) {
        const token = String(fields.token || '').trim();
        let chat = String(fields.chat || '').trim().replace(/^https?:\/\/t\.me\//, '@');
        if (!/^\d+:[\w-]{30,}$/.test(token)) throw new HttpError(400, 'That is not a bot token. @BotFather gives one like 123456:ABC...');
        if (!chat) throw new HttpError(400, 'Enter the channel, like @mychannel.');
        if (!/^[@-]/.test(chat) && !/^\d+$/.test(chat)) chat = '@' + chat;
        const B = `https://api.telegram.org/bot${token}`;
        const me = await (await fetch(`${B}/getMe`)).json().catch(() => ({}));
        if (!me.ok) throw new HttpError(400, 'Telegram did not accept that bot token.');
        const c = await (await fetch(`${B}/getChat?chat_id=${enc(chat)}`)).json().catch(() => ({}));
        if (!c.ok) throw new HttpError(400, `The bot cannot see ${chat}. Add @${me.result.username} to the channel first.`);
        const m = await (await fetch(`${B}/getChatMember?chat_id=${enc(chat)}&user_id=${me.result.id}`)).json().catch(() => ({}));
        const role = (m.result || {}).status;
        if (role !== 'administrator' && role !== 'creator') throw new HttpError(400, `Make @${me.result.username} an admin of ${chat} so it can post.`);
        return { access_token: token, refresh_token: '', expires_in: FOREVER, label: c.result.title || chat,
                 extra: { chat: String(c.result.id), username: c.result.username || '', bot: me.result.username } };
      }
    }
  };
}

/* ---------------------------------------------------------------------- */

/* Where the sign-in page sends the person afterwards. Only a real web
   address (or this machine, while developing) - never anything that
   could run code. */
function safeReturn(u) {
  if (typeof u !== 'string' || u.length > 800) return '';
  try {
    const x = new URL(u);
    if (x.protocol === 'https:') return x.toString();
    if (x.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(x.hostname)) return x.toString();
  } catch (e) { /* not a URL */ }
  return '';
}

function makeOAuth({ db, fetch, now, cfg }) {
  const f = fetch || ((...a) => global.fetch(...a));
  const clock = now || Date.now;

  function table() { return defs(cfg); }

  function provider(name) {
    const p = table()[name];
    if (!p) throw new HttpError(404, 'Unknown provider.');
    if (!p.ok) throw new HttpError(503, `${p.name} is not configured on the server yet.`);
    return p;
  }

  const redirect = () => `${cfg.base}/oauth/callback`;

  /* Mastodon: register Kova with that server once, then reuse it */
  async function mastodonApp(inst) {
    const key = inst.replace(/\./g, '_');
    const ref = db.ref(`srv/mastoApps/${key}`);
    const have = (await ref.once('value')).val();
    if (have && have.redirect === redirect()) return have;
    const r = await f(`https://${inst}/api/v1/apps`, { method: 'POST', headers: form,
      body: new URLSearchParams({ client_name: 'Kova', redirect_uris: redirect(), scopes: table().mastodon.scope }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.client_id) throw new HttpError(502, `${inst} did not let Kova register. Check the server name.`);
    const app = { id: j.client_id, secret: j.client_secret, redirect: redirect() };
    await ref.set(app);
    return app;
  }
  function cleanInstance(v) {
    const s = String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^@?[^@]*@/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) throw new HttpError(400, 'Enter your Mastodon server, like mastodon.social.');
    return s;
  }

  /* -> consent URL; the state record holds who asked, where to go back
     to, and the PKCE verifier */
  async function start(uid, name, opts) {
    opts = opts || {};
    const p = provider(name);
    if (p.kind === 'form') throw new HttpError(400, `${p.name} connects with a form, not a sign-in page.`);
    const state = crypto.randomBytes(24).toString('base64url');
    const rec = { uid, provider: name, exp: clock() + 10 * 60e3, ret: safeReturn(opts.ret) };
    if (p.kind === 'instance') {
      const inst = cleanInstance(opts.instance);
      const app = await mastodonApp(inst);
      rec.instance = inst;
      await db.ref(`srv/oauthState/${state}`).set(rec);
      return `https://${inst}/oauth/authorize?${new URLSearchParams({ client_id: app.id, redirect_uri: redirect(), response_type: 'code', scope: p.scope, state })}`;
    }
    const q = { [p.idParam]: p.clientId, redirect_uri: redirect(), response_type: 'code', scope: p.scope, state };
    if (p.pkce) {
      rec.verifier = crypto.randomBytes(48).toString('base64url');
      q.code_challenge = crypto.createHash('sha256').update(rec.verifier).digest('base64url');
      q.code_challenge_method = 'S256';
    }
    await db.ref(`srv/oauthState/${state}`).set(rec);
    return `${p.authUrl}?${new URLSearchParams(Object.assign(q, p.extra))}`;
  }

  async function tokenCall(p, params) {
    const headers = Object.assign({}, form, p.headers || {});
    const body = Object.assign(p.bodyId === false ? {} : { [p.idParam]: p.clientId }, params);
    if (p.basicAuth) headers.authorization = basic(p.clientId, p.clientSecret);
    else body.client_secret = p.clientSecret;
    const r = await f(p.tokenUrl, { method: 'POST', headers, body: new URLSearchParams(body) });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  }

  async function store(uid, name, tok, prof) {
    const ref = db.ref(`srv/oauth/${uid}/${name}`);
    const prev = (await ref.once('value')).val() || {};
    await ref.set({
      access_token: tok.access_token,
      // Google only returns a refresh token on first consent; keep the old one otherwise
      refresh_token: tok.refresh_token || prev.refresh_token || '',
      expires_at: clock() + ((tok.expires_in || 3600) - 60) * 1000,
      scope: tok.scope || '',
      label: prof.label || tok.label || '',
      extra: Object.assign({}, prev.extra || {}, tok.extra || {}, prof.extra || {}),
      linkedAt: clock()
    });
  }

  /* the provider redirected back with ?code&state -> stored tokens */
  async function finish(stateId, code) {
    const sref = db.ref(`srv/oauthState/${String(stateId).slice(0, 64)}`);
    const st = (await sref.once('value')).val();
    await sref.remove();
    if (!st || st.exp < clock()) return { ok: false, why: 'expired' };
    const p = provider(st.provider);
    const out = { provider: st.provider, ret: st.ret || '' };
    try {
      let tok;
      if (p.kind === 'instance') {
        const app = await mastodonApp(st.instance);
        const r = await f(`https://${st.instance}/oauth/token`, { method: 'POST', headers: form,
          body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code), client_id: app.id,
                                      client_secret: app.secret, redirect_uri: redirect(), scope: p.scope }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.access_token) return Object.assign(out, { ok: false, why: 'refused' });
        tok = { access_token: j.access_token, refresh_token: '', expires_in: FOREVER, scope: j.scope || p.scope,
                extra: { instance: st.instance } };
      } else if (p.exchange) {
        tok = await p.exchange(f, String(code), redirect(), p, st);
        if (!tok) return Object.assign(out, { ok: false, why: 'refused' });
      } else {
        const params = { code: String(code), redirect_uri: redirect(), grant_type: 'authorization_code' };
        if (st.verifier) params.code_verifier = st.verifier;
        const { r, j } = await tokenCall(p, params);
        const first = (j.data && j.data[0]) || j;
        if (!r.ok || !first.access_token) {
          console.error('token exchange', st.provider, r.status, JSON.stringify(j).slice(0, 300));
          return Object.assign(out, { ok: false, why: 'refused' });
        }
        tok = { access_token: first.access_token, refresh_token: first.refresh_token || '',
                expires_in: first.expires_in, scope: first.scope || '', extra: {} };
        if (p.afterExchange) tok = await p.afterExchange(f, j, p);
      }
      let prof = { label: '', extra: {} };
      try { prof = await p.profile(f, tok); } catch (e) { /* label is cosmetic */ }
      await store(st.uid, st.provider, tok, prof);
      return Object.assign(out, { ok: true });
    } catch (e) {
      console.error('finish', st.provider, e && e.message);
      return Object.assign(out, { ok: false, why: 'refused', msg: e instanceof HttpError ? e.message : '' });
    }
  }

  /* the form-based ones: Bluesky, Discord, Telegram */
  async function link(uid, name, fields) {
    const p = provider(name);
    if (p.kind !== 'form') throw new HttpError(400, `${p.name} connects through its own sign-in page.`);
    const tok = await p.link(f, fields || {});
    await store(uid, name, tok, { label: tok.label, extra: {} });
    return { ok: true, label: tok.label };
  }

  function linked(t) {
    return !!(t && t.access_token && (t.refresh_token || (t.expires_at || 0) > clock()));
  }

  /* a record with a current access token, refreshed if it needs to be */
  async function get(uid, name) {
    const p = provider(name);
    const ref = db.ref(`srv/oauth/${uid}/${name}`);
    const t = (await ref.once('value')).val();
    if (!linked(t)) throw new HttpError(409, `${p.name} is not connected.`);
    const early = p.refreshEarly || 0;
    if (t.expires_at - early > clock()) return t;

    let fresh = null;
    if (p.refresh) {
      fresh = await p.refresh(f, t);
      // a still-valid token that failed to refresh is still usable
      if (!fresh && t.expires_at > clock()) return t;
    } else if (t.refresh_token && p.tokenUrl) {
      const { r, j } = await tokenCall(p, { refresh_token: t.refresh_token, grant_type: 'refresh_token' });
      if (r.ok && j.access_token) fresh = j;
      else if (j.error === 'invalid_grant') await ref.remove();
    }
    if (!fresh) throw new HttpError(409, `${p.name} needs to be reconnected.`);
    const upd = { access_token: fresh.access_token, expires_at: clock() + ((fresh.expires_in || 3600) - 60) * 1000 };
    if (fresh.refresh_token) upd.refresh_token = fresh.refresh_token;
    await ref.update(upd);
    return Object.assign({}, t, upd);
  }

  /* Page / board / location / blog: the one to post to */
  const PICKS = { facebook: 'pages', metaads: 'accounts', pinterest: 'boards', gbusiness: 'locations', tumblr: 'blogs' };
  async function targets(uid, name) {
    provider(name);
    const list = PICKS[name];
    if (!list) throw new HttpError(404, 'Nothing to choose for that platform.');
    const t = (await db.ref(`srv/oauth/${uid}/${name}`).once('value')).val();
    if (!linked(t)) throw new HttpError(409, 'Connect it first.');
    const x = t.extra || {};
    return { items: (x[list] || []).map((i) => ({ id: i.id, name: i.name })), current: x.target || '' };
  }
  async function setTarget(uid, name, id) {
    const got = await targets(uid, name);
    const pick = got.items.filter((i) => i.id === id)[0];
    if (!pick) throw new HttpError(400, 'That is not one of yours.');
    await db.ref(`srv/oauth/${uid}/${name}`).update({ 'extra/target': id, label: pick.name });
    return { current: id, label: pick.name };
  }

  async function status(uid) {
    const all = (await db.ref(`srv/oauth/${uid}`).once('value')).val() || {};
    const out = {};
    const t = table();
    for (const name of Object.keys(t)) {
      out[name] = { linked: linked(all[name]), label: (all[name] && all[name].label) || '', configured: t[name].ok, kind: t[name].kind };
      if (PICKS[name]) out[name].choose = true;
    }
    // YouTube rides the Google link; the inbox and the publisher ask for it by name
    const g = all.google;
    out.youtube = {
      linked: linked(g) && /youtube/.test((g && g.scope) || ''),
      canUpload: linked(g) && /youtube\.upload/.test((g && g.scope) || ''),
      label: (g && g.label) || '', configured: t.google.ok, kind: 'oauth'
    };
    return out;
  }

  async function disconnect(uid, name) {
    const p = provider(name);
    const ref = db.ref(`srv/oauth/${uid}/${name}`);
    const t = (await ref.once('value')).val();
    if (t && t.access_token && p.revoke) {
      try { await p.revoke(f, t, p); } catch (e) { /* revoking is best-effort */ }
    }
    await ref.remove();
  }

  return { table, provider, start, finish, link, get, targets, setTarget, status, disconnect, linked };
}

module.exports = { makeOAuth, defs, configured, safeReturn, HttpError };
