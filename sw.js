/* Service Worker — Flujo de Caja (Más Pisto)
   Cachea el "shell" de la app para abrir sin conexión.
   Sube la versión (CACHE) cada vez que cambie index.html para forzar actualización. */
var CACHE = "caja-shell-v11";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

// Permite que la página pida activar de inmediato el SW nuevo (actualización en vivo)
self.addEventListener("message", function(e){
  if(e.data && e.data.type==="SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // addAll falla si algún archivo no existe; lo hacemos tolerante
      return Promise.all(SHELL.map(function(url){
        return c.add(url).catch(function(){ /* ignorar faltantes (iconos opcionales) */ });
      }));
    })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ if(k!==CACHE) return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return; // nunca tocar POST/PATCH (escrituras a Supabase)

  var url = new URL(req.url);
  var esMismoOrigen = (url.origin === self.location.origin);

  // Navegación (abrir la app): network-first, con fallback a la copia cacheada.
  // Solo la caja (raíz o index.html) se guarda como index.html; otras páginas del repo
  // (por ejemplo conci.html) se guardan con su propio nombre para no reemplazar la caja.
  if(req.mode === "navigate"){
    var esIndex = esMismoOrigen && /\/(index\.html)?$/.test(url.pathname);
    e.respondWith(
      fetch(req).then(function(resp){
        var copia = resp.clone();
        caches.open(CACHE).then(function(c){ c.put(esIndex ? "./index.html" : req, copia); });
        return resp;
      }).catch(function(){
        if(esIndex) return caches.match("./index.html").then(function(m){ return m || caches.match("./"); });
        return caches.match(req, { ignoreSearch: true });
      })
    );
    return;
  }

  // Recursos del mismo origen (el shell): cache-first
  if(esMismoOrigen){
    e.respondWith(
      caches.match(req).then(function(m){
        return m || fetch(req).then(function(resp){
          var copia = resp.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copia); });
          return resp;
        }).catch(function(){ return m; });
      })
    );
    return;
  }

  // CDNs (fuentes, supabase-js, html2canvas, jspdf): cache-first para que la app
  // cargue offline una vez vistos; si no están, se intenta la red.
  if(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(url.host)){
    e.respondWith(
      caches.match(req).then(function(m){
        return m || fetch(req).then(function(resp){
          var copia = resp.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copia); });
          return resp;
        }).catch(function(){ return m; });
      })
    );
    return;
  }

  // Todo lo demás (API de Supabase: supabase.co): dejar pasar a la red tal cual.
  // La lógica de cola offline vive en el JS de la app, no aquí.
});
