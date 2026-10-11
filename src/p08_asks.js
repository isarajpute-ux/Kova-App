/* =====================================================================
   KovaAsk - talk to your AI team the way you would to people (p20).

   You should not have to check on the team; it comes back to you.
     - Say when you want the answer: "at 11", "by 5pm", "tonight",
       "tomorrow at 9", "in 2 hours", or tap a time under the box. Give a
       link and they read that page. Either way the job goes to the Kova
       server (functions/asks.js), runs while Kova is closed, and the
       answer arrives at that time as a notification and in the team.
     - The team checks on you: a check-in at the time you pick, and every
       evening tomorrow's Google Calendar meetings prepped (what each is
       about, who is coming, what to bring, what to ask).
     - "Send to Maya": a finished video or post goes to your Social Media
       Manager. She writes the caption in your voice, posts it to the
       accounts you tick (a Short or a video on YouTube, a Reel on
       Instagram), and an hour later tells you what people are saying:
       the top five things, what is working, what to change.
   Without a sign-in or a server, a job with no time still runs right
   away in the app, the way it always has.
   ===================================================================== */
window.KovaAsk=(function(){
  'use strict';
  var DAY=864e5;
  var S={when:null, list:[], plan:null, loading:false, at:0};
  function $(id){ return document.getElementById(id); }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }
  function tz(){ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'; }catch(e){ return 'UTC'; } }
  function clock(t){ return new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}); }
  function when2(t){ var d=new Date(t), today=new Date().toDateString(), tm=new Date(Date.now()+DAY).toDateString();
    return (d.toDateString()===today?'':d.toDateString()===tm?'tomorrow ':d.toLocaleDateString([],{weekday:'short'})+' ')+clock(t); }
  function crew(){ return window.KovaCrew||null; }
  function serverOk(){
    try{ return !!(window.KovaLink&&KovaLink.authFetch&&window.KOVA_FB&&KOVA_FB.ok&&KOVA_FB.auth&&KOVA_FB.auth.currentUser); }catch(e){ return false; }
  }
  function api(path,o){ return KovaLink.authFetch(path,o).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok){ var e=new Error(j.error||('HTTP '+r.status)); e.status=r.status; throw e; } return j; }); }); }

  /* ---------------- "at 11", "by 5pm", "tomorrow at 9", "in 2 hours" ---------------- */
  var URL_RE=/https?:\/\/[^\s<>"')\]]+/i;
  function urlIn(t){ var m=String(t||'').match(URL_RE); return m?m[0].replace(/[.,;:!?]+$/,''):''; }
  function at(base,h,m,day){ var d=new Date(base); d.setDate(d.getDate()+(day||0)); d.setHours(h,m||0,0,0); return d.getTime(); }
  function parseWhen(text,now){
    now=now||Date.now();
    var t=' '+String(text||'').toLowerCase().replace(/\s+/g,' ')+' ', m;
    if((m=t.match(/\bin (an?|\d+(?:\.\d+)?) (hour|hr|minute|min)s?\b/))){
      var n=/an?/.test(m[1])?1:+m[1], ms=/^h/.test(m[2])?n*3600e3:n*60e3;
      if(ms>=5*60e3&&ms<=7*DAY) return {at:now+ms,label:'in '+(m[1]==='a'||m[1]==='an'?'an':m[1])+' '+(/^h/.test(m[2])?'hour':'minute')+(n!==1?'s':'')};
    }
    var day=/\btomorrow\b/.test(t)?1:0;
    if((m=t.match(/\b(?:at|by|around|before)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|o'?clock)?\b/))||(m=t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|o'?clock)\b/))){
      var h=+m[1], mi=+(m[2]||0), ap=(m[3]||'').replace(/\./g,'');
      if(h>23||mi>59) return null;
      if(ap==='pm'&&h<12) h+=12; if(ap==='am'&&h===12) h=0;
      /* "at 5" with no am/pm: the next 5 o'clock that has not passed, working hours first */
      if(!ap||/clock/.test(ap)){ if(h<7&&!day) h+=12; }
      var x=at(now,h,mi,day);
      if(!day&&x<=now+60e3) x=h<12&&!ap?at(now,h+12,mi,0):at(now,h,mi,1);
      if(x<=now+60e3) x=at(now,h,mi,1);
      return {at:x,label:when2(x)};
    }
    if(/\btonight\b/.test(t)) return {at:at(now,20,0,0)>now+60e3?at(now,20,0,0):at(now,20,0,1),label:'tonight'};
    if(/\bthis evening\b/.test(t)) return {at:at(now,19,0,0)>now+60e3?at(now,19,0,0):at(now,19,0,1),label:'this evening'};
    if(/\btomorrow morning\b/.test(t)||(day&&!/\bat\b/.test(t))) return {at:at(now,9,0,1),label:'tomorrow 9:00'};
    return null;
  }
  /* the time chips under the box, or what the words say */
  function deliveryFor(text){
    if(S.when&&S.when.at>Date.now()) return S.when;
    if(S.when&&S.when.now) return {at:Date.now(),label:'now'};
    return parseWhen(text);
  }
  /* goes to the server (and works while Kova is closed) when there is a
     time, a link, or a time chip picked, and you are signed in */
  function wants(text){ return serverOk()&&!!(S.when||parseWhen(text)||urlIn(text)); }

  function send(emp,text){
    var w=deliveryFor(text), url=urlIn(text);
    var body={emp:emp?emp.id:'',text:String(text).trim(),deliverAt:w?w.at:0};
    if(url) body.url=url;
    S.when=null;
    return api('/crew/ask',{json:body}).then(function(r){
      var name=emp?emp.n:'Your team';
      S.list.unshift({id:r.id,emp:body.emp,kind:'ask',text:body.text,url:url,deliverAt:r.deliverAt,state:'queued',created:Date.now()});
      say(r.now||!w?name+' is on it. The answer comes back here'+(pushOn()?' and as a notification.':'.'):name+' will tell you '+(w.label||when2(r.deliverAt))+'.');
      track('crew_ask',{timed:!!w,link:!!url});
      offerPush(); repaint();
      return r;
    },function(e){
      say(e.status===402?'Your AI team comes with Work OS. See plans.':(e.message||'Could not reach the server. Try again.'));
      if(e.status===402&&window.KovaBilling) KovaBilling.paywall('crew');
      throw e;
    });
  }
  function pushOn(){ try{ return !!(window.KovaPush&&KovaPush.active()); }catch(e){ return false; } }
  function offerPush(){ try{ if(window.KovaPush&&!KovaPush.active()&&!S.offered){ S.offered=true; setTimeout(function(){ KovaPush.offer('Answers from your AI team'); },600); } }catch(e){} }

  function refresh(force){
    if(!serverOk()||(S.loading&&!force)) return Promise.resolve(S.list);
    if(!force&&Date.now()-S.at<20e3) return Promise.resolve(S.list);
    S.loading=true;
    return Promise.all([api('/crew/asks'),S.plan?null:api('/crew/plan').catch(function(){ return null; })]).then(function(r){
      S.list=(r[0].items||[]); if(r[1]) S.plan=r[1]; S.at=Date.now(); S.loading=false; repaint(); return S.list;
    },function(){ S.loading=false; return S.list; });
  }
  function cancel(id){
    return api('/crew/ask/cancel',{json:{id:id}}).then(function(){ S.list=S.list.filter(function(x){ return x.id!==id; }); say('Taken back.'); repaint(); },function(e){ say(e.message); });
  }
  function savePlan(p){
    S.plan=p;
    if(!serverOk()){ say('Sign in so your team can reach you while Kova is closed.'); repaint(); return Promise.resolve(); }
    return api('/crew/plan',{json:{tz:tz(),prep:p.prep,checkin:p.checkin}}).then(function(r){ S.plan={prep:r.prep,checkin:r.checkin}; offerPush(); repaint(); },function(e){ say(e.status===402?'Your AI team comes with Work OS.':(e.message||'Could not save that.')); });
  }
  function repaint(){ try{ var c=crew(); if(c&&c.paint) c.paint(); }catch(e){} }

  /* ---------------- what the crew screen draws from here ---------------- */
  var CHIPS=[['now','Now'],['1h','In 1 hour'],['eve','Tonight 8 pm'],['am','Tomorrow 9 am']];
  function chipAt(k){ var n=Date.now(); return k==='now'?{now:true,label:'now'}:k==='1h'?{at:n+3600e3,label:'in an hour'}:k==='eve'?{at:at(n,20,0,at(n,20,0,0)>n+60e3?0:1),label:'tonight'}:{at:at(n,9,0,1),label:'tomorrow 9:00'}; }
  function chips(){
    if(!serverOk()) return '';
    var on=S.when&&S.when.k;
    return '<div class="kas-when" role="group" aria-label="When should they tell you?"><span>Tell me</span>'
      +CHIPS.map(function(c){ return '<button type="button" class="kas-chip'+(on===c[0]?' on':'')+'" data-ka="when" data-v="'+c[0]+'" aria-pressed="'+(on===c[0])+'">'+c[1]+'</button>'; }).join('')
      +'<label class="kas-chip kas-pick'+(on==='pick'?' on':'')+'">At <input type="time" data-ka="pick" aria-label="Pick a time" value="'+(on==='pick'&&S.when?new Date(S.when.at).toTimeString().slice(0,5):'')+'"></label></div>';
  }
  function empName(id){ var c=crew(), e=c&&c.emp?c.emp(id):null; return e?e.n:'Your team'; }
  function panel(){
    if(!serverOk()) return '<div class="crd-card kas-card"><div class="crd-chd"><span>Your team checks on you</span></div><div class="kas-sub">Sign in and your team keeps working while Kova is closed: answers at the time you ask, a daily check-in, and tomorrow’s meetings prepped each evening.</div></div>';
    if(!S.at) refresh();
    var p=S.plan||{prep:{on:false,time:'18:00'},checkin:{on:false,time:'11:00'}};
    var open=S.list.filter(function(x){ return x.state==='queued'||x.state==='running'; });
    var h='';
    if(open.length) h+='<div class="crd-sh2">On it ('+open.length+')</div><div class="kas-list">'+open.map(function(x){
      return '<div class="kas-row"><span class="kas-dot'+(x.state==='running'?' run':'')+'" aria-hidden="true"></span><span class="kas-t"><b>'+esc(empName(x.emp))+'</b> '+esc(String(x.text||({prep:'Prepping tomorrow’s meetings',checkin:'Checking in',comments:'Reading the comments'})[x.kind]||'').slice(0,90))
        +'<small>'+(x.state==='running'?'Working on it now':'Tells you '+esc(when2(x.deliverAt)))+'</small></span>'
        +(x.state==='queued'?'<button type="button" class="crd-link" data-ka="cancel" data-v="'+esc(x.id)+'">Take back</button>':'')+'</div>';
    }).join('')+'</div>';
    h+='<div class="crd-card kas-card"><div class="crd-chd"><span>Your team checks on you</span><small>While Kova is closed. You get a notification.</small></div>'
      +row('checkin','A check-in from '+esc(empName(teamOf('chief'))),'Where your day stands, one thing they can take off your plate, one question.',p.checkin)
      +row('prep','Tomorrow’s meetings, prepped','Each evening: what every meeting is about, who is coming, what to bring and what to ask. Needs Google Calendar.',p.prep)
      +'</div>';
    return h;
  }
  function teamOf(tpl){ var c=crew(); if(!c||!c.emps) return ''; var e=c.emps().filter(function(x){ return x.tpl===tpl&&x.enabled; })[0]; return e?e.id:''; }
  function row(k,t,d,c){
    c=c||{};
    return '<div class="kas-plan"><div class="kas-pt"><b>'+t+'</b><small>'+d+'</small></div>'
      +'<input type="time" class="kas-time" data-ka="time" data-v="'+k+'" value="'+esc(c.time||(k==='prep'?'18:00':'11:00'))+'" aria-label="Time for '+(k==='prep'?'meeting prep':'the check-in')+'">'
      +'<button type="button" class="crw-tog'+(c.on?' on':'')+'" data-ka="plan" data-v="'+k+'" role="switch" aria-checked="'+!!c.on+'" aria-label="'+(k==='prep'?'Meeting prep':'Check-in')+' on or off"><span></span></button></div>';
  }
  function planOf(){ return JSON.parse(JSON.stringify(S.plan||{prep:{on:false,time:'18:00'},checkin:{on:false,time:'11:00'}})); }

  document.addEventListener('click',function(ev){
    var b=ev.target.closest&&ev.target.closest('[data-ka]'); if(!b) return;
    var k=b.getAttribute('data-ka'), v=b.getAttribute('data-v');
    if(k==='when'){ ev.stopPropagation(); S.when=S.when&&S.when.k===v?null:Object.assign(chipAt(v),{k:v}); repaint(); }
    else if(k==='cancel'){ ev.stopPropagation(); cancel(v); }
    else if(k==='plan'){ ev.stopPropagation(); var p=planOf(); p[v].on=!p[v].on; p[v].emp=teamOf(v==='prep'?'sched':'chief')||teamOf('chief'); savePlan(p); }
  },true);
  document.addEventListener('change',function(ev){
    var b=ev.target; if(!b||!b.getAttribute) return;
    var k=b.getAttribute('data-ka');
    if(k==='pick'&&b.value){ var hm=b.value.split(':'), x=at(Date.now(),+hm[0],+hm[1],0); if(x<=Date.now()+60e3) x=at(Date.now(),+hm[0],+hm[1],1); S.when={at:x,label:when2(x),k:'pick'}; repaint(); }
    if(k==='time'&&b.value){ var p=planOf(), v=b.getAttribute('data-v'); p[v].time=b.value; if(p[v].on) savePlan(p); else { S.plan=p; } }
  },true);

  /* ---------------- tools the teammates use in the app ---------------- */
  function fetchPage(url){
    if(!serverOk()) return Promise.resolve({error:'Reading web pages needs you signed in to Kova.'});
    return api('/crew/fetch',{json:{url:url}}).catch(function(e){ return {error:e.message}; });
  }
  function postsSent(){ return (window.KovaPost&&KovaPost.all?KovaPost.all():[]).filter(function(p){ return p.status==='sent'||p.status==='partial'||Object.keys(p.results||{}).some(function(k){ return p.results[k]&&p.results[k].state==='ok'; }); }); }
  function findPost(q,list){
    list=list||(window.KovaPost&&KovaPost.all?KovaPost.all():[]); q=String(q||'').toLowerCase().trim();
    if(!q||q==='latest'||q==='last') return list.slice().sort(function(a,b){ return (b.updated||0)-(a.updated||0); })[0]||null;
    return list.filter(function(p){ return String(p.title||'').toLowerCase()===q; })[0]||list.filter(function(p){ return String(p.title||'').toLowerCase().indexOf(q)>=0; })[0]||null;
  }
  function feedback(q){
    var p=findPost(q,postsSent());
    if(!p) return Promise.resolve({error:'No published post found'+(q&&q!=='latest'?' called '+q:'')+'.'});
    if(!serverOk()) return Promise.resolve({error:'Reading comments needs you signed in.'});
    return api('/traction/refresh',{json:{only:p.id}}).catch(function(){ return null; }).then(function(){
      return api('/traction/'+encodeURIComponent(p.id)+'/advice',{json:{mode:'creator'}});
    }).then(function(a){
      return {post:p.title,headline:a.headline,themes:(a.themes||[]).slice(0,5),working:a.working||[],fix:a.fix||[],next:a.next||{}};
    }).catch(function(e){ return {error:e.message}; });
  }

  /* ---------------- Send to Maya ---------------- */
  var SOCIAL=['instagram','youtube','tiktok','facebook'];
  function social(){ var c=crew(); if(!c||!c.emps) return null; var L=c.emps(); return L.filter(function(e){ return e.tpl==='social'&&e.enabled; })[0]||L.filter(function(e){ return /social/i.test(e.title)&&e.enabled; })[0]||null; }
  function linked(k){ try{ return window.KovaPost&&KovaPost.linkState(k)==='on'; }catch(e){ return false; } }
  function mediaOf(p){ var m=(window.KovaPost&&KovaPost.postMedia)?KovaPost.postMedia(p):(p.media||[]); return m[0]||null; }
  function shape(m){ if(!m||!m.w||!m.h) return ''; return m.h>m.w*1.15?'vertical':(m.w>m.h*1.15?'wide':'square'); }
  var SEND={};
  function offerSend(post){
    if(!post||!window.openSheet) return;
    var e=social();
    var m=mediaOf(post), sh=shape(m), dur=Math.round((m&&m.dur)||0), video=!!(m&&m.kind==='video');
    var avail=SOCIAL.filter(linked);
    SEND={post:post,emp:e,targets:avail.filter(function(k){ return k==='instagram'||k==='youtube'; }),when:'now',comments:true,cap:null,busy:false,video:video,sh:sh,dur:dur};
    if(!SEND.targets.length) SEND.targets=avail.slice(0,2);
    openSheet('<div class="grab"></div><div class="kas-send" id="kasSend"></div>');
    paintSend();
    var root=$('kasSend'); if(root) root.addEventListener('click',onSend);
    if(serverOk()) writeCaption();
    track('send_to_social',{video:video});
  }
  function writeCaption(){
    var p=SEND.post;
    SEND.cap={busy:true};
    paintSend();
    api('/crew/caption',{json:{title:p.title,notes:[p.heading,p.body,p.caption].filter(Boolean).join('\n'),dur:SEND.dur,shape:SEND.sh,platforms:SEND.targets}}).then(function(c){
      SEND.cap=c; paintSend();
    },function(err){ SEND.cap={heading:p.heading||p.title||'',caption:p.caption||'',tags:p.tags||'',note:err.message}; paintSend(); });
  }
  function paintSend(){
    var root=$('kasSend'); if(!root) return;
    var p=SEND.post, e=SEND.emp, name=e?e.n:'your Social Media Manager';
    var c=SEND.cap||{heading:p.heading||p.title||'',caption:p.caption||'',tags:p.tags||''};
    var place=function(k){ return k==='youtube'?(SEND.video&&SEND.sh==='vertical'&&SEND.dur&&SEND.dur<=180?'Short':'Video'):k==='instagram'?(SEND.video?'Reel':'Post'):k==='tiktok'?'Video':'Post'; };
    root.innerHTML='<div class="title-s" style="font-size:19px;margin-bottom:4px">Send to '+esc(e?e.n:'Maya')+'</div>'
      +'<div class="sub" style="line-height:1.5;margin-bottom:12px">'+(e?esc(e.n)+' writes the caption in your voice, posts it, and an hour later tells you what people are saying.':'Hire a Social Media Manager on your AI team and she posts for you.')+'</div>'
      +'<div class="kas-what"><b>'+esc(p.title||'Your post')+'</b><span>'+(SEND.video?'Video'+(SEND.dur?' · '+Math.floor(SEND.dur/60)+':'+('0'+SEND.dur%60).slice(-2):'')+(SEND.sh?' · '+SEND.sh:''):'Post')+'</span></div>'
      +'<div class="crd-sh2">Where</div><div class="kas-plats">'+SOCIAL.map(function(k){
          var ok=linked(k), on=SEND.targets.indexOf(k)>=0, nm=(window.KovaPost&&KovaPost.PLAT&&KovaPost.PLAT[k]&&KovaPost.PLAT[k].n)||k;
          return '<button type="button" class="kas-plat'+(on?' on':'')+'" data-s="plat" data-v="'+k+'"'+(ok?'':' disabled')+' aria-pressed="'+on+'">'+esc(nm)+'<small>'+(ok?esc(place(k)):'Not connected')+'</small></button>';
        }).join('')+'</div>'
      +(SOCIAL.some(linked)?'':'<div class="kas-sub">Connect Instagram or YouTube in Settings › Connections first.</div>')
      +'<div class="crd-sh2">Caption</div>'
      +(c.busy?'<div class="kas-sub"><span class="kas-dot run"></span> '+esc(name)+' is writing it…</div>'
        :'<input class="kas-in" data-s="heading" value="'+esc(c.heading)+'" aria-label="Title (YouTube)" placeholder="Title for YouTube">'
         +'<textarea class="kas-in" data-s="caption" rows="4" aria-label="Caption" placeholder="Caption">'+esc(c.caption)+'</textarea>'
         +'<input class="kas-in" data-s="tags" value="'+esc(c.tags)+'" aria-label="Hashtags" placeholder="#hashtags">'
         +(c.note?'<div class="kas-sub">'+esc(c.note)+' You can write it yourself here.</div>':''))
      +'<div class="crd-sh2">When</div><div class="kas-plats">'+[['now','Now'],['eve','Tonight 7 pm'],['best','Tomorrow 12 pm']].map(function(x){ return '<button type="button" class="kas-plat'+(SEND.when===x[0]?' on':'')+'" data-s="when" data-v="'+x[0]+'" aria-pressed="'+(SEND.when===x[0])+'">'+x[1]+'</button>'; }).join('')+'</div>'
      +'<label class="kas-check"><input type="checkbox" data-s="comments"'+(SEND.comments?' checked':'')+'> Tell me what people are saying an hour after it goes out</label>'
      +'<div class="kas-msg" id="kasMsg" role="status"></div>'
      +'<button type="button" class="btn" data-s="go"'+(SEND.busy||!SEND.targets.length||(SEND.cap&&SEND.cap.busy)?' disabled':'')+'>'+(SEND.busy?'Posting…':'Post with '+esc(e?e.n:'Maya'))+'</button>';
  }
  function readSend(){
    var root=$('kasSend'); if(!root) return;
    var g=function(k){ var x=root.querySelector('[data-s="'+k+'"]'); return x?x.value:''; };
    if(SEND.cap&&!SEND.cap.busy){ SEND.cap.heading=g('heading'); SEND.cap.caption=g('caption'); SEND.cap.tags=g('tags'); }
    var cb=root.querySelector('[data-s="comments"]'); if(cb) SEND.comments=cb.checked;
  }
  function whenAt(k){ var n=Date.now(); return k==='eve'?at(n,19,0,at(n,19,0,0)>n+5*60e3?0:1):k==='best'?at(n,12,0,1):0; }
  function onSend(ev){
    var b=ev.target.closest('[data-s]'); if(!b||b.tagName==='INPUT'&&b.type!=='checkbox'||b.tagName==='TEXTAREA') return;
    var k=b.getAttribute('data-s'), v=b.getAttribute('data-v');
    readSend();
    if(k==='plat'){ var i=SEND.targets.indexOf(v); if(i>=0) SEND.targets.splice(i,1); else SEND.targets.push(v); paintSend(); }
    else if(k==='when'){ SEND.when=v; paintSend(); }
    else if(k==='go') postIt();
  }
  function msg(t,bad){ var m=$('kasMsg'); if(m){ m.textContent=t||''; m.classList.toggle('bad',!!bad); } }
  function postIt(){
    var p=SEND.post, e=SEND.emp, c=SEND.cap||{};
    if(!window.KovaPost) return msg('The Studio is not available here.',true);
    if(!SEND.targets.length) return msg('Tick at least one account.',true);
    p.targets=SEND.targets.slice();
    if(c.heading) p.heading=c.heading; if(c.caption!=null) p.caption=c.caption; if(c.tags!=null) p.tags=c.tags;
    if(!p.title||p.title==='Untitled post') p.title=(c.heading||p.title||'Post').slice(0,80);
    p.opts=p.opts||{}; p.opts.youtube=Object.assign({privacy:'public'},p.opts.youtube||{},{short:SEND.video&&SEND.sh==='vertical'&&SEND.dur>0&&SEND.dur<=180});
    try{ if(SEND.video){ KovaPost.setPlace(p,'instagram','reel'); KovaPost.setPlace(p,'facebook','reel'); } }catch(x){}
    var t=whenAt(SEND.when); p.mode=t?'schedule':'now'; p.when=t||0; p.by=e?e.n:'Kova';
    KovaPost.save(p);
    SEND.busy=true; paintSend(); msg('');
    return KovaPost.publish(p,p.mode,function(f){ msg('Uploading '+Math.round((f||0)*100)+'%'); }).then(function(){
      SEND.busy=false;
      var goesOut=p.when||Date.now();
      var plats=p.targets.map(function(k){ return (KovaPost.PLAT[k]&&KovaPost.PLAT[k].n)||k; }).join(' and ');
      var tellAt=goesOut+3600e3;
      var after=SEND.comments&&serverOk()?api('/crew/ask',{json:{kind:'comments',ref:p.id,emp:e?e.id:'',text:'What are people saying about “'+p.title+'”?',deliverAt:tellAt}}).catch(function(){ return null; }):Promise.resolve(null);
      return after.then(function(r){
        var line=(p.when?'Scheduled for '+when2(p.when)+' on ':'Posted to ')+plats+'.'+(r?' I will tell you what people are saying '+when2(tellAt)+'.':'');
        try{ var cr=crew(); if(cr&&cr.note&&e) cr.note(e.id,'Post “'+p.title+'” to '+plats,line); }catch(x){}
        if(window.closeSheet) closeSheet();
        say((e?e.n+': ':'')+line); offerPush();
        track('social_posted',{count:p.targets.length,scheduled:!!p.when,comments:!!r});
        return p;
      });
    },function(err){
      SEND.busy=false; paintSend(); msg(err.message||'Posting did not go through.',true);
      if(err.status===402&&window.KovaBilling) KovaBilling.paywall('publish');
    });
  }
  /* a teammate posting from a job (after you approve it) */
  function publishFromTool(a){
    var p=findPost(a.post);
    if(!p) return Promise.resolve({error:'No post called '+(a.post||'that')+' in the Studio.'});
    var plats=(a.platforms||[]).filter(function(k){ return SOCIAL.concat(['linkedin','x','threads','pinterest']).indexOf(k)>=0&&linked(k); });
    if(!plats.length) return Promise.resolve({error:'None of those accounts are connected. Connected: '+SOCIAL.filter(linked).join(', ')+'.'});
    p.targets=plats; if(a.caption) p.caption=String(a.caption).slice(0,2200); if(a.heading) p.heading=String(a.heading).slice(0,100);
    KovaPost.save(p);
    return KovaPost.publish(p,'now').then(function(){ return {ok:true,post:p.title,platforms:plats}; },function(e){ return {error:e.message}; });
  }

  /* the crew loads first; draw again once this is here */
  setTimeout(function(){ repaint(); if(serverOk()) refresh(true); },0);
  document.addEventListener('visibilitychange',function(){ if(!document.hidden) refresh(); });

  return {parseWhen:parseWhen,urlIn:urlIn,wants:wants,send:send,refresh:refresh,cancel:cancel,chips:chips,panel:panel,savePlan:savePlan,
    fetchPage:fetchPage,feedback:feedback,offerSend:offerSend,publishFromTool:publishFromTool,findPost:findPost,_S:S,_send:function(){ return SEND; }};
})();
