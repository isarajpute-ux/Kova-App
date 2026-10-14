/* KovaUpright (p28) - Kova is used upright, like the phone's home screen.
   Android honours the manifest's "orientation": "portrait" (and the lock
   below) for the installed app. iPhones ignore both for home-screen web
   apps, so a phone turned on its side gets a plain "turn your phone
   upright" screen instead of a squashed sideways layout. Tablets and
   computers are never covered: the rule only matches a short, touch-only
   screen lying on its side (p08_upright.css). */
window.KovaUpright=(function(){
  'use strict';
  function standalone(){
    try{ return (window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true; }catch(e){ return false; }
  }
  function lock(){
    try{ if(standalone()&&screen.orientation&&screen.orientation.lock) screen.orientation.lock('portrait').catch(function(){}); }catch(e){}
  }
  function build(){
    if(document.getElementById('kUpright')) return;
    var d=document.createElement('div');
    d.id='kUpright'; d.className='k-upright'; d.setAttribute('role','alert');
    d.innerHTML='<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="15" y="6" width="18" height="32" rx="4"/><path d="M21 33h6"/>'
      +'<path d="M38 26a14 14 0 0 1-14 14"/><path d="M27 37l-3 3 3 3"/></svg>'
      +'<b>Turn your phone upright</b><span>Kova is made to be used upright, the same way as your home screen.</span>';
    document.body.appendChild(d);
  }
  function on(){ build(); lock(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',on); else on();
  return {standalone:standalone,lock:lock};
})();
