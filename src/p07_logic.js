/* =====================================================================
   WORK OS STUDIO (p07) — the post builder and publisher

   KovaBlobs   the actual photo/video bytes, kept on this device in
               IndexedDB so a draft survives a reload before it is ever
               uploaded. Only small thumbnails ride the synced store.
   KovaPost    what a post is, how its words become each platform's
               caption, what each platform will refuse, and the calls
               to the api function that upload and publish it.
   KovaCanvas  the screen (further down).

   Posts live in WorkOS as `content` records with kind:'post', so they
   sync with everything else and the Studio home pipeline counts them.
   ===================================================================== */
window.KovaBlobs=(function(){
  'use strict';
  var DB='kova-studio', ST='media', mem={}, dbp=null;
  function open(){
    if(dbp) return dbp;
    dbp=new Promise(function(res){
      try{
        if(!window.indexedDB){ res(null); return; }
        var rq=indexedDB.open(DB,1);
        rq.onupgradeneeded=function(){ rq.result.createObjectStore(ST); };
        rq.onsuccess=function(){ res(rq.result); };
        rq.onerror=function(){ res(null); };
        rq.onblocked=function(){ res(null); };
      }catch(e){ res(null); }
    });
    return dbp;
  }
  /* private browsing can refuse IndexedDB; the session copy still works */
  function tx(mode,fn){
    return open().then(function(db){
      if(!db) return fn(null);
      return new Promise(function(res){
        try{
          var t=db.transaction(ST,mode), s=t.objectStore(ST), out=fn(s);
          t.oncomplete=function(){ res(out&&out.result!==undefined?out.result:out); };
          t.onerror=t.onabort=function(){ res(null); };
        }catch(e){ res(fn(null)); }
      });
    });
  }
  return {
    put:function(k,blob){ mem[k]=blob; return tx('readwrite',function(s){ if(s) s.put(blob,k); return true; }); },
    get:function(k){
      if(mem[k]) return Promise.resolve(mem[k]);
      return tx('readonly',function(s){ return s?s.get(k):null; }).then(function(b){ if(b) mem[k]=b; return b||null; });
    },
    del:function(k){ delete mem[k]; return tx('readwrite',function(s){ if(s) s.delete(k); return true; }); }
  };
})();

window.KovaPost=(function(){
  'use strict';

  /* ---- what each platform takes -----------------------------------
     These are the published API limits, not guesses: they are what the
     server will be refused on, so the Studio says so before anything
     is uploaded. */
  var PLAT={
    youtube:  {n:'YouTube',   link:'youtube',  kinds:{video:1},                         text:5000, title:100, one:true,
               note:'One video. Title from your heading.'},
    instagram:{n:'Instagram', link:'instagram',kinds:{image:1,slider:1,video:1},        text:2200, max:10, tags:30,
               note:'Photo, slider of up to 10, or a Reel.'},
    tiktok:   {n:'TikTok',    link:'tiktok',   kinds:{video:1},                         text:2200, one:true,
               note:'One video. Draft lands in your TikTok inbox.'},
    linkedin: {n:'LinkedIn',  link:'linkedin', kinds:{text:1,image:1,slider:1,video:1}, text:3000, max:20, noMix:true,
               note:'Text, photos, or one video.'},
    x:        {n:'X',         link:'x',        kinds:{text:1,image:1,slider:1,video:1}, text:280,  max:4,  noMix:true,
               note:'280 characters, up to 4 photos or one video.'},
    facebook: {n:'Facebook',  link:'facebook', kinds:{text:1,image:1,slider:1,video:1}, text:63206, max:10, noMix:true,
               note:'Posts to your Facebook Page.'},
    metaads:  {n:'Meta Ads',  link:'metaads',  kinds:{image:1,slider:1,video:1},        text:5000, max:20, library:true,
               note:'Builds your ads in Ads Manager, switched off: a campaign, an ad set with your budget, one ad per photo or clip.'},
    threads:  {n:'Threads',   link:'threads',  kinds:{text:1,image:1,slider:1,video:1}, text:500,  max:20,
               note:'500 characters, up to 20 items.'},
    pinterest:{n:'Pinterest', link:'pinterest',kinds:{image:1,slider:1,video:1},        text:800,  max:5,  noMix:true, title:100,
               note:'A Pin with your shop link. Up to 5 photos.'},
    bluesky:  {n:'Bluesky',   link:'bluesky',  kinds:{text:1,image:1,slider:1},         text:300,  max:4,  photosOnly:true,
               note:'300 characters, up to 4 photos.'},
    reddit:   {n:'Reddit',    link:'reddit',   kinds:{text:1,image:1},                  text:40000, title:300,
               note:'Needs a title. Pick the subreddit in Settings.'},
    tumblr:   {n:'Tumblr',    link:'tumblr',   kinds:{text:1,image:1,slider:1,video:1}, text:20000, max:10,
               note:'Drafts land in your Tumblr drafts.'},
    mastodon: {n:'Mastodon',  link:'mastodon', kinds:{text:1,image:1,slider:1,video:1}, text:500,  max:4,  noMix:true,
               note:'Any Mastodon server.'},
    discord:  {n:'Discord',   link:'discord',  kinds:{text:1,image:1,slider:1,video:1}, text:2000, max:10,
               note:'Posts into one channel through a webhook.'},
    telegram: {n:'Telegram',  link:'telegram', kinds:{text:1,image:1,slider:1,video:1}, text:4096, cap:1024, max:10,
               note:'Posts to your channel through your bot.'},
    gbusiness:{n:'Google Business', link:'gbusiness', kinds:{text:1,image:1},          text:1500,
               note:'An update on your Google listing.'}
  };
  var ORDER=['instagram','facebook','tiktok','youtube','x','threads','linkedin','pinterest',
             'metaads','gbusiness','reddit','discord','telegram','bluesky','mastodon','tumblr'];
  var GROUPS=[['Social',['instagram','facebook','tiktok','youtube','x','threads','linkedin','pinterest']],
              ['Ads & listings',['metaads','gbusiness']],
              ['Communities',['reddit','discord','telegram','bluesky','mastodon','tumblr']]];
  /* how each one connects when the server has not said yet */
  var KIND={bluesky:'form',discord:'form',telegram:'form',mastodon:'instance'};
  /* Business or personal only matters where it changes what an app may
     do: Facebook and Instagram let apps post for a Page / a Professional
     account only, and a LinkedIn Company Page needs LinkedIn's approval
     first. The other kind is handed to you, ready to post. */
  var ACCT={
    facebook:{api:'business',
      business:['Business Page','A Page for your brand or shop. Kova posts to it for you - and can build your ads.'],
      personal:['Personal profile','Facebook lets no app post to personal profiles. Kova gets it ready - file saved, words copied - and opens Facebook for you to tap Post.']},
    instagram:{api:'business',
      business:['Professional account','Business or Creator. Kova posts photos, sliders and Reels for you.'],
      personal:['Personal account','Instagram lets apps post only for Professional accounts. Kova hands it to you ready to post - or switch for free in a minute.']},
    linkedin:{api:'personal',
      personal:['My profile','Kova posts to your own LinkedIn for you.'],
      business:['Company Page','LinkedIn approves apps before they post for Pages, so Kova hands it to you ready to post.']}
  };
  /* where "post it yourself" opens */
  var HAND={facebook:'https://www.facebook.com/',instagram:'https://www.instagram.com/',linkedin:'https://www.linkedin.com/feed/',
            tiktok:'https://www.tiktok.com/upload',youtube:'https://studio.youtube.com/',x:'https://x.com/compose/post',
            threads:'https://www.threads.net/',pinterest:'https://www.pinterest.com/pin-creation-tool/'};
  function lsJ(k){ try{ return JSON.parse(localStorage.getItem(k)||'{}')||{}; }catch(e){ return {}; } }
  function lsPut(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function acct(k){ return ACCT[k]?(lsJ('ks.acct')[k]||''):''; }
  function setAcct(k,v){ var m=lsJ('ks.acct'); if(v) m[k]=v; else delete m[k]; lsPut('ks.acct',m); }
  function byHand(k){ var a=ACCT[k], v=acct(k); return !!(a&&v&&v!==a.api)||(!!HAND[k]&&lsJ('ks.hand')[k]===1); }
  function setHand(k,on){ var m=lsJ('ks.hand'); if(on) m[k]=1; else delete m[k]; lsPut('ks.hand',m); }

  /* where on the platform it lands. Only listed where there is a real
     choice; everything else is simply a post. */
  var PLACES={
    instagram:[['post','Post','Feed photo, slider or video'],['reel','Reel','One vertical video, up to 15 min'],['story','Story','One photo or clip, up for 24 hours']],
    facebook: [['post','Post','On your Page\u2019s feed'],['reel','Reel','One vertical video, 3 to 90 seconds'],['story','Story','One photo or clip, up for 24 hours']],
    youtube:  [['video','Video','A regular upload'],['short','Short','Vertical or square, 3 minutes or less']],
    tiktok:   [['direct','Post it','Goes live on your profile'],['draft','Inbox draft','Lands in TikTok to add a sound, then post']]
  };
  function autoPlace(post,k){
    var m=postMedia(post), v=m.length===1&&m[0].kind==='video', tall=v&&m[0].h>=m[0].w;
    if(k==='instagram'||k==='facebook') return v&&tall?'reel':'post';
    if(k==='youtube') return tall&&m[0].dur&&m[0].dur<=180?'short':'video';
    if(k==='tiktok') return 'direct';
    return '';
  }
  function place(post,k){
    var l=PLACES[k]; if(!l) return '';
    var v=k==='tiktok'?((post.opts&&post.opts.tiktok)||{}).mode:(post.place||{})[k];
    return l.some(function(x){ return x[0]===v; })?v:autoPlace(post,k);
  }
  function setPlace(post,k,v){
    post.place=post.place||{}; post.place[k]=v;
    if(k==='tiktok'){ post.opts.tiktok=post.opts.tiktok||{}; post.opts.tiktok.mode=v; }
    return post;
  }
  function placeName(post,k){ var v=place(post,k), l=PLACES[k]||[]; for(var i=0;i<l.length;i++) if(l[i][0]===v) return l[i][1]; return ''; }

  /* what Kova builds in Ads Manager unless told otherwise */
  var AD_DEF={build:'ads',goal:'sales',budget:20,split:'one',countries:['US'],cta:'SHOP_NOW',event:'PURCHASE'};
  var AD_GOAL={sales:'Sales',traffic:'Traffic',awareness:'Awareness'};
  var AD_CTA=[['SHOP_NOW','Shop now'],['LEARN_MORE','Learn more'],['ORDER_NOW','Order now'],['BUY_NOW','Buy now'],
              ['GET_OFFER','Get offer'],['SIGN_UP','Sign up'],['SUBSCRIBE','Subscribe'],['CONTACT_US','Contact us']];
  var AD_EVENT=[['PURCHASE','Purchase'],['ADD_TO_CART','Add to cart'],['INITIATED_CHECKOUT','Checkout started'],
                ['ADD_PAYMENT_INFO','Payment info added'],['LEAD','Lead'],['COMPLETE_REGISTRATION','Sign-up'],['VIEW_CONTENT','Product viewed']];
  function adOpts(post){
    var o=(post&&post.opts&&post.opts.metaads)||{}, out={};
    Object.keys(AD_DEF).forEach(function(k){ out[k]=o[k]!=null?o[k]:AD_DEF[k]; });
    out.countries=(out.countries||[]).slice();
    return out;
  }
  function shapeOf(m){
    if(!m||!m.w||!m.h) return '';
    var r=m.w/m.h, best=null;
    [['9:16',9/16],['4:5',.8],['1:1',1],['1.91:1',1.91],['16:9',16/9]].forEach(function(k){ if(!best||Math.abs(k[1]-r)<Math.abs(best[1]-r)) best=k; });
    return best[0];
  }

  var FORMATS=['image','slider','video','text'];
  var FORMAT_N={image:'Single photo',slider:'Slider',video:'Video',text:'Text only'};
  var ASPECTS=['orig','1:1','4:5','9:16','16:9'];
  var ASPECT_N={orig:'Original','1:1':'1:1','4:5':'4:5','9:16':'9:16','16:9':'16:9'};
  var FIELDS=['heading','body','caption','tags'];

  function uid(p){ return (p||'p')+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
  function chars(s){ return Array.from(String(s||'')).length; }
  function clean(s){ return String(s||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').trim(); }
  function firstLine(s){ return clean(s).split('\n')[0]||''; }
  function cut(s,n){ var a=Array.from(String(s||'')); return a.length>n?a.slice(0,n).join(''):a.join(''); }

  /* X weighs a link as 23 and CJK/emoji as 2 - same rule as the server */
  function xLength(s){
    var t=String(s||'').replace(/https?:\/\/\S+/g,new Array(24).join('#')), n=0;
    Array.from(t).forEach(function(ch){
      var c=ch.codePointAt(0);
      n+=(c<=0x10FF||(c>=0x2000&&c<=0x200D)||(c>=0x2010&&c<=0x201F)||(c>=0x2032&&c<=0x2037))?1:2;
    });
    return n;
  }
  function tagList(t){
    return String(t||'').split(/[\s,]+/).map(function(x){ return x.replace(/^#+/,'').replace(/[^\p{L}\p{N}_]/gu,''); })
      .filter(Boolean).filter(function(x,i,a){ return a.indexOf(x)===i; });
  }
  function tagLine(t,max){ return tagList(t).slice(0,max||30).map(function(x){ return '#'+x; }).join(' '); }
  function join(parts){ return parts.map(clean).filter(Boolean).filter(function(x,i,a){ return a.indexOf(x)===i; }).join('\n\n'); }

  function blank(){
    return {id:uid('post'),kind:'post',title:'Untitled post',created:Date.now(),updated:Date.now(),
            status:'draft',format:'image',aspect:'4:5',coverText:false,media:[],
            heading:'',body:'',caption:'',tags:'',targets:[],over:{},
            opts:{youtube:{privacy:'public'},tiktok:{mode:'direct'},metaads:JSON.parse(JSON.stringify(AD_DEF))},link:'',subreddit:'',
            mode:'now',when:0,fav:false,results:{},server:null};
  }

  function included(post){ return (post.media||[]).filter(function(m){ return m.on!==false; }); }
  /* what actually goes out for the chosen format */
  function postMedia(post){
    var m=included(post), f=post.format||naturalFormat(post);
    if(f==='text') return [];
    if(f==='image') return m.filter(function(x){ return x.kind==='image'; }).slice(0,1);
    if(f==='video') return m.filter(function(x){ return x.kind==='video'; }).slice(0,1);
    return m;
  }

  /* the format the media actually supports, used when the person has not
     picked one or picked one the media cannot be */
  function naturalFormat(post){
    var m=included(post);
    if(!m.length) return 'text';
    if(m.length>1) return 'slider';
    return m[0].kind==='video'?'video':'image';
  }

  /* ---- words per platform -------------------------------------------
     Heading = the title (YouTube title, first line elsewhere).
     Primary = the main words (descriptions, LinkedIn).
     Caption = the short line under the media (Instagram, TikTok, X).
     Tags    = hashtags, trimmed to what each platform tolerates.
     A per-platform edit in `over` replaces the result outright. */
  function compose(post,k){
    var o=(post.over&&post.over[k])||{};
    var H=clean(post.heading), B=clean(post.body), C=clean(post.caption);
    var out;
    if(k==='youtube'){
      /* never the internal post name - that label is for you, not viewers */
      out={title:cut(H||C||firstLine(B),100),
           description:join([B||C, tagLine(post.tags,15)]),
           tags:tagList(post.tags).slice(0,30)};
      if(o.title!=null) out.title=o.title;
      if(o.description!=null) out.description=o.description;
      out.text=out.description;
      return out;
    }
    if(k==='instagram'){ out={caption:join([C||H, B, tagLine(post.tags,30)])}; }
    else if(k==='tiktok'){ out={caption:join([C||H||firstLine(B), tagLine(post.tags,8)])}; }
    else if(k==='linkedin'){ out={text:join([H, B||C, tagLine(post.tags,5)]), title:cut(H,200)}; }
    else if(k==='x'){
      var head=C||H||firstLine(B);
      var withTags=join([head, tagLine(post.tags,2)]);
      out={text:xLength(withTags)<=280?withTags:head};
    }
    else if(k==='facebook'){ out={text:join([H, B||C, tagLine(post.tags,5)]), title:cut(H,250)}; }
    else if(k==='metaads'){
      /* primary text, headline, the line under the headline - no hashtags in ads */
      out={primary:B||C, headline:cut(H,255), description:B?cut(C,255):''};
      if(o.text!=null) out.primary=o.text;
      out.text=out.primary;
    }
    else if(k==='threads'){ var th=C||H||firstLine(B), tw=join([th, tagLine(post.tags,3)]); out={text:chars(tw)<=500?tw:th}; }
    else if(k==='pinterest'){ out={title:cut(H||C||firstLine(B),100), description:cut(join([C||B, tagLine(post.tags,10)]),800),
                                   link:/^https?:\/\//.test(post.link||'')?post.link:''}; out.text=out.description; }
    else if(k==='bluesky'){ var bh=C||H||firstLine(B), bw=join([bh, tagLine(post.tags,2)]); out={text:chars(bw)<=300?bw:bh}; }
    else if(k==='reddit'){ out={title:cut(H||C||firstLine(B),300), text:B||C}; }
    else if(k==='tumblr'){ out={text:join([H, B||C]), tags:tagList(post.tags).slice(0,30)}; }
    else if(k==='mastodon'){ var mh=C||H||firstLine(B), mw=join([mh, tagLine(post.tags,4)]); out={text:chars(mw)<=500?mw:mh}; }
    else if(k==='discord'){ out={text:join([H, B||C])}; }
    else if(k==='telegram'){ out={text:join([H, B||C, tagLine(post.tags,5)])}; }
    else if(k==='gbusiness'){ out={text:cut(join([H, B||C]),1500)}; }
    else out={};
    if(o.text!=null){
      if('caption' in out) out.caption=o.text;
      else if(k==='pinterest') out.description=o.text;
      else out.text=o.text;
    }
    out.text=k==='pinterest'?out.description:(out.text!=null?out.text:out.caption);
    return out;
  }

  /* ---- what each platform will refuse -------------------------------
     problems block publishing to that platform; warnings do not. */
  function check(post,k,linkState){
    var P=PLAT[k], pr=[], wn=[];
    var all=included(post), fmt=post.format||naturalFormat(post), m=postMedia(post);
    var vids=m.filter(function(x){return x.kind==='video'}), imgs=m.filter(function(x){return x.kind==='image'});
    var t=compose(post,k), words=t.text||'';

    if(!P.kinds[fmt]) pr.push(P.n+' does not take '+(FORMAT_N[fmt]||fmt).toLowerCase()+' posts.');
    if(fmt==='text'&&all.length) wn.push('Text only: the attached media is left out.');
    if(fmt==='slider'&&m.length<2) pr.push('A slider needs at least two photos or clips.');
    if((fmt==='image')&&!imgs.length) pr.push('Add a photo.');
    if(fmt==='video'&&!vids.length) pr.push('Add a video.');
    if(fmt==='image'&&all.length>1) wn.push('Single photo: only the first photo is posted.');
    if(fmt==='video'&&all.length>1) wn.push('Video: only the first clip is posted.');
    if(P.max&&fmt==='slider'&&m.length>P.max) pr.push(P.n+' takes up to '+P.max+' items.');
    if(P.noMix&&fmt==='slider'&&vids.length&&imgs.length) pr.push(P.n+' takes photos or one video, not both.');
    if(P.noMix&&fmt==='slider'&&vids.length>1) pr.push(P.n+' takes one video per post.');
    if(k==='instagram'&&fmt==='text') pr.push('Instagram needs a photo or video.');
    if(P.photosOnly&&vids.length) pr.push(P.n+' posts from Kova take photos, not video.');
    if(P.library&&!m.length) pr.push('Add the photos or videos to send to your ad account.');
    if(k==='metaads'&&adOpts(post).build==='ads'){
      var ao=adOpts(post);
      if(ao.goal!=='awareness'&&!/^https:\/\//.test(post.link||'')) pr.push('Add your shop link (https://\u2026) in Ad setup - the ad button sends people there.');
      if(!(+ao.budget>0)) pr.push('Set a daily budget in Ad setup.');
      if(!clean(t.primary)) wn.push('Ads do better with primary text - write it in Words.');
      if(chars(t.headline)>40) wn.push('Meta shows about 40 characters of a headline.');
      m.forEach(function(x){ if(x.w&&x.h&&x.w/x.h>1.2) wn.push(x.name+' is wide. 9:16, 4:5 or 1:1 fills more of the screen.'); });
    }
    if(k==='pinterest'&&!m.length) pr.push('A Pin needs a photo or video.');
    if(k==='reddit'&&!clean(t.title)) pr.push('Reddit needs a title. Write a heading.');
    if(k==='reddit'&&m.length>1) pr.push('Reddit posts from Kova take one photo.');
    if(k==='gbusiness'&&!clean(words)) pr.push('A Business Profile update needs some words.');
    if(k==='gbusiness'&&m.length>1) wn.push('Google Business shows one photo; the first is used.');
    if(k==='telegram'&&m.length&&chars(words)>1024) pr.push('Telegram captions stop at 1,024 characters ('+chars(words)+').');
    if(k==='pinterest'&&post.link&&!/^https?:\/\//.test(post.link)) wn.push('The shop link should start with https://');
    var pl=place(post,k);
    if((k==='instagram'||k==='facebook')&&pl==='story'){
      if(m.length!==1) pr.push('A '+P.n+' Story takes one photo or one clip.');
      if(vids[0]&&vids[0].dur>60) pr.push(P.n+' Story clips stop at 60 seconds.');
      if(clean(words)) wn.push('Stories show no caption - the words stay out.');
    }
    if((k==='instagram'||k==='facebook')&&pl==='reel'&&!(m.length===1&&vids.length===1)) pr.push('A Reel is one video. Pick Post for photos.');
    if(k==='facebook'&&pl==='reel'&&vids[0]&&vids[0].dur>90) pr.push('Facebook Reels made by apps stop at 90 seconds.');
    if(k==='youtube'&&pl==='short'&&vids[0]){
      if(vids[0].dur>180) pr.push('Shorts stop at 3 minutes. Pick Video.');
      if(vids[0].w>vids[0].h) wn.push('Shorts are vertical or square - this clip is wide.');
    }
    if(k==='instagram'&&imgs.length&&post.aspect==='9:16'&&fmt!=='video'&&pl!=='story') pr.push('Instagram photos can be at most 4:5 tall. Pick 4:5 or 1:1.');
    if(k==='instagram'&&imgs.length&&post.aspect==='16:9'&&fmt!=='video') wn.push('Wide photos show small in the Instagram feed.');
    if(k==='youtube'&&!clean(t.title)) pr.push('YouTube needs a title. Write a heading.');
    if(k==='youtube'&&chars(t.title)>100) pr.push('YouTube titles stop at 100 characters.');
    if(k==='x'&&xLength(words)>280) pr.push('Too long for X ('+xLength(words)+'/280). Shorten the caption or edit it for X.');
    else if(P.text&&chars(words)>P.text) pr.push('Too long for '+P.n+' ('+chars(words)+'/'+P.text+').');
    if(k==='instagram'&&tagList(post.tags).length>30) wn.push('Instagram keeps the first 30 hashtags.');
    if(fmt==='text'&&P.kinds.text&&k!=='gbusiness'&&!clean(words)&&!(k==='reddit'&&clean(t.title))) pr.push('Nothing to post yet.');
    vids.forEach(function(v){
      if(v.dur&&k==='x'&&v.dur>140) pr.push('X takes videos up to 2:20.');
      if(k==='telegram'&&v.bytes>50*1048576) pr.push('Telegram bots can send videos up to 50 MB.');
      if(k==='discord'&&v.bytes>25*1048576) pr.push('Discord takes up to 25 MB of files per message.');
      if(v.dur&&k==='tiktok'&&v.dur>600) pr.push('TikTok takes videos up to 10 minutes.');
      if(v.dur&&(k==='tiktok'||k==='instagram')&&v.dur<3) pr.push(P.n+' needs at least 3 seconds of video.');
      if(v.dur&&k==='instagram'&&v.dur>900) pr.push('Reels made through the API stop at 15 minutes.');
      if(v.bytes>500*1048576) pr.push('That video is over 500 MB.');
      if(v.mime&&!/mp4|quicktime|mov/i.test(v.mime)&&(k==='instagram'||k==='tiktok'||k==='x')) wn.push(P.n+' prefers MP4 or MOV video.');
    });
    if(linkState==='off') pr.push('Connect '+P.n+' first.');
    if(linkState==='noupload') pr.push('Reconnect Google and allow YouTube uploads.');
    if(linkState==='unconfigured') pr.push(P.n+' is not set up on the Kova server yet.');
    return {ok:!pr.length,problems:pr,warnings:wn,text:t};
  }

  /* ---- account state, from the cached /status ------------------------ */
  function linkState(k){
    if(byHand(k)) return 'manual';
    var L=window.KovaLink; if(!L) return 'off';
    var c=L.cache?L.cache():{};
    var e=c[PLAT[k].link]||{};
    if(e.configured===false&&!KIND[k]) return 'unconfigured';
    if(k==='youtube'){
      if(!(c.google&&c.google.linked)) return 'off';
      return e.canUpload===false?'noupload':'on';
    }
    return e.linked?'on':'off';
  }
  function label(k){ var c=(window.KovaLink&&KovaLink.cache&&KovaLink.cache())||{}; var e=c[k==='youtube'?'google':k]||{}; return e.label||''; }

  /* ---- storage (WorkOS content records) ------------------------------ */
  function all(){
    if(!window.WorkOS) return [];
    return WorkOS.list('content').filter(function(c){ return c.kind==='post'; })
      .sort(function(a,b){ return (b.updated||0)-(a.updated||0); });
  }
  function find(id){ return window.WorkOS?WorkOS.find('content',id):null; }
  function variants(p){
    return (p.targets||[]).map(function(k){ return {platform:k,name:PLAT[k].n,mode:p.mode==='draft'?'draft':'direct'}; });
  }
  /* WorkOS.update logs every write to the activity feed; typing would
     flood it, so edits go straight to the record and save once. */
  function save(p){
    if(!window.WorkOS) return p;
    p.updated=Date.now();
    p.variants=variants(p);
    var row=find(p.id);
    if(!row){ WorkOS.create('content',p,'user'); return p; }
    if(row!==p) Object.keys(p).forEach(function(k){ row[k]=p[k]; });
    try{ WorkOS.save(); }catch(e){}
    return row;
  }
  function remove(p){
    /* a photo reused from the library may belong to another post too */
    var keep={};
    all().forEach(function(o){ if(o.id!==p.id) (o.media||[]).forEach(function(m){ keep[m.blob]=1; }); });
    (p.media||[]).forEach(function(m){ if(m.blob&&!keep[m.blob]) KovaBlobs.del(m.blob); });
    if(window.WorkOS) WorkOS.remove('content',p.id,'user');
  }
  function duplicate(p){
    var c=JSON.parse(JSON.stringify(p));
    c.id=uid('post'); c.created=c.updated=Date.now(); c.status='draft'; c.results={}; c.server=null;
    c.title=(p.title||'Untitled post')+' copy'; c.when=0; c.mode='now';
    c.media.forEach(function(m){ delete m.path; delete m.url; delete m.prep; });
    return c;
  }
  /* media from earlier posts that still has its bytes on this device */
  function library(except){
    var seen={}, out=[];
    all().forEach(function(p){
      if(except&&p.id===except.id) return;
      (p.media||[]).forEach(function(m){
        if(!m.blob||seen[m.blob]) return; seen[m.blob]=1;
        out.push({from:p.id,item:m});
      });
    });
    return out;
  }

  /* ---- reading a file ------------------------------------------------ */
  function probe(file){
    var kind=/^video\//.test(file.type)?'video':(/^image\//.test(file.type)?'image':'');
    if(!kind) return Promise.reject(new Error(file.name+' is not a photo or video.'));
    var item={id:uid('m'),name:file.name||(kind+'.'+(kind==='video'?'mp4':'jpg')),kind:kind,mime:file.type,
              bytes:file.size,w:0,h:0,dur:0,thumb:'',blob:uid('b'),on:true};
    var url=URL.createObjectURL(file);
    function thumbFrom(src,w,h){
      try{
        var s=Math.min(1,220/Math.max(w,h)), c=document.createElement('canvas');
        c.width=Math.max(1,Math.round(w*s)); c.height=Math.max(1,Math.round(h*s));
        c.getContext('2d').drawImage(src,0,0,c.width,c.height);
        return c.toDataURL('image/jpeg',.72);
      }catch(e){ return ''; }
    }
    var done=new Promise(function(res){
      if(kind==='image'){
        var im=new Image();
        im.onload=function(){ item.w=im.naturalWidth; item.h=im.naturalHeight; item.thumb=thumbFrom(im,item.w,item.h); res(); };
        im.onerror=function(){ res(); };
        im.src=url;
      }else{
        var v=document.createElement('video'), settled=false;
        v.muted=true; v.playsInline=true; v.preload='metadata';
        var fin=function(){ if(settled) return; settled=true; res(); };
        /* a clip recorded in a browser (WebM) often says its length is
           "infinite" until it is read to the end: seek far, then ask again */
        var fixing=false;
        var meta=function(){
          var d=isFinite(v.duration)?v.duration:0;
          item.dur=Math.round(d*10)/10; item.w=v.videoWidth; item.h=v.videoHeight;
          item.sound=soundOf(v);
          try{ v.currentTime=Math.min(0.5,(d||1)/3); }catch(e){ fin(); }
        };
        v.onloadedmetadata=function(){
          if(isFinite(v.duration)) return meta();
          fixing=true;
          v.ontimeupdate=function(){ if(!isFinite(v.duration)) return; v.ontimeupdate=null; fixing=false; meta(); };
          try{ v.currentTime=1e101; }catch(e){ fixing=false; meta(); }
        };
        v.onseeked=function(){
          if(fixing) return;
          item.thumb=thumbFrom(v,item.w||320,item.h||180);
          /* Chrome only knows once it decodes some audio: play a moment, muted */
          if(item.sound!=null||typeof v.webkitAudioDecodedByteCount!=='number'||!v.play) return fin();
          var pr; try{ pr=v.play(); }catch(e){ return fin(); }
          if(!pr||!pr.then) return fin();
          pr.then(function(){ setTimeout(function(){ item.sound=v.webkitAudioDecodedByteCount>0; try{ v.pause(); }catch(e){} fin(); },450); },fin);
        };
        v.onerror=fin; setTimeout(fin,4000);
        v.src=url;
      }
    });
    return done.then(function(){ URL.revokeObjectURL(url); return KovaBlobs.put(item.blob,file); }).then(function(){ return item; });
  }

  /* does the file carry a sound track? null when the browser cannot say */
  function soundOf(v){
    if(v.audioTracks&&typeof v.audioTracks.length==='number') return v.audioTracks.length>0;     /* Safari */
    if(typeof v.mozHasAudio==='boolean') return v.mozHasAudio;                                   /* Firefox */
    return null;
  }

  /* ---- getting a photo ready for the platforms ----------------------
     Cropped to the chosen shape, at most 2160 px on the long side, JPEG
     (Instagram refuses anything else). The heading can be set onto the
     cover as text. Videos go up untouched - re-encoding one in a browser
     is not something to do quietly. */
  var RATIO={'1:1':1,'4:5':4/5,'9:16':9/16,'16:9':16/9};
  function loadImg(blob){
    return new Promise(function(res,rej){
      var u=URL.createObjectURL(blob), im=new Image();
      im.onload=function(){ URL.revokeObjectURL(u); res(im); };
      im.onerror=function(){ URL.revokeObjectURL(u); rej(new Error('Could not read that photo.')); };
      im.src=u;
    });
  }
  function wrapLines(ctx,text,max,lines){
    var words=String(text).split(/\s+/), out=[], cur='';
    words.forEach(function(w){
      var t=cur?cur+' '+w:w;
      if(ctx.measureText(t).width>max&&cur){ out.push(cur); cur=w; } else cur=t;
    });
    if(cur) out.push(cur);
    if(out.length>lines){ out=out.slice(0,lines); out[lines-1]=out[lines-1].replace(/\s*\S*$/,'')+'…'; }
    return out;
  }
  function prepareImage(blob,aspect,cover,small){
    return loadImg(blob).then(function(im){
      var sw=im.naturalWidth, sh=im.naturalHeight, sx=0, sy=0;
      var r=RATIO[aspect];
      if(r){
        if(sw/sh>r){ var nw=Math.round(sh*r); sx=Math.round((sw-nw)/2); sw=nw; }
        else { var nh=Math.round(sw/r); sy=Math.round((sh-nh)/2); sh=nh; }
      }
      var s=Math.min(1,2160/Math.max(sw,sh));
      var c=document.createElement('canvas');
      c.width=Math.round(sw*s); c.height=Math.round(sh*s);
      var x=c.getContext('2d');
      x.drawImage(im,sx,sy,sw,sh,0,0,c.width,c.height);
      var ready=Promise.resolve();
      if(cover){
        ready=(document.fonts&&document.fonts.load?document.fonts.load('600 64px Urbanist'):Promise.resolve()).catch(function(){}).then(function(){
          var W=c.width, H=c.height, pad=Math.round(W*.07), fs=Math.round(W*.072);
          var g=x.createLinearGradient(0,H*.45,0,H);
          g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,.62)');
          x.fillStyle=g; x.fillRect(0,H*.45,W,H*.55);
          x.font='600 '+fs+'px Urbanist, Outfit, sans-serif';
          x.fillStyle='#FFFFFF'; x.textBaseline='alphabetic';
          x.shadowColor='rgba(0,0,0,.35)'; x.shadowBlur=Math.round(fs*.4);
          var L=wrapLines(x,cover,W-pad*2,3);
          L.forEach(function(line,i){ x.fillText(line,pad,H-pad-(L.length-1-i)*fs*1.12); });
        });
      }
      /* Bluesky refuses photos over 1 MB, so a post going there steps the
         quality down until it fits; everywhere else gets 0.9 */
      function enc(q){
        return new Promise(function(res,rej){
          c.toBlob(function(b){ b?res(b):rej(new Error('Could not prepare that photo.')); },'image/jpeg',q);
        });
      }
      function fit(q){
        return enc(q).then(function(b){ return (!small||b.size<=950000||q<=.45)?b:fit(Math.round((q-.1)*100)/100); });
      }
      return ready.then(function(){ return fit(small?.86:.9); });
    });
  }

  /* ---- the server ------------------------------------------------------ */
  function api(path,opts){
    if(!window.KovaLink||!KovaLink.authFetch) return Promise.reject(new Error('The Kova server is not available.'));
    return KovaLink.authFetch(path,opts).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok){
          var e=new Error(j.error||('The Kova server answered '+r.status+'.'));
          e.status=r.status; throw e;
        }
        return j;
      });
    }, function(e){
      if(e&&/no-backend/.test(e.message)) throw new Error('Kova cannot reach its server from here.');
      if(e&&/admin-restricted|operation-not-allowed/.test(e.code||e.message||'')){
        var x=new Error('Sign in to publish. Guest accounts are switched off for this app.'); x.signin=true; throw x;
      }
      throw e;
    });
  }

  function small(post){ return (post.targets||[]).indexOf('bluesky')>=0; }
  function prepKey(post,i,m){ return m.kind==='video'?'v':[post.aspect,(i===0&&post.coverText)?clean(post.heading):'',small(post)?'s':''].join('|'); }

  /* upload what is not up yet (or whose crop/cover changed since) */
  function upload(post,onProgress){
    var list=postMedia(post);
    var total=list.length, n=0;
    if(!total) return Promise.resolve([]);
    if(!window.KovaMedia) return Promise.reject(new Error('Uploads are not available here.'));
    return KovaLink.ensureUser().then(function(){
      var chain=Promise.resolve();
      list.forEach(function(m,i){
        chain=chain.then(function(){
          var key=prepKey(post,i,m);
          if(m.path&&m.prep===key) { n++; return; }
          return KovaBlobs.get(m.blob).then(function(blob){
            if(!blob) throw new Error(m.name+' is not on this device any more. Add it again.');
            var job=m.kind==='image'?prepareImage(blob,post.aspect,(i===0&&post.coverText)?clean(post.heading):'',small(post)):Promise.resolve(blob);
            return job.then(function(b){
              var ext=m.kind==='image'?'jpg':((m.mime||'').indexOf('quicktime')>=0?'mov':'mp4');
              return KovaMedia.upload('post',b,post.id+'_'+i+'.'+ext,function(f){
                if(onProgress) onProgress((n+f)/total, m);
              }).then(function(res){
                m.path=res.path; m.url=res.url; m.prep=key; m.upMime=b.type||m.mime; m.upBytes=b.size; n++;
              });
            });
          });
        });
      });
      return chain.then(function(){ return list; });
    }, function(e){
      if(e&&/admin-restricted|operation-not-allowed/.test(e.code||e.message||'')){
        var x=new Error('Sign in to publish. Guest accounts are switched off for this app.'); x.signin=true; throw x;
      }
      throw e;
    });
  }

  function payload(post,mode,list,only){
    var text={};
    ORDER.forEach(function(k){ text[k]=compose(post,k); });
    return {post:{
      id:post.id, title:cut(post.title,120), format:post.format, targets:(only||post.targets).slice(),
      media:list.map(function(m){ return {path:m.path,type:m.kind,mime:m.upMime||m.mime,bytes:m.upBytes||m.bytes,w:m.w,h:m.h,dur:m.dur,name:m.name}; }),
      text:{youtube:{title:text.youtube.title,description:text.youtube.description,tags:text.youtube.tags},
            instagram:{caption:text.instagram.caption},tiktok:{caption:text.tiktok.caption},
            linkedin:{text:text.linkedin.text,title:text.linkedin.title},x:{text:text.x.text},
            facebook:{text:text.facebook.text,title:text.facebook.title},
            metaads:{primary:text.metaads.primary,headline:text.metaads.headline,description:text.metaads.description},threads:{text:text.threads.text},
            pinterest:{title:text.pinterest.title,description:text.pinterest.description,link:text.pinterest.link},
            bluesky:{text:text.bluesky.text},reddit:{title:text.reddit.title,text:text.reddit.text},
            tumblr:{text:text.tumblr.text,tags:text.tumblr.tags},mastodon:{text:text.mastodon.text},
            discord:{text:text.discord.text},telegram:{text:text.telegram.text},gbusiness:{text:text.gbusiness.text}},
      options:{youtube:{privacy:(post.opts.youtube||{}).privacy||'public',short:place(post,'youtube')==='short'},
               tiktok:{mode:place(post,'tiktok')||'direct'},
               instagram:{place:place(post,'instagram')||'post'},facebook:{place:place(post,'facebook')||'post'},
               reddit:{subreddit:post.subreddit||''},
               metaads:Object.assign(adOpts(post),{link:post.link||''})},
      draft:mode==='draft', when:mode==='schedule'?post.when:0
    }};
  }

  var LOCAL={queued:'publishing',publishing:'publishing',scheduled:'scheduled',done:'sent',partial:'partial',failed:'failed',cancelled:'draft'};
  function absorb(post,s){
    if(!s) return post;
    /* what you post by hand is only known here */
    var mine={};
    (post.targets||[]).forEach(function(k){ var r=(post.results||{})[k]; if(r&&(r.state==='manual'||r.by==='you')) mine[k]=r; });
    post.server=s; post.results=Object.assign({},s.results||{},mine);
    post.status=LOCAL[s.state]||post.status;
    if(s.state==='done'&&s.draft) post.status='drafted';
    return post;
  }

  /* one post: check -> upload -> hand to the server */
  function publish(post,mode,onProgress){
    var bad=[];
    post.targets.forEach(function(k){ var c=check(post,k,linkState(k)); if(!c.ok) bad.push(PLAT[k].n+': '+c.problems[0]); });
    if(!post.targets.length) return Promise.reject(new Error('Pick at least one account.'));
    if(bad.length) return Promise.reject(new Error(bad[0]));
    if(mode==='schedule'&&!(post.when>Date.now()+60e3)) return Promise.reject(new Error('Pick a time at least a minute from now.'));
    /* accounts you post to yourself are handed over now; the rest go to the server */
    var hand=post.targets.filter(function(k){ return linkState(k)==='manual'; });
    var srv=post.targets.filter(function(k){ return hand.indexOf(k)<0; });
    post.results=post.results||{};
    hand.forEach(function(k){ var r=post.results[k]; if(!(r&&r.state==='ok')) post.results[k]={state:'manual',at:Date.now(),msg:'Ready for you to post.'}; });
    if(!srv.length){ settle(post); save(post); return Promise.resolve(post); }
    post.status='uploading'; save(post);
    return upload(post,onProgress).then(function(list){
      return api('/publish',{json:payload(post,mode,list,srv)});
    }).then(function(s){ absorb(post,s); save(post); return post; }, function(e){
      post.status=(post.results&&Object.keys(post.results).length)?'partial':'draft'; save(post); throw e;
    });
  }
  /* sent once every account has it */
  function settle(post){
    var done=(post.targets||[]).every(function(k){ var r=(post.results||{})[k]; return r&&['ok','draft','skipped'].indexOf(r.state)>=0; });
    if(done&&post.targets.length) post.status='sent';
    return post;
  }
  function markPosted(post,k){
    post.results=post.results||{};
    post.results[k]={state:'ok',by:'you',at:Date.now(),msg:'Posted by you.'};
    settle(post); save(post); return post;
  }
  function adSetup(choice){ return api('/ads/setup',choice?{json:choice}:undefined); }
  /* hashtag ideas: the model groups them broad / mid / niche / brand and
     gives each a rough size band - never a live count, which no platform
     shares with apps */
  function hashtags(post){
    return api('/hashtags',{json:{platforms:post.targets,heading:post.heading,body:post.body,caption:post.caption,tags:post.tags,
      format:post.format,media:included(post).map(function(m){ return {type:m.kind,name:m.name}; })}}).then(function(j){ return j.tags||[]; });
  }
  function refresh(post){ return api('/posts/'+encodeURIComponent(post.id)).then(function(s){ absorb(post,s); save(post); return post; }); }
  function cancel(post){ return api('/posts/'+encodeURIComponent(post.id)+'/cancel',{json:{}}).then(function(s){ absorb(post,s); post.status='draft'; save(post); return post; }); }
  function syncAll(){
    return api('/posts').then(function(j){
      (j.posts||[]).forEach(function(s){ var p=find(s.id); if(p&&p.kind==='post'){ absorb(p,s); save(p); } });
      return j.posts||[];
    });
  }
  function write(post,field,instruction){
    return api('/write',{json:{field:field,instruction:instruction||'',platforms:post.targets,format:post.format,
      heading:post.heading,body:post.body,caption:post.caption,tags:post.tags,
      media:included(post).map(function(m){ return {type:m.kind,name:m.name}; })}}).then(function(j){ return j.text||''; });
  }

  return {PLAT:PLAT,ORDER:ORDER,GROUPS:GROUPS,KIND:KIND,FORMATS:FORMATS,FORMAT_N:FORMAT_N,ASPECTS:ASPECTS,ASPECT_N:ASPECT_N,FIELDS:FIELDS,
          blank:blank,included:included,postMedia:postMedia,naturalFormat:naturalFormat,compose:compose,check:check,
          linkState:linkState,label:label,all:all,find:find,save:save,remove:remove,duplicate:duplicate,library:library,
          probe:probe,prepareImage:prepareImage,upload:upload,payload:payload,publish:publish,refresh:refresh,
          cancel:cancel,syncAll:syncAll,write:write,absorb:absorb,xLength:xLength,tagList:tagList,chars:chars,uid:uid,
          PLACES:PLACES,place:place,setPlace:setPlace,placeName:placeName,
          ACCT:ACCT,HAND:HAND,acct:acct,setAcct:setAcct,byHand:byHand,setHand:setHand,markPosted:markPosted,settle:settle,
          AD_DEF:AD_DEF,AD_GOAL:AD_GOAL,AD_CTA:AD_CTA,AD_EVENT:AD_EVENT,adOpts:adOpts,adSetup:adSetup,hashtags:hashtags,shapeOf:shapeOf,soundOf:soundOf};
})();
