import { useState, useEffect } from "react";
import DatePicker from "./ui/DatePicker";
import { api } from "../services/api";
import { fmtNumber, printNotaCreditoDoc } from "../helpers";
import { fmtQtyUnit } from "../helpers/unitFormatter";
import ConfirmModal from "./ui/ConfirmModal";
import PaymentFormModal from "./PaymentFormModal";
import { useApp } from "../context/AppContext";

const fmtPrice = (n) => `Ref. ${fmtNumber(n)}`;

const EMPTY_REFUND = () => ({
    enabled: false,
    journal_id: '',
    currency_id: '',
    amount: '',
    date: new Date().toISOString().split("T")[0],
    reference: '',
    notes: '',
});

export default function ReturnModal({ open, onClose, sale, onReturnSuccess, notify }) {
    const { companyInfo, baseCurrency, activeCurrencies, activeJournals } = useApp();
    const [mode, setMode] = useState("devolucion"); // "devolucion" | "cambio"
    const [returnQtys, setReturnQtys] = useState({});
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);
    const [confirmShow, setConfirmShow] = useState(false);
    const [returnResult, setReturnResult] = useState(null);
    const [refund, setRefund] = useState(EMPTY_REFUND());
    const [categories, setCategories] = useState([]);
    const [refundCreated, setRefundCreated] = useState(false);

    // Modo cambio
    const [exchangeResult, setExchangeResult] = useState(null);
    const [showPayDiff, setShowPayDiff] = useState(false);
    const [productSearch, setProductSearch] = useState("");
    const [productResults, setProductResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [replacementItems, setReplacementItems] = useState([]); // [{product_id, name, price, qty, stock}]

    useEffect(() => {
        if (open && sale) {
            setMode("devolucion");
            setReturnQtys({});
            setReason("");
            setReturnResult(null);
            setRefund(EMPTY_REFUND());
            setRefundCreated(false);
            setExchangeResult(null);
            setShowPayDiff(false);
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
                const res = await api.products.getAll({ search: productSearch.trim(), limit: 8 });
                setProductResults(res.data || []);
            } catch { setProductResults([]); }
            setSearchLoading(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [productSearch, mode]);

    if (!open || !sale) return null;

    const handleQtyChange = (itemId, maxQty, val) => {
        let parsed = parseFloat(val);
        if (isNaN(parsed) || parsed < 0) parsed = 0;
        if (parsed > maxQty) parsed = maxQty;
        setReturnQtys(prev => ({ ...prev, [itemId]: parsed }));
    };

    const handleReturnAll = () => {
        const qtys = {};
        sale.items.forEach(i => {
            const available = parseFloat(i.quantity) - parseFloat(i.returned_qty || 0);
            if (available > 0) qtys[i.id] = available;
        });
        setReturnQtys(qtys);
    };

    const totalReturn = sale.items.reduce((acc, i) => {
        const retQty = returnQtys[i.id] || 0;
        return acc + (retQty * (parseFloat(i.price) - parseFloat(i.discount || 0)));
    }, 0);

    const totalReplacement = replacementItems.reduce((acc, i) => acc + (parseFloat(i.price) * parseFloat(i.qty)), 0);
    const exchangeDiff = totalReplacement - totalReturn; // >0 cobra, <0 acredita

    const addReplacement = (product) => {
        setReplacementItems(prev => {
            const existing = prev.find(i => i.product_id === product.id);
            if (existing) {
                const newQty = existing.qty + 1;
                return prev.map(i => i.product_id === product.id ? { ...i, qty: newQty, qtyRaw: String(newQty) } : i);
            }
            return [...prev, { product_id: product.id, name: product.name, price: parseFloat(product.price || 0), qty: 1, qtyRaw: "1", stock: parseFloat(product.stock || 0) }];
        });
        setProductSearch("");
        setProductResults([]);
    };

    const updateReplacementQty = (product_id, val) => {
        if (val === "" || val === undefined) {
            setReplacementItems(prev => prev.map(i => i.product_id === product_id ? { ...i, qtyRaw: "" } : i));
            return;
        }
        const qty = parseFloat(val);
        if (isNaN(qty) || qty <= 0) {
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

    const refundJournal = activeJournals.find(j => j.id === refund.journal_id);
    const isCashRefund = refundJournal?.type === 'efectivo';
    const refundCurrency = activeCurrencies.find(c => c.id === parseInt(refund.currency_id));
    const refundRate = (!refundCurrency || refundCurrency.is_base) ? 1 : parseFloat(refundCurrency.exchange_rate || 1);
    const refundAmountNum = parseFloat(String(refund.amount || '').replace(',', '.'));

    const handleToggleRefund = async () => {
        if (!refund.enabled) {
            if (!categories.length) {
                try {
                    const res = await api.expenses.getCategories();
                    setCategories(res.data || []);
                } catch {}
            }
            setRefund(p => ({ ...p, enabled: true, amount: totalReturn.toFixed(2) }));
        } else {
            setRefund(EMPTY_REFUND());
        }
    };

    const handleSubmit = () => {
        const returnItems = Object.entries(returnQtys)
            .map(([id, qty]) => ({ sale_item_id: parseInt(id), qty }))
            .filter(i => i.qty > 0);

        if (returnItems.length === 0)
            return notify("Debes indicar al menos una cantidad mayor a 0 para devolver", "err");

        if (refund.enabled) {
            if (!refund.journal_id) return notify("Selecciona el método de reembolso", "err");
            if (isNaN(refundAmountNum) || refundAmountNum <= 0) return notify("El monto del reembolso debe ser mayor a 0", "err");
            if (!isCashRefund && !refund.reference?.trim()) return notify("El número de referencia es obligatorio para este método", "err");
        }

        setConfirmShow(true);
    };

    const executeSubmit = async () => {
        const returnItems = Object.entries(returnQtys)
            .map(([id, qty]) => ({ sale_item_id: parseInt(id), qty }))
            .filter(i => i.qty > 0);

        setConfirmShow(false);
        setLoading(true);
        try {
            const res = await api.sales.createReturn(sale.id, { items: returnItems, reason });

            let refundOk = false;
            if (refund.enabled && refund.journal_id) {
                try {
                    let catList = categories;
                    if (!catList.length) {
                        const r = await api.expenses.getCategories().catch(() => ({ data: [] }));
                        catList = r.data || [];
                    }
                    const cat = catList.find(c => /reembolso|devoluci/i.test(c.name)) || catList[0];
                    if (cat) {
                        const baseAmount = parseFloat((refundAmountNum / refundRate).toFixed(4));
                        await api.expenses.create({
                            description: `Reembolso NC-${res.data.return_id} / ${sale.invoice_number || '#' + sale.id}`,
                            amount: baseAmount,
                            category_id: cat.id,
                            payment_journal_id: parseInt(refund.journal_id),
                            reference: refund.reference?.trim() || null,
                            notes: refund.notes?.trim() || null,
                            currency_id: refundCurrency?.id || null,
                            rate: refundRate,
                        });
                        refundOk = true;
                    } else {
                        notify("Devolución creada, pero no hay categorías de egreso para registrar el reembolso", "err");
                    }
                } catch (refundErr) {
                    notify(`Devolución creada, pero error al registrar reembolso: ${refundErr.message}`, "err");
                }
            }

            setRefundCreated(refundOk);
            onReturnSuccess();
            setReturnResult({ ...res.data, reason });
        } catch (e) {
            notify(e.message, "err");
        }
        setLoading(false);
    };

    const handleExchangeSubmit = () => {
        const returnItems = Object.entries(returnQtys).map(([id, qty]) => ({ sale_item_id: parseInt(id), qty })).filter(i => i.qty > 0);
        if (returnItems.length === 0) return notify("Selecciona al menos un producto a devolver", "err");
        if (replacementItems.length === 0) return notify("Agrega al menos un producto de reemplazo", "err");
        setConfirmShow(true);
    };

    const executeExchange = async () => {
        const returnItems = Object.entries(returnQtys).map(([id, qty]) => ({ sale_item_id: parseInt(id), qty })).filter(i => i.qty > 0);
        const replacements = replacementItems.map(i => ({ product_id: i.product_id, name: i.name, qty: i.qty, price: i.price }));
        setConfirmShow(false);
        setLoading(true);
        try {
            const res = await api.sales.createExchange(sale.id, { return_items: returnItems, replacement_items: replacements, reason });
            onReturnSuccess();
            setExchangeResult(res);
        } catch (e) {
            notify(e.message, "err");
        }
        setLoading(false);
    };

    /* ── Vista: resultado exitoso ── */
    if (returnResult) return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-3 duration-200 ease-out">
                <div className="px-5 py-4 border-b border-border/10 dark:border-white/5 flex items-center gap-3 bg-warning/5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-warning/10 text-warning border border-warning/20">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                        </svg>
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Devolución Registrada</div>
                        <div className="text-sm font-black text-content dark:text-white">{returnResult.nc_number || `NC-${returnResult.return_id}`}</div>
                    </div>
                    <div className="ml-auto text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border bg-warning/10 text-warning border-warning/20">
                        Procesada
                    </div>
                </div>

                <div className="px-5 py-4 space-y-2 border-b border-border/10 dark:border-white/5">
                    <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 uppercase">Factura ref.</span>
                        <span className="text-[11px] font-bold text-content dark:text-white">{sale.invoice_number || `#${sale.id}`}</span>
                    </div>
                    {sale.customer_name && (
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 uppercase">Cliente</span>
                            <span className="text-[11px] font-bold text-content dark:text-white/70">{sale.customer_name}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center pt-1 border-t border-border/10 dark:border-white/5">
                        <span className="text-[11px] font-black uppercase tracking-wide text-content dark:text-white">Total Acreditado</span>
                        <span className="text-xl font-black text-warning tabular-nums">{fmtPrice(returnResult.total)}</span>
                    </div>
                    {refundCreated && (
                        <div className="flex justify-between items-center pt-1.5 border-t border-border/10 dark:border-white/5">
                            <span className="text-[11px] font-black uppercase text-content-subtle dark:text-white/40">Reembolso registrado</span>
                            <span className="text-[11px] font-black text-success flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                                {refundJournal?.name || ''}
                            </span>
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 flex gap-2">
                    <button
                        onClick={() => printNotaCreditoDoc(returnResult, sale, companyInfo, baseCurrency, activeCurrencies)}
                        className="flex-1 h-9 rounded-xl border border-border/30 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle hover:text-content dark:hover:text-white transition-all flex items-center justify-center gap-2"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Imprimir N/C
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 h-9 rounded-xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-wide hover:brightness-110 transition-all flex items-center justify-center gap-2"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Siguiente
                    </button>
                </div>
            </div>
        </div>
    );

    /* ── Vista: resultado de cambio ── */
    if (exchangeResult) return (
        <>
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-5 py-4 border-b border-border/10 dark:border-white/5 flex items-center gap-3 bg-brand-500/5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-brand-500/10 text-brand-500 border border-brand-500/20">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Cambio Procesado</div>
                        <div className="text-sm font-black text-content dark:text-white">{exchangeResult.nc_number || `NC-${exchangeResult.return_id}`}</div>
                    </div>
                </div>

                <div className="px-5 py-4 space-y-2 border-b border-border/10 dark:border-white/5">
                    <div className="flex justify-between"><span className="text-[11px] text-content-subtle dark:text-white/40 uppercase font-bold">Devuelto</span><span className="text-[11px] font-black text-warning tabular-nums">−{fmtPrice(exchangeResult.return_total)}</span></div>
                    <div className="flex justify-between"><span className="text-[11px] text-content-subtle dark:text-white/40 uppercase font-bold">Reemplazo</span><span className="text-[11px] font-black text-content dark:text-white tabular-nums">{fmtPrice(exchangeResult.replacement_total)}</span></div>
                    {exchangeResult.credit_remainder > 0.001 && (
                        <div className="flex justify-between pt-1 border-t border-border/10 dark:border-white/5">
                            <span className="text-[11px] font-black uppercase text-brand-500">Crédito generado</span>
                            <span className="text-[13px] font-black text-brand-500 tabular-nums">{fmtPrice(exchangeResult.credit_remainder)}</span>
                        </div>
                    )}
                    {exchangeResult.remaining_to_pay > 0.001 && (
                        <div className="flex justify-between items-center pt-1 border-t border-border/10 dark:border-white/5">
                            <div>
                                <span className="text-[11px] font-black uppercase text-danger">Por cobrar</span>
                                <p className="text-[9px] text-content-subtle dark:text-white/30 mt-0.5">Factura {exchangeResult.new_invoice_number || `#${exchangeResult.new_sale_id}`}</p>
                            </div>
                            <span className="text-[13px] font-black text-danger tabular-nums">{fmtPrice(exchangeResult.remaining_to_pay)}</span>
                        </div>
                    )}
                    {exchangeResult.remaining_to_pay <= 0.001 && exchangeResult.credit_remainder <= 0.001 && (
                        <div className="flex items-center justify-center gap-2 pt-1 border-t border-border/10 dark:border-white/5 text-success text-[12px] font-black">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                            Sin diferencia
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 flex gap-2">
                    <button onClick={onClose}
                        className="flex-1 h-9 rounded-xl border border-border/30 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle hover:text-content dark:hover:text-white transition-all">
                        Cerrar
                    </button>
                    {exchangeResult.remaining_to_pay > 0.001 && (
                        <button onClick={() => setShowPayDiff(true)}
                            className="flex-1 h-9 rounded-xl bg-success text-black text-[11px] font-black uppercase tracking-wide hover:brightness-110 transition-all shadow-lg shadow-success/20 flex items-center justify-center gap-2">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            Cobrar diferencia
                        </button>
                    )}
                </div>
            </div>
        </div>

        {showPayDiff && (
            <PaymentFormModal
                sale={{
                    id:          exchangeResult.new_sale_id,
                    balance:     exchangeResult.remaining_to_pay,
                    total:       exchangeResult.replacement_total,
                    customer_id: sale.customer_id,
                }}
                onClose={() => setShowPayDiff(false)}
                onSuccess={() => { setShowPayDiff(false); onReturnSuccess(); onClose(); }}
            />
        )}
        </>
    );

    /* ── Vista principal ── */
    return (
        <>
            <div
                className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            >
                <div
                    className="relative w-full max-w-xl bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 slide-in-from-bottom-3 duration-200 ease-out"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="shrink-0 px-5 py-4 border-b border-border/10 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.03]">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-warning/10 text-warning border border-warning/20 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                            </div>
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Devolución</div>
                                <div className="text-sm font-black text-content dark:text-white">{sale.invoice_number || `#${sale.id}`}</div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:bg-surface-2 dark:hover:bg-white/10 transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Tabs: Devolución / Cambio */}
                    <div className="shrink-0 px-5 pt-3 pb-0 flex gap-1.5">
                        {[["devolucion","Devolución"],["cambio","Cambio de Producto"]].map(([key, label]) => (
                            <button key={key} type="button" onClick={() => setMode(key)}
                                className={["flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                                    mode === key ? "bg-brand-500 text-black border-transparent" : "text-content-subtle dark:text-white/30 border-border/20 dark:border-white/5 hover:border-brand-500/30"
                                ].join(" ")}>{label}</button>
                        ))}
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto scrollbar-hide">

                        {/* Tabla de productos */}
                        <div className="px-5 pt-4 pb-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">
                                    Productos ({sale.items.length})
                                </div>
                                <button
                                    onClick={handleReturnAll}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 dark:bg-white/5 hover:bg-warning/10 text-warning border border-warning/20 text-[10px] font-black uppercase tracking-wide transition-all"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    {mode === "cambio" ? "Cambiar todo" : "Devolver todo"}
                                </button>
                            </div>

                            <div className="rounded-xl border border-border/20 dark:border-white/5 overflow-hidden">
                                {/* Thead */}
                                <div className="grid grid-cols-12 bg-surface-2 dark:bg-white/[0.03] px-3 py-2">
                                    <span className="col-span-4 text-[10px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30">Producto</span>
                                    <span className="col-span-2 text-[10px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-right">P. Unit</span>
                                    <span className="col-span-2 text-[10px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 text-center">Vendido</span>
                                    <span className="col-span-2 text-[10px] font-black uppercase tracking-wide text-danger dark:text-danger/70 text-center">Devuelto</span>
                                    <span className="col-span-2 text-[10px] font-black uppercase tracking-wide text-brand-500 text-right">{mode === "cambio" ? "A camb." : "A dev."}</span>
                                </div>

                                <div className="divide-y divide-border/10 dark:divide-white/5">
                                    {sale.items.map((item, idx) => {
                                        const available = parseFloat(item.quantity) - parseFloat(item.returned_qty || 0);
                                        return (
                                            <div
                                                key={idx}
                                                className={`grid grid-cols-12 items-center px-3 py-2.5 transition-colors ${available <= 0 ? "opacity-40 bg-surface-2/50 dark:bg-white/[0.02]" : "hover:bg-surface-2/30 dark:hover:bg-white/[0.02]"}`}
                                            >
                                                <div className="col-span-4 min-w-0">
                                                    <div className="text-[12px] font-bold text-content dark:text-white truncate">{item.name}</div>
                                                </div>
                                                <div className="col-span-2 text-right text-[11px] font-bold text-content-subtle dark:text-white/40 tabular-nums">
                                                    {fmtPrice(item.price)}
                                                </div>
                                                <div className="col-span-2 text-center text-[12px] font-bold text-content dark:text-white tabular-nums">
                                                    {parseFloat(item.quantity)}
                                                </div>
                                                <div className="col-span-2 text-center text-[12px] font-bold text-danger tabular-nums">
                                                    {parseFloat(item.returned_qty || 0)}
                                                </div>
                                                <div className="col-span-2 flex justify-end">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={available}
                                                        step="1"
                                                        disabled={available <= 0}
                                                        className="w-14 h-8 bg-white dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-lg text-[12px] font-bold text-center outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed tabular-nums"
                                                        value={returnQtys[item.id] === 0 ? "" : (returnQtys[item.id] || "")}
                                                        onChange={e => handleQtyChange(item.id, available, e.target.value)}
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Motivo */}
                        <div className="px-5 pb-3">
                            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">Motivo / Notas</div>
                            <input
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="Ej: Producto dañado, cambio por defecto, cliente se arrepintió..."
                                className="w-full h-10 bg-surface-2/50 dark:bg-white/[0.03] border border-border/20 dark:border-white/5 rounded-xl px-3.5 text-[12px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/20 transition-all placeholder:text-content-subtle dark:placeholder:text-white/20"
                            />
                        </div>

                        {/* Reembolso al cliente (solo modo devolución) */}
                        {mode === "devolucion" && <div className="px-5 pb-3">
                            <button
                                type="button"
                                onClick={handleToggleRefund}
                                className={[
                                    "w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-[11px] font-black uppercase tracking-wide",
                                    refund.enabled
                                        ? "border-success/40 bg-success/5 text-success"
                                        : "border-border/20 dark:border-white/5 text-content-subtle dark:text-white/30 hover:border-border/40 dark:hover:border-white/10"
                                ].join(" ")}
                            >
                                <span className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                    </svg>
                                    Reembolsar al cliente
                                </span>
                                <span className={refund.enabled ? "text-success" : "opacity-40 text-[10px]"}>
                                    {refund.enabled ? "✓ Activado" : "Opcional"}
                                </span>
                            </button>

                            {refund.enabled && (
                                <div className="mt-2 p-4 bg-surface-2/50 dark:bg-white/[0.03] rounded-xl border border-border/20 dark:border-white/5 space-y-4">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">Método de reembolso *</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {activeJournals.map(j => {
                                                const active = refund.journal_id === j.id;
                                                return (
                                                    <button key={j.id} type="button"
                                                        onClick={() => {
                                                            const newCurId = j.currency_id || baseCurrency?.id;
                                                            setRefund(p => ({ ...p, journal_id: j.id, currency_id: newCurId || p.currency_id }));
                                                        }}
                                                        style={active && j.color ? { borderColor: j.color, backgroundColor: j.color, color: "#000" } : undefined}
                                                        className={[
                                                            "px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all",
                                                            active && !j.color
                                                                ? "border-brand-500 bg-brand-500 text-black"
                                                                : !active
                                                                ? "border-border/20 dark:border-white/10 text-content-subtle dark:text-white/40 hover:border-brand-400/50"
                                                                : ""
                                                        ].join(" ")}
                                                    >
                                                        {j.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {refundCurrency && !refundCurrency.is_base && (
                                            <p className="text-[10px] font-bold text-content-subtle dark:text-white/30 mt-1.5">
                                                {refundCurrency.symbol} {refundCurrency.code} · tasa {parseFloat(refundCurrency.exchange_rate).toFixed(4)}
                                            </p>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">Monto *</p>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={refund.amount}
                                                onChange={e => setRefund(p => ({ ...p, amount: e.target.value.replace(/[^\d.,]/g, '') }))}
                                                placeholder="0.00"
                                                className="w-full h-10 bg-white dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all"
                                            />
                                            {refundCurrency && !refundCurrency.is_base && !isNaN(refundAmountNum) && refundAmountNum > 0 && (
                                                <p className="text-[10px] font-bold text-success mt-1">
                                                    ≈ {baseCurrency?.symbol}{(refundAmountNum / refundRate).toFixed(2)} {baseCurrency?.code}
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">Fecha *</p>
                                            <DatePicker
                                                value={refund.date}
                                                onChange={v => setRefund(p => ({ ...p, date: v }))}
                                                className="w-full"
                                            />
                                        </div>
                                    </div>

                                    {!isCashRefund && refund.journal_id && (
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">N° Referencia *</p>
                                            <input
                                                type="text"
                                                value={refund.reference}
                                                onChange={e => setRefund(p => ({ ...p, reference: e.target.value }))}
                                                placeholder="Ej: 000123456"
                                                className="w-full h-10 bg-white dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all"
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">Notas</p>
                                        <input
                                            type="text"
                                            value={refund.notes}
                                            onChange={e => setRefund(p => ({ ...p, notes: e.target.value }))}
                                            placeholder="Observaciones del reembolso..."
                                            className="w-full h-10 bg-white dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>}

                        {/* Total a reintegrar (solo modo devolución) */}
                        {mode === "devolucion" && (
                            <div className="px-5 pb-5">
                                <div className="flex items-center justify-between px-4 py-3.5 bg-warning/5 border border-warning/20 rounded-xl">
                                    <span className="text-[11px] font-black uppercase tracking-wide text-warning/70">Total a Reintegrar</span>
                                    <span className="text-2xl font-black text-warning tabular-nums">{fmtPrice(totalReturn)}</span>
                                </div>
                            </div>
                        )}

                        {/* Sección producto de reemplazo (modo cambio) */}
                        {mode === "cambio" && (
                            <div className="px-5 pb-5 space-y-3">
                                {/* Buscador */}
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">Producto de reemplazo</div>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={productSearch}
                                            onChange={e => setProductSearch(e.target.value)}
                                            placeholder="Buscar producto del catálogo..."
                                            className="w-full h-10 bg-surface-2/50 dark:bg-white/[0.03] border border-border/20 dark:border-white/5 rounded-xl px-3.5 text-[12px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all placeholder:text-content-subtle dark:placeholder:text-white/20"
                                        />
                                        {searchLoading && <div className="absolute right-3 top-3 text-[10px] text-content-subtle">...</div>}
                                    </div>
                                    {productResults.length > 0 && (
                                        <div className="mt-1 rounded-xl border border-border/20 dark:border-white/5 overflow-hidden shadow-lg">
                                            {productResults.map(p => (
                                                <button key={p.id} type="button" onClick={() => addReplacement(p)}
                                                    className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-brand-500/10 transition-colors text-left border-b last:border-0 border-border/10 dark:border-white/5">
                                                    <div>
                                                        <div className="text-[12px] font-bold text-content dark:text-white">{p.name}</div>
                                                        <div className="text-[10px] text-content-subtle dark:text-white/30">Stock: {p.stock != null ? fmtQtyUnit(p.stock, p.unit) : "—"}</div>
                                                    </div>
                                                    <span className="text-[12px] font-black text-brand-500 tabular-nums">{fmtPrice(p.price)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Lista de reemplazos seleccionados */}
                                {replacementItems.length > 0 && (
                                    <div className="rounded-xl border border-border/20 dark:border-white/5 overflow-hidden">
                                        {replacementItems.map(item => (
                                            <div key={item.product_id} className="flex items-center gap-3 px-3.5 py-2.5 border-b last:border-0 border-border/10 dark:border-white/5">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[12px] font-bold text-content dark:text-white truncate">{item.name}</div>
                                                    <div className="text-[10px] text-content-subtle dark:text-white/30 tabular-nums">{fmtPrice(item.price)} c/u</div>
                                                </div>
                                                <input type="number" min="1" step="1"
                                                    value={item.qtyRaw !== undefined ? item.qtyRaw : String(item.qty)}
                                                    onChange={e => updateReplacementQty(item.product_id, e.target.value)}
                                                    onBlur={() => blurReplacementQty(item.product_id)}
                                                    className="w-14 h-8 bg-white dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-lg text-[12px] font-bold text-center outline-none focus:border-brand-500/60 transition-all tabular-nums"
                                                />
                                                <button type="button" onClick={() => setReplacementItems(prev => prev.filter(i => i.product_id !== item.product_id))}
                                                    className="text-danger/60 hover:text-danger transition-colors">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Resumen diferencia */}
                                {totalReturn > 0 && replacementItems.length > 0 && (
                                    <div className="rounded-xl border overflow-hidden divide-y divide-border/10 dark:divide-white/5 border-border/20 dark:border-white/5">
                                        <div className="flex justify-between px-4 py-2.5">
                                            <span className="text-[11px] text-content-subtle dark:text-white/40 font-bold uppercase">Devuelto</span>
                                            <span className="text-[12px] font-black text-warning tabular-nums">{fmtPrice(totalReturn)}</span>
                                        </div>
                                        <div className="flex justify-between px-4 py-2.5">
                                            <span className="text-[11px] text-content-subtle dark:text-white/40 font-bold uppercase">Reemplazo</span>
                                            <span className="text-[12px] font-black text-content dark:text-white tabular-nums">{fmtPrice(totalReplacement)}</span>
                                        </div>
                                        <div className={`flex justify-between px-4 py-3 ${exchangeDiff > 0.001 ? "bg-danger/5" : exchangeDiff < -0.001 ? "bg-brand-500/5" : "bg-success/5"}`}>
                                            <span className="text-[11px] font-black uppercase tracking-wide">
                                                {exchangeDiff > 0.001 ? "A cobrar" : exchangeDiff < -0.001 ? "Va a crédito" : "Sin diferencia"}
                                            </span>
                                            <span className={`text-xl font-black tabular-nums ${exchangeDiff > 0.001 ? "text-danger" : exchangeDiff < -0.001 ? "text-brand-500" : "text-success"}`}>
                                                {exchangeDiff > 0.001 ? `+${fmtPrice(exchangeDiff)}` : exchangeDiff < -0.001 ? fmtPrice(Math.abs(exchangeDiff)) : "—"}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="shrink-0 px-5 py-4 border-t border-border/10 dark:border-white/5 bg-surface-2/30 dark:bg-white/[0.02] flex items-center justify-end gap-2">
                        <button onClick={onClose} disabled={loading}
                            className="h-9 px-4 rounded-xl border border-border/30 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle hover:text-content dark:hover:text-white transition-all disabled:opacity-50">
                            Cerrar
                        </button>
                        {mode === "devolucion" ? (
                            <button onClick={handleSubmit} disabled={loading || totalReturn === 0}
                                className={["h-9 px-5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all",
                                    loading || totalReturn === 0 ? "bg-surface-2 dark:bg-white/5 text-content-subtle cursor-not-allowed" : "bg-warning text-black hover:brightness-110 shadow-lg shadow-warning/20"
                                ].join(" ")}>
                                {loading ? "Procesando…" : "Confirmar Devolución"}
                            </button>
                        ) : (
                            <button onClick={handleExchangeSubmit} disabled={loading || totalReturn === 0 || replacementItems.length === 0}
                                className={["h-9 px-5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all",
                                    loading || totalReturn === 0 || replacementItems.length === 0 ? "bg-surface-2 dark:bg-white/5 text-content-subtle cursor-not-allowed" : "bg-brand-500 text-black hover:brightness-110 shadow-lg shadow-brand-500/20"
                                ].join(" ")}>
                                {loading ? "Procesando…" : "Confirmar Cambio"}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmShow}
                title={mode === "cambio" ? "¿Confirmar cambio?" : "¿Confirmar devolución?"}
                message={mode === "cambio"
                    ? `Devuelves ${fmtPrice(totalReturn)} y entregas ${fmtPrice(totalReplacement)}.${exchangeDiff > 0.001 ? ` El cliente deberá pagar ${fmtPrice(exchangeDiff)} adicional.` : exchangeDiff < -0.001 ? ` Se acreditarán ${fmtPrice(Math.abs(exchangeDiff))} al cliente.` : ""}`
                    : `Estás a punto de procesar una devolución por ${fmtPrice(totalReturn)}.${refund.enabled ? ` Se registrará un reembolso de ${refund.amount ? 'Ref. ' + refund.amount : ''} vía ${refundJournal?.name || '...'}.` : ''} El stock será reintegrado automáticamente.`
                }
                onConfirm={mode === "cambio" ? executeExchange : executeSubmit}
                onCancel={() => setConfirmShow(false)}
                confirmText={mode === "cambio" ? "Sí, procesar cambio" : "Sí, procesar devolución"}
                type={mode === "cambio" ? "info" : "warning"}
            />
        </>
    );
}
