/* =====================================================================
   KovaRecap - "How your week connected", every Sunday (p11).

   A card on Today from Sunday morning until you open it (and any time
   from Settings > Getting started): up to three of your own comparisons
   from "How it connects", your personal records, your streaks, and one
   goal for next week that follows from them.

   Each part becomes a 9:16 picture with Kova's mark, for Stories and
   TikTok, shared through the phone's share sheet (or saved, where a
   browser cannot share files).

   Raw health numbers stay off the pictures unless you switch "Show my
   numbers" on: by default a comparison reads "14% more volume after
   7-hour nights", not the hours or the kilos. Nothing leaves the phone
   until you share it yourself.
   ===================================================================== */
window.KovaRecap=(function(){
  'use strict';
  var DAY=864e5, KEY='kova.recap.v1';
  var S=lsJ(KEY,{numbers:false,seen:'',sunday:false});
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(S)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function key(t){ var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function track(n,p){ try{ if(window.KovaAnalytics) KovaAnalytics.track(n,p||{}); }catch(e){} }

  /* the week that ends today (Sunday) or ended last Sunday */
  function weekOf(t){
    var d=new Date(t||Date.now()); d.setHours(0,0,0,0);
    var back=(d.getDay()+6)%7;                 /* Monday = 0 */
    var mon=new Date(d.getTime()-back*DAY);
    if(d.getDay()!==0) mon=new Date(mon.getTime()-7*DAY);   /* before Sunday: the last full week */
    return {from:mon.getTime(),to:mon.getTime()+7*DAY-1,id:key(mon.getTime())};
  }

  function prs(w){
    var h=lsJ('kova_hist_v1',{})||{}, out=[];
    Object.keys(h).forEach(function(n){
      var L=(h[n]||[]).filter(function(e){ return e&&e.t&&e.e1; });
      var before=L.filter(function(e){ return e.t<w.from; }).reduce(function(m,e){ return Math.max(m,+e.e1||0); },0);
      var inWeek=L.filter(function(e){ return e.t>=w.from&&e.t<=w.to; });
      var best=inWeek.reduce(function(m,e){ return Math.max(m,+e.e1||0); },0);
      if(best&&before&&best>before) out.push({n:n,e1:Math.round(best),up:Math.round((best-before)/before*100)});
    });
    return out.sort(function(a,b){ return b.up-a.up; }).slice(0,3);
  }
  function streaks(w){
    var food={}, sess=0, nights=0;
    try{ (window.KovaFuel?KovaFuel.all():[]).forEach(function(e){ if(e&&e.at>=w.from&&e.at<=w.to&&e.src!=='seed') food[key(e.at)]=1; }); }catch(e){}
    (lsJ('kova_log_v1',[])||[]).forEach(function(s){ if(s&&s.t>=w.from&&s.t<=w.to) sess++; });
    var sl=lsJ('kova_sleeplog_v1',{})||{};
    Object.keys(sl).forEach(function(k){ var t=new Date(k+'T12:00:00').getTime(); if(t>=w.from&&t<=w.to) nights++; });
    return {foodDays:Object.keys(food).length,workouts:sess,nights:nights};
  }
  function goal(links,st){
    var c=function(id){ return links.filter(function(x){ return x.id===id&&!x.need; })[0]; };
    var st1=c('sleep-train'), fs=c('food-sleep');
    if(st1&&st1.diff>=5) return {t:'Get 7 hours before each training day.',why:'Your sessions run '+st1.diff+'% bigger after a 7-hour night.'};
    if(fs&&fs.diff<0) return {t:'Finish eating 3 hours before bed on 5 nights.',why:'You sleep less after eating close to bed.'};
    if(st.foodDays<5) return {t:'Log food on 5 days next week.',why:'Five days is what the food comparisons need to say anything.'};
    if(st.workouts<3) return {t:'Train 3 times next week.',why:'Three sessions a week is where strength keeps moving for most people.'};
    return {t:'Keep the same rhythm next week.',why:'Your week held together; the comparisons will sharpen with another one.'};
  }
  function build(t){
    var w=weekOf(t), L={cards:[],sample:false};
    try{ if(window.KovaLinks) L=KovaLinks.compute(); }catch(e){}
    var cards=(L.cards||[]).filter(function(c){ return !c.need; }).slice(0,3);
    var st=streaks(w), p=prs(w), g=goal(L.cards||[],st);
    return {week:w,sample:!!L.sample,links:cards,prs:p,streaks:st,goal:g};
  }

  /* what goes on each picture; numbers only when switched on */
  /* the sentence with percentages only - "32 minutes less sleep" says more
     about someone than they may want on a Story */
  var PCT={
    'sleep-train':function(d){ return d>=0?'About '+d+'% more training volume after a 7-hour night.':'Sessions after short nights ran '+(-d)+'% bigger.'; },
    'food-sleep':function(d){ return d<0?'About '+(-d)+'% less sleep after eating close to bed.':'Late meals did not cost sleep.'; },
    'train-sleep':function(d){ return d>=0?'About '+d+'% more sleep after training days.':'About '+(-d)+'% less sleep after training days.'; },
    'cycle-train':function(d){ return Math.abs(d)<5?'Training about the same across the cycle.':'Sessions '+Math.abs(d)+'% '+(d>0?'bigger':'smaller')+' in the follicular phase.'; }
  };
  function panes(r){
    var P=[], nums=!!S.numbers;
    r.links.forEach(function(c){
      P.push({kind:'link',title:c.title.replace('→','to'),big:(c.diff>0?'+':'')+c.diff+'%',line:nums||!PCT[c.id]?c.text:PCT[c.id](c.diff),
        foot:(nums?c.la+': '+c.fmt(c.a)+' · '+c.lb+': '+c.fmt(c.b)+' · ':'')+c.n1+' vs '+c.n2+' days. A comparison, not a cause.'});
    });
    if(r.prs.length) P.push({kind:'pr',title:'Personal records',big:String(r.prs.length),line:r.prs.map(function(x){ return x.n+(nums?' ('+x.e1+' est. 1RM, +'+x.up+'%)':' +'+x.up+'%'); }).join(' · '),foot:'New bests this week.'});
    P.push({kind:'streak',title:'Your week',big:String(r.streaks.workouts),line:r.streaks.workouts+' workout'+(r.streaks.workouts===1?'':'s')+' · food logged '+r.streaks.foodDays+' of 7 days · '+r.streaks.nights+' nights of sleep',foot:'Streaks count days you showed up.'});
    P.push({kind:'goal',title:'Next week',big:'1',line:r.goal.t,foot:r.goal.why});
    return P;
  }

  /* ---------------- the 9:16 picture ---------------- */
  function wrap(ctx,text,x,y,maxW,lh,maxLines){
    var words=String(text).split(/\s+/), line='', n=0;
    for(var i=0;i<words.length;i++){
      var t=line?line+' '+words[i]:words[i];
      if(ctx.measureText(t).width>maxW&&line){ ctx.fillText(line,x,y); y+=lh; line=words[i]; if(++n>=maxLines-1){ line=words.slice(i).join(' '); break; } }
      else line=t;
    }
    if(line){ while(ctx.measureText(line).width>maxW&&line.length>4) line=line.slice(0,-2)+'…'; ctx.fillText(line,x,y); y+=lh; }
    return y;
  }
  function render(p,r){
    return new Promise(function(ok,no){
      var c=document.createElement('canvas'); c.width=1080; c.height=1920;
      var x=c.getContext&&c.getContext('2d'); if(!x){ no(new Error('Pictures are not available in this browser.')); return; }
      var g=x.createLinearGradient(0,0,0,1920); g.addColorStop(0,'#1A1B1F'); g.addColorStop(.55,'#0E0F12'); g.addColorStop(1,'#050506');
      x.fillStyle=g; x.fillRect(0,0,1080,1920);
      var rg=x.createRadialGradient(540,380,40,540,380,760); rg.addColorStop(0,'rgba(255,255,255,.13)'); rg.addColorStop(1,'rgba(255,255,255,0)');
      x.fillStyle=rg; x.fillRect(0,0,1080,1920);
      x.fillStyle='#F3F4F7'; x.textBaseline='alphabetic';
      x.font='italic 600 64px Outfit, -apple-system, sans-serif'; x.fillText('kova',96,170);
      x.font='500 34px Outfit, -apple-system, sans-serif'; x.fillStyle='rgba(243,244,247,.6)';
      var d0=new Date(r.week.from), d1=new Date(r.week.to);
      x.fillText('How your week connected · '+d0.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'–'+d1.toLocaleDateString('en-US',{month:'short',day:'numeric'}),96,236);
      x.fillStyle='rgba(243,244,247,.75)'; x.font='600 44px Outfit, -apple-system, sans-serif'; x.fillText(p.title.toUpperCase(),96,720);
      x.fillStyle='#FFFFFF'; x.font='200 300px Outfit, -apple-system, sans-serif'; x.fillText(p.big,80,1040);
      x.font='400 60px Outfit, -apple-system, sans-serif'; x.fillStyle='#F3F4F7';
      var y=wrap(x,p.line,96,1180,888,78,6);
      x.font='400 36px Outfit, -apple-system, sans-serif'; x.fillStyle='rgba(243,244,247,.55)';
      wrap(x,p.foot,96,Math.max(y+40,1620),888,50,3);
      if(r.sample){ x.fillStyle='rgba(243,244,247,.45)'; x.font='500 30px Outfit, sans-serif'; x.fillText('Sample weeks',96,1830); }
      x.fillStyle='rgba(243,244,247,.45)'; x.font='500 30px Outfit, sans-serif'; x.fillText('kova · sleep, training, food, work',560,1830);
      if(c.toBlob) c.toBlob(function(b){ b?ok(b):no(new Error('Could not make the picture.')); },'image/png'); else no(new Error('Could not make the picture.'));
    });
  }
  function share(i){
    var r=build(), p=panes(r)[i]; if(!p) return Promise.resolve(false);
    return render(p,r).then(function(blob){
      var name='kova-week-'+r.week.id+'-'+(i+1)+'.png';
      var file=(typeof File!=='undefined')?new File([blob],name,{type:'image/png'}):null;
      track('recap_share',{kind:p.kind});
      if(file&&navigator.canShare&&navigator.canShare({files:[file]})) return navigator.share({files:[file],title:'My week on Kova'}).then(function(){ return true; },function(){ return false; });
      var url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); },4000);
      say('Saved '+name+'.'); return true;
    },function(e){ say(e.message); return false; });
  }

  /* ---------------- the viewer ---------------- */
  function open(){
    var r=build(), P=panes(r);
    S.seen=r.week.id; save(); paintCard();
    track('recap_open',{count:r.links.length});
    if(!window.openSheet) return;
    openSheet('<div class="grab"></div><div class="krc">'
      +'<div class="title-s" style="font-size:19px">How your week connected</div>'
      +'<div class="sub" style="margin:3px 0 12px">'+(r.sample?'Sample weeks until yours have enough days. ':'')+'Tap a card to share it as a picture.</div>'
      +'<div class="krc-list">'+P.map(function(p,i){
        return '<button class="krc-p" data-i="'+i+'" aria-label="Share: '+esc(p.title)+'"><span class="krc-k">'+esc(p.title)+'</span><span class="krc-b">'+esc(p.big)+'</span><span class="krc-l">'+esc(p.line)+'</span><span class="krc-f">'+esc(p.foot)+'</span><span class="krc-s">Share</span></button>';
      }).join('')+'</div>'
      +'<label class="krc-t"><input type="checkbox" id="krcNums"'+(S.numbers?' checked':'')+'> Show my numbers on the pictures <small>(off: percentages only)</small></label>'
      +'<label class="krc-t"><input type="checkbox" id="krcSun"'+(S.sunday?' checked':'')+'> Remind me every Sunday at 18:00</label>'
      +'</div>');
    var el=document.querySelector('#sheetIn .krc'); if(!el) return;
    el.addEventListener('click',function(ev){ var b=ev.target.closest('.krc-p'); if(b) share(+b.getAttribute('data-i')); });
    document.getElementById('krcNums').addEventListener('change',function(){ S.numbers=this.checked; save(); open(); });
    document.getElementById('krcSun').addEventListener('change',function(){ S.sunday=this.checked; save(); sunday(); });
  }
  /* the Sunday reminder rides the push reminders, like the 7:00 brief */
  function sunday(){
    if(!window.__alerts) return;
    var A=__alerts.get(), cur=A.filter(function(a){ return a.id==='recap'; })[0];
    if(S.sunday&&!cur){ A.push({id:'recap',p:'Home',ic:'i-sparkles',t:'18:00',on:true,days:[0,0,0,0,0,0,1],lead:0,tone:'gentle',title:'Your week, connected',body:'Three things your week showed, and one goal for the next.'}); __alerts.save(); }
    else if(S.sunday&&cur&&!cur.on){ cur.on=true; __alerts.save(); }
    else if(!S.sunday&&cur&&cur.on){ cur.on=false; __alerts.save(); }
    if(S.sunday&&window.KovaPush&&!KovaPush.active()) KovaPush.offer('Your Sunday recap');
  }

  /* ---------------- the card on Today ---------------- */
  /* p11: no card on Today (less to scroll). The recap opens from "How it
     connects", from Settings, and from the Sunday reminder. */
  function paintCard(t){
    var home=document.getElementById('s-home'); if(!home) return;
    var gone=document.getElementById('krcCard'); if(gone) gone.remove();
    if(!paintCard.onHome) return;
    var now=new Date(t||Date.now()), w=weekOf(t), sun=now.getDay()===0, mon=now.getDay()===1;
    var host=document.getElementById('krcCard');
    var due=(sun||mon)&&S.seen!==w.id;
    if(!due){ if(host) host.remove(); return; }
    if(!host){
      host=document.createElement('button'); host.id='krcCard'; host.className='card krc-card';
      var after=document.getElementById('ktoday')||document.getElementById('kqHome')||home.querySelector('.hdr');
      home.insertBefore(host,after?after.nextSibling:home.firstChild);
      host.addEventListener('click',function(){ open(); });
    }
    var r=build(t);
    host.innerHTML='<span class="kova-lbl">KOVA · YOUR WEEK</span><span class="krc-ct">How your week connected</span>'
      +'<span class="sub">'+(r.links.length?r.links.length+' thing'+(r.links.length===1?'':'s')+' your days showed':'Your streaks')+(r.prs.length?', '+r.prs.length+' new best'+(r.prs.length===1?'':'s'):'')+', and one goal.</span>';
  }

  /* any day: Settings > Getting started */
  function settingsRow(){
    if(document.getElementById('krcRow')) return;
    var tour=document.querySelector('#s-settings [data-go="tour"]'); if(!tour) return;
    var d=document.createElement('div');
    d.innerHTML='<div class="list-item tap" id="krcRow" style="margin-bottom:16px"><div class="li-ico"><svg class="ic" style="color:var(--acc)"><use href="#i-sparkles"/></svg></div><div style="flex:1"><div class="li-name">Your week, connected</div><div class="li-sub">Your recap, as pictures to share</div></div><svg class="ic" style="font-size:14px;opacity:.35"><use href="#i-chevron-right"/></svg></div>';
    tour.style.marginBottom='8px';
    tour.parentNode.insertBefore(d.firstChild,tour.nextSibling);
    var row=document.getElementById('krcRow'), nx=row.nextElementSibling;
    if(nx&&nx.id==='ksoRow') row.style.marginBottom='8px';     /* Friends follows in the same group */
    row.addEventListener('click',open);
  }
  function start(){ paintCard(); settingsRow(); document.addEventListener('visibilitychange',function(){ if(!document.hidden) paintCard(); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,700); }); else setTimeout(start,700);

  return {build:build,panes:panes,open:open,share:share,render:render,paintCard:paintCard,weekOf:weekOf,_S:S};
})();
