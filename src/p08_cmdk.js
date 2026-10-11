/* =====================================================================
   KovaCmd (p21) - one search bar for all of Kova, the way Linear,
   Superhuman and Raycast do it.

   Open it with ⌘K / Ctrl+K anywhere, or the search icon in a screen's
   header (those icons did nothing before). Type and it finds:
     tasks, projects, goals, meetings, files, your AI teammates,
     every screen, and the 86 apps in "How the best tools do it".
   And it acts on the line you typed:
     "Call Sam tomorrow !high #Launch"   -> a task, due tomorrow, High, in Launch
     "Ravi, find three venues by 5pm"   -> asks your team (back at 5pm)
     "When a call ends, remind me ..."   -> a rule, shown before it is saved
   Arrow keys, Enter and Esc; the last things you opened come first.
   ===================================================================== */
window.KovaCmd=(function(){
  'use strict';
  var DAY=864e5;
  var S={on:false,q:'',sel:0,rows:[],el:null,last:null};
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function W(){ return window.WorkOS||null; }
  function nav(id){ if(window.go) try{ go(id); }catch(e){} }
  function recent(){ var r=window.KP&&KP.get('cmd_recent'); return Array.isArray(r)?r:[]; }
  function remember(row){
    if(!window.KP||!row||!row.key||row.kind==='do') return;
    var r=recent().filter(function(x){ return x.key!==row.key; });
    r.unshift({key:row.key,t:row.t,s:row.s||'',kind:row.kind,ref:row.ref||''});
    KP.set('cmd_recent',r.slice(0,8));
  }

  /* every screen worth going to, and the words people use for it */
  var SCREENS=[
    ['home','Today','home start dashboard'],['move','Workout','train gym exercise lift'],['fuel','Fuel','food meals nutrition calories protein log'],
    ['recipes','Recipes','cook meal ideas'],['sleep','Sleep','bed night rest'],['naps','Naps','nap'],['sounds','Sleep sounds','noise rain music'],
    ['vitals','Vitals','heart hrv health readiness'],['stress','Stress','calm breathe'],['hrv','HRV','heart rate variability'],['watch','Your watch','apple watch wearable connect'],
    ['healthspan','Health Span','longevity age'],['scanner','Health check','scan body'],['maint','Your numbers','weight body fat progress photos'],
    ['prs','Personal records','pr best lifts'],['recovery','Recovery','rest sore'],['zone2','Easy cardio','zone 2 run walk'],['bedtime','Bedtime','wind down'],
    ['learn','Learn','study school'],['cards','Flashcards','study memorise'],['notebooks','Notebooks','notes study'],['focus','Focus session','pomodoro deep work timer'],
    ['chat','Ask Kova','chat assistant ai question'],['work','Work OS','studio business work'],['worktoday','Work today','agenda due today'],
    ['worktasks','Tasks','to do todo board kanban'],['workprojects','Projects','project'],['workgoals','Goals and metrics','goal kpi metric'],
    ['workmeetings','Meetings','calls calendar zoom meet'],['workteam','Your AI team','agents crew employees assistant maya ravi theo'],
    ['workauto','Automations','rules workflows zapier recipes when then'],['workfiles','Files','documents folders uploads'],
    ['workintegrations','Integrations','connect apps connections'],['workactivity','Activity','log history audit'],['workprofile','Business profile','brand company'],
    ['workinbound','Inbound','leads inbox'],['profile','Profile','account me'],['settings','Settings','preferences appearance theme dark light notifications'],
    ['plan','Plans','subscription pricing upgrade trial billing']
  ];

  /* ---------------- matching ---------------- */
  function score(q,text,words){
    if(!q) return 1;
    var t=String(text||'').toLowerCase(), w=String(words||'').toLowerCase();
    if(t===q) return 120;
    if(t.indexOf(q)===0) return 100;
    if((' '+t).indexOf(' '+q)>=0) return 80;
    if(t.indexOf(q)>=0) return 55;
    if((' '+w).indexOf(' '+q)>=0) return 45;
    var parts=q.split(/\s+/).filter(Boolean);
    if(parts.length>1&&parts.every(function(p){ return (t+' '+w).indexOf(p)>=0; })) return 40;
    /* letters in order: "wkmt" finds "Work meetings" */
    var i=0; for(var k=0;k<t.length&&i<q.length;k++) if(t[k]===q[i]) i++;
    return i===q.length&&q.length>=3?15:0;
  }

  /* ---------------- reading a line as a task ---------------- */
  var DOW=['sun','mon','tue','wed','thu','fri','sat'];
  function quick(line,now){
    var t=String(line||'').trim(), due=null, pri='', proj=null, m, base=new Date(now||Date.now()); base.setHours(0,0,0,0);
    var d0=base.getTime();
    if((m=t.match(/\s!(critical|urgent|high|medium|low|!{1,3})\b|\s!(!{0,2})$/i))){
      var v=(m[1]||m[2]||'').toLowerCase();
      pri=v==='critical'||v==='urgent'||v==='!!!'||v==='!!'?'Critical':v==='high'||v==='!'||v===''?'High':v==='low'?'Low':'Medium';
      t=t.replace(m[0],' ');
    }
    if((m=t.match(/\s#([\w-]+)/))){
      var name=m[1].toLowerCase().replace(/-/g,' ');
      proj=W()?W().list('projects').filter(function(p){ return String(p.name||'').toLowerCase().indexOf(name)===0; })[0]||null:null;
      if(proj) t=t.replace(m[0],' ');
    }
    if((m=t.match(/\s(?:due\s+|by\s+|on\s+)?(today|tonight|tomorrow|tmrw)\b/i))){ due=/^tom|tmrw/i.test(m[1])?d0+DAY:d0; t=t.replace(m[0],' '); }
    else if((m=t.match(/\s(?:due\s+|by\s+|on\s+)?(?:next\s+)?(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i))){
      var want=DOW.indexOf(m[1].toLowerCase().slice(0,3)), add=(want-base.getDay()+7)%7||7;
      if(/next\s/i.test(m[0])&&add<7) add+=7;
      due=d0+add*DAY; t=t.replace(m[0],' ');
    }
    else if((m=t.match(/\s(?:due\s+)?in\s+(\d+)\s*(d|days?|w|weeks?)\b/i))){ due=d0+(+m[1])*(/^w/i.test(m[2])?7:1)*DAY; t=t.replace(m[0],' '); }
    else if((m=t.match(/\s(?:due\s+)?next week\b/i))){ due=d0+7*DAY; t=t.replace(m[0],' '); }
    t=t.replace(/^(?:new\s+)?(?:task|todo|to-do|add)\s*:?\s+/i,'').replace(/\s+/g,' ').trim();
    return {name:t?t.charAt(0).toUpperCase()+t.slice(1):'',due:due,priority:pri||'Medium',project:proj};
  }
  function dueText(t){
    if(!t) return 'no date';
    var b=new Date(); b.setHours(0,0,0,0);
    if(t===b.getTime()) return 'today';
    if(t===b.getTime()+DAY) return 'tomorrow';
    return new Date(t).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});
  }
  function looksLikeRule(q){ return /^(when|whenever|every|each|after|before|if|on weekdays|\d+\s*(?:min|minutes|hours?)\s+before)\b/i.test(q)&&/,|then|remind|notify|ask|create|make|wait/i.test(q); }
  function teammateIn(q){
    var C=window.KovaCrew; if(!C||!C.emps) return null;
    var m=q.match(/^@?([A-Za-z]+)\s*[,:]/)||q.match(/^@([A-Za-z]+)\s/);
    if(!m) return null;
    var n=m[1].toLowerCase();
    return C.emps().filter(function(e){ return e.n.toLowerCase()===n; })[0]||null;
  }

  /* ---------------- the rows ---------------- */
  function build(q0){
    var q=String(q0||'').trim(), ql=q.toLowerCase(), rows=[], w=W();
    function add(kind,group,t,s,key,run,sc,ref){ rows.push({kind:kind,group:group,t:t,s:s||'',key:key,run:run,sc:sc,ref:ref||''}); }

    /* acting on the line */
    if(q){
      var mate=teammateIn(q);
      if(looksLikeRule(q)&&window.KovaFlow){
        add('do','Do','Make a rule: “'+q+'”','see it before it is saved','do:rule',function(){ nav('workauto'); setTimeout(function(){ KovaFlow.fromWords(q); },120); },1000);
      }
      if(mate||/^(ask|have|get)\s+/i.test(q)||/\b(research|find out|look into|summari[sz]e|brief me|tell me)\b/i.test(q)){
        var text=mate?q.replace(/^@?[A-Za-z]+\s*[,:]?\s*/,''):q;
        add('do','Do','Ask '+(mate?mate.n:'your team')+': “'+text+'”',mate?mate.title:'the right teammate takes it','do:ask',function(){ ask(mate,text); },mate?990:900);
      }
      if(w){
        var tk=quick(q);
        if(tk.name&&!looksLikeRule(q)) add('do','Do','New task: “'+tk.name+'”',[dueText(tk.due),tk.priority,tk.project?tk.project.name:''].filter(Boolean).join(' · '),'do:task',function(){ makeTask(tk); },mate?500:950);
      }
      if(window.KovaApps){
        var rec=KovaApps.recommend(q,1)[0];
        if(rec&&/\b(best|tool|app|like|alternative|vs|compare)\b/i.test(q)) add('do','Do','How '+rec.n+' does it','what it does best, and what Kova took','do:app',function(){ KovaApps.open(rec.id); },700);
      }
    }else{
      recent().forEach(function(r,i){ add(r.kind,'Recent',r.t,r.s,r.key,function(){ reopen(r); },200-i,r.ref); });
      add('do','Do','New task','type it, with a day or !high','do:newtask',function(){ setQ('task '); },150);
      add('do','Do','Ask your AI team','type a name and what you need, like “Ravi, research…”','do:newask',function(){ setQ('Ravi, '); },149);
      add('do','Do','New rule','“When a call ends, remind me to write it up”','do:newrule',function(){ nav('workauto'); if(window.KovaFlow) setTimeout(function(){ KovaFlow.builder({trigger:'meeting_ended',tcfg:{},filters:[],steps:[{a:'create_task',cfg:{name:'Write up {name}',due:'today'}}]}); },120); },148);
    }

    /* screens */
    SCREENS.forEach(function(s){ var sc=score(ql,s[1],s[2]); if(sc) add('screen','Go to',s[1],'','s:'+s[0],function(){ nav(s[0]); },sc*(q?1:0.5),s[0]); });
    if(w){
      w.list('items').forEach(function(i){
        var sc=score(ql,i.name,(i.notes||'')+' '+(i.status||'')); if(!sc||!q) return;
        add('task','Tasks',i.name,[i.status,i.due?'due '+dueText(i.due):''].filter(Boolean).join(' · '),'i:'+i.id,function(){ openTask(i.id); },sc+(i.status==='Completed'?-20:5),i.id);
      });
      w.list('projects').forEach(function(p){ var sc=score(ql,p.name); if(sc&&q) add('project','Projects',p.name,'project','p:'+p.id,function(){ nav('workprojects'); },sc,p.id); });
      w.list('goals').forEach(function(g){ var sc=score(ql,g.name||g.title); if(sc&&q) add('goal','Goals',g.name||g.title,'goal','g:'+g.id,function(){ nav('workgoals'); },sc,g.id); });
      w.list('meetings').forEach(function(m){
        var sc=score(ql,m.title,(m.attendees||'')+' '+(m.notes||'')); if(!sc||!q) return;
        add('meeting','Meetings',m.title,[m.attendees,m.at?new Date(m.at).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'}):''].filter(Boolean).join(' · '),'m:'+m.id,function(){ openMeeting(m.id); },sc,m.id);
      });
      w.list('files').concat(w.list('folders')).forEach(function(f){ var sc=score(ql,f.name||f.title); if(sc&&q) add('file','Files',f.name||f.title,'file','f:'+f.id,function(){ nav('workfiles'); },sc,f.id); });
    }
    if(window.KovaCrew&&KovaCrew.emps) KovaCrew.emps().forEach(function(e){
      var sc=score(ql,e.n,e.title+' '+(e.job||'')); if(!sc||!q) return;
      add('mate','Your AI team',e.n,e.title,'e:'+e.id,function(){ nav('workteam'); if(KovaCrew.detail) setTimeout(function(){ try{ KovaCrew.detail(e.id); }catch(x){} },120); },sc,e.id);
    });
    if(window.KovaApps&&q.length>=2) KovaApps.all().forEach(function(a){
      var sc=score(ql,a.n,a.grp+' '+a.best); if(sc>=45) add('app','How the best tools do it',a.n,a.best,'a:'+a.id,function(){ KovaApps.open(a.id); },sc-10,a.id);
    });

    /* best first, a few of each kind, actions on top, then the groups in
       the order of their best match (or a fixed order before you type) */
    rows.sort(function(a,b){ return b.sc-a.sc; });
    var per={}, kept=[], seen=[];
    rows.forEach(function(r){
      per[r.group]=(per[r.group]||0)+1;
      if(per[r.group]<=(r.group==='Do'?4:(r.group==='Go to'&&!q?6:5))){ kept.push(r); if(seen.indexOf(r.group)<0) seen.push(r.group); }
    });
    var FIXED=['Do','Recent','Go to'];
    function rank(g){ if(g==='Do') return 0; if(g==='Recent') return 1; return 2+(q?seen.indexOf(g):FIXED.indexOf(g)); }
    var out=[];
    seen.slice().sort(function(a,b){ return rank(a)-rank(b); }).forEach(function(g){ kept.forEach(function(r){ if(r.group===g) out.push(r); }); });
    return out.slice(0,30);
  }

  /* ---------------- doing things ---------------- */
  function makeTask(tk){
    var w=W(); if(!w||!tk.name) return null;
    var it=w.create('items',{name:tk.name,status:'Not Started',priority:tk.priority||'Medium',due:tk.due,projectId:tk.project?tk.project.id:undefined,notes:'',checklist:[]},'user');
    if(it&&it.id){
      say('Task added'+(tk.due?', due '+dueText(tk.due):'')+'.');
      remember({key:'i:'+it.id,t:it.name,s:'task',kind:'task',ref:it.id});
      if(window.__workDraw) try{ __workDraw.refresh(); }catch(e){}
    }
    return it;
  }
  function ask(mate,text){
    var C=window.KovaCrew, A=window.KovaAsk;
    var e=mate||(C&&C.route?(C.route(text)||{}).emp:null);
    if(A&&A.wants&&A.wants(text)) return A.send(e,text).catch(function(){});
    if(C&&e&&C.start){ C.start(e,text,'you'); say(e.n+' is on it.'); nav('workteam'); return; }
    nav('workteam'); say('Set up your AI team first.');
  }
  function openTask(id){ if(window.__workDraw&&__workDraw.open){ __workDraw.open(id); } else nav('worktasks'); }
  function openMeeting(id){ if(window.__workMeet&&__workMeet.open) __workMeet.open(id); else nav('workmeetings'); }
  function reopen(r){
    if(r.kind==='task') return openTask(r.ref);
    if(r.kind==='meeting') return openMeeting(r.ref);
    if(r.kind==='screen') return nav(r.ref);
    if(r.kind==='app'&&window.KovaApps) return KovaApps.open(r.ref);
    if(r.kind==='mate') return nav('workteam');
    if(r.kind==='project') return nav('workprojects');
    if(r.kind==='goal') return nav('workgoals');
    if(r.kind==='file') return nav('workfiles');
  }

  /* ---------------- the bar ---------------- */
  function mount(){
    if(S.el) return S.el;
    var el=document.createElement('div');
    el.className='kcmd'; el.id='kcmd'; el.hidden=true;
    el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); el.setAttribute('aria-label','Search Kova');
    el.innerHTML='<div class="kcmd-bg" data-kc="close"></div><div class="kcmd-p">'
      +'<div class="kcmd-in"><svg class="ic" aria-hidden="true"><use href="#i-search"/></svg>'
      +'<input id="kcmdQ" type="text" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="Search, or type a task, a question for your team, or a rule" aria-controls="kcmdL" role="combobox" aria-expanded="true">'
      +'<kbd>esc</kbd></div><div class="kcmd-l" id="kcmdL" role="listbox"></div>'
      +'<div class="kcmd-f"><span>↑↓ move</span><span>↵ open</span><span>⌘K anywhere</span></div></div>';
    document.body.appendChild(el);
    S.el=el;
    var inp=el.querySelector('#kcmdQ');
    inp.addEventListener('input',function(){ S.q=inp.value; S.sel=0; paint(); });
    inp.addEventListener('keydown',function(e){
      if(e.key==='ArrowDown'){ e.preventDefault(); S.sel=Math.min(S.rows.length-1,S.sel+1); paint(true); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); S.sel=Math.max(0,S.sel-1); paint(true); }
      else if(e.key==='Enter'){ e.preventDefault(); pick(S.sel); }
      else if(e.key==='Escape'){ e.preventDefault(); close(); }
    });
    el.addEventListener('click',function(e){
      if(e.target.closest('[data-kc="close"]')) return close();
      var r=e.target.closest('[data-ki]'); if(r) pick(+r.dataset.ki);
    });
    el.addEventListener('mousemove',function(e){ var r=e.target.closest('[data-ki]'); if(r&&+r.dataset.ki!==S.sel){ S.sel=+r.dataset.ki; paint(true); } });
    return el;
  }
  var ICON={task:'i-check',meeting:'i-video',mate:'i-sparkles',project:'i-layout-grid',goal:'i-target',file:'i-clipboard-text',screen:'i-arrow-right',app:'i-workflow',do:'i-plus'};
  function paint(keepList){
    var L=S.el&&S.el.querySelector('#kcmdL'); if(!L) return;
    if(!keepList) S.rows=build(S.q);
    var g='', h='';
    S.rows.forEach(function(r,i){
      if(r.group!==g){ g=r.group; h+='<div class="kcmd-g" role="presentation">'+esc(g)+'</div>'; }
      h+='<div class="kcmd-r'+(i===S.sel?' on':'')+'" role="option" id="kcmdR'+i+'" aria-selected="'+(i===S.sel)+'" data-ki="'+i+'">'
        +'<svg class="ic" aria-hidden="true"><use href="#'+(ICON[r.kind]||'i-arrow-right')+'"/></svg>'
        +'<span><b>'+esc(r.t)+'</b>'+(r.s?'<small>'+esc(r.s)+'</small>':'')+'</span></div>';
    });
    if(!S.rows.length) h='<div class="kcmd-none">Nothing found. Press ↵ to make it a task.</div>';
    L.innerHTML=h;
    var inp=S.el.querySelector('#kcmdQ'); if(inp) inp.setAttribute('aria-activedescendant','kcmdR'+S.sel);
    var on=L.querySelector('.kcmd-r.on'); if(on&&on.scrollIntoView&&keepList) on.scrollIntoView({block:'nearest'});
  }
  function pick(i){
    var r=S.rows[i];
    if(!r){ var tk=quick(S.q); if(tk.name){ close(); makeTask(tk); } return; }
    if(r.kind!=='do') remember(r);
    var keep=r.key==='do:newtask'||r.key==='do:newask';
    if(!keep) close();
    try{ r.run(); }catch(e){ console.warn('cmd',e); }
  }
  function setQ(v){ var inp=S.el&&S.el.querySelector('#kcmdQ'); if(!inp) return; inp.value=v; S.q=v; S.sel=0; paint(); inp.focus(); }
  function open(q){
    mount();
    S.last=document.activeElement;
    S.el.hidden=false; S.on=true; document.body.classList.add('kcmd-open');
    setQ(q||'');
    track('cmd_open');
  }
  function close(){
    if(!S.el||!S.on) return;
    S.el.hidden=true; S.on=false; document.body.classList.remove('kcmd-open');
    try{ if(S.last&&S.last.focus) S.last.focus(); }catch(e){}
  }
  function toggle(){ S.on?close():open(); }
  function track(n){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,{}); }catch(e){} }

  /* ⌘K / Ctrl+K anywhere */
  document.addEventListener('keydown',function(e){
    if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&!e.altKey&&String(e.key).toLowerCase()==='k'){ e.preventDefault(); toggle(); }
  });
  /* the header search icons that did nothing now open it; Work gets one too */
  function wire(){
    document.querySelectorAll('.hdr-r .iconbtn').forEach(function(b){
      if(b.id||b.dataset.kcmd||b.getAttribute('onclick')||b.dataset.go) return;
      var u=b.querySelector('use'); if(!u||(u.getAttribute('href')||'')!=='#i-search') return;
      b.dataset.kcmd='1'; b.setAttribute('aria-label','Search Kova'); b.setAttribute('role','button'); if(!b.hasAttribute('tabindex')) b.tabIndex=0;
      b.addEventListener('click',function(){ open(); });
      b.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); } });
    });
    var wk=document.querySelector('#s-work .hdr-r');
    if(wk&&!wk.querySelector('[data-kcmd]')){
      var b=document.createElement('div');
      b.className='iconbtn'; b.dataset.kcmd='1'; b.setAttribute('role','button'); b.tabIndex=0; b.setAttribute('aria-label','Search Kova');
      b.innerHTML='<svg class="ic"><use href="#i-search"/></svg>';
      b.addEventListener('click',function(){ open(); });
      b.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); } });
      wk.insertBefore(b,wk.firstChild);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire); else wire();

  return {open:open,close:close,toggle:toggle,build:build,quick:quick,score:score,pick:pick,isOpen:function(){ return S.on; },_S:S,SCREENS:SCREENS};
})();
