// Avisos al teléfono del cliente (Web Push, 05-11-2026): el lado del navegador. El service worker
// es public/push-sw.js; el servidor, backend/src/services/avisosPush.js.
//
// Necesita HTTPS (o localhost). En iPhone solo existe con la página agregada a la pantalla de
// inicio: en Safari o Brave normal no hay PushManager y la página no los ofrece.

const ALCANCE = "/mesa/";

export const avisosPosibles = () =>
    typeof window !== "undefined" && window.isSecureContext
    && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const permisoAvisos = () => (typeof Notification !== "undefined" ? Notification.permission : "denied");

// La llave pública llega en base64 "de URL"; el navegador la quiere en bytes.
function llaveEnBytes(b64) {
    const relleno = "=".repeat((4 - (b64.length % 4)) % 4);
    const crudo = atob((b64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(crudo, c => c.charCodeAt(0));
}

async function registroActivo() {
    const reg = await navigator.serviceWorker.register("/push-sw.js", { scope: ALCANCE });
    if (reg.active) return reg;
    const sw = reg.installing || reg.waiting;
    await new Promise((listo) => {
        if (!sw) return listo();
        sw.addEventListener("statechange", () => { if (sw.state === "activated") listo(); });
    });
    return reg;
}

/** La suscripción que ya tiene este navegador (o null), sin pedir nada. */
export async function suscripcionActual() {
    if (!avisosPosibles()) return null;
    const reg = await navigator.serviceWorker.getRegistration(ALCANCE);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? sub.toJSON() : null;
}

/**
 * Pide el permiso y suscribe el navegador. Hay que llamarla directo desde el toque del botón:
 * Safari solo muestra la pregunta si viene de un gesto del usuario.
 * Lanza un error con `.motivo` "bloqueado" si el cliente dijo que no.
 */
export async function activarAvisos(llave) {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") throw Object.assign(new Error("Los avisos están bloqueados en este navegador"), { motivo: "bloqueado" });
    const reg = await registroActivo();
    const opciones = { userVisibleOnly: true, applicationServerKey: llaveEnBytes(llave) };
    let sub = await reg.pushManager.getSubscription();
    try {
        if (!sub) sub = await reg.pushManager.subscribe(opciones);
    } catch {
        // Una suscripción vieja hecha con otra llave: se descarta y se hace de nuevo.
        if (sub) await sub.unsubscribe().catch(() => {});
        try {
            sub = await reg.pushManager.subscribe(opciones);
        } catch {
            // El navegador da el permiso pero no tiene servicio de avisos (Brave con el ajuste
            // apagado, navegadores sin Google): el error llega en inglés técnico.
            throw new Error("Este navegador no puede recibir avisos. Prueba abriendo la página en Chrome.");
        }
    }
    return sub.toJSON();
}

/** "No recibir más avisos": devuelve la dirección que había, para borrarla en el servidor. */
export async function desactivarAvisos() {
    const reg = await navigator.serviceWorker.getRegistration(ALCANCE);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return null;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    return endpoint;
}
