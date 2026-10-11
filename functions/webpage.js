/* webpage - read one web page for the AI team (p20).

   "Ravi, find this on <website>" needs the page itself, and the browser
   cannot fetch other sites (CORS), so the server does: the in-app tool
   fetch_page calls POST /crew/fetch, and requests that run while Kova is
   closed (asks.js) call it directly.

   It is careful, because a server that fetches any address it is given
   can be pointed at itself:
     - http and https only, ports 80 and 443, no user:password@;
     - the host must resolve only to public addresses (no localhost,
       private, link-local or cloud metadata ranges), checked again on
       every redirect, at most 3 redirects;
     - 10 seconds, 1.5 MB, HTML, plain text, JSON or XML only;
     - what comes back is text: title, description and the readable body
       (scripts, styles, navigation and footers dropped), at most 12,000
       characters, with the links on the page listed separately.
   (A site that answers DNS differently between the check and the fetch
   could still slip past; for that the hosting platform's own outbound
   rules are the last line.) */

const dns = require('dns').promises;
const net = require('net');

class PageError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const MAX_BYTES = 1.5 * 1024 * 1024;
const MAX_TEXT = 12000;

function privateV4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((x) => !(x >= 0 && x <= 255))) return true;
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
    || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)
    || (p[0] === 192 && p[1] === 0 && p[2] === 0) || (p[0] === 198 && (p[1] === 18 || p[1] === 19)) || p[0] >= 224;
}
function privateIp(ip) {
  if (net.isIPv4(ip)) return privateV4(ip);
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (m) return privateV4(m[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);
  }
  return true;
}

function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (e) { throw new PageError(400, 'That is not a web address.'); }
  if (!/^https?:$/.test(u.protocol)) throw new PageError(400, 'Only http and https pages can be read.');
  if (u.username || u.password) throw new PageError(400, 'Addresses with a password in them cannot be read.');
  if (u.port && !['80', '443'].includes(u.port)) throw new PageError(400, 'Only the normal web ports can be read.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || /^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) throw new PageError(400, 'That address is not on the public web.');
  if (net.isIP(host) && privateIp(host)) throw new PageError(400, 'That address is not on the public web.');
  u.hash = '';
  return u;
}

async function publicHost(host, lookup) {
  if (net.isIP(host)) return !privateIp(host);
  let addrs;
  try { addrs = await lookup(host, { all: true }); } catch (e) { throw new PageError(404, 'That site could not be found.'); }
  const list = (Array.isArray(addrs) ? addrs : [addrs]).map((a) => (a && a.address) || a).filter(Boolean);
  if (!list.length) throw new PageError(404, 'That site could not be found.');
  return list.every((ip) => !privateIp(String(ip)));
}

/* the readable text of an HTML page */
function decode(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => { const c = +n; return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ''; })
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => { const c = parseInt(n, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ''; });
}
function readable(html, base) {
  const meta = (name) => { const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i')); return m ? decode(m[1]).trim() : ''; };
  const title = decode(((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || meta('og:title')).replace(/\s+/g, ' ')).trim().slice(0, 200);
  const description = (meta('description') || meta('og:description')).slice(0, 400);
  let body = html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ');
  const main = body.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i);
  if (main && main[2].replace(/<[^>]+>/g, '').trim().length > 400) body = main[2];
  const links = [];
  body.replace(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => {
    const t = decode(text.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    try { const u = new URL(href, base); if (/^https?:$/.test(u.protocol) && t && links.length < 40) links.push({ text: t.slice(0, 80), url: u.href.slice(0, 300) }); } catch (e) { /* skip */ }
    return m;
  });
  const text = decode(body.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section)[^>]*>/gi, '\n').replace(/<li[^>]*>/gi, '\n- ').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, description, text, links };
}

async function fetchPage(raw, deps) {
  deps = deps || {};
  const f = deps.fetch || ((...a) => global.fetch(...a));
  const lookup = deps.lookup || dns.lookup;
  let u = checkUrl(raw);
  let r = null;
  for (let hop = 0; hop <= 3; hop++) {
    if (!(await publicHost(u.hostname.replace(/^\[|\]$/g, ''), lookup))) throw new PageError(400, 'That address is not on the public web.');
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), deps.timeout || 10000) : null;
    try {
      r = await f(u.href, { method: 'GET', redirect: 'manual', signal: ctl ? ctl.signal : undefined,
        headers: { 'user-agent': 'KovaBot/1.0 (+https://kova.app; reads a page a user asked for)', accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5' } });
    } catch (e) { throw new PageError(504, /abort/i.test(String(e && e.name)) ? 'That page took too long to answer.' : 'That page could not be reached.'); }
    finally { if (timer) clearTimeout(timer); }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      if (hop === 3) throw new PageError(508, 'That page redirects too many times.');
      u = checkUrl(new URL(r.headers.get('location'), u).href);
      continue;
    }
    break;
  }
  if (!r.ok) throw new PageError(r.status === 404 ? 404 : 502, `That page answered ${r.status}.`);
  const type = String(r.headers.get('content-type') || '').toLowerCase();
  if (type && !/text\/html|application\/xhtml|text\/plain|application\/json|text\/xml|application\/xml|application\/rss/.test(type)) throw new PageError(415, 'That address is a file, not a page Kova can read.');
  const len = +r.headers.get('content-length') || 0;
  if (len > MAX_BYTES) throw new PageError(413, 'That page is too large to read.');
  /* read at most MAX_BYTES */
  let buf;
  if (r.body && r.body.getReader) {
    const reader = r.body.getReader(); const parts = []; let n = 0;
    for (;;) { const x = await reader.read(); if (x.done) break; n += x.value.length; if (n > MAX_BYTES) { try { reader.cancel(); } catch (e) { /* ignore */ } break; } parts.push(Buffer.from(x.value)); }
    buf = Buffer.concat(parts);
  } else buf = Buffer.from(await r.arrayBuffer()).subarray(0, MAX_BYTES);
  const raw2 = buf.toString('utf8');
  const html = /html|xml/.test(type) || /^\s*</.test(raw2);
  const out = html ? readable(raw2, u.href) : { title: '', description: '', text: raw2.replace(/\s+\n/g, '\n').trim(), links: [] };
  return { url: u.href, title: out.title, description: out.description, text: out.text.slice(0, MAX_TEXT), truncated: out.text.length > MAX_TEXT, links: out.links };
}

module.exports = { fetchPage, readable, checkUrl, privateIp, PageError };
