/* =====================================================================
   KovaRecipes - the bigger recipe library (p11).

   recipes.json holds 350 more recipes, 50 for each meal (breakfast,
   lunch, dinner, snack, pre-workout, post-workout, before bed). Their
   calories and macros are computed from each ingredient's weight
   (src/recipes/build.py, USDA values), so the numbers match the list.
   The file is fetched the first time Recipes opens, so it costs nothing
   at start-up; the service worker keeps it for offline use.
   ===================================================================== */
window.KovaRecipes=(function(){
  'use strict';
  var loading=null, done=false;
  function load(){
    if(done) return Promise.resolve(0);
    if(loading) return loading;
    loading=fetch('recipes.json',{cache:'force-cache'}).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(j){ done=true; return window.__addRecipes?__addRecipes(j.recipes||[]):0; })
      .catch(function(){ loading=null; return 0; });
    return loading;
  }
  function watch(){
    var s=document.getElementById('s-recipes'); if(!s) return;
    if(s.classList.contains('on')) load();
    new MutationObserver(function(){ if(s.classList.contains('on')) load(); }).observe(s,{attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',watch); else setTimeout(watch,0);
  return {load:load};
})();
