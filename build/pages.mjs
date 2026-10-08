/* What GitHub Pages needs on top of the normal build (npm run build:pages).

   GitHub Pages only serves files: no Netlify redirects, no server. So:
     .nojekyll        serve every file as it is (Jekyll would skip names
                      that start with "_" and take longer)
     404.html         an unknown address goes back to the app, under the
                      site's base path (/Kova-App/ on github.io, / on a
                      custom domain)
     privacy/ etc.    /privacy, /terms... (no ".html") still open the page,
                      the way the Netlify redirects did
     _redirects       removed: it is Netlify's file and means nothing here
   The server stays on Netlify; the page reaches it through KOVA_API_URL
   (set at build time, see build/site.mjs). */
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LEGAL = ['privacy', 'terms', 'refunds', 'cookies', 'licenses'];

function stub(to, title) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex"><title>' + title + '</title>'
    + '<meta http-equiv="refresh" content="0; url=' + to + '"><link rel="canonical" href="' + to + '">'
    + '<style>body{margin:0;background:#040003;color:#f2f3f5;font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}a{color:inherit}</style>'
    + '</head><body><p><a href="' + to + '">' + title + '</a></p><script>location.replace(' + JSON.stringify(to) + '+location.search+location.hash)</script></body></html>';
}

export function finish(out, base) {
  base = '/' + String(base || '/').replace(/^\/+|\/+$/g, '') + '/';
  base = base.replace(/\/\/+/g, '/');
  writeFileSync(join(out, '.nojekyll'), '');
  writeFileSync(join(out, '404.html'), stub(base, 'Kova'));
  for (const p of LEGAL) {
    if (!existsSync(join(out, p + '.html'))) continue;
    mkdirSync(join(out, p), { recursive: true });
    writeFileSync(join(out, p, 'index.html'), stub('../' + p + '.html', p[0].toUpperCase() + p.slice(1)));
  }
  rmSync(join(out, '_redirects'), { force: true });
  console.log('GitHub Pages: base ' + base + ', .nojekyll, 404.html, ' + LEGAL.length + ' short links');
}
