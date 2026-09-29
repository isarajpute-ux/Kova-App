/* =====================================================================
   KovaSocial - the friends feed, opt-in (p11).

   Lifters stay where their friends see their PRs. This is off until you
   pick a handle and switch it on (Workout > Friends, or Settings). Then:
     - follow people by their handle; they see your finished workouts and
       personal records, you see theirs; like and comment;
     - after a workout, Kova shares it (asks once, then does it, with an
       Undo on every one);
     - a post is the session name, minutes, sets and which lifts hit a
       record by how much - never heart rate, sleep, food or body data.
   Remove a follower or switch it off any time; deleting your account
   removes you from everyone's lists (functions/social.js).
   ===================================================================== */
window.KovaSocial=(function(){
  'use strict';
  var KEY='kova.social.v1';
  var S=lsJ(KEY,{on:false,handle:'',auto:null});
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function ago(t){ var m=Math.round((Date.now()-t)/60000); return m<1?'now':m<60?m+' min':m<1440?Math.round(m/60)+' h':Math.round(m/1440)+' d'; }
  function api(path,body){
    if(!window.KovaLink) return Promise.reject(new Error('The Kova server is not available.'));
    return KovaLink.authFetch(path,body===undefined?{}:{json:body}).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error||(r.status===404?'The Kova server is not set up yet.':'Something went wrong ('+r.status+').')); return j; });
    },function(){ throw new Error('The Kova server could not be reached.'); });
  }

  /* ---------------- what a workout post says ---------------- */
  function lastPost(){
    var L=lsJ('kova_log_v1',[])||[], s=L[L.length-1]; if(!s) return null;
    var H=lsJ('kova_hist_v1',{})||{}, prs=[];
    (s.ex||[]).forEach(function(e){
      var h=(H[e.n]||[]).filter(function(x){ return x&&x.e1; });
      var now=h.filter(function(x){ return Math.abs(x.t-s.t)<6*3600e3; }).reduce(function(m,x){ return Math.max(m,x.e1); },0);
      var before=h.filter(function(x){ return x.t<s.t-6*3600e3; }).reduce(function(m,x){ return Math.max(m,x.e1); },0);
      if(now&&before&&now>before) prs.push({n:e.n,up:Math.round((now-before)/before*100)});
    });
    var sets=(s.ex||[]).reduce(function(a,e){ return a+(e.sets||[]).length; },0);
    return {kind:prs.length?'pr':'workout',title:String(s.day||'Workout').slice(0,60),stats:{mins:s.mins||0,sets:sets,lifts:(s.ex||[]).length,prs:prs}};
  }
  function share(p){
    return api('/social/post',p).then(function(j){
      S.lastId=j.id; save();
      say((p.kind==='pr'?'New record shared':'Workout shared')+' with your friends.');
      offerUndo(j.id);
      return j;
    }).catch(function(e){ say('Not shared: '+e.message); });
  }
  function offerUndo(id){
    var el=document.getElementById('ksoUndo');
    if(!el){ el=document.createElement('button'); el.id='ksoUndo'; el.className='kso-undo'; document.body.appendChild(el); }
    el.textContent='Undo share'; el.onclick=function(){ api('/social/unpost',{id:id}).then(function(){ say('Taken back.'); }); el.remove(); };
    clearTimeout(el.__t); el.__t=setTimeout(function(){ el.remove(); },8000);
  }
  function afterWorkout(){
    if(!S.on) return;
    var p=lastPost(); if(!p) return;
    if(S.auto===true){ share(p); return; }
    if(S.auto===false||!window.openSheet) return;
    openSheet('<div class="grab"></div><div class="kso">'
      +'<div class="title-s" style="font-size:19px">Share this with your friends?</div>'
      +'<div class="sub" style="line-height:1.5;margin:4px 0 12px">'+esc(p.title)+' · '+p.stats.mins+' min · '+p.stats.sets+' sets'+(p.stats.prs.length?' · '+p.stats.prs.length+' record'+(p.stats.prs.length===1?'':'s'):'')+'. Only people who follow you see it. No heart rate, sleep, food or body data.</div>'
      +'<button class="btn" data-so="always">Share, and share future workouts</button>'
      +'<button class="btn ghost" data-so="once" style="margin-top:8px">Share just this one</button>'
      +'<button class="btn ghost" data-so="never" style="margin-top:8px">Don’t share workouts</button></div>');
    var el=document.querySelector('#sheetIn .kso');
    if(el) el.addEventListener('click',function(ev){
      var b=ev.target.closest('[data-so]'); if(!b) return;
      var k=b.getAttribute('data-so');
      if(window.closeSheet) closeSheet();
      if(k==='always'){ S.auto=true; save(); share(p); }
      else if(k==='once') share(p);
      else { S.auto=false; save(); }
    });
  }

  /* ---------------- the feed ---------------- */
  function postHTML(p){
    var st=p.stats||{}, line=[st.mins?st.mins+' min':'',st.sets?st.sets+' sets':'',st.lifts?st.lifts+' lifts':''].filter(Boolean).join(' · ');
    return '<div class="kso-post" data-h="'+esc(p.owner)+'" data-id="'+esc(p.id)+'">'
      +'<div class="kso-ph"><b>@'+esc(p.owner)+'</b><span>'+ago(p.at)+'</span></div>'
      +'<div class="kso-pt">'+(p.kind==='pr'?'🏆 ':'')+esc(p.title)+'</div>'
      +(line?'<div class="kso-pl">'+esc(line)+'</div>':'')
      +((st.prs||[]).length?'<div class="kso-prs">'+st.prs.map(function(x){ return '<span>'+esc(x.n)+(x.up?' +'+x.up+'%':'')+'</span>'; }).join('')+'</div>':'')
      +'<div class="kso-act"><button class="kso-like'+(p.liked?' on':'')+'" data-a="like" aria-pressed="'+!!p.liked+'">♥ '+(p.likes||0)+'</button>'
      +(p.mine?'<button class="kso-l" data-a="unpost">Remove</button>':'')+'</div>'
      +(p.comments||[]).map(function(c){ return '<div class="kso-c"><b>@'+esc(c.handle)+'</b> '+esc(c.text)+'</div>'; }).join('')
      +'<form class="kso-cf" data-a="comment"><input maxlength="280" placeholder="Say something" aria-label="Comment"><button>Post</button></form></div>';
  }
  function openFeed(){
    if(!S.on){ setup(); return; }
    if(!window.openSheet) return;
    openSheet('<div class="grab"></div><div class="kso">'
      +'<div class="kso-top"><div class="title-s" style="font-size:19px">Friends</div><button class="kso-l" data-a="settings">@'+esc(S.handle)+'</button></div>'
      +'<form class="kso-cf kso-follow" data-a="follow"><input placeholder="Follow someone: their handle" aria-label="Handle to follow" autocapitalize="none" autocorrect="off"><button>Follow</button></form>'
      +'<div class="kso-feed" id="ksoFeed"><div class="sub">Loading…</div></div></div>');
    var el=document.querySelector('#sheetIn .kso'); if(!el) return;
    el.addEventListener('click',onFeedClick);
    el.addEventListener('submit',onFeedSubmit);
    loadFeed();
  }
  function loadFeed(){
    api('/social/feed').then(function(j){
      var f=document.getElementById('ksoFeed'); if(!f) return;
      f.innerHTML=(j.posts||[]).length?j.posts.map(postHTML).join(''):'<div class="sub" style="line-height:1.5">Nothing here yet. Follow a friend by their handle, and finish a workout to share your first one.</div>';
    }).catch(function(e){ var f=document.getElementById('ksoFeed'); if(f) f.innerHTML='<div class="sub">'+esc(e.message)+'</div>'; });
  }
  function onFeedClick(ev){
    var b=ev.target.closest('[data-a]'); if(!b||b.tagName==='FORM') return;
    var a=b.getAttribute('data-a'), post=b.closest('.kso-post');
    if(a==='settings'){ setup(); return; }
    if(a==='like'&&post){ var on=!b.classList.contains('on'); api('/social/like',{handle:post.dataset.h,id:post.dataset.id,on:on}).then(loadFeed,function(e){ say(e.message); }); }
    if(a==='unpost'&&post){ api('/social/unpost',{id:post.dataset.id}).then(loadFeed); }
  }
  function onFeedSubmit(ev){
    var f=ev.target.closest('form'); if(!f) return; ev.preventDefault();
    var inp=f.querySelector('input'), v=inp.value.trim(); if(!v) return;
    if(f.getAttribute('data-a')==='follow') api('/social/follow',{handle:v.replace(/^@/,''),on:true}).then(function(){ say('Following @'+v.replace(/^@/,'')+'.'); inp.value=''; loadFeed(); },function(e){ say(e.message); });
    else { var post=f.closest('.kso-post'); api('/social/comment',{handle:post.dataset.h,id:post.dataset.id,text:v}).then(function(){ inp.value=''; loadFeed(); },function(e){ say(e.message); }); }
  }

  /* ---------------- opting in ---------------- */
  function setup(){
    if(!window.openSheet) return;
    openSheet('<div class="grab"></div><div class="kso">'
      +'<div class="title-s" style="font-size:19px">Friends feed</div>'
      +'<div class="sub" style="line-height:1.5;margin:4px 0 12px">Off unless you turn it on. People who follow you see your finished workouts and personal records - the session name, minutes, sets and which lifts hit a record. Never heart rate, sleep, food or body data.</div>'
      +'<label class="kso-f">Your handle<input id="ksoHandle" value="'+esc(S.handle)+'" placeholder="e.g. isa_lifts" maxlength="20" autocapitalize="none" autocorrect="off"></label>'
      +'<div class="kso-err" id="ksoErr" role="alert"></div>'
      +'<button class="btn" data-s="on">'+(S.on?'Save':'Turn on the friends feed')+'</button>'
      +(S.on?'<button class="btn ghost" data-s="off" style="margin-top:8px">Turn it off</button>':'')+'</div>');
    var el=document.querySelector('#sheetIn .kso'); if(!el) return;
    el.addEventListener('click',function(ev){
      var b=ev.target.closest('[data-s]'); if(!b) return;
      var on=b.getAttribute('data-s')==='on', h=String(document.getElementById('ksoHandle').value||'').toLowerCase().replace(/^@/,'').trim();
      if(on&&!/^[a-z0-9_]{3,20}$/.test(h)){ document.getElementById('ksoErr').textContent='3 to 20 letters, numbers or _.'; return; }
      api('/social/profile',{handle:on?h:(S.handle||h),on:on}).then(function(p){
        S.on=!!p.on; S.handle=p.handle; save();
        try{ if(window.KovaAnalytics) KovaAnalytics.track(on?'social_on':'social_off',{}); }catch(e){}
        if(window.closeSheet) closeSheet();
        paintEntry();
        if(on) setTimeout(openFeed,300); else say('Friends feed off. Nothing new is shared.');
      },function(e){ document.getElementById('ksoErr').textContent=e.message; });
    });
  }

  /* ---------------- entry points ---------------- */
  /* one row in Settings, not a card on Workout: the Workout screen stays
     about training. After a session Kova still asks once whether to share. */
  function paintEntry(){
    var c=document.getElementById('ksoRow');
    if(!c){
      var after=document.getElementById('krcRow')||document.querySelector('#s-settings [data-go="tour"]'); if(!after) return;
      c=document.createElement('div'); c.id='ksoRow'; c.className='list-item tap'; c.style.marginBottom='16px';
      if(after.style) after.style.marginBottom='8px';
      after.parentNode.insertBefore(c,after.nextSibling); c.addEventListener('click',openFeed);
    }
    c.innerHTML='<div class="li-ico"><svg class="ic" style="color:var(--acc)"><use href="#i-heartbeat"/></svg></div><div style="flex:1"><div class="li-name">Friends</div><div class="li-sub">'
      +(S.on?'@'+esc(S.handle)+' \u00b7 your friends\u2019 workouts and records':'Off. Share workouts and PRs with people you choose.')+'</div></div><svg class="ic" style="font-size:14px;opacity:.35"><use href="#i-chevron-right"/></svg>';
  }
  function watch(){
    var A=window.KovaAnalytics; if(!A||A.__so) return;
    var real=A.track; A.track=function(name){ var r=real.apply(this,arguments); if(name==='workout_complete') setTimeout(afterWorkout,900); return r; }; A.__so=1;
  }
  function start(){ watch(); paintEntry(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,100); }); else setTimeout(start,100);

  return {setup:setup,openFeed:openFeed,lastPost:lastPost,afterWorkout:afterWorkout,share:share,_S:function(){ return S; },_set:function(s){ S=s; save(); paintEntry(); }};
})();
