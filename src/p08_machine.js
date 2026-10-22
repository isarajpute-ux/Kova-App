/* =====================================================================
   KovaMachine - Scan a machine (moved out of the first screen, p36).

   Photo, video or link in; Kova names the equipment, what it trains and
   how to use it. When it is not sure it says its best guesses with a
   picture of each, and the full list below shows a picture and what each
   machine looks like, so nobody is left at "I don't know".
   ===================================================================== */
/* ---------- machine scanner: photo -> muscles worked + how to do it ---------- */
(function(){
  var drop=document.getElementById('mcDrop');
  if(!drop) return;
  var file=document.getElementById('mcFile');

  // Muscle attributions and setup steps follow standard resistance-training
  // references. They describe the machine, not the photo.
  var M=[
    {n:'Leg press',k:'leg press sled 45 plate',kind:'fixed',
     pri:['Quadriceps','Gluteus maximus'],sec:['Adductors','Hamstrings'],
     set:['Sit with your whole back and hips flat against the pad','Feet mid-platform, shoulder width, toes slightly out','Release the safety handles only once your feet are set'],
     how:['Lower until your knees reach about 90 degrees, controlled, roughly 2 seconds','Stop before your hips start to curl off the pad','Press through the whole foot, not just the toes','Leave a slight bend at the top, never snap the knees straight'],
     miss:[['Letting the low back round at the bottom','This is where leg press injuries happen. Shorten the range.'],['Locking the knees out hard','Dumps the load onto the joint instead of the muscle.'],['Feet too low on the platform','Turns it into a knee-dominant grind and lifts the heels.']],
     rx:{s:3,r:'10-15',rest:'2 min'}},

    {n:'Lat pulldown',k:'lat pulldown cable overhead',kind:'fixed',
     pri:['Latissimus dorsi'],sec:['Biceps','Rear delts','Mid traps','Rhomboids'],
     set:['Set the thigh pad snug so you do not lift off the seat','Grip slightly wider than shoulder width','Sit tall, lean back no more than about 15 degrees and hold it'],
     how:['Pull the bar to your upper chest, not behind your neck','Drive the elbows down and back, hands are just hooks','Squeeze the shoulder blades down at the bottom','Let the bar rise all the way until you feel the lats stretch'],
     miss:[['Leaning further back each rep','Turns it into a row. Pick a lighter stack.'],['Pulling behind the neck','No extra benefit, and it puts the shoulder in a bad spot.'],['Yanking with the arms','Biceps take over. Think elbows, not hands.']],
     rx:{s:3,r:'8-12',rest:'1.5 min'}},

    {n:'Chest press machine',k:'chest press seated machine push',kind:'fixed',
     pri:['Pectoralis major'],sec:['Front delts','Triceps'],
     set:['Set the seat so the handles sit level with mid chest','Shoulder blades pinned back and down against the pad','Feet flat on the floor'],
     how:['Press forward and slightly together, elbows about 45 degrees from the torso','Stop just short of locking the elbows','Return under control until you feel the chest stretch','Keep the shoulders back the entire set'],
     miss:[['Seat too high','Presses upward, loads the shoulder instead of the chest.'],['Shoulders rolling forward at the end','Losing the set position. Lighter and stricter.'],['Bouncing out of the bottom','Skips the part that builds the chest.']],
     rx:{s:3,r:'8-12',rest:'1.5 min'}},

    {n:'Seated cable row',k:'cable row seated horizontal pull',kind:'fixed',
     pri:['Mid traps','Rhomboids','Latissimus dorsi'],sec:['Biceps','Rear delts','Spinal erectors'],
     set:['Feet braced, slight knee bend','Sit tall with a neutral spine, chest up','Start with arms extended and let the shoulder blades reach forward'],
     how:['Pull the handle to your belly button, elbows close to the body','Squeeze the shoulder blades together and hold a beat','Return slowly, letting the blades separate at the front','Torso stays still, do not rock back and forth'],
     miss:[['Rowing with the whole body','Momentum, not muscle. Cut the weight.'],['Shrugging at the top','Upper traps take over. Keep the shoulders down.'],['Rounding forward on the stretch','Let the blades move, not the spine.']],
     rx:{s:3,r:'10-12',rest:'1.5 min'}},

    {n:'Leg extension',k:'leg extension quad knee',kind:'fixed',
     pri:['Quadriceps'],sec:[],
     set:['Knee joint lined up with the machine pivot','Pad on the lower shin, just above the ankle','Hold the handles and keep your hips down'],
     how:['Extend smoothly until just short of full lockout','Pause and squeeze at the top for a count','Lower over about 3 seconds, do not let the stack drop','Keep your back against the pad throughout'],
     miss:[['Swinging the weight up','Loads the knee, not the quad.'],['Pivot misaligned','The single most common setup error here. Fix it before you load.'],['Slamming the stack down','You lose the best half of the rep.']],
     rx:{s:3,r:'12-15',rest:'1–1.5 min'}},

    {n:'Lying or seated leg curl',k:'leg curl hamstring',kind:'fixed',
     pri:['Hamstrings'],sec:['Calves'],
     set:['Knee pivot aligned with the machine axis','Pad just above the heels','Hips pressed down into the pad'],
     how:['Curl smoothly, squeeze at the peak','Do not let the hips lift off the bench','Lower over about 3 seconds under control','Keep the toes relaxed, not pointed hard'],
     miss:[['Hips lifting to help','Cuts the hamstring out. Lighter stack.'],['Half reps at the top','Most of the growth is in the full range.'],['Rushing the negative','Hamstrings respond well to slow lowering.']],
     rx:{s:3,r:'10-15',rest:'1.5 min'}},

    {n:'Shoulder press machine',k:'shoulder press overhead machine delt',kind:'fixed',
     pri:['Front delts'],sec:['Side delts','Triceps','Upper chest'],
     set:['Seat set so handles start at about shoulder height','Back flat against the pad','Core braced, ribs down'],
     how:['Press up and slightly in, elbows finishing under the wrists','Stop just short of lockout','Lower until the handles reach shoulder level','Do not arch the low back to push through a hard rep'],
     miss:[['Arching the low back','Turns it into an incline press and strains the spine.'],['Starting too low','Overstretches the shoulder. Raise the seat.'],['Flaring the elbows straight out','Keep them slightly forward of the torso.']],
     rx:{s:3,r:'8-12',rest:'1.5 min'}},

    {n:'Pec deck / chest fly',k:'pec deck fly machine chest',kind:'fixed',
     pri:['Pectoralis major'],sec:['Front delts'],
     set:['Seat height so the handles are at chest level','Small bend in the elbows and keep it fixed','Shoulder blades back and down'],
     how:['Bring the handles together in an arc, not a press','Squeeze for a beat where they meet','Open slowly until you feel a stretch, do not go past comfortable','Elbow angle never changes through the set'],
     miss:[['Bending and straightening the arms','That is a press. Fix the elbow angle.'],['Opening too far','Puts the shoulder capsule at risk for no extra gain.'],['Shrugging at the squeeze','Keep the shoulders down and back.']],
     rx:{s:3,r:'12-15',rest:'1–1.5 min'}},

    {n:'Cable machine (adjustable pulley)',k:'cable crossover functional trainer pulley',
     kind:'open',eq:'cable',
     pri:[],sec:[],
     set:['Set the pulley height for the movement, not out of habit','Stand where the cable stays under tension at the start','Split stance if you are pulling or pressing hard'],
     how:['Keep constant tension, never let the stack rest mid-set','Control the return as much as the pull','Line your body up with the cable path','Brace the core so the torso does not twist'],
     miss:[['Standing too close to the stack','Loses tension at the start of the rep.'],['Letting the weight slam between reps','Kills the tension the cable is there to give.'],['Twisting the torso','Cable work rewards a still trunk.']],
     rx:{s:3,r:'10-15',rest:'1–1.5 min'}},

    {n:'Smith machine',k:'smith machine fixed bar guided',
     kind:'open',eq:'barbell',
     pri:[],sec:[],
     set:['Set the safeties at the lowest point you plan to reach','Foot position shifts because the bar path is fixed','Learn the twist that unhooks and re-racks the bar before loading'],
     how:['Let the fixed path guide you, do not fight it sideways','Because the bar cannot drift, foot placement sets the muscle worked','Use the safeties, it is the main advantage of this machine','Do not chase free-barbell numbers here, the loading is not comparable'],
     miss:[['Copying free-barbell foot position','The fixed path changes the mechanics.'],['Not setting the safeties','You lose the one real benefit.'],['Assuming the weight matches a barbell','Counterbalancing differs by machine.']],
     rx:{s:3,r:'8-12',rest:'2 min'}},

    {n:'Hip abduction / adduction machine',k:'hip abduction adduction inner outer thigh',kind:'fixed',
     pri:['Gluteus medius (abduction)','Adductors (adduction)'],sec:['Gluteus minimus'],
     set:['Sit fully back so the low back is supported','Pads against the outside or inside of the knees','Start from a comfortable range, not the extreme'],
     how:['Push out or squeeze in smoothly, pause at the end','Return slowly rather than letting the pads snap back','Keep the torso still and upright','Full but comfortable range, never forced'],
     miss:[['Slamming through reps','Very common on this machine and pointless.'],['Leaning the torso to help','Take the pin down a plate.'],['Setting the start range too wide','Overstretches the groin.']],
     rx:{s:3,r:'12-20',rest:'1 min'}},

    {n:'Treadmill',k:'treadmill run walk cardio',kind:'fixed',
     pri:['Quadriceps','Hamstrings','Calves','Glutes'],sec:['Cardiovascular system'],
     set:['Clip the safety key to your clothing every time','Start it slow and step on once it is moving','Set incline before speed'],
     how:['Run tall, look ahead, not down at the console','Avoid holding the rails, it changes your gait and inflates the numbers','Land under your hips, not out in front','Build incline before you chase speed if joints are an issue'],
     miss:[['Holding the handrails','Makes the effort reading meaningless.'],['Stepping on while it is stopped','Jolts you when it starts.'],['Skipping the safety key','It exists for a reason.']],
     rx:{s:1,r:'20-40 min',rest:'n/a'}},

    {n:'Not sure / not listed',k:'unknown other',
     kind:'fixed',pri:['Identify it to get this'],sec:[],
     set:['Read the placard on the frame, most machines have one with a diagram','Set every adjustment before you load it','Do one light set to learn the path'],
     how:['If a joint hurts rather than a muscle burning, stop','Start at the lowest useful weight and learn the movement','Ask staff to check your setup once, it is quicker than guessing'],
     miss:[['Loading before adjusting','Setup drives which muscle actually works.'],['Copying whoever used it last','Their seat height is not yours.'],['Pushing through joint pain','Muscle burn is fine, joint pain is not.']],
     rx:{s:2,r:'10-15',rest:'1.5 min'}},

    /* ---- open equipment: a tool, not a movement ----
       These deliberately carry no muscle list. A dumbbell trains whatever
       you do with it, and printing 'quadriceps' under a photo of two
       dumbbells is the bug this section exists to prevent. */
    {n:'Dumbbells',k:'dumbbell dumbbells free weight hex adjustable',
     kind:'open',eq:'dumbbell',pri:[],sec:[],
     set:['Pick a weight you can control for the full range, not the first rep only','Clear enough space to press and swing without hitting anything','If they are adjustable, check the collars are locked before every set'],
     how:['The movement decides the muscle, so choose it before you choose the weight','Both arms together is easier to load, one at a time exposes side-to-side differences','Control the lowering, it is where most of the work happens'],
     miss:[['Going heavier than you can lower slowly','If it drops on the way down, it is not training the muscle.'],['Only ever pressing','Dumbbells row, hinge, squat and carry just as well.'],['Ignoring the weaker side','Single-arm sets even it out. Match the weaker side.']],
     rx:{s:3,r:'8-15',rest:'1–1.5 min'}},

    {n:'Barbell and plates',k:'barbell bar plates olympic free weight',
     kind:'open',eq:'barbell',pri:[],sec:[],
     set:['Load evenly and use collars, every set','Set safety pins at the lowest point you plan to reach','Know how you will bail before you start a heavy set'],
     how:['The lift decides the muscle. Same bar, entirely different training','Heavy compound work needs longer rest than machine work','Add weight in small steps, the bar rewards patience'],
     miss:[['Skipping collars','Plates shift, the bar tips, and it happens fast.'],['No safeties on squats or bench','The one mistake that turns a missed rep into an injury.'],['Adding weight before the movement is clean','Load a pattern you can already do well.']],
     rx:{s:3,r:'5-10',rest:'2–3 min'}},

    {n:'Kettlebell',k:'kettlebell bell swing',
     kind:'open',eq:'dumbbell',pri:[],sec:[],
     set:['Clear a wide space, swings travel further than people expect','Grip the handle where it is comfortable, not clamped','Stand with the bell slightly in front of you to start a swing'],
     how:['Ballistic work like swings is a hinge, driven by the hips, not a squat','Grinds like presses and goblet squats are slow and controlled','The offset weight is the point, it makes the grip and core work harder'],
     miss:[['Squatting the swing','It is a hinge. The bell travels because the hips snap.'],['Rounding the back at the bottom','Shorten the backswing and keep the chest proud.'],['Muscling it up with the arms','Arms are ropes. The hips do the work.']],
     rx:{s:3,r:'10-20',rest:'1–1.5 min'}},

    {n:'Resistance bands',k:'band bands resistance loop tube',
     kind:'open',eq:'cable',pri:[],sec:[],
     set:['Check for nicks or tears before every session, bands fail suddenly','Anchor to something that will not move','Stand where there is already slight tension at the start'],
     how:['Resistance rises as the band stretches, so it is hardest at the end of the rep','Control the return, letting it snap back wastes most of the set','Step further away to make it harder rather than reaching for a thicker band'],
     miss:[['Anchoring to something that can come loose','Bands under tension travel at speed.'],['Letting it recoil freely','The lowering is half the training.'],['Judging effort by the band colour','Distance from the anchor changes the load more than the colour does.']],
     rx:{s:3,r:'12-20',rest:'0.75–1 min'}},

    {n:'Adjustable bench',k:'bench flat incline decline adjustable',
     kind:'open',eq:'dumbbell',pri:[],sec:[],
     set:['Set the angle before you pick up the weight','Flat, incline and decline shift the emphasis without changing the lift','Feet planted, shoulder blades pulled back into the pad'],
     how:['It supports the movement rather than being one, so the exercise decides the muscle','Higher incline moves more of the work to the front of the shoulder','Sitting on it upright turns most pressing into a shoulder movement'],
     miss:[['Leaving the incline where the last person left it','The angle is the whole variable.'],['Feet up on the bench','Costs you the base you press against.'],['Shoulders rolling forward','Set the blades before the first rep and hold them there.']],
     rx:{s:3,r:'8-12',rest:'1.5 min'}},

    {n:'Squat rack or power cage',k:'rack cage squat power stand',
     kind:'open',eq:'barbell',pri:[],sec:[],
     set:['Set the hooks just below shoulder height so you are not on tiptoe','Safety arms slightly below your lowest good rep','Walk out and back in the same path every time'],
     how:['The rack holds the bar, the lift you choose decides what gets trained','Set safeties for the lift you are doing, not the last one','Two steps out is enough, do not wander into the middle of the floor'],
     miss:[['Hooks set too high','You end up on your toes to rack a heavy bar.'],['No safeties on squats','This is the equipment whose whole point is catching a failed rep.'],['Walking the bar too far out','Costs energy and makes re-racking harder when tired.']],
     rx:{s:3,r:'5-10',rest:'2–3 min'}},

    {n:'Pull up bar',k:'pull up bar chin bodyweight hang',
     kind:'open',eq:'bodyweight',pri:[],sec:[],
     set:['Check it is secure before you hang your whole weight on it','Full grip, thumb around the bar','Start from a dead hang with the shoulders active, not slack'],
     how:['Grip and body position decide the emphasis, so the variation is the choice that matters','If you cannot do one yet, use a band or lower yourself slowly','Chin over the bar with the chest, not the neck'],
     miss:[['Kipping to hit a number','Fine in a conditioning workout, useless for building the back.'],['Half reps from a bent hang','Start each rep from straight arms.'],['Hanging slack at the bottom','Keep tension in the shoulders between reps.']],
     rx:{s:3,r:'as many as clean',rest:'1.5 min'}}
  ];

  var picked=-1, q='', lastShot=null, ident=null, hint='';
  window.__kovaMachines=M;   /* p29: KovaGoal adds the cardio machines */

  /* p36: what each one looks like, in plain words, and the moving picture
     of what you do on it - so someone who does not know the name can find
     it by sight */
  var LOOK={
    'Leg press':['You sit back and push a heavy sled or plate away with your feet.','Leg press'],
    'Lat pulldown':['You sit with your knees under pads and pull a wide bar down from above.','Lat pulldown'],
    'Chest press machine':['You sit upright and push two handles straight out from your chest.','Bench press'],
    'Seated cable row':['You sit with your feet on a plate and pull a handle in to your stomach.','Seated cable row'],
    'Leg extension':['You sit with a padded bar on your shins and kick your legs out straight.','Leg extension'],
    'Lying or seated leg curl':['A pad sits behind your ankles and you bend your knees against it.','Seated leg curl'],
    'Shoulder press machine':['You sit and press two handles up from your shoulders.','Seated shoulder press'],
    'Pec deck / chest fly':['You sit and bring two padded arms or handles together in front of your chest.','Pec deck'],
    'Cable machine (adjustable pulley)':['A tall frame with weight stacks and pulleys that slide up and down, with a rope or handle.','Tricep pushdown'],
    'Smith machine':['A barbell fixed on two rails, so it only moves straight up and down.','Barbell back squat'],
    'Hip abduction / adduction machine':['You sit with pads on the sides of your knees and push them out, or squeeze them in.',''],
    'Treadmill':['A moving belt you walk or run on.',''],
    'Not sure / not listed':['None of these? Pick this and Kova gives safe general advice.',''],
    'Dumbbells':['Short handles with a weight on each end, one in each hand.','Dumbbell curl'],
    'Barbell and plates':['A long bar with round weight plates on the ends.','Deadlift'],
    'Kettlebell':['A round iron ball with a handle on top.','Kettlebell swing'],
    'Resistance bands':['Stretchy loops or tubes, often with handles.','Face pull'],
    'Adjustable bench':['A padded bench whose back tilts up for incline work.','Incline dumbbell press'],
    'Squat rack or power cage':['A tall steel frame with hooks and safety bars that holds a barbell.','Barbell back squat'],
    'Pull up bar':['A bar above your head that you hang from.','Pull up'],
    'Stationary bike':['A bike that stays in one place, with a screen on the handlebars.',''],
    'Rowing machine':['A long rail with a sliding seat and a handle on a chain or strap.',''],
    'Stair climber':['Moving steps like an escalator that you keep climbing.',''],
    'Elliptical':['Foot plates that glide in an oval, with handles that swing.','']
  };
  function look(m){ return (LOOK[m.n]||[])[0]||''; }
  function pic(m,cls){
    var n=(LOOK[m.n]||[])[1]; if(!n||!window.KovaDemo||!KovaDemo.find(n)) return '<span class="mc-pic mc-none '+(cls||'')+'"><svg class="ic"><use href="#i-barbell"/></svg></span>';
    return '<span class="mc-pic '+(cls||'')+'" data-mc-pic="'+n+'"></span>';
  }
  function mountPics(root){
    if(!window.KovaDemo||!root) return;
    root.querySelectorAll('[data-mc-pic]').forEach(function(el){ if(!el.__kxd){ el.__kxd=1; KovaDemo.mount(el,el.getAttribute('data-mc-pic'),{still:true,u:1}); } });
  }
  function byName(n){ var k=-1; M.forEach(function(m,i){ if(m.n===n) k=i; }); return k; }

  /* A machine the model described because it is not one of the curated
     entries. Held here rather than pushed into M on purpose: M is also the
     manual picker list, and a one-off generated entry appearing in that list
     would imply it has the same standing as the vetted ones. It does not. */
  var gen=null;

  /* muscle grouping for the movement list, from the shared library */
  var REGION={Chest:'Push',Shoulders:'Push',Triceps:'Push',
              Back:'Pull',Lats:'Pull',Biceps:'Pull',Traps:'Pull',Forearms:'Pull',
              Quads:'Legs',Hamstrings:'Legs',Glutes:'Legs',Calves:'Legs',
              Core:'Core',Abs:'Core',Obliques:'Core'};
  function movesFor(eq){
    if(!window.LIB) return [];
    return LIB.filter(function(x){ return x.e===eq; });
  }

  /* the framing viewfinder, not the photo library */
  drop.onclick=function(){
    if(window.KovaCam){
      KovaCam.open({
        title:'Scan equipment',
        hint:'Fit the whole machine or the weights inside the square.',
        onShot:function(dataUrl){ accept(dataUrl); }
      });
      return;
    }
    file.click();
  };

  file.onchange=function(){
    var f=this.files&&this.files[0]; if(!f) return;
    var fr=new FileReader();
    fr.onload=function(){ accept(String(fr.result)); };
    fr.readAsDataURL(f);
  };

  function accept(dataUrl,ctx){
    lastShot=dataUrl; ident=null; picked=-1; hint=ctx||'';
    document.getElementById('mcImg').src=dataUrl;
    document.getElementById('mcEmpty').style.display='none';
    document.getElementById('mcPreview').style.display='block';
    document.getElementById('mcResult').style.display='none';
    document.getElementById('mcPick').style.display='block';
    identifyShot(dataUrl);
    /* Wired here rather than on the file input so the live-camera path
       gets backed up too - both routes land in accept(). */
    try{ if(window.KovaMedia) KovaMedia.attach('machine', dataUrl,
      { name:'machine-scan.jpg', ref:'machine' }); }catch(e){}
  }

  document.getElementById('mcSearch').oninput=function(){ q=this.value.toLowerCase(); paint(); };

  /* ---------- identification ---------- */
  function bannerEl(){
    var pick=document.getElementById('mcPick');
    var b=document.getElementById('mcIdent');
    if(!b){
      b=document.createElement('div');
      b.id='mcIdent';
      pick.insertBefore(b,pick.firstChild);
    }
    return b;
  }

  function identifyShot(dataUrl,fitted){
    /* p28: shrunk to a real JPEG first (server limit, and the label matches) */
    if(!fitted&&window.KovaModel&&KovaModel.fit&&/^data:image\//.test(dataUrl||'')){ KovaModel.fit(dataUrl).then(function(d){ identifyShot(d,true); }); return; }
    var b=bannerEl();

    if(!window.KovaModel||!KovaModel.connected()){
      /* the one action that fixes this, made impossible to miss */
      b.innerHTML='<div class="card" style="margin-top:0;border-color:var(--acc-brd);'
        +'background:linear-gradient(150deg,var(--acc-bg),rgba(255,255,255,.03))">'
        +'<div class="lbl" style="color:var(--acc)">PHOTO SAVED \u00b7 NOT READ</div>'
        +'<div style="font-size:14px;font-weight:600;margin-top:5px">Sign in and Kova reads it for you</div>'
        +'<div class="sub" style="margin-top:5px;line-height:1.5">Signed in, Kova\u2019s AI names the equipment in every photo, video or link, free. '
        +'Until then, find it below: each one has a picture and what it looks like.</div>'
        +'<button class="btn" id="mcConnect" style="margin-top:12px">Sign in</button></div>';
      paint();
      document.getElementById('mcConnect').onclick=function(){ go('settings'); };
      return;
    }

    b.innerHTML='<div class="card" style="margin-top:0"><div class="sub">Reading the photo\u2026</div></div>';
    paint();

    /* ---- the contract -------------------------------------------------
       Two jobs in one call. First, try to match the photo against the
       curated catalogue — those entries carry muscle attributions and
       execution cues written against standard references, which is better
       data than anything generated per request, so a match always wins.
       Second, when nothing matches, describe the machine from scratch so
       the long tail stops dead-ending at "not listed".

       confidence and the "not sure" path are load-bearing, not decoration.
       Without them, a model that cannot tell what it is looking at is still
       forced to name a machine and assign muscles to it — and this output
       feeds injury-avoidance cues.                                      */
    var names=M.map(function(m){return m.n});
    var sys='You identify gym equipment from a photo. You are precise and factual. '
      +'Reply with JSON only, no prose, no markdown fences.\n'
      +'{"match":"<one allowed name, or NONE>","machine_name":"<exact name>",'
      +'"brand_detected":"<brand or Unknown>","confidence":0-100,'
      +'"seen":"<six words on what is visible>",'
      +'"alternatives":["<up to 3 other allowed names it could be, most likely first>"],'
      +'"primary_muscles":[],"secondary_muscles":[],'
      +'"setup_steps":[],"execution_cues":[],"common_mistakes":[["what","why it matters"]]}\n'
      +'Allowed names: '+names.join(' | ')+'\n'
      +'RULES\n'
      +'1. If the equipment is one of the allowed names, set match to that exact name and '
      +'leave the muscle, setup, cue and mistake arrays EMPTY. Those are already written.\n'
      +'2. If it is real equipment but not on the list, set match to "NONE", give the exact '
      +'machine name (for example "Plate-Loaded Linear Leg Press", "Selectorized Lying Leg '
      +'Curl"), and fill every array: 2-3 primary muscles, 2-4 secondary or stabilising '
      +'muscles, exactly 3 setup steps (seat or pad setting, then hand or foot placement and '
      +'bracing, then the movement path), 3-4 execution cues, and 2-3 common mistakes as '
      +'[what, why it matters].\n'
      +'2b. common_mistakes is never empty on a generated entry. If you are answering in a '
      +'shorter format that folds execution into the setup steps, still return the mistakes '
      +'array. Each entry names what goes wrong and the consequence, either as '
      +'[what, why it matters] or as one string joined by an em dash.\n'
      +'3. Read the brand only from a logo or badge actually visible in the photo. If you '
      +'cannot read one, use "Unknown". Never infer a brand from shape or colour.\n'
      +'4. If the machine supports several exercises (a functional trainer, a rack), describe '
      +'the configuration its attachments are currently set up for.\n'
      +'5. If it is free weights, match the tool (Dumbbells, Barbell and plates, Kettlebell), '
      +'never a machine. Weight plates or a loaded bar alone is "Barbell and plates". A number '
      +'display or weight stack belongs to whatever machine it sits on.\n'
      +'6. If you cannot tell exactly, still put your best allowed name in match with an honest '
      +'confidence, and list the next most likely allowed names in alternatives (always fill it '
      +'when confidence is under 70). Only when there is no gym equipment in the picture at all, '
      +'set match to "NONE", machine_name to "Not sure / not listed", confidence below 40 and '
      +'leave the arrays empty.\n'
      +'6b. The picture may be a 2x2 grid of four moments from one video, a video thumbnail or '
      +'a screenshot, and a person may be using the equipment: name the equipment they use. A '
      +'title or caption given with it is strong evidence.\n'
      +'7. Be objective. No motivational language, no general fitness advice.';

    var c=KovaModel.cfg(), P=KovaModel.providers[c.p];
    var b64=dataUrl.slice(dataUrl.indexOf(',')+1);
    var content = c.p==='anthropic'
      ? [{type:'image',source:{type:'base64',media_type:KovaModel.mime(dataUrl),data:b64}},
         {type:'text',text:'What equipment is this?'+(hint?' '+hint:'')}]
      : [{type:'text',text:'What equipment is this?'+(hint?' '+hint:'')},
         {type:'image_url',image_url:{url:dataUrl}}];

    /* same reasoning as the meal read: picking one name off a fixed list is
       a classification task. Token budget stays at 900 — the reply is one
       small object. */
    var req=P.build(c.key,c.model,sys,[{role:'user',content:content}],
                    {temperature:0});
    fetch(P.url,{method:'POST',headers:req.headers,body:req.body})
      .then(function(r){
        if(!r.ok) return r.text().then(function(t){ throw new Error(r.status+' '+t.slice(0,120)); });
        return r.json();
      })
      .then(function(data){
        identifyShot.__retry=0;
        var raw=(P.read(data)||'').replace(/```json|```/g,'').trim();
        var open=raw.indexOf('{'); if(open>0) raw=raw.slice(open);
        var parsed=JSON.parse(raw);

        var conf=+parsed.confidence||0;
        var brand=String(parsed.brand_detected||'').trim();
        if(/^unknown$/i.test(brand)) brand='';
        var match=String(parsed.match||'').trim();

        /* --- path 1: it is one of the curated entries. Vetted data wins. */
        var ix=-1;
        M.forEach(function(m,k){ if(m.n===match) ix=k; });
        /* p36: the next most likely, shown as pictures to tap */
        var alts=(Array.isArray(parsed.alternatives)?parsed.alternatives:[]).map(function(x){ return byName(String(x||'').trim()); })
          .filter(function(k,i,A){ return k>=0&&k!==ix&&A.indexOf(k)===i&&M[k].n!=='Not sure / not listed'; }).slice(0,3);
        if(ix>=0){
          gen=null;
          ident={i:ix,conf:conf,seen:String(parsed.seen||''),brand:brand,gen:false,alts:alts};
          renderIdent();
          return;
        }

        /* --- path 2: not on the list. Only render a generated entry if the
           model actually supplied the parts. A half-filled response is the
           "not sure" case wearing a machine name, and rendering it would put
           unvetted setup cues on screen with nothing marking them as such. */
        var g=buildGenerated(parsed);
        if(g){
          gen=g;
          ident={i:-1,conf:conf,seen:String(parsed.seen||''),brand:brand,gen:true,alts:alts,
                 name:g.n};
          renderIdent();
          return;
        }

        /* --- path 3: genuinely unidentified. Fall through to the curated
           "Not sure / not listed" entry, which carries generic safe advice. */
        var ns=-1;
        M.forEach(function(m,k){ if(m.n==='Not sure / not listed') ns=k; });
        gen=null;
        /* p36: never a dead end - the most likely one first, the others as pictures */
        if(alts.length) ident={i:alts[0],conf:Math.min(conf,60),seen:String(parsed.seen||''),brand:brand,gen:false,alts:alts.slice(1)};
        else ident={i:ns,conf:conf,seen:String(parsed.seen||''),brand:brand,gen:false,alts:[]};
        renderIdent();
      })
      .catch(function(e){
        /* one quiet retry for a dropped connection or a busy server */
        if(!identifyShot.__retry&&!/^4\d\d /.test(String(e&&e.message))){ identifyShot.__retry=1; setTimeout(function(){ identifyShot(dataUrl,true); },1200); return; }
        identifyShot.__retry=0;
        bannerEl().innerHTML='<div class="card mc-id" style="margin-top:0">'
          +'<div class="lbl" style="color:var(--acc)">NOT READ</div>'
          +'<div style="font-size:14px;font-weight:600;margin-top:4px">Kova could not read this one just now</div>'
          +'<div class="sub" style="line-height:1.5;margin-top:4px">'+(/^4\d\d /.test(String(e&&e.message))?'The picture could not be used. Try another photo, a short video or a link.':'The connection dropped. Try again, or find it below by how it looks.')+'</div>'
          +'<button class="btn" data-mc="retry" style="margin-top:10px">Try again</button></div>';
        paint();
      });
  }

  /* Turns a model response into an entry show() can render, or null if the
     response does not carry enough to be worth showing. Returning null is
     the right answer far more often than it feels like it should be: a
     generated entry with two setup steps and no muscles is not a thinner
     version of a catalogue entry, it is a guess. */
  function buildGenerated(p){
    function strs(v,max){
      if(!Array.isArray(v)) return [];
      return v.map(function(x){
                /* Prompts that show "Step 1: ..." in their template get it
                   back verbatim, and steps() already draws its own numbered
                   circles — without this you render "1  Step 1: Adjust...". */
                return String(x||'').trim()
                        .replace(/^step\s*\d+\s*[:.)-]\s*/i,'')
                        .replace(/^\d+\s*[:.)]\s*/,'')
                        .trim();
              })
              .filter(function(x){ return x.length>2 && x.length<220; })
              .slice(0,max);
    }
    var name=String(p.machine_name||'').trim();
    if(!name || /^not sure/i.test(name)) return null;

    var pri=strs(p.primary_muscles,4);
    var sec=strs(p.secondary_muscles,5);
    var set=strs(p.setup_steps,4);
    var how=strs(p.execution_cues,5);

    /* The compact contract folds execution into the third setup step —
       adjust, then place and brace, then move. When a response arrives in
       that shape there are no execution cues to read, so split the last
       step off rather than rejecting an otherwise complete identification.
       Both contract shapes now land the same way. */
    if(!how.length && set.length>=3){
      how=set.slice(-1);
      set=set.slice(0,-1);
    }

    /* the floor: a name, what it trains, and how to set it up. Without all
       three there is nothing useful to draw. */
    if(!pri.length || set.length<2 || !how.length) return null;

    /* Mistakes arrive in whichever shape the contract that produced them
       used. The pair form is the documented one, but the compact 3-step
       contract emits plain strings, and some replies come back as objects.
       All three carry the same two facts - what goes wrong and why it
       matters - so all three are read rather than only the pair form.
       Anything that yields only a 'what' is dropped: a mistake with no
       consequence attached is a scold, not a cue. */
    function pair(row){
      if(Array.isArray(row)){
        var a=String(row[0]||'').trim(), b=String(row[1]||'').trim();
        return (a&&b)?[a,b]:null;
      }
      if(row && typeof row==='object'){
        var w=String(row.what||row.mistake||row.error||'').trim();
        var y=String(row.why||row.why_it_matters||row.reason||row.matters||'').trim();
        return (w&&y)?[w,y]:null;
      }
      var t=String(row||'').trim();
      if(t.length<6) return null;
      /* split on the first em/en dash, colon or ' - ' that has text on both
         sides. Ordinary hyphens inside words (lock-out, mid-rep) are left
         alone by requiring the surrounding spaces. */
      var m=t.match(/^(.{4,}?)\s*(?:\u2014|\u2013|:|\s-\s)\s*(.{4,})$/);
      if(m) return [m[1].trim().replace(/[.,;]$/,''), m[2].trim()];
      return null;
    }
    var miss=[];
    if(Array.isArray(p.common_mistakes)){
      p.common_mistakes.forEach(function(row){
        var pr=pair(row);
        if(pr) miss.push(pr);
      });
      miss=miss.slice(0,4);
    }

    return {n:name, kind:'fixed', pri:pri, sec:sec, set:set, how:how,
            miss:miss, gen:true};
  }

  function toBase64(f){
    return new Promise(function(res,rej){
      var fr=new FileReader();
      fr.onload=function(){
        var s=String(fr.result);
        res({mime:f.type||'image/jpeg', b64:s.slice(s.indexOf(',')+1)});
      };
      fr.onerror=rej;
      fr.readAsDataURL(f);
    });
  }

  function renderIdent(){
    var m = ident.gen ? gen : M[ident.i], sure=ident.conf>=70, alts=(ident.alts||[]).filter(function(k){ return k!==ident.i; });
    var none=!ident.gen&&m&&m.n==='Not sure / not listed';
    var h='<div class="card mc-id" style="margin-top:0;border-color:var(--acc-brd)">';
    if(none){
      h+='<div class="lbl" style="color:var(--acc)">NOT SURE YET</div>'
        +'<div class="title-s" style="font-size:17px;margin-top:3px">Kova could not tell from this picture</div>'
        +(ident.seen?'<div class="sub" style="margin-top:3px">Saw: '+ident.seen+'</div>':'')
        +'<div class="sub" style="margin-top:6px;line-height:1.5">Step back so the whole machine is in, from the side, with the seat and handles showing. Or find it below: each one has a picture.</div>'
        +'<button class="btn" data-mc="again" style="margin-top:12px">Take another photo</button>';
    } else {
      h+='<div class="lbl" style="color:var(--acc)">'+(sure?'IDENTIFIED':'BEST GUESS')+'</div>'
        +'<div class="mc-top">'+(ident.gen?'':pic(m,'mc-big'))+'<div style="min-width:0"><div class="title-s" style="font-size:18px;margin-top:3px">'+m.n+'</div>'
        +(look(m)?'<div class="sub" style="margin-top:3px;line-height:1.45">'+look(m)+'</div>':'')+'</div></div>'
        +(ident.brand?'<div class="sub" style="margin-top:6px">Brand: '+ident.brand+'</div>':'')
        +(ident.seen?'<div class="sub" style="margin-top:3px">Saw: '+ident.seen+'</div>':'')
        +'<div class="sub" style="margin-top:6px;font-size:10.5px">Confidence '+ident.conf+'%.'
        +(sure?'':' Check it against the pictures'+(alts.length?' here':' below')+'.')+'</div>'
        +'<button class="btn" id="mcConfirm" style="margin-top:12px">'+(sure?'Yes, that is it':'Yes, it is this one')+'</button>';
    }
    if(alts.length){
      h+='<div class="lbl" style="margin-top:14px">'+(none?'IT MIGHT BE':'OR IT COULD BE')+'</div><div class="mc-alts">'
        +alts.map(function(k){ var a=M[k]; return '<button type="button" class="mc-alt" data-mc="alt" data-i="'+k+'">'+pic(a)+'<b>'+a.n+'</b><small>'+look(a)+'</small></button>'; }).join('')+'</div>';
    }
    h+='</div>';
    var b=bannerEl(); b.innerHTML=h; mountPics(b);
    paint();
    var c=document.getElementById('mcConfirm'); if(c) c.onclick=function(){ picked=ident.i; show(); };
    /* a confident read with nothing close should not make you tap twice */
    if(sure&&!alts.length){ picked=ident.i; show(); }
  }

  function paint(){
    var rows=M.map(function(m,i){return {m:m,i:i}}).filter(function(r){
      if(!q) return true;
      return (r.m.n+' '+r.m.k+' '+look(r.m)).toLowerCase().indexOf(q)>-1;
    });
    var L=document.getElementById('mcList');
    L.innerHTML = rows.length? rows.map(function(r){
      var sub = r.m.kind==='open'
        ? 'Trains what you do with it'
        : (r.m.pri.join(', ')||'—');
      return '<div class="qopt mcopt" data-i="'+r.i+'" role="button" tabindex="0">'+pic(r.m)
        +'<div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600;color:var(--txt,#FFFFFF)">'+r.m.n+'</div>'
        +(look(r.m)?'<div class="li-sub mc-look">'+look(r.m)+'</div>':'')
        +'<div class="li-sub">'+sub+'</div></div></div>';
    }).join('') : '<div class="sub" style="padding:6px 2px">No match. Pick "Not sure / not listed".</div>';
    mountPics(L);
    L.querySelectorAll('.mcopt').forEach(function(e){
      e.onclick=function(){ gen=null; picked=+e.dataset.i; show(); };
    });
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('#s-machine [data-mc]'); if(!b) return;
    var a=b.getAttribute('data-mc');
    if(a==='alt'){ gen=null; picked=+b.getAttribute('data-i'); show(); return; }
    if(a==='again'){ drop.click(); return; }
    if(a==='retry'){ if(lastShot){ identifyShot.__retry=0; identifyShot(lastShot,true); } return; }
    if(a==='upload'){ up.click(); return; }
    if(a==='link'){ linkSheet(); return; }
  });

  /* ---------- p36: a photo or a video from the phone, or a link ---------- */
  var up=document.createElement('input'); up.type='file'; up.accept='image/*,video/*'; up.style.display='none'; up.id='mcUp';
  drop.parentNode.insertBefore(up,drop.nextSibling);
  var ways=document.createElement('div'); ways.className='mc-ways';
  ways.innerHTML='<button type="button" class="chip" data-mc="upload"><svg class="ic"><use href="#i-video"/></svg>Photo or video</button>'
    +'<button type="button" class="chip" data-mc="link"><svg class="ic"><use href="#i-arrow-up-right"/></svg>Paste a link</button>';
  drop.parentNode.insertBefore(ways,up);
  up.onchange=function(){
    var f=this.files&&this.files[0]; this.value=''; if(!f) return;
    if(/^video\//.test(f.type)){ fromVideo(f); return; }
    var fr=new FileReader(); fr.onload=function(){ accept(String(fr.result)); }; fr.readAsDataURL(f);
  };
  /* four moments of the clip in one picture (2 x 2), so the model sees the movement */
  function sheet4(stills){
    return Promise.all(stills.slice(0,4).map(function(u){ return new Promise(function(ok){ var im=new Image(); im.onload=function(){ ok(im); }; im.onerror=function(){ ok(null); }; im.src=u; }); }))
      .then(function(ims){
        ims=ims.filter(Boolean); if(!ims.length) return null;
        var S=384, c=document.createElement('canvas'); c.width=S*2; c.height=S*2;
        var x=c.getContext('2d'); x.fillStyle='#000'; x.fillRect(0,0,c.width,c.height);
        ims.forEach(function(im,i){ var k=Math.min(S/im.width,S/im.height), w=im.width*k, h=im.height*k; x.drawImage(im,(i%2)*S+(S-w)/2,Math.floor(i/2)*S+(S-h)/2,w,h); });
        return c.toDataURL('image/jpeg',0.82);
      });
  }
  function fromVideo(f){
    var b=bannerEl(); document.getElementById('mcPick').style.display='block';
    b.innerHTML='<div class="card" style="margin-top:0"><div class="sub">Taking four moments from the video…</div></div>';
    var grab=window.KovaLook&&KovaLook.videoStills?KovaLook.videoStills(f):Promise.resolve([]);
    grab.then(function(st){ return st&&st.length?sheet4(st):null; }).then(function(img){
      if(!img){ b.innerHTML='<div class="card mc-id" style="margin-top:0"><div class="sub" style="line-height:1.5">Kova could not open that video on this phone. Try a photo, or a screenshot from the video.</div></div>'; return; }
      accept(img,'This is a 2x2 grid of four moments from one video.');
    });
  }
  function linkSheet(){
    if(!window.openSheet) return;
    openSheet('<div class="mc-link"><div class="title-s" style="font-size:17px">Paste a link</div>'
      +'<div class="sub" style="margin:4px 0 10px;line-height:1.5">A YouTube, TikTok or Instagram video, or any page with a picture of the machine. Kova reads its picture and title.</div>'
      +'<input class="srch" id="mcUrl" inputmode="url" autocomplete="off" placeholder="https://youtube.com/..." style="width:100%"/>'
      +'<button class="btn" id="mcUrlGo" style="margin-top:10px;width:100%">Read this link</button><div class="sub" id="mcUrlMsg" style="margin-top:8px"></div></div>');
    var inp=document.getElementById('mcUrl'), go2=document.getElementById('mcUrlGo'), msg=document.getElementById('mcUrlMsg');
    try{ inp.focus(); }catch(e){}
    go2.onclick=function(){
      var u=String(inp.value||'').trim(); if(!/^https?:\/\/\S+\.\S+/.test(u)){ msg.textContent='That does not look like a link. It starts with https://'; return; }
      if(!(window.KovaLink&&KovaLink.authFetch)||!(window.KovaModel&&KovaModel.connected())){ msg.textContent='Sign in first: reading a link uses Kova’s AI.'; return; }
      go2.disabled=true; msg.textContent='Reading the link…';
      KovaLink.authFetch('/scan/link',{json:{url:u}}).then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j&&j.error||'That link could not be read.'); return j; }); })
        .then(function(j){
          if(!j.image){ throw new Error('That link has no picture Kova can read. Try a screenshot of the video.'); }
          if(window.closeSheet) closeSheet();
          document.getElementById('mcImg').src=j.image;
          accept(j.image,(j.title?'It comes from '+(j.site||'a page')+' titled "'+String(j.title).slice(0,140)+'".':'')+(j.text?' Description: '+String(j.text).slice(0,200):''));
        })
        .catch(function(e){ go2.disabled=false; msg.textContent=String(e&&e.message||e).slice(0,160); });
    };
  }

  /* ---------- result ---------- */
  function steps(list,accent){
    return list.map(function(c,i){
      return '<div style="display:flex;gap:9px;padding:7px 0;border-top:'+(i?'.5px solid rgba(255,255,255,.08)':'none')+'">'
        +'<div style="width:19px;height:19px;border-radius:50%;background:'+(accent?'var(--acc-dim)':'rgba(255,255,255,.12)')
        +';color:'+(accent?'var(--acc)':'#FFFFFF')+';font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(i+1)+'</div>'
        +'<div style="font-size:11.5px;line-height:1.4;color:var(--txt,#FFFFFF)">'+c+'</div></div>';
    }).join('');
  }
  function mistakes(list){
    return list.map(function(f,i){
      return '<div style="padding:9px 0;border-top:'+(i?'.5px solid rgba(255,255,255,.08)':'none')+'">'
        +'<div style="display:flex;align-items:center;gap:7px"><span style="width:6px;height:6px;border-radius:50%;background:var(--warn)"></span>'
        +'<span style="font-size:12px;font-weight:600;color:var(--txt,#FFFFFF)">'+f[0]+'</span></div>'
        +'<div style="font-size:10.5px;color:var(--ink-2,rgba(255,255,255,.85));line-height:1.4;margin-top:4px;padding-left:13px">'+f[1]+'</div></div>';
    }).join('');
  }
  function startCard(rx){
    return '<div class="card"><div style="font-size:12px;font-weight:700;margin-bottom:9px">Where to start</div>'
      +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">'
      +[['SETS',rx.s],['REPS',rx.r],['REST',rx.rest]].map(function(x){
        return '<div style="text-align:center"><div class="lbl">'+x[0]+'</div><div style="font-size:13px;font-weight:600;color:var(--acc);margin-top:3px">'+x[1]+'</div></div>';
      }).join('')+'</div>'
      +'<div class="sub" style="margin-top:10px;padding-top:9px;border-top:.5px solid rgba(255,255,255,.10);line-height:1.45">Pick a weight you can finish the full rep range with. If your form breaks before the last rep, it is too heavy.</div></div>';
  }
  function foldCard(title,inner){
    var id='fold'+Math.random().toString(36).slice(2,7);
    return '<div class="card" style="padding:0;overflow:hidden">'
      +'<div class="exp-btn foldhd" data-t="'+id+'" style="margin:0;border:0;background:none">'
      +'<div style="flex:1"><div class="li-name">'+title+'</div></div>'
      +'<svg class="ic exp-chev" style="font-size:15px;transition:transform .2s"><use href="#i-chevron-down"/></svg></div>'
      +'<div class="exp-body" id="'+id+'"><div style="padding:0 16px 14px">'+inner+'</div></div></div>';
  }
  function bindFolds(root){
    root.querySelectorAll('.foldhd').forEach(function(b){
      b.onclick=function(){
        var body=document.getElementById(b.dataset.t);
        var open=!body.classList.contains('open');
        body.classList.toggle('open',open);
        b.classList.toggle('open',open);
      };
    });
  }

  function show(){
    var m = gen || M[picked];
    var GM=(window.KovaGoal&&KovaGoal.id())?KovaGoal.machine(m,ident):'';
    var h='<div class="card card-lg" style="border-color:var(--acc-brd);background:linear-gradient(150deg,var(--acc-bg),rgba(255,255,255,.03))">'
      +'<div class="lbl" style="color:var(--acc)">'+(m.kind==='open'?'EQUIPMENT':'MACHINE')+'</div>'
      +'<div class="title-s" style="font-size:20px;margin-top:3px">'+m.n+'</div>'
      +((m.gen&&ident&&ident.brand)?'<div class="sub" style="margin-top:3px">'+ident.brand+'</div>':'')
      +'<div class="sub" style="margin-top:4px">'
      +(m.kind==='open'
        ? 'A tool, not a movement. What it trains depends on what you do with it.'
        : 'Fixed path, so it trains the same muscles every time.')
      +'</div></div>';

    /* The one piece of UI that separates this from the curated entries.
       Everything below on a generated card was written by a vision model
       from one photo, and it is about how to load a joint — so it says so,
       above the content rather than buried under it. */
    if(m.gen){
      h+='<div class="card" style="border-color:var(--warn-brd,rgba(244,225,142,.3));'
        +'background:rgba(244,225,142,.06)">'
        +'<div class="lbl" style="color:var(--warn)">READ BY A MODEL &middot; NOT VETTED</div>'
        +'<div class="sub" style="margin-top:5px;line-height:1.5">This machine is not one of '
        +'the '+M.length+' Kova has written up, so the muscles and cues below were generated '
        +'from your photo rather than checked against a reference. Treat them as a starting '
        +'point, and check the placard on the frame before you load it.</div></div>';
    }

    if(m.kind==='open'){
      var moves=movesFor(m.eq);
      var groups={};
      moves.forEach(function(x){
        var g=REGION[x.m]||'Other';
        (groups[g]=groups[g]||[]).push(x);
      });
      var keys=Object.keys(groups);
      var CAP=5;

      h+='<div class="card"><div style="font-size:12px;font-weight:700;margin-bottom:3px">What it can train</div>'
        +'<div class="sub" style="margin-bottom:10px">Pick a movement to see the muscles it works.</div>'
        +(keys.length
          ? keys.map(function(g){
              var all=groups[g], head=all.slice(0,CAP), rest=all.slice(CAP);
              return '<div class="lbl" style="margin:10px 0 6px">'+g.toUpperCase()+'</div>'
                +'<div style="display:flex;flex-wrap:wrap;gap:6px" data-g="'+g+'">'
                + head.concat(rest).map(function(x,ix){
                    return '<div class="chip mcMove'+(ix>=CAP?' mcHide':'')+'" data-n="'+x.n+'" data-m="'+x.m
                      +'" style="font-size:10.5px'+(ix>=CAP?';display:none':'')+'">'+x.n+'</div>';
                  }).join('')
                + (rest.length
                    ? '<div class="chip mcMore" data-g="'+g+'" style="font-size:10.5px;opacity:.7">+'
                      +rest.length+' more</div>'
                    : '')
                +'</div>';
            }).join('')
          : '<div class="sub">No movements listed for this yet.</div>')
        +'</div>'
        +'<div id="mcMoveOut"></div>';
    }else{
      h+='<div class="card"><div style="font-size:12px;font-weight:700;margin-bottom:9px">Muscles it works</div>'
        +'<div class="lbl" style="margin-bottom:5px">PRIMARY</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:'+(m.sec.length?'10px':'0')+'">'
        +m.pri.map(function(x){return '<div class="chip on" style="background:var(--acc-bg);border-color:var(--acc-brd);color:var(--acc);font-weight:600">'+x+'</div>'}).join('')
        +'</div>'
        +(m.sec.length?'<div class="lbl" style="margin-bottom:5px">ALSO WORKING</div>'
          +'<div style="display:flex;flex-wrap:wrap;gap:6px">'
          +m.sec.map(function(x){return '<div class="chip">'+x+'</div>'}).join('')+'</div>':'')
        +'</div>';
    }

    h+=foldCard('Set it up first', steps(m.set,false))
      +foldCard('How to use it', steps(m.how,true))
      +((m.miss&&m.miss.length)?foldCard('Common mistakes', mistakes(m.miss)):'')
      /* No sets/reps prescription on a generated entry. The curated rx
         values are programming decisions per machine; inventing one from a
         photo would be the least grounded thing on the card. */
      /* p29: sets, reps and rest follow your goal (src/p08_goal.js) */
      +(GM||((m.gen
        ? '<div class="card"><div style="font-size:12px;font-weight:700;margin-bottom:5px">Where to start</div>'
          +'<div class="sub" style="line-height:1.5">No set and rep guidance for this one, '
          +'since Kova has not verified the machine. Start light enough to complete every rep '
          +'with the form above, and stop if a joint hurts rather than a muscle burning.</div></div>'
        : startCard(m.rx))+(window.KovaGoal?KovaGoal.machine(m,ident):'')))
      +(m.cardio?'':'<button class="btn" id="mcAdd" style="margin-top:4px"><svg class="ic"><use href="#i-plus"/></svg>Add to my program</button>');

    var R=document.getElementById('mcResult');
    R.innerHTML=h; R.style.display='block';
    bindFolds(R);

    R.querySelectorAll('.mcMore').forEach(function(e){
      e.onclick=function(){
        e.parentElement.querySelectorAll('.mcHide').forEach(function(x){ x.style.display=''; });
        e.remove();
      };
    });

    R.querySelectorAll('.mcMove').forEach(function(e){
      e.onclick=function(){
        R.querySelectorAll('.mcMove').forEach(function(x){x.classList.remove('on')});
        e.classList.add('on');
        document.getElementById('mcMoveOut').innerHTML=
          '<div class="card" style="border-color:var(--acc-brd)">'
          +'<div class="lbl" style="color:var(--acc)">'+e.dataset.n.toUpperCase()+'</div>'
          +'<div style="font-size:12px;font-weight:700;margin:6px 0 8px">Works your '+e.dataset.m.toLowerCase()+'</div>'
          +'<div class="sub" style="line-height:1.5">Same '+m.n.toLowerCase()+', different movement, different muscle. '
          +'That is why the tool on its own does not have an answer.</div></div>';
      };
    });

    /* p29: it really adds it to the right day of your plan (it used to only say so) */
    var mcAdd=document.getElementById('mcAdd');
    if(mcAdd) mcAdd.onclick=function(){ if(window.KovaGoal) KovaGoal.machineAdd(m); else toast('Still loading. Try again in a second.'); };
    R.scrollIntoView({behavior:'smooth',block:'start'});
  }

  paint();
  window.__mcPaint=paint;
})();
