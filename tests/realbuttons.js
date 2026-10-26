/* p44, the owner: "most of the buttons are there just for show... when I
   press them it doesn't take me to another screen". Buttons the tap-every-
   button audit (tests/e2e/_audit.mjs) found wanting, each doing its real job. */
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);
const vc = new VirtualConsole(); const errors = []; vc.on('jsdomError', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const w = dom.window;
['kova.auth.skipped', 'kova.auth.local'].forEach((k) => w.localStorage.setItem(k, '1'));
w.localStorage.setItem('kova_mode_v1', 'live');
w.localStorage.setItem('kova.onboarded', JSON.stringify({ at: 1 }));
w.localStorage.setItem('kova_profile_v2', JSON.stringify({ tourSeen: true }));
w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n'));
(async () => {
  await wait(1200);
  const doc = w.document;
  let toasts = []; const t0 = w.toast; w.toast = (m) => { toasts.push(String(m)); try { t0(m); } catch (e) {} };
  /* the composer's + and the image button open a real file picker (they asked for a typed name) */
  let prompted = 0, picked = null; w.prompt = () => { prompted++; return null; };
  const realClick = w.HTMLInputElement.prototype.click;
  w.HTMLInputElement.prototype.click = function () { if (this.type === 'file') { picked = this; return; } return realClick.call(this); };
  w.go('workcompose'); await wait(50);
  doc.getElementById('kdcMedia').click();
  ck('Attach image opens the file picker for photos and videos, no "type a name" box', picked && picked.accept === 'image/*,video/*' && picked.multiple && !prompted);
  const f = new w.File(['x'], 'product-shot.jpg', { type: 'image/jpeg' });
  Object.defineProperty(picked, 'files', { value: [f] }); picked.dispatchEvent(new w.Event('change'));
  ck('…the file you pick is attached by its name', /product-shot\.jpg/.test(doc.getElementById('kdcFiles').textContent) && w.__kdc.files.includes('product-shot.jpg'));
  picked = null; doc.getElementById('kdcAdd').click();
  ck('+ opens the file picker for any file', picked && picked.accept === '' && !prompted);
  /* Health: Add with an empty box says what to type, instead of nothing */
  w.go('health'); await wait(50); toasts = [];
  doc.getElementById('condAdd').click();
  ck('Health > conditions: Add with nothing typed says what to type', toasts.some((m) => /Type the condition/.test(m)));
  doc.getElementById('condIn').value = 'Asthma'; doc.getElementById('condAdd').click();
  ck('…and adds what you type', /Asthma/.test(doc.getElementById('s-health').textContent));
  ck('no script errors', !errors.filter((x) => !/Not implemented/i.test(x)).length || (console.log(errors.slice(0, 3)), false));
  let p = 0; R.forEach(([n, c]) => { console.log((c ? 'ok   ' : 'FAIL ') + n); if (c) p++; });
  console.log(p + '/' + R.length + ' realbuttons');
  process.exit(p === R.length ? 0 : 1);
})();
