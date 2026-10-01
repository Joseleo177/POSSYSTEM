import { fmtBase, resolveImageUrl, imgRetryOnError, toNameCase } from "../../helpers";
import { StockBand, splitQty } from "../ui/StockQty";
import { useApp } from "../../context/AppContext";
import Money from "../ui/Money";
import Check from "../ui/Check";

const EYE     = "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z";
const EYE_OFF = "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21";
const TRASH   = "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";

// Botón de icono chico de la tarjeta. Siempre visible: en un táctil no hay hover que lo
// descubra, y antes editar, borrar y publicar flotaban SOBRE la foto tapando el producto.
function IconBtn({ d, title, onClick, className = "" }) {
    return (
        <button
            type="button"
            onClick={e => { e.stopPropagation(); onClick?.(); }}
            title={title}
            aria-label={title}
            className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors active:scale-90 hover:bg-surface-3 dark:hover:bg-white/[0.06] ${className}`}
        >
            <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
            </svg>
        </button>
    );
}

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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2.5 p-3">
            {products.map(p => {
                const stock = p.warehouse_stock ?? p.stock;
                const [stockNum, stockUnit] = splitQty(stock, p.unit);
                const selected = selectedProducts.includes(p.id);
                const insumo = p.sellable === false;
                // Tocar la tarjeta es lo natural en un táctil: abre la ficha para editar, o
                // marca el producto si se está seleccionando. El lápiz suelto sobraba.
                const abrir = isSelectionMode ? () => onToggleSelect(p.id)
                    : canEditProducts ? () => openEditProduct(p) : null;
                const puedePublicar = canEditProducts && catalogEnabled && !insumo && !isSelectionMode;
                const puedeBorrar   = canDeleteProducts && !isSelectionMode;

                return (
                    <article
                        key={p.id}
                        role={abrir ? "button" : undefined}
                        tabIndex={abrir ? 0 : undefined}
                        onClick={abrir || undefined}
                        onKeyDown={abrir ? (e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrir(); } }) : undefined}
                        className={`relative bg-white dark:bg-white/[0.03] rounded-xl border overflow-hidden flex flex-col transition-all ${
                            selected
                                ? "border-brand-500 ring-2 ring-brand-500/20"
                                : "border-border/70 dark:border-white/[0.06] hover:border-content-subtle/40 dark:hover:border-white/15"
                        } ${abrir ? "cursor-pointer active:scale-[0.99]" : ""}`}
                    >
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
                                <div className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-content-subtle/40">
                                    {p.name.charAt(0).toUpperCase()}
                                </div>
                            )}

                            {/* Existencia en franja al pie de la foto, como en Inventario y en la
                                caja: oscura para todo, roja solo si se agotó (ver ui/StockQty). */}
                            {!p.is_service && (
                                <StockBand qty={stock} value={stockNum} unit={stockUnit} min={p.min_stock}
                                    className="absolute bottom-0 inset-x-0 px-2 py-1 backdrop-blur-sm text-base" />
                            )}

                            {isSelectionMode && (
                                <div className="absolute top-2 left-2">
                                    <Check checked={selected} onChange={() => onToggleSelect(p.id)} title="Seleccionar" className="shadow" />
                                </div>
                            )}

                            {/* Insumo: no se vende ni se publica. Sin esta marca no habría forma
                                de distinguirlo en la grilla de uno que sí se vende. */}
                            {insumo && !isSelectionMode && (
                                <span className="absolute top-2 left-2 px-1.5 h-5 rounded-full bg-black/60 text-white backdrop-blur-sm flex items-center gap-1 text-[10px] font-semibold"
                                    title="Insumo: no se vende en caja ni se publica">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                    Insumo
                                </span>
                            )}
                        </div>

                        <div className="px-2.5 pt-1.5 pb-2.5 flex flex-col flex-1 min-w-0">
                            {/* Categoría y acciones en la misma línea: la categoría cede ancho
                                y el precio, abajo, queda entero. */}
                            <div className="flex items-center gap-1 min-h-[28px]">
                                <span className="text-[11px] text-content-subtle truncate flex-1 min-w-0">
                                    {toNameCase(p.category_name || "General")}
                                    {p.is_combo && " · Combo"}
                                    {p.is_service && " · Servicio"}
                                </span>
                                {(puedePublicar || puedeBorrar) && (
                                    <div className="flex items-center -mr-1.5 shrink-0">
                                        {/* El ojo dice el estado: en color, publicado en el catálogo
                                            público; tachado y gris, oculto. */}
                                        {puedePublicar && (
                                            <IconBtn
                                                d={p.visible_in_catalog ? EYE : EYE_OFF}
                                                title={p.visible_in_catalog ? "Publicado · tocar para ocultar del catálogo" : "Oculto · tocar para publicar en el catálogo"}
                                                onClick={() => onToggleVisible?.(p)}
                                                className={p.visible_in_catalog ? "text-brand-600 dark:text-brand-400" : "text-content-subtle/70"}
                                            />
                                        )}
                                        {puedeBorrar && (
                                            <IconBtn d={TRASH} title="Eliminar producto"
                                                onClick={() => setDeleteProductDialog(p.id)}
                                                className="text-content-subtle/70 hover:!text-red-600 dark:hover:!text-red-400" />
                                        )}
                                    </div>
                                )}
                            </div>

                            <h3 className="text-[13px] font-semibold text-content dark:text-white leading-snug line-clamp-2" title={p.name}>
                                {toNameCase(p.name)}
                            </h3>

                            {/* Un insumo no tiene precio de venta, así que mostrarlo en 0 solo
                                ensucia. En su lugar va el costo, que es el dato que sí tiene
                                y el que interesa de un producto que solo se consume. */}
                            {insumo ? (
                                <div className="mt-auto pt-1.5 text-[12px] font-medium text-content-subtle tabular-nums truncate">
                                    {parseFloat(p.cost_price) > 0 ? <>Costo <Money value={fmtPrice(p.cost_price)} /></> : "Sin costo"}
                                </div>
                            ) : (
                                <Money value={fmtPrice(p.price)} className="block mt-auto pt-1.5 text-[15px] font-bold tracking-tight text-content dark:text-white truncate" />
                            )}
                        </div>
                    </article>
                );
            })}
        </div>
    );
}
