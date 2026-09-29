/* =====================================================================
   KovaAlarm - smart alarm, in the iPhone / Android app (p11).

   You set the latest time you want to be up and a window (20 or 30
   minutes). Kova then:
     - schedules a real alarm notification at the latest time, so it goes
       off even if Kova is closed (@capacitor/local-notifications);
     - if Kova is left open on the charger, it reads your watch's heart
       rate through Health every two minutes inside the window and wakes
       you at the lightest moment it sees: heart rate rising 6+ bpm over
       your night's baseline, or you moving;
     - without that data it simply wakes you at the latest time.
   The sound rises gently over a minute. In the morning one tap rates how
   groggy you felt, and that lands in the sleep log next to the wake time.
   On the website this does not show: a browser cannot wake a phone.
   ===================================================================== */
window.KovaAlarm=(function(){
  'use strict';
  var KEY='kova_alarm_v1', NID=7001, MIN=60000;
  var S=lsJ(KEY,{on:false,latest:'07:00',window:30,fired:'',rated:''});
  var timer=null, ctx=null;
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function native(){ return !!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform()); }
  function LN(){ if(!native()) return null; try{ return Capacitor.registerPlugin?Capacitor.registerPlugin('LocalNotifications'):(Capacitor.Plugins&&Capacitor.Plugins.LocalNotifications); }catch(e){ return null; } }
  function dk(t){ var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }

  /* the next latest-time, from now */
  function next(now){
    now=now||Date.now();
    var p=String(S.latest).split(':'), d=new Date(now); d.setHours(+p[0],+p[1],0,0);
    if(d.getTime()<=now) d=new Date(d.getTime()+864e5);
    return d.getTime();
  }

  /* is this the lightest moment? samples: [{t, bpm}] newest last; steps: [{t,n}] */
  function decide(o){
    var now=o.now, latest=o.latest, from=latest-o.window*MIN;
    if(now>=latest) return {wake:true,why:'latest'};
    if(now<from) return {wake:false,why:'before window'};
    var hr=(o.hr||[]).filter(function(s){ return s&&s.bpm>0; });
    var base=hr.filter(function(s){ return s.t<from; }).map(function(s){ return s.bpm; });
    var recent=hr.filter(function(s){ return s.t>=now-5*MIN; }).map(function(s){ return s.bpm; });
    var moved=(o.steps||[]).some(function(s){ return s.t>=now-5*MIN&&s.n>0; });
    if(moved) return {wake:true,why:'movement'};
    if(base.length>=3&&recent.length){
      var b=base.reduce(function(a,x){ return a+x; },0)/base.length, r=recent.reduce(function(a,x){ return a+x; },0)/recent.length;
      if(r>=b+6) return {wake:true,why:'heart rate rising',base:Math.round(b),now:Math.round(r)};
    }
    return {wake:false,why:base.length<3?'no data yet':'still in deeper sleep'};
  }

  /* ---------------- the alarm itself ---------------- */
  function schedule(){
    var P=LN(); if(!P) return Promise.resolve(false);
    var at=next();
    return P.requestPermissions().then(function(r){
      if(r&&r.display!=='granted') throw new Error('Allow notifications for Kova so the alarm can ring.');
      return P.cancel({notifications:[{id:NID}]}).catch(function(){});
    }).then(function(){
      return P.schedule({notifications:[{id:NID,title:'Good morning',body:'Your alarm. Tap to rate how you feel.',schedule:{at:new Date(at),allowWhileIdle:true},extra:{screen:'sleep',kind:'alarm'}}]});
    }).then(function(){ return true; });
  }
  function chime(){
    try{
      var AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
      ctx=ctx||new AC();
      var g=ctx.createGain(); g.gain.setValueAtTime(0.0001,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.35,ctx.currentTime+60); g.connect(ctx.destination);
      [523.25,659.25,783.99].forEach(function(f,i){
        for(var k=0;k<30;k++){ var o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f; var e=ctx.createGain(); var t0=ctx.currentTime+k*2+i*0.25;
          e.gain.setValueAtTime(0,t0); e.gain.linearRampToValueAtTime(0.6,t0+0.05); e.gain.exponentialRampToValueAtTime(0.001,t0+1.6);
          o.connect(e); e.connect(g); o.start(t0); o.stop(t0+1.7); }
      });
    }catch(e){}
  }
  function fire(why){
    S.fired=dk(Date.now()); S.firedAt=Date.now(); S.why=why; save();
    clearInterval(timer); timer=null;
    var P=LN();
    if(P){ P.cancel({notifications:[{id:NID}]}).catch(function(){}); P.schedule({notifications:[{id:NID+1,title:'Good morning',body:why==='latest'?'Your alarm.':'Woken in a light moment of sleep.',schedule:{at:new Date(Date.now()+1000)},extra:{screen:'sleep',kind:'alarm'}}]}).catch(function(){}); }
    chime();
    paint();
  }
  /* inside the window, while Kova is open: look every two minutes */
  function watch(){
    clearInterval(timer); timer=null;
    if(!S.on) return;
    var latest=next(Date.now()-60*MIN);
    var tick=function(){
      var now=Date.now();
      if(now<latest-S.window*MIN||S.fired===dk(now)) return;
      read().then(function(d){ var r=decide({now:now,latest:latest,window:S.window,hr:d.hr,steps:d.steps}); if(r.wake) fire(r.why); });
    };
    tick(); timer=setInterval(tick,2*MIN);
  }
  function read(){
    var N=window.KovaNative;
    if(!N||!N.read) return Promise.resolve({hr:[],steps:[]});
    return Promise.all([N.read('heartRate',2,200),N.read('steps',0.25,50)]).then(function(r){
      return {hr:r[0].map(function(s){ return {t:new Date(s.endDate||s.startDate).getTime(),bpm:+s.value}; }).sort(function(a,b){ return a.t-b.t; }),
              steps:r[1].map(function(s){ return {t:new Date(s.endDate||s.startDate).getTime(),n:+s.value}; })};
    });
  }

  /* ---------------- the morning rating ---------------- */
  function rate(n){
    var log=lsJ('kova_sleeplog_v1',{}), k=dk(Date.now());
    log[k]=Object.assign({},log[k]||{},{groggy:n,wake:S.firedAt?new Date(S.firedAt).toTimeString().slice(0,5):null,woke:S.why||null});
    try{ localStorage.setItem('kova_sleeplog_v1',JSON.stringify(log)); }catch(e){}
    S.rated=k; save(); paint();
    say('Saved to your sleep log.');
  }

  /* ---------------- the row on Sleep (app only) ---------------- */
  function paint(){
    if(!native()) return;
    var scr=document.getElementById('s-sleep'); if(!scr) return;
    var el=document.getElementById('kalRow');
    if(!el){ el=document.createElement('div'); el.id='kalRow'; el.className='card kal'; var hd=scr.querySelector('.hdr'); scr.insertBefore(el,hd?hd.nextSibling:scr.firstChild); el.addEventListener('click',onClick); el.addEventListener('change',onChange); }
    var k=dk(Date.now()), ask=S.fired===k&&S.rated!==k;
    el.innerHTML=ask
      ?'<div class="kal-q">How groggy did you wake?</div><div class="kal-rate" role="group" aria-label="Grogginess, 1 fresh to 5 very groggy">'+[1,2,3,4,5].map(function(n){ return '<button data-r="'+n+'" aria-label="'+n+(n===1?' fresh':n===5?' very groggy':'')+'">'+n+'</button>'; }).join('')+'</div><div class="kal-sub">1 fresh · 5 very groggy</div>'
      :'<div class="kal-h"><div><b>Smart alarm</b><span>'+(S.on?'Up by '+esc(S.latest)+', woken in the lightest moment of the last '+S.window+' min':'Off')+'</span></div>'
        +'<label class="kal-sw"><input type="checkbox" id="kalOn"'+(S.on?' checked':'')+' aria-label="Smart alarm"><i></i></label></div>'
        +(S.on?'<div class="kal-set"><label>Latest <input type="time" id="kalT" value="'+esc(S.latest)+'"></label><label>Window <select id="kalW"><option value="20"'+(S.window===20?' selected':'')+'>20 min</option><option value="30"'+(S.window===30?' selected':'')+'>30 min</option></select></label></div>'
          +'<div class="kal-sub">Leave Kova open on the charger for the smart window. Otherwise it rings at '+esc(S.latest)+'.</div>':'');
  }
  function onClick(ev){ var b=ev.target.closest('[data-r]'); if(b) rate(+b.getAttribute('data-r')); }
  function onChange(ev){
    var id=ev.target.id;
    if(id==='kalOn') S.on=ev.target.checked;
    if(id==='kalT') S.latest=ev.target.value||'07:00';
    if(id==='kalW') S.window=+ev.target.value;
    save(); paint();
    if(S.on) schedule().then(function(ok){ if(ok) say('Alarm set for '+S.latest+'.'); watch(); },function(e){ say(e.message); });
    else { var P=LN(); if(P) P.cancel({notifications:[{id:NID}]}).catch(function(){}); clearInterval(timer); }
  }
  function start(){ if(!native()) return; paint(); watch(); document.addEventListener('visibilitychange',function(){ if(!document.hidden){ paint(); watch(); } }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);

  return {decide:decide,next:next,schedule:schedule,rate:rate,paint:paint,fire:fire,_S:function(){ return S; },_set:function(s){ S=s; save(); }};
})();
