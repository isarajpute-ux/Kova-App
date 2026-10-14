/* KovaLook (p29) - Kova looks at the photo or clip in a Studio post.

   Before, the writer and the caption only ever saw the file's NAME, so a
   caption could describe a video nobody had looked at. Now:
   - "Check my photo or clip" (Studio's What happens next?, and the post's
     menu) takes stills from the media - for a video the first second (the
     hook) and three more through the clip, for photos up to four of them -
     and Kova's AI (through the server, or your own key) reports what is
     visible: what it shows, whether the opening stops a scroll, framing,
     light, the subject, on-screen text, how it fits each app you picked,
     plus a caption about what is actually there. "Use this caption" and
     "Use these tags" put them in the post.
   - framesFor(post) gives the same stills to "Write it with Kova" and to
     Maya's caption, so both write about the real media.
   Sound and pacing cannot be judged from stills; it says so. */
window.KovaLook=(function(){
  'use strict';
  var cache={};   /* media signature -> {imgs, r} */
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function KP(){ return window.KovaPost; }
  function media(post){ var K=KP(); if(!K||!post) return []; var m=K.postMedia(post); return m.length?m:K.included(post); }
  function sig(post){ return media(post).map(function(m){ return m.id+':'+(m.blob||'')+':'+(m.dur||0); }).join('|'); }

  /* ---------- stills ---------- */
  function grab(src,w,h,max){
    var k=Math.min(1,max/Math.max(w||1,h||1)), c=document.createElement('canvas');
    c.width=Math.max(1,Math.round((w||320)*k)); c.height=Math.max(1,Math.round((h||180)*k));
    c.getContext('2d').drawImage(src,0,0,c.width,c.height);
    return c.toDataURL('image/jpeg',0.76);
  }
  function blobOf(m){ return window.KovaBlobs&&m.blob?KovaBlobs.get(m.blob).catch(function(){ return null; }):Promise.resolve(null); }
  function imageFrame(m){
    return blobOf(m).then(function(b){
      if(!b) return m.thumb||null;
      return new Promise(function(ok){
        var u=URL.createObjectURL(b), im=new Image(), done=function(v){ try{ URL.revokeObjectURL(u); }catch(e){} ok(v); };
        im.onload=function(){ try{ done(grab(im,im.naturalWidth,im.naturalHeight,768)); }catch(e){ done(m.thumb||null); } };
        im.onerror=function(){ done(m.thumb||null); };
        setTimeout(function(){ done(m.thumb||null); },6000);
        im.src=u;
      });
    });
  }
  function videoFrames(m){
    return blobOf(m).then(function(b){
      if(!b) return m.thumb?[m.thumb]:[];
      return videoStills(b,m.dur).then(function(L){ return L.length?L:(m.thumb?[m.thumb]:[]); });
    });
  }
  /* four stills from a video file: the first second, then through the clip */
  function videoStills(b,dur){
    return new Promise(function(ok){
        var m={dur:dur||0};
        var u=URL.createObjectURL(b), v=document.createElement('video'), out=[], fin=false;
        var done=function(){ if(fin) return; fin=true; try{ v.removeAttribute('src'); v.load(); URL.revokeObjectURL(u); }catch(e){} ok(out); };
        v.muted=true; v.playsInline=true; v.preload='auto';
        var seek=function(t){ return new Promise(function(r){ var h=function(){ v.removeEventListener('seeked',h); r(); }; v.addEventListener('seeked',h); try{ v.currentTime=t; }catch(e){ r(); } setTimeout(r,1500); }); };
        var go=function(){
          var d=v.duration; if(!isFinite(d)||d<=0) d=m.dur||0;
          if(!d){ done(); return; }
          var T=[Math.min(0.3,d*0.05),d*0.33,d*0.62,Math.max(0,d-0.4)];
          T.reduce(function(p,t){ return p.then(function(){ return seek(t).then(function(){ try{ out.push(grab(v,v.videoWidth,v.videoHeight,512)); }catch(e){} }); }); },Promise.resolve()).then(done,done);
        };
        v.onloadedmetadata=function(){
          if(isFinite(v.duration)) return go();
          v.ondurationchange=function(){ if(isFinite(v.duration)){ v.ondurationchange=null; go(); } };
          try{ v.currentTime=1e101; }catch(e){ go(); }
        };
        v.onerror=done; setTimeout(done,15000);
        v.src=u;
    });
  }
  function framesFor(post){
    var M=media(post); if(!M.length) return Promise.resolve([]);
    var key=sig(post); if(cache[key]&&cache[key].imgs) return Promise.resolve(cache[key].imgs);
    var job=M[0].kind==='video'?videoFrames(M[0]):Promise.all(M.filter(function(m){ return m.kind==='image'; }).slice(0,4).map(imageFrame));
    return job.then(function(L){ L=(L||[]).filter(Boolean).slice(0,4); cache[key]=cache[key]||{}; cache[key].imgs=L; return L; });
  }
  /* for the server writers: {mime,data} without the data: prefix */
  function asImages(L){ return (L||[]).map(function(d){ var m=/^data:(image\/[a-z]+);base64,/.exec(d||''); return m?{mime:m[1],data:d.slice(d.indexOf(',')+1)}:null; }).filter(Boolean); }

  /* ---------- the review ---------- */
  var APPN={instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube',facebook:'Facebook',linkedin:'LinkedIn',x:'X',threads:'Threads',pinterest:'Pinterest'};
  function shapeOf(m){ if(!m||!m.w||!m.h) return 'unknown'; return m.h>m.w*1.15?'vertical':(m.w>m.h*1.15?'wide':'square'); }
  function prompt(post,n){
    var M=media(post), m=M[0]||{}, video=m.kind==='video';
    return 'You review the media of one social media post before it is published. You get '
      +(video?n+' still frame'+(n===1?'':'s')+' from one video, in time order (frame 1 is the first second, which decides whether people keep watching)':n+' photo'+(n===1?'':'s')+' (photo 1 is the cover)')
      +' and the post details. Report ONLY what is visible. Sound, music and pacing cannot be judged from stills: if they matter, say unclear.\n'
      +'Reply with JSON only, no prose, no fences:\n'
      +'{"seen":"one plain sentence: what the media shows",'
      +'"hook":{"verdict":"strong|ok|weak","why":"what frame 1 or photo 1 shows and whether it would stop a scroll","fix":"one concrete change, or empty"},'
      +'"checks":[{"area":"Framing|Light|Subject|Text on screen|Background|Faces|Shape for the apps","verdict":"good|fix|unclear","note":"what the frames show","fix":"one concrete change, or empty"}],'
      +'"apps":[{"app":"one of the apps given","note":"one line on how this media fits that app"}],'
      +'"caption":"a caption under 150 characters about what is actually shown, in the person’s voice if their words are given",'
      +'"tags":"3 to 8 lowercase hashtags separated by spaces"}\n'
      +'3 to 6 checks, the ones that matter most first. Never invent people, places, products or numbers that are not visible. No motivational language, no emojis.';
  }
  function details(post){
    var M=media(post), m=M[0]||{};
    return JSON.stringify({apps:(post.targets||[]).map(function(k){ return APPN[k]||k; }),format:post.format||'',media:m.kind||'none',
      seconds:Math.round(m.dur||0),shape:shapeOf(m),width:m.w||0,height:m.h||0,heading:post.heading||'',text:post.body||'',caption:post.caption||''});
  }
  function ask(sys,imgs,txt){
    var c=KovaModel.cfg(), P=KovaModel.providers[c.p];
    var content=c.p==='anthropic'
      ? imgs.map(function(d){ return {type:'image',source:{type:'base64',media_type:KovaModel.mime(d),data:d.slice(d.indexOf(',')+1)}}; }).concat([{type:'text',text:txt}])
      : [{type:'text',text:txt}].concat(imgs.map(function(d){ return {type:'image_url',image_url:{url:d}}; }));
    var req=P.build(c.key,c.model,sys,[{role:'user',content:content}],{temperature:0.2,max_tokens:1300});
    return fetch(P.url,{method:'POST',headers:req.headers,body:req.body}).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok) throw new Error((j&&j.error)||('The review did not come back ('+r.status+').'));
        var raw=(P.read(j)||'').replace(/```json|```/g,'').trim(), a=raw.indexOf('{'), z=raw.lastIndexOf('}');
        if(a<0||z<a) throw new Error('The review came back in a form Kova could not read. Try again.');
        return JSON.parse(raw.slice(a,z+1));
      });
    });
  }
  function clean(o){
    var V={good:1,fix:1,unclear:1}, H={strong:1,ok:1,weak:1}, s=function(v,n){ return String(v==null?'':v).slice(0,n); };
    o=o||{};
    var tags=s(o.tags,300).split(/[\s,]+/).filter(Boolean).map(function(t){ t=t.toLowerCase().replace(/[^#a-z0-9_]/g,''); return t.charAt(0)==='#'?t:'#'+t; }).filter(function(t){ return t.length>2; }).slice(0,8).join(' ');
    return {seen:s(o.seen,300),
      hook:o.hook?{verdict:H[o.hook.verdict]?o.hook.verdict:'ok',why:s(o.hook.why,300),fix:s(o.hook.fix,200)}:null,
      checks:(Array.isArray(o.checks)?o.checks:[]).slice(0,6).map(function(c){ return {area:s(c&&c.area,40),verdict:V[c&&c.verdict]?c.verdict:'unclear',note:s(c&&c.note,300),fix:s(c&&c.fix,200)}; }).filter(function(c){ return c.area&&c.note; }),
      apps:(Array.isArray(o.apps)?o.apps:[]).slice(0,8).map(function(a){ return {app:s(a&&a.app,20),note:s(a&&a.note,200)}; }).filter(function(a){ return a.app&&a.note; }),
      caption:s(o.caption,300).replace(/^["“]|["”]$/g,''),tags:tags};
  }

  var cur=null;   /* {post, key} */
  function sheet(h){ if(window.openSheet) openSheet('<div class="grab"></div><div class="klk" id="klk">'+h+'</div>'); }
  function head(sub){ return '<div class="klk-h"><div><div class="klk-t">Kova looked at your '+esc(sub)+'</div><div class="sub">AI read of the frames. It says when stills cannot tell.</div></div><span class="fai-badge">AI</span></div>'; }
  function word(post){ var m=media(post)[0]; return !m?'post':(m.kind==='video'?'clip':(media(post).length>1?'photos':'photo')); }
  function paint(R,imgs,post){
    var L={good:'Good',fix:'Fix',unclear:'Can’t tell from stills'}, HK={strong:'Strong opening',ok:'Could be stronger',weak:'Weak opening'};
    sheet(head(word(post))
      +'<div class="fai-strip">'+imgs.map(function(d,i){ return '<figure><img alt="Frame '+(i+1)+'" src="'+d+'"><figcaption>'+(i+1)+'</figcaption></figure>'; }).join('')+'</div>'
      +(R.seen?'<div class="klk-seen"><b>What it shows:</b> '+esc(R.seen)+'</div>':'')
      +(R.hook?'<div class="klk-hook '+R.hook.verdict+'"><div class="klk-hh"><b>'+HK[R.hook.verdict]+'</b><span class="fai-v '+(R.hook.verdict==='strong'?'good':(R.hook.verdict==='weak'?'fix':'unclear'))+'">First '+(word(post)==='clip'?'second':'photo')+'</span></div><div>'+esc(R.hook.why)+'</div>'+(R.hook.fix?'<div class="fai-c">Try: '+esc(R.hook.fix)+'</div>':'')+'</div>':'')
      +R.checks.map(function(c){ return '<div class="fai-f"><div class="fai-fh"><b>'+esc(c.area)+'</b><span class="fai-v '+c.verdict+'">'+L[c.verdict]+'</span></div><div class="fai-s">'+esc(c.note)+'</div>'+(c.fix&&c.verdict!=='good'?'<div class="fai-c">Fix: '+esc(c.fix)+'</div>':'')+'</div>'; }).join('')
      +(R.apps.length?'<div class="lbl" style="margin:14px 0 6px">FOR EACH APP</div>'+R.apps.map(function(a){ return '<div class="klk-app"><b>'+esc(a.app)+'</b> '+esc(a.note)+'</div>'; }).join(''):'')
      +(R.caption?'<div class="lbl" style="margin:14px 0 6px">A CAPTION ABOUT WHAT IS THERE</div><div class="klk-cap">'+esc(R.caption)+(R.tags?'<div class="klk-tags">'+esc(R.tags)+'</div>':'')+'</div>'
        +'<div class="kg-acts"><button class="btn" data-klk="cap">Use this caption</button>'+(R.tags?'<button class="btn ghost" data-klk="tags">Use these tags</button>':'')+'</div>':'')
      +'<button class="btn ghost" data-klk="again" style="margin-top:10px">Check again</button>');
  }
  function busy(n,post){ sheet(head(word(post))+'<div class="sub" style="margin:8px 0">'+(n?'Looking at '+n+' frame'+(n===1?'':'s')+'…':'Taking stills from your '+esc(word(post))+'…')+'</div><div class="fai-bar"><i></i></div>'); }
  function err(msg,post){ sheet(head(word(post))+'<div class="sub" style="margin:8px 0;line-height:1.5">'+esc(msg)+'</div><button class="btn" data-klk="again">Try again</button>'); }
  function needSignIn(post){
    sheet(head(word(post))+'<div class="sub" style="margin:8px 0;line-height:1.5">Sign in and Kova’s own AI looks at your media for you (or add your own key in Settings).</div><button class="btn" data-klk="signin">Sign in</button>');
  }
  function open(post,force){
    post=post||(window.KovaCanvas&&KovaCanvas._post&&KovaCanvas._post());
    if(!post){ if(window.toast) toast('Open a post first.'); return; }
    if(!media(post).length){ if(window.toast) toast('Add a photo or clip first, then Kova can look at it.'); return; }
    var key=sig(post); cur={post:post,key:key};
    if(!force&&cache[key]&&cache[key].r){ paint(cache[key].r,cache[key].imgs,post); return; }
    if(!(window.KovaModel&&KovaModel.connected())){ needSignIn(post); return; }
    busy(0,post);
    var imgs=[];
    framesFor(post).then(function(L){
      imgs=L; if(!imgs.length) throw new Error('Kova could not take stills from this file on this device.');
      if(cur&&cur.key===key) busy(imgs.length,post);
      return ask(prompt(post,imgs.length),imgs,'The post: '+details(post));
    }).then(function(o){
      var R=clean(o); cache[key]=cache[key]||{}; cache[key].r=R; cache[key].imgs=imgs;
      if(cur&&cur.key===key) paint(R,imgs,post);
      try{ if(window.KovaAnalytics) KovaAnalytics.track('studio_look',{n:imgs.length,video:word(post)==='clip'}); }catch(e){}
    }).catch(function(e){ if(cur&&cur.key===key) err((e&&e.message)||'Try again in a moment.',post); });
  }
  function use(field){
    if(!cur) return;
    var c=cache[cur.key], p=window.KovaCanvas&&KovaCanvas._post&&KovaCanvas._post(); if(!c||!c.r) return;
    if(!p||p.id!==cur.post.id) p=cur.post;
    p[field]=field==='caption'?c.r.caption:c.r.tags;
    try{ KP().save(p); }catch(e){}
    try{ if(window.KovaCanvas&&KovaCanvas._render) KovaCanvas._render(); }catch(e){}
    if(window.toast) toast(field==='caption'?'Caption added to your post.':'Tags added to your post.');
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-klk]'); if(!b) return;
    var a=b.getAttribute('data-klk');
    if(a==='again'&&cur) open(cur.post,true);
    else if(a==='cap') use('caption');
    else if(a==='tags') use('tags');
    else if(a==='signin'){ if(window.closeSheet) closeSheet(); if(window.KovaCloudAuth&&KovaCloudAuth.open) KovaCloudAuth.open({mode:'in'}); }
  });
  return {open:open,framesFor:framesFor,asImages:asImages,videoStills:videoStills,prompt:prompt,clean:clean,_ask:ask,_cache:cache};
})();

/* KovaComposeAI (p29) - Compose's versions written by Kova's AI.

   Compose used to fill templates from your brief (a hook line, your words,
   a closing question), the same shape for everyone. Signed in (or with your
   own key), each platform's version is now written by Kova's AI from the
   brief, angle and tone, and from the files you picked in Workspace: their
   text (txt, md, csv, json, PDF) and stills of photos. The templates still
   appear first and stay if the AI cannot answer. Nothing is posted. */
window.KovaComposeAI=(function(){
  'use strict';
  function ready(){ return !!(window.KovaModel&&KovaModel.connected()); }
  var NAMES={tiktok:'TikTok',youtube:'YouTube',instagram:'Instagram',linkedin:'LinkedIn',x:'X',facebook:'Facebook'};
  function system(o){
    return 'You write one social post in several platform versions, for the person, in their own voice. You get their brief, an optional angle, a tone, '
      +'each platform’s character limit, and sometimes their files (text excerpts, or photos as images). Use the facts in the brief and files only: '
      +'never invent numbers, names, results or claims. No emojis unless the brief uses them. Avoid: delve, testament, crucial, game-changer, leverage, seamless, unlock, revolutionize.\n'
      +'Reply with JSON only, no prose, no fences:\n'
      +'{"versions":{"<platform>":{"caption":"the post text, under that platform’s limit","tags":["#tag"],'
      +'"title":"YouTube only: under 90 characters","thread":["X only: 2-4 posts if it runs as a thread"],'
      +'"script":{"visual":"what is on screen","s0":"0-3 s hook line","s1":"3-25 s middle","s2":"25-30 s close"}}}}\n'
      +'Write for how each app is used: TikTok and Instagram a hook first line then short lines; YouTube a title and a description; LinkedIn plain paragraphs with a takeaway; X one tight statement. '
      +'Video platforms (TikTok, YouTube, Instagram) get a 30-second script. 3-8 specific tags (none on X). Platforms: '+o.plats.join(', ')+'.';
  }
  function write(o){
    if(!ready()) return Promise.reject(new Error('Sign in and Kova’s AI writes these.'));
    var c=KovaModel.cfg(), P=KovaModel.providers[c.p], files=o.files||[];
    var text='Brief: '+o.brief+(o.angle?'\nAngle: '+o.angle:'')+'\nTone: '+(o.tone||'')+(o.track?'\nTrack: '+o.track:'')
      +'\nLimits: '+o.plats.map(function(k){ return (NAMES[k]||k)+' '+((o.caps||{})[k]||'')+' characters'; }).join(', ')
      +files.filter(function(f){ return f.text; }).map(function(f){ return '\n\nFile "'+f.n+'":\n'+f.text; }).join('');
    var imgs=files.filter(function(f){ return f.img; }).slice(0,4).map(function(f){ return f.img; });
    var content=c.p==='anthropic'
      ? imgs.map(function(d){ return {type:'image',source:{type:'base64',media_type:KovaModel.mime(d),data:d.slice(d.indexOf(',')+1)}}; }).concat([{type:'text',text:text}])
      : [{type:'text',text:text}].concat(imgs.map(function(d){ return {type:'image_url',image_url:{url:d}}; }));
    var req=P.build(c.key,c.model,system(o),[{role:'user',content:content}],{temperature:0.7,max_tokens:2000});
    return fetch(P.url,{method:'POST',headers:req.headers,body:req.body}).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok) throw new Error((j&&j.error)||('Kova’s AI did not answer ('+r.status+').'));
        var raw=(P.read(j)||'').replace(/```json|```/g,'').trim(), a=raw.indexOf('{'), z=raw.lastIndexOf('}');
        if(a<0||z<a) throw new Error('The versions came back in a form Kova could not read.');
        var V=(JSON.parse(raw.slice(a,z+1))||{}).versions||{}, out={};
        o.plats.forEach(function(k){
          var v=V[k]||V[NAMES[k]]||V[(NAMES[k]||'').toLowerCase()]; if(!v||!v.caption) return;
          var s=function(x,n){ return String(x==null?'':x).slice(0,n); };
          out[k]={caption:s(v.caption,(o.caps||{})[k]||3000),title:v.title?s(v.title,100):'',
            tags:(Array.isArray(v.tags)?v.tags:String(v.tags||'').split(/\s+/)).map(function(t){ t=String(t).replace(/[^#\w]/g,''); return t?(t.charAt(0)==='#'?t:'#'+t):''; }).filter(Boolean).slice(0,8),
            thread:Array.isArray(v.thread)?v.thread.slice(0,4).map(function(t){ return s(t,280); }):null,
            script:v.script&&typeof v.script==='object'?{visual:s(v.script.visual,300),s0:s(v.script.s0,300),s1:s(v.script.s1,600),s2:s(v.script.s2,300)}:null};
        });
        if(!Object.keys(out).length) throw new Error('Kova’s AI did not write any versions. Try again.');
        return out;
      });
    });
  }

  /* Workspace files -> what Compose can read: text, PDF text, photo stills.
     raw: the File kept from this session (a file added before a reload only
     has its name here, and says so). */
  function read(nodes,raw){
    var total=0;
    return Promise.all((nodes||[]).slice(0,8).map(function(k){
      var f=raw&&raw[k.id], out={n:k.n,t:k.t};
      if(!f){ out.note='only its name: add it again to have it read'; return Promise.resolve(out); }
      if(k.t==='text') return f.text().then(function(t){ out.text=String(t).slice(0,4000); return out; },function(){ out.note='could not be read'; return out; });
      if(k.t==='pdf'){
        var load=window.KovaPdf?window.KovaPdf():Promise.reject(new Error('no pdf'));
        return Promise.all([load,f.arrayBuffer()]).then(function(r){ return r[0].getDocument({data:r[1]}).promise; }).then(function(pdf){
          var jobs=[]; for(var i=1;i<=Math.min(pdf.numPages,6);i++) jobs.push(pdf.getPage(i).then(function(p){ return p.getTextContent(); }).then(function(c){ return c.items.map(function(x){ return x.str; }).join(' '); }));
          return Promise.all(jobs);
        }).then(function(p){ out.text=p.join('\n').replace(/\s+\n/g,'\n').slice(0,4000); if(!out.text.trim()){ delete out.text; out.note='a scan with no text in it'; } return out; },function(){ out.note='could not be read'; return out; });
      }
      if(k.t==='image') return new Promise(function(ok){ var fr=new FileReader(); fr.onload=function(){ ok(String(fr.result)); }; fr.onerror=function(){ ok(''); }; fr.readAsDataURL(f); })
        .then(function(d){ return d&&window.KovaModel?KovaModel.fit(d,768):d; }).then(function(d){ if(d) out.img=d; else out.note='could not be read'; return out; });
      out.note=k.t==='video'?'videos are not read here yet: use Studio’s "Check my photo or clip"':(k.t==='audio'?'audio is not transcribed here yet':'this file type is not read yet');
      return Promise.resolve(out);
    })).then(function(L){
      /* keep the whole request well under the server's limit */
      L.forEach(function(x){ if(x.text){ if(total+x.text.length>12000) x.text=x.text.slice(0,Math.max(0,12000-total)); total+=x.text.length; if(!x.text) delete x.text; } });
      return L;
    });
  }
  return {ready:ready,write:write,read:read,_system:system};
})();

/* KovaFileAI (p29) - "Read it" on a file in Work OS Files.

   Kova's AI reads the file - text, CSV, JSON, a PDF's text, a photo, or
   stills from a video - and gives what it is, a short summary, the key
   points and the to-dos it names. "Add these as tasks" puts the to-dos in
   your Tasks. A Word file or audio is not read yet, and it says so. */
window.KovaFileAI=(function(){
  'use strict';
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  var cache={}, cur=null;
  function kind(x){
    var t=String(x.mime||'').toLowerCase(), n=String(x.n||'').toLowerCase();
    if(/^image\//.test(t)) return 'image';
    if(/^video\//.test(t)) return 'video';
    if(/^audio\//.test(t)) return 'audio';
    if(/pdf/.test(t)||/\.pdf$/.test(n)) return 'pdf';
    if(/^text\//.test(t)||/json|csv/.test(t)||/\.(txt|md|csv|json|tsv|html?)$/.test(n)) return 'text';
    if(/\.docx?$/.test(n)||/word/.test(t)) return 'word';
    return 'other';
  }
  function bytes(x){
    var local=x.blob&&window.KovaBlobs?KovaBlobs.get(x.blob).catch(function(){ return null; }):Promise.resolve(null);
    return local.then(function(b){
      if(b) return b;
      if(!/^(https?:|\/api\/)/.test(x.url||'')) return null;
      return fetch(x.url).then(function(r){ return r.ok?r.blob():null; }).catch(function(){ return null; });
    });
  }
  function content(x){
    if(x.text) return Promise.resolve({text:String(x.text).slice(0,16000)});   /* meeting notes */
    var k=kind(x);
    if(k==='word') return Promise.reject(new Error('Word files are not read yet. Save it as a PDF and add that.'));
    if(k==='audio') return Promise.reject(new Error('Audio is not transcribed yet.'));
    if(k==='other') return Promise.reject(new Error('Kova cannot read this kind of file yet.'));
    return bytes(x).then(function(b){
      if(!b) throw new Error('The file itself is not on this device or in your Kova storage, only its name. Add it again to have it read.');
      if(k==='text') return b.text().then(function(t){ return {text:String(t).slice(0,16000)}; });
      if(k==='pdf'){
        if(!window.KovaPdf) throw new Error('The PDF reader did not load. Try again.');
        return Promise.all([KovaPdf(),b.arrayBuffer()]).then(function(r){ return r[0].getDocument({data:r[1]}).promise; }).then(function(pdf){
          var jobs=[]; for(var i=1;i<=Math.min(pdf.numPages,12);i++) jobs.push(pdf.getPage(i).then(function(p){ return p.getTextContent(); }).then(function(c){ return c.items.map(function(z){ return z.str; }).join(' '); }));
          return Promise.all(jobs);
        }).then(function(p){ var t=p.join('\n').trim(); if(!t) throw new Error('This PDF is a scan with no text in it. Add a photo of the page instead.'); return {text:t.slice(0,16000)}; });
      }
      if(k==='image') return new Promise(function(ok){ var fr=new FileReader(); fr.onload=function(){ ok(String(fr.result)); }; fr.onerror=function(){ ok(''); }; fr.readAsDataURL(b); })
        .then(function(d){ return KovaModel.fit(d,1280); }).then(function(d){ if(!d) throw new Error('This photo could not be opened.'); return {imgs:[d]}; });
      return KovaLook.videoStills(b,0).then(function(L){ if(!L.length) throw new Error('Kova could not take stills from this video.'); return {imgs:L}; });
    });
  }
  var SYS='You read one file for the person, as part of their work. Use only what is in it: never invent facts, names, dates or numbers. '
    +'For a photo or video stills, describe only what is visible. Reply with JSON only, no prose, no fences:\n'
    +'{"what":"one sentence: what this file is","summary":"3 to 5 plain sentences","points":["key point"],'
    +'"todos":[{"title":"a short action, starting with a verb","due":"the date or deadline if the file states one, else empty"}],'
    +'"questions":["an open question the file raises, if any"]}\n'
    +'At most 6 points, 8 to-dos and 3 questions. Only to-dos the file actually asks for or implies clearly; none is fine.';
  function ask(x,c){
    var M=KovaModel, cfg=M.cfg(), P=M.providers[cfg.p], imgs=c.imgs||[];
    var txt='File: '+x.n+(c.text?'\n\nContents:\n'+c.text:'');
    var body=cfg.p==='anthropic'
      ? imgs.map(function(d){ return {type:'image',source:{type:'base64',media_type:M.mime(d),data:d.slice(d.indexOf(',')+1)}}; }).concat([{type:'text',text:txt}])
      : [{type:'text',text:txt}].concat(imgs.map(function(d){ return {type:'image_url',image_url:{url:d}}; }));
    var req=P.build(cfg.key,cfg.model,SYS,[{role:'user',content:body}],{temperature:0,max_tokens:1500});
    return fetch(P.url,{method:'POST',headers:req.headers,body:req.body}).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok) throw new Error((j&&j.error)||('Kova\u2019s AI did not answer ('+r.status+').'));
        var raw=(P.read(j)||'').replace(/```json|```/g,'').trim(), a=raw.indexOf('{'), z=raw.lastIndexOf('}');
        if(a<0||z<a) throw new Error('The answer came back in a form Kova could not read. Try again.');
        return clean(JSON.parse(raw.slice(a,z+1)));
      });
    });
  }
  function clean(o){
    var s=function(v,n){ return String(v==null?'':v).slice(0,n); }; o=o||{};
    var arr=function(v,n,m){ return (Array.isArray(v)?v:[]).slice(0,n).map(function(x){ return s(x,m); }).filter(function(x){ return x.trim(); }); };
    return {what:s(o.what,200),summary:s(o.summary,1200),points:arr(o.points,6,240),questions:arr(o.questions,3,200),
      todos:(Array.isArray(o.todos)?o.todos:[]).slice(0,8).map(function(t){ return {title:s(t&&(t.title||t),120),due:s(t&&t.due,40)}; }).filter(function(t){ return t.title.trim(); })};
  }
  function sheet(h){ if(window.openSheet) openSheet('<div class="grab"></div><div class="klk">'+h+'</div>'); }
  function head(x){ return '<div class="klk-h"><div><div class="klk-t">'+esc(x.n)+'</div><div class="sub">Read by Kova\u2019s AI. Only what is in the file.</div></div><span class="fai-badge">AI</span></div>'; }
  function paint(x,R){
    sheet(head(x)
      +(R.what?'<div class="klk-seen"><b>What it is:</b> '+esc(R.what)+'</div>':'')
      +(R.summary?'<div class="kg-p">'+esc(R.summary)+'</div>':'')
      +(R.points.length?'<div class="lbl" style="margin:12px 0 6px">KEY POINTS</div><ul class="kfa-ul">'+R.points.map(function(p){ return '<li>'+esc(p)+'</li>'; }).join('')+'</ul>':'')
      +(R.todos.length?'<div class="lbl" style="margin:12px 0 6px">TO-DOS IT NAMES</div><ul class="kfa-ul">'+R.todos.map(function(t){ return '<li>'+esc(t.title)+(t.due?' <i>('+esc(t.due)+')</i>':'')+'</li>'; }).join('')+'</ul>'
        +'<div class="kg-acts"><button class="btn" data-kfa="tasks">Add '+(R.todos.length===1?'it':'these '+R.todos.length)+' as tasks</button></div>'
        :'<div class="sub" style="margin-top:10px">No to-dos in this file.</div>')
      +(R.questions.length?'<div class="lbl" style="margin:12px 0 6px">OPEN QUESTIONS</div><ul class="kfa-ul">'+R.questions.map(function(q){ return '<li>'+esc(q)+'</li>'; }).join('')+'</ul>':'')
      +'<button class="btn ghost" data-kfa="again" style="margin-top:10px">Read it again</button>');
  }
  function open(x,force){
    if(!x){ if(window.toast) toast('That file is gone.'); return; }
    cur=x;
    if(!force&&cache[x.id]){ paint(x,cache[x.id]); return; }
    if(!(window.KovaModel&&KovaModel.connected())){
      sheet(head(x)+'<div class="sub" style="margin:8px 0;line-height:1.5">Sign in and Kova\u2019s own AI reads your files for you (or add your own key in Settings).</div><button class="btn" data-klk="signin">Sign in</button>');
      return;
    }
    sheet(head(x)+'<div class="sub" style="margin:8px 0">Reading\u2026</div><div class="fai-bar"><i></i></div>');
    content(x).then(function(c){ return ask(x,c); }).then(function(R){
      cache[x.id]=R; if(cur===x) paint(x,R);
      try{ if(window.KovaAnalytics) KovaAnalytics.track('file_read',{kind:kind(x)}); }catch(e){}
    }).catch(function(e){ if(cur===x) sheet(head(x)+'<div class="sub" style="margin:8px 0;line-height:1.5">'+esc((e&&e.message)||'Try again in a moment.')+'</div><button class="btn" data-kfa="again">Try again</button>'); });
  }
  function addTasks(){
    var R=cur&&cache[cur.id]; if(!R||!window.WorkOS) return;
    var n=0;
    R.todos.forEach(function(t){
      var same=WorkOS.list('items').filter(function(i){ return String(i.name||'').toLowerCase()===t.title.toLowerCase(); })[0];
      if(same){ if(cur.meetingId&&!same.meetingId){ WorkOS.update('items',same.id,{meetingId:cur.meetingId},'assistant'); n++; } return; }
      var it=WorkOS.create('items',{name:t.title,status:'Not Started',priority:'Medium',notes:'From '+cur.n+(t.due?' (due: '+t.due+')':'')},'assistant'); n++;
      if(cur.meetingId&&it) WorkOS.update('items',it.id,{meetingId:cur.meetingId},'assistant');   /* shows under the meeting's action items */
    });
    try{ WorkOS.log('assistant','read a file',cur.n,'ok',n+' task(s) added'); }catch(e){}
    if(window.toast) toast(n?n+' task'+(n===1?'':'s')+' added to Tasks.':'Those are already in your Tasks.');
    try{ if(window.__workDraw&&__workDraw.tasks) __workDraw.tasks(); }catch(e){}
    try{ if(cur.meetingId&&window.__workMeet&&__workMeet.detail) __workMeet.detail(); }catch(e){}
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-kfa]'); if(!b) return;
    var a=b.getAttribute('data-kfa');
    if(a==='again'&&cur) open(cur,true);
    else if(a==='tasks') addTasks();
  });
  return {open:open,kind:kind,content:content,clean:clean,_sys:SYS};
})();
