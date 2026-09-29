/* =====================================================================
   KovaBilling - the trial button takes money (p11).

   One entitlement, "kova_pro", through RevenueCat, so it follows the
   person across the web and the app:
     - iPhone / Android: App Store / Google Play in-app purchase through
       @revenuecat/purchases-capacitor (Apple requires IAP for digital
       subscriptions inside the app);
     - web: Stripe Checkout through RevenueCat Web Billing
       (@revenuecat/purchases-js, loaded only when the plan screen needs it).
   The customer is the Firebase uid, the same one the server checks.

   Keys go in KOVA_RC next to KOVA_FB_CONFIG (public SDK keys; the secret
   key lives only on the server). Until they are set the button says
   payments are not switched on yet, and nothing is charged.

   The paywall stays honest: the price and the trial terms show before
   the store sheet opens; "Manage or cancel" is one tap from Settings and
   from the plan screen; "Restore purchases" is there for a new phone.
   The answer is cached, so a Pro phone stays Pro offline.
   ===================================================================== */
window.KovaBilling=(function(){
  'use strict';
  var KEY='kova.pro.v1', SDK='https://cdn.jsdelivr.net/npm/@revenuecat/purchases-js@1.66.0/dist/Purchases.umd.js';
  var C=lsJ(KEY,{pro:false,until:0,period:'',will:true,at:0,cancelSeen:false});
  var P=null, loading=null, pkgs=null;
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(C)); }catch(e){} }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function native(){ return !!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform()); }
  function plat(){ return native()?((Capacitor.getPlatform&&Capacitor.getPlatform())||'ios'):'web'; }
  function cfg(){ return window.KOVA_RC||{}; }
  function apiKey(){ var c=cfg(); return String((plat()==='ios'?c.ios:plat()==='android'?c.android:c.web)||''); }
  function ent(){ return cfg().entitlement||'kova_pro'; }
  function configured(){ return !!apiKey(); }
  function isPro(){ return !!C.pro&&(!C.until||C.until>Date.now()); }

  /* ---------------- the SDK ---------------- */
  function uid(){
    var FB=window.KOVA_FB;
    if(!FB||!FB.auth) return Promise.reject(new Error('Sign-in is not available right now.'));
    if(FB.auth.currentUser) return Promise.resolve(FB.auth.currentUser.uid);
    return FB.auth.signInAnonymously().then(function(c){ return c.user.uid; });
  }
  function loadWeb(){
    if(window.Purchases&&Purchases.Purchases) return Promise.resolve(Purchases.Purchases);
    if(loading) return loading;
    loading=new Promise(function(ok,no){
      var s=document.createElement('script'); s.src=SDK; s.async=true; s.crossOrigin='anonymous';
      s.onload=function(){ window.Purchases&&Purchases.Purchases?ok(Purchases.Purchases):no(new Error('Checkout did not load.')); };
      s.onerror=function(){ loading=null; no(new Error('Checkout could not load. Check your connection.')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  function sdk(){
    if(P) return Promise.resolve(P);
    if(!configured()) return Promise.reject(Object.assign(new Error('Payments are not switched on yet. Nothing was charged.'),{off:true}));
    return uid().then(function(id){
      if(native()){
        var N=Capacitor.registerPlugin?Capacitor.registerPlugin('Purchases'):(Capacitor.Plugins&&Capacitor.Plugins.Purchases);
        if(!N) throw new Error('Payments are not available in this build.');
        return N.configure({apiKey:apiKey(),appUserID:id}).then(function(){ P={kind:'native',n:N}; return P; });
      }
      return loadWeb().then(function(Cls){
        var inst=Cls.isConfigured&&Cls.isConfigured()?Cls.getSharedInstance():Cls.configure({apiKey:apiKey(),appUserId:id});
        P={kind:'web',w:inst}; return P;
      });
    });
  }

  /* the customer info -> the cached answer (+ trial/subscribe/cancel events) */
  function take(ci){
    if(!ci) return C;
    var e=ci.entitlements&&ci.entitlements.active&&ci.entitlements.active[ent()];
    var was=C.pro, prevPeriod=C.period;
    if(e){
      var exp=e.expirationDate||e.expirationDateMillis||null;
      C.until=exp?(typeof exp==='number'?exp:new Date(exp).getTime()):0;
      C.pro=true; C.period=String(e.periodType||'').toLowerCase(); C.will=e.willRenew!==false;
      if(!C.will&&!C.cancelSeen){ C.cancelSeen=true; track('cancel',{period:C.period}); }
      if(C.will) C.cancelSeen=false;
    } else { C.pro=false; C.period=''; C.until=0; }
    C.manage=ci.managementURL||C.manage||''; C.at=Date.now(); save();
    if(!was&&C.pro) track(C.period==='trial'?'trial_start':'subscribe',{plan:C.plan||'',platform:plat()});
    else if(was&&C.pro&&prevPeriod==='trial'&&C.period==='normal') track('subscribe',{plan:C.plan||'',platform:plat()});
    try{ window.dispatchEvent(new CustomEvent('kova:pro',{detail:{pro:C.pro}})); }catch(x){}
    try{ paintRows(); }catch(x){}
    return C;
  }
  function info(){
    return sdk().then(function(p){
      return p.kind==='native'?p.n.getCustomerInfo().then(function(r){ return r.customerInfo; }):p.w.getCustomerInfo();
    }).then(take);
  }

  /* the two packages, with the store's own price strings */
  function packages(){
    if(pkgs) return Promise.resolve(pkgs);
    return sdk().then(function(p){ return p.kind==='native'?p.n.getOfferings():p.w.getOfferings(); }).then(function(o){
      var cur=o&&o.current; if(!cur) throw new Error('No plans are set up in RevenueCat yet.');
      var all=cur.availablePackages||[];
      function find(id){ return cur[id==='$rc_annual'?'annual':'monthly']||all.filter(function(x){ return x.identifier===id||x.packageType===id; })[0]||null; }
      pkgs={year:find('$rc_annual'),month:find('$rc_monthly')};
      return pkgs;
    });
  }
  function priceOf(pkg){
    if(!pkg) return '';
    var pr=pkg.product||pkg.webBillingProduct||pkg.rcBillingProduct||{};
    return pr.priceString||(pr.currentPrice&&pr.currentPrice.formattedPrice)||(pr.price&&pr.price.formattedPrice)||'';
  }

  /* ---------------- buy / restore / manage ---------------- */
  function buy(plan){
    C.plan=plan; save();
    return packages().then(function(pk){
      var pkg=pk[plan]; if(!pkg) throw new Error('That plan is not set up in RevenueCat yet.');
      return sdk().then(function(p){
        return p.kind==='native'
          ? p.n.purchasePackage({aPackage:pkg}).then(function(r){ return r.customerInfo; })
          : p.w.purchase({rcPackage:pkg}).then(function(r){ return r.customerInfo; });
      });
    }).then(function(ci){
      take(ci);
      if(window.KovaLink) KovaLink.authFetch('/billing/status').catch(function(){});
      return C;
    }).catch(function(e){
      var cancelled=e&&(e.userCancelled||e.errorCode===1||String(e.code)==='1'||/cancel/i.test(e.message||''));
      if(cancelled){ var x=new Error('No change. Nothing was charged.'); x.cancelled=true; throw x; }
      throw e;
    });
  }
  function restore(){
    return sdk().then(function(p){
      return p.kind==='native'?p.n.restorePurchases().then(function(r){ return r.customerInfo; }):p.w.getCustomerInfo();
    }).then(function(ci){ take(ci); return C; });
  }
  var STORE={ios:'https://apps.apple.com/account/subscriptions',android:'https://play.google.com/store/account/subscriptions'};
  function manage(){
    var go=function(url){ if(url){ try{ window.open(url,'_blank','noopener'); }catch(e){ location.href=url; } return true; } return false; };
    if(native()&&P&&P.n&&P.n.showManageSubscriptions) return P.n.showManageSubscriptions().catch(function(){ go(STORE[plat()]); });
    if(C.manage&&go(C.manage)) return Promise.resolve();
    if(!configured()){ go(STORE[plat()]||''); return Promise.resolve(); }
    return info().then(function(){ if(!go(C.manage||STORE[plat()]||'')) say('You have no active subscription to manage.'); })
      .catch(function(){ if(!go(STORE[plat()]||'')) say('Could not open your subscription right now.'); });
  }

  /* ---------------- the plan screen ---------------- */
  function picked(){ var b=document.querySelector('#planTog .plan-opt.on'); return (b&&b.getAttribute('data-p'))||'year'; }
  function note(msg,bad){
    var f=document.getElementById('kbiMsg');
    if(!f){ var go=document.getElementById('planGo'); if(!go) return; f=document.createElement('div'); f.id='kbiMsg'; f.className='kbi-msg'; f.setAttribute('role','status'); go.parentNode.insertBefore(f,go.nextSibling); }
    f.textContent=msg||''; f.classList.toggle('bad',!!bad);
  }
  function decorate(){
    var go=document.getElementById('planGo'); if(!go||go.__kbi) return;
    go.__kbi=1;
    var trial=go.textContent;
    go.onclick=function(){
      var plan=picked();
      if(isPro()){ note('You already have Kova Pro'+(C.period==='trial'?' (free trial)':'')+'.'); return; }
      go.disabled=true; go.textContent='Opening checkout…'; note('');
      buy(plan).then(function(){
        go.textContent='You are in'; note(C.period==='trial'?'Your free trial has started. Cancel any time before it ends and you are not charged.':'Kova Pro is on.');
        setTimeout(function(){ paintRows(); },50);
      },function(e){
        go.disabled=false; go.textContent=trial;
        note(e.message||'Checkout did not complete.',!e.cancelled&&!e.off);
      });
    };
    /* billing details that match where you are */
    var fine=[].slice.call(document.querySelectorAll('#planBody .sub')).filter(function(x){ return /Billing runs through Stripe/.test(x.textContent); })[0];
    var planFine=document.getElementById('planFine');
    if(planFine&&!document.getElementById('kbiSolo')){ var so=document.createElement('div'); so.id='kbiSolo'; so.className='kbi-msg'; so.textContent='One person, one price. No seats, no team minimum.'; planFine.parentNode.insertBefore(so,planFine.nextSibling); }
    if(fine) fine.textContent=native()?(plat()==='android'?'Billed by Google Play. Kova never sees your card.':'Billed by the App Store. Kova never sees your card.'):'Checkout by Stripe through RevenueCat. Kova never sees your card.';
    /* manage + restore, one tap each */
    var box=document.createElement('div'); box.className='kbi-links';
    box.innerHTML='<button class="kbi-l" data-kbi="manage">Manage or cancel subscription</button><button class="kbi-l" data-kbi="restore">Restore purchases</button>';
    var card=go.closest('.card'); if(card) card.appendChild(box);
    box.addEventListener('click',onLink);
    /* the store's own prices when they are known */
    if(configured()) packages().then(function(pk){
      ['year','month'].forEach(function(k){
        var s=priceOf(pk[k]), el=document.querySelector('#planTog [data-p="'+k+'"] .plan-opt-p');
        if(s&&el) el.innerHTML=esc(s)+'<span>/'+(k==='year'?'yr':'mo')+'</span>';
      });
      var s2=priceOf(pk[picked()]), f=document.getElementById('planFine');
      if(s2&&f) f.textContent=f.textContent.replace(/\$[0-9.]+/,s2);
    }).catch(function(){});
    if(isPro()) note('You have Kova Pro'+(C.period==='trial'?' (free trial'+(C.until?', until '+new Date(C.until).toLocaleDateString():'')+')':'')+'.');
  }
  function onLink(ev){
    var b=ev.target.closest('[data-kbi]'); if(!b) return;
    var k=b.getAttribute('data-kbi');
    if(k==='manage'){ track('manage_subscription',{platform:plat()}); manage(); }
    if(k==='restore'){
      if(!configured()){ say('Payments are not switched on yet, so there is nothing to restore.'); return; }
      say('Checking your purchases…');
      restore().then(function(){ say(isPro()?'Kova Pro restored.':'No purchase found for this account.'); paintRows(); },function(e){ say(e.message||'Could not restore right now.'); });
    }
  }
  /* Settings > Subscription */
  function paintRows(){
    var plan=document.querySelector('#s-settings [data-go="plan"]'); if(!plan) return;
    var sub=plan.querySelector('.li-sub');
    if(sub) sub.textContent=isPro()?(C.period==='trial'?'Free trial'+(C.until?' until '+new Date(C.until).toLocaleDateString():''):'Kova Pro')+(C.will===false?' · cancelled, ends then':''):'10 days free, then yearly or monthly';
    if(document.getElementById('kbiManage')) return;
    var wrap=document.createElement('div');
    wrap.innerHTML='<div class="list-item tap" id="kbiManage" data-kbi="manage"><div class="li-ico"><svg class="ic"><use href="#i-refresh"/></svg></div><div style="flex:1"><div class="li-name">Manage or cancel subscription</div><div class="li-sub">Opens '+(plat()==='ios'?'the App Store':plat()==='android'?'Google Play':'your billing page')+' in one tap</div></div><svg class="ic" style="font-size:14px;opacity:.35"><use href="#i-chevron-right"/></svg></div>'
      +'<div class="list-item tap" id="kbiRestore" data-kbi="restore" style="margin-bottom:16px"><div class="li-ico"><svg class="ic"><use href="#i-cloud"/></svg></div><div style="flex:1"><div class="li-name">Restore purchases</div><div class="li-sub">On a new phone, or after reinstalling</div></div><svg class="ic" style="font-size:14px;opacity:.35"><use href="#i-chevron-right"/></svg></div>';
    plan.style.marginBottom='8px';
    var ref=plan.nextSibling;
    while(wrap.firstChild) plan.parentNode.insertBefore(wrap.firstChild,ref);
    ['kbiManage','kbiRestore'].forEach(function(id){ var e=document.getElementById(id); if(e) e.addEventListener('click',onLink); });
  }

  /* the server says 402: show what it needs */
  function paywall(feature){
    track('paywall_shown',{feature:feature||''});
    try{ if(window.go) go('plan'); }catch(e){}
    setTimeout(function(){ decorate(); note(feature==='chat'?'Real answers from the assistant are part of Kova Pro. The on-device guide stays free.':'This is part of Kova Pro.'); },120);
  }

  function start(){
    if(typeof window.__paintPlan==='function'&&!window.__paintPlan.__kbi){
      var orig=window.__paintPlan;
      window.__paintPlan=function(){ var r=orig.apply(this,arguments); try{ decorate(); }catch(e){} return r; };
      window.__paintPlan.__kbi=1;
    }
    decorate(); paintRows();
    /* refresh the cached answer now and then, quietly */
    if(configured()&&Date.now()-(C.at||0)>6*3600e3&&window.KOVA_FB&&KOVA_FB.auth&&KOVA_FB.auth.currentUser) setTimeout(function(){ info().catch(function(){}); },5000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);

  return {configured:configured,isPro:isPro,buy:buy,restore:restore,manage:manage,info:info,packages:packages,paywall:paywall,
    _take:take,_C:C,_decorate:decorate};
})();
