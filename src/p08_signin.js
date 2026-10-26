/* =====================================================================
   KovaSignIn - the email and password screen (p18).

   Before this one form did two jobs: "Sign in" and "Create account" read
   the same two boxes, there was no way to see the password, no second
   box to catch a typo in a new one, and a wrong password only ever said
   "do not match". Now:
     - two clear modes, Sign in and Create account, and a third for a
       forgotten password;
     - the email box has autocorrect, autocapitalise and spellcheck off,
       cleans spaces and capitals, offers "Did you mean ...@gmail.com?",
       and every message names the exact address it used;
     - Show / Hide on the password, a Caps Lock warning, and for a new
       account the rules ticked off as you type plus a second box that
       has to match;
     - errors say what to do next, with the button for it: Reset
       password, Create an account, Sign in instead.
   Firebase (KovaCloudAuth, index.html) still does the signing in; this
   only draws the screen and checks what can be checked before sending.
   Dark, soft light and light glass.
   ===================================================================== */
window.KovaSignIn=(function(){
  'use strict';
  var M='in', ACT=[];
  var DOMAINS=['gmail.com','icloud.com','outlook.com','hotmail.com','yahoo.com','live.com','me.com','aol.com','proton.me','protonmail.com','msn.com'];
  function $(id){ return document.getElementById(id); }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function clean(v){ return String(v||'').replace(/\s+/g,'').toLowerCase(); }
  function valid(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function dist(a,b){
    var m=a.length,n=b.length,d=[],i,j; for(i=0;i<=m;i++) d[i]=[i]; for(j=0;j<=n;j++) d[0][j]=j;
    for(i=1;i<=m;i++) for(j=1;j<=n;j++) d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    return d[m][n];
  }
  /* a misspelt common domain: gmial.com, gmail.con, hotmial.com */
  function suggest(v){
    v=clean(v); var at=v.lastIndexOf('@'); if(at<1) return '';
    var dom=v.slice(at+1).replace(/\.(con|cpm|comm|cm|vom|om)$/,'.com');
    if(DOMAINS.indexOf(dom)>=0) return dom!==v.slice(at+1)?v.slice(0,at+1)+dom:'';
    var best='',bd=3; DOMAINS.forEach(function(d){ var x=dist(dom,d); if(x<bd){ bd=x; best=d; } });
    return best&&bd<=2?v.slice(0,at+1)+best:'';
  }
  function rules(pw){ return {len:pw.length>=8, mix:/[a-z]/i.test(pw)&&/\d/.test(pw)}; }

  var TITLES={in:'Welcome back',up:'Create your account',reset:'Reset your password'};
  var SUBS={in:'Sign in to sync your health and work across your devices.',up:'One account for every device. Your data syncs only to it.',reset:'We will email you a link to choose a new password.'};
  var GO={in:'Sign in',up:'Create account',reset:'Send reset link'};

  function render(mode,email){
    var root=$('ksiRoot'); if(!root) return;
    if(mode) M=mode;
    var keep=email!=null?email:(($('kova-email')||{}).value||'');
    var pw=M!=='reset';
    root.innerHTML='<div class="ksi-brand">Kova</div>'
      +'<div class="ksi-card" role="form" aria-labelledby="ksiH">'
      +(M!=='reset'?'<div class="ksi-seg" role="tablist" aria-label="Sign in or create an account">'
        +'<button type="button" role="tab" data-m="in" aria-selected="'+(M==='in')+'"'+(M==='in'?' class="on"':'')+'>Sign in</button>'
        +'<button type="button" role="tab" data-m="up" aria-selected="'+(M==='up')+'"'+(M==='up'?' class="on"':'')+'>Create account</button></div>':'')
      +'<div class="ksi-h" id="ksiH">'+TITLES[M]+'</div><div class="ksi-sub">'+SUBS[M]+'</div>'
      +'<label class="ksi-l" for="kova-email">Email</label>'
      +'<input class="ksi-in" id="kova-email" type="email" inputmode="email" autocomplete="'+(M==='up'?'email':'username')+'" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="you@example.com" value="'+esc(keep)+'"/>'
      +'<div class="ksi-tip" id="ksiTip" aria-live="polite"></div>'
      +(pw?'<label class="ksi-l" for="kova-password">'+(M==='up'?'Choose a password':'Password')+'</label>'
        +'<div class="ksi-pw"><input class="ksi-in" id="kova-password" type="password" autocomplete="'+(M==='up'?'new-password':'current-password')+'" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="'+(M==='up'?'8 or more characters':'Your password')+'"/>'
        +'<button type="button" class="ksi-eye" id="ksiEye" aria-pressed="false" aria-controls="kova-password">Show</button></div>'
        +'<div class="ksi-caps" id="ksiCaps" hidden>Caps Lock is on</div>':'')
      +(M==='up'?'<ul class="ksi-rules" id="ksiRules"><li data-r="len">8 or more characters</li><li data-r="mix">A letter and a number</li></ul>'
        +'<label class="ksi-l" for="kova-password2">Type it again</label>'
        +'<input class="ksi-in" id="kova-password2" type="password" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="The same password"/>'
        +'<div class="ksi-match" id="ksiMatch" aria-live="polite"></div>':'')
      +'<div class="ksi-msg" id="kova-auth-err" role="alert" hidden></div>'
      +'<button type="button" class="ksi-go" id="kova-auth-go">'+GO[M]+'</button>'
      +(M==='in'?'<button type="button" class="ksi-link" data-m="reset">Forgot password?</button>':'')
      +(M==='reset'?'<button type="button" class="ksi-link" data-m="in">Back to sign in</button>':'')
      +(M!=='reset'?'<div class="ksi-or"><span>or</span></div>'
        +'<button type="button" class="ksi-alt" data-k="google"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>Continue with Google</button>':'')
      +'<button type="button" class="ksi-skip" data-k="skip">Skip for now</button>'
      +'</div>'
      +'<div class="ksi-note">Your data syncs only to your own account. Skipping keeps everything on this device.<br/>By continuing you agree to the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and the <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</div>';
    wire();
    check(false);
  }

  function wire(){
    var root=$('ksiRoot'), em=$('kova-email'), pw=$('kova-password'), p2=$('kova-password2');
    root.onclick=function(e){
      var m=e.target.closest('[data-m]'); if(m){ render(m.getAttribute('data-m')); var f=$(m.getAttribute('data-m')==='reset'?'kova-email':'kova-password'); if(f&&$('kova-email').value) f.focus(); else $('kova-email').focus(); return; }
      var a=e.target.closest('[data-act]'); if(a&&ACT[+a.getAttribute('data-act')]) ACT[+a.getAttribute('data-act')]();
      var k=e.target.closest('[data-k]'); if(k&&window.KovaCloudAuth){ if(k.getAttribute('data-k')==='google') KovaCloudAuth.google(); else KovaCloudAuth.guest(); }
    };
    $('kova-auth-go').onclick=submit;
    em.oninput=function(){ check(false); };
    em.onblur=function(){ check(true); };
    [em,pw,p2].forEach(function(x){ if(x) x.addEventListener('keydown',function(e){
      if(e.getModifierState) $('ksiCaps')&&( $('ksiCaps').hidden=!(e.getModifierState('CapsLock')&&x!==em) );
      if(e.key==='Enter'){ e.preventDefault(); submit(); }
    }); });
    if(pw) pw.oninput=function(){ live(); };
    if(p2) p2.oninput=function(){ live(); };
    var eye=$('ksiEye');
    if(eye) eye.onclick=function(){
      var show=pw.type==='password';
      [pw,p2].forEach(function(x){ if(x) x.type=show?'text':'password'; });
      eye.textContent=show?'Hide':'Show'; eye.setAttribute('aria-pressed',String(show));
    };
  }
  /* the email: tidy, suggest, and only after leaving the box, say what is missing */
  function check(final){
    var em=$('kova-email'), tip=$('ksiTip'); if(!em||!tip) return;
    var v=clean(em.value), sg=v?suggest(v):'';
    if(sg){ tip.className='ksi-tip on'; tip.innerHTML='Did you mean <button type="button" class="ksi-fix" id="ksiFix">'+esc(sg)+'</button>?';
      $('ksiFix').onmousedown=function(e){ e.preventDefault(); };
      $('ksiFix').onclick=function(){ em.value=sg; check(false); var p=$('kova-password'); (p||em).focus(); }; return; }
    if(final&&v&&!valid(v)){ tip.className='ksi-tip on'; tip.textContent=v.indexOf('@')<0?'That needs an @, like name@gmail.com.':'That address looks unfinished, like name@gmail.com.'; return; }
    tip.className='ksi-tip'; tip.textContent='';
  }
  function live(){
    var pw=($('kova-password')||{}).value||'', r=rules(pw), ul=$('ksiRules');
    if(ul) [].forEach.call(ul.children,function(li){ li.classList.toggle('ok',!!r[li.getAttribute('data-r')]); });
    var p2=$('kova-password2'), m=$('ksiMatch');
    if(p2&&m){
      if(!p2.value){ m.className='ksi-match'; m.textContent=''; }
      else if(p2.value===pw){ m.className='ksi-match ok'; m.textContent='Passwords match'; }
      else if(pw.indexOf(p2.value)===0){ m.className='ksi-match'; m.textContent=''; }
      else { m.className='ksi-match bad'; m.textContent='These do not match yet'; }
    }
    error('');
  }
  function submit(){
    var go=$('kova-auth-go'); if(go&&go.disabled) return;
    var em=$('kova-email'), email=clean(em&&em.value);
    if(em) em.value=email;
    if(!email) return error('Type your email first.'), em&&em.focus();
    if(!valid(email)) return error('That email looks unfinished: it needs an @ and a domain, like name@gmail.com.'), em.focus();
    if(!window.KovaCloudAuth) return error('Sign-in is not available here.');
    if(M==='reset') return KovaCloudAuth.reset(email);
    var pw=($('kova-password')||{}).value||'';
    if(!pw) return error(M==='up'?'Choose a password.':'Type your password.'), $('kova-password').focus();
    if(M==='up'){
      var r=rules(pw);
      if(!r.len||!r.mix) return error('Make the password 8 or more characters, with a letter and a number.'), $('kova-password').focus();
      if(pw!==($('kova-password2')||{}).value) return error('The two passwords do not match. Type it again in the second box.'), $('kova-password2').focus();
      return KovaCloudAuth.signUp(email,pw);
    }
    KovaCloudAuth.signIn(email,pw);
  }
  /* a message, and the buttons that act on it: [['Reset password', fn], ...] */
  function error(msg,actions,tone){
    var el=$('kova-auth-err'); if(!el) return;
    ACT=(actions||[]).map(function(a){ return a[1]; });
    if(!msg){ el.hidden=true; el.innerHTML=''; return; }
    el.hidden=false; el.className='ksi-msg'+(tone?' '+tone:'');
    el.innerHTML='<span>'+esc(msg)+'</span>'+(actions&&actions.length?'<span class="ksi-acts">'+actions.map(function(a,i){ return '<button type="button" data-act="'+i+'">'+esc(a[0])+'</button>'; }).join('')+'</span>':'');
  }
  function busy(on,label){
    var b=$('kova-auth-go'); if(!b) return;
    b.disabled=!!on; b.classList.toggle('busy',!!on); b.textContent=on?(label||'Working…'):GO[M];
  }
  return {render:render,mode:function(){ return M; },error:error,busy:busy,suggest:suggest,clean:clean,rules:rules};
})();
