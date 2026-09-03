import { useState, useEffect } from "react";
import { resolveImageUrl, imgRetryOnError } from "../../../helpers";

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

    // Se recarga cada vez que se abre para OTRO producto (o para el mismo, si ya tenía algo
    // en el carrito) — no al tipear, por eso depende de la identidad del producto y no del
    // objeto `existing` entero, que es uno nuevo en cada render del carrito.
    useEffect(() => {
        if (!product) return;
        setQty(existing?.qty || 1);
        setNote(existing?.note || "");
    }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!product) return null;

    const price = parseFloat(product.price);
    const hasPrice = price > 0;
    const enOferta = hasPrice && product.price_before != null;
    const totalLinea = hasPrice ? price * qty : 0;

    const confirmar = () => {
        onConfirm(product, qty, note);
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
                className="relative w-full sm:max-w-md max-h-[92vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col catalog-drawer-in shadow-2xl shadow-black/40"
                style={{ backgroundColor: panelColor || PANEL_POR_DEFECTO }}
            >
                <div className="overflow-y-auto">
                    <div className="aspect-[4/3] relative bg-black/5">
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

                        <div>
                            <label className="text-[11px] font-black uppercase tracking-widest text-neutral-500">Nota</label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Escribe aquí si quieres quitar o cambiar algo"
                                maxLength={200}
                                rows={2}
                                className="w-full mt-1.5 px-3.5 py-2.5 rounded-2xl bg-white border border-black/10 text-[13px] font-medium text-neutral-900 outline-none focus:border-brand-500/60 placeholder:text-neutral-400 resize-none"
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-[11px] font-black uppercase tracking-widest text-neutral-500">Cantidad</label>
                            <div className="flex items-center gap-4">
                                <button
                                    type="button"
                                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                                    disabled={qty <= 1}
                                    aria-label="Quitar uno"
                                    className="w-9 h-9 rounded-full bg-black/5 text-neutral-900 flex items-center justify-center text-lg font-bold hover:bg-black/10 active:scale-90 transition-all disabled:opacity-30"
                                >
                                    −
                                </button>
                                <span className="w-6 text-center text-[16px] font-black text-neutral-900 tabular-nums">{qty}</span>
                                <button
                                    type="button"
                                    onClick={() => setQty((q) => q + 1)}
                                    aria-label="Agregar uno"
                                    className="w-9 h-9 rounded-full bg-black/5 text-neutral-900 flex items-center justify-center text-lg font-bold hover:bg-black/10 active:scale-90 transition-all"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-5 pt-0 space-y-2">
                    {existing && (
                        <button
                            onClick={quitarDelCarrito}
                            className="w-full text-[11px] font-bold uppercase tracking-widest text-neutral-400 hover:text-danger transition-colors"
                        >
                            Quitar del pedido
                        </button>
                    )}
                    <button
                        onClick={confirmar}
                        disabled={!hasPrice}
                        className="w-full h-14 rounded-full bg-brand-500 text-white flex items-center justify-between px-6 hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-40"
                    >
                        <span className="text-[12px] font-black uppercase tracking-widest">
                            {existing ? "Actualizar pedido" : "Agregar al pedido"}
                        </span>
                        {hasPrice && (
                            <span className="flex items-baseline gap-1.5">
                                <span className="text-[16px] font-black tabular-nums">{fmt(totalLinea, baseCur)}</span>
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
