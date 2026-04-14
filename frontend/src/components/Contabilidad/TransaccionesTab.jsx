import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import { exportToCSV } from "../../utils/exportUtils";
import ReturnModal from "../ReturnModal";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { fmtDateShort } from "../../helpers";
import Page from "../ui/Page";
import DateRangePicker from "../ui/DateRangePicker";

const STATUS_BADGE = {
    pagado:   "text-success border-success/30 bg-success/5",
    parcial:  "text-warning border-warning/30 bg-warning/5",
    anulado:  "text-content-subtle border-border/30 bg-surface-2 dark:bg-white/5",
    devuelto: "text-warning border-warning/30 bg-warning/5",
    pendiente:"text-danger border-danger/30 bg-danger/5",
};

const LIMIT = 50;

export default function TransaccionesTab({
    notify, can, allSeries, fmtPrice, setReceiptSale
}) {
    const [sales, setSales] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    const [histDateFrom, setHistDateFrom] = useState("");
    const [histDateTo, setHistDateTo] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [activeFilters, setActiveFilters] = useState([]);
    const [activeSeries, setActiveSeries] = useState([]);
    const [showFilterDrop, setShowFilterDrop] = useState(false);
    const [saleDetail, setSaleDetail] = useState(null);
    const [returnSale, setReturnSale] = useState(null);
    const [cancelConfirm, setCancelConfirm] = useState(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Resetear página al cambiar filtros
    useEffect(() => { setPage(1); }, [debouncedSearch, histDateFrom, histDateTo, activeFilters, activeSeries]);

    const loadSales = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                limit: LIMIT,
                offset: (page - 1) * LIMIT
            };
            if (histDateFrom) params.date_from = histDateFrom;
            if (histDateTo) params.date_to = histDateTo;
            if (debouncedSearch) params.search = debouncedSearch;
            if (activeFilters.length > 0) params.status = activeFilters[0]; // El backend solo toma 1 por ahora o podrías ajustarlo
            if (activeSeries.length > 0) params.serie_id = activeSeries[0];

            const r = await api.sales.getAll(params);
            setSales(r.data);
            setTotal(r.total || 0);
        } catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    }, [histDateFrom, histDateTo, debouncedSearch, activeFilters, activeSeries, page, notify]);

    useEffect(() => { loadSales(); }, [loadSales]);

    const toggleFilter = (id) => setActiveFilters(p => p.includes(id) ? [] : [id]); // Simplificado a 1 para match con backend
    const toggleSerie  = (id) => setActiveSeries(p => p.includes(id) ? [] : [id]);

    const cancelSale = async (id) => {
        try { await api.sales.cancel(id); notify("Venta anulada"); loadSales(); }
        catch (e) { notify(e.message, "err"); }
    };

    const handleExportCSV = () => {
        const headers = ['Factura', 'Fecha', 'Cliente', 'RIF', 'Estado', 'Serie', 'Total', 'Abonado', 'Pendiente'];
        const rows = sales.map(s => [
            s.invoice_number || s.id, fmtDateShort(s.created_at),
            s.customer_name || 'Sin Cliente', s.customer_rif || '',
            s.status, s.serie_name || '', s.total, s.amount_paid, s.balance
        ]);
        exportToCSV('Historial_Ventas', rows, headers);
    };

    const hasFilters = activeFilters.length > 0 || activeSeries.length > 0 || histDateFrom || histDateTo;
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
                    placeholder="Buscar por factura, cliente o RIF..."
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
                    {hasFilters && <span className="bg-brand-500 text-black w-4 h-4 rounded flex items-center justify-center text-[9px]">{activeFilters.length + activeSeries.length + (histDateFrom || histDateTo ? 1 : 0)}</span>}
                </button>
                {showFilterDrop && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                        <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[70] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Estado</div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[
                                        { id: 'pendiente', label: 'Pendiente' },
                                        { id: 'parcial',   label: 'Parcial' },
                                        { id: 'pagado',    label: 'Pagado' },
                                        { id: 'anulado',   label: 'Anulado' },
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
                                <DateRangePicker from={histDateFrom} to={histDateTo} setFrom={setHistDateFrom} setTo={setHistDateTo} />
                            </div>
                            <div className="px-4 py-2">
                                <button onClick={() => { setActiveFilters([]); setActiveSeries([]); setHistDateFrom(""); setHistDateTo(""); setSearchTerm(""); setShowFilterDrop(false); }}
                                    className="w-full py-1.5 text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 rounded-lg transition-colors">
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
        <Page module="MÓDULO CONTABLE" title="Historial de Transacciones" subheader={subheader}>
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="card-premium overflow-auto flex-1 border-none shadow-none rounded-none bg-transparent">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2">
                            <tr className="">
                                {["Factura", "Estado", "Cliente", "Fecha", "Total", "Acciones"].map(h => (
                                    <th key={h} className={`px-4 py-4 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 border-b border-border/40 dark:border-white/5 ${h === "Acciones" ? "text-right" : h === "Total" ? "text-right" : ""}`}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10 dark:divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center text-brand-500 animate-pulse text-xs font-black uppercase tracking-widest">
                                        Sincronizando transacciones...
                                    </td>
                                </tr>
                            ) : sales.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center text-content-subtle text-xs font-black uppercase tracking-wide italic opacity-40">
                                        Sin transacciones registradas
                                    </td>
                                </tr>
                            ) : sales.map(sale => (
                                <React.Fragment key={sale.id}>
                                    <tr className="group hover:bg-brand-500/[0.02] transition-colors">
                                        <td className="px-4 py-3">
                                            <span className="text-[11px] font-black text-brand-500 tracking-tight">{sale.invoice_number || `#${sale.id}`}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${STATUS_BADGE[sale.status] || STATUS_BADGE.pendiente}`}>
                                                {sale.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 truncate max-w-[200px]">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight truncate">{sale.customer_name || "Consumidor Final"}</span>
                                                {sale.journal_name && (
                                                    <span className="text-[9px] font-black opacity-30 mt-0.5 uppercase" style={{ color: sale.journal_color || undefined }}>{sale.journal_name}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-[11px] font-bold text-content-subtle uppercase">{fmtDateShort(sale.created_at)}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="text-[11px] font-black text-content dark:text-white tabular-nums">{fmtPrice(sale.total)}</span>
                                            {sale.status === 'parcial' && (
                                                <div className="text-[10px] font-bold text-danger tabular-nums">Saldo: {fmtPrice(sale.balance)}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => setSaleDetail(saleDetail?.id === sale.id ? null : sale)}
                                                    className={`h-7 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all ${saleDetail?.id === sale.id ? "bg-brand-500 text-black border-brand-500" : "bg-brand-500/10 text-brand-500 border-brand-500/20 hover:bg-brand-500 hover:text-black"}`}
                                                >
                                                    {saleDetail?.id === sale.id ? "Cerrar" : "Detalles"}
                                                </button>
                                                <button onClick={() => setReceiptSale(sale)}
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-surface-2 dark:bg-white/5 border border-border/30 dark:border-white/10 text-content-subtle hover:text-brand-500 hover:border-brand-500/30 transition-all"
                                                    title="Ver Recibo">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                </button>
                                                {can("admin") && sale.status !== 'anulado' && (
                                                    <button onClick={() => setCancelConfirm(sale)}
                                                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all"
                                                        title="Anular">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {saleDetail?.id === sale.id && (
                                        <tr key={`detail-${sale.id}`}>
                                            <td colSpan={6} className="px-4 pb-4 bg-surface-2/50 dark:bg-white/[0.02]">
                                                {/* Detalle compacto... */}
                                                <div className="rounded-lg border border-border/30 dark:border-white/5 overflow-hidden">
                                                    <table className="w-full text-left border-collapse">
                                                        <thead>
                                                            <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-border/20 dark:border-white/5 font-black uppercase text-[9px] text-content-subtle">
                                                                <th className="px-4 py-2">Producto</th>
                                                                <th className="px-4 py-2 text-center w-20">Cant.</th>
                                                                <th className="px-4 py-2 text-right w-32">P. Unit.</th>
                                                                <th className="px-4 py-2 text-right w-32">Subtotal</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-border/10 dark:divide-white/5">
                                                            {(sale.items || []).map((item, idx) => (
                                                                <tr key={idx} className="hover:bg-brand-500/[0.02]">
                                                                    <td className="px-4 py-2 text-[10px] font-bold text-content dark:text-content-dark uppercase truncate max-w-[200px]">{item.name}</td>
                                                                    <td className="px-4 py-2 text-center text-[10px] font-black text-content-subtle">{item.quantity}</td>
                                                                    <td className="px-4 py-2 text-right text-[10px] font-bold text-content-subtle tabular-nums">{fmtPrice(item.price)}</td>
                                                                    <td className="px-4 py-2 text-right text-[10px] font-black text-brand-500 tabular-nums">
                                                                        {fmtPrice(item.subtotal ?? (parseFloat(item.price || 0) * parseFloat(item.quantity || 0)))}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pie de Paginación Estándar */}
                {totalPages > 1 && (
                    <div className="shrink-0 px-4 py-2 border-t border-border/20 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.01]">
                        <div className="text-[10px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest">
                            Mostrando <span className="text-content dark:text-white">{startItem}-{endItem}</span> de <span className="text-content dark:text-white">{total}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button 
                                disabled={page === 1}
                                onClick={() => setPage(1)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                            >
                                «
                            </button>
                            <button 
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                            >
                                Anterior
                            </button>
                            <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">
                                Pág {page}/{totalPages}
                            </div>
                            <button 
                                disabled={page === totalPages}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                            >
                                Siguiente
                            </button>
                            <button 
                                disabled={page === totalPages}
                                onClick={() => setPage(totalPages)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                            >
                                »
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {returnSale && (
                <ReturnModal
                    open={!!returnSale}
                    onClose={() => setReturnSale(null)}
                    sale={returnSale}
                    onReturnSuccess={loadSales}
                    notify={notify}
                />
            )}

            <ConfirmModal
                isOpen={!!cancelConfirm}
                title="¿Anular transacción?"
                message={`¿Estás seguro de que deseas anular la factura ${cancelConfirm?.invoice_number || '#' + cancelConfirm?.id}? Se restaurará el stock original de los productos.`}
                onConfirm={async () => { await cancelSale(cancelConfirm.id); setCancelConfirm(null); }}
                onCancel={() => setCancelConfirm(null)}
                type="danger"
                confirmText="Sí, anular venta"
            />
        </Page>
    );
}
