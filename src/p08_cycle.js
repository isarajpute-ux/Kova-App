/* =====================================================================
   KovaCycle - cycle tracking (p09).

   What it does
     - log period days (and flow), symptoms and, if the watch sends it,
       nightly wrist temperature
     - estimate the next period and the fertile window from YOUR cycles
       (average of the last six; 28 / 5 days until there are two)
     - say which phase today is, and what that means for the other areas:
         Workout  the evidence says effects are small and personal
                  (McNulty 2020: a trivial dip early in the cycle), so it
                  is "train by feel", and Kova compares your own sessions
                  by phase once there are two cycles
         Sleep    progesterone raises body temperature in the luteal phase,
                  so a cooler room helps
         Fuel     appetite runs higher in the luteal phase; resting burn
                  rises only ~30-120 kcal, so Kova says so plainly
         Vitals   a higher resting heart rate and lower HRV are normal in
                  the luteal phase - the wellness agent stops flagging them
     - a retrospective ovulation estimate when temperatures show the
       sustained rise (three nights >= 0.2 C above the six before), the way
       Apple and Oura do it: after the fact, never as a forecast
   Privacy: stays on this device unless you turn on sync. Not birth control.
   ===================================================================== */
window.KovaCycle=(function(){
  'use strict';
  var KEY='kova_cycle_v1', DAY=864e5;
  var SYM=[['cramps','Cramps'],['headache','Headache'],['bloating','Bloating'],['tender','Tender breasts'],['mood','Low mood'],['acne','Acne'],
           ['fatigue','Tired'],['cravings','Cravings'],['sleep','Poor sleep'],['energy','High energy']];
  function $(s,r){ return (r||document).querySelector(s); }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function key(t){ var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function parse(k){ var p=k.split('-'); return new Date(+p[0],+p[1]-1,+p[2]).getTime(); }
  function load(){
    var d=null; try{ d=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){}
    if(!d){ try{ var kp=window.KP&&KP.get('cycle'); if(kp) d=kp; }catch(e){} }
    return d||{on:false,sync:false,days:{},sym:{},temp:{},dismissed:false};
  }
  function save(d){
    try{ localStorage.setItem(KEY,JSON.stringify(d)); }catch(e){}
    try{ if(window.KP) KP.set('cycle',d.sync?d:null); }catch(e){}
  }
  var D=load();

  /* period starts = first day of each run of logged period days */
  function starts(){
    var ks=Object.keys(D.days).filter(function(k){ return D.days[k]; }).sort(), out=[];
    ks.forEach(function(k,i){ if(i===0||parse(k)-parse(ks[i-1])>2*DAY) out.push(k); });
    return out;
  }
  function stats(){
    var st=starts(), lens=[];
    for(var i=1;i<st.length;i++){ var l=Math.round((parse(st[i])-parse(st[i-1]))/DAY); if(l>=18&&l<=45) lens.push(l); }
    lens=lens.slice(-6);
    var avg=lens.length?Math.round(lens.reduce(function(a,b){ return a+b; },0)/lens.length):28;
    var sd=lens.length>1?Math.sqrt(lens.reduce(function(a,b){ return a+(b-avg)*(b-avg); },0)/lens.length):null;
    var runs=[], ks=Object.keys(D.days).filter(function(k){ return D.days[k]; }).sort(), run=0;
    ks.forEach(function(k,i){ if(i&&parse(k)-parse(ks[i-1])<=DAY) run++; else { if(run) runs.push(run); run=1; } }); if(run) runs.push(run);
    var plen=runs.length?Math.round(runs.slice(-6).reduce(function(a,b){ return a+b; },0)/Math.min(6,runs.length)):5;
    return {starts:st,avg:avg,sd:sd,cycles:lens.length,plen:plen};
  }
  /* today: day of cycle, phase, predictions */
  function today(t){
    t=t||Date.now();
    var s=stats(); if(!s.starts.length) return null;
    var last=parse(s.starts[s.starts.length-1]), day=Math.floor((t-last)/DAY)+1;
    var next=last+s.avg*DAY; while(next<t-DAY*2) next+=s.avg*DAY;
    var ov=next-14*DAY, fw0=ov-5*DAY, fw1=ov+DAY;
    var ovDay=Math.round((ov-last)/DAY)+1;
    var phase=day<=s.plen?'menstrual':(day<ovDay-2?'follicular':(day<=ovDay+1?'ovulatory':'luteal'));
    if(day>s.avg+7) phase='late';
    return {day:day,phase:phase,next:next,fertile:[fw0,fw1],ov:ov,stats:s,retro:retro()};
  }
  /* the sustained temperature rise, found after the fact */
  function retro(){
    var ks=Object.keys(D.temp).sort(), v=ks.map(function(k){ return +D.temp[k]; });
    for(var i=6;i<v.length-2;i++){
      var base=v.slice(i-6,i).reduce(function(a,b){ return a+b; },0)/6;
      if(v[i]>=base+.2&&v[i+1]>=base+.2&&v[i+2]>=base+.2) return {day:ks[i-1],rise:Math.round((v[i]-base)*100)/100};
    }
    return null;
  }
  var PHASE={
    menstrual:{n:'Period',c:'#E8607A',
      move:'Train by feel. Research finds at most a small dip early in the cycle, and it differs a lot between people - if you feel good, the heavy day stays.',
      sleep:'Cramps can break sleep: heat on your lower belly and a steady bedtime help.',
      fuel:'Heavy flow costs iron: red meat, lentils, spinach with vitamin C.',
      vitals:'Resting heart rate is usually at its lowest now.'},
    follicular:{n:'Follicular',c:'#7DE0A6',
      move:'Often the best-feeling stretch for hard sessions and trying for PRs.',
      sleep:'Sleep tends to be steadier in this phase.',
      fuel:'Appetite is usually lower; your normal targets fit.',
      vitals:'HRV is usually higher and resting heart rate lower.'},
    ovulatory:{n:'Around ovulation',c:'#F4E18E',
      move:'Strength often feels good; warm up well - some studies link this window with looser ligaments.',
      sleep:'Nothing special - keep the routine.',
      fuel:'Normal targets.',
      vitals:'Temperature starts to rise after ovulation.'},
    luteal:{n:'Luteal',c:'#8FBEEA',
      move:'Hard work is fine; if sessions feel harder in the heat, lower the volume a little rather than the intensity.',
      sleep:'Body temperature runs about 0.3 °C higher: a cooler room (about 18 °C / 65 °F) helps.',
      fuel:'Appetite runs higher; resting burn rises only about 30-120 kcal. A protein-first snack beats fighting cravings.',
      vitals:'A higher resting heart rate and lower HRV are normal now - Kova does not flag them in this phase.'},
    late:{n:'Late',c:'#E8607A',
      move:'Train by feel.',sleep:'Keep the routine.',fuel:'Normal targets.',
      vitals:'Your period is later than your usual. Stress, travel, illness and training load all shift it; if it is unusual for you, check in with a doctor.'}
  };
  function phaseNow(){ var t=D.on?today():null; return t?t.phase:''; }

  /* ---------------- the screen ---------------- */
  function ensureScreen(){
    var s=document.getElementById('s-cycle'); if(s) return s;
    var wrap=document.querySelector('#main .wrap')||document.getElementById('main'); if(!wrap) return null;
    s=document.createElement('section'); s.className='screen'; s.id='s-cycle';
    wrap.appendChild(s);
    try{ if(window.PILLAR) PILLAR.cycle='vitals'; }catch(e){}
    s.addEventListener('click',onClick);
    return s;
  }
  function cal(t){
    var now=new Date(), y=now.getFullYear(), m=now.getMonth(), first=new Date(y,m,1), start=first.getDay(), n=new Date(y,m+1,0).getDate();
    var pred={}, fert={};
    if(t){ for(var i=0;i<t.stats.plen;i++) pred[key(t.next+i*DAY)]=1; for(var f=t.fertile[0];f<=t.fertile[1];f+=DAY) fert[key(f)]=1; }
    var h='<div class="kc-cal"><div class="kc-mh">'+now.toLocaleDateString([], {month:'long',year:'numeric'})+'</div><div class="kc-wd">'+'SMTWTFS'.split('').map(function(x){ return '<i>'+x+'</i>'; }).join('')+'</div><div class="kc-grid">';
    for(var b=0;b<start;b++) h+='<span></span>';
    for(var d=1;d<=n;d++){
      var k=key(new Date(y,m,d).getTime()), c=[];
      if(D.days[k]) c.push('per'); else if(pred[k]) c.push('pred'); else if(fert[k]) c.push('fert');
      if(d===now.getDate()) c.push('today');
      if(D.sym[k]&&D.sym[k].length) c.push('sym');
      h+='<button class="'+c.join(' ')+'" data-day="'+k+'" aria-label="'+k+(D.days[k]?', period':'')+'">'+d+'</button>';
    }
    return h+'</div><div class="kc-key"><span class="per">Period</span><span class="pred">Predicted</span><span class="fert">Fertile window (estimate)</span></div></div>';
  }
  function paint(){
    var s=ensureScreen(); if(!s) return;
    var t=D.on?today():null, P=t?PHASE[t.phase]:null, tk=key(Date.now()), sym=D.sym[tk]||[];
    var h='<div class="hdr"><div class="hdr-l"><div class="back" data-back role="button" aria-label="Back"><svg class="ic"><use href="#i-chevron-left"/></svg></div>'
      +'<div><div class="eyebrow">VITALS</div><div class="title-s">Cycle</div></div></div></div>';
    if(!D.on){
      h+='<div class="kc-card"><div class="kc-h">Track your cycle</div><p class="kc-p">Kova links your cycle to your training, sleep, food and heart data - and stops calling normal luteal-phase changes a problem.</p>'
        +'<ul class="kc-ul"><li>Log your period in one tap</li><li>Next period and fertile window, estimated from your own cycles</li><li>What each phase means for the other areas</li></ul>'
        +'<button class="kc-btn" data-c="on">Start tracking</button><p class="kc-fine">Stays on this device unless you turn on sync. Not a method of birth control.</p></div>';
      s.innerHTML=h; return;
    }
    if(!t){
      h+='<div class="kc-card"><div class="kc-h">When did your last period start?</div><p class="kc-p">Tap the first day on the calendar, or log today.</p>'
        +'<button class="kc-btn" data-c="today">My period started today</button></div>'+cal(null);
      s.innerHTML=h+footer(); return;
    }
    var dn=Math.max(0,Math.round((t.next-Date.now())/DAY));
    h+='<div class="kc-hero" style="--kc:'+P.c+'"><div class="kc-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="kc-trk"/><circle cx="60" cy="60" r="52" class="kc-val" style="stroke-dasharray:'+(Math.min(1,t.day/t.stats.avg)*326.7).toFixed(1)+' 400"/></svg>'
      +'<div><b>Day '+t.day+'</b><span>'+esc(P.n)+'</span></div></div>'
      +'<div class="kc-hi"><div class="kc-big">'+(t.phase==='late'?'Late':(dn===0?'Today':dn+' days'))+'</div><div class="kc-sub">'+(t.phase==='late'?'past your usual cycle':'until your next period (estimate)')+'</div>'
      +'<div class="kc-sub">'+t.stats.avg+'-day cycle'+(t.stats.cycles?' · from '+t.stats.cycles+' cycle'+(t.stats.cycles>1?'s':''):' · default until 2 are logged')+(t.stats.sd!=null?' · ±'+Math.round(t.stats.sd)+' days':'')+'</div></div></div>'
      +'<div class="kc-row"><button class="kc-btn" data-c="'+(D.days[tk]?'unday':'today')+'">'+(D.days[tk]?'Remove today as a period day':'Log period today')+'</button></div>'
      +'<div class="kc-card"><div class="kc-h">How today affects the rest</div>'
      +[['Workout','move'],['Sleep','sleep'],['Fuel','fuel'],['Vitals','vitals']].map(function(x){ return '<div class="kc-fx"><b>'+x[0]+'</b><span>'+esc(P[x[1]])+'</span></div>'; }).join('')+'</div>'
      +'<div class="kc-card"><div class="kc-h">How do you feel today?</div><div class="kc-sym">'+SYM.map(function(x){ return '<button class="'+(sym.indexOf(x[0])>=0?'on':'')+'" data-sym="'+x[0]+'">'+x[1]+'</button>'; }).join('')+'</div></div>'
      +cal(t)
      +(t.retro?'<div class="kc-card"><div class="kc-h">Ovulation, looking back</div><p class="kc-p">Your temperature rose about '+t.retro.rise+' °C and stayed up from '+esc(t.retro.day)+', which usually means ovulation happened around then. This is found after the fact, like Apple and Oura do.</p></div>':'');
    s.innerHTML=h+footer();
  }
  function footer(){
    return '<div class="kc-card kc-priv"><div class="kc-h">Privacy</div><label class="kc-tg"><input type="checkbox" data-c="sync"'+(D.sync?' checked':'')+'> Sync cycle data to my Kova account</label>'
      +'<p class="kc-fine">Off: it never leaves this device. Kova never shares it. Estimates are not a method of birth control and not medical advice.</p>'
      +'<button class="kc-link" data-c="off">Stop tracking and delete cycle data</button></div>';
  }
  function onClick(e){
    var b=e.target.closest('[data-c],[data-day],[data-sym]'); if(!b) return;
    var c=b.getAttribute('data-c'), tk=key(Date.now());
    if(b.hasAttribute('data-day')){ var k=b.getAttribute('data-day'); if(parse(k)>Date.now()) return; D.days[k]=!D.days[k]; if(!D.days[k]) delete D.days[k]; }
    else if(b.hasAttribute('data-sym')){ var s=b.getAttribute('data-sym'), l=D.sym[tk]=D.sym[tk]||[], i=l.indexOf(s); if(i>=0) l.splice(i,1); else l.push(s); }
    else if(c==='on'){ D.on=true; }
    else if(c==='today'){ D.days[tk]=true; say('Logged.'); }
    else if(c==='unday'){ delete D.days[tk]; }
    else if(c==='sync'){ D.sync=b.checked; say(D.sync?'Cycle data syncs to your account.':'Cycle data stays on this device.'); }
    else if(c==='off'){ D={on:false,sync:false,days:{},sym:{},temp:{},dismissed:true}; save(D); try{ localStorage.removeItem(KEY); if(window.KP) KP.set('cycle',null); }catch(x){} say('Cycle data deleted.'); paint(); paintCards(); return; }
    save(D); paint(); paintCards();
  }
  /* the watch's wrist temperature, one value a night, when it arrives */
  function takeTemp(){
    try{
      var h=JSON.parse(localStorage.getItem('kova.health.v2')||'null'); if(!h||!h.f||h.f.temp==null) return;
      var v=parseFloat(String(h.f.temp).replace(/[^\d.\-+]/g,'')); if(!isFinite(v)) return;
      if(Math.abs(v)>5) v=v>45?(v-32)*5/9-36.5:v-36.5;   /* absolute readings become a deviation */
      var k=key(h.ts||Date.now()); if(D.temp[k]==null){ D.temp[k]=Math.round(v*100)/100; save(D); }
    }catch(e){}
  }
  /* small cards on Vitals and Home */
  function paintCards(){
    ['s-vitals','s-home'].forEach(function(id){
      var scr=document.getElementById(id); if(!scr) return;
      var el=scr.querySelector('.kc-mini');
      if(!D.on&&D.dismissed){ if(el) el.remove(); return; }
      if(id==='s-home'&&!D.on){ if(el) el.remove(); return; }
      if(!el){ el=document.createElement('button'); el.className='kc-mini'; el.setAttribute('data-go','cycle');
        var anchor=id==='s-vitals'?scr.querySelector('.card.card-lg'):scr.querySelector('#kgStrip')||scr.querySelector('.card.kova');
        if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(el,anchor.nextSibling); else scr.appendChild(el); }
      var t=D.on?today():null, P=t?PHASE[t.phase]:null;
      el.style.setProperty('--kc',P?P.c:'#E8607A');
      el.innerHTML=D.on?(t?'<i></i><b>Cycle · day '+t.day+'</b><span>'+esc(P.n)+(t.phase!=='late'?' · period in '+Math.max(0,Math.round((t.next-Date.now())/DAY))+' d':'')+'</span><em>›</em>':'<i></i><b>Cycle</b><span>Log your last period to start</span><em>›</em>')
        :'<i></i><b>Track your cycle</b><span>Link it to training, sleep and food</span><em>›</em>';
    });
  }
  function start(){ takeTemp(); ensureScreen(); paint(); paintCards(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,400); }); else setTimeout(start,400);
  document.addEventListener('click',function(e){ var g=e.target.closest&&e.target.closest('[data-go="cycle"]'); if(g){ paint(); } },true);
  return {paint:paint,today:today,phase:phaseNow,stats:stats,PHASE:PHASE,_data:function(){ return D; },_set:function(d){ D=d; save(D); paint(); paintCards(); }};
})();
