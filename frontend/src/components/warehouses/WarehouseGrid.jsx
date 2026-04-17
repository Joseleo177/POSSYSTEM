export default function WarehouseGrid({ warehouses, openAssign, startEdit, setDeleteConfirm, setSelectedWarehouse, setSubTab }) {
    return (
        <div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start py-3">
            {warehouses.map(w => (
                <div
                    key={w.id}
                    className={[
                        "card-premium group relative p-4 transition-all duration-300 hover:shadow-premium-dark/20 hover:-translate-y-1 overflow-hidden block",
                        w.active ? "opacity-100" : "opacity-50 grayscale",
                    ].join(" ")}
                >
                    <div className="relative z-10">
                        {/* Header del Card */}
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex-1 min-w-0 pr-4">
                                <div className="font-black text-[13px] text-content dark:text-white uppercase tracking-tight truncate group-hover:text-brand-500 transition-colors uppercase">
                                    {w.name}
                                </div>
                                {w.description && (
                                    <div className="text-[10px] font-medium text-content-subtle mt-0.5 truncate italic">
                                        {w.description}
                                    </div>
                                )}
                            </div>
                            <span className={[
                                "badge shadow-none",
                                w.active ? "badge-success" : "badge-danger",
                            ].join(" ")}>
                                {w.active ? "Activo" : "Inactivo"}
                            </span>
                        </div>

                        {/* Métricas Principales */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            {[
                                { val: w.product_count, lab: "Productos", color: "text-brand-500" },
                                { val: parseFloat(w.total_stock || 0).toFixed(0), lab: "Existencias", color: "text-brand-500" },
                                { val: (w.assigned_employees || []).length, lab: "Usuarios", color: "text-brand-500" }
                            ].map((met, idx) => (
                                <div key={idx} className="bg-surface-2 dark:bg-white/[0.03] py-2.5 px-1 rounded-xl text-center border border-border/40 dark:border-white/5">
                                    <div className={`text-base font-black tabular-nums ${met.color}`}>{met.val || 0}</div>
                                    <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mt-0.5">{met.lab}</div>
                                </div>
                            ))}
                        </div>

                        {/* Botones de Acción Estándar */}
                        <div className="flex flex-wrap gap-2 pt-4 border-t border-border/10 dark:border-white/5">
                            <button
                                onClick={() => { setSelectedWarehouse(w); setSubTab("stock"); }}
                                className="flex-1 h-9 rounded-xl bg-brand-500/10 text-brand-500 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all flex items-center justify-center gap-1.5"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                Stock
                            </button>
                            <button
                                onClick={() => openAssign(w)}
                                className="flex-1 h-9 rounded-xl bg-violet-500/10 text-violet-400 text-[10px] font-black uppercase tracking-widest hover:bg-violet-500 hover:text-black transition-all flex items-center justify-center gap-1.5"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                Usuarios
                            </button>
                            <button
                                onClick={() => { setSelectedWarehouse(w); setSubTab("ajustes"); }}
                                className="h-9 w-9 rounded-xl bg-warning/10 text-warning hover:bg-warning hover:text-black transition-all flex items-center justify-center border border-warning/20"
                                title="Ajustes"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                            </button>
                            <div className="flex gap-1 ml-auto">
                                <button
                                    onClick={() => startEdit(w)}
                                    className="w-9 h-9 rounded-xl bg-surface-3 dark:bg-white/5 text-content-subtle hover:text-brand-500 transition-all border border-border/20 dark:border-white/5 flex items-center justify-center"
                                    title="Editar"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                </button>
                                <button
                                    onClick={() => setDeleteConfirm(w)}
                                    className="w-9 h-9 rounded-xl bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-black transition-all flex items-center justify-center"
                                    title="Eliminar"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
