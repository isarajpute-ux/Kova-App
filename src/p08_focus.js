/* =====================================================================
   KovaFocus - show new people less (p12).

   The first question asks what you want Kova for: Food, Training, Sleep &
   recovery, Work (any of them). From then on:
     - the tab bar shows Home and those areas only, never more than five
       (Sleep & recovery brings Sleep and Vitals; when all four areas are
       picked, Vitals is the one that waits under More);
     - Home shows those areas' tiles, and the Work OS card only if Work
       was picked;
     - the extras stay off the main path until turned on from More: the AI
       team, Studio publishing, calling your team by voice, lab results and
       GLP-1 mode;
     - after the first win, the areas not picked come back as the first
       week's one-a-day suggestion (KovaFirstWeek), one at a time.
   More sits at the bottom of the rail, above Settings, one tap from all of
   it. Nobody who skipped the question, or set up Kova before it, loses
   anything: they keep every area, with Vitals under More to stay at five.
   ===================================================================== */
window.KovaFocus=(function(){
  'use strict';
  var KEY='kova.focus.v1', MAX=5;
  var AREAS=[
    {k:'fuel',n:'Food',p:['fuel'],why:'Two-tap meal logging, and targets that move with your sleep and training.'},
    {k:'move',n:'Training',p:['move'],why:'Your split, last time on every set, and plates worked out for you.'},
    {k:'sleep',n:'Sleep & recovery',p:['sleep','vitals'],why:'What moves your nights, readiness each morning, and your vitals.'},
    {k:'work',n:'Work',p:['work'],why:'Tasks placed in your sharpest hours, your calendar, and an AI team.'}
  ];
  var ORDER=['home','fuel','sleep','move','vitals','work'];
  var DROP=['vitals','work','sleep','move','fuel'];          // what waits under More first when there are too many
  var NAME={fuel:'Fuel',sleep:'Sleep',move:'Workout',vitals:'Vitals',work:'Work OS'};
  var CAPPED={vitals:'Resting heart rate, HRV, blood oxygen and your trends. Also the Vitals tile on Home.'};
  var S=lsJ(KEY,{extra:[],adv:{},all:false});
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }

  /* what was picked on the first run; null = everything */
  function picked(){ try{ var o=(window.KP&&KP.get('onboard'))||{}; return Array.isArray(o.areas)&&o.areas.length?o.areas:null; }catch(e){ return null; } }
  function focused(){ return !S.all&&!!picked(); }
  function areas(){
    if(!focused()) return AREAS.map(function(a){ return a.k; });
    var a=picked().slice(); (S.extra||[]).forEach(function(k){ if(a.indexOf(k)<0) a.push(k); }); return a;
  }
  function pillars(){ var on=areas(), p=[]; AREAS.forEach(function(a){ if(on.indexOf(a.k)>=0) p=p.concat(a.p); }); return p; }
  function tabs(){
    var p=pillars(), t=ORDER.filter(function(id){ return id==='home'||p.indexOf(id)>=0; });
    for(var i=0;t.length>MAX&&i<DROP.length;i++){ var at=t.indexOf(DROP[i]); if(at>0) t.splice(at,1); }
    return t;
  }
  function hidden(){ var t=tabs(); return ORDER.filter(function(id){ return id!=='home'&&t.indexOf(id)<0; }); }

  /* ---------------- the rail ---------------- */
  function paintRail(){
    var rail=document.querySelector('.rail'); if(!rail) return;
    var t=tabs();
    [].forEach.call(rail.querySelectorAll('.rnav[data-go]'),function(n){
      var id=n.getAttribute('data-go'); if(ORDER.indexOf(id)<0) return;
      n.classList.toggle('kf-off',t.indexOf(id)<0);
    });
    var more=document.getElementById('kfMore'), set=rail.querySelector('.rnav[data-go="settings"]');
    if(!more){
      more=document.createElement('div'); more.id='kfMore'; more.className='rnav kf-more'; more.setAttribute('role','button'); more.setAttribute('tabindex','0');
      more.setAttribute('title','More'); more.setAttribute('aria-label','More: everything else in Kova');
      more.innerHTML='<svg class="ic" aria-hidden="true"><use href="#i-dots"/></svg>';
      more.addEventListener('click',open);
      more.addEventListener('keydown',function(ev){ if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); open(); } });
      if(set) set.parentNode.insertBefore(more,set); else rail.appendChild(more);
    }
    if(set) set.classList.add('kf-after-more');
  }
  /* ---------------- Home ---------------- */
  function paintHome(){
    var home=document.getElementById('s-home'); if(!home) return;
    var p=pillars(), f=focused(), grid=null, vis=[];
    [].forEach.call(home.querySelectorAll('.card.tap[data-go]'),function(c){
      var id=c.getAttribute('data-go'); if(['sleep','move','fuel','vitals'].indexOf(id)<0) return;
      var on=!f||p.indexOf(id)>=0; c.classList.toggle('kf-off',!on); c.classList.remove('kf-wide'); if(on) vis.push(c); grid=c.parentElement;
    });
    /* an odd one out fills its row, so the grid has no hole */
    if(vis.length%2) vis[vis.length-1].classList.add('kf-wide');
    if(grid) grid.classList.toggle('kf-none',!vis.length);
    var os=document.getElementById('osHero'); if(os) os.classList.toggle('kf-off',f&&p.indexOf('work')<0);
    var b=document.body;
    b.classList.toggle('kf-focus',f);
    b.classList.toggle('kf-work',!f||p.indexOf('work')>=0);
    b.classList.toggle('kf-glp1',!f||!!S.adv.glp1||!!(window.KovaGLP1&&KovaGLP1.on()));
    var labs=0; try{ labs=window.KovaLabs?KovaLabs.markers().length:0; }catch(e){}
    b.classList.toggle('kf-labs',!f||!!S.adv.labs||labs>0);
  }
  function paint(){ paintRail(); paintHome(); }

  /* ---------------- More ---------------- */
  var EXTRA=[
    {k:'crew',n:'Your AI team',d:'AI employees that draft, research and follow up, with your approval.',need:'work',act:function(){ go('workteam'); }},
    {k:'studio',n:'Studio publishing',d:'Write once, post to 16 platforms, and see what worked.',need:'work',act:function(){ go('work'); }},
    {k:'voice',n:'Call your team by voice',d:'Say an employee’s name and ask. Uses the microphone only while on.',need:'work',
      on:function(){ return !!(window.KovaListen&&KovaListen.on()); },
      act:function(){ if(!window.KovaListen||!KovaListen.supported()){ say('This browser cannot listen. The app can.'); return; } KovaListen.set(!KovaListen.on()); say(KovaListen.on()?'Listening for your team’s names.':'Voice off.'); }},
    {k:'labs',n:'Lab results',d:'Read a blood test PDF or photo; you confirm every row. Never a diagnosis.',
      on:function(){ return !!S.adv.labs; },
      act:function(){ S.adv.labs=true; save(); paint(); track('feature_on',{feature:'labs'}); if(window.KovaLabs&&KovaLabs.open) KovaLabs.open(); }},
    {k:'glp1',n:'GLP-1 mode',d:'For Ozempic, Wegovy, Mounjaro and Zepbound: a protein floor, doses and side effects.',
      on:function(){ return !!(window.KovaGLP1&&KovaGLP1.on()); },
      act:function(){ S.adv.glp1=true; save(); paint(); track('feature_on',{feature:'glp1'}); if(window.KovaGLP1&&KovaGLP1.setup) KovaGLP1.setup(); }}
  ];
  function open(){
    if(!window.openSheet) return;
    var hid=hidden(), on=areas();
    var h='<div class="grab"></div><div class="kf"><div class="title-s" style="font-size:19px">More</div>';
    /* one row per area not picked; a screen of a picked area that waits
       only because of the five-tab limit (Vitals) gets its own row */
    var list=[];
    AREAS.forEach(function(a){ if(on.indexOf(a.k)<0) list.push({go:a.p[0],n:a.n,why:a.why,add:a.k}); });
    hid.forEach(function(id){ if(!list.some(function(r){ return AREAS.filter(function(a){ return a.n===r.n; })[0].p.indexOf(id)>=0; })) list.push({go:id,n:NAME[id],why:CAPPED[id]||''}); });
    if(list.length){
      h+='<div class="kf-h">Also in Kova</div>'+list.map(function(r){
        return '<div class="kf-r"><div class="kf-t"><b>'+esc(r.n)+'</b><span>'+esc(r.why)+'</span></div>'
          +'<div class="kf-b"><button class="kf-btn" data-kf-go="'+r.go+'">Open</button>'+(r.add?'<button class="kf-btn ghost" data-kf-add="'+r.add+'">Add to tabs</button>':'')+'</div></div>';
      }).join('');
    }
    h+='<div class="kf-h">Turn on when you need it</div>'+EXTRA.map(function(x){
      var st=x.on?x.on():null;
      return '<div class="kf-r"><div class="kf-t"><b>'+esc(x.n)+'</b><span>'+esc(x.d)+'</span></div><div class="kf-b"><button class="kf-btn'+(st?' ghost':'')+'" data-kf-x="'+x.k+'"'+(st!=null?' aria-pressed="'+st+'"':'')+'>'
        +(st==null?'Open':st?(x.k==='voice'?'Turn off':'On'):'Turn on')+'</button></div></div>';
    }).join('');
    if(focused()) h+='<button class="kf-all" data-kf-all="1">Show every area in the tab bar</button>';
    else if(picked()) h+='<button class="kf-all" data-kf-all="0">Back to just '+esc(picked().map(function(k){ return AREAS.filter(function(a){ return a.k===k; })[0].n; }).join(', '))+'</button>';
    openSheet(h+'</div>');
    var el=document.querySelector('#sheetIn .kf'); if(el) el.addEventListener('click',onMore);
    track('more_open',{count:hid.length});
  }
  function onMore(ev){
    var b=ev.target.closest('button'); if(!b) return;
    if(b.hasAttribute('data-kf-go')){ if(window.closeSheet) closeSheet(); try{ go(b.getAttribute('data-kf-go')); }catch(e){} return; }
    if(b.hasAttribute('data-kf-add')){ add(b.getAttribute('data-kf-add')); open(); return; }
    if(b.hasAttribute('data-kf-all')){ S.all=b.getAttribute('data-kf-all')==='1'; save(); paint(); open(); return; }
    if(b.hasAttribute('data-kf-x')){
      var x=EXTRA.filter(function(e){ return e.k===b.getAttribute('data-kf-x'); })[0]; if(!x) return;
      var stays=x.k==='voice';
      if(!stays&&window.closeSheet) closeSheet();
      setTimeout(function(){ try{ x.act(); }catch(e){} if(stays) open(); },stays?0:260);
    }
  }
  function add(k){
    if(!S.extra) S.extra=[];
    if(S.extra.indexOf(k)<0) S.extra.push(k);
    save(); paint();
    var a=AREAS.filter(function(x){ return x.k===k; })[0];
    track('area_added',{answer:k}); if(a) say(a.n+' is in your tab bar.');
  }

  /* ---------------- one a day, after the first win ---------------- */
  function offerAreas(){
    var F=window.KovaFirstWeek; if(!F||!F.PROMPTS||F.__kfAreas) return;
    var st=F._S&&F._S(); if(!st||!st.win||!focused()) return;
    F.__kfAreas=1;
    AREAS.forEach(function(a){
      F.PROMPTS.push({id:'area-'+a.k,min:1,when:function(){ return focused()&&areas().indexOf(a.k)<0; },
        q:'Kova does '+a.n.toLowerCase()+' too',why:a.why,opts:[['add','Add it'],['no','Not now']],
        pick:function(v){ if(v==='add') add(a.k); }});
    });
  }
  function watchWin(){
    var A=window.KovaAnalytics; if(!A||A.__kf) return;
    var real=A.track; A.track=function(name){ var r=real.apply(this,arguments); if(name==='first_win') setTimeout(offerAreas,0); return r; }; A.__kf=1;
  }

  function start(){ paint(); watchWin(); offerAreas(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);

  return {areas:areas,pillars:pillars,tabs:tabs,hidden:hidden,focused:focused,open:open,add:add,paint:paint,AREAS:AREAS,_S:function(){ return S; },_set:function(s){ S=s; save(); paint(); }};
})();
