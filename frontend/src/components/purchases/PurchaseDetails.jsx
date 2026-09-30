import { useState, useEffect, useCallback } from "react";
import { Spinner } from "../ui/Spinner";
import PurchaseItemsTable from "./PurchaseItemsTable";
import PurchasePaymentModal from "./PurchasePaymentModal";
import ProductSelectorModal from "./ProductSelectorModal";
import ConfirmModal from "../ui/ConfirmModal";
import Modal from "../ui/Modal";
import CustomSelect from "../ui/CustomSelect";
import { resolveRate, isRateEdited } from "../ui/RateField";
import { api } from "../../services/api";
import { fmtDateShort, todayISO, toNameCase } from "../../helpers";
import DatePicker from "../ui/DatePicker";
import StatusMark from "../ui/StatusMark";
import { fmtTime } from "../../helpers/dates";
import { useApp } from "../../context/AppContext";
import { printPurchaseOrderDoc } from "../../helpers/printPurchaseOrder";
import { printPurchaseLetter } from "../../helpers/printPurchaseLetter";

const fmt2 = (num) => Number(num || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
// En claro el fondo de página ya es surface-2 (#f9fafb), así que un panel surface-2 era
// invisible: mismo color, borde al 10%. Va en blanco con sombra, igual que el .card global.
const SECTION = "bg-surface dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";
const LABEL   = "text-[12px] font-medium text-content-subtle";

// Estados con el mismo criterio que las facturas (ui/StatusMark): lo que terminó bien va en
// gris con su marca y solo lo que falta por hacer lleva color.
const ORDER_STATUS = {
  borrador:  { label: "Borrador",   tone: "neutral" },
  pendiente: { label: "Por recibir", tone: "warning" },
  // Orden abierta que ya metió mercancía al inventario: se llega acá con el modo recepción,
  // cargando la factura mientras el camión se descarga.
  parcial:   { label: "Recibiendo", tone: "info" },
  recibido:  { label: "Recibida",   tone: "success", quiet: "check" },
};
const PAY_STATUS = {
  pagado:    { label: "Pagada",    tone: "success", quiet: "check" },
  parcial:   { label: "Pago parcial", tone: "warning" },
  pendiente: { label: "Por pagar", tone: "danger" },
};

export default function PurchaseDetails({ state }) {
  const { detail, refreshDetail, confirmOrder, receivePurchase, loading, warehouses = [], onProductsUpdated } = state;
  const { notify, baseCurrency, activeCurrencies, companyInfo, printerWidth, can } = useApp();
  // El vencimiento lo ajusta quien edita la orden o quien le paga al proveedor (misma regla
  // que la ruta).
  const canSetDue = can("purchases.edit") || can("purchases.pay");
  const [savingDue, setSavingDue] = useState(false);

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
  // Modo recepción: con esto prendido, guardar mete al stock lo que falte de cada línea y la
  // orden queda abierta. Vive también acá —no solo en el alta— porque después de guardar el
  // borrador esta es la pantalla donde se le siguen agregando productos.
  const [localReceiving, setLocalReceiving]     = useState(false);

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
    setLocalReceiving(!!detail.receiving_mode);
    // Moneda y tasa con que se compró: se recuperan de la orden, no de la configuración
    // vigente. Es el dato que dice a cuánto se cerró esa compra ese día.
    const savedRate = parseFloat(detail.exchange_rate);
    setInvoiceCurrency((activeCurrencies || []).find(c => c.id === detail.currency_id) || null);
    setInvoiceRateInput(detail.currency_id && savedRate > 0 ? String(savedRate) : "");
    setIsDirty(false);
    setSupQuery("");
    setSupHits([]);
  }, [detail?.id]);

  // El efecto de arriba solo corre al ABRIR otra orden. Pero `detail` se recarga del servidor
  // cada vez que se guarda, se recibe o se paga, y es ahí donde las líneas recién agregadas
  // reciben su id definitivo. Sin re-sincronizar, `localItems` se queda con `id: undefined`
  // en esas líneas y el siguiente guardado las manda sin id: el servidor las toma por líneas
  // nuevas y da por quitadas las originales (que ya movieron inventario). Se salta cuando hay
  // cambios sin guardar, para no pisar lo que el usuario está tecleando.
  useEffect(() => {
    if (!detail?.items || isDirty) return;
    setLocalItems(detail.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.items]);

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
  // 'parcial' se sigue editando: es una orden abierta a la que se le van sumando líneas
  // mientras la mercancía ya entró.
  const isEditable  = isBorrador || orderStatus === "pendiente" || orderStatus === "parcial";
  const payStatus  = detail.payment_status || "pendiente";
  const amountPaid = parseFloat(detail.amount_paid || 0);
  const balance    = parseFloat(detail.balance ?? (parseFloat(detail.total) - amountPaid));
  const total      = parseFloat(detail.total || 0);
  const paidPct    = total > 0 ? Math.min(100, (amountPaid / total) * 100) : 0;

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
    // Una línea que ya metió mercancía es la única constancia de ese movimiento: quitarla
    // dejaría stock que nada explica, y la anulación de la orden no lo devolvería. El
    // backend lo rechaza igual; acá se avisa antes de que el usuario pierda el guardado.
    const linea = localItems.find(i => (i.id ?? i.key) === uid);
    if (parseFloat(linea?.received_units || 0) > 0) {
      notify(`"${linea.product_name}" ya entró al inventario con esta orden: no se puede quitar. Anula la orden completa si te equivocaste.`, "err");
      return;
    }
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
      const guardado = await api.purchases.update(detail.id, {
        warehouse_id:  localWarehouseId || null,
        supplier_id:   localSupplier?.id   || null,
        supplier_name: localSupplier?.name || null,
        notes:         localNotes || null,
        currency_id:   invoiceCurrency?.id || null,
        exchange_rate: invoiceCurrency ? invoiceRate : 1,
        receiving_mode: localReceiving,
        items: localItems.map(i => ({
          // El id de la línea guardada: sin él el backend la borra y la recrea, y con eso se
          // pierde cuántas unidades ya entraron al inventario.
          ...(i.id ? { id: i.id } : {}),
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
      notify(localReceiving ? "Guardado y cargado al stock" : "Borrador actualizado", "success");
      // Las líneas vuelven del servidor con su id y con cuántas unidades ya entraron. Se
      // adoptan de una vez —sin esperar al refresco— porque el próximo guardado necesita
      // esos ids para actualizar las líneas en su sitio en vez de recrearlas.
      if (guardado?.data?.items) setLocalItems(guardado.data.items);
      setIsDirty(false);
      await refreshDetail?.(detail.id);
      // Con el modo prendido el guardado movió inventario: la grilla de productos tiene que
      // enterarse, o seguiría mostrando el cero del estante.
      if (localReceiving) onProductsUpdated?.();
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
      const res = await api.purchases.removePayment(id);
      notify(res.message || "Pago eliminado", "success");
      await refreshDetail?.(detail.id);
      await loadPayments();
    } catch (e) { notify(e.message, "err"); }
    setDeleteConfirm(null);
  };

  // null = volver al plazo del proveedor.
  const saveDueDate = async (value) => {
    if (savingDue) return;
    setSavingDue(true);
    try {
      await api.purchases.setDueDate(detail.id, value || null);
      notify(value ? "Vencimiento actualizado" : "Vencimiento según el crédito del proveedor");
      await refreshDetail?.(detail.id);
    } catch (e) { notify(e.message, "err"); }
    finally { setSavingDue(false); }
  };

  const dueDate     = detail.effective_due_date || null;
  const daysOverdue = dueDate ? Math.round((new Date(todayISO()) - new Date(dueDate)) / 86400000) : null;

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
          <div>
            {/* Estado y acciones arriba; los datos de la orden debajo, en cuatro campos con aire.
                Antes todo iba en una fila de siete columnas y las acciones quedaban como
                pastillas de colores apretadas al final. */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <StatusMark status={orderStatus} map={ORDER_STATUS} />
                {!isBorrador && <StatusMark status={payStatus} map={PAY_STATUS} />}
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {isBorrador && (
                  <button onClick={() => confirmOrder?.(detail.id)} disabled={loading}
                    title="La orden queda enviada al proveedor, esperando la mercancía"
                    className="btn-outline flex-1 sm:flex-none justify-center h-10 sm:h-9 px-4 rounded-lg text-[13px] font-medium active:scale-95 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap">
                    {loading && <Spinner className="h-3 w-3" />}
                    Confirmar<span className="hidden sm:inline"> orden</span>
                  </button>
                )}
                <button onClick={handleReceivePendiente} disabled={loading}
                  title="Todo lo de la orden entra al stock del almacén destino"
                  className="btn-accent flex-1 sm:flex-none justify-center h-10 sm:h-9 px-4 rounded-lg text-[13px] font-semibold active:scale-95 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap">
                  {loading ? <Spinner className="h-3 w-3" /> : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                  )}
                  Recibir<span className="hidden sm:inline"> mercancía</span>
                </button>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border/60 dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-4">
              {/* Almacén */}
              <div>
                <p className={`${LABEL} mb-1.5`}>Almacén destino</p>
                <CustomSelect
                  value={localWarehouseId}
                  onChange={v => { setLocalWarehouseId(v); setIsDirty(true); }}
                  options={warehouses.map(w => ({ value: String(w.id), label: toNameCase(w.name) }))}
                  placeholder="Elige el almacén"
                  className="w-full"
                  height="h-10"
                />
              </div>

              {/* Proveedor */}
              <div>
                {/* Marcado como requerido: sin él la orden no se puede confirmar ni recibir,
                    y es mejor decirlo acá que dejar que lo descubra al darle al botón. */}
                <p className={`${LABEL} mb-1.5`}>Proveedor <span className="text-red-500">*</span></p>
                {localSupplier ? (
                  <div className="h-10 flex items-center gap-2 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] pl-3 pr-1">
                    <span className="w-6 h-6 rounded-full bg-surface-3 dark:bg-white/[0.08] text-[11px] font-semibold text-content-muted dark:text-white/70 flex items-center justify-center shrink-0">
                      {(localSupplier.name || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0 text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(localSupplier.name)}</span>
                    <button
                      onClick={() => { setLocalSupplier(null); setIsDirty(true); }}
                      className="row-icon !w-7 !h-7 shrink-0"
                      title="Cambiar proveedor"
                      aria-label="Cambiar proveedor"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input
                      value={supQuery}
                      onChange={e => setSupQuery(e.target.value)}
                      placeholder="Buscar proveedor…"
                      autoComplete="off"
                      className="input h-10 pl-9 text-[13px]"
                    />
                    {supQuery.trim() && supHits.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white dark:bg-surface-dark-2 border border-border dark:border-white/10 rounded-xl shadow-[0_16px_40px_-12px_rgb(0_0_0/0.3)] p-1 max-h-[200px] overflow-y-auto popover-in">
                        {supHits.map(s => (
                          <button
                            key={s.id}
                            onClick={() => { setLocalSupplier(s); setSupQuery(""); setSupHits([]); setIsDirty(true); }}
                            className="w-full text-left px-3 py-2 hover:bg-surface-2 dark:hover:bg-white/[0.05] rounded-lg transition-colors"
                          >
                            <div className="text-[13px] font-medium text-content dark:text-white">{toNameCase(s.name)}</div>
                            {s.rif && <div className="text-[12px] text-content-subtle tabular-nums">{s.rif}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Notas */}
              <div>
                <p className={`${LABEL} mb-1.5`}>Notas o factura del proveedor</p>
                <input
                  value={localNotes}
                  onChange={e => { setLocalNotes(e.target.value); setIsDirty(true); }}
                  placeholder="Ej: Factura 1234"
                  autoComplete="off"
                  className="input h-10 text-[13px]"
                />
              </div>

              {/* Moneda y tasa de la compra. Es un dato de la orden —a cuánto se compró— y por
                  eso vive en la cabecera junto a la referencia y se guarda con el borrador. */}
              {nonBaseCurrencies.length > 0 && (
                <div>
                  <p className={`${LABEL} mb-1.5`}>Moneda de la factura</p>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center p-[3px] gap-[2px] rounded-lg bg-surface-3 dark:bg-white/[0.06] h-10 shrink-0">
                      {[{ id: null, code: baseCurrency?.symbol || "Ref.", title: "Costos en moneda base" },
                        ...nonBaseCurrencies.map(c => ({ id: c.id, code: c.code, title: `Costos en ${c.name}`, cur: c }))].map(o => {
                        const on = o.id === null ? !invoiceCurrency : invoiceCurrency?.id === o.id;
                        return (
                          <button key={o.id ?? "base"} title={o.title}
                            onClick={() => {
                              if (o.id === null) { setInvoiceCurrency(null); setInvoiceRateInput(""); }
                              else { setInvoiceCurrency(o.cur); setInvoiceRateInput(rateInputFor(o.cur)); }
                              setIsDirty(true);
                            }}
                            className={`h-full px-3 rounded-md text-[12px] transition-all ${on
                              ? "bg-white dark:bg-white/15 font-semibold text-content dark:text-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)]"
                              : "font-medium text-content-subtle hover:text-content dark:hover:text-white"}`}>
                            {o.code}
                          </button>
                        );
                      })}
                    </div>
                    {invoiceCurrency && (
                      <div className="relative flex-1 min-w-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">Tasa</span>
                        <input
                          value={invoiceRateInput}
                          onChange={e => { setInvoiceRateInput(e.target.value.replace(/[^\d.,]/g, "")); setIsDirty(true); }}
                          placeholder={invoiceCurRate.toFixed(4)}
                          title={`Tasa de configuración: ${invoiceCurRate.toFixed(4)}`}
                          autoComplete="off"
                          className={`input h-10 pl-11 text-[13px] tabular-nums text-right ${isRateEdited(invoiceRateInput, invoiceCurRate) ? "!border-amber-500/60" : ""}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            {/* Lo que se busca al abrir una compra: a quién, cuánto y si ya se pagó. El resto
                de los datos del documento va debajo, en letra de ficha. */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <StatusMark status={orderStatus} map={ORDER_STATUS} />
                  <StatusMark status={payStatus} map={PAY_STATUS} />
                </div>
                <p className={`${LABEL} mt-3`}>Proveedor</p>
                <h2 className={`text-[20px] font-semibold tracking-tight leading-tight ${detail.supplier_name ? "text-content dark:text-white" : "text-content-subtle"}`}>
                  {toNameCase(detail.supplier_name) || "Sin proveedor"}
                </h2>
                {detail.supplier_rif && <p className="text-[12px] text-content-subtle tabular-nums mt-0.5">RIF {detail.supplier_rif}</p>}
              </div>
              <div className="sm:text-right shrink-0">
                <p className={LABEL}>Total de la compra</p>
                {inInvoiceCur ? (
                  <>
                    <p className="text-[26px] font-bold tracking-tight tabular-nums leading-tight text-content dark:text-white">{invoiceSym} {fmt2(total * invoiceRate)}</p>
                    <p className="text-[12px] text-content-subtle tabular-nums">≈ Ref. {fmt2(total)}</p>
                  </>
                ) : (
                  <p className="text-[26px] font-bold tracking-tight tabular-nums leading-tight text-content dark:text-white">Ref. {fmt2(total)}</p>
                )}
                <p className={`text-[13px] mt-1 tabular-nums ${balance > 0.005 ? "text-content dark:text-white" : "text-content-subtle"}`}>
                  {balance > 0.005 ? <>Debe <span className="font-semibold">Ref. {fmt2(balance)}</span></> : "Sin saldo pendiente"}
                </p>
              </div>
            </div>

            <dl className="mt-5 pt-4 border-t border-border/60 dark:border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
              <div>
                <dt className={LABEL}>Fecha</dt>
                <dd className="text-[13px] font-medium text-content dark:text-white tabular-nums mt-0.5">
                  {detail.created_at ? `${fmtDateShort(detail.created_at)} · ${fmtTime(detail.created_at)}` : "—"}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Almacén</dt>
                <dd className="text-[13px] font-medium text-content dark:text-white mt-0.5">{toNameCase(detail.warehouse_name) || "—"}</dd>
              </div>
              <div>
                <dt className={LABEL}>Registró</dt>
                <dd className="text-[13px] font-medium text-content dark:text-white mt-0.5">{toNameCase(detail.employee_name) || "Sistema"}</dd>
              </div>
              {/* Con la orden ya confirmada la tasa es historia: se muestra, no se toca. Es el
                  dato que responde "a cuánto compré este lote". */}
              <div>
                <dt className={LABEL}>Moneda</dt>
                <dd className="text-[13px] font-medium text-content dark:text-white tabular-nums mt-0.5">
                  {invoiceCurrency
                    ? `${invoiceCurrency.code} a ${invoiceRate.toLocaleString("es-VE", { maximumFractionDigits: 4 })}`
                    : `${baseCurrency?.symbol || "Ref."}, sin conversión`}
                </dd>
              </div>
            </dl>

            {detail.notes && (
              <div className="mt-4 rounded-lg bg-surface-2 dark:bg-white/[0.03] px-3 py-2 text-[13px] text-content-muted dark:text-white/70">
                <span className="text-content-subtle">Notas · </span>{detail.notes}
              </div>
            )}
          </div>
        )}

        {isDirty && isEditable && (
          <div className="absolute -top-3 right-4 z-10 flex items-center gap-2 bg-surface-2 dark:bg-surface-dark-2 pl-2.5 pr-1 py-1 rounded-full border border-border/20 dark:border-white/10 shadow-lg animate-in fade-in slide-in-from-top-1 duration-200">
            <span className="text-[10px] font-semibold text-warning uppercase tracking-wide opacity-70 whitespace-nowrap">· Sin guardar</span>
            <button
              onClick={saveDraftChanges}
              disabled={savingChanges}
              className="h-6 px-3 rounded-full btn-accent text-[11px] font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              {savingChanges
                ? <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
              }
              {localReceiving ? "Guardar y cargar" : "Guardar"}
            </button>
          </div>
        )}
      </div>

      {/* ── PRODUCTOS ── */}
      <div className={`${SECTION} overflow-hidden`}>
        {/* En el teléfono los botones de imprimir quedan solo con su icono y "Agregar" se
            acorta: con el texto completo no cabían junto al título y se salían de la tarjeta. */}
        <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-content dark:text-white truncate">{orderStatus === "recibido" ? "Productos recibidos" : <><span className="sm:hidden">Productos</span><span className="hidden sm:inline">Productos de la orden</span></>}</p>
            <p className="text-[12px] text-content-subtle">
              {(isEditable ? localItems : (detail.items || [])).length} {(isEditable ? localItems : (detail.items || [])).length === 1 ? "producto" : "productos"}
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isEditable && (
              <button
                onClick={() => localWarehouseId && setAddModalOpen(true)}
                disabled={!localWarehouseId}
                title={!localWarehouseId ? "Selecciona primero el almacén destino" : undefined}
                className="btn-outline h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4"/></svg>
                Agregar<span className="hidden sm:inline"> producto</span>
              </button>
            )}
            {(isEditable ? localItems : (detail.items || [])).length > 0 && (
              <button
                onClick={() => printPurchaseOrderDoc(
                  detail,
                  isEditable ? localItems : (detail.items || []),
                  companyInfo,
                  printerWidth
                )}
                className="btn-outline h-8 px-2.5 sm:px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 active:scale-95"
                title="Ticket para el depósito: lista de productos con casillas para marcar"
                aria-label="Imprimir ticket"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span className="hidden sm:inline">Ticket</span>
              </button>
            )}
            {/* La hoja carta es la otra mitad: el comprobante que se archiva y con el que se
                cuadra con el proveedor, con costos, total y saldo. Mismo par que en las notas
                de traslado (térmica + carta). */}
            {(isEditable ? localItems : (detail.items || [])).length > 0 && (
              <button
                onClick={() => printPurchaseLetter(
                  detail,
                  isEditable ? localItems : (detail.items || []),
                  companyInfo,
                  baseCurrency,
                  activeCurrencies
                )}
                className="btn-outline h-8 px-2.5 sm:px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 active:scale-95"
                title="Comprobante en hoja carta, con costos y saldo al proveedor"
                aria-label="Comprobante en PDF"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden sm:inline">PDF</span>
              </button>
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
          forceLots={localReceiving}
        />

        {/* Modo recepción. Está acá además de en el alta porque esta es la pantalla donde se
            le siguen agregando productos a una orden ya guardada, que es justo el caso: la
            mercancía llegó, hay que venderla ya, y la factura se termina de cargar después. */}
        {/* Pie de la orden editable: el modo recepción a la izquierda y el total a la derecha,
            en una sola franja. */}
        {isEditable && (
          <div className="px-5 py-4 border-t border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.015] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0 max-w-xl">
              <button
                type="button"
                onClick={() => { setLocalReceiving(v => !v); setIsDirty(true); }}
                aria-pressed={localReceiving}
                className="flex items-start gap-3 text-left"
              >
                <span className={`mt-0.5 w-9 h-5 shrink-0 rounded-full p-0.5 transition-colors ${localReceiving ? "bg-brand-500" : "bg-content-subtle/30 dark:bg-white/15"}`}>
                  <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${localReceiving ? "translate-x-4" : ""}`} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-content dark:text-white">
                    Ir recibiendo{localReceiving ? " · activado" : ""}
                  </span>
                  <span className="block text-[12px] text-content-subtle mt-0.5 leading-snug">
                    {localReceiving
                      ? "Al guardar, cada producto entra al stock de una vez. La orden queda abierta para seguir cargándola."
                      : "La mercancía entra al stock solo cuando le des a “Recibir mercancía”."}
                  </span>
                </span>
              </button>
              {localReceiving && (!localWarehouseId || !localSupplier) && (
                <p className="text-[12px] font-medium text-red-600 dark:text-red-400 mt-2 pl-12">
                  Falta {!localWarehouseId ? "el almacén de destino" : "el proveedor"}: sin eso la mercancía no puede entrar.
                </p>
              )}
            </div>
            {localItems.length > 0 && (
              <div className="sm:text-right shrink-0">
                <div className={LABEL}>Total de la orden</div>
                {invoiceRate > 1 ? (
                  <>
                    <div className="text-[22px] font-bold tracking-tight text-content dark:text-white tabular-nums leading-tight">{invoiceSym} {fmt2(grandTotal * invoiceRate)}</div>
                    <div className="text-[12px] text-content-subtle tabular-nums">≈ Ref. {fmt2(grandTotal)}</div>
                  </>
                ) : (
                  <div className="text-[22px] font-bold tracking-tight text-content dark:text-white tabular-nums leading-tight">Ref. {fmt2(grandTotal)}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ESTADO DE CUENTA + PAGOS (solo no-borrador) ── */}
      {!isBorrador && (() => {
        // El saldo solo se pinta cuando pide atención: vencido en rojo, por vencer en ámbar.
        const debe      = balance > 0.005;
        const vencida   = debe && daysOverdue > 0;
        const porVencer = debe && daysOverdue != null && daysOverdue <= 0 && daysOverdue >= -7;
        const saldoTone = vencida ? "text-red-600 dark:text-red-400" : porVencer ? "text-amber-700 dark:text-amber-400" : debe ? "text-content dark:text-white" : "text-content-subtle";
        const enMoneda  = (n) => inInvoiceCur ? <span className="block text-[12px] font-normal text-content-subtle tabular-nums mt-0.5">{invoiceSym} {fmt2(n * invoiceRate)}</span> : null;

        return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

          <div className={`${SECTION} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-semibold text-content dark:text-white">Estado de cuenta</p>
              <StatusMark status={payStatus} map={PAY_STATUS} />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-px rounded-xl overflow-hidden bg-border/70 dark:bg-white/[0.06] border border-border/70 dark:border-white/[0.06]">
              {[
                { label: "Total", val: total, cls: "text-content dark:text-white" },
                { label: "Pagado", val: amountPaid, cls: "text-content dark:text-white" },
                { label: "Saldo", val: balance, cls: saldoTone, strong: true },
              ].map(k => (
                <div key={k.label} className="px-4 py-3 bg-surface-2 dark:bg-surface-dark min-w-0">
                  <p className={LABEL}>{k.label}</p>
                  <p className={`mt-1 text-[16px] tabular-nums truncate ${k.strong ? "font-bold" : "font-semibold"} ${k.cls}`}>Ref. {fmt2(k.val)}</p>
                  {enMoneda(k.val)}
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-1.5 rounded-full bg-surface-3 dark:bg-white/[0.06] overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${paidPct >= 99.99 ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${paidPct}%` }} />
              </div>
              <span className="text-[12px] text-content-subtle tabular-nums whitespace-nowrap">{paidPct.toLocaleString("es-VE", { maximumFractionDigits: 1 })} % pagado</span>
            </div>

            {/* Vencimiento: el pactado para esta compra o, si no hay, el del crédito del
                proveedor. Es la fecha con la que Cuentas por Pagar la marca como vencida. */}
            {dueDate && (
              <div className="mt-4 pt-4 border-t border-border/60 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className={LABEL}>Vence</span>
                    <span className="text-[14px] font-semibold text-content dark:text-white tabular-nums">{fmtDateShort(dueDate)}</span>
                    {vencida && (
                      <span className="text-[12px] font-medium text-red-600 dark:text-red-400">Vencida hace {daysOverdue} día{daysOverdue !== 1 ? "s" : ""}</span>
                    )}
                    {porVencer && (
                      <span className="text-[12px] font-medium text-amber-700 dark:text-amber-400">
                        {daysOverdue === 0 ? "Vence hoy" : `En ${-daysOverdue} día${daysOverdue !== -1 ? "s" : ""}`}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-content-subtle mt-0.5">
                    {detail.due_date
                      ? "Fecha pactada para esta compra"
                      : detail.supplier_credit_days
                        ? `Crédito del proveedor: ${detail.supplier_credit_days} días`
                        : "De contado: el proveedor no tiene días de crédito"}
                  </p>
                </div>
                {canSetDue && payStatus !== "pagado" && (
                  <div className="flex items-center gap-2 shrink-0">
                    {savingDue && <Spinner />}
                    <DatePicker value={dueDate} onChange={v => v && v !== dueDate && saveDueDate(v)} className="w-[150px]" />
                    {detail.due_date && (
                      <button
                        onClick={() => saveDueDate(null)}
                        disabled={savingDue}
                        className="h-8 px-2.5 rounded-lg text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-3 dark:hover:bg-white/5 transition-all disabled:opacity-40"
                        title="Volver al plazo de crédito del proveedor"
                      >
                        Restablecer
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={`${SECTION} overflow-hidden flex flex-col`}>
            <div className="px-5 py-3 flex items-center justify-between gap-3 shrink-0">
              <div>
                <p className="text-[14px] font-semibold text-content dark:text-white">Pagos al proveedor</p>
                <p className="text-[12px] text-content-subtle">{payments.length} {payments.length === 1 ? "pago" : "pagos"}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={loadPayments} disabled={loadingPay} className="row-icon" title="Actualizar" aria-label="Actualizar pagos">
                  <svg className={`w-4 h-4 ${loadingPay ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                {payStatus !== "pagado" && (
                  <button onClick={() => setShowPayModal(true)} className="btn-accent h-8 px-3.5 rounded-lg text-[12px] font-semibold active:scale-95 inline-flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
                    Registrar pago
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto max-h-[280px] border-t border-border/60 dark:border-white/[0.06]">
              {loadingPay ? (
                <div className="p-5 space-y-3">
                  {[0, 1].map(i => <div key={i} className="h-9 rounded-lg bg-surface-3/70 dark:bg-white/[0.04] animate-pulse" />)}
                </div>
              ) : payments.length === 0 ? (
                <div className="py-12 px-6 text-center">
                  <p className="text-[13px] font-semibold text-content dark:text-white">Sin pagos todavía</p>
                  <p className="text-[12px] text-content-subtle mt-1">{payStatus !== "pagado" ? "Registra lo que le vayas abonando al proveedor." : "Esta compra no tiene pagos registrados."}</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50 dark:divide-white/[0.04]">
                  {payments.map(p => {
                    const rate   = parseFloat(p.exchange_rate || 1);
                    const cur    = activeCurrencies?.find(c => c.id === p.currency_id);
                    const sym    = cur?.symbol || baseCurrency?.symbol || "Ref.";
                    const isBase = !cur || cur.is_base;
                    return (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setPayDetail(p)}
                        onKeyDown={e => { if (e.key === "Enter") setPayDetail(p); }}
                        className="px-5 py-3 flex items-center gap-3 hover:bg-surface-2/70 dark:hover:bg-white/[0.025] cursor-pointer transition-colors"
                      >
                        <span className="w-8 h-8 rounded-full bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.journal_color || "#94a3b8" }} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(p.journal_name) || "—"}</span>
                            {p.batch_id && <span className="text-[11px] font-medium text-content-subtle px-1.5 py-0.5 bg-surface-3 dark:bg-white/[0.06] rounded-md shrink-0" title="Un solo pago que cubrió varias compras">Conjunto</span>}
                          </div>
                          <p className="text-[12px] text-content-subtle tabular-nums truncate">
                            {fmtDateShort(p.reference_date || p.created_at)}
                            {p.reference_number && <> · Ref. {p.reference_number}</>}
                            {p.notes && <> · {p.notes}</>}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {!isBase ? (
                            <>
                              <p className="text-[14px] font-semibold text-content dark:text-white tabular-nums">{sym} {fmt2(parseFloat(p.amount) * rate)}</p>
                              <p className="text-[12px] text-content-subtle tabular-nums">Ref. {fmt2(p.amount)}</p>
                            </>
                          ) : (
                            <p className="text-[14px] font-semibold text-content dark:text-white tabular-nums">Ref. {fmt2(p.amount)}</p>
                          )}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteConfirm(p); }}
                          className="row-icon hover:!text-red-600 hover:!bg-red-500/10 dark:hover:!text-red-400 shrink-0"
                          title="Anular pago"
                          aria-label="Anular pago"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modales.
          `showLotFields`: el lote se teclea cuando la mercancía está entrando de verdad —al
          confirmar la orden, o con el modo recepción prendido—, que es cuando el bulto está
          en la mano y se puede leer el lote impreso. */}
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
          showLotFields={orderStatus === "pendiente" || orderStatus === "parcial" || localReceiving}
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
        message={deleteConfirm?.batch_id
          // Un pago conjunto se deshace entero: fue una sola transferencia para varias compras.
          ? `Este pago fue parte de un pago conjunto a varias compras. Al anularlo se anula la transferencia completa y todas esas compras vuelven a deber lo que se les había abonado. ¿Continuar?`
          : `¿Seguro que deseas anular este pago de Ref. ${parseFloat(deleteConfirm?.amount || 0).toFixed(2)}? Se revertirá el saldo de la compra.`}
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
    <Modal open onClose={onClose} title="Detalle de pago" width={380}>
      <div className="rounded-xl bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.05]">
        <DRow label="Diario">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: pd.journal_color || "#22c55e" }} />
            {toNameCase(pd.journal_name) || "—"}
          </span>
        </DRow>
        <DRow label="Monto abonado">
          <span className="text-success font-bold">
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
          className="h-8 px-4 rounded-xl border border-danger/30 text-danger text-[11px] font-bold hover:bg-danger/10 transition-all"
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
      <span className="text-[12px] font-medium text-content-subtle whitespace-nowrap shrink-0 mt-0.5">{label}</span>
      <span className="text-[12px] font-semibold text-content dark:text-white text-right">{children}</span>
    </div>
  );
}
