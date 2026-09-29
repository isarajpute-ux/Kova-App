/* =====================================================================
   KovaListen - call an AI employee by name (p10).

   Off until you turn it on (Work OS > AI team > "Call them by name").
   While on, Kova listens for your employees' names. Say "Maya", "hey
   Maya", "good evening Maya, how did this week go" - any sentence with
   the name - and Maya's box pops up on whatever screen you are on:
     - it shows what it heard, live;
     - if you said the job in the same breath, it sends it after a
       3-second countdown you can cancel or edit;
     - if you only said the name, it listens for the job next.
   A small "Listening" pill stays on screen whenever the microphone is
   on; tap it to stop. Listening pauses when Kova is in the background.

   Uses the browser's speech recognition (Chrome, Edge, Safari). In
   Chrome the audio is sent to Google to be turned into text; the toggle
   says so. Nothing is recorded or kept by Kova, only the words that
   follow a name, as the job.
   ===================================================================== */
window.KovaListen=(function(){
  'use strict';
  var KEY='kova.listen.v1';
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition||null;
  var S={on:false,rec:null,running:false,err:'',pop:null,emp:null,heard:'',ask:'',timer:null,wait:null,restarts:0,last:0};
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function lsPut(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function crew(){ return window.KovaCrew||null; }
  function team(){ var C=crew(); return C?C.emps().filter(function(e){ return e.enabled&&String(e.n||'').replace(/[^a-z]/gi,'').length>=2; }):[]; }
  function supported(){ return !!SR; }

  /* ---------------- hearing a name ---------------- */
  function clean(t){ return String(t||'').replace(/\s+/g,' ').trim(); }
  function find(text){
    var t=' '+String(text||'').toLowerCase().replace(/[^a-z0-9' ]+/g,' ')+' ', best=null;
    team().forEach(function(e){
      var n=e.n.toLowerCase().replace(/[^a-z0-9]/g,'');
      var i=t.search(new RegExp('\\b'+n+'\\b'));
      if(i>=0&&(!best||i<best.i)) best={e:e,i:i,n:n};
    });
    return best;
  }
  /* what they asked: the words after the name, without greetings and filler */
  function request(text,name){
    var low=String(text||''), m=low.toLowerCase().search(new RegExp('\\b'+name+'\\b'));
    if(m<0) return '';
    var rest=low.slice(m+name.length).replace(/^[\s,.:;!?-]+/,'');
    rest=rest.replace(/^(please|can you|could you|would you|i need you to|i want you to)\s+/i,function(x){ return /please/i.test(x)?'':x; });
    rest=clean(rest);
    if(/^(hi|hey|hello|good (morning|afternoon|evening|night)|are you there|you there)[.!?]*$/i.test(rest)) rest='';
    return rest.length>=3?rest.charAt(0).toUpperCase()+rest.slice(1):'';
  }
  /* a stream of words from the recogniser (interim or final) */
  function hear(text,final){
    text=clean(text); if(!text) return;
    if(S.pop&&S.emp&&S.state!=='sent'){
      if(S.state==='waiting'){
        /* the name was said on its own; this is the job */
        var again=find(text), job=again&&again.e.id===S.emp.id?request(text,again.n):text;
        S.heard=text; if(job) setAsk(job,final); paintPop(); return;
      }
      if(S.state==='heard'&&!final){ var f0=find(text); if(f0&&f0.e.id===S.emp.id){ S.heard=text; var r0=request(text,f0.n); if(r0) setAsk(r0,false); paintPop(); } }
      if(S.state==='heard'&&final){
        var f1=find(text);
        if(f1&&f1.e.id===S.emp.id){ var r1=request(text,f1.n); if(r1) setAsk(r1,true); else toWaiting(); }
        else if(!f1&&!S.ask&&text.length>=3){ S.heard=text; setAsk(text.charAt(0).toUpperCase()+text.slice(1),true); }   /* the job arrived as its own piece */
        else if(S.ask) setAsk(S.ask,true);
      }
      return;
    }
    var f=find(text); if(!f) return;
    open(f.e,text);
    var r=request(text,f.n);
    if(r) setAsk(r,final); else if(final) toWaiting();
  }
  function setAsk(t,final){
    S.ask=t; S.state=final?'ready':'heard';
    clearTimeout(S.wait);
    if(final) countdown(); else paintPop();
  }
  function toWaiting(){
    S.state='waiting'; S.ask=''; paintPop();
    clearTimeout(S.wait); S.wait=setTimeout(function(){ if(S.state==='waiting'){ S.state='typing'; paintPop(); } },9000);
  }

  /* ---------------- the box that pops up ---------------- */
  function open(e,heard){
    S.emp=e; S.heard=heard||''; S.ask=''; S.state='heard'; clearInterval(S.timer); clearTimeout(S.wait);
    if(!S.pop){ S.pop=document.createElement('div'); S.pop.id='klPop'; S.pop.className='kl2'; S.pop.setAttribute('role','dialog'); S.pop.setAttribute('aria-live','polite'); document.body.appendChild(S.pop); S.pop.addEventListener('click',onPop); }
    paintPop();
    requestAnimationFrame(function(){ if(S.pop) S.pop.classList.add('on'); });
  }
  function close(){
    clearInterval(S.timer); clearTimeout(S.wait);
    var p=S.pop; S.pop=null; S.emp=null; S.state='';
    if(p){ p.classList.remove('on'); setTimeout(function(){ p.remove(); },250); }
  }
  function countdown(){
    var n=3; S.left=n; paintPop();
    clearInterval(S.timer);
    S.timer=setInterval(function(){ S.left--; if(S.left<=0){ clearInterval(S.timer); send(); } else paintPop(); },1000);
  }
  function av(e){ return '<span class="crw-av big"><i></i><b>'+esc(String(e.n).charAt(0).toUpperCase())+'</b></span>'; }
  function paintPop(){
    var p=S.pop, e=S.emp; if(!p||!e) return;
    var st=S.state, body='';
    if(st==='sent') body='<div class="kl2-say">'+esc(e.n)+' is on it.</div><div class="kl2-row"><button class="kl2-b" data-k="open">Open '+esc(e.n)+'</button><button class="kl2-b ghost" data-k="close">Close</button></div>';
    else if(st==='typing'||st==='edit') body='<textarea id="klAsk" rows="3" placeholder="What do you need, '+esc(e.n)+'?">'+esc(S.ask)+'</textarea>'
      +'<div class="kl2-row"><button class="kl2-b" data-k="send">Send to '+esc(e.n)+'</button><button class="kl2-b ghost" data-k="close">Cancel</button></div>';
    else body='<div class="kl2-heard">'+(S.heard?'“'+esc(S.heard)+'”':'')+'</div>'
      +(st==='waiting'?'<div class="kl2-say"><span class="kl2-wave"><i></i><i></i><i></i></span>Listening. What do you need?</div>'
        :(S.ask?'<div class="kl2-job"><span>Job</span>'+esc(S.ask)+'</div>':'<div class="kl2-say"><span class="kl2-wave"><i></i><i></i><i></i></span>Listening…</div>'))
      +'<div class="kl2-row">'
        +(S.ask?'<button class="kl2-b" data-k="send">'+(st==='ready'&&S.left?'Sending in '+S.left+'…':'Send to '+esc(e.n))+'</button><button class="kl2-b ghost" data-k="edit">Edit</button>':'<button class="kl2-b ghost" data-k="type">Type instead</button>')
        +'<button class="kl2-b ghost" data-k="close">Cancel</button></div>';
    p.innerHTML='<div class="kl2-h">'+av(e)+'<div><b>'+esc(e.n)+'</b><span>'+esc(e.title)+'</span></div><button class="kl2-x" data-k="close" aria-label="Close">×</button></div>'+body;
    if(st==='typing'||st==='edit'){ var t=document.getElementById('klAsk'); if(t){ t.focus(); t.onkeydown=function(ev){ if(ev.key==='Enter'&&!ev.shiftKey){ ev.preventDefault(); S.ask=t.value; send(); } }; } }
  }
  function send(){
    clearInterval(S.timer); clearTimeout(S.wait);
    var t=document.getElementById('klAsk'); if(t) S.ask=t.value;
    var e=S.emp, job=clean(S.ask);
    if(!e||!job){ S.state='typing'; paintPop(); return; }
    var C=crew(); if(C) C.start(C.emp(e.id)||e,job,'voice');
    S.state='sent'; paintPop();
    setTimeout(function(){ if(S.state==='sent') close(); },5000);
  }
  function onPop(ev){
    var b=ev.target.closest('[data-k]'); if(!b) return;
    var k=b.getAttribute('data-k');
    if(k==='close'){ close(); return; }
    if(k==='send'){ send(); return; }
    if(k==='edit'||k==='type'){ clearInterval(S.timer); clearTimeout(S.wait); S.state=k==='edit'?'edit':'typing'; paintPop(); return; }
    if(k==='open'){ var id=S.emp&&S.emp.id; close(); if(window.go) go('workteam'); var C=crew(); if(C&&id){ C._S.view='emp'; C._S.emp=id; C._S.scroll=true; C.paint(); } }
  }

  /* ---------------- the microphone ---------------- */
  function pill(){
    var p=document.getElementById('klPill');
    if(S.on&&S.running){
      if(!p){ p=document.createElement('button'); p.id='klPill'; p.type='button'; p.className='kl2-pill'; p.setAttribute('aria-label','Stop listening for names'); p.addEventListener('click',function(){ set(false); }); document.body.appendChild(p); }
      p.innerHTML='<i></i>Listening for '+esc(team().map(function(e){ return e.n; }).slice(0,4).join(', ')||'names');
    } else if(p) p.remove();
  }
  function begin(){
    if(!SR||!S.on||S.running||document.hidden) return;
    var r=new SR();
    r.continuous=true; r.interimResults=true; r.lang=navigator.language||'en-US';
    r.onresult=function(ev){
      for(var i=ev.resultIndex;i<ev.results.length;i++){ var res=ev.results[i]; hear(res[0].transcript,res.isFinal); }
    };
    r.onerror=function(ev){
      if(ev.error==='not-allowed'||ev.error==='service-not-allowed'){ S.err='Microphone permission was refused. Allow it in your browser settings to call your team by name.'; set(false); }
      else if(ev.error==='audio-capture'){ S.err='No microphone found.'; set(false); }
    };
    r.onend=function(){
      S.running=false; pill();
      /* browsers stop after a pause or a minute; carry on while it is on, gently */
      if(S.on&&!document.hidden){ var gap=Date.now()-S.last<4000?Math.min(8000,500*Math.pow(2,S.restarts++)):300; S.last=Date.now(); setTimeout(begin,gap); }
    };
    try{ r.start(); S.rec=r; S.running=true; S.err=''; S.last=Date.now(); pill(); }catch(e){ S.running=false; }
  }
  function halt(){ S.running=false; try{ if(S.rec) S.rec.abort(); }catch(e){} S.rec=null; pill(); }
  function set(on){
    S.on=!!on; lsPut(KEY,{on:S.on});
    if(S.on){ S.restarts=0; begin(); } else halt();
    var C=crew(); if(C&&C.paint) C.paint();
  }
  document.addEventListener('visibilitychange',function(){ if(document.hidden) halt(); else if(S.on) begin(); });
  function start(){
    var saved=lsJ(KEY,{on:false});
    /* the browser asks for the microphone on the first start; after that it remembers */
    if(saved.on&&supported()) set(true);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,1800); }); else setTimeout(start,1800);

  return {supported:supported,set:set,on:function(){ return S.on; },running:function(){ return S.running; },error:function(){ return S.err; },
    hear:hear,find:find,request:request,close:close,send:send,_S:S};
})();
