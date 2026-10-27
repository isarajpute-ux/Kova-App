/* =====================================================================
   KovaCrew - AI employees for the Work OS (p10).

   Modelled on how Grok Bot's agent teams work, rebuilt for Kova:
     - Each employee has a name, a title, a JOB DESCRIPTION (what it owns
       and its boundaries), a PLAYBOOK (how it does the job), the TOOLS it
       may use, an approval rule, a ROUTINE (a schedule or an event) and a
       MEMORY. All of it is editable; you can hire from templates or write
       one from scratch.
     - A Chief of Staff sits at the top. "Ask the team" is routed to the
       employee whose job description matches, the way Grok Bot routes by
       description.
     - An employee does the whole job, not just a suggestion. It reads your
       real Work OS data, acts with its tools step by step (a live work log
       shows each step), hands work to a teammate when it is someone else's
       lane, and finishes with a report. It pauses only when you need to
       approve something.
     - Anything that leaves Kova (email) always waits for your approval.
       Changes inside Work OS either run and can be undone, or wait for you,
       per employee ("Ask before every change" / "Only email").
     - "Analyze work" is built in and runs on this device: completion,
       overdue trend, cycle time, on-time rate, goal pace, stuck work,
       content pipeline. Employees report in those real numbers.

   Brains, in order: the Kova server (Claude with tools, and web search
   for research employees), your own Claude key (Settings), else built-in
   offline routines (analyze, triage overdue, brief today, plan the week),
   labelled as such.
   ===================================================================== */
window.KovaCrew=(function(){
  'use strict';
  var W=window.WorkOS, A=window.WorkAI;
  if(!W) return null;
  var DAY=864e5, JKEY='kova.crew.jobs.v1', MAX_TURNS=12;
  var S={view:'team', emp:null, draft:null, jobs:{}, down:{}, busy:{}, lastOverdue:null, tick:null, open:{}};

  /* ---------------- small helpers ---------------- */
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function md(t){
    var blocks=esc(t).split(/\n{2,}/);
    return blocks.map(function(b){
      var lines=b.split('\n');
      if(lines.every(function(l){ return /^\s*[-*•]\s+/.test(l); }))
        return '<ul>'+lines.map(function(l){ return '<li>'+l.replace(/^\s*[-*•]\s+/,'')+'</li>'; }).join('')+'</ul>';
      return '<p>'+b.replace(/\n/g,'<br>')+'</p>';
    }).join('').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  }
  function uid(p){ return (p||'x')+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function ago(t){ if(!t) return ''; var s=(Date.now()-t)/1000; if(s<60) return 'just now'; if(s<3600) return Math.round(s/60)+' min ago'; if(s<86400) return Math.round(s/3600)+' h ago'; return Math.round(s/86400)+' d ago'; }
  function clock(t){ var d=new Date(t); return d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}); }
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function lsPut(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function sod(){ return W.startOfDay?W.startOfDay():new Date(new Date().toDateString()).getTime(); }
  function words(t){ return String(t||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(function(w){ return w.length>2&&STOP.indexOf(w)<0; }); }
  var STOP=['the','and','for','you','your','with','that','this','are','what','how','can','all','any','from','into','our','out','get','give','make','about','they','them','have','has','who','its','not','but','just','please','need','want','kova','work','job','jobs','each','every','when','then','than','also','who','will','would','should','could','their','there'];

  /* ---------------- templates: the jobs you can hire for ---------------- */
  var TPL=[
    {id:'chief', n:'Ava', title:'Chief of Staff',
     job:'I run the team for you. I read everything in Work OS, brief you on what matters today, and send each job to the teammate who owns it. When nobody owns it, I do it myself.',
     playbook:'1. Read the work first (read_work, list_tasks).\n2. If a teammate owns the job, hand it off with clear instructions.\n3. Otherwise do it myself.\n4. Report back in plain words: what changed, what is at risk, what needs a decision.',
     tools:['tasks','projects','meetings','wellness'],
     routine:{freq:'weekdays',time:'08:30',job:'Brief me on today: what is due, what is overdue, what is at risk, and how ready I am for deep work.'},
     chips:['Brief me on today','What should I focus on this week?','What is at risk right now?'],
     hints:['brief','focus','priorit','today','risk','decide','overview','everything']},
    {id:'pm', n:'Leo', title:'Project Manager',
     job:'I keep every task and project moving. I triage overdue work, re-plan dates realistically, break big projects into concrete tasks with due dates, and flag anything stuck.',
     playbook:'1. list_tasks overdue and open.\n2. Re-date or close what is late, by priority: Critical and High first.\n3. Break any new project into 3 to 7 concrete tasks.\n4. Report what moved and what is still stuck.',
     tools:['tasks','projects'],
     routine:{freq:'weekdays',time:'17:30',job:'Triage today\u2019s overdue and stuck tasks and set realistic new dates.'},
     chips:['Triage my overdue tasks','Break a project into tasks','What is stuck?'],
     hints:['task','project','overdue','late','stuck','deadline','organi','board','process','triage','milestone','plan']},
    {id:'analyst', n:'Theo', title:'Growth Analyst',
     job:'I measure how the work is going. I track completion, the overdue trend, goals and content, and tell you in numbers what is working and what is not. I never guess a figure.',
     playbook:'1. analyze_work for 7 days and for 28 days.\n2. read_content for the posts.\n3. Compare this period with the last one.\n4. write_report with at most 5 metrics and 3 recommendations.',
     tools:['projects'],
     routine:{freq:'weekly',dow:1,time:'09:00',job:'Write my weekly work report: what got done, what slipped, goal pace and content.'},
     chips:['How is the work going?','Weekly report','Are my goals on pace?'],
     hints:['report','analy','number','metric','kpi','performance','how are','how am','trend','growth','goal','pace','progress','stats']},
    {id:'inbox', n:'Jade', title:'Client Success',
     job:'I look after clients and leads. I spot follow-ups that have gone quiet, draft the emails in your voice, and create the tasks so nothing slips. I never send anything without your OK.',
     playbook:'1. list_tasks for anything client, lead or follow-up related.\n2. Draft one short email per person that needs it (draft_email).\n3. Create a follow-up task with a date.\n4. Report who is waiting on what.',
     tools:['tasks','email'],
     routine:{freq:'off',time:'10:00',job:'Find clients or leads waiting on a reply and draft the follow-ups.'},
     chips:['Draft my follow-ups','Email a client','Who is waiting on me?'],
     hints:['email','follow','client','lead','reply','customer','chase','reach','message','inbox','gmail']},
    {id:'content', n:'Zoe', title:'Content Producer',
     job:'I keep the content pipeline full. I turn your goals and ideas into drafts for your platforms in your brand voice, each with a hook, caption and hashtags, ready in the Studio.',
     playbook:'1. read_content to see what is already planned.\n2. Draft posts that fill the gaps (post_draft), one idea each.\n3. Create a task to film or shoot anything that needs media.\n4. Report what is ready and what needs you.',
     tools:['content','tasks'],
     routine:{freq:'off',time:'09:30',job:'Draft three posts for this week that fit my goals and brand voice.'},
     chips:['Draft 3 posts for this week','Turn my latest idea into a post','What content is planned?'],
     hints:['post','content','caption','reel','tiktok','instagram','youtube','video','idea','hashtag','campaign','social']},
    {id:'social', n:'Maya', title:'Social Media Manager',
     job:'I run your social accounts. Send me a finished video or post and I write the caption in your voice, post it to the right accounts (a Short or a full video on YouTube, a Reel on Instagram), and an hour later tell you what people are saying: the top five things, what is working, and what to change for the following one.',
     playbook:'1. read_content to see what is ready and what already went out.\n2. To post: write the caption and hashtags, then publish_post to the connected accounts (it waits for your OK, unless you sent it to me yourself).\n3. An hour after it goes out, post_feedback to read the comments and group them into the top themes.\n4. Report what people say, what is working and the following video to make.',
     tools:['content','publish'],
     routine:{freq:'off',time:'19:00',job:'Tell me what people are saying on my latest post.'},
     chips:['What are people saying on my latest video?','Post my latest video to Instagram and YouTube','What should my next video be?'],
     hints:['publish','upload','post it','post my','comments','what are people saying','followers','reel','short','social media','my account']},
    {id:'research', n:'Ravi', title:'Research Analyst',
     job:'I find things out. I research competitors, prices, trends and answers on the web, check them against your own numbers, and give you sources, not opinions.',
     playbook:'1. Search the web for the question (web_search).\n2. Read your own data where it matters.\n3. write_report with findings and the sources.\n4. Create tasks for anything worth acting on.',
     tools:['research','tasks'],
     routine:{freq:'off',time:'09:00',job:'Check what my competitors posted and priced this week.'},
     chips:['Research my competitors','Find the going rate for my service','What is trending in my industry?'],
     hints:['research','competitor','market','look up','find out','trend','pricing','industry','source']},
    {id:'finance', n:'Noah', title:'Finance Tracker',
     job:'I watch the money. I keep revenue goals and metrics current, chase invoices with drafted reminders, and warn you early when a target is slipping.',
     playbook:'1. analyze_work and read goals and metrics.\n2. update_metric when you give me a figure; never invent one.\n3. Draft invoice reminders (draft_email) and create tasks.\n4. Report goal pace.',
     tools:['projects','tasks','email'],
     routine:{freq:'off',time:'09:00',job:'Check goal pace and list unpaid invoices that need a reminder.'},
     chips:['Are we on target this month?','Chase unpaid invoices','Set a revenue goal'],
     hints:['revenue','invoice','money','price','cost','profit','budget','paid','sales','income','target']},
    {id:'sched', n:'Mia', title:'Scheduler',
     job:'I handle time. I book meetings with a clear title and slot, create the prep tasks, and protect your deep-work blocks on the days your readiness is high.',
     playbook:'1. Read the work and your readiness.\n2. schedule_meeting with a clear title and time.\n3. Create a prep task before each call.\n4. Report the week\u2019s shape.',
     tools:['meetings','tasks','wellness'],
     routine:{freq:'off',time:'08:00',job:'Plan my meetings and deep-work blocks for today.'},
     chips:['Book a call','Plan my week','Protect time for deep work'],
     hints:['meeting','call','schedule','book','calendar','zoom','appointment','slot']},
    {id:'coach', n:'Kai', title:'Focus Coach',
     job:'I plan your work around your energy. I read your seven health checks and your workload, and tell you when to do deep work, when to do admin and when to stop.',
     playbook:'1. read_wellness and list_tasks for today.\n2. Match the hardest work to the best hours.\n3. Move non-urgent work off low-readiness days.\n4. Report the plan in three lines.',
     tools:['wellness','tasks'],
     routine:{freq:'off',time:'07:30',job:'Plan today around my readiness.'},
     chips:['Plan today around my energy','Am I overloaded?','When should I do deep work?'],
     hints:['focus','energy','tired','burnout','deep work','stress','balance','overload','rest']},
    /* p25: coaches for the body, not just the work. They read your own
       sleep and food (read_health) and answer anything you ask them. */
    {id:'nutrition', n:'Sage', title:'Nutrition Coach',
     job:'I coach your eating. I read what you logged today against your target and tell you exactly what to eat to bulk, cut or hold, in calories, grams of protein and real meals.',
     playbook:'1. read_health for today\u2019s food, your target and your sleep.\n2. Compare what you ate with the target.\n3. Plan the coming meal and tomorrow, in numbers.\n4. Answer the question first, in a few lines.',
     tools:['wellness','tasks'],
     routine:{freq:'daily',time:'20:00',job:'Check today\u2019s food against my target and tell me what to eat tomorrow.'},
     chips:['How are my calories today, and how do I bulk up?','Am I eating enough protein?','What should I have for dinner?'],
     hints:['calorie','kcal','protein','eat','food','meal','bulk','cut','diet','macro','nutrition','hungry','snack','weight']},
    {id:'sleep', n:'Luna', title:'Sleep Coach',
     job:'I look after your sleep. I read your nights (hours, stages, bedtime, how long you take to fall asleep, HRV), find what is hurting them, and check in at wind-down time: phone away, a book, lights low, a cool room.',
     playbook:'1. read_health for your recent nights.\n2. Find the pattern: late bedtimes, slow sleep onset, short deep sleep.\n3. Give one thing to change tonight.\n4. Answer the question first, in a few lines.',
     tools:['wellness','tasks'],
     routine:{freq:'daily',time:'22:00',job:'Wind-down check-in: how did last night go, and the one thing to do tonight.'},
     chips:['How is my sleep? Everything in one summary','What is making my sleep worse?','Why do I have dark circles?'],
     hints:['sleep','tired','bed','night','rem','deep sleep','insomnia','wake','nap','dark circles','scroll','phone at night']},
    {id:'training', n:'Atlas', title:'Training Coach',
     job:'I coach your training. I read the sessions you logged (how often, how long, how much you lifted) and your recovery, and tell you what to train, how hard, and when to rest.',
     playbook:'1. read_health for your sessions and recovery.\n2. Check how often and how much you trained this week against last.\n3. Say what to do today: push, train easy or rest.\n4. Answer the question first, in a few lines.',
     tools:['wellness','tasks'],
     routine:{freq:'off',time:'07:00',job:'Tell me what to train today and how hard, from my recovery.'},
     chips:['What should I train today?','Am I training enough?','How do I build more muscle?'],
     hints:['workout','train','lift','gym','exercise','muscle','strength','squat','bench','cardio','reps','sets','run']},
    {id:'vitals', n:'Cora', title:'Recovery Coach',
     job:'I watch your heart and recovery. I read your resting heart rate, HRV, training load, sleep, bedtime, food and water against your normal, and tell you what is off and what to do about it.',
     playbook:'1. read_wellness and read_health.\n2. Name what is outside your normal, with the number.\n3. Give the one thing to do today.\n4. Answer the question first, in a few lines.',
     tools:['wellness','tasks'],
     routine:{freq:'off',time:'08:00',job:'Check my recovery this morning and tell me what is off.'},
     chips:['How is my recovery today?','Why is my HRV low?','Is my resting heart rate normal?'],
     hints:['hrv','heart rate','resting heart','recovery','readiness','vitals','pulse','stress','spo2']}
  ];
  var SEED=['chief','pm','social','research','inbox','analyst','nutrition','sleep','training','vitals'];
  function tpl(id){ return TPL.filter(function(t){ return t.id===id; })[0]||null; }

  /* ---------------- tool groups (what you switch on per employee) ---------------- */
  var GROUPS=[
    {id:'read',     n:'Read your work',              d:'Tasks, projects, goals, metrics, content and meetings.', locked:true},
    {id:'tasks',    n:'Create and update tasks',     d:'New tasks, new dates, statuses, boards and processes.'},
    {id:'projects', n:'Projects, goals and metrics', d:'Create projects and goals, record a metric you gave it.'},
    {id:'content',  n:'Content and Studio drafts',   d:'Drafts in the Studio. Posting is always yours.'},
    {id:'meetings', n:'Meetings',                    d:'Put calls on the calendar with a prep note.'},
    {id:'email',    n:'Email (Gmail)',               d:'Writes the email. It waits for you to approve every send.', external:true},
    {id:'research', n:'Web research',                d:'Searches the web and reads the pages you give it. Needs the Kova server or your Claude key.'},
    {id:'publish',  n:'Post to your accounts',       d:'Posts what you send it and reads the comments. A post waits for your OK unless you sent it yourself.', external:true},
    {id:'wellness', n:'Your readiness',              d:'The seven health checks, to plan work around your energy.'}
  ];

  /* ---------------- employees (stored in the Work OS 'agents' collection) ---------------- */
  function emps(){ return W.list('agents',function(a){ return a&&a.crew; }).sort(function(a,b){ return (a.order||0)-(b.order||0); }); }
  function emp(id){ return emps().filter(function(e){ return e.id===id; })[0]||null; }
  function hire(t,over,quiet){
    over=over||{};
    var n=emps().length;
    return W.create('agents',{
      id:uid('e_'), crew:true, custom:false, tpl:t?t.id:'custom', order:n,
      n:over.n||(t?t.n:'New hire'), title:over.title||(t?t.title:'Specialist'),
      job:over.job!=null?over.job:(t?t.job:''), playbook:over.playbook!=null?over.playbook:(t?t.playbook:''),
      tools:(over.tools||(t?t.tools:['tasks'])).slice(), approval:over.approval||'external',
      routine:Object.assign({freq:'off',time:'09:00',dow:1,event:'overdue',job:''},(t&&t.routine)||{},over.routine||{},quiet?{freq:'off'}:{}),
      memory:[], enabled:true, runs:0, lastRun:0, lastRoutine:0, model:'auto', budget:150
    },'user');
  }
  /* the template's name, or the first free one if someone already has it */
  function freeName(t){
    var used=emps().map(function(e){ return e.n; });
    if(used.indexOf(t.n)<0) return t.n;
    return ((typeof FILL!=='undefined'&&FILL.names)||['Sam','Noor','Iris','Theo','Lena','Omar']).filter(function(n){ return used.indexOf(n)<0; })[0]||t.n;
  }
  function seed(){
    if(!(emps().length||(window.KP&&KP.get('crewSeeded')))){
      SEED.forEach(function(id){ hire(tpl(id),null,true); });
      if(window.KP) KP.set('crewSeeded',true);
      if(window.KP) KP.set('crewV20',true);
      return;
    }
    migrate();
    migrate25();
    migrate26();
  }
  /* p26: the coaches are named for what they look after: Sage (food),
     Luna (sleep), Atlas (training), Cora (heart and recovery) */
  function migrate26(){
    if(!window.KP||KP.get('crewV26')) return;
    emps().forEach(function(e){ if(e.tpl==='nutrition'&&e.n==='Henry'&&!emps().some(function(x){ return x.n==='Sage'; })) touch(e,{n:'Sage'}); });
    ['training','vitals'].forEach(function(id){ if(!emps().some(function(e){ return e.tpl===id; })) hire(tpl(id),{n:freeName(tpl(id))},true); });
    KP.set('crewV26',true);
  }
  /* p25: teams made before the coaches existed get the food and sleep coaches once */
  function migrate25(){
    if(!window.KP||KP.get('crewV25')) return;
    ['nutrition','sleep'].forEach(function(id){ if(!emps().some(function(e){ return e.tpl===id; })) hire(tpl(id),{n:freeName(tpl(id))},true); });
    KP.set('crewV25',true);
  }
  /* p20: Maya became the Social Media Manager (she posts and reads the
     comments) and Ravi researches by default. A team that still has the
     original Growth Analyst called Maya keeps that teammate, renamed Theo. */
  function migrate(){
    if(!window.KP||KP.get('crewV20')) return;
    var L=emps(), used=L.map(function(e){ return e.n; });
    var an=L.filter(function(e){ return e.tpl==='analyst'&&e.n==='Maya'; })[0];
    if(an&&!L.some(function(e){ return e.tpl==='social'; })&&used.indexOf('Theo')<0) touch(an,{n:'Theo'});
    if(!L.some(function(e){ return e.tpl==='social'; })) hire(tpl('social'),{n:freeName(tpl('social'))},true);
    if(!L.some(function(e){ return e.tpl==='research'; })) hire(tpl('research'),{n:freeName(tpl('research'))},true);
    KP.set('crewV20',true);
  }
  function saveEmp(e,patch){ return W.update('agents',e.id,patch,'user'); }
  function touch(e,patch){ var row=W.find('agents',e.id); if(!row) return; Object.keys(patch).forEach(function(k){ row[k]=patch[k]; e[k]=patch[k]; }); try{ W.save(); }catch(x){} }
  function chief(){ return emps().filter(function(e){ return e.tpl==='chief'&&e.enabled; })[0]||null; }

  /* ---------------- your health, as the team sees it (p25) ----------------
     The same numbers the app shows: the nights on Sleep, today on Fuel and
     the target from "Find my maintenance". Example data is labelled as
     such, and a missing target is said, never filled in. */
  function sample(){ try{ return !(window.KovaMode&&KovaMode.live); }catch(e){ return true; } }
  function health(){
    var N=(window.KOVA_WEEK||[]).filter(Boolean).map(function(n){
      return {day:n.d,score:n.score,asleep_min:(n.deep||0)+(n.rem||0)+(n.light||0),bedtime:n.bed,onset_min:n.onset,efficiency_pct:n.eff,hrv_ms:n.hrv,deep_min:n.deep,rem_min:n.rem,light_min:n.light};
    });
    var t=null, tg=null;
    try{ t=window.KovaFuel&&KovaFuel.totals?KovaFuel.totals():null; }catch(e){}
    try{ tg=window.__fuelTargets?__fuelTargets():null; }catch(e){}
    var own=!!(tg&&tg.base&&tg.base.src&&tg.base.src!=='demo');
    var log=lsJ('kova_log_v1',[]), wk=Date.now()-7*DAY;
    var sess=(Array.isArray(log)?log:[]).filter(function(x){ return x&&x.t; }).slice(-30).map(function(x){ return {at:new Date(x.t).toDateString(),t:x.t,name:x.day||'',minutes:+x.mins||0,volume:+x.vol||0}; });
    var a=null; try{ a=window.KovaAgent&&KovaAgent.audit?KovaAgent.audit():null; }catch(e){}
    var vit=a&&a.metrics?a.metrics.map(function(m){ return {name:m.name,value:m.value,unit:m.unit||'',status:m.status,note:(m.flags||[])[0]||''}; }):[];
    return {source:sample()?'example data: Kova is showing its sample week, not the user\u2019s own readings':'the user\u2019s own data',
      nights:N.length, sleep:N,
      food_today:t&&t.kcal?{kcal:Math.round(t.kcal),protein_g:Math.round(t.p),carbs_g:Math.round(t.c),fat_g:Math.round(t.f)}:{kcal:0,note:'Nothing logged today yet.'},
      target:own?{kcal:Math.round(tg.kcal),protein_g:Math.round(tg.p),carbs_g:Math.round(tg.c),fat_g:Math.round(tg.f)}:null,
      target_note:own?'':'No personal calorie target yet: the user has not answered the five maintenance questions (Fuel > Find my maintenance).',
      sessions:sess, sessions_7d:sess.filter(function(x){ return x.t>=wk; }).length, vitals:vit};
  }
  function healthText(){
    var h=health(), out=['Source: '+h.source+'.'];
    try{ var sn=window.KovaChat&&KovaChat.snapshot?KovaChat.snapshot():''; if(sn) out.push(sn); }catch(e){}
    if(!h.nights) out.push('No sleep nights recorded yet.');
    out.push(h.target?'Daily target: '+h.target.kcal+' kcal, '+h.target.protein_g+' g protein.':h.target_note);
    if(!h.food_today.kcal) out.push('Food today: nothing logged yet.');
    return out.join('\n');
  }

  /* ---------------- analyze work: all computed on this device ---------------- */
  function doneAt(i){ return i.status==='Completed'?(i.completedAt||i.updated||i.created||0):0; }
  function analyze(days){
    days=Math.max(1,Math.min(90,+days||7));
    var now=Date.now(), P=days*DAY, cur0=now-P, prev0=now-2*P;
    var items=W.list('items');
    var done=items.filter(function(i){ var t=doneAt(i); return t&&t>=cur0; });
    var prev=items.filter(function(i){ var t=doneAt(i); return t&&t>=prev0&&t<cur0; });
    var created=items.filter(function(i){ return (i.created||0)>=cur0; });
    var open=items.filter(function(i){ return i.status!=='Completed'; });
    var od=W.overdue?W.overdue():[], today=W.dueToday?W.dueToday():[], week=W.upcoming?W.upcoming(7):[];
    var byStatus={}; items.forEach(function(i){ byStatus[i.status||'Not Started']=(byStatus[i.status||'Not Started']||0)+1; });
    var cyc=done.filter(function(i){ return i.created; }).map(function(i){ return (doneAt(i)-i.created)/DAY; });
    var withDue=done.filter(function(i){ return i.due; });
    var onTime=withDue.filter(function(i){ return doneAt(i)<=i.due+DAY; }).length;
    var series=[]; for(var d=13;d>=0;d--){ var a=sod()-d*DAY, b=a+DAY; series.push(items.filter(function(i){ var t=doneAt(i); return t>=a&&t<b; }).length); }
    var oldest=od.slice().sort(function(a,b){ return a.due-b.due; })[0];
    var stuck=items.filter(function(i){ return i.status==='Waiting'&&now-(i.updated||i.created||now)>3*DAY; });
    var projects=W.list('projects').map(function(p){ var pr=W.projectProgress(p.id); return {name:p.name,pct:pr.pct,done:pr.done,total:pr.total}; });
    var goals=W.list('goals').map(function(g){
      var pr=W.goalProgress(g), out={name:g.name,pct:pr.pct,current:g.current,target:g.target,unit:g.unit||''};
      if(g.deadline&&g.created){ var span=g.deadline-g.created, gone=Math.min(1,Math.max(0,(now-g.created)/(span||1))); out.expected=Math.round(gone*100); out.behind=pr.known&&pr.pct+10<out.expected; }
      return out;
    });
    var posts=(window.KovaPost&&KovaPost.all)?KovaPost.all():[];
    var content={drafts:W.list('content',function(c){ return c.kind!=='post'; }).length,
      posts:posts.length, scheduled:posts.filter(function(p){ return p.status==='scheduled'; }).length,
      published:posts.filter(function(p){ return Object.keys(p.results||{}).some(function(k){ return p.results[k]&&p.results[k].state==='ok'; }); }).length};
    var meets=W.list('meetings');
    var meetings={upcoming:meets.filter(function(m){ return m.at&&m.at>now&&m.at<now+7*DAY; }).length,
      noNotes:meets.filter(function(m){ return m.at&&m.at<now&&!(m.notes&&String(m.notes).trim()); }).length};
    var change=prev.length?Math.round((done.length-prev.length)/prev.length*100):null;
    var f=[];
    f.push('Completed '+done.length+' task'+(done.length===1?'':'s')+' in the last '+days+' days'+(change==null?'':(change>=0?', up ':', down ')+Math.abs(change)+'% on the '+days+' days before')+'.');
    if(od.length) f.push(od.length+' overdue'+(oldest?', the oldest is \u201c'+oldest.name+'\u201d, '+Math.max(1,Math.round((sod()-oldest.due)/DAY))+' days late':'')+'.');
    if(stuck.length) f.push(stuck.length+' waiting for more than 3 days: '+stuck.slice(0,3).map(function(i){ return i.name; }).join(', ')+'.');
    goals.forEach(function(g){ if(g.behind) f.push('Goal \u201c'+g.name+'\u201d is at '+g.pct+'% but should be near '+g.expected+'% by now.'); });
    if(withDue.length>=3) f.push(Math.round(onTime/withDue.length*100)+'% of finished tasks landed on time.');
    return {days:days, completed:done.length, prevCompleted:prev.length, change:change, created:created.length,
      open:open.length, overdue:od.length, oldestOverdue:oldest?{name:oldest.name,days:Math.max(1,Math.round((sod()-oldest.due)/DAY))}:null,
      dueToday:today.length, dueWeek:week.length, byStatus:byStatus,
      avgCycleDays:cyc.length?Math.round(cyc.reduce(function(a,b){ return a+b; },0)/cyc.length*10)/10:null,
      onTimeRate:withDue.length?Math.round(onTime/withDue.length*100):null,
      series:series, projects:projects, goals:goals, content:content, meetings:meetings,
      stuck:stuck.map(function(i){ return i.name; }), findings:f, empty:!items.length};
  }

  /* ---------------- tools ---------------- */
  function taskRow(i){
    var p=i.projectId?W.find('projects',i.projectId):null, as=i.assignee?emp(i.assignee):null;
    return {name:i.name,status:i.status,priority:i.priority,due:A?A.dateLabel(i.due):(i.due?new Date(i.due).toDateString():'no date'),
            project:p?p.name:'',assignee:as?as.n:(i.assignee||''),notes:String(i.notes||'').slice(0,160)};
  }
  function findItem(name){
    var q=String(name||'').toLowerCase().trim(); if(!q) return null;
    var all=W.list('items');
    return all.filter(function(i){ return i.name.toLowerCase()===q; })[0]||all.filter(function(i){ return i.name.toLowerCase().indexOf(q)>=0; })[0]||null;
  }
  function findMetric(name){ var q=String(name||'').toLowerCase(); return W.list('metrics').filter(function(m){ return String(m.name||'').toLowerCase()===q; })[0]||null; }
  var S_STR={type:'string'}, S_NUM={type:'number'};
  function obj(props,req){ return {type:'object',properties:props,required:req||[]}; }
  var DUE='today, tomorrow, +3d or YYYY-MM-DD';
  var PRI={type:'string',enum:['Critical','High','Medium','Low']}, STA={type:'string',enum:['Not Started','In Progress','Waiting','Completed']};
  var COLL={create_task:'items',create_project:'projects',create_process:'processes',create_goal:'goals',create_board:'boards',create_content_draft:'content',schedule_meeting:'meetings'};

  var TOOLS={
    read_work:{g:'read',kind:'read',d:'Overview of all the work right now: counts by status, overdue, due today and this week, projects, goals, content pipeline and meetings, with findings.',
      s:obj({}), run:function(){ var a=analyze(7); return {profile:(A&&A.context)?A.context():'',completed_7d:a.completed,open:a.open,overdue:a.overdue,due_today:a.dueToday,due_this_week:a.dueWeek,by_status:a.byStatus,projects:a.projects,goals:a.goals,content:a.content,meetings:a.meetings,findings:a.findings}; },
      label:function(r){ return 'Read the work: '+r.open+' open, '+r.overdue+' overdue, '+r.due_today+' due today'; }},
    list_tasks:{g:'read',kind:'read',d:'List tasks. filter: overdue, today, week, open, waiting, done_recent or all. Optional project, assignee (teammate name) and limit.',
      s:obj({filter:{type:'string',enum:['overdue','today','week','open','waiting','done_recent','all']},project:S_STR,assignee:S_STR,limit:S_NUM}),
      run:function(a){
        var f=a.filter||'open', L;
        if(f==='overdue') L=W.overdue(); else if(f==='today') L=W.dueToday(); else if(f==='week') L=W.upcoming(7);
        else if(f==='waiting') L=W.list('items',function(i){ return i.status==='Waiting'; });
        else if(f==='done_recent') L=W.list('items',function(i){ return doneAt(i)>Date.now()-7*DAY; });
        else if(f==='all') L=W.list('items'); else L=W.list('items',function(i){ return i.status!=='Completed'; });
        if(a.project){ var q=String(a.project).toLowerCase(); L=L.filter(function(i){ var p=i.projectId&&W.find('projects',i.projectId); return p&&p.name.toLowerCase().indexOf(q)>=0; }); }
        if(a.assignee){ var e=byName(a.assignee); L=L.filter(function(i){ return e?i.assignee===e.id:false; }); }
        var n=L.length; L=L.slice(0,Math.max(1,Math.min(50,+a.limit||25)));
        return {filter:f,count:n,tasks:L.map(taskRow)};
      },
      label:function(r){ return 'Listed '+r.count+' '+({overdue:'overdue',today:'due today',week:'due this week',open:'open',waiting:'waiting',done_recent:'recently finished',all:''}[r.filter]||'')+' task'+(r.count===1?'':'s'); }},
    analyze_work:{g:'read',kind:'read',d:'Measure the work over a period: completed vs the period before, created, open, overdue trend, average cycle time, on-time rate, 14-day completion series, goal pace, stuck work, content and meetings.',
      s:obj({days:S_NUM}), run:function(a){ return analyze(a.days||7); },
      label:function(r){ return 'Analyzed '+r.days+' days: '+r.completed+' done'+(r.change==null?'':' ('+(r.change>=0?'+':'')+r.change+'%)')+', '+r.overdue+' overdue'; }},
    read_content:{g:'read',kind:'read',d:'The content pipeline: Studio posts with their status and platforms, and content drafts.',
      s:obj({}), run:function(){
        var posts=(window.KovaPost&&KovaPost.all)?KovaPost.all():[];
        return {posts:posts.slice(0,20).map(function(p){ return {title:p.title,status:p.status,platforms:p.targets||[],heading:String(p.heading||'').slice(0,120),
                  results:Object.keys(p.results||{}).map(function(k){ return k+':'+(p.results[k]&&p.results[k].state); })}; }),
                drafts:W.list('content',function(c){ return c.kind!=='post'; }).slice(0,20).map(function(c){ return {title:c.title||c.name,platform:c.platform||'',status:c.status||'draft'}; })};
      },
      label:function(r){ return 'Read the content pipeline: '+r.posts.length+' posts, '+r.drafts.length+' drafts'; }},
    read_wellness:{g:'wellness',kind:'read',d:'Your readiness from Kova\u2019s seven health checks (resting heart rate, HRV, training load, sleep, bedtime, food, water): each with value, normal and status.',
      s:obj({}), run:function(){
        var a=window.KovaAgent&&KovaAgent.audit?KovaAgent.audit():null;
        if(!a) return {available:false};
        var fix=a.metrics.filter(function(m){ return m.status==='fix'; }).length;
        return {available:true,readiness:fix>=2?'low':(fix===1?'medium':'high'),metrics:a.metrics.map(function(m){ return {name:m.name,value:m.value,unit:m.unit,status:m.status,note:(m.flags||[])[0]||''}; })};
      },
      label:function(r){ return r.available?'Checked your readiness: '+r.readiness:'Readiness not available yet'; }},
    read_health:{g:'read',kind:'read',d:'The user\u2019s own health data in Kova: recent nights of sleep (score, hours asleep, bedtime, sleep onset, deep/REM/light minutes, HRV), food logged today with calories and macros, their calorie and protein target (or that none is set), training. Use it for any question about their body.',
      s:obj({}), run:function(){ return health(); },
      label:function(r){ return 'Read your health data: '+(r.nights?r.nights+' nights of sleep':'no sleep yet')+', '+(r.food_today&&r.food_today.kcal?Math.round(r.food_today.kcal)+' kcal today':'no food logged today'); }},
    read_memory:{g:'read',kind:'read',d:'What you and the team have asked the employee to remember, plus company notes.',
      s:obj({}), run:function(a,ctx){ return {mine:(ctx.emp.memory||[]).map(function(m){ return m.t; }),company:W.list('memories').slice(-20).map(function(m){ return m.text; })}; },
      label:function(){ return 'Read its memory'; }},
    remember:{g:'always',kind:'self',d:'Save one short fact to your own memory for future jobs (a preference, a name, a rule the user gave you).',
      s:obj({fact:S_STR},['fact']), run:function(a,ctx){
        var f=String(a.fact||'').trim().slice(0,240); if(!f) return {error:'nothing to remember'};
        var m=(ctx.emp.memory||[]).concat([{t:f,at:Date.now()}]).slice(-40); touch(ctx.emp,{memory:m}); return {ok:true};
      },
      label:function(r,a){ return 'Remembered: '+String(a.fact||'').slice(0,80); }},
    write_report:{g:'always',kind:'self',d:'Deliver your finished work: a title, a 1-2 sentence summary, up to 6 metrics (label, value, unit, note), 1 to 4 charts built from numbers your tools returned (bars, line, donut, gauge or hills), short sections of advice, and for content work the post ideas. Call once, at the end.',
      s:obj({title:S_STR,summary:S_STR,metrics:{type:'array',items:obj({label:S_STR,value:S_STR,unit:S_STR,note:S_STR})},
        charts:{type:'array',items:obj({type:{type:'string',enum:['bars','line','donut','gauge','hills']},title:S_STR,unit:S_STR,value:S_NUM,data:{type:'array',items:obj({label:S_STR,value:S_NUM})}},['type','title'])},
        sections:{type:'array',items:obj({heading:S_STR,text:S_STR})},
        ideas:{type:'array',items:obj({day:S_STR,platform:S_STR,format:S_STR,hook:S_STR,beats:{type:'array',items:S_STR},caption:S_STR,tags:S_STR,time:S_STR})}},['title','summary']),
      run:function(a,ctx){ ctx.job.report={title:String(a.title||'Report').slice(0,120),summary:String(a.summary||'').slice(0,600),
        metrics:(a.metrics||[]).slice(0,6).map(function(m){ return {label:String(m.label||'').slice(0,40),value:String(m.value==null?'':m.value).slice(0,24),note:String(m.note||'').slice(0,80)}; }),
        sections:(a.sections||[]).slice(0,6).map(function(x){ return {heading:String(x.heading||'').slice(0,80),text:String(x.text||'').slice(0,1400)}; }),
        charts:(a.charts||[]).slice(0,4).filter(function(c){ return c&&/^(bars|line|donut|gauge|hills)$/.test(c.type); }).map(function(c){ return {type:c.type,title:String(c.title||'').slice(0,60),unit:String(c.unit||'').slice(0,12),
          value:isFinite(+c.value)?+c.value:0,data:(c.data||[]).slice(0,14).map(function(d){ return {label:String(d&&d.label||'').slice(0,24),value:isFinite(+(d&&d.value))?+d.value:0}; })}; }),
        ideas:(a.ideas||[]).slice(0,10).map(function(x){ return {day:String(x.day||'').slice(0,20),platform:String(x.platform||'').slice(0,20),format:String(x.format||'').slice(0,20),hook:String(x.hook||'').slice(0,160),
          beats:(x.beats||[]).slice(0,4).map(function(b){ return String(b).slice(0,120); }),caption:String(x.caption||'').slice(0,600),tags:String(x.tags||'').slice(0,160),time:String(x.time||'').slice(0,10)}; })};
        if(ctx.job.report.metrics) ctx.job.report.metrics.forEach(function(m,i){ var src=(a.metrics||[])[i]||{}; m.unit=String(src.unit||'').slice(0,4); });
        return {ok:true,delivered:true}; },
      label:function(r,a){ return 'Wrote the report: '+String(a.title||''); }},
    hand_off:{g:'always',kind:'self',d:'Give a job to a teammate whose job description owns it. to = their name or title; job = clear instructions.',
      s:obj({to:S_STR,job:S_STR},['to','job']), run:function(a,ctx){
        var t=byName(a.to), others=emps().filter(function(e){ return e.id!==ctx.emp.id; }).map(function(e){ return e.n+' ('+e.title+')'; }).join(', ');
        if(t&&t.id===ctx.emp.id) return {error:'that is you, '+ctx.emp.n+'. Hand it to a teammate: '+others};
        if(!t) return {error:'no teammate called '+a.to+'. Team: '+others};
        if(!t.enabled) return {error:t.n+' is switched off'};
        (ctx.job.after=ctx.job.after||[]).push({to:t.id,job:String(a.job||'').slice(0,1200)});
        return {ok:true,handed_to:t.n+' ('+t.title+')'};
      },
      label:function(r){ return r.handed_to?'Handed off to '+r.handed_to:'Hand-off failed: '+String(r.error||'no teammate for it').split('. Team:')[0]; }},
    assign_task:{g:'tasks',kind:'write',d:'Assign an existing task to a teammate (by task name and teammate name).',
      s:obj({task:S_STR,to:S_STR},['task','to']),
      run:function(a,ctx){ var i=findItem(a.task), t=byName(a.to); if(!i) return {error:'no task called '+a.task}; if(!t) return {error:'no teammate called '+a.to};
        ctx.undo({coll:'items',id:i.id,prev:{assignee:i.assignee||''}}); W.update('items',i.id,{assignee:t.id},ctx.emp.n); return {ok:true,task:i.name,assignee:t.n}; },
      describe:function(a){ return {t:'Assign',n:a.task,s:'to '+a.to}; },
      label:function(r){ return r.ok?'Assigned \u201c'+r.task+'\u201d to '+r.assignee:'Could not assign: '+String(r.error||'not found'); }},
    post_draft:{g:'content',kind:'write',d:'Save a post draft in the Studio (never publishes). platforms: any of '+((window.KovaPost&&KovaPost.ORDER)||[]).join(', ')+'.',
      s:obj({heading:S_STR,body:S_STR,caption:S_STR,tags:S_STR,platforms:{type:'array',items:S_STR}},['heading']),
      run:function(a,ctx){
        if(!window.KovaPost) return {error:'the Studio is not available'};
        var p=KovaPost.blank(); p.title=String(a.heading||'Post').slice(0,80); p.heading=String(a.heading||''); p.body=String(a.body||''); p.caption=String(a.caption||''); p.tags=String(a.tags||'');
        p.targets=(a.platforms||[]).filter(function(k){ return KovaPost.PLAT&&KovaPost.PLAT[k]; }); p.by=ctx.emp.n;
        KovaPost.save(p); ctx.undo({coll:'content',id:p.id,created:true}); return {ok:true,title:p.title,platforms:p.targets};
      },
      describe:function(a){ return {t:'Studio draft',n:a.heading,s:(a.platforms||[]).join(', ')}; },
      label:function(r){ return r.ok?'Drafted \u201c'+r.title+'\u201d in the Studio':'Draft failed'; }},
    delegate:{g:'chief',kind:'read',d:'Run jobs with several teammates AT THE SAME TIME and wait for all their results (for example research and a draft in parallel). jobs: up to 4 of {to: teammate name, job: clear instructions}. Use hand_off instead when only one teammate is needed.',
      s:obj({jobs:{type:'array',items:obj({to:S_STR,job:S_STR},['to','job'])}},['jobs']),
      run:function(a,ctx){
        if(ctx.job.meta&&ctx.job.meta.par) return {error:'A delegated job cannot delegate again.'};
        var subs=[];
        (a.jobs||[]).slice(0,4).forEach(function(x){ var t=byName(x.to); if(t&&t.enabled&&t.id!==ctx.emp.id){ var sj=start(t,String(x.job||'').slice(0,1200),'handoff',{from:ctx.emp.n,parent:ctx.job.id,par:true}); if(sj) subs.push(sj); } });
        if(!subs.length) return {error:'No teammate could take those jobs. Team: '+emps().map(function(x){ return x.n+' ('+x.title+')'; }).join(', ')};
        count('parallel');
        log(ctx.job,'Waiting for '+subs.map(function(j){ return (emp(j.emp)||{}).n; }).join(' and ')+', working in parallel','handoff'); paintSoon();
        S.waits=S.waits||{};
        return Promise.all(subs.map(function(j){ return new Promise(function(ok){ if(j.state==='done'||j.state==='failed'||j.state==='stopped') return ok(j); S.waits[j.id]=ok; }); })).then(function(done){
          return {ok:true,results:done.map(function(j){ var r=j.report; return {from:(emp(j.emp)||{}).n,state:j.state,said:String(j.say||j.note||'').slice(0,1500),
            report:r?{title:r.title,summary:String(r.summary||'').slice(0,1500),metrics:(r.metrics||[]).slice(0,6)}:null}; })};
        });
      },
      label:function(r){ return r.ok?'Ran '+r.results.length+' jobs in parallel: '+r.results.map(function(x){ return x.from+' ('+x.state+')'; }).join(', '):'Could not delegate: '+String(r.error||''); }},
    fetch_page:{g:'research',kind:'read',d:'Read one web page in full: its title, description, readable text and links. Use it for any address the user gives you.',
      s:obj({url:S_STR},['url']),
      run:function(a){ return window.KovaAsk?KovaAsk.fetchPage(a.url):{error:'Reading pages is not available here.'}; },
      label:function(r,a){ return r.error?'Could not read '+String(a.url||'').slice(0,60)+': '+r.error:'Read '+(r.title||String(a.url||'').slice(0,60)); }},
    best_tools:{g:'read',kind:'read',d:'Which of the 86 leading work, automation, CRM, marketing, data and developer apps is best for a need, with the five reasons it leads and what Kova already does the same way. need = what the user wants to do.',
      s:obj({need:S_STR},['need']),
      run:function(a){
        if(!window.KovaApps) return {error:'The app guide is still loading.'};
        var L=KovaApps.recommend(a.need,3);
        return {need:a.need,apps:L.map(function(x){ return {name:x.n,group:x.grp,best_at:x.best,reasons:x.why,in_kova:x.take,evidence:KovaApps.EV[x.ev]}; })};
      },
      label:function(r){ return r.error?'Could not check the app guide':'Checked the app guide: '+(r.apps.length?r.apps.map(function(x){ return x.name; }).join(', '):'nothing close'); }},
    create_automation:{g:'tasks',kind:'write',d:'Create a Work OS automation from one plain sentence, e.g. "When a call ends, make a write-up task, wait 2 days, then remind me" or "30 minutes before every call, prep me". Triggers: a task moves to a status, a task is created, goes overdue, sits quiet N days, a meeting is N minutes away, a meeting ends, every day/weekday at a time, a goal is updated. Steps: create a task, notify me, wait N minutes/hours/days, set priority, move it to a status, put it on today, ask the AI team, mark it complete.',
      s:obj({rule:S_STR,name:S_STR},['rule']),
      run:function(a,ctx){
        if(!window.KovaFlow) return {error:'Automations are still loading.'};
        var r=KovaFlow.parse(a.rule);
        if(r.error) return {error:r.error};
        if(a.name) r.spec.name=String(a.name).slice(0,80);
        r.spec.by='ai';
        var made=KovaFlow.make(r.spec);
        if(made&&made.id&&ctx&&ctx.undo) ctx.undo({coll:'automations',id:made.id,created:true});
        return made&&made.id?{ok:true,id:made.id,name:made.name,rule:KovaFlow.describe(made)}:{error:'The rule could not be saved.'};
      },
      describe:function(a){ return {t:'Automation',n:a.name||String(a.rule||'').slice(0,60),s:'a new rule, switched on'}; },
      label:function(r){ return r.error?'Could not make the rule: '+r.error:'Made the rule \u201c'+r.name+'\u201d'; }},
    post_feedback:{g:'publish',kind:'read',d:'What people are saying about a published post: the top comment themes with their share and a quote, what is working, what to fix and the next video. post = its title, or "latest".',
      s:obj({post:S_STR}),
      run:function(a){ return window.KovaAsk?KovaAsk.feedback(a.post||'latest'):{error:'Not available here.'}; },
      label:function(r){ return r.error?'Could not read the comments: '+r.error:'Read the comments on \u201c'+r.post+'\u201d: '+(r.themes||[]).length+' themes'; }},
    publish_post:{g:'publish',kind:'external',d:'Post a Studio post or video to the user\u2019s connected accounts. It waits for their OK. post = its title or "latest"; platforms = instagram, youtube, tiktok, facebook, linkedin, x, threads or pinterest; heading and caption optional.',
      s:obj({post:S_STR,platforms:{type:'array',items:S_STR},heading:S_STR,caption:S_STR},['post','platforms']),
      run:function(a){ return window.KovaAsk?KovaAsk.publishFromTool(a):{error:'Posting is not available here.'}; },
      describe:function(a){ return {t:'Post',n:a.post,s:'to '+(a.platforms||[]).join(', ')}; },
      label:function(r){ return r.error?'Not posted: '+r.error:'Posted \u201c'+r.post+'\u201d to '+r.platforms.join(', '); }},
    draft_email:{g:'email',kind:'external',d:'Write an email for the user to approve. It is only sent (or saved to Gmail drafts) after they approve. to = email address.',
      s:obj({to:S_STR,subject:S_STR,body:S_STR},['to','subject','body']),
      run:function(a){
        var send=a.__action!=='draft';
        if(!window.KovaLink||!KovaLink.authFetch) return Promise.resolve({ok:true,manual:true,note:'The user will send it from their own mail app.'});
        return KovaLink.authFetch('/assist/email',{json:{to:a.to,subject:a.subject,body:a.body,send:send}}).then(function(r){
          return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error||('HTTP '+r.status)); return {ok:true,sent:send,saved_as_draft:!send,to:a.to}; });
        }).catch(function(e){
          var m=String(e&&e.message||e);
          /* no server or not signed in: nothing is lost, the email is handed to you to send */
          if(/no-backend|signed|network|failed to fetch|load failed/i.test(m)) return {ok:true,manual:true,offline:true,note:'Kova could not reach its server, so the email is ready for the user to send from their own mail app.'};
          return {error:m};
        });
      },
      describe:function(a){ return {t:'Email',n:a.subject,s:'to '+a.to}; },
      label:function(r,a){ return r.error?'Email not sent: '+r.error:(r.manual?'Email handed to you to send'+(r.offline?' (Kova is offline)':''):(r.sent?'Sent email to '+a.to:'Saved Gmail draft to '+a.to)); }}
  };
  /* the Work OS write tools, reusing WorkAI's validation and execution */
  var WAI={create_task:['tasks',obj({name:S_STR,priority:PRI,due:{type:'string',description:DUE},status:STA,notes:S_STR,project:S_STR},['name'])],
    update_task:['tasks',obj({name:{type:'string',description:'the existing task, by name'},status:STA,priority:PRI,due:{type:'string',description:DUE},notes:S_STR},['name'])],
    create_board:['tasks',obj({name:S_STR,kind:S_STR},['name'])],
    create_process:['tasks',obj({name:S_STR,steps:{type:'array',items:obj({n:S_STR},['n'])}},['name'])],
    create_project:['projects',obj({name:S_STR,desc:S_STR,due:{type:'string',description:DUE}},['name'])],
    create_goal:['projects',obj({name:S_STR,target:S_NUM,current:S_NUM,unit:S_STR,deadline:{type:'string',description:DUE}},['name','target'])],
    update_metric:['projects',obj({name:S_STR,value:S_NUM,target:S_NUM,unit:S_STR},['name','value'])],
    create_content_draft:['content',obj({title:S_STR,platform:S_STR,idea:S_STR,script:S_STR,caption:S_STR,hashtags:S_STR,publish_at:S_STR},['title'])],
    schedule_meeting:['meetings',obj({title:S_STR,url:S_STR,at:{type:'string',description:DUE},attendees:S_STR,prep:S_STR},['title','at'])]};
  Object.keys(WAI).forEach(function(k){
    var T=A&&A.tools&&A.tools[k];
    TOOLS[k]={g:WAI[k][0],kind:'write',d:(T&&T.desc)||k.replace(/_/g,' '),s:WAI[k][1],
      run:function(a,ctx){
        if(!A) return {error:'Work OS tools are not available'};
        var v=A.validate([{tool:k,args:a}]);
        if(!v.ok.length) return {error:(v.bad[0]&&(v.bad[0].why||v.bad[0].error))||'invalid'};
        var before=null;
        if(k==='update_task'){ var it=findItem(a.name); if(!it) return {error:'no task called '+a.name}; before={coll:'items',id:it.id,prev:{status:it.status,priority:it.priority,due:it.due,notes:it.notes}}; }
        if(k==='update_metric'){ var mt=findMetric(a.name); if(mt) before={coll:'metrics',id:mt.id,prev:{value:mt.value,target:mt.target,unit:mt.unit}}; }
        var r=A.execute(v.ok)[0]||{};
        if(!r.ok) return {error:r.why||'failed'};
        if(k==='update_task'&&a.status==='Completed'&&before){ var row=W.find('items',before.id); if(row&&!row.completedAt){ row.completedAt=Date.now(); W.save(); } }
        if(before) ctx.undo(before); else if(COLL[k]&&r.id) ctx.undo({coll:COLL[k],id:r.id,created:true});
        else if(k==='update_metric'&&r.id) ctx.undo({coll:'metrics',id:r.id,created:true});
        return {ok:true,name:r.name||a.name||a.title};
      },
      describe:function(a){ var d=A&&A.describe?A.describe([{tool:k,args:a}])[0]:null; return d||{t:k,n:a.name||a.title||'',s:''}; },
      label:function(r,a){
        if(r.error) return 'Could not '+k.replace(/_/g,' ')+': '+r.error;
        var n=r.name||a.name||a.title||'';
        return ({create_task:'Created task',update_task:'Updated task',create_board:'Created board',create_process:'Created process',create_project:'Created project',
          create_goal:'Set goal',update_metric:'Recorded metric',create_content_draft:'Drafted content',schedule_meeting:'Scheduled'}[k]||k)+' \u201c'+n+'\u201d'
          +(k==='update_task'?[a.status&&(' \u2192 '+a.status),a.due&&(' \u2192 due '+a.due),a.priority&&(' \u2192 '+a.priority)].filter(Boolean).join(''):'');
      }};
  });
  function toolsFor(e){
    var g=['read','always'].concat(e.tools||[]); if(e.tpl==='chief') g.push('chief');
    return Object.keys(TOOLS).filter(function(k){ return g.indexOf(TOOLS[k].g)>=0; });
  }
  function needsOK(e,T){ return T.kind==='external'||(T.kind==='write'&&e.approval==='all'); }
  function toolDefs(e){ return toolsFor(e).map(function(k){ return {name:k,description:TOOLS[k].d,input_schema:TOOLS[k].s}; }); }
  function byName(q){
    q=String(q||'').toLowerCase().trim(); if(!q) return null;
    var L=emps();
    return L.filter(function(e){ return e.n.toLowerCase()===q||e.title.toLowerCase()===q; })[0]
      ||L.filter(function(e){ return q.indexOf(e.n.toLowerCase())>=0||e.title.toLowerCase().indexOf(q)>=0||q.indexOf(e.title.toLowerCase())>=0; })[0]||null;
  }

  /* ---------------- routines while Kova is closed (p15) ----------------
     The routines you mark "Also run when Kova is closed" are registered
     with the server (functions/crew.js). What they did comes back here as
     a finished job, its proposed changes waiting for you one by one. */
  function tzName(){ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'; }catch(x){ return 'UTC'; } }
  function syncCloud(){
    if(!(window.KovaLink&&KovaLink.authFetch)) return Promise.resolve(false);
    var list=emps().filter(function(e){ var r=e.routine||{}; return e.enabled&&r.cloud&&r.job&&['daily','weekdays','weekly'].indexOf(r.freq)>=0; })
      .map(function(e){ return {id:e.id,freq:e.routine.freq,time:e.routine.time||'09:00',dow:+e.routine.dow||0}; });
    var watches=[];
    emps().forEach(function(e){ if(!e.enabled) return;
      (e.skills||[]).forEach(function(k){ var v=k.every; if(k.text&&v&&v.cloud&&['daily','weekdays','weekly'].indexOf(v.freq)>=0) list.push({id:e.id,sk:k.id,freq:v.freq,time:v.time||'09:00',dow:+v.dow||0}); });
      (e.watches||[]).forEach(function(x){ if(x&&x.url) watches.push({id:x.id,url:x.url,emp:e.id,note:x.note||''}); }); });
    var key=JSON.stringify(list)+JSON.stringify(watches)+tzName(), had=lsJ('kova.crew.cloud',false);
    if(key===S.cloudKey) return Promise.resolve(true);
    /* only for someone signed in, and only when there is something to say:
       routines to register, or ones registered before that are now off
       (never a sign-in just for this) */
    if(!serverLikely()||(!list.length&&!watches.length&&!had)) return Promise.resolve(false);
    return KovaLink.authFetch('/crew/cloud',{json:{tz:tzName(),emps:list,watches:watches}}).then(function(r){ if(r.ok){ S.cloudKey=key; lsPut('kova.crew.cloud',list.length+watches.length>0); return true; } return false; },function(){ return false; });
  }
  function importCloud(it){
    var e=emp(it.emp); if(!e||!it||!it.id||S.jobs['jc_'+it.id]) return null;
    var props=(it.proposals||[]).filter(function(p){ return p&&TOOLS[p.name]; });
    var ak=it.ask||null, AKN={prep:'Prepped tomorrow\u2019s meetings',checkin:'Checked in on you',comments:'Read the comments on your post'};
    var job={id:'jc_'+it.id,emp:e.id,text:String(it.text||(ak&&AKN[ak.kind])||(e.routine&&e.routine.job)||''),source:'cloud',meta:null,at:it.at||Date.now(),state:'running',
      steps:[{t:ak?(ak.deliverAt&&ak.deliverAt>(it.at||0)-5*60e3&&ak.kind==='ask'?'Worked on it on the Kova server, ready for '+clock(ak.deliverAt)+' as you asked':(AKN[ak.kind]||'Worked on it on the Kova server')+' while Kova was closed'):'Ran on the Kova server while Kova was closed',k:'info',at:it.at}].concat((it.steps||[]).map(function(x){ return {t:String(x.t||''),k:x.k||'info',at:it.at}; })),
      changes:[],queue:props.map(function(p,i){ return {id:'p'+i,name:p.name,input:p.input||{}}; }),results:[],turns:0,convo:null,brain:'cloud',
      model:it.model||'',say:String(it.say||''),report:it.report||null};
    if(it.sk||it.watch) job.source=it.sk?'skill':'watch';
    S.jobs[job.id]=job;
    if(it.sk) touch(e,{runs:(e.runs||0)+1,lastRun:it.at||Date.now(),skills:(e.skills||[]).map(function(x){ return x.id===it.sk?Object.assign({},x,{last:Math.max(+x.last||0,it.at||0)}):x; })});
    else if(it.watch) touch(e,{runs:(e.runs||0)+1,lastRun:it.at||Date.now()});
    else touch(e,{runs:(e.runs||0)+1,lastRun:it.at||Date.now(),lastRoutine:Math.max(e.lastRoutine||0,it.at||0)});
    if(job.queue.length) proceed(job); else finish(job,job.say||'Done.');
    return job;
  }
  function pullCloud(){
    if(S.pulling||!serverLikely()) return Promise.resolve(0);
    S.pulling=true;
    return KovaLink.authFetch('/crew/inbox').then(function(r){ return r.ok?r.json():{items:[]}; }).then(function(j){
      var got=(j.items||[]).map(importCloud).filter(Boolean);
      var ids=(j.items||[]).map(function(x){ return x&&x.id; }).filter(Boolean);
      if(ids.length) KovaLink.authFetch('/crew/inbox/ack',{json:{ids:ids}}).catch(function(){});
      if(got.length){ saveJobs(); paintSoon(); notify(); }
      S.pulling=false; return got.length;
    }).catch(function(){ S.pulling=false; return 0; });
  }

  /* ---------------- teach by showing (p15) ----------------
     Do the job once yourself in Work OS while Kova records it; the steps
     become that employee's routine. Dates are kept relative ("due in 2
     days"), so the routine still makes sense next week. It replays through
     the same tools the employee uses, so every change can be undone. */
  var TEACH={items:'create_task',projects:'create_project',goals:'create_goal',meetings:'schedule_meeting',content:'create_content_draft',metrics:'update_metric'};
  function rel(t){ if(!t) return ''; var d=Math.round((new Date(t).setHours(0,0,0,0)-sod())/DAY); return d<=0?'today':d===1?'tomorrow':'+'+d+'d'; }
  function teachStep(op,coll,row,patch){
    if(op==='create'){
      var k=TEACH[coll]; if(!k) return null;
      var a={create_task:{name:row.name,priority:row.priority,status:row.status,due:rel(row.due),notes:row.notes},
        create_project:{name:row.name,desc:row.desc},create_goal:{name:row.name,target:row.target,current:row.current,unit:row.unit},
        schedule_meeting:{title:row.title||row.name,at:rel(row.at),prep:row.prep},create_content_draft:{title:row.title||row.name,idea:row.idea,platform:row.platform},
        update_metric:{name:row.name,value:row.value,target:row.target,unit:row.unit}}[k];
      Object.keys(a).forEach(function(x){ if(a[x]==null||a[x]==='') delete a[x]; });
      return (a.name||a.title)?{tool:k,input:a}:null;
    }
    if(op==='update'&&coll==='items'&&row&&row.name){
      var u={name:row.name}; ['status','priority','notes'].forEach(function(x){ if(patch[x]!=null) u[x]=patch[x]; }); if(patch.due!=null) u.due=rel(patch.due);
      return Object.keys(u).length>1?{tool:'update_task',input:u}:null;
    }
    return null;
  }
  function hookTeach(){
    if(W.__teach) return; W.__teach=true;
    var c0=W.create, u0=W.update;
    W.create=function(coll,obj,actor){ var r=c0.apply(W,arguments); try{ if(S.teach&&(actor==null||actor==='user')&&coll!=='agents'){ var st=teachStep('create',coll,r||obj); if(st){ S.teach.steps.push(st); teachBar(); } } }catch(e){} return r; };
    W.update=function(coll,id,patch,actor){ var row=null; try{ row=W.find(coll,id); }catch(e){} var r=u0.apply(W,arguments);
      try{ if(S.teach&&(actor==null||actor==='user')&&coll!=='agents'){ var st=teachStep('update',coll,row,patch||{}); if(st){ S.teach.steps.push(st); teachBar(); } } }catch(e){} return r; };
  }
  function teachStart(e){ hookTeach(); S.teach={emp:e.id,steps:[],at:Date.now()}; teachBar(); say('Recording. Do the job in Work OS the way you want '+e.n+' to do it, then tap Done.'); try{ go('worktasks'); }catch(x){} }
  function teachBar(){
    var b=document.getElementById('crwTeach');
    if(!S.teach){ if(b) b.remove(); return; }
    var e=emp(S.teach.emp); if(!e){ S.teach=null; if(b) b.remove(); return; }
    if(!b){ b=document.createElement('div'); b.id='crwTeach'; b.className='crw-teach'; b.setAttribute('role','status'); document.body.appendChild(b);
      b.addEventListener('click',function(ev){ var x=ev.target.closest('[data-tc]'); if(!x) return; if(x.getAttribute('data-tc')==='done') teachDone(); else { S.teach=null; teachBar(); say('Nothing was saved.'); } }); }
    var n=S.teach.steps.length;
    b.innerHTML='<i></i><span>Teaching <b>'+esc(e.n)+'</b> \u00b7 '+n+' step'+(n===1?'':'s')+'</span><button data-tc="done">Done</button><button data-tc="x" aria-label="Cancel teaching">\u2715</button>';
  }
  function teachDone(){
    var t=S.teach; S.teach=null; teachBar();
    var e=t&&emp(t.emp); if(!e) return;
    if(!t.steps.length){ say('Nothing was recorded. Add or change a task while teaching.'); return; }
    var steps=t.steps.slice(0,30);
    saveEmp(e,{taught:{at:Date.now(),steps:steps}});
    count('taught');
    say(e.n+' learned '+steps.length+' step'+(steps.length>1?'s':'')+'. Run it from their page, or make it their routine.');
    try{ go('workteam'); }catch(x){}
    S.view='team'; S.nav='team'; S.tab=e.id; paint();
  }
  function teachLine(st){ var T=TOOLS[st.tool], d=T&&T.describe?T.describe(st.input):null; return d?(d.t+(d.n?' \u201c'+d.n+'\u201d':'')+(d.s?' \u00b7 '+d.s:'')):st.tool.replace(/_/g,' '); }
  function runTaught(e,source){
    if(!e.taught||!e.taught.steps||!e.taught.steps.length) return null;
    var job={id:uid('j'),emp:e.id,text:'Do it the way I showed you ('+e.taught.steps.length+' steps).',source:source||'you',meta:null,at:Date.now(),
      state:'running',steps:[],changes:[],queue:[],results:[],turns:0,convo:null,brain:'taught',left:e.taught.steps.slice()};
    S.jobs[job.id]=job; touch(e,{runs:(e.runs||0)+1,lastRun:Date.now()});
    log(job,'Following what you showed me','info'); saveJobs(); paintSoon();
    setTimeout(function(){ runTaughtNext(job); },200);
    return job;
  }
  function runTaughtNext(job){
    if(job.state!=='running') return;
    var e=emp(job.emp), st=job.left.shift();
    if(!st){ finish(job,'Done the way you showed me.'); return; }
    var T=TOOLS[st.tool];
    if(!T||toolsFor(e).indexOf(st.tool)<0){ log(job,'Skipped: '+e.n+' is not allowed to '+st.tool.replace(/_/g,' '),'blocked'); }
    else { var r=exec(job,T,JSON.parse(JSON.stringify(st.input)),st.tool); log(job,T.label?T.label(r||{},st.input):st.tool,r&&r.error?'error':'write'); }
    job.queue=job.left.length?[{name:job.left[0].tool,input:job.left[0].input}]:[];
    saveJobs(); paintSoon();
    setTimeout(function(){ runTaughtNext(job); },450);
  }

  /* ---------------- routing: who owns this? ---------------- */
  function route(text){
    var L=emps().filter(function(e){ return e.enabled; }); if(!L.length) return null;
    var t=String(text||'').toLowerCase();
    var named=L.filter(function(e){ var nm=e.n.toLowerCase().replace(/[^a-z0-9]/g,''); return nm.length>=2&&new RegExp('\\b'+nm+'\\b').test(t); })[0];
    if(named) return {emp:named,why:'you named '+named.n,matched:[]};
    var qw=words(text).filter(function(v,i,x){ return x.indexOf(v)===i; });
    /* a word only one teammate's job mentions says more than one everybody's does */
    var docs=L.map(function(e){ return words(e.title+' '+e.job+' '+(e.playbook||'')); }), df={};
    docs.forEach(function(d){ d.filter(function(v,i,x){ return x.indexOf(v)===i; }).forEach(function(w){ df[w]=(df[w]||0)+1; }); });
    var best=null, score=0, hit=[];
    L.forEach(function(e,ix){
      var T=tpl(e.tpl), own=docs[ix], m=[], s=0;
      qw.forEach(function(w){ if(own.indexOf(w)>=0){ s+=2/df[w]; m.push(w); } });
      ((T&&T.hints)||[]).forEach(function(h){ if(t.indexOf(h)>=0){ s+=2; m.push(h); } });
      if(e.tpl==='chief') s-=0.5;
      if(s>score){ score=s; best=e; hit=m; }
    });
    if(best&&score>=1.5) return {emp:best,why:'matches '+best.n+'\u2019s job',matched:hit.filter(function(v,i,a){ return a.indexOf(v)===i; }).slice(0,4)};
    var c=chief()||L[0];
    return {emp:c,why:'nobody owns it outright, so '+c.n+' takes it',matched:[]};
  }

  /* ---------------- the prompt ---------------- */
  function system(e){
    var team=emps().filter(function(x){ return x.enabled&&x.id!==e.id; }).map(function(x){ return '- '+x.n+', '+x.title+': '+String(x.job).split('.')[0]+'.'; }).join('\n');
    var mem=(e.memory||[]).slice(-15).map(function(m){ return '- '+m.t; }).join('\n');
    var me=(window.KP&&KP.get('me'))||{};
    var d=new Date(), tz='UTC'; try{ tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'; }catch(x){}
    return 'You are '+e.n+', '+e.title+' on '+(me.name?me.name+'\u2019s':'the user\u2019s')+' team inside Kova Work OS. You are an AI employee: you do the work end to end, you do not just advise.\n\n'
      +'YOUR JOB\n'+String(e.job||'')+'\n\n'
      +(e.playbook?'HOW YOU WORK\n'+e.playbook+'\n\n':'')
      +'WHAT GOOD WORK LOOKS LIKE\n'+(ROLE[e.tpl]||'A concrete result the user can act on today: numbers from their data, at least one chart, and specific advice that names tasks, dates or amounts.')+'\n\n'
      +(function(){ var sn=snapshot(e); return sn?'KOVA\u2019S ANALYSIS BEFORE YOU START ('+sn.skillName+')\n'+JSON.stringify({summary:sn.summary,metrics:(sn.metrics||[]).map(function(m){ return m.label+': '+m.value+(m.unit||'')+' ('+m.note+')'; })}).slice(0,1600)+'\n\n':''; })()
      +'RULES\n'
      +'- Look at the real data with your read tools before you act. Never invent numbers, names, dates or email addresses; if something is missing, say so.\n'
      +'- Answer whatever the user asks you, directly, even when it is outside your title: health, sleep, food, training, money, life or work. Never say you only handle one area. For their body, use YOUR HEALTH below or read_health; for general knowledge, answer from what you know and say when something needs a doctor.\n'
      +'- Hand a job to a teammate (hand_off) only when it needs that teammate\u2019s tools.\n'
      +'- Keep going until the job is done; do not stop to ask what you can find out yourself. If you truly need a decision, finish and say exactly what you need.\n'
      +'- Email is prepared for the user to approve; you never send anything yourself. Posts are Studio drafts; the user publishes.\n'
      +'- A question gets a direct answer: a few short lines, their numbers first, then what to do. Call write_report only for real work (a plan, an analysis, a weekly report), once, with at least one chart built from real numbers, then one short closing sentence.\n'
      +'- Write plainly, like a capable colleague. No filler, no emojis.\n\n'
      +(team?'TEAM\n'+team+'\n\n':'')
      +'YOUR HEALTH (from Kova)\n'+healthText()+'\n\n'
      +'ABOUT THE BUSINESS\n'+((A&&A.context)?A.context():'')+'\n\n'
      +(mem?'WHAT YOU REMEMBER\n'+mem+'\n\n':'')
      +'Now: '+d.toDateString()+' '+clock(d.getTime())+' ('+tz+').';
  }

  /* ---------------- brains ---------------- */
  function keyBrain(){ try{ if(window.KovaModel&&KovaModel.connected()){ var c=KovaModel.cfg(); if(c&&c.p==='anthropic'&&c.key) return c; } }catch(e){} return null; }
  function serverLikely(){ try{ return !S.down.server&&!!(window.KovaLink&&KovaLink.authFetch&&window.KOVA_FB&&KOVA_FB.ok&&KOVA_FB.auth&&KOVA_FB.auth.currentUser); }catch(e){ return false; } }
  function brainName(){ return serverLikely()?'server':(keyBrain()?'key':'local'); }
  /* why the team is answering without AI, in words the owner can act on */
  function brainWhy(){
    if(S.down&&S.down.why) return S.down.why;
    try{ if(!(window.KOVA_FB&&KOVA_FB.auth&&KOVA_FB.auth.currentUser)) return 'you are not signed in, so the team cannot reach the Kova server'; }catch(e){}
    return 'the Kova server could not be reached';
  }
  var BRAIN_N={server:'Kova server \u00b7 Claude',key:'Your Claude key',local:'Offline routines',taught:'What you showed them',cloud:'Kova server \u00b7 while Kova was closed'};

  /* ---------------- the model router (p15) ----------------
     Each employee thinks with Haiku, Sonnet or Opus. "Auto" picks by the
     role (quick triage on Haiku, writing and analysis on Sonnet) and steps
     up to Sonnet when a job runs long. You can pin one per employee. */
  var MODELS={haiku:'Haiku',sonnet:'Sonnet',opus:'Opus'};
  var MODEL_ID={haiku:'claude-haiku-4-5-20251001',sonnet:'claude-sonnet-5-5',opus:'claude-opus-5-5'};
  var AUTO={chief:'sonnet',pm:'haiku',analyst:'sonnet',inbox:'haiku',content:'sonnet',research:'sonnet',finance:'haiku',sched:'haiku',coach:'haiku',social:'sonnet'};
  function pickModel(e,job){
    if(e.model&&MODELS[e.model]) return e.model;
    var m=AUTO[e.tpl]||'sonnet';
    if(m==='haiku'&&job&&job.turns>=5) m='sonnet';
    return m;
  }
  /* ---------------- weekly limits and the loop guard (p15) ----------------
     Every employee has a weekly step budget (one step = one think). A job
     stops when its employee runs out, two teammates handing the same work
     back and forth are stopped, and if the whole team takes more than 40
     steps in two minutes every job pauses until you look. */
  var UKEY='kova.crew.use.v1', BUDGETS=[50,150,400,1000];
  function weekKey(t){ var d=new Date(t||Date.now()); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d.toISOString().slice(0,10); }
  function use(){ var u=lsJ(UKEY,null); if(!u||u.wk!==weekKey()) u={wk:weekKey(),steps:{},models:{},loops:0,paused:0,parallel:0,tokens:0,taught:0}; return u; }
  function budgetOf(e){ return +e.budget||150; }
  function usedBy(e){ return use().steps[e.id]||0; }
  function bump(e,model,usage){
    var u=use(); u.steps[e.id]=(u.steps[e.id]||0)+1; u.models[model]=(u.models[model]||0)+1;
    if(usage) u.tokens+=(+usage.input_tokens||0)+(+usage.output_tokens||0);
    lsPut(UKEY,u);
    S.recent=(S.recent||[]).filter(function(t){ return Date.now()-t<120e3; }); S.recent.push(Date.now());
    if(S.recent.length>40){ S.recent=[]; runaway(); }
  }
  function count(k){ var u=use(); u[k]=(u[k]||0)+1; lsPut(UKEY,u); }
  function runaway(){
    var n=0;
    jobsOf().forEach(function(j){ if(j.state==='running'){ j.state='paused'; log(j,'Paused by the runaway guard: the team took over 40 steps in two minutes','blocked'); n++; } });
    if(n){ count('paused'); saveJobs(); paintSoon(); say('The runaway guard paused '+n+' job'+(n>1?'s':'')+'. Check them, then hand back.'); }
  }
  function think(job,e){
    var model=pickModel(e,job); job.model=model;
    var payload={system:system(e),messages:job.convo,tools:toolDefs(e),web:(e.tools||[]).indexOf('research')>=0,model:model};
    function viaKey(){
      var c=keyBrain(); if(!c) return Promise.reject(new Error('no-brain'));
      var tools=payload.tools.slice(); if(payload.web) tools.push({type:'web_search_20250305',name:'web_search',max_uses:3});
      return fetch('https://api.anthropic.com/v1/messages',{method:'POST',
        headers:{'content-type':'application/json','x-api-key':c.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:MODEL_ID[model]||c.model||'claude-sonnet-5-5',max_tokens:2000,system:payload.system,tools:tools,messages:payload.messages})})
        .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error((j.error&&j.error.message)||('HTTP '+r.status)); job.brain='key'; return j; }); });
    }
    if(serverLikely()){
      return KovaLink.authFetch('/crew/step',{json:payload}).then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(j){
          if(r.ok){ job.brain='server'; return j; }
          if(r.status===429) throw new Error(j.error||'Daily limit reached.');
          S.down.server=true; S.down.why=String(j.error||('the Kova server answered '+r.status)); return viaKey();
        });
      },function(){ S.down.server=true; S.down.why='the Kova server did not answer'; return viaKey(); });
    }
    return viaKey();
  }

  /* ---------------- jobs ---------------- */
  function loadJobs(){
    S.jobs=lsJ(JKEY,{});
    Object.keys(S.jobs).forEach(function(k){ var j=S.jobs[k]; if(j.state==='running'||j.state==='paused'){ j.state='stopped'; j.note='Stopped when Kova was closed.'; } });
  }
  function saveJobs(){
    var L=Object.keys(S.jobs).map(function(k){ return S.jobs[k]; }).sort(function(a,b){ return b.at-a.at; });
    var keep={}; L.slice(0,50).forEach(function(j){ if(j.state==='done'||j.state==='failed'||j.state==='stopped') j.convo=j.convo&&j.convo.length>2?null:j.convo; keep[j.id]=j; });
    S.jobs=keep; lsPut(JKEY,noPhotos(keep));
  }
  /* p31: an attached photo travels with the job while it runs, but storage
     keeps only the words (a photo would fill the browser's space) */
  function noPhotos(all){
    var out={};
    Object.keys(all).forEach(function(k){ var j=all[k];
      var has=j.convo&&j.convo.some(function(m){ return Array.isArray(m.content)&&m.content.some(function(b){ return b&&b.type==='image'; }); });
      out[k]=has?Object.assign({},j,{convo:j.convo.map(function(m){ return Array.isArray(m.content)?{role:m.role,content:m.content.map(function(b){ return b&&b.type==='image'?{type:'text',text:'[a photo was attached]'}:b; })}:m; })}):j; });
    return out;
  }
  function jobsOf(id){ return Object.keys(S.jobs).map(function(k){ return S.jobs[k]; }).filter(function(j){ return !id||j.emp===id; }).sort(function(a,b){ return a.at-b.at; }); }
  function waiting(){ return jobsOf().filter(function(j){ return j.state==='waiting'; }); }
  function busyWith(id){ return jobsOf(id).filter(function(j){ return j.state==='running'||j.state==='waiting'||j.state==='paused'; })[0]||null; }
  function log(job,t,kind,extra){ job.steps.push(Object.assign({t:t,k:kind||'info',at:Date.now()},extra||{})); }

  /* hand-offs that go round in circles are stopped, not run */
  function chainOf(meta){ var out=[], id=meta&&meta.parent; while(id&&S.jobs[id]&&out.length<10){ out.push(S.jobs[id]); id=S.jobs[id].meta&&S.jobs[id].meta.parent; } return out; }
  function start(e,text,source,meta){
    if(!e||!String(text||'').trim()) return null;
    if(meta&&meta.parent){
      var ch=chainOf(meta), back=ch.some(function(j){ return j.emp===e.id; });
      if(ch.length>=4||back){
        var par=S.jobs[meta.parent];
        if(par){ log(par,'Loop stopped: '+(back?'this work was already '+e.n+'\u2019s earlier in the chain':'the hand-off chain was '+ch.length+' long')+', so it was not handed on again','blocked'); saveJobs(); paintSoon(); }
        count('loops'); return null;
      }
    }
    if(source==='routine'&&e.taught&&e.routine&&e.routine.taught) return runTaught(e,'routine');
    var job={id:uid('j'),emp:e.id,text:String(text).trim().slice(0,4000),source:source||'you',meta:meta||null,at:Date.now(),
      state:'running',steps:[],changes:[],queue:[],results:[],turns:0,convo:[{role:'user',content:String(text).trim().slice(0,4000)}],brain:brainName()};
    S.jobs[job.id]=job;
    if(meta&&meta.from) log(job,'Handed over by '+meta.from,'handoff');
    touch(e,{runs:(e.runs||0)+1,lastRun:Date.now()});
    saveJobs(); paintSoon();
    setTimeout(function(){ step(job); },30);
    return job;
  }
  function ctxOf(job){
    var e=emp(job.emp);
    return {emp:e,job:job,undo:function(c){ job.changes.push(c); }};
  }
  function step(job){
    if(job.state!=='running') return;
    var e=emp(job.emp); if(!e){ fail(job,'This employee no longer exists.'); return; }
    if(job.brain==='local') return localRun(job);
    if(job.turns>=MAX_TURNS){ finish(job,'I stopped after '+MAX_TURNS+' steps to keep this job short. Tell me to carry on if you want more.'); return; }
    if(usedBy(e)>=budgetOf(e)){ log(job,'Weekly limit reached ('+budgetOf(e)+' steps)','blocked'); finish(job,'I stopped: I have used my '+budgetOf(e)+' steps for this week. Raise my weekly limit in my settings if this job matters.'); return; }
    log(job,(job.turns?'Thinking about the results':'Reading the job')+' \u00b7 '+MODELS[pickModel(e,job)],'think');
    paintSoon();
    think(job,e).then(function(res){
      if(job.state!=='running'&&job.state!=='paused') return;
      job.steps.pop();
      bump(e,job.model||'sonnet',res&&res.usage);
      handle(job,res);
    }).catch(function(err){
      if(job.state!=='running'&&job.state!=='paused') return;
      job.steps.pop();
      if(String(err&&err.message)==='no-brain'){ job.brain='local'; return localRun(job); }
      fail(job,'I could not reach my brain: '+String(err&&err.message||err));
    });
  }
  /* what came back from one think: say it, then do the tools (unless paused) */
  function handle(job,res){
      var content=(res&&res.content)||[];
      job.convo.push({role:'assistant',content:content});
      content.forEach(function(b){
        if(b.type==='text'&&b.text&&b.text.trim()) job.say=b.text.trim();
        if(b.type==='server_tool_use'&&b.name==='web_search') log(job,'Searched the web: '+String((b.input&&b.input.query)||'').slice(0,90),'web');
        if(b.type==='web_search_tool_result'&&Array.isArray(b.content)) job.sources=(job.sources||[]).concat(b.content.filter(function(x){ return x&&x.url; }).slice(0,5).map(function(x){ return {t:x.title||x.url,u:x.url}; })).slice(0,8);
      });
      job.queue=content.filter(function(b){ return b.type==='tool_use'; });
      job.results=[];
      if(!job.queue.length){ finish(job,job.say||''); return; }
      proceed(job);
  }
  function proceed(job){
    if(job.state!=='running') return;               /* you stopped it while a step was in flight */
    var e=emp(job.emp);
    while(job.queue.length){
      var tu=job.queue[0], T=TOOLS[tu.name];
      if(!T||toolsFor(e).indexOf(tu.name)<0){
        job.results.push({type:'tool_result',tool_use_id:tu.id,content:JSON.stringify({error:'You do not have the '+tu.name+' tool. Hand off to a teammate who does, or say what you need.'}),is_error:true});
        log(job,'Blocked: '+tu.name+' is not one of '+e.n+'\u2019s tools','blocked'); job.queue.shift(); continue;
      }
      if(needsOK(e,T)||job.brain==='cloud'){
        job.state='waiting'; job.ask={id:tu.id,name:tu.name,input:tu.input||{}};
        log(job,'Waiting for your approval','wait');
        saveJobs(); paintSoon(); notify(); return;
      }
      var r=exec(job,T,tu.input||{},tu.name);
      if(r&&typeof r.then==='function'){ r.then(function(res){ afterExec(job,tu,T,res); proceed(job); }); return; }
      afterExec(job,tu,T,r);
    }
    if(job.brain==='local'){ localFinish(job); return; }
    if(job.brain==='cloud'){ finish(job,job.say||'Done.'); return; }
    if(job.tell){ job.results.push({type:'text',text:'A note from the user while you work: '+job.tell}); job.tell=''; }
    job.convo.push({role:'user',content:job.results}); job.results=[]; job.turns++;
    saveJobs(); step(job);
  }
  function exec(job,T,input,name){
    try{ return T.run(input,ctxOf(job)); }catch(err){ return {error:String(err&&err.message||err)}; }
  }
  function afterExec(job,tu,T,r){
    r=r||{};
    var kind=r.error?'error':(T.kind==='read'?'read':(T.kind==='external'?'send':(tu.name==='hand_off'?'handoff':(tu.name==='write_report'?'report':'write'))));
    if(tu.name!=='write_report') log(job,T.label?T.label(r,tu.input||{}):tu.name,kind);
    var body=JSON.stringify(r); if(body.length>9000) body=body.slice(0,9000)+'\u2026(truncated)';
    job.results.push({type:'tool_result',tool_use_id:tu.id,content:body,is_error:!!r.error});
    job.queue.shift();
  }
  function approve(jobId,edits,action){
    var job=S.jobs[jobId]; if(!job||job.state!=='waiting'||!job.ask) return;
    var tu=job.queue[0]; if(!tu||tu.id!==job.ask.id) return;
    tu.input=Object.assign({},tu.input||{},edits||{}); if(action) tu.input.__action=action;
    job.state='running'; job.ask=null; job.steps.pop();
    log(job,'You approved it','ok');
    var T=TOOLS[tu.name], r=exec(job,T,tu.input,tu.name);
    var go=function(res){ delete tu.input.__action; afterExec(job,tu,T,res); saveJobs(); paintSoon(); proceed(job); };
    if(r&&typeof r.then==='function') r.then(go); else go(r);
  }
  function skip(jobId,why){
    var job=S.jobs[jobId]; if(!job||job.state!=='waiting') return;
    var tu=job.queue.shift(); job.state='running'; job.ask=null; job.steps.pop();
    log(job,'You skipped: '+((TOOLS[tu.name]&&TOOLS[tu.name].describe)?TOOLS[tu.name].describe(tu.input||{}).n:tu.name),'skip');
    job.results.push({type:'tool_result',tool_use_id:tu.id,content:JSON.stringify({declined:true,reason:why||'The user skipped this. Do not retry it; carry on without it.'})});
    saveJobs(); paintSoon(); proceed(job);
  }
  /* step in: pause a job between steps, change what it is about to do,
     tell it something, then hand it back */
  function pauseJob(jobId){ var job=S.jobs[jobId]; if(!job||job.state!=='running') return; job.state='paused'; log(job,'You stepped in','wait'); saveJobs(); paintSoon(); }
  function resume(jobId,edits){
    var job=S.jobs[jobId]; if(!job||job.state!=='paused') return;
    if(edits&&Object.keys(edits).length){
      var nx=job.brain==='taught'?job.left&&job.left[0]:job.queue[0];
      if(nx){ nx.input=Object.assign({},nx.input||{},edits); log(job,'You changed the next step','ok'); }
    }
    job.state='running'; log(job,'You handed it back','ok'); saveJobs(); paintSoon();
    if(job.brain==='taught') return runTaughtNext(job);
    if(job.queue.length||job.results.length) proceed(job); else step(job);
  }
  function tell(jobId,text){
    var job=S.jobs[jobId]; text=String(text||'').trim(); if(!job||!text) return;
    if(job.state!=='running'&&job.state!=='paused'&&job.state!=='waiting') return;
    job.tell=(job.tell?job.tell+'\n':'')+text.slice(0,600); log(job,'You said: '+text.slice(0,120),'info'); saveJobs(); paintSoon();
  }
  function stop(jobId){ var job=S.jobs[jobId]; if(!job) return; if(job.state==='running'||job.state==='waiting'||job.state==='paused'){ job.state='stopped'; job.ask=null; job.note='You stopped this job.'; job.end=Date.now(); settle(job); saveJobs(); paintSoon(); } }
  function undo(jobId){
    var job=S.jobs[jobId]; if(!job||!job.changes.length) return 0;
    var n=0;
    job.changes.slice().reverse().forEach(function(c){
      try{ if(c.created){ if(W.remove(c.coll,c.id,'user')) n++; } else if(c.prev){ var p={}; Object.keys(c.prev).forEach(function(k){ p[k]=c.prev[k]; }); W.update(c.coll,c.id,p,'user'); n++; } }catch(x){}
    });
    job.changes=[]; job.undone=n; saveJobs(); paintSoon();
    try{ if(window.__workDraw) __workDraw.refresh(); }catch(x){}
    return n;
  }
  /* jobs a teammate is waiting on (delegate) */
  function settle(job){ var w=S.waits&&S.waits[job.id]; if(w){ delete S.waits[job.id]; w(job); } }
  function finish(job,closing){
    job.state='done'; job.end=Date.now(); job.say=closing||job.say||''; job.queue=[];
    settle(job); if(lsJ('kova.crew.voice',false)&&visible()) speak(job);
    if(!job.report&&job.say) job.report=null;
    saveJobs(); paintSoon(); notify();
    try{ if(window.__workDraw) __workDraw.refresh(); }catch(x){}
    (job.after||[]).forEach(function(h){ var t=emp(h.to), from=emp(job.emp); if(t) start(t,h.job,'handoff',{from:from?from.n:'a teammate',parent:job.id}); });
  }
  function fail(job,why){ job.state='failed'; job.end=Date.now(); job.note=why; settle(job); saveJobs(); paintSoon(); }
  /* voice: the closing words and the report, read aloud */
  function speak(job){
    /* p43: the shared voice (natural when the server has it), the report read as
       parts with breaths between them; the "without AI" note is not read out */
    if(job&&window.KovaVoice){
      var w=emp(job.emp), rp=job.report, say=/without AI \(/.test(job.say||'')?'':String(job.say||job.note||'');
      var txt=[(w?w.n+'.':''),say,rp&&rp.summary?rp.summary:''].filter(Boolean).join(' ')
        +(rp&&rp.sections?'\n\n'+rp.sections.map(function(x){ return '## '+x.heading+'\n'+x.text; }).join('\n\n'):'');
      return KovaVoice.speak(txt);
    }
    try{
      if(!window.speechSynthesis||!job) return false;
      var who=emp(job.emp), r=job.report;
      var t=(who?who.n+'. ':'')+String(job.say||job.note||'').replace(/[*#>`]/g,'')+(r&&r.summary?' '+String(r.summary).replace(/[*#>`]/g,''):'');
      speechSynthesis.cancel(); var u=new SpeechSynthesisUtterance(t.slice(0,1200)); u.rate=1.03; speechSynthesis.speak(u); return true;
    }catch(e){ return false; }
  }

  /* =====================================================================
     SKILLS: what each role actually delivers.

     Every skill reads your real Work OS data and returns a full piece of
     work: numbers, charts and concrete advice. The Content Producer plans
     the week's posts with hooks, captions, hashtags, times and goals; the
     Chief of Staff ranks the day and blocks it out; the Project Manager
     re-dates late work and breaks projects down; the Growth Analyst
     measures and recommends; Client Success drafts the follow-ups; and so
     on. They run on this device, so the team does real work before the
     Kova server is connected. With the server, Claude does the job and is
     handed the same analysis and the same brief for what good work is.
     ===================================================================== */
  var PW={Critical:4,High:3,Medium:2,Low:1};
  function prof(){ return (W.all()||{}).profile||{}; }
  function myName(){ var m=(window.KP&&KP.get('me'))||{}; return String(m.name||'').trim().split(/\s+/)[0]||''; }
  function openItems(){ return W.list('items',function(i){ return i.status!=='Completed'; }); }
  function late(i){ return i.due&&i.due<sod()?Math.max(1,Math.round((sod()-i.due)/DAY)):0; }
  function wd(t,short){ return new Date(t).toLocaleDateString('en-US',{weekday:short?'short':'long'}); }
  function dm(t){ var d=new Date(t); return ('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2); }
  function hm(t){ var d=new Date(t); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }
  function wkNo(){ var d=new Date(), j=new Date(d.getFullYear(),0,1); return Math.floor((d-j)/(7*DAY)); }
  function lbl(t){ return A&&A.dateLabel?A.dateLabel(t):(t?new Date(t).toDateString():'no date'); }
  function rank(i){ var s=PW[i.priority]||2, l=late(i); if(l) s+=1+Math.min(3,l*.5); if(i.due){ var d=Math.round((i.due-sod())/DAY); if(d===0) s+=2; else if(d===1) s+=1; } if(i.status==='In Progress') s+=.5; return s; }
  function whyTop(i){ var l=late(i), d=i.due?Math.round((i.due-sod())/DAY):null;
    return (i.priority||'Medium')+(l?', '+l+' day'+(l>1?'s':'')+' late':(d===0?', due today':(d===1?', due tomorrow':(d!=null&&d>1?', due '+wd(i.due,false):'')))); }
  function effort(i){ try{ var c=window.KovaCog&&KovaCog.of?KovaCog.of(i):null; if(typeof c==='number') return c; }catch(e){} return (PW[i.priority]||2)*2; }
  function ready(){
    try{ var a=window.KovaAgent&&KovaAgent.audit?KovaAgent.audit():null; if(!a||!a.metrics) return null;
      var fix=a.metrics.filter(function(m){ return m.status==='fix'; }).length, watch=a.metrics.filter(function(m){ return m.status==='watch'; }).length;
      return {level:fix>=2?'low':(fix===1||watch>=2?'medium':'high'),fix:fix,watch:watch}; }catch(e){ return null; }
  }
  function bullets(a){ return a.filter(Boolean).map(function(x){ return '- '+x; }).join('\n'); }
  function next7(){ var out=[]; for(var d=0;d<7;d++){ var s=sod()+d*DAY; out.push({s:s,label:wd(s,true)}); } return out; }
  function money(n){ return '$'+Math.round(n).toLocaleString('en-US'); }
  function cap1(s){ s=String(s||''); return s.charAt(0).toUpperCase()+s.slice(1); }
  function steps(job,k){ return job?job.steps.filter(function(s){ return s.k===k; }).length:0; }

  var SK={};

  /* ---- Chief of Staff: the day, ranked and blocked out ---- */
  SK.brief={n:'Daily brief',
    reads:function(e){ var r=[{name:'list_tasks',input:{filter:'today'}},{name:'list_tasks',input:{filter:'overdue'}}]; if(toolsFor(e).indexOf('read_wellness')>=0) r.push({name:'read_wellness',input:{}}); return r; },
    build:function(){
      var a=analyze(7), op=openItems(), top=op.slice().sort(function(x,y){ return rank(y)-rank(x); }).slice(0,3), rd=ready(), low=rd&&rd.level==='low';
      var meets=W.list('meetings',function(m){ return m.at>=sod()&&m.at<sod()+DAY; }).sort(function(x,y){ return x.at-y.at; });
      var risks=[];
      if(a.overdue) risks.push(a.overdue+' overdue'+(a.oldestOverdue?', the oldest '+a.oldestOverdue.days+' days late':'')+'.');
      if(a.stuck.length) risks.push(a.stuck.length+' waiting on someone for over 3 days: '+a.stuck.slice(0,2).join(', ')+'.');
      a.goals.forEach(function(g){ if(g.behind) risks.push('“'+g.name+'” is at '+g.pct+'%, and should be near '+g.expected+'% by now.'); });
      var heavy=top.slice().sort(function(x,y){ return effort(y)-effort(x); })[0];
      var blocks=[];
      if(top[0]) blocks.push((low?'09:00–09:45':'09:00–10:30')+'  '+top[0].name);
      meets.forEach(function(m){ blocks.push(hm(m.at)+'  '+(m.title||m.name||'Meeting')); });
      if(top[1]) blocks.push('11:00–12:00  '+top[1].name);
      blocks.push('13:30–14:00  Email and replies');
      if(top[2]) blocks.push('14:00–15:00  '+top[2].name);
      blocks.push('17:30  Stop. Note tomorrow’s first task');
      var adv=[];
      if(low) adv.push('Low energy today: one 45-minute block'+(heavy&&top.length>1?', move “'+heavy.name+'” to tomorrow':'')+'.');
      else if(top[0]) adv.push('Guard your first 90 minutes for “'+top[0].name+'”.');
      if(op.length>15) adv.push(op.length+' open tasks: finish 3 a day, archive the stale ones.');
      if(a.overdue>=3) adv.push('Let your Project Manager re-date the '+a.overdue+' overdue tasks.');
      if(!op.length) adv.push('Add the 3 things that make this week a win.');
      var days=next7().map(function(d){ return {label:d.label,value:W.list('items',function(i){ return i.status!=='Completed'&&i.due>=d.s&&i.due<d.s+DAY; }).length}; });
      var mix=['Critical','High','Medium','Low'].map(function(p){ return {label:p,value:op.filter(function(i){ return (i.priority||'Medium')===p; }).length}; });
      return {title:'Your day',
        summary:(a.dueToday?a.dueToday+' due today':'Nothing due today')+(a.overdue?', '+a.overdue+' overdue':'')+(rd?'. Readiness is '+rd.level+'.':'.')+(top[0]?' Start with “'+top[0].name+'”.':''),
        metrics:[{label:'Due today',value:String(a.dueToday),unit:'✓',note:'On your plate'},{label:'Overdue',value:String(a.overdue),unit:'!',note:a.oldestOverdue?'Oldest '+a.oldestOverdue.days+' days':'None late'},
          {label:'In progress',value:String(a.byStatus['In Progress']||0),note:'Already started'},{label:'Readiness',value:rd?cap1(rd.level):'—',note:rd?(rd.fix?rd.fix+' check'+(rd.fix>1?'s':'')+' to fix':'All checks fine'):'No health data yet'}],
        charts:[{type:'bars',title:'Due in the next 7 days',unit:'tasks',data:days},{type:'donut',title:'Open work by priority',data:mix},
          {type:'gauge',title:'Readiness',value:rd?({high:90,medium:60,low:30})[rd.level]:0,unit:'%'},{type:'hills',title:'Work by status',data:statusData(a)}],
        sections:[{heading:'Do first',text:bullets(top.map(function(i){ return '**'+i.name+'**: '+whyTop(i); }))||'- Nothing open. Add the one task that moves your main goal.'},
          {heading:'Your day, blocked out',text:bullets(blocks)},{heading:'At risk',text:bullets(risks)||'- Nothing at risk right now.'},{heading:'My advice',text:bullets(adv)}],
        next:{title:'Start with',value:'09:00',suffix:'/deep work',cap:top[0]?top[0].name:'Your most important task'},
        stages:['Read today’s work','Rank what matters','Block out the day','Flag the risks','Brief you']};
    }};
  function statusData(a){ var st=a.byStatus||{}; return [['Not Started','To do'],['In Progress','Doing'],['Waiting','Waiting'],['Completed','Done']].map(function(k){ return {label:k[1],value:st[k[0]]||0}; }); }

  /* ---- Project Manager: late work re-dated by priority ---- */
  var SHIFT={Critical:'today',High:'tomorrow',Medium:'+3d',Low:'+7d'}, SHIFT_N={today:'today',tomorrow:'tomorrow','+3d':'in 3 days','+7d':'next week'};
  function odSorted(){ return W.overdue().slice().sort(function(a,b){ return (PW[b.priority]||2)-(PW[a.priority]||2)||a.due-b.due; }); }
  SK.triage={n:'Overdue triage',act:/triage|re-?date|move|fix|clean|re-?plan|sort/i,
    reads:function(){ return [{name:'list_tasks',input:{filter:'overdue',limit:25}}]; },
    writes:function(){ return odSorted().slice(0,8).map(function(i){ return {name:'update_task',input:{name:i.name,due:SHIFT[i.priority]||'+3d'}}; }); },
    build:function(e,text,job){
      var moved=steps(job,'write'), skipped=steps(job,'skip'), od=W.overdue(), done=!!moved;
      var B=[['1–2 d',1,2],['3–7 d',3,7],['8–14 d',8,14],['15 d+',15,99999]].map(function(b){ return {label:b[0],value:od.filter(function(i){ var l=late(i); return l>=b[1]&&l<=b[2]; }).length}; });
      var closers=od.filter(function(i){ return (i.priority||'Medium')==='Low'&&late(i)>14; });
      var plan=odSorted().slice(0,8).map(function(i){ return '**'+i.name+'** → '+SHIFT_N[SHIFT[i.priority]||'+3d']+' ('+(i.priority||'Medium')+', '+late(i)+' d late)'; });
      var oldest=od.length?Math.max.apply(null,od.map(late)):0, first=od.slice().sort(function(a,b){ return a.due-b.due; })[0];
      return {title:'Overdue triage',
        summary:done?'I re-dated '+moved+' overdue task'+(moved>1?'s':'')+' by priority: Critical to today, High to tomorrow, Medium in 3 days, Low in a week.'
          :(od.length?od.length+' task'+(od.length>1?'s are':' is')+' overdue. Here is how I would re-date them; say “triage” and I will do it.':'Nothing is overdue. The board is clean.'),
        metrics:[{label:done?'Re-dated':'Overdue',value:String(done?moved:od.length),unit:'!',note:skipped?skipped+' you skipped':(done?'By priority':'Right now')},{label:'Still overdue',value:String(od.length),note:od.length>8?'I move 8 at a time':'After this'},
          {label:'Oldest',value:String(oldest),unit:'d',note:'Days late'},{label:'Close them?',value:String(closers.length),note:'Low priority, 2+ weeks late'}],
        charts:[{type:'hills',title:'How late it is',unit:'tasks',data:B},{type:'donut',title:'Overdue by priority',data:['Critical','High','Medium','Low'].map(function(p){ return {label:p,value:od.filter(function(i){ return (i.priority||'Medium')===p; }).length}; })}],
        sections:[{heading:done?'What moved':'The plan',text:bullets(plan)||'- Nothing to move.'},
          {heading:'My advice',text:bullets([closers.length?'Close or delete '+closers.length+' low-priority task'+(closers.length>1?'s':'')+' that '+(closers.length>1?'have':'has')+' waited over 2 weeks: '+closers.slice(0,3).map(function(i){ return '“'+i.name+'”'; }).join(', ')+'.':'',
            od.length>=5?'Work goes overdue when due dates are guesses. Add a day to your first estimate next time.':'',
            B[3].value?'Anything 15+ days late is not really a priority. Decide it again instead of re-dating it.':''])||'- Keep it this way: a 2-minute triage every evening does it.'}],
        next:first?{title:'Oldest overdue',value:String(late(first)),suffix:'/days late',cap:first.name}:{title:'Overdue',value:'0',suffix:'/tasks',cap:'The board is clean.'},
        stages:['List overdue work','Sort by priority','Pick new dates','Re-date the tasks','Report what moved']};
    }};

  /* ---- Project Manager: every project's health ---- */
  function projRows(){ return W.list('projects').map(function(p){ var pr=W.projectProgress(p.id), its=W.list('items',function(i){ return i.projectId===p.id; });
    var op=its.filter(function(i){ return i.status!=='Completed'; }); return {p:p,pct:pr.pct,total:pr.total,open:op.length,od:op.filter(late).length,next:op.filter(function(i){ return i.due; }).sort(function(a,b){ return a.due-b.due; })[0]}; }); }
  SK.projects={n:'Project health',
    reads:function(){ return [{name:'read_work',input:{}}]; },
    build:function(){
      var P=projRows(), risk=P.filter(function(x){ return x.od||(x.total&&x.pct<30); }).sort(function(a,b){ return b.od-a.od||a.pct-b.pct; });
      var avg=P.length?Math.round(P.reduce(function(s,x){ return s+x.pct; },0)/P.length):0, open=P.reduce(function(s,x){ return s+x.open; },0);
      return {title:'Project health',
        summary:P.length?P.length+' project'+(P.length>1?'s':'')+', '+avg+'% done on average.'+(risk[0]?' Most at risk: “'+risk[0].p.name+'”.':' None at risk.'):'No projects yet. Tell me one and I will break it into dated tasks.',
        metrics:[{label:'Projects',value:String(P.length),note:'Active'},{label:'Average',value:String(avg),unit:'%',note:'Done'},{label:'At risk',value:String(risk.length),unit:'!',note:'Late or under 30%'},{label:'Open tasks',value:String(open),note:'Across projects'}],
        charts:[{type:'bars',title:'Progress by project',unit:'%',max:100,data:P.slice(0,6).map(function(x){ return {label:x.p.name,value:x.pct}; })},{type:'gauge',title:'Average done',value:avg,unit:'%'}],
        sections:[{heading:'Where each project stands',text:bullets(P.map(function(x){ return '**'+x.p.name+'**: '+x.pct+'% ('+x.open+' open'+(x.od?', '+x.od+' late':'')+')'+(x.next?'. Next: '+x.next.name+', '+lbl(x.next.due):''); }))||'- No projects yet.'},
          {heading:'My advice',text:bullets(risk.slice(0,2).map(function(x){ return 'Unblock “'+x.p.name+'”: '+(x.od?'clear its '+x.od+' late task'+(x.od>1?'s':'')+' first':'it has barely started, so give it one focused hour this week')+'.'; }))||'- Everything is moving. Keep one project in focus per day.'}],
        next:risk[0]?{title:'Most at risk',value:String(risk[0].pct),suffix:'% done',cap:risk[0].p.name}:{title:'Projects',value:String(P.length),suffix:'/active',cap:'None at risk.'},
        stages:['Read every project','Count open and late work','Spot the risks','Suggest the next step']};
    }};

  /* ---- Project Manager: a project broken into dated steps ---- */
  var PHASES=['Define what done looks like','List what you need','First draft','Review and fix','Launch','Follow up and measure'];
  function projName(text){ var t=String(text||''), q=t.match(/[“"']([^”"']{3,60})[”"']/); if(q) return q[1];
    var m=t.match(/(?:project|called|named)\s+(?:the\s+|my\s+)?([A-Za-z0-9][^.,;!?]{2,50})/i); if(m&&!/^(into|in|to|for)\b/i.test(m[1])) return m[1].replace(/\s+(into|in)\s+.*$/i,'').trim(); return ''; }
  SK.breakdown={n:'Project breakdown',act:/./,
    reads:function(){ return [{name:'read_work',input:{}}]; },
    writes:function(e,text){ var n=projName(text)||'New project', out=[{name:'create_project',input:{name:n,desc:'Broken down by '+e.n+'.',due:'+'+(PHASES.length*2)+'d'}}];
      PHASES.forEach(function(p,i){ out.push({name:'create_task',input:{name:p+': '+n,priority:i<2?'High':'Medium',due:'+'+((i+1)*2)+'d',project:n}}); }); return out; },
    build:function(e,text,job){ var n=projName(text)||'your next project', made=steps(job,'write');
      return {title:'Plan: '+cap1(n),
        summary:made?'I set up “'+n+'” with '+(made-1)+' dated tasks, two days apart, so it lands in about '+(PHASES.length*2)+' days.':'This is how I break any project down. Tell me the project’s name and I will create it with the dates.',
        metrics:[{label:'Steps',value:String(PHASES.length),note:'Two days apart'},{label:'Finish',value:String(PHASES.length*2),unit:'d',note:'From today'},{label:'First due',value:dm(sod()+2*DAY),note:PHASES[0]},{label:'High priority',value:'2',note:'The first two steps'}],
        charts:[{type:'week',title:'When each step lands',data:PHASES.map(function(p,i){ return {label:dm(sod()+(i+1)*2*DAY),value:1,tag:p}; })}],
        sections:[{heading:'Steps',text:bullets(PHASES.map(function(p,i){ return '**'+p+'**: '+lbl(sod()+(i+1)*2*DAY); }))},
          {heading:'My advice',text:'- The first step is the one that stalls projects. Write “done” as one sentence a stranger could check.'}],
        next:{title:'First step',value:dm(sod()+2*DAY),suffix:'/due',cap:PHASES[0]},
        stages:['Name the outcome','Split into steps','Date each step','Create the tasks']}; }};

  /* ---- Growth Analyst: numbers first, then what to do about them ---- */
  SK.analyze={n:'Work report',
    reads:function(){ return [{name:'analyze_work',input:{days:7}},{name:'analyze_work',input:{days:28}}]; },
    build:function(){
      var a=analyze(7), b=analyze(28), rec=[];
      if(a.change!=null&&a.change<0) rec.push('Output dropped '+Math.abs(a.change)+'% ('+a.completed+' vs '+a.prevCompleted+'). Clear the '+a.overdue+' overdue first; they drag the whole week.');
      if(a.open&&a.overdue/a.open>0.2) rec.push(Math.round(a.overdue/a.open*100)+'% of open work is overdue. Re-plan the dates every Friday.');
      if(a.onTimeRate!=null&&a.onTimeRate<70) rec.push('Only '+a.onTimeRate+'% lands on time. Set due dates a day later than your first guess, or cut the scope.');
      if(a.avgCycleDays!=null&&a.avgCycleDays>5) rec.push('Tasks take '+a.avgCycleDays+' days from start to done. Split anything bigger than a day.');
      if(a.created>a.completed*1.5&&a.created>=3) rec.push('You added '+a.created+' tasks and finished '+a.completed+'. Say no to '+Math.max(1,a.created-a.completed)+' this week.');
      a.goals.filter(function(g){ return g.behind; }).forEach(function(g){ rec.push('“'+g.name+'” is behind pace ('+g.pct+'% vs '+g.expected+'%). Give it one fixed slot every day.'); });
      if(!rec.length) rec.push(a.completed?'Steady week. Keep the rhythm and aim for '+(a.completed+1)+' finished next week.':'Nothing finished this week yet. Pick one small task and close it today.');
      return {title:'Your work, last 7 days',
        summary:a.empty?'There is nothing in Work OS yet to measure. Add your real tasks and I will report on them.':(a.findings[0]||''),
        metrics:[{label:'Done, 7 days',value:String(a.completed),unit:'✓',note:a.change==null?'First week of data':(a.change>=0?'+':'')+a.change+'% vs the week before'},
          {label:'Overdue',value:String(a.overdue),unit:'!',note:a.oldestOverdue?'Oldest '+a.oldestOverdue.days+' d late':'None late'},
          {label:'Due this week',value:String(a.dueWeek),note:a.dueToday+' due today'},
          {label:'On time',value:a.onTimeRate==null?'—':String(a.onTimeRate),unit:a.onTimeRate==null?'':'%',note:'Of finished tasks with a date'},
          {label:'Cycle time',value:a.avgCycleDays==null?'—':String(a.avgCycleDays),unit:a.avgCycleDays==null?'':'d',note:'Created to done'},
          {label:'Done, 28 days',value:String(b.completed),note:'About '+Math.round(b.completed/4)+' a week'}],
        charts:[{type:'line',title:'Finished per day, 14 days',unit:'tasks',data:a.series.map(function(v,i){ return {label:dm(sod()-(13-i)*DAY),value:v}; })},
          {type:'bars',title:'This week vs last',data:[{label:'Last week',value:a.prevCompleted},{label:'This week',value:a.completed}]},
          {type:'gauge',title:'On time',value:a.onTimeRate||0,unit:'%'},
          {type:'hills',title:'Work by status',data:statusData(a)}],
        sections:[{heading:'What I see',text:bullets(a.findings)},{heading:'What I recommend',text:bullets(rec)}]
          .concat(a.goals.length?[{heading:'Goals',text:bullets(a.goals.map(function(g){ return g.name+': '+g.pct+'%'+(g.expected!=null?' (pace '+g.expected+'%)':''); }))}]:[]),
        series:a.series,
        next:{title:'Finished this week',value:String(a.completed),suffix:a.change==null?'/tasks':'/'+(a.change>=0?'+':'')+a.change+'%',cap:rec[0]},
        stages:['Measure 7 days','Compare with last week','Check goal pace','Write recommendations']};
    }};

  /* ---- Client Success: who is waiting, and the emails to send ---- */
  var FOLLOW=/client|lead|customer|invoice|follow|reply|email|call back|proposal|quote|pitch|contract|payment/i;
  var NOT_NAMES=['The','This','That','March','April','May','June','July','August','Monday','Tuesday','Friday','Kova','Work','Our','My'];
  function personIn(t){ var m=String(t||'').match(/\b(?:to|with|for|from|chase|email|call|invoice|remind|reply to)\s+(?:the\s+)?([A-Z][a-z]+)\b/); return m&&NOT_NAMES.indexOf(m[1])<0?m[1]:''; }
  function mailIn(t){ var m=String(t||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return m?m[0]:''; }
  function waitingOn(){ return openItems().filter(function(i){ return FOLLOW.test(i.name+' '+(i.notes||''))||i.status==='Waiting'; })
    .map(function(i){ var since=Math.max(0,Math.round((Date.now()-(i.updated||i.created||Date.now()))/DAY)); var txt=i.name+' '+(i.notes||'');
      return {i:i,who:personIn(i.name)||personIn(i.notes),mail:mailIn(i.notes),wait:Math.max(since,late(i)),money:/invoice|payment|paid|owe/i.test(txt)}; })
    .sort(function(a,b){ return b.wait-a.wait; }); }
  function draftFor(c){
    var me=myName(), topic=c.i.name.replace(/^(email|chase|follow ?up( with)?|reply to|call)\s+/i,''), t=topic.charAt(0).toLowerCase()+topic.slice(1), hi='Hi'+(c.who?' '+c.who:'')+',';
    var body=c.money?hi+'\n\nA quick reminder about '+t+(c.wait?', which is now '+c.wait+' day'+(c.wait>1?'s':'')+' past due':'')+'. Could you let me know when to expect payment? If it is already on its way, thank you, and please ignore this.\n\nThanks,\n'+me
      :hi+'\n\nJust following up on '+t+'. Have you had a chance to look at it? If it helps, I am free for a quick call this week; reply with a time that suits you.\n\nThanks,\n'+me;
    return {to:c.mail,subject:(c.money?'Reminder: ':'Following up: ')+topic,body:body.trim()};
  }
  SK.followups={n:'Follow-ups',act:/draft|write|email|send|chase|follow|remind/i,
    reads:function(){ return [{name:'list_tasks',input:{filter:'open',limit:40}},{name:'list_tasks',input:{filter:'waiting'}}]; },
    writes:function(e){ var out=[], mail=toolsFor(e).indexOf('draft_email')>=0;
      waitingOn().slice(0,4).forEach(function(c){ if(mail) out.push({name:'draft_email',input:draftFor(c)}); out.push({name:'create_task',input:{name:'Check for a reply: '+c.i.name,priority:c.money?'High':'Medium',due:'+3d'}}); }); return out; },
    build:function(e,text,job){ var C=waitingOn(), money=C.filter(function(c){ return c.money; }), sent=steps(job,'send');
      return {title:'Who is waiting',
        summary:(sent?'I prepared '+sent+' email'+(sent>1?'s':'')+' and set reminders to check for replies. ':'')+(C.length?C.length+' conversation'+(C.length>1?'s need':' needs')+' a nudge.'+(C[0]?' Start with “'+C[0].i.name+'”: '+C[0].wait+' days waiting.':''):'Nobody is waiting on you. Tasks that mention a client, lead, invoice or follow-up show up here.'),
        metrics:[{label:'Waiting',value:String(C.length),note:'Need a nudge'},{label:'Longest',value:String(C[0]?C[0].wait:0),unit:'d',note:C[0]?C[0].i.name:'Nobody waiting'},{label:'Invoices',value:String(money.length),unit:'$',note:'To chase'},{label:'Have an email',value:String(C.filter(function(c){ return c.mail; }).length),note:'Others need an address'}],
        charts:[{type:'bars',title:'Days waiting',unit:'days',data:C.slice(0,6).map(function(c){ return {label:c.who||c.i.name,value:c.wait}; })},{type:'donut',title:'What they are waiting for',data:[{label:'Money',value:money.length},{label:'A reply',value:C.length-money.length}]}],
        sections:[{heading:'Reply in this order',text:bullets(C.slice(0,6).map(function(c){ return '**'+c.i.name+'**: '+c.wait+' days'+(c.money?', money owed':'')+(c.mail?'':'. Add their email to the task notes and I will draft it.'); }))||'- Nothing waiting.'},
          {heading:'How I write them',text:'- Short, one question and one clear next step. Invoices get a friendly reminder with the days overdue. Nothing is sent without your OK.'}],
        emails:C.slice(0,3).map(draftFor),
        next:C[0]?{title:'Reply first',value:String(C[0].wait),suffix:'/days waiting',cap:C[0].i.name}:{title:'Waiting on you',value:'0',suffix:'/people',cap:'Inbox zero on follow-ups.'},
        stages:['Find who is waiting','Sort by days waiting','Draft each email','Wait for your OK','Set reminders']}; }};

  /* ---- Content Producer: the week's posts, with goals ---- */
  var PLAT={instagram:{n:'Instagram',per:3,f:['Reel','Carousel'],t:'11:00'},tiktok:{n:'TikTok',per:3,f:['Video'],t:'19:00'},youtube:{n:'YouTube',per:1,f:['Short','Video'],t:'10:00'},
    linkedin:{n:'LinkedIn',per:2,f:['Post','Carousel'],t:'08:30'},x:{n:'X',per:4,f:['Post','Thread'],t:'09:00'},facebook:{n:'Facebook',per:2,f:['Post','Video'],t:'13:00'},
    pinterest:{n:'Pinterest',per:4,f:['Pin'],t:'20:00'},threads:{n:'Threads',per:3,f:['Post'],t:'12:00'}};
  function plats(){ var p=prof().platforms||[], out=[];
    (Array.isArray(p)?p:String(p).split(/[,\s]+/)).forEach(function(x){ var k=String(x||'').toLowerCase().replace(/[^a-z]/g,''); if(k==='twitter') k='x'; if(PLAT[k]&&out.indexOf(k)<0) out.push(k); });
    try{ if(window.KovaPost&&KovaPost.ORDER) KovaPost.ORDER.forEach(function(k){ if(PLAT[k]&&out.indexOf(k)<0&&KovaPost.linkState(k)==='on') out.push(k); }); }catch(e){}
    return out.length?out.slice(0,4):['instagram','tiktok','linkedin']; }
  var CSTOP=['business','customers','customer','people','things','goal','goals','week','month','year','more','make','want','grow','growth','best','good','great','first','real','help','using','based','online','brand','audience','content','post','posts','project','projects','sales','their','small','your','every','work','team','plan','task','tasks','done','next','time'];
  function topics(){
    var p=prof(), src=[p.business,p.industry,p.objective,p.description,p.audience,p.notes].join(' ');
    W.list('projects').forEach(function(x){ src+=' '+x.name; }); W.list('goals').forEach(function(g){ src+=' '+g.name; });
    var cnt={}; words(src).forEach(function(w){ if(w.length>=4&&!/^\d/.test(w)&&CSTOP.indexOf(w)<0) cnt[w]=(cnt[w]||0)+1; });
    return Object.keys(cnt).sort(function(a,b){ return cnt[b]-cnt[a]; }).slice(0,6);
  }
  var PILLARS=['Teach','Show','Prove','Sell'];
  var HOOKS={Teach:['3 mistakes {a} make with {t}','The {t} checklist we use every week','How to choose the right {t} in 30 seconds','Myth vs fact: {t}','One thing about {t} nobody tells {a}'],
    Show:['Behind the scenes: how we make {t}','A day at {b}, start to finish','What goes into one {t} order','The tools we use for {t}'],
    Prove:['Before and after: {t}','What a customer said about {t}, and what we changed','Our honest {t} numbers this month'],
    Sell:['Why our {t} costs what it costs','The {t} we would pick for {a}, and why','This week only: {t}']};
  var BEATS={Teach:['Say the mistake in the first 2 seconds','Show the fix on screen, step by step','End with “save this for later”'],
    Show:['Open on the messiest moment','Speed the process up to 15 seconds','End on the finished result'],
    Prove:['Show the before for one second','Cut to the after','Say what changed in one line'],
    Sell:['Say who it is for in the first line','Show it being used, not on a table','Say the price and the deadline']};
  var CTA={Teach:'Save this for later.',Show:'What should we show next?',Prove:'Want the same? Ask in the comments.',Sell:'Link in bio.'};
  var PSEQ=['Teach','Show','Teach','Prove','Teach','Show','Sell'];
  function tag(s){ var t=String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); return t.length>2?'#'+t:''; }
  function contentPlan(){
    var p=prof(), T=topics(), aud=String(p.audience||'').trim()||'your customers', biz=String(p.business||'').trim()||'our studio', P=plats(), w=wkNo();
    var t0=T.length?T:[String(p.industry||'').toLowerCase().trim()||'what you make'];
    var ideas=[];
    for(var i=0;i<7;i++){
      var day=sod()+(i+1)*DAY, pil=PSEQ[i], k=P[i%P.length], pl=PLAT[k], fmt=pl.f[(Math.floor(i/P.length)+w)%pl.f.length], t=t0[(i+w)%t0.length];
      var H=HOOKS[pil], hook=cap1(H[(w+i)%H.length].replace(/\{t\}/g,t).replace(/\{a\}/g,aud).replace(/\{b\}/g,biz));
      var tags=[tag(t),tag(p.industry),({Teach:'#howto',Show:'#behindthescenes',Prove:'#beforeandafter',Sell:'#shopnow'})[pil],tag(biz),tag(t0[(i+w+1)%t0.length])]
        .filter(function(x,j,arr){ return x&&arr.indexOf(x)===j; }).slice(0,5);
      ideas.push({day:wd(day,true)+' '+dm(day),at:day,platform:pl.n,pk:k,format:fmt,pillar:pil,hook:hook,beats:BEATS[pil],caption:hook+'.\n\n'+CTA[pil],tags:tags.join(' '),time:pl.t});
    }
    return {ideas:ideas,P:P,T:t0,aud:aud,biz:biz};
  }
  SK.content={n:'Content plan',act:/draft|write|create|make|save|studio/i,
    reads:function(){ return [{name:'read_content',input:{}},{name:'read_work',input:{}}]; },
    writes:function(e){ if(toolsFor(e).indexOf('post_draft')<0) return []; return contentPlan().ideas.slice(0,3).map(function(x){ return {name:'post_draft',input:{heading:x.hook,caption:x.caption,tags:x.tags,platforms:[x.pk]}}; }); },
    build:function(e,text,job){
      var cp=contentPlan(), ideas=cp.ideas, posts=(window.KovaPost&&KovaPost.all)?KovaPost.all():[], drafts=posts.filter(function(p){ return p.status==='draft'; }).length, made=steps(job,'write');
      var per={}, mix={}; ideas.forEach(function(x){ per[x.platform]=(per[x.platform]||0)+1; mix[x.pillar]=(mix[x.pillar]||0)+1; });
      var goals=['Post '+ideas.length+' times this week: '+Object.keys(per).map(function(k){ return per[k]+' on '+k; }).join(', ')+'.',
        'Teach in 3 of every 7 posts. Posts people save and share reach further than posts they only like.',
        'Reply to every comment within an hour of posting.',
        'Next week, repeat the format of whichever post got the most saves.'];
      return {title:'Content plan for this week',
        summary:(made?'I drafted '+made+' post'+(made>1?'s':'')+' in the Studio and planned the rest. ':'')+ideas.length+' ideas for '+cp.P.map(function(k){ return PLAT[k].n; }).join(', ')+', built on '+cp.T.slice(0,2).join(' and ')+' for '+cp.aud+'.',
        metrics:[{label:'Ideas',value:String(ideas.length),note:'One a day'},{label:'Platforms',value:String(cp.P.length),note:cp.P.map(function(k){ return PLAT[k].n; }).join(', ')},{label:'Teach posts',value:String(mix.Teach||0),note:'The ones people save'},{label:'In the Studio',value:String(drafts+made),note:'Drafts ready'}],
        charts:[{type:'donut',title:'Content mix',data:PILLARS.map(function(p){ return {label:p,value:mix[p]||0}; })},
          {type:'week',title:'This week',data:ideas.map(function(x){ return {label:x.day.split(' ')[0],value:1,tag:x.platform+' · '+x.format}; })},
          {type:'bars',title:'Posts per platform',data:Object.keys(per).map(function(k){ return {label:k,value:per[k]}; })},
          {type:'gauge',title:'Drafted',value:Math.min(100,Math.round((drafts+made)/ideas.length*100)),unit:'%'}],
        sections:[{heading:'Goals for this week',text:bullets(goals)},
          {heading:'Why this mix',text:'About 40% teach, 25% behind the scenes, 20% proof and 15% selling. Teaching and proof build trust, so the one selling post lands. The posting times are a starting point; after two weeks I go by your own numbers.'},
          {heading:'Cadence I suggest',text:bullets(cp.P.map(function(k){ return PLAT[k].per+' '+PLAT[k].n+(PLAT[k].per>1?' posts':' post')+' a week, around '+PLAT[k].t; }))}],
        ideas:ideas,
        next:{title:'Next post',value:ideas[0].time,suffix:'/'+ideas[0].day.split(' ')[0],cap:ideas[0].hook+' ('+ideas[0].platform+')'},
        stages:['Read your brand and goals','Pick the topics','Plan the week','Write hooks and captions','Draft in the Studio']};
    }};

  /* ---- Research Analyst: the brief, the sources and the table ---- */
  function resTopic(text){ var m=String(text||'').match(/(?:research|about|on|into|check)\s+(?:my\s+|the\s+|our\s+)?([^.?!]{3,60})/i), t=m?m[1].trim():'';
    if(!t||/^(this|that|it|competitors?)$/i.test(t)) t=(topics()[0]||String(prof().industry||'').toLowerCase()||'your market'); return t.replace(/\s+(this|next) week$/i,''); }
  SK.research={n:'Research brief',act:/task|plan|set up|create/i,
    reads:function(){ return [{name:'read_work',input:{}}]; },
    writes:function(e,text){ var t=resTopic(text); return ['Who are the top 5 competitors for '+t+'?','What do they charge, and what is included?','What do their customers complain about?'].map(function(q,i){ return {name:'create_task',input:{name:'Research: '+q,priority:i?'Medium':'High',due:'+'+(i+1)+'d'}}; }); },
    build:function(e,text){ var t=resTopic(text), b=prof().business||'you', live=serverLikely()||!!keyBrain();
      var Q=[{q:'Who are the top 5 competitors for '+t+'?',i:3,e:1},{q:'What do they charge, and what is included at each price?',i:3,e:2},{q:'What do their customers complain about in 1–3 star reviews?',i:3,e:2},
        {q:'Which of their posts get the most comments, and why?',i:2,e:2},{q:'Is interest in '+t+' growing or shrinking this year?',i:2,e:1},{q:'What would make someone pick '+b+' over them?',i:3,e:3}];
      return {title:'Research brief: '+t,
        summary:'Six questions that decide what to do about '+t+', where to find each answer, and a table to fill in.'+(live?'':' Live web searching starts when the Kova server is connected.'),
        metrics:[{label:'Questions',value:String(Q.length),note:'Ranked by impact'},{label:'Sources',value:'6',note:'Free to check'},{label:'Time',value:'45',unit:'min',note:'To answer all six'},{label:'Web search',value:live?'On':'Off',note:live?'Live':'Needs the Kova server'}],
        charts:[{type:'matrix',title:'Impact vs effort',data:Q.map(function(x,i){ return {label:String(i+1),x:x.e,y:x.i}; })},{type:'bars',title:'Impact of each question',data:Q.map(function(x,i){ return {label:'Q'+(i+1),value:x.i}; })}],
        sections:[{heading:'Answer these first',text:bullets(Q.slice().sort(function(a,c){ return (c.i-c.e)-(a.i-a.e); }).map(function(x){ return x.q; }))},
          {heading:'Where to look',text:bullets(['Google “'+t+'” and “best '+t+'”. Write down the top 5 names.','Their pricing pages. Screenshot every tier.','Reviews on Google, Amazon or Trustpilot, sorted by 1–3 stars.','Google Trends for “'+t+'” over the last 12 months.','Reddit: “'+t+' recommendation”. Read what people actually ask.','TikTok and Instagram search for “'+t+'”. Note the 10 best hooks.'])},
          {heading:'Fill in this table',text:'Competitor · Price · What is included · What customers complain about · What they do better than you'},
          {heading:'My advice',text:'- The complaints column is the most useful one: every complaint about a competitor is a line for your own marketing.'}],
        next:{title:'Start with',value:'1',suffix:'/of 6',cap:Q[0].q},
        stages:['Frame the questions','Rank by impact','List the sources','Build the table','Set research tasks']}; }};

  /* ---- Finance Tracker: owed money and goal pace ---- */
  function amount(t){ var m=String(t||'').match(/[$£€]\s?([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s?(?:usd|eur|gbp|dollars)/i); return m?(+String(m[1]||m[2]).replace(/,/g,'')||0):0; }
  SK.finance={n:'Money check',act:/remind|chase|draft|email|send/i,
    reads:function(){ return [{name:'analyze_work',input:{days:28}},{name:'list_tasks',input:{filter:'open',limit:40}}]; },
    writes:function(e){ if(toolsFor(e).indexOf('draft_email')<0) return []; return waitingOn().filter(function(c){ return c.money; }).slice(0,3).map(function(c){ return {name:'draft_email',input:draftFor(c)}; }); },
    build:function(){
      var now=Date.now();
      var G=W.list('goals').map(function(g){ var pr=W.goalProgress(g), left=(+g.target||0)-(+g.current||0), wks=g.deadline?Math.max(.5,(g.deadline-now)/(7*DAY)):null, done=g.created?Math.max(.5,(now-g.created)/(7*DAY)):null;
        return {g:g,pct:pr.pct,need:wks&&left>0?Math.ceil(left/wks):null,rate:done?Math.round((+g.current||0)/done):null,unit:g.unit||''}; });
      var inv=openItems().filter(function(i){ return /invoice|payment|paid|owe|bill/i.test(i.name+' '+(i.notes||'')); }).map(function(i){ return {i:i,amt:amount(i.name+' '+(i.notes||'')),late:late(i)}; }).sort(function(a,b){ return b.late-a.late; });
      var owed=inv.reduce(function(s,x){ return s+x.amt; },0), lateInv=inv.filter(function(x){ return x.late; }), M=W.list('metrics'), onT=M.filter(function(m){ return m.target&&+m.value>=+m.target; }).length;
      var adv=[];
      if(lateInv[0]) adv.push('Chase “'+lateInv[0].i.name+'” first: '+lateInv[0].late+' days late'+(lateInv[0].amt?', '+money(lateInv[0].amt):'')+'.');
      G.forEach(function(x){ if(x.need!=null) adv.push('To hit “'+x.g.name+'” you need '+x.need+(x.unit?' '+x.unit:'')+' a week'+(x.rate!=null?'; you are doing about '+x.rate+'.':'.')); });
      if(!G.length) adv.push('Set one money goal with a number and a date (for example, revenue this month) and I will track the pace.');
      return {title:'Money check',
        summary:(inv.length?inv.length+' invoice'+(inv.length>1?'s':'')+' open'+(owed?', '+money(owed)+' owed':'')+'. ':'No open invoices. ')+(G.length?G.length+' goal'+(G.length>1?'s':'')+' tracked.':'No money goals yet.'),
        metrics:[{label:'Owed to you',value:owed?money(owed):String(inv.length),note:owed?'Across '+inv.length+' invoices':'Open invoices'},{label:'Late',value:String(lateInv.length),unit:'!',note:'Invoices past due'},
          {label:'Goal pace',value:G[0]?String(G[0].pct):'—',unit:G[0]?'%':'',note:G[0]?G[0].g.name:'No goal yet'},{label:'On target',value:String(onT),note:'Of '+M.length+' metrics'}],
        charts:[{type:'bars',title:'Goal progress',unit:'%',max:100,data:G.slice(0,5).map(function(x){ return {label:x.g.name,value:x.pct}; })},
          {type:'hills',title:'Invoices by days late',data:[['On time',0,0],['1–7 d',1,7],['8–30 d',8,30],['30 d+',31,99999]].map(function(b){ return {label:b[0],value:inv.filter(function(x){ return x.late>=b[1]&&x.late<=b[2]; }).length}; })}],
        sections:[{heading:'What to do',text:bullets(adv)},{heading:'Open invoices',text:bullets(inv.slice(0,6).map(function(x){ return '**'+x.i.name+'**'+(x.amt?': '+money(x.amt):'')+(x.late?', '+x.late+' d late':''); }))||'- None.'}],
        next:lateInv[0]?{title:'Chase first',value:String(lateInv[0].late),suffix:'/days late',cap:lateInv[0].i.name}:{title:'Invoices late',value:'0',suffix:'/open',cap:'Nothing overdue.'},
        stages:['Read goals and metrics','Find open invoices','Work out the pace','Draft reminders']};
    }};

  /* ---- Scheduler: the shape of the week ---- */
  function prepList(){ var now=Date.now(); return W.list('meetings',function(m){ return m.at>now&&m.at<now+3*DAY&&!(m.prep&&String(m.prep).trim()); }); }
  SK.schedule={n:'Week plan',act:/prep|book|create|set up|add/i,
    reads:function(){ return [{name:'list_tasks',input:{filter:'week',limit:50}}]; },
    writes:function(){ return prepList().slice(0,4).map(function(m){ return {name:'create_task',input:{name:'Prep: '+(m.title||m.name||'meeting'),priority:'High',due:new Date(m.at-DAY).toISOString().slice(0,10)}}; }); },
    build:function(){
      var days=next7().map(function(d){ var mt=W.list('meetings',function(m){ return m.at>=d.s&&m.at<d.s+DAY; }).length, tk=W.list('items',function(i){ return i.status!=='Completed'&&i.due>=d.s&&i.due<d.s+DAY; }).length; return {d:d,m:mt,t:tk,load:mt*2+tk}; });
      var rd=ready(), light=days.slice().sort(function(a,b){ return a.load-b.load; }), busy=days.slice().sort(function(a,b){ return b.load-a.load; })[0], prep=prepList();
      var deep=light.slice(0,3).map(function(x){ return x.d.label+' 09:00–11:00'; });
      return {title:'Your week',
        summary:'Busiest: '+busy.d.label+' ('+busy.m+' meeting'+(busy.m===1?'':'s')+', '+busy.t+' task'+(busy.t===1?'':'s')+'). Best for deep work: '+light.slice(0,2).map(function(x){ return x.d.label; }).join(' and ')+'.',
        metrics:[{label:'Meetings',value:String(days.reduce(function(s,x){ return s+x.m; },0)),note:'Next 7 days'},{label:'Busiest day',value:busy.d.label,note:busy.m+' calls, '+busy.t+' tasks'},{label:'Deep work',value:String(deep.length),note:'2-hour blocks'},{label:'Need prep',value:String(prep.length),unit:'!',note:'Calls in the next 3 days'}],
        charts:[{type:'bars',title:'Load per day',data:days.map(function(x){ return {label:x.d.label,value:x.load}; })},{type:'week',title:'Meetings and tasks',data:days.map(function(x){ return {label:x.d.label,value:x.m+x.t,tag:x.m+' calls · '+x.t+' tasks'}; })}],
        sections:[{heading:'Protect these blocks',text:bullets(deep.map(function(x){ return x+' for your hardest task'; }))},
          {heading:'My advice',text:bullets([busy.m>=3?'Move one call off '+busy.d.label+'. Three or more calls in a day costs you the afternoon.':'',prep.length?prep.length+' call'+(prep.length>1?'s have':' has')+' no prep note. Ask me to add prep tasks.':'',rd&&rd.level==='low'?'Readiness is low: keep today’s calls short and move deep work to a lighter day.':''])||'- The week looks balanced.'}],
        next:{title:'Best deep-work day',value:light[0].d.label,suffix:'/09:00',cap:'Keep it free of calls'},
        stages:['Read meetings','Read deadlines','Find the light days','Block deep work','Add prep']};
    }};

  /* ---- Focus Coach: the day, matched to energy ---- */
  SK.focus={n:'Energy plan',
    reads:function(e){ var r=[{name:'list_tasks',input:{filter:'today'}}]; if(toolsFor(e).indexOf('read_wellness')>=0) r.push({name:'read_wellness',input:{}}); return r; },
    build:function(){
      var rd=ready(), lvl=rd?rd.level:'medium', k={high:1,medium:.85,low:.65}[lvl];
      var H=[7,8,9,10,11,12,13,14,15,16,17,18,19,20], base=[40,55,72,85,90,82,64,55,60,72,76,68,55,42];
      var curve=H.map(function(h,i){ return {label:h+':00',value:Math.round(base[i]*k)}; });
      var today=W.dueToday().concat(W.overdue()).filter(function(v,i,a){ return a.indexOf(v)===i; }).sort(function(a,b){ return effort(b)-effort(a); });
      var plan=[];
      if(today[0]) plan.push('10:00–11:30  '+today[0].name+' (the hardest, at your peak)');
      if(today[2]) plan.push('14:00–14:45  '+today.slice(2,5).map(function(i){ return i.name; }).join(', ')+' (light work after lunch)');
      if(today[1]) plan.push('16:00–17:00  '+today[1].name+' (your second peak)');
      plan.push(lvl==='low'?'18:00  Stop. Readiness is low, so tomorrow gets the rest.':'18:30  Stop, and write down tomorrow’s first task.');
      var heavy=today.filter(function(i){ return effort(i)>=7||i.priority==='Critical'; }).length;
      return {title:'Energy plan',
        summary:'Readiness is '+lvl+'. '+(today[0]?'Do “'+today[0].name+'” at 10:00, when you are sharpest.':'Nothing heavy today: use your peak for your main goal.'),
        metrics:[{label:'Readiness',value:cap1(lvl),note:rd?(rd.fix?rd.fix+' check'+(rd.fix>1?'s':'')+' to fix':'All checks fine'):'No health data yet'},{label:'Peak',value:'10–12',note:'Your sharpest hours'},{label:'Heavy tasks',value:String(heavy),unit:'!',note:'Today'},{label:'Stop by',value:lvl==='low'?'18:00':'18:30',note:'To protect sleep'}],
        charts:[{type:'line',title:'Energy through the day',unit:'%',data:curve},{type:'donut',title:'Today’s load',data:[{label:'Heavy',value:heavy},{label:'Lighter',value:Math.max(0,today.length-heavy)}]},{type:'gauge',title:'Readiness',value:({high:90,medium:60,low:30})[lvl],unit:'%'}],
        sections:[{heading:'Your day by energy',text:bullets(plan)},
          {heading:'Why',text:'- Most people are sharpest late in the morning, dip after lunch and pick up again late in the afternoon. When readiness is low the peaks are lower, so the hard work gets one block, not two.'}],
        next:{title:'Your peak starts',value:'10:00',suffix:'/today',cap:today[0]?today[0].name:'Your main goal'},
        stages:['Check readiness','Map your energy','Rank today by effort','Match work to energy']};
    }};

  /* ---- p25: sleep and food, from your own numbers (no AI needed) ---- */
  function hm(min){ min=Math.round(min||0); return Math.floor(min/60)+'h '+('0'+(min%60)).slice(-2)+'m'; }
  function avg(a){ return a.length?a.reduce(function(x,y){ return x+y; },0)/a.length:0; }
  function bedMin(b){ var m=String(b||'').match(/(\d{1,2}):(\d{2})/); if(!m) return null; var x=+m[1]*60+(+m[2]); return x<12*60?x+24*60:x; }
  function clockOf(x){ x=Math.round(x)%(24*60); var h=Math.floor(x/60), m=x%60; return (h%12||12)+':'+('0'+m).slice(-2)+(h<12?' am':' pm'); }
  var WIND=['Phone out of the bedroom (or across the room) 30 to 60 minutes before bed: the scrolling, not just the light, keeps the brain switched on.',
    'Read a paper book instead, under a warm, low lamp.',
    'Lights low and the room cool, about 18 °C (65 °F), and dark.',
    'Same bedtime within half an hour, weekends too.',
    'No caffeine after 2 pm, and no big meal or alcohol in the last 3 hours.'];
  SK.sleep={n:'Sleep summary',
    reads:function(){ return [{name:'read_health',input:{}}]; },
    build:function(e,text){
      var h=health(), N=h.sleep, q=String(text||'');
      if(!N.length) return {title:'Sleep summary',summary:'There are no nights recorded yet, so there is nothing to read. Wear your watch to bed and connect it in Settings > Connections; after the first night this summary fills in.',
        metrics:[{label:'Nights',value:'0',note:'Nothing recorded yet'}],charts:[],sections:[{heading:'Tonight anyway',text:bullets(WIND.slice(0,3))}],stages:['Read your nights']};
      var asleep=N.map(function(n){ return n.asleep_min; }), sc=N.map(function(n){ return +n.score||0; }), on=N.map(function(n){ return +n.onset_min||0; });
      var beds=N.map(function(n){ return bedMin(n.bedtime); }).filter(function(x){ return x!=null; });
      var aA=avg(asleep), aS=Math.round(avg(sc)), aOn=Math.round(avg(on)), aDeep=Math.round(avg(N.map(function(n){ return +n.deep_min||0; }))), aRem=Math.round(avg(N.map(function(n){ return +n.rem_min||0; })));
      var spread=beds.length>1?Math.max.apply(null,beds)-Math.min.apply(null,beds):0, aBed=beds.length?avg(beds):null;
      var worst=N.slice().sort(function(a,b){ return (+a.score||0)-(+b.score||0); })[0], best=N.slice().sort(function(a,b){ return (+b.score||0)-(+a.score||0); })[0];
      /* what is hurting it, only from patterns in these nights */
      var hurts=[];
      if(aA<7*60) hurts.push('Short nights: '+hm(aA)+' asleep on average, under the 7 hours most adults need.');
      if(aOn>=20) hurts.push('Slow to fall asleep: '+aOn+' minutes on average (under 15 is typical). Scrolling in bed is the most common cause.');
      if(spread>=90) hurts.push('Bedtime moves around by '+hm(spread)+' across these nights; an irregular bedtime shifts your body clock.');
      if(aBed!=null&&aBed>=24*60+15) hurts.push('Late bedtimes: around '+clockOf(aBed)+' on average.');
      if(worst&&best&&bedMin(worst.bedtime)!=null&&bedMin(best.bedtime)!=null&&bedMin(worst.bedtime)-bedMin(best.bedtime)>=45) hurts.push('Your worst night ('+worst.day+', score '+worst.score+') started '+hm(bedMin(worst.bedtime)-bedMin(best.bedtime))+' later than your best ('+best.day+', score '+best.score+').');
      if(!hurts.length) hurts.push('Nothing stands out in these nights: hours, sleep onset and bedtime all look steady.');
      var sec=[{heading:'What is hurting your sleep',text:bullets(hurts)},{heading:'Tonight',text:bullets(WIND)}];
      if(/dark circle|eye bag|puffy/i.test(q)) sec.push({heading:'Dark circles',text:bullets(['Short or broken sleep makes them more visible: blood vessels under thin skin show through more when you are tired.',
        'Other common causes: genetics, allergies or a blocked nose, rubbing your eyes, dehydration and salty food late at night.',
        'If they appear suddenly, or with swelling or pain, ask a doctor.'])});
      return {title:'Sleep summary',
        summary:(h.source.indexOf('example')===0?'From Kova\u2019s example week (not your own nights yet): ':'')+'last '+N.length+' nights, '+hm(aA)+' asleep on average, score '+aS+'. '+(hurts[0]||''),
        metrics:[{label:'Asleep',value:hm(aA),note:'Average a night'},{label:'Score',value:String(aS),note:'Average'},{label:'Falling asleep',value:String(aOn),unit:' min',note:aOn>=20?'Slow':'Fine'},
          {label:'Deep',value:String(aDeep),unit:' min',note:'Average'},{label:'REM',value:String(aRem),unit:' min',note:'Average'},{label:'Bedtime',value:aBed!=null?clockOf(aBed):'–',note:spread?'Moves '+hm(spread):'Steady'}],
        charts:[{type:'bars',title:'Hours asleep',unit:'h',data:N.map(function(n){ return {label:n.day,value:Math.round(n.asleep_min/6)/10}; })},
          {type:'donut',title:'Sleep stages (average)',data:[{label:'Deep',value:aDeep},{label:'REM',value:aRem},{label:'Light',value:Math.round(avg(N.map(function(n){ return +n.light_min||0; })))}]}],
        sections:sec, stages:['Read your nights','Find the pattern','Plan tonight']};
    }};
  SK.training={n:'Training check',
    reads:function(){ return [{name:'read_health',input:{}}]; },
    build:function(){
      var h=health(), S7=h.sessions.filter(function(x){ return x.t>=Date.now()-7*DAY; }), P7=h.sessions.filter(function(x){ return x.t>=Date.now()-14*DAY&&x.t<Date.now()-7*DAY; });
      var fix=h.vitals.filter(function(m){ return m.status==='fix'; }), call=fix.length>=2?'rest':fix.length===1?'easy':'push';
      if(!h.sessions.length) return {title:'Training check',summary:'No workouts logged yet, so there is nothing to read. Log one in Workout (one tap starts today\u2019s), or import from Strong or Hevy in Settings.',
        metrics:[{label:'Sessions',value:'0',note:'Nothing logged'}],charts:[],sections:[{heading:'To start',text:bullets(['Three full-body sessions a week is a strong start: squat, push, pull and a hinge each time.','Add a set or a little weight each week; that steady increase is what builds muscle.'])}],stages:['Read your sessions']};
      var mins=S7.reduce(function(a,x){ return a+x.minutes; },0), vol=S7.reduce(function(a,x){ return a+x.volume; },0), last=h.sessions[h.sessions.length-1];
      var days=[6,5,4,3,2,1,0].map(function(i){ var d0=new Date(Date.now()-i*DAY).toDateString(); return {label:d0.slice(0,3),value:h.sessions.filter(function(x){ return x.at===d0; }).reduce(function(a,x){ return a+x.minutes; },0)}; });
      return {title:'Training check',
        summary:S7.length+' session'+(S7.length===1?'':'s')+' this week ('+P7.length+' the week before), '+mins+' minutes. Today: '+({push:'you are recovered, push.',easy:'one check is off, train easy.',rest:'two or more checks are off, rest or walk.'})[call],
        metrics:[{label:'Sessions',value:String(S7.length),note:'This week'},{label:'Minutes',value:String(mins),note:'This week'},{label:'Volume',value:String(vol),note:'Lifted this week'},{label:'Last',value:String(last.name||'Session').slice(0,18),note:last.at}],
        charts:[{type:'bars',title:'Minutes trained, last 7 days',unit:'min',data:days}],
        sections:[{heading:'Today',text:bullets([call==='push'?'Recovery looks fine: a hard session is a good idea today.':call==='easy'?'One recovery check is off ('+fix[0].name+'): train, but keep it lighter.':'Recovery is low ('+fix.map(function(m){ return m.name; }).join(', ')+'): rest or take an easy walk.',
          S7.length<3?'Aim for 3 sessions this week; you have '+S7.length+'.':'You have hit 3 or more sessions this week: keep that rhythm.',
          'To build muscle: add a set or a little weight each week, and eat enough protein (ask Sage).'])}],
        stages:['Read your sessions','Check recovery','Plan today']};
    }};
  SK.vitals={n:'Recovery check',
    reads:function(){ return [{name:'read_health',input:{}}]; },
    build:function(){
      var h=health(), V=h.vitals, fix=V.filter(function(m){ return m.status==='fix'; });
      if(!V.length) return {title:'Recovery check',summary:'No heart or recovery readings yet. Connect your watch in Settings > Connections; after a night or two this fills in.',
        metrics:[{label:'Readings',value:'0',note:'Nothing yet'}],charts:[],sections:[],stages:['Read your vitals']};
      return {title:'Recovery check',
        summary:fix.length?fix.length+' of '+V.length+' checks are off: '+fix.map(function(m){ return m.name+' ('+m.value+(m.unit||'')+')'; }).join(', ')+'.':'All '+V.length+' checks are in your normal range.',
        metrics:V.slice(0,6).map(function(m){ return {label:m.name,value:String(m.value),unit:m.unit?(' '+m.unit):'',note:m.status==='fix'?'Off':'Normal'}; }),
        charts:[{type:'gauge',title:'Checks in range',unit:'%',value:Math.round((V.length-fix.length)/V.length*100)}],
        sections:[{heading:fix.length?'What is off':'All good',text:bullets(fix.length?fix.map(function(m){ return m.name+': '+(m.note||'outside your normal'); }):['Nothing is outside your normal today.'])},
          {heading:'Today',text:bullets([fix.length?'Go easier today: lighter training, an early night, water with every meal.':'A good day for your hardest work or training.','A low HRV or a raised resting heart rate for 2+ days in a row, with feeling unwell, is worth checking with a doctor.'])}],
        stages:['Read your vitals','Compare with your normal','Plan today']};
    }};
  SK.nutrition={n:'Food check',
    reads:function(){ return [{name:'read_health',input:{}}]; },
    build:function(e,text){
      var h=health(), t=h.food_today, tg=h.target, q=String(text||''), bulk=/bulk|gain|put on|mass|bigger/i.test(q), cut=/\bcut\b|lose|lean|fat loss|slim/i.test(q);
      var eaten=t.kcal||0, sec=[];
      if(!tg) return {title:'Food check',summary:(eaten?'You have logged '+eaten+' kcal today. ':'Nothing logged today yet. ')+'Kova has no calorie target for you yet, so it cannot say how far off you are. Answer the five questions in Fuel > Find my maintenance and ask again.',
        metrics:[{label:'Eaten today',value:String(eaten),unit:' kcal',note:eaten?'Logged':'Nothing logged'},{label:'Target',value:'Not set',note:'Find my maintenance'}],charts:[],
        sections:[{heading:'Next step',text:bullets(['Fuel > Find my maintenance: five questions, and Kova works out your target from your body, steps, sleep and training.',bulk?'Then aim about 300 kcal a day above it to bulk, with protein at 1.6 to 2.2 g per kg of body weight.':'Then log meals with Snap or the barcode scanner.'])}],stages:['Read today','Check the target']};
      var goal=tg.kcal+(bulk?300:cut?-400:0), left=goal-eaten, pLeft=Math.max(0,tg.protein_g-(t.protein_g||0));
      sec.push({heading:bulk?'To bulk up':cut?'To cut':'The rest of today',text:bullets([
        (bulk?'Eat about '+goal+' kcal a day, roughly 300 over your maintenance of '+tg.kcal+'. A small surplus builds muscle with less fat; aim to gain about 0.25 to 0.5 kg a week.':cut?'Eat about '+goal+' kcal a day, roughly 400 under your maintenance of '+tg.kcal+', and keep protein high so the weight lost is fat.':'Your target today is '+tg.kcal+' kcal.'),
        left>0?'Left today: '+left+' kcal'+(pLeft?' and '+pLeft+' g protein':'')+'.':'You are '+(-left)+' kcal over today\u2019s '+(bulk?'bulking ':'')+'number.',
        pLeft>=30?'Protein first: '+pLeft+' g is about '+Math.ceil(pLeft/30)+' portion'+(Math.ceil(pLeft/30)>1?'s':'')+' of chicken, fish, Greek yogurt, eggs or tofu (about 30 g each).':'Protein is on track for today.',
        bulk?'Easy extra calories: whole milk, oats, peanut butter, rice, olive oil on food, a banana with nuts.':'',
        bulk?'Train with weights 3 to 4 times a week: the surplus only becomes muscle with the training.':''])});
      return {title:'Food check',
        summary:(h.source.indexOf('example')===0?'From Kova\u2019s example data: ':'')+eaten+' of '+goal+' kcal today'+(bulk?' (bulking)':cut?' (cutting)':'')+', '+(t.protein_g||0)+' of '+tg.protein_g+' g protein.',
        metrics:[{label:'Eaten',value:String(eaten),unit:' kcal',note:'Today'},{label:bulk?'Bulk target':cut?'Cut target':'Target',value:String(goal),unit:' kcal',note:'Maintenance '+tg.kcal},
          {label:'Protein',value:String(t.protein_g||0),unit:' g',note:'of '+tg.protein_g+' g'},{label:'Left',value:String(Math.max(0,left)),unit:' kcal',note:left>0?'To eat today':'Over'}],
        charts:[{type:'gauge',title:'Calories today',unit:'%',value:Math.min(150,Math.round(eaten/goal*100))},{type:'bars',title:'Macros today',unit:'g',data:[{label:'Protein',value:t.protein_g||0},{label:'Carbs',value:t.carbs_g||0},{label:'Fat',value:t.fat_g||0}]}],
        sections:sec, stages:['Read today','Compare with the target','Plan the next meal']};
    }};

  /* which skills each role has, and which words call each one */
  var SK_FOR={chief:['brief','analyze','projects'],pm:['triage','breakdown','projects'],analyst:['analyze'],inbox:['followups'],content:['content'],research:['research'],finance:['finance','followups'],sched:['schedule','focus'],coach:['focus','brief'],
    /* Maya posts and reads comments (server tools); drafting stays Zoe's lane */
    social:['analyze','content'],nutrition:['nutrition'],sleep:['sleep'],training:['training'],vitals:['vitals']};
  var SK_WORDS={triage:/overdue|triage|\blate\b|behind|re-?plan|re-?date|clean ?up|stuck/i,
    breakdown:/break\b.*\b(down|into)|new project|plan (a|the|my|this) project|project (for|called|named)|steps (for|to)/i,
    projects:/project|progress|milestone/i,
    analyze:/report|analy|how (is|are|am)|numbers?|metric|pace|going|stats|review|kpi|trend/i,
    content:/post|content|idea|caption|reel|tiktok|instagram|youtube|hook|hashtag|campaign|social|linkedin/i,
    followups:/follow|e-?mail|client|lead|reply|chase|customer|waiting on me|who is waiting/i,
    finance:/revenue|invoice|money|price|cost|profit|budget|paid|sales|income|target|owe/i,
    research:/research|competitor|market|look up|find out|pricing|industry|trending/i,
    schedule:/meeting|call|schedule|book|calendar|slot|my week|plan (my|the) week/i,
    focus:/focus|energy|tired|deep work|stress|overload|readiness|burn/i,
    brief:/brief|today|standup|stand-up|morning|my day|priorit|what should i|at risk/i,
    sleep:/\bsleep|\bslept|bedtime|\bbed\b|\bnights?\b|\brem\b|deep sleep|insomnia|dark circles|\bnap|doom ?scroll|wake up/i,
    nutrition:/calorie|kcal|protein|\beat|food|meal|bulk|diet|macro|nutrition|carb|hungry|snack|breakfast|lunch|dinner/i,
    training:/workout|\btrain|\blift|\bgym|exercise|muscle|strength|squat|bench|cardio|\breps\b/i,
    vitals:/\bhrv\b|heart rate|resting heart|recovery|vitals|\bpulse|spo2/i};
  function skillsOf(e){ if(SK_FOR[e.tpl]) return SK_FOR[e.tpl]; var t=(e.title+' '+e.job).toLowerCase(), out=Object.keys(SK_WORDS).filter(function(k){ return SK_WORDS[k].test(t); }); return out.length?out:['analyze']; }
  function pickSkill(e,text){
    var own=skillsOf(e), t=String(text||'');
    /* p25: a question about your sleep or food is answered by whoever you
       asked, from your own numbers, not handed round or turned into a
       work report because it said "today" */
    var body=['sleep','nutrition','vitals','training'].filter(function(k){ return SK_WORDS[k].test(t); })[0];
    if(body) return {id:body,matched:true};
    for(var i=0;i<own.length;i++) if(SK_WORDS[own[i]].test(t)) return {id:own[i],matched:true};
    var other=Object.keys(SK_WORDS).filter(function(k){ return SK_WORDS[k].test(t); })[0];
    if(other){ var mate=emps().filter(function(x){ return x.enabled&&x.id!==e.id&&skillsOf(x)[0]===other; })[0]; if(mate) return {id:other,handoff:mate}; return {id:other,matched:true}; }
    return {id:own[0],matched:false};
  }
  var SNAP={};
  function snapshot(e){ var id=skillsOf(e)[0], sk=SK[id]; if(!sk) return null; try{ var r=sk.build(e,'',null); r.skill=id; r.skillName=sk.n; SNAP[e.id]=r; return r; }catch(x){ return null; } }
  var RUN_LABEL={brief:'Brief me now',triage:'Triage the overdue work',projects:'Check my projects',breakdown:'Break a project down',analyze:'Write the full report',followups:'Draft the follow-ups',content:'Draft the first 3 in the Studio',research:'Set up the research tasks',finance:'Draft invoice reminders',schedule:'Add prep tasks',focus:'Plan my day'};
  var RUN_JOB={brief:'Brief me on today',triage:'Triage my overdue tasks',projects:'How are my projects doing?',breakdown:'Break my next project into tasks',analyze:'Write my weekly work report',followups:'Draft follow-up emails for everyone waiting on me',content:'Draft this week’s posts in the Studio',research:'Research my competitors and set up research tasks',finance:'Chase my late invoices and draft reminders',schedule:'Add prep tasks for my calls',focus:'Plan today around my energy'};
  /* what good work looks like, per role: the brief Claude gets on the server */
  var ROLE={chief:'Deliver a ranked plan: the 3 things to do first and why, today blocked out in times, what is at risk, and the one decision you need from the user. Chart the next 7 days of work.',
    pm:'Re-date overdue work by priority, report every project’s progress with a chart, and break new projects into 3 to 7 dated tasks.',
    analyst:'Numbers first: this period against the last, the overdue trend, the on-time rate and goal pace. At most 6 metrics, 2 or more charts, and 3 recommendations that each name a number.',
    inbox:'Find everyone waiting on a reply, draft one short email each (never invent an address; leave it empty if unknown) and create a follow-up task with a date for each.',
    content:'Give 5 to 7 concrete post ideas, each with a day, platform, format, hook, a 3-beat outline, caption, 5 hashtags and a posting time; a content mix (teach, show, prove, sell) and 3 goals for the week with numbers. Put the ideas in write_report.ideas and chart the mix.',
    research:'Search the web and cite sources. Compare competitors on price, what is included and what customers complain about, then end with 3 actions.',
    finance:'Goal pace with the weekly rate needed, open invoices with totals and days late, and reminders drafted for the oldest ones.',
    sched:'Shape the week: meetings per day, deep-work blocks on the lightest days, and prep tasks for calls without notes.',
    coach:'Plan the day around readiness: the hardest work in the best hours, lighter work after lunch and a stop time, naming the task for each block.'};
  function wantsAct(sk,job,matched){ if(!matched||!sk.writes) return false; if(job.source==='routine') return true; return (sk.act||/^$/).test(job.text); }

  /* ---------------- offline: every employee still does their skill ---------------- */
  function localRun(job){
    job.brain='local';
    var e=emp(job.emp); if(!e){ fail(job,'This employee no longer exists.'); return; }
    var pick=pickSkill(e,job.text);
    if(pick.handoff){
      log(job,'This is '+pick.handoff.n+'’s job ('+pick.handoff.title+'), so I passed it on','handoff');
      job.after=[{to:pick.handoff.id,job:job.text}];
      finish(job,'That is '+pick.handoff.n+'’s job, so I handed it over.'); return;
    }
    var sk=SK[pick.id]; job.skill=pick.id; job.matched=pick.matched;
    var calls=(sk.reads?sk.reads(e,job.text):[]).concat(wantsAct(sk,job,pick.matched)?sk.writes(e,job.text,job):[]);
    job.queue=calls.map(function(c,i){ return {id:'l'+i,name:c.name,input:c.input}; }); job.results=[];
    proceed(job);
  }
  function localFinish(job){
    var e=emp(job.emp), sk=SK[job.skill]||SK.analyze, rep=null;
    try{ rep=sk.build(e,job.text,job); }catch(x){ rep=null; }
    if(rep){ rep.skill=job.skill; job.report=rep; log(job,'Wrote the report','report'); }
    var why=brainWhy();
    finish(job,job.matched===false?'I cannot answer “'+job.text.split('\n')[0].slice(0,80)+'” without AI ('+why+'). Here is my '+sk.n.toLowerCase()+' instead.'
      :'Quick answer from your numbers, without AI ('+why+').');
  }

  /* ---------------- routines: schedules and events ---------------- */
  function slot(e,now){
    var r=e.routine||{}; if(!r.freq||r.freq==='off'||r.freq==='event'||!r.job) return null;
    if(r.freq==='hourly') return (e.lastRoutine||0)+3600e3<=now?now:null;
    var hm=String(r.time||'09:00').split(':'), d=new Date(now); d.setHours(+hm[0]||0,+hm[1]||0,0,0);
    var t=d.getTime(), dow=d.getDay();
    if(r.freq==='weekdays'&&(dow===0||dow===6)) return null;
    if(r.freq==='weekly'&&dow!==(+r.dow%7)) return null;
    if(t>now||now-t>18*3600e3) return null;
    return (e.lastRoutine||0)<t?t:null;
  }
  function tick(){
    var now=Date.now();
    emps().forEach(function(e){
      if(!e.enabled||busyWith(e.id)) return;
      if(slot(e,now)!=null){ touch(e,{lastRoutine:now}); start(e,e.routine.job,'routine'); }
    });
    var od=W.overdue().length;
    if(S.lastOverdue!=null&&od>S.lastOverdue) fire('overdue',{text:(od-S.lastOverdue)+' more task'+(od-S.lastOverdue>1?'s are':' is')+' now overdue ('+od+' in total).'});
    S.lastOverdue=od;
  }
  function fire(ev,info){
    emps().forEach(function(e){
      var r=e.routine||{};
      if(!e.enabled||r.freq!=='event'||r.event!==ev||!r.job||busyWith(e.id)) return;
      if(ev==='assigned'&&info.to!==e.id) return;
      touch(e,{lastRoutine:Date.now()});
      start(e,r.job+'\n\nWhat happened: '+info.text,'routine');
    });
  }
  function describeRoutine(e){
    var r=e.routine||{};
    if(!r.freq||r.freq==='off') return 'No routine';
    if(r.freq==='event') return 'When '+({overdue:'a task becomes overdue',new_task:'a task is added',assigned:'a task is assigned to '+e.n}[r.event]||r.event);
    if(r.freq==='hourly') return 'Every hour while Kova is open';
    var d=['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays'];
    return ({daily:'Every day',weekdays:'Weekdays',weekly:d[(+r.dow||1)%7]}[r.freq]||r.freq)+' at '+(r.time||'09:00');
  }
  /* notice task events and record when things get finished */
  function hookWork(){
    if(W.__crew) return; W.__crew=true;
    var rawC=W.create, rawU=W.update;
    W.create=function(coll,o,actor){
      var r=rawC.apply(W,arguments);
      try{ if(coll==='items'&&r&&!r.error&&(!actor||actor==='user')){ setTimeout(function(){ fire('new_task',{text:'New task \u201c'+r.name+'\u201d.'}); if(r.assignee) fire('assigned',{to:r.assignee,text:'\u201c'+r.name+'\u201d was assigned to you.'}); },0); } }catch(x){}
      return r;
    };
    W.update=function(coll,id,patch,actor){
      try{
        if(coll==='items'&&patch){
          var row=W.find('items',id);
          if(row&&patch.status==='Completed'&&row.status!=='Completed'&&!patch.completedAt) patch.completedAt=Date.now();
          if(row&&patch.assignee&&patch.assignee!==row.assignee&&patch.assignee!==actorId(actor)) setTimeout(function(){ fire('assigned',{to:patch.assignee,text:'\u201c'+row.name+'\u201d was assigned to you.'}); },0);
        }
      }catch(x){}
      return rawU.apply(W,arguments);
    };
  }
  function actorId(actor){ var e=byName(actor); return e?e.id:''; }
  function notify(){
    var n=waiting().length, b=document.getElementById('crwBadge');
    if(b){ b.textContent=n?String(n):''; b.hidden=!n; }
  }

  /* ---------------- UI: the AI team dashboard ----------------
     Laid out like the reference the user chose: pill navigation with three
     round icons, an "Updated" line over a large light title, labelled stats
     with superscript units, a dotted stage timeline, a focus card with a
     wireframe globe, tabs, and a grid of big-number tiles that each carry
     their own chart. The reference's bright gradients become the Work OS
     palette: frosted white and graphite in dark, graphite tones in light. */
  function host(){ return document.getElementById('wtmBody'); }
  var paintT=null;
  function paintSoon(){ clearTimeout(paintT); paintT=setTimeout(function(){ paint(); paintHome(); },40); }
  /* Work OS home: an "AI team" tab in the top row, so the team is one tap away */
  function paintHome(){
    var scr=document.getElementById('s-work'); if(!scr) return;
    var tabs=scr.querySelector('.wk-tabs');
    if(tabs&&!tabs.querySelector('[data-go="workteam"]')){
      var t=document.createElement('div'); t.className='wk-tab'; t.setAttribute('data-go','workteam'); t.textContent='AI team';
      var board=tabs.querySelector('[data-go="worktoday"]'); tabs.insertBefore(t,board?board.nextSibling:null);
    }
    var old=document.getElementById('crwHome'); if(old) old.remove();
  }
  function visible(){ var s=document.getElementById('s-workteam'); return !!(s&&s.classList.contains('on')); }
  function av(e,big){ return '<span class="crw-av'+(big?' big':'')+'" aria-hidden="true"><i></i><b>'+esc(String(e.n||'?').charAt(0).toUpperCase())+'</b></span>'; }
  function statusOf(e){
    if(!e.enabled) return {k:'off',t:'Off'};
    var j=busyWith(e.id);
    if(j&&j.state==='waiting') return {k:'wait',t:'Needs you'};
    if(j&&j.state==='paused') return {k:'wait',t:'Paused'};
    if(j) return {k:'run',t:'Working'};
    return {k:'idle',t:e.lastRun?'Idle · '+ago(e.lastRun):'Ready'};
  }
  function spark(pts){
    var mx=Math.max.apply(null,pts.concat([1])), w=100, h=28;
    var d=pts.map(function(v,i){ return (i?'L':'M')+(i/(pts.length-1)*w).toFixed(1)+' '+(h-2-(v/mx)*(h-6)).toFixed(1); }).join(' ');
    return '<svg class="crw-sp" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="'+d+' L100 28 L0 28 Z" class="a"/><path d="'+d+'" class="l"/></svg>';
  }
  function fmtN(v){ return typeof v==='number'?v.toLocaleString('en-US'):String(v==null?'':v); }

  /* ---- icons, drawn as line art so they take the theme's ink ---- */
  var IC={back:'<path d="M14.5 5l-7 7 7 7"/>',search:'<circle cx="11" cy="11" r="6.3"/><path d="M15.8 15.8l4.2 4.2"/>',
    bell:'<path d="M6.2 16.5V11a5.8 5.8 0 0111.6 0v5.5l1.4 1.8H4.8z"/><path d="M10 20.3a2.2 2.2 0 004 0"/>',
    mic:'<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.8 11.2a6.2 6.2 0 0012.4 0M12 17.4v3.1"/>',
    sliders:'<path d="M6 4v16M12 4v16M18 4v16"/><circle cx="6" cy="9" r="1.9"/><circle cx="12" cy="15" r="1.9"/><circle cx="18" cy="8" r="1.9"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    arrow:'<path d="M8 16L16 8M9.5 8H16v6.5"/>',chev:'<path d="M7 10l5 5 5-5"/>',person:'<circle cx="12" cy="8.2" r="3.4"/><path d="M5.5 19.5a6.5 6.5 0 0113 0"/>',
    send:'<path d="M12 19V6M6.5 11.5L12 6l5.5 5.5"/>',plus:'<path d="M12 5v14M5 12h14"/>'};
  function svg(p,cls){ return '<svg class="crd-ic'+(cls?' '+cls:'')+'" viewBox="0 0 24 24" aria-hidden="true">'+p+'</svg>'; }

  /* ---- charts: one scale, real numbers, the tile's own ink ---- */
  function nums(d){ return (d||[]).map(function(x){ return +x.value||0; }); }
  function short(s,n){ s=String(s==null?'':s); return s.length>n?s.slice(0,n-1)+'…':s; }
  function barsChart(d,max){
    d=(d||[]).slice(0,8); if(!d.length) return empty();
    var v=nums(d), mx=max||Math.max.apply(null,v.concat([1])), n=d.length, W2=260, bw=Math.min(28,180/n), gap=(W2-bw*n)/(n+1), h='';
    d.forEach(function(x,i){ var hgt=Math.max(3,(v[i]/mx)*78), x0=gap+i*(bw+gap);
      h+='<rect class="f" x="'+x0.toFixed(1)+'" y="'+(98-hgt).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+hgt.toFixed(1)+'" rx="'+Math.min(8,bw/2).toFixed(1)+'"/>'
        +'<text class="v" x="'+(x0+bw/2).toFixed(1)+'" y="'+(92-hgt).toFixed(1)+'">'+esc(fmtN(v[i]))+'</text>'
        +'<text class="l" x="'+(x0+bw/2).toFixed(1)+'" y="114">'+esc(short(x.label,n>5?4:9))+'</text>'; });
    return '<svg class="crd-ch" viewBox="0 0 260 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'+h+'</svg>';
  }
  function lineChart(d){
    d=(d||[]); if(d.length<2) return empty();
    var v=nums(d), mx=Math.max.apply(null,v.concat([1])), n=d.length, pts=v.map(function(y,i){ return [8+i*(244/(n-1)),96-(y/mx)*78]; });
    var p=pts.map(function(q,i){ return (i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1); }).join(' '), top=v.indexOf(mx);
    return '<svg class="crd-ch" viewBox="0 0 260 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path class="a" d="'+p+' L252 100 L8 100 Z"/><path class="s" d="'+p+'"/>'
      +pts.map(function(q,i){ return '<circle class="'+(i===top?'dot hot':'dot')+'" cx="'+q[0].toFixed(1)+'" cy="'+q[1].toFixed(1)+'" r="'+(i===top?3.6:1.8)+'"/>'; }).join('')
      +'<text class="l" x="8" y="115" text-anchor="start">'+esc(d[0].label)+'</text><text class="l" x="252" y="115" text-anchor="end">'+esc(d[n-1].label)+'</text></svg>';
  }
  function donutChart(d){
    d=(d||[]).filter(function(x){ return (+x.value||0)>0; }); if(!d.length) return empty();
    var tot=nums(d).reduce(function(a,b){ return a+b; },0), C=2*Math.PI*38, off=0, ops=[1,.62,.38,.2,.12], h='';
    d.slice(0,5).forEach(function(x,i){ var len=(+x.value/tot)*C; h+='<circle class="seg" cx="58" cy="60" r="38" style="opacity:'+ops[i]+'" stroke-dasharray="'+Math.max(0,len-2).toFixed(1)+' '+(C-len+2).toFixed(1)+'" stroke-dashoffset="'+(-off).toFixed(1)+'"/>'; off+=len; });
    var leg=d.slice(0,5).map(function(x,i){ return '<g transform="translate(118,'+(26+i*20)+')"><circle class="seg-d" cx="0" cy="-4" r="4" style="opacity:'+ops[i]+'"/><text class="lg" x="10" y="0">'+esc(short(x.label,12))+'</text><text class="lv" x="130" y="0">'+Math.round(+x.value/tot*100)+'%</text></g>'; }).join('');
    return '<svg class="crd-ch" viewBox="0 0 260 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g transform="rotate(-90 58 60)">'+h+'</g>'+leg+'</svg>';
  }
  function arcPt(cx,cy,r,deg){ var a=deg*Math.PI/180; return [cx+r*Math.cos(a),cy-r*Math.sin(a)]; }
  function gaugeChart(p,unit,label){
    p=Math.max(0,Math.min(100,+p||0));
    var cx=130,cy=108,r=78, s=arcPt(cx,cy,r,180), e=arcPt(cx,cy,r,180-180*p/100), big=p>50?1:0, t=arcPt(cx,cy,r,0);
    return '<svg class="crd-ch" viewBox="0 0 260 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'
      +'<path class="track" d="M'+s[0]+' '+s[1]+' A'+r+' '+r+' 0 0 1 '+t[0].toFixed(1)+' '+t[1].toFixed(1)+'"/>'
      +(p>0?'<path class="arc" d="M'+s[0]+' '+s[1]+' A'+r+' '+r+' 0 '+big+' 1 '+e[0].toFixed(1)+' '+e[1].toFixed(1)+'"/>':'')
      +'<circle class="dot hot" cx="'+e[0].toFixed(1)+'" cy="'+e[1].toFixed(1)+'" r="5"/><circle class="node" cx="'+arcPt(cx,cy,r,150)[0].toFixed(1)+'" cy="'+arcPt(cx,cy,r,150)[1].toFixed(1)+'" r="4"/>'
      +(label!==false?'<text class="gv" x="'+cx+'" y="'+(cy-14)+'">'+Math.round(p)+(unit||'')+'</text>':'')+'</svg>';
  }
  function hillsChart(d){
    d=(d||[]).slice(0,5); if(!d.length) return empty();
    var v=nums(d), mx=Math.max.apply(null,v.concat([1])), n=d.length, w=260/n, hi=v.indexOf(Math.max.apply(null,v)), h='';
    d.forEach(function(x,i){ var cx=w*i+w/2, hgt=Math.max(10,(v[i]/mx)*70), base=100;
      if(i===hi&&v[i]>0) h+='<rect class="solid" x="'+(cx-17).toFixed(1)+'" y="'+(base-hgt).toFixed(1)+'" width="34" height="'+hgt.toFixed(1)+'" rx="14"/>';
      else h+='<path class="hill" d="M'+(cx-26).toFixed(1)+' '+base+' C'+(cx-12).toFixed(1)+' '+base+' '+(cx-13).toFixed(1)+' '+(base-hgt).toFixed(1)+' '+cx.toFixed(1)+' '+(base-hgt).toFixed(1)+' C'+(cx+13).toFixed(1)+' '+(base-hgt).toFixed(1)+' '+(cx+12).toFixed(1)+' '+base+' '+(cx+26).toFixed(1)+' '+base+'"/>'
        +'<circle class="node" cx="'+cx.toFixed(1)+'" cy="'+(base-hgt).toFixed(1)+'" r="2.6"/>';
      h+='<text class="v" x="'+cx.toFixed(1)+'" y="'+(base-hgt-8).toFixed(1)+'">'+esc(fmtN(v[i]))+'</text><text class="l" x="'+cx.toFixed(1)+'" y="115">'+esc(short(x.label,9))+'</text>'; });
    return '<svg class="crd-ch" viewBox="0 0 260 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'+h+'</svg>';
  }
  function weekChart(d,tags){
    d=(d||[]).slice(0,7); if(!d.length) return empty();
    var w=260/d.length, h='';
    d.forEach(function(x,i){ var cx=w*i+w/2, on=(+x.value||0)>0;
      h+='<text class="l" x="'+cx.toFixed(1)+'" y="16">'+esc(short(x.label,5))+'</text><rect class="'+(on?'solid':'hill')+'" x="'+(cx-w/2+5).toFixed(1)+'" y="26" width="'+(w-10).toFixed(1)+'" height="'+(tags?58:78)+'" rx="10"/>'
        +(tags&&x.tag?'<text class="lt" x="'+cx.toFixed(1)+'" y="102">'+esc(short(String(x.tag).split(' · ')[0],8))+'</text><text class="lt" x="'+cx.toFixed(1)+'" y="114">'+esc(short(String(x.tag).split(' · ')[1]||'',8))+'</text>':''); });
    return '<svg class="crd-ch" viewBox="0 0 260 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'+h+'</svg>';
  }
  function matrixChart(d){
    var h='<rect class="hill" x="30" y="6" width="110" height="46" rx="8"/><rect class="solid soft" x="146" y="6" width="110" height="46" rx="8"/><rect class="hill" x="30" y="58" width="110" height="46" rx="8"/><rect class="hill" x="146" y="58" width="110" height="46" rx="8"/>'
      +'<text class="l" x="85" y="118">Low effort</text><text class="l" x="201" y="118">High effort</text><text class="l" x="14" y="32" transform="rotate(-90 14 32)">Impact</text>';
    (d||[]).forEach(function(x,i){ var px=30+((+x.x||1)-1)/2*226*.9+14+(i%2)*10, py=104-((+x.y||1)-1)/2*98*.9-12-(i%3)*6; h+='<circle class="dot hot" cx="'+px.toFixed(1)+'" cy="'+py.toFixed(1)+'" r="8"/><text class="dn" x="'+px.toFixed(1)+'" y="'+(py+3.5).toFixed(1)+'">'+esc(x.label)+'</text>'; });
    return '<svg class="crd-ch" viewBox="0 0 260 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'+h+'</svg>';
  }
  function empty(){ return '<div class="crd-empty">Nothing to chart yet.</div>'; }
  function chart(ch,where){
    if(!ch) return empty();
    var t=ch.type;
    if(t==='gauge') return gaugeChart(ch.value,ch.unit,where!=='tile');
    if(t==='hills') return hillsChart(ch.data);
    if(t==='donut') return donutChart(ch.data);
    if(t==='line') return lineChart(ch.data);
    if(t==='week') return weekChart(ch.data,where!=='tile');
    if(t==='matrix') return matrixChart(ch.data);
    return barsChart(ch.data,ch.max);
  }
  /* the big number a chart stands for, for its tile */
  function chartHead(ch){
    var v=nums(ch.data), tot=v.reduce(function(a,b){ return a+b; },0);
    if(ch.type==='gauge') return {v:Math.round(+ch.value||0),pre:ch.unit||'%',suf:''};
    if(ch.type==='donut'){ var i=v.indexOf(Math.max.apply(null,v.concat([0]))); return {v:tot?Math.round(v[i]/tot*100):0,pre:'%',suf:'/'+String((ch.data[i]||{}).label||'').toLowerCase()}; }
    if(ch.type==='line') return {v:Math.max.apply(null,v.concat([0])),pre:'',suf:'/peak'};
    if(ch.type==='week') return {v:v.filter(function(x){ return x>0; }).length,pre:'',suf:'/days'};
    if(ch.type==='matrix') return {v:(ch.data||[]).length,pre:'',suf:'/questions'};
    return {v:tot,pre:'',suf:'/'+(ch.unit||'total')};
  }
  /* the team tile's scatter: finished jobs per day over rings, like the reference */
  function ringsChart(vals,times){
    var n=vals.length, mx=Math.max.apply(null,vals.concat([1])), h='';
    for(var i=0;i<11;i++){ var cx=10+i*28; h+='<ellipse class="ring" cx="'+cx+'" cy="'+(78+Math.sin(i/1.7)*8).toFixed(1)+'" rx="44" ry="'+(40+Math.cos(i/2)*10).toFixed(1)+'"/>'; }
    vals.forEach(function(v,i){ var x=10+i*(280/Math.max(1,n-1)), y=v?118-(v/mx)*86:122; h+=v?'<circle class="dot" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="3.4"/>':'<circle class="node" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="1.4"/>'; });
    [0,.25,.5,.75,1].forEach(function(f){ var i=Math.round(f*(n-1)); h+='<text class="l" x="'+(10+i*(280/Math.max(1,n-1))).toFixed(1)+'" y="146">'+new Date(times[i]).getDate()+'</text>'; });
    return '<svg class="crd-ch ch-big" viewBox="0 0 300 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'+h+'</svg>';
  }
  /* status as four labelled bars: readable at any tile size */
  function statusRows(d){
    var mx=Math.max.apply(null,d.map(function(x){ return +x.value||0; }).concat([1]));
    return '<div class="crd-srows" role="img" aria-label="'+esc(d.map(function(x){ return x.label+' '+x.value; }).join(', '))+'">'+d.map(function(x){
      return '<div class="r"><span>'+esc(x.label)+'</span><i><b style="width:'+((+x.value||0)/mx*100).toFixed(0)+'%"></b></i><em>'+esc(fmtN(+x.value||0))+'</em></div>'; }).join('')+'</div>';
  }
  function orbitChart(frac){
    var r=10+frac*26;
    return '<svg class="crd-ch" viewBox="0 0 260 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><circle class="ring" cx="180" cy="112" r="74"/><path class="track" d="M60 112 A120 120 0 0 1 250 40"/>'
      +'<circle class="node" cx="196" cy="42" r="4"/><circle class="node" cx="168" cy="62" r="3.4"/><circle class="solid" cx="150" cy="104" r="'+r.toFixed(1)+'"/><circle class="dot hot" cx="108" cy="120" r="3"/></svg>';
  }
  function halftone(n){
    var h='';
    for(var y=0;y<8;y++) for(var x=0;x<18;x++){ var d=Math.hypot((x-11)/7,(y-4.5)/3.2), r=Math.max(0,1.9-d*1.2+Math.sin(x*1.3+y)*.35+(n?.3:0)); if(r>.25) h+='<circle class="dot" cx="'+(12+x*13.5)+'" cy="'+(12+y*13)+'" r="'+r.toFixed(2)+'"/>'; }
    return '<svg class="crd-ch" viewBox="0 0 260 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'+h+'</svg>';
  }
  function globe(){
    var s='';
    [[62,60],[118,60]].forEach(function(c){ s+='<circle cx="'+c[0]+'" cy="'+c[1]+'" r="46"/>'; [42,33,23,12].forEach(function(rx){ s+='<ellipse cx="'+c[0]+'" cy="'+c[1]+'" rx="'+rx+'" ry="46"/>'; }); });
    return '<svg class="crd-globe" viewBox="0 0 180 120" aria-hidden="true"><g class="w">'+s+'</g><circle class="n" cx="16" cy="58" r="2.6"/><circle class="o" cx="90" cy="16" r="2.8"/><circle class="o" cx="164" cy="64" r="2.8"/><circle class="a" cx="90" cy="62" r="4.4"/></svg>';
  }

  /* ---- the pieces of the page ---- */
  var NAV=[['team','Team'],['chat','Chat'],['jobs','Jobs'],['approvals','Approvals'],['routines','Routines'],['reports','Reports'],['usage','Usage']];
  function topBar(){
    var nav=S.view==='team'?(S.nav||'team'):'', wt=waiting().length, on=!!(window.KovaListen&&KovaListen.on());
    return '<div class="crd-top">'
      +'<button class="crd-circ" data-back aria-label="Back">'+svg(IC.back)+'</button>'
      +'<div class="crd-brand"><b>kova</b><span>AI team</span></div>'
      +'<nav class="crd-nav" aria-label="AI team">'+NAV.map(function(n){ return '<button class="crd-pill'+(nav===n[0]?' on':'')+'" data-c="nav" data-n="'+n[0]+'"'+(nav===n[0]?' aria-current="page"':'')+'>'+n[1]+(n[0]==='approvals'&&wt?' <em>'+wt+'</em>':'')+'</button>'; }).join('')+'</nav>'
      +'<div class="crd-icons"><button class="crd-circ" data-c="search" aria-label="Give the team a job">'+svg(IC.search)+'</button>'
      +'<button class="crd-circ" data-c="nav" data-n="approvals" aria-label="Approvals'+(wt?', '+wt+' waiting':'')+'">'+svg(IC.bell)+(wt?'<i class="crd-dot">'+wt+'</i>':'')+'</button>'
      +'<button class="crd-circ'+(on?' on':'')+'" data-c="listen" aria-pressed="'+on+'" aria-label="Call your team by name">'+svg(IC.mic)+'</button></div></div>';
  }
  function head(t,title,sub){ return '<div class="crd-upd">'+esc(sub||('Updated '+ago(t||Date.now())))+'</div><h1 class="crd-title">'+esc(title)+'</h1>'; }
  function stat(label,v,unit,cap){ var word=!/^[\d.,:%+\-\u2212 ]*$/.test(String(fmtN(v))); return '<div class="crd-stat"><span class="crd-lab">'+esc(label)+'</span><div class="crd-num'+(word?' w':'')+'">'+esc(fmtN(v))+(unit?'<sup>'+(unit==='person'?svg(IC.person):esc(unit))+'</sup>':'')+'</div><div class="crd-cap">'+esc(cap||'')+'</div></div>'; }
  function flow(j,e,sn){
    var rows=[];
    if(j){
      var st=j.steps.filter(function(s){ return s.k!=='think'; }), live=j.state==='running'||j.state==='waiting';
      st.slice(-5).forEach(function(s,i,arr){ rows.push({t:s.t,st:(live&&i===arr.length-1)?'active':'done'}); });
      if(live) rows.push({t:'Report back to you',st:'next'});
    } else {
      ((sn&&sn.stages)||['Tell the team a job, or say a name','They read your work','They do the work','You approve what leaves Kova','They report back with numbers']).forEach(function(t,i){ rows.push({t:t,st:i===0?'up':'next'}); });
    }
    var L={done:'Done',active:'Active',next:'Next',up:'Up next'};
    return '<div class="crd-flow"'+(j?' data-c="job" data-j="'+esc(j.id)+'" role="button" tabindex="0" aria-label="Open this job"':'')+'>'+rows.slice(-6).map(function(r){
      return '<div class="crd-step s-'+r.st+'"><span class="t">'+esc(r.t)+'</span><span class="st">'+L[r.st]+'</span>'+(r.st==='active'||r.st==='up'?'<span class="pl" aria-hidden="true">▶</span>':'')+'</div>'; }).join('')+'</div>';
  }
  function nextRoutine(){
    var best=null, now=Date.now();
    emps().forEach(function(e){ var r=e.routine||{}; if(!e.enabled||!r.job||['daily','weekdays','weekly'].indexOf(r.freq)<0) return; var p=String(r.time||'09:00').split(':');
      for(var d=0;d<8;d++){ var t=new Date(sod()+d*DAY); t.setHours(+p[0]||0,+p[1]||0,0,0); var w=t.getDay(); if(r.freq==='weekdays'&&(w===0||w===6)) continue; if(r.freq==='weekly'&&w!==(+r.dow%7)) continue; if(t.getTime()>now){ if(!best||t.getTime()<best.at) best={e:e,at:t.getTime()}; break; } } });
    return best;
  }
  function focusCard(j,e,sn){
    var t,v,suf,cap,c='search',id='';
    if(j){ var who=emp(j.emp)||{n:'?'}, n=j.steps.filter(function(s){ return s.k!=='think'; }).length;
      t=j.state==='waiting'?who.n+' needs you':who.n+' is working'; v=j.state==='waiting'?'1':String(n); suf=j.state==='waiting'?'/approval':'/steps';
      cap=j.state==='waiting'?'Approve or skip it so '+who.n+' can finish.':'On: '+j.text.split('\n')[0].slice(0,80); c='job'; id=j.id; }
    else if(sn&&sn.next){ t=sn.next.title; v=sn.next.value; suf=sn.next.suffix||''; cap=sn.next.cap||''; c='run'; id=e.id; }
    else { var nr=nextRoutine(); t=nr?'Next routine':'Team ready'; v=nr?hm(nr.at):String(emps().filter(function(x){ return x.enabled; }).length); suf=nr?'/'+(nr.at<sod()+DAY?nr.e.n:wd(nr.at,true)):'/employees';
      cap=nr?nr.e.n+': '+nr.e.routine.job:'Give them a job, or say a name.'; }
    return '<button class="crd-focus" data-c="'+c+'" data-id="'+esc(id)+'" data-j="'+esc(id)+'"><span class="crd-ft">'+esc(t)+'</span><span class="crd-arw">'+svg(IC.arrow)+'</span>'
      +'<span class="crd-fv">'+esc(v)+'<small>'+esc(suf)+'</small></span><span class="crd-fc">'+esc(cap)+'</span>'+globe()+'</button>';
  }
  /* p30: the team page lists every teammate as a row that opens their own
     page (it was a strip of name pills that only swapped the numbers) */
  function roster(){
    return '<div class="crw-rh"><span class="crd-sh2">Your team</span><span class="crd-grow"></span>'
        +'<button class="crd-pill ghost" data-c="hire">'+svg(IC.plus,'sm')+'Hire</button>'
        +'<button class="crd-circ'+(S.showSet?' on':'')+'" data-c="settings" aria-label="Team settings">'+svg(IC.gear)+'</button></div>'
      +'<div class="crw-roster">'+emps().map(function(e){ var st=statusOf(e);
        return '<button class="crw-rc'+(e.enabled?'':' off')+'" data-c="tab" data-t="'+esc(e.id)+'">'+av(e)
          +'<span class="crw-rn"><b>'+esc(e.n)+'</b><small>'+esc(e.title)+'</small></span>'
          +'<span class="crw-rs s-'+st.k+'">'+esc(st.t)+'</span><span class="crw-rgo" aria-hidden="true">›</span></button>'; }).join('')+'</div>';
  }
  function tabsRow(active){
    return '<div class="crd-tabsrow"><div class="crd-tabs" role="tablist" aria-label="Employees">'
      +'<button class="crd-pill'+(active==='all'?' on':'')+'" data-c="tab" data-t="all" role="tab" aria-selected="'+(active==='all')+'">All team</button>'
      +emps().map(function(e){ var st=statusOf(e); return '<button class="crd-pill'+(active===e.id?' on':'')+(e.enabled?'':' off')+'" data-c="tab" data-t="'+esc(e.id)+'" role="tab" aria-selected="'+(active===e.id)+'">'+esc(e.n)+(st.k==='run'||st.k==='wait'?'<i class="crd-live s-'+st.k+'"></i>':'')+'</button>'; }).join('')
      +'<button class="crd-pill ghost" data-c="hire">'+svg(IC.plus,'sm')+'Hire</button></div>'
      +'<div class="crd-icons">'+(active!=='all'?'<button class="crd-circ" data-c="edit" data-id="'+esc(active)+'" aria-label="Edit the job">'+svg(IC.sliders)+'</button>':'<button class="crd-circ" data-c="nav" data-n="routines" aria-label="Routines">'+svg(IC.sliders)+'</button>')
      +'<button class="crd-circ'+(S.showSet?' on':'')+'" data-c="settings" aria-label="Team settings">'+svg(IC.gear)+'</button></div></div>'
      +(S.showSet?settingsCard():'');
  }
  function settingsCard(){
    var b=brainName();
    return '<div class="crd-card crd-set"><div class="crd-chd"><span>Team settings</span></div>'
      +'<div class="crw-brain"><i class="'+b+'"></i>Thinking with: '+BRAIN_N[b]+(b==='local'?'. Each employee still does their full skill on this device.':'')+'</div>'
      +listenRow()+'<button class="crw-gi'+(lsJ('kova.crew.voice',false)?' on':'')+'" data-c="voice" role="switch" aria-checked="'+lsJ('kova.crew.voice',false)+'"><span><b>Read finished jobs aloud</b><small>Your team talks back when a job is done.</small></span></button>'
      +'<div class="crd-row"><button class="crd-btn ghost" data-c="nav" data-n="routines">Routines</button><button class="crd-btn ghost" data-c="hire">Hire</button></div></div>';
  }
  function tileBig(o){
    return '<div class="crd-t t-big t-'+o.tone+'"'+(o.id?' data-c="tab" data-t="'+esc(o.id)+'" role="button" tabindex="0"':'')+'><div class="crd-th"><span class="crd-tv"><i class="crd-bul"></i>'+esc(fmtN(o.value))+'<small>/'+esc(o.label)+'</small></span>'
      +(o.range?'<button class="crd-date" data-c="range">Date <b>'+dm(sod()-(o.range-1)*DAY)+' – '+dm(sod())+'</b>'+svg(IC.chev,'sm')+'</button>':'<span class="crd-arw">'+svg(IC.arrow)+'</span>')+'</div>'
      +(o.title?'<div class="crd-tsub">'+esc(o.title)+'</div>':'')
      +'<div class="crd-avs">'+(o.avatars||[]).slice(0,6).map(function(e){ return av(e); }).join('')+'</div><div class="crd-tc">'+o.chart+'</div></div>';
  }
  function tileSm(o){
    var nav=o.k?' data-c="detail" data-k="'+o.k+'" role="button" tabindex="0" aria-label="'+esc(o.title+': '+fmtN(o.value)+(o.suf?' '+String(o.suf).replace(/^\//,''):'')+(o.cap?'. '+o.cap:'')+'. Open the details')+'"'
      :o.go?' data-c="nav" data-n="'+o.go+'" role="button" tabindex="0"':'';
    return '<div class="crd-t t-'+o.tone+(o.cap?' has-cap':'')+'"'+nav+'><div class="crd-th"><span class="crd-tt">'+esc(o.title)+'</span><span class="crd-arw">'+svg(IC.arrow)+'</span></div>'
      +(o.value!=null?'<div class="crd-tv'+(o.soft?' soft':'')+'">'+(o.pre?'<sup>'+esc(o.pre)+'</sup>':'')+esc(fmtN(o.value))+(o.suf?'<small>'+esc(o.suf)+'</small>':'')+'</div>':'')
      +(o.cap?'<div class="crd-tcap">'+esc(o.cap)+'</div>':'')
      +'<div class="crd-tc">'+o.chart+'</div></div>';
  }

  /* ---- the four team tiles, in depth ----
     Each tile says what its number means in a line, and opens a pop-up
     with the rest: the breakdown, the trend, the tasks or posts behind it
     (each one tap to open), how it is counted, and what to do next. */
  var dRange=30;
  function dayLabel(t){ if(!t) return 'no date'; var d=Math.round((new Date(t).setHours(0,0,0,0)-sod())/DAY);
    return d===0?'today':d===1?'tomorrow':d===-1?'yesterday':d<0?(-d)+' days ago':d<7?wd(t,true):dm(t); }
  function lateBy(i){ return Math.max(1,Math.ceil((doneAt(i)-i.due-DAY)/DAY)); }
  function overBy(i){ return Math.max(1,Math.round((sod()-new Date(i.due).setHours(0,0,0,0))/DAY)); }
  function onTimeData(days){
    var from=Date.now()-days*DAY, items=W.list('items');
    var fin=items.filter(function(i){ var t=doneAt(i); return t&&t>=from; });
    var dated=fin.filter(function(i){ return i.due; });
    var late=dated.filter(function(i){ return doneAt(i)>i.due+DAY; }).sort(function(a,b){ return doneAt(b)-doneAt(a); });
    var weeks=[];
    for(var w=5;w>=0;w--){ var b=sod()+DAY-w*7*DAY, a=b-7*DAY;
      var d=items.filter(function(i){ var t=doneAt(i); return i.due&&t&&t>=a&&t<b; }), l=d.filter(function(i){ return doneAt(i)>i.due+DAY; }).length;
      weeks.push({a:a,ok:d.length-l,late:l}); }
    var lb=late.map(lateBy);
    var over=(W.overdue?W.overdue():[]).slice().sort(function(a,b){ return a.due-b.due; });
    var soon=items.filter(function(i){ return i.status!=='Completed'&&i.due&&i.due>=sod()&&i.due<sod()+3*DAY; }).sort(function(a,b){ return a.due-b.due; });
    return {days:days,fin:fin.length,dated:dated.length,ok:dated.length-late.length,late:late,undated:fin.length-dated.length,
      rate:dated.length?Math.round((dated.length-late.length)/dated.length*100):null,
      avgLate:lb.length?Math.round(lb.reduce(function(x,y){ return x+y; },0)/lb.length*10)/10:null,weeks:weeks,over:over,soon:soon};
  }
  function postsData(){
    var P=(window.KovaPost&&KovaPost.all)?KovaPost.all():[];
    var st=function(p,s){ return Object.keys(p.results||{}).some(function(k){ return p.results[k]&&p.results[k].state===s; }); };
    var pub=P.filter(function(p){ return st(p,'ok'); });
    return {all:P,pub:pub,rate:P.length?Math.round(pub.length/P.length*100):null,
      sch:P.filter(function(p){ return p.status==='scheduled'; }).sort(function(a,b){ return (a.when||0)-(b.when||0); }),
      drafts:P.filter(function(p){ return p.status==='draft'||p.status==='drafted'; }),
      hand:P.filter(function(p){ return st(p,'manual'); }), failed:P.filter(function(p){ return st(p,'error'); }),
      ideas:W.list('content',function(c){ return c.kind!=='post'; }).length};
  }
  /* pieces of a pop-up */
  /* each tile's details are a page of their own inside the team area (with
     the pills above and a back button), not a sheet that drops over it */
  function dOpen(title,sub){ return '<div class="cwd cwd-page"><button class="cwd-back" data-cd="back" aria-label="Back to your team">'+svg(IC.back)+'<span>Your team</span></button>'
    +'<div class="cwd-t">'+esc(title)+'</div>'+(sub?'<div class="cwd-s">'+esc(sub)+'</div>':''); }
  function dBig(v,unit,cap,soft){ return '<div class="cwd-big'+(soft?' soft':'')+'"><b>'+esc(v)+'</b>'+(unit?'<span>'+esc(unit)+'</span>':'')+'</div>'+(cap?'<p class="cwd-cap">'+esc(cap)+'</p>':''); }
  function dStats(L){ return '<div class="cwd-stats c'+L.length+'">'+L.map(function(x){ return '<div class="cwd-st'+(x.tone?' '+x.tone:'')+'"><b>'+esc(x.v)+'</b><span>'+esc(x.l)+'</span></div>'; }).join('')+'</div>'; }
  function dSec(h,body,note){ return '<section class="cwd-sec"><h3 class="cwd-h">'+esc(h)+(note?'<small>'+esc(note)+'</small>':'')+'</h3>'+body+'</section>'; }
  function dTask(i,meta,tone){ return '<button class="cwd-row" data-cd="item" data-id="'+esc(i.id)+'"><span class="cwd-rn">'+esc(i.name)+'</span><span class="cwd-rm'+(tone?' '+tone:'')+'">'+esc(meta)+'</span></button>'; }
  function dList(L,fn,none,max){ max=max||6; if(!L.length) return '<p class="cwd-none">'+esc(none)+'</p>';
    return L.slice(0,max).map(fn).join('')+(L.length>max?'<p class="cwd-none">and '+(L.length-max)+' more</p>':''); }
  function dBtns(L){ return '<div class="cwd-btns">'+L.map(function(b,i){ return '<button class="cwd-btn'+(i?' ghost':'')+'" '+b.a+'>'+esc(b.l)+'</button>'; }).join('')+'</div>'; }
  function dBar(parts){
    var tot=parts.reduce(function(a,p){ return a+p.v; },0);
    return '<div class="cwd-bar" role="img" aria-label="'+esc(parts.map(function(p){ return p.l+' '+p.v; }).join(', '))+'">'
      +(tot?parts.map(function(p,i){ return p.v?'<i class="b'+i+'" style="width:'+(p.v/tot*100).toFixed(1)+'%"></i>':''; }).join(''):'<i class="b-none"></i>')+'</div>'
      +'<div class="cwd-key">'+parts.map(function(p,i){ return '<span><i class="b'+i+'"></i>'+esc(p.l)+' '+p.v+'</span>'; }).join('')+'</div>';
  }
  function weekBars(L){
    var mx=Math.max.apply(null,L.map(function(w){ return w.ok+w.late; }).concat([1])), w=300/L.length, h='';
    L.forEach(function(x,i){ var cx=w*i+w/2, ho=x.ok/mx*84, hl=x.late/mx*84, y=100;
      if(!x.ok&&!x.late) h+='<rect class="nil" x="'+(cx-14).toFixed(1)+'" y="97" width="28" height="3" rx="1.5"/>';
      if(x.ok) h+='<rect class="ok" x="'+(cx-14).toFixed(1)+'" y="'+(y-ho).toFixed(1)+'" width="28" height="'+ho.toFixed(1)+'" rx="5"/>';
      if(x.late) h+='<rect class="late" x="'+(cx-14).toFixed(1)+'" y="'+(y-ho-hl-(x.ok?2:0)).toFixed(1)+'" width="28" height="'+hl.toFixed(1)+'" rx="5"/>';
      h+='<text x="'+cx.toFixed(1)+'" y="116">'+esc(dm(x.a))+'</text>'; });
    var sum=L.map(function(x){ return dm(x.a)+': '+x.ok+' on time, '+x.late+' late'; }).join('; ');
    return '<svg class="cwd-chart" viewBox="0 0 300 120" role="img" aria-label="'+esc(sum)+'">'+h+'</svg>'
      +'<div class="cwd-key"><span><i class="ok"></i>On time</span><span><i class="late"></i>Late</span></div>';
  }
  var PRI_ORDER=['Critical','High','Medium','Low'];

  function dOnTime(){
    var d=onTimeData(dRange);
    var h=dOpen('On time','Tasks with a date, finished by that date')
      +'<div class="cwd-seg" role="group" aria-label="Period">'+[7,30,90].map(function(n){ return '<button data-cd="range" data-r="'+n+'" aria-pressed="'+(n===d.days)+'"'+(n===d.days?' class="on"':'')+'>'+n+' days</button>'; }).join('')+'</div>';
    h+=d.rate==null
      ?dBig('No score yet','','No task with a date was finished in the last '+d.days+' days, so there is nothing to score. '+(d.soon.length?d.soon.length+' due in the next 3 days: finish one by its date and the score starts.':'Give tasks a due date and it starts with the first one you finish.'),true)
      :dBig(d.rate+'%','on time',d.ok+' of '+d.dated+' finished by their date'+(d.late.length?'; '+d.late.length+' late'+(d.avgLate?', by '+d.avgLate+' days on average':''):'')+'.');
    h+=dStats([{v:d.ok,l:'On time',tone:d.ok?'good':''},{v:d.late.length,l:'Late',tone:d.late.length?'bad':''},{v:d.undated,l:'Done, no date'},{v:d.over.length,l:'Overdue now',tone:d.over.length?'bad':''}]);
    h+=dSec('The last six weeks',d.weeks.some(function(w){ return w.ok||w.late; })?weekBars(d.weeks):'<p class="cwd-none">Nothing with a date was finished in these six weeks.</p>');
    h+=dSec('At risk now',dList(d.over.concat(d.soon),function(i){ var od=d.over.indexOf(i)>=0; return dTask(i,od?overBy(i)+' d overdue':'due '+dayLabel(i.due),od?'bad':'warn'); },'Nothing overdue or due in the next 3 days.'),'overdue, or due in 3 days');
    h+=dSec('Finished late',dList(d.late,function(i){ var n=lateBy(i); return dTask(i,n+' day'+(n===1?'':'s')+' late','bad'); },'None in this period.'));
    h+='<p class="cwd-note">A task counts as on time when it is marked done by the end of its due day. Tasks without a date are not scored.</p>';
    return h+dBtns([{l:'Open Tasks',a:'data-cd="go" data-s="worktasks"'}].concat(d.over.length?[{l:'Have the team triage what is late',a:'data-cd="ask" data-q="Triage my overdue tasks"'}]:[]))+'</div>';
  }
  function dStatus(){
    var items=W.list('items'), K=[['Not Started','To do'],['In Progress','Doing'],['Waiting','Waiting'],['Completed','Done']], by={};
    K.forEach(function(k){ by[k[0]]=items.filter(function(i){ return (i.status||'Not Started')===k[0]; }); });
    var open=items.filter(function(i){ return i.status!=='Completed'; }), a=analyze(7), od=W.overdue?W.overdue():[], td=W.dueToday?W.dueToday():[];
    var stuck=by['Waiting'].filter(function(i){ return Date.now()-(i.updated||i.created||Date.now())>3*DAY; });
    var slow=by['In Progress'].filter(function(i){ return Date.now()-(i.updated||i.created||Date.now())>5*DAY; });
    var net=a.completed-a.created;
    var h=dOpen('Work by status',items.length+' task'+(items.length===1?'':'s')+' in Work OS')
      +dBig(open.length,'open',(od.length?od.length+' overdue':'Nothing overdue')+(td.length?', '+td.length+' due today':'')+'.')
      +dBar(K.map(function(k){ return {v:by[k[0]].length,l:k[1]}; }));
    h+=dSec('This week',dStats([{v:a.created,l:'Added'},{v:a.completed,l:'Finished',tone:a.completed?'good':''},{v:(net>0?'+':'')+net,l:net>=0?'Net, cleared':'Net, piling up',tone:net<0?'warn':''},{v:a.avgCycleDays==null?'—':a.avgCycleDays+' d',l:'Avg to finish'}]),'last 7 days');
    var pri=PRI_ORDER.map(function(p){ return {v:open.filter(function(i){ return (i.priority||'Medium')===p; }).length,l:p,tone:p==='Critical'&&open.some(function(i){ return i.priority==='Critical'; })?'bad':''}; });
    h+=dSec('Open, by priority',dStats(pri));
    var push=[];
    od.slice().sort(function(a,b){ return a.due-b.due; }).forEach(function(i){ push.push({i:i,m:overBy(i)+' d overdue',t:'bad'}); });
    stuck.forEach(function(i){ push.push({i:i,m:'waiting '+Math.floor((Date.now()-(i.updated||i.created))/DAY)+' d',t:'warn'}); });
    slow.forEach(function(i){ push.push({i:i,m:'doing for '+Math.floor((Date.now()-(i.updated||i.created))/DAY)+' d',t:'warn'}); });
    h+=dSec('Needs a push',dList(push,function(x){ return dTask(x.i,x.m,x.t); },'Nothing overdue, stuck or dragging.'),'overdue, waiting 3+ days, doing 5+ days');
    h+=K.map(function(k,ix){ var L=by[k[0]].slice().sort(function(a,b){ return (a.due||9e15)-(b.due||9e15); });
      return '<details class="cwd-det"'+(ix===0&&L.length?' open':'')+'><summary><span><i class="b'+ix+'"></i>'+esc(k[1])+'</span><b>'+L.length+'</b></summary>'
        +dList(L,function(i){ return dTask(i,[i.due?(k[0]==='Completed'?'done '+dayLabel(doneAt(i)):'due '+dayLabel(i.due)):'no date',i.priority||''].filter(Boolean).join(' · '),i.status!=='Completed'&&od.indexOf(i)>=0?'bad':''); },'None.',8)+'</details>'; }).join('');
    return h+dBtns([{l:'Open Tasks',a:'data-cd="go" data-s="worktasks"'}].concat(od.length||stuck.length?[{l:'Have the team triage these',a:'data-cd="ask" data-q="Triage my overdue tasks"'}]:[]))+'</div>';
  }
  function dContent(){
    var d=postsData(), PL=(window.KovaPost&&KovaPost.PLAT)||{}, T=(window.KovaTraction&&KovaTraction._state&&KovaTraction._state.posts)||{};
    var name=function(k){ return (PL[k]&&PL[k].n)||k; };
    var h=dOpen('Content','From idea to published')
      +(d.all.length?dBig(d.rate+'%','published',d.pub.length+' of '+d.all.length+' post'+(d.all.length===1?' is':'s are')+' live on at least one platform.')
        :dBig('No posts yet','','Write one in the Studio and it shows here, from draft to published.',true));
    h+=dSec('Pipeline',dStats([{v:d.ideas,l:'Ideas'},{v:d.drafts.length,l:'Drafts'},{v:d.sch.length,l:'Scheduled'},{v:d.pub.length,l:'Published',tone:d.pub.length?'good':''},{v:d.hand.length,l:'Your turn',tone:d.hand.length?'warn':''},{v:d.failed.length,l:'Failed',tone:d.failed.length?'bad':''}]));
    h+=dSec('Next up',dList(d.sch,function(p){ return '<button class="cwd-row" data-cd="go" data-s="workstudio"><span class="cwd-rn">'+esc(p.title||'Untitled post')+'</span><span class="cwd-rm">'+esc((p.when?wd(p.when,true)+' '+hm(p.when):'')+' · '+(p.targets||[]).map(name).join(', '))+'</span></button>'; },'Nothing scheduled.',4));
    var recent=d.pub.slice().sort(function(a,b){ var t=function(p){ return Math.max.apply(null,Object.keys(p.results||{}).map(function(k){ return (p.results[k]&&p.results[k].at)||0; }).concat([p.updated||0])); }; return t(b)-t(a); });
    h+=dSec('Recently published',dList(recent,function(p){
      var tr=T[p.id], views=0, likes=0;
      if(tr&&tr.platforms) Object.keys(tr.platforms).forEach(function(k){ var m=tr.platforms[k].metrics||{}; views+=+m.views||0; likes+=+m.likes||0; });
      var ok=(p.targets||[]).filter(function(k){ return p.results[k]&&p.results[k].state==='ok'; }).length;
      return '<button class="cwd-row" data-cd="traction" data-id="'+esc(p.id)+'"><span class="cwd-rn">'+esc(p.title||'Untitled post')+'</span><span class="cwd-rm">'+ok+' of '+(p.targets||[]).length+' live'+(views?' · '+fmtN(views)+' views, '+fmtN(likes)+' likes':'')+'</span></button>'; },'Nothing published yet.',5));
    var per={}; d.all.forEach(function(p){ (p.targets||[]).forEach(function(k){ var r=(p.results||{})[k], x=per[k]=per[k]||{ok:0,bad:0,hand:0,sch:0};
      if(r&&r.state==='ok') x.ok++; else if(r&&r.state==='error') x.bad++; else if(r&&r.state==='manual') x.hand++; else if(p.status==='scheduled') x.sch++; }); });
    var ks=Object.keys(per).sort(function(a,b){ return (per[b].ok+per[b].bad+per[b].sch)-(per[a].ok+per[a].bad+per[a].sch); });
    if(ks.length) h+=dSec('By platform',ks.slice(0,8).map(function(k){ var x=per[k], bits=[];
      if(x.ok||!(x.sch||x.hand||x.bad)) bits.push(x.ok+' live'); if(x.sch) bits.push(x.sch+' scheduled'); if(x.hand) bits.push(x.hand+' your turn'); if(x.bad) bits.push(x.bad+' failed');
      return '<div class="cwd-row static"><span class="cwd-rn">'+esc(name(k))+'</span><span class="cwd-rm'+(x.bad?' bad':'')+'">'+bits.join(' · ')+'</span></div>'; }).join(''));
    if(d.failed.length) h+=dSec('Failed',dList(d.failed,function(p){ var why=(p.targets||[]).filter(function(k){ return p.results[k]&&p.results[k].state==='error'; }).map(function(k){ return name(k)+': '+String(p.results[k].msg||'failed').slice(0,60); }).join('; ');
      return '<button class="cwd-row" data-cd="go" data-s="workstudio"><span class="cwd-rn">'+esc(p.title||'Untitled post')+'</span><span class="cwd-rm bad">'+esc(why)+'</span></button>'; },'',3));
    return h+dBtns([{l:'Open the Studio',a:'data-cd="go" data-s="workstudio"'},{l:'Draft 3 posts for this week',a:'data-cd="ask" data-q="Draft 3 posts for this week"'}])+'</div>';
  }
  function dNeeds(){
    var wt=waiting().slice().sort(function(a,b){ return a.at-b.at; }), items=W.list('items'), od=(W.overdue?W.overdue():[]).slice().sort(function(a,b){ return a.due-b.due; });
    var wo=items.filter(function(i){ return i.status==='Waiting'; }).sort(function(a,b){ return (a.updated||a.created||0)-(b.updated||b.created||0); });
    var h=dOpen('Needs you',wt.length?wt.length+' waiting for your OK':'Nothing waiting for your OK')
      +dBig(wt.length,wt.length===1?'approval':'approvals',wt.length?'Your team stopped here. Nothing leaves Kova, and nothing of yours changes, until you say so.':'All clear. When an employee wants to send an email or change your work, it waits here first.');
    h+=dSec('Waiting for your OK',wt.length?wt.map(function(j){
      var e=emp(j.emp)||{n:'?'}, a=j.ask||{}, T=TOOLS[a.name], i=a.input||{}, d=T&&T.describe?T.describe(i):{t:a.name||'a step',n:'',s:''};
      var what=a.name==='draft_email'?'To '+(i.to||'no address yet')+' · '+(i.subject||'no subject')+(i.body?' · '+String(i.body).split('\n')[0].slice(0,80):''):[d.n,d.s].filter(Boolean).join(' · ');
      return '<div class="cwd-ap"><div class="cwd-aph"><b>'+esc(e.n)+'</b> wants to '+esc(String(d.t||'').toLowerCase())+'<span>'+esc(ago(j.at))+'</span></div>'
        +(what?'<p class="cwd-apw">'+esc(what)+'</p>':'')
        +'<div class="cwd-apb"><button class="cwd-btn" data-cd="nav" data-n="approvals">Review and approve</button><button class="cwd-btn ghost" data-cd="skip" data-j="'+esc(j.id)+'">Skip</button></div></div>'; }).join('')
      :'<p class="cwd-none">Nothing right now.</p>');
    h+=dSec('Waiting on someone else',dList(wo,function(i){ var n=Math.floor((Date.now()-(i.updated||i.created||Date.now()))/DAY); return dTask(i,n?'waiting '+n+' d':'since today',n>3?'warn':''); },'No task is waiting on someone else.'),'a nudge may be due');
    h+=dSec('Overdue',dList(od,function(i){ return dTask(i,overBy(i)+' d overdue','bad'); },'Nothing overdue.'));
    return h+dBtns([{l:'Open Approvals',a:'data-cd="nav" data-n="approvals"'}].concat(od.length?[{l:'Have the team triage what is late',a:'data-cd="ask" data-q="Triage my overdue tasks"'}]:[]))+'</div>';
  }
  var DETAIL={jobs:dJobs,ontime:dOnTime,status:dStatus,content:dContent,needs:dNeeds}, dCur=null;
  var TILE_N={jobs:'Jobs done',ontime:'On time',status:'Work by status',content:'Content',needs:'Needs you'};
  /* p30: straight to one teammate's page, ready to message them (search,
     "nutrition coach") */
  /* p30: a teammate's daily routine on or off from outside the team page
     (the Fuel check-in card). job: what they run each time. */
  function setRoutine(id,on,job,time){
    var e=emp(id); if(!e) return false; var T=tpl(e.tpl);
    var r=Object.assign({},e.routine||{},on?{freq:'daily',time:time||(T&&T.routine&&T.routine.time)||'20:00',job:job||(e.routine&&e.routine.job)||(T&&T.routine&&T.routine.job)||''}:{freq:'off'});
    saveEmp(e,{routine:r}); return true;
  }
  function openMate(id){
    if(!emp(id)) return false;
    S.view='team'; S.nav='team'; S.tab=id; S.draft=null; paint(); top0();
    setTimeout(function(){ var t=document.getElementById('crwEmpAsk'); if(t) try{ t.focus({preventScroll:true}); }catch(e){} },220);
    return true;
  }
  function detail(k){
    if(!DETAIL[k]) return;
    var was=S.view==='detail'&&dCur===k;
    dCur=k; S.view='detail'; S.dk=k; S.draft=null; paint(); if(!was) top0();
    if(!was) try{ if(window.KovaAnalytics) KovaAnalytics.track('team_tile',{feature:k}); }catch(e){}
  }
  function detailPage(){ var k=S.dk&&DETAIL[S.dk]?S.dk:'jobs'; dCur=k; return '<div class="crd">'+topBar()+DETAIL[k]()+'</div>'; }
  function onDetail(ev){
    var b=ev.target.closest&&ev.target.closest('[data-cd]'); if(!b) return;
    var c=b.getAttribute('data-cd'), sheet=!!b.closest('#sheet'), later=function(f){ if(sheet){ if(window.closeSheet) closeSheet(); setTimeout(f,220); } else f(); };
    if(c==='back'){ S.view='team'; S.nav='team'; paint(); top0(); return; }
    if(c==='range'){ dRange=+b.getAttribute('data-r')||30; detail(dCur); return; }
    if(c==='jday'){ S.jday=+b.getAttribute('data-i'); detail(dCur); return; }
    if(c==='skip'){ skip(b.getAttribute('data-j'),'You skipped this from Needs you.'); detail(dCur); return; }
    if(c==='emp'){ var eid=b.getAttribute('data-id'); S.view='team'; S.nav='team'; S.tab=eid||'all'; paint(); top0(); return; }
    if(c==='job'){ var jj=S.jobs[b.getAttribute('data-j')]; if(jj){ S.view='team'; S.nav='team'; S.tab=jj.emp; paint(); var n=document.getElementById('job-'+jj.id); if(n&&n.scrollIntoView) n.scrollIntoView({block:'center'}); } return; }
    if(c==='item'){ var id=b.getAttribute('data-id'); later(function(){ if(window.__openWorkItem) __openWorkItem(id); }); return; }
    if(c==='go'){ var s=b.getAttribute('data-s'); later(function(){ try{ go(s); }catch(e){} }); return; }
    if(c==='traction'){ var pid=b.getAttribute('data-id'); later(function(){ if(window.KovaTraction&&KovaTraction.open) KovaTraction.open(pid); else try{ go('workstudio'); }catch(e){} }); return; }
    if(c==='nav'){ S.view='team'; S.nav=b.getAttribute('data-n')||'team'; S.draft=null; paint(); top0(); return; }
    if(c==='ask'){ var q=b.getAttribute('data-q'), r=route(q); if(!r){ say('Hire someone first.'); return; }
      var j=start(r.emp,q,'team'); if(j) log(j,'From the '+(TILE_N[dCur]||'team')+' tile. Routed to '+r.emp.n+'.','handoff');
      S.view='team'; S.nav='team'; S.tab=r.emp.id; S.scroll=true; paint(); return; }
  }

  /* ---- jobs done: per day, who did them, and the chart ---- */
  function jobsDays(rng){
    var all=jobsOf().filter(function(j){ return j.state==='done'; }), out=[], wk=rng>45, step=wk?7:1, n=Math.ceil(rng/step), s0=sod();
    for(var i=n-1;i>=0;i--){
      var a=s0-(i*step+(step-1))*DAY, b=s0-i*step*DAY+DAY;
      var js=all.filter(function(j){ var t=j.end||j.at; return t>=a&&t<b; }), by={};
      js.forEach(function(j){ by[j.emp]=(by[j.emp]||0)+1; });
      out.push({a:a,b:b,v:js.length,jobs:js,by:by,wk:wk,today:i===0});
    }
    return out;
  }
  function dayName(d){ return d.wk?'Week of '+new Date(d.a).toLocaleDateString('en-US',{month:'short',day:'numeric'}):(d.today?'Today':new Date(d.a).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})); }
  function whoLine(by){ return Object.keys(by).sort(function(x,y){ return by[y]-by[x]; }).map(function(id){ var e=emp(id); return (e?e.n:'?')+' '+by[id]; }).join(', '); }
  /* columns with a light that sweeps across them in a loop (the "working"
     glow), today's column brightest; tap or hover one to read it */
  function jobsChart(days,sel,big){
    var act=big?'data-cd="jday"':'data-c="jsel"';
    var n=days.length, W0=300, H0=big?150:118, gap=n>20?2:(n>10?3:6), bw=(W0-gap*(n-1))/n, mx=Math.max.apply(null,days.map(function(d){ return d.v; }).concat([1])), base=H0-18, h='';
    var empty=!days.some(function(d){ return d.v; });
    days.forEach(function(d,i){
      var x=i*(bw+gap), vh=d.v?Math.max(6,d.v/mx*(base-14)):0, ghost=empty?(10+((i*37)%5)*7):0;
      h+='<g class="jb'+(d.today?' now':'')+(i===sel?' sel':'')+(d.v?'':' z')+'" '+act+' data-i="'+i+'" data-a="'+esc(d.v+' '+dayName(d))+'" data-b="'+esc(d.v?whoLine(d.by):'Nothing finished')+'" style="--i:'+i+'" tabindex="0" role="button" aria-label="'+esc(dayName(d)+': '+d.v+' job'+(d.v===1?'':'s')+' done'+(d.v?' ('+whoLine(d.by)+')':''))+'">'
        +'<rect class="hit" x="'+x.toFixed(1)+'" y="0" width="'+bw.toFixed(1)+'" height="'+H0+'"/>'
        +'<rect class="bg" x="'+x.toFixed(1)+'" y="10" width="'+bw.toFixed(1)+'" height="'+(base-10)+'" rx="'+Math.min(8,bw/2).toFixed(1)+'"/>'
        +(ghost?'<rect class="gh" x="'+x.toFixed(1)+'" y="'+(base-ghost)+'" width="'+bw.toFixed(1)+'" height="'+ghost+'" rx="'+Math.min(8,bw/2).toFixed(1)+'"/>':'')
        +(vh?'<rect class="v" x="'+x.toFixed(1)+'" y="'+(base-vh).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+vh.toFixed(1)+'" rx="'+Math.min(8,bw/2).toFixed(1)+'"/>':'')
        +(vh&&(big||n<=14)?'<text class="n" x="'+(x+bw/2).toFixed(1)+'" y="'+(base-vh-5).toFixed(1)+'">'+d.v+'</text>':'')
        +'</g>';
      var lab=d.wk?(i%3===0?dm(d.a):''):(n<=7?new Date(d.a).toLocaleDateString('en-US',{weekday:'narrow'}):(i%5===0||d.today?String(new Date(d.a).getDate()):''));
      if(lab) h+='<text class="l'+(d.today?' t':'')+'" x="'+(x+bw/2).toFixed(1)+'" y="'+(H0-3)+'">'+esc(lab)+'</text>';
    });
    return '<svg class="crd-jc'+(empty?' empty':'')+'" viewBox="0 0 '+W0+' '+H0+'" role="group" aria-label="Jobs done per '+(days[0]&&days[0].wk?'week':'day')+'">'
      +'<defs><linearGradient id="jcSweep" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
      +'<clipPath id="jcClip'+(big?'B':'')+'">'+days.map(function(d,i){ var x=i*(bw+gap); return '<rect x="'+x.toFixed(1)+'" y="10" width="'+bw.toFixed(1)+'" height="'+(base-10)+'" rx="'+Math.min(8,bw/2).toFixed(1)+'"/>'; }).join('')+'</clipPath></defs>'
      +h+'<g clip-path="url(#jcClip'+(big?'B':'')+')" class="sw" aria-hidden="true"><rect x="-90" y="0" width="90" height="'+H0+'" fill="url(#jcSweep)"/></g></svg>';
  }
  function jobsReadout(days,sel){
    var d=days[sel];
    if(!d) return '<div class="crd-jtip" aria-live="polite"><span>Tap or point at a column to see that '+(days[0]&&days[0].wk?'week':'day')+'</span></div>';
    return '<div class="crd-jtip on" aria-live="polite"><b>'+d.v+'</b> '+esc(dayName(d))+'<span>'+(d.v?esc(whoLine(d.by)):'Nothing finished')+'</span></div>';
  }
  /* the latest few, under the chart where the tile has room (laptops) */
  function jobsLast(days){
    var L=jobsOf().filter(function(j){ return j.state==='done'&&(j.end||j.at)>=days[0].a; }).slice(-4).reverse();
    if(!L.length) return '';
    return '<div class="crd-jlast"><small>Latest</small>'+L.map(function(j){ var e=emp(j.emp)||{n:'?'}; return '<button data-c="job" data-j="'+esc(j.id)+'">'+av(e)+'<span>'+esc(j.text.split('\n')[0].slice(0,70))+'</span><em>'+esc(ago(j.end||j.at))+'</em></button>'; }).join('')+'</div>';
  }
  function rangeSeg(cur,attr){ return '<div class="crd-seg" role="group" aria-label="Period">'+[[7,'7d'],[30,'30d'],[90,'90d']].map(function(r){ return '<button '+attr+' data-r="'+r[0]+'" aria-pressed="'+(cur===r[0])+'"'+(cur===r[0]?' class="on"':'')+'>'+r[1]+'</button>'; }).join('')+'</div>'; }
  function jobsTile(L){
    var rng=S.range||30, days=jobsDays(rng), tot=days.reduce(function(a,d){ return a+d.v; },0), sel=S.jsel!=null&&S.jsel<days.length?S.jsel:null;
    var by={}; days.forEach(function(d){ Object.keys(d.by).forEach(function(k){ by[k]=(by[k]||0)+d.by[k]; }); });
    return '<div class="crd-t t-big t-lit crd-jd">'
      +'<div class="crd-th"><button class="crd-jopen" data-c="detail" data-k="jobs" aria-label="Jobs done: '+tot+' in '+rng+' days. Open the details"><span class="crd-tt">Jobs done</span>'+svg(IC.arrow)+'</button>'+rangeSeg(rng,'data-c="jrange"')+'</div>'
      +'<div class="crd-tv"><i class="crd-bul"></i>'+tot+'<small>/in '+rng+' days</small></div>'
      +jobsReadout(days,sel)
      +'<div class="crd-tc crd-jcw">'+jobsChart(days,sel,false)+'</div>'
      +jobsLast(days)
      +'<div class="crd-javs">'+L.slice(0,9).map(function(e){ return '<button class="crd-jav" data-c="open" data-id="'+esc(e.id)+'" aria-label="'+esc(e.n+': '+(by[e.id]||0)+' done. Open '+e.n)+'">'+av(e)+'<em>'+(by[e.id]||0)+'</em></button>'; }).join('')+'</div>'
      +(tot?'':'<div class="crd-jempty">No finished jobs yet. <button data-c="search">Give the team a job</button></div>')
      +'</div>';
  }
  function dJobs(){
    var rng=dRange, days=jobsDays(rng), tot=days.reduce(function(a,d){ return a+d.v; },0), sel=S.jday!=null&&S.jday<days.length?S.jday:null;
    var by={}; days.forEach(function(d){ Object.keys(d.by).forEach(function(k){ by[k]=(by[k]||0)+d.by[k]; }); });
    var best=days.reduce(function(a,d){ return d.v>a.v?d:a; },{v:0}), mx=Math.max.apply(null,Object.keys(by).map(function(k){ return by[k]; }).concat([1]));
    var h=dOpen('Jobs done','Every job your team finished, day by day')
      +'<div class="cwd-seg" role="group" aria-label="Period">'+[7,30,90].map(function(n){ return '<button data-cd="range" data-r="'+n+'" aria-pressed="'+(n===rng)+'"'+(n===rng?' class="on"':'')+'>'+n+' days</button>'; }).join('')+'</div>'
      +dBig(tot,tot===1?'job done':'jobs done',tot?'Most in one '+(days[0].wk?'week':'day')+': '+best.v+' ('+dayName(best)+').':'Nothing finished yet in the last '+rng+' days. Give the team a job, or turn on a routine.')
      +'<div class="cwd-jchart">'+jobsReadout(days,sel)+jobsChart(days,sel,true)+'</div>';
    h+=dSec('Who did them',emps().length?emps().map(function(e){ var v=by[e.id]||0; return '<button class="cwd-who" data-cd="emp" data-id="'+esc(e.id)+'">'+av(e)+'<span class="nm">'+esc(e.n)+'<small>'+esc(e.title)+'</small></span><i><b style="width:'+(v/mx*100).toFixed(0)+'%"></b></i><em>'+v+'</em></button>'; }).join(''):'<p class="cwd-none">Hire someone first.</p>');
    var list=sel!=null?days[sel].jobs:jobsOf().filter(function(j){ return j.state==='done'&&(j.end||j.at)>=days[0].a; }).slice(-12).reverse();
    h+=dSec(sel!=null?dayName(days[sel]):'Latest',list.length?list.map(function(j){ var e=emp(j.emp)||{n:'?'}; return '<button class="cwd-row" data-cd="job" data-j="'+esc(j.id)+'"><span class="cwd-rn">'+esc(e.n+': '+j.text.split('\n')[0].slice(0,90))+'</span><span class="cwd-rm">'+esc(ago(j.end||j.at))+'</span></button>'; }).join(''):'<p class="cwd-none">Nothing finished '+(sel!=null?'that '+(days[sel].wk?'week':'day'):'in this period')+'.</p>',sel!=null?'tap the chart for another day':'tap a column to filter');
    h+='<p class="cwd-note">A job counts when its employee finishes it, on the device or on the Kova server. Stopped and failed jobs are not counted.</p>';
    return h+dBtns([{l:'Give the team a job',a:'data-cd="nav" data-n="team"'},{l:'Open all jobs',a:'data-cd="nav" data-n="jobs"'}])+'</div>';
  }

  /* ---- the team page ---- */
  function teamPage(){
    var a=analyze(7), L=emps(), all=jobsOf(), cur=all.filter(function(j){ return j.state==='running'||j.state==='waiting'; }).slice(-1)[0], last=all.slice(-1)[0];
    var rng=S.range||30, days=[];
    for(var d=rng-1;d>=0;d--){ var s0=sod()-d*DAY; days.push({s:s0,v:all.filter(function(j){ return j.state==='done'&&(j.end||j.at)>=s0&&(j.end||j.at)<s0+DAY; }).length}); }
    var ot=onTimeData(30), pd=postsData(), wl=waiting(), wt=wl.length, od=W.overdue?W.overdue():[], td=W.dueToday?W.dueToday():[];
    return head(last?(last.end||last.at):0,(String(prof().business||'').trim()||'Your')+' team')
      +'<div class="crd-mid"><div class="crd-stats">'
        +stat('Finished',a.completed,'✓','Tasks done this week')+stat('Open',a.open,'','Still to do')+stat('Overdue',a.overdue,'!','Past their date')+stat('Team',L.length,'person','AI employees')
      +'</div>'+flow(cur||last)+focusCard(cur)+'</div>'
      +(window.KovaTeamPlus?KovaTeamPlus.meet():'')
      +roster()
      +'<div class="crd-tiles">'
        +jobsTile(L)
        +tileSm({tone:'g1',title:'On time',k:'ontime',value:ot.rate==null?'No score yet':ot.rate+'%',soft:ot.rate==null,suf:ot.rate==null?'':'/on time',chart:gaugeChart(ot.rate||0,'%',false),
          cap:ot.rate==null?(ot.soon.length?ot.soon.length+' due soon. Finish one by its date and the score starts.':'Starts with the first dated task you finish.'):ot.ok+' of '+ot.dated+' by their date, last 30 days'})
        +tileSm({tone:'g2',title:'Work by status',k:'status',value:a.open,suf:'/open',chart:statusRows(statusData(a)),
          cap:(od.length?od.length+' overdue':'Nothing overdue')+(td.length?' · '+td.length+' due today':'')})
        +tileSm({tone:'g3',title:'Content',k:'content',value:pd.rate==null?'No posts yet':pd.rate+'%',soft:pd.rate==null,suf:pd.rate==null?'':'/published',chart:orbitChart(pd.all.length?pd.pub.length/pd.all.length:0),
          cap:pd.all.length?pd.pub.length+' of '+pd.all.length+' posts live'+(pd.sch.length?' · '+pd.sch.length+' scheduled':''):'Draft one in the Studio and follow it to published.'})
        +tileSm({tone:'g4',title:'Needs you',k:'needs',value:wt,suf:wt===1?'/approval':'/approvals',chart:halftone(wt),
          cap:wt?'Oldest waiting '+ago(wl.slice().sort(function(x,y){ return x.at-y.at; })[0].at).replace(' ago',''):'All clear'})
      +'</div>'
      +'<div class="crd-below">'+composer(null)+(window.KovaAsk?KovaAsk.panel():'')+needsYou()+recent()+'</div>';
  }
  /* ---- one employee: their skill, live from your data ---- */
  /* p30: one teammate is their own page: who they are and a box to message
     them come first, then their live numbers, their skill, their jobs, and
     what they do. It used to be the team page with their numbers swapped
     in, the message box far down and the team's boxes still around it. */
  function empPage(e){
    var sn=snapshot(e), cur=busyWith(e.id), last=jobsOf(e.id).slice(-1)[0], m=(sn&&sn.metrics)||[];
    return '<div class="crw-mate"><button class="crd-link crw-allt" data-c="tab" data-t="all">‹ All team</button>'
        +'<div class="crw-mh">'+av(e,true)+'<div><h1 class="crd-title">'+esc(e.n)+'</h1><div class="crw-mt">'+esc(e.title)+(cur?' · working now':last?' · last job '+esc(ago(last.end||last.at)):'')+'</div></div></div>'
        +'<div class="crw-mj">'+esc(String(e.job||'').split(/(?<=\.)\s/)[0]||'')+'</div></div>'
      +composer(e)
      +(m.length?'<div class="crd-mid"><div class="crd-stats">'+m.slice(0,4).map(function(x){ return stat(x.label,x.value,x.unit||'',x.note||''); }).join('')+'</div>'
        +flow(cur||last,e,sn)+(cur?focusCard(cur,e,sn):'')+'</div>':'')
      +'<div class="crd-tiles">'+empTiles(e,sn)+'</div>'
      +'<div class="crd-below">'+(window.KovaTeamPlus?KovaTeamPlus.mateExtra(e):'')+(sn?skillBlock(e,sn):'')+jobBlock(e,true)+teachCard(e)+'</div>'
      +'<div class="crd-sh2">Your team</div>'+tabsRow(e.id);
  }
  function teachCard(e){
    var t=e.taught, rt=e.routine||{};
    if(!t||!t.steps) return '<div class="crd-card crw-teachc"><div class="crd-chd"><span>Teach by showing</span><small>Do the job once yourself in Work OS. '+esc(e.n)+' watches and learns the steps.</small></div>'
      +'<div class="crd-row"><button class="crd-btn" data-c="teach" data-id="'+esc(e.id)+'">Show '+esc(e.n)+' how</button></div></div>';
    return '<div class="crd-card crw-teachc"><div class="crd-chd"><span>What you showed '+esc(e.n)+'</span><small>'+t.steps.length+' steps \u00b7 '+ago(t.at)+'</small></div>'
      +'<ol class="crw-taught">'+t.steps.map(function(st){ return '<li>'+esc(teachLine(st))+'</li>'; }).join('')+'</ol>'
      +'<div class="crd-row"><button class="crd-btn" data-c="taughtrun" data-id="'+esc(e.id)+'">Do it now</button>'
      +'<button class="crd-btn ghost'+(rt.taught?' on':'')+'" data-c="taughtroutine" data-id="'+esc(e.id)+'" aria-pressed="'+!!rt.taught+'">'+(rt.taught?'Is their routine':'Make it their routine')+'</button>'
      +'<button class="crd-btn ghost" data-c="teach" data-id="'+esc(e.id)+'">Show again</button><button class="crd-btn ghost" data-c="untaught" data-id="'+esc(e.id)+'">Forget it</button></div></div>';
  }
  function empTiles(e,sn){
    if(!sn) return '';
    var C=sn.charts||[], m=sn.metrics||[], tones=['g1','g2','g3','g4'];
    var h=tileBig({tone:'lit',value:m[0]?m[0].value:'',label:m[0]?m[0].label.toLowerCase():'',title:C[0]?C[0].title:'',avatars:[e],chart:C[0]?chart(C[0],'big'):empty()});
    var small=C.slice(1,5).map(function(ch,i){ var hd=chartHead(ch); return tileSm({tone:tones[i],title:ch.title,value:hd.v,pre:hd.pre,suf:hd.suf,chart:chart(ch,'tile')}); });
    var k=1; while(small.length<4&&m[k]){ var x=m[k++]; if(C.slice(1).some(function(ch){ return ch.title===x.label; })) continue; small.push(tileSm({tone:tones[small.length],title:x.label,value:x.value,pre:(x.unit&&x.unit.length<=2&&x.unit!=='!')?x.unit:'',suf:'',chart:'<div class="crd-tnote">'+esc(x.note||'')+'</div>'})); }
    return h+small.join('');
  }
  function skillBlock(e,sn){
    var h='<div class="crd-card"><div class="crd-chd"><span>'+esc(sn.skillName)+'</span><small>'+esc(sn.title)+' · live from your data</small></div>'
      +'<div class="crd-sum">'+md(sn.summary||'')+'</div>'
      +'<div class="crd-secs">'+(sn.sections||[]).map(function(s){ return '<div class="crd-sec"><div class="crd-sh">'+esc(s.heading)+'</div><div class="crd-sx">'+md(s.text)+'</div></div>'; }).join('')+'</div>'
      +'<div class="crd-row"><button class="crd-btn" data-c="run" data-id="'+esc(e.id)+'">'+esc(RUN_LABEL[sn.skill]||'Run it now')+'</button><span class="crd-hint">'+(brainName()==='local'?'Runs on this device':'Claude does it, with this as the brief')+'</span></div></div>';
    if(sn.ideas&&sn.ideas.length) h+=ideasBlock(sn.ideas,e.id,null);
    if(sn.emails&&sn.emails.length) h+='<div class="crd-card"><div class="crd-chd"><span>Emails I would send</span><small>Nothing goes out without your OK</small></div>'+sn.emails.map(function(m){ return '<div class="crd-mail"><div class="crd-mh">'+esc(m.subject)+'<span>'+esc(m.to||'no address yet')+'</span></div><div class="crd-mb">'+esc(m.body).replace(/\n/g,'<br>')+'</div></div>'; }).join('')+'<div class="crd-row"><button class="crd-btn ghost" data-c="run" data-id="'+esc(e.id)+'">Draft them for approval</button></div></div>';
    return h;
  }
  function ideasBlock(ideas,eid,jid){
    return '<div class="crd-card"><div class="crd-chd"><span>Post ideas for this week</span><small>Each one ready to draft</small></div>'
      +ideas.map(function(x,i){ var key=(jid||eid)+':'+i, saved=S.saved&&S.saved[key];
        return '<div class="crd-idea"><div class="crd-ih"><span class="crd-day">'+esc(x.day)+'</span><span class="crd-im">'+esc([x.platform,x.format,x.pillar,x.time].filter(Boolean).join(' · '))+'</span></div>'
          +'<div class="crd-hook">'+esc(x.hook)+'</div>'
          +((x.beats||[]).length?'<ol class="crd-beats">'+x.beats.map(function(b){ return '<li>'+esc(b)+'</li>'; }).join('')+'</ol>':'')
          +'<div class="crd-capn">'+esc(String(x.caption||'').split('\n').slice(-1)[0])+(x.tags?' <span>'+esc(x.tags)+'</span>':'')+'</div>'
          +'<button class="crd-link" data-c="idea" data-id="'+esc(eid||'')+'" data-j="'+esc(jid||'')+'" data-i="'+i+'"'+(saved?' disabled':'')+'>'+(saved?'Saved in the Studio ✓':'Save as a Studio draft')+'</button></div>'; }).join('')+'</div>';
  }
  function jobBlock(e,noComposer){
    var T=tpl(e.tpl), jobs=jobsOf(e.id).slice(-12);
    return (noComposer?'':composer(e))
      +'<div class="crd-sh2">Jobs</div><div class="crw-thread">'+(jobs.length?jobs.map(jobCard).join(''):'<div class="crw-empty">No jobs yet. Message '+esc(e.n)+' above, or say “'+esc(e.n)+'” on any screen.</div>')+'</div>'
      +'<div class="crd-card"><div class="crd-chd"><span>'+esc(e.n)+'’s job</span><button class="crd-link" data-c="edit" data-id="'+esc(e.id)+'">Edit</button></div>'
        +'<div class="crw-jd'+(S.open.jd?' open':'')+'">'+md(e.job||'No job description yet.')+'</div>'
        +(e.playbook?'<div class="crd-sh">Playbook</div><div class="crw-jd'+(S.open.jd?' open':'')+'">'+md(e.playbook)+'</div>':'')
        +'<button class="crd-link" data-c="more">'+(S.open.jd?'Show less':'Show all')+'</button>'
        +'<div class="crd-facts"><span>'+esc(describeRoutine(e))+'</span><span>'+(e.approval==='all'?'Asks before every change':'Asks before anything leaves Kova')+'</span><span>'+((e.memory||[]).length)+' memories</span></div>'
        +'<div class="crd-tools">'+esc(GROUPS.filter(function(g){ return g.locked||(e.tools||[]).indexOf(g.id)>=0; }).map(function(g){ return g.n; }).join(' · '))+'</div>'
        +'<div class="crd-row">'+routineBtn(e,T)+'<span class="crd-grow"></span><span class="crd-hint">'+(e.enabled?'On':'Off')+'</span><button class="crw-tog'+(e.enabled?' on':'')+'" data-c="toggle" data-id="'+esc(e.id)+'" role="switch" aria-checked="'+e.enabled+'" aria-label="'+esc(e.n)+' on or off"><span></span></button></div>'
      +'</div>';
  }
  function routineBtn(e,T){
    if(e.routine&&e.routine.freq!=='off'&&e.routine.job) return '<button class="crd-btn ghost" data-c="runroutine" data-id="'+esc(e.id)+'">Run the routine now</button>';
    if(T&&T.routine&&T.routine.freq!=='off') return '<button class="crd-btn ghost" data-c="routineon" data-id="'+esc(e.id)+'">Turn on: '+esc(describeRoutine({n:e.n,routine:T.routine}))+'</button>';
    return '';
  }
  function composer(e){
    var id=e?'crwEmpAsk':'crwAsk', btn=e?'empask':'ask', T=e?tpl(e.tpl):null, sk=e?skillsOf(e)[0]:null;
    var ideas=e?(((T&&T.chips)||[]).concat(sk&&RUN_JOB[sk]?[RUN_JOB[sk]]:[])):['How is the work going?','Triage my overdue tasks','Brief me on today','Plan my week','Draft 3 posts for this week','Chase my late invoices'];
    return '<div class="crd-card crw-hero"><div class="crd-chd"><span>'+(e?'Message '+esc(e.n):'Tell the team what you need')+'</span><small>'+(e?esc(e.n)+' works on it and reports back.':(chief()?esc(chief().n)+' sends it to whoever owns it.':'It goes to whoever owns it.'))+'</small></div>'
      +'<div class="crw-ask"><textarea id="'+id+'" rows="2" placeholder="'+(e?'e.g. '+esc(ideas[0]||'Analyze my work'):'e.g. Chase everyone who owes me an invoice, then report back')+'" aria-label="The job"></textarea>'+(window.KovaTeamPlus?KovaTeamPlus.tools(id):'')+'<button class="crw-send" data-c="'+btn+'" aria-label="Send">'+svg(IC.send)+'</button></div>'
      +(window.KovaTeamPlus?KovaTeamPlus.pend(id):'')
      +(window.KovaAsk?KovaAsk.chips():'')
      +sug(e?'ask-'+e.id:'ask','Ideas',[{h:'Try asking',items:ideas.map(function(q){ return {c:e?'empq':'askq',q:q,l:q}; })}])
      +(e?'':listenRow())+'</div>';
  }
  function needsYou(){ var wt=waiting(); return wt.length?'<div class="crd-sh2">Needs you ('+wt.length+')</div>'+wt.map(function(j){ return approvalCard(j,true); }).join(''):''; }
  function recent(){ var r=jobsOf().slice(-6).reverse(); return r.length?'<div class="crd-sh2">Recent work</div><div class="crw-recent">'+r.map(function(j){ var e=emp(j.emp)||{n:'?'};
      return '<button class="crw-rj" data-c="open" data-id="'+esc(j.emp)+'">'+av(e)+'<span class="t"><b>'+esc(e.n)+'</b> '+esc(j.text.split('\n')[0].slice(0,80))+'</span><span class="crw-st s-'+j.state+'">'+({running:'Working',waiting:'Needs you',paused:'Paused, you stepped in',done:'Done',failed:'Failed',stopped:'Stopped'}[j.state])+'</span></button>'; }).join('')+'</div>':''; }
  function listenRow(){
    var L=window.KovaListen; if(!L) return '';
    var ok=L.supported(), on=ok&&L.on(), err=L.error(), names=emps().filter(function(e){ return e.enabled; }).map(function(e){ return e.n; }).slice(0,2);
    return '<div class="crw-listen"><span class="crw-lt"><b>Call them by name</b><small>'
      +(ok?'Say “'+esc(names[0]||'Maya')+'” or “hey '+esc(names[1]||'Leo')+'” on any screen and their box pops up. In a noisy room, say “hey” first. Your browser turns speech into text'+(/Chrome/.test(navigator.userAgent||'')&&!/Edg\//.test(navigator.userAgent||'')?' (in Chrome, through Google)':'')+'; Kova keeps only the job you give.'
          :'This browser cannot listen for names. Chrome, Edge and Safari can.')
      +(err?'<em>'+esc(err)+'</em>':'')+'</small></span>'
      +'<button class="crw-tog'+(on?' on':'')+'" data-c="listen" role="switch" aria-checked="'+on+'" aria-label="Call your team by name"'+(ok?'':' disabled')+'><span></span></button></div>';
  }
  /* ---- the other pages under the pills ---- */
  function jobsPage(){ var J=jobsOf().slice(-25).reverse(); return head(0,'Jobs',J.length+' job'+(J.length===1?'':'s')+' so far')+'<div class="crw-thread">'+(J.length?J.map(jobCard).join(''):'<div class="crd-card"><div class="crw-empty">No jobs yet. Give the team one on the Team page, or say a name.</div></div>')+'</div>'; }
  function approvalsPage(){ var wt=waiting(); return head(0,'Approvals',wt.length?wt.length+' waiting for your OK':'Nothing waiting')+(wt.length?wt.map(function(j){ return approvalCard(j,true); }).join(''):'<div class="crd-card"><div class="crw-empty">Nothing needs your approval. Anything that leaves Kova, like an email, waits here for you.</div></div>'); }
  function routinesPage(){
    return head(0,'Routines','They run while Kova is open, and catch up when you open it')+(window.KovaTeamPlus?KovaTeamPlus.routinesExtra():'')+emps().map(function(e){ var T=tpl(e.tpl), on=e.routine&&e.routine.freq!=='off'&&e.routine.job;
      return '<div class="crd-card crd-rt"><div class="crd-rth">'+av(e)+'<div><b>'+esc(e.n)+'</b><span>'+esc(e.title)+'</span></div><span class="crw-st '+(on?'s-done':'s-off')+'">'+(on?esc(describeRoutine(e)):'Off')+'</span></div>'
        +'<div class="crd-rtj">'+esc(on?e.routine.job:(T&&T.routine&&T.routine.job?'Suggested: '+T.routine.job:'No routine yet.'))+'</div><div class="crd-row">'+routineBtn(e,T)+'<button class="crd-btn ghost" data-c="edit" data-id="'+esc(e.id)+'">Change it</button></div></div>'; }).join('');
  }
  function reportsPage(){
    var L=emps().map(function(e){ return {e:e,j:jobsOf(e.id).filter(function(x){ return x.report; }).slice(-1)[0]}; }).filter(function(x){ return x.j; });
    return head(0,'Reports','The latest from each employee')+(L.length?L.map(function(x){ return '<div class="crd-card"><div class="crd-chd"><span>'+esc(x.e.n+' · '+x.e.title)+'</span><small>'+esc(ago(x.j.end||x.j.at))+'</small></div>'+reportCard(x.j.report,x.j)+'</div>'; }).join('')
      :'<div class="crd-card"><div class="crw-empty">No reports yet. Open an employee and run their skill.</div></div>');
  }
  function dash(){
    if(S.tab&&S.tab!=='all'&&!emp(S.tab)) S.tab='all';
    var nav=S.nav||'team', e=S.tab&&S.tab!=='all'?emp(S.tab):null;
    var body=nav==='chat'?(window.KovaTeamPlus?KovaTeamPlus.chatPage():head(0,'Team chat','Loading…')):nav==='usage'?usagePage():nav==='jobs'?jobsPage():nav==='approvals'?approvalsPage():nav==='routines'?routinesPage():nav==='reports'?reportsPage():(e?empPage(e):teamPage());
    return '<div class="crd">'+topBar()+body+'</div>';
  }

  /* ---- jobs, approvals and reports ---- */
  var ICON={read:'◦',write:'✓',send:'✉',handoff:'→',report:'▤',error:'!',blocked:'×',wait:'•',ok:'✓',skip:'–',think:'…',web:'⌕',info:'•'};
  function jobCard(j){
    var e=emp(j.emp)||{n:'?'};
    var src={routine:'Routine',handoff:'Hand-off',team:'From the team',you:'You',voice:'By voice',chat:'Team chat',skill:'Saved skill',share:'Shared to Kova',watch:'Watching a page'}[j.source]||'You';
    return '<div class="crw-jobw" id="job-'+esc(j.id)+'">'
      +(/^(routine|handoff|voice|chat|skill|share|watch)$/.test(j.source)?'<div class="crw-src">'+esc(src)+'</div>':'')
      +'<div class="crw-you">'+md(j.text)+(window.KovaTeamPlus?KovaTeamPlus.files(j):'')+'</div>'
      +'<div class="crw-job s-'+j.state+'">'
        +'<div class="crw-jh">'+av(e)+'<b>'+esc(e.n)+'</b><span>'+({running:'Working',waiting:'Needs you',paused:'Paused, you stepped in',done:'Done',failed:'Could not finish',stopped:'Stopped'}[j.state])+' · '+clock(j.at)+' · '+esc(BRAIN_N[j.brain]||'')+'</span>'
        +(j.state==='running'||j.state==='waiting'||j.state==='paused'?'<button class="crw-link" data-c="stop" data-j="'+esc(j.id)+'">Stop</button>':'')+'</div>'
        +(j.state==='running'||j.state==='paused'?screen(j,e):'')
        /* while the screen shows the live feed, the full step list waits for the end */
        +(j.state==='running'||j.state==='paused'?'':'<ol class="crw-steps">'+j.steps.map(function(s){ return '<li class="k-'+s.k+'"><i>'+(ICON[s.k]||'•')+'</i><span>'+esc(s.t)+'</span></li>'; }).join('')+'</ol>')
        +(j.state==='waiting'?approvalCard(j,false):'')
        +(j.report?reportCard(j.report,j):'')
        +(j.sources&&j.sources.length?'<div class="crw-srcs">'+j.sources.map(function(s){ return '<a href="'+esc(s.u)+'" target="_blank" rel="noopener">'+esc(s.t)+'</a>'; }).join('')+'</div>':'')
        +(j.say&&j.state!=='running'?'<div class="crw-say'+(/without AI \(/.test(j.say)?' crw-fb':'')+'">'+md(j.say)+'</div>':'')
        +(j.note?'<div class="crw-note">'+esc(j.note)+'</div>':'')
        +(j.state==='done'&&(j.say||j.report)&&window.speechSynthesis?'<button class="crw-link crw-listen" data-c="speak" data-j="'+esc(j.id)+'" aria-label="Read it to me"><svg class="ic" aria-hidden="true"><use href="#i-headphones"/></svg>Listen</button>':'')
        +((j.state==='done'||j.state==='stopped'||j.state==='failed')&&j.changes&&j.changes.length?'<button class="crw-link" data-c="undo" data-j="'+esc(j.id)+'">Undo '+j.changes.length+' change'+(j.changes.length>1?'s':'')+'</button>':'')
        +(j.undone?'<div class="crw-note">Undid '+j.undone+' change'+(j.undone>1?'s':'')+'.</div>':'')
        +(window.KovaTeamPlus?KovaTeamPlus.again(j):'')
      +'</div></div>';
  }
  /* the bot's screen (p15): what it is doing right now, live, with the
     next step it is about to take - and the controls to step in */
  function screen(j,e){
    var live=j.steps.filter(function(s){ return s.k!=='think'; }).slice(-4), cur=j.steps[j.steps.length-1];
    var nx=j.brain==='taught'?(j.left&&j.left[0]?{name:j.left[0].tool,input:j.left[0].input}:null):(j.queue&&j.queue[0]);
    var T=nx&&TOOLS[nx.name], d=T&&T.describe?T.describe(nx.input||{}):null;
    var paused=j.state==='paused', u=usedBy(e), b=budgetOf(e), el=Math.max(1,Math.round((Date.now()-j.at)/1000));
    var h='<div class="crw-scr'+(paused?' paused':'')+'" data-j="'+esc(j.id)+'"><div class="crw-scrbar"><i></i><i></i><i></i><span>'+esc(e.n)+'\u2019s screen \u00b7 Work OS</span>'
      +'<em>'+(j.brain==='taught'?'Taught':esc(MODELS[j.model||pickModel(e,j)]||''))+'</em></div>'
      +'<div class="crw-scrb"><div class="crw-now"><span class="cur" aria-hidden="true"></span>'+esc(paused?'Paused. Change the next step, tell '+e.n+' something, or hand it back.':(cur?cur.t:'Starting'))+'</div>'
      +(d?'<div class="crw-next"><small>Next</small><b>'+esc(d.t)+(d.n?' \u201c'+esc(d.n)+'\u201d':'')+'</b>'+(d.s?'<span>'+esc(d.s)+'</span>':'')+'</div>':'')
      +'<ol class="crw-feed">'+live.map(function(s){ return '<li><i>'+(ICON[s.k]||'\u2022')+'</i>'+esc(s.t)+'</li>'; }).join('')+'</ol>';
    if(paused&&nx){
      var inp=nx.input||{};
      h+='<div class="crw-edit">'+Object.keys(inp).filter(function(k){ return k.indexOf('__')!==0&&(typeof inp[k]==='string'||typeof inp[k]==='number'); }).slice(0,6).map(function(k){
        return '<label>'+esc(k.replace(/_/g,' '))+'<input data-f="'+esc(k)+'" value="'+esc(inp[k])+'"></label>'; }).join('')+'</div>';
    }
    h+='</div><div class="crw-scrf"><span>'+u+' / '+b+' steps this week \u00b7 '+(el<60?el+' s':Math.round(el/60)+' min')+'</span>'
      +(paused?'<button class="crw-btn" data-c="resume" data-j="'+esc(j.id)+'">Hand it back</button>':'<button class="crw-btn ghost" data-c="pause" data-j="'+esc(j.id)+'">Step in</button>')+'</div>'
      +'<div class="crw-tell"><input data-f="tell" placeholder="Tell '+esc(e.n)+' something while it works" aria-label="Tell '+esc(e.n)+' something"><button class="crw-btn ghost" data-c="tell" data-j="'+esc(j.id)+'">Send</button></div></div>';
    return h;
  }
  /* Usage (p15): steps against each weekly limit, the model mix, the
     guards that fired, and what each employee can and cannot touch */
  function usagePage(){
    var u=use(), L=emps(), tot=0, cap=0; L.forEach(function(e){ tot+=u.steps[e.id]||0; cap+=budgetOf(e); });
    var wkJobs=jobsOf().filter(function(j){ return j.at>=new Date(u.wk+'T00:00:00').getTime(); }), done=wkJobs.filter(function(j){ return j.state==='done'; }).length;
    var mm=['haiku','sonnet','opus'].map(function(k){ return [k,u.models[k]||0]; }), mt=mm.reduce(function(a,x){ return a+x[1]; },0)||1;
    return head(0,'Usage and limits','This week, from Monday')
      +'<div class="crd-mid"><div class="crd-stats">'+stat('Steps used',tot,'','of '+cap+' this week')+stat('Jobs done',done,'',wkJobs.length+' started')
        +stat('Loops stopped',u.loops||0,'','hand-offs going in circles')+stat('In parallel',u.parallel||0,'','jobs run side by side')+'</div></div>'
      +'<div class="crd-below"><div class="crd-card"><div class="crd-chd"><span>Each employee\u2019s week</span><small>A job stops when its employee reaches the limit. Change it in their settings.</small></div>'
        +'<div class="crw-use">'+L.map(function(e){ var n=u.steps[e.id]||0, b=budgetOf(e), pc=Math.min(100,Math.round(n/b*100));
          return '<div class="r"><span class="n">'+av(e)+esc(e.n)+'</span><span class="bar'+(pc>=90?' hi':'')+'"><i style="width:'+pc+'%"></i></span><span class="v">'+n+' / '+b+'</span><span class="m">'+esc(e.model&&MODELS[e.model]?MODELS[e.model]:'Auto \u00b7 '+MODELS[pickModel(e)])+'</span></div>'; }).join('')+'</div></div>'
      +'<div class="crd-card"><div class="crd-chd"><span>Which model did the thinking</span><small>Auto uses Haiku for quick jobs and Sonnet for writing and analysis.</small></div>'
        +'<div class="crw-use">'+mm.map(function(x){ var pc=Math.round(x[1]/mt*100); return '<div class="r"><span class="n">'+MODELS[x[0]]+'</span><span class="bar"><i style="width:'+pc+'%"></i></span><span class="v">'+x[1]+'</span><span class="m">'+pc+'%</span></div>'; }).join('')+'</div>'
        +(u.tokens?'<div class="crd-hint">'+fmtN(u.tokens)+' tokens this week.</div>':'')+'</div>'
      +'<div class="crd-card"><div class="crd-chd"><span>What each one can touch</span><small>Every employee is boxed in to its own tools. Email never leaves without your OK.</small></div>'
        +'<div class="crw-acc">'+L.map(function(e){ return '<div class="r"><b>'+esc(e.n)+'</b><span>'+GROUPS.map(function(g){ var on=g.locked||(e.tools||[]).indexOf(g.id)>=0; return '<i class="'+(on?'on':'')+'">'+(on?'\u2713 ':'\u2715 ')+esc(g.n)+'</i>'; }).join('')+'</span></div>'; }).join('')+'</div></div>'
      +'<div class="crd-card"><div class="crd-chd"><span>Guards</span></div><div class="crd-sum"><p>Runaway guard: if the team takes more than 40 steps in two minutes, every job pauses ('+(u.paused||0)+' time'+((u.paused||0)===1?'':'s')+' this week). Hand-offs that come back to the same employee, or go more than 4 deep, are stopped. A job stops after '+MAX_TURNS+' steps unless you tell it to carry on.</p><p>Routines run while Kova is open on any of your devices. Mark a routine \u201cAlso run when Kova is closed\u201d and the Kova server does it at its time: it reads your synced work, writes the report and proposes changes, which wait for you here.</p></div></div></div>';
  }
  function approvalCard(j,withWho){
    var a=j.ask; if(!a) return '';
    var e=emp(j.emp)||{n:'?'}, T=TOOLS[a.name], d=T&&T.describe?T.describe(a.input||{}):{t:a.name,n:'',s:''}, i=a.input||{};
    var h='<div class="crw-appr" data-j="'+esc(j.id)+'">'
      +'<div class="crw-ah">'+(withWho?av(e)+'<b>'+esc(e.n)+'</b> wants to ':'Approve: ')+'<span>'+esc(String(d.t).toLowerCase())+'</span></div>';
    if(a.name==='draft_email'){
      h+='<label>To<input data-f="to" value="'+esc(i.to||'')+'" placeholder="name@example.com"></label><label>Subject<input data-f="subject" value="'+esc(i.subject||'')+'"></label>'
        +'<label>Message<textarea data-f="body" rows="6">'+esc(i.body||'')+'</textarea></label>'
        +'<div class="crw-pr"><button class="crw-btn" data-c="ok" data-j="'+esc(j.id)+'" data-a="send">Approve and send</button><button class="crw-btn ghost" data-c="ok" data-j="'+esc(j.id)+'" data-a="draft">Save to Gmail drafts</button><button class="crw-btn ghost" data-c="skip" data-j="'+esc(j.id)+'">Skip</button></div>'
        +'<div class="crw-fine">Sent from the Google account you connected in Work OS. <a href="mailto:'+esc(i.to||'')+'?subject='+encodeURIComponent(i.subject||'')+'&body='+encodeURIComponent(i.body||'')+'" data-c="mailto">Or open it in your mail app</a>.</div>';
    } else {
      h+='<div class="crw-what"><b>'+esc(d.n||'')+'</b>'+(d.s?'<span>'+esc(d.s)+'</span>':'')+'</div>'
        +'<details class="crw-args"><summary>Details</summary><pre>'+esc(JSON.stringify(i,null,2))+'</pre></details>'
        +'<div class="crw-pr"><button class="crw-btn" data-c="ok" data-j="'+esc(j.id)+'">Approve</button><button class="crw-btn ghost" data-c="skip" data-j="'+esc(j.id)+'">Skip</button></div>';
    }
    return h+'</div>';
  }
  /* p43, the owner: "it feels like I'm reading a whole book... make it more
     organized and less clustered": each part of a report is its own small
     block; "**Task**: Critical, 11 days late" is the task with a tag, a
     "09:00-09:45 Task" line a time and the task, anything else one line */
  function secHtml(s){
    var L=String(s.text||'').split('\n'), items=L.filter(function(l){ return /^\s*[-*•]\s+/.test(l); });
    if(!items.length||items.length!==L.filter(function(l){ return l.trim(); }).length)
      return '<div class="crw-part"><div class="crw-pl">'+esc(s.heading)+'</div><div class="crw-rx">'+md(s.text)+'</div></div>';
    return '<div class="crw-part"><div class="crw-pl">'+esc(s.heading)+'</div>'+items.map(function(l){ return secRow(l.replace(/^\s*[-*•]\s+/,'')); }).join('')+'</div>';
  }
  function secRow(t){
    var m=/^\*\*(.+?)\*\*:\s*(.+)$/.exec(t);
    if(m){ var tag=m[2].split(/,\s*/), lvl=/^(critical|high|medium|low)$/i.test(tag[0])?tag[0].toLowerCase():'';
      return '<div class="crw-pr"><b>'+esc(m[1])+'</b><span class="crw-tags">'+tag.slice(0,2).map(function(x,i){ return '<i class="crw-tag'+(i===0&&lvl?' p-'+lvl:'')+'">'+esc(x.replace(/\.$/,''))+'</i>'; }).join('')+'</span></div>'; }
    var tm=/^(\d{1,2}:\d{2})(?:\s*[–-]\s*\d{1,2}:\d{2})?\s+(.+)$/.exec(t);
    if(tm) return '<div class="crw-pr crw-time"><time>'+esc(tm[1])+'</time><span>'+esc(tm[2].replace(/\s*\([^)]*\)\s*$/,''))+'</span></div>';
    return '<div class="crw-pr crw-line"><span>'+md(t).replace(/^<p>|<\/p>$/g,'')+'</span></div>';
  }
  function reportCard(r,j){
    return '<div class="crw-rep"><div class="crw-rt">'+esc(r.title)+'</div>'+(r.summary?'<div class="crw-rs">'+md(r.summary)+'</div>':'')
      +(r.metrics&&r.metrics.length?'<div class="crw-rm">'+r.metrics.map(function(m){ return '<div><span class="k">'+esc(m.label)+'</span><span class="v">'+esc(m.value)+(m.unit&&String(m.unit).length<=3?'<sup>'+esc(m.unit)+'</sup>':'')+'</span>'+(m.note?'<span class="s">'+esc(m.note)+'</span>':'')+'</div>'; }).join('')+'</div>':'')
      +(r.charts&&r.charts.length?'<div class="crw-charts">'+r.charts.slice(0,4).map(function(ch){ return '<div class="crw-chart"><div class="k">'+esc(ch.title||'')+'</div>'+chart(ch,'card')+'</div>'; }).join('')+'</div>':(r.series?'<div class="crw-rsp">'+spark(r.series)+'</div>':''))
      +(r.sections&&r.sections.length?'<div class="crw-parts">'+r.sections.map(secHtml).join('')+'</div>':'')
      +(r.ideas&&r.ideas.length?'<div class="crw-rh">Post ideas</div>'+r.ideas.slice(0,7).map(function(x,i){ var key=(j?j.id:'')+':'+i, saved=S.saved&&S.saved[key];
          return '<div class="crw-idea"><b>'+esc(x.hook||x.title||'')+'</b><span>'+esc([x.day,x.platform,x.format,x.time].filter(Boolean).join(' · '))+'</span>'+(j?'<button class="crd-link" data-c="idea" data-j="'+esc(j.id)+'" data-i="'+i+'"'+(saved?' disabled':'')+'>'+(saved?'Saved in the Studio ✓':'Save as a Studio draft')+'</button>':'')+'</div>'; }).join(''):'')
      +'</div>';
  }

  /* ---- hiring and editing, grouped into sections ---- */
  var FILL={
    names:['Ava','Leo','Maya','Jade','Zoe','Ravi','Noah','Mia','Kai','Nia','Theo','Iris','Sam','Luca'],
    titles:['Social Media Manager','Bookkeeper','Customer Support','Recruiter','Sales Assistant','Operations Lead'],
    jobs:{'Social Media Manager':'I run your social accounts. I plan the week’s posts, draft them in the Studio in your voice, and watch which ones get views so the next ones do better.',
      'Bookkeeper':'I keep the books tidy. I track what came in and what went out as metrics, chase unpaid invoices with drafted reminders, and warn you before a month ends badly.',
      'Customer Support':'I answer customers. I draft replies to questions and complaints, create a task for anything that needs you, and keep a list of what people ask most.',
      'Recruiter':'I help you hire. I write job posts, keep candidates moving with tasks and dates, and draft the emails to book interviews.',
      'Sales Assistant':'I keep deals moving. I follow up with leads that went quiet, draft proposals and reminders, and tell you which deals are closest to closing.',
      'Operations Lead':'I keep the business running. I turn goals into projects and tasks, check what is late every day, and fix the plan before things slip.'},
    adds:['I never send anything without your OK.','I report back every Friday with the numbers.','I flag anything overdue the same day.','I write in your brand voice.','I stay out of money and legal decisions.','I ask before changing a deadline.'],
    steps:['Read the work first.','List what is overdue.','Check the numbers for the last 7 days.','Draft it, then wait for my approval.','Create a task with a due date for anything left.','Hand it to a teammate if it is their job.','Finish with a short report and a chart.'],
    routine:['Brief me on today.','Write my weekly report.','Triage overdue tasks and set new dates.','Draft follow-ups for clients waiting on me.','Plan my week.','Check if my goals are on pace.']
  };
  /* one tidy "Suggestions" menu per field instead of rows of chips */
  function sug(key,label,groups){
    var open=S.sug===key;
    return '<div class="crd-sug"><button type="button" class="crd-sugb'+(open?' on':'')+'" data-c="sug" data-s="'+esc(key)+'" aria-expanded="'+open+'">'+esc(label)+svg(IC.chev,'sm')+'</button>'
      +'<div class="crd-menu" role="menu"'+(open?'':' hidden')+'>'+groups.map(function(g){ return '<div class="crd-mg"><div class="crd-mgh">'+esc(g.h)+'</div>'+g.items.map(function(it){
        return '<button type="button" class="crd-mi" role="menuitem" data-c="'+esc(it.c||'fill')+'"'+(it.q?' data-q="'+esc(it.q)+'"':'')+(it.t?' data-t="'+esc(it.t)+'" data-m="'+esc(it.m||'set')+'" data-v="'+esc(it.v)+'"':'')+'><b>'+esc(it.l)+'</b>'+(it.s?'<span>'+esc(it.s)+'</span>':'')+'</button>'; }).join('')+'</div>'; }).join('')+'</div></div>';
  }
  function jobStarters(){
    var out=TPL.map(function(t){ return [t.title,t.job]; });
    Object.keys(FILL.jobs).forEach(function(k){ out.push([k,FILL.jobs[k]]); });
    return out;
  }
  /* Hiring: one tap. Each role says in a line what they do and what you
     can ask them; "Hire" puts them on the team with sensible settings
     (change anything later), "Customize" opens the full form. */
  function roleCard(t){
    var e=emps().filter(function(x){ return x.tpl===t.id; })[0], sk=SK[(SK_FOR[t.id]||[])[0]];
    var j0=String(t.job||''), cut=j0.indexOf('. '), line=cut>0?j0.slice(0,cut+1):j0;
    var n=e?e.n:freeName(t);
    return '<div class="crd-role'+(e?' hired':'')+'">'
      +'<div class="crd-rh">'+av(e||{n:n})+'<div class="crd-rn"><b>'+esc(n)+'</b><span>'+esc(t.title)+'</span></div>'+(e?'<span class="crw-st s-done">On the team</span>':'')+'</div>'
      +'<p class="crd-rj">'+esc(line)+'</p>'
      +((t.chips||[]).length?'<div class="crd-rask"><small>Ask '+esc(n)+':</small>'+t.chips.slice(0,2).map(function(q){ return '<span>\u201c'+esc(q)+'\u201d</span>'; }).join('')+'</div>':'')
      +(sk?'<div class="crd-rsk">Skill: '+esc(sk.n)+'</div>':'')
      +'<div class="crd-rb">'+(e?'<button class="crd-btn" data-c="open" data-id="'+esc(e.id)+'">Open '+esc(e.n)+'</button><button class="crd-btn ghost" data-c="tpl" data-t="'+t.id+'" aria-label="Hire another '+esc(t.title)+'">Hire another</button>'
        :'<button class="crd-btn" data-c="hirenow" data-t="'+t.id+'">Hire '+esc(n)+'</button><button class="crd-btn ghost" data-c="tpl" data-t="'+t.id+'">Customize</button>')+'</div></div>';
  }
  function hireView(){
    var have=emps().map(function(e){ return e.tpl; }), off=TPL.filter(function(t){ return have.indexOf(t.id)<0; }), on=TPL.filter(function(t){ return have.indexOf(t.id)>=0; });
    return '<div class="crd">'+topBar()+head(0,'Hire an employee',on.length+' of '+TPL.length+' roles on your team · hire in one tap, change anything later')
      +(off.length?'<div class="crd-sh2">Ready to hire ('+off.length+')</div><div class="crd-roles">'+off.map(roleCard).join('')+'</div>':'<div class="crd-card"><div class="crw-empty">Every role is on your team. Start one from scratch below.</div></div>')
      +'<div class="crd-sh2">Something else?</div><div class="crd-roles"><button class="crd-role add" data-c="tpl" data-t=""><span class="crw-plus">'+svg(IC.plus)+'</span><b>Start from scratch</b><span class="crd-rj">Name them, say what they own, and they get to work.</span></button></div>'
      +(on.length?'<div class="crd-sh2">On your team ('+on.length+')</div><div class="crd-roles">'+on.map(roleCard).join('')+'</div>':'')
      +'</div>';
  }
  function field(label,control,menu){ return '<div class="crd-f"><div class="crd-fl"><span>'+label+'</span>'+(menu||'')+'</div>'+control+'</div>'; }
  function editView(){
    var d=S.draft; if(!d) return dash();
    var r=d.routine||{}, used=emps().filter(function(x){ return x.id!==d.id; }).map(function(x){ return x.n; });
    var sel=function(v,o){ return '<option value="'+o[0]+'"'+(String(v)===String(o[0])?' selected':'')+'>'+o[1]+'</option>'; };
    return '<div class="crd">'+topBar()+head(0,d.id?'Edit '+d.n:'New employee',d.id?d.title:'Hire')
      +'<div class="crd-card crw-form"><div class="crd-chd"><span>Who</span><small>Their name is what you say to call them.</small></div><div class="crw-two">'
        +field('Name','<input id="crwN" value="'+esc(d.n)+'" maxlength="30" placeholder="e.g. Maya" aria-label="Name">',sug('n','Suggestions',[{h:'Names not on your team yet',items:FILL.names.filter(function(n){ return used.indexOf(n)<0&&n!==d.n; }).slice(0,10).map(function(n){ return {t:'crwN',m:'set',v:n,l:n}; })}]))
        +field('Title','<input id="crwT" value="'+esc(d.title)+'" maxlength="40" placeholder="e.g. Social Media Manager" aria-label="Title">',sug('t','Suggestions',[{h:'Roles with a built-in skill',items:TPL.map(function(t){ return {t:'crwT',m:'set',v:t.title,l:t.title,s:'Skill: '+(SK[(SK_FOR[t.id]||[])[0]]||{}).n}; })},{h:'More roles',items:FILL.titles.map(function(t){ return {t:'crwT',m:'set',v:t,l:t}; })}]))
      +'</div></div>'
      +'<div class="crd-card crw-form"><div class="crd-chd"><span>Their job</span><small>What they own, and where their job stops. The team routes work by this.</small></div>'
        +field('Job description','<textarea id="crwJ" rows="5" maxlength="4000" placeholder="e.g. I keep the content pipeline full. I turn ideas into drafts for Instagram and TikTok in my voice." aria-label="Job description">'+esc(d.job)+'</textarea><small class="crw-count" data-for="crwJ">'+String(d.job||'').length+' / 4000</small>',
          sug('j','Suggestions',[{h:'Start like a role',items:jobStarters().map(function(x){ return {t:'crwJ',m:'set',v:x[1],l:x[0],s:x[1].split('. ')[0]+'.'}; })},{h:'Add a rule',items:FILL.adds.map(function(a){ return {t:'crwJ',m:'append',v:a,l:a}; })}]))
      +'</div>'
      +(S.more?'':'<button class="crd-more2" data-c="more2" aria-expanded="false"><b>More settings</b><span>Playbook, what they can do, approvals and schedule. The defaults work.</span>'+svg(IC.chev,'sm')+'</button>')
      +(S.more?'<div class="crd-morewrap">':'<div class="crd-morewrap" hidden>')
      +'<div class="crd-card crw-form"><div class="crd-chd"><span>How they work</span><small>Their playbook, step by step. Optional.</small></div>'
        +field('Playbook','<textarea id="crwP" rows="5" maxlength="4000" placeholder="1. Read the work first.&#10;2. Draft it, then wait for my approval.&#10;3. Finish with a short report." aria-label="Playbook">'+esc(d.playbook)+'</textarea>',
          sug('p','Suggestions',[{h:'Add a step',items:FILL.steps.map(function(s){ return {t:'crwP',m:'append',v:s,l:s}; })}]))
      +'</div>'
      +'<div class="crd-card"><div class="crd-chd"><span>What they can do</span></div><div class="crw-gl">'
        +GROUPS.map(function(g){ var on=g.locked||(d.tools||[]).indexOf(g.id)>=0; return '<button class="crw-gi'+(on?' on':'')+(g.locked?' lock':'')+'" data-c="grp" data-g="'+g.id+'" role="switch" aria-checked="'+on+'"><span><b>'+esc(g.n)+'</b><small>'+esc(g.d)+'</small></span><span class="crw-tog'+(on?' on':'')+'"><span></span></span></button>'; }).join('')
      +'</div></div>'
      +'<div class="crd-card crw-form"><div class="crd-chd"><span>Brain and limits</span><small>Auto picks the model for each job. The weekly limit stops a job going on and on.</small></div><div class="crw-two">'
        +field('Model','<select id="crwModel" aria-label="Model">'+[['auto','Auto (recommended)'],['haiku','Haiku \u00b7 fastest'],['sonnet','Sonnet \u00b7 balanced'],['opus','Opus \u00b7 deepest']].map(function(o){ return sel(d.model||'auto',o); }).join('')+'</select>')
        +field('Weekly limit','<select id="crwBud" aria-label="Weekly limit">'+BUDGETS.map(function(n){ return sel(+d.budget||150,[n,n+' steps']); }).join('')+'</select>')
      +'</div></div>'
      +'<div class="crd-card"><div class="crd-chd"><span>Approvals</span></div><div class="crw-seg2">'
        +[['external','Only email and posts','Changes inside Work OS go ahead and can be undone.'],['all','Every change','Nothing changes until you approve it.']].map(function(o){ return '<button class="'+(d.approval===o[0]?'on':'')+'" data-c="appr" data-v="'+o[0]+'"><b>'+o[1]+'</b><small>'+o[2]+'</small></button>'; }).join('')
      +'</div></div>'
      +'<div class="crd-card crw-form"><div class="crd-chd"><span>When they work</span><small>Routines run while Kova is open, and catch up when you open it.</small></div><div class="crw-two">'
        +field('Routine','<select id="crwFreq" aria-label="Routine">'+[['off','Off'],['weekdays','Weekdays'],['daily','Every day'],['weekly','Once a week'],['hourly','Every hour'],['event','When something happens']].map(function(o){ return sel(r.freq||'off',o); }).join('')+'</select>')
        +(r.freq&&r.freq!=='off'&&r.freq!=='hourly'&&r.freq!=='event'?field('Time','<input id="crwTime" type="time" value="'+esc(r.time||'09:00')+'" aria-label="Time">'):'')
        +(r.freq==='weekly'?field('Day','<select id="crwDow" aria-label="Day">'+['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(function(n,i){ return sel(+r.dow%7,[i,n]); }).join('')+'</select>'):'')
        +(r.freq==='event'?field('When','<select id="crwEv" aria-label="When">'+[['overdue','A task becomes overdue'],['new_task','A task is added'],['assigned','A task is assigned to them']].map(function(o){ return sel(r.event,o); }).join('')+'</select>'):'')
      +'</div>'
        +(r.freq&&r.freq!=='off'?field('The job they run','<textarea id="crwRJ" rows="2" placeholder="e.g. Brief me on today." aria-label="The job they run">'+esc(r.job||'')+'</textarea>',sug('r','Suggestions',[{h:'Ideas',items:FILL.routine.map(function(x){ return {t:'crwRJ',m:'set',v:x,l:x}; })}])):'')
        +(['daily','weekdays','weekly'].indexOf(r.freq)>=0?'<label class="crw-cloud"><input type="checkbox" id="crwCloud"'+(r.cloud?' checked':'')+'><span><b>Also run when Kova is closed</b><small>On the Kova server, at this time in your time zone. It reads your synced work, writes the report and proposes changes; you approve them when you open Kova. Needs you signed in.</small></span></label>':'')
      +'</div>'
      +'</div>'
      +(d.id&&(d.memory||[]).length?'<div class="crd-card"><div class="crd-chd"><span>Memory</span></div><div class="crw-mem">'+d.memory.map(function(m,i){ return '<div><span>'+esc(m.t)+'</span><button class="crw-link" data-c="forget" data-i="'+i+'">Forget</button></div>'; }).join('')+'</div></div>':'')
      +'<div class="crd-row crd-save"><button class="crd-btn" data-c="save">'+(d.id?'Save':'Hire '+esc(d.n||'them'))+'</button>'
      +(d.id?'<button class="crd-btn ghost danger" data-c="fire" data-id="'+esc(d.id)+'">'+(S.confirmFire?'Tap again to remove '+esc(d.n):'Remove from the team')+'</button>':'')
      +'<button class="crd-btn ghost" data-c="'+(d.id?'open':'team')+'" data-id="'+esc(d.id||'')+'">Cancel</button></div></div>';
  }
  function readForm(){
    var d=S.draft, v=function(id){ var x=document.getElementById(id); return x?x.value:null; };
    if(v('crwN')!=null) d.n=v('crwN').trim()||d.n; if(v('crwT')!=null) d.title=v('crwT').trim()||d.title;
    if(v('crwJ')!=null) d.job=v('crwJ'); if(v('crwP')!=null) d.playbook=v('crwP');
    d.routine=d.routine||{};
    if(v('crwFreq')!=null) d.routine.freq=v('crwFreq');
    if(v('crwTime')!=null) d.routine.time=v('crwTime'); if(v('crwDow')!=null) d.routine.dow=+v('crwDow');
    if(v('crwEv')!=null) d.routine.event=v('crwEv'); if(v('crwRJ')!=null) d.routine.job=v('crwRJ');
    if(v('crwModel')!=null) d.model=v('crwModel'); if(v('crwBud')!=null) d.budget=+v('crwBud');
    var cl=document.getElementById('crwCloud'); if(cl) d.routine.cloud=!!cl.checked; else if(['daily','weekdays','weekly'].indexOf(d.routine.freq)<0) d.routine.cloud=false;
  }

  /* ---- painting ---- */
  function keyOf(x){ return x.id||(x.getAttribute('data-f')&&x.closest('[data-j]')?x.closest('[data-j]').getAttribute('data-j')+':'+x.getAttribute('data-f'):''); }
  function paint(){
    var el=host(); if(!el) return;
    el.classList.add('crw');
    if(S.view==='emp'){ S.view='team'; S.nav='team'; S.tab=S.emp||'all'; }
    var keep={}, act=document.activeElement, ak=act&&el.contains(act)?keyOf(act):'', sel=null;
    el.querySelectorAll('textarea,input').forEach(function(x){ var k=keyOf(x); if(k&&x.type!=='time') keep[k]=x.value; });
    if(ak&&act.selectionStart!=null) sel=[act.selectionStart,act.selectionEnd];
    el.innerHTML=S.view==='edit'?editView():(S.view==='hire'?hireView():(S.view==='detail'?detailPage():dash()));
    el.querySelectorAll('textarea,input').forEach(function(x){ var k=keyOf(x); if(k&&keep[k]!=null&&x.type!=='time'&&x.value!==keep[k]&&!(S.clear&&S.clear[k])) x.value=keep[k]; });
    S.clear=null;
    if(ak){ var back=null; el.querySelectorAll('textarea,input').forEach(function(x){ if(keyOf(x)===ak) back=x; }); if(back){ try{ back.focus({preventScroll:true}); if(sel) back.setSelectionRange(sel[0],sel[1]); }catch(x){} } }
    notify();
    var t=el.querySelector('[data-autofocus]'); if(t&&S.focus){ try{ t.focus({preventScroll:true}); }catch(x){} S.focus=false; }
    if(S.scroll){ var th=el.querySelector('.crw-thread'); if(th&&th.lastElementChild&&th.lastElementChild.scrollIntoView) th.lastElementChild.scrollIntoView({block:'end'}); S.scroll=false; }
    var app=document.getElementById('app'); if(app) app.classList.toggle('crd-wide',visible());
  }
  function top0(){ var m=document.getElementById('main'); if(m) m.scrollTop=0; }
  /* with a mouse (or the keyboard), the readout follows the column you are on */
  function onHoverBar(ev){
    if(ev.type==='pointerover'&&ev.pointerType&&ev.pointerType!=='mouse') return;
    var g=ev.target.closest&&ev.target.closest('.jb'); if(!g) return;
    var wrap=g.closest('.crd-jd,.cwd-jchart'), tip=wrap&&wrap.querySelector('.crd-jtip'); if(!tip) return;
    var a=g.getAttribute('data-a')||'', n=a.split(' ')[0];
    tip.className='crd-jtip on'; tip.innerHTML='<b>'+esc(n)+'</b> '+esc(a.slice(n.length+1))+'<span>'+esc(g.getAttribute('data-b')||'')+'</span>';
    wrap.querySelectorAll('.jb.hov').forEach(function(x){ x.classList.remove('hov'); }); g.classList.add('hov');
  }
  function saveIdea(b){
    var jid=b.getAttribute('data-j'), eid=b.getAttribute('data-id'), i=+b.getAttribute('data-i');
    var list=jid&&S.jobs[jid]&&S.jobs[jid].report?S.jobs[jid].report.ideas:(SNAP[eid]&&SNAP[eid].ideas);
    var x=list&&list[i]; if(!x||!window.KovaPost) return;
    var p=KovaPost.blank(); p.title=String(x.hook||'Post').slice(0,80); p.heading=String(x.hook||''); p.caption=String(x.caption||''); p.tags=String(x.tags||'');
    p.targets=x.pk&&KovaPost.PLAT&&KovaPost.PLAT[x.pk]?[x.pk]:[]; p.by=(emp(eid)||{}).n||'Kova';
    KovaPost.save(p); S.saved=S.saved||{}; S.saved[(jid||eid)+':'+i]=1; say('Saved to the Studio as a draft.'); paint();
  }
  function onClick(ev){
    ev.__crwInside=true;                              /* the page-level "click outside" check skips this one */
    var b=ev.target.closest&&ev.target.closest('[data-c]');
    if(S.sug&&!(ev.target.closest&&ev.target.closest('.crd-sug'))){ S.sug=null; if(!b){ if(S.draft) readForm(); paint(); return; } }
    var cd=ev.target.closest&&ev.target.closest('[data-cd]');
    if(cd&&host().contains(cd)&&(!b||b.contains(cd))){ ev.preventDefault(); onDetail(ev); return; }
    if(!b||!host().contains(b)) return;
    var c=b.getAttribute('data-c'), id=b.getAttribute('data-id'), jid=b.getAttribute('data-j');
    if(c==='mailto') return;
    ev.preventDefault();
    if(c==='sug'){ if(S.draft) readForm(); var k=b.getAttribute('data-s'); S.sug=S.sug===k?null:k; paint(); return; }
    if(c==='team'){ S.view='team'; S.nav='team'; S.tab='all'; S.draft=null; paint(); top0(); return; }
    if(c==='nav'){ S.view='team'; S.nav=b.getAttribute('data-n')||'team'; S.draft=null; paint(); top0(); return; }
    if(c==='tab'){ S.view='team'; S.nav='team'; S.tab=b.getAttribute('data-t')||'all'; S.draft=null; paint(); return; }
    if(c==='open'){ S.view='team'; S.nav='team'; S.tab=id||'all'; S.draft=null; S.scroll=true; paint(); return; }
    if(c==='job'){ var jj=S.jobs[jid]; if(jj){ S.view='team'; S.nav='team'; S.tab=jj.emp; paint(); var n=document.getElementById('job-'+jid); if(n&&n.scrollIntoView) n.scrollIntoView({block:'center'}); } return; }
    if(c==='search'){ S.view='team'; S.nav='team'; S.tab='all'; paint(); var ta0=document.getElementById('crwAsk'); if(ta0){ if(ta0.scrollIntoView) ta0.scrollIntoView({block:'center'}); try{ ta0.focus({preventScroll:true}); }catch(x){} } return; }
    if(c==='detail'){ detail(b.getAttribute('data-k')); return; }
    if(c==='settings'){ S.showSet=!S.showSet; paint(); return; }
    if(c==='range'){ S.range={7:30,30:90,90:7}[S.range||30]; paint(); return; }
    if(c==='jrange'){ S.range=+b.getAttribute('data-r')||30; S.jsel=null; paint(); return; }
    if(c==='jsel'){ var ji=+b.getAttribute('data-i'); S.jsel=S.jsel===ji?null:ji; paint(); return; }
    if(c==='hirenow'){ var th=tpl(b.getAttribute('data-t')); if(th){ var ne=hire(th,{n:freeName(th)},true); say(ne.n+' joined your team.'); try{ if(window.KovaAnalytics) KovaAnalytics.track('crew_hire',{feature:th.id}); }catch(x){} S.view='team'; S.nav='team'; S.tab=ne.id; paint(); top0(); } return; }
    if(c==='more2'){ S.more=!S.more; if(S.draft) readForm(); paint(); return; }
    if(c==='hire'){ S.view='hire'; S.draft=null; paint(); top0(); return; }
    if(c==='more'){ S.open.jd=!S.open.jd; paint(); return; }
    if(c==='idea'){ saveIdea(b); return; }
    if(c==='run'){ var er=emp(id); if(er){ if(!er.enabled){ say(er.n+' is switched off.'); return; } var skr=skillsOf(er)[0]; start(er,RUN_JOB[skr]||'Analyze my work','you'); S.view='team'; S.nav='team'; S.tab=er.id; S.scroll=true; paint(); } return; }
    if(c==='ask'||c==='askq'){
      var q=c==='askq'?b.getAttribute('data-q'):(document.getElementById('crwAsk')||{}).value;
      if(!q||!q.trim()) return;
      var r=route(q); if(!r){ say('Hire someone first.'); return; }
      S.clear={crwAsk:1}; var ta=document.getElementById('crwAsk'); if(ta) ta.value='';
      /* a time ("at 11"), a link, or a time chip: it runs on the server and comes back to you */
      if(c==='ask'&&window.KovaAsk&&KovaAsk.wants(q)){ KovaAsk.send(r.emp,q).catch(function(){}); paint(); return; }
      var j=start(r.emp,q,'team'); if(j&&window.KovaTeamPlus) KovaTeamPlus.attach(j,'crwAsk'); if(j) log(j,(chief()&&chief().id!==r.emp.id?chief().n+' routed this to ':'Routed to ')+r.emp.n+' — '+r.why+(r.matched.length?' ('+r.matched.join(', ')+')':''),'handoff');
      S.view='team'; S.nav='team'; S.tab=r.emp.id; S.scroll=true; paint(); return;
    }
    if(c==='empask'||c==='empq'){
      var e=emp(S.tab), t=c==='empq'?b.getAttribute('data-q'):(document.getElementById('crwEmpAsk')||{}).value;
      if(!e||!t||!t.trim()) return;
      if(!e.enabled){ say(e.n+' is switched off.'); return; }
      var ta2=document.getElementById('crwEmpAsk'); if(ta2) ta2.value=''; S.clear={crwEmpAsk:1};
      if(c==='empask'&&window.KovaAsk&&KovaAsk.wants(t)){ KovaAsk.send(e,t).catch(function(){}); paint(); return; }
      var je=start(e,t,'you'); if(je&&window.KovaTeamPlus) KovaTeamPlus.attach(je,'crwEmpAsk'); S.scroll=true; S.focus=true; paint(); return;
    }
    if(c==='listen'){ if(window.KovaListen) KovaListen.set(!KovaListen.on()); return; }
    if(c==='toggle'){ var e2=emp(id); if(e2){ saveEmp(e2,{enabled:!e2.enabled}); paint(); } return; }
    if(c==='routineon'){ var e5=emp(id), t5=e5&&tpl(e5.tpl); if(t5){ saveEmp(e5,{routine:Object.assign({},e5.routine,{freq:t5.routine.freq,time:t5.routine.time,dow:t5.routine.dow||1,job:e5.routine.job||t5.routine.job})}); say(e5.n+' will run it '+describeRoutine(emp(id)).toLowerCase()+'.'); paint(); } return; }
    if(c==='runroutine'){ var e3=emp(id); if(e3&&e3.routine&&e3.routine.job){ if(busyWith(e3.id)){ say(e3.n+' is already working.'); return; } touch(e3,{lastRoutine:Date.now()}); start(e3,e3.routine.job,'routine'); S.view='team'; S.nav='team'; S.tab=e3.id; S.scroll=true; paint(); } return; }
    if(c==='stop'){ stop(jid); return; }
    if(c==='pause'){ pauseJob(jid); return; }
    if(c==='resume'){ var sc=b.closest('.crw-job'), ed={}; if(sc) sc.querySelectorAll('.crw-edit [data-f]').forEach(function(x){ var v0=x.value; ed[x.getAttribute('data-f')]=/^-?\d+(\.\d+)?$/.test(v0)?+v0:v0; }); resume(jid,ed); return; }
    if(c==='tell'){ var ti=b.closest('.crw-tell'), tv=ti&&ti.querySelector('input'); if(tv&&tv.value.trim()){ tell(jid,tv.value); S.clear={}; S.clear[jid+':tell']=1; tv.value=''; } return; }
    if(c==='speak'){ if(window.KovaVoice&&KovaVoice.talking()){ KovaVoice.stop(); return; } if(!speak(S.jobs[jid])) say('This browser cannot read aloud.'); return; }
    if(c==='voice'){ lsPut('kova.crew.voice',!lsJ('kova.crew.voice',false)); paint(); return; }
    if(c==='teach'){ var et=emp(id); if(et) teachStart(et); return; }
    if(c==='taughtrun'){ var er2=emp(id); if(er2){ if(busyWith(er2.id)){ say(er2.n+' is already working.'); return; } runTaught(er2,'you'); paint(); } return; }
    if(c==='taughtroutine'){ var e6=emp(id); if(e6){ var r6=Object.assign({},e6.routine||{}); r6.taught=!r6.taught; if(r6.taught&&(!r6.freq||r6.freq==='off')){ r6.freq='weekdays'; r6.time=r6.time||'09:00'; } if(r6.taught&&!r6.job) r6.job='Do it the way I showed you.'; saveEmp(e6,{routine:r6}); say(r6.taught?e6.n+' will do it '+describeRoutine(e6).toLowerCase()+'.':'Not their routine any more.'); paint(); } return; }
    if(c==='untaught'){ var e7=emp(id); if(e7){ var r7=Object.assign({},e7.routine||{}); r7.taught=false; saveEmp(e7,{taught:null,routine:r7}); paint(); } return; }
    if(c==='undo'){ var nu=undo(jid); say(nu?'Undid '+nu+' change'+(nu>1?'s':'')+'.':'Nothing to undo.'); return; }
    if(c==='ok'){
      var card=b.closest('.crw-appr'), edits={};
      if(card) card.querySelectorAll('[data-f]').forEach(function(x){ edits[x.getAttribute('data-f')]=x.value; });
      approve(jid,edits,b.getAttribute('data-a')); return;
    }
    if(c==='skip'){ skip(jid); return; }
    if(c==='edit'){ var e4=emp(id); if(e4){ S.draft=JSON.parse(JSON.stringify(e4)); S.view='edit'; S.more=false; S.confirmFire=false; S.sug=null; paint(); top0(); } return; }
    if(c==='tpl'){
      var t2=tpl(b.getAttribute('data-t'));
      S.draft={id:null,tpl:t2?t2.id:'custom',n:t2?t2.n:'',title:t2?t2.title:'',job:t2?t2.job:'',playbook:t2?t2.playbook:'',tools:t2?t2.tools.slice():['tasks'],approval:'external',
        routine:Object.assign({freq:'off',time:'09:00',dow:1,event:'overdue',job:''},t2?t2.routine:{}),memory:[]};
      S.view='edit'; S.more=false; S.sug=null; paint(); top0(); return;
    }
    if(!S.draft) return;
    readForm();
    if(c==='fill'){
      var ft=b.getAttribute('data-t'), fm=b.getAttribute('data-m'), fv=b.getAttribute('data-v'), FF={crwN:'n',crwT:'title',crwJ:'job',crwP:'playbook'};
      if(ft==='crwRJ') S.draft.routine.job=fv;
      else {
        var fk=FF[ft], cur=String(S.draft[fk]||'').trim();
        if(fm==='append'){
          if(ft==='crwP'){ var num=(cur.match(/^\d+\./gm)||[]).length+1; S.draft[fk]=(cur?cur+'\n':'')+num+'. '+fv; }
          else if(cur.indexOf(fv)<0) S.draft[fk]=(cur?cur+' ':'')+fv;
        } else {
          S.draft[fk]=fv;
          /* picking a known title fills a matching job too, while the job is still empty */
          if(ft==='crwT'){ var tt=TPL.filter(function(x){ return x.title===fv; })[0]; if(!String(S.draft.job||'').trim()) S.draft.job=tt?tt.job:(FILL.jobs[fv]||''); if(tt&&S.draft.tpl==='custom') S.draft.tpl=tt.id; }
        }
      }
      S.sug=null; S.clear={}; S.clear[ft]=1; if(ft==='crwT') S.clear.crwJ=1; paint(); return;
    }
    if(c==='grp'){ var g=b.getAttribute('data-g'), G=GROUPS.filter(function(x){ return x.id===g; })[0]; if(G&&!G.locked){ var gi=S.draft.tools.indexOf(g); if(gi>=0) S.draft.tools.splice(gi,1); else S.draft.tools.push(g); } paint(); return; }
    if(c==='appr'){ S.draft.approval=b.getAttribute('data-v'); paint(); return; }
    if(c==='forget'){ S.draft.memory.splice(+b.getAttribute('data-i'),1); paint(); return; }
    if(c==='fire'){
      if(!S.confirmFire){ S.confirmFire=true; paint(); return; }
      W.remove('agents',id,'user'); say(S.draft.n+' was removed from the team.'); S.confirmFire=false; S.draft=null; S.view='team'; S.nav='team'; S.tab='all'; paint(); return;
    }
    if(c==='save'){
      var d=S.draft;
      if(!d.n.trim()||!d.title.trim()){ say('Give them a name and a title.'); return; }
      if(!String(d.job||'').trim()){ say('Write the job description: it is how the team knows what they own.'); return; }
      if(d.id){ saveEmp(emp(d.id),{n:d.n,title:d.title,job:d.job,playbook:d.playbook,tools:d.tools,approval:d.approval,routine:d.routine,memory:d.memory,model:d.model||'auto',budget:+d.budget||150}); S.tab=d.id; say('Saved.'); }
      else { var ne=hire(tpl(d.tpl),{n:d.n,title:d.title,job:d.job,playbook:d.playbook,tools:d.tools,approval:d.approval,routine:d.routine}); saveEmp(ne,{model:d.model||'auto',budget:+d.budget||150}); S.tab=ne.id; say(d.n+' joined the team.'); }
      syncCloud().then(function(ok){ var dd=emp(S.tab); if(dd&&dd.routine&&dd.routine.cloud&&!ok) say('Saved. Running while Kova is closed needs you signed in with Kova Pro and the Kova server.'); });
      S.view='team'; S.nav='team'; S.draft=null; paint(); top0(); return;
    }
  }
  function onChange(ev){
    var t=ev.target;
    if(t&&t.id==='crwFreq'&&S.draft){ readForm(); if(S.draft.routine.freq!=='off'&&!S.draft.routine.job){ var tp=tpl(S.draft.tpl); S.draft.routine.job=tp?tp.routine.job:''; } paint(); }
  }
  function onKey(ev){
    var t=ev.target;
    if(t&&t.id==='crwJ'){ var cnt=host().querySelector('[data-for="crwJ"]'); if(cnt) cnt.textContent=t.value.length+' / 4000'; }
    if(ev.type==='keydown'&&ev.key==='Escape'&&S.sug){ S.sug=null; paint(); return; }
    if(ev.type==='keydown'&&ev.key==='Enter'&&!ev.shiftKey&&t&&(t.id==='crwAsk'||t.id==='crwEmpAsk')){
      ev.preventDefault(); var btn=host().querySelector(t.id==='crwAsk'?'[data-c="ask"]':'[data-c="empask"]'); if(btn) btn.click();
    }
    if(ev.type==='keydown'&&(ev.key==='Enter'||ev.key===' ')&&t&&t.getAttribute&&t.getAttribute('role')==='button'&&t.tagName!=='BUTTON'){ ev.preventDefault(); t.click(); }
  }

  /* ---------------- start ---------------- */
  function mount(){
    var el=host(); if(!el) return;
    seed(); loadJobs(); hookWork();
    if(!el.__crew){ el.__crew=true; el.addEventListener('pointerover',onHoverBar); el.addEventListener('focusin',onHoverBar); el.addEventListener('click',onClick); el.addEventListener('keydown',onKey); el.addEventListener('input',onKey); el.addEventListener('change',onChange);
      document.addEventListener('click',function(ev){ if(S.sug&&!ev.__crwInside&&!el.contains(ev.target)){ S.sug=null; if(S.draft) readForm(); paint(); } }); }
    window.__workTeam={draw:paint};
    var ab=document.getElementById('wtmAsk');
    if(ab) ab.onclick=function(){ S.view='team'; paint(); var t=document.getElementById('crwAsk'); if(t) t.focus(); };
    var scr=document.getElementById('s-workteam');
    if(scr&&window.MutationObserver) new MutationObserver(function(){ if(visible()) paint(); else { var ap=document.getElementById('app'); if(ap) ap.classList.remove('crd-wide'); } }).observe(scr,{attributes:true,attributeFilter:['class']});
    paint(); paintHome();
    var home=document.getElementById('s-work');
    if(home&&window.MutationObserver) new MutationObserver(function(){ if(home.classList.contains('on')) paintHome(); }).observe(home,{attributes:true,attributeFilter:['class']});
    S.lastOverdue=W.overdue().length;
    /* what ran on the server while Kova was closed, then keep the server's list current */
    setTimeout(function(){ pullCloud(); syncCloud(); },2500);
    document.addEventListener('visibilitychange',function(){ if(!document.hidden) pullCloud(); });
    clearInterval(S.tick); S.tick=setInterval(tick,60e3); setTimeout(tick,4000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(mount,300); }); else setTimeout(mount,300);

  /* a finished job a teammate did outside a job run (Send to Maya) */
  function note(empId,text,line){
    var e=emp(empId); if(!e) return null;
    var job={id:uid('j'),emp:e.id,text:String(text||'').slice(0,4000),source:'you',meta:null,at:Date.now(),state:'running',steps:[{t:line,k:'send',at:Date.now()}],
      changes:[],queue:[],results:[],turns:0,convo:null,brain:'local',say:line};
    S.jobs[job.id]=job; touch(e,{runs:(e.runs||0)+1,lastRun:Date.now()}); finish(job,line); saveJobs(); paintSoon(); return job;
  }
  return {note:note,migrate:migrate,TPL:TPL,GROUPS:GROUPS,TOOLS:TOOLS,emps:emps,emp:emp,hire:hire,route:route,analyze:analyze,system:system,toolDefs:toolDefs,toolsFor:toolsFor,
    start:start,approve:approve,skip:skip,stop:stop,undo:undo,pause:pauseJob,resume:resume,tell:tell,speak:speak,use:use,pickModel:pickModel,
    teachStart:teachStart,teachDone:teachDone,runTaught:runTaught,pullCloud:pullCloud,syncCloud:syncCloud,importCloud:importCloud,_teach:function(){ return S.teach; },jobs:function(){ return S.jobs; },jobsOf:jobsOf,waiting:waiting,
    md:md,brainWhy:brainWhy,health:health,slot:slot,tick:tick,fire:fire,brain:brainName,paint:paint,paintHome:paintHome,SK:SK,snapshot:snapshot,skillsOf:skillsOf,pickSkill:pickSkill,chart:chart,_S:S,_mount:mount,busy:busyWith,tpl:tpl,server:serverLikely,describeRoutine:describeRoutine,log:log,saveJobs:saveJobs,av:av,head:head,reportCard:reportCard,detail:detail,openMate:openMate,setRoutine:setRoutine,onTimeData:onTimeData,RUN_JOB:RUN_JOB};
})();
