/* =====================================================================
   KovaPark - closed screens wait outside the page until they are opened.

   The app builds all ~70 screens at start so every module can wire itself
   up. Once the first screen is up and the browser is idle, the content of
   every screen that is not showing moves into a parked fragment (the same
   nodes, with their listeners, canvases and form values). The page then
   holds only the screen in view, which keeps style, memory and the
   element count small.

   Nothing is hidden from the person: a screen comes back the moment it is
   opened, and also the moment any code looks inside it (by id, by
   selector, or through the screen element itself), so modules that paint
   screens in the background keep working exactly as before.
   ===================================================================== */
window.KovaPark=(function(){
  'use strict';
  if(/jsdom/i.test(navigator.userAgent||'')||typeof DocumentFragment==='undefined') return {off:true,quiet:function(fn){ return fn(); },parked:function(){ return []; }};
  var P=new Map(), IDX=new Map(), NOPE=new Map(), patched=false, hush=0, stats={parked:0,back:0,done:false};
  var D=Document.prototype, E=Element.prototype, F=DocumentFragment.prototype;
  var gid=D.getElementById, dqs=D.querySelector, dqsa=D.querySelectorAll, dgc=D.getElementsByClassName, dgt=D.getElementsByTagName;
  var eqs=E.querySelector, eqsa=E.querySelectorAll, egc=E.getElementsByClassName, egt=E.getElementsByTagName;
  var fqs=F.querySelector, fqsa=F.querySelectorAll;
  var METHODS=['appendChild','insertBefore','append','prepend','replaceChildren','removeChild','replaceChild','querySelector','querySelectorAll',
    'getElementsByClassName','getElementsByTagName','insertAdjacentHTML','insertAdjacentElement','insertAdjacentText','hasChildNodes','contains','cloneNode'];
  var PROPS=['innerHTML','outerHTML','textContent','innerText','children','childNodes','firstChild','firstElementChild','lastChild','lastElementChild','childElementCount','scrollHeight'];
  function desc(o,k){ while(o){ var d=Object.getOwnPropertyDescriptor(o,k); if(d) return d; o=Object.getPrototypeOf(o); } return null; }

  /* ---- bringing a screen back ---- */
  function unpark(shell){
    var f=P.get(shell); if(!f) return;
    P.delete(shell); NOPE.clear();
    METHODS.concat(PROPS).forEach(function(k){ delete shell[k]; });
    IDX.forEach(function(s,id){ if(s===shell) IDX.delete(id); });
    shell.insertBefore(f,shell.firstChild);
    shell.removeAttribute('data-kpark');
    stats.back++;
  }
  /* run fn without bringing anything back: for page-wide passes (the
     accessibility fixer) that also run again when a screen comes back */
  function quiet(fn){ hush++; try{ return fn(); } finally{ hush--; } }
  function unparkAll(){ Array.from(P.keys()).forEach(unpark); }
  /* the screen element itself stays in the page; touching what is inside
     it brings its content back first */
  function guard(shell){
    METHODS.forEach(function(k){ var fn=shell[k]; shell[k]=function(){ unpark(shell); return fn.apply(shell,arguments); }; });
    PROPS.forEach(function(k){ var d=desc(Object.getPrototypeOf(shell),k); if(!d) return;
      Object.defineProperty(shell,k,{configurable:true,get:function(){ unpark(shell); return d.get?d.get.call(shell):d.value; },
        set:function(v){ unpark(shell); if(d.set) d.set.call(shell,v); }}); });
  }

  /* ---- lookups from the page find parked content and bring it back ---- */
  function inside(root){ if(root===document||root===document.documentElement||root===document.body) return Array.from(P.keys());
    var out=[]; P.forEach(function(f,s){ if(root.contains(s)) out.push(s); }); return out; }
  function wake(root,sel){
    if(!P.size||hush) return;
    var shells=inside(root); if(!shells.length) return;
    var named=String(sel).match(/#s-[\w-]+/g);
    if(named) named.forEach(function(n){ var s=gid.call(document,n.slice(1)); if(s&&P.has(s)) unpark(s); });
    var key=sel, miss=NOPE.get(key);
    shells.forEach(function(s){ var f=P.get(s); if(!f) return; if(miss&&miss.has(s)) return;
      var hit=false; try{ hit=!!fqs.call(f,sel); }catch(e){ return; }
      if(hit) unpark(s); else { if(!miss){ miss=new Set(); NOPE.set(key,miss); } miss.add(s); } });
  }
  function patch(){
    if(patched) return; patched=true;
    D.getElementById=function(id){ var r=gid.call(this,id); if(r||!P.size) return r;
      var s=IDX.get(String(id)); if(s){ unpark(s); return gid.call(this,id); } return null; };
    D.querySelector=function(sel){ var r=dqs.call(this,sel); if(r&&!/#s-/.test(sel)) return r; wake(this,sel); return r||dqs.call(this,sel); };
    D.querySelectorAll=function(sel){ wake(this,sel); return dqsa.call(this,sel); };
    D.getElementsByClassName=function(c){ wake(this,'.'+String(c).trim().split(/\s+/).join('.')); return dgc.call(this,c); };
    /* '*' is a count of the whole page, not a look for something in a screen */
    D.getElementsByTagName=function(t){ if(t!=='*') wake(this,t); return dgt.call(this,t); };
    E.querySelector=function(sel){ var r=eqs.call(this,sel); if(r&&!/#s-/.test(sel)) return r; wake(this,sel); return r||eqs.call(this,sel); };
    E.querySelectorAll=function(sel){ wake(this,sel); return eqsa.call(this,sel); };
    E.getElementsByClassName=function(c){ wake(this,'.'+String(c).trim().split(/\s+/).join('.')); return egc.call(this,c); };
    E.getElementsByTagName=function(t){ if(t!=='*') wake(this,t); return egt.call(this,t); };
  }

  /* ---- parking ---- */
  function parkable(s){
    if(s.classList.contains('on')||P.has(s)||!s.firstChild) return false;
    if(s.contains(document.activeElement)) return false;
    if(eqs.call(s,'iframe')) return false;                         // moving an iframe reloads it
    var media=eqsa.call(s,'audio,video'); for(var i=0;i<media.length;i++) if(!media[i].paused) return false;
    return true;
  }
  function one(s){
    if(!parkable(s)) return 0;
    var f=document.createDocumentFragment();
    while(s.firstChild) f.appendChild(s.firstChild);
    Array.prototype.forEach.call(fqsa.call(f,'[id]'),function(e){ IDX.set(e.id,s); });
    P.set(s,f); s.setAttribute('data-kpark','');
    guard(s); NOPE.clear(); stats.parked++;
    return 1;
  }
  /* all at once (tests, or a call from the console) */
  function park(){ patch(); var n=0; Array.prototype.forEach.call(dqsa.call(document,'.screen'),function(s){ n+=one(s); }); return n; }
  /* a few screens per idle moment, so parking never holds up a tap */
  function parkSoon(){
    patch();
    var list=Array.prototype.slice.call(dqsa.call(document,'.screen')), idle=window.requestIdleCallback||function(cb){ return setTimeout(function(){ cb({timeRemaining:function(){ return 8; }}); },60); };
    function step(dl){ if(list.length) one(list.shift()); while(list.length&&dl.timeRemaining()>4) one(list.shift()); if(list.length) idle(step,{timeout:2000}); else stats.done=true; }
    idle(step,{timeout:2000});
  }
  /* opening a screen always brings it back, before go() shows it */
  function hookGo(){
    var real=window.go; if(typeof real!=='function'||real.__park) return;
    var w=function(id){ var s=gid.call(document,'s-'+id); if(s) unpark(s); if(id==='cycle'){ var v=gid.call(document,'s-vitals'); if(v) unpark(v); } return real.apply(this,arguments); };
    w.__park=1; window.go=w;
  }
  function start(){
    setTimeout(function(){ hookGo(); parkSoon(); },2500);
  }
  if(document.readyState==='complete') start(); else window.addEventListener('load',start);
  return {park:park,quiet:quiet,unpark:unpark,unparkAll:unparkAll,parked:function(){ return Array.from(P.keys()).map(function(s){ return s.id; }); },stats:stats};
})();
