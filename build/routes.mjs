/* Writes ROUTES.md: one row per server route, from the router itself
   (functions/api.js, plus the file route in functions/netlify.js), checked
   against every call the app makes (index.html). A call with no route goes
   in "Missing" at the top.
     node build/routes.mjs           rewrite ROUTES.md
     node build/routes.mjs --check   fail if it is stale or anything is missing */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = readFileSync(join(root, 'functions/api.js'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

/* ---------- the server's routes, from the dispatcher ---------- */
function serverRoutes() {
  const out = [];
  const add = (m, p, handler) => out.push({ method: m, path: p, handler });
  const lines = api.split('\n');
  let health = false;
  for (const l of lines) {
    const methods = [...l.matchAll(/M === '([A-Z]+)'/g)].map((x) => x[1]);
    const h = (l.match(/return await (\w+)\(/) || [])[1] || (l.match(/return res\.json/) ? 'inline' : '');
    if (/seg\[0\] === 'health' && seg\.length === 2/.test(l)) { health = true; continue; }
    if (health && /if \(M === '(GET|POST)'\) return await (\w+)\(req, res, seg\[1\]\)/.test(l)) { const m = l.match(/M === '(\w+)'.*await (\w+)/); add(m[1], '/health/:token', m[2]); continue; }
    if (health && /^\s*}/.test(l)) { health = false; continue; }
    if (!methods.length || !/path === |seg\[/.test(l)) continue;
    let p = (l.match(/path === '([^']+)'/) || [])[1];
    if (!p) {
      const s0 = (l.match(/seg\[0\] === '(\w+)'/) || [])[1], s1 = (l.match(/seg\[1\] === '(\w+)'/) || [])[1], s2 = (l.match(/seg\[2\] === '(\w+)'/) || [])[1];
      const len = +(l.match(/seg\.length === (\d)/) || [])[1];
      const PARAM = { connect: ':provider', link: ':provider', targets: ':provider', disconnect: ':provider', call: ':provider', posts: ':id', traction: ':id', agent: ':id' };
      if (!s0) continue;
      if (s1) p = '/' + s0 + '/' + s1 + '/:id';
      else if (len === 3 && s2) p = '/' + s0 + '/' + (PARAM[s0] || ':id') + '/' + s2;
      else p = '/' + s0 + '/' + (PARAM[s0] || ':id');
    }
    methods.forEach((m) => add(m, p, h));
  }
  add('GET', '/media/file', 'media.serve (netlify.js)');
  return out;
}

/* ---------- what each route does, auth, from the header comment ---------- */
function docs() {
  const block = api.slice(api.indexOf('   Routes'), api.indexOf('*/'));
  const out = [];
  for (const l of block.split('\n')) {
    const m = l.match(/^\s+(GET|POST)\s+(\/\S+)\s*(.*)$/); if (!m) continue;
    const auth = /\[auth\]/.test(m[3]), text = m[3].replace(/\s*\[auth\]\s*$/, '').replace(/\s{2,}/g, ' ').trim();
    out.push({ method: m[1], path: m[2].replace(/\?.*$/, ''), auth, text });
  }
  return out;
}

/* ---------- which module does the work ---------- */
function modules() {
  const req = {};
  for (const m of api.matchAll(/const (?:\{([^}]+)\}|(\w+)) = require\('\.\/(\w+)'\)/g)) {
    const names = m[1] ? m[1].split(',').map((x) => x.split(':').pop().trim()) : [m[2]];
    for (const n of names) req[n] = m[3] + '.js';
  }
  return req;
}
function filesFor(handler, req) {
  if (!handler || handler === 'inline') return ['api.js'];
  if (/netlify/.test(handler)) return ['netlify.js', 'media.js'];
  const at = api.search(new RegExp('\\n(?:async )?function ' + handler + '\\('));
  if (at < 0) return ['api.js'];
  const next = api.slice(at + 1).search(/\n(?:async )?function \w+\(|\nconst \w+ = /);
  const body = api.slice(at, next < 0 ? undefined : at + 1 + next);
  const used = new Set(['api.js']);
  for (const [name, file] of Object.entries(req)) if (!/^(HttpError|configured|seal)$/.test(name) && new RegExp('\\b' + name + '\\s*[.(]').test(body)) used.add(file);
  if (/\bmedia\w*\(|makeMedia|cfg\.media/.test(body)) used.add('media.js');
  /* modules reached through a small wrapper: const account = (cfg) => makeAccount(...) */
  for (const w of api.matchAll(/\nconst (\w+) = \([^)]*\) => (make\w+)\(/g)) if (req[w[2]] && new RegExp('\\b' + w[1] + '\\(').test(body)) used.add(req[w[2]]);
  if (/\bqueue\w*\(|publish/i.test(handler)) used.add('publish.js (worker)');
  return [...used];
}

/* ---------- the calls the app makes ---------- */
function clientCalls() {
  const calls = new Map();
  /* authFetch('/x'), api('/x/' + encodeURIComponent(id) + '/y'), server() + '/ping' */
  const EXPR = '[\\w.$]+(?:\\([^()]*\\))?';
  const re = new RegExp("(?:authFetch|\\bapi|postJSON)\\(\\s*(['\"])(\\/[^'\"?]*)(\\?[^'\"]*)?\\1(\\s*\\+\\s*" + EXPR + "(?:\\s*\\+\\s*(['\"])([^'\"]*)\\5)?)?\\s*[,)]|(?:server\\(\\)|\\bbase|KovaLink\\.server\\(\\))\\s*\\+\\s*(['\"])(\\/[^'\"]*)\\7", 'g');
  const put = (p, i) => { const line = html.slice(0, i).split('\n').length; if (!calls.has(p)) calls.set(p, []); calls.get(p).push(line); };
  for (const m of html.matchAll(re)) {
    let p = m[2] || m[8]; if (!p) continue;
    if (m[4]) p = p.replace(/\/?$/, '/') + ':x' + (m[6] || '');
    put(p, m.index);
  }
  /* a path built in a variable first: '/media/upload?kind=' + ... */
  for (const m of html.matchAll(/=\s*(['"])(\/[a-z][\w/-]*)\?[\w=]*\1\s*\+/g)) if (/^\/(media|api)\//.test(m[2])) put(m[2], m.index);
  return calls;
}
const match = (pattern, p) => new RegExp('^' + pattern.replace(/:[a-z]+/g, '[^/]+') + '$').test(p.replace(/:x/g, 'X'));
const BY = { '/oauth/callback': 'the provider, after you approve', '/billing/webhook': 'RevenueCat', '/media/file': 'signed links in the app (img/video src)',
  '/health/:token': 'the Apple Health shortcut / Health Auto Export (POST); the app reads it (GET)', '/social/me': 'not called yet (reserved for a profile screen)',
  '/social/followers/remove': 'not called yet (reserved for "remove follower")', '/posts/:id': 'Studio, while a post is sending' };

export function generate() {
  const S = serverRoutes(), D = docs(), req = modules(), C = clientCalls();
  const best = (p) => S.filter((r) => match(r.path, p)).map((r) => r.path).sort((a, b) => (a.match(/:/g) || []).length - (b.match(/:/g) || []).length)[0];
  const rows = S.map((r) => {
    const d = Object.assign({ found: true }, D.find((x) => x.path === r.path && x.method === r.method) || D.find((x) => x.path === r.path) || { found: false, auth: true, text: '' });
    /* each call counts for its most specific route: /health/token, not /health/:token */
    const callers = [...C.entries()].filter(([p]) => match(r.path, p) && best(p) === r.path).flatMap(([, lines]) => lines);
    return { ...r, auth: d.found ? d.auth : true, text: d.text, files: filesFor(r.handler, req), callers };
  });
  const missing = [...C.entries()].filter(([p]) => !S.some((r) => match(r.path, p)));
  const esc = (t) => String(t).replace(/\|/g, '\\|');
  let md = '# Kova server routes\n\n'
    + 'Generated by `node build/routes.mjs` from the router in `functions/api.js` (and the file route in `functions/netlify.js`), '
    + 'checked against every call in `index.html`. CI fails if this file is stale or a call has no route.\n\n'
    + 'All routes live under `/api` (Netlify: `netlify/functions/api.mjs`). "Auth" means a Firebase ID token in `Authorization: Bearer`; '
    + 'without it the route answers 401. Routes that run the model or publish answer 402 without Kova Pro once billing is on.\n\n'
    + '## Missing\n\n' + (missing.length ? missing.map(([p, l]) => '- `' + p + '` called at index.html line ' + l.join(', ') + ', no route').join('\n') : 'None: every call the app makes has a route.') + '\n\n'
    + '## Routes (' + rows.length + ')\n\n| Method | Path | Implemented in | Auth | What it does / returns | Called by |\n|---|---|---|---|---|---|\n'
    + rows.map((r) => '| ' + r.method + ' | `' + r.path + '` | ' + r.files.map((f) => '`' + f + '`').join(', ') + (r.handler && r.handler !== 'inline' && !/netlify/.test(r.handler) ? ' (' + r.handler + ')' : '')
      + ' | ' + (r.auth ? 'yes' : 'no') + ' | ' + esc(r.text || '') + ' | ' + (r.callers.length ? 'app, index.html line ' + [...new Set(r.callers)].slice(0, 4).join(', ') : esc(BY[r.path] || '—')) + ' |').join('\n') + '\n';
  return { md, rows, missing };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { md, rows, missing } = generate();
  const file = join(root, 'ROUTES.md');
  if (process.argv.includes('--check')) {
    let cur = ''; try { cur = readFileSync(file, 'utf8'); } catch (e) {}
    const stale = cur.replace(/line [\d, ]+/g, '') !== md.replace(/line [\d, ]+/g, '');
    console.log(stale ? 'ROUTES.md is stale: run node build/routes.mjs' : 'ROUTES.md is up to date (' + rows.length + ' routes)');
    if (missing.length) console.log('Missing: ' + missing.map(([p]) => p).join(', '));
    process.exit(stale || missing.length ? 1 : 0);
  }
  writeFileSync(file, md);
  console.log('ROUTES.md: ' + rows.length + ' routes, ' + missing.length + ' missing');
}
