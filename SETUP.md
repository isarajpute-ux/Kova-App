# Kova setup: GitHub, Netlify, Firebase, Google Analytics and linked accounts

Kova is one static app (`index.html`) plus one server function (`/api/*`, in
`server/`). **GitHub** holds the code, **Netlify** hosts both parts and
redeploys on every push, **Firebase** handles sign-in, cloud sync, file uploads
and the server's storage, and **Google Analytics** gets usage data.

Work through the steps in order. Step 7 tells you when everything is live.

---

## 1. GitHub → Netlify (hosting and auto-deploy)

1. In Netlify: **Add new site → Import an existing project → GitHub** and
   pick `isarajpute-ux/Kova-App`.
2. Leave the build settings blank. `netlify.toml` already sets them:
   build command `node scripts/build.mjs`, publish folder `dist`, functions in
   `netlify/functions`.
3. Deploy. Your site gets an address like `https://kova-xyz.netlify.app`.
   Every push to `main` redeploys it, and pull requests get preview links.
4. Optional: **Domain management** lets you add your own domain. If you do,
   use that domain everywhere below instead of the `netlify.app` address.

GitHub Actions (`.github/workflows/ci.yml`) runs on every push. It
syntax-checks all 51 scripts inside `index.html` and runs the server tests.

## 2. Firebase

Project: **kova-ee9d5** (already set in `index.html` and `.firebaserc`).

1. **Authentication → Sign-in method.** Enable:
   - **Email/Password**
   - **Google**
   - **Anonymous** (the "use Kova without an account" option)
   - **Apple** (optional). This needs an Apple Developer account: create a
     Services ID, turn on Sign in with Apple, and paste the IDs into Firebase.
     Firebase shows the exact return URL to register with Apple.
2. **Authentication → Settings → Authorized domains.** Add your Netlify
   address (and your custom domain if you have one). Without this, Google
   sign-in fails with `auth/unauthorized-domain`.
3. **Realtime Database** and **Storage.** Both need to exist; create them if
   the console asks.
4. **Security rules.** This part matters: without it, anyone can read the
   database. The rules are in `database.rules.json` and `storage.rules`. Each
   person can only read and write `users/<their uid>`, and nobody can read the
   server's `_server/` data.
   Deploy them one of two ways:
   - Add the service-account JSON (next step) as a GitHub secret named
     `FIREBASE_SERVICE_ACCOUNT`. The *Firebase rules* workflow then deploys
     them automatically whenever they change.
   - Or run once from your computer:
     `npx firebase-tools login && npx firebase-tools deploy --only database,storage`
5. **Service account for the server.** Go to **Project settings → Service
   accounts → Generate new private key**. It downloads a JSON file. Paste its
   whole contents into the Netlify variable `FIREBASE_SERVICE_ACCOUNT` (step 4).
   Treat it like a password: never commit it.
6. Recommended: in Google Cloud Console → **APIs & Services → Credentials**,
   restrict the browser API key (`AIzaSyDJ…`) to your site's address under
   *HTTP referrers*.

## 3. Google Analytics

Two GA4 streams are wired in:

| ID | Where | What it measures |
|---|---|---|
| `G-1BHD06BQJB` | Firebase Analytics (`measurementId`) | In-app events tied to the signed-in user |
| `G-PRTZHJVKRT` | `gtag` snippet in `<head>` | Page and traffic data for the site |

Every event now goes to each property exactly once. Before this change the
Firebase property counted every event twice.

- To see events live: **GA4 → Admin → DebugView**, or **Reports → Realtime**.
- Mark `sign_up`, `login` and `chat_message` as **key events** under
  **Admin → Events** if you want them as conversions.
- If you want only one property, delete the `gtag` `<script>` block in
  `<head>` of `index.html`. Firebase Analytics still reports on its own.

## 4. Netlify environment variables

Go to **Site configuration → Environment variables**. `.env.example` lists every
variable with a comment. The minimum to bring the server up:

| Variable | Needed for |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Everything on the server: sign-in checks, stored logins, sync links |
| `TOKEN_ENCRYPTION_KEY` | Encrypting stored logins. Any long random string |
| `PUBLIC_URL` | e.g. `https://kova-xyz.netlify.app`. Must match the redirect URIs below |
| `ANTHROPIC_API_KEY` | The assistant, photo meal logging, and the content engine |
| `USDA_API_KEY` | Food search (free at https://api.data.gov/signup) |
| `RESEND_API_KEY` + `MAIL_FROM` | Email sign-in codes (resend.com, needs a verified domain) |

After changing variables, redeploy: **Deploys → Trigger deploy**.

## 5. Linked accounts (social posting, calendar, wearables)

Each service needs its own developer app. Kova's server holds the client
secret and the user tokens (encrypted in Firebase). The browser never sees
either.

**The redirect URI to register is always:**
`https://<your site>/api/callback/<id>`

| id | Where to create the app | Enable / scopes | What you can do before their review |
|---|---|---|---|
| `google` + `youtube` | console.cloud.google.com → APIs & Services. Enable **Google Calendar API** and **YouTube Data API v3**. Create an OAuth client (Web). Register **both** redirect URIs (`…/callback/google` and `…/callback/youtube`). | Calendar read-only; YouTube upload + read-only | Up to 100 test users while the consent screen is in "Testing". YouTube uploads stay **private** until the app passes Google's API compliance audit |
| `linkedin` | linkedin.com/developers → Create app → Products: **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** | `openid profile email w_member_social` | Posting to **your own profile** works immediately. Company pages need Community Management API approval |
| `x` | developer.x.com → Project → App → User authentication: OAuth 2.0, type *Web App*, read and write | `tweet.read tweet.write users.read offline.access` | Works immediately. X bills API posts per request |
| `instagram` | developers.facebook.com → Create app → **Instagram API with Instagram Login** | `instagram_business_basic, _content_publish, _manage_comments` | Works for accounts added as testers. Needs a **Business or Creator** Instagram account. Public launch needs Meta app review |
| `tiktok` | developers.tiktok.com → Create app → **Login Kit** + **Content Posting API** | `user.info.basic, video.upload, video.publish` | Videos go to your TikTok **inbox as drafts**. Direct public posting needs TikTok's content audit |
| `oura` | cloud.ouraring.com/oauth/applications | daily, heartrate, personal, session, spo2Daily, workout | Works immediately |
| `fitbit` | dev.fitbit.com/apps/new, application type **Personal** or **Server** | activity, heartrate, sleep, oxygen_saturation, respiratory_rate, temperature, weight | "Personal" covers your own account. "Server" is for everyone |
| `whoop` | developer-dashboard.whoop.com | read:recovery, cycles, sleep, workout, profile, body_measurement | Works immediately. Up to 10 users before WHOOP approval |
| `withings` | developer.withings.com → Create app (Public API) | user.info, user.metrics, user.activity | Works immediately |

Put each client ID and secret into the matching `…_CLIENT_ID` /
`…_CLIENT_SECRET` variable. In Kova, **Settings → Integrations → Kova server**
shows which ones the server has picked up.

**How posting works:** in Work → Compose, pick a connected account, write the
post, attach a photo or video (it uploads to your Firebase Storage), and send.
LinkedIn and X take text. YouTube, Instagram and TikTok need a video or photo,
and the app tells you so instead of failing silently. Studio's multi-platform
drafts go through the same server path.

## 6. Watches and rings

Settings → Connect → **Any smartwatch or ring** offers four routes:

1. **Sync link (any watch).** This covers any watch whose phone app writes to
   **Apple Health** (iPhone) or **Health Connect** (Android): Apple Watch,
   Garmin, Samsung, Amazfit/Zepp, Huawei, and most unbranded Amazon watches
   (their apps, like FitCloudPro, Da Fit, GloryFit and VeryFit, have a Health
   sync switch). Kova makes a private link. On iPhone, paste it into **Health
   Auto Export → Automations → REST API** and data arrives in the background.
   On Android, any app or automation that can POST JSON to a URL works. The
   server stores the latest values, and Kova pulls them whenever it opens.
2. **Oura, WHOOP, Fitbit, Withings.** Sign in once and the server pulls
   sleep, HRV, recovery, steps, SpO2 and weight straight from their APIs.
   (Pixel Watch data flows through Fitbit.)
3. **Bluetooth.** Live heart rate and a one-minute morning HRV (RMSSD)
   reading from any device that broadcasts the standard heart-rate profile:
   chest straps, and Garmin, Polar, Coros or Amazfit in "broadcast HR" mode.
   This needs Chrome or Edge on Android or a computer. Safari on iPhone has no
   Web Bluetooth.
4. **File import.** A Health Auto Export JSON file.

Not possible from a web app: reading Apple Health or Health Connect directly.
That needs a native iOS/Android wrapper (e.g. Capacitor with a health plugin),
which would remove the helper-app step. Garmin's own API requires joining
their partner program, and Samsung and Amazfit have no public cloud API.
Those devices are covered by route 1.

## 7. Check that it's live

- Open `https://<your site>/api/ping`. It lists what the server has turned on:
  `storage`, `ai`, `mail`, and `configured: true/false` per provider.
- In the app: **Settings → Integrations → Kova server** shows the same thing,
  with a line per missing variable.
- Sign in, open Chat, and ask something. The footer shouldn't say "answered
  offline".

## Local development

```bash
npm install
npm test               # server tests (in-memory, no network)
npm run check          # syntax-check every script in index.html
npx netlify-cli dev    # site + /api locally, reads .env
```
