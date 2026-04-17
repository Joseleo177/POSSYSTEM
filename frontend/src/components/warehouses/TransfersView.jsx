import { fmtDate, fmtQty } from "../../helpers";

export default function TransfersView({ transfers }) {
    return (
        <div className="flex-1 overflow-hidden flex flex-col py-3 px-4">
            <div className="card-premium overflow-auto flex-1">
                <table className="table-pos">
                    <thead>
                        <tr>
                            {["Fecha", "Producto", "Origen", "Destino", "Cantidad", "Responsable"].map(h => (
                                <th key={h} className="text-left">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 dark:divide-white/5">
                        {transfers.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-20 text-center">
                                    <div className="flex flex-col items-center gap-3 opacity-40">
                                        <svg className="w-10 h-10 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                        <div className="text-[11px] font-black uppercase tracking-widest text-content-subtle">No hay transferencias registradas</div>
                                    </div>
                                </td>
                            </tr>
                        ) : transfers.map(t => (
                            <tr key={t.id} className="group transition-colors">
                                <td className="text-[10px] font-bold text-content-subtle tabular-nums uppercase opacity-70">
                                    {fmtDate(t.created_at)}
                                </td>
                                <td className="font-black text-content dark:text-white text-xs uppercase tracking-tight group-hover:text-brand-500 transition-colors">
                                    {t.product_name}
                                </td>
                                <td>
                                    {t.from_warehouse_name ? (
                                        <span className="badge badge-warning shadow-none text-[10px]">
                                            {t.from_warehouse_name}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] text-content-subtle uppercase italic opacity-50">Externo</span>
                                    )}
                                </td>
                                <td>
                                    <span className="badge badge-success shadow-none text-[10px]">
                                        {t.to_warehouse_name}
                                    </span>
                                </td>
                                <td>
                                    <span className="text-[13px] font-black text-brand-500 tabular-nums">{fmtQty(t.qty)}</span>
                                </td>
                                <td>
                                    <div className="text-[11px] font-black text-content dark:text-white uppercase tracking-tighter truncate max-w-[120px]">
                                        {t.employee_name || "Sistema"}
                                    </div>
                                    {t.note && (
                                        <div className="text-[9px] text-content-subtle font-medium truncate max-w-[150px] italic mt-0.5 opacity-60">
                                            {t.note}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
