import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "../services/api";
import { useDebounce } from "./useDebounce";

// Estado del documento, uno más de los filtros. "pending" es lo que exige acción de alguien:
// mercancía en tránsito o faltantes sin resolver, y es con lo que se abre la pantalla.
export const STATUS_FILTERS = [
  { value: "",          label: "Todas",      query: "" },
  { value: "pending",   label: "Pendientes", query: "pending" },
  { value: "received",  label: "Recibidas",  query: "received,received_with_differences" },
  { value: "cancelled", label: "Anuladas",   query: "cancelled" },
];

const EMPTY_SUMMARY = { in_transit: 0, to_receive: 0, with_differences: 0 };
// El estado arranca en "pendientes" porque es lo que hay que atender; cuenta como filtro
// activo para que se vea de entrada por qué la lista no lo muestra todo.
const DEFAULT_FILTERS = { status: "pending", warehouseId: "", direction: "", dateFrom: "", dateTo: "" };

/**
 * Listado y ciclo de vida de las transferencias: despacho (en useWarehouseOps),
 * recepción, resolución de faltantes y anulación.
 */
export function useTransfers(notify) {
  const [transfers, setTransfers] = useState([]);
  const [summary, setSummary]     = useState(EMPTY_SUMMARY);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);

  // ── Búsqueda y filtros ───────────────────────────────────────
  const [search, setSearch]   = useState("");
  const debouncedSearch       = useDebounce(search, 400);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const setFilter = useCallback((key, value) =>
    setFilters(prev => ({ ...prev, [key]: value })), []);
  // Limpiar deja la lista completa: el estado también se suelta.
  const clearFilters = useCallback(() => setFilters({ ...DEFAULT_FILTERS, status: "" }), []);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length, [filters]);

  // Documento abierto en detalle y documento en proceso de recepción.
  const [detail, setDetail]   = useState(null);
  const [receiving, setReceiving] = useState(null);

  // La carga lee los filtros de un ref para conservar identidad estable: si `load` cambiara
  // en cada tecleo, los efectos que la tienen como dependencia se dispararían en cadena.
  const queryRef = useRef({ search: "", ...DEFAULT_FILTERS });
  useEffect(() => { queryRef.current = { search: debouncedSearch, ...filters }; },
    [debouncedSearch, filters]);

  const load = useCallback(async () => {
    const q = queryRef.current;
    const conf = STATUS_FILTERS.find(s => s.value === q.status) || STATUS_FILTERS[0];
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (conf.query)    params.status       = conf.query;
      if (q.search)      params.search       = q.search;
      if (q.warehouseId) params.warehouse_id = q.warehouseId;
      if (q.direction)   params.direction    = q.direction;
      if (q.dateFrom)    params.date_from    = q.dateFrom;
      if (q.dateTo)      params.date_to      = q.dateTo;

      // El resumen sigue al almacén filtrado: los contadores de las pestañas tienen que
      // hablar de lo mismo que la tabla que se está viendo.
      const sumParams = q.warehouseId ? { warehouse_id: q.warehouseId } : {};

      const [list, sum] = await Promise.all([
        api.warehouses.getTransfers(params),
        api.warehouses.transferSummary(sumParams),
      ]);
      setTransfers(list.data || []);
      setSummary(sum.data || EMPTY_SUMMARY);
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  }, [notify]);

  useEffect(() => {
    queryRef.current = { search: debouncedSearch, ...filters };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filters]);

  // `lines`: [{ id, qty_received, diff_reason }]
  const doReceive = useCallback(async (id, lines, note) => {
    setSaving(true);
    try {
      const r = await api.warehouses.receiveTransfer(id, { items: lines, note: note || null });
      const withDiff = r.data?.status === "received_with_differences";
      notify(withDiff
        ? "Recepción registrada con diferencias — quedan faltantes por resolver"
        : "Recepción conforme registrada ✓");
      setReceiving(null);
      await load();
      return r.data;
    } catch (e) { notify(e.message, "err"); return null; }
    finally { setSaving(false); }
  }, [notify, load]);

  // `lines`: [{ id, resolution: 'loss' | 'return', note }]
  const doResolve = useCallback(async (id, lines) => {
    setSaving(true);
    try {
      const r = await api.warehouses.resolveTransfer(id, { items: lines });
      notify("Faltantes resueltos ✓");
      setDetail(r.data || null);
      await load();
      return r.data;
    } catch (e) { notify(e.message, "err"); return null; }
    finally { setSaving(false); }
  }, [notify, load]);

  const doCancel = useCallback(async (id, reason) => {
    setSaving(true);
    try {
      await api.warehouses.cancelTransfer(id, { reason: reason || null });
      notify("Transferencia anulada — el stock volvió al origen ✓");
      setDetail(null);
      await load();
    } catch (e) { notify(e.message, "err"); }
    finally { setSaving(false); }
  }, [notify, load]);

  return {
    transfers, summary, loading, saving, load,
    search, setSearch,
    filters, setFilter, clearFilters, activeFilterCount,
    detail, setDetail, receiving, setReceiving,
    doReceive, doResolve, doCancel,
  };
}
