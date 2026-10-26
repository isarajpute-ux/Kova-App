/* =====================================================================
   KovaSleepSheet - Sleep sounds (p09, third design).

   Reference: a tinted header band with the title and a "< Today >"
   switcher; a pull-up sheet with a grab handle; three pill tabs; clean
   cards, each with a title, a small line under it and a round menu
   button, a big number with its unit, a column chart with highlighted
   columns, and a half-circle gauge with a dot, a status pill and times.

     band      "Sleep sounds", and < family > to move between the six
     tabs      Sounds | Timer | Mixes
     Sounds    one column per sound in the family - tap to add or remove,
               drag up or down for its volume
     Timer     the half-circle gauge: drag the dot, or - / +
     Mixes     your usual, saved mixes, starters - tap to play
   Dark, soft light and light each have their own colours.
   ===================================================================== */
window.KovaSleepSheet=(function(){
  'use strict';
  var STOPS=[0,5,10,15,20,30,45,60,90,120,240,480];
  var S={tab:'sounds', cat:'rain', tmr:6, host:null, drag:null, moved:false};
  function K(){ return window.KovaSound; }
  function M(){ return window.KovaMix; }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function ls(k,v){ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)||'null'); localStorage.setItem(k,JSON.stringify(v)); }catch(e){ return null; } }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function cats(){ return (K()&&K().cats)||[]; }
  function sounds(c){ return ((K()&&K().all)||[]).filter(function(s){ return s.c===c; }); }
  function clock(t){ return new Date(t).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }
  function tLabel(m){ return m===0?'Off':(m>=60?(m%60?Math.floor(m/60)+'h '+(m%60):(m/60)+'h'):String(m)); }

  function mount(){
    var scr=document.getElementById('s-sounds'); if(!scr||!K()) return false;
    if(S.host&&S.host.isConnected) return true;
    var d=document.createElement('div'); d.className='ksd'; d.id='ksdSheet';
    scr.insertBefore(d, document.getElementById('sndDialWrap')||null);
    scr.classList.add('ksd-on');
    var mx=document.getElementById('sndMixes'); if(mx&&mx.previousElementSibling) mx.previousElementSibling.classList.add('ksd-old');
    S.host=d;
    var sv=ls('kova.snd.sheet'); if(sv){ S.tab=sv.tab||S.tab; S.cat=sv.cat||S.cat; if(sv.tmr!=null) S.tmr=sv.tmr; }
    d.addEventListener('click',onClick);
    wireDrag(d);
    return true;
  }
  function cat(){ return cats().filter(function(x){ return x.k===S.cat; })[0]||cats()[0]; }
  function header(){
    return '<div class="ksd-band"><div class="ksd-ttl">Sleep sounds</div>'
      +'<div class="ksd-sw"><button data-a="prev" aria-label="Previous family">‹</button><span>'+esc(cat().n)+'</span><button data-a="next" aria-label="Next family">›</button></div></div>';
  }
  function tabs(){
    return '<div class="ksd-tabs" role="tablist">'+[['sounds','Sounds'],['timer','Timer'],['mixes','Mixes']].map(function(t){
      return '<button role="tab" aria-selected="'+(S.tab===t[0])+'" class="'+(S.tab===t[0]?'on':'')+'" data-tab="'+t[0]+'">'+t[1]+'</button>';
    }).join('')+'</div>';
  }
  function more(a,label,sym){ return '<button class="ksd-more" data-a="'+a+'" aria-label="'+label+'">'+(sym||'<i></i><i></i><i></i>')+'</button>'; }

  function soundsTab(){
    var k=K(), c=cat(), list=sounds(c.k), act=k.active(), lv=k.levels();
    var on=list.filter(function(s){ return act.indexOf(s.id)>=0; }).length;
    var cols=list.map(function(s){
      var a=act.indexOf(s.id)>=0, v=a?(lv[s.id]||.7):0;
      return '<button class="ksd-col'+(a?' on':'')+'" data-id="'+s.id+'" aria-pressed="'+a+'" aria-label="'+esc(s.n)+(a?', volume '+Math.round(v*100)+'%':'')+'">'
        +'<span class="ksd-bar" style="bottom:'+(a?Math.round(16+v*60):12)+'%"></span><em>'+esc(s.n.replace(/ noise$/,''))+'</em></button>';
    }).join('');
    return '<div class="ksd-card"><div class="ksd-ch"><div><div class="ksd-h">'+esc(c.n)+'</div><div class="ksd-d"><span>'+esc(c.d)+'</span><span>'+list.length+' sounds</span></div></div>'
      +more('save','Save what is playing as a mix')+'</div>'
      +'<div class="ksd-big">'+on+'</div><div class="ksd-u">'+(on===1?'sound playing here':'sounds playing here')+' · '+act.length+' in total</div>'
      +'<div class="ksd-cols">'+cols+'</div>'
      +'<div class="ksd-hint">Tap a column to add it. Drag it up or down for volume.</div></div>'
      +nowCard();
  }
  function nowCard(){
    var k=K(), act=k.active(), playing=k.isPlaying();
    return '<div class="ksd-card ksd-now"><div class="ksd-ch"><div><div class="ksd-h">'+(playing?'Playing':'Now playing')+'</div>'
      +'<div class="ksd-d"><span>'+(act.length?esc(k.title()):'Nothing yet')+'</span>'+(k.timerLeft()>0?'<span>'+Math.ceil(k.timerLeft()/60)+' min left</span>':'')+'</div></div>'
      +'<button class="ksd-play'+(playing?' on':'')+'" data-a="play" aria-label="'+(playing?'Pause':'Play')+'">'
      +(playing?'<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>':'<svg viewBox="0 0 24 24"><path class="f" d="M8 5.5v13l11-6.5z"/></svg>')+'</button></div>'
      +(act.length?'<div class="ksd-chips">'+act.map(function(id){ var s=k.byId(id); return '<button class="ksd-chip" data-id="'+id+'">'+esc(s?s.n:id)+' <span>×</span></button>'; }).join('')+'</div>':'')
      +'</div>';
  }
  function timerTab(){
    var k=K(), m=STOPS[S.tmr], f=S.tmr/(STOPS.length-1), running=k.timerLeft()>0;
    var R=110, cx=140, cy=140, a0=200, a1=340, ang=a0+(a1-a0)*f;
    var P=function(a){ var r=a*Math.PI/180; return (cx+R*Math.cos(r)).toFixed(1)+' '+(cy+R*Math.sin(r)).toFixed(1); };
    var dot=P(ang).split(' ');
    var start=Date.now(), end=start+m*60e3;
    return '<div class="ksd-card"><div class="ksd-ch"><div><div class="ksd-h">Sleep timer</div><div class="ksd-d"><span>Fades out over the last two minutes</span></div></div>'
      +more('toff','Turn the timer off','×')+'</div>'
      +'<div class="ksd-gauge" data-g="1"><svg viewBox="0 0 280 170" aria-hidden="true"><path class="ksd-arc" d="M'+P(a0)+' A'+R+' '+R+' 0 0 1 '+P(a1)+'"/>'
        +(m?'<path class="ksd-arc hot" d="M'+P(ang)+' A'+R+' '+R+' 0 0 1 '+P(a1)+'"/>':'')
        +'<circle class="ksd-dot" cx="'+dot[0]+'" cy="'+dot[1]+'" r="7"/></svg>'
        +'<div class="ksd-gv"><div class="ksd-big">'+tLabel(m)+'</div><div class="ksd-u">'+(m===0?'no timer':(m>=60?'hours':'minutes'))+'</div></div></div>'
      +'<div class="ksd-gfoot"><span>'+(m?clock(start):'—')+'</span><span class="ksd-pill">'+(running?'Running':(m?'Ready':'Off'))+'</span><span>'+(m?clock(end):'—')+'</span></div>'
      +'<div class="ksd-steps"><button data-a="tless" aria-label="Shorter">−</button><button class="ksd-go" data-a="tgo">'+(m?'Start the timer':'Play without a timer')+'</button><button data-a="tmore" aria-label="Longer">+</button></div></div>';
  }
  function mixesTab(){
    var mx=M(), k=K(), cur=k.active().slice().sort().join(',');
    if(!mx) return '<div class="ksd-card"><div class="ksd-h">Mixes</div></div>';
    var rows=[], au=mx.auto();
    if(au.ready) rows.push({key:au.mix.key,t:au.mix.name,s:'Your usual · '+au.mix.nights+' of your last '+au.seen+' sessions',ids:au.mix.ids});
    else rows.push({wait:1,t:'Your usual',s:au.have+' of '+au.need+' sessions logged · Kova learns your mix once it repeats'});
    mx.saved().forEach(function(m){ rows.push({key:m.key,t:m.name,s:'Saved · '+m.ids.map(function(i){ var s=k.byId(i); return s?s.n:i; }).join(' · '),ids:m.ids,del:1}); });
    mx.starters().forEach(function(m){ rows.push({key:m.key,t:m.name,s:'Starter · '+m.why,ids:m.ids}); });
    return '<div class="ksd-card"><div class="ksd-ch"><div><div class="ksd-h">Mixes</div><div class="ksd-d"><span>'+rows.length+' ready</span><span>Tap to play</span></div></div>'
      +more('save','Save what is playing as a mix','+')+'</div>'
      +rows.map(function(r){
        var on=r.ids&&r.ids.slice().sort().join(',')===cur;
        return '<div class="ksd-mix'+(on?' on':'')+(r.wait?' wait':'')+'"'+(r.key?' data-mix="'+r.key+'" role="button" tabindex="0"':'')+'><div><b>'+esc(r.t)+'</b><span>'+esc(r.s)+'</span></div>'
          +(r.del?'<button class="ksd-x" data-del="'+r.key+'" aria-label="Delete">×</button>':'')+(r.key?'<i class="ksd-pl">'+(on?'✓':'▶')+'</i>':'')+'</div>';
      }).join('')+'</div>';
  }

  function paint(){
    if(!mount()) return;
    var body=S.tab==='timer'?timerTab():(S.tab==='mixes'?mixesTab():soundsTab());
    S.host.innerHTML=header()+'<div class="ksd-sheet"><i class="ksd-grab"></i>'+tabs()+body+'</div>';
    ls('kova.snd.sheet',{tab:S.tab,cat:S.cat,tmr:S.tmr});
  }
  function turn(d){ var C=cats(), i=C.map(function(c){ return c.k; }).indexOf(S.cat); S.cat=C[((i+d)%C.length+C.length)%C.length].k; S.tab='sounds'; paint(); }
  function first(){ var l=sounds(S.cat); return l[0]?l[0].id:'rain'; }
  function onClick(e){
    if(S.moved){ S.moved=false; return; }
    var k=K(), t=e.target.closest('[data-tab]'); if(t){ S.tab=t.getAttribute('data-tab'); paint(); return; }
    var col=e.target.closest('.ksd-col'); if(col){ k.toggle(col.getAttribute('data-id')); paint(); return; }
    var ch=e.target.closest('.ksd-chip'); if(ch){ k.toggle(ch.getAttribute('data-id')); paint(); return; }
    var del=e.target.closest('[data-del]'); if(del){ M().forget(del.getAttribute('data-del')); paint(); return; }
    var mx=e.target.closest('[data-mix]'); if(mx){ var m=M().byKey(mx.getAttribute('data-mix')); if(m){ k.load(m); say(m.name+' playing.'); paint(); } return; }
    var a=e.target.closest('[data-a]'); if(!a) return;
    var act=a.getAttribute('data-a');
    if(act==='prev') return turn(-1);
    if(act==='next') return turn(1);
    if(act==='play'){ if(k.isPlaying()) k.pause(); else if(!k.active().length) k.toggle(first()); else k.play(); paint(); return; }
    if(act==='tless'){ S.tmr=Math.max(0,S.tmr-1); paint(); return; }
    if(act==='tmore'){ S.tmr=Math.min(STOPS.length-1,S.tmr+1); paint(); return; }
    if(act==='toff'){ S.tmr=0; k.setTimerMin(0); say('Sleep timer off.'); paint(); return; }
    if(act==='tgo'){ if(!k.active().length) k.toggle(first()); else if(!k.isPlaying()) k.play(); k.setTimerMin(STOPS[S.tmr]); var mm=STOPS[S.tmr]; say(mm?'Sound stops in '+(mm>=60?tLabel(mm):mm+' min')+'.':'Playing, no timer.'); paint(); return; }
    if(act==='save'){
      var ids=k.active();
      if(!ids.length){ say('Play something first, then save it as a mix.'); return; }
      var m2=M().save(ids,k.levels()); say('Saved as “'+m2.name+'”.'); S.tab='mixes'; paint();
    }
  }
  function wireDrag(host){
    host.addEventListener('pointerdown',function(e){
      var col=e.target.closest('.ksd-col.on'), g=e.target.closest('[data-g]');
      if(col) S.drag={t:'col',id:col.getAttribute('data-id'),el:col,y0:e.clientY,moved:false};
      else if(g) S.drag={t:'g',el:g};
    });
    host.addEventListener('pointermove',function(e){
      var d=S.drag; if(!d) return;
      if(d.t==='col'){
        if(Math.abs(e.clientY-d.y0)>4) d.moved=true;
        if(!d.moved) return;
        var r=d.el.getBoundingClientRect(), v=Math.max(.05,Math.min(1,(r.bottom-e.clientY)/r.height));
        K().setLevel(d.id,v);
        var b=d.el.querySelector('.ksd-bar'); if(b) b.style.bottom=Math.round(16+v*60)+'%';
      } else {
        var rr=d.el.getBoundingClientRect(), cx=rr.left+rr.width/2, cy=rr.top+rr.height*(140/170);
        var ang=Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI; if(ang<0) ang+=360;
        var i=Math.round(Math.max(0,Math.min(1,(ang-200)/140))*(STOPS.length-1));
        if(i!==S.tmr){ S.tmr=i; paint(); S.drag={t:'g',el:S.host.querySelector('[data-g]')}; }
      }
    });
    var up=function(){ var d=S.drag; S.drag=null; if(d&&d.t==='col'&&d.moved){ S.moved=true; paint(); } };
    host.addEventListener('pointerup',up); host.addEventListener('pointercancel',up);
  }
  function hook(){
    var k=K(); if(!k||k.__sheet) return;
    ['toggle','load','play','pause','stop'].forEach(function(fn){
      var orig=k[fn]; if(typeof orig!=='function') return;
      k[fn]=function(){ var r=orig.apply(k,arguments); if(S.host&&!S.drag) setTimeout(paint,0); return r; };
    });
    k.__sheet=1;
  }
  function start(){ if(!K()) return; hook(); paint(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,50); }); else setTimeout(start,50);
  return {paint:paint,turn:turn,_state:S};
})();
