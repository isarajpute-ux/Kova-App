/* =====================================================================
   KovaToday - your day, behind the week wheel (p11).

   No extra card on Today. Tap a box on "This week" (Sleep, Workout,
   Fuel, Vitals) and that area's day pops up, with the reason in one
   sentence:
     Sleep / Vitals  readiness from last night's sleep and HRV against
                     your own baseline, with the cycle phase if tracked;
     Fuel            today's calories and protein, moved by your sleep and
                     training, and what is left (the protein floor in
                     GLP-1 mode);
     Workout         today's day of your plan, or rest, and how hard to go.
   Nothing is invented: with no data it says what would fill it.

   The morning brief card writes itself from the same numbers instead of
   sample text, and "Send me my day at 7:00" rides the push reminders.
   ===================================================================== */
window.KovaToday=(function(){
  'use strict';
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function n0(x){ return Math.round(x).toLocaleString('en-US'); }
  function hm(m){ m=Math.round(m); return Math.floor(m/60)+'h '+('0'+(m%60)).slice(-2)+'m'; }
  function hhmm(mins){ mins=((Math.round(mins)%1440)+1440)%1440; var h=Math.floor(mins/60), m=mins%60, ap=h<12?'am':'pm'; h=h%12||12; return h+(m?':'+('0'+m).slice(-2):'')+' '+ap; }
  function live(){ return !!(window.KovaMode&&KovaMode.live); }

  /* ---------------- the numbers ---------------- */
  function sleep(){
    var W=(window.KOVA_WEEK||[]).filter(Boolean), last=W[W.length-1];
    var log=lsJ('kova_sleeplog_v1',{}), k=Object.keys(log).sort().pop(), n=k?log[k]:null;
    var mins=0, bed=null;
    if(n&&n.mins){ mins=n.mins; bed=n.bed||null; }
    else if(last&&(last.deep||last.rem||last.light)){ mins=last.deep+last.rem+last.light; bed=last.bed||null; }
    else if(window.KovaHealth&&KovaHealth.sleepMinutes){ mins=+KovaHealth.sleepMinutes()||0; }
    var wake=null;
    if(bed&&mins){
      var m=/^(\d{1,2}):(\d{2})\s*([ap])/i.exec(bed);
      if(m){ var b=(+m[1]%12)*60+(+m[2])+(/p/i.test(m[3])?720:0); wake=(b+mins)%1440; }
    }
    return {mins:mins,wake:wake};
  }
  function readiness(){
    var r=null, how='model';
    try{ if(window.KovaCog&&KovaCog.readiness) r=KovaCog.readiness(); }catch(e){}
    var s=sleep(), hrv=0;
    try{ hrv=window.KovaHealth?(+KovaHealth.get('hrv',0)||0):0; }catch(e){}
    if(r==null&&s.mins){ r=Math.round(Math.min(1,s.mins/480)*85); how='length'; }
    var ph=null, txt='';
    try{ if(window.KovaCycle&&KovaCycle.phase){ var p=KovaCycle.phase(); if(p){ ph=p; txt=(KovaCycle.PHASE[p]||{}).vitals||''; } } }catch(e){}
    return {score:r,sleep:s,hrv:hrv,phase:ph,phaseTxt:txt,how:how};
  }
  /* where a number came from, and how far to trust it (p11: every
     estimate says so) */
  function nights(){ try{ return window.KovaSleepLog?KovaSleepLog.nights().filter(function(n){ return n.mins>0; }).length:0; }catch(e){ return 0; } }
  function sleepSrc(){
    try{ if(window.KovaNative&&KovaNative.isNative&&KovaNative.isNative()) return KovaNative.platform()==='android'?'Health Connect':'Apple Health'; }catch(e){}
    try{ if(window.KovaHealth&&KovaHealth.has&&KovaHealth.has('hrv')) return 'your watch'; }catch(e){}
    return 'your sleep log';
  }
  function source(k,R,Fd){
    if(k==='ready'){
      var n=nights();
      if(R.how==='length') return 'Rough estimate from sleep length alone (no heart rate data). Source: '+sleepSrc()+'.';
      return 'Source: '+sleepSrc()+' \u00b7 based on '+n+' night'+(n===1?'':'s')+(n<7?'. Firms up after 7.':'.');
    }
    if(k==='eat'){
      if(window.KovaGLP1&&KovaGLP1.on()) return 'Floor from your goal weight; eaten is what you logged.';
      if(!Fd.tg) return '';
      if(Fd.tg.base&&Fd.tg.base.src==='demo') return 'Estimate for an average adult until you answer five questions.';
      var bf=false; try{ bf=!!(window.KovaMaint&&(KovaMaint.prof()||{}).bf); }catch(e){}
      return 'Estimate: '+(bf?'Katch-McArdle from your lean mass':'Mifflin-St Jeor from your height, weight and age')+', usually within 10%. Eaten is what you logged.';
    }
    if(k==='work') return 'The usual alertness curve for your wake time; not measured.';
    return '';
  }
  function food(){
    var tg=null; try{ tg=window.__fuelTargets?__fuelTargets():null; }catch(e){}
    var eaten=window.KovaFuel?KovaFuel.totals():{kcal:0,p:0};
    return {tg:tg,eaten:eaten};
  }
  var SPREAD={1:[0],2:[0,3],3:[0,2,4],4:[0,1,3,4],5:[0,1,2,4,5],6:[0,1,2,3,4,5],7:[0,1,2,3,4,5,6]};
  function train(){
    var plan=null; try{ plan=window.KP&&KP.get('plan'); }catch(e){}
    var days=plan&&plan.days&&plan.days.length?plan.days:null;
    var ob={}; try{ ob=(window.KP&&KP.get('onboard'))||{}; }catch(e){}
    var n=days?days.length:(ob.days||0);
    var di=(new Date().getDay()+6)%7;
    var L=lsJ('kova_log_v1',[]), k=new Date().toDateString();
    var done=(L||[]).filter(function(s){ return s&&s.t&&new Date(s.t).toDateString()===k; })[0]||null;
    if(!n) return {known:false,done:done};
    var slots=SPREAD[Math.min(7,n)]||SPREAD[4], at=slots.indexOf(di);
    return {known:true,rest:at<0,name:at>=0?(days?days[at].n:'Day '+(at+1)):'Rest',idx:at,count:n,done:done};
  }
  function work(){
    var W=window.WorkOS; if(!W||!W.overdue) return {tasks:[],have:false};
    var od=[], td=[];
    try{ od=W.overdue()||[]; td=W.dueToday()||[]; }catch(e){}
    var cog=function(i){ return window.KovaCog?KovaCog.of(i):5; };
    var all=od.map(function(i){ return {i:i,od:true}; }).concat(td.map(function(i){ return {i:i,od:false}; }));
    all.sort(function(a,b){ if(a.od!==b.od) return a.od?-1:1; return cog(b.i)-cog(a.i); });
    return {tasks:all.slice(0,2),have:true,count:all.length};
  }

  /* ---------------- the lines ---------------- */
  function lines(){
    var R=readiness(), Fd=food(), Tr=train(), Wk=work(), out=[];
    /* readiness */
    if(R.score!=null){
      var why=[];
      if(R.sleep.mins) why.push(hm(R.sleep.mins)+' of sleep');
      if(R.hrv) why.push('HRV '+Math.round(R.hrv)+' ms');
      out.push({k:'ready',go:'vitals',label:'Readiness',value:String(R.score),unit:'/100',
        why:(why.length?'From '+why.join(' and ')+(R.how==='length'?'.':' against your own baseline.'):'From your last night.')+(R.phase?' '+(KovaCycle.PHASE[R.phase]||{}).n+': '+R.phaseTxt:'')});
    } else out.push({k:'ready',go:'watch',label:'Readiness',value:'—',unit:'',why:'Connect a watch or log last night’s sleep and it shows here.',empty:true});
    /* food: in GLP-1 mode the protein floor leads, never calories */
    if(window.KovaGLP1&&KovaGLP1.on()){
      var gt=KovaGLP1.targets(), gn=KovaGLP1.today();
      out.push({k:'eat',go:'fuel',label:'Eat',value:gn.p+' of '+gt.p,unit:'g protein floor',
        why:(gn.p>=gt.p?'Floor hit today. ':(gt.p-gn.p)+' g to go; small protein-first meals sit easiest. ')+'Fiber '+gn.fib+' of '+gt.fib+' g, water '+gn.water+' of '+gt.water+' L.'});
    }
    else if(Fd.tg){
      /* "Slept 5h 20m, short by 2h 10m" reads as a reason in lower case; "Monday programmed" keeps its capital */
      var adj=(Fd.tg.adj||[]).map(function(a){ return a.t+' ('+String(a.w).replace(/^(Slept|Short|Training|Rest)\b/,function(x){ return x.toLowerCase(); })+')'; });
      var left=Math.max(0,Fd.tg.kcal-Fd.eaten.kcal), pl=Math.max(0,Fd.tg.p-Fd.eaten.p);
      out.push({k:'eat',go:'fuel',label:'Eat',value:n0(Fd.tg.kcal),unit:'kcal · '+Fd.tg.p+' g protein',
        why:(adj.length?'Moved today: '+adj.join('; ')+'. ':'')+(Fd.eaten.kcal?n0(left)+' kcal and '+Math.round(pl)+' g protein left.':'Nothing logged yet.')});
    }
    /* training */
    if(Tr.done) out.push({k:'train',go:'move',label:'Train',value:'Done',unit:'',why:'Logged today'+(Tr.done.mins?', '+Tr.done.mins+' min':'')+(Tr.done.vol?' · '+n0(Tr.done.vol)+' volume':'')+'. Recovery starts with protein and sleep tonight.'});
    else if(!Tr.known) out.push({k:'train',go:'customize',label:'Train',value:'—',unit:'',why:'Set your training days and Kova plans the week.',empty:true});
    else if(Tr.rest) out.push({k:'train',go:'move',label:'Train',value:'Rest',unit:'',why:'Not a training day in your '+Tr.count+'-day plan. A walk helps recovery; it does not cost it.'});
    else {
      var how=R.score==null?'Train by feel; Kova has no readiness signal yet.'
        :R.score<50?'Readiness is low: keep top sets 1–2 reps short of failure, same exercises.'
        :R.score>=75?'Readiness is good: a fair day to push the top set.':'Normal session, as planned.';
      out.push({k:'train',go:'move',label:'Train',value:esc(Tr.name),unit:'',why:'Day '+(Tr.idx+1)+' of your '+Tr.count+'-day plan. '+how});
    }
    /* work */
    if(Wk.have){
      var s=R.sleep.wake!=null?R.sleep.wake+120:9*60, e=s+120;
      if(Wk.tasks.length){
        out.push({k:'work',go:'worktoday',label:'Work',value:esc(Wk.tasks[0].i.name||'Task'),unit:Wk.tasks[1]?'then '+esc(Wk.tasks[1].i.name||''):'',
          why:'Your sharpest window is about '+hhmm(s)+'–'+hhmm(e)+(R.sleep.wake!=null?', 2–4 hours after you woke':'')+'. '+(Wk.tasks[0].od?'The first is overdue. ':'')+(R.score!=null&&R.score<50?'Low readiness: keep deep work to one 45-minute block.':'')});
      } else out.push({k:'work',go:'worktoday',label:'Work',value:'Clear',unit:'',why:'Nothing due today. Your sharpest window, about '+hhmm(s)+'–'+hhmm(e)+', is free for your own work.'});
    }
    out.forEach(function(l){ if(!l.empty) l.src=source(l.k,R,Fd); });
    return out;
  }

  /* for the notification and the widgets: one line per area */
  function summary(){
    var L=lines();
    return {at:Date.now(),lines:L.map(function(l){ return {k:l.k,label:l.label,value:String(l.value).replace(/&amp;/g,'&'),unit:l.unit}; }),
      text:L.filter(function(l){ return !l.empty; }).map(function(l){ return l.label+': '+String(l.value).replace(/&amp;/g,'&')+(l.unit?' '+l.unit:''); }).join(' · ')};
  }

  /* ---------------- the pop-up behind each week box ---------------- */
  var MORNING='kova.today.7am';
  var AREA={sleep:{t:'Sleep',k:['ready'],go:'sleep'},vitals:{t:'Vitals',k:['ready'],go:'vitals'},fuel:{t:'Fuel',k:['eat'],go:'fuel'},move:{t:'Workout',k:['train'],go:'move'}};
  function pop(area){
    var A=AREA[area]; if(!A||!window.openSheet) return;
    var L=lines().filter(function(l){ return A.k.indexOf(l.k)>=0; }), on=!!lsJ(MORNING,false);
    var extra='';
    if(area==='vitals'){ var R=readiness(); if(R.phase) extra='<div class="kt-why" style="margin-top:8px">'+esc(R.phaseTxt)+'</div>'; }
    openSheet('<div class="grab"></div><div class="kt">'
      +'<div class="kova-h" style="margin:0 0 6px"><div class="kova-dot"></div><div class="kova-lbl">KOVA \u00b7 '+A.t.toUpperCase()+' TODAY</div></div>'
      +L.map(function(l){
        return '<div class="kt-row'+(l.empty?' empty':'')+'"><span class="kt-l">'+l.label+'</span>'
          +'<span class="kt-v"><b>'+l.value+'</b>'+(l.unit?'<small>'+l.unit+'</small>':'')+'</span>'
          +'<span class="kt-why">'+esc(l.why)+'</span>'+(l.src?'<span class="kt-src">'+esc(l.src)+'</span>':'')+'</div>';
      }).join('')+extra
      +'<button class="btn" data-kt="go" style="margin-top:14px">Open '+A.t+'</button>'
      +'<button class="kt-am'+(on?' on':'')+'" data-kt="am" aria-pressed="'+on+'">'+(on?'Your day arrives at 7:00 \u00b7 turn off':'Send me my day at 7:00')+'</button></div>');
    var el=document.querySelector('#sheetIn .kt');
    if(el) el.addEventListener('click',function(ev){
      var b=ev.target.closest('[data-kt]'); if(!b) return;
      if(b.getAttribute('data-kt')==='go'){ if(window.closeSheet) closeSheet(); try{ go(A.go); }catch(e){} }
      else { toggleMorning(); pop(area); }
    });
    try{ if(window.KovaAnalytics) KovaAnalytics.track('week_box',{feature:area}); }catch(e){}
  }
  /* the morning brief: two sentences from the real numbers */
  function brief(){
    var R=readiness(), Fd=food(), Tr=train(), parts=[];
    if(R.sleep.mins) parts.push('You slept '+hm(R.sleep.mins)+(R.score!=null?', readiness '+R.score+'.':'.'));
    if(Tr.done) parts.push('Today\u2019s session is done.');
    else if(Tr.known&&Tr.rest) parts.push('Rest day on your plan.');
    else if(Tr.known) parts.push(Tr.name+' is on your plan'+(R.score!=null&&R.score<50?'; keep the top sets short of failure.':'.'));
    if(window.KovaGLP1&&KovaGLP1.on()){ var gt=KovaGLP1.targets(), gn=KovaGLP1.today(); parts.push(gn.p>=gt.p?'Protein floor hit.':(gt.p-gn.p)+' g to your protein floor.'); }
    else if(Fd.tg){ var pl=Math.max(0,Math.round(Fd.tg.p-Fd.eaten.p)); parts.push(pl?pl+' g protein to go today.':'Protein target hit.'); }
    return parts.length?parts.join(' '):'Log a meal or connect a watch, and this brief writes itself from your day.';
  }
  function paint(){
    var home=document.getElementById('s-home'); if(!home) return;
    var old=document.getElementById('ktoday'); if(old) old.remove();
    var card=[].slice.call(home.querySelectorAll('.card.kova')).filter(function(c){ return /MORNING BRIEF/.test(c.textContent); })[0];
    if(card){ card.style.display=''; var tx=card.querySelector('.kova-txt'); if(tx) tx.textContent=brief(); }
    try{ localStorage.setItem('kova.today.widget',JSON.stringify(summary())); }catch(e){}
    syncMorning();
  }
  function onBox(ev){
    var b=ev.target.closest&&ev.target.closest('#wheelBoxes [data-wp]'); if(!b) return;
    if(ev.type==='keydown'&&ev.key!=='Enter'&&ev.key!==' ') return;
    ev.preventDefault(); pop(b.getAttribute('data-wp'));
  }
  /* the 7:00 message rides the push reminders; its body is today's summary,
     refreshed whenever Today repaints */
  function toggleMorning(){
    var on=!lsJ(MORNING,false);
    try{ localStorage.setItem(MORNING,JSON.stringify(on)); }catch(e){}
    syncMorning(true);
    if(on&&window.KovaPush&&!KovaPush.active()) setTimeout(function(){ KovaPush.offer('Your 7:00 day'); },300);
    else if(window.toast) toast(on?'Your day arrives at 7:00.':'7:00 message off.');
  }
  function syncMorning(force){
    if(!window.__alerts) return;
    var A=__alerts.get(), on=!!lsJ(MORNING,false), cur=A.filter(function(a){ return a.id==='today'; })[0];
    var body=summary().text||'Your day, in four lines.';
    if(on&&!cur){ A.push({id:'today',p:'Home',ic:'i-sparkles',t:'07:00',on:true,days:[1,1,1,1,1,1,1],lead:0,tone:'gentle',title:'Your day',body:body}); __alerts.save(); }
    else if(on&&cur&&(cur.body!==body||!cur.on)){ cur.body=body; cur.on=true; __alerts.save(); }
    else if(!on&&cur&&(cur.on||force)){ cur.on=false; __alerts.save(); }
  }

  function start(){
    paint();
    document.addEventListener('click',onBox);
    document.addEventListener('keydown',onBox);
    if(window.KovaFuel) KovaFuel.on(function(){ paint(); });
    window.addEventListener('kova:health',function(){ paint(); });
    document.addEventListener('visibilitychange',function(){ if(!document.hidden) paint(); });
    document.addEventListener('click',function(e){ var g=e.target.closest&&e.target.closest('[data-go="home"]'); if(g) setTimeout(paint,60); },true);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);

  return {lines:lines,summary:summary,paint:paint,pop:pop,brief:brief,readiness:readiness,train:train,work:work};
})();
