/* =====================================================================
   KovaImport - bring your history with you (p11).

   Nobody leaves years of logs behind, so Settings > Data & privacy >
   "Import from other apps" reads the exports people already have:
     MyFitnessPal  the ZIP they email you (or its Nutrition-Summary CSV);
                   meals by day and slot, plus weights from the
                   Measurement-Summary file
     Hevy          Settings > Export data > CSV
     Strong        Settings > Export data (CSV); pick kg or lb
     Cal AI / any food CSV   columns found by name: date, food,
                   calories, protein, carbs, fat
     Apple Health / Health Connect  the last 12 months of nights and
                   weights, through the app (KovaNative.history)
   Files are read on this device and never uploaded. Everything lands
   where Kova's own logging goes (KovaFuel, the workout log and personal
   bests, the sleep log, the weight log), so imported history feeds the
   charts and "How it connects" straight away. Importing the same file
   twice adds nothing: every row carries a fingerprint of where it
   came from.
   ===================================================================== */
window.KovaImport=(function(){
  'use strict';
  var LB=2.20462, DAY=864e5;
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function num(v){ var n=parseFloat(String(v==null?'':v).replace(/[^0-9.\-]/g,'')); return isFinite(n)?n:0; }
  function n0(x){ return Math.round(x).toLocaleString('en-US'); }

  /* ---------------- CSV ---------------- */
  function csv(text){
    text=String(text||'').replace(/^﻿/,'');
    var rows=[], row=[], f='', q=false;
    for(var i=0;i<text.length;i++){
      var c=text[i];
      if(q){ if(c==='"'){ if(text[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
      else if(c==='"') q=true;
      else if(c===','){ row.push(f); f=''; }
      else if(c==='\n'||c==='\r'){ if(c==='\r'&&text[i+1]==='\n') i++; row.push(f); rows.push(row); row=[]; f=''; }
      else f+=c;
    }
    if(f!==''||row.length){ row.push(f); rows.push(row); }
    rows=rows.filter(function(r){ return r.length>1||(r[0]||'').trim(); });
    if(!rows.length) return [];
    var head=rows[0].map(function(h){ return h.trim(); });
    return rows.slice(1).map(function(r){ var o={}; head.forEach(function(h,j){ o[h]=(r[j]||'').trim(); }); return o; });
  }
  function col(row,names){
    var ks=Object.keys(row);
    for(var i=0;i<names.length;i++){ var re=names[i]; for(var j=0;j<ks.length;j++) if(re.test(ks[j])) return row[ks[j]]; }
    return '';
  }

  /* ---------------- ZIP (MyFitnessPal emails a ZIP) ---------------- */
  function inflate(data){
    var DS=window.DecompressionStream;
    if(!DS||!window.ReadableStream) return Promise.reject(new Error('This browser cannot open ZIP files. Unzip it and pick the CSV.'));
    var rd=new ReadableStream({start:function(c){ c.enqueue(data); c.close(); }}).pipeThrough(new DS('deflate-raw')).getReader(), parts=[], len=0;
    return (function pump(){ return rd.read().then(function(r){
      if(r.done){ var o=new Uint8Array(len), at=0; parts.forEach(function(p){ o.set(p,at); at+=p.length; }); return o; }
      parts.push(r.value); len+=r.value.length; return pump();
    }); })();
  }
  function unzip(buf){
    var v=new DataView(buf), u=new Uint8Array(buf), out={}, jobs=[];
    var e=-1; for(var i=u.length-22;i>=Math.max(0,u.length-65557);i--){ if(v.getUint32(i,true)===0x06054b50){ e=i; break; } }
    if(e<0) return Promise.reject(new Error('That ZIP could not be read.'));
    var n=v.getUint16(e+10,true), p=v.getUint32(e+16,true);
    for(var k=0;k<n;k++){
      if(v.getUint32(p,true)!==0x02014b50) break;
      var method=v.getUint16(p+10,true), csize=v.getUint32(p+20,true), nl=v.getUint16(p+28,true), xl=v.getUint16(p+30,true), cl=v.getUint16(p+32,true), off=v.getUint32(p+42,true);
      var name=new TextDecoder().decode(u.subarray(p+46,p+46+nl));
      p+=46+nl+xl+cl;
      if(!/\.csv$/i.test(name)) continue;
      var lnl=v.getUint16(off+26,true), lxl=v.getUint16(off+28,true), data=u.subarray(off+30+lnl+lxl,off+30+lnl+lxl+csize);
      (function(name,method,data){
        if(method===0){ out[name]=new TextDecoder().decode(data); return; }
        if(method!==8) return;
        jobs.push(inflate(data).then(function(b){ out[name]=new TextDecoder().decode(b); }));
      })(name,method,data);
    }
    return Promise.all(jobs).then(function(){ return out; });
  }

  /* ---------------- dates ---------------- */
  var MON={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  function when(s){
    s=String(s||'').trim(); if(!s) return 0;
    var m=/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if(m) return new Date(+m[1],+m[2]-1,+m[3],+(m[4]||12),+(m[5]||0),+(m[6]||0)).getTime();
    m=/^(\d{1,2}) (\w{3})\w* (\d{4}),? (\d{1,2}):(\d{2})/.exec(s);                 /* Hevy: 28 Sep 2026, 07:10 */
    if(m&&MON[m[2].toLowerCase()]!=null) return new Date(+m[3],MON[m[2].toLowerCase()],+m[1],+m[4],+m[5]).getTime();
    m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,? (\d{1,2}):(\d{2}))?/.exec(s);            /* 9/28/2026 */
    if(m) return new Date(+m[3],+m[1]-1,+m[2],+(m[4]||12),+(m[5]||0)).getTime();
    var t=Date.parse(s); return isFinite(t)?t:0;
  }

  /* ---------------- food ---------------- */
  var SLOT_H={breakfast:8,lunch:12.5,dinner:18.5,snacks:15.5,snack:15.5};
  function slotOf(meal,t){ var m=String(meal||'').toLowerCase(); if(/break/.test(m)) return 'Breakfast'; if(/lunch/.test(m)) return 'Lunch'; if(/dinner|supper/.test(m)) return 'Dinner'; if(/snack/.test(m)) return 'Snack'; var h=new Date(t).getHours(); return h<11?'Breakfast':h<15?'Lunch':h<18?'Snack':'Dinner'; }
  function foodRows(rows,src){
    var out=[];
    rows.forEach(function(r){
      var date=col(r,[/^date$/i,/date/i,/^day$/i,/time/i]); var t=when(date); if(!t) return;
      var meal=col(r,[/^meal$/i,/meal/i,/slot/i]);
      var hasTime=/\d{1,2}:\d{2}/.test(date);
      if(!hasTime){ var h=SLOT_H[String(meal).toLowerCase().replace(/\s+\d+$/,'')]||12; var d=new Date(t); d.setHours(Math.floor(h),Math.round((h%1)*60),0,0); t=d.getTime(); }
      var kcal=num(col(r,[/^calories$/i,/calorie/i,/kcal/i,/energy/i]));
      var p=num(col(r,[/protein/i])), c=num(col(r,[/carb/i])), f=num(col(r,[/^fat/i,/total fat/i])), fib=num(col(r,[/fib(er|re)/i])), na=num(col(r,[/sodium/i])), k=num(col(r,[/potassium/i]));
      if(!kcal&&!p) return;
      var name=col(r,[/^food/i,/^name$/i,/item/i,/description/i,/^title$/i])||((src==='mfp'?'MyFitnessPal':'Imported')+(meal?' · '+meal:''));
      var m=null; if(fib||na||k){ m={}; if(fib) m.fib=fib; if(na) m.na=na; if(k) m.k=k; }
      out.push({at:t,meal:slotOf(meal,t),src:'import',from:src,kcal:Math.round(kcal),p:Math.round(p),c:Math.round(c),f:Math.round(f),m:m,items:[{n:name.slice(0,80)}],
        imp:src+':'+new Date(t).toISOString().slice(0,16)+':'+String(meal||name).slice(0,20)+':'+Math.round(kcal)});
    });
    return out;
  }
  function addFood(list){
    if(!window.KovaFuel) return {added:0,skipped:list.length};
    var have={}; KovaFuel.all().forEach(function(e){ if(e&&e.imp) have[e.imp]=1; });
    var add=list.filter(function(e){ if(have[e.imp]) return false; have[e.imp]=1; return true; });
    if(add.length){
      /* one write, not thousands: straight into the store KovaFuel reads */
      var all=KovaFuel.all().concat(add).sort(function(a,b){ return a.at-b.at; });
      all.forEach(function(e,i){ if(!e.eid) e.eid='imp'+e.at+'_'+i; });
      try{ KP.set('foodlog',all.slice(-5000)); }catch(e){}
      KovaFuel.emit();
    }
    return {added:add.length,skipped:list.length-add.length};
  }
  function weights(rows){
    var W=[]; rows.forEach(function(r){ var t=when(col(r,[/date/i])), w=num(col(r,[/weight/i])); if(t&&w) W.push({t:t,kg:/lb/i.test(Object.keys(r).join(' '))?Math.round(w/LB*10)/10:w}); });
    return W;
  }
  function addWeights(W,unit){
    if(unit==='lb') W=W.map(function(x){ return {t:x.t,kg:Math.round(x.kg/LB*10)/10}; });
    var cur=[]; try{ cur=KP.get('wlog')||[]; }catch(e){}
    var byDay={}; cur.forEach(function(x){ byDay[new Date(x.t).toDateString()]=1; });
    var add=W.filter(function(x){ var k=new Date(x.t).toDateString(); if(byDay[k]) return false; byDay[k]=1; return x.kg>20&&x.kg<400; });
    if(add.length){ try{ KP.set('wlog',cur.concat(add).sort(function(a,b){ return a.t-b.t; }).slice(-400)); }catch(e){} }
    return add.length;
  }

  /* ---------------- workouts ---------------- */
  function e1rm(w,r){ return (w>0&&r>0)?Math.round(w*(1+r/30)):0; }
  function sessionsFrom(rows,src,unit){
    var S={};
    rows.forEach(function(r){
      var start=col(r,src==='hevy'?[/^start_time$/i]:[/^date$/i]); var t=when(start); if(!t) return;
      var title=col(r,src==='hevy'?[/^title$/i]:[/workout name/i])||'Workout';
      var ex=col(r,src==='hevy'?[/^exercise_title$/i]:[/exercise name/i]); if(!ex) return;
      var type=col(r,[/set_type/i])||'normal';
      var wkg=src==='hevy'?num(col(r,[/weight_kg/i])):0, wlb=src==='hevy'?num(col(r,[/weight_lbs?/i])):0;
      var w=src==='hevy'?(wkg?wkg*LB:wlb):num(col(r,[/^weight$/i]))*(unit==='kg'?LB:1);
      var reps=Math.round(num(col(r,[/^reps$/i])));
      var key=src+':'+t+':'+title;
      var s=S[key]||(S[key]={t:t,title:title,end:when(col(r,[/end_time/i])),dur:col(r,[/^duration$/i]),ex:{},order:[],imp:key});
      if(!s.ex[ex]){ s.ex[ex]=[]; s.order.push(ex); }
      if(reps>0) s.ex[ex].push({w:Math.round(w*10)/10,r:reps,role:/warm/i.test(type)?'warm':'work'});
    });
    return Object.keys(S).map(function(k){ return S[k]; });
  }
  function mins(s){
    if(s.end&&s.end>s.t) return Math.round((s.end-s.t)/60000);
    var d=String(s.dur||''), h=/(\d+)h/.exec(d), m=/(\d+)m/.exec(d), sec=/^\d+$/.test(d)?+d:0;
    return sec?Math.round(sec/60):((h?+h[1]*60:0)+(m?+m[1]:0));
  }
  function addSessions(list){
    var L=lsJ('kova_log_v1',[])||[], H=lsJ('kova_hist_v1',{})||{};
    var have={}; L.forEach(function(x){ if(x&&x.imp) have[x.imp]=1; if(x&&x.t) have['t'+Math.round(x.t/60000)]=1; });
    var added=0;
    list.sort(function(a,b){ return a.t-b.t; }).forEach(function(s){
      if(have[s.imp]||have['t'+Math.round(s.t/60000)]) return;
      var vol=0, ex=s.order.map(function(n){
        var sets=s.ex[n]; sets.forEach(function(x){ if(x.role==='work') vol+=x.w*x.r; });
        var work=sets.filter(function(x){ return x.role==='work'&&x.w>0; });
        if(work.length){
          var top=work.reduce(function(a,b){ return e1rm(b.w,b.r)>e1rm(a.w,a.r)?b:a; });
          (H[n]=H[n]||[]).push({t:s.t,sets:work.map(function(x){ return {w:x.w,r:x.r,role:'work'}; }),top:top.w,e1:e1rm(top.w,top.r),imp:1});
          H[n].sort(function(a,b){ return a.t-b.t; }); if(H[n].length>40) H[n]=H[n].slice(-40);
        }
        return {n:n,m:null,sets:sets.map(function(x){ return {w:x.w,r:x.r,role:x.role,tech:null,segs:[]}; }),ss:0};
      });
      L.push({t:s.t,date:new Date(s.t).toDateString(),day:s.title,mins:mins(s),vol:Math.round(vol),hard:0,mode:'import',cardio:[],ex:ex,imp:s.imp});
      have[s.imp]=1; added++;
    });
    L.sort(function(a,b){ return a.t-b.t; });
    lsSet('kova_log_v1',L.slice(-600));
    lsSet('kova_hist_v1',H);
    try{ if(window.__paintVolume) __paintVolume(); }catch(e){}
    return {added:added,skipped:list.length-added};
  }

  /* ---------------- the kinds ---------------- */
  function run(kind,files,unit){
    var f=files&&files[0]; if(!f) return Promise.reject(new Error('No file chosen.'));
    var isZip=/\.zip$/i.test(f.name)||f.type==='application/zip';
    var read=isZip?f.arrayBuffer().then(unzip):f.text().then(function(t){ var o={}; o[f.name]=t; return o; });
    return read.then(function(files){
      var names=Object.keys(files), res={food:null,workouts:null,weights:0,kind:kind};
      if(kind==='mfp'||kind==='food'){
        var nut=names.filter(function(n){ return /nutrition/i.test(n)||!/measurement|exercise/i.test(n); });
        var rows=[]; nut.forEach(function(n){ rows=rows.concat(csv(files[n])); });
        res.food=addFood(foodRows(rows,kind==='mfp'?'mfp':'food'));
        names.filter(function(n){ return /measurement/i.test(n); }).forEach(function(n){ res.weights+=addWeights(weights(csv(files[n])),'kg'); });
      } else if(kind==='hevy'||kind==='strong'){
        var r2=[]; names.forEach(function(n){ r2=r2.concat(csv(files[n])); });
        res.workouts=addSessions(sessionsFrom(r2,kind,unit||'lb'));
      }
      try{ if(window.KovaAnalytics) KovaAnalytics.track('import_done',{source:kind,count:(res.food?res.food.added:0)+(res.workouts?res.workouts.added:0)}); }catch(e){}
      try{ if(window.KovaLinks) KovaLinks.paint(); }catch(e){}
      return res;
    });
  }
  function summary(r){
    var p=[];
    if(r.food&&r.food.added) p.push(n0(r.food.added)+' meal'+(r.food.added===1?'':'s'));
    if(r.workouts&&r.workouts.added) p.push(n0(r.workouts.added)+' workout'+(r.workouts.added===1?'':'s'));
    if(r.weights) p.push(n0(r.weights)+' weigh-in'+(r.weights===1?'':'s'));
    if(r.nights) p.push(n0(r.nights)+' night'+(r.nights===1?'':'s'));
    var sk=(r.food?r.food.skipped:0)+(r.workouts?r.workouts.skipped:0);
    return (p.length?'Imported '+p.join(' and '):'Nothing new to import')+(sk?' · '+n0(sk)+' already here, skipped':'')+'.';
  }

  /* ---------------- the sheet ---------------- */
  var KINDS=[
    ['mfp','MyFitnessPal','The ZIP from Settings > Export data, or its Nutrition-Summary CSV','.zip,.csv'],
    ['hevy','Hevy','Settings > Export & import data > Export workouts (CSV)','.csv'],
    ['strong','Strong','Settings > Export Strong data (CSV)','.csv'],
    ['food','Cal AI or any food CSV','A CSV with date, food, calories and protein columns','.csv']
  ];
  function open(){
    if(!window.openSheet) return;
    var nat=!!(window.KovaNative&&KovaNative.isNative&&KovaNative.isNative()&&KovaNative.history);
    openSheet('<div class="grab"></div><div class="kim">'
      +'<div class="title-s" style="font-size:19px">Import from other apps</div>'
      +'<div class="sub" style="line-height:1.5;margin:4px 0 12px">Files are read on this phone and never uploaded. Importing the same file twice adds nothing.</div>'
      +KINDS.map(function(k){ return '<label class="kim-row"><span><b>'+k[1]+'</b><small>'+k[2]+'</small></span><span class="kim-pick">Choose file</span><input type="file" accept="'+k[3]+'" data-k="'+k[0]+'" hidden></label>'; }).join('')
      +'<div class="kim-unit">Strong weights are in <button class="kim-u on" data-u="lb">lb</button><button class="kim-u" data-u="kg">kg</button></div>'
      +(nat?'<button class="kim-row kim-h" data-h="1"><span><b>'+(KovaNative.platform&&KovaNative.platform()==='android'?'Health Connect':'Apple Health')+' history</b><small>The last 12 months of sleep and weight</small></span><span class="kim-pick">Import</span></button>':'')
      +'<div class="kim-out" id="kimOut" role="status"></div></div>');
    var el=document.querySelector('#sheetIn .kim'), unit='lb';
    el.addEventListener('click',function(ev){
      var u=ev.target.closest('[data-u]'); if(u){ unit=u.getAttribute('data-u'); el.querySelectorAll('[data-u]').forEach(function(b){ b.classList.toggle('on',b===u); }); return; }
      var h=ev.target.closest('[data-h]'); if(h){ out('Reading 12 months…'); KovaNative.history(365).then(function(r){ out(summary({nights:r.nights,weights:r.weights})); },function(e){ out(e.message,true); }); }
    });
    el.addEventListener('change',function(ev){
      var inp=ev.target; if(!inp.matches('input[type=file]')) return;
      var k=inp.getAttribute('data-k');
      out('Reading '+(inp.files[0]?inp.files[0].name:'the file')+'…');
      run(k,inp.files,unit).then(function(r){ out(summary(r)); },function(e){ out(e.message||'That file could not be read.',true); });
      inp.value='';
    });
    function out(t,bad){ var o=document.getElementById('kimOut'); if(o){ o.textContent=t; o.classList.toggle('bad',!!bad); } }
  }
  function mount(){
    if(document.getElementById('kimRow')) return;
    var at=document.getElementById('kpvExport')||document.getElementById('kovaRestoreBtn'); if(!at) return;
    var d=document.createElement('div');
    d.innerHTML='<div class="list-item tap" id="kimRow"><div class="li-ico"><svg class="ic"><use href="#i-refresh"/></svg></div><div style="flex:1"><div class="li-name">Import from other apps</div><div class="li-sub">MyFitnessPal, Hevy, Strong, Cal AI'+(window.KovaNative&&KovaNative.isNative&&KovaNative.isNative()?', Apple Health history':'')+'</div></div><svg class="ic" style="font-size:14px;opacity:.35"><use href="#i-chevron-right"/></svg></div>';
    at.parentNode.insertBefore(d.firstChild,at);
    document.getElementById('kimRow').addEventListener('click',open);
  }
  /* Settings may be parked (p08_park.js): add the row when it opens */
  function mountSoon(){ if(window.KovaPark&&KovaPark.after) KovaPark.after('s-settings',mount); else mount(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(mountSoon,50); }); else setTimeout(mountSoon,50);

  return {csv:csv,unzip:unzip,when:when,foodRows:foodRows,addFood:addFood,sessionsFrom:sessionsFrom,addSessions:addSessions,weights:weights,addWeights:addWeights,run:run,summary:summary,open:open};
})();
