import { Liquid, Tag } from 'liquidjs';
import fs from 'fs';
import path from 'path';
const B = process.argv[2];
const OUT = process.argv[3];
const engine = new Liquid({ root: [path.join(B,'snippets')], extname: '.liquid', relativeReference: false, jsTruthy: false });
const colors = ['#7a2a3a','#2f5d3a','#a8743a','#3a4f7a','#6b3a7a','#7a5a2a','#2a6b6b','#8a3a2a'];
function ph(label, i){ const c = colors[i % colors.length]; return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><text x="400" y="410" font-size="44" fill="#fff" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`); }
let n = 0;
const img = (label) => ({ src: ph(label, n++), alt: label, width: 800, height: 800, __img: true });
engine.registerFilter('asset_url', v => '/assets/' + v);
engine.registerFilter('stylesheet_tag', v => `<link rel="stylesheet" href="${v}">`);
engine.registerFilter('image_url', (v) => v && (v.src || (v.preview_image && v.preview_image.src)) || '');
engine.registerFilter('image_tag', (v, ...args) => { let attrs=''; for (const a of args) { if (Array.isArray(a)) { const [k,val]=a; if (['widths','sizes'].includes(k)) continue; attrs += ` ${k}="${val}"`; } } return `<img src="${v}"${attrs}>`; });
engine.registerFilter('placeholder_svg_tag', (v, cls) => `<svg class="${cls||''}" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ddd"/></svg>`);
engine.registerFilter('payment_type_svg_tag', (v) => `<svg class="agP__payIc" viewBox="0 0 38 24"><rect width="38" height="24" rx="3" fill="#fff" stroke="#ccc"/><text x="19" y="15" font-size="7" text-anchor="middle">${v}</text></svg>`);
engine.registerFilter('media_tag', v => '');
engine.registerFilter('video_tag', (v, ...args) => { let cls=''; for (const a of args) { if (Array.isArray(a) && a[0]==='class') cls=a[1]; } return `<video class="${cls}" src="/test.mp4" autoplay loop muted playsinline></video>`; });
engine.registerFilter('money', v => '$' + (Number(v)/100).toFixed(2));
engine.registerFilter('divided_by', (a, b) => (Number.isInteger(a) && Number.isInteger(b)) ? Math.floor(a/b) : a/b);
engine.registerTag('schema', class extends Tag { constructor(t, r, l){ super(t,r,l); this.tpls=[]; const s=l.parser.parseStream(r); s.on('tag:endschema',()=>s.stop()).on('template',()=>{}).on('end',()=>{throw new Error('no endschema')}); s.start(); } *render(){ return ''; } });
engine.registerTag('form', class extends Tag { constructor(t, r, l){ super(t,r,l); this.args=t.args; this.tpls=[]; const s=l.parser.parseStream(r); s.on('tag:endform',()=>s.stop()).on('template',tp=>this.tpls.push(tp)).on('end',()=>{throw new Error('no endform')}); s.start(); } *render(ctx, emitter){ const id=(this.args.match(/id:\s*([\w_]+)/)||[])[1]; const idv = id ? ctx.getSync([id]) : ''; emitter.write(`<form method="post" action="/cart/add" id="${idv}" class="form">`); yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter); emitter.write('</form>'); } });

function toImg(v){ if (typeof v === 'string' && v.startsWith('shopify://shop_images/')) return img(v.split('/').pop()); if (typeof v === 'string' && v.startsWith('shopify://files/videos/')) return { video: v }; return v; }
function mkSection(id, sec, schemaDefaults){
  const settings = {};
  for (const [k,v] of Object.entries(sec.settings||{})) settings[k]=toImg(v);
  const blocks = (sec.block_order||[]).map(bid => { const b = sec.blocks[bid]; const st={}; for (const [k,v] of Object.entries(b.settings||{})) st[k]=toImg(v); return { id: bid, type: b.type, settings: st, shopify_attributes: '' }; });
  return { id, settings, blocks };
}
const media = ['Hero box shot','Lifestyle 1','Lifestyle 2','App screen','Tree close-up','Snowman','Family tree'].map((l,i)=>{ const im=img(l); return { id: i+1, position: i+1, media_type: 'image', alt: l, src: im.src, preview_image: im }; });
const variants = [
  {id:1,title:'5 ft · 400 LEDs',price:7999,compare_at_price:null,available:true},
  {id:2,title:'6 ft · 256 LEDs',price:7499,compare_at_price:null,available:true},
  {id:3,title:'6 ft · 400 LEDs',price:7999,compare_at_price:null,available:true},
  {id:4,title:'7 ft · 400 LEDs',price:8499,compare_at_price:null,available:true},
  {id:5,title:'8 ft · 256 LEDs',price:8999,compare_at_price:null,available:true}];
const product = { title:'AuraGlow Smart Tree Lights', media, featured_media: media[0], variants, selected_or_first_available_variant: variants[0], has_only_default_variant:false, options:['Tree size'] };
const shop = { money_format: '${{amount}}', enabled_payment_types: ['visa','master','american_express','paypal','apple_pay','google_pay','shopify_pay'] };
const tpl = JSON.parse(fs.readFileSync(path.join(B,'templates/product.json'),'utf8'));
async function renderSection(type, id, sec){
  const src = fs.readFileSync(path.join(B,'sections',type+'.liquid'),'utf8');
  return engine.parseAndRender(src, { section: mkSection(id, sec), product, shop });
}
let html = '';
const top = { settings: { label:'Ends in', mode:'evergreen', hours:5, end_date:'2026-12-24T23:59', show_days:true, code:'XMAS25', copied_text:'Copied!', dismissible:true, show_line:false, digit_m:18, digit_d:26, c_bg:'#0F2E1F', c_text:'#FFFFFF', c_label:'#BDBDBD', c_tile:'#1D4A33', c_code_bg:'#FFFFFF', c_code_text:'#B3122E', c_line:'#7A3446', show_snow:true, snow_count:26, snow_opacity:75, snow_color:'#D6E2EC' } };
html += await renderSection('ag-topbar','top', top);
html += `<div style="background:#C8102E;color:#fff;text-align:center;font:600 12px Poppins,sans-serif;letter-spacing:.08em;padding:9px">FREE TRACKED SHIPPING ON EVERY ORDER</div><header style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #eee;font-family:Poppins"><span>☰</span><img src="/assets/logo.png" style="height:22px" onerror="this.outerHTML='<b style=letter-spacing:.3em>AURAGLOW</b>'"><span>🔍 👤 🛒</span></header>`;
for (const k of tpl.order){ const sec = tpl.sections[k]; html += await renderSection(sec.type, k, sec); }
const shell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{font-size:62.5%}body{margin:0;font-size:1.5rem}</style></head><body>${html}<div style="height:600px;background:#fafafa"></div></body></html>`;
fs.writeFileSync(OUT, shell);
console.log('ok', shell.length);
