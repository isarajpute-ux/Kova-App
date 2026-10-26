/* =====================================================================
   KovaCycle - cycle and fertility, inside Vitals (p09, rebuilt p14).

   Lives in Vitals as its own section (not a separate page), laid out like
   a patient record: a cycle profile card, record rows that open in place,
   and one graph card per group of symptoms, so every pain sits on one
   graph, every gut symptom on another, and so on.

   What it tracks (one "Log today" sheet, a tap per item):
     bleeding     period flow (spotting, light, medium, heavy)
     pain         abdominal cramps, pelvic pain, lower back pain,
                  headache, breast pain
     digestion    bloating, constipation, diarrhea, nausea, appetite
     mood/energy  mood changes, fatigue, sleep changes, memory lapse
     skin/hair    acne, dry skin, hair loss
     temperature  hot flashes, night sweats, chills
     other        bladder incontinence, vaginal dryness
     signs        basal body temperature, cervical mucus, ovulation
                  (LH) test, sexual activity
     tests        pregnancy test, progesterone (PdG) test
     status       pregnant, breastfeeding, contraception
   Kova works out the rest from the log: irregular cycles, infrequent,
   prolonged periods, persistent spotting, bleeding during or after a
   pregnancy, and flags them for a doctor.

   How sure it is (said on screen, every time):
     calendar     next period from your own average; fertile window is
                  the 5 days before ovulation and the day of it (Wilcox
                  1995), ovulation ~14 days before the next period. Only
                  maths: never birth control.
     LH test      a positive test means ovulation in roughly 12-36 hours.
     temperature  a sustained rise of >= 0.2 C for 3 nights over the 6
                  before confirms ovulation happened (after the fact),
                  from basal temperature or the watch's wrist temperature.
     hormonal birth control usually stops ovulation, so no fertile window
     is shown; pregnancy pauses predictions; breastfeeding makes them
     less reliable.

   Patterns are your own history: "You usually log cramps 2 days before
   your period" needs the same thing in at least two cycles.
   Privacy: on this device unless you turn on sync. Not birth control.
   ===================================================================== */
window.KovaCycle=(function(){
  'use strict';
  var KEY='kova_cycle_v1', DAY=864e5;
  /* rose is Vitals' colour; amber is its contrast */
  var ROSE='#E8607A', AMBER='#F2B84B';
  var GROUPS=[
    {id:'pain',n:'Pain',c:ROSE,items:[['cramps','Abdominal cramps'],['pelvic','Pelvic pain'],['back','Lower back pain'],['headache','Headache'],['breast','Breast pain']]},
    {id:'gut',n:'Digestion',c:AMBER,items:[['bloating','Bloating'],['constipation','Constipation'],['diarrhea','Diarrhea'],['nausea','Nausea'],['appetite','Appetite changes']]},
    {id:'mind',n:'Mood & energy',c:'#F49AB0',items:[['mood','Mood changes'],['fatigue','Fatigue'],['sleep','Sleep changes'],['memory','Memory lapse']]},
    {id:'skin',n:'Skin & hair',c:'#F7D58B',items:[['acne','Acne'],['dryskin','Dry skin'],['hairloss','Hair loss']]},
    {id:'temp',n:'Hot & cold',c:'#FF8A65',items:[['hotflash','Hot flashes'],['nightsweat','Night sweats'],['chills','Chills']]},
    {id:'other',n:'Other',c:'#C9A7B4',items:[['bladder','Bladder incontinence'],['vdry','Vaginal dryness']]}
  ];
  var SYMN={}; GROUPS.forEach(function(g){ g.items.forEach(function(x){ SYMN[x[0]]=x[1]; }); });
  var OLD={tender:'breast',cravings:'appetite'};
  var SEV=['None','Mild','Moderate','Severe'];
  var FLOW=[['none','None'],['spot','Spotting'],['light','Light'],['med','Medium'],['heavy','Heavy']];
  var MUCUS=[['dry','Dry'],['sticky','Sticky'],['creamy','Creamy'],['watery','Watery'],['egg','Egg white']];
  var TEST=[['','Not taken'],['neg','Negative'],['pos','Positive']];
  var SEXA=[['','Not logged'],['none','None'],['prot','Protected'],['unprot','Unprotected']];
  var CONTRA=[['none','None'],['pill','Pill'],['iudh','Hormonal IUD'],['iudc','Copper IUD'],['implant','Implant'],['ring','Ring or patch'],['shot','Injection'],['other','Other']];
  var HORMONAL={pill:1,iudh:1,implant:1,ring:1,shot:1};

  function $(s,r){ return (r||document).querySelector(s); }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function key(t){ var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function parse(k){ var p=String(k).split('-'); return new Date(+p[0],+p[1]-1,+p[2]).getTime(); }
  function sod(t){ var d=new Date(t||Date.now()); d.setHours(0,0,0,0); return d.getTime(); }
  function md(t){ return new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }

  /* ---------------- data ---------------- */
  function blank(){ return {on:false,sync:false,days:{},flow:{},sev:{},sym:{},temp:{},bbt:{},lh:{},preg:{},prog:{},mucus:{},sexact:{},status:{preg:false,lact:false,contra:'none'},dismissed:false}; }
  function load(){
    var d=null; try{ d=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){}
    if(!d){ try{ var kp=window.KP&&KP.get('cycle'); if(kp) d=kp; }catch(e){} }
    d=Object.assign(blank(),d||{});
    ['days','flow','sev','sym','temp','bbt','lh','preg','prog','mucus','sexact'].forEach(function(k){ if(!d[k]||typeof d[k]!=='object') d[k]={}; });
    d.status=Object.assign({preg:false,lact:false,contra:'none'},d.status||{});
    /* the old one-tap symptoms become "moderate" in the new log */
    Object.keys(d.sym).forEach(function(k){ (d.sym[k]||[]).forEach(function(id){ id=OLD[id]||id; if(!SYMN[id]) return; d.sev[k]=d.sev[k]||{}; if(!d.sev[k][id]) d.sev[k][id]=2; }); });
    d.sym={};
    Object.keys(d.days).forEach(function(k){ if(d.days[k]&&!d.flow[k]) d.flow[k]='med'; });
    return d;
  }
  function save(d){
    d.saved=Date.now();
    try{ localStorage.setItem(KEY,JSON.stringify(d)); }catch(e){}
    try{ if(window.KP) KP.set('cycle',d.sync?d:null); }catch(e){}
  }
  var D=load();
  /* with sync on, a newer copy from your account (another phone, or this
     one after reinstalling) replaces this one when it arrives */
  function fromCloud(){
    var r=null; try{ r=window.KP&&KP.get('cycle'); }catch(e){}
    if(!r||!r.sync) return false;
    var local=D.saved||0, hasLocal=Object.keys(D.flow||{}).length||Object.keys(D.bbt||{}).length;
    if(hasLocal&&(r.saved||0)<=local) return false;
    try{ localStorage.setItem(KEY,JSON.stringify(r)); }catch(e){}
    D=load(); try{ paintAll(); }catch(e){}
    return true;
  }
  window.addEventListener('kova:cloud',fromCloud);
  function sex(){ var ob=(window.KP&&KP.get('onboard'))||{}; return ob.sex||lsJ('kova.sex',null)||null; }
  function setSex(v){ try{ localStorage.setItem('kova.sex',JSON.stringify(v)); }catch(e){} try{ if(window.KP){ var ob=KP.get('onboard')||{}; ob.sex=v; KP.set('onboard',ob); } }catch(e){} paintAll(); }

  /* ---------------- cycles ---------------- */
  function periodDays(){ return Object.keys(D.flow).filter(function(k){ return /light|med|heavy/.test(D.flow[k]); }).sort(); }
  function starts(){
    var ks=periodDays(), out=[];
    ks.forEach(function(k,i){ if(i===0||parse(k)-parse(ks[i-1])>2*DAY) out.push(k); });
    return out;
  }
  /* every cycle so far: start, length (to the next start), period length */
  function cycles(){
    var st=starts(), pd=periodDays(), out=[];
    st.forEach(function(k,i){
      var a=parse(k), b=i+1<st.length?parse(st[i+1]):null, plen=0;
      for(var t=a;;t+=DAY){ if(pd.indexOf(key(t))>=0) plen++; else if(plen) break; if(t-a>14*DAY) break; }
      out.push({k:k,a:a,b:b,len:b?Math.round((b-a)/DAY):null,plen:plen,open:!b});
    });
    return out;
  }
  function stats(){
    var C=cycles(), lens=C.filter(function(c){ return c.len&&c.len>=15&&c.len<=60; }).map(function(c){ return c.len; }).slice(-6);
    var avg=lens.length?Math.round(lens.reduce(function(a,b){ return a+b; },0)/lens.length):28;
    var sd=lens.length>1?Math.sqrt(lens.reduce(function(a,b){ return a+(b-avg)*(b-avg); },0)/lens.length):null;
    var pl=C.map(function(c){ return c.plen; }).filter(Boolean).slice(-6);
    var plen=pl.length?Math.round(pl.reduce(function(a,b){ return a+b; },0)/pl.length):5;
    return {starts:C.map(function(c){ return c.k; }),cycles:lens.length,avg:avg,sd:sd,plen:plen,lens:lens,range:lens.length?[Math.min.apply(null,lens),Math.max.apply(null,lens)]:null};
  }
  /* the sustained rise, found after the fact (3 nights >= 0.2 C above the 6 before) */
  function rise(map,from){
    var ks=Object.keys(map).filter(function(k){ return !from||k>=from; }).sort(), v=ks.map(function(k){ return +map[k]; });
    for(var i=6;i<v.length-2;i++){
      var base=Math.max.apply(null,v.slice(i-6,i));
      var mean=v.slice(i-6,i).reduce(function(a,b){ return a+b; },0)/6;
      if(v[i]>=mean+.2&&v[i+1]>=mean+.2&&v[i+2]>=mean+.2&&v[i]>base) return {day:ks[i-1],rise:Math.round((v[i]-mean)*100)/100,cover:Math.round(base*100)/100};
    }
    return null;
  }
  function retro(){ var st=starts(); var from=st.length?st[st.length-1]:null; return rise(Object.keys(D.bbt).length>=6?D.bbt:D.temp,from); }
  var PHASE={
    menstrual:{n:'Period',c:ROSE,
      move:'Train by feel. Research finds at most a small dip early in the cycle, and it differs a lot between people - if you feel good, the heavy day stays.',
      sleep:'Cramps can break sleep: heat on your lower belly and a steady bedtime help.',
      fuel:'Heavy flow costs iron: red meat, lentils, spinach with vitamin C.',
      vitals:'Resting heart rate is usually at its lowest now.'},
    follicular:{n:'Follicular',c:'#7DE0A6',
      move:'Often the best-feeling stretch for hard sessions and trying for PRs.',
      sleep:'Sleep tends to be steadier in this phase.',
      fuel:'Appetite is usually lower; your normal targets fit.',
      vitals:'HRV is usually higher and resting heart rate lower.'},
    ovulatory:{n:'Around ovulation',c:AMBER,
      move:'Strength often feels good; warm up well - some studies link this window with looser ligaments.',
      sleep:'Nothing special - keep the routine.',
      fuel:'Normal targets.',
      vitals:'Temperature starts to rise after ovulation.'},
    luteal:{n:'Luteal',c:'#8FBEEA',
      move:'Hard work is fine; if sessions feel harder in the heat, lower the volume a little rather than the intensity.',
      sleep:'Body temperature runs about 0.3 °C higher: a cooler room (about 18 °C / 65 °F) helps.',
      fuel:'Appetite runs higher; resting burn rises only about 30-120 kcal. A protein-first snack beats fighting cravings.',
      vitals:'A higher resting heart rate and lower HRV are normal now - Kova does not flag them in this phase.'},
    late:{n:'Late',c:ROSE,
      move:'Train by feel.',sleep:'Keep the routine.',fuel:'Normal targets.',
      vitals:'Your period is later than your usual. Stress, travel, illness and training load all shift it; if it is unusual for you, check in with a doctor.'}
  };
  /* today: day of cycle, phase, next period, fertile window and how sure */
  function today(t){
    t=t||Date.now();
    var s=stats(); if(!s.starts.length) return null;
    var last=parse(s.starts[s.starts.length-1]); if(last>t) return null;
    var day=Math.floor((sod(t)-last)/DAY)+1;
    var next=last+s.avg*DAY; while(next<sod(t)-DAY*2&&day<=s.avg+7) next+=s.avg*DAY;
    var ov=next-14*DAY, method='calendar', confirmed=false;
    var from=s.starts[s.starts.length-1];
    var lhPos=Object.keys(D.lh).filter(function(k){ return k>=from&&D.lh[k]==='pos'; }).sort()[0];
    if(lhPos){ ov=parse(lhPos)+DAY; method='lh'; }
    var r=rise(Object.keys(D.bbt).length>=6?D.bbt:D.temp,from);
    if(r){ ov=parse(r.day); method='temp'; confirmed=true; next=Math.max(next,ov+12*DAY); }
    var fertile=[ov-5*DAY,ov];
    var ovDay=Math.round((ov-last)/DAY)+1;
    var phase=day<=s.plen?'menstrual':(day<ovDay-2?'follicular':(day<=ovDay+1?'ovulatory':'luteal'));
    if(day>s.avg+7) phase='late';
    var st=D.status||{}, hormonal=!!HORMONAL[st.contra], paused=!!st.preg;
    var d0=sod(t), fert='low';
    if(!hormonal&&!paused){
      if(d0>=fertile[0]&&d0<=fertile[1]) fert=(d0>=ov-2*DAY)?'peak':'high';
      else if(d0===ov+DAY) fert='medium';
      if(D.mucus[key(t)]==='egg'&&fert==='low') fert='high';
    }
    return {day:day,phase:phase,next:next,fertile:fertile,ov:ov,ovDay:ovDay,method:method,confirmed:confirmed,fert:fert,stats:s,retro:r,hormonal:hormonal,paused:paused,lact:!!st.lact};
  }
  function phaseNow(){ var t=D.on?today():null; return t&&!t.paused?t.phase:''; }

  /* ---------------- symptoms over cycles ---------------- */
  function sevOn(k,id){ return ((D.sev[k]||{})[id])|0; }
  function groupDays(g,a,b){
    var n=0; for(var t=a;t<b;t+=DAY){ var k=key(t); if(g.items.some(function(x){ return sevOn(k,x[0])>0; })) n++; } return n;
  }
  /* per cycle (last 6 + this one): days with any symptom of the group */
  function groupSeries(g){
    var C=cycles().slice(-7), now=sod()+DAY;
    return C.map(function(c){ return {v:groupDays(g,c.a,c.b||now),open:!c.b,k:c.k}; });
  }
  /* "You usually log cramps 2 days before your period" */
  function patterns(){
    var st=starts().map(parse), out=[];
    if(st.length<2) return out;
    Object.keys(SYMN).forEach(function(id){
      var before={}, during={}, cyc={};
      Object.keys(D.sev).forEach(function(k){
        if(!sevOn(k,id)) return;
        var t=parse(k), nxt=st.filter(function(x){ return x>t; })[0], prv=st.filter(function(x){ return x<=t; }).slice(-1)[0];
        if(nxt&&nxt-t<=10*DAY){ var o=Math.round((nxt-t)/DAY); before[o]=(before[o]||0)+1; cyc['b'+nxt]=1; }
        else if(prv!=null&&t-prv<6*DAY){ var dd=Math.round((t-prv)/DAY)+1; during[dd]=(during[dd]||0)+1; cyc['d'+prv]=1; }
      });
      var pick=function(m,kind){
        var best=null; Object.keys(m).forEach(function(o){ var n=m[o]+(m[+o-1]||0)+(m[+o+1]||0); if(!best||n>best.n) best={o:+o,n:n}; });
        var cycN=Object.keys(cyc).filter(function(k){ return k.charAt(0)===kind; }).length;
        return best&&best.n>=2&&cycN>=2?{o:best.o,n:cycN}:null;
      };
      var b=pick(before,'b'), d=pick(during,'d');
      if(b) out.push({id:id,kind:'before',o:b.o,n:b.n,t:'You usually log '+SYMN[id].toLowerCase()+' '+(b.o===1?'the day':b.o+' days')+' before your period ('+b.n+' cycles).'});
      else if(d) out.push({id:id,kind:'during',o:d.o,n:d.n,t:'You usually log '+SYMN[id].toLowerCase()+' on day '+d.o+' of your period ('+d.n+' cycles).'});
    });
    return out.sort(function(a,b){ return b.n-a.n; });
  }
  /* what a doctor would want to know about; ACOG/FIGO ranges for adults */
  function flags(){
    var C=cycles(), s=stats(), out=[], last=C[C.length-1], now=sod();
    var lens=C.filter(function(c){ return c.len; }).slice(-6).map(function(c){ return c.len; });
    if(lens.some(function(l){ return l<21; })) out.push({k:'short',t:'A cycle shorter than 21 days',d:'Cycles usually run 21 to 35 days.'});
    if(lens.some(function(l){ return l>35; })) out.push({k:'infrequent',t:'Infrequent periods: a cycle longer than 35 days',d:'Cycles usually run 21 to 35 days.'});
    if(lens.length>=3&&(Math.max.apply(null,lens)-Math.min.apply(null,lens))>9) out.push({k:'irregular',t:'Irregular cycles: they vary by more than 9 days',d:'Shortest '+Math.min.apply(null,lens)+', longest '+Math.max.apply(null,lens)+' days.'});
    if(C.some(function(c){ return c.plen>7; })) out.push({k:'prolonged',t:'Prolonged period: bleeding longer than 7 days',d:'Longest: '+Math.max.apply(null,C.map(function(c){ return c.plen; }))+' days.'});
    var spots=Object.keys(D.flow).filter(function(k){ return D.flow[k]==='spot'; }).sort(), run=1, maxRun=spots.length?1:0;
    spots.forEach(function(k,i){ if(i&&parse(k)-parse(spots[i-1])===DAY){ run++; maxRun=Math.max(maxRun,run); } else run=1; });
    if(maxRun>=5||spots.length>=8) out.push({k:'spotting',t:'Persistent spotting between periods',d:spots.length+' spotting days logged.'});
    if(last&&!D.status.preg&&!HORMONAL[D.status.contra]&&now-last.a>90*DAY) out.push({k:'absent',t:'No period logged for over 90 days',d:'If you are not pregnant or breastfeeding, this is worth a check.'});
    if(D.status.preg&&Object.keys(D.flow).some(function(k){ return parse(k)>=(D.status.pregAt||0)&&D.flow[k]!=='none'; })) out.push({k:'pregbleed',t:'Bleeding during pregnancy',d:'Tell your midwife or doctor about any bleeding in pregnancy.',urgent:true});
    var pel=Object.keys(D.sev).filter(function(k){ return sevOn(k,'pelvic')===3; });
    if(pel.length>=2) out.push({k:'pelvic',t:'Severe pelvic pain on '+pel.length+' days',d:'Severe pain is not something to put up with; a doctor can look for causes like endometriosis.'});
    return out;
  }

  /* ---------------- drawing ---------------- */
  function dotPlot(vals,col){
    if(!vals.length) return '<svg class="kcx-dp" viewBox="0 0 120 44" aria-hidden="true"><line x1="4" y1="30" x2="116" y2="30" class="bl"/></svg>';
    var mx=Math.max.apply(null,vals.concat([3])), base=vals.length>1?vals.slice(0,-1).reduce(function(a,b){ return a+b; },0)/(vals.length-1):vals[0];
    var y=function(v){ return 38-(v/mx)*30; }, x=function(i){ return vals.length===1?60:8+i*(104/(vals.length-1)); };
    var h='<rect x="2" y="'+y(base).toFixed(1)+'" width="116" height="'+(40-y(base)).toFixed(1)+'" class="ar"/><line x1="2" y1="'+y(base).toFixed(1)+'" x2="118" y2="'+y(base).toFixed(1)+'" class="bl"/>';
    vals.forEach(function(v,i){ var last=i===vals.length-1; h+=last?'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(v).toFixed(1)+'" r="6" class="rg" style="stroke:'+col+'"/><circle cx="'+x(i).toFixed(1)+'" cy="'+y(v).toFixed(1)+'" r="2.6" style="fill:'+col+'"/>':'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(v).toFixed(1)+'" r="2.3" class="d"/>'; });
    return '<svg class="kcx-dp" viewBox="0 0 120 44" aria-hidden="true">'+h+'</svg>';
  }
  /* this cycle as a dashed line: period, fertile window, ovulation, today */
  function dash(t){
    var n=Math.max(t.stats.avg,t.day), last=parse(t.stats.starts[t.stats.starts.length-1]), h='';
    for(var i=0;i<n;i++){
      var d=last+i*DAY, k=key(d), c='o';
      if(/light|med|heavy/.test(D.flow[k]||'')) c='p';
      else if(i<t.stats.plen&&d>sod()) c='pp';
      else if(!t.hormonal&&!t.paused&&d>=t.fertile[0]&&d<=t.fertile[1]) c=(d===t.ov?'ov':'fw');
      if(d===sod()) c+=' now';
      h+='<i class="'+c+'" style="--w:'+(c.charAt(0)==='p'?3:(c.indexOf('ov')===0?2.4:(c.indexOf('fw')===0?2:1)))+'"></i>';
    }
    return '<div class="kcx-dash" role="img" aria-label="This cycle, day '+t.day+' of about '+t.stats.avg+'">'+h+'</div>';
  }
  function tempChart(){
    var src=Object.keys(D.bbt).length>=3?D.bbt:D.temp, ks=Object.keys(src).sort().slice(-14);
    if(ks.length<3) return '';
    var v=ks.map(function(k){ return +src[k]; }), mx=Math.max.apply(null,v), mn=Math.min.apply(null,v), r=(mx-mn)||.4;
    var pts=v.map(function(x,i){ return (6+i*(108/(v.length-1))).toFixed(1)+','+(34-((x-mn)/r)*26).toFixed(1); }).join(' ');
    var isBBT=src===D.bbt, fmt=function(x){ return isBBT?x.toFixed(2)+'°':(x>=0?'+':'')+x.toFixed(2)+'°'; };
    return '<div class="kcx-tc"><svg viewBox="0 0 120 40" aria-hidden="true"><polyline points="'+pts+'"/></svg><div><b>'+fmt(v[v.length-1])+'</b><span>'+(isBBT?'basal':'wrist')+'</span><b class="m">'+fmt(mn)+'</b><span>low</span></div></div>';
  }
  var FERT_N={low:'Low',medium:'Medium',high:'High',peak:'Peak'};
  function howSure(t){
    if(t.paused) return 'Pregnancy: predictions paused';
    if(t.hormonal) return 'Hormonal birth control: no fertile window shown';
    if(t.method==='temp') return 'Ovulation confirmed by temperature ('+md(t.ov)+')';
    if(t.method==='lh') return 'From your positive ovulation test';
    return 'Calendar estimate'+(t.stats.cycles<2?' (default 28 days until 2 cycles are logged)':', from '+t.stats.cycles+' cycles')+(t.lact?' · breastfeeding makes it less reliable':'');
  }
  function todayCount(){ var k=key(Date.now()), n=Object.keys(D.sev[k]||{}).filter(function(id){ return D.sev[k][id]>0; }).length;
    ['flow','lh','preg','prog','mucus','bbt','sexact'].forEach(function(f){ if(D[f][k]!=null&&D[f][k]!==''&&D[f][k]!=='none') n++; }); return n; }

  var UI={open:{prof:true},grp:null};
  function section(){
    var t=D.on?today():null, s=stats();
    if(!D.on){
      return '<div class="kcx-card kcx-start"><div class="kcx-ph"><span>Track your cycle</span></div>'
        +'<p class="kcx-p">Your period, symptoms and fertile window, linked to your sleep, training, food and heart data. Kova stops calling normal luteal-phase changes a problem.</p>'
        +'<label class="kcx-lbl">When did your last period start?<input type="date" id="kcxStart" max="'+key(Date.now())+'"></label>'
        +'<div class="kcx-acts"><button class="kcx-btn" data-k="start">Start tracking</button><button class="kcx-btn ghost" data-k="startnow">It started today</button></div>'
        +'<p class="kcx-fine">Stays on this device unless you turn on sync. Not a method of birth control.</p></div>';
    }
    var h='';
    if(!t){
      h+='<div class="kcx-card kcx-start"><div class="kcx-ph"><span>Cycle profile</span></div><p class="kcx-p">Log the first day of your last period to start the predictions.</p>'
        +'<label class="kcx-lbl">First day of your last period<input type="date" id="kcxStart" max="'+key(Date.now())+'"></label>'
        +'<div class="kcx-acts"><button class="kcx-btn" data-k="start">Save</button><button class="kcx-btn ghost" data-k="startnow">It started today</button></div></div>';
    } else {
      var P=PHASE[t.phase], dn=Math.round((t.next-sod())/DAY), op=UI.open.prof;
      h+='<div class="kcx-card kcx-prof'+(op?' open':'')+'" style="--kc:'+P.c+'">'
        +'<button class="kcx-ph" data-k="fold" data-f="prof" aria-expanded="'+op+'"><span>Cycle profile</span><svg class="ic"><use href="#i-chevron-'+(op?'up':'down')+'"/></svg></button>'
        +'<div class="kcx-3"><div><small>Day:</small><b>'+t.day+(t.paused?'':' <i>of ~'+s.avg+'</i>')+'</b></div><div><small>Phase:</small><b>'+esc(t.paused?'Pregnant':P.n)+'</b></div>'
        +'<div><small>Next period:</small><b>'+(t.paused?'Paused':(t.phase==='late'?'Late':(dn<=0?'Today':md(t.next))))+'</b></div></div>'
        +(op?('<div class="kcx-tl"><span>This cycle</span><b>'+(s.cycles?s.avg+' days'+(s.sd!=null?' ±'+Math.max(1,Math.round(s.sd)):''):'~28 days')+'</b></div>'+dash(t)
          +'<div class="kcx-key"><span class="p">Period</span><span class="fw">Fertile window</span><span class="ov">Ovulation</span><span class="now">Today</span></div>'):'')
        +'</div>';
      h+=dialCard(t)+curveCard(t);
      var pt=patterns(), soon=pt.filter(function(p){ return p.kind==='before'&&Math.abs(Math.round((t.next-sod())/DAY)-p.o)<=1; })[0];
      if(soon) h+='<div class="kcx-heads"><span>Heads-up</span>'+esc(soon.t.replace(' ('+soon.n+' cycles).','.'))+' Your period is due '+(dn<=0?'today':'in '+dn+' day'+(dn===1?'':'s'))+'.</div>';
    }
    h+='<div class="kcx-acts"><button class="kcx-btn" data-k="log">Log today'+(todayCount()?' · '+todayCount():'')+'</button>'
      +'<button class="kcx-btn ghost" data-k="period">'+(/light|med|heavy/.test(D.flow[key(Date.now())]||'')?'Period today ✓':'Period today')+'</button></div>';
    /* record rows */
    var fl=flags(), pt2=patterns(), st0=D.status||{};
    h+=rec('tests','Tests:','Ovulation, pregnancy, progesterone',testsBody());
    h+=rec('status','Status:',[st0.preg?'Pregnant':'Not pregnant',st0.lact?'Breastfeeding':'',(CONTRA.filter(function(c){ return c[0]===st0.contra; })[0]||CONTRA[0])[1]==='None'?'No birth control':(CONTRA.filter(function(c){ return c[0]===st0.contra; })[0]||CONTRA[0])[1]].filter(Boolean).join(' · '),statusBody());
    h+=rec('patterns','Patterns:',pt2.length?pt2.length+' that repeat':'Need 2 cycles',pt2.length?'<ul class="kcx-ul">'+pt2.slice(0,8).map(function(p){ return '<li>'+esc(p.t)+'</li>'; }).join('')+'</ul>':'<p class="kcx-p">Patterns show once something repeats in two cycles. Keep logging; one tap a day is enough.</p>');
    h+=checkCard(fl);
    /* grouped graphs */
    h+='<div class="kcx-sh">Symptoms, grouped</div><div class="kcx-grid">'+GROUPS.map(gCard).join('')+'</div>';
    if(UI.grp) h+=gDetail(GROUPS.filter(function(g){ return g.id===UI.grp; })[0]);
    h+=rec('learn','Learn:','Fertility, ovulation and what affects them',learnBody());
    h+='<div class="kcx-acts"><button class="kcx-btn ghost" data-k="report">Report for your doctor</button></div>';
    h+='<div class="kcx-priv"><label class="kcx-tg"><input type="checkbox" data-k="sync"'+(D.sync?' checked':'')+'> Sync cycle data to my Kova account</label>'
      +'<p class="kcx-fine">Off: it never leaves this device. Kova never shares it or uses it for ads. Estimates are not a method of birth control and not medical advice.</p>'
      +'<button class="kcx-link" data-k="off">Stop tracking and delete cycle data</button></div>';
    return h;
  }
  /* ---- image 4 and 5: three numbers on top, a curved three-way switch,
     and a half dial with tick marks (or a tick ruler for regularity) ---- */
  function regularity(){
    var s=stats(), L=s.lens; if(L.length<2) return null;
    var range=Math.max.apply(null,L)-Math.min.apply(null,L);
    return {range:range,score:Math.max(0,Math.round(100-range*7)),n:L.length,word:range<=7?'Regular':(range<=9?'Mostly regular':'Irregular')};
  }
  function halfDial(frac,from,to,needle,big,small,sub){
    var cx=150, cy=150, R=118, ticks='';
    for(var i=0;i<=60;i++){ var a=Math.PI*(1-i/60), r1=R+6, r2=R+(i%5===0?16:11); ticks+='<line x1="'+(cx+r1*Math.cos(a)).toFixed(1)+'" y1="'+(cy-r1*Math.sin(a)).toFixed(1)+'" x2="'+(cx+r2*Math.cos(a)).toFixed(1)+'" y2="'+(cy-r2*Math.sin(a)).toFixed(1)+'"/>'; }
    var arc=function(f0,f1){ var a0=Math.PI*(1-f0), a1=Math.PI*(1-f1); return 'M'+cx+' '+cy+' L'+(cx+R*Math.cos(a0)).toFixed(1)+' '+(cy-R*Math.sin(a0)).toFixed(1)+' A'+R+' '+R+' 0 0 1 '+(cx+R*Math.cos(a1)).toFixed(1)+' '+(cy-R*Math.sin(a1)).toFixed(1)+' Z'; };
    var na=Math.PI*(1-needle);
    return '<svg class="kcx-hd" viewBox="0 0 300 160" aria-hidden="true"><defs><linearGradient id="kcxHdG" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="var(--x-rose)" stop-opacity=".95"/><stop offset="1" stop-color="var(--x-amber)" stop-opacity=".55"/></linearGradient></defs>'
      +'<g class="tk">'+ticks+'</g><path class="bg" d="'+arc(0,1)+'"/>'+(to>from?'<path class="fill" d="'+arc(from,to)+'"/>':'')
      +'<line class="nd" x1="'+cx+'" y1="'+cy+'" x2="'+(cx+(R+22)*Math.cos(na)).toFixed(1)+'" y2="'+(cy-(R+22)*Math.sin(na)).toFixed(1)+'"/></svg>'
      +'<div class="kcx-hdt"><small>'+esc(sub)+'</small><b>'+esc(big)+'</b><span>'+esc(small)+'</span></div>';
  }
  function dialCard(t){
    var s=t.stats, v=UI.dial||'day', rg=regularity(), body='';
    if(v==='day'){
      var f=Math.min(1,t.day/Math.max(s.avg,t.day));
      body=halfDial(f,0,f,f,'Day '+t.day,t.paused?'Pregnant':PHASE[t.phase].n,'Where you are');
    } else if(v==='fert'){
      var last=parse(s.starts[s.starts.length-1]), n=Math.max(s.avg,t.day), a=(t.fertile[0]-last)/DAY/n, b=((t.fertile[1]-last)/DAY+1)/n, o=((t.ov-last)/DAY+.5)/n;
      body=t.hormonal||t.paused?halfDial(0,0,0,0,'—',t.paused?'Paused in pregnancy':'Not shown on hormonal birth control','Fertile window')
        :halfDial(Math.max(0,a),Math.max(0,a),Math.min(1,b),Math.min(1,o),md(t.fertile[0])+'–'+md(t.fertile[1]),'Ovulation ~'+md(t.ov)+(t.confirmed?' (confirmed)':''),'Fertile window');
    } else {
      body=rg?'<div class="kcx-rul"><small>Regularity</small><b>'+rg.score+'<i>%</i></b><span>'+esc(rg.word)+': your last '+rg.n+' cycles vary by '+rg.range+' day'+(rg.range===1?'':'s')+'</span>'
          +'<div class="kcx-ticks" role="img" aria-label="'+rg.score+' percent regular">'+Array.apply(null,{length:41}).map(function(_,i){ return '<i class="'+(Math.round(rg.score/2.5)===i?'m':(i%10===0?'l':''))+'"></i>'; }).join('')+'</div><div class="kcx-rx"><span>0%</span><span>100%</span></div></div>'
        :'<div class="kcx-rul"><small>Regularity</small><b>—</b><span>Shows once two cycles are logged.</span></div>';
    }
    var segs=[['day','Day','#i-clock'],['fert','Fertile','#i-seedling'],['reg','Regular','#i-chart-line']];
    return '<div class="kcx-card kcx-dialc">'
      +'<div class="kcx-s3"><div><small>Cycles logged</small><b>'+s.cycles+'</b></div><div><small>Average cycle</small><b>'+s.avg+'<i>d</i></b></div><div><small>Period</small><b>'+s.plen+'<i>d</i></b></div></div>'
      +'<div class="kcx-arc" role="tablist" aria-label="Dial">'+segs.map(function(x,i){ return '<button role="tab" aria-selected="'+(v===x[0])+'" class="s'+i+(v===x[0]?' on':'')+'" data-k="dial" data-v="'+x[0]+'"><svg class="ic"><use href="'+x[2]+'"/></svg><span>'+x[1]+'</span></button>'; }).join('')+'</div>'
      +'<div class="kcx-dialw">'+body+'</div></div>';
  }
  /* ---- image 6: two big numbers, a curve with labelled pills, a pill
     button with a round one beside it, and a bar sparkline under it ---- */
  var WILCOX={'-5':.10,'-4':.16,'-3':.14,'-2':.27,'-1':.31,'0':.33};
  function curveCard(t){
    var s=t.stats, last=parse(s.starts[s.starts.length-1]), n=Math.max(s.avg,t.day), ovD=Math.round((t.ov-last)/DAY), today=Math.round((sod()-last)/DAY);
    var off=t.hormonal||t.paused;
    var pts=[], W=300, H=120, x=function(d){ return 10+d/(n-1)*(W-20); }, y=function(p){ return 100-p*240; };
    for(var d=0;d<n;d++){ var k=String(d-ovD), p=off?0:(WILCOX[k]||0); pts.push([x(d),y(p)]); }
    var line=pts.map(function(q,i){ return (i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1); }).join(' ');
    var area=line+' L'+x(n-1).toFixed(1)+' 100 L'+x(0).toFixed(1)+' 100 Z';
    var pTo=off?0:(WILCOX[String(today-ovD)]||0);
    var guides=[0,7,14,21].filter(function(d){ return d<n; }).map(function(d){ return '<line class="gd" x1="'+x(d).toFixed(1)+'" y1="8" x2="'+x(d).toFixed(1)+'" y2="100"/>'; }).join('')
      +'<line class="gh" x1="10" y1="'+y(.165).toFixed(1)+'" x2="'+(W-10)+'" y2="'+y(.165).toFixed(1)+'"/>';
    var svg='<svg class="kcx-cv" viewBox="0 0 '+W+' '+(H+14)+'" aria-hidden="true">'+guides
      +'<path class="ar" d="'+area+'"/><path class="ln" d="'+line+'"/>'
      +(today>=0&&today<n?'<circle class="td" cx="'+x(today).toFixed(1)+'" cy="'+y(pTo).toFixed(1)+'" r="4"/>':'')
      +(!off?'<circle class="pk" cx="'+x(ovD).toFixed(1)+'" cy="'+y(.33).toFixed(1)+'" r="3.5"/>':'')
      +[0,7,14,21].filter(function(d){ return d<n; }).map(function(d){ return '<text x="'+x(d).toFixed(1)+'" y="'+(H+10)+'"'+(d===0?' style="text-anchor:start"':'')+'>Day '+(d+1)+'</text>'; }).join('')+'</svg>';
    var pills=off?'':'<span class="kcx-pill a" style="left:'+(x(ovD)/W*100).toFixed(1)+'%;top:6%">↑ 33% · ovulation ~'+md(t.ov)+'</span>'
      +(today>=0&&today<n?'<span class="kcx-pill b" style="left:'+(x(today)/W*100).toFixed(1)+'%;top:'+Math.max(30,(y(pTo)/(H+14)*100-22)).toFixed(0)+'%">Today · '+Math.round(pTo*100)+'%</span>':'');
    var src=Object.keys(D.bbt).length>=3?D.bbt:D.temp, tk=Object.keys(src).sort().slice(-14), tv=tk.map(function(k){ return +src[k]; });
    var mx=tv.length?Math.max.apply(null,tv):0, mn=tv.length?Math.min.apply(null,tv):0, rr=(mx-mn)||.3, isB=src===D.bbt;
    var bars=tv.length?'<div class="kcx-bars" aria-hidden="true">'+tv.map(function(v){ return '<i style="height:'+(18+((v-mn)/rr)*82).toFixed(0)+'%"></i>'; }).join('')+'</div>':'';
    var tf=function(v){ return isB?v.toFixed(2)+'°':(v>=0?'+':'')+v.toFixed(2)+'°'; };
    return '<div class="kcx-card kcx-curve">'
      +'<div class="kcx-ch"><small>Fertility</small></div>'
      +'<div class="kcx-two2"><div><b>'+(off?'—':FERT_N[t.fert])+'</b><small>Today</small></div><div><b>'+(off?'—':Math.round(pTo*100)+'%')+'</b><small>Chance of conceiving today</small></div></div>'
      +'<div class="kcx-cvw">'+svg+pills+'</div>'
      +'<div class="kcx-ctas"><button class="kcx-btn" data-k="logsigns">Log a test or temperature</button><button class="kcx-round" data-k="logsigns" aria-label="Log temperature"><svg class="ic"><use href="#i-temperature"/></svg></button></div>'
      +'<p class="kcx-fine">'+esc(howSure(t))+'. Chances by day from the Wilcox 1995 study of when pregnancies started; your own signs move the window.</p>'
      +(tv.length?'<div class="kcx-ch2"><small>'+(isB?'Basal temperature':'Wrist temperature')+'</small></div><div class="kcx-two2"><div><b>'+tf(tv[tv.length-1])+'</b><small>Last night</small></div><div><b>'+(t.retro?'+'+t.retro.rise.toFixed(2)+'°':'—')+'</b><small>'+(t.retro?'Rise after ovulation':'No rise yet this cycle')+'</small></div></div>'+bars:'')
      +'</div>';
  }
  /* ---- image 9: a status card, labels on the left, what they are on the
     right, and a risk chip ---- */
  function checkCard(fl){
    var C=cycles(), s=stats(), rg=regularity(), ks=fl.map(function(f){ return f.k; }), lastLen=C.filter(function(c){ return c.plen; }).slice(-1)[0];
    var pel=Object.keys(D.sev).filter(function(k){ return sevOn(k,'pelvic')||sevOn(k,'cramps'); }).map(function(k){ return Math.max(sevOn(k,'pelvic'),sevOn(k,'cramps')); });
    var pmax=pel.length?Math.max.apply(null,pel):0;
    var rows=[
      ['Length',rg?(ks.indexOf('irregular')>=0?'Irregular':(ks.indexOf('infrequent')>=0?'Infrequent':(ks.indexOf('short')>=0?'Short':rg.word))):'Needs 2 cycles',ks.some(function(k){ return /irregular|infrequent|short/.test(k); })],
      ['Bleeding',ks.indexOf('prolonged')>=0?'Prolonged':(lastLen?'Normal, '+s.plen+' days':'Not logged'),ks.indexOf('prolonged')>=0||ks.indexOf('pregbleed')>=0],
      ['Spotting',ks.indexOf('spotting')>=0?'Persistent':'None to speak of',ks.indexOf('spotting')>=0],
      ['Pain',pmax===3?'Severe on some days':(pmax===2?'Moderate':(pmax?'Mild':'None logged')),ks.indexOf('pelvic')>=0]
    ];
    var urgent=fl.some(function(f){ return f.urgent; }), bad=rows.filter(function(r){ return r[2]; }).length;
    var risk=urgent?['high','Tell your doctor']:(bad?['watch','Worth a check']:['ok','All clear']);
    var op=!!UI.open.flags;
    return '<div class="kcx-card kcx-check"><div class="kcx-ckh"><b>Cycle check</b><span class="kcx-risk '+risk[0]+'">'+risk[1]+'</span></div>'
      +'<div class="kcx-ckg">'+rows.map(function(r){ return '<span>'+r[0]+'</span><b class="'+(r[2]?'warn':'')+'">'+esc(r[1])+'</b>'; }).join('')+'</div>'
      +(fl.length?'<button class="kcx-link2" data-k="fold" data-f="flags" aria-expanded="'+op+'">'+(op?'Hide':'What this means')+'</button>'
        +(op?'<ul class="kcx-ul">'+fl.map(function(f){ return '<li class="'+(f.urgent?'u':'')+'"><b>'+esc(f.t)+'</b> '+esc(f.d)+'</li>'; }).join('')+'</ul><p class="kcx-fine">Kova does not diagnose. These are the things a gynaecologist would want to see; the report below has them.</p>':''):'')
      +'</div>';
  }
  function rec(id,a,b,body,tone){
    var op=!!UI.open[id];
    return '<div class="kcx-rec'+(op?' open':'')+(tone?' '+tone:'')+'"><button class="kcx-rh" data-k="fold" data-f="'+id+'" aria-expanded="'+op+'"><span><em>'+esc(a)+'</em> '+esc(b)+'</span><svg class="ic"><use href="#i-chevron-'+(op?'up':'down')+'"/></svg></button>'
      +(op?'<div class="kcx-rb">'+body+'</div>':'')+'</div>';
  }
  function gCard(g){
    var ser=groupSeries(g), cur=ser.length?ser[ser.length-1].v:0, prev=ser.slice(0,-1).map(function(x){ return x.v; });
    var avg=prev.length?prev.reduce(function(a,b){ return a+b; },0)/prev.length:null, dl=avg==null?null:Math.round((cur-avg)*10)/10;
    var pt=patterns().filter(function(p){ return g.items.some(function(x){ return x[0]===p.id; }); })[0];
    var top=g.items.map(function(x){ var n=0; Object.keys(D.sev).forEach(function(k){ if(sevOn(k,x[0])) n++; }); return {n:n,t:x[1]}; }).sort(function(a,b){ return b.n-a.n; })[0];
    return '<button class="kcx-g'+(UI.grp===g.id?' on':'')+'" data-k="grp" data-g="'+g.id+'" style="--g:'+g.c+'" aria-expanded="'+(UI.grp===g.id)+'">'
      +'<span class="kcx-gh"><i></i>'+esc(g.n)+'</span>'
      +'<span class="kcx-gv">'+cur+'<small>day'+(cur===1?'':'s')+' this cycle</small><span class="kcx-ar">'+(UI.grp===g.id?'↑':'→')+'</span></span>'
      +(dl!=null&&dl!==0?'<span class="kcx-gd'+(dl>0?' up':'')+'">'+(dl>0?'+':'')+dl+' vs usual</span>':'<span class="kcx-gd z">'+(avg==null?'First cycle':'Same as usual')+'</span>')
      +dotPlot(ser.map(function(x){ return x.v; }),g.c)
      +'<span class="kcx-gf">'+esc(pt?pt.t.replace(/ \(\d+ cycles\)\./,'.'):(top&&top.n?'Most logged: '+top.t.toLowerCase():'Nothing logged yet'))+'</span></button>';
  }
  /* every symptom of the group on one graph: rows are symptoms, columns
     are days of this cycle, colour is how bad it was */
  function gDetail(g){
    var t=today(), s=stats(); if(!g) return '';
    var last=t?parse(s.starts[s.starts.length-1]):sod()-27*DAY, n=t?Math.max(s.avg,t.day):28;
    var rows=g.items.map(function(x){
      var cells='', tot=0;
      for(var i=0;i<n;i++){ var d=last+i*DAY, v=sevOn(key(d),x[0]); tot+=v?1:0; cells+='<i class="s'+v+(d===sod()?' now':'')+(d>sod()?' fut':'')+'" title="Day '+(i+1)+': '+SEV[v]+'"></i>'; }
      return '<div class="kcx-hr"><span>'+esc(x[1])+'</span><div class="kcx-hc" style="--n:'+n+'">'+cells+'</div><em>'+tot+'</em></div>';
    }).join('');
    return '<div class="kcx-card kcx-det" style="--g:'+g.c+'"><div class="kcx-ph"><span>'+esc(g.n)+', this cycle</span><button class="kcx-x" data-k="grp" data-g="'+g.id+'" aria-label="Close">×</button></div>'
      +'<div class="kcx-hm">'+rows+'<div class="kcx-hr ax"><span></span><div class="kcx-hc" style="--n:'+n+'">'+Array.apply(null,{length:n}).map(function(_,i){ return '<b>'+((i+1)%7===1?i+1:'')+'</b>'; }).join('')+'</div><em></em></div></div>'
      +'<div class="kcx-key sev"><span class="s1">Mild</span><span class="s2">Moderate</span><span class="s3">Severe</span></div>'
      +'<button class="kcx-btn" data-k="log">Log '+esc(g.n.toLowerCase())+' today</button></div>';
  }
  function testsBody(){
    var rows=[['lh','Ovulation (LH) tests'],['preg','Pregnancy tests'],['prog','Progesterone (PdG) tests']].map(function(r){
      var ks=Object.keys(D[r[0]]).filter(function(k){ return D[r[0]][k]; }).sort().slice(-4).reverse();
      return '<div class="kcx-tr"><b>'+r[1]+'</b><span>'+(ks.length?ks.map(function(k){ return md(parse(k))+': '+(D[r[0]][k]==='pos'?'positive':'negative'); }).join(' · '):'None logged')+'</span></div>'; }).join('');
    return rows+'<p class="kcx-fine">A positive LH test means ovulation in about 12 to 36 hours. A positive PdG test a week later supports that it happened. Log results in "Log today".</p>';
  }
  function statusBody(){
    var st=D.status||{};
    return '<div class="kcx-st"><span>Pregnant</span>'+seg('preg',[[false,'No'],[true,'Yes']],!!st.preg)+'</div>'
      +'<div class="kcx-st"><span>Breastfeeding</span>'+seg('lact',[[false,'No'],[true,'Yes']],!!st.lact)+'</div>'
      +'<div class="kcx-st col"><span>Birth control</span><div class="kcx-chips">'+CONTRA.map(function(c){ return '<button class="kcx-chip'+(st.contra===c[0]?' on':'')+'" data-k="contra" data-v="'+c[0]+'" aria-pressed="'+(st.contra===c[0])+'">'+c[1]+'</button>'; }).join('')+'</div></div>'
      +'<p class="kcx-fine">'+(HORMONAL[st.contra]?'Hormonal birth control usually stops ovulation, so Kova shows no fertile window, and a bleed on the pill is a withdrawal bleed, not a period.':(st.contra==='iudc'?'A copper IUD does not stop ovulation, so predictions work as normal.':'Pregnancy pauses predictions. Breastfeeding can delay ovulation, which makes them less reliable.'))+'</p>';
  }
  function seg(k,opts,cur){ return '<div class="kcx-seg">'+opts.map(function(o){ return '<button data-k="st" data-f="'+k+'" data-v="'+o[0]+'" class="'+(o[0]===cur?'on':'')+'" aria-pressed="'+(o[0]===cur)+'">'+o[1]+'</button>'; }).join('')+'</div>'; }
  /* plain words on fertility, and what helps or hurts it - tied to what
     Kova sees in your data where it can */
  function learnBody(){
    var tie=[];
    try{ var R=window.KovaToday&&KovaToday.readiness?KovaToday.readiness():null; if(R&&R.sleep&&R.sleep.mins&&R.sleep.mins<360) tie.push('You are averaging under 6 hours of sleep: short sleep is linked with less regular cycles.'); }catch(e){}
    try{ var a=window.KovaAgent&&KovaAgent.audit?KovaAgent.audit():null, tr=a&&a.metrics.filter(function(m){ return m.id==='training'; })[0], fd=a&&a.metrics.filter(function(m){ return m.id==='food'; })[0];
      if(tr&&tr.status==='fix'&&fd&&fd.status==='fix') tie.push('Hard training on too little food is the most common cause of missed periods in active women (low energy availability). Eat to your target on training days.'); }catch(e){}
    return '<div class="kcx-learn"><p><b>Ovulation</b> is the day an ovary releases an egg, about 14 days before your next period. The egg lives about a day.</p>'
      +'<p><b>The fertile window</b> is the 5 days before ovulation and the day of it, because sperm can live up to 5 days. Pregnancy outside those 6 days is unlikely; inside them the chance is highest on the 2 days before ovulation.</p>'
      +'<p><b>Real signs beat the calendar.</b> An LH test turns positive 12 to 36 hours before ovulation; basal or wrist temperature rises about 0.2 to 0.5 °C after it and stays up; clear, stretchy "egg white" mucus is the most fertile sign. Wearables that combine these find the fertile window about 88% of the time in studies; a calendar alone is a guess.</p>'
      +'<div class="kcx-two"><div><b class="g">Helps</b><ul><li>Folic acid 400 mcg a day if you could become pregnant</li><li>A weight in the healthy range</li><li>Regular sleep</li><li>Moderate exercise, eaten for</li></ul></div>'
      +'<div><b class="b">Hurts</b><ul><li>Smoking</li><li>Heavy drinking</li><li>Very low body fat, or hard training on too little food</li><li>Obesity and PCOS</li><li>Long-term high stress</li><li>Age: fertility falls through the 30s</li></ul></div></div>'
      +(tie.length?'<div class="kcx-tie"><b>From your data</b>'+tie.map(function(x){ return '<p>'+esc(x)+'</p>'; }).join('')+'</div>':'')
      +'<p class="kcx-fine">Symptoms like cramps or bloating cannot be measured by a phone; Kova only finds your own patterns in what you log. See a doctor for irregular cycles, bleeding longer than 7 days, bleeding between periods or severe pelvic pain.</p></div>';
  }

  /* ---------------- where it lives: a section of Vitals ---------------- */
  function host(){
    var scr=document.getElementById('s-vitals'); if(!scr) return null;
    var el=document.getElementById('kcSec'); if(el) return el;
    if(sex()==='male'&&!D.on) return null;
    var wrap=document.createElement('div'); wrap.className='vsec kcx-vsec';
    var open=D.on||sex()==='female';
    wrap.innerHTML='<div class="vsec-h'+(open?' open':'')+'" data-s="cycle" role="button" tabindex="0" aria-expanded="'+open+'">'
      +'<div class="vsec-i"><svg class="ic" style="font-size:15px"><use href="#i-heartbeat"/></svg></div><div class="vsec-n">Cycle & fertility</div><div class="vsec-c" id="kcSecN"></div>'
      +'<span class="vsec-v"><svg class="ic" style="font-size:15px"><use href="#i-chevron-down"/></svg></span></div>'
      +'<div class="vsec-b'+(open?' open':'')+'" data-b="cycle"><div class="kcx" id="kcSec"></div></div>';
    /* after the Today section, before How you're feeling */
    var secs=scr.querySelectorAll('.vsec'), after=secs[0]||scr.querySelector('.card.card-lg');
    if(after&&after.parentNode) after.parentNode.insertBefore(wrap,after.nextSibling); else scr.appendChild(wrap);
    var hd=wrap.querySelector('.vsec-h'), bd=wrap.querySelector('.vsec-b');
    var tog=function(){ var o=!hd.classList.contains('open'); hd.classList.toggle('open',o); bd.classList.toggle('open',o); hd.setAttribute('aria-expanded',String(o)); };
    hd.addEventListener('click',tog); hd.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); e.stopPropagation(); tog(); } });
    el=wrap.querySelector('#kcSec'); el.addEventListener('click',onClick); el.addEventListener('change',onChange);
    return el;
  }
  /* the section's insides are drawn the first time Vitals opens, not at
     start-up: nothing on the first screen needs them */
  var drawn=false;
  function vitalsOn(){ var v=document.getElementById('s-vitals'); return !!(v&&v.classList.contains('on')); }
  function paint(force){
    var el=host(); if(!el) return;
    if(!drawn&&!force&&!vitalsOn()){ var n0=document.getElementById('kcSecN'); if(n0){ var t0=D.on?today():null; n0.textContent=t0?'Day '+t0.day:(D.on?'Start':'Off'); } return; }
    drawn=true;
    el.innerHTML=section();
    var n=document.getElementById('kcSecN'); if(n){ var t=D.on?today():null; n.textContent=t?'Day '+t.day:(D.on?'Start':'Off'); }
  }
  function focus(){
    var tries=0;
    (function f(){
      var el=host();
      if(!el){ if(++tries<20) return setTimeout(f,150); return; }
      paint(true);
      var w=el.closest('.vsec'), hd=w&&w.querySelector('.vsec-h'), bd=w&&w.querySelector('.vsec-b');
      if(hd&&!hd.classList.contains('open')){ hd.classList.add('open'); bd.classList.add('open'); }
      if(w&&w.scrollIntoView) w.scrollIntoView({block:'start',behavior:'smooth'});
    })();
  }
  function onClick(e){
    var b=e.target.closest('[data-k]'); if(!b) return;
    var k=b.getAttribute('data-k'), tk=key(Date.now());
    if(k==='fold'){ var f=b.getAttribute('data-f'); UI.open[f]=!UI.open[f]; paint(); return; }
    if(k==='grp'){ var g=b.getAttribute('data-g'); UI.grp=UI.grp===g?null:g; paint(); if(UI.grp){ var dt=$('.kcx-det'); if(dt&&dt.scrollIntoView) dt.scrollIntoView({block:'nearest',behavior:'smooth'}); } return; }
    if(k==='log'){ openLog(tk); return; }
    if(k==='logsigns'){ L.tab=L.tab||'pain'; openLog(tk); setTimeout(function(){ var el=document.querySelector('#kcl .kcl-sec:nth-of-type(3)'); if(el&&el.scrollIntoView) el.scrollIntoView({block:'start'}); },60); return; }
    if(k==='dial'){ UI.dial=b.getAttribute('data-v'); paint(); return; }
    if(k==='report'){ report(); return; }
    if(k==='start'||k==='startnow'){
      var v=k==='startnow'?tk:(($('#kcxStart')||{}).value||'');
      if(!v){ say('Pick the first day of your last period.'); return; }
      D.on=true; D.dismissed=false; D.flow[v]=D.flow[v]&&D.flow[v]!=='none'&&D.flow[v]!=='spot'?D.flow[v]:'med'; D.days[v]=true; save(D); paintAll(); say('Cycle tracking is on.'); return;
    }
    if(k==='period'){ if(/light|med|heavy/.test(D.flow[tk]||'')){ delete D.flow[tk]; delete D.days[tk]; } else { D.flow[tk]='med'; D.days[tk]=true; } save(D); paintAll(); return; }
    if(k==='st'){ var fld=b.getAttribute('data-f'), val=b.getAttribute('data-v')==='true'; D.status[fld]=val; if(fld==='preg'&&val&&!D.status.pregAt) D.status.pregAt=sod(); if(fld==='preg'&&!val) delete D.status.pregAt; save(D); paint(); return; }
    if(k==='contra'){ D.status.contra=b.getAttribute('data-v'); save(D); paint(); return; }
    if(k==='off'){
      if(!b.dataset.sure){ b.dataset.sure='1'; b.textContent='Tap again to delete every cycle entry'; return; }
      D=blank(); D.dismissed=true; save(D); try{ localStorage.removeItem(KEY); if(window.KP) KP.set('cycle',null); }catch(x){} say('Cycle data deleted.'); paintAll(); return;
    }
  }
  function onChange(e){
    var b=e.target; if(b.getAttribute('data-k')==='sync'){ D.sync=b.checked; save(D); say(D.sync?'Cycle data syncs to your account.':'Cycle data stays on this device.'); }
  }

  /* ---------------- Log today: one sheet, a tap per item ---------------- */
  var L={k:null,tab:'pain'};
  function openLog(k){
    if(!window.openSheet) return;
    L.k=k||key(Date.now());
    openSheet('<div class="grab"></div><div class="kcl" id="kcl"></div>');
    var el=$('#kcl'); el.addEventListener('click',onLog); el.addEventListener('change',onLogChange);
    paintLog();
  }
  function chips(field,opts,cur){ return '<div class="kcl-chips">'+opts.map(function(o){ return '<button data-l="'+field+'" data-v="'+o[0]+'" class="'+((cur||'')===o[0]?'on':'')+'" aria-pressed="'+((cur||'')===o[0])+'">'+o[1]+'</button>'; }).join('')+'</div>'; }
  function paintLog(){
    var el=$('#kcl'); if(!el) return;
    var k=L.k, tk=key(Date.now()), yk=key(Date.now()-DAY), sv=D.sev[k]||{};
    var unitF=(lsJ('kova.units','')==='imperial')||/lb/.test(JSON.stringify((window.KP&&KP.get('maint'))||{}).slice(0,60));
    var bbt=D.bbt[k]!=null?(unitF?(D.bbt[k]*9/5+32).toFixed(2):(+D.bbt[k]).toFixed(2)):'';
    var g=GROUPS.filter(function(x){ return x.id===L.tab; })[0];
    el.innerHTML='<div class="kcl-h"><b>Log</b><div class="kcl-day">'
        +[[tk,'Today'],[yk,'Yesterday']].map(function(d){ return '<button data-l="day" data-v="'+d[0]+'" class="'+(k===d[0]?'on':'')+'">'+d[1]+'</button>'; }).join('')
        +'<input type="date" data-l="date" value="'+k+'" max="'+tk+'" aria-label="Another day"></div>'
        +'<button class="kcl-x" data-l="close" aria-label="Done">Done</button></div>'
      +'<div class="kcl-sec"><div class="kcl-t">Period</div>'+chips('flow',FLOW,D.flow[k]||'none')+'</div>'
      +'<div class="kcl-sec"><div class="kcl-t">Symptoms</div><div class="kcl-tabs" role="tablist">'+GROUPS.map(function(x){ var n=x.items.filter(function(i){ return sv[i[0]]>0; }).length; return '<button role="tab" data-l="tab" data-v="'+x.id+'" class="'+(x.id===L.tab?'on':'')+'" aria-selected="'+(x.id===L.tab)+'" style="--g:'+x.c+'">'+esc(x.n)+(n?' <em>'+n+'</em>':'')+'</button>'; }).join('')+'</div>'
        +g.items.map(function(i){ var v=sv[i[0]]|0; return '<div class="kcl-row"><span>'+esc(i[1])+'</span><div class="kcl-sev" role="group" aria-label="'+esc(i[1])+'">'+SEV.map(function(n,j){ return '<button data-l="sev" data-s="'+i[0]+'" data-v="'+j+'" class="'+(v===j?'on':'')+' v'+j+'" aria-pressed="'+(v===j)+'">'+(j?n:'–')+'</button>'; }).join('')+'</div></div>'; }).join('')+'</div>'
      +'<div class="kcl-sec"><div class="kcl-t">Fertility signs</div>'
        +'<div class="kcl-sub">Cervical mucus</div>'+chips('mucus',[['','Not checked']].concat(MUCUS),D.mucus[k]||'')
        +'<div class="kcl-sub">Ovulation (LH) test</div>'+chips('lh',TEST,D.lh[k]||'')
        +'<div class="kcl-sub">Basal body temperature, on waking</div><div class="kcl-temp"><input type="number" inputmode="decimal" step="0.01" data-l="bbt" value="'+bbt+'" placeholder="'+(unitF?'97.70':'36.50')+'" aria-label="Basal body temperature"><span>°'+(unitF?'F':'C')+'</span></div>'
        +'<div class="kcl-sub">Sexual activity</div>'+chips('sexact',SEXA,D.sexact[k]||'')+'</div>'
      +'<div class="kcl-sec"><div class="kcl-t">Tests</div><div class="kcl-sub">Pregnancy test</div>'+chips('preg',TEST,D.preg[k]||'')
        +'<div class="kcl-sub">Progesterone (PdG) test</div>'+chips('prog',TEST,D.prog[k]||'')+'</div>'
      +'<p class="kcl-fine">Saved as you tap. Only on this device unless sync is on.</p>';
  }
  function setVal(field,k,v){ if(v===''||v==null||(field==='flow'&&v==='none')) delete D[field][k]; else D[field][k]=v; }
  function onLog(e){
    var b=e.target.closest('[data-l]'); if(!b||b.tagName==='INPUT') return;
    var l=b.getAttribute('data-l'), v=b.getAttribute('data-v'), k=L.k;
    if(l==='close'){ if(window.closeSheet) closeSheet(); return; }
    if(l==='day'){ L.k=v; paintLog(); return; }
    if(l==='tab'){ L.tab=v; paintLog(); return; }
    if(l==='sev'){ var id=b.getAttribute('data-s'); D.sev[k]=D.sev[k]||{}; if(+v) D.sev[k][id]=+v; else delete D.sev[k][id]; if(!Object.keys(D.sev[k]).length) delete D.sev[k]; }
    else if(l==='flow'){ setVal('flow',k,v); if(/light|med|heavy/.test(v)) D.days[k]=true; else delete D.days[k]; if(!D.on&&/light|med|heavy/.test(v)) D.on=true; }
    else if(l==='preg'){ setVal('preg',k,v); if(v==='pos'&&!D.status.preg){ D.status.preg=true; D.status.pregAt=sod(parse(k)); say('Pregnancy logged. Predictions are paused; turn it off in Status.'); } }
    else setVal(l,k,v);
    save(D); paintLog(); paintAll();
  }
  function onLogChange(e){
    var b=e.target, l=b.getAttribute('data-l');
    if(l==='date'&&b.value){ L.k=b.value; paintLog(); return; }
    if(l==='bbt'){ var x=parseFloat(b.value); var unitF=x>50; if(!isFinite(x)){ delete D.bbt[L.k]; } else { var c=unitF?(x-32)*5/9:x; if(c<34||c>39){ say('That temperature looks off. Basal temperature is usually 35.5 to 37.5 °C (96 to 99.5 °F).'); return; } D.bbt[L.k]=Math.round(c*100)/100; } save(D); paintAll(); }
  }

  /* ---------------- the report for a doctor ---------------- */
  function reportHTML(){
    var C=cycles(), s=stats(), fl=flags(), pt=patterns(), now=new Date();
    var freq=Object.keys(SYMN).map(function(id){ var n=0; Object.keys(D.sev).forEach(function(k){ if(sevOn(k,id)) n++; }); return {id:id,n:n}; }).filter(function(x){ return x.n; }).sort(function(a,b){ return b.n-a.n; }).slice(0,12);
    var tests=[['lh','LH'],['preg','Pregnancy'],['prog','Progesterone (PdG)']].map(function(r){ return Object.keys(D[r[0]]).sort().slice(-6).map(function(k){ return '<tr><td>'+md(parse(k))+'</td><td>'+r[1]+'</td><td>'+(D[r[0]][k]==='pos'?'Positive':'Negative')+'</td></tr>'; }).join(''); }).join('');
    var st=D.status||{};
    return '<h1>Cycle summary</h1><p class="m">Made with Kova on '+now.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})+'. From the person’s own log; not a diagnosis.</p>'
      +'<h2>At a glance</h2><table><tr><td>Average cycle</td><td>'+(s.cycles?s.avg+' days (range '+s.range[0]+'–'+s.range[1]+', '+s.cycles+' cycles)':'Not enough cycles yet')+'</td></tr>'
      +'<tr><td>Average period</td><td>'+s.plen+' days</td></tr><tr><td>Birth control</td><td>'+esc((CONTRA.filter(function(c){ return c[0]===st.contra; })[0]||CONTRA[0])[1])+'</td></tr>'
      +'<tr><td>Pregnant / breastfeeding</td><td>'+(st.preg?'Pregnant':'No')+' / '+(st.lact?'Yes':'No')+'</td></tr></table>'
      +'<h2>Cycles</h2><table><tr><th>Started</th><th>Cycle length</th><th>Period length</th></tr>'+C.slice(-8).reverse().map(function(c){ return '<tr><td>'+md(c.a)+'</td><td>'+(c.len?c.len+' days':'ongoing')+'</td><td>'+c.plen+' days</td></tr>'; }).join('')+'</table>'
      +'<h2>Worth discussing</h2>'+(fl.length?'<ul>'+fl.map(function(f){ return '<li><b>'+esc(f.t)+'.</b> '+esc(f.d)+'</li>'; }).join('')+'</ul>':'<p>Nothing outside the usual ranges in what was logged.</p>')
      +'<h2>Symptoms (days logged)</h2>'+(freq.length?'<table>'+freq.map(function(x){ return '<tr><td>'+esc(SYMN[x.id])+'</td><td>'+x.n+'</td></tr>'; }).join('')+'</table>':'<p>None logged.</p>')
      +(pt.length?'<h2>Patterns</h2><ul>'+pt.slice(0,8).map(function(p){ return '<li>'+esc(p.t)+'</li>'; }).join('')+'</ul>':'')
      +(tests?'<h2>Tests</h2><table><tr><th>Date</th><th>Test</th><th>Result</th></tr>'+tests+'</table>':'')
      +'<p class="m">Ranges used: cycles 21–35 days, periods up to 7 days, variation up to 9 days (ACOG, FIGO). Ovulation from a sustained temperature rise or a positive LH test where logged; otherwise estimated.</p>';
  }
  function report(){
    if(!window.openSheet) return;
    openSheet('<div class="grab"></div><div class="kcr"><div class="kcr-doc">'+reportHTML()+'</div>'
      +'<div class="kcx-acts"><button class="kcx-btn" data-r="print">Print or save as PDF</button><button class="kcx-btn ghost" data-r="close">Close</button></div></div>');
    var el=$('#sheetIn .kcr');
    if(el) el.addEventListener('click',function(e){ var b=e.target.closest('[data-r]'); if(!b) return;
      if(b.getAttribute('data-r')==='close'){ if(window.closeSheet) closeSheet(); return; }
      var pr=document.getElementById('kcPrint'); if(!pr){ pr=document.createElement('div'); pr.id='kcPrint'; document.body.appendChild(pr); }
      pr.innerHTML=reportHTML(); document.body.classList.add('kc-printing');
      setTimeout(function(){ try{ window.print(); }catch(x){} setTimeout(function(){ document.body.classList.remove('kc-printing'); },500); },60);
      try{ if(window.KovaAnalytics) KovaAnalytics.track('cycle_report',{}); }catch(x){} });
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
  /* a slim line on Home when tracking is on */
  function paintHome(){
    var scr=document.getElementById('s-home'); if(!scr) return;
    var el=scr.querySelector('.kc-mini');
    var old=document.querySelector('#s-vitals .kc-mini'); if(old) old.remove();
    if(!D.on){ if(el) el.remove(); return; }
    if(!el){ el=document.createElement('button'); el.className='kc-mini'; el.setAttribute('data-go','cycle');
      var anchor=scr.querySelector('#kgStrip')||scr.querySelector('.card.kova');
      if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(el,anchor.nextSibling); else scr.appendChild(el); }
    var t=today(), P=t?PHASE[t.phase]:null;
    el.style.setProperty('--kc',P?P.c:ROSE);
    el.innerHTML=t?'<i></i><b>Cycle · day '+t.day+'</b><span>'+esc(t.paused?'Pregnant':P.n)+(t.phase!=='late'&&!t.paused?' · period in '+Math.max(0,Math.round((t.next-sod())/DAY))+' d':'')+'</span><em>›</em>':'<i></i><b>Cycle</b><span>Log your last period to start</span><em>›</em>';
  }
  function paintAll(){ paint(); paintHome(); }
  function start(){
    takeTemp();
    var tries=0;
    (function wait(){ var sc=document.getElementById('s-vitals'); if(sc&&!sc.__sec&&++tries<30) return setTimeout(wait,100); paintAll();
      if(sc&&window.MutationObserver) new MutationObserver(function(){ if(!drawn&&vitalsOn()) paint(); }).observe(sc,{attributes:true,attributeFilter:['class']}); })();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,300); }); else setTimeout(start,300);
  return {_fromCloud:fromCloud,paint:paint,focus:focus,today:today,regularity:regularity,phase:phaseNow,stats:stats,cycles:cycles,patterns:patterns,flags:flags,PHASE:PHASE,GROUPS:GROUPS,openLog:openLog,report:report,reportHTML:reportHTML,
    setSex:setSex,sex:sex,_data:function(){ return D; },_set:function(d){ D=Object.assign(blank(),d); if(d.days&&!d.flow) Object.keys(d.days).forEach(function(k){ if(d.days[k]) D.flow[k]='med'; }); save(D); paintAll(); }};
})();
