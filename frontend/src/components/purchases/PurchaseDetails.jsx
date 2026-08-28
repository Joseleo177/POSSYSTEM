import { useState, useEffect, useCallback } from "react";
import PurchaseItemsTable from "./PurchaseItemsTable";
import PurchasePaymentModal from "./PurchasePaymentModal";
import ProductSelectorModal from "./ProductSelectorModal";
import ConfirmModal from "../ui/ConfirmModal";
import Modal from "../ui/Modal";
import CustomSelect from "../ui/CustomSelect";
import { resolveRate, isRateEdited } from "../ui/RateField";
import { api } from "../../services/api";
import { fmtDateShort } from "../../helpers";
import { useApp } from "../../context/AppContext";
import { printPurchaseOrderDoc } from "../../helpers/printPurchaseOrder";
import { printPurchaseLetter } from "../../helpers/printPurchaseLetter";

const fmt2 = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// En claro el fondo de página ya es surface-2 (#f9fafb), así que un panel surface-2 era
// invisible: mismo color, borde al 10%. Va en blanco con sombra, igual que el .card global.
const SECTION = "bg-surface dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";
const LABEL   = "text-[10px] font-bold uppercase tracking-widest text-content-subtle";

const ORDER_STATUS = {
  borrador:  { label: "Borrador",  color: "text-content-subtle dark:text-white/40", dot: "bg-content-subtle/40 dark:bg-white/20", bg: "bg-surface-2/60 dark:bg-white/[0.03]" },
  pendiente: { label: "Pendiente", color: "text-warning",                           dot: "bg-warning",                            bg: "bg-warning/5"  },
  recibido:  { label: "Recibido",  color: "text-success",                           dot: "bg-success",                            bg: "bg-success/5"  },
};

export default function PurchaseDetails({ state }) {
  const { detail, refreshDetail, confirmOrder, receivePurchase, loading, warehouses = [] } = state;
  const { notify, baseCurrency, activeCurrencies, companyInfo, printerWidth } = useApp();

  // ── Payments ──
  const [payments, setPayments]         = useState([]);
  const [loadingPay, setLoadingPay]     = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm]   = useState(null);
  const [payDetail, setPayDetail]           = useState(null);

  // ── Borrador local state ──
  const [localItems, setLocalItems]             = useState([]);
  const [localSupplier, setLocalSupplier]       = useState(null);
  const [localWarehouseId, setLocalWarehouseId] = useState("");
  const [localNotes, setLocalNotes]             = useState("");
  const [isDirty, setIsDirty]                   = useState(false);
  const [savingChanges, setSavingChanges]       = useState(false);
  const [addModalOpen, setAddModalOpen]         = useState(false);
  const [editingItem, setEditingItem]           = useState(null);
  const [invoiceCurrency, setInvoiceCurrency]   = useState(null);
  const [invoiceRateInput, setInvoiceRateInput] = useState("");

  // Supplier search
  const [supQuery, setSupQuery] = useState("");
  const [supHits, setSupHits]   = useState([]);

  // Init local state
  useEffect(() => {
    if (!detail) return;
    setLocalItems(detail.items || []);
    setLocalSupplier(
      detail.supplier_id ? { id: detail.supplier_id, name: detail.supplier_name, rif: null } : null
    );
    setLocalWarehouseId(detail.warehouse_id ? String(detail.warehouse_id) : "");
    setLocalNotes(detail.notes || "");
    // Moneda y tasa con que se compró: se recuperan de la orden, no de la configuración
    // vigente. Es el dato que dice a cuánto se cerró esa compra ese día.
    const savedRate = parseFloat(detail.exchange_rate);
    setInvoiceCurrency((activeCurrencies || []).find(c => c.id === detail.currency_id) || null);
    setInvoiceRateInput(detail.currency_id && savedRate > 0 ? String(savedRate) : "");
    setIsDirty(false);
    setSupQuery("");
    setSupHits([]);
  }, [detail?.id]);

  // Supplier search
  useEffect(() => {
    if (!["borrador", "pendiente"].includes(detail?.status) || !supQuery.trim()) { setSupHits([]); return; }
    let active = true;
    const t = setTimeout(async () => {
      try {
        const r = await api.customers.getAll({ type: "proveedor", search: supQuery, limit: 15 });
        if (active) setSupHits(r.data || []);
      } catch { if (active) setSupHits([]); }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [supQuery, detail?.status]);

  const loadPayments = useCallback(async () => {
    if (!detail?.id) return;
    setLoadingPay(true);
    try {
      const res = await api.purchases.getPayments(detail.id);
      setPayments(res.data || []);
    } catch (e) { notify(e.message, "err"); }
    finally { setLoadingPay(false); }
  }, [detail?.id, notify]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  if (!detail) return null;

  const orderStatus = detail.status || "recibido";
  const isBorrador  = orderStatus === "borrador";
  const isEditable  = isBorrador || orderStatus === "pendiente";
  const os          = ORDER_STATUS[orderStatus] || ORDER_STATUS.recibido;

  const payStatus  = detail.payment_status || "pendiente";
  const amountPaid = parseFloat(detail.amount_paid || 0);
  const balance    = parseFloat(detail.balance ?? (parseFloat(detail.total) - amountPaid));
  const total      = parseFloat(detail.total || 0);
  const paidPct    = total > 0 ? Math.min(100, (amountPaid / total) * 100) : 0;

  const statusColor = payStatus === "pagado" ? "text-success" : payStatus === "parcial" ? "text-warning" : "text-danger";
  const statusDot   = payStatus === "pagado" ? "bg-success" : payStatus === "parcial" ? "bg-warning" : "bg-danger";
  const statusBg    = payStatus === "pagado" ? "bg-success/5" : payStatus === "parcial" ? "bg-warning/5" : "bg-danger/5";
  const payLabels   = { pagado: "Pagado", parcial: "Parcial", pendiente: "Pendiente" };

  // ── Borrador item helpers ──
  const updateLocalItem = (uid, changes) => {
    setLocalItems(prev => prev.map(item => {
      if ((item.id ?? item.key) !== uid) return item;
      const next     = { ...item, ...changes };
      const pkgSize  = parseFloat(next.package_size)  || 1;
      const pkgQty   = parseFloat(next.package_qty)   || 0;
      const pkgPrice = parseFloat(next.package_price) || 0;
      // Margen vacío = no se toca el precio de venta (ver calcPurchaseItem). Con 0 implícito,
      // editar la línea de un producto con precio manual lo dejaba vendiéndose al costo.
      const marginRaw = String(next.profit_margin ?? "").trim();
      const margin    = marginRaw === "" ? null : parseFloat(marginRaw);
      const hasMargin = margin !== null && !isNaN(margin);
      const unit_cost  = pkgPrice > 0 ? pkgPrice / pkgSize : 0;
      const sale_price = hasMargin ? unit_cost * (1 + margin / 100) : (parseFloat(next.sale_price) || 0);
      return { ...next, unit_cost, sale_price, subtotal: pkgQty * pkgPrice, total_units: pkgQty * pkgSize };
    }));
    setIsDirty(true);
  };

  const deleteLocalItem = (uid) => {
    setLocalItems(prev => prev.filter(i => (i.id ?? i.key) !== uid));
    setIsDirty(true);
  };

  const addLocalItem = (item) => {
    setLocalItems(prev => [...prev, {
      ...item,
      id: undefined,
      key: item.key || Date.now(),
      product_id:   item.product?.id,
      product_name: item.product?.name,
    }]);
    setIsDirty(true);
  };

  const openEditItem = (uid) => {
    const item = localItems.find(i => (i.id ?? i.key) === uid);
    if (item) setEditingItem(item);
  };

  const handleModalAdd = (item) => {
    if (editingItem) {
      const uid = editingItem.id ?? editingItem.key;
      setLocalItems(prev => prev.map(i => {
        if ((i.id ?? i.key) !== uid) return i;
        return {
          ...i,
          ...item,
          id:           editingItem.id,
          key:          editingItem.key ?? i.key,
          product_id:   item.product?.id   ?? editingItem.product_id,
          product_name: item.product?.name ?? editingItem.product_name,
        };
      }));
      setEditingItem(null);
    } else {
      addLocalItem(item);
    }
    setAddModalOpen(false);
    setIsDirty(true);
  };

  const saveDraftChanges = async () => {
    setSavingChanges(true);
    try {
      await api.purchases.update(detail.id, {
        warehouse_id:  localWarehouseId || null,
        supplier_id:   localSupplier?.id   || null,
        supplier_name: localSupplier?.name || null,
        notes:         localNotes || null,
        currency_id:   invoiceCurrency?.id || null,
        exchange_rate: invoiceCurrency ? invoiceRate : 1,
        items: localItems.map(i => ({
          product_id:      i.product_id,
          package_unit:    i.package_unit,
          package_size:    i.package_size,
          package_qty:     i.package_qty,
          package_price:   i.package_price,
          profit_margin:   i.profit_margin,
          lot_number:      i.lot_number      || null,
          expiration_date: i.expiration_date || null,
          update_price:    i.update_price !== false,
        })),
      });
      notify("Borrador actualizado", "success");
      await refreshDetail?.(detail.id);
      setIsDirty(false);
    } catch (e) {
      notify(e.message, "err");
    } finally {
      setSavingChanges(false);
    }
  };

  const handleReceivePendiente = async () => {
    if (!localWarehouseId) {
      notify("Selecciona un almacén destino antes de recibir la mercancía", "err");
      return;
    }
    if (isDirty) {
      await saveDraftChanges();
    }
    receivePurchase?.(detail.id);
  };

  const handlePaySuccess = async () => {
    setShowPayModal(false);
    await refreshDetail?.(detail.id);
    await loadPayments();
  };

  const handleDeletePayment = async (id) => {
    try {
      await api.purchases.removePayment(id);
      notify("Pago eliminado", "success");
      await refreshDetail?.(detail.id);
      await loadPayments();
    } catch (e) { notify(e.message, "err"); }
    setDeleteConfirm(null);
  };

  const grandTotal    = localItems.reduce((s, i) => s + (parseFloat(i.subtotal) || 0), 0);
  // Tasa con la que se cargan los costos de la factura del proveedor. Arranca en la de
  // configuración y se puede escribir: la factura viene con la tasa del día en que el
  // proveedor la emitió, no con la que tenga cargada el sistema hoy.
  const invoiceCurRate = invoiceCurrency ? (parseFloat(invoiceCurrency.exchange_rate) || 1) : 1;
  const invoiceRate    = invoiceCurrency ? resolveRate(invoiceRateInput, invoiceCurRate) : 1;
  const inInvoiceCur   = invoiceRate > 1;
  const invoiceSym    = invoiceCurrency ? (invoiceCurrency.symbol || invoiceCurrency.code) : (baseCurrency?.symbol || "Ref.");
  const nonBaseCurrencies = (activeCurrencies || []).filter(c => !c.is_base);

  // Tasa que corresponde a una moneda al seleccionarla en la cabecera. Si es la moneda con
  // que se guardó la orden vuelve SU tasa, no la de configuración de hoy: alternar de moneda
  // y regresar repreciaba la compra entera (y al guardar pisaba el dato histórico de a cuánto
  // se compró). Para cualquier otra moneda no hay tasa histórica y se cae en la configurada.
  const rateInputFor = (cur) => {
    const savedRate = parseFloat(detail?.exchange_rate);
    return cur && cur.id === detail?.currency_id && savedRate > 0 ? String(savedRate) : "";
  };

  return (
    <div className="flex flex-col gap-3 pb-20 animate-in fade-in duration-300">

      {/* ── CABECERA ── */}
      <div className={`${SECTION} p-5 relative`}>
        {isEditable ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-x-6 gap-y-5 items-start">

            {/* Almacén */}
            <div>
              <p className={`${LABEL} mb-1.5`}>Almacén Destino</p>
              <CustomSelect
                value={localWarehouseId}
                onChange={v => { setLocalWarehouseId(v); setIsDirty(true); }}
                options={warehouses.map(w => ({ value: String(w.id), label: w.name.toUpperCase() }))}
                placeholder="Sin almacén..."
                className="w-full"
              />
            </div>

            {/* Proveedor */}
            <div>
              <p className={`${LABEL} mb-1.5`}>Proveedor</p>
              {localSupplier ? (
                <div className="h-9 flex items-center gap-2 bg-brand-500/5 border border-brand-500/20 rounded-lg px-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-brand-500 uppercase truncate leading-tight">{localSupplier.name}</div>
                  </div>
                  <button
                    onClick={() => { setLocalSupplier(null); setIsDirty(true); }}
                    className="w-4 h-4 flex items-center justify-center rounded bg-brand-500/20 text-brand-500 hover:bg-brand-500 hover:text-black transition-all shrink-0"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={supQuery}
                    onChange={e => setSupQuery(e.target.value)}
                    placeholder="Buscar proveedor..."
                    className="input h-9 pr-8 text-xs"
                  />
                  <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-30 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                  {supQuery.trim() && supHits.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-xl shadow-2xl p-1 max-h-[160px] overflow-y-auto">
                      {supHits.map(s => (
                        <div
                          key={s.id}
                          onClick={() => { setLocalSupplier(s); setSupQuery(""); setSupHits([]); setIsDirty(true); }}
                          className="px-3 py-2 hover:bg-brand-500/10 rounded-lg cursor-pointer transition-colors group"
                        >
                          <div className="text-xs font-bold uppercase group-hover:text-brand-500">{s.name}</div>
                          {s.rif && <div className="text-[9px] text-content-subtle opacity-60">{s.rif}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notas */}
            <div>
              <p className={`${LABEL} mb-1.5`}>Notas / Referencia</p>
              <input
                value={localNotes}
                onChange={e => { setLocalNotes(e.target.value); setIsDirty(true); }}
                placeholder="ej. Factura #1234..."
                className="input h-9 text-xs"
              />
            </div>

            {/* Moneda y tasa de la compra. Es un dato de la orden —a cuánto se compró— y por
                eso vive en la cabecera junto a la referencia y se guarda con el borrador. */}
            {nonBaseCurrencies.length > 0 && (
              <div>
                <p className={`${LABEL} mb-1.5`}>Moneda / Tasa</p>
                {(
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center h-9 rounded-lg overflow-hidden border border-border/40 dark:border-white/10 shrink-0">
                      <button
                        onClick={() => { setInvoiceCurrency(null); setInvoiceRateInput(""); setIsDirty(true); }}
                        className={`h-full px-2 text-[10px] font-black uppercase tracking-wide transition-all ${!invoiceCurrency ? "bg-brand-500 text-white" : "text-content-subtle dark:text-white/30 hover:bg-surface-2 dark:hover:bg-white/[0.06]"}`}
                        title="Costos en moneda base"
                      >
                        {baseCurrency?.symbol || "Ref."}
                      </button>
                      {nonBaseCurrencies.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setInvoiceCurrency(c); setInvoiceRateInput(rateInputFor(c)); setIsDirty(true); }}
                          className={`h-full px-2 text-[10px] font-black uppercase tracking-wide border-l border-border/40 dark:border-white/10 transition-all ${invoiceCurrency?.id === c.id ? "bg-brand-500 text-white" : "text-content-subtle dark:text-white/30 hover:bg-surface-2 dark:hover:bg-white/[0.06]"}`}
                          title={`Costos en ${c.name}`}
                        >
                          {c.code}
                        </button>
                      ))}
                    </div>
                    <input
                      value={invoiceRateInput}
                      onChange={e => { setInvoiceRateInput(e.target.value.replace(/[^\d.,]/g, "")); setIsDirty(true); }}
                      disabled={!invoiceCurrency}
                      placeholder={invoiceCurRate.toFixed(4)}
                      title={invoiceCurrency ? `Tasa de configuración: ${invoiceCurRate.toFixed(4)}` : "Elige la moneda de la factura"}
                      className={`input h-9 text-xs tabular-nums text-center px-1 disabled:opacity-30 ${isRateEdited(invoiceRateInput, invoiceCurRate) ? "!border-warning/60 text-warning" : ""}`}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Estado */}
            <div>
              <p className={`${LABEL} mb-1.5`}>Estado de orden</p>
              <div className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${os.bg}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${os.dot}`} />
                <span className={`text-[11px] font-black uppercase tracking-wide ${os.color}`}>{os.label}</span>
              </div>
            </div>

            {/* Cols 5-6 — Acciones */}
            {isBorrador ? (
              <div className="col-span-2 lg:col-span-2">
                <p className={`${LABEL} mb-1.5 text-center`}>Acciones</p>
                <div className="flex items-center justify-center gap-2">
                  <button onClick={handleReceivePendiente} disabled={loading}
                    className="h-7 px-3 rounded-lg bg-success/10 text-success border border-success/20 text-[10px] font-black uppercase tracking-wide hover:bg-success hover:text-black transition-all active:scale-95 disabled:opacity-50">
                    {loading ? "..." : "Recibir Mercancía ✓"}
                  </button>
                  <button onClick={() => confirmOrder?.(detail.id)} disabled={loading}
                    className="h-7 px-3 rounded-lg bg-warning/10 text-warning border border-warning/20 text-[10px] font-black uppercase tracking-wide hover:bg-warning hover:text-black transition-all active:scale-95 disabled:opacity-50">
                    {loading ? "..." : "Confirmar Orden →"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <p className={`${LABEL} mb-1.5`}>Estado de Pago</p>
                  <div className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${statusBg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                    <span className={`text-[11px] font-black uppercase tracking-wide ${statusColor}`}>{payLabels[payStatus] || payStatus}</span>
                  </div>
                </div>
                <div>
                  <p className={`${LABEL} mb-1.5`}>Acción</p>
                  <button onClick={handleReceivePendiente} disabled={loading}
                    className="h-7 px-3 rounded-lg bg-success/10 text-success border border-success/20 text-[10px] font-black uppercase tracking-wide hover:bg-success hover:text-black transition-all active:scale-95 disabled:opacity-50">
                    {loading ? "..." : "Recibir Mercancía ✓"}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-x-6 gap-y-5 items-start">
            <div>
              <p className={`${LABEL} mb-1`}>Proveedor</p>
              <p className={`text-[13px] font-bold leading-snug ${detail.supplier_name ? "text-content dark:text-white" : "italic text-content-subtle"}`}>
                {detail.supplier_name || "No registrado"}
              </p>
              {detail.supplier_rif && <p className="text-[10px] font-bold text-brand-500 tabular-nums mt-0.5">{detail.supplier_rif}</p>}
            </div>
            <div>
              <p className={`${LABEL} mb-1`}>Almacén</p>
              <p className="text-[13px] font-bold text-content dark:text-white">{detail.warehouse_name || "—"}</p>
            </div>
            <div>
              <p className={`${LABEL} mb-1`}>Registrado por</p>
              <p className="text-[13px] font-bold text-content dark:text-white">{detail.employee_name || "Sistema"}</p>
            </div>
            <div>
              <p className={`${LABEL} mb-1`}>Fecha</p>
              <p className="text-[13px] font-bold text-content dark:text-white tabular-nums">{detail.created_at ? new Date(detail.created_at).toLocaleString("es-VE") : "—"}</p>
            </div>
            {/* Con la orden ya confirmada la tasa es historia: se muestra, no se toca. Es el
                dato que responde "a cuánto compré este lote". */}
            <div>
              <p className={`${LABEL} mb-1`}>Moneda / Tasa</p>
              <p className="text-[13px] font-bold text-content dark:text-white tabular-nums">
                {invoiceCurrency
                  ? `${invoiceCurrency.code} · ${invoiceRate.toFixed(4)}`
                  : <span className="italic text-content-subtle">{baseCurrency?.symbol || "Ref."} · sin conversión</span>}
              </p>
            </div>
            <div>
              <p className={`${LABEL} mb-1.5`}>Estado de orden</p>
              <div className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${os.bg}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${os.dot}`} />
                <span className={`text-[11px] font-black uppercase tracking-wide ${os.color}`}>{os.label}</span>
              </div>
            </div>
            <div>
              <p className={`${LABEL} mb-1.5`}>Estado de pago</p>
              <div className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${statusBg}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
                <span className={`text-[11px] font-black uppercase tracking-wide ${statusColor}`}>{payLabels[payStatus] || payStatus}</span>
              </div>
            </div>
            {detail.notes && (
              <div className="col-span-2 sm:col-span-3 lg:col-span-6 pt-4 border-t border-border/10 dark:border-white/[0.06]">
                <p className={`${LABEL} mb-1`}>Observaciones</p>
                <p className="text-[12px] italic text-content-subtle opacity-70">{detail.notes}</p>
              </div>
            )}
          </div>
        )}

        {isDirty && isEditable && (
          <div className="absolute -top-3 right-4 z-10 flex items-center gap-2 bg-surface-2 dark:bg-surface-dark-2 pl-2.5 pr-1 py-1 rounded-full border border-border/20 dark:border-white/10 shadow-lg animate-in fade-in slide-in-from-top-1 duration-200">
            <span className="text-[9px] font-bold text-warning uppercase tracking-wide opacity-70 whitespace-nowrap">· Sin guardar</span>
            <button
              onClick={saveDraftChanges}
              disabled={savingChanges}
              className="h-6 px-3 rounded-full bg-brand-500 text-black text-[10px] font-black uppercase tracking-wide hover:brightness-105 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              {savingChanges
                ? <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
              }
              Guardar
            </button>
          </div>
        )}
      </div>

      {/* ── PRODUCTOS ── */}
      <div className={`${SECTION} overflow-hidden`}>
        <div className="px-5 py-3 border-b border-border/10 dark:border-white/[0.06] flex items-center justify-between gap-3">
          <div>
            <p className={LABEL}>{orderStatus === "recibido" ? "Productos Recibidos" : "Productos en Orden"}</p>
            {isEditable && localItems.length > 0 && (
              <p className="text-[9px] font-bold text-content-subtle/60 dark:text-white/25 mt-0.5">
                {localItems.length} {localItems.length === 1 ? "producto" : "productos"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditable && (
              <button
                onClick={() => setAddModalOpen(true)}
                className="h-7 px-3 rounded-lg bg-brand-500/10 text-brand-500 border border-brand-500/20 text-[10px] font-black uppercase tracking-wide flex items-center gap-1.5 hover:bg-brand-500/20 transition-all active:scale-95"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>
                Agregar
              </button>
            )}
            {(isBorrador ? localItems : (detail.items || [])).length > 0 && (
              <button
                onClick={() => printPurchaseOrderDoc(
                  detail,
                  isBorrador ? localItems : (detail.items || []),
                  companyInfo,
                  printerWidth
                )}
                className="h-7 px-3 rounded-lg bg-surface-2 dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] text-[10px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 flex items-center gap-1.5 hover:bg-surface-3 dark:hover:bg-white/[0.07] transition-all active:scale-95"
                title="Ticket para el depósito: lista de productos con casillas para marcar"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Ticket
              </button>
            )}
            {/* La hoja carta es la otra mitad: el comprobante que se archiva y con el que se
                cuadra con el proveedor, con costos, total y saldo. Mismo par que en las notas
                de traslado (térmica + carta). */}
            {(isBorrador ? localItems : (detail.items || [])).length > 0 && (
              <button
                onClick={() => printPurchaseLetter(
                  detail,
                  isBorrador ? localItems : (detail.items || []),
                  companyInfo,
                  baseCurrency,
                  activeCurrencies
                )}
                className="h-7 px-3 rounded-lg bg-danger/5 border border-danger/25 text-[10px] font-black uppercase tracking-wide text-danger flex items-center gap-1.5 hover:bg-danger hover:text-white transition-all active:scale-95"
                title="Comprobante en hoja carta, con costos y saldo al proveedor"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                PDF
              </button>
            )}
            {!isEditable && (
              <p className={`${LABEL} tabular-nums`}>{(detail.items || []).length} items</p>
            )}
          </div>
        </div>

        <PurchaseItemsTable
          items={isEditable ? localItems : (detail.items || [])}
          orderStatus={orderStatus}
          onUpdate={updateLocalItem}
          onDelete={deleteLocalItem}
          onEdit={openEditItem}
          invoiceRate={invoiceRate}
          invoiceSym={invoiceSym}
        />

        {/* Footer editable: total */}
        {isEditable && localItems.length > 0 && (
          <div className="px-5 py-3 border-t border-border/10 dark:border-white/[0.06] flex items-center justify-between gap-4">
            <div>
              <div className={`${LABEL} mb-0.5`}>Total Estimado</div>
              {invoiceRate > 1 ? (
                <>
                  <div className="text-lg font-black text-brand-500 tabular-nums">{invoiceSym} {fmt2(grandTotal * invoiceRate)}</div>
                  <div className="text-[11px] font-bold text-content-subtle dark:text-white/45 tabular-nums mt-0.5">≈ Ref. {fmt2(grandTotal)}</div>
                </>
              ) : (
                <div className="text-lg font-black text-brand-500 tabular-nums">Ref. {fmt2(grandTotal)}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── FINANCIERO + PAGOS (solo no-borrador) ── */}
      {!isBorrador && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

          <div className={`${SECTION} p-5`}>
            <p className={`${LABEL} mb-4`}>Resumen Financiero</p>
            <div className="mb-5">
              <div className="flex justify-between items-center mb-2">
                <span className={LABEL}>{paidPct.toFixed(1)}% saldado</span>
                <div className="text-right">
                  {/* Con moneda de compra, manda lo que decía la factura del proveedor: el
                      total en esa moneda arriba y la base como referencia. */}
                  {inInvoiceCur ? (
                    <>
                      <span className="text-[13px] font-black text-content dark:text-white tabular-nums block leading-none">{invoiceSym} {fmt2(total * invoiceRate)}</span>
                      <span className="text-[11px] font-bold text-content-subtle dark:text-white/45 tabular-nums">≈ Ref. {fmt2(total)}</span>
                    </>
                  ) : (
                    <span className="text-[11px] font-black text-content dark:text-white tabular-nums">Ref. {fmt2(total)}</span>
                  )}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-border/20 dark:bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${paidPct}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-2 dark:bg-white/[0.02] border border-border/60 dark:border-white/[0.05] rounded-xl p-3.5">
                <p className={`${LABEL} mb-1.5`}>Total Pagado</p>
                <p className="text-[15px] font-black text-content dark:text-white tabular-nums tracking-tight leading-none">Ref. {fmt2(amountPaid)}</p>
                {inInvoiceCur && (
                  <p className="text-[11px] font-bold text-content-subtle dark:text-white/45 tabular-nums mt-1">{invoiceSym} {fmt2(amountPaid * invoiceRate)}</p>
                )}
                <p className="text-[9px] font-bold text-success uppercase tracking-widest mt-1.5">Conciliado</p>
              </div>
              <div className="bg-brand-500/[0.06] border border-brand-500/[0.12] rounded-xl p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 opacity-60 mb-1.5">Saldo Pendiente</p>
                <p className="text-[15px] font-black text-brand-500 tabular-nums tracking-tight leading-none">Ref. {fmt2(balance)}</p>
                {inInvoiceCur && (
                  <p className="text-[10px] font-bold text-brand-500/50 tabular-nums mt-1">{invoiceSym} {fmt2(balance * invoiceRate)}</p>
                )}
                <p className="text-[9px] font-bold text-brand-500/50 uppercase tracking-widest mt-1.5">Cuentas x Pagar</p>
              </div>
            </div>
          </div>

          <div className={`${SECTION} overflow-hidden flex flex-col`}>
            <div className="px-5 py-3 border-b border-border/10 dark:border-white/[0.06] flex items-center justify-between shrink-0">
              <p className={LABEL}>Historial de Pagos</p>
              <button onClick={loadPayments} disabled={loadingPay} className="p-1.5 hover:bg-surface-2 dark:hover:bg-white/5 rounded-lg transition-colors text-content-subtle hover:text-brand-500">
                <svg className={`w-3.5 h-3.5 ${loadingPay ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto max-h-[240px]">
              {loadingPay ? (
                <div className="flex items-center justify-center p-10"><p className={`${LABEL} animate-pulse`}>Cargando...</p></div>
              ) : payments.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-10 opacity-20">
                  <svg className="w-8 h-8 mb-2 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
                  <p className={LABEL}>Sin pagos registrados</p>
                </div>
              ) : (
                <div className="divide-y divide-border/10 dark:divide-white/[0.05]">
                  {payments.map(p => {
                    const rate   = parseFloat(p.exchange_rate || 1);
                    const cur    = activeCurrencies?.find(c => c.id === p.currency_id);
                    const sym    = cur?.symbol || baseCurrency?.symbol || "Ref.";
                    const isBase = !cur || cur.is_base;
                    return (
                      <div
                        key={p.id}
                        onClick={() => setPayDetail(p)}
                        className="px-5 py-3.5 flex items-center gap-3 group hover:bg-surface-2 dark:hover:bg-white/[0.03] cursor-pointer transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.journal_color || "#22c55e" }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-bold text-content dark:text-white truncate">{p.journal_name || "—"}</span>
                            {p.reference_number && <span className="text-[9px] font-black text-brand-500 px-1.5 py-0.5 bg-brand-500/10 rounded-md shrink-0">#{p.reference_number}</span>}
                          </div>
                          <p className={`${LABEL} mt-0.5 normal-case`}>
                            {fmtDateShort(p.reference_date || p.created_at)}
                            {p.notes && <span className="ml-1.5 italic opacity-70 font-medium">&middot; {p.notes}</span>}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {!isBase ? (
                            <>
                              <p className="text-[12px] font-black text-success tabular-nums">+{sym}{(parseFloat(p.amount) * rate).toFixed(2)}</p>
                              <p className="text-[10px] font-bold text-content-subtle tabular-nums">Ref. {parseFloat(p.amount).toFixed(2)}</p>
                            </>
                          ) : (
                            <p className="text-[12px] font-black text-success tabular-nums">+Ref. {parseFloat(p.amount).toFixed(2)}</p>
                          )}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteConfirm(p); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-danger/10 text-danger transition-all active:scale-90 shrink-0"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {payStatus !== "pagado" && (
              <div className="shrink-0 px-5 py-3 border-t border-border/10 dark:border-white/[0.06] flex justify-center">
                <button onClick={() => setShowPayModal(true)} className="h-8 px-8 rounded-xl bg-brand-500 text-black text-[10px] font-black uppercase tracking-widest hover:brightness-105 transition-all active:scale-95">
                  + Registrar Pago
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modales */}
      {(addModalOpen || !!editingItem) && (
        <ProductSelectorModal
          open={addModalOpen || !!editingItem}
          onClose={() => { setAddModalOpen(false); setEditingItem(null); }}
          onAdd={handleModalAdd}
          existingItems={localItems}
          editItem={editingItem}
          invoiceRate={invoiceRate}
          invoiceSym={invoiceSym}
          warehouseId={localWarehouseId || detail?.warehouse_id || null}
          showLotFields={orderStatus === "pendiente"}
        />
      )}

      {showPayModal && (
        <PurchasePaymentModal
          purchase={{ ...detail, balance, amount_paid: amountPaid }}
          onClose={() => setShowPayModal(false)}
          onSuccess={handlePaySuccess}
        />
      )}

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="¿Eliminar pago?"
        message={`¿Seguro que deseas anular este pago de Ref. ${parseFloat(deleteConfirm?.amount || 0).toLocaleString()}? Se revertirá el saldo de la compra.`}
        onConfirm={() => handleDeletePayment(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
        type="danger"
        confirmText="Eliminar"
        cancelText="Cancelar"
      />

      {/* ── DETALLE DE PAGO ── */}
      {payDetail && (
        <PayDetailModal
          payment={payDetail}
          activeCurrencies={activeCurrencies}
          baseCurrency={baseCurrency}
          onClose={() => setPayDetail(null)}
          onDelete={() => { setPayDetail(null); setDeleteConfirm(payDetail); }}
        />
      )}

    </div>
  );
}

function PayDetailModal({ payment: pd, activeCurrencies, baseCurrency, onClose, onDelete }) {
  const rate   = parseFloat(pd.exchange_rate || 1);
  const cur    = activeCurrencies?.find(c => c.id === pd.currency_id);
  const sym    = cur?.symbol || baseCurrency?.symbol || "Ref.";
  const isBase = !cur || cur.is_base;

  return (
    <Modal open onClose={onClose} title="DETALLE DE PAGO" width={380}>
      <div className="rounded-xl bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.05]">
        <DRow label="Diario">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pd.journal_color || "#22c55e" }} />
            {pd.journal_name || "—"}
          </span>
        </DRow>
        <DRow label="Monto abonado">
          <span className="text-success font-black">
            {!isBase
              ? `${sym}${(parseFloat(pd.amount) * rate).toFixed(2)} · Ref. ${parseFloat(pd.amount).toFixed(2)}`
              : `Ref. ${parseFloat(pd.amount).toFixed(2)}`}
          </span>
        </DRow>
        {!isBase && (
          <DRow label="Tasa aplicada">
            <span className="tabular-nums">{rate.toFixed(4)} {cur?.code || ""}</span>
          </DRow>
        )}
        <DRow label="Fecha de referencia">{fmtDateShort(pd.reference_date || pd.created_at)}</DRow>
        <DRow label="N° Referencia">{pd.reference_number || <span className="opacity-30">—</span>}</DRow>
        <DRow label="Empleado">{pd.employee_name || <span className="opacity-30">—</span>}</DRow>
        {pd.notes && <DRow label="Notas"><span className="italic opacity-70">{pd.notes}</span></DRow>}
        <DRow label="Registrado">{pd.created_at ? new Date(pd.created_at).toLocaleString("es-VE") : "—"}</DRow>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={onDelete}
          className="h-8 px-4 rounded-xl border border-danger/30 text-danger text-[10px] font-black uppercase tracking-wide hover:bg-danger/10 transition-all"
        >
          Eliminar pago
        </button>
      </div>
    </Modal>
  );
}

function DRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-content-subtle whitespace-nowrap shrink-0 mt-0.5">{label}</span>
      <span className="text-[12px] font-bold text-content dark:text-white text-right">{children}</span>
    </div>
  );
}
