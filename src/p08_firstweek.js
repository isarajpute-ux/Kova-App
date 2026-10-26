/* =====================================================================
   KovaFirstWeek - the first week decides everything (p11).

   1. The funnel, logged once each:
        app_install -> onboarding_done -> first_win -> day1_return
        -> trial_start -> subscribe   (the last two come from KovaBilling)
      plus return_day {day} on the first open of each of days 1-30, which
      is what GA4 retention cohorts (D1 / D7 / D30) are built from. No
      event carries a health value (KovaAnalytics drops them anyway).
   2. The first win - a meal logged, a workout finished, or health data
      arriving - is noticed once; only after it, and only when payments
      are set up, the plan is offered. Never before someone has seen
      their own data.
   3. The questions the first run no longer asks come back one a day,
      as a single card on Today, each where it does something:
        which device you wear -> the watch setup
        a wind-down reminder  -> switches it on (and offers push)
        Face ID lock          -> sets it up
        your real calorie target -> the 5-question calculator
        day 7: "How is Kova doing?" (1-5)
      "Later" brings it back tomorrow; "Don't ask" drops it.
   ===================================================================== */
window.KovaFirstWeek=(function(){
  'use strict';
  var KEY='kova.firstweek.v1', DAY=864e5;
  var S=lsJ(KEY,null);
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function day0(t){ var d=new Date(t); d.setHours(0,0,0,0); return d.getTime(); }
  function dayN(){ return Math.round((day0(Date.now())-day0(S.install))/DAY); }
  function track(n,p){ try{ if(window.KovaAnalytics&&KovaAnalytics.__real) KovaAnalytics.__real(n,p||{}); else if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }

  /* ---------------- the funnel ---------------- */
  function init(){
    if(!S||!S.install){
      S={install:Date.now(),seen:{},win:null,paywall:false,prompts:{},lastPrompt:'',rated:0};
      save(); track('app_install',{platform:window.Capacitor?'app':'web'});
    }
    S.seen=S.seen||{}; S.prompts=S.prompts||{};
    var n=dayN(), k='d'+n;
    if(n>=1&&n<=30&&!S.seen[k]){
      S.seen[k]=1; save();
      track('return_day',{day:n});
      if(n===1) track('day1_return',{});
      if(n===7) track('day7_return',{});
      if(n===30) track('day30_return',{});
    }
  }

  /* ---------------- the first win ---------------- */
  var WIN={log_food:'meal',quick_log:'meal',workout_complete:'workout',health_connected:'health'};
  function watch(){
    var A=window.KovaAnalytics; if(!A||A.__fw) return;
    var real=A.track;
    A.__real=real;
    A.track=function(name,params){
      var r=real.apply(this,arguments);
      if(WIN[name]) firstWin(WIN[name]);
      return r;
    };
    A.__fw=1;
    /* real readings arriving (Apple Health, Health Connect, the watch sync
       relay, a paste) all go through KovaHealth.ingest */
    var H=window.KovaHealth;
    if(H&&H.ingest&&!H.__fw){
      var ing=H.ingest;
      H.ingest=function(obj,src){ var n=ing.apply(this,arguments); if(n>0&&src&&src!=='url') firstWin('health'); return n; };
      H.__fw=1;
    }
    /* the relay pull and paste ingest inside KovaHealth itself; they announce kova:health */
    window.addEventListener('kova:health',function(){
      try{ var a=window.KovaHealth&&KovaHealth.all(); if(a&&a.src&&a.src!=='url'&&a.src!=='unknown'&&a.ts>=S.install) firstWin('health'); }catch(e){}
    });
  }
  function firstWin(kind){
    if(S.win) return;
    S.win={kind:kind,at:Date.now()}; save();
    track('first_win',{kind:kind,count:Math.round((Date.now()-S.install)/1000)});
    setTimeout(offerPlan,1800);
  }
  function offerPlan(){
    if(S.paywall||!window.KovaBilling||!KovaBilling.configured()||KovaBilling.isPro()||!window.openSheet) return;
    S.paywall=true; save();
    var what={meal:'your first meal is logged',workout:'your first workout is logged',health:'your health data is in'}[S.win&&S.win.kind]||'you are set up';
    openSheet('<div class="grab"></div><div class="kfw">'
      +'<div class="title-s" style="font-size:19px;margin-bottom:4px">Nice, '+esc(what)+'.</div>'
      +'<div class="sub" style="line-height:1.55;margin-bottom:14px">Everything in Kova is free for 10 days: photo logging, the assistant, your AI team, publishing. The price is on the next screen before anything is charged, and cancelling is one tap in Settings.</div>'
      +'<button class="btn" data-kfw="plan">See the free trial</button>'
      +'<button class="btn ghost" data-kfw="later" style="margin-top:8px">Keep exploring</button></div>');
    var el=document.querySelector('#sheetIn .kfw');
    if(el) el.addEventListener('click',function(ev){
      var b=ev.target.closest('[data-kfw]'); if(!b) return;
      if(window.closeSheet) closeSheet();
      if(b.getAttribute('data-kfw')==='plan'){ track('paywall_shown',{feature:'first_win'}); try{ go('plan'); }catch(e){} }
    });
  }

  /* ---------------- one prompt a day ---------------- */
  function ob(){ try{ return (window.KP&&KP.get('onboard'))||{}; }catch(e){ return {}; } }
  var PROMPTS=[
    {id:'device',min:0,needWin:true,when:function(){ return !ob().device; },
      q:'Wearing anything that tracks you?',why:'Sleep and recovery need a source. Without one Kova asks you instead.',
      opts:[['watch','Apple Watch'],['ring','Oura or a ring'],['band','Whoop or Garmin'],['none','Nothing']],
      pick:function(v){ var o=ob(); o.device=v; try{ KP.set('onboard',o); }catch(e){}
        if(v!=='none'){ if(window.KovaNative&&KovaNative.isNative&&KovaNative.isNative()) KovaNative.connect().catch(function(e){ say(e.message); }); else try{ go('watch'); }catch(e){} }
        else say('Kova will ask for your sleep instead.'); }},
    {id:'winddown',min:1,when:function(){ var A=window.__alerts&&__alerts.get(); var b=A&&A.filter(function(a){ return a.id==='bed'; })[0]; return !!b; },
      q:'A wind-down nudge at night?',why:'Bedtime drift is the habit that moves sleep scores most. One reminder, 30 minutes before bed.',
      opts:[['on','Yes, remind me'],['no','No thanks']],
      pick:function(v){ if(v!=='on') return; var A=__alerts.get(), b=A.filter(function(a){ return a.id==='bed'; })[0]; if(b){ b.on=true; __alerts.save(); }
        say('Wind-down reminder on at '+(b?b.t:'22:30')+'.'); if(window.KovaPush&&!KovaPush.active()) setTimeout(function(){ KovaPush.offer(b&&b.title); },500); }},
    {id:'lock',min:2,when:function(){ return !!window.PublicKeyCredential&&window.KovaAuth&&!KovaAuth.hasBio(); },
      q:'Lock Kova with Face ID or your fingerprint?',why:'Health data is personal. Skip it and Kova keeps opening straight up.',
      opts:[['on','Turn it on'],['no','Not needed']],
      pick:function(v){ if(v==='on') KovaAuth.setBiometric().then(function(ok){ say(ok?'Kova is locked with your face or fingerprint.':'Could not set it up on this device.'); }); }},
    {id:'target',min:3,when:function(){ return !(window.KovaMaint&&KovaMaint.base&&KovaMaint.base()); },
      q:'Get your real calorie target?',why:'Right now Kova uses a starting estimate. Five questions make it yours.',
      opts:[['go','Five questions'],['no','Later']],
      pick:function(v){ if(v==='go') try{ go('maint'); }catch(e){} }},
    {id:'rate',min:7,when:function(){ return !S.rated; },
      q:'How is Kova doing?',why:'One tap. It decides what gets better next.',
      opts:[['1','1'],['2','2'],['3','3'],['4','4'],['5','5']],rating:true,
      pick:function(v){ S.rated=+v; save(); track('kova_rating',{rating:+v}); say(+v>=4?'Thank you.':'Thank you. It will get better.'); }}
  ];
  function nextPrompt(){
    var n=dayN(), today=String(day0(Date.now()));
    if(S.lastPrompt===today&&S.shownId&&!S.prompts[S.shownId]) return PROMPTS.filter(function(p){ return p.id===S.shownId; })[0]||null;
    if(S.lastPrompt===today) return null;                       /* one a day */
    for(var i=0;i<PROMPTS.length;i++){
      var p=PROMPTS[i], st=S.prompts[p.id];
      if(st==='done'||st==='never') continue;
      if(st&&st.later&&st.later>Date.now()) continue;
      if(n<p.min) continue;
      if(p.needWin&&!S.win&&n<1) continue;
      try{ if(!p.when()) { S.prompts[p.id]='done'; continue; } }catch(e){ continue; }
      return p;
    }
    return null;
  }
  function paint(){
    var home=document.getElementById('s-home'); if(!home) return;
    var host=document.getElementById('kfwCard');
    var p=nextPrompt();
    if(!p){ if(host) host.remove(); return; }
    if(!host){
      host=document.createElement('div'); host.id='kfwCard'; host.className='card kfw-card';
      var after=document.getElementById('kqHome')||home.querySelector('.hdr');
      home.insertBefore(host,after?after.nextSibling:home.firstChild);
      host.addEventListener('click',onCard);
    }
    if(S.shownId!==p.id||S.lastPrompt!==String(day0(Date.now()))){ S.shownId=p.id; S.lastPrompt=String(day0(Date.now())); save(); track('prompt_shown',{feature:p.id}); }
    host.setAttribute('data-p',p.id);
    host.innerHTML='<div class="kfw-q">'+esc(p.q)+'</div><div class="sub" style="line-height:1.5">'+esc(p.why)+'</div>'
      +'<div class="kfw-opts'+(p.rating?' kfw-rate':'')+'" role="group" aria-label="'+esc(p.q)+'">'+p.opts.map(function(o){ return '<button class="kfw-o" data-v="'+esc(o[0])+'"'+(p.rating?' aria-label="'+o[0]+' out of 5"':'')+'>'+esc(o[1])+'</button>'; }).join('')+'</div>'
      +'<div class="kfw-foot"><button class="kfw-l" data-x="later">Later</button><button class="kfw-l" data-x="never">Don’t ask</button></div>';
  }
  function onCard(ev){
    var host=document.getElementById('kfwCard'); if(!host) return;
    var id=host.getAttribute('data-p'), p=PROMPTS.filter(function(x){ return x.id===id; })[0]; if(!p) return;
    var o=ev.target.closest('.kfw-o'), x=ev.target.closest('[data-x]');
    if(o){ S.prompts[id]='done'; save(); try{ p.pick(o.getAttribute('data-v')); }catch(e){} track('prompt_answered',{feature:id}); host.remove(); return; }
    if(x){
      S.prompts[id]=x.getAttribute('data-x')==='never'?'never':{later:day0(Date.now())+DAY};
      save(); host.remove();
    }
  }

  function start(){
    init(); watch(); paint();
    document.addEventListener('visibilitychange',function(){ if(!document.hidden){ init(); paint(); } });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);

  return {firstWin:firstWin,paint:paint,next:nextPrompt,day:dayN,_S:function(){ return S; },_reset:function(s){ S=s; save(); },PROMPTS:PROMPTS};
})();
