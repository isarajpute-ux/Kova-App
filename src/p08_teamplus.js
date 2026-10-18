/* =====================================================================
   KovaTeamPlus - the rest of the Grok Bot way of working, for the AI
   team (p31). All of it runs through the team's own job engine
   (src/p08_crew.js), so every answer is a real job with its steps,
   approvals, undo and weekly limits.

   1. Team chat: several teammates in one conversation. "@Sage @Maya
      plan this week's posts around my training" asks Sage, then Maya,
      each seeing what the one before said; "@everyone" goes to the Chief
      of Staff, who brings in whoever should answer. No @: Kova picks the
      teammate whose job matches. A teammate's hand-offs show in the chat.
   2. Do it again: every finished job can be run again, kept as a saved
      skill (one tap later), or put on a schedule (a routine of its own,
      also on the Kova server while Kova is closed).
   3. Attachments: a photo, a video (4 stills), a PDF or a text file goes
      with a message to a teammate or the chat; Kova's AI sees the photo.
      The microphone dictates a voice note into the box.
   4. Meet your team: on a new team, pick what you want help with; Kova
      picks the teammates, gives each a first job, and turns on the
      ready-made routines (morning brief, inbox sweep, comments roundup,
      today's training, plan my week). They stay on the Routines page.
   5. Watch a page: the Research teammate reads a page every 6 hours on
      the Kova server and reports only what changed (functions/crew.js).
   6. Search finds the team's past jobs, reports, skills and watches
      (src/p08_cmdk.js asks list() here).
   7. Share into Kova: on Android, Kova appears in the share menu
      (manifest share_target, sw.js keeps what was shared); the shared
      text, link or files go to a teammate, the chat, or a task.
   ===================================================================== */
window.KovaTeamPlus=(function(){
  'use strict';
  var CKEY='kova.crew.chat.v1', MKEY='kova.crew.meet.v1', DAY=864e5;
  var S={pend:{}, reading:null, pick:null, pv:{}, rec:null, sel:[], roundFiles:null, share:null};
  function K(){ return window.KovaCrew||null; }
  function W(){ return window.WorkOS||null; }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function md(t){ var k=K(); return k&&k.md?k.md(t):esc(t); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function lsPut(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function uid(p){ return (p||'x')+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function ago(t){ if(!t) return ''; var s=(Date.now()-t)/1000; if(s<60) return 'just now'; if(s<3600) return Math.round(s/60)+' min ago'; if(s<86400) return Math.round(s/3600)+' h ago'; return Math.round(s/86400)+' d ago'; }
  function short(t,n){ t=String(t||'').replace(/\s+/g,' ').trim(); return t.length>n?t.slice(0,n-1).replace(/\s+\S*$/,'')+'…':t; }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }
  function repaint(){ var k=K(); if(k&&k.paint) k.paint(); }
  function mates(){ var k=K(); return k&&k.emps?k.emps().filter(function(e){ return e.enabled; }):[]; }
  function byTpl(t){ return mates().filter(function(e){ return e.tpl===t; })[0]||null; }
  function server(){ var k=K(); try{ return !!(k&&k.server&&k.server()); }catch(e){ return false; } }
  function jobOf(id){ var k=K(); return k&&id?(k.jobs()[id]||null):null; }
  function save(e,patch){ var w=W(); if(w&&e) w.update('agents',e.id,patch,'user'); }
  var IC={clip:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mic:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    send:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    doc:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z M14 3v5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'};
  var DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  function every(v){
    if(!v||!v.freq) return 'Not on a schedule';
    return ({daily:'Every day',weekdays:'Weekdays',weekly:DAYS[(+v.dow||1)%7]+'s'}[v.freq]||v.freq)+' at '+(v.time||'09:00')+(v.cloud?', also while Kova is closed':'');
  }

  /* ================= 3. attachments and voice notes ================= */
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition||null;
  function kind(f){
    var t=String(f.type||'').toLowerCase(), n=String(f.name||'').toLowerCase();
    if(/^image\//.test(t)) return 'image';
    if(/^video\//.test(t)) return 'video';
    if(/pdf/.test(t)||/\.pdf$/.test(n)) return 'pdf';
    if(/^text\//.test(t)||/json|csv/.test(t)||/\.(txt|md|csv|json|tsv)$/.test(n)) return 'text';
    return 'other';
  }
  function dataUrl(b){ return new Promise(function(ok){ var fr=new FileReader(); fr.onload=function(){ ok(String(fr.result||'')); }; fr.onerror=function(){ ok(''); }; fr.readAsDataURL(b); }); }
  function fit(d,max){ return d&&window.KovaModel&&KovaModel.fit?KovaModel.fit(d,max).catch(function(){ return d; }):Promise.resolve(d); }
  function readFile(f){
    var k=kind(f), n=String(f.name||'file').slice(0,80);
    if(f.size>80e6) return Promise.reject(new Error(n+' is too big to read.'));
    if(k==='image') return dataUrl(f).then(function(d){ return fit(d,1024); }).then(function(d){
      if(!d) throw new Error(n+' could not be opened.');
      return fit(d,96).then(function(th){ return {n:n,k:'image',imgs:[d],th:th}; }); });
    if(k==='video'){
      if(!window.KovaLook||!KovaLook.videoStills) return Promise.reject(new Error('Videos are still loading. Try again in a moment.'));
      return KovaLook.videoStills(f,0).then(function(L){ L=(L||[]).filter(Boolean).slice(0,4); if(!L.length) throw new Error('Kova could not take stills from '+n+'.');
        return Promise.all(L.map(function(d){ return fit(d,1024); })).then(function(F){ return fit(F[0],96).then(function(th){ return {n:n,k:'video',imgs:F,th:th}; }); }); });
    }
    if(k==='text') return f.text().then(function(t){ return {n:n,k:'text',text:String(t).slice(0,16000)}; });
    if(k==='pdf'){
      if(!window.KovaPdf) return Promise.reject(new Error('The PDF reader did not load. Try again.'));
      return Promise.all([KovaPdf(),f.arrayBuffer()]).then(function(r){ return r[0].getDocument({data:r[1]}).promise; }).then(function(pdf){
        var jobs=[]; for(var i=1;i<=Math.min(pdf.numPages,12);i++) jobs.push(pdf.getPage(i).then(function(p){ return p.getTextContent(); }).then(function(c){ return c.items.map(function(z){ return z.str; }).join(' '); }));
        return Promise.all(jobs);
      }).then(function(p){ var t=p.join('\n').trim(); if(!t) throw new Error(n+' is a scan with no text in it. Attach a photo of the page instead.'); return {n:n,k:'pdf',text:t.slice(0,16000)}; });
    }
    return Promise.reject(new Error('Kova cannot read '+n+' yet. Photos, videos, PDFs and text files work.'));
  }
  var input=null;
  function picker(box){
    if(!input){
      input=document.createElement('input'); input.type='file'; input.multiple=true; input.hidden=true; input.id='tpFile';
      input.accept='image/*,video/*,application/pdf,.pdf,text/*,.txt,.md,.csv,.json';
      input.addEventListener('change',function(){ var L=[].slice.call(input.files||[]); input.value=''; addFiles(S.pickBox,L); });
      document.body.appendChild(input);
    }
    S.pickBox=box; input.click();
  }
  function addFiles(box,L){
    if(!box||!L||!L.length) return Promise.resolve([]);
    var have=S.pend[box]||[], room=Math.max(0,4-have.length);
    if(!room){ say('Four files at a time. Send these first.'); return Promise.resolve([]); }
    if(L.length>room) say('Only the first '+room+' went in: four files at a time.');
    S.reading=box; repaint();
    return Promise.all(L.slice(0,room).map(function(f){ return readFile(f).catch(function(e){ say(e.message); return null; }); })).then(function(R){
      R=R.filter(Boolean); S.pend[box]=(S.pend[box]||[]).concat(R); S.reading=null; repaint(); return R;
    });
  }
  function tools(box){
    var on=S.rec&&S.rec.box===box;
    return '<span class="tp-tools"><button class="tp-ic" data-tp="attach" data-box="'+esc(box)+'" aria-label="Attach a photo, video or file">'+IC.clip+'</button>'
      +(SR?'<button class="tp-ic'+(on?' on':'')+'" data-tp="mic" data-box="'+esc(box)+'" aria-pressed="'+!!on+'" aria-label="'+(on?'Stop the voice note':'Say it as a voice note')+'">'+IC.mic+'</button>':'')+'</span>';
  }
  function chip(f,box,i){
    return '<span class="tp-file">'+(f.th?'<img src="'+esc(f.th)+'" alt="">':'<i>'+IC.doc+'</i>')+'<span>'+esc(f.n)+(f.k==='video'?' · 4 stills':'')+'</span>'
      +(box!=null?'<button data-tp="unattach" data-box="'+esc(box)+'" data-i="'+i+'" aria-label="Remove '+esc(f.n)+'">×</button>':'')+'</span>';
  }
  function pend(box){
    var P=S.pend[box]||[];
    if(!P.length&&S.reading!==box) return '';
    return '<div class="tp-pend">'+P.map(function(f,i){ return chip(f,box,i); }).join('')+(S.reading===box?'<span class="tp-file busy">Reading…</span>':'')+'</div>';
  }
  function files(j){ return j&&j.files&&j.files.length?'<div class="tp-pend in">'+j.files.map(function(f){ return chip(f,null); }).join('')+'</div>':''; }
  function blocks(P){
    var imgs=[]; (P||[]).forEach(function(f){ (f.imgs||[]).forEach(function(d){ imgs.push(d); }); });
    return imgs.slice(0,4).map(function(d){ var m=/^data:(image\/(?:jpeg|png|webp|gif));base64,/.exec(d||''); return m?{type:'image',source:{type:'base64',media_type:m[1],data:d.slice(d.indexOf(',')+1)}}:null; }).filter(Boolean);
  }
  function fileWords(P){
    var ph=(P||[]).filter(function(f){ return f.k==='image'; }), vi=(P||[]).filter(function(f){ return f.k==='video'; });
    return (ph.length?'\n\n(Attached photo'+(ph.length>1?'s':'')+': '+ph.map(function(f){ return f.n; }).join(', ')+'. Describe only what you can see.)':'')
      +(vi.length?'\n\n(Stills from the video '+vi.map(function(f){ return f.n; }).join(', ')+', in order.)':'')
      +(P||[]).filter(function(f){ return f.text; }).map(function(f){ return '\n\nATTACHED FILE: '+f.n+'\n'+f.text; }).join('');
  }
  /* called right after a job starts, before its first step */
  function attach(job,box,P){
    P=P||S.pend[box]||[]; if(!job||!P.length) return job;
    var k=K(), first=job.convo&&job.convo[0]; if(!first) return job;
    var text=typeof first.content==='string'?first.content:'';
    var B=blocks(P);
    first.content=B.concat([{type:'text',text:(text+fileWords(P)).slice(0,30000)}]);
    job.files=P.map(function(f){ return {n:f.n,k:f.k,th:f.th||''}; });
    if(box) S.pend[box]=[];
    if(B.length&&k&&k.brain&&k.brain()==='local') k.log(job,'Photos need Kova’s AI: sign in, or add your own Claude key in Settings. The words still went through.','blocked');
    if(k) k.saveJobs();
    return job;
  }
  function mic(box){
    if(S.rec){ var was=S.rec.box; try{ S.rec.r.stop(); }catch(e){} S.rec=null; relisten(); repaint(); if(was===box) return; }
    if(!SR){ say('Voice notes need a browser that can listen, like Chrome or Safari.'); return; }
    var r=new SR(), ta=document.getElementById(box), base=ta?ta.value.replace(/\s*$/,''):'';
    r.lang=navigator.language||'en-US'; r.interimResults=true; r.continuous=true;
    r.onresult=function(ev){ var t='',i; for(i=0;i<ev.results.length;i++) t+=ev.results[i][0].transcript; var el=document.getElementById(box); if(el) el.value=(base?base+' ':'')+t.trim(); };
    r.onerror=function(ev){ var why=ev&&ev.error; if(why!=='aborted'&&why!=='no-speech') say(why==='not-allowed'||why==='service-not-allowed'?'Kova needs the microphone for a voice note. Allow it in your browser settings.':'The voice note stopped ('+why+').'); };
    r.onend=function(){ if(S.rec&&S.rec.r===r){ S.rec=null; relisten(); repaint(); } };
    /* "hey <name>" listening and a voice note cannot share the microphone */
    var L=window.KovaListen; if(L&&L.on&&L.on()){ try{ L.set(false); S.relisten=true; }catch(e){} }
    try{ r.start(); S.rec={r:r,box:box}; repaint(); }catch(e){ relisten(); say('Voice notes are not available here.'); }
  }
  function relisten(){ if(S.relisten&&window.KovaListen){ S.relisten=false; try{ KovaListen.set(true); }catch(e){} } }

  /* ================= 1. team chat ================= */
  function chat(){ var c=lsJ(CKEY,null); if(!c||!Array.isArray(c.msgs)) c={msgs:[],round:null}; return c; }
  function saveChat(c){ c.msgs=c.msgs.slice(-80); lsPut(CKEY,c); }
  function mentions(text){
    var t=String(text||''), L=mates(), out=[], re=/@([A-Za-z][\w'’-]*)/g, m;
    var all=/(^|\s)@(everyone|team|all)\b/i.test(t);
    while((m=re.exec(t))){
      var nm=m[1].toLowerCase().replace(/['’]s$/,'');
      var e=L.filter(function(x){ return x.n.toLowerCase()===nm; })[0];
      if(e&&out.indexOf(e)<0) out.push(e);
    }
    return {list:out.slice(0,6),all:all};
  }
  function said(m){
    var k=K(); if(!m) return '';
    if(m.who==='you') return 'You: '+m.t;
    if(m.who==='sys') return '';
    var e=k.emp(m.who), j=jobOf(m.job), t='';
    if(j){ t=j.say||''; if(j.report&&j.report.title) t+=(t?'\n':'')+'(Their report: '+j.report.title+(j.report.summary?' — '+short(j.report.summary,400):'')+')'; if(j.state==='waiting') t+=(t?' ':'')+'(waiting for the user’s OK)'; }
    return (e?e.n:'A teammate')+': '+short(t||'(no answer yet)',800);
  }
  function context(e,c,src,r){
    var i=c.msgs.indexOf(src), before=c.msgs.slice(Math.max(0,i-8),i), after=c.msgs.slice(i+1);
    var names=r.names.filter(function(n){ return n!==e.n; });
    return 'TEAM CHAT. You are '+e.n+', in a group chat with the user'+(names.length?' and your teammates '+names.join(', '):'')+'. Answer as yourself: a few short lines unless the job needs real work.\n'
      +(before.length?'\nEarlier in the chat:\n'+before.map(said).filter(Boolean).join('\n')+'\n':'')
      +'\nThe user’s message'+(r.all?' (to the whole team)':'')+':\n'+src.t+'\n'
      +(after.length?'\nWhat your teammates already answered:\n'+after.map(said).filter(Boolean).join('\n')+'\n\nBuild on that, add your part, and do not repeat it.\n':'')
      +(r.all&&e.tpl==='chief'?'\nThey asked everyone: use delegate to bring in the teammates who should answer, then give the combined answer.\n':'');
  }
  function send(text,box){
    var k=K(); text=String(text||'').trim(); if(!k||!text) return null;
    var c=chat();
    if(c.round&&c.round.left&&c.round.left.length){ say('The team is still answering. Wait for them, or stop it.'); return null; }
    var mm=mentions(text), who=mm.list.slice();
    if(mm.all){ var ch=mates().filter(function(e){ return e.tpl==='chief'; })[0]; if(ch&&who.indexOf(ch)<0) who.unshift(ch); }
    var P=(box&&S.pend[box])||[];
    var you={id:uid('m'),who:'you',t:text,at:Date.now(),files:P.map(function(f){ return {n:f.n,k:f.k,th:f.th||''}; })};
    c.msgs.push(you);
    if(!who.length){
      var r=k.route(text); if(!r){ c.msgs.pop(); say('Hire someone first.'); return null; }
      who=[r.emp]; c.msgs.push({id:uid('m'),who:'sys',t:'Kova gave it to '+r.emp.n+': '+r.why+'.',at:Date.now()});
    }
    S.roundFiles=P.length?P:null; if(box) S.pend[box]=[];
    c.round={from:you.id,left:who.map(function(e){ return e.id; }),names:who.map(function(e){ return e.n; }),all:mm.all};
    saveChat(c); track('team_chat',{mates:who.length});
    next();
    return you;
  }
  function next(){
    var k=K(), c=chat(), r=c.round; if(!k||!r) return;
    if(!r.left.length){ c.round=null; saveChat(c); S.roundFiles=null; repaint(); return; }
    var id=r.left.shift(), e=k.emp(id), src=c.msgs.filter(function(m){ return m.id===r.from; })[0];
    if(!src){ c.round=null; saveChat(c); return; }
    if(!e||!e.enabled){ c.msgs.push({id:uid('m'),who:'sys',t:(e?e.n+' is switched off':'That teammate is gone')+', so they did not answer.',at:Date.now()}); saveChat(c); return next(); }
    var job=k.start(e,src.t,'chat',{chat:src.id});
    if(!job){ c.msgs.push({id:uid('m'),who:'sys',t:e.n+' could not start on it.',at:Date.now()}); saveChat(c); return next(); }
    job.convo[0].content=context(e,c,src,r);
    if(S.roundFiles) attach(job,null,S.roundFiles); else k.saveJobs();
    c.msgs.push({id:uid('m'),who:e.id,job:job.id,at:Date.now()}); saveChat(c);
    var Q=k._S; Q.waits=Q.waits||{}; var prev=Q.waits[job.id];
    Q.waits[job.id]=function(j){ if(prev) prev(j); setTimeout(next,40); };
    repaint(); scrollChat();
  }
  function stopRound(){
    var k=K(), c=chat(); if(!c.round) return;
    var left=c.round.left.map(function(id){ var e=k.emp(id); return e?e.n:''; }).filter(Boolean);
    c.round.left=[]; c.round=null;
    var last=c.msgs.filter(function(m){ return m.job; }).slice(-1)[0], j=last&&jobOf(last.job);
    if(j&&/running|waiting|paused/.test(j.state)) k.stop(j.id);
    c.msgs.push({id:uid('m'),who:'sys',t:'You stopped it'+(left.length?'. Not asked: '+left.join(', '):'')+'.',at:Date.now()});
    saveChat(c); repaint();
  }
  /* after a reload a round cannot carry on: say who was not asked */
  function settleOld(){
    var c=chat(), r=c.round; if(!r) return;
    var last=c.msgs.filter(function(m){ return m.job; }).slice(-1)[0], j=last&&jobOf(last.job);
    if(j&&/running|waiting|paused/.test(j.state)) return;
    var k=K(), left=(r.left||[]).map(function(id){ var e=k&&k.emp(id); return e?e.n:''; }).filter(Boolean);
    c.round=null; if(left.length) c.msgs.push({id:uid('m'),who:'sys',t:'Kova was closed before '+left.join(', ')+' answered. Ask again.',at:Date.now()});
    saveChat(c);
  }
  function scrollChat(){ setTimeout(function(){ var t=document.querySelector('.tp-chat'); if(t&&t.lastElementChild&&t.lastElementChild.scrollIntoView) t.lastElementChild.scrollIntoView({block:'nearest'}); },60); }
  function withAt(t){ return esc(t).replace(/(^|\s)@([A-Za-z][\w'’-]*)/g,'$1<b class="tp-mn">@$2</b>').replace(/\n/g,'<br>'); }
  var STATE={running:'working',waiting:'needs your OK',paused:'paused, you stepped in',done:'',failed:'could not finish',stopped:'stopped'};
  function mateMsg(e,j,depth,from){
    var k=K(), st=STATE[j.state]||'', last=j.steps.filter(function(s){ return s.k!=='think'; }).slice(-1)[0];
    var body=j.state==='running'||j.state==='paused'?'<div class="tp-live"><span class="tp-dots" aria-hidden="true"><i></i><i></i><i></i></span>'+esc(last?last.t:'Reading it')+'</div>'
      :j.state==='waiting'?'<div class="tp-say">'+md(j.say||'I have something for you to approve.')+'</div><button class="crd-btn tp-sm" data-c="nav" data-n="approvals">Review it</button>'
      :j.state==='done'?'<div class="tp-say">'+md(j.say||(j.report?'Here is the report.':'Done.'))+'</div>'+(j.report?'<button class="crd-link" data-tp="openjob" data-j="'+esc(j.id)+'">Open the report: '+esc(short(j.report.title,60))+'</button>':'')
      :'<div class="tp-say">'+esc(j.note||'This one did not finish.')+'</div>';
    var kids=depth<3?k.jobsOf().filter(function(x){ return x.meta&&x.meta.parent===j.id; }):[];
    return '<div class="tp-m mate">'+k.av(e)+'<div class="tp-b"><div class="tp-who"><b>'+esc(e.n)+'</b><span>'+esc(e.title)+(from?' · handed over by '+esc(from):'')+(st?' · '+st:'')+'</span></div>'+body+'</div></div>'
      +kids.map(function(x){ var ke=k.emp(x.emp); return ke?mateMsg(ke,x,depth+1,e.n):''; }).join('');
  }
  function msg(m){
    var k=K();
    if(m.who==='you') return '<div class="tp-m you"><div class="tp-b">'+withAt(m.t)+(m.files&&m.files.length?'<div class="tp-pend in">'+m.files.map(function(f){ return chip(f,null); }).join('')+'</div>':'')+'</div></div>';
    if(m.who==='sys') return '<div class="tp-m sys">'+esc(m.t)+'</div>';
    var e=k.emp(m.who), j=jobOf(m.job);
    if(!e) return '';
    if(!j) return '<div class="tp-m mate">'+k.av(e)+'<div class="tp-b"><div class="tp-who"><b>'+esc(e.n)+'</b></div><div class="tp-say tp-soft">This answer is no longer kept (Kova keeps the last 50 jobs).</div></div></div>';
    return mateMsg(e,j,0,'');
  }
  var TRY=['@everyone what should I focus on today?','@Sage @Maya plan this week’s posts around my training','@Ravi what did my competitors post this week?'];
  function chatPage(){
    var k=K(), c=chat(), L=mates(), r=c.round, busy=!!(r&&(r.left.length||c.msgs.some(function(m){ var j=m.job&&jobOf(m.job); return j&&/running|paused/.test(j.state); })));
    var lastAt=c.msgs.length?c.msgs[c.msgs.length-1].at:0;
    var tr=TRY.filter(function(t){ return mentions(t).list.length||/@everyone/.test(t); });
    return k.head(lastAt,'Team chat',c.msgs.length?'Updated '+ago(lastAt):'Several teammates in one conversation')
      +'<div class="tp-chat" role="log" aria-label="Team chat">'+(c.msgs.length?c.msgs.map(msg).join('')
        :'<div class="crd-card tp-hello"><b>Ask several teammates at once.</b><span>Type @ and a name, or @everyone. Each one answers in turn and sees what the others said. With no @, Kova picks who owns it.</span>'
          +'<div class="tp-tries">'+tr.map(function(t){ return '<button class="crd-pill" data-tp="try" data-q="'+esc(t)+'">'+esc(t)+'</button>'; }).join('')+'</div></div>')+'</div>'
      +'<div class="crd-card tp-cbox">'
        +'<div class="tp-at" role="group" aria-label="Add a teammate to the message"><button class="tp-chip" data-tp="at" data-n="everyone">@everyone</button>'
          +L.map(function(e){ return '<button class="tp-chip" data-tp="at" data-n="'+esc(e.n)+'">'+k.av(e)+'@'+esc(e.n)+'</button>'; }).join('')+'</div>'
        +'<div class="crw-ask"><textarea id="tpChat" rows="2" placeholder="@Sage @Maya plan this week’s posts around my training" aria-label="Message the team"></textarea>'
          +tools('tpChat')+'<button class="crw-send" data-tp="chatsend" aria-label="Send"'+(busy?' disabled':'')+'>'+IC.send+'</button></div>'
        +pend('tpChat')
        +'<div class="tp-crow">'+(busy?'<span class="tp-hint">The team is answering…</span><button class="crw-link" data-tp="chatstop">Stop</button>':'<span class="tp-hint">Anything that leaves Kova waits for your OK.</span>')
          +(c.msgs.length&&!busy?'<button class="crw-link" data-tp="chatclear">Clear the chat</button>':'')+'</div>'
      +'</div>';
  }

  /* ================= 2. do it again, saved skills, schedules ================= */
  function skillsOf(e){ return (e&&e.skills||[]).filter(function(x){ return x&&x.text; }); }
  function saveSkill(e,text,name,from,idv){
    var L=skillsOf(e).slice(), ex=L.filter(function(x){ return idv?x.id===idv:x.text===text; })[0];
    if(ex) return ex;
    var sk={id:idv||uid('k'),name:short(name||String(text).split('\n')[0],60),text:String(text).slice(0,4000),at:Date.now(),from:from||''};
    L.push(sk); save(e,{skills:L.slice(-20)}); return sk;
  }
  function setEvery(e,skId,v){
    var L=skillsOf(e).map(function(x){ return x.id!==skId?x:Object.assign({},x,{every:v||null,last:v?Date.now():x.last}); });
    save(e,{skills:L}); var k=K(); if(k&&k.syncCloud) k.syncCloud();
  }
  function dropSkill(e,skId){ save(e,{skills:skillsOf(e).filter(function(x){ return x.id!==skId; })}); var k=K(); if(k&&k.syncCloud) k.syncCloud(); }
  function runSkill(e,sk){
    var k=K(); if(!k||!e||!sk) return null;
    if(!e.enabled){ say(e.n+' is switched off.'); return null; }
    if(k.busy(e.id)){ say(e.n+' is already working.'); return null; }
    var j=k.start(e,sk.text,'skill',{skill:sk.id});
    k._S.view='team'; k._S.nav='team'; k._S.tab=e.id; k._S.scroll=true; repaint();
    return j;
  }
  function pickHtml(key,v){
    var p=S.pv[key]||{freq:(v&&v.freq)||'daily',time:(v&&v.time)||'09:00',dow:v&&v.dow!=null?+v.dow:1,cloud:v?!!v.cloud:server()};
    S.pv[key]=p;
    var opt=function(val,l,cur){ return '<option value="'+val+'"'+(String(cur)===String(val)?' selected':'')+'>'+l+'</option>'; };
    return '<div class="tp-pick" data-key="'+esc(key)+'">'
      +'<label>How often<select data-tpf="freq">'+opt('daily','Every day',p.freq)+opt('weekdays','Weekdays',p.freq)+opt('weekly','Once a week',p.freq)+'</select></label>'
      +(p.freq==='weekly'?'<label>Day<select data-tpf="dow">'+[1,2,3,4,5,6,0].map(function(d){ return opt(d,DAYS[d],p.dow); }).join('')+'</select></label>':'')
      +'<label>Time<input type="time" data-tpf="time" value="'+esc(p.time)+'"></label>'
      +'<label class="tp-chk"><input type="checkbox" data-tpf="cloud"'+(p.cloud?' checked':'')+(server()?'':' disabled')+'> Also while Kova is closed'+(server()?'':' (sign in first)')+'</label>'
      +'<div class="crd-row"><button class="crd-btn tp-sm" data-tp="picksave" data-key="'+esc(key)+'">Save</button><button class="crd-btn ghost tp-sm" data-tp="pickcancel">Cancel</button>'
      +(v&&v.freq?'<button class="crd-btn ghost tp-sm" data-tp="pickoff" data-key="'+esc(key)+'">Stop repeating</button>':'')+'</div></div>';
  }
  function again(j){
    var k=K(); if(!k||!j||j.state!=='done'||j.brain==='taught'||/^Watch https?:/.test(j.text||'')) return '';
    var e=k.emp(j.emp); if(!e) return '';
    var sk=skillsOf(e).filter(function(x){ return x.text===j.text; })[0], key='j:'+j.id;
    return '<div class="tp-again"><button class="crw-link" data-tp="redo" data-j="'+esc(j.id)+'">Do it again</button>'
      +(sk?'<span class="tp-saved">Saved as a skill'+(sk.every?' · '+esc(every(sk.every)):'')+'</span>':'<button class="crw-link" data-tp="saveskill" data-j="'+esc(j.id)+'">Save as a skill</button>')
      +'<button class="crw-link" data-tp="pick" data-key="'+esc(key)+'" aria-expanded="'+(S.pick===key)+'">'+(sk&&sk.every?'Change when it repeats':'Make it a routine')+'</button></div>'
      +(S.pick===key?pickHtml(key,sk&&sk.every):'');
  }
  function skillRows(e,withWho){
    var k=K();
    return skillsOf(e).map(function(sk){ var key='s:'+e.id+':'+sk.id;
      return '<div class="tp-sk"><div class="tp-skt">'+(withWho?k.av(e):'')+'<div><b>'+esc(sk.name)+'</b><span>'+(withWho?esc(e.n)+' · ':'')+esc(every(sk.every))+(sk.last&&sk.every?' · last ran '+esc(ago(sk.last)):'')+'</span></div></div>'
        +'<div class="tp-ska"><button class="crd-btn tp-sm" data-tp="skrun" data-e="'+esc(e.id)+'" data-k="'+esc(sk.id)+'">Run</button>'
        +'<button class="crd-btn ghost tp-sm" data-tp="pick" data-key="'+esc(key)+'" aria-expanded="'+(S.pick===key)+'">'+(sk.every?'Change':'Repeat')+'</button>'
        +'<button class="crw-link" data-tp="skdrop" data-e="'+esc(e.id)+'" data-k="'+esc(sk.id)+'" aria-label="Remove the skill '+esc(sk.name)+'">Remove</button></div>'
        +(S.pick===key?pickHtml(key,sk.every):'')+'</div>'; }).join('');
  }
  /* saved skills on a schedule run here while Kova is open (the server
     runs the ones marked "also while closed" when it is not) */
  function tick(){
    var k=K(); if(!k||!k.slot) return; var now=Date.now();
    mates().forEach(function(e){ skillsOf(e).forEach(function(sk){
      var v=sk.every; if(!v||!v.freq) return;
      var at=k.slot({routine:{freq:v.freq,time:v.time,dow:v.dow,job:sk.text},lastRoutine:+sk.last||0},now);
      if(at==null||k.busy(e.id)) return;
      save(e,{skills:skillsOf(k.emp(e.id)).map(function(x){ return x.id===sk.id?Object.assign({},x,{last:now}):x; })});
      k.start(k.emp(e.id),sk.text,'skill',{skill:sk.id});
    }); });
  }

  /* ================= 4. meet your team, ready-made routines ================= */
  var STARTERS={
    brief:{tpl:'chief',name:'Morning brief',every:{freq:'daily',time:'07:00'},text:'Morning brief: my meetings today, what is due and what is overdue, what is at risk, and the one thing to do first. Numbers first, five short lines.'},
    train:{tpl:'training',name:'Today’s training',every:{freq:'daily',time:'07:00'},text:'Tell me what to train today and how hard, from my recovery.'},
    inbox:{tpl:'inbox',name:'Inbox sweep',every:{freq:'weekdays',time:'09:00'},text:'Inbox sweep: who is waiting on a reply from me and who I am waiting on. Draft the follow-ups for my OK.'},
    comments:{tpl:'social',name:'Comments roundup',every:{freq:'weekly',dow:1,time:'09:00'},text:'Comments roundup: what people said on my posts this past week (what they loved, asked and complained about) and replies for the top three.'},
    plan:{tpl:'pm',name:'Plan my week',every:{freq:'weekly',dow:1,time:'08:00'},text:'Plan my week: what is due, what is late, and a realistic order to do it in, with new dates for anything that will slip.'}
  };
  var NEEDS=[
    {k:'train',l:'Training',tpl:'training',first:'What should I train today, and how hard?',st:'train'},
    {k:'food',l:'Food',tpl:'nutrition',first:'How is my eating today against my target?',st:'own'},
    {k:'sleep',l:'Sleep',tpl:'sleep',first:'How did I sleep last night, and what is the one thing to do tonight?',st:'own'},
    {k:'post',l:'Posting',tpl:'social',first:'What should I post this week?',st:'comments'},
    {k:'inbox',l:'Follow-ups',tpl:'inbox',first:'Who is waiting on a reply from me?',st:'inbox'},
    {k:'plan',l:'Planning my day',tpl:'chief',first:'Brief me on today.',st:'brief'},
    {k:'research',l:'Competitors',tpl:'research',first:'What did my competitors post and price this week?',st:'watch'}
  ];
  function starterOn(k0){ var st=STARTERS[k0], e=st&&byTpl(st.tpl); if(!e) return false; var sk=skillsOf(e).filter(function(x){ return x.id==='st_'+k0; })[0]; return !!(sk&&sk.every); }
  function setStarter(k0,on){
    var st=STARTERS[k0], e=st&&byTpl(st.tpl); if(!e) return false;
    if(on){ saveSkill(e,st.text,st.name,'starter','st_'+k0); setEvery(K().emp(e.id),'st_'+k0,Object.assign({},st.every,{cloud:server()})); }
    else dropSkill(e,'st_'+k0);
    return true;
  }
  function needLine(n,e){
    if(n.st==='own'){ var r=e.routine||{}; return r.freq&&r.freq!=='off'?'Routine: '+K().describeRoutine(e):'Turns on their routine'; }
    if(n.st==='watch') return 'Then: watch a competitor’s page for changes';
    var st=STARTERS[n.st]; return st?st.name+': '+every(st.every).replace(', also while Kova is closed',''):'';
  }
  function meetShown(){ var k=K(); return !!k&&!lsJ(MKEY,null)&&k.jobsOf().length===0&&mates().length>0; }
  function meet(){
    if(!meetShown()) return '';
    var k=K(), pk=NEEDS.filter(function(n){ return S.sel.indexOf(n.k)>=0&&byTpl(n.tpl); });
    var seen=[], rows=pk.filter(function(n){ var e=byTpl(n.tpl); if(seen.indexOf(e.id)>=0) return false; seen.push(e.id); return true; });
    var first=rows[0]&&byTpl(rows[0].tpl);
    return '<div class="crd-card tp-meet"><div class="crd-chd"><span>Meet your team</span><small>What do you want help with? Kova picks the teammates and gives each one a first job.</small></div>'
      +'<div class="tp-needs" role="group" aria-label="What you want help with">'+NEEDS.filter(function(n){ return byTpl(n.tpl); }).map(function(n){ var on=S.sel.indexOf(n.k)>=0;
        return '<button class="crd-pill'+(on?' on':'')+'" data-tp="need" data-k="'+n.k+'" aria-pressed="'+on+'">'+esc(n.l)+'</button>'; }).join('')+'</div>'
      +(rows.length?'<div class="tp-meetl">'+rows.map(function(n){ var e=byTpl(n.tpl);
        return '<div class="tp-mrow">'+k.av(e)+'<div><b>'+esc(e.n)+'</b> <span>'+esc(e.title)+'</span><small>First job: “'+esc(n.first)+'”</small><small>'+esc(needLine(n,e))+'</small></div></div>'; }).join('')+'</div>':'')
      +'<div class="crd-row"><button class="crd-btn" data-tp="meetgo"'+(rows.length?'':' disabled')+'>'+(first?'Start with '+esc(first.n):'Pick one or more')+'</button><button class="crd-btn ghost" data-tp="meetskip">Not now</button></div>'
      +'<div class="tp-hint">The ready-made routines stay on the Routines page, where you can turn them on or off.</div></div>';
  }
  function meetGo(){
    var k=K(), pk=NEEDS.filter(function(n){ return S.sel.indexOf(n.k)>=0&&byTpl(n.tpl); }); if(!k||!pk.length) return null;
    pk.forEach(function(n){ var e=byTpl(n.tpl);
      if(n.st==='own'){ var r=e.routine||{}; if(!r.freq||r.freq==='off') k.setRoutine(e.id,true); }
      else if(STARTERS[n.st]) setStarter(n.st,true); });
    lsPut(MKEY,{at:Date.now(),sel:S.sel.slice()}); track('team_meet',{needs:S.sel.length});
    var n0=pk[0], e0=byTpl(n0.tpl), j=k.start(e0,n0.first,'you');
    S.sel=[]; k.openMate(e0.id);
    if(n0.st==='watch') setTimeout(function(){ var w=document.getElementById('tpWatch'); if(w&&w.scrollIntoView) w.scrollIntoView({block:'center'}); },400);
    return j;
  }
  function routinesExtra(){
    var k=K();
    var st=Object.keys(STARTERS).map(function(id){ var s=STARTERS[id], e=byTpl(s.tpl); if(!e) return ''; var on=starterOn(id);
      return '<div class="tp-st"><div class="tp-skt">'+k.av(e)+'<div><b>'+esc(s.name)+'</b><span>'+esc(e.n)+' · '+esc(every(s.every).replace(', also while Kova is closed',''))+(on&&server()?' · also while closed':'')+'</span><small>'+esc(s.text)+'</small></div></div>'
        +'<button class="crw-tog'+(on?' on':'')+'" data-tp="starter" data-k="'+id+'" role="switch" aria-checked="'+on+'" aria-label="'+esc(s.name)+'"><span></span></button></div>'; }).join('');
    var rv=byTpl('research');
    if(rv) st+='<div class="tp-st"><div class="tp-skt">'+k.av(rv)+'<div><b>Watch a page</b><span>'+esc(rv.n)+' · every 6 hours</span><small>A competitor’s prices, a job board, a changelog: you hear only what changed.</small></div></div>'
      +'<button class="crd-btn ghost tp-sm" data-tp="openwatch" data-e="'+esc(rv.id)+'">'+((rv.watches||[]).length?(rv.watches.length+' watched'):'Set it up')+'</button></div>';
    var mine=mates().filter(function(e){ return skillsOf(e).some(function(x){ return x.every&&!/^st_/.test(x.id); }); });
    var sched=mine.map(function(e){ var keep=Object.assign({},e,{skills:skillsOf(e).filter(function(x){ return x.every&&!/^st_/.test(x.id); })}); return skillRows(keep,true); }).join('');
    return '<div class="crd-card tp-starters"><div class="crd-chd"><span>Ready-made routines</span><small>Switch one on and that teammate does it on schedule'+(server()?', on the Kova server when Kova is closed':'')+'.</small></div>'+st+'</div>'
      +(sched?'<div class="crd-card"><div class="crd-chd"><span>Your saved skills on a schedule</span><small>From “Make it a routine” on a finished job</small></div>'+sched+'</div>':'');
  }

  /* ================= 5. watch a page ================= */
  function host(u){ try{ return new URL(u).hostname.replace(/^www\./,''); }catch(e){ return u; } }
  function normUrl(u){ u=String(u||'').trim(); if(!u) return ''; if(!/^https?:\/\//i.test(u)) u='https://'+u; try{ var x=new URL(u); return /\./.test(x.hostname)?x.href:''; }catch(e){ return ''; } }
  function watchCard(e){
    var L=e.watches||[], ok=server();
    return '<div class="crd-card tp-watch" id="tpWatch"><div class="crd-chd"><span>Watch a page</span><small>'+esc(e.n)+' reads it every 6 hours on the Kova server and tells you only what changed.</small></div>'
      +(ok?'':'<div class="crw-note">Watching pages needs you signed in to Kova.</div>')
      +'<div class="tp-wf"><input id="tpWUrl" type="url" inputmode="url" placeholder="competitor.com/pricing" aria-label="The page to watch"><input id="tpWNote" placeholder="What to watch for, e.g. prices (optional)" aria-label="What to watch for">'
      +'<button class="crd-btn tp-sm" data-tp="watchadd" data-e="'+esc(e.id)+'"'+(ok?'':' disabled')+'>Watch it</button></div>'
      +(L.length?'<div class="tp-wl">'+L.map(function(x){ var busy=S.checking===x.id;
        return '<div class="tp-wr"><div><b>'+esc(host(x.url))+'</b><span>'+(x.note?'For: '+esc(x.note)+' · ':'')+(x.last?'Checked '+esc(ago(x.last)):'Not checked yet')+'</span>'+(x.res?'<small>'+esc(x.res)+'</small>':'')+'</div>'
          +'<div class="tp-ska"><button class="crd-btn ghost tp-sm" data-tp="watchcheck" data-e="'+esc(e.id)+'" data-w="'+esc(x.id)+'"'+(ok&&!busy?'':' disabled')+'>'+(busy?'Reading…':'Check now')+'</button>'
          +'<button class="crw-link" data-tp="watchdrop" data-e="'+esc(e.id)+'" data-w="'+esc(x.id)+'" aria-label="Stop watching '+esc(host(x.url))+'">Stop</button></div></div>'; }).join('')+'</div>':'')
      +'</div>';
  }
  function setWatch(e,id,patch){ save(e,{watches:(e.watches||[]).map(function(x){ return x.id===id?Object.assign({},x,patch):x; })}); }
  function addWatch(e,url,note){
    var u=normUrl(url); if(!u){ say('That does not look like a web address.'); return null; }
    var L=(e.watches||[]).slice(); if(L.some(function(x){ return x.url===u; })){ say('Already watching that page.'); return null; }
    if(L.length>=10){ say('Ten pages at most. Stop one first.'); return null; }
    var x={id:uid('w'),url:u,note:String(note||'').trim().slice(0,120),at:Date.now()}; L.push(x); save(e,{watches:L});
    var k=K(); if(k&&k.syncCloud) k.syncCloud();
    track('team_watch',{});
    return x;
  }
  function checkWatch(e,id){
    var x=(e.watches||[]).filter(function(w){ return w.id===id; })[0];
    if(!x) return Promise.resolve(null);
    if(!(window.KovaLink&&KovaLink.authFetch)||!server()){ setWatch(e,id,{res:'Sign in to Kova to have pages read.'}); repaint(); return Promise.resolve(null); }
    S.checking=id; repaint();
    return KovaLink.authFetch('/crew/watch/check',{json:{id:x.id,url:x.url,emp:e.id,note:x.note||''}}).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error||'Kova could not read it.'); return j; }); })
      .then(function(j){
        var res=j.error?'Could not read it: '+j.error:j.first?'Kova saved how it looks now. You will hear when it changes.':j.changed?'It changed: '+j.added+' new, '+j.removed+' gone. The report is in '+e.n+'’s jobs.':'No change since '+(j.since?ago(j.since):'the last check')+'.';
        S.checking=null; setWatch(K().emp(e.id),id,{last:Date.now(),res:res}); repaint();
        if(j.changed&&K().pullCloud) K().pullCloud();
        return j;
      },function(err){ S.checking=null; setWatch(K().emp(e.id),id,{res:err.message}); repaint(); return null; });
  }
  function mateExtra(e){
    var sk=skillsOf(e);
    return (sk.length?'<div class="crd-card"><div class="crd-chd"><span>Saved skills</span><small>Jobs you kept. One tap runs them again.</small></div>'+skillRows(e,false)+'</div>':'')
      +(e.tpl==='research'||(e.watches||[]).length?watchCard(e):'');
  }

  /* ================= 6. search ================= */
  function list(){
    var k=K(), out=[]; if(!k) return out;
    k.jobsOf().slice(-50).forEach(function(j){ var e=k.emp(j.emp); if(!e) return; var r=j.report||{};
      out.push({kind:'job',ref:j.id,t:short(r.title||String(j.text||'').split('\n')[0],80),s:e.n+(r.title?' · report':'')+' · '+ago(j.end||j.at),text:String(j.text||'').split('\n')[0]+' '+(r.title||''),words:(j.say||'')+' '+(r.summary||'')+' '+e.n+' '+e.title,at:j.end||j.at}); });
    mates().forEach(function(e){
      skillsOf(e).forEach(function(sk){ out.push({kind:'mate',ref:e.id,t:'Saved skill: '+sk.name,s:e.n+' · '+every(sk.every),text:sk.name,words:sk.text+' '+e.n}); });
      var r=e.routine||{}; if(r.freq&&r.freq!=='off'&&r.job) out.push({kind:'routine',ref:e.id,t:'Routine: '+short(r.job,70),s:e.n+' · '+k.describeRoutine(e),text:r.job,words:e.n+' routine'});
      (e.watches||[]).forEach(function(x){ out.push({kind:'watch',ref:e.id,t:'Watching '+host(x.url),s:e.n+(x.last?' · checked '+ago(x.last):''),text:host(x.url)+' '+(x.note||''),words:x.url+' watch page'}); });
    });
    return out;
  }
  function openJob(id){
    var k=K(), j=jobOf(id); if(!k||!j) return false;
    if(window.go) try{ go('workteam'); }catch(x){}
    setTimeout(function(){
      k.openMate(j.emp);
      setTimeout(function(){
        var el=document.getElementById('job-'+id);
        if(!el){ k._S.nav='jobs'; k._S.tab='all'; repaint(); el=document.getElementById('job-'+id); }
        if(el){ if(el.scrollIntoView) el.scrollIntoView({block:'center'}); el.classList.add('tp-flash'); setTimeout(function(){ el.classList.remove('tp-flash'); },1600); }
      },260);
    },140);
    return true;
  }
  function open(kind,ref){
    var k=K(); if(!k) return;
    if(kind==='job') return openJob(ref);
    if(window.go) try{ go('workteam'); }catch(x){}
    setTimeout(function(){ if(kind==='routine'){ k._S.nav='routines'; k._S.view='team'; repaint(); } else { k.openMate(ref); if(kind==='watch') setTimeout(function(){ var w=document.getElementById('tpWatch'); if(w&&w.scrollIntoView) w.scrollIntoView({block:'center'}); },300); } },140);
  }

  /* ================= 7. share into Kova ================= */
  var SHARE_CACHE='kova-share';
  function readShared(){
    if(!('caches' in window)) return Promise.resolve(null);
    return caches.open(SHARE_CACHE).then(function(c){
      return c.match('share-in/meta').then(function(r){ return r?r.json():null; }).then(function(meta){
        if(!meta) return null;
        return Promise.all((meta.files||[]).map(function(f,i){ return c.match('share-in/file/'+i).then(function(r){ return r?r.blob():null; }).then(function(b){ return b?new File([b],f.name||('shared-'+(i+1)),{type:f.type||b.type}):null; }); }))
          .then(function(F){ return {title:meta.title||'',text:meta.text||'',url:meta.url||'',files:F.filter(Boolean),at:meta.at||Date.now()}; });
      });
    }).catch(function(){ return null; });
  }
  function clearShared(){ if('caches' in window) try{ caches.delete(SHARE_CACHE); }catch(e){} }
  function shareText(s){ return [s.title,s.text,s.url&&String(s.text||'').indexOf(s.url)<0?s.url:''].filter(Boolean).join('\n').trim(); }
  function shareSheet(){
    var s=S.share, k=K(); if(!s||!k) return;
    var old=document.getElementById('tpShare'); if(old) old.remove();
    var el=document.createElement('div'); el.id='tpShare'; el.className='tp-sheet'; el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); el.setAttribute('aria-label','Shared to Kova');
    var t=shareText(s);
    el.innerHTML='<div class="tp-shb crw"><div class="crd-chd"><span>Shared to Kova</span><button class="crw-link" data-tp="shareclose">Close</button></div>'
      +(t?'<div class="tp-shp">'+esc(short(t,400))+'</div>':'')
      +(s.files.length?'<div class="tp-pend in">'+s.files.map(function(f){ return '<span class="tp-file"><i>'+IC.doc+'</i><span>'+esc(f.name)+'</span></span>'; }).join('')+'</div>':'')
      +'<div class="tp-shh">Send it to</div><div class="tp-at"><button class="tp-chip" data-tp="shareto" data-e="chat">Team chat</button>'
      +mates().map(function(e){ return '<button class="tp-chip" data-tp="shareto" data-e="'+esc(e.id)+'">'+k.av(e)+esc(e.n)+'</button>'; }).join('')+'</div>'
      +(t?'<div class="crd-row"><button class="crd-btn ghost tp-sm" data-tp="sharetask">Add it as a task</button></div>':'')+'</div>';
    document.body.appendChild(el);
    var b=el.querySelector('.tp-chip'); if(b) try{ b.focus(); }catch(e){}
  }
  function shareTo(target){
    var s=S.share, k=K(); if(!s||!k) return;
    var box=target==='chat'?'tpChat':'crwEmpAsk', t=shareText(s);
    closeShare();
    if(window.go) try{ go('workteam'); }catch(x){}
    setTimeout(function(){
      if(target==='chat'){ k._S.view='team'; k._S.nav='chat'; repaint(); } else k.openMate(target);
      var fill=function(){ var ta=document.getElementById(box); if(ta){ ta.value=t; try{ ta.focus({preventScroll:true}); }catch(x){} } };
      fill();
      (s.files.length?addFiles(box,s.files):Promise.resolve()).then(fill);
    },160);
  }
  function shareTask(){
    var s=S.share, w=W(); if(!s||!w) return;
    var name=short(s.title||s.text||s.url||'Shared item',90);
    w.create('items',{name:name,status:'Not Started',priority:'Medium',notes:[s.text,s.url].filter(Boolean).join('\n').slice(0,2000),checklist:[]},'user');
    closeShare(); say('Added as a task: '+name);
    try{ if(window.__workDraw) __workDraw.refresh(); }catch(x){}
  }
  function closeShare(){ var el=document.getElementById('tpShare'); if(el) el.remove(); S.share=null; clearShared(); }
  function checkShare(){
    if(!/[?&]shared=1\b/.test(location.search)) return Promise.resolve(null);
    try{ history.replaceState(null,'',location.pathname+location.hash); }catch(e){}
    return readShared().then(function(s){ if(!s||(!s.files.length&&!shareText(s))) return null; S.share=s; track('share_in',{files:s.files.length}); shareSheet(); return s; });
  }

  /* ================= clicks and fields ================= */
  function onClick(ev){
    var b=ev.target.closest&&ev.target.closest('[data-tp]'); if(!b||b.disabled) return;
    var c=b.getAttribute('data-tp'), k=K(); if(!k) return;
    ev.__crwInside=true;
    var box=b.getAttribute('data-box'), e=b.getAttribute('data-e')?k.emp(b.getAttribute('data-e')):null, jid=b.getAttribute('data-j'), key=b.getAttribute('data-key');
    if(c==='attach'){ picker(box); return; }
    if(c==='unattach'){ (S.pend[box]||[]).splice(+b.getAttribute('data-i'),1); repaint(); return; }
    if(c==='mic'){ mic(box); return; }
    if(c==='at'){ var ta=document.getElementById('tpChat'); if(ta){ var tag='@'+b.getAttribute('data-n')+' '; if(ta.value.indexOf(tag.trim())<0) ta.value=(ta.value&&!/\s$/.test(ta.value)?ta.value+' ':ta.value)+tag; try{ ta.focus(); }catch(x){} } return; }
    if(c==='try'){ var t2=document.getElementById('tpChat'); if(t2){ t2.value=b.getAttribute('data-q'); try{ t2.focus(); }catch(x){} } return; }
    if(c==='chatsend'){ var t3=document.getElementById('tpChat'); if(!t3||!t3.value.trim()) return; var v=t3.value; if(send(v,'tpChat')){ t3.value=''; k._S.clear={tpChat:1}; repaint(); scrollChat(); } return; }
    if(c==='chatstop'){ stopRound(); return; }
    if(c==='chatclear'){ lsPut(CKEY,{msgs:[],round:null}); repaint(); return; }
    if(c==='openjob'){ openJob(jid); return; }
    if(c==='redo'){ var j=jobOf(jid), ej=j&&k.emp(j.emp); if(ej){ if(k.busy(ej.id)){ say(ej.n+' is already working.'); return; } k.start(ej,j.text,'you'); k._S.view='team'; k._S.nav='team'; k._S.tab=ej.id; k._S.scroll=true; repaint(); } return; }
    if(c==='saveskill'){ var j2=jobOf(jid), es=j2&&k.emp(j2.emp); if(es){ var sk=saveSkill(es,j2.text,null,j2.id); say('Saved as '+es.n+'’s skill: '+sk.name); repaint(); } return; }
    if(c==='pick'){ S.pick=S.pick===key?null:key; if(!S.pick) delete S.pv[key]; repaint(); return; }
    if(c==='pickcancel'){ if(S.pick) delete S.pv[S.pick]; S.pick=null; repaint(); return; }
    if(c==='picksave'||c==='pickoff'){
      var p=S.pv[key]||{}, tgt=target(key); if(!tgt){ S.pick=null; repaint(); return; }
      var v2=c==='pickoff'?null:{freq:p.freq||'daily',time:/^\d{1,2}:\d{2}$/.test(p.time||'')?p.time:'09:00',dow:p.freq==='weekly'?+p.dow:undefined,cloud:!!p.cloud&&server()};
      if(v2&&v2.dow===undefined) delete v2.dow;
      setEvery(k.emp(tgt.e.id),tgt.sk.id,v2); S.pick=null; delete S.pv[key];
      say(v2?tgt.e.n+' will do it '+every(v2).toLowerCase()+'.':'It no longer repeats.'); repaint(); return;
    }
    if(c==='skrun'){ var sk2=skillsOf(e).filter(function(x){ return x.id===b.getAttribute('data-k'); })[0]; runSkill(e,sk2); return; }
    if(c==='skdrop'){ dropSkill(e,b.getAttribute('data-k')); repaint(); return; }
    if(c==='need'){ var nk=b.getAttribute('data-k'), i=S.sel.indexOf(nk); if(i>=0) S.sel.splice(i,1); else S.sel.push(nk); repaint(); return; }
    if(c==='meetgo'){ meetGo(); return; }
    if(c==='meetskip'){ lsPut(MKEY,{at:Date.now(),skipped:true}); S.sel=[]; repaint(); return; }
    if(c==='starter'){ var sid=b.getAttribute('data-k'), on=!starterOn(sid); setStarter(sid,on); var st=STARTERS[sid]; say(on?st.name+' is on: '+every(st.every).replace(', also while Kova is closed','').toLowerCase()+'.':st.name+' is off.'); repaint(); return; }
    if(c==='openwatch'){ if(e){ k.openMate(e.id); setTimeout(function(){ var w=document.getElementById('tpWatch'), u=document.getElementById('tpWUrl'); if(w&&w.scrollIntoView) w.scrollIntoView({block:'center'}); if(u) try{ u.focus({preventScroll:true}); }catch(x){} },300); } return; }
    if(c==='watchadd'){ var u=document.getElementById('tpWUrl'), n=document.getElementById('tpWNote'); var x=e&&addWatch(e,u&&u.value,n&&n.value); if(x){ k._S.clear={tpWUrl:1,tpWNote:1}; if(u) u.value=''; if(n) n.value=''; repaint(); checkWatch(k.emp(e.id),x.id); } return; }
    if(c==='watchcheck'){ if(e) checkWatch(e,b.getAttribute('data-w')); return; }
    if(c==='watchdrop'){ if(e){ save(e,{watches:(e.watches||[]).filter(function(x){ return x.id!==b.getAttribute('data-w'); })}); if(k.syncCloud) k.syncCloud(); repaint(); } return; }
    if(c==='shareto'){ shareTo(b.getAttribute('data-e')); return; }
    if(c==='sharetask'){ shareTask(); return; }
    if(c==='shareclose'){ closeShare(); return; }
  }
  /* "j:<job>" (a finished job) or "s:<emp>:<skill>" (a saved skill) */
  function target(key){
    var k=K(), m=/^j:(.+)$/.exec(key||''), n=/^s:([^:]+):(.+)$/.exec(key||'');
    if(m){ var j=jobOf(m[1]), e=j&&k.emp(j.emp); if(!e) return null; return {e:e,sk:saveSkill(e,j.text,null,j.id)}; }
    if(n){ var e2=k.emp(n[1]), sk=e2&&skillsOf(e2).filter(function(x){ return x.id===n[2]; })[0]; return sk?{e:e2,sk:sk}:null; }
    return null;
  }
  function onField(ev){
    var f=ev.target&&ev.target.getAttribute&&ev.target.getAttribute('data-tpf'); if(!f) return;
    var wrap=ev.target.closest('.tp-pick'), key=wrap&&wrap.getAttribute('data-key'); if(!key) return;
    var p=S.pv[key]=S.pv[key]||{}; p[f]=ev.target.type==='checkbox'?ev.target.checked:ev.target.value;
    if(f==='freq'&&ev.type==='change') repaint();
  }
  function onKey(ev){
    if(ev.key==='Enter'&&!ev.shiftKey&&ev.target&&ev.target.id==='tpChat'){ ev.preventDefault(); var b=document.querySelector('[data-tp="chatsend"]'); if(b) b.click(); }
    if(ev.key==='Escape'&&document.getElementById('tpShare')) closeShare();
  }
  /* a photo dropped or pasted into a message box goes with it */
  function onPaste(ev){
    var t=ev.target, id=t&&t.id; if(!/^(tpChat|crwEmpAsk|crwAsk)$/.test(id||'')) return;
    var F=[].slice.call((ev.clipboardData&&ev.clipboardData.files)||[]); if(!F.length) return;
    ev.preventDefault(); addFiles(id,F);
  }

  function mount(){
    if(S.mounted) return; S.mounted=true;
    document.addEventListener('click',onClick);
    document.addEventListener('change',onField); document.addEventListener('input',onField);
    document.addEventListener('keydown',onKey); document.addEventListener('paste',onPaste);
    settleOld();
    setInterval(tick,60e3); setTimeout(tick,6000);
    setTimeout(checkShare,900);
    var k=K(); if(k&&k.paint) setTimeout(repaint,50);
  }
  function boot(){ if(window.KovaCrew&&window.WorkOS) mount(); else if((S.tries=(S.tries||0)+1)<60) setTimeout(boot,250); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();

  return {chatPage:chatPage,again:again,files:files,tools:tools,pend:pend,attach:attach,meet:meet,routinesExtra:routinesExtra,mateExtra:mateExtra,
    list:list,open:open,openJob:openJob,send:send,next:next,mentions:mentions,chat:chat,stopRound:stopRound,addFiles:addFiles,readFile:readFile,blocks:blocks,
    saveSkill:saveSkill,setEvery:setEvery,runSkill:runSkill,tick:tick,STARTERS:STARTERS,NEEDS:NEEDS,setStarter:setStarter,starterOn:starterOn,meetGo:meetGo,
    addWatch:addWatch,checkWatch:checkWatch,normUrl:normUrl,checkShare:checkShare,shareTo:shareTo,shareTask:shareTask,_S:S};
})();
