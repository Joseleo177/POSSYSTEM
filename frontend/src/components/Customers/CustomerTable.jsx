import { Button } from "../ui/Button";

export default function CustomerTable({
    customers,
    onDetail,
    onEdit,
    onDelete,
    fmtPrice
}) {
    return (
        <div className="flex-1 overflow-hidden flex flex-col py-3 px-4">
            <div className="card-premium overflow-auto flex-1">
                <table className="table-pos">
                    <thead>
                        <tr>
                            <th className="text-left">Tipo</th>
                            <th className="text-left">Contacto</th>
                            <th className="hidden lg:table-cell text-left">RIF / Cédula</th>
                            <th className="text-left">Balance</th>
                            <th className="text-right w-[140px] pr-6">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20 dark:divide-white/5">
                        {customers.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="py-20 text-center opacity-30">
                                    <div className="text-[11px] font-black uppercase tracking-widest text-content-subtle">Sin registros en la base de datos</div>
                                </td>
                            </tr>
                        ) : customers.map(c => (
                            <tr key={c.id} className="group transition-colors">
                                <td>
                                    <span className={`badge ${c.type === "proveedor" ? "badge-violet" : "badge-info"} shadow-none`}>
                                        {c.type}
                                    </span>
                                </td>
                                <td>
                                    <div className="text-[12px] font-black uppercase tracking-tight text-content dark:text-white group-hover:text-brand-500 transition-colors">
                                        {c.name}
                                    </div>
                                    <div className="text-[10px] text-content-subtle font-bold opacity-60 uppercase">{c.city || "Sin ciudad"}</div>
                                </td>
                                <td className="hidden lg:table-cell text-[11px] font-bold text-content-subtle opacity-50 tabular-nums">
                                    {c.rif || "S/N"}
                                </td>
                                <td>
                                    {parseFloat(c.total_debt || 0) > 0 ? (
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-danger tabular-nums">-{fmtPrice(c.total_debt)}</span>
                                            <span className="text-[9px] font-bold uppercase text-danger/50">Por cobrar</span>
                                        </div>
                                    ) : (
                                        <span className="badge badge-success shadow-none !bg-success/5 !text-success border-success/10 font-black uppercase tracking-widest">
                                            Al día
                                        </span>
                                    )}
                                </td>
                                <td className="text-right pr-6">
                                    <div className="flex justify-end gap-1">
                                        <button
                                            onClick={() => onDetail(c)}
                                            className="p-2 hover:bg-brand-500/10 rounded-xl transition-all text-content-subtle hover:text-brand-500 group/btn"
                                            title="Ver Detalle"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        </button>

                                        <button
                                            onClick={() => onEdit(c)}
                                            className="p-2 hover:bg-warning/10 rounded-xl transition-all text-content-subtle hover:text-warning"
                                            title="Editar"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        </button>

                                        <button
                                            onClick={() => onDelete(c)}
                                            className="p-2 hover:bg-danger/10 rounded-xl transition-all text-content-subtle hover:text-danger"
                                            title="Eliminar"
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
        </div>
    );
}