/* =====================================================================
   KovaAgent - the wellness agent's alerts, on screen.

   Where alerts come from:
     live   the server's agent (functions/agent.js, Claude Agent SDK) audits
            the seven metrics morning, evening and night and writes to
            users/{uid}/agent - this listens there, so a new alert pops up
            the moment it lands.
     here   until the server is live (or if it has not audited in 12 hours)
            the same seven-metric rules (KovaWellness - the server's own
            wellness.js, embedded) run on this device's data, so the pop-up
            works from day one.

   What you see:
     - a pop-up for the most urgent open alert: what is wrong, the one thing
       to do, and when (morning / evening / night), tinted in that area's
       colour; Done, Later, and a jump to the screen it is about;
     - "Your plan": every open alert grouped Morning / Evening / Night, the
       seven findings, "Check now", and the daily checks switch;
     - a slim line under Home's morning brief when something is open.
   ===================================================================== */
/* =====================================================================
   KovaOrb - Kova's one entry point: a small glowing sphere (p09, p10).

   The orb replaces the old chat button, so there is one Kova in the
   corner, not two. It never opens anything by itself: when something
   needs fixing it only shows a small count (red when urgent). It is a
   dark grey glass sphere in every appearance. Tap it and the
   Kova panel opens with four tabs:
     Chat          the Kova conversation (KovaChat)
     Your 7        the seven metrics, each with its number against your
                   normal or target, a bar and a short trend chart
     Plan          what to fix, grouped morning / evening / night
     Do it for me  tell it a job for the Work OS ("email Sam that the
                   invoice is late", "add a task to call the printer
                   Friday"). It drafts it; nothing is sent or saved until
                   you approve it.
   Works in dark, soft light and light.
   ===================================================================== */
window.KovaOrb=(function(){
  'use strict';
  var O={el:null,panel:null,tab:'chat',draft:null,busy:false,embed:false,next:null,n:0};
  var TABS=[['chat','Chat'],['seven','Your 7'],['plan','Plan'],['do','Do it for me']];
  function $(s,r){ return (r||document).querySelector(s); }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function mount(){
    if(O.el) return O.el;
    var el=document.createElement('button'); el.id='kgOrb'; el.className='ko'; el.type='button';
    el.setAttribute('aria-label','Kova agent');
    el.innerHTML='<i class="ko-core"></i><b class="ko-n" hidden></b>';
    el.addEventListener('click',function(){ isOpen()?close():open(); });
    document.body.appendChild(el); O.el=el;
    embed();
    /* stay out of the way of sign-in and first-run screens */
    setInterval(function(){
      var app=document.getElementById('app'), hit=document.elementFromPoint&&document.elementFromPoint(window.innerWidth/2,window.innerHeight/2);
      var covered=(app&&app.classList.contains('auth-locked'))||!(hit&&hit.closest&&(hit.closest('.screen.on')||hit.closest('#kgOrbPanel')));
      el.classList.toggle('ko-hide',(!!covered&&!isOpen())||chatOpen());
    },1200);
    return el;
  }
  function badge(n,urgent){ mount(); O.n=n||0; var b=O.el.querySelector('.ko-n'); b.hidden=!n; b.textContent=n>9?'9+':String(n||''); O.el.classList.toggle('alert',!!urgent); paintTabs(); }

  /* ---- the chat panel is the one panel: the agent's tabs live inside it ---- */
  function chatPanel(){ return window.KovaChat?document.getElementById('kovaPanel'):null; }
  function chatOpen(){ var p=chatPanel(); return !!(p&&p.classList.contains('on')); }
  function isOpen(){ return O.embed?chatOpen():!!O.panel; }
  function embed(){
    if(O.embed) return true;
    var p=chatPanel(), top=p&&p.querySelector('.kc-top'), scr=document.getElementById('kcScroll');
    if(!p||!top||!scr) return false;
    var tabs=document.createElement('div'); tabs.id='kcTabs'; tabs.className='kc-tabs'; tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','Kova');
    top.parentNode.insertBefore(tabs,top.nextSibling);
    var host=document.createElement('div'); host.id='kcAgent'; host.className='kc-agent'; host.setAttribute('role','tabpanel');
    scr.parentNode.insertBefore(host,scr.nextSibling);
    tabs.addEventListener('click',function(e){ var b=e.target.closest('[data-t]'); if(b) setTab(b.getAttribute('data-t')); });
    host.addEventListener('click',onClick);
    /* anything else that opens Kova (go('chat'), "ask Kova about this") lands on Chat */
    var raw=KovaChat.open;
    KovaChat.open=function(q){ var t=q?'chat':(O.next||'chat'); O.next=null; var r=raw.apply(KovaChat,arguments); setTab(t); return r; };
    if(window.MutationObserver) new MutationObserver(function(){ if(O.el) O.el.classList.toggle('ko-hide',chatOpen()); }).observe(p,{attributes:true,attributeFilter:['class']});
    O.panel=host; O.embed=true;
    paintTabs();
    return true;
  }
  function setTab(t){
    O.tab=t; var p=chatPanel(); if(!p) return;
    p.classList.toggle('agent-mode',t!=='chat');
    paintTabs();
    if(t!=='chat'){ paint(); O.panel.scrollTop=0; }
  }
  function paintTabs(){
    var el=document.getElementById('kcTabs'); if(!el) return;
    el.innerHTML=TABS.map(function(t){
      var n=t[0]==='plan'&&O.n?' <em>'+(O.n>9?'9+':O.n)+'</em>':'';
      return '<button type="button" role="tab" aria-selected="'+(O.tab===t[0])+'" class="'+(O.tab===t[0]?'on':'')+'" data-t="'+t[0]+'">'+t[1]+n+'</button>';
    }).join('');
  }

  function open(tab){
    mount();
    if(embed()){ O.next=tab||'chat'; KovaChat.open(); return; }
    if(tab) O.tab=tab;
    var v=$('#kgOrbPanel');
    if(!v){ v=document.createElement('div'); v.id='kgOrbPanel'; v.className='kop'; v.setAttribute('role','dialog'); v.setAttribute('aria-label','Kova agent');
      document.body.appendChild(v); v.addEventListener('click',onClick); v.addEventListener('keydown',function(e){ if(e.key==='Escape') close(); }); }
    O.panel=v; O.el.classList.add('open'); paint();
    requestAnimationFrame(function(){ v.classList.add('on'); });
  }
  function close(){
    if(O.embed){ if(chatOpen()) KovaChat.close(); return; }
    var v=O.panel; O.panel=null; if(O.el) O.el.classList.remove('open'); if(v){ v.classList.remove('on'); setTimeout(function(){ v.remove(); },220); } }

  var MET_COL={rhr:'#E8607A',hrv:'#E8607A',training:'#E87A3C',sleep:'#8FBEEA',bedtime:'#8FBEEA',food:'#D9B92E',hydration:'#D9B92E'};
  var ST_N={ok:'Fine',watch:'Watch',fix:'Fix',neglect:'No data'};
  function audit(){ return window.KovaAgent&&KovaAgent.audit?KovaAgent.audit():null; }
  function spark(pts,col){
    pts=(pts||[]).filter(function(x){ return x!=null&&isFinite(x); }); if(pts.length<2) return '';
    var mx=Math.max.apply(null,pts), mn=Math.min.apply(null,pts), r=(mx-mn)||1;
    var d=pts.map(function(v,i){ return (i?'L':'M')+(i/(pts.length-1)*100).toFixed(1)+' '+(26-((v-mn)/r)*22).toFixed(1); }).join(' ');
    return '<svg class="kop-sp" viewBox="0 0 100 30" preserveAspectRatio="none"><path d="'+d+'" style="stroke:'+col+'"/></svg>';
  }
  function row(m){
    var val=m.value, tgt=m.target!=null?m.target:(m.baseline!=null?m.baseline:null), col=MET_COL[m.id]||'#fff';
    var pct=(val!=null&&tgt)?Math.max(4,Math.min(100,Math.round(val/tgt*100))):0;
    var shown=val==null?'—':(m.id==='sleep'?Math.floor(val/60)+'h '+(val%60)+'m':(Math.round(val*10)/10));
    var ref=tgt==null?'':(m.id==='sleep'?' / '+Math.floor(tgt/60)+'h':(m.baseline!=null&&m.target==null?' vs '+Math.round(tgt*10)/10+' normal':' / '+tgt));
    return '<div class="kop-m '+esc(m.status)+'"><div class="kop-mh"><i style="background:'+col+'"></i><b>'+esc(m.name)+'</b><span class="kop-st">'+esc(ST_N[m.status]||'')+'</span></div>'
      +'<div class="kop-mv"><strong>'+esc(shown)+'</strong><small>'+esc((m.unit||'')+ref)+'</small></div>'
      +'<div class="kop-bar"><em style="width:'+pct+'%;background:'+col+'"></em></div>'
      +spark(m.series,col)
      +(m.flags&&m.flags[0]?'<div class="kop-f">'+esc(m.flags[0])+'</div>':'')+'</div>';
  }
  function sevenTab(){
    var a=audit(); if(!a) return '<div class="kop-empty">Loading your numbers…</div>';
    var groups=[['Vitals & workout',['rhr','hrv','training']],['Sleep',['sleep','bedtime']],['Fuel',['food','hydration']]];
    var fix=a.metrics.filter(function(m){ return m.status==='fix'; }).length;
    return '<div class="kop-sum"><b>'+(fix?fix+' to fix':'All steady')+'</b><span>'+esc(a.local.text)+' · '+esc(a.window)+' check</span></div>'
      +groups.map(function(g){ return '<div class="kop-g"><div class="kop-gh">'+g[0]+'</div>'+a.metrics.filter(function(m){ return g[1].indexOf(m.id)>=0; }).map(row).join('')+'</div>'; }).join('')
      +'<button class="kop-btn" data-o="check">Check now</button>';
  }
  function planTab(){
    var list=window.KovaAgent?KovaAgent._open():[];
    var W={morning:'Morning',evening:'Evening',night:'Night'};
    return ['morning','evening','night'].map(function(w){
      var it=list.filter(function(x){ return x.window===w; });
      return '<div class="kop-g"><div class="kop-gh">'+W[w]+'</div>'+(it.length?it.map(function(x){
        return '<div class="kop-a"><div><b>'+esc(x.title)+'</b><span>'+esc(x.wrong)+'</span><p>'+esc(x.action)+'</p></div>'
          +'<button class="kop-sm" data-o="done" data-id="'+esc(x.id)+'">Done</button></div>'; }).join(''):'<div class="kop-none">Nothing to fix.</div>')+'</div>';
    }).join('');
  }
  function doTab(){
    var d=O.draft, h='<div class="kop-g"><div class="kop-gh">Tell Kova a job</div>'
      +'<textarea id="kopAsk" class="kop-in" rows="3" placeholder="Email Sam that the March invoice is 10 days late&#10;Add a task: call the printer on Friday"></textarea>'
      +'<button class="kop-btn" data-o="ask">'+(O.busy?'Drafting…':'Draft it')+'</button>'
      +'<div class="kop-fine">Nothing is sent or saved until you approve it. Email goes through the Google account you connected in Work OS.</div>'
      +(window.KovaCrew?'<button class="kop-btn ghost" data-o="team">Bigger job? Give it to your AI team \u2192</button>':'')+'</div>';
    if(d&&d.type==='email') h+='<div class="kop-g kop-draft"><div class="kop-gh">Email draft</div>'
      +'<label>To<input class="kop-in" data-d="to" value="'+esc(d.to)+'"></label><label>Subject<input class="kop-in" data-d="subject" value="'+esc(d.subject)+'"></label>'
      +'<label>Message<textarea class="kop-in" data-d="body" rows="7">'+esc(d.body)+'</textarea></label>'
      +'<div class="kop-row"><button class="kop-btn" data-o="send">Approve and send</button><button class="kop-btn ghost" data-o="gdraft">Save to Gmail drafts</button><button class="kop-btn ghost" data-o="drop">Discard</button></div></div>';
    if(d&&d.type==='task') h+='<div class="kop-g kop-draft"><div class="kop-gh">New task</div>'
      +'<label>Task<input class="kop-in" data-d="name" value="'+esc(d.name)+'"></label><label>Due<input class="kop-in" data-d="due" value="'+esc(d.due||'')+'" placeholder="YYYY-MM-DD"></label>'
      +'<label>Notes<textarea class="kop-in" data-d="notes" rows="3">'+esc(d.notes||'')+'</textarea></label>'
      +'<div class="kop-row"><button class="kop-btn" data-o="addtask">Approve and add</button><button class="kop-btn ghost" data-o="drop">Discard</button></div></div>';
    if(d&&d.type==='answer') h+='<div class="kop-g"><div class="kop-gh">Kova</div><div class="kop-ans">'+esc(d.text)+'</div></div>';
    return h;
  }
  function paint(){
    var v=O.panel; if(!v) return;
    var keep=$('#kopAsk',v); var typed=keep?keep.value:'';
    if(O.embed){
      if(O.tab==='chat') return;
      v.innerHTML='<div class="kop-body">'+(O.tab==='plan'?planTab():(O.tab==='do'?doTab():sevenTab()))+'</div>';
      var k0=$('#kopAsk',v); if(k0&&typed) k0.value=typed;
      return;
    }
    v.innerHTML='<div class="kop-hd"><i class="ko-core sm"></i><b>Kova agent</b><button class="kop-x" data-o="close" aria-label="Close">×</button></div>'
      +'<div class="kop-tabs">'+[['seven','Your 7'],['plan','Plan'],['do','Do it for me']].map(function(t){ return '<button class="'+(O.tab===t[0]?'on':'')+'" data-t="'+t[0]+'">'+t[1]+'</button>'; }).join('')+'</div>'
      +'<div class="kop-body">'+(O.tab==='plan'?planTab():(O.tab==='do'?doTab():sevenTab()))+'</div>';
    var k=$('#kopAsk',v); if(k&&typed) k.value=typed;
  }
  function readDraft(){ $$('[data-d]').forEach(function(i){ O.draft[i.getAttribute('data-d')]=i.value; }); }
  function $$(s){ return Array.prototype.slice.call((O.panel||document).querySelectorAll(s)); }
  function api(path,body){
    if(!window.KovaLink||!KovaLink.authFetch) return Promise.reject(new Error('Connect the Kova server first.'));
    return KovaLink.authFetch(path,{json:body}).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error||('HTTP '+r.status)); return j; }); });
  }
  function onClick(e){
    var t=e.target.closest('[data-t]'); if(t){ O.tab=t.getAttribute('data-t'); paint(); return; }
    var b=e.target.closest('[data-o]'); if(!b) return;
    var o=b.getAttribute('data-o');
    if(o==='close') return close();
    if(o==='team'){ close(); if(window.go) setTimeout(function(){ go('workteam'); },60); return; }
    if(o==='check'){ if(window.KovaAgent) KovaAgent.check(); setTimeout(paint,600); return; }
    if(o==='done'){ if(window.KovaAgent) KovaAgent.markDone(b.getAttribute('data-id')); paint(); return; }
    if(o==='drop'){ O.draft=null; paint(); return; }
    if(o==='ask'){
      var q=($('#kopAsk',O.panel)||{}).value||''; if(!q.trim()||O.busy) return;
      O.busy=true; paint(); $('#kopAsk',O.panel).value=q;
      api('/assist',{text:q,tz:(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')}).then(function(j){ O.busy=false; O.draft=j; paint(); })
        .catch(function(err){ O.busy=false; O.draft=localGuess(q); paint(); if(!O.draft) say(err.message); });
      return;
    }
    if(o==='send'||o==='gdraft'){
      readDraft(); b.disabled=true;
      api('/assist/email',{to:O.draft.to,subject:O.draft.subject,body:O.draft.body,send:o==='send'}).then(function(){
        say(o==='send'?'Sent.':'Saved to your Gmail drafts.'); O.draft=null; paint();
      }).catch(function(err){ b.disabled=false; say(err.message); });
      return;
    }
    if(o==='addtask'){
      readDraft();
      try{
        var boards=(window.WorkOS&&WorkOS.list('boards'))||[];
        WorkOS.create('items',{name:O.draft.name,boardId:boards[0]?boards[0].id:'',status:'Not Started',priority:'Medium',due:O.draft.due||'',notes:O.draft.notes||'',checklist:[]},'ai');
        say('Task added to your Board.'); O.draft=null; paint();
      }catch(err){ say('Could not add the task here.'); }
    }
  }
  /* without the server a task can still be drafted from the words */
  function localGuess(q){
    if(/^\s*(add|create|make)\b.*\btask\b|remind me/i.test(q)) return {type:'task',name:q.replace(/^\s*(add|create|make)\s+(a\s+)?task:?\s*/i,'').trim(),due:'',notes:''};
    return null;
  }
  return {mount:mount,open:open,close:close,badge:badge,tab:setTab,_state:O};
})();

window.KovaAgent=(function(){
  'use strict';
  var W=window.KovaWellness;
  /* each alert wears the colour of the area it is about */
  var COL={rhr:'#E8607A',hrv:'#E8607A',training:'#E87A3C',sleep:'#8FBEEA',bedtime:'#8FBEEA',food:'#F4E18E',hydration:'#F4E18E'};
  var AREA={rhr:'vitals',hrv:'vitals',training:'move',sleep:'sleep',bedtime:'sleep',food:'fuel',hydration:'fuel'};
  var AREA_N={vitals:'Vitals',move:'Workout',sleep:'Sleep',fuel:'Fuel'};
  var WIN_N={morning:'Morning',evening:'Evening',night:'Night'};
  var LKEY='kova.agent.local', SKEY='kova.agent.snooze';
  var S={alerts:{},last:null,on:null,src:'',shown:'',busy:false,uid:null,ref:null};

  function $(s,r){ return (r||document).querySelector(s); }
  function esc(x){ return String(x==null?'':x).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function lsPut(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function tz(){ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'; }catch(e){ return 'UTC'; } }
  function colour(a){ return COL[a.metric]||'#FFFFFF'; }
  function toast(m){ try{ if(window.KovaToast) KovaToast(m); else if(window.KovaCanvas&&KovaCanvas.toast) KovaCanvas.toast(m); }catch(e){} }
  function api(path,opts){
    if(!window.KovaLink||!KovaLink.authFetch) return Promise.reject(new Error('offline'));
    return KovaLink.authFetch(path,opts).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error||('HTTP '+r.status)); return j; }); });
  }

  /* ---------------- on this device: the same seven checks ---------------- */
  function localData(){
    var get=function(k){ return lsJ(k,null); };
    var d={health:get('kova.health.v2')||{},sleeplog:get('kova_sleeplog_v1')||{},sessions:get('kova_log_v1')||[],
           profile:get('kova_profile_v2')||{},relay:{},days:{}};
    if(!(window.KovaMode&&KovaMode.live)) sample(d);
    try{ if(window.KovaCycle) d.cycle=KovaCycle._data(); }catch(e){}
    return d;
  }
  /* sample mode (the preview): the same week the demo screens show, so the
     pop-up says what the screens say - 5h 20m nights, HRV 38, 1.4 L */
  function sample(d){
    var DAY=864e5, now=Date.now(), key=function(t){ var x=new Date(t); return x.getFullYear()+'-'+('0'+(x.getMonth()+1)).slice(-2)+'-'+('0'+x.getDate()).slice(-2); };
    if(!(d.health.f&&d.health.f.hr)) d.health={ts:now-2*3600e3,f:{hr:68,hrv:38,rhr_base:61,hrv_base:47}};
    if(!Object.keys(d.sleeplog).length){
      var wk=window.KOVA_WEEK||[], mins=[340,355,300,330,320,345,320], beds=['12:15 a','11:20 p','12:40 a','11:55 p','12:07 a','1:10 a','12:30 a'];
      for(var i=6;i>=0;i--){ var n=wk[6-i]; d.sleeplog[key(now-i*DAY)]={mins:n&&n.deep?n.deep+n.rem+n.light:mins[i],bed:(n&&n.bed)||beds[i]}; }
    }
    if(!(d.sessions||[]).filter(function(x){ return x&&!x.seed&&x.t>now-28*DAY; }).length) d.sessions=[{t:now-2*DAY,vol:9800},{t:now-4*DAY,vol:11200},{t:now-9*DAY,vol:10400}];
    var fl=(d.profile.foodlog||[]).filter(function(e){ return e&&e.src!=='seed'&&e.at>now-3*DAY; });
    if(!fl.length) d.profile=Object.assign({},d.profile,{foodlog:[{at:now-2*DAY,p:92,kcal:2100},{at:now-DAY,p:84,kcal:1950},{at:now-4*3600e3,p:38,kcal:640}]});
    if(!d.profile.water) d.profile=Object.assign({},d.profile,{water:{l:1.4,day:key(now)}});
    if(!(d.profile.quiz&&d.profile.quiz.bw)) d.profile=Object.assign({},d.profile,{quiz:Object.assign({bw:185},d.profile.quiz||{})});
  }
  function localRun(win){
    if(!W) return null;
    var t=Date.now(), z=tz(), audit=W.metrics(localData(),t,z);
    if(win) audit.window=win;
    var rules=W.rulesAlerts(audit), day=W.dayOf(t,z), mine=lsJ(LKEY,{alerts:{}}), out={};
    rules.forEach(function(a){
      var id=day+'_'+a.metric, prev=(mine.alerts||{})[id];
      if(prev&&prev.state==='done') { out[id]=prev; return; }
      out[id]=Object.assign({id:id,at:t,day:day,state:prev&&prev.state==='seen'&&prev.action===a.action?'seen':'new'},a);
    });
    Object.keys(mine.alerts||{}).forEach(function(k){ if(!out[k]&&k.indexOf(day)===0&&mine.alerts[k].state==='done') out[k]=mine.alerts[k]; });
    var rec={alerts:out,last:{at:t,window:audit.window,local:audit.local.text,source:'rules',summary:summary(audit),
      findings:audit.metrics.map(function(m){ return {metric:m.id,status:m.status,note:m.flags[0]||''}; })}};
    lsPut(LKEY,rec);
    return rec;
  }
  function summary(audit){
    var bad=audit.metrics.filter(function(m){ return m.status==='fix'; }).map(function(m){ return m.name.toLowerCase(); });
    var miss=audit.metrics.filter(function(m){ return m.status==='neglect'; }).map(function(m){ return m.name.toLowerCase(); });
    if(!bad.length&&!miss.length) return 'All seven look fine right now.';
    return (bad.length?'Fix: '+bad.join(', ')+'. ':'')+(miss.length?'No recent data: '+miss.join(', ')+'.':'');
  }
  function useLocal(){
    var rec=localRun(); if(!rec) return;
    S.alerts=rec.alerts; S.last=rec.last; S.src='here'; paint();
  }

  /* ---------------- live: listen to the server's agent ---------------- */
  function listen(user){
    if(S.ref){ try{ S.ref.off(); }catch(e){} S.ref=null; }
    var fb=window.KOVA_FB;
    if(!user||!fb||!fb.db) return;
    S.uid=user.uid;
    S.ref=fb.db.ref('users/'+user.uid+'/agent');
    S.ref.on('value',function(snap){
      var v=snap.val()||{};
      var fresh=v.last&&v.last.at>Date.now()-12*3600e3;
      if(!fresh) return useLocal();                      /* nothing recent from the server yet */
      S.alerts=v.alerts||{}; S.last=v.last; S.src='live'; S.busy=false; paint();
    },function(){ useLocal(); });
    /* the daily checks are switched on once, with this device's time zone */
    if(!lsJ('kova.agent.enrolled',false)) api('/agent/settings',{json:{on:true,tz:tz()}}).then(function(){ lsPut('kova.agent.enrolled',true); S.on=true; }).catch(function(){});
    else api('/agent').then(function(j){ S.on=!!j.on; }).catch(function(){});
  }

  /* ---------------- the pop-up ---------------- */
  var RANK={urgent:0,soon:1,fyi:2};
  function open(){
    var sn=lsJ(SKEY,{}), t=Date.now();
    return Object.keys(S.alerts||{}).map(function(k){ return S.alerts[k]; })
      .filter(function(a){ return a&&a.state!=='done'&&!(sn[a.id]>t); })
      .sort(function(a,b){ return (RANK[a.severity]-RANK[b.severity])||((b.at||0)-(a.at||0)); });
  }
  function clearScreen(){
    if(window.KovaTour&&KovaTour.active()) return false;
    var app=document.getElementById('app'); if(app&&app.classList.contains('auth-locked')) return false;
    if($('#ksSheet')||$('#kgPlan')) return false;
    if(!document.elementFromPoint) return true;
    var hit=document.elementFromPoint(window.innerWidth/2,window.innerHeight/2);
    return !!(hit&&hit.closest&&(hit.closest('.screen.on')||hit.closest('#kgPop')));
  }
  function when(a){
    var now=W?W.windowOf(new Date().getHours()*60+new Date().getMinutes()):'';
    if(a.window===now) return 'Now';
    return a.window==='night'?'Tonight':(a.window==='morning'?'Tomorrow morning':'This evening');
  }
  /* the card on the current screen an alert is about, so the helper can point at it */
  var CARD={
    home:{vitals:'#s-home .card[data-go="vitals"]',move:'#s-home .card[data-go="move"]',sleep:'#s-home .card[data-go="sleep"]',fuel:'#s-home .card[data-go="fuel"]'},
    vitals:{vitals:'#s-vitals .card.card-lg'}, move:{move:'#s-move .card.card-lg'}, sleep:{sleep:'#s-sleep .card.card-lg'}, fuel:{fuel:'#s-fuel .card.card-lg'}
  };
  function onScreen(){ var s=document.querySelector('.screen.on'); return s?s.id.replace(/^s-/,''):''; }
  function targetFor(a){
    var area=AREA[a.metric], scr=onScreen(), sel=(CARD[scr]||{})[area];
    var el=sel&&document.querySelector(sel);
    if(el&&el.getClientRects().length) return el;
    var rn=document.querySelector('.rail .rnav[data-go="'+area+'"]');
    return rn&&rn.getClientRects().length?rn:null;
  }
  function bubble(a,i,n){
    return '<div class="kg-top"><span class="kg-dot '+esc(a.severity)+'"></span><span>'+esc(a.category||'Kova')+'</span>'
        +(n>1?'<span class="kg-n">'+(i+1)+' of '+n+'</span>':'')+'<button class="kg-x" data-g="later" aria-label="Later">×</button></div>'
      +'<div class="kg-t">'+esc(a.title)+'</div>'
      +'<div class="kg-w">'+esc(a.wrong)+'</div>'
      +'<div class="kg-do"><span class="kg-when">'+esc(when(a))+' · '+esc(WIN_N[a.window]||'')+'</span>'+esc(a.action)+'</div>'
      +'<div class="kg-b"><button class="kg-btn main" data-g="done">Done</button>'
        +'<button class="kg-btn" data-g="go">Open '+esc(AREA_N[AREA[a.metric]]||'')+'</button>'
        +'<button class="kg-btn" data-g="plan">Plan</button>'
        +(n>1?'<button class="kg-btn ic" data-g="next" aria-label="Next">›</button>':'')+'</div>';
  }
  function paint(){
    paintStrip();
    var all=open();
    /* no pop-ups: the orb glows and counts; tap it to see */
    if(window.KovaOrb) KovaOrb.badge(all.length, all.some(function(a){ return a.severity==='urgent'&&a.state==='new'; }));
  }
  function ask(){ if(window.KovaOrb) KovaOrb.open('plan'); }
  /* the numbers behind the seven, for the orb's charts */
  function audit(){
    if(!W) return null;
    var d=localData(), a=W.metrics(d,Date.now(),tz());
    var nights=Object.keys(d.sleeplog||{}).sort().slice(-7).map(function(k){ return +d.sleeplog[k].mins||null; });
    var day=864e5, sess=[0,1,2,3,4,5,6].map(function(i){ var t0=Date.now()-(7-i)*day; return (d.sessions||[]).filter(function(x){ return x&&x.t>=t0&&x.t<t0+day; }).length; });
    a.metrics.forEach(function(m){ if(m.id==='sleep'||m.id==='bedtime') m.series=nights; if(m.id==='training') m.series=sess; });
    return a;
  }
  function markDone(id){ mark(id,'done'); paint(); }
  function mark(id,state){
    var a=S.alerts[id]; if(!a) return;
    a.state=state;
    if(S.src==='live') api('/agent/alerts/'+encodeURIComponent(id),{json:{state:state}}).catch(function(){ toast('Saved here - it syncs when the server is back.'); });
    else { var rec=lsJ(LKEY,{alerts:{}}); if(rec.alerts[id]) rec.alerts[id].state=state; lsPut(LKEY,rec); }
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-g]'); if(!b) return;
    var g=b.getAttribute('data-g'), pop=$('#kgPop'), id=pop&&pop.dataset.id, a=id&&S.alerts[id];
    var hush=function(){ S.asked=false; if(pop) pop.remove(); };
    if(g==='done'&&a){ mark(id,'done'); toast('Nice. Ticked off.'); S.i=0; hush(); setTimeout(paint,700); if($('#kgPlan')) plan(); }
    else if(g==='later'){ if(a){ var sn=lsJ(SKEY,{}); sn[id]=Date.now()+2*3600e3; lsPut(SKEY,sn); mark(id,'seen'); } S.i=0; hush(); }
    else if(g==='next'){ S.i=(S.i||0)+1; if(S.i>=open().filter(function(x){ return x.state==='new'&&x.severity!=='fyi'; }).length) S.i=0; hush(); setTimeout(paint,350); }
    else if(g==='go'&&a){ mark(id,'seen'); hush(); if(typeof window.go==='function') window.go(AREA[a.metric]); }
    else if(g==='plan'){ plan(); }
    else if(g==='pdone'){ mark(b.getAttribute('data-id'),'done'); plan(); paint(); }
    else if(g==='check'){ checkNow(); }
    else if(g==='toggle'){ toggle(); }
    else if(g==='close'){ var p=$('#kgPlan'); if(p) p.remove(); paint(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  },true);

  /* ---------------- Your plan: morning / evening / night ---------------- */
  function plan(){
    var v=$('#kgPlan');
    if(!v){ v=document.createElement('div'); v.id='kgPlan'; v.className='kg-veil'; document.body.appendChild(v);
      v.addEventListener('click',function(e){ if(e.target===v){ v.remove(); paint(); } }); }
    S.asked=false; if(window.KovaOrb) KovaOrb.close();
    var list=open(), last=S.last||{};
    var groups=['morning','evening','night'].map(function(w){
      var items=list.filter(function(a){ return a.window===w; });
      return '<div class="kg-g"><div class="kg-gh">'+WIN_N[w]+'<span>'+(items.length||'')+'</span></div>'
        +(items.length?items.map(function(a){
          return '<div class="kg-item" style="--kc:'+colour(a)+'"><div class="kg-it"><span class="kg-dot '+esc(a.severity)+'"></span>'+esc(a.title)+'</div>'
            +'<div class="kg-iw">'+esc(a.wrong)+'</div><div class="kg-ia">'+esc(a.action)+'</div>'
            +'<button class="kg-btn sm" data-g="pdone" data-id="'+esc(a.id)+'">Done</button></div>';
        }).join(''):'<div class="kg-none">Nothing to fix here.</div>')+'</div>';
    }).join('');
    var F=(last.findings||[]), ST={ok:'Fine',watch:'Watch',fix:'Fix',neglect:'No data'};
    var names=W?W.METRICS:[];
    var finds=names.map(function(m){ var f=F.filter(function(x){ return x.metric===m.id; })[0]||{};
      return '<div class="kg-f '+esc(f.status||'')+'"><b>'+esc(m.n)+'</b><span>'+esc(ST[f.status]||'—')+'</span></div>'; }).join('');
    v.innerHTML='<div class="kg-card" role="dialog" aria-label="Your plan"><div class="kg-ph"><div><div class="kg-pt">Your plan</div>'
        +'<div class="kg-ps">'+esc(last.summary||'Kova checks your seven metrics morning, evening and night.')+'</div>'
        +'<div class="kg-pm">'+(last.at?'Checked '+esc(last.local||new Date(last.at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}))+' · '+(last.source==='agent'?'Claude agent':(S.src==='live'?'server rules':'on this device')):'Not checked yet')+'</div></div>'
        +'<button class="kg-x" data-g="close" aria-label="Close">×</button></div>'
      +groups
      +'<div class="kg-gh" style="margin-top:6px">The seven checks</div><div class="kg-fs">'+finds+'</div>'
      +'<div class="kg-b"><button class="kg-btn main" data-g="check">'+(S.busy?'Checking…':'Check now')+'</button>'
        +'<button class="kg-btn" data-g="toggle">'+(S.on===false?'Turn on daily checks':'Daily checks: on')+'</button></div>'
      +'<div class="kg-fine">Daily checks run at 7:30, 17:30 and 21:30 your time. Kova is not a doctor - if something feels wrong, see one.</div></div>';
  }
  function checkNow(){
    if(S.busy) return;
    var live=window.KovaMode&&KovaMode.live;
    if(!live) { useLocal(); toast('Checked on this device.'); if($('#kgPlan')) plan(); return; }
    S.busy=true; if($('#kgPlan')) plan();
    api('/agent/run',{json:{tz:tz()}}).then(function(){
      toast('The agent is checking your seven metrics…');
      setTimeout(function(){ if(S.busy){ S.busy=false; if($('#kgPlan')) plan(); } },120e3);
    }).catch(function(e){
      S.busy=false; useLocal();
      toast(/already running/i.test(e.message)?'A check is already running.':'Server not reachable - checked on this device instead.');
      if($('#kgPlan')) plan();
    });
  }
  function toggle(){
    var on=S.on===false;
    api('/agent/settings',{json:{on:on,tz:tz()}}).then(function(){ S.on=on; toast(on?'Daily checks on.':'Daily checks off.'); if($('#kgPlan')) plan(); })
      .catch(function(){ toast('Sign in and connect the server to schedule checks.'); });
  }

  /* ---------------- the line under Home's morning brief ---------------- */
  function paintStrip(){
    var brief=$('#s-home .card.kova'); if(!brief) return;
    var s=$('#kgStrip');
    var n=open().length;
    if(!s){ s=document.createElement('button'); s.id='kgStrip'; s.className='kg-strip'; s.setAttribute('data-g','plan'); brief.parentNode.insertBefore(s,brief.nextSibling); }
    s.innerHTML='<span class="kg-dot '+(n?'urgent':'ok')+'"></span>'+(n?n+' thing'+(n>1?'s':'')+' to fix today':'All seven checks look fine')+'<span class="kg-go">Your plan ›</span>';
  }

  /* ---------------- start ---------------- */
  function start(){
    if(window.KovaOrb) KovaOrb.mount();
    var fb=window.KOVA_FB;
    if(fb&&fb.auth) fb.auth.onAuthStateChanged(function(u){ if(u&&window.KovaMode&&KovaMode.live) listen(u); else useLocal(); });
    else useLocal();
    /* the windows move on while the app stays open */
    var lastWin=W?W.windowOf(new Date().getHours()*60+new Date().getMinutes()):'';
    setInterval(function(){
      var w=W?W.windowOf(new Date().getHours()*60+new Date().getMinutes()):'';
      if(w!==lastWin){ lastWin=w; if(S.src!=='live') useLocal(); }
      paint();
    },5*60e3);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,1500); }); else setTimeout(start,1500);
  return {plan:plan,check:checkNow,run:useLocal,ask:ask,audit:audit,markDone:markDone,_state:S,_paint:paint,_open:open};
})();
