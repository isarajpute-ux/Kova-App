/* =====================================================================
   KovaChime - Kova's own alert sound (p14, one sound in p15).

   Snapchat has a sound you know is Snapchat before you look. Kova has one
   too, and only one, so it is always Kova: two glass notes, rising a
   fifth. Nothing to pick; every reminder and alert uses it.

   One synth makes it, so it is identical everywhere:
     in the app    played through Web Audio when a reminder or alert
                   shows while Kova is open (nothing to download)
     iPhone        the same sample written as kova_kova.wav into the app's
                   Library/Sounds folder (where iOS looks for push sounds)
     Android       the kova_kova notification channel, its .wav copied
                   into res/raw by native/scripts/copy-web.mjs
   Every push from the server names it. A website's notifications cannot
   carry their own sound (browsers do not allow it), so on the web a
   closed-tab push uses the system sound.
   The file also loads in Node (module.exports), which is how the native
   build renders the .wav file from the same code.
   ===================================================================== */
(function(root){
  'use strict';
  var LIST=[{id:'kova',n:'Kova',d:'Two glass notes, rising'}];
  var LEN={kova:1.1};

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
  function render(id,sr){
    sr=sr||44100;
    var o=new Float32Array(Math.ceil(LEN.kova*sr));
    bell(o,sr,0,1318.5,.38,.42); bell(o,sr,.16,1975.5,.34,.6);
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
  try{ localStorage.removeItem('kova.chime'); }catch(e){}    // the old picker's choice
  var ctx=null, cache={};
  function audio(){
    var A=window.AudioContext||window.webkitAudioContext; if(!A) return null;
    if(!ctx){ try{ ctx=new A(); }catch(e){ return null; } }
    if(ctx.state==='suspended'&&ctx.resume) ctx.resume().catch(function(){});
    return ctx;
  }
  /* plays Kova's sound; quiet when the phone is on silent is up to the phone */
  function play(){
    var c=audio(); if(!c) return false;
    try{
      var b=cache[c.sampleRate];
      if(!b){ var s=render('kova',c.sampleRate); b=c.createBuffer(1,s.length,c.sampleRate); b.getChannelData(0).set(s); cache[c.sampleRate]=b; }
      var src=c.createBufferSource(), g=c.createGain(); g.gain.value=.7;
      src.buffer=b; src.connect(g); g.connect(c.destination); src.start();
      return true;
    }catch(e){ return false; }
  }
  /* the browser only lets sound play after a tap; open the audio on the first one */
  document.addEventListener('pointerdown',function once(){ document.removeEventListener('pointerdown',once,true); audio(); },true);

  api.play=play; api.sound=function(){ return 'kova'; };
  root.KovaChime=api;
})(typeof window!=='undefined'&&window.document?window:module.exports);
