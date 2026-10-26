/* p43: one voice for Kova (the AI team's "Read it to me", and Coach me
   when the server's natural voice is off).

   The owner: "it speaks way too fast, no pauses, no commas, doesn't sound
   human at all... make it sound like ElevenLabs". What makes ElevenLabs
   sound human is a neural model that reads the whole passage first and
   plans its timing, pitch and breaths from the meaning; a phone's built-in
   voice reads word by word and cannot. So:
   - signed in, with the server's ElevenLabs key: the whole passage goes in
     one request (functions/voice.js: the expressive model, a little under
     normal speed), so it phrases across sentences like a person;
   - otherwise the phone's best voice, but written for the ear first
     (prep): times said as times ("9 to 9:45 AM"), bullets and headings
     turned into sentences, brackets, quotes and symbols out; then said one
     sentence at a time, a little slower, with a short breath between
     sentences and a longer one between parts. */
window.KovaVoice=(function(){
  var RATE=0.9, GAP=360, PART=720, MAX=1200;
  var S={n:0,best:null,ok:null,au:null,talking:false};

  /* the phone's voices: Premium, Enhanced or natural ones before the robotic default, never the novelty ones */
  function score(v){
    var n=v.name||'', l=String(v.lang||'').toLowerCase().replace('_','-'), s=0;
    if(l.indexOf('en')!==0) return -99;
    if(/compact|novelty|whisper|bad news|bells|boing|bubbles|cellos|jester|organ|trinoids|zarvox|albert|fred|junior|ralph|kathy|bahh|superstar|wobble|grandma|grandpa|rocko|shelley|flo|eddy|reed|sandy/i.test(n)) return -50;
    if(/premium/i.test(n)) s+=6; if(/enhanced|neural|natural/i.test(n)) s+=5; if(/siri/i.test(n)) s+=4; if(/^google/i.test(n)) s+=3;
    if(/\b(ava|zoe|evan|nathan|noelle|samantha|allison|susan|tom|serena|daniel|karen|moira|aria|jenny|guy|libby|sonia|tessa)\b/i.test(n)) s+=1;
    if(l===String(navigator.language||'en-US').toLowerCase()) s+=2;
    return s;
  }
  function best(){
    if(S.best) return S.best;
    var L=[]; try{ L=window.speechSynthesis?speechSynthesis.getVoices()||[]:[]; }catch(e){}
    var top=-1; L.forEach(function(v){ var x=score(v); if(x>top){ top=x; S.best=v; } });
    return S.best;
  }
  try{ if(window.speechSynthesis&&speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged',function(){ S.best=null; }); }catch(e){}

  /* ---------- written for the ear ---------- */
  /* 13:30 -> "1:30 PM" (the colon is held back until both passes are done) */
  function clock(h,m){
    h=+h; m=+m; var ap=h>=12?'PM':'AM', h12=h%12||12;
    return h12+(m?'\u0002'+(m<10?'0':'')+m:'')+' '+ap;
  }
  function times(t){
    return t
      .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\s*[–—-]\s*([01]?\d|2[0-3]):([0-5]\d)\b/g,function(_,h1,m1,h2,m2){
        var a=clock(h1,m1), b=clock(h2,m2), same=a.slice(-2)===b.slice(-2);
        return (same?a.slice(0,-3):a)+' to '+b; })
      .replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g,function(_,h,m){ return clock(h,m); })
      /* a time that starts a line is followed by a breath: "9 AM, fill in..." */
      .replace(/^(\d[\d\u0002]*(?: [AP]M)?(?: to \d[\d\u0002]*)? [AP]M)\s+(?=[A-Za-z])/,'$1, ')
      .replace(/\u0002/g,':');
  }
  function words(t){
    return times(t)
      .replace(/\*\*|__|[`#>]/g,'')
      .replace(/\[([^\]]+)\]\([^)]+\)/g,'$1')
      .replace(/https?:\/\/\S+/g,'the link')
      .replace(/[“”"«»]/g,'').replace(/[‘’]/g,"'")
      .replace(/\s*\(([^)]{1,120})\)/g,', $1,')
      .replace(/(\d)\s*[–—-]\s*(\d)/g,'$1 to $2')
      .replace(/\s+[–—]\s+/g,', ').replace(/\s*·\s*/g,', ')
      .replace(/(\d)\s*×\s*(\d)/g,'$1 by $2')
      .replace(/(\d)\s*%/g,'$1 percent').replace(/\s&\s/g,' and ')
      .replace(/(\d)\s*lbs?\b/g,'$1 pounds').replace(/(\d)\s*kg\b/g,'$1 kilos')
      .replace(/(\d)\s*s\b/g,'$1 seconds').replace(/(\d)\s*min\b/g,'$1 minutes').replace(/(\d)\s*h\b/g,'$1 hours').replace(/(\d)\s*d\b/g,'$1 days')
      .replace(/\be\.g\.\s*/gi,'for example, ').replace(/\bi\.e\.\s*/gi,'that is, ').replace(/\bvs\.?\s/gi,'versus ')
      .replace(/\s*:\s+/g,': ').replace(/\s*;\s*/g,'. ')
      .replace(/,\s*,/g,',').replace(/,\s*([.!?])/g,'$1').replace(/\s{2,}/g,' ').trim().replace(/[,;:\s]+$/,'');
  }
  /* the passage as parts (a heading and what is under it), each a list of sentences */
  function prep(text){
    var parts=[], cur=null;
    String(text||'').slice(0,4000).split(/\n/).forEach(function(raw){
      var l=raw.trim(); if(!l){ cur=null; return; }
      var head=/^#{1,6}\s+/.test(l)||/^\*\*[^*]+\*\*:?$/.test(l);
      var item=/^([-*•]|\d+[.)])\s+/.test(l);
      l=words(l.replace(/^#{1,6}\s+/,'').replace(/^([-*•]|\d+[.)])\s+/,''));
      if(!l) return;
      /* a heading, or plain words after a list, start a new part */
      if(head||!cur||(cur.list&&!item)){ cur=[]; parts.push(cur); }
      if(!/[.!?:]$/.test(l)) l+='.';
      if(head) l=l.replace(/[.:]$/,'.');
      l.replace(/([.!?])\s+(?=[A-Z0-9])/g,'$1\u0001').split('\u0001').forEach(function(s){
        while(s.length>180){ var c=s.lastIndexOf(', ',170); if(c<40) break; cur.push(s.slice(0,c+1)); s=s.slice(c+2); }
        if(s) cur.push(s);
      });
      if(head) cur.head=true;
      if(item&&!head) cur.list=true;
    });
    return parts.filter(function(p){ return p.length; });
  }
  /* for the natural voice: line breaks between parts, the model pauses there */
  function passage(parts){ return parts.map(function(p){ return p.join(' '); }).join('\n\n').slice(0,MAX); }

  /* ---------- the phone's voice: a sentence at a time, with breaths ---------- */
  function device(text,o){
    o=o||{};
    var parts=typeof text==='string'?prep(text):text;
    if(!window.speechSynthesis||!parts.length) return false;
    var my=++S.n, q=[];
    parts.forEach(function(p,pi){ p.forEach(function(s,si){ q.push({s:s,gap:si===p.length-1&&pi<parts.length-1?PART:GAP}); }); });
    try{ speechSynthesis.cancel(); }catch(e){}
    try{ if(S.au) S.au.pause(); }catch(e){}
    S.talking=true;
    (function next(i){
      if(my!==S.n) return;
      if(i>=q.length){ S.talking=false; if(o.done) o.done(); return; }
      var u=new SpeechSynthesisUtterance(q[i].s), v=best();
      if(v){ u.voice=v; u.lang=v.lang; }
      u.rate=o.rate||RATE; u.pitch=1;
      var went=false, go=function(){ if(went) return; went=true; setTimeout(function(){ next(i+1); },q[i].gap); };
      u.onend=go; u.onerror=go;
      try{ speechSynthesis.speak(u); }catch(e){ go(); }
      /* some browsers never say "ended": move on after a generous guess */
      setTimeout(go,1200+q[i].s.length*95/(o.rate||RATE));
    })(0);
    return true;
  }

  /* ---------- the natural voice (ElevenLabs through Kova's server) ---------- */
  function cloud(){ try{ return S.ok!==false&&!!(window.KovaLink&&KovaLink.authFetch&&window.KOVA_FB&&KOVA_FB.auth&&KOVA_FB.auth.currentUser); }catch(e){ return false; } }
  function natural(t){
    return KovaLink.authFetch('/tts',{json:{text:t,long:true}}).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){
      if(!r.ok||!j.audio){ if(r.status===503||r.status===404||r.status===401||r.status===403) S.ok=false; throw new Error(j.error||('HTTP '+r.status)); }
      S.ok=true; return 'data:'+(j.type||'audio/mpeg')+';base64,'+j.audio;
    }); });
  }
  function play(u,o){
    try{ if(window.speechSynthesis) speechSynthesis.cancel(); }catch(e){}
    try{ var a=S.au||(S.au=new Audio()); a.src=u; S.talking=true; a.onended=function(){ S.talking=false; if(o&&o.done) o.done(); }; var p=a.play(); if(p&&p.catch) p.catch(function(){ S.talking=false; }); }catch(e){ S.talking=false; }
  }
  /* say a passage: the natural voice when it is there, else the phone's, written for the ear */
  function speak(text,o){
    o=o||{};
    var parts=prep(text); if(!parts.length) return false;
    stop(); var my=S.n;
    if(cloud()&&!o.device){
      natural(passage(parts)).then(function(u){ if(my===S.n) play(u,o); }).catch(function(){ if(my===S.n) device(parts,o); });
      return true;
    }
    return device(parts,o);
  }
  function stop(){ S.n++; S.talking=false; try{ if(window.speechSynthesis) speechSynthesis.cancel(); }catch(e){} try{ if(S.au) S.au.pause(); }catch(e){} }
  function talking(){ return S.talking; }
  return {speak:speak,device:device,stop:stop,talking:talking,prep:prep,words:words,passage:passage,score:score,best:best,state:S,RATE:RATE};
})();
