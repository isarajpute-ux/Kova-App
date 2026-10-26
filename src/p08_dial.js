/* KovaDial: the picker for Exercises, Stretch and the attachment picker.

   p43-p43e it was a radial dial after a Ron Design Lab reference. On
   2026-10-25 the owner said it "looks nothing like" the reference and asked
   for it to be deleted ("I'll find another diagram... for you to copy").
   Until that reference comes, it is a plain row of glass tabs (one per
   muscle, body part or area; the chosen one solid), with the page's own
   action as a button at the end of the row. The API is unchanged, so the
   pages did not change: the card under it still shows what was picked.

   KovaDial.mount(el, {items:[{id,label,icon}], sel, onPick(i,item),
     centre:{icon:'play'|'swap', label, short, onTap}}) -> {set, swap, pop, sel}
   centre.short is the button's word (a string or a function); with no
   short, a swap centre stays hidden (Exercises has its own switch) and a
   play centre says "Start". KovaDial.mus(group) gives a body-part icon. */
window.KovaDial=(function(){
  'use strict';
  var N=0;
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  /* ---------- icons ---------- */
  /* p43c: hand-drawn body-part icons (the owner: the old ones, cut from the body map, did not read): a leg in profile lit at the front (quads), back (hamstrings) or calf, glutes, a chest, a back with lats, shoulders, a flexed arm, abs, a pull-up */
  var MI={"all":"<rect x=\"4\" y=\"4\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"13\" y=\"4\" width=\"7\" height=\"7\" rx=\"2\"/><rect x=\"4\" y=\"13\" width=\"7\" height=\"7\" rx=\"2\"/><rect class=\"f\" x=\"13\" y=\"13\" width=\"7\" height=\"7\" rx=\"2\"/>","Quads":"<path d=\"M6.2 2.2h4.2c.6 3.2.6 6.4 1.8 9.6.4 1 .4 2-.2 3l-1 4.8 5.2 1.4c1 .3 1.4 1.4.4 1.8H8.8c-.6 0-1-.5-.9-1l.3-2.2c-1.4-1.6-2.2-3.6-1.4-5.8l.4-1.4C5.8 9.6 5.2 6.2 6.2 2.2Z\"/><path class=\"f\" d=\"M10.2 3.4c.6 2.8.8 5.6 1.8 8.2-1.6-.4-2.6-1.8-3-3.6-.4-1.8.2-3.4 1.2-4.6Z\"/>","Glutes":"<path d=\"M3.8 6.6c1.6-1.6 4.6-2.6 8.2-2.6s6.6 1 8.2 2.6\"/><path d=\"M3.8 6.6c-.8 3.4-.8 7 .6 10.2M20.2 6.6c.8 3.4.8 7-.6 10.2\"/><path class=\"f\" d=\"M12 9.2c-1.4-1.8-3.4-2.4-5.4-1.6C4.2 8.6 3.4 11.6 4.6 14.6c1.2 3 4.2 4.4 7.4 3.4ZM12 9.2c1.4-1.8 3.4-2.4 5.4-1.6 2.4 1 3.2 4 2 7-1.2 3-4.2 4.4-7.4 3.4Z\"/><path d=\"M12 8.6v10.2\"/><path d=\"M6.4 19.6c1.6 1.2 3.6 1.4 5.6.6M17.6 19.6c-1.6 1.2-3.6 1.4-5.6.6\"/>","Hamstrings":"<path d=\"M6.2 2.2h4.2c.6 3.2.6 6.4 1.8 9.6.4 1 .4 2-.2 3l-1 4.8 5.2 1.4c1 .3 1.4 1.4.4 1.8H8.8c-.6 0-1-.5-.9-1l.3-2.2c-1.4-1.6-2.2-3.6-1.4-5.8l.4-1.4C5.8 9.6 5.2 6.2 6.2 2.2Z\"/><path class=\"f\" d=\"M6.6 3.2c-.8 3-.4 5.8 1.2 8.2 1-1.6 1.2-3.6.8-5.6-.2-1.2-.9-2.2-2-2.6Z\"/>","Chest":"<path d=\"M3.4 6.6C6 4.8 9 4.4 12 5.4c3-1 6-.6 8.6 1.2\"/><path d=\"M3.4 6.6c-.6 4 0 8.4 1.6 12.4M20.6 6.6c.6 4 0 8.4-1.6 12.4\"/><path class=\"f\" d=\"M11.6 6.4c-2.6-.9-5.4-.4-7 .9-.6 2.6 0 5.4 1.8 6.8 2 1.6 4.4 1.4 5.2-.4ZM12.4 6.4c2.6-.9 5.4-.4 7 .9.6 2.6 0 5.4-1.8 6.8-2 1.6-4.4 1.4-5.2-.4Z\"/><path d=\"M12 6v8.2\"/>","Back":"<path d=\"M4.6 4.6h14.8\"/><path d=\"M4.6 4.6c-.8 2.6-.4 5 1.2 7.4l1.8 8.4h8.8l1.8-8.4c1.6-2.4 2-4.8 1.2-7.4\"/><path class=\"f\" d=\"M6 6.6c.6 3.6 2.6 7 5.4 9.6l-.2-6.6ZM18 6.6c-.6 3.6-2.6 7-5.4 9.6l.2-6.6Z\"/><path d=\"M8.4 4.6L12 8l3.6-3.4\"/><path d=\"M12 6.8v13.4\" stroke-width=\".9\"/>","Shoulders":"<circle cx=\"12\" cy=\"4.2\" r=\"2.4\"/><path d=\"M8 9.6c1.2-1 2.6-1.6 4-1.6s2.8.6 4 1.6\"/><path class=\"f\" d=\"M7.6 9.4C4.8 9.4 3 11.8 3.2 15.2l.4 3.4h3.4c.8-2.6 1.4-5.6.6-9.2ZM16.4 9.4c2.8 0 4.6 2.4 4.4 5.8l-.4 3.4H17c-.8-2.6-1.4-5.6-.6-9.2Z\"/><path d=\"M7.6 9.4C4.8 9.4 3 11.8 3.2 15.2l.4 3.4h3.4M16.4 9.4c2.8 0 4.6 2.4 4.4 5.8l-.4 3.4H17M8 9.6l-.4 11.6M16 9.6l.4 11.6\"/>","Arms":"<path d=\"M4.4 20.4h7.4c4.8 0 8.4-2.8 8.4-6.6 0-3.4-2.6-5.6-5.6-5.2-1.6.2-2.8 1.2-3.2 2.4\"/><path d=\"M11.4 11c-.6-1.4-2-2.2-3.6-2l-.6-3.6c1-.4 1.6-1.4 1.4-2.4-.2-1.2-1.4-2-2.6-1.6l-1.8.6c-1.2.4-1.8 1.6-1.4 2.8l2 6.6-.4 9\"/><path class=\"f\" d=\"M11.6 11.4c1-1.8 3.4-2.4 5.4-1.4 2 1.2 2.4 3.8 1 5.6-1.6 2-4.6 2.2-6.4.6Z\"/>","Core":"<path d=\"M6.6 3h10.8c.8 4.8.6 12.2-1.2 18H7.8C6 15.2 5.8 7.8 6.6 3Z\"/><path class=\"f\" d=\"M8.4 5.4h3v3h-3zM12.6 5.4h3v3h-3zM8.4 9.6h3v3h-3zM12.6 9.6h3v3h-3zM8.8 13.8h2.6v3.2H8.8zM12.6 13.8h2.6v3.2h-2.6z\"/><path d=\"M12 4v15.6\" stroke-width=\".9\"/>","Calves":"<path d=\"M6.2 2.2h4.2c.6 3.2.6 6.4 1.8 9.6.4 1 .4 2-.2 3l-1 4.8 5.2 1.4c1 .3 1.4 1.4.4 1.8H8.8c-.6 0-1-.5-.9-1l.3-2.2c-1.4-1.6-2.2-3.6-1.4-5.8l.4-1.4C5.8 9.6 5.2 6.2 6.2 2.2Z\"/><path class=\"f\" d=\"M8 13c-1.2 1.6-1 3.8.6 5.4.8-1.6.9-3.4.2-5Z\"/>","skill":"<path class=\"w\" d=\"M3 3.4h18\"/><path d=\"M8.8 3.6l2 5.4M15.2 3.6l-2 5.4\"/><circle class=\"f\" cx=\"12\" cy=\"10.6\" r=\"2.2\"/><path d=\"M12 12.8v5.6M12 18.4l-2.4 3.6M12 18.4l2.4 3.6M9.8 13.4l2.2.8 2.2-.8\"/>"};
  var ALIAS={Legs:'Quads',Upper:'Chest'};
  function mus(g){
    var k=g==='all'?'all':ALIAS[g]||g, svg=MI[k];
    if(!svg) return sprite('body-scan');
    return '<svg class="kdl-ic kdl-mi" viewBox="0 0 24 24" aria-hidden="true">'+svg+'</svg>';
  }
  function sprite(id){ return '<svg class="kdl-ic" aria-hidden="true"><use href="#i-'+id+'"/></svg>'; }
  /* a drawing in a 48 x 28 box (the attachments' own drawings) */
  function art(inner){ return '<svg class="kdl-ic kdl-art" viewBox="0 0 48 28" aria-hidden="true">'+inner+'</svg>'; }

  /* ---------- the row ---------- */
  var PLAY='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
  var SWAP='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>';
  function html(o){
    o=o||{}; var id='kdl'+(++N);
    return '<div class="kdl kdl-row" id="'+id+'" role="radiogroup" aria-label="'+esc(o.label||'Choose')+'">'
      +'<div class="kdl-ls"></div>'
      +'<button type="button" class="kdl-c" hidden aria-label="'+esc(o.centre&&o.centre.label||'')+'"></button></div>';
  }
  function mount(el,o){
    if(!el) return null;
    if(typeof el==='string') el=document.getElementById(el);
    if(!el||!el.querySelector) return null;
    o=o||{};
    var ls=el.querySelector('.kdl-ls'), cb=el.querySelector('.kdl-c');
    var st={items:o.items||[],sel:0};
    function n(){ return Math.max(1,st.items.length); }
    function wrap(i){ var m=n(); return ((Math.round(i)%m)+m)%m; }
    st.sel=wrap(o.sel||0);
    function build(){
      ls.innerHTML=st.items.map(function(it,i){
        return '<button type="button" class="kdl-l" role="radio" data-kdl-i="'+i+'" aria-checked="false" aria-label="'+esc(it.label)+'" tabindex="-1">'+(it.icon||'')+'<span>'+esc(it.label)+'</span></button>';
      }).join('');
      mark();
    }
    function mark(){
      [].forEach.call(ls.children,function(b,i){ var on=i===st.sel; b.classList.toggle('on',on); b.setAttribute('aria-checked',String(on)); b.tabIndex=on?0:-1; });
    }
    function centre(){
      var c=o.centre||{}, w=typeof c.short==='function'?c.short():c.short;
      if(!w&&c.icon==='play') w='Start';
      cb.hidden=!(c.onTap&&w);
      cb.innerHTML=(c.icon==='play'?PLAY:c.icon==='swap'?SWAP:'')+'<span>'+esc(w||'')+'</span>';
      cb.setAttribute('aria-label',c.label||w||'');
    }
    function show(){ var b=ls.children[st.sel]; if(b&&b.scrollIntoView&&ls.scrollWidth>ls.clientWidth) try{ b.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'}); }catch(e){} }
    function set(i,quiet){
      i=wrap(i); var was=st.sel; st.sel=i; mark(); show();
      if(i!==was&&!quiet&&o.onPick) try{ o.onPick(i,st.items[i]); }catch(e){}
    }
    function swap(items,sel,c){ st.items=items||[]; st.sel=wrap(sel||0); if(c) o.centre=c; build(); centre(); }
    function pop(dir,done){ if(done) done(); }
    el.addEventListener('click',function(ev){
      var b=ev.target.closest&&ev.target.closest('.kdl-l'); if(b&&el.contains(b)){ ev.preventDefault(); set(+b.getAttribute('data-kdl-i')); return; }
      if(ev.target.closest&&ev.target.closest('.kdl-c')){ ev.preventDefault(); var c=o.centre||{}; if(c.onTap) c.onTap(); centre(); }
    });
    el.addEventListener('keydown',function(ev){
      var k=ev.key;
      if(k==='ArrowRight'||k==='ArrowDown'){ ev.preventDefault(); set(st.sel+1); var b=ls.querySelector('.kdl-l.on'); if(b) b.focus({preventScroll:true}); }
      else if(k==='ArrowLeft'||k==='ArrowUp'){ ev.preventDefault(); set(st.sel-1); var b2=ls.querySelector('.kdl-l.on'); if(b2) b2.focus({preventScroll:true}); }
    });
    build(); centre(); setTimeout(show,0);
    var api={set:set,swap:swap,pop:pop,sel:function(){ return st.sel; },items:function(){ return st.items; },_st:st,el:el};
    el.__kdl=api;
    return api;
  }
  /* the expand / collapse arrows for a card's top right */
  var EXPAND='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-6.5 6.5M10 20H4v-6M4 20l6.5-6.5"/></svg>';
  var SHRINK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4l-6 6M14 4.5V10h5.5M4 20l6-6M10 19.5V14H4.5"/></svg>';
  function arrows(open){ return open?SHRINK:EXPAND; }
  return {html:html,mount:mount,mus:mus,sprite:sprite,art:art,arrows:arrows,MI:MI};
})();
