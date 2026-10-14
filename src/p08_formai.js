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
  function ask(sys,imgs){
    var c=KovaModel.cfg(), P=KovaModel.providers[c.p];
    var content=c.p==='anthropic'
      ? imgs.map(function(d){ return {type:'image',source:{type:'base64',media_type:'image/jpeg',data:d.slice(d.indexOf(',')+1)}}; }).concat([{type:'text',text:'Review my technique.'}])
      : [{type:'text',text:'Review my technique.'}].concat(imgs.map(function(d){ return {type:'image_url',image_url:{url:d}}; }));
    var req=P.build(c.key,c.model,sys,[{role:'user',content:content}],{temperature:0,max_tokens:1400});
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
  return {mount:mount,times:times,prompt:prompt,clean:clean,_ask:ask,_frames:frames};
})();
