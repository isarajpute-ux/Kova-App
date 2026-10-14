/* =====================================================================
   KovaVDock (p22) - Vitals, one section at a time, from a dock of icons.

   Before: seven drop-downs stacked down the screen (Today, Cycle &
   fertility, Hearing & noise, How you're feeling, Readings & signals,
   Heart & stress, Health & actions); open a few and it is a long scroll.
   Now: a dock of squircle tiles sits at the bottom of Vitals. Swipe it
   (finger, mouse drag or wheel) and the tiles turn like a wheel; tap one
   and its title shows at the top ("Vitals: Readings & signals") with
   that section under it. Every section is still one tap away; nothing
   is hidden behind a More button.

   The look comes from the three reference images, in Kova's accent
   colour instead of theirs:
     1  (Patient Profile)  "Label: Value" title, graphite cards with a
        soft glow of colour behind the glass, a faint dot grid, a trend
        line drawn in dashes, small status dots
     2  (the dock)         squircle tiles with thin line icons; the one
        you are on turns bright with a filled glyph and a glow
     3  (Strike Power)     huge thin numbers with a small unit, coloured
        changes, a track with a glowing ring, three readings split by
        slanted lines, a vivid tile beside a dark one, dot drawings
   The cards added here (Recovery, the sleep trend, Steadiest and Most
   off) are drawn from your own readings: today's readiness, and the
   seven checks Kova already runs (resting heart rate, HRV, sleep...).
   With no reading they say so instead of showing a made-up number.

   The sections themselves are the existing ones, moved, not rebuilt:
   their cards keep every listener bound elsewhere.
   ===================================================================== */
window.KovaVDock=(function(){
  'use strict';
  var KEY='kova.vitals.sec', cur='', built=false, seen=false, mine={};
  function $(id){ return document.getElementById(id); }
  function scr(){ return $('s-vitals'); }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function lsGet(){ try{ return localStorage.getItem(KEY)||''; }catch(e){ return ''; } }
  function lsSet(v){ try{ localStorage.setItem(KEY,v); }catch(e){} }

  /* the glyphs: a thin outline on graphite, a filled shape when it is the
     one you are on (image 2: the page, the pie, the rings, the three dots) */
  var G={
    today:{o:'<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="8" stroke-dasharray="11 2.6"/>',
           f:'<circle cx="12" cy="12" r="4.2" class="kvd-fill"/><circle cx="12" cy="12" r="8" stroke-dasharray="9 3.6"/>'},
    cycle:{o:'<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6.6 4.4"/>',
           f:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 6.9 12L12 12Z" class="kvd-fill"/>'},
    noise:{o:'<path d="M6 10v4M9.5 7v10M13 9v6M16.5 5.5v13M20 10.5v3"/>',
           f:'<rect x="5" y="9.5" width="2.2" height="5" rx="1.1" class="kvd-fill"/><rect x="8.4" y="6.5" width="2.2" height="11" rx="1.1" class="kvd-fill"/><rect x="11.9" y="8.5" width="2.2" height="7" rx="1.1" class="kvd-fill"/><rect x="15.4" y="5" width="2.2" height="14" rx="1.1" class="kvd-fill"/><rect x="18.9" y="10" width="2.2" height="4" rx="1.1" class="kvd-fill"/>'},
    feeling:{o:'<circle cx="13.5" cy="9" r="3.6"/><circle cx="8" cy="15" r="2.3"/><circle cx="14" cy="16.6" r="1.7"/>',
           f:'<circle cx="13.5" cy="9" r="3.8" class="kvd-fill"/><circle cx="8" cy="15" r="2.5" class="kvd-fill"/><circle cx="14" cy="16.6" r="1.9" class="kvd-fill"/>'},
    signals:{o:'<path d="M3 12.5h4l2-5 3.5 10 2.5-6.5 1.5 1.5H21"/>',
           f:'<path d="M3 12.5h4l2-5 3.5 10 2.5-6.5 1.5 1.5H21" stroke-width="2.4"/><circle cx="9" cy="7.5" r="1.6" class="kvd-fill"/>'},
    heart:{o:'<path d="M12 19s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7 2.2C19 14.7 12 19 12 19Z"/>',
           f:'<path d="M12 19s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7 2.2C19 14.7 12 19 12 19Z" class="kvd-fill"/>'},
    care:{o:'<path d="M7 4.5h7l4 4V18a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18V6a1.5 1.5 0 0 1 1-1.5Z"/><path d="M14 4.5V8a.6.6 0 0 0 .6.6H18"/>',
           f:'<path d="M7.5 4.5H14V8a.6.6 0 0 0 .6.6H18V18a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18V6a1.5 1.5 0 0 1 1.5-1.5Z" class="kvd-fill"/>'}
  };
  function glyph(id,on){ var g=G[id]||G.signals; return '<svg viewBox="0 0 24 24" aria-hidden="true" class="kvd-g '+(on?'kvd-gf':'kvd-go')+'">'+(on?g.f:g.o)+'</svg>'; }
  /* both drawings sit in every tile and cross-fade, so a tap never jumps */
  function glyphs(id){ return '<span class="kvd-gw">'+glyph(id,false)+glyph(id,true)+'</span>'; }

  /* ---------------- the sections that exist right now ---------------- */
  function sections(){
    var s=scr(); if(!s) return [];
    return Array.prototype.filter.call(s.children,function(c){ return c.classList&&c.classList.contains('vsec')&&c.querySelector('.vsec-h'); })
      .map(function(w){ var h=w.querySelector('.vsec-h'); return {id:h.dataset.s,n:(h.querySelector('.vsec-n')||{}).textContent||h.dataset.s,w:w,h:h,b:w.querySelector('.vsec-b')}; });
  }
  function find(id){ return sections().filter(function(x){ return x.id===id; })[0]||null; }

  /* ---------------- build ---------------- */
  function build(){
    var s=scr(), L=sections();
    if(!s||L.length<2) return false;
    s.classList.add('kvd-on');
    var hdr=s.querySelector('.hdr');
    if(!$('kvdHead')){
      var head=document.createElement('div');
      head.className='kvd-head'; head.id='kvdHead';
      head.innerHTML='<div class="kvd-ht"><span class="kvd-hl">Vitals:</span> <b id="kvdName"></b></div>'
        +'<div class="kvd-hs" id="kvdSub"></div>'
        +'<div class="kvd-hn"><button class="kvd-sq" data-kv="prev" aria-label="Previous section"><svg viewBox="0 0 24 24"><path d="M14.5 6.5 9 12l5.5 5.5"/></svg></button>'
        +'<span id="kvdPos"></span><button class="kvd-sq" data-kv="next" aria-label="Next section"><svg viewBox="0 0 24 24"><path d="m9.5 6.5 5.5 5.5-5.5 5.5"/></svg></button></div>';
      var anchor=s.querySelector('.vall')||(hdr&&hdr.nextSibling);
      s.insertBefore(head,anchor);
      head.addEventListener('click',function(e){ var b=e.target.closest('[data-kv]'); if(b) step(b.dataset.kv==='next'?1:-1,true); });
    }
    if(!$('kvdDock')){
      var d=document.createElement('div');
      d.className='kvd-dock'; d.id='kvdDock';
      d.innerHTML='<div class="kvd-row" id="kvdRow" role="tablist" aria-label="Vitals sections"></div>';
      s.appendChild(d);
      wireDock(d.querySelector('.kvd-row'));
    }
    tiles();
    var want=cur&&find(cur)?cur:(find(lsGet())?lsGet():L[0].id);
    show(want,false);
    built=true; lift();
    setTimeout(function(){ center(false); },60);
    return true;
  }
  function tiles(){
    var row=$('kvdRow'); if(!row) return;
    var L=sections();
    /* the glow is one piece that slides from tile to tile */
    row.innerHTML='<span class="kvd-ind" id="kvdInd" aria-hidden="true"></span>'+L.map(function(x,i){
      return '<button class="kvd-t" role="tab" id="kvdT-'+esc(x.id)+'" data-kt="'+esc(x.id)+'" aria-selected="false" aria-controls="kvdP-'+esc(x.id)+'" tabindex="-1" title="'+esc(x.n)+'">'
        +glyphs(x.id)+'<span class="kvd-tl">'+esc(x.n)+'</span></button>';
    }).join('');
    L.forEach(function(x){ x.b&&(x.b.id='kvdP-'+x.id); x.b&&x.b.setAttribute('role','tabpanel'); x.b&&x.b.setAttribute('aria-labelledby','kvdT-'+x.id); });
    mark();
  }
  function mark(){
    var row=$('kvdRow'); if(!row) return;
    row.querySelectorAll('.kvd-t').forEach(function(t){
      var on=t.dataset.kt===cur;
      t.classList.toggle('on',on); t.setAttribute('aria-selected',on?'true':'false'); t.tabIndex=on?0:-1;
    });
    slide();
  }
  function slide(){
    var ind=$('kvdInd'), t=$('kvdT-'+cur); if(!ind||!t) return;
    ind.style.width=t.offsetWidth+'px';
    ind.style.transform='translateX('+t.offsetLeft+'px)';
    ind.classList.toggle('ready',!!t.offsetWidth);
  }

  /* ---------------- show one ---------------- */
  function show(id,user){
    var x=find(id); if(!x) return false;
    /* slide in from the side you are heading to */
    var L0=sections().map(function(y){ return y.id; }), from=L0.indexOf(cur), to=L0.indexOf(id), sc=scr();
    if(sc) sc.classList.toggle('kvd-back',from>=0&&to<from&&!(from===L0.length-1&&to===0)||(from===0&&to===L0.length-1));
    sections().forEach(function(y){
      var on=y.id===id;
      y.w.classList.toggle('kvd-cur',on);
      if(on){ if(!y.h.classList.contains('open')) mine[y.id]=1; y.h.classList.add('open'); if(y.b) y.b.classList.add('open'); y.h.setAttribute('aria-expanded','true'); }
    });
    cur=id; lsSet(id);
    var L=sections(), i=L.indexOf(L.filter(function(y){ return y.id===id; })[0]);
    var nm=$('kvdName'); if(nm&&nm.textContent!==x.n){ nm.textContent=x.n; nm.classList.remove('kvd-tx'); void nm.offsetWidth; nm.classList.add('kvd-tx'); }
    var ps=$('kvdPos'); if(ps) ps.textContent=(i+1)+' / '+L.length;
    var sb=$('kvdSub'); if(sb) sb.textContent=summary(id);
    mark();
    center(user);
    paintCards(id);
    if(user){
      var m=$('main'); if(m&&m.scrollTo) try{ m.scrollTo({top:0,behavior:'smooth'}); }catch(e){ m.scrollTop=0; }
      try{ if(window.KovaAnalytics) KovaAnalytics.track('vitals_section',{id:id}); }catch(e){}
    }
    return true;
  }
  function step(n,user){
    var L=sections(); if(!L.length) return;
    var i=L.map(function(x){ return x.id; }).indexOf(cur);
    show(L[(i+n+L.length)%L.length].id,user);
    if(user){ var t=$('kvdT-'+cur); if(t&&document.activeElement&&document.activeElement.closest&&document.activeElement.closest('.kvd-row')) t.focus(); }
  }
  /* one line under the title, from what that section is about */
  function summary(id){
    var a=audit(), m=function(k){ return a&&a[k]; };
    if(id==='today'){ var r=ready(); return r.score==null?'Recovery needs a night with your watch':'Recovery '+r.score+' · '+word(r.score).toLowerCase(); }
    if(id==='signals'){ if(!a) return 'Your readings against your own normal'; var off=Object.keys(a).filter(function(k){ return a[k].status==='fix'||a[k].status==='watch'; }).length; return off?off+' outside your normal range':'All within your normal range'; }
    if(id==='heart'){ var h=m('rhr'); return h&&h.value!=null?'Resting '+Math.round(h.value)+' bpm'+(h.change!=null?' · '+(h.change>0?'+':'')+Math.round(h.change)+' vs normal':''):'Heart rate and stress through the day'; }
    if(id==='feeling') return 'Estimated from sleep, HRV and resting heart rate';
    if(id==='care') return 'Your health profile and what to start or stop';
    if(id==='cycle'){ try{ var p=window.KovaCycle&&KovaCycle.phase&&KovaCycle.phase(); if(p) return (KovaCycle.PHASE&&KovaCycle.PHASE[p]&&KovaCycle.PHASE[p].n)||(p.charAt(0).toUpperCase()+p.slice(1))+' phase'; }catch(e){} return 'Your cycle, phase and fertile window'; }
    if(id==='noise') return 'How loud your days are, and your hearing';
    return '';
  }

  /* ---------------- the dock: swipe, drag, wheel, keys ---------------- */
  function wireDock(row){
    row.addEventListener('click',function(e){
      if(row.__drag) return;
      var t=e.target.closest('.kvd-t'); if(t) show(t.dataset.kt,true);
    });
    row.addEventListener('keydown',function(e){
      if(e.key==='ArrowRight'||e.key==='ArrowDown'){ e.preventDefault(); step(1,true); }
      else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){ e.preventDefault(); step(-1,true); }
      else if(e.key==='Home'){ e.preventDefault(); var L=sections(); if(L.length) show(L[0].id,true); var t0=$('kvdT-'+cur); if(t0) t0.focus(); }
      else if(e.key==='End'){ e.preventDefault(); var L2=sections(); if(L2.length) show(L2[L2.length-1].id,true); var t1=$('kvdT-'+cur); if(t1) t1.focus(); }
    });
    /* a mouse drags it like a finger does */
    var sx=0, sl=0, down=false, moved=0;
    row.addEventListener('pointerdown',function(e){ if(e.pointerType!=='mouse') return; down=true; moved=0; sx=e.clientX; sl=row.scrollLeft; row.__drag=false; });
    window.addEventListener('pointermove',function(e){ if(!down) return; var dx=e.clientX-sx; moved=Math.max(moved,Math.abs(dx)); if(moved>4){ row.__drag=true; row.classList.add('drag'); row.scrollLeft=sl-dx; } });
    window.addEventListener('pointerup',function(){ if(!down) return; down=false; row.classList.remove('drag'); setTimeout(function(){ row.__drag=false; },0); });
    /* a wheel turns it sideways */
    row.addEventListener('wheel',function(e){ if(Math.abs(e.deltaY)>Math.abs(e.deltaX)&&row.scrollWidth>row.clientWidth){ row.scrollLeft+=e.deltaY; e.preventDefault(); } },{passive:false});
    /* the wheel look: tiles away from the middle turn and fade a little */
    var raf=0;
    row.addEventListener('scroll',function(){ if(!raf) raf=requestAnimationFrame(function(){ raf=0; spin(row); }); },{passive:true});
    window.addEventListener('resize',function(){ spin(row); slide(); });
  }
  function spin(row){
    row=row||$('kvdRow'); if(!row||!row.clientWidth) return;
    var mid=row.scrollLeft+row.clientWidth/2;
    row.querySelectorAll('.kvd-t').forEach(function(t){
      var c=t.offsetLeft+t.offsetWidth/2, d=Math.max(-1,Math.min(1,(c-mid)/(row.clientWidth/1.4)));
      t.style.setProperty('--kvd-d',d.toFixed(3)); t.style.setProperty('--kvd-a',Math.abs(d).toFixed(3));
    });
  }
  function center(smooth){
    var row=$('kvdRow'), t=$('kvdT-'+cur); if(!row||!t||!row.clientWidth){ spin(row); return; }
    var to=t.offsetLeft+t.offsetWidth/2-row.clientWidth/2;
    try{ row.scrollTo({left:to,behavior:smooth?'smooth':'auto'}); }catch(e){ row.scrollLeft=to; }
    spin(row); slide();
  }

  /* ---------------- data ---------------- */
  function audit(){
    try{
      var a=window.KovaAgent&&KovaAgent.audit?KovaAgent.audit():null; if(!a||!a.metrics) return null;
      var o={}; a.metrics.forEach(function(m){ o[m.id]=m; }); return o;
    }catch(e){ return null; }
  }
  function ready(){ try{ return window.KovaToday&&KovaToday.readiness?KovaToday.readiness():{score:null}; }catch(e){ return {score:null}; } }
  function word(s){ return s==null?'':s>=75?'High':s>=50?'Moderate':'Low'; }
  function tone(st){ return st==='fix'?'bad':st==='watch'?'mid':st==='neglect'?'none':'good'; }
  /* how far from your own normal, in %, for the readings that have one */
  function dev(m){
    if(!m||m.status==='neglect'||m.value==null) return null;
    if(m.id==='hrv') return m.change_pct!=null?m.change_pct:null;
    if(m.id==='rhr') return m.baseline?Math.round((m.value-m.baseline)/m.baseline*100):null;
    if(m.id==='sleep') return m.target?Math.round((m.value-m.target)/m.target*100):null;
    if(m.id==='food') return m.target?Math.round((m.value-m.target)/m.target*100):null;
    if(m.id==='hydration') return m.target?Math.round((m.value-m.target)/m.target*100):null;
    return null;
  }
  /* text on the vivid tile: dark on a light accent, light on a deep one */
  function ink(){
    try{
      var v=getComputedStyle(document.body).getPropertyValue('--acc').trim(), r,g,b2,m;
      if((m=v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i))){ var h=m[1].length===3?m[1].replace(/./g,'$&$&'):m[1]; r=parseInt(h.slice(0,2),16); g=parseInt(h.slice(2,4),16); b2=parseInt(h.slice(4,6),16); }
      else if((m=v.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/))){ r=+m[1]; g=+m[2]; b2=+m[3]; }
      else return 'dark';
      var f=function(c){ c/=255; return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4); };
      var L=0.2126*f(r)+0.7152*f(g)+0.0722*f(b2);
      /* white wins when it out-contrasts near-black on this colour */
      return (1.05/(L+0.05))>((L+0.05)/0.0605)?'light':'dark';
    }catch(e){ return 'dark'; }
  }
  function hm(mins){ mins=Math.round(mins); return Math.floor(mins/60)+'h '+(mins%60)+'m'; }
  function nights(n){
    var L=[]; try{ L=window.KovaSleepLog?KovaSleepLog.nights():[]; }catch(e){}
    var by={}; L.forEach(function(x){ if(x&&x.k&&x.mins>0) by[x.k]=x.mins; });
    var out=[], d=new Date(); d.setHours(12,0,0,0);
    for(var i=n-1;i>=0;i--){ var t=new Date(d.getTime()-i*864e5), k=t.getFullYear()+'-'+('0'+(t.getMonth()+1)).slice(-2)+'-'+('0'+t.getDate()).slice(-2); out.push(by[k]||null); }
    return out;
  }

  /* ---------------- the cards ---------------- */
  /* image 3, "Strike Power": Recovery as a big thin number, a track with a
     glowing ring, and three readings split by slanted lines */
  function powerHtml(){
    var r=ready(), a=audit()||{}, s=r.score;
    var pos=s==null?null:Math.max(0,Math.min(100,s));
    var sub=function(id,label,val,unit,dlt,du){
      var m=a[id], st=m?m.status:'neglect', t=tone(st), d=dev(m);
      var bar=d==null?'':'<i style="left:'+(50+Math.max(-45,Math.min(45,d*1.5)))+'%"></i>';
      return '<div class="kvd-sm '+t+'" data-k="'+id+'" role="button" tabindex="0" aria-label="'+esc(label)+(val==null?', no reading':', '+esc(val)+' '+esc(unit))+'. Opens '+esc(label)+'"><b>'+(val==null?'—':esc(val))+'<small>'+esc(unit)+'</small></b><span>'+esc(label)+'</span>'
        +'<em>'+(dlt==null?(st==='neglect'?'no reading':''):esc((dlt>0?'+':'')+dlt+du))+'</em><div class="kvd-mt">'+bar+'</div></div>';
    };
    var hrv=a.hrv, rhr=a.rhr, sl=a.sleep;
    return '<div class="kvd-card kvd-power">'
      +'<div class="kvd-ch"><div><div class="kvd-ct">Recovery</div><div class="kvd-cs">Today, from sleep, HRV and resting heart rate</div></div>'
      +'<button class="kvd-sq" data-go="recovery" aria-label="Open recovery"><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6.5 18.5 12 13 17.5"/></svg></button></div>'
      +'<div class="kvd-big" role="button" tabindex="0" aria-label="'+(s==null?'No recovery score yet':'Recovery '+s+' of 100')+'. Shows where it comes from"><span class="kvd-num">'+(s==null?'—':s)+'</span><span class="kvd-unit">'+(s==null?'':'/100')+'</span>'
      +'<span class="kvd-word '+(s==null?'none':s>=75?'good':s>=50?'mid':'bad')+'">'+(s==null?'Wear your watch to bed for a score':esc(word(s)))+'</span></div>'
      +'<div class="kvd-track" role="img" aria-label="'+(s==null?'No score yet':'Recovery '+s+' of 100, '+word(s).toLowerCase())+'"><span class="kvd-band"></span><span class="kvd-pill" style="left:50%"></span><span class="kvd-pill" style="left:75%"></span>'
      +(pos==null?'':'<span class="kvd-knob" style="left:'+pos+'%"></span>')+'</div>'
      +'<div class="kvd-tl3"><span>Low</span><span>Moderate</span><span>High</span></div>'
      +'<div class="kvd-sms">'
      +sub('hrv','HRV',hrv&&hrv.value!=null?Math.round(hrv.value):null,'ms',hrv&&hrv.change_pct!=null?hrv.change_pct:null,'% vs normal')
      +sub('rhr','Resting HR',rhr&&rhr.value!=null?Math.round(rhr.value):null,'bpm',rhr&&rhr.change!=null?Math.round(rhr.change):null,' vs normal')
      +sub('sleep','Sleep',sl&&sl.value!=null?hm(sl.value):null,'',sl&&sl.value!=null&&sl.target?Math.round(sl.value-sl.target):null,'m vs goal')
      +'</div>'+trendHtml()+'</div>';
  }
  /* image 1, "Weight and Trend": sleep over two weeks as dashes, long for
     a full night, short for a short one, a dot for a night with no data */
  function trendHtml(){
    var n=nights(14), have=n.filter(function(x){ return x; });
    var avg=have.length?have.reduce(function(s,x){ return s+x; },0)/have.length:null;
    var segs=n.map(function(v,i){
      var o=(0.35+0.65*(i+1)/n.length).toFixed(2);
      if(!v) return '<i class="kvd-dot" style="opacity:'+o+'"></i>';
      var w=Math.max(6,Math.min(46,Math.round(v/480*34)));
      return '<i style="width:'+w+'px;opacity:'+o+'" title="'+hm(v)+'"></i>';
    }).join('');
    return '<div class="kvd-trend" role="button" tabindex="0" aria-label="Sleep over the last 14 nights. Opens Sleep"><div class="kvd-trh"><span>Sleep and trend</span><b>'+(avg==null?'no nights yet':hm(avg)+' avg')+'</b></div>'
      +'<div class="kvd-dash" aria-label="Sleep over the last 14 nights">'+segs+'</div></div>';
  }
  /* image 3, "Most / Least consistent": the reading closest to your normal
     on a vivid tile, the one furthest from it on a dark one */
  function pairHtml(){
    var a=audit(); if(!a) return '';
    var NAME={hrv:'HRV',rhr:'Resting heart rate',sleep:'Sleep',food:'Protein',hydration:'Water'};
    var L=Object.keys(NAME).map(function(k){ var m=a[k], d=dev(m); return d==null?null:{k:k,m:m,d:d}; }).filter(Boolean);
    if(!L.length) return '<div class="kvd-card kvd-empty"><div class="kvd-ct">Steadiest and most off</div><div class="kvd-cs">Once Kova has a few readings from your watch, sleep log and meals, the one closest to your normal and the one furthest from it show here.</div></div>';
    L.sort(function(x,y){ return Math.abs(x.d)-Math.abs(y.d); });
    var best=L[0], worst=L.length>1?L[L.length-1]:null;
    var val=function(x){ var m=x.m; return x.k==='sleep'?hm(m.value):(Math.round(m.value)+(m.unit&&m.unit.length<5?' '+m.unit:x.k==='food'?' g':'')); };
    var tile=function(x,vivid,title){
      return '<div class="kvd-tile'+(vivid?' vivid ink-'+ink():'')+'" data-k="'+x.k+'" role="button" tabindex="0" aria-label="'+esc(title)+': '+esc(NAME[x.k])+', '+esc(val(x))+'. Opens it"><div class="kvd-tt">'+esc(title)+'</div><div class="kvd-ts">'+esc(NAME[x.k])+'</div>'
        +'<div class="kvd-tv"><span class="kvd-num sm">'+esc(val(x))+'</span><em class="'+(vivid?'':Math.abs(x.d)>=10?'bad':'mid')+'">'+(x.d>0?'+':'')+x.d+' %</em></div>'
        +dots(x.d,vivid)+'</div>';
    };
    return '<div class="kvd-pair">'+tile(best,true,'Steadiest')+(worst&&worst.k!==best.k?tile(worst,false,'Most off today'):'')+'</div>';
  }
  /* the dot drawing: a field of dots, a dashed ring for your normal, and
     today as a ring marker - further out the further from normal */
  function dots(d,vivid){
    /* the whole field is one shape, so it costs one element, not a hundred */
    var h='', cx=60, cy=46, R=40, n=0;
    for(var y=8;y<=86;y+=8) for(var x=12;x<=108;x+=8){ var dx=(x-cx)/R, dy=(y-cy)/(R*0.92); if(dx*dx+dy*dy<=1){ h+='M'+(x-1.15)+' '+y+'a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0'; n++; } }
    var rr=22, k=Math.max(-1,Math.min(1,d/40)), mr=rr*(1+k*0.75), ang=-0.75;
    var mx=(cx+Math.cos(ang)*mr).toFixed(1), my=(cy+Math.sin(ang)*mr).toFixed(1);
    return '<svg class="kvd-dots" viewBox="0 0 120 92" aria-hidden="true" data-dots="'+n+'"><path class="kvd-dg" d="'+h+'"/>'
      +'<circle cx="'+cx+'" cy="'+cy+'" r="'+rr+'" class="kvd-ring"/>'
      +'<circle cx="'+cx+'" cy="'+cy+'" r="4" class="kvd-mk base"/>'
      +'<circle cx="'+mx+'" cy="'+my+'" r="4.6" class="kvd-mk '+(vivid?'now':Math.abs(d)>=10?'off':'now')+'"/></svg>';
  }
  function paintCards(id){
    var t=find('today');
    if(t&&t.b){
      var p=t.b.querySelector('.kvd-power');
      var html=powerHtml();
      if(!p){ var w=document.createElement('div'); w.innerHTML=html; p=w.firstChild; var anchor=t.b.querySelector('.card.card-lg')||t.b.firstChild; t.b.insertBefore(p,anchor); }
      else if(id==='today') p.outerHTML=html;
      /* the old Recovery card was a fixed 70; this one is your real score */
      Array.prototype.forEach.call(t.b.querySelectorAll('.card'),function(c){ if(!c.classList.contains('kvd-power')&&/RECOVERY SCORE/.test(c.textContent)&&!c.querySelector('#recoveryGrid')) c.classList.add('kvd-gone'); });
    }
    var s=find('signals');
    if(s&&s.b&&(id==='signals'||s.b.querySelector('.kvd-pair,.kvd-empty'))){
      var q=s.b.querySelector('.kvd-pair,.kvd-empty');
      var ph=pairHtml();
      if(!q&&ph){ var w2=document.createElement('div'); w2.innerHTML=ph; s.b.insertBefore(w2.firstChild,s.b.firstChild); }
      else if(q&&id==='signals'){ if(ph) q.outerHTML=ph; }
    }
  }

  /* ---------------- keep in step ---------------- */
  function watch(){
    var s=scr(); if(!s||!window.MutationObserver) return;
    /* sections added later (Cycle, Hearing) join the dock */
    new MutationObserver(function(){
      var n=sections().length, have=$('kvdRow')?$('kvdRow').children.length:0;
      if(!built){ if(seen) build(); } else if(n!==have){ tiles(); if(!find(cur)&&n) show(sections()[0].id,false); else { mark(); var ps=$('kvdPos'); if(ps){ var L=sections(); ps.textContent=(L.map(function(x){ return x.id; }).indexOf(cur)+1)+' / '+L.length; } } }
    }).observe(s,{childList:true});
    /* something else opening a section ("Cycle and fertility" from search,
       a notification, Help) brings it up in the dock */
    /* only a header that goes from closed to open counts: the dock itself
       re-marks the one it shows as open, and that must not echo back */
    new MutationObserver(function(ms){
      if(!built) return;
      var want='';
      ms.forEach(function(m){
        var h=m.target; if(!h.classList||!h.classList.contains('vsec-h')||!h.classList.contains('open')) return;
        if(/(^|\s)open(\s|$)/.test(m.oldValue||'')) return;
        if(mine[h.dataset.s]){ delete mine[h.dataset.s]; return; }
        if(h.dataset.s&&h.dataset.s!==cur) want=h.dataset.s;
      });
      if(want) show(want,false);
    }).observe(s,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['class']});
    /* fresh numbers each time Vitals is opened */
    new MutationObserver(function(){ lift(); if(s.classList.contains('on')&&built){ var sb=$('kvdSub'); if(sb) sb.textContent=summary(cur); paintCards(cur); center(false); } })
      .observe(s,{attributes:true,attributeFilter:['class']});
  }

  /* nothing is moved until Vitals is first opened, so loading Kova stays light */
  /* the guided tour of Vitals walks the dock: each stop opens its section */
  function tour(){
    var T=window.KovaScreenTour; if(!T||!T.register) return;
    var q=function(sel){ return function(){ return document.querySelector(sel); }; };
    var at=function(id){ return function(){ show(id,false); }; };
    T.register('vitals','Vitals',[
      ['Pick a part of Vitals','Every part of Vitals is one tile here. Swipe along, then tap one.','#kvdDock'],
      ['Where you are','The part you are on, and arrows to step through all of them.','#kvdHead'],
      ['Recovery','Today\u2019s score from sleep, HRV and resting heart rate, and where it sits.',q('#s-vitals .kvd-power .kvd-big'),'vitals',at('today')],
      ['Three readings','HRV, resting heart rate and sleep against your normal. Coloured when one is off.',q('#s-vitals .kvd-sms'),'vitals',at('today')],
      ['Sleep and trend','Two weeks of nights: a long dash is a full night, a dot is a night with no data.',q('#s-vitals .kvd-trend'),'vitals',at('today')],
      ['Steadiest and most off','The reading closest to your normal, and the one furthest from it.',function(){ return document.querySelector('#s-vitals .kvd-pair')||document.querySelector('#s-vitals .kvd-empty'); },'vitals',at('signals')],
      ['Every reading','Each signal against your own normal range. Tap one to read it.','#sigBio','vitals',at('signals')],
      ['Connect your watch','Link your watch, ring or band for real readings, not estimates. Tap its picture there to choose yours.','#s-vitals .ronrange[data-go="watch"]','vitals',at('feeling')],
      ['Heart and stress','Your heart through the day, and when stress peaked.','#s-vitals .card[data-go="stress"]','vitals',at('heart')],
      ['Health and actions','Add conditions and medication for reminders.','#s-vitals .card[data-go="health"]','vitals',at('care')],
      ['Find anything','Tap here and type what you are looking for: a reading, a screen, a task.','#s-vitals .hdr-r [data-kcmd]']
    ]);
  }
  tour();
  function lift(){ var s=scr(); document.body.classList.toggle('kvd-vis',!!(s&&built&&s.classList.contains('on'))); }
  function start(){
    var s=scr(); if(!s) return;
    watch();
    if(s.classList.contains('on')){ seen=true; if(!build()) setTimeout(build,400); return; }
    var mo=new MutationObserver(function(){ if(s.classList.contains('on')){ mo.disconnect(); seen=true; if(!build()) setTimeout(build,400); } });
    mo.observe(s,{attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();

  return {show:show,step:step,build:build,current:function(){ return cur; },sections:function(){ return sections().map(function(x){ return {id:x.id,n:x.n}; }); },
    summary:summary,dev:dev,_power:powerHtml,_pair:pairHtml,_nights:nights};
})();
