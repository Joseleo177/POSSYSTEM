import { useState, useEffect } from "react";
import { useDebounce } from "./useDebounce";

/**
 * Hook para búsquedas con autocomplete/dropdown.
 * Maneja el debounce, la llamada asíncrona y el estado de resultados.
 *
 * @param {function} searchFn - `async (term) => items[]`
 * @param {object} options
 * @param {number}  options.delay   - Debounce en ms (default 250)
 * @param {number}  options.limit   - Máximo de resultados (default 8)
 * @param {boolean} options.enabled - Si false, no busca (default true)
 */
export function useSearchDropdown(searchFn, { delay = 250, limit = 8, enabled = true } = {}) {
  const [term, setTerm]         = useState("");
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);

  const debouncedTerm = useDebounce(term, delay);

  useEffect(() => {
    if (!enabled || !debouncedTerm.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    searchFn(debouncedTerm)
      .then(items => { if (!cancelled) setResults(items.slice(0, limit)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debouncedTerm, enabled]);

  const clear = () => { setTerm(""); setResults([]); };

  return { term, setTerm, results, setResults, searching, clear };
}
