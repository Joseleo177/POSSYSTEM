import { usePagos } from "../../hooks/contabilidad/usePagos";
import PaymentFormModal from "../PaymentFormModal";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import ConfirmModal from "../ui/ConfirmModal";
import Pagination from "../ui/Pagination";
import DateRangePicker from "../ui/DateRangePicker";

export default function PagosTab({ notify, can, baseCurrency, fmtPrice, fmtPayment, setReceiptSale }) {
    const {
        data, total, page, setPage, loading, LIMIT,
        viewType, setViewType,
        searchTerm, setSearchTerm,
        payDateFrom, setPayDateFrom,
        payDateTo, setPayDateTo,
        showFilterDrop, setShowFilterDrop,
        payDetail, setPayDetail,
        payModal, setPayModal,
        deleteDialog, setDeleteDialog,
        clearFilters, reload,
        confirmRemovePayment, handleExportCSV,
        hasFilters, totalPages,
    } = usePagos({ notify });

    const subheader = (
        <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" placeholder="Buscar cliente o factura..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="input h-8 pl-8 text-[11px] w-full" />
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
                    {hasFilters && <span className="bg-brand-500 text-black w-4 h-4 rounded flex items-center justify-center text-[9px]">1</span>}
                </button>
                {showFilterDrop && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                        <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[70] animate-in fade-in zoom-in-95 duration-150">
                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Vista</div>
                                <div className="flex bg-surface-2 dark:bg-white/5 p-0.5 rounded-lg border border-border/20 dark:border-white/5">
                                    {["historial", "pendientes"].map(v => (
                                        <button key={v} onClick={() => setViewType(v)}
                                            className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wide rounded-md transition-all ${viewType === v ? "bg-brand-500 text-black shadow" : "text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                            {v === "historial" ? "Historial" : "Por Cobrar"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                                <DateRangePicker from={payDateFrom} to={payDateTo} setFrom={setPayDateFrom} setTo={setPayDateTo} />
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
                                {["Referencia", "Estado / Tipo", "Cliente", "Fecha", "Monto", "Acciones"].map(h => (
                                    <th key={h} className={h === "Acciones" || h === "Monto" ? "text-right pr-6" : "text-left"}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="py-20 text-center text-brand-500 animate-pulse text-xs font-black uppercase tracking-widest">Sincronizando movimientos...</td></tr>
                            ) : data.length === 0 ? (
                                <tr><td colSpan={6} className="py-20 text-center text-content-subtle text-xs font-black uppercase tracking-wide italic opacity-40">Sin movimientos en esta vista</td></tr>
                            ) : data.map(item => {
                                const isInvoice = viewType === "pendientes";
                                return (
                                    <tr key={`${viewType}-${item.id}`} className="group">
                                        <td>
                                            <span className="text-[11px] font-black text-brand-500 tracking-tight">
                                                {item.invoice_number || (isInvoice ? `Factura #${item.id}` : `Cobro #${item.id}`)}
                                            </span>
                                            {!isInvoice && item.reference_number && (
                                                <div className="text-[9px] font-black text-content-subtle opacity-40 uppercase tracking-tighter mt-0.5">Ref: {item.reference_number}</div>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`badge shadow-none ${isInvoice
                                                ? item.status === "parcial" ? "badge-warning" : "badge-danger"
                                                : "badge-info"}`}>
                                                {isInvoice ? (item.status === "parcial" ? "Parcial" : "Pendiente") : "Cobro Realizado"}
                                            </span>
                                        </td>
                                        <td className="truncate max-w-[200px]">
                                            <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight truncate block">{item.customer_name || "Consumidor Final"}</span>
                                            {item.journal_name && <span className="text-[9px] font-black opacity-30 uppercase">{item.journal_name}</span>}
                                        </td>
                                        <td>
                                            <span className="text-[11px] font-bold text-content-subtle uppercase">{new Date(item.created_at).toLocaleDateString()}</span>
                                        </td>
                                        <td className="text-right pr-6">
                                            <span className={`text-[11px] font-black tabular-nums ${isInvoice ? "text-brand-500" : "text-success"}`}>
                                                {isInvoice ? fmtPrice(item.total) : fmtPayment(item)}
                                            </span>
                                            {isInvoice && item.status === "parcial" && (
                                                <div className="text-[10px] font-bold text-danger tabular-nums">Debe: {fmtPrice(item.balance)}</div>
                                            )}
                                        </td>
                                        <td className="text-right pr-6">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {isInvoice ? (
                                                    <>
                                                        <button onClick={() => setReceiptSale(item)} className="p-2 rounded-xl transition-all text-content-subtle hover:text-brand-500 hover:bg-brand-500/10 active:scale-90" title="Ver Factura">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                        </button>
                                                        <button onClick={() => setPayModal(item)} className="h-7 px-3 rounded-lg bg-success text-black text-[10px] font-black uppercase tracking-wide transition-all active:scale-90 flex items-center gap-1 shadow-lg shadow-success/20">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                                                            Cobrar
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => setPayDetail(item)} className="h-7 px-3 rounded-lg bg-brand-500/10 text-brand-500 border border-brand-500/20 hover:bg-brand-500 hover:text-black text-[10px] font-black uppercase tracking-wide transition-all">Detalle</button>
                                                        {can("admin") && (
                                                            <button onClick={() => setDeleteDialog(item.id)} className="p-2 rounded-xl transition-all text-content-subtle hover:text-danger hover:bg-danger/10 active:scale-90" title="Eliminar">
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

                <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
            </div>

            {payModal && (
                <PaymentFormModal sale={payModal} onClose={() => setPayModal(null)} onSuccess={() => { setPayModal(null); reload(); }} />
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
        </div>
    );
}
