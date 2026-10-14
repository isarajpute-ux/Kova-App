/* p30: moved out of the first download (index.html) - nothing uploads
   before the first screen, and every caller checks window.KovaMedia. */
/* =================================================================
   KovaMedia - file storage for the things that are not JSON:
   form-check videos, food photos, machine/equipment scans, avatars.
   These are far too big for the realtime db, which is why they get
   their own path and why only the resulting URL goes in the store.

   Files go to the Kova api (/media/upload, Netlify Blobs on the free
   plan) in 3 MB parts, because a function takes at most 6 MB per
   request. Firebase Storage needs the paid Blaze plan since Feb 2026,
   so it is no longer used.
   ================================================================= */
window.KovaMedia = (function(){
  function uid(){
    try { return (KOVA_FB.auth && KOVA_FB.auth.currentUser && KOVA_FB.auth.currentUser.uid) || null; }
    catch(e){ return null; }
  }
  /* Blob | File | dataURL -> Blob, since the camera module hands back a
     data URL and the file inputs hand back a File. */
  function toBlob(x){
    if (x instanceof Blob) return Promise.resolve(x);
    if (typeof x === 'string' && x.indexOf('data:') === 0) {
      return fetch(x).then(function(r){ return r.blob(); });
    }
    return Promise.reject(new Error('unsupported media type'));
  }
  return {
    /* kind: 'form' | 'food' | 'machine' | 'avatar' | 'doc' | 'post' | 'lab' */
    CHUNK: 3 * 1024 * 1024,
    MAX: 120 * 1024 * 1024,
    upload: function(kind, data, name, onProgress){
      var self = this;
      if (!window.KovaLink) return Promise.reject(new Error('storage unavailable'));
      return toBlob(data).then(function(blob){
        if (blob.size > self.MAX) throw new Error('That file is over 120 MB.');
        var ext  = (name && name.indexOf('.') > 0) ? name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)
                 : (blob.type.indexOf('video') === 0 ? 'mp4' : 'jpg');
        if (ext.length < 2) ext = 'bin';
        var id = Date.now() + '' + Math.floor(Math.random()*1000);
        var n = Math.max(1, Math.ceil(blob.size / self.CHUNK)), sent = 0;
        function put(i){
          var part = blob.slice(i * self.CHUNK, Math.min(blob.size, (i + 1) * self.CHUNK));
          var q = '/media/upload?kind=' + encodeURIComponent(kind) + '&id=' + id + '&ext=' + ext +
                  '&i=' + i + '&n=' + n + '&type=' + encodeURIComponent(blob.type || '');
          function go(tries){
            return KovaLink.authFetch(q, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: part })
              .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){
                if (!r.ok) { var er = new Error(j.error || ('upload failed (' + r.status + ')')); er.status = r.status; throw er; }
                return j;
              }); })
              /* one retry per part: a phone on gym wifi drops the odd request */
              .catch(function(e){ if (tries < 1 && !(e.status >= 400 && e.status < 500 && e.status !== 409 && e.status !== 429)) return go(tries + 1); throw e; });
          }
          return go(0).then(function(j){ sent++; if (onProgress) onProgress(sent / n); return j; });
        }
        /* every part but the last goes up three at a time (it used to be one
           after another); the last one goes alone, since it checks the rest */
        var next = 0;
        function lane(){ if (next >= n - 1) return Promise.resolve(); var k = next++; return put(k).then(lane); }
        var lanes = []; for (var L = 0; L < Math.min(3, n - 1); L++) lanes.push(lane());
        return Promise.all(lanes).then(function(){ return put(n - 1); }).then(function(j){
          KovaAnalytics.track('media_upload', { kind: kind, bytes: blob.size });
          return { url: j.url, path: j.path, bytes: j.bytes || blob.size, type: blob.type };
        });
      });
    },
    /* attach() is what the capture points actually call.

       Rules it follows, because media upload must never be allowed to
       break the feature it belongs to:
         - it NEVER blocks. Form-check analysis, machine ident and food
           logging all run locally and are already done by the time this
           starts; the upload rides along behind them.
         - a failure is reported once, quietly, and the local result is
           untouched. Being offline in a gym is the normal case here,
           not the exception.
         - every successful upload is indexed in KP under 'media', which
           rides the existing sync layer - so the LIST of your clips
           reaches your other devices even before the files are opened
           there.

       kind: 'form' | 'food' | 'machine' | 'avatar' | 'doc' */
    attach: function(kind, data, opts){
      opts = opts || {};
      var self = this;
      var label = opts.name || (kind + ' file');

      /* Signed out or backend down: say so once, do not pretend. A
         silent no-op here is how someone loses a month of clips and
         only finds out when they change phone. */
      var u = null;
      try { u = KOVA_FB.auth && KOVA_FB.auth.currentUser; } catch(e){}
      if (!u || !window.KovaLink) {
        if (opts.onState) opts.onState('local', 'Saved on this device only');
        return Promise.resolve(null);
      }

      if (opts.onState) opts.onState('uploading', 'Uploading\u2026');

      return this.upload(kind, data, opts.name, function(frac){
        if (opts.onState) opts.onState('uploading',
          'Uploading ' + Math.round(frac * 100) + '%');
      }).then(function(res){
        /* index it so it is findable later and syncs as data */
        try {
          var idx = (window.KP && KP.get('media')) || [];
          idx.push({
            kind: kind, url: res.url, path: res.path,
            name: label, at: Date.now(), bytes: res.bytes, ref: opts.ref || null
          });
          /* cap the index, not the bucket - the files stay, only the
             local list is trimmed so the synced key cannot grow forever */
          if (idx.length > 300) idx = idx.slice(-300);
          if (window.KP) KP.set('media', idx);
        } catch(e){}
        if (opts.onState) opts.onState('done', 'Backed up');
        if (opts.onDone) opts.onDone(res);
        return res;
      }).catch(function(e){
        if (opts.onState) opts.onState('error',
          /network/i.test(e.message) ? 'No connection \u00b7 saved on this device'
                                     : 'Upload failed \u00b7 saved on this device');
        return null;
      });
    },
    /* everything indexed locally, newest first - cheaper than listAll()
       and works offline because it reads the synced KP index */
    indexed: function(kind){
      var idx = [];
      try { idx = (window.KP && KP.get('media')) || []; } catch(e){}
      return idx.filter(function(m){ return !kind || m.kind === kind; }).reverse();
    },
    remove: function(path){
      if (!window.KovaLink) return Promise.reject(new Error('storage unavailable'));
      return KovaLink.authFetch('/media/remove', { json: { path: path } }).then(function(r){
        if (!r.ok) throw new Error('Could not delete that file (' + r.status + ').');
        try {
          var idx = (window.KP && KP.get('media')) || [];
          if (window.KP) KP.set('media', idx.filter(function(m){ return m.path !== path; }));
        } catch(e){}
      });
    },
    /* everything this user has uploaded of one kind, newest first -
       from the synced index, which every upload writes */
    list: function(kind){
      return Promise.resolve(this.indexed(kind).map(function(m){ return { url: m.url, path: m.path }; }));
    }
  };
})();
