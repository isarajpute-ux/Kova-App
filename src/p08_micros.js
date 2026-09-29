/* =====================================================================
   KovaMicros - vitamins and minerals in the food log (p09).

   Ten nutrients that matter most for training and recovery, counted from
   what you actually logged today, against the US Dietary Reference Intakes
   (NIH Office of Dietary Supplements, adults 19-50). Sodium is a ceiling,
   not a target. Where some foods were logged without micronutrient data
   (quick-add calories), the card says how many, rather than pretending.

   Search adds USDA FoodData Central (any food, full nutrient profile)
   through the Kova server, per 100 g, with a grams box.
   ===================================================================== */
window.KovaMicros=(function(){
  'use strict';
  var N=[ // key, label, unit, women, men, limit?
    ['fib','Fiber','g',25,38],['na','Sodium','mg',2300,2300,1],['k','Potassium','mg',2600,3400],['ca','Calcium','mg',1000,1000],
    ['fe','Iron','mg',18,8],['mg','Magnesium','mg',310,400],['c','Vitamin C','mg',75,90],['d','Vitamin D','µg',15,15],
    ['b12','Vitamin B12','µg',2.4,2.4],['fol','Folate','µg',400,400]];
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function sex(){ var s=lsJ('kova.micro.sex',''); if(s) return s; try{ if(window.KovaCycle&&KovaCycle._data().on) return 'f'; }catch(e){} return 'a'; }
  function target(n){ var s=sex(); return s==='f'?n[3]:(s==='m'?n[4]:Math.max(n[3],n[4])); }
  function todayLog(){
    var l=(window.KP&&KP.get('foodlog'))||[], d=new Date().toDateString();
    return l.filter(function(e){ return e&&e.at&&new Date(e.at).toDateString()===d&&e.src!=='seed'; });
  }
  function totals(){
    var l=todayLog(), t={}, withM=0;
    l.forEach(function(e){ if(!e.m) return; withM++; Object.keys(e.m).forEach(function(k){ t[k]=(t[k]||0)+(+e.m[k]||0); }); });
    return {t:t,withM:withM,all:l.length};
  }
  function fmt(v,u){ return (v>=100?Math.round(v).toLocaleString('en-US'):Math.round(v*10)/10)+(u==='g'?'g':' '+u); }
  function paint(){
    var mg=document.getElementById('microGrid'); if(!mg) return;
    var live=!!(window.KovaMode&&KovaMode.live), T=totals();
    if(!live&&!T.all){ return; }              /* the preview keeps its sample card */
    mg.style.display=''; var p1=mg.previousElementSibling; if(p1){ p1.style.display=''; if(p1.previousElementSibling) p1.previousElementSibling.style.display=''; }
    mg.classList.add('kmi-grid'); mg.style.gridTemplateColumns='';
    var s=sex(), open=!!lsJ('kova.micro.open',false);
    /* repaint only when something changed, so a tap is never lost to a rebuild */
    var sig=JSON.stringify([T,s,open]); if(mg.__sig===sig&&mg.querySelector('.kmi-dd')) return; mg.__sig=sig;
    var rows=N.map(function(n){
      var v=T.t[n[0]]||0, tg=target(n), pct=Math.round(v/tg*100), lim=!!n[5];
      var st=lim?(pct>100?'over':'ok'):(pct>=100?'met':(pct<50?'low':'mid'));
      return {n:n,v:v,tg:tg,pct:pct,lim:lim,st:st};
    });
    var met=rows.filter(function(r){ return r.st==='met'; }).length, low=rows.filter(function(r){ return r.st==='low'; }).length, over=rows.filter(function(r){ return r.st==='over'; }).length;
    var lowest=rows.filter(function(r){ return r.st==='low'; }).sort(function(a,b){ return a.pct-b.pct; }).slice(0,3).map(function(r){ return r.n[1]; });
    /* one bar you can open, instead of ten tiles down the page */
    mg.innerHTML='<button class="kmi-dd" data-kmi="tog" aria-expanded="'+open+'" aria-controls="kmiMenu">'
        +'<span class="kmi-ddl"><b>Vitamins &amp; minerals</b><small>'+(T.all?(met+' met · '+low+' low'+(over?' · sodium over':'')+(lowest.length?' · lowest: '+lowest.join(', '):'')):'Log a meal to see today')+'</small></span>'
        +'<span class="kmi-dots" aria-hidden="true">'+rows.map(function(r){ return '<i class="s-'+r.st+'"></i>'; }).join('')+'</span>'
        +'<span class="kmi-chev" aria-hidden="true">▾</span></button>'
      +'<div class="kmi-menu" id="kmiMenu"'+(open?'':' hidden')+'>'
        +'<div class="kmi-top"><span>'+(T.all?T.withM+' of '+T.all+' foods have vitamin and mineral data':'Log a meal to see it')+'</span>'
        +'<span class="kmi-sx">'+[['f','Women'],['m','Men'],['a','Adults']].map(function(x){ return '<button class="'+(s===x[0]?'on':'')+'" data-sx="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'</span></div>'
        +rows.map(function(r){
          return '<div class="kmi-r s-'+r.st+'"><span class="kmi-n">'+r.n[1]+'</span><span class="kmi-b"><i style="width:'+Math.min(100,r.pct)+'%"></i></span>'
            +'<span class="kmi-v">'+fmt(r.v,r.n[2])+'<small> '+(r.lim?'limit ':'of ')+fmt(r.tg,r.n[2])+'</small></span></div>';
        }).join('')
        +'<div class="kmi-src">Targets: US Dietary Reference Intakes, adults 19–50 (NIH). Sodium is a limit.</div>'
      +'</div>';
  }
  document.addEventListener('click',function(e){
    var t=e.target.closest&&e.target.closest('[data-kmi="tog"]'); if(!t) return;
    var open=!lsJ('kova.micro.open',false);
    try{ localStorage.setItem('kova.micro.open',JSON.stringify(open)); }catch(x){}
    var m=document.getElementById('kmiMenu'); if(m) m.hidden=!open; t.setAttribute('aria-expanded',String(open));
    var mg=document.getElementById('microGrid'); if(mg) mg.__sig=null;
  });
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-sx]'); if(!b) return;
    try{ localStorage.setItem('kova.micro.sex',JSON.stringify(b.getAttribute('data-sx'))); }catch(x){}
    paint();
  });

  /* ---------------- USDA search, through the Kova server ---------------- */
  var qT=null, lastQ='';
  function searchUSDA(q){
    clearTimeout(qT);
    var res=document.getElementById('foodResults'); if(!res) return;
    var box=document.getElementById('usdaResults');
    if(!box){ box=document.createElement('div'); box.id='usdaResults'; res.parentNode.insertBefore(box,res.nextSibling); }
    if(!q||q.length<3){ box.innerHTML=''; return; }
    qT=setTimeout(function(){
      if(!window.KovaLink||!KovaLink.authFetch){ box.innerHTML=''; return; }
      lastQ=q; box.innerHTML='<div class="kmi-note">Searching USDA FoodData Central…</div>';
      KovaLink.authFetch('/foods/search',{json:{q:q}}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error||'HTTP '+r.status); return j; }); })
        .then(function(j){
          if(lastQ!==q) return;
          var F=j.foods||[];
          if(!F.length){ box.innerHTML='<div class="kmi-note">USDA has nothing called that.</div>'; return; }
          box.innerHTML='<div class="kmi-note">USDA FoodData Central · per 100 g</div>'+F.map(function(f,i){
            return '<div class="kmi-f" data-i="'+i+'"><div><b>'+esc(f.n)+'</b><span>'+Math.round(f.kcal)+' kcal · '+Math.round(f.p)+'p '+Math.round(f.c)+'c '+Math.round(f.f)+'f per 100 g</span></div>'
              +'<input type="number" min="1" value="100" aria-label="Grams" class="kmi-g"><span class="kmi-u">g</span><button class="kmi-add">Add</button></div>';
          }).join('');
          box.querySelectorAll('.kmi-add').forEach(function(btn){
            btn.onclick=function(){
              var row=btn.closest('.kmi-f'), f=F[+row.getAttribute('data-i')], g=Math.max(1,+row.querySelector('.kmi-g').value||100), s=g/100;
              var m={}; Object.keys(f.m||{}).forEach(function(k){ m[k]=Math.round(f.m[k]*s*10)/10; });
              if(window.KovaFuel) KovaFuel.add({src:'usda',kcal:Math.round(f.kcal*s),p:Math.round(f.p*s),c:Math.round(f.c*s),f:Math.round(f.f*s),m:m,items:[{n:f.n+' ('+g+' g)'}]});
              try{ if(window.closeSheet) closeSheet(); }catch(x){}
              try{ if(window.toast) toast(f.n+' logged with its vitamins and minerals.'); }catch(x){}
              paint();
            };
          });
        }).catch(function(){ if(lastQ===q) box.innerHTML='<div class="kmi-note">USDA search needs the Kova server. The foods above work offline.</div>'; });
    },420);
  }
  function start(){ paint(); setInterval(function(){ if(document.getElementById('s-fuel')&&document.getElementById('s-fuel').classList.contains('on')) paint(); },4000); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,700); }); else setTimeout(start,700);
  return {paint:paint,totals:totals,searchUSDA:searchUSDA,N:N};
})();
