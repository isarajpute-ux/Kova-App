/* The owner's look rules, so they cannot quietly come back (p24):
   light glass edges are soft white rims or shadows, never a dark line;
   light glass is a foggy white, not sand; Studio's field tabs are one
   colour per appearance, never a rainbow; Work OS in soft light is one
   blended glass with white words; a new post shows the whole photo. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const R = []; const ck = (n, c) => R.push([n, !!c]);

ck('no edge borrows the dark text colour (var(--ink-N, white) on a border or outline)', !/(?:border|outline)(?:-[a-z]+)*\s*:[^;}"]*var\(--ink-\d,\s*rgba\(255,\s*255,\s*255/.test(html));
ck('light glass buttons get a soft shadow, not a black outline', /body\.light-mode \.btn\.ghost\{[^}]*box-shadow:0 1px 2px rgba\(28,26,23,\.06\)/.test(html) && /body\.light-mode \.exp-btn\{[^}]*box-shadow/.test(html));
ck('light glass is the foggy white everywhere (no sand)', !/#EAE8E4|#ECE7E1|#ECE9E0|#EBE9DF|#ECE7E7/.test(html) && (html.match(/#F2F3F5 0%,#E7E9EC 44%,#DCDFE3 100%/g) || []).length >= 16);
const brand = read('src/p08_brand.css');
ck('Studio field tabs: no colour per field (no orange, blue, red, green)', !/ks-dt\.on\[data-f=/.test(brand) && !/#D9955A|#79A3F2|#E8707C|#5FC892/.test(brand));
ck('Studio field tabs: a white glow in dark, a foggy blue in soft light, a black glow in light glass', /#s-workstudio \.ks-dt\.on\{[^}]*rgba\(255,255,255,\.22\)/.test(brand) && /body\.soft-light #s-workstudio \.ks-dt\.on\{[^}]*#BCCBE2/.test(brand) && /body\.light-mode #s-workstudio \.ks-dt\.on\{[^}]*#141518/.test(brand));
const crew = read('src/p08_crew.css');
ck('Work OS soft light: lit cards are foggy blue glass with white words; the rest match Home; tabs are glass', /body\.soft-light \.app\[data-pillar="work"\]\{[^}]*--wk-on:#FFFFFF/.test(crew) && /:is\(\.wgl,\.card\):not\(\.wk-lit\):not\(\.wglow\)\{[^}]*rgba\(255,255,255,\.17\)/.test(crew) && /body\.soft-light \.wk-tab\{/.test(crew));
ck('a new post shows the whole photo (shape: Original), not a 4:5 crop', /status:'draft',format:'image',aspect:'orig'/.test(read('src/p07_logic.js')));
ck('the Studio step panel stops above the writing box', /\.ks-flowp\{[^}]*max-height:calc\(100% - 232px\)/.test(read('src/p08_studioflow.css')));

let fail = 0;
for (const [n, ok] of R) { console.log((ok ? 'ok   ' : 'FAIL ') + n); if (!ok) fail++; }
console.log('\n' + (R.length - fail) + '/' + R.length + ' passed');
process.exit(fail ? 1 : 0);
