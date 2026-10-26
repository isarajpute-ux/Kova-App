# Supabase, GitHub and Vercel, the simple way

## The three helpers

Think of Kova like a lemonade stand.

| Helper | What it is | In the lemonade stand |
|---|---|---|
| **GitHub** | Where the **code** lives | The **recipe book** |
| **Vercel** | Where the app **runs**, so people can open it | The **stand** where people buy lemonade |
| **Supabase** | Where Kova **keeps photos and videos** | The **storage closet** in the back |

Vercel reads the recipe from GitHub and makes the app. When Kova needs to save a photo, it puts it in the Supabase closet.

## Why the video was confusing

The man in the video used a **Project URL** and a **publishable key**. His app talks to Supabase **from the phone**, so it uses the publishable key. That key is safe to show anyone.

**Kova is different.** Kova talks to Supabase **from the server** (inside Vercel), so it uses a **secret key**, not the publishable key.

- **Project URL** = the closet's **address**. Kova needs it.
- **Publishable key** = a **visitor pass**. Kova does **not** need it. Skip it.
- **Secret key** = the **master key** to the closet. Kova needs it. Never show it to anyone. It only goes into Vercel.

## Step by step

### Part 1: Get the two things from Supabase

1. Go to **supabase.com** and sign in.
2. Click your project. Its name is **"isarajpute-ux's Project"**.
3. At the top, click the **Connect** button.
4. Find **Project URL**. It looks like this:
   `https://jwsfnsnrzmpnzfudahqg.supabase.co`
   This is the **address**. Copy it into a note.
5. Close that window. On the left side, click the **gear** (⚙ **Project Settings**).
6. Click **API Keys**.
7. Look for **Secret keys**. Click the eye or **Copy** next to the key that starts with `sb_secret_`.
   (No secret key there? Click **Create new secret key**, give it any name like `kova`, then copy it.)
   This is the **master key**. Don't send it to anybody, not even Claude.

You do **not** need the **publishable key** (it starts with `sb_publishable_`). Leave it alone.

### Part 2: Give the two things to Vercel

1. Go to **vercel.com** and sign in.
2. Click your project **kovactive**.
3. Click **Settings** (at the top).
4. On the left, click **Environment Variables**.
5. In the **Key** box type: `SUPABASE_URL`
   In the **Value** box paste the **address** from Part 1, step 4.
   Click **Save**.
6. Again. In the **Key** box type: `SUPABASE_SECRET_KEY`
   In the **Value** box paste the **master key** from Part 1, step 7.
   Click **Save**.
7. Spelling matters. Use capital letters and the little lines `_` exactly as shown.

### Part 3: Make Vercel use them

1. In Vercel, click **Deployments** (at the top).
2. On the newest one, click the **three dots** (⋯) › **Redeploy** › **Redeploy**.
3. Wait about 2 minutes until it says **Ready**.

### Part 4: Is it working?

Open this in your browser:
`https://kovactive.vercel.app/api/ping`

- If you see `"supabase":true`, the closet is connected.
- If you see **"The page could not be found"**, Vercel is still using the tutorial's recipe book instead of Kova's. Do the **GitHub part** below first.

## The GitHub part (so Vercel uses Kova's whole recipe book)

Right now Vercel reads from a recipe book called **kovactive** that the video's button made. That book only has the Kova page, not the Kova server. So photos, sign-in codes and the AI team can't work yet.

1. Send Kova's whole recipe book to GitHub. Open **Terminal**, paste this, press Enter, and type your GitHub token when it asks:
   ```
   cd ~/Downloads/"kova-deploy 2" && git push -u origin kova-brief-waves-1-4
   ```
2. Go to **github.com/isarajpute-ux/Kova-App**. Click **Compare & pull request**, then **Create pull request**, then **Merge pull request**, then **Confirm merge**.
3. In Vercel: **kovactive** › **Settings** › **Git** › **Disconnect**. Then **Connect Git Repository** › **GitHub** › **Kova-App**.
4. Vercel builds Kova again by itself. Then do **Part 4** to check.

## Remember

- **Address (Project URL):** goes in Vercel.
- **Master key (secret key):** goes in Vercel. Never anywhere else.
- **Visitor pass (publishable key):** Kova doesn't use it.
