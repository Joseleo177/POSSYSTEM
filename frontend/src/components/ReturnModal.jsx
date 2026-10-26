import { useState, useEffect } from "react";
import { Spinner } from "./ui/Spinner";
import DatePicker from "./ui/DatePicker";
import Segmented from "./ui/Segmented";
import Money from "./ui/Money";
import JournalPickerButton from "./cobro/JournalPickerButton";
import { api } from "../services/api";
import { fmtBase, printNotaCreditoDoc, todayISO, journalsForWarehouse, toNameCase, factorDevolucion } from "../helpers";
import { isIntegerUnit } from "../helpers/unitFormatter";
import ConfirmModal from "./ui/ConfirmModal";
import PaymentFormModal from "./PaymentFormModal";
import ReceiptModal from "./ReceiptModal";
import { useApp } from "../context/AppContext";

const EMPTY_REFUND = () => ({
    date: todayISO(),
    notes: '',
    // El reembolso puede salir de varias cajas (parte efectivo, resto transferencia), igual
    // que el vuelto de un cobro. Cada tramo lleva su monto —en la moneda de su caja— y su
    // referencia.
    parts: [{ journal_id: '', amount: '', reference: '' }],
});

// Cantidad leída de lo tecleado ("1,5" o "1.5"); vacío o inválido es 0.
const numDe = (raw) => {
    const n = parseFloat(String(raw ?? "").replace(",", "."));
    return isNaN(n) || n < 0 ? 0 : n;
};

// Unidad corta para las de peso/volumen; las contables no la necesitan al lado del número.
const UNIDAD_CORTA = { KG: "kg", KILOGRAMO: "kg", L: "L", LITRO: "L", M: "m", METRO: "m" };
const fmtCant = (n, unit) => {
    const u = UNIDAD_CORTA[String(unit || "").toUpperCase()];
    const v = parseFloat(n || 0);
    return u
        ? `${v.toLocaleString("es-VE", { maximumFractionDigits: 3 })} ${u}`
        : Math.trunc(v).toLocaleString("es-VE");
};

// Sin unidad conocida (respuesta vieja del servidor) manda la propia cantidad vendida: si se
// vendió una fracción, el producto se vende a granel.
const esEntera = (unit, vendido) => unit ? isIntegerUnit(unit) : Number.isInteger(parseFloat(vendido || 0));

export default function ReturnModal({ open, onClose, sale, onReturnSuccess, notify }) {
    const { companyInfo, baseCurrency, activeCurrencies, activeJournals: allActiveJournals, printerWidth } = useApp();
    const fmtB = (n) => fmtBase(n, baseCurrency);
    // El reembolso sale de la caja de la sucursal donde se vendió, no de la de otra tienda.
    const activeJournals = journalsForWarehouse(allActiveJournals, sale?.warehouse_id);
    const [mode, setMode] = useState("devolucion"); // "devolucion" | "cambio"
    // Lo tecleado por línea, tal cual: guardar el número perdía el separador a mitad de
    // escribir "1,5" en un producto a granel.
    const [returnQtys, setReturnQtys] = useState({});
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);
    const [confirmShow, setConfirmShow] = useState(false);
    const [returnResult, setReturnResult] = useState(null);
    const [refund, setRefund] = useState(EMPTY_REFUND());
    // Qué se hace con lo que le sobra al cliente: "credito" | "reembolso" | "redondeo".
    // null = el de cada modo (ver destinoPorDefecto).
    const [surplusMode, setSurplusMode] = useState(null);

    // Modo cambio
    const [exchangeResult, setExchangeResult] = useState(null);
    const [showPayDiff, setShowPayDiff] = useState(false);
    const [diffCobrada, setDiffCobrada] = useState(false);
    // Comprobante de la factura nueva que emite el cambio.
    const [showNewInvoice, setShowNewInvoice] = useState(false);
    const [productSearch, setProductSearch] = useState("");
    const [productResults, setProductResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    // Término de la última búsqueda que respondió: sin esto, una búsqueda sin coincidencias
    // no se distingue de una que todavía no empezó.
    const [searchedFor, setSearchedFor] = useState("");
    const [replacementItems, setReplacementItems] = useState([]); // [{product_id, name, price, qty, qtyRaw, unit}]

    useEffect(() => {
        if (open && sale) {
            setMode("devolucion");
            setReturnQtys({});
            setReason("");
            setReturnResult(null);
            setRefund(EMPTY_REFUND());
            setSurplusMode(null);
            setExchangeResult(null);
            setShowPayDiff(false);
            setDiffCobrada(false);
            setShowNewInvoice(false);
            setReplacementItems([]);
            setProductSearch("");
            setProductResults([]);
        }
    }, [open, sale]);

    // Búsqueda de productos para el cambio
    useEffect(() => {
        if (mode !== "cambio" || productSearch.trim().length < 2) { setProductResults([]); return; }
        const timer = setTimeout(async () => {
            setSearchLoading(true);
            try {
                // El reemplazo se cobra al precio de la sucursal donde se hizo la venta, no al
                // del catálogo general: si esa tienda tiene precio propio, el cambio se estaba
                // valorando con otro número del que el servidor iba a grabar.
                const res = sale?.warehouse_id
                    ? await api.warehouses.getProducts(sale.warehouse_id, { search: productSearch.trim(), limit: 8, sellable_only: true })
                    : await api.products.getAll({ search: productSearch.trim(), limit: 8 });
                setProductResults(res.data || []);
            } catch { setProductResults([]); }
            setSearchedFor(productSearch.trim());
            setSearchLoading(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [productSearch, mode]);

    if (!open || !sale) return null;

    const disponibleDe = (i) => Math.max(0, parseFloat(i.quantity) - parseFloat(i.returned_qty || 0));
    const unidadDe = (i) => i.Product?.unit || i.unit || null;
    const cantDe = (i) => Math.min(numDe(returnQtys[i.id]), disponibleDe(i));

    const handleQtyChange = (item, raw) => {
        const max = disponibleDe(item);
        setReturnQtys(prev => ({ ...prev, [item.id]: numDe(raw) > max ? String(max) : raw }));
    };

    const handleReturnAll = () => {
        const qtys = {};
        sale.items.forEach(i => {
            const available = disponibleDe(i);
            if (available > 0) qtys[i.id] = String(available);
        });
        setReturnQtys(qtys);
    };

    // Cada línea devuelta se lleva su parte del descuento de la venta y de la rebaja por pagar en
    // divisas: se devuelve lo que se cobró, no el precio de lista (ver factorDevolucion).
    const factor = factorDevolucion(sale);
    const netoDe = (i) => (parseFloat(i.price) - parseFloat(i.discount || 0)) * factor;
    const totalReturn = sale.items.reduce((acc, i) => acc + cantDe(i) * netoDe(i), 0);

    const totalReplacement = replacementItems.reduce((acc, i) => acc + (parseFloat(i.price) * parseFloat(i.qty)), 0);

    // Reparto de lo devuelto, el mismo que hace el servidor (services/returns/shared.js): en una
    // factura a crédito rebaja primero lo que se debe; lo libre paga la mercancía del cambio; y
    // lo que todavía sobre es del cliente, y el cajero elige qué hacer con ello.
    const hayCliente = !!sale.customer_id;
    const deuda      = Math.max(0, parseFloat(sale.balance || 0));
    const aDeuda     = Math.min(totalReturn, deuda);
    const libre      = Math.max(0, totalReturn - aDeuda);
    const aReemplazo = mode === "cambio" ? Math.min(libre, totalReplacement) : 0;
    const sobrante   = libre - aReemplazo;
    const porCobrar  = mode === "cambio" ? Math.max(0, totalReplacement - aReemplazo) : 0;
    const haySobrante = sobrante > 0.001;
    // Antes: la devolución ofrecía reembolsar y el cambio mandaba todo al saldo a favor.
    const destinoPorDefecto = mode === "cambio" && hayCliente ? "credito" : "reembolso";
    const destino = (surplusMode === "credito" && !hayCliente) ? "reembolso" : (surplusMode || destinoPorDefecto);
    const reembolsando = haySobrante && destino === "reembolso";

    const lineasDevueltas = () => sale.items
        .map(i => ({ sale_item_id: parseInt(i.id), qty: cantDe(i) }))
        .filter(i => i.qty > 0);

    const addReplacement = (product) => {
        setReplacementItems(prev => {
            const existing = prev.find(i => i.product_id === product.id);
            if (existing) {
                const newQty = existing.qty + 1;
                return prev.map(i => i.product_id === product.id ? { ...i, qty: newQty, qtyRaw: String(newQty) } : i);
            }
            return [...prev, { product_id: product.id, name: product.name, price: parseFloat(product.price || 0), qty: 1, qtyRaw: "1", stock: parseFloat(product.stock || 0), unit: product.unit || null }];
        });
        setProductSearch("");
        setProductResults([]);
    };

    const updateReplacementQty = (product_id, val) => {
        if (val === "" || val === undefined) {
            setReplacementItems(prev => prev.map(i => i.product_id === product_id ? { ...i, qtyRaw: "" } : i));
            return;
        }
        const qty = numDe(val);
        if (qty <= 0) {
            setReplacementItems(prev => prev.filter(i => i.product_id !== product_id));
            return;
        }
        setReplacementItems(prev => prev.map(i => i.product_id === product_id ? { ...i, qty, qtyRaw: val } : i));
    };

    const blurReplacementQty = (product_id) => {
        setReplacementItems(prev => {
            const found = prev.find(i => i.product_id === product_id);
            if (found && (found.qtyRaw === "" || found.qtyRaw === undefined)) {
                return prev.filter(i => i.product_id !== product_id);
            }
            return prev;
        });
    };

    // Tasa / símbolo / moneda de la caja de un tramo del reembolso: el monto se teclea en la
    // moneda de SU caja, que es la que el cajero entrega.
    const datosCajaReembolso = (journalId) => {
        const j = journalId ? activeJournals.find(x => x.id === journalId) : null;
        const cur = j?.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : null;
        const rate = (!cur || cur.is_base) ? 1 : parseFloat(cur.exchange_rate || 1);
        return { journal: j, cur, rate, sym: cur?.symbol || baseCurrency?.symbol || 'Ref.', isCash: j?.type === 'efectivo' };
    };

    const refundParts = (refund.parts || []).map(p => {
        const d = datosCajaReembolso(p.journal_id);
        const n = parseFloat(String(p.amount).replace(',', '.'));
        const montoBase = !isNaN(n) && n > 0 ? parseFloat((n / d.rate).toFixed(6)) : 0;
        return { ...p, ...d, num: n, montoBase };
    });
    const refundTotalBase = parseFloat(refundParts.reduce((a, s) => a + s.montoBase, 0).toFixed(6));
    const refundFaltaCaja = refundParts.some(s => !isNaN(s.num) && s.num > 0 && !s.journal_id);
    const refundFaltaRef  = refundParts.some(s => s.journal_id && !s.isCash && !String(s.reference || '').trim());
    const refundExcede    = refundTotalBase > sobrante + 0.01;
    // Lo que no se reembolsa queda a su favor; sin cliente no hay dónde dejarlo.
    const refundResto     = Math.max(0, sobrante - refundTotalBase);

    // Elegir la caja de un tramo: sugiere lo que falta por reembolsar, convertido a la moneda
    // de esa caja — todo lo que sobra en el primero, solo el resto en los siguientes.
    const asignarCajaReembolso = (idx, id, method = null) => setRefund(p => {
        const parts = [...p.parts];
        const { rate } = datosCajaReembolso(id);
        const yaAsignado = parts.reduce((acc, q, i) => {
            if (i === idx) return acc;
            const { rate: rr } = datosCajaReembolso(q.journal_id);
            const n = parseFloat(String(q.amount).replace(',', '.'));
            return acc + (isNaN(n) ? 0 : n / rr);
        }, 0);
        const falta = Math.max(0, sobrante - yaAsignado);
        parts[idx] = { ...parts[idx], journal_id: id, payment_method: method, amount: (Math.round(falta * rate * 100) / 100).toFixed(2) };
        return { ...p, parts };
    });

    const setParte = (idx, campos) => setRefund(p => {
        const parts = [...p.parts];
        parts[idx] = { ...parts[idx], ...campos };
        return { ...p, parts };
    });

    // Lo que sobra solo se valida cuando sale de caja: los otros dos destinos no piden nada.
    const validarSobrante = () => {
        if (!reembolsando) return true;
        const conMonto = refundParts.filter(s => !isNaN(s.num) && s.num > 0);
        if (conMonto.length === 0) { notify("Indica el monto del reembolso", "err"); return false; }
        if (refundFaltaCaja) { notify("Falta elegir la caja de un tramo del reembolso", "err"); return false; }
        if (refundFaltaRef) { notify("El número de referencia es obligatorio para ese método de reembolso", "err"); return false; }
        if (refundExcede) { notify(`El reembolso supera lo que le corresponde (${fmtB(sobrante)})`, "err"); return false; }
        if (!hayCliente && refundResto > 0.01) {
            notify(`Faltan ${fmtB(refundResto)} por reembolsar: la venta no tiene cliente al que dejárselos a favor`, "err");
            return false;
        }
        return true;
    };

    // El destino del sobrante y, si sale de caja, sus tramos. El backend registra un egreso por
    // tramo dentro de la misma transacción, con categoría propia y precisión de 6 decimales.
    const payloadSobrante = () => {
        if (!haySobrante) return {};
        if (destino !== "reembolso") return { surplus_mode: destino };
        const parts = refundParts
            .filter(s => s.journal_id && !isNaN(s.num) && s.num > 0)
            .map(s => ({
                journal_id: parseInt(s.journal_id),
                payment_method: s.payment_method || null,
                amount: String(s.amount || '').replace(',', '.'),
                reference: String(s.reference || '').trim() || null,
            }));
        return {
            surplus_mode: "reembolso",
            refund: { date: refund.date, notes: refund.notes?.trim() || null, parts },
        };
    };

    const handleSubmit = () => {
        if (lineasDevueltas().length === 0)
            return notify("Debes indicar al menos una cantidad mayor a 0 para devolver", "err");
        if (!validarSobrante()) return;
        setConfirmShow(true);
    };

    const executeSubmit = async () => {
        const returnItems = lineasDevueltas();

        setConfirmShow(false);
        setLoading(true);
        try {
            const res = await api.sales.createReturn(sale.id, { items: returnItems, reason, ...payloadSobrante() });
            onReturnSuccess();
            setReturnResult({ ...res.data, reason });
        } catch (e) {
            notify(e.message, "err");
        }
        setLoading(false);
    };

    const handleExchangeSubmit = () => {
        if (lineasDevueltas().length === 0) return notify("Selecciona al menos un producto a devolver", "err");
        if (replacementItems.length === 0) return notify("Agrega al menos un producto de reemplazo", "err");
        if (!validarSobrante()) return;
        setConfirmShow(true);
    };

    const executeExchange = async () => {
        const returnItems = lineasDevueltas();
        const replacements = replacementItems.map(i => ({ product_id: i.product_id, name: i.name, qty: i.qty, price: i.price }));
        setConfirmShow(false);
        setLoading(true);
        try {
            const res = await api.sales.createExchange(sale.id, { return_items: returnItems, replacement_items: replacements, reason, ...payloadSobrante() });
            onReturnSuccess();
            setExchangeResult(res);
        } catch (e) {
            notify(e.message, "err");
        }
        setLoading(false);
    };

    const documento = sale.invoice_number ? `Factura ${sale.invoice_number}` : `Orden #${sale.id}`;
    const nombresCajas = refundParts.filter(s => s.journal_id).map(s => toNameCase(s.journal?.name)).filter(Boolean).join(" + ");

    // Lo que sobra, dicho en la confirmación.
    const textoSobrante = () => {
        if (!haySobrante) return "";
        if (destino === "credito") return ` Quedan ${fmtB(sobrante)} a su favor.`;
        if (destino === "redondeo") return ` No se le devuelven ${fmtB(sobrante)}.`;
        const resto = hayCliente && refundResto > 0.01 ? ` y ${fmtB(refundResto)} quedan a su favor` : "";
        return ` Se reembolsan ${fmtB(refundTotalBase)} vía ${nombresCajas || "…"}${resto}.`;
    };

    // A dónde fue cada parte de la NC, tal como la registró el servidor. Solo las que tienen monto.
    const repartoNC = (r) => [
        [r.applied_to_debt,  "Rebajó la deuda de la factura"],
        [r.credit_applied,   "Pagó el reemplazo"],
        [r.credit_remainder ?? r.credited, "Quedó a su favor"],
        [r.refunded,         nombresCajas ? `Reembolsado · ${nombresCajas}` : "Reembolsado"],
        [r.kept,             "No se le devolvió"],
    ].filter(([monto]) => parseFloat(monto || 0) > 0.001);

    /* ── Vista: devolución registrada ── */
    if (returnResult) return (
        <Velo>
            <Panel ancho="max-w-sm">
                <Cabecera icono={ICONO_CHECK} tono="ok" rotulo="Devolución registrada" titulo={returnResult.nc_number || `NC-${returnResult.return_id}`} />
                <div className="px-5 pb-5 space-y-4">
                    <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3.5">
                        <p className="text-[12px] text-content-subtle">Total de la nota de crédito</p>
                        <Money value={fmtB(returnResult.total)} className="block text-[24px] font-bold tracking-tight leading-tight text-content dark:text-white" />
                    </div>
                    <dl className="space-y-2">
                        <Dato label="Factura" value={sale.invoice_number || `#${sale.id}`} />
                        {sale.customer_name && <Dato label="Cliente" value={toNameCase(sale.customer_name)} />}
                        {repartoNC(returnResult).map(([monto, label]) => (
                            <Dato key={label} label={label} value={<Money value={fmtB(monto)} />} />
                        ))}
                    </dl>
                </div>
                <Pie>
                    <button onClick={() => printNotaCreditoDoc(returnResult, sale, companyInfo, baseCurrency, activeCurrencies, printerWidth)} className={BTN_SEC}>
                        {ICONO_IMPRIMIR}
                        Imprimir N/C
                    </button>
                    <button onClick={onClose} className={`${BTN_PRI} sm:flex-1`}>Listo</button>
                </Pie>
            </Panel>
        </Velo>
    );

    /* ── Vista: cambio procesado ── */
    if (exchangeResult) {
        const porCobrar = exchangeResult.remaining_to_pay > 0.001;
        return (
            <>
            <Velo>
                <Panel ancho="max-w-sm">
                    <Cabecera icono={ICONO_CHECK} tono="ok" rotulo="Cambio procesado" titulo={exchangeResult.nc_number || `NC-${exchangeResult.return_id}`} />
                    <div className="px-5 pb-5 space-y-4">
                        <dl className="space-y-2">
                            <Dato label="Devuelto" value={<Money value={`-${fmtB(exchangeResult.return_total)}`} />} />
                            <Dato label="Reemplazo" value={<Money value={fmtB(exchangeResult.replacement_total)} />} />
                        </dl>
                        {repartoNC(exchangeResult).length > 0 && (
                            <dl className="space-y-2 pt-3 border-t border-border/60 dark:border-white/[0.06]">
                                {repartoNC(exchangeResult).map(([monto, label]) => (
                                    <Dato key={label} label={label} value={<Money value={fmtB(monto)} />} />
                                ))}
                            </dl>
                        )}
                        <div className="pt-3 border-t border-border/60 dark:border-white/[0.06]">
                            {diffCobrada ? (
                                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    Diferencia cobrada
                                </p>
                            ) : porCobrar ? (
                                <div className="flex items-end justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-semibold text-red-600 dark:text-red-400">Por cobrar</p>
                                        <p className="text-[12px] text-content-subtle truncate">Factura {exchangeResult.new_invoice_number || `#${exchangeResult.new_sale_id}`}</p>
                                    </div>
                                    <Money value={fmtB(exchangeResult.remaining_to_pay)} className="text-[22px] font-bold tracking-tight text-content dark:text-white" />
                                </div>
                            ) : (exchangeResult.credit_remainder > 0.001 || exchangeResult.refunded > 0.001 || exchangeResult.kept > 0.001) ? (
                                <p className="text-[13px] font-semibold text-content dark:text-white">Nada por cobrar</p>
                            ) : (
                                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    Sin diferencia
                                </p>
                            )}
                        </div>
                    </div>
                    {/* Los dos papeles del cambio: la N/C de lo que devolvió y la factura nueva con
                        lo que se llevó. En dos columnas: en el pie no caben junto a cobrar. */}
                    <div className="px-5 pb-4 grid grid-cols-2 gap-2">
                        <button onClick={() => printNotaCreditoDoc({ ...exchangeResult, total: exchangeResult.return_total }, sale, companyInfo, baseCurrency, activeCurrencies, printerWidth)} className={BTN_SEC}>
                            {ICONO_IMPRIMIR}
                            N/C
                        </button>
                        <button onClick={() => setShowNewInvoice(true)} className={`${BTN_SEC} min-w-0`}>
                            {ICONO_IMPRIMIR}
                            <span className="truncate">Factura {exchangeResult.new_invoice_number || `#${exchangeResult.new_sale_id}`}</span>
                        </button>
                    </div>
                    <Pie>
                        {porCobrar && !diffCobrada ? (
                            <>
                                <button onClick={() => { onReturnSuccess(); onClose(); }} className={BTN_SEC}>Cerrar</button>
                                <button onClick={() => setShowPayDiff(true)} className={`${BTN_PRI} sm:flex-1`}>
                                    Cobrar <Money value={fmtB(exchangeResult.remaining_to_pay)} className="[&>span]:!text-brand-ink/60" />
                                </button>
                            </>
                        ) : (
                            <button onClick={() => { onReturnSuccess(); onClose(); }} className={`${BTN_PRI} sm:flex-1`}>Listo</button>
                        )}
                    </Pie>
                </Panel>
            </Velo>

            {showNewInvoice && (
                <ReceiptModal open sale={{ id: exchangeResult.new_sale_id }} onClose={() => setShowNewInvoice(false)} />
            )}

            {showPayDiff && (
                <PaymentFormModal
                    sale={{
                        id:          exchangeResult.new_sale_id,
                        invoice_number: exchangeResult.new_invoice_number || `#${exchangeResult.new_sale_id}`,
                        balance:     exchangeResult.remaining_to_pay,
                        total:       exchangeResult.replacement_total,
                        amount_paid: exchangeResult.credit_applied,
                        customer_id: sale.customer_id,
                        exchange_rate: sale.exchange_rate,
                        // La factura nueva es de la misma sucursal: sin esto el selector ofrecía
                        // las cajas de todas las tiendas, y un cobro a una caja que no está en el
                        // turno no aparecía en el arqueo.
                        warehouse_id: sale.warehouse_id,
                    }}
                    onClose={() => setShowPayDiff(false)}
                    // Cobrada la diferencia, sale la factura nueva ya pagada para imprimirla.
                    onSuccess={() => { setShowPayDiff(false); setDiffCobrada(true); onReturnSuccess(); setShowNewInvoice(true); }}
                />
            )}
            </>
        );
    }

    /* ── Vista principal ── */
    const hayDevolucion = totalReturn > 0;
    const listoCambio   = hayDevolucion && replacementItems.length > 0;
    const pista = mode === "devolucion"
        ? "Indica cuánto devuelve de cada producto"
        : !hayDevolucion ? "Indica qué productos devuelve" : "Elige el producto que se lleva a cambio";

    return (
        <>
            <Velo onClick={onClose}>
                <Panel ancho="max-w-xl">
                    <Cabecera icono={ICONO_DEVOLVER} rotulo={mode === "cambio" ? "Cambio de producto" : "Devolución"} titulo={documento} onClose={onClose} />

                    {/* Body */}
                    <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
                        <div className="space-y-5 pt-1">
                            {/* ── A quién y cuánto ── */}
                            <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3.5 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-[12px] text-content-subtle">Cliente</p>
                                    <p className="text-[15px] font-semibold text-content dark:text-white truncate">
                                        {toNameCase(sale.customer_name) || "Sin cliente"}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[12px] text-content-subtle">Se devuelve</p>
                                    <Money value={fmtB(totalReturn)} className={`block text-[24px] font-bold tracking-tight leading-tight ${hayDevolucion ? "text-content dark:text-white" : "text-content-subtle"}`} />
                                </div>
                            </div>

                            <Segmented
                                className="w-full [&>button]:flex-1 [&>button]:justify-center"
                                value={mode}
                                onChange={setMode}
                                options={[
                                    { key: "devolucion", label: "Devolución" },
                                    { key: "cambio",     label: "Cambio de producto" },
                                ]}
                            />

                            {/* ── Productos: dos renglones por línea, sin tabla ── */}
                            <div>
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <p className="text-[13px] font-semibold text-content dark:text-white">
                                        Productos <span className="font-normal text-content-subtle">· {sale.items.length}</span>
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleReturnAll}
                                        className="h-8 text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white transition-colors"
                                    >
                                        {mode === "cambio" ? "Cambiar todo" : "Devolver todo"}
                                    </button>
                                </div>
                                <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                                    {sale.items.map((item, idx) => {
                                        const available = disponibleDe(item);
                                        const unit      = unidadDe(item);
                                        const neto      = netoDe(item);
                                        const cant      = cantDe(item);
                                        const devuelto  = parseFloat(item.returned_qty || 0);
                                        return (
                                            <div key={item.id ?? idx} className="flex items-center gap-3 px-3.5 py-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[13px] font-semibold truncate ${available > 0 ? "text-content dark:text-white" : "text-content-subtle"}`}>{item.name}</p>
                                                    <p className="text-[12px] text-content-subtle tabular-nums truncate">
                                                        {fmtCant(item.quantity, unit)} × <Money value={fmtB(neto)} />
                                                        {devuelto > 0 && <> · {available > 0 ? `${fmtCant(devuelto, unit)} ya devuelto` : "Devuelto completo"}</>}
                                                        {/* En el teléfono no cabe: la cifra ya está arriba, en "Se devuelve". */}
                                                        {cant > 0 && <span className="hidden sm:inline"> · <span className="font-medium text-content dark:text-white">{mode === "cambio" ? "Cambia" : "Devuelve"} <Money value={fmtB(cant * neto)} /></span></span>}
                                                    </p>
                                                </div>
                                                {available > 0 && (
                                                    <Cantidad
                                                        value={returnQtys[item.id] ?? ""}
                                                        max={available}
                                                        entera={esEntera(unit, item.quantity)}
                                                        onChange={raw => handleQtyChange(item, raw)}
                                                        label={`Cantidad a ${mode === "cambio" ? "cambiar" : "devolver"} de ${item.name}`}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <Field label="Motivo" hint="Opcional">
                                <input
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    placeholder="Dañado, defecto de fábrica, se arrepintió…"
                                    className={INPUT}
                                />
                            </Field>

                            {/* ── Producto de reemplazo (cambio) ── */}
                            {mode === "cambio" && (
                                <div className="space-y-3">
                                    <Field label="Producto de reemplazo">
                                        <div className="relative">
                                            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                                            </svg>
                                            <input
                                                type="text"
                                                value={productSearch}
                                                onChange={e => setProductSearch(e.target.value)}
                                                placeholder="Buscar en el catálogo…"
                                                className={`${INPUT} pl-9 pr-9`}
                                                autoComplete="off"
                                                spellCheck={false}
                                            />
                                            {searchLoading && <Spinner className="h-3.5 w-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-content-subtle" />}
                                        </div>
                                    </Field>

                                    {!searchLoading && productResults.length === 0 && productSearch.trim().length >= 2 && searchedFor === productSearch.trim() && (
                                        <p className="text-[12px] text-content-subtle">No hay productos que coincidan con «{searchedFor}»</p>
                                    )}

                                    {productResults.length > 0 && (
                                        <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] overflow-hidden">
                                            {productResults.map(p => {
                                                const agotado = !p.is_service && !(parseFloat(p.stock) > 0);
                                                return (
                                                    <button key={p.id} type="button" onClick={() => addReplacement(p)}
                                                        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                                                        <div className="min-w-0">
                                                            <p className="text-[13px] font-semibold text-content dark:text-white truncate">{p.name}</p>
                                                            <p className={`text-[12px] tabular-nums ${agotado ? "text-red-600 dark:text-red-400" : "text-content-subtle"}`}>
                                                                {p.is_service ? "Servicio" : agotado ? "Sin existencia" : `Existencia ${fmtCant(p.stock, p.unit)}`}
                                                            </p>
                                                        </div>
                                                        <Money value={fmtB(p.price)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {replacementItems.length > 0 && (
                                        <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                                            {replacementItems.map(item => (
                                                <div key={item.product_id} className="flex items-center gap-3 px-3.5 py-3">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13px] font-semibold text-content dark:text-white truncate">{item.name}</p>
                                                        <p className="text-[12px] text-content-subtle tabular-nums"><Money value={fmtB(item.price)} /> c/u</p>
                                                    </div>
                                                    <Cantidad
                                                        value={item.qtyRaw !== undefined ? item.qtyRaw : String(item.qty)}
                                                        min={1}
                                                        entera={esEntera(item.unit, item.qty)}
                                                        onChange={raw => updateReplacementQty(item.product_id, raw)}
                                                        onBlur={() => blurReplacementQty(item.product_id)}
                                                        label={`Cantidad de ${item.name}`}
                                                    />
                                                    <button type="button" onClick={() => setReplacementItems(prev => prev.filter(i => i.product_id !== item.product_id))}
                                                        className={`${QUITAR} !w-9 !h-9`} title="Quitar" aria-label={`Quitar ${item.name}`}>
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Resumen de la diferencia */}
                                    {listoCambio && (
                                        <div className="rounded-xl border border-border/70 dark:border-white/[0.08] px-4 py-3 space-y-1.5">
                                            <div className="flex justify-between text-[13px]">
                                                <span className="text-content-subtle">Devuelve</span>
                                                <Money value={fmtB(totalReturn)} className="font-medium text-content dark:text-white" />
                                            </div>
                                            {aDeuda > 0.001 && (
                                                <div className="flex justify-between text-[13px]">
                                                    <span className="text-content-subtle">Rebaja la deuda de la factura</span>
                                                    <Money value={`-${fmtB(aDeuda)}`} className="font-medium text-content dark:text-white" />
                                                </div>
                                            )}
                                            <div className="flex justify-between text-[13px]">
                                                <span className="text-content-subtle">Se lleva</span>
                                                <Money value={fmtB(totalReplacement)} className="font-medium text-content dark:text-white" />
                                            </div>
                                            <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t border-border/60 dark:border-white/[0.06]">
                                                {porCobrar > 0.001 ? (
                                                    <span className="text-[13px] font-semibold text-red-600 dark:text-red-400">{aDeuda > 0.001 ? "Queda por cobrar" : "Paga la diferencia"}</span>
                                                ) : haySobrante ? (
                                                    <span className="text-[13px] font-semibold text-content dark:text-white">Le corresponde</span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                        Sin diferencia
                                                    </span>
                                                )}
                                                {(porCobrar > 0.001 || haySobrante) && (
                                                    <Money value={fmtB(porCobrar > 0.001 ? porCobrar : sobrante)} className="text-[18px] font-bold tracking-tight text-content dark:text-white" />
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Devolución sobre una factura con deuda: cómo se reparte ── */}
                            {mode === "devolucion" && aDeuda > 0.001 && (
                                <div className="rounded-xl border border-border/70 dark:border-white/[0.08] px-4 py-3 space-y-1.5">
                                    <div className="flex justify-between text-[13px]">
                                        <span className="text-content-subtle">Rebaja la deuda de la factura</span>
                                        <Money value={fmtB(aDeuda)} className="font-medium text-content dark:text-white" />
                                    </div>
                                    <div className="flex items-baseline justify-between gap-3 pt-2 mt-1 border-t border-border/60 dark:border-white/[0.06]">
                                        <span className="text-[13px] font-semibold text-content dark:text-white">{haySobrante ? "Le corresponde" : "Sigue debiendo"}</span>
                                        <Money value={fmtB(haySobrante ? sobrante : deuda - aDeuda)} className="text-[18px] font-bold tracking-tight text-content dark:text-white" />
                                    </div>
                                </div>
                            )}

                            {/* ── Lo que le sobra al cliente: a favor, reembolso o no se devuelve ── */}
                            {haySobrante && (mode === "devolucion" ? hayDevolucion : listoCambio) && (
                                <div>
                                    <p className="mb-1.5 flex items-baseline justify-between gap-2">
                                        <span className={LABEL}>Qué hacer con lo que le corresponde</span>
                                        <Money value={fmtB(sobrante)} className="text-[13px] font-semibold text-content dark:text-white" />
                                    </p>
                                    <Segmented
                                        className="w-full [&>button]:flex-1 [&>button]:justify-center"
                                        value={destino}
                                        onChange={setSurplusMode}
                                        options={[
                                            ...(hayCliente ? [{ key: "credito", label: "Saldo a favor" }] : []),
                                            { key: "reembolso", label: "Reembolsar" },
                                            { key: "redondeo",  label: "No devolver" },
                                        ]}
                                    />
                                    <p className="mt-1.5 text-[12px] text-content-subtle">
                                        {destino === "credito"   ? "Queda en su saldo para la próxima compra en esta sucursal"
                                        : destino === "redondeo" ? "No sale dinero ni queda saldo: la diferencia es de la tienda"
                                        : "Indica de qué caja sale el dinero"}
                                    </p>

                                    {reembolsando && (
                                        <div className="mt-4 space-y-4">
                                            <div>
                                                <p className={`${LABEL} mb-1.5`}>Sale de</p>
                                                <div className="space-y-2.5">
                                                    {refundParts.map((s, idx) => (
                                                        <div key={idx} className="space-y-1.5">
                                                            <div className="flex gap-2 items-start">
                                                                <div className="flex-1 min-w-0">
                                                                    <JournalPickerButton
                                                                        value={s.journal_id || ''}
                                                                        journals={activeJournals}
                                                                        outflowOnly
                                                                        boxClassName="rounded-lg"
                                                                        onSelect={j => asignarCajaReembolso(idx, j.id, j.payment_method || null)}
                                                                        placeholder="Elegir caja…"
                                                                        methodPrompt={{ tag: "Reembolso", title: "¿De qué caja sale el reembolso?" }}
                                                                    />
                                                                </div>
                                                                <div className="w-28 sm:w-32 shrink-0 relative">
                                                                    <Prefijo>{s.sym}</Prefijo>
                                                                    <input
                                                                        type="text"
                                                                        inputMode="decimal"
                                                                        value={s.amount}
                                                                        placeholder="0.00"
                                                                        onChange={e => setParte(idx, { amount: e.target.value.replace(/[^\d.,]/g, '') })}
                                                                        className={`${INPUT} pl-11 text-right font-semibold tabular-nums`}
                                                                    />
                                                                </div>
                                                                {refundParts.length > 1 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setRefund(p => ({ ...p, parts: p.parts.filter((_, i) => i !== idx) }))}
                                                                        className={QUITAR}
                                                                        title="Quitar este tramo" aria-label="Quitar este tramo"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {s.cur && !s.cur.is_base && s.montoBase > 0 && (
                                                                <p className="text-[12px] text-content-subtle tabular-nums">≈ {fmtB(s.montoBase)} · tasa {s.rate}</p>
                                                            )}
                                                            {s.journal_id && !s.isCash && (
                                                                <input
                                                                    type="text"
                                                                    value={s.reference || ''}
                                                                    onChange={e => setParte(idx, { reference: e.target.value })}
                                                                    placeholder="N° de referencia"
                                                                    className={`${INPUT} !h-9`}
                                                                />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                {refundFaltaCaja && (
                                                    <p className="text-[12px] font-medium text-red-600 dark:text-red-400 mt-1.5">Elige de qué caja sale ese monto</p>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => setRefund(p => ({ ...p, parts: [...p.parts, { journal_id: '', amount: '', reference: '' }] }))}
                                                    className={`${AGREGAR} mt-2.5`}
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
                                                    Reembolsar desde otra caja
                                                </button>

                                                <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-border/60 dark:border-white/[0.06] text-[12px] tabular-nums">
                                                    <span className="text-content-subtle">
                                                        Reembolsado <span className="font-semibold text-content dark:text-white">{fmtB(refundTotalBase)}</span> de {fmtB(sobrante)}
                                                    </span>
                                                    {refundExcede
                                                        ? <span className="font-medium text-red-600 dark:text-red-400">Supera lo que le corresponde</span>
                                                        : refundResto > 0.01 && (hayCliente
                                                            ? <span className="text-content-subtle">El resto queda a su favor</span>
                                                            : <span className="font-medium text-red-600 dark:text-red-400">Faltan {fmtB(refundResto)}</span>)}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <Field label="Fecha del reembolso">
                                                    <DatePicker
                                                        value={refund.date}
                                                        onChange={v => setRefund(p => ({ ...p, date: v }))}
                                                        clearable={false}
                                                        className="w-full"
                                                    />
                                                </Field>
                                                <Field label="Notas" hint="Opcional">
                                                    <input
                                                        type="text"
                                                        value={refund.notes}
                                                        onChange={e => setRefund(p => ({ ...p, notes: e.target.value }))}
                                                        placeholder="Observaciones…"
                                                        className={INPUT}
                                                    />
                                                </Field>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pie: la acción principal solo aparece cuando hay algo que confirmar. */}
                    <Pie>
                        {(mode === "devolucion" ? hayDevolucion : listoCambio) ? (
                            <>
                                <button onClick={onClose} disabled={loading} className={`${BTN_SEC} disabled:opacity-50`}>Cancelar</button>
                                <button
                                    onClick={mode === "devolucion" ? handleSubmit : handleExchangeSubmit}
                                    disabled={loading}
                                    className={`${BTN_PRI} sm:flex-1 disabled:opacity-60`}
                                >
                                    {loading && <Spinner className="h-3.5 w-3.5" />}
                                    {loading ? "Procesando…"
                                        : mode === "devolucion" ? <>Devolver <Money value={fmtB(totalReturn)} className="[&>span]:!text-brand-ink/60" /></>
                                        : "Confirmar cambio"}
                                </button>
                            </>
                        ) : (
                            <>
                                {/* order-last: en la columna invertida del teléfono la pista queda encima del botón. */}
                                <p className="order-last sm:order-none flex-1 self-center text-center sm:text-left text-[12px] text-content-subtle">{pista}</p>
                                <button onClick={onClose} className={BTN_SEC}>Cerrar</button>
                            </>
                        )}
                    </Pie>
                </Panel>
            </Velo>

            <ConfirmModal
                isOpen={confirmShow}
                title={mode === "cambio" ? "¿Confirmar cambio?" : "¿Confirmar devolución?"}
                message={mode === "cambio"
                    ? `Devuelves ${fmtB(totalReturn)} y entregas ${fmtB(totalReplacement)}.${aDeuda > 0.001 ? ` ${fmtB(aDeuda)} rebajan la deuda de la factura.` : ""}${porCobrar > 0.001 ? ` Quedan ${fmtB(porCobrar)} por cobrar.` : ""}${textoSobrante()}`
                    : `Estás a punto de procesar una devolución por ${fmtB(totalReturn)}.${aDeuda > 0.001 ? ` ${fmtB(aDeuda)} rebajan la deuda de la factura.` : ""}${textoSobrante()} El stock será reintegrado automáticamente.`
                }
                onConfirm={mode === "cambio" ? executeExchange : executeSubmit}
                onCancel={() => setConfirmShow(false)}
                confirmText={mode === "cambio" ? "Sí, procesar cambio" : "Sí, procesar devolución"}
                type={mode === "cambio" ? "info" : "warning"}
            />
        </>
    );
}

// ── piezas ───────────────────────────────────────────────────────────────────
const LABEL   = "text-[12px] font-medium text-content-subtle";
const INPUT   = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";
const AGREGAR = "w-full h-9 rounded-lg border border-dashed border-border dark:border-white/15 text-[12px] font-medium text-content-subtle hover:text-content hover:border-content-subtle/60 dark:hover:text-white dark:hover:border-white/30 transition-colors flex items-center justify-center gap-1.5";
const QUITAR  = "w-10 h-10 shrink-0 rounded-lg border border-border dark:border-white/10 text-content-subtle hover:text-red-600 hover:border-red-500/40 dark:hover:text-red-400 transition-colors flex items-center justify-center";
const BTN_SEC = "btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-2";
const BTN_PRI = "btn-accent h-12 sm:h-10 px-5 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all";

const ICONO_DEVOLVER = "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6";
const ICONO_CHECK    = "M5 13l4 4L19 7";
const ICONO_IMPRIMIR = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
    </svg>
);

const Velo = ({ children, onClick }) => (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in" onClick={onClick}>
        {children}
    </div>
);

const Panel = ({ ancho, children }) => (
    <div
        className={`relative w-full ${ancho} bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] overflow-hidden flex flex-col max-h-[90vh] modal-in`}
        onClick={e => e.stopPropagation()}
    >
        {children}
    </div>
);

// Cabecera neutra de documento: icono en círculo gris (verde solo con el check de "hecho").
function Cabecera({ icono, tono, rotulo, titulo, onClose }) {
    return (
        <div className="shrink-0 pl-5 pr-3 pt-4 pb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tono === "ok"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/70"}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icono} />
                    </svg>
                </div>
                <div className="min-w-0">
                    <div className="text-[12px] text-content-subtle">{rotulo}</div>
                    <div className="text-[16px] font-bold tracking-[-0.01em] text-content dark:text-white tabular-nums truncate">{titulo}</div>
                </div>
            </div>
            {onClose && (
                <button
                    onClick={onClose}
                    aria-label="Cerrar"
                    className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-content-subtle hover:text-content hover:bg-surface-3 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
        </div>
    );
}

const Pie = ({ children }) => (
    <div className="shrink-0 px-5 py-4 border-t border-border/60 dark:border-white/[0.06] flex flex-col-reverse sm:flex-row gap-2">
        {children}
    </div>
);

const Dato = ({ label, value }) => (
    <div className="flex items-baseline justify-between gap-3">
        <dt className="text-[12px] text-content-subtle shrink-0">{label}</dt>
        <dd className="text-[13px] font-medium text-content dark:text-white tabular-nums text-right truncate">{value}</dd>
    </div>
);

// Símbolo de la moneda dentro del campo, a la izquierda.
const Prefijo = ({ children }) => (
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{children}</span>
);

function Field({ label, hint, children }) {
    return (
        <div>
            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className={LABEL}>{label}</span>
                {hint && <span className="text-[11px] text-content-subtle/70">{hint}</span>}
            </p>
            {children}
        </div>
    );
}

// Cantidad con − y + a los lados: en la tablet de caja se toca, no se teclea. Las unidades
// contables no aceptan decimales; las de peso o volumen, hasta tres.
function Cantidad({ value, onChange, onBlur, min = 0, max = Infinity, entera = true, label }) {
    const n = numDe(value);
    const paso = (d) => {
        const v = Math.min(max, Math.max(min, Math.round((n + d) * 1000) / 1000));
        onChange(String(v));
    };
    const teclear = (raw) => {
        if (entera) return onChange(raw.replace(/\D/g, ""));
        const m = raw.replace(/[^\d.,]/g, "").match(/^(\d*)([.,]?)(\d{0,3})/);
        onChange(m ? m[1] + m[2] + m[3] : "");
    };
    const BOTON = "w-9 h-full flex items-center justify-center text-content-subtle hover:text-content hover:bg-surface-2 dark:hover:text-white dark:hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors";
    return (
        <div className="h-9 shrink-0 flex items-stretch rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] overflow-hidden focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 transition-colors">
            <button type="button" onClick={() => paso(-1)} disabled={n <= min} className={BOTON} aria-label="Menos">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.4} d="M5 12h14" /></svg>
            </button>
            <input
                type="text"
                inputMode={entera ? "numeric" : "decimal"}
                value={value}
                onChange={e => teclear(e.target.value)}
                onBlur={onBlur}
                placeholder="0"
                aria-label={label}
                className="w-12 text-center text-[13px] font-semibold tabular-nums bg-transparent outline-none text-content dark:text-white placeholder:text-content-subtle/50 border-x border-border dark:border-white/10"
            />
            <button type="button" onClick={() => paso(1)} disabled={n >= max} className={BOTON} aria-label="Más">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.4} d="M12 5v14M5 12h14" /></svg>
            </button>
        </div>
    );
}
