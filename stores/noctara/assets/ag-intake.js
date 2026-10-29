/* Noctara: Intake-style product page (plan panel, tiles above button, trust row, smart sticky info) */
(function(){
  function $(s,r){return (r||document).querySelector(s)}
  function build(){
    var p=$('[data-ag-product]'); if(!p||p.__nxI) return; p.__nxI=1;
    var info=$('.agP__info',p), form=$('.agP__form',p), b=$('.agB',p);
    var pill=$('.agP__pill',p), title=$('.agP__title',p); if(pill&&title) title.parentNode.insertBefore(pill,title);
    var feats=$('.agP__feats',p); if(feats&&form) form.parentNode.insertBefore(feats,form);
    if(b){ var plan=document.createElement('div'); plan.className='nxPlan'; b.appendChild(plan); p.__plan=plan; }
    var ship=$('.agP__ship',p), row=document.createElement('div'); row.className='nxTrust';
    if(ship){ ship.textContent.split(';').forEach(function(x){ x=x.trim(); if(!x) return; var q=x.split('|'), d=document.createElement('div'); d.innerHTML='<b></b><span></span>'; d.firstChild.textContent=q[0]||''; d.lastChild.textContent=q[1]||''; row.appendChild(d); }); }
    var co=$('.agP__callout .agP__calloutTxt',p)||$('.agP__callout > div',p)||$('.agP__callout',p), box=null;
    if(co && co.textContent.trim()){ box=document.createElement('div'); box.className='nxInfo'; box.innerHTML=co.innerHTML; box.querySelectorAll('.agP__calloutIc,svg').forEach(function(e){e.remove()}); }
    setTimeout(function(){
      var del=$('.nxDelMain',p), after=del||form; if(!after) return;
      if(row.children.length) after.parentNode.insertBefore(row,after.nextSibling);
      if(box) (row.parentNode?row:after).parentNode.insertBefore(box,(row.parentNode?row:after).nextSibling);
      var acc=$('.agAcc',p); if(acc && !$('.nxKB',p)){ var h=document.createElement('h3'); h.className='nxKB'; h.textContent=p.dataset.kbTitle||'Key benefits'; acc.parentNode.insertBefore(h,acc); }
      if(del && !/FREE/.test(del.innerHTML)) del.innerHTML=del.innerHTML.replace('Delivery by','FREE Delivery');
    },150);
    if(b){ var lab=document.createElement('p'); }
    upd(); stick();
  }
  function upd(){
    var p=$('[data-ag-product]'); if(!p||!p.__plan) return;
    var c=$('.agB__card.is-active',p)||$('.agB__card',p); if(!c) return;
    var t=$('.agB__txt strong',c), sm=$('.agB__txt small',c), pr=$('[data-ag-bprice]',c), cm=$('[data-ag-bcompare]',c), bd=$('.agB__badge',c), perks=$('.nxPerks',c), sv=+c.dataset.save||0;
    var h='<div class="nxPlan__top"><div>'+(bd?'<span class="nxPlan__pop">'+bd.textContent+'</span>':'')+'<p class="nxPlan__t"></p><p class="nxPlan__s"></p>'+(sv?'<p class="nxPlan__sv">Save '+sv+'% on this kit</p>':'<p class="nxPlan__sv">Launch price — save 50%</p>')+'</div><div class="nxPlan__pr">'+(cm&&!cm.hidden?'<s>'+cm.textContent+'</s>':'')+'<b>'+(pr?pr.textContent:'')+'</b></div></div>';
    p.__plan.innerHTML=h; $('.nxPlan__t',p.__plan).textContent=t?t.textContent:''; $('.nxPlan__s',p.__plan).textContent=sm?sm.textContent:'';
    if(perks){ var ul=document.createElement('ul'); ul.innerHTML=perks.innerHTML; p.__plan.appendChild(ul); }
  }
  function stick(){
    var i=$('.agP__info'); if(!i) return;
    var f=function(){ var t=Math.min(20, window.innerHeight - i.offsetHeight - 20); i.style.setProperty('--nx-stick', t+'px'); };
    f(); window.addEventListener('resize',f); setTimeout(f,600); setTimeout(f,2000);
  }
  function bar(){
    var st=$('[data-ag-sticky]'), p=$('[data-ag-product]'); if(!st||!p) return;
    var sv=$('.nxSave',st), d=$('.nxDel',st); if(!sv) return;
    var m=(sv.textContent.match(/(\d+)% off/)||[])[1]; if(m) sv.textContent='Save '+m+'% on this order';
    var d2=$('.nxDel2',st); if(!d2&&d){ d2=document.createElement('span'); d2.className='nxDel2'; sv.parentNode.appendChild(d2); }
    if(d2&&d) d2.textContent=d.textContent.replace('Delivery by','FREE Delivery');
  }
  function go(){ build(); bar(); setTimeout(bar,400); document.addEventListener('click',function(){ setTimeout(bar,200); }); document.addEventListener('click',function(e){ if(e.target.closest('.agB__card,.agP__pillBtn')) setTimeout(upd,120); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(go,50); }); else setTimeout(go,50);
})();
