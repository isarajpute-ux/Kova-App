/* Kova's domain knowledge.

   The model already knows a great deal about fitness, sleep and
   nutrition. This file is NOT trying to teach it those subjects. It pins
   down three narrower things a general model would otherwise get wrong
   or inconsistent:

     1. The exact thresholds THIS app uses, so the chat never contradicts
        a number printed on a screen two taps away (the recurring bug in
        this codebase has been two places disagreeing about one value).
     2. Which bodies of guidance the app treats as the reference, so an
        answer says "the AASM recommends 7+ hours" rather than a vague
        "experts say".
     3. What each screen in the app is and what it computes, so "what
        does my efficiency number mean" gets an answer about Kova's
        efficiency number, not efficiency in general.

   Verified against current sources on 2026-09-21: the 2025 AHA/ACC
   blood pressure guideline (which replaced 2017), the Pelland et al.
   2026 volume/frequency meta-regression, and the Gardiner et al. 2023
   caffeine meta-analysis plus a 2025 caffeine dose-timing trial.

   Every threshold here is a mainstream, citable position. Where the
   evidence is genuinely mixed the entry says so, and the model is told
   to say so too rather than pick a side and sound certain. */

module.exports.KNOWLEDGE = `
=== SLEEP ===
Reference bodies: American Academy of Sleep Medicine (AASM) and Sleep Research Society joint consensus; National Sleep Foundation.
- Adults 18-64: 7+ hours per night for health (AASM/SRS). Regularly under 7 is associated with worse cardiometabolic, cognitive and mood outcomes. Teens 13-18: 8-10 hours.
- Sleep efficiency = time asleep / time in bed. 85%+ is the healthy threshold used clinically and in CBT-I. Kova uses 85 as "healthy" and offers 90 as a stretch goal.
- Low efficiency usually means too MUCH time in bed, not too little sleep. The CBT-I fix is sleep restriction: shorten time in bed toward actual sleep time, then extend in 15-minute steps once efficiency holds above ~85-90%. Do not tell someone with low efficiency to go to bed earlier.
- Sleep onset latency (time to fall asleep): under ~20 minutes is normal. Consistently over 20-30 suggests going to bed before sleepy, or arousal (stress, screens, caffeine).
- Brief awakenings between sleep cycles are normal. A cycle is roughly 90 minutes. Wakes under ~15 minutes are rarely worth chasing; longer wakes usually have a findable cause (temperature, alcohol wearing off, bladder, noise, pain, stress).
- Deep (N3/slow-wave) sleep concentrates in the first half of the night; REM concentrates in the second half. So a late bedtime costs deep sleep, an early alarm costs REM.
- Consistency: variability in bedtime/wake time is independently linked to worse outcomes. A fixed WAKE time is the strongest single anchor for the circadian rhythm.
- Caffeine (Gardiner et al., Sleep Medicine Reviews 2023 - meta-analysis of 24 studies): caffeine reduced total sleep time by ~45 minutes and sleep efficiency by ~7%, lengthened sleep onset by ~9 min and wake after sleep onset by ~12 min, and cut deep (N3) sleep by ~11 minutes. Dose-specific cutoffs to avoid losing sleep time: a coffee (~107 mg) at least 8.8 hours before bed; a standard pre-workout (~217 mg) at least 13.2 hours before bed. So a 5pm pre-workout is inside the window for a 10pm bedtime. Tea at normal amounts showed no cutoff. A 2025 randomized crossover trial found ~100 mg is tolerable up to ~4 hours before bed, but 400 mg in one dose affects sleep even 12 hours out - and people could not accurately perceive the effect on their own sleep, so "it doesn't affect me" is not reliable evidence. Half-life is roughly 5 hours but varies ~2-10h between people.
- Alcohol shortens sleep onset but fragments the second half of the night and suppresses REM. It is a sedative, not a sleep aid.
- Bedroom temperature: roughly 60-67F (15.5-19.5C) is the commonly cited range. Core body temperature must drop to initiate sleep.
- Light: bright light in the morning advances the clock; bright light at night delays it.
- Naps: 10-20 minutes avoids sleep inertia; late-afternoon naps can reduce night sleep pressure.
- Red flags to refer to a doctor rather than coach: loud snoring with gasping or witnessed pauses (possible sleep apnea), falling asleep while driving, persistent insomnia over 3 months, restless legs, acting out dreams.

=== TRAINING ===
Reference bodies: American College of Sports Medicine (ACSM) position stands; NSCA; peer-reviewed hypertrophy meta-analyses (e.g. Schoenfeld and colleagues).
- Volume (Pelland et al., Sports Medicine 2026 - meta-regression of 67 studies, 2,058 people, the largest to date): both muscle growth and strength keep rising as weekly sets rise, but with diminishing returns - more pronounced for strength than for size. Roughly 10-20 hard sets per muscle per week remains a sound practical range; beyond that each extra set buys less. Count sets "fractionally": a set that trains the muscle directly counts 1, an indirect set (e.g. triceps during bench press) counts about 0.5. Sets taken within ~0-3 reps of failure (RIR 0-3) count as "hard".
- Load: hypertrophy occurs across a wide rep range (roughly 6-30) when sets are taken close to failure. Strength is more specific and favours heavier loads (roughly 1-6 reps).
- Progressive overload is required. Kova's progression by goal: linear (add weight every session - novice strength), double progression (add reps across a range, then add weight - hypertrophy), reps-first (bodyweight/toning), hold/time (isometrics, mobility), speed (power/athletic).
- Kova auto-progression for bodybuilding: when the top of the rep range is hit on all sets, add the smallest practical increment (typically 5 lb / 2.5 kg for compound lifts) and drop back to the bottom of the range.
- Deload: Kova schedules one every 4th week on conditioning plans. Reduce volume ~40-50%, keep intensity.
- Frequency (same Pelland meta-regression): with weekly volume held equal, how often you train a muscle makes little difference to hypertrophy - but higher frequency does help strength, again with diminishing returns. So for size, split sets across the week for convenience and quality; for strength, practising the lift more often helps.
- Rest between sets: 2-3+ minutes for heavy compounds improves performance vs very short rest; 1-2 minutes is fine for isolation work.
- Endurance: polarized ~80/20 (about 80% of time at easy, conversational "zone 2" intensity; about 20% hard). Easy means you can speak in full sentences.
- Running progression: increase weekly volume gradually (the "10% rule" is a rough heuristic, not a law). Most running injuries come from load rising faster than tissue adapts.
- Swimming: Critical Swim Speed (CSS) from a 400m and 200m time trial sets training paces.
- Cycling: Functional Threshold Power (FTP), often estimated as ~95% of a 20-minute max effort, sets power zones.
- Estimated 1RM (Epley): weight x (1 + reps/30). Only reliable under ~10 reps.
- Red flags: sharp or joint pain (not muscle burn), pain that changes movement, chest pain or unusual breathlessness during exercise, dizziness. Stop and refer out.

=== NUTRITION ===
Reference bodies: International Society of Sports Nutrition (ISSN) position stands; Dietary Guidelines for Americans; Academy of Nutrition and Dietetics.
- Protein for people who train: 1.6-2.2 g per kg bodyweight per day (about 0.7-1.0 g per lb) is the ISSN-supported range for building/keeping muscle. Above ~2.2 g/kg shows little extra benefit for most. In a calorie deficit, the higher end helps preserve muscle.
- Spread protein across 3-5 meals of roughly 0.3-0.4 g/kg each.
- Fat loss: a deficit is required. About 0.5-1% of bodyweight per week is a sustainable rate that better preserves muscle; faster tends to cost muscle and adherence.
- Muscle gain: a modest surplus (~5-10% above maintenance) limits fat gain.
- Fibre: about 25 g/day (women) to 38 g/day (men) is the common target. Most people fall well short.
- Hydration: needs vary widely with body size, heat and activity. Pale-yellow urine is a practical check. Kova's default water target is 3 L.
- Ultra-processed food is associated with overeating in controlled trials (e.g. Hall et al., 2019, ~500 kcal/day more eaten on an ultra-processed diet).
- Additives and "hormone disruptors": evidence ranges from well-established (e.g. regulatory action on certain phthalates and BPA in some uses) to preliminary or animal-only. Say which. Do not claim a single food "makes you fat" - body fat follows energy balance over time; food quality affects how easy that balance is to hit.
- Bloating and GI upset commonly come from FODMAPs, sugar alcohols (sorbitol, xylitol, erythritol), large fibre increases done too fast, carbonation, and eating quickly.
- Red flags: signs of disordered eating, very low calorie intake, unintended weight loss, symptoms of a medical condition. Refer out; do not give numbers.

=== VITALS ===
Reference bodies: American Heart Association (AHA); the 2025 AHA/ACC multisociety High Blood Pressure Guideline (published August 2025), which REPLACED the 2017 guideline.
- Resting heart rate: 60-100 bpm is the conventional normal range for adults; well-trained people are often 40-60. The TREND against your own baseline matters more than one reading.
- HRV (heart rate variability, typically RMSSD from wearables) is highly individual. Compare only to your own rolling baseline. A drop of more than about one standard deviation below baseline is a signal of accumulated stress: poor sleep, illness coming on, alcohol, hard training, psychological stress.
- Blood pressure (2025 AHA/ACC guideline): categories carry over from 2017 - normal under 120/80; elevated 120-129 / under 80; stage 1 hypertension 130-139 or 80-89; stage 2 at or above 140/90. The treatment target is under 130/80 for most adults, with encouragement toward systolic under 120. For stage 1 with lower cardiovascular risk, the guideline recommends 3-6 months of lifestyle change first, and medication if BP stays at or above 130/80. Risk is now estimated with the AHA PREVENT equations (replacing the older Pooled Cohort Equations). Diagnosis should rest on an average of at least 2 careful readings on at least 2 occasions, and home or ambulatory monitoring improves accuracy - so one high reading on a watch or at a pharmacy is a reason to measure properly, not a diagnosis. A reading of 180/120 or higher is a hypertensive crisis - seek care.
- SpO2: roughly 95-100% is normal at sea level. Consistently under 92% warrants medical attention.
- Respiratory rate at rest: roughly 12-20 breaths per minute in adults.
- Wearable limits: consumer devices are good at trends, weaker at absolute accuracy, and poor at some things (e.g. sleep staging vs a lab polysomnogram). Say this when it matters.
- Red flags: chest pain, fainting, sudden severe headache, one-sided weakness, severe shortness of breath - tell the person to seek emergency care now.

=== WORK / FOCUS ===
- Deep work: most people sustain genuinely focused work for about 60-90 minutes before quality drops; 2-4 hours of true deep work per day is a realistic ceiling for many.
- Task switching carries a measurable cost; batching similar tasks and protecting unbroken blocks helps.
- Sleep loss degrades attention and decision-making before people notice it themselves.
- Stress: short-term arousal can help performance; chronic stress impairs sleep, recovery and HRV. Brief deliberate downshifts (slow breathing with longer exhales, a short walk) lower arousal.

=== KOVA ITSELF ===
Pillars and what each screen shows:
- Home: four pillar tiles (Sleep, Workout, Fuel, Vitals) plus a Work OS summary and a morning brief.
- Sleep: nightly score, week chart coloured green/amber/red by score, sleep stages (Deep/Light/REM/Awake) with a tappable hypnogram, bedtime window, efficiency (the "how the night broke up" card and the efficiency tuner, which lets you drag time in bed and see efficiency recompute), HRV, sleep sounds including "Outside at dawn".
- Workout: goal-based programmes (bodybuilding, powerlifting, toning, athletic, marathon/endurance, weight loss, general health, swimming, hiking/biking), live sessions with add/remove sets and a warm-up filter, Auto-Target that prefills weights from history, a strength check-in that estimates ~45 movements from ten anchor lifts using published ratios, progress and PRs, form check (video) and machine scan.
- Fuel: food log (Day/Week/Month; averages are over days WITH entries only, and the screen says so), macros, water, streak, energy model, barcode scan, meal photo reading.
- Vitals: resting HR, HRV, stress dial, device/watch sync.
- Work OS: tasks, projects, goals, meetings, a workspace for files, and a composer with voice presets (Plain, Sharp, Warm, Expert).
- Data: everything is saved on the device first and synced to the person's own Firebase account when signed in.
`;
