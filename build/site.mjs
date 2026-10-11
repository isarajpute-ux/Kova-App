/* Builds dist/, the folder Netlify publishes.
   index.html stays readable in the repo (edit src/ and index.html, run the
   tests against it); what goes out to phones is the same page, smaller:
     1. Work OS and the study tools (32 of the 70 screens) leave the first
        download. Every top-level statement of every inline script that only
        touches those screens' elements moves, in its original order, into
        m/work.<hash>.js. It loads right after the first screen, or at once
        if a Work screen is opened first; that screen is then redrawn.
        Everything else in the app reaches that code through guarded calls
        (if(window.KovaStudio) ...), so nothing waits on it.
     2. Every inline script and style is minified.
     3. Traction's code and the AI team's and Traction's styles load after
        the first screen too.
     4. Only the files the site serves are copied, so server code, tests and
        notes are not public URLs; sw.js pre-caches the split files so Work
        OS still opens offline.
     npm run build            writes dist/
     npm run build -- --size  also prints the compressed sizes */
import { transformSync } from 'esbuild';
import { parse } from 'acorn';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const FILES = ['privacy.html', 'terms.html', 'refunds.html', 'cookies.html', 'licenses.html', 'recipes.json', 'sw.js', 'manifest.webmanifest', '_redirects',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
const JS_TYPES = /^(|text\/javascript|application\/javascript|module)$/i;
/* after the first screen: the Work OS team and traction, and the p14
   pieces nothing on the first screen needs (the scanner's body read, the
   noise meter, the privacy banner and legal rows, the alert sounds, the
   Studio's workflow styles) */
const LAZY = ['p08-crew', 'p08-traction', 'p08-impact', 'p08-noise', 'p08-legal', 'p08-chime', 'p08-studioflow',
  'p08-studiotheme', 'p08-cycle', 'p08-social', 'p08-import', 'p08-launch', 'p08-cut', 'p08-camera', 'p08-labs', 'p08-alarm', 'p08-body', 'p08-signin', 'p08-plans', 'p08-asks'];
/* of those, the ones whose styles only matter once their own script has
   drawn something: the loader adds their stylesheet with the scripts,
   after the first screen, instead of a <link> fetched during it */
export const LATE_CSS = ['p08-body', 'p08-signin', 'p08-plans', 'p08-asks'];
/* Work OS and the study tools: code that only touches these loads later */
export const WORK = ('work workcompose workstudio workspace workinbound workdiag workquiz learn accountability cards notebooks notebook '
  + 'worktoday worktasks workitem workprojects workgoals workprofile workactivity workintegrations workteam workauto '
  + 'workmeetings workmeeting workfiles workfolder source lquiz worksettings snap explain focus').split(' ');
const hash = (t) => createHash('sha256').update(t).digest('hex').slice(0, 10);
const isJs = (attrs) => !/\bsrc\s*=/.test(attrs) && JS_TYPES.test((attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '');

/* which screen each element id lives on, from the markup */
function screensOf(html) {
  const body = html.slice(html.indexOf('<body')).replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '');
  const at = {};
  for (const m of body.matchAll(/<section class="screen[^"]*"[^>]*id="s-([\w-]+)"[^>]*>([\s\S]*?)<\/section>/g)) {
    at['s-' + m[1]] = m[1];
    for (const x of m[2].matchAll(/\bid="([\w-]+)"/g)) at[x[1]] = m[1];
  }
  return at;
}
/* the screens a statement names, through any id in its strings */
function touches(src, at) {
  const s = new Set();
  for (const t of src.matchAll(/['"`]([^'"`\n]{1,200})['"`]/g)) for (const w of t[1].matchAll(/#?([A-Za-z][\w-]*)/g)) if (at[w[1]]) s.add(at[w[1]]);
  return [...s];
}

export function splitWork(html) {
  const at = screensOf(html), work = new Set(WORK), parts = [];
  let moved = 0;
  const page = html.replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, (all, attrs = '', code) => {
    if (!isJs(attrs) || !code.trim()) return all;
    let ast; try { ast = parse(code, { ecmaVersion: 'latest' }); } catch (e) { return all; }
    const keep = [], go = [];
    for (const st of ast.body) {
      const src = code.slice(st.start, st.end), on = touches(src, at);
      if (!st.directive && on.length && on.every((x) => work.has(x))) go.push(st); else keep.push(st);
    }
    if (!go.length) return all;
    moved += go.length;
    /* declarations stay global; the rest are fenced so one failing block
       cannot stop the others (each used to be separate script) */
    const decl = (st) => /Declaration$/.test(st.type);
    const body = go.map((st) => code.slice(st.start, st.end)).join('\n');
    parts.push(go.some(decl) ? body : 'try{\n' + body + '\n}catch(e){console.error(e)}');
    /* what is left keeps its comments and spacing */
    let rest = '', last = 0;
    for (const st of go) { rest += code.slice(last, st.start); last = st.end; }
    rest += code.slice(last);
    return keep.length ? '<script' + attrs + '>' + rest + '</script>' : '';
  });
  /* the moved code expects DOMContentLoaded / load still to come; by the
     time this file runs they have passed, so such listeners run at once */
  const chunk = parts.length ? '(function(){var d=document,w=window,ad=d.addEventListener,aw=w.addEventListener;'
    + 'function sh(t,o){return function(y,f,p){if((y==="DOMContentLoaded"||y==="load")&&typeof f==="function"){setTimeout(function(){try{f.call(t,new Event(y))}catch(e){console.error(e)}},0);return}return o.call(this,y,f,p)}}'
    + 'd.addEventListener=sh(d,ad);w.addEventListener=sh(w,aw);w.__kovaUnshim=function(){d.addEventListener=ad;w.addEventListener=aw}})();\n'
    + parts.join('\n;\n') + '\n;window.__kovaUnshim&&window.__kovaUnshim();window.__kovaWork=1;' : '';
  return { page, chunk, moved };
}

export function minifyJs(code) {
  /* no format: esbuild then keeps top-level names, which other scripts
     and onclick="" attributes call as globals */
  return transformSync(code, { loader: 'js', minify: true, legalComments: 'none', charset: 'utf8' }).code.trim();
}

/* moves the LAZY blocks (already minified) into m/<id>.<hash>.js|css and
   adds the loader. Styles become a non-blocking <link> in the same place,
   so the cascade order is unchanged; scripts load in order once the page
   has painted, the Work OS file first. */
export function split(html, work) {
  const files = {}, js = [], late = [];
  let page = html;
  if (work) { const f = 'm/work.' + hash(work) + '.js'; files[f] = work; js.push(f); }
  for (const id of LAZY) {
    page = page.replace(new RegExp('<style id="' + id + '">([\\s\\S]*?)</style>'), (all, css) => {
      const f = 'm/' + id + '.' + hash(css) + '.css'; files[f] = css;
      if (LATE_CSS.includes(id)) { late.push(f); return ''; }
      return '<link rel="stylesheet" id="' + id + '" href="' + f + '" media="print" onload="this.media=\'all\'">';
    });
    page = page.replace(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'), (all, code) => {
      const f = 'm/' + id + '.' + hash(code) + '.js'; files[f] = code; js.push(f);
      return '';
    });
  }
  if (js.length) {
    const loader = '<script id="kova-lazy">(function(){var L=' + JSON.stringify(js) + ',C=' + JSON.stringify(late) + ',W=' + JSON.stringify(WORK) + ',st=0;'
      + 'function cur(){var s=document.querySelector(".screen.on");return s?s.id.slice(2):""}'
      + 'function one(i,k){if(i>=L.length)return k();var s=document.createElement("script");s.src=L[i];s.onload=s.onerror=function(){one(i+1,k)};document.body.appendChild(s)}'
      /* once it is in, a Work screen already open is drawn again */
      + 'function css(){C.forEach(function(f){var l=document.createElement("link");l.rel="stylesheet";l.href=f;document.head.appendChild(l)})}'
      + 'function load(){if(st)return;st=1;css();one(0,function(){st=2;window.__kovaLazyDone=1;try{dispatchEvent(new Event("kova:lazy"))}catch(e){}var c=cur();if(W.indexOf(c)>=0&&window.go)try{go(c,{replace:true})}catch(e){}})}'
      + 'window.__kovaLoadWork=load;'
      /* a Work screen opened before it arrived: fetch it now */
      + 'if(window.MutationObserver)W.forEach(function(id){var el=document.getElementById("s-"+id);if(el)new MutationObserver(function(){if(el.classList.contains("on"))load()}).observe(el,{attributes:true,attributeFilter:["class"]})});'
      + 'if(W.indexOf(cur())>=0)load();'
      + 'function soon(){(window.requestIdleCallback||setTimeout)(load,{timeout:1500})}'
      + 'if(document.readyState==="complete")soon();else addEventListener("load",soon)})();</script>';
    page = page.replace(/<\/body>/i, loader + '</body>');
  }
  return { page, files };
}

export function minifyPage(html) {
  let n = 0;
  const page = html
    .replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, (all, attrs = '', code) => {
      if (!code.trim() || !isJs(attrs)) return all;
      n++;
      return '<script' + attrs + '>' + minifyJs(code) + '</script>';
    })
    .replace(/<style(\s[^>]*)?>([\s\S]*?)<\/style>/gi, (all, attrs = '', css) => {
      if (!css.trim()) return all;
      const min = transformSync(css, { loader: 'css', minify: true, legalComments: 'none', charset: 'utf8' }).code;
      n++;
      return '<style' + attrs + '>' + min.trim() + '</style>';
    });
  return { page, blocks: n };
}

/* the whole pipeline, as the tests use it */
export function build(src) {
  const { page: p1, chunk, moved } = splitWork(src);
  const { page: p2, blocks } = minifyPage(p1);
  const { page, files } = split(p2, chunk ? minifyJs(chunk) : '');
  return { page, files, blocks, moved };
}

const kb = (b) => (b / 1024).toFixed(0) + ' KB';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let src = readFileSync(join(root, 'index.html'), 'utf8');
  /* KOVA_API_URL: where the server is when the page is not on the same
     site as it (GitHub Pages, with the server on Netlify). Public: it is
     an address, not a secret. */
  const api = String(process.env.KOVA_API_URL || '').trim().replace(/\/+$/, '');
  if (api) {
    if (!/^https:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/.test(api)) { console.error('KOVA_API_URL must be an https address, e.g. https://kova-app.netlify.app/api'); process.exit(1); }
    const before = src;
    src = src.replace("window.KOVA_API = window.KOVA_API || '';", 'window.KOVA_API = window.KOVA_API || ' + JSON.stringify(api) + ';');
    if (src === before) { console.error('KOVA_API setting not found in index.html'); process.exit(1); }
  }
  const { page, files, blocks, moved } = build(src);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'm'), { recursive: true });
  writeFileSync(join(out, 'index.html'), page);
  for (const [f, t] of Object.entries(files)) writeFileSync(join(out, f), t);
  for (const f of FILES) cpSync(join(root, f), join(out, f));
  /* the split files are part of the install, so Work OS opens offline */
  const sw = readFileSync(join(out, 'sw.js'), 'utf8');
  writeFileSync(join(out, 'sw.js'), sw.replace("'./icon-180.png'\n];", "'./icon-180.png'" + Object.keys(files).map((f) => ",\n  './" + f + "'").join('') + '\n];')
    .replace(/var VERSION = '([^']+)';/, (m, v) => "var VERSION = '" + v + '-' + hash(page + Object.keys(files).join()) .slice(0, 6) + "';"));
  console.log(`dist/: index.html (${blocks} scripts and styles minified, ${moved} Work OS blocks moved out), ${Object.keys(files).length} after-first-screen files, ${FILES.length} others`);
  if (api) console.log('server: ' + api);
  /* --pages: the extras GitHub Pages needs (see build/pages.mjs) */
  if (process.argv.includes('--pages')) (await import('./pages.mjs')).finish(out, process.env.PAGES_BASE || '/');
  if (process.argv.includes('--size')) {
    const br = (t) => brotliCompressSync(Buffer.from(t), { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }).length;
    console.log(`index.html  ${kb(src.length)} -> ${kb(page.length)}; gzip ${kb(gzipSync(src, { level: 9 }).length)} -> ${kb(gzipSync(page, { level: 9 }).length)}; brotli ${kb(br(page))} (what browsers download)`);
    console.log(`after the first screen: brotli ${kb(Object.values(files).reduce((a, t) => a + br(t), 0))}`);
  }
}
