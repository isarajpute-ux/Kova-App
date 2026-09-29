/* =====================================================================
   KovaTraction - after a post goes out.

   - "Someone commented" pop-ups, from users/{uid}/traction/feed (the
     server's tractionWatch reads every platform every half hour).
   - The Traction sheet for a post: views per day (bars), where people stop
     watching (the retention curve with the biggest drop marked), who is
     watching (women / men, age groups), the numbers per platform, the
     comments - and "What should I fix?": the model reads all of it and
     answers in plain words, in business mode (buying intent, objections)
     or creator mode (watch time, shares).
   - The Business card: "for business inquiries" onto the Facebook Page and
     the YouTube channel directly; copy-and-open for the apps that do not
     let other apps edit a profile.
   In the preview (sample mode) a sample post fills everything in, so every
   chart is visible before anything is posted.
   ===================================================================== */
window.KovaTraction=(function(){
  'use strict';
  var S={posts:{},feed:{},advice:{},mode:null,src:'',ref:null,cur:null,tab:null,busy:false};
  var PN={youtube:'YouTube',instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok'};
  var SEEN='kova.traction.seen', MODE='kova.traction.mode', CARD='kova.card';
  function $(s,r){ return (r||document).querySelector(s); }
  function esc(x){ return String(x==null?'':x).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function lsPut(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function live(){ return !!(window.KovaMode&&KovaMode.live); }
  function toast(m){ try{ if(window.KovaToast) KovaToast(m); else if(window.KovaCanvas&&KovaCanvas.toast) KovaCanvas.toast(m); }catch(e){} }
  function api(path,opts){
    if(!window.KovaLink||!KovaLink.authFetch) return Promise.reject(new Error('The Kova server is not reachable.'));
    return KovaLink.authFetch(path,opts).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error||('HTTP '+r.status)); return j; }); });
  }
  function big(n){ if(n==null) return '—'; n=+n; return n>=1e6?(n/1e6).toFixed(1).replace(/\.0$/,'')+'M':(n>=1e4?Math.round(n/1e3)+'k':(n>=1e3?(n/1e3).toFixed(1).replace(/\.0$/,'')+'k':String(Math.round(n)))); }
  function ago(t){ var s=(Date.now()-t)/1e3; return s<60?'just now':(s<3600?Math.round(s/60)+' min ago':(s<86400?Math.round(s/3600)+' h ago':Math.round(s/86400)+' d ago')); }

  /* ---------------- sample post for the preview ---------------- */
  function sample(){
    var d=Date.now(), day=864e5, days={}, v=[0,1900,3400,4300,4900,5250,5450];
    v.forEach(function(x,i){ var k=new Date(d-(6-i)*day).toISOString().slice(0,10); days[k]={youtube:Math.round(x*.3),instagram:Math.round(x*.45),tiktok:Math.round(x*.25)}; });
    return {sample:{title:'Tote launch (sample)',at:d,publishedAt:d-6*day,days:days,trend:{dir:'falling',change:-58,perDay:[1900,1500,900,600,350,200]},
      platforms:{
        instagram:{metrics:{views:2450,reach:1980,likes:212,comments:18,shares:31,saves:64,watch_avg_s:6.2},url:'#',
          audience:{gender:{Women:71,Men:27,Other:2},age:{'18-24':38,'25-34':41,'35-44':14,'45+':7},scope:'people who engaged with your account this month'},
          comments:[{author:'@bea',text:'Does it come in black?',at:d-3600e3,likes:4},{author:'@marco',text:'How much is shipping to Canada??',at:d-7200e3,likes:6},
                    {author:'@jo',text:'The strap looks thin, is it strong?',at:d-9e6,likes:2},{author:'@tia',text:'obsessed with the green one',at:d-2e7,likes:9}],limits:[]},
        youtube:{metrics:{views:1635,likes:96,comments:11,shares:14,watch_avg_s:9.1,completion_pct:34},url:'#',
          retention:[[0,1],[.05,.71],[.1,.58],[.2,.49],[.3,.45],[.5,.39],[.7,.31],[.9,.24],[1,.2]],
          audience:{gender:{Women:64,Men:36},age:{'18-24':30,'25-34':44,'35-44':18,'45-54':8},scope:'this video'},
          daily:[['a',900],['b',500],['c',260],['d',150],['e',90],['f',60]],
          comments:[{author:'Sam K',text:'What is the price?',at:d-5e6,likes:3},{author:'Rae',text:'Love that you showed it packed with a laptop',at:d-8e6,likes:7}],limits:[]},
        tiktok:{metrics:{views:1360,likes:140,comments:9,shares:22},url:'#',limits:['TikTok gives apps the counts only - not the comments, watch time or who is watching. Those are in TikTok Studio.']}
      }}};
  }
  function sampleAdvice(mode){
    return {trend:'falling',mode:mode,at:Date.now(),
      headline:'Views dropped about 60% after day two, and 3 in 10 viewers leave in the first second - the opening is the lever.',
      working:['Saves are high on Instagram (64) - people want to come back to it.','The laptop-packing shot gets the most praise in the comments.'],
      fix:mode==='business'?['Put the price and "ships to Canada" on screen in the first 3 seconds - 5 of 17 comments ask about them.','Show the strap holding weight; "is it strong?" is the main doubt.','Open on the bag in hand, not the logo - YouTube loses 29% before second 2.']
                           :['Open on the payoff: the full bag, then pack it.','Cut the intro - YouTube loses 29% before second 2.'],
      angles:['"Everything that fits" - pack it live in 10 seconds.','Four colours, one outfit each, 1 second per colour.','Answer the top comment on camera: "Does it come in black?"'],
      themes:[{theme:'Price and shipping',share:35,sentiment:'neutral',quote:'How much is shipping to Canada??'},{theme:'Colours',share:30,sentiment:'positive',quote:'obsessed with the green one'},
              {theme:'Strap strength',share:15,sentiment:'negative',quote:'The strap looks thin, is it strong?'},{theme:'Packing',share:20,sentiment:'positive',quote:'Love that you showed it packed with a laptop'}],
      audience:'Mostly women 25-34 on Instagram and YouTube - lead with work-bag use, not travel.',
      decision:'new angle',next:{hook:'Everything I carry to work fits in this',length:'12-18 seconds',when:'Weekdays around 7pm'}};
  }

  /* ---------------- listening ---------------- */
  function listen(u){
    if(S.ref){ try{ S.ref.off(); }catch(e){} S.ref=null; }
    var fb=window.KOVA_FB;
    if(!u||!fb||!fb.db) return;
    S.ref=fb.db.ref('users/'+u.uid+'/traction');
    S.ref.on('value',function(sn){
      var v=sn.val()||{};
      S.posts=v.posts||{}; S.feed=v.feed||{}; S.advice=v.advice||{}; S.src='live';
      notify();
      if($('#ktSheet')) paintSheet();
    });
  }
  function useSample(){ S.posts=sample(); S.feed={}; S.src='sample'; }

  /* ---------------- "someone commented" ---------------- */
  function notify(){
    var seen=lsJ(SEEN,0), list=Object.keys(S.feed).map(function(k){ return S.feed[k]; }).filter(function(x){ return x&&x.at>seen; })
      .sort(function(a,b){ return b.at-a.at; });
    if(!list.length) return;
    if(!seen){ lsPut(SEEN,list[0].at); return; }                     /* first run on this device: start from now */
    if(window.KovaTour&&KovaTour.active()) return;
    var x=list[0], more=list.length-1, el=$('#ktPop');
    if(!el){ el=document.createElement('div'); el.id='ktPop'; el.className='kt-pop'; document.body.appendChild(el); requestAnimationFrame(function(){ el.classList.add('on'); }); }
    el.innerHTML='<div class="kt-ph"><span class="kt-pf">'+esc(PN[x.platform]||x.platform)+'</span>New comment on “'+esc(x.title)+'”'
        +'<button class="kt-x" data-t2="close" aria-label="Close">×</button></div>'
      +'<div class="kt-q"><b>'+esc(x.author||'Someone')+'</b> '+esc(x.text)+'</div>'
      +(more?'<div class="kt-more">+'+more+' more since you last looked</div>':'')
      +'<div class="kt-b"><button class="kg-btn main" data-t2="fix" data-id="'+esc(x.postId)+'">See what to fix</button><button class="kg-btn" data-t2="close">Later</button></div>';
    try{ if(navigator.vibrate) navigator.vibrate(20); }catch(e){}
  }

  /* ---------------- charts (plain SVG) ---------------- */
  function bars(vals,labels,h){
    h=h||120; var max=Math.max.apply(null,vals.concat([1])), w=100/vals.length;
    return '<svg class="kt-svg" viewBox="0 0 100 '+(h+14)+'" preserveAspectRatio="none">'
      +vals.map(function(v,i){ var bh=Math.max(1.5,v/max*h); return '<rect x="'+(i*w+w*.18)+'" y="'+(h-bh)+'" width="'+(w*.64)+'" height="'+bh+'" rx="1.2" class="'+(i===vals.length-1?'hot':'')+'"/>'; }).join('')
      +'</svg><div class="kt-xl">'+labels.map(function(l){ return '<span>'+esc(l)+'</span>'; }).join('')+'</div>';
  }
  function curve(ret,dur){
    var pts=ret.map(function(p){ return [p[0]*100,(1-Math.min(1.2,p[1])/1.2)*100]; });
    var worst=null; for(var i=1;i<ret.length;i++){ var d=ret[i-1][1]-ret[i][1]; if(!worst||d>worst.d) worst={d:d,i:i}; }
    var path=pts.map(function(p,i){ return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1); }).join(' ');
    var m=worst?pts[worst.i]:null, at=worst?(dur?Math.round(ret[worst.i][0]*dur)+'s':Math.round(ret[worst.i][0]*100)+'%'):'';
    return '<svg class="kt-svg kt-curve" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="'+path+' L100 100 L0 100 Z" class="fill"/><path d="'+path+'" class="line"/>'
      +(m?'<line x1="'+m[0]+'" x2="'+m[0]+'" y1="0" y2="100" class="mark"/>':'')+'</svg>'
      +(worst?'<div class="kt-note">Biggest drop at <b>'+esc(at)+'</b> - '+Math.round(worst.d*100)+'% of viewers leave there. '+Math.round(ret[ret.length-1][1]*100)+'% watch to the end.</div>':'');
  }
  function hbars(obj){
    var ks=Object.keys(obj||{}); if(!ks.length) return '';
    return ks.map(function(k){ var v=+obj[k]||0; return '<div class="kt-hb"><span>'+esc(k)+'</span><i><b style="width:'+Math.min(100,v)+'%"></b></i><em>'+Math.round(v)+'%</em></div>'; }).join('');
  }

  /* ---------------- the Traction sheet ---------------- */
  function open(pid){
    if(!live()&&!Object.keys(S.posts).length) useSample();
    var ids=Object.keys(S.posts).sort(function(a,b){ return (S.posts[b].at||0)-(S.posts[a].at||0); });
    S.cur=pid&&S.posts[pid]?pid:(ids[0]||null); S.tab=null;
    var v=$('#ktSheet');
    if(!v){ v=document.createElement('div'); v.id='ktSheet'; v.className='kg-veil'; document.body.appendChild(v);
      v.addEventListener('click',function(e){ if(e.target===v) v.remove(); }); }
    paintSheet();
    if(live()&&S.cur) api('/traction/refresh',{json:{postId:S.cur}}).catch(function(){});
  }
  function paintSheet(){
    var v=$('#ktSheet'); if(!v) return;
    var ids=Object.keys(S.posts).sort(function(a,b){ return (S.posts[b].at||0)-(S.posts[a].at||0); });
    if(!S.cur){
      v.innerHTML='<div class="kg-card kt-card"><div class="kg-ph"><div><div class="kg-pt">Traction</div><div class="kg-ps">Once a post is live, its views, drop-off, audience and comments show up here - and Kova tells you what to fix.</div></div>'
        +'<button class="kg-x" data-t2="shut">×</button></div><div class="kg-fine">Posts are read back every 30 minutes after they go out.</div></div>'; return;
    }
    var P=S.posts[S.cur], plats=Object.keys(P.platforms||{}), tab=S.tab&&P.platforms[S.tab]?S.tab:plats[0], X=P.platforms[tab]||{metrics:{}};
    var tot={views:0,likes:0,comments:0,shares:0}; plats.forEach(function(k){ var m=P.platforms[k].metrics||{}; Object.keys(tot).forEach(function(q){ tot[q]+=+m[q]||0; }); });
    var tr=P.trend||{}, dirN={rising:'Rising',steady:'Steady',falling:'Falling','too-early':'Too early to tell'}[tr.dir]||'—';
    var per=(tr.perDay||[]); if(X.daily&&X.daily.length>=3) per=X.daily.map(function(r){ return r[1]; });
    var labels=per.map(function(_,i){ return i===per.length-1?'today':'-'+(per.length-1-i)+'d'; });
    var M=X.metrics||{};
    var kpis=[['views','Views'],['reach','Reach'],['likes','Likes'],['comments','Comments'],['shares','Shares'],['saves','Saves'],['watch_avg_s','Avg watch'],['completion_pct','Watched']]
      .filter(function(k){ return M[k[0]]!=null; })
      .map(function(k){ var val=k[0]==='watch_avg_s'?M[k[0]]+'s':(k[0]==='completion_pct'?Math.round(M[k[0]])+'%':big(M[k[0]])); return '<div class="kt-k"><b>'+esc(val)+'</b><span>'+k[1]+'</span></div>'; }).join('');
    var aud=X.audience||null, adv=S.advice[S.cur]||(S.src==='sample'?S.sampleAdv:null);
    var mode=S.mode||lsJ(MODE,'business');
    var html='<div class="kg-card kt-card"><div class="kg-ph"><div><div class="kg-pt">'+esc(P.title||'Your post')+'</div>'
        +'<div class="kg-pm">'+(P.at?'Updated '+ago(P.at):'')+(S.src==='sample'?' · sample data':'')+'</div></div>'
        +'<button class="kg-x" data-t2="shut" aria-label="Close">×</button></div>'
      +(ids.length>1?'<select class="kt-sel" data-t3="post">'+ids.map(function(id){ return '<option value="'+esc(id)+'"'+(id===S.cur?' selected':'')+'>'+esc(S.posts[id].title||id)+'</option>'; }).join('')+'</select>':'')
      +'<div class="kt-sum"><div class="kt-trend '+esc(tr.dir||'')+'"><b>'+dirN+'</b>'+(tr.change!=null?'<span>'+(tr.change>0?'+':'')+tr.change+'% vs the 3 days before</span>':'')+'</div>'
        +'<div class="kt-tot"><b>'+big(tot.views)+'</b> views · '+big(tot.likes)+' likes · '+big(tot.comments)+' comments · '+big(tot.shares)+' shares</div></div>'
      +(per.length?'<div class="kt-sec"><div class="kt-h">Views per day</div>'+bars(per,labels)+'</div>':'')
      +'<div class="kt-tabs">'+plats.map(function(k){ return '<button class="kt-tab'+(k===tab?' on':'')+'" data-t2="tab" data-k="'+k+'">'+esc(PN[k]||k)+'</button>'; }).join('')+'</div>'
      +'<div class="kt-ks">'+kpis+'</div>'
      +(X.retention?'<div class="kt-sec"><div class="kt-h">Where people stop watching</div>'+curve(X.retention,null)+'</div>':'')
      +(aud?'<div class="kt-sec"><div class="kt-h">Who is watching <em>'+esc(aud.scope||'')+'</em></div><div class="kt-aud"><div>'+hbars(aud.gender)+'</div><div>'+hbars(aud.age)+'</div></div></div>':'')
      +((X.comments||[]).length?'<div class="kt-sec"><div class="kt-h">Comments</div>'+X.comments.slice(0,8).map(function(c){ return '<div class="kt-c"><b>'+esc(c.author)+'</b> '+esc(c.text)+(c.likes?'<span>♥ '+c.likes+'</span>':'')+'</div>'; }).join('')+'</div>':'')
      +((X.limits||[]).length?'<div class="kg-fine">'+X.limits.map(esc).join(' ')+'</div>':'')
      +(X.error?'<div class="kg-fine" style="color:#FF9A91">'+esc(PN[tab])+': '+esc(X.error)+'</div>':'')
      +'<div class="kt-adv"><div class="kt-h">What should I fix?</div>'
        +'<div class="kt-mode"><button class="kt-tab'+(mode==='business'?' on':'')+'" data-t2="mode" data-m="business">Selling something</button><button class="kt-tab'+(mode==='creator'?' on':'')+'" data-t2="mode" data-m="creator">Regular content</button></div>'
        +(adv?advHtml(adv):'')
        +'<button class="kg-btn main kt-go" data-t2="advise">'+(S.busy?'Reading the numbers and comments…':(adv?'Ask again':'Get advice'))+'</button></div>'
      +'</div>';
    v.innerHTML=html;
  }
  function advHtml(a){
    var list=function(t,xs,cls){ return xs&&xs.length?'<div class="kt-al '+cls+'"><div class="kt-at">'+t+'</div>'+xs.map(function(x){ return '<div class="kt-ai">'+esc(x)+'</div>'; }).join('')+'</div>':''; };
    var dec={keep:'Keep it running','tweak':'Tweak it','new angle':'Change the angle'}[a.decision]||'';
    return '<div class="kt-verdict '+esc(a.decision||'').replace(' ','-')+'"><b>'+esc(dec)+'</b>'+esc(a.headline||'')+'</div>'
      +list('Fix',a.fix,'fix')+list('Keep',a.working,'keep')+list('Try next',a.angles,'try')
      +(a.themes&&a.themes.length?'<div class="kt-al"><div class="kt-at">What the comments are about</div>'+a.themes.map(function(t){
          return '<div class="kt-th '+esc(t.sentiment)+'"><div class="kt-hb"><span>'+esc(t.theme)+'</span><i><b style="width:'+t.share+'%"></b></i><em>'+t.share+'%</em></div>'+(t.quote?'<q>'+esc(t.quote)+'</q>':'')+'</div>'; }).join('')+'</div>':'')
      +(a.audience?'<div class="kt-al"><div class="kt-at">Audience</div><div class="kt-ai">'+esc(a.audience)+'</div></div>':'')
      +(a.next&&a.next.hook?'<div class="kt-al try"><div class="kt-at">Next post</div><div class="kt-ai">“'+esc(a.next.hook)+'” · '+esc(a.next.length)+' · '+esc(a.next.when)+'</div></div>':'');
  }
  function advise(){
    var mode=S.mode||lsJ(MODE,'business');
    if(S.src==='sample'){ S.busy=true; paintSheet(); setTimeout(function(){ S.busy=false; S.sampleAdv=sampleAdvice(mode); paintSheet(); },900); return; }
    S.busy=true; paintSheet();
    api('/traction/'+encodeURIComponent(S.cur)+'/advice',{json:{mode:mode}}).then(function(a){ S.advice[S.cur]=a; S.busy=false; paintSheet(); })
      .catch(function(e){ S.busy=false; paintSheet(); toast(e.message); });
  }

  /* ---------------- the business card ---------------- */
  var BY_HAND=[['instagram','Instagram','https://www.instagram.com/accounts/edit/','Edit profile → Contact options (Professional accounts)'],
               ['tiktok','TikTok','https://www.tiktok.com/','TikTok app → Edit profile → Email (Business accounts)'],
               ['x','X','https://x.com/settings/profile','Edit profile → Bio and Website'],
               ['linkedin','LinkedIn','https://www.linkedin.com/in/me/edit/contact-info/','Contact info'],
               ['threads','Threads','https://www.threads.net/','Edit profile → Bio and Link'],
               ['pinterest','Pinterest','https://www.pinterest.com/settings/profile','Edit profile → About and Website']];
  function cardText(c){ return [c.bio,c.email&&'Business inquiries: '+c.email,c.phone,c.website,c.booking&&'Book: '+c.booking].filter(Boolean).join('\n'); }
  function card(){
    var c=lsJ(CARD,{}), v=$('#ktSheet');
    if(!v){ v=document.createElement('div'); v.id='ktSheet'; v.className='kg-veil'; document.body.appendChild(v); v.addEventListener('click',function(e){ if(e.target===v) v.remove(); }); }
    var f=function(k,l,ph,t){ return '<label class="ks-lab">'+l+'</label><input class="ks-in kt-in" data-c="'+k+'" type="'+(t||'text')+'" value="'+esc(c[k]||'')+'" placeholder="'+esc(ph)+'">'; };
    v.innerHTML='<div class="kg-card kt-card ks"><div class="kg-ph"><div><div class="kg-pt">Business card</div><div class="kg-ps">The “for business inquiries” details on every profile. Fill it once.</div></div>'
        +'<button class="kg-x" data-t2="shut">×</button></div>'
      +f('email','Business email','hello@yourshop.com','email')+f('phone','Phone (optional)','+1 555 0100','tel')
      +f('website','Website or shop','https://yourshop.com','url')+f('booking','Booking link (optional)','https://calendly.com/you','url')
      +f('bio','One-line bio','Bags for every day. Made in Lisbon.')
      +'<button class="kg-btn main kt-go" data-t2="cardpush">Update Facebook Page and YouTube</button>'
      +'<div class="kt-h" style="margin-top:16px">These apps don’t let other apps edit your profile</div>'
      +BY_HAND.map(function(x){ return '<div class="kt-hand"><div><b>'+x[1]+'</b><span>'+esc(x[3])+'</span></div><button class="kg-btn" data-t2="cardhand" data-u="'+esc(x[2])+'" data-n="'+x[1]+'">Copy & open</button></div>'; }).join('')
      +'<div class="kg-fine" id="ktCardOut"></div></div>';
  }
  function readCard(){ var c={}; Array.prototype.forEach.call(document.querySelectorAll('[data-c]'),function(i){ c[i.getAttribute('data-c')]=i.value.trim(); }); lsPut(CARD,c); return c; }

  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-t2]'); if(!b) return;
    var a=b.getAttribute('data-t2');
    if(a==='close'){ var p=$('#ktPop'); if(p) p.remove(); lsPut(SEEN,Date.now()); }
    else if(a==='fix'){ var p2=$('#ktPop'); if(p2) p2.remove(); lsPut(SEEN,Date.now()); open(b.getAttribute('data-id')); }
    else if(a==='shut'){ var s=$('#ktSheet'); if(s) s.remove(); }
    else if(a==='tab'){ S.tab=b.getAttribute('data-k'); paintSheet(); }
    else if(a==='mode'){ S.mode=b.getAttribute('data-m'); lsPut(MODE,S.mode); paintSheet(); }
    else if(a==='advise'){ if(!S.busy) advise(); }
    else if(a==='cardpush'){
      var c=readCard(), out=$('#ktCardOut');
      if(!c.email&&!c.phone&&!c.website){ toast('Add at least an email or a link.'); return; }
      if(!live()){ if(out) out.textContent='Saved. Facebook and YouTube update once the Kova server is live and those accounts are connected.'; return; }
      if(out) out.textContent='Updating…';
      api('/card/push',{json:{card:c}}).then(function(j){
        var r=j.results||{};
        if(out) out.innerHTML=['facebook','youtube'].map(function(k){ var x=r[k]||{}; return '<b>'+(k==='facebook'?'Facebook Page':'YouTube')+':</b> '+esc(x.state==='ok'?'updated':(x.msg||'not connected')); }).join('<br>');
      }).catch(function(err){ if(out) out.textContent=err.message; });
    }
    else if(a==='cardhand'){
      var cc=readCard(), txt=cardText(cc);
      window.open(b.getAttribute('data-u'),'_blank','noopener');
      var said=function(){ toast('Copied. Paste it into '+b.getAttribute('data-n')+'.'); };
      if(navigator.clipboard) navigator.clipboard.writeText(txt).then(said,said); else said();
    }
    else return;
    e.preventDefault(); e.stopPropagation();
  },true);
  document.addEventListener('change',function(e){
    if(e.target&&e.target.getAttribute&&e.target.getAttribute('data-t3')==='post'){ S.cur=e.target.value; S.tab=null; paintSheet(); }
  });

  function start(){
    var fb=window.KOVA_FB;
    if(fb&&fb.auth&&live()) fb.auth.onAuthStateChanged(function(u){ if(u) listen(u); });
    else useSample();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(start,1800); }); else setTimeout(start,1800);
  return {open:open,card:card,_state:S,_notify:notify};
})();
