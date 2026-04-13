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

    return (
        <div className="card-premium flex-1 overflow-hidden flex flex-col">
            <div className="overflow-auto h-full">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead className="sticky top-0">
                        <tr className="border-b border-border/40 bg-surface-2 dark:bg-surface-dark-2 text-[11px] font-black text-content-subtle dark:text-white/30 uppercase tracking-wide">
                            <th className="px-4 py-2.5 w-12">#</th>
                            <th className="px-4 py-2.5">Almacén</th>
                            <th className="px-4 py-2.5">Proveedor</th>
                            <th className="px-4 py-2.5">Productos</th>
                            <th className="px-4 py-2.5 text-right">Total</th>
                            <th className="px-4 py-2.5">Empleado</th>
                            <th className="px-4 py-2.5">Fecha</th>
                            <th className="px-4 py-2.5 text-right w-28">Acciones</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-border/10">
                        {purchases.map((p) => (
                            <tr
                                key={p.id}
                                className="group hover:bg-surface-1/50 dark:hover:bg-white/[0.03] transition-colors text-xs"
                            >
                                <td className="px-4 py-2.5 font-bold text-content-subtle tabular-nums">
                                    #{p.id}
                                </td>

                                <td className="px-4 py-2.5">
                                    {p.warehouse_name ? (
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide bg-info/10 text-info border border-info/20">
                                            {p.warehouse_name}
                                        </span>
                                    ) : (
                                        <span className="text-content-subtle opacity-30 text-[11px] font-bold uppercase">
                                            Sin Almacén
                                        </span>
                                    )}
                                </td>

                                <td className="px-4 py-2.5">
                                    <div className="font-black text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">
                                        {p.supplier_name || "PROVEEDOR FINAL"}
                                    </div>
                                    {p.supplier_rif && (
                                        <div className="text-[11px] font-bold text-content-subtle opacity-50 uppercase tracking-wider mt-0.5">
                                            {p.supplier_rif}
                                        </div>
                                    )}
                                </td>

                                <td className="px-4 py-2.5 font-bold text-content-subtle">
                                    {p.item_count}{" "}
                                    <span className="text-[11px] uppercase font-black opacity-50">
                                        items
                                    </span>
                                </td>

                                <td className="px-4 py-2.5 text-right font-black text-warning tabular-nums text-sm">
                                    ${Number(p.total).toFixed(2)}
                                </td>

                                <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-surface-3 dark:bg-white/10 flex items-center justify-center text-[11px] font-black text-content-subtle">
                                            {p.employee_name?.charAt(0)}
                                        </div>
                                        <span className="font-bold text-content-muted">
                                            {p.employee_name || "—"}
                                        </span>
                                    </div>
                                </td>

                                <td className="px-4 py-2.5 font-medium text-content-subtle">
                                    {fmtDate(p.created_at)}
                                </td>

                                <td className="px-4 py-2 text-right">
                                    <div className="flex justify-end gap-1.5">
                                        <button
                                            onClick={() => openDetail(p.id)}
                                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-info/10 text-info border border-info/20 hover:bg-info hover:text-white transition-all active:scale-95"
                                            title="Ver Detalle"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        </button>

                                        <button
                                            onClick={() => setCancelConfirm(p)}
                                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all active:scale-95"
                                            title="Anular"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/20 dark:border-white/5">
                    <span className="text-[11px] font-black uppercase tracking-wide text-content-subtle opacity-60">
                        {purchasesTotal} compras · página {purchasesPage} de {totalPages}
                    </span>
                    <div className="flex gap-1.5">
                        <button
                            onClick={() => setPurchasesPage(p => Math.max(1, p - 1))}
                            disabled={purchasesPage === 1}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 text-content-subtle hover:bg-surface-2 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button
                            onClick={() => setPurchasesPage(p => Math.min(totalPages, p + 1))}
                            disabled={purchasesPage === totalPages}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 text-content-subtle hover:bg-surface-2 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
