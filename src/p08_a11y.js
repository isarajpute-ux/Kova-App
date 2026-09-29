/* =====================================================================
   KovaA11y - the accessibility pass (p11), applied to everything the app
   draws, including sheets and screens rendered later:
     - every icon-only control gets a name (the back chevron is "Back",
       the x is "Close"), so VoiceOver / TalkBack read what it does;
     - every text field gets a label (its placeholder, or the text next
       to it) instead of relying on the placeholder alone;
     - anything clickable that is not a real button can be reached with
       Tab and pressed with Enter or Space;
     - icons inside labelled controls are hidden from screen readers, and
       a chart gets a name from its card ("Weight trend, chart").
   Styles (p08_a11y.css): a visible focus ring, reduced motion honoured
   everywhere, and 44 pt tap areas for the small round icon buttons.
   ===================================================================== */
window.KovaA11y=(function(){
  'use strict';
  var ICON={'i-chevron-left':'Back','i-x':'Close','i-plus':'Add','i-chevron-down':'Show more','i-chevron-up':'Show less',
    'i-arrow-up-right':'Open','i-arrow-right':'Next','i-sparkles':'Ask Kova','i-search':'Search','i-clipboard-text':'Notes',
    'i-bell':'Reminders','i-device-mobile':'Devices','i-barbell':'Workout','i-player-play':'Play','i-player-pause':'Pause','i-refresh':'Refresh',
    'i-cloud':'Sync','i-video':'Video','i-camera':'Camera','i-target':'Goals','i-info-circle':'About this','i-settings':'Settings','i-focus-2':'Focus',
    'i-arrows-shuffle':'Shuffle','i-adjustments':'Adjust','i-heartbeat':'Heart rate','i-dots':'More options','i-list-details':'Details',
    'i-wave-sine':'Sounds','i-pencil':'Edit','i-trash':'Delete','i-seedling':'Habits','i-flag':'Report','i-check':'Done',
    'i-tools-kitchen-2':'Recipes','i-book-2':'Learn','i-headphones':'Listen','i-share':'Share','i-download':'Download','i-upload':'Upload'};
  var GLYPH={'×':'Close','✕':'Close','✖':'Close','‹':'Back','←':'Back','›':'Next','→':'Next','+':'Add','⋯':'More options','…':'More options','⋮':'More options'};
  var CONTROL='button,a[href],[role="button"],[onclick],.iconbtn,.back';
  var INTERACTIVE='button,a[href],input,select,textarea,[role="button"],[tabindex]';

  function txt(el){ return (el.textContent||'').replace(/\s+/g,' ').trim(); }
  function named(el){ return !!(el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.getAttribute('title')); }
  function human(s){ s=String(s||'').replace(/^(k|ks|kb|wq|op)(?=[A-Z])/,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]+/g,' ').trim(); return s?s.charAt(0).toUpperCase()+s.slice(1).toLowerCase():''; }
  function iconName(el){
    var u=el.querySelector('use'); if(!u) return '';
    var id=(u.getAttribute('href')||u.getAttribute('xlink:href')||'').replace('#','');
    return ICON[id]||human(id.replace(/^i-/,''));
  }
  /* an icon-only div wired by delegation carries a data- attribute (data-go,
     data-act, ...); reading attributes avoids a style recalculation */
  function delegated(el){ for(var i=0;i<el.attributes.length;i++){ if(el.attributes[i].name.indexOf('data-')===0) return true; } return /cursor:\s*pointer/.test(el.getAttribute('style')||''); }

  /* icon-only or glyph-only controls */
  function controls(root){
    var list=root.querySelectorAll('svg use');
    for(var i=0;i<list.length;i++){
      var el=list[i].closest(CONTROL)||list[i].closest('div,span');
      if(!el||named(el)||el.__a11y) continue;
      el.__a11y=1;
      if(txt(el)) continue;
      if(!(el.matches(CONTROL)||delegated(el))) continue;
      var n=iconName(el); if(n) el.setAttribute('aria-label',n);
    }
    var g=root.querySelectorAll(CONTROL);
    for(var j=0;j<g.length;j++){
      var b=g[j]; if(named(b)) continue;
      var t=txt(b); if(t.length===1&&GLYPH[t]) b.setAttribute('aria-label',GLYPH[t]);
    }
  }
  /* clickable things that are not buttons: reachable by keyboard */
  function clickables(root){
    var list=root.querySelectorAll('[onclick]:not(button):not(a):not(input):not(select):not(textarea):not(label):not(body):not([tabindex]),.iconbtn:not(button):not([tabindex]),.back:not(button):not(a):not([tabindex]),[role="button"]:not(button):not([tabindex])');
    for(var i=0;i<list.length;i++){
      var el=list[i];
      if(el.querySelector(INTERACTIVE)) continue;            // a card holding its own buttons stays as it is
      if(!el.getAttribute('role')) el.setAttribute('role','button');
      el.setAttribute('tabindex','0');
    }
  }
  /* fields: a label, not just a placeholder */
  function fields(root){
    var list=root.querySelectorAll('input:not([type="hidden"]):not([aria-label]):not([aria-labelledby]),select:not([aria-label]):not([aria-labelledby]),textarea:not([aria-label]):not([aria-labelledby])');
    for(var i=0;i<list.length;i++){
      var el=list[i];
      if(el.closest('label')||el.title||(el.id&&root.querySelector&&document.querySelector('label[for="'+el.id+'"]'))) continue;
      var n=el.getAttribute('placeholder');
      if(!n||/^[—\-–]$/.test(n)){
        var p=el.previousElementSibling, pt=p&&!p.matches(INTERACTIVE)?txt(p):'';
        if(pt&&pt.length<=40) n=pt;
      }
      if(!n||/^[—\-–]$/.test(n)) n=human(el.getAttribute('data-f')||el.getAttribute('data-k')||el.getAttribute('name')||el.id||'');
      if(!n&&el.type==='range') n='Level';
      if(n) el.setAttribute('aria-label',n);
    }
  }
  /* icons inside named things are decoration; big drawings are charts */
  function svgs(root){
    var list=root.querySelectorAll('svg:not([aria-hidden]):not([role])');
    for(var i=0;i<list.length;i++){
      var s=list[i];
      if(s.closest('defs,symbol')||s.querySelector('title')){ continue; }
      var vb=(s.getAttribute('viewBox')||'').split(/[\s,]+/), w=+(s.getAttribute('width')||vb[2]||0);
      var shapes=s.querySelectorAll('path,rect,circle,line,polyline,polygon').length;
      if(w>=80&&shapes>=3&&!s.closest(CONTROL)){
        var card=s.closest('.card,section,[class*="card"]'), head=card&&card.querySelector('h1,h2,h3,.title-s,.lbl,.label,.k-label,b,strong');
        var name=head?txt(head).slice(0,60):'';
        s.setAttribute('role','img'); s.setAttribute('aria-label',(name?name+', ':'')+'chart');
      } else s.setAttribute('aria-hidden','true');
    }
  }
  function fix(root){
    root=root||document.body; if(!root||!root.querySelectorAll) return;
    try{ controls(root); clickables(root); fields(root); svgs(root); }catch(e){}
  }

  /* Enter / Space press a role=button that is not a real button */
  function onKey(ev){
    if(ev.key!=='Enter'&&ev.key!==' ') return;
    var el=ev.target; if(!el||!el.getAttribute) return;
    if(el.getAttribute('role')!=='button'||/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
    ev.preventDefault(); el.click();
  }

  var pending=null;
  function soon(){ if(pending) return; pending=setTimeout(function(){ pending=null; fix(document.body); },250); }
  function start(){
    fix(document.body);
    document.addEventListener('keydown',onKey);
    if(window.MutationObserver) new MutationObserver(soon).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);

  return {fix:fix,ICON:ICON};
})();
