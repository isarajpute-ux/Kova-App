/* ===== SUBSCRIPTION =====
   Build your plan. Health is the base (Fuel, Sleep, Vitals); Training and
   Work OS with the AI team are add-ons. Under the hood they are three
   plans in one App Store subscription group, so changing your mind is an
   upgrade or a downgrade, never two bills:
     health        Fuel, Sleep, Vitals and the AI that reads them
     health_train  + Training
     all           + Training + Work OS and the AI team (Work includes
                   Training, so "Health + Work" is this plan)
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
    all:         {n:'Everything',        year:119.99, month:19.99}
  };
  var TRIAL={year:30, month:14};
  /* train is your own choice; Work brings Training with it either way */
  var S={period:'year', train:false, work:true};

  function tier(){ return S.work?'all':S.train?'health_train':'health'; }
  function money(n){ return '$'+n.toFixed(2); }
  /* through window.__paintPlan, so KovaBilling sets the button up again */
  function repaint(){ (window.__paintPlan||paint)(); }
  function store(t,p){ var m=window.__planStore||{}; return m[t+'_'+p]||''; }
  function priceOf(t,p){ return store(t,p)||money(TIERS[t][p]); }
  function add(a,b,p){ var d=TIERS[a][p]-TIERS[b][p]; return '+'+money(d)+(p==='year'?'/yr':'/mo'); }
  function esc(x){ return String(x).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  /* Sell where you end up, not the features (p19b). Each part is the
     person you become, with a small arrow that opens what changes; the
     price is there, quietly, never the headline. */
  var PARTS={
    health:{t:'Wake up rested and in control of your energy', tag:'Health',
      out:['Mornings you do not have to fight through','Meals that fuel you, known in one photo','See what drains your energy before it hits','Stop guessing about your body. Know.']},
    train:{t:'Get stronger every week, and proud of the mirror', tag:'Training',
      out:['Walk in knowing exactly what to do today','Watch your strength climb, week after week','A physique built on purpose, not by accident','Peak for the moments that matter']},
    work:{t:'Get your hours back, with an AI team behind you', tag:'Work OS & AI team',
      out:['An AI team that researches, posts and reports back while you live','Walk into every meeting prepared','Content out the door without the grind','A clear head: everything handled, nothing forgotten']}
  };
  S.open=S.open||{};
  function row(key,part,price,on,locked){
    var P=PARTS[part], open=!!S.open[part], id='plnDrop-'+part;
    return '<div class="pln-row'+(on?' on':'')+(locked?' fixed':'')+'">'
      + '<button type="button" class="pln-tg"'+(key?' data-add="'+key+'" role="switch" aria-checked="'+on+'"':' aria-disabled="true"')+'>'
      +   '<span class="pln-check" aria-hidden="true"></span>'
      +   '<span class="pln-t"><i>'+P.tag+'<em class="pln-pr">'+price+'</em></i><b>'+P.t+'</b></span></button>'
      + '<button type="button" class="pln-more'+(open?' open':'')+'" data-more="'+part+'" aria-expanded="'+open+'" aria-controls="'+id+'" aria-label="What changes for you">'
      +   '<svg class="ic"><use href="#i-chevron-down"/></svg></button>'
      + '<ul class="pln-drop" id="'+id+'"'+(open?'':' hidden')+'>'+P.out.map(function(o){ return '<li>'+o+'</li>'; }).join('')+'</ul>'
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
      + row('train', 'train', S.work?'Included with Work OS':add('health_train','health',P), S.train||S.work, S.work)
      + row('work', 'work', add('all',S.train?'health_train':'health',P), S.work, false)

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
        if(k==='train'&&S.work) return;
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
