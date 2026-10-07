/* The Studio's video editor (src/p08_cut.js), for real: two clips are
   recorded in the page, edited (split, trim, speed, filter, turn, music,
   upscale) and saved; the saved file must be a real video of the edit's
   length that becomes the post. SHOTS=<dir> also saves screenshots. */
import { chromium, webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serve, openPage, SIGNED_OUT_LOCAL } from './harness.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const b = process.env.ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const site = await serve(join(root, 'dist'));
const STORE = Object.assign({}, SIGNED_OUT_LOCAL, { 'ks.started': 'true', 'kova.consent': JSON.stringify({ a: false, at: 1 }), 'kova.tours.v1': JSON.stringify({ home: 1, move: 1, fuel: 1, sleep: 1, vitals: 1, customize: 1, work: 1, studio: 1 }) });
const { context, page, pageErrors } = await openPage(b, null, { storage: STORE, viewport: { width: 390, height: 844 } });
await page.goto(site.url + '/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.KovaCut && window.KovaCanvas, null, { timeout: 30000 });
await page.evaluate(() => { KP.set('tourSeen', true); go('workstudio'); });   /* the once-ever walkthrough would open over it */
await page.waitForTimeout(800);
/* two short clips with sound, recorded right here, and a song */
await page.evaluate(async () => {
  async function clip(color, secs, hz) {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360; const x = c.getContext('2d');
    const ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination(); o.frequency.value = hz; o.connect(d); o.start();
    const st = c.captureStream(30); d.stream.getAudioTracks().forEach((t) => st.addTrack(t));
    const rec = new MediaRecorder(st, { mimeType: 'video/webm' }), ch = []; rec.ondataavailable = (e) => ch.push(e.data);
    const t0 = performance.now(); rec.start(100);
    await new Promise((ok) => { (function f() { const t = (performance.now() - t0) / 1000; x.fillStyle = color; x.fillRect(0, 0, 640, 360); x.fillStyle = '#fff'; x.fillRect((t * 200) % 640, 150, 60, 60); if (t < secs) requestAnimationFrame(f); else ok(); })(); });
    rec.stop(); await new Promise((ok) => rec.onstop = ok); o.stop(); ac.close();
    return new File([new Blob(ch, { type: 'video/webm' })], color.slice(1) + '.webm', { type: 'video/webm' });
  }
  const a = await clip('#c0392b', 2.2, 440), b2 = await clip('#2c3e50', 2.2, 660);
  KovaCanvas._addFiles([a, b2]);
  /* a 4 s song as a WAV */
  const sr = 8000, n = sr * 4, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf); let p = 0;
  const str = (t) => { for (const ch of t) v.setUint8(p++, ch.charCodeAt(0)); };
  str('RIFF'); v.setUint32(p, 36 + n * 2, true); p += 4; str('WAVEfmt '); v.setUint32(p, 16, true); p += 4; v.setUint16(p, 1, true); p += 2; v.setUint16(p, 1, true); p += 2;
  v.setUint32(p, sr, true); p += 4; v.setUint32(p, sr * 2, true); p += 4; v.setUint16(p, 2, true); p += 2; v.setUint16(p, 16, true); p += 2; str('data'); v.setUint32(p, n * 2, true); p += 4;
  for (let i = 0; i < n; i++) { v.setInt16(p, Math.sin(i / sr * 2 * Math.PI * 330) * 8000, true); p += 2; }
  window.__song = new File([buf], 'Sunset song.wav', { type: 'audio/wav' });
});
await page.waitForFunction(() => (KovaCanvas._post().media || []).length === 2, null, { timeout: 20000 });
await page.waitForTimeout(800);
await page.waitForFunction(() => document.querySelectorAll('#ksWires .wb').length > 0, null, { timeout: 8000 }).catch(() => {});
const wires = await page.evaluate(() => ({ wb: document.querySelectorAll('#ksWires .wb').length, fl: !!document.querySelector('#ksWires .wb .fl'), halo: !!document.querySelector('#ksWires .wb .w.halo'),
  pill: (document.querySelector('.ks-wl') || {}).textContent || '', stroke: (() => { const c = document.querySelector('#ksWires .wb .w.core'); return c ? getComputedStyle(c).stroke : ''; })() }));
ck('wires carrying work are white glowing beams with flares and a pill saying what they carry (' + wires.wb + ' lit, "' + wires.pill + '")', wires.wb > 0 && wires.fl && wires.halo && /item|post/.test(wires.pill) && /255, 255, 255/.test(wires.stroke));
ck('the Media card has an "Edit video" button', await page.evaluate(() => { const bt = document.querySelector('.ks-cutb'); return bt && /Edit video/.test(bt.textContent); }));
await page.evaluate(() => document.querySelector('.ks-cutb').click());
await page.waitForSelector('.kct', { timeout: 5000 });
await page.waitForTimeout(1500);
const L = await page.evaluate(() => ({ clips: document.querySelectorAll('.kct-clip').length, time: document.getElementById('kctTime').textContent, plus: !!document.querySelector('.kct-plus'),
  music: document.getElementById('kctMusic').textContent, tools: [...document.querySelectorAll('.kct-t')].map((t) => t.getAttribute('aria-label') || t.textContent.trim()).join('|'),
  handles: document.querySelectorAll('.kct-clip .h').length, dashed: getComputedStyle(document.querySelector('.kct-clip.on .fs')).outlineStyle, total: KovaCut._total() }));
ck('it opens like the reference: two clip tiles, a time bubble, the + on the playhead, "Click to add music"', L.clips === 2 && /\d\d:\d\d/.test(L.time) && L.plus && /Click to add music/.test(L.music));
ck('trim handles on both ends of each clip, the chosen clip dashed', L.handles === 4 && L.dashed === 'dashed');
ck('the tools: Upscale, Speed, Filter, Split, Turn, Delete (' + L.tools + ')', /Upscale/.test(L.tools) && /Speed/.test(L.tools) && /Filter/.test(L.tools) && /Split/.test(L.tools) && /Delete/.test(L.tools));
ck('the edit is as long as the two clips (' + L.total.toFixed(1) + ' s)', L.total > 3.6 && L.total < 5.2);
if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, 'cut-dark.png') });
/* split the first clip in the middle */
await page.evaluate(() => KovaCut._seek(1.0)); await page.waitForTimeout(400);
await page.click('.kct-t[data-k="split"]'); await page.waitForTimeout(300);
ck('Split cuts the clip at the playhead into two', await page.evaluate(() => document.querySelectorAll('.kct-clip').length === 3));
/* speed and filter on the chosen clip */
await page.click('.kct-t[data-k="speed"]'); await page.waitForTimeout(200);
await page.click('.kct-t[data-k="filter"]'); await page.waitForTimeout(200);
const st = await page.evaluate(() => { const c = KovaCut._state().cut.clips[KovaCut._state().sel]; return { speed: c.speed, filter: c.filter, tag: document.querySelector('.kct-clip.on .tag') && document.querySelector('.kct-clip.on .tag').textContent }; });
ck('Speed sets the chosen clip to 1.5x and shows it on the tile', st.speed === 1.5 && st.tag === '1.5x');
ck('Filter gives it a look (Vivid)', /saturate/.test(st.filter));
const looks = await page.evaluate(() => {
  const src = document.createElement('canvas'); src.width = src.height = 20; const sx = src.getContext('2d'); sx.fillStyle = 'rgb(200,60,60)'; sx.fillRect(0, 0, 20, 20);
  const px = (f) => { const c = document.createElement('canvas'); c.width = c.height = 20; const x = c.getContext('2d'); KovaCut._draw(x, 20, 20, { rot: 0, filter: f }, src); return [...x.getImageData(10, 10, 1, 1).data].slice(0, 3); };
  return { native: 'filter' in document.createElement('canvas').getContext('2d'), none: px('none'), mono: px('grayscale(1) contrast(1.1)'), warm: px('sepia(.25) saturate(1.2) hue-rotate(-8deg)'), cool: px('saturate(1.1) hue-rotate(12deg) brightness(1.03)') };
});
const spread = (p) => Math.max(...p) - Math.min(...p);
ck('each look really changes the picture' + (looks.native ? '' : ' (Safari: made with colour blending)') + ': Mono is grey, Cool is bluer than Warm (' + JSON.stringify(looks) + ')',
  spread(looks.mono) < 12 && spread(looks.none) > 100 && (looks.cool[2] - looks.cool[0]) > (looks.warm[2] - looks.warm[0]));
/* trim: drag the end of the last clip in */
const before = await page.evaluate(() => KovaCut._total());
await page.evaluate(() => { const t = document.getElementById('kctTl'); t.scrollLeft = t.scrollWidth; });
await page.waitForTimeout(300);
const h = await page.evaluate(() => { const hs = document.querySelectorAll('.kct-clip .h.r'), r = hs[hs.length - 1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x - 25, h.y, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(300);
const after = await page.evaluate(() => KovaCut._total());
ck('dragging a clip\'s > handle trims it (' + before.toFixed(2) + ' → ' + after.toFixed(2) + ' s)', after < before - 0.2);
/* music */
await page.evaluate(() => KovaCut._addMusic(window.__song)); await page.waitForTimeout(800);
const mu = await page.evaluate(() => ({ txt: document.getElementById('kctMusic').textContent, on: document.getElementById('kctMusic').classList.contains('on'), opts: !document.getElementById('kctMopt').hidden }));
ck('music goes on its track with its name, and its volume and start show', mu.on && /Sunset song/.test(mu.txt) && mu.opts);
await page.evaluate(() => { const r = document.querySelector('[data-m="vol"]'); r.value = 40; r.dispatchEvent(new Event('input', { bubbles: true })); });
ck('the music volume is kept with the post', await page.evaluate(() => Math.abs(KovaCanvas._post().cut.music.vol - 0.4) < 0.01));
/* upscale */
await page.click('#kctUp'); await page.waitForTimeout(200);
const up = await page.evaluate(() => KovaCut._outSize());
ck('Upscale saves at 1080p (' + up.w + '×' + up.h + ', from ' + up.src + 'p)', Math.max(up.w, up.h) === 1920 && up.w % 2 === 0);
if (process.env.SHOTS) {
  await page.screenshot({ path: join(process.env.SHOTS, 'cut-dark2.png') });
  for (const t of ['soft-light', 'light-mode']) { await page.evaluate((t) => { document.body.classList.remove('soft-light', 'light-mode'); document.body.classList.add(t); }, t); await page.waitForTimeout(200); await page.screenshot({ path: join(process.env.SHOTS, 'cut-' + t + '.png') }); }
  await page.evaluate(() => document.body.classList.remove('soft-light', 'light-mode'));
}
/* a phone that refuses to play a clip: the watchdog stops with a message, it never hangs */
const wd = await page.evaluate(async () => {
  const C = KovaCut._state(), msgs = []; const t0 = window.toast; window.toast = (m) => msgs.push(m);
  const tc = window.KovaCanvas && KovaCanvas.toast; if (tc) KovaCanvas.toast = (m) => msgs.push(m);
  const real = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('not allowed', 'NotAllowedError')); };
  KovaCut._seek(0); await new Promise((r) => setTimeout(r, 300));
  document.querySelector('#kctPlay').click();
  await new Promise((r) => setTimeout(r, 6500));
  HTMLMediaElement.prototype.play = real; window.toast = t0; if (tc) KovaCanvas.toast = tc;
  return { playing: C.playing, msgs };
});
ck('if the phone refuses to play a clip, it stops with a clear message instead of hanging', !wd.playing && wd.msgs.some((m) => /paused the video/.test(m)));
/* save: a real video of the edit */
const want = await page.evaluate(() => KovaCut._total());
await page.click('.kct-save');
await page.waitForFunction(() => !document.querySelector('.kct'), null, { timeout: Number(process.env.SAVE_WAIT || 60000) }).catch(() => {});
await page.waitForTimeout(800);
const out = await page.evaluate(async () => {
  const p = KovaCanvas._post(), m = p.media[0];
  if (!m || !m.edit) return null;
  const blob = await KovaBlobs.get(m.blob);
  const u = URL.createObjectURL(blob), v = document.createElement('video'); v.muted = true; v.src = u;
  const dur = await new Promise((ok) => { v.onloadedmetadata = () => { if (isFinite(v.duration)) return ok(v.duration); v.currentTime = 1e6; v.ontimeupdate = () => { v.ontimeupdate = null; ok(v.duration); }; }; v.onerror = () => ok(-1); });
  return { kind: m.kind, mime: m.mime, bytes: blob.size, w: v.videoWidth, h: v.videoHeight, dur, off: p.media.filter((x) => x.on === false).length, fmt: p.format, on: p.media.filter((x) => x.on !== false).length };
});
ck('Save video records a real file (' + (out ? out.mime + ', ' + Math.round(out.bytes / 1024) + ' KB, ' + out.w + '×' + out.h : 'none') + ')', out && out.kind === 'video' && out.bytes > 20000 && Math.max(out.w, out.h) === 1920);
ck('…as long as the edit (' + (out ? out.dur.toFixed(1) : '?') + ' s, edit ' + want.toFixed(1) + ' s)', out && Math.abs(out.dur - want) < 1.0);
ck('…which is now the post; the clips it came from stay in Media, switched off', out && out.fmt === 'video' && out.on === 1 && out.off === 2);
/* reopening keeps the edit */
await page.evaluate(() => document.querySelector('.ks-cutb').click()); await page.waitForTimeout(800);
ck('reopening the editor keeps the edit (3 clips, the music)', await page.evaluate(() => document.querySelectorAll('.kct-clip').length === 3 && /Sunset song/.test(document.getElementById('kctMusic').textContent)));
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
ck('Escape closes the editor', await page.evaluate(() => !document.querySelector('.kct')));
ck('no page errors', pageErrors.length === 0 || (console.error(pageErrors), false));
await context.close(); await b.close(); site.close();
const failed = R.filter((x) => !x[1]);
R.forEach((x) => console.log((x[1] ? 'PASS ' : 'FAIL ') + x[0]));
console.log(`\n${R.length - failed.length}/${R.length} passing`);
process.exit(failed.length ? 1 : 0);
