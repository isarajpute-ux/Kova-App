/* =====================================================================
   KovaBook (p23) - your booking link, like Calendly, in Work OS > Meetings.

   One card at the top of Meetings: set up a link (kova.app/book/isa) in a
   pop-up, then copy or share it. People who open it see only your free
   times (functions/booking.js) and book one; it comes back here as a Work
   OS meeting, with their note as the prep, and you get a notification.
   Your own Work OS meetings are sent to the server as busy times, so
   nobody can book over them. Cancel a booking from the card; the time
   opens again and, with Google Calendar, they are told.
   ===================================================================== */
window.KovaBook=(function(){
  'use strict';
  var S={cfg:null,items:[],at:0,loading:false,busyAt:0,busySig:''};
  var DAY=864e5, MIN=6e4;
  function $(id){ return document.getElementById(id); }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function W(){ return window.WorkOS||null; }
  function serverOk(){ try{ return !!(window.KovaLink&&KovaLink.authFetch&&window.KOVA_FB&&KOVA_FB.ok&&KOVA_FB.auth&&KOVA_FB.auth.currentUser); }catch(e){ return false; } }
  function api(path,o){ return KovaLink.authFetch(path,o).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok){ var e=new Error(j.error||('HTTP '+r.status)); e.status=r.status; throw e; } return j; }); }); }
  function tz(){ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'; }catch(e){ return 'UTC'; } }
  function origin(){
    try{ var a=String(window.KOVA_API||''); if(/^https?:\/\//.test(a)) return new URL(a).origin; }catch(e){}
    return location.origin;
  }
  function link(){ return S.cfg&&S.cfg.slug?origin()+'/book/'+S.cfg.slug:''; }
  function when(t){ return new Date(t).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
  function suggestSlug(){
    var n=''; try{ var p=W()&&W().all().profile; n=(p&&(p.name||p.business))||''; }catch(e){}
    try{ if(!n&&KOVA_FB.auth.currentUser.displayName) n=KOVA_FB.auth.currentUser.displayName; }catch(e){}
    return String(n||'').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').trim().replace(/[\s_]+/g,'-').replace(/-+/g,'-').slice(0,30)||'';
  }

  /* ---------------- talking to the server ---------------- */
  function refresh(force){
    if(!serverOk()) return Promise.resolve(null);
    if(S.loading||(!force&&Date.now()-S.at<60e3)) return Promise.resolve(S.items);
    S.loading=true;
    return Promise.all([api('/book/setup'),api('/book/list')]).then(function(r){
      S.cfg=r[0]&&!r[0].none?r[0]:(r[0]&&r[0].none?{none:true,google:r[0].google}:null);
      S.items=(r[1]&&r[1].items)||[]; S.at=Date.now(); S.loading=false;
      importAll(); sendBusy(); paint();
      return S.items;
    },function(){ S.loading=false; paint(); return null; });
  }
  /* each booking becomes a Work OS meeting (once); a cancelled one goes */
  function importAll(){
    var w=W(); if(!w) return 0;
    var made=0;
    S.items.forEach(function(b){
      var have=w.list('meetings',function(m){ return m.bookingId===b.id; })[0];
      if(b.state==='cancelled'){ if(have) w.remove('meetings',have.id,'booking'); return; }
      if(have) return;
      w.create('meetings',{title:b.title+' with '+b.name,url:'',platform:'phone',attendees:b.name+' ('+b.email+')',at:b.start,end:b.end,
        prep:b.note?'From '+b.name+': '+b.note:'',notes:'',bookingId:b.id},'booking');
      made++;
    });
    if(made&&window.__workMeet) try{ __workMeet.list(); }catch(e){}
    return made;
  }
  /* your other meetings, so nobody books over them */
  function sendBusy(){
    var w=W(); if(!w||!serverOk()||!S.cfg||S.cfg.none) return Promise.resolve(null);
    var t=Date.now();
    var busy=w.list('meetings',function(m){ return m.at&&!m.bookingId&&m.at>t-3*36e5&&m.at<t+61*DAY; })
      .map(function(m){ return {start:m.at,end:m.end||m.at+60*MIN}; });
    var sig=JSON.stringify(busy);
    if(sig===S.busySig&&t-S.busyAt<6*36e5) return Promise.resolve(null);
    S.busySig=sig; S.busyAt=t;
    return api('/book/busy',{json:{busy:busy}}).catch(function(){ S.busySig=''; });
  }
  function cancel(id){
    return api('/book/cancel',{json:{id:id}}).then(function(){
      S.items.forEach(function(b){ if(b.id===id) b.state='cancelled'; });
      importAll(); paint(); say('Cancelled. The time is free again.');
    },function(e){ say(e.message||'Could not cancel it.'); });
  }

  /* ---------------- the card on Meetings ---------------- */
  var armed='';
  function paint(){
    var body=$('wmBody'); if(!body) return;
    var card=body.querySelector('.kbk');
    if(!card){
      card=document.createElement('div'); card.className='card kbk';
      var first=body.querySelector('.card');
      if(first&&first.nextSibling) body.insertBefore(card,first.nextSibling); else body.appendChild(card);
      card.addEventListener('click',onClick);
    }
    var h;
    if(!serverOk()){
      /* p29: a way in, not a dead end */
      h='<div class="kbk-h">Your booking link</div><div class="kbk-s">Let people pick a free time with you, like Calendly. It needs you signed in to Kova, because the link lives on the Kova server.</div>'
        +'<button class="btn" data-kb="signin">Sign in to set it up</button>';
    }else if(!S.cfg||S.cfg.none){
      h='<div class="kbk-h">Your booking link</div><div class="kbk-s">Share one link; people see only your free times and book one. It lands here as a meeting'+(S.cfg&&S.cfg.google?' and on your Google Calendar':'')+'.</div>'
        +'<button class="btn" data-kb="setup">Set up my link</button>';
    }else{
      var up=S.items.filter(function(b){ return b.state!=='cancelled'&&b.end>Date.now(); });
      h='<div class="kbk-top"><div class="kbk-h">Your booking link</div><button class="kbk-tog'+(S.cfg.on?' on':'')+'" data-kb="toggle" role="switch" aria-checked="'+!!S.cfg.on+'" aria-label="Booking link on"><span></span></button></div>'
        +'<div class="kbk-link'+(S.cfg.on?'':' off')+'">'+esc(link().replace(/^https?:\/\//,''))+'</div>'
        +'<div class="kbk-s">'+esc(S.cfg.title)+' · '+S.cfg.mins+' min · '+(S.cfg.on?'open':'closed')+(S.cfg.google?' · checks your Google Calendar':' · connect Google Calendar to hide busy times')+'</div>'
        +'<div class="kbk-row"><button class="kbk-b" data-kb="copy">Copy link</button><button class="kbk-b" data-kb="share">Share</button><button class="kbk-b" data-kb="setup">Edit</button></div>'
        +(up.length?'<div class="kbk-sec">Booked ('+up.length+')</div>'+up.slice(0,6).map(function(b){
            return '<div class="kbk-it"><div><b>'+esc(b.name)+'</b><small>'+esc(when(b.start))+(b.note?' · '+esc(b.note.slice(0,60)):'')+'</small></div>'
              +'<button class="kbk-x'+(armed===b.id?' armed':'')+'" data-kb="cancel" data-id="'+esc(b.id)+'">'+(armed===b.id?'Tap again to cancel':'Cancel')+'</button></div>';
          }).join(''):'<div class="kbk-none">No bookings yet. Share the link to get your first one.</div>');
    }
    card.innerHTML=h;
  }
  function onClick(e){
    var b=e.target.closest('[data-kb]'); if(!b) return;
    if(b.getAttribute('data-kb')==='signin'){ if(window.KovaCloudAuth&&KovaCloudAuth.open) KovaCloudAuth.open({mode:'in'}); else if(typeof go==='function') go('settings'); return; }
    var k=b.dataset.kb;
    if(k==='setup') sheet();
    else if(k==='copy'){ copy(link()); }
    else if(k==='share'){
      if(navigator.share) navigator.share({title:S.cfg.title+' with '+S.cfg.name,url:link()}).catch(function(){});
      else copy(link());
    }
    else if(k==='toggle'){
      var c=Object.assign({},S.cfg,{on:!S.cfg.on,tz:S.cfg.tz||tz()});
      api('/book/setup',{json:c}).then(function(r){ S.cfg=r; paint(); say(r.on?'Your link is open.':'Your link is closed; nobody can book.'); },function(err){ say(err.message); });
    }
    else if(k==='cancel'){
      var id=b.dataset.id;
      if(armed!==id){ armed=id; paint(); setTimeout(function(){ if(armed===id){ armed=''; paint(); } },4000); return; }
      armed=''; cancel(id);
    }
  }
  function copy(t){
    if(!t) return;
    try{ navigator.clipboard.writeText(t).then(function(){ say('Link copied.'); },function(){ say(t); }); }catch(e){ say(t); }
  }

  /* ---------------- setup, in a pop-up ---------------- */
  var DAYN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  function sheet(){
    if(!window.openSheet) return;
    var c=S.cfg&&!S.cfg.none?S.cfg:{slug:suggestSlug(),name:'',title:'Intro call',mins:30,days:[1,2,3,4,5],from:'09:00',to:'17:00',ahead:14,notice:4,buffer:10};
    var nm=c.name; try{ if(!nm) nm=(W().all().profile||{}).name||KOVA_FB.auth.currentUser.displayName||''; }catch(e){}
    openSheet('<div class="grab"></div><div class="kfl-sheet" id="kbkS">'
      +'<div class="kfl-title">Your booking link</div>'
      +'<label class="kfl-f wide"><span>Link</span><span class="kbk-pre">'+esc(origin().replace(/^https?:\/\//,''))+'/book/</span><input id="kbkSlug" value="'+esc(c.slug||'')+'" placeholder="your-name" autocapitalize="off" spellcheck="false"></label>'
      +'<label class="kfl-f wide"><span>Your name</span><input id="kbkName" value="'+esc(nm||'')+'" placeholder="How you appear on the page"></label>'
      +'<label class="kfl-f wide"><span>The call</span><input id="kbkTitle" value="'+esc(c.title||'')+'" placeholder="Intro call"></label>'
      +'<div class="kfl-sec">How long</div><div class="kbk-chips" id="kbkMins">'+[15,20,30,45,60,90].map(function(m){ return '<button class="kfl-chip'+(m===c.mins?' on':'')+'" data-m="'+m+'">'+m+' min</button>'; }).join('')+'</div>'
      +'<div class="kfl-sec">Days</div><div class="kbk-chips" id="kbkDays">'+[1,2,3,4,5,6,0].map(function(d){ return '<button class="kfl-chip'+(c.days.indexOf(d)>=0?' on':'')+'" data-d="'+d+'" aria-pressed="'+(c.days.indexOf(d)>=0)+'">'+DAYN[d]+'</button>'; }).join('')+'</div>'
      +'<div class="kfl-sec">Hours</div><div class="kbk-two"><label class="kfl-f"><span>from</span><input id="kbkFrom" type="time" value="'+esc(c.from)+'"></label><label class="kfl-f"><span>to</span><input id="kbkTo" type="time" value="'+esc(c.to)+'"></label></div>'
      +'<div class="kbk-two"><label class="kfl-f"><span>Up to</span><select id="kbkAhead">'+[7,14,30,60].map(function(d){ return '<option value="'+d+'"'+(d===c.ahead?' selected':'')+'>'+d+' days ahead</option>'; }).join('')+'</select></label>'
      +'<label class="kfl-f"><span>Notice</span><select id="kbkNotice">'+[0,2,4,12,24,48].map(function(h){ return '<option value="'+h+'"'+(h===c.notice?' selected':'')+'>'+(h?h+' hours':'none')+'</option>'; }).join('')+'</select></label></div>'
      +'<label class="kfl-f"><span>Gap between calls</span><select id="kbkBuf">'+[0,5,10,15,30].map(function(m){ return '<option value="'+m+'"'+(m===c.buffer?' selected':'')+'>'+(m?m+' min':'none')+'</option>'; }).join('')+'</select></label>'
      +'<div class="kfl-hint">Times are in your time zone ('+esc(tz())+'). People see them in theirs.</div>'
      +'<div class="kfl-warn" id="kbkErr" hidden></div>'
      +'<div class="kfl-row"><button class="btn ghost" data-ks="close">Cancel</button><button class="btn" data-ks="save">Save</button></div></div>');
    var root=$('kbkS'), pick={mins:c.mins,days:c.days.slice()};
    root.addEventListener('click',function(e){
      var b=e.target.closest('button'); if(!b) return;
      if(b.dataset.m){ pick.mins=+b.dataset.m; root.querySelectorAll('[data-m]').forEach(function(x){ x.classList.toggle('on',+x.dataset.m===pick.mins); }); }
      else if(b.dataset.d!=null){ var d=+b.dataset.d, i=pick.days.indexOf(d); if(i>=0) pick.days.splice(i,1); else pick.days.push(d); b.classList.toggle('on',i<0); b.setAttribute('aria-pressed',String(i<0)); }
      else if(b.dataset.ks==='close'){ if(window.closeSheet) closeSheet(); }
      else if(b.dataset.ks==='save') save(pick);
    });
    var sl=$('kbkSlug'); sl.addEventListener('input',function(){ var v=sl.value.toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').slice(0,30); if(v!==sl.value) sl.value=v; });
  }
  function save(pick){
    var err=$('kbkErr');
    var body={slug:$('kbkSlug').value.replace(/^-+|-+$/g,''),name:$('kbkName').value.trim(),title:$('kbkTitle').value.trim(),mins:pick.mins,days:pick.days,
      from:$('kbkFrom').value,to:$('kbkTo').value,ahead:+$('kbkAhead').value,notice:+$('kbkNotice').value,buffer:+$('kbkBuf').value,tz:tz(),on:S.cfg&&!S.cfg.none?S.cfg.on!==false:true};
    var show=function(m){ err.hidden=false; err.textContent=m; };
    if(!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(body.slug)) return show('Pick a link name of 3 to 30 letters, numbers or dashes.');
    if(!body.days.length) return show('Pick at least one day.');
    if(body.to<=body.from) return show('The end of your hours must be after the start.');
    if(!serverOk()) return show('Sign in to Kova first: the link lives on the Kova server.');
    api('/book/setup',{json:body}).then(function(r){
      S.cfg=r; if(window.closeSheet) closeSheet(); paint(); sendBusy();
      say('Your link is ready.');
      try{ if(window.KovaAnalytics) KovaAnalytics.track('booking_setup',{mins:r.mins}); }catch(e){}
    },function(e){
      if(e.status===402&&window.KovaBilling){ if(window.closeSheet) closeSheet(); KovaBilling.paywall('crew'); return; }
      show(e.message||'Could not save it. Try again.');
    });
  }

  /* a guided tour of Meetings (Back, Next, Skip) */
  (function(){
    var T=window.KovaScreenTour; if(!T||!T.register) return;
    T.register('workmeetings','Meetings',[
      ['Your calls','How many today, what is coming up and what has passed.','#wmBody .card.card-lg'],
      ['Your booking link','Share one link; people pick a free time with you and it lands here.','#wmBody .kbk'],
      ['Upcoming or past','Switch between calls still to come and the ones you have had.','#wmFilter'],
      ['Add a call','Paste a Zoom, Meet or Teams link and Kova recognises it.','#wmNew']
    ]);
  })();

  /* ---------------- when ---------------- */
  function watch(){
    var el=$('wmBody'); if(!el||!window.MutationObserver) return;
    new MutationObserver(function(){ if(!el.querySelector('.kbk')) paint(); }).observe(el,{childList:true});
    var sc=$('s-workmeetings');
    if(sc) new MutationObserver(function(){ if(sc.classList.contains('on')) refresh(); }).observe(sc,{attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ watch(); paint(); }); else { watch(); paint(); }
  setTimeout(function(){ refresh(true); },0);
  setInterval(function(){ if(!document.hidden) refresh(); },2*60e3);
  document.addEventListener('visibilitychange',function(){ if(!document.hidden) refresh(); });

  return {refresh:refresh,paint:paint,importAll:importAll,sendBusy:sendBusy,cancel:cancel,link:link,sheet:sheet,suggestSlug:suggestSlug,_S:S};
})();
