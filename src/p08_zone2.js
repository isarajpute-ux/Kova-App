/* =====================================================================
   KovaZone2 - Zone 2 running (p33).

   Zone 2 is the easy, conversational effort that builds the aerobic
   base: most of an endurance athlete's week is spent here (about 80% of
   training in elite runners, Seiler 2010), and it is the effort the
   heart, the mitochondria and fat burning adapt to.

   Your range, in order of how personal it is:
     1. one you set (a lab or field test beats any formula);
     2. 60-70% of heart-rate reserve (Karvonen), when Kova has your
        resting heart rate from your watch: rest + 0.6 / 0.7 x (max - rest);
     3. 60-70% of max heart rate, max from your age (Tanaka: 208 - 0.7 x age)
        or the max you typed into Live heart rate.
   The talk test is the check either way: you can say full sentences.

   The run: a full screen with your heart rate against the band (from a
   Bluetooth strap, see KovaHR), what to do (hold it, ease off, a touch
   faster) with a voice and a buzz when you drift for 10 seconds, time in
   the zone, and distance and pace from GPS. The screen stays on (the
   browser stops GPS when it locks; the app says so). With no strap it
   is a talk-test run: the minutes count as "by feel", never as measured.

   Afterwards: time in zone, average heart rate, distance, pace, and your
   aerobic pace (pace while in Zone 2), the number that shows the base
   growing. Workout gets a Zone 2 card: this week's minutes against your
   goal (150 by default, the WHO's weekly minimum of moderate activity),
   the last run, and how your aerobic pace has moved.
   Runs live in KP 'z2runs' (synced with your profile).
   ===================================================================== */
window.KovaZone2=(function(){
  'use strict';
  var DAY=864e5;
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function kp(k,d){ try{ var v=window.KP&&KP.get(k); return v==null?d:v; }catch(e){ return d; } }
  function kps(k,v){ try{ if(window.KP) KP.set(k,v); }catch(e){} }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }

  /* ---------- the range ---------- */
  function age(){ var a=+lsJ('kova.hr.age',0); try{ if(!a&&window.KP){ var me=KP.get('me')||{}; a=+me.age||0; } }catch(e){} return a||0; }
  function rest(){
    try{ var H=window.KovaHealth; if(H&&H.has&&H.has('rhr')){ var r=+H.get('rhr'); if(r>=35&&r<=100) return Math.round(r); } }catch(e){}
    return 0;
  }
  function zone(){
    var own=kp('z2zone',null);
    var mx=window.KovaHR&&KovaHR.max?KovaHR.max():{v:Math.round(208-0.7*(age()||30)),src:age()?'age':'guess'};
    var r=rest(), a=age();
    if(own&&own.lo>60&&own.hi>own.lo) return {lo:+own.lo,hi:+own.hi,max:mx.v,rest:r,src:'own',how:'The range you set'+(own.note?' ('+own.note+')':'')+'.'};
    var mxText=mx.src==='yours'?'your max of '+mx.v:'a max of '+mx.v+(mx.src==='age'?' estimated from your age':' (add your age for a closer number)');
    if(r){
      return {lo:Math.round(r+0.6*(mx.v-r)),hi:Math.round(r+0.7*(mx.v-r)),max:mx.v,rest:r,src:'hrr',maf:a?180-a:0,
        how:'60–70% of your heart-rate reserve: your resting '+r+' from your watch and '+mxText+'.'};
    }
    return {lo:Math.round(0.6*mx.v),hi:Math.round(0.7*mx.v),max:mx.v,rest:0,src:'max',maf:a?180-a:0,
      how:'60–70% of '+mxText+'. With your resting heart rate from a watch the range gets more personal.'};
  }
  function state(b,z){ if(!b) return 'none'; if(b<z.lo) return 'below'; if(b>z.hi) return 'above'; return 'in'; }

  /* ---------- distance and pace ---------- */
  function hav(a,b){ var R=6371e3, r=Math.PI/180, dl=(b.lat-a.lat)*r, dn=(b.lon-a.lon)*r, x=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)*Math.sin(dn/2); return 2*R*Math.asin(Math.min(1,Math.sqrt(x))); }
  function unit(){ var u=lsJ('kova.z2.unit',''); if(u) return u; var g=lsJ('kova.units',''); return g==='metric'?'km':'mi'; }
  function per(){ return unit()==='km'?1000:1609.344; }
  function distText(m){ return m>0?(m/per()).toFixed(2):'0.00'; }
  function paceText(sPerM){ if(!sPerM||!isFinite(sPerM)) return '–'; var s=Math.round(sPerM*per()); if(s>3600) return '–'; return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); }
  function mmss(ms){ var s=Math.max(0,Math.round(ms/1000)), h=Math.floor(s/3600), m=Math.floor(s%3600/60); return (h?h+':'+('0'+m).slice(-2):m)+':'+('0'+(s%60)).slice(-2); }
  /* GPS points: keep the good ones, ignore jumps no runner makes */
  function addPoint(R,p){
    if(!p||p.acc>30) return false;
    var last=R.pts[R.pts.length-1];
    if(last){
      var d=hav(last,p), dt=(p.t-last.t)/1000;
      if(dt<=0) return false;
      if(d/dt>8) return false;                                          /* faster than 8 m/s: a GPS jump */
      if(d<Math.max(2,Math.min(p.acc,last.acc)/3)) return false;       /* standing still, or noise */
      if(!R.paused){ R.dist+=d; if(R.cur==='in') R.zDist+=d; }
    }
    R.pts.push(p); if(R.pts.length>2400) R.pts=R.pts.slice(-2400);
    return true;
  }
  function curPace(R){
    var now=R.pts[R.pts.length-1]; if(!now) return 0;
    var i=R.pts.length-1, d=0; while(i>0&&now.t-R.pts[i-1].t<=30000){ d+=hav(R.pts[i-1],R.pts[i]); i--; }
    var dt=(now.t-R.pts[i].t)/1000; return d>15&&dt>5?dt/d:0;
  }

  /* ---------- the runs ---------- */
  function runs(){ var L=kp('z2runs',[]); return Array.isArray(L)?L:[]; }
  function goal(){ return +kp('z2goal',150)||150; }
  function weekStart(t){ var d=new Date(t||Date.now()); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d.getTime(); }
  function week(t){
    var s=weekStart(t), e=s+7*DAY, L=runs().filter(function(r){ return r.t>=s&&r.t<e; });
    return {measured:Math.round(L.reduce(function(a,r){ return a+(r.inZone||0); },0)/60000),feel:Math.round(L.filter(function(r){ return !r.hr; }).reduce(function(a,r){ return a+(r.dur||0); },0)/60000),n:L.length};
  }
  function aerobic(){
    var L=runs().filter(function(r){ return r.hr&&r.zDist>400&&r.inZone>5*60000; });
    if(!L.length) return null;
    var last=L[L.length-1], old=L.filter(function(r){ return r.t<=last.t-21*DAY; }).slice(-1)[0];
    var pace=function(r){ return (r.zMoving||r.inZone)/1000/r.zDist; };
    return {now:pace(last),then:old?pace(old):0,thenT:old?old.t:0};
  }

  /* ---------- the live run ---------- */
  var R=null, iv=0, geo=null, wake=null;
  function voice(t){ try{ if(window.speechSynthesis&&lsJ('kova.z2.voice',true)){ var u=new SpeechSynthesisUtterance(t); u.rate=1.02; speechSynthesis.cancel(); speechSynthesis.speak(u); } }catch(e){} try{ if(navigator.vibrate) navigator.vibrate([90,60,90]); }catch(e){} }
  function lock(){ try{ if(navigator.wakeLock&&navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function(w){ wake=w; },function(){}); }catch(e){} }
  function onVis(){ if(R&&!document.hidden){ lock(); if(R.hiddenAt){ R.gap=(R.gap||0)+(Date.now()-R.hiddenAt); R.hiddenAt=0; } } else if(R&&document.hidden) R.hiddenAt=Date.now(); }
  function start(mode){
    if(R) return R;
    var z=zone();
    R={t0:Date.now(),mode:mode||'outdoor',z:z,paused:false,pauseAt:0,pausedMs:0,inZone:0,above:0,below:0,none:0,zMoving:0,dist:0,zDist:0,pts:[],hr:[],cur:'none',since:Date.now(),cued:'',last:Date.now()};
    lock(); document.addEventListener('visibilitychange',onVis);
    if(R.mode==='outdoor'&&navigator.geolocation){
      try{ geo=navigator.geolocation.watchPosition(function(p){ if(!R) return; addPoint(R,{lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy||99,t:p.timestamp||Date.now()}); R.gps='on'; },
        function(err){ if(R){ R.gps=err&&err.code===1?'denied':'lost'; paint(); } },{enableHighAccuracy:true,maximumAge:1000,timeout:20000}); R.gps='waiting'; }catch(e){ R.gps='none'; }
    } else R.gps=R.mode==='outdoor'?'none':'indoor';
    clearInterval(iv); iv=setInterval(tick,1000);
    track('zone2_start',{mode:R.mode,hr:!!(window.KovaHR&&KovaHR.bpm())});
    open(); return R;
  }
  function tick(){
    if(!R) return;
    var now=Date.now(), dt=Math.min(3000,now-R.last); R.last=now;
    if(R.paused){ paint(); return; }
    var b=window.KovaHR&&KovaHR.bpm?KovaHR.bpm():0, s=state(b,R.z);
    R[s==='in'?'inZone':s]+=dt;
    if(s==='in'&&curPace(R)>0) R.zMoving+=dt;
    if(b){ if(!R.hr.length||now-R.hr[R.hr.length-1][0]>=5000) R.hr.push([now,b]); R.hasHR=true; }
    if(s!==R.cur){ R.cur=s; R.since=now; }
    /* a cue once you have been out of the band (or back in it) for 10 s */
    if(s!=='none'&&now-R.since>=10000&&R.cued!==s+R.since){
      R.cued=s+R.since;
      if(s==='above') voice('Ease off a little. You are above Zone 2.');
      else if(s==='below'&&now-R.t0>5*60000) voice('You can go a touch faster.');
      else if(s==='in'&&R.wasOut) voice('Back in Zone 2. Hold this.');
      R.wasOut=s!=='in';
    }
    paint();
  }
  function pause(){ if(!R) return; R.paused=!R.paused; if(R.paused) R.pauseAt=Date.now(); else { R.pausedMs+=Date.now()-R.pauseAt; R.last=Date.now(); } paint(); }
  function stopAll(){ clearInterval(iv); iv=0; if(geo!=null&&navigator.geolocation) try{ navigator.geolocation.clearWatch(geo); }catch(e){} geo=null; try{ if(wake) wake.release(); }catch(e){} wake=null; document.removeEventListener('visibilitychange',onVis); }
  function finish(keep){
    if(!R) return null;
    if(R.paused) pause();
    stopAll();
    var end=Date.now(), dur=end-R.t0-R.pausedMs, b=R.hr.map(function(x){ return x[1]; });
    var run={t:R.t0,dur:dur,mode:R.mode,lo:R.z.lo,hi:R.z.hi,src:R.z.src,hr:!!R.hasHR,inZone:R.hasHR?R.inZone:0,above:R.above,below:R.below,
      avg:b.length?Math.round(b.reduce(function(a,x){ return a+x; },0)/b.length):0,max:b.length?Math.max.apply(null,b):0,
      dist:Math.round(R.dist),zDist:Math.round(R.zDist),zMoving:R.zMoving,trace:R.hr.filter(function(x,i){ return i%2===0; }).slice(-360).map(function(x){ return [Math.round((x[0]-R.t0)/1000),x[1]]; })};
    var done=R; R=null; close();
    if(!keep||dur<60000){ if(keep) say('Under a minute, so it was not saved.'); return null; }
    var L=runs(); L.push(run); kps('z2runs',L.slice(-80));
    track('zone2_done',{mins:Math.round(dur/60000),hr:run.hr});
    summary(run);
    return run;
  }

  /* ---------- the run screen ---------- */
  var LABEL={in:['In Zone 2','Hold this. You could talk in full sentences.'],above:['Above Zone 2','Ease off: slow down or walk until it settles.'],below:['Below Zone 2','A touch faster, or keep it easy if you are warming up.'],none:['By feel','No heart rate: keep it conversational. If you cannot say a full sentence, slow down.']};
  function open(){
    var el=document.getElementById('kz2'); if(!el){ el=document.createElement('div'); el.id='kz2'; el.className='kz2'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); el.setAttribute('aria-label','Zone 2 run'); document.body.appendChild(el); }
    paint();
  }
  function close(){ var el=document.getElementById('kz2'); if(el) el.remove(); }
  function ring(b,z,s){
    var lo=z.lo-25, hi=z.hi+25, f=b?Math.max(0,Math.min(1,(b-lo)/(hi-lo))):0, a0=(z.lo-lo)/(hi-lo), a1=(z.hi-lo)/(hi-lo);
    var C=2*Math.PI*88, arc=function(x0,x1){ return 'stroke-dasharray="'+(C*0.75*(x1-x0)).toFixed(1)+' '+C.toFixed(1)+'" stroke-dashoffset="'+(-C*0.75*x0).toFixed(1)+'"'; };
    var ang=135+270*f, rx=100+88*Math.cos(ang*Math.PI/180), ry=100+88*Math.sin(ang*Math.PI/180);
    return '<svg class="kz2-ring s-'+s+'" viewBox="0 0 200 200" aria-hidden="true"><g transform="rotate(135 100 100)">'
      +'<circle class="trk" cx="100" cy="100" r="88" '+arc(0,1)+'/><circle class="band" cx="100" cy="100" r="88" '+arc(a0,a1)+'/></g>'
      +(b?'<circle class="dot" cx="'+rx.toFixed(1)+'" cy="'+ry.toFixed(1)+'" r="8"/>':'')+'</svg>';
  }
  function trace(pts,z,w,h){
    if(!pts||pts.length<2) return '';
    var t1=pts[pts.length-1][0]||1, lo=Math.min(z.lo-15,Math.min.apply(null,pts.map(function(p){ return p[1]; }))), hi=Math.max(z.hi+15,Math.max.apply(null,pts.map(function(p){ return p[1]; })));
    var y=function(v){ return (h-4-(v-lo)/(hi-lo)*(h-8)).toFixed(1); }, x=function(t){ return (t/t1*w).toFixed(1); };
    return '<svg class="kz2-tr" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" role="img" aria-label="Heart rate against your Zone 2 band, chart"><rect class="band" x="0" y="'+y(z.hi)+'" width="'+w+'" height="'+(y(z.lo)-y(z.hi)).toFixed(1)+'"/>'
      +'<path d="M'+pts.map(function(p){ return x(p[0])+','+y(p[1]); }).join('L')+'"/></svg>';
  }
  function paint(){
    var el=document.getElementById('kz2'); if(!el||!R) return;
    var b=window.KovaHR&&KovaHR.bpm?KovaHR.bpm():0, s=state(b,R.z), lab=LABEL[s], now=R.paused?R.pauseAt:Date.now(), el2=now-R.t0-R.pausedMs;
    var hrOk=window.KovaHR&&(KovaHR.supported&&KovaHR.supported()||(window.KovaNative&&KovaNative.hasLiveHR&&KovaNative.hasLiveHR()));
    var gpsNote=R.mode==='indoor'?'Treadmill: no GPS':R.gps==='denied'?'Location is off for Kova, so no distance':R.gps==='none'?'This browser has no GPS':R.gps==='waiting'?'Finding GPS…':R.gps==='lost'?'GPS lost, trying again':'';
    var pace=R.mode==='outdoor'?curPace(R):0;
    el.innerHTML='<div class="kz2-in">'
      +'<div class="kz2-top"><div><b>Zone 2 run</b><span>'+R.z.lo+'–'+R.z.hi+' bpm'+(R.paused?' · paused':'')+'</span></div><span class="kz2-time" aria-live="off">'+mmss(el2)+'</span></div>'
      +'<div class="kz2-mid">'+ring(b,R.z,s)+'<div class="kz2-bpm"><b>'+(b||'–')+'</b><span>'+(b?'bpm':'no heart rate')+'</span></div></div>'
      +'<div class="kz2-say s-'+s+'" aria-live="polite"><b>'+lab[0]+'</b><span>'+lab[1]+'</span></div>'
      +'<div class="kz2-stats"><div><span>In zone</span><b>'+(R.hasHR?mmss(R.inZone):'–')+'</b></div><div><span>Distance</span><b>'+(R.mode==='outdoor'&&R.pts.length?distText(R.dist):'–')+'</b><i>'+unit()+'</i></div><div><span>Pace</span><b>'+(pace?paceText(pace):'–')+'</b><i>/'+unit()+'</i></div></div>'
      +(R.hr.length>1?'<div class="kz2-trw">'+trace(R.hr.map(function(x){ return [(x[0]-R.t0)/1000,x[1]]; }),R.z,300,60)+'</div>':'')
      +((gpsNote||(!b&&hrOk))?'<div class="kz2-note">'+esc(gpsNote)+(gpsNote&&!b&&hrOk?' · ':'')+(!b&&hrOk?'<button type="button" class="kz2-link" data-z2="hr">Connect a heart-rate strap</button>':'')+'</div>':'')
      +'<div class="kz2-acts"><button type="button" class="kz2-b ghost" data-z2="pause">'+(R.paused?'Resume':'Pause')+'</button><button type="button" class="kz2-b" data-z2="finish">Finish</button></div>'
      +'<div class="kz2-foot">Keep Kova open: the screen stays on, because phones stop GPS in a locked browser.</div></div>';
  }

  /* ---------- after a run ---------- */
  function summary(r){
    if(!window.openSheet) return;
    var w=week(r.t), g=goal(), pct=r.hr&&r.dur?Math.round(r.inZone/r.dur*100):0, z={lo:r.lo,hi:r.hi};
    var aer=r.hr&&r.zDist>400?(r.zMoving||r.inZone)/1000/r.zDist:0;
    openSheet('<div class="kz2s"><div class="kxp-h"><div><b>Zone 2 run</b><span>'+new Date(r.t).toLocaleString(undefined,{weekday:'long',hour:'numeric',minute:'2-digit'})+'</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +(r.hr?'<div class="kz2s-hero"><b>'+Math.round(r.inZone/60000)+'</b><span>minutes in Zone 2 ('+pct+'% of the run)</span></div>'
        :'<div class="kz2s-hero"><b>'+Math.round(r.dur/60000)+'</b><span>minutes by feel (no heart rate, so time in the zone was not measured)</span></div>')
      +'<div class="kz2-stats"><div><span>Time</span><b>'+mmss(r.dur)+'</b></div><div><span>Avg HR</span><b>'+(r.avg||'–')+'</b><i>'+(r.avg?'bpm':'')+'</i></div><div><span>Distance</span><b>'+(r.dist?distText(r.dist):'–')+'</b><i>'+(r.dist?unit():'')+'</i></div></div>'
      +(r.dist>200?'<div class="kz2-stats"><div><span>Avg pace</span><b>'+paceText(r.dur/1000/r.dist)+'</b><i>/'+unit()+'</i></div><div><span>Aerobic pace</span><b>'+(aer?paceText(aer):'–')+'</b><i>'+(aer?'/'+unit():'')+'</i></div><div><span>Above</span><b>'+(r.hr?Math.round(r.above/60000):'–')+'</b><i>'+(r.hr?'min':'')+'</i></div></div>':'')
      +(r.trace&&r.trace.length>2?'<div class="kz2s-tr">'+trace(r.trace,z,300,80)+'<span>Heart rate, with your Zone 2 band</span></div>':'')
      +'<div class="kz2s-wk">This week: <b>'+w.measured+'</b> of '+g+' min measured in Zone 2'+(w.feel?' · '+w.feel+' min by feel':'')+'.</div>'
      +'<button type="button" class="btn kxp-go" data-kfc="x">Done</button></div>');
  }

  /* ---------- the card on Workout, and the setup ---------- */
  function card(){
    var z=zone(), w=week(), g=goal(), L=runs(), last=L[L.length-1], ae=aerobic();
    var f=Math.min(1,w.measured/g), C=2*Math.PI*30;
    var trend=ae&&ae.then?Math.round(ae.then*per()-ae.now*per()):null;
    return '<div class="kv-card kz2c" id="kz2Card"><div class="kv-h"><span>ZONE 2</span><button type="button" class="kz2-link" data-z2="what">What is Zone 2?</button></div>'
      +'<div class="kz2c-row"><svg class="kz2c-ring" viewBox="0 0 72 72" aria-hidden="true" focusable="false"><circle cx="36" cy="36" r="30" class="trk"/><circle cx="36" cy="36" r="30" class="val" stroke-dasharray="'+(C*f).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 36 36)"/></svg>'
      +'<div class="kz2c-t"><b>'+w.measured+'<i> / '+g+' min</i></b><span>this week, measured in Zone 2'+(w.feel?' · '+w.feel+' by feel':'')+'</span><span>Your range: <b>'+z.lo+'–'+z.hi+' bpm</b></span></div></div>'
      +(last?'<div class="kz2c-last">Last run '+new Date(last.t).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})+': '+mmss(last.dur)+(last.hr?', '+Math.round(last.inZone/60000)+' min in zone':' by feel')+(last.dist?', '+distText(last.dist)+' '+unit():'')+'</div>'
        :'<div class="kz2c-last">No Zone 2 runs yet. Easy, conversational runs build the base every other kind of running sits on.</div>')
      +(ae&&trend!=null?'<div class="kz2c-last">Aerobic pace '+paceText(ae.now)+'/'+unit()+(trend>0?', '+trend+' s faster':trend<0?', '+(-trend)+' s slower':', same')+' than 3+ weeks ago.</div>':'')
      +'<div class="kl-acts kz2-acts"><div class="chip on km-cta" data-z2="go" role="button" tabindex="0">Start a Zone 2 run</div><div class="chip" data-z2="setup" role="button" tabindex="0">My range and goal</div></div></div>';
  }
  function goSheet(){
    var hrOk=window.KovaHR&&KovaHR.supported&&KovaHR.supported(), b=window.KovaHR&&KovaHR.bpm?KovaHR.bpm():0, z=zone();
    if(!window.openSheet) return;
    openSheet('<div class="kz2s"><div class="kxp-h"><div><b>Start a Zone 2 run</b><span>Your range: '+z.lo+'–'+z.hi+' bpm</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +'<div class="kz2s-p">'+(b?'Heart rate connected: '+b+' bpm.':hrOk?'Connect a Bluetooth heart-rate strap (Polar, Garmin, Wahoo, COROS) so Kova can keep you in the zone.':'This browser cannot connect a heart-rate strap (iPhone browsers cannot use Bluetooth). Kova will time the run and track the distance; keep it conversational, and the minutes count as by feel.')+'</div>'
      +(hrOk&&!b?'<button type="button" class="btn ghost kxp-go" data-z2="hr">Connect a heart-rate strap</button>':'')
      +'<button type="button" class="btn kxp-go" data-z2="startout">Outdoor run (GPS)</button>'
      +'<button type="button" class="btn ghost kxp-go" data-z2="startin">Treadmill or indoors</button>'
      +'<div class="kz2s-p kz2s-s">Kova asks for your location for distance and pace. Keep the app open while you run.</div></div>');
  }
  function whatSheet(){
    var z=zone();
    openSheet('<div class="kz2s"><div class="kxp-h"><div><b>What is Zone 2?</b><span>Easy enough to talk, hard enough to count</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +'<ul class="kxp-cues"><li>It is the steady, conversational effort: you can speak in full sentences, and you could keep going for a long time.</li>'
      +'<li>It builds the aerobic base: a stronger heart, more mitochondria, and more fat used for fuel. Faster running sits on top of it.</li>'
      +'<li>Most of an endurance runner’s week is easy: about 80% in well-trained athletes. Two or three Zone 2 runs a week is a good start.</li>'
      +'<li>Going too fast is the common mistake. If you cannot say a full sentence, slow down, even to a walk.</li></ul>'
      +'<div class="kxp-l">Your range</div><div class="kz2s-p"><b>'+z.lo+'–'+z.hi+' bpm.</b> '+esc(z.how)+(z.maf?' Another common rule, 180 minus your age, puts the top at '+z.maf+'.':'')+'</div>'
      +'<button type="button" class="btn ghost kxp-go" data-z2="setup">Change my range or weekly goal</button></div>');
  }
  function setupSheet(){
    var z=zone(), own=kp('z2zone',null), g=goal(), u=unit();
    openSheet('<div class="kz2s"><div class="kxp-h"><div><b>My range and goal</b><span>'+esc(z.how)+'</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +'<div class="kxp-l">Zone 2 range (bpm)</div><div class="kz2s-row"><label>From<input id="kz2Lo" type="number" inputmode="numeric" min="70" max="200" value="'+(own?own.lo:z.lo)+'"></label><label>To<input id="kz2Hi" type="number" inputmode="numeric" min="80" max="210" value="'+(own?own.hi:z.hi)+'"></label></div>'
      +'<div class="kz2s-p kz2s-s">Only change it if a test gave you a range (a lab test, or your first lactate threshold). Otherwise Kova works it out and keeps it up to date.</div>'
      +'<div class="kxp-l">Weekly goal</div><div class="kxp-gs">'+[90,120,150,180,240].map(function(m){ return '<button type="button" class="chip'+(m===g?' on':'')+'" data-z2="goal" data-m="'+m+'" aria-pressed="'+(m===g)+'">'+m+' min</button>'; }).join('')+'</div>'
      +'<div class="kxp-l">Distance in</div><div class="kxp-gs">'+['mi','km'].map(function(x){ return '<button type="button" class="chip'+(x===u?' on':'')+'" data-z2="unit" data-u="'+x+'" aria-pressed="'+(x===u)+'">'+(x==='mi'?'Miles':'Kilometres')+'</button>'; }).join('')+'</div>'
      +'<button type="button" class="btn kxp-go" data-z2="saveRange">Save my range</button>'+(own?'<button type="button" class="btn ghost kxp-go" data-z2="autoRange">Let Kova work it out</button>':'')+'</div>');
  }
  function decorate(){
    /* right under the Training card's buttons */
    var host=document.querySelector('#s-move .kl-acts:not(.kz2-acts)'); if(!host) return;
    var have=document.getElementById('kz2Card');
    var html=card();
    if(have){ if(have.__h!==html){ have.outerHTML=html; document.getElementById('kz2Card').__h=html; } return; }
    /* with no sessions the buttons sit inside the Training card; with sessions, under it */
    var after=host.closest('.kv-card')||host;
    after.insertAdjacentHTML('afterend',html); var n=document.getElementById('kz2Card'); if(n) n.__h=html;
  }
  var pend=0; function soon(){ if(pend) return; pend=setTimeout(function(){ pend=0; if(window.KovaPark&&KovaPark.quiet) KovaPark.quiet(decorate); else decorate(); },80); }

  function onClick(ev){
    var b=ev.target.closest&&ev.target.closest('[data-z2]'); if(!b) return;
    var a=b.getAttribute('data-z2');
    if(a==='go'){ goSheet(); return; }
    if(a==='what'){ whatSheet(); return; }
    if(a==='setup'){ setupSheet(); return; }
    if(a==='hr'){ if(window.KovaHR) KovaHR.connect(); setTimeout(function(){ if(document.querySelector('.kz2s')) goSheet(); },1500); return; }
    if(a==='startout'||a==='startin'){ if(window.closeSheet) closeSheet(); start(a==='startout'?'outdoor':'indoor'); return; }
    if(a==='pause'){ pause(); return; }
    if(a==='finish'){ var el2=R?Date.now()-R.t0-R.pausedMs:0; if(el2<60000&&!confirmShort()) return; finish(true); soon(); return; }
    if(a==='goal'){ kps('z2goal',+b.getAttribute('data-m')); setupSheet(); soon(); return; }
    if(a==='unit'){ try{ localStorage.setItem('kova.z2.unit',JSON.stringify(b.getAttribute('data-u'))); }catch(e){} setupSheet(); soon(); return; }
    if(a==='saveRange'){
      var lo=+(document.getElementById('kz2Lo')||{}).value, hi=+(document.getElementById('kz2Hi')||{}).value;
      if(!(lo>=70&&hi<=210&&hi-lo>=5)){ say('That range does not look right: the top should be at least 5 above the bottom.'); return; }
      kps('z2zone',{lo:lo,hi:hi,at:Date.now()}); say('Saved: Zone 2 is '+lo+'–'+hi+' bpm.'); if(window.closeSheet) closeSheet(); soon(); return;
    }
    if(a==='autoRange'){ kps('z2zone',null); if(window.closeSheet) closeSheet(); soon(); return; }
  }
  function confirmShort(){ if(R&&!R.askedShort){ R.askedShort=true; say('Under a minute so far: tap Finish again to end it without saving.'); return false; } finish(false); return false; }
  function onKey(ev){ var b=ev.target.closest&&ev.target.closest('[data-z2][role="button"]'); if(b&&(ev.key==='Enter'||ev.key===' ')){ ev.preventDefault(); b.click(); } }
  document.addEventListener('click',onClick); document.addEventListener('keydown',onKey);
  if(window.MutationObserver) new MutationObserver(function(ms){ for(var i=0;i<ms.length;i++){ var t=ms[i].target; if(!(t.closest&&t.closest('#kz2Card,#kz2,[data-kxd],[data-kxd-still]'))){ soon(); return; } } }).observe(document.body,{childList:true,subtree:true});
  soon();
  return {zone:zone,state:state,hav:hav,addPoint:addPoint,curPace:curPace,paceText:paceText,distText:distText,runs:runs,week:week,goal:goal,aerobic:aerobic,
    start:start,tick:tick,pause:pause,finish:finish,card:card,decorate:decorate,_R:function(){ return R; },unit:unit};
})();
