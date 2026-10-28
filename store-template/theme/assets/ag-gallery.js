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
