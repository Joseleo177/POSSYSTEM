const BASE = (import.meta.env.VITE_API_URL || "") + "/api";

// El stream mantiene una conexión abierta mientras la caja esté abierta. Eso es gratis
// contra un servidor propio, pero en serverless cada conexión sostiene una función viva
// hasta su tope de duración y EventSource reconecta sola, en bucle, todo el turno.
// Por eso va apagado salvo que el build lo encienda (Docker); sin él, cada consumidor
// se apoya en su refresco periódico, que ya existía como red de seguridad.
export const SSE_ENABLED = import.meta.env.VITE_SSE_ENABLED === "true";

let _es = null;
const _listeners = {};   // event → Set<callback>

function _dispatch(event, data) {
  _listeners[event]?.forEach(cb => { try { cb(data); } catch {} });
}

export function initSSE(token) {
  if (!SSE_ENABLED || _es) return;
  _es = new EventSource(`${BASE}/events/stream?token=${encodeURIComponent(token)}`);

  _es.addEventListener('currencies:updated', (e) => _dispatch('currencies:updated', JSON.parse(e.data)));
  _es.addEventListener('products:updated',   (e) => _dispatch('products:updated',   JSON.parse(e.data)));

  _es.onerror = () => {
    // EventSource reconecta automáticamente; si está cerrado, limpiar para permitir re-init
    if (_es?.readyState === EventSource.CLOSED) { _es = null; }
  };
}

export function closeSSE() {
  _es?.close();
  _es = null;
}

// Devuelve función para cancelar la suscripción
export function onSSE(event, cb) {
  if (!_listeners[event]) _listeners[event] = new Set();
  _listeners[event].add(cb);
  return () => _listeners[event].delete(cb);
}
