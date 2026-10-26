/* KovaFormAI (p28) - Form Check's technique review, by Kova's AI.

   Form Check measures reps, tempo, steadiness and fade from the motion in
   your clip (KovaMotion), but it cannot see joints. This takes still frames
   from your set - the start, the turn and the end of your reps, or evenly
   spread if the reps were not clear - and has Kova's AI (through the
   server, or your own key) report what is VISIBLE: depth, knee and foot
   position, back angle, bar path, lockout. Anything the camera angle hides
   is said to be unclear instead of guessed. A photo gets the same review
   from one frame.

   It runs when you tap "Check my technique", once per clip and lift (each
   review is one AI call with up to 6 small frames). */
window.KovaFormAI=(function(){
  'use strict';
  var cache={};   /* clip+lift -> result */
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function ready(){ return !!(window.KovaModel&&KovaModel.connected()); }

  /* when to look: start, turn and end of the first, middle and last rep */
  function times(res,dur){
    var T=[], R=(res&&res.repStats)||[];
    var add=function(x){ if(isFinite(x)&&x>=0&&x<=dur) T.push(x); };
    if(R.length&&R[0].t0!=null){
      var pick=[R[0],R[Math.floor((R.length-1)/2)],R[R.length-1]];
      add(pick[0].t0); add(pick[0].tTop); add(pick[1].tTop); add(pick[2].t0); add(pick[2].tTop); add(pick[2].t1);
    }
    if(T.length<3){ T=[]; for(var i=1;i<=6;i++) add(dur*(0.05+0.9*(i-1)/5)); }
    T.sort(function(a,b){ return a-b; });
    var out=[]; T.forEach(function(x){ if(!out.length||x-out[out.length-1]>0.2) out.push(x); });
    return out.slice(0,6);
  }
  function seek(v,t){
    return new Promise(function(ok){
      var done=false, h=function(){ if(done) return; done=true; v.removeEventListener('seeked',h); ok(); };
      v.addEventListener('seeked',h);
      try{ v.currentTime=Math.min(t,Math.max(0,(v.duration||0)-0.05)); }catch(e){ h(); }
      setTimeout(h,1200);
    });
  }
  function grab(src,w,h){
    var k=Math.min(1,560/Math.max(w,h)), c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(h*k));
    c.getContext('2d').drawImage(src,0,0,c.width,c.height);
    return c.toDataURL('image/jpeg',0.78);
  }
  function frames(el,res){
    if(el.tagName==='IMG') return Promise.resolve([grab(el,el.naturalWidth||el.width,el.naturalHeight||el.height)]);
    var v=el, T=times(res,v.duration||0), out=[], was=v.currentTime;
    try{ v.pause(); }catch(e){}
    return T.reduce(function(p,t){ return p.then(function(){ return seek(v,t).then(function(){ out.push(grab(v,v.videoWidth,v.videoHeight)); }); }); },Promise.resolve())
      .then(function(){ try{ v.currentTime=was; }catch(e){} return out; });
  }

  function prompt(lift,n,video){
    return 'You are a strength coach reviewing '+(video?n+' still frames, in time order, from one set':'one photo')+' of: '+lift+'.\n'
      +'Report ONLY what is visible. Check what applies to this lift: depth or range, knee and foot position, '
      +'back and spine angle, hip position, bar or handle path, head and neck, heel contact, lockout, symmetry. '
      +'If the camera angle, lighting or framing hides something, give it verdict "unclear" and say why. Never guess an angle you cannot see. '
      +'No motivational language. Be specific, and give one short cue per finding.\n'
      +'Reply with JSON only, no prose, no fences:\n'
      +'{"view":"side|front|45 degrees|back|unclear","overall":"one sentence on the set",'
      +'"findings":[{"area":"short name","seen":"what the frames show","verdict":"good|fix|unclear","cue":"one cue","frames":[1,2]}],'
      +'"safety":"anything that risks injury, or an empty string"}\n'
      +'At most 5 findings, the ones that matter most first.';
  }
  function ask(sys,imgs,text,max){
    var c=KovaModel.cfg(), P=KovaModel.providers[c.p], say=text||'Review my technique.';
    var content=c.p==='anthropic'
      ? imgs.map(function(d){ return {type:'image',source:{type:'base64',media_type:'image/jpeg',data:d.slice(d.indexOf(',')+1)}}; }).concat([{type:'text',text:say}])
      : [{type:'text',text:say}].concat(imgs.map(function(d){ return {type:'image_url',image_url:{url:d}}; }));
    var req=P.build(c.key,c.model,sys,[{role:'user',content:content}],{temperature:0,max_tokens:max||1400});
    return fetch(P.url,{method:'POST',headers:req.headers,body:req.body}).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok) throw new Error((j&&j.error)||('The review did not come back ('+r.status+').'));
        var raw=(P.read(j)||'').replace(/```json|```/g,'').trim(), a=raw.indexOf('{'), z=raw.lastIndexOf('}');
        if(a<0||z<a) throw new Error('The review came back in a form Kova could not read. Try again.');
        return JSON.parse(raw.slice(a,z+1));
      });
    });
  }
  function clean(o){
    var V={good:1,fix:1,unclear:1};
    return {view:String((o&&o.view)||'unclear').slice(0,20),overall:String((o&&o.overall)||'').slice(0,300),
      safety:String((o&&o.safety)||'').slice(0,300),
      findings:((o&&o.findings)||[]).slice(0,5).map(function(f){ return {area:String(f.area||'').slice(0,40),seen:String(f.seen||'').slice(0,300),
        verdict:V[f.verdict]?f.verdict:'unclear',cue:String(f.cue||'').slice(0,160),frames:(Array.isArray(f.frames)?f.frames:[]).filter(function(n){ return n>=1&&n<=6; }).slice(0,6)}; }).filter(function(f){ return f.area&&f.seen; })};
  }

  function card(inner){ return '<div class="card fai">'+inner+'</div>'; }
  function head(sub){ return '<div class="fai-h"><div><div class="fai-t">Technique review</div><div class="sub">'+sub+'</div></div><span class="fai-badge">AI</span></div>'; }
  function paintIdle(host,video){
    host.innerHTML=card(head(video?'Kova’s AI looks at frames from your set: depth, knees, back angle, bar path.':'Kova’s AI looks at your position in this photo.')
      +(ready()?'<button class="btn" data-fai="run">Check my technique</button>'
        :'<div class="sub fai-p">Sign in and Kova’s own AI does this for you (or add your own key in Settings).</div><button class="btn ghost" data-fai="signin">Sign in</button>')
      +'<div class="sub fai-note">Reps and tempo above are measured from the motion. This review is the AI’s read of your position, and it says when the angle hides something.</div>');
  }
  function paintBusy(host,n){ host.innerHTML=card(head(n?'Looking at '+n+' frame'+(n===1?'':'s')+' from your '+(n===1?'photo':'set')+'…':'Taking frames from your set…')+'<div class="fai-bar"><i></i></div>'); }
  function paintResult(host,R,imgs){
    var L={good:'Good',fix:'Fix',unclear:'Can’t tell from this angle'};
    host.innerHTML=card(head('From '+imgs.length+' frame'+(imgs.length===1?'':'s')+(R.view&&R.view!=='unclear'?' · filmed from the '+esc(R.view):'')+' · AI read')
      +'<div class="fai-strip">'+imgs.map(function(d,i){ return '<figure><img alt="Frame '+(i+1)+'" src="'+d+'"><figcaption>'+(i+1)+'</figcaption></figure>'; }).join('')+'</div>'
      +(R.overall?'<div class="fai-o">'+esc(R.overall)+'</div>':'')
      +(R.safety?'<div class="fai-safe"><b>Safety:</b> '+esc(R.safety)+'</div>':'')
      +(R.findings.length?R.findings.map(function(f){
        return '<div class="fai-f"><div class="fai-fh"><b>'+esc(f.area)+'</b><span class="fai-v '+f.verdict+'">'+L[f.verdict]+'</span></div>'
          +'<div class="fai-s">'+esc(f.seen)+(f.frames.length?' <span class="fai-fr">(frame '+f.frames.join(', ')+')</span>':'')+'</div>'
          +(f.cue&&f.verdict!=='good'?'<div class="fai-c">Cue: '+esc(f.cue)+'</div>':'')+'</div>';
      }).join(''):'<div class="sub">The AI could not make out your position in these frames. Film from the side with your whole body in view and try again.</div>')
      +'<button class="btn ghost" data-fai="again">Check again</button>');
  }
  function paintError(host,msg){
    host.innerHTML=card(head('The review did not work this time.')+'<div class="sub fai-p">'+esc(msg)+'</div><button class="btn" data-fai="run">Try again</button>');
  }

  /* host: the element to draw in; el: the <video> or <img>; key: the clip */
  function mount(host,el,lift,res,key,video){
    if(!host||!el) return;
    var id=key+'|'+lift;
    host.__fai={el:el,lift:lift,res:res,id:id,video:video};
    if(cache[id]) paintResult(host,cache[id].r,cache[id].imgs); else paintIdle(host,video);
    if(host.__wired) return; host.__wired=1;
    host.addEventListener('click',function(e){
      var b=e.target.closest&&e.target.closest('[data-fai]'); if(!b) return;
      var a=b.getAttribute('data-fai'), S=host.__fai;
      if(a==='signin'){ if(window.KovaCloudAuth&&KovaCloudAuth.open) KovaCloudAuth.open({mode:'in'}); return; }
      if(a==='again') delete cache[S.id];
      run(host,S);
    });
  }
  function run(host,S){
    if(!ready()){ paintIdle(host,S.video); return; }
    paintBusy(host,0);
    var imgs=[];
    frames(S.el,S.res).then(function(f){
      imgs=f.filter(Boolean); if(!imgs.length) throw new Error('Kova could not take frames from this clip.');
      paintBusy(host,imgs.length);
      return ask(prompt(S.lift,imgs.length,S.video),imgs);
    }).then(function(o){
      var R=clean(o); cache[S.id]={r:R,imgs:imgs};
      if(host.__fai===S) paintResult(host,R,imgs);
      try{ if(window.KovaAnalytics) KovaAnalytics.track('form_ai',{lift:S.lift,n:imgs.length}); }catch(e){}
    }).catch(function(e){ if(host.__fai===S) paintError(host,(e&&e.message)||'Try again in a moment.'); });
  }
  /* p30: name the exercise from four stills of the set, so nobody has to
     pick it from a list. LIST is every exercise Form Check has programming
     for; anything else comes back with its movement pattern. */
  var PATS=['squat','hinge','vpush','vpull','hpush','hpull','iso','cardio'];
  var ID_SYS='You name the exercise a person is doing in photos from a gym or home workout (stills from one set, in order). '
    +'Reply with JSON only, no other text: {"exercise":"its common name","match":"the exact name from LIST if one fits, else empty",'
    +'"pattern":"one of squat, hinge, vpush, vpull, hpush, hpull, iso, cardio","equipment":"barbell, dumbbells, kettlebell, cable, machine, bodyweight or similar",'
    +'"view":"side, front, back or angle","confidence":0-100,"also":["up to 2 other names from LIST it could be"],"why":"one short sentence: what in the photos shows it"}. '
    +'vpush = overhead press, vpull = pull-ups and pulldowns, hpush = bench and push-ups, hpull = rows, iso = one joint (curls, raises, extensions). '
    +'If no one is exercising, or you cannot tell, give exercise "" and confidence 0. Never guess a name you cannot see.';
  function identify(imgs,names){
    if(!ready()) return Promise.reject(new Error('signed-out'));
    imgs=(imgs||[]).filter(Boolean).slice(0,4);
    if(!imgs.length) return Promise.reject(new Error('no-frames'));
    return ask(ID_SYS,imgs,'LIST: '+(names||[]).join(', '),400).then(function(o){
      o=o||{};
      return {exercise:String(o.exercise||'').slice(0,60).trim(),match:String(o.match||'').slice(0,60).trim(),
        pattern:PATS.indexOf(String(o.pattern||''))>=0?String(o.pattern):'',equipment:String(o.equipment||'').slice(0,40),
        view:String(o.view||'').slice(0,12),confidence:Math.max(0,Math.min(100,Math.round(+o.confidence||0))),
        also:(Array.isArray(o.also)?o.also:[]).slice(0,2).map(function(x){ return String(x||'').slice(0,60); }).filter(Boolean),
        why:String(o.why||'').slice(0,200)};
    });
  }
  /* the answer, matched to Form Check's list (L); a name not on it is added
     with its movement pattern's programming (P). Returns its index, or -1. */
  function liftIndex(L,nm){
    nm=String(nm||'').toLowerCase().trim(); if(!nm) return -1;
    for(var k=0;k<L.length;k++) if(L[k].n.toLowerCase()===nm) return k;
    for(var k2=0;k2<L.length;k2++){ var a=L[k2].n.toLowerCase(); if(a!=='something else'&&(nm.indexOf(a)>=0||a.indexOf(nm)>=0)) return k2; }
    return -1;
  }
  function apply(o,L,P){
    if(!o||!o.exercise||o.confidence<35) return -1;
    var k=liftIndex(L,o.match); if(k<0) k=liftIndex(L,o.exercise);
    if(k<0&&o.pattern&&P[o.pattern]){
      var pr=P[o.pattern], nm=o.exercise.charAt(0).toUpperCase()+o.exercise.slice(1);
      L.splice(L.length-1,0,{id:o.pattern+':'+nm, pid:o.pattern, n:nm, pat:pr.pat, ic:pr.ic,
        prime:pr.prime, also:pr.also, tempo:pr.tempo, rx:pr.rx, cues:pr.cues, faults:pr.faults});
      k=L.length-2;
    }
    return k;
  }
  /* "Kova identified this": named from the clip itself, one tap if it is
     something else, no list to scroll. c: {A, L, picked, top, col, pick, more} */
  function paintNamed(host,c){
    var A=c.A, L=c.L, me=L[A.idx], alts=[];
    (A.also||[]).forEach(function(n){ var k=liftIndex(L,n); if(k>=0&&k!==A.idx&&alts.indexOf(k)<0) alts.push(k); });
    if(c.top) c.top.lifts.forEach(function(n){ var k=liftIndex(L,n); if(alts.length<4&&k>=0&&k!==A.idx&&alts.indexOf(k)<0) alts.push(k); });
    var seen=[A.equipment?A.equipment.charAt(0).toUpperCase()+A.equipment.slice(1):'', A.view&&A.view!=='unclear'?'filmed from the '+A.view:''].filter(Boolean).join(', ');
    var cur=c.picked<0?A.idx:c.picked;
    var chip=function(k){ var on=(cur===k); return '<div class="chip fcpick" data-k="'+k+'" style="'+(on?'background:var(--acc-bg);border-color:var(--acc-brd);color:var(--acc);font-weight:600':'')+'">'+esc(L[k].n)+'</div>'; };
    host.innerHTML='<div class="card card-lg" style="border-color:var(--acc-brd);background:linear-gradient(150deg,var(--acc-bg),rgba(255,255,255,.03))">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start">'
      +'<div style="flex:1;min-width:0"><div class="lbl" style="color:var(--acc)">KOVA IDENTIFIED THIS</div>'
      +'<div class="title-s" style="font-size:19px;margin-top:3px">'+esc(me.n)+'</div>'
      +'<div class="sub" style="margin-top:4px;line-height:1.45">'+esc(seen?seen+'. ':'')+esc(A.why||'')+'</div></div>'
      +'<div style="text-align:right;flex-shrink:0;margin-left:10px"><div class="lbl">SURE</div>'
      +'<div style="font-size:20px;font-weight:800;color:'+c.col(A.confidence)+';margin-top:2px">'+A.confidence+'%</div></div></div>'
      +'<div style="margin-top:12px;padding-top:11px;border-top:.5px solid rgba(255,255,255,.12)">'
      +'<div class="lbl" style="margin-bottom:7px">NOT IT? ONE TAP</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px">'+[A.idx].concat(alts).map(chip).join('')
      +'<div class="chip" id="fcShowAll">Something else</div></div></div></div>';
    host.querySelectorAll('.fcpick').forEach(function(e){ e.onclick=function(){ c.pick(+e.getAttribute('data-k')); }; });
    var sa=host.querySelector('#fcShowAll'); if(sa) sa.onclick=c.more;
  }
  return {mount:mount,times:times,prompt:prompt,clean:clean,ready:ready,identify:identify,apply:apply,paintNamed:paintNamed,ID_SYS:ID_SYS,_ask:ask,_frames:frames};
})();

/* p30: Form Check's fast read. Jumping to 220 points of a clip one by one
   cost a phone up to a third of a second each (over a minute for a
   30-second clip). Playing it through, muted and sped up, hands over the
   frames as they are shown, so the same clip reads in a few seconds.
   KovaMotion.analyze (index.html) calls this and falls back to seeking
   if it is not loaded or the clip will not play. c: {dur, step, opts,
   grab, take, still, onProgress}. Resolves with the frames read. */
window.KovaMotionFast=function(v,c){
  return new Promise(function(ok,no){
    if(c.opts.noPlay||typeof v.play!=='function') return no(new Error('no-play'));
    var done=false, next=0, got=0, rvfc=typeof v.requestVideoFrameCallback==='function';
    var last=-1, stuck=0, watch, prevCt=-1, looped=v.loop;
    function end(err){
      if(done) return; done=true; clearInterval(watch);
      v.removeEventListener('ended',onEnd);
      try{ v.pause(); v.playbackRate=1; v.loop=looped; }catch(e){}
      if(err) no(err); else ok(got);
    }
    function onEnd(){ end(); }
    function frame(now,meta){
      if(done) return;
      var ct=(meta&&typeof meta.mediaTime==='number')?meta.mediaTime:v.currentTime;
      /* back at the start: it went round, so it has all been seen */
      if(ct<prevCt-0.5) return end(); prevCt=ct;
      if(ct>=next-c.step*0.4){
        var g; try{ g=c.grab(); }catch(e){ return end(new Error('frame-read')); }
        c.take(g,ct); c.still(ct); got++; next=ct+c.step;
        if(c.onProgress&&got%4===0) c.onProgress(Math.min(0.99,ct/c.dur));
      }
      if(v.ended||ct>=c.dur-0.04) return end();
      arm();
    }
    function arm(){ if(rvfc) v.requestVideoFrameCallback(frame); else (window.requestAnimationFrame||setTimeout)(function(){ frame(0,null); }); }
    v.addEventListener('ended',onEnd);
    /* a clip that stops moving (a decoder that gives up) falls back */
    watch=setInterval(function(){ var t=v.currentTime; if(t===last){ if(++stuck>=8) end(new Error('stalled')); } else { stuck=0; last=t; } },250);
    try{ v.muted=true; v.playsInline=true; v.setAttribute('playsinline',''); v.loop=false; }catch(e){}
    try{ v.currentTime=0; }catch(e){}
    try{ v.playbackRate=c.opts.rate||4; }catch(e){ try{ v.playbackRate=2; }catch(e2){} }
    var pr; try{ pr=v.play(); }catch(e){ return end(new Error('no-play')); }
    if(pr&&pr.then) pr.then(arm,function(){ end(new Error('no-play')); }); else arm();
  });
};
