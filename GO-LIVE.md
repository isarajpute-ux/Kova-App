# Put Kova on your phone: everything in one go

Three websites, in this order. About 20 minutes.

| Website | What it is | Like a lemonade stand |
|---|---|---|
| **GitHub** | Where the code lives | The recipe book |
| **Supabase** | Where photos and videos are kept | The storage closet |
| **Vercel** | Where the app runs, so you get a link | The stand people visit |

Keep a **Notes** page open. You'll copy a few codes into it, then paste them into Vercel at the end. **Never paste these codes into chat**, not even to Claude.

---

## Part 1: GitHub (send the code up)

### 1a. Make a token (a special password for sending code)
1. Go to **github.com/settings/tokens/new**.
2. **Note:** type `kova`.
3. **Expiration:** pick **90 days**.
4. Tick **repo** and tick **workflow**. Both boxes are needed.
5. Scroll down and click the green **Generate token** button.
6. Click the copy icon next to the code that starts with `ghp_`. Put it in your Notes.

(Already made one called **kova**? Click it on **github.com/settings/tokens**, tick **workflow**, then click **Update token**. The code stays the same.)

### 1b. Send the code
1. In the Claude app, open the **Terminal** panel. Claude leaves a tab ready that has already typed `git push…`.
2. Click in the black box.
3. **Username:** type `isarajpute-ux` and press Enter.
4. **Password:** paste the `ghp_` code and press Enter. Nothing shows while you paste; that's normal.
5. It worked when you see: `* [new branch] kova-brief-waves-1-4`.

### 1c. Make it the main version
1. Go to **github.com/isarajpute-ux/Kova-App**.
2. A yellow bar says *kova-brief-waves-1-4 had recent pushes*. Click **Compare & pull request**.
3. Click **Create pull request**.
4. Wait for the checks (about 5 minutes), then click **Merge pull request**, then **Confirm merge**.

---

## Part 2: Supabase (get two codes)

1. Go to **supabase.com/dashboard** and click your project.
2. **The address:** click **Connect** at the top and copy the **Project URL**. It's `https://jwsfnsnrzmpnzfudahqg.supabase.co`. Put it in Notes.
3. **The master key:** on the left, click ⚙ **Project Settings**, then **API Keys**.
4. Under **Secret keys**, click **Copy** on the key that starts with `sb_secret_`. Put it in Notes.
   (None there? Click **Create new secret key**, name it `kova`, then copy it.)
5. You do **not** need the *publishable* key.

Nothing else to set up. Kova makes its own photo folder the first time it needs one.

---

## Part 3: Vercel (connect it all and get your link)

### 3a. Point Vercel at the real Kova code
1. Go to **vercel.com** and click the project **kovactive**.
2. At the top, click **Settings**. On the left, click **Git**.
3. Next to the connected repository (**kovactive**), click **Disconnect** and confirm.
4. Click **Connect Git Repository** › **GitHub** › **Kova-App** › **Connect**.

### 3b. Paste the codes
1. Still in **Settings**, click **Environment Variables** on the left.
2. Find **SUPABASE_PUBLISHABLE_KEY**. Click **⋯** › **Remove**, because Kova doesn't use it.
3. Add each row below. Type the **Key** exactly, paste the **Value**, and click **Save**.

| Key (type exactly) | Value (paste) | Needed for |
|---|---|---|
| `SUPABASE_URL` | Already there. Leave it. | Photos and videos |
| `SUPABASE_SECRET_KEY` | The `sb_secret_` code from Part 2 | Photos and videos |
| `CRON_SECRET` | Make one up: in Terminal type `openssl rand -hex 32`, press Enter, and copy the long line | Daily reminders |
| `ANTHROPIC_API_KEY` | **console.anthropic.com** › **API Keys** › **Create Key** (starts `sk-ant-`). Set a monthly limit there. | The AI team and Ask Kova |
| `FIREBASE_CLIENT_EMAIL` | See *Firebase codes* below | Saving data from the server |
| `FIREBASE_PRIVATE_KEY` | See *Firebase codes* below | Saving data from the server |

**Firebase codes:**
1. Go to **console.firebase.google.com** › project **kova-ee9d5** › ⚙ **Project settings** › **Service accounts** › **Generate new private key**. A file downloads.
2. Open the file with TextEdit.
3. For `FIREBASE_CLIENT_EMAIL`, copy the text after `"client_email":`, without the quotes.
4. For `FIREBASE_PRIVATE_KEY`, copy everything from `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----\n`, without the outer quotes.
5. Then **delete the file and empty the Bin**.

You can do the first three rows now and add the AI and Firebase rows later. The app still opens without them.

### 3c. Build it again with the codes
1. At the top, click **Deployments**.
2. On the top row, click **⋯** › **Redeploy** › **Redeploy**.
3. Wait about 2 minutes until it says **Ready**.

---

## Part 4: Let sign-in work on the new link
1. Go to **console.firebase.google.com** › **kova-ee9d5** › **Authentication** › **Settings** › **Authorized domains**.
2. Click **Add domain**, type `kovactive.vercel.app`, and click **Add**.

---

## Part 5: Open it on your phone
1. On your phone, open **https://kovactive.vercel.app**.
2. **iPhone:** tap **Share** › **Add to Home Screen**.
   **Android:** tap **⋮** › **Install app**.
   Kova now sits on your home screen like a normal app.

**Is the server on?** Open `https://kovactive.vercel.app/api/ping`. If it shows `"supabase":true`, everything is connected.

---

## If something goes wrong
| What you see | Fix |
|---|---|
| `Password authentication is not supported` | You typed your GitHub password. Paste the `ghp_` token instead (Part 1a). |
| `without workflow scope` | Your token needs the **workflow** box ticked (Part 1a). |
| `/api/ping` says "page could not be found" | Vercel still reads the old code. Do Part 3a. |
| `"supabase":false` | Check the spelling of `SUPABASE_SECRET_KEY`, then do Part 3c again. |
| Sign-in says "unauthorized domain" | Do Part 4. |
