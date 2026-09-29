# Kova

One HTML file (the app) plus a small server, both on **Netlify's free plan**, with sign-in, the
database and push notifications on **Firebase's free Spark plan**. Nothing here needs a credit card.

- `index.html` - the whole app. Built from `index.html` plus the modules in `src/`
  (`python3 src/inject_p07.py index.html` puts them in; edit the module, not the copy inside the page).
- `functions/` - the server: every `/api` route, publishing, the wellness agent, reminders, payments.
- `netlify/functions/` - three small files that run `functions/` on Netlify.
- `privacy.html` - the privacy policy (also shown inside the app).
- `build/site.mjs` - `npm run build` writes `dist/`, the folder Netlify publishes: the same page
  minified (about 480 KB compressed instead of 880 KB), the AI team and Traction split into files that
  load after the first screen, and only the files the site serves (server code and tests are not public).
- `native/` - the iPhone and Android app (Capacitor). See `native/README.md`.

Why not Firebase Cloud Functions: since 2020 they need the paid Blaze plan, and since February 2026
so does Firebase Storage. Blaze has a free tier but needs a card and has no spending cap. Netlify's free
plan stops (the site pauses until next month) instead of charging, so there is never a surprise bill.

---

## What actually runs the backend

Everything in the app persists through a small set of `localStorage` keys. That is the real
storage boundary, so the sync layer sits **there** rather than inside each pillar. One
interception point means Fuel, Workout, Sleep, Vitals, Work OS and Studio all sync at once,
and there is no second copy of any value to drift out of step.

| Module | What it does |
|---|---|
| `KovaCloud` | Mirrors all 21 tracked storage keys to Realtime Database under `users/{uid}/store`. Offline-first. |
| `KovaMedia` | Files (form-check video, food photos, machine scans, avatars, docs) to `/api/media/upload` in 3 MB parts, kept in Netlify Blobs. Wired at 5 capture points. |
| `KovaAnalytics` | One `track()` into both Firebase Analytics and gtag. |
| `KovaCloudAuth` | Email/password, Google, anonymous guest, password reset. |

**Ordering matters:** writes go to `localStorage` first and always succeed; the cloud copy is
best-effort and catches up. A failed network call can never lose a logged set or a logged meal.

**Conflicts** are last-write-wins *per key*, using a timestamp stored beside the value. Per key
rather than per field, because these keys hold independent documents — the food log does not
overlap the sleep history. A field-level merge would be inventing precision we cannot honour.

---

## Deploy

### 1. Firebase (free Spark plan) - do this first

The security rules are the only thing protecting the data. **Until they are deployed the database
is world-readable**, regardless of what the app code does.

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only database
```

Then in the [Firebase console](https://console.firebase.google.com/project/kova-ee9d5):

- **Authentication > Sign-in method**: enable **Email/Password**, **Google** and **Anonymous**.
- **Authentication > Settings > Authorized domains**: add your Netlify address (and any custom domain).
- **Project settings > Service accounts > Generate new private key**: this downloads a JSON file. The
  server needs two things from it (step 2). Keep the file private; never commit it.
- **Project settings > Cloud Messaging > Web Push certificates > Generate key pair**: paste the key into
  `KOVA_FB_VAPID` near the top of `index.html` (it is public). Without it, reminders on the website only
  show while Kova is open.

### 2. Netlify (free plan)

1. **Add new site > Import from Git**, pick this repo. `netlify.toml` sets everything; there is no build step.
2. **Site configuration > Environment variables** - add these (only the first two are required):

| Variable | Needed for | Where it comes from |
|---|---|---|
| `FIREBASE_CLIENT_EMAIL` | **Required.** Everything signed in | `client_email` in the service-account JSON |
| `FIREBASE_PRIVATE_KEY` | **Required.** Everything signed in | `private_key` in the service-account JSON (paste it whole, `\n`s included) |
| `KOVA_TOKEN_KEY` | Recommended. Encrypts connected-account tokens | 32 random bytes: `openssl rand -base64 32`. Set once, never change |
| `ANTHROPIC_API_KEY` | Chat, AI team, Studio writing, wellness audits | console.anthropic.com. Without it those use the on-device fallbacks |
| `RESEND_API_KEY` / `MAIL_FROM` | Email sign-in codes | resend.com; `MAIL_FROM` on a domain verified there |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Calendar, YouTube, Gmail | Google Cloud console > Credentials |
| `FDC_API_KEY` | Food search (USDA) | api.data.gov (default `DEMO_KEY` is rate-limited) |
| `REVENUECAT_SECRET_KEY` | Payments. Unset = every feature open | RevenueCat > Project settings > API keys (secret) |
| `REVENUECAT_WEBHOOK_AUTH` | Payments: instant updates | Any long random value; paste the same into RevenueCat > Integrations > Webhooks > Authorization |
| `KOVA_PRO_ENTITLEMENT` | Payments | Default `kova_pro` |
| `INSTAGRAM_APP_ID` / `_SECRET`, `FACEBOOK_APP_ID` / `_SECRET`, `THREADS_APP_ID` / `_SECRET`, `TIKTOK_CLIENT_KEY` / `_SECRET`, `LINKEDIN_CLIENT_ID` / `_SECRET`, `X_CLIENT_ID` / `_SECRET`, `PINTEREST_APP_ID` / `_SECRET`, `REDDIT_CLIENT_ID` / `_SECRET`, `TUMBLR_CLIENT_ID` / `_SECRET` | Publishing to each platform | Each platform's developer console (see Publishing below) |
| `API_BASE` | Only with a custom domain | Defaults to the site address + `/api` |
| `KOVA_MODEL`, `KOVA_AGENT_MODEL`, `KOVA_AGENT_BUDGET_USD`, `KOVA_CHAT_DAILY`, `KOVA_GLOBAL_DAILY_LIMIT` | Tuning | Defaults: `claude-sonnet-5`, same, `0.4`, `150`, `5000` |
| `KOVA_MEDIA_SECRET` | Optional | Signs file links; derived from the Firebase key if unset |

Netlify passes these to functions through AWS Lambda, which caps them at **4 KB in total**. The
Firebase private key is about 1.7 KB of that, so leave out the platforms you do not use yet.

3. **Deploys cost credits.** The free plan has 300 credits a month; each production deploy uses 15,
   so about 20 deploys a month. Batch changes into one push. Deploy previews and branch deploys are free.
4. Check it: `https://YOUR-SITE.netlify.app/api/ping` returns `{"ok":true}`.
5. For the iPhone/Android app, put the site address in `KOVA_SITE` near the top of `index.html`.

What runs where on Netlify:

| File | What it does |
|---|---|
| `netlify/functions/api.mjs` | `/api/*`: every route in `functions/api.js` (60 s per request, 6 MB per request) |
| `netlify/functions/worker-background.mjs` | Long jobs, up to 15 min: publishing to each platform, wellness audits, reading traction back |
| `netlify/functions/cron.mjs` | Every 5 minutes: scheduled posts, push reminders, who is due an audit; traction every 30 |

### 3. GitHub

`.github/workflows/deploy.yml` runs every test on each push and deploys the Firebase rules on merges
to `main`. For the rules step add a repo secret `FIREBASE_TOKEN` (from `firebase login:ci`). Without it
the rules job skips rather than failing.

---

## Tests

```bash
npm install
node tests/syntax.js       # every inline script parses
node tests/backend.js      # sync layer against a stubbed Firebase
node tests/files.js        # deploy files present, rules not wide open
node tests/integration.js  # analytics + settings actually wired
node tests/media.js        # capture points upload, failures degrade honestly
node tests/efficiency.js   # sleep efficiency card
node tests/chat.js         # chat: real model, guest session, offline fallback
node tests/link.js         # page -> api function: ID tokens, health sync, real sign-in
node tests/api.js          # every api route against a fake Firebase
node tests/publish.js      # publishing to each platform
node tests/platforms.js    # platform rules and limits
node tests/studio.js       # Work OS studio, tours, account folders
node tests/agent.js        # wellness agent, seven metrics, cycle-aware limits
node tests/traction.js     # traction, hashtags, assistant email
node tests/workout.js      # sport weeks: swimming, hiking, cycling, running
node tests/micros.js       # vitamins and minerals, USDA search
node tests/session.js      # supersets and live heart rate
node tests/native.js       # iPhone / Android app bridge
node tests/onekova.js      # one orb: chat and the agent in one panel
node tests/crew.js         # AI employees: jobs, tools, approvals, routines
node tests/help.js         # help: tour or find anything
node tests/listen.js       # call an employee by name, fill-ins, tours
node tests/netlify.js      # the server on Netlify: auth on every route, files, delete, push, billing, sealing
node tests/privacy.js      # export, delete (server first), privacy policy, analytics without health data
node tests/push.js         # reminders with the app closed: asked in context, synced, deep links
node tests/billing.js      # RevenueCat checkout, restore, manage, 402 -> paywall
node tests/build.js        # src/ rebuilds index.html exactly
node tests/quick.js        # two-tap meal logging: photo, chips, estimate range
node tests/firstrun.js     # three questions, first win, funnel events, week-box pop-ups with sources
node tests/recap.js        # weekly recap card and share
node tests/glp1.js         # GLP-1 mode: protein floor, doses, side effects
node tests/import.js       # MyFitnessPal, Strong, Hevy, Apple Health imports
node tests/lift.js         # last/target sets, plate maths, exercise demos
node tests/labs.js         # lab results from PDF or photo, confirm before saving
node tests/recipes.js      # the 350 recipes load and add up
node tests/blocks.js       # Work OS time blocks and Google Calendar both ways
node tests/alarm.js        # smart alarm: light-sleep window, fallback, grogginess log
node tests/a11y.js         # every control named, every field labelled, keyboard, focus, motion
node tests/site.js         # the built page: minified, under 500 KB, AI team after first screen
```

Or all of them: `npm test`.

The iPhone and Android app lives in `native/` - see `native/README.md`.
USDA food search uses a free api.data.gov key: `FDC_API_KEY` in `functions/.env`
(the default `DEMO_KEY` works but is rate-limited).

`tests/backend.js` asserts behaviour, not presence — it writes a real lift-history entry and
checks it reaches the fake database, then checks a newer remote value lands locally and an
older one does not. That is deliberate: the previous Firebase block was *present* and entirely
*unwired* (`saveHealthData()` had exactly one occurrence in the file — its own definition).

---

## The server (`functions/`)

The same code runs on Netlify (the default, free) and on Firebase Cloud Functions (`functions/index.js`,
if you ever move to the Blaze plan). Routes are listed at the top of `functions/api.js`.

| Module | What it does |
|---|---|
| `api.js` | Every route. Callers are identified by a Firebase ID token; `/ping`, the OAuth callback, the Health sync address and the RevenueCat webhook are the only routes without one. |
| `chat.js` | `POST /chat` - the assistant. Grounds every reply in `knowledge.js` plus that person's data. |
| `account.js` | `GET /account/export`, `POST /account/delete` - everything about a person, out or gone. |
| `media.js` | Files on Netlify Blobs in 3 MB parts, signed links, byte ranges. |
| `push.js` | Device tokens, the reminder list, the 5-minute send in each person's time zone and quiet hours. |
| `billing.js` | Kova Pro from RevenueCat; 402 on the routes that cost money, once payments are set up. |
| `seal.js` | Connected-account tokens are encrypted (AES-256-GCM) before they reach the database. |
| `providers.js`, `publish.js`, `traction.js`, `ads.js`, `card.js` | Linking accounts and publishing to 16 destinations. |
| `agent.js`, `wellness.js` | The wellness audits, three times a day. |
| `netlify.js`, `env.js` | Running all of it on Netlify, and reading its settings. |

Tokens, codes and OAuth secrets live under `srv/` in the database, which the rules deny to every client.

### Google sign-in for Calendar and YouTube

Google Cloud console > APIs & Services, project `kova-ee9d5`:
- Enable **Google Calendar API** and **YouTube Data API v3**.
- Credentials > OAuth client ID > Web application. Authorized redirect URI:
  `https://YOUR-SITE.netlify.app/api/oauth/callback`
- While the consent screen is in *Testing*, only listed test users (up to 100) can link.

### Publishing (Work OS Studio)

The Studio (`Work OS -> Studio`) sends one post to any of 16 destinations, schedules it, or sends
platform drafts (TikTok inbox, private YouTube upload, Tumblr drafts). Connecting happens on the
platform's own sign-in page, which returns you to Kova; nothing opens in a popup.

**Your redirect address** (paste it wherever a platform asks for one):
`https://YOUR-SITE.netlify.app/api/oauth/callback`

| Destination | Where to make the app | ID -> `functions/.env` | Secret -> `firebase functions:secrets:set` |
|---|---|---|---|
| YouTube + Google Business Profile | Google Cloud console, OAuth client (Web); enable YouTube Data API v3 and request Business Profile API access | `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_SECRET` |
| Facebook Page + **Meta Ads library** + Instagram | developers.facebook.com, one Business app: Facebook Login for Business, Marketing API, Instagram API with Instagram Login | `FACEBOOK_APP_ID`, `INSTAGRAM_APP_ID` | `FACEBOOK_APP_SECRET`, `INSTAGRAM_APP_SECRET` |
| Threads | developers.facebook.com, app with the Threads use case | `THREADS_APP_ID` | `THREADS_APP_SECRET` |
| TikTok | developers.tiktok.com, Login Kit + Content Posting API | `TIKTOK_CLIENT_KEY` | `TIKTOK_CLIENT_SECRET` |
| LinkedIn | linkedin.com/developers, Share on LinkedIn + Sign In with OpenID Connect | `LINKEDIN_CLIENT_ID` | `LINKEDIN_CLIENT_SECRET` |
| X | developer.x.com, OAuth 2.0 Web App | `X_CLIENT_ID` | `X_CLIENT_SECRET` |
| Pinterest | developers.pinterest.com, Connect app | `PINTEREST_APP_ID` | `PINTEREST_APP_SECRET` |
| Reddit | reddit.com/prefs/apps, type "web app" | `REDDIT_CLIENT_ID` | `REDDIT_CLIENT_SECRET` |
| Tumblr | tumblr.com/oauth/apps | `TUMBLR_CLIENT_ID` | `TUMBLR_CLIENT_SECRET` |
| Bluesky, Discord, Telegram, Mastodon | nothing to register: each person connects with a form in the Studio (app password, channel webhook, bot token, server name) | - | - |

Answer `unset` for any secret you are not using yet; that destination then says "needs setup".

**Meta Ads (`functions/ads.js`).** Tick "Meta Ads", open **Settings -> ads** (Ad setup) and pick:

- **Build the ads** (default): Kova creates, all **switched off** (PAUSED): one campaign with your goal
  (Sales on your pixel's Purchase event, Traffic, or Awareness) -> one ad set (or one per file) with your
  **daily budget**, countries and Advantage+ audience -> **one ad per photo or clip**, each already holding
  its primary text (your Primary text), headline (your Heading), description (your Caption), button
  (Shop now, Order now...) and your shop link. Photos are cropped to the shape you chose; videos keep
  theirs and each ad is named with its shape (9:16, 4:5...). Meta's automatic text and crop "enhancements"
  are asked off so the ads stay as you made them. Open Ads Manager, check, switch the campaign on.
- **Just add the files**: they only go into the ad account's media library.

Kova waits for Meta to finish processing each video before building the ad that uses it; if that takes
longer than one run, the post comes back by itself four minutes later and carries on - every id is saved
as it arrives, so nothing is built twice. The ad account, the Page the ads run as, and the pixel are
chosen in Ad setup (`GET/POST /ads/setup`). Permissions on the Meta app: `ads_management`, `ads_read`,
`business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads` - all usable on
your own accounts while the app is in Development mode.

**Post, Reel or Story.** Ticking Instagram, Facebook, YouTube or TikTok asks where it goes:
Instagram Post / Reel / Story (`media_type` REELS or STORIES), Facebook Post / Reel (`/video_reels`,
start-upload-finish) / Story (`/photo_stories`, `/video_stories`), YouTube Video / Short (vertical, 3
minutes or less, tagged #Shorts), TikTok post / inbox draft. What a spot cannot take (two photos in a
Story, a photo as a Reel, a 2-minute Facebook Reel) is said before anything uploads.

**Business or personal.** Facebook lets no app post to a personal profile; Instagram only for
Professional (Business or Creator) accounts; a LinkedIn Company Page needs LinkedIn's approval. Kova
asks once. The kind an app may post for connects normally; the other kind is **handed to you**: the words
are copied, the file is saved (or shared straight into the app on a phone), the app opens, and you tick
it off as posted. "Post it myself for now" does the same for any platform while its setup is pending.

**Traction (`functions/traction.js`).** After a post is live, `tractionWatch` reads it back every 30
minutes: YouTube views, likes, average view duration and percentage, the audience-retention curve,
viewers by age and gender, views per day and comments (needs the `yt-analytics.readonly` scope);
Instagram views, reach, saves, shares, Reels watch time, comments, and the account's engaged audience
by age and gender (`instagram_business_manage_insights`, `instagram_business_manage_comments`);
Facebook reactions, comments, shares, video views, watch time and retention (`read_insights`,
`pages_read_user_content`); TikTok counts (`video.list` - TikTok gives apps nothing else). New comments
pop up in the app; **What should I fix?** sends the numbers and the comments to the model, which answers
with the trend, what to keep, what to fix, new angles and what the comments are about - in business mode
(buying intent, objections) or creator mode.

**Business card (`functions/card.js`).** One "for business inquiries" card: email, phone, website,
booking link, one-line bio. It updates the Facebook Page's contact fields (`pages_manage_metadata`) and
a block in the YouTube channel description (`youtube.force-ssl`); the rest of the description is left
alone. Instagram, TikTok, X, LinkedIn, Threads and Pinterest let no app edit a profile, so the Studio
copies the card and opens that app's edit page.

Instagram, Facebook video, Threads, Pinterest, Google Business Profile and Meta Ads videos fetch media
through short-lived signed Storage links, which needs the **Service Account Token Creator** role
(same as email sign-in). Until each platform reviews the app, it works for your own accounts and listed
testers; YouTube keeps uploads private and TikTok posts only as private until audited.

### The wellness agent (`functions/agent.js`, `functions/wellness.js`)

Built on the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`, the Node build of
`claude-agent-sdk`). Three times a day, in the person's own time zone, it audits seven metrics from what
the app already syncs - **Vitals & workout**: resting heart rate, HRV, training load; **Sleep**: sleep
duration and debt, bedtime consistency; **Fuel**: protein and calories, hydration - in a fixed order,
through its own read-only tools (`read_vitals_workout`, `read_sleep`, `read_fuel`), records a finding for
each (`record_finding` refuses them out of order), and raises alerts (`raise_alert`) with what is wrong in
numbers, one exact action, and when: **morning**, **evening** or **night**. It has no built-in tools at all
(no shell, files or web), `permissionMode: 'dontAsk'`, a 30-turn cap and a $0.40 budget per run
(`KOVA_AGENT_BUDGET_USD`). Alerts land in `users/{uid}/agent`; the app listens and shows them as a
pop-up and as **Your plan** (Morning / Evening / Night). If the SDK or the model is unavailable the same
audit runs on plain rules, and in the app the same rules (`wellness.js`, embedded) run on-device until the
server is live. Each watch sync also keeps one row per day (`srv/healthDays`) so trends are real.

Cost: roughly 2-6 cents per audit with the default model, three a day per person who has it on.

### What still cannot be done in code

- **Posting for everyone, not just you:** every platform reviews an app before it may post for other
  people (Meta App Review, TikTok audit, Google verification). Until then it works for your own accounts
  and listed testers.
- **TikTok comments, watch time and audience; Facebook audience:** not given to apps. Kova says so on the
  Traction screen instead of guessing.
- **Editing Instagram, TikTok, X, LinkedIn, Threads or Pinterest profiles:** no API. Copy and open instead.
- **Comment pop-ups within seconds:** they arrive within 30 minutes (polling). Instant webhooks need each
  platform's app review first.
- **Drive and Gmail:** restricted Google scopes; they need Google's security assessment. Left out.
- **Sign in with Apple:** needs an Apple Developer account (Services ID + key), then enable Apple in
  Firebase Authentication. Until then the button reports it is not switched on.
- **Push notifications:** not wired (needs a VAPID key and `firebase-messaging-sw.js`).

## Media

`KovaMedia.attach()` is what the capture points call. Three rules it holds to, because an
upload must never break the feature it belongs to:

- **It never blocks.** Form-check analysis, machine ident and meal reading all run locally on
  the object URL and are done before the upload starts.
- **Failure is reported once and degrades honestly** — "saved on this device" rather than a
  silent no-op. Being offline in a gym is the normal case, not the exception.
- **Successful uploads are indexed in `KP.media`**, which rides the sync layer, so the list of
  your clips reaches your other devices.

Wired at: form-check video, meal photo, machine scan, profile avatar, workspace documents.

Two things this fixed on the way through: the profile avatar was being stored as a base64 data
URL inside a synced key (a megabyte-plus re-uploaded on every unrelated profile edit, and
invisible on any other device); and workspace files stored only a *name* — the file itself was
never kept anywhere, so the tree entry survived a refresh while the thing it pointed at did not.

## Known limits

- **Push notifications** are not wired. `firebase-messaging` was in the old script list but
  nothing used it. It needs a `firebase-messaging-sw.js`, a VAPID key, and a permission prompt
  with an actual reason to show it. Left out rather than half-built.
- **Barcode lookup** hits Open Food Facts directly from the client. It works, but it is
  unauthenticated and rate-limited; if it gets heavy use it belongs behind a Worker.
- **The web API key in `index.html` is not a secret.** It identifies the project; it authorises
  nothing. The rules files are what protect the data.
