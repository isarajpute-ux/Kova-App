# Setting Kova up: every key, and where it goes

Everything below is free to start with, and nothing needs a credit card except the app stores' own developer accounts. Two places hold keys:

- **`index.html`** holds only *public* keys. They identify the app and are safe in a public repo: the Firebase web config, the RevenueCat public SDK keys and the web push (VAPID) key.
- **Netlify › Site configuration › Environment variables** holds every *secret*. Nothing secret is ever in this repo. Netlify caps all variables together at 4 KB, and the Firebase private key is most of that, so set only what you use.

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

## 3. AI (Anthropic)

| Variable | Where to get it | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com › API keys | Chat, meal photos, lab reading, the AI team and Studio writing fall back to the on-device guide |
| `KOVA_MODEL`, `KOVA_AGENT_MODEL` | Optional | Default `claude-sonnet-5-5` |
| `KOVA_MEAL_MODEL` | Optional | The model that reads meal photos. Default `claude-haiku-4-5-20251001` (fast: about 2-3 s a plate). A bigger model is a little more accurate and slower. |
| `KOVA_CHAT_DAILY`, `KOVA_GLOBAL_DAILY_LIMIT`, `KOVA_AGENT_BUDGET_USD` | Optional spending caps | Defaults 150 chats per person per day, 5,000 in total, $0.40 per audit |

## 4. Payments (RevenueCat, with Stripe on the web and the App Store / Google Play in the app)

One entitlement, `kova_pro`, covers the web and both apps. Until `REVENUECAT_SECRET_KEY` is set, every feature stays open and nothing is charged.

| What | Where to get it | Where it goes |
|---|---|---|
| Entitlement and products | RevenueCat › Product catalog: entitlement `kova_pro`, an annual and a monthly product, one Offering | – |
| Web public key (Web Billing) | RevenueCat › Project settings › API keys | `KOVA_RC.web` in `index.html` |
| Apple public key | same page | `KOVA_RC.ios` in `index.html` |
| Google public key | same page | `KOVA_RC.android` in `index.html` |
| Stripe | RevenueCat › Web Billing › connect your Stripe account | Nowhere in Kova: RevenueCat holds it |
| Secret key | RevenueCat › API keys › Secret key | Netlify: `REVENUECAT_SECRET_KEY` |
| Webhook | Pick any long random value (`openssl rand -hex 32`) | Netlify: `REVENUECAT_WEBHOOK_AUTH`; and RevenueCat › Integrations › Webhooks: URL `https://<site>/api/billing/webhook`, Authorization header = the same value |
| Store products | App Store Connect › Subscriptions; Google Play Console › Subscriptions | Linked to the same products in RevenueCat |

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

- Put your support email in `privacy.html` (search for "add your support email").
- Open the Launch check and turn every required row green.
- `npm test` and `node build/routes.mjs --check` pass; CI runs them on every push.

The server routes and which file implements each one are listed in [ROUTES.md](ROUTES.md).
