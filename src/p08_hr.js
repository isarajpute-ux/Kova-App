/* =====================================================================
   KovaHR - live heart rate during a workout (p10).

   Any Bluetooth heart rate strap or arm band that speaks the standard
   Heart Rate profile (service 0x180D, measurement 0x2A37): Polar H10 /
   Verity, Garmin HRM, Wahoo TICKR, Coros, most gym bands. Also watches
   that broadcast HR (Garmin, Polar, COROS; Apple Watch only through a
   broadcaster app such as HeartCast or Echo).

   Honest limits, said in the app too:
     - Web Bluetooth works in Chrome / Edge on Android, Mac, Windows and
       ChromeOS. It does not exist in Safari or any iPhone browser. On
       iPhone, live HR arrives through the Kova app (native wrapper), which
       calls KovaHR.push(bpm).
   Zones are % of estimated max HR, Tanaka (208 - 0.7 x age); it can be
   off by 10 bpm either way, so a tested max you type in wins.
   Each checked set stores the bpm at that moment; the session log gets
   average, max and minutes per zone.
   ===================================================================== */
window.KovaHR=(function(){
  'use strict';
  var st={bpm:0,at:0,dev:null,name:'',samples:[],state:'off'}; // off | connecting | on | lost
  var ZN=[['Z1','Easy',.5],['Z2','Steady',.6],['Z3','Tempo',.7],['Z4','Hard',.8],['Z5','Max',.9]];
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function lsS(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function supported(){ return !!(window.navigator&&navigator.bluetooth&&navigator.bluetooth.requestDevice); }
  function native(){ return !!(window.KovaNative&&KovaNative.hasLiveHR&&KovaNative.hasLiveHR()); }
  function max(){
    var m=+lsJ('kova.hr.max',0); if(m>120) return {v:m,src:'yours'};
    var age=+lsJ('kova.hr.age',0);
    try{ if(!age&&window.KP){ var me=KP.get('me')||{}; age=+me.age||0; } }catch(e){}
    return {v:Math.round(208-0.7*(age||30)),src:age?'age':'guess'};
  }
  function zone(b){ var m=max().v, f=b/m, z=-1; ZN.forEach(function(x,i){ if(f>=x[2]) z=i; }); return z; }
  /* the standard measurement: flags byte, then uint8 or uint16 bpm */
  function parse(dv){ var f=dv.getUint8(0); return (f&1)?dv.getUint16(1,true):dv.getUint8(1); }
  function push(b){
    b=Math.round(+b); if(!(b>25&&b<250)) return;
    st.bpm=b; st.at=Date.now(); if(st.state!=='on'){ st.state='on'; }
    var L=st.samples; if(!L.length||st.at-L[L.length-1][0]>=1000) L.push([st.at,b]);
    if(L.length>14400) L.splice(0,L.length-14400);
    paint();
  }
  function bpm(){ return st.bpm&&Date.now()-st.at<10000?st.bpm:0; }
  function summary(since){
    var L=st.samples.filter(function(s){ return s[0]>=(since||0); }); if(L.length<5) return null;
    var sum=0,mx=0,mins=[0,0,0,0,0];
    L.forEach(function(s,i){ sum+=s[1]; mx=Math.max(mx,s[1]); var z=zone(s[1]); if(z>=0){ var dt=i?Math.min(5000,s[0]-L[i-1][0]):1000; mins[z]+=dt/60000; } });
    return {avg:Math.round(sum/L.length),max:mx,zones:mins.map(function(m){ return Math.round(m*10)/10; }),hrmax:max().v};
  }
  function connect(){
    if(!supported()){ sheet(); return; }
    st.state='connecting'; paint();
    navigator.bluetooth.requestDevice({filters:[{services:['heart_rate']}]}).then(function(dev){
      st.dev=dev; st.name=dev.name||'Heart rate';
      dev.addEventListener('gattserverdisconnected',function(){ st.state='lost'; paint(); setTimeout(function(){ if(st.state==='lost'&&st.dev) attach(st.dev).catch(function(){}); },1500); });
      return attach(dev);
    }).catch(function(e){ st.state='off'; paint(); if(e&&e.name!=='NotFoundError'&&window.toast) toast('Could not connect: '+(e.message||e.name)); });
  }
  function attach(dev){
    return dev.gatt.connect().then(function(s){ return s.getPrimaryService('heart_rate'); })
      .then(function(sv){ return sv.getCharacteristic('heart_rate_measurement'); })
      .then(function(ch){ ch.addEventListener('characteristicvaluechanged',function(ev){ push(parse(ev.target.value)); }); return ch.startNotifications(); })
      .then(function(){ st.state='on'; paint(); if(window.toast) toast(st.name+' connected.'); });
  }
  function disconnect(){ try{ if(st.dev&&st.dev.gatt.connected) st.dev.gatt.disconnect(); }catch(e){} st.dev=null; st.state='off'; st.bpm=0; paint(); }

  function sheet(){
    var m=max(), sup=supported(), nat=native();
    var h='<div class="grab"></div><div class="khr-sh">'
      +'<div class="title-s" style="font-size:18px;margin-bottom:6px">Live heart rate</div>'
      +(nat?'<div class="khr-p"><b>In the Kova app:</b> your Apple Watch or Health Connect heart rate comes in automatically while a workout is open. It can lag up to a minute; a strap is instant.</div>':'')
      +(sup||nat?'':'<div class="khr-warn">This browser cannot talk to Bluetooth heart rate devices. That is every browser on iPhone and iPad, and Safari on Mac. Use Chrome or Edge on Android, Mac or Windows, or the Kova app on iPhone.</div>')
      +'<div class="khr-p">Works with any strap or band that uses the standard Bluetooth heart rate signal: Polar H10 or Verity, Garmin HRM, Wahoo TICKR, COROS, most gym bands. Garmin, Polar and COROS watches can broadcast too. Apple Watch needs a broadcaster app (HeartCast or Echo).</div>'
      +'<div class="khr-p">Each set you check saves your heart rate at that moment. The workout log keeps the average, the peak and minutes in each zone.</div>'
      +'<div class="lbl" style="margin:12px 0 6px">YOUR ZONES</div><div class="khr-zs">'
      +ZN.map(function(z,i){ var lo=Math.round(m.v*z[2]), hi=i<4?Math.round(m.v*ZN[i+1][2])-1:m.v; return '<div class="khr-z z'+(i+1)+'"><b>'+z[0]+'</b><span>'+z[1]+'</span><i>'+lo+'–'+hi+'</i></div>'; }).join('')+'</div>'
      +'<div class="khr-row"><label>Age<input id="khrAge" type="number" min="12" max="100" value="'+esc(lsJ('kova.hr.age','')||'')+'" placeholder="30"></label>'
      +'<label>Tested max HR<input id="khrMax" type="number" min="120" max="230" value="'+esc(lsJ('kova.hr.max','')||'')+'" placeholder="'+m.v+'"></label></div>'
      +'<div class="khr-note">Max '+m.v+' bpm '+(m.src==='yours'?'(yours)':m.src==='age'?'from your age (208 − 0.7 × age). A tested max beats the formula.':'estimated for age 30. Add your age.')+'</div>'
      +'<div class="khr-acts">'+(st.state==='on'?'<button class="khr-b" data-hr="off">Disconnect '+esc(st.name)+'</button>':(sup?'<button class="khr-b pri" data-hr="go">Find my strap</button>':''))
      +'<button class="khr-b" data-hr="close">Done</button></div></div>';
    if(window.openSheet) openSheet(h); else return;
    var sh=document.querySelector('.khr-sh'); if(!sh) return;
    var save=function(){ var a=+document.getElementById('khrAge').value||0, x=+document.getElementById('khrMax').value||0; lsS('kova.hr.age',a||''); lsS('kova.hr.max',x||''); paint(); };
    document.getElementById('khrAge').onchange=save; document.getElementById('khrMax').onchange=save;
    sh.querySelectorAll('[data-hr]').forEach(function(b){ b.onclick=function(){ var a=b.getAttribute('data-hr'); save(); if(window.closeSheet) closeSheet(); if(a==='go') connect(); if(a==='off') disconnect(); }; });
  }

  function paint(){
    var slot=document.getElementById('hrSlot'); if(!slot) return;
    var b=bpm(), z=b?zone(b):-1, s=st.state;
    if(s==='on'&&!b) s='lost';
    var S=summary(0);
    slot.innerHTML='<button class="khr'+(b?' live z'+(z+1):'')+(s==='connecting'?' wait':'')+'" data-khr="1" aria-label="Heart rate">'
      +'<span class="khr-h">♥</span>'
      +(b?'<b>'+b+'</b><span class="khr-u">bpm</span><span class="khr-zn">'+(z>=0?ZN[z][0]+' '+ZN[z][1]:'Below Z1')+'</span>'
          +(S?'<span class="khr-s">avg '+S.avg+' · peak '+S.max+'</span>':'')
         :'<span class="khr-t">'+(s==='connecting'?'Connecting…':s==='lost'?'Signal lost · tap':'Heart rate · connect a strap')+'</span>')
      +'</button>';
  }
  document.addEventListener('click',function(e){ var b=e.target.closest&&e.target.closest('[data-khr]'); if(!b) return; if(st.state==='off'&&supported()) connect(); else sheet(); });
  function start(){ paint(); setInterval(function(){ if(st.state==='on') paint(); },5000); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,500); }); else setTimeout(start,500);
  return {bpm:bpm,push:push,summary:summary,zone:zone,max:max,parse:parse,connect:connect,disconnect:disconnect,sheet:sheet,supported:supported,_st:st,ZN:ZN};
})();
