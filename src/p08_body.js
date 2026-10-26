/* =====================================================================
   KovaBody - weigh-ins, progress photos and a photo body-fat estimate
   (p17).

   What the personal-dashboard video builds - log your weight, add a
   progress picture, watch the graph fill in day by day, have AI read the
   picture - put where it belongs in Kova: Fuel's Weight trend card,
   which until now only showed sample numbers. Nothing new to find, no
   new tab.

   The card
     - the real graph of your weigh-ins (KP 'wlog', the same log the
       maintenance calculator writes and reads), with the 4-week trend;
       tap any point for that day;
     - "Log today": one field, your unit; it updates your targets the
       same way the calculator does;
     - "Progress photos": opens the pop-up below.

   The pop-up (a sheet, like the rest of Kova's depth)
     - Front, Side and Back, each its own timeline;
     - take a photo with Kova's camera (3:4 frame) or pick one;
     - compare any two with a slider, dates and weights under them;
     - "Estimate body fat": the server (POST /body/estimate) reads the
       photo, and the earlier one if you are comparing, and answers with
       a range, how readable the photo was, what changed, and a tip;
     - delete any photo.

   Where photos live: on this phone (IndexedDB 'kova-body'), and when you
   are signed in, also in your private file storage (kind 'body', Supabase
   on Vercel or Netlify Blobs on Netlify). They never get a permanent
   link: another phone asks the server for a 15-minute one (POST
   /media/link). The list itself (dates, pose, weight, estimate) is KP
   'bodypics', so it syncs like everything else. "Delete my data" clears
   all of it.
   ===================================================================== */
window.KovaBody=(function(){
  'use strict';
  var LB=0.45359237, DAY=864e5, DBN='kova-body', OS='pics', KEY='bodypics';
  var POSES=[['front','Front'],['side','Side'],['back','Back']];
  var S={pose:'front',open:null,a:null,b:null,busy:null,sel:null,err:''};
  var URLS={}, MEM={}, dbp=null;

  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function kp(k){ try{ return window.KP?KP.get(k):null; }catch(e){ return null; } }
  function kset(k,v){ try{ if(window.KP) KP.set(k,v); }catch(e){} }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }
  function $(id){ return document.getElementById(id); }

  /* ---------------- profile and units ---------------- */
  function prof(){
    var p=null;
    try{ if(window.KovaMaint) p=KovaMaint.prof()||(KovaMaint.draft&&KovaMaint.draft()); }catch(e){}
    return p||{unit:'lb'};
  }
  function unit(){ return prof().unit==='kg'?'kg':'lb'; }
  function toU(kg){ return unit()==='kg'?kg:kg/LB; }
  function fromU(v){ return unit()==='kg'?v:v*LB; }
  function fmt(kg){ return kg==null?'':(Math.round(toU(kg)*10)/10)+' '+unit(); }
  function day(t){ return new Date(t).toDateString(); }
  function short(t){ return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
  function ago(t){ var d=Math.floor((Date.now()-t)/DAY); return d<=0?'today':d===1?'yesterday':d+' days ago'; }

  /* ---------------- weigh-ins ---------------- */
  function wlog(){ var l=kp('wlog'); return Array.isArray(l)?l.filter(function(e){ return e&&e.t&&e.kg>0; }).sort(function(a,b){ return a.t-b.t; }):[]; }
  function todayKg(){ var l=wlog(), t=l[l.length-1]; return t&&day(t.t)===day(Date.now())?t.kg:null; }
  function logWeight(kg){
    if(window.KovaMaint&&KovaMaint.logWeight){
      KovaMaint.logWeight(kg);
      try{ var cur=KovaMaint.prof(); if(cur){ cur.kg=kg; KovaMaint.save(cur,true); } }catch(e){}
    }else{
      var l=wlog().filter(function(e){ return day(e.t)!==day(Date.now()); });
      l.push({t:Date.now(),kg:kg}); kset('wlog',l.slice(-400));
    }
    /* a photo taken today gets today's weight */
    var P=pics(), ch=false;
    P.forEach(function(p){ if(day(p.t)===day(Date.now())&&p.kg==null){ p.kg=kg; ch=true; } });
    if(ch) savePics(P);
    track('weigh_in',{});
  }
  /* least-squares slope over the last 28 days, kg per week */
  function trend(){
    var W=wlog().filter(function(e){ return e.t>=Date.now()-28*DAY; });
    if(W.length<3||(W[W.length-1].t-W[0].t)<7*DAY) return null;
    var n=W.length, mx=0, my=0; W.forEach(function(e){ mx+=e.t/DAY; my+=e.kg; }); mx/=n; my/=n;
    var sxy=0, sxx=0; W.forEach(function(e){ var x=e.t/DAY-mx; sxy+=x*(e.kg-my); sxx+=x*x; });
    return sxx?sxy/sxx*7:0;
  }

  /* ---------------- photos: list ---------------- */
  function pics(){ var l=kp(KEY); return Array.isArray(l)?l.filter(function(p){ return p&&p.id; }).sort(function(a,b){ return a.t-b.t; }):[]; }
  function savePics(l){ kset(KEY,l.slice(-300)); }
  function byPose(pose){ return pics().filter(function(p){ return p.pose===pose; }); }
  function find(id){ return pics().filter(function(p){ return p.id===id; })[0]||null; }
  function update(id,fn){ var l=pics(); l.forEach(function(p){ if(p.id===id) fn(p); }); savePics(l); }

  /* ---------------- photos: bytes on this phone ---------------- */
  function db(){
    if(dbp) return dbp;
    dbp=new Promise(function(res,rej){
      try{
        if(!window.indexedDB) return rej(new Error('no storage'));
        var r=indexedDB.open(DBN,1);
        r.onupgradeneeded=function(){ try{ r.result.createObjectStore(OS); }catch(e){} };
        r.onsuccess=function(){ res(r.result); };
        r.onerror=function(){ rej(r.error||new Error('storage')); };
      }catch(e){ rej(e); }
    });
    dbp.catch(function(){ dbp=null; });
    return dbp;
  }
  function tx(mode,fn){
    return db().then(function(d){ return new Promise(function(res,rej){
      var t=d.transaction(OS,mode), st=t.objectStore(OS), out=fn(st);
      t.oncomplete=function(){ res(out&&out.result!==undefined?out.result:undefined); };
      t.onerror=t.onabort=function(){ rej(t.error||new Error('storage')); };
    }); });
  }
  function put(id,v){ MEM[id]=v; return tx('readwrite',function(s){ return s.put(v,id); }).catch(function(){}); }
  function get(id){ if(MEM[id]) return Promise.resolve(MEM[id]); return tx('readonly',function(s){ return s.get(id); }).then(function(v){ if(v) MEM[id]=v; return v||null; }).catch(function(){ return null; }); }
  function del(id){ delete MEM[id]; ['full','thumb'].forEach(function(w){ if(URLS[id+w]){ try{ URL.revokeObjectURL(URLS[id+w]); }catch(e){} delete URLS[id+w]; } });
    return tx('readwrite',function(s){ return s.delete(id); }).catch(function(){}); }

  /* the camera hands back a data URL, the file picker a File */
  function toBlob(x){
    if(x instanceof Blob) return Promise.resolve(x);
    if(typeof x==='string'&&/^data:[^,]*;base64,/.test(x)){
      try{
        var head=x.slice(5,x.indexOf(',')), bin=atob(x.slice(x.indexOf(',')+1)), u=new Uint8Array(bin.length);
        for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
        return Promise.resolve(new Blob([u],{type:head.split(';')[0]||'image/jpeg'}));
      }catch(e){ return Promise.reject(new Error('Not a photo.')); }
    }
    return Promise.reject(new Error('Not a photo.'));
  }
  /* longest side to max px, JPEG. Where the browser cannot draw it (no
     canvas, a format it cannot open) the photo goes through as it is. */
  function shrink(src,max,q){
    return toBlob(src).then(function(blob){
      return new Promise(function(res){
        var url='', done=false;
        function out(b){ if(done) return; done=true; try{ if(url) URL.revokeObjectURL(url); }catch(e){} res(b||blob); }
        try{ url=URL.createObjectURL(blob); }catch(e){ return out(blob); }
        var im=new Image();
        im.onload=function(){
          try{
            var w=im.naturalWidth||im.width, h=im.naturalHeight||im.height, k=Math.min(1,max/Math.max(w,h||1));
            var c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(h*k));
            var g=c.getContext&&c.getContext('2d');
            if(!g||!c.toBlob||!w) return out(blob);
            g.drawImage(im,0,0,c.width,c.height);
            c.toBlob(function(b){ out(b); },'image/jpeg',q||.85);
          }catch(e){ out(blob); }
        };
        im.onerror=function(){ out(blob); };
        setTimeout(function(){ out(blob); },6000);
        im.src=url;
      });
    });
  }
  function b64(blob){
    return new Promise(function(res,rej){
      var r=new FileReader();
      r.onload=function(){ res(String(r.result||'').replace(/^data:[^,]*,/,'')); };
      r.onerror=function(){ rej(r.error||new Error('read')); };
      r.readAsDataURL(blob);
    });
  }
  function signedIn(){ try{ var u=KOVA_FB.auth&&KOVA_FB.auth.currentUser; return !!(u&&!u.isAnonymous); }catch(e){ return false; } }

  /* the photo's bytes: this phone first, else a fresh link from the server */
  function bytes(p){
    return get(p.id).then(function(v){
      if(v&&v.full) return v;
      if(!p.path||!window.KovaLink) return null;
      return KovaLink.authFetch('/media/link',{json:{path:p.path}})
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(j){ return j&&j.url?fetch(j.url).then(function(r){ return r.ok?r.blob():null; }):null; })
        .then(function(full){
          if(!full) return null;
          return shrink(full,360,.75).then(function(thumb){ var o={full:full,thumb:thumb}; put(p.id,o); return o; });
        }).catch(function(){ return null; });
    });
  }
  function urlOf(p,which){
    var k=p.id+which;
    if(URLS[k]) return Promise.resolve(URLS[k]);
    return bytes(p).then(function(v){
      var b=v&&(v[which]||v.full); if(!b) return '';
      try{ URLS[k]=URL.createObjectURL(b); }catch(e){ return ''; }
      return URLS[k];
    });
  }
  function hydrate(root){
    (root||document).querySelectorAll('img[data-kb]').forEach(function(im){
      var p=find(im.getAttribute('data-kb')); if(!p) return;
      urlOf(p,im.getAttribute('data-w')||'thumb').then(function(u){
        if(u){ im.src=u; im.classList.remove('kb-miss'); } else im.classList.add('kb-miss');
      });
    });
  }

  /* ---------------- add, delete ---------------- */
  function add(src,pose){
    pose=pose||S.pose;
    var id='bp'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    return Promise.all([shrink(src,1440,.85),shrink(src,360,.75)]).then(function(r){
      var full=r[0], thumb=r[1];
      return put(id,{full:full,thumb:thumb}).then(function(){
        var l=pics(); l.push({id:id,t:Date.now(),pose:pose,kg:todayKg()}); savePics(l);
        track('progress_photo',{pose:pose});
        S.pose=pose; S.b=id;
        repaint(); paint();
        backup(id,full);
        return id;
      });
    });
  }
  function backup(id,full){
    if(!signedIn()||!window.KovaMedia||!window.KovaLink) return Promise.resolve(null);
    update(id,function(p){ p.up='…'; }); repaint();
    return KovaMedia.upload('body',full,(find(id)||{}).pose+'.jpg').then(function(r){
      update(id,function(p){ p.path=r.path; p.up='ok'; }); repaint(); return r;
    }).catch(function(){ update(id,function(p){ p.up='no'; }); repaint(); return null; });
  }
  function remove(id){
    var p=find(id); if(!p) return Promise.resolve();
    savePics(pics().filter(function(x){ return x.id!==id; }));
    if(S.a===id) S.a=null; if(S.b===id) S.b=null; if(S.open===id) S.open=null;
    var gone=del(id);
    if(p.path&&window.KovaMedia) KovaMedia.remove(p.path).catch(function(){});
    repaint(); paint(); say('Photo deleted.');
    return gone;
  }

  /* ---------------- the estimate ---------------- */
  function before(p){
    var l=byPose(p.pose).filter(function(x){ return x.t<p.t; });
    if(S.a&&S.a!==p.id){ var a=find(S.a); if(a&&a.pose===p.pose&&a.t<p.t) return a; }
    return l[l.length-1]||null;
  }
  function estimate(id){
    var p=find(id); if(!p||S.busy) return Promise.resolve(null);
    if(!window.KovaLink){ S.err='Estimates need the Kova server. Your photo is saved.'; repaint(); return Promise.resolve(null); }
    S.busy=id; S.err=''; repaint();
    var prev=before(p), pr=prof();
    return Promise.all([bytes(p),prev?bytes(prev):null]).then(function(v){
      if(!v[0]) throw new Error('This photo is not on this phone yet. Try again when you are online.');
      return Promise.all([shrink(v[0].full,1024,.8).then(b64),v[1]?shrink(v[1].full,768,.75).then(b64):null]);
    }).then(function(img){
      var body={image:img[0],mime:'image/jpeg',pose:p.pose,sex:pr.sex,age:pr.age,cm:pr.hcm,kg:p.kg||todayKg()||pr.kg};
      if(img[1]){ body.prev=img[1]; body.prevMime='image/jpeg'; body.days=Math.round((p.t-prev.t)/DAY); body.prevKg=prev.kg; }
      return KovaLink.authFetch('/body/estimate',{json:body});
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(r.status===402){ try{ if(window.KovaBilling) KovaBilling.paywall('body'); }catch(e){} throw new Error('Photo estimates are part of Kova Pro.'); }
        if(!r.ok) throw new Error(j.error||'Could not read the photo right now.');
        return j;
      });
    }).then(function(j){
      update(id,function(x){
        x.est=j.none?{none:true,why:j.why,at:Date.now()}
          :{lo:j.lo,hi:j.hi,conf:j.conf,notes:j.notes||[],change:j.change||'',tip:j.tip||'',care:j.care||'',at:Date.now(),vs:prev?prev.id:null};
      });
      track('body_estimate',{withPrev:!!prev});
      S.busy=null; repaint(); return find(id).est;
    }).catch(function(e){
      S.busy=null; S.err=(e&&e.message)||'Could not read the photo right now.'; repaint(); return null;
    });
  }

  /* ---------------- the card in Fuel ---------------- */
  function card(){ var c=$('wtChart'); return c?c.closest('.card'):null; }
  /* On the live site the sample charts block (#fuelTrends) is hidden, and
     the Weight card sat inside it as the fourth tab. Real weigh-ins are not
     sample data, so there the card stands on its own just below it. */
  function place(c){
    var host=c.closest('#fuelTrends');
    if(host&&(host.hasAttribute('data-demo')||document.documentElement.classList.contains('kova-live'))&&host.parentNode){
      host.parentNode.insertBefore(c,host.nextSibling);
      c.classList.add('kb-solo');
    }
  }
  function parked(){ try{ return !!(window.KovaPark&&KovaPark.parked&&KovaPark.parked().indexOf('s-fuel')>-1); }catch(e){ return false; } }

  function chart(W,sel){
    var w=280, h=130, L=10, R=10, T=16, B=22;
    if(!W.length) return '<text x="140" y="62" text-anchor="middle" class="kb-ct">No weigh-ins yet</text>'
      +'<text x="140" y="80" text-anchor="middle" class="kb-cs">Log below. The line starts with your second.</text>';
    var t0=W[0].t, t1=W[W.length-1].t, span=Math.max(DAY,t1-t0);
    var vals=W.map(function(e){ return toU(e.kg); }), lo=Math.min.apply(null,vals), hi=Math.max.apply(null,vals), pad=Math.max(.6,(hi-lo)*.15);
    lo-=pad; hi+=pad;
    var X=function(t){ return W.length===1?w/2:L+(t-t0)/span*(w-L-R); }, Y=function(v){ return T+(1-(v-lo)/(hi-lo))*(h-T-B); };
    var line=W.map(function(e){ return X(e.t).toFixed(1)+','+Y(toU(e.kg)).toFixed(1); }).join(' ');
    var area=W.length>1?line+' '+X(t1).toFixed(1)+','+(h-B)+' '+X(t0).toFixed(1)+','+(h-B):'';
    var dots=W.map(function(e,i){ var on=i===sel;
      return '<circle class="kb-dot'+(on?' on':'')+'" cx="'+X(e.t).toFixed(1)+'" cy="'+Y(toU(e.kg)).toFixed(1)+'" r="'+(on?4.5:2.5)+'"/>'; }).join('');
    var lab=W.map(function(e,i){ if(i!==sel&&i!==0&&i!==W.length-1) return '';
      return '<text class="kb-lab'+(i===sel?' on':'')+'" x="'+X(e.t).toFixed(1)+'" y="'+(Y(toU(e.kg))-9).toFixed(1)+'" text-anchor="middle">'+(Math.round(toU(e.kg)*10)/10)+'</text>'; }).join('');
    return '<defs><linearGradient id="kbArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--warn)" stop-opacity=".3"/><stop offset="100%" stop-color="var(--warn)" stop-opacity="0"/></linearGradient></defs>'
      +(area?'<polygon points="'+area+'" fill="url(#kbArea)"/>':'')
      +(W.length>1?'<polyline class="kb-line" points="'+line+'"/>':'')+dots+lab;
  }
  function paint(){
    /* asking for the card would wake a parked Fuel screen, so check first */
    if(parked()) return;
    var c=card(); if(!c) return;
    var W=wlog().slice(-90), P=pics(), tr=trend(), tk=todayKg(), u=unit();
    if(S.sel==null||S.sel<0||S.sel>=W.length) S.sel=W.length-1;
    var month=W.filter(function(e){ return e.t>=Date.now()-30*DAY; });
    var chg=month.length>1?toU(month[month.length-1].kg)-toU(month[0].kg):null;
    var last=P[P.length-1];
    var lastTxt=!P.length?'Add your first. Front, side and back.'
      :P.length+' photo'+(P.length===1?'':'s')+' · last '+ago(last.t)+((Date.now()-last.t)>7*DAY?'. Time for this week’s.':'');
    var sel=W[S.sel];
    c.setAttribute('data-kbody','1'); c.removeAttribute('data-demo'); place(c);
    c.innerHTML='<div class="kb-head"><div class="kb-t">Weight trend</div>'
      +(chg!=null?'<div class="lbl kb-chg '+(chg<0?'dn':'up')+'">'+(chg>0?'+':chg<0?'−':'')+Math.abs(Math.round(chg*10)/10)+' '+u.toUpperCase()+' THIS MONTH</div>':'')+'</div>'
      +'<div class="sub" style="margin-bottom:6px">'+(tr!=null?'Trend '+(tr>0?'+':tr<0?'−':'')+Math.abs(Math.round(toU(tr)*10)/10)+' '+u+' a week over 4 weeks. The trend, not one weigh-in, sets your calories.'
        :'Weigh in at the same time each day. The trend, not one weigh-in, sets your calories.')+'</div>'
      +'<svg id="wtChart" width="100%" viewBox="0 0 280 130" role="img" aria-label="Weight trend, chart" style="display:block;cursor:pointer;touch-action:none">'+chart(W,S.sel)+'</svg>'
      +'<div class="kb-axis" id="wtAxis">'+(W.length>1?'<span class="lbl">'+short(W[0].t)+'</span><span class="lbl">'+short(W[W.length-1].t)+'</span>':'')+'</div>'
      +(sel?'<div class="card kb-pt"><div class="lbl" id="wtPtLbl">'+esc(short(sel.t).toUpperCase())+' · '+esc(fmt(sel.kg).toUpperCase())+'</div>'
        +'<div class="sub" id="wtPtTxt" style="margin-top:3px">'+esc(ptText(W,S.sel))+'</div></div>':'')
      +'<div class="kb-log"><input class="sfield" id="kbWIn" inputmode="decimal" aria-label="Today’s weight in '+u+'" placeholder="'+(tk?(Math.round(toU(tk)*10)/10):(W.length?Math.round(toU(W[W.length-1].kg)*10)/10:(u==='kg'?'80':'175')))+'"/>'
      +'<span class="kb-u">'+u+'</span><button class="chip on" id="kbWSave">'+(tk?'Update today':'Log today')+'</button></div>'
      +'<button class="kb-row" id="kbPics" aria-haspopup="dialog"><span class="kb-thumbs">'
        +P.slice(-3).reverse().map(function(p){ return '<img data-kb="'+p.id+'" data-w="thumb" alt="">'; }).join('')+'</span>'
      +'<span class="kb-rt"><b>Progress photos</b><i>'+esc(lastTxt)+'</i></span><svg class="ic"><use href="#i-chevron-right"/></svg></button>';
    var svg=$('wtChart');
    var hit=function(e){
      if(W.length<2) return;
      var r=svg.getBoundingClientRect(), t=e.touches?e.touches[0]:e, rx=(t.clientX-r.left)/Math.max(1,r.width);
      var t0=W[0].t, span=Math.max(DAY,W[W.length-1].t-t0), best=0, bd=9;
      W.forEach(function(x,i){ var d=Math.abs((x.t-t0)/span-rx); if(d<bd){ bd=d; best=i; } });
      S.sel=best; paint(); if(e.cancelable) e.preventDefault();
    };
    svg.addEventListener('mousedown',hit); svg.addEventListener('touchstart',hit,{passive:false});
    $('kbWSave').onclick=function(){
      var v=parseFloat(String($('kbWIn').value||'').replace(',','.'));
      if(!(v>0)){ say('Type your weight first.'); return; }
      var kg=fromU(v); if(kg<30||kg>300){ say('That doesn’t look like a bodyweight.'); return; }
      logWeight(kg); S.sel=null; paint();
      say('Logged '+(Math.round(v*10)/10)+' '+u+'.');
    };
    $('kbWIn').onkeydown=function(e){ if(e.key==='Enter') $('kbWSave').click(); };
    $('kbPics').onclick=function(){ open(); };
    hydrate(c);
  }
  function ptText(W,i){
    var e=W[i], p=W[i-1];
    if(!p) return fmt(e.kg)+'. Your first weigh-in.';
    var d=toU(e.kg)-toU(p.kg), r=Math.round(Math.abs(d)*10)/10;
    if(r===0) return fmt(e.kg)+', the same as '+short(p.t)+'.';
    return fmt(e.kg)+', '+(d<0?'down ':'up ')+r+' '+unit()+' from '+short(p.t)+'.'+(Math.abs(d)<1.5&&i>1?' Day-to-day moves this size are mostly water.':'');
  }

  /* ---------------- the pop-up ---------------- */
  function open(id){
    if(!window.openSheet) return;
    S.open=id||null; S.err='';
    if(!S.b){ var l=byPose(S.pose); if(l.length) S.b=l[l.length-1].id; }
    openSheet('<div class="grab"></div><div class="kbs" id="kbS" role="dialog" aria-label="Progress photos"></div>');
    var root=$('kbS'); if(!root) return;
    root.addEventListener('click',onClick);
    root.addEventListener('change',onChange);
    root.addEventListener('input',onInput);
    repaint();
    track('progress_open',{});
  }
  function repaint(){
    var root=$('kbS'); if(!root) return;
    root.innerHTML=S.open&&find(S.open)?detail(find(S.open)):list();
    hydrate(root);
    var rng=root.querySelector('.kb-rng'); if(rng) slide(rng);
  }
  function list(){
    var L=byPose(S.pose), all=pics();
    var A=S.a&&find(S.a), B=S.b&&find(S.b);
    if(!A||A.pose!==S.pose) A=L[0]||null;
    if(!B||B.pose!==S.pose) B=L[L.length-1]||null;
    if(A&&B&&A.t>B.t){ var t=A; A=B; B=t; }
    var cmp=A&&B&&A.id!==B.id;
    return '<div class="title-s" style="font-size:19px;margin-bottom:4px">Progress photos</div>'
      +'<div class="sub kb-lead">Same spot, same light, same time of day. Only you can see these.</div>'
      +'<div class="kbs-seg" role="tablist" aria-label="Pose">'+POSES.map(function(p){ var n=byPose(p[0]).length;
        return '<button role="tab" aria-selected="'+(S.pose===p[0])+'" class="'+(S.pose===p[0]?'on':'')+'" data-b="pose" data-v="'+p[0]+'">'+p[1]+(n?' <i>'+n+'</i>':'')+'</button>'; }).join('')+'</div>'
      +(cmp?'<div class="kb-cmp" style="--kb-x:50%"><img data-kb="'+A.id+'" data-w="full" alt="Earlier photo, '+esc(short(A.t))+'">'
          +'<div class="kb-top"><img data-kb="'+B.id+'" data-w="full" alt="Newer photo, '+esc(short(B.t))+'"></div><div class="kb-bar"></div>'
          +'<input type="range" class="kb-rng" min="0" max="100" value="50" aria-label="Slide between the two photos"></div>'
          +'<div class="kb-cap"><span><b>'+esc(short(A.t))+'</b>'+(A.kg?' · '+esc(fmt(A.kg)):'')+'</span><span class="kb-gap">'+Math.max(1,Math.round((B.t-A.t)/DAY))+' days'
          +(A.kg&&B.kg?' · '+(B.kg<A.kg?'−':'+')+Math.round(Math.abs(toU(B.kg)-toU(A.kg))*10)/10+' '+unit():'')+'</span><span><b>'+esc(short(B.t))+'</b>'+(B.kg?' · '+esc(fmt(B.kg)):'')+'</span></div>'
        :(L.length===1?'<div class="kb-hint">One more '+S.pose+' photo and you can slide between them here.</div>':''))
      +'<div class="kbs-act"><button class="btn" data-b="cam">Take today’s photo</button>'
      +'<label class="btn ghost kb-up">Choose a photo<input type="file" accept="image/*" data-b="file"></label></div>'
      +(L.length?'<div class="kbs-grid">'+L.slice().reverse().map(function(p){
          var tag=A&&p.id===A.id?'Then':B&&p.id===B.id?'Now':'';
          return '<button class="kbs-tile" data-b="open" data-v="'+p.id+'" aria-label="Photo from '+esc(short(p.t))+'">'
            +'<img data-kb="'+p.id+'" data-w="thumb" alt="">'+(tag&&cmp?'<em>'+tag+'</em>':'')
            +'<span><b>'+esc(short(p.t))+'</b>'+(p.kg?esc(fmt(p.kg)):'')+(p.est&&!p.est.none?' · '+p.est.lo+'–'+p.est.hi+'%':'')+'</span></button>'; }).join('')+'</div>'
        :'<div class="kb-empty">No '+S.pose+' photos yet. Stand back so your whole body fits, arms a little out from your sides.</div>')
      +'<div class="kb-priv">'+(signedIn()?'Kept on this phone and backed up privately to your account. ':'Kept on this phone. Sign in to back them up privately. ')+'Never posted.</div>';
  }
  function detail(p){
    var e=p.est, prev=before(p), busy=S.busy===p.id;
    var est=busy?'<div class="kb-est wait"><span class="kb-spin" aria-hidden="true"></span>Reading the photo'+(prev?' and the one from '+esc(short(prev.t)):'')+'…</div>'
      :e&&e.none?'<div class="kb-est"><div class="kb-none">'+esc(e.why||'No body to read in that photo.')+'</div><button class="kwlink" data-b="est" data-v="'+p.id+'">Try again</button></div>'
      :e?'<div class="kb-est"><div class="lbl">BODY FAT, FROM THIS PHOTO</div><div class="kb-bf">'+e.lo+'–'+e.hi+'<i>%</i></div>'
        +'<div class="kb-conf"><span style="width:'+Math.max(5,Math.min(100,e.conf))+'%"></span></div><div class="kb-cl">Photo clarity '+e.conf+'%. A photo is rough: use the range for direction, not as a number.</div>'
        +(e.change?'<div class="kb-chg2"><b>Since '+esc(e.vs&&find(e.vs)?short(find(e.vs).t):'last time')+'</b>'+esc(e.change)+'</div>':'')
        +(e.notes&&e.notes.length?'<ul class="kb-notes">'+e.notes.map(function(n){ return '<li>'+esc(n)+'</li>'; }).join('')+'</ul>':'')
        +(e.care?'<div class="kb-care">'+esc(e.care)+'</div>':'')
        +(e.tip?'<div class="kb-tip">'+esc(e.tip)+'</div>':'')
        +'<button class="kwlink" data-b="est" data-v="'+p.id+'">Estimate again</button></div>'
      :'<div class="kb-est"><button class="btn" data-b="est" data-v="'+p.id+'">Estimate body fat</button>'
        +'<div class="kb-cl">AI reads this photo'+(prev?' next to your '+esc(short(prev.t))+' one':'')+' and answers with a range. Nothing is kept on the server.</div></div>';
    return '<button class="kwlink sm kb-back" data-b="back">‹ All photos</button>'
      +'<div class="kb-big"><img data-kb="'+p.id+'" data-w="full" alt="Progress photo, '+esc(short(p.t))+'"></div>'
      +'<div class="kb-meta"><b>'+esc(new Date(p.t).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'}))+'</b>'
      +'<span>'+esc(POSES.filter(function(x){ return x[0]===p.pose; })[0][1])+(p.kg?' · '+esc(fmt(p.kg)):'')
      +(p.up==='ok'?' · backed up':p.up==='…'?' · backing up…':p.up==='no'?' · on this phone only':'')+'</span></div>'
      +(S.err?'<div class="kb-err" role="alert">'+esc(S.err)+'</div>':'')+est
      +'<div class="kb-two"><button class="btn ghost" data-b="then" data-v="'+p.id+'">Compare from this one</button>'
      +'<button class="btn ghost kb-del" data-b="del" data-v="'+p.id+'">Delete photo</button></div>';
  }
  function slide(rng){
    var box=rng.closest('.kb-cmp'); if(!box) return;
    box.style.setProperty('--kb-x',rng.value+'%');
  }
  function onInput(e){ if(e.target.classList.contains('kb-rng')) slide(e.target); }
  function onChange(e){
    var f=e.target; if(f.getAttribute('data-b')!=='file'||!f.files||!f.files[0]) return;
    var file=f.files[0]; f.value='';
    if(!/^image\//.test(file.type||'image/')){ say('That is not a photo.'); return; }
    add(file).then(function(){ say('Photo saved.'); }).catch(function(){ say('Could not save that photo.'); });
  }
  function onClick(e){
    var b=e.target.closest('[data-b]'); if(!b) return;
    var k=b.getAttribute('data-b'), v=b.getAttribute('data-v');
    if(k==='file') return;
    if(k==='pose'){ S.pose=v; S.a=null; S.b=null; repaint(); }
    else if(k==='open'){ S.open=v; S.err=''; repaint(); }
    else if(k==='back'){ S.open=null; S.err=''; repaint(); }
    else if(k==='cam') camera();
    else if(k==='est') estimate(v);
    else if(k==='then'){ var p=find(v); if(p){ S.pose=p.pose; S.a=v; var L=byPose(p.pose); S.b=L[L.length-1].id===v&&L.length>1?L[L.length-2].id:L[L.length-1].id; S.open=null; repaint(); } }
    else if(k==='del'){ if(b.getAttribute('data-sure')){ remove(v); } else { b.setAttribute('data-sure','1'); b.textContent='Tap again to delete'; } }
  }
  function camera(){
    if(!window.KovaCam||!KovaCam.open){ var f=document.querySelector('#kbS input[type=file]'); if(f) f.click(); return; }
    var pose=S.pose;
    KovaCam.open({title:'Progress photo · '+POSES.filter(function(x){ return x[0]===pose; })[0][1],
      hint:'Same spot and light as last time. Whole body in the frame.', aspect:'3:4',
      onShot:function(dataUrl){ if(!dataUrl) return; try{ KovaCam.close(); }catch(e){}
        add(dataUrl,pose).then(function(){ open(); say('Photo saved.'); }).catch(function(){ say('Could not save that photo.'); }); }});
  }

  /* ---------------- start ---------------- */
  function start(){
    var go=function(){ paint(); };
    if(window.KovaPark&&KovaPark.after) KovaPark.after('s-fuel',go); else go();
    var fuel=$('s-fuel');
    if(fuel&&window.MutationObserver) new MutationObserver(function(){ if(fuel.classList.contains('on')) paint(); }).observe(fuel,{attributes:true,attributeFilter:['class']});
    document.addEventListener('kova:cloud',function(){ paint(); });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else setTimeout(start,0);

  return {paint:paint,open:open,add:add,remove:remove,estimate:estimate,logWeight:logWeight,pics:pics,wlog:wlog,trend:trend,
    _S:S,_shrink:shrink,_bytes:bytes};
})();
