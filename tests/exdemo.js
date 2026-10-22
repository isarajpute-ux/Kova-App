/* p32: a moving picture of every exercise and stretch (src/p08_exdemo.js),
   all real: every exercise in Kova's list has a drawing, the joints come
   out the right length and bend the right way, the exercise page shows
   the muscles on the body figure, the cues, your own history (or says
   there is none), and the stretches for those muscles; the library
   filters and searches; Stretch picks today's muscles and its timer
   counts each hold (both sides when it says each); every exercise in a
   workout and in the program gets a picture. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
w.localStorage.setItem('kova_mode_v1', 'live');
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(1600);
  const doc = w.document, D = w.KovaDemo, P = w.KovaExPage, K = w.KSESS;
  ck('the picture and page modules loaded', !!D && !!P && !!K);
  const lib = K.XL.map((x) => x.n);
  const missing = lib.filter((n) => !D.find(n));
  ck('every one of Kova’s ' + lib.length + ' exercises has a moving picture (' + (missing.join(', ') || 'none missing') + ')', !missing.length);
  ck('calisthenics moves from the skill ladders have one too', ['Pike push-up', 'Handstand push-up', 'Muscle-up', 'L-sit', 'Pistol squat', 'Front lever', 'Weighted pull-ups', 'Straight-bar dips'].every((n) => D.find(n)));
  ck('a name Kova does not know gets the nearest drawing, or none (never a wrong guess)', D.find('Smith machine squat') === D.find('Barbell back squat') && D.find('Zercher carry') === D.find('Farmer carry') && D.find('Underwater basket weaving') === null && D.find('Medicine ball chest throw') !== D.find('Barbell row') && D.find('Arrow lunge') === D.find('Walking lunge'));

  /* the geometry: no broken numbers, limbs keep their length, knees bend forward */
  let bad = [];
  Object.keys(D.LIB).forEach((n) => { [0, 0.5, 1].forEach((u) => { const s = D.svg(n, u); if (!/^<svg/.test(s) || /NaN|undefined/.test(s)) bad.push(n + '@' + u); }); });
  ck('every drawing renders at the start, middle and finish with real numbers (' + (bad.slice(0, 4).join(', ') || 'all fine') + ')', !bad.length);
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const sq = D.LIB['barbell back squat'];
  const J0 = D.joints(sq.K[0]), J1 = D.joints(sq.K[1]);
  ck('a squat keeps the thigh and shin the same length from top to bottom', Math.abs(len(J0.hN, J0.kN) - 40) < 1 && Math.abs(len(J1.hN, J1.kN) - 40) < 1 && Math.abs(len(J1.kN, J1.aN) - 40) < 1);
  ck('in the bottom of a squat the knee is in front of the hips and the feet stay put', J1.kN[0] > J1.hN[0] && Math.abs(J1.aN[0] - J0.aN[0]) < 1);
  const rdl = D.joints(D.LIB['romanian deadlift'].K[1]);
  ck('in a Romanian deadlift the bar stays close to the legs (over the foot)', Math.abs(rdl.wN[0] - rdl.aN[0]) < 16);
  const ids = (D.svg('Barbell back squat', 0.3) + D.svg('Barbell back squat', 0.3)).match(/id="([^"]+)"/g);
  ck('two pictures on one screen never share a colour id', ids && new Set(ids).size === ids.length);
  /* p36b: a small version of Workout's body map, the working muscles glowing with the rep */
  const sqs = D.svg('Barbell back squat', 1);
  const litM = (svg) => [...svg.matchAll(/class="mm mp" data-m="([a-z]+)"/g)].map((m) => m[1]);
  const glowAt = (n, u) => { const m = /class="mm mp"[^>]*style="fill-opacity:([\d.]+)/.exec(D.svg(n, u)); return m ? +m[1] : 0; };
  ck('each picture is a human body like the body map: one smooth silhouette per part (head, trunk, arms with hands, legs with feet) with its muscles on it, no hair or robot joints', (sqs.match(/class="bo"/g) || []).length >= 11 && (sqs.match(/class="mm/g) || []).length >= 20 && !/class="(eye|jt|hair)/.test(sqs) && /C/.test((/class="bo" d="([^"]+)"/.exec(sqs) || [])[1] || ''));
  const fem = D.svg('Barbell curl', 1, { sex: 'f' }), mal = D.svg('Barbell curl', 1, { sex: 'm' });
  ck('…a woman or a man, like you (a different build, not just a label)', fem !== mal && (fem.match(/class="bo"/g) || []).length === (mal.match(/class="bo"/g) || []).length);
  ck('the working muscles glow and the rest stay as they are: an RDL lights the hamstrings, a squat the quads, a curl the biceps', litM(D.svg('Romanian deadlift', 1)).includes('hams') && !litM(D.svg('Romanian deadlift', 1)).includes('biceps')
    && litM(sqs).includes('quads') && litM(D.svg('Barbell curl', 1)).includes('biceps') && !litM(D.svg('Barbell curl', 1)).includes('quads'));
  ck('…brighter as the rep goes (down and up)', glowAt('Romanian deadlift', 1) > glowAt('Romanian deadlift', 0) + 0.4);
  ck('…the old glow spots only when asked (opts.glow)', !/class="gl/.test(sqs) && /class="gl"/.test(D.svg('Barbell back squat', 1, { glow: true })));
  const trk = (n) => { const m = /class="trk-l" d="M([^"]+)"/.exec(D.svg(n, 0.5)); return m ? m[1].split('L').map((p) => p.split(',').map(Number)) : null; };
  const sqT = trk('Barbell back squat'), cuT = trk('Barbell curl'), plT = trk('Plank');
  ck('a dashed path with an arrow shows the way it moves: the squat\u2019s path goes down, the curl\u2019s hands come up', sqT && sqT[sqT.length - 1][1] > sqT[0][1] + 15 && cuT && cuT[cuT.length - 1][1] < cuT[0][1] - 15 && /class="trk-a"/.test(D.svg('Barbell curl', 0.5)));
  ck('…and none on a hold that does not move (plank) or a stretch', !plT && !/trk-l/.test(D.svg('Standing quad stretch', 1)));

  /* stretches */
  ck('17 stretches, each with a hold time and 3 cues', D.STR.length >= 17 && D.STR.every((d) => /\d+ s/.test(d.hold) && d.cues.length >= 3));
  const groups = Object.keys(D.STRETCH_FOR);
  ck('every muscle group has at least one stretch', groups.every((g) => D.stretchesFor([g]).length >= 1) && ['quads', 'hams', 'glutes', 'calves', 'chest', 'lats', 'delts', 'triceps', 'biceps', 'lowback', 'abs', 'neck', 'adductors', 'forearms'].every((g) => groups.includes(g)));
  ck('a stretch that says "each leg" is held on both sides', JSON.stringify(P.secs('30 s each leg')) === '[30,30]' && JSON.stringify(P.secs('45 s')) === '[45]');

  /* the exercise page */
  P.open('Barbell back squat'); await wait(30);
  const sh = doc.getElementById('sheetIn');
  ck('the exercise page opens with the moving picture', !!sh.querySelector('.kxp-fig svg') && /Barbell back squat/.test(sh.textContent));
  const lit = [...sh.querySelectorAll('.kxp-body .m.p')].length, soft = [...sh.querySelectorAll('.kxp-body .m.s')].length;
  ck('the muscles worked light up on the body figure (main ones strong, helpers softer)', lit >= 4 && soft >= 2 && /Quads/.test(sh.textContent) && /Glutes/.test(sh.textContent));
  ck('the body figure is a copy, so the Customize figure keeps its ids', !sh.querySelector('.kxp-body [id]') && !!doc.getElementById('bodySvg'));
  ck('how to do it and the common mistakes are there, in plain words', /Knees point the same way as your toes/.test(sh.textContent) && /Knees falling inward/.test(sh.textContent));
  ck('with no sets logged it says so, nothing made up', /No sets logged for this yet/.test(sh.textContent) && !sh.querySelector('.kxp-rec'));
  ck('it suggests the stretches for those muscles', sh.querySelectorAll('.kxp-st').length >= 2 && /quad stretch/i.test(sh.textContent));
  const now = Date.now(), DAY = 864e5;
  w.localStorage.setItem('kova_hist_v1', JSON.stringify({ 'Barbell back squat': [
    { t: now - 9 * DAY, sets: [{ w: 185, r: 5 }, { w: 185, r: 5 }], top: 185, e1: 216 },
    { t: now - 2 * DAY, sets: [{ w: 205, r: 3 }, { w: 175, r: 9 }], top: 205, e1: 228 }] }));
  P.open('Barbell back squat'); await wait(30);
  const sh2 = doc.getElementById('sheetIn'), rec = sh2.querySelector('.kxp-rec');
  ck('with history: heaviest set, best estimated 1RM, most reps, best set', !!rec && /Heaviest\s*205/.test(rec.textContent) && /Best 1RM \(est\.\)\s*228/.test(rec.textContent) && /Most reps\s*9/.test(rec.textContent) && /Best set\s*1,575/.test(rec.textContent));
  ck('…a chart of the sessions and the last sets', !!sh2.querySelector('.kxp-chart svg path.ln') && /205 × 3, 175 × 9/.test(sh2.textContent));
  const fcBtn = doc.createElement('button'); fcBtn.setAttribute('data-exinfo', 'Lat pulldown'); doc.body.appendChild(fcBtn); fcBtn.click(); await wait(20);
  ck('every (i) opens this page', /Lat pulldown/.test(doc.getElementById('sheetIn').textContent) && !!doc.querySelector('#sheetIn .kxp-fig svg'));

  /* the library */
  doc.getElementById('sheetIn').innerHTML = '';
  const lb = doc.createElement('div'); lb.setAttribute('data-kxp', 'lib'); doc.body.appendChild(lb); lb.click(); await wait(20);
  const cells = doc.querySelectorAll('#sheetIn .kxp-cell');
  ck('Exercises lists every exercise with its picture', cells.length >= 80 && !!cells[0].querySelector('svg'));
  doc.querySelector('#sheetIn [data-kxp="g"][data-g="Back"]').click(); await wait(10);
  const back = [...doc.querySelectorAll('#sheetIn .kxp-cell b')].map((b) => b.textContent);
  ck('a muscle filter shows only that muscle', back.includes('Lat pulldown') && !back.includes('Barbell back squat'));
  doc.querySelector('#sheetIn [data-kxp="g"][data-g="all"]').click(); await wait(10);
  const q = doc.getElementById('kxpQ'); q.value = 'curl'; q.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(10);
  const found = [...doc.querySelectorAll('#sheetIn .kxp-cell b')].map((b) => b.textContent);
  ck('search finds by name', found.length >= 5 && found.every((n) => /curl/i.test(n)));
  doc.querySelector('#sheetIn .kxp-cell').click(); await wait(20);
  ck('an exercise opened from the library has a way back to it', !!doc.querySelector('#sheetIn [data-kxp="back"]'));
  doc.querySelector('#sheetIn [data-kxp="back"]').click(); await wait(10);
  ck('…and back keeps the search', !!doc.getElementById('kxpQ') && doc.getElementById('kxpQ').value === 'curl');

  /* stretch */
  const sb = doc.createElement('div'); sb.setAttribute('data-kxp', 'str'); doc.body.appendChild(sb); sb.click(); await wait(20);
  const st = doc.getElementById('sheetIn');
  ck('Stretch lists the stretches by body part', /Legs and hips/.test(st.textContent) && /Chest and shoulders/.test(st.textContent) && st.querySelectorAll('.kxp-cell').length >= 17);
  const today = P.todays();
  ck('for today’s workout it picks stretches for the muscles trained', Array.isArray(today) && (today.length === 0 ? /Start a workout/.test(st.textContent) : /Stretch with me/.test(st.textContent)));
  st.querySelector('.kxp-cell[data-kxp="stretch"]').click(); await wait(20);
  ck('a stretch opens with its picture, cues and a timer', !!doc.querySelector('#sheetIn .kxp-fig svg') && !!doc.querySelector('#sheetIn [data-kxp="hold"]'));
  let finished = false;
  P.startTimer({ hold: '2 s each side' }, () => { finished = true; });
  await wait(1200);
  const t1 = doc.getElementById('kxpTimer').textContent;
  await wait(4600);
  ck('the timer counts down one side, then the other, then says done', /1\s*First side/.test(t1) && finished);

  /* pictures next to every exercise */
  doc.body.insertAdjacentHTML('beforeend', '<div id="fake" class="screen on"><div class="exwrap"><div class="exrow act"><div class="exhead"><div class="exnum">1</div><div><div class="exname">Barbell back squat<button type="button" class="exinfo" data-exinfo="Barbell back squat">i</button></div></div></div></div></div>'
    + '<div class="exwrap"><div class="exrow"><div class="exhead"><div class="exnum">2</div><div><div class="exname">Leg press<button type="button" class="exinfo" data-exinfo="Leg press">i</button></div></div></div></div></div>'
    + '<div class="pgex"><span class="pgxn">Hip thrust<button type="button" class="exinfo" data-exinfo="Hip thrust">i</button></span></div>'
    + '<div class="list-item exadd" data-n="Cable fly"><div>Cable fly</div></div></div>');
  P.decorate(); await wait(30);
  const tbs = doc.querySelectorAll('#fake .kxp-tb');
  ck('every exercise in a workout and in the program gets a picture, after the number', tbs.length === 3 && doc.querySelector('#fake .exhead').children[1].classList.contains('kxp-tb'));
  ck('the exercise you are on moves; the others are still', !!doc.querySelector('#fake .exrow.act .kxp-tb [data-kxd]') && !!doc.querySelector('#fake .exrow:not(.act) .kxp-tb [data-kxd-still]'));
  ck('the picture is a button that says what it opens', doc.querySelector('#fake .kxp-tb').getAttribute('aria-label') === 'See how to do Barbell back squat');
  ck('"Add to today" shows the pictures too', !!doc.querySelector('#fake .exadd .kxp-th svg'));
  P.decorate(); await wait(10);
  ck('drawing again does not add a second picture', doc.querySelectorAll('#fake .kxp-tb').length === 3);
  doc.body.insertAdjacentHTML('beforeend', '<div id="hid" class="screen"><div class="exwrap"><div class="exrow"><div class="exhead"><div class="exnum">1</div><div><div class="exname">Deadlift<button type="button" class="exinfo" data-exinfo="Deadlift">i</button></div></div></div></div></div></div>');
  P.decorate(); await wait(10);
  ck('a screen you are not looking at gets no pictures (the first load stays light)', !doc.querySelector('#hid .kxp-tb'));

  ck('no script errors', !errors.filter((e) => !/Not implemented|navigation/i.test(e)).length);
  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  if (errors.length) console.log(errors.slice(0, 4).join('\n'));
  console.log(`${R.length - failed.length}/${R.length} exdemo`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
