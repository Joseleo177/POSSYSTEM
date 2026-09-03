import { resolveImageUrl, imgRetryOnError } from "../../../helpers";
import { isIntegerUnit, fmtQtyUnit } from "../../../helpers/unitFormatter";

// Carrito del tema de menú. Mismo contrato que el de boutique —recibe y devuelve exactamente
// lo mismo, viene del mismo usePublicCatalog—, pero con la superficie clara del tema: el
// mismo panelColor que ya usan MenuProductList y ProductAddModal, no un negro fijo aparte.
// Ese negro fue justamente lo que se reportó como fuera de tono en cuanto la tienda eligió
// otro color de panel — un carrito que no seguía el resto de la carta.
const PANEL_POR_DEFECTO = "#F4FAF6";

export default function CartDrawer({
    open, onClose,
    cart, cartTotal, identity, store,
    changeQty, setQtyDirect, handleQtyBlur, removeFromCart, clearCart,
    delivery, setDelivery,
    fmt, baseCur, altCur,
    canSubmit, onSubmit, sending, sendError,
    placedOrder, waHref, onOpenMyOrders,
    panelColor,
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-40 flex justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] catalog-overlay-in" onClick={onClose} />

            <aside
                className="relative w-full sm:max-w-[420px] h-full flex flex-col shadow-2xl catalog-drawer-in"
                style={{ backgroundColor: panelColor || PANEL_POR_DEFECTO }}
            >
                <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-[20px] font-bold text-brand-500 leading-none">
                            {placedOrder ? "Pedido enviado" : "Carrito"}
                        </h2>
                        {identity && !placedOrder && (
                            <p className="text-[11px] font-medium text-neutral-500 truncate mt-1.5">
                                A nombre de {identity.name} · {identity.document}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="shrink-0 -mt-1 p-1.5 text-neutral-400 hover:text-neutral-900 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {placedOrder ? (
                    <div className="flex-1 overflow-y-auto px-5 py-6 text-center space-y-4">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-success/10 text-success flex items-center justify-center">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[15px] font-bold text-neutral-900">Pedido #{placedOrder.id} recibido</p>
                            <p className="text-[12px] font-medium text-neutral-500 leading-relaxed">
                                {store?.name || "La tienda"} ya lo tiene en su lista. Te contactarán
                                al {identity?.phone} para confirmarlo y coordinar el pago.
                            </p>
                        </div>
                        <div className="text-[13px] font-black text-neutral-900 tabular-nums">
                            Total {fmt(placedOrder.total, baseCur)}
                            {altCur && <span className="text-neutral-500 font-bold"> · {fmt(placedOrder.total, altCur)}</span>}
                        </div>
                        <div className="space-y-2 pt-2">
                            {waHref && (
                                <a
                                    href={waHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full h-11 rounded-full bg-[#25D366] text-black text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.886-9.885 9.886m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488" /></svg>
                                    Abrir chat con la tienda
                                </a>
                            )}
                            <button
                                onClick={() => { onClose(); onOpenMyOrders(); }}
                                className="w-full h-11 rounded-full bg-brand-500/10 border border-brand-500/25 text-brand-500 text-[10px] font-bold uppercase tracking-widest hover:bg-brand-500/15 transition-all"
                            >
                                Ver el estado de mi pedido
                            </button>
                            <button
                                onClick={onClose}
                                className="w-full h-11 rounded-full text-neutral-500 text-[10px] font-bold uppercase tracking-widest hover:text-neutral-900 transition-all"
                            >
                                Seguir viendo el menú
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto px-5">
                            {cart.length === 0 ? (
                                <div className="py-20 text-center">
                                    <p className="text-[13px] font-bold text-neutral-900">Tu carrito está vacío</p>
                                    <p className="text-[11px] font-medium text-neutral-500 mt-1">Agrega platos para enviar tu pedido.</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-black/[0.06]">
                                    {cart.map(it => (
                                        <li key={it.id} className="py-4 flex gap-3">
                                            <div className="w-16 h-16 shrink-0 rounded-xl bg-black/5 border border-black/10 overflow-hidden relative">
                                                {it.image_url ? (
                                                    <img src={resolveImageUrl(it.image_url)} alt="" onError={imgRetryOnError}
                                                        className="absolute inset-0 w-full h-full object-cover" />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-brand-500/50">
                                                        {it.name.charAt(0)}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start gap-2">
                                                    <h3 className="flex-1 text-[13px] font-bold text-neutral-900 leading-snug line-clamp-2">
                                                        {it.name}
                                                    </h3>
                                                    <button
                                                        onClick={() => removeFromCart(it.id)}
                                                        aria-label={`Quitar ${it.name}`}
                                                        className="shrink-0 -mt-0.5 p-1 text-neutral-400 hover:text-danger transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>

                                                <p className="text-[11px] font-medium text-neutral-500 mt-0.5">
                                                    {fmtQtyUnit(it.qty || 0, it.unit)}
                                                </p>
                                                {it.note && (
                                                    <p className="text-[11px] font-medium text-brand-500 italic mt-0.5 leading-snug">
                                                        "{it.note}"
                                                    </p>
                                                )}

                                                <div className="flex items-center justify-between gap-2 mt-2">
                                                    <div className="flex items-center rounded-full border border-black/10 p-0.5">
                                                        <button
                                                            onClick={() => changeQty(it.id, -1)}
                                                            aria-label="Quitar uno"
                                                            className="w-7 h-7 rounded-full text-neutral-900 hover:bg-black/5 active:scale-90 transition-all flex items-center justify-center text-sm font-bold"
                                                        >
                                                            −
                                                        </button>
                                                        <input
                                                            type="number"
                                                            inputMode={isIntegerUnit(it.unit) ? "numeric" : "decimal"}
                                                            step={isIntegerUnit(it.unit) ? "1" : "any"}
                                                            min="0"
                                                            value={it.qty}
                                                            onChange={e => setQtyDirect(it.id, e.target.value)}
                                                            onBlur={() => handleQtyBlur(it.id, it.unit)}
                                                            className="w-10 bg-transparent text-center text-[12px] font-bold border-none outline-none text-neutral-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none tabular-nums"
                                                        />
                                                        <button
                                                            onClick={() => changeQty(it.id, +1)}
                                                            aria-label="Agregar uno"
                                                            className="w-7 h-7 rounded-full text-neutral-900 hover:bg-black/5 active:scale-90 transition-all flex items-center justify-center text-sm font-bold"
                                                        >
                                                            +
                                                        </button>
                                                    </div>

                                                    <span className="text-[13px] font-black text-neutral-900 tabular-nums">
                                                        {fmt(parseFloat(it.price) * (parseFloat(it.qty) || 0), baseCur)}
                                                    </span>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {cart.length > 0 && (
                                <div className="py-4 border-t border-black/[0.06]">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                                        Entrega o nota (opcional)
                                    </label>
                                    <input
                                        value={delivery}
                                        onChange={e => setDelivery(e.target.value)}
                                        placeholder="Mesa, dirección, retiro en local..."
                                        className="w-full h-11 mt-1.5 px-4 rounded-full bg-white border border-black/10 text-[12px] font-medium text-neutral-900 outline-none focus:border-brand-500/60 placeholder:text-neutral-400"
                                    />
                                </div>
                            )}
                        </div>

                        {cart.length > 0 && (
                            <div className="px-5 py-4 border-t border-black/[0.06] space-y-3">
                                <div className="flex items-baseline justify-between">
                                    <span className="text-[14px] font-bold text-neutral-900">Subtotal</span>
                                    <div className="text-right">
                                        <div className="text-[17px] font-black text-neutral-900 tabular-nums leading-none">
                                            {fmt(cartTotal, baseCur)}
                                        </div>
                                        {altCur && (
                                            <div className="text-[11px] font-medium text-neutral-500 tabular-nums mt-1">
                                                {fmt(cartTotal, altCur)}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <p className="text-[10px] font-medium text-neutral-500 leading-relaxed">
                                    {canSubmit
                                        ? "Al enviarlo, la tienda lo confirma y te contacta para coordinar el pago y la entrega."
                                        : "Completa cédula, nombre y teléfono para poder enviarlo."}
                                </p>

                                {sendError && (
                                    <p className="text-[11px] font-bold text-danger leading-relaxed">{sendError}</p>
                                )}

                                <button
                                    onClick={onSubmit}
                                    disabled={!canSubmit || sending}
                                    className="w-full h-12 rounded-full bg-brand-500 text-white text-[11px] font-bold uppercase tracking-widest flex items-center justify-center active:scale-[0.99] transition-transform disabled:opacity-40"
                                >
                                    {sending ? "Enviando..." : "Enviar pedido"}
                                </button>

                                <button
                                    onClick={clearCart}
                                    disabled={sending}
                                    className="w-full text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-danger transition-colors disabled:opacity-40"
                                >
                                    Vaciar carrito
                                </button>
                            </div>
                        )}
                    </>
                )}
            </aside>
        </div>
    );
}
