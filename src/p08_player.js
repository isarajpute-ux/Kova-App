/* =====================================================================
   KovaPlayer - follow along with your workout (p35).

   Press Follow along (in a workout, or on the Muscle recovery card) and
   the exercise you are on fills the screen: its moving picture, which set
   of how many, the weight and reps to do (from Auto-Target, adjustable
   with - and +), and Done set. Then the rest counts down in a ring with
   what comes next, and a voice says it: "Set two of three. Eight reps at
   one thirty-five." ... "Rest ninety seconds." ... "Ten seconds. Next:
   Romanian deadlift." ... "Go." "Count my reps" counts each rep at a
   steady tempo (two seconds down, one up). Every set goes through the
   workout's own logic (KSESS.api.toggle), so the workout screen, history,
   records and the recovery map all see exactly what you did. Finish ends
   the workout the usual way. Dark, soft light and light glass; the voice
   can be turned off.
   ===================================================================== */
window.KovaPlayer=(function(){
  'use strict';
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function K(){ return window.KSESS||null; }
  function A(){ var k=K(); return k&&k.api||null; }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function lsPut(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }
  function ic(id){ return '<svg class="ic" aria-hidden="true"><use href="#i-'+id+'"/></svg>'; }
  function mmss(s){ s=Math.max(0,Math.round(s)); return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); }
  var P={on:false,key:'',w:0,r:0,count:null,cue:{},voice:lsJ('kova.pl.voice',true),iv:0,wasRest:false};

  /* ---------- where you are ---------- */
  function S(){ var k=K(); return k&&k.state?k.state():null; }
  function cur(){
    var s=S(), a=A(); if(!s||!s.ex||!s.ex.length||!a) return null;
    var i=Math.min(Math.max(0,s.act||0),s.ex.length-1);
    if(a.firstOpen(s.ex[i])<0){ var n=s.ex.findIndex(function(e){ return a.firstOpen(e)>-1; }); if(n<0) return {done:true,s:s}; i=n; }
    var e=s.ex[i], j=a.firstOpen(e), set=e.sets[j];
    var work=e.sets.filter(function(x){ return x.role!=='warm'; }), wi=e.sets.slice(0,j+1).filter(function(x){ return x.role!=='warm'; }).length;
    return {s:s,i:i,j:j,e:e,set:set,warm:set.role==='warm',wn:wi,wt:work.length,n:s.ex.length};
  }
  function nextOf(c){
    if(!c||c.done) return null;
    var a=A(), s=c.s;
    if(c.j+1<c.e.sets.length) return {e:c.e,i:c.i,j:c.j+1,same:true};
    for(var k=c.i+1;k<s.ex.length;k++) if(a.firstOpen(s.ex[k])>-1) return {e:s.ex[k],i:k,j:a.firstOpen(s.ex[k]),same:false};
    for(var k2=0;k2<c.i;k2++) if(a.firstOpen(s.ex[k2])>-1) return {e:s.ex[k2],i:k2,j:a.firstOpen(s.ex[k2]),same:false};
    return null;
  }
  function target(c){
    var a=A(), ph=a.ph(c.e,c.j)||{};
    return {w:c.set.w!=null?+c.set.w:(+ph.w||0),r:c.set.r!=null?+c.set.r:(+ph.r||c.e.tgt.hi||8)};
  }
  function sync(){ var c=cur(); if(!c||c.done) return c; var k=c.i+':'+c.j; if(P.key!==k){ P.key=k; var t=target(c); P.w=t.w; P.r=t.r; stopCount(); } return c; }
  function progress(){ var k=K(), d=k&&k.setsDone?k.setsDone():[0,0]; return {d:d[0],t:d[1]}; }

  /* ---------- the voice ---------- */
  function speak(t){ if(!P.voice) return; try{ if(window.speechSynthesis){ var u=new SpeechSynthesisUtterance(t); u.rate=1.02; speechSynthesis.cancel(); speechSynthesis.speak(u); } }catch(e){} }
  var WORD=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
  function num(n){ n=Math.round(n); return n<=20?WORD[n]:String(n); }
  function setLine(c){
    var t={w:P.w,r:P.r};
    return (c.warm?'Warm-up set. ':'Set '+num(c.wn)+' of '+num(c.wt)+'. ')+num(t.r)+' reps'+(t.w?' at '+t.w+(t.w===1?' pound':' pounds'):'')+'.';
  }
  function announce(c){ if(!c||c.done) return; speak(c.e.n+'. '+setLine(c)); }
  function stopCount(){ if(P.count){ clearInterval(P.count.iv); P.count=null; } }
  /* two seconds down, one up: a number every three seconds */
  function countReps(){
    if(P.count){ stopCount(); paint(); return; }
    var n=P.r, k=0; speak('Ready.');
    P.count={k:0,n:n,iv:setInterval(function(){ k++; if(!P.count) return; P.count.k=k; if(k<=n) speak(num(k)); if(k>=n){ setTimeout(function(){ speak('Rack it.'); },1200); stopCount(); } paintCount(); },3000)};
    paint();
  }

  /* ---------- doing it ---------- */
  function done(){
    var c=sync(), a=A(); if(!c||c.done||!a) return;
    stopCount();
    c.set.w=P.w; c.set.r=P.r;
    a.toggle(c.i,c.j);
    var nx=cur();
    if(nx&&!nx.done&&!a.restLeft()) a.startRest(a.restFor(c.e.n));
    var left=a.restLeft();
    P.cue={};
    if(nx&&nx.done){ speak('That is the workout. Tap Finish to save it.'); }
    else if(left) speak('Rest '+(left>=60&&left%60===0?num(left/60)+(left===60?' minute':' minutes'):num(left)+' seconds')+'.');
    P.wasRest=!!left;
    track('player_set',{rest:left});
    paint();
  }
  function move(d){
    var s=S(), a=A(); if(!s||!a) return;
    var i=sync(); i=i&&!i.done?i.i:s.act||0;
    for(var k=i+d;k>=0&&k<s.ex.length;k+=d){ if(a.firstOpen(s.ex[k])>-1){ s.act=k; a.skipRest(); a.save(); try{ K().render(); }catch(e){} P.key=''; announce(sync()); paint(); return; } }
    say(d>0?'That was the last exercise with sets left.':'That was the first one.');
  }
  function addRest(sec){ var a=A(); if(!a) return; var l=a.restLeft(); a.startRest(l+sec); paint(); }
  function finish(){ close(); var k=K(); if(k&&k.finish) k.finish(); }

  /* ---------- the screen ---------- */
  function thumb(n){ return '<span class="kxp-th kpl-th" data-kxd-still="'+esc(n)+'"></span>'; }
  function ring(f){ var C=2*Math.PI*86; return '<svg class="kpl-ring" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="86" class="t"/><circle id="kplArc" cx="100" cy="100" r="86" class="v" stroke-dasharray="'+(C*f).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 100 100)"/></svg>'; }
  function page(){
    var c=sync(), a=A(), pr=progress(), s=S();
    if(!c) return '<div class="kz2p-in"><div class="kxp-none">There is no workout to follow yet. Start one from Workout.</div><button type="button" class="kz2p-go" data-kpl="close">Close</button></div>';
    var left=a?a.restLeft():0, nx=nextOf(c), resting=left>0&&!c.done;
    var head='<div class="hdr kz2p-hd"><div class="hdr-l"><button type="button" class="back" data-kpl="close" aria-label="Back to the workout">'+ic('chevron-left')+'</button>'
      +'<div><div class="kz2p-eye">FOLLOW ALONG · '+esc(String(s.day||'Today').toUpperCase())+'</div><div class="title">'+esc(c.done?'All done':c.e.n)+'</div></div></div>'
      +'<div class="hdr-r"><button type="button" class="iconbtn kz2p-help" data-kpl="tour" aria-label="Show me around the player">?</button>'
      +'<button type="button" class="iconbtn'+(P.voice?' on':'')+'" data-kpl="voice" aria-pressed="'+P.voice+'" aria-label="'+(P.voice?'Voice on':'Voice off')+'">'+ic('headphones')+'</button></div></div>';
    var bar='<div class="kpl-prog" role="progressbar" aria-valuemin="0" aria-valuemax="'+pr.t+'" aria-valuenow="'+pr.d+'" aria-label="Sets done"><i style="width:'+(pr.t?pr.d/pr.t*100:0).toFixed(1)+'%"></i></div>'
      +'<div class="kpl-where">'+(c.done?pr.d+' sets done':'Exercise '+(c.i+1)+' of '+c.n+' · '+(c.warm?'Warm-up set':'Set '+c.wn+' of '+c.wt))+'</div>';
    if(c.done) return '<div class="kz2p-in">'+head+bar+'<section class="card kpl-stage kpl-end"><div class="kz2p-num">'+pr.d+'<i>sets</i></div><span>Every set is logged. Finish saves the workout, your records and your recovery map.</span></section>'
      +'<div class="kz2p-bar" role="group" aria-label="Workout controls"><button type="button" class="chip kz2p-c" data-kpl="close">'+ic('chevron-left')+'<span>Back</span></button><button type="button" class="kz2p-go" data-kpl="finish">'+ic('check')+'<span>Finish workout</span></button></div></div>';
    var stage='<section class="card kpl-stage"><div class="kpl-fig" data-kpl-fig="'+esc(c.e.n)+'" role="img" aria-label="'+esc(c.e.n)+', moving from the start to the finish of the lift"></div>'
      +(c.warm?'<span class="chip kpl-tag">Warm-up</span>':'')+'</section>';
    var body;
    if(resting){
      var len=Math.max(left,P.restLen||left); P.restLen=len;
      body='<section class="card kpl-rest" aria-live="polite"><div class="kpl-rw">'+ring(left/len)+'<div class="kpl-rn"><b id="kplLeft">'+mmss(left)+'</b><span>Rest</span></div></div>'
        +(nx?'<div class="kpl-next">'+thumb(nx.e.n)+'<div><span>Next</span><b>'+esc(nx.same?(nx.e.sets[nx.j].role==='warm'?'Warm-up set':'Set '+(nx.e.sets.slice(0,nx.j+1).filter(function(x){ return x.role!=='warm'; }).length)+' of '+nx.e.sets.filter(function(x){ return x.role!=='warm'; }).length):nx.e.n)+'</b></div></div>':'')
        +'<div class="kpl-acts"><button type="button" class="chip kz2p-c" data-kpl="more">'+ic('plus')+'<span>30 s</span></button></div></section>';
    } else {
      P.restLen=0;
      body='<section class="card kpl-do"><div class="kpl-tg"><div class="kpl-st"><span>Weight</span><div class="kpl-sv"><button type="button" class="iconbtn" data-kpl="w-" aria-label="Less weight">−</button><div class="kz2p-num">'+P.w+'<i>lb</i></div><button type="button" class="iconbtn" data-kpl="w+" aria-label="More weight">+</button></div></div>'
        +'<div class="kpl-st"><span>Reps</span><div class="kpl-sv"><button type="button" class="iconbtn" data-kpl="r-" aria-label="One rep fewer">−</button><div class="kz2p-num" id="kplReps">'+(P.count?P.count.k+'<i>/ '+P.r+'</i>':P.r)+'</div><button type="button" class="iconbtn" data-kpl="r+" aria-label="One rep more">+</button></div></div></div>'
        +'<div class="kpl-acts"><button type="button" class="chip kz2p-c'+(P.count?' on':'')+'" data-kpl="count" aria-pressed="'+!!P.count+'">'+ic('clock')+'<span>'+(P.count?'Stop counting':'Count my reps')+'</span></button><span class="kpl-hint">Tempo: 2 s down, 1 s up</span></div></section>';
    }
    var up=[], s2=S(), a2=A();
    for(var k=c.i+1;k<s2.ex.length&&up.length<2;k++) if(a2.firstOpen(s2.ex[k])>-1) up.push(s2.ex[k]);
    /* working sets, the warm-up said apart (plans are 2-3 working sets) */
    function upSets(e){ var w=e.sets.filter(function(x){ return x.role==='warm'; }).length, n=e.sets.length-w; return (w?'Warm-up + ':'')+n+(n===1?' set':' sets'); }
    var upNext=up.length?'<section class="card kpl-up"><div class="kz2p-k">UP NEXT</div>'+up.map(function(e){ return '<div class="kpl-ur">'+thumb(e.n)+'<div><b>'+esc(e.n)+'</b><span>'+upSets(e)+' · '+e.tgt.lo+'–'+e.tgt.hi+' reps</span></div></div>'; }).join('')+'</section>':'';
    var ctl='<div class="kz2p-bar" role="group" aria-label="Workout controls"><button type="button" class="chip kz2p-c" data-kpl="prev" aria-label="Previous exercise">'+ic('chevron-left')+'</button>'
      +(resting?'<button type="button" class="kz2p-go" data-kpl="skip">'+ic('player-play')+'<span>Skip rest</span></button>':'<button type="button" class="kz2p-go" data-kpl="done">'+ic('check')+'<span>Done set</span></button>')
      +'<button type="button" class="chip kz2p-c" data-kpl="next" aria-label="Next exercise">'+ic('chevron-right')+'</button></div>';
    return '<div class="kz2p-in">'+head+bar+'<div class="kpl-grid">'+stage+body+upNext+'</div>'+ctl+'</div>';
  }
  function mountFigs(el){
    var D=window.KovaDemo; if(!D||!el) return;
    el.querySelectorAll('[data-kpl-fig]').forEach(function(f){ D.mount(f,f.getAttribute('data-kpl-fig')); });
    el.querySelectorAll('[data-kxd-still]').forEach(function(f){ D.mount(f,f.getAttribute('data-kxd-still'),{still:true,u:1}); });
  }
  function paint(){
    var el=document.getElementById('kpl'); if(!el) return;
    var act=document.activeElement, key=act&&el.contains(act)?act.getAttribute('data-kpl'):'';
    el.innerHTML=page(); mountFigs(el);
    if(key){ var b=el.querySelector('[data-kpl="'+key+'"]'); if(b) try{ b.focus({preventScroll:true}); }catch(e){} }
  }
  function paintCount(){ var r=document.getElementById('kplReps'); if(r&&P.count) r.innerHTML=P.count.k+'<i>/ '+P.count.n+'</i>'; }
  /* the rest ring and the voice, four times a second */
  function tick(){
    if(!P.on) return;
    var a=A(); if(!a) return;
    var left=a.restLeft(), c=cur();
    if(left>0){
      var el=document.getElementById('kplLeft'); if(!el){ paint(); return; }
      el.textContent=mmss(left);
      var arc=document.getElementById('kplArc'); if(arc){ var C=2*Math.PI*86; arc.setAttribute('stroke-dasharray',(C*left/Math.max(left,P.restLen||left)).toFixed(1)+' '+C.toFixed(1)); }
      if(left<=10&&!P.cue.ten){ P.cue.ten=1; var nx=nextOf(c); speak('Ten seconds.'+(nx&&!nx.same?' Next: '+nx.e.n+'.':'')); }
      P.wasRest=true;
    } else if(P.wasRest){
      P.wasRest=false; P.cue={}; P.key=''; var c2=sync(); paint(); if(c2&&!c2.done){ speak('Go. '+setLine(c2)); }
    }
  }

  function open(){
    var k=K(); if(!k||!k.api){ say('The workout is still loading.'); return false; }
    var el=document.getElementById('kpl');
    if(!el){ el=document.createElement('div'); el.id='kpl'; el.className='kz2p kpl'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); el.setAttribute('aria-label','Follow along');
      (document.getElementById('app')||document.body).appendChild(el); }
    P.on=true; P.key=''; P.cue={}; P.wasRest=k.api.restLeft()>0;
    paint(); clearInterval(P.iv); P.iv=setInterval(tick,250);
    var c=sync(); if(c&&!c.done&&!P.wasRest) announce(c);
    track('player_open',{});
    if(window.KovaTour&&KovaTour.canRemember()&&KovaTour.once('playerpage')) setTimeout(tour,700);
    return true;
  }
  function close(){ P.on=false; stopCount(); clearInterval(P.iv); var el=document.getElementById('kpl'); if(el) el.remove(); try{ if(window.speechSynthesis) speechSynthesis.cancel(); }catch(e){} try{ K().render(); }catch(e){} }

  /* the player's own tour (every new part is shown around) */
  var TOUR=[['.kpl-stage','The exercise, moving','Watch the start and the finish of the lift while you set up.'],
    ['.kpl-do','Your target','The weight and reps for this set, from what you lifted last time. Change them with - and + if you did something else.'],
    ['[data-kpl="count"]','Count my reps','A voice counts each rep at a steady tempo: two seconds down, one up.'],
    ['[data-kpl="done"]','Done set','Logs the set and starts your rest, with what comes next.'],
    ['[data-kpl="voice"]','The voice','It tells you each set, the rest and what is next. Turn it off here.']];
  function tour(){
    if(!window.KovaTour||!document.getElementById('kpl')) return false;
    var on=document.querySelector('.screen.on'), sc=on?[on.id.replace(/^s-/,'')]:[];
    KovaTour.run(TOUR.map(function(t){ return {t:t[1],d:t[2],el:function(){ return document.querySelector('#kpl '+t[0]); }}; }),{color:'#E87A3C',screens:sc});
    var ov=document.getElementById('ksTour'); if(ov) ov.style.zIndex='9700';
    return true;
  }

  /* "Follow along" in the workout's own row of chips */
  function decorate(){
    /* only while the workout is on screen: looking up addExBtn by id brings a parked screen back (KovaPark), even inside quiet() */
    var sc=document.getElementById('s-session'); if(!sc||!sc.classList.contains('on')) return;
    var add=document.getElementById('addExBtn'); if(!add||!add.parentNode||add.parentNode.querySelector('.kpl-chip')) return;
    add.insertAdjacentHTML('beforebegin','<div class="chip kpl-chip" data-kpl="open" role="button" tabindex="0" style="border-radius:16px;flex-shrink:0">'+ic('player-play')+' Follow along</div>');
  }
  var pend=0; function soon(){ if(pend) return; pend=setTimeout(function(){ pend=0; if(window.KovaPark&&KovaPark.quiet) KovaPark.quiet(decorate); else decorate(); },90); }
  document.addEventListener('click',function(ev){
    var b=ev.target.closest&&ev.target.closest('[data-kpl]'); if(!b) return;
    var a=b.getAttribute('data-kpl');
    if(a==='open'){ open(); return; }
    if(a==='close'){ close(); return; }
    if(a==='voice'){ P.voice=!P.voice; lsPut('kova.pl.voice',P.voice); if(!P.voice) try{ speechSynthesis.cancel(); }catch(e){} paint(); return; }
    if(a==='tour'){ tour(); return; }
    if(a==='done'){ done(); return; }
    if(a==='skip'){ var ap=A(); if(ap) ap.skipRest(); return; }
    if(a==='more'){ addRest(30); return; }
    if(a==='prev'){ move(-1); return; }
    if(a==='next'){ move(1); return; }
    if(a==='count'){ countReps(); return; }
    if(a==='finish'){ finish(); return; }
    if(a==='w-'||a==='w+'){ P.w=Math.max(0,P.w+(a==='w+'?5:-5)); paint(); return; }
    if(a==='r-'||a==='r+'){ P.r=Math.max(1,P.r+(a==='r+'?1:-1)); paint(); return; }
  });
  document.addEventListener('keydown',function(ev){
    var b=ev.target.closest&&ev.target.closest('.kpl-chip'); if(b&&(ev.key==='Enter'||ev.key===' ')){ ev.preventDefault(); b.click(); return; }
    if(ev.key==='Escape'&&document.getElementById('kpl')&&!document.querySelector('#sheet.on')&&!document.getElementById('ksTour')) close();
  });
  if(window.MutationObserver) new MutationObserver(function(ms){ for(var i=0;i<ms.length;i++){ var t=ms[i].target; if(!(t.closest&&t.closest('#kpl,#kz2,#krcCard,#kz2Card,[data-kxd],[data-kxd-still]'))){ soon(); return; } } }).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('kova:screen',soon);
  soon();
  return {open:open,close:close,done:done,move:move,cur:cur,nextOf:nextOf,countReps:countReps,tour:tour,TOUR:TOUR,decorate:decorate,setLine:setLine,_P:P};
})();
