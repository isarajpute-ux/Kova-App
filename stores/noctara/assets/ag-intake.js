/* Noctara: Intake-style product page (v4) - plan box, tiles, trust row, image overlay, sticky header */
(function(){
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function stickyHeader(){
    var a=$('.announcement-bar-section'), h=$('.section-header'), root=document.documentElement;
    if(a) a.classList.add('nxStickA'); if(h) h.classList.add('nxStickH');
    var f=function(){ var ah=a?a.offsetHeight:0, hh=h?h.offsetHeight:0; root.style.setProperty('--nx-ann',ah+'px'); root.style.setProperty('--nx-hdr',(ah+hh)+'px'); };
    f(); window.addEventListener('resize',f); setTimeout(f,800);
  }
  function build(){
    var p=$('[data-ag-product]'); if(!p||p.__nxI) return; p.__nxI=1;
    var form=$('.agP__form',p), b=$('.agB',p);
    var pill=$('.agP__pill',p), title=$('.agP__title',p); if(pill&&title) title.parentNode.insertBefore(pill,title);
    var feats=$('.agP__feats',p); if(feats&&form) form.parentNode.insertBefore(feats,form);
    var ben=$('.agP__benefits',p), main=$('.agP__main',p);
    if(ben&&main){ var ov=document.createElement('ul'); ov.className='nxOver'; ov.innerHTML=ben.innerHTML; main.appendChild(ov); }
    if(b){ b.style.setProperty('--nx-cols', Math.max(1,$$('.agB__card',b).length)); var plan=document.createElement('div'); plan.className='nxPlan'; b.appendChild(plan); p.__plan=plan; }
    var ship=$('.agP__ship',p), row=document.createElement('div'); row.className='nxTrust';
    if(ship){ ship.textContent.split(';').forEach(function(x){ x=x.trim(); if(!x) return; var q=x.split('|'), d=document.createElement('div'); d.innerHTML='<b></b><span></span>'; d.firstChild.textContent=q[0]||''; d.lastChild.textContent=q[1]||''; row.appendChild(d); }); }
    var co=$('.agP__callout',p), box=null;
    if(co && co.textContent.trim()){ box=document.createElement('div'); box.className='nxInfo'; box.innerHTML=co.innerHTML; $$('.agP__calloutIc,svg',box).forEach(function(e){e.remove()}); }
    setTimeout(function(){
      var del=$('.nxDelMain',p), after=del||form; if(!after) return;
      if(del && !/FREE/.test(del.innerHTML)) del.innerHTML=del.innerHTML.replace('Delivery by','FREE Delivery');
      var last=after;
      var eta=$('.agP__etaWrap',p); if(eta){ last.parentNode.insertBefore(eta,last.nextSibling); last=eta; }
      if(row.children.length){ last.parentNode.insertBefore(row,last.nextSibling); last=row; }
      if(box){ last.parentNode.insertBefore(box,last.nextSibling); last=box; }
      var acc=$('.agAcc',p); if(acc && !$('.nxKB',p)){ var h=document.createElement('h3'); h.className='nxKB'; h.textContent='Key benefits'; acc.parentNode.insertBefore(h,acc); }
      upd();
    },150);
    upd();
  }
  function upd(){
    var p=$('[data-ag-product]'); if(!p||!p.__plan) return;
    var c=$('.agB__card.is-active',p)||$('.agB__card',p); if(!c) return;
    var t=$('.agB__txt strong',c), pr=$('[data-ag-bprice]',c), cm=$('[data-ag-bcompare]',c), bd=$('.agB__badge',c);
    var L=$$('.nxPerks li',c).map(function(e){return e.textContent.trim()});
    var title=L[0]||(t?t.textContent:''), sub=L[1]||'', save=L[2]||'', perks=L.slice(3), big=perks.length>0;
    var P=p.__plan; P.className='nxPlan'+(big?'':' nxPlan--sm');
    P.innerHTML='<div class="nxPlan__top"><div>'+(big&&bd?'<span class="nxPlan__pop"></span>':'')+'<p class="nxPlan__t"></p>'+(sub?'<p class="nxPlan__s"></p>':'')+(big&&save?'<p class="nxPlan__sv"></p>':'')+'</div><div class="nxPlan__pr">'+(big&&cm&&!cm.hidden?'<s></s>':'')+'<b></b></div></div>';
    var set=function(s,v){ var e=$(s,P); if(e) e.textContent=v; };
    set('.nxPlan__pop',bd?bd.textContent:''); set('.nxPlan__t',title); set('.nxPlan__s',sub); set('.nxPlan__sv',save); set('.nxPlan__pr s',cm?cm.textContent:''); set('.nxPlan__pr b',pr?pr.textContent:'');
    if(big){ var ul=document.createElement('ul'); perks.forEach(function(x){ var li=document.createElement('li'); li.textContent=x; ul.appendChild(li); }); P.appendChild(ul); }
  }
  function bar(){
    var st=$('[data-ag-sticky]'); if(!st) return;
    var sv=$('.nxSave',st), d=$('.nxDel',st); if(!sv) return;
    var m=(sv.textContent.match(/(\d+)% off/)||[])[1]; if(m) sv.textContent='Save '+m+'% on this order';
    var d2=$('.nxDel2',st); if(!d2&&d){ d2=document.createElement('span'); d2.className='nxDel2'; sv.parentNode.appendChild(d2); }
    if(d2&&d) d2.textContent=d.textContent.replace('Delivery by','FREE Delivery');
  }
  function go(){ stickyHeader(); build(); bar(); setTimeout(bar,400);
    document.addEventListener('click',function(e){ setTimeout(bar,200); if(e.target.closest('.agB__card')) setTimeout(upd,120); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(go,50); }); else setTimeout(go,50);
})();
