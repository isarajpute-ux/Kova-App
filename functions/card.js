/* The business card - "for business inquiries" on every profile.

   Kova keeps one card (email, phone, website, booking link, one-line bio)
   and pushes it where a platform lets an app change a profile:

     Facebook Page  the Page's email, phone and website fields
     YouTube        a "Business inquiries" block in the channel description
                    (only Kova's block is replaced; the rest is left alone)

   Instagram, TikTok, X, LinkedIn, Threads and Pinterest do not let apps
   edit a profile. For those the Studio copies the card and opens that
   app's edit-profile page - it says so rather than pretending. */

const START = '— Business inquiries —';
const END = '— —';

function clean(c) {
  const s = (x, n) => String(x == null ? '' : x).trim().slice(0, n);
  const email = s(c.email, 120);
  const site = s(c.website, 300), book = s(c.booking, 300);
  return {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '',
    phone: s(c.phone, 40).replace(/[^\d+()\-.\s]/g, ''),
    website: /^https?:\/\/\S+\.\S+/.test(site) ? site : '',
    booking: /^https?:\/\/\S+\.\S+/.test(book) ? book : '',
    bio: s(c.bio, 150)
  };
}
/* the lines that go in a description or get pasted into a bio */
function block(c) {
  return [START, c.bio, c.email && `Email: ${c.email}`, c.phone && `Phone: ${c.phone}`, c.website && `Shop: ${c.website}`,
          c.booking && `Book: ${c.booking}`, END].filter(Boolean).join('\n');
}
/* replace Kova's block if it is there, else add it at the end */
function withBlock(desc, c) {
  const d = String(desc || '');
  const a = d.indexOf(START), b = a >= 0 ? d.indexOf(END, a + START.length) : -1;
  const body = block(c);
  if (a >= 0 && b >= 0) return (d.slice(0, a) + body + d.slice(b + END.length)).slice(0, 5000);
  return ((d.trim() ? d.trim() + '\n\n' : '') + body).slice(0, 5000);
}

function makeCard(deps) {
  const { cfg, tokens } = deps;
  const fetch = deps.fetch || ((...a) => global.fetch(...a));

  async function facebook(uid, c) {
    const t = await tokens.get(uid, 'facebook');
    const x = t.extra || {};
    const page = (x.pages || []).filter((p) => p.id === x.target)[0] || (x.pages || [])[0];
    if (!page) throw new Error('Reconnect Facebook - no Page to update.');
    const body = new URLSearchParams({ access_token: page.token });
    if (c.email) body.set('emails', JSON.stringify([c.email]));
    if (c.phone) body.set('phone', c.phone);
    if (c.website) body.set('website', c.website);
    const r = await fetch(`https://graph.facebook.com/${cfg.fbVersion || 'v23.0'}/${page.id}`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error || j.success === false) throw new Error('Facebook refused it: ' + ((j.error && j.error.message) || `HTTP ${r.status}`));
    return { state: 'ok', msg: `${page.name}: email, phone and website updated.` };
  }

  async function youtube(uid, c) {
    const t = await tokens.get(uid, 'google');
    if (!/youtube\.force-ssl|auth\/youtube(\s|$)/.test(t.scope || '')) throw new Error('Reconnect Google and allow Kova to manage your channel.');
    const H = { authorization: `Bearer ${t.access_token}` };
    const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings&mine=true', { headers: H });
    const j = await r.json().catch(() => ({}));
    const ch = (j.items || [])[0];
    if (!r.ok || !ch) throw new Error('YouTube did not return your channel.');
    const bs = ch.brandingSettings || {};
    bs.channel = Object.assign({}, bs.channel, { description: withBlock((bs.channel || {}).description, c) });
    const u = await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings', {
      method: 'PUT', headers: Object.assign({ 'content-type': 'application/json' }, H),
      body: JSON.stringify({ id: ch.id, brandingSettings: { channel: bs.channel } })
    });
    const uj = await u.json().catch(() => ({}));
    if (!u.ok) throw new Error('YouTube refused it: ' + ((uj.error && uj.error.message) || `HTTP ${u.status}`));
    return { state: 'ok', msg: 'Channel description has your business inquiries block.' };
  }

  const PUSH = { facebook, youtube };
  async function push(uid, card, which) {
    const c = clean(card || {});
    if (!c.email && !c.phone && !c.website && !c.booking) throw Object.assign(new Error('Add at least an email, phone or link.'), { status: 400 });
    const out = {};
    for (const k of Object.keys(PUSH)) {
      if (which && which.length && !which.includes(k)) continue;
      try { out[k] = await PUSH[k](uid, c); }
      catch (e) { out[k] = { state: /not connected/i.test(e.message) ? 'skipped' : 'error', msg: e.message }; }
    }
    return { card: c, text: block(c), results: out };
  }

  return { push };
}

module.exports = { makeCard, clean, block, withBlock, START, END };
