// Estado de la conexión con el servidor, visto por la caja.
//
// navigator.onLine no basta: dice si hay red local, no si llega internet (el router puede
// estar encendido con la línea caída). Aquí manda lo que pasa con las peticiones reales: una
// que no pudo salir marca "sin conexión", y la siguiente que responde la quita.

let sinConexion = typeof navigator !== "undefined" && navigator.onLine === false;
const oyentes = new Set();

export const isOffline = () => sinConexion;

// El error de una petición que no pudo atenderse por falta de servidor: sin internet
// (NETWORK_ERROR) o con el servidor sin base de datos (SERVER_DOWN, ver servidorCaido en
// api.js). En los dos casos la caja hace lo mismo: trabaja con lo guardado en el equipo.
export const esSinServidor = (err) => err?.code === "NETWORK_ERROR" || err?.code === "SERVER_DOWN";

export function setOffline(valor) {
  if (sinConexion === valor) return;
  sinConexion = valor;
  oyentes.forEach((fn) => { try { fn(valor); } catch { /* un oyente roto no frena al resto */ } });
}

export function onNetworkChange(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

// Que el equipo pierda la red sí es seguro: no hay forma de llegar al servidor.
if (typeof window !== "undefined") {
  window.addEventListener("offline", () => setOffline(true));
}
