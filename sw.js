/* Kova service worker.

   Strategy is deliberately split, because the two kinds of request here
   have opposite requirements:

   - The app shell (index.html) is network-first. A cache-first shell is
     how a PWA gets permanently stuck on an old build: the user installs
     it once and never sees another update. Network-first means they get
     the new one whenever they have signal, and the cached copy only
     serves when they do not.

   - Static assets (icons, fonts) are cache-first. They are content-
     addressed by name and effectively immutable.

   Firebase traffic is never cached. It is realtime data with its own
   offline layer; caching it here would mean serving a stale day's food
   log from two layers deep and fighting the SDK for who is right. */

/* Push reminders (Firebase Cloud Messaging). The server sends each one
   with a title, a body and the screen to open; FCM shows it while Kova
   is closed and opens that link when tapped. Loaded in a try so an
   offline install still gets a working worker. */
try {
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
                'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: 'AIzaSyDJYGzllOsNlKu5utIaZ93cJxeLKjo64mk',
    projectId: 'kova-ee9d5',
    messagingSenderId: '861199831440',
    appId: '1:861199831440:web:f78491fbaf1135689da315'
  });
  firebase.messaging();
} catch (e) { /* no push on this install; reminders still show while Kova is open */ }

var VERSION = 'kova-v5-116';
var SHELL   = 'kova-shell-' + VERSION;
var ASSETS  = 'kova-assets-' + VERSION;
/* food and recipe photos (Unsplash): kept across versions, at most 80 */
var PHOTOS  = 'kova-photos-v1';

/* relative to where the worker lives, so the same file works at the root
   (Netlify) and under /Kova-App/ (GitHub Pages) */
var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './icon-180.png'
];
var HOME = new URL('index.html', self.registration ? self.registration.scope : self.location.href).href;

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(SHELL).then(function(c){
      /* addAll is all-or-nothing; one 404 icon would fail the whole
         install, so each is added individually and allowed to miss. */
      return Promise.all(PRECACHE.map(function(u){
        return c.add(u).catch(function(){});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if (k !== SHELL && k !== ASSETS && k !== PHOTOS) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function isFirebase(url){
  return /firebaseio\.com|googleapis\.com|gstatic\.com\/firebasejs|google-analytics\.com|googletagmanager\.com|firebasestorage/.test(url);
}

/* p31: Kova in the Android share menu (manifest share_target). What was
   shared is kept in its own cache and the app opens with ?shared=1; the
   app (src/p08_teamplus.js) reads it, offers a teammate, the team chat or
   a task, then deletes it. */
function shareIn(req){
  return req.formData().then(function(fd){
    return caches.delete('kova-share').then(function(){ return caches.open('kova-share'); }).then(function(c){
      var files = fd.getAll('files').filter(function(f){ return f && typeof f === 'object' && f.size; }).slice(0, 4);
      var meta = { title: String(fd.get('title') || ''), text: String(fd.get('text') || ''), url: String(fd.get('url') || ''), at: Date.now(),
        files: files.map(function(f){ return { name: f.name, type: f.type }; }) };
      return Promise.all([c.put('share-in/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }))]
        .concat(files.map(function(f, i){ return c.put('share-in/file/' + i, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } })); })));
    });
  }).catch(function(){ /* keep going: the app opens either way */ })
    .then(function(){ return Response.redirect('./index.html?shared=1', 303); });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method === 'POST' && /\/share-in$/.test(new URL(req.url).pathname)) { e.respondWith(shareIn(req)); return; }
  if (req.method !== 'GET') return;

  var url = req.url;

  /* Realtime data, auth, analytics: always straight to network. */
  if (isFirebase(url)) return;

  /* The Kova api (same site since the move to Netlify), booking pages and the privacy
     page are live: never from cache. */
  /* /__/ is Google sign-in coming back (Firebase's pages, proxied by vercel.json):
     never cached, and never saved as the app */
  if (/\/api\/|\/__\/|\/\.netlify\/|\/privacy(\.html)?$|\/book(\.html|\/)/.test(new URL(url).pathname)) return;
  /* p37: which version is newest - always asked fresh */
  if (/\/version\.json$/.test(new URL(url).pathname)) return;

  /* Navigations and the shell: network-first, cache as fallback. */
  if (req.mode === 'navigate' || /\/index\.html$/.test(url) || url.endsWith('/')) {
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(SHELL).then(function(c){ c.put(HOME, copy); });
        return res;
      }).catch(function(){
        return caches.match(HOME).then(function(hit){
          return hit || new Response('<h1>Offline</h1><p>Open Kova once with a connection to install it.</p>',
            { headers: { 'Content-Type': 'text/html' } });
        });
      })
    );
    return;
  }

  /* Food and recipe photos (p28: Kova's own copies in /food/, no longer
     Unsplash's): kept after the first look, served from that copy next time
     and offline; offline with no copy, a plain placeholder instead of a
     broken image. */
  if (/\/food\/photo-[0-9a-f-]+-(s400|s800|full)\.webp$/.test(new URL(url).pathname)) {
    e.respondWith(
      caches.open(PHOTOS).then(function(c){
        return c.match(url).then(function(hit){
          if (hit) return hit;
          return fetch(req).then(function(res){
            if (res && res.ok) {
              c.put(url, res.clone());
              c.keys().then(function(ks){ if (ks.length > 80) c.delete(ks[0]); });
            }
            return res;
          }).catch(function(){ return fetch(req).catch(function(){ return photoStandIn(); }); });
        });
      })
    );
    return;
  }

  /* Everything else: cache-first, fill on miss. */
  e.respondWith(
    caches.match(req).then(function(hit){
      if (hit) return hit;
      return fetch(req).then(function(res){
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(ASSETS).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return hit; });
    })
  );
});

function photoStandIn(){
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#2A2B2F"/>'
    + '<path d="M150 230l40-48 32 38 22-26 56 66H120z" fill="#55575E"/><circle cx="255" cy="150" r="18" fill="#55575E"/></svg>';
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
}

/* Lets the page force an update without the user reinstalling. */
self.addEventListener('message', function(e){
  if (e.data === 'skipWaiting') self.skipWaiting();
});
