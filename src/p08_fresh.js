/* =====================================================================
   KovaFresh - an open Kova picks up a new version by itself (p37).

   A phone keeps an app open for days. After an update it went on showing
   the old one (the owner saw yesterday's figures). The build stamps its
   id into the page (KOVA_BUILD) and into version.json; when you come back
   to Kova, and every half hour while it is open, this asks which version
   is newest. Back after a minute or more away and nothing in progress (no
   sheet, no workout player, no typing, no tour): it reloads. Otherwise a
   small card offers Refresh. Your data is saved as you go, so nothing is
   lost either way.
   ===================================================================== */
window.KovaFresh=(function(){
  'use strict';
  var cur=String(window.KOVA_BUILD||''), away=0, asking=false, newest='';
  var API={check:check,safe:safe,offer:offer,reload:function(){ try{ navigator.serviceWorker&&navigator.serviceWorker.getRegistration&&navigator.serviceWorker.getRegistration().then(function(r){ if(r) r.update(); }); }catch(e){} location.reload(); }};
  function check(){
    if(!cur||asking||typeof fetch!=='function') return Promise.resolve('');
    asking=true;
    return fetch('version.json?t='+Date.now(),{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; })
      .then(function(j){ asking=false; newest=j&&j.v&&j.v!==cur?String(j.v):''; return newest; },function(){ asking=false; return ''; });
  }
  function safe(){
    var a=document.activeElement;
    return !(document.querySelector('#sheet.on')||document.getElementById('kpl')||document.getElementById('kz2')||document.getElementById('ksTour')
      ||(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))||(window.KovaTour&&KovaTour.active&&KovaTour.active()));
  }
  function offer(){
    if(document.getElementById('kfr')) return;
    var el=document.createElement('div'); el.id='kfr'; el.className='card kfr'; el.setAttribute('role','status');
    el.innerHTML='<span>Kova was updated.</span><button type="button" class="chip on" data-kfr="go">Refresh</button><button type="button" class="kfr-x" data-kfr="x" aria-label="Later">×</button>';
    (document.getElementById('app')||document.body).appendChild(el);
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-kfr]'); if(!b) return;
    if(b.getAttribute('data-kfr')==='go') API.reload(); else { var el=document.getElementById('kfr'); if(el) el.remove(); }
  });
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){ away=Date.now(); return; }
    var gone=away?Date.now()-away:0; away=0;
    check().then(function(v){ if(!v) return; if(gone>=60000&&safe()) API.reload(); else offer(); });
  });
  setInterval(function(){ if(!document.hidden) check().then(function(v){ if(v) offer(); }); },30*60000);
  return API;
})();
