import { resolveImageUrl, imgRetryOnError } from "../../helpers";
import { isIntegerUnit, fmtQtyUnit } from "../../helpers/unitFormatter";

// Panel del pedido: el carrito que el cliente armó y, una vez enviado, la confirmación con el
// número que le asignó la tienda. Mientras placedOrder exista se muestra esa confirmación en
// lugar del carrito, porque el pedido ya está en el sistema del comercio y no se puede editar.
export default function OrderPanel({
    open, onClose,
    cart, cartTotal, identity, store,
    changeQty, setQtyDirect, handleQtyBlur, removeFromCart, clearCart,
    delivery, setDelivery,
    fmt, baseCur, altCur,
    canSubmit, onSubmit, sending, sendError,
    placedOrder, waHref, onOpenMyOrders,
}) {
    if (!open) return null;

    return (
                <div className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => onClose()} />
                    {/* En escritorio el panel iba al mismo ancho que en el teléfono (max-w-md), así
                        que los mismos controles —dimensionados para el pulgar— quedaban apretados
                        contra los bordes y la fila del producto se leía desproporcionada. */}
                    <div className="relative w-full sm:max-w-lg bg-surface dark:bg-surface-dark-2 rounded-t-3xl sm:rounded-3xl border-t sm:border border-border dark:border-white/10 max-h-[90vh] flex flex-col">
                        <div className="relative px-5 pt-5 pb-4 flex flex-col items-center justify-center border-b border-border dark:border-white/5">
                            <h2 className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white text-center">
                                {placedOrder ? "Pedido enviado" : "Tu pedido"}
                            </h2>
                            {/* A nombre de quién va el pedido, como subtítulo. Antes ocupaba un
                                bloque del tamaño de una fila de producto para repetirle al cliente
                                algo que ya sabe: basta con que pueda comprobarlo de un vistazo. */}
                            {identity && !placedOrder && (
                                <p className="text-[10px] font-bold text-content-muted text-center truncate max-w-full px-8">
                                    {identity.name} · {identity.document}
                                </p>
                            )}
                            <button onClick={() => onClose()}
                                className="absolute right-4 top-3.5 p-1.5 text-content-subtle hover:text-content dark:hover:text-white">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Confirmación: el pedido ya está en el sistema de la tienda. El botón
                            de WhatsApp es opcional y solo abre la conversación — el detalle no
                            viaja por ahí, así que el mensaje es de una línea. */}
                        {placedOrder ? (
                            <div className="px-5 py-8 text-center space-y-4">
                                <div className="w-14 h-14 mx-auto rounded-2xl bg-success/10 text-success flex items-center justify-center">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-black text-content dark:text-white">
                                        Pedido #{placedOrder.id} recibido
                                    </p>
                                    <p className="text-[12px] font-bold text-content-muted leading-relaxed">
                                        {store?.name || "La tienda"} ya lo tiene en su lista. Te contactarán
                                        al {identity?.phone} para confirmarlo y enviarte la factura.
                                    </p>
                                </div>
                                <div className="text-[11px] font-black uppercase tracking-widest text-content-subtle tabular-nums">
                                    Total {fmt(placedOrder.total, baseCur)}
                                    {altCur && ` · ${fmt(placedOrder.total, altCur)}`}
                                </div>
                                <div className="space-y-2 pt-2">
                                    {waHref && (
                                        <a
                                            href={waHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full h-11 rounded-2xl bg-[#25D366] text-black text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.99] transition-transform shadow-sm"
                                        >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.886-9.885 9.886m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488" /></svg>
                                            Abrir chat con la tienda
                                        </a>
                                    )}
                                    <button
                                        onClick={() => { onClose(); onOpenMyOrders(); }}
                                        className="w-full h-11 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-500 text-[11px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all"
                                    >
                                        Ver el estado de mi pedido
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="w-full h-11 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-content-muted dark:text-white text-[11px] font-black uppercase tracking-widest hover:text-content transition-all"
                                    >
                                        Seguir viendo el catálogo
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                                    {cart.map(it => (
                                        <div key={it.id} className="flex items-center gap-3">
                                            <div className="w-11 h-11 rounded-xl bg-surface-2 dark:bg-white/5 overflow-hidden shrink-0 relative">
                                                {it.image_url ? (
                                                    <img src={resolveImageUrl(it.image_url)} alt={it.name} onError={imgRetryOnError}
                                                        className="absolute inset-0 w-full h-full object-cover" />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center text-base font-black text-brand-500/30">
                                                        {it.name.charAt(0)}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white leading-tight line-clamp-2">
                                                    {it.name}
                                                </div>
                                                <div className="text-[12px] font-bold text-content-muted tabular-nums mt-0.5">
                                                    {fmtQtyUnit(it.qty || 0, it.unit)} · {fmt(parseFloat(it.price) * (parseFloat(it.qty) || 0), baseCur)}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <div className="flex items-center rounded-xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 p-0.5">
                                                    <button
                                                        onClick={() => changeQty(it.id, -1)}
                                                        aria-label="Quitar uno"
                                                        className="w-7 h-7 rounded-lg text-content dark:text-white font-black hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all flex items-center justify-center text-sm"
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
                                                        className="w-11 bg-transparent text-center text-[12px] font-black border-none outline-none text-content dark:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none tabular-nums"
                                                    />
                                                    <button
                                                        onClick={() => changeQty(it.id, +1)}
                                                        aria-label="Agregar uno"
                                                        className="w-7 h-7 rounded-lg text-content dark:text-white font-black hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all flex items-center justify-center text-sm"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                                {/* Mismo alto que el selector de cantidad de al lado: con
                                                    w-9 sobresalía y desalineaba la fila. */}
                                                <button onClick={() => removeFromCart(it.id)} title="Eliminar" aria-label={`Eliminar ${it.name}`}
                                                    className="w-8 h-8 rounded-xl flex items-center justify-center text-content-subtle hover:text-danger hover:bg-danger/10 active:scale-90 transition-all">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    <div className="pt-2">
                                        <div>
                                            <label className="text-[9px] font-black uppercase tracking-widest text-content-subtle">Entrega o nota (opcional)</label>
                                            <input
                                                value={delivery}
                                                onChange={e => setDelivery(e.target.value)}
                                                placeholder="Dirección, hora, retiro en tienda..."
                                                className="w-full h-11 mt-1.5 px-3.5 rounded-2xl bg-surface-2 dark:bg-white/5 border border-border dark:border-white/10 text-[12px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 placeholder:text-content-subtle"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="px-5 py-4 border-t border-border dark:border-white/5 space-y-3">
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Total</span>
                                        <div className="text-right">
                                            <div className="text-base font-black text-content dark:text-white tabular-nums">{fmt(cartTotal, baseCur)}</div>
                                            {altCur && (
                                                <div className="text-[11px] font-black text-content-muted tabular-nums">{fmt(cartTotal, altCur)}</div>
                                            )}
                                        </div>
                                    </div>

                                    {sendError && (
                                        <p className="text-[10px] font-bold text-danger leading-relaxed">{sendError}</p>
                                    )}

                                    {/* Vaciar al lado y no debajo, pero secundario: mismo alto para que
                                la fila se lea pareja, y sin relleno de color para que no compita
                                con la acción principal ni se pulse por inercia. */}
                                    <div className="flex items-stretch gap-2">
                                        <button
                                            onClick={clearCart}
                                            disabled={sending}
                                            title="Vaciar pedido"
                                            className="shrink-0 h-11 px-4 rounded-2xl border border-danger/30 text-danger flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-widest hover:bg-danger/10 active:scale-95 transition-all disabled:opacity-40"
                                        >
                                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            <span className="hidden sm:inline">Vaciar</span>
                                        </button>
                                        <button
                                            onClick={onSubmit}
                                            disabled={!canSubmit || sending}
                                            className="flex-1 h-11 rounded-2xl bg-brand-500 text-black text-[12px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-40"
                                        >
                                            {sending ? "Enviando..." : "Realizar pedido"}
                                        </button>
                                    </div>

                                    <p className="text-center text-[10px] font-bold text-content-subtle">
                                        {canSubmit ? "Sujeto a confirmación de la tienda" : "Completa cédula, nombre y teléfono"}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
    );
}
