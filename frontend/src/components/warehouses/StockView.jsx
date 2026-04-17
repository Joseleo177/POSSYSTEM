import { fmtQty } from "../../helpers";
import Pagination from "../ui/Pagination";

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
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white/[0.01]">
            {/* Barra de herramientas local */}
            <div className="shrink-0 py-3 flex items-center gap-3 px-4">
                <div className="relative flex-1 max-w-xs">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        value={stockSearch}
                        onChange={e => setStockSearch(e.target.value)}
                        placeholder="Filtrar producto..."
                        className="input h-10 pl-9"
                    />
                </div>
            </div>

            {loadingStock ? (
                <div className="py-20 text-center text-brand-500 animate-pulse text-[11px] font-black uppercase tracking-wide">
                    Sincronizando existencias...
                </div>
            ) : (
                <>
                    <div className="card-premium overflow-auto flex-1 mx-4 mb-2">
                        <table className="table-pos">
                            <thead>
                                <tr>
                                    {["Producto", "Categoría", "Stock Actual", "P. Venta", "Acciones"].map(h => (
                                        <th key={h} className="text-left">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40 dark:divide-white/5">
                                {filteredStock.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="w-12 h-12 rounded-full bg-surface-3 dark:bg-white/5 flex items-center justify-center">
                                                    <svg className="w-6 h-6 text-content-subtle opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                                </div>
                                                <div className="text-content-subtle text-[11px] font-bold uppercase tracking-widest opacity-40">No se encontraron productos</div>
                                                <button onClick={openAddStock} className="text-brand-500 font-black text-[10px] uppercase tracking-widest underline underline-offset-4 hover:text-brand-400 transition-colors">Agregar Stock</button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredStock.map(s => (
                                    <tr key={s.product_id} className="group transition-colors">
                                        <td className="font-black text-xs text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">
                                            {s.product_name}
                                            {s.is_combo && (
                                                <span className="ml-2 px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 text-[8px] font-black uppercase tracking-widest rounded">Combo</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="text-[10px] font-bold text-content-subtle uppercase tracking-tighter opacity-70">{s.category_name || "General"}</span>
                                        </td>
                                        <td>
                                            <span className={`text-[13px] font-black tabular-nums transition-colors ${parseFloat(s.qty) <= 0 ? "text-danger" : parseFloat(s.qty) <= 5 ? "text-warning" : "text-success"}`}>
                                                {fmtQty(s.qty)}
                                                <span className="text-[9px] ml-1 opacity-40 uppercase font-bold">{s.unit || "uds"}</span>
                                            </span>
                                        </td>
                                        <td className="font-bold text-brand-500 text-xs tabular-nums tracking-tight">
                                            ${parseFloat(s.price || 0).toFixed(2)}
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleEditStock(s)}
                                                    className="w-8 h-8 rounded-lg bg-info/10 text-info border border-info/20 hover:bg-info hover:text-black transition-all flex items-center justify-center"
                                                    title="Ajustar"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteStock(s)}
                                                    className="w-8 h-8 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-black transition-all flex items-center justify-center"
                                                    title="Retirar"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={totalItems}
                        limit={limit}
                        onPageChange={(p) => loadStock(selectedWarehouse.id, p)}
                    />
                </>
            )}
        </div>
    );
}
