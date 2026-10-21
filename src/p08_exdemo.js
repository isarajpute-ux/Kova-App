/* =====================================================================
   KovaDemo - a moving picture of every exercise (p32).

   Kova draws its own figure, so there is nothing to license and nothing
   to download: a glass figure (graphite with a light edge, like the Kova
   orb) moves between the start and the finish of the lift, and the
   muscles doing the work glow in the screen's colour. Every pose is
   joints and angles, so the knees bend where knees bend and the bar
   stays over the foot.

   KovaDemo.svg(name, u)   one frame (u from 0 = start to 1 = finish)
   KovaDemo.mount(el, name) a looping picture (still on Reduce Motion)
   KovaDemo.find(name)     the demo for any exercise name, or null
   ===================================================================== */
window.KovaDemo=(function(){
  'use strict';
  var GY=184, LEN={TOR:50,NECK:7,HR:9.5,UA:29,FA:27,TH:40,SH:40,FT:14};
  function rad(d){ return d*Math.PI/180; }
  function A(a,b){ return [a[0]+b[0],a[1]+b[1]]; }
  function S(a,k){ return [a[0]*k,a[1]*k]; }
  function hyp(a,b){ return Math.hypot(b[0]-a[0],b[1]-a[1]); }
  function lerp(a,b,u){
    if(typeof a==='number'&&typeof b==='number') return a+(b-a)*u;
    if(Array.isArray(a)&&Array.isArray(b)) return a.map(function(x,i){ return lerp(x,b[i],u); });
    if(a&&b&&typeof a==='object'&&typeof b==='object'){ var o={}; Object.keys(a).forEach(function(k){ o[k]=k in b?lerp(a[k],b[k],u):a[k]; }); Object.keys(b).forEach(function(k){ if(!(k in o)) o[k]=b[k]; }); return o; }
    return a;
  }
  /* two-bone reach: the middle joint, bending to side s */
  function ik(a,t,l1,l2,s){
    var dx=t[0]-a[0], dy=t[1]-a[1], d=Math.hypot(dx,dy)||0.001, mx=l1+l2-0.4;
    if(d>mx){ t=[a[0]+dx/d*mx,a[1]+dy/d*mx]; d=mx; }
    var g=Math.atan2(dy,dx), c=Math.max(-1,Math.min(1,(l1*l1+d*d-l2*l2)/(2*l1*d))), b=Math.acos(c);
    return [[a[0]+l1*Math.cos(g+s*b),a[1]+l1*Math.sin(g+s*b)],t];
  }
  function down(deg,len,out){ var r=rad(deg); return [(out||1)*Math.sin(r)*len,Math.cos(r)*len]; }
  function rot(v,deg){ var r=rad(deg), c=Math.cos(r), s=Math.sin(r); return [v[0]*c-v[1]*s,v[0]*s+v[1]*c]; }

  /* ---------- a pose becomes joints ---------- */
  function joints(P){
    var J={v:P.v||'side'};
    if(J.v==='front') return front(P,J);
    var hip=P.hip, sh=P.sh||A(hip,[LEN.TOR*Math.sin(rad(P.t||0)),-LEN.TOR*Math.cos(rad(P.t||0))]);
    var dir=Math.atan2(sh[1]-hip[1],sh[0]-hip[0]), t=90+dir*180/Math.PI;   /* lean from upright, forward + */
    J.t=t; J.hip=hip; J.sh=sh;
    var hd=dir+rad(P.hd||0);
    J.head=[sh[0]+Math.cos(hd)*(LEN.NECK+LEN.HR),sh[1]+Math.sin(hd)*(LEN.NECK+LEN.HR)];
    J.neck=[sh[0]+Math.cos(dir)*3,sh[1]+Math.sin(dir)*3];
    var u=[Math.cos(dir),Math.sin(dir)], nf=[-u[1],u[0]];               /* nf: the front of the chest */
    if(nf[0]<0&&Math.abs(t)<170) nf=S(nf,-1);
    if(t>90||t<-90) nf=[u[1],-u[0]];
    J.u=u; J.nf=nf;
    J.nape=A(sh,A(S(nf,-7),S(u,-1))); J.chest=A(sh,A(S(nf,9),S(u,-4)));
    /* legs first, so a hand can hold a foot or a knee */
    ['N','F'].forEach(function(k){
      var far=k==='F', h0=far?A(hip,[-2,-1]):hip, l=P['l'+k]||P.lN||{a:[100,GY]}, kn,an;
      if(l.ta!=null){ kn=A(h0,down(l.ta,LEN.TH)); an=A(kn,down(l.sa,LEN.SH)); }
      else if(l.k){ kn=l.k; an=l.a; if(far){ kn=A(kn,[-2,-1]); an=A(an,[-2,0]); } }
      else { var r2=ik(h0,far?A(l.a,[-3,0]):l.a,LEN.TH,LEN.SH,l.s||-1); kn=r2[0]; an=r2[1]; }
      var f=l.f!=null?l.f:4, toe=A(an,[Math.cos(rad(f))*LEN.FT*(l.back?-1:1),Math.sin(rad(f))*LEN.FT]);
      J['h'+k]=h0; J['k'+k]=kn; J['a'+k]=an; J['t'+k]=toe;
    });
    ['N','F'].forEach(function(k){
      var far=k==='F', s0=far?A(sh,[-1.5,-1]):sh, a=P['a'+k]||P.aN||{ua:2,fa:2}, e,w;
      if(a.ua!=null){ e=A(s0,down(a.ua,LEN.UA)); w=A(e,down(a.fa,LEN.FA)); }
      else if(a.e){ var oe=a.e, ow=a.w; if(a.r){ oe=rot(oe,t); ow=rot(ow,t); } e=A(s0,oe); w=A(s0,ow); }
      else { var tg=a.W||(a.at?A(J[a.at]||hip,a.d||[0,0]):A(s0,[2,54])); var r=ik(s0,tg,LEN.UA,LEN.FA,a.s||1); e=r[0]; w=r[1]; }
      J['s'+k]=s0; J['e'+k]=e; J['w'+k]=w;
    });
    J.mid=S(A(J.wN,J.wF),0.5);
    return J;
  }
  function front(P,J){
    var hip=P.hip||[100,104], tl=P.tl||1, tilt=rad(P.t||0), up=[Math.sin(tilt),-Math.cos(tilt)];
    var sh=A(hip,S(up,LEN.TOR*tl)), side=[Math.cos(tilt),Math.sin(tilt)], sw=15, hw=8;
    J.hip=hip; J.sh=A(sh,[0,P.shr||0]); J.t=0; J.u=up; J.nf=[0,0];
    var hu=P.ht?rot(up,P.ht):up;
    J.head=A(sh,S(hu,(LEN.NECK+LEN.HR)*(P.hs||1))); J.neck=A(sh,S(up,3));
    J.chest=A(sh,S(up,-12)); J.nape=J.chest;
    [['L',-1],['R',1]].forEach(function(q){
      var k=q[0], o=q[1], s0=A(A(sh,S(side,o*sw)),[0,P.shr||0]), h0=A(hip,S(side,o*hw));
      var a=P['a'+k]||{ua:4,fa:4}, l=P['l'+k]||{a:[hip[0]+o*10,GY]};
      var e,w;
      if(a.ua!=null){ e=A(s0,down(a.ua,LEN.UA,o)); w=A(e,down(a.fa,LEN.FA,o)); }
      else if(a.e){ e=A(s0,[a.e[0]*o,a.e[1]]); w=A(s0,[a.w[0]*o,a.w[1]]); }
      else { var r=ik(s0,a.W,LEN.UA,LEN.FA,(a.s||1)*o); e=r[0]; w=r[1]; }
      var kn,an;
      if(l.k){ kn=[hip[0]+(l.k[0]-hip[0])*(k==='L'?1:1),l.k[1]]; kn=l.k; an=l.a; }
      else if(l.ta!=null){ kn=A(h0,down(l.ta,LEN.TH,o)); an=A(kn,down(l.sa,LEN.SH,o)); }
      else { var r2=ik(h0,l.a,LEN.TH,LEN.SH,-o); kn=r2[0]; an=r2[1]; }
      J['s'+k]=s0; J['e'+k]=e; J['w'+k]=w; J['h'+k]=h0; J['k'+k]=kn; J['a'+k]=an;
      J['t'+k]=A(an,[o*5,3]);
    });
    J.wN=J.wR; J.wF=J.wL; J.aN=J.aR; J.aF=J.aL; J.eN=J.eR; J.kN=J.kR;
    J.mid=S(A(J.wL,J.wR),0.5);
    return J;
  }

  /* ---------- drawing ---------- */
  var gid=0, seq=0, pre='k';
  function f1(n){ return Math.round(n*10)/10; }
  function pp(p){ return f1(p[0])+','+f1(p[1]); }
  /* a limb: a capsule from radius r1 to r2, lit from the top left */
  function limb(a,b,r1,r2,cls,defs){
    var dx=b[0]-a[0], dy=b[1]-a[1], d=Math.hypot(dx,dy)||0.01, n=[-dy/d,dx/d];
    if(n[1]>0||(n[1]===0&&n[0]>0)) n=S(n,-1);                          /* n points up: the lit side */
    var id=pre+(++gid), p1=A(a,S(n,r1)), p2=A(b,S(n,r2)), p3=A(b,S(n,-r2)), p4=A(a,S(n,-r1));
    defs.push('<linearGradient id="'+id+'" gradientUnits="userSpaceOnUse" x1="'+f1(a[0]+n[0]*r1)+'" y1="'+f1(a[1]+n[1]*r1)+'" x2="'+f1(a[0]-n[0]*r1)+'" y2="'+f1(a[1]-n[1]*r1)+'">'
      +'<stop offset="0" class="g0"/><stop offset=".45" class="g1"/><stop offset="1" class="g2"/></linearGradient>');
    return '<path class="seg '+cls+'" fill="url(#'+id+')" d="M'+pp(p1)+'L'+pp(p2)+'A'+f1(r2)+','+f1(r2)+' 0 0 1 '+pp(p3)+'L'+pp(p4)+'A'+f1(r1)+','+f1(r1)+' 0 0 1 '+pp(p1)+'Z"/>';
  }
  function glow(p,r,lvl){ return '<circle class="gl'+(lvl>1?' gs':'')+'" fill="url(#'+pre+'g)" cx="'+f1(p[0])+'" cy="'+f1(p[1])+'" r="'+f1(r*1.7)+'"/>'; }
  function mixp(a,b,k){ return [a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k]; }

  /* where each muscle sits on the figure, side view (front view uses the middle) */
  function spots(J,m){
    var fr=J.v==='front', nf=J.nf, out=[];
    function thigh(k,side){ var h=J['h'+k], kn=J['k'+k], d=[kn[0]-h[0],kn[1]-h[1]], L=Math.hypot(d[0],d[1])||1, n=[-d[1]/L,d[0]/L]; if(n[0]<0) n=S(n,-1); return A(mixp(h,kn,.5),S(n,fr?0:side*4)); }
    var K=fr?['L','R']:['N','F'];
    var T={
      quads:function(){ return K.map(function(k){ return [thigh(k,1),8.5]; }); },
      hams:function(){ return K.map(function(k){ return [thigh(k,-1),8]; }); },
      adductors:function(){ return K.map(function(k){ return [mixp(J['h'+k],J['k'+k],.35),6]; }); },
      glutes:function(){ return [[fr?J.hip:A(J.hip,A(S(nf,-6),S(J.u,2))),10]]; },
      calves:function(){ return K.map(function(k){ return [A(mixp(J['k'+k],J['a'+k],.35),fr?[0,0]:[-3,0]),6.5]; }); },
      tibialis:function(){ return K.map(function(k){ return [A(mixp(J['k'+k],J['a'+k],.4),fr?[0,0]:[3,0]),5]; }); },
      chest:function(){ return [[fr?A(J.sh,[0,10]):A(mixp(J.hip,J.sh,.78),S(nf,7)),fr?14:9]]; },
      abs:function(){ return [[fr?mixp(J.hip,J.sh,.35):A(mixp(J.hip,J.sh,.38),S(nf,7)),fr?11:8]]; },
      obliques:function(){ return [[fr?A(mixp(J.hip,J.sh,.4),[-9,0]):mixp(J.hip,J.sh,.4),7],[fr?A(mixp(J.hip,J.sh,.4),[9,0]):mixp(J.hip,J.sh,.45),fr?7:0]].filter(function(x){ return x[1]; }); },
      lats:function(){ return [[fr?mixp(J.hip,J.sh,.62):A(mixp(J.hip,J.sh,.62),S(nf,-6)),fr?14:9]]; },
      traps:function(){ return [[fr?A(J.sh,[0,-3]):A(J.sh,A(S(nf,-5),S(J.u,2))),7.5]]; },
      lowback:function(){ return [[fr?mixp(J.hip,J.sh,.25):A(mixp(J.hip,J.sh,.25),S(nf,-6)),8]]; },
      delts:function(){ return K.map(function(k){ return [J['s'+k],7.5]; }); },
      biceps:function(){ return K.map(function(k){ return [mixp(J['s'+k],J['e'+k],.55),6]; }); },
      triceps:function(){ return K.map(function(k){ return [mixp(J['s'+k],J['e'+k],.5),6]; }); },
      forearms:function(){ return K.map(function(k){ return [mixp(J['e'+k],J['w'+k],.4),5]; }); },
      hipflex:function(){ return K.map(function(k){ return [mixp(J['h'+k],J['k'+k],.18),6]; }); },
      neck:function(){ return [[J.neck,5]]; }
    };
    return T[m]?T[m]():out;
  }

  function eqHtml(q,J){
    var at=function(n){ return n&&J[n]?J[n]:null; };
    function pt(){ var p=at(q.at)||[q.x||0,q.y||0]; return A(p,[q.dx||0,q.dy||0]); }
    switch(q.k){
      case 'bench': return '<rect class="eqf" x="'+q.x+'" y="'+q.y+'" width="'+q.w+'" height="7" rx="3.5"/><path class="eq" d="M'+(q.x+10)+','+(q.y+7)+'V'+GY+'M'+(q.x+q.w-10)+','+(q.y+7)+'V'+GY+'"/>';
      case 'box': return '<rect class="eqf" x="'+q.x+'" y="'+q.y+'" width="'+q.w+'" height="'+q.h+'" rx="3"/>';
      case 'seat': return '<rect class="eqf" x="'+q.x+'" y="'+q.y+'" width="'+q.w+'" height="6" rx="3"/><path class="eq" d="M'+(q.x+q.w/2)+','+(q.y+6)+'V'+GY+'"/>';
      case 'back': return '<path class="eqf eqb" d="M'+q.x1+','+q.y1+'L'+q.x2+','+q.y2+'"/>';
      case 'rail': return '<path class="eq" d="M'+q.x1+','+q.y1+'L'+q.x2+','+q.y2+'"/>';
      case 'wall': return '<path class="eq" d="M'+q.x+',20V'+GY+'"/>';
      case 'tower': return '<rect class="eqf" x="'+(q.x-4)+'" y="'+(q.top||24)+'" width="8" height="'+(GY-(q.top||24))+'" rx="2"/>';
      case 'cable': { var to=at(q.to)||[0,0]; return '<path class="cab" d="M'+q.from[0]+','+q.from[1]+'L'+pp(to)+'"/><circle class="eqf" cx="'+q.from[0]+'" cy="'+q.from[1]+'" r="3"/>'; }
      case 'hbar': return '<path class="eq" d="M'+(q.x-30)+','+q.y+'H'+(q.x+40)+'"/><circle class="eqf" cx="'+q.x+'" cy="'+q.y+'" r="3.4"/>';
      case 'pbar': return '<path class="eq" d="M'+q.x+','+q.y+'V'+GY+'M'+(q.x-16)+','+q.y+'H'+(q.x+16)+'"/><circle class="eqf" cx="'+q.x+'" cy="'+q.y+'" r="3.4"/>';
      case 'plate': { var p=pt(), r=q.r||15; return '<circle class="plate" cx="'+f1(p[0])+'" cy="'+f1(p[1])+'" r="'+r+'"/><circle class="hub" cx="'+f1(p[0])+'" cy="'+f1(p[1])+'" r="'+(r*0.28)+'"/>'; }
      case 'db': { var p2=pt(); return '<rect class="dbb" x="'+f1(p2[0]-7)+'" y="'+f1(p2[1]-3)+'" width="14" height="6" rx="2"/><rect class="plate" x="'+f1(p2[0]-9)+'" y="'+f1(p2[1]-7)+'" width="5" height="14" rx="2"/><rect class="plate" x="'+f1(p2[0]+4)+'" y="'+f1(p2[1]-7)+'" width="5" height="14" rx="2"/>'; }
      case 'kb': { var p3=pt(); return '<path class="eq" d="M'+f1(p3[0]-5)+','+f1(p3[1]+3)+'Q'+f1(p3[0])+','+f1(p3[1]-6)+' '+f1(p3[0]+5)+','+f1(p3[1]+3)+'"/><circle class="plate" cx="'+f1(p3[0])+'" cy="'+f1(p3[1]+10)+'" r="8"/>'; }
      case 'ball': { var p4=pt(); return '<circle class="plate" cx="'+f1(p4[0])+'" cy="'+f1(p4[1])+'" r="'+(q.r||9)+'"/>'; }
      case 'wheel': { var p5=pt(); return '<circle class="plate" cx="'+f1(p5[0])+'" cy="'+f1(p5[1]+4)+'" r="9"/><circle class="hub" cx="'+f1(p5[0])+'" cy="'+f1(p5[1]+4)+'" r="2.5"/>'; }
      case 'pad': { var p6=pt(); return '<circle class="eqf" cx="'+f1(p6[0])+'" cy="'+f1(p6[1])+'" r="'+(q.r||6)+'"/>'; }
      case 'bar': { var p7=pt(); return '<circle class="eqf" cx="'+f1(p7[0])+'" cy="'+f1(p7[1])+'" r="3"/>'; }
      case 'plat': { var p8=at(q.at)||[0,0], an=rad(q.ang||0), d=[Math.cos(an),Math.sin(an)], c=A(p8,S([d[1],-d[0]],-4)); return '<path class="eqf eqb" d="M'+pp(A(c,S(d,-16)))+'L'+pp(A(c,S(d,18)))+'"/>'; }
      case 'tpad': { var o=q.side==='front'?17:-17, b1=A(J.hip,S(J.nf,o)), b2=A(J.sh,S(J.nf,o)); return '<path class="eqf eqb" d="M'+pp(mixp(b1,b2,-0.05))+'L'+pp(mixp(b1,b2,1.1))+'"/>'+(q.side==='front'?'<path class="eq" d="M'+pp(mixp(b1,b2,0.3))+'L'+f1(mixp(b1,b2,0.3)[0])+','+GY+'"/>':''); }
    }
    return '';
  }

  var BEHIND={bench:1,box:1,seat:1,back:1,rail:1,wall:1,tower:1,hbar:1,pbar:1,tpad:1,plat:1};
  function draw(D,u,opts){
    opts=opts||{};
    var P=pose(D,u), J=joints(P), defs=[], body=[], fr=J.v==='front';
    gid=0; pre='k'+(++seq).toString(36)+'_';
    defs.push('<radialGradient id="'+pre+'h" cx=".36" cy=".3" r=".8"><stop offset="0" class="g0"/><stop offset=".5" class="g1"/><stop offset="1" class="g2"/></radialGradient>'
      +'<radialGradient id="'+pre+'g"><stop offset="0" class="h0"/><stop offset=".45" class="h1"/><stop offset="1" class="h2"/></radialGradient>'
      +'<radialGradient id="'+pre+'s"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></radialGradient>');
    var R={tor:[12.5,10],ua:[5.4,4.6],fa:[4.4,3.4],th:[8.6,6.2],sh:[6,4.2],ft:[3.4,2.6]};
    function arm(k,cls){ return limb(J['s'+k],J['e'+k],R.ua[0],R.ua[1],cls,defs)+limb(J['e'+k],J['w'+k],R.fa[0],R.fa[1],cls,defs)+'<circle class="hand '+cls+'" cx="'+f1(J['w'+k][0])+'" cy="'+f1(J['w'+k][1])+'" r="3.6"/>'; }
    function leg(k,cls){ return limb(J['h'+k],J['k'+k],R.th[0],R.th[1],cls,defs)+limb(J['k'+k],J['a'+k],R.sh[0],R.sh[1],cls,defs)+limb(J['a'+k],J['t'+k],R.ft[0],R.ft[1],cls,defs); }
    function torso(){
      /* chest wider than the waist; a front view is broader still */
      var top=fr?mixp(J.hip,J.sh,1.02):mixp(J.hip,J.sh,1.04);
      return limb(J.hip,top,fr?11:R.tor[1],fr?17:R.tor[0],'tor',defs)+limb(J.sh,J.neck,3.6,3.6,'nk',defs)
        +'<circle class="head" fill="url(#'+pre+'h)" cx="'+f1(J.head[0])+'" cy="'+f1(J.head[1])+'" r="'+LEN.HR+'"/>';
    }
    var eq=(D.eq||[]).filter(function(q){ return BEHIND[q.k]; }).map(function(q){ return eqHtml(q,J); }).join('');
    var held=(D.eq||[]).filter(function(q){ return !BEHIND[q.k]; });
    if(fr){
      body.push(leg('L',''),leg('R',''),torso());
      body.push(arm('L',''),arm('R',''));
    } else {
      body.push(held.filter(function(q){ return q.at==='wF'; }).map(function(q){ return eqHtml(q,J); }).join(''));
      body.push(arm('F','far'),leg('F','far'),torso(),leg('N',''),arm('N',''));
    }
    var front2=held.filter(function(q){ return fr||q.at!=='wF'; }).map(function(q){ return eqHtml(q,J); }).join('');
    var mus=D.mus||{p:[],s:[]}, gl='';
    (mus.s||[]).forEach(function(m){ spots(J,m).forEach(function(s){ gl+=glow(s[0],s[1],2); }); });
    (mus.p||[]).forEach(function(m){ spots(J,m).forEach(function(s){ gl+=glow(s[0],s[1],1); }); });
    var feetX=fr?J.hip[0]:(J.aN[0]+J.aF[0])/2;
    var vb=opts.box||'0 0 200 200';
    /* the picture is named by what holds it (the page's figure, or the button); the svg itself is decoration */
    return '<svg class="kxd-svg" viewBox="'+vb+'" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'
      +'<defs>'+defs.join('')+'</defs>'
      +'<ellipse class="shadow" fill="url(#'+pre+'s)" cx="'+f1(feetX)+'" cy="'+(GY+2)+'" rx="58" ry="7"/><path class="floor" d="M8,'+(GY+0.5)+'H192"/>'
      +eq+'<g class="fig">'+body.join('')+'</g>'
      +'<g class="glows">'+gl+'</g>'+front2+'</svg>';
  }

  /* ---------- timing: hold the start, move, hold the finish, come back ---------- */
  function ease(x){ return 0.5-0.5*Math.cos(Math.PI*Math.max(0,Math.min(1,x))); }
  function pose(D,u){
    var K=D.K;
    if(K.length===2) return lerp(K[0],K[1],ease(u));
    var n=K.length-1, x=Math.max(0,Math.min(1,u))*n, i=Math.min(n-1,Math.floor(x));
    return lerp(K[i],K[i+1],ease(x-i));
  }
  function phase(D,ms){
    var dur=D.dur||2600, p=(ms%dur)/dur;
    if(D.K.length>2) return p;                                         /* a sequence plays straight through */
    if(D.stretch){ if(p<0.12) return 0; if(p<0.38) return (p-0.12)/0.26; if(p<0.84) return 1; return 1-(p-0.84)/0.16; }
    if(p<0.18) return 0; if(p<0.5) return (p-0.18)/0.32; if(p<0.62) return 1; return 1-(p-0.62)/0.38;
  }

  /* ---------- the poses ---------- */
  function st(o){ return Object.assign({hip:[100,104],t:0,lN:{a:[103,GY]},lF:{a:[99,GY]},aN:{ua:2,fa:2},aF:{ua:1,fa:1}},o||{}); }
  function arms(spec){ return {aN:spec,aF:spec}; }
  function m(p,s){ return {p:p,s:s||[]}; }
  var HANG={ua:0,fa:0};
  var squatB={hip:[74,138],t:40};
  var DB={k:'db',at:'wN'}, DBF={k:'db',at:'wF'}, PL={k:'plate',at:'wN'};
  var LIB={};
  /* every limb in every keyframe gets the same fields, so in-betweens are smooth */
  function norm(P){
    ['lN','lF','lL','lR'].forEach(function(k){ var l=P[k]; if(!l) return; if(l.f==null) l.f=4; if(l.a&&!l.k&&l.ta==null&&l.s==null) l.s=-1; });
    ['aN','aF','aL','aR'].forEach(function(k){ var a=P[k]; if(!a) return; if((a.W||a.at)&&a.s==null) a.s=1; });
    return P;
  }
  function add(names,d){ d.K=d.K.map(function(P){ return norm(JSON.parse(JSON.stringify(P))); }); String(names).split('|').forEach(function(n){ LIB[n.toLowerCase()]=d; }); }

  /* legs */
  add('Barbell back squat',{K:[st(Object.assign({hip:[98,104],t:8},arms({r:1,e:[-9,14],w:[-12,0]}))),st(Object.assign({},squatB,arms({r:1,e:[-9,14],w:[-12,0]})))],
    eq:[{k:'plate',at:'nape',r:17}],mus:m(['quads','glutes'],['adductors','lowback','abs'])});
  add('Front squat',{K:[st(Object.assign({hip:[99,104],t:3},arms({r:1,e:[19,8],w:[8,-3]}))),st(Object.assign({hip:[80,138],t:16},arms({r:1,e:[19,8],w:[8,-3]})))],
    eq:[{k:'plate',at:'chest',r:17}],mus:m(['quads','glutes'],['abs','traps'])});
  add('Goblet squat',{K:[st({hip:[99,104],t:4,aN:{ua:22,fa:162},aF:{ua:20,fa:160}}),st({hip:[80,138],t:22,aN:{ua:22,fa:162},aF:{ua:20,fa:160}})],
    eq:[{k:'db',at:'mid',dy:-3}],mus:m(['quads','glutes'],['adductors','abs'])});
  add('Hack squat',{K:[st({hip:[104,98],t:-18,lN:{a:[126,176],f:-12},lF:{a:[123,176],f:-12},aN:{r:1,e:[8,16],w:[12,2]},aF:{r:1,e:[8,16],w:[12,2]}}),
      st({hip:[92,128],t:-18,lN:{a:[126,176],f:-12},lF:{a:[123,176],f:-12},aN:{r:1,e:[8,16],w:[12,2]},aF:{r:1,e:[8,16],w:[12,2]}})],
    eq:[{k:'rail',x1:118,y1:184,x2:62,y2:20},{k:'tpad',side:'back'},{k:'rail',x1:112,y1:184,x2:150,y2:168}],mus:m(['quads'],['glutes'])});
  add('Leg press',{K:[{hip:[72,142],t:-62,lN:{a:[104,104],f:-50,s:1},lF:{a:[101,104],f:-50,s:1},aN:{e:[22,20],w:[44,26]},aF:{e:[21,20],w:[43,26]}},
      {hip:[72,142],t:-62,lN:{a:[138,80],f:-50,s:1},lF:{a:[135,80],f:-50,s:1},aN:{e:[22,20],w:[44,26]},aF:{e:[21,20],w:[43,26]}}],
    eq:[{k:'back',x1:62,y1:150,x2:14,y2:120},{k:'seat',x:60,y:150,w:40},{k:'plat',at:'aN',ang:-45}],mus:m(['quads','glutes'],['hams'])});
  add('Bulgarian split squat',{K:[st({hip:[100,106],t:6,lN:{a:[128,GY]},lF:{a:[58,142],f:165,s:1},aN:HANG,aF:HANG}),
      st({hip:[94,136],t:10,lN:{a:[128,GY]},lF:{a:[58,142],f:165,s:1},aN:HANG,aF:HANG})],
    eq:[{k:'bench',x:22,y:146,w:48},DB,DBF],mus:m(['quads','glutes'],['adductors','hams'])});
  add('Walking lunge|Lunge|Reverse lunge',{K:[st({aN:HANG,aF:HANG}),st({hip:[96,140],t:4,lN:{a:[128,GY]},lF:{a:[62,176],f:40,s:1},aN:HANG,aF:HANG})],
    eq:[DB,DBF],mus:m(['quads','glutes'],['hams','adductors'])});
  add('Leg extension',{K:[{hip:[84,128],t:-6,lN:{ta:90,sa:6,f:80},lF:{ta:90,sa:6,f:80},aN:{ua:12,fa:6},aF:{ua:12,fa:6}},
      {hip:[84,128],t:-6,lN:{ta:90,sa:88,f:-10},lF:{ta:90,sa:88,f:-10},aN:{ua:12,fa:6},aF:{ua:12,fa:6}}],
    eq:[{k:'seat',x:66,y:134,w:62},{k:'back',x1:70,y1:132,x2:58,y2:80},{k:'pad',at:'aN',dx:3,dy:-3,r:6}],mus:m(['quads'])});
  add('Romanian deadlift|Rdl|Stiff leg deadlift',{K:[st({aN:{ua:2,fa:2},aF:{ua:1,fa:1}}),st({hip:[66,114],t:72,aN:HANG,aF:HANG})],
    eq:[PL],mus:m(['hams','glutes'],['lowback','forearms'])});
  add('Good morning',{K:[st(Object.assign({hip:[98,104],t:4},arms({r:1,e:[-9,14],w:[-12,0]}))),st(Object.assign({hip:[68,112],t:75},arms({r:1,e:[-9,14],w:[-12,0]})))],
    eq:[{k:'plate',at:'nape',r:17}],mus:m(['hams','lowback'],['glutes'])});
  add('Deadlift|Conventional deadlift|Sumo deadlift',{K:[{hip:[80,140],t:50,lN:{a:[103,GY]},lF:{a:[99,GY]},aN:HANG,aF:HANG},st({t:-2,aN:{ua:-2,fa:-2},aF:{ua:-2,fa:-2}})],
    eq:[{k:'plate',at:'wN',dy:5,r:16}],mus:m(['glutes','hams','lowback'],['quads','traps','forearms'])});
  add('Trap bar deadlift',{K:[{hip:[82,142],t:38,lN:{a:[103,GY]},lF:{a:[99,GY]},aN:HANG,aF:HANG},st({t:-2,aN:{ua:-2,fa:-2},aF:{ua:-2,fa:-2}})],
    eq:[{k:'plate',at:'wN',dy:5,r:16}],mus:m(['quads','glutes'],['hams','lowback','traps'])});
  add('Single leg Romanian deadlift',{K:[st({lF:{ta:2,sa:2},aN:HANG,aF:HANG}),st({hip:[74,108],t:80,lN:{a:[100,GY]},lF:{ta:-80,sa:-82},aN:HANG,aF:HANG})],
    eq:[DB],mus:m(['hams','glutes'],['lowback'])});
  add('Kettlebell swing',{K:[{hip:[72,116],t:58,lN:{a:[104,GY]},lF:{a:[100,GY]},aN:{ua:-24,fa:-28},aF:{ua:-24,fa:-28}},st({t:-4,aN:{ua:90,fa:92},aF:{ua:90,fa:92}})],
    eq:[{k:'kb',at:'wN'}],mus:m(['glutes','hams'],['lowback','delts']),dur:1700});
  add('Back extension|Hyperextension',{K:[{hip:[100,118],t:150,lN:{a:[46,176],f:150,back:1},lF:{a:[44,176],f:150,back:1},aN:{r:1,e:[8,14],w:[15,4]},aF:{r:1,e:[8,14],w:[15,4]}},
      {hip:[100,118],t:45,lN:{a:[46,176],f:150,back:1},lF:{a:[44,176],f:150,back:1},aN:{r:1,e:[8,14],w:[15,4]},aF:{r:1,e:[8,14],w:[15,4]}}],
    eq:[{k:'rail',x1:40,y1:170,x2:110,y2:184},{k:'pad',x:96,y:126,r:7},{k:'pad',x:46,y:168,r:5}],mus:m(['lowback','glutes'],['hams'])});
  add('Hip thrust',{K:[{hip:[92,168],sh:[62,138],hd:30,lN:{a:[134,GY],s:1},lF:{a:[131,GY],s:1},aN:{at:'hip',d:[0,-12],s:-1},aF:{at:'hip',d:[-2,-12],s:-1}},
      {hip:[104,138],sh:[62,138],hd:40,lN:{a:[134,GY],s:1},lF:{a:[131,GY],s:1},aN:{at:'hip',d:[0,-12],s:-1},aF:{at:'hip',d:[-2,-12],s:-1}}],
    eq:[{k:'bench',x:16,y:142,w:50},{k:'plate',at:'hip',dy:-14,r:15}],mus:m(['glutes'],['hams','quads'])});
  add('Glute bridge',{K:[{hip:[94,178],sh:[56,176],hd:6,lN:{a:[130,GY],s:1},lF:{a:[127,GY],s:1},aN:{W:[104,182],s:-1},aF:{W:[102,182],s:-1}},
      {hip:[100,150],sh:[56,176],hd:6,lN:{a:[130,GY],s:1},lF:{a:[127,GY],s:1},aN:{W:[104,182],s:-1},aF:{W:[102,182],s:-1}}],mus:m(['glutes'],['hams'])});
  add('Cable kickback',{K:[st({t:14,lN:{ta:-4,sa:-4},aN:{ua:62,fa:72},aF:{ua:62,fa:72}}),st({t:14,lN:{ta:-42,sa:-48,f:-30},aN:{ua:62,fa:72},aF:{ua:62,fa:72}})],
    eq:[{k:'tower',x:176,top:20},{k:'cable',from:[172,176],to:'aN'}],mus:m(['glutes'],['hams'])});
  add('Standing calf raise|Calf raise',{K:[st({lN:{a:[100,182],f:8},lF:{a:[97,182],f:8},aN:HANG,aF:HANG}),st({hip:[100,94],lN:{a:[100,172],f:62},lF:{a:[97,172],f:62},aN:HANG,aF:HANG})],
    eq:[DB,DBF],mus:m(['calves']),dur:1800});
  add('Seated calf raise',{K:[{hip:[80,132],t:-2,lN:{ta:90,sa:4,f:8},lF:{ta:90,sa:4,f:8},aN:{ua:40,fa:30},aF:{ua:40,fa:30}},{hip:[80,132],t:-2,lN:{ta:100,sa:4,f:55},lF:{ta:100,sa:4,f:55},aN:{ua:44,fa:34},aF:{ua:44,fa:34}}],
    eq:[{k:'seat',x:58,y:136,w:40},{k:'box',x:118,y:176,w:30,h:8},{k:'pad',at:'kN',dy:-7,r:6}],mus:m(['calves']),dur:1800});
  add('Tibialis raise',{K:[st({hip:[74,108],t:-14,lN:{a:[110,182],f:10},lF:{a:[107,182],f:10},aN:HANG,aF:HANG}),st({hip:[74,108],t:-14,lN:{a:[110,182],f:-32},lF:{a:[107,182],f:-32},aN:HANG,aF:HANG})],
    eq:[{k:'wall',x:58}],mus:m(['tibialis']),dur:1800});
  add('Nordic curl|Nordic hamstring curl',{K:[{hip:[104,138],t:0,lN:{k:[104,178],a:[70,180],f:170,back:1},lF:{k:[104,178],a:[70,180],f:170,back:1},aN:{ua:30,fa:50},aF:{ua:30,fa:50}},
      {hip:[136.8,155],t:55,lN:{k:[104,178],a:[70,180],f:170,back:1},lF:{k:[104,178],a:[70,180],f:170,back:1},aN:{ua:60,fa:40},aF:{ua:60,fa:40}}],
    eq:[{k:'pad',x:70,y:172,r:6}],mus:m(['hams'],['glutes']),dur:3000});
  add('Lying leg curl',{K:[{hip:[94,138],sh:[142,136],hd:10,lN:{ta:-90,sa:-92,f:180},lF:{ta:-90,sa:-92,f:180},aN:{ua:58,fa:70},aF:{ua:58,fa:70}},
      {hip:[94,138],sh:[142,136],hd:10,lN:{ta:-90,sa:-200,f:100},lF:{ta:-90,sa:-200,f:100},aN:{ua:58,fa:70},aF:{ua:58,fa:70}}],
    eq:[{k:'bench',x:56,y:146,w:112},{k:'pad',at:'aN',dy:-6,r:6}],mus:m(['hams'],['calves'])});
  add('Seated leg curl',{K:[{hip:[74,124],t:-14,lN:{ta:90,sa:90,f:-10},lF:{ta:90,sa:90,f:-10},aN:{ua:20,fa:10},aF:{ua:20,fa:10}},{hip:[74,124],t:-14,lN:{ta:90,sa:8,f:80},lF:{ta:90,sa:8,f:80},aN:{ua:20,fa:10},aF:{ua:20,fa:10}}],
    eq:[{k:'seat',x:56,y:130,w:66},{k:'back',x1:62,y1:128,x2:50,y2:76},{k:'pad',x:108,y:114,r:6},{k:'pad',at:'aN',dx:3,dy:-6,r:6}],mus:m(['hams'])});
  add('Step up',{K:[st({hip:[104,112],t:10,lN:{a:[128,146]},lF:{a:[96,GY]},aN:HANG,aF:HANG}),st({hip:[124,68],t:4,lN:{a:[128,146]},lF:{a:[120,140],f:20},aN:HANG,aF:HANG})],
    eq:[{k:'box',x:112,y:146,w:50,h:38},DB,DBF],mus:m(['quads','glutes'],['hams'])});
  add('Eccentric step down',{K:[st({hip:[70,68],t:4,lN:{a:[72,146]},lF:{a:[80,144],f:20},aN:{ua:30,fa:30},aF:{ua:30,fa:30}}),st({hip:[72,108],t:16,lN:{a:[72,146]},lF:{a:[104,GY],f:20},aN:{ua:60,fa:60},aF:{ua:60,fa:60}})],
    eq:[{k:'box',x:42,y:146,w:54,h:38}],mus:m(['quads'],['glutes']),dur:3200});

  /* chest and shoulders */
  var BENCH={k:'bench',x:40,y:150,w:104};
  function lying(arm){ return {hip:[116,143],sh:[66,141],hd:0,lN:{a:[146,GY],s:1},lF:{a:[143,GY],s:1},aN:arm,aF:arm}; }
  add('Barbell bench press|Bench press|Close grip bench',{K:[lying({ua:72,fa:180}),lying({ua:178,fa:180})],eq:[BENCH,PL],mus:m(['chest'],['triceps','delts'])});
  add('Dumbbell bench press|Dumbbell press',{K:[lying({ua:72,fa:180}),lying({ua:178,fa:180})],eq:[BENCH,DB],mus:m(['chest'],['triceps','delts'])});
  function incl(arm,legs){ return {hip:[100,144],t:-48,lN:{ta:90,sa:0},lF:{ta:90,sa:0},aN:arm,aF:arm}; }
  add('Incline dumbbell press|Incline bench press|Incline press',{K:[incl({ua:62,fa:170}),incl({ua:176,fa:178})],
    eq:[{k:'seat',x:86,y:148,w:40},{k:'back',x1:96,y1:146,x2:52,y2:104},DB],mus:m(['chest'],['delts','triceps'])});
  function fr(o){ return Object.assign({v:'front',hip:[100,104],lL:{a:[90,GY]},lR:{a:[110,GY]},aL:{ua:6,fa:6},aR:{ua:6,fa:6}},o||{}); }
  add('Cable fly|Dumbbell fly|Chest fly',{K:[fr({aL:{e:[30,-4],w:[56,-10]},aR:{e:[30,-4],w:[56,-10]}}),fr({aL:{e:[12,20],w:[-2,30]},aR:{e:[12,20],w:[-2,30]}})],
    eq:[{k:'tower',x:14,top:24},{k:'tower',x:186,top:24},{k:'cable',from:[18,40],to:'wL'},{k:'cable',from:[182,40],to:'wR'}],mus:m(['chest'],['delts'])});
  function seatedF(o){ return fr(Object.assign({hip:[100,128],lL:{k:[84,140],a:[84,GY]},lR:{k:[116,140],a:[116,GY]}},o)); }
  add('Pec deck',{K:[seatedF({aL:{e:[29,0],w:[30,-26]},aR:{e:[29,0],w:[30,-26]}}),seatedF({aL:{e:[8,4],w:[2,-22]},aR:{e:[8,4],w:[2,-22]}})],
    eq:[{k:'seat',x:76,y:132,w:48}],mus:m(['chest'],['delts'])});
  add('Reverse pec deck',{K:[seatedF({aL:{e:[6,8],w:[2,14]},aR:{e:[6,8],w:[2,14]}}),seatedF({aL:{e:[29,0],w:[56,0]},aR:{e:[29,0],w:[56,0]}})],
    eq:[{k:'seat',x:76,y:132,w:48}],mus:m(['delts'],['traps'])});
  add('Dips|Chest dips|Tricep dips|Straight-bar dips',{K:[{hip:[98,108],t:6,lN:{ta:-10,sa:-60},lF:{ta:-6,sa:-56},aN:{W:[104,112],s:1},aF:{W:[102,112],s:1}},
      {hip:[94,138],t:16,lN:{ta:-10,sa:-60},lF:{ta:-6,sa:-56},aN:{W:[104,112],s:1},aF:{W:[102,112],s:1}}],eq:[{k:'pbar',x:104,y:112}],mus:m(['chest','triceps'],['delts'])});
  function pushup(top,o){ return Object.assign({hip:top?[104,143]:[101,164],sh:top?[150,124]:[146,158],hd:-14,lN:{a:[30,174],f:72},lF:{a:[28,174],f:72},aN:{W:[152,182],s:-1},aF:{W:[150,182],s:-1}},o||{}); }
  add('Push up|Push-up|Pushup|Push-ups',{K:[pushup(true),pushup(false)],mus:m(['chest','triceps'],['delts','abs'])});
  add('Pike push-up|Feet-raised pike push-up',{K:[{hip:[96,96],sh:[126,138],hd:-4,lN:{a:[62,180],f:60},lF:{a:[60,180],f:60},aN:{W:[136,182],s:-1},aF:{W:[134,182],s:-1}},
      {hip:[94,104],sh:[124,152],hd:-4,lN:{a:[62,180],f:60},lF:{a:[60,180],f:60},aN:{W:[136,182],s:-1},aF:{W:[134,182],s:-1}}],mus:m(['delts','triceps'],['traps'])});
  add('Handstand push-up|Wall handstand push-up negatives|Full wall handstand push-up|Freestanding handstand push-up|Partial wall HSPU (to a pad)',
    {K:[{hip:[104,72],sh:[106,124],hd:0,lN:{ta:180,sa:182,f:-90},lF:{ta:178,sa:180,f:-90},aN:{W:[112,180],s:-1},aF:{W:[108,180],s:-1}},
      {hip:[104,96],sh:[108,150],hd:0,lN:{ta:180,sa:182,f:-90},lF:{ta:178,sa:180,f:-90},aN:{W:[112,180],s:-1},aF:{W:[108,180],s:-1}}],eq:[{k:'wall',x:88}],mus:m(['delts','triceps'],['traps','abs'])});
  add('Overhead press|Military press|Standing press',{K:[st({t:-4,aN:{ua:28,fa:180},aF:{ua:26,fa:180}}),st({t:0,aN:{ua:178,fa:180},aF:{ua:176,fa:180}})],eq:[PL],mus:m(['delts'],['triceps','traps','abs'])});
  function seatS(o){ return Object.assign({hip:[96,144],t:-2,lN:{ta:88,sa:2},lF:{ta:88,sa:2}},o); }
  add('Dumbbell shoulder press|Seated shoulder press|Arnold press',{K:[seatS({aN:{e:[3,12],w:[3,-14]},aF:{e:[2,12],w:[2,-14]}}),seatS({aN:{e:[2,-27],w:[2,-54]},aF:{e:[1,-27],w:[1,-54]}})],
    eq:[{k:'seat',x:78,y:148,w:36},{k:'back',x1:86,y1:146,x2:86,y2:86},DB],mus:m(['delts'],['triceps','traps'])});
  add('Lateral raise|Dumbbell lateral raise|Side raise',{K:[fr({aL:{e:[5,28],w:[8,55]},aR:{e:[5,28],w:[8,55]}}),fr({aL:{e:[28,4],w:[54,4]},aR:{e:[28,4],w:[54,4]}})],
    eq:[{k:'db',at:'wL'},{k:'db',at:'wR'}],mus:m(['delts'],['traps'])});
  add('Cable lateral raise',{K:[fr({aR:{e:[-1,28],w:[-8,54]},aL:{e:[22,20],w:[30,40]}}),fr({aR:{e:[28,2],w:[55,0]},aL:{e:[22,20],w:[30,40]}})],
    eq:[{k:'tower',x:22,top:30},{k:'cable',from:[26,176],to:'wR'}],mus:m(['delts'])});
  function bentF(o){ return fr(Object.assign({tl:0.42,hs:0.85,hip:[100,118],lL:{a:[88,GY]},lR:{a:[112,GY]}},o)); }
  add('Rear delt fly|Bent over reverse fly',{K:[bentF({aL:{e:[3,28],w:[5,54]},aR:{e:[3,28],w:[5,54]}}),bentF({aL:{e:[28,2],w:[54,0]},aR:{e:[28,2],w:[54,0]}})],
    eq:[{k:'db',at:'wL'},{k:'db',at:'wR'}],mus:m(['delts'],['traps'])});
  add('Cable face pull|Face pull',{K:[st({t:-4,aN:{e:[29,-3],w:[56,-6]},aF:{e:[28,-3],w:[55,-6]}}),st({t:-6,aN:{e:[-6,-6],w:[10,-22]},aF:{e:[-7,-6],w:[9,-22]}})],
    eq:[{k:'tower',x:180,top:22},{k:'cable',from:[176,52],to:'wN'}],mus:m(['delts','traps'])});
  add('Cable external rotation|External rotation',{K:[fr({aR:{e:[4,28],w:[-14,30]}}),fr({aR:{e:[4,28],w:[26,30]}})],
    eq:[{k:'tower',x:20,top:40},{k:'cable',from:[24,134],to:'wR'}],mus:m(['delts'])});
  add('Y-T-W raise|YTW raise',{K:[fr({aL:{e:[20,-20],w:[40,-42]},aR:{e:[20,-20],w:[40,-42]}}),fr({aL:{e:[29,0],w:[56,0]},aR:{e:[29,0],w:[56,0]}}),
      fr({aL:{e:[26,10],w:[30,-14]},aR:{e:[26,10],w:[30,-14]}}),fr({aL:{e:[20,-20],w:[40,-42]},aR:{e:[20,-20],w:[40,-42]}})],mus:m(['delts','traps']),dur:4200});
  add('Shrug|Barbell shrug|Dumbbell shrug',{K:[fr({aL:{e:[3,28],w:[5,55]},aR:{e:[3,28],w:[5,55]}}),fr({shr:-7,aL:{e:[3,28],w:[5,55]},aR:{e:[3,28],w:[5,55]}})],
    eq:[{k:'db',at:'wL'},{k:'db',at:'wR'}],mus:m(['traps']),dur:1800});

  /* back */
  var ROWB={hip:[70,112],t:70};
  add('Barbell row|Bent over row|Pendlay row',{K:[st(Object.assign({},ROWB,{aN:{e:[0,28],w:[0,55]},aF:{e:[0,28],w:[0,55]}})),st(Object.assign({},ROWB,{aN:{e:[-20,-6],w:[-14,20]},aF:{e:[-20,-6],w:[-14,20]}}))],
    eq:[PL],mus:m(['lats','traps'],['biceps','delts','lowback'])});
  add('Chest supported row',{K:[{hip:[80,140],t:52,lN:{a:[94,GY]},lF:{a:[91,GY]},aN:{e:[0,28],w:[0,55]},aF:{e:[0,28],w:[0,55]}},{hip:[80,140],t:52,lN:{a:[94,GY]},lF:{a:[91,GY]},aN:{e:[-20,-4],w:[-12,22]},aF:{e:[-20,-4],w:[-12,22]}}],
    eq:[{k:'tpad',side:'front'},DB],mus:m(['lats','traps'],['biceps','delts'])});
  add('Lat pulldown|Pulldown',{K:[{hip:[96,142],t:-10,lN:{ta:92,sa:6},lF:{ta:92,sa:6},aN:{e:[6,-29],w:[10,-56]},aF:{e:[5,-29],w:[9,-56]}},
      {hip:[96,142],t:-14,lN:{ta:92,sa:6},lF:{ta:92,sa:6},aN:{e:[-8,22],w:[10,2]},aF:{e:[-9,22],w:[9,2]}}],
    eq:[{k:'seat',x:76,y:146,w:40},{k:'pad',x:136,y:131,r:6},{k:'cable',from:[100,12],to:'wN'},{k:'bar',at:'wN'}],mus:m(['lats'],['biceps','traps'])});
  function hang(o){ return Object.assign({sh:[102,80],hip:[104,130],lN:{ta:-14,sa:-40},lF:{ta:-6,sa:-30},aN:{W:[106,26],s:-1},aF:{W:[104,26],s:-1}},o||{}); }
  add('Pull up|Pull-up|Pull-ups|Chin up|Chin-up|Weighted pull-ups|Chest-to-bar pull-ups|Band-assisted pull-ups|Pull-up negatives|First (or more) pull-ups|Explosive high pull-ups',
    {K:[hang(),hang({sh:[100,46],hip:[102,96]})],eq:[{k:'hbar',x:106,y:26}],mus:m(['lats'],['biceps','forearms','traps'])});
  add('Muscle-up|Muscle-ups|Muscle-up singles|Muscle-up negatives|Band-assisted muscle-ups',{K:[hang(),hang({sh:[100,46],hip:[102,96]}),hang({sh:[104,10],hip:[102,60],aN:{W:[110,28],s:1},aF:{W:[108,28],s:1}})],
    eq:[{k:'hbar',x:106,y:26}],mus:m(['lats','triceps'],['chest','biceps']),dur:3200});
  add('Dead hang|Scapula pulls',{K:[hang(),hang({sh:[102,76],hip:[104,126]})],eq:[{k:'hbar',x:106,y:26}],mus:m(['forearms','lats']),dur:3000});
  add('Seated cable row|Cable row',{K:[{hip:[76,158],t:24,lN:{a:[146,170],f:-62},lF:{a:[143,170],f:-62},aN:{ua:92,fa:92},aF:{ua:92,fa:92}},
      {hip:[76,158],t:-6,lN:{a:[146,170],f:-62},lF:{a:[143,170],f:-62},aN:{e:[-18,14],w:[6,22]},aF:{e:[-18,14],w:[6,22]}}],
    eq:[{k:'bench',x:40,y:164,w:74},{k:'tower',x:178,top:120},{k:'cable',from:[174,158],to:'wN'}],mus:m(['lats','traps'],['biceps','delts'])});
  add('Single arm dumbbell row|One arm dumbbell row|Dumbbell row',{K:[{hip:[84,124],t:86,lN:{a:[68,GY]},lF:{k:[100,144],a:[70,145],f:180},aN:{e:[0,28],w:[0,52]},aF:{e:[0,13],w:[0,24]}},
      {hip:[84,124],t:86,lN:{a:[68,GY]},lF:{k:[100,144],a:[70,145],f:180},aN:{e:[-22,-8],w:[-14,16]},aF:{e:[0,13],w:[0,24]}}],
    eq:[{k:'bench',x:96,y:148,w:70},DB],mus:m(['lats'],['biceps','traps','delts'])});
  add('Straight arm pulldown',{K:[st({hip:[92,106],t:20,aN:{ua:138,fa:138},aF:{ua:136,fa:136}}),st({hip:[92,106],t:20,aN:{ua:6,fa:6},aF:{ua:5,fa:5}})],
    eq:[{k:'tower',x:180,top:22},{k:'cable',from:[176,40],to:'wN'}],mus:m(['lats'],['triceps'])});

  /* arms */
  add('Barbell curl|Ez bar curl',{K:[st({aN:{ua:2,fa:4},aF:{ua:1,fa:3}}),st({aN:{ua:4,fa:150},aF:{ua:3,fa:148}})],eq:[PL],mus:m(['biceps'],['forearms'])});
  add('Dumbbell curl|Hammer curl|Bicep curl',{K:[st({aN:{ua:2,fa:4},aF:{ua:1,fa:3}}),st({aN:{ua:4,fa:150},aF:{ua:3,fa:148}})],eq:[DB,DBF],mus:m(['biceps'],['forearms'])});
  add('Cable curl',{K:[st({aN:{ua:2,fa:8},aF:{ua:1,fa:7}}),st({aN:{ua:4,fa:150},aF:{ua:3,fa:148}})],eq:[{k:'tower',x:182,top:30},{k:'cable',from:[178,176],to:'wN'}],mus:m(['biceps'],['forearms'])});
  add('Preacher curl',{K:[{hip:[90,144],t:12,lN:{ta:90,sa:0},lF:{ta:90,sa:0},aN:{ua:52,fa:62},aF:{ua:50,fa:60}},{hip:[90,144],t:12,lN:{ta:90,sa:0},lF:{ta:90,sa:0},aN:{ua:52,fa:162},aF:{ua:50,fa:160}}],
    eq:[{k:'back',x1:112,y1:98,x2:140,y2:124},{k:'rail',x1:132,y1:124,x2:132,y2:184},{k:'seat',x:72,y:148,w:36},PL],mus:m(['biceps'])});
  add('Incline dumbbell curl',{K:[incl({ua:-6,fa:-6}),incl({ua:-6,fa:140})],eq:[{k:'seat',x:86,y:148,w:40},{k:'back',x1:96,y1:146,x2:52,y2:104},DB,DBF],mus:m(['biceps'])});
  add('Overhead tricep extension|Overhead triceps extension',{K:[st({aN:{ua:166,fa:-24},aF:{ua:164,fa:-24}}),st({aN:{ua:172,fa:176},aF:{ua:170,fa:174}})],eq:[DB],mus:m(['triceps'])});
  add('Rope pushdown|Tricep pushdown|Triceps pushdown',{K:[st({t:8,aN:{ua:4,fa:118},aF:{ua:3,fa:116}}),st({t:8,aN:{ua:4,fa:6},aF:{ua:3,fa:5}})],
    eq:[{k:'tower',x:170,top:22},{k:'cable',from:[166,34],to:'wN'}],mus:m(['triceps'])});
  add('Skull crusher|Lying tricep extension',{K:[lying({ua:166,fa:-56}),lying({ua:170,fa:174})],eq:[BENCH,PL],mus:m(['triceps'])});
  add('Tricep kickback|Triceps kickback',{K:[st(Object.assign({},ROWB,{aN:{ua:-70,fa:0},aF:{e:[0,28],w:[0,52]}})),st(Object.assign({},ROWB,{aN:{ua:-70,fa:-70},aF:{e:[0,28],w:[0,52]}}))],eq:[DB],mus:m(['triceps'])});

  /* core */
  add('Cable crunch',{K:[{hip:[104,138],t:8,lN:{k:[106,178],a:[72,180],f:170,back:1},lF:{k:[103,178],a:[70,180],f:170,back:1},aN:{r:1,e:[12,8],w:[9,-15]},aF:{r:1,e:[12,8],w:[9,-15]}},
      {hip:[104,138],t:84,lN:{k:[106,178],a:[72,180],f:170,back:1},lF:{k:[103,178],a:[70,180],f:170,back:1},aN:{r:1,e:[12,8],w:[9,-15]},aF:{r:1,e:[12,8],w:[9,-15]}}],
    eq:[{k:'tower',x:178,top:18},{k:'cable',from:[174,28],to:'wN'}],mus:m(['abs'],['obliques'])});
  add('Hanging leg raise|Knee raise|Toes to bar',{K:[hang({lN:{ta:2,sa:2},lF:{ta:0,sa:0}}),hang({lN:{ta:96,sa:92},lF:{ta:94,sa:90}})],eq:[{k:'hbar',x:106,y:26}],mus:m(['abs','hipflex'],['forearms'])});
  add('L-sit|Tuck L-sit|Full L-sit|V-sit progressions',{K:[{hip:[100,150],t:-4,lN:{ta:88,sa:88,f:-20},lF:{ta:86,sa:86,f:-20},aN:{W:[104,182],s:1},aF:{W:[102,182],s:1}},{hip:[100,146],t:-4,lN:{ta:92,sa:92,f:-20},lF:{ta:90,sa:90,f:-20},aN:{W:[104,182],s:1},aF:{W:[102,182],s:1}}],
    mus:m(['abs','hipflex'],['triceps']),dur:3000});
  function plank(dip,o){ return Object.assign({sh:[146,150],hip:[100,157+dip],hd:-4,lN:{a:[30,174],f:72},lF:{a:[28,174],f:72},aN:{e:[0,30],w:[26,32]},aF:{e:[-1,30],w:[25,32]}},o||{}); }
  add('Plank|Forearm plank|Core endurance hold',{K:[plank(0),plank(-2)],mus:m(['abs'],['delts','obliques','glutes']),dur:3200});
  add('Side plank',{K:[{sh:[140,138],hip:[94,158],hd:-6,lN:{a:[30,176],f:30},lF:{a:[34,178],f:30},aN:{ua:178,fa:180},aF:{e:[0,30],w:[24,32]}},
      {sh:[140,136],hip:[96,150],hd:-6,lN:{a:[30,176],f:30},lF:{a:[34,178],f:30},aN:{ua:178,fa:180},aF:{e:[0,30],w:[24,32]}}],mus:m(['obliques'],['abs','delts','glutes']),dur:3200});
  add('Ab wheel|Ab rollout',{K:[{hip:[58,138],t:55,lN:{k:[54,178],a:[22,180],f:170,back:1},lF:{k:[52,178],a:[20,180],f:170,back:1},aN:{W:[101,166],s:-1},aF:{W:[99,166],s:-1}},
      {hip:[82,150],t:82,lN:{k:[54,178],a:[22,180],f:170,back:1},lF:{k:[52,178],a:[20,180],f:170,back:1},aN:{W:[180,168],s:-1},aF:{W:[178,168],s:-1}}],
    eq:[{k:'wheel',at:'wN'}],mus:m(['abs'],['lats','delts']),dur:3000});
  add('Russian twist',{K:[fr({hip:[100,150],tl:0.9,t:-10,lL:{k:[82,136],a:[80,166]},lR:{k:[118,136],a:[120,166]},aL:{W:[74,146]},aR:{W:[76,146]}}),
      fr({hip:[100,150],tl:0.9,t:10,lL:{k:[82,136],a:[80,166]},lR:{k:[118,136],a:[120,166]},aL:{W:[124,146]},aR:{W:[126,146]}})],
    eq:[{k:'ball',at:'mid',r:8}],mus:m(['obliques'],['abs']),dur:1800});
  add('Pallof press',{K:[st({aN:{e:[10,20],w:[18,8]},aF:{e:[9,20],w:[17,8]}}),st({aN:{e:[29,4],w:[56,6]},aF:{e:[28,4],w:[55,6]}})],
    eq:[{k:'tower',x:22,top:40},{k:'cable',from:[26,94],to:'wN'}],mus:m(['obliques','abs'])});
  add('Dead bug',{K:[{hip:[100,174],sh:[56,172],hd:0,lN:{ta:180,sa:90,f:0},lF:{ta:180,sa:90,f:0},aN:{ua:180,fa:180},aF:{ua:180,fa:180}},
      {hip:[100,174],sh:[56,172],hd:0,lN:{ta:100,sa:96,f:0},lF:{ta:180,sa:90,f:0},aN:{ua:-100,fa:-96},aF:{ua:180,fa:180}}],mus:m(['abs'],['hipflex']),dur:3000});
  add('Farmer carry|Farmers walk|Suitcase carry',{K:[st({hip:[100,106],lN:{a:[116,GY]},lF:{a:[86,182],f:30},aN:HANG,aF:HANG}),st({hip:[100,104],aN:HANG,aF:HANG}),
      st({hip:[100,106],lN:{a:[86,182],f:30},lF:{a:[116,GY]},aN:HANG,aF:HANG}),st({hip:[100,104],aN:HANG,aF:HANG}),st({hip:[100,106],lN:{a:[116,GY]},lF:{a:[86,182],f:30},aN:HANG,aF:HANG})],
    eq:[DB,DBF],mus:m(['forearms','traps'],['abs','glutes']),dur:2200});

  /* power */
  add('Box jump',{K:[{hip:[70,136],t:40,lN:{k:[96,152],a:[82,182],f:10},lF:{k:[92,152],a:[78,182],f:10},aN:{ua:-50,fa:-40},aF:{ua:-52,fa:-42}},
      {hip:[110,84],t:12,lN:{k:[140,96],a:[118,126],f:40},lF:{k:[136,98],a:[114,128],f:40},aN:{ua:150,fa:160},aF:{ua:148,fa:158}},
      {hip:[148,100],t:30,lN:{k:[174,116],a:[160,132],f:4},lF:{k:[170,116],a:[156,132],f:4},aN:{ua:70,fa:80},aF:{ua:68,fa:78}},
      {hip:[70,136],t:40,lN:{k:[96,152],a:[82,182],f:10},lF:{k:[92,152],a:[78,182],f:10},aN:{ua:-50,fa:-40},aF:{ua:-52,fa:-42}}],
    eq:[{k:'box',x:134,y:132,w:54,h:52}],mus:m(['quads','glutes'],['calves']),dur:3000});
  add('Pogo hops|Jump rope',{K:[st({lN:{a:[100,180],f:50},lF:{a:[97,180],f:50},aN:{ua:20,fa:60},aF:{ua:18,fa:58}}),st({hip:[100,94],lN:{a:[100,170],f:55},lF:{a:[97,170],f:55},aN:{ua:20,fa:60},aF:{ua:18,fa:58}})],
    mus:m(['calves']),dur:800});
  add('Medicine ball rotational throw|Med ball throw',{K:[st({hip:[98,110],t:10,aN:{e:[-14,24],w:[-22,42]},aF:{e:[-12,24],w:[-20,42]}}),st({hip:[100,106],t:0,aN:{e:[26,4],w:[52,0]},aF:{e:[25,4],w:[51,0]}})],
    eq:[{k:'ball',at:'mid',r:9}],mus:m(['obliques','abs'],['delts','glutes']),dur:1800});
  add('Pistol squat|Full pistol squat|Box pistol (to a bench)|Weighted pistol|Pistol holding a counterweight',{K:[st({lF:{ta:20,sa:24},aN:{ua:80,fa:84},aF:{ua:80,fa:84}}),
      st({hip:[82,146],t:30,lN:{a:[104,GY]},lF:{ta:94,sa:92,f:-20},aN:{ua:88,fa:90},aF:{ua:88,fa:90}})],mus:m(['quads','glutes'],['abs','adductors']),dur:3000});
  add('Front lever|Tuck front lever|Advanced tuck|Straddle front lever|Full front lever',{K:[{sh:[88,78],hip:[138,84],hd:0,lN:{ta:96,sa:98,f:0},lF:{ta:94,sa:96,f:0},aN:{W:[104,28],s:1},aF:{W:[102,28],s:1}},
      {sh:[88,78],hip:[138,78],hd:0,lN:{ta:90,sa:90,f:0},lF:{ta:88,sa:88,f:0},aN:{W:[104,28],s:1},aF:{W:[102,28],s:1}}],eq:[{k:'hbar',x:104,y:28}],mus:m(['lats','abs'],['delts']),dur:3000});

  /* ---------- stretches: one or more for every muscle group (hold, breathe, ease deeper) ---------- */
  var STR=[];
  function sadd(id,name,groups,hold,cues,d){ d.stretch=true; d.hold=hold; d.cues=cues; d.groups=groups; d.dur=d.dur||5200; d.id=id; d.n=name; add(name,d); STR.push(d); }
  sadd('quad','Standing quad stretch',['quads','hipflex'],'30 s each leg',['Stand tall and hold something for balance','Pull one heel to your glute, knees together','Push the hip forward a little until the front of the thigh stretches'],
    {K:[st({aN:{at:'aN',d:[0,0],s:1},aF:{ua:60,fa:70},lN:{ta:-2,sa:-40,f:40}}),st({aF:{ua:70,fa:80},lN:{ta:-12,sa:-150,f:-40},aN:{at:'aN',d:[0,0],s:1}})],mus:m(['quads'],['hipflex'])});
  sadd('ham','Standing hamstring stretch',['hams','calves'],'30 s each leg',['Heel on the floor in front, toes up, leg straight','Hands on the other thigh','Push the hips back with a flat back until the back of the leg stretches'],
    {K:[st({lN:{a:[128,182],f:-20},aN:{ua:30,fa:30},aF:{ua:30,fa:30}}),st({hip:[86,112],t:48,lN:{a:[132,182],f:-42},lF:{a:[96,GY]},aN:{ua:20,fa:10},aF:{ua:20,fa:10}})],mus:m(['hams'],['calves'])});
  sadd('hipflex','Half-kneeling hip flexor stretch',['hipflex','quads'],'30 s each side',['Back knee on the floor, front foot flat ahead','Squeeze the glute of the back leg','Shift the hips forward with the chest tall'],
    {K:[{hip:[96,140],t:0,lN:{a:[124,GY]},lF:{k:[74,178],a:[46,180],f:170,back:1},aN:{ua:20,fa:20},aF:{ua:20,fa:20}},{hip:[106,144],t:-6,lN:{a:[128,GY]},lF:{k:[74,178],a:[46,180],f:170,back:1},aN:{ua:178,fa:180},aF:{ua:176,fa:178}}],mus:m(['hipflex'],['quads','abs'])});
  sadd('glute','Lying figure-four stretch',['glutes'],'30 s each side',['Lie on your back, cross one ankle over the other knee','Pull the bottom thigh towards your chest','Keep the head and shoulders relaxed on the floor'],
    {K:[{hip:[104,176],sh:[60,176],lN:{ta:150,sa:96,f:0},lF:{ta:178,sa:82,f:0},aN:{at:'kF',d:[0,0],s:-1},aF:{at:'kF',d:[0,0],s:-1}},{hip:[104,176],sh:[60,176],lN:{ta:170,sa:110,f:0},lF:{ta:200,sa:96,f:0},aN:{at:'kF',d:[0,0],s:-1},aF:{at:'kF',d:[0,0],s:-1}}],mus:m(['glutes'],['hams'])});
  sadd('calf','Wall calf stretch',['calves'],'30 s each leg',['Hands on the wall, one foot well behind','Back leg straight, heel pressed down','Lean in until the calf stretches; bend the back knee to reach lower down'],
    {K:[st({hip:[110,106],t:16,lN:{a:[120,GY]},lF:{a:[80,GY]},aN:{W:[150,62]},aF:{W:[148,62]}}),st({hip:[118,110],t:26,lN:{a:[124,GY]},lF:{a:[74,GY]},aN:{W:[152,66]},aF:{W:[150,66]}})],eq:[{k:'wall',x:156}],mus:m(['calves'])});
  sadd('chest','Doorway chest stretch',['chest','delts'],'30 s each side',['Forearm on the door frame, elbow at shoulder height','Step through with the near foot','Turn the chest away until the front of the shoulder stretches'],
    {K:[st({aN:{e:[-6,-24],w:[-8,-50]},aF:{ua:4,fa:4}}),st({hip:[110,106],t:6,lN:{a:[128,GY]},lF:{a:[96,GY]},aN:{e:[-20,-16],w:[-22,-42]},aF:{ua:4,fa:4}})],eq:[{k:'rail',x1:86,y1:20,x2:86,y2:GY}],mus:m(['chest'],['delts','biceps'])});
  sadd('lat','Overhead side reach',['lats','obliques'],'20 s each side',['Stand tall, feet hip width','Reach one arm up and over','Lean away until the side of the back stretches; keep the hips still'],
    {K:[fr({aL:{ua:178,fa:178},aR:{ua:178,fa:178}}),fr({t:-16,aL:{ua:150,fa:150},aR:{ua:190,fa:196}})],mus:m(['lats','obliques'])});
  sadd('delt','Cross-body shoulder stretch',['delts','traps'],'30 s each side',['Bring one straight arm across the chest','Hold it above the elbow with the other hand','Pull it closer and keep the shoulder down'],
    {K:[fr({aR:{e:[4,28],w:[6,54]},aL:{ua:6,fa:6}}),fr({aR:{e:[-22,10],w:[-48,6]},aL:{e:[-10,22],w:[-30,10]}})],mus:m(['delts'],['traps'])});
  sadd('tri','Overhead triceps stretch',['triceps','lats'],'30 s each arm',['Raise one arm, bend it so the hand drops behind the head','Hold the elbow with the other hand','Gently pull the elbow back and in'],
    {K:[fr({aR:{e:[6,-28],w:[10,-54]},aL:{ua:6,fa:6}}),fr({aR:{e:[4,-28],w:[-10,-6]},aL:{e:[-12,-20],w:[-22,-34]}})],mus:m(['triceps'],['lats'])});
  sadd('bicep','Hands-behind chest opener',['biceps','chest','delts'],'30 s',['Clasp the hands behind your back','Straighten the arms','Lift the hands away from the body and open the chest'],
    {K:[st({aN:{ua:-10,fa:-10},aF:{ua:-10,fa:-10}}),st({t:-4,aN:{ua:-40,fa:-40},aF:{ua:-40,fa:-40}})],mus:m(['biceps','chest'],['delts'])});
  sadd('child',"Child's pose",['lats','lowback','traps'],'45 s',['Kneel and sit back on your heels','Walk the hands forward and rest the forehead down','Breathe into the back; reach further to feel the lats'],
    {K:[{hip:[70,150],t:60,lN:{k:[104,178],a:[64,180],f:170,back:1},lF:{k:[102,178],a:[62,180],f:170,back:1},aN:{ua:110,fa:100},aF:{ua:110,fa:100}},{hip:[68,158],t:96,lN:{k:[104,178],a:[64,180],f:170,back:1},lF:{k:[102,178],a:[62,180],f:170,back:1},aN:{ua:94,fa:92},aF:{ua:94,fa:92}}],mus:m(['lats','lowback'],['traps'])});
  sadd('knees','Knees to chest',['lowback','glutes'],'30 s',['Lie on your back','Hug both knees in towards the chest','Let the lower back sink into the floor'],
    {K:[{hip:[104,176],sh:[60,176],lN:{ta:150,sa:96,f:0},lF:{ta:148,sa:94,f:0},aN:{at:'kN',d:[0,6],s:-1},aF:{at:'kF',d:[0,6],s:-1}},{hip:[104,174],sh:[62,176],lN:{ta:196,sa:104,f:0},lF:{ta:194,sa:102,f:0},aN:{at:'kN',d:[0,6],s:-1},aF:{at:'kF',d:[0,6],s:-1}}],mus:m(['lowback'],['glutes'])});
  sadd('neck','Side neck stretch',['traps','neck'],'20 s each side',['Sit or stand tall, shoulders down','Tilt one ear towards the shoulder','Rest the hand on the head; no pulling'],
    {K:[fr({ht:0,aR:{ua:6,fa:6}}),fr({ht:-26,aR:{e:[14,-14],w:[-2,-40]}})],mus:m(['traps'],['neck'])});
  sadd('butterfly','Butterfly stretch',['adductors'],'30 s',['Sit tall with the soles of the feet together','Hold the feet','Let the knees fall out; lean forward a little for more'],
    {K:[fr({hip:[100,160],tl:0.92,lL:{k:[64,166],a:[94,178]},lR:{k:[136,166],a:[106,178]},aL:{W:[94,174]},aR:{W:[106,174]}}),fr({hip:[100,160],tl:0.8,lL:{k:[60,174],a:[94,178]},lR:{k:[140,174],a:[106,178]},aL:{W:[94,174]},aR:{W:[106,174]}})],mus:m(['adductors'])});
  sadd('cobra','Cobra stretch',['abs','hipflex'],'20 s',['Lie face down, hands under the shoulders','Press the chest up, hips stay down','Shoulders away from the ears'],
    {K:[{hip:[96,176],sh:[142,176],hd:0,lN:{ta:-90,sa:-90,f:180},lF:{ta:-90,sa:-90,f:180},aN:{W:[148,182],s:-1},aF:{W:[146,182],s:-1}},{hip:[98,174],sh:[140,132],hd:-20,lN:{ta:-90,sa:-90,f:180},lF:{ta:-90,sa:-90,f:180},aN:{W:[148,182],s:-1},aF:{W:[146,182],s:-1}}],mus:m(['abs'],['hipflex'])});
  sadd('wrist','Wrist flexor stretch',['forearms'],'20 s each arm',['Hold one arm straight out, palm up','Pull the fingers back and down with the other hand','Keep the elbow straight'],
    {K:[st({aN:{ua:90,fa:90},aF:{ua:30,fa:40}}),st({aN:{ua:90,fa:92},aF:{ua:60,fa:84}})],mus:m(['forearms'])});
  sadd('shin','Kneeling shin stretch',['tibialis','quads'],'30 s',['Kneel with the tops of the feet flat','Sit back towards the heels','Lean back a little to feel the front of the shins'],
    {K:[{hip:[100,140],t:0,lN:{k:[110,178],a:[74,180],f:170,back:1},lF:{k:[108,178],a:[72,180],f:170,back:1},aN:{ua:10,fa:10},aF:{ua:10,fa:10}},{hip:[82,166],t:-10,lN:{k:[110,178],a:[74,180],f:170,back:1},lF:{k:[108,178],a:[72,180],f:170,back:1},aN:{W:[66,182]},aF:{W:[64,182]}}],mus:m(['tibialis'],['quads'])});
  /* which stretches suit which muscles (first is best) */
  var STRETCH_FOR={quads:['quad','hipflex','shin'],hipflex:['hipflex','cobra'],hams:['ham'],glutes:['glute','knees'],calves:['calf'],tibialis:['shin'],adductors:['butterfly'],
    chest:['chest','bicep'],delts:['delt','chest'],traps:['neck','delt'],neck:['neck'],lats:['lat','child'],lowback:['knees','child'],abs:['cobra'],obliques:['lat'],
    biceps:['bicep'],triceps:['tri'],forearms:['wrist']};
  function stretchesFor(list){ var out=[]; (list||[]).forEach(function(mm){ (STRETCH_FOR[mm]||[]).forEach(function(id){ var d=STR.filter(function(x){ return x.id===id; })[0]; if(d&&out.indexOf(d)<0) out.push(d); }); }); return out; }

  /* by pattern, for names not drawn one by one */
  var FALL=[[/\bpull ?-?downs?\b/i,'Lat pulldown'],[/\bchin ?-?ups?\b|\bpull ?-?ups?\b/i,'Pull up'],[/\bpush ?-?ups?\b/i,'Push up'],[/handstand/i,'Handstand push-up'],[/\bdips?\b/i,'Dips'],
    [/front squat/i,'Front squat'],[/goblet/i,'Goblet squat'],[/split squat/i,'Bulgarian split squat'],[/pistol/i,'Pistol squat'],[/\bsquats?\b/i,'Barbell back squat'],[/\blunges?\b/i,'Walking lunge'],
    [/romanian|\brdl\b|stiff.leg/i,'Romanian deadlift'],[/deadlift/i,'Deadlift'],[/thrust/i,'Hip thrust'],[/\bbridges?\b/i,'Glute bridge'],[/leg press/i,'Leg press'],[/leg extension/i,'Leg extension'],
    [/leg curl|hamstring curl/i,'Seated leg curl'],[/\bcalf\b|\bcalves\b/i,'Standing calf raise'],[/incline.*(press|bench)/i,'Incline dumbbell press'],[/\bbench\b|chest press|floor press/i,'Barbell bench press'],
    [/\bfl(y|ies|yes)\b|crossover/i,'Cable fly'],[/overhead press|shoulder press|military|push press/i,'Overhead press'],[/lateral raise|side raise/i,'Lateral raise'],[/rear delt|reverse fly/i,'Rear delt fly'],
    [/face pull/i,'Cable face pull'],[/\brows?\b/i,'Barbell row'],[/\bshrugs?\b/i,'Shrug'],[/hammer|\bcurls?\b/i,'Dumbbell curl'],[/pushdown|pressdown/i,'Rope pushdown'],[/skull/i,'Skull crusher'],
    [/overhead.*ext|\btriceps?\b/i,'Overhead tricep extension'],[/\bplanks?\b/i,'Plank'],[/crunch|sit ?-?ups?\b/i,'Cable crunch'],[/leg raise|knee raise/i,'Hanging leg raise'],
    [/\bl-?sit|\bv-?sit/i,'L-sit'],[/front lever/i,'Front lever'],[/muscle ?-?ups?\b/i,'Muscle-up'],[/\bcarr(y|ies)\b|\bwalks?\b/i,'Farmer carry'],[/\bswings?\b/i,'Kettlebell swing'],[/step ?-?ups?\b/i,'Step up'],
    [/\bjumps?\b/i,'Box jump'],[/\bhops?\b|\bskip/i,'Pogo hops'],[/\btwists?\b/i,'Russian twist'],[/rollout|ab wheel/i,'Ab wheel'],[/back extension|hyperextension|superman/i,'Back extension']];
  function find(name){
    var n=String(name||'').toLowerCase().trim(); if(!n) return null;
    if(LIB[n]) return LIB[n];
    for(var i=0;i<FALL.length;i++) if(FALL[i][0].test(n)) return LIB[FALL[i][1].toLowerCase()];
    return null;
  }
  function box(D){
    if(D._box) return D._box;
    var x0=1e9,y0=1e9,x1=-1e9,y1=-1e9, us=[0,.25,.5,.75,1];
    us.forEach(function(u){ var J=joints(pose(D,u)); Object.keys(J).forEach(function(k){ var p=J[k]; if(Array.isArray(p)&&p.length===2&&typeof p[0]==='number'&&k!=='u'&&k!=='nf'){ x0=Math.min(x0,p[0]); x1=Math.max(x1,p[0]); y0=Math.min(y0,p[1]); y1=Math.max(y1,p[1]); } }); });
    (D.eq||[]).forEach(function(q){ if(q.x!=null&&q.k!=='pad'){ x0=Math.min(x0,q.x); x1=Math.max(x1,q.x+(q.w||0)); } if(q.y!=null){ y0=Math.min(y0,q.y); } if(q.top!=null) y0=Math.min(y0,q.top); if(q.x1!=null){ x0=Math.min(x0,q.x1,q.x2); x1=Math.max(x1,q.x1,q.x2); y0=Math.min(y0,q.y1,q.y2); } if(q.from){ x0=Math.min(x0,q.from[0]); x1=Math.max(x1,q.from[0]); y0=Math.min(y0,q.from[1]); } });
    y1=Math.max(y1,GY+4); y0-=14; x0-=16; x1+=16;
    var w=x1-x0, h=y1-y0+6, sz=Math.max(w,h*1.1), cx=(x0+x1)/2;
    D._box=f1(cx-sz/2)+' '+f1(y1+6-sz/1.1)+' '+f1(sz)+' '+f1(sz/1.1);
    return D._box;
  }
  function svg(name,u,opts){ var D=find(name); if(!D) return ''; opts=Object.assign({box:box(D)},opts||{}); return draw(D,u==null?1:u,opts); }

  /* ---------- moving pictures on screen ---------- */
  var live=[], raf=0, RM=false;
  try{ RM=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  function loop(ms){
    live=live.filter(function(x){ return x.el.isConnected; });
    live.forEach(function(x){ if(x.el.offsetParent===null) return; x.el.innerHTML=draw(x.D,phase(x.D,ms+x.off),x.o); });
    raf=live.length?requestAnimationFrame(loop):0;
  }
  function mount(el,name,o){
    var D=find(name); if(!el||!D) return false;
    o=o||{};
    live=live.filter(function(x){ return x.el!==el; });                /* a paused picture stops moving */
    if(RM||o.still){ o.box=o.box||box(D); el.innerHTML=draw(D,o.u==null?1:o.u,o); return true; }
    o.box=o.box||box(D);
    live.push({el:el,D:D,o:o,off:o.off||0}); el.innerHTML=draw(D,0,o);
    if(!raf) raf=requestAnimationFrame(loop);
    return true;
  }
  return {find:find,svg:svg,draw:draw,mount:mount,box:box,STR:STR,STRETCH_FOR:STRETCH_FOR,stretchesFor:stretchesFor,joints:joints,LIB:LIB,names:function(){ return Object.keys(LIB); },reduced:function(){ return RM; }};
})();

/* =====================================================================
   KovaExPage - what you see of the pictures (p32).

   - Every exercise in a workout, in your program and in "Add to today"
     gets a small picture next to its name; the one you are on moves.
   - The (i) or the picture opens the exercise page: the moving demo,
     the muscles it works on your own body figure (the slim one from
     Customize), how to do it and the mistakes, your history from what
     you logged (heaviest set, best estimated one-rep max, most reps,
     a chart), and the stretches for those muscles.
   - Workout's Training card gets Exercises (every exercise, by muscle,
     searchable) and Stretch (by body part, today's muscles first, with
     a guided timer that walks through each hold).
   Nothing is sample data: with no history it says so.
   ===================================================================== */
window.KovaExPage=(function(){
  'use strict';
  var D=window.KovaDemo; if(!D) return null;
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function K(){ return window.KSESS||null; }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }
  var NAME={quads:'Quads',hams:'Hamstrings',glutes:'Glutes',calves:'Calves',tibialis:'Shins',adductors:'Inner thighs',hipflex:'Hip flexors',chest:'Chest',
    lats:'Lats',traps:'Upper back',lowback:'Lower back',abs:'Abs',obliques:'Obliques',delts:'Shoulders',biceps:'Biceps',triceps:'Triceps',forearms:'Forearms',neck:'Neck'};
  var MAP={quads:['f-quad'],hams:['b-ham'],glutes:['b-glute'],calves:['b-calf'],tibialis:['f-shin'],adductors:['f-add'],hipflex:['f-pelvis'],chest:['f-pec'],
    lats:['b-lat'],traps:['b-trap','f-trap'],lowback:['b-erector'],abs:['f-abs'],obliques:['f-obl','f-serr'],delts:['f-delt','b-delt'],biceps:['f-bicep'],
    triceps:['b-tri'],forearms:['f-fore','b-fore'],neck:['f-trap']};
  var EQN={bb:'Barbell',db:'Dumbbells',bw:'Body weight',cable:'Cable',mach:'Machine'};
  var PATN={sq:'Squat',hg:'Hinge',vp:'Overhead press',hp:'Press',vpl:'Pull',hpl:'Row',iso:'Isolation',carry:'Carry',pw:'Power'};

  /* ---------- the muscles, on the body figure from Customize ---------- */
  function bodyMap(mus){
    var src=document.getElementById('bodySvg'); if(!src||!mus) return '';
    try{ if(window.KovaBodyShape&&KovaBodyShape.apply&&!src.hasAttribute('data-sex')) KovaBodyShape.apply(); }catch(e){}
    var c=src.cloneNode(true); c.removeAttribute('id'); c.setAttribute('class','kxp-body'); c.setAttribute('aria-hidden','true');
    var lvl={}; (mus.s||[]).forEach(function(m){ (MAP[m]||[]).forEach(function(p){ lvl[p]='s'; }); }); (mus.p||[]).forEach(function(m){ (MAP[m]||[]).forEach(function(p){ lvl[p]='p'; }); });
    c.querySelectorAll('[id]').forEach(function(el){
      var id=el.getAttribute('id'); el.removeAttribute('id'); el.removeAttribute('style');
      var base=id.replace(/-(l|r)\d?$/,'').replace(/\d$/,'');
      if(el.classList.contains('m')){ el.classList.remove('p','s','on','sel'); if(lvl[base]) el.classList.add(lvl[base]); }
    });
    c.querySelectorAll('text').forEach(function(t){ t.setAttribute('class','kxp-bt'); });
    return c.outerHTML;
  }
  function chips(mus){
    return '<div class="kxp-chips">'+(mus.p||[]).map(function(m){ return '<span class="p">'+esc(NAME[m]||m)+'</span>'; }).join('')
      +(mus.s||[]).map(function(m){ return '<span>'+esc(NAME[m]||m)+'</span>'; }).join('')+'</div>';
  }

  /* ---------- your history with this exercise ---------- */
  function history(name){
    var k=K(), H=k&&k.hist?(k.hist()[name]||[]):[];
    if(!H.length) return '<div class="kxp-none">No sets logged for this yet. Your heaviest set, your best estimated one-rep max, your most reps and a chart of your progress show here after your first session with it.</div>';
    var e1=function(w,r){ return k.e1rm?k.e1rm(w,r):w*(1+r/30); };
    var sets=[]; H.forEach(function(h){ (h.sets||[]).forEach(function(x){ sets.push({w:+x.w||0,r:+x.r||0,t:h.t}); }); });
    var bw=sets.every(function(x){ return !x.w; });
    var heavy=sets.reduce(function(a,b){ return b.w>a.w?b:a; },sets[0]);
    var reps=sets.reduce(function(a,b){ return b.r>a.r?b:a; },sets[0]);
    var vol=sets.reduce(function(a,b){ return b.w*b.r>a.w*a.r?b:a; },sets[0]);
    var pts=H.map(function(h){ var v=bw?(h.sets||[]).reduce(function(a,x){ return a+(+x.r||0); },0):Math.round(h.e1||(h.sets||[]).reduce(function(a,x){ return Math.max(a,e1(+x.w||0,+x.r||0)); },0)); return {t:h.t,v:v}; }).slice(-16);
    var best=pts.reduce(function(a,b){ return b.v>a.v?b:a; },pts[0]);
    function day(t){ return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
    var rec=bw?[['Most reps',reps.r,'reps',reps.t],['Best session',best.v,'total reps',best.t],['Sessions',H.length,'logged',H[H.length-1].t]]
      :[['Heaviest',heavy.w,'lb × '+heavy.r,heavy.t],['Best 1RM (est.)',best.v,'lb',best.t],['Most reps',reps.r,'at '+reps.w+' lb',reps.t],['Best set',vol.w*vol.r,'lb moved',vol.t]];
    var h='<div class="kxp-rec">'+rec.map(function(r){ return '<div><span class="k">'+r[0]+'</span><b>'+Number(r[1]).toLocaleString()+'</b><span class="u">'+esc(r[2])+'</span><span class="d">'+day(r[3])+'</span></div>'; }).join('')+'</div>';
    if(pts.length>1){
      var W=300,Hh=96,lo=Math.min.apply(null,pts.map(function(p){ return p.v; })),hi=Math.max.apply(null,pts.map(function(p){ return p.v; })); if(hi===lo){ hi+=1; lo-=1; }
      var xy=pts.map(function(p,i){ return [10+i*(W-20)/(pts.length-1),8+(1-(p.v-lo)/(hi-lo))*(Hh-24)]; });
      h+='<div class="kxp-chart"><div class="k">'+(bw?'Total reps per session':'Estimated one-rep max per session')+'</div><svg viewBox="0 0 '+W+' '+Hh+'" role="img" aria-label="'+(bw?'Total reps':'Estimated one-rep max')+' over your last '+pts.length+' sessions, from '+pts[0].v+' to '+pts[pts.length-1].v+', chart">'
        +'<path class="ln" d="M'+xy.map(function(p){ return p[0].toFixed(1)+','+p[1].toFixed(1); }).join('L')+'"/>'
        +xy.map(function(p,i){ return '<circle class="dt'+(pts[i]===best?' on':'')+'" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+(pts[i]===best?3.6:2.4)+'"/>'; }).join('')
        +'<text x="10" y="'+(Hh-2)+'">'+day(pts[0].t)+'</text><text x="'+(W-10)+'" y="'+(Hh-2)+'" text-anchor="end">'+day(pts[pts.length-1].t)+'</text>'
        +'<text x="'+(W-10)+'" y="10" text-anchor="end">'+hi+'</text></svg></div>';
    }
    h+='<div class="kxp-last">'+H.slice(-3).reverse().map(function(x){ return '<div><span>'+day(x.t)+'</span><b>'+(x.sets||[]).map(function(z){ return (z.w?z.w+' × ':'')+z.r; }).join(', ')+'</b></div>'; }).join('')+'</div>';
    return h;
  }

  /* ---------- the exercise page ---------- */
  function today(name){
    var k=K(), S=k&&k.state&&k.state(); if(!S||!S.ex) return null;
    var e=S.ex.filter(function(x){ return x.n===name; })[0]; return e&&e.tgt?e.tgt:null;
  }
  function stretchCards(list){
    return '<div class="kxp-sts">'+list.slice(0,4).map(function(d){ return '<button type="button" class="kxp-st" data-kxp="stretch" data-n="'+esc(d.n)+'"><span class="kxp-th" data-kxd-still="'+esc(d.n)+'"></span><span><b>'+esc(d.n)+'</b><small>'+esc(d.hold)+'</small></span></button>'; }).join('')+'</div>';
  }
  function html(name){
    var d=D.find(name), k=K(), x=k&&k.lib?k.lib(name):null, f=window.KovaFormCues&&KovaFormCues.find?KovaFormCues.find(name):null, tg=today(name);
    var mus=d&&d.mus||null;
    var sub=[x&&x.eq&&EQN[x.eq],x&&x.pat&&PATN[x.pat]].filter(Boolean).join(' · ');
    var h='<div class="kxp"><div class="kxp-h"><div><b>'+esc(name)+'</b><span>'+esc(sub||'How to do it')+'</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>';
    h+=d?'<div class="kxp-stage"><div class="kxp-fig" data-kxd="'+esc(name)+'" role="img" aria-label="'+esc(name)+', moving from the start to the finish of the lift"></div>'
        +(D.reduced()?'':'<button type="button" class="kxp-pp" data-kxp="pause" aria-label="Pause the picture" aria-pressed="false">❚❚</button>')
        +'<div class="kxp-sf"><span>Start</span><i></i><span>Finish</span></div></div>'
      :'<div class="kxp-none">Kova has no picture of this one yet. Form Check can look at a clip of you doing it.</div>';
    if(tg) h+='<div class="kxp-stats"><div><span>Today</span><b>'+tg.sets+'</b><i>sets</i></div><div><span>Reps</span><b>'+tg.lo+'–'+tg.hi+'</b><i>each</i></div><div><span>Effort</span><b>1–2</b><i>reps left</i></div></div>';
    if(mus) h+='<div class="kxp-l">Muscles worked</div><div class="kxp-mapw">'+bodyMap(mus)+'</div>'+chips(mus);
    if(f){
      h+='<div class="kxp-l">How to do it</div><ol class="kxp-cues">'+f[4].map(function(c){ return '<li>'+esc(c)+'</li>'; }).join('')+'</ol>'
        +'<div class="kxp-l">Common mistakes</div><ul class="kxp-mis">'+f[5].map(function(c){ return '<li>'+esc(c)+'</li>'; }).join('')+'</ul>';
    }
    h+='<div class="kxp-l">Your history</div>'+history(name);
    var sl=mus?D.stretchesFor((mus.p||[]).concat(mus.s||[])):[];
    if(sl.length) h+='<div class="kxp-l">Stretch after</div>'+stretchCards(sl);
    h+='<button type="button" class="btn ghost kxp-go" data-kfc="fc">Check my form on video</button></div>';
    return h;
  }
  function mountIn(root){
    (root||document).querySelectorAll('[data-kxd]').forEach(function(el){ if(!el.__kxd){ el.__kxd=1; D.mount(el,el.getAttribute('data-kxd')); } });
    (root||document).querySelectorAll('[data-kxd-still]').forEach(function(el){ if(!el.__kxd){ el.__kxd=1; D.mount(el,el.getAttribute('data-kxd-still'),{still:true,u:1}); } });
  }
  function sheet(h){ if(!window.openSheet) return false; openSheet(h); mountIn(document.getElementById('sheet')||document); return true; }
  var FROM=null;
  function back(){ return FROM?'<button type="button" class="kxp-back" data-kxp="back">‹ '+(FROM==='lib'?'All exercises':'All stretches')+'</button>':''; }
  function open(name){
    FROM=document.getElementById('kxpQ')?'lib':null;
    track('exercise_page',{has:!!D.find(name)});
    return sheet(html(name).replace('<div class="kxp">','<div class="kxp">'+back()));
  }

  /* ---------- a stretch, with a timer ---------- */
  function secs(hold){ var m=/(\d+)\s*s/.exec(hold||''); var n=m?+m[1]:30; return /each|side|leg|arm/.test(hold)?[n,n]:[n]; }
  function stretchHtml(d,step){
    return '<div class="kxp"><div class="kxp-h"><div><b>'+esc(d.n)+'</b><span>'+esc(d.hold)+(step?' · '+step:'')+'</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +'<div class="kxp-stage"><div class="kxp-fig" data-kxd="'+esc(d.n)+'" role="img" aria-label="'+esc(d.n)+'"></div></div>'
      +chips(d.mus)+'<ol class="kxp-cues">'+d.cues.map(function(c){ return '<li>'+esc(c)+'</li>'; }).join('')+'</ol>'
      +'<div class="kxp-timer" id="kxpTimer" aria-live="polite"></div>'
      +'<button type="button" class="btn kxp-go" data-kxp="hold" data-n="'+esc(d.n)+'">Start the timer</button></div>';
  }
  var T=null;
  function stopTimer(){ if(T){ clearInterval(T.iv); T=null; } }
  function startTimer(d,done){
    stopTimer(); var parts=secs(d.hold), i=0, left=parts[0];
    function paint(){ var el=document.getElementById('kxpTimer'); if(!el) return stopTimer(); el.innerHTML='<b>'+left+'</b><span>'+(parts.length>1?(i===0?'First side':'Second side'):'Hold')+'</span>'; }
    T={iv:setInterval(function(){ left--; if(left<=0){ i++; try{ if(navigator.vibrate) navigator.vibrate(120); }catch(e){} if(i>=parts.length){ stopTimer(); var el=document.getElementById('kxpTimer'); if(el) el.innerHTML='<span>Done</span>'; if(done) setTimeout(done,700); return; } left=parts[i]; } paint(); },1000)};
    paint();
  }

  /* ---------- Exercises and Stretch, from the Training card ---------- */
  var GROUPS=[['all','All'],['Quads','Legs'],['Glutes','Glutes'],['Hamstrings','Hamstrings'],['Chest','Chest'],['Back','Back'],['Shoulders','Shoulders'],['Arms','Arms'],['Core','Core'],['skill','Calisthenics']];
  var SKILLS=['Push up','Pike push-up','Handstand push-up','Dips','Pull up','Muscle-up','L-sit','Pistol squat','Front lever','Dead hang','Hanging leg raise'];
  var LS={g:'all',q:''};
  function allEx(){
    var k=K(), L=(k&&k.XL?k.XL:[]).map(function(x){ return {n:x.n,m:x.m}; });
    SKILLS.forEach(function(n){ if(!L.some(function(x){ return x.n===n; })) L.push({n:n,m:'skill'}); });
    return L.filter(function(x){ return D.find(x.n); });
  }
  function libHtml(){
    var L=allEx().filter(function(x){
      var g=LS.g, ok=g==='all'||x.m===g||(g==='Arms'&&/Biceps|Triceps|Forearms/.test(x.m))||(g==='Quads'&&/Quads|Calves/.test(x.m))||(g==='skill'&&(x.m==='skill'||SKILLS.indexOf(x.n)>=0));
      return ok&&(!LS.q||x.n.toLowerCase().indexOf(LS.q.toLowerCase())>=0);
    });
    return '<div class="kxp"><div class="kxp-h"><div><b>Exercises</b><span>'+allEx().length+' with a moving picture. Tap one to see how.</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +'<input class="kxp-q" id="kxpQ" type="search" placeholder="Search exercises" aria-label="Search exercises" value="'+esc(LS.q)+'">'
      +'<div class="kxp-gs" role="group" aria-label="Muscle">'+GROUPS.map(function(g){ return '<button type="button" class="chip'+(LS.g===g[0]?' on':'')+'" data-kxp="g" data-g="'+g[0]+'" aria-pressed="'+(LS.g===g[0])+'">'+g[1]+'</button>'; }).join('')+'</div>'
      +'<div class="kxp-grid">'+(L.length?L.map(function(x){ return '<button type="button" class="kxp-cell" data-exinfo="'+esc(x.n)+'"><span class="kxp-th" data-kxd-still="'+esc(x.n)+'"></span><b>'+esc(x.n)+'</b><small>'+esc(x.m==='skill'?'Calisthenics':x.m)+'</small></button>'; }).join('')
        :'<div class="kxp-none">Nothing by that name. Try a shorter word, like "press" or "curl".</div>')+'</div></div>';
  }
  var SG=[['legs','Legs and hips',['quad','ham','hipflex','glute','calf','shin','butterfly']],['back','Back',['child','knees','lat']],['upper','Chest and shoulders',['chest','delt','neck']],['arms','Arms',['tri','bicep','wrist']],['core','Core',['cobra','lat']]];
  function todays(){
    var k=K(), S=k&&k.state&&k.state(); if(!S||!S.ex||!S.ex.length) return [];
    var mus=[]; S.ex.forEach(function(e){ var d=D.find(e.n); if(d&&d.mus) (d.mus.p||[]).forEach(function(m){ if(mus.indexOf(m)<0) mus.push(m); }); });
    return D.stretchesFor(mus).slice(0,6);
  }
  function strHtml(){
    var td=todays(), by=function(id){ return D.STR.filter(function(d){ return d.id===id; })[0]; };
    var card=function(d){ return '<button type="button" class="kxp-cell" data-kxp="stretch" data-n="'+esc(d.n)+'"><span class="kxp-th" data-kxd-still="'+esc(d.n)+'"></span><b>'+esc(d.n)+'</b><small>'+esc(d.hold)+'</small></button>'; };
    return '<div class="kxp"><div class="kxp-h"><div><b>Stretch</b><span>Hold each one, breathe, ease a little deeper as it lets go.</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>'
      +(td.length?'<div class="kxp-l">For today’s workout</div><div class="kxp-grid">'+td.map(card).join('')+'</div><button type="button" class="btn kxp-go" data-kxp="routine">Stretch with me ('+td.length+' stretches)</button>'
        :'<div class="kxp-none">Start a workout and Kova picks the stretches for the muscles it trains.</div>')
      +SG.map(function(g){ return '<div class="kxp-l">'+g[1]+'</div><div class="kxp-grid">'+g[2].map(by).filter(Boolean).map(card).join('')+'</div>'; }).join('')+'</div>';
  }
  function routine(list,i){
    if(i>=list.length){ sheet('<div class="kxp"><div class="kxp-h"><div><b>All done</b><span>'+list.length+' stretches</span></div><button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div><div class="kxp-none">Nice work. Stretching after training, a few times a week, keeps the range you trained for.</div></div>'); track('stretch_routine',{n:list.length}); return; }
    sheet(stretchHtml(list[i],(i+1)+' of '+list.length));
    startTimer(list[i],function(){ routine(list,i+1); });
  }

  /* ---------- small pictures next to every exercise ---------- */
  function thumb(name,anim){ return '<button type="button" class="kxp-tb" data-exinfo="'+esc(name)+'" aria-label="See how to do '+esc(name)+'"><span class="kxp-th" '+(anim?'data-kxd':'data-kxd-still')+'="'+esc(name)+'"></span></button>'; }
  /* only what is on screen gets pictures (hidden screens stay light: the
     first load has an element budget); a screen change looks again */
  function shown(el){ var sc=el.closest('.screen'); return sc?sc.classList.contains('on'):!!el.closest('#sheet'); }
  function decorate(){
    document.querySelectorAll('.exhead .exinfo, .pgex .exinfo').forEach(function(b){
      if(!shown(b)) return;
      var name=b.getAttribute('data-exinfo'), row=b.closest('.exhead,.pgex'); if(!row||!D.find(name)) return;
      var act=!!b.closest('.exrow.act');
      var have=row.querySelector('.kxp-tb');
      if(have&&have.getAttribute('data-anim')===String(act)&&have.getAttribute('data-exinfo')===name) return;
      if(have) have.remove();
      var tmp=document.createElement('div'); tmp.innerHTML=thumb(name,act); var t=tmp.firstChild; t.setAttribute('data-anim',String(act));
      var num=row.querySelector('.exnum'); if(num&&num.nextSibling) row.insertBefore(t,num.nextSibling); else row.insertBefore(t,row.firstChild);
      mountIn(t.parentNode);
    });
    document.querySelectorAll('.exadd[data-n]').forEach(function(r){
      if(r.querySelector('.kxp-th')||!D.find(r.getAttribute('data-n'))||!shown(r)) return;
      var s=document.createElement('span'); s.className='kxp-th kxp-ta'; s.setAttribute('data-kxd-still',r.getAttribute('data-n')); r.insertBefore(s,r.firstChild); mountIn(r);
    });
    document.querySelectorAll('#s-move .kl-acts:not(.kz2-acts)').forEach(function(row){
      if(row.querySelector('.kxp-act')) return;
      row.insertAdjacentHTML('beforeend','<div class="chip kxp-act" data-kxp="lib" role="button" tabindex="0">Exercises</div><div class="chip kxp-act" data-kxp="str" role="button" tabindex="0">Stretch</div>');
    });
  }
  var pend=0;
  /* quietly: looking for rows must not wake every closed screen (KovaPark) */
  function soon(){ if(pend) return; pend=setTimeout(function(){ pend=0; if(window.KovaPark&&KovaPark.quiet) KovaPark.quiet(decorate); else decorate(); },60); }

  function onClick(ev){
    var b=ev.target.closest&&ev.target.closest('[data-kxp]'); if(!b) return;
    var a=b.getAttribute('data-kxp');
    if(a==='lib'){ LS={g:'all',q:''}; sheet(libHtml()); track('exercise_library',{}); return; }
    if(a==='str'){ sheet(strHtml()); track('stretch_open',{}); return; }
    if(a==='g'){ LS.g=b.getAttribute('data-g'); sheet(libHtml()); return; }
    if(a==='stretch'){ var d=D.find(b.getAttribute('data-n')); if(d){ FROM=b.closest('.kxp')&&/^Stretch$/.test((b.closest('.kxp').querySelector('.kxp-h b')||{}).textContent||'')?'str':null; stopTimer(); sheet(stretchHtml(d).replace('<div class="kxp">','<div class="kxp">'+back())); } return; }
    if(a==='back'){ stopTimer(); var f=FROM; FROM=null; sheet(f==='lib'?libHtml():strHtml()); return; }
    if(a==='hold'){ var d2=D.find(b.getAttribute('data-n')); if(d2){ b.textContent='Restart the timer'; startTimer(d2); } return; }
    if(a==='routine'){ var L=todays(); if(L.length) routine(L,0); return; }
    if(a==='pause'){ var on=b.getAttribute('aria-pressed')!=='true'; b.setAttribute('aria-pressed',String(on)); b.textContent=on?'▶':'❚❚'; b.setAttribute('aria-label',on?'Play the picture':'Pause the picture');
      var fig=b.parentNode.querySelector('[data-kxd]'); if(fig){ if(on){ D.mount(fig,fig.getAttribute('data-kxd'),{still:true,u:1}); } else D.mount(fig,fig.getAttribute('data-kxd')); } return; }
  }
  function onKey(ev){
    var b=ev.target.closest&&ev.target.closest('.kxp-act'); if(b&&(ev.key==='Enter'||ev.key===' ')){ ev.preventDefault(); b.click(); }
  }
  function onInput(ev){ if(ev.target&&ev.target.id==='kxpQ'){ LS.q=ev.target.value; var pos=ev.target.selectionStart; sheet(libHtml()); var q=document.getElementById('kxpQ'); if(q){ q.focus(); try{ q.setSelectionRange(pos,pos); }catch(e){} } } }
  document.addEventListener('click',onClick); document.addEventListener('keydown',onKey); document.addEventListener('input',onInput);
  /* the sheet closes: no timer left running */
  document.addEventListener('click',function(ev){ if(ev.target&&(ev.target.id==='sheet'||(ev.target.closest&&ev.target.closest('[data-kfc="x"]')))) stopTimer(); },true);
  /* the moving pictures redraw themselves; only other changes need a look */
  if(window.MutationObserver) new MutationObserver(function(ms){
    for(var i=0;i<ms.length;i++){ var t=ms[i].target; if(!(t.closest&&t.closest('[data-kxd],[data-kxd-still]'))){ soon(); return; } }
  }).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('kova:screen',soon); document.addEventListener('kova:screen',soon);
  soon();
  return {open:open,html:html,history:history,bodyMap:bodyMap,lib:libHtml,stretch:strHtml,stretchHtml:stretchHtml,todays:todays,decorate:decorate,startTimer:startTimer,stopTimer:stopTimer,secs:secs};
})();
