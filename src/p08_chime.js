/* =====================================================================
   KovaChime - Kova's own alert sound (p14).

   Snapchat has a sound you know is Snapchat before you look. Kova now
   has its own too, picked in Settings > Reminders > Alert sound:
     Kova     two glass notes, rising a fifth (the default)
     Pulse    a soft double beat, like a heartbeat
     Dawn     three warm notes going up
     Ripple   a quick bright sparkle
     Phone    your phone's normal sound
     Silent   the banner only

   One synth makes every sound, so they are identical everywhere:
     in the app    played through Web Audio when a reminder or alert
                   shows while Kova is open (nothing to download)
     iPhone        the same samples written as .wav files into the app's
                   Library/Sounds folder (where iOS looks for push sounds)
     Android       one notification channel per sound, its .wav copied
                   into res/raw by native/scripts/copy-web.mjs
   The server sends each push with the sound you picked. A website's
   notifications cannot carry their own sound (browsers do not allow it),
   so on the web a closed-tab push uses the system sound.
   The file also loads in Node (module.exports), which is how the native
   build renders the .wav files from the same code.
   ===================================================================== */
(function(root){
  'use strict';
  var KEY='kova.chime';
  var LIST=[
    {id:'kova',n:'Kova',d:'Two glass notes, rising'},
    {id:'pulse',n:'Pulse',d:'A soft double beat'},
    {id:'dawn',n:'Dawn',d:'Three warm notes'},
    {id:'ripple',n:'Ripple',d:'A quick bright sparkle'},
    {id:'default',n:'Phone',d:'Your phone’s normal sound'},
    {id:'silent',n:'Silent',d:'The banner only'}
  ];
  var LEN={kova:1.1,pulse:.75,dawn:1.25,ripple:.9};

  /* ---- the synth: pure numbers, no browser needed ---- */
  function bell(o,sr,t0,f,amp,decay,parts){
    parts=parts||[[1,1],[2.01,.32],[2.76,.18],[5.4,.06]];
    var start=Math.floor(t0*sr), n=o.length, atk=Math.floor(.004*sr);
    parts.forEach(function(p){
      var w=2*Math.PI*f*p[0]/sr, a=amp*p[1], d=decay/Math.sqrt(p[0]);
      for(var i=start;i<n;i++){
        var k=i-start, env=(k<atk?k/atk:1)*Math.exp(-(k/sr)/d);
        if(env<1e-4&&k>atk) break;
        o[i]+=a*env*Math.sin(w*k);
      }
    });
  }
  function thump(o,sr,t0,amp){
    var start=Math.floor(t0*sr), ph=0;
    for(var i=start;i<o.length;i++){
      var t=(i-start)/sr, f=62+90*Math.exp(-t/.035), env=Math.min(1,t/.003)*Math.exp(-t/.11);
      if(t>.6) break;
      ph+=2*Math.PI*f/sr; o[i]+=amp*env*Math.sin(ph);
    }
  }
  function render(id,sr){
    sr=sr||44100;
    var o=new Float32Array(Math.ceil((LEN[id]||1)*sr));
    if(id==='pulse'){ thump(o,sr,0,.9); thump(o,sr,.24,.62); bell(o,sr,0,880,.05,.12,[[1,1]]); }
    else if(id==='dawn'){ bell(o,sr,0,1046.5,.34,.38,[[1,1],[4,.12],[10,.03]]); bell(o,sr,.14,1318.5,.32,.4,[[1,1],[4,.12],[10,.03]]); bell(o,sr,.28,1568,.34,.55,[[1,1],[4,.1],[10,.02]]); }
    else if(id==='ripple'){ [2093,2637,3136,3951,3136].forEach(function(f,i){ bell(o,sr,i*.055,f,.16-i*.015,.22,[[1,1],[2.01,.2]]); }); }
    else { bell(o,sr,0,1318.5,.38,.42); bell(o,sr,.16,1975.5,.34,.6); }
    /* soft limiter and a short fade so nothing clicks */
    var peak=0, i; for(i=0;i<o.length;i++) peak=Math.max(peak,Math.abs(o[i]));
    var g=peak?.85/peak:1, fade=Math.floor(.03*sr);
    for(i=0;i<o.length;i++){ var v=o[i]*g; if(i>o.length-fade) v*=(o.length-i)/fade; o[i]=v; }
    return o;
  }
  /* 16-bit mono .wav, for the native app's sound files */
  function wav(id,sr){
    sr=sr||44100;
    var s=render(id,sr), n=s.length, buf=new ArrayBuffer(44+n*2), v=new DataView(buf), p=0;
    function str(t){ for(var j=0;j<t.length;j++) v.setUint8(p++,t.charCodeAt(j)); }
    str('RIFF'); v.setUint32(p,36+n*2,true); p+=4; str('WAVE'); str('fmt '); v.setUint32(p,16,true); p+=4;
    v.setUint16(p,1,true); p+=2; v.setUint16(p,1,true); p+=2; v.setUint32(p,sr,true); p+=4; v.setUint32(p,sr*2,true); p+=4;
    v.setUint16(p,2,true); p+=2; v.setUint16(p,16,true); p+=2; str('data'); v.setUint32(p,n*2,true); p+=4;
    for(var i=0;i<n;i++){ v.setInt16(p,Math.max(-1,Math.min(1,s[i]))*32767,true); p+=2; }
    return new Uint8Array(buf);
  }
  function file(id){ return 'kova_'+id; }

  var api={LIST:LIST,render:render,wav:wav,file:file};
  if(typeof window==='undefined'||!window.document){ root.KovaChime=api; return; }

  /* ---- in the app ---- */
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  var S=lsJ(KEY,{sound:'kova'});
  if(!LIST.some(function(x){ return x.id===S.sound; })) S.sound='kova';
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){} }
  var ctx=null, cache={};
  function audio(){
    var A=window.AudioContext||window.webkitAudioContext; if(!A) return null;
    if(!ctx){ try{ ctx=new A(); }catch(e){ return null; } }
    if(ctx.state==='suspended'&&ctx.resume) ctx.resume().catch(function(){});
    return ctx;
  }
  /* plays the chosen sound (or the one named); quiet when the phone is on
     silent is up to the phone, and "Phone"/"Silent" play nothing here */
  function play(id){
    id=id||S.sound;
    if(!LEN[id]) return false;
    var c=audio(); if(!c) return false;
    try{
      var b=cache[id+c.sampleRate];
      if(!b){ var s=render(id,c.sampleRate); b=c.createBuffer(1,s.length,c.sampleRate); b.getChannelData(0).set(s); cache[id+c.sampleRate]=b; }
      var src=c.createBufferSource(), g=c.createGain(); g.gain.value=.7;
      src.buffer=b; src.connect(g); g.connect(c.destination); src.start();
      return true;
    }catch(e){ return false; }
  }
  function set(id){
    if(!LIST.some(function(x){ return x.id===id; })) return;
    S.sound=id; save(); paint();
    try{ if(window.KovaPush&&KovaPush.sync) KovaPush.sync(); }catch(e){}
    try{ if(window.KovaAnalytics) KovaAnalytics.track('alert_sound',{feature:id}); }catch(e){}
  }

  /* ---- Settings > Reminders: the picker under "Send a test notification" ---- */
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function paint(){
    var el=document.getElementById('kchPick');
    if(!el){
      var t=document.getElementById('alertTest'); if(!t||!t.parentNode) return;
      el=document.createElement('div'); el.id='kchPick'; el.className='kch card';
      t.parentNode.insertBefore(el,t);
      el.addEventListener('click',function(ev){ var b=ev.target.closest('[data-kch]'); if(!b) return; var id=b.getAttribute('data-kch'); set(id); play(id); });
    }
    var cur=LIST.filter(function(x){ return x.id===S.sound; })[0];
    el.innerHTML='<div class="kch-h"><span>Alert sound</span><small>'+esc(cur.d)+'</small></div>'
      +'<div class="kch-row" role="radiogroup" aria-label="Alert sound">'+LIST.map(function(x){
        return '<button type="button" role="radio" aria-checked="'+(x.id===S.sound)+'" class="kch-b'+(x.id===S.sound?' on':'')+'" data-kch="'+x.id+'">'
          +(LEN[x.id]?'<i class="kch-w" aria-hidden="true">'+wave(x.id)+'</i>':'')+esc(x.n)+'</button>'; }).join('')+'</div>'
      +'<div class="kch-f">Tap one to hear it. Reminders and Kova’s alerts use it in the app, and on your phone even when Kova is closed.</div>';
  }
  /* a tiny drawing of each sound's shape */
  function wave(id){
    var s=render(id,2000), n=18, step=Math.floor(s.length/n), h='';
    for(var i=0;i<n;i++){ var m=0; for(var j=i*step;j<(i+1)*step&&j<s.length;j++) m=Math.max(m,Math.abs(s[j])); h+='<b style="height:'+Math.max(2,Math.round(m*14))+'px"></b>'; }
    return h;
  }
  function start(){ paint(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,300); }); else setTimeout(start,300);
  /* the browser only lets sound play after a tap; open the audio on the first one */
  document.addEventListener('pointerdown',function once(){ document.removeEventListener('pointerdown',once,true); audio(); },true);

  api.play=play; api.set=set; api.sound=function(){ return S.sound; }; api.paint=paint;
  root.KovaChime=api;
})(typeof window!=='undefined'&&window.document?window:module.exports);
