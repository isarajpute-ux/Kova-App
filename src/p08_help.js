/* =====================================================================
   KovaHelp - the "?" buttons and the Work OS Help tab (p10).

   Every help button now opens two choices:
     Show me around   the same guided tour as before, for this screen
     Find anything    type what you are looking for and Kova shows you
                      where it is: it opens the screen, scrolls to the
                      exact card and highlights it.
   Search reads the app itself (every screen, section heading, card and
   button label) plus a hand-written list of features in everyday words,
   so "period", "dark mode", "vitamins" or "employees" all land somewhere
   real. It never answers with "sorry": if nothing matches closely it
   shows the nearest places instead.
   ===================================================================== */
window.KovaHelp=(function(){
  'use strict';
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function norm(t){ return String(t||'').toLowerCase().replace(/&amp;/g,'and').replace(/[^a-z0-9#]+/g,' ').trim(); }

  /* screens people land on; the rest are steps inside a flow */
  var SKIP=['tour','quiz','workquiz','lquiz','workitem','workmeeting','workfolder','notebook','recipe','progress','source','sessdone','ownplan','chat','snap','explain','workdiag'];
  var NAME={home:'Today (home)',move:'Workout',work:'Work OS',workstudio:'New post',workspace:'Work OS files',worksettings:'Work OS settings',
    worktoday:'Work OS board',workteam:'AI team',session:'Workout session',customize:'Customize workout',cycle:'Cycle',sounds:'Sleep sounds',
    settings:'Settings',profile:'Profile',plan:'Subscription',watch:'Your watch',health:'Health profile'};
  var PILLAR={sleep:'Sleep',move:'Workout',fuel:'Fuel',vitals:'Vitals',work:'Work OS',home:'Today',settings:'Settings',learn:'Learn'};

  /* features in the words people use */
  var PLACES=[
    {t:'AI team (your AI employees)',k:'employees agents ai team crew staff hire chief routines assistant workers',s:'workteam'},
    {t:'Call your team by name (voice)',k:'voice listen listening wake word hey mic microphone talk speak say name call',s:'workteam',q:'.crw-listen'},
    {t:'Ask Kova (chat)',k:'chat ask question assistant talk message kova',act:function(){ if(window.KovaChat) KovaChat.open(); }},
    {t:'Your 7 health checks',k:'seven 7 metrics checks readiness alerts plan agent orb',act:function(){ if(window.KovaOrb) KovaOrb.open('seven'); }},
    {t:'Do it for me (email and tasks)',k:'email gmail draft task do it for me send',act:function(){ if(window.KovaOrb) KovaOrb.open('do'); }},
    {t:'Sleep sounds and timer',k:'sounds noise rain white brown noise wind down timer mixes music',s:'sounds'},
    {t:'Cycle and fertility (in Vitals)',k:'cycle period menstrual ovulation fertile fertility luteal pms cramps bloating spotting pregnancy test lh basal temperature mucus contraception',s:'cycle'},
    {t:'Vitamins and minerals',k:'micronutrients vitamins minerals iron vitamin d magnesium fiber sodium potassium calcium b12 folate',s:'fuel',q:'#microGrid'},
    {t:'Log food',k:'log food add meal eat search food usda calories macros protein',s:'fuel'},
    {t:'Recipes',k:'recipes meals cook dinner lunch breakfast',s:'recipes'},
    {t:'Supersets',k:'superset pair back to back exercises',s:'session'},
    {t:'Heart rate during workouts',k:'heart rate bpm strap polar garmin zones hr',s:'session',q:'#hrSlot'},
    {t:'Customize your training',k:'split days muscles training for rules sport swimming hiking running cycling program',s:'customize'},
    {t:'Personal records',k:'pr prs records best lifts',s:'prs'},
    {t:'Sleep stages',k:'deep rem light stages',s:'stages'},
    {t:'HRV',k:'hrv heart rate variability nervous system',s:'hrv'},
    {t:'Stress',k:'stress calm',s:'stress'},
    {t:'How food, sleep and training connect',k:'connect connections affect insights correlation sleep training food',s:'home',q:'#klRail'},
    {t:'Appearance: dark, soft light, light',k:'theme appearance dark mode light mode soft light colors colour',s:'settings'},
    {t:'Subscription and price',k:'subscription price billing pay plan premium trial cancel',s:'plan'},
    {t:'Apple Watch and health sync',k:'apple watch health sync oura whoop garmin fitbit wearable',s:'watch'},
    {t:'New post (Studio)',k:'post publish instagram tiktok youtube linkedin x caption video photo schedule',s:'workstudio'},
    {t:'Hashtags',k:'hashtag hashtags tags # views',s:'workstudio'},
    {t:'Connect social accounts',k:'connect accounts social instagram tiktok youtube facebook folders',s:'workstudio'},
    {t:'Work OS board and tasks',k:'tasks board projects goals to do todo',s:'worktoday'},
    {t:'Meetings',k:'meetings calls zoom calendar',s:'workmeetings'},
    {t:'Business profile',k:'business profile brand voice audience',s:'workprofile'},
    {t:'Profile and account',k:'account profile name sign out log out email',s:'profile'}
  ];

  function screens(){
    return Array.prototype.slice.call(document.querySelectorAll('section.screen[id^="s-"]')).map(function(sc){
      var id=sc.id.slice(2);
      if(SKIP.indexOf(id)>=0) return null;
      var t=sc.querySelector('.title')||sc.querySelector('.title-s');
      var name=NAME[id]||(t?t.textContent.replace(/\?/g,'').trim():id);
      return {id:id,name:name,el:sc};
    }).filter(Boolean);
  }
  var HEAD='.sec-h,.lbl,.title-s,.eyebrow,.kl-t,.kc-t,.crw-h1,.crw-sec>span:first-child,h2,h3,.card-title,.qa span,.li-name,.wk-tab,.wgl-t,.chip';
  /* the index is rebuilt each time the search opens, so it is never stale */
  function index(){
    var out=[], seen={};
    PLACES.forEach(function(p){ out.push({t:p.t,k:p.k,s:p.s,q:p.q,act:p.act,where:p.s?(NAME[p.s]||PILLAR[p.s]||p.s):'Anywhere',cur:true}); });
    screens().forEach(function(s){
      out.push({t:s.name,k:(PILLAR[s.id]||'')+' '+s.id,s:s.id,where:'Screen',scr:true});
      Array.prototype.slice.call(s.el.querySelectorAll(HEAD)).forEach(function(el){
        var tx=(el.textContent||'').replace(/\s+/g,' ').trim();
        if(tx.length<3||tx.length>48||/^[\d\s.,:%\/+\-–—·$#]+$/.test(tx)) return;
        /* labels that are really numbers or counters ("Moderate · 50–74", "+5 more") are not places */
        if(/^\+?\d/.test(tx)||/\d\s*[–—-]\s*\d/.test(tx)||(tx.replace(/[^\d]/g,'').length/tx.length)>.25) return;
        var key=s.id+'|'+tx.toLowerCase(); if(seen[key]) return; seen[key]=1;
        out.push({t:tx.charAt(0).toUpperCase()+tx.slice(1).toLowerCase().replace(/\bai\b/g,'AI').replace(/\bhrv\b/g,'HRV'),k:'',s:s.id,match:tx,where:s.name});
      });
    });
    return out;
  }
  function lev1(a,b){ /* true when a and b are one edit apart */
    if(Math.abs(a.length-b.length)>1) return false;
    var i=0,j=0,e=0;
    while(i<a.length&&j<b.length){ if(a[i]===b[j]){ i++; j++; continue; } if(++e>1) return false; if(a.length>b.length) i++; else if(b.length>a.length) j++; else { i++; j++; } }
    return e+(a.length-i)+(b.length-j)<=1;
  }
  function score(e,toks){
    var title=norm(e.t), hay=(title+' '+norm(e.k)+' '+norm(e.where)).split(' '), sc=0, hit=0;
    toks.forEach(function(q){
      var best=0;
      hay.forEach(function(w){
        if(!w) return;
        var v=w===q?3:(w.indexOf(q)===0?2.2:(q.length>=3&&w.indexOf(q)>0?1.2:(q.length>=4&&lev1(q,w)?1:0)));
        if(v>best) best=v;
      });
      if(best){ hit++; sc+=best; if(title.indexOf(q)>=0) sc+=1; }
    });
    if(!hit||hit<Math.ceil(toks.length/2)) return 0;
    return sc+(hit===toks.length?2:0)+(e.cur?1.5:0)+(e.scr?.5:0);
  }
  function grams(t){ t=' '+norm(t)+' '; var g={}; for(var i=0;i<t.length-1;i++) g[t.substr(i,2)]=1; return g; }
  function near(q,list){
    var a=grams(q);
    return list.map(function(e){ var b=grams(e.t+' '+e.k), n=0, m=0; Object.keys(a).forEach(function(x){ m++; if(b[x]) n++; }); return {e:e,v:m?n/m:0}; })
      .sort(function(x,y){ return y.v-x.v; }).slice(0,6).map(function(x){ return x.e; });
  }
  function search(q){
    var list=index(), toks=norm(q).split(' ').filter(Boolean);
    if(!toks.length) return {items:list.filter(function(e){ return e.cur; }).slice(0,8),mode:'popular'};
    var r=list.map(function(e){ return {e:e,v:score(e,toks)}; }).filter(function(x){ return x.v>0; })
      .sort(function(a,b){ return b.v-a.v; });
    var dedup=[], k={}, top=r.length?r[0].v:0;
    r=r.filter(function(x){ return x.v>=top*0.55; });   /* one strong match beats a list of weak ones */
    r.forEach(function(x){ var key=norm(x.e.t); if(!k[key]){ k[key]=1; dedup.push(x.e); } });
    if(dedup.length) return {items:dedup.slice(0,8),mode:'match'};
    return {items:near(q,list),mode:'near'};
  }

  /* ---------------- taking you there ---------------- */
  function spot(el,label){
    document.querySelectorAll('.kh-spot').forEach(function(x){ x.classList.remove('kh-spot'); });
    document.querySelectorAll('.kh-tag').forEach(function(x){ x.remove(); });
    var host=(el.closest&&(el.closest('.card')||el.closest('.crw-card')||el.closest('.crw-hero')||el.closest('.kl')))||el;
    host.scrollIntoView&&host.scrollIntoView({behavior:'smooth',block:'center'});
    host.classList.add('kh-spot');
    var tag=document.createElement('div'); tag.className='kh-tag'; tag.innerHTML='<i></i><span>'+esc(label||'Here it is')+'</span>';
    document.body.appendChild(tag);
    var place=function(){ var r=host.getBoundingClientRect(); tag.style.top=Math.max(10,r.top-38)+'px'; tag.style.left=Math.max(10,Math.min(r.left+12,window.innerWidth-(tag.offsetWidth||160)-10))+'px'; };
    place(); var iv=setInterval(place,60);
    setTimeout(function(){ clearInterval(iv); tag.classList.add('out'); host.classList.remove('kh-spot'); setTimeout(function(){ tag.remove(); },400); },4200);
  }
  function goTo(e){
    try{ if(window.closeSheet) closeSheet(); }catch(x){}
    if(e.act){ setTimeout(e.act,120); return; }
    if(e.s&&window.go) go(e.s);
    setTimeout(function(){
      var sc=document.getElementById('s-'+e.s); if(!sc) return;
      var el=e.q?sc.querySelector(e.q)||document.querySelector(e.q):null;
      if(!el&&e.match){
        var want=e.match.toLowerCase();
        el=Array.prototype.slice.call(sc.querySelectorAll(HEAD)).filter(function(x){ return (x.textContent||'').replace(/\s+/g,' ').trim().toLowerCase()===want; })[0]||null;
      }
      if(el) spot(el,e.t); else { var m=document.getElementById('main'); if(m&&m.scrollTo) m.scrollTo({top:0,behavior:'smooth'}); var t=sc.querySelector('.title,.title-s'); if(t) spot(t,e.t); }
    },520);
  }

  /* ---------------- the sheet ---------------- */
  var cur=null;
  function open(tour){
    cur=tour||null;
    if(!window.openSheet){ if(tour) tour(); return; }
    openSheet('<div class="grab"></div><div class="kh" id="khRoot">'+choices()+'</div>');
    wire();
  }
  function choices(){
    return '<div class="kh-h">Help</div><div class="kh-sub">What do you need?</div>'
      +'<div class="kh-two">'
        +'<button class="kh-opt" data-kh="tour"'+(cur?'':' disabled')+'><span class="kh-ic">↗</span><b>Show me around</b><span>A quick guided tour of this screen</span></button>'
        +'<button class="kh-opt" data-kh="find"><span class="kh-ic">⌕</span><b>Find anything</b><span>Type what you are looking for and Kova takes you to it</span></button>'
      +'</div>';
  }
  function findView(q){
    return '<button class="kh-back" data-kh="menu">‹ Help</button>'
      +'<div class="kh-h">Find anything</div>'
      +'<div class="kh-box"><span>⌕</span><input id="khQ" type="search" autocomplete="off" placeholder="Try: vitamins, dark mode, supersets, AI team" aria-label="Search Kova" value="'+esc(q||'')+'"></div>'
      +'<div id="khList" role="listbox"></div>';
  }
  function paintList(q){
    var L=document.getElementById('khList'); if(!L) return;
    var r=search(q);
    L.innerHTML='<div class="kh-cap">'+(r.mode==='popular'?'Popular':(r.mode==='near'?'Closest places to “'+esc(q)+'”':r.items.length+' place'+(r.items.length>1?'s':'')))+'</div>'
      +r.items.map(function(e,i){ return '<button class="kh-row" role="option" data-i="'+i+'"><span class="kh-t">'+esc(e.t)+'</span><span class="kh-w">'+esc(e.where)+'</span><span class="kh-go">›</span></button>'; }).join('');
    L.__items=r.items;
  }
  function wire(){
    var root=document.getElementById('khRoot'); if(!root) return;
    root.onclick=function(ev){
      var b=ev.target.closest('[data-kh],[data-i]'); if(!b) return;
      var a=b.getAttribute('data-kh');
      if(a==='tour'){ var t=cur; try{ if(window.closeSheet) closeSheet(); }catch(x){} if(t) setTimeout(t,260); return; }
      if(a==='find'){ root.innerHTML=findView(''); paintList(''); var i=document.getElementById('khQ'); if(i){ i.focus(); i.oninput=function(){ paintList(i.value); }; i.onkeydown=function(e){ if(e.key==='Enter'){ var L=document.getElementById('khList'); if(L&&L.__items&&L.__items[0]) goTo(L.__items[0]); } }; } return; }
      if(a==='menu'){ root.innerHTML=choices(); return; }
      if(b.hasAttribute('data-i')){ var L2=document.getElementById('khList'); var e2=L2&&L2.__items&&L2.__items[+b.getAttribute('data-i')]; if(e2) goTo(e2); }
    };
  }

  /* every help button opens the two choices first */
  window.addEventListener('click',function(e){
    var h=e.target.closest&&e.target.closest('[data-ktour],[data-wktour]'); if(!h) return;
    e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    var id=h.getAttribute('data-ktour');
    open(id?function(){ if(window.KovaScreenTour) KovaScreenTour.run(id); }:function(){ if(window.KovaWorkTour) KovaWorkTour.run(); });
  },true);

  return {open:open,search:search,index:index,goTo:goTo};
})();
