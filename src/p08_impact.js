/* =====================================================================
   KovaImpact - what a scanned food does to your body, and to you today
   (p14). Used by the scanner (Fuel > Scanner).

   Yuka says good or bad. Kova says what, where in the body, how strong
   the evidence is, and what it means for you today:
     - per body area: digestion and bloating, blood sugar and energy,
       heart and blood pressure, sleep, training and recovery, hormones
       and cycle (fertility, pregnancy), skin, long-term risk;
     - every reason carries its evidence: Strong (large trials, WHO, EFSA,
       FDA, IARC group 1), Some (observational, smaller trials) or Early
       (animal or single studies), and the source by name;
     - "For you today" ties it to your own data: caffeine against your
       bedtime, salt against what you have already eaten, protein after
       today's workout, alcohol against a low HRV, your cycle phase,
       pregnancy;
     - "Next time": what to look for on the label instead.
   It never claims more than the evidence: no "hormone disruption" score
   from sugar, and it says when a scary-sounding thing (MSG, soy) has no
   good evidence of harm at normal amounts.
   Thresholds: UK FSA front-of-pack "high/low" per 100 g (drinks per
   100 ml), EU nutrition claims (source/high fibre and protein), WHO daily
   limits (free sugars 50 g, sodium 2 g).
   ===================================================================== */
window.KovaImpact=(function(){
  'use strict';
  var AREAS=[
    ['gut','Digestion & bloating'],['sugar','Blood sugar & energy'],['heart','Heart & blood pressure'],['sleep','Sleep'],
    ['train','Training & recovery'],['horm','Hormones, cycle & fertility'],['skin','Skin'],['long','Long-term risk']
  ];
  var EV={strong:'Strong evidence',some:'Some evidence',early:'Early evidence',rule:'Food safety rule'};
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function r1(x){ return Math.round(x*10)/10; }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function has(arr,re){ return (arr||[]).some(function(a){ return re.test(a); }); }

  function analyze(prod,ctx){
    ctx=ctx||context();
    var p100=prod.per100||{}, ps=prod.perServ||null, ing=String(prod._ingredientsText||'').toLowerCase(), adds=prod._additiveTags||[], cats=String(prod._categories||'');
    var drink=/beverage|drinks|sodas|juices|waters|coffees|teas|milks|energy-drinks/.test(cats)&&!/milk-powder|tea-leaves|coffee-beans|ground-coffee/.test(cats);
    var serve=ps&&ps.kcal!=null?ps:null, sv=function(k){ return serve&&serve[k]!=null?serve[k]:null; };
    var out=[], add=function(o){ out.push(o); };
    var sugar=p100.sugar, salt=p100.sodium!=null?p100.sodium*2.5:null, sat=p100.satFat, fib=p100.fiber, prot=p100.p, kcal=p100.kcal;
    /* sugar */
    if(sugar!=null){
      var hiS=drink?11.25:22.5, loS=drink?2.5:5;
      if(sugar>hiS){
        var sS=sv('sugar');
        add({a:['sugar','skin','long'],v:-1,t:'High in sugar',d:r1(sugar)+' g per 100 '+(drink?'ml':'g')+(sS!=null?' ('+r1(sS)+' g a serving, '+Math.round(sS/50*100)+'% of the WHO daily limit)':'')+'. A quick rise in blood sugar, often a dip in energy after.',ev:'strong',src:'WHO sugars guideline; UK FSA'});
        add({a:['skin'],v:-1,minor:true,t:'Sugary, fast carbs and acne',d:'Diets high in fast carbs are linked with more acne in trials.',ev:'some',src:'Smith 2007, AJCN'});
      } else if(sugar<=loS) add({a:['sugar'],v:1,t:'Low in sugar',d:r1(sugar)+' g per 100 '+(drink?'ml':'g')+'.',ev:'strong',src:'UK FSA'});
    }
    /* salt */
    if(salt!=null){
      var na=sv('sodium');
      if(salt>1.5){
        add({a:['heart'],v:-1,t:'High in salt',d:r1(salt)+' g salt per 100 g'+(na!=null?' ('+Math.round(na*1000)+' mg sodium a serving, '+Math.round(na*1000/2000*100)+'% of the WHO daily limit)':'')+'. Salt raises blood pressure.',ev:'strong',src:'WHO sodium guideline'});
        add({a:['gut'],v:-1,t:'Salty food and bloating',d:'In a large diet trial, more salt meant more bloating.',ev:'some',src:'DASH-Sodium, Peng 2019'});
      } else if(salt<=0.3) add({a:['heart'],v:1,t:'Low in salt',d:r1(salt)+' g per 100 g.',ev:'strong',src:'UK FSA'});
    }
    /* fats */
    if(sat!=null&&sat>5) add({a:['heart'],v:-1,t:'High in saturated fat',d:r1(sat)+' g per 100 g. Saturated fat raises LDL cholesterol.',ev:'strong',src:'WHO 2023; UK FSA'});
    if(/partially hydrogenated|partly hydrogenated|hydrogenated vegetable/.test(ing)){
      add({a:['heart','long'],v:-1,t:'Trans fat (hydrogenated oil)',d:'Raises LDL and lowers HDL cholesterol; banned in the US and limited in the EU.',ev:'strong',src:'WHO; FDA'});
      add({a:['horm'],v:-1,t:'Trans fat and ovulation',d:'Women eating more trans fat had more ovulatory infertility in a large study.',ev:'some',src:'Nurses’ Health Study II, Chavarro 2007'});
    }
    /* fibre and protein */
    if(fib!=null&&fib>=6) add({a:['gut','sugar'],v:1,t:'High in fibre',d:r1(fib)+' g per 100 g. Feeds gut bacteria, slows the sugar rise, keeps you full. More than you are used to can cause wind at first.',ev:'strong',src:'EU claim; Reynolds 2019, Lancet'});
    else if(fib!=null&&fib>=3) add({a:['gut'],v:1,t:'A source of fibre',d:r1(fib)+' g per 100 g.',ev:'strong',src:'EU claim'});
    if(prot!=null&&kcal){
      var pe=prot*4/kcal, pS=sv('p');
      if(pe>=.2) add({a:['train','sugar'],v:1,t:'High in protein',d:Math.round(pe*100)+'% of its calories'+(pS!=null?' ('+Math.round(pS)+' g a serving)':'')+'. Protein repairs muscle after training and keeps you full.',ev:'strong',src:'EU claim; ISSN 2017'});
      else if(pe>=.12) add({a:['train'],v:1,t:'A source of protein',d:Math.round(pe*100)+'% of its calories.',ev:'strong',src:'EU claim'});
    }
    /* processing */
    if(prod._nova===4) add({a:['long','sugar'],v:-1,t:'Ultra-processed',d:'In a controlled trial, people ate about 500 kcal a day more on ultra-processed food without noticing.',ev:'strong',src:'NIH, Hall 2019'});
    else if(prod._nova===1) add({a:['long'],v:1,t:'Unprocessed or minimally processed',d:'Whole foods, as they come.',ev:'some',src:'NOVA'});
    /* additives */
    var A=function(re){ return has(adds,re); };
    if(A(/e42[01]|e95[3]|e96[5-8]/)) add({a:['gut'],v:-1,t:'Sugar alcohols (polyols)',d:'Sorbitol, maltitol, xylitol and the like pull water into the gut: gas, bloating and loose stools in larger amounts. The EU requires a warning when they are over 10%.',ev:'strong',src:'EU Regulation 1169/2011'});
    if(A(/e968/)) add({a:['heart'],v:-1,t:'Erythritol',d:'One study linked high blood erythritol with clotting events; more research is needed.',ev:'early',src:'Witkowski 2023, Nat Med'});
    if(A(/e407|e466|e433/)) add({a:['gut'],v:-1,t:'Emulsifiers (carrageenan, CMC, polysorbate 80)',d:'In mice, and one small human trial, these thinned the gut’s protective mucus.',ev:'early',src:'Chassaing 2015, 2022'});
    if(A(/e25[0-2]|e249/)&&/meat|sausage|ham|bacon|salami|charcut|hot-dog/.test(cats+' '+ing)) add({a:['long'],v:-1,t:'Processed meat with nitrite',d:'Processed meat is a known cause of bowel cancer (IARC group 1): about 18% higher risk for each 50 g eaten a day.',ev:'strong',src:'IARC 2015; WCRF'});
    if(A(/e951/)) add({a:['long'],v:0,t:'Aspartame',d:'IARC calls it "possibly carcinogenic" (2B, limited evidence); the safe daily amount (40 mg per kg) is unchanged.',ev:'early',src:'IARC & JECFA 2023'});
    if(A(/e95[015]|e962/)) add({a:['sugar'],v:0,t:'Sweeteners',d:'The WHO advises against relying on sweeteners for weight control: long-term, they do not help.',ev:'some',src:'WHO 2023'});
    if(A(/e10[24]|e11[0]|e12[249]/)) add({a:['long'],v:-1,t:'Azo food dyes',d:'Linked to hyperactivity in some children; the EU makes them carry a warning.',ev:'some',src:'Southampton study, McCann 2007'});
    if(A(/e171/)) add({a:['long'],v:-1,t:'Titanium dioxide (E171)',d:'No longer allowed in EU food since 2022: harm to DNA could not be ruled out.',ev:'rule',src:'EFSA 2021'});
    if(A(/e320/)) add({a:['horm','long'],v:-1,t:'BHA (E320)',d:'Rated "possibly carcinogenic" and under EU review as a possible hormone disruptor.',ev:'early',src:'IARC 2B; EU ED list'});
    if(A(/e211/)&&A(/e300/)) add({a:['long'],v:-1,t:'Benzoate with vitamin C',d:'Together they can form small amounts of benzene, especially in warm drinks kept a long time.',ev:'early',src:'FDA'});
    if(A(/e22[0-8]/)) add({a:['gut'],v:-1,t:'Sulphites',d:'Can set off asthma in people who are sensitive to them.',ev:'strong',src:'EU allergen rules'});
    if(A(/e621/)) add({a:['long'],v:0,t:'MSG',d:'No good evidence of harm at normal amounts; a few people notice headaches after large doses.',ev:'some',src:'EFSA 2017'});
    /* drinks: caffeine, alcohol, fizz */
    /* Open Food Facts gives vitamins, minerals and caffeine in grams */
    var caf=p100.caffeine!=null?p100.caffeine*1000:null, hasCaf=caf>0||/caffeine|guarana|coffee|green tea extract|mate\b/.test(ing)||/energy-drinks|coffees/.test(cats);
    if(hasCaf) add({a:['sleep'],v:-1,t:'Caffeine'+(caf?' ('+Math.round(caf)+' mg per 100 ml)':''),d:'Caffeine lasts about 5 hours in the body. Even 6 hours before bed it cut sleep by about an hour in a trial.',ev:'strong',src:'Drake 2013, JCSM'});
    var alc=p100.alcohol!=null?p100.alcohol:null, hasAlc=alc>0||/alcoholic-beverages|beers|wines|spirits|ciders/.test(cats);
    if(hasAlc){
      add({a:['sleep'],v:-1,t:'Alcohol',d:'Helps you fall asleep, then breaks up the second half of the night and cuts REM sleep.',ev:'strong',src:'Ebrahim 2013 review'});
      add({a:['heart','train'],v:-1,t:'Alcohol and recovery',d:'Raises resting heart rate and lowers HRV that night; after training it slows muscle repair.',ev:'some',src:'Pietilä 2018; Parr 2014'});
      add({a:['horm'],v:-1,t:'Alcohol and pregnancy',d:'No amount is known to be safe in pregnancy. Heavy drinking also lowers fertility.',ev:'strong',src:'CDC; ACOG'});
    }
    if(/carbonated|sparkling|soda/.test(ing+' '+cats)) add({a:['gut'],v:-1,t:'Fizzy',d:'Carbonation adds gas: bloating for some people.',ev:'some',src:'Clinical consensus'});
    if(/\blactose\b|whey|milk powder|skimmed milk|\bmilk\b/.test(ing)&&!/lactose[- ]free/.test(ing)) add({a:['gut'],v:0,t:'Contains lactose',d:'Bloating and wind only if you are lactose intolerant (most adults worldwide make less lactase).',ev:'strong',src:'NIH'});
    if(/\bsoy|soya/.test(ing)) add({a:['horm'],v:0,t:'Soy',d:'Normal amounts of soy do not lower testosterone or harm fertility, in reviews of the trials.',ev:'some',src:'Reed 2021 meta-analysis'});
    if(/swordfish|shark|king mackerel|tilefish|bigeye/.test(ing+' '+cats)) add({a:['horm'],v:-1,t:'High-mercury fish',d:'Not for anyone pregnant, breastfeeding or trying to conceive.',ev:'strong',src:'FDA/EPA fish advice'});
    var fe=p100.iron!=null?p100.iron*1000:null, fol=p100.folate!=null?p100.folate*1e6:null;
    if(fe!=null&&fe>=2.1) add({a:['horm'],v:1,t:'Iron-rich',d:r1(fe)+' mg per 100 g. Periods cost iron; low iron means tiredness.',ev:'strong',src:'EU claim; NIH'});
    if((fol!=null&&fol>=30)||/folic acid/.test(ing)) add({a:['horm'],v:1,t:'Folate / folic acid',d:'Anyone who could become pregnant is advised 400 mcg of folic acid a day to prevent neural tube defects.',ev:'strong',src:'CDC; ACOG'});
    if(prod._allergens&&prod._allergens.length) add({a:['gut'],v:0,t:'Allergens: '+prod._allergens.slice(0,5).join(', '),d:'Only matters if you are allergic or intolerant.',ev:'rule',src:'EU allergen labelling'});

    /* group by area */
    var areas={};
    AREAS.forEach(function(x){ var L=out.filter(function(o){ return o.a.indexOf(x[0])>=0; }); if(!L.length) return;
      var s=L.reduce(function(a,o){ return a+o.v*(o.ev==='strong'||o.ev==='rule'?1:o.ev==='some'?.6:.3); },0);
      areas[x[0]]={n:x[1],items:L,verdict:s>.4?'good':s<-.9?'bad':s<-.2?'watch':'ok'}; });
    return {items:out,areas:areas,personal:personal(out,prod,ctx),next:nextTime(out,drink),drink:drink};
  }

  /* what Kova knows about today */
  function context(){
    var c={now:new Date(),bed:23*60,phase:'',preg:false,naToday:null,trained:false,lowHRV:false};
    try{ var log=lsJ('kova_sleeplog_v1',{}), ks=Object.keys(log).sort().slice(-7), beds=ks.map(function(k){ return log[k]&&log[k].bed; }).filter(Boolean);
      var mins=beds.map(function(b){ var m=String(b).match(/(\d+):(\d+)\s*([ap])/i); if(!m) return null; var h=+m[1]%12+(m[3].toLowerCase()==='p'?12:0); var t=h*60+(+m[2]); return t<12*60?t+1440:t; }).filter(function(x){ return x!=null; });
      if(mins.length){ mins.sort(function(a,b){ return a-b; }); c.bed=mins[Math.floor(mins.length/2)]%1440; } }catch(e){}
    try{ if(window.KovaCycle){ c.phase=KovaCycle.phase(); var cd=KovaCycle._data(); c.preg=!!(cd&&cd.status&&cd.status.preg); } }catch(e){}
    try{ if(window.KovaFuel&&KovaFuel.today){ var na=0, any=false; KovaFuel.today().forEach(function(e){ if(e&&e.m&&e.m.na!=null){ na+=+e.m.na; any=true; } }); c.naToday=any?Math.round(na):null; } }catch(e){}
    try{ var L=lsJ('kova_log_v1',[]), d0=new Date(); d0.setHours(0,0,0,0); c.trained=L.some(function(s){ return s&&!s.seed&&s.t>=d0.getTime(); }); }catch(e){}
    try{ var h=lsJ('kova.health.v2',{}), f=h.f||{}; if(f.hrv&&f.hrv_base&&f.hrv<f.hrv_base*.85) c.lowHRV=true; }catch(e){}
    return c;
  }
  function hm(m){ var h=Math.floor(m/60)%24, mm=m%60, ap=h<12?'am':'pm'; return (h%12||12)+(mm?':'+('0'+mm).slice(-2):'')+' '+ap; }
  function personal(items,prod,c){
    var P=[], is=function(re){ return items.some(function(o){ return re.test(o.t); }); };
    var nowM=c.now.getHours()*60+c.now.getMinutes(), toBed=((c.bed-nowM)+1440)%1440;
    if(is(/^Caffeine/)){
      if(toBed<8*60) P.push({area:'Sleep',t:'You usually sleep around '+hm(c.bed)+'. That is '+Math.floor(toBed/60)+' h '+(toBed%60)+' m away, so about '+Math.round(Math.pow(.5,toBed/300)*100)+'% of this caffeine will still be working at bedtime.'});
      else P.push({area:'Sleep',t:'More than 8 hours to your usual bedtime ('+hm(c.bed)+'): this one should not touch tonight’s sleep.'});
      if(c.preg) P.push({area:'Pregnancy',t:'In pregnancy, keep caffeine under 200 mg a day from everything (ACOG).'});
    }
    if(is(/^Alcohol$/)){
      if(c.lowHRV) P.push({area:'Vitals',t:'Your HRV is already below your normal. Alcohol tonight usually pushes it lower and your resting heart rate up tomorrow.'});
      if(c.trained) P.push({area:'Workout',t:'You trained today: alcohol tonight slows the muscle repair that session started.'});
      if(c.preg) P.push({area:'Pregnancy',t:'No amount of alcohol is known to be safe in pregnancy.'});
    }
    var na=prod.perServ&&prod.perServ.sodium!=null?Math.round(prod.perServ.sodium*1000):null;
    if(na!=null&&na>=300){ var tot=c.naToday!=null?c.naToday+na:null; P.push({area:'Vitals',t:'A serving adds '+na+' mg sodium'+(tot!=null?': '+tot.toLocaleString()+' of the WHO’s 2,000 mg today.':' (WHO: 2,000 mg a day).')}); }
    if(is(/protein/)&&c.trained) P.push({area:'Workout',t:'You trained today: protein now helps the repair. Aim for 20 to 40 g in this meal.'});
    if(c.phase==='menstrual'&&is(/Iron-rich/)) P.push({area:'Cycle',t:'You are on your period: iron-rich food helps replace what you lose.'});
    if(c.phase==='luteal'&&is(/High in sugar/)) P.push({area:'Cycle',t:'Luteal phase: cravings run higher now. A protein-first snack usually holds you longer than sugar.'});
    if(c.preg&&is(/High-mercury fish/)) P.push({area:'Pregnancy',t:'You logged a pregnancy: skip this fish; salmon, sardines and trout are good choices.'});
    if(c.preg&&is(/Folate/)) P.push({area:'Pregnancy',t:'Good: folate matters most early in pregnancy.'});
    return P;
  }
  function nextTime(items,drink){
    var N=[], is=function(re){ return items.some(function(o){ return o.v<0&&re.test(o.t); }); };
    if(is(/High in sugar/)) N.push('Under '+(drink?'2.5 g sugar per 100 ml':'5 g sugar per 100 g')+' is "low" on any label.');
    if(is(/High in salt/)) N.push('Under 0.3 g salt per 100 g is "low"; over 1.5 g is "high".');
    if(is(/saturated/)) N.push('Under 1.5 g saturated fat per 100 g is "low".');
    if(is(/Processed meat/)) N.push('Fresh meat, fish, eggs or beans instead of cured meat with E250/E252.');
    if(is(/polyols|Sugar alcohols/)) N.push('If you bloat easily, skip "sugar-free" sweets with sorbitol, maltitol or xylitol.');
    if(is(/Ultra-processed/)) N.push('A version with a shorter ingredient list you would cook with yourself.');
    if(is(/Caffeine/)) N.push('After about 2 pm, decaf or caffeine-free.');
    return N.slice(0,4);
  }

  var VERD={good:'Good',ok:'Neutral',watch:'Watch',bad:'Bad'};
  function render(prod,grid,goal,ktxt){
    var r=analyze(prod), ks=Object.keys(r.areas);
    if(grid) grid.innerHTML=ks.length?'<div class="kim">'+ks.map(function(k){ var A=r.areas[k];
        return '<details class="kim-a v-'+A.verdict+'"><summary><span class="kim-dot"></span><b>'+esc(A.n)+'</b><em>'+VERD[A.verdict]+'</em></summary><ul>'
          +A.items.map(function(o){ return '<li class="'+(o.v>0?'g':o.v<0?'b':'n')+'"><b>'+esc(o.t)+'</b><span>'+esc(o.d)+'</span><small><i class="ev-'+o.ev+'">'+EV[o.ev]+'</i> · '+esc(o.src)+'</small></li>'; }).join('')+'</ul></details>'; }).join('')
        +'</div><p class="kim-fine">Every reason shows how strong the evidence is and where it comes from. Kova does not diagnose; if you have a condition, your doctor’s advice comes first.</p>'
      :'<div class="sub">Not enough on the label to say more.</div>';
    if(goal) goal.innerHTML=(r.personal.length?'<div class="kim-p">'+r.personal.map(function(x){ return '<div><span>'+esc(x.area)+'</span><p>'+esc(x.t)+'</p></div>'; }).join('')+'</div>':'<div class="sub">Nothing about this product changes your day.</div>')
      +(r.next.length?'<div class="kim-n"><b>Next time, look for</b><ul>'+r.next.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul></div>':'');
    if(ktxt){
      var good=r.items.filter(function(o){ return o.v>0; }), bad=r.items.filter(function(o){ return o.v<0&&o.ev!=='early'&&!o.minor; });
      ktxt.textContent=(good.length?'Good: '+good.slice(0,2).map(function(o){ return o.t.toLowerCase(); }).join(', ')+'. ':'')+(bad.length?'Watch: '+bad.slice(0,2).map(function(o){ return o.t.toLowerCase(); }).join(', ')+'. ':'')+(r.personal[0]?r.personal[0].t:(bad.length?'Fine now and then.':'A good everyday choice.'));
    }
    return r;
  }
  return {analyze:analyze,render:render,context:context,AREAS:AREAS};
})();
