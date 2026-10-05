/* =====================================================================
   KovaLaunch - the hidden Launch check (p12).

   Settings > About > tap "Version" 7 times. One row per thing Kova needs
   before launch, green when it is set, red (or amber when optional) with
   the exact thing to set and where. The server's GET /api/ping reports
   which of its keys exist as yes/no; nothing secret is shown here or sent
   there, only whether each one is set.
   ===================================================================== */
window.KovaLaunch=(function(){
  'use strict';
  var TAPS=7, WINDOW=3000, taps=[];
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function native(){ return !!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform()); }
  var NETLIFY='Netlify › Site configuration › Environment variables';
  var OAUTH=[['google','Google (sign-in, Calendar, YouTube)','GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET','console.cloud.google.com › APIs & Services › Credentials'],
    ['instagram','Instagram','INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET','developers.facebook.com › your app'],
    ['facebook','Facebook and Meta Ads','FACEBOOK_APP_ID + FACEBOOK_APP_SECRET','developers.facebook.com › your app'],
    ['threads','Threads','THREADS_APP_ID + THREADS_APP_SECRET','developers.facebook.com › Threads use case'],
    ['tiktok','TikTok','TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET','developers.tiktok.com'],
    ['linkedin','LinkedIn','LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET','linkedin.com/developers'],
    ['x','X','X_CLIENT_ID + X_CLIENT_SECRET','developer.x.com'],
    ['pinterest','Pinterest','PINTEREST_APP_ID + PINTEREST_APP_SECRET','developers.pinterest.com'],
    ['reddit','Reddit','REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET','reddit.com/prefs/apps'],
    ['tumblr','Tumblr','TUMBLR_CLIENT_ID + TUMBLR_CLIENT_SECRET','tumblr.com/oauth/apps']];

  /* the server's answer: {reach, has} */
  function ping(){
    var base=window.KovaLink&&KovaLink.server?KovaLink.server():'/api';
    var done=false;
    return Promise.race([
      fetch(base+'/ping',{cache:'no-store'}).then(function(r){ done=true; return r.ok?r.json().then(function(j){ return {reach:true,has:(j&&j.has)||null}; }):{reach:false,status:r.status}; }),
      new Promise(function(ok){ setTimeout(function(){ if(!done) ok({reach:false,status:'timeout'}); },6000); })
    ]).catch(function(){ return {reach:false,status:'offline'}; });
  }
  function health(){
    if(!native()) return Promise.resolve(null);
    try{ return window.KovaNative&&KovaNative.available?KovaNative.available():Promise.resolve(false); }catch(e){ return Promise.resolve(false); }
  }

  /* one row: s = 'ok' | 'bad' | 'opt' | 'na' */
  function row(s,name,fix){ return {s:s,name:name,fix:fix||''}; }
  function rows(P,H){
    var R=[], has=P.has||{}, o=has.oauth||{};
    var fb=window.KOVA_FB||{}, rc=window.KOVA_RC||{}, vap=String(window.KOVA_FB_VAPID||'');
    var knows=!!P.has;    // an older server reports reach only
    /* with no server yet, its keys cannot be checked: grey, not red */
    var srv=function(ok,name,fix,optional){ return !P.reach?row('wait',name,'Needs the server first. Then: '+fix):row(!knows?'bad':ok?'ok':optional?'opt':'bad',name,!knows?'Update the server: its /api/ping does not list keys yet.':ok?'':fix); };

    R.push({head:'This app'});
    R.push(row(fb.ok&&fb.auth?'ok':'bad','Firebase (sign-in and sync)','KOVA_FB_CONFIG in index.html, from Firebase console › Project settings › Your apps.'));
    R.push(row(rc.web?'ok':'bad','Payments on the web (RevenueCat web key)','KOVA_RC.web in index.html: RevenueCat › Project settings › API keys (the public Web Billing key). Stripe is connected inside RevenueCat › Web Billing.'));
    R.push(row(rc.ios?'ok':'bad','Payments on iPhone (App Store)','KOVA_RC.ios in index.html: RevenueCat › API keys (the public Apple key).'));
    R.push(row(rc.android?'ok':'bad','Payments on Android (Google Play)','KOVA_RC.android in index.html: RevenueCat › API keys (the public Google key).'));
    R.push(row(vap?'ok':'bad','Web push key (VAPID)','KOVA_FB_VAPID in index.html: Firebase console › Project settings › Cloud Messaging › Web Push certificates › Key pair.'));

    R.push({head:'Server'});
    R.push(row(P.reach?'ok':'bad','Server reachable (/api/ping)',P.reach?'':'Deploy the site on Netlify (it runs netlify/functions/api.mjs), then open '+(window.KovaLink&&KovaLink.server?KovaLink.server():'/api')+'/ping. Answered: '+esc(P.status||'nothing')+'.'));
    R.push(srv(has.firebaseAdmin,'Database, delete and sending push (Firebase Admin)','FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in '+NETLIFY+', from Firebase console › Project settings › Service accounts › Generate new private key.'));
    R.push(srv(has.ai,'AI answers (chat, meal photos, labs, AI team)','ANTHROPIC_API_KEY in '+NETLIFY+', from console.anthropic.com › API keys. Without it Kova uses its on-device guide.',true));
    R.push(srv(has.revenuecat,'Payments check on the server (RevenueCat secret)','REVENUECAT_SECRET_KEY in '+NETLIFY+': RevenueCat › API keys › Secret key. Until set, nothing is behind the paywall.'));
    R.push(srv(has.revenuecatWebhook,'Subscription updates (RevenueCat webhook)','REVENUECAT_WEBHOOK_AUTH in '+NETLIFY+', and the same value in RevenueCat › Integrations › Webhooks, pointed at /api/billing/webhook.'));
    R.push(srv(has.email,'Email (assistant replies, reports)','RESEND_API_KEY in '+NETLIFY+', from resend.com › API keys.',true));
    R.push(srv(has.usda,'USDA food search (own key)','FDC_API_KEY in '+NETLIFY+', free from api.data.gov. The shared DEMO_KEY works but is rate-limited.',true));
    R.push(srv(has.tokenKey,'Token encryption key','KOVA_TOKEN_KEY (32+ random characters) in '+NETLIFY+'. Without it the key is derived from the Firebase key.',true));
    R.push({head:'Sign-in and publishing'});
    OAUTH.forEach(function(p){ R.push(srv(!!o[p[0]],p[1],p[2]+' in '+NETLIFY+', from '+p[3]+'.',p[0]!=='google')); });

    R.push({head:'This device'});
    R.push(native()?row(H?'ok':'bad','Apple Health / Health Connect',H?'':'Install the Kova app build with the Health plugin (native/README.md), and on Android install Health Connect.')
      :row('na','Apple Health / Health Connect','Only inside the iPhone and Android app.'));
    var perm=typeof Notification==='undefined'?'unsupported':Notification.permission;
    var pushOn=!!(window.KovaPush&&KovaPush.active&&KovaPush.active());
    R.push(row(pushOn?'ok':perm==='denied'?'bad':perm==='unsupported'?'na':'opt','Push notifications on this device',pushOn?'':perm==='denied'?'Blocked in this browser’s site settings.':perm==='unsupported'?'This browser cannot receive them; the app can.':'Turn on any reminder and allow notifications when asked.'));
    return R;
  }
  var LABEL={ok:'Set',bad:'Missing',opt:'Optional',na:'Not here',wait:'After server'};
  function paint(R,P){
    var el=document.querySelector('#sheetIn .kla'); if(!el) return;
    var n={ok:0,bad:0,opt:0,wait:0};
    R.forEach(function(r){ if(r.s&&n[r.s]!=null) n[r.s]++; });
    el.innerHTML='<div class="title-s" style="font-size:19px">Launch check</div>'
      +'<div class="kla-sum" role="status">'+n.ok+' set · '+n.bad+' missing · '+n.opt+' optional'+(n.wait?' · '+n.wait+' to check once the server is up':'')+'</div>'
      +R.map(function(r){
        if(r.head) return '<div class="kla-h">'+esc(r.head)+'</div>';
        return '<div class="kla-r '+r.s+'"><span class="kla-dot" aria-hidden="true"></span><div class="kla-t"><b>'+esc(r.name)+'</b>'
          +(r.fix?'<span>'+esc(r.fix)+'</span>':'')+'</div><span class="kla-s">'+LABEL[r.s]+'</span></div>';
      }).join('')
      +'<div class="kla-foot">Only whether each key is set is checked. No key is shown or sent.</div>'
      +'<button class="btn" data-kla="again" style="margin-top:12px">Check again</button>';
  }
  function open(){
    if(!window.openSheet) return;
    openSheet('<div class="grab"></div><div class="kla"><div class="title-s" style="font-size:19px">Launch check</div><div class="kla-sum" role="status">Checking…</div></div>');
    var el=document.querySelector('#sheetIn .kla');
    if(el) el.addEventListener('click',function(ev){ if(ev.target.closest('[data-kla="again"]')) run(); });
    return run();
  }
  function run(){
    var legal=window.KovaLegal&&KovaLegal.checks?KovaLegal.checks().catch(function(){ return []; }):Promise.resolve([]);
    return Promise.all([ping(),health(),legal]).then(function(r){ var R=rows(r[0],r[1]); if(r[2].length){ R.push({head:'Legal'}); R=R.concat(r[2]); } paint(R,r[0]); return R; });
  }

  /* 7 taps on Version within 3 seconds */
  function onTap(){
    var now=Date.now(); taps=taps.filter(function(t){ return now-t<WINDOW; }); taps.push(now);
    if(taps.length>=TAPS){ taps=[]; open(); return true; }
    return false;
  }
  function hook(){
    var rows=[].slice.call(document.querySelectorAll('#s-settings .list-item')).filter(function(r){ var n=r.querySelector('.li-name'); return n&&n.textContent.trim()==='Version'; });
    var v=rows[0]; if(!v||v.__kla) return;
    v.__kla=1;
    /* the version toast stays for one tap; the 7th opens the check */
    v.addEventListener('click',function(ev){ if(onTap()){ ev.stopImmediatePropagation(); } },true);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',hook); else setTimeout(hook,0);

  return {open:open,rows:rows,ping:ping,_tap:onTap};
})();
