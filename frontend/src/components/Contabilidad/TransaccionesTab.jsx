import React from "react";
import { useTransacciones } from "../../hooks/contabilidad/useTransacciones";
import ReturnModal from "../ReturnModal";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { fmtDateShort } from "../../helpers";
import DateRangePicker from "../ui/DateRangePicker";
import Pagination from "../ui/Pagination";

const STATUS_BADGE = {
    pagado:   "badge-success",
    parcial:  "badge-warning",
    anulado:  "badge-neutral",
    devuelto: "badge-warning",
    pendiente:"badge-danger",
};

export default function TransaccionesTab({ notify, can, allSeries, fmtPrice, setReceiptSale }) {
    const {
        sales, total, page, setPage, loading, LIMIT,
        histDateFrom, setHistDateFrom, histDateTo, setHistDateTo,
        searchTerm, setSearchTerm,
        activeFilters, activeSeries,
        showFilterDrop, setShowFilterDrop,
        saleDetail, setSaleDetail,
        returnSale, setReturnSale,
        cancelConfirm, setCancelConfirm,
        toggleFilter, clearFilters,
        cancelSale, loadSales, handleExportCSV,
        hasFilters, totalPages,
    } = useTransacciones({ notify });

    const subheader = (
        <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" placeholder="Buscar por factura, cliente o RIF..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input h-8 pl-8 text-[11px] w-full" />
            </div>

            <div className="relative">
                <button
                    onClick={() => setShowFilterDrop(p => !p)}
                    className={["h-8 px-3 rounded-lg text-[11px] font-black uppercase tracking-wide border flex items-center gap-2 transition-all",
                        hasFilters ? "bg-brand-500/10 text-brand-500 border-brand-500/30" : "bg-surface-2 dark:bg-white/5 border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"
                    ].join(" ")}
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    Filtros
                    {hasFilters && (
                        <span className="bg-brand-500 text-black w-4 h-4 rounded flex items-center justify-center text-[9px]">
                            {activeFilters.length + activeSeries.length + (histDateFrom || histDateTo ? 1 : 0)}
                        </span>
                    )}
                </button>
                {showFilterDrop && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                        <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[70] animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Estado</div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[{ id: 'pendiente', label: 'Pendiente' }, { id: 'parcial', label: 'Parcial' }, { id: 'pagado', label: 'Pagado' }, { id: 'anulado', label: 'Anulado' }].map(f => (
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
                                <button onClick={clearFilters} className="w-full py-1.5 text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 rounded-lg transition-colors">
                                    Limpiar todo
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="ml-auto flex items-center gap-2">
                <Button className="h-8 px-3 text-[10px] bg-surface-2 dark:bg-white/5 text-content-subtle border border-border/30 dark:border-white/10 hover:text-content shadow-none" onClick={handleExportCSV}>CSV</Button>
                <Button className="h-8 px-3 text-[10px] bg-brand-500/10 text-brand-500 border border-brand-500/20 hover:bg-brand-500 hover:text-black shadow-none" onClick={() => window.print()}>Imprimir</Button>
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {subheader}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="card-premium overflow-auto flex-1 border-none shadow-none rounded-none bg-transparent">
                    <table className="table-pos">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                {["Factura", "Estado", "Cliente", "Fecha", "Total", "Acciones"].map(h => (
                                    <th key={h} className={h === "Acciones" || h === "Total" ? "text-right pr-6" : "text-left"}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="py-20 text-center text-brand-500 animate-pulse text-xs font-black uppercase tracking-widest">Sincronizando transacciones...</td></tr>
                            ) : sales.length === 0 ? (
                                <tr><td colSpan={6} className="py-20 text-center text-content-subtle text-xs font-black uppercase tracking-wide italic opacity-40">Sin transacciones registradas</td></tr>
                            ) : sales.map(sale => (
                                <React.Fragment key={sale.id}>
                                    <tr className="group">
                                        <td>
                                            <span className="text-[11px] font-black text-brand-500 tracking-tight">{sale.invoice_number || `#${sale.id}`}</span>
                                        </td>
                                        <td>
                                            <span className={`badge shadow-none ${STATUS_BADGE[sale.status] || 'badge-danger'}`}>
                                                {sale.status}
                                            </span>
                                        </td>
                                        <td className="truncate max-w-[200px]">
                                            <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight truncate block">{sale.customer_name || "Consumidor Final"}</span>
                                            {sale.journal_name && (
                                                <span className="text-[9px] font-black opacity-30 uppercase" style={{ color: sale.journal_color || undefined }}>{sale.journal_name}</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="text-[11px] font-bold text-content-subtle uppercase">{fmtDateShort(sale.created_at)}</span>
                                        </td>
                                        <td className="text-right pr-6">
                                            <span className="text-[11px] font-black text-content dark:text-white tabular-nums">{fmtPrice(sale.total)}</span>
                                            {sale.status === 'parcial' && (
                                                <div className="text-[10px] font-bold text-danger tabular-nums">Saldo: {fmtPrice(sale.balance)}</div>
                                            )}
                                        </td>
                                        <td className="text-right pr-6">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    onClick={() => setSaleDetail(saleDetail?.id === sale.id ? null : sale)}
                                                    className={`h-7 px-3 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all ${saleDetail?.id === sale.id ? "bg-brand-500 text-black border-brand-500" : "bg-brand-500/10 text-brand-500 border-brand-500/20 hover:bg-brand-500 hover:text-black"}`}
                                                >
                                                    {saleDetail?.id === sale.id ? "Cerrar" : "Detalles"}
                                                </button>
                                                <button onClick={() => setReceiptSale(sale)} className="p-2 rounded-xl transition-all text-content-subtle hover:text-brand-500 hover:bg-brand-500/10 active:scale-90" title="Ver Recibo">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                </button>
                                                {can("admin") && sale.status !== 'anulado' && (
                                                    <button onClick={() => setCancelConfirm(sale)} className="p-2 rounded-xl transition-all text-content-subtle hover:text-danger hover:bg-danger/10 active:scale-90" title="Anular">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {saleDetail?.id === sale.id && (
                                        <tr key={`detail-${sale.id}`}>
                                            <td colSpan={6} className="px-4 pb-4 bg-surface-2/50 dark:bg-white/[0.02]">
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

                <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
            </div>

            {returnSale && (
                <ReturnModal open={!!returnSale} onClose={() => setReturnSale(null)} sale={returnSale} onReturnSuccess={loadSales} notify={notify} />
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
        </div>
    );
}
