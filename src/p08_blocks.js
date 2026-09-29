/* =====================================================================
   KovaBlocks - Work OS built for one person: plan my day (p11).

   "Plan my day" (Work > Today) turns today's tasks into time blocks
   that fit your body:
     - the heaviest thinking goes in your sharpest window, about 2-4
       hours after you wake (from last night's sleep);
     - the second, smaller peak late in the afternoon takes normal work;
     - light work (email, admin) goes in the post-lunch dip;
     - when readiness is low, deep work is capped at one 45-minute
       block and the rest moves to tomorrow;
     - every block says why it sits where it does.
   With Google connected, the blocks go onto your calendar and anything
   you drag there comes back (functions/calendar.js); your meetings come
   back as busy time, so no block lands on one.
   ===================================================================== */
window.KovaBlocks=(function(){
  'use strict';
  var KEY='kova_blocks_v1', MIN=60000;
  var S=lsJ(KEY,{day:'',blocks:[],synced:0,pinned:{}});
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function day0(t){ var d=new Date(t||Date.now()); d.setHours(0,0,0,0); return d.getTime(); }
  function dk(t){ var d=new Date(t||Date.now()); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function hhmm(t){ var d=new Date(t), h=d.getHours(), m=d.getMinutes(), ap=h<12?'am':'pm'; h=h%12||12; return h+(m?':'+('0'+m).slice(-2):'')+' '+ap; }

  /* ---------------- the plan ---------------- */
  function inputs(t){
    t=t||Date.now();
    var R=window.KovaToday?KovaToday.readiness():{score:null,sleep:{}};
    var wake=R.sleep&&R.sleep.wake!=null?R.sleep.wake:7*60;          /* minutes after midnight */
    var W=window.WorkOS, tasks=[];
    try{ tasks=(W.overdue()||[]).map(function(i){ return {i:i,od:true}; }).concat((W.dueToday()||[]).map(function(i){ return {i:i,od:false}; })); }catch(e){}
    var cog=function(i){ return window.KovaCog?KovaCog.of(i):5; };
    tasks=tasks.map(function(x){ var c=cog(x.i); return {id:String(x.i.id||x.i.name),name:x.i.name||'Task',od:x.od,cog:c,band:c>=7?'deep':(c>=4?'normal':'light')}; });
    return {t:t,score:R.score,wake:wake,tasks:tasks,busy:(S.busy||[]).filter(function(b){ return b.end>day0(t)&&b.start<day0(t)+864e5; })};
  }
  function windows(I){
    var base=day0(I.t), w=I.wake;
    var peak=[w+120,w+240], dip=[13*60,15*60], second=[Math.max(15*60,w+480),Math.max(17*60,w+600)];
    return [{k:'peak',from:base+peak[0]*MIN,to:base+peak[1]*MIN,why:'your sharpest window, 2–4 hours after you woke'},
            {k:'second',from:base+second[0]*MIN,to:base+second[1]*MIN,why:'the smaller second peak late in the day'},
            {k:'dip',from:base+dip[0]*MIN,to:base+dip[1]*MIN,why:'the after-lunch dip, when focus is lowest'}];
  }
  /* first free slot of `len` inside [from,to), avoiding busy and planned */
  function fit(from,to,len,taken,now){
    var t=Math.max(from,Math.ceil((now||Date.now())/(5*MIN))*5*MIN);
    while(t+len<=to){
      var clash=taken.filter(function(b){ return t<b.end&&t+len>b.start; })[0];
      if(!clash) return t;
      t=clash.end+5*MIN;
    }
    return null;
  }
  function plan(t){
    var I=inputs(t), W=windows(I), low=I.score!=null&&I.score<50, good=I.score!=null&&I.score>=75;
    var taken=I.busy.slice(), blocks=[], later=[];
    var order=I.tasks.slice().sort(function(a,b){ if(a.od!==b.od) return a.od?-1:1; return b.cog-a.cog; });
    var deepUsed=0;
    order.forEach(function(x){
      var pin=S.pinned&&S.pinned[x.id];
      if(pin&&pin.start>=day0(I.t)&&pin.start<day0(I.t)+864e5){ blocks.push({id:'b-'+x.id,taskId:x.id,title:x.name,start:pin.start,end:pin.end,kind:x.band,why:'You moved this one; it stays where you put it.'}); taken.push(pin); return; }
      var len=(x.band==='deep'?(good?90:low?45:60):x.band==='normal'?45:30)*MIN;
      var pref=x.band==='deep'?['peak','second']:x.band==='normal'?['second','peak','dip']:['dip','second'];
      if(x.band==='deep'&&low&&deepUsed>=1){ later.push({name:x.name,why:'Readiness is '+I.score+' today: one deep block is enough. This moves to tomorrow morning.'}); return; }
      var placed=null;
      for(var i=0;i<pref.length&&!placed;i++){
        var w=W.filter(function(v){ return v.k===pref[i]; })[0], at=fit(w.from,w.to,len,taken,I.t);
        if(at!=null) placed={w:w,at:at};
      }
      if(!placed){ later.push({name:x.name,why:'No free slot left today around your meetings.'}); return; }
      var why=(x.band==='deep'?'Heavy thinking':x.band==='normal'?'Steady work':'Light work')+' in '+placed.w.why+(low&&x.band==='deep'?'; kept to 45 minutes because readiness is '+I.score+'.':good&&x.band==='deep'?'; readiness is '+I.score+', so it gets 90 minutes.':'.')+(x.od?' It is overdue, so it goes first.':'');
      var b={id:'b-'+x.id,taskId:x.id,title:x.name,start:placed.at,end:placed.at+len,kind:x.band,why:why};
      blocks.push(b); taken.push(b); if(x.band==='deep') deepUsed++;
    });
    blocks.sort(function(a,b){ return a.start-b.start; });
    S.day=dk(I.t); S.blocks=blocks; S.later=later; save();
    return {blocks:blocks,later:later,score:I.score,wake:I.wake};
  }

  /* ---------------- calendar, both ways ---------------- */
  function sync(){
    if(!window.KovaLink) return Promise.reject(new Error('The Kova server is not available.'));
    var from=day0(), to=from+864e5;
    return KovaLink.authFetch('/calendar/sync',{json:{blocks:S.blocks.map(function(b){ return {id:b.id,title:b.title,start:b.start,end:b.end,why:b.why}; }),from:from,to:to}}).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok) throw new Error(r.status===409?'Connect Google first (Work > Integrations).':(j.error||'Calendar sync failed.'));
        S.busy=j.busy||[]; S.synced=Date.now(); S.pinned=S.pinned||{};
        (j.moved||[]).forEach(function(m){ var b=S.blocks.filter(function(x){ return x.id===m.id; })[0]; if(b){ S.pinned[b.taskId]={start:m.start,end:m.end}; b.start=m.start; b.end=m.end; b.why='You moved this one; it stays where you put it.'; } });
        save();
        try{ if(window.KovaAnalytics) KovaAnalytics.track('calendar_sync',{count:(j.created||0)+(j.updated||0)}); }catch(e){}
        return j;
      });
    },function(){ throw new Error('The Kova server could not be reached.'); });
  }

  /* ---------------- the sheet ---------------- */
  function open(){
    if(!window.openSheet) return;
    var P=plan();
    var linked=!!(window.KovaLink&&KovaLink.linked&&KovaLink.linked('google'));
    openSheet('<div class="grab"></div><div class="kbk">'
      +'<div class="title-s" style="font-size:19px">Your day, blocked</div>'
      +'<div class="sub" style="line-height:1.5;margin:3px 0 12px">'+(P.score!=null?'Readiness '+P.score+'. ':'')+'Deep work goes where your focus peaks; light work fills the dip.</div>'
      +(P.blocks.length?P.blocks.map(function(b){
        return '<div class="kbk-b '+b.kind+'"><div class="kbk-t">'+hhmm(b.start)+'<span>'+Math.round((b.end-b.start)/MIN)+' min</span></div>'
          +'<div class="kbk-m"><b>'+esc(b.title)+'</b><small>'+esc(b.why)+'</small></div></div>';
      }).join(''):'<div class="sub">No tasks are due today. Your sharpest window is free for your own work.</div>')
      +((P.later||[]).length?'<div class="lbl" style="margin:12px 0 6px">MOVED</div>'+P.later.map(function(l){ return '<div class="kbk-l"><b>'+esc(l.name)+'</b> — '+esc(l.why)+'</div>'; }).join(''):'')
      +(P.blocks.length?'<button class="btn" data-kb="sync" style="margin-top:14px">'+(linked?'Put these on my Google Calendar':'Connect Google Calendar')+'</button>':'')
      +'<div class="kbk-msg" id="kbkMsg" role="status"></div></div>');
    var el=document.querySelector('#sheetIn .kbk');
    if(el) el.addEventListener('click',function(ev){
      var b=ev.target.closest('[data-kb="sync"]'); if(!b) return;
      if(!linked){ if(window.closeSheet) closeSheet(); try{ go('workintegrations'); }catch(e){} return; }
      var m=document.getElementById('kbkMsg'); m.textContent='Syncing…';
      sync().then(function(j){ m.textContent=(j.created||0)+' added, '+(j.updated||0)+' updated'+((j.moved||[]).length?', '+j.moved.length+' you moved kept':'')+'. Meetings are respected.'; },function(e){ m.textContent=e.message; });
    });
  }
  function mount(){
    var s=document.getElementById('s-worktoday'); if(!s||document.getElementById('kbPlan')) return;
    var hd=s.querySelector('.hdr'); if(!hd) return;
    var r=document.createElement('div'); r.className='hdr-r';
    r.innerHTML='<button class="chip kbk-go" id="kbPlan" type="button">Plan my day</button>';
    hd.appendChild(r);
    document.getElementById('kbPlan').addEventListener('click',open);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else setTimeout(mount,0);

  return {plan:plan,sync:sync,open:open,windows:windows,inputs:inputs,_S:function(){ return S; },_set:function(s){ S=s; save(); }};
})();
