/* =====================================================================
   KovaTour - the short guided tours (Studio and Work OS).
   A dimmed page with one lit cut-out that rides on the thing being
   explained, a one-line card, Next / Skip. Each step may move first
   (glide the canvas, scroll, zoom, change screen) and says how long that
   takes; the light glides to the new spot, then follows it frame by
   frame so it stays on target while anything moves.
   ===================================================================== */
window.KovaTour=(function(){
  'use strict';
  var st=null;
  function $(s){ return document.querySelector(s); }
  function esc(x){ return String(x==null?'':x).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  var ARROW='<svg class="ki" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  function rect(el){
    var r=el.getBoundingClientRect(), pad=10;
    var top=Math.max(8,r.top-pad);
    return {r:r,left:r.left-pad,top:top,w:r.width+pad*2,h:Math.max(40,Math.min(window.innerHeight-16-top,r.height+pad*2))};
  }
  function spot(g){
    var sp=$('#ksSpot'); if(!sp||!g) return;
    sp.style.left=g.left+'px'; sp.style.top=g.top+'px'; sp.style.width=g.w+'px'; sp.style.height=g.h+'px';
  }
  function follow(){
    if(!st||!$('#ksTour')) return;
    /* the app went somewhere this tour does not cover (a notification, a
       link, the camera): the tour ends there instead of floating over it */
    if(st.o.screens){ var on=$('.screen.on'), id=on?on.id.replace(/^s-/,''):''; if(id&&st.o.screens.indexOf(id)<0){ end('left'); return; } }
    if(st.el&&st.ride) spot(rect(st.el));
    requestAnimationFrame(follow);
  }
  function end(why){
    var o=$('#ksTour'); if(o) o.remove();
    var s=st; st=null;
    if(s&&s.o.done) try{ s.o.done(why==='left'?'left':''); }catch(e){}
  }
  var headless=/jsdom/i.test((navigator&&navigator.userAgent)||'');

  /* ---- seen once, remembered everywhere --------------------------------
     A tour is marked seen the moment it starts (not when it ends, so
     closing the app mid-tour does not bring it back), in this browser AND
     in the synced profile, so a new phone or a reinstall remembers too.
     Where the page cannot store anything (some embedded viewers), tours
     never start by themselves - the ? buttons still play them. */
  var TK='kova.tours.v1';
  function canRemember(){
    try{ var k='__kova_t'; localStorage.setItem(k,'1'); var ok=localStorage.getItem(k)==='1'; localStorage.removeItem(k); return ok; }catch(e){ return false; }
  }
  function seenMap(){
    var m={};
    try{ m=JSON.parse(localStorage.getItem(TK)||'{}')||{}; }catch(e){ m={}; }
    try{ var kp=window.KP&&KP.get('tours'); if(kp&&typeof kp==='object') Object.keys(kp).forEach(function(k){ m[k]=m[k]||kp[k]; }); }catch(e){}
    return m;
  }
  function seen(key){
    if(seenMap()[key]) return true;
    try{                                          /* flags from before this change */
      if(key==='work'&&localStorage.getItem('wk.tour')) return true;
      if(key==='studio'&&localStorage.getItem('ks.tour')) return true;
      if(localStorage.getItem('kt.'+key)) return true;
    }catch(e){}
    return false;
  }
  function mark(key){
    var m=seenMap(); m[key]=Date.now();
    try{ localStorage.setItem(TK,JSON.stringify(m)); }catch(e){}
    try{ if(window.KP) KP.set('tours',m); }catch(e){}
  }
  /* true exactly once per tour, ever: call it right before starting */
  function once(key){ if(!canRemember()||seen(key)) return false; mark(key); return true; }
  function resolve(s){ try{ return typeof s.el==='function'?s.el():$(s.el); }catch(e){ return null; } }
  function shown(el){
    if(!el||!el.isConnected) return false;
    if(headless) return true;
    var b=el.getBoundingClientRect(); return !!(el.getClientRects().length&&b.width>=2&&b.height>=2);
  }
  /* glide the step into the middle of the screen; returns how long that takes */
  function center(el){
    if(headless) return 0;
    var r=el.getBoundingClientRect(), vh=window.innerHeight;
    if(r.top>=70&&r.bottom<=vh-190) return 0;
    var m=document.getElementById('main');
    if(m&&m.contains(el)){
      var goal=m.scrollTop+r.top-Math.max(80,(vh-Math.min(r.height,vh*.5))/2-70);
      if(m.scrollTo) m.scrollTo({top:Math.max(0,goal),behavior:'smooth'}); else m.scrollTop=Math.max(0,goal);
    } else if(el.scrollIntoView) el.scrollIntoView({behavior:'smooth',block:'center'});
    return 420;
  }
  function place(i,el){
    if(!st||st.i!==i) return;
    var s=st.steps[i];
    st.el=el; st.ride=false;
    var sp=$('#ksSpot'); if(sp) sp.classList.remove('ride');
    var g=rect(el); spot(g);
    setTimeout(function(){ if(st&&st.i===i){ st.ride=true; if(sp) sp.classList.add('ride'); } },560);
    var coach=$('#ksCoach'); if(!coach) return;
    var n=st.steps.length;
    coach.innerHTML='<div class="ks-cstep">'+(i+1)+' / '+n+'</div><div class="ks-ct">'+esc(s.t)+'</div><div class="ks-cd">'+esc(s.d)+'</div>'
      +'<div class="ks-cb"><button class="ks-pill small" data-t="skip">Skip</button><button class="ks-pill small white" data-t="next">'+(i===n-1?'Done':'Next')+ARROW+'</button></div>';
    var cw=Math.min(300,window.innerWidth-24), ch=150, below=g.top+g.h+14, above=g.top-14;
    coach.style.width=cw+'px';
    coach.style.left=Math.max(12,Math.min(window.innerWidth-cw-12,g.r.left+g.r.width/2-cw/2))+'px';
    coach.style.top=(below+ch<window.innerHeight?below:(above-ch>0?above-ch:Math.max(12,window.innerHeight-ch-24)))+'px';
    coach.classList.remove('moving');
    requestAnimationFrame(function(){ coach.classList.add('on'); });
  }
  /* A step goes to its screen if it has to, then waits for its element to
     actually be there (at most 1.5 s) instead of a fixed pause, so nothing
     sits on a blank dark screen. A step whose element never shows is skipped. */
  function go(i){
    if(!st) return;
    if(i>=st.steps.length) return end();
    st.i=i;
    var coach=$('#ksCoach'); if(coach&&coach.classList.contains('on')) coach.classList.add('moving');
    var s=st.steps[i];
    try{ if(s.move) s.move(s,i); else if(st.o.move) st.o.move(s,i); }catch(e){}
    var t0=Date.now();
    (function wait(){
      if(!st||st.i!==i) return;
      var el=resolve(s);
      if(shown(el)){ var ms=center(el); setTimeout(function(){ place(i,el); },ms); return; }
      if(Date.now()-t0>1500) return go(i+1);
      setTimeout(wait,60);
    })();
  }
  function run(steps,o){
    if(st) end();
    var ov=document.createElement('div'); ov.className='ks ks-tour'; ov.id='ksTour';
    /* a tour can take its section's colour; the Work OS keeps glowing white */
    var col=o&&o.color&&/^#[0-9a-f]{6}$/i.test(o.color)?o.color:'';
    if(col){
      var n=parseInt(col.slice(1),16), rgb=[(n>>16)&255,(n>>8)&255,n&255].join(',');
      ov.classList.add('tinted'); ov.style.setProperty('--tc',col); ov.style.setProperty('--tg','rgba('+rgb+',.45)'); ov.style.setProperty('--tb','rgba('+rgb+',.16)');
    }
    ov.innerHTML='<div class="ks-spot ride" id="ksSpot"></div><div class="ks-coach" id="ksCoach"></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click',function(e){
      var a=e.target.closest('[data-t]'); if(!a||!st) return;
      if(a.getAttribute('data-t')==='next') go(st.i+1); else end();
    });
    st={steps:steps,o:o||{},i:-1,el:null,ride:true};
    requestAnimationFrame(follow);
    go(0);
  }
  return {run:run,end:end,active:function(){ return !!st; },once:once,seen:seen,mark:mark,canRemember:canRemember};
})();

/* ---------------------------------------------------------------------
   The Work OS tour: zoom into each part of the home screen, then into
   Tasks, and back. Zoom out -> scroll -> zoom in, every step.
   --------------------------------------------------------------------- */
window.KovaWorkTour=(function(){
  'use strict';
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function onScreen(){ var s=document.querySelector('.screen.on'); return s?s.id.replace(/^s-/,''):''; }
  function reset(){
    Array.prototype.forEach.call(document.querySelectorAll('.screen'),function(s){
      if(!s.style.transform) return;
      s.style.transition='transform .35s ease'; s.style.transform='';
      setTimeout(function(){ s.style.transition=''; s.style.transformOrigin=''; },380);
    });
  }
  function el(sel){ return function(){ return typeof sel==='function'?sel():document.querySelector(sel); }; }
  /* kept for callers: brings an element into view (the engine centres it) */
  function zoomTo(getEl){ var t=getEl&&getEl(); if(t&&t.scrollIntoView&&!/jsdom/i.test(navigator.userAgent||'')) t.scrollIntoView({behavior:'smooth',block:'center'}); return 0; }
  function stepOn(screen){
    return function(){ if(onScreen()!==screen){ reset(); if(typeof go==='function') go(screen); } return 0; };
  }
  var STEPS=[
    {t:'Your Work OS',  d:'Studio, Board, AI team, Inbox and Files. Tap a tab to jump there.', el:el('#s-work .wk-tabs'), move:stepOn('work')},
    {t:'Studio',        d:'Make a post: drop in photos or clips and send them everywhere.', el:el('#s-work .wglow[data-go="workstudio"]'), move:stepOn('work')},
    {t:'Pipeline',      d:'What you have posted, and what is still waiting.', el:el(function(){ var r=document.getElementById('wkRing'); return r&&r.closest('.wgl'); }),
       move:stepOn('work')},
    {t:'AI team',       d:'Your AI employees. Tap here to give them a job, or just say their name.', el:el('#s-work .wk-tabs [data-go="workteam"]'), move:stepOn('work')},
    {t:'Traffic',       d:'Comments coming in, posts going out.', el:el(function(){ var r=document.getElementById('wkInboundRow'); return r&&r.closest('.wgl'); }),
       move:stepOn('work')},
    {t:'Files',         d:'Your documents, clips and notes, in folders.', el:el('#s-work .wgl[data-go="workspace"]'), move:stepOn('work')},
    {t:'Board',         d:'The tasks, projects and goals behind it all.', el:el('#s-work .wgl[data-go="worktoday"]'), move:stepOn('work')},
    {t:'Tasks',         d:'Every task, as a table or as Kanban columns.', el:el('#wtView'), move:stepOn('worktasks')},
    {t:'New task',      d:'Add one here. Kova suggests some too.', el:el('#wtNewTask'), move:stepOn('worktasks')},
    {t:'Stuck?',        d:'Describe the problem and get a real breakdown.', el:el('#s-work .wgl[data-go="workdiag"]'), move:stepOn('work')}
  ];
  function run(){
    if(!window.KovaTour) return;
    if(onScreen()!=='work'&&typeof go==='function') go('work');
    KovaTour.mark('work');
    KovaTour.run(STEPS,{done:function(){ reset(); if(onScreen()!=='work'&&typeof go==='function') go('work'); }});
  }
  /* first visit to the Work OS home */
  function onScreenHook(id){
    if(id!=='work'||KovaTour.seen('work')||!KovaTour.canRemember()) return;
    setTimeout(function(){
      var app=document.getElementById('app');
      if(onScreen()==='work'&&!(app&&app.classList.contains('auth-locked'))&&!KovaTour.active()&&KovaTour.once('work')) run();
    },900);
  }
  document.addEventListener('click',function(e){ var h=e.target.closest&&e.target.closest('[data-wktour]'); if(h){ e.preventDefault(); run(); } });
  return {run:run,onScreen:onScreenHook,reset:reset,zoomTo:zoomTo};
})();

/* ---------------------------------------------------------------------
   KovaScreenTour - the same zoom-in / zoom-out tour for Home, Vitals,
   Workout, Sleep and Fuel. Seven stops each, one line apiece, outlined in
   that section's own colour (read live from the page, so light mode and
   any theme change come along). Runs once on the first visit; the small
   "?" next to each title plays it again.
   --------------------------------------------------------------------- */
window.KovaScreenTour=(function(){
  'use strict';
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function q(sel){ return document.querySelector(sel); }
  function up(id,sel){ return function(){ var e=document.getElementById(id); return e&&e.closest(sel||'.card'); }; }
  function cardWith(scr,text){ return function(){
    var all=document.querySelectorAll('#s-'+scr+' .card');
    for(var i=0;i<all.length;i++){ if(all[i].textContent.trim().indexOf(text)===0&&all[i].getClientRects().length) return all[i]; }
    return null;
  }; }
  function rail(){ var r=q('.rail'); if(r&&r.getClientRects().length) return r; return q('.tabbar')||q('nav'); }
  var TOURS={
    home:[
      ['Morning brief','What matters today, from your night, training and food.','#s-home .card.kova'],
      ['Your week','One ring per area. Fuller is better.',up('wheelWrap')],
      ['Four areas','Sleep, Workout, Fuel and Vitals. Tap one to open it.',function(){ var c=q('#s-home .card[data-go="sleep"]'); return c&&c.parentElement; }],
      ['Work OS','What is due today at work. Tap to open it.','#osHero'],
      ['Daily goals','Small wins for today. Tick them off.',up('goalsList')],
      ['Move around','Every area is one tap away here.',rail],
      ['Kova, one tap away','Chat, your seven health checks and your AI team, all in this glass orb.','#kgOrb']
    ],
    move:[
      ['Today’s session','What to train today, and why.','#s-move .card.kova[data-go="session"]'],
      ['Start workout','One tap. Kova logs your sets as you go.','#startBtn'],
      ['This week','Every session. Tap a day to see it.',up('wkTotal')],
      ['Training for','What you train for sets your reps, rest and weekly volume.','#modePill','customize'],
      ['The rules','Reps, rest, load and cardio for that goal - and how to train it on Monday.',up('rxGrid'),'customize'],
      ['Days and split','Pick your days. Kova builds the split - for a sport, the sessions and the gym days that support them.','#splCard','customize'],
      ['Weekly sets','Hard sets per muscle across the week. Amber is under target.',function(){ return q('#splVol'); },'customize'],
      ['Target muscles','Aim a session at any muscle on the body map.',up('bodySvg'),'customize'],
      ['Session length','Drag to fit your day. The plan fits the sets to it.',function(){ var t=q('#timeIn'); return t&&t.closest('.slider-wrap'); },'customize']
    ],
    customize:[
      ['Training for','What you train for sets your reps, rest and weekly volume.','#modePill'],
      ['The rules','Reps, rest, load and cardio for that goal - and how to train it on Monday.',up('rxGrid')],
      ['Days and split','Pick your days. Kova builds the split - for a sport, the sessions and the gym days that support them.','#splCard'],
      ['Weekly sets','Hard sets per muscle across the week. Amber is under target.',function(){ return q('#splVol'); }],
      ['Target muscles','Aim a session at any muscle on the body map.',up('bodySvg')],
      ['Session length','Drag to fit your day. The plan fits the sets to it.',function(){ var t=q('#timeIn'); return t&&t.closest('.slider-wrap'); }]
    ],
    vitals:[
      ['Morning read','What changed overnight, in one line.','#s-vitals .card.kova'],
      ['Recovery score','How ready your body is today.','#s-vitals .card.card-lg'],
      ['What drives it','Sleep, HRV and resting heart rate behind the score.',up('recoveryGrid')],
      ['Connect your watch','Link Apple Watch for real readings, not estimates.','#s-vitals .ronrange[data-go="watch"]'],
      ['Signals','Anything outside your normal range shows here first.','#symptomCards'],
      ['Stress','How your stress moved through the day.','#s-vitals .card[data-go="stress"]'],
      ['Health & meds','Add conditions and medication for reminders.','#s-vitals .card[data-go="health"]']
    ],
    sleep:[
      ['Sleep score','Last night out of 100, with total sleep and debt.','#s-sleep .card.card-lg'],
      ['Why this score','The reasons, in plain words.',up('slpWhy')],
      ['This week','Each night against your target. Drag along it.',up('slpChart')],
      ['Sleep stages','Deep, REM and light sleep through the night.',up('ssGraph','.card,.glasscard,.gcirc')],
      ['What moves it','Your biggest lever for better sleep.','#s-sleep .card[data-go="factors"]'],
      ['Bedtime','When to be in bed tonight.','#s-sleep .card[data-go="bedtime"]'],
      ['Fitness age','What sleep, heart and movement add up to.','#s-sleep .glasscard[data-go="healthspan"]']
    ],
    fuel:[
      ['Calories left','What is left today, with protein, carbs and fat.','#s-fuel .card.card-lg'],
      ['Scan or log','Snap a meal or log it by hand.',function(){ var b=document.getElementById('scanBtn'); return b&&b.parentElement; }],
      ['Today’s log','Everything you ate today.',up('mealLog')],
      ['Water','Tap a drop for each glass.',up('waterDots')],
      ['Energy','How meal timing lines up with your energy.','#nrgCard'],
      ['Micronutrients','Vitamins and minerals you are short on.','#microGrid'],
      ['Weight trend','The trend that sets your calories.',cardWith('fuel','Weight trend')]
    ]
  };
  var NAME={home:'Today',move:'Workout',vitals:'Vitals',sleep:'Sleep',fuel:'Fuel',customize:'Customize workout'};
  function onScreen(){ var s=document.querySelector('.screen.on'); return s?s.id.replace(/^s-/,''):''; }
  function colour(){
    var a=document.querySelector('.app')||document.body;
    var c=(getComputedStyle(a).getPropertyValue('--acc')||'').trim();
    return /^#[0-9a-f]{6}$/i.test(c)?c:'#FFFFFF';
  }
  function steps(id){
    var W=window.KovaWorkTour;
    return (TOURS[id]||[]).map(function(t){
      var get=typeof t[2]==='function'?t[2]:function(){ return q(t[2]); };
      var where=t[3]||id;
      return {t:t[0],d:t[1],el:get,move:function(){
        /* a step on another screen goes there first; the engine waits for it */
        if(onScreen()!==where&&typeof window.go==='function'){ if(W&&W.reset) W.reset(); window.go(where); }
        return 0;
      }};
    });
  }
  function run(id){
    id=id||onScreen();
    if(!TOURS[id]||!window.KovaTour) return false;
    if(onScreen()!==id&&typeof window.go==='function') window.go(id);
    KovaTour.mark(id);
    var home=id, where=[id];
    (TOURS[id]||[]).forEach(function(t){ if(t[3]&&where.indexOf(t[3])<0) where.push(t[3]); });
    KovaTour.run(steps(id),{color:colour(),screens:where,done:function(why){
      if(window.KovaWorkTour) KovaWorkTour.reset();
      if(why==='left') return;                       /* you went elsewhere: stay there */
      if(onScreen()!==home&&typeof window.go==='function') window.go(home);
      var m=document.getElementById('main'); if(m&&m.scrollTo) m.scrollTo({top:0,behavior:'smooth'});
    }});
    return true;
  }
  /* the "?" beside each title */
  function addButtons(){
    Object.keys(TOURS).forEach(function(id){
      var t=q('#s-'+id+' .title')||q('#s-'+id+' .title-s'); if(!t||t.querySelector('.kt-help')) return;
      var b=document.createElement('button');
      b.type='button'; b.className='kt-help'; b.setAttribute('data-ktour',id);
      b.setAttribute('aria-label','Show me around '+NAME[id]); b.textContent='?';
      t.appendChild(b);
    });
  }
  /* nothing may be covering the screen (sign-in, first-run questions, a sheet) */
  function clear(){
    var app=document.getElementById('app');
    if(app&&app.classList.contains('auth-locked')) return false;
    if(!document.elementFromPoint) return false;
    var hit=document.elementFromPoint(window.innerWidth/2,window.innerHeight/2);
    return !!(hit&&hit.closest&&hit.closest('.screen.on'));
  }
  function onScreenHook(id){
    addButtons();
    if(!TOURS[id]||KovaTour.seen(id)||!KovaTour.canRemember()) return;
    setTimeout(function(){
      if(onScreen()===id&&!KovaTour.active()&&clear()&&KovaTour.once(id)) run(id);
    },1100);
  }
  document.addEventListener('click',function(e){
    var h=e.target.closest&&e.target.closest('[data-ktour]');
    if(h){ e.preventDefault(); e.stopPropagation(); run(h.getAttribute('data-ktour')); }
  },true);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',addButtons); else setTimeout(addButtons,0);
  return {run:run,onScreen:onScreenHook,steps:steps,TOURS:TOURS};
})();

window.KovaCanvas=(function(){
  'use strict';
  var KPo=window.KovaPost, KB=window.KovaBlobs;
  if(!KPo||!KB) return null;

  /* ---- icons: thin rounded strokes, the reference's weight ---- */
  var IC={
    ast:'<path d="M12 2.6v18.8M2.6 12h18.8M5.35 5.35l13.3 13.3M18.65 5.35L5.35 18.65" stroke-width="2.5"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.6"/><path d="M20 20l-4.7-4.7"/>',
    dots:'<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
    folder:'<path fill="currentColor" stroke="none" d="M1.5 5.2A2.7 2.7 0 0 1 4.2 2.5h6.1c.8 0 1.5.3 2 .9l1.5 1.7h8A2.7 2.7 0 0 1 24.5 7.8V19a2.7 2.7 0 0 1-2.7 2.7H4.2A2.7 2.7 0 0 1 1.5 19z"/><path fill="rgba(0,0,0,.14)" stroke="none" d="M1.5 8.6h23V19a2.7 2.7 0 0 1-2.7 2.7H4.2A2.7 2.7 0 0 1 1.5 19z"/>',
    up:'<path d="M6 15l6-6 6 6"/>', down:'<path d="M6 9l6 6 6-6"/>',
    vol:'<path d="M4 9.5h3.4L12 5.6v12.8l-4.6-3.9H4z"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>',
    mute:'<path d="M4 9.5h3.4L12 5.6v12.8l-4.6-3.9H4z"/><path d="M16 9.6l4.8 4.8M20.8 9.6L16 14.4"/>',
    left:'<path d="M15 6l-6 6 6 6"/>', right:'<path d="M9 6l6 6-6 6"/>',
    film:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 3v18M16 3v18M3 8h5M3 12h18M3 16h5M16 8h5M16 16h5"/>',
    photo:'<rect x="3" y="3" width="18" height="18" rx="4.5"/><circle cx="9" cy="9" r="1.8"/><path d="M21 15.5l-4.8-4.8L6.5 20.5"/>',
    check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    history:'<path d="M12 8v4l2.6 2.6"/><path d="M3.1 11a9 9 0 1 1 .5 4"/><path d="M3 4.5v5h5"/>',
    trash:'<path d="M4 7h16M10 11v6M14 11v6M5.5 7l.9 11.6A2 2 0 0 0 8.4 20.5h7.2a2 2 0 0 0 2-1.9L18.5 7M9 7V4.5h6V7"/>',
    sidebar:'<rect x="3" y="4" width="18" height="16" rx="3.5"/><path d="M9.5 4v16"/>',
    branch:'<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M11 6h5a2 2 0 0 1 2 2v7.8"/><path d="M14 9l-3-3 3-3"/><path d="M13 18H8a2 2 0 0 1-2-2V8.2"/><path d="M10 15l3 3-3 3"/>',
    term:'<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M8 10l2.5 2L8 14M13 14.5h3"/>',
    menu:'<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
    send:'<path d="M10.5 13.5L21 3M21 3l-6.4 17.6a.6.6 0 0 1-1.1 0L10.5 13.5 3.4 10.5a.6.6 0 0 1 0-1.1z"/>',
    eye:'<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    play:'<path d="M8 5.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2A.8.8 0 0 0 8 5.8z"/>',
    pause:'<path d="M8.5 5.5v13M15.5 5.5v13"/>',
    prev:'<path d="M18 6v12a.7.7 0 0 1-1.1.6L8.4 12.6a.7.7 0 0 1 0-1.2L16.9 5.4A.7.7 0 0 1 18 6zM6 5v14"/>',
    next:'<path d="M6 6v12a.7.7 0 0 0 1.1.6l8.5-6a.7.7 0 0 0 0-1.2L7.1 5.4A.7.7 0 0 0 6 6zM18 5v14"/>',
    share:'<path d="M12 14.5V3.5M8 7.5l4-4 4 4M5 12.5v5.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5"/>',
    heart:'<path d="M19.5 12.6L12 20l-7.5-7.4A5 5 0 1 1 12 6a5 5 0 1 1 7.5 6.6z"/>',
    wand:'<path d="M5.5 21L21 5.5l-2.5-2.5L3 18.5z"/><path d="M15.5 6l2.5 2.5"/><path d="M9 3.2a1.8 1.8 0 0 0 1.8 1.8A1.8 1.8 0 0 0 9 6.8 1.8 1.8 0 0 0 7.2 5 1.8 1.8 0 0 0 9 3.2zM19 12.2a1.8 1.8 0 0 0 1.8 1.8 1.8 1.8 0 0 0-1.8 1.8 1.8 1.8 0 0 0-1.8-1.8 1.8 1.8 0 0 0 1.8-1.8z"/>',
    cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M16 3v4M8 3v4M3.5 10h17M12 13.5v2.5l1.8 1.2"/>',
    save:'<path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v15.5L12 16.5l-6.5 4V5A1.5 1.5 0 0 1 7 3.5z"/>',
    inbox:'<path d="M4 13.5h4l2 2.5h4l2-2.5h4"/><path d="M4 13.5l2.2-7.5h11.6l2.2 7.5v5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M12 3v7M9.6 7.8L12 10.2l2.4-2.4"/>',
    chat:'<path d="M8.5 17.5H7a3.5 3.5 0 0 1-3.5-3.5V7.5A3.5 3.5 0 0 1 7 4h10a3.5 3.5 0 0 1 3.5 3.5V14a3.5 3.5 0 0 1-3.5 3.5h-4.5L8.5 20.5z"/><circle cx="8.5" cy="10.8" r=".9" fill="currentColor"/><circle cx="12" cy="10.8" r=".9" fill="currentColor"/><circle cx="15.5" cy="10.8" r=".9" fill="currentColor"/>',
    mic:'<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    upload:'<path d="M12 15.5V4M7.5 8.5L12 4l4.5 4.5M4.5 15.5v3A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
    x:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    pencil:'<path d="M4 20h4L19.3 8.7a1.8 1.8 0 0 0 0-2.6L17.9 4.7a1.8 1.8 0 0 0-2.6 0L4 16z"/><path d="M14 6l4 4"/>',
    link:'<path d="M14 4.5h5.5V10M19.5 4.5L11 13M19 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5H10"/>',
    copy:'<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
    refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>',
    crop:'<path d="M7.5 3.5v11a2 2 0 0 0 2 2h11M3.5 7.5h11a2 2 0 0 1 2 2v11"/>',
    star:'<path fill="currentColor" stroke="none" d="M12 1.8c.8 5.8 4.4 9.4 10.2 10.2-5.8.8-9.4 4.4-10.2 10.2C11.2 16.4 7.6 12.8 1.8 12 7.6 11.2 11.2 7.6 12 1.8z"/>',
    ring:'<circle cx="12" cy="12" r="7.2" stroke-width="3.6"/>',
    youtube:'<path d="M3 8.3c.1-1.6 1.3-2.7 2.9-2.9C7.8 5.2 9.9 5.1 12 5.1s4.2.1 6.1.3c1.6.2 2.8 1.3 2.9 2.9.1 1.2.2 2.5.2 3.7s-.1 2.5-.2 3.7c-.1 1.6-1.3 2.7-2.9 2.9-1.9.2-4 .3-6.1.3s-4.2-.1-6.1-.3C4.3 18.4 3.1 17.3 3 15.7 2.9 14.5 2.8 13.2 2.8 12s.1-2.5.2-3.7z"/><path d="M10.2 9.4v5.2l4.4-2.6z" fill="currentColor"/>',
    instagram:'<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.9"/><circle cx="17" cy="7" r=".9" fill="currentColor" stroke="none"/>',
    tiktok:'<path d="M14 3.5v11.3a3.6 3.6 0 1 1-3.6-3.6"/><path d="M14 3.5c.4 2.6 2.3 4.5 5 4.8"/>',
    linkedin:'<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M8 10.5v6M8 7.5v.01M12 16.5v-3.5a2.2 2.2 0 0 1 4.4 0v3.5M12 10.5v6"/>',
    xlogo:'<path fill="currentColor" stroke="none" d="M4 4h4.3l4 5.4L17 4h2.2l-5.7 6.5L20.2 20h-4.3l-4.4-5.9L6.3 20H4.1l6.3-7.1zm2.6 1.3l9.8 13.4h1.5L8.1 5.3z"/>',
    facebook:'<circle cx="12" cy="12" r="9"/><path d="M13.6 20.8v-7.3h2.4l.4-2.7h-2.8V9.2c0-.8.3-1.3 1.4-1.3h1.5V5.5a18 18 0 0 0-2.2-.1c-2.1 0-3.5 1.3-3.5 3.6v1.8H8.4v2.7h2.4v7.3"/>',
    metaads:'<path d="M2.8 15.2c0-3.9 2-7.7 4.6-7.7 2 0 3.3 2.1 4.6 4.3 1.4 2.4 2.6 4.6 4.5 4.6 1.7 0 2.7-1.5 2.7-3.7 0-3.3-1.7-6.2-3.9-6.2-1.7 0-3 1.6-4 3.3M2.8 15.2c0 2 1 3.1 2.4 3.1 1.7 0 2.9-1.6 4.3-4"/>',
    threads:'<path d="M16.6 11.4c-.4-2.9-2.1-4.6-4.8-4.6-2.4 0-4.2 1.4-4.8 3.9"/><path d="M17.2 11.6c1.8.9 2.8 2.4 2.8 4.1 0 3.2-3.1 5.3-7.4 5.3C7 21 4 17.4 4 12S7 3 12.4 3c3.6 0 6.1 1.7 7.2 4.5"/><path d="M16.8 12.6c0 2.3-1.7 3.9-4 3.9-1.8 0-3-1-3-2.4 0-1.6 1.5-2.6 3.9-2.6.9 0 2.1.2 3.1.5"/>',
    pinterest:'<circle cx="12" cy="12" r="9"/><path d="M10.3 20.6l1.6-7.3M11.2 16.4c.5.6 1.3 1 2.2 1 2.6 0 4.3-2.4 4.3-5.3 0-2.9-2.4-5.1-5.5-5.1-3.4 0-5.6 2.4-5.6 5.1 0 1.2.5 2.4 1.4 2.9"/>',
    bluesky:'<path d="M12 11c-1.3-2.6-4.9-7.2-8-5.6-1.6.8-.8 4.8.2 6.3 1.2 1.9 3.8 1.6 5 1.3-2.2.9-3.3 2.8-1.9 4.5 1.9 2.3 3.7.7 4.7-1.7 1 2.4 2.8 4 4.7 1.7 1.4-1.7.3-3.6-1.9-4.5 1.2.3 3.8.6 5-1.3 1-1.5 1.8-5.5.2-6.3-3.1-1.6-6.7 3-8 5.6z"/>',
    reddit:'<circle cx="12" cy="13.8" r="6.8"/><circle cx="18.4" cy="5.6" r="1.4"/><path d="M12 7l1.1-3.6 3.9.9"/><circle cx="9.4" cy="13.2" r=".9" fill="currentColor"/><circle cx="14.6" cy="13.2" r=".9" fill="currentColor"/><path d="M9.6 16.4c1.5.9 3.3.9 4.8 0"/>',
    tumblr:'<path d="M14.4 20.6c-2.6 0-4.3-1.4-4.3-4.5v-5H8.2V8.5c2.1-.7 3-2.4 3.1-4.9h2.5v4h3v3.5h-3v4.4c0 1.3.6 1.8 1.6 1.8.5 0 1-.1 1.5-.3v3.1c-.8.3-1.5.5-2.5.5z"/>',
    mastodon:'<path d="M5 16.5V8.8A4.3 4.3 0 0 1 9.3 4.5h5.4A4.3 4.3 0 0 1 19 8.8v3.9a4.3 4.3 0 0 1-4.3 4.3H9.8c-1 0-1.6.5-1.6 1.3 0 1.1 1.1 1.7 2.7 1.7h4.4"/><path d="M9.2 13V10a1.5 1.5 0 0 1 3 0v2M12.2 12v-2a1.5 1.5 0 0 1 3 0v3"/>',
    discord:'<path d="M8.6 5.6a15 15 0 0 0-4 1.3C2.4 10.4 1.9 13.9 2.2 17.3a15 15 0 0 0 4.5 2.3l1.1-1.7M15.4 5.6a15 15 0 0 1 4 1.3c2.2 3.5 2.7 7 2.4 10.4a15 15 0 0 1-4.5 2.3l-1.1-1.7M7.2 16.3c3.2 1.6 6.4 1.6 9.6 0M8.6 5.6l.6 1.4c1.9-.4 3.7-.4 5.6 0l.6-1.4"/><circle cx="9.1" cy="12.5" r="1.2" fill="currentColor"/><circle cx="14.9" cy="12.5" r="1.2" fill="currentColor"/>',
    telegram:'<path d="M20.8 4.6L3 11.4c-.9.4-.9 1.6.1 1.9l4.5 1.4 1.8 5.2c.3.8 1.3 1 1.9.4l2.5-2.4 4.7 3.4c.7.5 1.7.1 1.9-.8l2.4-13.3c.2-.9-.7-1.6-1.5-1.2z"/><path d="M7.6 14.7l9.8-7-7.4 8.1"/>',
    gbusiness:'<path d="M4 10.6V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-8.4"/><path d="M3 8.2l1.8-4.6h14.4L21 8.2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M10 20.5v-5h4v5"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17v.01"/>',
    key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2"/>'
  };
  var BRAND={youtube:'youtube',instagram:'instagram',tiktok:'tiktok',linkedin:'linkedin',x:'xlogo',facebook:'facebook',
             metaads:'metaads',threads:'threads',pinterest:'pinterest',bluesky:'bluesky',reddit:'reddit',tumblr:'tumblr',
             mastodon:'mastodon',discord:'discord',telegram:'telegram',gbusiness:'gbusiness'};
  function ic(n,cls){ return '<svg class="ki'+(cls?' '+cls:'')+'" viewBox="0 0 24 24" aria-hidden="true">'+(IC[n]||'')+'</svg>'; }
  function tri(dir){ return '<svg viewBox="0 0 10 10"><path d="'+(dir==='l'?'M8 1.2v7.6L1.6 5z':'M2 1.2v7.6L8.4 5z')+'"/></svg>'; }
  function esc(x){ return String(x==null?'':x).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function $(s,r){ return (r||document).querySelector(s); }
  function $$(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function mmss(s){ s=Math.max(0,Math.round(s||0)); var m=Math.floor(s/60); return (m<10?'0':'')+m+':'+((s%60)<10?'0':'')+(s%60); }
  function bytes(n){ return n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'; }
  function when(ts){
    var d=new Date(ts);
    return d.toLocaleDateString([], {weekday:'short',day:'numeric',month:'short'})+', '+d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  }
  function ago(ts){
    var s=(Date.now()-ts)/1000;
    if(s<60) return 'just now'; if(s<3600) return Math.round(s/60)+'m ago';
    if(s<86400) return Math.round(s/3600)+'h ago'; return Math.round(s/86400)+'d ago';
  }
  var toastT=null;
  function toast(m){
    var t=$('#ksToast');
    if(!t){ t=document.createElement('div'); t.id='ksToast'; t.className='ks-toast'; document.body.appendChild(t); }
    t.textContent=m; t.classList.add('on');
    clearTimeout(toastT); toastT=setTimeout(function(){ t.classList.remove('on'); },3200);
  }
  function lsGet(k,d){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }

  var FIELD={heading:{a:'Heading',b:'Title',ph:'The title. YouTube uses it as is; elsewhere it is the first line.'},
             body:{a:'Primary',b:'Body text',ph:'The main words — descriptions and LinkedIn posts.'},
             caption:{a:'Caption',b:'Short line',ph:'The line under the photo or clip on Instagram, TikTok and X.'},
             tags:{a:'Tags',b:'Hashtags',ph:'#one #two — each platform keeps as many as it allows.'}};
  var STATE_N={draft:'Draft',uploading:'Uploading',publishing:'Publishing',scheduled:'Scheduled',sent:'Posted',drafted:'Sent as drafts',partial:'Partly posted',failed:'Failed'};

  var S={post:null,field:'heading',plat:null,slide:0,view:lsGet('ks.view',null),desk:false,
         open:{post:true,library:false,drafts:false,scheduled:false,sent:false},q:'',
         prog:-1,sugg:'',suggBusy:false,listening:false,panel:false,pos:lsGet('ks.pos',{}),
         saveT:null,pollT:null,mounted:false,lastRun:0,menu:null,writerOff:lsGet('ks.writerOff',false),
         muted:false,soundBlocked:false};
  S.panel=!!lsGet('ks.panel',false);
  var root, world, wires, view, rec=null;

  /* =============================== post access ====================== */
  function P(){ return S.post; }
  function touch(){
    var p=P(); if(!p) return;
    clearTimeout(S.saveT);
    S.saveT=setTimeout(function(){ KPo.save(p); paintTop(); paintPanel(); },350);
  }
  function locked(){ var p=P(); return !!p&&(p.status==='uploading'||p.status==='publishing'); }
  function targets(){ return (P()&&P().targets)||[]; }
  function currentPlat(){
    var t=targets();
    if(S.plat&&(t.indexOf(S.plat)>=0||!t.length)) return S.plat;
    return t[0]||'instagram';
  }

  function openPost(id){
    var p=id?KPo.find(id):null;
    if(!p){ var list=KPo.all(); p=list.filter(function(x){ return x.status==='draft'; })[0]||null; }
    if(!p){ p=KPo.blank(); p.targets=KPo.ORDER.filter(function(k){ return KPo.linkState(k)==='on'; }).slice(0,3); }
    S.post=p; S.slide=0; S.sugg=''; S.plat=null; S.prog=-1;
    lsSet('ks.last',p.id);
    render();
    if(p.status==='publishing'||p.status==='uploading') poll();
  }
  function newPost(){
    var p=KPo.blank();
    p.targets=KPo.ORDER.filter(function(k){ return KPo.linkState(k)==='on'; }).slice(0,3);
    KPo.save(p);
    S.post=p; S.slide=0; S.sugg=''; S.plat=null; S.field='heading';
    render(); return p;
  }

  /* =============================== skeleton ========================== */
  function build(){
    root=$('#s-workstudio'); if(!root) return false;
    root.innerHTML=
      '<div class="ks-top" id="ksTop"></div>'
      +'<div class="ks-scrim" id="ksScrim"></div>'
      +'<aside class="ks-panel" id="ksPanel"></aside>'
      +'<div class="ks-stage ks-grid-bg" id="ksStage">'
        +'<div class="ks-view" id="ksView"><div class="ks-world" id="ksWorld"></div></div>'
        +'<div class="ks-ctrl" id="ksCtrl">'
          +'<button data-a="zout" aria-label="Zoom out">'+ic('minus')+'</button>'
          +'<button data-a="fit" aria-label="Show everything">'+ic('send')+'</button>'
          +'<button data-a="zin" aria-label="Zoom in">'+ic('plus')+'</button>'
        +'</div>'
        +'<div class="ks-stats" id="ksStats"></div>'
        +'<div class="ks-dock min" id="ksDock"></div>'
      +'</div>'
      +'<input type="file" id="ksFile" accept="image/*,video/*" multiple class="ks-hidden-in">'
      +'<input type="datetime-local" id="ksWhen" class="ks-hidden-in">';
    world=$('#ksWorld'); view=$('#ksView');
    wireEvents();
    return true;
  }

  function isDesk(){ return window.matchMedia?matchMedia('(min-width:1000px)').matches:true; }

  function render(){
    if(!root) return;
    S.desk=isDesk();
    root.classList.toggle('ks-desk',S.desk);
    root.classList.toggle('panel-open',!!S.panel);
    paintTop(); paintPanel(); paintWorld(); paintDock(); paintStats(); paintVeil();
    layout();
  }

  /* =============================== top bar =========================== */
  function paintTop(){
    var p=P(), el=$('#ksTop'); if(!el||!p) return;
    var active=KPo.all().filter(function(x){ return x.status==='scheduled'||x.status==='publishing'||x.status==='uploading'; }).length;
    el.innerHTML=
      '<button class="ks-mark" data-a="home" aria-label="Work OS home">'+ic('ast')+'</button>'
      +'<div class="ks-tabs">'
        +'<button class="ks-tab doc" data-a="rename" title="Rename"><span>'+esc(p.title||'Untitled post')+'</span>'
          +'<i class="'+(p.status==='draft'?'':'saved')+'"></i></button>'
      +'</div>'
      +'<div class="ks-top-sp"></div>'
      +'<div class="ks-top-r">'
        +'<button class="ks-queue" data-a="queue">Queue'+(active?'<b>'+active+'</b>':'')+ic('down')+'</button>'
        +'<button class="ks-sq'+(S.panel?' on':'')+'" data-a="panel" aria-label="Media and accounts">'+ic('sidebar')+'</button>'
        +'<button class="ks-sq" data-a="menu" aria-label="Menu">'+ic('menu')+'</button>'
      +'</div>';
  }

  /* =============================== panel ============================= */
  function thumbOf(m){ return m&&m.thumb?'background-image:url('+m.thumb+')':''; }
  function fold(key,name,count,open,body){
    return '<div class="ks-fold'+(open?' open':'')+'" data-fold="'+key+'">'+ic('folder','fi')
      +'<span class="nm">'+esc(name)+'</span><span class="ks-badge">'+count+'</span>'+ic(open?'up':'down','chev')+'</div>'
      +(open?'<div class="ks-tree">'+body+'</div>':'');
  }
  function paintPanel(){
    var p=P(), el=$('#ksPanel'); if(!el||!p) return;
    var q=S.q.trim().toLowerCase();
    var hit=function(t){ return !q||String(t||'').toLowerCase().indexOf(q)>=0; };
    var posts=KPo.all();

    var mine=(p.media||[]).filter(function(m){ return hit(m.name); });
    var postRows=mine.length?mine.map(function(m){
      return '<div class="ks-file'+(m.on===false?' muted':'')+'">'+ic(m.kind==='video'?'film':'photo','ks-ti')
        +'<span class="fn" data-a="slide" data-id="'+m.id+'">'+esc(m.name)+'</span>'
        +'<span class="ks-chk'+(m.on!==false?' on':'')+'" data-a="incl" data-id="'+m.id+'">'+ic('check')+'</span></div>';
    }).join(''):'<div class="ks-empty">No photos or clips yet — add some below.</div>';

    var lib=KPo.library(p).filter(function(x){ return hit(x.item.name); });
    var have={}; (p.media||[]).forEach(function(m){ have[m.blob]=1; });
    var libRows=lib.length?lib.slice(0,40).map(function(x){
      var m=x.item;
      return '<div class="ks-file">'+ic(m.kind==='video'?'film':'photo','ks-ti')
        +'<span class="fn">'+esc(m.name)+'</span><span class="fs">'+esc(m.kind==='video'&&m.dur?mmss(m.dur):bytes(m.bytes||0))+'</span>'
        +'<span class="ks-chk'+(have[m.blob]?' on':'')+'" data-a="libadd" data-from="'+x.from+'" data-id="'+m.id+'">'+ic('check')+'</span></div>';
    }).join(''):'<div class="ks-empty">Media from earlier posts shows up here.</div>';

    function postRows2(list){
      if(!list.length) return '<div class="ks-empty">Nothing here yet.</div>';
      return list.filter(function(x){ return hit(x.title); }).map(function(x){
        return '<div class="ks-file'+(x.id===p.id?'':' muted')+'">'+ic('photo','ks-ti')
          +'<span class="fn" data-a="open" data-id="'+x.id+'">'+esc(x.title||'Untitled post')+'</span>'
          +'<span class="fs">'+esc(x.status==='scheduled'&&x.when?when(x.when):ago(x.updated||x.created))+'</span></div>';
      }).join('');
    }
    var drafts=posts.filter(function(x){ return x.status==='draft'||x.status==='failed'||x.status==='partial'; });
    var sched=posts.filter(function(x){ return x.status==='scheduled'||x.status==='publishing'||x.status==='uploading'; });
    var sent=posts.filter(function(x){ return x.status==='sent'||x.status==='drafted'; });

    var card=function(k){
      var st=KPo.linkState(k), on=targets().indexOf(k)>=0, lab=KPo.label(k);
      var inc=KPo.postMedia(p).filter(function(m){ return m.thumb; }).slice(0,2);
      var pics=inc.length
        ? inc.map(function(m,i){ return '<div class="ph '+(i?'b':'a')+'" style="'+thumbOf(m)+'"></div>'; }).join('')
          +(inc.length<2?'<div class="ph b g">'+ic(BRAND[k])+'</div>':'')
        : '<div class="ph a g">'+ic(BRAND[k])+'</div><div class="ph b g">'+ic('photo')+'</div>';
      var sub=st==='manual'?'You post it':(st==='on'?(lab||'Connected'):(st==='unconfigured'?'Needs setup':(st==='noupload'?'Allow uploads':'Tap to connect')));
      return '<div class="ks-card'+(on?' on':'')+(st!=='on'?' off':'')+'" data-a="card" data-k="'+k+'">'
        +'<div class="n">'+KPo.PLAT[k].n+'</div><div class="s">'+esc(sub)+'</div>'
        +'<span class="ks-chk sm'+(on?' on':'')+'" data-a="target" data-k="'+k+'">'+ic('check')+'</span>'
        +'<div class="ks-pocket">'+pics+'<div class="pk"></div></div></div>';
    };
    var groups=KPo.GROUPS.map(function(g){
      return '<div class="ks-grp">'+esc(g[0])+'</div><div class="ks-acc">'+g[1].map(card).join('')+'</div>';
    }).join('');

    var engine=((window.KovaLink&&KovaLink.cache&&KovaLink.cache())||{})._engine;
    var writerOn=!S.writerOff;
    el.innerHTML=
      '<button class="ks-sq ks-panel-close" data-a="panel" aria-label="Close">'+ic('x')+'</button>'
      +'<div class="ks-search">'+ic('search')+'<input id="ksQ" placeholder="Search media and posts" value="'+esc(S.q)+'" autocomplete="off">'
        +'<button class="ks-more" data-a="pmenu" aria-label="More">'+ic('dots')+'</button></div>'
      +'<div class="ks-panel-scroll">'
        +'<div class="ks-sec">Project Assets</div>'
        +fold('post','This post',(p.media||[]).length,S.open.post,postRows+'<div class="ks-file" data-a="add"><span class="fn" style="color:var(--ks-t2)">'+ic('plus','ks-ti')+' Add photos or clips</span></div>')
        +fold('library','Library',lib.length,S.open.library,libRows)
        +fold('drafts','Drafts',drafts.length,S.open.drafts,postRows2(drafts))
        +fold('scheduled','Scheduled',sched.length,S.open.scheduled,postRows2(sched))
        +fold('sent','Published',sent.length,S.open.sent,postRows2(sent))
        +'<div class="ks-sec">Accounts</div>'
        +'<div class="ks-accsum">'+KPo.ORDER.length+' apps \u00b7 '+KPo.ORDER.filter(function(k){ var st=KPo.linkState(k); return st==='on'||st==='manual'; }).length+' ready \u00b7 '+targets().length+' in this post</div>'
        +'<div id="kfMini"></div>'
        +fold('acclist','All accounts as a list',KPo.ORDER.length,!!S.open.acclist,groups)
        +'<div class="ks-int"><span class="ii" style="color:#fff;filter:drop-shadow(0 0 8px rgba(255,255,255,.7))">'+ic('star','ii')+'</span>'
          +'<div><div class="n">Kova Writer</div><div class="s">Claude · Sonnet 5</div></div>'
          +(writerOn
            ?'<button class="ks-pill small red" data-a="writer">Turn off</button>'
            :'<button class="ks-pill small" data-a="writer">Turn on</button>')+'</div>'
        +'<div class="ks-int"><span class="ii" style="color:#fff;filter:drop-shadow(0 0 8px rgba(255,255,255,.6))">'+ic('ring','ii')+'</span>'
          +'<div><div class="n">Kova Server</div><div class="s">'+(engine&&engine.configured===false?'Publishing · writer off':'Publishing')+'</div></div>'
          +'<button class="ks-pill small" data-a="server">Check</button></div>'
      +'</div>'
      +'<div class="ks-foot"><div class="ks-go" data-a="inbox"><span>Go to inbox</span>'+ic('arrow')+'</div>'
        +'<button class="ks-sq" data-a="queue" aria-label="History">'+ic('history')+'</button>'
        +'<button class="ks-sq" data-a="new" aria-label="New post">'+ic('plus')+'</button>'
        +'<button class="ks-sq red" data-a="delete" aria-label="Delete this post">'+ic('trash')+'</button></div>';
    if(window.KovaFolders) KovaFolders.mount($('#kfMini',el));
    var qi=$('#ksQ',el);
    if(qi) qi.oninput=function(){ S.q=qi.value; var pos=qi.selectionStart; paintPanel(); var n=$('#ksQ'); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} } };
  }

  /* =============================== nodes ============================= */
  function port(dir,key,hot){ return '<span class="ks-port '+dir+(hot?' hot':'')+'" data-p="'+key+'"></span>'; }
  function head(title,dot,right){ return '<div class="ks-nh" data-drag="1"><i class="'+(dot||'')+'"></i>'+esc(title)+(right?'<span class="nr">'+esc(right)+'</span>':'')+'</div>'; }
  function param(key,label,value,opts){
    opts=opts||{};
    return '<div class="ks-param'+(opts.dim?' ks-dim':'')+'" data-param="'+key+'">'
      +'<span class="arw'+(opts.noL?' off':'')+'" data-step="-1">'+tri('l')+'</span>'
      +'<span class="k">'+esc(label)+'</span><span class="v" data-pick="'+key+'">'+esc(value)+'</span>'
      +'<span class="arw'+(opts.noR?' off':'')+'" data-step="1">'+tri('r')+'</span></div>';
  }

  function nodeMedia(p){
    var inc=KPo.included(p), fmt=p.format;
    var h=head('Media',inc.length?'live':'ks-dim',inc.length+' item'+(inc.length===1?'':'s'))
      +'<div class="ks-io"><div class="col"></div><div class="col r"><span class="ks-pl out">Media'+port('out','media.out',inc.length>0)+'</span></div></div>';
    var all=p.media||[];
    if(fmt==='slider'&&all.length){
      var t=0, parts=[];
      all.forEach(function(m,i){
        parts.push('<div class="ks-slide'+(i===S.slide?' cur':'')+'" data-a="slide" data-id="'+m.id+'" style="'+(m.on===false?'opacity:.35':'')+'">'
          +'<div class="im" style="'+thumbOf(m)+'"></div>'
          +(i>0?'<span class="mv l" data-a="mv" data-id="'+m.id+'" data-d="-1">'+ic('left')+'</span>':'')
          +(i<all.length-1?'<span class="mv r" data-a="mv" data-id="'+m.id+'" data-d="1">'+ic('right')+'</span>':'')
          +'</div>');
        t+=m.kind==='video'?(m.dur||0):3;
        if(i<all.length-1){
          var bub=i===S.slide?'<span class="ks-bubble">'+(all.some(function(x){return x.kind==='video'})?mmss(t)+' · '+mmss(all.reduce(function(s,x){return s+(x.kind==='video'?(x.dur||0):3)},0)):'Slide '+(i+2)+' of '+all.length)+'</span>':'';
          parts.push('<div class="ks-join">'+bub+'<span class="pl" data-a="insert" data-i="'+(i+1)+'">'+ic('plus')+'</span></div>');
        }
      });
      h+='<div class="ks-strip">'+parts.join('')+'</div>'
        +'<div class="ks-track" data-a="add">'+ic('upload')+'Click to add photos or clips</div>';
    }else{
      h+=all.map(function(m){
        return '<div class="ks-mrow" style="'+(m.on===false?'opacity:.4':'')+'"><div class="ks-thumb" style="'+thumbOf(m)+'">'+(m.kind==='video'&&m.dur?'<span class="d">'+mmss(m.dur)+'</span>':'')+'</div>'
          +'<div style="flex:1;min-width:0"><div class="mn">'+esc(m.name)+'</div><div class="ms">'+(m.kind==='video'?(m.sound===false?'<b class="ks-nosnd">No sound in this file</b>':'Video'):'Photo')
          +(m.w?' · '+m.w+'×'+m.h:'')+' · '+bytes(m.bytes||0)+'</div></div>'
          +'<span class="x" data-a="rm" data-id="'+m.id+'">'+ic('x')+'</span></div>';
      }).join('')
        +'<div class="ks-drop" data-a="add" id="ksDrop">'+ic('upload')+'Drop photos or clips</div>';
    }
    return '<div class="ks-node" data-n="media">'+h+'</div>';
  }

  function nodeText(p){
    var rows=KPo.FIELDS.map(function(f){
      var v=String(p[f]||'').trim();
      return '<div class="ks-trow'+(S.field===f?' on':'')+'" data-a="field" data-f="'+f+'"><span class="k">'+FIELD[f].a+'</span>'
        +'<span class="v'+(v?'':' ph')+'">'+esc(v||FIELD[f].b)+'</span></div>';
    }).join('');
    var any=KPo.FIELDS.some(function(f){ return String(p[f]||'').trim(); });
    return '<div class="ks-node" data-n="text">'+head('Words',any?'live':'ks-dim')
      +'<div class="ks-io"><div class="col"><span class="ks-pl">voice'+port('in','text.in',S.listening)+'</span></div>'
      +'<div class="col r"><span class="ks-pl out">Text'+port('out','text.out',any)+'</span></div></div>'
      +'<div class="ks-area">'+rows+'</div></div>';
  }

  function nodeCover(p){
    var inc=KPo.postMedia(p), c=inc[0];
    var img=c&&c.thumb?'background-image:url('+c.thumb+')':'';
    var ratio=p.aspect==='orig'?(c&&c.w?c.w+'/'+c.h:'4/5'):p.aspect.replace(':','/');
    var ct=p.coverText&&c&&c.kind==='image'&&String(p.heading||'').trim();
    return '<div class="ks-node" data-n="cover">'+head('Cover & shape',c?'live':'ks-dim')
      +'<div class="ks-io"><div class="col"><span class="ks-pl">media'+port('in','cover.in',!!c)+'</span></div>'
      +'<div class="col r"><span class="ks-pl out">Cover'+port('out','cover.out',!!c)+'</span></div></div>'
      +'<div class="ks-cover"><button class="ks-ar" data-a="aspect">'+esc(KPo.ASPECT_N[p.aspect]||p.aspect)+ic('down')+'</button>'
        +'<div class="im" style="'+img+';aspect-ratio:'+ratio+';left:50%;right:auto;width:auto;height:100%;transform:translateX(-50%)"></div>'
        +(ct?'<div class="sc"></div><div class="ct">'+esc(ct)+'</div>':'')+'</div>'
      +param('coverText','heading on cover',p.coverText?'on':'off',{dim:!(c&&c.kind==='image')})
      +(c&&c.kind==='video'?'<div class="ks-note" style="margin:10px 16px 0">Videos keep their own shape — the crop applies to photos.</div>':'')
      +'</div>';
  }

  function nodeFormat(p){
    var yt=targets().indexOf('youtube')>=0, tt=targets().indexOf('tiktok')>=0;
    var modeN={now:'post now',schedule:'schedule',draft:'send as draft'}[p.mode||'now'];
    var ok=targets().length&&targets().every(function(k){ return KPo.check(p,k,KPo.linkState(k)).ok; });
    return '<div class="ks-node" data-n="format">'+head('Settings',ok?'live':'ks-dim')
      +'<div class="ks-io"><div class="col"><span class="ks-pl">media'+port('in','format.media',KPo.included(p).length>0)+'</span>'
        +'<span class="ks-pl">text'+port('in','format.text',!!String(p.heading||p.body||p.caption||'').trim())+'</span>'
        +'<span class="ks-pl">cover'+port('in','format.cover',KPo.postMedia(p).length>0)+'</span>'
        +'<span class="ks-pl">accounts'+port('in','format.acc',targets().length>0)+'</span></div>'
      +'<div class="col r"><span class="ks-pl out">Post'+port('out','format.out',!!ok)+'</span></div></div>'
      +param('format','format',KPo.FORMAT_N[p.format]||p.format)
      +param('aspect','shape',KPo.ASPECT_N[p.aspect]||p.aspect)
      +param('when','when',modeN)
      +(p.mode==='schedule'?param('time','time',p.when?when(p.when):'pick a time'):'')
      +param('ytPrivacy','youtube',((p.opts.youtube||{}).privacy||'public'),{dim:!yt})
      +param('ttMode','tiktok',((p.opts.tiktok||{}).mode||'direct')==='draft'?'inbox draft':'post directly',{dim:!tt})
      +(targets().indexOf('metaads')>=0?param('adsetup','ads',adSummary(p),{noL:true,noR:true}):'')
      +(targets().indexOf('pinterest')>=0||targets().indexOf('metaads')>=0?param('link','shop link',p.link||'add a link',{noL:true,noR:true}):'')
      +(targets().indexOf('reddit')>=0?param('subreddit','subreddit',p.subreddit?'r/'+p.subreddit:'your profile',{noL:true,noR:true}):'')
      +param('name','name',p.title||'Untitled post',{noL:true,noR:true})
      +'</div>';
  }

  function adSummary(p){
    var o=KPo.adOpts(p);
    if(o.build!=='ads') return 'library only';
    return KPo.AD_GOAL[o.goal]+' · '+money(o.budget)+'/day'+(o.split==='each'&&KPo.postMedia(p).length>1?' each':'');
  }
  function money(v){ var n=+v||0; return (S.adCur&&S.adCur!=='USD'?S.adCur+' ':'$')+(n%1?n.toFixed(2):n); }
  function chanState(p,k){
    var st=KPo.linkState(k), r=(p.results||{})[k], on=targets().indexOf(k)>=0;
    if(r&&(p.status!=='draft'||r.state==='ok')){
      if(r.state==='working') return {cls:'',txt:'<span class="sp"></span>'};
      if(r.state==='ok') return {cls:'ok',txt:r.url?'<a href="'+esc(r.url)+'" target="_blank" rel="noopener">Posted</a>':'Posted'};
      if(r.state==='draft') return {cls:'ok',txt:'Draft sent'};
      if(r.state==='skipped') return {cls:'',txt:'Kept in Kova'};
      if(r.state==='error') return {cls:'bad',txt:'Failed'};
      if(r.state==='manual') return {cls:'',txt:'<span class="ks-lnk" data-a="hand">Your turn</span>'};
    }
    if(st==='manual') return on?{cls:'ok',txt:'You post'}:{cls:'',txt:'Off'};
    if(st==='unconfigured') return {cls:'',txt:'Needs setup'};
    if(st==='noupload') return {cls:'bad',txt:'Allow uploads'};
    if(st!=='on') return {cls:'',txt:'Connect'};
    if(!on) return {cls:'',txt:'Off'};
    var c=KPo.check(p,k,st);
    return c.ok?{cls:'ok',txt:'Ready'}:{cls:'bad',txt:'Needs a fix'};
  }
  function nodePublish(p){
    var n=targets().length, cache=(window.KovaLink&&KovaLink.cache&&KovaLink.cache())||{};
    var rows=targets().map(function(k){
      var st=chanState(p,k), c=cache[KPo.PLAT[k].link]||{};
      var pick=c.choose&&c.linked&&!KPo.byHand(k)?'<span class="ks-pick" data-a="choose" data-k="'+k+'">'+esc(c.label||'Choose')+ic('down')+'</span>':'';
      if(KPo.PLACES[k]) pick='<span class="ks-pick" data-a="place" data-k="'+k+'">'+esc(KPo.placeName(p,k))+ic('down')+'</span>'+pick;
      if(KPo.ACCT[k]&&(KPo.acct(k)||KPo.linkState(k)==='on')) pick='<span class="ks-pick" data-a="acct" data-k="'+k+'">'+esc(KPo.ACCT[k][KPo.acct(k)||KPo.ACCT[k].api][0])+ic('down')+'</span>'+pick;
      else if(KPo.byHand(k)) pick='<span class="ks-pick" data-a="acct" data-k="'+k+'">By hand'+ic('down')+'</span>';
      return '<div class="ks-chan" data-a="chan" data-k="'+k+'">'+ic(BRAND[k],'bi')
        +'<span class="cn">'+KPo.PLAT[k].n+pick+'</span><span class="cs '+st.cls+'">'+st.txt+'</span>'
        +'<span class="ks-chk sm on" data-a="target" data-k="'+k+'" style="width:26px;height:26px;border-radius:8px">'+ic('check')+'</span></div>';
    }).join('');
    rows+='<div class="ks-chan add" data-a="accounts">'+ic('plus','bi')+'<span class="cn">'+(n?'Add or connect accounts':'Pick where it goes')+'</span></div>';
    var live=p.status==='publishing'||p.status==='uploading';
    return '<div class="ks-node ks-lit" data-n="publish">'+head('Publish',live||n?'live':'ks-dim',n?n+' selected':'')
      +'<div class="ks-io"><div class="col"><span class="ks-pl">post'+port('in','publish.in',n>0)+'</span></div>'
      +'<div class="col r"><span class="ks-pl out">Live'+port('out','publish.out',p.status==='sent'||live)+'</span></div></div>'
      +rows+'</div>';
  }

  function nodePreview(p){
    var k=currentPlat(), inc=KPo.postMedia(p), m=inc[Math.min(S.slide,Math.max(0,inc.length-1))];
    var lab=KPo.label(k), acct=(window.KP&&KP.get('me')&&KP.get('me').name)||'You';
    var ratio=p.aspect==='orig'?(m&&m.w?m.w+'/'+m.h:'4/5'):p.aspect.replace(':','/');
    if(m&&m.kind==='video'&&p.format==='video') ratio=(m.w&&m.h)?m.w+'/'+m.h:'9/16';
    if(!inc.length) ratio='4/5';
    var c=KPo.check(p,k,KPo.linkState(k)), txt=c.text.text||'';
    var lim=KPo.PLAT[k].text, len=k==='x'?KPo.xLength(txt):KPo.chars(txt);
    var slider=inc.length>1;
    var media=m?(m.kind==='video'
        ?'<div class="bgi" style="'+thumbOf(m)+'"></div><video id="ksVid" data-a="play" data-mid="'+m.id+'" playsinline preload="metadata"></video>'
          +(m.sound===false?'<div class="ks-sndtag">'+ic('mute')+'This clip has no sound</div>'
            :(S.soundBlocked?'<button class="ks-sndtag on" data-a="unmute">'+ic('vol')+'Tap for sound</button>':''))
        :'<div class="bgi" id="ksImg" data-mid="'+m.id+'" style="'+thumbOf(m)+'"></div>')
      :'<div class="none">'+ic('photo')+'<div>Your post appears here as it will look.<br>Add a photo or clip to start.</div></div>';
    var timeBar;
    if(slider) timeBar='<div class="tl"><span>'+(S.slide+1)+' / '+inc.length+'</span><span>'+KPo.PLAT[k].n+'</span></div><div class="segs">'
      +inc.map(function(_,i){ return '<i class="'+(i<=S.slide?'on':'')+'"></i>'; }).join('')+'</div>';
    else if(m&&m.kind==='video') timeBar='<div class="tl"><span id="ksCur">0:00</span><span>'+mmss(m.dur).replace(/^0/,'')+'</span></div><div class="bar"><i id="ksBar" style="width:0%"></i></div>';
    else timeBar='<div class="tl"><span>'+(m?'Photo':'')+'</span><span>'+KPo.PLAT[k].n+'</span></div><div class="bar"><i style="width:100%"></i></div>';
    var plats=(targets().length?targets():KPo.ORDER).map(function(x){
      var cc=KPo.check(p,x,KPo.linkState(x));
      return '<div class="'+(x===k?'on':'')+'" data-a="plat" data-k="'+x+'"><i class="'+(cc.ok?'':'bad')+'"></i>'+KPo.PLAT[x].n+'</div>';
    }).join('');
    var r=(p.results||{})[k];
    var note='';
    if(r&&r.state==='error') note='<div class="ks-note bad">'+esc(KPo.PLAT[k].n+': '+r.msg)+'</div>';
    else if(r&&r.msg) note='<div class="ks-note">'+esc(r.msg)+'</div>';
    else if(!c.ok&&targets().indexOf(k)>=0) note='<div class="ks-note bad">'+esc(c.problems[0])+'</div>';
    else if(c.warnings.length) note='<div class="ks-note">'+esc(c.warnings[0])+'</div>';
    var busy=locked();
    var pubLabel=busy?(p.status==='uploading'?'Uploading':'Publishing'):({sent:'Posted',drafted:'Sent',partial:'Retry',failed:'Retry',scheduled:'Scheduled'}[p.status]||(p.mode==='schedule'?'Schedule':(p.mode==='draft'?'Send drafts':'Publish')));
    var pubOff=busy||p.status==='sent'||p.status==='drafted'||p.status==='scheduled';
    return '<div class="ks-node ks-prev" data-n="preview">'+head('Preview',busy?'live':'','')
      +'<div class="ks-io"><div class="col"><span class="ks-pl">post'+port('in','preview.in',p.status==='sent'||busy)+'</span></div><div class="col r"></div></div>'
      +'<div class="ks-media" style="aspect-ratio:'+ratio+'">'+media+'<div class="fade"></div>'
        +'<div class="ks-chip" data-a="nextplat"><div class="a">'+esc(lab?(acct||lab):KPo.PLAT[k].n)+'</div><div class="h">'+esc(lab||('Not connected · '+KPo.PLAT[k].n))+'</div></div>'
        +'<div class="ks-tr">'+(m&&m.kind==='video'&&m.sound!==false?'<button class="ks-sq glass" data-a="sound" id="ksSnd" aria-label="'+(S.muted?'Sound off':'Sound on')+'">'+ic(S.muted?'mute':'vol')+'</button>':'')
          +'<button class="ks-sq glass" data-a="share" aria-label="Copy or open">'+ic('share')+'</button>'
          +'<button class="ks-sq glass'+(p.fav?' fav':'')+'" data-a="fav" aria-label="Favourite">'+ic('heart')+'</button></div>'
        +(m?'<div class="ks-trans"><button class="ks-sq glass" data-a="prev" aria-label="Previous">'+ic('prev')+'</button>'
          +'<button class="ks-sq glass" data-a="play" aria-label="Play">'+ic(m.kind==='video'?'play':(slider?'play':'eye'))+'</button>'
          +'<button class="ks-sq glass" data-a="next" aria-label="Next">'+ic('next')+'</button></div>':'')
        +'<div class="ks-time">'+timeBar+'</div></div>'
      +'<div class="ks-plats">'+plats+'</div>'
      +'<div class="ks-ptext" data-a="edit"><div class="hd"><span>'+KPo.PLAT[k].n+(p.over&&p.over[k]?' · edited':'')+'</span><b class="'+(len>lim?'bad':'')+'">'+len+' / '+lim+'</b></div>'
        +'<div class="tx'+(txt?'':' ph')+'">'+esc(txt||'Write a heading, caption or primary text below.')+'</div></div>'
      +note
      +(S.prog>=0?'<div class="ks-prog"><i style="width:'+Math.round(S.prog*100)+'%"></i></div>':'')
      +'<div class="ks-acts">'
        +'<button class="ks-pill white" data-a="publish"'+(pubOff?' disabled':'')+'>'+ic('wand')+pubLabel+'</button>'
        +'<button class="ks-sq" data-a="schedule" aria-label="Schedule">'+ic('cal')+'</button>'
        +'<button class="ks-sq" data-a="savepost" aria-label="Save">'+ic('save')+'</button>'
        +'<button class="ks-sq" data-a="pdraft" aria-label="Send as drafts">'+ic('inbox')+'</button>'
        +'<button class="ks-sq red" data-a="delete" aria-label="Delete">'+ic('trash')+'</button></div>'
      +'</div>';
  }

  function paintWorld(){
    var p=P(); if(!world||!p) return;
    var vid=$('#ksVid'), t=vid&&!vid.paused?vid.currentTime:0;
    world.innerHTML='<svg class="ks-wires" id="ksWires"><defs>'
        +'<linearGradient id="ksWireGlow" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".15"/>'
        +'<stop offset=".55" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/></linearGradient>'
        +'<filter id="ksWireBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6" result="b"/>'
        +'<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs></svg>'
      +nodeMedia(p)+nodeText(p)+nodeCover(p)+nodeFormat(p)+nodePublish(p)+nodePreview(p);
    wires=$('#ksWires');
    loadPreviewMedia(t);
    if(rec) rec.disconnect();
    if(window.ResizeObserver){
      rec=new ResizeObserver(function(){ layout(); });
      $$('.ks-node',world).forEach(function(n){ rec.observe(n); });
    }
  }

  /* the preview shows the real file, not the thumbnail, once it loads */
  var urls={};
  function objUrl(m){
    if(urls[m.blob]) return Promise.resolve(urls[m.blob]);
    return KB.get(m.blob).then(function(b){
      if(!b||!(window.URL&&URL.createObjectURL)) return m.url||'';
      urls[m.blob]=URL.createObjectURL(b); return urls[m.blob];
    }).catch(function(){ return m.url||''; });
  }
  function loadPreviewMedia(t){
    var p=P(), inc=KPo.postMedia(p), m=inc[Math.min(S.slide,Math.max(0,inc.length-1))];
    if(!m) return;
    objUrl(m).then(function(u){
      if(!u) return;
      if(m.kind==='video'){
        var v=$('#ksVid'); if(!v) return;
        v.src=u; if(t) try{ v.currentTime=t; }catch(e){}
        v.ontimeupdate=function(){
          var c=$('#ksCur'), b=$('#ksBar');
          if(c) c.textContent=mmss(v.currentTime).replace(/^0/,'');
          if(b&&v.duration) b.style.width=(v.currentTime/v.duration*100)+'%';
        };
        v.onended=function(){ setPlayIcon(false); if(KPo.postMedia(P()).length>1) step(1,true); };
      }else{
        var im=$('#ksImg'); if(im) im.style.backgroundImage='url('+u+')';
      }
    });
  }

  /* ---------------- layout + wires ---------------- */
  var EDGES=[['media.out','format.media'],['text.out','format.text'],['cover.out','format.cover'],['media.out','cover.in'],
             ['format.out','publish.in'],['publish.out','preview.in']];
  var COLS=[['media','text','cover'],['format','publish'],['preview']];
  function layout(){
    if(!world) return;
    if(S.desk){
      var x=0;
      COLS.forEach(function(col,ci){
        var y=ci===1?64:(ci===2?92:0), w=0;
        col.forEach(function(n){
          var el=$('.ks-node[data-n="'+n+'"]',world); if(!el) return;
          var pos=S.pos[n]||{x:x,y:y};
          el.style.left=pos.x+'px'; el.style.top=pos.y+'px';
          y+=el.offsetHeight+46; w=Math.max(w,el.offsetWidth);
        });
        x+=w+(ci===0?92:86);
      });
      var b=bounds();
      world.style.width=b.w+'px'; world.style.height=b.h+'px';
      if(!S.view) fit(false); else applyView();
    }else{
      $$('.ks-node',world).forEach(function(el){ el.style.left=''; el.style.top=''; });
      world.style.width=''; world.style.height=''; world.style.transform='';
    }
    drawWires();
  }
  function bounds(){
    var w=0,h=0;
    $$('.ks-node',world).forEach(function(el){ w=Math.max(w,el.offsetLeft+el.offsetWidth); h=Math.max(h,el.offsetTop+el.offsetHeight); });
    return {w:w+60,h:h+60};
  }
  function portXY(key){
    var el=$('[data-p="'+key+'"]',world); if(!el) return null;
    var x=el.offsetWidth/2, y=el.offsetHeight/2, n=el;
    while(n&&n!==world){ x+=n.offsetLeft; y+=n.offsetTop; n=n.offsetParent; }
    if(n!==world) return null;
    return {x:x,y:y,hot:el.classList.contains('hot'),node:el.closest('.ks-node')};
  }
  function drawWires(){
    if(!wires) return;
    var defs=wires.querySelector('defs').outerHTML, out=[], plus=[];
    var W=world.scrollWidth, H=world.scrollHeight;
    wires.setAttribute('width',W); wires.setAttribute('height',H);
    var busy=locked();
    EDGES.forEach(function(e,i){
      var a=portXY(e[0]), b=portXY(e[1]); if(!a||!b) return;
      var d;
      if(S.desk){
        var dx=Math.max(70,Math.abs(b.x-a.x)*.5);
        d='M'+a.x+' '+a.y+' C'+(a.x+dx)+' '+a.y+' '+(b.x-dx)+' '+b.y+' '+b.x+' '+b.y;

      }else{
        /* phone: route through the gutters and the gap above the target,
           never across a card */
        var gx=a.node.offsetLeft+a.node.offsetWidth+12+(i%3)*5, lx=b.node.offsetLeft-12-(i%3)*5;
        var gy=b.node.offsetTop-14-(i%3)*5, r=10;
        if(gy<a.y+r) gy=a.y+r+2;
        d='M'+a.x+' '+a.y+' L'+(gx-r)+' '+a.y+' Q'+gx+' '+a.y+' '+gx+' '+(a.y+r)
          +' L'+gx+' '+(gy-r)+' Q'+gx+' '+gy+' '+(gx-r)+' '+gy
          +' L'+(lx+r)+' '+gy+' Q'+lx+' '+gy+' '+lx+' '+(gy+r)
          +' L'+lx+' '+(b.y-r)+' Q'+lx+' '+b.y+' '+(lx+r)+' '+b.y+' L'+b.x+' '+b.y;
      }
      out.push('<path class="w" d="'+d+'"/>');
      if(a.hot&&b.hot) out.push('<path class="w '+(busy&&i>=4?'flow':'lit')+'" d="'+d+'"/>');
    });
    wires.innerHTML=defs+out.join('');
    $$('.ks-plus',world).forEach(function(n){ n.remove(); });
    plus.forEach(function(p){
      var el=document.createElement('button');
      el.className='ks-plus'; el.setAttribute('data-a',p.a); el.style.left=p.x+'px'; el.style.top=p.y+'px';
      el.setAttribute('aria-label',p.a==='add'?'Add media':'Write with Kova'); el.innerHTML=ic('plus');
      world.appendChild(el);
    });
  }

  /* ---------------- pan + zoom (desktop) ---------------- */
  function applyView(){
    if(!S.view) return;
    world.style.transform='translate('+S.view.x+'px,'+S.view.y+'px) scale('+S.view.k+')';
  }
  function fit(save){
    if(!view) return;
    /* like the reference: full-size nodes across the width, the dock
       floating over the lower ones - pan down for the rest */
    var b=bounds(), vw=view.clientWidth, vh=view.clientHeight;
    if(!vw||!vh) return;
    var k=Math.min(1,Math.max(.5,(vw-48)/b.w));
    S.view={k:k,x:Math.max(24,(vw-b.w*k)/2),y:22};
    applyView(); if(save!==false) lsSet('ks.view',S.view);
  }
  function zoom(f,cx,cy){
    if(!S.view) fit(false);
    var v=S.view, k=Math.min(1.6,Math.max(.3,v.k*f));
    if(cx==null){ cx=view.clientWidth/2; cy=view.clientHeight/2; }
    v.x=cx-(cx-v.x)*(k/v.k); v.y=cy-(cy-v.y)*(k/v.k); v.k=k;
    applyView(); lsSet('ks.view',v);
  }
  function look(){
    var el=$('.ks-node[data-n="preview"]',world); if(!el||!S.desk) return;
    var k=Math.min(1,(view.clientHeight-240)/el.offsetHeight);
    S.view={k:k,x:view.clientWidth/2-(el.offsetLeft+el.offsetWidth/2)*k,y:24-(el.offsetTop)*k};
    applyView(); lsSet('ks.view',S.view);
  }

  /* =============================== dock ============================== */
  function limitFor(f){
    var t=targets(), p=P();
    if(f==='heading') return t.indexOf('youtube')>=0?{n:100,w:'YouTube title'}:null;
    if(f==='caption'){ if(t.indexOf('x')>=0) return {n:280,w:'X'}; if(t.length) return {n:2200,w:'Instagram'}; return null; }
    if(f==='body') return t.indexOf('linkedin')>=0?{n:3000,w:'LinkedIn'}:(t.indexOf('youtube')>=0?{n:5000,w:'YouTube'}:null);
    if(f==='tags') return {n:t.indexOf('instagram')>=0?30:10,w:'tags',tags:true};
    return null;
  }
  function counter(){
    var p=P(), f=S.field, L=limitFor(f), v=String(p[f]||'');
    if(!L) return {t:KPo.chars(v)+'',bad:false};
    var n=L.tags?KPo.tagList(v).length:(L.w==='X'?KPo.xLength(v):KPo.chars(v));
    return {t:n+' / '+L.n+(L.tags?' tags':' · '+L.w),bad:n>L.n};
  }
  function paintDock(){
    var p=P(), el=$('#ksDock'); if(!el||!p) return;
    var tabs=KPo.FIELDS.map(function(f){
      return '<div class="ks-dt'+(S.field===f?' on':'')+(String(p[f]||'').trim()?' done':'')+'" data-a="field" data-f="'+f+'"><div class="a">'+FIELD[f].a+'</div><div class="b">'+FIELD[f].b+'</div></div>';
    }).join('');
    var c=counter(), v=String(p[S.field]||'');
    var speech=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
    el.innerHTML='<div class="ks-dtabs">'+tabs+'</div>'
      +'<div class="ks-front"><span class="ks-cnt'+(c.bad?' bad':'')+'" id="ksCnt">'+esc(c.t)+'</span>'
        +'<div class="ks-fin"><div class="gh" id="ksGh"></div>'
        +'<textarea id="ksTa" rows="2" placeholder="'+esc(FIELD[S.field].ph)+'"'+(locked()?' readonly':'')+'>'+esc(v)+'</textarea></div>'
        +(S.sugg?'<div class="ks-sugg"><button class="ks-pill white" data-a="usesugg">Use it</button><button class="ks-pill" data-a="write">Try again</button><button class="ks-pill" data-a="dropsugg">Dismiss</button></div>':'')
        +'<div class="ks-fb">'
          +(S.field==='tags'?'<button class="ks-pill ks-tagbtn" data-a="tags" aria-label="Pick hashtags">#&nbsp;Pick tags</button>':'')
          +'<button class="ks-sq'+(S.suggBusy?' busy':'')+'" data-a="write" aria-label="Write with Kova"'+(S.writerOff?' disabled':'')+'>'+ic('chat')+'</button>'
          +'<div class="ks-voice'+(S.listening?' live':'')+'"><div class="ks-wave">'
            +'<div class="r"><i style="width:22px"></i><i style="width:64px"></i><i style="width:14px;opacity:.4"></i></div>'
            +'<div class="r"><i style="width:38px"></i><i class="d"></i><i class="d"></i><i style="width:30px"></i><i style="width:18px;opacity:.45"></i></div>'
            +'<div class="r"><i style="width:48px;opacity:.7"></i><i style="width:26px"></i></div></div>'
            +'<div class="lb">'+(S.listening?'Voice dictation…':(speech?'Tap the mic to dictate':'Voice needs Safari or Chrome'))+'</div></div>'
          +'<button class="ks-sq'+(S.listening?' on':'')+'" data-a="mic" aria-label="Dictate"'+(speech?'':' disabled')+'>'+ic('mic')+'</button>'
        +'</div></div>';
    paintGhost();
    var ta=$('#ksTa');
    ta.oninput=function(){
      if(locked()) return;
      P()[S.field]=ta.value; S.sugg=''; touch(); paintGhost();
      var cc=counter(), ce=$('#ksCnt'); if(ce){ ce.textContent=cc.t; ce.classList.toggle('bad',cc.bad); }
      softPaint();
    };
    ta.onfocus=function(){ el.classList.remove('min'); };
    ta.onblur=function(){ setTimeout(function(){ if(!el.contains(document.activeElement)&&!S.listening&&!S.sugg&&!S.suggBusy) el.classList.add('min'); },180); };
    if(S.sugg||S.listening) el.classList.remove('min');
    ta.onkeydown=function(e){
      if(e.key==='Tab'&&S.sugg){ e.preventDefault(); useSugg(); }
      else if(e.key==='Escape'&&S.sugg){ S.sugg=''; paintDock(); }
      else if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){ e.preventDefault(); var i=KPo.FIELDS.indexOf(S.field); setField(KPo.FIELDS[(i+1)%4],true); }
    };
  }
  function paintGhost(){
    var g=$('#ksGh'), ta=$('#ksTa'); if(!g||!ta) return;
    g.innerHTML=S.sugg?(ta.value?esc(ta.value)+' ':'')+'<em>'+esc(S.sugg)+'</em>':'';
    ta.style.color=S.sugg&&ta.value?'rgba(255,255,255,.5)':'';
  }
  /* repaint the canvas without touching the text box being typed in */
  var softT=null;
  function softPaint(){
    clearTimeout(softT);
    softT=setTimeout(function(){
      var p=P(); if(!p) return;
      ['text','cover','format','publish','preview'].forEach(function(n){
        var old=$('.ks-node[data-n="'+n+'"]',world); if(!old) return;
        var html={text:nodeText,cover:nodeCover,format:nodeFormat,publish:nodePublish,preview:nodePreview}[n](p);
        var tmp=document.createElement('div'); tmp.innerHTML=html;
        var nu=tmp.firstChild; nu.style.left=old.style.left; nu.style.top=old.style.top;
        var reuse=false;
        if(n==='preview'){
          /* keep a playing clip playing while the words change - but only
             if it is still the same clip */
          var ov=$('#ksVid'), nv=nu.querySelector('#ksVid');
          if(ov&&nv&&ov.dataset.mid===nv.dataset.mid){ nv.parentNode.replaceChild(ov,nv); reuse=true; }
          var oi=$('#ksImg'), ni=nu.querySelector('#ksImg');
          if(oi&&ni&&oi.dataset.mid===ni.dataset.mid){ ni.style.backgroundImage=oi.style.backgroundImage; reuse=true; }
        }
        old.parentNode.replaceChild(nu,old);
        if(rec) rec.observe(nu);
        if(n==='preview'&&!reuse) loadPreviewMedia(0);
      });
      paintTop(); paintStats(); layout();
    },120);
  }
  function setField(f,focus){
    S.field=f; S.sugg='';
    paintDock(); softPaint();
    if(focus){ var ta=$('#ksTa'); if(ta){ ta.focus(); try{ ta.setSelectionRange(ta.value.length,ta.value.length); }catch(e){} } }
  }
  function useSugg(){
    if(!S.sugg) return;
    var p=P(), f=S.field, v=String(p[f]||'').trim();
    p[f]=(f==='tags'&&v)?(v+' '+S.sugg):S.sugg;
    S.sugg=''; touch(); paintDock(); softPaint();
  }

  /* ---------------- the writer (api /write) ---------------- */
  function write(){
    var p=P(); if(!p||S.suggBusy||S.writerOff) return;
    S.suggBusy=true; paintDock();
    KPo.write(p,S.field,'').then(function(t){
      S.suggBusy=false; S.sugg=t; paintDock();
      var ta=$('#ksTa'); if(ta) ta.focus();
    }).catch(function(e){
      S.suggBusy=false; paintDock();
      if(e&&e.signin) return signinPrompt(e.message);
      toast(e&&e.status===503?'The writer is not set up on the Kova server yet.':((e&&e.message)||'The writer is unavailable right now.'));
    });
  }

  /* ---------------- dictation ---------------- */
  var recog=null;
  function mic(){
    var R=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!R) return toast('Voice dictation needs Safari or Chrome.');
    if(S.listening&&recog){ try{ recog.stop(); }catch(e){} return; }
    var p=P(), f=S.field, base=String(p[f]||'');
    recog=new R(); recog.continuous=true; recog.interimResults=true;
    recog.lang=document.documentElement.lang||navigator.language||'en-US';
    recog.onresult=function(ev){
      var fin='', tmp='';
      for(var i=0;i<ev.results.length;i++){ var t=ev.results[i][0].transcript; if(ev.results[i].isFinal) fin+=t; else tmp+=t; }
      var sep=base&&!/\s$/.test(base)?' ':'';
      P()[f]=base+sep+(fin+tmp).trim();
      var ta=$('#ksTa'); if(ta&&S.field===f) ta.value=P()[f];
      touch(); softPaint();
    };
    recog.onend=function(){ S.listening=false; recog=null; paintDock(); paintWorldSoft(); };
    recog.onerror=function(e){ if(e&&e.error==='not-allowed') toast('Allow the microphone to dictate.'); };
    try{ recog.start(); S.listening=true; $('#ksDock').classList.remove('min'); paintDock(); paintWorldSoft(); }
    catch(e){ toast('Could not start the microphone.'); }
  }
  function paintWorldSoft(){ softPaint(); }

  /* =============================== stats + veil ====================== */
  function paintStats(){
    var el=$('#ksStats'), p=P(); if(!el||!p) return;
    var n=$$('.ks-node',world).length;
    el.innerHTML='T: '+(S.lastRun?(S.lastRun/1000).toFixed(2):'0.00')+'s<br>I: '+KPo.included(p).length+'<br>N: '+n+' ('+n+')';
  }
  function paintVeil(){
    var old=$('.ks-veil',root); if(old) old.remove();
    var dismissed=lsGet('ks.started',false);
    var anyLinked=KPo.ORDER.some(function(k){ return KPo.linkState(k)==='on'; });
    if(dismissed||KPo.all().some(function(x){ return (x.media||[]).length||x.status!=='draft'; })||anyLinked) return;
    var v=document.createElement('div'); v.className='ks-veil';
    v.innerHTML='<div class="ks-start"><div class="ast">'+ic('ast')+'</div>'
      +'<h3>Get started today</h3>'
      +'<p>Drop in photos or clips, write it once, and send it to YouTube, Instagram, TikTok, LinkedIn and X.</p>'
      +'<button class="ks-pill white ks-big" data-a="v-connect"><i></i>Connect your accounts</button>'
      +'<div class="row"><button class="ks-pill" data-a="v-drafts">Drafts only</button>'
      +'<button class="ks-pill white" data-a="v-start">'+ic('wand')+'Get Started</button></div></div>';
    (S.desk?$('#ksStage'):root).appendChild(v);
  }

  /* =============================== menus ============================= */
  function closeMenu(){ var m=$('.ks-drop-menu'); if(m) m.remove(); var m2=$('.ks-menu'); if(m2) m2.remove(); S.menu=null; }
  function dropMenu(anchor,html){
    closeMenu();
    var d=document.createElement('div'); d.className='ks-drop-menu'; d.innerHTML=html;
    document.body.appendChild(d);
    var r=anchor.getBoundingClientRect();
    d.style.top=(r.bottom+10)+'px';
    d.style.left=Math.max(12,Math.min(window.innerWidth-d.offsetWidth-12,r.right-d.offsetWidth))+'px';
    S.menu=d; return d;
  }
  function pickMenu(anchor,items,cur,cb){
    closeMenu();
    var d=document.createElement('div'); d.className='ks-menu';
    d.innerHTML=items.map(function(it){ return '<div data-v="'+esc(it[0])+'" class="'+(it[0]===cur?'on':'')+'">'+esc(it[1])+'</div>'; }).join('');
    document.body.appendChild(d);
    var r=anchor.getBoundingClientRect();
    d.style.left=Math.min(window.innerWidth-d.offsetWidth-10,r.left)+'px';
    d.style.top=Math.min(window.innerHeight-d.offsetHeight-10,r.bottom+6)+'px';
    d.onclick=function(e){ var t=e.target.closest('[data-v]'); if(!t) return; closeMenu(); cb(t.getAttribute('data-v')); };
    S.menu=d;
  }
  function queueMenu(anchor){
    var posts=KPo.all();
    var groups=[['Publishing',posts.filter(function(x){return x.status==='publishing'||x.status==='uploading'})],
                ['Scheduled',posts.filter(function(x){return x.status==='scheduled'})],
                ['Needs attention',posts.filter(function(x){return x.status==='failed'||x.status==='partial'})],
                ['Drafts',posts.filter(function(x){return x.status==='draft'})],
                ['Published',posts.filter(function(x){return x.status==='sent'||x.status==='drafted'})]];
    var h='<div class="ks-qrow" data-a="new"><div class="ks-thumb" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08)">'+ic('plus')+'</div>'
      +'<div class="m"><div class="t">New post</div><div class="s">Start from nothing</div></div></div>';
    groups.forEach(function(g){
      if(!g[1].length) return;
      h+='<div class="ks-qh">'+g[0]+' · '+g[1].length+'</div>'+g[1].slice(0,12).map(function(x){
        var m=(x.media||[])[0];
        var dots=(x.targets||[]).map(function(k){ var r=(x.results||{})[k]; return '<i class="'+(r?(r.state==='error'?'bad':(r.state==='ok'||r.state==='draft'?'ok':'')):'')+'"></i>'; }).join('');
        return '<div class="ks-qrow" data-a="open" data-id="'+x.id+'"><div class="ks-thumb" style="'+thumbOf(m)+'"></div>'
          +'<div class="m"><div class="t">'+esc(x.title||'Untitled post')+(x.fav?' ♥':'')+'</div><div class="s">'
          +esc((STATE_N[x.status]||x.status)+' · '+(x.status==='scheduled'&&x.when?when(x.when):ago(x.updated||x.created)))+'</div></div>'
          +'<div class="ks-dots">'+dots+'</div>'
          +(x.status==='scheduled'?'<button class="ks-pill small" data-a="unsched" data-id="'+x.id+'">Cancel</button>':'')+'</div>';
      }).join('');
    });
    dropMenu(anchor,h);
  }
  function mainMenu(anchor){
    var p=P();
    dropMenu(anchor,
      '<div class="ks-qrow" data-a="tour"><div class="m"><div class="t">Show me around</div><div class="s">A 30-second tour</div></div></div>'
      +'<div class="ks-qrow" data-a="board"><div class="m"><div class="t">Board</div><div class="s">Tasks, projects, goals</div></div></div>'
      +'<div class="ks-qrow" data-a="inbox"><div class="m"><div class="t">Inbox</div><div class="s">Comments, grouped by question</div></div></div>'
      +'<div class="ks-qh">This post</div>'
      +'<div class="ks-qrow" data-a="new"><div class="m"><div class="t">New post</div></div></div>'
      +'<div class="ks-qrow" data-a="dupe"><div class="m"><div class="t">Duplicate as a new version</div><div class="s">Post it again, changed</div></div></div>'
      +'<div class="ks-qrow" data-a="rename"><div class="m"><div class="t">Rename</div></div></div>'
      +'<div class="ks-qrow" data-a="log"><div class="m"><div class="t">Results</div><div class="s">What each platform said</div></div></div>'
      +'<div class="ks-qrow" data-a="traction"><div class="m"><div class="t">Traction</div><div class="s">Views, drop-off, comments, what to fix</div></div></div>'
      +'<div class="ks-qrow" data-a="bizcard"><div class="m"><div class="t">Business card</div><div class="s">"For business inquiries" on your profiles</div></div></div>'
      +'<div class="ks-qrow" data-a="sync"><div class="m"><div class="t">Refresh from the server</div></div></div>'
      +'<div class="ks-qrow" data-a="brief"><div class="m"><div class="t">Brief composer</div><div class="s">Shape a post from one sentence</div></div></div>'
      +'<div class="ks-qrow" data-a="server"><div class="m"><div class="t">Accounts & server</div></div></div>'
      +'<div class="ks-qrow" data-a="delete"><div class="m"><div class="t" style="color:var(--ks-red)">Delete this post</div></div></div>');
    return p;
  }
  function logMenu(anchor){
    var p=P(), rows=(p.targets||[]).map(function(k){
      var r=(p.results||{})[k];
      return '<div class="ks-qrow"><span style="width:22px;display:flex">'+ic(BRAND[k])+'</span><div class="m"><div class="t">'+KPo.PLAT[k].n+'</div>'
        +'<div class="s" style="white-space:normal">'+esc(r?((r.state==='ok'?'Posted':r.state==='draft'?'Draft sent':r.state==='skipped'?'Kept in Kova':r.state==='working'?'Working…':'Failed')+(r.msg?' — '+r.msg:'')):'Not sent yet')+'</div></div>'
        +(r&&r.url?'<a class="ks-sq" style="width:38px;height:38px;border-radius:12px" href="'+esc(r.url)+'" target="_blank" rel="noopener">'+ic('link')+'</a>':'')+'</div>';
    }).join('');
    dropMenu(anchor,'<div class="ks-qh">Results · '+esc(STATE_N[p.status]||p.status)+'</div>'+(rows||'<div class="ks-empty" style="padding:8px">Pick accounts to see results here.</div>'));
  }

  /* =============================== actions =========================== */
  function signinPrompt(msg){
    toast(msg||'Sign in to publish.');
    try{ if(window.KovaCloudAuth&&KovaCloudAuth.open) KovaCloudAuth.open(); }catch(e){}
  }
  function addFiles(list,at){
    var p=P(); if(!p||locked()) return;
    var files=Array.prototype.slice.call(list||[]).filter(function(f){ return /^(image|video)\//.test(f.type); });
    if(!files.length) return toast('Pick photos or videos.');
    toast('Adding '+files.length+' file'+(files.length>1?'s':'')+'…');
    var chain=Promise.resolve(), added=[];
    files.forEach(function(f){ chain=chain.then(function(){ return KPo.probe(f).then(function(m){ added.push(m); },function(e){ toast(e.message); }); }); });
    chain.then(function(){
      if(!added.length) return;
      var idx=at==null?p.media.length:at;
      Array.prototype.splice.apply(p.media,[idx,0].concat(added));
      p.format=KPo.naturalFormat(p);
      if(p.title==='Untitled post'&&added[0]) p.title=added[0].name.replace(/\.[a-z0-9]+$/i,'').replace(/[_-]+/g,' ').slice(0,60)||p.title;
      if(p.format==='video'&&p.aspect==='4:5') p.aspect='orig';
      S.slide=Math.min(idx,p.media.length-1);
      lsSet('ks.started',true);
      KPo.save(p); render();
      var quiet=added.filter(function(m){ return m.kind==='video'&&m.sound===false; }).length;
      toast(added.length+' added.'+(quiet?' '+(quiet===1?'One clip has':quiet+' clips have')+' no sound in the file itself.':''));
      if(added[0]&&added[0].kind==='video'&&KPo.postMedia(p)[S.slide]===added[0]) setTimeout(function(){
        var v=$('#ksVid'); if(!v||!v.paused) return;
        v.muted=S.muted; var pr=v.play(); if(pr&&pr.then) pr.then(function(){ setPlayIcon(true); }).catch(function(){});
      },450);
    });
  }
  function toggleTarget(k){
    var p=P(); if(!p||locked()) return;
    var st=KPo.linkState(k);
    if(st!=='on'&&st!=='manual'&&p.targets.indexOf(k)<0){ connect(k); return; }
    var i=p.targets.indexOf(k);
    if(i>=0) p.targets.splice(i,1); else p.targets.push(k);
    S.plat=i>=0?S.plat:k;
    KPo.save(p); render();
    if(i<0&&KPo.PLACES[k]) placeSheet(k);
  }
  /* ---------------- connecting accounts ----------------
     Every "no" gets a short screen that says what is missing and what to
     do, instead of a window that opens blank and closes. */
  var SETUP={
    youtube:['Google Cloud console','APIs & Services → Credentials → OAuth client (Web). Turn on YouTube Data API v3.'],
    gbusiness:['Google Cloud console','The same Google client as YouTube, plus Business Profile API access from Google.'],
    facebook:['developers.facebook.com','Create a Business app → add Facebook Login for Business.'],
    metaads:['developers.facebook.com','The same Meta app as Facebook → add the Marketing API.'],
    instagram:['developers.facebook.com','The same Meta app → add Instagram API with Instagram Login.'],
    threads:['developers.facebook.com','Create an app with the Threads use case.'],
    tiktok:['developers.tiktok.com','Manage apps → add Login Kit and Content Posting API.'],
    linkedin:['linkedin.com/developers','Create app → add Share on LinkedIn and Sign In with OpenID Connect.'],
    x:['developer.x.com','Your app → User authentication → OAuth 2.0, Web App.'],
    pinterest:['developers.pinterest.com','My apps → Connect app.'],
    reddit:['reddit.com/prefs/apps','Create app → type “web app”.'],
    tumblr:['tumblr.com/oauth/apps','Register application.']
  };
  var CALLBACK=(window.KovaLink?KovaLink.server():'')+'/oauth/callback';
  function sheet(html,onWire){
    closeSheet();
    var v=document.createElement('div'); v.className='ks ks-veil ks-sheet'; v.id='ksSheet';
    v.innerHTML='<div class="ks-start ks-card-sheet">'+html+'</div>';
    document.body.appendChild(v);
    v.addEventListener('click',function(e){
      if(e.target===v){ closeSheet(); return; }
      var a=e.target.closest('[data-s]'); if(!a) return;
      var k=a.getAttribute('data-s');
      if(k==='close') closeSheet();
      else if(onWire) onWire(k,v);
    });
    var first=v.querySelector('input'); if(first) setTimeout(function(){ try{ first.focus(); }catch(e){} },80);
    return v;
  }
  function closeSheet(){ var v=$('#ksSheet'); if(v) v.remove(); }
  function sheetHead(k,title,text){
    return '<div class="ks-sh-ic">'+ic(BRAND[k]||'ring')+'</div><h3>'+esc(title)+'</h3><p>'+text+'</p>';
  }
  function explain(r,k){
    var n=KPo.PLAT[k].n;
    if(r==='no-server'){
      return sheet(sheetHead(k,'Kova’s server isn’t live yet',
        'Accounts connect through Kova’s own server, and it has not been deployed. Once it is, this opens '+esc(n)+'’s sign-in and brings you straight back here.')
        +'<ol class="ks-steps"><li>Finish the Firebase sign-in in the terminal.</li><li>Switch the Firebase project to the Blaze plan.</li><li>Deploy the server (Claude can run it for you).</li></ol>'
        +(KPo.HAND[k]?'<button class="ks-pill white ks-big" data-s="hand">Post it myself for now</button><div class="ks-row2"><button class="ks-pill" data-s="close">Got it</button></div>'
                     :'<button class="ks-pill white ks-big" data-s="close">Got it</button>'),
        function(a){ if(a==='hand') byHandNow(k); });
    }
    if(r==='signin'){
      return sheet(sheetHead(k,'Sign in to Kova first','It is your '+esc(n)+' account being linked, so Kova needs to know who you are.')
        +'<button class="ks-pill white ks-big" data-s="signin">Sign in</button><div class="ks-row2"><button class="ks-pill" data-s="close">Not now</button></div>',
        function(a){ if(a==='signin'){ closeSheet(); if(window.KovaCloudAuth&&KovaCloudAuth.open) KovaCloudAuth.open(); } });
    }
    if(r==='not-configured'){
      var st=SETUP[k]||['the platform’s developer site',''];
      return sheet(sheetHead(k,esc(n)+' needs one-time setup',
        'Every platform wants its own developer app before any tool can post for you. This is done once, by you, on '+esc(st[0])+'.')
        +'<ol class="ks-steps"><li>'+esc(st[1])+'</li><li>Paste this as the redirect address:<code>'+CALLBACK+'</code></li><li>Give Claude the app ID; type the secret into the terminal when asked.</li></ol>'
        +'<button class="ks-pill white ks-big" data-s="copy">Copy the redirect address</button>'
        +'<div class="ks-row2">'+(KPo.HAND[k]?'<button class="ks-pill" data-s="hand">Post it myself for now</button>':'')+'<button class="ks-pill" data-s="close">Close</button></div>',
        function(a){ if(a==='copy'&&navigator.clipboard) navigator.clipboard.writeText(CALLBACK).then(function(){ toast('Copied.'); }); if(a==='hand') byHandNow(k); });
    }
    toast((window.KovaLink&&KovaLink.connect.lastError)||'That did not connect. Try again.');
  }
  var FORMS={
    bluesky:{title:'Connect Bluesky', text:'Use an <b>app password</b>, never your real one: Bluesky → Settings → Privacy and security → App passwords → Add.',
             fields:[['handle','Handle','you.bsky.social','text'],['password','App password','xxxx-xxxx-xxxx-xxxx','password']]},
    discord:{title:'Connect a Discord channel', text:'Server settings → Integrations → Webhooks → New webhook → pick the channel → <b>Copy Webhook URL</b>.',
             fields:[['webhook','Webhook link','https://discord.com/api/webhooks/…','url']]},
    telegram:{title:'Connect a Telegram channel', text:'Message <b>@BotFather</b> → /newbot → copy the token. Then add the bot to your channel as an <b>admin</b>.',
             fields:[['token','Bot token','123456:ABC…','password'],['chat','Channel','@yourchannel','text']]},
    mastodon:{title:'Connect Mastodon', text:'Which server is your account on? Kova then opens that server’s sign-in.',
             fields:[['instance','Server','mastodon.social','text']]}
  };
  function formSheet(k){
    var F=FORMS[k];
    sheet(sheetHead(k,F.title,F.text)
      +F.fields.map(function(f){ return '<label class="ks-lab">'+esc(f[1])+'</label><input class="ks-in" data-f="'+f[0]+'" type="'+f[3]+'" placeholder="'+esc(f[2])+'" autocomplete="off" autocapitalize="off" spellcheck="false">'; }).join('')
      +'<div class="ks-sh-err" id="ksShErr"></div>'
      +'<button class="ks-pill white ks-big" data-s="go">'+(k==='mastodon'?'Continue':'Connect')+'</button><div class="ks-row2"><button class="ks-pill" data-s="close">Cancel</button></div>',
      function(a,v){
        if(a!=='go') return;
        var fields={}; $$('input[data-f]',v).forEach(function(i){ fields[i.getAttribute('data-f')]=i.value.trim(); });
        var err=$('#ksShErr'), btn=v.querySelector('[data-s="go"]');
        btn.disabled=true; btn.textContent='Checking…'; err.textContent='';
        var done=function(res){
          btn.disabled=false; btn.textContent=k==='mastodon'?'Continue':'Connect';
          if(res&&res.ok){ closeSheet(); linkedNow(k); toast(KPo.PLAT[k].n+' connected'+(res.label?' — '+res.label:'')+'.'); return; }
          if(res&&res.reason&&res.reason!=='error'){ closeSheet(); explain(res.reason,k); return; }
          err.textContent=(res&&res.message)||'That did not work. Check it and try again.';
        };
        if(k==='mastodon'){
          KovaLink.connect('mastodon',{instance:fields.instance}).then(function(r){
            if(r==='redirecting') return;
            if(r==='error') return done({ok:false,message:KovaLink.connect.lastError||'That server did not answer.'});
            done({ok:false,reason:r});
          });
        }else KovaLink.link(k,fields).then(done);
      });
  }
  function linkedNow(k){
    var p=P(); if(p&&p.targets.indexOf(k)<0){ p.targets.push(k); KPo.save(p); }
    render();
  }
  function connect(k,asked){
    if(KPo.ACCT[k]&&!asked&&!KPo.acct(k)) return acctSheet(k);
    if(!window.KovaLink) return toast('The Kova server is not available.');
    var prov=k==='youtube'?'google':k;
    var kind=((KovaLink.cache()||{})[prov]||{}).kind||KPo.KIND[k]||'oauth';
    if(kind==='form'||kind==='instance') return formSheet(k);
    toast('Checking '+KPo.PLAT[k].n+'…');
    KovaLink.connect(prov).then(function(r){ if(r!=='redirecting') explain(r,k); });
  }
  function choose(k,anchor){
    toast('Loading…');
    KovaLink.targets(k).then(function(j){
      var items=(j.items||[]).map(function(i){ return [i.id,i.name]; });
      if(!items.length) return toast('Nothing to choose from on that account.');
      pickMenu(anchor,items,j.current,function(id){
        KovaLink.setTarget(k,id).then(function(r){ toast('Posting to '+((r&&r.label)||'it')+'.'); render(); });
      });
    });
  }

  /* ---------------- hashtags: pick several, see what each is worth ----------------
     Two numbers per tag, both honest:
       yours   how your own posts that used it did (views, from Traction)
       size    a rough band of how many posts use it (Claude's estimate,
               labelled est.) - no platform gives apps a live count.
     Grouped broad / mid / niche / brand: a few of each beats thirty
     huge ones you will never rank in. */
  var TIER={huge:['Huge','50M+ posts'],big:['Big','5M–50M'],medium:['Medium','500K–5M'],niche:['Niche','under 500K']};
  var TAGROUP=[['broad','Broad reach'],['mid','Your topic'],['niche','Niche - easier to rank'],['brand','Your brand']];
  function tagStats(){
    /* views per tag across your posts that Traction has read back */
    var T=(window.KovaTraction&&KovaTraction._state&&KovaTraction._state.posts)||{}, out={};
    KPo.all().forEach(function(post){
      var tr=T[post.id]; if(!tr||!tr.platforms) return;
      var v=0; Object.keys(tr.platforms).forEach(function(k){ v+=+((tr.platforms[k].metrics||{}).views||0); });
      KPo.tagList(post.tags).forEach(function(t){ var k=t.toLowerCase(); out[k]=out[k]||{n:0,v:0}; out[k].n++; out[k].v+=v; });
    });
    return out;
  }
  function wordsIn(p){
    var stop='the,and,for,with,that,this,your,you,are,was,from,have,just,what,when,they,will,into,about,than,then,them,more,most,every,after,before,over,only,here,there,their,been,were,also,like,make,made,does,done,week,days'.split(',');
    var seen={}, out=[];
    String([p.heading,p.caption,p.body].join(' ')).toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).forEach(function(w){
      if(w.length>=4&&stop.indexOf(w)<0&&!seen[w]){ seen[w]=1; out.push(w); }
    });
    return out.slice(0,10);
  }
  function tagSheet(){
    var p=P(); if(!p) return;
    var chosen={}; KPo.tagList(p.tags).forEach(function(t){ chosen[t.toLowerCase()]=t; });
    var cands=[], stats=tagStats(), busy=true, err='';
    function add(t,g,tier,why){
      t=String(t||'').replace(/^#+/,'').replace(/[^\p{L}\p{N}_]/gu,''); if(!t) return;
      if(cands.some(function(c){ return c.t.toLowerCase()===t.toLowerCase(); })) return;
      cands.push({t:t,g:g||'mid',tier:tier||'',why:why||''});
    }
    Object.keys(chosen).forEach(function(k){ add(chosen[k],'mid'); });
    function draw(){
      var n=Object.keys(chosen).length, lim=targets().indexOf('instagram')>=0?30:(targets().indexOf('x')>=0?2:30);
      var html='<h3># Hashtags</h3><p>Pick several. Each shows how <b>your</b> posts did with it, and a rough size. A mix of broad, topic and niche tags reaches further than all huge ones.</p>'
        +TAGROUP.map(function(G){
          var list=cands.filter(function(c){ return c.g===G[0]; }); if(!list.length) return '';
          return '<div class="ks-tg"><div class="ks-tgh">'+esc(G[1])+'</div><div class="ks-tgl">'+list.map(function(c){
            var on=!!chosen[c.t.toLowerCase()], st=stats[c.t.toLowerCase()], ti=TIER[c.tier];
            return '<button class="ks-tag'+(on?' on':'')+'" data-s="t:'+esc(c.t)+'" title="'+esc(c.why)+'">'
              +'<b>#'+esc(c.t)+'</b>'
              +'<span class="ks-tm">'+(ti?esc(ti[0])+' · '+esc(ti[1])+' <i>est.</i>':'size unknown')+'</span>'
              +'<span class="ks-ty">'+(st&&st.n?'Yours: '+st.n+' post'+(st.n>1?'s':'')+' · '+bigN(Math.round(st.v/st.n))+' views avg':'Yours: not used yet')+'</span>'
              +'<span class="ks-tc">'+(on?'✓':'+')+'</span></button>';
          }).join('')+'</div></div>';
        }).join('')
        +(busy?'<div class="ks-fine">Finding tags for this post…</div>':'')
        +(err?'<div class="ks-fine">'+esc(err)+'</div>':'')
        +'<div class="ks-fine">'+n+' picked'+(targets().indexOf('instagram')>=0?' · Instagram suggests 3–5 relevant tags':'')+(n>lim?' · over the limit for one of your apps':'')+'</div>'
        +'<button class="ks-pill white ks-big" data-s="use">Use '+n+' tag'+(n===1?'':'s')+'</button>'
        +'<div class="ks-row2"><button class="ks-pill" data-s="more">Suggest more</button><button class="ks-pill" data-s="close">Cancel</button></div>';
      var v=$('#ksSheet');
      if(v&&v.classList.contains('ks-tags')){ v.querySelector('.ks-card-sheet').innerHTML=html; return; }
      var nv=sheet(html,function(a){
        if(a.indexOf('t:')===0){ var t=a.slice(2), k=t.toLowerCase(); if(chosen[k]) delete chosen[k]; else chosen[k]=t; draw(); return; }
        if(a==='more'){ fetchMore(); return; }
        if(a==='use'){ p.tags=Object.keys(chosen).map(function(k){ return '#'+chosen[k]; }).join(' '); KPo.save(p); closeSheet(); S.field='tags'; render(); toast(Object.keys(chosen).length+' tags set.'); }
      });
      nv.classList.add('ks-tags');
    }
    function fetchMore(){
      busy=true; err=''; draw();
      KPo.hashtags(p).then(function(list){
        list.forEach(function(x){ add(x.tag,x.group,x.tier,x.why); }); busy=false; draw();
      }).catch(function(e){
        /* no server: the post's own words, so the picker still works */
        wordsIn(p).forEach(function(w,i){ add(w,i<3?'mid':'niche'); });
        busy=false; err=/server|reach|offline/i.test(e.message||'')?'Sizes need the Kova server. These come from your own words.':(e.message||''); draw();
      });
    }
    draw(); fetchMore();
  }
  function bigN(n){ n=+n||0; return n>=1e6?(n/1e6).toFixed(1).replace(/\.0$/,'')+'M':(n>=1e3?(n/1e3).toFixed(1).replace(/\.0$/,'')+'k':String(n)); }

  /* ---------------- Post, Reel or Story ----------------
     Pops up when a platform with a choice is ticked; the chip on its
     Publish row brings it back. Choices the media cannot be are shown
     with the reason instead of a button that fails later. */
  function placeSheet(k){
    var p=P(); if(!p) return;
    var L=KPo.PLACES[k], cur=KPo.place(p,k), n=KPo.PLAT[k].n;
    var opts=L.map(function(x){
      var trial=JSON.parse(JSON.stringify(p)); KPo.setPlace(trial,k,x[0]);
      var c=KPo.check(trial,k,'on'), why=c.ok?'':c.problems[0];
      return '<button class="ks-opt'+(cur===x[0]?' on':'')+(why?' no':'')+'" data-s="pl:'+x[0]+'"><b>'+esc(x[1])+(cur===x[0]?'<i>Chosen</i>':'')+'</b><span>'+esc(why||x[2])+'</span></button>';
    }).join('');
    sheet(sheetHead(k,'Where on '+n+'?','Pick where this one goes. Kova shapes it for that spot.')
      +'<div class="ks-opts">'+opts+'</div><div class="ks-row2"><button class="ks-pill" data-s="close">Done</button></div>',
      function(a){
        if(a.indexOf('pl:')!==0) return;
        var v=a.slice(3); KPo.setPlace(p,k,v);
        if((v==='reel'||v==='story'||v==='short')&&p.format!=='video'&&KPo.included(p).length===1) p.format=KPo.naturalFormat(p);
        KPo.save(p); closeSheet(); render();
        var c=KPo.check(p,k,KPo.linkState(k));
        toast(n+': '+KPo.placeName(p,k)+(c.ok?'.':' - '+c.problems[0]));
      });
  }

  /* ---------------- business or personal ----------------
     Asked once for Facebook, Instagram and LinkedIn, where the answer
     changes what any app is allowed to do. */
  function acctSheet(k){
    var A=KPo.ACCT[k], n=KPo.PLAT[k].n, cur=KPo.acct(k);
    var opt=function(v){ return '<button class="ks-opt'+(cur===v?' on':'')+'" data-s="'+v+'"><b>'+esc(A[v][0])+(v===A.api?'<i>Kova posts it</i>':'<i>You tap Post</i>')+'</b><span>'+esc(A[v][1])+'</span></button>'; };
    var order=A.api==='business'?['business','personal']:['personal','business'];
    sheet(sheetHead(k,'Which '+n+' do you post from?','Pick one. You can change it any time from the Publish card.')
      +'<div class="ks-opts">'+opt(order[0])+opt(order[1])+'</div>'
      +(k==='facebook'?'<p class="ks-fine">Running ads? Pick Business Page, then tick <b>Meta Ads</b> too - Kova builds the campaign in Ads Manager, switched off.</p>':'')
      +'<div class="ks-row2"><button class="ks-pill" data-s="close">Cancel</button></div>',
      function(v){
        if(v!=='business'&&v!=='personal') return;
        KPo.setAcct(k,v); closeSheet();
        if(v===A.api){ KPo.setHand(k,false); if(KPo.linkState(k)==='on') linkedNow(k); else connect(k,true); return; }
        linkedNow(k);
        if(k==='instagram') return switchTip();
        toast(n+': Kova gets it ready, you tap Post.');
      });
  }
  function switchTip(){
    sheet(sheetHead('instagram','Want Kova to post it for you?','Switching to a Professional account is free, takes a minute, and keeps your followers and posts.')
      +'<ol class="ks-steps"><li>Open Instagram → your profile → the ☰ menu.</li><li>Tap <b>Account type and tools</b>.</li><li>Tap <b>Switch to professional account</b> → pick <b>Creator</b> or <b>Business</b>.</li><li>Back here, tap Instagram → <b>Professional account</b>.</li></ol>'
      +'<button class="ks-pill white ks-big" data-s="close">Got it - I post it for now</button>');
  }
  function byHandNow(k){ closeSheet(); KPo.setHand(k,true); linkedNow(k); toast(KPo.PLAT[k].n+': Kova gets it ready, you tap Post.'); }
  function handMenu(k,el){
    pickMenu(el,[['hand','I post it myself'],['connect','Connect so Kova posts it']],'hand',function(v){
      if(v==='connect'){ KPo.setHand(k,false); render(); connect(k); }
    });
  }

  /* ---------------- your turn: posting by hand ----------------
     The words are copied, the files are saved (or shared straight into
     the app on a phone), and the app opens. "Posted" ticks it off. */
  function pendingHand(p){ return (p.targets||[]).filter(function(k){ var r=(p.results||{})[k]; return r&&r.state==='manual'; }); }
  function handFiles(p){
    var list=KPo.postMedia(p);
    return Promise.all(list.map(function(m,i){
      return KB.get(m.blob).then(function(b){
        if(!b) return null;
        var job=m.kind==='image'?KPo.prepareImage(b,p.aspect,(i===0&&p.coverText)?String(p.heading||'').trim():'',false):Promise.resolve(b);
        return job.then(function(x){
          var ext=m.kind==='image'?'jpg':(((m.mime||'').indexOf('quicktime')>=0)?'mov':'mp4');
          var base=String(p.title||'kova').replace(/[^\w\- ]+/g,'').trim().slice(0,40)||'kova';
          try{ return new File([x],base+(list.length>1?'-'+(i+1):'')+'.'+ext,{type:x.type||m.mime}); }catch(e){ x.name=base+'.'+ext; return x; }
        });
      }).catch(function(){ return null; });
    })).then(function(a){ return a.filter(Boolean); });
  }
  function phoneShare(){ return !!(navigator.canShare&&navigator.share&&window.matchMedia&&matchMedia('(pointer:coarse)').matches); }
  function wordsFor(p,k){ var t=KPo.compose(p,k); return k==='youtube'?(t.title+'\n\n'+t.description):(t.text||''); }
  function handoff(){
    var p=P(); if(!p) return;
    var ks=pendingHand(p); if(!ks.length) return;
    var canShare=phoneShare();
    var rows=ks.map(function(k){
      return '<div class="ks-hand" data-k="'+k+'"><div class="hh">'+ic(BRAND[k],'bi')+'<b>'+KPo.PLAT[k].n+'</b>'
        +(KPo.ACCT[k]&&KPo.acct(k)?'<span>'+esc(KPo.ACCT[k][KPo.acct(k)][0])+'</span>':'')+'</div>'
        +'<div class="hb"><button class="ks-pill small white" data-s="go:'+k+'">'+(canShare?'Share to '+KPo.PLAT[k].n:'Copy, save & open')+'</button>'
        +'<button class="ks-pill small" data-s="done:'+k+'">'+ic('check')+'Posted</button></div></div>';
    }).join('');
    sheet(sheetHead(ks[0],'Your turn - '+ks.length+' to post','These accounts don’t let apps post for them. One tap copies the words and '+(canShare?'shares the file into the app':'saves the file, then opens the site')+'. Paste, post, tick it off.')
      +rows+'<div class="ks-row2"><button class="ks-pill" data-s="close">Later</button></div>',
      function(a){
        var parts=a.split(':'), k=parts[1]; if(!k) return;
        if(parts[0]==='done'){ KPo.markPosted(p,k); toast(KPo.PLAT[k].n+' ticked off.'); closeSheet(); render(); if(pendingHand(p).length) setTimeout(handoff,200); return; }
        if(parts[0]==='go') handGo(p,k);
      });
  }
  function handGo(p,k){
    var txt=wordsFor(p,k);
    var copied=navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(txt).catch(function(){}):Promise.resolve();
    /* open the tab inside the tap, before any waiting, or it is blocked */
    var win=null;
    var share=phoneShare();
    if(!share&&KPo.HAND[k]) win=window.open('about:blank','_blank');
    handFiles(p).then(function(files){
      if(share&&files.length&&navigator.canShare({files:files})){
        return navigator.share({files:files,text:txt}).then(function(){ toast('Shared. Paste the words if the app did not keep them.'); },function(){});
      }
      files.forEach(function(f){
        var u=URL.createObjectURL(f), a=document.createElement('a');
        a.href=u; a.download=f.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(u); },60e3);
      });
      if(win) win.location.href=KPo.HAND[k]; else if(KPo.HAND[k]) window.open(KPo.HAND[k],'_blank','noopener');
      copied.then(function(){ toast('Words copied'+(files.length?', file'+(files.length>1?'s':'')+' saved':'')+'. Paste them into '+KPo.PLAT[k].n+'.'); });
    });
  }

  /* ---------------- Ad setup (Meta Ads) ----------------
     What Kova builds in Ads Manager: campaign goal, daily budget, ad sets,
     countries, button, pixel event - plus which ad account, Page and pixel.
     Everything is created switched off. */
  function adSheet(){
    var p=P(); if(!p) return;
    var o=KPo.adOpts(p), linked=KPo.linkState('metaads')==='on', t=KPo.compose(p,'metaads');
    var chip=function(name,val,label){ return '<button class="ks-chipb'+(o[name]===val?' on':'')+'" data-s="set:'+name+':'+val+'">'+esc(label)+'</button>'; };
    var sel=function(f,list,cur){ return '<select class="ks-in" data-f="'+f+'">'+list.map(function(x){ return '<option value="'+x[0]+'"'+(x[0]===cur?' selected':'')+'>'+esc(x[1])+'</option>'; }).join('')+'</select>'; };
    var n=KPo.postMedia(p).length;
    var html=sheetHead('metaads','Ad setup','Kova builds it in Ads Manager, <b>switched off</b>. Nothing spends until you switch it on there.')
      +'<div class="ks-opts two">'
        +'<button class="ks-opt'+(o.build==='ads'?' on':'')+'" data-s="set:build:ads"><b>Build the ads</b><span>Campaign → ad set with your budget → one ad per photo or clip, words filled in.</span></button>'
        +'<button class="ks-opt'+(o.build!=='ads'?' on':'')+'" data-s="set:build:library"><b>Just add the files</b><span>They wait in your ad account’s media library.</span></button></div>';
    if(o.build==='ads'){
      html+='<label class="ks-lab">Goal</label><div class="ks-chips">'+chip('goal','sales','Sales')+chip('goal','traffic','Traffic')+chip('goal','awareness','Awareness')+'</div>'
        +'<div class="ks-2col"><div><label class="ks-lab">Daily budget <span id="ksCur">'+esc(S.adCur||'USD')+'</span></label><input class="ks-in" data-f="budget" type="number" min="1" step="1" inputmode="decimal" value="'+esc(o.budget)+'"></div>'
        +'<div><label class="ks-lab">Countries</label><input class="ks-in" data-f="countries" type="text" value="'+esc(o.countries.join(', '))+'" placeholder="US, CA" autocapitalize="characters"></div></div>'
        +(n>1?'<label class="ks-lab">Ad sets</label><div class="ks-chips">'+chip('split','one','One for all '+n)+chip('split','each','One per file ('+n+')')+'</div>':'')
        +'<label class="ks-lab">Shop link</label><input class="ks-in" data-f="link" type="url" value="'+esc(p.link||'')+'" placeholder="https://yourshop.com/product">'
        +'<div class="ks-2col"><div><label class="ks-lab">Button</label>'+sel('cta',KPo.AD_CTA,o.cta)+'</div>'
        +(o.goal==='sales'?'<div><label class="ks-lab">Counts as a sale</label>'+sel('event',KPo.AD_EVENT,o.event)+'</div>':'<div></div>')+'</div>'
        +'<div class="ks-words"><div><i>Primary text</i>'+esc(cutTo(t.primary,110)||'— write it in Words')+'</div>'
        +'<div><i>Headline</i>'+esc(t.headline||'— your heading')+'</div>'
        +(t.description?'<div><i>Description</i>'+esc(t.description)+'</div>':'')
        +'<div><i>Shape</i>'+esc(shapes(p)||'as each file is')+'</div></div>';
    }
    html+='<div id="ksAdAcct" class="ks-adacct">'+(linked?'<div class="ks-fine">Loading your ad account…</div>'
        :'<div class="ks-fine">Connect Meta Ads to pick the ad account, the Page the ads run as, and your pixel.</div><button class="ks-pill" data-s="connect">Connect Meta Ads</button>')+'</div>'
      +'<button class="ks-pill white ks-big" data-s="save">Save</button><div class="ks-row2"><button class="ks-pill" data-s="close">Cancel</button></div>';
    var v=sheet(html,function(a,v2){
      var parts=a.split(':');
      if(parts[0]==='set'){ read(v2); var oo=KPo.adOpts(p); oo[parts[1]]=parts[2]; p.opts.metaads=oo; KPo.save(p); adSheet(); return; }
      if(a==='save'){ read(v2); closeSheet(); render(); toast(o.build==='ads'?'Ad setup saved.':'Files only - no campaign is built.'); return; }
      if(a==='connect'){ read(v2); closeSheet(); connect('metaads'); }
    });
    v.addEventListener('change',function(e){
      var f=e.target.getAttribute('data-f'); if(!f) return;
      if(f==='acct'||f==='page'||f==='pixel'){
        var body={}; body[f==='acct'?'account':f]=e.target.value;
        toast('Saving…');
        KPo.adSetup(body).then(function(j){ paintAdAcct(j); toast('Saved.'); if(window.KovaLink&&KovaLink.status) KovaLink.status(); }).catch(function(err){ toast(err.message); });
      }
    });
    function read(el){
      var oo=KPo.adOpts(p);
      $$('[data-f]',el).forEach(function(i){
        var f=i.getAttribute('data-f'), val=i.value;
        if(f==='budget') oo.budget=Math.max(0,Math.round((+val||0)*100)/100);
        else if(f==='countries') oo.countries=String(val).toUpperCase().split(/[^A-Z]+/).filter(function(c,i2,arr){ return c.length===2&&arr.indexOf(c)===i2; }).slice(0,25);
        else if(f==='link') p.link=/^https?:\/\/\S+\.\S+/.test(val.trim())?val.trim():'';
        else if(f==='cta'||f==='event') oo[f]=val;
      });
      if(!oo.countries.length) oo.countries=['US'];
      p.opts.metaads=oo; KPo.save(p);
    }
    if(linked) KPo.adSetup().then(paintAdAcct).catch(function(e){
      var box=$('#ksAdAcct'); if(box) box.innerHTML='<div class="ks-fine">'+esc(e.message)+'</div>';
    });
  }
  function paintAdAcct(j){
    var box=$('#ksAdAcct'); if(!box||!j) return;
    S.adCur=j.currency||'USD'; var cur=$('#ksCur'); if(cur) cur.textContent=S.adCur+(j.minBudget?' · at least '+j.minBudget:'');
    var sel=function(f,list,val,empty){
      return '<select class="ks-in" data-f="'+f+'">'+(empty?'<option value="">'+esc(empty)+'</option>':'')
        +list.map(function(x){ return '<option value="'+esc(x.id)+'"'+(x.id===val?' selected':'')+'>'+esc(x.name)+'</option>'; }).join('')+'</select>';
    };
    box.innerHTML='<div class="ks-2col"><div><label class="ks-lab">Ad account</label>'+sel('acct',j.accounts||[],j.account)+'</div>'
      +'<div><label class="ks-lab">Runs as Page</label>'+((j.pages||[]).length?sel('page',j.pages,j.page):'<div class="ks-fine bad">No Page yet - ads need one.</div>')+'</div></div>'
      +'<label class="ks-lab">Pixel (for Sales)</label>'+((j.pixels||[]).length?sel('pixel',j.pixels,j.pixel,'No pixel'):'<div class="ks-fine">No pixel on this account. Sales needs one - Events Manager → Connect data.</div>')
      +'<div class="ks-fine">Instagram: '+(j.instagram?'@'+esc(j.instagram.username||j.instagram.id):'shows with your Page’s name')+'</div>';
  }
  function cutTo(s,n){ var a=Array.from(String(s||'')); return a.length>n?a.slice(0,n).join('')+'…':a.join(''); }
  function shapes(p){
    var seen={}; KPo.postMedia(p).forEach(function(m){ var r=m.kind==='image'&&p.aspect!=='orig'?p.aspect:KPo.shapeOf(m); if(r) seen[r]=1; });
    return Object.keys(seen).join(', ');
  }

  /* ---------------- the Studio tour (runs on KovaTour) ---------------- */
  var TOUR=[
    {n:'media',   t:'Media',         d:'Add photos or clips. Two or more make a slider.'},
    {n:'text',    t:'Words',         d:'Write it once. Kova fits it to every app.'},
    {n:'cover',   t:'Cover & shape', d:'Pick the shape. Photos are cropped to fit.'},
    {n:'format',  t:'Settings',      d:'Choose the format, and post now or later.'},
    {n:'publish', t:'Publish',       d:'Tick the accounts it goes to.'},
    {n:'preview', t:'Preview',       d:'See it exactly as each app will show it.'},
    {sel:'#ksDock', t:'Type or talk', d:'Pick a tab, then type, dictate, or tap the bubble to have it written.'}
  ].map(function(st){
    st.el=function(){ return st.sel?$(st.sel):$('.ks-node[data-n="'+st.n+'"]',world); };
    st.move=function(){
      var el=st.el(); if(!el||st.sel) return 0;
      if(S.desk){
        world.classList.add('ks-glide');
        var vw=view.clientWidth, vh=view.clientHeight-150;
        var k=Math.min(1,Math.max(.6,(vh-40)/el.offsetHeight));
        S.view={k:k,x:vw/2-(el.offsetLeft+el.offsetWidth/2)*k,y:Math.max(20,(vh-el.offsetHeight*k)/2)-el.offsetTop*k};
        applyView(); return 720;
      }
      var m=document.getElementById('main');
      if(m){ var y=Math.max(0,el.getBoundingClientRect().top+m.scrollTop-90); if(m.scrollTo) m.scrollTo({top:y,behavior:'smooth'}); else m.scrollTop=y; }
      return 620;
    };
    return st;
  });
  function tour(){
    closeMenu(); closeSheet();
    if(S.panel){ S.panel=false; lsSet('ks.panel',false); root.classList.remove('panel-open'); }
    S.touring=true;
    KovaTour.run(TOUR,{done:endTour});
  }
  function endTour(){ S.touring=false; lsSet('ks.tour',true); KovaTour.mark('studio'); if(world) world.classList.remove('ks-glide'); }

  function step(d,auto){
    var inc=KPo.postMedia(P()); if(inc.length<2) return;
    S.slide=(S.slide+d+inc.length)%inc.length;
    softPaint();
    if(auto) setTimeout(function(){ var v=$('#ksVid'); if(v) v.play().catch(function(){}); },300);
  }
  function setPlayIcon(on){ var b=$('[data-a="play"]',world); if(b) b.innerHTML=ic(on?'pause':'play'); }
  var slideT=null;
  /* A tap is what lets a browser play sound, so every play starts from one.
     If the page is inside a frame that still blocks sound, the clip plays
     muted with a "Tap for sound" button - unmuting a playing clip from a
     tap works everywhere. */
  function soundUi(){
    var b=$('#ksSnd'); if(b){ b.innerHTML=ic(S.muted?'mute':'vol'); b.setAttribute('aria-label',S.muted?'Sound off':'Sound on'); }
    var t=$('.ks-sndtag.on'); if(t&&!S.soundBlocked) t.remove();
  }
  function play(){
    var v=$('#ksVid');
    if(v){
      if(!v.paused){ v.pause(); setPlayIcon(false); return; }
      v.muted=S.muted; v.volume=1;
      var go=v.play();
      if(!go||!go.then){ setPlayIcon(true); return; }
      go.then(function(){ setPlayIcon(true); if(!S.muted&&S.soundBlocked){ S.soundBlocked=false; soundUi(); } }).catch(function(){
        v.muted=true;
        v.play().then(function(){ setPlayIcon(true); S.soundBlocked=true; softPaint(); }).catch(function(){ toast('This clip will not play here. Try Chrome or Safari.'); });
      });
      return;
    }
    if(KPo.postMedia(P()).length>1){
      if(slideT){ clearInterval(slideT); slideT=null; setPlayIcon(false); return; }
      slideT=setInterval(function(){ step(1); },2200); setPlayIcon(true);
    }
  }
  function unmute(){
    var v=$('#ksVid'); S.muted=false; S.soundBlocked=false;
    if(v){ v.muted=false; v.volume=1; if(v.paused) v.play().then(function(){ setPlayIcon(true); }).catch(function(){}); }
    soundUi(); var t=$('.ks-sndtag.on'); if(t) t.remove();
  }
  function toggleSound(){
    var v=$('#ksVid');
    if(S.soundBlocked||S.muted){ unmute(); toast('Sound on.'); return; }
    S.muted=true; if(v) v.muted=true; soundUi(); toast('Sound off.');
  }
  function stepParam(key,d){
    var p=P(); if(!p||locked()) return;
    var cyc=function(list,cur){ var i=list.indexOf(cur); return list[(i+d+list.length)%list.length]; };
    if(key==='format') p.format=cyc(KPo.FORMATS,p.format);
    else if(key==='aspect') p.aspect=cyc(KPo.ASPECTS,p.aspect);
    else if(key==='when'){ p.mode=cyc(['now','schedule','draft'],p.mode||'now'); if(p.mode==='schedule'&&!(p.when>Date.now())) p.when=nextSlot(); }
    else if(key==='time'){ p.when=Math.max(Date.now()+5*60e3,(p.when||nextSlot())+d*3600e3); }
    else if(key==='ytPrivacy'){ p.opts.youtube=p.opts.youtube||{}; p.opts.youtube.privacy=cyc(['public','unlisted','private'],p.opts.youtube.privacy||'public'); }
    else if(key==='ttMode'){ p.opts.tiktok=p.opts.tiktok||{}; p.opts.tiktok.mode=cyc(['direct','draft'],p.opts.tiktok.mode||'direct'); }
    else if(key==='coverText'){ p.coverText=!p.coverText; }
    else if(key==='name') return rename();
    else if(key==='link'||key==='subreddit') return askParam(key);
    else if(key==='adsetup') return adSheet();
    KPo.save(p); render();
  }
  /* Typing into a box: an in-page sheet, not the browser's prompt(),
     which embedded viewers and some browsers block outright. */
  function ask(o,cb){
    var html='<h3>'+esc(o.title)+'</h3>'+(o.text?'<p>'+esc(o.text)+'</p>':'')
      +(o.multi?'<textarea class="ks-in ks-ta2" data-f="v" rows="6" placeholder="'+esc(o.ph||'')+'">'+esc(o.value||'')+'</textarea>'
               :'<input class="ks-in" data-f="v" type="'+(o.type||'text')+'" value="'+esc(o.value||'')+'" placeholder="'+esc(o.ph||'')+'" autocomplete="off" spellcheck="false">')
      +'<button class="ks-pill white ks-big" data-s="ok">'+esc(o.ok||'Save')+'</button><div class="ks-row2"><button class="ks-pill" data-s="close">Cancel</button></div>';
    var v=sheet(html,function(a,el){ if(a!=='ok') return; var f=el.querySelector('[data-f="v"]'); var val=f?f.value:''; closeSheet(); cb(val); });
    var f=v.querySelector('[data-f="v"]');
    if(f&&!o.multi) f.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); var val=f.value; closeSheet(); cb(val); } });
    return v;
  }
  function sure(o,cb){
    sheet('<h3>'+esc(o.title)+'</h3><p>'+esc(o.text||'')+'</p><button class="ks-pill white ks-big'+(o.red?' red':'')+'" data-s="yes">'+esc(o.ok||'Yes')+'</button>'
      +'<div class="ks-row2"><button class="ks-pill" data-s="close">Cancel</button></div>',function(a){ if(a==='yes'){ closeSheet(); cb(); } });
  }
  function askParam(key){
    var p=P();
    ask(key==='link'?{title:'Shop link',text:'Where the Pin and the ad button send people.',value:p.link||'',ph:'https://yourshop.com/product',type:'url'}
                    :{title:'Subreddit',text:'Leave it empty to post on your own profile.',value:p.subreddit||'',ph:'r/yoursubreddit'},function(v){
      v=String(v).trim();
      if(key==='link') p.link=/^https?:\/\/\S+\.\S+/.test(v)?v:'';
      else p.subreddit=v.replace(/^\/?r\//,'').replace(/[^A-Za-z0-9_]/g,'').slice(0,40);
      KPo.save(p); render();
    });
  }
  function nextSlot(){ var d=new Date(Date.now()+3600e3); d.setMinutes(0,0,0); if(d.getHours()<9) d.setHours(9); return d.getTime(); }
  function pickParam(key,el){
    var p=P(); if(!p||locked()) return;
    if(key==='format') return pickMenu(el,KPo.FORMATS.map(function(f){ return [f,KPo.FORMAT_N[f]]; }),p.format,function(v){ p.format=v; KPo.save(p); render(); });
    if(key==='aspect') return pickMenu(el,KPo.ASPECTS.map(function(a){ return [a,KPo.ASPECT_N[a]]; }),p.aspect,function(v){ p.aspect=v; KPo.save(p); render(); });
    if(key==='when') return pickMenu(el,[['now','Post now'],['schedule','Schedule'],['draft','Send as drafts']],p.mode||'now',function(v){ p.mode=v; if(v==='schedule'&&!(p.when>Date.now())) p.when=nextSlot(); KPo.save(p); render(); if(v==='schedule') pickTime(); });
    if(key==='time') return pickTime();
    if(key==='name') return rename();
    if(key==='link'||key==='subreddit') return askParam(key);
    if(key==='adsetup') return adSheet();
    stepParam(key,1);
  }
  function pickTime(){
    var p=P(), inp=$('#ksWhen'); if(!inp) return;
    var d=new Date(p.when||nextSlot()), pad=function(n){ return (n<10?'0':'')+n; };
    inp.value=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
    inp.min=new Date(Date.now()+60e3-new Date().getTimezoneOffset()*60e3).toISOString().slice(0,16);
    inp.onchange=function(){ var t=new Date(inp.value).getTime(); if(t) { p.when=t; p.mode='schedule'; KPo.save(p); render(); } };
    try{ if(inp.showPicker) inp.showPicker(); else inp.click(); }catch(e){ inp.focus(); inp.click(); }
  }
  function rename(){
    var p=P(); if(!p) return;
    ask({title:'Name this post',text:'Only you see this name.',value:p.title||''},function(v){
      p.title=String(v).trim().slice(0,80)||'Untitled post'; KPo.save(p); render();
    });
  }
  function editFor(k){
    var p=P(); if(!p||locked()) return;
    var cur=KPo.compose(p,k), val=k==='youtube'?cur.description:(cur.caption!=null?cur.caption:cur.text);
    ask({title:'Words for '+KPo.PLAT[k].n,text:'Only '+KPo.PLAT[k].n+' gets these. Clear it to go back to automatic.',value:val||'',multi:true},function(v){
      p.over=p.over||{};
      if(!String(v).trim()){ delete p.over[k]; }
      else if(k==='youtube'){ p.over[k]={description:v}; }
      else p.over[k]={text:v};
      KPo.save(p); render();
    });
  }

  function publish(mode){
    var p=P(); if(!p||locked()) return;
    if(mode==null) mode=p.mode||'now';
    if(mode==='schedule'&&!(p.when>Date.now()+60e3)){ p.mode='schedule'; p.when=nextSlot(); KPo.save(p); render(); pickTime(); return; }
    var t0=Date.now();
    S.prog=0; softPaint();
    KPo.publish(p,mode,function(f){ S.prog=f; var b=$('.ks-prog i'); if(b) b.style.width=Math.round(f*100)+'%'; else softPaint(); })
      .then(function(){
        S.prog=-1; S.lastRun=Date.now()-t0;
        var srvN=(p.targets||[]).filter(function(k){ return KPo.linkState(k)!=='manual'; }).length;
        if(srvN) toast(mode==='schedule'?'Scheduled for '+when(p.when)+'.':(mode==='draft'?'Sending drafts…':'Publishing…'));
        render(); if(p.status==='publishing') poll();
        if(pendingHand(p).length) setTimeout(handoff,mode==='schedule'?900:500);
      })
      .catch(function(e){
        S.prog=-1; render();
        if(pendingHand(p).length) setTimeout(handoff,700);
        if(e&&e.signin) return signinPrompt(e.message);
        toast((e&&e.message)||'Could not publish.');
      });
  }
  function poll(){
    clearTimeout(S.pollT);
    var p=P(); if(!p) return;
    var t0=Date.now();
    (function tick(){
      KPo.refresh(p).then(function(){
        if(P()===p){ softPaint(); paintPanel(); }
        if(p.status==='publishing'&&Date.now()-t0<15*60e3) S.pollT=setTimeout(tick,3000);
        else if(p.status!=='publishing'){
          S.lastRun=Date.now()-t0;
          var n=(p.targets||[]).filter(function(k){ var r=(p.results||{})[k]; return r&&(r.state==='ok'||r.state==='draft'); }).length;
          toast(p.status==='sent'?'Posted to '+n+' account'+(n===1?'':'s')+'.':(p.status==='drafted'?'Drafts sent.':(p.status==='partial'?'Posted to '+n+' of '+p.targets.length+'. Open Results for the rest.':'Publishing failed. Open Results to see why.')));
        }
      }).catch(function(){ S.pollT=setTimeout(tick,6000); });
    })();
  }
  function del(){
    var p=P(); if(!p) return;
    sure({title:'Delete this post?',text:'“'+(p.title||'Untitled post')+'” goes from Kova. Anything already posted stays on the platforms.',ok:'Delete',red:true},function(){
      KPo.remove(p); toast('Deleted.'); S.post=null; openPost(null);
    });
  }
  function shareIt(){
    var p=P(), k=currentPlat(), r=(p.results||{})[k];
    if(r&&r.url){ window.open(r.url,'_blank','noopener'); return; }
    var t=KPo.compose(p,k), txt=k==='youtube'?(t.title+'\n\n'+t.description):(t.text||'');
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function(){ toast(KPo.PLAT[k].n+' text copied.'); },function(){ toast('Could not copy.'); });
  }

  function act(a,el,ev){
    var p=P(), id=el.getAttribute('data-id'), k=el.getAttribute('data-k');
    switch(a){
      case 'home': go('work'); break;
      case 'back': if(typeof window.goBack==='function') goBack(); else go('work'); break;
      case 'board': closeMenu(); go('worktoday'); break;
      case 'inbox': closeMenu(); go('workinbound'); break;
      case 'rename': rename(); break;
      case 'queue': queueMenu(el); break;
      case 'menu': mainMenu(el); break;
      case 'log': logMenu($('[data-a="menu"]',root)||el); break;
      case 'panel': S.panel=!S.panel; lsSet('ks.panel',S.panel); root.classList.toggle('panel-open',S.panel); paintTop(); break;
      case 'dupe': { var c=KPo.duplicate(p); KPo.save(c); S.post=c; render(); toast('New version made. The original stays as it was.'); } break;
      case 'new': closeMenu(); newPost(); toast('New post.'); break;
      case 'open': closeMenu(); S.panel=false; openPost(id); break;
      case 'unsched': { var sp=KPo.find(id); if(sp) KPo.cancel(sp).then(function(){ toast('Unscheduled. It is a draft again.'); render(); }).catch(function(e){ toast(e.message); }); closeMenu(); } break;
      case 'sync': closeMenu(); KPo.syncAll().then(function(){ render(); toast('Up to date.'); }).catch(function(e){ toast(e.message); }); break;
      case 'brief': closeMenu(); go('workcompose'); break;
      case 'traction': closeMenu(); if(window.KovaTraction) KovaTraction.open(p&&p.status==='sent'?p.id:null); break;
      case 'bizcard': closeMenu(); if(window.KovaTraction) KovaTraction.card(); break;
      case 'server': closeMenu(); if(window.KovaRelay) KovaRelay.sheet(); break;
      case 'delete': closeMenu(); del(); break;
      case 'fold': break;
      case 'add': if(!locked()){ $('#ksFile').dataset.at=''; $('#ksFile').click(); } break;
      case 'insert': if(!locked()){ $('#ksFile').dataset.at=el.getAttribute('data-i'); $('#ksFile').click(); } break;
      case 'incl': { var m=(p.media||[]).filter(function(x){ return x.id===id; })[0]; if(m&&!locked()){ m.on=m.on===false; KPo.save(p); render(); } } break;
      case 'libadd': {
        var src=KPo.find(el.getAttribute('data-from')), mm=src&&(src.media||[]).filter(function(x){ return x.id===id; })[0];
        if(!mm||locked()) break;
        var ex=(p.media||[]).filter(function(x){ return x.blob===mm.blob; })[0];
        if(ex) p.media.splice(p.media.indexOf(ex),1);
        else { var cp=JSON.parse(JSON.stringify(mm)); cp.id=KPo.uid('m'); cp.on=true; delete cp.path; delete cp.url; delete cp.prep; p.media.push(cp); }
        p.format=KPo.naturalFormat(p); KPo.save(p); render();
      } break;
      case 'rm': { if(locked()) break; p.media=(p.media||[]).filter(function(x){ return x.id!==id; }); p.format=KPo.naturalFormat(p); S.slide=0; KPo.save(p); render(); } break;
      case 'mv': {
        if(locked()) break;
        var d=+el.getAttribute('data-d'), i=p.media.findIndex(function(x){ return x.id===id; }), j=i+d;
        if(i<0||j<0||j>=p.media.length) break;
        var tmp=p.media[i]; p.media[i]=p.media[j]; p.media[j]=tmp; S.slide=j; KPo.save(p); render();
      } break;
      case 'slide': { var inc=KPo.postMedia(p), ix=inc.findIndex(function(x){ return x.id===id; }); if(ix>=0){ S.slide=ix; softPaint(); } } break;
      case 'card': toggleTarget(k); break;
      case 'choose': ev.stopPropagation(); choose(k,el); break;
      case 'tour': closeMenu(); tour(); break;
      case 'target': ev.stopPropagation(); toggleTarget(k); break;
      case 'chan': if(KPo.linkState(k)!=='on'&&KPo.linkState(k)!=='manual') connect(k); else { S.plat=k; if(p.targets.indexOf(k)<0) toggleTarget(k); else softPaint(); } break;
      case 'accounts': S.open.post=false; S.panel=true; lsSet('ks.panel',true); root.classList.add('panel-open'); paintTop(); paintPanel(); setTimeout(function(){ var ac=$('#kfMini')||$('.ks-grp'); if(ac&&ac.scrollIntoView) ac.scrollIntoView({behavior:'smooth',block:'center'}); var m=$('.kfm'); if(m) try{ m.focus({preventScroll:true}); }catch(e){} },S.desk?0:340); break;
      case 'writer': S.writerOff=!S.writerOff; lsSet('ks.writerOff',S.writerOff); paintPanel(); paintDock(); break;
      case 'pmenu': pickMenu(el,[['all','Show everything'],['open','Open every folder'],['close','Close every folder']],'',function(v){
          if(v==='all'){ S.q=''; } else { Object.keys(S.open).forEach(function(f){ S.open[f]=v==='open'; }); } paintPanel(); }); break;
      case 'field': setField(el.getAttribute('data-f'),true); break;
      case 'write': write(); break;
      case 'usesugg': useSugg(); break;
      case 'dropsugg': S.sugg=''; paintDock(); break;
      case 'mic': mic(); break;
      case 'plat': S.plat=k; S.slide=Math.min(S.slide,Math.max(0,KPo.postMedia(p).length-1)); softPaint(); break;
      case 'nextplat': { var list=targets().length?targets():KPo.ORDER; S.plat=list[(list.indexOf(currentPlat())+1)%list.length]; softPaint(); } break;
      case 'edit': editFor(currentPlat()); break;
      case 'share': shareIt(); break;
      case 'fav': p.fav=!p.fav; KPo.save(p); softPaint(); break;
      case 'prev': step(-1); break;
      case 'next': step(1); break;
      case 'play': play(); break;
      case 'sound': toggleSound(); break;
      case 'unmute': unmute(); break;
      case 'acct': ev.stopPropagation(); if(KPo.ACCT[k]) acctSheet(k); else handMenu(k,el); break;
      case 'hand': ev.preventDefault(); ev.stopPropagation(); handoff(); break;
      case 'adsetup': adSheet(); break;
      case 'place': ev.stopPropagation(); placeSheet(k); break;
      case 'tags': tagSheet(); break;
      case 'publish': publish(p.mode||'now'); break;
      case 'schedule': publish('schedule'); break;
      case 'pdraft': publish('draft'); break;
      case 'savepost': KPo.save(p); toast('Saved in Kova.'); paintTop(); break;
      case 'aspect': pickParam('aspect',el); break;
      case 'zin': zoom(1.15); drawWires(); break;
      case 'zout': zoom(1/1.15); drawWires(); break;
      case 'fit': fit(); break;
      case 'look': look(); break;
      case 'v-connect': lsSet('ks.started',true); paintVeil(); S.panel=true; lsSet('ks.panel',true); render(); setTimeout(function(){ var ac2=$('.ks-acc'); if(ac2) ac2.scrollIntoView({behavior:'smooth',block:'center'}); },350); break;
      case 'v-drafts': lsSet('ks.started',true); paintVeil(); setTimeout(tour,300); break;
      case 'v-start': lsSet('ks.started',true); paintVeil(); $('#ksFile').dataset.at=''; $('#ksFile').click(); break;
    }
  }

  /* =============================== events ============================ */
  function wireEvents(){
    root.addEventListener('click',function(e){
      if(S.menu&&!S.menu.contains(e.target)) closeMenu();
      var st=e.target.closest('[data-step]');
      if(st&&root.contains(st)){ var pr=st.closest('[data-param]'); stepParam(pr.getAttribute('data-param'),+st.getAttribute('data-step')); return; }
      var pk=e.target.closest('[data-pick]');
      if(pk&&root.contains(pk)){ pickParam(pk.getAttribute('data-pick'),pk); return; }
      var f=e.target.closest('[data-fold]');
      if(f){ var key=f.getAttribute('data-fold'); S.open[key]=!S.open[key]; paintPanel(); return; }
      var a=e.target.closest('[data-a]');
      if(a&&root.contains(a)){ if(a.tagName==='A') return; act(a.getAttribute('data-a'),a,e); return; }
      if(e.target.id==='ksScrim'){ S.panel=false; lsSet('ks.panel',false); root.classList.remove('panel-open'); paintTop(); }
    });
    document.addEventListener('click',function(e){
      if(!S.menu) return;
      if(S.menu.contains(e.target)){
        var a=e.target.closest('[data-a]');
        if(a&&S.menu.classList.contains('ks-drop-menu')){ if(a.tagName==='A') return; act(a.getAttribute('data-a'),a,e); }
        return;
      }
      if(!root.contains(e.target)) closeMenu();
    },true);
    var fi=$('#ksFile');
    fi.onchange=function(){ var at=fi.dataset.at; addFiles(fi.files,at===''||at==null?null:+at); fi.value=''; };
    /* drag and drop anywhere on the Studio */
    root.addEventListener('dragover',function(e){ if(e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],'Files')>=0){ e.preventDefault(); var d=$('#ksDrop'); if(d) d.classList.add('over'); } });
    root.addEventListener('dragleave',function(e){ if(!root.contains(e.relatedTarget)){ var d=$('#ksDrop'); if(d) d.classList.remove('over'); } });
    root.addEventListener('drop',function(e){ if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){ e.preventDefault(); addFiles(e.dataTransfer.files); } });
    /* pan, zoom, node drag (desktop) */
    var drag=null;
    view.addEventListener('pointerdown',function(e){
      if(!S.desk||e.button!==0) return;
      var h=e.target.closest('[data-drag]');
      if(h){
        var node=h.closest('.ks-node'), n=node.getAttribute('data-n');
        drag={mode:'node',n:n,el:node,sx:e.clientX,sy:e.clientY,ox:node.offsetLeft,oy:node.offsetTop};
      }else if(!e.target.closest('.ks-node,.ks-plus,button,input,textarea,a')){
        if(!S.view) fit(false);
        drag={mode:'pan',sx:e.clientX,sy:e.clientY,ox:S.view.x,oy:S.view.y}; view.classList.add('pan');
      }
      if(drag){ try{ view.setPointerCapture(e.pointerId); }catch(x){} }
    });
    view.addEventListener('pointermove',function(e){
      if(!drag) return;
      if(drag.mode==='pan'){ S.view.x=drag.ox+(e.clientX-drag.sx); S.view.y=drag.oy+(e.clientY-drag.sy); applyView(); }
      else{
        var k=(S.view&&S.view.k)||1;
        var nx=Math.round(drag.ox+(e.clientX-drag.sx)/k), ny=Math.round(drag.oy+(e.clientY-drag.sy)/k);
        drag.el.style.left=nx+'px'; drag.el.style.top=ny+'px'; S.pos[drag.n]={x:nx,y:ny}; drawWires();
      }
    });
    var end=function(){
      if(!drag) return;
      if(drag.mode==='pan') lsSet('ks.view',S.view); else { lsSet('ks.pos',S.pos); var b=bounds(); world.style.width=b.w+'px'; world.style.height=b.h+'px'; }
      drag=null; view.classList.remove('pan');
    };
    view.addEventListener('pointerup',end); view.addEventListener('pointercancel',end);
    view.addEventListener('wheel',function(e){
      if(!S.desk) return;
      if(e.target.closest('.ks-area,.ks-strip')&&!e.ctrlKey) return;
      e.preventDefault();
      if(!S.view) fit(false);
      if(e.ctrlKey||e.metaKey){ var r=view.getBoundingClientRect(); zoom(Math.exp(-e.deltaY*.0022),e.clientX-r.left,e.clientY-r.top); }
      else { S.view.x-=e.deltaX; S.view.y-=e.deltaY; applyView(); clearTimeout(S.wT); S.wT=setTimeout(function(){ lsSet('ks.view',S.view); },300); }
    },{passive:false});
    window.addEventListener('resize',function(){ if(!S.mounted||!root.classList.contains('on')) return; var d=isDesk(); if(d!==S.desk) render(); else layout(); });
    window.addEventListener('kova:link',function(){ if(S.mounted&&root.classList.contains('on')){ paintPanel(); softPaint(); } });
    if(document.fonts&&document.fonts.ready) document.fonts.ready.then(function(){ if(S.mounted) layout(); });
    document.addEventListener('keydown',function(e){
      if(!root.classList.contains('on')) return;
      if(e.key==='Escape') closeMenu();
    });
  }

  function mount(){
    if(!S.mounted){ if(!build()) return; S.mounted=true; }
    var last=lsGet('ks.last',null);
    openPost(S.post?S.post.id:last);
    /* back from a platform's sign-in page */
    var back=window.__kovaLinkResult;
    if(back){ window.__kovaLinkResult=null; if(back.ok&&back.provider){ var kk=back.provider==='google'?'youtube':back.provider; if(KPo.PLAT[kk]) linkedNow(kk); } }
    if(!KovaTour.seen('studio')&&!lsGet('ks.tour',false)&&KovaTour.canRemember()&&!$('.ks-veil',root)) setTimeout(function(){ if(root.classList.contains('on')&&!$('#ksTour')&&KovaTour.once('studio')) tour(); },900);
    /* fresh state from the server when someone is actually signed in -
       opening the Studio must never create a guest account by itself */
    var u=null; try{ u=window.KOVA_FB&&KOVA_FB.auth&&KOVA_FB.auth.currentUser; }catch(e){}
    if(u&&window.KovaLink){
      KovaLink.status().then(function(){ if(root.classList.contains('on')){ paintPanel(); softPaint(); paintVeil(); } });
      KPo.syncAll().then(function(){ if(root.classList.contains('on')) render(); }).catch(function(){});
    }
  }

  function onScreen(id){
    var on=id==='workstudio';
    document.body.classList.toggle('ks-on',on);
    var app=document.getElementById('app'); if(app) app.classList.toggle('ks-wide',on);
    if(on){ mount(); return; }
    closeMenu(); closeSheet(); if(S.touring&&KovaTour.active()) KovaTour.end();
    var v=$('#ksVid'); if(v&&!v.paused) try{ v.pause(); }catch(e){}
    if(slideT){ clearInterval(slideT); slideT=null; }
    if(recog) try{ recog.stop(); }catch(e){}
  }

  /* the brief composer hands its result over here */
  function fromVariant(rec){
    var p=KPo.blank();
    var v=(rec&&rec.variants&&rec.variants[0])||{};
    p.title=(rec&&(rec.title||rec.brief)||'From a brief').slice(0,60);
    p.heading=v.title||'';
    p.body=rec&&rec.brief||'';
    p.caption=v.caption||v.hook||'';
    p.tags=(v.tags||[]).map(function(t){ return '#'+String(t).replace(/^#/,''); }).join(' ');
    p.targets=((rec&&rec.platforms)||[]).filter(function(k){ return KPo.PLAT[k]; });
    p.format='text';
    KPo.save(p); S.post=p;
    go('workstudio');
    return p;
  }

  return {onScreen:onScreen, toast:toast, tour:tour, connect:connect, open:function(id){ S.post=null; lsSet('ks.last',id); go('workstudio'); },
          newPost:function(){ go('workstudio'); newPost(); }, fromVariant:fromVariant,
          _state:S, _render:render, _addFiles:addFiles, _publish:publish, _act:act,
          /* for the accounts folders (p09) */
          _icon:function(k){ return ic(BRAND[k]||k); }, _toggle:toggleTarget, _place:placeSheet, _acct:acctSheet,
          _hand:function(k){ return byHandNow(k); }, _post:function(){ return P(); }};
})();
