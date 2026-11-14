/* =====================================================================
   KovaWorkPhone - Work OS on a phone (p52).

   The owner: "a more concise, simpler version of the Work OS only on
   mobile. For computer it can be where it is right now. Just like how
   Claude has: you can use code on desktop, but not on your phone...
   but let it work on the integration apps."

   On a phone (a screen up to 700 px wide) the Work OS home is one short
   screen made from your own data:
     Today     what is due (late first), tick one off, add one
     Meetings  the next two
     AI team   ask them here, their latest report, what waits for your OK
     Apps      what is connected (Gmail, TikTok...), Connect apps, Inbox
     On a computer   Studio, Automations, Workspace, Files
   The computer keeps the full Work OS home, untouched.

   The four computer tools open a short page on a phone ("Studio is on a
   computer") with "Open here anyway", so nothing is locked away. Tours
   pass straight through.
   ===================================================================== */
window.KovaWorkPhone=(function(){
  'use strict';
  var DESK={workstudio:'Studio',workcompose:'Studio',workauto:'Automations',workspace:'Workspace',workfiles:'Files',workfolder:'Files'};
  var ROW=[['workstudio','Studio'],['workauto','Automations'],['workspace','Workspace'],['workfiles','Files']];
  var MQ=window.matchMedia?window.matchMedia('(max-width:700px)'):null;
  var S={tries:0,deskSteps:null,sent:0};

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function W(){ return window.WorkOS; }
  function K(){ return window.KovaCrew; }
  function phone(){ return !!(MQ&&MQ.matches); }
  function on(){ var s=document.getElementById('s-work'); return !!(s&&s.classList.contains('on')); }
  function any(){ try{ return sessionStorage.getItem('kova.wkp.any')==='1'; }catch(e){ return !!S.any; } }
  function setAny(){ S.any=true; try{ sessionStorage.setItem('kova.wkp.any','1'); }catch(e){} }
  function say(t){ if(window.toast) try{ toast(t); }catch(e){} }
  function ic(n,sz){ return '<svg class="ic" style="font-size:'+(sz||14)+'px" aria-hidden="true"><use href="#i-'+n+'"/></svg>'; }

  /* ---------------- your own data ---------------- */
  function hm(t){ var m=/^(\d{1,2}):(\d{2})$/.exec(String(t||'')); return m?(+m[1])*60+(+m[2]):-1; }
  function clock(mins){ var d=new Date(); d.setHours(0,mins,0,0); return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }
  var PRI={Critical:0,High:1,Medium:2,Low:3};
  function tasks(){
    var w=W(); if(!w) return {late:[],due:[],all:[]};
    var late=w.overdue().sort(function(a,b){ return a.due-b.due; });
    var due=w.dueToday().sort(function(a,b){
      var x=hm(a.time), y=hm(b.time);
      if((x<0)!==(y<0)) return x<0?1:-1;
      if(x!==y) return x-y;
      return (PRI[a.priority]==null?2:PRI[a.priority])-(PRI[b.priority]==null?2:PRI[b.priority]);
    });
    return {late:late,due:due,all:late.concat(due)};
  }
  function meetings(){
    var w=W(); if(!w) return [];
    var now=Date.now();
    return (w.list('meetings')||[]).filter(function(m){ return (m.at||0)>=now-30*60000; }).sort(function(a,b){ return a.at-b.at; });
  }
  function when(at){
    var w=W(), d=new Date(at), s0=w.startOfDay(), day=Math.floor((w.startOfDay(at)-s0)/864e5);
    var t=d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
    return (day<=0?'Today':day===1?'Tomorrow':d.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'}))+' · '+t;
  }
  function ago(t){ if(!t) return ''; var s=(Date.now()-t)/1000; if(s<90) return 'just now'; if(s<3600) return Math.round(s/60)+' min ago'; if(s<86400) return Math.round(s/3600)+' h ago'; return Math.round(s/86400)+' d ago'; }
  function team(){
    var k=K(); if(!k||!k.jobsOf) return null;
    var jobs=[]; try{ jobs=k.jobsOf(); }catch(e){}
    var done=jobs.filter(function(j){ return j.state==='done'; });
    var last=done[done.length-1]||null, wait=0, busy=0;
    try{ wait=k.waiting().length; }catch(e){}
    jobs.forEach(function(j){ if(j.state==='running'||j.state==='thinking'||j.state==='working') busy++; });
    var n=0; try{ n=k.emps().length; }catch(e){}
    return {last:last,wait:wait,busy:busy,n:n};
  }
  function apps(){
    var w=W(); if(!w||!w.platforms) return {list:[],on:0};
    var list=w.platforms.map(function(p){ var st={}; try{ st=w.integration(p.id)||{}; }catch(e){} return {id:p.id,n:p.n,on:st.state==='connected'}; });
    return {list:list,on:list.filter(function(p){ return p.on; }).length};
  }
  function inbox(){
    /* the number the full Work OS home works out for "Traffic" (it still runs, out of sight) */
    var m=/^(\d+) new/.exec(((document.getElementById('wkInboundLine')||{}).textContent||'').trim());
    return m?+m[1]:0;
  }

  /* ---------------- the phone home ---------------- */
  function head(k,act,label){ return '<div class="wkp-head"><div class="wgl-k">'+k+'</div>'+(act?'<button type="button" class="wkp-arw" data-wkp="'+act+'" aria-label="'+esc(label)+'">'+ic('arrow-up-right',14)+'</button>':'')+'</div>'; }
  function html(){
    var t=tasks(), m=meetings(), tm=team(), ap=apps(), h='';

    /* Today */
    var n=t.all.length;
    h+='<div class="wgl wkp-card wkp-today" id="wkpToday">'+head('Today','board','Open the board')
      +'<div class="wkp-big"><span class="wgl-n">'+n+'</span><span class="wkp-of">'+(n===1?'task to do':'tasks to do')+'</span>'
      +(t.late.length?'<span class="wkp-tag late">'+t.late.length+' late</span>':'')+'</div>';
    if(n){
      h+='<div class="wkp-list">'+t.all.slice(0,5).map(function(i){
        var late=t.late.indexOf(i)>=0, tag=late?'Late':(hm(i.time)>=0?clock(hm(i.time)):'');
        return '<div class="wkp-row" data-id="'+esc(i.id)+'"><button type="button" class="wkp-tick" data-wkp="done" aria-label="Mark done: '+esc(i.name)+'"></button>'
          +'<button type="button" class="wkp-name" data-wkp="item">'+esc(i.name||'Untitled task')+'</button>'
          +(tag?'<span class="wkp-tag'+(late?' late':'')+'">'+esc(tag)+'</span>':'')+'</div>';
      }).join('')+'</div>'+(n>5?'<div class="wgl-sub">And '+(n-5)+' more in All tasks.</div>':'');
    } else h+='<div class="wgl-sub">Nothing due today.</div>';
    h+='<form class="wkp-add" id="wkpAdd"><input id="wkpNew" class="wkp-in" type="text" placeholder="Add a task for today" aria-label="Add a task for today" enterkeyhint="done" autocomplete="off" maxlength="140"/>'
      +'<button type="submit" class="wkp-send" aria-label="Add task">'+ic('plus',16)+'</button></form>'
      +'<div class="wkp-acts"><button type="button" class="wpill" data-wkp="tasks">All tasks</button><button type="button" class="wpill" data-wkp="plan">Plan my day</button></div></div>';

    /* Meetings */
    h+='<div class="wgl wkp-card" id="wkpMeet">'+head('Meetings','meetings','All meetings');
    if(m.length){
      h+='<div class="wkp-list">'+m.slice(0,2).map(function(x){
        return '<button type="button" class="wkp-line" data-wkp="meeting" data-id="'+esc(x.id)+'"><span class="wkp-lt">'+esc(x.title||'Meeting')+'</span><span class="wkp-ls">'+esc(when(x.at))+'</span></button>';
      }).join('')+'</div>'+(m.length>2?'<div class="wgl-sub">And '+(m.length-2)+' more.</div>':'');
    } else h+='<div class="wgl-sub">No meetings coming up.</div>';
    h+='</div>';

    /* AI team */
    h+='<div class="wgl wkp-card" id="wkpTeam">'+head('AI team','team','Open your AI team');
    h+='<form class="wkp-add" id="wkpAsk"><input id="wkpMsg" class="wkp-in" type="text" placeholder="Ask your team" aria-label="Ask your team" enterkeyhint="send" autocomplete="off" maxlength="600"/>'
      +'<button type="submit" class="wkp-send" aria-label="Send to your team">'+ic('arrow-up',16)+'</button></form>';
    if(tm&&tm.last){
      var j=tm.last, e=null; try{ e=K().emp(j.emp); }catch(x){}
      var title=(j.report&&j.report.title)||String(j.text||'A finished job').slice(0,70);
      h+='<button type="button" class="wkp-line" data-wkp="job" data-id="'+esc(j.id)+'"><span class="wkp-lt">'+esc(title)+'</span><span class="wkp-ls">'+esc((e&&e.n?e.n+' · ':'')+ago(j.end||j.at))+'</span></button>';
    } else h+='<div class="wgl-sub">'+(tm?'No reports yet. Ask for one.':'Your team is loading…')+'</div>';
    h+='<div class="wkp-acts">'+(tm&&tm.wait?'<button type="button" class="wpill on" data-wkp="approve">'+tm.wait+' need your OK</button>':'')
      +'<button type="button" class="wpill" data-wkp="chat">Chat</button><button type="button" class="wpill" data-wkp="team">Team</button></div></div>';

    /* Apps */
    /* connected ones first, then the ones people ask for most */
    var PREF=['email','tiktok','instagram','youtube','facebook','calendar'], rank=function(p){ var i=PREF.indexOf(p.id); return (p.on?0:100)+(i<0?50:i); };
    var show=ap.list.slice().sort(function(x,y){ return rank(x)-rank(y); }).slice(0,6), ib=inbox();
    h+='<div class="wgl wkp-card" id="wkpApps">'+head('Apps','apps','Connect apps')
      +'<div class="wkp-big sm"><span class="wgl-n">'+ap.on+'</span><span class="wkp-of">of '+ap.list.length+' connected</span></div>'
      +'<div class="wkp-chips">'+show.map(function(p){ return '<button type="button" class="wpill'+(p.on?' on':'')+'" data-wkp="apps" aria-label="'+esc(p.n+(p.on?', connected':', not connected'))+'"><i style="background:'+(p.on?'#3CCB7F':'currentColor')+';opacity:'+(p.on?1:.35)+'"></i>'+esc(p.n)+'</button>'; }).join('')+'</div>'
      +'<div class="wgl-sub">Your team works in the apps you connect.</div>'
      +'<div class="wkp-acts"><button type="button" class="wpill" data-wkp="apps">Connect apps</button><button type="button" class="wpill" data-wkp="inbox">Inbox'+(ib?' · '+ib:'')+'</button></div></div>';

    /* the computer tools */
    h+='<div class="wkp-desk" id="wkpDesk"><div class="wgl-k">On a computer</div><div class="wkp-chips">'
      +ROW.map(function(r){ return '<button type="button" class="wpill" data-wkp="desk" data-id="'+r[0]+'">'+r[1]+'</button>'; }).join('')+'</div></div>';
    return h;
  }
  function host(){
    var s=document.getElementById('s-work'); if(!s) return null;
    var el=document.getElementById('wkPhone');
    if(!el){
      el=document.createElement('div'); el.id='wkPhone';
      var hd=s.querySelector('.hdr');
      if(hd&&hd.nextSibling) s.insertBefore(el,hd.nextSibling); else s.appendChild(el);
      el.addEventListener('click',click);
      el.addEventListener('submit',submit);
    }
    return el;
  }
  function paint(){
    document.body.classList.toggle('wk-phone',phone());
    tourFor(phone());
    if(!phone()||!on()||!W()) return;
    var el=host(); if(!el) return;
    /* typing is never wiped by a repaint */
    var a=document.activeElement, keep=a&&el.contains(a)&&(a.id==='wkpNew'||a.id==='wkpMsg')?{id:a.id,v:a.value}:null;
    var other={n:(document.getElementById('wkpNew')||{}).value||'',m:(document.getElementById('wkpMsg')||{}).value||''};
    el.innerHTML=html();
    if(other.n) document.getElementById('wkpNew').value=other.n;
    if(other.m) document.getElementById('wkpMsg').value=other.m;
    if(keep){ var b=document.getElementById(keep.id); if(b){ try{ b.focus({preventScroll:true}); }catch(e){ b.focus(); } } }
  }
  var soonT=0; function soon(){ clearTimeout(soonT); soonT=setTimeout(paint,60); }
  function refresh(){ try{ if(window.__workDraw&&__workDraw.refresh) __workDraw.refresh(); }catch(e){} try{ if(window.KovaTaskAlert) KovaTaskAlert.changed(); }catch(e){} paint(); }

  /* ---------------- taps ---------------- */
  function nav(id){ if(window.go) window.go(id); }
  function teamPage(navTo){
    nav('workteam');
    setTimeout(function(){ var k=K(); if(!k||!k._S) return; k._S.view='team'; k._S.nav=navTo||'team'; if(navTo!=='team') k._S.tab='all'; try{ k.paint(); }catch(e){} },140);
  }
  function click(e){
    var b=e.target.closest&&e.target.closest('[data-wkp]'); if(!b) return;
    var c=b.getAttribute('data-wkp'), row=b.closest('[data-id]'), id=row?row.getAttribute('data-id'):'';
    if(c==='board') return nav('worktoday');
    if(c==='tasks') return nav('worktasks');
    if(c==='plan'){ if(window.__workDraw&&__workDraw.plan) return __workDraw.plan(); return nav('worktoday'); }
    if(c==='item'){ if(window.__workDraw&&__workDraw.open) return __workDraw.open(id); return nav('worktasks'); }
    if(c==='done'){
      var w=W(), it=w&&w.find('items',id); if(!it) return;
      row.classList.add('done');
      setTimeout(function(){ try{ w.update('items',id,{status:'Completed'},'user'); }catch(x){} say('Done.'); refresh(); },260);
      return;
    }
    if(c==='meetings') return nav('workmeetings');
    if(c==='meeting'){ if(window.__workMeet&&__workMeet.open) return __workMeet.open(id); return nav('workmeetings'); }
    if(c==='team') return teamPage('team');
    if(c==='chat') return teamPage('chat');
    if(c==='approve') return teamPage('approvals');
    if(c==='job'){ if(window.KovaTeamPlus&&KovaTeamPlus.openJob) return KovaTeamPlus.openJob(id); return teamPage('jobs'); }
    if(c==='apps') return nav('workintegrations');
    if(c==='inbox') return nav('workinbound');
    if(c==='desk') return nav(id);
  }
  function addTask(name){
    name=String(name||'').trim(); if(!name) return false;
    var r=null;
    try{
      if(window.WorkAI&&WorkAI.execute) r=WorkAI.execute([{tool:'create_task',args:{name:name,priority:'Medium',due:'today'}}]);
      else r=[{ok:!!W().create('items',{name:name,status:'Not Started',priority:'Medium',due:W().startOfDay(),notes:'',checklist:[]},'user')}];
    }catch(e){ r=null; }
    var ok=!!(r&&r[0]&&r[0].ok!==false&&!r[0].error);
    say(ok?'Task added.':'Could not add that task.');
    return ok;
  }
  function ask(text){
    text=String(text||'').trim(); if(!text) return false;
    var T=window.KovaTeamPlus;
    if(!T||!T.send||!K()){ say('Your team is still loading. Try again in a moment.'); return false; }
    var m=null; try{ m=T.send(text); }catch(e){}
    if(m===null) return false;          /* the team is mid-answer: it says so itself */
    S.sent++; teamPage('chat');
    return true;
  }
  function submit(e){
    var f=e.target; if(!f||!f.id) return;
    e.preventDefault();
    if(f.id==='wkpAdd'){ var i=document.getElementById('wkpNew'); if(addTask(i.value)){ i.value=''; refresh(); } else if(!i.value.trim()) i.focus(); }
    if(f.id==='wkpAsk'){ var q=document.getElementById('wkpMsg'); if(!q.value.trim()){ q.focus(); return; } if(ask(q.value)){ q.value=''; } }
  }

  /* ---------------- the computer tools, on a phone ---------------- */
  function gate(id){
    var n=DESK[id]||'This';
    var h='<div class="wkp-gate" data-screen="'+esc(id)+'"><div class="wgl-k">Work OS</div>'
      +'<div class="wkp-gt">'+esc(n)+' '+(n==='Files'||n==='Automations'?'are':'is')+' on a computer</div>'
      +'<div class="wkp-gs">Open Kova on a laptop or desktop to use '+(n==='Files'||n==='Automations'?'them':'it')+'.</div>'
      +'<button type="button" class="btn wkp-ghost" id="wkpAny">Open here anyway</button></div>';
    if(!window.openSheet){ return false; }
    openSheet(h);
    var b=document.getElementById('wkpAny');
    if(b) b.onclick=function(){ setAny(); try{ closeSheet(); }catch(e){} nav(id); };
    return true;
  }
  function touring(){ try{ return !!(window.KovaTour&&KovaTour.active&&KovaTour.active()); }catch(e){ return false; } }
  function wrapGo(){
    if(S.wrapped||typeof window.go!=='function') return;
    var _go=window.go; S.wrapped=true;
    window.go=function(id){
      if(DESK[id]&&phone()&&!any()&&!touring()&&gate(id)) return;
      return _go.apply(this,arguments);
    };
  }

  /* ---------------- the tour, on a phone ---------------- */
  function cur(){ var s=document.querySelector('.screen.on'); return s?s.id.replace(/^s-/,''):''; }
  function atWork(){ if(cur()!=='work'){ nav('work'); return 1; } return 0; }
  function q(sel){ return function(){ return document.querySelector(sel); }; }
  var STEPS=[
    {t:'Today',          d:'What is due. Tick one off, or add one.',            el:q('#wkpToday'), move:atWork},
    {t:'Meetings',       d:'Your next meetings. Tap one to open it.',           el:q('#wkpMeet'),  move:atWork},
    {t:'AI team',        d:'Ask your team here. Their latest report is below.', el:q('#wkpTeam'),  move:atWork},
    {t:'Apps',           d:'Connect Gmail, TikTok and more for your team.',     el:q('#wkpApps'),  move:atWork},
    {t:'On a computer',  d:'Studio, Automations and Files open on a computer.', el:q('#wkpDesk'),  move:atWork}
  ];
  function tourFor(isPhone){
    var T=window.KovaWorkTour; if(!T||!T.steps) return;
    if(!S.deskSteps) S.deskSteps=T.steps.slice();
    var want=isPhone?STEPS:S.deskSteps;
    if(T.steps[0]===want[0]&&T.steps.length===want.length) return;
    T.steps.length=0; want.forEach(function(x){ T.steps.push(x); });
  }

  function mount(){
    wrapGo();
    document.addEventListener('kova:screen',function(e){ if(e&&e.detail==='work') paint(); });
    window.addEventListener('kova:cloud',soon);
    window.addEventListener('focus',soon);
    document.addEventListener('visibilitychange',function(){ if(!document.hidden) soon(); });
    if(MQ){ if(MQ.addEventListener) MQ.addEventListener('change',paint); else if(MQ.addListener) MQ.addListener(paint); }
    paint();
    /* the AI team arrives a moment later: fill its card in then */
    var n=0, t=setInterval(function(){ n++; if(K()||n>40){ clearInterval(t); if(K()) soon(); } },250);
  }
  function boot(){ if(window.WorkOS&&typeof window.go==='function') mount(); else if(++S.tries<80) setTimeout(boot,250); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();

  return {is:phone,paint:paint,tasks:tasks,meetings:meetings,team:team,apps:apps,addTask:addTask,ask:ask,gate:gate,DESK:DESK,STEPS:STEPS,_S:S};
})();
