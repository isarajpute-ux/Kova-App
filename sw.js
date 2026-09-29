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

var VERSION = 'kova-v5-112';
var SHELL   = 'kova-shell-' + VERSION;
var ASSETS  = 'kova-assets-' + VERSION;

var PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/icon-180.png'
];

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
        if (k !== SHELL && k !== ASSETS) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function isFirebase(url){
  return /firebaseio\.com|googleapis\.com|gstatic\.com\/firebasejs|google-analytics\.com|googletagmanager\.com|firebasestorage/.test(url);
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = req.url;

  /* Realtime data, auth, analytics: always straight to network. */
  if (isFirebase(url)) return;

  /* The Kova api (same site since the move to Netlify) and the privacy
     page are live: never from cache. */
  if (/\/api\/|\/\.netlify\/|\/privacy(\.html)?$/.test(new URL(url).pathname)) return;

  /* Navigations and the shell: network-first, cache as fallback. */
  if (req.mode === 'navigate' || /\/index\.html$/.test(url) || url.endsWith('/')) {
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(SHELL).then(function(c){ c.put('/index.html', copy); });
        return res;
      }).catch(function(){
        return caches.match('/index.html').then(function(hit){
          return hit || new Response('<h1>Offline</h1><p>Open Kova once with a connection to install it.</p>',
            { headers: { 'Content-Type': 'text/html' } });
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

/* Lets the page force an update without the user reinstalling. */
self.addEventListener('message', function(e){
  if (e.data === 'skipWaiting') self.skipWaiting();
});
