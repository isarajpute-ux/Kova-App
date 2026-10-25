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
   KovaDial.mus(group) gives a segment icon drawn from Kova's own body map. */
window.KovaDial=(function(){
  'use strict';
  /* the geometry, in a 320 x 320 box (centre 160): the slot sits a little
     right of straight down, as in the reference */
  var C=160, STEP=52, W=47, SLOT=80, RI=74, RO=132, GROW=19, LO=-66, HI=230, FADE=28;
  var N=0;
  function P(r,a){ a=a*Math.PI/180; return [C+r*Math.cos(a),C+r*Math.sin(a)]; }
  function pt(r,a){ var q=P(r,a); return q[0].toFixed(1)+' '+q[1].toFixed(1); }
  /* an arc segment with soft corners: each corner is a curve from the
     straight side onto the arc */
  function seg(ri,ro,a0,a1,cr){
    var dO=cr/ro*57.3, dI=cr/ri*57.3, big=(a1-a0)>180?1:0;
    return 'M'+pt(ro-cr,a0)+'Q'+pt(ro,a0)+' '+pt(ro,a0+dO)
      +'A'+ro.toFixed(1)+' '+ro.toFixed(1)+' 0 '+big+' 1 '+pt(ro,a1-dO)
      +'Q'+pt(ro,a1)+' '+pt(ro-cr,a1)
      +'L'+pt(ri+cr,a1)+'Q'+pt(ri,a1)+' '+pt(ri,a1-dI)
      +'A'+ri.toFixed(1)+' '+ri.toFixed(1)+' 0 '+big+' 0 '+pt(ri,a0+dI)
      +'Q'+pt(ri,a0)+' '+pt(ri+cr,a0)+'Z';
  }
  function clamp(x,a,b){ return x<a?a:x>b?b:x; }
  function ease(t){ return 1-Math.pow(1-t,3); }
  function back(t){ var c=1.45; return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2); }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  var reduce=false; try{ reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var raf=window.requestAnimationFrame?function(f){ return requestAnimationFrame(f); }:function(f){ return setTimeout(function(){ f(Date.now()); },16); };
  function now(){ return window.performance&&performance.now?performance.now():Date.now(); }

  /* ---------- segment icons from the body map ---------- */
  var MUS={Quads:['f-quad-l','f-quad-r'],Legs:['f-quad-l','f-quad-r'],Glutes:['b-glute-l','b-glute-r'],Hamstrings:['b-ham-l','b-ham-r'],
    Chest:['f-pec-l','f-pec-r'],Back:['b-lat-l','b-lat-r','b-trap'],Shoulders:['f-delt-l'],Arms:['f-bicep-l','f-fore-l'],
    Core:['f-abs-l1','f-abs-l2','f-abs-l3','f-abs-r1','f-abs-r2','f-abs-r3'],Calves:['b-calf-l','b-calf-r'],Upper:['f-pec-l','f-pec-r','f-delt-l','f-delt-r']};
  var PATHS=null;
  function paths(){
    if(PATHS) return PATHS; PATHS={};
    var src=(typeof BODY_FRONT==='string'?BODY_FRONT:'')+(typeof BODY_BACK==='string'?BODY_BACK:'');
    src.replace(/<path[^>]*>/g,function(tag){ var id=/\bid="([^"]+)"/.exec(tag), d=/\bd="([^"]+)"/.exec(tag); if(id&&d) PATHS[id[1]]=d[1]; return tag; });
    return PATHS;
  }
  function mus(g){
    var ids=MUS[g]; if(!ids) return sprite(g==='all'?'grid-dots':'body-scan');
    var L=paths(), d=ids.map(function(i){ return L[i]; }).filter(Boolean); if(!d.length) return sprite('body-scan');
    var xs=[], ys=[]; d.join(' ').replace(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g,function(_,x,y){ xs.push(+x); ys.push(+y); return _; });
    var x0=Math.min.apply(0,xs), x1=Math.max.apply(0,xs), y0=Math.min.apply(0,ys), y1=Math.max.apply(0,ys), s=Math.max(x1-x0,y1-y0)*1.12, cx=(x0+x1)/2, cy=(y0+y1)/2;
    return '<svg class="kdl-ic kdl-mus" viewBox="'+(cx-s/2).toFixed(1)+' '+(cy-s/2).toFixed(1)+' '+s.toFixed(1)+' '+s.toFixed(1)+'" aria-hidden="true">'+d.map(function(x){ return '<path d="'+x+'"/>'; }).join('')+'</svg>';
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
      +'<svg class="kdl-svg" viewBox="0 0 320 320" aria-hidden="true"><defs>'
        +'<linearGradient id="'+id+'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--kdl-a)"/><stop offset="1" style="stop-color:var(--kdl-b)"/></linearGradient>'
        +'<linearGradient id="'+id+'s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--kdl-sa)"/><stop offset="1" style="stop-color:var(--kdl-sb)"/></linearGradient>'
        +'<linearGradient id="'+id+'e" gradientUnits="userSpaceOnUse" x1="40" y1="20" x2="280" y2="300"><stop offset="0" style="stop-color:var(--kdl-e1)"/><stop offset=".55" style="stop-color:var(--kdl-e2)"/><stop offset="1" style="stop-color:var(--kdl-e3)"/></linearGradient>'
      +'</defs><g class="kdl-segs"></g></svg>'
      +'<div class="kdl-ls"></div>'
      +'<div class="kdl-hub"><button type="button" class="kdl-c" aria-label="'+esc(o.centre&&o.centre.label||'Centre')+'"></button></div></div>';
  }
  function mount(el,o){
    if(!el) return null;
    if(typeof el==='string') el=document.getElementById(el);
    if(!el||!el.querySelector) return null;
    o=o||{};
    var id=el.id, segs=el.querySelector('.kdl-segs'), ls=el.querySelector('.kdl-ls'), cb=el.querySelector('.kdl-c');
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
        h+='<path class="kdl-s" fill="url(#'+id+'g)" stroke="url(#'+id+'e)" stroke-width=".9"/><path class="kdl-x" fill="url(#'+id+'s)"/>';
        b+='<button type="button" class="kdl-l" role="radio" data-kdl-i="'+i+'" aria-checked="false" aria-label="'+esc(it.label)+'" tabindex="-1">'+(it.icon||'')+'<span>'+esc(it.label)+'</span></button>';
      });
      segs.innerHTML=h; ls.innerHTML=b;
    }
    function centre(){ var c=o.centre||{}; cb.innerHTML=CENTRE[c.icon||'dot']||CENTRE.dot; cb.setAttribute('aria-label',c.label||'Centre'); cb.classList.toggle('kdl-c-act',!!c.onTap); }
    function draw(){
      var S=segs.children, L=ls.children, pos=st.pos;
      for(var i=0;i<st.items.length;i++){
        var d=rel(i,pos), ang=SLOT+d*STEP, t=Math.max(0,1-Math.abs(d)), t2=t*t*(3-2*t);
        var vis=clamp(Math.min((ang-LO)/FADE,(HI-ang)/FADE),0,1);
        /* the pop: each segment comes out from the hub, the chosen one first */
        var lag=Math.min(Math.abs(d),3)*0.11, pp=clamp((st.pop-lag)/(1-0.33),0,1), e=reduce?1:back(pp);
        var ri=RI-1.5*t2, ro=RO+GROW*t2, half=(W+6*t2)/2, cr=11+9*t2;
        var k=0.36+0.64*e, ri2=44+(ri-44)*k, ro2=44+(ro-44)*k, sp=half*(0.55+0.45*Math.min(1,e));
        var op=vis*clamp(pp*1.6,0,1);
        var path=op>0.01?seg(ri2,Math.max(ri2+16,ro2),ang-sp,ang+sp,Math.min(cr,(ro2-ri2)/2.2)):'';
        S[2*i].setAttribute('d',path); S[2*i].style.opacity=op.toFixed(3);
        S[2*i+1].setAttribute('d',path); S[2*i+1].style.opacity=(op*t2).toFixed(3);
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
    var api={set:set,swap:swap,pop:pop,sel:function(){ return st.sel; },items:function(){ return st.items; },_st:st,el:el};
    el.__kdl=api;
    return api;
  }
  /* the expand / collapse arrows for a card's top right */
  var EXPAND='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5"/></svg>';
  var SHRINK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4l-6 6M14 4.5V10h5.5M4 20l6-6M10 19.5V14H4.5"/></svg>';
  function arrows(open){ return open?SHRINK:EXPAND; }
  return {html:html,mount:mount,mus:mus,sprite:sprite,art:art,arrows:arrows,seg:seg,MUS:MUS,_geo:{C:C,STEP:STEP,SLOT:SLOT,RI:RI,RO:RO,GROW:GROW,LO:LO,HI:HI}};
})();
