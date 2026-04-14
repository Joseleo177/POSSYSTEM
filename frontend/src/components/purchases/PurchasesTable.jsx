import { fmtDate } from "../../helpers";

const LIMIT = 50;

export default function PurchasesTable({ state }) {
    const { purchases, openDetail, setCancelConfirm, purchasesTotal, purchasesPage, setPurchasesPage } = state;
    const totalPages = Math.ceil((purchasesTotal || 0) / LIMIT);

    if (!purchases.length) {
        return (
            <div className="text-center py-16 text-[11px] font-black uppercase tracking-wide text-content-muted dark:text-content-dark-muted opacity-30">
                Sin recibos de compra registrados
            </div>
        );
    }

    const startItem = (purchasesPage - 1) * LIMIT + 1;
    const endItem = Math.min(purchasesPage * LIMIT, purchasesTotal);

    return (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-transparent">
            {/* Contenedor de Tabla */}
            <div className="card-premium overflow-auto flex-1 border-none shadow-none rounded-none bg-transparent">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-border/40 dark:border-white/5">
                            <th className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5 w-16">#</th>
                            <th className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5 whitespace-nowrap">Almacén</th>
                            <th className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5">Proveedor</th>
                            <th className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5 whitespace-nowrap text-center">Productos</th>
                                            <th className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5 text-right whitespace-nowrap">Total</th>
                            <th className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5 text-center">Pago</th>
                            <th className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5">Empleado</th>
                            <th className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5 whitespace-nowrap">Fecha</th>
                            <th className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5 text-right w-28">Acciones</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-border/40 dark:divide-white/5">
                        {purchases.map((p) => (
                            <tr
                                key={p.id}
                                className="group hover:bg-brand-500/[0.02] transition-colors"
                            >
                                <td className="px-6 py-4 font-black text-content-subtle tabular-nums text-xs">
                                    #{p.id}
                                </td>

                                <td className="px-6 py-4">
                                    {p.warehouse_name ? (
                                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide bg-info/10 text-info border border-info/20 whitespace-nowrap">
                                            {p.warehouse_name}
                                        </span>
                                    ) : (
                                        <span className="text-content-subtle opacity-30 text-[10px] font-bold uppercase truncate">
                                            Sin Almacén
                                        </span>
                                    )}
                                </td>

                                <td className="px-6 py-4">
                                    <div className="font-black text-sm text-content dark:text-heading-dark uppercase tracking-tight group-hover:text-brand-500 transition-colors">
                                        {p.supplier_name || "PROVEEDOR FINAL"}
                                    </div>
                                    {p.supplier_rif && (
                                        <div className="text-[10px] font-bold text-content-subtle opacity-40 uppercase tracking-widest mt-0.5">
                                            {p.supplier_rif}
                                        </div>
                                    )}
                                </td>

                                <td className="px-6 py-4 text-center">
                                    <span className="text-xs font-black text-content dark:text-white">
                                        {p.item_count}
                                        <span className="text-[10px] ml-1 uppercase opacity-30 tracking-tighter">items</span>
                                    </span>
                                </td>

                                <td className="px-6 py-4 text-right">
                                    <div className="font-black text-brand-500 text-sm tabular-nums">
                                        ${Number(p.total).toFixed(2)}
                                    </div>
                                    {p.amount_paid > 0 && p.payment_status !== "pagado" && (
                                        <div className="text-[10px] font-bold text-success tabular-nums">
                                            +${Number(p.amount_paid).toFixed(2)}
                                        </div>
                                    )}
                                </td>

                                <td className="px-6 py-4 text-center">
                                    {(() => {
                                        const s = p.payment_status || "pendiente";
                                        const cls = s === "pagado"    ? "bg-success/10 text-success border-success/20"
                                                   : s === "parcial"  ? "bg-warning/10 text-warning border-warning/20"
                                                   :                    "bg-danger/10 text-danger border-danger/20";
                                        const lbl = s === "pagado" ? "Pagado" : s === "parcial" ? "Parcial" : "Pendiente";
                                        return (
                                            <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-lg border ${cls}`}>
                                                {lbl}
                                            </span>
                                        );
                                    })()}
                                </td>

                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded-lg bg-surface-3 dark:bg-white/10 flex items-center justify-center text-[10px] font-black text-content-subtle shrink-0">
                                            {p.employee_name?.charAt(0) || "A"}
                                        </div>
                                        <span className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted uppercase tracking-tight truncate max-w-[100px]">
                                            {p.employee_name || "Admin"}
                                        </span>
                                    </div>
                                </td>

                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-[11px] font-bold text-content-subtle uppercase tabular-nums">
                                        {fmtDate(p.created_at)}
                                    </div>
                                </td>

                                <td className="px-6 py-4">
                                    <div className="flex justify-end gap-1.5">
                                        <button
                                            onClick={() => openDetail(p.id)}
                                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-info/10 text-info border border-info/20 hover:bg-info hover:text-black transition-all active:scale-90"
                                            title="Ver Detalle"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        </button>

                                        <button
                                            onClick={() => setCancelConfirm(p)}
                                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-black transition-all active:scale-90"
                                            title="Anular"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Nueva Barra de Paginación Estándar */}
            {totalPages > 1 && (
                <div className="shrink-0 px-4 py-2 border-t border-border/20 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.01]">
                    <div className="text-[10px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest">
                        Mostrando <span className="text-content dark:text-white">{startItem}-{endItem}</span> de <span className="text-content dark:text-white">{purchasesTotal}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button 
                            disabled={purchasesPage === 1}
                            onClick={() => setPurchasesPage(1)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                        >
                            «
                        </button>
                        <button 
                            disabled={purchasesPage === 1}
                            onClick={() => setPurchasesPage(p => Math.max(1, p - 1))}
                            className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                        >
                            Anterior
                        </button>
                        <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">
                            Pág {purchasesPage}/{totalPages}
                        </div>
                        <button 
                            disabled={purchasesPage === totalPages}
                            onClick={() => setPurchasesPage(p => Math.min(totalPages, p + 1))}
                            className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                        >
                            Siguiente
                        </button>
                        <button 
                            disabled={purchasesPage === totalPages}
                            onClick={() => setPurchasesPage(totalPages)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                        >
                            »
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
