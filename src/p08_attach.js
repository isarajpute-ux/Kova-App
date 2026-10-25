/* =====================================================================
   KovaAttach - the attachment you use, remembered (p37).

   The owner: "on the add exercises make sure you have an option button to
   add an attachment so going forward you can save it and they don't have
   to tell you again". Every exercise in today's workout, and every one in
   "Add to today", gets a small button: + Attachment, or the one you use
   (Rope, Straight bar, V-bar...). The choice is kept per exercise (KP
   'attach', so it follows your account), put on the exercise when it is
   added again, and saved with the sets in your log.
   ===================================================================== */
window.KovaAttach=(function(){
  'use strict';
  var KEY='attach';
  var OPT={
    cable:['Rope','Straight bar','V-bar','EZ bar','Single handle','Wide lat bar','Ankle strap'],
    barbell:['Straight bar','EZ bar','Trap bar','Safety squat bar','Smith machine'],
    dumbbell:['Dumbbells','Kettlebell','Cable instead'],
    machine:['Machine handles','Wide grip','Close grip','Neutral grip'],
    bodyweight:['Bodyweight','Dip belt','Weight vest','Band to help'],
    any:['Rope','Straight bar','V-bar','EZ bar','Single handle','Dumbbells','Machine handles','Band']
  };
  var EXTRA=['Belt','Straps'];
  /* p42 (the owner: "any attachment that's known in any gym... V-bar, straight
     bar, curved bar, the bar that looks like a bicycle, anything for back,
     legs, arms, the weighted belt"): every common one, drawn, with what it is
     for. [name, kind, body areas, what it is for, drawing] */
  var CAT=[
    ['Rope','Cable handles',['Arms','Shoulders','Back'],'Pushdowns, face pulls','<circle cx="24" cy="5" r="2.4"/><path d="M24 7C22 14 16 18 12 23M24 7C26 14 32 18 36 23"/><circle cx="12" cy="24" r="2.6"/><circle cx="36" cy="24" r="2.6"/>'],
    ['Straight bar','Cable handles',['Arms','Back'],'Pushdowns, curls','<circle cx="24" cy="5" r="2.2"/><path d="M24 7V15M5 16H43"/>'],
    ['EZ bar','Bars',['Arms'],'The curved bar','<path d="M3 15H11L15 11L19 18L24 13L29 18L33 11L37 15H45"/><path d="M5 10V20M43 10V20"/>'],
    ['V-bar','Cable handles',['Back','Arms'],'Close-grip rows','<circle cx="24" cy="5" r="2.2"/><path d="M24 7L13 22M24 7L35 22M9 22H17M31 22H39"/>'],
    ['Single handle','Cable handles',['Back','Shoulders','Chest','Arms'],'One-arm moves','<circle cx="24" cy="4" r="2"/><path d="M24 6L15 19H33Z"/><path d="M14 21H34" stroke-width="3"/>'],
    ['Stirrup handles','Cable handles',['Chest','Shoulders','Arms'],'Crossovers, flyes','<path d="M14 6L7 18H21ZM34 6L27 18H41Z"/><path d="M6 20H22M26 20H42" stroke-width="3"/>'],
    ['Wide lat bar','Cable handles',['Back'],'Wide pulldowns','<circle cx="24" cy="5" r="2.2"/><path d="M24 7V13M3 7Q6 16 12 14H36Q42 16 45 7"/>'],
    ['Parallel-grip lat bar','Cable handles',['Back'],'Palms-in pulldowns','<circle cx="24" cy="5" r="2.2"/><path d="M24 7V12M4 12H44M14 12V22M34 12V22"/>'],
    ['MAG grip','Cable handles',['Back'],'Rows, pulldowns','<circle cx="24" cy="4" r="2"/><path d="M24 6V10M10 10H38"/><rect x="12" y="10" width="5" height="12" rx="2"/><rect x="31" y="10" width="5" height="12" rx="2"/>'],
    ['Row handle','Cable handles',['Back'],'Seated rows','<circle cx="24" cy="4" r="2"/><path d="M24 6L15 13L19 23H29L33 13Z"/><path d="M18 18H30"/>'],
    ['Ankle strap','Cable handles',['Legs','Glutes'],'Kickbacks','<rect x="11" y="12" width="26" height="10" rx="5"/><path d="M24 12V7"/><circle cx="24" cy="5" r="2.2"/>'],
    ['Tricep bar','Cable handles',['Arms'],'Pushdowns','<circle cx="24" cy="4" r="2"/><path d="M24 6V10M6 10Q15 24 24 14Q33 24 42 10"/>'],
    ['Olympic barbell','Bars',['Legs','Chest','Back','Shoulders'],'Squat, bench, deadlift','<path d="M1 14H47"/><rect x="5" y="5" width="4" height="18" rx="1"/><rect x="10" y="8" width="3" height="12" rx="1"/><rect x="39" y="5" width="4" height="18" rx="1"/><rect x="35" y="8" width="3" height="12" rx="1"/>'],
    ['Trap bar','Bars',['Legs','Back'],'Deadlifts','<path d="M14 5H34L42 14L34 23H14L6 14Z"/><path d="M17 10V18M31 10V18M0 14H6M42 14H48"/>'],
    ['Safety squat bar','Bars',['Legs'],'Squats, easy shoulders','<path d="M2 11H46"/><rect x="18" y="8" width="12" height="6" rx="3"/><path d="M19 13Q16 21 21 25M29 13Q32 21 27 25"/>'],
    ['Swiss bar','Bars',['Chest','Shoulders','Arms'],'Palms-in presses','<rect x="8" y="7" width="32" height="14" rx="3"/><path d="M16 7V21M24 7V21M32 7V21M0 14H8M40 14H48"/>'],
    ['Cambered bar','Bars',['Legs','Chest'],'Squats, presses','<path d="M1 8H11Q13 24 24 24Q35 24 37 8H47"/>'],
    ['Landmine','Bars',['Back','Shoulders','Core'],'Rows, presses','<rect x="3" y="21" width="11" height="4" rx="1"/><path d="M9 21L41 7"/><circle cx="41" cy="7" r="4.5"/>'],
    ['Smith machine','Machines',['Legs','Chest','Shoulders'],'Bar on rails','<path d="M12 2V26M36 2V26M4 13H44"/>'],
    ['Dumbbells','Free weights',['Legs','Chest','Back','Shoulders','Arms'],'Presses, rows, curls','<rect x="7" y="7" width="6" height="14" rx="1.5"/><rect x="35" y="7" width="6" height="14" rx="1.5"/><path d="M13 14H35"/>'],
    ['Kettlebell','Free weights',['Legs','Glutes','Core','Shoulders'],'Swings','<path d="M17 11Q17 3 24 3Q31 3 31 11"/><circle cx="24" cy="17" r="8.5"/>'],
    ['Weight plate','Free weights',['Chest','Core','Shoulders'],'Plate raises','<circle cx="24" cy="14" r="11"/><circle cx="24" cy="14" r="3"/>'],
    ['Medicine ball','Free weights',['Core'],'Slams, throws','<circle cx="24" cy="14" r="11"/><path d="M13 14H35M24 3Q18 14 24 25"/>'],
    ['Dip belt','Belts and gear',['Chest','Arms','Back'],'Weighted dips','<path d="M7 7Q24 17 41 7"/><path d="M24 12V17"/><circle cx="24" cy="21.5" r="5"/>'],
    ['Weight vest','Belts and gear',['Legs','Chest','Back','Core'],'Extra weight','<path d="M16 3L11 8V25H37V8L32 3L28 8H20Z"/><path d="M15 14H33"/>'],
    ['Belt','Belts and gear',['Legs','Back'],'Heavy lifts','<rect x="3" y="9" width="42" height="10" rx="3"/><rect x="20" y="7" width="8" height="14" rx="1.5"/>'],
    ['Straps','Belts and gear',['Back'],'Heavy pulls','<path d="M9 21C5 10 15 4 19 10L24 22M25 21C21 10 31 4 35 10L40 22"/>'],
    ['Wrist wraps','Belts and gear',['Chest','Shoulders'],'Heavy presses','<rect x="8" y="9" width="24" height="10" rx="5"/><circle cx="38" cy="14" r="4"/>'],
    ['Knee sleeves','Belts and gear',['Legs'],'Warm knees','<path d="M12 4L10 24H21L19 4ZM29 4L27 24H38L36 4Z"/>'],
    ['Band','Belts and gear',['Legs','Glutes','Back','Arms','Shoulders'],'Pull-up help','<ellipse cx="24" cy="14" rx="18" ry="8"/>'],
    ['Chains','Belts and gear',['Legs','Chest'],'Heavier at the top','<ellipse cx="8" cy="14" rx="5" ry="3"/><ellipse cx="16" cy="14" rx="5" ry="3"/><ellipse cx="24" cy="14" rx="5" ry="3"/><ellipse cx="32" cy="14" rx="5" ry="3"/><ellipse cx="40" cy="14" rx="5" ry="3"/>']
  ];
  var AREAS=['Back','Legs','Glutes','Arms','Chest','Shoulders','Core'];
  /* the leg press: where your feet go changes what works (p42). Height matters
     most; width changes less than people think (EMG studies), said plainly. */
  var FEET=[
    ['Feet middle','Quads and glutes','Leg press',[0,0,1]],
    ['Feet high','More glutes, hamstrings','Leg press (feet high)',[0,-1,1]],
    ['Feet low','More quads','Leg press (feet low)',[0,1,1]],
    ['Feet wide','Inner thighs, glutes','Leg press (feet wide)',[1,0,1]],
    ['Feet narrow','Quads','Leg press (feet narrow)',[-1,0,1]],
    ['One leg','Fix a weak side','Single leg press',[0,0,0]]
  ];
  function isLP(n){ return /leg press/i.test(String(n||'')); }
  function catOf(v){ return CAT.filter(function(c){ return c[0].toLowerCase()===String(v||'').toLowerCase(); })[0]||null; }
  function icon(c){ return '<svg class="katt-ic" viewBox="0 0 48 28" aria-hidden="true">'+(c?c[4]:'<path d="M10 14H38"/>')+'</svg>'; }
  /* the plate seen from the front, the two feet on it */
  function plate(f){
    var w=f[0], h=f[1], two=f[2], y=14+h*6, dx=w>0?10:w<0?4:7, ang=w>0?14:0;
    var foot=function(x,flip){ return '<ellipse cx="'+x+'" cy="'+y+'" rx="3" ry="5.5" transform="rotate('+(flip?-ang:ang)+' '+x+' '+y+')"/>'; };
    return '<svg class="katt-ic katt-pl8" viewBox="0 0 48 28" aria-hidden="true"><rect x="10" y="2" width="28" height="24" rx="3"/>'+(two?foot(24-dx,1)+foot(24+dx,0):foot(24,0))+'</svg>';
  }
  /* the picture Kova shows for an exercise: a leg press with your feet where you put them */
  function figure(n){ if(!isLP(n)) return n; var v=get(n), f=FEET.filter(function(x){ return x[0]===v; })[0]; return f?f[2]:n; }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function all(){ try{ var v=window.KP?KP.get(KEY):JSON.parse(localStorage.getItem('kova.attach')||'null'); return v&&typeof v==='object'?v:{}; }catch(e){ return {}; } }
  function get(n){ return all()[String(n||'')]||''; }
  function set(n,v){
    var a=all(); v=String(v||'').trim().slice(0,40);
    if(v) a[n]=v; else delete a[n];
    try{ if(window.KP) KP.set(KEY,a); else localStorage.setItem('kova.attach',JSON.stringify(a)); }catch(e){}
    try{ if(window.KovaAnalytics) KovaAnalytics.track('attachment_set',{n:n,v:v||'none'}); }catch(e){}
    return v;
  }
  function K(){ return window.KSESS||null; }
  /* what kind of exercise: the workout list's equipment, its short code, or the name */
  var CODE={bb:'barbell',db:'dumbbell',kb:'dumbbell',cb:'cable',cable:'cable',mc:'machine',machine:'machine',bw:'bodyweight',barbell:'barbell',dumbbell:'dumbbell',bodyweight:'bodyweight'};
  function kind(n){
    var k=K(), x=null, e='';
    try{ var X=(k&&k.XL||[]).filter(function(r){ return r.n===n; })[0]; e=X&&X.e||''; }catch(err){}
    if(!OPT[e]){ try{ x=k&&k.lib?k.lib(n):null; }catch(err){} e=CODE[x&&(x.e||x.eq)]||''; }
    if(OPT[e]) return e;
    if(/cable|pushdown|pulldown|face pull|crossover|fly/i.test(n)) return 'cable';
    if(/machine|leg press|leg curl|leg extension|pec deck|hack squat/i.test(n)) return 'machine';
    if(/dumbbell|\bdb\b|goblet|kettlebell/i.test(n)) return 'dumbbell';
    if(/barbell|\bez\b|skull|close grip bench|deadlift|squat|bench press|\brow\b|curl/i.test(n)) return 'barbell';
    if(/pull.?up|chin.?up|\bdips?\b|push.?up/i.test(n)) return 'bodyweight';
    return 'any';
  }
  function options(n){ return OPT[kind(n)].concat(EXTRA); }
  function label(v,n){ return v?esc(v):(n&&isLP(n)?'+ Feet':'+ Attachment'); }

  /* ---------- the picker ---------- */
  function tile(v,cur,c,sub){ return '<button type="button" class="katt-t'+(v===cur?' on':'')+'" data-katt-v="'+esc(v)+'" aria-pressed="'+(v===cur)+'">'+(c&&c.charAt?c:icon(c))+'<b>'+esc(v)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</button>'; }
  var AREA='';
  function allHtml(cur){
    var L=CAT.filter(function(c){ return !AREA||c[2].indexOf(AREA)>=0; });
    return '<div class="katt-as" role="group" aria-label="Body area">'+['','Back','Legs','Glutes','Arms','Chest','Shoulders','Core'].map(function(a){ return '<button type="button" class="chip'+(AREA===a?' on':'')+'" data-katt-area="'+a+'" aria-pressed="'+(AREA===a)+'">'+(a||'All')+'</button>'; }).join('')+'</div>'
      +'<div class="katt-grid">'+L.map(function(c){ return tile(c[0],cur,c,c[3]); }).join('')+'</div>';
  }
  function pickHtml(n,cur,where){
    var lp=isLP(n), best=lp?[]:options(n);
    return '<div class="katt-p" data-katt-for="'+esc(n)+'" data-katt-where="'+where+'">'
      +'<div class="katt-pl">'+esc(n)+'</div>'
      +(lp?'<div class="katt-h">Where your feet go</div><div class="katt-grid">'+FEET.map(function(f){ return tile(f[0],cur,plate(f[3]),f[1]); }).join('')+'</div>'
        +'<div class="katt-n">Height matters more than width.</div>'
        :'<div class="katt-h">Best for this one</div><div class="katt-grid katt-best">'+best.map(function(o){ return tile(o,cur,catOf(o)); }).join('')+'</div>')
      +'<button type="button" class="chip katt-none" data-katt-v="">'+(lp?'No setting':'No attachment')+'</button>'
      +(where==='a'?'<button type="button" class="chip katt-more" data-katt-more="1">Every attachment</button><div class="katt-all" hidden></div>'
        :'<div class="katt-h">Every attachment</div><div class="katt-all">'+allHtml(cur)+'</div>')
      +'<div class="katt-own"><input class="srch" maxlength="40" placeholder="Something else? Type it" aria-label="Your own attachment"/><button type="button" class="chip on" data-katt-own="1">Save</button></div>'
      +'</div>';
  }
  /* any exercise by name, from anywhere (Coach me's top right, p42) */
  function pickSheet(n,done){ if(!window.openSheet) return; PICK=done||null; openSheet('<div class="grab"></div>'+pickHtml(n,get(n),'x')); }
  var PICK=null;
  function sessionSheet(i){
    var k=K(); if(!k||!window.openSheet) return;
    var e=k.state().ex[i]; if(!e) return;
    openSheet('<div class="grab"></div>'+pickHtml(e.n,e.att||get(e.n),'s'+i));
  }
  function choose(box,v){
    var n=box.getAttribute('data-katt-for'), where=box.getAttribute('data-katt-where');
    v=set(n,v);
    var k=K();
    if(where==='x'){
      try{ var S=k&&k.state(); (S&&S.ex||[]).forEach(function(e){ if(e.n===n){ e.att=v||undefined; } }); k&&k.api&&k.api.save&&k.api.save(); }catch(x){}
      if(window.closeSheet) closeSheet();
      if(window.toast) toast(v?n+': '+v+'. Kova remembers it.':'Nothing set for '+n+'.');
      var cb=PICK; PICK=null; if(cb) try{ cb(v); }catch(x){}
      decorate(); return;
    }
    if(k&&where.charAt(0)==='s'){
      var e=k.state().ex[+where.slice(1)]; if(e&&e.n===n){ e.att=v||undefined; try{ k.api&&k.api.save&&k.api.save(); }catch(x){} }
      if(window.closeSheet) closeSheet();
      if(window.toast) toast(v?n+': '+v+'. Kova remembers it.':'No attachment for '+n+'.');
      decorate(); return;
    }
    /* in "Add to today": update the row's button and fold the picker away */
    var row=box.previousElementSibling, b=row&&row.querySelector('.katt-add'); if(b) b.innerHTML=label(v,n);
    box.remove();
  }

  /* ---------- the buttons ---------- */
  function on(id){ var s=document.getElementById(id); return !!(s&&s.classList.contains('on')); }
  function decorate(){
    var k=K();
    /* today's workout */
    if(k&&on('s-session')){
      var ex=k.state().ex||[];
      document.querySelectorAll('#s-session .exwrap[data-ex]').forEach(function(w){
        var i=+w.getAttribute('data-ex'), e=ex[i], head=w.querySelector('.exhead .exmeta'); if(!e||!head) return;
        if(e.att==null&&get(e.n)){ e.att=get(e.n); try{ k.api&&k.api.save&&k.api.save(); }catch(x){} }
        var b=w.querySelector('.katt-chip'), txt=label(e.att,e.n);
        if(b){ if(b.__t!==txt){ b.innerHTML=txt; b.__t=txt; b.classList.toggle('set',!!e.att); } return; }
        head.insertAdjacentHTML('afterend','<button type="button" class="katt-chip'+(e.att?' set':'')+'" data-katt="'+i+'" aria-label="Attachment for '+esc(e.n)+'">'+txt+'</button>');
        var nb=w.querySelector('.katt-chip'); if(nb) nb.__t=txt;
      });
    }
    /* "Add to today" */
    document.querySelectorAll('#sheet .exadd[data-n]').forEach(function(r){
      if(r.querySelector('.katt-add')) return;
      var n=r.getAttribute('data-n'), plus=r.querySelector('svg.ic');
      var html='<button type="button" class="katt-add" data-katt-n="'+esc(n)+'" aria-label="Attachment for '+esc(n)+'">'+label(get(n),n)+'</button>';
      if(plus) plus.insertAdjacentHTML('beforebegin',html); else r.insertAdjacentHTML('beforeend',html);
    });
  }

  /* taps: in the capture phase, so the row under the button does not also add or open */
  document.addEventListener('click',function(ev){
    var t=ev.target; if(!t||!t.closest) return;
    var b=t.closest('[data-katt]');
    if(b){ ev.preventDefault(); ev.stopPropagation(); sessionSheet(+b.getAttribute('data-katt')); return; }
    var a=t.closest('.katt-add');
    if(a){ ev.preventDefault(); ev.stopPropagation();
      var row=a.closest('.exadd'), n=a.getAttribute('data-katt-n'), nx=row&&row.nextElementSibling;
      if(nx&&nx.classList.contains('katt-p')){ nx.remove(); return; }
      document.querySelectorAll('#sheet .katt-p').forEach(function(x){ x.remove(); });
      if(row) row.insertAdjacentHTML('afterend',pickHtml(n,get(n),'a'));
      return; }
    var ar=t.closest('[data-katt-area]');
    if(ar){ ev.preventDefault(); ev.stopPropagation(); AREA=ar.getAttribute('data-katt-area'); var bx=ar.closest('.katt-p'), al=bx&&bx.querySelector('.katt-all'), nm=bx&&bx.getAttribute('data-katt-for'); if(al) al.innerHTML=allHtml(get(nm)); return; }
    var mo=t.closest('[data-katt-more]');
    if(mo){ ev.preventDefault(); ev.stopPropagation(); var bx2=mo.closest('.katt-p'), al2=bx2&&bx2.querySelector('.katt-all'); if(al2){ al2.hidden=!al2.hidden; if(!al2.hidden) al2.innerHTML=allHtml(get(bx2.getAttribute('data-katt-for'))); } return; }
    var v=t.closest('[data-katt-v]');
    if(v){ ev.preventDefault(); ev.stopPropagation(); choose(v.closest('.katt-p'),v.getAttribute('data-katt-v')); return; }
    var own=t.closest('[data-katt-own]');
    if(own){ ev.preventDefault(); ev.stopPropagation(); var box=own.closest('.katt-p'), inp=box.querySelector('input'); if(inp&&inp.value.trim()) choose(box,inp.value); return; }
    /* an exercise added from the list takes the attachment you use with it */
    var add=t.closest('#sheet .exadd[data-n]');
    if(add&&K()){ var name=add.getAttribute('data-n'), at=get(name);
      if(at) setTimeout(function(){ var k=K(), ex=k.state().ex||[]; for(var j=ex.length-1;j>=0;j--){ if(ex[j].n===name&&ex[j].att==null){ ex[j].att=at; try{ k.api&&k.api.save&&k.api.save(); }catch(x){} break; } } decorate(); },0); }
  },true);
  document.addEventListener('keydown',function(ev){
    if(ev.key!=='Enter') return; var inp=ev.target; if(!inp||!inp.closest||!inp.closest('.katt-own')) return;
    ev.preventDefault(); var box=inp.closest('.katt-p'); if(inp.value.trim()) choose(box,inp.value);
  });
  var pend=0; function soon(){ if(pend) return; pend=setTimeout(function(){ pend=0; if(window.KovaPark&&KovaPark.quiet) KovaPark.quiet(decorate); else decorate(); },80); }
  if(window.MutationObserver) new MutationObserver(function(ms){ for(var i=0;i<ms.length;i++){ var t=ms[i].target; if(!(t.closest&&t.closest('.katt-chip,.katt-add,.katt-p,[data-kxd],[data-kxd-still],#kpl,#kz2'))){ soon(); return; } } }).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('kova:screen',soon);
  return {get:get,set:set,options:options,kind:kind,decorate:decorate,all:all,CAT:CAT,FEET:FEET,figure:figure,pickSheet:pickSheet,isLP:isLP};
})();
