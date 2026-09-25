/* ==========================================================================
   OAuth provider table.

   Every provider the app links to is described here once: where to send the
   user, how to swap the code for tokens, how to refresh, and how to find out
   whose account it is. The router is generic over this table, so adding a
   provider is a table row, not a new code path.

   A provider is "configured" when its client id + secret env vars are set.
   Unconfigured providers report configured:false from /status, and the app
   says so instead of opening a login page that would fail.
   ========================================================================== */

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

async function jsonOrThrow(r, what) {
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* not json */ }
  if (!r.ok) throw new Error(`${what} failed: HTTP ${r.status} ${text.slice(0, 200)}`);
  return j ?? {};
}

async function getJSON(fetch, url, token, headers = {}) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token, ...headers } });
  return jsonOrThrow(r, 'GET ' + url.split('?')[0]);
}

export const PROVIDERS = {
  /* ---------------- calendar / signals ---------------- */
  google: {
    name: 'Google Calendar', kind: 'calendar', env: 'GOOGLE',
    authUrl: GOOGLE_AUTH, tokenUrl: GOOGLE_TOKEN,
    scopes: ['openid', 'email', 'https://www.googleapis.com/auth/calendar.readonly'],
    authParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    apiBase: 'https://www.googleapis.com',
    async profile(fetch, t) {
      const j = await getJSON(fetch, 'https://openidconnect.googleapis.com/v1/userinfo', t.access);
      return { label: j.email || 'Google', accountId: j.sub };
    }
  },

  /* ---------------- publishing ---------------- */
  youtube: {
    name: 'YouTube', kind: 'social', env: 'GOOGLE',
    authUrl: GOOGLE_AUTH, tokenUrl: GOOGLE_TOKEN,
    scopes: ['openid', 'email',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly'],
    authParams: { access_type: 'offline', prompt: 'consent' },
    apiBase: 'https://www.googleapis.com',
    async profile(fetch, t) {
      const j = await getJSON(fetch, 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', t.access);
      const ch = j.items && j.items[0];
      return { label: ch ? ch.snippet.title : 'YouTube', accountId: ch ? ch.id : '' };
    }
  },

  linkedin: {
    name: 'LinkedIn', kind: 'social', env: 'LINKEDIN',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    /* w_member_social comes with the self-serve "Share on LinkedIn" product:
       posting to your own profile needs no partner approval. Company pages
       (w_organization_social) do. */
    scopes: ['openid', 'profile', 'email', 'w_member_social'],
    apiBase: 'https://api.linkedin.com',
    async profile(fetch, t) {
      const j = await getJSON(fetch, 'https://api.linkedin.com/v2/userinfo', t.access);
      return { label: j.name || j.email || 'LinkedIn', accountId: j.sub };
    }
  },

  x: {
    name: 'X', kind: 'social', env: 'X',
    authUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    pkce: true, tokenAuth: 'basic',
    apiBase: 'https://api.x.com',
    async profile(fetch, t) {
      const j = await getJSON(fetch, 'https://api.x.com/2/users/me', t.access);
      return { label: j.data ? '@' + j.data.username : 'X', accountId: j.data && j.data.id };
    }
  },

  tiktok: {
    name: 'TikTok', kind: 'social', env: 'TIKTOK',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    clientIdParam: 'client_key', clientSecretParam: 'client_secret',
    scopes: ['user.info.basic', 'video.upload', 'video.publish'], scopeSep: ',',
    apiBase: 'https://open.tiktokapis.com',
    async profile(fetch, t) {
      const j = await getJSON(fetch, 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', t.access);
      const u = j.data && j.data.user;
      return { label: (u && u.display_name) || 'TikTok', accountId: u && u.open_id };
    }
  },

  instagram: {
    name: 'Instagram', kind: 'social', env: 'INSTAGRAM',
    /* "Instagram API with Instagram Login" - needs a Business or Creator
       account, but no Facebook Page. */
    authUrl: 'https://www.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    scopes: ['instagram_business_basic', 'instagram_business_content_publish',
      'instagram_business_manage_comments'], scopeSep: ',',
    apiBase: 'https://graph.instagram.com',
    /* the code exchange returns a 1-hour token; swap it for the 60-day one */
    async afterExchange(fetch, t, env) {
      const u = 'https://graph.instagram.com/access_token?grant_type=ig_exchange_token'
        + '&client_secret=' + encodeURIComponent(env.INSTAGRAM_CLIENT_SECRET)
        + '&access_token=' + encodeURIComponent(t.access);
      const j = await jsonOrThrow(await fetch(u), 'instagram long-lived exchange');
      return { ...t, access: j.access_token, exp: Date.now() + (j.expires_in || 5184000) * 1000 };
    },
    /* Instagram has no refresh_token; a still-valid long-lived token is
       refreshed by trading it in. */
    async refresh(fetch, t) {
      const u = 'https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token'
        + '&access_token=' + encodeURIComponent(t.access);
      const j = await jsonOrThrow(await fetch(u), 'instagram refresh');
      return { ...t, access: j.access_token, exp: Date.now() + (j.expires_in || 5184000) * 1000 };
    },
    async profile(fetch, t) {
      const j = await getJSON(fetch, 'https://graph.instagram.com/v21.0/me?fields=user_id,username', t.access);
      return { label: j.username ? '@' + j.username : 'Instagram', accountId: j.user_id || j.id };
    }
  },

  /* ---------------- wearables ---------------- */
  oura: {
    name: 'Oura', kind: 'wearable', env: 'OURA',
    authUrl: 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: 'https://api.ouraring.com/oauth/token',
    scopes: ['email', 'personal', 'daily', 'heartrate', 'workout', 'session', 'spo2Daily'],
    apiBase: 'https://api.ouraring.com',
    async profile(fetch, t) {
      const j = await getJSON(fetch, 'https://api.ouraring.com/v2/usercollection/personal_info', t.access);
      return { label: j.email || 'Oura ring', accountId: j.id };
    }
  },

  fitbit: {
    name: 'Fitbit', kind: 'wearable', env: 'FITBIT',
    authUrl: 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: 'https://api.fitbit.com/oauth2/token',
    scopes: ['activity', 'heartrate', 'sleep', 'profile', 'oxygen_saturation',
      'respiratory_rate', 'temperature', 'weight', 'cardio_fitness'],
    pkce: true, tokenAuth: 'basic',
    apiBase: 'https://api.fitbit.com',
    async profile(fetch, t) {
      const j = await getJSON(fetch, 'https://api.fitbit.com/1/user/-/profile.json', t.access);
      return { label: (j.user && j.user.displayName) || 'Fitbit', accountId: j.user && j.user.encodedId };
    }
  },

  whoop: {
    name: 'WHOOP', kind: 'wearable', env: 'WHOOP',
    authUrl: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: 'https://api.prod.whoop.com/oauth/oauth2/token',
    scopes: ['offline', 'read:recovery', 'read:cycles', 'read:sleep', 'read:workout',
      'read:profile', 'read:body_measurement'],
    apiBase: 'https://api.prod.whoop.com/developer',
    async profile(fetch, t) {
      const j = await getJSON(fetch, 'https://api.prod.whoop.com/developer/v2/user/profile/basic', t.access);
      return { label: [j.first_name, j.last_name].filter(Boolean).join(' ') || 'WHOOP', accountId: j.user_id };
    }
  },

  withings: {
    name: 'Withings', kind: 'wearable', env: 'WITHINGS',
    authUrl: 'https://account.withings.com/oauth2_user/authorize2',
    tokenUrl: 'https://wbsapi.withings.net/v2/oauth2',
    scopes: ['user.info', 'user.metrics', 'user.activity'], scopeSep: ',',
    tokenExtra: { action: 'requesttoken' },
    /* Withings wraps every response as {status, body}; status 0 is success */
    unwrapToken(j) {
      if (!j || j.status !== 0 || !j.body) throw new Error('withings token failed: status ' + (j && j.status));
      return j.body;
    },
    apiBase: 'https://wbsapi.withings.net',
    async profile() { return { label: 'Withings', accountId: '' }; }
  }
};

export function isConfigured(p, env) {
  const P = PROVIDERS[p];
  return !!(P && env[P.env + '_CLIENT_ID'] && env[P.env + '_CLIENT_SECRET']);
}

export function redirectUri(origin, p) { return origin + '/api/callback/' + p; }

export function authorizeUrl(p, env, origin, state, codeChallenge) {
  const P = PROVIDERS[p];
  const q = new URLSearchParams({
    response_type: 'code',
    [P.clientIdParam || 'client_id']: env[P.env + '_CLIENT_ID'],
    redirect_uri: redirectUri(origin, p),
    scope: P.scopes.join(P.scopeSep || ' '),
    state,
    ...(P.authParams || {})
  });
  if (P.pkce && codeChallenge) {
    q.set('code_challenge', codeChallenge);
    q.set('code_challenge_method', 'S256');
  }
  return P.authUrl + '?' + q.toString();
}

async function tokenRequest(fetch, p, env, params) {
  const P = PROVIDERS[p];
  const id = env[P.env + '_CLIENT_ID'], secret = env[P.env + '_CLIENT_SECRET'];
  const body = new URLSearchParams({ ...(P.tokenExtra || {}), ...params });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (P.tokenAuth === 'basic') {
    headers.Authorization = 'Basic ' + Buffer.from(id + ':' + secret).toString('base64');
    body.set('client_id', id);
  } else {
    body.set(P.clientIdParam || 'client_id', id);
    body.set(P.clientSecretParam || 'client_secret', secret);
  }
  const r = await fetch(P.tokenUrl, { method: 'POST', headers, body: body.toString() });
  let j = await jsonOrThrow(r, p + ' token');
  if (P.unwrapToken) j = P.unwrapToken(j);
  if (j.error) throw new Error(p + ' token error: ' + (j.error_description || j.error));
  return j;
}

function toRecord(j, prev = {}) {
  return {
    access: j.access_token,
    refresh: j.refresh_token || prev.refresh || null,
    exp: j.expires_in ? Date.now() + Number(j.expires_in) * 1000 : (prev.exp || null),
    scope: j.scope || prev.scope || '',
    /* provider-specific ids some APIs hand back at exchange time */
    userId: j.user_id || j.userid || j.open_id || prev.userId || null
  };
}

export async function exchangeCode(fetch, p, env, origin, code, verifier) {
  const P = PROVIDERS[p];
  const params = { grant_type: 'authorization_code', code, redirect_uri: redirectUri(origin, p) };
  if (P.pkce && verifier) params.code_verifier = verifier;
  let t = toRecord(await tokenRequest(fetch, p, env, params));
  if (P.afterExchange) t = await P.afterExchange(fetch, t, env);
  return t;
}

export async function refreshToken(fetch, p, env, t) {
  const P = PROVIDERS[p];
  if (P.refresh) return P.refresh(fetch, t, env);
  if (!t.refresh) throw new Error('no refresh token; reconnect ' + p);
  return toRecord(await tokenRequest(fetch, p, env,
    { grant_type: 'refresh_token', refresh_token: t.refresh }), t);
}
