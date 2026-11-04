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
  function go(){ setTimeout(sync,400); document.addEventListener('click',function(e){ if(e.target.closest('.agB__card')) setTimeout(sync,60); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
})();
