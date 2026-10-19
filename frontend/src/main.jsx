import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { handleImgError } from "./helpers/image";

// El evento error de una <img> no burbujea, pero sí se captura: un solo listener cubre todas
// las fotos de la app, tengan o no su propio onError.
document.addEventListener("error", (e) => handleImgError(e.target), true);

// La app abre sin internet gracias al service worker (pwa/sw.js, generado en el build). Solo
// en producción: en desarrollo serviría archivos viejos mientras se edita. El navegador lo
// exige en https o localhost; en otro caso no existe y la app funciona como siempre, en línea.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* sin él, solo en línea */ });
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
