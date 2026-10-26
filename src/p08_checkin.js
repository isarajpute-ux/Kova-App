/* =====================================================================
   KovaCheckin - your nutrition coach checks in, on Fuel (p30).

   The owner asked for a check-in every day of the week from the Fuel
   coach that looks at how everything is going, not just food. The card:
     - the coach's latest check-in, in their words (a real job they ran);
     - this week from your own data: days with food logged, calories and
       protein against your target, workouts, sleep and weight. A number
       with nothing behind it says so ("No data yet"), never a guess;
     - "Check in now", and "Every evening" which turns on the coach's
       daily routine (it runs on the server when signed in).
   The coach is the AI team's Nutrition Coach (src/p08_crew.js).
   Dark, soft light and light glass.
   ===================================================================== */
window.KovaCheckin=(function(){
  'use strict';
  var DAY=864e5;
  var JOB='Daily check-in. Read my week with read_health: food against my target, protein, workouts, sleep and weight. '
    +'In a few lines: how the week is going, what is working, what is not, and the one thing to do today.';
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function sod(t){ var d=new Date(t||Date.now()); d.setHours(0,0,0,0); return d.getTime(); }
  function dk(t){ var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function live(){ try{ return !!(window.KovaMode&&KovaMode.live); }catch(e){ return false; } }
  function ago(t){ var m=Math.round((Date.now()-t)/6e4); return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago'; }
  function n0(x){ return Math.round(x).toLocaleString(); }

  function coach(){
    var C=window.KovaCrew; if(!C||!C.emps) return null;
    return C.emps().filter(function(e){ return e.tpl==='nutrition'||e.id==='nutrition'; })[0]||null;
  }

  /* this week (the last 7 days, today included), all from your own logs */
  function week(){
    var F=window.KovaFuel, s0=sod()-6*DAY, logged=0, kc=0, pr=0;
    for(var i=0;i<7;i++){
      var list=[]; try{ list=F?F.forDay(F.dayKey(s0+i*DAY))||[]:[]; }catch(e){}
      var sm=list.length&&F?F.sum(list):null;
      if(sm&&sm.kcal>0){ logged++; kc+=sm.kcal; pr+=sm.p||0; }
    }
    var tg=null; try{ tg=window.__fuelTargets?__fuelTargets():null; }catch(e){}
    var own=!!(tg&&tg.base&&tg.base.src&&tg.base.src!=='demo');
    var L=live(), sess=(lsJ('kova_log_v1',[])||[]).filter(function(x){ return x&&x.t>=s0&&!(L&&x.seed); }).length;
    var nights=[]; try{ nights=(window.KovaSleepLog&&KovaSleepLog.nights?KovaSleepLog.nights():[]).filter(function(x){ return x&&x.k>=dk(s0)&&x.mins>0; }); }catch(e){}
    var wl=((window.KP&&KP.get('wlog'))||[]).filter(function(x){ return x&&x.kg>0; }).sort(function(a,b){ return a.t-b.t; });
    var wNow=wl.length?wl[wl.length-1]:null, wThen=wl.filter(function(x){ return x.t<s0; }).slice(-1)[0]||wl.filter(function(x){ return x.t>=s0; })[0];
    return {logged:logged, kcal:logged?kc/logged:null, protein:logged?pr/logged:null,
      target:own?{kcal:tg.kcal,p:tg.p}:null, sessions:sess,
      sleepH:nights.length?nights.reduce(function(a,x){ return a+x.mins; },0)/nights.length/60:null, nights:nights.length,
      weight:wNow?wNow.kg:null, weightChange:(wNow&&wThen&&wThen!==wNow)?wNow.kg-wThen.kg:null};
  }

  function lastCheck(e){
    var C=window.KovaCrew; if(!C||!e) return null;
    return (C.jobsOf(e.id)||[]).filter(function(j){ return j.source==='routine'||j.source==='checkin'||/check-?in/i.test(j.text||''); }).slice(-1)[0]||null;
  }
  function busy(e){ var j=lastCheck(e); return !!(j&&(j.state==='running'||j.state==='waiting')); }

  function cell(k,v,s){ return '<div class="kci-c"><div class="kci-k">'+esc(k)+'</div><div class="kci-v'+(v==='—'?' none':'')+'">'+esc(v)+'</div><div class="kci-s">'+esc(s)+'</div></div>'; }
  function html(){
    var e=coach(); if(!e) return '';
    var W=week(), j=lastCheck(e), on=!!(e.routine&&e.routine.freq&&e.routine.freq!=='off'), t=e.routine&&e.routine.time||'20:00';
    var said=j&&j.state==='done'?String(j.say||(j.report&&j.report.summary)||'').replace(/\*\*/g,'').trim():'';
    var hh=+t.split(':')[0], when=(hh%12||12)+(t.split(':')[1]&&t.split(':')[1]!=='00'?':'+t.split(':')[1]:'')+(hh<12?' am':' pm');
    var cal=W.kcal==null?'—':n0(W.kcal)+(W.target?' / '+n0(W.target.kcal):'');
    return '<div class="card kci">'
      +'<div class="kci-h"><span class="kci-av" aria-hidden="true">'+esc(e.n.charAt(0))+'</span><div><div class="kci-t">'+esc(e.n)+'’s check-in</div>'
      +'<div class="kci-sub">Your nutrition coach · '+(on?'every evening at '+when:'check-ins are off')+'</div></div></div>'
      +(busy(e)?'<div class="kci-say">'+esc(e.n)+' is reading your week…</div>'
        :said?'<div class="kci-say">'+esc(said.slice(0,420))+(said.length>420?'…':'')+'<span class="kci-when"> · '+esc(ago(j.end||j.at))+'</span></div>'
        :'<div class="kci-say none">No check-in yet. Tap Check in now and '+esc(e.n)+' reads your week: food, training, sleep and weight.</div>')
      +'<div class="kci-wk">This week</div><div class="kci-g">'
        +cell('Food logged',W.logged+' of 7 days',W.logged?'Keep logging, it is what '+e.n+' reads':'Nothing logged yet')
        +cell('Calories a day',cal,W.kcal==null?'No food logged yet':W.target?'average against your target':'No target yet: Find my maintenance')
        +cell('Protein a day',W.protein==null?'—':n0(W.protein)+' g'+(W.target&&W.target.p?' / '+n0(W.target.p)+' g':''),W.protein==null?'No food logged yet':'average')
        +cell('Workouts',String(W.sessions),W.sessions?'this week':'None logged this week')
        +cell('Sleep',W.sleepH==null?'—':W.sleepH.toFixed(1)+' h',W.sleepH==null?'No nights yet':'average of '+W.nights+' night'+(W.nights===1?'':'s'))
        +cell('Weight',W.weight==null?'—':W.weight.toFixed(1)+' kg',W.weightChange==null?(W.weight==null?'No weigh-ins yet':'one weigh-in so far'):(W.weightChange>0?'+':'')+W.weightChange.toFixed(1)+' kg this week')
      +'</div>'
      +'<div class="kci-row"><button class="btn kci-go" data-kci="now"'+(busy(e)?' disabled':'')+'>Check in now</button>'
      +'<button class="kci-tog'+(on?' on':'')+'" data-kci="tog" role="switch" aria-checked="'+on+'"><span></span>Every evening</button></div>'
      +'<button class="kci-msg" data-kci="msg">Message '+esc(e.n)+'</button>'
      +'</div>';
  }

  var host=null, timer=null;
  function paint(){
    host=document.getElementById('kciSlot'); if(!host) return;
    host.innerHTML=html();
    clearTimeout(timer);
    var e=coach(); if(e&&busy(e)) timer=setTimeout(paint,4000);
  }
  function now(){
    var e=coach(), C=window.KovaCrew; if(!e||!C||!C.start) return say('Your AI team is still loading. Try again in a second.');
    if(busy(e)) return;
    var j=C.start(e,JOB,'checkin'); if(j) say(e.n+' is reading your week.');
    paint();
  }
  function toggle(){
    var e=coach(), C=window.KovaCrew; if(!e||!C||!C.setRoutine) return;
    var on=!(e.routine&&e.routine.freq&&e.routine.freq!=='off');
    C.setRoutine(e.id,on,JOB,'20:00');
    say(on?e.n+' will check in every evening at 8 pm.':'Evening check-ins are off.');
    paint();
  }
  document.addEventListener('click',function(ev){
    var b=ev.target.closest&&ev.target.closest('[data-kci]'); if(!b) return;
    var a=b.getAttribute('data-kci');
    if(a==='now') now(); else if(a==='tog') toggle();
    else if(a==='msg'){ var e=coach(); try{ go('workteam'); }catch(x){} setTimeout(function(){ if(e&&window.KovaCrew&&KovaCrew.openMate) KovaCrew.openMate(e.id); },160); }
  });
  document.addEventListener('kova:screen',function(e){ if(e&&e.detail==='fuel') paint(); });
  setTimeout(paint,0);
  return {paint:paint,week:week,coach:coach,now:now,toggle:toggle,JOB:JOB};
})();
