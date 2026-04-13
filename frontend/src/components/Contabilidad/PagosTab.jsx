import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import PaymentFormModal from "../PaymentFormModal";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import { fmtDate } from "../../helpers";
import ConfirmModal from "../ui/ConfirmModal";

const LIMIT = 50;

export default function PagosTab({
    notify, can, baseCurrency, fmtPrice, fmtPayment, setReceiptSale
}) {
    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    
    // Filtros
    const [viewType, setViewType] = useState("historial"); // "pendientes" o "historial"
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [payDateFrom, setPayDateFrom] = useState("");
    const [payDateTo, setPayDateTo] = useState("");
    const [showFilterDrop, setShowFilterDrop] = useState(false);

    const [payDetail, setPayDetail] = useState(null);
    const [payModal, setPayModal] = useState(null);
    const [deleteDialog, setDeleteDialog] = useState(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => { setPage(1); }, [viewType, debouncedSearch, payDateFrom, payDateTo]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                limit: LIMIT,
                offset: (page - 1) * LIMIT,
                search: debouncedSearch
            };
            if (payDateFrom) params.date_from = payDateFrom;
            if (payDateTo) params.date_to = payDateTo;

            let res;
            if (viewType === "pendientes") {
                res = await api.payments.getPending(params);
            } else {
                res = await api.payments.getAll(params);
            }
            setData(res.data || []);
            setTotal(res.total || 0);
        } catch (e) { 
            notify(e.message, "err"); 
        } finally { 
            setLoading(false); 
        }
    }, [viewType, page, debouncedSearch, payDateFrom, payDateTo, notify]);

    useEffect(() => { loadData(); }, [loadData]);

    const confirmRemovePayment = async () => {
        if (!deleteDialog) return;
        try {
            await api.payments.remove(deleteDialog);
            notify("Pago eliminado");
            loadData();
            setDeleteDialog(null);
        } catch (e) { notify(e.message, "err"); }
    };

    const totalPages = Math.ceil(total / LIMIT);
    const startItem = (page - 1) * LIMIT + 1;
    const endItem = Math.min(page * LIMIT, total);

    return (
        <div className="h-full flex flex-col overflow-hidden bg-transparent">
            {/* Toolbar Personalizada */}
            <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
                <div className="flex items-center gap-6">
                    <div>
                        <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-1">Módulo</div>
                        <h1 className="text-sm font-black uppercase tracking-tight">Cobros y Pagos</h1>
                    </div>
                    
                    {/* Selector de Vista */}
                    <div className="flex bg-surface-2 dark:bg-white/5 p-1 rounded-lg border border-border/20 dark:border-white/5">
                        <button 
                            onClick={() => setViewType("historial")}
                            className={`px-3 py-1 text-[10px] font-black uppercase tracking-wide rounded-md transition-all ${viewType === "historial" ? "bg-brand-500 text-black shadow-lg" : "text-content-subtle hover:text-content"}`}
                        >
                            Historial
                        </button>
                        <button 
                            onClick={() => setViewType("pendientes")}
                            className={`px-3 py-1 text-[10px] font-black uppercase tracking-wide rounded-md transition-all ${viewType === "pendientes" ? "bg-brand-500 text-black shadow-lg" : "text-content-subtle hover:text-content"}`}
                        >
                            Por Cobrar
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Buscador */}
                    <div className="relative w-64">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Buscar cliente o factura..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="input h-8 pl-8 text-[11px] w-full"
                        />
                    </div>
                    
                    <button
                        onClick={() => setShowFilterDrop(!showFilterDrop)}
                        className={`h-8 px-3 rounded-lg border border-border/30 text-[10px] font-black uppercase flex items-center gap-2 transition-all ${payDateFrom || payDateTo ? "bg-brand-500/10 text-brand-500 border-brand-500/30" : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content"}`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Fechas
                    </button>
                    
                    {showFilterDrop && (
                        <>
                            <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                            <div className="absolute top-16 right-4 w-64 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-xl shadow-2xl z-[70] p-4 animate-in fade-in slide-in-from-top-2">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-3">Rango de Fecha</div>
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase opacity-50 ml-1">Desde</label>
                                        <input type="date" value={payDateFrom} onChange={e => setPayDateFrom(e.target.value)} className="input h-8 text-[11px] w-full" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase opacity-50 ml-1">Hasta</label>
                                        <input type="date" value={payDateTo} onChange={e => setPayDateTo(e.target.value)} className="input h-8 text-[11px] w-full" />
                                    </div>
                                    <button 
                                        onClick={() => { setPayDateFrom(""); setPayDateTo(""); setShowFilterDrop(false); }}
                                        className="w-full py-2 text-[10px] font-black uppercase text-danger hover:bg-danger/5 rounded-lg border border-transparent hover:border-danger/10 transition-all"
                                    >
                                        Limpiar Fechas
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Tabla con Paginación */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="card-premium overflow-auto flex-1 border-none shadow-none rounded-none bg-transparent">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2">
                            <tr className="border-b border-border/40 dark:border-white/5">
                                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wide text-content-subtle">Referencia</th>
                                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wide text-content-subtle">Estado / Tipo</th>
                                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wide text-content-subtle">Cliente</th>
                                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wide text-content-subtle">Fecha</th>
                                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wide text-content-subtle text-right">Monto</th>
                                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wide text-content-subtle text-right w-28">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10 dark:divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center text-brand-500 animate-pulse text-xs font-black uppercase tracking-widest">
                                        Sincronizando movimientos...
                                    </td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center text-content-subtle text-xs font-black uppercase tracking-wide italic opacity-40">
                                        Sin movimientos en esta vista
                                    </td>
                                </tr>
                            ) : data.map(item => {
                                const isInvoice = viewType === "pendientes";
                                return (
                                    <tr key={`${viewType}-${item.id}`} className="group hover:bg-brand-500/[0.02] transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="text-[11px] font-black text-brand-500 tracking-tight">
                                                {item.invoice_number || (isInvoice ? `Factura #${item.id}` : `Cobro #${item.id}`)}
                                            </span>
                                            {!isInvoice && item.reference_number && (
                                                <div className="text-[9px] font-black text-content-subtle opacity-40 uppercase tracking-tighter mt-0.5">Ref: {item.reference_number}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md border ${
                                                isInvoice 
                                                    ? item.status === 'parcial' ? "text-warning border-warning/30 bg-warning/5" : "text-danger border-danger/30 bg-danger/5"
                                                    : "text-info border-info/30 bg-info/5"
                                            }`}>
                                                {isInvoice ? (item.status === 'parcial' ? "Parcial" : "Pendiente") : "Cobro Realizado"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight truncate max-w-[200px]">{item.customer_name || "Consumidor Final"}</span>
                                                {item.journal_name && (
                                                    <span className="text-[9px] font-black opacity-30 mt-0.5 uppercase tracking-tighter">{item.journal_name}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[11px] font-bold text-content-subtle uppercase tabular-nums">{new Date(item.created_at).toLocaleDateString()}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className={`text-[11px] font-black tabular-nums ${isInvoice ? "text-brand-500" : "text-success"}`}>
                                                {isInvoice ? fmtPrice(item.total) : fmtPayment(item)}
                                            </div>
                                            {isInvoice && item.status === 'parcial' && (
                                                <div className="text-[10px] font-bold text-danger tabular-nums">Debe: {fmtPrice(item.balance)}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {isInvoice ? (
                                                    <>
                                                        <button onClick={() => setReceiptSale(item)}
                                                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-surface-2 dark:bg-white/5 border border-border/30 text-content-subtle hover:text-brand-500 hover:border-brand-500/30 transition-all"
                                                            title="Ver Factura">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                        </button>
                                                        <button onClick={() => setPayModal(item)}
                                                            className="h-8 px-4 rounded-lg bg-success text-black text-[10px] font-black uppercase tracking-wide transition-all active:scale-90 flex items-center gap-1.5 shadow-lg shadow-success/20">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                                                            Cobrar
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => setPayDetail(item)}
                                                            className="h-8 px-3 rounded-lg bg-brand-500 text-black text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 shadow-lg shadow-brand-500/20">
                                                            Detalle
                                                        </button>
                                                        {can("admin") && (
                                                            <button onClick={() => setDeleteDialog(item.id)}
                                                                className="w-8 h-8 rounded-lg flex items-center justify-center bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-black transition-all"
                                                                title="Eliminar">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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

                {/* Footer de Paginación */}
                {totalPages > 1 && (
                    <div className="shrink-0 px-4 py-2 border-t border-border/20 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.01]">
                        <div className="text-[10px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest">
                            Mostrando <span className="text-content dark:text-white">{startItem}-{endItem}</span> de <span className="text-content dark:text-white">{total}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button 
                                disabled={page === 1}
                                onClick={() => setPage(1)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black hover:bg-brand-500 hover:text-black disabled:opacity-30 transition-all font-mono"
                            >
                                «
                            </button>
                            <button 
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black disabled:opacity-30 transition-all"
                            >
                                Anterior
                            </button>
                            <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">
                                Pág {page}/{totalPages}
                            </div>
                            <button 
                                disabled={page === totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black disabled:opacity-30 transition-all"
                            >
                                Siguiente
                            </button>
                            <button 
                                disabled={page === totalPages}
                                onClick={() => setPage(totalPages)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 text-[10px] font-black hover:bg-brand-500 hover:text-black disabled:opacity-30 transition-all font-mono"
                            >
                                »
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modales Existentes */}
            {payModal && (
                <PaymentFormModal
                    sale={payModal}
                    onClose={() => setPayModal(null)}
                    onSuccess={() => { setPayModal(null); loadData(); }}
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
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl bg-surface-2 dark:bg-white/5 border border-border/20">
                                <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-1">Monto Cobrado</div>
                                <div className="text-3xl font-black tabular-nums">{fmtP(p.amount)}</div>
                            </div>

                            <div className="space-y-1">
                                {[
                                    ["Documento", p.invoice_number || `#${p.sale_id}`, "text-brand-500 font-black"],
                                    p.customer_name && ["Cliente", p.customer_name, "uppercase"],
                                    p.journal_name  && ["Caja / Banco", p.journal_name, "uppercase"],
                                    p.reference_number && ["Referencia", p.reference_number],
                                    p.notes && ["Notas", p.notes],
                                ].filter(Boolean).map(([label, value, extra]) => (
                                    <div key={label} className="flex justify-between py-2 border-b border-border/10 dark:border-white/5 last:border-0">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle opacity-50">{label}</span>
                                        <span className={`text-[11px] font-bold ${extra || "text-content dark:text-white"}`}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end pt-6">
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
        </div>
    );
}
