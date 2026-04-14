import { useEffect, useState } from "react";
import { api } from "../../services/api";
import PaymentFormModal from "../PaymentFormModal";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import ConfirmModal from "../ui/ConfirmModal";
import Page from "../ui/Page";
import { exportToCSV } from "../../utils/exportUtils";

const LIMIT = 50;

export default function PagosTab({
    notify, can, baseCurrency, fmtPrice, fmtPayment, setReceiptSale
}) {
    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    // Filtros
    const [viewType, setViewType] = useState("historial");
    const [searchTerm, setSearchTerm] = useState("");
    const [payDateFrom, setPayDateFrom] = useState("");
    const [payDateTo, setPayDateTo] = useState("");
    const [showFilterDrop, setShowFilterDrop] = useState(false);

    // Query params como objeto único — cambiarlo siempre recarga desde página 1
    const [query, setQuery] = useState({ viewType: "historial", search: "", dateFrom: "", dateTo: "", page: 1, refresh: 0 });

    const [payDetail, setPayDetail] = useState(null);
    const [payModal, setPayModal] = useState(null);
    const [deleteDialog, setDeleteDialog] = useState(null);

    // Debounce search → actualiza query reseteando página
    useEffect(() => {
        const timer = setTimeout(() => {
            setQuery(q => ({ ...q, search: searchTerm, page: 1 }));
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Filtros cambian → resetear página
    useEffect(() => {
        setQuery(q => ({ ...q, viewType, dateFrom: payDateFrom, dateTo: payDateTo, page: 1 }));
    }, [viewType, payDateFrom, payDateTo]); // eslint-disable-line

    // Único efecto de carga — depende solo del objeto query
    useEffect(() => {
        let cancelled = false;
        async function fetch() {
            setLoading(true);
            try {
                const params = { limit: LIMIT, offset: (query.page - 1) * LIMIT };
                if (query.search)  params.search   = query.search;
                if (query.dateFrom) params.date_from = query.dateFrom;
                if (query.dateTo)   params.date_to   = query.dateTo;
                const res = query.viewType === "pendientes"
                    ? await api.payments.getPending(params)
                    : await api.payments.getAll(params);
                if (!cancelled) { setData(res.data || []); setTotal(res.total || 0); }
            } catch (e) {
                if (!cancelled) notify(e.message, "err");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        fetch();
        return () => { cancelled = true; };
    }, [query]); // eslint-disable-line

    const page = query.page;
    const setPage = (p) => setQuery(q => ({ ...q, page: typeof p === "function" ? p(q.page) : p }));
    function loadData() { setQuery(q => ({ ...q, refresh: q.refresh + 1 })); }

    const confirmRemovePayment = async () => {
        if (!deleteDialog) return;
        try {
            await api.payments.remove(deleteDialog);
            notify("Pago eliminado");
            loadData();
            setDeleteDialog(null);
        } catch (e) { notify(e.message, "err"); }
    };

    const handleExportCSV = () => {
        const headers = ["Referencia", "Estado", "Cliente", "Fecha", "Monto"];
        const rows = data.map(item => {
            const isInvoice = viewType === "pendientes";
            return [
                item.invoice_number || (isInvoice ? `Factura #${item.id}` : `Cobro #${item.id}`),
                isInvoice ? (item.status === "parcial" ? "Parcial" : "Pendiente") : "Cobro Realizado",
                item.customer_name || "Consumidor Final",
                new Date(item.created_at).toLocaleDateString(),
                isInvoice ? item.total : item.amount,
            ];
        });
        exportToCSV("Cobros_Pagos", rows, headers);
    };

    const hasFilters = payDateFrom || payDateTo || viewType !== "historial";
    const totalPages = Math.ceil(total / LIMIT);
    const startItem = (page - 1) * LIMIT + 1;
    const endItem = Math.min(page * LIMIT, total);

    const subheader = (
        <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
            {/* Buscador */}
            <div className="relative flex-1 min-w-[200px]">
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

            {/* Filtros dropdown */}
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
                    {hasFilters && <span className="bg-brand-500 text-black w-4 h-4 rounded flex items-center justify-center text-[9px]">1</span>}
                </button>
                {showFilterDrop && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                        <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[70] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Vista</div>
                                <div className="flex bg-surface-2 dark:bg-white/5 p-0.5 rounded-lg border border-border/20 dark:border-white/5">
                                    <button onClick={() => setViewType("historial")}
                                        className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wide rounded-md transition-all ${viewType === "historial" ? "bg-brand-500 text-black shadow" : "text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                        Historial
                                    </button>
                                    <button onClick={() => setViewType("pendientes")}
                                        className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wide rounded-md transition-all ${viewType === "pendientes" ? "bg-brand-500 text-black shadow" : "text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                        Por Cobrar
                                    </button>
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
                                <button
                                    onClick={() => { setViewType("historial"); setPayDateFrom(""); setPayDateTo(""); setShowFilterDrop(false); }}
                                    className="w-full py-1.5 text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 rounded-lg transition-colors"
                                >
                                    Limpiar todo
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="ml-auto flex items-center gap-2">
                <Button className="h-8 px-3 text-[10px] bg-surface-2 dark:bg-white/5 text-content-subtle border border-border/30 dark:border-white/10 hover:text-content shadow-none" onClick={handleExportCSV}>
                    CSV
                </Button>
                <Button className="h-8 px-3 text-[10px] bg-brand-500/10 text-brand-500 border border-brand-500/20 hover:bg-brand-500 hover:text-black shadow-none" onClick={() => window.print()}>
                    Imprimir
                </Button>
            </div>
        </div>
    );

    return (
        <Page module="MÓDULO" title="Cobros y Pagos" subheader={subheader}>
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="card-premium overflow-auto flex-1 border-none shadow-none rounded-none bg-transparent">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2">
                            <tr>
                                {["Referencia", "Estado / Tipo", "Cliente", "Fecha", "Monto", "Acciones"].map(h => (
                                    <th key={h} className={`px-4 py-4 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 border-b border-border/40 dark:border-white/5 ${h === "Acciones" || h === "Monto" ? "text-right" : ""}`}>
                                        {h}
                                    </th>
                                ))}
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
                                        <td className="px-4 py-3">
                                            <span className="text-[11px] font-black text-brand-500 tracking-tight">
                                                {item.invoice_number || (isInvoice ? `Factura #${item.id}` : `Cobro #${item.id}`)}
                                            </span>
                                            {!isInvoice && item.reference_number && (
                                                <div className="text-[9px] font-black text-content-subtle opacity-40 uppercase tracking-tighter mt-0.5">Ref: {item.reference_number}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${
                                                isInvoice
                                                    ? item.status === "parcial" ? "text-warning border-warning/30 bg-warning/5" : "text-danger border-danger/30 bg-danger/5"
                                                    : "text-info border-info/30 bg-info/5"
                                            }`}>
                                                {isInvoice ? (item.status === "parcial" ? "Parcial" : "Pendiente") : "Cobro Realizado"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 truncate max-w-[200px]">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight truncate">{item.customer_name || "Consumidor Final"}</span>
                                                {item.journal_name && (
                                                    <span className="text-[9px] font-black opacity-30 mt-0.5 uppercase">{item.journal_name}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-[11px] font-bold text-content-subtle uppercase">{new Date(item.created_at).toLocaleDateString()}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`text-[11px] font-black tabular-nums ${isInvoice ? "text-brand-500" : "text-success"}`}>
                                                {isInvoice ? fmtPrice(item.total) : fmtPayment(item)}
                                            </span>
                                            {isInvoice && item.status === "parcial" && (
                                                <div className="text-[10px] font-bold text-danger tabular-nums">Debe: {fmtPrice(item.balance)}</div>
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
                                                        <button onClick={() => setPayModal(item)}
                                                            className="h-7 px-3 rounded-lg bg-success text-black text-[10px] font-black uppercase tracking-wide transition-all active:scale-90 flex items-center gap-1 shadow-lg shadow-success/20">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                                                            Cobrar
                                                        </button>
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

                {/* Paginación */}
                {totalPages > 1 && (
                    <div className="shrink-0 px-4 py-2 border-t border-border/20 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.01]">
                        <div className="text-[10px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest">
                            Mostrando <span className="text-content dark:text-white">{startItem}-{endItem}</span> de <span className="text-content dark:text-white">{total}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button disabled={page === 1} onClick={() => setPage(1)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit">
                                «
                            </button>
                            <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit">
                                Anterior
                            </button>
                            <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">
                                Pág {page}/{totalPages}
                            </div>
                            <button disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit">
                                Siguiente
                            </button>
                            <button disabled={page === totalPages} onClick={() => setPage(totalPages)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit">
                                »
                            </button>
                        </div>
                    </div>
                )}
            </div>

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
        </Page>
    );
}
