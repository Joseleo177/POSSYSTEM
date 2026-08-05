import { fmtBase, resolveImageUrl, imgRetryOnError } from "../../helpers";
import { useApp } from "../../context/AppContext";

// Vista en cuadrícula del catálogo. Misma información y acciones que ProductTable
// (selección múltiple, editar, eliminar) para que cambiar de vista no cambie lo que
// se puede hacer, solo cómo se ve.
export default function ProductCards({
    products, canManageProducts, openEditProduct, setDeleteProductDialog,
    selectedProducts = [], onToggleSelect, isSelectionMode = false,
    priceCurrency = "base", localCurrency = null
}) {
    const { baseCurrency } = useApp();
    const fmtPrice = (n) => {
        if (priceCurrency === "local" && localCurrency) {
            return fmtBase(parseFloat(n) * parseFloat(localCurrency.exchange_rate), localCurrency);
        }
        return fmtBase(n, baseCurrency);
    };

    // Columnas automáticas en vez de un número fijo por breakpoint: la tarjeta ronda los
    // 170px y la grilla mete las que quepan. En un monitor ancho eso da el doble de
    // columnas que antes, sin dejar tarjetas gigantes en pantallas grandes.
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2.5 p-3">
            {products.map(p => {
                const stock = parseFloat(p.warehouse_stock ?? p.stock);
                const selected = selectedProducts.includes(p.id);
                return (
                    <article
                        key={p.id}
                        onClick={() => isSelectionMode && onToggleSelect(p.id)}
                        className={`group relative bg-surface dark:bg-surface-dark-2 rounded-2xl border overflow-hidden flex flex-col transition-all ${
                            selected
                                ? "border-brand-500 ring-2 ring-brand-500/20"
                                : "border-border dark:border-white/5 hover:border-brand-500/40"
                        } ${isSelectionMode ? "cursor-pointer" : ""}`}
                    >
                        {isSelectionMode && (
                            <div className="absolute top-2 left-2 z-10">
                                <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => onToggleSelect(p.id)}
                                    onClick={e => e.stopPropagation()}
                                    className="w-4 h-4 rounded border-border/40 bg-white text-brand-500 focus:ring-brand-500/20 shadow"
                                />
                            </div>
                        )}

                        {/* La imagen va en posición absoluta: aspect-square define un alto
                            preferido, no un tope, así que una foto vertical en flujo normal
                            estiraba la tarjeta y descuadraba toda la fila de la grilla. */}
                        <div className="aspect-square bg-surface-2 dark:bg-white/5 relative overflow-hidden">
                            {p.image_url ? (
                                <img
                                    src={resolveImageUrl(p.image_url)}
                                    alt={p.name}
                                    loading="lazy"
                                    onError={imgRetryOnError}
                                    className="absolute inset-0 w-full h-full object-cover"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-2xl font-black text-content-subtle opacity-30">
                                    {p.name.charAt(0)}
                                </div>
                            )}

                            {/* Stock arriba a la derecha, con el mismo semáforo de la tabla */}
                            {!p.is_service && (
                                <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide tabular-nums ${
                                    stock <= 0 ? "bg-danger text-white"
                                    : stock <= 5 ? "bg-warning text-black"
                                    : "bg-success text-white"
                                }`}>
                                    {p.warehouse_stock ?? p.stock} {p.unit || "uds"}
                                </span>
                            )}

                            {/* Acciones: aparecen al pasar el cursor, como en la tabla */}
                            {canManageProducts && !isSelectionMode && (
                                <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEditProduct(p)}
                                        className="w-7 h-7 rounded-lg bg-white/90 dark:bg-black/70 backdrop-blur flex items-center justify-center text-content-subtle hover:text-warning shadow active:scale-90 transition-all"
                                        title="Editar">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    </button>
                                    <button onClick={() => setDeleteProductDialog(p.id)}
                                        className="w-7 h-7 rounded-lg bg-white/90 dark:bg-black/70 backdrop-blur flex items-center justify-center text-content-subtle hover:text-danger shadow active:scale-90 transition-all"
                                        title="Eliminar">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="p-2.5 flex flex-col gap-0.5 flex-1">
                            <div className="flex items-start gap-1.5">
                                <span className="text-[8px] font-black uppercase tracking-widest text-brand-500 truncate flex-1">
                                    {p.category_name || "General"}
                                </span>
                                {p.is_combo && (
                                    <span className="text-[8px] bg-brand-500/10 text-brand-500 border border-brand-500/20 px-1 rounded uppercase font-bold shrink-0">Combo</span>
                                )}
                                {p.is_service && (
                                    <span className="text-[8px] bg-blue-500/10 text-blue-500 border border-blue-500/20 px-1 rounded uppercase font-bold shrink-0">Serv.</span>
                                )}
                            </div>
                            <h3 className="text-[10px] font-black uppercase tracking-tight text-content dark:text-white leading-tight line-clamp-2">
                                {p.name}
                            </h3>
                            <div className="mt-auto pt-1 text-[13px] font-black text-brand-500 tabular-nums tracking-tighter">
                                {fmtPrice(p.price)}
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}
