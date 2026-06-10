const BASE = (import.meta.env.VITE_API_URL || "") + "/api";

let _es = null;
const _listeners = {};   // event → Set<callback>

function _dispatch(event, data) {
  _listeners[event]?.forEach(cb => { try { cb(data); } catch {} });
}

export function initSSE(token) {
  if (_es) return;
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
