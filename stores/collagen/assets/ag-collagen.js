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
  function go(){ setTimeout(avatars,300); setTimeout(steps,200); setTimeout(ovl,500); setTimeout(ovl,1500); setTimeout(sync,400); document.addEventListener('click',function(e){ if(e.target.closest('.agB__card')) setTimeout(sync,60); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
  document.addEventListener('shopify:section:load',function(){ setTimeout(steps,300); setTimeout(avatars,450); setTimeout(ovl,600); setTimeout(sync,650); });
})();
