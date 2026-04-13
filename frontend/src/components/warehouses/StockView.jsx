import { fmtQty } from "../../helpers";

export default function StockView({ 
    selectedWarehouse, stockSearch, setStockSearch, loadingStock, filteredStock, 
    handleEditStock, handleDeleteStock, openAddStock,
    loadStock, page, totalItems, limit
}) {
    if (!selectedWarehouse) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-content-subtle text-xs font-black uppercase tracking-wide opacity-40">
                    Selecciona un almacén para gestionar inventario
                </div>
            </div>
        );
    }

    const totalPages = Math.ceil(totalItems / limit);
    const startItem = (page - 1) * limit + 1;
    const endItem = Math.min(page * limit, totalItems);

    return (
        <div className="flex-1 overflow-hidden flex flex-col py-3 min-h-0">
            <div className="shrink-0 mb-3">
                <input
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                    placeholder="Filtrar producto..."
                    className="w-full max-w-xs h-8 px-3 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/5 rounded-lg text-xs font-medium focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
                />
            </div>

            {loadingStock ? (
                <div className="py-20 text-center text-brand-500 animate-pulse text-[11px] font-black uppercase tracking-wide">
                    Sincronizando existencias...
                </div>
            ) : (
                <>
                    <div className="card-premium overflow-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-surface-2 dark:bg-surface-dark-2">
                                    {["Producto", "Categoría", "Stock Actual", "P. Venta", "Acciones"].map(h => (
                                        <th key={h} className="px-6 py-5 text-[11px] font-black uppercase tracking-wide text-content-subtle border-b border-border/40 dark:border-white/5">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40 dark:divide-white/5">
                                {filteredStock.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <span className="text-4xl opacity-10">?</span>
                                                <div className="text-content-subtle text-xs font-bold uppercase tracking-wide">No se encontraron productos</div>
                                                <button onClick={openAddStock} className="text-brand-500 font-black text-[11px] uppercase tracking-wide underline underline-offset-4">Agregar Stock</button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredStock.map(s => (
                                    <tr key={s.product_id} className="group hover:bg-brand-500/[0.02] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-content dark:text-heading-dark tracking-tight uppercase group-hover:text-brand-500 transition-colors">{s.product_name}</span>
                                                {s.is_combo && <span className="w-fit mt-1 px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-wide rounded-md">Combo Virtual</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[11px] font-bold text-content-subtle uppercase">{s.category_name || "General"}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-lg font-black ${parseFloat(s.qty) <= 0 ? "text-danger" : parseFloat(s.qty) <= 5 ? "text-warning" : "text-success"}`}>
                                                {fmtQty(s.qty)}
                                                <span className="text-[11px] ml-1 opacity-40 uppercase">{s.unit || "uds"}</span>
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-black text-brand-500 text-sm">${parseFloat(s.price || 0).toFixed(2)}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleEditStock(s)}
                                                    className="p-2.5 rounded-lg bg-info/10 text-info border border-info/20 hover:bg-info hover:text-black transition-all"
                                                    title="Ajustar"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteStock(s)}
                                                    className="p-2.5 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-black transition-all"
                                                    title="Retirar"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Paginación */}
                    {totalPages > 1 && (
                        <div className="shrink-0 px-4 py-2 border-t border-border/20 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.01]">
                            <div className="text-[10px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest">
                                Mostrando <span className="text-content dark:text-white">{startItem}-{endItem}</span> de <span className="text-content dark:text-white">{totalItems}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button 
                                    disabled={page === 1}
                                    onClick={() => loadStock(selectedWarehouse.id, 1)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                >
                                    «
                                </button>
                                <button 
                                    disabled={page === 1}
                                    onClick={() => loadStock(selectedWarehouse.id, page - 1)}
                                    className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                >
                                    Anterior
                                </button>
                                <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">
                                    Pág {page}/{totalPages}
                                </div>
                                <button 
                                    disabled={page === totalPages}
                                    onClick={() => loadStock(selectedWarehouse.id, page + 1)}
                                    className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                >
                                    Siguiente
                                </button>
                                <button 
                                    disabled={page === totalPages}
                                    onClick={() => loadStock(selectedWarehouse.id, totalPages)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                >
                                    »
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
