/* KovaImport (src/p08_import.js): MyFitnessPal (ZIP and CSV), Hevy,
   Strong, and any food CSV, read on-device into Kova's own stores;
   re-importing adds nothing; imported history feeds the charts and
   the correlations. Sample files follow each app's real export columns. */
const fs = require('fs');
const zlib = require('zlib');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* a real ZIP: deflated entries, local headers, central directory */
function zip(files) {
  const parts = [], central = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text), data = zlib.deflateRawSync(raw), nb = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nb, data); central.push(ch, nb); off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
const MFP = 'Date,Meal,Calories,Fat (g),Saturated Fat,Polyunsaturated Fat,Monounsaturated Fat,Trans Fat,Cholesterol,Sodium (mg),Potassium,Carbohydrates (g),Fiber,Sugar,Protein (g),Vitamin A,Vitamin C,Calcium,Iron,Note\n'
  + [1, 2, 3].map((n) => `${d(n)},Breakfast,410,12,4,2,5,0,180,320,410,45,6,12,32,8,10,15,12,\n${d(n)},Lunch,620,20,6,4,8,0,90,780,650,60,9,5,48,4,30,10,20,\n${d(n)},Dinner,700,25,8,5,10,0,120,900,700,55,7,8,55,6,25,12,18,`).join('\n') + '\n';
const MEAS = 'Date,Weight\n' + [1, 8, 15].map((n, i) => `${d(n)},${82 - i * 0.6}`).join('\n') + '\n';
const mon = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.getDate() + ' ' + x.toLocaleString('en-US', { month: 'short' }) + ' ' + x.getFullYear(); };
const HEVY = '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"\n'
  + `"Push, heavy","${mon(4)}, 07:10","${mon(4)}, 08:02","","Bench Press (Barbell)","","","0","warmup","40","10","","",""\n`
  + `"Push, heavy","${mon(4)}, 07:10","${mon(4)}, 08:02","","Bench Press (Barbell)","","","1","normal","80","5","","","8"\n`
  + `"Push, heavy","${mon(4)}, 07:10","${mon(4)}, 08:02","","Bench Press (Barbell)","","","2","normal","80","5","","","8.5"\n`
  + `"Push, heavy","${mon(4)}, 07:10","${mon(4)}, 08:02","","Overhead Press (Barbell)","","","0","normal","50","6","","",""\n`
  + `"Pull","${mon(2)}, 18:00","${mon(2)}, 18:45","","Deadlift (Barbell)","","","0","normal","140","3","","",""\n`;
const STRONG = '"Date","Workout Name","Duration","Exercise Name","Set Order","Weight","Reps","Distance","Seconds","Notes","Workout Notes","RPE"\n'
  + `"${d(6)} 06:30:00","Legs","1h 5m","Squat (Barbell)","1","225","5","0","0","","",""\n`
  + `"${d(6)} 06:30:00","Legs","1h 5m","Squat (Barbell)","2","225","5","0","0","","",""\n`;
const CALAI = 'date,food name,calories,protein (g),carbs (g),fat (g)\n' + `${d(1)} 13:05,Poke bowl,640,38,70,20\n${d(1)} 19:40,"Pasta, with pesto",780,22,95,32\n`;

function boot() {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.DecompressionStream = globalThis.DecompressionStream; w.ReadableStream = globalThis.ReadableStream; w.TextDecoder = globalThis.TextDecoder;
  w.localStorage.setItem('kova_mode_v1', 'live');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, doc: w.document };
}
const file = (w, buf, name, type) => new w.File([buf], name, { type: type || 'text/csv' });

(async () => {
  const { w, doc } = boot();
  await wait(800);
  const I = w.KovaImport;
  ck('Settings has "Import from other apps"', !!doc.getElementById('kimRow'));
  ck('the CSV reader handles quotes and commas inside fields', I.csv('a,b\n"x, y","say ""hi"""\n')[0].b === 'say "hi"' && I.csv('a,b\n"x, y",1\n')[0].a === 'x, y');
  ck('Hevy\'s date format is understood', new Date(I.when('28 Sep 2026, 07:10')).getHours() === 7);

  // MyFitnessPal ZIP
  const z = zip({ 'File-Export-2026/Nutrition-Summary-2026.csv': MFP, 'File-Export-2026/Measurement-Summary-2026.csv': MEAS });
  const r1 = await I.run('mfp', [file(w, z, 'File-Export.zip', 'application/zip')]);
  ck('MyFitnessPal ZIP: 9 meals and 3 weigh-ins', r1.food.added === 9 && r1.weights === 3);
  ck('the summary says what came in', I.summary(r1) === 'Imported 9 meals and 3 weigh-ins.');
  const day = w.KovaFuel.forDay(d(2));
  ck('meals land on the right day and slot, with macros and fiber', day.length === 3 && day.some((e) => e.meal === 'Dinner' && e.kcal === 700 && e.p === 55 && e.m.fib === 7));
  const r1b = await I.run('mfp', [file(w, z, 'File-Export.zip', 'application/zip')]);
  ck('importing the same file again adds nothing', r1b.food.added === 0 && r1b.food.skipped === 9 && r1b.weights === 0);
  ck('...and says so', /Nothing new to import · 9 already here, skipped/.test(I.summary(r1b)));

  // Hevy
  const r2 = await I.run('hevy', [file(w, HEVY, 'workouts.csv')]);
  ck('Hevy: two workouts', r2.workouts.added === 2);
  const log = JSON.parse(w.localStorage.getItem('kova_log_v1'));
  const push = log.find((s) => s.day === 'Push, heavy');
  ck('sets come in as pounds, warm-ups kept apart', push && Math.abs(push.ex[0].sets[1].w - 176.4) < 0.2 && push.ex[0].sets[0].role === 'warm' && push.mins === 52);
  ck('volume counts working sets only', push && Math.abs(push.vol - (176.4 * 5 * 2 + 110.2 * 6)) < 3);
  const hist = JSON.parse(w.localStorage.getItem('kova_hist_v1'));
  ck('personal bests are rebuilt for each exercise', hist['Bench Press (Barbell)'] && hist['Bench Press (Barbell)'][0].e1 > 200 && hist['Deadlift (Barbell)']);
  ck('re-importing Hevy adds nothing', (await I.run('hevy', [file(w, HEVY, 'workouts.csv')])).workouts.added === 0);

  // Strong (lb)
  const r3 = await I.run('strong', [file(w, STRONG, 'strong.csv')], 'lb');
  const legs = JSON.parse(w.localStorage.getItem('kova_log_v1')).find((s) => s.day === 'Legs');
  ck('Strong: one workout, weights as entered in lb, duration read', r3.workouts.added === 1 && legs.ex[0].sets[0].w === 225 && legs.mins === 65);

  // Cal AI / any food CSV
  const r4 = await I.run('food', [file(w, CALAI, 'cal-ai.csv')]);
  const poke = w.KovaFuel.forDay(d(1)).find((e) => /Poke/.test(e.items[0].n));
  ck('any food CSV: columns found by name, time kept', r4.food.added === 2 && poke && poke.kcal === 640 && poke.p === 38 && new Date(poke.at).getHours() === 13);
  ck('a food name with a comma survives', w.KovaFuel.forDay(d(1)).some((e) => e.items[0].n === 'Pasta, with pesto'));

  // it feeds the rest of the app
  ck('imported meals count in the food history, not trimmed to 200', w.KovaFuel.all().length === 11);
  ck('imported workouts count toward this week\'s strength sessions (GLP-1)', typeof w.KovaGLP1.strength().sessions === 'number');
  ck('weights reach the weight log the targets use', (w.KP.get('wlog') || []).length === 3);

  // the sheet
  I.open(); await wait(20);
  ck('the sheet lists MyFitnessPal, Hevy, Strong and any food CSV', doc.querySelectorAll('#sheetIn .kim input[type=file]').length === 4 && /read on this phone and never uploaded/.test(doc.querySelector('#sheetIn .kim').textContent));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
