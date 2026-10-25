/* env - the server's settings, read from environment variables.

   index.js (Firebase Cloud Functions) reads the same settings through
   defineSecret/defineString. On Netlify there is no Secret Manager, so
   everything is a plain environment variable set in the Netlify UI
   (Site configuration > Environment variables). Unset keys switch the
   matching feature off instead of breaking the server, same as before.

   Netlify passes environment variables to functions through AWS Lambda,
   which caps them at 4 KB in total. The Firebase private key is most of
   that, so only set the keys you actually use. */

const MODEL_DEFAULT = 'claude-sonnet-5-5';
const MEAL_MODEL_DEFAULT = 'claude-haiku-4-5-20251001';

function str(env, k, d) {
  const v = env[k];
  return v == null || v === '' ? (d == null ? '' : d) : String(v);
}

/* the public address of the api: API_BASE if set, else the site's own
   URL + /api. Netlify sets URL to the site's main address; Vercel sets
   VERCEL_PROJECT_PRODUCTION_URL to it without the https:// */
function baseOf(env) {
  const vercel = str(env, 'VERCEL_PROJECT_PRODUCTION_URL').replace(/^https?:\/\//, '');
  const site = str(env, 'URL') || (vercel ? 'https://' + vercel : '');
  const b = str(env, 'API_BASE') || (site ? site.replace(/\/+$/, '') + '/api' : '');
  return b.replace(/\/+$/, '');
}

function fromEnv(env) {
  env = env || process.env;
  const model = str(env, 'KOVA_MODEL', MODEL_DEFAULT);
  return {
    base: baseOf(env),
    anthropicKey: str(env, 'ANTHROPIC_API_KEY'),
    googleId: str(env, 'GOOGLE_CLIENT_ID'),
    googleSecret: str(env, 'GOOGLE_CLIENT_SECRET'),
    resendKey: str(env, 'RESEND_API_KEY'),
    mailFrom: str(env, 'MAIL_FROM', 'Kova <onboarding@resend.dev>'),
    igId: str(env, 'INSTAGRAM_APP_ID'),
    igSecret: str(env, 'INSTAGRAM_APP_SECRET'),
    igVersion: str(env, 'INSTAGRAM_GRAPH_VERSION', 'v23.0'),
    tiktokKey: str(env, 'TIKTOK_CLIENT_KEY'),
    tiktokSecret: str(env, 'TIKTOK_CLIENT_SECRET'),
    linkedinId: str(env, 'LINKEDIN_CLIENT_ID'),
    linkedinSecret: str(env, 'LINKEDIN_CLIENT_SECRET'),
    linkedinVersion: str(env, 'LINKEDIN_VERSION', '202603'),
    xId: str(env, 'X_CLIENT_ID'),
    xSecret: str(env, 'X_CLIENT_SECRET'),
    fbId: str(env, 'FACEBOOK_APP_ID'),
    fbSecret: str(env, 'FACEBOOK_APP_SECRET'),
    fbVersion: str(env, 'FACEBOOK_GRAPH_VERSION', 'v23.0'),
    threadsId: str(env, 'THREADS_APP_ID'),
    threadsSecret: str(env, 'THREADS_APP_SECRET'),
    pinId: str(env, 'PINTEREST_APP_ID'),
    pinSecret: str(env, 'PINTEREST_APP_SECRET'),
    redditId: str(env, 'REDDIT_CLIENT_ID'),
    redditSecret: str(env, 'REDDIT_CLIENT_SECRET'),
    tumblrId: str(env, 'TUMBLR_CLIENT_ID'),
    tumblrSecret: str(env, 'TUMBLR_CLIENT_SECRET'),
    fdcKey: str(env, 'FDC_API_KEY', 'DEMO_KEY'),
    /* Coach me's natural voice (ElevenLabs, p41); Rachel by default */
    elevenKey: str(env, 'ELEVENLABS_API_KEY'),
    elevenVoice: str(env, 'ELEVENLABS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM'),
    elevenModel: str(env, 'ELEVENLABS_MODEL', 'eleven_multilingual_v2'),
    model,
    agentModel: str(env, 'KOVA_AGENT_MODEL', model),
    mealModel: str(env, 'KOVA_MEAL_MODEL', MEAL_MODEL_DEFAULT),
    agentBudgetUsd: +(str(env, 'KOVA_AGENT_BUDGET_USD', '0.4')),
    /* Netlify functions cannot start the Agent SDK's own process, so the
       audit runs as a plain tool-use loop there (agent.js viaApi) */
    agentMode: str(env, 'KOVA_AGENT_MODE', 'api'),
    /* signs media links; falls back to a hash of the Firebase key so a
       fresh site works without one more variable */
    mediaSecret: str(env, 'KOVA_MEDIA_SECRET') || require('crypto').createHash('sha256')
      .update('kova-media:' + str(env, 'FIREBASE_PRIVATE_KEY', 'dev')).digest('hex'),
    /* payments: RevenueCat (billing.js). Unset = billing off, all open */
    rcSecret: str(env, 'REVENUECAT_SECRET_KEY'),
    rcWebhookAuth: str(env, 'REVENUECAT_WEBHOOK_AUTH'),
    rcEntitlement: str(env, 'KOVA_PRO_ENTITLEMENT', 'kova_pro'),
    chatDaily: +(str(env, 'KOVA_CHAT_DAILY', '150')),
    chatGlobalDaily: +(str(env, 'KOVA_GLOBAL_DAILY_LIMIT', '5000')),
    has: capabilities(env)
  };
}

/* which keys are set: yes or no only, never a value. /ping returns this
   for the app's hidden Launch check (Settings > tap Version 7 times). */
function capabilities(env) {
  env = env || process.env;
  const both = (a, b) => !!(str(env, a) && str(env, b));
  let admin = false; try { admin = !!credentialOf(env); } catch (e) { admin = false; }
  return {
    firebaseAdmin: admin,                        // database, delete, push sending all need it
    ai: !!str(env, 'ANTHROPIC_API_KEY'),
    voice: !!str(env, 'ELEVENLABS_API_KEY'),
    email: !!str(env, 'RESEND_API_KEY'),
    revenuecat: !!str(env, 'REVENUECAT_SECRET_KEY'),
    revenuecatWebhook: !!str(env, 'REVENUECAT_WEBHOOK_AUTH'),
    usda: !!str(env, 'FDC_API_KEY') && str(env, 'FDC_API_KEY') !== 'DEMO_KEY',
    tokenKey: !!str(env, 'KOVA_TOKEN_KEY'),
    /* where photos and videos live: Netlify Blobs on Netlify, Supabase
       Storage on Vercel */
    supabase: !!(str(env, 'SUPABASE_URL') && (str(env, 'SUPABASE_SECRET_KEY') || str(env, 'SUPABASE_SERVICE_ROLE_KEY'))),
    timer: !!str(env, 'CRON_SECRET'),
    host: str(env, 'VERCEL') ? 'vercel' : (str(env, 'NETLIFY') || str(env, 'URL')) ? 'netlify' : '',
    oauth: {
      google: both('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'),
      instagram: both('INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'),
      facebook: both('FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'),
      threads: both('THREADS_APP_ID', 'THREADS_APP_SECRET'),
      tiktok: both('TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'),
      linkedin: both('LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'),
      x: both('X_CLIENT_ID', 'X_CLIENT_SECRET'),
      pinterest: both('PINTEREST_APP_ID', 'PINTEREST_APP_SECRET'),
      reddit: both('REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'),
      tumblr: both('TUMBLR_CLIENT_ID', 'TUMBLR_CLIENT_SECRET')
    }
  };
}

/* Firebase Admin outside Google Cloud needs a service account. Either
   the three pieces (recommended - it fits the 4 KB limit) or the whole
   JSON, raw or base64, in FIREBASE_SERVICE_ACCOUNT. */
function credentialOf(env) {
  let sa = null;
  const whole = str(env, 'FIREBASE_SERVICE_ACCOUNT');
  if (whole) {
    const txt = whole.trim().startsWith('{') ? whole : Buffer.from(whole, 'base64').toString('utf8');
    sa = JSON.parse(txt);
  } else if (str(env, 'FIREBASE_PRIVATE_KEY') && str(env, 'FIREBASE_CLIENT_EMAIL')) {
    sa = { project_id: str(env, 'FIREBASE_PROJECT_ID', 'kova-ee9d5'),
           client_email: str(env, 'FIREBASE_CLIENT_EMAIL'),
           private_key: str(env, 'FIREBASE_PRIVATE_KEY') };
  }
  if (sa && sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  return sa;
}

let ready = false;
function initAdmin(admin, env) {
  env = env || process.env;
  if (ready || (admin.apps && admin.apps.length)) { ready = true; return admin; }
  const sa = credentialOf(env);
  const opts = { databaseURL: str(env, 'FIREBASE_DATABASE_URL', 'https://kova-ee9d5-default-rtdb.firebaseio.com') };
  if (sa) {
    opts.credential = admin.credential.cert(sa);
    opts.projectId = sa.project_id;
  }
  admin.initializeApp(opts);
  require('./seal').configure(env);
  ready = true;
  return admin;
}

/* what is missing, for /ping and the setup checklist */
function missing(env) {
  env = env || process.env;
  const out = [];
  if (!credentialOf(env)) out.push('FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY');
  if (!str(env, 'ANTHROPIC_API_KEY')) out.push('ANTHROPIC_API_KEY (optional: AI features use on-device fallbacks without it)');
  return out;
}

module.exports = { fromEnv, initAdmin, credentialOf, missing, baseOf, capabilities, MODEL_DEFAULT, MEAL_MODEL_DEFAULT };
