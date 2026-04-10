import { Button } from "../ui/Button";

export default function CustomerTable({
    customers,
    onDetail,
    onEdit,
    onDelete,
    fmtPrice
}) {
    return (
        <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 backdrop-blur-md">
                    <tr className="border-b border-border/30 dark:border-white/5 text-[11px] font-black uppercase text-content-subtle">
                        <th className="px-4 py-2">Tipo</th>
                        <th className="px-4 py-2">Contacto</th>
                        <th className="px-4 py-2 hidden lg:table-cell">RIF / Cédula</th>
                        <th className="px-4 py-2">Balance</th>
                        <th className="px-4 py-2 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/20 dark:divide-white/5">
                    {customers.length === 0 ? (
                        <tr><td colSpan={5} className="p-10 text-center text-[10px] font-black uppercase opacity-20">Sin registros</td></tr>
                    ) : customers.map(c => (
                        <tr key={c.id} className="group hover:bg-surface-1/50 dark:hover:bg-white/[0.03]">
                            <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${c.type === "proveedor" ? "bg-violet-500/10 text-violet-500 border-violet-500/20" : "bg-info/10 text-info border-info/20"}`}>
                                    {c.type}
                                </span>
                            </td>
                            <td className="px-4 py-2 font-black text-[11px] uppercase group-hover:text-brand-500 transition-colors">{c.name}</td>
                            <td className="px-4 py-2 hidden lg:table-cell text-[11px] opacity-40">{c.rif || "S/N"}</td>
                            <td className="px-4 py-2 text-[11px] font-black">
                                {parseFloat(c.total_debt || 0) > 0
                                    ? <span className="text-danger">-{fmtPrice(c.total_debt)}</span>
                                    : <span className="text-success uppercase">Al día</span>}
                            </td>
                            <td className="px-4 py-2 text-right">
                                <div className="flex justify-end gap-2">
                                    {/* BOTÓN VER (OJO) */}
                                    <button
                                        onClick={() => onDetail(c)}
                                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-info/80 hover:text-info"
                                        title="Ver Detalle"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    </button>

                                    {/* BOTÓN EDITAR */}
                                    <button
                                        onClick={() => onEdit(c)}
                                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-warning/80 hover:text-warning"
                                        title="Editar"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>

                                    {/* BOTÓN ELIMINAR */}
                                    <button
                                        onClick={() => onDelete(c)}
                                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-danger/80 hover:text-danger"
                                        title="Eliminar"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}