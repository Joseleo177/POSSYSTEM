import { fmtDate, fmtQty } from "../../helpers";

export default function TransfersView({ transfers }) {
    return (
        <div className="flex-1 overflow-hidden flex flex-col py-3">
            <div className="card-premium overflow-auto flex-1">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-surface-2 dark:bg-surface-dark-2">
                            {["Fecha", "Producto", "Origen", "Destino", "Cantidad", "Responsable"].map(h => (
                                <th key={h} className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 dark:divide-white/5">
                        {transfers.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-20 text-center text-content-subtle text-xs font-bold uppercase tracking-wide italic">
                                    No se han registrado movimientos entre almacenes
                                </td>
                            </tr>
                        ) : transfers.map(t => (
                            <tr key={t.id} className="group hover:bg-brand-500/[0.02] transition-colors">
                                <td className="px-6 py-5 text-[11px] font-bold text-content-subtle whitespace-nowrap">
                                    {fmtDate(t.created_at)}
                                </td>
                                <td className="px-6 py-5 font-black text-content dark:text-heading-dark text-xs uppercase tracking-tight">
                                    {t.product_name}
                                </td>
                                <td className="px-6 py-5">
                                    {t.from_warehouse_name ? (
                                        <span className="px-2.5 py-1 rounded-lg bg-danger/5 text-danger text-[11px] font-black uppercase border border-danger/10">
                                            {t.from_warehouse_name}
                                        </span>
                                    ) : (
                                        <span className="text-[11px] text-content-subtle uppercase italic">Entrada Externa</span>
                                    )}
                                </td>
                                <td className="px-6 py-5">
                                    <span className="px-2.5 py-1 rounded-lg bg-success/5 text-success text-[11px] font-black uppercase border border-success/10">
                                        {t.to_warehouse_name}
                                    </span>
                                </td>
                                <td className="px-6 py-5">
                                    <span className="text-sm font-black text-brand-500">{fmtQty(t.qty)}</span>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="text-[11px] font-bold text-content dark:text-heading-dark uppercase">{t.employee_name || "Sistema"}</div>
                                    {t.note && <div className="text-[11px] text-content-subtle mt-0.5 truncate max-w-[150px]">{t.note}</div>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
