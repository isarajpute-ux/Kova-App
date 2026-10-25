/* p37: the attachment you use, remembered (src/p08_attach.js), and an open
   Kova picking up a new version by itself (src/p08_fresh.js).

   Attachments: every exercise in today's workout has a button; a cable
   exercise offers Rope, V-bar and the rest; the choice is saved for that
   exercise and shown next time; in "Add to today" the button opens the
   choices without adding the exercise, and an exercise added afterwards
   takes the attachment you use with it; a finished workout keeps it in the
   log; you can type your own.

   Updates: with a newer version out, coming back after a minute away
   reloads, unless a sheet is open (then a Refresh card); same version,
   nothing happens. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
['kova.auth.skipped', 'kova.auth.local'].forEach((k) => w.localStorage.setItem(k, '1'));
w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
w.localStorage.setItem('kova_mode_v1', 'live');
w.localStorage.setItem('kova_profile_v2', JSON.stringify({ tourSeen: true }));
w.KOVA_BUILD = 'build-old';
let newest = 'build-old';
w.fetch = (u) => /version\.json/.test(String(u)) ? Promise.resolve({ ok: true, json: () => Promise.resolve({ v: newest }) }) : Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') });
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(1500);
  const doc = w.document, K = w.KSESS, A = w.KovaAttach;
  ck('the module loaded', !!A && !!w.KovaFresh);
  K.api.build([['Rope pushdown', 3, 10, 15], ['Barbell curl', 3, 8, 12]], 'Arms');
  w.go('session'); await wait(250); A.decorate(); await wait(20);
  const chips = [...doc.querySelectorAll('#s-session .katt-chip')];
  ck('every exercise in today’s workout has an attachment button', chips.length === 2 && chips.every((c) => /\+ Attachment/.test(c.textContent)));
  chips[0].click(); await wait(30);
  const sh = doc.getElementById('sheetIn');
  ck('a cable exercise offers the cable attachments (Rope, V-bar, Straight bar...)', /Rope/.test(sh.textContent) && /V-bar/.test(sh.textContent) && /Straight bar/.test(sh.textContent));
  sh.querySelector('[data-katt-v="Rope"]').click(); await wait(120);
  ck('choosing Rope puts it on the exercise and remembers it for Rope pushdown', K.state().ex[0].att === 'Rope' && A.get('Rope pushdown') === 'Rope');
  ck('…and the button now says Rope', /Rope/.test(doc.querySelector('#s-session .katt-chip').textContent) && doc.querySelector('#s-session .katt-chip').classList.contains('set'));
  /* a barbell exercise and your own words */
  doc.querySelectorAll('#s-session .katt-chip')[1].click(); await wait(30);
  /* p43: the picker is the dial; a curl opens on Arms, the bars that fit first */
  const P = A._PK(), names = [...sh.querySelectorAll('#kattCard .kdl-t b')].map((b) => b.textContent);
  ck('the picker is a dial of body areas, opened on the exercise’s own (a curl: Arms), no "Best for this one"', !!sh.querySelector('.kdl') && sh.querySelectorAll('.kdl-l').length === 7 && P.area === 'Arms' && sh.querySelector('.kdl-l.on').textContent === 'Arms' && !/Best for this one/.test(sh.textContent));
  ck('…the card shows that area’s attachments in a row, the ones for a barbell first (Straight bar, EZ bar)', names[0] === 'Straight bar' && names[1] === 'EZ bar' && names.length >= 4);
  sh.querySelector('[data-katt-open]').click(); await wait(20);
  ck('…the arrows at its top right open them all, each with what it is for, and a box for your own', sh.querySelector('#kattCard').classList.contains('open') && !!sh.querySelector('#kattCard .kdl-t small') && !!sh.querySelector('.katt-own input'));
  sh.querySelector('.katt-own input').value = 'Fat grips';
  sh.querySelector('[data-katt-own]').click(); await wait(80);
  ck('you can type your own, and it is kept', A.get('Barbell curl') === 'Fat grips' && K.state().ex[1].att === 'Fat grips');
  /* Add to today */
  doc.getElementById('addExBtn').click(); await wait(60);
  doc.querySelector('#sheet .chip.gp[data-g="Triceps"]').click(); await wait(60);
  A.decorate(); await wait(10);
  const row = doc.querySelector('#sheet .exadd[data-n="Rope pushdown"]');
  ck('in "Add to today" each exercise has the button too, showing the one you use', row && /Rope/.test(row.querySelector('.katt-add').textContent));
  const other = doc.querySelector('#sheet .exadd[data-n="Skull crusher"]');
  const n0 = K.state().ex.length;
  other.querySelector('.katt-add').click(); await wait(30);
  ck('…tapping it opens the choices without adding the exercise', K.state().ex.length === n0 && !!doc.querySelector('#sheet .katt-p'));
  doc.querySelector('#sheet .katt-p [data-katt-v="EZ bar"]').click(); await wait(30);
  ck('…choosing one saves it and updates the button', A.get('Skull crusher') === 'EZ bar' && /EZ bar/.test(other.querySelector('.katt-add').textContent) && !doc.querySelector('#sheet .katt-p'));
  other.click(); await wait(80);
  const added = K.state().ex[K.state().ex.length - 1];
  ck('an exercise added afterwards takes the attachment you use with it', added.n === 'Skull crusher' && added.att === 'EZ bar');
  /* the log keeps it */
  K.state().ex.forEach((e) => e.sets.forEach((s) => { s.d = 1; s.w = 20; s.r = 10; }));
  const before = K.log().length; K.finish(); await wait(100);
  const last = K.log()[K.log().length - 1];
  ck('a finished workout keeps each exercise’s attachment in the log', K.log().length === before + 1 && last.ex.some((e) => e.n === 'Rope pushdown' && e.att === 'Rope'));

  /* updates */
  const F = w.KovaFresh; let reloads = 0; F.reload = () => { reloads++; };
  let hidden = false; Object.defineProperty(doc, 'hidden', { configurable: true, get: () => hidden });
  let t = 1e12; w.Date.now = () => t;
  const away = async (ms) => { hidden = true; doc.dispatchEvent(new w.Event('visibilitychange')); t += ms; hidden = false; doc.dispatchEvent(new w.Event('visibilitychange')); await wait(50); };
  await away(5 * 60000);
  ck('the same version: coming back does nothing', reloads === 0 && !doc.getElementById('kfr'));
  newest = 'build-new';
  if (w.closeSheet) w.closeSheet(); await wait(20);
  await away(5 * 60000);
  ck('a newer version out and back after a few minutes: it reloads by itself', reloads === 1);
  w.openSheet('<p>busy</p>'); await wait(10);
  await away(5 * 60000);
  ck('…but not in the middle of something (a sheet open): it offers Refresh instead', reloads === 1 && !!doc.getElementById('kfr'));
  doc.querySelector('#kfr [data-kfr="go"]').click();
  ck('…and Refresh reloads', reloads === 2);

  ck('no script errors', !errors.filter((e) => !/Not implemented|navigation/i.test(e)).length);
  const failed = R.filter((x) => !x[1]);
  R.forEach((x) => console.log((x[1] ? 'ok  ' : 'FAIL') + ' ' + x[0]));
  if (errors.length) console.log(errors.slice(0, 4).join('\n'));
  console.log(`${R.length - failed.length}/${R.length} attach`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
