/* =========================================================
   LE SYSTEME - sw.js  (le "service worker")
   Il garde une copie du CODE de l'app dans le navigateur, pour que
   l'app s'ouvre meme sans reseau - dans le metro, en avion, en zone
   blanche.

   ---------------------------------------------------------
   REGLE D'OR N°6 : ce fichier ne touche JAMAIS aux donnees.
   ---------------------------------------------------------
   Il ne connait que des fichiers (html, css, js, icones). Les coches,
   les habitudes et les taches vivent dans localStorage et dans
   Supabase, deux endroits auxquels un service worker n'a pas acces.
   Vider ce cache, meme entierement, ne peut donc rien effacer de
   l'historique. Ce sont deux tiroirs separes, et ils le restent.

   POUR PUBLIER UNE MISE A JOUR : incrementer VERSION ci-dessous.
   C'est ce qui dit au navigateur "jette l'ancien code, prends le neuf".
   ========================================================= */

var VERSION = 'v3';
var CACHE = 'lesysteme-code-' + VERSION;

/* Le strict necessaire pour que l'app demarre hors ligne. */
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './manifest.webmanifest',
  './js/store.js',
  './js/sync.js',
  './js/ui-today.js',
  './js/ui-tasks.js',
  './js/ui-progress.js',
  './js/ui-system.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

/* Le client Supabase, servi par un CDN. On essaie de le mettre en cache
   pour que l'app s'ouvre hors ligne, mais sans en faire une condition :
   s'il manque, l'app demarre quand meme, simplement sans synchro. */
var CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.js';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL).then(function () {
        return c.add(CDN).catch(function () { /* tant pis, pas bloquant */ });
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      // On ne supprime que NOS anciens caches de code. Rien d'autre.
      return Promise.all(names.map(function (n) {
        if (n.indexOf('lesysteme-code-') === 0 && n !== CACHE) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  /* Tout ce qui parle a Supabase (donnees, connexion) passe directement
     par le reseau, sans jamais etre mis en cache : on ne veut pas servir
     de vieilles donnees, ni garder trace d'un jeton de connexion. */
  if (url.hostname.indexOf('supabase') !== -1) return;

  /* La page elle-meme : on tente le reseau d'abord, pour que les mises a
     jour arrivent tout de suite ; le cache prend le relais si ca ne
     repond pas. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || fetch(req); });
      })
    );
    return;
  }

  /* Les fichiers de code : on repond avec le cache (instantane) et on
     rafraichit la copie en arriere-plan pour la prochaine ouverture. */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
