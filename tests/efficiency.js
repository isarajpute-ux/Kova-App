const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
const errs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
const dom=new JSDOM(fs.readFileSync(__dirname+'/../index.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',virtualConsole:vc});
/* localhost boots in SAMPLE mode (KovaMode), which is the layout this checks */
const {window}=dom,doc=window.document;
setTimeout(()=>{
  const R=[];const ck=(n,c)=>R.push([n,!!c]);
  const f=doc.getElementById('effField');
  ck('paper card exists',doc.getElementById('effPaper'));
  ck('dash field paints',f&&f.innerHTML.length>400);
  const rects=(f.innerHTML.match(/<rect/g)||[]).length;
  ck('dash field has many dashes ('+rects+')',rects>25);
  ck('wake markers drawn',(f.innerHTML.match(/<circle/g)||[]).length===4);
  ck('uses the reference red',f.innerHTML.includes('#F2441C'));
  ck('dashes no longer encode sleep stages',!f.innerHTML.includes('#14161A')&&!f.innerHTML.includes('#B9BDC4'));

  // numbers derive from KOVA_WEEK, not hardcoded
  const n=window.KW_TODAY();
  const asleep=n.deep+n.rem+n.light;
  ck('big number matches data eff',doc.getElementById('effBigN').textContent===String(n.eff));
  const lbl=doc.getElementById('effBigL').textContent;
  ck('subtitle states in-bed and asleep',/in bed/.test(lbl)&&/asleep/.test(lbl));
  ck('asleep total is derived not typed',lbl.indexOf('5h 20m')>=0||lbl.indexOf(String(Math.floor(asleep/60)))>=0);

  const ax=doc.getElementById('effAxis');
  ck('axis has 5 columns',ax.querySelectorAll('[data-i]').length===5);
  ck('axis names blocks and wakes',/Block 1/.test(ax.textContent)&&/Woke/.test(ax.textContent));

  const lg=doc.getElementById('effLegend');
  ck('legend has 4 entries',lg.querySelectorAll('.paper-lg').length===4);
  // the Stages screen owns the stage breakdown; this card must not repeat it
  ck('legend does NOT repeat the stage breakdown',
     !/\bDeep\b/.test(lg.textContent)&&!/\bREM\b/.test(lg.textContent));
  ck('legend reports night structure instead',
     /Longest/.test(lg.textContent)&&/Shortest/.test(lg.textContent)&&/Wakes/.test(lg.textContent));

  // interactive
  const before=doc.getElementById('effRead').textContent;
  ck('readout starts with the whole night',/WHOLE NIGHT/.test(before));
  ax.querySelector('[data-i="1"]').click();
  const after=doc.getElementById('effRead').textContent;
  ck('tapping a wake changes the readout',after!==before&&/WOKE/.test(after));
  ck('tapping dims the other columns',doc.getElementById('effField').innerHTML.includes('opacity="0.18'));
  ax.querySelector('[data-i="0"]').click();
  ck('tapping a block reads that block',/BLOCK 1/.test(doc.getElementById('effRead').textContent));
  ax.querySelector('[data-i="0"]').click();
  ck('tapping the same column clears it',/WHOLE NIGHT/.test(doc.getElementById('effRead').textContent));

  // ---- second reference: warm card ----
  ck('warm card exists',doc.getElementById('effWarm'));
  const rows=doc.getElementById('effRows');
  ck('four leader rows',rows.querySelectorAll('.warm-r').length===4);
  ck('rows have dotted leaders',rows.querySelectorAll('.rl').length===4);
  ck('rows have icons',rows.querySelectorAll('.ri').length===4);
  ck('three staggered figures filled',
     doc.getElementById('effFig1').textContent.length>0&&
     doc.getElementById('effFig2').textContent.length>0&&
     doc.getElementById('effFig3').textContent.length>0);
  ck('middle figure is the total lost',/40/.test(doc.getElementById('effFig2').textContent));
  ck('status dot label set',doc.getElementById('effWarmSt').textContent.length>0);
  const n0=doc.getElementById('effNote').textContent;
  ck('note prompts a tap',/Tap any line/.test(n0));
  rows.querySelector('[data-w="0"]').click();
  ck('tapping a row explains that row',doc.getElementById('effNote').textContent!==n0);
  ck('tapped row is marked on',rows.querySelector('[data-w="0"]').className.indexOf('on')>=0);
  rows.querySelector('[data-w="0"]').click();
  ck('tapping again clears it',/Tap any line/.test(doc.getElementById('effNote').textContent));
  ck('action bar has two ghosts and a pill',
     doc.getElementById('effWhy')&&doc.getElementById('effTune')&&doc.getElementById('effFix'));
  ck('pill names the actual fix',/Shift bedtime|Fix the room/.test(doc.getElementById('effFixL').textContent));
  // ---- tuner (Analytic Configuration reference) ----
  ck('tuner card exists',doc.getElementById('effCfg'));
  ck('old bar chart removed',!doc.getElementById('effChart'));
  ck('two stepper rows + two slider rows',
     doc.querySelectorAll('#effCfg .cfg-step').length===2&&doc.querySelectorAll('#effCfg .cfg-pill').length===2);
  const nightEl=doc.getElementById('cfgNight');
  ck('night stepper names the latest night',nightEl.textContent==='Friday');
  ck('efficiency value matches data',doc.getElementById('cfgEff').textContent===n.eff+'%');
  doc.querySelector('#cfgNightStep [data-d="-1"]').click();
  ck('stepping back moves to Thursday',nightEl.textContent==='Thursday');
  ck('efficiency follows the night',doc.getElementById('cfgEff').textContent===window.KOVA_WEEK[3].eff+'%');
  doc.querySelector('#cfgNightStep [data-d="1"]').click();
  doc.querySelector('#cfgTgtStep [data-d="1"]').click();
  ck('target stepper raises goal to 90',/90%/.test(doc.getElementById('cfgTgt').textContent));
  const note0=doc.getElementById('cfgNote').textContent;
  ck('note reads the goal',/goal/.test(note0));
  // simulate a drag: shorter time in bed must raise projected efficiency
  const pill=doc.getElementById('cfgBedPill');
  Object.defineProperty(pill.parentNode,'getBoundingClientRect',{value:()=>({left:0,width:320})});
  pill.dispatchEvent(new window.MouseEvent('mousedown',{clientX:125,bubbles:true}));
  window.dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true}));
  const note1=doc.getElementById('cfgNote').textContent;
  ck('dragging time in bed rewrites the note',note1!==note0&&/in bed scores/.test(note1));
  const proj=+(note1.match(/scores (\d+)%/)||[])[1];
  ck('less time in bed projects higher efficiency ('+proj+'%)',proj>n.eff);
  ck('bed value shown in h/m',/\dh \d\dm/.test(doc.getElementById('cfgBed').textContent));
  doc.getElementById('cfgReset').click();
  ck('reset restores the real night',/cleared|missed/.test(doc.getElementById('cfgNote').textContent));
  ck('old vague copy gone',!doc.body.textContent.includes('Good, not great'));
  ck('repaint hook exposed',typeof window.__paintEfficiency==='function');

  let p=0,fl=0;R.forEach(([n,o])=>{console.log((o?'PASS':'FAIL')+' - '+n);o?p++:fl++;});
  console.log('\n'+p+'/'+(p+fl)+' passing · runtime errors: '+errs.length);
  errs.slice(0,4).forEach(e=>console.log('  '+e));
  process.exit(fl||errs.length?1:0);
},600);
