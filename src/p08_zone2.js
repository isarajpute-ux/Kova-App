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

   The run (p33b: the Zone 2 page, see below): your heart rate against
   the band (from a Bluetooth strap, see KovaHR) and the five zones, what
   to do (hold it, ease off, a touch faster) with a voice and a buzz when
   you drift for 10 seconds, time in each zone, distance, pace and a split
   every km or mile from GPS. The screen stays on (the browser stops GPS
   when it locks; the app says so). With no strap it is a talk-test run:
   the minutes count as "by feel", never as measured.

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


  /* ---------- the five zones (p33b) ----------
     Same method as the Zone 2 range: heart-rate reserve when Kova has your
     resting heart rate, else max heart rate; 50/60/70/80/90%. A Zone 2 you
     set moves its neighbours' edges with it. Below Zone 1 counts as Zone 1,
     above Zone 5 as Zone 5. */
  var ZN=[['Easy','#8FB3D9'],['Steady','#3DBE3A'],['Tempo','#E8C23A'],['Hard','#F08A3C'],['Max','#E5484D']], PCT=[.5,.6,.7,.8,.9,1];
  function zones(z){
    z=z||zone(); var mx=z.max, r=z.src==='hrr'||(z.src==='own'&&z.rest)?z.rest:0;
    var at=function(p){ return Math.round(r?r+p*(mx-r):p*mx); };
    var L=ZN.map(function(x,i){ return {k:i+1,n:'Zone '+(i+1),name:x[0],c:x[1],lo:at(PCT[i]),hi:at(PCT[i+1])}; });
    L[1].lo=z.lo; L[1].hi=z.hi; L[0].hi=z.lo; L[2].lo=z.hi; if(L[2].hi<=L[2].lo+3) L[2].hi=L[2].lo+8; if(L[3].lo<L[2].hi) L[3].lo=L[2].hi; if(L[3].hi<=L[3].lo+3) L[3].hi=L[3].lo+8; if(L[4].lo<L[3].hi) L[4].lo=L[3].hi; if(L[4].hi<=L[4].lo) L[4].hi=L[4].lo+8;
    return L;
  }
  function zi(b,Z){ if(!b) return -1; for(var i=4;i>=0;i--) if(b>=Z[i].lo) return i; return 0; }
  function sum(a){ return (a||[]).reduce(function(x,y){ return x+(+y||0); },0); }

  /* ---------- the live run ---------- */
  var R=null, iv=0, geo=null, wake=null;
  function voice(t){ try{ if(window.speechSynthesis&&lsJ('kova.z2.voice',true)){ var u=new SpeechSynthesisUtterance(t); u.rate=1.02; speechSynthesis.cancel(); speechSynthesis.speak(u); } }catch(e){} try{ if(navigator.vibrate) navigator.vibrate([90,60,90]); }catch(e){} }
  function lock(){ try{ if(navigator.wakeLock&&navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function(w){ wake=w; },function(){}); }catch(e){} }
  function onVis(){ if(R&&!document.hidden){ lock(); if(R.hiddenAt){ R.gap=(R.gap||0)+(Date.now()-R.hiddenAt); R.hiddenAt=0; } } else if(R&&document.hidden) R.hiddenAt=Date.now(); }
  function elapsed(t){ return R?Math.max(0,(t||Date.now())-R.t0-R.pausedMs-(R.paused?(t||Date.now())-R.pauseAt:0)):0; }
  /* a split each km or mile: its time, and the heart rate and zone over it */
  function splitCheck(p){
    if(!R||!R.split) return;
    while(R.dist>=R.split.next){
      var e=elapsed(p&&p.t), hs=R.split.hr, avg=hs.length?Math.round(sum(hs)/hs.length):0;
      R.splits.push({n:R.splits.length+1,ms:e-R.split.at,hr:avg,z:avg?zi(avg,R.Z)+1:0,u:unit()});
      R.split={next:R.split.next+per(),at:e,hr:[]};
    }
  }
  function start(mode){
    if(R) return R;
    var z=zone();
    R={t0:Date.now(),mode:mode||'outdoor',z:z,Z:zones(z),paused:false,pauseAt:0,pausedMs:0,inZone:0,above:0,below:0,none:0,zMoving:0,dist:0,zDist:0,pts:[],hr:[],
      zt:[0,0,0,0,0],splits:[],split:{next:per(),at:0,hr:[]},cur:'none',since:Date.now(),cued:'',last:Date.now()};
    P.last=null; P.tab='live';
    lock(); document.addEventListener('visibilitychange',onVis);
    if(R.mode==='outdoor'&&navigator.geolocation){
      try{ geo=navigator.geolocation.watchPosition(function(p){ if(!R) return; if(addPoint(R,{lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy||99,t:p.timestamp||Date.now()})) splitCheck({t:p.timestamp||Date.now()}); R.gps='on'; },
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
    if(b){ R.zt[zi(b,R.Z)]+=dt; R.split.hr.push(b); }
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
      avg:b.length?Math.round(sum(b)/b.length):0,max:b.length?Math.max.apply(null,b):0,zt:R.hasHR?R.zt.slice():[0,0,0,0,0],Z:R.Z.map(function(x){ return [x.lo,x.hi]; }),
      splits:R.splits.slice(0,60),u:unit(),
      dist:Math.round(R.dist),zDist:Math.round(R.zDist),zMoving:R.zMoving,trace:R.hr.filter(function(x,i){ return i%2===0; }).slice(-360).map(function(x){ return [Math.round((x[0]-R.t0)/1000),x[1]]; })};
    R=null;
    if(!keep||dur<60000){ if(keep) say('Under a minute, so it was not saved.'); close(); return null; }
    var L=runs(); L.push(run); kps('z2runs',L.slice(-80));
    track('zone2_done',{mins:Math.round(dur/60000),hr:run.hr});
    P.last=run; P.tab='zones';
    if(document.getElementById('kz2')) paint(); else open();
    soon();
    return run;
  }

  /* =====================================================================
     The Zone 2 page (p33b). The layout follows the owner's reference (a
     board of big rounded cards, a half-circle gauge, a timeline of three,
     a table, a large card with tabs, a big number, a small ring and
     Funnel / Bar / Pie / Line); the look is Kova's own: the frosted glass
     cards, Outfit, the outline icons, the dark brown Workout background
     and its orange, in dark, soft light and light glass. It sits inside
     the app so all of that applies. Every piece is your run:
       big card     Live / Zones / This week / Trend, and time in each of
                    the five zones (or your heart rate over the run)
       gauge        heart rate now against your Zone 2 band
       timeline     your last three km or mile splits: pace, zone
       table        past runs: date, Zone 2 minutes, distance
       bubble       what to do now
       bar          Outdoor or Treadmill, Start, Pause, Finish
     ===================================================================== */
  var P={tab:'week',chart:'funnel',last:null,mode:'outdoor'};
  var LABEL={in:['In Zone 2','Hold this. You could talk in full sentences.'],above:['Above Zone 2','Ease off: slow down or walk until it settles.'],below:['Below Zone 2','A touch faster, or keep it easy while you warm up.'],none:['By feel','No heart rate: keep it conversational. If you cannot say a full sentence, slow down.']};
  /* Kova's own outline icons (the sprite) plus two drawn the same way */
  function ic(id){ return '<svg class="ic" aria-hidden="true"><use href="#i-'+id+'"/></svg>'; }
  var FUNNEL='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v2.2a2 2 0 0 1-.6 1.4L15 12v7l-6 2v-8.5L4.5 7.6A2 2 0 0 1 4 6.2z"/></svg>';
  var PIE='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3.2a9 9 0 1 0 10.8 10.8 1 1 0 0 0-1-1H13a2 2 0 0 1-2-2V4.2a.9.9 0 0 0-1-1"/><path d="M15 3.5A9 9 0 0 1 20.5 9H16a1 1 0 0 1-1-1z"/></svg>';
  function ring(f,label){
    f=Math.max(0,Math.min(1,f||0)); var C=2*Math.PI*15;
    return '<svg class="kz2p-ring" viewBox="0 0 36 36" role="img" aria-label="'+esc(label)+' chart"><circle cx="18" cy="18" r="15" class="t"/><circle cx="18" cy="18" r="15" class="v" stroke-dasharray="'+(C*f).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 18 18)"/></svg>';
  }
  function pin(){ return '<span class="kz2p-pin" aria-hidden="true"></span>'; }
  function tag(text,k){ return '<span class="chip kz2p-tag"><i class="zd z'+(k||2)+'"></i>'+esc(text)+'</span>'; }
  function edit(act,label){ return '<button type="button" class="iconbtn kz2p-ed" data-z2="'+act+'" aria-label="'+esc(label)+'">'+ic('pencil')+'</button>'; }
  function head(label,k,tagText,act,actLabel,icon){
    return '<div class="kz2p-ch2">'+(icon?'<span class="kz2p-ic">'+ic(icon)+'</span>':'')+'<span class="kz2p-k">'+esc(label)+pin()+'</span>'+(tagText?tag(tagText,k):'')+(act?edit(act,actLabel):'')+'</div>';
  }

  /* what the charts show: this run, the run just saved, or this week */
  function scope(){
    if(R) return {label:'This run',zt:R.zt,trace:R.hr.map(function(x){ return [(x[0]-R.t0)/1000,x[1]]; }),dur:elapsed(),Z:R.Z,hr:!!R.hasHR};
    if(P.last) return {label:'This run',zt:P.last.zt||[0,0,0,0,0],trace:P.last.trace||[],dur:P.last.dur,Z:zones(),hr:P.last.hr};
    var s=weekStart(), L=runs().filter(function(r){ return r.t>=s&&r.hr; }), zt=[0,0,0,0,0];
    L.forEach(function(r){ (r.zt||[0,r.inZone||0,0,0,0]).forEach(function(v,i){ zt[i]+=v||0; }); });
    var last=runs().filter(function(r){ return r.hr&&r.trace&&r.trace.length; }).slice(-1)[0];
    return {label:'This week',zt:zt,trace:last?last.trace:[],dur:sum(zt),Z:zones(),hr:L.length>0,lineLabel:last?'Your last run':''};
  }
  /* the five zones in Kova's colours: graphite steps, Zone 2 in Workout's orange */
  function chart(sc){
    var Z=sc.Z, tot=sum(sc.zt), fr=function(i){ return tot?sc.zt[i]/tot:0; };
    if(!sc.hr&&P.chart!=='line') return '<div class="kz2p-empty">'+(R?'Connect a heart-rate strap to see time in each zone.':'Time in each zone shows here after a run with a heart-rate strap.')+'</div>';
    if(P.chart==='funnel'){
      var h='', y=24;
      Z.forEach(function(z,i){ var w=70+fr(i)*190, hh=w*0.26, cy=(y+hh/2).toFixed(1); h+='<ellipse class="z'+(i+1)+'" cx="150" cy="'+cy+'" rx="'+(w/2).toFixed(1)+'" ry="'+(hh/2).toFixed(1)+'"/>'
        +'<circle class="dt" cx="150" cy="'+cy+'" r="3.5"/><path class="ld" d="M156,'+cy+' H330"/>'
        +'<text class="v'+(i===1?' a':'')+'" x="340" y="'+(y+hh/2-2).toFixed(1)+'">'+mmss(sc.zt[i])+'</text><text class="l" x="340" y="'+(y+hh/2+15).toFixed(1)+'">'+z.n+' · '+z.lo+'–'+z.hi+'</text>'; y+=Math.max(hh,34)+10; });
      return '<svg class="kz2p-ch" viewBox="0 0 470 '+(y+8)+'" role="img" aria-label="Time in each zone, funnel chart">'+h+'</svg>';
    }
    if(P.chart==='bar'){
      var mx=Math.max.apply(null,sc.zt.concat([1])), b='';
      Z.forEach(function(z,i){ var bh=sc.zt[i]/mx*150, x=24+i*88; b+='<rect class="z'+(i+1)+'" x="'+x+'" y="'+(180-bh).toFixed(1)+'" width="56" height="'+Math.max(2,bh).toFixed(1)+'" rx="14"/>'
        +'<text class="v'+(i===1?' a':'')+'" x="'+(x+28)+'" y="'+(170-bh).toFixed(1)+'" text-anchor="middle">'+mmss(sc.zt[i])+'</text><text class="l" x="'+(x+28)+'" y="202" text-anchor="middle">Z'+(i+1)+'</text>'; });
      return '<svg class="kz2p-ch" viewBox="0 0 470 210" role="img" aria-label="Time in each zone, bar chart">'+b+'</svg>';
    }
    if(P.chart==='pie'){
      var a0=-Math.PI/2, p='', lg='', r=80, w=26;
      Z.forEach(function(z,i){ var f=fr(i); if(f>0){ var a1=a0+f*2*Math.PI-0.03, big=f>.5?1:0, x0=110+r*Math.cos(a0), y0=110+r*Math.sin(a0), x1=110+r*Math.cos(a1), y1=110+r*Math.sin(a1);
          p+=f>=0.999?'<circle class="sl z'+(i+1)+'" cx="110" cy="110" r="'+r+'" style="stroke-width:'+w+'"/>':'<path class="sl z'+(i+1)+'" style="stroke-width:'+w+'" d="M'+x0.toFixed(1)+','+y0.toFixed(1)+' A'+r+','+r+' 0 '+big+',1 '+x1.toFixed(1)+','+y1.toFixed(1)+'"/>'; a0=a1+0.03; }
        lg+='<g transform="translate(232,'+(28+i*36)+')"><circle class="z'+(i+1)+'" r="6" cx="7" cy="-4"/><text class="v'+(i===1?' a':'')+'" x="22" y="0">'+Math.round(fr(i)*100)+'%</text><text class="l" x="78" y="0">'+z.n+' · '+z.name+'</text></g>'; });
      return '<svg class="kz2p-ch" viewBox="0 0 470 220" role="img" aria-label="Share of time in each zone, pie chart"><circle class="pbg" cx="110" cy="110" r="'+r+'" style="stroke-width:'+w+'"/>'+p+lg+'</svg>';
    }
    var T=sc.trace||[];
    if(T.length<2) return '<div class="kz2p-empty">'+(R?'Your heart rate draws here as you run.':'Your heart rate over a run shows here after a run with a heart-rate strap.')+'</div>';
    var t1=T[T.length-1][0]||1, lo=Z[0].lo-8, hi=Z[4].hi, W=470, H=200, yv=function(v){ return Math.max(4,Math.min(H-4,H-4-(v-lo)/(hi-lo)*(H-8))); };
    var bands=Z.map(function(z,i){ return '<rect class="bd'+(i===1?' a':'')+'" x="0" y="'+yv(z.hi).toFixed(1)+'" width="'+W+'" height="'+(yv(z.lo)-yv(z.hi)).toFixed(1)+'"/><text class="l" x="'+(W-6)+'" y="'+(yv(z.lo)-4).toFixed(1)+'" text-anchor="end">Z'+(i+1)+'</text>'; }).join('');
    return '<svg class="kz2p-ch" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Heart rate over '+(sc.lineLabel?'your last run':'the run')+' with the five zones, line chart">'+bands
      +'<path class="hl" d="M'+T.map(function(p){ return (p[0]/t1*W).toFixed(1)+','+yv(p[1]).toFixed(1); }).join('L')+'"/></svg>';
  }
  function hero(){
    var sc=scope(), w=week(), g=goal(), ae=aerobic(), b=R&&window.KovaHR&&KovaHR.bpm?KovaHR.bpm():0, z2=sc.zt[1]||0;
    var big, unitTxt='', cap, pv, pl;
    if(P.tab==='live'){
      var shown=R?b:(P.last&&P.last.avg)||0;
      big=shown?String(shown):'–'; unitTxt=shown?'bpm':''; cap=R?(b?(sc.Z[zi(b,sc.Z)].n+' · '+sc.Z[zi(b,sc.Z)].name+' now'):'No heart rate yet'):(P.last&&P.last.avg?'Average heart rate, this run':'Your heart rate shows here once you start');
      pv=sc.dur?z2/sc.dur:0; pl='In Zone 2';
    } else if(P.tab==='zones'){
      big=mmss(z2); cap='In Zone 2 · '+sc.label.toLowerCase(); pv=sc.dur?z2/sc.dur:0; pl='Of the time';
    } else if(P.tab==='week'){
      big=String(w.measured); unitTxt='min'; cap='Of '+g+' min this week'+(w.feel?' · '+w.feel+' by feel':''); pv=w.measured/g; pl='Goal';
    } else {
      big=ae?paceText(ae.now):'–'; unitTxt=ae?'/'+unit():''; var tr=ae&&ae.then?Math.round(ae.then*per()-ae.now*per()):null;
      cap=ae?('Aerobic pace'+(tr!=null?(tr>0?' · '+tr+' s faster':tr<0?' · '+(-tr)+' s slower':' · the same')+' than 3+ weeks ago':'')):'Aerobic pace, after a 5-minute run in the zone'; pv=Math.min(1,runs().length/12); pl=runs().length+' runs';
    }
    var tabs=[['live','Live'],['zones','Zones'],['week','This week'],['trend','Trend']];
    var pills=[['funnel','Funnel',FUNNEL],['bar','Bar',ic('chart-bar')],['pie','Pie',PIE],['line','Line',ic('chart-line')]];
    return '<section class="card kz2p-hero" aria-label="Zone 2 run">'
      +'<div class="kz2p-hh"><span class="kz2p-ic">'+ic('bolt')+'</span><span class="kz2p-k">ZONE 2 RUN'+pin()+'</span></div>'
      +'<div class="kz2p-tabs" role="tablist">'+tabs.map(function(t){ return '<button type="button" role="tab" class="'+(P.tab===t[0]?'on':'')+'" aria-selected="'+(P.tab===t[0])+'" data-z2="tab" data-v="'+t[0]+'">'+t[1]+'</button>'; }).join('')+'</div>'
      +'<div class="kz2p-big"><div><div class="kz2p-num">'+esc(big)+(unitTxt?'<i>'+esc(unitTxt)+'</i>':'')+'</div><span>'+esc(cap)+'</span></div><div class="kz2p-pv">'+ring(pv,pl)+'<div><b>'+Math.round(Math.max(0,Math.min(1,pv))*100)+'%</b><span>'+esc(pl)+'</span></div></div></div>'
      +'<div class="kz2p-pills" role="group" aria-label="Chart">'+pills.map(function(p){ return '<button type="button" class="chip'+(P.chart===p[0]?' on':'')+'" aria-pressed="'+(P.chart===p[0])+'" data-z2="chart" data-v="'+p[0]+'">'+p[2]+'<span>'+p[1]+'</span></button>'; }).join('')+'</div>'
      +'<div class="kz2p-scope">'+esc((P.chart==='line'&&sc.lineLabel?sc.lineLabel:sc.label).toUpperCase())+'</div>'+chart(sc)+'</section>';
  }
  function gauge(){
    var Z=R?R.Z:zones(), b=R&&window.KovaHR&&KovaHR.bpm?KovaHR.bpm():0, show=R?b:(P.last&&P.last.avg)||0, i=show?zi(show,Z):1;
    var lo=Z[0].lo, hi=Z[3].hi, x=function(v){ return 20+Math.max(0,Math.min(1,(v-lo)/(hi-lo)))*260; };
    var a=x(Z[1].lo), c=x(Z[1].hi), r=(c-a)/2, dome=show?x(show):0;
    var hrOk=window.KovaHR&&(KovaHR.supported&&KovaHR.supported()||(window.KovaNative&&KovaNative.hasLiveHR&&KovaNative.hasLiveHR()));
    return '<section class="card kz2p-card kz2p-gauge" aria-label="Heart rate">'
      +head('HEART RATE',show?i+1:2,show?Z[i].n+' · '+Z[i].name:'Zone 2 target','setup','Change my range and goal')
      +'<div class="kz2p-gv">'+ring(show?Math.min(1,(show-lo)/(hi-lo)):0,'Heart rate on the zone scale')+'<div><b>'+(show||'–')+' <i>bpm</i></b><span>'+(R?'Now':P.last?'Average, this run':'Your Zone 2 band: '+Z[1].lo+'–'+Z[1].hi)+'</span></div></div>'
      +'<svg class="kz2p-g" viewBox="0 0 300 170" role="img" aria-label="Heart rate '+(show||'none')+' against Zone 2, '+Z[1].lo+' to '+Z[1].hi+', chart">'
        +'<path class="dash" d="M20,140 A'+((a-20)/2).toFixed(1)+','+((a-20)/2).toFixed(1)+' 0 0,1 '+a.toFixed(1)+',140"/>'
        +'<path class="arc" d="M'+a.toFixed(1)+',140 A'+r.toFixed(1)+','+r.toFixed(1)+' 0 0,1 '+c.toFixed(1)+',140"/>'
        +(show?'<path class="dome" d="M'+(dome-22).toFixed(1)+',140 A22,22 0 0,1 '+(dome+22).toFixed(1)+',140 Z"/>':'')
        +'<path class="ax" d="M20,140 H280"/><circle class="end" cx="20" cy="140" r="4.5"/><circle class="end" cx="280" cy="140" r="4.5"/>'
        +'<circle class="mk a" cx="'+a.toFixed(1)+'" cy="140" r="4.5"/><circle class="mk a" cx="'+c.toFixed(1)+'" cy="140" r="4.5"/>'+(show?'<circle class="mk" cx="'+dome.toFixed(1)+'" cy="140" r="4"/>':'')
        +'<text x="'+a.toFixed(1)+'" y="164" text-anchor="middle">'+Z[1].lo+'</text><text x="'+c.toFixed(1)+'" y="164" text-anchor="middle">'+Z[1].hi+'</text><text x="'+x(Z[3].lo).toFixed(1)+'" y="164" text-anchor="middle">'+Z[3].lo+'</text></svg>'
      +((!b&&hrOk&&(R||!P.last))?'<button type="button" class="kz2p-link" data-z2="hr">Connect a heart-rate strap</button>':(!hrOk&&!R&&!P.last?'<div class="kz2p-note">This browser cannot use a heart-rate strap (iPhone browsers have no Bluetooth). Runs here count as by feel.</div>':''))
      +'</section>';
  }
  function splits(){
    var S=R?R.splits:(P.last?P.last.splits:(runs().filter(function(r){ return r.splits&&r.splits.length; }).slice(-1)[0]||{}).splits)||[];
    var L=S.slice(-3), best=L.reduce(function(a,s){ return !a||s.ms<a.ms?s:a; },null), xs=[110,270,430];
    var spm=function(s){ return s.ms/1000/(s.u==='km'?1000:1609.344); };
    var gpsNote=R?(R.mode==='indoor'?'Treadmill: no GPS, so no splits':R.gps==='denied'?'Location is off for Kova, so no distance':R.gps==='none'?'This browser has no GPS':R.gps==='waiting'?'Finding GPS…':R.gps==='lost'?'GPS lost, trying again':''):'';
    var nodes=xs.map(function(xx,i){ var s=L[i], on=s&&s===best;
      return '<g class="nd'+(on?' on':'')+'"><path class="vd" d="M'+xx+',62 V238"/><circle class="oc" cx="'+xx+'" cy="104" r="4.5"/><circle class="oc" cx="'+xx+'" cy="196" r="4.5"/>'
        +'<circle class="rg" cx="'+xx+'" cy="150" r="38"/><circle class="in" cx="'+xx+'" cy="150" r="24"/><circle class="dt" cx="'+xx+'" cy="150" r="5.5"/>'
        +(s?'<g class="pl" transform="translate('+(xx-58)+',22)"><rect width="116" height="32" rx="16"/><circle class="z'+(s.z||1)+'" cx="18" cy="16" r="5.5"/><text x="30" y="21">'+(s.u==='km'?'Km ':'Mi ')+s.n+(s.z?' · Z'+s.z:'')+'</text></g>':'')
        +'<text class="v'+(on?' a':'')+'" x="'+xx+'" y="276" text-anchor="middle">'+(s?paceText(spm(s)):'–')+'</text></g>'; }).join('');
    return '<section class="card kz2p-card kz2p-splits" aria-label="Splits">'+head('YOUR LAST 3 SPLITS',2,'per '+unit(),'unit','Switch between miles and kilometres','trophy')
      +'<svg class="kz2p-tl" viewBox="0 0 540 290" role="img" aria-label="'+(L.length?'Pace of your last '+L.length+' splits: '+L.map(function(s){ return paceText(spm(s)); }).join(', '):'No splits yet')+', chart"><path class="ln" d="M20,150 H520"/><circle class="end" cx="20" cy="150" r="4.5"/><circle class="end" cx="520" cy="150" r="4.5"/>'+nodes+'</svg>'
      +'<div class="kz2p-note">'+esc(gpsNote||(L.length?'Pace per '+unit()+'. The fastest is lit.':'A split every '+(unit()==='km'?'kilometre':'mile')+' on an outdoor run.'))+'</div></section>';
  }
  function history(){
    var L=runs().slice(-3).reverse();
    return '<section class="card kz2p-card kz2p-hist" aria-label="Past runs">'+head('PAST RUNS',2,runs().length+' run'+(runs().length===1?'':'s'),'all','See every run')
      +'<div class="kz2p-tb" role="table"><div class="th" role="row"><span role="columnheader">Date</span><span role="columnheader">Zone 2</span><span role="columnheader">Distance</span></div>'
      +(L.length?L.map(function(r){ return '<div class="tr" role="row"><span role="cell">'+new Date(r.t).toLocaleDateString(undefined,{day:'2-digit',month:'2-digit',year:'numeric'})+'</span><span role="cell"><em class="kz2p-chip">'+(r.hr?Math.round(r.inZone/60000)+' min':Math.round(r.dur/60000)+' min by feel')+'</em></span><span role="cell"><b>'+(r.dist?(r.dist/per()).toFixed(2)+' '+unit():mmss(r.dur))+'</b></span></div>'; }).join('')
        :'<div class="tr none" role="row"><span role="cell">Your runs show here.</span></div>')+'</div></section>';
  }
  function bar(){
    if(R){ var pc=R.mode==='outdoor'?curPace(R):0;
      return '<div class="kz2p-bar" role="group" aria-label="Run controls"><span class="kz2p-t">'+mmss(elapsed())+(R.paused?' · paused':'')
        +'<small>'+(R.mode==='outdoor'?distText(R.dist)+' '+unit()+' · '+(pc?paceText(pc):'–')+' /'+unit():'Treadmill')+'</small></span>'
        +'<button type="button" class="chip kz2p-c" data-z2="pause" aria-label="'+(R.paused?'Resume':'Pause')+'">'+(R.paused?ic('player-play'):'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>')+'<span>'+(R.paused?'Resume':'Pause')+'</span></button>'
        +'<button type="button" class="kz2p-go" data-z2="finish" aria-label="Finish">'+ic('flag')+'<span>Finish</span></button></div>'; }
    if(P.last) return '<div class="kz2p-bar" role="group" aria-label="Run controls"><span class="kz2p-t">Saved</span><button type="button" class="chip kz2p-c" data-z2="new" aria-label="Start another run">'+ic('plus')+'<span>New run</span></button>'
      +'<button type="button" class="kz2p-go" data-z2="close" aria-label="Done">'+ic('check')+'<span>Done</span></button></div>';
    return '<div class="kz2p-bar" role="group" aria-label="Run controls">'
      +'<button type="button" class="chip kz2p-c'+(P.mode==='outdoor'?' on':'')+'" data-z2="mode" data-v="outdoor" aria-pressed="'+(P.mode==='outdoor')+'">'+ic('route')+'<span>Outdoor</span></button>'
      +'<button type="button" class="chip kz2p-c'+(P.mode==='indoor'?' on':'')+'" data-z2="mode" data-v="indoor" aria-pressed="'+(P.mode==='indoor')+'">'+ic('run')+'<span>Treadmill</span></button>'
      +'<button type="button" class="kz2p-go" data-z2="start" aria-label="Start a Zone 2 run">'+ic('player-play')+'<span>Start</span></button></div>';
  }
  function cue(){
    if(R){ var b=window.KovaHR&&KovaHR.bpm?KovaHR.bpm():0, s=state(b,R.z); return [LABEL[s][0],LABEL[s][1],s]; }
    if(P.last){ var w=week(); return ['Saved',w.measured+' of '+goal()+' min measured in Zone 2 this week'+(w.feel?', '+w.feel+' by feel':'')+'.','in']; }
    return ['Zone 2','Easy enough to talk in full sentences. That is the whole trick.','idle'];
  }
  function page(){
    var z=zone(), c=cue(), d=new Date();
    return '<div class="kz2p-in">'
      +'<div class="hdr kz2p-hd"><div class="hdr-l"><button type="button" class="back" data-z2="close" aria-label="'+(R?'Back (the run keeps going)':'Back')+'">'+ic('chevron-left')+'</button>'
        +'<div><div class="kz2p-eye">'+d.toLocaleDateString(undefined,{weekday:'long'}).toUpperCase()+' · '+z.lo+'–'+z.hi+' BPM</div><div class="title">Zone 2 run</div></div></div>'
        +'<div class="hdr-r"><button type="button" class="iconbtn kz2p-help" data-z2="tour" aria-label="Show me around Zone 2">?</button><button type="button" class="iconbtn" data-z2="what" aria-label="What is Zone 2?">'+ic('info-circle')+'</button></div></div>'
      +'<div class="kz2p-say s-'+c[2]+'" aria-live="polite"><b>'+esc(c[0])+'</b> '+esc(c[1])+'</div>'
      +'<div class="kz2p-grid">'+hero()+gauge()+splits()+history()+'</div>'
      +bar()+'<div class="kz2p-foot">'+(R?'Keep Kova open: the screen stays on, because phones stop GPS in a locked browser.':'Kova asks for your location on an outdoor run, for distance and pace.')+'</div></div>';
  }
  /* the page's own tour (the owner's rule: every new part is shown around),
     once the first time it opens, and from the ? any time; it sits above
     the page */
  var TOUR=[
    ['.kz2p-hero','Your run, live','Your heart rate, your time in Zone 2, this week and your trend. The tabs switch between them.'],
    ['.kz2p-pills','Five zones, four ways','Funnel, Bar, Pie or Line: time in each of the five heart-rate zones, or your heart rate over the run.'],
    ['.kz2p-gauge','Heart rate against Zone 2','The orange arc is your Zone 2 band. The pencil changes your range, if a test gave you one.'],
    ['.kz2p-splits','Your splits','Pace for every kilometre or mile, the fastest lit. The pencil switches between the two.'],
    ['.kz2p-hist','Past runs','Every run with its Zone 2 minutes. The pencil lists them all.'],
    ['.kz2p-bar','Start here','Outdoor uses GPS for distance and pace; Treadmill does not. Then Start. Pause and Finish appear while you run.']
  ];
  function tour(){
    if(!window.KovaTour||!document.getElementById('kz2')) return false;
    var on=document.querySelector('.screen.on'), sc=on?[on.id.replace(/^s-/,'')]:[];
    KovaTour.run(TOUR.map(function(t){ return {t:t[1],d:t[2],el:function(){ return document.querySelector('#kz2 '+t[0]); }}; }),{color:'#E87A3C',screens:sc});
    var ov=document.getElementById('ksTour'); if(ov) ov.style.zIndex='9700';
    track('zone2_tour',{});
    return true;
  }
  /* inside the app, so Kova's glass, fonts, icons and three looks all apply */
  function open(){
    var el=document.getElementById('kz2');
    if(!el){ el=document.createElement('div'); el.id='kz2'; el.className='kz2p'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); el.setAttribute('aria-label','Zone 2 run');
      (document.getElementById('app')||document.body).appendChild(el);
      if(!R&&window.KovaTour&&KovaTour.canRemember()&&KovaTour.once('zone2page')) setTimeout(tour,700); }
    paint();
  }
  function close(){ var el=document.getElementById('kz2'); if(el) el.remove(); }
  function paint(){
    var el=document.getElementById('kz2'); if(!el) return;
    var a=document.activeElement, key=a&&el.contains(a)&&a.getAttribute('data-z2')?a.getAttribute('data-z2')+'|'+(a.getAttribute('data-v')||''):'', sc=el.scrollTop;
    el.innerHTML=page(); el.scrollTop=sc;
    if(key){ var k=key.split('|'), b=el.querySelector('[data-z2="'+k[0]+'"]'+(k[1]?'[data-v="'+k[1]+'"]':'')); if(b) try{ b.focus({preventScroll:true}); }catch(e){} }
  }

  /* ---------- the card on Workout, and the sheets ---------- */
  function card(){
    var z=zone(), w=week(), g=goal(), L=runs(), last=L[L.length-1], ae=aerobic();
    var trend=ae&&ae.then?Math.round(ae.then*per()-ae.now*per()):null;
    return '<div class="kv-card kz2c" id="kz2Card"><div class="kv-h"><span>ZONE 2</span><button type="button" class="kz2c-q" data-z2="what" aria-label="What is Zone 2?">'+ic('info-circle')+'</button></div>'
      +'<div class="kz2c-row"><div><div class="kz2p-num sm">'+w.measured+'<i>/ '+g+' min</i></div><span>this week, measured in Zone 2'+(w.feel?' \u00b7 '+w.feel+' by feel':'')+'</span></div><div class="kz2p-pv">'+ring(w.measured/g,'Weekly Zone 2 goal')+'<div><b>'+z.lo+'\u2013'+z.hi+'</b><span>bpm</span></div></div></div>'
      +(R?'<div class="kz2c-last">A run is going: '+mmss(elapsed())+'.</div>':last?'<div class="kz2c-last">Last run '+new Date(last.t).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})+': '+mmss(last.dur)+(last.hr?', '+Math.round(last.inZone/60000)+' min in zone':' by feel')+(last.dist?', '+distText(last.dist)+' '+unit():'')+(trend!=null?'. Aerobic pace '+(trend>0?trend+' s faster':trend<0?(-trend)+' s slower':'the same')+' than 3+ weeks ago':'')+'.</div>'
        :'<div class="kz2c-last">No Zone 2 runs yet. Easy, conversational runs build the base every other kind of running sits on.</div>')
      +'<div class="kl-acts kz2-acts"><div class="chip on km-cta" data-z2="go" role="button" tabindex="0">'+(R?'Back to my run':'Open Zone 2')+'</div><div class="chip" data-z2="setup" role="button" tabindex="0">My range and goal</div></div></div>';
  }
  function whatSheet(){
    var z=zone(), Z=zones(z);
    openSheet('<div class="kz2s"><div class="kxp-h"><div><b>What is Zone 2?</b><span>Easy enough to talk, hard enough to count</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +'<ul class="kxp-cues"><li>It is the steady, conversational effort: you can speak in full sentences, and you could keep going for a long time.</li>'
      +'<li>It builds the aerobic base: a stronger heart, more mitochondria, and more fat used for fuel. Faster running sits on top of it.</li>'
      +'<li>Most of an endurance runner’s week is easy: about 80% in well-trained athletes. Two or three Zone 2 runs a week is a good start.</li>'
      +'<li>Going too fast is the common mistake. If you cannot say a full sentence, slow down, even to a walk.</li></ul>'
      +'<div class="kxp-l">Your five zones</div><div class="kz2s-zs">'+Z.map(function(x){ return '<div class="'+(x.k===2?'on':'')+'"><i class="zd z'+x.k+'"></i><b>'+x.n+'</b><span>'+x.name+'</span><em>'+x.lo+'–'+x.hi+' bpm</em></div>'; }).join('')+'</div>'
      +'<div class="kz2s-p">'+esc(z.how)+(z.maf?' Another common rule, 180 minus your age, puts the top of Zone 2 at '+z.maf+'.':'')+'</div>'
      +'<button type="button" class="btn ghost kxp-go" data-z2="setup">Change my range or weekly goal</button></div>');
  }
  function setupSheet(){
    var z=zone(), own=kp('z2zone',null), g=goal(), u=unit();
    openSheet('<div class="kz2s"><div class="kxp-h"><div><b>My range and goal</b><span>'+esc(z.how)+'</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +'<div class="kxp-l">Zone 2 range (bpm)</div><div class="kz2s-row"><label>From<input id="kz2Lo" type="number" inputmode="numeric" min="70" max="200" value="'+(own?own.lo:z.lo)+'"></label><label>To<input id="kz2Hi" type="number" inputmode="numeric" min="80" max="210" value="'+(own?own.hi:z.hi)+'"></label></div>'
      +'<div class="kz2s-p kz2s-s">Only change it if a test gave you a range (a lab test, or your first lactate threshold). Otherwise Kova works it out and keeps it up to date.</div>'
      +'<div class="kxp-l">Weekly goal</div><div class="kxp-gs">'+[90,120,150,180,240].map(function(m){ return '<button type="button" class="chip'+(m===g?' on':'')+'" data-z2="goal" data-m="'+m+'" aria-pressed="'+(m===g)+'">'+m+' min</button>'; }).join('')+'</div>'
      +'<div class="kxp-l">Distance in</div><div class="kxp-gs">'+['mi','km'].map(function(x){ return '<button type="button" class="chip'+(x===u?' on':'')+'" data-z2="unitset" data-u="'+x+'" aria-pressed="'+(x===u)+'">'+(x==='mi'?'Miles':'Kilometres')+'</button>'; }).join('')+'</div>'
      +'<button type="button" class="btn kxp-go" data-z2="saveRange">Save my range</button>'+(own?'<button type="button" class="btn ghost kxp-go" data-z2="autoRange">Let Kova work it out</button>':'')+'</div>');
  }
  function allSheet(){
    var L=runs().slice().reverse();
    openSheet('<div class="kz2s"><div class="kxp-h"><div><b>Every Zone 2 run</b><span>'+L.length+' saved</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +(L.length?'<div class="kz2p-tb"><div class="th"><span>Date</span><span>Zone 2</span><span>Time</span><span>Distance</span></div>'+L.map(function(r){ return '<div class="tr"><span>'+new Date(r.t).toLocaleDateString(undefined,{day:'2-digit',month:'2-digit',year:'numeric'})+'</span><span><em class="chip">'+(r.hr?Math.round(r.inZone/60000)+' min':'by feel')+'</em></span><span>'+mmss(r.dur)+'</span><span><b>'+(r.dist?(r.dist/per()).toFixed(2)+' '+unit():'–')+'</b></span></div>'; }).join('')+'</div>'
        :'<div class="kxp-none">No runs yet.</div>')+'</div>');
  }
  function decorate(){
    /* right under the Training card */
    var host=document.querySelector('#s-move .kl-acts:not(.kz2-acts):not(.krc-acts)'); if(!host) return;
    var have=document.getElementById('kz2Card'), html=card();
    if(have){ if(have.__h!==html){ have.outerHTML=html; var n0=document.getElementById('kz2Card'); if(n0) n0.__h=html; } return; }
    var after=document.getElementById('krsCard')||document.getElementById('krcCard')||host.closest('.kv-card')||host;
    after.insertAdjacentHTML('afterend',html); var n=document.getElementById('kz2Card'); if(n) n.__h=html;
  }
  var pend=0; function soon(){ if(pend) return; pend=setTimeout(function(){ pend=0; if(window.KovaPark&&KovaPark.quiet) KovaPark.quiet(decorate); else decorate(); },80); }

  function onClick(ev){
    var b=ev.target.closest&&ev.target.closest('[data-z2]'); if(!b) return;
    var a=b.getAttribute('data-z2'), v=b.getAttribute('data-v');
    if(a==='go'){ if(window.closeSheet) closeSheet(); open(); return; }
    if(a==='tab'){ P.tab=v; paint(); return; }
    if(a==='chart'){ P.chart=v; paint(); return; }
    if(a==='mode'){ P.mode=v; paint(); return; }
    if(a==='start'){ start(P.mode); return; }
    if(a==='new'){ P.last=null; P.tab='week'; paint(); return; }
    if(a==='close'){ close(); soon(); return; }
    if(a==='what'){ whatSheet(); return; }
    if(a==='tour'){ tour(); return; }
    if(a==='setup'){ setupSheet(); return; }
    if(a==='all'){ allSheet(); return; }
    if(a==='unit'){ try{ localStorage.setItem('kova.z2.unit',JSON.stringify(unit()==='km'?'mi':'km')); }catch(e){} paint(); soon(); return; }
    if(a==='hr'){ if(window.KovaHR) KovaHR.connect(); setTimeout(paint,1500); return; }
    if(a==='pause'){ pause(); return; }
    if(a==='finish'){ var el2=R?elapsed():0; if(el2<60000&&!confirmShort()) return; finish(true); return; }
    if(a==='goal'){ kps('z2goal',+b.getAttribute('data-m')); setupSheet(); soon(); paint(); return; }
    if(a==='unitset'){ try{ localStorage.setItem('kova.z2.unit',JSON.stringify(b.getAttribute('data-u'))); }catch(e){} setupSheet(); soon(); paint(); return; }
    if(a==='saveRange'){
      var lo=+(document.getElementById('kz2Lo')||{}).value, hi=+(document.getElementById('kz2Hi')||{}).value;
      if(!(lo>=70&&hi<=210&&hi-lo>=5)){ say('That range does not look right: the top should be at least 5 above the bottom.'); return; }
      kps('z2zone',{lo:lo,hi:hi,at:Date.now()}); say('Saved: Zone 2 is '+lo+'–'+hi+' bpm.'); if(window.closeSheet) closeSheet(); soon(); paint(); return;
    }
    if(a==='autoRange'){ kps('z2zone',null); if(window.closeSheet) closeSheet(); soon(); paint(); return; }
  }
  function confirmShort(){ if(R&&!R.askedShort){ R.askedShort=true; say('Under a minute so far: tap Finish again to end it without saving.'); return false; } finish(false); return false; }
  function onKey(ev){
    var b=ev.target.closest&&ev.target.closest('[data-z2][role="button"]'); if(b&&(ev.key==='Enter'||ev.key===' ')){ ev.preventDefault(); b.click(); return; }
    if(ev.key==='Escape'&&document.getElementById('kz2')&&!document.querySelector('#sheet.on')){ close(); soon(); }
  }
  document.addEventListener('click',onClick); document.addEventListener('keydown',onKey);
  if(window.MutationObserver) new MutationObserver(function(ms){ for(var i=0;i<ms.length;i++){ var t=ms[i].target; if(!(t.closest&&t.closest('#kz2Card,#kz2,[data-kxd],[data-kxd-still]'))){ soon(); return; } } }).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('kova:screen',soon);
  setInterval(function(){ if(R&&document.getElementById('kz2Card')) soon(); },15000);
  soon();
  return {zone:zone,zones:zones,zi:zi,state:state,hav:hav,addPoint:addPoint,curPace:curPace,paceText:paceText,distText:distText,runs:runs,week:week,goal:goal,aerobic:aerobic,
    start:start,tick:tick,pause:pause,finish:finish,card:card,decorate:decorate,open:open,close:close,paint:paint,tour:tour,TOUR:TOUR,_R:function(){ return R; },_P:P,unit:unit,splitCheck:splitCheck};
})();
