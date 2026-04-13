export default function WarehouseGrid({ warehouses, openAssign, startEdit, setDeleteConfirm, setSelectedWarehouse, setSubTab }) {
    return (
        <div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start py-3">
            {warehouses.map(w => (
                <div
                    key={w.id}
                    className={[
                        "group relative bg-white dark:bg-surface-dark-2 border border-border dark:border-white/5 rounded-lg p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:shadow-brand-500/10 hover:-translate-y-0.5 overflow-hidden",
                        w.active ? "opacity-100" : "opacity-50 grayscale",
                    ].join(" ")}
                >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-brand-500/10 transition-colors" />

                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex-1 min-w-0 pr-4">
                                <div className="font-black text-sm text-content dark:text-heading-dark uppercase tracking-wider truncate group-hover:text-brand-500 transition-colors">{w.name}</div>
                                {w.description && <div className="text-[11px] text-content-subtle mt-1 italic truncate">{w.description}</div>}
                            </div>
                            <span className={[
                                "text-[11px] font-black uppercase tracking-wide px-2.5 py-1.5 rounded-lg border",
                                w.active
                                    ? "text-success border-success/30 bg-success/5"
                                    : "text-danger border-danger/30 bg-danger/5",
                            ].join(" ")}>
                                {w.active ? "Activo" : "Inactivo"}
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="bg-surface-2 dark:bg-surface-dark-3/50 p-3 rounded-lg text-center border border-border/30 dark:border-white/5">
                                <div className="text-xl font-black text-brand-500">{w.product_count || 0}</div>
                                <div className="text-xs font-medium text-content-subtle uppercase tracking-wide mt-0.5">Productos</div>
                            </div>
                            <div className="bg-surface-2 dark:bg-surface-dark-3/50 p-3 rounded-lg text-center border border-border/30 dark:border-white/5">
                                <div className="text-xl font-black text-info">{parseFloat(w.total_stock || 0).toFixed(0)}</div>
                                <div className="text-xs font-medium text-content-subtle uppercase tracking-wide mt-0.5">Items</div>
                            </div>
                            <div className="bg-surface-2 dark:bg-surface-dark-3/50 p-3 rounded-lg text-center border border-border/30 dark:border-white/5">
                                <div className="text-xl font-black text-violet-500">{(w.assigned_employees || []).length}</div>
                                <div className="text-xs font-medium text-content-subtle uppercase tracking-wide mt-0.5">Empleados</div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-4 border-t border-border/20">
                            <button
                                onClick={() => { setSelectedWarehouse(w); setSubTab("stock"); }}
                                className="flex-1 min-w-[100px] py-2.5 rounded-lg bg-info/10 text-info text-[11px] font-black uppercase tracking-wide hover:bg-info hover:text-black transition-all"
                            >
                                Stock
                            </button>
                            <button
                                onClick={() => openAssign(w)}
                                className="flex-1 min-w-[100px] py-2.5 rounded-lg bg-violet-500/10 text-violet-400 text-[11px] font-black uppercase tracking-wide hover:bg-violet-500 hover:text-black transition-all"
                            >
                                Empleados
                            </button>
                            <button
                                onClick={() => { setSelectedWarehouse(w); setSubTab("ajustes"); }}
                                className="flex-1 min-w-[100px] py-2.5 rounded-lg bg-warning/10 text-warning text-[11px] font-black uppercase tracking-wide hover:bg-warning hover:text-black transition-all"
                            >
                                Ajustes
                            </button>
                            <button
                                onClick={() => startEdit(w)}
                                className="p-2.5 rounded-lg bg-surface-3 dark:bg-surface-dark-3 text-content-subtle hover:text-brand-500 transition-all border border-border/20"
                                title="Editar"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <button
                                onClick={() => setDeleteConfirm(w)}
                                className="p-2.5 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-black transition-all"
                                title="Eliminar"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
