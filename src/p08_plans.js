/* ===== SUBSCRIPTION =====
   Build your plan. Health is the base (Fuel, Sleep, Vitals); Training and
   Work OS with the AI team are add-ons. Under the hood they are three
   plans in one App Store subscription group, so changing your mind is an
   upgrade or a downgrade, never two bills:
     health        Fuel, Sleep, Vitals and the AI that reads them
     health_train  + Training
     health_work   + Work OS and the AI team
     all           + both (a little less than adding them one by one)
   Training and Work OS are two separate switches: either, both or neither.
   Yearly comes with 30 days free and monthly with 14, from RevenueCat's
   data on 17,000 apps (Sept 2026): annual plans convert best with trials
   of 17-32 days, monthly ones peak at 10-16. The card goes in at the
   start, the reminder comes 2 days before the first charge.
   KovaBilling (src/p08_billing.js) puts the store's own prices in and
   takes the money; the numbers here are the defaults before it does.  */
(function(){
  'use strict';
  var TIERS={
    health:      {n:'Health',            year:59.99,  month:9.99},
    health_train:{n:'Health + Training', year:84.99,  month:13.99},
    health_work: {n:'Health + Work OS',  year:104.99, month:17.99},
    all:         {n:'Everything',        year:119.99, month:19.99}
  };
  var TRIAL={year:30, month:14};
  /* two independent switches */
  var S={period:'year', train:true, work:true};

  function tierOf(train,work){ return train&&work?'all':work?'health_work':train?'health_train':'health'; }
  function tier(){ return tierOf(S.train,S.work); }
  function money(n){ return '$'+n.toFixed(2); }
  /* through window.__paintPlan, so KovaBilling sets the button up again */
  function repaint(){ (window.__paintPlan||paint)(); }
  function store(t,p){ var m=window.__planStore||{}; return m[t+'_'+p]||''; }
  function priceOf(t,p){ return store(t,p)||money(TIERS[t][p]); }
  function add(a,b,p){ var d=TIERS[a][p]-TIERS[b][p]; return '+'+money(d)+(p==='year'?'/yr':'/mo'); }
  /* what turning one part on adds, given the other switch as it is */
  function addOf(part,p){ return part==='train'?add(tierOf(true,S.work),tierOf(false,S.work),p):add(tierOf(S.train,true),tierOf(S.train,false),p); }
  function esc(x){ return String(x).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  /* Sell where you end up, not the features (p19b). Each part is the
     person you become, with a small arrow that opens what changes; the
     price is there, quietly, never the headline. */
  /* The headline sells where you end up; the arrow opens exactly what
     is inside. p38: the owner asked for real depth here, so each line
     says how it works and what it does for you (honest claims only). */
  var PARTS={
    health:{t:'Wake up rested and in control of your energy', tag:'Health', sub:'Fuel, Sleep, Vitals, Recipes and Ask Kova',
      out:[['Scan a barcode or snap your plate','Kova reads the label for you: calories, protein, carbs, fat and every ingredient. It flags what works against you, like added sugar, refined carbs and a lot of salt. Day after day those mean blood sugar spikes and the insulin that follows, cravings, energy crashes, brain fog and water retention: the puffy face and the bloated stomach. Then it fits the food to your day: your training split sets your protein and carbs, so a heavy leg day and a rest day get different targets.'],
           ['Recipes for your goal','Meals built to your calories and protein for the day, every macro counted, so eating right never means doing maths.'],
           ['Spots what you are missing','Protein, fibre, iron, vitamin D, magnesium and water add up through the day. Kova shows what is low before you feel it as tiredness, cramps or cravings.'],
           ['A sleep score each morning, and how to fix tonight','From your watch: how long you slept, how deep, how often you woke and your heart rate overnight. A bright phone in bed keeps your brain switched on and pushes your sleep later, so you wake up tired, hungrier and more stressed, and short sleep throws off the hormones that control hunger. Kova gives you a wind-down time, a bedtime that fits when you have to get up, and tells you when to put the phone down.'],
           ['Heart rate, HRV and stress from your watch','Kova learns your normal over a few weeks. When your resting heart rate climbs or your HRV drops, it is often stress, short sleep, alcohol or getting sick. It tells you the moment it happens and what to do: train easier, sleep earlier, drink water.'],
           ['Alerts on your phone','Sleep is low, it has been days since a workout, it is time for bed: Kova tells you from your own data, even with the app closed.'],
           ['Ask Kova anything','"Why am I bloated?", "why am I always tired?", "what should I eat before training?" Answered from your own food, sleep and training, not a generic article.'],
           ['Cycle and GLP-1 modes','Your calories, training and recovery shift with your cycle. On GLP-1 medication, Kova keeps your protein high so you lose fat, not muscle, and helps you eat enough on low-appetite days.']]},
    train:{t:'Build your dream body, at your pace', tag:'Training', sub:'Workouts, Dream physique, Form Check and progress',
      out:[['Dream physique','Send a photo or video of the body you want: an actor, an athlete, anyone. Kova puts it next to yours, tells you what to gain and what to lose, which muscles to train more, and the calories and macros to get there, for women and men.'],
           ['Any photo, video or link becomes a workout','Saw an exercise online, or a machine you do not know? Send it. Kova names it, shows how to do it with a moving picture and the muscles it works, and adds it to your split in one tap.'],
           ['A whole week built around you','Your goal, the days you can train, the time you have and your equipment. Kova writes your split, 2 to 3 hard sets per exercise, and moves it when life gets busy.'],
           ['Muscle recovery','A body map of what is fresh and what is sore, from the sets you logged. One tap builds today’s workout from the muscles that are ready.'],
           ['Form Check','Film your set. Kova counts the reps, names the exercise and tells you what to fix, like knees caving in or a rounded back.'],
           ['Coach me','Kova talks you through your workout one exercise at a time: the moving picture, your target, a rest timer and a natural voice.'],
           ['Log a set in one tap','"Same" repeats your last set. Records, history and a chart for every lift.'],
           ['And that is the tip of it','Zone 2 running from your heart rate, stretching for every muscle, attachments remembered, and your food and sleep tuned to the body you are building.']]},
    work:{t:'Get your hours back, with an AI team behind you', tag:'Work OS & AI team', sub:'An AI team, tasks, meetings and posting',
      out:[['An AI team that works while you don\u2019t','research, social media and reports'],
           ['Text them like a person','"Ravi, find three venues by 5pm" and the answer arrives'],
           ['Send Maya a video','she posts it, then tells you what the comments say'],
           ['Ready for every meeting','prep before, action items after'],
           ['Rules in plain words','"when a call ends, remind me in 2 days"'],
           ['A booking link, tasks and search','people book you, nothing gets lost']]}
  };
  S.open=S.open||{};
  function row(key,part,price,on,locked){
    var P=PARTS[part], open=!!S.open[part], id='plnDrop-'+part;
    return '<div class="pln-row'+(on?' on':'')+(locked?' fixed':'')+'">'
      + '<button type="button" class="pln-tg"'+(key?' data-add="'+key+'" role="switch" aria-checked="'+on+'"':' aria-disabled="true"')+'>'
      +   '<span class="pln-check" aria-hidden="true"></span>'
      +   '<span class="pln-t"><i>'+P.tag+'<em class="pln-pr">'+price+'</em></i><b>'+P.t+'</b><small class="pln-sub">'+P.sub+'</small></span></button>'
      + '<button type="button" class="pln-more'+(open?' open':'')+'" data-more="'+part+'" aria-expanded="'+open+'" aria-controls="'+id+'" aria-label="What changes for you">'
      +   '<svg class="ic"><use href="#i-chevron-down"/></svg></button>'
      + '<ul class="pln-drop" id="'+id+'"'+(open?'':' hidden')+'>'+P.out.map(function(o){ return '<li><b>'+o[0]+'</b><span>'+o[1]+'</span></li>'; }).join('')+'</ul>'
      + '</div>';
  }

  function paint(){
    var el=document.getElementById('planBody'); if(!el) return;
    var t=tier(), P=S.period, days=TRIAL[P];
    var yearly=TIERS[t].year, monthly12=TIERS[t].month*12, save=Math.round((1-yearly/monthly12)*100);

    el.innerHTML=
      '<div class="card card-lg pln glassy" style="padding:22px 18px 18px">'
      + '<div class="lbl pln-k">'+days+' DAYS FREE</div>'
      + '<div class="pln-h">The version of you<br/>that has it handled.</div>'
      + '<div class="sub pln-lead">Rested mornings, a body you are proud of, and a day that runs itself. Choose what you want to change.</div>'

      + row('', 'health', 'Included', true, true)
      + row('train', 'train', addOf('train',P), S.train, false)
      + row('work', 'work', addOf('work',P), S.work, false)
      + (S.train&&S.work?'<div class="pln-both">Both together save '+money(TIERS.health_train[P]+TIERS.health_work[P]-TIERS.health[P]-TIERS.all[P])+(P==='year'?' a year':' a month')+'.</div>':'')

      /* yearly or monthly: both always show their real price */
      + '<div class="plan-tog pln-tog" id="planTog" role="radiogroup" aria-label="Billing">'
      +   '<i class="pln-ticks" aria-hidden="true"></i>'
      +   ['year','month'].map(function(k){
            return '<button class="plan-opt'+(k===P?' on':'')+'" data-p="'+k+'" role="radio" aria-checked="'+(k===P)+'">'
              + '<span class="pln-chev" aria-hidden="true">'+(k==='year'?'\u2039':'\u203a')+'</span>'
              + '<span class="plan-opt-l">'+(k==='year'?'Yearly':'Monthly')+'</span>'
              + '<span class="pln-free">'+TRIAL[k]+' days free</span>'
              + '<span class="plan-opt-p">'+esc(priceOf(t,k))+'<span>/'+(k==='year'?'yr':'mo')+'</span></span>'
              + (k==='year'&&save>0?'<span class="plan-save">Best value</span>':'')
              + '</button>';
          }).join('')
      + '</div>'

      + '<button class="btn pln-go" id="planGo">Start '+days+' days free</button>'
      + '<div class="pln-glow" aria-hidden="true"></div>'
      + '<div class="pln-sum"><span>'+esc(TIERS[t].n)+'</span><b id="planTotal">'+esc(priceOf(t,P))+'<i>/'+(P==='year'?'yr':'mo')+'</i></b></div>'
      + '<div class="sub" id="planFine" style="text-align:center;margin-top:4px;font-size:10px;line-height:1.5">'
      +   'Free for '+days+' days, then '+esc(priceOf(t,P))+' '+(P==='year'?'a year':'a month')+'. We remind you 2 days before it ends. '
      +   'Cancel any time before then and you pay nothing.</div>'
      + '</div>'

      + '<div class="card glassy pln-arc"><div class="pln-arc-h">Where you will be</div>'
      +  [['In a week','You know what to eat, when to train and when to sleep. The guessing stops.'],
          ['In a month','Steadier energy through the afternoon, sharper focus, a calmer inbox.'],
          ['In 90 days','Stronger, leaner, rested, and running your work instead of chasing it.']]
         .map(function(r,i){
           return '<div class="pln-step"><span class="pln-dot">'+(i+1)+'</span><div><b>'+r[0]+'</b><span>'+r[1]+'</span></div></div>';
         }).join('')
      + '</div>'

      + '<div class="sub" style="text-align:center;margin-bottom:14px;font-size:10px;opacity:.7">'
      + 'Billing runs through Stripe. Kova never sees your card.</div>';

    el.querySelectorAll('[data-more]').forEach(function(b){
      b.onclick=function(){ var k=b.getAttribute('data-more'); S.open[k]=!S.open[k];
        var d=document.getElementById('plnDrop-'+k); if(d) d.hidden=!S.open[k];
        b.classList.toggle('open',S.open[k]); b.setAttribute('aria-expanded',String(S.open[k])); };
    });
    el.querySelectorAll('[data-add]').forEach(function(b){
      b.onclick=function(){
        var k=b.getAttribute('data-add');
        S[k]=!S[k];
        repaint();
      };
    });
    document.querySelectorAll('#planTog [data-p]').forEach(function(b){
      b.onclick=function(){ S.period=b.dataset.p; repaint(); };
    });
    /* KovaBilling takes this button over; until it loads, say so */
    document.getElementById('planGo').onclick=function(){
      if(typeof toast==='function') toast('Checkout needs the billing server. Plan chosen: '+TIERS[t].n+', '+(P==='year'?'yearly':'monthly')+'.');
      try{ if(window.KP) KP.set('planIntent',{tier:t,period:P,at:Date.now()}); }catch(e){}
    };
  }

  /* for KovaBilling: what is picked, and a way to pick (the paywall opens
     on the part you asked for) */
  window.__planPick=function(){ return {tier:tier(), period:S.period}; };
  window.__planSet=function(o){ o=o||{}; if(o.period) S.period=o.period; if('train' in o) S.train=!!o.train; if('work' in o) S.work=!!o.work; repaint(); };
  window.__planTiers=TIERS; window.__planTrial=TRIAL;
  window.__paintPlan=paint;
  /* KovaBilling takes the button over each time the screen is drawn */
  try{ if(window.KovaBilling&&KovaBilling._wrapPlan) KovaBilling._wrapPlan(); }catch(e){}
  /* opened before this file arrived: draw it now */
  var sc=document.getElementById('s-plan'); if(sc&&sc.classList.contains('on')) (window.__paintPlan||paint)();
})();
