import { useCallback } from "react";
import { api } from "../services/api";
import { useSearchDropdown } from "./useSearchDropdown";

/**
 * Hook especializado para buscar productos.
 * Filtra automáticamente combos y servicios si es necesario.
 */
export function useProductSearch(options = {}) {
  const searchFn = useCallback(async (term) => {
    const r = await api.products.getAll({
      search: term,
      is_combo: options.includeCombos ?? false,
      is_service: options.includeServices ?? false,
      ...options.params
    });
    return r.data;
  }, [options]);

  return useSearchDropdown(searchFn, options);
}

/**
 * Hook especializado para buscar proveedores.
 */
export function useSupplierSearch(options = {}) {
  const searchFn = useCallback(async (term) => {
    const r = await api.customers.getAll({
      search: term,
      type: "proveedor",
      ...options.params
    });
    return r.data;
  }, [options]);

  return useSearchDropdown(searchFn, options);
}
