import { useState, useEffect } from "react";
import { fmtQty, resolveImageUrl, imgRetryOnError } from "../../helpers";
import { api } from "../../services/api";
import Pagination from "../ui/Pagination";

export default function StockView({
    selectedWarehouse, stockSearch, setStockSearch, loadingStock, filteredStock,
    handleEditStock, handleDeleteStock, openAddStock,
    loadStock, page, totalItems, limit,
    stockCategory, setStockCategory
}) {
    const [categories, setCategories] = useState([]);
    // Se recuerda entre sesiones: al hacer inventario físico se entra y sale de esta
    // pantalla muchas veces, y reiniciar la vista en cada visita es incómodo.
    const [viewMode, setViewMode] = useState(() => localStorage.getItem("stock_view") || "list");

    const [catError, setCatError] = useState(null);
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        api.categories.getAll()
            .then(r => setCategories(r.data || []))
            .catch(e => {
                // Nada de catch mudo: si el filtro no aparece hay que poder saber por qué.
                console.error("[StockView] no se pudieron cargar las categorías:", e);
                setCatError(e.message || "Error al cargar categorías");
            });
    }, []);

    useEffect(() => { localStorage.setItem("stock_view", viewMode); }, [viewMode]);

    if (!selectedWarehouse) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-content-subtle text-xs font-black uppercase tracking-wide">
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
                    {loadingStock && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                </div>

                {/* Filtros: mismo patrón de desplegable que el catálogo, para que el control
                    se maneje igual en toda la app. El filtro se aplica en el servidor. */}
                <div className="relative shrink-0">
                    <button onClick={() => setShowFilters(!showFilters)}
                        className={`h-9 px-2.5 flex items-center gap-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all ${stockCategory ? "bg-warning/10 border-warning/30 text-warning" : "bg-surface-2 dark:bg-white/5 border-border/40 dark:border-white/10 text-content-subtle hover:text-content"}`}>
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                        Filtros
                        {stockCategory && <span className="w-4 h-4 rounded-full bg-warning text-black text-[9px] font-black flex items-center justify-center shrink-0">1</span>}
                        <svg className={`w-3 h-3 shrink-0 transition-transform ${showFilters ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {showFilters && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setShowFilters(false)} />
                            {/* Anclado por la derecha: el botón vive al final de la barra, así que
                                con left-0 el panel crecía hacia afuera y se salía de la pantalla. */}
                            <div className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-surface-2 dark:bg-surface-dark-2 rounded-2xl border border-border/40 dark:border-white/10 shadow-2xl z-40 p-4 animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                                <div>
                                    <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Categoría</div>
                                    {catError ? (
                                        <p className="text-[11px] font-bold text-danger">{catError}</p>
                                    ) : categories.length === 0 ? (
                                        <p className="text-[11px] font-bold text-content-subtle">Sin categorías creadas</p>
                                    ) : (
                                        <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
                                            <button onClick={() => setStockCategory("")}
                                                className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${!stockCategory ? "bg-brand-500 text-black" : "hover:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                                Todas
                                            </button>
                                            {categories.map(c => (
                                                <button key={c.id} onClick={() => setStockCategory(String(c.id))}
                                                    className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center gap-2 ${String(stockCategory) === String(c.id) ? "bg-brand-500 text-black" : "hover:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color || "#fabd2f" }} />
                                                    <span className="truncate">{c.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {stockCategory && (
                                    <button onClick={() => { setStockCategory(""); setShowFilters(false); }}
                                        className="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-danger hover:bg-danger/10 transition-all border border-danger/20">
                                        Limpiar filtros
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Lista o cuadrícula: contar físicamente es más rápido viendo la foto. */}
                <div className="flex items-center rounded-xl border border-border/40 dark:border-white/10 overflow-hidden h-9 shrink-0 ml-auto">
                    <button
                        onClick={() => setViewMode("list")}
                        title="Vista de lista"
                        className={`h-full px-2.5 flex items-center justify-center transition-all ${
                            viewMode === "list" ? "bg-brand-500 text-black" : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                        }`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                    <button
                        onClick={() => setViewMode("grid")}
                        title="Vista de cuadrícula"
                        className={`h-full px-2.5 flex items-center justify-center border-l border-border/40 dark:border-white/10 transition-all ${
                            viewMode === "grid" ? "bg-brand-500 text-black" : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                        }`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                    </button>
                </div>
            </div>

            {/* La tabla se mantiene siempre montada (no se desmonta al buscar → el foco no se pierde) */}
            <>
                    {viewMode === "grid" ? (
                    <div className={`card-premium overflow-auto flex-1 mx-4 mb-2 transition-opacity ${loadingStock ? "opacity-40 pointer-events-none" : ""}`}>
                        {filteredStock.length === 0 ? (
                            loadingStock ? null : (
                                <div className="py-20 flex flex-col items-center gap-3">
                                    <div className="text-content-subtle text-[11px] font-bold uppercase tracking-widest">No se encontraron productos</div>
                                    <button onClick={openAddStock} className="text-brand-500 font-black text-[10px] uppercase tracking-widest underline underline-offset-4 hover:text-brand-400 transition-colors">Agregar Stock</button>
                                </div>
                            )
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 p-3">
                                {/* Dos columnas fijas en móvil: con minmax(150px) una pantalla
                                    angosta se quedaba en una sola columna y cada foto ocupaba el
                                    ancho entero, así que apenas entraba un producto por pantallazo. */}
                                {filteredStock.map(s => {
                                    const qty = parseFloat(s.qty);
                                    return (
                                        <article key={s.product_id}
                                            className="bg-surface dark:bg-surface-dark-2 rounded-2xl border border-border dark:border-white/5 overflow-hidden flex flex-col group">
                                            {/* Menos alta en móvil: en cuadrado, la foto se comía
                                                casi toda la pantalla y el stock quedaba fuera de vista. */}
                                            <div className="aspect-[4/3] sm:aspect-square bg-surface-2 dark:bg-white/5 relative overflow-hidden">
                                                {s.image_url ? (
                                                    <img src={resolveImageUrl(s.image_url)} alt={s.product_name} loading="lazy"
                                                        onError={imgRetryOnError}
                                                        className="absolute inset-0 w-full h-full object-cover" />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-500/5 to-brand-500/[0.12]">
                                                        <span className="text-3xl font-black text-brand-500/30 select-none">{s.product_name.charAt(0)}</span>
                                                    </div>
                                                )}
                                                {/* La existencia va grande sobre la foto: es el dato que se
                                                    compara contra lo que hay en el anaquel. */}
                                                {!s.is_service && (
                                                    <div className={`absolute bottom-0 inset-x-0 px-2 py-1 flex items-baseline gap-1 backdrop-blur-sm ${
                                                        qty <= 0 ? "bg-danger/90 text-white"
                                                        : qty <= 5 ? "bg-warning/90 text-black"
                                                        : "bg-success/90 text-white"
                                                    }`}>
                                                        <span className="text-base font-black tabular-nums leading-none">{fmtQty(s.qty)}</span>
                                                        <span className="text-[9px] font-black uppercase opacity-80">{s.unit || "uds"}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-2.5 flex flex-col gap-0.5 flex-1">
                                                <span className="text-[8px] font-black uppercase tracking-widest text-brand-500 truncate">
                                                    {s.category_name || "General"}
                                                </span>
                                                <h3 className="text-[10px] font-black uppercase tracking-tight text-content dark:text-white leading-tight line-clamp-2">
                                                    {s.product_name}
                                                </h3>
                                                <div className="mt-auto pt-1.5 flex items-center gap-1">
                                                    <button onClick={() => handleEditStock(s)}
                                                        className="flex-1 h-7 rounded-lg bg-info/10 text-info border border-info/20 hover:bg-info hover:text-black transition-all text-[9px] font-black uppercase tracking-wide"
                                                        title="Ajustar existencias">
                                                        Ajustar
                                                    </button>
                                                    <button onClick={() => handleDeleteStock(s)}
                                                        className="w-7 h-7 rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-black transition-all flex items-center justify-center shrink-0"
                                                        title="Retirar">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    ) : (
                    <div className={`card-premium overflow-auto flex-1 mx-4 mb-2 transition-opacity ${loadingStock ? "opacity-40 pointer-events-none" : ""}`}>
                        <table className="table-pos min-w-[680px]">
                            <thead>
                                <tr>
                                    {["Producto", "Categoría", "Stock Actual", "P. Venta", "Acciones"].map(h => (
                                        <th key={h} className="text-left">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40 dark:divide-white/5">
                                {filteredStock.length === 0 ? (
                                    loadingStock ? null : (
                                    <tr>
                                        <td colSpan={5} className="py-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="w-12 h-12 rounded-full bg-surface-3 dark:bg-white/5 flex items-center justify-center">
                                                    <svg className="w-6 h-6 text-content-subtle opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                                </div>
                                                <div className="text-content-subtle text-[11px] font-bold uppercase tracking-widest">No se encontraron productos</div>
                                                <button onClick={openAddStock} className="text-brand-500 font-black text-[10px] uppercase tracking-widest underline underline-offset-4 hover:text-brand-400 transition-colors">Agregar Stock</button>
                                            </div>
                                        </td>
                                    </tr>
                                    )
                                ) : filteredStock.map(s => (
                                    <tr key={s.product_id} className="group transition-colors">
                                        <td className="font-black text-xs text-content dark:text-white uppercase tracking-tight group-hover:text-brand-500 transition-colors">
                                            {s.product_name}
                                            {s.is_combo && (
                                                <span className="ml-2 px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 text-[8px] font-black uppercase tracking-widest rounded">Combo</span>
                                            )}
                                            {s.is_service && (
                                                <span className="ml-2 px-1.5 py-0.5 bg-fuchsia-500/10 text-fuchsia-400 text-[8px] font-black uppercase tracking-widest rounded">Servicio</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="text-[10px] font-bold text-content-subtle uppercase tracking-tighter opacity-70">{s.category_name || "General"}</span>
                                        </td>
                                        <td>
                                            {s.is_service ? (
                                                <span className="text-[13px] font-black text-content-subtle">—</span>
                                            ) : (
                                                <span className={`text-[13px] font-black tabular-nums transition-colors ${parseFloat(s.qty) <= 0 ? "text-danger" : parseFloat(s.qty) <= 5 ? "text-warning" : "text-success"}`}>
                                                    {fmtQty(s.qty)}
                                                    <span className="text-[9px] ml-1 opacity-40 uppercase font-bold">{s.unit || "uds"}</span>
                                                </span>
                                            )}
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
                    )}

                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={totalItems}
                        limit={limit}
                        onPageChange={(p) => loadStock(selectedWarehouse.id, p)}
                    />
            </>
        </div>
    );
}
