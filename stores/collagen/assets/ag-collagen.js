/* Collagen store: each pack card selects its own Shopify variant (1 / 3 / 6 tubs) and shows that variant's price */
(function(){
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function money(c,f){ return (f||'${{amount}}').replace(/\{\{\s*amount[^}]*\}\}/,(c/100).toFixed(2)); }
  function sync(){
    var p=$('[data-ag-product]'); if(!p) return;
    var cards=$$('.agB__card',p), pills=$$('.agP__pillBtn',p); if(!cards.length||!pills.length) return;
    var i=cards.indexOf($('.agB__card.is-active',p)); if(i<0) i=0;
    var pill=pills[Math.min(i,pills.length-1)];
    if(!pill.classList.contains('is-active')) pill.click();
    var q=$('[data-ag-qty]',p); if(q) q.value=1;
    setTimeout(function(){
      var P=$('.nxPlan',p); if(!P) return; var f=p.dataset.moneyFormat;
      var b=$('.nxPlan__pr b',P), s=$('.nxPlan__pr s',P), pr=+pill.dataset.price, cm=+pill.dataset.compare;
      if(b) b.textContent=money(pr,f);
      if(b && cm>pr){ if(!s){ s=document.createElement('s'); b.parentNode.insertBefore(s,b); } s.textContent=money(cm,f); } else if(s){ s.remove(); }
      var q2=$('[data-ag-qty]',p); if(q2) q2.value=1;
    },250);
  }
  function avatars(){
    var p=$('[data-ag-product]'); if(!p) return; var r=$('.agP__rating',p); if(!r||$('.nxAv',r)) return;
    var imgs=$$('.agMR__img',p).slice(0,3); if(!imgs.length) return;
    var w=document.createElement('span'); w.className='nxAv';
    imgs.forEach(function(m){ var s=document.createElement('span'); s.innerHTML=m.innerHTML; w.appendChild(s); });
    var st=r.firstElementChild; if(st&&st.nextSibling) r.insertBefore(w,st.nextSibling); else r.appendChild(w);
  }
  function ovl(){ $$('.nxOver li > span:first-child').forEach(function(e){ var c=e.style.color; if(c) e.style.setProperty('color',c,'important'); }); }
  function steps(){
    $$('.agAcc__body').forEach(function(bd){
      if(bd.__st) return; var ul=$('ul',bd); var links=$$('a',bd).filter(function(a){ return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(a.getAttribute('href')||''); });
      if(!links.length) return; bd.__st=1; if(ul) ul.className='nxChk';
      var g=document.createElement('div'); g.className='nxSteps';
      links.forEach(function(a,i){ var f=document.createElement('figure'); f.innerHTML='<img loading="lazy" alt=""><figcaption></figcaption>'; f.firstChild.src=a.getAttribute('href'); f.lastChild.textContent=(i+1)+'.'; g.appendChild(f); var par=a.closest('p'); (par||a).remove(); });
      bd.appendChild(g);
    });
  }
  function arrows(){
    if(!document.getElementById('nxArwCss')){ var st=document.createElement('style'); st.id='nxArwCss'; st.textContent='.nxArw{position:absolute;left:10px;right:10px;top:50%;transform:translateY(-50%);display:flex!important;justify-content:space-between!important;pointer-events:none;z-index:3}.nxArw .agGN__b,.nxArw .agGN__b:nth-child(2){pointer-events:auto;display:grid!important;place-items:center;width:36px!important;height:36px!important;border-radius:50%!important;background:#C7ABFF!important;color:#fff!important;border:0!important;box-shadow:0 4px 12px -4px rgba(42,20,39,.5)!important}.nxArw .agGN__b svg{width:16px!important;height:16px!important;stroke:#fff!important}.nxArw .agGN__b[disabled]{opacity:.35!important}.agGN{margin-top:10px}'; document.head.appendChild(st); }
    $$('.agGN__btns').forEach(function(bt){ if(bt.classList.contains('nxArw')) return; var w=bt.closest('.agGN'), stg=w&&w.previousElementSibling, mn=stg&&(stg.querySelector('.agP__main')||stg); if(!mn) return; bt.classList.add('nxArw'); mn.appendChild(bt); });
  }
  function layout(){
    var p=$('[data-ag-product]'); if(!p) return;
    $$('.agP__rating',p).forEach(function(r){ r.style.setProperty('display','none','important'); });
    var form=$('.agP__form',p), feats=$('.agP__feats',p); if(form&&feats&&form.nextElementSibling!==feats) form.parentNode.insertBefore(feats,form.nextSibling);
    var pill=$('.agP__pill',p), rt=$('.agP__rating',p), row=$('.nxTopRow',p);
    if(pill&&rt&&!row){ row=document.createElement('div'); row.className='nxTopRow'; row.style.cssText='display:flex;flex-wrap:nowrap;align-items:center;gap:10px;margin-bottom:10px;max-width:100%'; if(!document.getElementById('nxTopCss')){ var cs=document.createElement('style'); cs.id='nxTopCss'; cs.textContent='.nxTopRow>*{flex:0 0 auto!important;width:auto!important;max-width:none!important;margin:0!important;align-self:center!important;position:static!important;top:auto!important;transform:none!important}.nxTopRow .agP__pill{display:inline-flex!important;align-items:center}.nxTopRow .agP__rating *{margin-top:0!important;margin-bottom:0!important}.nxTopRow .agP__rating>*{align-self:center;line-height:1!important}.nxTopRow .agP__rating{display:flex!important;flex-wrap:nowrap!important;align-items:center;gap:6px;white-space:nowrap;font-size:13px}.nxTopRow .agP__rating svg{width:14px;height:14px}.nxTopRow .nxAv>span{width:22px;height:22px}@media(max-width:420px){.nxTopRow .nxAv{display:none!important}}'; document.head.appendChild(cs); } pill.parentNode.insertBefore(row,pill); row.appendChild(pill); row.appendChild(rt); rt.style.margin='0'; pill.style.margin='0'; }
    var top=row||pill;
    var pf=document.querySelector('[data-nx-proof]');
    if(pf){
      /* copy (never move) so the originals stay in the Product proof section and survive every editor re-render */
      $$('.nxPfClone').forEach(function(o){ o.remove(); });
      function cl(sel){ var o=$(sel,pf); if(!o) return null; var c=o.cloneNode(true); c.classList.add('nxPfClone'); c.removeAttribute('data-nx-proof-rate'); c.removeAttribute('data-nx-proof-box'); c.removeAttribute('data-nx-proof-val'); return c; }
      var rate=cl('[data-nx-proof-rate]'), box=cl('[data-nx-proof-box]'), val=cl('[data-nx-proof-val]');
      if(rate&&top) top.parentNode.insertBefore(rate,top.nextSibling);
      var pills=$('[data-nx-proof-pills]',pf), ds=$('.agP__desc',p);
      if(pills&&ds){ var pc=pills.cloneNode(true); pc.classList.add('nxPfClone'); pc.removeAttribute('data-nx-proof-pills'); var ul=$('ul',ds); if(ul) ds.insertBefore(pc,ul); else ds.appendChild(pc); ds.classList.add('nxHasBen'); } else if(ds){ ds.classList.remove('nxHasBen'); }
      var after=form; if(after){ if(box){ after.parentNode.insertBefore(box,after.nextSibling); after=box; } if(val) after.parentNode.insertBefore(val,after.nextSibling); }
    }
    if(!document.getElementById('nxTight')){ var tc=document.createElement('style'); tc.id='nxTight';
      tc.textContent='.agP .agP__info>*{margin-top:0!important}.agP .nxTopRow{margin-bottom:4px!important}.agP .agP__pill{margin-bottom:4px!important}.agP .agP__title{margin:2px 0 4px!important}.agP .agP__price,.agP .agP__priceRow{margin:4px 0 6px!important}.agP .agP__desc{margin:4px 0 8px!important}.agP .agP__desc p{margin:0 0 4px!important}.agP .agP__desc ul{margin:0 0 4px!important;gap:3px!important}.agP .agP__stock{margin:6px 0!important}.agP .agB__head{margin:4px 0!important}.agP .agB{margin-top:4px!important;margin-bottom:6px!important}.agP .nxPlan{margin-top:6px!important;margin-bottom:8px!important}.agP .agP__form{margin-top:6px!important}.agP .agP__feats{margin-top:8px!important}';
      document.head.appendChild(tc); }
  }
  /* self-heal: if an editor re-render dropped the copied pills / rating / boxes, put them back */
  setInterval(function(){ var pf=document.querySelector('[data-nx-proof]'), p=document.querySelector('[data-ag-product]'); if(!pf||!p) return;
    if((pf.querySelector('[data-nx-proof-pills]')&&!p.querySelector('.agP__desc .nxBen'))||(pf.querySelector('[data-nx-proof-rate]')&&!p.querySelector('.nxPf__rate'))||(pf.querySelector('[data-nx-proof-box]')&&!p.querySelector('.nxPf__box'))) layout(); },1000);
  function go(){ setTimeout(layout,300); setTimeout(layout,900); arrows(); setTimeout(arrows,300); setTimeout(avatars,300); setTimeout(steps,200); setTimeout(ovl,500); setTimeout(ovl,1500); setTimeout(sync,400); document.addEventListener('click',function(e){ if(e.target.closest('.agB__card')) setTimeout(sync,60); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
  document.addEventListener('shopify:section:load',function(){ setTimeout(steps,300); setTimeout(avatars,450); setTimeout(ovl,600); setTimeout(sync,650); setTimeout(arrows,200); setTimeout(layout,500); setTimeout(layout,1000); });
})();
/* Auvela: Subscribe & Save toggle (Shopify Subscriptions plans) - whole page switches price/perks */
(function(){
  var PLANS=[{id:'8043429997',label:'Every month'},{id:'8043462765',label:'Every 3 months'}], PCT=20;
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function money(c,f){ return (f||'${{amount}}').replace(/\{\{\s*amount[^}]*\}\}/,(c/100).toFixed(2)); }
  var S={on:false,plan:PLANS[0].id};
  function css(){
    if($('#nxSubCss')) return; var st=document.createElement('style'); st.id='nxSubCss';
    st.textContent='.nxSub{margin:0 0 14px}.nxSub__seg{position:relative;display:grid;grid-template-columns:1fr 1fr;background:#F3ECE8;border-radius:999px;padding:4px}.nxSub__seg:before{content:"";position:absolute;top:4px;bottom:4px;left:4px;width:calc(50% - 4px);border-radius:999px;background:#C7ABFF;box-shadow:0 4px 12px -4px rgba(42,20,39,.5);transition:transform .3s ease}.nxSub.off .nxSub__seg:before{transform:translateX(100%)}.nxSub__o{position:relative;z-index:1;border:0;background:none;border-radius:999px;padding:9px 8px;cursor:pointer;text-align:center;font:inherit;color:#2A1427;line-height:1.2;transition:color .3s}.nxSub__o.on{color:#fff}.nxSub__t{display:block;font-weight:600;font-size:13.5px}.nxSub__p{display:block;font-size:12px;opacity:.85;margin-top:2px}.nxSub__p s{opacity:.7;margin-right:4px}.nxSub__d{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;margin-top:8px;font-size:12.5px;color:#C7ABFF}.nxSub.off .nxSub__d{display:none}.nxSub__d span:before{content:"\\2713 ";font-weight:700}.nxSub__d select{padding:5px 8px;border:1px solid #D9C8C1;border-radius:8px;background:#fff;font:inherit;font-size:12.5px;color:#2A1427}.nxSubOn .nxPlan__pop{background:#C7ABFF!important}[data-ag-bcompare][hidden],[data-ag-compare][hidden],s.nxSame{display:none!important}.agP__desc{font-size:14px!important;line-height:1.55!important}.agP__desc p{margin:0 0 8px!important}.agP__desc h4{font-size:14px!important;font-weight:600;margin:12px 0 6px!important;color:#2A1427}.agP__desc ul{list-style:none;padding:0!important;margin:0 0 6px!important;display:grid;gap:5px}.agP__desc li{font-size:13.5px;padding-left:22px;position:relative}.agP__desc li:before{content:"\\2713";position:absolute;left:0;color:#C7ABFF;font-weight:700}.agP__desc.nxClip{max-height:118px;overflow:hidden;-webkit-mask-image:linear-gradient(#000 60%,transparent)}.nxMore{background:none;border:0;padding:0;margin:2px 0 10px;font:inherit;font-size:13.5px;font-weight:600;color:#C7ABFF;text-decoration:underline;cursor:pointer}';
    document.head.appendChild(st);
  }
  function cur(p){ var a=$('.agP__pillBtn.is-active',p)||$('.agP__pillBtn',p); return a?{pr:+a.dataset.price,cm:+a.dataset.compare}:{pr:+(p.dataset.price||0),cm:+(p.dataset.compare||0)}; }
  function sp(c){ return Math.round(c*(100-PCT)/100); }
  function input(p){ var f=$('form[data-type="add-to-cart-form"]',p)||$('.agP__form form',p); if(!f) return null; var i=$('input[name="selling_plan"]',f); if(!i){ i=document.createElement('input'); i.type='hidden'; i.name='selling_plan'; f.appendChild(i); } return i; }
  function build(){
    var p=$('[data-ag-product]'); if(!p) return; css();
    var b=$('.agB',p), anchor=b||$('.agP__form',p); if(!anchor) return;
    var box=$('.nxSub',p);
    if(!box){
      box=document.createElement('div'); box.className='nxSub';
      box.innerHTML='<div class="nxSub__seg" role="radiogroup"><button type="button" class="nxSub__o" data-s="1"><span class="nxSub__t">Subscribe &amp; Save '+PCT+'%</span><span class="nxSub__p" data-sp></span></button><button type="button" class="nxSub__o" data-s="0"><span class="nxSub__t">One-time purchase</span><span class="nxSub__p" data-op></span></button></div><div class="nxSub__d"><span>Skip or cancel anytime</span><select aria-label="Delivery frequency"></select></div>';
      var sel=$('select',box); PLANS.forEach(function(x){ var o=document.createElement('option'); o.value=x.id; o.textContent='Deliver: '+x.label; sel.appendChild(o); });
      sel.value=S.plan; sel.addEventListener('change',function(){ S.plan=sel.value; apply(); }); sel.addEventListener('click',function(e){ e.stopPropagation(); });
      $$('.nxSub__o',box).forEach(function(o){ o.addEventListener('click',function(){ S.on=o.dataset.s==='1'; apply(); }); });
      b ? b.parentNode.insertBefore(box,b) : anchor.parentNode.insertBefore(box,anchor);
    }
    apply();
  }
  function apply(){
    var p=$('[data-ag-product]'); if(!p) return; var box=$('.nxSub',p); if(!box) return;
    var f=p.dataset.moneyFormat, c=cur(p), full=c.pr, sub=sp(full), was=c.cm>full?c.cm:full;
    $$('.nxSub__o',box).forEach(function(o){ o.classList.toggle('on',(o.dataset.s==='1')===S.on); }); box.classList.toggle('off',!S.on);
    $('[data-sp]',box).innerHTML='<s>'+money(was,f)+'</s>'+money(sub,f);
    $('[data-op]',box).innerHTML=(c.cm>full?'<s>'+money(c.cm,f)+'</s>':'')+money(full,f);
    var i=input(p); if(i){ i.value=S.on?S.plan:''; i.disabled=!S.on; }
    document.body.classList.toggle('nxSubOn',S.on);
    var price=S.on?sub:full;
    var P=$('.nxPlan',p); if(P){ var pb=$('.nxPlan__pr b',P); if(pb) pb.textContent=money(price,f);
      var ex=$('.nxPlan__subl',P); if(S.on){ if(!ex){ ex=document.createElement('p'); ex.className='nxPlan__sv nxPlan__subl'; var t=$('.nxPlan__top > div',P); if(t) t.appendChild(ex); } if(ex) ex.textContent='Subscribe & Save: extra '+PCT+'% off, every delivery'; } else if(ex) ex.remove(); }
    var q=$('[data-ag-qty]',p), qn=Math.max(1,+(q&&q.value)||1); $$('[data-ag-atc-price]').forEach(function(e){ e.textContent=money(price*qn,f); });
    $$('.agB__price,.nxPlan__pr,.agSticky__p,.agP__price').forEach(function(w){ var x=$('s',w), y=$('b,[data-ag-price],[data-ag-atc-price]',w); if(x) x.classList.toggle('nxSame', !!y && x.textContent.trim()===y.textContent.trim()); });
    var tubs=c.cm>full?c.cm:full, pct=tubs>price?Math.round((1-price/tubs)*100):0;
    $$('[data-ag-sticky] .nxSave').forEach(function(e){ e.textContent=pct?'Save '+pct+'% on this order':''; });
    var ds=$('.agP__desc',p); if(ds && !ds.__nxm && false){ ds.__nxm=1; ds.classList.add('nxClip'); var mb=document.createElement('button'); mb.type='button'; mb.className='nxMore'; mb.textContent='Read more'; mb.addEventListener('click',function(e){ e.stopPropagation(); var c=ds.classList.toggle('nxClip'); mb.textContent=c?'Read more':'Show less'; }); ds.parentNode.insertBefore(mb,ds.nextSibling); }
    var dyn=$('.agP__dyn',p); if(dyn) dyn.style.display=S.on?'none':'';
  }
  function go(){ setTimeout(build,700); document.addEventListener('click',function(e){ if(e.target.closest('.agB__card,.agP__pillBtn')) { setTimeout(apply,350); setTimeout(apply,700); } else setTimeout(apply,300); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
  document.addEventListener('shopify:section:load',function(){ setTimeout(build,900); });
})();

/* Auvela: pause / play button on every video */
(function(){
  var P='<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
      G='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
  function css(){ if(document.getElementById('nxVidCss')) return; var s=document.createElement('style'); s.id='nxVidCss';
    s.textContent='.nxVbtn{position:absolute;right:10px;bottom:10px;z-index:5;width:38px;height:38px;border-radius:50%;border:0;padding:0;display:grid;place-items:center;background:rgba(42,20,39,.72);color:#fff;cursor:pointer;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-shadow:0 4px 12px -4px rgba(0,0,0,.4)}.nxVbtn svg{width:16px;height:16px}.nxVbtn:hover{background:#C7ABFF}';
    document.head.appendChild(s); }
  function run(){ css();
    Array.prototype.forEach.call(document.querySelectorAll('video'),function(v){
      if(v.__nxv) return; v.__nxv=1; var w=v.parentElement; if(!w) return;
      if(getComputedStyle(w).position==='static') w.style.position='relative';
      var b=document.createElement('button'); b.type='button'; b.className='nxVbtn';
      function ui(){ var on=!v.paused; b.innerHTML=on?P:G; b.setAttribute('aria-label',on?'Pause video':'Play video'); }
      b.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); if(v.paused){ var r=v.play(); if(r&&r.catch) r.catch(function(){}); } else v.pause(); });
      v.addEventListener('play',ui); v.addEventListener('pause',ui); ui(); w.appendChild(b);
    });
  }
  function go(){ run(); setTimeout(run,1000); setTimeout(run,3000); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
  document.addEventListener('shopify:section:load',function(){ setTimeout(run,300); });
})();
/* Auvela: compact mobile review slider + bundle cards */
(function(){
  if(document.getElementById('nxMobCss')) return;
  var s=document.createElement('style'); s.id='nxMobCss';
  s.textContent='@media(max-width:749px){'+
   '.agP .agMR{margin:6px 0 10px!important;padding:8px 10px!important;min-height:0!important}'+
   '.agP .agMR__slide{padding:0!important;gap:8px!important;min-height:0!important}'+
   '.agP .agMR__head{gap:6px!important;margin:0 0 2px!important}'+
   '.agP .agMR__img,.agP .agMR__ini{width:28px!important;height:28px!important;flex:0 0 28px!important;font-size:11px!important}'+
   '.agP .agMR__name{font-size:12.5px!important}'+
   '.agP .agMR svg{width:11px!important;height:11px!important}'+
   '.agP .agMR__text{font-size:12px!important;line-height:1.35!important;margin:0!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'+
   '.agP .agMR__nav{width:24px!important;height:24px!important}'+
   '.agP .agB{gap:6px!important;margin-top:6px!important}'+
   '.agP .agB__head{margin-bottom:4px!important;font-size:12px!important}'+
   '.agP .agB__card{padding:8px 5px!important;border-radius:10px!important;gap:4px!important;min-height:0!important}'+
   '.agP .agB__img{width:40px!important;height:40px!important;margin:0 auto 2px!important}'+
   '.agP .agB__img img{width:40px!important;height:40px!important}'+
   '.agP .agB__card .agB__txt strong{font-size:12.5px!important;line-height:1.15!important}'+
   '.agP .agB__card .agB__txt small{font-size:10.5px!important;margin-top:2px!important;line-height:1.2!important}'+
   '.agP .agB__price{font-size:12.5px!important;gap:3px!important}'+
   '.agP .agB__price s{font-size:10.5px!important}'+
   '.agP .agB__badge{font-size:9px!important;padding:2px 6px!important}'+
   '.agP .nxSavePill{font-size:9px!important;padding:2px 6px!important;margin-top:2px!important}'+
   '.nxPlan{padding:12px 14px!important;margin-top:8px!important}'+
   '.nxPlan__t{font-size:15px!important}.nxPlan__s,.nxPlan__sv{font-size:12px!important;margin-top:2px!important}'+
   '.nxPlan:not(.nxPlan--sm) .nxPlan__pr{padding-top:22px!important}.nxPlan__pr b{font-size:17px!important}'+
   '.nxPlan ul{margin-top:8px!important;padding-top:8px!important;gap:5px!important}.nxPlan li{font-size:12.5px!important}'+
   '.nxSub{margin-bottom:8px!important}.nxSub__o{padding:7px 6px!important}.nxSub__t{font-size:12.5px!important}.nxSub__p{font-size:11px!important}.nxSub__d{margin-top:5px!important;font-size:11.5px!important}'+
  '}';
  document.head.appendChild(s);
})();
/* Auvela: plum delivery timeline with glow + animated dashed line */
(function(){
  if(document.getElementById('nxTlCss')) return;
  var s=document.createElement('style'); s.id='nxTlCss';
  s.textContent='body .agTL__ic,body .agP .agTL__ic,body .agTL__step .agTL__ic{background:#C7ABFF!important;background-color:#C7ABFF!important;color:#fff!important;border-color:#C7ABFF!important;animation:nxTlGlow 2.2s ease-in-out infinite!important}'+
   'body .agTL__ic svg,body .agTL__ic svg *{color:#fff!important;stroke:currentColor}'+
   'body .agTL__step:nth-of-type(2) .agTL__ic{animation-delay:.5s!important}body .agTL__step:nth-of-type(3) .agTL__ic{animation-delay:1s!important}'+
   '@keyframes nxTlGlow{0%,100%{box-shadow:0 0 0 0 rgba(199,171,255,.45),0 0 10px rgba(199,171,255,.35)}50%{box-shadow:0 0 0 6px rgba(199,171,255,0),0 0 18px rgba(201,162,75,.55)}}'+
   'body .agTL__line{border-top:0!important;height:2px!important;background:repeating-linear-gradient(90deg,#C7ABFF 0 8px,transparent 8px 14px)!important;background-size:28px 2px!important;animation:nxTlDash 1s linear infinite!important}'+
   '@keyframes nxTlDash{to{background-position:28px 0}}'+
   'body .agTL__t,body .agTL__step b{color:#2A1427!important}';
  document.head.appendChild(s);
})();
/* Auvela: tight vertical rhythm in the product info column */
(function(){
  function $(s,r){return (r||document).querySelector(s)}
  function tight(){
    var p=$('[data-ag-product]'); if(!p) return; var t=$('.agP__title',p); if(!t) return;
    var col=t.parentNode; col.classList.add('nxCol');
    var d=getComputedStyle(col).display; if(d!=='flex'&&d!=='grid'){ col.style.setProperty('display','flex','important'); col.style.setProperty('flex-direction','column','important'); col.style.setProperty('align-items','stretch','important'); }
    if(!document.getElementById('nxColCss')){ var s=document.createElement('style'); s.id='nxColCss';
      s.textContent='.agP .nxCol{gap:8px!important;row-gap:8px!important}'+
      '.agP .nxCol>*{margin-top:0!important;margin-bottom:0!important}'+
      '.agP .nxCol>.nxTopRow,.agP .nxCol>.agP__pill{align-self:flex-start!important}'+
      '.agP .nxInfo{display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;width:100%!important;box-sizing:border-box;padding:10px 14px!important}'+
      '.agP .nxInfo>*,.agP .nxInfo p{margin:0!important;text-align:center!important;width:100%}'+
      '.agP .nxInfo{background:#F1EAFF!important;border:2px dashed #7B52D9!important;border-radius:12px!important;box-shadow:0 6px 16px -10px rgba(123,82,217,.6)!important;color:#2A1427!important;font-size:14px!important;font-weight:500!important}'+
      '.agP .nxInfo strong{color:#2A1427!important;font-weight:800!important}'+
      '.agP .nxInfo strong:nth-of-type(2){display:inline-block;background:#2A1427;color:#fff!important;padding:2px 9px;border-radius:6px;letter-spacing:.06em;margin:0 2px}'+
      '.agP .nxCol>*>p:last-child,.agP .nxCol>*>ul:last-child{margin-bottom:0!important}'+
      '.agP .nxCol .nxPf__rate{margin:0!important;line-height:1.35}'+
      '.agP .nxCol .nxPf__q{display:block;width:100%;margin-top:1px}'+
      '.agP .nxCol .agP__title{line-height:1.05!important;padding:0!important}'+
      '.agP .nxCol .agP__desc p,.agP .nxCol .agP__desc ul{margin:0 0 4px!important}'+
      '.agP .nxCol .agP__stock,.agP .nxCol .agSpots{margin:0!important;padding:0!important}'+
      '.agP .nxCol .agSpots__bar{margin-top:4px!important}'+
      '.agP .nxSub{margin:0!important}.agP .nxSub__d{margin-top:6px!important}'+
      '.agP .agB__head{margin:0 0 6px!important;padding:0!important}'+
      '.agP .agB{margin:0!important;row-gap:8px!important}'+
      '.agP .nxPlan{margin:8px 0 0!important}'+
      '.agP .agP__form,.agP .nxPfClone{margin-top:0!important}'+
      '.agP .nxPf__box{margin:0!important}.agP .nxPf__val{margin:0!important}';
      document.head.appendChild(s); }
    var kids=Array.prototype.slice.call(col.children);
    kids.forEach(function(k){ var cs=getComputedStyle(k); if(cs.display!=='none' && parseFloat(cs.paddingTop)>12 && !k.matches('.agB,.nxPlan,.nxPf__box,.nxPf__val,.agP__form,.agMR')) { k.style.setProperty('padding-top','0','important'); } });
  }
  function go(){ setTimeout(tight,400); setTimeout(tight,1200); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
  document.addEventListener('shopify:section:load',function(){ setTimeout(tight,700); setTimeout(tight,1300); });
})();
/* Auvela: description bullets -> lavender pills with matching icons */
(function(){
  var I={
    body:'<path d="M12 4a2 2 0 1 0 0 .01M7 9h10M12 9v6M9 21l3-6 3 6"/>',
    sparkle:'<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
    shield:'<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    drop:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    hair:'<path d="M6 20c0-8 2-14 6-14s6 6 6 14M9 20c0-6 1-10 3-10s3 4 3 10"/>'
  };
  function pick(t){ t=t.toLowerCase();
    if(/arm|stomach|chest|tight|firm.*(arm|body)/.test(t)) return 'body';
    if(/money|guarantee|promise|refund/.test(t)) return 'shield';
    if(/crep|texture|wrinkl|smooth|glow/.test(t)) return 'sparkle';
    if(/hydrat|moist|plump/.test(t)) return 'drop';
    if(/hair|nail/.test(t)) return 'hair';
    return 'heart'; }
  function css(){ if(document.getElementById('nxPillCss')) return; var s=document.createElement('style'); s.id='nxPillCss';
    s.textContent='body .agP .agP__desc ul.nxPills{list-style:none!important;padding:0!important;margin:8px 0 2px!important;display:grid!important;grid-template-columns:1fr 1fr;gap:8px!important}'+
    'body .agP .agP__desc ul.nxPills li{display:flex!important;align-items:center;gap:9px;background:#F1EAFF;border-radius:999px;padding:9px 14px 9px 9px!important;font-size:13.5px!important;font-weight:600;color:#2A1427;line-height:1.25;margin:0!important}'+
    'body .agP body .agP .agP__desc ul.nxPills li:before{display:none!important;content:none!important}'+
    'body .agP .agP__desc ul.nxPills li:last-child:nth-child(odd){grid-column:1/-1;justify-self:start}'+
    '.nxPills i{flex:0 0 26px;width:26px;height:26px;border-radius:50%;background:#C7ABFF;display:grid;place-items:center}'+
    '.nxPills i svg{width:15px;height:15px;fill:none;stroke:#2A1427;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'+
    '@media(max-width:749px){body .agP .agP__desc ul.nxPills{gap:6px!important}body .agP .agP__desc ul.nxPills li{font-size:12.5px!important;padding:7px 10px 7px 7px!important}.nxPills i{flex-basis:22px;width:22px;height:22px}.nxPills i svg{width:13px;height:13px}}';
    document.head.appendChild(s); }
  function run(){ css();
    Array.prototype.forEach.call(document.querySelectorAll('.agP__desc ul:not(.nxPills)'),function(ul){
      ul.classList.add('nxPills');
      Array.prototype.forEach.call(ul.children,function(li){ if(li.querySelector('i')) return; var i=document.createElement('i'); i.innerHTML='<svg viewBox="0 0 24 24">'+I[pick(li.textContent)]+'</svg>'; li.insertBefore(i,li.firstChild); });
    });
  }
  function go(){ run(); setTimeout(run,500); setTimeout(run,1500); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
  document.addEventListener('shopify:section:load',function(){ setTimeout(run,300); setTimeout(run,1000); });
})();
/* Auvela: "CART" label next to header cart icon */
(function(){
  function run(){ var c=document.querySelector('#cart-icon-bubble'); if(!c||c.querySelector('.nxCartLbl')) return; var s=document.createElement('span'); s.className='nxCartLbl'; s.textContent='Cart'; var b=c.querySelector('.cart-count-bubble'); c.insertBefore(s,b||null); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run); else run();
  document.addEventListener('shopify:section:load',function(){ setTimeout(run,300); }); document.addEventListener('cart:updated',function(){ setTimeout(run,300); }); setTimeout(run,1500);
})();
setInterval(function(){ var c=document.querySelector('#cart-icon-bubble'); if(c&&!c.querySelector('.nxCartLbl')){ var s=document.createElement('span'); s.className='nxCartLbl'; s.textContent='Cart'; c.insertBefore(s,c.querySelector('.cart-count-bubble')||null); } },1500);
