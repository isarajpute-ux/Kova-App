/* =====================================================================
   KovaCut - edit a post's clips into one video, in the Studio (p15).
   Laid out like the reference (image 3):
     preview      the edit as it plays, filters and turns included
     playhead     a time bubble (where you are · how long it is), a line,
                  and a + that adds a clip there
     clips        rounded tiles with a filmstrip; < > on the ends trim
                  them; the chosen one has a dashed outline
     music        a dashed track: "Click to add music", then its volume
                  and where in the song it starts
     tools        Upscale, Speed, Filter, Split, and a red Delete
   "Save video" records the edit for real: every clip is played into a
   canvas at the output size and mixed with its own sound and the music
   (Web Audio), recorded with MediaRecorder (MP4 where the browser can,
   otherwise WebM), and the file goes into the post in place of the clips
   it was made from (they stay in Media, switched off). The edit itself is
   kept with the post, so it opens as you left it.
   ===================================================================== */
window.KovaCut=(function(){
  'use strict';
  var KPo=window.KovaPost, KB=window.KovaBlobs;
  if(!KPo||!KB) return null;
  var PPS=46, IMG=3, MINLEN=.4;
  var FILTERS=[['none','Original'],['saturate(1.35) contrast(1.08)','Vivid'],['grayscale(1) contrast(1.1)','Mono'],
    ['sepia(.25) saturate(1.2) hue-rotate(-8deg)','Warm'],['saturate(1.1) hue-rotate(12deg) brightness(1.03)','Cool'],['contrast(.88) brightness(1.08) saturate(.8)','Fade']];
  var SPEEDS=[.5,1,1.5,2];
  var C=null;                                        // the open editor
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function $(s,r){ return (r||document).querySelector(s); }
  function uid(){ return 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function mmss(s){ s=Math.max(0,Math.round(s||0)); return ('0'+Math.floor(s/60)).slice(-2)+':'+('0'+s%60).slice(-2); }
  function toast(t){ try{ if(window.KovaCanvas&&KovaCanvas.toast) KovaCanvas.toast(t); else if(window.toast) window.toast(t); }catch(e){} }
  var IC={
    back:'<path d="M19 12H5M11 6l-6 6 6 6"/>', play:'<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
    pause:'<path d="M8 5v14M16 5v14" stroke-width="2.6"/>', plus:'<path d="M12 5v14M5 12h14" stroke-width="2.2"/>',
    l:'<path d="M14.5 6l-6 6 6 6"/>', r:'<path d="M9.5 6l6 6-6 6"/>', note:'<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    up:'<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z"/><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    speed:'<path d="M4.5 15a8 8 0 1 1 15 0"/><path d="M12 15l4-5"/><circle cx="12" cy="15" r="1.4" fill="currentColor"/>',
    filter:'<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" opacity=".85"/>',
    split:'<path d="M12 3v18"/><path d="M8 7l-4 5 4 5M16 7l4 5-4 5"/>', turn:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6M5.5 7l.9 11.6A2 2 0 0 0 8.4 20.5h7.2a2 2 0 0 0 2-1.9L18.5 7M9 7V4.5h6V7"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function ic(k){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[k]+'</svg>'; }

  /* ---------------- the edit ---------------- */
  function total(){ return C.cut.clips.reduce(function(s,c){ return s+len(c); },0); }
  function len(c){ return Math.max(MINLEN,(c.out-c.in)/(c.speed||1)); }
  function startOf(i){ var s=0; for(var j=0;j<i;j++) s+=len(C.cut.clips[j]); return s; }
  function at(t){                                    // which clip plays at t, and where in its file
    var s=0, cl=C.cut.clips;
    for(var i=0;i<cl.length;i++){ var L=len(cl[i]); if(t<s+L||i===cl.length-1) return {i:i,c:cl[i],local:cl[i].in+Math.max(0,Math.min(L,t-s))*(cl[i].speed||1),start:s}; s+=L; }
    return null;
  }
  function media(id){ return (C.post.media||[]).filter(function(m){ return m.id===id; })[0]||null; }
  function fromMedia(m){ var d=isFinite(m.dur)&&m.dur>0?m.dur:5; return {id:uid(),mid:m.id,kind:m.kind,in:0,out:m.kind==='video'?d:IMG,dur:m.kind==='video'?d:30,speed:1,rot:0,filter:'none'}; }
  function save(){ C.post.cut=JSON.parse(JSON.stringify(C.cut)); KPo.save(C.post); }

  /* the elements that play each source file */
  function el(c){
    if(C.els[c.mid]) return Promise.resolve(C.els[c.mid]);
    var m=media(c.mid); if(!m) return Promise.resolve(null);
    return KB.get(m.blob).then(function(b){
      if(!b||!C) return null;
      var u=URL.createObjectURL(b); C.urls.push(u);
      return new Promise(function(ok){
        if(m.kind==='image'){ var im=new Image(); im.onload=function(){ ok(im); }; im.onerror=function(){ ok(null); }; im.src=u; C.els[c.mid]=im; return; }
        var v=document.createElement('video'); v.playsInline=true; v.preload='auto'; v.src=u; v.crossOrigin='anonymous';
        v.onloadeddata=function(){ ok(v); }; v.onerror=function(){ ok(null); };
        C.els[c.mid]=v; hook(v,m);
      });
    });
  }
  /* sound: every clip and the music go through one mix, to the speakers
     and to the recorder */
  function audio(){
    if(C.ac!==undefined) return C.ac;
    var A=window.AudioContext||window.webkitAudioContext; C.ac=null;
    if(!A) return null;
    try{
      var ac=new A(); C.ac=ac;
      C.mix=ac.createGain(); C.mon=ac.createGain(); C.mix.connect(C.mon); C.mon.connect(ac.destination);
      if(ac.createMediaStreamDestination){ C.dest=ac.createMediaStreamDestination(); C.mix.connect(C.dest); }
    }catch(e){ C.ac=null; }
    return C.ac;
  }
  function hook(node,m){
    var ac=audio(); if(!ac||(m&&m.sound===false)) return;
    try{ var s=ac.createMediaElementSource(node); s.connect(C.mix); }catch(e){}
  }

  /* ---------------- drawing a frame ---------------- */
  function outSize(){
    var c=C.cut.clips[0], m=c&&media(c.mid); var w=(m&&m.w)||1080, h=(m&&m.h)||1920;
    if(c&&(c.rot===90||c.rot===270)){ var t=w; w=h; h=t; }
    var L=Math.max(w,h), want=C.cut.up?1920:Math.min(L,1920), k=want/L;
    return {w:Math.round(w*k/2)*2,h:Math.round(h*k/2)*2,src:L};
  }
  function draw(ctx,W,H,c,node){
    ctx.save(); ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
    if(!node){ ctx.restore(); return; }
    var sw=node.videoWidth||node.naturalWidth||node.width, sh=node.videoHeight||node.naturalHeight||node.height;
    if(!sw||!sh){ ctx.restore(); return; }
    var rot=(c.rot||0)%360, rw=rot%180?sh:sw, rh=rot%180?sw:sh;
    var hasF='filter' in ctx, f=c.filter&&c.filter!=='none'?c.filter:'none', tint=TINT[f];
    if(tint) hasF=false;           /* Warm and Cool are colour tints everywhere, drawn after the frame */
    /* a soft blurred fill behind a clip of another shape, then the clip whole */
    if(Math.abs(rw/rh-W/H)>.02&&('filter' in ctx)){
      var kc=Math.max(W/rw,H/rh); ctx.filter='blur(24px) brightness(.6)'+(f!=='none'&&!tint?' '+f:'');
      ctx.translate(W/2,H/2); ctx.rotate(rot*Math.PI/180); ctx.drawImage(node,-sw*kc/2,-sh*kc/2,sw*kc,sh*kc); ctx.setTransform(1,0,0,1,0,0);
    }
    var k=Math.min(W/rw,H/rh);
    if('filter' in ctx) ctx.filter=hasF?f:'none';
    ctx.translate(W/2,H/2); ctx.rotate(rot*Math.PI/180);
    ctx.drawImage(node,-sw*k/2,-sh*k/2,sw*k,sh*k);
    ctx.restore();
    if(!hasF&&f!=='none') look(ctx,W,H,f);
  }
  /* Safari's canvas has no filter: the same looks made with colour
     blending, which every browser has (drawn over the finished frame) */
  var TINT={'sepia(.25) saturate(1.2) hue-rotate(-8deg)':1,'saturate(1.1) hue-rotate(12deg) brightness(1.03)':1};
  var LOOK={
    'saturate(1.35) contrast(1.08)':[['saturation','hsl(0,100%,50%)',.22],['soft-light','#808080',.0]],
    'grayscale(1) contrast(1.1)':[['saturation','#808080',1],['soft-light','#7a7a7a',.25]],
    'sepia(.25) saturate(1.2) hue-rotate(-8deg)':[['soft-light','#FF9A3C',.38]],
    'saturate(1.1) hue-rotate(12deg) brightness(1.03)':[['soft-light','#3C8CFF',.34]],
    'contrast(.88) brightness(1.08) saturate(.8)':[['screen','#FFFFFF',.14],['saturation','#808080',.22]]
  };
  function look(ctx,W,H,f){
    var L=LOOK[f]; if(!L) return;
    ctx.save();
    L.forEach(function(x){ if(!x[2]) return; ctx.globalCompositeOperation=x[0]; ctx.globalAlpha=x[2]; ctx.fillStyle=x[1]; ctx.fillRect(0,0,W,H); });
    ctx.restore();
  }
  function paintFrame(){
    if(!C||!C.cut.clips.length) return;
    var a=at(C.t); if(!a) return;
    var node=C.els[a.c.mid], cv=$('#kctCv'), ctx=cv.getContext('2d');
    draw(ctx,cv.width,cv.height,a.c,node);
  }
  function sizeCanvas(){
    var cv=$('#kctCv'), box=$('.kct-view'), o=outSize(), r=box.getBoundingClientRect();
    var k=Math.min(1,720/Math.max(o.w,o.h)); cv.width=Math.round(o.w*k); cv.height=Math.round(o.h*k);
    var cs=getComputedStyle(box), pw=r.width-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight), ph=r.height-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
    var s=Math.max(.05,Math.min(pw/cv.width,ph/cv.height));
    cv.style.width=Math.round(cv.width*s)+'px'; cv.style.height=Math.round(cv.height*s)+'px';
  }

  /* ---------------- playing ---------------- */
  function seek(t,then){
    C.t=Math.max(0,Math.min(total(),t));
    var a=at(C.t); if(!a){ paintFrame(); return; }
    el(a.c).then(function(node){
      if(!C) return;
      if(node&&node.tagName==='VIDEO'){
        if(Math.abs(node.currentTime-a.local)>.04){ node.onseeked=function(){ node.onseeked=null; paintFrame(); if(then) then(node,a); }; try{ node.currentTime=a.local; }catch(e){ paintFrame(); } return; }
      }
      paintFrame(); if(then) then(node,a);
    });
    stamp();
  }
  function stamp(){ var b=$('#kctTime'); if(b) b.innerHTML='<b>'+mmss(C.t)+'</b> '+mmss(total()); }
  function stopAll(){ Object.keys(C.els).forEach(function(k){ var n=C.els[k]; if(n&&n.pause) try{ n.pause(); }catch(e){} }); if(C.music&&C.music.el) try{ C.music.el.pause(); }catch(e){} }
  function play(rec){
    if(!C.cut.clips.length) return Promise.resolve();
    var ac=audio(); if(ac&&ac.state==='suspended') ac.resume().catch(function(){});
    if(C.t>=total()-.05) C.t=0;
    C.playing=true; paintPlay();
    return new Promise(function(done){
      C.onEnd=done;
      var music=C.music&&C.music.el;
      if(music){ try{ music.currentTime=(C.cut.music.off||0)+C.t; music.volume=1; var mp=music.play(); if(mp&&mp.catch) mp.catch(function(){}); }catch(e){} }
      runClip(rec);
    });
  }
  function runClip(rec){
    if(!C||!C.playing) return;
    var a=at(C.t); if(!a) return finish();
    seek(C.t,function(node,a2){
      if(!C||!C.playing) return;
      var c=a2.c, s0=a2.start, endT=s0+len(c), cv=rec?rec.cv:$('#kctCv'), ctx=cv.getContext('2d');
      C.activeMid=c.mid;
      if(node&&node.tagName==='VIDEO'){
        node.playbackRate=c.speed||1; if('preservesPitch' in node) node.preservesPitch=true;
        var pr=node.play(); if(pr&&pr.catch) pr.catch(function(){});
      }
      var t0=performance.now(), base=C.t, lastT=-1, still=performance.now(), retried=false;
      (function tick(){
        if(!C||!C.playing) return;
        /* the watchdog: a phone can refuse to play a clip that a tap did
           not start. Try once more, then stop cleanly instead of hanging. */
        if(node&&node.tagName==='VIDEO'){
          if(node.currentTime!==lastT){ lastT=node.currentTime; still=performance.now(); }
          else if(!node.ended&&performance.now()-still>2500){
            if(!retried){ retried=true; still=performance.now(); var p2=node.play(); if(p2&&p2.catch) p2.catch(function(){}); }
            else { var was=!!rec; pause(); toast(was?'Your phone paused the video while saving. Tap Save video again.':'Your phone paused the video. Tap play again.'); return; }
          }
        }
        if(node&&node.tagName==='VIDEO') C.t=s0+(node.currentTime-c.in)/(c.speed||1);
        else C.t=base+(performance.now()-t0)/1000;
        draw(ctx,cv.width,cv.height,c,node);
        if(rec) rec.prog(C.t/total());
        else { follow(); stamp(); }
        var ended=node&&node.tagName==='VIDEO'?(node.ended||node.currentTime>=c.out-.03):C.t>=endT;
        if(ended){
          if(node&&node.pause) node.pause();
          C.t=endT;
          if(C.t>=total()-.01) return finish();
          return runClip(rec);
        }
        C.raf=requestAnimationFrame(tick);
      })();
    });
  }
  function finish(){ if(!C) return; C.playing=false; stopAll(); paintPlay(); var f=C.onEnd; C.onEnd=null; if(f) f(); }
  /* iPhones let a clip with sound play only if a tap started it, and the
     edit starts its clips a moment after the tap. So on the tap itself
     every clip and the song are started (silenced through the mix) and
     paused again, which unlocks them for the rest of the edit. */
  function unlock(){
    var ac=audio(); if(ac&&ac.state==='suspended') ac.resume().catch(function(){});
    var nodes=Object.keys(C.els).map(function(k){ return [k,C.els[k]]; }).filter(function(x){ return x[1]&&x[1].tagName==='VIDEO'; });
    if(C.music&&C.music.el) nodes.push(['__music',C.music.el]);
    var g=C.mon, before=g?g.gain.value:1; if(g) g.gain.value=0;
    nodes.forEach(function(x){
      var n=x[1]; if(!n.paused) return;
      try{ var p=n.play(); if(p&&p.then) p.then(function(){ if(C&&C.activeMid!==x[0]&&!(x[0]==='__music'&&C.playing)) n.pause(); }).catch(function(){}); }catch(e){}
    });
    if(g) setTimeout(function(){ if(C&&C.mon&&!C.saving) C.mon.gain.value=before||1; },250);
  }
  function pause(){ if(!C) return; C.playing=false; cancelAnimationFrame(C.raf); stopAll(); paintPlay(); if(C.onEnd){ var f=C.onEnd; C.onEnd=null; f(); } }
  function paintPlay(){ var b=$('#kctPlay'); if(b){ b.innerHTML=ic(C.playing?'pause':'play'); b.setAttribute('aria-label',C.playing?'Pause':'Play'); } }
  /* the timeline scrolls under the playhead */
  function follow(){ var tl=$('#kctTl'); if(!tl) return; C.autoAt=performance.now(); tl.scrollLeft=C.t*PPS; }

  /* ---------------- the timeline ---------------- */
  function filmstrip(c){
    var m=media(c.mid); if(!m) return '';
    var w=len(c)*PPS, n=Math.max(1,Math.round(w/64)), fr=C.frames[c.mid]||[], h='';
    for(var i=0;i<n;i++){
      var tt=c.in+(i+.5)/n*(c.out-c.in), src=m.thumb;
      if(fr.length){ var best=fr[0]; fr.forEach(function(f){ if(Math.abs(f.t-tt)<Math.abs(best.t-tt)) best=f; }); src=best.u; }
      h+='<i style="background-image:url('+src+')"></i>';
    }
    return h;
  }
  function paintTrack(){
    var box=$('#kctClips'); if(!box) return;
    var cl=C.cut.clips;
    if(!cl.length){ box.innerHTML='<button type="button" class="kct-empty" data-k="add">'+ic('plus')+'Add a clip or photo</button>'; }
    else box.innerHTML=cl.map(function(c,i){
      var w=Math.max(28,len(c)*PPS);
      return '<div class="kct-clip'+(i===C.sel?' on':'')+'" data-i="'+i+'" style="width:'+w+'px" role="button" tabindex="0" aria-label="Clip '+(i+1)+', '+len(c).toFixed(1)+' seconds'+(i===C.sel?', chosen':'')+'">'
        +'<div class="fs">'+filmstrip(c)+'</div>'
        +(c.speed!==1?'<span class="tag">'+c.speed+'x</span>':'')+(c.filter!=='none'?'<span class="tag f">'+FILTERS.filter(function(f){ return f[0]===c.filter; })[0][1]+'</span>':'')
        +'<span class="h l" data-h="l" aria-label="Trim the start">'+ic('l')+'</span><span class="h r" data-h="r" aria-label="Trim the end">'+ic('r')+'</span></div>';
    }).join('');
    var mu=$('#kctMusic'), T=total();
    mu.style.width=Math.max(220,T*PPS)+'px';
    mu.setAttribute('aria-label',C.cut.music?'Music: '+C.cut.music.name+'. Change it':'Add music');
    if(C.cut.music){
      mu.classList.add('on');
      mu.innerHTML='<span class="nt">'+ic('note')+'</span><span class="nm">'+esc(C.cut.music.name)+'</span><span class="wv">'+wave()+'</span>';
    }else{ mu.classList.remove('on'); mu.innerHTML='<span class="nt">'+ic('note')+'</span><span class="nm">Click to add music</span>'; }
    stamp(); tools();
  }
  function wave(){ var h=''; for(var i=0;i<48;i++){ var v=.25+.75*Math.abs(Math.sin(i*1.7)*Math.cos(i*.37)); h+='<b style="height:'+Math.round(v*100)+'%"></b>'; } return h; }
  /* frames for the filmstrip, a few per clip, read once */
  function frames(c){
    var m=media(c.mid); if(!m||m.kind!=='video'||C.frames[c.mid]) return Promise.resolve();
    C.frames[c.mid]=[];
    return KB.get(m.blob).then(function(b){
      if(!b||!C) return;
      var u=URL.createObjectURL(b), v=document.createElement('video'); v.muted=true; v.playsInline=true; v.preload='auto'; v.src=u;
      var n=Math.min(12,Math.max(3,Math.round((m.dur||5)/2))), i=0, out=[];
      return new Promise(function(ok){
        function next(){
          if(!C||i>=n){ URL.revokeObjectURL(u); if(C){ C.frames[c.mid]=out; paintTrack(); } return ok(); }
          var tt=(i+.5)/n*(v.duration||m.dur||1); v.onseeked=function(){
            try{ var cv=document.createElement('canvas'), k=90/Math.max(v.videoWidth,v.videoHeight); cv.width=Math.round(v.videoWidth*k); cv.height=Math.round(v.videoHeight*k);
              cv.getContext('2d').drawImage(v,0,0,cv.width,cv.height); out.push({t:tt,u:cv.toDataURL('image/jpeg',.6)}); }catch(e){}
            i++; next(); };
          try{ v.currentTime=tt; }catch(e){ ok(); }
        }
        v.onloadeddata=next; v.onerror=function(){ ok(); };
      });
    });
  }
  function tools(){
    var c=C.cut.clips[C.sel], o=outSize(), up=$('#kctUp');
    if(up){ up.classList.toggle('on',!!C.cut.up); up.setAttribute('aria-pressed',String(!!C.cut.up)); up.disabled=o.src>=1920&&!C.cut.up; up.title=up.disabled?'Already full HD':''; }
    ['speed','filter','split','turn','del'].forEach(function(k){ var b=$('[data-k="'+k+'"]',C.root); if(b) b.disabled=!c||(k==='speed'&&c.kind!=='video'); });
    var sp=$('[data-k="speed"] small',C.root); if(sp) sp.textContent=c&&c.kind==='video'?c.speed+'x':'Speed';
    var fl=$('[data-k="filter"] small',C.root); if(fl) fl.textContent=c?FILTERS.filter(function(f){ return f[0]===c.filter; })[0][1]:'Filter';
  }

  /* ---------------- the page ---------------- */
  function shell(){
    var d=document.createElement('div'); d.className='kct'; d.setAttribute('role','dialog'); d.setAttribute('aria-modal','true'); d.setAttribute('aria-label','Edit video');
    d.innerHTML='<div class="kct-top"><button type="button" class="kct-pill" data-k="close" aria-label="Back to the post">'+ic('back')+'</button>'
        +'<div class="kct-ttl">Edit video</div><button type="button" class="kct-save" data-k="save">Save video</button></div>'
      +'<div class="kct-view"><canvas id="kctCv" width="360" height="640"></canvas><button type="button" class="kct-play" id="kctPlay" data-k="play" aria-label="Play">'+ic('play')+'</button></div>'
      +'<div class="kct-tlw"><div class="kct-head"><span class="kct-time" id="kctTime"></span><span class="kct-line"></span>'
          +'<button type="button" class="kct-plus" data-k="add" aria-label="Add a clip here">'+ic('plus')+'</button></div>'
        +'<div class="kct-tl" id="kctTl" tabindex="0" aria-label="Timeline: scroll to move through the video"><div class="kct-in">'
          +'<div class="kct-clips" id="kctClips"></div>'
          +'<button type="button" class="kct-music" id="kctMusic" data-k="music" aria-label="Add music"></button></div></div></div>'
      +'<div class="kct-mopt" id="kctMopt" hidden></div>'
      +'<div class="kct-tools">'
        +'<button type="button" class="kct-t wide" id="kctUp" data-k="up" aria-pressed="false">'+ic('up')+'<span>Upscale</span></button>'
        +'<button type="button" class="kct-t" data-k="speed" aria-label="Speed">'+ic('speed')+'<small>1x</small></button>'
        +'<button type="button" class="kct-t" data-k="filter" aria-label="Filter">'+ic('filter')+'<small>Filter</small></button>'
        +'<button type="button" class="kct-t" data-k="split" aria-label="Split at the playhead">'+ic('split')+'<small>Split</small></button>'
        +'<button type="button" class="kct-t" data-k="turn" aria-label="Turn">'+ic('turn')+'<small>Turn</small></button>'
        +'<button type="button" class="kct-t red" data-k="del" aria-label="Delete the chosen clip">'+ic('trash')+'</button></div>'
      +'<input type="file" id="kctFile" accept="video/*,image/*" multiple hidden><input type="file" id="kctAud" accept="audio/*" hidden>'
      +'<div class="kct-busy" id="kctBusy" hidden><div><b>Saving your video</b><p>Keep Kova open. It plays the edit once to record it.</p><div class="bar"><i id="kctBar"></i></div><button type="button" class="kct-pill" data-k="cancel">Cancel</button></div></div>';
    document.body.appendChild(d);
    return d;
  }

  /* ---------------- actions ---------------- */
  function addFiles(files){
    var list=Array.prototype.slice.call(files||[]).filter(function(f){ return /^(video|image)\//.test(f.type); });
    if(!list.length) return;
    var p=C.post, chain=Promise.resolve(), made=[];
    list.forEach(function(f){ chain=chain.then(function(){ return KPo.probe(f).then(function(m){ m.on=false; p.media.push(m); made.push(fromMedia(m)); }); }); });
    chain.then(function(){
      if(!C||!made.length) return;
      /* after the clip under the playhead */
      var a=at(C.t), i=a?(C.t-a.start<len(a.c)/2?a.i:a.i+1):0;
      Array.prototype.splice.apply(C.cut.clips,[i,0].concat(made));
      C.sel=i; save(); sizeCanvas(); paintTrack(); made.forEach(frames); seek(startOf(i));
      try{ if(window.KovaCanvas&&KovaCanvas._render) KovaCanvas._render(); }catch(e){}
    }).catch(function(e){ toast(e&&e.message||'That file could not be added.'); });
  }
  function addMusic(file){
    if(!file||!/^audio\//.test(file.type)) return toast('Pick a song or a sound file.');
    var key='mu'+Date.now().toString(36);
    KB.put(key,file).then(function(){
      if(!C) return;
      if(C.cut.music&&C.cut.music.blob) KB.del(C.cut.music.blob);
      C.cut.music={blob:key,name:(file.name||'Music').replace(/\.[a-z0-9]+$/i,''),off:0,vol:.8};
      save(); loadMusic(); paintTrack(); musicOpts(true);
    });
  }
  function loadMusic(){
    if(C.music&&C.music.el){ try{ C.music.el.pause(); }catch(e){} }
    C.music=null;
    var mu=C.cut.music; if(!mu) return;
    KB.get(mu.blob).then(function(b){
      if(!b||!C) return;
      var u=URL.createObjectURL(b); C.urls.push(u);
      var a=new Audio(); a.src=u; a.preload='auto'; a.crossOrigin='anonymous';
      var ac=audio(), g=null;
      if(ac){ try{ var s=ac.createMediaElementSource(a); g=ac.createGain(); g.gain.value=mu.vol; s.connect(g); g.connect(C.mix); }catch(e){ g=null; } }
      if(!g) a.volume=mu.vol;
      a.onloadedmetadata=function(){ if(C&&C.music) C.music.dur=a.duration||0; };
      C.music={el:a,gain:g,dur:0};
    });
  }
  /* the music's own row: volume, where in the song it starts, change it */
  function musicOpts(show){
    var box=$('#kctMopt'), mu=C.cut.music;
    if(show===undefined) show=box.hidden;
    if(!mu||!show){ box.hidden=true; return; }
    box.hidden=false;
    var d=C.music&&C.music.dur?Math.max(0,Math.floor(C.music.dur-1)):300;
    box.innerHTML='<label>Volume <input type="range" min="0" max="100" value="'+Math.round(mu.vol*100)+'" data-m="vol"></label>'
      +'<label>Starts at <input type="range" min="0" max="'+d+'" value="'+Math.round(mu.off||0)+'" data-m="off"><b id="kctOff">'+mmss(mu.off||0)+'</b></label>'
      +'<div class="row"><button type="button" class="kct-pill" data-k="music-new">Another song</button><button type="button" class="kct-pill red" data-k="music-rm">Remove music</button></div>';
  }
  function split(){
    var a=at(C.t); if(!a) return;
    var c=a.c, L=a.local, b=JSON.parse(JSON.stringify(c)); b.id=uid();
    if(c.kind==='image'){                            // a photo: its length splits in two
      if(L<MINLEN||c.out-L<MINLEN) return toast('Move the playhead into the clip to split it.');
      b.in=0; b.out=c.out-L; c.out=L;
    }else{
      if(L-c.in<MINLEN||c.out-L<MINLEN) return toast('Move the playhead into the clip to split it.');
      b.in=L; c.out=L;
    }
    C.cut.clips.splice(a.i+1,0,b); C.sel=a.i+1; save(); paintTrack(); toast('Split.');
  }
  function del(){
    if(!C.cut.clips.length) return;
    C.cut.clips.splice(C.sel,1); C.sel=Math.max(0,Math.min(C.sel,C.cut.clips.length-1));
    save(); if(C.cut.clips.length) sizeCanvas(); paintTrack(); seek(Math.min(C.t,total()));
  }
  function choose(i){ C.sel=i; paintTrack(); }

  /* trimming: drag a < or > handle */
  function trimStart(e,i,side){
    e.preventDefault(); e.stopPropagation();
    var c=C.cut.clips[i], x0=e.clientX, in0=c.in, out0=c.out, tl=$('#kctTl');
    choose(i); pause();
    function mv(ev){
      var ds=(ev.clientX-x0)/PPS*(c.speed||1);
      if(side==='l'&&c.kind==='video') c.in=Math.max(0,Math.min(out0-MINLEN,in0+ds));
      else if(side==='l') c.out=Math.max(MINLEN,Math.min(c.dur,out0-ds));
      else c.out=Math.max(c.in+MINLEN,Math.min(c.dur,out0+ds));
      paintTrack(); C.t=startOf(i)+(side==='r'?len(c):0); C.autoAt=performance.now(); tl.scrollLeft=C.t*PPS; seek(C.t);
    }
    function upf(){ document.removeEventListener('pointermove',mv); document.removeEventListener('pointerup',upf); save(); }
    document.addEventListener('pointermove',mv); document.addEventListener('pointerup',upf);
  }

  /* ---------------- saving the video ---------------- */
  function pickType(){
    if(!window.MediaRecorder||!MediaRecorder.isTypeSupported) return '';
    var T=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1,mp4a','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
    for(var i=0;i<T.length;i++) if(MediaRecorder.isTypeSupported(T[i])) return T[i];
    return '';
  }
  function canSave(){ var cv=document.createElement('canvas'); return !!(pickType()&&cv.captureStream); }
  function exportVideo(){
    if(!C.cut.clips.length) return toast('Add a clip first.');
    if(!canSave()) return toast('This browser cannot save video. Use Chrome, Edge or Safari, or the Kova app.');
    pause();
    var type=pickType(), o=outSize(), cv=document.createElement('canvas'); cv.width=o.w; cv.height=o.h;
    var stream=cv.captureStream(30), ac=audio();
    if(ac&&C.dest) C.dest.stream.getAudioTracks().forEach(function(t){ stream.addTrack(t); });
    if(C.mon) C.mon.gain.value=0;                    // record the sound without playing it aloud
    var chunks=[], rec;
    try{ rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:Math.max(o.w,o.h)>=1900?9e6:5e6,audioBitsPerSecond:160000}); }
    catch(e){ if(C.mon) C.mon.gain.value=1; return toast('Saving video failed to start here.'); }
    rec.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data); };
    var busy=$('#kctBusy'), bar=$('#kctBar'); busy.hidden=false; bar.style.width='0%';
    C.saving={rec:rec,cancel:false};
    var stopped=new Promise(function(ok){ rec.onstop=ok; });
    C.t=0; rec.start(250);
    play({cv:cv,prog:function(f){ bar.style.width=Math.round(Math.min(1,f)*100)+'%'; }}).then(function(){
      setTimeout(function(){ try{ rec.stop(); }catch(e){} },120);
      return stopped;
    }).then(function(){
      if(!C) return;
      if(C.mon) C.mon.gain.value=1;
      busy.hidden=true;
      var was=C.saving; C.saving=null;
      if(was&&was.cancel) return toast('Not saved.');
      var mime=type.split(';')[0], ext=/mp4/.test(mime)?'mp4':'webm';
      var name=String(C.post.title||'kova').replace(/[^\w\- ]+/g,'').trim().slice(0,40)||'kova';
      var file=new File([new Blob(chunks,{type:mime})],name+' edit.'+ext,{type:mime});
      return KPo.probe(file).then(function(m){
        if(!isFinite(m.dur)||!m.dur) m.dur=Math.round(total()*10)/10;   // recorded WebM often reports no length
        var used={}; C.cut.clips.forEach(function(c){ used[c.mid]=1; });
        C.post.media.forEach(function(x){ if(used[x.id]) x.on=false; });
        m.on=true; m.edit=true; C.post.media.unshift(m);
        C.post.format=KPo.naturalFormat(C.post); if(C.post.aspect==='4:5') C.post.aspect='orig';
        save();
        toast('Saved: a '+mmss(total())+' '+ext.toUpperCase()+' video is now the post'+(ext==='webm'?' (YouTube and X take WebM; for Instagram and TikTok, save it from Safari or the Kova app for MP4)':'')+'. The clips it came from stay in Media, switched off.');
        var done=C.post;
        close();
        try{ if(window.KovaCanvas&&KovaCanvas._render) KovaCanvas._render(); }catch(e){}
        /* ready to go out: hand it to the Social Media Manager */
        try{ if(window.KovaAsk&&done) setTimeout(function(){ KovaAsk.offerSend(done); },400); }catch(e){}
      });
    }).catch(function(){ if(C){ busy.hidden=true; if(C.mon) C.mon.gain.value=1; } toast('Saving the video failed.'); });
  }

  /* ---------------- wiring ---------------- */
  function wire(){
    var r=C.root, tl=$('#kctTl');
    r.addEventListener('click',function(e){
      var b=e.target.closest('[data-k]');
      var clip=e.target.closest('.kct-clip');
      if(clip&&!e.target.closest('[data-h]')){ var i=+clip.getAttribute('data-i'); choose(i); if(!C.playing) seek(startOf(i)+.01,null); return; }
      if(!b) return;
      var k=b.getAttribute('data-k'), c=C.cut.clips[C.sel];
      if(k==='close') close();
      else if(k==='play'){ if(C.playing) pause(); else { unlock(); play(); } }
      else if(k==='add'){ pause(); $('#kctFile').click(); }
      else if(k==='music'){ if(C.cut.music) musicOpts(); else $('#kctAud').click(); }
      else if(k==='music-new') $('#kctAud').click();
      else if(k==='music-rm'){ if(C.cut.music) KB.del(C.cut.music.blob); C.cut.music=null; save(); loadMusic(); paintTrack(); musicOpts(false); }
      else if(k==='up'){ C.cut.up=!C.cut.up; save(); sizeCanvas(); paintFrame(); tools(); var o=outSize(); toast(C.cut.up?'Saves at '+Math.max(o.w,o.h)+'p, up from '+o.src+'p.':'Saves at the clips’ own size.'); }
      else if(k==='speed'&&c&&c.kind==='video'){ c.speed=SPEEDS[(SPEEDS.indexOf(c.speed)+1)%SPEEDS.length]; save(); paintTrack(); }
      else if(k==='filter'&&c){ var fi=0; FILTERS.forEach(function(f,j){ if(f[0]===c.filter) fi=j; }); c.filter=FILTERS[(fi+1)%FILTERS.length][0]; save(); paintTrack(); paintFrame(); }
      else if(k==='turn'&&c){ c.rot=((c.rot||0)+90)%360; save(); if(C.sel===0) sizeCanvas(); paintFrame(); }
      else if(k==='split') split();
      else if(k==='del') del();
      else if(k==='save'){ unlock(); exportVideo(); }
      else if(k==='cancel'&&C.saving){ C.saving.cancel=true; pause(); }
    });
    r.addEventListener('pointerdown',function(e){ var h=e.target.closest('[data-h]'); if(!h) return; var clip=h.closest('.kct-clip'); trimStart(e,+clip.getAttribute('data-i'),h.getAttribute('data-h')); });
    r.addEventListener('keydown',function(e){ var clip=e.target.closest&&e.target.closest('.kct-clip'); if(clip&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); choose(+clip.getAttribute('data-i')); } });
    r.addEventListener('input',function(e){
      var m=e.target.getAttribute('data-m'), mu=C.cut.music; if(!m||!mu) return;
      if(m==='vol'){ mu.vol=+e.target.value/100; if(C.music){ if(C.music.gain) C.music.gain.gain.value=mu.vol; else C.music.el.volume=mu.vol; } }
      if(m==='off'){ mu.off=+e.target.value; var o=$('#kctOff'); if(o) o.textContent=mmss(mu.off); }
      save();
    });
    $('#kctFile').addEventListener('change',function(){ addFiles(this.files); this.value=''; });
    $('#kctAud').addEventListener('change',function(){ addMusic(this.files&&this.files[0]); this.value=''; });
    /* scrolling the timeline is scrubbing */
    var sT=null;
    tl.addEventListener('scroll',function(){
      if(performance.now()-(C.autoAt||0)<120) return;
      if(C.playing) pause();
      C.t=Math.max(0,Math.min(total(),tl.scrollLeft/PPS)); stamp();
      clearTimeout(sT); sT=setTimeout(function(){ if(C) seek(C.t); },40);
    },{passive:true});
    tl.addEventListener('keydown',function(e){ var d={ArrowRight:1,ArrowLeft:-1}[e.key]; if(!d) return; e.preventDefault(); tl.scrollLeft+=d*PPS*.5; });
    C.onKey=function(e){ if(e.key==='Escape'&&!C.saving){ e.stopPropagation(); close(); } else if(e.key===' '&&e.target===document.body){ e.preventDefault(); if(C.playing) pause(); else play(); } };
    document.addEventListener('keydown',C.onKey,true);
    C.onResize=function(){ sizeCanvas(); paintFrame(); };
    window.addEventListener('resize',C.onResize);
  }

  /* ---------------- open and close ---------------- */
  function open(post){
    if(!post) return;
    close();
    var inc=KPo.included(post);
    var cut=post.cut&&post.cut.clips?JSON.parse(JSON.stringify(post.cut)):{clips:inc.filter(function(m){ return !m.edit; }).map(fromMedia),music:null,up:false};
    cut.clips=cut.clips.filter(function(c){ return (post.media||[]).some(function(m){ return m.id===c.mid; }); });
    cut.clips.forEach(function(c){ if(!(c.out>c.in)){ var m=(post.media||[]).filter(function(x){ return x.id===c.mid; })[0], f=fromMedia(m); c.in=f.in; c.out=f.out; c.dur=f.dur; } });
    if(!cut.clips.length&&inc.length) cut.clips=inc.map(fromMedia);
    C={post:post,cut:cut,sel:0,t:0,els:{},urls:[],frames:{},playing:false,opener:document.activeElement};
    C.root=shell();
    requestAnimationFrame(function(){ if(C) C.root.classList.add('in'); });
    wire(); paintTrack(); loadMusic();
    setTimeout(function(){ if(!C) return; sizeCanvas(); seek(0); },30);
    cut.clips.forEach(frames);
    cut.clips.forEach(function(c){ el(c); });     /* every clip ready before the first tap (see unlock) */
    var sv=$('[data-k="save"]',C.root); if(!canSave()){ sv.title='This browser cannot save video'; }
    try{ $('#kctPlay').focus({preventScroll:true}); }catch(e){}
  }
  function close(){
    if(!C) return;
    var c=C; C.playing=false; cancelAnimationFrame(C.raf);
    try{ Object.keys(c.els).forEach(function(k){ var n=c.els[k]; if(n&&n.pause){ n.pause(); n.removeAttribute('src'); } }); }catch(e){}
    if(c.music&&c.music.el) try{ c.music.el.pause(); }catch(e){}
    c.urls.forEach(function(u){ try{ URL.revokeObjectURL(u); }catch(e){} });
    if(c.ac&&c.ac.close) c.ac.close().catch(function(){});
    document.removeEventListener('keydown',c.onKey,true); window.removeEventListener('resize',c.onResize);
    C=null; c.root.remove();
    try{ if(c.opener&&c.opener.focus) c.opener.focus({preventScroll:true}); }catch(e){}
  }
  return {open:open,close:close,isOpen:function(){ return !!C; },canSave:canSave,
    _state:function(){ return C; },_total:function(){ return C?total():0; },_split:function(){ split(); },_seek:function(t){ seek(t); },_export:function(){ exportVideo(); },_addFiles:function(f){ addFiles(f); },_addMusic:function(f){ addMusic(f); },_outSize:function(){ return outSize(); },_draw:draw,_look:look};
})();
