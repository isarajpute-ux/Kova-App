# Kova scorecard: September 2026

Kova is graded here as five separate products: a nutrition app, a sleep app,
a training app, a vitals/recovery app and a work OS. Each gets a grade for
where it stood at the start of this review and where it stands after this
branch. Every grade is based on reading `index.html` (about 39k lines), not
on screenshots.

"What people ask for" is the recurring feedback in App Store reviews and
Reddit threads for the category leaders (MyFitnessPal, Cronometer,
MacroFactor, Sleep Cycle, Rise, Oura, WHOOP, Strong, Hevy, Fitbod, Notion,
Motion, Sunsama). It comes from general knowledge of those markets, not from
a fresh review scrape.

| Pillar | Before | After | What moved it |
|---|---|---|---|
| Nutrition (Fuel) | **C** | **B** | Food search went from 8 hardcoded foods to USDA + Open Food Facts. Photo logging works without a personal key, and a bug that rejected every photo request is fixed |
| Sleep | **B−** | **B+** | The sleep screens were already deep. Real data now arrives automatically from any watch |
| Training (Move) | **B−** | **B−** | Unchanged in this branch. Strong logic, missing a few gym-floor basics (below) |
| Vitals / recovery | **C+** | **B+** | Was mostly sample data. Now fed by sync link, Oura/WHOOP/Fitbit/Withings, or Bluetooth HRV |
| Work OS | **C−** | **B** | Every integration was a dead end. Posting, calendar, inbound comments and the content engine now work |
| Backend / integrations | **F** | **B+** | No server existed. There is now a tested one; it goes live once the keys in SETUP.md are set |

---

## Nutrition: C → B

**Already strong:** barcode scanning through Open Food Facts; AI photo logging
that itemises hidden cooking oil and carries a confidence score; macro and
TDEE targets; water, caffeine and alcohol logging; recipes; a day/week/month
history.

**Was broken or filler:**
- "Search any food" searched **8 foods**. It now also searches USDA
  FoodData Central (generic, restaurant-style and ~400k branded US items) plus
  Open Food Facts (international packaged foods), with fiber, sugar and
  sodium.
- Photo logging sent `temperature: 0`, which current Claude models reject
  with a 400, so it failed even for users who pasted their own key. It also
  required everyone to bring their own API key. It now runs on Kova's server
  key, with per-user daily limits.

**What people ask for that Kova still lacks:**
1. **Micronutrients**, the reason people leave MyFitnessPal for Cronometer.
   The USDA data carries them; the next step is storing and showing vitamins
   and minerals, not just macros.
2. **Nutrition next to sleep.** People want "caffeine after 2pm → deep sleep
   −18%" and "late meals → higher overnight HR". Kova already has both data
   sets; this is the best-differentiated feature to build next.
3. Meal plans and a grocery list generated from targets.
4. A verified-food flag, because crowdsourced errors are the top complaint
   about every big database. USDA rows are labelled now; show that badge more
   prominently.
5. CGM / glucose import for the metabolic-health crowd.

## Sleep: B− → B+

**Already strong:** sleep stages, sleep debt, efficiency, a bedtime planner,
a nap log with its own model, a circadian rhythm model, and sound mixes.

**Was the gap:** real data only arrived by manually exporting a file.

**Now:** automatic background sync from any watch that writes to Apple Health
or Health Connect, direct Oura/WHOOP/Fitbit/Withings pulls, and a Bluetooth
morning-HRV reading.

**Still missing:**
1. **Smart alarm.** This is a platform limit: a web app cannot wake you
   reliably. It needs the native wrapper.
2. Snore and noise detection (same limit: needs native background audio).
3. The sleep ↔ nutrition ↔ training correlations above, which is what
   people pay Oura and WHOOP for.

## Training: B−

**Already strong:** generated programs, a live session with an automatic rest
timer, 1RM estimates, RPE, deloads, Auto-Target progression from lift history,
warm-ups, a camera form check, Zone 2 and conditioning plans.

**What lifters ask for that is missing:**
1. **Supersets and circuits.** Hevy and Strong users cite these constantly.
2. A **plate calculator**.
3. An exercise library with demo video or animation.
4. **Live heart rate during the session.** The new Bluetooth module makes this
   a small next step: feed `KovaDevices` heart rate into the session screen
   for strain/zone tracking.
5. Logging from the watch itself, which needs the native wrapper.

## Vitals / recovery: C+ → B+

The screens were good (HRV, readiness, stress, recovery, VO2, healthspan),
but ran on sample data for nearly everyone. With real inputs from the three
new sources, this is now a genuine recovery dashboard. The main remaining
gap: **women's health.** There is no cycle tracking or cycle-phase-aware
readiness, which is now standard in Oura, WHOOP and Garmin. It is the
biggest missing feature in the whole app for half the audience.

## Work OS: C− → B

**Already strong (and unusual):** tasks, projects, meetings, goals, files, an
inbound comment triage, a multi-platform Studio composer, and scheduling that
defers heavy-focus tasks on poor-recovery days. No mainstream work app does
that last one.

**Was filler:** every "Connect" pointed at a server that was never deployed.
The quick composer's attach buttons asked you to *type a filename*, and Send
only created a local task.

**Now real:**
- Publishing: LinkedIn (text and an image, to your profile) and X (text) post
  directly. YouTube (video, private until Google's audit), Instagram (photo or
  Reel, Business/Creator accounts) and TikTok (video to your drafts inbox)
  work with a real uploaded file.
- Google Calendar read, inbound comments from YouTube and Instagram, and the
  content engine that turns notes into LinkedIn, X and short-video scripts
  with schema-checked output.

**Still missing:** writing back to the calendar (time-blocking, which Motion
and Sunsama are built on), email (the "Email" card is still unbuilt), Slack
and Notion, Facebook Pages and Threads, and scheduled posting (posts go out
when you tap send).

## Backend: F → B+

**Before:** the app called `integrations-worker.js`, a `kovaChat` Firebase
function, `/auth/code`, `/inbound` and `/script`. None of them existed in the
repo. The first-run Google/Apple buttons **faked a login as "Isa"**.
`database.rules.json` and `storage.rules` were referenced but absent, so
database security depended on console settings nobody could review.
`sw.js`, the manifest and the icons were missing, so installing to the Home
Screen was broken.

**After:**
- A Netlify Functions backend (`server/`) with 22 passing tests.
- OAuth for 10 providers, with logins encrypted at rest (AES-256-GCM) and
  signed, expiring `state` plus PKCE.
- Firebase ID-token auth on every route.
- Real Google/Apple/email sign-in, all landing in one Firebase account.
- Committed security rules, deployable from GitHub Actions.
- A working PWA install.
- CI that syntax-checks every script in `index.html`.

**Why not an A:** it goes live only once the keys in `SETUP.md` are set, and
three platforms (YouTube, TikTok, Instagram at scale) require the platform's
own app review before posts are public. That is their policy and no code can
skip it. `index.html` is also a single 2 MB, 39k-line file. It works, but
every future change gets riskier; splitting it into modules is the biggest
long-term health item.

---

## Recommended next five, in order

1. **Cycle tracking + cycle-aware readiness.** Largest audience gap.
2. **Correlation cards** across fuel, sleep and training ("what actually moves
   your sleep"). Kova's one-app advantage, and nobody else has all three data
   sets.
3. **Native wrapper (Capacitor).** It unlocks direct Apple Health and Health
   Connect (no helper app), smart alarm, reliable push notifications and
   watch-side logging.
4. **Micronutrients** in the food log and dashboard.
5. Supersets, a plate calculator, and live heart rate in sessions.
