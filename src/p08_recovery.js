/* =====================================================================
   KovaRecovery - which muscles are fresh and which need rest (p35).

   From the sets you logged (KSESS history, plus today's ticked sets),
   never from sample data. Each hard set loads the muscles it trains: the
   main ones fully, the helpers half (warm-ups do not count). That load
   fades the way muscle recovers: big muscles (quads, hamstrings, glutes,
   back, chest) over about three days, middle ones (shoulders, upper back)
   over two to three, small ones (arms, calves, abs) over about two
   (exponential, time constants 30 / 24 / 20 h). A muscle reads:
     ready        85% and up
     recovering   55-85%
     needs rest   under 55%
   It is an estimate and says so; sleep, food and stress move it too.

   On Workout, under Training: your body figure (the slim one from
   Customize) coloured by recovery, what is ready and what is resting,
   "Train what's fresh" (builds today's workout from ready muscles: 2-3
   working sets each, compound lifts first) and "Follow along" (the
   workout player). Tap a muscle for its page: recovery, when it is ready,
   when you last trained it and with what, this week's hard sets against
   the 10-20 that builds muscle, the exercises and stretches for it.
   ===================================================================== */
window.KovaRecovery=(function(){
  'use strict';
  var H=36e5, DAY=864e5;
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function K(){ return window.KSESS||null; }
  function D(){ return window.KovaDemo||null; }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }
  function ic(id){ return '<svg class="ic" aria-hidden="true"><use href="#i-'+id+'"/></svg>'; }

  var NAME={quads:'Quads',hams:'Hamstrings',glutes:'Glutes',calves:'Calves',tibialis:'Shins',adductors:'Inner thighs',hipflex:'Hip flexors',chest:'Chest',
    lats:'Lats',traps:'Upper back',lowback:'Lower back',abs:'Abs',obliques:'Obliques',delts:'Shoulders',biceps:'Biceps',triceps:'Triceps',forearms:'Forearms'};
  var TAU={quads:30,hams:30,glutes:30,lats:30,chest:30,lowback:30,adductors:30,traps:24,delts:24,obliques:24,hipflex:24,biceps:20,triceps:20,forearms:20,calves:20,abs:20,tibialis:20};
  var MAP={quads:['f-quad'],hams:['b-ham'],glutes:['b-glute'],calves:['b-calf'],tibialis:['f-shin'],adductors:['f-add'],hipflex:['f-pelvis'],chest:['f-pec'],
    lats:['b-lat'],traps:['b-trap','f-trap'],lowback:['b-erector'],abs:['f-abs'],obliques:['f-obl','f-serr'],delts:['f-delt','b-delt'],biceps:['f-bicep'],triceps:['b-tri'],forearms:['f-fore','b-fore']};
  var GROUP={Quads:['quads'],Hamstrings:['hams'],Glutes:['glutes'],Calves:['calves'],Chest:['chest'],Back:['lats','traps'],Shoulders:['delts'],Biceps:['biceps'],Triceps:['triceps'],Core:['abs']};
  var COMPOUND={sq:1,hg:1,hp:1,vp:1,hpl:1,vpl:1};

  /* which muscles an exercise trains: the picture's own list, else its group */
  function musclesOf(name){
    var d=D()&&D().find(name);
    if(d&&d.mus) return {p:(d.mus.p||[]).slice(),s:(d.mus.s||[]).slice()};
    var k=K(), x=k&&k.lib?k.lib(name):null, g=x&&GROUP[x.m];
    return {p:g?g.slice():[],s:[]};
  }
  /* every hard set you logged: history, plus today's ticked sets */
  function sets(){
    var k=K(), out=[]; if(!k) return out;
    var H0=k.hist?k.hist():{};
    Object.keys(H0).forEach(function(n){ (H0[n]||[]).forEach(function(h){ var c=(h.sets||[]).filter(function(x){ return x.role!=='warm'; }).length; if(c) out.push({n:n,t:h.t,c:c}); }); });
    var S=k.state&&k.state();
    if(S&&S.ex&&!S.finished){
      S.ex.forEach(function(e){ var c=e.sets.filter(function(x){ return x.d&&x.role!=='warm'; }).length; if(c) out.push({n:e.n,t:S.savedAt||Date.now(),c:c,today:1}); });
    }
    return out;
  }
  function state(now){
    now=now||Date.now();
    var M={}; Object.keys(NAME).forEach(function(m){ M[m]={m:m,n:NAME[m],F:0,last:0,week:0,by:{}}; });
    sets().forEach(function(x){
      var mu=musclesOf(x.n), age=(now-x.t)/H;
      if(age<0) age=0;
      [[mu.p,1],[mu.s,0.5]].forEach(function(L){ L[0].forEach(function(m){ var o=M[m]; if(!o) return;
        o.F+=x.c*L[1]*Math.exp(-age/TAU[m]);
        if(x.t>o.last) o.last=x.t;
        if(now-x.t<7*DAY){ o.week+=x.c*L[1]; o.by[x.n]=(o.by[x.n]||0)+x.c; }
      }); });
    });
    Object.keys(M).forEach(function(m){ var o=M[m];
      o.pct=Math.round(100*Math.exp(-o.F/4));
      o.st=o.pct>=85?'ready':o.pct>=55?'mid':'rest';
      /* hours until it reads 85%: F x e^(-t/tau) = 0.65 */
      o.readyIn=o.F>0.65?Math.ceil(TAU[m]*Math.log(o.F/0.65)):0;
    });
    return M;
  }

  /* ---------- the body figure, coloured by recovery ---------- */
  function figure(M){
    var src=document.getElementById('bodySvg'); if(!src) return '';
    try{ if(window.KovaBodyShape&&KovaBodyShape.apply&&!src.hasAttribute('data-sex')) KovaBodyShape.apply(); }catch(e){}
    var c=src.cloneNode(true); c.removeAttribute('id'); c.setAttribute('class','krc-body'); c.setAttribute('role','img');
    var by={}; Object.keys(MAP).forEach(function(m){ MAP[m].forEach(function(p){ by[p]=m; }); });
    c.querySelectorAll('[id]').forEach(function(el){
      var id=el.getAttribute('id'); el.removeAttribute('id'); el.removeAttribute('style');
      var base=id.replace(/-(l|r)\d?$/,'').replace(/\d$/,''), m=by[base];
      if(el.classList.contains('m')){ el.classList.remove('p','s','on','sel'); if(m&&M[m]){ el.classList.add('r-'+M[m].st); el.setAttribute('data-krc-m',m); } }
    });
    c.querySelectorAll('text').forEach(function(t){ t.setAttribute('class','krc-bt'); });
    var ready=Object.keys(M).filter(function(m){ return M[m].st==='ready'; }).length;
    c.setAttribute('aria-label','Muscle recovery: '+ready+' of '+Object.keys(M).length+' muscle groups ready, body chart');
    return c.outerHTML;
  }
  function list(M,st){ return Object.keys(M).filter(function(m){ return M[m].st===st; }).sort(function(a,b){ return M[a].pct-M[b].pct; }); }
  function when(h){ if(h<=0) return 'now'; if(h<20) return 'in about '+h+' h'; var d=new Date(Date.now()+h*H); return d.toLocaleDateString(undefined,{weekday:'long'}); }
  function card(){
    var M=state(), any=sets().length>0, rest=list(M,'rest'), mid=list(M,'mid'), ready=list(M,'ready');
    var big=['quads','hams','glutes','chest','lats','delts','biceps','triceps','calves','abs'].filter(function(m){ return M[m].st==='ready'; });
    return '<div class="kv-card krc" id="krcCard"><div class="kv-h"><span>MUSCLE RECOVERY</span><button type="button" class="krc-q" data-krc="about" aria-label="How Kova works this out">'+ic('info-circle')+'</button></div>'
      +'<div class="krc-row"><div class="krc-fig" data-krc="fig">'+figure(M)+'</div><div class="krc-side">'
        +'<div class="krc-num">'+ready.length+'<i>/ '+Object.keys(M).length+'</i></div><span class="krc-cap">muscle groups ready</span>'
        +'<div class="krc-leg"><span><i class="r-ready"></i>Ready</span><span><i class="r-mid"></i>Recovering</span><span><i class="r-rest"></i>Needs rest</span></div></div></div>'
      +(any?(rest.length||mid.length?'<div class="krc-l">Resting: '+rest.concat(mid).slice(0,4).map(function(m){ return '<button type="button" class="krc-m" data-krc="m" data-m="'+m+'">'+esc(M[m].n)+' '+M[m].pct+'%</button>'; }).join('')+'</div>':'<div class="krc-l">Everything is recovered. A good day for a full workout.</div>')
          +(big.length?'<div class="krc-l">Ready: '+esc(big.slice(0,5).map(function(m){ return M[m].n; }).join(', '))+'</div>':'')
        :'<div class="krc-l">No sets logged yet, so every muscle is fresh. Log a workout and this map shows what needs rest.</div>')
      +'<div class="kl-acts krc-acts"><div class="chip on km-cta" data-krc="fresh" role="button" tabindex="0">Train what’s fresh</div><div class="chip" data-krc="play" role="button" tabindex="0">Follow along</div></div></div>';
  }

  /* ---------- one muscle ---------- */
  function muscleSheet(m){
    var M=state(), o=M[m]; if(!o||!window.openSheet) return;
    var k=K(), d=D();
    var ex=(k&&k.XL?k.XL:[]).filter(function(x){ var mu=musclesOf(x.n); return mu.p.indexOf(m)>=0; }).slice(0,6);
    var st=d&&d.stretchesFor?d.stretchesFor([m]).slice(0,2):[];
    var by=Object.keys(o.by).sort(function(a,b){ return o.by[b]-o.by[a]; });
    var wk=Math.round(o.week*10)/10, f=Math.min(1,wk/20);
    openSheet('<div class="kxp krcs"><div class="kxp-h"><div><b>'+esc(o.n)+'</b><span>'+(o.st==='ready'?'Ready to train':o.st==='mid'?'Recovering':'Needs rest')+'</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +'<div class="krcs-top"><div class="krc-num">'+o.pct+'<i>%</i></div><div><b>'+(o.readyIn?'Ready '+when(o.readyIn):'Ready now')+'</b><span>'+(o.last?'Last trained '+new Date(o.last).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}):'Not trained yet')+'</span></div></div>'
      +'<div class="kxp-l">This week</div><div class="krcs-wk"><div class="bar"><i style="width:'+(f*100).toFixed(0)+'%"></i><b style="left:50%"></b></div><span>'+wk+' hard sets'+(by.length?' · '+esc(by.slice(0,3).join(', ')):'')+'. Most people build muscle on 10 to 20 a week.</span></div>'
      +(ex.length?'<div class="kxp-l">Exercises for it</div><div class="kxp-sts">'+ex.map(function(x){ return '<button type="button" class="kxp-st" data-exinfo="'+esc(x.n)+'"><span class="kxp-th" data-kxd-still="'+esc(x.n)+'"></span><span><b>'+esc(x.n)+'</b><small>'+esc(x.m)+'</small></span></button>'; }).join('')+'</div>':'')
      +(st.length?'<div class="kxp-l">Stretch it</div><div class="kxp-sts">'+st.map(function(s2){ return '<button type="button" class="kxp-st" data-kxp="stretch" data-n="'+esc(s2.n)+'"><span class="kxp-th" data-kxd-still="'+esc(s2.n)+'"></span><span><b>'+esc(s2.n)+'</b><small>'+esc(s2.hold)+'</small></span></button>'; }).join('')+'</div>':'')
      +'<div class="kxp-none krcs-n">An estimate from the sets you logged: big muscles take about three days to recover, small ones about two. Sleep, food and stress move it too.</div></div>');
    var sh=document.getElementById('sheet'); if(sh&&D()) sh.querySelectorAll('[data-kxd-still]').forEach(function(el){ D().mount(el,el.getAttribute('data-kxd-still'),{still:true,u:1}); });
    track('recovery_muscle',{m:m});
  }
  function aboutSheet(){
    if(!window.openSheet) return;
    openSheet('<div class="kxp krcs"><div class="kxp-h"><div><b>How Kova works this out</b><span>From your logged sets, never sample data</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +'<ul class="kxp-cues"><li>Every hard set loads the muscles it trains: the main ones fully, the helpers half. Warm-up sets do not count.</li>'
      +'<li>That load fades the way muscle recovers: big muscles (quads, hamstrings, glutes, back, chest) over about three days, shoulders and upper back over two to three, arms, calves and abs over about two.</li>'
      +'<li>Ready is 85% and up, recovering 55–85%, needs rest under 55%.</li>'
      +'<li>It is an estimate. Poor sleep, little food or a hard week slow recovery; train by how you feel too.</li></ul></div>');
  }

  /* ---------- train what's fresh ---------- */
  function freshPlan(M){
    M=M||state();
    var k=K(); if(!k||!k.XL) return [];
    var ok=function(m){ return M[m]&&M[m].st==='ready'; }, tired=function(m){ return M[m]&&M[m].st==='rest'; };
    var cand=k.XL.filter(function(x){ var mu=musclesOf(x.n); return mu.p.length&&mu.p.every(ok)&&!mu.s.some(tired); });
    /* compound lifts first; then arms and core before the small extras */
    var PRI={biceps:1,triceps:1,abs:2,obliques:3,delts:3,calves:4,traps:5,forearms:6};
    cand.sort(function(a,b){ var ca=COMPOUND[a.pat]?1:0, cb=COMPOUND[b.pat]?1:0; if(ca!==cb) return cb-ca; if(ca) return 0;
      return (PRI[musclesOf(a.n).p[0]]||9)-(PRI[musclesOf(b.n).p[0]]||9); });
    var used={}, out=[];
    cand.forEach(function(x){
      if(out.length>=5) return;
      var mu=musclesOf(x.n), key=mu.p[0];
      if(used[key]) return;
      if(out.filter(function(o){ return COMPOUND[o.pat]; }).length>=3&&COMPOUND[x.pat]) return;
      used[key]=(used[key]||0)+1; out.push(x);
    });
    /* 2-3 working sets (plus one warm-up), compound lifts heavier */
    return out.map(function(x){ return COMPOUND[x.pat]?[x.n,4,6,10]:[x.n,3,10,15]; });
  }
  function trainFresh(){
    var k=K(); if(!k||!k.api||!k.api.build) return null;
    var S=k.state&&k.state(), done=S&&S.ex?S.ex.some(function(e){ return e.sets.some(function(x){ return x.d; }); }):false;
    if(done&&!S.finished){ say('You already logged sets today. Finish that workout first.'); return null; }
    var L=freshPlan(); if(!L.length){ say('Everything needs rest today. A walk, Zone 2 or stretching would be the thing.'); return null; }
    k.api.build(L,'Fresh today');
    track('recovery_fresh',{n:L.length});
    say('Today’s workout: '+L.length+' exercises for your fresh muscles.');
    if(typeof window.go==='function') try{ go('session'); }catch(e){}
    return L;
  }

  /* ---------- on Workout, under Training ---------- */
  function decorate(){
    /* only while Workout is on screen: the figure is a few hundred shapes, kept off the first screen's budget */
    var sc=document.getElementById('s-move'); if(!sc||!sc.classList.contains('on')) return;
    var host=document.querySelector('#s-move .kl-acts:not(.kz2-acts):not(.krc-acts)'); if(!host) return;
    var have=document.getElementById('krcCard'), html=card();
    if(have){ if(have.__h!==html){ have.outerHTML=html; var n0=document.getElementById('krcCard'); if(n0) n0.__h=html; } return; }
    /* Training, then this, then Zone 2 */
    var z2=document.getElementById('kz2Card');
    if(z2) z2.insertAdjacentHTML('beforebegin',html); else (host.closest('.kv-card')||host).insertAdjacentHTML('afterend',html);
    var n=document.getElementById('krcCard'); if(n) n.__h=html;
  }
  var pend=0; function soon(){ if(pend) return; pend=setTimeout(function(){ pend=0; if(window.KovaPark&&KovaPark.quiet) KovaPark.quiet(decorate); else decorate(); },90); }
  document.addEventListener('click',function(ev){
    var b=ev.target.closest&&ev.target.closest('[data-krc],[data-krc-m]'); if(!b) return;
    var a=b.getAttribute('data-krc');
    if(b.hasAttribute('data-krc-m')&&!a){ muscleSheet(b.getAttribute('data-krc-m')); return; }
    if(a==='m'){ muscleSheet(b.getAttribute('data-m')); return; }
    if(a==='about'){ aboutSheet(); return; }
    if(a==='fresh'){ trainFresh(); return; }
    if(a==='play'){ if(window.KovaPlayer) KovaPlayer.open(); return; }
  });
  document.addEventListener('keydown',function(ev){ var b=ev.target.closest&&ev.target.closest('.krc [data-krc][role="button"]'); if(b&&(ev.key==='Enter'||ev.key===' ')){ ev.preventDefault(); b.click(); } });
  if(window.MutationObserver) new MutationObserver(function(ms){ for(var i=0;i<ms.length;i++){ var t=ms[i].target; if(!(t.closest&&t.closest('#krcCard,#kz2Card,#kz2,#kpl,[data-kxd],[data-kxd-still]'))){ soon(); return; } } }).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('kova:screen',soon);
  soon();
  return {state:state,sets:sets,musclesOf:musclesOf,freshPlan:freshPlan,trainFresh:trainFresh,card:card,decorate:decorate,muscleSheet:muscleSheet,TAU:TAU,NAME:NAME};
})();
