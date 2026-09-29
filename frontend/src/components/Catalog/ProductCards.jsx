import { fmtBase, resolveImageUrl, imgRetryOnError, toNameCase } from "../../helpers";
import { StockBand, splitQty } from "../ui/StockQty";
import { useApp } from "../../context/AppContext";

// Vista en cuadrícula del catálogo. Misma información y acciones que ProductTable
// (selección múltiple, editar, eliminar) para que cambiar de vista no cambie lo que
// se puede hacer, solo cómo se ve.
export default function ProductCards({
    products, canEditProducts, canDeleteProducts, openEditProduct, setDeleteProductDialog,
    selectedProducts = [], onToggleSelect, isSelectionMode = false,
    priceCurrency = "base", localCurrency = null, onToggleVisible, catalogEnabled = false
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
                const stock = p.warehouse_stock ?? p.stock;
                const [stockNum, stockUnit] = splitQty(stock, p.unit);
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
                            estiraba la tarjeta y descuadraba toda la fila de la grilla.
                            En móvil se achata a 4:3: en cuadrado, con dos columnas, cada foto se
                            llevaba media pantalla y apenas entraban dos productos por pantallazo. */}
                        <div className="aspect-[4/3] sm:aspect-square bg-surface-2 dark:bg-white/5 relative overflow-hidden">
                            {p.image_url ? (
                                <img
                                    src={resolveImageUrl(p.image_url)}
                                    alt={p.name}
                                    loading="lazy"
                                    onError={imgRetryOnError}
                                    className="absolute inset-0 w-full h-full object-cover"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-content-subtle opacity-30">
                                    {p.name.charAt(0)}
                                </div>
                            )}

                            {/* Existencia en franja al pie de la foto, como en Inventario:
                                oscura para todo, roja solo si se agotó (ver ui/StockQty). */}
                            {!p.is_service && (
                                <StockBand qty={stock} value={stockNum} unit={stockUnit} min={p.min_stock}
                                    className="absolute bottom-0 inset-x-0 px-2 py-1 backdrop-blur-sm text-base" />
                            )}

                            {/* Publicado en el catálogo público: se marca solo cuando lo
                                está. Un distintivo en cada tarjeta oculta ensuciaría la
                                grilla, y lo excepcional es lo que conviene señalar. */}
                            {catalogEnabled && p.visible_in_catalog && !isSelectionMode && (
                                <span className="absolute top-2 left-2 w-5 h-5 rounded-full btn-accent flex items-center justify-center shadow"
                                    title="Visible en el catálogo público">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                </span>
                            )}

                            {/* Insumo: no se vende ni se publica. Sin esta marca no habría
                                forma de distinguirlo en la grilla de uno que sí se vende, y
                                los dos se ven idénticos. Nunca coincide con el ojo de arriba:
                                un insumo no puede estar publicado. */}
                            {p.sellable === false && !isSelectionMode && (
                                <span className="absolute top-2 left-2 px-1.5 h-5 rounded-full bg-black/60 text-white backdrop-blur-sm flex items-center gap-1 shadow text-[10px] font-semibold"
                                    title="Insumo: no se vende en caja ni se publica">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                    Insumo
                                </span>
                            )}

                            {/* Acciones: aparecen al pasar el cursor, como en la tabla, pero SOLO
                                donde hay cursor. En un táctil no existe el hover, así que editar,
                                eliminar y publicar quedaban invisibles para siempre y no había
                                manera de gestionar un producto desde el teléfono. */}
                            {(canEditProducts || canDeleteProducts) && !isSelectionMode && (
                                <div className="absolute top-2 right-2 flex gap-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                                    {/* El ojo no aparece en un insumo: publicarlo es lo único
                                        que ese botón hace, y el servidor lo rechaza. */}
                                    {canEditProducts && catalogEnabled && p.sellable !== false && (
                                    <button onClick={() => onToggleVisible?.(p)}
                                        className={`w-7 h-7 rounded-lg bg-white/90 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] flex items-center justify-center shadow active:scale-90 transition-all ${p.visible_in_catalog ? "text-brand-500" : "text-content-subtle hover:text-brand-500"}`}
                                        title={p.visible_in_catalog ? "Quitar del catálogo público" : "Mostrar en el catálogo público"}>
                                        {p.visible_in_catalog ? (
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        ) : (
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                        )}
                                    </button>
                                    )}
                                    {canEditProducts && (
                                    <button onClick={() => openEditProduct(p)}
                                        className="w-7 h-7 rounded-lg bg-white/90 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white shadow active:scale-90 transition-all"
                                        title="Editar">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    </button>
                                    )}
                                    {canDeleteProducts && (
                                    <button onClick={() => setDeleteProductDialog(p.id)}
                                        className="w-7 h-7 rounded-lg bg-white/90 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] flex items-center justify-center text-content-subtle hover:text-danger shadow active:scale-90 transition-all"
                                        title="Eliminar">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-2.5 flex flex-col gap-0.5 flex-1">
                            <div className="flex items-start gap-1.5">
                                <span className="text-[11px] text-content-subtle truncate flex-1">
                                    {toNameCase(p.category_name || "General")}
                                </span>
                                {p.is_combo && (
                                    <span className="text-[10px] bg-surface-3 dark:bg-white/[0.06] text-content-subtle px-1.5 rounded font-medium shrink-0">Combo</span>
                                )}
                                {p.is_service && (
                                    <span className="text-[10px] bg-surface-3 dark:bg-white/[0.06] text-content-subtle px-1.5 rounded font-medium shrink-0">Serv.</span>
                                )}
                            </div>
                            <h3 className="text-[12px] font-semibold text-content dark:text-white leading-tight line-clamp-2">
                                {p.name}
                            </h3>
                            {/* Un insumo no tiene precio de venta, así que mostrarlo en 0 solo
                                ensucia. En su lugar va el costo, que es el dato que sí tiene
                                y el que interesa de un producto que solo se consume. */}
                            {p.sellable === false ? (
                                <div className="mt-auto pt-1 text-[12px] font-bold text-content-subtle dark:text-white/40 tabular-nums tracking-tighter">
                                    {parseFloat(p.cost_price) > 0
                                        ? <>Costo {fmtPrice(p.cost_price)}</>
                                        : "Sin costo"}
                                </div>
                            ) : (
                                <div className="mt-auto pt-1 text-[14px] font-bold text-content dark:text-white tabular-nums">
                                    {fmtPrice(p.price)}
                                </div>
                            )}
                        </div>
                    </article>
                );
            })}
        </div>
    );
}
