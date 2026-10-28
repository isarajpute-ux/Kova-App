(function(){
  function build(){
    document.querySelectorAll('[data-ag-track]').forEach(function(tr){
      if (tr.__gn) return; tr.__gn = 1;
      var n = tr.children.length, stage = tr.closest('.agP__stage'); if (n < 2 || !stage) return;
      var ch = function(d){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="' + (d < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '"/></svg>'; };
      var w = document.createElement('div'); w.className = 'agGN';
      w.innerHTML = '<div class="agGN__btns"><button type="button" class="agGN__b" aria-label="Previous image">' + ch(-1) + '</button><button type="button" class="agGN__b" aria-label="Next image">' + ch(1) + '</button></div><div class="agGN__bar"><span class="agGN__fill"></span></div>';
      stage.parentNode.insertBefore(w, stage.nextSibling);
      var b = w.querySelectorAll('.agGN__b'), f = w.querySelector('.agGN__fill'), i = 0;
      f.style.width = (100 / n) + '%';
      function cur(){ return Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth)); }
      function ui(){ i = cur(); f.style.transform = 'translateX(' + (i * 100) + '%)'; b[0].disabled = i <= 0; b[1].disabled = i >= n - 1; }
      function go(k){ k = Math.max(0, Math.min(n - 1, k)); tr.scrollTo({ left: k * tr.clientWidth, behavior: 'smooth' }); i = k; f.style.transform = 'translateX(' + (k * 100) + '%)'; b[0].disabled = k <= 0; b[1].disabled = k >= n - 1; }
      b[0].onclick = function(){ go(cur() - 1); }; b[1].onclick = function(){ go(cur() + 1); };
      var t; tr.addEventListener('scroll', function(){ clearTimeout(t); t = setTimeout(ui, 90); }, { passive: true });
      ui();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  document.addEventListener('shopify:section:load', build);
})();
/* Noctara: Intake-style sticky bar — savings line + green "Delivery by <date>" */
(function(){
  function fmt(c,f){ var v=(c/100).toFixed(2); return (f||'${{amount}}').replace(/\{\{\s*amount[^}]*\}\}/, v); }
  function run(){
    var st=document.querySelector('[data-ag-sticky]'), p=document.querySelector('[data-ag-product]'); if(!st||!p) return;
    var col=st.querySelector('.nxBtnCol'), btn=st.querySelector('[data-ag-sticky-btn]');
    if(!col){ col=document.createElement('div'); col.className='nxBtnCol'; btn.parentNode.insertBefore(col,btn); col.appendChild(btn);
      var d=document.createElement('span'); d.className='nxDel'; col.appendChild(d);
      var e=p.querySelector('[data-ag-eta]'), days=e?(+e.dataset.shipMax||0)+(+e.dataset.delMax||0):9, dt=new Date(); dt.setDate(dt.getDate()+(days||9));
      d.textContent='Delivery by '+dt.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
    var pr=st.querySelector('.agSticky__p'), mc=p.querySelector('[data-ag-compare]');
    var sv=st.querySelector('.nxSave'); if(!sv){ sv=document.createElement('span'); sv.className='nxSave'; pr.parentNode.appendChild(sv); }
    var s=pr.querySelector('s'); if(!s){ s=document.createElement('s'); pr.appendChild(s); }
    var price=+(p.dataset.price||0), cmp=+(p.dataset.compare||0);
    var a=p.querySelector('.agP__pillBtn.is-active'); if(a){ price=+a.dataset.price; cmp=+a.dataset.compare; }
    if(mc && !mc.hidden && cmp>price){ s.textContent=mc.textContent.trim(); sv.textContent='You save '+fmt(cmp-price,p.dataset.moneyFormat)+' ('+Math.round((1-price/cmp)*100)+'% off)'; } else { s.textContent=''; sv.textContent=''; }
  }
  function go(){ run(); document.addEventListener('click',function(){ setTimeout(run,80); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
})();
/* Noctara: bundle checklist + save pill, "Delivery by" under add to cart */
(function(){
  function run(){
    document.querySelectorAll('[data-ag-bundle]').forEach(function(c){
      if(c.__nx) return; c.__nx=1;
      var sm=c.querySelector('.agB__txt small'); if(sm && sm.textContent.indexOf('|')>-1){ var parts=sm.textContent.split('|'); sm.textContent=parts.shift().trim();
        var ul=document.createElement('ul'); ul.className='nxPerks'; parts.forEach(function(t){ t=t.trim(); if(t){ var li=document.createElement('li'); li.textContent=t; ul.appendChild(li);} }); c.appendChild(ul); }
      var pill=document.createElement('span'); pill.className='nxSavePill'; c.querySelector('.agB__txt').appendChild(pill);
    });
    var p=document.querySelector('[data-ag-product]');
    document.querySelectorAll('[data-ag-bundle]').forEach(function(c){
      var b=c.querySelector('[data-ag-bprice]'), s=c.querySelector('[data-ag-bcompare]'), pill=c.querySelector('.nxSavePill'); if(!pill) return;
      var n=function(e){ return e? parseFloat(e.textContent.replace(/[^0-9.]/g,''))||0 : 0; };
      var d=(s && !s.hidden)? n(s)-n(b) : 0; pill.style.display=d>0?'':'none'; pill.textContent='SAVE $'+(Math.round(d*100)/100).toFixed(d%1?2:0);
    });
    var f=document.querySelector('.agP__form'); if(f && !document.querySelector('.nxDelMain')){
      var e=p&&p.querySelector('[data-ag-eta]'), days=e?(+e.dataset.shipMax||0)+(+e.dataset.delMax||0):9, dt=new Date(); dt.setDate(dt.getDate()+(days||9));
      var d=document.createElement('p'); d.className='nxDelMain'; d.innerHTML='Delivery by <b>'+dt.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'</b>'; f.parentNode.insertBefore(d,f.nextSibling); }
  }
  function go(){ run(); document.addEventListener('click',function(){ setTimeout(run,90); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',go); else go();
})();
