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
  /* p42 (the owner: "any attachment that's known in any gym... V-bar, straight
     bar, curved bar, the bar that looks like a bicycle, anything for back,
     legs, arms, the weighted belt"): every common one, drawn, with what it is
     for. [name, kind, body areas, what it is for, drawing] */
  var CAT=[
    ['Rope','Cable handles',['Arms','Shoulders','Back'],'Pushdowns, face pulls','<circle cx="24" cy="3.4" r="2.1"/><path d="M24 5.5v2.6"/><path class="w" d="M24 8.2C21.4 12.6 16.8 16.6 12.8 21M24 8.2C26.6 12.6 31.2 16.6 35.2 21"/><path d="M22.2 10.9l1.3.6M20.3 13.1l1.3.6M18.1 15.2l1.3.6M15.8 17.3l1.3.6M26.5 10.9l-1.3.6M28.4 13.1l-1.3.6M30.6 15.2l-1.3.6M32.9 17.3l-1.3.6" stroke-width=".9"/><rect class="s" x="9.4" y="19.9" width="5.4" height="6.2" rx="2.2" transform="rotate(42 12.1 23)"/><rect class="s" x="33.2" y="19.9" width="5.4" height="6.2" rx="2.2" transform="rotate(-42 35.9 23)"/>'],
    ['Straight bar','Cable handles',['Arms','Back'],'Pushdowns, curls','<circle cx="24" cy="3.4" r="2.1"/><path d="M24 5.5v3.6"/><rect class="f" x="21" y="9.1" width="6" height="3.6" rx="1.3"/><rect x="5" y="12.7" width="38" height="3.2" rx="1.6"/><path d="M9 13.2v2.2M11 13.2v2.2M13 13.2v2.2M15 13.2v2.2M33 13.2v2.2M35 13.2v2.2M37 13.2v2.2M39 13.2v2.2" stroke-width=".8"/><rect class="s" x="2.6" y="11.9" width="3.2" height="4.8" rx="1.2"/><rect class="s" x="42.2" y="11.9" width="3.2" height="4.8" rx="1.2"/>'],
    ['EZ bar','Bars',['Arms'],'The curved bar','<path class="w" d="M11 14h4.2l2.6-3.6 3.1 7.2L24 10.4l3.1 7.2 3.1-7.2 2.6 3.6H37"/><path d="M1.5 14H11M37 14h9.5"/><rect class="f" x="3.4" y="5.5" width="3.6" height="17" rx="1.2"/><rect class="f" x="7.4" y="8" width="2.6" height="12" rx="1"/><rect class="f" x="41" y="5.5" width="3.6" height="17" rx="1.2"/><rect class="f" x="38" y="8" width="2.6" height="12" rx="1"/>'],
    ['V-bar','Cable handles',['Back','Arms'],'Close-grip rows','<circle cx="24" cy="3.4" r="2.1"/><path d="M24 5.5v2.4"/><path class="w" d="M24 8L15 19.2M24 8l9 11.2"/><rect class="s" x="8.6" y="18.4" width="9.6" height="4.6" rx="2.3" transform="rotate(-10 13.4 20.7)"/><rect class="s" x="29.8" y="18.4" width="9.6" height="4.6" rx="2.3" transform="rotate(10 34.6 20.7)"/>'],
    ['Single handle','Cable handles',['Back','Shoulders','Chest','Arms'],'One-arm moves','<circle cx="24" cy="3.2" r="2"/><path d="M24 5.2v1.4"/><path class="w" d="M24 6.6L14.2 18.8M24 6.6l9.8 12.2"/><rect class="f" x="12" y="18.2" width="24" height="6.2" rx="3.1"/><path d="M16.5 21.3h15" stroke-dasharray="1.3 1.7" stroke-width=".9"/>'],
    ['Stirrup handles','Cable handles',['Chest','Shoulders','Arms'],'Crossovers, flyes','<circle cx="12" cy="3.2" r="1.8"/><path class="w" d="M12 5L5.6 15.6M12 5l6.4 10.6"/><rect class="f" x="3.8" y="15.2" width="16.4" height="5.4" rx="2.7"/><circle cx="36" cy="3.2" r="1.8"/><path class="w" d="M36 5l-6.4 10.6M36 5l6.4 10.6"/><rect class="f" x="27.8" y="15.2" width="16.4" height="5.4" rx="2.7"/><path d="M7.5 17.9h9M31.5 17.9h9" stroke-dasharray="1.2 1.6" stroke-width=".8"/>'],
    ['Wide lat bar','Cable handles',['Back'],'Wide pulldowns','<circle cx="24" cy="3" r="1.9"/><path d="M24 4.9v4.3"/><rect class="f" x="21.4" y="9.1" width="5.2" height="3" rx="1.1"/><path class="w" d="M10.5 12.3h27"/><path class="w" d="M10.5 12.3L4 20.5M37.5 12.3L44 20.5"/><path d="M3.3 19.4l3.6-4.6M44.7 19.4l-3.6-4.6" stroke-width="4" stroke-linecap="round" opacity=".55"/>'],
    ['Parallel-grip lat bar','Cable handles',['Back'],'Palms-in pulldowns','<circle cx="24" cy="3" r="1.9"/><path d="M24 4.9v4.4"/><path class="w" d="M4 10.6h40"/><path d="M8.5 10.6v12.6h5.5V10.6M34 10.6v12.6h5.5V10.6"/><rect class="s" x="9.7" y="13" width="3.1" height="8.4" rx="1.5"/><rect class="s" x="35.2" y="13" width="3.1" height="8.4" rx="1.5"/>'],
    ['MAG grip','Cable handles',['Back'],'Rows, pulldowns','<circle cx="24" cy="3" r="1.9"/><path d="M24 4.9v3.6"/><rect class="f" x="9" y="8.5" width="30" height="4" rx="1.6"/><rect class="s" x="11.5" y="12.5" width="5.4" height="11.5" rx="2.5"/><rect class="s" x="31.1" y="12.5" width="5.4" height="11.5" rx="2.5"/><path d="M14.2 14.5v7.5M33.8 14.5v7.5" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>'],
    ['Row handle','Cable handles',['Back'],'Seated rows','<circle cx="24" cy="3" r="1.9"/><path d="M24 4.9v1.4"/><path class="w" d="M24 6.3L14 20.5M24 6.3l10 14.2"/><path d="M19.4 12.8L18 20.5M28.6 12.8L30 20.5"/><rect class="s" x="13.2" y="19.6" width="8" height="5.2" rx="2.6"/><rect class="s" x="26.8" y="19.6" width="8" height="5.2" rx="2.6"/>'],
    ['Ankle strap','Cable handles',['Legs','Glutes'],'Kickbacks','<circle cx="24" cy="2.8" r="1.7"/><path d="M24 4.5v1.2"/><path class="w" d="M20.4 11.2V8.6a3.6 3.6 0 0 1 7.2 0v2.6"/><rect class="f" x="8" y="11" width="32" height="12" rx="6"/><path d="M15 11v12M33 11v12" stroke-dasharray="1.3 1.5" stroke-width=".8"/><rect class="s" x="18" y="13.6" width="12" height="6.8" rx="1.6" opacity=".55"/>'],
    ['Tricep bar','Cable handles',['Arms'],'Pushdowns','<circle cx="24" cy="3" r="1.9"/><path d="M24 4.9v6"/><path class="w" d="M6 8.5Q14 22.5 24 12.6Q34 22.5 42 8.5"/><rect class="s" x="3.4" y="5.6" width="4.4" height="6.4" rx="2" transform="rotate(-30 5.6 8.8)"/><rect class="s" x="40.2" y="5.6" width="4.4" height="6.4" rx="2" transform="rotate(30 42.4 8.8)"/>'],
    ['Olympic barbell','Bars',['Legs','Chest','Back','Shoulders'],'Squat, bench, deadlift','<path d="M.8 14h46.4"/><rect class="f" x="3.4" y="2.6" width="4.2" height="22.8" rx="1.4"/><rect class="f" x="8.2" y="5.4" width="3.2" height="17.2" rx="1.2"/><rect class="s" x="12" y="11.4" width="1.8" height="5.2" rx=".6"/><rect class="f" x="40.4" y="2.6" width="4.2" height="22.8" rx="1.4"/><rect class="f" x="36.6" y="5.4" width="3.2" height="17.2" rx="1.2"/><rect class="s" x="34.2" y="11.4" width="1.8" height="5.2" rx=".6"/><path d="M17 12.9v2.2M19 12.9v2.2M21 12.9v2.2M27 12.9v2.2M29 12.9v2.2M31 12.9v2.2" stroke-width=".8"/>'],
    ['Trap bar','Bars',['Legs','Back'],'Deadlifts','<path class="w" d="M15 5.2h18l6.4 8.8L33 22.8H15L8.6 14Z"/><rect class="s" x="16.6" y="9.6" width="3.4" height="8.8" rx="1.7"/><rect class="s" x="28" y="9.6" width="3.4" height="8.8" rx="1.7"/><path d="M1 14h7.6M39.4 14H47"/><rect class="f" x="2" y="7.6" width="3.4" height="12.8" rx="1.1"/><rect class="f" x="42.6" y="7.6" width="3.4" height="12.8" rx="1.1"/>'],
    ['Safety squat bar','Bars',['Legs'],'Squats, easy shoulders','<path d="M1 11.5h46"/><rect class="f" x="15.5" y="7.4" width="17" height="7.6" rx="3.8"/><path class="w" d="M19.5 14.6Q16.2 19.6 19.6 25.2M28.5 14.6Q31.8 19.6 28.4 25.2"/><rect class="f" x="2.2" y="5" width="3.4" height="13" rx="1.1"/><rect class="f" x="42.4" y="5" width="3.4" height="13" rx="1.1"/>'],
    ['Swiss bar','Bars',['Chest','Shoulders','Arms'],'Palms-in presses','<rect class="w" x="9.2" y="5.6" width="29.6" height="16.8" rx="2.6"/><rect class="s" x="15.6" y="8.6" width="3.2" height="10.8" rx="1.6"/><rect class="s" x="22.4" y="8.6" width="3.2" height="10.8" rx="1.6"/><rect class="s" x="29.2" y="8.6" width="3.2" height="10.8" rx="1.6"/><path d="M1 14h8.2M38.8 14H47"/>'],
    ['Cambered bar','Bars',['Legs','Chest'],'Squats, presses','<path class="w" d="M2 20.5h6.6L12.6 7.4h22.8l4 13.1H46"/><rect class="f" x="3" y="14" width="3.4" height="13" rx="1.1"/><rect class="f" x="41.6" y="14" width="3.4" height="13" rx="1.1"/><rect class="f" x="18" y="4.6" width="12" height="5" rx="2.5"/>'],
    ['Landmine','Bars',['Back','Shoulders','Core'],'Rows, presses','<rect class="f" x="1.6" y="22.6" width="13" height="4" rx="1.2"/><circle cx="8" cy="20.6" r="2.3"/><path class="w" d="M9.9 19.6L35.6 8.4"/><circle class="f" cx="39.4" cy="7.2" r="6"/><circle cx="39.4" cy="7.2" r="1.5"/>'],
    ['Smith machine','Machines',['Legs','Chest','Shoulders'],'Bar on rails','<path class="w" d="M10 1.6v24.8M38 1.6v24.8"/><path d="M6 26.4h8M34 26.4h8"/><path d="M2.5 13h43"/><rect class="s" x="8.2" y="10.4" width="3.6" height="5.6" rx="1"/><rect class="s" x="36.2" y="10.4" width="3.6" height="5.6" rx="1"/><rect class="f" x="3.2" y="7.4" width="3" height="11.4" rx="1"/><rect class="f" x="41.8" y="7.4" width="3" height="11.4" rx="1"/>'],
    ['Dumbbells','Free weights',['Legs','Chest','Back','Shoulders','Arms'],'Presses, rows, curls','<path class="f" d="M4.4 8.2L9 5.6l4.6 2.6v11.6L9 22.4l-4.6-2.6Z"/><path class="f" d="M34.4 8.2L39 5.6l4.6 2.6v11.6L39 22.4l-4.6-2.6Z"/><rect class="s" x="13.6" y="10.6" width="2.6" height="6.8" rx=".8"/><rect class="s" x="31.8" y="10.6" width="2.6" height="6.8" rx=".8"/><path class="w" d="M16.2 14h15.6"/><path d="M19.5 12.8v2.4M22.5 12.8v2.4M25.5 12.8v2.4M28.5 12.8v2.4" stroke-width=".8"/>'],
    ['Kettlebell','Free weights',['Legs','Glutes','Core','Shoulders'],'Swings','<path class="w" d="M17.4 12.6V9.4a6.6 6 0 0 1 13.2 0v3.2"/><path d="M19.8 11.6V9.6a4.2 3.8 0 0 1 8.4 0v2" opacity=".6"/><path class="f" d="M19.6 26.4A10.2 10.2 0 1 1 28.4 26.4Z"/><path d="M18.6 15.6a6.6 6.6 0 0 1 3.6-3.4" stroke-width="1.6" opacity=".8"/>'],
    ['Weight plate','Free weights',['Chest','Core','Shoulders'],'Plate raises','<circle class="f" cx="24" cy="14" r="12.4"/><circle cx="24" cy="14" r="8.2"/><circle class="s" cx="24" cy="14" r="2.2"/><rect class="s" x="21.6" y="3.2" width="4.8" height="2.6" rx="1.3"/><rect class="s" x="21.6" y="3.2" width="4.8" height="2.6" rx="1.3" transform="rotate(120 24 14)"/><rect class="s" x="21.6" y="3.2" width="4.8" height="2.6" rx="1.3" transform="rotate(240 24 14)"/>'],
    ['Medicine ball','Free weights',['Core'],'Slams, throws','<circle class="f" cx="24" cy="14" r="12"/><path d="M12.4 11.6C17.6 14.6 30.4 14.6 35.6 11.6M12.6 17C17.8 19.8 30.2 19.8 35.4 17"/><path d="M19 3.2C16.4 9 16.4 19 19 24.8M29 3.2C31.6 9 31.6 19 29 24.8"/>'],
    ['Dip belt','Belts and gear',['Chest','Arms','Back'],'Weighted dips','<path class="f" d="M4.5 3.4Q24 12.6 43.5 3.4l.4 3.8Q24 16.6 4.1 7.2Z"/><ellipse cx="24" cy="14.2" rx="1.3" ry="1.9"/><ellipse cx="24" cy="17.5" rx=".7" ry="1.9"/><path d="M24 19.4v.8"/><circle class="f" cx="24" cy="23.6" r="4.2"/><circle cx="24" cy="23.6" r="1"/>'],
    ['Weight vest','Belts and gear',['Legs','Chest','Back','Core'],'Extra weight','<path class="f" d="M17.2 2.6L12.4 6.8V25.6h23.2V6.8l-4.8-4.2-3.4 4.6h-6.8Z"/><rect class="s" x="15.4" y="11" width="7.4" height="5.6" rx="1" opacity=".55"/><rect class="s" x="25.2" y="11" width="7.4" height="5.6" rx="1" opacity=".55"/><rect class="s" x="15.4" y="18.2" width="7.4" height="5" rx="1" opacity=".55"/><rect class="s" x="25.2" y="18.2" width="7.4" height="5" rx="1" opacity=".55"/>'],
    ['Belt','Belts and gear',['Legs','Back'],'Heavy lifts','<path class="f" d="M2.6 9.4Q24 5.2 45.4 9.4v9.2Q24 22.8 2.6 18.6Z"/><path d="M4.8 11.4Q24 7.6 43.2 11.4M4.8 16.6Q24 20.4 43.2 16.6" stroke-dasharray="1.3 1.5" stroke-width=".8"/><rect class="w" x="27.4" y="7.4" width="7.4" height="13.2" rx="1.6"/><path d="M31.1 8.8v10.4"/><circle class="s" cx="38.4" cy="14" r="1"/><circle class="s" cx="41.4" cy="14" r="1"/>'],
    ['Straps','Belts and gear',['Back'],'Heavy pulls','<path class="w" d="M2 7.4h44"/><path class="f" d="M12.6 4.4a3.4 3.4 0 1 1 0 6.2l-1.6 15.4h-4.4L8.6 10.2a3.4 3.4 0 0 1 4-5.8Z"/><path class="f" d="M38.6 4.4a3.4 3.4 0 1 0 0 6.2l1.6 15.4h4.4l-2-15.8a3.4 3.4 0 0 0-4-5.8Z"/><path d="M8.2 18.4h4.4M39.2 18.4h4.4" stroke-width=".8" stroke-dasharray="1 1.1"/>'],
    ['Wrist wraps','Belts and gear',['Chest','Shoulders'],'Heavy presses','<circle class="f" cx="13" cy="14" r="9"/><path d="M13 9.6a4.4 4.4 0 1 1-4.4 4.4 2.4 2.4 0 0 1 2.4-2.4 1.6 1.6 0 0 1 1.6 1.6"/><path class="f" d="M13 23h22.6l4.2-3.4h4.4V23"/><path d="M28 23v-3.4h7.6" stroke-dasharray="1 1.2"/><path d="M44.2 19.6c2.4 0 3.2 3.4 0 3.4"/>'],
    ['Knee sleeves','Belts and gear',['Legs'],'Warm knees','<path class="f" d="M13.6 2.4h20.8q-3.6 11.6 0 23.2H13.6q3.6-11.6 0-23.2Z"/><ellipse cx="24" cy="14" rx="4.2" ry="4.8"/><path d="M13.8 5.6h20.4M13.8 22.4h20.4" stroke-dasharray="1.2 1.5" stroke-width=".8"/>'],
    ['Band','Belts and gear',['Legs','Glutes','Back','Arms','Shoulders'],'Pull-up help','<path class="f" fill-rule="evenodd" d="M3.6 14C3.6 8.6 12.6 4.8 24 4.8S44.4 8.6 44.4 14 35.4 23.2 24 23.2 3.6 19.4 3.6 14Zm5 0c0 3.2 6.9 5.4 15.4 5.4S39.4 17.2 39.4 14 32.5 8.6 24 8.6 8.6 10.8 8.6 14Z"/><path d="M14 6.4c3-.8 6.4-1.1 10-1.1" stroke-width="1.6" opacity=".7"/>'],
    ['Chains','Belts and gear',['Legs','Chest'],'Heavier at the top','<rect x="1.4" y="10.6" width="10" height="6.8" rx="3.4"/><rect class="w" x="9" y="12.9" width="9" height="2.2" rx="1.1"/><rect x="15.6" y="10.6" width="10" height="6.8" rx="3.4"/><rect class="w" x="23.2" y="12.9" width="9" height="2.2" rx="1.1"/><rect x="29.8" y="10.6" width="10" height="6.8" rx="3.4"/><rect class="w" x="37.4" y="12.9" width="9" height="2.2" rx="1.1"/>']
  ];
  var AREAS=['Back','Legs','Glutes','Arms','Chest','Shoulders','Core'];
  /* the leg press: where your feet go changes what works (p42). Height matters
     most; width changes less than people think (EMG studies), said plainly. */
  var FEET=[
    ['Feet middle','Quads and glutes','Leg press',[0,0,1]],
    ['Feet high','More glutes, hamstrings','Leg press (feet high)',[0,-1,1]],
    ['Feet low','More quads','Leg press (feet low)',[0,1,1]],
    ['Feet wide','Inner thighs, glutes','Leg press (feet wide)',[1,0,1]],
    ['Feet narrow','Quads','Leg press (feet narrow)',[-1,0,1]],
    ['One leg','Fix a weak side','Single leg press',[0,0,0]]
  ];
  function isLP(n){ return /leg press/i.test(String(n||'')); }
  function catOf(v){ return CAT.filter(function(c){ return c[0].toLowerCase()===String(v||'').toLowerCase(); })[0]||null; }
  function icon(c){ return '<svg class="katt-ic" viewBox="0 0 48 28" aria-hidden="true">'+(c?c[4]:'<path d="M10 14H38"/>')+'</svg>'; }
  /* the plate seen from the front, the two feet on it */
  function plate(f){
    var w=f[0], h=f[1], two=f[2], y=14+h*6, dx=w>0?10:w<0?4:7, ang=w>0?14:0;
    var foot=function(x,flip){ return '<ellipse cx="'+x+'" cy="'+y+'" rx="3" ry="5.5" transform="rotate('+(flip?-ang:ang)+' '+x+' '+y+')"/>'; };
    return '<svg class="katt-ic katt-pl8" viewBox="0 0 48 28" aria-hidden="true"><rect x="10" y="2" width="28" height="24" rx="3"/>'+(two?foot(24-dx,1)+foot(24+dx,0):foot(24,0))+'</svg>';
  }
  /* the picture Kova shows for an exercise: a leg press with your feet where you put them */
  function figure(n){ if(!isLP(n)) return n; var v=get(n), f=FEET.filter(function(x){ return x[0]===v; })[0]; return f?f[2]:n; }
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
    /* the workout list answers every name; one it does not know comes back as "Other" with dumbbells: let the name decide then */
    if(!OPT[e]){ try{ x=k&&k.lib?k.lib(n):null; }catch(err){} if(x&&x.m==='Other') x=null; e=CODE[x&&(x.e||x.eq)]||''; }
    if(OPT[e]) return e;
    if(/cable|pushdown|pulldown|face pull|crossover|fly/i.test(n)) return 'cable';
    if(/machine|leg press|leg curl|leg extension|pec deck|hack squat/i.test(n)) return 'machine';
    if(/dumbbell|\bdb\b|goblet|kettlebell/i.test(n)) return 'dumbbell';
    if(/barbell|\bez\b|skull|close grip bench|deadlift|squat|bench press|\brow\b|curl/i.test(n)) return 'barbell';
    if(/pull.?up|chin.?up|\bdips?\b|push.?up/i.test(n)) return 'bodyweight';
    return 'any';
  }
  function options(n){ return OPT[kind(n)].concat(EXTRA); }
  function label(v,n){ return v?esc(v):(n&&isLP(n)?'+ Feet':'+ Attachment'); }

  /* ---------- the picker ---------- */
  function tile(v,cur,c,sub){ return '<button type="button" class="katt-t'+(v===cur?' on':'')+'" data-katt-v="'+esc(v)+'" aria-pressed="'+(v===cur)+'">'+(c&&c.charAt?c:icon(c))+'<b>'+esc(v)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</button>'; }
  var AREA='';
  function allHtml(cur){
    var L=CAT.filter(function(c){ return !AREA||c[2].indexOf(AREA)>=0; });
    return '<div class="katt-as" role="group" aria-label="Body area">'+['','Back','Legs','Glutes','Arms','Chest','Shoulders','Core'].map(function(a){ return '<button type="button" class="chip'+(AREA===a?' on':'')+'" data-katt-area="'+a+'" aria-pressed="'+(AREA===a)+'">'+(a||'All')+'</button>'; }).join('')+'</div>'
      +'<div class="katt-grid">'+L.map(function(c){ return tile(c[0],cur,c,c[3]); }).join('')+'</div>';
  }
  function pickHtml(n,cur,where){
    var lp=isLP(n), best=lp?[]:options(n);
    return '<div class="katt-p" data-katt-for="'+esc(n)+'" data-katt-where="'+where+'">'
      +'<div class="katt-pl">'+esc(n)+'</div>'
      +(lp?'<div class="katt-h">Where your feet go</div><div class="katt-grid">'+FEET.map(function(f){ return tile(f[0],cur,plate(f[3]),f[1]); }).join('')+'</div>'
        +'<div class="katt-n">Height matters more than width.</div>'
        :'<div class="katt-grid katt-best">'+best.map(function(o){ return tile(o,cur,catOf(o)); }).join('')+'</div>')
      +'<button type="button" class="chip katt-none" data-katt-v="">'+(lp?'No setting':'No attachment')+'</button>'
      +(where==='a'?'<button type="button" class="chip katt-more" data-katt-more="1">Every attachment</button><div class="katt-all" hidden></div>'
        :'<div class="katt-h">Every attachment</div><div class="katt-all">'+allHtml(cur)+'</div>')
      +'<div class="katt-own"><input class="srch" maxlength="40" placeholder="Something else? Type it" aria-label="Your own attachment"/><button type="button" class="chip on" data-katt-own="1">Save</button></div>'
      +'</div>';
  }
  /* p43, the owner: "Best for this one... doesn't make any sense... just rows
     and rows... organized like the two images" (the Ron Design Lab dial). The
     picker is the dial (src/p08_dial.js): body areas round the centre (the
     exercise's own area chosen first), the card under it shows that area's
     attachments in a row, the ones that fit this exercise first; on a leg
     press the dial is where your feet go, the card shows the leg press that
     way, and the centre button switches to gear. */
  var AREA_OF={Quads:'Legs',Calves:'Legs',Adductors:'Legs',Hamstrings:'Legs',Glutes:'Glutes',Chest:'Chest',Back:'Back',Shoulders:'Shoulders',Biceps:'Arms',Triceps:'Arms',Forearms:'Arms',Core:'Core'};
  function areaOf(n){
    var k=K(), m='';
    try{ var X=(k&&k.XL||[]).filter(function(r){ return r.n===n; })[0]; m=X&&X.m||''; }catch(e){}
    if(AREA_OF[m]) return AREA_OF[m];
    if(/pushdown|curl|tricep|skull|kickback/i.test(n)) return 'Arms';
    if(/row|pulldown|pull.?up|chin|deadlift|shrug|face pull/i.test(n)) return 'Back';
    if(/raise|overhead|shoulder|military/i.test(n)) return 'Shoulders';
    if(/bench|chest|fly|dip|push.?up|press/i.test(n)) return 'Chest';
    if(/hip thrust|glute|abduct|bridge/i.test(n)) return 'Glutes';
    if(/crunch|plank|ab |core|twist|leg raise/i.test(n)) return 'Core';
    return 'Legs';
  }
  /* p43d, the owner: "17 attachments on Back... it's too much for a workout app": the six people use most for each area */
  var TOP={Back:['V-bar','Wide lat bar','Row handle','Straight bar','Single handle','Straps'],
    Legs:['Belt','Ankle strap','Trap bar','Safety squat bar','Knee sleeves','Dumbbells'],
    Glutes:['Ankle strap','Band','Belt','Dumbbells','Kettlebell','Weight plate'],
    Arms:['Rope','Straight bar','V-bar','EZ bar','Tricep bar','Single handle'],
    Chest:['Stirrup handles','Single handle','Dumbbells','Dip belt','Wrist wraps','Weight plate'],
    Shoulders:['Rope','Single handle','Dumbbells','Landmine','Wrist wraps','Band'],
    Core:['Rope','Ankle strap','Medicine ball','Weight plate','Landmine','Kettlebell']};
  var PK=null, PD=null;
  function feetIcon(f){ return plate(f[3]).replace('class="katt-ic katt-pl8"','class="kdl-ic kdl-art katt-pl8"'); }
  function pkRing(){
    if(PK.mode==='feet') return FEET.map(function(f){ return {id:f[0],label:f[0].replace(/^Feet /,''),icon:feetIcon(f)}; });
    return AREAS.map(function(a){ return {id:a,label:a,icon:window.KovaDial.mus(a)}; });
  }
  function pkSel(){ var R=pkRing(), id=PK.mode==='feet'?PK.foot:PK.area, i=R.map(function(x){ return x.id; }).indexOf(id); return i<0?0:i; }
  function pkCard(){
    var cur=PK.cur;
    if(PK.mode==='feet'){
      var f=FEET.filter(function(x){ return x[0]===PK.foot; })[0]||FEET[0], on=cur===f[0];
      return '<div class="kdl-card" id="kattCard"><div class="kdl-ch"><span class="kdl-name">'+esc(f[0])+'</span>'+(on?'<span class="kdl-st"><i></i>In use</span>':'')+'</div>'
        +'<span class="kdl-fig kxp-th" data-kxd="'+esc(f[2])+'"></span>'
        +'<div class="kdl-sub"><i></i>'+esc(f[1])+'</div>'
        +'<div class="kdl-go"><button type="button" class="btn" data-katt-v="'+esc(f[0])+'">'+(on?'Keep '+esc(f[0].toLowerCase()):'Use '+esc(f[0].toLowerCase()))+'</button>'
        +(cur?'<button type="button" class="chip" data-katt-v="">Clear</button>':'')+'</div>'
        +'<div class="kdl-sub">Height matters more than width.</div></div>';
    }
    var best=options(PK.n), L=(TOP[PK.area]||[]).map(catOf).filter(Boolean);
    /* the ones that fit this exercise first, in their own order */
    L=L.map(function(c,i){ var r=best.indexOf(c[0]); return [c,r<0?99:r,i]; }).sort(function(x,y){ return x[1]-y[1]||x[2]-y[2]; }).map(function(x){ return x[0]; });
    var c0=catOf(cur);
    if(L.length>6) L=L.slice(0,6);
    return '<div class="kdl-card" id="kattCard"><div class="kdl-ch"><span class="kdl-name">'+esc(PK.area)+'</span>'
        +(cur?'<span class="kdl-st"><i></i>In use</span>':'')+'</div>'
      +'<div class="kdl-big"><b'+(cur?' class="w"':'')+'>'+(cur?esc(cur):L.length)+'</b><span>'+(cur?esc(c0?c0[3]:'yours'):'attachments')+'</span></div>'
      +'<div class="kdl-strip">'+L.map(function(c){ return '<button type="button" class="kdl-t att'+(c[0]===cur?' on':'')+'" data-katt-v="'+esc(c[0])+'" aria-pressed="'+(c[0]===cur)+'">'+icon(c).replace('class="katt-ic"','class="kdl-art"')+'<b>'+esc(c[0])+'</b><small>'+esc(c[3])+'</small></button>'; }).join('')
        +'<button type="button" class="kdl-t att" data-katt-other="1" aria-expanded="'+!!PK.own+'"><svg class="kdl-art" viewBox="0 0 48 28" aria-hidden="true"><path d="M24 7v14M17 14h14"/></svg><b>Other</b><small>Type your own</small></button></div>'
      +(PK.own?'<div class="katt-own"><input class="srch" maxlength="40" placeholder="Your attachment" aria-label="Your own attachment"/><button type="button" class="chip on" data-katt-own="1">Save</button></div>':'')
      +(cur?'<div class="kdl-go"><button type="button" class="chip" data-katt-v="">No attachment</button></div>':'')
      +'</div>';
  }
  function pickDialHtml(n,cur,where){
    var lp=isLP(n), fo=lp&&FEET.some(function(f){ return f[0]===cur; });
    PK={n:n,cur:cur||'',where:where,mode:lp&&(fo||!cur)?'feet':'gear',area:areaOf(n),foot:fo?cur:'Feet middle',own:false};
    if(!lp&&catOf(cur)&&catOf(cur)[2].indexOf(PK.area)<0) PK.area=catOf(cur)[2][0];
    return '<div class="katt-p kdl-page" data-katt-for="'+esc(n)+'" data-katt-where="'+where+'"><div class="kxp-h kdl-top"><div><b>'+esc(n)+'</b><small>'+(lp?'Feet and gear':'Attachment')+'</small></div></div>'
      +KovaDial.html({label:lp?'Where your feet go':'Body area'})
      +pkCard()+'</div>';
  }
  function pickDial(){
    var el=document.querySelector('#sheet .katt-p.kdl-page .kdl'); if(!el||!PK) return;
    var lp=isLP(PK.n);
    PD=KovaDial.mount(el,{label:lp?'Where your feet go':'Body area',items:pkRing(),sel:pkSel(),
      centre:lp?{icon:'swap',label:'Switch between feet and gear',onTap:function(){ PK.mode=PK.mode==='feet'?'gear':'feet'; PD.swap(pkRing(),pkSel()); repaint(); }}:{label:'Attachments'},
      onPick:function(i,it){ if(PK.mode==='feet') PK.foot=it.id; else PK.area=it.id; repaint(); }});
  }
  function repaint(){
    var c=document.getElementById('kattCard'); if(!c) return;
    var t=document.createElement('div'); t.innerHTML=pkCard(); var nw=t.firstChild; c.parentNode.replaceChild(nw,c);
    try{ if(window.KovaDemo) nw.querySelectorAll('[data-kxd]').forEach(function(e){ KovaDemo.mount(e,e.getAttribute('data-kxd')); }); }catch(x){}
  }
  function openPick(n,cur,where){
    if(!window.openSheet) return;
    if(!window.KovaDial){ openSheet('<div class="grab"></div>'+pickHtml(n,cur,where)); return; }
    openSheet(pickDialHtml(n,cur,where)); pickDial(); repaint();
  }
  /* any exercise by name, from anywhere (Coach me's top right, p42) */
  function pickSheet(n,done){ PICK=done||null; openPick(n,get(n),'x'); }
  var PICK=null;
  function sessionSheet(i){
    var k=K(); if(!k||!window.openSheet) return;
    var e=k.state().ex[i]; if(!e) return;
    openPick(e.n,e.att||get(e.n),'s'+i);
  }
  function choose(box,v){
    var n=box.getAttribute('data-katt-for'), where=box.getAttribute('data-katt-where');
    v=set(n,v);
    var k=K();
    if(where==='x'){
      try{ var S=k&&k.state(); (S&&S.ex||[]).forEach(function(e){ if(e.n===n){ e.att=v||undefined; } }); k&&k.api&&k.api.save&&k.api.save(); }catch(x){}
      if(window.closeSheet) closeSheet();
      if(window.toast) toast(v?n+': '+v+'. Kova remembers it.':'Nothing set for '+n+'.');
      var cb=PICK; PICK=null; if(cb) try{ cb(v); }catch(x){}
      decorate(); return;
    }
    if(k&&where.charAt(0)==='s'){
      var e=k.state().ex[+where.slice(1)]; if(e&&e.n===n){ e.att=v||undefined; try{ k.api&&k.api.save&&k.api.save(); }catch(x){} }
      if(window.closeSheet) closeSheet();
      if(window.toast) toast(v?n+': '+v+'. Kova remembers it.':'No attachment for '+n+'.');
      decorate(); return;
    }
    /* in "Add to today": update the row's button and fold the picker away */
    var row=box.previousElementSibling, b=row&&row.querySelector('.katt-add'); if(b) b.innerHTML=label(v,n);
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
        var b=w.querySelector('.katt-chip'), txt=label(e.att,e.n);
        if(b){ if(b.__t!==txt){ b.innerHTML=txt; b.__t=txt; b.classList.toggle('set',!!e.att); } return; }
        head.insertAdjacentHTML('afterend','<button type="button" class="katt-chip'+(e.att?' set':'')+'" data-katt="'+i+'" aria-label="Attachment for '+esc(e.n)+'">'+txt+'</button>');
        var nb=w.querySelector('.katt-chip'); if(nb) nb.__t=txt;
      });
    }
    /* "Add to today" */
    document.querySelectorAll('#sheet .exadd[data-n]').forEach(function(r){
      if(r.querySelector('.katt-add')) return;
      var n=r.getAttribute('data-n'), plus=r.querySelector('svg.ic');
      var html='<button type="button" class="katt-add" data-katt-n="'+esc(n)+'" aria-label="Attachment for '+esc(n)+'">'+label(get(n),n)+'</button>';
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
    var ar=t.closest('[data-katt-area]');
    if(ar){ ev.preventDefault(); ev.stopPropagation(); AREA=ar.getAttribute('data-katt-area'); var bx=ar.closest('.katt-p'), al=bx&&bx.querySelector('.katt-all'), nm=bx&&bx.getAttribute('data-katt-for'); if(al) al.innerHTML=allHtml(get(nm)); return; }
    var ot=t.closest('[data-katt-other]');
    if(ot&&PK){ ev.preventDefault(); ev.stopPropagation(); PK.own=!PK.own; repaint(); var oi=document.querySelector('#kattCard .katt-own input'); if(oi) try{ oi.focus(); }catch(x){} return; }
    var mo=t.closest('[data-katt-more]');
    if(mo){ ev.preventDefault(); ev.stopPropagation(); var bx2=mo.closest('.katt-p'), al2=bx2&&bx2.querySelector('.katt-all'); if(al2){ al2.hidden=!al2.hidden; if(!al2.hidden) al2.innerHTML=allHtml(get(bx2.getAttribute('data-katt-for'))); } return; }
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
  return {get:get,set:set,options:options,kind:kind,decorate:decorate,all:all,CAT:CAT,FEET:FEET,figure:figure,pickSheet:pickSheet,isLP:isLP,areaOf:areaOf,_PK:function(){ return PK; },dial:function(){ return PD; }};
})();
