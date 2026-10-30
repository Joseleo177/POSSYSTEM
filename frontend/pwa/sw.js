/* Service worker de NXUS: permite abrir la app sin internet.
 *
 * Las claves internas siguen con el prefijo "nexus" (esta caché, la base "nexus-offline" y los
 * nexus_* de localStorage): renombrarlas dejaría huérfanas las ventas en cola sin conexión y el
 * código de cada equipo. No se ven en pantalla.
 *
 * Es una plantilla. El build (plugin `nexusServiceWorker` en vite.config.js) reemplaza
 * __VERSION__ y __PRECACHE__ por la versión y la lista exacta de archivos generados, y la
 * publica como /sw.js. Cada despliegue trae una lista nueva: el navegador la detecta, guarda los
 * archivos nuevos y borra los de la versión anterior.
 *
 * Qué hace:
 *   - Página (navegación): primero la red, para tomar siempre la versión publicada; si no
 *     responde en unos segundos o no hay red, la copia guardada. Así la caja abre tras un
 *     apagón aunque el router siga sin internet.
 *   - /assets/: llevan el hash en el nombre y no cambian nunca. Primero la copia guardada.
 *   - Íconos y manifiesto: la copia guardada, y si no está, la red.
 *
 * Qué NO toca: la API (/api) ni las fotos subidas (/uploads). En Vercel la API está en otro
 * dominio y ni siquiera pasa por aquí. Lo que la caja necesita del servidor sin conexión lo
 * guarda la propia app (src/services/offline).
 */

const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `nexus-app-${VERSION}`;
const ESPERA_RED_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("nexus-app-") && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function redConEspera(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("sin respuesta")), ESPERA_RED_MS);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;

  // La vitrina y la página de la mesa no pasan por aquí: son del cliente final, no funcionan
  // sin internet, y su HTML lo arma la función de Vercel con los datos de la tienda. Pasar por
  // el service worker solo le sumaba su arranque a cada visita de quien también usa el ERP en
  // ese teléfono, y además guardaba la página de la vitrina como si fuera el index.html del ERP.
  if (request.mode === "navigate" && /^\/(catalogo|mesa)(\/|$)/.test(url.pathname)) return;

  // La app es una sola página: cualquier ruta abre index.html.
  if (request.mode === "navigate") {
    event.respondWith(
      redConEspera(request)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put("/index.html", copia));
          }
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copia));
        }
        return res;
      }))
    );
    return;
  }

  // Íconos y manifiesto (index.html los pide con ?v=, que no cambia el archivo).
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(url.pathname).then((hit) => hit || fetch(request))
    );
  }
});
