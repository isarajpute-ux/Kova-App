/* =====================================================================
   KovaWhatsNew - every update comes with a tour of what is new (p34).

   The owner's rule (2026-10-21): when Kova gains something, people are
   walked to it. Each release below lists its new things, each a step of
   Kova's own tour (KovaTour: the light, Next / Back / Skip) on the screen
   where it lives. Someone who already uses Kova gets a small "New in Kova"
   card once per release (Show me, or Later: it comes back once more);
   someone brand new is not interrupted, because their first-run tours
   cover everything. Search ("what's new") plays the latest one any time.

   Adding a release: put it first in REL with a new id, and steps that
   point at the real new controls. Test it like any feature.
   ===================================================================== */
window.KovaWhatsNew=(function(){
  'use strict';
  function q(s){ return document.querySelector(s); }
  function vis(el){ return !!(el&&el.getClientRects&&el.getClientRects().length); }
  function first(sel){ var L=document.querySelectorAll(sel); for(var i=0;i<L.length;i++) if(vis(L[i])) return L[i]; return L[0]||null; }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function lsPut(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }

  /* newest first */
  var REL=[
    {id:'new-2026-10-24',title:'Dream physique',
      lines:['Send a photo or video of the body you want','The muscles to build, lit on your own photo','Your change at 3 months, 6 months and a year, with a split and meals'],
      steps:[
        ['move','Dream physique','Send a photo, a video or a link of the body you want, and one of you. Kova lights up what to build on your own body, maps your change, and writes your split and meals.',function(){ return q('#kdpCard'); }]
      ]},
    {id:'new-2026-10-23',title:'Attachments, plain words and easier how-to',
      lines:['Save the attachment you use (rope, bar, handle) on any exercise','Your muscles this week in one word: weak, mild, needs work, stronger, sore','How to do each exercise in a few easy words'],
      steps:[
        ['session','Attachments','Tap the button under an exercise to save the rope, bar or handle you use. Kova remembers it next time.',function(){ return first('#s-session .katt-chip')||q('#addExBtn'); }],
        ['customize','Your muscles this week','No more numbers like 5/16: each muscle says weak, mild, needs work, stronger or sore.',function(){ return q('#volList'); }],
        ['move','Easier how-to','Every exercise explains the moves in a few simple words.',function(){ return first('#s-move .kxp-act[data-kxp="lib"]'); }]
      ]},
    {id:'new-2026-10-22',title:'Recovery, stretching, clearer pictures and smarter scans',
      lines:['Muscle recovery: what is fresh and what needs rest','Stretch right beside it, with a timer','Exercise pictures that light up the muscle working','Scan a machine from a photo, a video or a link','Alerts on your phone when sleep is low or it has been a while'],
      steps:[
        ['move','Muscle recovery','Your muscles coloured by how recovered they are, from the sets you logged. Tap a muscle for its page.',function(){ return q('#krcCard'); }],
        ['move','Train what’s fresh','One tap builds today’s workout from the muscles that are ready: 2–3 working sets each.',function(){ return first('#krcCard [data-krc="fresh"]'); }],
        ['move','Stretch','The stretches for what is resting, right here. Stretch with me times each hold.',function(){ return q('#krsCard'); }],
        ['move','Pictures that show the work','Every exercise is a small body map now: the muscle doing the work glows as the rep goes.',function(){ return first('#s-move .kxp-act[data-kxp="lib"]'); }],
        ['session','Follow along','Your workout one exercise at a time: the moving picture, your target, the rest timer and a voice.',function(){ return first('.kpl-chip'); }],
        ['machine','Scan any machine','A photo, a video or a YouTube link. Not sure? Kova shows its best guesses as pictures, and every machine below has one.',function(){ return first('#s-machine .mc-ways'); }],
        ['settings','Alerts on your phone','Kova tells you when sleep is low, when it has been days since a workout, and what time to be in bed.',function(){ return q('#kpuNote')||first('#s-settings .sec-h'); }]
      ]},
    {id:'new-2026-10-21',title:'Exercise pictures, stretching and Zone 2 running',
      lines:['A moving picture for every exercise','Stretches for every muscle','Zone 2 running, with all five zones','Team chat with your AI teammates'],
      steps:[
        ['move','Exercises','Every exercise with a moving picture: the muscles it works, how to do it, and your own records.',function(){ return first('#s-move .kxp-act[data-kxp="lib"]'); }],
        ['move','Stretch','Stretches for every muscle. "Stretch with me" times each hold, for the muscles you trained today.',function(){ return first('#s-move .kxp-act[data-kxp="str"]'); }],
        ['move','Zone 2 running','Your heart-rate zones, this week’s Zone 2 minutes and your runs. Open it to start a run with live coaching.',function(){ return q('#kz2Card'); }],
        ['customize','Pictures in your plan','Tap the small picture beside any exercise to see how it is done. In a workout, the one you are on moves.',function(){ return first('#s-customize .pgex .kxp-tb'); }],
        ['workteam','Team chat','Ask several AI teammates at once: type @ and their names, or @everyone. Each answers in turn.',function(){ return first('#s-workteam .crd-pill[data-n="chat"]'); }]
      ]}
  ];
  function onScreen(){ var s=q('.screen.on'); return s?s.id.replace(/^s-/,''):''; }
  function steps(rel){
    return rel.steps.map(function(t){
      return {t:t[1],d:t[2],el:t[3],move:function(){
        if(onScreen()!==t[0]&&typeof window.go==='function'){ window.go(t[0]); return true; }
        return false;
      }};
    });
  }
  function start(id){
    var rel=id?REL.filter(function(r){ return r.id===id; })[0]:REL[0];
    if(!rel||!window.KovaTour) return false;
    hide();
    if(KovaTour.mark) KovaTour.mark(rel.id);
    var home=onScreen(), screens=[];
    rel.steps.forEach(function(t){ if(screens.indexOf(t[0])<0) screens.push(t[0]); });
    if(home&&screens.indexOf(home)<0) screens.push(home);
    track('whats_new',{id:rel.id});
    KovaTour.run(steps(rel),{color:'#E87A3C',screens:screens,done:function(why){
      if(why==='left') return;
      if(home&&onScreen()!==home&&typeof window.go==='function') window.go(home);
    }});
    return true;
  }

  /* ---------- the "New in Kova" card ---------- */
  function hide(){ var el=document.getElementById('kwn'); if(el) el.remove(); }
  function card(rel){
    hide();
    var el=document.createElement('div'); el.id='kwn'; el.className='card kwn'; el.setAttribute('role','dialog'); el.setAttribute('aria-label','New in Kova');
    el.innerHTML='<div class="kwn-h"><span class="kwn-k">NEW IN KOVA</span><button type="button" class="kwn-x" data-kwn="later" aria-label="Later"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button></div>'
      +'<div class="kwn-t">'+rel.title+'</div><ul class="kwn-l">'+rel.lines.map(function(l){ return '<li>'+l+'</li>'; }).join('')+'</ul>'
      +'<div class="kwn-b"><button type="button" class="chip" data-kwn="later">Later</button><button type="button" class="kwn-go" data-kwn="show" data-id="'+rel.id+'">Show me where'+'<svg class="ic" aria-hidden="true"><use href="#i-arrow-right"/></svg></button></div>';
    (document.getElementById('app')||document.body).appendChild(el);
    track('whats_new_card',{id:rel.id});
  }
  /* someone who has used Kova before: a tour seen, or their own data */
  function returning(){
    try{ var m=JSON.parse(localStorage.getItem('kova.tours.v1')||'{}')||{}; if(Object.keys(m).some(function(k){ return k.indexOf('new-')!==0; })) return true; }catch(e){}
    try{ var p=window.KP&&KP.get('tours'); if(p&&Object.keys(p).some(function(k){ return k.indexOf('new-')!==0; })) return true; }catch(e){}
    return false;
  }
  function clear(){
    var app=document.getElementById('app');
    if(app&&app.classList.contains('auth-locked')) return false;
    if(window.KovaTour&&KovaTour.active&&KovaTour.active()) return false;
    if(q('#sheet.on')||q('#kz2')||q('#ksTour')) return false;
    return !!q('.screen.on');
  }
  var tries=0;
  function check(){
    var rel=REL[0]; if(!rel||!window.KovaTour||!KovaTour.canRemember()) return;
    if(KovaTour.seen(rel.id)) return;
    if(!returning()){ KovaTour.mark(rel.id); return; }                 /* new here: their first-run tours show everything */
    if(!clear()){ if(++tries<12) setTimeout(check,5000); return; }
    var later=lsJ('kova.wn.later',{}); if((later[rel.id]||0)>=2){ KovaTour.mark(rel.id); return; }
    card(rel);
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-kwn]'); if(!b) return;
    var a=b.getAttribute('data-kwn');
    if(a==='show'){ start(b.getAttribute('data-id')); return; }
    if(a==='later'){ var rel=REL[0], L=lsJ('kova.wn.later',{}); L[rel.id]=(L[rel.id]||0)+1; lsPut('kova.wn.later',L); if(L[rel.id]>=2) KovaTour.mark(rel.id); hide(); }
  });
  setTimeout(check,4500);
  return {REL:REL,start:start,check:check,card:card,steps:steps,returning:returning};
})();
