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
      ['Bend your knees a little, then keep them still','Push your butt back, like closing a door with it','Slide the bar down your legs','Stop when the backs of your legs feel stretched','Squeeze your butt to stand up'],
      ['Rounding your back','Bending your knees more and more','Letting the bar float away from your legs']],
    [/bulgarian|split squat/i,'Bulgarian split squat','Quads, glutes','Adductors, core',
      ['Back foot on the bench, laces down','Step your front foot far out','Go straight down until your back knee almost touches','Push through your front heel to stand'],
      ['Standing too close to the bench','Leaning way forward','Pushing off with your back foot']],
    [/hack squat/i,'Hack squat','Quads','Glutes',
      ['Back flat on the pad','Feet shoulder width on the plate','Sit down slowly until your thighs are flat','Push the plate away to stand'],
      ['Heels coming up','Only going half way down','Locking your knees hard at the top']],
    [/front squat/i,'Front squat','Quads, glutes','Upper back, core',
      ['Rest the bar on the front of your shoulders','Keep your elbows up high','Big breath, then sit straight down','Stand up with your chest tall'],
      ['Elbows dropping down','Rounding your upper back']],
    [/squat/i,'Squat','Quads, glutes','Adductors, lower back, core',
      ['Big breath, tight belly','Sit back and down, like into a chair','Knees point the same way as your toes','Push the floor away to stand up'],
      ['Knees falling inward','Heels coming up','Chest falling forward']],
    [/good morning/i,'Good morning','Hamstrings, lower back','Glutes',
      ['Bar on your upper back','Knees a little bent','Push your butt back and tip forward','Squeeze your butt to stand up'],
      ['Rounding your back','Going too heavy']],
    [/hip thrust|glute bridge/i,'Hip thrust','Glutes','Hamstrings, quads',
      ['Upper back on the bench, bar on your hips','Feet flat, knees bent','Push your hips up to the sky','Squeeze your butt hard at the top'],
      ['Arching your lower back at the top','Pushing up through your toes']],
    [/deadlift/i,'Deadlift','Hamstrings, glutes, back','Grip, lats, quads',
      ['Bar over the middle of your feet','Grab it just outside your legs','Flat back, chest up, big breath','Push the floor away and stand tall'],
      ['Rounding your back','Hips shooting up first','Bar moving away from your legs']],
    [/incline.*(press|bench)/i,'Incline press','Upper chest, front shoulders','Triceps',
      ['Tilt the bench up a little','Squeeze your shoulder blades together','Lower the weight to your upper chest','Push it straight up'],
      ['Bench tilted too high','Bouncing the weight off your chest']],
    [/bench press|chest press/i,'Bench press','Chest','Front shoulders, triceps',
      ['Eyes under the bar','Squeeze your shoulder blades back','Lower the bar to your chest','Push it up, feet flat on the floor'],
      ['Bouncing the bar off your chest','Elbows sticking straight out','Lifting your butt off the bench']],
    [/arnold/i,'Arnold press','Shoulders','Triceps, upper chest',
      ['Start with palms facing you at your chin','Turn your hands as you push up','Finish with palms facing forward','Turn them back on the way down'],
      ['Arching your back','Going too fast']],
    [/overhead press|shoulder press|military/i,'Overhead press','Shoulders','Triceps, upper chest, core',
      ['Squeeze your butt and belly','Push the bar straight up past your face','Lock your arms over your head','Lower it back to your shoulders'],
      ['Leaning way back','Pushing the bar out in front']],
    [/chin.?up/i,'Chin-up','Lats, biceps','Upper back',
      ['Palms facing you, hands shoulder width','Start hanging with straight arms','Pull your chest up to the bar','Go all the way down each time'],
      ['Only going half way','Swinging to get up']],
    [/pull.?up/i,'Pull-up','Lats','Biceps, upper back, grip',
      ['Hands a bit wider than your shoulders, palms away','Start hanging with straight arms','Pull your elbows down to your sides','Chin over the bar, then lower slowly'],
      ['Kicking or swinging','Shrugging your shoulders up']],
    [/lat pull.?down|pulldown/i,'Lat pulldown','Lats','Biceps, upper back',
      ['Lock your legs under the pads','Lean back just a little','Pull the bar to your upper chest','Let it go up slowly'],
      ['Leaning way back','Pulling with only your arms','Letting the bar fly up']],
    [/dumbbell row|one.?arm row|db row/i,'Dumbbell row','Lats, upper back','Rear shoulders, biceps',
      ['Hand and knee on the bench, back flat','Let the weight hang down','Pull it to your hip','Lower it slowly'],
      ['Twisting your body','Pulling with just your hand']],
    [/cable row|seated row/i,'Seated cable row','Upper back, lats','Rear shoulders, biceps',
      ['Sit tall with your chest up','Pull the handle to your belly','Squeeze your shoulder blades','Let your arms go straight again'],
      ['Rocking back and forth','Rounding your back']],
    [/barbell row|bent.?over row|pendlay|\brow\b/i,'Barbell row','Upper back, lats','Rear shoulders, biceps, lower back',
      ['Bend forward with a flat back','Let the bar hang from straight arms','Pull it to your belly button','Lower it slowly'],
      ['Standing up as you pull','Rounding your back']],
    [/face pull/i,'Face pull','Rear shoulders, upper back','Rotator cuff',
      ['Rope at face height','Pull it toward your eyes','Pull the rope apart at the end','Keep your elbows high'],
      ['So heavy you lean back','Elbows dropping down']],
    [/lateral raise|side raise/i,'Lateral raise','Side shoulders','Upper traps',
      ['Elbows a little bent','Lift your arms out to the sides','Stop at shoulder height','Lower slowly'],
      ['Swinging your body','Shrugging your shoulders up']],
    [/leg press/i,'Leg press','Quads, glutes','Hamstrings',
      ['Back and butt flat on the seat','Feet shoulder width on the plate','Lower until your knees bend a lot','Push the plate away, knees soft at the top'],
      ['Butt lifting off the seat','Locking your knees','Knees falling inward']],
    [/leg curl|hamstring curl/i,'Leg curl','Hamstrings','Calves',
      ['Line your knees up with the machine','Pad just above your heels','Curl your heels toward your butt','Let it down slowly'],
      ['Hips lifting up','Letting the weight drop']],
    [/leg extension/i,'Leg extension','Quads','',
      ['Line your knee up with the machine','Pad on your lower shins','Kick your legs out straight','Lower slowly'],
      ['Kicking it up fast','Lifting your butt off the seat']],
    [/lunge/i,'Lunge','Quads, glutes','Adductors, hamstrings',
      ['Take a big step','Drop your back knee toward the floor','Keep your chest tall','Push through your front foot to stand'],
      ['Front knee falling inward','Steps that are too short']],
    [/tricep|skull ?crusher|pushdown|french press/i,'Triceps extension','Triceps','',
      ['Keep your upper arms still','Bend only at the elbows','Straighten your arms all the way','Come back slowly'],
      ['Elbows flaring out','Swinging your arms']],
    [/curl/i,'Biceps curl','Biceps','Forearms',
      ['Elbows stuck to your sides','Curl the weight up','Squeeze at the top','Lower it slowly, all the way'],
      ['Swinging your body','Only going half way']],
    [/fly|flye|pec deck/i,'Cable fly','Chest','Front shoulders',
      ['Elbows a little bent, and keep them that way','Open your arms wide','Bring them together like hugging a tree','Go back slowly'],
      ['Bending your elbows into a push','Opening too wide']],
    [/box jump/i,'Box jump','Quads, glutes, calves','Hamstrings',
      ['Stand close, feet apart','Swing your arms and jump up','Land softly on the box','Step down, do not jump down'],
      ['A box that is too high','Knees falling inward when you land']],
    [/kettlebell swing|kb swing/i,'Kettlebell swing','Glutes, hamstrings','Core, grip, shoulders',
      ['Push your butt back, not down','Hike the bell between your legs','Snap your hips forward','Let the bell float to chest height'],
      ['Lifting with your arms','Squatting instead of pushing your hips back']],
    [/plank/i,'Plank','Core','Shoulders, glutes',
      ['Elbows under your shoulders','Squeeze your butt and belly','Body straight like a board','Breathe slowly'],
      ['Hips sagging down','Butt up too high']],
    [/push.?up|press.?up/i,'Push-up','Chest, triceps','Front shoulders, core',
      ['Hands a bit wider than your shoulders','Body straight like a board','Lower your chest to the floor','Push back up'],
      ['Hips sagging','Elbows sticking straight out','Only going half way']],
    [/\bdips?\b/i,'Dip','Chest, triceps','Front shoulders',
      ['Arms straight at the top, shoulders down','Lean forward a little','Go down until your elbows make a corner','Push back up'],
      ['Going too deep','Shoulders shrugging up']]
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
