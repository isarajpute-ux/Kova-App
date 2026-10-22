/* =====================================================================
   KovaDream - Dream physique (p38).

   The owner: "a tab on the workout metric: send a video/image of a
   physique - your dream physique from any actor or influencer - it tells
   you what to train more on exactly and gives you a macros plan to get
   there, female and male, accurate and fast; show your body right now and
   the dream physique, and transform into it; your height and weight now and
   what the person looks like; tell you what to gain or take off."

   How it works, honestly:
     - the picture of the body you want (a photo, a video's frames, or a
       link's picture) and, if you add one, a photo of you now go to Kova's
       AI once. It reads the physique only: it never says who the person is
       (Kova does not identify people) and never comments on faces. It
       answers with a body-fat range, the build, the muscles that stand out
       and the ones you need to build more.
     - everything with a number after that is Kova's own maths, the same
       engine as Fuel (KovaMaint): your body fat now (from your photo, or
       your height, weight and age), the weight that look is on your frame,
       the fat to lose and the muscle to add (realistic rates for a woman
       or a man), calories and macros for the phase you are in, and how
       long it takes.
     - p38d (the owner: no yellow labels, no body diagram, show it on the
       real person): the muscles to build glow on your own photo in Kova's
       orange with small glass labels (on the goal photo without yours);
       "Your change" is the owner's chart reference (3 months / 6 months /
       1 year, the dream as the orange tick, a floating card with the big
       number), from the same maths and pace as the time estimate; the plan
       is one compact card (Train / Eat / Steps, a split day opens in a
       pop-up) that the Ask Kova answer fills in.
     - "Use this plan" switches Fuel to it; "Add to my plan" puts one
       exercise per focus muscle into your split.
   Floors: a goal leaner than 8% (men) or 16% (women) is aimed at those
   instead and says why; under 18, no calorie deficit.
   ===================================================================== */
window.KovaDream=(function(){
  'use strict';
  var KEY='dream';
  var LIST=['chest','delts','lats','traps','biceps','triceps','forearms','abs','obliques','lowback','glutes','quads','hams','calves','adductors'];
  var NAME={chest:'Chest',delts:'Shoulders',lats:'Lats (back width)',traps:'Traps',biceps:'Biceps',triceps:'Triceps',forearms:'Forearms',abs:'Abs',obliques:'Obliques (waist)',lowback:'Lower back',glutes:'Glutes',quads:'Quads',hams:'Hamstrings',calves:'Calves',adductors:'Inner thighs'};
  /* one exercise per focus muscle, for "Add to my plan" */
  var MOVE={chest:'Incline dumbbell press',delts:'Lateral raise',lats:'Lat pulldown',traps:'Shrug',biceps:'Dumbbell curl',triceps:'Rope pushdown',forearms:'Farmer carry',abs:'Hanging leg raise',obliques:'Pallof press',lowback:'Back extension',glutes:'Hip thrust',quads:'Leg press',hams:'Romanian deadlift',calves:'Standing calf raise',adductors:'Sumo deadlift'};
  var S={want:null,wantKind:'',hint:'',me:null,wantAR:1.25,meAR:1.25,q:'',busy:false,coaching:false,ans:null,ansErr:'',res:null,err:'',open:false};

  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function kp(k){ try{ return window.KP?KP.get(k):null; }catch(e){ return null; } }
  function kset(k,v){ try{ if(window.KP) KP.set(k,v); }catch(e){} }
  function ic(n){ return '<svg class="ic" aria-hidden="true"><use href="#i-'+n+'"/></svg>'; }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }
  function cl(x,a,b){ return Math.max(a,Math.min(b,x)); }
  function r1(x){ return Math.round(x*10)/10; }
  var LB=0.45359237;

  /* ---------- you, from your profile (Fuel > Find my maintenance) ---------- */
  function you(){
    var M=window.KovaMaint, p=null;
    try{ p=M&&(M.prof()||M.draft()); }catch(e){}
    p=p||{};
    var bs=null; try{ bs=window.KovaBodyShape?KovaBodyShape.profile():null; }catch(e){}
    var sex=p.sex||(bs&&bs.known?(bs.f?'f':'m'):'m');
    var kg=p.kg||(bs&&bs.kg)||null, bf=p.bf||null, how='';
    if(bf) how='the body fat you entered';
    else if(kg&&p.hcm&&p.age&&M&&M.bfEst){ bf=M.bfEst(p,kg); how='your height, weight and age'; }
    else if(bs&&bs.bf){ bf=bs.bf; how=bs.how||'your profile'; }
    return {p:p,sex:sex==='f'?'f':'m',kg:kg,hcm:p.hcm||null,age:p.age||null,bf:bf,how:how,unit:p.unit||'lb'};
  }
  function wt(kg,unit){ return unit==='kg'?Math.round(kg)+' kg':Math.round(kg/LB)+' lb'; }
  function ht(cm,unit){ if(!cm) return ''; if(unit==='kg') return Math.round(cm)+' cm'; var i=Math.round(cm/2.54); return Math.floor(i/12)+'′'+(i%12)+'″'; }

  /* ---------- Kova's maths after the AI read ---------- */
  var LEVEL={none:0,some:1,'a lot':2};
  var BUILD={slim:0,lean:0,average:0,curvy:0,heavier:0,athletic:1,muscular:2,'very muscular':2};
  function plan(r,Y){
    Y=Y||you();
    var t=r.target||{}, mid=function(a){ if(!Array.isArray(a)||a.length!==2) return null; var x=+a[0], y=+a[1]; if(!(x>=2&&y>=2&&x<=60&&y<=60)) return null; return (Math.min(x,y)+Math.max(x,y))/2; };
    var tbf=mid(t.bodyfat), sexT=t.sex==='female'?'f':t.sex==='male'?'m':Y.sex, note=[];
    if(tbf==null) return null;
    /* the same look on your body: women carry about 9 points more essential fat */
    if(sexT!==Y.sex){ tbf+=Y.sex==='f'?9:-9; note.push('That body is a '+(sexT==='f'?'woman':'man')+'’s; Kova has worked out the same look on '+(Y.sex==='f'?'a woman':'a man')+'.'); }
    var floor=Y.sex==='f'?16:8;
    if(tbf<floor){ note.push('That is stage-lean, usually held for a shoot or a show. Kova aims for '+floor+'%, lean and something you can keep.'); tbf=floor; }
    var mineBf=(r.you&&mid(r.you.bodyfat))||Y.bf, src=r.you&&mid(r.you.bodyfat)?'your photo':Y.how;
    var out={tbf:Math.round(tbf),sexT:sexT,note:note,build:t.build||'',looks:t.looks||'',caveat:t.caveat||''};
    /* only the halves that are in the pictures are compared */
    var vT=t.visible||{upper:true,lower:true}, vY=r.you&&r.you.visible?r.you.visible:{upper:true,lower:true};
    var up=vT.upper!==false&&vY.upper!==false, low=vT.lower!==false&&vY.lower!==false;
    var seen=function(m){ return UP.indexOf(m)>=0?up:LOW.indexOf(m)>=0?low:true; };
    out.visible={upper:vT.upper!==false,lower:vT.lower!==false};
    if(!out.visible.lower) note.push('Only the upper body is in the picture of your goal, so Kova compared chest, shoulders, arms, back and abs. Add a full-body picture to compare the legs and glutes too.');
    else if(!out.visible.upper) note.push('Only the lower body is in the picture of your goal, so Kova compared glutes and legs, and the body fat is a rougher read. Add a full-body picture for the upper body.');
    if(r.you&&r.you.visible&&(r.you.visible.upper===false||r.you.visible.lower===false)) note.push('Your photo shows only the '+(r.you.visible.upper===false?'lower':'upper')+' body, so that half is the one compared.');
    out.confidence=t.confidence==='low'||(r.you&&r.you.confidence==='low')?'low':t.confidence==='high'?'high':'medium';
    if(out.confidence==='low') note.push('The picture made this a rough read. A clear, front-on photo in good light makes it exact.');
    out.cues=(Array.isArray(t.cues)?t.cues:[]).map(String).slice(0,4);
    out.youCues=r.you&&Array.isArray(r.you.cues)?r.you.cues.map(String).slice(0,4):[];
    out.focus=(r.focus||[]).filter(function(f){ return f&&LIST.indexOf(f.m)>=0&&seen(f.m); }).slice(0,4);
    var fm=out.focus.map(function(f){ return f.m; }), n01=function(v){ v=+v; return v>=0&&v<=1; };
    var sz=function(v){ v=+v; return v>0.012&&v<0.75; };
    out.marks=(Array.isArray(r.marks)?r.marks:[]).map(function(k){
      if(!k||!(k.img===1||k.img===2||k.img==='1'||k.img==='2')||fm.indexOf(k.m)<0||!n01(k.x)||!n01(k.y)) return null;
      var len=k.len!=null?+k.len:+k.h, wid=k.wid!=null?+k.wid:+k.w, a=k.a!=null?+k.a:0;
      if(!sz(len)||!sz(wid)||!(a>=-180&&a<=180)) return null;
      return {img:+k.img,m:k.m,x:+k.x,y:+k.y,len:len,wid:wid,a:a};
    }).filter(Boolean).slice(0,16);
    if(t.clothed) note.push('Kova read the goal body through clothing, so it is a closer guess than a shirtless photo.');
    if(r.you&&r.you.clothed) note.push('Kova read your body through clothing; a fitted top or shirtless photo makes your side more exact.');
    out.standout=(t.standout||[]).filter(function(m){ return LIST.indexOf(m)>=0&&seen(m); }).slice(0,5);
    if(mineBf==null||!Y.kg){ out.need='numbers'; return out; }
    out.bf=Math.round(mineBf); out.bfFrom=src; out.kg=Y.kg;
    var mine=r.you?(r.you.muscle in LEVEL?LEVEL[r.you.muscle]:(BUILD[r.you.build]||0)):0;
    if(!r.you&&(LEVEL[t.muscle]||0)>0) note.push('Without your photo Kova assumed an untrained build; add one and the muscle to build is exact for you.');
    var gap=Math.max(0,(LEVEL[t.muscle]||0)-mine);
    var per=Y.sex==='f'?2:3.5, mus=gap*per;                          /* kg of muscle, mid estimate */
    var lean=Y.kg*(1-mineBf/100), goalKg=(lean+mus)/(1-tbf/100);
    var fatNow=Y.kg*mineBf/100, fatGoal=goalKg*tbf/100;
    out.muscle=[r1(mus*0.7),r1(mus*1.3)]; out.musMid=mus;
    out.fat=r1(fatNow-fatGoal);                                      /* positive: fat to lose */
    out.goalKg=goalKg;
    /* the phase you are in now */
    var minor=Y.age&&Y.age<18;
    out.phase=minor?'maint':(mineBf-tbf>6?'cut':mineBf-tbf>2?'lean':mus>0?'leanbulk':'maint');
    if(minor) note.push('Under 18 Kova does not cut calories: eat to grow, train well, and the look follows.');
    /* calories and macros from the same engine as Fuel */
    var M=window.KovaMaint, P=null, q=null;
    if(M&&M.plan&&Y.hcm&&Y.age){
      q=JSON.parse(JSON.stringify(Y.p)); q.kg=Y.kg; q.sex=Y.sex; q.goal=out.phase;
      var G=(M.GOALS||[]).filter(function(g){ return g.id===out.phase; })[0];
      q.rate=G?G.def:0; q.tgtKg=out.phase==='maint'?null:Math.round(goalKg*10)/10;
      if(!q.bf) q.bf=Math.round(mineBf);
      try{ P=M.plan(q); }catch(e){ P=null; }
    }
    if(P){ out.kcal=P.kcal; out.p=P.p; out.c=P.c; out.f=P.f; out.maint=P.maint; out.q=q; }
    /* how long: fat at the phase's weekly rate, muscle at a realistic pace */
    var G2=M&&M.GOALS?(M.GOALS.filter(function(g){ return g.id===(out.phase==='maint'?'lean':out.phase); })[0]):null;
    var lossPerWk=Y.kg*((G2&&G2.def)||0.5)/100*0.85, wCut=out.fat>0.5?out.fat/Math.max(0.2,lossPerWk):0;
    var wMus=mus>0?mus/(Y.sex==='f'?0.1:0.2):0;                      /* about 0.4 or 0.8 kg a month */
    out.weeks=Math.round(wCut+wMus); out.lossWk=Math.max(0.2,lossPerWk); out.musWk=Y.sex==='f'?0.1:0.2;
    return out;
  }

  /* ---------- the AI read (one call) ---------- */
  var UP=['chest','delts','lats','traps','biceps','triceps','forearms','abs','obliques','lowback'], LOW=['glutes','quads','hams','calves','adductors'];
  var SYS='You read physique photos for a fitness app. Describe only the visible body. Never say or guess who the person is, even if they look famous, and never comment on a face or attractiveness. Reply with JSON only, no prose:\n'
    +'{"ok":true,"why_not":"","target":{"sex":"male|female","visible":{"upper":true,"lower":true},"cues":["up to 4 short visible cues"],"bodyfat":[low,high],"confidence":"high|medium|low","build":"slim|lean|athletic|muscular|very muscular|curvy|heavier","muscle":"none|some|a lot","standout":["up to 5 muscles"],"looks":"one plain sentence on the physique","caveat":"one plain sentence (lighting, pump, posing, angle)"},'
    +'"you":null or {"visible":{"upper":true,"lower":true},"clothed":false,"cues":["..."],"bodyfat":[low,high],"confidence":"high|medium|low","build":"...","muscle":"none|some|a lot"},"focus":[{"m":"muscle","why":"8 to 14 plain words"}],'
    +'"marks":[{"img":1,"m":"muscle","x":0.5,"y":0.3,"len":0.12,"wid":0.06,"a":0}]}\n'
    +'In "target", also give "clothed": true when clothes cover the muscles.\n'
    +'Muscles, only from this list: '+LIST.join(', ')+'. Upper body is chest, shoulders, arms, back and abs; lower body is glutes and legs.\n'
    +'Image 1 is the body the user wants. If a second image is given it is the user now: fill "you" from it, else "you" is null.\n'
    +'"visible": which halves of the body are actually in the picture. A shot may show only the upper body, only the lower body, or both: judge only what is visible.\n'
    +'Body fat, read from what you can see, as an honest range 3 points wide. Men: deep six-pack, veins on the abs and striations about 6-9; clear six-pack and visible obliques 10-12; upper abs showing, little definition below 13-15; flat but no abs 16-19; soft waist 20-24; clear fat around the waist and chest 25+. Women: clear abs and obliques 14-17; abs lines and a defined waist 18-21; flat and toned, no abs 22-25; soft 26-30; 31+. With only the lower body visible, read it from the legs and glutes and set confidence low.\n'
    +'Clothes: people may wear a shirt, a hoodie, trousers or leggings. Read the body under them from how the fabric fits (tight or loose over the chest, shoulders, arms and waist; how it hangs from the shoulders), shoulder width against the waist, the forearms, hands, neck, jaw and face, and the shape of the glutes and legs through trousers or leggings. Clothes make the read less certain: set confidence to medium or low, but still give your best honest range, and still mark where each muscle is under the clothes.\n'
    +'"cues": the visible signs you used (for example "clear six-pack", "veins on the forearms", "rounded shoulders", "soft lower belly").\n'
    +'"muscle" is compared with an average untrained person of the same sex.\n'
    +'"focus": up to 4 muscles the user must build MORE to look like image 1, biggest difference first, only from halves visible in image 1 (and in image 2 when given). Without image 2, compare with an average untrained build of the user\'s sex.\n'
    +'"marks": where each focus muscle is in each picture, so the app can draw it on the photo the way an anatomy overlay does: one mark per muscle per side of the body (left and right arm are separate marks). x and y: the centre of the muscle, as fractions of the image width and height (0 to 1 from the top left). len: the length of the muscle along its long axis, wid: its width, both as fractions of the image width. a: the angle of its long axis in degrees, 0 = pointing straight up, 90 = pointing right, -90 = pointing left (an upper arm hanging down is about 0; a chest muscle is about 70 or -70). Follow the muscle on the actual body in that picture, under clothes too. Mark image 1, and image 2 when given; up to 8 marks per image.\n'
    +'If image 1 shows no human body clearly, set ok to false and say why in why_not.';
  function ask(imgs,facts){
    var K=window.KovaModel; if(!K||!K.connected()) return Promise.reject(Object.assign(new Error('signin'),{signin:true}));
    var c=K.cfg(), P=K.providers[c.p];
    var text='The user: '+facts+(S.hint?' '+S.hint:'');
    var content=c.p==='anthropic'
      ? imgs.map(function(d){ return {type:'image',source:{type:'base64',media_type:K.mime(d),data:d.slice(d.indexOf(',')+1)}}; }).concat([{type:'text',text:text}])
      : [{type:'text',text:text}].concat(imgs.map(function(d){ return {type:'image_url',image_url:{url:d}}; }));
    var req=P.build(c.key,c.model,SYS,[{role:'user',content:content}],{temperature:0,max_tokens:700});
    /* never a spinner forever: 45 seconds, then it says so */
    var ctl=typeof AbortController!=='undefined'?new AbortController():null, tm=ctl?setTimeout(function(){ ctl.abort(); },45000):0;
    return fetch(P.url,{method:'POST',headers:req.headers,body:req.body,signal:ctl?ctl.signal:undefined}).then(function(r){
      clearTimeout(tm);
      if(!r.ok) return r.text().then(function(t){ throw new Error(r.status+' '+String(t).slice(0,120)); });
      return r.json();
    }).then(function(d){
      var raw=(P.read(d)||'').replace(/```json|```/g,'').trim(), a=raw.indexOf('{'), z=raw.lastIndexOf('}');
      if(a<0||z<a) throw new Error('The answer came back in a form Kova could not read. Try again.');
      return JSON.parse(raw.slice(a,z+1));
    });
  }
  function fit(d){ var K=window.KovaModel; return K&&K.fit&&/^data:image\//.test(d)?K.fit(d).catch(function(){ return d; }):Promise.resolve(d); }
  function compare(){
    if(!S.want||S.busy) return;
    var Y=you();
    var facts=(Y.sex==='f'?'woman':'man')+(Y.age?', '+Y.age+' years':'')+(Y.hcm?', '+Math.round(Y.hcm)+' cm':'')+(Y.kg?', '+Math.round(Y.kg)+' kg':'')+(Y.bf?', about '+Math.round(Y.bf)+'% body fat ('+Y.how+')':'')+'.';
    if(!(window.KovaModel&&KovaModel.connected())){ S.err='Sign in and Kova\u2019s AI reads the picture for you, free.'; paint(); return; }
    S.busy=true; S.err=''; paint();
    var once=function(){ return Promise.all([fit(S.want)].concat(S.me?[fit(S.me)]:[])).then(function(imgs){ return ask(imgs,facts); }); };
    once().catch(function(e){ if(e&&!e.signin&&!/^4\d\d /.test(String(e.message))) return new Promise(function(ok){ setTimeout(ok,1200); }).then(once); throw e; })
      .then(function(r){
        S.busy=false;
        if(!r||r.ok===false){ S.err=(r&&r.why_not)||'Kova could not see a body clearly in that picture. Try one where the whole body or torso is in view.'; paint(); return; }
        S.res=r; var out=plan(r,Y);
        if(!out){ S.err='Kova could not read a body fat from that picture. Try a clearer one, front-on, in good light.'; paint(); return; }
        S.out=out; S.ans=null; S.mMe=S.me; S.mWant=S.want; S.col=-1; S.span=0; S.flip=false; S.tab='train'; save(); track('dream_compare',{phase:out.phase||'',focus:(out.focus||[]).length,me:!!S.me});
        paint(); var hh=document.querySelector('#kdp .kdp-photos'); if(hh&&hh.scrollIntoView) hh.scrollIntoView({behavior:'smooth',block:'start'});
        if(String(S.q||'').trim()) coach(S.q);
      })
      .catch(function(e){
        S.busy=false;
        S.err=e&&e.signin?'Sign in and Kova’s AI reads the picture for you, free.':/^4\d\d /.test(String(e&&e.message))?'That picture could not be used. Try another photo or a short video.':e&&e.name==='AbortError'?'Kova\u2019s AI took too long. Try again.':'The connection dropped. Try again.';
        paint();
      });
  }
  /* ---------- Ask Kova: your question, answered with your split, workouts and meals ----------
     A second call, text only: the question, what the pictures showed, and
     Kova's own numbers (phase, calories, macros, days). The meals are added
     up here and shown against the target, so nothing is taken on trust. */
  var COACH='You are Kova, a strength and nutrition coach in a fitness app. Answer the user\'s question about getting the physique they want, using only the facts given. Plain words a 12-year-old understands, no hype, no drugs, no supplements beyond protein powder and creatine. Reply with JSON only:\n'
    +'{"answer":"2 to 4 sentences that answer the question directly","steps":["up to 5 specific things to do, each one line"],'
    +'"split":[{"day":"Day 1","focus":"what this day trains","ex":[{"n":"exercise name","sets":3,"reps":"8-12","note":"one short cue or empty"}]}],'
    +'"meals":[{"meal":"Breakfast","food":"foods with grams or cups","kcal":0,"p":0,"c":0,"f":0}],"tips":["up to 3 short tips"]}\n'
    +'Rules: the split has exactly the number of training days given; train the muscles the user asks about (or the focus muscles) 2 to 3 times a week; 4 to 6 exercises a day; every exercise is 2 or 3 working sets (never more); common gym exercises; for glutes use hip thrusts, Romanian deadlifts, Bulgarian split squats, cable kickbacks and similar; for chest and arms use presses, flyes, curls and triceps work and similar. The meals are one full day (3 to 5 meals) that add up to the calories, protein, carbs and fat given, within 5%; give each meal\'s numbers honestly. Under 18: no calorie deficit. Never say who anyone in a photo is.';
  function coach(q){
    var o=S.out, K=window.KovaModel; q=String(q||'').trim();
    if(!o||!q) return;
    if(!(K&&K.connected())){ S.ansErr='Sign in and Kova answers you.'; paint(); return; }
    var Y=you(), days=(Y.p&&Y.p.train&&Y.p.train.days)||((kp('plan')||{}).days||[]).length||4;
    var facts='The user: '+(Y.sex==='f'?'woman':'man')+(Y.age?', '+Y.age:'')+(Y.hcm?', '+Math.round(Y.hcm)+' cm':'')+(Y.kg?', '+Math.round(Y.kg)+' kg':'')+(o.bf!=null?', about '+o.bf+'% body fat':'')+'. Trains '+days+' days a week.\n'
      +'The body they want: '+(o.looks||'')+' About '+o.tbf+'% body fat'+(o.build?', '+o.build:'')+'. Stands out: '+(o.standout||[]).join(', ')+'.\n'
      +'Muscles to build more: '+(o.focus||[]).map(function(f){ return f.m+' ('+f.why+')'; }).join('; ')+'.\n'
      +(o.kcal?'Kova\'s numbers for them: phase '+o.phase+', '+o.kcal+' calories, '+o.p+' g protein, '+o.c+' g carbs, '+o.f+' g fat a day'+(o.fat>0.5?', about '+o.fat+' kg of fat to lose':'')+(o.musMid>0?', about '+o.musMid+' kg of muscle to build':'')+', about '+o.weeks+' weeks.':'No calorie numbers yet (height, weight or age missing): give the meals as portions without totals.')+'\n'
      +'Their question: '+q.slice(0,400);
    S.coaching=true; S.ansErr=''; S.lastQ=q; paint();
    var c=K.cfg(), P=K.providers[c.p];
    var req=P.build(c.key,c.model,COACH,[{role:'user',content:facts}],{temperature:0.2,max_tokens:1800});
    var ctl=typeof AbortController!=='undefined'?new AbortController():null, tm=ctl?setTimeout(function(){ ctl.abort(); },60000):0;
    var once=function(){ return fetch(P.url,{method:'POST',headers:req.headers,body:req.body,signal:ctl?ctl.signal:undefined}).then(function(r){ if(!r.ok) return r.text().then(function(t){ throw new Error(r.status+' '+String(t).slice(0,120)); }); return r.json(); }); };
    once().catch(function(e){ if(e&&e.name!=='AbortError'&&!/^4\d\d /.test(String(e.message))) return new Promise(function(ok){ setTimeout(ok,1200); }).then(once); throw e; })
      .then(function(d){
        clearTimeout(tm); S.coaching=false;
        var raw=(P.read(d)||'').replace(/```json|```/g,'').trim(), a=raw.indexOf('{'), z=raw.lastIndexOf('}');
        var j=null; try{ j=JSON.parse(raw.slice(a,z+1)); }catch(x){}
        if(!j||!j.answer){ S.ansErr='Kova’s answer came back in a form it could not read. Ask again.'; paint(); return; }
        S.ans=cleanAns(j,q,days); keepAns(); track('dream_ask',{days:S.ans.split.length,meals:S.ans.meals.length});
        paint(); var el=document.querySelector('#kdp .kdp-ans'); if(el&&el.scrollIntoView) el.scrollIntoView({behavior:'smooth',block:'start'});
      })
      .catch(function(e){ clearTimeout(tm); S.coaching=false; S.ansErr=e&&e.name==='AbortError'?'Kova took too long to answer. Ask again.':'The connection dropped. Ask again.'; paint(); });
  }
  /* what came back, checked: real days, 2-3 working sets, meals added up here */
  function cleanAns(j,q,days){
    var str=function(v,n){ return String(v==null?'':v).slice(0,n||200); };
    var split=(Array.isArray(j.split)?j.split:[]).slice(0,7).map(function(d){
      return {day:str(d.day,30),focus:str(d.focus,80),ex:(Array.isArray(d.ex)?d.ex:[]).slice(0,7).map(function(x){ var n=+x.sets; return {n:str(x.n,60),sets:n>=2&&n<=3?n:(n>3?3:2),reps:str(x.reps,12)||'8-12',note:str(x.note,80)}; }).filter(function(x){ return x.n; })};
    }).filter(function(d){ return d.ex.length; });
    var meals=(Array.isArray(j.meals)?j.meals:[]).slice(0,6).map(function(m){ var n=function(v){ v=Math.round(+v); return v>=0&&v<5000?v:0; }; return {meal:str(m.meal,30),food:str(m.food,240),kcal:n(m.kcal),p:n(m.p),c:n(m.c),f:n(m.f)}; }).filter(function(m){ return m.food; });
    var tot={kcal:0,p:0,c:0,f:0}; meals.forEach(function(m){ tot.kcal+=m.kcal; tot.p+=m.p; tot.c+=m.c; tot.f+=m.f; });
    return {q:q,answer:str(j.answer,900),steps:(Array.isArray(j.steps)?j.steps:[]).slice(0,5).map(function(x){ return str(x,200); }),split:split,meals:meals,tot:tot,tips:(Array.isArray(j.tips)?j.tips:[]).slice(0,3).map(function(x){ return str(x,200); }),days:days};
  }
  function keepAns(){ var k=kp(KEY); if(k){ k.ans=S.ans; kset(KEY,k); } }
  function thumb(d){
    return new Promise(function(ok){ setTimeout(function(){ ok(''); },2500); try{ var im=new Image(); im.onload=function(){ var s=140/Math.max(im.width,im.height), c=document.createElement('canvas'); c.width=Math.round(im.width*s); c.height=Math.round(im.height*s); c.getContext('2d').drawImage(im,0,0,c.width,c.height); ok(c.toDataURL('image/jpeg',0.7)); }; im.onerror=function(){ ok(''); }; im.src=d; }catch(e){ ok(''); } });
  }
  function save(){
    var o=S.out; if(!o) return;
    var keep={at:Date.now(),out:o,res:S.res};
    thumb(S.want).then(function(t){ keep.thumb=t; keep.ans=S.ans||null; kset(KEY,keep); decorate(); });
  }

  /* ---------- the card on Workout ---------- */
  function card(){
    var k=kp(KEY), o=k&&k.out, Y=you();
    var h='<div class="kv-card kdp-card" id="kdpCard"><div class="kv-h"><span>DREAM PHYSIQUE</span>'+(o?'<span class="kdp-k">'+esc(o.phase==='cut'?'Cut first':o.phase==='lean'?'Lean out':o.phase==='leanbulk'?'Build':'Recomp')+'</span>':'')+'</div>';
    if(o&&o.bf!=null){
      h+='<div class="kdp-row">'+(k.thumb?'<img class="kdp-th" src="'+esc(k.thumb)+'" alt="The body you want"/>':'')
        +'<div class="kdp-mini"><div><b>'+o.bf+'%</b><span>you now</span></div><span class="kdp-ar">'+ic('arrow-right')+'</span><div><b>'+o.tbf+'%</b><span>your goal</span></div></div></div>'
        +'<div class="krc-l">'+esc(lineOf(o,Y))+'</div>';
    } else if(o){
      h+='<div class="krc-l">Your goal is saved. Add your height, weight and age so Kova can work out what to gain, lose and eat.</div>';
    } else {
      h+='<div class="krc-l">Send a photo or video of the body you want, from an actor, an athlete or anyone. Add one of you and Kova lights up what to build on your own body, maps your change and writes your split and meals.</div>';
    }
    return h+'<div class="kl-acts krc-acts"><div class="chip on km-cta" data-kdp="open" role="button" tabindex="0">'+(o?'Open my dream physique':'Find my dream physique')+'</div></div></div>';
  }
  function lineOf(o,Y){
    var bits=[];
    if(o.fat>0.5) bits.push('Lose about '+wt(o.fat,Y.unit)+' of fat');
    if(o.musMid>0) bits.push((bits.length?'build ':'Build ')+'about '+wt(o.musMid,Y.unit)+' of muscle');
    if(o.focus&&o.focus.length) bits.push((bits.length?'focus on ':'Focus on ')+o.focus.slice(0,2).map(function(f){ return NAME[f.m].replace(/ \(.*\)/,'').toLowerCase(); }).join(' and '));
    return (bits.join(', ')||'You are close: keep training and eating as you are')+'.';
  }
  function decorate(){
    var sc=document.getElementById('s-move'); if(!sc||!sc.classList.contains('on')) return;
    var host=document.querySelector('#s-move .kl-acts:not(.kz2-acts):not(.krc-acts)'); if(!host) return;
    var have=document.getElementById('kdpCard'), html=card();
    if(have){ if(have.__h!==html){ have.outerHTML=html; var n0=document.getElementById('kdpCard'); if(n0) n0.__h=html; } return; }
    /* right under Training, above Muscle recovery */
    (host.closest('.kv-card')||host).insertAdjacentHTML('afterend',html);
    var n=document.getElementById('kdpCard'); if(n) n.__h=html;
  }

  /* ---------- the page ---------- */
  function page(){
    var Y=you(), k=kp(KEY), o=S.out||(k&&k.out), r=S.res||(k&&k.res);
    var want=S.want||(k&&k.thumb)||'';
    var h='<div class="kz2p-wrap"><div class="kz2p-top"><button type="button" class="back" data-kdp="close" aria-label="Back">'+ic('chevron-left')+'</button>'
      +'<div class="kz2p-tt"><div class="kz2p-k">WORKOUT</div><div class="title">Dream physique</div></div>'
      +'<button type="button" class="iconbtn kz2p-q" data-kdp="tour" aria-label="Show me around Dream physique">?</button></div>';
    var err=S.err?'<div class="kdp-err" role="alert">'+esc(S.err)+(/Sign in/.test(S.err)?' <button type="button" class="chip" data-kdp="signin">Sign in</button>':'')+'</div>':'';
    if(o){
      /* after a compare the pictures in are one small row; the result is the page */
      h+='<section class="card kdp-in kdp-in-s"><div class="kdp-tbs">'
        +'<button type="button" class="kdp-tb" data-kdp="want">'+(want?'<img class="kdp-want" src="'+esc(want)+'" alt="The body you want"/>':'<i>'+ic('video')+'</i>')+'<span>Goal</span></button>'
        +'<button type="button" class="kdp-tb" data-kdp="me">'+(S.me?'<img class="kdp-me" src="'+esc(S.me)+'" alt="You now"/>':'<i>'+ic('plus')+'</i>')+'<span>'+(S.me?'You':'Add you')+'</span></button>'
        +'<button type="button" class="kdp-tb" data-kdp="link"><i>'+ic('arrow-up-right')+'</i><span>Link</span></button>'
        +'<button type="button" class="kz2p-go kdp-go" data-kdp="compare"'+(S.want&&!S.busy?'':' disabled')+'>'+ic('sparkles')+'<span>'+(S.busy?'Reading…':'Compare again')+'</span></button></div>'
        +'<div class="kdp-you">'+youLine(Y)+'</div>'+err+'</section>';
      return h+results(o,Y,r)+'</div>';
    }
    /* the two pictures in */
    h+='<section class="card kdp-in"><div class="kz2p-k">THE BODY YOU WANT</div>'
      +(want?'<img class="kdp-want" src="'+esc(want)+'" alt="The body you want"/>':'<div class="sub">A photo or a short video of the body you want: an actor, an athlete, an influencer, anyone. Kova reads the body, never who it is.</div>')
      +'<div class="kdp-ways"><button type="button" class="chip" data-kdp="want">'+ic('video')+(want?'Change it':'Photo or video')+'</button><button type="button" class="chip" data-kdp="link">'+ic('arrow-up-right')+'Paste a link</button></div>'
      +'<div class="kz2p-k" style="margin-top:14px">YOU NOW, OPTIONAL</div>'
      +(S.me?'<img class="kdp-me" src="'+esc(S.me)+'" alt="You now"/>':'<div class="sub">A photo of you, front-on, and Kova marks what to build on your own body. Without it Kova uses your height, weight and age.</div>')
      +'<div class="kdp-ways"><button type="button" class="chip" data-kdp="me">'+ic('video')+(S.me?'Change my photo':'Add my photo')+'</button></div>'
      +'<div class="kdp-you">'+youLine(Y)+'</div>'
      +'<label class="kz2p-k kdp-ql" for="kdpQ" style="display:block;margin-top:14px">WHAT DO YOU WANT? OPTIONAL</label>'
      +'<textarea id="kdpQ" class="srch kdp-q" rows="2" maxlength="400" placeholder="'+esc(Y.sex==='f'?'How do I make my glutes bigger like her?':'How do I get my chest and arms bigger like him?')+'">'+esc(S.q||'')+'</textarea>'
      +'<button type="button" class="kz2p-go kdp-go" data-kdp="compare"'+(S.want&&!S.busy?'':' disabled')+'>'+ic('sparkles')+'<span>'+(S.busy?'Reading the pictures…':'Compare')+'</span></button>'
      +err+'</section>';
    return h+'</div>';
  }
  function youLine(Y){
    if(!Y.kg||!Y.hcm||!Y.age) return 'Your numbers: '+(Y.kg?wt(Y.kg,Y.unit):'weight not set')+(Y.hcm?', '+ht(Y.hcm,Y.unit):'')+'. <button type="button" class="kdp-link" data-kdp="maint">Add height, weight and age</button>';
    return 'You: '+(Y.sex==='f'?'woman':'man')+', '+Y.age+', '+ht(Y.hcm,Y.unit)+', '+wt(Y.kg,Y.unit)+(Y.bf?', about '+Math.round(Y.bf)+'% body fat':'')+'. <button type="button" class="kdp-link" data-kdp="maint">Change</button>';
  }
  function nm(m){ return NAME[m].replace(/ \(.*\)/,''); }
  /* a photo with the focus muscles lit on it in Kova's look: a soft orange
     glow shaped and angled along each muscle with a fine light edge, a thin
     line out to a small glass label (the owner: "use the real person's body
     and highlight what they need to fix", in Kova's design) */
  var GID=0;
  function marked(src,marks,label,cls,ar){
    ar=ar>0.2&&ar<5?ar:1.25;
    var H=100*ar, g='kdpg'+(++GID), shapes='', lines='', tags='', by={}, order=[], side={L:[],R:[]};
    marks.forEach(function(k){
      var cx=k.x*100, cy=k.y*H, rx=Math.max(1.2,k.wid*50), ry=Math.max(1.6,k.len*50);
      shapes+='<ellipse class="kdp-mk" data-m="'+k.m+'" cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" rx="'+rx.toFixed(1)+'" ry="'+ry.toFixed(1)+'" transform="rotate('+(+k.a||0).toFixed(0)+' '+cx.toFixed(1)+' '+cy.toFixed(1)+')" fill="url(#'+g+')"/>';
      if(!by[k.m]){ by[k.m]=[]; order.push(k.m); } by[k.m].push({k:k,cx:cx,cy:cy});
    });
    /* one label per muscle, sides taken in turn (the mark on that side), a
       short line out from the muscle, labels at least 8% apart */
    order.forEach(function(m){
      var sd=side.L.length<=side.R.length?'L':'R', L=by[m].slice().sort(function(a,b){ return sd==='L'?a.cx-b.cx:b.cx-a.cx; });
      side[sd].push(L[0]);
    });
    ['L','R'].forEach(function(sd){
      var L=side[sd].sort(function(a,b){ return a.cy-b.cy; }), last=-99;
      L.forEach(function(t){
        var y=Math.max(t.cy,last+H*0.08,H*0.04); y=Math.min(y,H*0.96); last=y;
        var lx=sd==='L'?Math.max(28,Math.min(t.cx-6,t.cx-22<28?28:t.cx-22)):Math.min(72,Math.max(t.cx+6,t.cx+22>72?72:t.cx+22));   /* room for the label's words */
        lines+='<line class="kdp-ln" x1="'+t.cx.toFixed(1)+'" y1="'+t.cy.toFixed(1)+'" x2="'+lx.toFixed(1)+'" y2="'+y.toFixed(1)+'"/><circle class="kdp-dot" cx="'+t.cx.toFixed(1)+'" cy="'+t.cy.toFixed(1)+'" r="1.1"/>';
        tags+='<span class="kdp-ml kdp-ml-'+sd+'" style="top:'+(y/H*100).toFixed(1)+'%;'+(sd==='L'?'right:'+(100-lx).toFixed(1)+'%':'left:'+lx.toFixed(1)+'%')+'"><i></i>'+esc(nm(t.k.m))+'</span>';
      });
    });
    return '<figure class="kdp-pf '+(cls||'')+'"><div class="kdp-pw"><img src="'+esc(src)+'" alt="'+esc(label)+'"/>'
      +'<svg viewBox="0 0 100 '+H.toFixed(1)+'" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><radialGradient id="'+g+'"><stop offset="0" stop-color="#FFA36B" stop-opacity=".9"/><stop offset=".55" stop-color="#E87A3C" stop-opacity=".5"/><stop offset="1" stop-color="#E87A3C" stop-opacity=".08"/></radialGradient></defs>'+shapes+lines+'</svg>'+tags+'</div></figure>';
  }
  function results(o,Y,r){
    return hero(o,Y)+timeline(o,Y)+planCard(o,Y)+honest(o);
  }
  /* 1. what to build, on you: your own photo when you added one */
  function hero(o,Y){
    var mk=o.marks||[], mY=S.me&&S.me===S.mMe?mk.filter(function(k){ return k.img===2; }):[], mT=S.want&&S.want===S.mWant?mk.filter(function(k){ return k.img===1; }):[];
    var onYou=mY.length&&!(S.flip&&mT.length), onGoal=!onYou&&mT.length, h='<section class="card kdp-photos"><div class="kz2p-k">'+(onYou?'WHAT TO BUILD, ON YOU':onGoal?'WHAT TO BUILD, ON YOUR GOAL':'WHAT TO BUILD')+'</div>';
    if(onYou) h+=marked(S.me,mY,'You now','kdp-you-p',S.meAR);
    else if(onGoal) h+=marked(S.want,mT,'Your goal','kdp-goal-p',S.wantAR);
    if(onYou&&mT.length) h+='<button type="button" class="kdp-sw" data-kdp="flip"><img src="'+esc(S.want)+'" alt=""/><span><b>Your goal</b>See what to build marked on it</span>'+ic('chevron-right')+'</button>';
    else if(onGoal&&mY.length) h+='<button type="button" class="kdp-sw" data-kdp="flip"><img src="'+esc(S.me)+'" alt=""/><span><b>You now</b>Back to it marked on you</span>'+ic('chevron-right')+'</button>';
    else if(!mY.length) h+='<button type="button" class="kdp-sw kdp-sw-add" data-kdp="me"><i>'+ic('plus')+'</i><span><b>Add a photo of you</b>Kova marks what to build on your own body</span>'+ic('chevron-right')+'</button>';
    if(o.focus&&o.focus.length) h+='<ol class="kdp-mus">'+o.focus.map(function(x){ return '<li><b>'+esc(nm(x.m))+'</b><span>'+esc(x.why||'')+'</span></li>'; }).join('')+'</ol>';
    else h+='<div class="sub">Nothing stands out to build more: you are close in muscle.</div>';
    return h+'<div class="kdp-conf">'+(o.confidence==='high'?'A clear read.':o.confidence==='low'?'A rough read.':'A fair read.')+(o.visible&&!(o.visible.upper&&o.visible.lower)?' '+(o.visible.upper?'Upper body only.':'Lower body only.'):'')+(mY.length?' Your photo stays on this phone for now and is not saved.':'')+'</div></section>';
  }
  /* 2. your change over time, after the owner's reference: 3 month / 6 month
     / 1 year pills, a dashed track for each point in time, the dream as the
     orange tick at the top, where you will be as the bar, and a floating
     card with the big number. Kova's maths at the same pace as the time
     estimate: the fat first, then the muscle. */
  var SPAN={3:{wk:13,n:'3 months',l:['Now','2 wk','4 wk','6 wk','8 wk','10 wk','3 mo']},6:{wk:26,n:'6 months',l:['Now','1 mo','2 mo','3 mo','4 mo','5 mo','6 mo']},12:{wk:52,n:'1 year',l:['Now','2 mo','4 mo','6 mo','8 mo','10 mo','1 yr']}};
  function at(o,wk){
    var fat=o.fat>0.5?o.fat:0, gain=o.fat<0?-o.fat:0, mus=o.musMid||0, lw=o.lossWk||0.3, mw=o.musWk||0.2;
    var lost=Math.min(fat,lw*wk), wCut=fat?fat/lw:0, built=wk>wCut?Math.min(mus,mw*(wk-wCut)):0;
    var add=mus>0?gain*built/mus:0, kg=o.kg-lost+built+add, all=fat+mus;
    return {pct:all>0?Math.min(100,Math.round((lost+built)/all*100)):100,kg:kg,bf:(o.kg*o.bf/100-lost+add)/kg*100,lost:lost,built:built};
  }
  function w1(kg,unit){ var v=unit==='kg'?kg:kg/LB; return (v<10?Math.round(v*10)/10:Math.round(v))+(unit==='kg'?' kg':' lb'); }
  function timeline(o,Y){
    var h='<section class="card kdp-tl"><div class="kz2p-k">YOUR CHANGE</div>';
    if(o.bf==null) return h+'<div class="sub">Add your height, weight and age and Kova maps out your change: 3 months, 6 months and a year from now.</div><button type="button" class="chip" data-kdp="maint">Add them</button></section>';
    var sp=SPAN[S.span]?S.span:o.weeks<=13?3:o.weeks<=26?6:12, D=SPAN[sp], pts=[], i;
    for(i=0;i<7;i++) pts.push(at(o,D.wk*i/6));
    var sel=S.col>=0&&S.col<7?S.col:6, P=pts[sel], dk=P.kg-o.kg, br=P.pct>50;   /* the card never covers the picked bar: above a low one, below a high one */
    h+='<div class="kdp-pills" role="group" aria-label="How far ahead">'+[3,6,12].map(function(s){ return '<button type="button" class="'+(s===sp?'on':'')+'" aria-pressed="'+(s===sp)+'" data-kdp="span" data-s="'+s+'">'+SPAN[s].n+'</button>'; }).join('')+'</div>'
      +'<div class="kdp-ch"><div class="kdp-ax"><span>Dream</span><span>50%</span><span>Now</span></div><div class="kdp-cols">'
      +pts.map(function(p,i){ return '<button type="button" class="kdp-col'+(i===sel?' on':'')+(p.pct>=100?' done':'')+'" data-kdp="col" data-i="'+i+'" aria-label="'+esc(D.l[i]+': '+p.pct+'% of the way')+'"><span class="kdp-trk"><i class="kdp-tg"></i><i class="kdp-bar" style="bottom:'+p.pct+'%"></i></span><span class="kdp-xl">'+esc(D.l[i])+'</span></button>'; }).join('')
      +'</div><div class="kdp-fc'+(br?' br':'')+'" aria-live="polite"><div class="kdp-fn">'+P.pct+'<small>%</small><em>'+(Math.abs(dk)<0.25?'same weight':(dk<0?'−':'+')+w1(Math.abs(dk),Y.unit)+' '+(dk<0?'↘':'↗'))+'</em></div>'
      +'<div class="kdp-fl">'+(sel?'of the way to your dream body, '+(P.pct>=100?'there by ':'at ')+esc(D.l[sel].replace('wk','weeks').replace('mo','months').replace('1 months','1 month').replace('1 yr','1 year')):'where you start')+'</div></div></div>'
      +'<div class="kdp-nums"><div><b>'+o.bf+'→'+Math.round(P.bf)+'%</b><span>body fat</span></div><div><b>'+(P.lost>0.05?'−'+w1(P.lost,Y.unit):'0')+'</b><span>fat lost</span></div><div><b>'+(P.built>0.05?'+'+w1(P.built,Y.unit):'0')+'</b><span>muscle built</span></div></div>'
      +'<div class="kdp-all">In all: '+(o.fat>0.5?wt(o.fat,Y.unit):'no')+' fat to lose, '+(o.musMid>0?wt(o.musMid,Y.unit)+' muscle to build ('+wt(o.muscle[0],Y.unit)+'–'+wt(o.muscle[1],Y.unit)+')':'no muscle to build')+', about '+(o.weeks>=8?Math.round(o.weeks/4.3)+' months':o.weeks+' weeks')+' at a steady pace. An estimate if you follow the plan: the fat first, then about '+w1((o.musWk||0.2)*4.33,Y.unit)+' of muscle a month.</div>';
    return h+'</section>';
  }
  /* 3. the plan: Train / Eat / Steps, Kova's own until you ask, then the answer */
  function planCard(o,Y){
    var A=S.ans, tab=S.tab||'train', h='<section class="card kdp-ans"><div class="kz2p-k">YOUR PLAN</div>';
    if(A) h+='<div class="kdp-aq">“'+esc(A.q)+'”</div><p class="kdp-aa">'+esc(A.answer)+'</p>';
    h+='<div class="kdp-pills" role="tablist">'+[['train','Train'],['eat','Eat'],['do','Steps']].map(function(t){ return '<button type="button" role="tab" class="'+(t[0]===tab?'on':'')+'" aria-selected="'+(t[0]===tab)+'" data-kdp="tab" data-t="'+t[0]+'">'+t[1]+'</button>'; }).join('')+'</div>';
    h+='<div class="kdp-tab">'+(tab==='eat'?eatTab(o,Y,A):tab==='do'?stepsTab(o,Y,A):trainTab(o,Y,A))+'</div>';
    h+='<div class="kdp-ask">'+(A?'':'<div class="sub">Ask what you want, like “'+esc(Y.sex==='f'?'how do I make my glutes bigger like her?':'how do I get my chest and arms bigger like him?')+'”, and Kova writes your split and a day of meals.</div>')
      +'<textarea id="kdpAsk" class="srch kdp-q" rows="2" maxlength="400" placeholder="'+esc(A?'Ask something else':'What do you want to know?')+'"></textarea>'
      +'<button type="button" class="kz2p-go" data-kdp="ask"'+(S.coaching?' disabled':'')+'>'+ic('sparkles')+'<span>'+(S.coaching?'Kova is writing your plan…':'Ask Kova')+'</span></button>'
      +(S.ansErr?'<div class="kdp-err" role="alert">'+esc(S.ansErr)+'</div>':'')+'</div>';
    return h+'</section>';
  }
  function trainTab(o,Y,A){
    var fo=o.focus||[], h='';
    if(A&&A.split.length){
      h+='<div class="kdp-ah">Your split, '+A.split.length+' days</div><div class="kdp-rows">'+A.split.map(function(d,i){ return '<button type="button" class="kdp-row2" data-kdp="day" data-i="'+i+'"><b>'+esc(d.day)+'</b><span>'+esc(d.focus)+'</span><em>'+d.ex.length+' exercise'+(d.ex.length===1?'':'s')+'</em>'+ic('chevron-right')+'</button>'; }).join('')+'</div>'
        +'<button type="button" class="kz2p-go" data-kdp="addsplit">'+ic('plus')+'<span>Add these exercises to my plan</span></button>';
      if(fo.length) h+='<div class="kdp-more">One move for each muscle to build: '+esc(fo.map(function(x){ return MOVE[x.m]; }).join(', '))+'. <button type="button" class="kdp-link" data-kdp="addplan">Add them too</button></div>';
      return h;
    }
    if(!fo.length) return '<div class="sub">Nothing to add: keep your training as it is, or ask Kova below for a split.</div>';
    return '<div class="kdp-rows">'+fo.map(function(x){ return '<div class="kdp-row2"><b>'+esc(MOVE[x.m])+'</b><span>'+esc(nm(x.m))+'</span><em>3 × 8-12, twice a week</em></div>'; }).join('')+'</div>'
      +'<button type="button" class="kz2p-go" data-kdp="addplan">'+ic('plus')+'<span>Add to my plan</span></button>';
  }
  function eatTab(o,Y,A){
    if(!o.kcal) return '<div class="sub">Add your height, weight and age and Kova works out your calories and macros for this goal.</div><button type="button" class="chip" data-kdp="maint">Add them</button>';
    var PH={cut:'Cut first: lose the fat, keep the muscle',lean:'Lean out slowly, get defined',leanbulk:'Build: a small surplus for muscle',maint:'Recomp: hold your weight, build as you go'};
    var h='<div class="kdp-ph">'+esc(PH[o.phase])+'</div><div class="kdp-mac"><div class="kdp-kc"><b>'+o.kcal+'</b><span>calories a day</span></div><div class="kdp-mb">'
      +[['Protein',o.p,4],['Carbs',o.c,4],['Fat',o.f,9]].map(function(m){ var s=Math.round(m[1]*m[2]/o.kcal*100); return '<div><span>'+m[0]+'</span><i><u style="width:'+cl(s,2,100)+'%"></u></i><b>'+m[1]+' g</b></div>'; }).join('')+'</div></div>';
    if(A&&A.meals.length){
      var ok=Math.abs(A.tot.kcal-o.kcal)<=o.kcal*0.08&&Math.abs(A.tot.p-o.p)<=o.p*0.12;
      h+='<ul class="kdp-meals">'+A.meals.map(function(m){ return '<li><b>'+esc(m.meal)+'</b><em>'+(m.kcal?m.kcal+' cal · '+m.p+' g protein':'')+'</em><span>'+esc(m.food)+'</span></li>'; }).join('')+'</ul>'
        +(A.tot.kcal?'<div class="kdp-tot'+(ok?'':' off')+'">Adds up to '+A.tot.kcal+' calories and '+A.tot.p+' g protein'+(ok?', on your target ('+o.kcal+' and '+o.p+' g).':'. Your target is '+o.kcal+' and '+o.p+' g: adjust the portions to match.')+'</div>':'');
    }
    return h+'<div class="kdp-more">Worked out like Fuel: your maintenance is about '+o.maint+' calories.</div><button type="button" class="kz2p-go" data-kdp="useplan">'+ic('check')+'<span>Use this plan in Fuel</span></button>';
  }
  function stepsTab(o,Y,A){
    var st=A&&A.steps.length?A.steps:[];
    if(!st.length){
      if(o.kcal) st.push('Eat about '+o.kcal+' calories with '+o.p+' g of protein a day.');
      if(o.focus&&o.focus.length) st.push('Train '+o.focus.slice(0,3).map(function(x){ return nm(x.m).toLowerCase(); }).join(', ')+' twice a week, 2 to 3 hard sets each.');
      if(o.fat>0.5) st.push('Lose about '+wt(o.fat,Y.unit)+' of fat first'+(o.musMid>0?', then build about '+wt(o.musMid,Y.unit)+' of muscle':'')+'.');
      else if(o.musMid>0) st.push('Build about '+wt(o.musMid,Y.unit)+' of muscle with a small surplus.');
      st.push('Add a rep or a little weight each week, and sleep 7 to 9 hours.');
    }
    return '<ol class="kdp-steps">'+st.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ol>'
      +(A&&A.tips.length?'<ul class="kdp-tips">'+A.tips.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul>':'');
  }
  function daySheet(i){
    var A=S.ans, d=A&&A.split[i]; if(!d||!window.openSheet) return;
    openSheet('<div class="kdp-sh"><div class="title-s" style="font-size:17px">'+esc(d.day)+'</div><div class="sub" style="margin:2px 0 10px">'+esc(d.focus)+'</div><ul class="kdp-exs">'
      +d.ex.map(function(x){ return '<li><b>'+esc(x.n)+'</b><em>'+x.sets+' × '+esc(x.reps)+'</em>'+(x.note?'<span>'+esc(x.note)+'</span>':'')+'</li>'; }).join('')+'</ul></div>');
  }
  /* 4. what Kova saw and how sure it is */
  function honest(o){
    var notes=(o.note||[]).concat(o.caveat?[o.caveat]:[]).concat(['A body fat read from a photo is an estimate, within about 3 points. Lighting, a pump and posing change how a body looks.']);
    return '<section class="card kdp-honest"><div class="kz2p-k">GOOD TO KNOW</div><p class="kdp-looks"><b>Your goal:</b> '+esc(o.looks||'')+' About '+o.tbf+'% body fat'+(o.build?', '+esc(o.build)+' build':'')+'.'
      +(o.standout&&o.standout.length?' What stands out: '+esc(o.standout.map(function(m){ return nm(m).toLowerCase(); }).join(', '))+'.':'')+'</p>'
      +(o.cues&&o.cues.length?'<p>Kova saw: '+esc(o.cues.join(', '))+(o.youCues&&o.youCues.length?'. In your photo: '+esc(o.youCues.join(', ')):'')+'.</p>':'')
      +notes.map(function(n){ return '<p>'+esc(n)+'</p>'; }).join('')+'</section>';
  }
  function addSplit(){
    var A=S.ans, G=window.KovaGoal; if(!A||!G||!G.addToPlan) return;
    var added=[], why='';
    A.split.forEach(function(d){ d.ex.forEach(function(x){ var r=G.addToPlan(x.n,x.sets,x.reps); if(r&&r.ok) added.push(x.n); else if(r&&r.msg&&!why) why=r.msg; }); });
    track('dream_addsplit',{n:added.length});
    say(added.length?'Added '+added.length+' exercise'+(added.length===1?'':'s')+' to your plan.':(why||'They are already in your plan.'));
  }
  function paint(){ var el=document.getElementById('kdp'); if(!el) return; var y=el.scrollTop; el.innerHTML=page(); el.scrollTop=y; }
  function open(){
    var el=document.getElementById('kdp');
    if(!el){ el=document.createElement('div'); el.id='kdp'; el.className='kz2p kdp'; el.setAttribute('role','dialog'); el.setAttribute('aria-label','Dream physique'); (document.getElementById('app')||document.body).appendChild(el); }
    var k=kp(KEY); if(!S.out&&k&&k.out){ S.out=k.out; S.res=k.res; S.ans=k.ans||null; }
    paint(); S.open=true; track('dream_open',{});
    if(window.KovaTour&&KovaTour.once&&KovaTour.once('dreampage')) setTimeout(tour,500);
  }
  function close(){ var el=document.getElementById('kdp'); if(el) el.remove(); S.open=false; decorate(); }

  /* ---------- pictures in ---------- */
  var file=null;
  function pick(which){
    if(!file){ file=document.createElement('input'); file.type='file'; file.accept='image/*,video/*'; file.style.display='none'; document.body.appendChild(file); }
    file.value=''; file.onchange=function(){ var f=file.files&&file.files[0]; if(f) take(f,which); };
    file.click();
  }
  function take(f,which){
    var set=function(d){ if(!d){ S.err='Kova could not open that file. Try a photo.'; paint(); return; } if(which==='me') S.me=d; else { S.want=d; S.hint=''; } S.err=''; paint(); arOf(d,which); if(S.out&&!S.busy) compare(); };
    if(/^video\//.test(f.type)){
      var g=window.KovaLook&&KovaLook.videoStills?KovaLook.videoStills(f):Promise.resolve([]);
      g.then(function(st){ set(st&&st.length?st[Math.min(1,st.length-1)]:''); });
      return;
    }
    var fr=new FileReader(); fr.onload=function(){ set(String(fr.result)); }; fr.readAsDataURL(f);
  }
  /* the shape of each picture, so the drawn muscles sit exactly on it */
  function arOf(d,which){ try{ var im=new Image(); im.onload=function(){ var w=im.naturalWidth||im.width, h=im.naturalHeight||im.height; if(w&&h){ if(which==='me') S.meAR=h/w; else S.wantAR=h/w; } }; im.src=d; }catch(e){} }
  function linkSheet(){
    if(!window.openSheet) return;
    openSheet('<div class="mc-link"><div class="title-s" style="font-size:17px">Paste a link</div><div class="sub" style="margin:4px 0 10px;line-height:1.5">A YouTube, TikTok or Instagram video, or any page with a picture of the body you want.</div>'
      +'<input class="srch" id="kdpUrl" inputmode="url" autocomplete="off" placeholder="https://..." style="width:100%"/><button class="btn" id="kdpUrlGo" style="margin-top:10px;width:100%">Use this link</button><div class="sub" id="kdpUrlMsg" style="margin-top:8px"></div></div>');
    var inp=document.getElementById('kdpUrl'), go2=document.getElementById('kdpUrlGo'), msg=document.getElementById('kdpUrlMsg');
    go2.onclick=function(){
      var u=String(inp.value||'').trim(); if(!/^https?:\/\/\S+\.\S+/.test(u)){ msg.textContent='That does not look like a link. It starts with https://'; return; }
      if(!(window.KovaLink&&KovaLink.authFetch)||!(window.KovaModel&&KovaModel.connected())){ msg.textContent='Sign in first: reading a link uses Kova’s AI.'; return; }
      go2.disabled=true; msg.textContent='Reading the link…';
      KovaLink.authFetch('/scan/link',{json:{url:u}}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j&&j.error||'That link could not be read.'); return j; }); })
        .then(function(j){ if(!j.image) throw new Error('That link has no picture Kova can read. Try a screenshot.'); if(window.closeSheet) closeSheet(); S.want=j.image; arOf(j.image,'want'); S.hint=j.title?'The picture comes from a video or page titled "'+String(j.title).slice(0,120)+'" (do not identify anyone).':''; S.err=''; paint(); })
        .catch(function(e){ go2.disabled=false; msg.textContent=String(e&&e.message||e).slice(0,160); });
    };
  }

  /* ---------- acting on it ---------- */
  function addPlan(){
    var o=S.out||(kp(KEY)||{}).out; if(!o||!o.focus) return;
    var G=window.KovaGoal; if(!G||!G.addToPlan){ say('Open Workout once, then try again.'); return; }
    var added=[], why='';
    o.focus.forEach(function(x){ var r=G.addToPlan(MOVE[x.m],3,'8-12'); if(r&&r.ok) added.push(MOVE[x.m]); else if(r&&r.msg&&!why) why=r.msg; });
    track('dream_addplan',{n:added.length});
    say(added.length?'Added to your split: '+added.join(', ')+'.':(why||'Already in your plan.'));
  }
  function usePlan(){
    var o=S.out||(kp(KEY)||{}).out, M=window.KovaMaint; if(!o||!o.q||!M||!M.save) return;
    var q=JSON.parse(JSON.stringify(o.q)); q.applied=true; q.v=1;
    try{ M.save(q); }catch(e){ kset('maint',q); }
    track('dream_useplan',{phase:o.phase});
    say('Fuel now uses this plan: '+o.kcal+' calories, '+o.p+' g protein a day.');
  }

  /* ---------- its own tour (the owner's rule: every new page shows you around) ---------- */
  var TOUR=[['.kdp-in','The body you want','A photo, a video or a link. Add a photo of you too and your side is exact.'],
    ['.kdp-go','Compare','Kova reads the body (never who it is) and works out the rest itself: what to lose, what to build, how to eat.'],
    ['.kdp-in .kdp-you','Your numbers','Your height, weight and age set the calories and the weight that look is on your frame.']];
  function tour(){
    if(!window.KovaTour||!KovaTour.run) return;
    var el=document.getElementById('kdp'); if(!el) return;
    var steps=TOUR.concat(S.out?[['.kdp-photos','What to build','The glowing areas are the muscles to build more, on your own photo when you add one.'],['.kdp-tl','Your change','3 months, 6 months or a year: where you will be if you follow the plan. Tap a point in time.'],['.kdp-ans','Your plan','Train, Eat and Steps. Ask Kova anything and it writes your split and meals.']]:[])
      .filter(function(t){ return el.querySelector(t[0]); })
      .map(function(t){ return {t:t[1],d:t[2],el:function(){ return el.querySelector(t[0]); }}; });
    KovaTour.run(steps,{color:'#E87A3C'});
    var tt=document.getElementById('ksTour'); if(tt) tt.style.zIndex='9700';
  }

  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-kdp]'); if(!b) return;
    var a=b.getAttribute('data-kdp');
    if(a==='open'){ open(); return; }
    if(a==='close'){ close(); return; }
    if(a==='tour'){ tour(); return; }
    if(a==='want'){ pick('want'); return; }
    if(a==='me'){ pick('me'); return; }
    if(a==='link'){ linkSheet(); return; }
    if(a==='compare'){ var qi=document.getElementById('kdpQ'); if(qi) S.q=qi.value; compare(); return; }
    if(a==='ask'){ var ai=document.getElementById('kdpAsk'), v=ai&&ai.value.trim(); if(!v){ if(ai) ai.focus(); return; } S.q=v; coach(v); return; }
    if(a==='addsplit'){ addSplit(); return; }
    if(a==='span'){ S.span=+b.getAttribute('data-s'); S.col=-1; paint(); return; }
    if(a==='col'){ S.col=+b.getAttribute('data-i'); paint(); return; }
    if(a==='tab'){ S.tab=b.getAttribute('data-t'); paint(); return; }
    if(a==='day'){ daySheet(+b.getAttribute('data-i')); return; }
    if(a==='flip'){ S.flip=!S.flip; paint(); return; }
    if(a==='addplan'){ addPlan(); return; }
    if(a==='useplan'){ usePlan(); return; }
    if(a==='maint'){ close(); if(typeof go==='function') go('maint'); return; }
    if(a==='signin'){ close(); if(typeof go==='function') go('settings'); return; }
  });
  document.addEventListener('input',function(e){ if(e.target&&e.target.id==='kdpQ') S.q=e.target.value; });
  document.addEventListener('keydown',function(e){ var b=e.target.closest&&e.target.closest('.kdp-card [data-kdp][role="button"]'); if(b&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); b.click(); } });
  var pend=0; function soon(){ if(pend) return; pend=setTimeout(function(){ pend=0; if(window.KovaPark&&KovaPark.quiet) KovaPark.quiet(decorate); else decorate(); },100); }
  if(window.MutationObserver) new MutationObserver(function(ms){ for(var i=0;i<ms.length;i++){ var t=ms[i].target; if(!(t.closest&&t.closest('#kdpCard,#kdp,#krcCard,#krsCard,#kz2Card,#kz2,#kpl,[data-kxd],[data-kxd-still]'))){ soon(); return; } } }).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('kova:screen',soon);
  return {open:open,close:close,plan:plan,you:you,card:card,decorate:decorate,at:at,compare:compare,coach:coach,cleanAns:cleanAns,take:take,addPlan:addPlan,addSplit:addSplit,usePlan:usePlan,TOUR:TOUR,SYS:SYS,COACH:COACH,_S:S,LIST:LIST,MOVE:MOVE};
})();
