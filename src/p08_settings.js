/* =====================================================================
   KovaSettingsGroups - Settings as grouped lists (p13).

   Everything in Settings stays exactly as it was: same rows, same order,
   same taps. What changes is the arrangement: each heading ("Appearance",
   "Data & privacy", ...) now holds its rows in one rounded panel with thin
   lines between them, instead of every row being its own card with a gap
   under it. Less scrolling, and the sections read as sections.

   Rows are only moved into their section's panel; they keep their ids and
   handlers. Modules that add rows later (backup, import, privacy, recap,
   billing, friends) insert next to an existing row, so they land inside
   the right panel; anything appended straight to the screen is picked up
   by a watcher and placed in the section it follows.
   ===================================================================== */
window.KovaSettingsGroups=(function(){
  'use strict';
  var busy=false;
  function group(){
    var s=document.getElementById('s-settings'); if(!s||busy||s.hasAttribute('data-kpark')) return;
    busy=true;
    try{
      var cur=null, kids=[].slice.call(s.children);
      kids.forEach(function(el){
        if(el.classList.contains('sec-h')){
          var nx=el.nextElementSibling;
          if(nx&&nx.classList.contains('setg')) cur=nx;
          else { cur=document.createElement('div'); cur.className='setg card'; cur.setAttribute('role','group'); cur.setAttribute('aria-label',el.textContent.trim()); s.insertBefore(cur,nx); }
          return;
        }
        if(!cur||el===cur||el.classList.contains('setg')||el.classList.contains('hdr')) return;
        cur.appendChild(el);                       // keeps its place: sections are walked in order
      });
    }finally{ busy=false; }
  }
  function start(){
    group();
    var s=document.getElementById('s-settings');
    if(s&&window.MutationObserver) new MutationObserver(function(){ if(!busy) setTimeout(group,0); }).observe(s,{childList:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);
  return {group:group};
})();
