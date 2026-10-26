/* KovaLabs (src/p08_labs.js) and functions/labs.js: lab report ->
   confirmed rows -> a trend per marker, flagged in plain words and linked
   to the right part of Kova, never diagnosed. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const { parseRows, extract } = require(__dirname + '/../functions/labs.js');
const R = [];
const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const REPORT = `QUEST DIAGNOSTICS   Patient: Sample
Collected: 2026-09-12 08:10
Test Result Units Reference Range
Ferritin 22 ng/mL 30-400
Vitamin B12 480 pg/mL 200-900
Vitamin D, 25-Hydroxy 24 ng/mL 30-100
Glucose 92 mg/dL 70-99
LDL Cholesterol 138 mg/dL 0-100
HDL Cholesterol 58 mg/dL 40-100
Page 1 of 2   Phone 555-0100`;

(async () => {
  // server extraction
  const rows = parseRows('```json\n[{"name":"Ferritin","value":"22","unit":"ng/mL","low":30,"high":400,"date":"2026-09-12"},{"name":"CRP","value":"<5","qualifier":"<"}]\n```');
  ck('the server keeps only rows with a number, and cleans them', rows.length === 1 && rows[0].value === 22 && rows[0].low === 30);
  let sent = null;
  const ex = await extract({ cfg: { anthropicKey: 'k', model: 'm' }, body: { text: REPORT }, fetch: async (u, o) => { sent = JSON.parse(o.body); return { ok: true, json: async () => ({ content: [{ type: 'text', text: '[{"name":"Ferritin","value":22,"unit":"ng/mL","low":30,"high":400,"date":"2026-09-12"}]' }] }) }; } });
  ck('the model is told to extract, not interpret', /do not interpret/i.test(sent.system) && /no diagnosis/i.test(sent.system) && ex.rows.length === 1 && sent.temperature === 0);

  // the app
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://kova.local/', virtualConsole: vc });
  const w = dom.window;
  const auth = { currentUser: null, onAuthStateChanged(cb) { cb(null); }, signOut: () => Promise.resolve() };
  w.firebase = { initializeApp() {}, apps: [{}], auth: () => auth,
    database: () => ({ ref: () => ({ child() { return this; }, set: () => Promise.resolve(), update: () => Promise.resolve(),
      remove: () => Promise.resolve(), once: () => Promise.resolve({ val: () => null }), on() {}, off() {} }) }),
    analytics: () => ({ logEvent() {}, setUserId() {} }) };
  w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  w.localStorage.setItem('kova_mode_v1', 'live');
  w.localStorage.setItem('kova.auth.skipped', '1');
  w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(600);
  const L = w.KovaLabs, doc = w.document;
  ck('Vitals has a Lab results entry', !!doc.getElementById('klbCard') && /Upload a lab PDF or photo/.test(doc.getElementById('klbCard').textContent));
  const parsed = L.parseText(REPORT);
  ck('a PDF\'s text is parsed on the phone: six markers', parsed.length === 6);
  const fer = parsed.find((r) => r.key === 'ferritin');
  const vd = parsed.find((r) => r.key === 'vitd');
  ck('"25-Hydroxy" in a name is not read as the result', vd && vd.value === 24 && vd.low === 30);
  ck('with value, unit, range and the collection date', fer && fer.value === 22 && fer.unit === 'ng/mL' && fer.low === 30 && fer.high === 400 && fer.date === '2026-09-12');
  ck('page furniture (page numbers, phone) is not read as a result', !parsed.some((r) => /page|phone/i.test(r.name)));
  ck('names are recognised as one marker each', L.keyOf('Vitamin D, 25-Hydroxy') === 'vitd' && L.keyOf('HbA1c') === 'hba1c' && L.keyOf('Hemoglobin') === 'hgb');

  // confirm: nothing saved until then; untick one
  L.confirmRows({ rows: parsed, how: 'phone' }); await wait(20);
  ck('every row is shown to check before anything is saved', doc.querySelectorAll('#sheetIn .klb-r').length === 6 && L._D().results.length === 0);
  doc.querySelectorAll('#sheetIn .klb-r')[3].querySelector('.klb-ok input').checked = false;       // glucose: not mine
  doc.querySelector('#sheetIn [data-l="save"]').click(); await wait(20);
  ck('confirmed rows are saved; the unticked one is not', L._D().results.length === 5 && !L._D().results.some((r) => r.key === 'glucose'));

  // a second report makes a trend
  L.confirmRows({ rows: [{ name: 'Ferritin', key: 'ferritin', value: 41, unit: 'ng/mL', low: 30, high: 400, date: '2026-12-01' }], how: 'phone' }); await wait(10);
  doc.querySelector('#sheetIn [data-l="save"]').click(); await wait(10);
  const m = L.markers(), f2 = m.find((x) => x.key === 'ferritin');
  ck('each marker keeps its history over time', f2.list.length === 2 && f2.last.value === 41 && !f2.out);
  L.open(); await wait(10);
  const sheet = doc.querySelector('#sheetIn .klb');
  ck('a trend line is drawn once there are two results', !!sheet.querySelector('.klb-sp polyline'));
  const text = sheet.textContent;
  ck('out-of-range values are flagged in plain words, with a clinician', /Below the lab’s range\. Worth discussing with your clinician\./.test(text) && /Above the lab’s range/.test(text));
  ck('never a diagnosis', !/(you have|deficien|diabet|anemi|anaemi|disease|disorder)/i.test(text) && /does not diagnose/.test(text));
  ck('markers link to the part of Kova they touch (vitamin D -> sleep, LDL -> food)', !!sheet.querySelector('[data-go2="sleep"]') && !!sheet.querySelector('[data-go2="fuel"]'));
  ck('the Vitals card counts markers and what is outside the range', /5 markers · 2 outside the lab’s range/.test(doc.getElementById('klbCard').textContent));

  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
  console.log(`\n${R.length - failed.length}/${R.length} passing`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
