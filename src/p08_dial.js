/* p43: the dial, after the owner's Ron Design Lab reference ("press one
   button and all of them pop up all around... it's not like buttons, it's
   kind of like a slider... get it exactly right"). Glass arc segments sit
   round a glowing centre button and pop out from it; they slide round a
   track (drag, swipe, the wheel, the arrow keys, or tap one) and the one in
   the slot at the bottom grows outward and lightens: that is the choice. A
   gap is left at the top left, as in the reference, where segments slide
   out of sight. Used by Exercises, Stretch and the attachment picker; each
   page draws its own card under it (.kdl-card).

   KovaDial.mount(el, {items:[{id,label,icon}], sel, onPick(i,item),
     centre:{icon:'dot'|'swap'|'play', label, onTap}}) -> {set, swap, pop, sel}
   KovaDial.mus(group) gives a segment icon for a body part. */
window.KovaDial=(function(){
  'use strict';
  /* the geometry, in a 320 x 320 box (centre 160): the slot sits a little
     right of straight down, as in the reference */
  var C=160, STEP=52, W=47, SLOT=80, RI=74, RO=132, GROW=19, LO=-66, HI=230, FADE=28;
  var N=0;
  function P(r,a){ a=a*Math.PI/180; return [C+r*Math.cos(a),C+r*Math.sin(a)]; }
  /* an arc segment with soft corners: each corner is a curve from the
     straight side onto the arc; k scales it to pixels (for the glass layer) */
  function seg(ri,ro,a0,a1,cr,k){
    k=k||1;
    var pt=function(r,a){ var q=P(r,a); return (q[0]*k).toFixed(1)+' '+(q[1]*k).toFixed(1); };
    var dO=cr/ro*57.3, dI=cr/ri*57.3, big=(a1-a0)>180?1:0, RO=(ro*k).toFixed(1), RI=(ri*k).toFixed(1);
    return 'M'+pt(ro-cr,a0)+'Q'+pt(ro,a0)+' '+pt(ro,a0+dO)
      +'A'+RO+' '+RO+' 0 '+big+' 1 '+pt(ro,a1-dO)
      +'Q'+pt(ro,a1)+' '+pt(ro-cr,a1)
      +'L'+pt(ri+cr,a1)+'Q'+pt(ri,a1)+' '+pt(ri,a1-dI)
      +'A'+RI+' '+RI+' 0 '+big+' 0 '+pt(ri,a0+dI)
      +'Q'+pt(ri,a0)+' '+pt(ri+cr,a0)+'Z';
  }
  /* real frosted glass (the page behind blurred and lit through each
     segment) where the browser can clip to a path; else the drawn glass */
  var GLASS=false; try{ GLASS=!!(window.CSS&&CSS.supports&&(CSS.supports('clip-path','path("M0 0L1 1Z")')||CSS.supports('-webkit-clip-path','path("M0 0L1 1Z")'))); }catch(e){}
  function clamp(x,a,b){ return x<a?a:x>b?b:x; }
  function ease(t){ return 1-Math.pow(1-t,3); }
  function back(t){ var c=1.45; return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2); }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  var reduce=false; try{ reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var raf=window.requestAnimationFrame?function(f){ return requestAnimationFrame(f); }:function(f){ return setTimeout(function(){ f(Date.now()); },16); };
  function now(){ return window.performance&&performance.now?performance.now():Date.now(); }

  /* ---------- segment icons ---------- */
  /* p43c: hand-drawn body-part icons (the owner: the old ones, cut from the body map, did not read): a leg in profile lit at the front (quads), back (hamstrings) or calf, glutes, a chest, a back with lats, shoulders, a flexed arm, abs, a pull-up */
  var MI={"all":"<rect x=\"4\" y=\"4\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"13\" y=\"4\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"4\" y=\"13\" width=\"7\" height=\"7\" rx=\"2\"/><rect class=\"f\" x=\"13\" y=\"13\" width=\"7\" height=\"7\" rx=\"2\"/>","Quads":"<path d=\"M6.2 2.2h4.2c.6 3.2.6 6.4 1.8 9.6.4 1 .4 2-.2 3l-1 4.8 5.2 1.4c1 .3 1.4 1.4.4 1.8H8.8c-.6 0-1-.5-.9-1l.3-2.2c-1.4-1.6-2.2-3.6-1.4-5.8l.4-1.4C5.8 9.6 5.2 6.2 6.2 2.2Z\"/><path class=\"f\" d=\"M10.2 3.4c.6 2.8.8 5.6 1.8 8.2-1.6-.4-2.6-1.8-3-3.6-.4-1.8.2-3.4 1.2-4.6Z\"/>","Glutes":"<path d=\"M3.8 6.6c1.6-1.6 4.6-2.6 8.2-2.6s6.6 1 8.2 2.6\"/><path d=\"M3.8 6.6c-.8 3.4-.8 7 .6 10.2M20.2 6.6c.8 3.4.8 7-.6 10.2\"/><path class=\"f\" d=\"M12 9.2c-1.4-1.8-3.4-2.4-5.4-1.6C4.2 8.6 3.4 11.6 4.6 14.6c1.2 3 4.2 4.4 7.4 3.4ZM12 9.2c1.4-1.8 3.4-2.4 5.4-1.6 2.4 1 3.2 4 2 7-1.2 3-4.2 4.4-7.4 3.4Z\"/><path d=\"M12 8.6v10.2\"/><path d=\"M6.4 19.6c1.6 1.2 3.6 1.4 5.6.6M17.6 19.6c-1.6 1.2-3.6 1.4-5.6.6\"/>","Hamstrings":"<path d=\"M6.2 2.2h4.2c.6 3.2.6 6.4 1.8 9.6.4 1 .4 2-.2 3l-1 4.8 5.2 1.4c1 .3 1.4 1.4.4 1.8H8.8c-.6 0-1-.5-.9-1l.3-2.2c-1.4-1.6-2.2-3.6-1.4-5.8l.4-1.4C5.8 9.6 5.2 6.2 6.2 2.2Z\"/><path class=\"f\" d=\"M6.6 3.2c-.8 3-.4 5.8 1.2 8.2 1-1.6 1.2-3.6.8-5.6-.2-1.2-.9-2.2-2-2.6Z\"/>","Chest":"<path d=\"M3.4 6.6C6 4.8 9 4.4 12 5.4c3-1 6-.6 8.6 1.2\"/><path d=\"M3.4 6.6c-.6 4 0 8.4 1.6 12.4M20.6 6.6c.6 4 0 8.4-1.6 12.4\"/><path class=\"f\" d=\"M11.6 6.4c-2.6-.9-5.4-.4-7 .9-.6 2.6 0 5.4 1.8 6.8 2 1.6 4.4 1.4 5.2-.4ZM12.4 6.4c2.6-.9 5.4-.4 7 .9.6 2.6 0 5.4-1.8 6.8-2 1.6-4.4 1.4-5.2-.4Z\"/><path d=\"M12 6v8.2\"/>","Back":"<path d=\"M4.6 4.6h14.8\"/><path d=\"M4.6 4.6c-.8 2.6-.4 5 1.2 7.4l1.8 8.4h8.8l1.8-8.4c1.6-2.4 2-4.8 1.2-7.4\"/><path class=\"f\" d=\"M6 6.6c.6 3.6 2.6 7 5.4 9.6l-.2-6.6ZM18 6.6c-.6 3.6-2.6 7-5.4 9.6l.2-6.6Z\"/><path d=\"M8.4 4.6L12 8l3.6-3.4\"/><path d=\"M12 6.8v13.4\" stroke-width=\".9\"/>","Shoulders":"<circle cx=\"12\" cy=\"4.2\" r=\"2.4\"/><path d=\"M8 9.6c1.2-1 2.6-1.6 4-1.6s2.8.6 4 1.6\"/><path class=\"f\" d=\"M7.6 9.4C4.8 9.4 3 11.8 3.2 15.2l.4 3.4h3.4c.8-2.6 1.4-5.6.6-9.2ZM16.4 9.4c2.8 0 4.6 2.4 4.4 5.8l-.4 3.4H17c-.8-2.6-1.4-5.6-.6-9.2Z\"/><path d=\"M7.6 9.4C4.8 9.4 3 11.8 3.2 15.2l.4 3.4h3.4M16.4 9.4c2.8 0 4.6 2.4 4.4 5.8l-.4 3.4H17M8 9.6l-.4 11.6M16 9.6l.4 11.6\"/>","Arms":"<path d=\"M4.4 20.4h7.4c4.8 0 8.4-2.8 8.4-6.6 0-3.4-2.6-5.6-5.6-5.2-1.6.2-2.8 1.2-3.2 2.4\"/><path d=\"M11.4 11c-.6-1.4-2-2.2-3.6-2l-.6-3.6c1-.4 1.6-1.4 1.4-2.4-.2-1.2-1.4-2-2.6-1.6l-1.8.6c-1.2.4-1.8 1.6-1.4 2.8l2 6.6-.4 9\"/><path class=\"f\" d=\"M11.6 11.4c1-1.8 3.4-2.4 5.4-1.4 2 1.2 2.4 3.8 1 5.6-1.6 2-4.6 2.2-6.4.6Z\"/>","Core":"<path d=\"M6.6 3h10.8c.8 4.8.6 12.2-1.2 18H7.8C6 15.2 5.8 7.8 6.6 3Z\"/><path class=\"f\" d=\"M8.4 5.4h3v3h-3zM12.6 5.4h3v3h-3zM8.4 9.6h3v3h-3zM12.6 9.6h3v3h-3zM8.8 13.8h2.6v3.2H8.8zM12.6 13.8h2.6v3.2h-2.6z\"/><path d=\"M12 4v15.6\" stroke-width=\".9\"/>","Calves":"<path d=\"M6.2 2.2h4.2c.6 3.2.6 6.4 1.8 9.6.4 1 .4 2-.2 3l-1 4.8 5.2 1.4c1 .3 1.4 1.4.4 1.8H8.8c-.6 0-1-.5-.9-1l.3-2.2c-1.4-1.6-2.2-3.6-1.4-5.8l.4-1.4C5.8 9.6 5.2 6.2 6.2 2.2Z\"/><path class=\"f\" d=\"M8 13c-1.2 1.6-1 3.8.6 5.4.8-1.6.9-3.4.2-5Z\"/>","skill":"<path class=\"w\" d=\"M3 3.4h18\"/><path d=\"M8.8 3.6l2 5.4M15.2 3.6l-2 5.4\"/><circle class=\"f\" cx=\"12\" cy=\"10.6\" r=\"2.2\"/><path d=\"M12 12.8v5.6M12 18.4l-2.4 3.6M12 18.4l2.4 3.6M9.8 13.4l2.2.8 2.2-.8\"/>"};
  var ALIAS={Legs:'Quads',Upper:'Chest'};
  function mus(g){
    var k=g==='all'?'all':ALIAS[g]||g, svg=MI[k];
    if(!svg) return sprite('body-scan');
    return '<svg class="kdl-ic kdl-mi" viewBox="0 0 24 24" aria-hidden="true">'+svg+'</svg>';
  }
  function sprite(id){ return '<svg class="kdl-ic" aria-hidden="true"><use href="#i-'+id+'"/></svg>'; }
  /* a drawing in a 48 x 28 box (the attachments' own drawings) */
  function art(inner){ return '<svg class="kdl-ic kdl-art" viewBox="0 0 48 28" aria-hidden="true">'+inner+'</svg>'; }

  /* ---------- the dial ---------- */
  var CENTRE={dot:'<i class="kdl-dot"></i>',
    swap:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>',
    play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5v11l9-5.5z"/></svg>'};
  function html(o){
    o=o||{}; var id='kdl'+(++N);
    return '<div class="kdl" id="'+id+'" role="radiogroup" aria-label="'+esc(o.label||'Choose')+'">'
      +'<div class="kdl-gl" aria-hidden="true"></div><svg class="kdl-svg" viewBox="0 0 320 320" aria-hidden="true"><defs>'
        +'<linearGradient id="'+id+'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--kdl-a)"/><stop offset="1" style="stop-color:var(--kdl-b)"/></linearGradient>'
        +'<linearGradient id="'+id+'s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--kdl-sa)"/><stop offset="1" style="stop-color:var(--kdl-sb)"/></linearGradient>'
        +'<linearGradient id="'+id+'e" gradientUnits="userSpaceOnUse" x1="40" y1="20" x2="280" y2="300"><stop offset="0" style="stop-color:var(--kdl-e1)"/><stop offset=".55" style="stop-color:var(--kdl-e2)"/><stop offset="1" style="stop-color:var(--kdl-e3)"/></linearGradient>'
        +'<filter id="'+id+'b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>'
      +'</defs><g class="kdl-segs"></g></svg>'
      +'<div class="kdl-ls"></div>'
      +'<div class="kdl-hub"><button type="button" class="kdl-c" aria-label="'+esc(o.centre&&o.centre.label||'Centre')+'"></button></div></div>';
  }
  function mount(el,o){
    if(!el) return null;
    if(typeof el==='string') el=document.getElementById(el);
    if(!el||!el.querySelector) return null;
    o=o||{};
    var id=el.id, segs=el.querySelector('.kdl-segs'), ls=el.querySelector('.kdl-ls'), cb=el.querySelector('.kdl-c'), gl=el.querySelector('.kdl-gl');
    var st={items:o.items||[],pos:clamp(o.sel||0,0,Math.max(0,(o.items||[]).length-1)),pop:reduce?1:0,anim:null,sel:-1};
    st.sel=Math.round(st.pos);
    /* the track goes all the way round, like a real dial: whatever is chosen,
       its neighbours sit on both sides (positions wrap; the nearest way round) */
    function n(){ return Math.max(1,st.items.length); }
    function wrap(i){ var m=n(); return ((Math.round(i)%m)+m)%m; }
    function rel(i,pos){ var m=n(), d=((i-pos)%m+m)%m; return d>m/2?d-m:d; }
    function build(){
      var h='', b='';
      st.items.forEach(function(it,i){
        /* per segment: a soft glow of its rim, the glass with its bright edge, the milky light of the chosen one */
        h+='<path class="kdl-r" fill="none" stroke="var(--kdl-e1)" stroke-width="2.6" filter="url(#'+id+'b)"/><path class="kdl-s" fill="url(#'+id+'g)" stroke="url(#'+id+'e)" stroke-width=".9"/><path class="kdl-x" fill="url(#'+id+'s)"/>';
        b+='<button type="button" class="kdl-l" role="radio" data-kdl-i="'+i+'" aria-checked="false" aria-label="'+esc(it.label)+'" tabindex="-1">'+(it.icon||'')+'<span>'+esc(it.label)+'</span></button>';
      });
      segs.innerHTML=h; ls.innerHTML=b;
      if(gl) gl.innerHTML=GLASS?st.items.map(function(){ return '<i class="kdl-g"></i>'; }).join(''):'';
    }
    function centre(){ var c=o.centre||{}; cb.innerHTML=CENTRE[c.icon||'dot']||CENTRE.dot; cb.setAttribute('aria-label',c.label||'Centre'); cb.classList.toggle('kdl-c-act',!!c.onTap); }
    function draw(){
      var S=segs.children, L=ls.children, G=gl?gl.children:[], pos=st.pos, kx=G.length?(el.clientWidth||0)/320:0;
      for(var i=0;i<st.items.length;i++){
        var d=rel(i,pos), ang=SLOT+d*STEP, t=Math.max(0,1-Math.abs(d)), t2=t*t*(3-2*t);
        var vis=clamp(Math.min((ang-LO)/FADE,(HI-ang)/FADE),0,1);
        /* the pop: each segment comes out from the hub, the chosen one first */
        var lag=Math.min(Math.abs(d),3)*0.11, pp=clamp((st.pop-lag)/(1-0.33),0,1), e=reduce?1:back(pp);
        var ri=RI-1.5*t2, ro=RO+GROW*t2, half=(W+6*t2)/2, cr=11+9*t2;
        var k=0.36+0.64*e, ri2=44+(ri-44)*k, ro2=44+(ro-44)*k, sp=half*(0.55+0.45*Math.min(1,e));
        var op=vis*clamp(pp*1.6,0,1);
        var path=op>0.01?seg(ri2,Math.max(ri2+16,ro2),ang-sp,ang+sp,Math.min(cr,(ro2-ri2)/2.2)):'';
        S[3*i].setAttribute('d',path); S[3*i].style.opacity=(op*(0.25+0.45*t2)).toFixed(3);
        S[3*i+1].setAttribute('d',path); S[3*i+1].style.opacity=op.toFixed(3);
        S[3*i+2].setAttribute('d',path); S[3*i+2].style.opacity=(op*t2).toFixed(3);
        if(G[i]){ var gp=op>0.01&&kx?'path("'+seg(ri2,Math.max(ri2+16,ro2),ang-sp,ang+sp,Math.min(cr,(ro2-ri2)/2.2),kx)+'")':'none'; G[i].style.clipPath=gp; G[i].style.webkitClipPath=gp; G[i].style.opacity=op.toFixed(3); }
        var m=P((ri2+ro2)/2+3*t2,ang), lb=L[i];
        lb.style.left=(m[0]/3.2).toFixed(2)+'%'; lb.style.top=(m[1]/3.2).toFixed(2)+'%';
        lb.style.opacity=op.toFixed(3); lb.style.transform='translate(-50%,-50%) scale('+(0.94+0.08*t2).toFixed(3)+')';
        lb.style.visibility=op<0.15?'hidden':'visible';
        var on=wrap(pos)===i; lb.classList.toggle('on',on); lb.setAttribute('aria-checked',String(on)); lb.tabIndex=on?0:-1;
      }
    }
    function run(to,ms,done){
      var from=st.pos, t0=now(); st.anim=1;
      if(reduce||!ms){ st.pos=to; draw(); st.anim=null; if(done) done(); return; }
      (function f(){ var t=clamp((now()-t0)/ms,0,1); st.pos=from+(to-from)*ease(t); draw(); if(t<1&&st.anim) raf(f); else { st.anim=null; if(t>=1&&done) done(); } })();
    }
    function done(quiet){ var i=wrap(st.pos); st.pos=i; if(i!==st.sel){ st.sel=i; if(!quiet&&o.onPick) try{ o.onPick(i,st.items[i]); }catch(e){} } draw(); }
    function settle(){
      var to=Math.round(st.pos);
      run(to,Math.min(520,180+Math.abs(st.pos-to)*420),function(){ done(); });
    }
    /* to an item the nearest way round */
    function set(i,quiet){
      i=wrap(i); st.anim=null;
      var to=st.pos+rel(i,st.pos);
      run(to,quiet?0:Math.min(620,240+Math.abs(st.pos-to)*170),function(){ done(quiet); });
    }
    function pop(dir,done){
      var from=st.pop, to=dir===false?0:1, t0=now(), ms=to?720:260;
      if(reduce){ st.pop=to; draw(); if(done) done(); return; }
      (function f(){ var t=clamp((now()-t0)/ms,0,1); st.pop=from+(to-from)*t; draw(); if(t<1) raf(f); else if(done) done(); })();
    }
    /* the centre button: a new set of segments goes back into the hub and the next one comes out all around */
    function swap(items,sel,c){
      pop(false,function(){ st.items=items; st.pos=clamp(sel||0,0,items.length-1); st.sel=Math.round(st.pos); if(c) o.centre=c; build(); centre(); draw(); pop(true); });
    }
    /* dragging round the track */
    var drag=null, moved=false;
    function angAt(ev){ var r=el.getBoundingClientRect(); return Math.atan2(ev.clientY-(r.top+r.height/2),ev.clientX-(r.left+r.width/2))*57.3; }
    el.addEventListener('pointerdown',function(ev){
      if(ev.button>0||(ev.target.closest&&ev.target.closest('.kdl-hub'))) return;
      var r=el.getBoundingClientRect(), dx=ev.clientX-(r.left+r.width/2), dy=ev.clientY-(r.top+r.height/2), rr=Math.sqrt(dx*dx+dy*dy)/r.width*320;
      if(rr<40||rr>158) return;
      drag={a:angAt(ev),p:st.pos,x:ev.clientX,y:ev.clientY,id:ev.pointerId}; moved=false; st.anim=null;
    });
    el.addEventListener('pointermove',function(ev){
      if(!drag||ev.pointerId!==drag.id) return;
      if(!moved&&Math.abs(ev.clientX-drag.x)+Math.abs(ev.clientY-drag.y)<7) return;
      if(!moved){ moved=true; el.classList.add('kdl-drag'); try{ el.setPointerCapture(ev.pointerId); }catch(e){} }
      var da=angAt(ev)-drag.a; while(da>180) da-=360; while(da<-180) da+=360;
      st.pos=drag.p-da/STEP; draw(); ev.preventDefault();
    });
    function up(ev){ if(!drag||(ev&&ev.pointerId!==drag.id)) return; drag=null; el.classList.remove('kdl-drag'); if(moved) settle(); }
    el.addEventListener('pointerup',up); el.addEventListener('pointercancel',up);
    el.addEventListener('click',function(ev){
      if(moved){ moved=false; ev.preventDefault(); ev.stopPropagation(); return; }
      var b=ev.target.closest&&ev.target.closest('.kdl-l'); if(b&&el.contains(b)){ ev.preventDefault(); set(+b.getAttribute('data-kdl-i')); return; }
      if(ev.target.closest&&ev.target.closest('.kdl-c')){ ev.preventDefault(); var c=o.centre||{}; if(c.onTap) c.onTap(); else pop(false,function(){ pop(true); }); }
    },true);
    el.addEventListener('keydown',function(ev){
      var k=ev.key, i=st.sel;
      if(k==='ArrowRight'||k==='ArrowDown'){ ev.preventDefault(); set(i+1); setTimeout(function(){ var b=ls.querySelector('.kdl-l.on'); if(b) b.focus(); },300); }
      else if(k==='ArrowLeft'||k==='ArrowUp'){ ev.preventDefault(); set(i-1); setTimeout(function(){ var b=ls.querySelector('.kdl-l.on'); if(b) b.focus(); },300); }
    });
    var wacc=0, wt=0;
    el.addEventListener('wheel',function(ev){
      ev.preventDefault(); wacc+=ev.deltaY||ev.deltaX; clearTimeout(wt);
      if(Math.abs(wacc)>36){ set(st.sel+(wacc>0?1:-1)); wacc=0; }
      wt=setTimeout(function(){ wacc=0; },180);
    },{passive:false});
    build(); centre(); draw(); pop(true);
    if(window.ResizeObserver&&GLASS) try{ new ResizeObserver(function(){ if(!st.anim) draw(); }).observe(el); }catch(e){}
    var api={set:set,swap:swap,pop:pop,sel:function(){ return st.sel; },items:function(){ return st.items; },_st:st,el:el};
    el.__kdl=api;
    return api;
  }
  /* the expand / collapse arrows for a card's top right */
  var EXPAND='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5"/></svg>';
  var SHRINK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4l-6 6M14 4.5V10h5.5M4 20l6-6M10 19.5V14H4.5"/></svg>';
  function arrows(open){ return open?SHRINK:EXPAND; }
  return {html:html,mount:mount,mus:mus,sprite:sprite,art:art,arrows:arrows,seg:seg,MI:MI,_geo:{C:C,STEP:STEP,SLOT:SLOT,RI:RI,RO:RO,GROW:GROW,LO:LO,HI:HI}};
})();
