# Putting Kova on Vercel, step by step

No coding needed. You will click through four websites: **GitHub**, **Vercel**, **Supabase** and **Firebase** (plus Anthropic for the AI key). Everything Kova needs is already in the code; your job is to connect the accounts and paste a few keys.

Keep this open next to your browser and do the steps in order. Each step says **where to go**, **what to click** and **what to paste**.

> **The one rule:** keys and passwords only ever go into Vercel's or GitHub's settings pages. Never paste them into a chat, an email or a file.

---

## Step 1. Send the code to GitHub (5 minutes)

The code is on your Mac in `Downloads/kova-deploy 2`. GitHub doesn't have the newest version yet.

1. Open the **Terminal** app on your Mac (press ⌘ Space, type `Terminal`, press Enter).
2. Copy this line, paste it into Terminal, press Enter:
   ```
   cd ~/Downloads/"kova-deploy 2" && git push -u origin kova-brief-waves-1-4
   ```
3. If it asks for a **username**, type `isarajpute-ux`. If it asks for a **password**, paste your GitHub token (GitHub › your picture › Settings › Developer settings › Personal access tokens). The token does not show while you paste; that is normal. Press Enter.
4. Go to **github.com/isarajpute-ux/Kova-App**. A yellow bar says *kova-brief-waves-1-4 had recent pushes*. Click **Compare & pull request**, then **Create pull request**, then **Merge pull request**, then **Confirm merge**.

Now `main` on GitHub has everything. Vercel builds from `main`.

---

## Step 2. Fix "Vercel shows someone else's website" (5 minutes)

That happens when the Vercel project is connected to a **different GitHub repository** (for example, one from a video you copied). Kova's code is `isarajpute-ux/Kova-App`. Pick **A** (simplest) or **B**.

**A. Start a clean project (recommended)**
1. Go to **vercel.com** and sign in with GitHub.
2. Click **Add New…** (top right) › **Project**.
3. Find **Kova-App** in the list and click **Import**. If it is not listed, click **Adjust GitHub App Permissions** and allow Vercel to see `Kova-App`.
4. **Project Name:** `kova` (or any name you like; it becomes your address, `kova.vercel.app` if it's free).
5. **Framework Preset:** choose **Other**. Do **not** change *Build and Output Settings*: Kova's code already tells Vercel what to do.
6. **Don't click Deploy yet.** Open **Environment Variables** and do Step 4 first.

**B. Keep your existing "kovactive" project**
1. vercel.com › open **kovactive** › **Settings** › **Git**.
2. Under **Connected Git Repository**, click **Disconnect**, then **Connect Git Repository** › GitHub › **Kova-App**.
3. Settings › **Build and Deployment** › Framework Preset: **Other**, and switch every *Override* off.
4. Settings › **Environment Variables**: do Step 4 there.

---

## Step 3. Collect the keys (15 minutes)

Open a note on your Mac called *Kova keys (private)* and gather these. Each one says where to find it.

| # | Name | Where to get it |
|---|---|---|
| 1 | `SUPABASE_URL` | Already known: `https://jwsfnsnrzmpnzfudahqg.supabase.co` |
| 2 | `SUPABASE_SECRET_KEY` | **supabase.com** › your project › ⚙ **Project Settings** › **API Keys** › *Secret keys* › copy the key that starts with `sb_secret_` (click **Create new secret key** if there isn't one). |
| 3 | `FIREBASE_CLIENT_EMAIL` | **console.firebase.google.com** › project **kova-ee9d5** › ⚙ **Project settings** › **Service accounts** › **Generate new private key** › **Generate key**. A file downloads. Open it with TextEdit: copy the text after `"client_email":` (it ends in `iam.gserviceaccount.com`), without the quotes. |
| 4 | `FIREBASE_PRIVATE_KEY` | Same file: copy everything after `"private_key":` from `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----\n`, without the outer quotes. It is long; that's right. **Then delete the downloaded file and empty the Bin.** |
| 5 | `ANTHROPIC_API_KEY` | **console.anthropic.com** › **API Keys** › **Create Key** › copy it (starts with `sk-ant-`). This pays for the AI; set a monthly limit under **Limits**. |
| 6 | `CRON_SECRET` | Make one up: in Terminal paste `openssl rand -hex 32` and press Enter, then copy the long line it prints. |

---

## Step 4. Paste the keys into Vercel (5 minutes)

On the Vercel screen from Step 2 (**Environment Variables**):

1. In **Key**, type the name exactly as in the table (for example `SUPABASE_URL`).
2. In **Value**, paste its value.
3. Click **Add**. Repeat for all six.
4. Leave *Environments* on all three (Production, Preview, Development).

Then click **Deploy** (or, for option B, **Deployments** › ⋯ next to the newest › **Redeploy**). It takes about 2 minutes.

**Check it worked:** open `https://YOUR-PROJECT.vercel.app/api/ping` in your browser. You should see text starting with `{"ok":true` and, further along, `"supabase":true`. If you see `false` next to something, that key is missing or mistyped: go back to Settings › Environment Variables, fix it, and Redeploy.

---

## Step 5. Let people sign in on the new address (2 minutes)

Firebase only allows sign-in from addresses you list.

1. **console.firebase.google.com** › **kova-ee9d5** › **Authentication** › **Settings** › **Authorized domains** › **Add domain**.
2. Type `YOUR-PROJECT.vercel.app` (no `https://`). Click **Add**.

---

## Step 6. Turn on the 5-minute timer (3 minutes)

Scheduled posts, reminders, "tell me at 11" and the AI team's routines need a clock. Vercel's free clock only ticks once a day, so GitHub ticks every 5 minutes instead (free).

1. **github.com/isarajpute-ux/Kova-App** › **Settings** › **Secrets and variables** › **Actions**.
2. **Variables** tab › **New repository variable**: Name `KOVA_SITE_URL`, Value `https://YOUR-PROJECT.vercel.app`. Click **Add variable**.
3. **Secrets** tab › **New repository secret**: Name `CRON_SECRET`, Value: the **same** value you put in Vercel. Click **Add secret**.
4. **Actions** tab › **Kova timer** (left) › if there's a button **Enable workflow**, click it.

---

## Step 7. Notifications on the web (2 minutes, optional)

1. Firebase › ⚙ **Project settings** › **Cloud Messaging** › *Web Push certificates* › **Generate key pair**.
2. Copy the **Key pair** shown (it starts with `B` and is long). This one is **public**, not a secret: you can send it to Claude, and Claude puts it into the app.

---

## Step 8. Your booking link (1 minute, after Steps 1-5)

Nothing to paste: it works once the site is live.
1. In Kova: **Work OS** › **Meetings** › **Your booking link** › **Set up my link**. Pick a name (for example `isa`), your hours and how long a call is. **Save**.
2. Your link is `https://YOUR-PROJECT.vercel.app/book/isa`. Tap **Copy link** or **Share**.
3. Optional but better: connect Google in Kova (**Settings** › **Connections** › Google). Then busy times on your Google Calendar are hidden from the page, and the people who book get a Google invite by email.

---

## You're done when…

- `YOUR-PROJECT.vercel.app` opens Kova (not someone else's site),
- you can sign in,
- `/api/ping` says `"ok":true`,
- in Kova, **Settings** › tap **Version** 7 times › **Launch check** is mostly green. It lists anything still missing, by name.

## If something goes wrong

| You see | Do this |
|---|---|
| Someone else's site | Step 2: the project is connected to the wrong repository. |
| "Build failed" | Vercel › Deployments › click the failed one › copy the red lines and send them to Claude. They never contain your keys. |
| Sign-in says "unauthorized domain" | Step 5. |
| AI answers "not available" | `ANTHROPIC_API_KEY` is missing or has no credit. |
| Photos won't upload | `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing or mistyped. |
| Scheduled posts don't go out | Step 6, and check **Actions** › Kova timer shows green ticks. |

Every time you merge new work into `main` on GitHub, Vercel rebuilds the site by itself. You don't need to repeat these steps.
