/* KovaGoal (p29) - one goal, everywhere.

   What you train for (the Workout quiz: "Swim stronger", "Lean and
   defined", "Hike bigger days"...) now steers every pillar instead of only
   the lifting split:

   - Workout: a "Built around" card. Train / Eat / Sleep each say what this
     goal asks of them. For a sport the whole week is written out (laps,
     drills, intervals, the long day), each session opens to the full set,
     and "How to get faster" covers technique, what to swim / which trails /
     where and how far to ride, and the gym work for it. Your test number
     (CSS, 5K, climb rate, FTP) sets every pace (KovaSport does the maths).
   - Machine scan and Form Check: sets, reps and rest follow the goal, a
     line says why that machine matters for your sport, and "Add to my
     program" really adds it to the right day of your plan.
   - Fuel and Sleep: what the goal asks of food and sleep, with grams from
     your own bodyweight and your own sleep average when Kova has them.
     Nothing is invented: with no weight or no nights, it says so. */
window.KovaGoal=(function(){
  'use strict';
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function kp(k){ try{ return window.KP?KP.get(k):null; }catch(e){ return null; } }

  var NAME={bodybuilding:'Build my physique',athletic:'Power and speed',showprep:'Get stage-ready',powerlifting:'Lift the heaviest weight',
    weightloss:'Lose fat, keep muscle',toning:'Lean and defined',health:'Stay strong and mobile',calisthenics:'Bodyweight strength and skills',
    endurance:'Run farther or faster',swimming:'Swim stronger',hiking:'Hike bigger days',hikebike:'Ride stronger'};
  var SPORT={endurance:'running',swimming:'swimming',hiking:'hiking',hikebike:'riding'};
  var UNIT={endurance:'run',swimming:'swim',hiking:'hike',hikebike:'ride'};

  /* the quiz is the truth; the Customize goal pill is the fallback */
  function id(){
    var q=kp('quiz'); if(q&&q.goal&&window.__kovaModeId) return __kovaModeId(q.goal);
    if(q&&q.goal) return String(q.goal);
    return null;
  }
  function name(g){ return NAME[g||id()]||'Your goal'; }
  function isSport(g){ return !!SPORT[g||id()]; }
  function bwKg(){
    try{ var m=window.KovaMaint&&KovaMaint.prof(); if(m&&m.kg) return m.kg; }catch(e){}
    var q=kp('quiz'); if(q&&q.a&&q.a.bw) return q.a.bw*0.45359237;
    return null;
  }
  function sleepAvg(){
    try{ var N=window.KovaSleepLog?KovaSleepLog.nights().slice(-7):[]; if(N.length>=3) return {h:N.reduce(function(a,n){ return a+n.mins; },0)/N.length/60,n:N.length}; }catch(e){}
    return null;
  }
  function hm(h){ var m=Math.round(h*60); return Math.floor(m/60)+' h '+(m%60?(m%60)+' min':''); }

  /* ---------- what each goal asks of training, food and sleep ----------
     protein: g per kg of bodyweight (ISSN 2017 position stand ranges; the
     higher end in a diet). sleep: hours (AASM adult 7+, athletes 8-9). */
  var INFO={
    bodybuilding:{train:'Lifting 4–5 days, 8–12 reps',eat:'A small surplus and protein at every meal',p:[1.6,2.2],s:[7,9],
      eatL:'To add muscle, eat a little more than you burn: gain about 0.25% of your weight a week. Faster than that is mostly fat. Spread protein over 3 to 5 meals.',
      sleepL:'Muscle is repaired and built while you sleep. Short nights mean weaker sessions and slower gains.'},
    showprep:{train:'Keep lifting heavy while cardio rises',eat:'A slow, steady deficit with high protein',p:[2.0,2.5],s:[7,9],
      eatL:'Lose about 0.5 to 1% of your weight a week. Protein stays high so the muscle stays while the fat comes off.',
      sleepL:'Dieting makes sleep lighter. Protect the hours: short sleep in a diet makes more of what you lose come from muscle.'},
    athletic:{train:'Sprints, jumps and fast lifts first',eat:'Carbs around training, protein at each meal',p:[1.6,2.0],s:[8,9],
      eatL:'Fast, hard efforts run on carbohydrate. Eat carbs in the meal before training and protein within a couple of hours after.',
      sleepL:'Speed, reaction time and accuracy drop after short nights. Eight to nine hours is the target in hard weeks.'},
    powerlifting:{train:'Heavy squat, bench and deadlift',eat:'Enough to recover, a tiny surplus',p:[1.6,2.2],s:[7,9],
      eatL:'Strength grows best at or slightly above maintenance. A deep diet costs strength on the bar.',
      sleepL:'Heavy days need recovery. Most people lift worse after a short night, so sleep is part of the program.'},
    weightloss:{train:'Lift 3–4 days, plus cardio and steps',eat:'A steady deficit, protein high',p:[1.8,2.2],s:[7,9],
      eatL:'Eat a bit less than you burn, about 0.5% of your weight a week. High protein and lifting tell your body to keep its muscle.',
      sleepL:'In a study of dieters, short sleep made far more of the weight lost come from muscle instead of fat. Sleep is part of the diet.'},
    toning:{train:'Lift 3–4 days at 10–15 reps, plus cardio',eat:'A small deficit, protein high',p:[1.8,2.2],s:[7,9],
      eatL:'"Lean and defined" is a little more muscle plus a little less fat. Eat slightly under what you burn (about 0.3% of your weight a week) and keep protein high.',
      sleepL:'Short sleep raises hunger the next day and, in a diet, costs muscle. Seven to nine hours makes the deficit easier.'},
    health:{train:'Full body 2–3 days, plus walks',eat:'Mostly whole foods, protein at each meal',p:[1.2,1.6],s:[7,9],
      eatL:'No tracking needed: protein at each meal, vegetables most meals, water first. Your Fuel log shows what you actually eat.',
      sleepL:'Seven to nine hours, and the same bed and wake time every day. Regular hours matter as much as total hours.'},
    calisthenics:{train:'Bodyweight skills, harder moves over time',eat:'Stay near your weight, protein at each meal',p:[1.6,2.0],s:[7,9],
      eatL:'Every pound you add makes pull-ups and dips harder, so most people progress best near their current weight.',
      sleepL:'Skills are learned between sessions. Sleep is when practice turns into control.'},
    endurance:{train:'Runs: mostly easy, one hard, one long',eat:'Carbs before long and hard runs',p:[1.4,1.8],s:[8,9],
      eatL:'Eat carbs in the meal before long and hard runs. On runs longer than about 75 minutes, take 30 to 60 g of carbs an hour (a gel is about 22 to 25 g). Protein within a couple of hours after.',
      sleepL:'High-mileage weeks need more sleep. If your resting heart rate is up and HRV is down in the morning, make that day easy.'},
    swimming:{train:'Swims through the week, plus 2 dryland days',eat:'Carbs before swims, protein after',p:[1.4,1.8],s:[8,9],
      eatL:'A carb snack 1 to 2 hours before you swim (toast, a banana, oats), then a meal with protein within about an hour after. Swimming makes most people very hungry: plan the meal so it is not the vending machine.',
      sleepL:'Early-morning swims cut nights short. Go to bed earlier on those nights instead of skipping the swim.'},
    hiking:{train:'Easy hikes, one uphill day, one long day',eat:'On the trail: a snack and 0.5 L of water every hour',p:[1.4,1.8],s:[7,9],
      eatL:'On long hikes eat about 200 to 300 calories an hour (nuts, bars, fruit, a sandwich), and drink about 0.5 L (16 oz) of water an hour, more in heat. Add salt or electrolytes on hot days.',
      sleepL:'A big day on your feet needs sleep to repair your legs. Sleep well before a long hike and take an extra hour the night after.'},
    hikebike:{train:'Easy rides, 1–2 hard, 1 long',eat:'Long rides: 30–60 g of carbs an hour',p:[1.4,1.8],s:[8,9],
      eatL:'Rides over 90 minutes: eat 30 to 60 g of carbs every hour (a banana is about 27 g) and drink a bottle an hour. Running out of energy on a ride is a food problem, not a fitness problem.',
      sleepL:'Recovery happens asleep. If your morning resting heart rate is up and HRV is down, make that ride easy.'}
  };

  /* ---------- sets, reps and rest for one exercise, by goal ---------- */
  var RX={bodybuilding:{s:3,note:'Stop each set 1–2 reps before you could not do another.'},
    showprep:{s:3,note:'Keep lifting the weights you use now while calories come down.'},
    athletic:{s:4,note:'Move the weight fast. End the set when the speed drops.'},
    powerlifting:{s:4,note:'Machines are extra work here. The main lifts come first.'},
    weightloss:{s:3,note:'Real effort on every set is what keeps your muscle in a diet.'},
    toning:{s:3,note:'Close to failure on the last set: the look comes from muscle plus less fat.'},
    health:{s:2,note:'Leave 2–3 reps in the tank. You should feel better after, not wrecked.'},
    calisthenics:{s:3,note:'Use it to build strength for your bodyweight moves.'},
    endurance:{s:3,note:'Heavy-ish and low reps build strength without bulk. Never the day before a hard run.'},
    swimming:{s:3,note:'Moderate weight to protect your shoulders.'},
    hiking:{s:3,note:'Lower slowly on every rep: that is what saves your knees on the way down.'},
    hikebike:{s:3,note:'Heavy-ish legs make each pedal stroke cheaper. Keep it away from hard rides.'}};
  var REPS={bodybuilding:[[8,12],[10,15],'1.5–2 min'],showprep:[[6,10],[10,15],'1.5–2 min'],athletic:[[3,6],[8,12],'2–3 min'],
    powerlifting:[[3,5],[8,12],'3–5 min'],weightloss:[[8,12],[10,15],'1–1.5 min'],toning:[[10,15],[12,15],'45–75 s'],
    health:[[10,15],[12,15],'1–1.5 min'],calisthenics:[[6,12],[10,15],'1–2 min'],endurance:[[5,8],[10,15],'1.5–2 min'],
    swimming:[[8,12],[12,15],'1–1.5 min'],hiking:[[8,12],[12,15],'1–1.5 min'],hikebike:[[5,8],[10,15],'1.5–2 min']};
  function kindOf(n){
    n=String(n||'');
    if(/treadmill|bike|cycle|rowing|rower|stair|elliptical/i.test(n)) return 'cardio';
    if(/press|squat|row|pulldown|pull ?up|chin|smith|deadlift|lunge|dip|step|rack|cage|bench|barbell|thrust|swing|carry/i.test(n)) return 'comp';
    return 'iso';
  }
  function rx(n,g){
    g=g||id()||'bodybuilding';
    var R=RX[g]||RX.bodybuilding, P=REPS[g]||REPS.bodybuilding, k=kindOf(n), r=k==='comp'?P[0]:P[1];
    try{ var G=window.KovaPlan&&KovaPlan.goals&&KovaPlan.goals[g]; if(G&&G.rep){ r=k==='comp'?G.rep.comp:G.rep.iso; } }catch(e){}
    return {s:k==='comp'?R.s:Math.max(2,R.s-(R.s>3?1:0)),r:r[0]+'-'+r[1],rest:P[2],note:R.note,kind:k,goal:g};
  }

  /* ---------- why this machine matters for your sport ---------- */
  var WHY={
    swimming:[[/rowing|rower|erg/i,'A good dryland machine: the same leg drive and pull as a stroke, and easy on the shoulders.'],
      [/lat|pulldown|pull ?up|chin/i,'This is the swimming pull. Your lats drive every freestyle stroke.'],
      [/row|rhomboid|rear delt|face pull/i,'Rows balance your shoulders. Swimmers need more pulling than pushing, about two to one.'],
      [/shoulder press|overhead/i,'Keep this light. Your shoulders already do thousands of strokes a week; rotator cuff work matters more.'],
      [/chest|pec/i,'Some chest work is fine. Keep it below your pulling so your shoulders stay healthy.'],
      [/leg press|squat|quad|smith|hack/i,'Strong legs give you a harder push off every wall and a faster start.'],
      [/hamstring|glute|curl/i,'Glutes and hamstrings help hold your hips high in the water, which cuts drag.'],
      [/abduct|adduct/i,'Hip strength powers the breaststroke kick.'],
      [/treadmill|elliptical|stair|bike/i,'Easy cardio on days off from the pool that rests your shoulders.']],
    hiking:[[/stair|step/i,'The closest thing to a trail in a gym. Climb without leaning on the rails.'],
      [/treadmill/i,'Set a 10 to 15% incline: incline walking is the best indoor hike training.'],
      [/leg press|squat|quad|smith|hack|extension/i,'Quads lift you up the climb and brake you on the way down. Lower slowly: that is your descent training.'],
      [/hamstring|curl|glute|deadlift/i,'Glutes and hamstrings push you up steep steps.'],
      [/calf/i,'Calves and ankles carry you over rocks and roots.'],
      [/abduct|adduct/i,'Side hip strength keeps your knees steady on uneven ground.'],
      [/lat|row|pulldown|back/i,'Upper-back strength carries the pack and helps with poles.'],
      [/bike|elliptical/i,'Easy on the knees: good recovery cardio between hikes.'],
      [/chest|press|pec|shoulder/i,'Not the priority for hiking. Keep it short and save your energy for legs.']],
    hikebike:[[/bike|cycle/i,'Your sport, indoors. Use it for easy zone 2 rides and sweet-spot intervals on bad-weather days.'],
      [/leg press|squat|quad|smith|hack|extension/i,'Quads push the pedals down. Heavy-ish sets make every pedal stroke cheaper.'],
      [/hamstring|curl|glute|deadlift|thrust/i,'Glutes and hamstrings add power through the whole pedal stroke.'],
      [/lat|row|pulldown|back/i,'A strong back holds your riding position on long rides without aching.'],
      [/core|abs|plank/i,'Your core is the base the legs push from. It stops you rocking on the saddle.'],
      [/treadmill|elliptical|stair/i,'Fine cross-training, but riding is what builds cycling fitness.'],
      [/chest|press|pec|shoulder/i,'Light upper-body work helps you hold the bars on long or rough rides.']],
    endurance:[[/treadmill/i,'Your sport indoors. Good for easy runs and controlled intervals.'],
      [/calf/i,'Calves take most of the load on every stride. Strong calves protect your Achilles.'],
      [/leg press|squat|quad|smith|hack/i,'Heavy, low-rep leg work makes each stride cheaper without adding bulk.'],
      [/hamstring|curl|glute|deadlift/i,'Glutes and hamstrings drive you forward and protect your knees.'],
      [/abduct|adduct/i,'Side hip strength keeps your knees tracking straight.'],
      [/bike|elliptical|stair|rowing|rower/i,'Easy cross-training: fitness without the pounding.'],
      [/lat|row|pulldown|back|chest|press|pec|shoulder/i,'Upper body is a small part of running. A few sets keeps your posture tall late in a race.']]
  };
  function why(m,g){
    g=g||id(); var L=WHY[g]; if(!L||!m) return '';
    var t=[m.n,m.k,(m.pri||[]).join(' '),(m.sec||[]).join(' ')].join(' ');
    for(var i=0;i<L.length;i++) if(L[i][0].test(t)) return L[i][1];
    return '';
  }

  /* what to do on a cardio machine, by goal */
  var CARDIO={
    treadmill:{hiking:[['Incline walk','10–15% incline, 45–75 min at a pace you could talk through'],['Uphill intervals','15% incline: 5 × 4 min hard, 3 min easy between']],
      endurance:[['Easy run','25–40 min at a pace you could talk in full sentences'],['Intervals','6 × 3 min comfortably hard, 2 min easy jog between']]},
    bike:{hikebike:[['Endurance ride','60–90 min easy (zone 2: you can still talk)'],['Sweet spot','3 × 12 min at 88–93% of FTP, 5 min easy between']],
      hiking:[['Easy spin','30–45 min, easy on the knees between hikes']]},
    rowing:{swimming:[['Steady row','20–30 min steady, about 22–26 strokes a minute'],['Intervals','5 × 500 m hard, 2 min easy between']]},
    stair:{hiking:[['Steady climb','20–40 min at a pace you can hold without the rails'],['Climb intervals','6 × 3 min hard, 2 min easy between']]},
    all:[['Zone 2','30–45 min at a pace you could talk through'],['Intervals','8 × 1 min hard, 2 min easy between']]
  };
  function cardioFor(n,g){
    var k=/treadmill/i.test(n)?'treadmill':/bike|cycle/i.test(n)?'bike':/rowing|rower/i.test(n)?'rowing':/stair/i.test(n)?'stair':'other';
    return (CARDIO[k]&&CARDIO[k][g])||CARDIO.all;
  }

  /* best moves with a free-weight tool, by sport */
  var BEST={
    swimming:{dumbbell:['Single arm DB row','Bulgarian split squat','Goblet squat'],barbell:['Romanian deadlift','Barbell row'],cable:['Straight arm pulldown','Lat pulldown','Cable face pull','Pallof press'],bodyweight:['Pull up','Chin up','Push up','Plank']},
    hiking:{dumbbell:['Step up','Bulgarian split squat','Farmer carry','Walking lunge'],barbell:['Romanian deadlift','Hip thrust'],cable:['Pallof press','Cable face pull'],bodyweight:['Single leg calf raise','Glute bridge','Plank']},
    hikebike:{dumbbell:['Bulgarian split squat','Step up','Goblet squat'],barbell:['Barbell back squat','Romanian deadlift','Hip thrust'],cable:['Pallof press','Cable row'],bodyweight:['Plank','Back extension','Glute bridge']},
    endurance:{dumbbell:['Bulgarian split squat','Step up','Walking lunge'],barbell:['Romanian deadlift','Hip thrust','Barbell back squat'],cable:['Pallof press'],bodyweight:['Single leg calf raise','Glute bridge','Plank']}
  };

  /* ---------- add one exercise to the right day of your plan ---------- */
  var MOVE={'Seated cable row':'Cable row','Lying or seated leg curl':'Seated leg curl','Pec deck / chest fly':'Pec deck','Hip abduction / adduction machine':'Abduction machine'};
  function dayFor(name){
    var m='';
    try{ m=(window.KSESS&&KSESS.lib)?(KSESS.lib(name).m||''):''; }catch(e){}
    var t=(name+' '+m).toLowerCase();
    if(/quad|ham|glute|calf|leg|squat|deadlift|lunge|step|thrust|hip|abduct/.test(t)) return /leg|lower|squat|hinge|climb|down|strength|start/i;
    if(/back|lat|row|pull|chin|bicep|rear/.test(t)) return /pull|back|row|upper|posture|shoulder/i;
    if(/chest|press|pec|shoulder|tricep|dip|push/.test(t)) return /push|chest|press|upper|pack/i;
    if(/core|plank|ab|carry|pallof/.test(t)) return /core|posture|full|total/i;
    return /full|total|upper|lower/i;
  }
  function addToPlan(name,sets,reps,first){
    name=MOVE[name]||name;
    var plan=kp('plan');
    if(!plan||!plan.days||!plan.days.length) return {ok:false,need:'plan',msg:'Build your plan first, then add '+name.toLowerCase()+' to it.'};
    var want=dayFor(name), day=plan.days.filter(function(d){ return want.test(String(d.n||'')); })[0]||plan.days[0];
    day.ex=day.ex||[];
    if(day.ex.some(function(e){ return String(e.e).toLowerCase()===name.toLowerCase(); })) return {ok:false,msg:name+' is already in '+day.n+'.'};
    day.ex[first?'unshift':'push']({e:name,s:sets,r:reps});
    try{ KP.set('plan',plan); }catch(e){}
    try{ if(window.KSESS&&KSESS.reset) KSESS.reset(); }catch(e){}
    return {ok:true,day:day.n,msg:name+' added to '+day.n+(first?', first':'')+': '+sets+' × '+reps+'.'};
  }
  function addAndSay(name,sets,reps,first){
    var r=addToPlan(name,sets,reps,first);
    if(window.toast) toast(r.msg);
    if(r.need==='plan'&&typeof go==='function') setTimeout(function(){ go('quiz'); },700);
    return r;
  }

  /* ---------- the machine scan's "Where to start", by goal ---------- */
  function machine(m,ident){
    var g=id(), gen=!!m.gen, h='';
    if(!g){
      return '<div class="card kg-rx"><div class="kg-rh">Sets and reps for your goal</div>'
        +'<div class="sub kg-p">Tell Kova what you train for and every machine you scan gets sets, reps and rest for that goal.</div>'
        +'<button class="btn ghost" data-kg="quiz">Pick my goal</button></div>';
    }
    var w=why(m,g);
    if(m.cardio||kindOf(m.n)==='cardio'){
      var C=cardioFor(m.n,g);
      return '<div class="card kg-rx"><div class="kg-rh">For your goal: <b>'+esc(name(g))+'</b></div>'
        +(w?'<div class="kg-why">'+esc(w)+'</div>':'')
        +C.map(function(c){ return '<div class="kg-cs"><b>'+esc(c[0])+'</b><span>'+esc(c[1])+'</span></div>'; }).join('')
        +'<button class="kg-link" data-kg="change">Change goal</button></div>';
    }
    if(m.kind==='open'){
      var B=(BEST[g]||{})[m.eq]||[];
      var R0=rx(B[0]||'press',g);
      return '<div class="card kg-rx"><div class="kg-rh">For your goal: <b>'+esc(name(g))+'</b></div>'
        +(B.length?'<div class="sub kg-p">Best moves for your '+esc(SPORT[g])+' with this. Tap one to add it to your program.</div>'
          +'<div class="kg-chips">'+B.map(function(n){ var R=rx(n,g); return '<button class="chip kg-add" data-kg="addmove" data-n="'+esc(n)+'" data-s="'+R.s+'" data-r="'+R.r+'">'+esc(n)+' <i>'+R.s+' × '+R.r+'</i></button>'; }).join('')+'</div>'
          :'<div class="sub kg-p">Pick a movement above, then add it. Big lifts: '+R0.s+' sets of '+REPS[g][0][0]+'-'+REPS[g][0][1]+'. Smaller moves: '+rx('curl',g).s+' sets of '+REPS[g][1][0]+'-'+REPS[g][1][1]+'. Rest '+R0.rest+'.</div>')
        +'<div class="sub kg-note">'+esc(R0.note)+'</div>'
        +'<button class="kg-link" data-kg="change">Change goal</button></div>';
    }
    var R=rx(m.n,g);
    h='<div class="card kg-rx"><div class="kg-rh">For your goal: <b>'+esc(name(g))+'</b></div>'
      +'<div class="kg-grid">'+[['SETS',R.s],['REPS',R.r],['REST',R.rest]].map(function(x){ return '<div><div class="lbl">'+x[0]+'</div><b>'+esc(x[1])+'</b></div>'; }).join('')+'</div>'
      +(w?'<div class="kg-why">'+esc(w)+'</div>':'')
      +'<div class="sub kg-note">'+esc(R.note)+(gen?' These numbers come from your goal; the machine itself was read from your photo, so check its placard.':' Pick a weight you can finish the full range with.')+'</div>'
      +'<button class="kg-link" data-kg="change">Change goal</button></div>';
    return h;
  }
  function machineAdd(m){
    var g=id()||'bodybuilding';
    if(m.cardio||kindOf(m.n)==='cardio'){ if(window.toast) toast('Cardio goes in your week, not your lifting plan. The sessions above are what to do on it.'); return; }
    var n=m.n;
    if(m.kind==='open'){
      var on=document.querySelector('#mcResult .mcMove.on');
      if(!on){ if(window.toast) toast('Pick a movement above first, then add it.'); return; }
      n=on.getAttribute('data-n');
    }
    var R=rx(n,g); addAndSay(n,R.s,R.r);
  }

  /* ---------- sport guides: what to work on to get better ---------- */
  var GUIDE={
    swimming:{t:'How to swim faster',s:[
      ['The words',['A <b>length</b> is one end of the pool to the other. People say <b>lap</b> for a length or for there-and-back; Kova counts lengths.','In a 25 m pool, 4 lengths is 100 m. In a 50 m pool, 2 lengths is 100 m.','<b>CSS</b> (critical swim speed) is the pace you could hold for about 30 minutes. Your threshold sets are swum at it.','A <b>kickboard</b> is held out in front for legs-only lengths. A <b>pull buoy</b> goes between your thighs for arms-only lengths. Most pools have them to borrow.']],
      ['Which stroke',['<b>Freestyle (front crawl)</b> is the fastest stroke and the one to train for speed. Most of your laps are freestyle.','<b>Backstroke</b> is a good easy-day change: it opens up the shoulders that freestyle closes.','<b>Breaststroke</b> is the slowest. Fine for rest lengths; a wrong kick can hurt your knees.','<b>Butterfly</b> comes later: short repeats once your freestyle is solid.']],
      ['What makes you faster (in this order)',['<b>Head down, eyes on the bottom.</b> Your hips rise and drag drops. Lifting your head sinks your legs.','<b>Breathe out under water, all the time.</b> Then the breath to the side is a quick in. Holding your breath is the main reason people tire after one length.','<b>Breathe to the side</b> with one goggle still in the water. Every 3 strokes (both sides) once you can.','<b>Reach long, then catch.</b> Enter in front of your shoulder, reach, then bend the elbow and push the water back toward your feet with your forearm and hand. Back, not down.','<b>Rotate from the hips</b>, side to side, like a log rolling. It puts your back muscles into the pull.','<b>Small, fast kick from the hips</b> with loose ankles. Big knee bends slow you down.','<b>Count strokes per length.</b> Fewer strokes at the same speed means better technique. Try to hold your count as you tire.']],
      ['Drills, explained',['<b>Catch-up:</b> one hand waits in front until the other arrives. Teaches the long reach.','<b>Fingertip drag:</b> drag your fingertips along the water as the arm comes forward. Teaches a high elbow.','<b>6-kick switch:</b> 6 kicks on your side, then one stroke to the other side. Teaches rotation and balance.','<b>Side kick:</b> kick on your side, bottom arm stretched out. Teaches the breathing position.','<b>Sculling:</b> small figure-8 sweeps with the hands. Teaches the feel of holding water.']],
      ['How much to swim',['<b>Learning:</b> 2 to 3 swims of 20 to 30 minutes. Stop at the wall as often as you need.','<b>Getting fitter:</b> 3 to 4 swims of 1,500 to 2,500 m.','<b>Racing:</b> 4 to 6 swims a week.','Add about 10% a week, and every fourth week swim less. Retest CSS every 6 to 8 weeks.']],
      ['In the gym (dryland)',['<b>Pull:</b> pull-ups or lat pulldowns, and straight-arm pulldowns (the exact swimming pull).','<b>Shoulder health:</b> cable external rotations and Y-T-W raises every dryland day.','<b>Core:</b> dead bugs and planks hold your body flat in the water.','<b>Legs:</b> squats and box jumps for push-offs and starts.']],
      ['At the pool',['Pick the lane that matches your speed. In a shared lane, swim on the right side (circle swimming).','To pass, tap the swimmer’s foot and go at the wall. Rest at the side of the wall, not the middle.','Use the pace clock on the wall to time your rest. Goggles that seal properly make everything easier.']]
    ]},
    hiking:{t:'How to get better at hiking',s:[
      ['Pick the right trail',['Two numbers decide how hard a trail is: <b>distance</b> and <b>elevation gain</b> (how much you climb). Check both on the map or trail app before you go.','Divide the climb by the miles. Under 500 ft per mile is easy to moderate, 500 to 1,000 ft per mile is hard, over 1,000 ft per mile is steep.','Go up one step at a time. Change only one thing: distance, climbing or pack weight.']],
      ['Your ladder',['<b>Start:</b> 3 to 5 miles with up to 1,000 ft of climbing.','<b>Next:</b> 5 to 8 miles with 1,500 to 2,500 ft.','<b>Then:</b> 8 to 12 miles with 2,500 to 4,000 ft.','<b>Big days:</b> 12+ miles and 4,000+ ft.','Move up when the current step leaves you tired but not sore for days.']],
      ['How long it will take',['A planning rule (Naismith’s rule): about 1 hour for every 3 miles, plus 1 hour for every 2,000 ft of climbing.','Example: 8 miles with 2,000 ft of climbing is about 3 h 40 min of moving, before breaks.','Set a turn-around time and keep it, even if the top is close.']],
      ['Going up',['Short steps and a pace you could still talk at. If you are gasping, slow down: you will be faster overall.','On steep ground, use the <b>rest step</b>: pause for a split second on the straight back leg between steps.','Poles let your arms help push you up.']],
      ['Coming down (where knees get hurt)',['Short, quick steps with soft knees. Do not lock them.','Lengthen your poles for the descent and plant them ahead of you.','Stand over your feet. Leaning back makes you slip.','In the gym, slow step-downs train exactly this.']],
      ['Your pack',['Start with 10 to 15 lb. Add 2 to 3 lb a week toward about 20% of your bodyweight for long day hikes.','Tighten the hip belt so your hips carry most of the weight, not your shoulders.']],
      ['Food, water and feet',['About 0.5 L (16 oz) of water an hour, more in heat. Eat a snack every hour on long hikes.','Shoes broken in before a big hike, and wool or synthetic socks (not cotton).','Feel a hot spot? Stop and tape it straight away, before it is a blister.']],
      ['In the gym',['<b>Step-ups</b> for the climb, <b>slow step-downs</b> for the descent.','<b>Split squats</b> and <b>single-leg deadlifts</b> for balance on uneven ground.','<b>Calf and shin raises</b> for your ankles, <b>farmer carries</b> for the pack.','On a treadmill: 10 to 15% incline. A stair climber is the closest thing to a trail.']]
    ]},
    hikebike:{t:'How to ride stronger',s:[
      ['Where to ride',['<b>Road:</b> smooth and steady, best for long rides and building your engine.','<b>Bike paths and gravel:</b> quieter and safer, perfect for easy (zone 2) rides.','<b>Mountain bike trails</b> are rated <b>green</b> (easy), <b>blue</b> (intermediate) and <b>black</b> (hard). Start on green: trails build bike handling and core strength.','<b>Hills:</b> find a climb that takes 5 to 10 minutes. That is where your hard intervals go.']],
      ['How far',['Think in time more than miles: hills and wind change the miles, the effort is what trains you.','<b>Starting:</b> 2 to 3 rides a week, about 30 to 60 miles in total.','<b>Regular:</b> 3 to 4 rides, about 75 to 150 miles.','<b>Strong:</b> 4 to 6 rides, 150 miles or more.','Grow the long ride by 10 to 15 minutes a week. Every fourth week, ride less.']],
      ['How hard',['Most rides easy: you can still talk in sentences (zone 2).','One or two hard days a week: sweet-spot intervals or hill repeats.','<b>FTP</b> is the power (or effort) you could hold for about an hour. Test it every 6 weeks; every target here moves with it.']],
      ['Technique',['<b>Spin, do not grind:</b> about 80 to 95 pedal turns a minute on the flat. Shift to an easier gear early on hills.','<b>Climbing:</b> stay seated on long climbs, stand for short steep bits. Keep the effort steady, not the speed.','<b>Bike fit:</b> at the bottom of the pedal stroke your knee is slightly bent. Pain at the front of the knee often means the seat is too low; at the back, too high.']],
      ['Fuel',['Rides over 90 minutes: 30 to 60 g of carbs every hour (a banana is about 27 g) and a bottle of water an hour.','Eat before you are hungry. Running out of energy is a food problem, not a fitness problem.']],
      ['In the gym',['<b>Squats or leg press:</b> the force behind each pedal stroke.','<b>Split squats and step-ups:</b> each leg on its own, like pedaling.','<b>Deadlifts and hip thrusts:</b> glute power.','<b>Planks, side planks, Pallof press:</b> a steady base on the saddle.','<b>Rows and back extensions:</b> hold your position without back pain. Two days a week, away from hard rides.']],
      ['Safety',['Helmet every ride, lights front and back (day too), and ride with traffic.']]
    ]},
    endurance:{t:'How to run farther or faster',s:[
      ['The rule that matters most',['About 80% of your running easy, 20% hard. Easy means you can talk in full sentences.','Most runners run their easy days too fast and their hard days too slow. Slow down the easy ones.']],
      ['Your week',['<b>Easy runs</b> build the base. <b>Intervals</b> once a week make you faster. The <b>long run</b> makes you go farther.','Add no more than about 10% to your weekly distance, and only in a week where nothing hurts. Every fourth week, run less.']],
      ['Form',['Quick, light steps, landing under your hips, not out in front.','Run tall, relax your shoulders and hands, look ahead.','Most runners do better with slightly more steps per minute than they naturally take.']],
      ['Where to run',['Grass and trails for easy runs (softer, and they train your ankles).','A track or flat road for intervals, so the pace is honest.','Shoes: replace them at about 300 to 500 miles or when they feel flat.']],
      ['Fuel',['Carbs in the meal before long and hard runs.','Past about 75 minutes, 30 to 60 g of carbs an hour.']],
      ['In the gym',['Heavy, low-rep single-leg work (split squats, step-ups) and calf raises make each stride cheaper and protect the Achilles.','Two short sessions a week, never the day before a hard run.']]
    ]},
    toning:{t:'How to look lean and defined',s:[
      ['What "toned" really is',['A bit more muscle with a bit less fat over it. There is no separate "toning" exercise: you build the muscle and lower the fat.','Spot-reducing does not work: crunches build abs but do not burn the fat on top of them. A small calorie deficit does.']],
      ['Training',['Lift 3 to 4 days a week, 10 to 15 reps, with the last reps genuinely hard.','Add 3 to 4 cardio sessions on other days. Walking counts, and daily steps add up more than the sessions do.']],
      ['Food',['Eat slightly under what you burn: aim to lose about 0.3% of your weight a week.','Keep protein high at every meal so the weight you lose is fat, not muscle.']],
      ['Sleep',['Seven to nine hours. Short sleep raises next-day hunger and, in a diet, costs muscle.']]
    ]},
    weightloss:{t:'How to lose fat and keep muscle',s:[
      ['Training',['Keep lifting with real effort: it tells your body to keep its muscle while the fat comes off.','Add cardio on top of lifting, never instead of it. Daily steps move more of the total than the workouts do.']],
      ['Food',['A steady deficit of about 0.5% of your weight a week. Faster usually costs muscle and energy.','High protein at every meal; it also keeps you full.','If your lifting numbers fall for two weeks, the deficit is too deep: eat a bit more.']],
      ['Sleep',['In dieters, short sleep made far more of the weight lost come from muscle instead of fat. Seven to nine hours is part of the plan.']]
    ]},
    bodybuilding:{t:'How to build muscle (and bulk well)',s:[
      ['Training',['About 10 to 20 hard sets per muscle each week, most of them 1 to 2 reps short of failure.','Add a rep or a little weight whenever you hit the top of the rep range. Your log shows when.']],
      ['Food',['A small surplus: gain about 0.25% of your weight a week. Faster is mostly fat.','Protein at every meal, about 1.6 to 2.2 g per kg of bodyweight a day.']],
      ['Sleep',['Seven to nine hours. Muscle is repaired and built while you sleep.']]
    ]}
  };
  GUIDE.showprep=GUIDE.weightloss;
  function guideHtml(g){
    var G=GUIDE[g]; if(!G) return '';
    return '<div class="grab"></div><div class="kg-sh">'+esc(G.t)+'</div>'
      +'<div class="sub kg-p">For your goal: '+esc(name(g))+'. Tap a section to open it.</div>'
      +G.s.map(function(s,i){
        return '<details class="kg-d"'+(i===0?' open':'')+'><summary>'+esc(s[0])+'</summary><ul>'+s[1].map(function(x){ return '<li>'+x+'</li>'; }).join('')+'</ul></details>';
      }).join('')
      +'<div class="kg-acts"><button class="btn ghost" data-kg="ask">Ask Atlas, your training coach</button></div>';
  }

  /* words used in sessions, explained in the session pop-up */
  var TERMS=[[/catch-up/i,'Catch-up','One hand waits in front until the other arrives. Teaches a long reach.'],
    [/fingertip/i,'Fingertip drag','Drag your fingertips along the water as the arm comes forward. Teaches a high elbow.'],
    [/6-kick/i,'6-kick switch','Six kicks on your side, then one stroke to the other side. Teaches rotation.'],
    [/side-kick/i,'Side-kick breathing','Kick on your side with the bottom arm stretched out, face turning up to breathe.'],
    [/kickboard|\d+ kick\b|\) kick\b|\bKick\b/,'Kick','Legs only, holding a kickboard out in front of you.'],
    [/pull buoy/i,'Pull buoy','A float between your thighs so only your arms work.'],
    [/\bbuild\b/i,'Build','Each length a little faster than the last.'],
    [/CSS/,'CSS pace','The pace you could hold for about 30 minutes. Set it with the test in this card.'],
    [/pyramid|25 · 50/i,'Pyramid','The distance goes up, then back down. Rest 30 seconds between each piece.'],
    [/length/i,'Length','One end of the pool to the other.'],
    [/strides/i,'Strides','About 20 seconds of quick, relaxed running, not a sprint. Walk back between them.'],
    [/zone 2/i,'Zone 2','Easy enough that you can talk in full sentences.'],
    [/sweet spot/i,'Sweet spot','Just under your FTP: hard but repeatable. 88 to 93% of FTP.'],
    [/FTP/,'FTP','The power or effort you could hold for about an hour.'],
    [/climb/i,'Climbing','Elevation gain: how many feet you go up in total.']];

  /* ---------- the week: which day each session goes on ---------- */
  var D=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  function week(g){
    if(!window.KovaSport||!KovaSport.has(g)) return null;
    var P=KovaSport.plan(g), hard=[1,3], easy=[0,2,4,6], hi=0, ei=0;
    P.sessions.forEach(function(s,i){
      s.i=i; s.v=tidy(s.v); s.parts=(s.parts||[]).map(function(p){ return [p[0],tidy(p[1])]; });
      if(s.k==='long') s.day=5;
      else if(s.k==='hard'&&hi<hard.length) s.day=hard[hi++];
      else s.day=easy[(ei++)%easy.length];
    });
    P.sessions.sort(function(a,b){ return a.day-b.day; });
    return P;
  }
  /* KovaSport.step is this week's version of one session (the threshold
     set, the long run, the sweet-spot set): show it there, not beside it */
  var STEP_AT={swimming:/threshold/i,endurance:/long run/i,hikebike:/sweet spot/i,hiking:/long hike/i};
  function stepFor(g,s){
    var st=window.KovaSport&&KovaSport.step(g);
    if(!st||!STEP_AT[g]||!STEP_AT[g].test(s.d)) return null;
    return String(s.v).indexOf(st.v)>-1?null:st;
  }
  /* "55% FTP–75% FTP" reads as "55–75% FTP"; "at comfortably hard" as "comfortably hard" */
  function tidy(t){
    return String(t||'').replace(/(\d+)% FTP\u2013(\d+)% FTP/g,'$1\u2013$2% FTP').replace(/ at comfortably hard/g,', comfortably hard')
      .replace(/ at conversational pace/g,' at an easy, talking pace');
  }
  function gymDays(g){
    try{ var q=kp('quiz')||{}, P=KovaPlan.generate(g,q.days||4,q.mins||60); return P.days.length; }catch(e){ return 2; }
  }

  /* ---------- painting ---------- */
  function pillarLine(g,p){
    var I=INFO[g]; if(!I) return '';
    if(p==='train'){
      if(SPORT[g]){ var W=week(g), n=W?W.sessions.filter(function(s){ return !/^optional/i.test(s.d); }).length:0;
        return W?n+' '+UNIT[g]+(n===1?'':'s')+' + '+gymDays(g)+' gym days':I.train; }
      return I.train;
    }
    if(p==='eat') return I.eat;
    return I.s[0]+'–'+I.s[1]+' hours';
  }
  function slotHtml(){
    var g=id();
    if(!g){
      return '<div class="card kg-card"><div class="lbl">BUILT AROUND</div><div class="kg-name">Your goal</div>'
        +'<div class="sub kg-p">Tell Kova what you train for (looking lean, bulking, running, swimming, hiking, cycling...) and your workouts, food and sleep all follow it.</div>'
        +'<button class="btn" data-kg="quiz">Pick my goal</button></div>';
    }
    var h='<div class="card kg-card"><div class="kg-top"><div><div class="lbl">BUILT AROUND</div><div class="kg-name">'+esc(name(g))+'</div></div>'
      +'<button class="chip kg-chg" data-kg="change">Change</button></div>'
      +'<div class="kg-tie">'+[['train','TRAIN'],['eat','EAT'],['sleep','SLEEP']].map(function(p){
        return '<button type="button" class="kg-pil" data-kg="pillar" data-p="'+p[0]+'"><span class="kg-k">'+p[1]+'</span><span class="kg-v">'+esc(pillarLine(g,p[0]))+'</span></button>';
      }).join('')+'</div>';
    var W=window.KovaSport&&KovaSport.has(g)?week(g):null;
    if(W){
      var st=KovaSport.step(g), wk=KovaSport.weekNum(g), started=startedAt(g);
      h+='<div class="lbl kg-sec">YOUR '+(SPORT[g]?UNIT[g].toUpperCase()+'S':(W.unit||'CARDIO').toUpperCase())+' THIS WEEK'+(started?' · WEEK '+wk+' OF 12':'')+'</div>'
        +(st&&st.deload?'<div class="kg-step"><b>Back-off week.</b> '+esc(st.note)+'</div>':'')
        +W.sessions.map(function(s){
          var sx=stepFor(g,s);
          return '<button type="button" class="kg-ses" data-kg="sess" data-i="'+s.i+'"><span class="kg-day">'+D[s.day]+'</span><i class="kg-dot '+s.k+'"></i>'
            +'<span class="kg-sn"><b>'+esc(s.d)+'</b><span>'+(sx?'This week: '+esc(sx.v):esc(s.v))+'</span></span><span class="kg-go" aria-hidden="true">›</span></button>';
        }).join('');
      var T=W.test, v=KovaSport.vals()[T.key];
      h+='<div class="kg-acts">'
        +(GUIDE[g]?'<button class="btn" data-kg="guide">'+esc(GUIDE[g].t)+'</button>':'')
        +'<button class="btn ghost" data-kg="test">'+(v?esc(T.n.split(' —')[0].split(' -')[0])+': '+esc(v):'Set your '+esc(testWord(g)))+'</button></div>';
    } else if(GUIDE[g]){
      h+='<div class="kg-acts"><button class="btn ghost" data-kg="guide">'+esc(GUIDE[g].t)+'</button></div>';
    }
    return h+'</div>';
  }
  function testWord(g){ return {swimming:'swim pace',endurance:'running pace',hiking:'climb rate',hikebike:'riding power',athletic:'jump distance'}[g]||'easy cardio time'; }
  function startedAt(g){ try{ return !!(JSON.parse(localStorage.getItem('kova_sport_week_v1')||'{}')[g]); }catch(e){ return false; } }

  function fuelHtml(){
    var g=id(); if(!g||!INFO[g]) return '';
    var I=INFO[g], kg=bwKg();
    var pro=kg?Math.round(kg*I.p[0]/5)*5+'–'+Math.round(kg*I.p[1]/5)*5+' g protein a day':I.p[0]+'–'+I.p[1]+' g protein per kg';
    return '<div class="card kg-mini" data-kg="pillar" data-p="eat" role="button" tabindex="0"><div class="kg-mh"><span class="lbl">FOR YOUR GOAL · '+esc(name(g).toUpperCase())+'</span><span class="kg-go">›</span></div>'
      +'<div class="kg-mv">'+esc(I.eat)+'</div><div class="sub">'+esc(pro)+(kg?' (from your weight)':'. Add your weight in Fuel to see grams.')+'</div></div>';
  }
  function sleepHtml(){
    var g=id(); if(!g||!INFO[g]) return '';
    var I=INFO[g], A=sleepAvg(), short=A?I.s[0]-A.h:0;
    return '<div class="card kg-mini" data-kg="pillar" data-p="sleep" role="button" tabindex="0"><div class="kg-mh"><span class="lbl">FOR YOUR GOAL · '+esc(name(g).toUpperCase())+'</span><span class="kg-go">›</span></div>'
      +'<div class="kg-mv">'+I.s[0]+'–'+I.s[1]+' hours a night</div>'
      +'<div class="sub">'+(A?'You averaged '+esc(hm(A.h))+' over '+A.n+' nights'+(short>0.2?', about '+esc(hm(short))+' short.':', right on target.'):'Kova compares this with your nights once your watch sends three.')+'</div></div>';
  }

  function pillarSheet(p){
    var g=id(); if(!g) return;
    var I=INFO[g], kg=bwKg(), h='<div class="grab"></div>';
    if(p==='train'){
      h+='<div class="kg-sh">Training for: '+esc(name(g))+'</div>';
      if(SPORT[g]) h+='<div class="kg-p">'+esc(KovaSport.plan(g).intro)+'</div><div class="kg-p">'+esc(KovaSport.plan(g).split)+'</div><div class="kg-p"><b>Gym:</b> '+esc(KovaSport.plan(g).lift)+'</div>';
      else h+='<div class="kg-p">'+esc(I.train)+'. '+esc((RX[g]||{}).note||'')+'</div>';
      h+='<div class="kg-acts"><button class="btn" data-kg="plan">See my gym days</button>'+(GUIDE[g]?'<button class="btn ghost" data-kg="guide">'+esc(GUIDE[g].t)+'</button>':'')+'</div>';
    } else if(p==='eat'){
      h+='<div class="kg-sh">Eating for: '+esc(name(g))+'</div><div class="kg-p">'+esc(I.eatL)+'</div>'
        +'<div class="kg-p"><b>Protein:</b> '+I.p[0]+' to '+I.p[1]+' g per kg of bodyweight a day'
        +(kg?', which for you is about <b>'+Math.round(kg*I.p[0]/5)*5+' to '+Math.round(kg*I.p[1]/5)*5+' g</b>.':'. Add your weight in Fuel and Kova works out the grams.')+'</div>'
        +'<div class="kg-acts"><button class="btn" data-kg="maint">Set my calories for this goal</button></div>';
    } else {
      var A=sleepAvg();
      h+='<div class="kg-sh">Sleeping for: '+esc(name(g))+'</div><div class="kg-p">'+esc(I.sleepL)+'</div>'
        +'<div class="kg-p"><b>Target:</b> '+I.s[0]+' to '+I.s[1]+' hours. '+(A?'Your last '+A.n+' nights averaged '+esc(hm(A.h))+'.':'Connect your watch and Kova checks your nights against it.')+'</div>'
        +'<div class="kg-acts"><button class="btn" data-kg="bedtime">Plan my bedtime</button></div>';
    }
    if(window.openSheet) openSheet(h);
  }
  function sessSheet(i){
    var g=id(), W=week(g); if(!W) return;
    var s=W.sessions.filter(function(x){ return x.i===i; })[0]; if(!s) return;
    var txt=[s.d,s.v,s.w||''].concat((s.parts||[]).map(function(p){ return p.join(' '); })).join(' '), seen={};
    var terms=TERMS.filter(function(t){ if(seen[t[1]]||!t[0].test(txt)) return false; seen[t[1]]=1; return true; });
    var sx=stepFor(g,s);
    var h='<div class="grab"></div><div class="kg-sh">'+D[s.day]+' · '+esc(s.d)+'</div>'
      +(sx?'<div class="kg-p kg-tip"><b>This week'+(sx.week?' (week '+sx.week+')':'')+': '+esc(sx.v)+'.</b> '+esc(sx.note)+'</div>':'<div class="kg-p"><b>'+esc(s.v)+'</b></div>')
      +(s.parts&&s.parts.length?'<div class="kg-parts">'+s.parts.map(function(p,k){ var main=sx&&/^main$/i.test(p[0]); return '<div class="kg-part"><span>'+(k+1)+'</span><div><b>'+esc(p[0])+'</b><div>'+esc(main?sx.v:p[1])+'</div></div></div>'; }).join('')+'</div>':'')
      +(s.w?'<div class="kg-p kg-tip">'+esc(s.w)+'</div>':'')
      +(terms.length?'<div class="lbl" style="margin:12px 0 6px">WHAT THE WORDS MEAN</div>'+terms.map(function(t){ return '<div class="kg-term"><b>'+esc(t[1])+'</b> '+esc(t[2])+'</div>'; }).join(''):'')
      +'<div class="kg-acts">'+(GUIDE[g]?'<button class="btn ghost" data-kg="guide">'+esc(GUIDE[g].t)+'</button>':'')+'</div>';
    if(window.openSheet) openSheet(h);
  }
  function testSheet(){
    var g=id(); if(!g||!window.KovaSport||!KovaSport.has(g)) return;
    var P=KovaSport.plan(g), T=P.test, V=KovaSport.vals(), h='<div class="grab"></div><div class="kg-sh">Set your '+esc(testWord(g))+'</div>'
      +'<div class="kg-p"><b>'+esc(T.n)+'.</b> '+esc(T.how)+'</div>'
      +'<label class="kg-in"><span>Your result</span><input id="kgTest" value="'+esc(V[T.key]||'')+'" placeholder="'+esc(T.ph)+'" autocomplete="off"></label>';
    if(g==='swimming'){
      h+='<div class="lbl" style="margin:12px 0 6px">YOUR POOL</div><div class="kg-chips">'+[['25m','25 m'],['25y','25 yd'],['50m','50 m']].map(function(o){ return '<button class="chip'+((V.pool||'25m')===o[0]?' on':'')+'" data-kg="pool" data-v="'+o[0]+'">'+o[1]+'</button>'; }).join('')+'</div>'
        +'<div class="lbl" style="margin:12px 0 6px">WHERE YOU ARE</div><div class="kg-chips">'+[['learn','Still learning'],['fit','I can swim 400 without stopping']].map(function(o){ return '<button class="chip'+((V.level||'fit')===o[0]?' on':'')+'" data-kg="level" data-v="'+o[0]+'">'+o[1]+'</button>'; }).join('')+'</div>';
    }
    h+='<div class="kg-acts"><button class="btn" data-kg="savetest">Save</button>'
      +(startedAt(g)?'':'<button class="btn ghost" data-kg="start">Start my 12 weeks today</button>')+'</div>'
      +'<div class="sub kg-p">Every pace in your week comes from this number. Retest every 6 to 8 weeks.</div>';
    if(window.openSheet) openSheet(h);
  }

  function paint(){
    var a=document.getElementById('goalSlot'); if(a) a.innerHTML=slotHtml();
    var b=document.getElementById('goalFuel'); if(b) b.innerHTML=fuelHtml();
    var c=document.getElementById('goalSleep'); if(c) c.innerHTML=sleepHtml();
  }

  /* ---------- one click handler for everything above ---------- */
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-kg]'); if(!b) return;
    var a=b.getAttribute('data-kg'), g=id();
    if(a==='quiz'||a==='change'){ if(window.closeSheet) closeSheet(); if(typeof go==='function') go('quiz'); return; }
    if(a==='pillar'){ pillarSheet(b.getAttribute('data-p')); return; }
    if(a==='sess'){ sessSheet(+b.getAttribute('data-i')); return; }
    if(a==='guide'){ if(window.openSheet) openSheet(guideHtml(g)); return; }
    if(a==='test'){ testSheet(); return; }
    if(a==='pool'||a==='level'){ KovaSport.setVal(a,b.getAttribute('data-v')); testSheet(); paint(); return; }
    if(a==='savetest'){
      var inp=document.getElementById('kgTest'), P=KovaSport.plan(g);
      KovaSport.setVal(P.test.key,String(inp&&inp.value||'').trim().slice(0,24));
      if(!startedAt(g)) KovaSport.startBlock(g);
      if(window.closeSheet) closeSheet(); paint(); if(window.toast) toast('Saved. Your week now uses it.'); return;
    }
    if(a==='start'){ KovaSport.startBlock(g); if(window.closeSheet) closeSheet(); paint(); if(window.toast) toast('Week 1 starts today.'); return; }
    if(a==='plan'){ if(window.closeSheet) closeSheet(); if(typeof go==='function') go('customize'); return; }
    if(a==='maint'){ if(window.closeSheet) closeSheet(); if(typeof go==='function') go('maint'); return; }
    if(a==='bedtime'){ if(window.closeSheet) closeSheet(); if(typeof go==='function') go('bedtime'); return; }
    if(a==='ask'){
      if(window.closeSheet) closeSheet();
      var q={swimming:'How do I get faster at swimming? What should I swim this week?',hiking:'How do I get better at hiking? Which trails should I do next?',
        hikebike:'How do I get stronger on the bike? How far should I ride this week?',endurance:'How do I run faster? What should my week look like?'}[g]||('How should I train for '+name(g).toLowerCase()+'?');
      setTimeout(function(){ if(!(window.KovaListen&&KovaListen.ask&&KovaListen.ask('training',q))&&typeof go==='function') go('workteam'); },260);
      return;
    }
    if(a==='addmove'){ addAndSay(b.getAttribute('data-n'),+b.getAttribute('data-s'),b.getAttribute('data-r')); return; }
  });
  document.addEventListener('keydown',function(e){
    if((e.key==='Enter'||e.key===' ')&&e.target&&e.target.classList&&e.target.classList.contains('kg-mini')){ e.preventDefault(); e.target.click(); }
  });

  /* ---------- cardio machines the scan knows (added to the curated list) ---------- */
  var MACH=[
    {n:'Stationary bike',k:'stationary exercise bike spin cycle upright recumbent',kind:'fixed',cardio:1,
     pri:['Quadriceps','Glutes'],sec:['Hamstrings','Calves','Heart and lungs'],
     set:['Seat height: with the pedal at the bottom, your knee stays slightly bent','Standing beside the bike, the seat level with your hip bone is a good first guess','Handlebars high enough that your back is not rounded'],
     how:['Spin smoothly: about 80 to 95 pedal turns a minute on easy rides','Add resistance to make it harder, rather than pedaling slower','Keep your hips still on the seat; rocking means it is too high','Relax your shoulders and keep a light grip'],
     miss:[['Seat too low','Your knees bend too far on every turn and start to ache at the front.'],['Grinding a heavy setting slowly','Tires your legs fast. Spin a lighter setting.'],['Bouncing on the seat','Usually too little resistance for the speed. Add a little.']],
     rx:{s:1,r:'20-45 min',rest:'n/a'}},
    {n:'Rowing machine',k:'rowing machine rower erg ergometer',kind:'fixed',cardio:1,
     pri:['Legs (quads and glutes)','Upper back and lats'],sec:['Hamstrings','Core','Biceps','Heart and lungs'],
     set:['Strap your feet so the strap crosses the widest part of your foot','Damper (the lever on the fan) on 3 to 5. Higher feels heavier but is not better','Sit tall, arms straight, shins upright to start'],
     how:['Push with your legs first, then lean back slightly, then pull with your arms','On the way forward: arms, then body, then legs','Pull the handle to the bottom of your ribs','Come forward slower than you pushed back'],
     miss:[['Pulling with the arms first','Your arms tire in a minute while your legs do nothing.'],['Damper on 10','A slow, heavy pull that strains the low back.'],['Rounding your back at the start','Sit tall from the hips to protect your low back.']],
     rx:{s:1,r:'15-30 min',rest:'n/a'}},
    {n:'Stair climber',k:'stair climber stairmaster stepmill step machine stairs',kind:'fixed',cardio:1,
     pri:['Glutes','Quadriceps'],sec:['Calves','Hamstrings','Heart and lungs'],
     set:['Start slow and step on while holding the rails','Stand tall with your weight over your feet','Hands light on the rails, for balance only'],
     how:['Step through your whole foot, not just your toes','Chest up, hips under you','Pick a speed you can hold without hanging on','Slow it down rather than lean on the rails'],
     miss:[['Leaning on the rails','Takes much of the work off your legs, so the calorie number is wrong too.'],['Tiny tiptoe steps','Mostly calves. Use full steps.'],['Hunching over the screen','Strains the low back. Stand tall.']],
     rx:{s:1,r:'15-30 min',rest:'n/a'}},
    {n:'Elliptical',k:'elliptical cross trainer arc trainer',kind:'fixed',cardio:1,
     pri:['Quadriceps','Glutes'],sec:['Hamstrings','Calves','Chest and back (with the arms)','Heart and lungs'],
     set:['Step on with the pedals still, holding the fixed handles','Feet flat in the middle of the pedals','Stand tall, hips over your feet'],
     how:['Push through your heels to work glutes and hamstrings more','Use the moving handles to bring your upper body in','Add resistance before you add speed','Keep your weight on your legs, not the handles'],
     miss:[['Fast with no resistance','Momentum does the work. Add resistance until you feel each stride.'],['Up on your toes','Numb feet and tight calves. Keep your feet flat.'],['Leaning on the handles','Takes the work off your legs.']],
     rx:{s:1,r:'20-40 min',rest:'n/a'}}
  ];
  function addMachines(){
    var M=window.__kovaMachines; if(!M||M.__kg) return;
    M.__kg=1;
    M.forEach(function(m){ if(/treadmill/i.test(m.n)) m.cardio=1; });
    var at=-1; M.forEach(function(m,i){ if(m.n==='Not sure / not listed') at=i; });
    var add=MACH.filter(function(x){ return !M.some(function(m){ return m.n===x.n; }); });
    if(at<0) at=M.length;
    Array.prototype.splice.apply(M,[at,0].concat(add));
    try{ if(window.__mcPaint) __mcPaint(); }catch(e){}
  }

  /* repaint when the goal, the plan or the data behind the numbers change */
  var t=null;
  function later(){ clearTimeout(t); t=setTimeout(paint,80); }
  ['kova:health','storage'].forEach(function(ev){ window.addEventListener(ev,later); });
  /* every screen change goes through go(); repaint when one of ours opens */
  function wrapGo(){
    var real=window.go; if(typeof real!=='function'||real.__kg) return;
    var w=function(id){ var r=real.apply(this,arguments); if(/^(move|fuel|sleep|machine|customize)$/.test(id)) later(); return r; };
    w.__kg=1; window.go=w;
  }
  function init(){ wrapGo(); addMachines(); paint(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();

  return {id:id,name:name,isSport:isSport,info:function(g){ return INFO[g||id()]||null; },rx:rx,kindOf:kindOf,why:why,cardioFor:cardioFor,
    addToPlan:addToPlan,addAndSay:addAndSay,machine:machine,machineAdd:machineAdd,week:week,guide:guideHtml,paint:paint,
    slotHtml:slotHtml,fuelHtml:fuelHtml,sleepHtml:sleepHtml,pillarSheet:pillarSheet,sessSheet:sessSheet,testSheet:testSheet,
    GUIDE:GUIDE,INFO:INFO,MACH:MACH,_addMachines:addMachines};
})();
