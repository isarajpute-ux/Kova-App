/* =====================================================================
   KovaCam - Kova's camera (p15), one viewfinder for every scan: meals,
   barcodes, ingredient lists, equipment, profile photos, Snap solve.
   KovaCam.open({title, hint, onShot(dataUrl), aspect:'1:1'|'4:5'|'3:4'|'3:2'})

   Laid out like the reference (image 1), in white and black glow:
     top        a back pill, "Camera", and a ••• pill (torch, grid, flip)
     heading    what you are scanning, big, with the picture quality and
                the hint under it
     frame      thin glowing corner brackets: drag a corner, or the size
                ruler, to make it bigger or smaller
     aim        the glowing + pill; tap anywhere to focus there
     zoom       0.5x / 1x / 2x / 4x in a glass capsule (the lens's own zoom
                where the phone has it, otherwise a digital crop); pinch
                works too
     strip      this visit's shots; tap one to use it again
     ruler      the frame's shape (1:1, 4:5, 3:4, 3:2) and its size
     shutter    gallery, shutter, switch camera
   The photo is exactly what is inside the brackets: the frame is mapped
   back onto the camera's own pixels (up to 2048 px), using the phone's
   full-resolution still where the browser has one (ImageCapture).
   ===================================================================== */
window.KovaCam=(function(){
  'use strict';
  var MAX=2048, Q=.92, KEY='kova.cam';
  var ASPECTS=[['1:1',1],['4:5',.8],['3:4',.75],['3:2',1.5]];
  var ZOOMS=[.5,1,2,4];
  var SHOTS=[];                                     // this visit only, never stored
  var S=null;                                       // the open camera
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  var PREF=lsJ(KEY,{size:.78,aspect:'1:1',grid:false});
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(PREF)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function $(id){ return document.getElementById(id); }
  var IC={
    back:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
    dots:'<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    roll:'<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="9" cy="9" r="1.7"/><path d="M20.5 15l-4.6-4.6L6.5 19.8"/>',
    flip:'<path d="M4 9a8 8 0 0 1 14.3-3.7L20 7M20 3v4h-4"/><path d="M20 15a8 8 0 0 1-14.3 3.7L4 17M4 21v-4h4"/>',
    bolt:'<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
    grid:'<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>'
  };
  function ic(k){ return '<svg class="kvc-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[k]+'</svg>'; }
  function aspectOf(k){ for(var i=0;i<ASPECTS.length;i++) if(ASPECTS[i][0]===k) return ASPECTS[i][1]; return 1; }

  /* ---------------- the page ---------------- */
  function shell(o){
    var d=document.createElement('div');
    d.className='kvc'; d.setAttribute('role','dialog'); d.setAttribute('aria-modal','true'); d.setAttribute('aria-label',o.title);
    d.innerHTML='<div class="kvc-stage" id="kvcStage"><video id="kvcV" playsinline muted autoplay></video>'
        +'<div class="kvc-shade"></div><div class="kvc-grid'+(PREF.grid?' on':'')+'" id="kvcGrid"></div>'
        +'<div class="kvc-frame" id="kvcFrame"><i class="c tl" data-c="tl"></i><i class="c tr" data-c="tr"></i><i class="c bl" data-c="bl"></i><i class="c br" data-c="br"></i></div>'
        +'<div class="kvc-aim" id="kvcAim" aria-hidden="true"><span></span></div></div>'
      +'<div class="kvc-top"><button type="button" class="kvc-pill" data-k="close" aria-label="Close the camera">'+ic('back')+'</button>'
        +'<div class="kvc-area">Camera</div>'
        +'<button type="button" class="kvc-pill" data-k="menu" aria-label="Camera options" aria-expanded="false" aria-controls="kvcMenu">'+ic('dots')+'</button></div>'
      +'<div class="kvc-menu" id="kvcMenu" hidden>'
        +'<button type="button" data-k="torch" id="kvcTorch" aria-pressed="false">'+ic('bolt')+'<span>Torch</span></button>'
        +'<button type="button" data-k="grid" aria-pressed="'+!!PREF.grid+'">'+ic('grid')+'<span>Grid lines</span></button>'
        +'<button type="button" data-k="flip">'+ic('flip')+'<span>Switch camera</span></button></div>'
      +'<div class="kvc-head"><h2>'+esc(o.title)+'</h2><p><b id="kvcRes"></b>'+esc(o.hint)+'</p></div>'
      +'<div class="kvc-zoom" id="kvcZoom" role="radiogroup" aria-label="Zoom">'+ZOOMS.map(function(z){
          return '<button type="button" role="radio" data-z="'+z+'" aria-checked="'+(z===1)+'" class="'+(z===1?'on':'')+'">'+z+'x</button>'; }).join('')+'</div>'
      +'<div class="kvc-low" id="kvcLow">'
        +'<div class="kvc-strip" id="kvcStrip" aria-label="Recent shots"></div>'
        +'<div class="kvc-ruler"><button type="button" class="kvc-asp" data-k="aspect" aria-label="Frame shape">'+esc(PREF.aspect)+'</button>'
          +'<div class="kvc-size" id="kvcSize" role="slider" tabindex="0" aria-label="Frame size" aria-valuemin="40" aria-valuemax="95">'
            +'<b id="kvcSizeV"></b><div class="t"></div><i class="mk" id="kvcMk"></i></div></div>'
        +'<div class="kvc-foot"><label class="kvc-round" aria-label="Choose a photo"><input type="file" accept="image/*" id="kvcFile">'+ic('roll')+'</label>'
          +'<button type="button" class="kvc-shot" id="kvcShot" aria-label="Take the photo"><span></span></button>'
          +'<button type="button" class="kvc-round" data-k="flip" aria-label="Switch camera">'+ic('flip')+'</button></div></div>';
    document.body.appendChild(d);
    return d;
  }

  /* ---------------- the frame ---------------- */
  function region(){
    var st=$('kvcStage'), hd=S.el.querySelector('.kvc-head'), lo=$('kvcLow');
    var r=st.getBoundingClientRect(), top=hd.getBoundingClientRect().bottom-r.top+10, bot=lo.getBoundingClientRect().top-r.top-10;
    return {w:r.width,h:r.height,top:top,bot:Math.max(top+120,bot)};
  }
  function place(){
    if(!S) return;
    /* the frame keeps clear of the zoom capsule on the right */
    var g=region(), a=aspectOf(PREF.aspect), zr=$('kvcZoom').getBoundingClientRect(), st=$('kvcStage').getBoundingClientRect();
    var right=Math.min(g.w-16,zr.left-st.left-12), left=Math.max(16,g.w-right), availW=right-left, availH=g.bot-g.top;
    if(availW<g.w*.62){ left=20; availW=right-left; }
    var w=Math.min(availW,availH*a), h=w/a; w*=PREF.size; h*=PREF.size;
    var cx=left+availW/2, cy=g.top+availH/2;
    S.frame={x:cx-w/2,y:cy-h/2,w:w,h:h};
    var f=$('kvcFrame'); f.style.left=S.frame.x+'px'; f.style.top=S.frame.y+'px'; f.style.width=w+'px'; f.style.height=h+'px';
    var gr=$('kvcGrid'); gr.style.left=f.style.left; gr.style.top=f.style.top; gr.style.width=f.style.width; gr.style.height=f.style.height;
    if(!S.aimMoved){ var am=$('kvcAim'); am.style.left=cx+'px'; am.style.top=cy+'px'; }
    var v=Math.round(PREF.size*100), sz=$('kvcSize');
    $('kvcSizeV').textContent='Frame '+v+'%'; sz.setAttribute('aria-valuenow',v); sz.setAttribute('aria-valuetext',v+' percent');
    $('kvcMk').style.left=((PREF.size-.4)/.55*100)+'%';
    S.el.querySelector('.kvc-asp').textContent=PREF.aspect;
  }
  function setSize(v){ PREF.size=Math.max(.4,Math.min(.95,Math.round(v*100)/100)); save(); place(); }

  /* ---------------- zoom ---------------- */
  function zoomCaps(){ var c={}; try{ c=S.track&&S.track.getCapabilities?S.track.getCapabilities():{}; }catch(e){} return c.zoom||null; }
  function setZoom(z,quiet){
    if(!S) return;
    var zc=zoomCaps();
    if(z<1&&!(zc&&zc.min<=z)) return;
    S.zoom=z; S.digital=1;
    if(zc&&z>=zc.min&&z<=zc.max){ S.track.applyConstraints({advanced:[{zoom:z}]}).catch(function(){}); }
    else{ if(zc&&zc.max>1) S.track.applyConstraints({advanced:[{zoom:zc.max}]}).catch(function(){}); S.digital=zc&&zc.max>1?z/zc.max:z; }
    $('kvcV').style.transform=(S.facing==='user'?'scaleX(-1) ':'')+'scale('+Math.max(1,S.digital)+')';
    var near=ZOOMS.reduce(function(a,b){ return Math.abs(b-z)<Math.abs(a-z)?b:a; });
    Array.prototype.forEach.call(S.el.querySelectorAll('[data-z]'),function(b){ var bz=+b.getAttribute('data-z'), on=bz===near;
      b.classList.toggle('on',on); b.setAttribute('aria-checked',String(on)); b.textContent=(on&&!quiet?Math.round(z*10)/10:bz)+'x'; });
  }
  function zoomButtons(){
    var zc=zoomCaps();
    Array.prototype.forEach.call(S.el.querySelectorAll('[data-z]'),function(b){
      var z=+b.getAttribute('data-z'), ok=z>=1||(zc&&zc.min<=z);
      b.disabled=!ok; b.title=ok?'':'This camera has no wide lens here';
    });
  }

  /* ---------------- the stream ---------------- */
  function stop(){ if(S&&S.stream){ S.stream.getTracks().forEach(function(t){ t.stop(); }); S.stream=null; S.track=null; S.cap=null; } }
  function start(){
    var video=$('kvcV');
    if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)){ degrade('The live camera needs the app or a hosted page. Use the shutter for the phone camera, or the gallery.'); return; }
    var want={facingMode:{ideal:S.facing},width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:30}};
    navigator.mediaDevices.getUserMedia({video:want,audio:false})
      .catch(function(){ return navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:S.facing}},audio:false}); })
      .then(function(st){
        if(!S){ st.getTracks().forEach(function(t){ t.stop(); }); return; }
        S.stream=st; video.srcObject=st; S.track=st.getVideoTracks()[0]||null;
        try{ S.cap=window.ImageCapture&&S.track?new ImageCapture(S.track):null; }catch(e){ S.cap=null; }
        tune(); zoomButtons(); setZoom(1,true);
      })
      .catch(function(){ degrade('Camera blocked. Allow the camera for Kova, or use the gallery.'); });
  }
  function tune(){
    var c={}; try{ c=S.track&&S.track.getCapabilities?S.track.getCapabilities():{}; }catch(e){}
    var adv={};
    if((c.focusMode||[]).indexOf('continuous')>=0) adv.focusMode='continuous';
    if((c.exposureMode||[]).indexOf('continuous')>=0) adv.exposureMode='continuous';
    if((c.whiteBalanceMode||[]).indexOf('continuous')>=0) adv.whiteBalanceMode='continuous';
    if(Object.keys(adv).length) S.track.applyConstraints({advanced:[adv]}).catch(function(){});
    S.caps=c; S.adv=adv;
    var t=$('kvcTorch'); if(t){ t.disabled=!c.torch; t.title=c.torch?'':'This camera has no torch'; }
    var s=S.track.getSettings?S.track.getSettings():{}, L=Math.max(s.width||0,s.height||0);
    $('kvcRes').textContent=L?(L>=3000?'4K':(L>=1900?'HD':Math.min(s.width,s.height)+'p'))+(S.cap?' photo':'')+' · ':'';
  }
  function degrade(why){
    var st=$('kvcStage'); if(!st||st.querySelector('.kvc-none')) return;
    var n=document.createElement('div'); n.className='kvc-none'; n.textContent=why; st.appendChild(n);
    S.noLive=true;
  }

  /* ---------------- taking the photo ---------------- */
  /* the frame, in the camera's own pixels (object-fit: cover, plus any
     digital zoom around the middle) */
  function cropOf(vw,vh){
    var st=$('kvcStage').getBoundingClientRect(), d=Math.max(1,S.digital||1);
    var s=Math.max(st.width/vw,st.height/vh)*d, dw=vw*s, dh=vh*s, ox=(st.width-dw)/2, oy=(st.height-dh)/2, f=S.frame;
    var x=(f.x-ox)/s, y=(f.y-oy)/s, w=f.w/s, h=f.h/s;
    if(S.facing==='user') x=vw-x-w;
    x=Math.max(0,x); y=Math.max(0,y); w=Math.min(vw-x,w); h=Math.min(vh-y,h);
    return {x:x,y:y,w:w,h:h};
  }
  function draw(src,c){
    var k=Math.min(1,MAX/Math.max(c.w,c.h)), cv=document.createElement('canvas');
    cv.width=Math.max(1,Math.round(c.w*k)); cv.height=Math.max(1,Math.round(c.h*k));
    var x=cv.getContext('2d'); x.imageSmoothingEnabled=true; if('imageSmoothingQuality' in x) x.imageSmoothingQuality='high';
    x.drawImage(src,c.x,c.y,c.w,c.h,0,0,cv.width,cv.height);
    return cv.toDataURL('image/jpeg',Q);
  }
  function grab(){
    var v=$('kvcV'); if(!v||!v.videoWidth) return null;
    return draw(v,cropOf(v.videoWidth,v.videoHeight));
  }
  function still(){
    var v=$('kvcV');
    if(S.cap&&S.cap.takePhoto&&v&&v.videoWidth&&window.createImageBitmap&&(S.digital||1)<=1){
      return S.cap.takePhoto().then(createImageBitmap).then(function(bmp){
        var same=Math.abs(bmp.width/bmp.height-v.videoWidth/v.videoHeight)<.02;
        var url=null;
        if(same){ var k=bmp.width/v.videoWidth, c=cropOf(v.videoWidth,v.videoHeight); url=draw(bmp,{x:c.x*k,y:c.y*k,w:c.w*k,h:c.h*k}); }
        try{ bmp.close(); }catch(e){}
        return url||grab();
      }).catch(function(){ return grab(); });
    }
    return Promise.resolve(grab());
  }
  /* a photo from the gallery: the middle of it, in the frame's shape */
  function fromFile(file,done){
    var fr=new FileReader();
    fr.onload=function(){
      var im=new Image();
      im.onload=function(){
        var w=im.naturalWidth||im.width, h=im.naturalHeight||im.height, a=aspectOf(PREF.aspect), cw=w, ch=w/a;
        if(ch>h){ ch=h; cw=h*a; }
        done(draw(im,{x:(w-cw)/2,y:(h-ch)/2,w:cw,h:ch}));
      };
      im.onerror=function(){ done(String(fr.result)); };
      im.src=String(fr.result);
    };
    fr.readAsDataURL(file);
  }
  function thumb(url){
    return new Promise(function(ok){
      var im=new Image(); im.onload=function(){ var c=document.createElement('canvas'), s=120, a=im.width/im.height; c.width=s; c.height=Math.round(s/a); c.getContext('2d').drawImage(im,0,0,c.width,c.height); ok(c.toDataURL('image/jpeg',.7)); };
      im.onerror=function(){ ok(''); }; im.src=url;
    });
  }
  function deliver(url){
    if(!S||!url) return;
    var fn=S.cb;
    thumb(url).then(function(t){ SHOTS.push({url:url,thumb:t,at:Date.now()}); if(SHOTS.length>8) SHOTS.shift(); });
    close(); fn(url);
  }
  function shoot(){
    if(!S||S.busy) return;
    if(S.noLive){ systemCamera(); return; }
    S.busy=true; $('kvcShot').classList.add('busy');
    var f=document.createElement('i'); f.className='kvc-flash'; $('kvcStage').appendChild(f); setTimeout(function(){ f.remove(); },320);
    still().then(function(url){ if(!S) return; S.busy=false; $('kvcShot').classList.remove('busy'); deliver(url); });
  }
  function systemCamera(){
    var i=document.createElement('input'); i.type='file'; i.accept='image/*'; i.setAttribute('capture','environment');
    i.onchange=function(){ var f=i.files&&i.files[0]; if(f) fromFile(f,deliver); };
    i.click();
  }
  function strip(){
    var el=$('kvcStrip'); if(!el) return;
    el.innerHTML=SHOTS.slice().reverse().map(function(s,i){
      return '<button type="button" class="'+(i===0?'on':'')+'" data-shot="'+(SHOTS.length-1-i)+'" aria-label="Use this shot again"><img alt="" src="'+s.thumb+'"></button>';
    }).join('');
    el.classList.toggle('none',!SHOTS.length);
  }

  /* ---------------- touch: tap to focus, pinch, drag a corner ---------------- */
  function focusAt(x,y){
    var am=$('kvcAim'); S.aimMoved=true; am.style.left=x+'px'; am.style.top=y+'px';
    am.classList.remove('hit'); void am.offsetWidth; am.classList.add('hit');
    var c=S.caps||{}, st=$('kvcStage').getBoundingClientRect();
    if(S.track&&c.pointsOfInterest!==undefined){
      var m=(c.focusMode||[]).indexOf('single-shot')>=0?'single-shot':S.adv.focusMode;
      S.track.applyConstraints({advanced:[{pointsOfInterest:[{x:x/st.width,y:y/st.height}],focusMode:m}]}).catch(function(){});
    }
  }
  function wire(){
    var el=S.el, stage=$('kvcStage'), pts={}, pinch=null, drag=null, moved=false;
    el.addEventListener('click',function(e){
      var b=e.target.closest('[data-k],[data-z],[data-shot]'); if(!b) return;
      if(b.hasAttribute('data-z')){ setZoom(+b.getAttribute('data-z')); return; }
      if(b.hasAttribute('data-shot')){ var s=SHOTS[+b.getAttribute('data-shot')]; if(s){ var fn=S.cb; close(); fn(s.url); } return; }
      var k=b.getAttribute('data-k'), menu=$('kvcMenu'), mb=el.querySelector('[data-k="menu"]');
      if(k==='close') close();
      else if(k==='menu'){ var open=menu.hidden; menu.hidden=!open; mb.setAttribute('aria-expanded',String(open)); }
      else if(k==='torch'&&S.track){ S.torch=!S.torch; S.track.applyConstraints({advanced:[{torch:S.torch}]}).then(function(){ b.setAttribute('aria-pressed',String(S.torch)); b.classList.toggle('on',S.torch); }).catch(function(){}); }
      else if(k==='grid'){ PREF.grid=!PREF.grid; save(); $('kvcGrid').classList.toggle('on',PREF.grid); b.setAttribute('aria-pressed',String(PREF.grid)); }
      else if(k==='flip'){ S.facing=S.facing==='user'?'environment':'user'; stop(); S.torch=false; start(); menu.hidden=true; mb.setAttribute('aria-expanded','false'); }
      else if(k==='aspect'){ var i=0; ASPECTS.forEach(function(a,j){ if(a[0]===PREF.aspect) i=j; }); PREF.aspect=ASPECTS[(i+1)%ASPECTS.length][0]; save(); place(); }
    });
    $('kvcShot').addEventListener('click',shoot);
    $('kvcFile').addEventListener('change',function(){ var f=this.files&&this.files[0]; if(f) fromFile(f,deliver); });
    stage.addEventListener('pointerdown',function(e){
      pts[e.pointerId]={x:e.clientX,y:e.clientY}; moved=false;
      var c=e.target.closest('.c');
      if(c){ var r=stage.getBoundingClientRect(), f=S.frame; drag={cx:r.left+f.x+f.w/2,cy:r.top+f.y+f.h/2,d0:Math.hypot(e.clientX-(r.left+f.x+f.w/2),e.clientY-(r.top+f.y+f.h/2)),s0:PREF.size}; try{ stage.setPointerCapture(e.pointerId); }catch(x){} e.preventDefault(); }
      var ids=Object.keys(pts);
      if(ids.length===2){ var a=pts[ids[0]], b=pts[ids[1]]; pinch={d0:Math.hypot(a.x-b.x,a.y-b.y),z0:S.zoom||1}; drag=null; }
    });
    stage.addEventListener('pointermove',function(e){
      if(!pts[e.pointerId]) return;
      if(Math.hypot(e.clientX-pts[e.pointerId].x,e.clientY-pts[e.pointerId].y)>6) moved=true;
      pts[e.pointerId]={x:e.clientX,y:e.clientY};
      if(drag){ var d=Math.hypot(e.clientX-drag.cx,e.clientY-drag.cy); setSize(drag.s0*d/Math.max(20,drag.d0)); return; }
      if(pinch){ var ids=Object.keys(pts); if(ids.length<2) return; var a=pts[ids[0]], b=pts[ids[1]], zc=zoomCaps();
        setZoom(Math.max(zc&&zc.min<1?zc.min:1,Math.min(4,pinch.z0*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(20,pinch.d0)))); }
    });
    function up(e){
      var was=pts[e.pointerId]; delete pts[e.pointerId];
      if(!Object.keys(pts).length){
        if(!moved&&!drag&&!pinch&&was&&!e.target.closest('.c')){ var r=stage.getBoundingClientRect(); focusAt(e.clientX-r.left,e.clientY-r.top); }
        drag=null; pinch=null;
      }
    }
    stage.addEventListener('pointerup',up); stage.addEventListener('pointercancel',up);
    /* the size ruler: drag along it, or arrow keys */
    var sz=$('kvcSize'), sd=null;
    function fromX(x){ var r=sz.getBoundingClientRect(); setSize(.4+Math.max(0,Math.min(1,(x-r.left)/r.width))*.55); }
    sz.addEventListener('pointerdown',function(e){ sd=1; try{ sz.setPointerCapture(e.pointerId); }catch(x){} fromX(e.clientX); });
    sz.addEventListener('pointermove',function(e){ if(sd) fromX(e.clientX); });
    sz.addEventListener('pointerup',function(){ sd=null; });
    sz.addEventListener('keydown',function(e){
      var d={ArrowRight:.05,ArrowUp:.05,ArrowLeft:-.05,ArrowDown:-.05}[e.key]; if(d==null) return;
      e.preventDefault(); setSize(PREF.size+d);
    });
    S.onKey=function(e){ if(e.key==='Escape'&&S){ e.stopPropagation(); close(); } };
    document.addEventListener('keydown',S.onKey,true);
    S.onResize=function(){ place(); };
    window.addEventListener('resize',S.onResize);
  }

  /* ---------------- open and close ---------------- */
  function open(opt){
    opt=opt||{};
    close();
    if(opt.aspect&&aspectOf(opt.aspect)) PREF.aspect=opt.aspect;
    S={cb:opt.onShot||function(){},facing:'environment',zoom:1,digital:1,opener:document.activeElement};
    S.el=shell({title:opt.title||'Camera',hint:opt.hint||'Line it up inside the frame'});
    requestAnimationFrame(function(){ if(S){ S.el.classList.add('in'); place(); } });
    place(); strip(); wire(); start();
    try{ $('kvcShot').focus({preventScroll:true}); }catch(e){}
  }
  function close(){
    if(!S) return;
    stop();
    if(S.onKey) document.removeEventListener('keydown',S.onKey,true);
    if(S.onResize) window.removeEventListener('resize',S.onResize);
    var el=S.el, op=S.opener; S=null;
    if(el) el.remove();
    try{ if(op&&op.focus) op.focus({preventScroll:true}); }catch(e){}
  }
  return {__real:true,open:open,close:close,isOpen:function(){ return !!S; },shots:function(){ return SHOTS.length; },
    _crop:function(vw,vh){ return S?cropOf(vw,vh):null; },_setSize:setSize,_place:place};
})();
