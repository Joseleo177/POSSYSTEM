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

  const [detail, setDetail]           = useState(null);
  const [detailSales, setDetailSales] = useState([]);

  const [saving, setSaving]           = useState(false);

  // Resetear página al cambiar filtros
  useEffect(() => { setPage(1); }, [search, typeFilter]);

  // ── Cargar lista ─────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const params = { limit: LIMIT, offset: (page - 1) * LIMIT };
      if (search)     params.search = search;
      if (typeFilter) params.type   = typeFilter;
      const r = await api.customers.getAll(params);
      setCustomers(r.data);
      setTotal(r.total || r.data.length);
    } catch (e) { notify(e.message, "err"); }
  }, [search, typeFilter, page, notify]);

  useEffect(() => { load(); }, [load]);

  // ── Detalle + historial de compras ───────────────────────────
  const openDetail = useCallback(async (customer) => {
    setDetail(customer);
    try {
      const r = await api.customers.getPurchases(customer.id);
      setDetailSales(r.data);
    } catch (e) { notify(e.message, "err"); }
  }, [notify]);

  const closeDetail = useCallback(() => {
    setDetail(null);
    setDetailSales([]);
  }, []);

  const refreshDetail = useCallback(async (customerId) => {
    if (!customerId) return;
    try {
      const [cR, pR] = await Promise.all([
        api.customers.getOne(customerId),
        api.customers.getPurchases(customerId),
      ]);
      setDetail(cR.data);
      setDetailSales(pR.data);
      load();
    } catch (e) { notify(e.message, "err"); }
  }, [notify, load]);

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
    load,
    // Detalle
    detail, detailSales,
    openDetail, closeDetail, refreshDetail,
    // CRUD
    saving, save, remove,
    // Constante
    LIMIT,
  };
}
