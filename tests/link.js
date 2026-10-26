/* KovaLink / KovaHealth against the api function: the page sends a
   signed ID token (never an install id), a guest session is created
   when nobody is signed in, and the health address starts syncing. */
const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const R=[];const ck=(n,c)=>R.push([n,!!c]);
const vc=new VirtualConsole();const errors=[];vc.on('jsdomError',e=>errors.push(e.message));

(async()=>{
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'https://kova.local/',virtualConsole:vc});
  const w=dom.window;
  let user=null, anonCalls=0;
  const auth={get currentUser(){return user},onAuthStateChanged(cb){cb(user)},signOut:()=>Promise.resolve(),
    signInAnonymously(){anonCalls++;user={uid:'g1',isAnonymous:true,getIdToken:()=>Promise.resolve('idtok')};return Promise.resolve({user});}};
  w.firebase={initializeApp(){},apps:[{}],auth:()=>auth,
    database:()=>({ref:()=>({child(){return this},set:()=>Promise.resolve(),update:()=>Promise.resolve(),
      remove:()=>Promise.resolve(),once:()=>Promise.resolve({val:()=>null}),on(){},off(){}})}),
    storage:()=>({ref:()=>({})}),analytics:()=>({logEvent(){},setUserId(){}}),functions:()=>({httpsCallable:()=>()=>Promise.resolve({data:{text:''}})})};
  const reqs=[];
  w.fetch=(url,o={})=>{reqs.push({url:String(url),o});
    const body=/\/health\/token$/.test(url)?{url:'https://kova.local/api/health/abcdefghijklmnopqrstuvwxyz0123'}
      :/\/health\//.test(url)?{hr:55,hrv:70,ts:Date.now()-60000}
      :/\/status$/.test(url)?{google:{linked:true,label:'me@gmail.com'}}:{};
    return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(body)});};
  w.eval([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n;\n'));
  await new Promise(r=>setTimeout(r,400));

  ck('launch does not create a guest account on its own',anonCalls===0);
  ck('server defaults to the api on the same site (/api)',w.KovaLink.server()==='https://kova.local/api');
  ck('no install id is minted any more',!/kova\.link\.uid/.test(Object.keys(w.localStorage).join(',')));

  const st=await w.KovaLink.status();
  ck('status creates a guest session when needed',anonCalls===1);
  const sreq=reqs.find(r=>/\/status$/.test(r.url));
  ck('status sends a Bearer ID token',sreq&&sreq.o.headers.Authorization==='Bearer idtok');
  ck('status URL carries no user id',sreq&&!/[?&]u=/.test(sreq.url));
  ck('status result cached for the UI',st&&w.KovaLink.linked('google')&&w.KovaLink.label('google')==='me@gmail.com');

  const url=await w.KovaLink.healthUrl(false);
  ck('health address comes from the server',/\/api\/health\/[a-z0-9]{20,}$/.test(url));
  ck('health address becomes the relay',w.KovaHealth.relay()===url);
  await new Promise(r=>setTimeout(r,100));
  ck('pulling from it lands real values',w.KovaHealth.get('hr')===55&&w.KovaHealth.get('hrv')===70);
  ck('age reflects when the watch sent it, not when we asked',w.KovaHealth.ageMs()>=55000);

  await w.KovaLink.call('google',{path:'/calendar/v3/x'});
  const creq=reqs.find(r=>/\/call\/google$/.test(r.url));
  ck('proxied call is authenticated',creq&&creq.o.headers.Authorization==='Bearer idtok'&&creq.o.method==='POST');

  ck('first-run sign-in no longer fakes an account',!/name: 'Isa'/.test(html)&&!/isa@gmail\.com/.test(html));
  ck('Google sign-in goes through Firebase',/signInWithPopup\(prov\)/.test(html)&&/getRedirectResult/.test(html));
  ck('email code becomes a Firebase session',/signInWithCustomToken\(r\.body\.token\)/.test(html));
  ck('no leftover "deploy the Worker" instructions',!/wrangler|relay-worker\.js|integrations-worker\.js/.test(html));

  let p=0,f=0;R.forEach(([n,o])=>{console.log((o?'PASS':'FAIL')+' - '+n);o?p++:f++;});
  console.log('\n'+p+'/'+(p+f)+' passing');
  if(errors.length){console.log('runtime errors: '+errors.length);errors.slice(0,5).forEach(e=>console.log('  '+e));}
  process.exit(f?1:0);
})();
