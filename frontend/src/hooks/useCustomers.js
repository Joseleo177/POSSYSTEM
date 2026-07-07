import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";

const LIMIT = 50;

/**
 * Gestiona la lista de clientes/proveedores con paginación,
 * filtros, detalle y CRUD completo.
 *
 * @param {function} notify - Función de notificación de AppContext
 */
export function useCustomers(notify) {
  const [customers, setCustomers]     = useState([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState("");
  const [debtorsFilter, setDebtorsFilter] = useState(false);

  const [detail, setDetail]           = useState(null);
  const [detailPending, setDetailPending]     = useState([]); // Cuentas por cobrar (completas)
  const [detailPaid, setDetailPaid]           = useState([]); // Historial de pagos (página actual)
  const [detailPaidTotal, setDetailPaidTotal] = useState(0);
  const [detailPaidPage, setDetailPaidPage]   = useState(1);

  const [saving, setSaving]           = useState(false);

  // Resetear página al cambiar filtros
  useEffect(() => { setPage(1); }, [search, typeFilter, debtorsFilter]);

  // ── Cargar lista ─────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const params = { limit: LIMIT, offset: (page - 1) * LIMIT };
      if (search)        params.search  = search;
      if (typeFilter)    params.type    = typeFilter;
      if (debtorsFilter) params.debtors = true;
      const r = await api.customers.getAll(params);
      setCustomers(r.data);
      setTotal(r.total || r.data.length);
    } catch (e) { notify(e.message, "err"); }
  }, [search, typeFilter, debtorsFilter, page, notify]);

  useEffect(() => { load(); }, [load]);

  // ── Detalle + historial de compras ───────────────────────────
  // Carga cuentas por cobrar (completas) + una página del historial pagado.
  const loadPurchases = useCallback(async (customerId, pg = 1) => {
    const r = await api.customers.getPurchases(customerId, {
      limit: LIMIT, offset: (pg - 1) * LIMIT,
    });
    setDetailPending(r.pending || []);
    setDetailPaid(r.paid || []);
    setDetailPaidTotal(r.paidTotal || 0);
    setDetailPaidPage(pg);
  }, []);

  const openDetail = useCallback(async (customer) => {
    setDetail(customer);
    try {
      await loadPurchases(customer.id, 1);
    } catch (e) { notify(e.message, "err"); }
  }, [notify, loadPurchases]);

  const closeDetail = useCallback(() => {
    setDetail(null);
    setDetailPending([]);
    setDetailPaid([]);
    setDetailPaidTotal(0);
    setDetailPaidPage(1);
  }, []);

  // Cambiar de página en el historial de pagos
  const setDetailPage = useCallback((pg) => {
    if (detail?.id) loadPurchases(detail.id, pg).catch(e => notify(e.message, "err"));
  }, [detail, loadPurchases, notify]);

  const refreshDetail = useCallback(async (customerId) => {
    if (!customerId) return;
    try {
      const cR = await api.customers.getOne(customerId);
      setDetail(cR.data);
      await loadPurchases(customerId, 1);
      load();
    } catch (e) { notify(e.message, "err"); }
  }, [notify, load, loadPurchases]);

  // ── CRUD ─────────────────────────────────────────────────────
  const save = useCallback(async (form, editId = null) => {
    if (!form.name) { notify("El nombre es requerido", "err"); return false; }
    setSaving(true);
    const label = form.type === "proveedor" ? "Proveedor" : "Cliente";
    try {
      if (editId) {
        await api.customers.update(editId, form);
        notify(`${label} actualizado ✓`);
      } else {
        await api.customers.create(form);
        notify(`${label} registrado ✓`);
      }
      load();
      return true;
    } catch (e) { notify(e.message, "err"); return false; }
    finally { setSaving(false); }
  }, [notify, load]);

  const remove = useCallback(async (id, type) => {
    const label = type === "proveedor" ? "proveedor" : "cliente";
    try {
      await api.customers.remove(id);
      notify(`${label.charAt(0).toUpperCase() + label.slice(1)} eliminado`);
      load();
    } catch (e) { notify(e.message, "err"); }
  }, [notify, load]);

  return {
    // Lista
    customers, total, page, setPage,
    search, setSearch,
    typeFilter, setTypeFilter,
    debtorsFilter, setDebtorsFilter,
    load,
    // Detalle
    detail, detailPending, detailPaid, detailPaidTotal, detailPaidPage,
    openDetail, closeDetail, refreshDetail, setDetailPage,
    // CRUD
    saving, save, remove,
    // Constante
    LIMIT,
  };
}
