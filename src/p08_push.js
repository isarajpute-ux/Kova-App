/* =====================================================================
   KovaPush - reminders that arrive with Kova closed (p11).

   The reminder list in Settings (bedtime, water, meals, training, meds)
   used to be a timer inside the page, so it only fired while Kova was
   open. This keeps that list as it is and adds:

     - Push registration, asked for only in context: when you switch a
       reminder on, or tap "Enable notifications". Never on launch.
         web:    Firebase Cloud Messaging through sw.js (needs the web
                 push key, KOVA_FB_VAPID, from the Firebase console)
         native: @capacitor-firebase/messaging (FCM tokens on iPhone and
                 Android alike, which is what the server sends to)
       The token goes to POST /api/devices.
     - A copy of the list on the server (POST /api/reminders), in your
       time zone, with your quiet hours, re-sent whenever you change it.
       The server's 5-minute timer sends each one once a day.
     - Tapping a notification opens its screen (?go=sleep etc.).
     - Quiet hours: off by default, since every reminder is a time you
       chose; bedtime and wind-down still come through when they are on.

   While Kova is open in front of you, the page's own timer shows the
   reminder as before and the push is not doubled.
   ===================================================================== */
window.KovaPush=(function(){
  'use strict';
  var KEY='kova.push.v1';
  var S=lsJ(KEY,{on:false,token:'',platform:'',quiet:null,asked:false,last:''});
  var syncT=null;
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){} }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function native(){ return !!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform()); }
  function nplug(){
    if(!native()) return null;
    try{ return Capacitor.registerPlugin?Capacitor.registerPlugin('FirebaseMessaging'):(Capacitor.Plugins&&Capacitor.Plugins.FirebaseMessaging); }catch(e){ return null; }
  }
  function webOk(){ return typeof Notification!=='undefined'&&'serviceWorker' in navigator&&!!(window.firebase&&firebase.initializeApp); }
  /* Firebase's messaging library is only needed once push is on, so it
     loads then instead of with the first screen. */
  var msgP=null;
  function msg(){
    if(window.firebase&&firebase.messaging) return Promise.resolve(firebase.messaging());
    return msgP||(msgP=new Promise(function(ok,no){
      var s=document.createElement('script'); s.src='https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js'; s.async=true;
      s.onload=function(){ try{ ok(firebase.messaging()); }catch(e){ msgP=null; no(e); } };
      s.onerror=function(){ msgP=null; no(new Error('Could not load notifications. Check your connection and try again.')); };
      document.head.appendChild(s);
    }));
  }
  function vapid(){ return String(window.KOVA_FB_VAPID||''); }
  function supported(){ return native()?!!nplug():webOk(); }
  function perm(){ return native()?(S.on?'granted':'default'):(typeof Notification==='undefined'?'unsupported':Notification.permission); }

  /* ---------------- the list the server keeps ---------------- */
  var KIND={bed:'wind_down',wake:'custom',water:'water',lunch:'meal',protein:'meal',train:'workout',log:'custom',today:'today',recap:'recap',glp1:'glp1'};
  var SCREEN={Sleep:'sleep',Fuel:'fuel',Workout:'move',Work:'work',Health:'health',Meds:'health'};
  function hhmm(m){ m=((m%1440)+1440)%1440; return ('0'+Math.floor(m/60)).slice(-2)+':'+('0'+(m%60)).slice(-2); }
  function items(){
    var A=(window.__alerts&&__alerts.get())||[], out={};
    A.forEach(function(a){
      if(!a||!a.id||!a.t) return;
      var p=String(a.t).split(':'), m=(+p[0])*60+(+p[1])-(a.lead||0);
      var mon=a.days||[1,1,1,1,1,1,1], days=[];            // the app's week starts Monday; the server's Sunday
      mon.forEach(function(on,i){ if(on) days.push((i+1)%7); });
      var id=String(a.id).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,40);
      out[id]={kind:a.id.indexOf('med:')===0?'meds':(KIND[a.id]||'custom'),title:String(a.title||'Kova').slice(0,60),body:String(a.body||'').slice(0,160),
        time:hhmm(m),days:days,on:!!a.on,screen:a.id.indexOf('med:')===0?'health':(SCREEN[a.p]||'home')};
    });
    return out;
  }
  function tz(){ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'; }catch(e){ return 'UTC'; } }
  function sound(){ try{ return window.KovaChime?KovaChime.sound():'kova'; }catch(e){ return 'kova'; } }
  function payload(){ return {tz:tz(),quiet:S.quiet,sound:sound(),items:items()}; }
  /* the phone needs Kova's sounds before a push can use them:
       Android  one channel per sound (its .wav is in res/raw)
       iPhone   the .wav files in Library/Sounds, written from the same
                synth the page plays (needs @capacitor/filesystem) */
  function nativeSounds(){
    var P=nplug(), C=window.KovaChime; if(!P||!C) return;
    var plat=(window.Capacitor&&Capacitor.getPlatform&&Capacitor.getPlatform())||'';
    if(plat==='android'&&P.createChannel){
      C.LIST.forEach(function(x){
        if(x.id==='default') return;
        P.createChannel({id:'kova_'+x.id,name:'Kova \u00b7 '+x.n,description:'Reminders with the '+x.n+' sound',importance:x.id==='silent'?2:4,
          sound:x.id==='silent'?undefined:C.file(x.id),vibration:x.id!=='silent'}).catch(function(){});
      });
    }
    var FS=null; try{ FS=Capacitor.registerPlugin?Capacitor.registerPlugin('Filesystem'):(Capacitor.Plugins&&Capacitor.Plugins.Filesystem); }catch(e){}
    if(plat==='ios'&&FS&&FS.writeFile){
      C.LIST.forEach(function(x){
        if(!C.wav||x.id==='default'||x.id==='silent') return;
        var b=C.wav(x.id,22050), str=''; for(var i=0;i<b.length;i+=8192) str+=String.fromCharCode.apply(null,b.subarray(i,i+8192));
        FS.writeFile({path:'Sounds/'+C.file(x.id)+'.wav',data:btoa(str),directory:'LIBRARY',recursive:true}).catch(function(){});
      });
    }
  }
  function sync(){
    if(!S.on||!window.KovaLink) return Promise.resolve(false);
    var body=payload();
    return KovaLink.authFetch('/reminders',{json:body}).then(function(r){
      if(r.ok){ S.last=new Date().toISOString(); save(); paintNote(); }
      return r.ok;
    }).catch(function(){ return false; });
  }
  function syncSoon(){ clearTimeout(syncT); syncT=setTimeout(sync,1200); }

  /* ---------------- registration ---------------- */
  function tokenWeb(){
    if(!vapid()) return Promise.reject(new Error('Push is not set up for this site yet (the web push key is missing). Reminders still work while Kova is open.'));
    return Notification.requestPermission().then(function(p){
      if(p!=='granted') throw new Error(p==='denied'?'Notifications are blocked. Turn them on in your browser settings.':'Notifications not turned on.');
      return navigator.serviceWorker.ready;
    }).then(function(reg){ return msg().then(function(m){ return m.getToken({vapidKey:vapid(),serviceWorkerRegistration:reg}); }); });
  }
  function tokenNative(){
    var P=nplug(); if(!P) return Promise.reject(new Error('Push is not available in this build.'));
    return P.requestPermissions().then(function(r){
      if(!r||r.receive!=='granted') throw new Error('Notifications are off for Kova. Turn them on in your phone settings.');
      return P.getToken();
    }).then(function(r){ return r&&r.token; });
  }
  /* call from a tap: switching a reminder on, or Enable notifications */
  function enable(){
    if(!supported()) return Promise.reject(new Error('This browser cannot receive notifications. They work in the Kova app.'));
    S.asked=true; save();
    return (native()?tokenNative():tokenWeb()).then(function(token){
      if(!token) throw new Error('No push token came back.');
      S.token=token; S.platform=native()?((window.Capacitor&&Capacitor.getPlatform&&Capacitor.getPlatform())||'ios'):'web';
      if(!window.KovaLink) throw new Error('The Kova server is not available.');
      return KovaLink.authFetch('/devices',{json:{token:token,platform:S.platform}}).then(function(r){
        if(!r.ok) throw new Error(r.status===404?'The Kova server is not set up yet. Reminders still work while Kova is open.':'The server did not accept this device ('+r.status+').');
        S.on=true; save();
        try{ if(window.KovaAnalytics) KovaAnalytics.track('push_enabled',{platform:S.platform}); }catch(e){}
        return sync().then(function(){ paintNote(); return true; });
      });
    });
  }
  function disable(){
    var t=S.token; S.on=false; save(); paintNote();
    if(t&&window.KovaLink) KovaLink.authFetch('/devices/remove',{json:{token:t}}).catch(function(){});
    try{ var P=nplug(); if(P&&P.deleteToken) P.deleteToken(); else if(webOk()) msg().then(function(m){ return m.deleteToken(); }).catch(function(){}); }catch(e){}
  }

  /* the in-context ask: shown when a reminder is switched on */
  function offer(title){
    if(S.on||!supported()||perm()==='denied'||!window.openSheet) return;
    openSheet('<div class="grab"></div><div class="kpv">'
      +'<div class="title-s" style="font-size:19px;margin-bottom:4px">Get it with Kova closed?</div>'
      +'<div class="sub" style="line-height:1.55;margin-bottom:14px">'+esc(title||'This reminder')+' only shows while Kova is open right now. Turn on notifications and it arrives on time, on this '+(native()?'phone':'device')+', even when Kova is closed.</div>'
      +'<button class="btn" data-kpu="on">Turn on notifications</button>'
      +'<button class="btn ghost" data-kpu="no" style="margin-top:8px">Only while Kova is open</button></div>');
    var el=document.querySelector('#sheetIn .kpv');
    if(el) el.addEventListener('click',function(ev){
      var b=ev.target.closest('[data-kpu]'); if(!b) return;
      if(b.getAttribute('data-kpu')==='no'){ if(window.closeSheet) closeSheet(); return; }
      b.textContent='Turning on…';
      enable().then(function(){ if(window.closeSheet) closeSheet(); say('Reminders will arrive with Kova closed.'); },
        function(e){ if(window.closeSheet) closeSheet(); say(e.message); });
    });
  }

  /* ---------------- Settings: note, quiet hours ---------------- */
  function paintNote(){
    var note=document.getElementById('kpuNote');
    if(!note){
      var test=document.getElementById('alertTest');
      var card=test&&test.nextElementSibling;
      if(!card||!card.classList.contains('card')) return;
      card.id='kpuNote'; note=card;
    }
    var q=S.quiet;
    var line=S.on
      ?'<b>On:</b> reminders arrive on this '+(native()?'phone':'device')+' even when Kova is closed. They follow your time zone ('+esc(tz())+').'
      :(supported()?'<b>Right now:</b> reminders only show while Kova is open. Switch one on and Kova offers to send them with the app closed.'
        :'<b>Right now:</b> this browser cannot receive notifications, so reminders only show while Kova is open. In the Kova app they arrive with it closed.');
    note.innerHTML='<div style="display:flex;gap:9px"><svg class="ic" style="font-size:15px;color:'+(S.on?'var(--good)':'var(--warn)')+';flex-shrink:0;margin-top:1px"><use href="#i-info-circle"/></svg>'
      +'<div style="flex:1;font-size:11px;line-height:1.5;color:var(--txt-2,rgba(255,255,255,.9))">'+line
      +'<div class="kpu-quiet"><span>Quiet hours</span>'
      +'<button class="kpu-q'+(q?' on':'')+'" data-kpu="quiet" aria-pressed="'+(q?'true':'false')+'">'+(q?esc(q.from)+'–'+esc(q.to):'Off')+'</button>'
      +(S.on?'<button class="kpu-q" data-kpu="off">Stop push</button>':'')+'</div>'
      +'<div class="kpu-sub">'+(q?'Nothing but bedtime and wind-down between these times.':'Every reminder comes at the time you set.')+'</div></div></div>';
  }
  var QUIET=[null,{from:'22:00',to:'07:00'},{from:'23:00',to:'07:00'},{from:'23:00',to:'08:00'}];
  function cycleQuiet(){
    var i=0; QUIET.forEach(function(q,k){ if(JSON.stringify(q)===JSON.stringify(S.quiet)) i=k; });
    S.quiet=QUIET[(i+1)%QUIET.length]; save(); paintNote(); syncSoon();
  }
  document.addEventListener('click',function(ev){
    var b=ev.target.closest&&ev.target.closest('#kpuNote [data-kpu]'); if(!b) return;
    var k=b.getAttribute('data-kpu');
    if(k==='quiet') cycleQuiet();
    if(k==='off'){ disable(); say('Push reminders off on this device.'); }
  });

  /* ---------------- hooks into the reminder list ---------------- */
  function hook(){
    if(window.__alerts&&!__alerts.__kpu){
      var orig=__alerts.save;
      __alerts.save=function(){ var r=orig.apply(this,arguments); syncSoon(); return r; };
      __alerts.__kpu=1;
    }
    var list=document.getElementById('alertList');
    if(list&&!list.__kpu){
      list.__kpu=1;
      /* after the list's own handler has flipped it: was a reminder just switched on? */
      list.addEventListener('click',function(ev){
        var t=ev.target.closest&&ev.target.closest('.altog'); if(!t) return;
        var a=((window.__alerts&&__alerts.get())||[])[+t.getAttribute('data-i')];
        if(a&&a.on&&!S.on) setTimeout(function(){ offer(a.title); },60);
      });
    }
    var pb=document.getElementById('permBtn');
    if(pb&&!pb.__kpu){
      pb.__kpu=1;
      pb.addEventListener('click',function(){ if(!S.on&&supported()) enable().then(function(){ say('Reminders will arrive with Kova closed.'); },function(e){ say(e.message); }); });
    }
    paintNote();
  }

  /* ---------------- opening the screen a notification points at ---------------- */
  function openScreen(screen){
    if(!screen||!/^[a-z][a-z0-9_-]{0,30}$/.test(screen)) return;
    var tries=0;
    (function tryGo(){
      if(window.go&&document.getElementById('s-'+screen)&&!document.querySelector('.auth-locked')){ try{ go(screen); }catch(e){} return; }
      if(++tries<40) setTimeout(tryGo,250);
    })();
  }
  function fromUrl(){
    try{
      var q=new URLSearchParams(location.search), g=q.get('go');
      if(!g) return;
      q.delete('go');
      history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);
      openScreen(g);
    }catch(e){}
  }
  function listenNative(){
    try{ nativeSounds(); }catch(e){}
    var P=nplug(); if(!P||!P.addListener) return;
    try{ P.addListener('notificationActionPerformed',function(e){ var d=e&&e.notification&&e.notification.data||{}; openScreen(d.screen); }); }catch(e){}
  }
  function listenWeb(){
    if(S.on&&!native()&&webOk()) msg().then(function(m){ m.onMessage(function(){ /* in front: the page's own timer already showed it */ }); }).catch(function(){});
    if('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message',function(ev){
      var d=ev.data||{}; if(d&&d.kova==='open') openScreen(d.screen);
    });
  }

  function start(){
    hook(); fromUrl(); listenNative(); listenWeb();
    /* a new token after reinstall or rotation, and today's copy of the list */
    if(S.on) setTimeout(function(){ sync(); },4000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);

  return {enable:enable,disable:disable,sync:sync,items:items,payload:payload,offer:offer,active:function(){ return !!S.on; },
    supported:supported,openScreen:openScreen,_S:S,_hook:hook};
})();
