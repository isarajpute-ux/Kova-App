/* =====================================================================
   KovaNative - the bridge the iPhone / Android app adds (p10).

   The same index.html runs inside a Capacitor shell (see native/). When
   it does, window.Capacitor exists and the Health plugin
   (@capgo/capacitor-health: Apple HealthKit on iOS, Health Connect on
   Android) is registered. This file:
     - asks once for read access, from a button, never on launch;
     - reads the last 36 h (sleep, HRV, resting HR, steps, energy,
       exercise, SpO2, respiratory rate, VO2 max, weight, wrist temp) and
       hands them to KovaHealth.ingest, the same door every other source
       uses, so every screen picks them up unchanged;
     - writes each night into the sleep log the "How it connects" cards read;
     - during a workout, polls heart rate every 10 s and hands samples under
       a minute old to KovaHR. HealthKit gets Watch readings in batches, so
       this lags a live strap; the HR pill says where it comes from.
   In a normal browser this does nothing.
   ===================================================================== */
window.KovaNative=(function(){
  'use strict';
  var H=null, ok=false, plat='web', hrT=null;
  var READ=['sleep','heartRateVariability','restingHeartRate','heartRate','steps','calories','exerciseTime','oxygenSaturation','respiratoryRate','vo2Max','weight','appleSleepingWristTemperature','distance'];
  function cap(){ return window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform(); }
  function plugin(){
    if(H) return H;
    if(!cap()) return null;
    try{ H=Capacitor.registerPlugin?Capacitor.registerPlugin('Health'):(Capacitor.Plugins&&Capacitor.Plugins.Health); }catch(e){ H=null; }
    return H;
  }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function iso(t){ return new Date(t).toISOString(); }
  function dayKey(t){ var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function read(type,hours,limit){
    return plugin().readSamples({dataType:type,startDate:iso(Date.now()-hours*3600e3),endDate:iso(Date.now()),limit:limit||500,ascending:false})
      .then(function(r){ return (r&&r.samples)||[]; }).catch(function(){ return []; });
  }
  function latest(L){ return L.length?L[0]:null; }
  function avg(L){ return L.length?L.reduce(function(a,s){ return a+(+s.value||0); },0)/L.length:null; }
  function sum(L){ return L.reduce(function(a,s){ return a+(+s.value||0); },0); }

  function available(){
    var p=plugin(); if(!p) return Promise.resolve(false);
    return p.isAvailable().then(function(r){ ok=!!(r&&r.available); plat=(r&&r.platform)||plat; return ok; }).catch(function(){ return false; });
  }
  function connect(){
    var p=plugin(); if(!p) return Promise.reject(new Error('Not in the Kova app'));
    /* the reason comes first, then the system dialog (App Store 5.1.1 / Health Connect policy) */
    var ask=window.KovaPrivacy&&KovaPrivacy.explainHealth?KovaPrivacy.explainHealth():Promise.resolve(true);
    return ask.then(function(go){
      if(!go){ var e=new Error('Not connected. You can do it any time from Vitals.'); e.skipped=true; throw e; }
      return p.requestAuthorization({read:READ,write:[]});
    }).then(function(st){
      try{ localStorage.setItem('kova.native.on','1'); }catch(e){}
      return sync().then(function(n){ return {status:st,fields:n}; });
    });
  }
  /* one pass: the last day and a half into KovaHealth */
  function sync(){
    if(!plugin()) return Promise.resolve(0);
    var today0=new Date(); today0.setHours(0,0,0,0); var sinceMid=(Date.now()-today0.getTime())/3600e3;
    return Promise.all([
      read('sleep',36,200), read('heartRateVariability',36,50), read('restingHeartRate',72,5),
      read('steps',sinceMid,2000), read('calories',sinceMid,2000), read('exerciseTime',sinceMid,500),
      read('oxygenSaturation',36,50), read('respiratoryRate',36,50), read('vo2Max',24*60,1),
      read('weight',24*60,1), read('appleSleepingWristTemperature',24*40,40), read('distance',sinceMid,2000)
    ]).then(function(R){
      var o={device:plat==='ios'?'Apple Health':'Health Connect'};
      /* sleep: minutes asleep in the night that ended most recently */
      var sl=R[0].filter(function(s){ return s.sleepState!=='inBed'&&s.sleepState!=='awake'; });
      if(sl.length){
        var end=new Date(sl[0].endDate).getTime(), night=sl.filter(function(s){ return end-new Date(s.endDate).getTime()<16*3600e3; });
        var st={deep:0,rem:0,core:0,awake:0}, mins=0, first=Infinity;
        night.forEach(function(s){ var m=(new Date(s.endDate)-new Date(s.startDate))/60000; mins+=m; first=Math.min(first,new Date(s.startDate).getTime());
          if(s.sleepState==='deep') st.deep+=m; else if(s.sleepState==='rem') st.rem+=m; else if(s.sleepState==='light') st.core+=m; });
        R[0].forEach(function(s){ if(s.sleepState==='awake'&&end-new Date(s.endDate).getTime()<16*3600e3) st.awake+=(new Date(s.endDate)-new Date(s.startDate))/60000; });
        mins=Math.round(mins);
        if(mins>60){
          o.sleep=Math.floor(mins/60)+'h '+(mins%60)+'m';
          if(st.deep) o.deep=Math.round(st.deep); if(st.rem) o.rem=Math.round(st.rem); if(st.core) o.core=Math.round(st.core); if(st.awake) o.awake=Math.round(st.awake);
          /* the sleep log the "How it connects" cards read, keyed by wake day */
          try{
            var log=lsJ('kova_sleeplog_v1',{}), bd=new Date(first), hh=bd.getHours(), mm=('0'+bd.getMinutes()).slice(-2);
            log[dayKey(end)]={mins:mins,bed:(hh%12||12)+':'+mm+' '+(hh<12?'a':'p'),src:'health'};
            localStorage.setItem('kova_sleeplog_v1',JSON.stringify(log));
          }catch(e){}
        }
      }
      var hrv=avg(R[1].slice(0,10)); if(hrv) o.hrv=Math.round(hrv);
      var rhr=latest(R[2]); if(rhr) o.hr=Math.round(rhr.value);
      if(R[3].length) o.steps=Math.round(sum(R[3]));
      if(R[4].length) o.energy=Math.round(sum(R[4]));
      if(R[5].length) o.exercise=Math.round(sum(R[5]));
      var sp=avg(R[6]); if(sp) o.spo2=Math.round(sp>1?sp:sp*100);
      var rr=avg(R[7]); if(rr) o.resp=Math.round(rr*10)/10;
      var vo=latest(R[8]); if(vo) o.vo2=Math.round(vo.value*10)/10;
      var wt=latest(R[9]); if(wt) o.weight=(Math.round(wt.value*10)/10)+' kg';
      /* wrist temperature as a deviation from your own recent nights, which is what the cycle view reads */
      if(R[10].length>=4){ var base=avg(R[10].slice(1)), d=R[10][0].value-base; o.temp=(d>=0?'+':'')+(Math.round(d*100)/100)+'°C'; }
      if(R[11].length) o.distance=Math.round(sum(R[11])/100)/10;
      var n=window.KovaHealth?KovaHealth.ingest(o,plat==='ios'?'healthkit':'healthconnect'):0;
      try{ if(n&&KovaHealth.apply) KovaHealth.apply(); }catch(e){}
      return n;
    });
  }
  /* history: up to a year of nights and weigh-ins, for "How it connects"
     and the recap on day one (Settings > Import from other apps). Read a
     month at a time so no single call asks the store for too much. */
  function history(days){
    var p=plugin(); if(!p) return Promise.reject(new Error('Not in the Kova app'));
    days=Math.min(400,Math.max(7,days||365));
    var end=Date.now(), windows=[];
    for(var t=end-days*864e5;t<end;t+=30*864e5) windows.push([t,Math.min(end,t+30*864e5)]);
    var nights={};
    return windows.reduce(function(chain,w){
      return chain.then(function(){
        return p.readSamples({dataType:'sleep',startDate:iso(w[0]),endDate:iso(w[1]),limit:5000,ascending:true}).then(function(r){
          ((r&&r.samples)||[]).forEach(function(s){
            if(s.sleepState==='inBed'||s.sleepState==='awake') return;
            var k=dayKey(new Date(s.endDate).getTime()), a=new Date(s.startDate).getTime(), m=(new Date(s.endDate)-a)/60000;
            var n=nights[k]||(nights[k]={mins:0,first:a}); n.mins+=m; n.first=Math.min(n.first,a);
          });
        }).catch(function(){});
      });
    },Promise.resolve()).then(function(){
      var log=lsJ('kova_sleeplog_v1',{}), added=0;
      Object.keys(nights).forEach(function(k){
        var n=nights[k]; if(n.mins<120||log[k]) return;
        var bd=new Date(n.first), hh=bd.getHours();
        log[k]={mins:Math.round(n.mins),bed:(hh%12||12)+':'+('0'+bd.getMinutes()).slice(-2)+' '+(hh<12?'a':'p'),src:'health'}; added++;
      });
      try{ localStorage.setItem('kova_sleeplog_v1',JSON.stringify(log)); }catch(e){}
      return read('weight',days*24,2000).then(function(W){
        var w=W.map(function(s){ return {t:new Date(s.startDate||s.endDate).getTime(),kg:Math.round((+s.value)*10)/10}; });
        var nw=window.KovaImport?KovaImport.addWeights(w,'kg'):0;
        try{ if(window.KovaLinks) KovaLinks.paint(); }catch(e){}
        return {nights:added,weights:nw};
      });
    });
  }
  /* heart rate while a workout screen is open */
  function hrLoop(on){
    clearInterval(hrT); hrT=null;
    if(!on||!plugin()||!localStorage.getItem('kova.native.on')) return;
    var tick=function(){ read('heartRate',0.05,3).then(function(L){ var s=latest(L); if(s&&Date.now()-new Date(s.endDate).getTime()<60000&&window.KovaHR) KovaHR.push(s.value); }); };
    tick(); hrT=setInterval(tick,10000);
  }
  /* one quiet card on Vitals until you connect; then it shows the last sync */
  function card(){
    var scr=document.getElementById('s-vitals'); if(!scr) return;
    var el=document.getElementById('knCard');
    if(!el){ el=document.createElement('div'); el.id='knCard'; el.className='kn'; var hd=scr.querySelector('.hdr'); if(hd&&hd.nextSibling) scr.insertBefore(el,hd.nextSibling); else scr.insertBefore(el,scr.firstChild); }
    var on=!!localStorage.getItem('kova.native.on'), nm=plat==='android'?'Health Connect':'Apple Health';
    el.innerHTML='<div class="kn-i">♥</div><div class="kn-t"><b>'+nm+'</b><span>'+(on?'Syncing when you open Kova. Read only.':'Sleep, HRV, resting heart rate, steps and more. Read only; nothing is written back.')+'</span></div>'
      +'<button class="kn-b" data-kn="'+(on?'sync':'go')+'">'+(on?'Sync now':'Connect')+'</button>';
    el.querySelector('[data-kn]').onclick=function(){
      var b=this; b.textContent='…';
      (on?sync():connect().then(function(r){ return r.fields; })).then(function(n){ if(window.toast) toast(n?n+' readings from '+nm+'.':'Nothing new from '+nm+' yet.'); card(); })
        .catch(function(e){ if(window.toast) toast(e&&e.skipped?e.message:'Could not read '+nm+': '+(e.message||e)); card(); });
    };
  }
  function hasLiveHR(){ return ok&&!!localStorage.getItem('kova.native.on'); }
  function start(){
    if(!cap()) return;
    document.documentElement.classList.add('is-native');
    available().then(function(a){ if(a) card(); if(a&&localStorage.getItem('kova.native.on')) sync(); });
    document.addEventListener('visibilitychange',function(){ if(!document.hidden&&localStorage.getItem('kova.native.on')) sync(); });
    var mo=new MutationObserver(function(){ var s=document.getElementById('s-session'); hrLoop(!!(s&&s.classList.contains('on'))); });
    var sc=document.getElementById('s-session'); if(sc) mo.observe(sc,{attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);
  return {isNative:cap,available:available,connect:connect,sync:sync,history:history,read:function(t,h,l){ return plugin()?read(t,h,l):Promise.resolve([]); },hasLiveHR:hasLiveHR,_hrLoop:hrLoop,READ:READ,platform:function(){ return plat; }};
})();
