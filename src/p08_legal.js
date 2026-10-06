/* =====================================================================
   KovaLegal - the legal pieces inside the app (p14).

     - Business details in one place (KOVA_BIZ, below). Settings shows them,
       the legal pages carry them, and the Launch check goes red until the
       name, address and email are filled in.
     - The cookie banner: shown once, after sign-in or "Use Kova without
       one". Two buttons of the same size and weight, "Allow analytics" and
       "Only what is needed"; nothing analytic loads before a yes. Settings >
       Privacy choices changes it any time.
     - Settings > Legal: privacy, terms, refunds, cookies, licences, and the
       business details.
   ===================================================================== */
/* Fill these in before launch (they appear in Settings and the Launch
   check; the legal pages have the same blanks marked in red). */
window.KOVA_BIZ=window.KOVA_BIZ||{name:'',address:'',email:'',country:''};

window.KovaLegal=(function(){
  'use strict';
  var PAGES=[['privacy','Privacy policy','What Kova keeps, why, and your rights'],['terms','Terms of service','The agreement for using Kova'],
    ['refunds','Refund policy','Trials, cancelling and getting money back'],['cookies','Cookies and storage','What is stored on your device, and analytics'],
    ['licenses','Licences and credits','Fonts, icons, data and open-source software']];
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function chosen(){ return !!lsJ('kova.consent',null); }
  function allowed(){ return !!(window.KovaAnalytics&&KovaAnalytics.allowed&&KovaAnalytics.allowed()); }
  function set(yes){ try{ if(window.KovaAnalytics&&KovaAnalytics.consent) KovaAnalytics.consent(yes); else localStorage.setItem('kova.consent',JSON.stringify({a:!!yes,at:Date.now()})); }catch(e){} paintSettings(); }
  function bizFilled(){ var B=window.KOVA_BIZ||{}; return !!(B.name&&B.address&&B.email); }
  function url(p){ return '/'+p+'.html'; }

  /* ---- the banner ---- */
  function banner(){
    if(chosen()||document.getElementById('klgBanner')) return;
    var app=document.getElementById('app'); if(app&&app.classList.contains('auth-locked')) return;
    var b=document.createElement('div'); b.id='klgBanner'; b.className='klg-ban'; b.setAttribute('role','dialog'); b.setAttribute('aria-label','Privacy choices');
    b.innerHTML='<b>Your privacy</b><p>Kova keeps what it needs to work on this device: your data, settings and sign-in. With your OK it also counts which features get used (Google Analytics), never your health data. No ads, ever. <a href="'+url('cookies')+'" target="_blank" rel="noopener">Cookie policy</a></p>'
      +'<div class="klg-bb"><button data-klg="yes">Allow analytics</button><button data-klg="no">Only what is needed</button></div>';
    document.body.appendChild(b);
    requestAnimationFrame(function(){ b.classList.add('on'); });
    b.addEventListener('click',function(e){ var x=e.target.closest('[data-klg]'); if(!x) return; set(x.getAttribute('data-klg')==='yes'); b.classList.remove('on'); setTimeout(function(){ b.remove(); },300); });
  }
  /* ---- Settings: Privacy choices and Legal ---- */
  function row(id,name,sub,attrs){ return '<div class="list-item tap" id="'+id+'" '+(attrs||'')+' role="button" tabindex="0"><div style="flex:1"><div class="li-name">'+esc(name)+'</div><div class="li-sub">'+esc(sub)+'</div></div><svg class="ic" style="font-size:14px;opacity:.5"><use href="#i-chevron-right"/></svg></div>'; }
  /* the rows go straight into Settings (not a wrapper), so Settings groups
     them into its rounded panels like every other section */
  function paintSettings(){
    var scr=document.getElementById('s-settings'); if(!scr) return;
    var on=allowed(), B=window.KOVA_BIZ||{};
    var ana=document.getElementById('klgAna');
    if(!ana){
      var h1=document.createElement('div'); h1.className='sec-h'; h1.textContent='Privacy choices'; h1.setAttribute('data-klgx','1');
      ana=document.createElement('div'); ana.className='list-item'; ana.id='klgAna'; ana.setAttribute('data-klgx','1');
      var h2=document.createElement('div'); h2.className='sec-h'; h2.textContent='Legal'; h2.setAttribute('data-klgx','1');
      scr.appendChild(h1); scr.appendChild(ana); scr.appendChild(h2);
      PAGES.filter(function(p){ return p[0]!=='privacy'; }).forEach(function(p){ var r=document.createElement('div'); r.setAttribute('data-klgx','1'); r.innerHTML=row('klg-'+p[0],p[1],p[2],'data-klg="page" data-p="'+p[0]+'"'); scr.appendChild(r.firstChild); });
      var bz=document.createElement('div'); bz.innerHTML=row('klgBiz','Business details','','data-klg="biz"'); scr.appendChild(bz.firstChild);
      scr.addEventListener('click',function(e){ if(e.target.closest&&e.target.closest('#klgAna,[id^="klg-"],#klgBiz')) onSet(e); });
      scr.addEventListener('keydown',function(e){ if(e.key!=='Enter'&&e.key!==' ') return; var t=e.target.closest&&e.target.closest('[id^="klg-"],#klgBiz'); if(t){ e.preventDefault(); e.stopPropagation(); t.click(); } });
    }
    ana.innerHTML='<div style="flex:1"><div class="li-name">Usage analytics</div><div class="li-sub">'+(on?'On: which screens and features are used, never health data':'Off: nothing is counted')+'</div></div>'
      +'<button class="klg-tog'+(on?' on':'')+'" data-klg="ana" role="switch" aria-checked="'+on+'" aria-label="Usage analytics"><span></span></button>';
    var bs=document.querySelector('#klgBiz .li-sub'); if(bs) bs.textContent=bizFilled()?B.name+' · '+B.email:'Not filled in yet';
  }
  function onSet(e){
    var b=e.target.closest('[data-klg]'); if(!b) return;
    var k=b.getAttribute('data-klg');
    if(k==='ana'){ set(!allowed()); return; }
    if(k==='page'){ window.open(url(b.getAttribute('data-p')),'_blank','noopener'); return; }
    if(k==='biz'&&window.openSheet){ var B=window.KOVA_BIZ||{};
      openSheet('<div class="grab"></div><div class="klg-biz"><div class="title-s" style="font-size:19px">Business details</div>'
        +(bizFilled()?'<p><b>'+esc(B.name)+'</b><br>'+esc(B.address)+(B.country?'<br>'+esc(B.country):'')+'<br><a href="mailto:'+esc(B.email)+'">'+esc(B.email)+'</a></p>'
          :'<p>Not filled in yet. Set KOVA_BIZ in src/p08_legal.js (name, address, email, country), and the same details in the legal pages, before launch.</p>')+'</div>'); }
  }
  /* ---- the Launch check rows ---- */
  function checks(){
    var pages=PAGES.map(function(p){ return p[0]; });
    return Promise.all(pages.map(function(p){ return fetch(url(p),{cache:'no-store'}).then(function(r){ return r.ok?r.text():''; }).catch(function(){ return ''; }); })).then(function(T){
      var missing=pages.filter(function(p,i){ return !T[i]; }), blanks=pages.filter(function(p,i){ return T[i]&&/class="todo"/.test(T[i]); });
      return [{s:bizFilled()?'ok':'bad',name:'Business details in the app',fix:bizFilled()?'':'KOVA_BIZ in src/p08_legal.js: company name, registered address, support email.'},
        {s:missing.length?'bad':blanks.length?'bad':'ok',name:'Legal pages filled in',fix:missing.length?'Missing: '+missing.join(', ')+'.html':blanks.length?'Fill the red blanks (company, address, email, governing law) in: '+blanks.join(', ')+'.html. Have a lawyer read them before launch.':''}];
    });
  }
  function start(){
    /* Settings may be parked (p08_park.js): its rows go in when it opens */
    if(window.KovaPark&&KovaPark.after) KovaPark.after('s-settings',paintSettings); else paintSettings();
    /* after the welcome and first questions, never over them */
    var tries=0; (function wait(){ var app=document.getElementById('app'); if(app&&app.classList.contains('auth-locked')){ if(++tries<600) setTimeout(wait,1000); return; } setTimeout(banner,1500); })();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,500); }); else setTimeout(start,500);
  return {banner:banner,set:set,chosen:chosen,checks:checks,PAGES:PAGES,paintSettings:paintSettings};
})();
