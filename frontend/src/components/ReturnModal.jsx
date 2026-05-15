import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import DatePicker from "./ui/DatePicker";
import { api } from "../services/api";
import { fmtNumber, printNotaCreditoDoc } from "../helpers";
import ConfirmModal from "./ui/ConfirmModal";
import { useApp } from "../context/AppContext";

const fmtPrice = (n) => `$${fmtNumber(n)}`;

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
    const [returnQtys, setReturnQtys] = useState({});
    const [reason, setReason] = useState("");
    const [loading, setLoading] = useState(false);
    const [confirmShow, setConfirmShow] = useState(false);
    const [returnResult, setReturnResult] = useState(null);
    const [refund, setRefund] = useState(EMPTY_REFUND());
    const [categories, setCategories] = useState([]);
    const [refundCreated, setRefundCreated] = useState(false);

    useEffect(() => {
        if (open && sale) {
            setReturnQtys({});
            setReason("");
            setReturnResult(null);
            setRefund(EMPTY_REFUND());
            setRefundCreated(false);
        }
    }, [open, sale]);

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

    // Refund derived values
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

        if (returnItems.length === 0) {
            return notify("Debes indicar al menos una cantidad mayor a 0 para devolver", "err");
        }

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

    if (returnResult) return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-white dark:bg-surface-dark-2 rounded-xl shadow-2xl border border-border/20 dark:border-white/5 overflow-hidden">

                <div className="px-5 py-4 border-b border-border/20 dark:border-white/5 flex items-center gap-3 bg-warning/5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-warning/10 text-warning border border-warning/20">
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

                <div className="px-5 py-4 space-y-2 border-b border-border/20 dark:border-white/5">
                    <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 uppercase tracking-wide">Factura ref.</span>
                        <span className="text-[11px] font-bold text-content dark:text-white">{sale.invoice_number || `#${sale.id}`}</span>
                    </div>
                    {sale.customer_name && (
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 uppercase tracking-wide">Cliente</span>
                            <span className="text-[11px] font-bold text-content dark:text-white/70">{sale.customer_name}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center pt-1">
                        <span className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40">Total Acreditado</span>
                        <span className="text-xl font-black text-warning tabular-nums">{fmtPrice(returnResult.total)}</span>
                    </div>
                    {refundCreated && (
                        <div className="flex justify-between items-center pt-1.5 border-t border-border/20 dark:border-white/5">
                            <span className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40">Reembolso registrado</span>
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

    return (
        <>
            <Modal open={open} onClose={onClose} title={`DEVOLUCIÓN DE ${sale.invoice_number || "#" + sale.id}`} width={600}>
                <div className="mb-4 text-[12px] text-content-muted dark:text-content-dark-muted">
                    Indica la cantidad que deseas devolver de cada producto. Si devuelves una cantidad parcial, el valor total a reintegrar se calculará automáticamente.
                </div>

                <div className="flex justify-end mb-2">
                    <button onClick={handleReturnAll} className="btn-sm btn-secondary text-[11px] uppercase tracking-wide font-black">
                        ↻ Devolver todo
                    </button>
                </div>

                <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-[1rem] border border-border/40 overflow-hidden shadow-sm mb-4 max-h-[40vh] overflow-y-auto scrollbar-dark">
                    <table className="w-full text-[11px] border-collapse min-w-[500px]">
                        <thead className="sticky top-0 bg-surface-3 dark:bg-surface-dark border-b border-border/40 z-10">
                            <tr>
                                <th className="text-left px-4 py-2 font-black text-content-subtle uppercase tracking-wide">Producto</th>
                                <th className="text-center px-4 py-2 font-black text-content-subtle uppercase tracking-wide w-24">Precio U.</th>
                                <th className="text-center px-4 py-2 font-black text-content-subtle uppercase tracking-wide w-24">Vendidos</th>
                                <th className="text-center px-4 py-2 font-black text-content-subtle uppercase tracking-wide w-24 text-danger">Devueltos</th>
                                <th className="text-right px-4 py-2 font-black text-content-subtle uppercase tracking-wide w-28 text-brand-500">Volver a Dev.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {sale.items.map((item, idx) => {
                                const available = parseFloat(item.quantity) - parseFloat(item.returned_qty || 0);
                                return (
                                <tr key={idx} className={`hover:bg-brand-500/5 transition-colors ${available <= 0 ? 'opacity-40 bg-surface-3' : ''}`}>
                                    <td className="px-4 py-3 font-bold text-content">{item.name}</td>
                                    <td className="px-4 py-3 text-center font-bold text-content-muted">{fmtPrice(item.price)}</td>
                                    <td className="px-4 py-3 text-center font-bold text-content-muted">{parseFloat(item.quantity)}</td>
                                    <td className="px-4 py-3 text-center font-bold text-danger">{parseFloat(item.returned_qty || 0)}</td>
                                    <td className="px-4 py-2 text-right">
                                        <input
                                            type="number"
                                            min="0"
                                            max={available}
                                            step="1"
                                            disabled={available <= 0}
                                            className="w-[70px] bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark py-1.5 px-2 rounded-lg text-[11px] font-bold text-center outline-none focus:ring-1 focus:ring-brand-500/20 shadow-sm disabled:opacity-50"
                                            value={returnQtys[item.id] === 0 ? "" : (returnQtys[item.id] || "")}
                                            onChange={(e) => handleQtyChange(item.id, available, e.target.value)}
                                            placeholder="0"
                                        />
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="mb-4">
                    <label className="label text-[11px] font-black uppercase tracking-wide text-content-subtle mb-1">Motivo / Notas de la devolución</label>
                    <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ej: Producto dañado, cambio por defecto, cliente se arrepintió..."
                        className="w-full bg-surface-2 dark:bg-surface-dark-2 border border-border dark:border-border-dark py-2.5 px-3 rounded-xl text-xs outline-none focus:ring-2 focus:ring-brand-500/20 shadow-sm text-content dark:text-content-dark placeholder:text-content-subtle"
                    />
                </div>

                {/* Reembolso al cliente */}
                <div className="mb-4">
                    <button
                        type="button"
                        onClick={handleToggleRefund}
                        className={[
                            "w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-[11px] font-black uppercase tracking-wide",
                            refund.enabled
                                ? "border-success/60 bg-success/5 text-success"
                                : "border-border/40 dark:border-white/10 text-content-subtle dark:text-white/30 hover:border-border dark:hover:border-white/20"
                        ].join(" ")}
                    >
                        <span className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            Reembolsar al cliente
                        </span>
                        <span className={refund.enabled ? "text-success" : "opacity-50"}>
                            {refund.enabled ? "✓ Activado" : "Opcional"}
                        </span>
                    </button>

                    {refund.enabled && (
                        <div className="mt-2 p-4 bg-surface-2 dark:bg-surface-dark-3 rounded-xl border border-border/40 dark:border-white/5 space-y-4">

                            {/* Journal pills */}
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
                                                    "px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide border-2 transition-all",
                                                    active && !j.color
                                                        ? "border-brand-500 bg-brand-500 text-black"
                                                        : !active
                                                        ? "border-border/40 dark:border-white/10 text-content-subtle dark:text-white/40 hover:border-brand-400 dark:hover:border-brand-400/50"
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

                            {/* Amount + Date */}
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

                            {/* Reference if not cash */}
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

                            {/* Notes */}
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
                </div>

                <div className="p-4 bg-brand-500/10 border border-brand-500/20 rounded-2xl flex items-center justify-between mt-2">
                    <span className="text-[11px] font-black uppercase tracking-wide text-brand-400 opacity-80">Total a Reintegrar</span>
                    <div className="text-2xl font-black text-brand-400 tracking-tight">
                        {fmtPrice(totalReturn)}
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} disabled={loading} className="btn-sm btn-secondary font-black uppercase tracking-wide">
                        Cerrar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || totalReturn === 0}
                        className={[
                            "btn-md font-black uppercase tracking-wide transition-all duration-300 shadow-lg border-transparent",
                            (loading || totalReturn === 0)
                                ? "bg-surface-3 dark:bg-surface-dark-3 text-content-muted cursor-not-allowed shadow-none"
                                : "bg-warning text-black hover:bg-amber-400 hover:scale-[1.02] shadow-warning/20 cursor-pointer"
                        ].join(" ")}
                    >
                        {loading ? "Procesando..." : "Confirmar Devolución"}
                    </button>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={confirmShow}
                title="¿Confirmar devolución?"
                message={`Estás a punto de procesar una devolución por ${fmtPrice(totalReturn)}.${refund.enabled ? ` Se registrará un reembolso de ${refund.amount ? '$' + refund.amount : ''} vía ${refundJournal?.name || '...'}.` : ''} El stock será reintegrado automáticamente.`}
                onConfirm={executeSubmit}
                onCancel={() => setConfirmShow(false)}
                confirmText="Sí, procesar devolución"
                type="warning"
            />
        </>
    );
}
