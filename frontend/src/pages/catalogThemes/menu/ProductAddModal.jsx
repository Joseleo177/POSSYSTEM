import { useState, useEffect, useRef } from "react";
import { resolveImageUrl, imgRetryOnError } from "../../../helpers";
import { freeUnitsFor, lineTotalFor } from "../../../helpers/promo";
import AddonPicker, { faltante, precioExtras } from "../../../components/mesas/AddonPicker";
import { flyToCart } from "../../../components/PublicCatalog/flyToCart";

// Ficha de "agregar al pedido" del tema de menú: se abre en CADA toque de "+", no solo
// cuando el cliente quiere escribir algo. Es la decisión que se tomó al construir esto —en
// un restaurante, "sin cebolla" o "bien cocido" son tan comunes que pedirlas de paso, en el
// mismo gesto de agregar, vale más que ahorrarse un modal en el pedido que no lleva nota.
//
// La nota es del PRODUCTO, no de cada toque de "+": reabrir esta ficha sobre algo que ya está
// en el carrito llega con su cantidad y su nota de antes, y confirmar las REEMPLAZA — es la
// misma línea, el cliente solo decidió pedir más o cambiar lo que había escrito.
//
// El fondo es panelColor —el mismo "papel sobre la mesa" que ya tiene el panel de categoría,
// no un negro fijo aparte—: era la única superficie del tema que no seguía el color que la
// tienda elige en Ajustes → Vitrina, y quedaba fuera de tono en cuanto la tienda cambiaba de
// negro a un color claro. Con el fondo claro por defecto, el texto pasa de blanco a oscuro
// fijo, igual que ya hace MenuProductList con las filas de producto.
const PANEL_POR_DEFECTO = "#F4FAF6";

export default function ProductAddModal({ product, existing, onClose, onConfirm, fmt, baseCur, altCur, panelColor }) {
    const [qty, setQty] = useState(1);
    const [note, setNote] = useState("");
    // Adicionales del plato (término, extras): vienen en el producto, ver services/addons.js.
    const [opciones, setOpciones] = useState([]);
    // La foto es de donde sale el plato que "vuela" al carrito flotante al confirmar.
    const fotoRef = useRef(null);

    // Se recarga cada vez que se abre para OTRO producto (o para el mismo, si ya tenía algo
    // en el carrito) — no al tipear, por eso depende de la identidad del producto y no del
    // objeto `existing` entero, que es uno nuevo en cada render del carrito.
    useEffect(() => {
        if (!product) return;
        // Sin nada en el carrito todavía y con una promo "compra y lleva" vigente, arranca en
        // el grupo completo (p.ej. 12): igual que en la vitrina, no tiene sentido pedirle al
        // cliente que suba el contador a mano hasta el mínimo que activa el descuento.
        const inicial = product.promo_buy_qty && product.promo_get_qty
            ? product.promo_buy_qty + product.promo_get_qty
            : 1;
        setQty(existing?.qty || inicial);
        setNote(existing?.note || "");
        setOpciones([]);
    }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!product) return null;

    const price = parseFloat(product.price);
    const hasPrice = price > 0;
    const enOferta = hasPrice && product.price_before != null;
    const freeUnits = freeUnitsFor({ ...product, qty });
    const totalLinea = hasPrice ? lineTotalFor({ ...product, qty, extras_price: precioExtras(opciones) }) : 0;
    const falta = faltante(product.addons, opciones);

    const confirmar = () => {
        flyToCart(fotoRef.current, { image_url: product.image_url, name: product.name, qty });
        onConfirm(product, qty, note, opciones);
        onClose();
    };

    const quitarDelCarrito = () => {
        onConfirm(product, 0, "");
        onClose();
    };

    return (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] catalog-overlay-in" onClick={onClose} />

            <div
                className="relative w-full sm:max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col catalog-sheet-in shadow-2xl shadow-black/40"
                style={{ backgroundColor: panelColor || PANEL_POR_DEFECTO }}
            >
                <div className="overflow-y-auto">
                    <div ref={fotoRef} className="aspect-[4/3] relative bg-black/5">
                        {product.image_url ? (
                            <img
                                src={resolveImageUrl(product.image_url)}
                                alt={product.name}
                                onError={imgRetryOnError}
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-6xl font-black text-brand-500/40 select-none">{product.name.charAt(0)}</span>
                            </div>
                        )}
                        {/* El botón de cerrar sigue oscuro con blur, foto haya o no: siempre
                            está sobre la imagen (o su relleno gris), nunca sobre el panel
                            claro, así que no necesita seguir el color del panel. */}
                        <button
                            onClick={onClose}
                            aria-label="Cerrar"
                            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="p-5 space-y-4">
                        <div>
                            {/* La ficha de un producto (getProduct) trae category.name; la
                                fila de una lista (getProducts) trae category_name, plano.
                                Este modal recibe cualquiera de los dos según desde dónde se
                                abrió, así que revisa las dos formas. */}
                            {(product.brand || product.category?.name || product.category_name) && (
                                <span className="block text-[10px] font-bold uppercase tracking-widest text-brand-500">
                                    {product.brand || product.category?.name || product.category_name}
                                </span>
                            )}
                            <h2 className="mt-0.5 text-[22px] font-black uppercase tracking-tight text-neutral-900 leading-tight">
                                {product.name}
                            </h2>
                            {(product.short_description || product.description_paragraphs?.[0]) && (
                                <p className="mt-1 text-[13px] font-medium text-neutral-600 leading-relaxed">
                                    {product.short_description || product.description_paragraphs[0]}
                                </p>
                            )}
                        </div>

                        {product.addons?.length > 0 && (
                            <AddonPicker groups={product.addons} value={opciones} onChange={setOpciones}
                                sym={baseCur?.symbol || "Ref."} tone="catalog" />
                        )}

                        <div>
                            <label className="flex items-center justify-between text-[13px] font-semibold text-neutral-800">Nota <span className="text-[12px] font-normal text-neutral-500">Opcional</span></label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Escribe aquí si quieres quitar o cambiar algo"
                                maxLength={200}
                                rows={2}
                                className="w-full mt-1.5 px-4 py-3 rounded-2xl bg-white border border-black/10 text-[16px] sm:text-[14px] text-neutral-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 placeholder:text-neutral-400 resize-none transition-shadow"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-[13px] font-semibold text-neutral-800">Cantidad</label>
                            <div className="flex items-center gap-1 rounded-full bg-white ring-1 ring-black/[0.08] p-1">
                                <button
                                    type="button"
                                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                                    disabled={qty <= 1}
                                    aria-label="Quitar uno"
                                    className="w-9 h-9 rounded-full text-neutral-800 flex items-center justify-center hover:bg-black/5 active:scale-90 transition-all disabled:opacity-30"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={3} d="M5 12h14" /></svg>
                                </button>
                                <span key={qty} className="badge-pop w-8 text-center text-[17px] font-bold text-neutral-900 tabular-nums">{qty}</span>
                                <button
                                    type="button"
                                    onClick={() => setQty((q) => q + 1)}
                                    aria-label="Agregar uno"
                                    className="w-9 h-9 rounded-full bg-brand-500 text-brand-ink flex items-center justify-center hover:brightness-110 active:scale-90 transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={3} d="M12 5v14M5 12h14" /></svg>
                                </button>
                            </div>
                        </div>
                        {freeUnits > 0 && (
                            <p className="text-[12px] font-semibold text-emerald-700 text-right -mt-1">
                                +{freeUnits} gratis por la promo
                            </p>
                        )}
                    </div>
                </div>

                <div className="p-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-2 border-t border-black/[0.06] bg-white/50">
                    {existing && (
                        <button
                            onClick={quitarDelCarrito}
                            className="w-full h-9 text-[13px] font-medium text-neutral-500 hover:text-red-600 transition-colors"
                        >
                            Quitar del pedido
                        </button>
                    )}
                    <button
                        onClick={confirmar}
                        disabled={!hasPrice || !!falta}
                        className="w-full h-14 rounded-full bg-brand-500 text-brand-ink flex items-center justify-between px-6 shadow-[0_10px_24px_-10px_rgb(var(--c-brand-600)/0.9)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:shadow-none"
                    >
                        <span className="text-[15px] font-semibold">
                            {falta ? `Elige ${falta.name.toLowerCase()}` : existing ? "Actualizar pedido" : "Agregar al pedido"}
                        </span>
                        {hasPrice && (
                            <span className="flex items-baseline gap-1.5">
                                <span className="text-[17px] font-bold tabular-nums">{fmt(totalLinea, baseCur)}</span>
                                {enOferta && (
                                    <span className="text-[11px] font-bold text-white/60 line-through tabular-nums">
                                        {fmt(product.price_before * qty, baseCur)}
                                    </span>
                                )}
                            </span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
