/* =====================================================================
   KovaLabs - lab results (p11). Vitals > Lab results.

   Upload a lab PDF or a photo of the printout:
     - a PDF's text is read on this phone (pdf.js) and the plain
       "Name value unit low-high" lines are parsed here;
     - a photo, or a report the phone cannot parse, goes to
       /api/labs/extract, which returns only the rows printed on it;
     - you confirm every row before anything is saved.
   Then each marker gets its own trend over time, the lab's reference
   range, and a link to the part of Kova it touches: ferritin, iron,
   hemoglobin and B12 -> fatigue and training; vitamin D -> sleep;
   cholesterol, triglycerides, glucose and HbA1c -> food.

   Kova never diagnoses. A value outside the lab's range is flagged in
   plain words ("outside the lab's range; worth discussing with your
   clinician"), never named as a condition. Stays on this device.
   ===================================================================== */
window.KovaLabs=(function(){
  'use strict';
  var KEY='kova_labs_v1';
  var D=lsJ(KEY,{results:[]});
  function lsJ(k,d){ try{ var v=JSON.parse(localStorage.getItem(k)||'null'); return v==null?d:v; }catch(e){ return d; } }
  function save(){ try{ localStorage.setItem(KEY,JSON.stringify(D)); }catch(e){} }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function say(m){ try{ if(window.toast) toast(m); }catch(e){} }
  function today(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }

  /* names people see on reports -> one key per marker */
  var KEYS=[
    ['ferritin',/ferritin/i,'Ferritin'],['b12',/b\s*-?12|cobalamin/i,'Vitamin B12'],['vitd',/vitamin\s*d|25[\s-]*(oh|hydroxy)/i,'Vitamin D'],
    ['iron',/^(serum\s+)?iron\b/i,'Iron'],['hgb',/h(a)?emoglobin(?!\s*a1c)|\bhgb\b|\bhb\b/i,'Hemoglobin'],['hba1c',/a1c|glycated/i,'HbA1c'],
    ['glucose',/glucose/i,'Glucose'],['ldl',/\bldl\b/i,'LDL cholesterol'],['hdl',/\bhdl\b/i,'HDL cholesterol'],['trig',/triglycer/i,'Triglycerides'],
    ['chol',/(total\s+)?cholesterol/i,'Total cholesterol'],['tsh',/\btsh\b|thyroid stimulating/i,'TSH'],['crp',/\bc[\s-]*reactive|\bcrp\b|hs-?crp/i,'CRP'],
    ['testo',/testosterone/i,'Testosterone'],['cortisol',/cortisol/i,'Cortisol'],['magnesium',/magnesium/i,'Magnesium'],['folate',/folate|folic/i,'Folate'],
    ['creat',/creatinine/i,'Creatinine'],['alt',/\balt\b|alanine/i,'ALT'],['ast',/\bast\b|aspartate/i,'AST']
  ];
  function keyOf(name){ for(var i=0;i<KEYS.length;i++) if(KEYS[i][1].test(name)) return KEYS[i][0]; return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').slice(0,30); }
  function label(k,fallback){ var r=KEYS.filter(function(x){ return x[0]===k; })[0]; return r?r[2]:fallback; }
  var LINKS={
    ferritin:{go:'move',t:'Low iron stores are a common reason training feels harder and recovery slower. Kova’s readiness and training advice read better next to this.'},
    iron:{go:'move',t:'Iron carries oxygen to working muscle; it sits next to how your sessions feel.'},
    hgb:{go:'move',t:'Hemoglobin carries oxygen; it sits next to your training and fatigue.'},
    b12:{go:'move',t:'B12 is linked to energy and fatigue; it sits next to your training and readiness.'},
    vitd:{go:'sleep',t:'Vitamin D has been linked with sleep quality and mood; it sits next to your sleep.'},
    ldl:{go:'fuel',t:'Blood lipids move with what you eat; Fuel is where that shows.'},hdl:{go:'fuel',t:'Blood lipids move with what you eat; Fuel is where that shows.'},
    trig:{go:'fuel',t:'Triglycerides respond to food, especially sugar and alcohol; Fuel is where that shows.'},chol:{go:'fuel',t:'Blood lipids move with what you eat; Fuel is where that shows.'},
    glucose:{go:'fuel',t:'Glucose responds to food, sleep and training; Fuel and Sleep are where that shows.'},hba1c:{go:'fuel',t:'HbA1c reflects about three months of glucose; food, sleep and training all move it.'},
    tsh:{go:'vitals',t:'Thyroid hormones affect energy and heart rate; it sits next to your vitals.'},crp:{go:'vitals',t:'CRP rises with inflammation, including after hard training or illness; it sits next to your recovery.'}
  };

  /* ---------------- reading a report ---------------- */
  var LINE=/^\s*([A-Za-z][A-Za-z0-9 ,()\/%.\-]{1,48}?)\s*[:\s]\s*([<>]=?)?\s*(\d+(?:\.\d+)?)(?![\d.]*-[A-Za-z])\s*([A-Za-zµμ%\/0-9.^*]{1,14})?\s*(?:\(?\s*(?:ref(?:erence)?\s*(?:range)?\s*:?\s*)?(\d+(?:\.\d+)?)\s*[-–—to]+\s*(\d+(?:\.\d+)?)\s*\)?)?/i;
  function reportDate(text){
    var m=/(collect(?:ed|ion)?|drawn|date)[^0-9]{0,20}(\d{4})-(\d{2})-(\d{2})/i.exec(text); if(m) return m[2]+'-'+m[3]+'-'+m[4];
    m=/(collect(?:ed|ion)?|drawn|date)[^0-9]{0,20}(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(text); if(m) return m[4]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[3]).slice(-2);
    return null;
  }
  function parseText(text){
    var date=reportDate(text)||today(), rows=[], seen={};
    String(text||'').split(/\n/).forEach(function(line){
      var m=LINE.exec(line); if(!m) return;
      var name=m[1].trim().replace(/[\s:.,]+$/,''), k=keyOf(name);
      if(!KEYS.some(function(x){ return x[0]===k; })) return;     /* only markers Kova knows, so page furniture is not read as results */
      if(seen[k]) return; seen[k]=1;
      rows.push({name:label(k,name),key:k,value:+m[3],qualifier:m[2]||null,unit:(m[4]||'').replace(/^\W+$/,''),low:m[5]!=null?+m[5]:null,high:m[6]!=null?+m[6]:null,date:date});
    });
    return rows;
  }
  function pdfText(file){
    var load=window.KovaPdf?window.KovaPdf():(window.pdfjsLib?Promise.resolve(window.pdfjsLib):Promise.reject(new Error('The PDF reader is not loaded.')));
    return Promise.all([load,file.arrayBuffer()]).then(function(r){ return r[0].getDocument({data:r[1]}).promise; }).then(function(pdf){
      var jobs=[]; for(var i=1;i<=Math.min(pdf.numPages,12);i++) jobs.push(pdf.getPage(i).then(function(p){ return p.getTextContent(); }).then(function(c){
        /* rebuild lines from positions: items on the same baseline join */
        var lines={}; c.items.forEach(function(it){ var y=Math.round(it.transform[5]); (lines[y]=lines[y]||[]).push(it); });
        return Object.keys(lines).sort(function(a,b){ return b-a; }).map(function(y){ return lines[y].sort(function(a,b){ return a.transform[4]-b.transform[4]; }).map(function(i){ return i.str; }).join(' '); }).join('\n');
      }));
      return Promise.all(jobs).then(function(p){ return p.join('\n'); });
    });
  }
  function viaServer(body){
    if(!window.KovaLink) return Promise.reject(new Error('The Kova server is not available.'));
    return KovaLink.authFetch('/labs/extract',{json:body}).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){
      if(!r.ok){ var e=new Error(r.status===402?'Reading photos of reports is part of Kova Pro. A PDF with text is read on your phone for free.':(j.error||'The report could not be read.')); e.status=r.status; throw e; }
      return (j.rows||[]).map(function(x){ var k=keyOf(x.name); return {name:KEYS.some(function(y){ return y[0]===k; })?label(k,x.name):x.name,key:k,value:x.value,qualifier:x.qualifier,unit:x.unit,low:x.low,high:x.high,date:x.date||today()}; });
    }); },function(){ throw new Error('The Kova server could not be reached.'); });
  }
  function toJpeg(file){
    return new Promise(function(ok,no){ var fr=new FileReader(); fr.onload=function(){ ok(String(fr.result)); }; fr.onerror=no; fr.readAsDataURL(file); });
  }
  function read(file){
    if(/pdf$/i.test(file.type)||/\.pdf$/i.test(file.name)){
      return pdfText(file).then(function(t){
        var rows=parseText(t);
        if(rows.length>=3) return {rows:rows,how:'phone'};
        return viaServer({text:t}).then(function(r){ return {rows:r,how:'server'}; },function(e){ if(rows.length) return {rows:rows,how:'phone',note:e.message}; throw e; });
      });
    }
    return toJpeg(file).then(function(d){ return viaServer({image:d.slice(d.indexOf(',')+1),mime:file.type||'image/jpeg'}); }).then(function(r){ return {rows:r,how:'server'}; });
  }

  /* ---------------- confirm, then save ---------------- */
  function confirmRows(res){
    if(!window.openSheet) return;
    var rows=res.rows;
    if(!rows.length){ say('No lab results were found in that file.'); return; }
    openSheet('<div class="grab"></div><div class="klb">'
      +'<div class="title-s" style="font-size:19px">Check these '+rows.length+' results</div>'
      +'<div class="sub" style="line-height:1.5;margin:4px 0 10px">'+(res.how==='phone'?'Read on this phone from the PDF.':'Read from the report.')+' Fix anything that is off and untick anything that is not yours. Nothing is saved until you confirm.'+(res.note?' '+esc(res.note):'')+'</div>'
      +'<div class="klb-rows">'+rows.map(function(r,i){
        return '<div class="klb-r" data-i="'+i+'"><label class="klb-ok"><input type="checkbox" checked aria-label="Keep '+esc(r.name)+'"></label>'
          +'<input class="klb-n" value="'+esc(r.name)+'" aria-label="Test name">'
          +'<input class="klb-v" type="number" step="any" value="'+r.value+'" aria-label="Result">'
          +'<input class="klb-u" value="'+esc(r.unit)+'" aria-label="Unit">'
          +'<input class="klb-lo" type="number" step="any" value="'+(r.low==null?'':r.low)+'" placeholder="low" aria-label="Range low">'
          +'<input class="klb-hi" type="number" step="any" value="'+(r.high==null?'':r.high)+'" placeholder="high" aria-label="Range high">'
          +'<input class="klb-d" type="date" value="'+esc(r.date)+'" aria-label="Date"></div>';
      }).join('')+'</div>'
      +'<button class="btn" data-l="save" style="margin-top:12px">Save results</button></div>');
    var el=document.querySelector('#sheetIn .klb');
    el.addEventListener('click',function(ev){
      if(!ev.target.closest('[data-l="save"]')) return;
      var n=0;
      el.querySelectorAll('.klb-r').forEach(function(row){
        if(!row.querySelector('.klb-ok input').checked) return;
        var g=function(c){ return row.querySelector(c).value; }, v=+g('.klb-v');
        if(!isFinite(v)||g('.klb-v')==='') return;
        var name=g('.klb-n').trim(), k=keyOf(name), date=g('.klb-d')||today(), r0=rows[+row.dataset.i];
        var lo=g('.klb-lo'), hi=g('.klb-hi');
        /* the same marker on the same date is replaced, not doubled */
        D.results=D.results.filter(function(x){ return !(x.key===k&&x.date===date); });
        D.results.push({id:k+':'+date,key:k,name:name,value:v,qualifier:r0.qualifier||null,unit:g('.klb-u').trim(),low:lo===''?null:+lo,high:hi===''?null:+hi,date:date,at:Date.now()});
        n++;
      });
      save(); card();
      if(window.closeSheet) closeSheet();
      say('Saved '+n+' result'+(n===1?'':'s')+'.');
      try{ if(window.KovaAnalytics) KovaAnalytics.track('labs_saved',{count:n}); }catch(e){}
      open();
    });
  }

  /* ---------------- markers and trends ---------------- */
  function markers(){
    var by={};
    D.results.forEach(function(r){ (by[r.key]=by[r.key]||[]).push(r); });
    return Object.keys(by).map(function(k){
      var L=by[k].sort(function(a,b){ return a.date<b.date?-1:1; }), last=L[L.length-1];
      var out=last.low!=null&&last.value<last.low?'below':(last.high!=null&&last.value>last.high?'above':'');
      return {key:k,name:label(k,last.name),list:L,last:last,out:out,link:LINKS[k]||null};
    }).sort(function(a,b){ return (b.out?1:0)-(a.out?1:0)||(a.name<b.name?-1:1); });
  }
  function spark(L){
    if(L.length<2) return '';
    var vs=L.map(function(r){ return r.value; }), lo=Math.min.apply(null,vs), hi=Math.max.apply(null,vs), span=hi-lo||1;
    var pts=L.map(function(r,i){ return (4+i*(112/(L.length-1))).toFixed(1)+','+(26-((r.value-lo)/span)*20).toFixed(1); }).join(' ');
    return '<svg class="klb-sp" viewBox="0 0 120 30" aria-hidden="true"><polyline points="'+pts+'"/></svg>';
  }
  function rangeBar(r){
    if(r.low==null&&r.high==null) return '';
    var lo=r.low!=null?r.low:0, hi=r.high!=null?r.high:r.value*1.5||1, a=Math.min(lo,r.value), b=Math.max(hi,r.value), span=(b-a)||1;
    var x=(r.value-a)/span*100, l=(lo-a)/span*100, w=(hi-lo)/span*100;
    return '<div class="klb-rb" aria-hidden="true"><i class="klb-rng" style="left:'+l.toFixed(1)+'%;width:'+w.toFixed(1)+'%"></i><b style="left:'+x.toFixed(1)+'%"></b></div>';
  }
  function open(){
    if(!window.openSheet) return;
    var M=markers();
    openSheet('<div class="grab"></div><div class="klb">'
      +'<div class="title-s" style="font-size:19px">Lab results</div>'
      +'<label class="klb-up">Upload a lab PDF or a photo<input type="file" accept="application/pdf,image/*" hidden id="klbFile"></label>'
      +'<div class="klb-msg" id="klbMsg" role="status"></div>'
      +(M.length?M.map(function(m){
        var r=m.last;
        return '<div class="klb-m'+(m.out?' out':'')+'"><div class="klb-mh"><b>'+esc(m.name)+'</b><span>'+(r.qualifier||'')+r.value+' '+esc(r.unit)+'</span></div>'
          +rangeBar(r)
          +'<div class="klb-meta">'+(r.low!=null||r.high!=null?'Lab range '+(r.low!=null?r.low:'')+'–'+(r.high!=null?r.high:'')+' '+esc(r.unit)+' · ':'')+esc(r.date)+(m.list.length>1?' · '+m.list.length+' results':'')+'</div>'
          +spark(m.list)
          +(m.out?'<div class="klb-flag">'+(m.out==='below'?'Below':'Above')+' the lab’s range. Worth discussing with your clinician.</div>':'')
          +(m.link?'<button class="klb-link" data-go2="'+m.link.go+'">'+esc(m.link.t)+'</button>':'')+'</div>';
      }).join(''):'<div class="sub" style="line-height:1.5;margin:10px 0">No results yet. Upload a report and each marker gets its own trend.</div>')
      +'<div class="klb-disc">Kova does not diagnose. Reference ranges are the lab’s; what a result means for you is a conversation with your clinician.</div></div>');
    var el=document.querySelector('#sheetIn .klb');
    el.querySelector('#klbFile').addEventListener('change',function(){
      var f=this.files&&this.files[0]; if(!f) return;
      var msg=document.getElementById('klbMsg'); msg.textContent='Reading '+f.name+'…'; msg.classList.remove('bad');
      read(f).then(confirmRows,function(e){ msg.textContent=e.message; msg.classList.add('bad'); });
      this.value='';
    });
    el.addEventListener('click',function(ev){ var b=ev.target.closest('[data-go2]'); if(b){ if(window.closeSheet) closeSheet(); try{ go(b.getAttribute('data-go2')); }catch(e){} } });
  }
  function card(){
    var v=document.getElementById('s-vitals'); if(!v) return;
    var c=document.getElementById('klbCard');
    if(!c){ c=document.createElement('button'); c.id='klbCard'; c.className='card klb-card'; v.appendChild(c); c.addEventListener('click',open); }
    var M=markers(), out=M.filter(function(m){ return m.out; }).length;
    c.innerHTML='<span class="li-name">Lab results</span><span class="li-sub">'+(M.length?M.length+' marker'+(M.length===1?'':'s')+(out?' · '+out+' outside the lab’s range':'')+' · trends over time':'Upload a lab PDF or photo; each marker gets a trend')+'</span>';
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',card); else setTimeout(card,0);

  return {parseText:parseText,keyOf:keyOf,markers:markers,read:read,confirmRows:confirmRows,open:open,card:card,_D:function(){ return D; },LINKS:LINKS};
})();
