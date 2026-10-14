/* =====================================================================
   KovaBodyShape - the body map looks like you (p30).

   The Target muscles map (Workout > Customize) was one male figure for
   everyone. Now, from what you told Kova:
     - female or male (the setup question, or Fuel > Find my maintenance);
     - your build: body fat you entered, or an estimate from height,
       weight and age (Deurenberg's BMI formula). A heavier build gets a
       fuller waist, hips and limbs; a leaner one, slimmer;
     - and it follows your weigh-ins, so the figure leans out as your
       weight comes down. The first estimate is kept to show the change.
   The figure is reshaped, not redrawn: every point of the original paths
   is moved sideways by a smooth amount that depends on its height (head,
   shoulders, chest, waist, hips, thighs, calves) and on whether it is on
   the arm, the trunk or a leg. Each muscle keeps its own shape, so tapping
   a muscle works exactly as before.
   p30b (the owner: "too big, like a jacked bodybuilder; slim and defined;
   the muscles inside the leg outline"): every figure, the default too, is
   a slim, fit build. Each leg is slimmed around its own centre (so there
   is a gap between them, not one wide block), hips and glutes stay modest,
   and the knee, shin, calf and foot shapes - which sat 10 to 15 px outside
   the leg outline in the original drawing - are fitted inside it.
   ===================================================================== */
window.KovaBodyShape=(function(){
  'use strict';
  /* half-width of the trunk and legs (T) and the centre line of the arm (A),
     by height, measured from the original figure (centre x = 100) */
  var T=[[60,12],[68,10],[84,50],[124,51],[162,41],[199,36],[232,52],[278,52],[326,44],[354,35],[396,36],[430,24],[450,18]];
  var A=[[84,64],[124,64],[168,71],[214,80],[246,85],[265,86]];
  function lerp(tab,y){
    if(y<=tab[0][0]) return tab[0][1];
    for(var i=1;i<tab.length;i++) if(y<=tab[i][0]){ var a=tab[i-1], b=tab[i]; return a[1]+(b[1]-a[1])*(y-a[0])/(b[0]-a[0]); }
    return tab[tab.length-1][1];
  }
  function kp(k){ try{ return window.KP?KP.get(k):null; }catch(e){ return null; } }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

  /* who to draw */
  function profile(){
    var m=kp('maint')||{}, ob=kp('onboard')||{};
    var sx=String(m.sex||ob.sex||'').toLowerCase(), f=/^f/.test(sx)?1:/^m/.test(sx)?0:null;
    var wl=(kp('wlog')||[]).filter(function(x){ return x&&x.kg>0; }).sort(function(a,b){ return a.t-b.t; });
    var kg=wl.length?wl[wl.length-1].kg:(m.kg||null), cm=m.hcm||null, age=m.age||30;
    var bf=m.bf&&m.bf>=3&&m.bf<=60?+m.bf:null, how=bf?'the body fat you entered':'';
    if(!bf&&kg&&cm){ var bmi=kg/Math.pow(cm/100,2); bf=clamp(1.2*bmi+0.23*age-10.8*(f===1?0:1)-5.4,5,55); how='your height, weight and age'; }
    /* 0 = an average build for that sex (about 18% men, 28% women) */
    var ref=f===1?28:18, b=bf==null?0:clamp((bf-ref)/12,-0.9,1.6);
    return {f:f==null?0:f, known:f!=null, bf:bf, b:b, how:how, kg:kg};
  }

  /* the original leg outline (right leg; the left mirrors it): inner and
     outer edge, as distance from the centre line, by height */
  var LI=[[240,0],[296,0],[316,1],[334,2],[350,3],[364,4],[378,5],[392,6],[416,6],[428,4],[440,5],[448,6]];
  var LO=[[232,52],[262,54],[278,52],[296,50],[312,47],[326,44],[338,41],[346,37],[354,35],[368,37],[382,38],[396,36],[410,34],[422,28],[430,24],[437,21],[444,24],[448,12]];
  /* where the drawn muscles sit by height (they drift outward below the thigh) */
  var MI=[[300,5],[330,13],[345,24],[360,25],[390,24],[420,15],[448,14]];
  var MO=[[300,50],[330,47],[360,47],[390,48],[420,46],[448,46]];
  function smooth(a,b,y){ var t=clamp((y-a)/(b-a),0,1); return t*t*(3-2*t); }
  /* fit a muscle point inside the leg outline (below the thigh) */
  function fit(x,y){
    if(y<296) return x;
    var w=smooth(296,322,y), dx=x-100, s=dx<0?-1:1, a=Math.abs(dx);
    var mi=lerp(MI,y), mo=lerp(MO,y), li=lerp(LI,y)+2.5, lo=lerp(LO,y)-2.5;
    var u=clamp((a-mi)/Math.max(1,mo-mi),-0.05,1.05), na=li+u*(lo-li);
    return 100+s*(a+w*(na-a));
  }

  /* the build. f: 1 female, 0 male. b: body fat against an average build
     (0), negative leaner, positive fuller. Trunk: scaled from the centre
     line; legs: each around its own centre; arms: around their own line. */
  function kt(y,f,b){
    var K=[[60,1],[84,0.94-0.10*f+0.03*b],[140,0.95-0.08*f+0.05*b],[199,0.96-0.12*f+0.24*b],[232,0.95+0.02*f+0.12*b],[262,0.95+0.02*f+0.12*b],[450,1]];
    return lerp(K,y);
  }
  function kl(y,f,b){ return lerp([[240,0.80-0.02*f+0.18*b],[330,0.80-0.02*f+0.16*b],[360,0.86+0.08*b],[420,0.90+0.06*b],[450,0.96]],y); }
  /* p30c: a woman's back is drawn slimmer than the front's shoulders
     suggest, so it reads as a simple, slim back, not a bodybuilder's */
  var BACKF=[[84,1],[112,0.93],[160,0.88],[205,0.95],[226,1]];
  function pt(x,y,P,back){
    if(y<62) return [x,y];
    var dx=x-100, s=dx<0?-1:1, a=Math.abs(dx), k=kt(y,P.f,P.b)*(back&&P.f?lerp(BACKF,y):1), Ty=lerp(T,y);
    if(y>80&&y<268&&a>Ty+3){
      var Ay=lerp(A,y), ka=0.88-0.08*P.f+0.15*P.b;
      return [100+s*(Ay+Ty*(k-1)+(a-Ay)*ka),y];
    }
    var trunk=100+dx*k;
    if(y<224||a<0.5) return [trunk,y];
    /* a leg point: around the leg's own centre, which follows the hips */
    var li=lerp(LI,y), lo=lerp(LO,y), lc=(li+lo)/2, kh=kt(Math.min(y,262),P.f,P.b);
    var leg=100+s*(lc*kh+(a-lc)*kl(y,P.f,P.b)), w=smooth(224,256,y);
    return [trunk+(leg-trunk)*w,y];
  }
  function warp(d,P,isMuscle,back){
    var out=[], nums=[];
    String(d).replace(/([MLCZ])|(-?\d*\.?\d+)/g,function(m0,c,n){ if(c){ flush(); out.push(c); } else nums.push(+n); return m0; });
    flush();
    function flush(){ for(var i=0;i+1<nums.length;i+=2){ var x=isMuscle?fit(nums[i],nums[i+1]):nums[i]; var p=pt(x,nums[i+1],P,back); out.push((Math.round(p[0]*10)/10)+','+(Math.round(p[1]*10)/10)); } nums=[]; }
    return out.join(' ').replace(/ ([MLCZ]) /g,' $1').replace(/^([MLCZ]) /,'$1');
  }

  /* p30c: hair that reads as hair, not a hood or a wig: in front a cap with
     a side-swept fringe and locks to the jaw, the face left clear; behind,
     the back of the head and a ponytail down to the shoulder blades. Drawn
     over the head outline, a little brighter than the skin. */
  var HAIR_FRONT='M100,3 C86,3 77,12 77,27 C77,39 78,50 80,60 C81,64 84,64 85,60 C84,50 84,40 85,32 C90,26 96,22 104,20 C109,22 113,26 115,31 C116,40 116,50 115,60 C116,64 119,64 120,60 C122,50 123,39 123,27 C123,12 114,3 100,3 Z';
  var HAIR_BACK='M100,3 C85,3 77,12 77,28 C77,42 80,52 86,58 C91,61 95,61 96,60 C94,72 94,86 97,98 C98,101 102,101 103,98 C106,86 106,72 104,60 C105,61 109,61 114,58 C120,52 123,42 123,28 C123,12 115,3 100,3 Z';

  function apply(){
    var svg=document.getElementById('bodySvg'); if(!svg) return null;
    var P=profile();
    var figs=svg.querySelectorAll(':scope > g');
    svg.querySelectorAll('path').forEach(function(p){
      if(p.hasAttribute('data-hair')) return;
      var d0=p.getAttribute('data-d0'); if(!d0){ d0=p.getAttribute('d'); if(!d0) return; p.setAttribute('data-d0',d0); }
      var g=p.closest('g'); while(g&&g.parentNode!==svg) g=g.parentNode.closest('g');
      var outline=g&&g.querySelector('path:not([data-hair])')===p;
      p.setAttribute('d',warp(d0,P,!outline,!!(g&&g===figs[1])));
    });
    svg.querySelectorAll('[data-hair]').forEach(function(h){ h.remove(); });
    svg.setAttribute('data-sex',P.f?'f':'m');
    if(P.f===1){
      var gs=svg.querySelectorAll(':scope > g');
      [gs[0],gs[1]].forEach(function(g,i){
        if(!g) return;
        var h=document.createElementNS('http://www.w3.org/2000/svg','path');
        h.setAttribute('data-hair','1'); h.setAttribute('fill','rgba(255,255,255,.17)'); h.setAttribute('stroke','rgba(255,255,255,.42)'); h.setAttribute('stroke-width','1.6'); h.setAttribute('stroke-linejoin','round');
        h.setAttribute('d',i===0?HAIR_FRONT:HAIR_BACK);
        var ol=g.querySelector('path:not([data-hair])');
        g.insertBefore(h,ol?ol.nextSibling:g.firstChild);
      });
    }
    note(P);
    return P;
  }

  /* one line under the map: what it is drawn from, and the change since the first time */
  function note(P){
    var svg=document.getElementById('bodySvg'); if(!svg) return;
    var n=document.getElementById('bodyShapeNote');
    if(!n){ n=document.createElement('div'); n.id='bodyShapeNote'; n.className='sub'; n.style.cssText='padding:2px 10px 10px;line-height:1.45;font-size:11.5px'; svg.parentNode.appendChild(n); }
    if(P.bf==null){ n.textContent=(P.known?(P.f?'Drawn as a woman. ':'Drawn as a man. '):'')+'Add your height and weight in Fuel > Find my maintenance and the figure matches your build, then leans out as your weigh-ins go down.'; return; }
    var first=kp('shape0'); if(!first||typeof first.bf!=='number'){ first={bf:P.bf,t:Date.now()}; try{ KP.set('shape0',first); }catch(e){} }
    var d=P.bf-first.bf;
    n.textContent='Drawn for you: '+(P.f?'a woman':'a man')+', about '+Math.round(P.bf)+'% body fat, from '+P.how+'.'
      +(Math.abs(d)>=0.5?' Since you started: '+(d<0?'':'+')+d.toFixed(1)+' points'+(d<0?', and the figure has leaned out with you.':'.'):' It leans out as your weigh-ins go down.');
  }

  document.addEventListener('kova:screen',function(e){ if(e&&e.detail==='customize') apply(); });
  setTimeout(apply,0);
  return {apply:apply,profile:profile,warp:warp,kt:kt,_pt:pt};
})();
