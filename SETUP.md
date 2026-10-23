# Setting Kova up: every key, and where it goes

Everything below is free to start with, and nothing needs a credit card except the app stores' own developer accounts. Two places hold keys:

- **`index.html`** holds only *public* keys. They identify the app and are safe in a public repo: the Firebase web config, the RevenueCat public SDK keys and the web push (VAPID) key.
- **Your host's environment variables** hold every *secret*: Vercel › Project › Settings › Environment Variables (section 2c), or Netlify › Site configuration › Environment variables. Nothing secret is ever in this repo. Netlify caps all variables together at 4 KB, and the Firebase private key is most of that, so set only what you use.

To see what is still missing, open the app, go to **Settings**, tap **Version** 7 times and read the **Launch check**. It marks each item below green or red and names what to set. It only checks *whether* a key is set; it never shows one.

---

## 1. Firebase (Spark plan: sign-in, database, push)

| What | Where to get it | Where it goes |
|---|---|---|
| Web config (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`…) | Firebase console › Project settings › Your apps › Web app | `window.KOVA_FB_CONFIG` in `index.html`, and the same values in `sw.js`. Already set for project `kova-ee9d5` |
| Database rules | This repo (`database.rules.json`) | `firebase deploy --only database`. **Do this first**: until the rules are deployed, the database is readable by anyone |
| Sign-in methods | Authentication › Sign-in method | Turn on Email/Password, Google, Anonymous. Under Settings › Authorized domains, add your Netlify address |
| Service account (server) | Project settings › Service accounts › Generate new private key (a JSON file; keep it private) | Netlify: `FIREBASE_CLIENT_EMAIL` = `client_email`, `FIREBASE_PRIVATE_KEY` = `private_key` (paste it whole, `\n`s included) |
| Web push key | Project settings › Cloud Messaging › Web Push certificates › Generate key pair | `window.KOVA_FB_VAPID` in `index.html` |
| iPhone push | Add an iOS app › download `GoogleService-Info.plist`; upload your APNs key under Cloud Messaging › Apple app configuration | Drag the plist into `native/ios/App/App` in Xcode (see `native/README.md`) |
| Android push | Add an Android app › download `google-services.json` | `native/android/app/` |

## 2. Netlify (free plan: the site and the server)

1. Add the GitHub repo as a new site. `netlify.toml` already sets the build (`npm run build`), the folder to publish (`dist`), the functions and the `/api` rewrite.
2. Add the environment variables from the tables in this file.
3. Deploy. `https://<your-site>.netlify.app/api/ping` should answer `{"ok":true,...}`.

A production deploy uses about 15 of the 300 monthly credits. When credits run out the site pauses until the next month; it never charges.

## 2b. GitHub Pages (the website, free, from the repo)

GitHub Pages serves the website; the server (`/api`) keeps running on Netlify (section 2), because Pages can only serve files. The workflow (`.github/workflows/deploy.yml`, job **Publish the website on GitHub Pages**) builds and publishes on every push to `main`, once every test has passed.

1. **Settings › Pages › Build and deployment › Source: GitHub Actions.**
2. **Settings › Secrets and variables › Actions › Variables › New repository variable:** `KOVA_API_URL` = your Netlify address plus `/api`, for example `https://kova-app.netlify.app/api`. It is an address, not a secret. Without it the site loads, but sign-in codes, AI, food search and sync have no server.
3. **Firebase › Authentication › Settings › Authorized domains:** add `isarajpute-ux.github.io`.
4. Merge `kova-brief-waves-1-4` into `main` (a pull request). The run publishes to `https://isarajpute-ux.github.io/Kova-App/`, and the address shows on the run.

The site works under `/Kova-App/`: links, the install manifest and the offline cache are all relative, `/privacy` and the other short links still open, and an unknown address goes back to the app.

**A custom domain later:** Settings › Pages › Custom domain, then add the repository variable `PAGES_BASE` = `/` and push again.

**Try it locally:**
```bash
KOVA_API_URL=https://kova-app.netlify.app/api PAGES_BASE=/Kova-App/ npm run build:pages
```
`node tests/e2e/pages.mjs` builds it under `/Kova-App/` in a temporary folder and checks it.

## 2c. Vercel + Supabase (the site and the server in one place)

The same app and the same server as on Netlify, on Vercel's free (Hobby) plan. `vercel.json` sets the build (`npm run build`, folder `dist`), the `/api` rewrite, the headers and a daily timer; `api/index.mjs` and `api/cron.mjs` run the server (`functions/vercel.js`). Photos and videos live in **Supabase Storage** (`functions/supa.js`), because Vercel has no Netlify Blobs. The database and sign-in stay on Firebase.

Vercel's Hobby plan is for personal, non-commercial projects. It is fine while you build and test; before Kova takes payments, move to Vercel Pro ($20 a month) or to Netlify's free plan (section 2), which needs no code change.

**Supabase (files)**
1. supabase.com › New project (any name, the region nearest you, a database password you keep). Leave "Enable automatic RLS" on.
2. Copy the **Project URL** (`https://<id>.supabase.co`): the **Connect** button at the top of the project, or Project Settings › Data API. Then Project Settings › **API Keys** › Secret keys: copy a **secret key** (`sb_secret_...`; "Create new secret key" if there is none). The secret key is a password: it only ever goes into Vercel. The publishable key is not needed.
3. Nothing to paste into the SQL editor: the server makes its own private bucket, `kova-media`, the first time it saves a file.

**Vercel (site and server)**
1. vercel.com › sign in with GitHub › Add New › Project › Import `isarajpute-ux/Kova-App`. Framework preset: **Other**. Leave the build settings alone: `vercel.json` sets them.
2. Before Deploy, open Environment Variables and add:

| Variable | Value |
|---|---|
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | From the Firebase service account (section 1) |
| `ANTHROPIC_API_KEY` | Section 3 |
| `ELEVENLABS_API_KEY` | Section 3b (optional: Coach me's natural voice) |
| `SUPABASE_URL` | The Supabase Project URL |
| `SUPABASE_SECRET_KEY` | The Supabase secret key |
| `CRON_SECRET` | Any long random value (`openssl rand -hex 32`). Vercel's daily timer sends it, and so does the GitHub timer below |
| Anything else from sections 3-6 | Same names as on Netlify |

3. Deploy. `https://<project>.vercel.app/api/ping` should answer `{"ok":true,...}`, with `"supabase":true` under `has`.
4. Settings › Git › Production Branch is `main`. Every push to `main` deploys; other branches get preview addresses, which Vercel keeps behind your Vercel login.
5. Firebase › Authentication › Settings › Authorized domains: add `<project>.vercel.app`.

**The 5-minute timer.** Scheduled posts, reminders, wellness audits and AI-team routines need a timer. Vercel's free plan runs its own only once a day, so `.github/workflows/timer.yml` calls `/api/cron` every 5 minutes (free for a public repo). In GitHub › Settings › Secrets and variables › Actions add the variable `KOVA_SITE_URL` = `https://<project>.vercel.app` and the secret `CRON_SECRET` = the same value as on Vercel. GitHub sometimes starts a run a few minutes late.

**Already on Netlify?** Nothing changes there; `netlify.toml` still works. Use one host for the server at a time so the timer does not run twice (it would not double-post, every job is claimed first, but it is wasted work).

## 2d. Your booking link (no keys)

Work OS › Meetings › **Your booking link** sets up `https://<your site>/book/<name>` (`functions/booking.js`, `book.html`). People see only your free times (your hours, minus Google Calendar when connected, minus your Work OS meetings, minus calls already booked) and book one; it becomes a Work OS meeting and you get a notification. With Google connected (scope `calendar.events`, already requested), the event goes on your calendar with them invited. `vercel.json`, `netlify.toml` and `_redirects` already send `/book/*` to the page.

## 3. AI (Anthropic)

| Variable | Where to get it | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com › API keys | Chat, meal photos, lab reading, the AI team and Studio writing fall back to the on-device guide |
| `KOVA_MODEL`, `KOVA_AGENT_MODEL` | Optional | Default `claude-sonnet-5-5` |
| `KOVA_MEAL_MODEL` | Optional | The model that reads meal photos. Default `claude-haiku-4-5-20251001` (fast: about 2-3 s a plate). A bigger model is a little more accurate and slower. |
| `KOVA_CHAT_DAILY`, `KOVA_GLOBAL_DAILY_LIMIT`, `KOVA_AGENT_BUDGET_USD` | Optional spending caps | Defaults 150 chats per person per day, 5,000 in total, $0.40 per audit |

## 3b. Coach me's natural voice (ElevenLabs, optional)

Coach me (Kova talking you through a workout) speaks each set, the rest and what is next. Without this key it uses the best voice the phone has (on iPhone: Settings › Accessibility › Spoken Content › Voices › English, download an "Enhanced" or "Premium" voice, and Kova picks it). With it, everyone signed in hears a natural ElevenLabs voice.

| Key | Where | Without it |
|---|---|---|
| `ELEVENLABS_API_KEY` | elevenlabs.io › sign up (free plan) › Developers › API keys › Create (Text to Speech access) | The phone's own voice |
| `ELEVENLABS_VOICE_ID` (optional) | elevenlabs.io › Voices › a voice › Copy voice ID | Rachel, a calm, clear voice |

Put them in Vercel › the kovactive project › Settings › Environment Variables, then redeploy. The free plan covers about 10,000 characters a month; Kova asks for each short line once and keeps it.

## 4. Payments (RevenueCat, with Stripe on the web and the App Store / Google Play in the app)

**The plans.** Health is the base; Training and Work OS + AI team are add-ons. In the stores they are four plans in **one subscription group**, so moving between them is an upgrade or downgrade, never two bills:

| Plan (RevenueCat package id) | Gives entitlements | Yearly | Monthly |
|---|---|---|---|
| `health_year` / `health_month` | `health` | $59.99, 30 days free | $9.99, 14 days free |
| `health_train_year` / `health_train_month` | `health`, `train` | $84.99, 30 days free | $13.99, 14 days free |
| `health_work_year` / `health_work_month` | `health`, `work` | $104.99, 30 days free | $17.99, 14 days free |
| `all_year` / `all_month` | `health`, `train`, `work` | $119.99, 30 days free | $19.99, 14 days free |

Training and Work OS are separate switches; both together are the `all` plan, a little cheaper than adding them one by one. The app shows the store's own prices once they load; the numbers above are its defaults. Trial lengths come from RevenueCat's September 2026 data on 17,000 apps: yearly plans convert best with 17–32 day trials, monthly ones peak at 10–16 days. The card goes in at the start; the server sends "your free trial ends in 2 days" once per trial.

Until `REVENUECAT_SECRET_KEY` is set, every part stays open and nothing is charged. The old single entitlement `kova_pro` still unlocks everything, so early subscribers keep what they have.

| What | Where to get it | Where it goes |
|---|---|---|
| Entitlements | RevenueCat › Product catalog › Entitlements: `health`, `train`, `work` | – |
| Products | App Store Connect › Subscriptions: one group, six products (above), each with an introductory offer: free, 1 month on yearly, 2 weeks on monthly. Google Play: the same six with a free-trial offer | Attach each to its entitlements in RevenueCat |
| Offering | RevenueCat › Offerings › default: six packages with the ids in the table | – |
| Web public key (Web Billing) | RevenueCat › Project settings › API keys | `KOVA_RC.web` in `index.html` |
| Apple public key | same page | `KOVA_RC.ios` in `index.html` |
| Google public key | same page | `KOVA_RC.android` in `index.html` |
| Stripe | RevenueCat › Web Billing › connect your Stripe account (web products get the same trials) | Nowhere in Kova: RevenueCat holds it |
| Secret key | RevenueCat › API keys › Secret key | Vercel or Netlify: `REVENUECAT_SECRET_KEY` |
| Webhook | Pick any long random value (`openssl rand -hex 32`) | `REVENUECAT_WEBHOOK_AUTH` on the server; and RevenueCat › Integrations › Webhooks: URL `https://<site>/api/billing/webhook`, Authorization header = the same value |

What each part unlocks on the server: Health = meal photos, labs, progress-photo estimates and the wellness check; Work = the AI team, Studio writing, publishing, hashtags and traction advice; chat comes with any plan.

## 5. Food search, email and encryption

| Variable | Where to get it | Without it |
|---|---|---|
| `FDC_API_KEY` | Free from api.data.gov/signup | Uses the shared `DEMO_KEY`, which is rate-limited |
| `RESEND_API_KEY`, `MAIL_FROM` | resend.com › API keys; `MAIL_FROM` on a domain you verified there | No email sign-in codes or assistant email |
| `KOVA_TOKEN_KEY` | `openssl rand -base64 32`. Set it once and never change it | Connected-account tokens are encrypted with a key derived from the Firebase key |
| `KOVA_MEDIA_SECRET` | Any long random value | File links are signed with a key derived from the Firebase key |

## 6. Connected accounts (OAuth)

Every provider uses the same redirect URL: **`https://<your-site>/api/oauth/callback`**. Add it in each provider's app settings, then put the ID and secret in Netlify. Each pair is optional; an unset provider just shows as not available.

| Provider | Variables | Where to create the app |
|---|---|---|
| Google (sign-in, Calendar two-way, YouTube, Gmail drafts) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | console.cloud.google.com › APIs & Services › Credentials (OAuth client, Web). Enable the Calendar, YouTube Data, YouTube Analytics and Gmail APIs. Scopes used: `calendar.events`, `youtube.readonly`, `youtube.upload`, `yt-analytics.readonly`, `youtube.force-ssl`, `gmail.compose` |
| Instagram | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | developers.facebook.com › your app › Instagram |
| Facebook Pages and Meta Ads | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | developers.facebook.com › your app |
| Threads | `THREADS_APP_ID`, `THREADS_APP_SECRET` | developers.facebook.com › Threads use case |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | developers.tiktok.com |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | linkedin.com/developers |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET` | developer.x.com |
| Pinterest | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` | developers.pinterest.com |
| Reddit | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | reddit.com/prefs/apps |
| Tumblr | `TUMBLR_CLIENT_ID`, `TUMBLR_CLIENT_SECRET` | tumblr.com/oauth/apps |
| Bluesky, Mastodon, Discord, Telegram | Nothing to set | Each person links their own account in the app |

## 7. Before you publish

- **Business details.** Fill in `KOVA_BIZ` at the top of `src/p08_legal.js` (company name, registered address, support email, country), then run `python3 src/inject_p07.py index.html`. Replace the red blanks in `privacy.html`, `terms.html`, `refunds.html`, `cookies.html` and `licenses.html` with the same details (search for `class="todo"`). The Launch check stays red until both are done.
- **Have a lawyer read the legal pages.** They are written for Kova as it is built (health data on the device first, analytics only after consent, 16 and over, refunds within 14 days on the web), but they are a starting point, not legal advice. The refund policy in particular is a business decision: change it if you want different terms.
- Open the Launch check and turn every required row green.
- `npm test` and `node build/routes.mjs --check` pass; CI runs them on every push.

The server routes and which file implements each one are listed in [ROUTES.md](ROUTES.md).
