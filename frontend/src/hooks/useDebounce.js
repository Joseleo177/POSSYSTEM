import { useState, useEffect } from "react";

/**
 * Retorna el valor debounced — solo se actualiza cuando el valor
 * deja de cambiar por `delay` ms.
 *
 * @param {*} value - Valor a debouncear
 * @param {number} delay - Milisegundos (default 300)
 */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}
