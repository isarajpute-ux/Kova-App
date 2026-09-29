/* Builds dist/, the folder Netlify publishes.
   index.html stays readable in the repo (edit src/ and index.html, run the
   tests against it); what goes out to phones is the same page with every
   inline script and style minified, which is what gets the first load
   down. Only the files the site serves are copied, so server code, tests
   and notes are no longer downloadable from the site.
   The AI team and Traction (Work OS only, about a tenth of the code) move to their
   own files that load right after the first screen: each module already
   starts itself whenever it arrives, and every caller checks it is there.
     npm run build            writes dist/
     npm run build -- --size  also prints the compressed sizes */
import { transformSync } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const FILES = ['privacy.html', 'recipes.json', 'sw.js', 'manifest.webmanifest', '_redirects',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
const JS_TYPES = /^(|text\/javascript|application\/javascript|module)$/i;
const LAZY = ['p08-crew', 'p08-traction'];
const hash = (t) => createHash('sha256').update(t).digest('hex').slice(0, 10);

/* moves the LAZY blocks (already minified) into m/<id>.<hash>.js|css.
   Styles become a non-blocking <link> in the same place, so the cascade
   order is unchanged; scripts load in their original order once the page
   has painted. */
export function split(html) {
  const files = {}, js = [];
  let page = html;
  for (const id of LAZY) {
    page = page.replace(new RegExp('<style id="' + id + '">([\\s\\S]*?)</style>'), (all, css) => {
      const f = 'm/' + id + '.' + hash(css) + '.css'; files[f] = css;
      return '<link rel="stylesheet" id="' + id + '" href="' + f + '" media="print" onload="this.media=\'all\'">';
    });
    page = page.replace(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'), (all, code) => {
      const f = 'm/' + id + '.' + hash(code) + '.js'; files[f] = code; js.push(f);
      return '';
    });
  }
  if (js.length) {
    const loader = '<script id="kova-lazy">(function(){var L=' + JSON.stringify(js) + ';function one(i){if(i>=L.length)return;var s=document.createElement("script");s.src=L[i];s.onload=s.onerror=function(){one(i+1)};document.body.appendChild(s)}function go(){(window.requestIdleCallback||setTimeout)(function(){one(0)},{timeout:1500})}if(document.readyState==="complete")go();else addEventListener("load",go)})();</script>';
    page = page.replace(/<\/body>/i, loader + '</body>');
  }
  return { page, files };
}

export function minifyPage(html) {
  let n = 0;
  const page = html
    .replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, (all, attrs = '', code) => {
      if (/\bsrc\s*=/.test(attrs) || !code.trim()) return all;
      const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
      if (!JS_TYPES.test(type)) return all;
      /* no format: esbuild then keeps top-level names, which other scripts
         and onclick="" attributes call as globals */
      const min = transformSync(code, { loader: 'js', minify: true, legalComments: 'none', charset: 'utf8' }).code;
      n++;
      return '<script' + attrs + '>' + min.trim() + '</script>';
    })
    .replace(/<style(\s[^>]*)?>([\s\S]*?)<\/style>/gi, (all, attrs = '', css) => {
      if (!css.trim()) return all;
      const min = transformSync(css, { loader: 'css', minify: true, legalComments: 'none', charset: 'utf8' }).code;
      n++;
      return '<style' + attrs + '>' + min.trim() + '</style>';
    });
  return { page, blocks: n };
}

const kb = (b) => (b / 1024).toFixed(0) + ' KB';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = readFileSync(join(root, 'index.html'), 'utf8');
  const { page: min, blocks } = minifyPage(src);
  const { page, files } = split(min);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'm'), { recursive: true });
  writeFileSync(join(out, 'index.html'), page);
  for (const [f, t] of Object.entries(files)) writeFileSync(join(out, f), t);
  for (const f of FILES) cpSync(join(root, f), join(out, f));
  console.log(`dist/: index.html (${blocks} scripts and styles minified), ${Object.keys(files).length} after-first-screen files, ${FILES.length} others`);
  if (process.argv.includes('--size')) {
    const br = (t) => brotliCompressSync(Buffer.from(t), { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }).length;
    console.log(`index.html  ${kb(src.length)} -> ${kb(page.length)}; gzip ${kb(gzipSync(src, { level: 9 }).length)} -> ${kb(gzipSync(page, { level: 9 }).length)}; brotli ${kb(br(page))} (what browsers download)`);
    console.log(`after the first screen: brotli ${kb(Object.values(files).reduce((a, t) => a + br(t), 0))}`);
  }
}
