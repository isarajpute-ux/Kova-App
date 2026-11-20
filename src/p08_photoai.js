/* =====================================================================
   KovaPhotoAI - one switch for photos read by Kova's AI (p52).

   The owner: "make sure the app doesn't use my credits when I use a
   picture on the Kova app". A photo is only ever read after a tap
   (Scan, Compare, Read the report...), and the server already reads it
   with the cheaper model and never pays twice for the same photo
   (functions/photoai.js). This adds the switch in Settings, under
   Connections: "Read photos with Kova's AI". Off, no photo leaves this
   device for Kova's AI: meals, machines, form checks, reports and
   pictures given to the team all stop before anything is sent, and say
   so. A key of your own (Settings > AI) is yours to spend and is not
   blocked.
   ===================================================================== */
window.KovaPhotoAI=(function(){
  'use strict';
  var KEY='kova.photoai.v1';
  var MSG='You switched off reading photos with Kova’s AI in Settings, so this photo was not sent and no credit was used.';
  function on(){ try{ var v=JSON.parse(localStorage.getItem(KEY)||'null'); return !(v&&v.off); }catch(e){ return true; } }
  function set(v){ try{ localStorage.setItem(KEY,JSON.stringify({off:!v,at:Date.now()})); }catch(e){} paint(); }
  /* a request to Kova's own server that carries a photo */
  var PHOTO_PATH=/\/(ai\/ask|meal\/read|labs\/extract|crew\/step)(\?|$)/;
  function isPhoto(url,opts){
    var u=String(url&&url.url||url||''), b=opts&&opts.body;
    if(!PHOTO_PATH.test(u)) return false;
    if(/^https?:\/\/(api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com)\//.test(u)) return false;   /* a key of your own */
    return typeof b==='string'&&(b.indexOf('"type":"image"')>=0||/"image":"[^"]/.test(b));
  }
  function refused(){
    var body=JSON.stringify({error:MSG,photo_off:true});
    try{ return new Response(body,{status:403,headers:{'content-type':'application/json'}}); }
    catch(e){ return {ok:false,status:403,json:function(){ return Promise.resolve(JSON.parse(body)); },text:function(){ return Promise.resolve(body); }}; }
  }
  var orig=window.fetch;
  if(orig&&!orig.__kpa){
    var wrapped=function(url,opts){ if(!on()&&isPhoto(url,opts)){ try{ if(window.toast) toast('Photo reading is off in Settings'); }catch(e){} return Promise.resolve(refused()); } return orig.apply(window,arguments); };
    wrapped.__kpa=true; window.fetch=wrapped;
  }

  /* the row in Settings, under Connections */
  function row(){
    var o=on();
    return '<div class="kpa-row"><div class="kpa-t"><b>Read photos with Kova’s AI</b><small>'
      +(o?'On: a photo is read only when you tap Scan, Compare or Read, with the cheaper model, and the same photo is never paid for twice.'
         :'Off: photos are never sent to Kova’s AI, so they use no credit. Typing and talking still work.')
      +'</small></div><button type="button" class="kpa-tog'+(o?' on':'')+'" role="switch" aria-checked="'+o+'" aria-label="Read photos with Kova’s AI"><span></span></button></div>';
  }
  function paint(){
    var anchor=document.getElementById('setIntWrap'); if(!anchor) return false;
    var el=document.getElementById('kpaRow');
    if(!el){ el=document.createElement('div'); el.id='kpaRow'; el.className='card kpa'; anchor.parentNode.insertBefore(el,anchor.nextSibling);
      el.addEventListener('click',function(e){ if(e.target.closest('.kpa-tog')) set(!on()); }); }
    el.innerHTML=row(); return true;
  }
  function start(){ var n=0; (function t(){ if(!paint()&&++n<40) setTimeout(t,150); })(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
  return {on:on,set:set,isPhoto:isPhoto,paint:paint,MSG:MSG};
})();
