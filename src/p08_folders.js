/* =====================================================================
   KovaFolders - your accounts as a small fanned row of glass folders,
   in the Studio's left sidebar under Accounts (p09).

   Reference: frosted folders standing in perspective, fanned either side
   of the one you are on; a glass card names it. Here each folder is one
   app, the row is a slider, and it sits small inside the sidebar:
     - drag, swipe, scroll sideways or use the arrow keys to slide;
     - on a mouse the folder under the pointer pops out and the card below
       shows it: connected as whom, business or personal, where it posts,
       what it takes, posts in the last 30 days, and its buttons;
     - on a phone the folder in the middle pops out as you swipe, so the
       card always shows something without hovering.
   Folders ticked for the post you are making are dark charcoal and glow.
   ===================================================================== */
window.KovaFolders=(function(){
  'use strict';
  var C=function(){ return window.KovaCanvas; }, K=function(){ return window.KovaPost; };
  var S={i:-1, hover:-1, host:null, x0:null, drag:0, moved:false};
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function list(){ return (K()&&K().ORDER)||[]; }
  function post(){ return C()&&C()._post?C()._post():null; }
  function ticked(k){ var p=post(); return !!(p&&(p.targets||[]).indexOf(k)>=0); }
  function sent(k){
    var n=0, since=Date.now()-30*864e5;
    (K().all()||[]).forEach(function(p){ var r=(p.results||{})[k]; if(r&&r.state==='ok'&&(r.at||p.updated||0)>since) n++; });
    return n;
  }
  function statusOf(k){
    var st=K().linkState(k), lab=K().label(k), A=K().ACCT[k], a=K().acct(k);
    var kind=A?(A[a||A.api]||[''])[0]:'';
    if(st==='on') return {on:1,t:'Connected'+(lab?' as '+lab:''),kind:kind};
    if(st==='manual') return {on:1,t:'You post it yourself',kind:kind};
    if(st==='unconfigured') return {t:'Needs one-time setup',kind:kind};
    if(st==='noupload') return {t:'Allow uploads',kind:kind};
    return {t:'Not connected',kind:kind};
  }

  /* drawn into the sidebar every time the sidebar is drawn */
  function mount(host){
    if(!host||!K()||!C()) return;
    S.host=host;
    if(S.i<0){ var f=list().findIndex(function(k){ return ticked(k); }); S.i=f>=0?f:0; }
    S.hover=-1;
    host.innerHTML='<div class="kfm" tabindex="0" role="group" aria-roledescription="carousel" aria-label="Your accounts">'
        +'<div class="kfm-stage"><div class="kfm-row">'+list().map(folder).join('')+'</div></div>'
        +'<div class="kfm-nav"><button data-f="prev" aria-label="Previous">‹</button><span class="kfm-n"></span><button data-f="next" aria-label="Next">›</button></div>'
        +'<div class="kfm-card" aria-live="polite"></div>'
      +'</div>';
    if(!host.__kf){ host.__kf=1; wire(host); }
    layout();
  }
  function folder(k,i){
    var st=statusOf(k), n=sent(k);
    return '<button class="kfm-f" data-i="'+i+'" data-k="'+k+'" aria-label="'+esc(K().PLAT[k].n)+', '+esc(st.t)+'">'
      +'<span class="kfm-back"></span>'
      +'<span class="kfm-tab">'+C()._icon(k)+(n?'<b>'+n+'</b>':'')+'</span>'
      +'<span class="kfm-paper"><i></i><i></i></span>'
      +'<span class="kfm-front"><span class="kfm-dot'+(st.on?' on':'')+'"></span><span class="kfm-name">'+esc(K().PLAT[k].n)+'</span></span>'
      +'</button>';
  }
  function layout(){
    var host=S.host; if(!host||!host.isConnected) return;
    var focus=S.hover>=0?S.hover:S.i;
    host.querySelectorAll('.kfm-f').forEach(function(el){
      var i=+el.getAttribute('data-i'), d=i-S.i, ad=Math.abs(d), sg=d<0?-1:1;
      var x=d===0?0:sg*(46+(ad-1)*19), rot=d===0?-6:sg*-40, z=-ad*34;
      var pop=i===focus, up=pop?-12:0;
      el.style.transform='translateX(calc(-50% + '+(x+S.drag)+'px)) translateY('+up+'px) translateZ('+(z+(pop?28:0))+'px) rotateY('+rot+'deg)';
      el.style.zIndex=String(100-ad+(pop?50:0));
      el.style.opacity=ad>6?'0':'1';
      el.classList.toggle('focus',pop);
      el.classList.toggle('lit',ticked(el.getAttribute('data-k')));
    });
    var n=host.querySelector('.kfm-n'); if(n) n.textContent=(S.i+1)+' / '+list().length;
    card();
  }
  function card(){
    var el=S.host&&S.host.querySelector('.kfm-card'); if(!el) return;
    var i=S.hover>=0?S.hover:S.i, k=list()[i]; if(!k) return;
    var P=K().PLAT[k], st=statusOf(k), n=sent(k), p=post(), on=ticked(k);
    var places=K().PLACES[k]||null, cur=p&&places?K().placeName(p,k):'';
    var kinds=Object.keys(P.kinds||{}).map(function(x){ return {image:'Photo',slider:'Slider',video:'Video',text:'Text'}[x]; }).join(' · ');
    var chk=p&&on?K().check(p,k,K().linkState(k)):null;
    el.innerHTML='<div class="kfm-ch"><span class="kfm-ci">'+C()._icon(k)+'</span><b>'+esc(P.n)+'</b>'
        +'<span class="kfm-big">'+n+'<small> posts · 30 d</small></span><i class="kfm-glow'+(st.on?' on':'')+'"></i></div>'
      +'<div class="kfm-cs">'+esc(st.t)+(st.kind?' · '+esc(st.kind):'')+'</div>'
      +'<div class="kfm-meta">'+esc(kinds)+(P.text?' · '+P.text.toLocaleString('en-US')+' chars':'')+'</div>'
      +(places?'<div class="kfm-places">'+places.map(function(x){ return '<span class="'+(on&&x[1]===cur?'on':'')+'">'+esc(x[1])+'</span>'; }).join('')+'</div>':'')
      +(chk&&!chk.ok?'<div class="kfm-warn">'+esc(chk.problems[0])+'</div>':'')
      +'<div class="kfm-acts">'
        +(st.on?'<button class="kfm-b'+(on?' on':'')+'" data-f="tick" data-k="'+k+'">'+(on?'✓ In this post':'Use in post')+'</button>'
               :'<button class="kfm-b on" data-f="connect" data-k="'+k+'">Connect</button>')
        +(places&&on?'<button class="kfm-b" data-f="place" data-k="'+k+'">'+esc(cur)+'</button>':'')
        +(K().ACCT[k]?'<button class="kfm-b" data-f="acct" data-k="'+k+'">Business / personal</button>':'')
        +(!st.on&&K().HAND[k]?'<button class="kfm-b" data-f="hand" data-k="'+k+'">Post it myself</button>':'')
      +'</div>';
  }

  function go(i){ S.i=Math.max(0,Math.min(list().length-1,i)); S.hover=-1; layout(); }
  function wire(host){
    host.addEventListener('click',function(e){
      if(S.moved){ S.moved=false; return; }
      var b=e.target.closest('[data-f]'), f=e.target.closest('.kfm-f');
      if(f&&!b){ e.stopPropagation(); go(+f.getAttribute('data-i')); return; }
      if(!b||!host.contains(b)) return;
      e.stopPropagation();
      var a=b.getAttribute('data-f'), k=b.getAttribute('data-k'), c=C();
      if(a==='prev') return go(S.i-1);
      if(a==='next') return go(S.i+1);
      if(a==='tick'){ c._toggle(k); return; }
      if(a==='connect'){ c.connect(k); return; }
      if(a==='place'){ c._place(k); return; }
      if(a==='acct'){ c._acct(k); return; }
      if(a==='hand'){ c._hand(k); return; }
    });
    host.addEventListener('keydown',function(e){
      if(!e.target.classList||!e.target.classList.contains('kfm')) return;
      if(e.key==='ArrowRight'){ e.preventDefault(); go(S.i+1); }
      else if(e.key==='ArrowLeft'){ e.preventDefault(); go(S.i-1); }
    });
    /* a mouse pops out the folder under it */
    host.addEventListener('pointerover',function(e){
      if(e.pointerType!=='mouse') return;
      var f=e.target.closest('.kfm-f'); if(!f) return;
      var i=+f.getAttribute('data-i'); if(i!==S.hover){ S.hover=i; layout(); }
    });
    host.addEventListener('pointerleave',function(){ if(S.hover>=0){ S.hover=-1; layout(); } });
    /* drag / swipe the row */
    host.addEventListener('pointerdown',function(e){ if(!e.target.closest('.kfm-stage')) return; S.x0=e.clientX; S.drag=0; S.moved=false; });
    host.addEventListener('pointermove',function(e){
      if(S.x0==null) return;
      S.drag=e.clientX-S.x0;
      if(Math.abs(S.drag)>5){ S.moved=true; S.hover=-1; }
      if(Math.abs(S.drag)>17){ var d=S.drag<0?1:-1; S.x0=e.clientX; S.drag=0; S.i=Math.max(0,Math.min(list().length-1,S.i+d)); }
      layout();
    });
    var up=function(){ if(S.x0==null) return; S.x0=null; S.drag=0; layout(); };
    host.addEventListener('pointerup',up); host.addEventListener('pointercancel',up);
    var wT=0;
    host.addEventListener('wheel',function(e){
      if(!e.target.closest('.kfm-stage')||Math.abs(e.deltaX)<=Math.abs(e.deltaY)) return;
      e.preventDefault();
      var t=Date.now(); if(t-wT<120) return; wT=t;
      go(S.i+(e.deltaX>0?1:-1));
    },{passive:false});
  }
  return {mount:mount, go:go, _state:S};
})();
