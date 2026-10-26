/* =====================================================================
   KovaNoise - loud places, and what they cost your hearing (p14).

   Spin classes and weight rooms often run past 85 dB with music and
   dropped weights. Long enough above that and the damage is permanent
   (noise-induced hearing loss, tinnitus). Kova listens for loudness only
   - nothing is recorded, kept or sent - and:
     - shows the level now, in A-weighted decibels (dBA, how the ear hears);
     - adds up today's dose the NIOSH way: 85 dBA is safe for 8 hours, and
       every 3 dB louder halves that (88 for 4 h, 91 for 2 h, 100 for 15 min);
     - warns when it has been 85 dBA or more for a minute: how loud, how
       long it is safe at this level, and what to do (earplugs, step out,
       move away from the speakers);
     - logs each workout's noise with the session (average, peak, minutes
       over 85), and keeps 14 days of loud spells in Vitals.
   Honest limits, said on screen: a phone microphone is not a sound level
   meter. Until you calibrate it once against a watch or a meter, the
   reading can be 5-10 dB off. It only listens while Kova is open (a web
   page cannot listen in the background), and only after you say so.
   ===================================================================== */
window.KovaNoise=(function(){
  'use strict';
  var KEY='kova.noise.v1', DAY=864e5, CAL0=105;
  var S={on:false,why:'',stream:null,ctx:null,an:null,buf:null,w:null,timer:null,db:null,peak:0,secs:[],loudFrom:0,lastAlert:0,mute:0,err:''};
  var D=lsJ(KEY,{cal:null,auto:true,days:{},spells:[]});
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(D)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function key(t){ var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function hm(m){ m=Math.max(0,Math.round(m)); return m>=60?Math.floor(m/60)+' h'+(m%60?' '+(m%60)+' m':''):m+' m'; }
  function supported(){ return !!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&(window.AudioContext||window.webkitAudioContext)); }

  /* ---- the maths ---- */
  /* minutes a level is safe for in a day (NIOSH: 85 dBA for 8 h, 3 dB exchange) */
  function safeMins(db){ return db<80?Infinity:480/Math.pow(2,(db-85)/3); }
  function aWeight(f){
    var f2=f*f, r=(12194*12194*f2*f2)/((f2+20.6*20.6)*Math.sqrt((f2+107.7*107.7)*(f2+737.9*737.9))*(f2+12194*12194));
    return 20*Math.log10(r)+2;
  }
  function level(){
    if(!S.an) return null;
    S.an.getFloatFrequencyData(S.buf);
    var p=0, n=S.buf.length;
    for(var i=1;i<n;i++){ var v=S.buf[i]; if(!isFinite(v)) continue; p+=Math.pow(10,(v+S.w[i])/10); }
    if(!p) return null;
    return 10*Math.log10(p)+(D.cal!=null?D.cal:CAL0);
  }
  function cat(db){ return db>=100?'danger':db>=85?'loud':db>=70?'busy':'quiet'; }
  var CAT_N={quiet:'Quiet',busy:'Busy',loud:'Loud',danger:'Very loud'};
  function today(){ var k=key(Date.now()); return D.days[k]||(D.days[k]={dose:0,loudS:0,max:0,mins:{}}); }

  /* ---- listening ---- */
  function start(why){
    if(S.on) return Promise.resolve(true);
    if(!supported()){ S.err='This browser cannot measure sound. It works in Chrome, Safari and the Kova app.'; paintAll(); return Promise.resolve(false); }
    S.err='';
    return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}).then(function(st){
      var A=window.AudioContext||window.webkitAudioContext;
      S.ctx=new A(); S.stream=st;
      var src=S.ctx.createMediaStreamSource(st);
      S.an=S.ctx.createAnalyser(); S.an.fftSize=4096; S.an.smoothingTimeConstant=0;
      src.connect(S.an);
      S.buf=new Float32Array(S.an.frequencyBinCount); S.w=new Float32Array(S.an.frequencyBinCount);
      for(var i=1;i<S.w.length;i++) S.w[i]=aWeight(i*S.ctx.sampleRate/S.an.fftSize);
      if(S.ctx.state==='suspended'&&S.ctx.resume) S.ctx.resume().catch(function(){});
      S.on=true; S.why=why||''; S.db=null; S.peak=0; S.secs=[]; S.loudFrom=0; S.firstDone=false;
      var acc=[], last=Date.now();
      S.timer=setInterval(function(){
        var v=level(); if(v==null) return;
        S.db=S.db==null?v:S.db+(v-S.db)*.25;          /* about a second's "slow" response */
        acc.push(S.db);
        var now=Date.now();
        if(now-last>=1000){ tick(acc.reduce(function(a,b){ return a+b; },0)/acc.length,(now-last)/1000); acc=[]; last=now; }
        paintLive();
      },250);
      try{ if(window.KovaAnalytics) KovaAnalytics.track('noise_on',{feature:why||'manual'}); }catch(e){}
      paintAll(); return true;
    }).catch(function(e){
      S.err=e&&e.name==='NotAllowedError'?'Microphone access is off for Kova. Turn it on in your browser or phone settings to measure noise.':'Could not open the microphone.';
      paintAll(); return false;
    });
  }
  function stop(){
    if(S.timer) clearInterval(S.timer); S.timer=null;
    if(S.stream) S.stream.getTracks().forEach(function(t){ t.stop(); });
    if(S.ctx&&S.ctx.close) S.ctx.close().catch(function(){});
    closeSpell();
    S.on=false; S.stream=null; S.ctx=null; S.an=null; S.db=null; save(); paintAll(); hideAlert();
  }
  /* one second of sound: dose, the minute's average, loud spells, alerts */
  function tick(db,secs){
    var T=today(), now=Date.now(), m=new Date(now), mk=('0'+m.getHours()).slice(-2)+':'+('0'+m.getMinutes()).slice(-2);
    S.secs.push({t:now,db:db}); if(S.secs.length>900) S.secs.shift();
    /* six seconds in: how loud it is here, and what that does to you */
    if(!S.firstDone&&S.secs.length>=6){ S.firstDone=true; var a6=S.secs.slice(-6).reduce(function(x,y){ return x+y.db; },0)/6; alert(a6,true); }
    S.peak=Math.max(S.peak,db); T.max=Math.max(T.max||0,Math.round(db));
    if(db>=80) T.dose+=secs/60/safeMins(db)*100;
    if(db>=85) T.loudS=(T.loudS||0)+secs;
    var cur=T.mins[mk]||[0,0,0]; cur[0]+=db; cur[1]++; cur[2]=Math.max(cur[2],db); T.mins[mk]=cur;
    /* counted in seconds of sound, not clock time, so a spell is a spell
       however the timer is throttled */
    if(db>=85){ if(!S.loudFrom) S.loudFrom=now; S.loudRun=(S.loudRun||0)+secs; S.quietRun=0; }
    else if(S.loudFrom){ S.quietRun=(S.quietRun||0)+secs; if(S.quietRun>20) closeSpell(); }
    if(S.loudFrom&&S.loudRun>=60&&now>S.mute){
      var again=!S.lastAlert||now-S.lastAlert>15*60e3||(S.lastLevel&&db>=S.lastLevel+5);
      if(again){ S.lastAlert=now; S.lastLevel=db; alert(db); }
    }
    if(Object.keys(D.days).length>14){ Object.keys(D.days).sort().slice(0,-14).forEach(function(k){ delete D.days[k]; }); }
    if(S.secs.length%30===0) save();
  }
  function closeSpell(){
    if(!S.loudFrom) return;
    var dur=S.loudRun||0, seg=S.secs.filter(function(x){ return x.t>=S.loudFrom&&x.db>=85; });
    if(dur>=60&&seg.length){
      var avg=seg.reduce(function(a,b){ return a+b.db; },0)/seg.length, mx=Math.max.apply(null,seg.map(function(x){ return x.db; }));
      D.spells.push({at:S.loudFrom,secs:Math.round(dur),avg:Math.round(avg),max:Math.round(mx),why:S.why||''});
      D.spells=D.spells.filter(function(x){ return x.at>Date.now()-14*DAY; }).slice(-60);
    }
    S.loudFrom=0; S.loudRun=0; S.quietRun=0; save();
  }
  /* a workout's noise, for the session log */
  function summary(since){
    var seg=S.secs.filter(function(x){ return x.t>=since; });
    if(seg.length<20) return null;
    var avg=seg.reduce(function(a,b){ return a+b.db; },0)/seg.length;
    return {avg:Math.round(avg),max:Math.round(Math.max.apply(null,seg.map(function(x){ return x.db; }))),loudMin:Math.round(seg.filter(function(x){ return x.db>=85; }).length/60),est:D.cal==null};
  }
  function calibrate(actual){
    var v=+actual; if(!isFinite(v)||v<30||v>130||S.db==null){ say('Start listening, then type what your watch or meter shows right now.'); return false; }
    var raw=S.db-(D.cal!=null?D.cal:CAL0); D.cal=Math.round((v-raw)*10)/10; S.db=v; save(); paintAll(); say('Calibrated. Readings now match your meter.'); return true;
  }

  /* what this level does to you, said plainly: the good and the bad */
  function impact(db){
    var c=cat(db), sm=safeMins(db);
    if(c==='quiet') return {good:true,t:'Quiet here',p:'Good for you: easy on your ears, and quiet helps you focus, talk and sleep. Fine all day.'};
    if(c==='busy') return {good:true,t:'Busy, but safe',p:'Like a restaurant or a busy street. Safe for your hearing all day, but steady noise at this level raises stress and makes it harder to focus or wind down.'};
    if(c==='loud') return {good:false,t:'Loud here',p:'Like a packed gym class, a bar or traffic up close. Safe for about '+hm(sm)+' a day. After that it wears down your hearing for good, and ringing ears afterwards is the warning sign. Earplugs or a spot away from the speakers help.'};
    return {good:false,t:'Very loud here',p:'Like a concert, a club or fireworks. Safe for only about '+hm(sm)+'. Wear earplugs (music still sounds clear, just safer), stay away from the speakers, and step outside for breaks.'};
  }
  /* ---- the alert: a glass card over the screen ---- */
  function alert(db,first){
    try{ if(navigator.vibrate) navigator.vibrate([120,80,120]); }catch(e){}
    try{ if(window.KovaChime) KovaChime.play(); }catch(e){}
    var el=document.getElementById('knAlert');
    if(!el){ el=document.createElement('div'); el.id='knAlert'; el.className='kn-alert'; el.setAttribute('role','alert'); document.body.appendChild(el);
      el.addEventListener('click',function(e){ var b=e.target.closest('[data-n]'); if(!b) return; var n=b.getAttribute('data-n');
        if(n==='mute'){ S.mute=Date.now()+60*60e3; say('No noise alerts for an hour.'); }
        if(n==='stop') stop();
        if(n==='more'){ try{ go('vitals'); }catch(x){} setTimeout(focus,120); }
        hideAlert(); }); }
    var c=cat(db), sm=safeMins(db), I=impact(db);
    el.className='kn-alert on '+c;
    if(first){
      el.innerHTML='<div class="kn-ah"><span class="kn-dot '+c+'"></span><b>'+I.t+'</b><button data-n="x" aria-label="Close">×</button></div>'
        +'<div class="kn-a3"><div><small>Now:</small><b>~'+Math.round(db)+' dB</b></div><div><small>Safe for:</small><b>'+(db<80?'All day':hm(sm))+'</b></div><div><small>For you:</small><b>'+(I.good?'Good':'Bad')+'</b></div></div>'
        +'<p>'+I.p+'</p><p class="kn-af">Kova keeps listening and warns you if it gets louder. Nothing is recorded.</p>'
        +'<div class="kn-ab"><button data-n="x">Keep listening</button><button data-n="stop">Stop listening</button></div>';
      return;
    }
    el.innerHTML='<div class="kn-ah"><span class="kn-dot '+c+'"></span><b>'+I.t+'</b><button data-n="x" aria-label="Close">×</button></div>'
      +'<div class="kn-a3"><div><small>Now:</small><b>~'+Math.round(db)+' dB</b></div><div><small>Safe for:</small><b>'+hm(sm)+'</b></div><div><small>Today:</small><b>'+Math.round(today().dose)+'%</b></div></div>'
      +'<p>'+I.p+'</p>'
      +'<div class="kn-ab"><button data-n="more">See today</button><button data-n="mute">Quiet for 1 h</button><button data-n="stop">Stop listening</button></div>';
  }
  function hideAlert(){ var el=document.getElementById('knAlert'); if(el) el.classList.remove('on'); }

  /* ---- Vitals: Hearing & noise, laid out like the record card ---- */
  var UI={rec:false};
  function dashLine(){
    var T=today(), now=new Date(), h='', from=7*60, to=Math.max(from+60,now.getHours()*60+now.getMinutes()), step=Math.max(5,Math.ceil((to-from)/48));
    for(var m=from;m<to;m+=step){
      var mx=0, sum=0, n=0;
      for(var j=m;j<m+step;j++){ var k=('0'+Math.floor(j/60)).slice(-2)+':'+('0'+(j%60)).slice(-2), v=T.mins[k]; if(v){ sum+=v[0]; n+=v[1]; mx=Math.max(mx,v[2]); } }
      var a=n?sum/n:0, c=n?cat(a):'none';
      h+='<i class="'+c+'" style="--w:'+(c==='danger'?3:c==='loud'?2.4:c==='busy'?1.6:1)+'"></i>';
    }
    return '<div class="kn-dash" role="img" aria-label="Today since 7 am, each dash a few minutes, longer and brighter when louder">'+h+'</div>';
  }
  function section(){
    var T=today(), live=S.on&&S.db!=null, db=live?S.db:null, c=db!=null?cat(db):null;
    var wk=D.spells.filter(function(x){ return x.at>Date.now()-7*DAY; });
    var avgToday=(function(){ var s=0,n=0; Object.keys(T.mins).forEach(function(k){ s+=T.mins[k][0]; n+=T.mins[k][1]; }); return n?Math.round(s/n):null; })();
    var h='<div class="kn-rec'+(UI.rec?' open':'')+'"><button class="kn-rh" data-n="rec" aria-expanded="'+UI.rec+'"><span><em>Record:</em> Loud spells this week</span><svg class="ic"><use href="#i-chevron-'+(UI.rec?'up':'down')+'"/></svg></button>'
      +(UI.rec?'<div class="kn-rb">'+(wk.length?wk.slice().reverse().slice(0,8).map(function(x){ return '<div class="kn-sp"><span>'+new Date(x.at).toLocaleDateString('en-US',{weekday:'short'})+' '+new Date(x.at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+(x.why==='workout'?' · workout':'')+'</span><b>'+x.avg+' dB avg · '+x.max+' peak · '+hm(x.secs/60)+'</b></div>'; }).join(''):'<p class="kn-p">No spell of 85 dB or more for a minute this week.</p>')+'</div>':'')+'</div>';
    h+='<div class="kn-card'+(c?' '+c:'')+'">'
      +'<div class="kn-ch"><span>Noise'+(live?' · listening':'')+'</span>'+(live?'<span class="kn-live" aria-hidden="true"></span>':'')+'</div>'
      +'<div class="kn-3"><div><small>Now:</small><b id="knNow">'+(db!=null?'~'+Math.round(db)+' dB':'—')+'</b></div><div><small>Safe for:</small><b id="knSafe">'+(db!=null?(db<80?'All day':hm(safeMins(db))):'—')+'</b></div><div><small>Level:</small><b id="knCat">'+(c?CAT_N[c]:'Not listening')+'</b></div></div>'
      +'<div class="kn-tl"><span>Exposure and trend</span><b>'+Math.round(T.dose)+'% <i>of a day’s safe dose</i></b></div>'+dashLine()
      +'<div class="kn-risk"><div class="kn-rl"><b>Hearing risk</b><small>From: '+(D.cal==null?'phone mic, estimate ±5–10 dB':'phone mic, calibrated')+'</small></div>'
        +'<div class="kn-rs"><span class="kn-dot '+(T.dose>=100?'danger':T.dose>=50?'loud':'quiet')+'"></span>'+(T.dose>=100?'Over today':T.dose>=50?'Watch it':'Fine today')+'</div>'
        +'<div class="kn-rv"><div><b>'+(T.max||'—')+'</b><span class="kn-dot danger"></span><i style="width:'+Math.min(100,Math.max(0,((T.max||0)-50)*1.6))+'%"></i><small>peak</small></div>'
        +'<div><b>'+(avgToday||'—')+'</b><span class="kn-dot busy"></span><small>average</small></div></div></div>'
      +'</div>'
      +(S.err?'<p class="kn-err">'+esc(S.err)+'</p>':'')
      +'<div class="kn-acts"><button class="kn-btn" data-n="'+(S.on?'stop':'start')+'">'+(S.on?'Stop listening':'Check how loud it is')+'</button>'
        +'<button class="kn-btn ghost" data-n="cal">'+(D.cal==null?'Calibrate':'Recalibrate')+'</button></div>'
      +(UI.cal?'<div class="kn-cal"><label>What does your watch or meter say right now?<span><input type="number" id="knCalV" inputmode="numeric" placeholder="e.g. 72"> dB</span></label><button class="kn-btn" data-n="calok">Save</button></div>':'')
      +'<label class="kn-tg"><input type="checkbox" data-n="auto"'+(D.auto?' checked':'')+'> Listen during workouts and warn me</label>'
      +'<p class="kn-fine">Kova measures loudness only: nothing is recorded, kept or sent. It listens while Kova is open, after you say so. 85 dB is safe for 8 hours a day; every 3 dB louder halves that (NIOSH).</p>';
    return h;
  }
  function host(){
    var scr=document.getElementById('s-vitals'); if(!scr) return null;
    var el=document.getElementById('knSec'); if(el) return el;
    var wrap=document.createElement('div'); wrap.className='vsec kn-vsec';
    wrap.innerHTML='<div class="vsec-h" data-s="noise" role="button" tabindex="0" aria-expanded="false"><div class="vsec-i"><svg class="ic" style="font-size:15px"><use href="#i-headphones"/></svg></div><div class="vsec-n">Hearing & noise</div><div class="vsec-c" id="knSecN"></div><span class="vsec-v"><svg class="ic" style="font-size:15px"><use href="#i-chevron-down"/></svg></span></div>'
      +'<div class="vsec-b" data-b="noise"><div class="knx" id="knSec"></div></div>';
    var cyc=scr.querySelector('.kcx-vsec'), secs=scr.querySelectorAll('.vsec'), after=cyc||secs[1]||secs[0];
    if(after&&after.parentNode) after.parentNode.insertBefore(wrap,after.nextSibling); else scr.appendChild(wrap);
    var hd=wrap.querySelector('.vsec-h'), bd=wrap.querySelector('.vsec-b');
    var tog=function(){ var o=!hd.classList.contains('open'); hd.classList.toggle('open',o); bd.classList.toggle('open',o); hd.setAttribute('aria-expanded',String(o)); };
    hd.addEventListener('click',tog); hd.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); e.stopPropagation(); tog(); } });
    el=wrap.querySelector('#knSec');
    el.addEventListener('click',function(e){ var b=e.target.closest('[data-n]'); if(!b||b.tagName==='INPUT') return; var n=b.getAttribute('data-n');
      if(n==='start') start('manual'); else if(n==='stop') stop(); else if(n==='rec'){ UI.rec=!UI.rec; paint(); }
      else if(n==='cal'){ UI.cal=!UI.cal; if(UI.cal&&!S.on) start('calibrate'); paint(); }
      else if(n==='calok'){ if(calibrate((document.getElementById('knCalV')||{}).value)){ UI.cal=false; paint(); } } });
    el.addEventListener('change',function(e){ if(e.target.getAttribute('data-n')==='auto'){ D.auto=e.target.checked; save(); } });
    return el;
  }
  function paint(){ var el=host(); if(!el) return; el.innerHTML=section(); var n=document.getElementById('knSecN'); if(n) n.textContent=S.on&&S.db!=null?Math.round(S.db)+' dB':Math.round(today().dose)+'%'; }
  function paintLive(){
    var db=S.db; if(db==null) return;
    var a=document.getElementById('knNow'), b=document.getElementById('knSafe'), c=document.getElementById('knCat'), n=document.getElementById('knSecN');
    if(a) a.textContent='~'+Math.round(db)+' dB'; if(b) b.textContent=db<80?'All day':hm(safeMins(db)); if(c) c.textContent=CAT_N[cat(db)]; if(n) n.textContent=Math.round(db)+' dB';
    var card=document.querySelector('.kn-card'); if(card){ card.classList.remove('quiet','busy','loud','danger'); card.classList.add(cat(db)); }
    var chip=document.getElementById('knChip'); if(chip) chip.innerHTML=chipHTML();
  }
  /* in a workout: a chip under the heart rate */
  function chipHTML(){
    return S.on&&S.db!=null?'<span class="kn-dot '+cat(S.db)+'"></span><b>~'+Math.round(S.db)+' dB</b><span>'+CAT_N[cat(S.db)]+(S.db>=80?' · safe for '+hm(safeMins(S.db)):'')+'</span><button data-n="stop">Stop</button>'
      :'<span class="kn-dot"></span><b>Noise</b><span>Is the gym too loud? Kova can listen and warn you.</span><button data-n="start">Listen</button>';
  }
  /* p39 (the owner: "I don't want this on the screen, only as an alert"):
     nothing on the workout screen. Listening starts from Vitals > Hearing &
     noise (or with each workout, if you switched that on), and Kova speaks
     up only through its alert: once a few seconds in, with what this level
     does to you, good or bad, and again whenever it gets loud. */
  function paintSession(){ var chip=document.getElementById('knChip'); if(chip) chip.remove(); }
  function paintAll(){ paint(); paintSession(); }
  function focus(){
    var el=host(); if(!el) return; paint();
    var w=el.closest('.vsec'), hd=w&&w.querySelector('.vsec-h'), bd=w&&w.querySelector('.vsec-b');
    if(hd&&!hd.classList.contains('open')){ hd.classList.add('open'); bd.classList.add('open'); }
    if(w&&w.scrollIntoView) w.scrollIntoView({block:'start',behavior:'smooth'});
  }
  /* "Listen during workouts": starts with the session (a tap started it) */
  function onGo(){
    var s=document.getElementById('s-session');
    if(s&&s.classList.contains('on')){ paintSession(); if(D.auto&&!S.on&&D.granted) start('workout'); }
  }
  function start0(){
    var tries=0;
    (function wait(){ var sc=document.getElementById('s-vitals'); if(sc&&!sc.__sec&&++tries<30) return setTimeout(wait,100); paintAll(); })();
    document.addEventListener('click',function(){ setTimeout(onGo,50); },true);
    try{ if(navigator.permissions&&navigator.permissions.query) navigator.permissions.query({name:'microphone'}).then(function(p){ D.granted=p.state==='granted'; p.onchange=function(){ D.granted=p.state==='granted'; }; }).catch(function(){}); }catch(e){}
    window.addEventListener('pagehide',function(){ if(S.on){ closeSpell(); save(); } });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start0,400); }); else setTimeout(start0,400);
  return {impact:impact,start:start,stop:stop,on:function(){ return S.on; },level:function(){ return S.db; },summary:summary,calibrate:calibrate,safeMins:safeMins,aWeight:aWeight,focus:focus,paint:paintAll,
    _tick:tick,_alert:alert,_S:S,_D:function(){ return D; }};
})();
