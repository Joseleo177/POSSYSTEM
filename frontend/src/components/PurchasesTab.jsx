import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import CustomerModal from "./CustomerModal";
import ProductModal from "./ProductModal";
import Modal from "./Modal";
import { calcPurchaseItem, fmtDate } from "../helpers";
import ConfirmModal from "./ConfirmModal";

const calcItem = calcPurchaseItem;
const fmt2 = (n) => Number(n).toFixed(2);

const PKG_UNITS = ["caja", "bulto", "paquete", "docena", "media caja", "fardo", "saco", "unidad"];

import { usePurchases } from "../hooks/usePurchases";
import { useProductSearch, useSupplierSearch } from "../hooks/useSearchHooks";

export default function PurchasesTab({ notify, onProductsUpdated }) {
  const {
    view, setView,
    purchases, loadPurchases,
    detail, openDetail,
    warehouses, selectedWarehouseId, setSelectedWarehouseId,
    selectedSupplier, setSelectedSupplier,
    notes, setNotes,
    items,
    itemForm, setIF, selectProduct: selectProductHook,
    addItem, removeItem,
    loading, savePurchase: savePurchaseAction, cancelPurchase: cancelPurchaseAction,
    EMPTY_ITEM
  } = usePurchases(notify, onProductsUpdated);

  // ── Specialized Searches ───────────────────────────────────
  const {
    term: productSearch,
    setTerm: setProductSearch,
    results: productResults,
    searching,
    clear: clearProductSearch
  } = useProductSearch({ limit: 8 });

  const {
    term: supplierSearch,
    setTerm: setSupplierSearch,
    results: supplierResults,
    clear: clearSupplierSearch
  } = useSupplierSearch({ limit: 6 });

  // ── UI State (Modals) ──────────────────────────────────────
  const [supplierModal, setSupplierModal] = useState(false);
  const [supplierEditData, setSupplierEditData] = useState(null);
  const [savingSupplier, setSavingSupplier] = useState(false);

  const [productModal, setProductModal] = useState(false);
  const [productEditData, setProductEditData] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [categories, setCategories] = useState([]);
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [newModal, setNewModal] = useState(false);

  // ── CRUD Wrappers / UI Logic ───────────────────────────────
  const openCreateSupplier = (name = "") => {
    setSupplierEditData({ _newType: "proveedor", _newName: name });
    setSupplierModal(true);
  };
  const closeSupplierModal = () => { setSupplierModal(false); setSupplierEditData(null); };

  const saveSupplier = async (form) => {
    if (!form.name) return notify("El nombre es requerido", "err");
    setSavingSupplier(true);
    try {
      const res = await api.customers.create({ ...form, type: "proveedor" });
      notify("Proveedor registrado exitosamente");
      setSelectedSupplier(res.data);
      clearSupplierSearch();
      closeSupplierModal();
    } catch (e) { notify(e.message, "err"); }
    setSavingSupplier(false);
  };

  const openCreateProduct = (name = "") => {
    if (!categories.length) api.categories.getAll().then(r => setCategories(r.data)).catch(() => { });
    setProductEditData({ name });
    setProductModal(true);
  };
  const closeProductModal = () => { setProductModal(false); setProductEditData(null); };

  const saveProduct = async (form, imageFile) => {
    const { name, price, stock, category_id, unit, qty_step } = form;
    if (!name || !price) return notify("Nombre y precio son requeridos", "err");
    setSavingProduct(true);
    try {
      const payload = { name, price: +price, stock: +stock, category_id: category_id || null, unit: unit || "unidad", qty_step: +qty_step || 1 };
      const res = await api.products.create(payload, imageFile);
      notify("Producto creado exitosamente");
      if (res?.data) selectProduct(res.data);
      closeProductModal();
      clearProductSearch();
    } catch (e) { notify(e.message, "err"); }
    setSavingProduct(false);
  };

  const selectProduct = (p) => {
    selectProductHook(p);
    clearProductSearch();
  };

  const selectSupplier = (s) => {
    setSelectedSupplier(s);
    clearSupplierSearch();
  };

  const savePurchase = async () => {
    await savePurchaseAction(selectedSupplier);
    setNewModal(false);
  };

  const cancelPurchase = (id) => cancelPurchaseAction(id);

  const grandTotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);

  const listView = (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-xl font-black text-content dark:text-white uppercase tracking-[4px] font-display">Historial de Compras</h2>
          <div className="text-[10px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-[2px] opacity-60 mt-1">
            {purchases.length} recibo(s) registrado(s) en sistema
          </div>
        </div>
        <button onClick={() => setNewModal(true)} className="btn-primary h-10 px-4 !rounded-2xl text-[11px] font-black uppercase tracking-[3px] shadow-xl shadow-brand-500/20 active:scale-95 transition-all">
          + Nuevo recibo de compra
        </button>
      </div>

      {purchases.length === 0
        ? <div className="text-center py-16 text-sm text-content-muted dark:text-content-dark-muted">
          Aún no hay recibos de compra.<br />
          <span className="text-xs">Registra tu primera compra para actualizar el inventario.</span>
        </div>
        : <div className="card-premium overflow-hidden">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="border-b border-border/40 bg-surface-1 dark:bg-white/5 text-[10px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-[3px]">
                <th className="px-6 py-5 w-16">#</th>
                <th className="px-6 py-5">Almacén</th>
                <th className="px-6 py-5">Proveedor</th>
                <th className="px-6 py-5">Productos</th>
                <th className="px-6 py-5 text-right">Total</th>
                <th className="px-6 py-5">Empleado</th>
                <th className="px-6 py-5">Fecha</th>
                <th className="px-6 py-5 text-right w-44">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {purchases.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2 dark:hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-5 font-bold text-content-subtle text-xs tabular-nums">#{p.id}</td>
                  <td className="px-6 py-5">
                    {p.warehouse_name
                      ? <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-info/10 text-info border border-info/20 shadow-inner">
                        {p.warehouse_name}
                      </span>
                      : <span className="text-content-muted dark:text-content-dark-muted opacity-20 text-[10px]">SIN ALMACÉN</span>}
                  </td>
                  <td className="px-6 py-5">
                    <div className="font-black text-content dark:text-white uppercase tracking-tight text-xs">{p.supplier_name || "PROVEEDOR FINAL"}</div>
                    {p.supplier_rif && <div className="text-[9px] font-bold text-content-subtle opacity-50 uppercase tracking-widest mt-1">{p.supplier_rif}</div>}
                  </td>
                  <td className="px-6 py-5 text-xs font-bold text-content-subtle dark:text-content-dark-muted">{p.item_count} <span className="text-[10px] uppercase font-black opacity-30">items</span></td>
                  <td className="px-6 py-5 text-right font-black text-warning font-display text-lg tabular-nums">${fmt2(p.total)}</td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-surface-3 dark:bg-white/10 flex items-center justify-center text-[10px] font-black text-content-subtle">
                        {p.employee_name?.charAt(0)}
                      </div>
                      <span className="text-xs font-bold text-content-muted">{p.employee_name || "—"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-[10px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-wider">
                    {fmtDate(p.created_at)}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex justify-end gap-2.5">
                      <button onClick={() => openDetail(p.id)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-info/10 text-info border border-info/20 hover:bg-info hover:text-white transition-all shadow-sm active:scale-95" title="Ver Detalle">
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      </button>
                      <button onClick={() => setCancelConfirm(p)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all shadow-sm active:scale-95" title="Anular">
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  );

  const detailView = detail && (
    <div className="animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => { setView("list"); }}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-2 dark:bg-white/5 text-content-subtle hover:bg-surface-3 dark:hover:bg-white/10 transition-all border border-border/40"
          title="Volver al listado"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-xl font-black text-content dark:text-white uppercase tracking-[4px] font-display">Detalle de Compra</h2>
          <div className="text-[10px] font-black text-warning uppercase tracking-[2px] opacity-80 mt-1">Recibo #{detail.id}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="card-premium p-4 flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-[3px] mb-4 opacity-50">Proveedor</div>
            <div className={`text-lg font-black uppercase tracking-tight ${detail.supplier_name ? "text-brand-500" : "text-content-muted"}`}>
              {detail.supplier_name || "PROVEEDOR FINAL"}
            </div>
            {detail.supplier_rif && <div className="text-[11px] font-bold text-content-subtle mt-1 opacity-60">RIF: {detail.supplier_rif}</div>}
          </div>
          {detail.notes && (
            <div className="mt-6 pt-4 border-t border-border/10">
              <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1 opacity-40">Observaciones:</div>
              <div className="text-xs italic text-content-subtle leading-relaxed opacity-70">"{detail.notes}"</div>
            </div>
          )}
        </div>

        <div className="card-premium p-4">
          <div className="text-[10px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-[3px] mb-4 opacity-50">Información de Origen</div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-info/10 text-info flex items-center justify-center border border-info/20 shadow-inner">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <div>
                <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest opacity-40">Almacén Destino</div>
                <div className="text-xs font-black text-content uppercase">{detail.warehouse_name || "—"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-surface-3 dark:bg-white/10 text-content-subtle flex items-center justify-center border border-border/10 shadow-inner">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <div>
                <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest opacity-40">Empleado Registrador</div>
                <div className="text-xs font-black text-content uppercase">{detail.employee_name || "—"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-surface-3 dark:bg-white/10 text-content-subtle flex items-center justify-center border border-border/10 shadow-inner">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest opacity-40">Fecha de Registro</div>
                <div className="text-xs font-black text-content uppercase tracking-wider tabular-nums">{fmtDate(detail.created_at)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card-premium p-4 bg-warning/5 border-warning/20 flex flex-col items-end justify-center">
          <div className="text-[10px] font-black text-warning uppercase tracking-[3px] mb-2">Total Compra Invertido</div>
          <div className="text-5xl font-black text-warning font-display drop-shadow-sm tabular-nums tracking-tighter">${fmt2(detail.total)}</div>
          <div className="text-[10px] font-bold text-warning/60 uppercase tracking-[2px] mt-2 italic">* precios expresados en USD</div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="h-0.5 flex-1 bg-gradient-to-r from-warning/30 to-transparent"></div>
        <div className="text-[10px] font-black text-warning tracking-[3px] uppercase">Productos Recibidos</div>
        <div className="h-0.5 flex-1 bg-gradient-to-l from-warning/30 to-transparent"></div>
      </div>

      <div className="card-premium overflow-hidden mb-12">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/40 bg-surface-1 dark:bg-white/5 text-[9px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-[2px]">
              <th className="px-6 py-4">Producto</th>
              <th className="px-6 py-4">Paquete</th>
              <th className="px-6 py-4">Cant.</th>
              <th className="px-6 py-4">Precio/paq.</th>
              <th className="px-6 py-4">Costo unit.</th>
              <th className="px-6 py-4">Margen</th>
              <th className="px-6 py-4">P. venta</th>
              <th className="px-6 py-4">Total uds.</th>
              <th className="px-6 py-4 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {detail.items?.map((item) => (
              <tr key={item.id} className="hover:bg-surface-2 dark:hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 font-black text-content dark:text-white uppercase tracking-tight text-xs">{item.product_name}</td>
                <td className="px-6 py-4 text-[10px] font-bold text-content-subtle uppercase tracking-widest">{item.package_unit} <span className="opacity-30">×</span> {item.package_size}</td>
                <td className="px-6 py-4 text-xs font-bold tabular-nums">{item.package_qty}</td>
                <td className="px-6 py-4 text-xs font-black text-info tabular-nums">${fmt2(item.package_price)}</td>
                <td className="px-6 py-4 text-xs font-bold text-content-subtle tabular-nums">${fmt2(item.unit_cost)}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 rounded-lg bg-surface-2 dark:bg-white/5 border border-border/20 text-[10px] font-black text-content-subtle uppercase tabular-nums">{item.profit_margin}%</span>
                </td>
                <td className="px-6 py-4 text-xs font-black text-success tabular-nums">${fmt2(item.sale_price)}</td>
                <td className="px-6 py-4 text-xs font-bold text-brand-500 tabular-nums">{item.total_units} <span className="text-[10px] opacity-40 uppercase">u</span></td>
                <td className="px-6 py-4 text-right text-sm font-black text-warning tabular-nums font-display">${fmt2(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const calc = calcItem(itemForm);

  const newView = (
    <div>
      <div className="card card-md mb-4">
        <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted tracking-widest mb-3">INFORMACIÓN DEL RECIBO</div>
        <div className="grid grid-cols-3 gap-3">

          <div>
            <label className="label">Almacén destino *</label>
            {warehouses.length === 0
              ? <div className="input text-danger bg-danger/5 border-danger">
                Sin almacenes disponibles
              </div>
              : <select
                value={selectedWarehouseId}
                onChange={e => setSelectedWarehouseId(e.target.value)}
                className="input cursor-pointer"
              >
                <option value="">— Seleccionar almacén</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            }
            {selectedWarehouseId && (
              <div className="text-[10px] text-success mt-1">
                ● El stock entrará a <b>{warehouses.find(w => String(w.id) === selectedWarehouseId)?.name}</b>
              </div>
            )}
          </div>

          <div>
            <label className="label">Proveedor</label>
            {selectedSupplier
              ? <div className="flex items-center gap-2 bg-info/10 border border-info/30 rounded-lg p-2">
                <div className="flex-1">
                  <div className="text-sm font-bold text-brand-500 dark:text-brand-400">{selectedSupplier.name}</div>
                  {selectedSupplier.rif && <div className="text-[10px] text-content-muted dark:text-content-dark-muted">{selectedSupplier.rif}</div>}
                </div>
                <button
                  onClick={() => { setSelectedSupplier(null); setSupplierSearch(""); }}
                  className="btn-sm btn-danger"
                >✕</button>
              </div>
              : <div className="relative">
                <input
                  value={supplierSearch}
                  onChange={e => setSupplierSearch(e.target.value)}
                  placeholder="Buscar proveedor registrado..."
                  className="input"
                />
                {supplierSearch.trim().length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-lg z-10 shadow-xl max-h-48 overflow-y-auto">
                    {supplierResults.map(s => (
                      <div
                        key={s.id}
                        onClick={() => selectSupplier(s)}
                        className="px-3 py-2.5 cursor-pointer border-b border-border dark:border-border-dark text-sm hover:bg-surface-3 dark:hover:bg-surface-dark-3"
                      >
                        <div className="font-bold text-brand-500 dark:text-brand-400">{s.name}</div>
                        <div className="text-[10px] text-content-muted dark:text-content-dark-muted">
                          {[s.rif, s.tax_name].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                        </div>
                      </div>
                    ))}
                    <div
                      onClick={() => openCreateSupplier(supplierSearch)}
                      className={`px-3 py-2.5 cursor-pointer text-sm text-brand-500 dark:text-brand-400 flex items-center gap-1.5 hover:bg-surface-3 dark:hover:bg-surface-dark-3 ${supplierResults.length > 0 ? "border-t border-border dark:border-border-dark" : ""}`}
                    >
                      <span className="text-base font-bold">+</span> Crear "{supplierSearch}"
                    </div>
                  </div>
                )}
              </div>
            }
          </div>

          <div>
            <label className="label">Notas (opcional)</label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="ej. Compra de la semana, pago contra entrega..."
              className="input"
            />
          </div>
        </div>
      </div>

      <div className="card card-md mb-4">
        <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted tracking-widest mb-3.5">+ AGREGAR PRODUCTO AL RECIBO</div>

        <div className="mb-3.5 relative">
          <label className="label">Buscar producto</label>
          {itemForm.product
            ? <div className="flex items-center gap-2 bg-info/10 border border-info/30 rounded-lg p-2">
              <div className="flex-1">
                <div className="text-sm font-bold text-info">{itemForm.product.name}</div>
                <div className="text-[10px] text-content-muted dark:text-content-dark-muted">
                  Stock actual: {itemForm.product.stock} {itemForm.product.unit}
                </div>
              </div>
              <button onClick={() => setIF("product", null)} className="btn-sm btn-danger">✕ Quitar</button>
            </div>
            : <>
              <input
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Escribe para buscar un producto..."
                className="input"
              />
              {searching && <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-1">Buscando...</div>}
              {productSearch.trim().length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-lg z-10 shadow-xl max-h-48 overflow-y-auto">
                  {productResults.map(p => (
                    <div
                      key={p.id}
                      onClick={() => selectProduct(p)}
                      className="px-3 py-2.5 cursor-pointer border-b border-border dark:border-border-dark text-sm hover:bg-surface-3 dark:hover:bg-surface-dark-3"
                    >
                      <div className="font-bold text-content dark:text-content-dark">{p.name}</div>
                      <div className="text-[10px] text-content-muted dark:text-content-dark-muted">
                        Stock: {p.stock} {p.unit}
                        {p.package_unit && ` · Paquete: ${p.package_unit} x${p.package_size}`}
                        {p.cost_price && ` · Costo: $${fmt2(p.cost_price)}`}
                      </div>
                    </div>
                  ))}
                  <div
                    onClick={() => openCreateProduct(productSearch)}
                    className={`px-3 py-2.5 cursor-pointer text-sm text-warning flex items-center gap-1.5 hover:bg-surface-3 dark:hover:bg-surface-dark-3 ${productResults.length > 0 ? "border-t border-border dark:border-border-dark" : ""}`}
                  >
                    <span className="text-base font-bold">+</span> Crear "{productSearch}"
                  </div>
                </div>
              )}
            </>
          }
        </div>

        <div className="grid grid-cols-4 gap-2.5 mb-2.5">
          <div>
            <label className="label">Tipo de paquete</label>
            <input
              list="pkg-list"
              value={itemForm.package_unit}
              onChange={e => setIF("package_unit", e.target.value)}
              placeholder="caja, bulto..."
              className="input"
            />
            <datalist id="pkg-list">{PKG_UNITS.map(u => <option key={u} value={u} />)}</datalist>
          </div>
          <div>
            <label className="label">Unidades por paquete</label>
            <input
              type="number" min="1" step="1"
              value={itemForm.package_size}
              onChange={e => setIF("package_size", e.target.value)}
              disabled={itemForm.package_unit?.toLowerCase() === "unidad"}
              placeholder={itemForm.package_unit?.toLowerCase() === "unidad" ? "1" : "ej. 12"}
              className={`input transition-all ${itemForm.package_unit?.toLowerCase() === "unidad" ? "bg-surface-2 dark:bg-surface-dark-3 opacity-50 cursor-not-allowed" : ""}`}
            />
          </div>
          <div>
            <label className="label">Cantidad de paquetes</label>
            <input
              type="number" min="1" step="1"
              value={itemForm.package_qty}
              onChange={e => setIF("package_qty", e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Precio por paquete ($)</label>
            <input
              type="number" min="0" step="0.01"
              value={itemForm.package_price}
              onChange={e => setIF("package_price", e.target.value)}
              placeholder="0.00"
              className="input"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2.5 mb-3.5">
          <div>
            <label className="label">Margen de ganancia (%)</label>
            <input
              type="number" min="0" step="0.1"
              value={itemForm.profit_margin}
              onChange={e => setIF("profit_margin", e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Costo unitario (calc.)</label>
            <div className={`input bg-surface-3 dark:bg-surface-dark-3 ${calc.unit_cost ? "text-info" : "text-content-muted dark:text-content-dark-muted"}`}>
              {calc.unit_cost ? `$${fmt2(calc.unit_cost)}` : "—"}
            </div>
          </div>
          <div>
            <label className="label">Precio de venta (calc.)</label>
            <div className={`input bg-surface-3 dark:bg-surface-dark-3 font-bold ${calc.sale_price ? "text-success" : "text-content-muted dark:text-content-dark-muted"}`}>
              {calc.sale_price ? `$${fmt2(calc.sale_price)}` : "—"}
            </div>
          </div>
          <div>
            <label className="label">Total unidades (calc.)</label>
            <div className={`input bg-surface-3 dark:bg-surface-dark-3 ${calc.total_units ? "text-warning" : "text-content-muted dark:text-content-dark-muted"}`}>
              {calc.total_units ? calc.total_units : "—"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 mb-3.5">
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={itemForm.update_price}
              onChange={e => setIF("update_price", e.target.checked)}
              className="w-3.5 h-3.5 accent-warning"
            />
            <span className="text-content dark:text-content-dark">Actualizar precio de venta del producto al guardar</span>
            {calc.sale_price > 0 && (
              <span className="text-success text-[11px]">→ quedará en ${fmt2(calc.sale_price)}</span>
            )}
          </label>
        </div>

        <button onClick={addItem} className="btn-sm btn-success">
          + Agregar al recibo
        </button>
      </div>

      {items.length > 0 && (
        <div className="card card-md mb-4">
          <div className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted tracking-widest mb-3">PRODUCTOS EN ESTE RECIBO</div>
          <table className="table-pos text-xs">
            <thead>
              <tr>
                {["Producto", "Paquete", "Cant.", "Precio/paq.", "Costo unit.", "Margen", "P. venta", "Total uds.", "Subtotal", ""].map(h =>
                  <th key={h}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key}>
                  <td className="font-bold text-content dark:text-content-dark">{item.product?.name}</td>
                  <td className="text-content-muted dark:text-content-dark-muted">{item.package_unit} × {item.package_unit?.toLowerCase() === 'unidad' ? '1' : item.package_size}</td>
                  <td className="text-content dark:text-content-dark">{item.package_qty}</td>
                  <td className="text-info">${fmt2(item.package_price)}</td>
                  <td className="text-content-muted dark:text-content-dark-muted">${fmt2(item.unit_cost)}</td>
                  <td className="text-content-muted dark:text-content-dark-muted">{item.profit_margin}%</td>
                  <td className="text-success font-bold">${fmt2(item.sale_price)}</td>
                  <td className="text-content dark:text-content-dark">{item.total_units}</td>
                  <td className="text-warning font-bold">${fmt2(item.subtotal)}</td>
                  <td>
                    <button onClick={() => removeItem(item.key)} className="btn-sm btn-danger">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end items-center gap-5 mt-4 pt-3 border-t border-border dark:border-border-dark">
            <div>
              <span className="text-[11px] text-content-muted dark:text-content-dark-muted tracking-widest">TOTAL COMPRA: </span>
              <span className="text-xl font-bold text-warning">${fmt2(grandTotal)}</span>
            </div>
            <button
              onClick={savePurchase}
              disabled={loading || !selectedWarehouseId}
              className={`btn-md ${loading || !selectedWarehouseId ? "btn-secondary opacity-60 cursor-not-allowed" : "btn-primary"}`}
            >
              {loading ? "Guardando..." : !selectedWarehouseId ? "Selecciona almacén" : "Guardar recibo de compra"}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="text-center py-8 text-xs text-content-muted dark:text-content-dark-muted">
          Agrega al menos un producto al recibo para poder guardarlo.
        </div>
      )}
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500">
      {view === "list" && listView}
      {view === "detail" && detailView}

      <Modal open={newModal} onClose={() => setNewModal(false)} title="Nuevo Recibo de Compra" width={960}>
        {newView}
      </Modal>

      <CustomerModal open={supplierModal} onClose={closeSupplierModal} onSave={saveSupplier} editData={supplierEditData} loading={savingSupplier} />
      <ProductModal open={productModal} onClose={closeProductModal} onSave={saveProduct} editData={productEditData} categories={categories} loading={savingProduct} />

      <ConfirmModal
        isOpen={!!cancelConfirm}
        title="¿Anular compra?"
        message={`¿Estás seguro de que deseas anular la compra #${cancelConfirm?.id}? El stock será revertido de los almacenes correspondientes.`}
        onConfirm={async () => {
          await cancelPurchaseAction(cancelConfirm.id);
          setCancelConfirm(null);
        }}
        onCancel={() => setCancelConfirm(null)}
        type="danger"
        confirmText="Sí, anular compra"
      />
    </div>
  );
}
