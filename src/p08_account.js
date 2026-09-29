/* =====================================================================
   KovaPrivacy - export, delete, the privacy policy, and "what Kova reads
   and why" (p11).

   Settings > Data & privacy gets four real rows in place of the old
   "Delete all data" placeholder:
     - Export my data: one JSON file with everything on this phone
       (every kova* key) plus everything the server holds about you
       (GET /api/account/export - no tokens in it);
     - What Kova reads and why: every health type, where it goes, what
       never happens to it;
     - Privacy policy: privacy.html, shown in the app;
     - Delete my account: two steps (what goes, then type DELETE), then
       POST /api/account/delete removes the server side - synced data,
       files, connected accounts, reminders, the sign-in itself - and
       only once that worked is this phone cleared and Kova returns to
       the welcome screen. If the server cannot be reached nothing is
       cleared, so it can be tried again.

   explainHealth() is shown before the Apple Health / Health Connect
   permission prompt (KovaNative.connect calls it), so the system dialog
   never arrives without the reason.
   ===================================================================== */
window.KovaPrivacy=(function(){
  'use strict';
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function fbUser(){ try{ return window.KOVA_FB&&KOVA_FB.auth&&KOVA_FB.auth.currentUser||null; }catch(e){ return null; } }
  function sheet(h){ if(window.openSheet){ openSheet('<div class="grab"></div><div class="kpv">'+h+'</div>'); return document.querySelector('#sheetIn .kpv'); } return null; }
  function close(){ if(window.closeSheet) closeSheet(); }

  /* what the app reads, in plain words; the list follows KovaNative.READ */
  var READS=[
    ['Sleep and sleep stages','Your sleep score, sleep debt, bedtime advice and the "how it connects" cards.'],
    ['Heart rate variability (HRV)','Readiness and recovery: how rested your nervous system is against your own baseline.'],
    ['Resting heart rate','Readiness, and an early warning when it runs high for several days.'],
    ['Heart rate','Live heart-rate zones during a workout.'],
    ['Steps, distance, active energy, exercise minutes','Daily activity and how much food your day actually needs.'],
    ['Blood oxygen and breathing rate','Sleep quality and recovery checks.'],
    ['VO₂ max','Your fitness trend and healthspan view.'],
    ['Weight','Protein and calorie targets, and your weight trend.'],
    ['Wrist temperature','Cycle view (optional): a retrospective ovulation estimate, and illness early warning.']
  ];

  function readsHTML(forPrompt){
    return '<div class="title-s" style="font-size:19px;margin-bottom:4px">'+(forPrompt?'Before you connect':'What Kova reads and why')+'</div>'
      +'<div class="sub" style="line-height:1.55;margin-bottom:12px">Kova only <b>reads</b>. It never writes to Apple Health or Health Connect. You choose each type on the next screen and can turn any of them off later in the Health app.</div>'
      +'<div class="kpv-list">'+READS.map(function(r){ return '<div class="kpv-row"><b>'+esc(r[0])+'</b><span>'+esc(r[1])+'</span></div>'; }).join('')+'</div>'
      +'<div class="card kpv-never"><b>What never happens to it</b><ul>'
      +'<li>It is not sold, and not used for ads.</li>'
      +'<li>It is not sent to analytics. Usage events never carry a health number.</li>'
      +'<li>It stays on this phone, plus your own synced copy if you sign in.</li>'
      +'<li>When you use the chat or AI team, only what that answer needs is sent to write it.</li>'
      +'</ul><div class="sub" style="margin-top:6px">Delete it all any time: Settings → Data &amp; privacy.</div></div>';
  }

  /* shown before the system permission dialog; resolves true to go ahead */
  function explainHealth(){
    return new Promise(function(done){
      var nm=(window.KovaNative&&KovaNative.platform&&KovaNative.platform()==='android')?'Health Connect':'Apple Health';
      var el=sheet(readsHTML(true)
        +'<button class="btn" data-kp="go" style="margin-top:14px">Continue to '+esc(nm)+'</button>'
        +'<button class="btn ghost" data-kp="no" style="margin-top:8px">Not now</button>');
      if(!el){ done(true); return; }
      var answered=false;
      function fin(v){ if(answered) return; answered=true; close(); done(v); }
      el.addEventListener('click',function(ev){
        var b=ev.target.closest('[data-kp]'); if(!b) return;
        fin(b.getAttribute('data-kp')==='go');
      });
      /* tapping outside the sheet is "not now" */
      var sh=document.getElementById('sheet');
      if(sh) sh.addEventListener('click',function out(ev){ if(ev.target===sh){ sh.removeEventListener('click',out); fin(false); } });
    });
  }

  function openReads(){ sheet(readsHTML(false)+'<button class="btn ghost" data-kp="x" style="margin-top:14px">Close</button>'); wireClose(); }
  function wireClose(){ var el=document.querySelector('#sheetIn .kpv'); if(el) el.addEventListener('click',function(ev){ if(ev.target.closest('[data-kp="x"]')) close(); }); }

  /* the policy is privacy.html; shown here so it works inside the app too */
  function openPolicy(){
    var el=sheet('<div class="sub">Loading the privacy policy…</div>');
    fetch('privacy.html',{cache:'no-cache'}).then(function(r){ if(!r.ok) throw 0; return r.text(); }).then(function(t){
      var m=/<main[^>]*>([\s\S]*?)<\/main>/i.exec(t);
      if(!m||!el) throw 0;
      el.innerHTML='<div class="kpv-doc">'+m[1].replace(/<script[\s\S]*?<\/script>/gi,'')+'</div>'
        +'<button class="btn ghost" data-kp="x" style="margin-top:14px">Close</button>';
      wireClose();
    }).catch(function(){
      if(el) el.innerHTML='<div class="title-s" style="font-size:19px">Privacy policy</div><div class="sub" style="margin:8px 0 12px">It could not be loaded right now. It is also at <b>/privacy</b> on the Kova website.</div>'
        +readsHTML(false)+'<button class="btn ghost" data-kp="x" style="margin-top:14px">Close</button>';
      wireClose();
    });
  }

  /* ---------------- export ---------------- */
  function localData(){
    var keys={};
    try{
      for(var i=0;i<localStorage.length;i++){
        var k=localStorage.key(i);
        if(k&&k.indexOf('kova')===0){ var v=localStorage.getItem(k); try{ keys[k]=JSON.parse(v); }catch(e){ keys[k]=v; } }
      }
    }catch(e){}
    return keys;
  }
  function download(obj,name){
    var blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); },4000);
  }
  function exportAll(){
    var pkg={app:'kova',kind:'export',v:1,exportedAt:new Date().toISOString(),onThisDevice:localData(),server:null};
    var name='kova-export-'+pkg.exportedAt.slice(0,10)+'.json';
    say('Gathering your data…');
    var srv=(fbUser()&&window.KovaLink)
      ? KovaLink.authFetch('/account/export').then(function(r){ return r.ok?r.json():r.json().then(function(j){ return {error:j.error||('HTTP '+r.status)}; },function(){ return {error:'HTTP '+r.status}; }); })
          .catch(function(){ return {error:'The Kova server could not be reached; this file has what is on this phone.'}; })
      : Promise.resolve({note:'Not signed in: nothing is stored on the server.'});
    return srv.then(function(s){
      pkg.server=s;
      download(pkg,name);
      say(s&&s.error?'Saved what is on this phone. The server part failed.':'Saved '+name+'.');
      try{ if(window.KovaAnalytics) KovaAnalytics.track('data_export',{result:s&&s.error?'local_only':'full'}); }catch(e){}
      return pkg;
    });
  }

  /* ---------------- delete ---------------- */
  function clearDevice(){
    try{ localStorage.clear(); }catch(e){}
    try{ sessionStorage.clear(); }catch(e){}
    var jobs=[];
    try{
      if(window.indexedDB&&indexedDB.databases) jobs.push(indexedDB.databases().then(function(list){
        return Promise.all((list||[]).map(function(d){ return new Promise(function(r){ try{ var q=indexedDB.deleteDatabase(d.name); q.onsuccess=q.onerror=q.onblocked=function(){ r(); }; }catch(e){ r(); } }); }));
      }).catch(function(){}));
    }catch(e){}
    return Promise.all(jobs);
  }
  function startDelete(){
    var u=fbUser(), cloud=!!u;
    var el=sheet('<div class="title-s" style="font-size:19px;color:var(--bad)">Delete my account</div>'
      +'<div class="sub" style="line-height:1.55;margin:6px 0 12px">This removes, for good:</div>'
      +'<div class="kpv-list">'
      +(cloud?'<div class="kpv-row"><b>Your Kova account</b><span>'+esc(u.email||'This guest account')+' and the sign-in itself.</span></div>'
        +'<div class="kpv-row"><b>Everything synced</b><span>Meals, workouts, sleep, vitals, cycle, Work OS, AI team, chat history.</span></div>'
        +'<div class="kpv-row"><b>Your files</b><span>Food photos, form-check videos, uploads.</span></div>'
        +'<div class="kpv-row"><b>Connected accounts</b><span>Google, Instagram, TikTok and the rest are disconnected and their access is revoked.</span></div>'
        +'<div class="kpv-row"><b>Reminders and posts</b><span>Push reminders, scheduled posts, health sync address.</span></div>'
        :'<div class="kpv-row"><b>Everything on this phone</b><span>You are not signed in, so nothing is stored on a server.</span></div>')
      +'</div>'
      +'<div class="sub" style="margin:10px 0 0">A subscription is billed by Apple, Google or Stripe; cancel it there too (Settings → Your plan → Manage).</div>'
      +'<button class="btn" data-kp="export" style="margin-top:14px">Export my data first</button>'
      +'<button class="btn ghost kpv-danger" data-kp="next" style="margin-top:8px">Continue</button>'
      +'<button class="btn ghost" data-kp="x" style="margin-top:8px">Cancel</button>');
    if(!el) return;
    el.addEventListener('click',function(ev){
      var b=ev.target.closest('[data-kp]'); if(!b) return;
      var k=b.getAttribute('data-kp');
      if(k==='x') close();
      else if(k==='export') exportAll();
      else if(k==='next') confirmStep(cloud);
    });
  }
  function confirmStep(cloud){
    var el=sheet('<div class="title-s" style="font-size:19px;color:var(--bad)">Are you sure?</div>'
      +'<div class="sub" style="line-height:1.55;margin:6px 0 12px">This cannot be undone. Type <b>DELETE</b> to confirm.</div>'
      +'<input id="kpvWord" class="kpv-in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DELETE" aria-label="Type DELETE to confirm">'
      +'<div class="sub kpv-err" id="kpvErr" role="alert"></div>'
      +'<button class="btn kpv-go" data-kp="go" disabled style="margin-top:12px">Delete everything</button>'
      +'<button class="btn ghost" data-kp="x" style="margin-top:8px">Cancel</button>');
    if(!el) return;
    var inp=document.getElementById('kpvWord'), go=el.querySelector('[data-kp="go"]');
    inp.addEventListener('input',function(){ go.disabled=inp.value.trim()!=='DELETE'; });
    setTimeout(function(){ try{ inp.focus(); }catch(e){} },80);
    el.addEventListener('click',function(ev){
      var b=ev.target.closest('[data-kp]'); if(!b) return;
      var k=b.getAttribute('data-kp');
      if(k==='x'){ close(); return; }
      if(k!=='go'||go.disabled) return;
      go.disabled=true; go.textContent='Deleting…';
      run(cloud).catch(function(e){
        var err=document.getElementById('kpvErr');
        if(err) err.textContent=(e&&e.message)||'Something went wrong.';
        go.disabled=false; go.textContent='Try again';
      });
    });
  }
  /* the server first; the phone only once the server side is gone */
  function run(cloud){
    var server=cloud&&window.KovaLink
      ? KovaLink.authFetch('/account/delete',{json:{confirm:'DELETE'}}).then(function(r){
          return r.json().catch(function(){ return {}; }).then(function(j){
            if(r.status===404) throw new Error('The Kova server is not set up yet, so your synced data could not be deleted. Nothing was removed.');
            if(!r.ok) throw new Error(j.problems&&j.problems.length?'Part of it could not be deleted ('+j.problems[0]+'). Nothing on this phone was removed; try again.':(j.error||'The server refused ('+r.status+').'));
            return j;
          });
        },function(){ throw new Error('The Kova server could not be reached. Nothing was removed; try again when you are online.'); })
      : Promise.resolve({ok:true,local:true});
    return server.then(function(){
      try{ if(window.KovaAnalytics) KovaAnalytics.track('account_deleted',{result:cloud?'full':'local'}); }catch(e){}
      try{ if(window.KOVA_FB&&KOVA_FB.auth) KOVA_FB.auth.signOut(); }catch(e){}
      return clearDevice();
    }).then(function(){
      var el=document.querySelector('#sheetIn .kpv');
      if(el) el.innerHTML='<div class="title-s" style="font-size:19px">Deleted</div><div class="sub" style="margin-top:6px">Your account and data are gone. Kova is starting fresh.</div>';
      setTimeout(function(){ try{ location.replace(location.pathname); }catch(e){ location.reload(); } },1400);
    });
  }

  /* ---------------- the Settings rows ---------------- */
  function row(id,icon,name,sub,danger){
    return '<div class="list-item tap" id="'+id+'"'+(danger?' style="margin-bottom:16px"':'')+'><div class="li-ico"><svg class="ic"'+(danger?' style="color:var(--bad)"':'')+'><use href="#'+icon+'"/></svg></div>'
      +'<div style="flex:1"><div class="li-name"'+(danger?' style="color:var(--bad)"':'')+'>'+name+'</div><div class="li-sub">'+sub+'</div></div>'
      +'<svg class="ic" style="font-size:14px;opacity:.35"><use href="#i-chevron-right"/></svg></div>';
  }
  function mount(){
    if(document.getElementById('kpvExport')) return;
    var old=document.querySelector('#s-settings .list-item[data-toast^="This clears everything"]');
    var restore=document.getElementById('kovaRestoreBtn');
    var at=old||(restore&&restore.nextSibling);
    if(!at||!at.parentNode) return;
    var wrap=document.createElement('div');
    wrap.innerHTML=row('kpvExport','i-clipboard-text','Export my data','Everything on this phone and on the Kova server, as one file')
      +row('kpvReads','i-heartbeat','What Kova reads and why','Each health type, what it is for, what never happens to it')
      +row('kpvPolicy','i-info-circle','Privacy policy','How your data is kept, shared and deleted')
      +row('kpvDelete','i-trash','Delete my account','Removes your account and every copy of your data',true);
    while(wrap.firstChild) at.parentNode.insertBefore(wrap.firstChild,at);
    if(old) old.remove();
    document.getElementById('kpvExport').onclick=exportAll;
    document.getElementById('kpvReads').onclick=openReads;
    document.getElementById('kpvPolicy').onclick=openPolicy;
    document.getElementById('kpvDelete').onclick=startDelete;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();

  return {explainHealth:explainHealth,openReads:openReads,openPolicy:openPolicy,exportAll:exportAll,startDelete:startDelete,
    _run:run,_clearDevice:clearDevice,_localData:localData,mount:mount,READS:READS};
})();
