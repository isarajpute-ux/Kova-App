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
   the arm or the trunk. Each muscle keeps its own shape, so tapping a
   muscle works exactly as before.
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

  /* how much wider (>1) or narrower (<1) the trunk is at height y */
  function kt(y,f,b){
    var K=[[60,1],[84,1-0.16*f+0.03*b],[140,1-0.12*f+0.06*b],[199,1-0.16*f+0.24*b],[240,1+0.10*f+0.13*b],[300,1+0.06*f+0.11*b],[360,1-0.04*f+0.05*b],[420,1-0.04*f],[450,1]];
    return lerp(K,y);
  }
  function pt(x,y,P){
    if(y<62) return [x,y];
    var dx=x-100, s=dx<0?-1:1, a=Math.abs(dx), k=kt(y,P.f,P.b), Ty=lerp(T,y);
    if(!(y>80&&y<268&&a>Ty+3)) return [100+dx*k,y];
    var Ay=lerp(A,y), ka=1-0.16*P.f+0.15*P.b;
    return [100+s*(Ay+Ty*(k-1)+(a-Ay)*ka),y];
  }
  function warp(d,P){
    var out=[], nums=[];
    String(d).replace(/([MLCZ])|(-?\d*\.?\d+)/g,function(m0,c,n){ if(c){ flush(); out.push(c); } else nums.push(+n); return m0; });
    flush();
    function flush(){ for(var i=0;i+1<nums.length;i+=2){ var p=pt(nums[i],nums[i+1],P); out.push((Math.round(p[0]*10)/10)+','+(Math.round(p[1]*10)/10)); } nums=[]; }
    return out.join(' ').replace(/ ([MLCZ]) /g,' $1').replace(/^([MLCZ]) /,'$1');
  }

  var FILL='rgba(255,255,255,.055)', STROKE='rgba(255,255,255,.30)';
  var HAIR_FRONT='M100,2 C86,2 76,12 76,30 C76,46 74,62 72,76 C80,80 90,78 94,70 L94,60 C86,52 82,40 82,28 C82,14 90,8 100,8 C110,8 118,14 118,28 C118,40 114,52 106,60 L106,70 C110,78 120,80 128,76 C126,62 124,46 124,30 C124,12 114,2 100,2 Z';
  var HAIR_BACK='M100,2 C84,2 75,13 75,30 C75,50 73,64 72,78 C84,85 116,85 128,78 C127,64 125,50 125,30 C125,13 116,2 100,2 Z';

  function apply(){
    var svg=document.getElementById('bodySvg'); if(!svg) return null;
    var P=profile(), on=P.f===1||Math.abs(P.b)>0.05;
    svg.querySelectorAll('path').forEach(function(p){
      if(p.hasAttribute('data-hair')) return;
      var d0=p.getAttribute('data-d0'); if(!d0){ d0=p.getAttribute('d'); if(!d0) return; p.setAttribute('data-d0',d0); }
      p.setAttribute('d',on?warp(d0,P):d0);
    });
    svg.querySelectorAll('[data-hair]').forEach(function(h){ h.remove(); });
    if(P.f===1){
      var gs=svg.querySelectorAll(':scope > g');
      [gs[0],gs[1]].forEach(function(g,i){
        if(!g) return;
        var h=document.createElementNS('http://www.w3.org/2000/svg','path');
        h.setAttribute('data-hair','1'); h.setAttribute('fill',FILL); h.setAttribute('stroke',STROKE); h.setAttribute('stroke-width','2'); h.setAttribute('stroke-linejoin','round');
        h.setAttribute('d',i===0?HAIR_FRONT:HAIR_BACK);
        g.insertBefore(h,g.firstChild);
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
