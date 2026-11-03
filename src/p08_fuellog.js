/* =====================================================================
   KovaFoodLog - Fuel with no watch, end to end (p51).

   The owner: "I'm going to start using the fuel metric on my account...
   make everything work, fuel doesn't have to be connected to the watch".
   Measured first, as a new account in live mode with no watch:
     - Log food's Recent / Favorites / Custom chips did nothing, and a food
       outside the 8-food list could not be logged at all;
     - on iPhone the barcode button said "try Chrome on Android" (Safari
       has no BarcodeDetector), and Fuel's own barcode sheet was never
       reachable (its search rows said "Logged" and wrote nothing);
     - Water and the logging streak were sample numbers, so live mode hid
       them;
     - food search said "needs the Kova server" for every failure.
   Now:
     Log food  Quick add (name, meal, calories and macros; Save to My
               foods), Barcode, and the chips: Recent (your own foods,
               newest first), Favorites (the star), My foods. Typing finds
               your own foods first.
     Barcode   KovaBarcode.open(cb): a live camera that reads EAN and UPC
               codes (the browser's own reader, else the zxing reader,
               about 1 MB, loaded from jsdelivr the first time) and a box
               to type the numbers. The Scanner screen and Fuel's header
               icon use it; the product opens on the Scanner screen.
     Search    off(q): Open Food Facts text search (no key) when USDA is
               out of reach, per 100 g like USDA (src/p08_micros.js).
     Water     glasses a day (KP water, ml by day). The target is the US
               National Academies' drinks intake for your age and sex
               (14-18: 2.6 L boys, 1.8 L girls; 19+: 3.0 L men, 2.2 L
               women).
     Streak    days in a row with food logged, and your best run.
   ===================================================================== */
window.KovaFoodLog=(function(){
  'use strict';
  var DAY=864e5, SLOTS=['Breakfast','Lunch','Snack','Dinner'];
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function kp(k,d){ try{ var v=window.KP?KP.get(k):null; return v==null?d:v; }catch(e){ return d; } }
  function kset(k,v){ try{ if(window.KP) KP.set(k,v); }catch(e){} }
  function F(){ return window.KovaFuel||null; }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function live(){ return !!(window.KovaMode&&KovaMode.live); }
  function r1(x){ return Math.round((+x||0)*10)/10; }
  function nameOf(e){ return ((e.items||[]).map(function(i){ return i.n; }).filter(Boolean).join(', ')||e.n||'').trim(); }
  function line(x){ return Math.round(x.kcal||0)+' kcal · '+Math.round(x.p||0)+'p '+Math.round(x.c||0)+'c '+Math.round(x.f||0)+'f'; }
  function key(n){ return String(n||'').toLowerCase().replace(/\s+/g,' ').trim(); }

  /* ---------------- your foods: recent, favorites, my foods ---------------- */
  function snap(x){ return {n:x.n,kcal:Math.round(x.kcal||0),p:r1(x.p),c:r1(x.c),f:r1(x.f),m:x.m||null}; }
  function recent(){
    var seen={}, out=[];
    (F()?F().all().slice().reverse():[]).forEach(function(e){
      if(out.length>=20||!e||e.src==='seed') return;
      var n=nameOf(e), k=key(n); if(!n||seen[k]) return; seen[k]=1;
      out.push(snap({n:n,kcal:e.kcal,p:e.p,c:e.c,f:e.f,m:e.m}));
    });
    return out;
  }
  function favs(){ var o=kp('foodfav',{}); return Object.keys(o).map(function(k){ return o[k]; }); }
  function isFav(n){ return !!kp('foodfav',{})[key(n)]; }
  function star(x){
    var o=Object.assign({},kp('foodfav',{})), k=key(x.n);
    if(o[k]) delete o[k]; else o[k]=snap(x);
    kset('foodfav',o); return !!o[k];
  }
  function mine(){ return kp('myfoods',[]); }
  function saveMine(x){
    var l=mine().filter(function(y){ return key(y.n)!==key(x.n); });
    l.unshift(snap(x)); kset('myfoods',l.slice(0,200));
  }
  function log(x,src,meal){
    if(!F()) return null;
    var e={src:src||'mine',kcal:Math.round(x.kcal||0),p:r1(x.p),c:r1(x.c),f:r1(x.f),m:x.m||null,items:[{n:x.n}]};
    if(meal) e.meal=meal;
    F().add(e);
    return e;
  }

  /* ---------------- the Log food sheet ---------------- */
  var LIST=[], MODE='all';
  function rows(list,head){
    LIST=list;
    if(!list.length) return '';
    return (head?'<div class="lbl kfl-h">'+esc(head)+'</div>':'')+list.map(function(x,i){
      var on=isFav(x.n);
      return '<div class="list-item kfl-row" data-i="'+i+'"><div class="kfl-txt"><div class="li-name">'+esc(x.n)+'</div><div class="li-sub">'+line(x)+'</div></div>'
        +'<button class="kfl-star'+(on?' on':'')+'" data-star="'+i+'" aria-label="Favorite '+esc(x.n)+'" aria-pressed="'+on+'">'+(on?'★':'☆')+'</button>'
        +'<button class="kfl-add" data-add="'+i+'" aria-label="Log '+esc(x.n)+'">+</button></div>';
    }).join('');
  }
  function empty(t){ return '<div class="kfl-none">'+t+'</div>'; }
  function paintMine(){
    var box=document.getElementById('kflMine'), res=document.getElementById('foodResults'); if(!box) return;
    var inp=document.getElementById('foodSearch'), q=key(inp&&inp.value);
    var core=MODE==='all';
    if(q){
      var seen={}, hits=[];
      favs().concat(mine(),recent()).forEach(function(x){ var k=key(x.n); if(seen[k]||k.indexOf(q)<0) return; seen[k]=1; hits.push(x); });
      box.innerHTML=rows(hits.slice(0,8),'Yours'); core=true;
    } else if(MODE==='all'){ box.innerHTML=rows(recent().slice(0,3),'Recent'); }
    else if(MODE==='recent'){ box.innerHTML=rows(recent())||empty('Foods you log show up here.'); }
    else if(MODE==='fav'){ box.innerHTML=rows(favs())||empty('Tap the star on a food to keep it here.'); }
    else { box.innerHTML='<button class="btn kfl-new" data-kfl="new">New food</button>'+(rows(mine())||empty('Foods you make with Quick add live here.')); }
    if(res) res.hidden=!core;
    var u=document.getElementById('usdaResults'); if(u) u.hidden=!core;
  }
  function enhance(){
    var si=document.getElementById('sheetIn'), s=document.getElementById('foodSearch');
    if(!si||!s||!document.getElementById('foodResults')||si.querySelector('.kfl-acts')) return;
    MODE='all';
    s.insertAdjacentHTML('beforebegin','<div class="kfl-acts"><button class="btn" data-kfl="quick">Quick add</button><button class="btn kfl-ghost" data-kfl="bar">Barcode</button></div>');
    document.getElementById('foodResults').insertAdjacentHTML('beforebegin','<div id="kflMine"></div>');
    paintMine();
  }
  function onSheetClick(ev){
    var t=ev.target; if(!t.closest||!t.closest('#sheetIn')) return;
    var ch=t.closest('.chip[data-t]');
    if(ch&&document.getElementById('kflMine')){
      ch.parentNode.querySelectorAll('.chip').forEach(function(c){ c.classList.toggle('on',c===ch); });
      MODE=ch.getAttribute('data-t'); var s=document.getElementById('foodSearch'); if(s&&MODE!=='all') s.value='';
      paintMine(); return;
    }
    var a=t.closest('[data-kfl]');
    if(a){ var k=a.getAttribute('data-kfl'); if(k==='quick'||k==='new') quickAdd({save:k==='new'}); else if(k==='bar') scanToFuel(); return; }
    var st=t.closest('[data-star]');
    if(st){ var x=LIST[+st.getAttribute('data-star')]; if(!x) return; var on=star(x); st.classList.toggle('on',on); st.textContent=on?'★':'☆'; st.setAttribute('aria-pressed',String(on)); if(MODE==='fav') paintMine(); return; }
    var r=t.closest('.kfl-row');
    if(r){ var y=LIST[+r.getAttribute('data-i')]; if(!y) return; log(y,'mine'); try{ closeSheet(); }catch(e){} say(y.n+' logged · '+Math.round(y.kcal)+' kcal'); }
  }

  /* ---------------- Quick add: any food, by hand ---------------- */
  function slotNow(){ return F()?F().slotOf({at:Date.now()}):'Snack'; }
  function quickAdd(o){
    o=o||{};
    var sl=slotNow();
    openSheet('<div class="kfl-q"><div class="title-s" style="font-size:18px;margin-bottom:12px">Quick add</div>'
      +'<label class="kfl-f">Food<input class="field" id="kflN" maxlength="60" placeholder="e.g. Turkey sandwich" autocomplete="off"></label>'
      +'<div class="kfl-meal" role="group" aria-label="Meal">'+SLOTS.map(function(s){ return '<button class="chip'+(s===sl?' on':'')+'" data-meal="'+s+'">'+s+'</button>'; }).join('')+'</div>'
      +'<div class="kfl-nums">'
      +[['K','Calories','numeric'],['P','Protein g','decimal'],['C','Carbs g','decimal'],['F','Fat g','decimal']].map(function(f){
        return '<label class="kfl-f">'+f[1]+'<input class="field" id="kfl'+f[0]+'" type="number" min="0" inputmode="'+f[2]+'" placeholder="0"></label>'; }).join('')
      +'</div>'
      +'<div class="sub kfl-hint">No calories? Kova adds them up from the macros.</div>'
      +'<label class="kfl-chk"><input type="checkbox" id="kflSave"'+(o.save?' checked':'')+'> Save to My foods</label>'
      +'<button class="btn" id="kflGo">Log it</button><div class="kfl-msg" id="kflMsg" role="status"></div></div>');
    var si=document.getElementById('sheetIn');
    si.querySelectorAll('[data-meal]').forEach(function(b){ b.onclick=function(){ si.querySelectorAll('[data-meal]').forEach(function(c){ c.classList.toggle('on',c===b); }); }; });
    document.getElementById('kflGo').onclick=function(){
      var v=function(id){ var s=document.getElementById(id).value; return s===''?null:+s; };
      var n=(document.getElementById('kflN').value||'').trim(), k=v('kflK'), p=v('kflP'), c=v('kflC'), f=v('kflF'), msg=document.getElementById('kflMsg');
      var bad=[k,p,c,f].some(function(x){ return x!=null&&(!isFinite(x)||x<0); });
      if(bad){ msg.textContent='Numbers only, 0 or more.'; return; }
      if(k==null) k=Math.round(4*(p||0)+4*(c||0)+9*(f||0));
      if(!(k>0)){ msg.textContent='Add calories or macros.'; return; }
      if(k>5000||(p||0)>500||(c||0)>800||(f||0)>400){ msg.textContent='That looks too big for one food. Check the numbers.'; return; }
      var m=si.querySelector('[data-meal].on'), x={n:n||'Quick add',kcal:k,p:p||0,c:c||0,f:f||0};
      if(document.getElementById('kflSave').checked) saveMine(x);
      log(x,'manual',m?m.getAttribute('data-meal'):sl);
      try{ closeSheet(); }catch(e){}
      say(x.n+' logged · '+Math.round(k)+' kcal');
    };
    setTimeout(function(){ var n=document.getElementById('kflN'); if(n) try{ n.focus({preventScroll:true}); }catch(e){} },60);
  }

  /* ---------------- Open Food Facts text search (no key) ---------------- */
  var OFF='https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=12&fields=code,product_name,brands,nutriments&search_terms=';
  function off(q){
    return fetch(OFF+encodeURIComponent(q)).then(function(r){ if(!r.ok) throw new Error('Open Food Facts '+r.status); return r.json(); }).then(function(j){
      var out=[];
      (j.products||[]).forEach(function(x){
        var N=x.nutriments||{}, num=function(k){ var v=parseFloat(N[k]); return isFinite(v)?v:null; };
        var kc=num('energy-kcal_100g'); if(kc==null&&num('energy-kj_100g')!=null) kc=num('energy-kj_100g')/4.184;
        var n=String(x.product_name||'').trim(); if(!n||kc==null) return;
        var b=String(x.brands||'').split(',')[0].trim(), m={};
        [['fib','fiber_100g',1],['na','sodium_100g',1000],['k','potassium_100g',1000],['ca','calcium_100g',1000],['fe','iron_100g',1000],['c','vitamin-c_100g',1000]].forEach(function(a){ var v=num(a[1]); if(v!=null) m[a[0]]=r1(v*a[2]); });
        out.push({n:(b&&n.toLowerCase().indexOf(b.toLowerCase())<0?b+' ':'')+n,kcal:r1(kc),p:r1(num('proteins_100g')),c:r1(num('carbohydrates_100g')),f:r1(num('fat_100g')),m:m});
      });
      return out.slice(0,8);
    });
  }

  /* ---------------- barcodes on any phone ---------------- */
  var SRC='https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/dist/iife/ponyfill.js', FMT=['ean_13','ean_8','upc_a','upc_e'], DET=null, LOADING=null;
  function load(src){
    if(LOADING) return LOADING;
    LOADING=new Promise(function(ok,no){ var s=document.createElement('script'); s.src=src; s.async=true; s.onload=ok; s.onerror=function(){ LOADING=null; no(new Error('load')); }; document.head.appendChild(s); });
    return LOADING;
  }
  function detector(){
    if(DET) return Promise.resolve(DET);
    function poly(){ return load(SRC).then(function(){ DET=new window.BarcodeDetectionAPI.BarcodeDetector({formats:FMT}); return DET; }); }
    var N=window.BarcodeDetector;
    if(N&&N.getSupportedFormats) return N.getSupportedFormats().then(function(f){ if(f&&f.indexOf('ean_13')>=0){ DET=new N({formats:FMT}); return DET; } return poly(); },poly);
    return poly();
  }
  function stopAll(S){ S.on=false; clearTimeout(S.t); if(S.st) S.st.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); S.st=null; }
  function open(cb){
    openSheet('<div class="kbc"><div class="title-s" style="font-size:18px;margin-bottom:12px">Scan a barcode</div>'
      +'<div class="kbc-view"><video id="kbcV" playsinline muted autoplay></video><div class="kbc-box"></div></div>'
      +'<div class="sub kbc-say" id="kbcSay" role="status">Starting the camera…</div>'
      +'<div class="kbc-type"><input class="field" id="kbcCode" inputmode="numeric" maxlength="14" placeholder="Or type the numbers" aria-label="Barcode numbers" autocomplete="off"><button class="btn" id="kbcGo">Look up</button></div></div>');
    var S={on:true}, v=document.getElementById('kbcV'), sayEl=document.getElementById('kbcSay');
    function done(code){ if(!S.on) return; stopAll(S); try{ closeSheet(); }catch(e){} cb(String(code)); }
    function typed(){
      var c=(document.getElementById('kbcCode').value||'').replace(/\D/g,'');
      if(!/^\d{8}$|^\d{12,14}$/.test(c)){ sayEl.textContent='8, 12 or 13 numbers, from under the bars.'; return; }
      done(c);
    }
    document.getElementById('kbcGo').onclick=typed;
    document.getElementById('kbcCode').onkeydown=function(e){ if(e.key==='Enter') typed(); };
    function gone(){ return !document.body.contains(v)||!document.getElementById('sheet').classList.contains('on'); }
    function noCam(t){ sayEl.textContent=t; var view=v.parentNode; if(view) view.hidden=true; }
    var md=navigator.mediaDevices;
    if(!md||!md.getUserMedia){ noCam('No camera here. Type the numbers under the barcode.'); return S; }
    md.getUserMedia({video:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}},audio:false}).then(function(st){
      if(gone()){ st.getTracks().forEach(function(t){ t.stop(); }); return; }
      S.st=st; v.srcObject=st; var pl=v.play(); if(pl&&pl.catch) pl.catch(function(){});
      sayEl.textContent='Getting the reader ready…';
      return detector().then(function(d){
        sayEl.textContent='Hold the barcode inside the box.';
        (function tick(){
          if(!S.on) return; if(gone()){ stopAll(S); return; }
          if(v.readyState<2){ S.t=setTimeout(tick,200); return; }
          d.detect(v).then(function(c){ if(c&&c.length&&c[0].rawValue) done(c[0].rawValue); else S.t=setTimeout(tick,250); },function(){ S.t=setTimeout(tick,400); });
        })();
      },function(){ sayEl.textContent='The reader would not load. Check your connection, or type the numbers.'; });
    },function(){ noCam('Camera blocked. Allow it in your browser, or type the numbers.'); });
    return S;
  }
  /* a product opens on the Scanner screen: health check, then Log to Fuel */
  function toScanner(code){ try{ go('scanner'); }catch(e){} if(window.KovaScanner&&KovaScanner.lookup) KovaScanner.lookup(code); }
  function scanToFuel(){ open(toScanner); }

  /* ---------------- water and the logging streak (live mode) ---------------- */
  function metric(){
    var u=''; try{ u=String(localStorage.getItem('kova.units')||'').replace(/"/g,''); }catch(e){}
    if(u) return u==='metric';
    return (kp('maint',{})||{}).unit==='kg';
  }
  function glass(){ return metric()?250:237; }   /* a glass, or an 8 oz cup */
  function waterGoal(){
    var m=kp('maint',{})||{}, sex=m.sex, age=+m.age||0;
    if(!sex){ try{ var s=JSON.parse(localStorage.getItem('kova.sex')||'null'); if(s) sex=/^f/.test(s)?'f':'m'; }catch(e){} }
    var teen=age>0&&age<19;
    if(sex==='f') return {ml:teen?1800:2200,known:true};
    if(sex==='m') return {ml:teen?2600:3000,known:true};
    return {ml:2200,known:false};
  }
  function dk(t){ return F()?F().dayKey(t):new Date(t||Date.now()).toISOString().slice(0,10); }
  function water(k){ return +(kp('water',{})[k||dk()])||0; }
  function setWater(ml,k){ var o=Object.assign({},kp('water',{})); k=k||dk(); o[k]=Math.max(0,Math.min(8000,Math.round(ml))); kset('water',o); paintCards(); }
  function addGlass(n){ setWater(water()+n*glass()); }
  function streak(){
    var days={}; (F()?F().all():[]).forEach(function(e){ if(e&&e.src!=='seed') days[dk(e.at)]=1; });
    var keys=Object.keys(days).sort(), best=0, run=0, prev=null;
    keys.forEach(function(k){ var t=new Date(k+'T12:00:00').getTime(); run=(prev!=null&&Math.round((t-prev)/DAY)===1)?run+1:1; prev=t; if(run>best) best=run; });
    var cur=0, t=Date.now(), today=!!days[dk(t)];
    if(!today) t-=DAY;
    while(days[dk(t)]){ cur++; t-=DAY; }
    return {cur:cur,best:best,today:today};
  }
  function fmtW(ml){ return metric()?(Math.round(ml/100)/10)+' L':Math.round(ml/29.57)+' oz'; }
  function waterHTML(){
    var G=waterGoal(), g=glass(), have=water(), n=Math.max(1,Math.round(G.ml/g)), got=Math.round(have/g), w=metric()?'glass':'cup';
    var dots=''; for(var i=0;i<Math.max(n,got);i++) dots+='<button class="kfl-drop'+(i<got?' on':'')+'" data-drop="'+i+'" aria-label="'+(i+1)+' '+w+(i?'s':'')+'"></button>';
    return '<div class="lbl">WATER</div><div class="kfl-big">'+fmtW(have)+' <span class="unit">of '+fmtW(G.ml)+'</span></div>'
      +'<div class="kfl-drops">'+dots+'</div>'
      +'<div class="kfl-wrow"><button class="kfl-wb" data-w="-1" aria-label="Remove a '+w+'">−</button><span>'+got+' of '+n+' '+w+(n>1?'s':'')+'</span><button class="kfl-wb" data-w="1" aria-label="Add a '+w+'">+</button></div>'
      +(G.known?'':'<div class="sub kfl-note">Add your sex in Profile for your own target.</div>');
  }
  function streakHTML(){
    var s=streak();
    return '<div class="lbl">STREAK</div><div class="kfl-big">'+s.cur+' <span class="unit">day'+(s.cur===1?'':'s')+' logged</span></div>'
      +'<div class="sub kfl-note">'+(!s.cur?'Log a meal to start one.':(!s.today?'Log today to keep it.':(s.best>s.cur?'Best: '+s.best+' days':'Your best run')))+'</div>';
  }
  function paintCards(){
    if(!live()) return;
    var scr=document.getElementById('s-fuel'); if(!scr) return;
    var g=document.getElementById('kflCards');
    if(!g){
      var wd=document.getElementById('waterDots'), old=wd&&wd.closest('.grid2');
      g=document.createElement('div'); g.id='kflCards'; g.className='grid2 kfl-cards';
      g.innerHTML='<div class="card kfl-water"></div><div class="card kfl-streak"></div>';
      if(old){ old.parentNode.insertBefore(g,old); old.remove(); }
      else { var lg=document.getElementById('mealLog'), c=lg&&lg.closest('.card'); if(c) c.insertAdjacentElement('afterend',g); else scr.appendChild(g); }
      g.addEventListener('click',function(ev){
        var d=ev.target.closest('[data-drop]'), b=ev.target.closest('[data-w]');
        if(d){ var i=+d.getAttribute('data-drop'), got=Math.round(water()/glass()); setWater((i+1===got?i:i+1)*glass()); }
        else if(b) addGlass(+b.getAttribute('data-w'));
      });
    }
    g.querySelector('.kfl-water').innerHTML=waterHTML();
    g.querySelector('.kfl-streak').innerHTML=streakHTML();
  }

  /* ---------------- wiring ---------------- */
  function start(){
    var si=document.getElementById('sheetIn');
    if(si&&window.MutationObserver) new MutationObserver(enhance).observe(si,{childList:true});
    enhance();
    document.addEventListener('click',onSheetClick);
    document.addEventListener('input',function(e){ if(e.target&&e.target.id==='foodSearch'&&document.getElementById('kflMine')){
      if(MODE!=='all'){ MODE='all'; var cs=document.querySelectorAll('#sheetIn .chip[data-t]'); cs.forEach(function(c){ c.classList.toggle('on',c.getAttribute('data-t')==='all'); }); }
      paintMine(); } });
    /* Fuel's header icon says "Scan a barcode": now it does */
    document.addEventListener('click',function(ev){
      var b=ev.target.closest&&ev.target.closest('#fuelScanIcon'); if(!b) return;
      ev.preventDefault(); ev.stopPropagation(); scanToFuel();
    },true);
    var scr=document.getElementById('s-fuel');
    if(scr&&window.MutationObserver) new MutationObserver(function(){ if(scr.classList.contains('on')) paintCards(); }).observe(scr,{attributes:true,attributeFilter:['class']});
    if(F()) F().on(paintCards);
    if(scr&&scr.classList.contains('on')) paintCards();
  }
  window.KovaBarcode={open:open,detector:detector};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();

  return {recent:recent,favs:favs,star:star,mine:mine,saveMine:saveMine,quickAdd:quickAdd,off:off,
    water:water,setWater:setWater,addGlass:addGlass,waterGoal:waterGoal,streak:streak,paintCards:paintCards,glass:glass};
})();
