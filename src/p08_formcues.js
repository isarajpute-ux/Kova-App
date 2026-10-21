/* =====================================================================
   KovaFormCues - "how do I do this one?" on every exercise (p26).

   A small (i) next to each exercise name in a workout and in your
   program opens a sheet: the muscles it works, 3 to 5 cues for doing it
   well, and the mistakes that cost results or hurt. Written for the 30
   lifts people do most; anything else says so and offers Form Check,
   which reviews a clip of you doing it. No video, so nothing to load.
   Dark, soft light and light glass.
   ===================================================================== */
window.KovaFormCues=(function(){
  'use strict';
  /* [match, name, primary, also, cues, mistakes] */
  var L=[
    [/romanian|\brdl\b/i,'Romanian deadlift','Hamstrings, glutes','Lower back, grip',
      ['Soft bend in the knees, then keep it fixed','Push the hips back, as if closing a car door with them','Bar stays close, sliding down the thighs','Stop when the hamstrings stop stretching, usually just below the knee','Squeeze the glutes to stand tall'],
      ['Rounding the lower back to reach lower','Bending the knees more as you go, which turns it into a squat','Letting the bar drift away from the legs']],
    [/bulgarian|split squat/i,'Bulgarian split squat','Quads, glutes','Adductors, core',
      ['Back foot laces-down on the bench','Front foot far enough forward that the heel stays down','Drop the back knee straight down','Drive through the whole front foot to stand'],
      ['Standing too close to the bench, so the knee pushes far forward and the heel lifts','Wobbling knee: slow down and keep it over the toes']],
    [/hack squat/i,'Hack squat','Quads','Glutes',
      ['Back and hips flat on the pad','Feet shoulder width, mid-platform','Lower under control until thighs are at least parallel','Push through the mid-foot without locking the knees hard'],
      ['Heels lifting off the platform','Cutting the depth short when the weight goes up']],
    [/front squat/i,'Front squat','Quads, glutes','Upper back, core',
      ['Bar on the front of the shoulders, elbows high','Big breath and brace before you go down','Sit straight down between the heels','Keep the elbows up as you stand'],
      ['Elbows dropping, so the bar rolls forward','Rounding the upper back']],
    [/squat/i,'Squat','Quads, glutes','Adductors, lower back, core',
      ['Brace before you go down: big breath into the belly','Push the knees out in line with the toes','Hips and knees bend together','Keep the weight over the middle of the foot','Stand up by pushing the floor away'],
      ['Knees caving in','Heels lifting off the floor','Chest folding forward out of the bottom']],
    [/good morning/i,'Good morning','Hamstrings, lower back','Glutes',
      ['Bar on the upper back, like a squat','Soft knees, then push the hips back','Keep the back flat the whole way','Go only as low as you can keep it flat'],
      ['Rounding the back','Using a weight that is too heavy: this one is for control']],
    [/hip thrust|glute bridge/i,'Hip thrust','Glutes','Hamstrings, quads',
      ['Shoulder blades on the bench edge, bar over the hip crease (use a pad)','Feet flat, shins vertical at the top','Chin tucked, ribs down','Drive the hips up until they are in line with the knees and shoulders, squeeze for a second'],
      ['Arching the lower back at the top instead of squeezing the glutes','Feet too far out, so the hamstrings take over']],
    [/deadlift/i,'Deadlift','Hamstrings, glutes, back','Grip, lats, quads',
      ['Bar over the middle of the foot','Grip just outside the legs, shins touch the bar','Pull the slack out of the bar before it leaves the floor','Push the floor away; hips and shoulders rise together','Stand tall, do not lean back'],
      ['Rounding the lower back','Hips shooting up first','Bar drifting away from the legs']],
    [/incline.*(press|bench)/i,'Incline press','Upper chest, front shoulders','Triceps',
      ['Bench at 30 to 45 degrees','Shoulder blades pulled back and down','Lower to the upper chest, elbows about 45 degrees from the body','Press up and slightly back'],
      ['Bench set too steep, so it becomes a shoulder press','Elbows flared straight out to the sides']],
    [/bench press|chest press/i,'Bench press','Chest','Front shoulders, triceps',
      ['Eyes under the bar, shoulder blades pinched back and down','Feet planted, slight arch in the upper back','Lower to the lower chest, elbows about 45 degrees from the body','Press up and slightly back over the shoulders'],
      ['Bouncing the bar off the chest','Elbows flared straight out, which strains the shoulders','Hips lifting off the bench']],
    [/arnold/i,'Arnold press','Shoulders','Triceps, upper chest',
      ['Start with palms facing you at chin height','Rotate the palms forward as you press up','Finish with the weights over the shoulders','Reverse the turn on the way down'],
      ['Arching the lower back to finish the rep','Rushing the turn']],
    [/overhead press|shoulder press|military/i,'Overhead press','Shoulders','Triceps, upper chest, core',
      ['Squeeze glutes and abs so the ribs stay down','Bar starts on the front of the shoulders','Move the head back slightly, then forward as the bar passes','Finish with the arms by the ears'],
      ['Leaning back and turning it into a standing incline press','Pressing the bar out in front instead of straight up']],
    [/chin.?up/i,'Chin-up','Lats, biceps','Upper back',
      ['Palms facing you, hands shoulder width','Start from a dead hang with the shoulders engaged','Pull the elbows down to the ribs','Chin over the bar, then lower all the way'],
      ['Half reps that never reach a full hang','Swinging to get up']],
    [/pull.?up/i,'Pull-up','Lats','Biceps, upper back, grip',
      ['Hands just outside the shoulders, palms away','Start each rep from a dead hang','Pull the elbows down and back toward the hips','Chest toward the bar; lower under control'],
      ['Kicking or swinging for momentum','Shrugging the shoulders up to the ears']],
    [/lat pull.?down|pulldown/i,'Lat pulldown','Lats','Biceps, upper back',
      ['Thighs locked under the pads','Lean back slightly','Pull the bar to the upper chest, elbows down to the sides','Let it rise under control until the arms are straight'],
      ['Leaning far back and rowing the weight down','Pulling behind the neck']],
    [/dumbbell row|one.?arm row|db row/i,'Dumbbell row','Lats, upper back','Rear shoulders, biceps',
      ['Hand and knee on the bench, back flat','Let the weight hang straight down','Pull the elbow toward the hip','Pause at the top, lower slowly'],
      ['Twisting the torso to lift it','Pulling with the hand instead of the elbow']],
    [/cable row|seated row/i,'Seated cable row','Upper back, lats','Rear shoulders, biceps',
      ['Sit tall, chest up, slight bend in the knees','Pull the handle to the lower ribs','Squeeze the shoulder blades together at the end','Let the arms straighten without rounding forward'],
      ['Rocking the torso back and forth to move the weight','Shrugging the shoulders up']],
    [/barbell row|bent.?over row|pendlay|\brow\b/i,'Barbell row','Upper back, lats','Rear shoulders, biceps, lower back',
      ['Hinge until the torso is about 45 degrees, back flat','Grip a little wider than the shoulders','Pull the bar to the lower ribs','Lower under control; keep the torso still'],
      ['Standing up as you pull, so the hips do the work','Rounding the back']],
    [/face pull/i,'Face pull','Rear shoulders, upper back','Rotator cuff',
      ['Rope at face height, thumbs toward you','Pull toward the eyes, hands apart','Finish with the elbows high and the hands beside the ears','Squeeze for a second'],
      ['Too heavy, so you lean back and row it','Elbows dropping below the hands']],
    [/lateral raise|side raise/i,'Lateral raise','Side shoulders','Upper traps',
      ['Slight bend in the elbows, fixed','Raise out to the sides, leading with the elbows','Stop at shoulder height','Lower slowly, about 2 seconds'],
      ['Swinging the body to move the weight','Shrugging the shoulders up']],
    [/leg press/i,'Leg press','Quads, glutes','Hamstrings',
      ['Back and hips flat on the seat','Feet shoulder width, mid-platform','Lower until the knees are near 90 degrees, hips still down','Push through the whole foot without locking the knees hard'],
      ['Lower back lifting off the pad at the bottom','Knees caving in']],
    [/leg curl|hamstring curl/i,'Leg curl','Hamstrings','Calves',
      ['Knees in line with the machine pivot','Pad just above the heels','Curl all the way, squeeze for a second','Lower slowly'],
      ['Hips lifting off the pad','Letting the weight drop on the way back']],
    [/leg extension/i,'Leg extension','Quads','',
      ['Knee in line with the machine pivot','Pad on the lower shin','Straighten fully and squeeze the thighs','Lower slowly over 2 to 3 seconds'],
      ['Kicking the weight up with momentum','Lifting the hips off the seat']],
    [/lunge/i,'Lunge','Quads, glutes','Adductors, hamstrings',
      ['Step far enough that both knees bend to about 90 degrees','Drop the back knee straight down','Front heel stays down','Push through the front foot to come back'],
      ['Front knee caving in','Short steps that put all the strain on the front knee']],
    [/tricep|skull ?crusher|pushdown|french press/i,'Triceps extension','Triceps','',
      ['Keep the upper arms still','Lower until the elbows are fully bent','Straighten fully and squeeze','Control the way down'],
      ['Elbows flaring out','Swinging the upper arms to move the weight']],
    [/curl/i,'Biceps curl','Biceps','Forearms',
      ['Elbows pinned to your sides','Curl up without moving the shoulders','Squeeze at the top','Lower all the way, slowly'],
      ['Swinging the body to lift the weight','Half reps that never straighten the arm']],
    [/fly|flye|pec deck/i,'Cable fly','Chest','Front shoulders',
      ['Slight fixed bend in the elbows','Open wide until you feel a stretch across the chest','Bring the hands together in an arc, as if hugging a tree','Squeeze for a second'],
      ['Bending the elbows and turning it into a press','Going so wide the shoulders strain']],
    [/box jump/i,'Box jump','Quads, glutes, calves','Hamstrings',
      ['Stand close, feet hip width','Swing the arms back, then up as you jump','Land softly with both feet, knees bent','Step down; do not jump down'],
      ['A box so high you land in a deep squat','Knees caving on landing']],
    [/kettlebell swing|kb swing/i,'Kettlebell swing','Glutes, hamstrings','Core, grip, shoulders',
      ['It is a hinge, not a squat: push the hips back','Hike the bell back between the legs','Snap the hips forward to float the bell to chest height','Let it fall and hinge again'],
      ['Lifting with the arms','Squatting it instead of hinging','Leaning back at the top']],
    [/plank/i,'Plank','Core','Shoulders, glutes',
      ['Elbows under the shoulders','Squeeze the glutes and pull the ribs down','Body in one straight line from head to heels','Breathe slowly; stop when the form goes'],
      ['Hips sagging toward the floor','Hips piked high']],
    [/push.?up|press.?up/i,'Push-up','Chest, triceps','Front shoulders, core',
      ['Hands just wider than the shoulders','Body in one line, glutes and abs tight','Lower until the chest is near the floor, elbows about 45 degrees','Push the floor away'],
      ['Hips sagging','Elbows flared straight out','Half reps']],
    [/\bdips?\b/i,'Dip','Chest, triceps','Front shoulders',
      ['Lock the arms at the top, shoulders down','Lean slightly forward for more chest, upright for more triceps','Lower until the upper arms are about level with the floor','Push back up to straight arms'],
      ['Going so deep the shoulders roll forward and hurt','Shrugging the shoulders up']]
  ];
  function find(name){ name=String(name||''); for(var i=0;i<L.length;i++) if(L[i][0].test(name)) return L[i]; return null; }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function html(name){
    var f=find(name);
    var h='<div class="kfc"><div class="kfc-h"><div><b>'+esc(name)+'</b>'+(f&&f[1].toLowerCase()!==String(name).toLowerCase()?'<span>How to do it, as a '+esc(f[1].toLowerCase())+'</span>':'<span>How to do it</span>')+'</div>'
      +'<button type="button" class="kfc-x" data-kfc="x" aria-label="Close">×</button></div>';
    if(!f) return h+'<p class="kfc-none">There are no written cues for this exercise yet. Form Check can look at a clip of you doing it and tell you what to fix.</p>'
      +'<button type="button" class="btn kfc-go" data-kfc="fc">Open Form Check</button></div>';
    h+='<div class="kfc-mus"><span class="on">'+esc(f[2])+'</span>'+(f[3]?'<span>'+esc(f[3])+'</span>':'')+'</div>'
      +'<div class="kfc-l">How to do it</div><ol class="kfc-cues">'+f[4].map(function(c){ return '<li>'+esc(c)+'</li>'; }).join('')+'</ol>'
      +'<div class="kfc-l">Common mistakes</div><ul class="kfc-mis">'+f[5].map(function(c){ return '<li>'+esc(c)+'</li>'; }).join('')+'</ul>'
      +'<button type="button" class="btn ghost kfc-go" data-kfc="fc">Check my form on video</button></div>';
    return h;
  }
  function open(name){
    /* p32: the exercise page (moving picture, muscles, history, stretches) when it has loaded */
    if(window.KovaExPage&&KovaExPage.open(name)) return;
    if(!window.openSheet) return;
    openSheet(html(name));
    try{ if(window.KovaAnalytics) KovaAnalytics.track('form_cues',{has:!!find(name)}); }catch(e){}
  }
  document.addEventListener('click',function(ev){
    var b=ev.target.closest&&ev.target.closest('[data-exinfo]');
    if(b){ ev.preventDefault(); ev.stopPropagation(); open(b.getAttribute('data-exinfo')); return; }
    var k=ev.target.closest&&ev.target.closest('[data-kfc]'); if(!k) return;
    var a=k.getAttribute('data-kfc');
    if(window.closeSheet) closeSheet();
    if(a==='fc'){ try{ go('formcheck'); }catch(e){} }
  },true);
  return {find:find,open:open,html:html,count:L.length};
})();
