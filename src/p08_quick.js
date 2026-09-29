/* =====================================================================
   KovaQuick - log a meal in two taps, from anywhere (p11).

     tap 1  "Scan food" on Fuel (or the camera in Fuel's header) opens
            the meal camera straight away;
     shot   the plate is read (Kova's server, or your own model key);
     tap 2  "Log it" on the result card.

   The result card shows calories, protein, how sure the read is, and one
   line only Kova can write, because only Kova has your sleep, training
   and cycle next to your food: "You slept 5h 40m: aim for +20 g protein
   today", "Luteal phase: appetite runs higher; this still fits".
   Portion chips (1/2x ... 1 1/2x) fix the size in one tap, not a form.

   Recent meals and "Same as yesterday" log in ONE tap, from Fuel and
   from the camera sheet.

   Every log reports how many taps it took (quick_log {taps, src}), so
   "taps to log a meal" is a number Kova measures. Target: 2.
   ===================================================================== */
window.KovaQuick=(function(){
  'use strict';
  var T={taps:0,src:''}, R=null, scale=1, busy=false;
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function F(){ return window.KovaFuel||null; }
  function dayKey(t){ return F()?F().dayKey(t):new Date(t).toISOString().slice(0,10); }
  function hm(m){ m=Math.round(m); return Math.floor(m/60)+'h '+(m%60)+'m'; }
  function nameOf(e){ return (e.items||[]).map(function(i){ return i.n; }).filter(Boolean).join(', ')||'Meal'; }
  function track(src){ try{ if(window.KovaAnalytics) KovaAnalytics.track('quick_log',{taps:T.taps,src:src}); }catch(e){} }

  /* ---------------- what only Kova can say ---------------- */
  function sleptLast(){
    var W=(window.KOVA_WEEK||[]).filter(Boolean), last=W[W.length-1];
    if(last&&(last.deep||last.rem||last.light)) return last.deep+last.rem+last.light;
    var log=lsJ('kova_sleeplog_v1',{}), k=Object.keys(log).sort().pop();
    return k&&log[k]&&log[k].mins?log[k].mins:0;
  }
  function trainedToday(){
    var L=lsJ('kova_log_v1',[]), k=dayKey(Date.now());
    return (L||[]).some(function(s){ return s&&s.t&&dayKey(s.t)===k; });
  }
  function phase(){ try{ return window.KovaCycle&&KovaCycle.phase?KovaCycle.phase():''; }catch(e){ return ''; } }
  function targets(){ try{ return window.__fuelTargets?__fuelTargets():null; }catch(e){ return null; } }
  /* meal = {kcal, p}; returns one sentence, grounded in the person's own data */
  function line(meal){
    var tg=targets(), eaten=F()?F().totals():{kcal:0,p:0};
    var kAfter=eaten.kcal+(meal.kcal||0), pAfter=eaten.p+(meal.p||0);
    var slept=sleptLast(), ph=phase(), hr=new Date().getHours();
    if(slept&&slept<6.5*60){
      var need=tg?Math.max(0,Math.round(tg.p-pAfter)):0;
      return 'You slept '+hm(slept)+': aim for +20 g protein today'+(tg?'. This brings you to '+Math.round(pAfter)+' of '+tg.p+' g'+(need?', '+need+' g to go.':'. Covered.'):'.');
    }
    if(ph==='luteal'){
      var fits=!tg||kAfter<=tg.kcal+120;
      return 'Luteal phase: appetite runs higher'+(fits?', and this still fits your target.':'. This takes you '+Math.round(kAfter-tg.kcal)+' kcal over; a protein-first snack later beats fighting cravings.');
    }
    if(trainedToday()&&tg) return 'You trained today: this puts protein at '+Math.round(pAfter)+' of '+tg.p+' g. Recovery wants the rest by bedtime.';
    if(hr>=20&&(meal.kcal||0)>700) return 'A big meal this close to bed can cost deep sleep. Tomorrow, try moving '+Math.round((meal.kcal||0)-500)+' kcal of it earlier.';
    if(tg) return 'This puts you at '+Math.round(kAfter)+' of '+tg.kcal+' kcal and '+Math.round(pAfter)+' of '+tg.p+' g protein today.';
    return 'Logged meals feed your readiness, sleep and training advice.';
  }

  /* ---------------- reading the plate ---------------- */
  function shrink(dataUrl){
    return new Promise(function(done){
      var fin=false, ok=function(v){ if(!fin){ fin=true; done(v); } };
      setTimeout(function(){ ok(dataUrl); },2500);      /* a decode that never finishes cannot stall the read */
      try{
        var img=new Image();
        img.onload=function(){
          var m=1280, w=img.naturalWidth||img.width, h=img.naturalHeight||img.height, s=Math.min(1,m/Math.max(w,h));
          if(!w||!h){ ok(dataUrl); return; }
          var c=document.createElement('canvas'); c.width=Math.round(w*s); c.height=Math.round(h*s);
          var x=c.getContext('2d'); if(!x){ ok(dataUrl); return; }
          x.drawImage(img,0,0,c.width,c.height);
          try{ ok(c.toDataURL('image/jpeg',.82)); }catch(e){ ok(dataUrl); }
        };
        img.onerror=function(){ ok(dataUrl); };
        img.src=dataUrl;
      }catch(e){ ok(dataUrl); }
    });
  }
  function viaServer(dataUrl,note){
    if(!window.KovaLink) return Promise.reject(Object.assign(new Error('offline'),{soft:true}));
    return KovaLink.authFetch('/meal/read',{json:{image:dataUrl.slice(dataUrl.indexOf(',')+1),mime:'image/jpeg',note:note||''}}).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(r.ok) return j.items||[];
        var e=new Error(j.error||('HTTP '+r.status)); e.status=r.status; e.soft=r.status!==402; throw e;
      });
    },function(){ throw Object.assign(new Error('offline'),{soft:true}); });
  }
  /* your own key (Settings > AI model), when the server cannot */
  function viaOwnKey(dataUrl){
    var M=window.KovaModel;
    if(!M||!M.connected||!M.connected()) return Promise.reject(new Error('no-model'));
    var cfg=M.cfg(), P=M.providers[cfg.p], b64=dataUrl.slice(dataUrl.indexOf(',')+1);
    var content=cfg.p==='anthropic'?[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:b64}},{type:'text',text:'What food is on this plate?'}]
      :[{type:'text',text:'What food is on this plate?'},{type:'image_url',image_url:{url:dataUrl}}];
    var sys='You are a nutritional analysis engine. Respond with ONLY a JSON array of items: [{"ingredient":"","estimated_weight_grams":0,"confidence_percentage":0,"calories":0,"protein_grams":0,"carbs_grams":0,"fat_grams":0}]. Itemise cooking fat as its own row. One integer per field. [] if no food.';
    var req=P.build(cfg.key,cfg.model,sys,[{role:'user',content:content}],{temperature:0,max_tokens:1200});
    return fetch(P.url,{method:'POST',headers:req.headers,body:req.body}).then(function(r){ if(!r.ok) throw new Error('model '+r.status); return r.json(); })
      .then(function(d){ var raw=(P.read(d)||'').replace(/```json|```/g,'').trim(); var a=raw.indexOf('['); return JSON.parse(a>=0?raw.slice(a,raw.lastIndexOf(']')+1):'[]'); });
  }
  function read(dataUrl,note){
    return shrink(dataUrl).then(function(small){
      return viaServer(small,note).catch(function(e){
        if(!e.soft) throw e;
        return viaOwnKey(small).catch(function(){ throw e; });
      });
    });
  }
  function totalOf(items){
    var t={kcal:0,p:0,c:0,f:0,conf:100,m:null};
    items.forEach(function(i){
      t.kcal+=+i.calories||0; t.p+=+i.protein_grams||0; t.c+=+i.carbs_grams||0; t.f+=+i.fat_grams||0;
      t.conf=Math.min(t.conf,+i.confidence_percentage||0);
      var MK={fib:'fiber_grams',na:'sodium_mg',k:'potassium_mg',ca:'calcium_mg',fe:'iron_mg',mg:'magnesium_mg',c:'vitamin_c_mg',d:'vitamin_d_ug',b12:'vitamin_b12_ug',fol:'folate_ug'};
      Object.keys(MK).forEach(function(k){ if(i[MK[k]]!=null&&isFinite(+i[MK[k]])){ t.m=t.m||{}; t.m[k]=Math.round(((t.m[k]||0)+(+i[MK[k]]))*10)/10; } });
    });
    if(!items.length) t.conf=0;
    return t;
  }
  function band(conf){ return conf>=80?.15:(conf>=55?.2:.25); }

  /* ---------------- one-tap logs ---------------- */
  function recent(){
    var seen={}, out=[], all=F()?F().all().slice().reverse():[];
    all.forEach(function(e){
      if(out.length>=5||!e||!e.kcal||e.src==='seed') return;
      var n=nameOf(e).toLowerCase(); if(seen[n]) return; seen[n]=1; out.push(e);
    });
    return out;
  }
  function yesterday(){
    if(!F()) return [];
    var d=new Date(); d.setDate(d.getDate()-1);
    var slot=F().slotOf({at:Date.now()});
    return F().forDay(dayKey(d.getTime())).filter(function(e){ return F().slotOf(e)===slot&&e.src!=='seed'; });
  }
  function relog(list,src){
    if(!F()||!list.length) return;
    list.forEach(function(e){ F().add({src:'relog',kcal:e.kcal,p:e.p,c:e.c,f:e.f,m:e.m||null,items:(e.items||[]).map(function(i){ return {n:i.n,g:i.g}; })}); });
    var k=list.reduce(function(a,e){ return a+(e.kcal||0); },0), p=list.reduce(function(a,e){ return a+(e.p||0); },0);
    track(src); say('Logged '+Math.round(k)+' kcal · '+Math.round(p)+' g protein');
    paintHome();
  }
  function chipsHTML(){
    var y=yesterday(), r=recent(), h='';
    if(y.length) h+='<button class="kq-chip kq-y" data-kq="y">Same as yesterday<span>'+Math.round(y.reduce(function(a,e){ return a+(e.kcal||0); },0))+' kcal</span></button>';
    r.forEach(function(e,i){ h+='<button class="kq-chip" data-kq="r" data-i="'+i+'">'+esc(nameOf(e).slice(0,28))+'<span>'+Math.round(e.kcal)+' kcal</span></button>'; });
    return h;
  }
  function onChip(b,src){
    T.taps++;
    if(b.getAttribute('data-kq')==='y') relog(yesterday(),src+'_yesterday');
    else { var e=recent()[+b.getAttribute('data-i')]; if(e) relog([e],src+'_recent'); }
  }

  /* ---------------- the sheet ---------------- */
  function sheetHTML(body){
    return '<div class="grab"></div><div class="kq">'
      +'<div class="kq-h"><div class="title-s" style="font-size:18px">Log a meal</div><button class="kq-x" data-kq="x" aria-label="Close">×</button></div>'
      +body+'</div>';
  }
  function paint(state){
    var el=document.querySelector('#sheetIn .kq'); if(!el) return;
    var body='';
    if(state==='reading') body='<div class="kq-shot"><img alt="" src="'+R.shot+'"></div><div class="kq-reading"><span class="kq-dot"></span>Reading the plate…</div>';
    else if(state==='result'){
      var t=R.total, k=Math.round(t.kcal*scale), p=Math.round(t.p*scale), pm=Math.round(k*band(t.conf));
      body='<div class="kq-shot"><img alt="" src="'+R.shot+'"></div>'
        +'<div class="kq-res"><div class="kq-big">'+k+'<small>kcal</small></div><div class="kq-p">'+p+' g protein · '+Math.round(t.c*scale)+' c · '+Math.round(t.f*scale)+' f</div></div>'
        +'<div class="kq-src">Estimated from photo, ±'+Math.round(band(t.conf)*100)+'% (about ±'+pm+' kcal) · '+R.items.length+' item'+(R.items.length===1?'':'s')+': '+esc(R.items.map(function(i){ return i.ingredient; }).slice(0,4).join(', '))+'</div>'
        +'<div class="kq-line"><span class="kova-dot"></span>'+esc(line({kcal:k,p:p}))+'</div>'
        +'<div class="kq-por" role="group" aria-label="Portion">'+[[.5,'½×'],[.75,'¾×'],[1,'1×'],[1.25,'1¼×'],[1.5,'1½×']].map(function(x){ return '<button class="kq-pc'+(scale===x[0]?' on':'')+'" data-kq="s" data-v="'+x[0]+'" aria-pressed="'+(scale===x[0])+'">'+x[1]+'</button>'; }).join('')+'</div>'
        +'<button class="btn kq-log" data-kq="log">Log it</button>';
    }
    else if(state==='empty') body='<div class="kq-shot"><img alt="" src="'+R.shot+'"></div><div class="kq-msg">No food found on that photo. Try again with the plate filling the square.</div><button class="btn" data-kq="again">Retake</button>';
    else if(state==='error') body=(R&&R.shot?'<div class="kq-shot"><img alt="" src="'+R.shot+'"></div>':'')+'<div class="kq-msg">'+esc(R.err)+'</div>'
      +'<button class="btn ghost" data-kq="search">Search the food instead</button>';
    else body='<div class="kq-msg">Point the camera at the plate.</div><button class="btn" data-kq="again">Open the camera</button>';
    var ch=chipsHTML();
    el.innerHTML=el.querySelector('.kq-h').outerHTML+body+(ch?'<div class="lbl" style="margin:16px 0 8px">OR LOG AGAIN, ONE TAP</div><div class="kq-chips">'+ch+'</div>':'');
  }
  function openSheet2(state){
    if(!window.openSheet) return;
    openSheet(sheetHTML(''));
    var el=document.querySelector('#sheetIn .kq');
    el.addEventListener('click',onSheet);
    paint(state);
  }
  function onSheet(ev){
    var b=ev.target.closest('[data-kq]'); if(!b) return;
    var k=b.getAttribute('data-kq');
    if(k!=='x') T.taps++;
    if(k==='x'){ if(window.closeSheet) closeSheet(); return; }
    if(k==='s'){ scale=+b.getAttribute('data-v'); paint('result'); return; }
    if(k==='again'){ camera(true); return; }
    if(k==='search'){ if(window.closeSheet) closeSheet(); try{ go('fuel'); }catch(e){} return; }
    if(k==='y'||k==='r'){ T.taps--; onChip(b,'sheet'); if(window.closeSheet) closeSheet(); return; }
    if(k==='log') logIt();
  }
  function logIt(){
    if(!R||!R.total||!F()) return;
    var t=R.total, s=scale;
    var e=F().add({src:'photo',kcal:Math.round(t.kcal*s),p:Math.round(t.p*s),c:Math.round(t.c*s),f:Math.round(t.f*s),
      m:t.m?Object.keys(t.m).reduce(function(o,k){ o[k]=Math.round(t.m[k]*s*10)/10; return o; },{}):null,
      conf:t.conf,items:R.items.map(function(i){ return {n:i.ingredient,g:Math.round((+i.estimated_weight_grams||0)*s),conf:+i.confidence_percentage||0}; })});
    track('photo');
    if(window.closeSheet) closeSheet();
    say('Logged '+e.kcal+' kcal · '+e.p+' g protein');
    paintHome();
    try{ if(window.__fuelRefresh) __fuelRefresh(); }catch(x){}
  }

  /* tap 1: straight into the camera */
  function camera(again){
    if(!again){ T={taps:1,src:'camera'}; scale=1; R=null; }
    if(!window.KovaCam){ R={err:'The camera is not available here. Search the food instead.'}; openSheet2('error'); return; }
    KovaCam.open({title:'Log a meal',hint:'Fill the square with the plate. Closer is more accurate.',onShot:shot});
  }
  function shot(dataUrl){
    R={shot:dataUrl,items:[],total:null}; scale=1; busy=true;
    openSheet2('reading');
    try{ if(window.KovaMedia) KovaMedia.attach('food',dataUrl,{name:'meal.jpg',ref:'quick-log'}); }catch(e){}
    read(dataUrl,'').then(function(items){
      busy=false; R.items=items||[]; R.total=totalOf(R.items);
      paint(R.items.length?'result':'empty');
    },function(e){
      busy=false;
      R.err=e&&e.status===402?'Reading a photo is part of Kova Pro. Log it by search for free, or start the trial.'
        :e&&e.message==='offline'?(navigator.onLine===false?'You are offline, so nothing could read the photo. It is saved; search the food to log it now.':'The Kova server could not be reached, so nothing read the photo. It is saved; search the food to log it now.')
        :'Could not read the photo right now. Search the food to log it.';
      paint('error');
      if(e&&e.status===402&&window.KovaBilling) setTimeout(function(){ KovaBilling.paywall('meal'); },1600);
    });
  }

  /* ---------------- where it lives: inside Fuel ----------------
     "Scan food" (and the camera icon in Fuel's header) opens the camera
     straight away; the one-tap chips sit under Fuel's quick actions. */
  function paintHome(){
    var scr=document.getElementById('s-fuel'); if(!scr) return;
    var host=document.getElementById('kqFuel');
    var ch=chipsHTML();
    if(!ch){ if(host) host.remove(); return; }
    if(!host){
      var qa=document.getElementById('scanBtn'), row=qa&&qa.parentNode;
      host=document.createElement('div'); host.id='kqFuel'; host.className='kq-fuel';
      if(row&&row.parentNode) row.parentNode.insertBefore(host,row.nextSibling); else scr.appendChild(host);
      host.addEventListener('click',function(ev){
        var b=ev.target.closest('[data-kq]'); if(!b) return;
        T={taps:0,src:'fuel'}; onChip(b,'fuel');
      });
    }
    host.innerHTML='<div class="lbl" style="margin:0 2px 7px">LOG AGAIN, ONE TAP</div><div class="kq-chips">'+ch+'</div>';
  }
  function wireFuel(){
    document.addEventListener('click',function(ev){
      var b=ev.target.closest&&ev.target.closest('#scanBtn,#fuelScanIcon'); if(!b) return;
      ev.preventDefault(); ev.stopPropagation(); camera(false);
    },true);
  }

  function start(){ wireFuel(); paintHome(); if(F()) F().on(function(){ if(!busy) paintHome(); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);

  return {camera:camera,shot:shot,read:read,line:line,totalOf:totalOf,recent:recent,yesterday:yesterday,relog:relog,
    _T:function(){ return T; },_R:function(){ return R; },paintHome:paintHome};
})();
