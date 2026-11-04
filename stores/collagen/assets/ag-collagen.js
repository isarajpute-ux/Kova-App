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
    if(!document.getElementById('nxArwCss')){ var st=document.createElement('style'); st.id='nxArwCss'; st.textContent='.nxArw{position:absolute;left:10px;right:10px;top:50%;transform:translateY(-50%);display:flex!important;justify-content:space-between!important;pointer-events:none;z-index:3}.nxArw .agGN__b{pointer-events:auto;background:rgba(255,255,255,.9)!important;color:#4A2545!important;border:0!important;box-shadow:0 4px 12px -4px rgba(42,20,39,.35)!important}.nxArw .agGN__b[disabled]{opacity:0!important}.agGN{margin-top:10px}'; document.head.appendChild(st); }
    $$('.agGN__btns').forEach(function(bt){ if(bt.classList.contains('nxArw')) return; var w=bt.closest('.agGN'), stg=w&&w.previousElementSibling, mn=stg&&(stg.querySelector('.agP__main')||stg); if(!mn) return; bt.classList.add('nxArw'); mn.appendChild(bt); });
  }
  function go(){ arrows(); setTimeout(arrows,300); setTimeout(avatars,300); setTimeout(steps,200); setTimeout(ovl,500); setTimeout(ovl,1500); setTimeout(sync,400); document.addEventListener('click',function(e){ if(e.target.closest('.agB__card')) setTimeout(sync,60); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
  document.addEventListener('shopify:section:load',function(){ setTimeout(steps,300); setTimeout(avatars,450); setTimeout(ovl,600); setTimeout(sync,650); setTimeout(arrows,200); });
})();
/* Auvela: Subscribe & Save toggle (Shopify Subscriptions plans) - whole page switches price/perks */
(function(){
  var PLANS=[{id:'8043429997',label:'Every month'},{id:'8043462765',label:'Every 3 months'}], PCT=20;
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function money(c,f){ return (f||'${{amount}}').replace(/\{\{\s*amount[^}]*\}\}/,(c/100).toFixed(2)); }
  var S={on:true,plan:PLANS[0].id};
  function css(){
    if($('#nxSubCss')) return; var st=document.createElement('style'); st.id='nxSubCss';
    st.textContent='.nxSub{display:grid;gap:10px;margin:14px 0}.nxSub__o{display:flex;gap:12px;align-items:flex-start;border:1.5px solid #E3D6CF;border-radius:14px;padding:14px 16px;cursor:pointer;background:#fff;transition:border-color .2s,background .2s}.nxSub__o.on{border-color:#4A2545;background:#F6ECE8;box-shadow:0 0 0 1px #4A2545}.nxSub__r{flex:0 0 18px;height:18px;border-radius:50%;border:2px solid #B9A7A2;margin-top:2px;position:relative}.nxSub__o.on .nxSub__r{border-color:#4A2545}.nxSub__o.on .nxSub__r:after{content:"";position:absolute;inset:3px;border-radius:50%;background:#4A2545}.nxSub__b{flex:1;min-width:0}.nxSub__h{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.nxSub__t{font-weight:600;color:#2A1427;font-size:15px}.nxSub__tag{display:inline-block;margin-left:6px;background:#C9A24B;color:#fff;font-size:10.5px;font-weight:600;letter-spacing:.04em;padding:3px 8px;border-radius:999px;vertical-align:middle}.nxSub__p{font-weight:600;color:#2A1427;white-space:nowrap}.nxSub__p s{font-weight:400;color:#8C7A76;margin-right:6px;font-size:13px}.nxSub__d{display:none;margin-top:8px}.nxSub__o.on .nxSub__d{display:block}.nxSub__d ul{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:6px;font-size:13.5px;color:#4A2545}.nxSub__d li:before{content:"\\2713";margin-right:8px;font-weight:700}.nxSub__d select{width:100%;padding:9px 10px;border:1px solid #D9C8C1;border-radius:10px;background:#fff;font:inherit;font-size:14px;color:#2A1427}.nxSubOn .nxPlan__pop{background:#4A2545!important}[data-ag-bcompare][hidden],[data-ag-compare][hidden],s.nxSame{display:none!important}.agP__desc{font-size:14px!important;line-height:1.55!important}.agP__desc p{margin:0 0 8px!important}.agP__desc h4{font-size:14px!important;font-weight:600;margin:12px 0 6px!important;color:#2A1427}.agP__desc ul{list-style:none;padding:0!important;margin:0 0 6px!important;display:grid;gap:5px}.agP__desc li{font-size:13.5px;padding-left:22px;position:relative}.agP__desc li:before{content:"\\2713";position:absolute;left:0;color:#4A2545;font-weight:700}.agP__desc.nxClip{max-height:118px;overflow:hidden;-webkit-mask-image:linear-gradient(#000 60%,transparent)}.nxMore{background:none;border:0;padding:0;margin:2px 0 10px;font:inherit;font-size:13.5px;font-weight:600;color:#4A2545;text-decoration:underline;cursor:pointer}';
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
      box.innerHTML='<div class="nxSub__o" data-s="1"><span class="nxSub__r"></span><div class="nxSub__b"><div class="nxSub__h"><span class="nxSub__t">Subscribe &amp; Save '+PCT+'%<span class="nxSub__tag">BEST DEAL</span></span><span class="nxSub__p" data-sp></span></div><div class="nxSub__d"><ul><li>'+PCT+'% off every order, locked in</li><li>Free shipping on every delivery</li><li>Skip, pause or cancel anytime</li></ul><select aria-label="Delivery frequency"></select></div></div></div><div class="nxSub__o" data-s="0"><span class="nxSub__r"></span><div class="nxSub__b"><div class="nxSub__h"><span class="nxSub__t">One-time purchase</span><span class="nxSub__p" data-op></span></div></div></div>';
      var sel=$('select',box); PLANS.forEach(function(x){ var o=document.createElement('option'); o.value=x.id; o.textContent='Deliver: '+x.label; sel.appendChild(o); });
      sel.value=S.plan; sel.addEventListener('change',function(){ S.plan=sel.value; apply(); }); sel.addEventListener('click',function(e){ e.stopPropagation(); });
      $$('.nxSub__o',box).forEach(function(o){ o.addEventListener('click',function(){ S.on=o.dataset.s==='1'; apply(); }); });
      anchor.parentNode.insertBefore(box,b?b.nextSibling:anchor);
    }
    apply();
  }
  function apply(){
    var p=$('[data-ag-product]'); if(!p) return; var box=$('.nxSub',p); if(!box) return;
    var f=p.dataset.moneyFormat, c=cur(p), full=c.pr, sub=sp(full), was=c.cm>full?c.cm:full;
    $$('.nxSub__o',box).forEach(function(o){ o.classList.toggle('on',(o.dataset.s==='1')===S.on); });
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
    var ds=$('.agP__desc',p); if(ds && !ds.__nxm && ds.scrollHeight>150){ ds.__nxm=1; ds.classList.add('nxClip'); var mb=document.createElement('button'); mb.type='button'; mb.className='nxMore'; mb.textContent='Read more'; mb.addEventListener('click',function(e){ e.stopPropagation(); var c=ds.classList.toggle('nxClip'); mb.textContent=c?'Read more':'Show less'; }); ds.parentNode.insertBefore(mb,ds.nextSibling); }
    var dyn=$('.agP__dyn',p); if(dyn) dyn.style.display=S.on?'none':'';
  }
  function go(){ setTimeout(build,700); document.addEventListener('click',function(e){ if(e.target.closest('.agB__card,.agP__pillBtn')) { setTimeout(apply,350); setTimeout(apply,700); } else setTimeout(apply,300); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
  document.addEventListener('shopify:section:load',function(){ setTimeout(build,900); });
})();
