/* =====================================================================
   KovaPatterns - "Patterns Kova found", on the workout summary (p48).

   The owner's grader: Kova's cross-pillar insight ("you lift more after a
   good night", "your volume in the luteal phase") was only in comments.
   From your own log only:
     sleep   workout volume (KSESS.log) after 7+ hours of sleep against
             after less (the night that ended that morning, KovaSleepLog);
     cycle   with cycle tracking on, volume in the follicular and
             ovulatory phase against the luteal phase (the phase on that
             day, worked out from your own period starts).
   A pattern shows only with at least 5 workouts on each side; until then
   one line says how many there are. Averages of your own workouts, not
   cause and effect, and the card says so.
   ===================================================================== */
window.KovaPatterns=(function(){
  'use strict';
  var MIN=5, DAY=864e5, GOOD=420;   /* 7 hours */
  function key(t){ var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function sod(t){ var d=new Date(t); d.setHours(0,0,0,0); return d.getTime(); }
  function avg(a){ return a.reduce(function(s,x){ return s+x; },0)/a.length; }
  function sessions(){ try{ return (window.KSESS&&KSESS.log()||[]).filter(function(s){ return s&&s.t&&s.vol>0&&!s.live; }); }catch(e){ return []; } }
  function compare(a,b){
    if(a.length<MIN||b.length<MIN) return null;
    var x=avg(a), y=avg(b);
    return {a:Math.round(x),b:Math.round(y),pct:y?Math.round((x-y)/y*100):0};
  }

  /* volume after 7+ hours of sleep against after less */
  function sleep(list){
    var S={}, hi=[], lo=[];
    try{ (window.KovaSleepLog?KovaSleepLog.nights():[]).forEach(function(n){ if(n.mins>0) S[n.k]=n.mins; }); }catch(e){}
    list.forEach(function(s){ var m=S[key(s.t)]; if(m==null) return; (m>=GOOD?hi:lo).push(s.vol); });
    return {id:'sleep',n:[hi.length,lo.length],r:compare(hi,lo)};
  }

  /* the phase on any past day, from the period start before it */
  function phaseAt(t,C){
    var cs=C.cycles(), st=C.stats(), c=null;
    cs.forEach(function(x){ if(x.a<=t+DAY/2) c=x; });
    if(!c) return '';
    var len=c.len||st.avg, day=Math.round((sod(t)-c.a)/DAY)+1, ov=len-13;
    if(day>len+7) return '';
    if(day<=(c.plen||st.plen)) return 'menstrual';
    return day<ov-2?'follicular':(day<=ov+1?'ovulatory':'luteal');
  }
  function cycle(list){
    var C=window.KovaCycle;
    try{ if(!C||!C._data||!C._data().on||!C.cycles||!C.stats) return null; }catch(e){ return null; }
    if((C._data().status||{}).preg) return null;
    var fo=[], lu=[];
    list.forEach(function(s){ var p=''; try{ p=phaseAt(s.t,C); }catch(e){} if(p==='follicular'||p==='ovulatory') fo.push(s.vol); else if(p==='luteal') lu.push(s.vol); });
    return {id:'cycle',n:[fo.length,lu.length],r:compare(fo,lu)};
  }
  function all(){ var L=sessions(); return [sleep(L),cycle(L)].filter(Boolean); }

  /* ---------- the card ---------- */
  function num(x){ return Math.round(x).toLocaleString('en-US'); }
  var SAY={
    sleep:{up:'More volume after 7+ hours of sleep',down:'Less volume after 7+ hours of sleep',vs:'after 7+ h vs less'},
    cycle:{up:'More volume in your follicular phase than luteal',down:'Less volume in your follicular phase than luteal',vs:'follicular vs luteal'}
  };
  function html(){
    var R=all(), shown=R.filter(function(x){ return x.r; });
    var h='<div class="kpt card"><div class="lbl">PATTERNS KOVA FOUND</div>';
    if(!shown.length){
      var s=R.filter(function(x){ return x.id==='sleep'; })[0];
      return h+'<p class="kpt-none">Shows once Kova has 5 workouts after 7+ hours of sleep and 5 after less. So far: '+s.n[0]+' and '+s.n[1]+'.</p></div>';
    }
    shown.forEach(function(x){
      var r=x.r, w=SAY[x.id];
      h+='<div class="kpt-row" data-kpt="'+x.id+'"><b class="kpt-n">'+(r.pct>0?'+':'')+r.pct+'%</b><div><div class="kpt-t">'+(r.pct>=0?w.up:w.down)+'</div>'
        +'<div class="kpt-s">Average '+num(r.a)+' vs '+num(r.b)+' ('+w.vs+') · '+x.n[0]+' and '+x.n[1]+' workouts</div></div></div>';
    });
    return h+'<p class="kpt-fine">Your own averages, not cause and effect.</p></div>';
  }
  /* added under the summary each time it is drawn; looking inside the
     summary only once it is on screen (a closed screen stays parked) */
  function add(){
    var b=document.getElementById('sdBody'); if(!b||b.querySelector('.kpt')) return;
    b.insertAdjacentHTML('beforeend',html());
  }
  var watching=false;
  function onShow(){
    add();
    if(watching||!window.MutationObserver) return;
    var b=document.getElementById('sdBody'); if(!b) return;
    watching=true; new MutationObserver(function(){ if(!b.querySelector('.kpt')) add(); }).observe(b,{childList:true});
  }
  (function(){
    var s=document.getElementById('s-sessdone'); if(!s) return;
    if(s.classList.contains('on')) onShow();
    if(window.MutationObserver) new MutationObserver(function(){ if(s.classList.contains('on')) onShow(); }).observe(s,{attributes:true,attributeFilter:['class']});
  })();
  return {all:all,html:html,phaseAt:phaseAt,add:add,MIN:MIN};
})();
