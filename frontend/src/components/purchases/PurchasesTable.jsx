import { fmtDate } from "../../helpers";
import Pagination from "../ui/Pagination";

const LIMIT = 50;

export default function PurchasesTable({ state }) {
    const { 
        purchases, openDetail, setCancelConfirm, 
        purchasesTotal, purchasesPage, setPurchasesPage 
    } = state;
    
    const totalPages = Math.ceil((purchasesTotal || 0) / LIMIT);

    if (!purchases.length) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-30">
                <svg className="w-12 h-12 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <div className="text-[11px] font-black uppercase tracking-widest text-content-subtle">Sin recibos de compra registrados</div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {/* Contenedor de Tabla */}
            <div className="card-premium overflow-auto flex-1">
                <table className="table-pos">
                    <thead>
                        <tr>
                            <th className="w-16 text-left">#</th>
                            <th className="text-left">Almacén</th>
                            <th className="text-left">Proveedor</th>
                            <th className="text-center">Items</th>
                            <th className="text-right">Total</th>
                            <th className="text-center">Estado</th>
                            <th className="text-left">Empleado</th>
                            <th className="text-left">Fecha</th>
                            <th className="text-right w-[140px] pr-6">Acciones</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-border/10 dark:divide-white/5">
                        {purchases.map((p) => (
                            <tr key={p.id} className="group transition-all hover:bg-brand-500/[0.02]">
                                <td className="font-bold text-content-subtle tabular-nums text-[11px]">
                                    #{p.id}
                                </td>

                                <td>
                                    {p.warehouse_name ? (
                                        <span className="badge badge-info shadow-none uppercase font-bold text-[9px] !px-2">
                                            {p.warehouse_name}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] text-content-subtle uppercase italic opacity-40 px-1">N/A</span>
                                    )}
                                </td>

                                <td>
                                    <div className="font-bold text-xs text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">
                                        {p.supplier_name || "PROVEEDOR FINAL"}
                                    </div>
                                    {p.supplier_rif && (
                                        <div className="text-[9px] font-bold text-content-subtle opacity-40 uppercase tracking-widest mt-0.5">
                                            {p.supplier_rif}
                                        </div>
                                    )}
                                </td>

                                <td className="text-center">
                                    <span className="text-xs font-bold text-content dark:text-white tabular-nums">
                                        {p.item_count}
                                    </span>
                                </td>

                                <td className="text-right">
                                    <div className="font-bold text-brand-500 text-xs tabular-nums tracking-tighter">
                                        ${Number(p.total).toFixed(2)}
                                    </div>
                                    {p.amount_paid > 0 && p.payment_status !== "pagado" && (
                                        <div className="text-[9px] font-bold text-success tabular-nums opacity-60">
                                            +${Number(p.amount_paid).toFixed(2)}
                                        </div>
                                    )}
                                </td>

                                <td className="text-center">
                                    {(() => {
                                        const s = p.payment_status || "pendiente";
                                        const badgeClass = s === "pagado" ? "badge-success" : s === "parcial" ? "badge-warning" : "badge-danger";
                                        const labels = { pagado: "PAGADO", parcial: "PARCIAL", pendiente: "PENDIENTE" };
                                        return (
                                            <span className={`badge ${badgeClass} shadow-none uppercase font-bold text-[9px] !px-2`}>
                                                {labels[s] || s}
                                            </span>
                                        );
                                    })()}
                                </td>

                                <td>
                                    <div className="flex items-center gap-2">
                                        <div className="w-5 h-5 rounded bg-surface-3 dark:bg-white/10 flex items-center justify-center text-[9px] font-bold text-content-subtle uppercase">
                                            {p.employee_name?.charAt(0) || "A"}
                                        </div>
                                        <span className="text-[10px] font-bold text-content-subtle uppercase tracking-tight truncate max-w-[100px]">
                                            {p.employee_name || "Admin"}
                                        </span>
                                    </div>
                                </td>

                                <td className="text-[10px] font-medium text-content-subtle uppercase tabular-nums opacity-60">
                                    {fmtDate(p.created_at)}
                                </td>

                                <td className="text-right pr-6">
                                    <div className="flex justify-end gap-1">
                                        <button
                                            onClick={() => openDetail(p.id)}
                                            className="p-2 hover:bg-info/10 rounded-lg transition-all text-content-subtle hover:text-info active:scale-90"
                                            title="Ver Detalle"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        </button>

                                        <button
                                            onClick={() => setCancelConfirm(p)}
                                            className="p-2 hover:bg-danger/10 rounded-lg transition-all text-content-subtle hover:text-danger active:scale-90"
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

            {/* Paginación Global Estandarizada */}
            <Pagination 
                page={purchasesPage}
                totalPages={totalPages}
                total={purchasesTotal}
                limit={LIMIT}
                onPageChange={setPurchasesPage}
            />
        </div>
    );
}
