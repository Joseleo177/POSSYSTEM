// Service worker de los avisos al teléfono del cliente (Web Push, 05-11-2026). Ver
// components/mesas/avisos.js y backend/src/services/avisosPush.js.
//
// Solo recibe avisos y abre la página al tocarlos: NO guarda archivos ni sirve la app sin
// conexión (eso es /sw.js, del ERP). Se registra con alcance /mesa/ para no pisar al del ERP.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let aviso = {};
  try { aviso = event.data ? event.data.json() : {}; } catch { aviso = { body: event.data && event.data.text() }; }
  const titulo = aviso.title || "Aviso";
  event.waitUntil(self.registration.showNotification(titulo, {
    body: aviso.body || "",
    icon: aviso.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: aviso.tag || undefined,
    renotify: Boolean(aviso.tag),
    vibrate: [120, 80, 120],
    data: { url: aviso.url || "/" },
  }));
});

// Tocar el aviso: si la página ya está abierta se trae al frente; si no, se abre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abiertas) {
      if (c.url.split("?")[0] === url.split("?")[0] && "focus" in c) return c.focus();
    }
    return self.clients.openWindow(url);
  })());
});
