/* =====================================================================
   KovaBrand - the platforms in their own colours (p13).

   Wherever the Studio and Work OS show where a post goes, each platform
   is its real mark: Instagram's gradient, YouTube's red, TikTok's cyan and
   red offset, LinkedIn's blue, and so on, drawn as a small rounded tile.
   chip() wraps a logo in a round glass button with a count badge, like a
   task tray: "Instagram, 3 posts in progress".
   The glyph shapes are the Studio's own (KovaCanvas icons), so a mark looks
   the same here as everywhere else in Kova.
   ===================================================================== */
window.KovaBrand=(function(){
  'use strict';
  var uid=0;
  /* bg: tile colour or gradient; ink: glyph colour; fill: glyph is solid */
  var B={
    instagram:{bg:'ig',ink:'#fff'},
    youtube:{bg:'#FF0033',ink:'#fff',custom:'yt'},
    tiktok:{bg:'#010101',ink:'#fff',custom:'tt'},
    linkedin:{bg:'#0A66C2',ink:'#fff',custom:'li'},
    x:{bg:'#000000',ink:'#fff',fill:true},
    facebook:{bg:'#0866FF',ink:'#fff',custom:'fb'},
    metaads:{bg:'#0866FF',ink:'#fff'},
    threads:{bg:'#000000',ink:'#fff'},
    pinterest:{bg:'#E60023',ink:'#fff'},
    bluesky:{bg:'#1185FE',ink:'#fff',fill:true},
    reddit:{bg:'#FF4500',ink:'#fff'},
    tumblr:{bg:'#001935',ink:'#fff',fill:true},
    mastodon:{bg:'#6364FF',ink:'#fff'},
    discord:{bg:'#5865F2',ink:'#fff'},
    telegram:{bg:'#229ED9',ink:'#fff'},
    gbusiness:{bg:'#FFFFFF',ink:'#1A73E8'}
  };
  var NAME={instagram:'Instagram',youtube:'YouTube',tiktok:'TikTok',linkedin:'LinkedIn',x:'X',facebook:'Facebook',metaads:'Meta Ads',threads:'Threads',
    pinterest:'Pinterest',bluesky:'Bluesky',reddit:'Reddit',tumblr:'Tumblr',mastodon:'Mastodon',discord:'Discord',telegram:'Telegram',gbusiness:'Google Business'};
  var GLYPH={x:'xlogo'};
  function glyph(k){ var I=(window.KovaCanvas&&KovaCanvas.icons)||{}; return I[GLYPH[k]||k]||''; }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  /* the mark on its tile, as an inline SVG of the given size */
  function logo(k,size){
    var b=B[k]; if(!b) return '';
    size=size||24; var id='kb'+(++uid), defs='', bg=b.bg, inner='';
    if(bg==='ig'){ defs='<radialGradient id="'+id+'" cx="30%" cy="107%" r="150%"><stop offset="0" stop-color="#FDF497"/><stop offset=".05" stop-color="#FDF497"/><stop offset=".45" stop-color="#FD5949"/><stop offset=".6" stop-color="#D6249F"/><stop offset=".9" stop-color="#285AEB"/></radialGradient>'; bg='url(#'+id+')'; }
    var tile='<rect width="24" height="24" rx="6.5" fill="'+bg+'"/>';
    if(b.custom==='yt') inner='<path d="M7.6 8.3l8.7 3.7-8.7 3.7z" fill="#fff"/>';
    else if(b.custom==='tt'){
      /* the note three times: cyan up-left, red down-right, white on top */
      var note=glyph('tiktok'), pass=function(col,d){ return '<g fill="none" stroke="'+col+'" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" transform="translate('+d+' '+d+') scale(.8)">'+note+'</g>'; };
      inner=pass('#25F4EE',1.9)+pass('#FE2C55',2.9)+pass('#fff',2.4);
    }
    else if(b.custom==='li') inner='<path d="M7.6 10.4v6.4M7.6 7.3v.1M11.4 16.8v-3.6a2.3 2.3 0 0 1 4.6 0v3.6M11.4 10.4v6.4" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/>';
    else if(b.custom==='fb') inner='<path d="M13.4 21v-7.1h2.4l.4-2.8h-2.8V9.4c0-.8.3-1.4 1.4-1.4h1.5V5.5a19 19 0 0 0-2.2-.1c-2.2 0-3.7 1.3-3.7 3.8v1.9H8v2.8h2.4V21z" fill="#fff"/>';
    else inner='<g transform="translate(3.6 3.6) scale(.7)" '+(b.fill?'fill="'+b.ink+'" stroke="none"':'fill="none" stroke="'+b.ink+'" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"')+' color="'+b.ink+'">'+glyph(k)+'</g>';
    if(k==='gbusiness') tile='<rect width="24" height="24" rx="6.5" fill="#fff"/><rect x=".5" y=".5" width="23" height="23" rx="6" fill="none" stroke="rgba(0,0,0,.12)"/>';
    return '<svg class="kb-logo" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" aria-hidden="true">'+(defs?'<defs>'+defs+'</defs>':'')+tile+inner+'</svg>';
  }
  /* a round glass button holding the mark, with a count badge */
  function chip(k,count,o){
    o=o||{};
    var n=+count||0, label=NAME[k]+(o.label?': '+o.label:'');
    return '<button class="kb-chip'+(o.on?' on':'')+(o.cls?' '+o.cls:'')+'"'+(o.attrs||'')+' aria-label="'+esc(label)+'"'+(o.on!=null?' aria-pressed="'+!!o.on+'"':'')+'>'
      +logo(k,o.size||22)+(n?'<span class="kb-badge" aria-hidden="true">'+(n>99?'99+':n)+'</span>':'')+'</button>';
  }
  return {logo:logo,chip:chip,name:function(k){ return NAME[k]||k; },has:function(k){ return !!B[k]; }};
})();
