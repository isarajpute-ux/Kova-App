/* =====================================================================
   KovaLift - the workout screen, lifter-grade (p11).

   Hevy and Strong keep lifters because logging a set is fast. The set
   rows (in the session code) now show last time's weight x reps inline,
   with one-tap Same / +2.5 / +5 that fill the set and log it - a set
   without typing. This file adds the rest:

     plates(w)  the plate calculator: bar weight (45 / 35 lb, 20 / 15 kg
                or your own), kg or lb, which plates you have, and what
                goes on each side - or the nearest weight you can load;
     demo(name) every exercise in the library has a looping demo of its
                movement pattern (squat, hinge, press, row, pull-up, curl,
                raise...) and three cues that matter most for it;
     and bigger, thumb-sized targets for one-handed logging.
   ===================================================================== */
window.KovaLift=(function(){
  'use strict';
  var KEY='kova.plates.v1';
  var P=lsJ(KEY,{unit:'lb',bar:{lb:45,kg:20},have:{lb:[45,35,25,10,5,2.5],kg:[25,20,15,10,5,2.5,1.25]}});
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(P)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  var ALL={lb:[55,45,35,25,10,5,2.5,1.25],kg:[25,20,15,10,5,2.5,1.25,0.5]};
  var BARS={lb:[45,35,33,25,15],kg:[20,15,10]};
  var LB=2.20462;

  /* ---------------- plates ---------------- */
  /* what goes on each side for `target` on a `bar`, from `have` (pairs) */
  function load(target,bar,have){
    target=+target||0; bar=+bar||0;
    if(target<bar) return {ok:false,under:true,side:[],loaded:bar};
    var side=(target-bar)/2, left=side, out=[];
    have.slice().sort(function(a,b){ return b-a; }).forEach(function(p){
      while(left+1e-9>=p){ out.push(p); left=Math.round((left-p)*1000)/1000; }
    });
    var loaded=Math.round((bar+2*(side-left))*100)/100;
    return {ok:left<1e-6,side:out,loaded:loaded,left:Math.round(left*2*100)/100};
  }
  function plates(w,unit){
    unit=unit||P.unit;
    if(unit!==P.unit){ w=unit==='lb'?w/LB:w*LB; w=Math.round(w*2)/2; }
    var target=w>0?w:(P.unit==='lb'?135:60);
    if(!window.openSheet) return;
    function draw(){
      var u=P.unit, bar=P.bar[u], have=P.have[u], r=load(target,bar,have);
      var el=document.querySelector('#sheetIn .klp'); if(!el) return;
      var colours={55:'#C8453A',45:'#3F6FB5',35:'#E1B23B',25:'#3E9A5A',10:'#DADADA',5:'#8F8F8F',2.5:'#5A5A5A',1.25:'#3A3A3A',20:'#3F6FB5',15:'#E1B23B',0.5:'#2E2E2E'};
      var stack=r.side.map(function(p){ var h=Math.round(34+Math.min(1,p/(u==='lb'?45:20))*56); return '<i style="height:'+h+'px;background:'+(colours[p]||'#888')+'" title="'+p+' '+u+'"></i>'; }).join('');
      el.querySelector('.klp-out').innerHTML=r.under
        ?'<div class="klp-big">Just the bar</div><div class="sub">'+target+' '+u+' is less than the '+bar+' '+u+' bar.</div>'
        :'<div class="klp-bar"><span class="klp-sleeve">'+stack+'</span><span class="klp-rod"></span><span class="klp-sleeve r">'+stack+'</span></div>'
          +'<div class="klp-big">'+(r.side.length?r.side.join(' · '):'Nothing')+' <small>'+u+' each side</small></div>'
          +(r.ok?'<div class="sub">Loads exactly '+r.loaded+' '+u+' on a '+bar+' '+u+' bar.</div>'
            :'<div class="sub">Closest with your plates: <b>'+r.loaded+' '+u+'</b> ('+r.left+' '+u+' short). Add smaller plates below to load it exactly.</div>');
      el.querySelector('.klp-units').innerHTML=['lb','kg'].map(function(x){ return '<button class="klp-c'+(x===u?' on':'')+'" data-u="'+x+'">'+x+'</button>'; }).join('');
      el.querySelector('.klp-bars').innerHTML=BARS[u].map(function(b){ return '<button class="klp-c'+(b===bar?' on':'')+'" data-b="'+b+'">'+b+' '+u+'</button>'; }).join('');
      el.querySelector('.klp-have').innerHTML=ALL[u].map(function(p){ var on=have.indexOf(p)>=0; return '<button class="klp-c'+(on?' on':'')+'" data-p="'+p+'" aria-pressed="'+on+'">'+p+'</button>'; }).join('');
    }
    openSheet('<div class="grab"></div><div class="klp">'
      +'<div class="title-s" style="font-size:19px">Plates</div>'
      +'<label class="klp-t">Target <input id="klpW" type="number" inputmode="decimal" step="0.5" value="'+target+'"></label>'
      +'<div class="klp-out"></div>'
      +'<div class="lbl">UNIT</div><div class="klp-row klp-units"></div>'
      +'<div class="lbl">BAR</div><div class="klp-row klp-bars"></div>'
      +'<div class="lbl">PLATES YOU HAVE (PAIRS)</div><div class="klp-row klp-have"></div></div>');
    var el=document.querySelector('#sheetIn .klp'); if(!el) return;
    el.querySelector('#klpW').addEventListener('input',function(){ target=+this.value||0; draw(); });
    el.addEventListener('click',function(ev){
      var b=ev.target.closest('button'); if(!b) return;
      if(b.dataset.u&&b.dataset.u!==P.unit){ target=Math.round((b.dataset.u==='kg'?target/LB:target*LB)*2)/2; P.unit=b.dataset.u; el.querySelector('#klpW').value=target; }
      else if(b.dataset.b) P.bar[P.unit]=+b.dataset.b;
      else if(b.dataset.p){ var p=+b.dataset.p, h=P.have[P.unit], k=h.indexOf(p); if(k>=0) h.splice(k,1); else h.push(p); }
      save(); draw();
    });
    draw();
  }

  /* ---------------- demos ---------------- */
  /* stick figures: joints per pose, bones between them; the demo loops A -> B -> A */
  var SIDE=[['head','neck'],['neck','hip'],['neck','elbow'],['elbow','hand'],['hip','knee'],['knee','foot']];
  var FRONT=[['head','neck'],['neck','hip'],['neck','le'],['le','lh'],['neck','re'],['re','rh'],['hip','lk'],['lk','lf'],['hip','rk'],['rk','rf']];
  var T={
    squat:{bones:SIDE,bar:'hand',cap:'Squat pattern',
      A:{head:[60,20],neck:[60,31],hip:[60,64],knee:[62,88],foot:[60,112],elbow:[50,38],hand:[56,30]},
      B:{head:[50,44],neck:[53,54],hip:[38,80],knee:[66,86],foot:[60,112],elbow:[44,60],hand:[51,52]}},
    lunge:{bones:SIDE.concat([['hip','k2'],['k2','f2']]),cap:'Split squat / lunge pattern',
      A:{head:[60,20],neck:[60,31],hip:[60,64],knee:[70,88],foot:[78,112],k2:[52,88],f2:[42,112],elbow:[60,48],hand:[60,64]},
      B:{head:[60,36],neck:[60,47],hip:[60,80],knee:[82,84],foot:[80,112],k2:[50,106],f2:[36,110],elbow:[60,64],hand:[60,80]}},
    hinge:{bones:SIDE,bar:'hand',cap:'Hip hinge pattern',
      A:{head:[62,20],neck:[62,31],hip:[60,64],knee:[61,88],foot:[60,112],elbow:[62,48],hand:[62,64]},
      B:{head:[88,50],neck:[80,56],hip:[52,64],knee:[64,88],foot:[60,112],elbow:[80,72],hand:[78,88]}},
    bridge:{bones:SIDE,bench:[10,60,34,6],cap:'Hip thrust / bridge pattern',
      A:{head:[18,54],neck:[26,56],hip:[52,86],knee:[76,74],foot:[82,110],elbow:[36,66],hand:[50,84]},
      B:{head:[18,54],neck:[26,56],hip:[54,58],knee:[78,62],foot:[82,110],elbow:[36,60],hand:[52,58]}},
    press:{bones:SIDE,bar:'hand',bench:[14,78,72,5],cap:'Bench press pattern',
      A:{head:[22,70],neck:[32,72],hip:[70,74],knee:[88,80],foot:[94,112],elbow:[36,56],hand:[38,40]},
      B:{head:[22,70],neck:[32,72],hip:[70,74],knee:[88,80],foot:[94,112],elbow:[28,80],hand:[40,64]}},
    ohp:{bones:SIDE,bar:'hand',cap:'Overhead press pattern',
      A:{head:[60,30],neck:[60,41],hip:[60,74],knee:[61,94],foot:[60,114],elbow:[52,50],hand:[58,40]},
      B:{head:[60,30],neck:[60,41],hip:[60,74],knee:[61,94],foot:[60,114],elbow:[61,22],hand:[62,6]}},
    row:{bones:SIDE,bar:'hand',cap:'Row pattern',
      A:{head:[86,44],neck:[78,50],hip:[52,62],knee:[60,88],foot:[58,112],elbow:[76,70],hand:[76,86]},
      B:{head:[86,44],neck:[78,50],hip:[52,62],knee:[60,88],foot:[58,112],elbow:[62,58],hand:[70,72]}},
    pullup:{bones:SIDE,rail:10,cap:'Pull-up / pulldown pattern',
      A:{head:[60,28],neck:[60,38],hip:[60,70],knee:[60,92],foot:[60,112],elbow:[60,24],hand:[60,10]},
      B:{head:[60,6],neck:[60,16],hip:[60,48],knee:[60,70],foot:[60,90],elbow:[46,22],hand:[60,10]}},
    curl:{bones:SIDE,db:'hand',cap:'Curl pattern',
      A:{head:[60,20],neck:[60,31],hip:[60,64],knee:[61,88],foot:[60,112],elbow:[60,48],hand:[61,65]},
      B:{head:[60,20],neck:[60,31],hip:[60,64],knee:[61,88],foot:[60,112],elbow:[60,48],hand:[70,36]}},
    ext:{bones:SIDE,db:'hand',cap:'Triceps extension pattern',
      A:{head:[60,20],neck:[60,31],hip:[60,64],knee:[61,88],foot:[60,112],elbow:[64,46],hand:[74,38]},
      B:{head:[60,20],neck:[60,31],hip:[60,64],knee:[61,88],foot:[60,112],elbow:[64,46],hand:[66,66]}},
    raise:{bones:FRONT,db:['lh','rh'],cap:'Raise pattern (front view)',
      A:{head:[60,18],neck:[60,29],hip:[60,62],lk:[54,86],lf:[54,110],rk:[66,86],rf:[66,110],le:[50,46],lh:[48,62],re:[70,46],rh:[72,62]},
      B:{head:[60,18],neck:[60,29],hip:[60,62],lk:[54,86],lf:[54,110],rk:[66,86],rf:[66,110],le:[44,32],lh:[28,32],re:[76,32],rh:[92,32]}},
    fly:{bones:FRONT,cap:'Fly pattern (front view)',
      A:{head:[60,18],neck:[60,29],hip:[60,62],lk:[54,86],lf:[54,110],rk:[66,86],rf:[66,110],le:[42,32],lh:[24,36],re:[78,32],rh:[96,36]},
      B:{head:[60,18],neck:[60,29],hip:[60,62],lk:[54,86],lf:[54,110],rk:[66,86],rf:[66,110],le:[48,36],lh:[57,40],re:[72,36],rh:[63,40]}},
    calf:{bones:SIDE.concat([['foot','toe']]),cap:'Calf raise pattern',
      A:{head:[60,22],neck:[60,33],hip:[60,66],knee:[61,90],foot:[60,110],toe:[72,112],elbow:[60,50],hand:[61,66]},
      B:{head:[62,14],neck:[62,25],hip:[62,58],knee:[63,82],foot:[64,102],toe:[72,112],elbow:[62,42],hand:[63,58]}},
    knee:{bones:SIDE,seat:[38,70,30,5],cap:'Leg extension / curl pattern',
      A:{head:[40,26],neck:[42,37],hip:[46,68],knee:[70,70],foot:[70,96],elbow:[48,54],hand:[54,68]},
      B:{head:[40,26],neck:[42,37],hip:[46,68],knee:[70,70],foot:[94,68],elbow:[48,54],hand:[54,68]}},
    plank:{bones:SIDE,cap:'Plank / brace (hold)',
      A:{head:[22,64],neck:[30,70],hip:[70,76],knee:[86,80],foot:[102,86],elbow:[30,92],hand:[40,92]},
      B:{head:[22,63],neck:[30,69],hip:[70,74],knee:[86,79],foot:[102,86],elbow:[30,92],hand:[40,92]}},
    crunch:{bones:SIDE,cap:'Crunch / core flexion pattern',
      A:{head:[22,86],neck:[32,88],hip:[64,92],knee:[80,72],foot:[92,96],elbow:[26,80],hand:[20,82]},
      B:{head:[36,66],neck:[42,74],hip:[64,92],knee:[80,72],foot:[92,96],elbow:[38,64],hand:[32,62]}},
    rotate:{bones:FRONT,db:['lh'],cap:'Rotation pattern (front view)',
      A:{head:[60,20],neck:[60,31],hip:[60,64],lk:[54,88],lf:[52,110],rk:[66,88],rf:[68,110],le:[46,44],lh:[36,56],re:[52,48],rh:[40,58]},
      B:{head:[60,20],neck:[60,31],hip:[60,64],lk:[54,88],lf:[52,110],rk:[66,88],rf:[68,110],le:[74,44],lh:[84,56],re:[68,48],rh:[80,58]}},
    carry:{bones:SIDE.concat([['hip','k2'],['k2','f2']]),db:'hand',cap:'Loaded carry pattern',
      A:{head:[60,20],neck:[60,31],hip:[60,64],knee:[68,88],foot:[74,112],k2:[54,88],f2:[48,112],elbow:[60,48],hand:[60,66]},
      B:{head:[64,20],neck:[64,31],hip:[64,64],knee:[60,88],foot:[54,112],k2:[72,88],f2:[80,112],elbow:[64,48],hand:[64,66]}},
    jump:{bones:SIDE,cap:'Jump / power pattern',
      A:{head:[54,40],neck:[56,51],hip:[44,76],knee:[64,86],foot:[60,112],elbow:[48,64],hand:[40,74]},
      B:{head:[60,4],neck:[60,15],hip:[60,48],knee:[61,70],foot:[60,94],elbow:[62,2],hand:[64,-8]}},
    shrug:{bones:SIDE,db:'hand',cap:'Shrug pattern',
      A:{head:[60,20],neck:[60,33],hip:[60,64],knee:[61,88],foot:[60,112],elbow:[60,50],hand:[61,67]},
      B:{head:[60,20],neck:[60,27],hip:[60,64],knee:[61,88],foot:[60,112],elbow:[60,44],hand:[61,61]}}
  };
  var CUES={
    squat:['Brace before you go down: big breath, ribs down.','Knees track over your toes; sit between your hips.','Drive up through the whole foot, chest and hips rising together.'],
    lunge:['Take a step long enough that the front shin stays near vertical.','Drop the back knee straight down.','Push through the front heel to come up.'],
    hinge:['Push the hips back; shins stay close to vertical.','Keep the weight against your legs the whole way.','Stand up by squeezing your glutes; do not lean back at the top.'],
    bridge:['Upper back on the bench, chin tucked.','Drive through your heels to full hip extension.','Squeeze the glutes at the top; keep the ribs down.'],
    press:['Shoulder blades pinched and down, feet planted.','Lower to the lower chest, elbows about 45° from your body.','Press up and slightly back toward your face.'],
    ohp:['Squeeze glutes and brace so the lower back does not arch.','Move your head back, press straight up, then bring your head through.','Finish with the weight over mid-foot, arms locked.'],
    row:['Hinge to about 45° and keep the back flat.','Pull your elbows toward your hips, not your ears.','Pause with the weight in, then lower under control.'],
    pullup:['Start from a dead hang; pull the shoulders down first.','Drive the elbows down to your ribs.','Chin over the bar, then lower all the way.'],
    curl:['Elbows stay pinned to your sides.','Curl without swinging; lower slower than you lift.','Get the full stretch at the bottom.'],
    ext:['Keep the upper arms still.','Move only at the elbow, all the way to lockout.','Control the stretch on the way back.'],
    raise:['Slight bend in the elbows; lead with the elbows.','Raise to shoulder height, not higher.','Lower slowly, and do not shrug.'],
    fly:['Soft elbows; open to a stretch you control.','Bring the hands together as if hugging a tree.','Squeeze the chest for a second.'],
    calf:['Full stretch at the bottom.','Rise onto the big toe and pause at the top.','Go slowly; no bouncing.'],
    knee:['Line your knee up with the machine’s pivot.','Use the full range and pause at the hardest point.','Lower over about 3 seconds.'],
    plank:['A straight line from head to heels.','Squeeze the glutes and pull the ribs down.','Keep breathing; stop when the hips sag.'],
    crunch:['Curl the ribs toward the pelvis.','Breathe out as you crunch.','Control the way back down.'],
    rotate:['Turn from the torso; hips stay steady.','The arms follow the chest.','Control it; do not fling.'],
    carry:['Stand tall, shoulders down and back.','Short, quick steps.','Brace; do not lean to one side.'],
    jump:['Load the hips and swing the arms.','Jump hard; land softly with knees bent.','Reset before each rep.'],
    shrug:['Straight up toward the ears.','Pause at the top.','Do not roll the shoulders.']
  };
  var OWN={
    'Deadlift':['Bar over mid-foot, shins touching it.','Pull the slack out of the bar before it leaves the floor.','Push the floor away; hips and shoulders rise together.'],
    'Romanian deadlift':['Soft knees that stay put.','Hips back until you feel the hamstrings stretch.','Keep the bar close; stop before the back rounds.'],
    'Pull up':['Start from a dead hang; pull the shoulders down first.','Drive the elbows down to your ribs.','Chin over the bar without kicking.'],
    'Lat pulldown':['Thighs locked under the pad.','Pull the bar to the top of your chest.','Let the arms go long at the top for the stretch.'],
    'Barbell row':['Hinge to about 45°, back flat.','Pull to the lower ribs.','Do not stand up to finish the rep.'],
    'Face pull':['Rope at eye height.','Pull toward your face, hands apart.','Finish with thumbs pointing behind you.'],
    'Cable face pull':['Rope at eye height.','Pull toward your face, hands apart.','Finish with thumbs pointing behind you.']
  };
  function kindOf(name,x){
    var n=String(name||'').toLowerCase(); x=x||{};
    if(/leg (extension|curl)|hamstring curl|nordic/.test(n)) return 'knee';
    if(/calf|tibialis/.test(n)) return 'calf';
    if(/shrug/.test(n)) return 'shrug';
    if(/hip thrust|glute bridge|bridge/.test(n)) return 'bridge';
    if(/lunge|split squat|step up|step down|bulgarian/.test(n)) return 'lunge';
    if(/squat|leg press|hack|goblet/.test(n)) return 'squat';
    if(/deadlift|romanian|good morning|back extension|swing|pull through/.test(n)) return 'hinge';
    if(/fly|pec deck|crossover/.test(n)&&!/rear|reverse/.test(n)) return 'fly';
    if(/overhead press|shoulder press|arnold|push press|military/.test(n)) return 'ohp';
    if(/bench|push up|dips|chest press|close grip/.test(n)) return 'press';
    if(/pull ?up|chin ?up|pulldown|straight arm/.test(n)) return 'pullup';
    if(/row|face pull|rear delt|reverse pec/.test(n)) return 'row';
    if(/curl/.test(n)) return 'curl';
    if(/extension|pushdown|kickback|skull|tricep/.test(n)) return 'ext';
    if(/external rotation|y-t-w/.test(n)) return 'raise';
    if(/twist|rotation|rotational|woodchop|pallof/.test(n)) return 'rotate';
    if(/plank|dead bug|hollow/.test(n)) return 'plank';
    if(/crunch|sit ?up|ab wheel|leg raise|knee raise/.test(n)) return 'crunch';
    if(/raise|y-t-w|external rotation/.test(n)) return 'raise';
    if(/carry|walk/.test(n)) return 'carry';
    if(/jump|hop|bound|throw|slam/.test(n)) return 'jump';
    var byPat={sq:'squat',hg:'hinge',hp:'press',vp:'ohp',hpl:'row',vpl:'pullup',carry:'carry',pw:'jump'};
    if(byPat[x.pat]) return byPat[x.pat];
    var byM={Biceps:'curl',Triceps:'ext',Shoulders:'raise',Calves:'calf',Core:'crunch',Chest:'fly',Back:'row',Quads:'knee',Hamstrings:'knee',Glutes:'bridge'};
    return byM[x.m]||'raise';
  }
  function svg(k){
    var t=T[k], reduce=false;
    try{ reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
    var A=t.A, B=t.B, dur='2.6s';
    function anim(attr,a,b){ return reduce?'':'<animate attributeName="'+attr+'" values="'+a+';'+b+';'+a+'" dur="'+dur+'" repeatCount="indefinite" keyTimes="0;0.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>'; }
    var P2=reduce?B:A, h='';
    if(t.bench) h+='<rect x="'+t.bench[0]+'" y="'+t.bench[1]+'" width="'+t.bench[2]+'" height="'+t.bench[3]+'" rx="2" class="kld-eq"/>';
    if(t.seat) h+='<rect x="'+t.seat[0]+'" y="'+t.seat[1]+'" width="'+t.seat[2]+'" height="'+t.seat[3]+'" rx="2" class="kld-eq"/>';
    if(t.rail) h+='<line x1="20" y1="'+t.rail+'" x2="100" y2="'+t.rail+'" class="kld-eq-l"/>';
    h+='<line x1="4" y1="116" x2="116" y2="116" class="kld-floor"/>';
    t.bones.forEach(function(b){
      var a=b[0], c=b[1];
      h+='<line x1="'+P2[a][0]+'" y1="'+P2[a][1]+'" x2="'+P2[c][0]+'" y2="'+P2[c][1]+'" class="kld-b">'
        +anim('x1',A[a][0],B[a][0])+anim('y1',A[a][1],B[a][1])+anim('x2',A[c][0],B[c][0])+anim('y2',A[c][1],B[c][1])+'</line>';
    });
    h+='<circle cx="'+P2.head[0]+'" cy="'+P2.head[1]+'" r="7" class="kld-h">'+anim('cx',A.head[0],B.head[0])+anim('cy',A.head[1],B.head[1])+'</circle>';
    var wt=function(j,r){ return '<circle cx="'+P2[j][0]+'" cy="'+P2[j][1]+'" r="'+r+'" class="kld-w">'+anim('cx',A[j][0],B[j][0])+anim('cy',A[j][1],B[j][1])+'</circle>'; };
    if(t.bar) h+=wt(t.bar,6.5);
    if(t.db) [].concat(t.db).forEach(function(j){ h+=wt(j,4.5); });
    return '<svg viewBox="0 -10 120 130" class="kld-svg" role="img" aria-label="'+esc(t.cap)+' demo">'+h+'</svg>';
  }
  function info(name){
    var x=(window.KSESS&&KSESS.lib)?KSESS.lib(name):{};
    var k=kindOf(name,x);
    return {kind:k,cap:T[k].cap,cues:OWN[name]||CUES[k],muscle:x.m||''};
  }
  function demo(name){
    var I=info(name);
    if(!window.openSheet) return I;
    openSheet('<div class="grab"></div><div class="kld">'
      +'<div class="title-s" style="font-size:19px">'+esc(name)+'</div>'
      +'<div class="sub" style="margin:2px 0 10px">'+esc(I.cap)+(I.muscle?' · '+esc(I.muscle):'')+'</div>'
      +'<div class="kld-fig">'+svg(I.kind)+'</div>'
      +'<ol class="kld-cues">'+I.cues.map(function(c){ return '<li>'+esc(c)+'</li>'; }).join('')+'</ol>'
      +'<div class="kld-note">A movement-pattern demo, not a video of this exact machine. Stop if anything hurts beyond normal effort.</div></div>');
    return I;
  }

  return {plates:plates,load:load,demo:demo,info:info,kindOf:kindOf,svg:svg,TEMPLATES:T,CUES:CUES};
})();
