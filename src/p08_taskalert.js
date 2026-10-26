/* =====================================================================
   KovaTaskAlert - task reminders (p44).

   The owner: "why am I not getting any notifications when I put my
   information? ... what school assignments I have to do or what other
   projects... gym, training, creating the app, e-commerce". Tasks only had
   a day, so nothing knew when to say anything. Now a task can have a time
   (Work OS > New task, or the task's own page) and when to be reminded:
   at the time, 15 minutes, an hour or a day before.

   - While Kova is open (any screen, any tab): a small glass card at the top
     at the reminder time, with Open, Done and "In 10 min". If Kova is in a
     background tab or window, the system notification as well (asked for
     the first time a task gets a time, inside that tap).
   - With Kova closed: each upcoming reminder (the next 14 days, at most 24)
     goes into the push list the server already sends (KovaPush, POST
     /reminders) as a one-off on its own date. That needs the web push key
     (KOVA_FB_VAPID); until it is set, the open-app alert is what works.
   - Once only: the reminder time is written on the task (`alerted`), which
     syncs, so the phone and the laptop do not both ring for it. Snooze sets
     `snooze`; a done task never reminds.
   ===================================================================== */
window.KovaTaskAlert=(function(){
  'use strict';
  var DAY=864e5, H12=12*36e5, timer=null, pushT=null;
  function W(){ return window.WorkOS; }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function hm(t){ var m=/^(\d{1,2}):(\d{2})$/.exec(String(t||'')); return m&&+m[1]<24&&+m[2]<60?(+m[1])*60+(+m[2]):-1; }
  function fmt(t){ var m=hm(t); if(m<0) return ''; var h=Math.floor(m/60), mm=m%60; return ((h%12)||12)+(mm?':'+('0'+mm).slice(-2):'')+(h<12?' AM':' PM'); }
  /* the moment it is due, and the moment to say so (local time) */
  function dueAt(i){ if(!i||!i.due||hm(i.time)<0) return 0; var d=new Date(i.due); d.setHours(0,0,0,0); return d.getTime()+hm(i.time)*60000; }
  function remindAt(i){ var t=dueAt(i); return t?t-(+i.remind||0)*60000:0; }
  function nextAt(i){ return Math.max(remindAt(i),+i.snooze||0); }
  function items(){ try{ return W()?W().list('items'):[]; }catch(e){ return []; } }
  function open(){ return items().filter(function(i){ return i.status!=='Completed'&&dueAt(i); }); }
  /* due now: its moment has come, not more than 12 hours after it was due, not already said */
  function due(now){
    now=now||Date.now();
    return open().filter(function(i){ var at=nextAt(i); return at&&now>=at&&now<dueAt(i)+H12&&i.alerted!==at&&at>=(+i.created||0)-60000; });   /* not for a moment already past when the task was made */
  }
  function when(i){
    var t=dueAt(i), now=Date.now(), mins=Math.round((t-now)/60000);
    if(mins<=0) return 'Due now';
    if(mins<60) return 'Due in '+mins+' min';
    var d=new Date(t), today=new Date(); today.setHours(0,0,0,0);
    var day=Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()-today.getTime())/DAY);
    return 'Due '+(day===0?'at ':day===1?'tomorrow ':d.toLocaleDateString(undefined,{weekday:'short'})+' ')+fmt(i.time);
  }

  /* ---------- saying it ---------- */
  function box(){
    var b=document.getElementById('kta');
    if(!b){ b=document.createElement('div'); b.id='kta'; b.setAttribute('role','status'); b.setAttribute('aria-live','polite'); document.body.appendChild(b); }
    return b;
  }
  function card(i){
    var b=box();
    if(b.querySelector('[data-kta-id="'+i.id+'"]')) return;
    var c=document.createElement('div'); c.className='kta-c'; c.setAttribute('data-kta-id',i.id);
    c.innerHTML='<i class="kta-dot" aria-hidden="true"></i><div class="kta-t"><b>'+esc(i.name)+'</b><span>'+esc(when(i))+'</span></div>'
      +'<div class="kta-a"><button type="button" data-kta="open">Open</button><button type="button" data-kta="done">Done</button><button type="button" data-kta="later">In 10 min</button></div>';
    b.appendChild(c);
  }
  function drop(id){ var c=document.querySelector('#kta [data-kta-id="'+id+'"]'); if(c) c.remove(); }
  function notify(i){
    if(typeof Notification==='undefined'||Notification.permission!=='granted') return;
    if(document.visibilityState==='visible'&&document.hasFocus&&document.hasFocus()) return;    /* the card is enough */
    var title=i.name, opts={body:when(i),tag:'kova-task-'+i.id,icon:'/icon-192.png',badge:'/icon-192.png',data:{kovaUrl:location.origin+'/?go=worktasks&task='+encodeURIComponent(i.id),task:i.id}};
    try{
      if(navigator.serviceWorker&&navigator.serviceWorker.ready){
        navigator.serviceWorker.ready.then(function(reg){ return reg.showNotification(title,opts); }).catch(function(){ try{ new Notification(title,opts); }catch(e){} });
      }else new Notification(title,opts);
    }catch(e){}
  }
  function fire(i){
    var at=nextAt(i);
    try{ W().update('items',i.id,{alerted:at},'kova'); }catch(e){}
    card(i); notify(i);
    try{ if(window.KovaAnalytics) KovaAnalytics.track('task_reminder',{lead:+i.remind||0}); }catch(e){}
  }
  function check(){ if(!W()) return; due().forEach(fire); }

  function act(ev){
    var b=ev.target.closest&&ev.target.closest('[data-kta]'); if(!b) return;
    var c=b.closest('[data-kta-id]'), id=c&&c.getAttribute('data-kta-id'), k=b.getAttribute('data-kta');
    if(!id) return;
    ev.preventDefault();
    if(k==='open'){ drop(id); try{ if(window.__openWorkItem){ go('worktasks'); __openWorkItem(id); } else go('worktasks'); }catch(e){} return; }
    if(k==='done'){ drop(id); try{ W().update('items',id,{status:'Completed'},'user'); }catch(e){} if(window.toast) toast('Done.'); changed(); return; }
    if(k==='later'){ drop(id); try{ W().update('items',id,{snooze:Date.now()+10*60000},'user'); }catch(e){} changed(); }
  }

  /* ---------- the first time a task gets a time: may Kova notify? ---------- */
  function ask(){
    try{
      if(typeof Notification!=='undefined'&&Notification.permission==='default') Notification.requestPermission();
    }catch(e){}
  }

  /* ---------- with Kova closed: the server's push list ---------- */
  function ymd(t){ var d=new Date(t); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function pushItems(max){
    var now=Date.now(), out={};
    open().map(function(i){ return {i:i,at:nextAt(i)}; })
      .filter(function(x){ return x.at>now-60000&&x.at<now+14*DAY&&x.i.alerted!==x.at; })
      .sort(function(a,b){ return a.at-b.at; })
      .slice(0,max==null?24:max)
      .forEach(function(x){
        var d=new Date(x.at), id='task_'+String(x.i.id).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,34);
        out[id]={kind:'task',title:String(x.i.name).slice(0,60),body:when(x.i).replace(/^Due in \d+ min$/,'Due '+fmt(x.i.time)),
          time:('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),date:ymd(x.at),days:[d.getDay()],on:true,screen:'worktasks'};
      });
    return out;
  }
  function changed(){
    clearTimeout(pushT);
    pushT=setTimeout(function(){ try{ if(window.KovaPush&&KovaPush.active&&KovaPush.active()) KovaPush.sync(); }catch(e){} },1500);
    setTimeout(check,50);
  }

  /* a tapped notification comes back as ?task=<id> */
  function fromUrl(){
    var q; try{ q=new URLSearchParams(location.search); }catch(e){ return; }
    var id=q.get('task'); if(!id) return;
    setTimeout(function(){ try{ go('worktasks'); if(window.__openWorkItem) __openWorkItem(id); }catch(e){} },300);
  }

  function start(){
    if(timer) return;
    document.addEventListener('click',act);
    timer=setInterval(check,30000);
    document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible') check(); });
    window.addEventListener('kova:cloud',function(){ setTimeout(check,200); });
    fromUrl();
    try{ if(navigator.serviceWorker) navigator.serviceWorker.addEventListener('message',function(ev){ var id=ev.data&&ev.data.kovaTask; if(id){ try{ go('worktasks'); if(window.__openWorkItem) __openWorkItem(id); }catch(e){} } }); }catch(e){}
    check();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();

  return {check:check,due:due,dueAt:dueAt,remindAt:remindAt,fmt:fmt,when:when,ask:ask,changed:changed,pushItems:pushItems,_fire:fire};
})();
