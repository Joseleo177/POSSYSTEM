import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import PaymentFormModal from "../PaymentFormModal";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import { fmtDate } from "../../helpers";
import Page from "../ui/Page";
import ConfirmModal from "../ui/ConfirmModal";

export default function PagosTab({
    notify, can, baseCurrency, fmtPrice, fmtPayment, setReceiptSale
}) {
    const [pendingSales, setPendingSales] = useState([]);
    const [payments, setPayments] = useState([]);
    const [payDateFrom, setPayDateFrom] = useState("");
    const [payDateTo, setPayDateTo] = useState("");
    const [payDetail, setPayDetail] = useState(null);
    const [payModal, setPayModal] = useState(null);
    const [deleteDialog, setDeleteDialog] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeFilters, setActiveFilters] = useState([]);
    const [showFilterDrop, setShowFilterDrop] = useState(false);

    const loadPayments = useCallback(async () => {
        try {
            const params = {};
            if (payDateFrom) params.date_from = payDateFrom;
            if (payDateTo) params.date_to = payDateTo;
            const [pendR, histR] = await Promise.all([
                api.payments.getPending(),
                api.payments.getAll(params),
            ]);
            setPendingSales(pendR.data);
            setPayments(histR.data);
        } catch (e) { notify(e.message, "err"); }
    }, [payDateFrom, payDateTo, notify]);

    useEffect(() => { loadPayments(); }, [loadPayments]);

    const toggleFilter = (f) => setActiveFilters(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);

    const allMovements = [
        ...pendingSales.map(s => ({ ...s, _type: 'invoice' })),
        ...payments.map(p => ({ ...p, _type: 'payment' }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const filteredMovements = allMovements.filter(item => {
        const search = searchTerm.toLowerCase();
        const target = item._type === 'invoice'
            ? (item.customer_name || "") + " " + (item.invoice_number || "") + " " + (item.customer_rif || "")
            : (item.customer_name || "") + " " + (item.invoice_number || "") + " " + (item.reference_number || "");
        if (searchTerm && !target.toLowerCase().includes(search)) return false;
        if (activeFilters.length > 0) {
            if (activeFilters.includes('pendientes') && item.status === 'pendiente') return true;
            if (activeFilters.includes('parciales') && item.status === 'parcial') return true;
            if (activeFilters.includes('cobros') && item._type === 'payment') return true;
            return false;
        }
        return true;
    });

    const confirmRemovePayment = async () => {
        if (!deleteDialog) return;
        try {
            await api.payments.remove(deleteDialog);
            notify("Pago eliminado");
            loadPayments();
            setDeleteDialog(null);
        } catch (e) { notify(e.message, "err"); }
    };

    const hasFilters = activeFilters.length > 0 || payDateFrom || payDateTo;

    const subheader = (
        <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    placeholder="Buscar por cliente, RIF o factura..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="input h-8 pl-8 text-[11px] w-full"
                />
            </div>

            <div className="relative">
                <button
                    onClick={() => setShowFilterDrop(p => !p)}
                    className={[
                        "h-8 px-3 rounded-lg text-[11px] font-black uppercase tracking-wide border flex items-center gap-2 transition-all",
                        hasFilters
                            ? "bg-brand-500/10 text-brand-500 border-brand-500/30"
                            : "bg-surface-2 dark:bg-white/5 border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"
                    ].join(" ")}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    Filtros
                    {hasFilters && <span className="bg-brand-500 text-black w-4 h-4 rounded flex items-center justify-center text-[9px]">{activeFilters.length + (payDateFrom || payDateTo ? 1 : 0)}</span>}
                </button>
                {showFilterDrop && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                        <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[70] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Tipo</div>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {[
                                        { id: 'pendientes', label: 'Pendiente' },
                                        { id: 'parciales',  label: 'Parcial' },
                                        { id: 'cobros',     label: 'Cobros' },
                                    ].map(f => (
                                        <button key={f.id} onClick={() => toggleFilter(f.id)}
                                            className={`px-2 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all ${activeFilters.includes(f.id) ? "bg-brand-500 text-black border-brand-500" : "border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Rango de Fecha</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="date" value={payDateFrom} onChange={e => setPayDateFrom(e.target.value)} className="input h-7 text-[11px]" />
                                    <input type="date" value={payDateTo} onChange={e => setPayDateTo(e.target.value)} className="input h-7 text-[11px]" />
                                </div>
                            </div>
                            <div className="px-4 py-2">
                                <button onClick={() => { setActiveFilters([]); setPayDateFrom(""); setPayDateTo(""); setShowFilterDrop(false); }}
                                    className="w-full py-1.5 text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 rounded-lg transition-colors">
                                    Limpiar todo
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <Page module="MÓDULO CONTABLE" title="Cobros y Pagos" subheader={subheader}>
            <div className="card-premium overflow-auto flex-1">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-surface-2 dark:bg-surface-dark-2">
                            {["Referencia", "Tipo", "Cliente", "Fecha", "Monto", "Acciones"].map(h => (
                                <th key={h} className={`px-4 py-3 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 border-b border-border/40 dark:border-white/5 ${h === "Acciones" ? "text-right" : h === "Monto" ? "text-right" : ""}`}>
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/10 dark:divide-white/5">
                        {filteredMovements.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-20 text-center text-content-subtle text-xs font-black uppercase tracking-wide italic opacity-40">
                                    Sin movimientos registrados
                                </td>
                            </tr>
                        ) : filteredMovements.map(item => {
                            const isInvoice = item._type === 'invoice';
                            const isPartial = item.status === 'parcial';
                            const isPaid = item.status === 'pagado' || !isInvoice;
                            return (
                                <tr key={`${item._type}-${item.id}`} className="group hover:bg-brand-500/[0.02] transition-colors">
                                    <td className="px-4 py-3">
                                        <span className="text-[11px] font-black text-brand-500 tracking-tight">
                                            {item.invoice_number || (isInvoice ? `Factura #${item.id}` : `Cobro #${item.id}`)}
                                        </span>
                                        {!isInvoice && item.reference_number && (
                                            <div className="text-[10px] font-bold text-content-subtle opacity-60">Ref: {item.reference_number}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={[
                                            "text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border",
                                            isInvoice
                                                ? isPaid ? "text-success border-success/30 bg-success/5"
                                                    : isPartial ? "text-warning border-warning/30 bg-warning/5"
                                                    : "text-danger border-danger/30 bg-danger/5"
                                                : "text-info border-info/30 bg-info/5"
                                        ].join(" ")}>
                                            {isInvoice ? (isPaid ? "Pagado" : isPartial ? "Parcial" : "Pendiente") : "Cobro"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight">{item.customer_name || "Consumidor Final"}</span>
                                            {item.journal_name && (
                                                <span className="text-[10px] font-bold text-content-subtle opacity-60 mt-0.5">{item.journal_name}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-[11px] font-bold text-content-subtle">{new Date(item.created_at).toLocaleDateString()}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className={`text-[11px] font-black tabular-nums ${isPaid ? "text-success" : "text-brand-500"}`}>
                                            {isInvoice ? fmtPrice(item.total) : fmtPayment(item)}
                                        </span>
                                        {isInvoice && isPartial && (
                                            <div className="text-[10px] font-bold text-danger tabular-nums">Saldo: {fmtPrice(item.balance)}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {isInvoice ? (
                                                <>
                                                    <button onClick={() => setReceiptSale(item)}
                                                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-2 dark:bg-white/5 border border-border/30 dark:border-white/10 text-content-subtle hover:text-brand-500 hover:border-brand-500/30 transition-all"
                                                        title="Ver Factura">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                    </button>
                                                    {!isPaid && (
                                                        <button onClick={() => setPayModal(item)}
                                                            className="h-7 px-3 rounded-lg bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black text-[10px] font-black uppercase tracking-wide transition-all">
                                                            Cobrar
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => setPayDetail(item)}
                                                        className="h-7 px-3 rounded-lg bg-brand-500/10 text-brand-500 border border-brand-500/20 hover:bg-brand-500 hover:text-black text-[10px] font-black uppercase tracking-wide transition-all">
                                                        Detalle
                                                    </button>
                                                    {can("admin") && (
                                                        <button onClick={() => setDeleteDialog(item.id)}
                                                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all"
                                                            title="Eliminar">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {payModal && (
                <PaymentFormModal
                    sale={payModal}
                    onClose={() => setPayModal(null)}
                    onSuccess={() => { setPayModal(null); loadPayments(); }}
                />
            )}

            {payDetail && (() => {
                const p = payDetail;
                const isBase = !p.currency_code || p.currency_code === baseCurrency?.code;
                const rate = parseFloat(p.exchange_rate) || 1;
                const sym = p.currency_symbol || baseCurrency?.symbol || "$";
                const fmtP = n => `${sym}${(Number(n || 0) * (isBase ? 1 : rate)).toFixed(2)}`;
                const fmtB = n => `${baseCurrency?.symbol || "$"}${Number(n || 0).toFixed(2)}`;
                return (
                    <Modal open={!!payDetail} onClose={() => setPayDetail(null)} title="Detalle del Cobro" width={400}>
                        <div className="space-y-2">
                            {[
                                ["Documento", p.invoice_number || `#${p.sale_id}`, "text-brand-500"],
                                p.customer_name && ["Cliente", p.customer_name],
                                p.journal_name  && ["Caja / Banco", p.journal_name],
                            ].filter(Boolean).map(([label, value, color]) => (
                                <div key={label} className="flex justify-between py-1 border-b border-border/10 dark:border-white/5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">{label}</span>
                                    <span className={`text-[11px] font-black ${color || "text-content dark:text-white"}`}>{value}</span>
                                </div>
                            ))}
                            <div className="flex justify-between py-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Monto Cobrado</span>
                                <span className="text-sm font-black text-success">{fmtP(p.amount)}</span>
                            </div>
                            {!isBase && (
                                <>
                                    <div className="flex justify-between py-1 border-b border-border/10 dark:border-white/5">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Equivalente base</span>
                                        <span className="text-[11px] font-bold text-content-subtle">{fmtB(p.amount)}</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-border/10 dark:border-white/5">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Tasa aplicada</span>
                                        <span className="text-[11px] font-bold text-content-subtle">{rate.toFixed(4)}</span>
                                    </div>
                                </>
                            )}
                            {parseFloat(p.change_given) > 0 && (
                                <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-warning">Cambio entregado</span>
                                    <span className="text-sm font-black text-warning tabular-nums">{fmtB(p.change_given)}</span>
                                </div>
                            )}
                            {[
                                p.reference_number && ["Referencia", p.reference_number],
                                p.reference_date  && ["Fecha Ref.", new Date(p.reference_date + "T00:00:00").toLocaleDateString()],
                                ["Registrado", fmtDate(p.created_at)],
                                p.notes && ["Notas", p.notes],
                            ].filter(Boolean).map(([label, value]) => (
                                <div key={label} className="flex justify-between py-1 border-b border-border/10 dark:border-white/5">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">{label}</span>
                                    <span className="text-[11px] font-bold text-content dark:text-white">{value}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end pt-4 border-t border-border/10 mt-4">
                            <Button variant="ghost" onClick={() => setPayDetail(null)}>Cerrar</Button>
                        </div>
                    </Modal>
                );
            })()}

            <ConfirmModal
                isOpen={!!deleteDialog}
                title="¿Eliminar cobro?"
                message="Esta acción revertirá el cobro. El saldo de la factura se actualizará automáticamente."
                onConfirm={confirmRemovePayment}
                onCancel={() => setDeleteDialog(null)}
                type="danger"
                confirmText="Sí, eliminar"
            />
        </Page>
    );
}
