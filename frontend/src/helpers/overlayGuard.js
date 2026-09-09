// Cuenta de overlays que se dibujan POR ENCIMA de un Modal (la botonera de cobro, por
// ejemplo). `Modal` consulta `hasTopOverlay()` en su handler de Escape: si hay uno abierto,
// no se cierra, porque ese overlay maneja su propio Escape (retrocede un paso o cierra).
//
// Es un contador de módulo, no un contexto: el overlay puede montarse en cualquier parte del
// árbol y los listeners de teclado viven en `window`, donde no llega el estado de React.
let count = 0;

// Llamar al montar el overlay; devuelve la función de limpieza para el efecto.
export function enterTopOverlay() {
  count++;
  return () => { count = Math.max(0, count - 1); };
}

export function hasTopOverlay() {
  return count > 0;
}
