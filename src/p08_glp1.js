/* =====================================================================
   KovaGLP1 - GLP-1 mode (p11): Ozempic, Wegovy, Mounjaro, Zepbound,
   compounded semaglutide or tirzepatide.

   Standard trackers punish people on these medicines: eating little
   shows up red, and the number that matters most - protein, because
   25-40% of the weight lost can be muscle when protein is low - is a
   small row under calories. In GLP-1 mode Fuel leads with three rings
   instead: a protein floor (1.2-1.6 g per kg of goal weight, your
   choice), fiber and water. Eating little is never red; hitting the
   floor gets the credit.

   Also:
     - weekly dose log with a reminder on your dose day, and injection-
       site rotation (it suggests the site you used longest ago);
     - a side-effect log (nausea, appetite, constipation, energy) linked
       to your food and sleep, with how many days each comparison uses;
     - strength-training prompts and your weight trend, and lean mass
       when a scale sends body fat - lifting is what protects muscle.

   Kova does not give dosing advice; your prescriber sets the dose.
   Stays on this device (it is in "Export my data" and "Delete").
   ===================================================================== */
window.KovaGLP1=(function(){
  'use strict';
  var KEY='kova_glp1_v1', DAY=864e5;
  var MEDS=['Ozempic (semaglutide)','Wegovy (semaglutide)','Mounjaro (tirzepatide)','Zepbound (tirzepatide)','Compounded semaglutide','Compounded tirzepatide','Other'];
  var SITES=[['abd-l','Belly, left'],['abd-r','Belly, right'],['thigh-l','Thigh, left'],['thigh-r','Thigh, right'],['arm-l','Upper arm, left'],['arm-r','Upper arm, right']];
  var FX=[['nausea','Nausea',['None','Mild','Moderate','Strong']],['appetite','Appetite',['Very low','Low','Normal','High']],
          ['constipation','Constipation',['None','Mild','Moderate','Strong']],['energy','Energy',['Low','Okay','Good','High']]];
  var DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var D=load();
  function load(){ var d=null; try{ d=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){} return d||{on:false,med:'',dose:'',day:4,time:'09:00',goalKg:0,unit:'kg',ppk:1.4,fib:30,waterL:2.5,doses:[],fx:{},water:{},remind:true}; }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(D)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function dk(t){ return window.KovaFuel?KovaFuel.dayKey(t||Date.now()):new Date(t||Date.now()).toISOString().slice(0,10); }
  function kp(k){ try{ return window.KP?KP.get(k):null; }catch(e){ return null; } }
  function on(){ return !!D.on; }

  /* ---------------- targets ---------------- */
  function goalKg(){
    if(D.goalKg>0) return D.goalKg;
    var w=(kp('wlog')||[]).slice(-1)[0];
    return w&&w.kg?w.kg:70;
  }
  function targets(){ return {p:Math.round(goalKg()*D.ppk),fib:D.fib,water:D.waterL}; }
  function today(){
    var list=window.KovaFuel?KovaFuel.today():[], p=0, fib=0;
    list.forEach(function(e){ p+=+e.p||0; if(e.m&&e.m.fib) fib+=+e.m.fib||0; });
    return {p:Math.round(p),fib:Math.round(fib*10)/10,water:Math.round(((D.water||{})[dk()]||0)*100)/100,meals:list.length};
  }

  /* ---------------- doses and sites ---------------- */
  function nextSite(){
    var last={}; (D.doses||[]).forEach(function(d){ if(d.site) last[d.site]=Math.max(last[d.site]||0,d.at); });
    var best=SITES[0][0], t=Infinity;
    SITES.forEach(function(s){ var v=last[s[0]]||0; if(v<t){ t=v; best=s[0]; } });
    return best;
  }
  function siteName(id){ var s=SITES.filter(function(x){ return x[0]===id; })[0]; return s?s[1]:id; }
  function nextDose(){
    var now=new Date(), d=new Date(now); d.setHours(0,0,0,0);
    var add=(D.day-d.getDay()+7)%7;
    var p=String(D.time||'09:00').split(':');
    d=new Date(d.getTime()+add*DAY); d.setHours(+p[0],+p[1],0,0);
    var took=(D.doses||[]).some(function(x){ return dk(x.at)===dk(d.getTime()); });
    if(took||d.getTime()<now.getTime()-12*3600e3) d=new Date(d.getTime()+7*DAY);
    return d;
  }
  function logDose(site){
    site=site||nextSite();
    D.doses=(D.doses||[]).concat([{at:Date.now(),dose:D.dose||'',med:D.med||'',site:site}]).slice(-120);
    save(); paint();
    say('Dose logged · '+siteName(site)+'. Next time: '+siteName(nextSite())+'.');
    try{ if(window.KovaAnalytics) KovaAnalytics.track('glp1_dose',{}); }catch(e){}
  }
  /* the weekly reminder rides the push reminders */
  function syncReminder(){
    if(!window.__alerts) return;
    var A=__alerts.get(), cur=A.filter(function(a){ return a.id==='glp1'; })[0];
    var want=D.on&&D.remind, days=[0,0,0,0,0,0,0]; days[(D.day+6)%7]=1;     /* the list's week starts Monday */
    var body='Your '+(D.med?D.med.split(' (')[0]:'GLP-1')+' dose. Suggested site: '+siteName(nextSite())+'.';
    if(want&&!cur){ A.push({id:'glp1',p:'Fuel',ic:'i-heartbeat',t:D.time||'09:00',on:true,days:days,lead:0,tone:'gentle',title:'Dose day',body:body}); __alerts.save(); }
    else if(want&&cur){ var ch=cur.t!==D.time||JSON.stringify(cur.days)!==JSON.stringify(days)||cur.body!==body||!cur.on; if(ch){ cur.t=D.time; cur.days=days; cur.body=body; cur.on=true; __alerts.save(); } }
    else if(!want&&cur&&cur.on){ cur.on=false; __alerts.save(); }
  }

  /* ---------------- side effects, linked to food and sleep ---------------- */
  function setFx(k,v){ var t=dk(); D.fx=D.fx||{}; D.fx[t]=D.fx[t]||{}; if(D.fx[t][k]===v) delete D.fx[t][k]; else D.fx[t][k]=v; save(); paint(); }
  function mean(a){ return a.length?a.reduce(function(x,y){ return x+y; },0)/a.length:null; }
  function links(){
    var out=[], fx=D.fx||{}, sl={}; try{ sl=JSON.parse(localStorage.getItem('kova_sleeplog_v1')||'{}')||{}; }catch(e){}
    var food={}; (window.KovaFuel?KovaFuel.all():[]).forEach(function(e){ if(!e||e.src==='seed') return; var k=dk(e.at); food[k]=food[k]||{p:0,n:0}; food[k].p+=+e.p||0; food[k].n++; });
    var nd=[], ok=[], sN=[], sO=[];
    Object.keys(fx).forEach(function(k){
      var n=fx[k].nausea; if(n==null) return;
      if(food[k]) (n>=2?nd:ok).push(food[k].p);
      var prev=dk(new Date(k+'T12:00:00').getTime()-DAY), night=sl[k]||sl[prev];
      if(night&&night.mins) (n>=2?sN:sO).push(+night.mins);
    });
    if(nd.length>=3&&ok.length>=3){ var a=mean(nd), b=mean(ok), d=Math.round((a-b)/b*100);
      out.push({t:'On moderate or strong nausea days you ate '+Math.abs(d)+'% '+(d<0?'less':'more')+' protein.',n:nd.length+' vs '+ok.length+' days',tip:d<0?'Protein shakes and Greek yogurt sit easier than a big meal on those days.':''}); }
    else out.push({t:'Nausea and food: needs '+(Math.max(0,3-nd.length)+Math.max(0,3-ok.length))+' more logged days to compare.',wait:true});
    if(sN.length>=3&&sO.length>=3){ var s1=mean(sN), s2=mean(sO), dm=Math.round(s1-s2);
      out.push({t:'Before nausea days you slept '+Math.abs(dm)+' minutes '+(dm<0?'less':'more')+'.',n:sN.length+' vs '+sO.length+' nights'}); }
    else out.push({t:'Nausea and sleep: needs '+(Math.max(0,3-sN.length)+Math.max(0,3-sO.length))+' more nights to compare.',wait:true});
    return out;
  }

  /* ---------------- strength and lean mass ---------------- */
  function strength(){
    var L=[]; try{ L=JSON.parse(localStorage.getItem('kova_log_v1')||'[]')||[]; }catch(e){}
    var mon=new Date(); mon.setHours(0,0,0,0); mon=new Date(mon.getTime()-((mon.getDay()+6)%7)*DAY);
    var n=L.filter(function(s){ return s&&s.t>=mon.getTime(); }).length;
    var W=(kp('wlog')||[]).filter(function(e){ return e.t>=Date.now()-28*DAY; });
    var trend=W.length>=2?Math.round((W[W.length-1].kg-W[0].kg)*10)/10:null;
    var bf=null; try{ bf=window.KovaHealth?(+KovaHealth.get('bodyfat',0)||+KovaHealth.get('bf',0)||null):null; }catch(e){}
    var lean=bf&&W.length?Math.round(W[W.length-1].kg*(1-(bf>1?bf/100:bf))*10)/10:null;
    return {sessions:n,trend:trend,weeks:W.length>=2?Math.max(1,Math.round((W[W.length-1].t-W[0].t)/(7*DAY))):0,lean:lean};
  }

  /* ---------------- the Fuel card ---------------- */
  function ring(v,max,label,unit,col){
    var pct=Math.max(0,Math.min(1,max?v/max:0)), r=34, c=2*Math.PI*r;
    return '<div class="kg1-ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="'+r+'" class="kg1-tr"/><circle cx="40" cy="40" r="'+r+'" class="kg1-fg" style="stroke:'+col+'" stroke-dasharray="'+(c*pct).toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 40 40)"/></svg>'
      +'<div class="kg1-rv"><b>'+v+'</b><small>/'+max+unit+'</small></div><div class="kg1-rl">'+label+'</div></div>';
  }
  function paint(){
    var scr=document.getElementById('s-fuel'); if(!scr) return;
    var ringCard=scr.querySelector('.card.card-lg');
    if(ringCard&&!ringCard.id) ringCard.id='fuelRingCard';
    scr.classList.toggle('glp1-on',on());
    var host=document.getElementById('kg1');
    if(!on()){
      if(host) host.remove();
      var off=document.getElementById('kg1Off');
      if(!off){ off=document.createElement('button'); off.id='kg1Off'; off.className='card kg1-off'; off.innerHTML='<span class="li-name">On a GLP-1 medication?</span><span class="li-sub">Turn on GLP-1 mode: a protein floor instead of calories, dose and site tracking, side effects.</span>'; scr.appendChild(off); off.addEventListener('click',setup); }
      return;
    }
    var off2=document.getElementById('kg1Off'); if(off2) off2.remove();
    if(!host){ host=document.createElement('div'); host.id='kg1'; host.className='kg1'; var at=document.getElementById('fuelRingCard'); scr.insertBefore(host,at||scr.querySelector('.hdr').nextSibling); host.addEventListener('click',onClick); }
    var T=targets(), N=today(), nd=nextDose(), st=strength(), L=links(), fx=(D.fx||{})[dk()]||{};
    var hit=N.p>=T.p;
    host.innerHTML='<div class="card card-lg kg1-main">'
      +'<div class="kg1-h"><span class="kova-lbl">GLP-1 MODE</span><button class="kg1-link" data-g="setup">Settings</button></div>'
      +'<div class="kg1-rings">'+ring(N.p,T.p,'Protein floor','g','var(--good)')+ring(N.fib,T.fib,'Fiber','g','var(--acc)')+ring(N.water,T.water,'Water','L','#8FBEEA')+'</div>'
      +'<div class="kg1-credit'+(hit?' hit':'')+'">'+(hit?'Protein floor hit. That is the win today.':(T.p-N.p)+' g to your protein floor. Calories are not the goal here.')+'</div>'
      +'<div class="kg1-water"><button class="kg1-pill" data-g="w" data-v="0.25">+250 ml</button><button class="kg1-pill" data-g="w" data-v="0.5">+500 ml</button></div></div>'
      +'<div class="card kg1-sec"><div class="kg1-st">Dose</div>'
      +'<div class="kg1-row"><div><b>'+esc(nd.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}))+', '+esc(D.time)+'</b><span>'+esc((D.med||'Your medication').split(' (')[0])+(D.dose?' · '+esc(D.dose):'')+' · site: '+esc(siteName(nextSite()))+'</span></div>'
      +'<button class="kg1-pill strong" data-g="dose">Log dose</button></div>'
      +'<div class="kg1-sites">'+SITES.map(function(s){ var n=s[0]===nextSite(); return '<button class="kg1-site'+(n?' next':'')+'" data-g="site" data-v="'+s[0]+'" aria-label="Log dose at '+s[1]+'">'+s[1]+'</button>'; }).join('')+'</div>'
      +'<div class="kg1-note">'+((D.doses||[]).length?'Last: '+esc(new Date(D.doses[D.doses.length-1].at).toLocaleDateString('en-US',{month:'short',day:'numeric'}))+' · '+esc(siteName(D.doses[D.doses.length-1].site)):'No doses logged yet.')+' Rotating sites helps the skin recover.</div></div>'
      +'<div class="card kg1-sec"><div class="kg1-st">Today, how is it?</div>'
      +FX.map(function(f){ return '<div class="kg1-fx"><span>'+f[1]+'</span><div role="group" aria-label="'+f[1]+'">'+f[2].map(function(l,i){ return '<button class="kg1-fv'+(fx[f[0]]===i?' on':'')+'" data-g="fx" data-k="'+f[0]+'" data-v="'+i+'" aria-pressed="'+(fx[f[0]]===i)+'">'+l+'</button>'; }).join('')+'</div></div>'; }).join('')
      +'<div class="kg1-links">'+L.map(function(l){ return '<div class="kg1-l'+(l.wait?' wait':'')+'">'+esc(l.t)+(l.n?' <small>('+esc(l.n)+', a comparison, not a cause)</small>':'')+(l.tip?'<div>'+esc(l.tip)+'</div>':'')+'</div>'; }).join('')+'</div></div>'
      +'<div class="card kg1-sec"><div class="kg1-st">Protect the muscle</div>'
      +'<div class="kg1-l">Strength sessions this week: <b>'+st.sessions+' of 2</b>. '+(st.sessions>=2?'Done. Lifting while weight comes off is what keeps it fat, not muscle.':'Two short sessions a week is what protects muscle while weight comes off.')+'</div>'
      +(st.trend!=null?'<div class="kg1-l">Weight: '+(st.trend>0?'+':'')+st.trend+' kg over '+st.weeks+' week'+(st.weeks===1?'':'s')+(st.lean!=null?' · lean mass about '+st.lean+' kg':' · lean mass shows when your scale sends body fat')+'.</div>':'<div class="kg1-l wait">Log your weight a few times and the trend shows here.</div>')
      +(st.sessions<2?'<button class="kg1-pill" data-g="train">Start a session</button>':'')+'</div>'
      +'<div class="kg1-disc">Kova does not give dosing advice. Your prescriber sets your dose; talk to them about side effects that worry you.</div>';
  }
  function onClick(ev){
    var b=ev.target.closest('[data-g]'); if(!b) return;
    var g=b.getAttribute('data-g'), v=b.getAttribute('data-v');
    if(g==='setup') setup();
    else if(g==='w'){ var k=dk(); D.water=D.water||{}; D.water[k]=Math.round(((D.water[k]||0)+(+v))*100)/100; save(); paint(); }
    else if(g==='dose') logDose();
    else if(g==='site') logDose(v);
    else if(g==='fx') setFx(b.getAttribute('data-k'),+v);
    else if(g==='train') try{ go('move'); }catch(e){}
  }

  /* ---------------- setup ---------------- */
  function setup(){
    if(!window.openSheet) return;
    var gk=D.goalKg>0?(D.unit==='lb'?Math.round(D.goalKg/0.45359237):D.goalKg):'';
    openSheet('<div class="grab"></div><div class="kg1s">'
      +'<div class="title-s" style="font-size:19px;margin-bottom:4px">GLP-1 mode</div>'
      +'<div class="sub" style="line-height:1.5;margin-bottom:12px">Protein floor, fiber and water lead instead of calories. Nothing turns red for eating little.</div>'
      +'<label class="kg1f">Medication<select id="kg1Med">'+MEDS.map(function(m){ return '<option'+(D.med===m?' selected':'')+'>'+esc(m)+'</option>'; }).join('')+'</select></label>'
      +'<label class="kg1f">Dose, as prescribed <input id="kg1Dose" placeholder="e.g. 5 mg" value="'+esc(D.dose)+'" maxlength="24"></label>'
      +'<div class="kg1two"><label class="kg1f">Dose day<select id="kg1Day">'+DAYS.map(function(d,i){ return '<option value="'+i+'"'+(D.day===i?' selected':'')+'>'+d+'</option>'; }).join('')+'</select></label>'
      +'<label class="kg1f">Time<input id="kg1Time" type="time" value="'+esc(D.time)+'"></label></div>'
      +'<div class="kg1two"><label class="kg1f">Goal weight<input id="kg1Goal" type="number" inputmode="decimal" min="30" max="300" value="'+gk+'" placeholder="'+(D.unit==='lb'?'lb':'kg')+'"></label>'
      +'<label class="kg1f">Unit<select id="kg1Unit"><option value="kg"'+(D.unit!=='lb'?' selected':'')+'>kg</option><option value="lb"'+(D.unit==='lb'?' selected':'')+'>lb</option></select></label></div>'
      +'<label class="kg1f">Protein floor: <b id="kg1PpkV">'+D.ppk+'</b> g per kg of goal weight<input id="kg1Ppk" type="range" min="1.2" max="1.6" step="0.1" value="'+D.ppk+'"></label>'
      +'<div class="kg1two"><label class="kg1f">Fiber (g)<input id="kg1Fib" type="number" min="15" max="60" value="'+D.fib+'"></label>'
      +'<label class="kg1f">Water (L)<input id="kg1Wat" type="number" min="1" max="5" step="0.1" value="'+D.waterL+'"></label></div>'
      +'<label class="kg1c"><input type="checkbox" id="kg1Rem"'+(D.remind?' checked':'')+'> Remind me on dose day</label>'
      +'<div class="kg1-disc">Kova does not give dosing advice. Your prescriber sets your dose.</div>'
      +'<button class="btn" data-s="save" style="margin-top:12px">'+(D.on?'Save':'Turn on GLP-1 mode')+'</button>'
      +(D.on?'<button class="btn ghost" data-s="off" style="margin-top:8px">Turn GLP-1 mode off</button>':'')+'</div>');
    var el=document.querySelector('#sheetIn .kg1s'); if(!el) return;
    var ppk=document.getElementById('kg1Ppk'); ppk.addEventListener('input',function(){ document.getElementById('kg1PpkV').textContent=ppk.value; });
    el.addEventListener('click',function(ev){
      var b=ev.target.closest('[data-s]'); if(!b) return;
      if(b.getAttribute('data-s')==='off'){ D.on=false; save(); syncReminder(); if(window.closeSheet) closeSheet(); paint(); refresh(); say('GLP-1 mode off.'); return; }
      var v=function(id){ return document.getElementById(id).value; };
      D.med=v('kg1Med'); D.dose=String(v('kg1Dose')).slice(0,24); D.day=+v('kg1Day'); D.time=v('kg1Time')||'09:00';
      D.unit=v('kg1Unit'); var g=+v('kg1Goal'); D.goalKg=g>0?(D.unit==='lb'?Math.round(g*0.45359237*10)/10:g):0;
      D.ppk=Math.min(1.6,Math.max(1.2,+v('kg1Ppk')||1.4)); D.fib=Math.min(60,Math.max(15,+v('kg1Fib')||30)); D.waterL=Math.min(5,Math.max(1,+v('kg1Wat')||2.5));
      D.remind=document.getElementById('kg1Rem').checked;
      var first=!D.on; D.on=true; save(); syncReminder();
      if(window.closeSheet) closeSheet(); paint(); refresh();
      if(first){ say('GLP-1 mode on. Protein floor: '+targets().p+' g a day.'); try{ if(window.KovaAnalytics) KovaAnalytics.track('glp1_on',{}); }catch(e){} }
      if(D.remind&&window.KovaPush&&!KovaPush.active()) setTimeout(function(){ KovaPush.offer('Your dose-day reminder'); },400);
    });
  }
  function refresh(){ try{ if(window.KovaToday) KovaToday.paint(); }catch(e){} }

  function start(){
    paint(); syncReminder();
    if(window.KovaFuel) KovaFuel.on(paint);
    document.addEventListener('click',function(e){ var g=e.target.closest&&e.target.closest('[data-go="fuel"]'); if(g) setTimeout(paint,60); },true);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);

  return {on:on,targets:targets,today:today,nextSite:nextSite,nextDose:nextDose,logDose:logDose,setFx:setFx,links:links,strength:strength,setup:setup,paint:paint,
    _D:function(){ return D; },_set:function(d){ D=d; save(); paint(); syncReminder(); },SITES:SITES};
})();
