/* KovaChat: behaviour, not presence. Drives the panel with a stubbed
   Firebase so both the real-model path and the offline path run. */
const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const R=[];const ck=(n,c)=>R.push([n,!!c]);
const vc=new VirtualConsole();const errors=[];vc.on('jsdomError',e=>errors.push(e.message));

function boot(signedIn,callImpl,opts){
  opts=opts||{};
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'https://kova.local/',virtualConsole:vc});
  const w=dom.window;
  let user=signedIn?{uid:'u1',email:'a@b.c',getIdToken:()=>Promise.resolve('tok')}:null;
  const calls=[];
  const authObj={get currentUser(){return user},onAuthStateChanged(cb){cb(user)},signOut:()=>Promise.resolve()};
  if(opts.anon) authObj.signInAnonymously=()=>{user={uid:'anon1',isAnonymous:true,getIdToken:()=>Promise.resolve('tok')};return Promise.resolve({user});};
  w.firebase={initializeApp(){},apps:[{}],
    auth:()=>authObj,
    database:()=>({ref:()=>({child(){return this},set:()=>Promise.resolve(),update:()=>Promise.resolve(),
      remove:()=>Promise.resolve(),once:()=>Promise.resolve({val:()=>null}),on(){},off(){}})}),
    storage:()=>({ref:()=>({})}),analytics:()=>({logEvent(){},setUserId(){}}),
    functions:()=>({httpsCallable:()=>()=>Promise.reject(new Error('the callable is gone'))})};
  /* POST /chat: the stub answers the way the api does - JSON, or an HTTP
     status for the error cases the old callable gave as codes */
  const STATUS={'functions/not-found':404,'resource-exhausted':429,'unauthenticated':401,'unavailable':503};
  w.fetch=(url,o={})=>{
    if(!/\/chat$/.test(String(url))) return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({})});
    const data=JSON.parse(o.body);
    calls.push({name:'chat',url:String(url),auth:(o.headers||{}).Authorization,data});
    return callImpl(data).then(
      (r)=>({ok:true,status:200,json:()=>Promise.resolve(r.data)}),
      (e)=>({ok:false,status:STATUS[e&&e.code]||500,json:()=>Promise.resolve({error:'x'})}));
  };
  /* sample mode keeps the demo week so the snapshot has something to carry;
     live mode (the default on a real https host) is checked separately */
  w.localStorage.setItem('kova_mode_v1',opts.mode||'sample');
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n;\n'));
  return {w,doc:w.document,calls};
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  // ---------- static ----------
  ck('voice orb removed from markup',!/id="kvOrb"/.test(html));
  ck('voice mode toggle removed',!/id="kvMode"/.test(html));
  ck('wake word can no longer auto-start',!/KP\.get\('wakeWord'\)===true && supported\(\)\) enable\(true\)/.test(html));
  ck('server chat exists',fs.existsSync(__dirname+'/../functions/chat.js'));
  const fn=fs.readFileSync(__dirname+'/../functions/chat.js','utf8');
  const apiSrc=fs.readFileSync(__dirname+'/../functions/api.js','utf8');
  ck('API key held server-side, not in the page',/cfg\.anthropicKey/.test(fn)&&!/sk-ant-/.test(html));
  ck('/chat requires sign-in',/async function chatRoute[\s\S]{0,80}requireUser/.test(apiSrc));
  ck('function strips client system messages',/m\.role === 'user' \|\| m\.role === 'assistant'/.test(fn));
  ck('function rate-limits per user',/chatDaily/.test(fn));
  const kb=fs.readFileSync(__dirname+'/../functions/knowledge.js','utf8');
  ['=== SLEEP','=== TRAINING','=== NUTRITION','=== VITALS','=== WORK','=== KOVA ITSELF'].forEach(h=>ck('knowledge covers '+h.slice(4),kb.includes(h)));
  ck('knowledge cites reference bodies',/AASM/.test(kb)&&/ISSN/.test(kb)&&/ACSM/.test(kb)&&/AHA/.test(kb));
  // verified 2026-09-21 - these must not silently revert to older guidance
  ck('BP guidance is the 2025 guideline, not 2017',/2025 AHA\/ACC/.test(kb)&&/REPLACED the 2017/.test(kb));
  ck('volume guidance cites the 2026 meta-regression',/Pelland/.test(kb)&&/diminishing returns/.test(kb));
  ck('caffeine guidance is dose-specific',/8\.8 hours/.test(kb)&&/13\.2 hours/.test(kb));
  // chat button
  ck('button no longer carries the rejected lavender',!/rgba\(150,128,168/.test(html));
  ck('button gradient keys off its own pillar',/\.kfab\[data-pillar="sleep"\]/.test(html));
  ck('router mirrors the pillar onto the button',/_kf\.setAttribute\('data-pillar'/.test(html));
  ck('screens keep a clear band for the button',/\.screen\{padding-bottom:calc\(96px/.test(html));
  ck('closed chat panel is invisible, not just moved',/\.kchat\{[\s\S]{0,400}visibility:hidden/.test(html));
  // theme rules must not have been rewritten onto the button
  const themeSel=(html.match(/body\.(?:light-mode|soft-light) \.app\[data-pillar="[a-z]+"\]/g)||[]).length;
  /* 72 app-wide rules, plus the 9 soft-light Work OS rules of p24 (src/p08_crew.css),
     plus the 3 that give Settings Work OS's colours in p36 (src/p08_plans.css) */
  ck('app-wide theme pillar rules intact ('+themeSel+')',themeSel===84);
  ck('per-pillar gradients: sleep/vitals/fuel/move',
     /kchat\[data-pillar="sleep"\]/.test(html)&&/kchat\[data-pillar="vitals"\]/.test(html)&&
     /kchat\[data-pillar="fuel"\]/.test(html)&&/kchat\[data-pillar="move"\]/.test(html));
  ck('soft + white glass variants exist',/body\.soft-light \.kchat/.test(html)&&/body\.light-mode \.kchat\{/.test(html));

  // ---------- signed in, real-model path ----------
  const A=boot(true,(d)=>Promise.resolve({data:{text:'**Protein**: aim for 1.6-2.2 g/kg.\n\n- spread it\n- over meals\n\n<img src=x onerror=alert(1)>'}}));
  await wait(500);
  const {w,doc,calls}=A;
  w.go('sleep'); await wait(50);
  ck('button picks up the sleep pillar',doc.getElementById('kovaFab').getAttribute('data-pillar')==='sleep');
  w.go('vitals'); await wait(30);
  ck('button follows to vitals',doc.getElementById('kovaFab').getAttribute('data-pillar')==='vitals');
  w.go('sleep'); await wait(30);
  doc.getElementById('kovaFab').click(); await wait(80);
  const panel=doc.getElementById('kovaPanel');
  ck('FAB opens the chat',panel.classList.contains('on'));
  ck('background follows the pillar you came from',panel.getAttribute('data-pillar')==='sleep');
  ck('context label names the pillar',doc.getElementById('kcCtx').textContent==='Sleep');
  ck('sleep suggestions shown',/wake at 3am/.test(doc.getElementById('kcSug').textContent));
  ck('FAB hidden while chat is open',doc.getElementById('kovaFab').style.display==='none');

  doc.getElementById('kcIn').value='How much protein do I need?';
  doc.getElementById('kcIn').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  await wait(60);
  ck('typing pill shows while waiting',!!doc.querySelector('.kc-typing')||calls.length===1);
  await wait(120);
  ck('Enter sends to POST /chat on the api',calls.length===1&&calls[0].name==='chat'&&/\/api\/chat$/.test(calls[0].url));
  ck('the chat request carries the ID token',calls[0]&&calls[0].auth==='Bearer tok');
  const d=calls[0]&&calls[0].data;
  ck('sends the conversation as messages',d&&d.messages&&d.messages[d.messages.length-1].content==='How much protein do I need?');
  ck('sends the current pillar',d&&d.pillar==='sleep');
  ck('snapshot carries real sleep data',d&&/Sleep, last \d+ nights/.test(d.snapshot)&&/eff \d+%/.test(d.snapshot));
  ck('snapshot does not invent a squat stall',d&&!/Jun 28/.test(d.snapshot)&&!/6\.2 hours/.test(d.snapshot));
  const a=doc.querySelector('.kc-a');
  ck('reply rendered',a&&/Protein/.test(a.textContent));
  ck('markdown bold rendered',a&&a.querySelector('b'));
  ck('markdown list rendered',a&&a.querySelectorAll('li').length===2);
  ck('reply cannot inject markup (XSS)',a&&!a.querySelector('img'));
  ck('user bubble rendered',doc.querySelector('.kc-u')&&/protein/i.test(doc.querySelector('.kc-u').textContent));
  ck('history saved to KP (syncs)',(w.KP.get('chat')||[]).length===2);
  ck('no offline tag on a real reply',!/On-device/.test(a.textContent));

  doc.getElementById('kcNew').click(); await wait(30);
  ck('new chat clears history',(w.KP.get('chat')||[]).length===0&&!doc.querySelector('.kc-u'));
  doc.getElementById('kovaClose').click(); await wait(30);
  ck('back closes the chat',!panel.classList.contains('on'));

  w.go('vitals'); await wait(30); w.go('chat'); await wait(60);
  ck('go("chat") opens the panel instead of the old screen',panel.classList.contains('on'));
  ck('vitals context gets the magenta background',panel.getAttribute('data-pillar')==='vitals');
  w.KovaChat.close();
  w.KOVA_ASK('Is my HRV ok?'); await wait(300);
  ck('KOVA_ASK opens and asks',calls.length===2&&calls[1].data.messages.slice(-1)[0].content==='Is my HRV ok?');

  // ---------- live mode: nothing invented ----------
  const L=boot(true,(d)=>Promise.resolve({data:{text:'ok'}}),{mode:'live'});
  await wait(500);
  L.w.KovaChat.open(); L.w.KovaChat.send('how did I sleep'); await wait(200);
  const ld=L.calls[0]&&L.calls[0].data;
  ck('live mode snapshot carries no sample sleep week',ld&&!/Sleep, last/.test(ld.snapshot));

  // ---------- function not deployed: falls back honestly ----------
  const B=boot(true,()=>Promise.reject({code:'functions/not-found'}));
  await wait(500);
  B.w.KovaChat.open(); B.w.KovaChat.send('what is sleep efficiency'); await wait(250);
  const ba=B.doc.querySelector('.kc-a');
  ck('undeployed function falls back to on-device',ba&&/Offline answer/.test(ba.textContent));
  ck('footer says it was answered offline',/answered offline/i.test(B.doc.getElementById('kcFoot').textContent));

  // ---------- signed out: a guest session gets the real assistant ----------
  const C=boot(false,()=>Promise.resolve({data:{text:'Real answer'}}),{anon:true});
  await wait(500);
  C.w.KovaChat.open(); C.w.KovaChat.send('hello'); await wait(300);
  ck('signed out starts a guest session and calls the function',C.calls.length===1);
  ck('guest gets the real reply, not the offline engine',/Real answer/.test((C.doc.querySelector('.kc-a')||{}).textContent||'')
     &&!/Offline answer/.test(C.doc.querySelector('.kc-a').textContent));

  // ---------- no auth at all (CDN blocked): offline engine, said plainly ----------
  const D=boot(false,()=>Promise.resolve({data:{text:'x'}}));
  await wait(500);
  D.w.KovaChat.open(); D.w.KovaChat.send('hello'); await wait(700);
  ck('without auth it never calls the function',D.calls.length===0);
  ck('without auth it says it is offline mode',/Offline mode/.test(D.doc.getElementById('kcFoot').textContent));

  let p=0,f=0;R.forEach(([n,o])=>{console.log((o?'PASS':'FAIL')+' - '+n);o?p++:f++;});
  console.log('\n'+p+'/'+(p+f)+' passing');
  if(errors.length){console.log('runtime errors: '+errors.length);errors.slice(0,5).forEach(e=>console.log('  '+e));}
  process.exit(f||errors.length?1:0);
})();
