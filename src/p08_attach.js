/* =====================================================================
   KovaAttach - the attachment you use, remembered (p37).

   The owner: "on the add exercises make sure you have an option button to
   add an attachment so going forward you can save it and they don't have
   to tell you again". Every exercise in today's workout, and every one in
   "Add to today", gets a small button: + Attachment, or the one you use
   (Rope, Straight bar, V-bar...). The choice is kept per exercise (KP
   'attach', so it follows your account), put on the exercise when it is
   added again, and saved with the sets in your log.
   ===================================================================== */
window.KovaAttach=(function(){
  'use strict';
  var KEY='attach';
  var OPT={
    cable:['Rope','Straight bar','V-bar','EZ bar','Single handle','Wide lat bar','Ankle strap'],
    barbell:['Straight bar','EZ bar','Trap bar','Safety squat bar','Smith machine'],
    dumbbell:['Dumbbells','Kettlebell','Cable instead'],
    machine:['Machine handles','Wide grip','Close grip','Neutral grip'],
    bodyweight:['Bodyweight','Dip belt','Weight vest','Band to help'],
    any:['Rope','Straight bar','V-bar','EZ bar','Single handle','Dumbbells','Machine handles','Band']
  };
  var EXTRA=['Belt','Straps'];
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function all(){ try{ var v=window.KP?KP.get(KEY):JSON.parse(localStorage.getItem('kova.attach')||'null'); return v&&typeof v==='object'?v:{}; }catch(e){ return {}; } }
  function get(n){ return all()[String(n||'')]||''; }
  function set(n,v){
    var a=all(); v=String(v||'').trim().slice(0,40);
    if(v) a[n]=v; else delete a[n];
    try{ if(window.KP) KP.set(KEY,a); else localStorage.setItem('kova.attach',JSON.stringify(a)); }catch(e){}
    try{ if(window.KovaAnalytics) KovaAnalytics.track('attachment_set',{n:n,v:v||'none'}); }catch(e){}
    return v;
  }
  function K(){ return window.KSESS||null; }
  /* what kind of exercise: the workout list's equipment, its short code, or the name */
  var CODE={bb:'barbell',db:'dumbbell',kb:'dumbbell',cb:'cable',cable:'cable',mc:'machine',machine:'machine',bw:'bodyweight',barbell:'barbell',dumbbell:'dumbbell',bodyweight:'bodyweight'};
  function kind(n){
    var k=K(), x=null, e='';
    try{ var X=(k&&k.XL||[]).filter(function(r){ return r.n===n; })[0]; e=X&&X.e||''; }catch(err){}
    if(!OPT[e]){ try{ x=k&&k.lib?k.lib(n):null; }catch(err){} e=CODE[x&&(x.e||x.eq)]||''; }
    if(OPT[e]) return e;
    if(/cable|pushdown|pulldown|face pull|crossover|fly/i.test(n)) return 'cable';
    if(/machine|leg press|leg curl|leg extension|pec deck|hack squat/i.test(n)) return 'machine';
    if(/dumbbell|\bdb\b|goblet|kettlebell/i.test(n)) return 'dumbbell';
    if(/barbell|\bez\b|skull|close grip bench|deadlift|squat|bench press|\brow\b|curl/i.test(n)) return 'barbell';
    if(/pull.?up|chin.?up|\bdips?\b|push.?up/i.test(n)) return 'bodyweight';
    return 'any';
  }
  function options(n){ return OPT[kind(n)].concat(EXTRA); }
  function label(v){ return v?esc(v):'+ Attachment'; }

  /* ---------- the picker ---------- */
  function pickHtml(n,cur,where){
    return '<div class="katt-p" data-katt-for="'+esc(n)+'" data-katt-where="'+where+'">'
      +'<div class="katt-pl">Attachment for '+esc(n)+'</div>'
      +'<div class="katt-opts">'+options(n).map(function(o){ return '<button type="button" class="chip'+(o===cur?' on':'')+'" data-katt-v="'+esc(o)+'" aria-pressed="'+(o===cur)+'">'+esc(o)+'</button>'; }).join('')
      +'<button type="button" class="chip" data-katt-v="">None</button></div>'
      +'<div class="katt-own"><input class="srch" maxlength="40" placeholder="Something else? Type it" aria-label="Your own attachment"/><button type="button" class="chip on" data-katt-own="1">Save</button></div>'
      +'<div class="katt-n">Kova remembers it for next time.</div></div>';
  }
  function sessionSheet(i){
    var k=K(); if(!k||!window.openSheet) return;
    var e=k.state().ex[i]; if(!e) return;
    openSheet('<div class="grab"></div>'+pickHtml(e.n,e.att||get(e.n),'s'+i));
  }
  function choose(box,v){
    var n=box.getAttribute('data-katt-for'), where=box.getAttribute('data-katt-where');
    v=set(n,v);
    var k=K();
    if(k&&where.charAt(0)==='s'){
      var e=k.state().ex[+where.slice(1)]; if(e&&e.n===n){ e.att=v||undefined; try{ k.api&&k.api.save&&k.api.save(); }catch(x){} }
      if(window.closeSheet) closeSheet();
      if(window.toast) toast(v?n+': '+v+'. Kova remembers it.':'No attachment for '+n+'.');
      decorate(); return;
    }
    /* in "Add to today": update the row's button and fold the picker away */
    var row=box.previousElementSibling, b=row&&row.querySelector('.katt-add'); if(b) b.innerHTML=label(v);
    box.remove();
  }

  /* ---------- the buttons ---------- */
  function on(id){ var s=document.getElementById(id); return !!(s&&s.classList.contains('on')); }
  function decorate(){
    var k=K();
    /* today's workout */
    if(k&&on('s-session')){
      var ex=k.state().ex||[];
      document.querySelectorAll('#s-session .exwrap[data-ex]').forEach(function(w){
        var i=+w.getAttribute('data-ex'), e=ex[i], head=w.querySelector('.exhead .exmeta'); if(!e||!head) return;
        if(e.att==null&&get(e.n)){ e.att=get(e.n); try{ k.api&&k.api.save&&k.api.save(); }catch(x){} }
        var b=w.querySelector('.katt-chip'), txt=label(e.att);
        if(b){ if(b.__t!==txt){ b.innerHTML=txt; b.__t=txt; b.classList.toggle('set',!!e.att); } return; }
        head.insertAdjacentHTML('afterend','<button type="button" class="katt-chip'+(e.att?' set':'')+'" data-katt="'+i+'" aria-label="Attachment for '+esc(e.n)+'">'+txt+'</button>');
        var nb=w.querySelector('.katt-chip'); if(nb) nb.__t=txt;
      });
    }
    /* "Add to today" */
    document.querySelectorAll('#sheet .exadd[data-n]').forEach(function(r){
      if(r.querySelector('.katt-add')) return;
      var n=r.getAttribute('data-n'), plus=r.querySelector('svg.ic');
      var html='<button type="button" class="katt-add" data-katt-n="'+esc(n)+'" aria-label="Attachment for '+esc(n)+'">'+label(get(n))+'</button>';
      if(plus) plus.insertAdjacentHTML('beforebegin',html); else r.insertAdjacentHTML('beforeend',html);
    });
  }

  /* taps: in the capture phase, so the row under the button does not also add or open */
  document.addEventListener('click',function(ev){
    var t=ev.target; if(!t||!t.closest) return;
    var b=t.closest('[data-katt]');
    if(b){ ev.preventDefault(); ev.stopPropagation(); sessionSheet(+b.getAttribute('data-katt')); return; }
    var a=t.closest('.katt-add');
    if(a){ ev.preventDefault(); ev.stopPropagation();
      var row=a.closest('.exadd'), n=a.getAttribute('data-katt-n'), nx=row&&row.nextElementSibling;
      if(nx&&nx.classList.contains('katt-p')){ nx.remove(); return; }
      document.querySelectorAll('#sheet .katt-p').forEach(function(x){ x.remove(); });
      if(row) row.insertAdjacentHTML('afterend',pickHtml(n,get(n),'a'));
      return; }
    var v=t.closest('[data-katt-v]');
    if(v){ ev.preventDefault(); ev.stopPropagation(); choose(v.closest('.katt-p'),v.getAttribute('data-katt-v')); return; }
    var own=t.closest('[data-katt-own]');
    if(own){ ev.preventDefault(); ev.stopPropagation(); var box=own.closest('.katt-p'), inp=box.querySelector('input'); if(inp&&inp.value.trim()) choose(box,inp.value); return; }
    /* an exercise added from the list takes the attachment you use with it */
    var add=t.closest('#sheet .exadd[data-n]');
    if(add&&K()){ var name=add.getAttribute('data-n'), at=get(name);
      if(at) setTimeout(function(){ var k=K(), ex=k.state().ex||[]; for(var j=ex.length-1;j>=0;j--){ if(ex[j].n===name&&ex[j].att==null){ ex[j].att=at; try{ k.api&&k.api.save&&k.api.save(); }catch(x){} break; } } decorate(); },0); }
  },true);
  document.addEventListener('keydown',function(ev){
    if(ev.key!=='Enter') return; var inp=ev.target; if(!inp||!inp.closest||!inp.closest('.katt-own')) return;
    ev.preventDefault(); var box=inp.closest('.katt-p'); if(inp.value.trim()) choose(box,inp.value);
  });
  var pend=0; function soon(){ if(pend) return; pend=setTimeout(function(){ pend=0; if(window.KovaPark&&KovaPark.quiet) KovaPark.quiet(decorate); else decorate(); },80); }
  if(window.MutationObserver) new MutationObserver(function(ms){ for(var i=0;i<ms.length;i++){ var t=ms[i].target; if(!(t.closest&&t.closest('.katt-chip,.katt-add,.katt-p,[data-kxd],[data-kxd-still],#kpl,#kz2'))){ soon(); return; } } }).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('kova:screen',soon);
  return {get:get,set:set,options:options,kind:kind,decorate:decorate,all:all};
})();
