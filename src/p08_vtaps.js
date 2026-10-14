/* KovaVTaps (p28) - every card on Vitals that looked tappable now does
   something, and only something real (your readings, Kova's own screens):

     Recovery number      where today's score comes from, reading by reading
     HRV / Resting HR /   that reading's own screen (HRV, the resting heart
       Sleep tiles          rate row in Readings & signals, Sleep)
     Sleep and trend      Sleep
     Steadiest / Most off that reading (Protein and Water open Fuel)
     Morning read         today's read with the readings behind it, and
                          "Ask Cora" (your Recovery Coach; you press Send)
     Recovery this week   Recovery
     From your data       how Kova estimates how you feel, from what
     Heart activity       Stress (your heart through the day)
     Today's vitals rows  that reading, or what it means and where it comes from
     Start / stop doing   why, and "Remind me daily" (a real reminder, in
                          Settings > Reminders, pushed when notifications are on)

   Before this, 18 of them did nothing when tapped. */
window.KovaVTaps=(function(){
  'use strict';
  function $(s,r){ return (r||document).querySelector(s); }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function sheet(h){ if(window.openSheet) openSheet('<div class="grab"></div><div class="kvt">'+h+'</div>'); }
  function goTo(id){
    if(window.closeSheet) try{ closeSheet(); }catch(e){}
    /* the reminders live in Settings > Notifications */
    if(id==='alerts'){ if(typeof window.go==='function') window.go('settings'); setTimeout(function(){ var c=document.getElementById('permCard'); if(c&&c.scrollIntoView) c.scrollIntoView({block:'start',behavior:'smooth'}); },350); return; }
    if(typeof window.go==='function') window.go(id);
  }
  function audit(){
    try{ var a=window.KovaAgent&&KovaAgent.audit?KovaAgent.audit():null; if(!a||!a.metrics) return {}; var o={}; a.metrics.forEach(function(m){ o[m.id]=m; }); return o; }catch(e){ return {}; }
  }
  function ready(){ try{ return window.KovaToday&&KovaToday.readiness?KovaToday.readiness():{score:null}; }catch(e){ return {score:null}; } }
  function word(s){ return s==null?'':s>=75?'High':s>=50?'Moderate':'Low'; }
  function hm(m){ m=Math.round(m); return Math.floor(m/60)+'h '+(m%60)+'m'; }

  /* one row per reading behind today's score, from your own numbers */
  function rows(){
    var a=audit(), out=[];
    var h=a.hrv, r=a.rhr, s=a.sleep;
    out.push({k:'hrv',n:'HRV',v:h&&h.value!=null?Math.round(h.value)+' ms':null,
      d:h&&h.change_pct!=null?(h.change_pct>0?'+':'')+h.change_pct+'% vs your normal':'',
      t:h&&h.change_pct!=null?(h.change_pct<=-10?'Lower than your normal pulls the score down.':h.change_pct>=10?'Higher than your normal lifts the score.':'Close to your normal.'):''});
    out.push({k:'rhr',n:'Resting heart rate',v:r&&r.value!=null?Math.round(r.value)+' bpm':null,
      d:r&&r.change!=null?(r.change>0?'+':'')+Math.round(r.change)+' bpm vs your normal':'',
      t:r&&r.change!=null?(r.change>=4?'Above your normal pulls the score down.':r.change<=-3?'Below your normal lifts the score.':'Close to your normal.'):''});
    out.push({k:'sleep',n:'Sleep',v:s&&s.value!=null?hm(s.value):null,
      d:s&&s.value!=null&&s.target?(s.value-s.target>0?'+':'')+Math.round(s.value-s.target)+' min vs your goal':'',
      t:s&&s.value!=null&&s.target?(s.value<s.target-30?'Short of your goal pulls the score down.':'At or near your goal.'):''});
    return out;
  }
  function rowsHtml(){
    return '<div class="kvt-rows">'+rows().map(function(x){
      return '<button type="button" class="kvt-row" data-open="'+x.k+'"><span class="kvt-n">'+esc(x.n)+'</span><b>'+(x.v==null?'No reading':esc(x.v))+'</b>'
        +(x.d?'<span class="kvt-d">'+esc(x.d)+'</span>':'')+(x.t?'<span class="kvt-t">'+esc(x.t)+'</span>':'')+'<span class="kvt-go" aria-hidden="true">›</span></button>';
    }).join('')+'</div>';
  }
  function coachBtn(q){
    var has=false; try{ has=!!(window.KovaListen&&window.KovaCrew&&KovaCrew.emps().some(function(e){ return e.tpl==='vitals'; })); }catch(e){}
    return has?'<button type="button" class="btn kvt-b" data-ask="'+esc(q)+'">Ask Cora, your Recovery Coach</button>':'';
  }

  function recovery(){
    var r=ready(), s=r.score;
    var heart=rows().filter(function(x){ return x.k!=='sleep'&&x.v!=null; }).length;
    var src=r.how!=='length'?'From your watch’s readings and your sleep.'
      :(heart?'Today it is a rough estimate from sleep length alone; your HRV and resting heart rate are shown against your normal but are not in the score yet.':'A rough estimate from sleep length alone, because no heart readings have come in.');
    sheet('<div class="kvt-h">'+(s==null?'No recovery score yet':'Recovery '+s+' <small>/100 · '+word(s)+'</small>')+'</div>'
      +'<div class="sub kvt-p">'+(s==null?'Wear your watch to bed: the score comes from your sleep, HRV and resting heart rate the morning after.':'Where today’s score comes from. '+src)+'</div>'
      +rowsHtml()
      +'<div class="kvt-acts"><button type="button" class="btn ghost kvt-b" data-goto="recovery">Open Recovery</button>'
      +(s==null?'<button type="button" class="btn kvt-b" data-goto="watch">Connect your watch</button>':coachBtn('My recovery is '+s+' today. What is pulling it down, and what should I do today?'))+'</div>');
  }
  function morning(card){
    var txt=((card&&$('.kova-txt',card))||{}).textContent||'';
    sheet('<div class="kvt-h">Today’s read</div><div class="kvt-p">'+esc(txt)+'</div>'
      +'<div class="kvt-cap">The readings behind it</div>'+rowsHtml()
      +'<div class="kvt-acts">'+coachBtn('About my morning read: '+txt.slice(0,240)+' What should I change today?')+'<button type="button" class="btn ghost kvt-b" data-goto="recovery">Open Recovery</button></div>');
  }
  function feeling(){
    var a=audit(), have=['sleep','hrv','rhr'].filter(function(k){ return a[k]&&a[k].value!=null; }).length;
    sheet('<div class="kvt-h">How Kova estimates how you feel</div>'
      +'<div class="sub kvt-p">Energy, mood and soreness here are estimates, not measurements: Kova reads them from last night’s sleep, your HRV and your resting heart rate against your own normal. '
      +(have?'It has '+have+' of those 3 readings today.':'It has none of those readings yet, so connect your watch first.')+' It is not a diagnosis; how you actually feel always wins.</div>'
      +rowsHtml()+'<div class="kvt-acts">'+coachBtn('How am I likely to feel today from my sleep, HRV and resting heart rate?')+'<button type="button" class="btn ghost kvt-b" data-goto="watch">Your watch</button></div>');
  }
  /* readings in "Today's vitals" with a row in Readings & signals open it;
     the others say what they mean and where they come from */
  var ABOUT={
    'Blood oxygen':'How much oxygen your blood carries, from your watch, usually overnight. 95 to 100% is normal at rest; a run of nights below 92% is worth showing a doctor.',
    'VO2 max':'How much oxygen your body can use flat out, estimated by your watch from outdoor walks and runs with heart rate. Higher is fitter; it moves over weeks, not days.'
  };
  var BIO={'Respiratory rate':'Respiratory rate','Skin temp':'Skin temperature','Skin temperature':'Skin temperature','Resting heart rate':'Resting heart rate','HRV':'Heart rate variability'};
  /* a reading in Readings & signals: it used to only flash a one-line
     note; now it opens what the reading is, your band, where you sit */
  var MEAN={
    'Resting heart rate':['Beats a minute at full rest, mostly measured asleep. A few beats above your normal often means poor sleep, stress, alcohol or a cold coming on.','hrv'],
    'Heart rate variability':['How much the gap between heartbeats varies. Higher than your own normal means you are recovered; a drop means your body is under strain. Compare it with yourself, not with others.','hrv'],
    'Respiratory rate':['Breaths a minute while you sleep. It is very steady for each person, so a rise of 2 or more is an early sign of illness or overtraining.',''],
    'Time asleep':['Time actually asleep, not in bed. Most adults need 7 to 9 hours.','sleep'],
    'Sleep efficiency':['The share of your time in bed spent asleep. 85% or more is good.','efficiency'],
    'Sleep debt':['Sleep you owe from the last week against your goal. It is paid back over a few nights, not in one long sleep.','sleep'],
    'Skin temperature':['Overnight wrist temperature against your own normal. A rise can mean illness, a hot room, or (for women) the second half of the cycle.',''],
    'Hydration':['How close you are to today\u2019s water target, from what you log.','fuel'],
    'Daily steps':['Steps today, from your phone or watch. 7,000 to 10,000 a day lowers health risks the most.','']
  };
  function readingSheet(row){
    var name=((row.querySelector('.bn')||{}).textContent||'').trim();
    var fig=row.querySelector('.ronfig'), val=fig?((fig.querySelector('b')||{}).textContent||'')+' '+((fig.querySelector('i')||{}).textContent||''):'';
    var m=String(row.getAttribute('data-toast')||'').match(/healthy band is (-?[\d.,]+) to (-?[\d.,]+)\s*(.*?)\.?$/);
    var v=parseFloat(String((fig&&fig.querySelector('b')||{}).textContent||'').replace(/,/g,'')), lo=m?parseFloat(m[1].replace(/,/g,'')):null, hi=m?parseFloat(m[2].replace(/,/g,'')):null;
    var where=lo==null||isNaN(v)?'':(v<lo?'Below':v>hi?'Above':'Inside')+' the healthy band ('+m[1]+' to '+m[2]+(m[3]?' '+m[3]:'')+')';
    var M=MEAN[name]||['A reading from your watch or log.',''];
    sheet('<div class="kvt-h">'+esc(name)+' <small>'+esc(val.trim())+'</small></div>'
      +(where?'<div class="kvt-where '+(/^Inside/.test(where)?'ok':'off')+'">'+esc(where)+'</div>':'')
      +'<div class="sub kvt-p">'+esc(M[0])+'</div>'
      +'<div class="kvt-acts">'+(M[1]?'<button type="button" class="btn ghost kvt-b" data-goto="'+M[1]+'">Open '+esc(M[1]==='hrv'?'HRV':M[1]==='efficiency'?'Sleep efficiency':M[1].charAt(0).toUpperCase()+M[1].slice(1))+'</button>':'')
      +coachBtn('My '+name.toLowerCase()+' is '+val.trim()+'. Is that a problem, and what moves it?')+'</div>');
  }
  function bio(name){
    var D=window.KovaVDock; if(window.closeSheet) try{ closeSheet(); }catch(e){}
    if(D&&D.show) D.show('signals',true);
    setTimeout(function(){
      var hit=[].slice.call(document.querySelectorAll('#s-vitals .ronbio')).filter(function(b){ return (b.textContent||'').trim().indexOf(name)===0; })[0];
      if(!hit) return;
      if(hit.scrollIntoView) hit.scrollIntoView({block:'center',behavior:'smooth'}); hit.classList.add('kvt-flash'); setTimeout(function(){ hit.classList.remove('kvt-flash'); },1400);
      setTimeout(function(){ readingSheet(hit); },450);
    },380);
  }
  function openReading(k){
    if(k==='hrv') return goTo('hrv');
    if(k==='rhr') return bio('Resting heart rate');
    if(k==='sleep') return goTo('sleep');
    if(k==='food'||k==='hydration') return goTo('fuel');
  }
  function vitalRow(row){
    var name=(($('.volname',row)||{}).textContent||'').trim();
    if(BIO[name]) return bio(BIO[name]);
    var val=(($('.volval',row)||{}).textContent||'').trim();
    sheet('<div class="kvt-h">'+esc(name)+(val?' <small>'+esc(val)+'</small>':'')+'</div><div class="sub kvt-p">'+esc(ABOUT[name]||'A reading from your watch.')+'</div>'
      +'<div class="kvt-acts"><button type="button" class="btn ghost kvt-b" data-goto="watch">Your watch</button></div>');
  }

  /* start / stop doing: why, and a daily reminder that really fires */
  var WHEN=[[/scroll|screen|phone|bed/i,'22:15'],[/water|morning/i,'07:30'],[/walk|meal/i,'13:00'],[/train|sleep/i,'07:00']];
  function habitTime(t){ for(var i=0;i<WHEN.length;i++) if(WHEN[i][0].test(t)) return WHEN[i][1]; return '09:00'; }
  function habitId(t){ return 'habit:'+String(t).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,32); }
  function habit(item){
    var kind=(($('div',item)||{}).textContent||'').trim().toUpperCase()==='STOP'?'stop':'start';
    var t=(($('div > div',item.children[1]||item)||{}).textContent||'').trim(), why=((item.children[1]&&item.children[1].children[1])||{}).textContent||'';
    if(!t) return;
    var A=window.__alerts?__alerts.get():null, id=habitId(t), on=!!(A&&A.some(function(a){ return a.id===id&&a.on; }));
    sheet('<div class="kvt-h"><span class="kvt-k '+kind+'">'+(kind==='stop'?'STOP':'START')+'</span> '+esc(t)+'</div><div class="sub kvt-p">'+esc(why)+'</div>'
      +(A?'<label class="kvt-time">Every day at <input type="time" id="kvtTime" value="'+habitTime(t)+'"></label>':'')
      +'<div class="kvt-acts">'+(A?'<button type="button" class="btn kvt-b" data-habit="'+esc(t)+'" data-kind="'+kind+'" data-why="'+esc(why.slice(0,150))+'">'+(on?'Update the reminder':'Remind me daily')+'</button>':'')
      +'<button type="button" class="btn ghost kvt-b" data-goto="alerts">All reminders</button></div>'
      +(on?'<div class="sub kvt-on">A daily reminder for this is on.</div>':''));
  }
  function addHabit(b){
    var A=window.__alerts?__alerts.get():null; if(!A) return;
    var t=b.getAttribute('data-habit'), kind=b.getAttribute('data-kind'), why=b.getAttribute('data-why')||'', id=habitId(t);
    var tm=($('#kvtTime')||{}).value||habitTime(t);
    var cur=A.filter(function(a){ return a.id===id; })[0];
    var item={id:id,p:'Vitals',ic:'i-heartbeat',t:tm,on:true,days:[1,1,1,1,1,1,1],lead:0,tone:'gentle',
      title:(kind==='stop'?'Stop: ':'Start: ')+t, body:why, why:'Added from Vitals › Start doing / stop doing.'};
    if(cur) Object.assign(cur,item); else A.push(item);
    try{ __alerts.save(); if(__alerts.reload) __alerts.reload(); }catch(e){}
    try{ if(window.KovaPush&&KovaPush.active()&&KovaPush.sync) KovaPush.sync(); else if(window.KovaPush&&KovaPush.offer) setTimeout(function(){ KovaPush.offer(item.title); },400); }catch(e){}
    if(window.closeSheet) closeSheet();
    if(window.toast) toast('Reminder on: '+t+', every day at '+tm+'.');
  }

  /* ---------- one listener for the whole of Vitals, and one for the sheet ---------- */
  function onTap(e){
    var t=e.target; if(!t.closest) return;
    var sc=t.closest('#s-vitals'); if(!sc) return;
    if(t.closest('a,button:not(.kvd-sq),input,select,textarea,.kvd-dock,.kvd-head,.ronbio,.ronpills,.ronrange,.klb-card,.card.tap,[data-go]')) return;
    var x;
    if((x=t.closest('.kvd-sm[data-k]'))) return openReading(x.getAttribute('data-k'));
    if((x=t.closest('.kvd-tile[data-k]'))) return openReading(x.getAttribute('data-k'));
    if(t.closest('.kvd-trend')) return goTo('sleep');
    if(t.closest('.kvd-power')) return recovery();
    if((x=t.closest('.card.kova'))) return morning(x);
    if((x=t.closest('#vitalsRows .volrow'))) return vitalRow(x);
    if((x=t.closest('#startStop > div'))) return habit(x);
    if((x=t.closest('.card'))){
      if(x.querySelector('#recoveryGrid')&&!t.closest('#recoveryGrid [data-day],#recoveryGrid [onclick]')) return goTo('recovery');
      if(x.querySelector('#symptomCards')&&!t.closest('#symptomCards')) return feeling();
      if(/^\s*Heart activity/.test(x.textContent||'')) return goTo('stress');
    }
  }
  function onSheet(e){
    var b=e.target.closest&&e.target.closest('.kvt [data-open],.kvt [data-goto],.kvt [data-ask],.kvt [data-habit]'); if(!b) return;
    if(b.hasAttribute('data-open')) return openReading(b.getAttribute('data-open'));
    if(b.hasAttribute('data-goto')) return goTo(b.getAttribute('data-goto'));
    if(b.hasAttribute('data-habit')) return addHabit(b);
    if(b.hasAttribute('data-ask')){ var q=b.getAttribute('data-ask'); if(window.closeSheet) closeSheet(); setTimeout(function(){ if(window.KovaListen&&KovaListen.ask) KovaListen.ask('vitals',q); },260); }
  }
  /* tappable things say so, and answer the keyboard too */
  function mark(){
    var s=document.getElementById('s-vitals'); if(!s) return;
    s.querySelectorAll('.card.kova,#vitalsRows .volrow,#startStop > div,.ronbio').forEach(function(el){
      if(el.__kvt) return; el.__kvt=1; el.classList.add('kvt-tap'); el.setAttribute('role','button'); el.setAttribute('tabindex','0');
    });
    s.querySelectorAll('.card').forEach(function(c){
      if(c.__kvt) return;
      if(c.querySelector('#recoveryGrid')||c.querySelector('#symptomCards')||/^\s*Heart activity/.test(c.textContent||'')){ c.__kvt=1; c.classList.add('kvt-tap'); c.setAttribute('role','button'); c.setAttribute('tabindex','0'); }
      var ch=c.querySelector('#symptomCards')&&c.querySelector('.chip');
      if(ch&&!ch.__kvt){ ch.__kvt=1; ch.style.pointerEvents='auto'; ch.classList.add('kvt-tap'); ch.setAttribute('role','button'); ch.setAttribute('tabindex','0'); ch.setAttribute('aria-label','From your data: how Kova estimates this'); }
    });
  }
  function onBio(e){
    var r=e.target.closest&&e.target.closest('#s-vitals .ronbio'); if(!r) return;
    e.stopPropagation(); readingSheet(r);
  }
  function start(){
    document.addEventListener('click',onBio,true);
    document.addEventListener('click',onTap);
    document.addEventListener('click',onSheet);
    document.addEventListener('keydown',function(e){
      if(e.key!=='Enter'&&e.key!==' ') return;
      var el=e.target; if(!el.closest||!el.closest('#s-vitals')||el.getAttribute('role')!=='button'||/^(BUTTON|A|INPUT)$/.test(el.tagName)) return;
      e.preventDefault(); onTap({target:el});
    });
    mark();
    var s=document.getElementById('s-vitals');
    if(s&&window.MutationObserver) new MutationObserver(function(){ mark(); }).observe(s,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
  return {recovery:recovery,morning:morning,feeling:feeling,habit:habit,openReading:openReading,bio:bio,reading:readingSheet,rows:rows,habitId:habitId};
})();
