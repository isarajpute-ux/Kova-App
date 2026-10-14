/* KovaWearables (p28) - your own watch, ring or band on the Watch screen.

   The Watch screen drew one of a few rough shapes, and Garmin, Fitbit,
   Polar and COROS all got the same one. Now each common wearable has its
   own drawing (Apple Watch, Ultra, Pixel Watch, Galaxy Watch, Garmin,
   Fitbit, WHOOP, Oura, Ultrahuman, Galaxy Ring, Polar, COROS, Suunto,
   Amazfit, Withings), picked from the name of the app that sent the data.
   If nothing has synced yet, or the name says nothing, you choose yours:
   tap the picture. Each choice says, honestly, how that device's data
   reaches Kova (some do not share with Apple Health at all).
   Drawn in the stage's own style: graphite and glass, the accent for the
   face. The stage is dark in every look, so the drawings are too.      */
window.KovaWearables=(function(){
  'use strict';
  var KEY='kova.wear';
  var uid=0;

  /* ---------- the drawings (viewBox 0 0 120 144) ---------- */
  function defs(u){
    return '<defs>'
      +'<linearGradient id="kwc'+u+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(92,92,104,.95)"/><stop offset="1" stop-color="rgba(34,34,42,.95)"/></linearGradient>'
      +'<linearGradient id="kwt'+u+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(134,124,104,.95)"/><stop offset="1" stop-color="rgba(66,60,48,.95)"/></linearGradient>'
      +'<linearGradient id="kwm'+u+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgba(214,214,224,.95)"/><stop offset=".5" stop-color="rgba(96,96,108,.95)"/><stop offset="1" stop-color="rgba(178,178,190,.95)"/></linearGradient>'
      +'<linearGradient id="kwb'+u+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.13)"/><stop offset="1" stop-color="rgba(255,255,255,.06)"/></linearGradient>'
      +'<radialGradient id="kwg'+u+'" cx="50%" cy="32%" r="70%"><stop offset="0" stop-color="rgba(var(--acc-raw,232,96,122),.26)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>'
      +'</defs>';
  }
  var LN='rgba(255,255,255,.30)', DIM='rgba(255,255,255,.12)', ACC='var(--acc)';
  function strap(u,w,lines){
    var a=60-w/2, b=60+w/2, s='<path d="M'+a+' 44 Q'+(a-2)+' 12 '+(a+2)+' 2 L'+(b-2)+' 2 Q'+(b+2)+' 12 '+b+' 44Z" fill="url(#kwb'+u+')" stroke="'+LN+'" stroke-width=".9"/>'
      +'<path d="M'+a+' 100 Q'+(a-2)+' 132 '+(a+2)+' 142 L'+(b-2)+' 142 Q'+(b+2)+' 132 '+b+' 100Z" fill="url(#kwb'+u+')" stroke="'+LN+'" stroke-width=".9"/>';
    if(lines) for(var y=8;y<42;y+=5) s+='<path d="M'+(a+2)+' '+y+'H'+(b-2)+'M'+(a+2)+' '+(144-y)+'H'+(b-2)+'" stroke="'+DIM+'" stroke-width=".8"/>';
    return s;
  }
  function digital(cx,cy){
    return '<path d="M'+(cx-18)+' '+(cy)+' Q'+cx+' '+(cy-16)+' '+(cx+18)+' '+cy+'" stroke="'+ACC+'" stroke-width="1.6" fill="none" opacity=".85"/>'
      +'<rect x="'+(cx-15)+'" y="'+(cy-10)+'" width="30" height="5" rx="2.5" fill="rgba(255,255,255,.66)"/>'
      +'<rect x="'+(cx-9)+'" y="'+(cy+2)+'" width="18" height="3.5" rx="1.75" fill="rgba(255,255,255,.30)"/>'
      +'<circle cx="'+cx+'" cy="'+(cy+15)+'" r="2.3" fill="'+ACC+'" opacity=".9"/>';
  }
  function squareCase(u,rx,grad){
    return '<rect x="22" y="38" width="76" height="68" rx="'+(rx-2)+'" fill="rgba(0,0,0,.45)"/>'
      +'<rect x="20" y="36" width="80" height="72" rx="'+rx+'" fill="url(#'+grad+u+')" stroke="rgba(255,255,255,.32)" stroke-width="1.2"/>'
      +'<rect x="26" y="42" width="68" height="60" rx="'+(rx-4)+'" fill="rgba(0,0,0,.74)" stroke="rgba(255,255,255,.10)" stroke-width=".7"/>'
      +'<rect x="28" y="44" width="64" height="56" rx="'+(rx-6)+'" fill="url(#kwg'+u+')"/>';
  }
  function roundCase(u,r,grad){
    return '<circle cx="61" cy="74" r="'+r+'" fill="rgba(0,0,0,.45)"/>'
      +'<circle cx="60" cy="72" r="'+r+'" fill="url(#'+(grad||'kwc')+u+')" stroke="rgba(255,255,255,.32)" stroke-width="1.2"/>';
  }
  function roundScreen(u,r){
    return '<circle cx="60" cy="72" r="'+r+'" fill="rgba(0,0,0,.76)" stroke="rgba(255,255,255,.10)" stroke-width=".7"/>'
      +'<circle cx="60" cy="72" r="'+(r-2)+'" fill="url(#kwg'+u+')"/>';
  }
  function btn(x,y,h,col){ return '<rect x="'+x+'" y="'+y+'" width="5.5" height="'+(h||11)+'" rx="2.4" fill="'+(col||'rgba(255,255,255,.20)')+'" stroke="rgba(255,255,255,.28)" stroke-width=".7"/>'; }
  function ticks(r1,r2,n,every){
    var s='';
    for(var i=0;i<n;i++){ var a=i/n*Math.PI*2, big=every&&i%every===0, rr=big?r1-2:r1;
      s+='<line x1="'+(60+Math.sin(a)*rr).toFixed(1)+'" y1="'+(72-Math.cos(a)*rr).toFixed(1)+'" x2="'+(60+Math.sin(a)*r2).toFixed(1)+'" y2="'+(72-Math.cos(a)*r2).toFixed(1)+'" stroke="rgba(255,255,255,'+(big?.55:.25)+')" stroke-width="'+(big?1.4:.8)+'"/>'; }
    return s;
  }
  /* round sport watch: buttons on the left and right, a bezel, data fields */
  function sport(u,left,right,crown,bezelTicks){
    var s=strap(u,36)+'<path d="M38 40 L46 34 M82 40 L74 34 M38 104 L46 110 M82 104 L74 110" stroke="'+LN+'" stroke-width="5" stroke-linecap="round"/>';
    left.forEach(function(y){ s+=btn(14.5,y,10); });
    right.forEach(function(y){ s+=btn(100,y,10); });
    if(crown) s+='<rect x="99" y="64" width="8" height="16" rx="3.5" fill="rgba(255,255,255,.24)" stroke="rgba(255,255,255,.34)" stroke-width=".8"/>';
    s+=roundCase(u,40)+'<circle cx="60" cy="72" r="34" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="5"/>';
    if(bezelTicks) s+=ticks(39,35,bezelTicks,5);
    s+=roundScreen(u,31)
      +'<path d="M36 72 A24 24 0 0 1 84 72" stroke="'+ACC+'" stroke-width="2" fill="none" opacity=".8"/>'
      +'<rect x="46" y="60" width="28" height="7" rx="3" fill="rgba(255,255,255,.66)"/>'
      +'<rect x="40" y="74" width="16" height="4" rx="2" fill="rgba(255,255,255,.32)"/><rect x="64" y="74" width="16" height="4" rx="2" fill="rgba(255,255,255,.32)"/>'
      +'<rect x="50" y="84" width="20" height="4" rx="2" fill="rgba(255,255,255,.24)"/>';
    return s;
  }
  function ring(u,grad,flatTop){
    var s='<ellipse cx="62" cy="76" rx="40" ry="46" fill="rgba(0,0,0,.4)"/>'
      +'<path fill-rule="evenodd" d="M60 26 a40 46 0 1 0 0.01 0Z M60 40 a28 33 0 1 0 0.01 0Z" fill="url(#'+grad+u+')" stroke="rgba(255,255,255,.34)" stroke-width="1"/>'
      +'<ellipse cx="60" cy="73" rx="28" ry="33" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="3"/>'
      +'<path d="M36 82 Q60 108 84 82" stroke="rgba(255,255,255,.12)" stroke-width="5" fill="none"/>'
      +'<circle cx="52" cy="100" r="1.8" fill="'+ACC+'" opacity=".9"/><circle cx="60" cy="102" r="1.8" fill="'+ACC+'" opacity=".9"/><circle cx="68" cy="100" r="1.8" fill="'+ACC+'" opacity=".9"/>'
      +'<path d="M38 48 Q46 34 60 31" stroke="rgba(255,255,255,.55)" stroke-width="2" fill="none" stroke-linecap="round"/>';
    if(flatTop) s+='<path d="M48 27.5 H72" stroke="rgba(255,255,255,.6)" stroke-width="2.2" stroke-linecap="round"/>';
    return s;
  }
  var DRAW={
    apple:function(u){ return strap(u,36)+squareCase(u,26,'kwc')+btn(99,54,16)+btn(99.5,78,9)+digital(60,72); },
    ultra:function(u){ return strap(u,38)+'<path d="M97 52 h6 v22 h-6" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.2"/>'+squareCase(u,18,'kwt')+btn(99,56,16)
      +'<rect x="14.5" y="56" width="6" height="16" rx="2.4" fill="rgba(240,140,60,.9)" stroke="rgba(255,255,255,.25)" stroke-width=".7"/>'+digital(60,72); },
    pixel:function(u){ return strap(u,30)+'<rect x="96" y="65" width="7" height="14" rx="3.5" fill="rgba(255,255,255,.24)" stroke="rgba(255,255,255,.34)" stroke-width=".8"/>'+roundCase(u,37)+roundScreen(u,34)
      +'<circle cx="60" cy="72" r="28" fill="none" stroke="'+ACC+'" stroke-width="2.2" stroke-dasharray="120 200" stroke-linecap="round" transform="rotate(-90 60 72)" opacity=".85"/>'
      +'<rect x="46" y="62" width="28" height="7" rx="3" fill="rgba(255,255,255,.7)"/><rect x="51" y="74" width="18" height="4" rx="2" fill="rgba(255,255,255,.32)"/>'; },
    galaxy:function(u){ return strap(u,34)+btn(99,56,10)+btn(99,80,10)+roundCase(u,40)+'<circle cx="60" cy="72" r="36" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="6"/>'+ticks(39,34,24,6)+roundScreen(u,30)+digital(60,74); },
    garmin:function(u){ return sport(u,[50,70,90],[56,86],false,60); },
    polar:function(u){ return sport(u,[56,86],[56,86],false,0); },
    coros:function(u){ return sport(u,[],[86],true,0); },
    suunto:function(u){ return sport(u,[],[50,70,90],false,60); },
    amazfit:function(u){ return sport(u,[],[56,86],false,0); },
    withings:function(u){ return strap(u,30)+'<rect x="97" y="66" width="7" height="12" rx="3" fill="rgba(255,255,255,.26)" stroke="rgba(255,255,255,.34)" stroke-width=".8"/>'
      +roundCase(u,38,'kwm')+'<circle cx="60" cy="72" r="33" fill="rgba(18,18,22,.95)" stroke="rgba(255,255,255,.14)"/>'+ticks(31,28,12,3)
      +'<rect x="51" y="50" width="18" height="7" rx="3.5" fill="rgba(0,0,0,.9)" stroke="rgba(255,255,255,.18)" stroke-width=".6"/><rect x="54" y="52.5" width="12" height="2" rx="1" fill="'+ACC+'"/>'
      +'<circle cx="60" cy="88" r="7" fill="none" stroke="rgba(255,255,255,.2)"/><path d="M60 88 L64 84" stroke="'+ACC+'" stroke-width="1.4" stroke-linecap="round"/>'
      +'<path d="M60 72 L60 52 M60 72 L74 78" stroke="rgba(255,255,255,.85)" stroke-width="2" stroke-linecap="round"/><circle cx="60" cy="72" r="2.4" fill="rgba(255,255,255,.9)"/>'; },
    fitband:function(u){ return '<rect x="42" y="2" width="36" height="140" rx="16" fill="url(#kwb'+u+')" stroke="'+LN+'" stroke-width=".9"/>'
      +'<rect x="40" y="36" width="40" height="72" rx="15" fill="url(#kwc'+u+')" stroke="rgba(255,255,255,.32)" stroke-width="1.2"/>'
      +'<rect x="45" y="43" width="30" height="58" rx="10" fill="rgba(0,0,0,.76)"/><rect x="46" y="44" width="28" height="56" rx="9" fill="url(#kwg'+u+')"/>'
      +'<rect x="51" y="56" width="18" height="6" rx="3" fill="rgba(255,255,255,.66)"/><rect x="53" y="67" width="14" height="3.5" rx="1.75" fill="rgba(255,255,255,.3)"/>'
      +'<path d="M50 84 h4 l3 -6 l4 10 l3 -4 h6" stroke="'+ACC+'" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'; },
    fitsq:function(u){ return strap(u,34)+btn(14.5,64,14)+squareCase(u,22,'kwc')+digital(60,72); },
    whoop:function(u){ return strap(u,46,true)
      +'<rect x="30" y="44" width="60" height="56" rx="15" fill="rgba(0,0,0,.45)" transform="translate(2 2)"/>'
      +'<rect x="30" y="44" width="60" height="56" rx="15" fill="url(#kwc'+u+')" stroke="rgba(255,255,255,.30)" stroke-width="1.1"/>'
      +'<rect x="36" y="50" width="48" height="44" rx="11" fill="rgba(0,0,0,.25)" stroke="rgba(255,255,255,.08)" stroke-width=".7"/>'
      +'<path d="M46 72 H74" stroke="rgba(255,255,255,.18)" stroke-width="1.4" stroke-linecap="round"/><circle cx="60" cy="72" r="2.4" fill="'+ACC+'" opacity=".9"/>'; },
    oura:function(u){ return ring(u,'kwm',false); },
    uhring:function(u){ return ring(u,'kwc',false); },
    gring:function(u){ return ring(u,'kwt',false); },
    phone:function(u){ return '<rect x="34" y="18" width="52" height="108" rx="12" fill="url(#kwc'+u+')" stroke="rgba(255,255,255,.30)" stroke-width="1.2"/>'
      +'<rect x="38" y="24" width="44" height="96" rx="9" fill="rgba(0,0,0,.74)"/><rect x="38" y="24" width="44" height="96" rx="9" fill="url(#kwg'+u+')"/>'
      +'<rect x="52" y="27" width="16" height="3" rx="1.5" fill="rgba(255,255,255,.25)"/>'+digital(60,70); },
    unknown:function(u){ return '<g opacity=".55">'+strap(u,36)+squareCase(u,26,'kwc')+'</g><path d="M54 66 a6 6 0 1 1 8 5.6 c-1.6 .7 -2 1.6 -2 3.4" stroke="rgba(255,255,255,.6)" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="60" cy="82" r="1.6" fill="rgba(255,255,255,.6)"/>'; }
  };
  function svg(id){ var u='k'+(++uid); return defs(u)+(DRAW[id]||DRAW.unknown)(u); }

  /* ---------- which device, and how its data reaches Kova ---------- */
  var HEALTH='On iPhone, Kova reads Apple Health.';
  var ANDROID='It works with Android phones, where the Kova app reads Health Connect.';
  var LIST=[
    {id:'apple',   n:'Apple Watch',        how:'Writes straight into Apple Health on your iPhone.'},
    {id:'ultra',   n:'Apple Watch Ultra',  how:'Writes straight into Apple Health on your iPhone.'},
    {id:'oura',    n:'Oura Ring',          how:'Turn on Apple Health in the Oura app’s settings.'},
    {id:'whoop',   n:'WHOOP',              how:'Turn on Apple Health in the WHOOP app. WHOOP does not share HRV there.'},
    {id:'garmin',  n:'Garmin',             how:'In Garmin Connect, turn on Apple Health under connected apps.'},
    {id:'fitband', n:'Fitbit',             how:'Fitbit does not share with Apple Health. On Android, the Fitbit app shares through Health Connect.'},
    {id:'pixel',   n:'Pixel Watch',        how:'Pixel Watch needs an Android phone. '+ANDROID},
    {id:'galaxy',  n:'Galaxy Watch',       how:'Galaxy Watch needs an Android phone. '+ANDROID},
    {id:'gring',   n:'Galaxy Ring',        how:'Galaxy Ring needs an Android phone. '+ANDROID},
    {id:'uhring',  n:'Ultrahuman Ring',    how:'Turn on Apple Health in the Ultrahuman app.'},
    {id:'polar',   n:'Polar',              how:'Turn on Apple Health in the Polar Flow app.'},
    {id:'coros',   n:'COROS',              how:'Turn on Apple Health in the COROS app.'},
    {id:'suunto',  n:'Suunto',             how:'Turn on Apple Health in the Suunto app.'},
    {id:'amazfit', n:'Amazfit',            how:'Turn on Apple Health in the Zepp app.'},
    {id:'withings',n:'Withings',           how:'Turn on Apple Health in the Withings app.'},
    {id:'phone',   n:'Just my iPhone',     how:'Your iPhone counts steps and walking on its own. Sleep and heart readings need a watch, ring or band.'}
  ];
  function byId(id){ for(var i=0;i<LIST.length;i++) if(LIST[i].id===id) return LIST[i]; return null; }
  /* from the name of the app that wrote the data ("Isa's Apple Watch", "WHOOP", Garmin's "Connect") */
  function detect(raw){
    var t=String(raw||'').toLowerCase().trim();
    if(!t) return null;
    if(/watch ultra|\bultra\b.*watch/.test(t)) return 'ultra';
    if(/ultrahuman/.test(t)) return 'uhring';
    if(/galaxy ring/.test(t)) return 'gring';
    if(/oura/.test(t)) return 'oura';
    if(/whoop/.test(t)) return 'whoop';
    if(/pixel/.test(t)) return 'pixel';
    if(/galaxy|samsung/.test(t)) return 'galaxy';
    if(/versa|sense/.test(t)) return 'fitsq';
    if(/fitbit|charge|inspire|luxe/.test(t)) return 'fitband';
    if(/garmin|fenix|fēnix|forerunner|venu|epix|instinct|vivoactive|^connect$/.test(t)) return 'garmin';
    if(/polar/.test(t)) return 'polar';
    if(/coros/.test(t)) return 'coros';
    if(/suunto/.test(t)) return 'suunto';
    if(/amazfit|zepp/.test(t)) return 'amazfit';
    if(/withings|health mate|scanwatch/.test(t)) return 'withings';
    if(/watch/.test(t)) return 'apple';
    if(/iphone/.test(t)) return 'phone';
    return null;
  }
  function picked(){
    var v=null;
    try{ v=window.KP&&KP.get('wearable'); }catch(e){}
    if(!v) try{ v=localStorage.getItem(KEY); }catch(e){}
    return byId(v)?v:null;
  }
  function pick(id){
    if(!byId(id)) return;
    try{ localStorage.setItem(KEY,id); }catch(e){}
    try{ if(window.KP) KP.set('wearable',id); }catch(e){}
    paint();
  }
  /* what to show: the synced source when it names a device, else your choice */
  function current(){
    var raw=''; try{ raw=window.KovaHealth?String(KovaHealth.device().raw||''):''; }catch(e){}
    var d=detect(raw);
    if(d) return {id:d, label:raw||byId(d).n, from:'sync'};
    var p=picked();
    if(p) return {id:p, label:byId(p).n, from:'pick'};
    return {id:'unknown', label:'', from:''};
  }

  function paint(){
    var s=document.getElementById('wchDev'); if(!s) return;
    var c=current();
    s.innerHTML=svg(c.id);
    s.setAttribute('data-family',c.id);
    s.setAttribute('role','button'); s.setAttribute('tabindex','0');
    s.setAttribute('aria-label',(c.label?c.label+'. ':'')+'Choose your watch, ring or band');
    var cap=document.getElementById('wchDevName');
    if(cap){
      cap.innerHTML=c.label?esc(c.label)+' <span class="kw-chg">· Change</span>':'Tap to choose your watch, ring or band';
      cap.style.opacity=c.label?'.8':'.6';
      cap.classList.add('kw-cap');
    }
  }
  function esc(x){ return String(x==null?'':x).replace(/[&<>"]/g,function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]; }); }

  function sheet(){
    if(!window.openSheet) return;
    var c=current();
    openSheet('<div class="grab"></div><div class="kw-sheet"><div class="title-s" style="font-size:19px;margin-bottom:3px">What do you wear?</div>'
      +'<div class="sub" style="line-height:1.5;margin-bottom:12px">'+HEALTH+' '+(c.from==='sync'?'Kova saw <b>'+esc(c.label)+'</b> in your synced data, so that one shows; your choice is used when the data does not say.':'Pick yours and the Watch screen shows it.')+'</div>'
      +'<div class="kw-grid">'+LIST.map(function(x){
        return '<button type="button" class="kw-opt'+(x.id===c.id?' on':'')+'" data-kw="'+x.id+'" aria-pressed="'+(x.id===c.id)+'">'
          +'<svg viewBox="0 0 120 144" aria-hidden="true">'+svg(x.id)+'</svg><span>'+esc(x.n)+'</span></button>';
      }).join('')+'</div>'
      +'<div class="kw-how" id="kwHow">'+howHtml(c.id)+'</div></div>');
    setTimeout(function(){
      var g=document.querySelector('.sheet .kw-grid'); if(!g) return;
      g.onclick=function(e){
        var b=e.target.closest('[data-kw]'); if(!b) return;
        pick(b.getAttribute('data-kw'));
        g.querySelectorAll('.kw-opt').forEach(function(o){ var on=o===b; o.classList.toggle('on',on); o.setAttribute('aria-pressed',on); });
        var h=document.getElementById('kwHow'); if(h) h.innerHTML=howHtml(b.getAttribute('data-kw'));
      };
    },30);
  }
  function howHtml(id){
    var x=byId(id); if(!x) return '<div class="sub">Tap the one you wear to see how its readings reach Kova.</div>';
    return '<div class="kw-hn">'+esc(x.n)+'</div><div class="sub" style="line-height:1.5">'+esc(x.how)+'</div>';
  }

  function wire(){
    var s=document.getElementById('wchDev'), cap=document.getElementById('wchDevName');
    [s,cap].forEach(function(el){
      if(!el||el.__kw) return; el.__kw=1;
      el.addEventListener('click',sheet);
      el.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); sheet(); } });
    });
    if(cap){ cap.style.pointerEvents='auto'; cap.style.cursor='pointer'; }
  }
  function start(){
    /* the inline painter still answers first; this one draws over it */
    if(window.KovaDevice) KovaDevice.paint=paint;
    window.addEventListener('kova:health',function(){ setTimeout(paint,0); });
    wire(); paint();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
  return {detect:detect,current:current,pick:pick,picked:picked,paint:paint,sheet:sheet,list:LIST,draw:svg,ids:Object.keys(DRAW)};
})();
