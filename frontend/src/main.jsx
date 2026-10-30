import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { handleImgError } from "./helpers/image";
import { isPublicRoute } from "./publicRoutes";

// El evento error de una <img> no burbujea, pero sí se captura: un solo listener cubre todas
// las fotos de la app, tengan o no su propio onError.
document.addEventListener("error", (e) => handleImgError(e.target), true);

// La app abre sin internet gracias al service worker (pwa/sw.js, generado en el build). Solo
// en producción: en desarrollo serviría archivos viejos mientras se edita. El navegador lo
// exige en https o localhost; en otro caso no existe y la app funciona como siempre, en línea.
//
// No en la vitrina ni en el QR de la mesa: al instalarse guarda TODOS los archivos del ERP, y
// un cliente que solo abrió el catálogo terminaría bajando megas que nunca va a usar.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    if (!isPublicRoute()) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* sin él, solo en línea */ });
      return;
    }
    // Antes también se registraba en la vitrina, y esos teléfonos lo conservan: en cada
    // despliegue volverían a bajar el ERP entero. Se quita solo si el equipo nunca usó el ERP
    // (sin sesión ni código de equipo del modo sin conexión); una caja que abre la vitrina lo
    // mantiene, y de todos modos el ERP lo vuelve a registrar al abrirse.
    let usaErp = true;
    try { usaErp = Boolean(localStorage.getItem("pos_token") || localStorage.getItem("nexus_equipo_codigo")); }
    catch { /* modo privado: no tocar nada */ }
    if (usaErp) return;
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then(() => caches.keys())
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("nexus-app-")).map((k) => caches.delete(k))))
      .catch(() => { /* sin efecto en la vitrina */ });
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
