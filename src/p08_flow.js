/* =====================================================================
   KovaFlow (p21) - Work OS automations that do what the best tools do,
   built on the engine that is already there (WorkAuto).

   From Zapier and Make: a rule is a chain of steps, not one action, and
   you can test it before it is live ("Test it" shows exactly what each
   step would do, without writing anything).
   From Customer.io and Intercom: a step can WAIT ("2 days later, remind
   me"), so follow-ups happen on their own.
   From n8n and Workato: rules are data you can read, and every run is in
   the history with the reason it ran, skipped or failed.
   From Linear and Superhuman: say it in words. "When a call ends, make a
   write-up task, wait 2 days, then remind me" becomes the rule.
   From Fireflies and Otter: the notes from a call become action items
   with an owner and a date, and the decisions are kept apart.
   From Calendly and Granola: before every call, your AI team preps you.

   Everything is stored in the existing WorkOS 'automations' collection,
   in its existing shape (trigger, condition, action), so the engine,
   the run history and "Why it failed" all keep working:
     condition 'all'  ccfg {list:[{c,cfg}...]}   every filter must pass
     action    'flow' acfg {steps:[{a,cfg}...]}   the steps, in order
   ===================================================================== */
window.KovaFlow=(function(){
  'use strict';
  if(!window.WorkOS||!window.WorkAuto) return null;
  var W=WorkOS, U=WorkAuto, MIN=6e4, HOUR=36e5, DAY=864e5;
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function $(id){ return document.getElementById(id); }
  function clone(o){ return JSON.parse(JSON.stringify(o==null?{}:o)); }
  var NOW=null;
  function now(){ return NOW?NOW():Date.now(); }
  function A(){ return window.WorkAI||null; }
  function C(){ return window.KovaCrew||null; }
  function cap(s){ s=String(s||'').trim(); return s.charAt(0).toUpperCase()+s.slice(1); }
  function dayKey(t){ var d=new Date(t); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
  function clock(t){ return new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}); }
  function whenLabel(t){
    if(!t) return '';
    var d=new Date(t), today=new Date(now()).toDateString(), tm=new Date(now()+DAY).toDateString();
    return (d.toDateString()===today?'today ':d.toDateString()===tm?'tomorrow ':d.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})+' ')+clock(t);
  }
  function dueOf(v){ var a=A(); return a&&a.when?a.when(v||'+3d'):W.startOfDay()+3*DAY; }

  /* the words a step can put in its text */
  function fill(t,ev){
    var x=(ev&&ev.after)||{};
    return String(t||'').replace(/\{name\}/g,x.name||x.title||'')
      .replace(/\{who\}/g,x.attendees||'')
      .replace(/\{when\}/g,x.at?whenLabel(x.at):(x.due?whenLabel(x.due):''))
      .replace(/\{notes\}/g,String(x.notes||'').slice(0,600))
      .replace(/\{prep\}/g,String(x.prep||'').slice(0,600)).replace(/\s+/g,' ').trim();
  }
  function isItem(ev){ return !!(ev&&ev.after&&ev.after.id&&W.find('items',ev.after.id)); }

  /* ---------------- more triggers ---------------- */
  var T=U.TRIGGERS;
  T.meeting_soon={n:'A meeting is about to start',
    fields:[{k:'min',n:'minutes before',opts:['10','30','60','120']}],
    match:function(ev,cfg){
      if(ev.type!=='sweep.meeting_soon'||!ev.after) return false;
      var lead=+(cfg.min||30);
      if(ev.mins>lead) return false;
      return once(cfg,ev.after.id+':'+ev.after.at);
    }};
  T.schedule={n:'Every day at a time',
    fields:[{k:'time',n:'at',type:'time',ph:'08:00'},{k:'days',n:'on',opts:['every day','weekdays','mondays','fridays']}],
    match:function(ev,cfg){
      if(ev.type!=='sweep.tick') return false;
      var t=ev.at, d=new Date(t), hm=String(cfg.time||'08:00').split(':');
      var due=new Date(t); due.setHours(+hm[0]||0,+hm[1]||0,0,0);
      var dow=d.getDay(), days=cfg.days||'every day';
      if(days==='weekdays'&&(dow===0||dow===6)) return false;
      if(days==='mondays'&&dow!==1) return false;
      if(days==='fridays'&&dow!==5) return false;
      if(t<due.getTime()) return false;
      /* opened late? It catches up within four hours; after that the day is skipped */
      if(t-due.getTime()>4*HOUR){ cfg.done=cfg.done||{}; if(!cfg.done[dayKey(t)]) cfg.done[dayKey(t)]=t; return false; }
      return once(cfg,dayKey(t));
    }};
  T.item_stale={n:'A task goes quiet',
    fields:[{k:'days',n:'for',opts:['2','3','5','7','14']},{k:'st',n:'while',opts:['Waiting','In Progress','any open']}],
    match:function(ev,cfg){
      if(ev.type!=='sweep.stale'||!ev.after) return false;
      var st=cfg.st||'Waiting', i=ev.after;
      if(st==='any open'){ if(i.status==='Completed') return false; }
      else if(i.status!==st) return false;
      if(ev.quiet<(+(cfg.days||3))*DAY) return false;
      return once(cfg,i.id+':'+(i.statusAt||i.created||0));
    }};
  /* "once": a time trigger fires one time for each thing it is about. The
     stamp lives in the rule itself, so it is saved with it. */
  function once(cfg,key){
    cfg.done=cfg.done||{};
    if(cfg.done[key]) return false;
    cfg.done[key]=now();
    var ks=Object.keys(cfg.done);
    if(ks.length>60) ks.sort(function(a,b){ return cfg.done[a]-cfg.done[b]; }).slice(0,ks.length-60).forEach(function(k){ delete cfg.done[k]; });
    return true;
  }

  /* ---------------- filters (Zapier's "Only continue if") ---------------- */
  var F={
    priority_is:{n:'priority is',fields:[{k:'p',opts:['Critical','High','Medium','Low']}],
      test:function(ev,c){ return !!(ev.after&&ev.after.priority===c.p); },say:function(c){ return 'priority is '+c.p; }},
    status_is:{n:'status is',fields:[{k:'s',opts:['Not Started','In Progress','Waiting','Completed']}],
      test:function(ev,c){ return !!(ev.after&&ev.after.status===c.s); },say:function(c){ return 'status is '+c.s; }},
    name_has:{n:'the name contains',fields:[{k:'t',type:'text',ph:'invoice'}],
      test:function(ev,c){ var n=String((ev.after&&(ev.after.name||ev.after.title))||'').toLowerCase(); return !!c.t&&n.indexOf(String(c.t).toLowerCase())>=0; },
      say:function(c){ return 'the name contains \u201c'+c.t+'\u201d'; }},
    due_within:{n:'it is due within',fields:[{k:'d',opts:['1','3','7']}],
      test:function(ev,c){ var d=ev.after&&ev.after.due; return !!d&&d-now()<=(+c.d||1)*DAY; },say:function(c){ return 'it is due within '+c.d+' day'+(+c.d===1?'':'s'); }},
    has_project:{n:'it belongs to a project',fields:[],
      test:function(ev){ return !!(ev.after&&ev.after.projectId); },say:function(){ return 'it belongs to a project'; }},
    goal_behind:{n:'the goal is under half way',fields:[],
      test:function(ev){ return !!(ev.after&&W.goalProgress&&W.goalProgress(ev.after).pct<50); },say:function(){ return 'the goal is under half way'; }},
    with_people:{n:'the call has other people',fields:[],
      test:function(ev){ return !!(ev.after&&String(ev.after.attendees||'').trim()); },say:function(){ return 'the call has other people'; }}
  };
  U.CONDITIONS.all={n:'all of these are true',fields:[],
    test:function(ev,cfg){ return (cfg.list||[]).every(function(x){ var f=F[x.c]; return !f||f.test(ev,x.cfg||{}); }); }};

  /* ---------------- steps ----------------
     run(ev,cfg)  does it, and says what it did
     plan(ev,cfg) says what it WOULD do, writing nothing (for "Test it") */
  var S={
    create_task:{n:'create a task',fields:[{k:'name',n:'called',type:'text',ph:'Follow up on {name}'},{k:'due',n:'due',opts:['today','tomorrow','+3d','+7d']},{k:'p',n:'priority',opts:['Medium','High','Critical','Low']}],
      plan:function(ev,c){ return 'create the task \u201c'+(fill(c.name||'Follow up on {name}',ev)||'Follow up')+'\u201d, due '+(c.due||'+3d'); },
      run:function(ev,c){
        var nm=fill(c.name||'Follow up on {name}',ev)||'Follow up', x=ev.after||{};
        var it=W.create('items',{name:nm,status:'Not Started',priority:c.p||'Medium',due:dueOf(c.due||'+3d'),
          notes:'Made by the rule \u201c'+(ev.__rule||'automation')+'\u201d.',boardId:x.boardId,projectId:x.projectId,
          meetingId:ev.type==='sweep.meeting_ended'||ev.type==='sweep.meeting_soon'?x.id:x.meetingId,checklist:[]},'automation');
        return it&&it.id?{ok:true,detail:'created \u201c'+nm+'\u201d'}:{ok:false,detail:'the store refused the write'};
      }},
    notify:{n:'notify me',fields:[{k:'msg',n:'saying',type:'text',ph:'Check {name}'}],
      plan:function(ev,c){ return 'notify you: \u201c'+fill(c.msg||'Check {name}',ev)+'\u201d'; },
      run:function(ev,c){
        var msg=fill(c.msg||'Check {name}',ev)||'A rule ran';
        var r=U.ACTIONS.notify.run(ev,{msg:msg});
        ping(msg);
        return r;
      }},
    wait:{n:'wait',fields:[{k:'n',n:'',opts:['15','30','1','2','3','7']},{k:'u',n:'',opts:['minutes','hours','days']}],
      plan:function(ev,c){ return 'wait '+waitLabel(c)+', then carry on'; },
      run:function(){ return {ok:true,detail:'waiting'}; }},
    set_priority:{n:'set its priority',fields:[{k:'p',n:'to',opts:['Critical','High','Medium','Low']}],
      plan:function(ev,c){ return isItem(ev)?'set \u201c'+ev.after.name+'\u201d to '+c.p:'set a task\u2019s priority (this trigger has no task, so it would fail)'; },
      run:function(ev,c){ if(!isItem(ev)) return {ok:false,detail:'no task attached to this event'}; W.update('items',ev.after.id,{priority:c.p||'High'},'automation'); return {ok:true,detail:'priority set to '+(c.p||'High')}; }},
    set_status:{n:'move it to',fields:[{k:'s',n:'',opts:['In Progress','Waiting','Completed','Not Started']}],
      plan:function(ev,c){ return isItem(ev)?'move \u201c'+ev.after.name+'\u201d to '+c.s:'move a task (this trigger has no task, so it would fail)'; },
      run:function(ev,c){ if(!isItem(ev)) return {ok:false,detail:'no task attached to this event'}; W.update('items',ev.after.id,{status:c.s||'In Progress'},'automation'); return {ok:true,detail:'moved to '+(c.s||'In Progress')}; }},
    due_today:{n:'put it on today',fields:[],
      plan:function(ev){ return isItem(ev)?'make \u201c'+ev.after.name+'\u201d due today':'put a task on today (this trigger has no task, so it would fail)'; },
      run:function(ev){ if(!isItem(ev)) return {ok:false,detail:'no task attached to this event'}; W.update('items',ev.after.id,{due:W.startOfDay()},'automation'); return {ok:true,detail:'due today'}; }},
    ask_team:{n:'ask your AI team',fields:[{k:'who',n:'who',type:'text',ph:'anyone'},{k:'text',n:'to',type:'text',ph:'Prep me for {name} with {who}'}],
      plan:function(ev,c){ var e=teammate(c,ev); return 'ask '+(e?e.n:'your team')+': \u201c'+fill(c.text||'Look into {name}',ev)+'\u201d'+(serverOk()?' (it runs on the server, so it works with Kova closed)':''); },
      run:function(ev,c){
        var text=fill(c.text||'Look into {name}',ev), e=teammate(c,ev);
        if(!text) return {ok:false,detail:'nothing to ask'};
        if(serverOk()&&window.KovaAsk){
          KovaAsk.send(e,text,{now:true,quiet:true}).catch(function(err){ late(ev,'fail','the team could not take it: '+(err&&err.message||'server error')); });
          return {ok:true,detail:'asked '+(e?e.n:'your team')+': '+text.slice(0,80)};
        }
        var c2=C();
        if(c2&&e&&c2.start){ var j=c2.start(e,text,'automation',{rule:ev.__rule||''}); return j?{ok:true,detail:(e.n)+' started: '+text.slice(0,80)}:{ok:false,detail:e.n+' could not start it'}; }
        return {ok:false,detail:'your AI team is not set up yet'};
      }},
    archive:{n:'mark it complete',fields:[],
      plan:function(ev){ return isItem(ev)?'mark \u201c'+ev.after.name+'\u201d complete':'complete a task (this trigger has no task, so it would fail)'; },
      run:function(ev){ return U.ACTIONS.archive.run(ev,{}); }}
  };
  function waitMs(c){ var n=+(c.n||1); return n*({minutes:MIN,hours:HOUR,days:DAY}[c.u||'days']||DAY); }
  function waitLabel(c){ var n=+(c.n||1), u=c.u||'days'; return n+' '+(n===1?u.replace(/s$/,''):u); }
  function teammate(c,ev){
    var cr=C(); if(!cr) return null;
    var who=String(c.who||'').trim();
    if(who&&!/^(anyone|the team|team|my team|your team)$/i.test(who)){
      var L=cr.emps(), q=who.toLowerCase();
      var e=L.filter(function(x){ return x.n.toLowerCase()===q||x.title.toLowerCase()===q; })[0]
        ||L.filter(function(x){ return x.title.toLowerCase().indexOf(q)>=0; })[0];
      if(e) return e;
    }
    var r=cr.route?cr.route(fill(c.text||'',ev)):null;
    return r?r.emp:null;
  }
  function serverOk(){ try{ return !!(window.KovaLink&&KovaLink.authFetch&&window.KOVA_FB&&KOVA_FB.ok&&KOVA_FB.auth&&KOVA_FB.auth.currentUser); }catch(e){ return false; } }
  /* a real notification when the page has the permission, on top of the inbox */
  function ping(msg){
    try{
      if(document.hidden&&window.Notification&&Notification.permission==='granted') new Notification('Kova',{body:msg,tag:'kova-flow'});
    }catch(e){}
  }

  /* the 'flow' action runs the steps in order. A wait parks the rest. */
  U.ACTIONS.flow={n:'run the steps',fields:[],run:function(ev,cfg){
    var r=cfg.rule&&W.find('automations',cfg.rule);
    ev.__rule=r?r.name:(ev.__rule||'');
    return runSteps(cfg.steps||[],0,ev,cfg.rule);
  }};
  function runSteps(steps,from,ev,ruleId){
    var did=[];
    for(var i=from;i<steps.length;i++){
      var st=steps[i], D=S[st.a];
      if(!D) return {ok:false,detail:(did.length?did.join('; ')+'; then ':'')+'step '+(i+1)+' is an action that no longer exists'};
      if(st.a==='wait'){
        if(i<steps.length-1) park(ruleId,steps,i+1,ev,waitMs(st.cfg||{}));
        did.push('waiting '+waitLabel(st.cfg||{})+' for step '+(i+2));
        return {ok:true,detail:did.join('; ')};
      }
      var out;
      try{ out=D.run(ev,st.cfg||{}); }catch(e){ out={ok:false,detail:String(e.message||e)}; }
      if(!out||!out.ok) return {ok:false,detail:(did.length?did.join('; ')+'; then ':'')+'step '+(i+1)+' failed: '+((out&&out.detail)||'unknown')};
      did.push(out.detail);
    }
    return {ok:true,detail:did.join('; ')||'nothing to do'};
  }

  /* ---------------- waits ----------------
     Parked steps are saved, so they survive closing Kova; they carry on
     the first time Kova is open after their time. */
  var WK='flow_waits';
  function waits(){ var w=window.KP&&KP.get(WK); return Array.isArray(w)?w:[]; }
  function saveWaits(w){ if(window.KP) KP.set(WK,w); }
  function park(ruleId,steps,from,ev,ms){
    var w=waits();
    var a=ev.after||{};
    w.push({id:W.uid('fw'),rule:ruleId||'',at:now()+ms,steps:clone(steps),from:from,type:ev.type,
      coll:a.at&&!a.status?'meetings':'items',ref:a.id||'',snap:{id:a.id,name:a.name,title:a.title,attendees:a.attendees,at:a.at,due:a.due}});
    saveWaits(w);
  }
  function resume(){
    var w=waits(), t=now(), keep=[], ran=0;
    w.forEach(function(x){
      if(x.at>t){ keep.push(x); return; }
      var rule=W.find('automations',x.rule);
      if(x.rule&&(!rule||!rule.enabled)) return;              /* the rule was removed or switched off: drop it */
      var live=x.ref?W.find(x.coll,x.ref):null;
      var ev={type:x.type,after:live||x.snap,changed:{},__rule:rule?rule.name:''};
      var out=runSteps(x.steps,x.from,ev,x.rule);
      ran++;
      if(rule) note(rule,out.ok?'ok':'fail','after the wait: '+out.detail);
    });
    /* runSteps may have parked new waits while we ran */
    var added=waits().filter(function(x){ return w.indexOf(x)<0&&!w.some(function(y){ return y.id===x.id; }); });
    saveWaits(keep.concat(added));
    return ran;
  }
  function note(rule,result,detail){
    rule.runs=rule.runs||[];
    rule.runs.unshift({at:now(),result:result,detail:detail||''});
    if(rule.runs.length>25) rule.runs.length=25;
    rule.lastRun=now(); rule.lastResult=result;
    W.save();
    W.log('automation',rule.name||'rule',result==='ok'?'ran':'failed',result==='ok'?'ok':'fail',detail||'');
  }
  /* something that answers later (the server) can still mark the run */
  function late(ev,result,detail){
    var r=W.list('automations',function(a){ return a.name===ev.__rule; })[0];
    if(r) note(r,result,detail);
  }

  /* when a task's status changes, remember when (for "goes quiet") */
  var up=W.update;
  W.update=function(coll,id,patch,actor){
    if(coll==='items'&&patch&&'status' in patch){
      var b=W.find('items',id);
      if(b&&b.status!==patch.status) patch.statusAt=now();
    }
    return up.call(W,coll,id,patch,actor);
  };

  /* ---------------- the sweep: time-based triggers ---------------- */
  function sweep(){
    var t=now();
    try{ resume(); }catch(e){ console.warn('flow resume',e); }
    var rules=W.list('automations',function(a){ return a.enabled; });
    var want={}; rules.forEach(function(a){ want[a.trigger]=true; });
    if(want.meeting_soon) W.list('meetings').forEach(function(m){
      if(!m.at||m.at<=t||m.at-t>3*HOUR) return;
      U.fire({type:'sweep.meeting_soon',after:m,mins:Math.round((m.at-t)/MIN),changed:{}});
    });
    if(want.item_stale) W.list('items',function(i){ return i.status!=='Completed'; }).forEach(function(i){
      var since=i.statusAt||i.created||t;
      U.fire({type:'sweep.stale',after:i,quiet:t-since,changed:{}});
    });
    if(want.schedule) U.fire({type:'sweep.tick',at:t,after:null,changed:{}});
  }

  /* ---------------- describe ---------------- */
  var baseDescribe=U.describe;
  function trigText(a){
    var tr=T[a.trigger], c=a.tcfg||{};
    if(!tr) return 'when ?';
    if(a.trigger==='meeting_soon') return 'When a meeting is '+(c.min||30)+' minutes away';
    if(a.trigger==='schedule') return (c.days&&c.days!=='every day'?'On '+c.days:'Every day')+' at '+(c.time||'08:00');
    if(a.trigger==='item_stale') return 'When a task sits in '+(c.st||'Waiting')+' for '+(c.days||3)+' days';
    if(a.trigger==='status_changes') return 'When a task moves to '+(c.to==='any'||!c.to?'any status':c.to);
    return 'When '+tr.n.charAt(0).toLowerCase()+tr.n.slice(1);
  }
  function stepText(st){
    var c=st.cfg||{};
    switch(st.a){
      case 'create_task': return 'create \u201c'+(c.name||'Follow up on {name}')+'\u201d due '+(c.due||'+3d');
      case 'notify': return 'notify me \u201c'+(c.msg||'Check {name}')+'\u201d';
      case 'wait': return 'wait '+waitLabel(c);
      case 'set_priority': return 'set priority to '+(c.p||'High');
      case 'set_status': return 'move it to '+(c.s||'In Progress');
      case 'due_today': return 'put it on today';
      case 'ask_team': return 'ask '+(c.who&&!/^(anyone|the team|team)$/i.test(c.who)?c.who:'the team')+' to \u201c'+(c.text||'')+'\u201d';
      case 'archive': return 'mark it complete';
    }
    return st.a;
  }
  U.describe=function(a){
    if(a.action!=='flow'&&a.condition!=='all'&&['meeting_soon','schedule','item_stale'].indexOf(a.trigger)<0) return baseDescribe(a);
    var out=trigText(a);
    var fl=a.condition==='all'?(a.ccfg&&a.ccfg.list||[]):[];
    if(fl.length) out+=', if '+fl.map(function(x){ var f=F[x.c]; return f?f.say(x.cfg||{}):x.c; }).join(' and ');
    var steps=a.action==='flow'?(a.acfg&&a.acfg.steps||[]):[{a:a.action==='create_followup'?'create_task':a.action,cfg:a.acfg}];
    return out+': '+steps.map(stepText).join(', then ');
  };

  /* ---------------- making a rule ---------------- */
  function make(spec){
    var r=W.create('automations',{
      name:String(spec.name||'').trim()||autoName(spec),
      trigger:spec.trigger,tcfg:clone(spec.tcfg),
      condition:(spec.filters&&spec.filters.length)?'all':'none',ccfg:{list:clone(spec.filters||[])},
      action:'flow',acfg:{steps:clone(spec.steps||[])},
      enabled:spec.enabled!==false,runs:[],madeBy:spec.by||'you'
    },spec.by==='ai'?'ai':'user');
    if(r&&r.id){ r.acfg.rule=r.id; W.save(); }
    return r;
  }
  function autoName(spec){
    var a={trigger:spec.trigger,tcfg:spec.tcfg||{},condition:'none',action:'flow',acfg:{steps:spec.steps||[]}};
    var s=U.describe(a);
    return s.length>60?s.slice(0,58)+'\u2026':s;
  }
  function check(spec){
    if(!spec||!T[spec.trigger]) return 'Say when it should run: when a task is done, when a call ends, 30 minutes before a meeting, every day at 8\u2026';
    if(!spec.steps||!spec.steps.length) return 'Say what it should do: remind me, create a task, ask Ravi to\u2026, wait 2 days\u2026';
    for(var i=0;i<spec.steps.length;i++) if(!S[spec.steps[i].a]) return 'Step '+(i+1)+' is not something Kova can do yet.';
    if(spec.steps[spec.steps.length-1].a==='wait') return 'A rule cannot end on a wait. Add what happens after it.';
    return '';
  }

  /* ---------------- "Test it": what would happen, writing nothing ---------------- */
  function sample(trigger){
    var t=now(), items=W.list('items'), meets=W.list('meetings');
    var it=items.slice().sort(function(a,b){ return (b.updated||b.created||0)-(a.updated||a.created||0); })[0];
    var mt=meets.slice().sort(function(a,b){ return Math.abs(a.at-t)-Math.abs(b.at-t); })[0];
    var fakeItem={id:'',name:'Send the proposal',status:'Completed',priority:'High',due:t};
    var fakeMeet={id:'',title:'Call with Sam',attendees:'Sam',at:t+30*MIN};
    switch(trigger){
      case 'meeting_soon': case 'meeting_ended': return {type:trigger==='meeting_soon'?'sweep.meeting_soon':'sweep.meeting_ended',after:mt||fakeMeet,mins:30,changed:{},real:!!mt};
      case 'schedule': return {type:'sweep.tick',at:t,after:null,changed:{},real:true};
      case 'goal_updated': var g=W.list('goals')[0]; return {type:'goal.update',after:g||{name:'Revenue goal'},changed:{},real:!!g};
      default: return {type:'item.update',after:it||fakeItem,changed:{status:(it||fakeItem).status},real:!!it};
    }
  }
  function test(spec){
    var err=check(spec); if(err) return {ok:false,error:err,lines:[]};
    var ev=sample(spec.trigger), lines=[];
    var x=ev.after||{};
    lines.push({k:'Using',v:ev.real?(x.name||x.title?'\u201c'+(x.name||x.title)+'\u201d':'now'):'an example (you have no '+(spec.trigger.indexOf('meeting')===0?'meetings':'tasks')+' yet)'});
    var pass=(spec.filters||[]).every(function(f){ var d=F[f.c]; return !d||d.test(ev,f.cfg||{}); });
    if((spec.filters||[]).length) lines.push({k:'Filter',v:pass?'passes':'would stop here, so nothing runs for this one'});
    if(pass) spec.steps.forEach(function(st,i){ var D=S[st.a]; lines.push({k:'Step '+(i+1),v:D.plan(ev,st.cfg||{})}); });
    return {ok:true,lines:lines,pass:pass};
  }

  /* ---------------- plain English -> a rule ----------------
     Deterministic on purpose: the same words always make the same rule,
     and you see it before it is saved. */
  var NUMW={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,ten:10,fifteen:15,thirty:30};
  function num(v){ v=String(v||'').toLowerCase(); return NUMW[v]!=null?NUMW[v]:+v; }
  function hhmm(h,m,ap){
    h=+h; m=+(m||0); ap=String(ap||'').toLowerCase();
    if(ap==='pm'&&h<12) h+=12; if(ap==='am'&&h===12) h=0;
    if(!ap&&h>=1&&h<=6) h+=12;              /* "at 5" means the afternoon */
    return (h<10?'0':'')+h+':'+(m<10?'0':'')+m;
  }
  function parse(text){
    var t=String(text||'').trim().replace(/[’]/g,"'").replace(/\s+/g,' ');
    if(!t) return {error:'Describe the rule in a sentence.'};
    var spec={trigger:'',tcfg:{},filters:[],steps:[],name:''}, cut='', m;
    /* "a task called invoice is done": the name is a filter, taken out first
       so the rest reads as a plain trigger */
    var head0=t.split(/,|\bthen\b/i)[0];
    if((m=head0.match(/\s(?:called|named)\s+["\u201c]?([A-Za-z0-9][\w -]{0,30}?)["\u201d]?(?=\s+(?:is|gets|goes|moves|has|becomes|sits|ends|finishes|starts)\b)/i))){
      spec.filters.push({c:'name_has',cfg:{t:m[1].trim()}}); t=t.replace(m[0],'');
    }

    /* WHEN */
    if((m=t.match(/(\d+|an?|one|two|thirty|fifteen)\s*(min(?:ute)?s?|hours?|hrs?)\s*before\s+(?:a|any|every|each|my|the)?\s*(?:meeting|call)s?/i))){
      var mins=num(m[1])*(/^h/i.test(m[2])?60:1);
      spec.trigger='meeting_soon'; spec.tcfg={min:String(mins<=10?10:mins<=30?30:mins<=60?60:120)}; cut=m[0];
    }else if((m=t.match(/before\s+(?:a|any|every|each|my|the)?\s*(?:meeting|call)s?/i))){
      spec.trigger='meeting_soon'; spec.tcfg={min:'30'}; cut=m[0];
    }else if((m=t.match(/(?:after|when(?:ever)?|once)\s+(?:a|any|every|each|my|the)?\s*(?:meeting|call)s?(?:\s+(?:ends|finishes|is over|is done|wraps up))?/i))&&(/^after/i.test(m[0])||/(ends|finishes|over|done|wraps)/i.test(m[0]))){
      spec.trigger='meeting_ended'; cut=m[0];
    }else if((m=t.match(/(every\s*(?:day|morning|weekday|monday|friday)|each\s*(?:day|morning)|daily|on weekdays|weekdays)(?:[^0-9,]*?\bat\s*(\d{1,2})(?::(\d\d))?\s*(am|pm)?)?/i))){
      var w1=m[1].toLowerCase();
      var days=/weekday/.test(w1)?'weekdays':/monday/.test(w1)?'mondays':/friday/.test(w1)?'fridays':'every day';
      var tm=m[2]?hhmm(m[2],m[3],m[4]||(/morning/.test(w1)?'am':'')):(/morning/.test(w1)?'08:00':'09:00');
      spec.trigger='schedule'; spec.tcfg={time:tm,days:days}; cut=m[0];
    }else if((m=t.match(/(?:sits?|stuck|quiet|idle|untouched|hasn't moved|has not moved|waits?|waiting)\b[^.,]*?\bfor\s*(\d+|two|three|five|seven)\s*days?/i))){
      var dd=num(m[1]);
      spec.trigger='item_stale'; spec.tcfg={days:String(dd<=2?2:dd<=3?3:dd<=5?5:dd<=7?7:14),st:/in progress/i.test(t)?'In Progress':(/waiting/i.test(t)?'Waiting':'any open')}; cut=m[0];
    }else if((m=t.match(/(?:goes|becomes|is|gets)?\s*(?:overdue|late|past due)\b|misses its (?:due )?date/i))&&/task|overdue|due/i.test(t)){
      spec.trigger='due_passed'; cut=m[0];
    }else if((m=t.match(/(?:when(?:ever)?|after|once|if)\s+(?:a|an|any|every|my)?\s*(?:[a-z-]+\s+){0,2}?(?:task|item|to-?do)\s*(?:is|gets|has been)?\s*(?:marked\s+)?(done|completed|complete|finished|closed|started|in progress|waiting|blocked)/i))){
      var w2=m[1].toLowerCase(), to=/start|progress/.test(w2)?'In Progress':(/wait|block/.test(w2)?'Waiting':'Completed');
      spec.trigger='status_changes'; spec.tcfg={to:to}; cut=m[0];
    }else if((m=t.match(/(?:when(?:ever)?|if)?\s*(?:i add a task|a new task is (?:created|added)|a task is (?:created|added|made)|new task(?:s)?(?: (?:is|are) (?:created|added))?)/i))&&m[0].trim()){
      spec.trigger='item_created'; cut=m[0];
    }else if((m=t.match(/(?:when(?:ever)?|if)?\s*(?:a|my)?\s*goal\b[^,]*?(?:is updated|updates|falls behind|slips|is behind)/i))){
      spec.trigger='goal_updated'; cut=m[0];
      if(/behind|slips|falls/i.test(m[0])) spec.filters.push({c:'goal_behind',cfg:{}});
    }

    /* ONLY IF */
    var rest=cut?t.replace(cut,' '):t;
    if((m=t.match(/\b(critical|high|medium|low)[- ]priority\b|\bmarked (critical|high)\b|\bis (critical|urgent)\b|\b(critical|urgent)\b(?=\s+(?:task|item|work))/i))){
      var p=(m[1]||m[2]||m[3]||m[4]).toLowerCase(); p=p==='urgent'?'Critical':cap(p);
      spec.filters.push({c:'priority_is',cfg:{p:p}});
      rest=rest.replace(m[0],' ');
    }
    /* "a task called X" only filters in the when part, before the steps */
    var head=rest.split(/,|\bthen\b/i)[0];
    if(spec.trigger!=='schedule'&&(m=head.match(/\b(?:called|named|about|mentioning|with the word|containing|that contains)\s+["“]?([A-Za-z0-9][\w -]{1,30}?)["”]?(?=\s*(?:[,.;]|$|\s+(?:then|and)\b))/i))){
      spec.filters.push({c:'name_has',cfg:{t:m[1].trim()}}); rest=rest.replace(m[0],' ');
    }
    if((m=rest.match(/(?:that is |that's |which is )?(?:in a project|belongs to a project)/i))){ spec.filters.push({c:'has_project',cfg:{}}); rest=rest.replace(m[0],' '); }

    /* what is left of the "when" clause is the words before the first comma */
    rest=rest.replace(/\s+/g,' ').trim();
    if(spec.trigger&&/^(?:when(?:ever)?|if|after|once|on|every|each|a|an|any|my|the)\b[^,]*,/i.test(rest)) rest=rest.replace(/^[^,]*,/,'');
    else if(spec.trigger&&/^(?:when(?:ever)?|if)\b[^,]*$/i.test(rest)) rest='';
    rest=rest.replace(/^[\s,:;-]*(?:(?:then|do|please)\s+)?/i,'');

    /* THEN: the steps */
    var parts=rest.split(/\s*,\s*(?:and\s+)?then\s+|\s+and then\s+|\s*;\s*|\.\s+|\s+then\s+|\s+and\s+(?=(?:wait|remind|notify|tell|ping|create|make|add|ask|have|set|move|mark|put|send|prep|brief)\b)|\s*,\s*(?=(?:and\s+)?(?:wait|remind|notify|tell|ping|create|make|add|ask|have|get|set|move|mark|put|prep|brief|send|\d+\s*(?:min|hour|day|week)|an?\s+(?:hour|day|week)|the next day)\b)/i)
      .map(function(s){ return String(s||'').trim().replace(/^(?:and|then)\s+/i,'').replace(/[.\s]+$/,''); }).filter(Boolean);
    parts.forEach(function(s){ var st=step(s,spec); if(st) [].concat(st).forEach(function(x){ spec.steps.push(x); }); });
    var err=check(spec);
    if(err) return {error:err,spec:spec};
    spec.name=autoName(spec);
    return {spec:spec};
  }
  var TEAM_WORDS=/^(?:the|my|your)\s+(?:ai\s+)?team$|^(?:the\s+)?team$|^everyone$/i;
  function step(s,spec){
    var m, item=['status_changes','item_created','due_passed','item_stale'].indexOf(spec.trigger)>=0, call=/^meeting/.test(spec.trigger);
    /* "2 days later", "wait 3 hours", "a week later" */
    if((m=s.match(/^(?:wait\s*(?:for\s*)?)?(\d+|an?|one|two|three|five|seven|fifteen|thirty)\s*(min(?:ute)?s?|hours?|hrs?|days?|weeks?)\s*(?:later|after(?:wards)?)?\s*,?\s*(.*)$/i))&&(/^wait/i.test(s)||/\b(later|after)/i.test(s)||!m[3])){
      var n=num(m[1]), u=/^min/i.test(m[2])?'minutes':/^h/i.test(m[2])?'hours':'days';
      if(/^week/i.test(m[2])){ n*=7; u='days'; }
      var w={a:'wait',cfg:{n:String(n),u:u}};
      return m[3]?[w].concat(step(m[3],spec)||[]):w;
    }
    if((m=s.match(/^(?:wait\s+(?:until|till)\s+)?(?:the\s+)?next\s+day,?\s*(.*)$/i))) return [{a:'wait',cfg:{n:'1',u:'days'}}].concat(m[1]?(step(m[1],spec)||[]):[]);
    if((m=s.match(/^(?:remind|notify|tell|ping|alert|nudge)\s+me\b(?:\s+(?:to|that|about))?\s*:?\s*(.*)$/i))){
      var msg=cap(m[1]||'Check {name}');
      if(!/\{name\}/.test(msg)&&(item||call)&&m[1]) msg+=': {name}';
      return {a:'notify',cfg:{msg:msg}};
    }
    if((m=s.match(/^(?:send me|give me)\s+(?:a\s+)?(?:notification|push|alert)(?:\s+(?:saying|that))?\s*:?\s*(.*)$/i))) return {a:'notify',cfg:{msg:cap(m[1]||'Check {name}')}};
    if((m=s.match(/^(?:ask|have|get|tell)\s+((?:the|my|your)\s+(?:ai\s+)?team|team|everyone|[A-Za-z]+)\s+(?:to\s+)?(.+)$/i))){
      var who=m[1];
      if(TEAM_WORDS.test(who)) return {a:'ask_team',cfg:{who:'',text:cap(m[2])}};
      if(isTeammate(who)) return {a:'ask_team',cfg:{who:cap(who),text:cap(m[2])}};
    }
    if(/^(?:prep|prepare|brief)\s+me\b/i.test(s)) return {a:'ask_team',cfg:{who:'',text:cap(s)+(call&&!/\{name\}|\bfor\b/i.test(s)?' for {name} with {who} at {when}':'')}};
    if((m=s.match(/^(?:create|make|add|open|log)\s+(?:a\s+|an\s+)?(?:new\s+)?(follow[- ]?up|write[- ]?up|task|to-?do|reminder)(?:\s+(?:task|item))?(?:\s+(?:called|named|to|for)\b|\s*:)?\s*(.*)$/i))){
      var body=m[2]||'', due='+3d';
      var dm=body.match(/\s*(?:due\s+)?(today|tomorrow|in\s+(\d+|a|one|two|three|seven)\s+days?|next week|in a week)\s*$/i);
      if(dm){ body=body.slice(0,dm.index); var dw=dm[1].toLowerCase(); due=dw==='today'?'today':dw==='tomorrow'?'tomorrow':/week/.test(dw)?'+7d':('+'+num(dm[2])+'d'); }
      var kind=/write/i.test(m[1])?'Write up {name}':(/follow/i.test(m[1])?'Follow up on {name}':'');
      if(!dm&&kind==='Write up {name}') due='today';
      var nm=body.trim()?cap(body.trim()):(kind||'Follow up on {name}');
      return {a:'create_task',cfg:{name:nm,due:due,p:'Medium'}};
    }
    if((m=s.match(/^(?:set|make|change)\s+(?:its|the|it)?\s*(?:priority\s*)?(?:to\s+)?(critical|high|medium|low)(?:\s+priority)?$/i))) return {a:'set_priority',cfg:{p:cap(m[1].toLowerCase())}};
    if((m=s.match(/^(?:move|put|set)\s+it\s+(?:to|in|into|as)\s+(waiting|in progress|completed|done|not started)$/i))){ var sv=m[1].toLowerCase(); return {a:'set_status',cfg:{s:sv==='done'?'Completed':sv.replace(/\b\w/g,function(c){ return c.toUpperCase(); })}}; }
    if(/^(?:mark|set)\s+it\s+(?:as\s+)?(?:done|complete|completed|finished)$|^close it$|^complete it$/i.test(s)) return {a:'archive',cfg:{}};
    if(/^(?:put|move|add)\s+it\s+(?:on|to)\s+today$|^make it due today$/i.test(s)) return {a:'due_today',cfg:{}};
    return null;
  }
  function isTeammate(n){
    var c=C(), q=String(n||'').toLowerCase(); if(!c||!q) return false;
    return c.emps().some(function(e){ return e.n.toLowerCase()===q; })||(c.TPL||[]).some(function(t){ return String(t.n||'').toLowerCase()===q; });
  }

  /* ---------------- ready-made rules (added to the Recipes list) ---------------- */
  var MORE=[
    {name:'Prep me 30 minutes before every call',trigger:'meeting_soon',tcfg:{min:'30'},
     steps:[{a:'ask_team',cfg:{who:'',text:'Prep me for {name} with {who} at {when}: who they are, what to raise, what to bring, and anything to buy on the way. My notes: {prep}'}}]},
    {name:'Brief me every weekday at 8',trigger:'schedule',tcfg:{time:'08:00',days:'weekdays'},
     steps:[{a:'ask_team',cfg:{who:'',text:'Brief me on today: my meetings, what is due, what is overdue, and the one thing to do first.'}}]},
    {name:'After a call: write-up today, check in two days later',trigger:'meeting_ended',tcfg:{},
     steps:[{a:'create_task',cfg:{name:'Write up {name}',due:'today',p:'High'}},{a:'wait',cfg:{n:'2',u:'days'}},{a:'notify',cfg:{msg:'Did {name} get its follow-up?'}}]},
    {name:'Nudge me when a waiting task goes quiet for 3 days',trigger:'item_stale',tcfg:{days:'3',st:'Waiting'},
     steps:[{a:'notify',cfg:{msg:'{name} has been waiting 3 days. Chase it?'}},{a:'create_task',cfg:{name:'Chase: {name}',due:'today',p:'High'}}]},
    {name:'Critical work done: check the result a week later',trigger:'status_changes',tcfg:{to:'Completed'},filters:[{c:'priority_is',cfg:{p:'Critical'}}],
     steps:[{a:'wait',cfg:{n:'7',u:'days'}},{a:'create_task',cfg:{name:'Check the result of {name}',due:'today'}}]}
  ];
  MORE.forEach(function(m){
    U.TEMPLATES.push({name:m.name,trigger:m.trigger,tcfg:m.tcfg,condition:(m.filters&&m.filters.length)?'all':'none',ccfg:{list:m.filters||[]},
      action:'flow',acfg:{steps:m.steps}});
  });
  /* each added rule gets its own copy (a stamp in one must not reach another) */
  U.addTemplate=function(ix){
    var t=U.TEMPLATES[ix]; if(!t) return null;
    var r=W.create('automations',{name:t.name,trigger:t.trigger,tcfg:clone(t.tcfg),condition:t.condition||'none',ccfg:clone(t.ccfg),
      action:t.action,acfg:clone(t.acfg),enabled:true,runs:[]},'user');
    if(r&&r.id&&r.action==='flow'){ r.acfg.rule=r.id; W.save(); }
    return r;
  };

  /* =====================================================================
     Meeting notes -> action items and decisions (Fireflies / Otter)
     ===================================================================== */
  var DOW=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  var VERB=/\b(send|share|email|call|book|schedule|draft|write|review|update|prepare|prep|finish|fix|check|confirm|follow up|follow-up|set up|setup|order|buy|pay|invoice|post|publish|ask|reach out|contact|create|make|plan|research|look into|find|get|sign|submit|organi[sz]e|move|test|ship|deliver|introduce|loop in|circle back)\b/;
  function dueIn(s,base){
    var t=String(s||'').toLowerCase(), b=new Date(base||now()); b.setHours(0,0,0,0); var d0=b.getTime(), m;
    if(/\b(today|eod|end of (?:the )?day|tonight)\b/.test(t)) return {at:d0,txt:(t.match(/\b(?:by\s+)?(today|eod|end of (?:the )?day|tonight)\b/)||[''])[0]};
    if(/\btomorrow\b/.test(t)) return {at:d0+DAY,txt:(t.match(/\b(?:by\s+)?tomorrow\b/)||[''])[0]};
    if((m=t.match(/\b(?:by\s+|on\s+|before\s+)?(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri)\b/))){
      var full=DOW.filter(function(d){ return d.indexOf(m[1])===0; })[0], want=DOW.indexOf(full), have=b.getDay();
      var add=(want-have+7)%7||7; if(/next\s/.test(m[0])&&add<7) add+=7;
      return {at:d0+add*DAY,txt:m[0]};
    }
    if((m=t.match(/\b(?:by\s+)?(?:the\s+)?end of (?:the\s+)?week\b|\bthis week\b/))){ var f=(5-b.getDay()+7)%7; return {at:d0+f*DAY,txt:m[0]}; }
    if((m=t.match(/\b(?:by\s+)?next week\b/))) return {at:d0+7*DAY,txt:m[0]};
    if((m=t.match(/\bin\s+(\d+|a|one|two|three)\s+(days?|weeks?)\b/))){ var n=num(m[1]); return {at:d0+n*(/week/.test(m[2])?7:1)*DAY,txt:m[0]}; }
    if((m=t.match(/\b(?:by\s+)?(\d{1,2})\/(\d{1,2})\b/))){ var dt=new Date(b.getFullYear(),+m[1]-1,+m[2]); if(dt.getTime()<d0-DAY) dt.setFullYear(dt.getFullYear()+1); return {at:dt.getTime(),txt:m[0]}; }
    return null;
  }
  function people(meeting){ return String(meeting&&meeting.attendees||'').split(/[,;&]|\band\b/).map(function(x){ return x.trim(); }).filter(function(x){ return x&&x.length<40; }); }
  function actions(notes,meeting,base){
    var lines=String(notes||'').replace(/\r/g,'').replace(/([.!?])\s+(?=[A-Z@\[])/g,'$1\n').split(/\n+/).map(function(l){ return l.trim(); }).filter(Boolean);
    var names=people(meeting), out=[], decisions=[], seen={};
    lines.forEach(function(l0){
      var l=l0.replace(/^\s*(?:[-*\u2022\u2013]|\d+[.)])\s*/,'');
      var low=l.toLowerCase(), explicit=false, owner='', m;
      if(/^(?:decided|decision|agreed|we agreed|we decided|we'll go with|going with)\b/i.test(l)||/^(?:decision|decided)\s*:/i.test(l)){
        decisions.push(cap(l.replace(/^(?:decision|decided)\s*:\s*/i,''))); return;
      }
      if((m=l.match(/^\s*(?:\[\s?\]|todo|to do|to-do|action(?: item)?|ai|next step|follow[- ]?up)\s*[:\-\u2013]?\s*/i))&&m[0].trim()){ explicit=true; l=l.slice(m[0].length); low=l.toLowerCase(); }
      if(/^\[x\]/i.test(l)) return;
      if((m=l.match(/^@([A-Za-z][\w.-]*)\s*[:,-]?\s*/))){ owner=m[1]; l=l.slice(m[0].length); }
      else if((m=l.match(/^(I|I'll|I will|we|we'll|we will|you|you'll)\b\s*(?:will|'ll|need to|needs to|to|should|must|can)?\s*/i))&&/\b(will|'ll|need|to|should|must)\b/i.test(m[0]+' '+l.slice(m[0].length).split(' ')[0])){ owner=/^(i|i'll|i will|we|we'll|we will)$/i.test(m[1].trim())?'me':'them'; l=l.slice(m[0].length); }
      else if((m=l.match(/^([A-Z][a-z]+)\s+(?:will|'ll|is going to|needs to|need to|to|should|must|owns|takes)\s+/))&&(names.indexOf(m[1])>=0||names.some(function(n){ return n.split(' ')[0]===m[1]; })||m[1]!=='We')){
        if(['The','This','That','It','There','We','They','He','She'].indexOf(m[1])<0){ owner=m[1]; l=l.slice(m[0].length); }
      }
      var verbOk=VERB.test(l.toLowerCase());
      if(!explicit&&!owner&&!/\b(need to|needs to|must|should|will|let's|lets|action)\b/i.test(low)) return;
      if(!verbOk&&!explicit) return;
      var d=dueIn(l,base);
      var task=l;
      if(d&&d.txt) task=task.replace(new RegExp('\\s*'+d.txt.replace(/[.*+?^${}()|[\]\\\/]/g,'\\$&')+'\\b','i'),'');
      task=task.replace(/^(?:will|'ll|to|needs? to|should|must)\s+/i,'').replace(/\s*[.;,]+\s*$/,'').trim();
      if(task.length<4) return;
      task=cap(task);
      var k=task.toLowerCase(); if(seen[k]) return; seen[k]=1;
      out.push({text:task,owner:owner==='them'?'':owner,due:d?d.at:null,dueTxt:d?d.txt.replace(/^(by|on|before)\s+/,''):'' ,line:l0});
    });
    return {items:out,decisions:decisions};
  }
  function addActions(meeting,list){
    var made=0;
    (list||[]).forEach(function(x){
      var own=x.owner&&x.owner!=='me'?x.owner:'';
      var it=W.create('items',{name:x.text+(own?' ('+own+')':''),status:'Not Started',priority:'Medium',
        due:x.due||W.startOfDay()+3*DAY,notes:'From the call \u201c'+(meeting.title||'')+'\u201d'+(own?'. Owner: '+own:'')+'.\n'+(x.line||''),
        meetingId:meeting.id,owner:own||'me',checklist:[]},'user');
      if(it&&it.id) made++;
    });
    if(made&&meeting.id) W.update('meetings',meeting.id,{actionsPulled:now()},'user');
    return made;
  }

  /* ---------------- the screens ---------------- */
  /* Automations: a box to say the rule, the builder behind +, and the
     tools that inspired it (KovaApps, behind a link, not a new tab). */
  function paintAuto(){
    var body=$('waBody'); if(!body||body.querySelector('.kfl-say')) return;
    var first=body.querySelector('.card');
    var box=document.createElement('div');
    box.className='card kfl-say';
    box.innerHTML='<div class="kfl-h">Say the rule</div>'
      +'<div class="kfl-sub">Write it like you would tell an assistant. You see it before it is saved.</div>'
      +'<textarea class="kfl-in" id="kflSay" rows="2" placeholder="When a call ends, make a write-up task, wait 2 days, then remind me"></textarea>'
      +'<div class="kfl-ex">'+['30 minutes before every call, prep me','Every weekday at 8, ask Ravi to brief me','When a waiting task sits for 3 days, remind me to chase it'].map(function(x){ return '<button class="kfl-chip" data-kf="ex">'+esc(x)+'</button>'; }).join('')+'</div>'
      +'<div class="kfl-row"><button class="btn" data-kf="build">Build it</button><button class="btn ghost" data-kf="blank">Start from scratch</button></div>'
      +'<button class="kfl-link" data-kf="apps"><span>How the best tools do it</span><small>86 apps, what each does best, and what Kova took</small><i aria-hidden="true">\u203a</i></button>';
    if(first&&first.nextSibling) body.insertBefore(box,first.nextSibling); else body.appendChild(box);
    box.addEventListener('click',function(e){
      var b=e.target.closest('[data-kf]'); if(!b) return;
      var k=b.dataset.kf;
      if(k==='ex'){ $('kflSay').value=b.textContent; $('kflSay').focus(); }
      else if(k==='build') fromWords($('kflSay').value);
      else if(k==='blank') builder({trigger:'status_changes',tcfg:{to:'Completed'},filters:[],steps:[{a:'notify',cfg:{msg:'{name} is done'}}]});
      else if(k==='apps'){ if(window.KovaApps) KovaApps.open(); else say('Loading\u2026'); }
    });
  }
  function fromWords(text){
    var r=parse(text);
    if(r.error&&!r.spec){ say(r.error); return; }
    if(r.error){ builder(r.spec,r.error); return; }
    builder(r.spec);
  }

  /* the builder: WHEN, ONLY IF, THEN (steps), with Test it and Save */
  var B=null;
  function opts(list,val){ return list.map(function(o){ return '<option'+(String(o)===String(val)?' selected':'')+'>'+esc(o)+'</option>'; }).join(''); }
  function fieldHtml(f,cfg,path){
    var v=cfg[f.k]!=null?cfg[f.k]:(f.opts?f.opts[0]:'');
    var lab=f.n?'<span>'+esc(f.n)+'</span>':'';
    if(f.opts) return '<label class="kfl-f">'+lab+'<select data-p="'+path+'" data-k="'+f.k+'">'+opts(f.opts,v)+'</select></label>';
    return '<label class="kfl-f wide">'+lab+'<input data-p="'+path+'" data-k="'+f.k+'" type="'+(f.type==='time'?'time':'text')+'" value="'+esc(v||'')+'" placeholder="'+esc(f.ph||'')+'"></label>';
  }
  function builder(spec,warn){
    B=clone(spec); B.filters=B.filters||[]; B.steps=B.steps||[]; B.tcfg=B.tcfg||{};
    if(!window.openSheet) return;
    openSheet('<div class="grab"></div><div class="kfl-sheet" id="kflB"></div>');
    drawBuilder(warn);
  }
  var TRIG_ORDER=['status_changes','item_created','due_passed','item_stale','meeting_soon','meeting_ended','schedule','goal_updated'];
  function drawBuilder(warn,result){
    var el=$('kflB'); if(!el||!B) return;
    var tr=T[B.trigger]||T.status_changes;
    var h='<div class="kfl-title">'+(B.id?'Edit rule':'New rule')+'</div>'
      +(warn?'<div class="kfl-warn">'+esc(warn)+'</div>':'')
      +'<label class="kfl-f wide"><span>Name</span><input id="kflName" value="'+esc(B.name||'')+'" placeholder="'+esc(autoName(B))+'"></label>'
      +'<div class="kfl-sec">When</div><div class="kfl-box">'
      +'<select id="kflTrig">'+TRIG_ORDER.map(function(k){ return '<option value="'+k+'"'+(k===B.trigger?' selected':'')+'>'+esc(T[k].n)+'</option>'; }).join('')+'</select>'
      +'<div class="kfl-fs">'+(tr.fields||[]).map(function(f){ return fieldHtml(f,B.tcfg,'t'); }).join('')+'</div></div>'
      +'<div class="kfl-sec">Only if <small>optional</small></div>'
      +B.filters.map(function(x,i){ var f=F[x.c]; return '<div class="kfl-box kfl-st"><select data-fi="'+i+'">'+Object.keys(F).map(function(k){ return '<option value="'+k+'"'+(k===x.c?' selected':'')+'>'+esc(F[k].n)+'</option>'; }).join('')+'</select>'
        +'<div class="kfl-fs">'+(f?f.fields:[]).map(function(fd){ return fieldHtml(fd,x.cfg||(x.cfg={}),'f'+i); }).join('')+'</div><button class="kfl-x" data-kb="rmf" data-i="'+i+'" aria-label="Remove filter">\u00d7</button></div>'; }).join('')
      +'<button class="kfl-add" data-kb="addf">+ Add a filter</button>'
      +'<div class="kfl-sec">Then</div>'
      +B.steps.map(function(x,i){ var d=S[x.a]; return '<div class="kfl-box kfl-st"><b class="kfl-n">'+(i+1)+'</b><select data-si="'+i+'">'+Object.keys(S).map(function(k){ return '<option value="'+k+'"'+(k===x.a?' selected':'')+'>'+esc(S[k].n)+'</option>'; }).join('')+'</select>'
        +'<div class="kfl-fs">'+(d?d.fields:[]).map(function(fd){ return fieldHtml(fd,x.cfg||(x.cfg={}),'s'+i); }).join('')+'</div>'
        +'<span class="kfl-mv">'+(i?'<button class="kfl-x" data-kb="up" data-i="'+i+'" aria-label="Move up">\u2191</button>':'')+'<button class="kfl-x" data-kb="rms" data-i="'+i+'" aria-label="Remove step">\u00d7</button></span></div>'; }).join('')
      +'<button class="kfl-add" data-kb="adds">+ Add a step</button>'
      +'<div class="kfl-hint">Words like {name}, {who}, {when} and {prep} are filled in from the task or the call.</div>'
      +(result?'<div class="kfl-test">'+(result.ok?result.lines.map(function(l){ return '<div><b>'+esc(l.k)+'</b><span>'+esc(l.v)+'</span></div>'; }).join(''):'<div class="kfl-warn">'+esc(result.error)+'</div>')+'</div>':'')
      +'<div class="kfl-row"><button class="btn ghost" data-kb="test">Test it</button><button class="btn" data-kb="save">'+(B.id?'Save changes':'Save and switch on')+'</button></div>';
    el.innerHTML=h;
    el.onchange=function(e){
      var x=e.target;
      if(x.id==='kflTrig'){ B.trigger=x.value; B.tcfg={}; drawBuilder(); return; }
      if(x.dataset.fi!=null){ B.filters[+x.dataset.fi]={c:x.value,cfg:{}}; drawBuilder(); return; }
      if(x.dataset.si!=null){ B.steps[+x.dataset.si]={a:x.value,cfg:{}}; drawBuilder(); return; }
      setField(x);
    };
    el.oninput=function(e){ if(e.target.dataset.p) setField(e.target); if(e.target.id==='kflName') B.name=e.target.value; };
    el.onclick=function(e){
      var b=e.target.closest('[data-kb]'); if(!b) return;
      var k=b.dataset.kb, i=+b.dataset.i;
      readAll();
      if(k==='addf'){ B.filters.push({c:'priority_is',cfg:{p:'Critical'}}); drawBuilder(); }
      else if(k==='rmf'){ B.filters.splice(i,1); drawBuilder(); }
      else if(k==='adds'){ B.steps.push({a:'notify',cfg:{msg:'Check {name}'}}); drawBuilder(); }
      else if(k==='rms'){ B.steps.splice(i,1); drawBuilder(); }
      else if(k==='up'){ var s=B.steps.splice(i,1)[0]; B.steps.splice(i-1,0,s); drawBuilder(); }
      else if(k==='test'){ drawBuilder('',test(B)); }
      else if(k==='save') save();
    };
  }
  function setField(x){
    var p=x.dataset.p, k=x.dataset.k; if(!p||!k) return;
    var tgt=p==='t'?B.tcfg:(p.charAt(0)==='f'?B.filters[+p.slice(1)].cfg:B.steps[+p.slice(1)].cfg);
    tgt[k]=x.value;
  }
  function readAll(){ var el=$('kflB'); if(!el) return; el.querySelectorAll('[data-p]').forEach(setField); var n=$('kflName'); if(n) B.name=n.value; }
  function save(){
    readAll();
    var err=check(B); if(err){ drawBuilder(err); return; }
    if(B.id){
      W.update('automations',B.id,{name:B.name||autoName(B),trigger:B.trigger,tcfg:clone(B.tcfg),condition:B.filters.length?'all':'none',ccfg:{list:clone(B.filters)},action:'flow',acfg:{steps:clone(B.steps),rule:B.id}},'user');
    }else make(B);
    if(window.closeSheet) closeSheet();
    say(B.id?'Rule saved.':'Rule saved and switched on.');
    B=null;
    if(window.__workAuto) __workAuto.draw();
  }

  /* Meeting: "Pull action items" under the notes */
  function paintMeeting(){
    var body=$('wmdBody'); if(!body||body.querySelector('.kfl-pull')) return;
    var ta=$('wmdNotes'); if(!ta) return;
    var b=document.createElement('button');
    b.className='btn ghost kfl-pull'; b.type='button';
    b.innerHTML='Pull action items from the notes';
    var save=$('wmdSaveNotes'); if(save&&save.parentNode) save.parentNode.insertBefore(b,save.nextSibling);
    b.onclick=function(){ pullSheet(); };
  }
  function curMeeting(){
    var id=window.__workMeet&&__workMeet.cur&&__workMeet.cur();
    if(id&&W.find('meetings',id)) return W.find('meetings',id);
    var t=($('wmdTitle')||{}).textContent||'';
    var ta=$('wmdNotes');
    var L=W.list('meetings');
    return L.filter(function(m){ return m.notes===(ta&&ta.value); })[0]
      ||L.filter(function(m){ var s=m.title.length>30?m.title.slice(0,30)+'\u2026':m.title; return s===t; })[0]||null;
  }
  var PULL=null;
  function pullSheet(){
    var m=curMeeting(), ta=$('wmdNotes');
    if(!m){ say('Open a meeting first.'); return; }
    var text=ta?ta.value:m.notes;
    if(ta&&ta.value!==m.notes) W.update('meetings',m.id,{notes:ta.value},'user');
    var r=actions(text,m,m.at||now());
    PULL={m:m,items:r.items.map(function(x){ x.on=true; return x; }),decisions:r.decisions};
    if(!window.openSheet) return;
    openSheet('<div class="grab"></div><div class="kfl-sheet" id="kflP"></div>');
    drawPull();
  }
  function drawPull(){
    var el=$('kflP'); if(!el||!PULL) return;
    var on=PULL.items.filter(function(x){ return x.on; }).length;
    el.innerHTML='<div class="kfl-title">From \u201c'+esc(PULL.m.title)+'\u201d</div>'
      +(PULL.items.length?'<div class="kfl-sub">Action items found in your notes. Untick any that are not.</div>'
        +PULL.items.map(function(x,i){ return '<label class="kfl-ai"><input type="checkbox" data-pi="'+i+'"'+(x.on?' checked':'')+'><span><b>'+esc(x.text)+'</b><small>'
          +[x.owner?(x.owner==='me'?'You':esc(x.owner)):'You',x.due?'due '+esc(cap(x.dueTxt)||new Date(x.due).toLocaleDateString()):'due in 3 days'].join(' \u00b7 ')+'</small></span></label>'; }).join('')
        :'<div class="kfl-warn">No action items found. Write them as \u201cSam will send the deck by Friday\u201d, \u201cTODO: book the venue\u201d or \u201c@Ana review the copy\u201d.</div>')
      +(PULL.decisions.length?'<div class="kfl-sec">Decided</div>'+PULL.decisions.map(function(d){ return '<div class="kfl-dec">'+esc(d)+'</div>'; }).join(''):'')
      +'<div class="kfl-row">'+(PULL.items.length?'<button class="btn" data-pk="add"'+(on?'':' disabled')+'>Add '+on+' task'+(on===1?'':'s')+'</button>':'')+'<button class="btn ghost" data-pk="close">Close</button></div>';
    el.onchange=function(e){ var i=e.target.dataset.pi; if(i!=null){ PULL.items[+i].on=e.target.checked; drawPull(); } };
    el.onclick=function(e){
      var b=e.target.closest('[data-pk]'); if(!b) return;
      if(b.dataset.pk==='close'){ if(window.closeSheet) closeSheet(); return; }
      var n=addActions(PULL.m,PULL.items.filter(function(x){ return x.on; }));
      if(PULL.decisions.length) W.update('meetings',PULL.m.id,{decisions:PULL.decisions},'user');
      if(window.closeSheet) closeSheet();
      say(n+' task'+(n===1?'':'s')+' added to your board.');
      if(window.__workMeet) __workMeet.detail();
      if(window.__workDraw) try{ __workDraw.refresh(); }catch(x){}
    };
  }

  /* repaint when the screens are drawn again */
  function watch(id,fn){
    var el=$(id); if(!el||!window.MutationObserver) return;
    fn();
    new MutationObserver(function(){ fn(); }).observe(el,{childList:true});
  }
  function wire(){
    watch('waBody',paintAuto);
    watch('wmdBody',paintMeeting);
    var nb=$('waNew');
    if(nb) nb.onclick=function(){ if(window.go) go('workauto'); builder({trigger:'status_changes',tcfg:{to:'Completed'},filters:[],steps:[{a:'notify',cfg:{msg:'{name} is done'}}]}); };
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire); else wire();
  try{ sweep(); }catch(e){ console.warn('flow sweep',e); }
  setInterval(function(){ try{ sweep(); }catch(e){} },MIN);
  document.addEventListener('visibilitychange',function(){ if(!document.hidden) try{ sweep(); }catch(e){} });
  if(window.__workAuto) try{ __workAuto.draw(); }catch(e){}

  return {parse:parse,make:make,check:check,test:test,sweep:sweep,resume:resume,waits:waits,runSteps:runSteps,
    actions:actions,addActions:addActions,dueIn:dueIn,builder:builder,fromWords:fromWords,pull:pullSheet,
    STEPS:S,FILTERS:F,MORE:MORE,describe:function(a){ return U.describe(a); },_setNow:function(f){ NOW=f||null; }};
})();
