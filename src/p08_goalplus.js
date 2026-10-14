/* =====================================================================
   KovaGoalPlus - the second question for three goals (p30).

   The owner: pressing Hiking should ask what kind (rock climbing,
   bouldering...); Cycling should ask "Do you compete? When is it? How
   far?" and say how long there is to train; Calisthenics should ask which
   skills (a handstand push-up...) and give the steps to get there, like
   pike push-ups first. Asked as a pop-up right after the goal is picked in
   the Workout quiz, and kept as a card on Workout ("Your focus") where it
   can be changed and where the steps are ticked off.

   The guidance follows common practice: periodised blocks for an event
   (base, build, peak, taper) with the long ride growing toward the event;
   progression ladders for calisthenics skills (move on at the target, 3
   sets, skills first when fresh); for climbing, finger strength only after
   a year of climbing, with antagonist work. Saved in KP 'goalPlus'.
   ===================================================================== */
window.KovaGoalPlus=(function(){
  'use strict';
  var DAY=864e5;
  function kp(k){ try{ return window.KP?KP.get(k):null; }catch(e){ return null; } }
  function kset(k,v){ try{ if(window.KP) KP.set(k,v); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function st(){ var s=kp('goalPlus'); return s&&typeof s==='object'?s:{}; }
  function put(patch){ var s=Object.assign(st(),patch); kset('goalPlus',s); return s; }
  function gid(){ try{ return window.KovaGoal&&KovaGoal.id?KovaGoal.id():null; }catch(e){ return null; } }
  function kind(g){ return g==='hiking'?'hike':g==='hikebike'?'cycle':g==='calisthenics'?'calis':null; }

  /* ---------------- hiking ---------------- */
  var HIKE=[
    {id:'day',n:'Day hikes',s:'Longer, steeper days with a day pack',f:'Legs for the climb, knees for the way down, and the engine for 4 to 8 hours.',
     w:[['Long hike','Add about 10% more time, or 150 m (500 ft) more climbing, each week, carrying the pack you will use.'],['Hill session','30 to 45 min of steady climbing: stairs, an incline treadmill at 10 to 15%, or hill repeats.'],['Strength, 2 days','Step-ups 3x10 a leg, slow step-downs 3x8, split squats 3x8, calf raises 3x15.']]},
    {id:'pack',n:'Backpacking',s:'Multi-day trips with a loaded pack',f:'Carrying a heavy pack for hours, day after day.',
     w:[['Weighted hike','Start at half your trip pack weight and add 1 to 2 kg (2 to 4 lb) a week until you carry the full load.'],['Back-to-back days','Once a month, hike two days in a row. That is what a trip feels like.'],['Strength, 2 days','Trap-bar or regular deadlift 3x5, step-ups with the pack 3x10, farmer carries 3x40 m, plank 3x45 s.']]},
    {id:'peak',n:'Mountains and peaks',s:'Big climbs, altitude, scrambling',f:'Climbing power for 1,000 m (3,300 ft) days, and lungs for thin air.',
     w:[['Long climb','Build total climbing toward your summit day: about 60 to 70% of it three weeks out.'],['Uphill intervals','6 to 8 x 4 min hard uphill, 3 min easy back down (stairs or incline).'],['Strength, 2 days','Weighted step-ups 3x8, Bulgarian split squats 3x8, single-leg RDL 3x8, slow step-downs 3x8.']]},
    {id:'rock',n:'Rock climbing',s:'Sport, trad or top-rope routes',f:'Finger strength, pulling power and body tension, with the opposite muscles kept strong so shoulders and elbows last.',
     w:[['Climb, 2 to 3 days','One session on routes at your limit, one for volume on easier routes, plus technique drills.'],['Fingers (after a year of climbing)','Hangboard: 6 x 10 s hangs on a 20 mm edge, 3 min rest. Never on sore fingers.'],['Strength, 2 days','Pull-ups 3x5 to 8, tuck front lever 3x10 s, push-ups 3x10, reverse wrist curls and shoulder external rotation 2x15.']]},
    {id:'boulder',n:'Bouldering',s:'Short, powerful problems',f:'Maximum power, finger strength and core tension.',
     w:[['Limit bouldering, 2 days','Problems you fall off. Rest 3 to 5 min between hard tries; stop when your tries get worse.'],['Power','Explosive pull-ups 3x3 and hanging knee raises 3x8. Campus board only if you have climbed for years.'],['Strength, 1 to 2 days','Weighted pull-ups 3x5, push-ups 3x10, reverse wrist curls 2x15, shoulder external rotation 2x15.']]}
  ];

  /* ---------------- cycling ---------------- */
  var RACE=[['road','Road race'],['tt','Time trial'],['gravel','Gravel race'],['mtb','Mountain bike (XC)'],['fondo','Gran fondo or century'],['tri','Triathlon']];
  /* weeks a rider with regular riding usually needs, by distance */
  function needWeeks(km){ return km<50?6:km<100?8:km<161?12:16; }
  function phase(w){ return w>=13?'Base':w>=7?'Build':w>=3?'Peak':w>=1?'Taper':w===0?'Race week':'Done'; }
  function weeksTo(date){ var t=new Date(date+'T12:00:00').getTime(); if(!isFinite(t)) return null; var d0=new Date(); d0.setHours(12,0,0,0); return Math.floor((t-d0.getTime())/(7*DAY)); }
  function mi(km){ return Math.round(km*0.621371); }
  function d2(km){ return Math.round(km)+' km ('+mi(km)+' mi)'; }
  function cyclePlan(c){
    var km=+c.km||0, w=weeksTo(c.date), ph=phase(w), need=needWeeks(km);
    var frac={Base:0.5,Build:0.7,Peak:0.9,Taper:0.5,'Race week':0.3}[ph]||0.6;
    var spd=c.hours>0&&km>0?km/c.hours:null;
    var S=[];
    if(ph==='Base') S=[['Long ride','About '+d2(km*frac)+' at an easy pace you could talk through (zone 2). Add 10% a week.'],['Two endurance rides','60 to 90 min easy, zone 2. This is where the engine is built.'],['Strength, 2 days','Squats 3x5, Romanian deadlifts 3x6, single-leg step-ups 3x8. Heavy legs make each pedal stroke cheaper.']];
    else if(ph==='Build') S=[['Threshold','2 x 15 to 20 min at 95 to 100% of FTP: hard but steady, a few words at a time.'],['VO2 max','5 x 4 min at 110 to 120% of FTP, 4 min easy between.'],['Long ride','About '+d2(km*frac)+', the last hour at race effort'+(spd?' ('+Math.round(spd)+' km/h, '+mi(spd)+' mph)':'')+'.']];
    else if(ph==='Peak') S=[['Race pace','3 x 20 min at your race pace'+(spd?' ('+Math.round(spd)+' km/h, '+mi(spd)+' mph)':'')+', 5 min easy between.'],['Longest ride','About '+d2(km*frac)+' about three weeks out, eating and drinking what you will on the day.'],['Strength, 1 day','Keep it short and heavy: squats 2x5, step-ups 2x6. Nothing new now.']];
    else if(ph==='Taper') S=[['Ride less','About 40 to 50% less riding than your biggest weeks. Keep the intensity, lose the volume.'],['Openers','Two short rides with 3 x 1 min hard. Sharp, not tired.'],['Rest','A full rest day two days before the event; an easy spin the day before.']];
    else if(ph==='Race week') S=[['This week','Easy spins, one short opener, sleep and carbohydrate. The work is done.'],['On the day','Start slower than you want to. Eat every 30 to 45 min and drink to thirst.'],['After','An easy week. Then tell Kova your next one.']];
    var note=w==null?'':w<need&&ph!=='Done'?'That is '+w+' week'+(w===1?'':'s')+'. A ride of '+d2(km)+' usually takes about '+need+' weeks to prepare for, coming from regular riding, so this plan starts later in the cycle and grows the long ride faster. If long rides are new to you, a later event is kinder.':'Enough time: about '+need+' weeks is typical for '+d2(km)+', and you have '+w+'.';
    return {w:w,ph:ph,need:need,s:S,note:note,spd:spd};
  }

  /* ---------------- calisthenics ---------------- */
  var SKILL=[
    {id:'hspu',n:'Handstand push-up',why:'Shoulders, triceps and upper chest, balanced overhead.',L:[['Pike push-up','3 x 8','3 x 12 clean, head to the floor'],['Feet-raised pike push-up','3 x 6 to 8','3 x 10 with feet on a box'],['Wall handstand hold','3 x 30 s','3 x 45 s, belly to the wall, arms locked'],['Wall handstand push-up negatives','3 x 3, 4 s down','3 x 5 slow and controlled'],['Partial wall HSPU (to a pad)','3 x 4 to 6','3 x 6 with the pad lowered'],['Full wall handstand push-up','3 x 3 to 5','3 x 8'],['Freestanding handstand practice','10 min a day','a 20 s freestanding hold'],['Freestanding handstand push-up','3 x 1 to 3','you have it']]},
    {id:'mu',n:'Muscle-up',why:'Pulling power that turns into a dip at the top.',L:[['Pull-ups','3 x 8','3 x 12'],['Chest-to-bar pull-ups','3 x 5','3 x 8'],['Explosive high pull-ups','3 x 4','the bar reaches your lower chest'],['Straight-bar dips','3 x 8','3 x 12'],['Muscle-up negatives','3 x 3, slow','3 x 5 controlled'],['Band-assisted muscle-ups','3 x 3','3 x 5 with a light band'],['Muscle-up singles','3 x 1 to 2','3 clean in a row'],['Muscle-ups','3 x 3 to 5','you have it']]},
    {id:'fl',n:'Front lever',why:'Lats, abs and straight-arm strength.',L:[['Tuck front lever','3 x 10 to 15 s','3 x 20 s'],['Advanced tuck','3 x 10 s','3 x 15 s, back flat'],['One leg out','3 x 8 s each leg','3 x 12 s'],['Straddle front lever','3 x 6 s','3 x 10 s'],['Full front lever','3 x 5 s','3 x 10 s']]},
    {id:'pl',n:'Planche',why:'Shoulders and straight-arm pushing strength. The slowest skill to build.',L:[['Planche lean','3 x 20 s','shoulders well past the hands for 30 s'],['Frog stand','3 x 20 s','3 x 30 s'],['Tuck planche','3 x 8 to 10 s','3 x 15 s'],['Advanced tuck planche','3 x 8 s','3 x 12 s, back flat'],['Straddle planche','3 x 5 s','3 x 8 s'],['Full planche','3 x 3 to 5 s','you have it']]},
    {id:'pistol',n:'Pistol squat',why:'Single-leg strength, balance and ankle mobility.',L:[['Box pistol (to a bench)','3 x 6 each leg','3 x 10 to a low box'],['Pistol holding a counterweight','3 x 5 each leg','3 x 8'],['Full pistol squat','3 x 5 each leg','3 x 8'],['Weighted pistol','3 x 5 each leg','you have it']]},
    {id:'lsit',n:'L-sit',why:'Abs, hip flexors and locked-out triceps.',L:[['Tuck L-sit','3 x 15 s','3 x 20 s'],['One leg straight','3 x 10 s each','3 x 15 s'],['Full L-sit','3 x 10 s','3 x 20 s'],['V-sit progressions','3 x 5 s','you have it']]},
    {id:'pullup',n:'First (or more) pull-ups',why:'The base of every pulling skill.',L:[['Dead hang','3 x 30 s','3 x 45 s'],['Scapula pulls','3 x 10','3 x 12 with straight arms'],['Pull-up negatives','3 x 5, 5 s down','3 x 6 slow'],['Band-assisted pull-ups','3 x 6','3 x 8 with a light band'],['Pull-ups','3 x as many as clean','3 x 10'],['Weighted pull-ups','3 x 5','you have it']]}
  ];
  function skill(id){ return SKILL.filter(function(x){ return x.id===id; })[0]; }

  /* ---------------- drawing ---------------- */
  function chip(on,attrs,label){ return '<button class="chip gp-chip'+(on?' on':'')+'" '+attrs+'>'+esc(label)+'</button>'; }
  function list(rows){ return '<div class="gp-list">'+rows.map(function(r){ return '<div class="gp-li"><b>'+esc(r[0])+'</b><span>'+esc(r[1])+'</span></div>'; }).join('')+'</div>'; }
  function hikeHtml(s){
    var cur=HIKE.filter(function(x){ return x.id===s.hike; })[0];
    return '<div class="gp-q">What kind of hiking?</div><div class="gp-chips">'+HIKE.map(function(x){ return chip(s.hike===x.id,'data-gp="hike" data-v="'+x.id+'"',x.n); }).join('')+'</div>'
      +(cur?'<div class="gp-f">'+esc(cur.f)+'</div><div class="gp-wk">Each week</div>'+list(cur.w):'<div class="gp-f none">Pick one and Kova writes your week for it.</div>');
  }
  function cycleHtml(s){
    var c=s.cycle||{};
    var h='<div class="gp-q">Do you compete?</div><div class="gp-chips">'+chip(c.compete===true,'data-gp="comp" data-v="1"','Yes, I race')+chip(c.compete===false,'data-gp="comp" data-v="0"','No, I ride for fitness')+'</div>';
    if(c.compete===false) return h+'<div class="gp-f">Riding for fitness: most of your riding easy (you can talk), one harder session, and one long ride that grows about 10% a week.</div>'
      +list([['Long ride','Start where you are comfortable, add 10% a week; every fourth week, ride less.'],['One hard session','4 x 4 min hard, 4 min easy, or a hilly route ridden steadily hard.'],['Strength, 2 days','Squats 3x5, Romanian deadlifts 3x6, step-ups 3x8.']]);
    if(c.compete!==true) return h;
    h+='<div class="gp-q">What do you race?</div><div class="gp-chips">'+RACE.map(function(r){ return chip(c.type===r[0],'data-gp="type" data-v="'+r[0]+'"',r[1]); }).join('')+'</div>'
      +'<div class="gp-form"><label>Event date<input type="date" class="field" data-gpf="date" value="'+esc(c.date||'')+'"></label>'
      +'<label>Distance<span class="gp-in"><input type="number" inputmode="decimal" class="field" data-gpf="dist" value="'+esc(c.dist||'')+'" placeholder="100"><select class="field" data-gpf="unit"><option value="km"'+(c.unit!=='mi'?' selected':'')+'>km</option><option value="mi"'+(c.unit==='mi'?' selected':'')+'>mi</option></select></span></label>'
      +'<label>Target time (optional)<input type="text" class="field" data-gpf="time" value="'+esc(c.time||'')+'" placeholder="3:30 (hours:minutes)"></label></div>';
    var km=c.dist>0?(c.unit==='mi'?c.dist/0.621371:+c.dist):0;
    if(!c.date||!km) return h+'<div class="gp-f none">Add the date and distance and Kova counts down to it.</div>';
    var hm=/^(\d{1,2})(?::(\d{2}))?$/.exec(String(c.time||'').trim()), hours=hm?(+hm[1])+(+(hm[2]||0))/60:0;
    var P=cyclePlan({km:km,date:c.date,hours:hours});
    if(P.w==null) return h;
    if(P.ph==='Done') return h+'<div class="gp-f">That date has passed. Add your next event.</div>';
    return h+'<div class="gp-cd"><div class="gp-big">'+P.w+'<small> week'+(P.w===1?'':'s')+' to go</small></div><div class="gp-ph">'+esc(P.ph)+' phase'+(P.spd?' · race pace '+Math.round(P.spd)+' km/h ('+mi(P.spd)+' mph)':'')+'</div></div>'
      +'<div class="gp-f">'+esc(P.note)+'</div><div class="gp-wk">This week</div>'+list(P.s);
  }
  function calisHtml(s){
    var C=s.calis||{skills:[],at:{}}, mine=C.skills||[];
    var h='<div class="gp-f">Calisthenics is built on strong shoulders, chest and upper back: pull-ups, dips, push-ups and rows, 3 sets each, two or three times a week. Practise skills first in a session, while you are fresh.</div>'
      +'<div class="gp-q">Which skills do you want?</div><div class="gp-chips">'+SKILL.map(function(x){ return chip(mine.indexOf(x.id)>=0,'data-gp="skill" data-v="'+x.id+'"',x.n); }).join('')+'</div>';
    mine.forEach(function(id){
      var k=skill(id); if(!k) return; var i=Math.max(0,Math.min(k.L.length-1,(C.at||{})[id]||0)), L=k.L[i];
      h+='<div class="gp-sk"><div class="gp-skh"><b>'+esc(k.n)+'</b><span>Step '+(i+1)+' of '+k.L.length+'</span></div>'
        +'<div class="gp-skw">'+esc(k.why)+'</div>'
        +'<div class="gp-step"><div class="gp-sn">'+esc(L[0])+'</div><div class="gp-sp">'+esc(L[1])+'</div><div class="gp-mo">Move on when: '+esc(L[2])+'</div></div>'
        +(k.L[i+1]?'<div class="gp-next">Next: '+esc(k.L[i+1][0])+'</div>':'')
        +'<div class="gp-row">'+(i>0?'<button class="gp-link" data-gp="back" data-v="'+id+'">Back a step</button>':'')
        +(k.L[i+1]?'<button class="btn gp-btn" data-gp="up" data-v="'+id+'">I can do this: next step</button>':'')+'</div></div>';
    });
    return h;
  }
  function body(g){ var s=st(), k=kind(g); return k==='hike'?hikeHtml(s):k==='cycle'?cycleHtml(s):k==='calis'?calisHtml(s):''; }
  function title(g){ return kind(g)==='hike'?'Your hiking':kind(g)==='cycle'?'Your riding':'Your skills'; }

  /* the card on Workout, under "Built around" */
  function slot(){
    var s=document.getElementById('gpSlot'), a=document.getElementById('goalSlot');
    if(!s&&a&&a.parentNode){ s=document.createElement('div'); s.id='gpSlot'; s.className='kl-keep'; a.parentNode.insertBefore(s,a.nextSibling); }
    return s;
  }
  function paint(){
    var s=slot(); if(!s) return; var g=gid();
    if(!kind(g)){ s.innerHTML=''; return; }
    s.innerHTML='<div class="card gp" data-gpw="card"><div class="gp-t">'+esc(title(g))+'</div>'+body(g)+'</div>';
  }
  /* the pop-up, right after the goal is picked */
  function ask(g){
    if(!kind(g)||!window.openSheet) return;
    openSheet('<div class="grab"></div><div class="gp" data-gpw="sheet"><div class="title-s" style="font-size:19px;margin-bottom:4px">'+esc(title(g))+'</div><div class="sub" style="margin-bottom:10px">One more question, so your plan fits what you actually do.</div><div id="gpSheet">'+body(g)+'</div>'
      +'<button class="btn" data-gp="done" style="margin-top:12px">Done</button></div>');
    put({asked:Object.assign({},st().asked||{},(function(o){ o[g]=Date.now(); return o; })({}))});
  }
  function repaint(){ var g=gid()||pendingGoal; var sh=document.getElementById('gpSheet'); if(sh) sh.innerHTML=body(g); paint(); }

  function act(a,v){
    var s=st();
    if(a==='hike') put({hike:v});
    else if(a==='comp') put({cycle:Object.assign({},s.cycle||{},{compete:v==='1'})});
    else if(a==='type') put({cycle:Object.assign({},s.cycle||{},{type:v})});
    else if(a==='skill'){ var C=Object.assign({skills:[],at:{}},s.calis||{}), i=C.skills.indexOf(v); if(i>=0) C.skills.splice(i,1); else C.skills.push(v); put({calis:C}); }
    else if(a==='up'||a==='back'){ var C2=Object.assign({skills:[],at:{}},s.calis||{}), k=skill(v); C2.at=Object.assign({},C2.at||{}); var n=(C2.at[v]||0)+(a==='up'?1:-1); C2.at[v]=Math.max(0,Math.min(k.L.length-1,n)); put({calis:C2}); if(a==='up') say('Next step: '+k.L[C2.at[v]][0]+'.'); }
    else if(a==='done'){ if(window.closeSheet) closeSheet(); return paint(); }
    repaint();
  }
  document.addEventListener('click',function(e){ var b=e.target.closest&&e.target.closest('[data-gp]'); if(!b) return; act(b.getAttribute('data-gp'),b.getAttribute('data-v')); });
  document.addEventListener('change',function(e){
    var f=e.target.closest&&e.target.closest('[data-gpf]'); if(!f) return;
    var c=Object.assign({},st().cycle||{}), k=f.getAttribute('data-gpf'), v=f.value;
    if(k==='dist') c.dist=parseFloat(v)||0; else c[k]=v;
    put({cycle:c}); repaint();
  });

  /* the Workout quiz: right after Hiking, Cycling or Calisthenics is picked */
  var pendingGoal=null, MAP={'Hiking':'hiking','Cycling':'hikebike','Calisthenics':'calisthenics'};
  document.addEventListener('click',function(e){
    var o=e.target.closest&&e.target.closest('#qBody .qopt'); if(!o) return;
    var t=(o.querySelector('.exname')||o).textContent.trim(), g=null;
    Object.keys(MAP).forEach(function(n){ if(t.indexOf(n)===0) g=MAP[n]; });
    if(g){ pendingGoal=g; setTimeout(function(){ ask(g); },250); }
  },true);
  document.addEventListener('kova:screen',function(e){ if(e&&e.detail==='move') paint(); });
  setTimeout(paint,0);

  return {paint:paint,ask:ask,state:st,cyclePlan:cyclePlan,weeksTo:weeksTo,phase:phase,needWeeks:needWeeks,HIKE:HIKE,SKILL:SKILL,RACE:RACE,_act:act};
})();
