/* Every card on Vitals that looked tappable does something real (p28).
   Before, 18 did nothing. Now:
     Recovery card      where today's score comes from, reading by reading
     HRV / RHR / Sleep  that reading (HRV screen, the resting heart rate
                        reading, Sleep); Sleep and trend opens Sleep
     Steadiest tile     that reading
     Morning read       today's read and the readings behind it, with "Ask
                        Cora": her box opens with the question written and
                        nothing is sent until you press Send
     Recovery this week Recovery;  How you're feeling: how it is estimated
     Heart activity     Stress;  Today's vitals: the reading, or what it means
     a reading row      your value, your healthy band, where you sit, what it means
     Start / stop doing why, and "Remind me daily": a real reminder that is
                        kept, survives a reload and is in the reminders list
   Each answers Enter too. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* waits for something to be true (up to 4 s), so a busy machine does not fail it */
const until = async (f) => { for (let i = 0; i < 80; i++) { try { if (f()) return true; } catch (e) {} await wait(50); } return false; };
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: new VirtualConsole() });
const w = dom.window;
w.localStorage.setItem('kova.auth.skipped', '1');
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
(async () => {
  await wait(2200);
  const doc = w.document, V = w.KovaVDock, $ = (s) => doc.querySelector(s);
  const click = (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const screen = () => doc.querySelector('.screen.on').id.replace('s-', '');
  const sheetTxt = () => { const s = $('.sheet.on') || $('#sheet.on') || $('.sheet'); return s ? s.textContent : ''; };
  const back = async (sec) => { if (w.closeSheet) w.closeSheet(); w.go('vitals'); await wait(120); V.show(sec, false); await wait(120); };
  w.go('vitals'); await wait(300);

  /* Today */
  await back('today');
  click($('#s-vitals .kvd-power .kvd-ct')); await wait(80);
  ck('the Recovery card shows where the score comes from: HRV, resting heart rate, sleep, and says honestly what is in the score', /Recovery \d+/.test(sheetTxt()) && !/no heart readings have come in/.test(sheetTxt()) && /HRV/.test(sheetTxt()) && /Resting heart rate/.test(sheetTxt()) && /Sleep/.test(sheetTxt()) && /Open Recovery/.test(sheetTxt()));
  await back('today'); click($('#s-vitals .kvd-sm[data-k="hrv"]')); await wait(80);
  ck('the HRV tile opens HRV', screen() === 'hrv');
  await back('today'); click($('#s-vitals .kvd-sm[data-k="sleep"]')); await wait(80);
  ck('the Sleep tile opens Sleep', screen() === 'sleep');
  await back('today'); click($('#s-vitals .kvd-trend')); await wait(80);
  ck('Sleep and trend opens Sleep', screen() === 'sleep');
  await back('today'); click($('#s-vitals .kvd-sm[data-k="rhr"]')); await until(() => /healthy band/.test(sheetTxt()));
  ck('the Resting HR tile opens that reading in Readings & signals', V.current() === 'signals' && /Resting heart rate/.test(sheetTxt()) && /healthy band/.test(sheetTxt()));
  await back('today'); click($('#s-vitals .card.kova .kova-txt')); await wait(80);
  ck('the morning read opens today’s read with the readings behind it', /Today’s read/.test(sheetTxt()) && /The readings behind it/.test(sheetTxt()));
  const ask = $('.kvt [data-ask]');
  ck('with "Ask Cora, your Recovery Coach"', ask && /Ask Cora/.test(ask.textContent));
  const jobs0 = Object.keys(w.KovaCrew._S.jobs || {}).length;
  click(ask); await wait(400);
  const pop = doc.getElementById('klPop');
  ck('Ask Cora opens her box with the question written, and sends nothing until you press Send', pop && /Cora/.test(pop.textContent) && /morning read/i.test((doc.getElementById('klAsk') || {}).value || '') && Object.keys(w.KovaCrew._S.jobs || {}).length === jobs0);
  w.KovaListen.close(); await wait(300);
  await back('today');
  const wk = [...doc.querySelectorAll('#s-vitals .card')].find((c) => c.querySelector('#recoveryGrid'));
  click(wk.firstElementChild); await wait(80);
  ck('Recovery this week opens Recovery', screen() === 'recovery');

  /* How you're feeling */
  await back('feeling');
  const fc = [...doc.querySelectorAll('#s-vitals .card')].find((c) => c.querySelector('#symptomCards'));
  ck('its "From your data" chip can be tapped and says so', fc.querySelector('.chip').style.pointerEvents === 'auto' && fc.querySelector('.chip').getAttribute('role') === 'button');
  click(fc.querySelector('.chip')); await wait(80);
  ck('and explains how Kova estimates how you feel, and that it is not a diagnosis', /How Kova estimates how you feel/.test(sheetTxt()) && /not a diagnosis/.test(sheetTxt()));

  /* Readings & signals */
  await back('signals');
  const row = [...doc.querySelectorAll('#s-vitals .ronbio')].find((b) => /Respiratory rate/.test(b.textContent));
  click(row); await wait(80);
  ck('a reading row opens the reading: value, healthy band, where you sit, what it means', /Respiratory rate/.test(sheetTxt()) && /(Inside|Above|Below) the healthy band/.test(sheetTxt()) && /Breaths a minute/.test(sheetTxt()));
  await back('signals');
  const st = $('#s-vitals .kvd-tile[data-k]');
  ck('the Steadiest tile can be tapped', st && st.getAttribute('role') === 'button');

  /* Heart & stress */
  await back('heart');
  const ha = [...doc.querySelectorAll('#s-vitals .card')].find((c) => /^\s*Heart activity/.test(c.textContent));
  click(ha.querySelector('.big')); await wait(80);
  ck('Heart activity opens Stress (your heart through the day)', screen() === 'stress');
  await back('heart');
  const vr = [...doc.querySelectorAll('#vitalsRows .volrow')];
  click(vr.find((r) => /Blood oxygen/.test(r.textContent))); await wait(80);
  ck('Blood oxygen in Today’s vitals says what it means', /95 to 100% is normal at rest/.test(sheetTxt()));
  await back('heart');
  click(vr.find((r) => /Respiratory rate/.test(r.textContent))); await until(() => /Breaths a minute/.test(sheetTxt()));
  ck('Respiratory rate there opens that reading', V.current() === 'signals' && /Breaths a minute/.test(sheetTxt()));

  /* Health & actions: a real reminder */
  await back('care');
  const item = [...doc.querySelectorAll('#startStop > div')].find((d) => /Water first thing/.test(d.textContent));
  click(item); await wait(80);
  ck('a Start doing item opens why, with a time and "Remind me daily"', /Water first thing in the morning/.test(sheetTxt()) && $('#kvtTime') && $('#kvtTime').value === '07:30' && /Remind me daily/.test(sheetTxt()));
  $('#kvtTime').value = '07:15';
  click($('.kvt [data-habit]')); await wait(80);
  const A = w.__alerts.get(), hb = A.find((a) => a.id === 'habit:water-first-thing-in-the-morning');
  ck('it becomes a daily reminder at the time you chose', hb && hb.on && hb.t === '07:15' && /Start: Water first thing/.test(hb.title) && hb.days.every((d) => d === 1));
  w.__alerts.reload();
  ck('kept after a reload, with the others in Settings > Notifications', w.__alerts.get().some((a) => a.id === 'habit:water-first-thing-in-the-morning' && a.t === '07:15') && (w.KP.get('alerts') || []).some((a) => a.id === 'habit:water-first-thing-in-the-morning'));
  ck('the phone reminder list includes it', !!w.KovaPush && !!w.KovaPush.items()['habit_water-first-thing-in-the-morning']);

  /* keyboard */
  await back('today');
  const sm = $('#s-vitals .kvd-sm[data-k="sleep"]');
  sm.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(80);
  ck('Enter on a tile works like a tap', screen() === 'sleep');

  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
