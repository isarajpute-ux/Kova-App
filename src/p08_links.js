/* =====================================================================
   KovaLinks - "How it connects": food, sleep and training, from YOUR data.

   Most apps hold one or two of these. Kova holds all three (plus the
   cycle), so it can compare them - honestly:
     - every card says how many nights or sessions it is built on
     - under 3 in either group it says what it still needs, not a guess
     - it is a comparison of your own days, not a cause - the wording
       says "when", never "because"
   Cards:  Sleep -> Workout   volume after 7h+ nights vs short nights
           Late food -> Sleep sleep after eating within 3h of bed vs not
           Training -> Sleep  sleep after a training day vs a rest day
           Cycle -> Workout   session volume by phase (if you track it)
   ===================================================================== */
window.KovaLinks=(function(){
  'use strict';
  var DAY=864e5;
  function lsJ(k){ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function key(t){ var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function mean(a){ return a.length?a.reduce(function(x,y){ return x+y; },0)/a.length:null; }
  function bedMin(v){ var m=String(v||'').match(/^(\d{1,2}):(\d{2})\s*([ap])?/i); if(!m) return null; var h=+m[1]; if(m[3]) h=h%12+(/p/i.test(m[3])?12:0); return h*60+(+m[2]); }

  function data(){
    var live=!!(window.KovaMode&&KovaMode.live);
    var d={sleep:lsJ('kova_sleeplog_v1')||{},sess:(lsJ('kova_log_v1')||[]).filter(function(s){ return s&&s.t&&(live||!s.seed); }),
           food:((lsJ('kova_profile_v2')||{}).foodlog||[]).filter(function(e){ return e&&e.at&&e.src!=='seed'; }),sample:false};
    if(!live&&Object.keys(d.sleep).length<6) return sample();
    return d;
  }
  /* the preview's example weeks: clearly labelled sample */
  function sample(){
    var d={sleep:{},sess:[],food:[],sample:true}, noon=new Date(); noon.setHours(12,0,0,0);
    for(var i=27;i>=1;i--){
      var t=noon.getTime()-i*DAY, late=(i%3===0), trained=(i%2===0), shortN=(i%4===2);
      var mins=Math.round((shortN?350:438)+(trained?26:0)-(late?34:0)+((i*37)%17-8));
      d.sleep[key(t)]={mins:mins,bed:(late?'12:10 a':'10:55 p')};
      d.food.push({at:t-DAY+(late?11:7)*3600e3});
      if(trained) d.sess.push({t:t+6*3600e3,vol:Math.round(9000+(mins>=420?1300:0)+((i*53)%700))});
    }
    return d;
  }
  function card(id,title,a,b,la,lb,unit,fmt,n1,n2,sentence){
    var need=Math.max(0,3-n1)+Math.max(0,3-n2);
    if(need) return {id:id,title:title,need:need,la:la,lb:lb};
    var diff=Math.round((a-b)/b*100);
    return {id:id,title:title,a:a,b:b,la:la,lb:lb,unit:unit,fmt:fmt,n1:n1,n2:n2,diff:diff,text:sentence(diff)};
  }
  function compute(){
    var d=data(), out=[], nights=d.sleep;
    /* 1. sleep the night before -> that day's session volume */
    var good=[], short=[];
    d.sess.forEach(function(s){ var n=nights[key(s.t)]; if(!n||!s.vol) return; var m=+n.mins; if(m>=420) good.push(+s.vol); else if(m<390) short.push(+s.vol); });
    out.push(card('sleep-train','Sleep → Workout',mean(good),mean(short),'After 7h+','After under 6.5h','lb volume',function(v){ return Math.round(v/100)/10+'k'; },good.length,short.length,
      function(x){ return x>=0?'You lift about '+x+'% more on days after a 7-hour night.':'Your sessions after short nights are '+(-x)+'% bigger - rare, and worth watching.'; }));
    /* 2. last food within 3h of bed -> that night's sleep */
    var lastFood={}; d.food.forEach(function(e){ var k=key(e.at+6*3600e3); lastFood[k]=Math.max(lastFood[k]||0,e.at); });
    var late=[], early=[];
    Object.keys(nights).forEach(function(k){
      var n=nights[k], bm=bedMin(n.bed), lf=lastFood[k]; if(bm==null||!lf) return;
      var bedT=new Date(lf); bedT.setHours(Math.floor(bm/60),bm%60,0,0); if(bm<12*60) bedT=new Date(bedT.getTime()+DAY);
      var gap=(bedT-lf)/3600e3; if(gap<0||gap>12) return;
      (gap<3?late:early).push(+n.mins);
    });
    out.push(card('food-sleep','Late food → Sleep',mean(late),mean(early),'Ate within 3h','Ate earlier','min asleep',function(v){ return Math.floor(v/60)+'h '+Math.round(v%60)+'m'; },late.length,early.length,
      function(x){ return x<0?'You sleep about '+Math.round(Math.abs(mean(early)-mean(late)))+' minutes less after eating close to bed.':'Late meals do not seem to cost you sleep so far.'; }));
    /* 3. trained that day -> that night's sleep */
    var trained={}; d.sess.forEach(function(s){ trained[key(s.t)]=1; });
    var tr=[], rest=[];
    Object.keys(nights).forEach(function(k){ var prev=key(new Date(k).getTime()-DAY+12*3600e3); (trained[prev]?tr:rest).push(+nights[k].mins); });
    out.push(card('train-sleep','Training → Sleep',mean(tr),mean(rest),'After training','After rest days','min asleep',function(v){ return Math.floor(v/60)+'h '+Math.round(v%60)+'m'; },tr.length,rest.length,
      function(x){ return x>=0?'You sleep about '+Math.round(mean(tr)-mean(rest))+' minutes longer after training days.':'You sleep a little less after training - late sessions can do that.'; }));
    /* 4. cycle phase -> session volume */
    if(window.KovaCycle&&KovaCycle._data().on){
      var fol=[], lut=[];
      d.sess.forEach(function(s){ var t=KovaCycle.today(s.t); if(!t||!s.vol) return; if(t.phase==='follicular'||t.phase==='ovulatory') fol.push(+s.vol); if(t.phase==='luteal') lut.push(+s.vol); });
      out.push(card('cycle-train','Cycle → Workout',mean(fol),mean(lut),'Follicular','Luteal','lb volume',function(v){ return Math.round(v/100)/10+'k'; },fol.length,lut.length,
        function(x){ return Math.abs(x)<5?'Your training is about the same across your cycle.':'Your sessions are '+Math.abs(x)+'% '+(x>0?'bigger':'smaller')+' in the follicular phase.'; }));
    }
    return {cards:out,sample:d.sample};
  }
  function cardsHTML(r){
    return r.cards.map(function(c){
      if(c.need) return '<div class="kl-c wait"><div class="kl-t">'+esc(c.title)+'</div><div class="kl-s">Needs '+c.need+' more day'+(c.need>1?'s':'')+' of data to compare '+esc(c.la.toLowerCase())+' with '+esc(c.lb.toLowerCase())+'.</div></div>';
      var mx=Math.max(c.a,c.b)||1;
      return '<div class="kl-c"><div class="kl-t">'+esc(c.title)+'</div>'
        +'<div class="kl-bars"><div><i style="height:'+Math.round(c.a/mx*100)+'%"></i><b>'+esc(c.fmt(c.a))+'</b><span>'+esc(c.la)+'</span></div>'
        +'<div><i class="b" style="height:'+Math.round(c.b/mx*100)+'%"></i><b>'+esc(c.fmt(c.b))+'</b><span>'+esc(c.lb)+'</span></div></div>'
        +'<div class="kl-s">'+esc(c.text)+'</div><div class="kl-n">'+c.n1+' vs '+c.n2+' days · a comparison, not a cause</div></div>';
    }).join('');
  }
  /* p11: one row on Today, the comparisons in a pop-up - less to scroll */
  function open(){
    if(!window.openSheet) return;
    var r=compute();
    openSheet('<div class="grab"></div><div class="kl kl-sheet"><div class="kl-hd"><b>How it connects</b><span>'+(r.sample?'Sample weeks · yours appear as you log':'From your own days')+'</span></div>'
      +'<div class="kl-col">'+cardsHTML(r)+'</div>'
      +'<button class="btn ghost" data-kl="recap" style="margin-top:12px">Your week, as pictures to share</button></div>');
    var el=document.querySelector('#sheetIn .kl-sheet');
    if(el) el.addEventListener('click',function(ev){ if(ev.target.closest('[data-kl="recap"]')&&window.KovaRecap) KovaRecap.open(); });
  }
  function paint(){
    var home=document.getElementById('s-home'); if(!home) return;
    var host=document.getElementById('klRail');
    if(!host){
      host=document.createElement('button'); host.id='klRail'; host.className='card kl-row1';
      var grid=home.querySelector('.card[data-go="sleep"]'); grid=grid&&grid.parentElement;
      if(grid&&grid.parentNode) grid.parentNode.insertBefore(host,grid.nextSibling); else home.appendChild(host);
      host.addEventListener('click',open);
    }
    var r=compute(), ready=r.cards.filter(function(c){ return !c.need; });
    host.innerHTML='<span class="kl-r1t">How it connects</span><span class="kl-r1s">'
      +(ready.length?esc(ready[0].text)+(ready.length>1?' +'+(ready.length-1)+' more':''):'Needs a few more days of data')+'</span><span class="kl-r1c" aria-hidden="true">\u203a</span>';
  }
  function start(){ paint(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,600); }); else setTimeout(start,600);
  document.addEventListener('click',function(e){ var g=e.target.closest&&e.target.closest('[data-go="home"]'); if(g) setTimeout(paint,50); },true);
  return {compute:compute,paint:paint,open:open};
})();
