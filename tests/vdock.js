/* Vitals as one section at a time behind a dock of icon tiles
   (src/p08_vdock.js + .css): the seven sections become seven tiles; a tap
   shows that section with its title ("Vitals: Readings & signals");
   arrows and the keyboard step through; a section opened from elsewhere
   comes up in the dock; the new cards (Recovery, the sleep trend,
   Steadiest and Most off) show your real readings, or say there are none. */
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const css = fs.readFileSync(__dirname + '/../src/p08_vdock.css', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
w.localStorage.setItem('kova.auth.skipped', '1');
w.localStorage.setItem('kova.sex', JSON.stringify('female'));
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));

(async () => {
  await wait(2200);
  const doc = w.document, V = w.KovaVDock, $ = (s) => doc.querySelector(s);
  const click = (el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  const scr = doc.getElementById('s-vitals');
  ck('nothing is moved until Vitals is opened (loading stays light)', !scr.classList.contains('kvd-on') && !doc.getElementById('kvdDock'));
  w.go('vitals'); await wait(300);
  const ids = V.sections().map((s) => s.id);
  ck('the module loads and takes over Vitals', !!V && scr.classList.contains('kvd-on'));
  ck('all seven sections are in the dock: Today, Cycle, Hearing, Feeling, Signals, Heart, Health', ids.length === 7 && ['today', 'cycle', 'noise', 'feeling', 'signals', 'heart', 'care'].every((i) => ids.includes(i)));
  const tiles = [...doc.querySelectorAll('#kvdRow .kvd-t')];
  ck('one tile each, in a tab list, each named', tiles.length === 7 && $('#kvdRow').getAttribute('role') === 'tablist' && tiles.every((t) => t.getAttribute('role') === 'tab' && t.title && t.querySelector('svg')));
  ck('the dock sits at the bottom of Vitals', scr.lastElementChild.id === 'kvdDock');
  ck('the old "Collapse everything" bar and drop-down headers are replaced (styles hide them)', /#s-vitals\.kvd-on>\.vall\{display:none\}/.test(css) && /#s-vitals\.kvd-on>\.vsec>\.vsec-h\{display:none\}/.test(css));

  /* one at a time */
  const curOnly = (id) => [...scr.querySelectorAll(':scope > .vsec')].every((s) => s.classList.contains('kvd-cur') === (s.querySelector('.vsec-h').dataset.s === id));
  ck('it starts on Today, the only section shown', V.current() === 'today' && curOnly('today') && /#s-vitals\.kvd-on>\.vsec:not\(\.kvd-cur\)\{display:none\}/.test(css));
  ck('the title reads "Vitals: Today" with its place, 1 / 7', $('#kvdName').textContent === 'Today' && $('#kvdHead .kvd-hl').textContent === 'Vitals:' && $('#kvdPos').textContent === '1 / 7');
  click(doc.getElementById('kvdT-signals')); await wait(20);
  ck('tap a tile: that section shows, with its title', V.current() === 'signals' && curOnly('signals') && $('#kvdName').textContent === 'Readings & signals' && $('#kvdPos').textContent === '5 / 7');
  ck('the tile you are on is selected and drawn filled; the rest are outlines', doc.getElementById('kvdT-signals').getAttribute('aria-selected') === 'true' && doc.getElementById('kvdT-signals').classList.contains('on')
    && !!doc.querySelector('#kvdT-signals .kvd-fill') && !doc.querySelector('#kvdT-heart .kvd-fill') && tiles.filter((t) => t.getAttribute('aria-selected') === 'true').length === 1);
  ck('its section is open and labelled by its tile', doc.getElementById('kvdP-signals').classList.contains('open') && doc.getElementById('kvdP-signals').getAttribute('aria-labelledby') === 'kvdT-signals');
  click($('#kvdHead [data-kv="next"]')); await wait(10);
  ck('the arrow by the title steps to the next one', V.current() === 'heart');
  click($('#kvdHead [data-kv="prev"]')); click($('#kvdHead [data-kv="prev"]')); await wait(10);
  ck('and back', V.current() === 'feeling');
  const row = $('#kvdRow');
  key(row, 'ArrowRight'); await wait(10);
  ck('keyboard: arrow right on the dock moves on', V.current() === 'signals');
  key(row, 'End'); await wait(10);
  ck('keyboard: End goes to the last, Home to the first', V.current() === 'care' && (key(row, 'Home'), V.current() === 'today'));
  key(row, 'ArrowLeft'); await wait(10);
  ck('it wraps round, like a wheel', V.current() === 'care');
  ck('only the selected tile is in the tab order', [...doc.querySelectorAll('#kvdRow .kvd-t')].filter((t) => t.tabIndex === 0).length === 1 && doc.getElementById('kvdT-care').tabIndex === 0);
  ck('the choice is remembered', w.localStorage.getItem('kova.vitals.sec') === 'care');

  /* something else opening a section brings it up */
  const cyH = scr.querySelector('.vsec-h[data-s="cycle"]'); cyH.classList.remove('open'); await wait(10);
  cyH.classList.add('open'); await wait(30);
  ck('a section opened from elsewhere (search, Help, a notification) comes up in the dock', V.current() === 'cycle' && $('#kvdName').textContent === 'Cycle & fertility');
  ck('Hearing & noise is there, with its own content', V.show('noise') && !!doc.getElementById('knSec') && curOnly('noise'));

  /* the cards, from real readings */
  w.KovaToday.readiness = () => ({ score: 62 });
  w.KovaAgent.audit = () => ({ metrics: [
    { id: 'rhr', status: 'watch', value: 66, unit: 'bpm', baseline: 60, change: 6 },
    { id: 'hrv', status: 'ok', value: 52, unit: 'ms', baseline: 50, change_pct: 4 },
    { id: 'training', status: 'ok', value: 3, unit: 'sessions in 7 days' },
    { id: 'sleep', status: 'fix', value: 330, unit: 'minutes last night', target: 480 },
    { id: 'bedtime', status: 'neglect', value: null },
    { id: 'food', status: 'neglect', value: 0, target: 120 },
    { id: 'hydration', status: 'neglect', value: null }
  ] });
  const day = (i) => { const t = new w.Date(Date.now() - i * 864e5); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); };
  w.KovaSleepLog.nights = () => [{ k: day(0), mins: 330 }, { k: day(1), mins: 480 }, { k: day(3), mins: 420 }];
  V.show('today', true); await wait(20);
  const P = $('#kvdP-today .kvd-power');
  ck('Today opens with Recovery as a big thin number: your score, 62 /100, Moderate', !!P && P.querySelector('.kvd-num').textContent === '62' && /\/100/.test(P.textContent) && P.querySelector('.kvd-word').textContent === 'Moderate');
  ck('the glowing ring sits at 62 on the track, with the band and pills at 50 and 75', P.querySelector('.kvd-knob').style.left === '62%' && P.querySelectorAll('.kvd-pill').length === 2 && !!P.querySelector('.kvd-band'));
  const sm = [...P.querySelectorAll('.kvd-sm')];
  ck('three readings: HRV 52 ms (+4%), resting HR 66 bpm (+6), sleep 5h 30m (-150m)', sm.length === 3 && /52ms/.test(sm[0].querySelector('b').textContent) && /\+4% vs normal/.test(sm[0].textContent)
    && /66bpm/.test(sm[1].querySelector('b').textContent) && /\+6 vs normal/.test(sm[1].textContent) && /5h 30m/.test(sm[2].textContent) && /-150m vs goal/.test(sm[2].textContent));
  ck('each coloured by its status: steady in the accent, a watch in white, a problem in red', sm[0].classList.contains('good') && sm[1].classList.contains('mid') && sm[2].classList.contains('bad'));
  ck('the little bar moves off the middle as far as the reading is from normal', parseFloat(sm[0].querySelector('.kvd-mt i').style.left) > 50 && parseFloat(sm[2].querySelector('.kvd-mt i').style.left) < 20);
  const dash = [...P.querySelectorAll('.kvd-dash i')];
  ck('the sleep trend: 14 nights in dashes, a dot for a night with no data, longer for a longer night', dash.length === 14 && dash.filter((d) => d.classList.contains('kvd-dot')).length === 11
    && parseFloat(dash[12].style.width) > parseFloat(dash[13].style.width) && /h \d+m avg/.test(P.querySelector('.kvd-trh b').textContent));
  ck('the old Recovery card with its fixed 70 gives way to this one', [...doc.querySelectorAll('#kvdP-today .card')].some((c) => /RECOVERY SCORE/.test(c.textContent) && c.classList.contains('kvd-gone')) && /\.kvd-gone\{display:none\}/.test(css));
  ck('the title line says the score', /Recovery 62 · moderate/.test($('#kvdSub').textContent));

  V.show('signals', true); await wait(20);
  const tilesP = [...doc.querySelectorAll('#kvdP-signals .kvd-tile')];
  ck('Readings & signals opens with two tiles: Steadiest (vivid) and Most off today (dark)', tilesP.length === 2 && tilesP[0].classList.contains('vivid') && /Steadiest/.test(tilesP[0].textContent) && /Most off today/.test(tilesP[1].textContent) && !tilesP[1].classList.contains('vivid'));
  ck('Steadiest is the reading closest to normal (HRV +4%); most off is the furthest (sleep -31%)', /HRV/.test(tilesP[0].textContent) && /\+4 %/.test(tilesP[0].textContent) && /Sleep/.test(tilesP[1].textContent) && /-31 %/.test(tilesP[1].textContent) && /5h 30m/.test(tilesP[1].textContent));
  const mk = (t) => { const c = t.querySelector('.kvd-mk:not(.base)'); return Math.hypot(+c.getAttribute('cx') - 60, +c.getAttribute('cy') - 46); };
  ck('in the dot drawing (one shape, a ring and two markers), today sits further from your normal ring the further off it is', mk(tilesP[1]) < 22 && mk(tilesP[0]) > 22 && +tilesP[0].querySelector('.kvd-dots').dataset.dots > 40 && tilesP[0].querySelectorAll('.kvd-dots *').length === 4);
  ck('the title line counts what is outside your normal range', /2 outside your normal range/.test($('#kvdSub').textContent));
  /* the text on the vivid tile follows the accent */
  doc.body.style.setProperty('--acc', '#F4E18E'); V.show('signals', true);
  const inkLight = doc.querySelector('#kvdP-signals .kvd-tile.vivid').className;
  doc.body.style.setProperty('--acc', '#1E7A4B'); V.show('signals', true);
  const inkDark = doc.querySelector('#kvdP-signals .kvd-tile.vivid').className;
  ck('dark text on a pale accent, white on a deep one', /ink-dark/.test(inkLight) && /ink-light/.test(inkDark));
  doc.body.style.removeProperty('--acc');

  /* no readings: it says so */
  w.KovaToday.readiness = () => ({ score: null });
  w.KovaAgent.audit = () => ({ metrics: [{ id: 'rhr', status: 'neglect', value: null }, { id: 'hrv', status: 'neglect', value: null }, { id: 'sleep', status: 'neglect', value: null }] });
  w.KovaSleepLog.nights = () => [];
  V.show('today', true); await wait(10);
  const P2 = $('#kvdP-today .kvd-power');
  ck('no score: a dash, "Wear your watch to bed for a score", and no ring', P2.querySelector('.kvd-num').textContent === '—' && /Wear your watch to bed/.test(P2.textContent) && !P2.querySelector('.kvd-knob'));
  ck('no readings: each says "no reading" rather than a number', [...P2.querySelectorAll('.kvd-sm')].every((s) => /no reading/.test(s.textContent) && /—/.test(s.querySelector('b').textContent)));
  ck('no nights: the trend says so', /no nights yet/.test(P2.textContent));
  V.show('signals', true); await wait(10);
  ck('no readings: one card explains what will show there', !!$('#kvdP-signals .kvd-empty') && !$('#kvdP-signals .kvd-tile'));

  /* a section that goes away leaves the dock too */
  const cyc = scr.querySelector('.kcx-vsec'); V.show('cycle', true); cyc.remove(); await wait(30);
  ck('a section removed (Cycle, for a man) leaves the dock, and the screen moves to one that exists', V.sections().length === 6 && doc.querySelectorAll('#kvdRow .kvd-t').length === 6 && V.current() !== 'cycle' && $('#kvdPos').textContent.endsWith('/ 6'));

  ck('styles for dark, soft light and light glass', /body\.light-mode \.kvd-dock/.test(css) && /body\.soft-light \.kvd-dock/.test(css) && /body\.light-mode \.kvd-t\.on/.test(css));
  ck('the look of the images: thin big numbers, the glow, the dot grid, squircles that turn like a wheel', /\.kvd-num\{font-size:68px;font-weight:200/.test(css) && /\.kvd-power::before/.test(css) && /background-size:15px 15px/.test(css) && /rotateY\(calc\(var\(--kvd-d/.test(css));
  ck('motion is calmer when the phone asks for less', /prefers-reduced-motion:reduce/.test(css));

  const bad = errors.filter((e) => !/Not implemented|Could not parse CSS|csstree/i.test(e));
  ck('no page errors', bad.length === 0);
  if (bad.length) console.log(bad.slice(0, 5).join('\n'));
  let fail = 0;
  for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
  console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
