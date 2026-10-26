/* kovaChat - the server half of Kova's chat.

   Why this exists at all: the app is a static page on Netlify. An API
   key placed in that page is readable by anyone who opens dev tools, and
   would be abused within days. So the page never talks to the model; it
   talks to this function, which holds the key in Secret Manager and
   checks who is asking first.

   Deploy:
     firebase functions:secrets:set ANTHROPIC_API_KEY
     firebase deploy --only functions
   Cloud Functions that call external APIs need the Blaze (pay-as-you-go)
   plan. */

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onValueCreated } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const chat = require('./chat');
const api = require('./api');
const seal = require('./seal');
const { makeOAuth } = require('./providers');
const { makePublisher, moveDue } = require('./publish');
const { makeAgent, due } = require('./agent');
const { makeTraction } = require('./traction');

admin.initializeApp();
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
/* Optional keys. Answer "unset" at the deploy prompt if you do not have
   one yet; the matching feature reports "not configured" instead of
   failing the whole deploy. */
const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET');
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const GOOGLE_CLIENT_ID = defineString('GOOGLE_CLIENT_ID', { default: '' });
const MAIL_FROM = defineString('MAIL_FROM', { default: 'Kova <onboarding@resend.dev>' });
const API_BASE = defineString('API_BASE', { default: 'https://us-central1-kova-ee9d5.cloudfunctions.net/api' });

/* Publishing accounts. Each platform needs its own developer app; the
   README lists what to create and where. Same rule as above: "unset"
   switches that platform off instead of breaking the deploy. */
const INSTAGRAM_APP_SECRET = defineSecret('INSTAGRAM_APP_SECRET');
const TIKTOK_CLIENT_SECRET = defineSecret('TIKTOK_CLIENT_SECRET');
const LINKEDIN_CLIENT_SECRET = defineSecret('LINKEDIN_CLIENT_SECRET');
const X_CLIENT_SECRET = defineSecret('X_CLIENT_SECRET');
const INSTAGRAM_APP_ID = defineString('INSTAGRAM_APP_ID', { default: '' });
const TIKTOK_CLIENT_KEY = defineString('TIKTOK_CLIENT_KEY', { default: '' });
const LINKEDIN_CLIENT_ID = defineString('LINKEDIN_CLIENT_ID', { default: '' });
const X_CLIENT_ID = defineString('X_CLIENT_ID', { default: '' });
/* LinkedIn's REST API is versioned by month and each version lives about
   a year; Instagram's Graph API by release. Bump these when they retire. */
const FACEBOOK_APP_SECRET = defineSecret('FACEBOOK_APP_SECRET');
const THREADS_APP_SECRET = defineSecret('THREADS_APP_SECRET');
const PINTEREST_APP_SECRET = defineSecret('PINTEREST_APP_SECRET');
const REDDIT_CLIENT_SECRET = defineSecret('REDDIT_CLIENT_SECRET');
const TUMBLR_CLIENT_SECRET = defineSecret('TUMBLR_CLIENT_SECRET');
const FACEBOOK_APP_ID = defineString('FACEBOOK_APP_ID', { default: '' });
const THREADS_APP_ID = defineString('THREADS_APP_ID', { default: '' });
const PINTEREST_APP_ID = defineString('PINTEREST_APP_ID', { default: '' });
const REDDIT_CLIENT_ID = defineString('REDDIT_CLIENT_ID', { default: '' });
const TUMBLR_CLIENT_ID = defineString('TUMBLR_CLIENT_ID', { default: '' });
const FACEBOOK_GRAPH_VERSION = defineString('FACEBOOK_GRAPH_VERSION', { default: 'v23.0' });
const FDC_API_KEY = defineString('FDC_API_KEY', { default: 'DEMO_KEY' });
const LINKEDIN_VERSION = defineString('LINKEDIN_VERSION', { default: '202603' });
const INSTAGRAM_GRAPH_VERSION = defineString('INSTAGRAM_GRAPH_VERSION', { default: 'v23.0' });

const PROVIDER_SECRETS = [GOOGLE_CLIENT_SECRET, INSTAGRAM_APP_SECRET, TIKTOK_CLIENT_SECRET,
                          LINKEDIN_CLIENT_SECRET, X_CLIENT_SECRET, FACEBOOK_APP_SECRET, THREADS_APP_SECRET,
                          PINTEREST_APP_SECRET, REDDIT_CLIENT_SECRET, TUMBLR_CLIENT_SECRET];

/* one place that turns params into the config every module takes */
function cfg() {
  return {
    base: API_BASE.value().replace(/\/+$/, ''),
    anthropicKey: ANTHROPIC_API_KEY.value(),
    googleId: GOOGLE_CLIENT_ID.value(),
    googleSecret: GOOGLE_CLIENT_SECRET.value(),
    resendKey: RESEND_API_KEY.value(),
    mailFrom: MAIL_FROM.value(),
    igId: INSTAGRAM_APP_ID.value(),
    igSecret: INSTAGRAM_APP_SECRET.value(),
    igVersion: INSTAGRAM_GRAPH_VERSION.value(),
    tiktokKey: TIKTOK_CLIENT_KEY.value(),
    tiktokSecret: TIKTOK_CLIENT_SECRET.value(),
    linkedinId: LINKEDIN_CLIENT_ID.value(),
    linkedinSecret: LINKEDIN_CLIENT_SECRET.value(),
    linkedinVersion: LINKEDIN_VERSION.value(),
    xId: X_CLIENT_ID.value(),
    xSecret: X_CLIENT_SECRET.value(),
    fbId: FACEBOOK_APP_ID.value(),
    fbSecret: FACEBOOK_APP_SECRET.value(),
    fbVersion: FACEBOOK_GRAPH_VERSION.value(),
    threadsId: THREADS_APP_ID.value(),
    threadsSecret: THREADS_APP_SECRET.value(),
    pinId: PINTEREST_APP_ID.value(),
    pinSecret: PINTEREST_APP_SECRET.value(),
    redditId: REDDIT_CLIENT_ID.value(),
    redditSecret: REDDIT_CLIENT_SECRET.value(),
    tumblrId: TUMBLR_CLIENT_ID.value(),
    tumblrSecret: TUMBLR_CLIENT_SECRET.value(),
    fdcKey: FDC_API_KEY.value(),
    model: MODEL,
    agentModel: process.env.KOVA_AGENT_MODEL || MODEL,
    agentBudgetUsd: +(process.env.KOVA_AGENT_BUDGET_USD || 0.4),
    rcSecret: process.env.REVENUECAT_SECRET_KEY || '',
    rcWebhookAuth: process.env.REVENUECAT_WEBHOOK_AUTH || '',
    rcEntitlement: process.env.KOVA_PRO_ENTITLEMENT || 'kova_pro',
    chatDaily: DAILY_LIMIT,
    chatGlobalDaily: GLOBAL_DAILY_LIMIT,
    mediaSecret: ''
  };
}

const MODEL = process.env.KOVA_MODEL || 'claude-sonnet-5-5';
const DAILY_LIMIT = 150;         // messages per user per day
/* Guest (anonymous) accounts are free to create, so a per-user limit
   alone does not bound spend. This caps the whole project per day. */
const GLOBAL_DAILY_LIMIT = +(process.env.KOVA_GLOBAL_DAILY_LIMIT || 5000);

/* The old callable, kept so builds already installed on phones keep
   working. New builds call POST /chat on the api (chat.js does both). */
exports.kovaChat = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: 'us-central1', timeoutSeconds: 60, memory: '256MiB' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to use chat.');
    try {
      return await chat.answer({ db: admin.database(), cfg: cfg(), uid: req.auth.uid, body: req.data });
    } catch (e) {
      if (e instanceof chat.ChatError) throw new HttpsError(e.code, e.message);
      throw e;
    }
  }
);

/* Everything else the page talks to: health sync, OAuth, email codes,
   inbound comments, the Work OS engine, publishing. See api.js for the
   routes. */
exports.api = onRequest(
  { secrets: [ANTHROPIC_API_KEY, RESEND_API_KEY].concat(PROVIDER_SECRETS),
    region: 'us-central1', timeoutSeconds: 60, memory: '256MiB', cors: false },
  (req, res) => api.handle(req, res, cfg())
);

/* The actual publishing. /publish drops a job at srv/queue/{uid}/{postId};
   this picks it up with a long timeout, because moving a video to four
   platforms can take minutes. Results are written per platform as they
   land, so the Studio shows each one finish rather than waiting on all. */
exports.publishWorker = onValueCreated(
  { ref: '/srv/queue/{uid}/{postId}', region: 'us-central1',
    timeoutSeconds: 540, memory: '1GiB', secrets: PROVIDER_SECRETS },
  async (event) => {
    const { uid, postId } = event.params;
    const c = cfg();
    const db = seal.database(admin.database());
    const tokens = makeOAuth({ db, cfg: c });
    const pub = makePublisher({ db, bucket: admin.storage().bucket(), cfg: c, tokens });
    try {
      await pub.run(uid, postId);
    } finally {
      await db.ref(`srv/queue/${uid}/${postId}`).remove();
    }
  }
);

/* Scheduled posts: every five minutes, anything due moves into the queue
   above. The post record itself is untouched until the worker runs it. */
exports.publishDue = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-central1', timeoutSeconds: 120 },
  async () => { await moveDue(admin.database(), Date.now()); }
);

/* The wellness agent (agent.js, on the Claude Agent SDK). Every half hour
   this finds who is due a morning, evening or night audit in their own
   time zone and queues them; the worker below runs each audit on its own,
   one person at a time. "Check now" in the app queues one the same way. */
exports.wellnessDue = onSchedule(
  { schedule: 'every 30 minutes', region: 'us-central1', timeoutSeconds: 120 },
  async () => {
    const db = seal.database(admin.database());
    const t = Date.now();
    for (const j of await due(db, t)) {
      await db.ref(`srv/agentQueue/${j.uid}`).set({ window: j.window, at: t, why: 'schedule' });
    }
  }
);
exports.wellnessWorker = onValueCreated(
  { ref: '/srv/agentQueue/{uid}', region: 'us-central1',
    timeoutSeconds: 300, memory: '1GiB', secrets: [ANTHROPIC_API_KEY] },
  async (event) => {
    const { uid } = event.params;
    const job = event.data.val() || {};
    const db = seal.database(admin.database());
    try {
      const c = cfg();
      const push = require('./push').makePush({ db, messaging: admin.messaging(), cfg: c });
      await makeAgent({ db, cfg: c, push }).run(uid, { window: job.window });
    } finally {
      await db.ref(`srv/agentQueue/${uid}`).remove();
    }
  }
);

/* Traction: every half hour, read recently published posts back from each
   platform - numbers, drop-off, audience, comments. New comments become
   the "someone said this about your video" pop-ups in the app. */
exports.tractionWatch = onSchedule(
  { schedule: 'every 30 minutes', region: 'us-central1', timeoutSeconds: 300, memory: '512MiB', secrets: PROVIDER_SECRETS },
  async () => {
    const db = seal.database(admin.database());
    const c = cfg();
    const users = Object.keys((await db.ref('srv/posts').once('value')).val() || {});
    const tr = makeTraction({ db, cfg: c, tokens: makeOAuth({ db, cfg: c }) });
    for (const uid of users) {
      try { await tr.collect(uid); } catch (e) { console.error('traction', uid, e.message); }
    }
  }
);
