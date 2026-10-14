# Kova: notes for whoever picks this up (Claude or a person)

Kova is a health app (Today, Workout, Fuel, Sleep, Vitals, Learn) with a Work OS (tasks, meetings, automations, an AI team, Studio for posts). One `index.html` app, a Node server in `functions/`, phone apps from the same code in `native/`.

**Read `VERCEL-STEP-BY-STEP.md` to put it online, and `SETUP.md` for every key and setting.**

## Where things are
- Code: this folder (on the owner's Mac: `~/Downloads/kova-deploy 2`). A full git backup also sits in `~/Kova/backup/kova-app.bundle` (`git clone ~/Kova/backup/kova-app.bundle kova` restores everything, every branch).
- GitHub: `isarajpute-ux/Kova-App`. Work goes on the branch `kova-brief-waves-1-4`; the owner merges to `main` through a pull request. **Never push to `main`.** The owner types the GitHub token; never ask for it or store it.
- Hosting: Vercel (site + server, `vercel.json`, `api/`), Supabase (photos and videos, `functions/supa.js`), Firebase (sign-in and database). Netlify config is kept as a fallback. Free tiers.

## How the code is built
- Feature modules live in `src/p08_*.js` / `.css`. `python3 src/inject_p07.py index.html` copies them into `index.html` (as `<script id="p08-x">` / `<style id="p08-x">`). Always run it after editing a `src/` file.
- `npm run build` writes `dist/`. Modules not needed on the first screen are listed in `LAZY` in `build/site.mjs` (and their CSS in `LATE_CSS`); they load right after the first screen, all at once.
- Budgets (`node tests/e2e/perf.mjs`): first load at most 450 KB (it is at 450, so new code goes in a LAZY module), usable within 3 s on a throttled phone (2.6 s now), at most 1500 elements. Measure when the Mac is quiet; Spotlight indexing makes it look slow.

## Tests (every feature has one; keep them green)
- `node tests/e2e/runall.mjs` runs every `tests/*.js` (use `P=3` if the machine is busy; a few files time out under load, rerun them alone).
- Browser suites, one at a time: `node tests/e2e/<name>.mjs` for perf, flows, contrast, keyboard, tours, pages, signin, store, park, compare, cut, camera.

## The owner's rules (they matter)
1. Every screen works in **dark, soft light and light glass**.
2. **No clutter, nothing hidden**: no "More" button, no hiding tabs; depth goes in pop-ups behind things already on screen.
3. **Real, not for show**: a feature copied from a reference must work end to end and have a test. No made-up numbers: with no data, say so.
4. **Reference images**: give each numbered image a specific place, and say back which went where.
5. **Sell the outcome, not the product** on plan and sales screens; keep prices quiet.
6. Security: never type passwords, keys or tokens; never create accounts; deploy only with the owner's go-ahead; nothing is emailed without approval; **the repo is public, so scan for secrets before every commit**; deletions only with the owner's OK.
7. Speak plainly: the owner is not a programmer. Say what to click and where.

## Design notes
- **Vitals** (`src/p08_vdock.js`): one section at a time from a swipeable dock of wide squircle tiles at the bottom; a single glow slides to the picked tile; sections slide in from the side you head to. Look from three reference images in the app's accent colour: "Label: Value" titles, graphite cards with a soft colour glow, huge thin numbers, a track with a glowing ring, Steadiest (vivid tile) and Most off (dark tile). **No dot grid on Vitals** (that is for Work OS).
- **Guided tours** (`src/p07_ui.js` KovaTour): Skip, Back, Next; keys left/right/Esc. Modules add their own with `KovaScreenTour.register(id, name, steps)`. Tours exist for Today, Workout, Vitals (walks the dock), Sleep, Fuel, Work OS, Automations, Meetings and a Meeting.
  - p28: with your own data (live mode) Today, Vitals, Sleep and Workout are plain cards (KovaLive), so their tours use `KovaScreenTour.LIVE` lists; stops hidden for good are dropped before a tour starts. The light only moves with transform (smooth on phones). Test tours in live mode on iPhone WebKit too (`node tests/e2e/tours.mjs` does).
- **Your wearable** (`src/p08_wearables.js`): the Watch screen draws the device that sent the data (Apple Watch, Ultra, Pixel, Galaxy, Garmin, Fitbit, WHOOP, Oura, Ultrahuman, Galaxy Ring, Polar, COROS, Suunto, Amazfit, Withings); tap it to choose; each says honestly how its data reaches Kova.
- **Vitals taps** (`src/p08_vtaps.js`): every Vitals card opens something real (recovery breakdown, the reading, Ask Cora with the question pre-written, habit reminders).
- **Upright** (`src/p08_upright.js`): portrait lock where possible; a "Turn your phone upright" screen on a sideways phone.
- **One goal, everywhere** (`src/p08_goal.js`, p29): the Workout quiz goal steers every pillar. Workout has a "Built around" card (Train / Eat / Sleep for that goal; for swimming, running, hiking or cycling the week written out from `KovaSport`, each session opening to warm-up, drills, main set and cool-down with the words explained, "How to get faster" guides, and the test number that sets every pace). Machine scan and Form Check take sets, reps and rest from the goal, say why a machine matters for the sport, and "Add to my program" really adds it (`KovaGoal.addToPlan`). Fuel and Sleep each show what the goal asks, from your weight and your own nights. The scan also knows the stationary bike, rowing machine, stair climber and elliptical.
- **Kova's AI for photos and video** (`POST /api/ai/ask`, p28/p29): signed in (not a guest) with no key of your own, every photo reader and Form Check's technique review go through the server's key; photos are shrunk first (`KovaModel.fit`) and labelled with their real type (`KovaModel.mime`). Tests: `tests/aiask.js`, `tests/e2e/formai.mjs` (records a real clip in the browser).
- **Work OS reads what you put in** (`src/p08_look.js`, p29): Studio's "Check my photo or clip" sends 4 stills to Kova's AI (opening, framing, light, on-screen text, each app, a caption you can use); "Write it with Kova" and Maya's caption send the same stills (`/write` and `/crew/caption` take `images`). Compose's versions are written by Kova's AI when signed in (templates first, kept if the AI fails, and it says which). Workspace "Make" reads the picked files (text, PDF, photos). Files keeps the file itself (KovaBlobs + Kova storage) and "Read it" gives a summary, key points and to-dos that become tasks; a meeting's notes can be dictated and turned into tasks the same way. With your own data, Compose's signal cards use only real workouts. Tests: `tests/worklook.js`, `tests/e2e/worklook.mjs`.
- **Automations** (`src/p08_flow.js`): rules said in plain words, multi-step with waits and filters, Test it. **Search** (`src/p08_cmdk.js`): Cmd/Ctrl+K and the header search icons. **App guide** (`src/p08_apps.js`): 86 apps, why each leads, what Kova took.
- **Booking link** (`functions/booking.js`, `book.html`, `src/p08_booking.js`): like Calendly; `/book/<name>`; bookings become Work OS meetings.
- **AI team** (`functions/asks.js`, `src/p08_asks.js`, `src/p08_crew.js`): requests by text ("tell me at 11"), meeting prep, check-ins, Maya posts videos and reports the comments.
  - p25: every teammate answers anything (health too) with `read_health` (sleep nights, food today, target); Henry (Nutrition Coach) and Luna (Sleep Coach). Without AI they answer sleep/food from the numbers and say why AI is off. Saying "hey <name> ..." keeps the box open with the answer (`src/p08_listen.js`).

## Still to do (waiting on the owner)
- Push the branch, merge the PR, follow `VERCEL-STEP-BY-STEP.md` (keys go into Vercel, never into chat).
- Re-authorize the Vercel connector in Claude with access to the "kovactive" team, if Claude should manage Vercel.
- Web push: the Firebase "Web Push certificates" key pair (public) goes into `window.KOVA_FB_VAPID` in `index.html`.
- The owner wants to design the AI (Ask Kova) button and simplify the UI next: ask them how they want it before changing either.
- Legal blanks (`KOVA_BIZ`), RevenueCat products, Xcode for the iPhone build: owner-side steps in `SETUP.md`.
