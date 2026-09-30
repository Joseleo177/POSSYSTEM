import { useState, useEffect } from "react";
import { exportToCSV } from "../../utils/exportUtils";
import { fmtBase, fmtSale as fmtSaleHelper, todayISO, journalsForWarehouse, fmtDateShort } from "../../helpers";
import Check from "../ui/Check";
import Money from "../ui/Money";
import { useApp } from "../../context/AppContext";
import SaleDetailModal from "./SaleDetailModal";
import BulkPaymentModal from "./BulkPaymentModal";
import PurchaseDetailModal from "../Contabilidad/PurchaseDetailModal";
import PurchasePaymentModal from "../purchases/PurchasePaymentModal";
import JournalPickerButton from "../cobro/JournalPickerButton";
import CustomSelect from "../ui/CustomSelect";
import Modal from "../ui/Modal";
import Pagination from "../ui/Pagination";
import { api } from "../../services/api";
import { Spinner } from "../ui/Spinner";
import StatusMark from "../ui/StatusMark";
import { ICONS } from "../ui/Ledger";

// Debe coincidir con LIMIT del hook useCustomers (tamaño de página del historial)
const PAID_LIMIT = 50;

// En claro el panel va blanco sobre el gris de la página, como el .card de index.css: con
// bg-surface-2 quedaba del mismo color exacto que el fondo del body y las secciones se veían
// flotando sin recuadro. El borde al 10% tampoco alcanzaba para separarlas. En oscuro se
// mantiene tal cual estaba, que ahí el velo blanco sí contrasta contra el fondo.
const SECTION = "bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";

// Cuerpo scrolleable de cada lista: rellena el alto disponible de su sección y desplaza dentro.
// En impresión se desactiva para que salgan todas las filas.
const SCROLL_LIST = "lg:flex-1 lg:min-h-0 lg:overflow-y-auto print:min-h-0 print:overflow-visible";

const DIA = 86400000;
const aMedianoche = (v) => {
    if (!v) return null;
    const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
    return y ? new Date(y, m - 1, d).getTime() : null;
};

// Vencimiento en palabras, con el mismo criterio que Contabilidad → Cuentas.
function Vence({ dias }) {
    if (dias === null) return <span>Sin vencimiento</span>;
    if (dias > 0)   return <span className="font-medium text-red-600 dark:text-red-400 whitespace-nowrap">Vencida {dias} {dias === 1 ? "día" : "días"}</span>;
    if (dias === 0) return <span className="font-medium text-amber-700 dark:text-amber-400">Vence hoy</span>;
    if (dias >= -3) return <span className="font-medium text-amber-700 dark:text-amber-400">Vence en {-dias} {dias === -1 ? "día" : "días"}</span>;
    return <span>Vence en {-dias} días</span>;
}

// Celda de la ficha: rótulo, cifra y una línea de contexto.
const Dato = ({ label, value, sub }) => (
    <div className="px-5 py-3.5 min-w-0 border-border/60 dark:border-white/[0.06] [&:nth-child(2n)]:border-l lg:[&:not(:first-child)]:border-l [&:nth-child(n+3)]:border-t lg:[&:nth-child(n+3)]:border-t-0">
        <dt className="text-[12px] text-content-subtle">{label}</dt>
        <dd className="mt-0.5 text-[15px] font-semibold text-content dark:text-white tabular-nums truncate">{value}</dd>
        {sub && <dd className="text-[12px] text-content-subtle mt-0.5">{sub}</dd>}
    </div>
);

export default function CustomerDetail({ detail, pending, paid, paidTotal, paidPage, onPaidPageChange, onClose, onPay, onRefresh }) {
    const { baseCurrency, notify, activeJournals, activeCurrencies, employee, can } = useApp();
    const [selectedSaleId, setSelectedSaleId] = useState(null);
    // Proveedor: la compra que se está viendo y la que se está pagando (una o varias).
    const [selectedPurchaseId, setSelectedPurchaseId] = useState(null);
    const [payPurchases, setPayPurchases] = useState(null);
    // Cobro conjunto: el cliente arrastra cuentas viejas, compra hoy y paga todo de una vez.
    // Se marcan las facturas y se cobran con un solo monto (ver BulkPaymentModal).
    const [checkedIds, setCheckedIds] = useState([]);
    const [showBulk, setShowBulk] = useState(false);
    const [clearingCredit, setClearingCredit] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [showRefund, setShowRefund] = useState(false);
    const [refundForm, setRefundForm] = useState({ amount: "", journal_id: "", reference_date: todayISO(), notes: "", warehouse_id: "" });
    const [refunding, setRefunding] = useState(false);

    // La devolución genera un egreso, y un egreso es de una sucursal: de ella salen los
    // billetes y en su arqueo tienen que aparecer. Con una sola sucursal se preselecciona y
    // el campo ni se muestra. Un depósito no maneja dinero.
    //
    // Se piden las sucursales DEL EMPLEADO, no las de la empresa: solo se puede devolver
    // desde una caja propia, y además el listado general exige `inventory.view`, que un
    // cajero con permiso de crédito no tiene por qué tener.
    const [warehouses, setWarehouses] = useState([]);
    useEffect(() => {
        if (!showRefund || warehouses.length || !employee?.id) return;
        api.warehouses.getByEmployee(employee.id)
            .then(r => {
                const list = (r.data || []).filter(w => w.sells !== false);
                setWarehouses(list);
                if (list.length === 1) setRefundForm(p => p.warehouse_id ? p : { ...p, warehouse_id: String(list[0].id) });
            })
            .catch(() => {});
    }, [showRefund, employee?.id]); // eslint-disable-line

    const fmtPrice = (n) => fmtBase(n, baseCurrency);
    const fmtSale  = (sale, amount) => fmtSaleHelper(sale, amount, baseCurrency);

    // Moneda/tasa del diario seleccionado para la devolución
    const refundJournal  = activeJournals.find(j => String(j.id) === String(refundForm.journal_id));
    const refundCurrency = refundJournal?.currency_id ? activeCurrencies.find(c => c.id === parseInt(refundJournal.currency_id)) : null;
    const refundRate     = (!refundCurrency || refundCurrency.is_base) ? 1 : parseFloat(refundCurrency.exchange_rate || 1);
    const refundSym      = refundCurrency?.symbol || baseCurrency?.symbol || "Ref.";

    // amount en el form está en moneda LOCAL del diario; se envía al backend en base dividiendo por rate
    const refundAmountBase = parseFloat(String(refundForm.amount).replace(",", ".") || 0) / refundRate;

    // Cuánto se puede devolver DESDE la sucursal elegida: lo compartido (movimientos sin
    // sucursal) más lo que esa sucursal acreditó. El backend valida exactamente esto, así que
    // mostrar el total global hacía creer que había plata devolvible en una caja donde no la
    // hay. Si el backend es viejo y no manda el desglose, se cae al total de siempre.
    const creditByWh   = detail.credit_by_warehouse;
    const hayDesglose  = Array.isArray(creditByWh);
    const bucket       = (wid) => (creditByWh || []).find(x => (wid === null ? x.warehouse_id == null : String(x.warehouse_id) === String(wid)))?.amount || 0;
    const refundAvailable = !hayDesglose
        ? parseFloat(detail.credit_balance || 0)
        : refundForm.warehouse_id
            ? bucket(null) + bucket(refundForm.warehouse_id)
            : parseFloat(detail.credit_balance || 0);
    // Con sucursal elegida y sin crédito ahí, no hay nada que devolver desde esa caja.
    const sinCreditoAqui = !!refundForm.warehouse_id && hayDesglose && refundAvailable <= 0.001;

    const handleRefund = async () => {
        setRefunding(true);
        try {
            await api.customers.creditRefund(detail.id, {
                amount:         refundAmountBase,
                journal_id:     refundForm.journal_id,
                reference_date: refundForm.reference_date,
                notes:          refundForm.notes || null,
                // Sin esto el backend caía en el primer almacén del empleado, que no tiene por
                // qué ser la caja de la que realmente sale el dinero.
                warehouse_id:   refundForm.warehouse_id || undefined,
            });
            notify("Devolución registrada correctamente");
            setShowRefund(false);
            setRefundForm({ amount: "", journal_id: "", reference_date: todayISO(), notes: "", warehouse_id: warehouses.length === 1 ? String(warehouses[0].id) : "" });
            onRefresh?.();
        } catch (e) { notify(e.message, "err"); }
        setRefunding(false);
    };

    const handleClearCredit = async () => {
        setClearingCredit(true);
        try {
            await api.customers.adjustCredit(detail.id, 0);
            notify("Crédito anulado correctamente");
            setConfirmClear(false);
            onRefresh?.();
        } catch (e) { notify(e.message, "err"); }
        setClearingCredit(false);
    };

    const pendingSales = pending || [];
    const paidSales    = paid || [];
    const esCliente    = detail.type !== "proveedor";
    // Las compras se ven y se pagan desde aquí mismo, igual que las facturas de un cliente.
    // Antes la ficha se cerraba y saltaba al módulo de Compras: se perdía el contexto del
    // proveedor para algo que es consultar un documento o registrar un pago.
    const puedeCobrar  = esCliente || can("purchases.pay");
    // Un borrador sin correlativo se puede cobrar suelto (el cobro le asigna el número), pero
    // no entra al cobro conjunto: mezclar la asignación de correlativos con el reparto de un
    // monto es pedirle a la caja que revise dos cosas a la vez.
    const cobrables    = puedeCobrar ? pendingSales.filter(s => parseFloat(s.balance || 0) > 0.10) : [];
    const seleccionadas = cobrables.filter(s => checkedIds.includes(s.id));
    const totalSeleccionado = seleccionadas.reduce((acc, s) => acc + parseFloat(s.balance || 0), 0);
    // El cobro conjunto genera un solo movimiento de caja: mezclar facturas de sucursales
    // distintas dejaría ese movimiento sin una caja a la que pertenecer, y el arqueo del
    // empleado de cada tienda ya no cuadraría con lo que de verdad entró en la suya.
    const toggleChecked = (id) => {
        const sale = cobrables.find(s => s.id === id);
        if (!checkedIds.includes(id) && sale && seleccionadas.length > 0
            && seleccionadas[0].warehouse_id !== sale.warehouse_id) {
            notify(esCliente
                ? "El cobro conjunto solo admite facturas de la misma sucursal"
                : "El pago conjunto solo admite compras de la misma sucursal", "err");
            return;
        }
        setCheckedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    };
    const hasPending   = parseFloat(detail.total_debt || 0) > 0;
    // La fila del listado no trae la fecha de la última compra: sale de los documentos cargados,
    // que llegan del más reciente al más viejo.
    const ultima       = detail.last_purchase_at
        || [pendingSales[0]?.created_at, paidPage === 1 ? paidSales[0]?.created_at : null].filter(Boolean).sort().pop();
    const tieneCredito = parseFloat(detail.credit_balance || 0) > 0.001;
    const iniciales    = (detail.name || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();

    // Días desde el vencimiento (negativo: faltan). Vence en la fecha pactada o, si no hay,
    // a los días de crédito del contacto contados desde el documento; de contado, ese mismo día.
    const hoy = aMedianoche(todayISO());
    const diasVencida = (s) => {
        const pactada = aMedianoche(s.due_date);
        const doc     = s.created_at ? aMedianoche(new Date(s.created_at).toLocaleDateString("en-CA")) : null;
        const vence   = pactada ?? (doc !== null ? doc + (parseInt(detail.credit_days) || 0) * DIA : null);
        return vence === null ? null : Math.round((hoy - vence) / DIA);
    };
    const vencidas     = pendingSales.filter(s => (diasVencida(s) ?? 0) > 0);
    const montoVencido = vencidas.reduce((acc, s) => acc + parseFloat(s.balance || 0), 0);
    const paidTotalPages = Math.ceil((paidTotal || 0) / PAID_LIMIT);

    const handleExportStatement = () => {
        const safeSales = [...pendingSales, ...paidSales];
        if (!safeSales.length) return;
        const headers = ["Factura", "Fecha", "Estado", "Cargo", "Abonado", "Saldo"];
        const rows = safeSales.map(s => [
            s.id,
            new Date(s.created_at).toLocaleDateString("es-VE"),
            s.status.toUpperCase(),
            s.total, s.amount_paid, s.balance,
        ]);
        exportToCSV(`Estado_Cuenta_${detail.name.replace(/\s+/g, "_")}`, rows, headers);
    };

    return (
        <>
        <div className="h-full flex flex-col animate-in fade-in duration-300">

            {/* ── Barra superior ── */}
            <div className="shrink-0 px-4 sm:px-5 pt-3 pb-2 flex justify-between items-center print-hidden">
                <button onClick={onClose} className="flex items-center gap-1.5 h-8 -ml-1 px-1 text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7"/></svg>
                    Contactos
                </button>
                <div className="flex gap-2">
                    <button onClick={handleExportStatement} title="Descargar estado de cuenta (CSV)" className="btn-outline h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        CSV
                    </button>
                    <button onClick={() => window.print()} className="btn-outline h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS.print}/></svg>
                        Imprimir
                    </button>
                </div>
            </div>

            {/* En escritorio la página no se desplaza: cada lista lo hace dentro de su panel. En
                móvil es al revés, scroll de página y listas enteras (como en los reportes). */}
            <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden print:overflow-visible print:block px-4 sm:px-5 pb-4 pt-1 flex flex-col gap-3">

                {/* Print header */}
                <div className="hidden print-force-break mb-4 text-center text-black">
                    <h1 className="text-xl font-bold tracking-tight">Estado de cuenta</h1>
                    <p className="text-xs mt-1 tracking-wide font-semibold opacity-70">{detail.name} — RIF: {detail.rif || "S/N"}</p>
                    <p className="text-[12px] font-bold opacity-50 mt-1">Fecha: {new Date().toLocaleDateString("es-VE")}</p>
                </div>

                {/* ── Ficha: quién es y cuánto debe ── */}
                <div className={`${SECTION} shrink-0`}>
                    <div className="px-5 pt-5 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex items-start gap-3.5 min-w-0">
                            <div className="w-11 h-11 rounded-xl bg-surface-2 dark:bg-white/[0.06] border border-border/70 dark:border-white/[0.08] flex items-center justify-center text-[15px] font-semibold text-content dark:text-white shrink-0">
                                {iniciales}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[12px] text-content-subtle">{esCliente ? "Cliente" : "Proveedor"}</p>
                                <h2 className="text-[20px] font-semibold tracking-tight text-content dark:text-white leading-tight break-words">{detail.name}</h2>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[12px] text-content-subtle">
                                    {detail.rif && <span className="tabular-nums">{detail.rif}</span>}
                                    {detail.phone && <a href={`tel:${detail.phone}`} className="tabular-nums hover:text-content dark:hover:text-white">{detail.phone}</a>}
                                    {detail.email && <span className="truncate max-w-[220px]">{detail.email}</span>}
                                    {!detail.rif && !detail.phone && !detail.email && <span>Sin datos de contacto</span>}
                                </div>
                            </div>
                        </div>

                        <div className="sm:text-right shrink-0 pl-[58px] sm:pl-0">
                            <p className="text-[12px] text-content-subtle">{esCliente ? "Te debe" : "Le debes"}</p>
                            {hasPending ? (
                                <>
                                    <Money value={fmtPrice(detail.total_debt)} className="block text-[26px] font-bold tracking-tight text-content dark:text-white leading-tight" />
                                    <p className={`text-[12px] mt-0.5 tabular-nums ${vencidas.length ? "font-medium text-red-600 dark:text-red-400" : "text-content-subtle"}`}>
                                        {vencidas.length
                                            ? `${vencidas.length} ${vencidas.length === 1 ? "vencida" : "vencidas"} · ${fmtPrice(montoVencido)}`
                                            : `${pendingSales.length} ${pendingSales.length === 1 ? "documento abierto" : "documentos abiertos"}`}
                                    </p>
                                </>
                            ) : (
                                <p className="flex items-center sm:justify-end gap-1.5 text-[20px] font-semibold tracking-tight text-content dark:text-white leading-tight">
                                    <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                                    Al día
                                </p>
                            )}
                        </div>
                    </div>

                    <dl className="border-t border-border/60 dark:border-white/[0.06] grid grid-cols-2 lg:grid-cols-4">
                        <Dato label={esCliente ? "Compras" : "Órdenes"} value={detail.total_purchases ?? 0}
                              sub={ultima ? `Última: ${fmtDateShort(ultima)}` : detail.total_purchases ? null : "Ninguna todavía"} />
                        <Dato label={esCliente ? "Total cobrado" : "Total pagado"} value={<Money value={fmtPrice(detail.total_spent)} />}
                              sub={esCliente ? "Facturas ya saldadas" : "Órdenes ya pagadas"} />
                        <Dato label="Plazo de pago" value={detail.credit_days ? `${detail.credit_days} días` : "De contado"}
                              sub={detail.credit_days ? "Desde la fecha del documento" : "Vence el mismo día"} />
                        <Dato label="Crédito a favor"
                              value={tieneCredito ? <Money value={fmtPrice(detail.credit_balance)} /> : <span className="text-content-subtle font-medium">Sin crédito</span>}
                              sub={tieneCredito && (confirmClear ? (
                                  <span className="flex flex-wrap items-center gap-1.5 mt-1">
                                      <span>¿Anularlo todo?</span>
                                      <button onClick={handleClearCredit} disabled={clearingCredit}
                                          className="h-7 px-2.5 rounded-md bg-red-600 text-white text-[12px] font-semibold disabled:opacity-50">
                                          {clearingCredit ? "Anulando…" : "Sí, anular"}
                                      </button>
                                      <button onClick={() => setConfirmClear(false)} className="h-7 px-2 rounded-md text-[12px] font-medium hover:text-content dark:hover:text-white">No</button>
                                  </span>
                              ) : (
                                  <span className="flex items-center gap-1 mt-1 print-hidden">
                                      <button onClick={() => { setShowRefund(true); setConfirmClear(false); }}
                                          className="h-7 px-2.5 rounded-md btn-outline text-[12px] font-medium">
                                          Devolver
                                      </button>
                                      <button onClick={() => setConfirmClear(true)}
                                          className="h-7 px-2 rounded-md text-[12px] font-medium text-content-subtle hover:text-red-600 hover:bg-red-500/10 transition-colors">
                                          Anular
                                      </button>
                                  </span>
                              ))} />
                    </dl>
                </div>

                {/* ── Por cobrar e historial: lado a lado en escritorio ── */}
                <div className={`lg:flex-1 lg:min-h-0 grid gap-3 print:block ${pendingSales.length ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : ""}`}>

                {pendingSales.length > 0 && (
                    <div className={`${SECTION} overflow-hidden lg:min-h-0 flex flex-col print:overflow-visible print:mb-4`}>
                        <div className="shrink-0 px-5 py-3 border-b border-border/60 dark:border-white/[0.06] flex items-center gap-3 min-h-[60px]">
                            {/* Casilla de "todas": solo si hay cobro conjunto, alineada con las de cada fila. */}
                            {cobrables.length > 1 && (
                                <Check
                                    checked={seleccionadas.length === cobrables.length}
                                    onChange={() => setCheckedIds(seleccionadas.length === cobrables.length ? [] : cobrables.map(s => s.id))}
                                    title={seleccionadas.length === cobrables.length ? "Quitar todas" : "Marcar todas"}
                                />
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="text-[14px] font-semibold text-content dark:text-white leading-tight">
                                    {esCliente ? "Por cobrar" : "Por pagar"}
                                </p>
                                <p className="text-[12px] text-content-subtle tabular-nums truncate">
                                    {seleccionadas.length
                                        ? `${seleccionadas.length} de ${cobrables.length} marcadas`
                                        : cobrables.length > 1
                                            ? (esCliente ? "Marca varias para cobrarlas de una vez" : "Marca varias para pagarlas de una vez")
                                            : `${pendingSales.length} ${pendingSales.length === 1 ? "documento abierto" : "documentos abiertos"}`}
                                </p>
                            </div>

                            {/* Cobro (o pago) conjunto: el botón aparece al marcar. Vacío y
                                deshabilitado solo ocupaba la cabecera con un aviso que ya da el
                                subtítulo. */}
                            {seleccionadas.length > 0 && (
                                <button
                                    onClick={() => esCliente ? setShowBulk(true) : setPayPurchases(seleccionadas)}
                                    className="h-9 px-3.5 rounded-lg text-[13px] font-semibold btn-accent active:scale-[0.98] print-hidden whitespace-nowrap tabular-nums shrink-0"
                                >
                                    {esCliente ? "Cobrar" : "Pagar"} {fmtPrice(totalSeleccionado)}
                                </button>
                            )}
                        </div>
                        <div className={`divide-y divide-border/50 dark:divide-white/[0.05] ${SCROLL_LIST}`}>
                            {pendingSales.map(sale => {
                                const marcada = checkedIds.includes(sale.id);
                                const dias = diasVencida(sale);
                                const abrir = () => esCliente ? setSelectedSaleId(sale.id) : setSelectedPurchaseId(sale.id);
                                const enVenta = esCliente ? fmtSale(sale, sale.balance) : fmtPrice(sale.balance);
                                const enBase  = fmtPrice(sale.balance);
                                const abonado = parseFloat(sale.amount_paid || 0) > 0.001;
                                return (
                                <div
                                    key={sale.id}
                                    onClick={abrir}
                                    className={`relative px-5 py-3 flex items-center gap-3 transition-colors cursor-pointer ${marcada ? "bg-brand-500/[0.05] dark:bg-brand-500/[0.08]" : "hover:bg-surface-2/70 dark:hover:bg-white/[0.02]"}`}
                                >
                                    {/* Filete: rojo si ya venció, ámbar si vence en tres días o menos. */}
                                    {dias !== null && dias >= -3 && (
                                        <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r ${dias > 0 ? "bg-red-500" : "bg-amber-500"}`} aria-hidden="true" />
                                    )}
                                    {/* Casilla del cobro conjunto. Check detiene el clic: marcar una
                                        factura no es querer verla. */}
                                    {cobrables.length > 1 && (() => {
                                        const esCobrable = cobrables.some(c => c.id === sale.id);
                                        // Otra sucursal que la ya marcada: no se puede sumar a este cobro conjunto.
                                        const otraSucursal = esCobrable && !marcada
                                            && seleccionadas.length > 0 && seleccionadas[0].warehouse_id !== sale.warehouse_id;
                                        return (
                                            <Check
                                                checked={marcada}
                                                disabled={!esCobrable || otraSucursal}
                                                onChange={() => toggleChecked(sale.id)}
                                                title={!esCobrable ? (esCliente ? "Sin saldo por cobrar" : "Sin saldo por pagar")
                                                    : otraSucursal ? (esCliente ? "El cobro conjunto solo admite facturas de la misma sucursal" : "El pago conjunto solo admite compras de la misma sucursal")
                                                    : (esCliente ? "Incluir en el cobro conjunto" : "Incluir en el pago conjunto")}
                                            />
                                        );
                                    })()}
                                    {/* Dos renglones que se leen en paralelo: documento y saldo
                                        arriba; fecha, vencimiento y el saldo en base abajo. Así en
                                        móvil el monto no le roba el ancho a la fecha. */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <p className="text-[14px] font-semibold text-content dark:text-white tabular-nums leading-tight truncate">
                                                {!esCliente ? `Compra #${sale.id}` : (sale.invoice_number || `Factura #${sale.id}`)}
                                            </p>
                                            <Money value={enVenta} className="text-[14px] font-semibold text-content dark:text-white shrink-0" />
                                        </div>
                                        <div className="flex items-start justify-between gap-3 mt-0.5">
                                        {/* Fecha, vencimiento y, si hubo abonos, cuánto va. Todas
                                            deben algo: el color queda para lo vencido. */}
                                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-content-subtle tabular-nums min-w-0">
                                            <span className="hidden sm:inline">{fmtDateShort(sale.created_at)}</span>
                                            <span aria-hidden="true" className="hidden sm:inline">·</span>
                                            <Vence dias={dias} />
                                            {sale.status === "borrador" && <><span aria-hidden="true">·</span><span>Sin factura</span></>}
                                            {abonado && <><span aria-hidden="true">·</span><span>Abonado {fmtPrice(sale.amount_paid)} de {fmtPrice(sale.total)}</span></>}
                                        </div>
                                        {/* Factura hecha en bolívares: debajo, lo mismo en la moneda
                                            base, que es en la que se suma el saldo de arriba. */}
                                        {enVenta !== enBase && <Money value={enBase} className="text-[11px] text-content-subtle shrink-0 leading-[18px]" />}
                                        </div>
                                    </div>
                                    {puedeCobrar && (
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                if (esCliente) onPay(sale);
                                                else setPayPurchases([sale]);
                                            }}
                                            className="h-8 px-3 rounded-lg text-[13px] font-semibold btn-outline active:scale-[0.98] shrink-0 print-hidden"
                                        >
                                            {esCliente ? "Cobrar" : "Pagar"}
                                        </button>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Documentos cerrados ── */}
                <div className={`${SECTION} overflow-hidden lg:min-h-0 flex flex-col print:overflow-visible`}>
                    <div className="shrink-0 px-5 py-3 border-b border-border/60 dark:border-white/[0.06] flex items-center justify-between gap-3 min-h-[60px]">
                        <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-content dark:text-white leading-tight">
                                {esCliente ? "Facturas saldadas" : "Órdenes pagadas"}
                            </p>
                            <p className="text-[12px] text-content-subtle tabular-nums">
                                {paidTotal > 0 ? `${paidTotal} en total` : "Todavía ninguna"}
                            </p>
                        </div>
                    </div>
                    {paidTotal === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10">
                            <div className="w-10 h-10 rounded-xl bg-surface-2 dark:bg-white/[0.04] border border-border/70 dark:border-white/[0.08] flex items-center justify-center text-content-subtle">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ICONS.doc}/></svg>
                            </div>
                            <p className="mt-3 text-[13px] font-medium text-content dark:text-white">Sin documentos cerrados</p>
                            <p className="mt-0.5 text-[12px] text-content-subtle">Aparecen aquí cuando {esCliente ? "se cobran" : "se pagan"} por completo.</p>
                        </div>
                    ) : (
                        <div className={`divide-y divide-border/50 dark:divide-white/[0.05] ${SCROLL_LIST}`}>
                            {paidSales.map(sale => (
                                <div key={sale.id} className="px-5 py-3 flex items-center gap-3 hover:bg-surface-2/70 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                                    onClick={() => esCliente ? setSelectedSaleId(sale.id) : setSelectedPurchaseId(sale.id)}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-semibold text-content dark:text-white tabular-nums leading-tight truncate">
                                            {!esCliente ? `Compra #${sale.id}` : (sale.invoice_number || `Factura #${sale.id}`)}
                                        </p>
                                        <div className="flex items-center gap-1.5 text-[12px] text-content-subtle tabular-nums mt-0.5 min-w-0">
                                            <span className="shrink-0">{fmtDateShort(sale.created_at)}</span>
                                            {sale.paid_journals && <><span aria-hidden="true">·</span><span className="truncate">{sale.paid_journals}</span></>}
                                        </div>
                                    </div>
                                    {/* En moneda base, no en la de la venta: sale.currency_id solo
                                        dice cómo estaba puesta la pantalla al crearla, así que la
                                        lista mezclaba Bs. y Ref. sin poder compararse. */}
                                    <div className="text-right shrink-0">
                                        <Money value={fmtPrice(sale.total)} className="block text-[13px] font-semibold text-content dark:text-white" />
                                        <span className="inline-block mt-0.5"><StatusMark status={sale.status} /></span>
                                    </div>
                                    <svg className="w-4 h-4 text-content-subtle/50 shrink-0 print-hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="shrink-0 print-hidden">
                        <Pagination
                            page={paidPage}
                            totalPages={paidTotalPages}
                            total={paidTotal}
                            limit={PAID_LIMIT}
                            onPageChange={onPaidPageChange}
                        />
                    </div>
                </div>

                </div>
            </div>
        </div>

        {selectedSaleId && (
            <SaleDetailModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
        )}

        {/* Proveedor: detalle de la compra (con su propio botón de pago) y el pago directo,
            suelto o conjunto. Al pagar se recarga la ficha para que el saldo cuadre. */}
        {selectedPurchaseId && (
            <PurchaseDetailModal
                purchaseId={selectedPurchaseId}
                onClose={() => setSelectedPurchaseId(null)}
                onChanged={() => onRefresh?.()}
            />
        )}

        {payPurchases?.length > 0 && (
            <PurchasePaymentModal
                purchases={payPurchases.map(p => ({ ...p, supplier_name: detail.name }))}
                onClose={() => setPayPurchases(null)}
                onSuccess={() => { setPayPurchases(null); setCheckedIds([]); onRefresh?.(); }}
            />
        )}

        {showBulk && seleccionadas.length > 0 && (
            <BulkPaymentModal
                customer={detail}
                sales={seleccionadas}
                onClose={() => setShowBulk(false)}
                onSuccess={() => { setShowBulk(false); setCheckedIds([]); onRefresh?.(); }}
            />
        )}

        {/* ── Modal devolución de crédito ── */}
        <Modal
            open={showRefund}
            onClose={() => setShowRefund(false)}
            title="Devolver crédito en efectivo"
            width={440}
        >
            <div className="space-y-4">
                {/* Crédito disponible EN LA SUCURSAL elegida, no el global: es el número contra
                    el que valida el backend. En rojo cuando esa caja no tiene nada que devolver. */}
                <div className={`rounded-xl px-4 py-3 flex items-center justify-between border ${sinCreditoAqui ? "bg-danger/5 border-danger/20" : "bg-brand-500/5 border-brand-500/20"}`}>
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${sinCreditoAqui ? "text-danger" : "text-brand-500"}`}>
                        Crédito disponible{refundForm.warehouse_id && warehouses.length > 1 ? " aquí" : ""}
                    </span>
                    <span className={`text-[15px] font-bold tabular-nums ${sinCreditoAqui ? "text-danger" : "text-brand-500"}`}>
                        {fmtPrice(refundAvailable)}
                    </span>
                </div>
                {sinCreditoAqui && (
                    <p className="text-[11px] font-semibold text-danger -mt-2">
                        Este cliente tiene {fmtPrice(detail.credit_balance)} de crédito, pero se generó en otra sucursal:
                        de esta caja no puede salir. Devuélveselo desde donde lo acreditó.
                    </p>
                )}

                {/* Sucursal primero: de ella sale el efectivo, y filtra las cajas que se
                    ofrecen abajo. Solo aparece si el usuario atiende más de una. */}
                {warehouses.length > 1 && (
                    <div>
                        <p className="text-[12px] font-medium text-content-subtle dark:text-white/50 mb-1.5">Sucursal *</p>
                        <CustomSelect
                            value={refundForm.warehouse_id}
                            onChange={v => setRefundForm(p => {
                                // Si la caja elegida no atiende a la sucursal nueva, se limpia:
                                // el dinero saldría de una caja ajena.
                                const j = activeJournals.find(x => String(x.id) === String(p.journal_id));
                                const sigueValida = j && (!(j.warehouse_ids?.length) || j.warehouse_ids.includes(Number(v)));
                                // El monto se limpia siempre: se había propuesto contra el
                                // crédito disponible de la sucursal anterior.
                                return { ...p, warehouse_id: v, journal_id: sigueValida ? p.journal_id : "", amount: "" };
                            })}
                            placeholder="Seleccionar..."
                            options={warehouses.map(w => ({ value: String(w.id), label: w.name }))}
                        />
                    </div>
                )}

                {/* Caja de salida: la misma botonera (método → banco → caja) que el resto del
                    sistema de dinero, en vez de la parrilla de chips con todos los diarios
                    sueltos. `outflowOnly` deja fuera los métodos por los que no se saca
                    efectivo, como un punto de venta. Va ANTES del monto porque es la caja la
                    que decide en qué moneda se teclea. */}
                <div>
                    <p className="text-[12px] font-medium text-content-subtle dark:text-white/50 mb-1.5">De qué caja sale *</p>
                    <JournalPickerButton
                        value={refundForm.journal_id}
                        journals={journalsForWarehouse(activeJournals, refundForm.warehouse_id)}
                        outflowOnly
                        disabled={warehouses.length > 1 && !refundForm.warehouse_id}
                        placeholder={warehouses.length > 1 && !refundForm.warehouse_id ? "Elige la sucursal primero" : "Seleccionar caja..."}
                        methodPrompt={{ tag: "Devolución de crédito", title: "¿Cómo se le devuelve?" }}
                        onSelect={j => {
                            // El monto se propone en la moneda de esa caja: el crédito vive en
                            // base, así que se multiplica por su tasa. El cajero puede pisarlo
                            // si devuelve solo una parte.
                            const jCur  = j.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : null;
                            const jRate = (!jCur || jCur.is_base) ? 1 : parseFloat(jCur.exchange_rate || 1);
                            setRefundForm(p => ({ ...p, journal_id: String(j.id), amount: (refundAvailable * jRate).toFixed(2) }));
                        }}
                        onClear={() => setRefundForm(p => ({ ...p, journal_id: "", amount: "" }))}
                        height="h-11"
                        boxClassName="rounded-xl"
                    />
                </div>

                {/* Monto + fecha */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <p className="text-[12px] font-medium text-content-subtle dark:text-white/50 mb-1.5">
                            Monto a devolver * {refundSym && <span className="text-brand-500 normal-case">({refundSym})</span>}
                        </p>
                        <input
                            type="text" inputMode="decimal"
                            value={refundForm.amount}
                            placeholder={refundForm.journal_id ? (refundAvailable * refundRate).toFixed(2) : "0.00"}
                            onChange={e => setRefundForm(p => ({ ...p, amount: e.target.value.replace(/[^\d.,]/g, "") }))}
                            className="w-full h-10 bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-semibold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
                        />
                        {refundForm.journal_id && refundRate !== 1 && refundForm.amount && (
                            <p className="text-[11px] font-semibold text-content-subtle dark:text-white/30 mt-1 tabular-nums">
                                ≈ {baseCurrency?.symbol}{refundAmountBase.toFixed(2)}
                            </p>
                        )}
                    </div>
                    <div>
                        <p className="text-[12px] font-medium text-content-subtle dark:text-white/50 mb-1.5">Fecha *</p>
                        <input
                            type="date"
                            value={refundForm.reference_date}
                            onChange={e => setRefundForm(p => ({ ...p, reference_date: e.target.value }))}
                            className="w-full h-10 bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-semibold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all"
                        />
                    </div>
                </div>

                {/* Notas */}
                <div>
                    <p className="text-[12px] font-medium text-content-subtle dark:text-white/50 mb-1.5">Notas</p>
                    <input
                        type="text"
                        value={refundForm.notes}
                        onChange={e => setRefundForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Observaciones..."
                        className="w-full h-10 bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-semibold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
                    />
                </div>

                {/* Acciones */}
                <div className="flex gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                    <button onClick={() => setShowRefund(false)}
                        className="flex-1 h-10 rounded-xl border border-border/40 dark:border-white/10 text-[12px] font-bold text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white hover:border-border dark:hover:border-white/20 transition-all">
                        Cancelar
                    </button>
                    <button
                        onClick={handleRefund}
                        disabled={refunding || sinCreditoAqui || !refundForm.amount || !refundForm.journal_id || !refundForm.reference_date || (warehouses.length > 1 && !refundForm.warehouse_id)}
                        className="flex-[2] h-10 rounded-xl btn-accent text-[12px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                        {refunding && <Spinner />}
                        {refunding ? "Registrando…" : "Confirmar devolución"}
                    </button>
                </div>
            </div>
        </Modal>
        </>
    );
}
