import { resolveImageUrl, imgRetryOnError, toNameCase } from "../../helpers";
import { isIntegerUnit, fmtQtyUnit } from "../../helpers/unitFormatter";
import { freeUnitsFor, lineTotalFor } from "../../helpers/promo";
import { Spinner } from "../ui/Spinner";
import { PlacedPaymentNote } from "./PaymentFields";
import { sheetSkin } from "./CatalogSheet";
import { useEffect, useRef, useState } from "react";
import CountUp, { IconoPapelera } from "./CountUp";
import Celebracion from "./Celebracion";

// Cuánto tarda una línea en irse: se desliza a un lado y la lista se cierra sobre su hueco.
// Recién al terminar se quita del carrito; si se quitara antes, la lista saltaría de golpe.
const SALIDA_MS = 340;

// Carrito del catálogo público, el mismo en los tres temas (antes cada tema tenía el suyo:
// OrderPanel en el estándar, uno propio en boutique). Va en el papel que diga el tema
// (`panelColor`): el panel de la carta en el menú, blanco en los otros dos.
//
// Segunda vuelta (29-10-2026, "no es algo que el cliente se meta y diga wao"): cada plato es
// una tarjeta con su foto, el contador es una píldora con el + en el color de la tienda, el
// vacío invita a volver a la carta y el pedido enviado se celebra —el visto se dibuja y suelta
// chispas— en vez de ser un párrafo con un icono.

const IconoBolsa = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12l-1 12.2a2 2 0 01-2 1.8H9a2 2 0 01-2-1.8L6 7z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 10V6a3 3 0 016 0v4" />
    </svg>
);

function PedidoEnviado({ placedOrder, store, identity, fmt, baseCur, altCur, waHref, onClose, onOpenMyOrders, skin, keepShoppingLabel }) {
    return (
        <div className="flex-1 overflow-y-auto px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
            <Celebracion />

            <div className="rise-in mt-6 space-y-1.5" style={{ "--i": 4 }}>
                <p className={`text-[13px] font-semibold text-emerald-700 tabular-nums`}>Pedido #{placedOrder.id}</p>
                <h3 className={`font-display text-[26px] font-bold tracking-tight ${skin.ink} leading-tight`}>¡Lo recibimos!</h3>
                <p className={`text-[14px] ${skin.muted} leading-relaxed max-w-[320px] mx-auto`}>
                    {store?.name || "La tienda"} ya lo tiene en su lista. Te contactarán
                    al <span className={`font-semibold ${skin.ink}`}>{identity?.phone}</span> para confirmarlo.
                </p>
            </div>

            <div className={`rise-in mt-5 ${skin.card} px-4 py-3 flex items-center justify-between gap-3 text-left`} style={{ "--i": 6 }}>
                <span className={`text-[13px] ${skin.subtle}`}>Total del pedido</span>
                <span className="text-right">
                    <span className={`block text-[20px] font-bold tabular-nums ${skin.ink} leading-tight`}>{fmt(placedOrder.total, baseCur)}</span>
                    {altCur && <span className={`block text-[12px] ${skin.subtle} tabular-nums`}>{fmt(placedOrder.total, altCur)}</span>}
                </span>
            </div>

            {placedOrder.payment && (
                <div className="rise-in mt-3" style={{ "--i": 7 }}>
                    <PlacedPaymentNote payment={placedOrder.payment} light />
                </div>
            )}

            <div className="rise-in mt-6 space-y-2" style={{ "--i": 8 }}>
                <button
                    type="button"
                    onClick={() => { onClose(); onOpenMyOrders(); }}
                    className={`w-full h-12 flex items-center justify-center gap-2 active:scale-[0.99] transition-all ${skin.primary}`}
                >
                    Seguir mi pedido
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14m-6-6l6 6-6 6" /></svg>
                </button>
                {waHref && (
                    <a
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-12 rounded-full bg-[#25D366] text-white text-[14px] font-semibold flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.99] transition-all"
                    >
                        <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.886-9.885 9.886m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488" /></svg>
                        Escribir a la tienda
                    </a>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    className={`w-full h-11 rounded-full text-[14px] font-medium ${skin.subtle} hover:text-neutral-900 transition-colors`}
                >
                    {keepShoppingLabel}
                </button>
            </div>
        </div>
    );
}

export default function CartDrawer({
    open, onClose,
    cart, cartTotal, identity, store,
    changeQty, setQtyDirect, handleQtyBlur, removeFromCart, clearCart,
    delivery, setDelivery, usesCheckout,
    fmt, baseCur, altCur,
    canSubmit, onSubmit, sending, sendError,
    placedOrder, waHref, onOpenMyOrders,
    panelColor, keepShoppingLabel = "Seguir comprando",
}) {
    const [saliendo, setSaliendo] = useState(() => new Set());
    const timers = useRef([]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    // Quitar con salida animada. `fin` es lo que de verdad lo quita (una línea o todas).
    const despedir = (ids, fin) => {
        setSaliendo((prev) => new Set([...prev, ...ids]));
        timers.current.push(setTimeout(() => {
            fin();
            setSaliendo((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
        }, SALIDA_MS + (ids.length > 1 ? Math.min(ids.length, 8) * 40 : 0)));
    };
    const quitar = (id) => despedir([id], () => removeFromCart(id));
    // El "−" sobre la última unidad también se despide: es quitar, no restar.
    const restar = (it) => {
        const paso = isIntegerUnit(it.unit) ? 1 : 0.5;
        if ((parseFloat(it.qty) || 0) - paso <= 0) quitar(it.id);
        else changeQty(it.id, -1);
    };
    const vaciar = () => despedir(cart.map((it) => it.id), clearCart);

    if (!open) return null;
    const skin = sheetSkin(panelColor || "#FFFFFF");
    const unidades = cart.length;

    return (
        <div className="fixed inset-0 z-40 flex justify-end">
            <div className="absolute inset-0 bg-black/65 backdrop-blur-[3px] catalog-overlay-in" onClick={onClose} />

            <aside
                className="relative w-full sm:max-w-[420px] h-full flex flex-col shadow-2xl catalog-drawer-in sm:rounded-l-[28px] overflow-hidden"
                style={skin.style}
            >
                <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        {!placedOrder && (
                            <div className={`w-11 h-11 shrink-0 flex items-center justify-center ${skin.iconTile}`}>
                                <IconoBolsa className="w-5 h-5" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <h2 className={`${skin.title} ${skin.ink} leading-tight`}>
                                {placedOrder ? "Pedido enviado" : "Tu pedido"}
                            </h2>
                            {!placedOrder && (
                                <p className={`text-[12px] ${skin.subtle} truncate mt-0.5`}>
                                    {unidades > 0
                                        ? `${unidades} ${unidades === 1 ? "producto" : "productos"}${identity ? ` · ${toNameCase(identity.name)}` : ""}`
                                        : identity ? `A nombre de ${toNameCase(identity.name)}` : "Todavía vacío"}
                                </p>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar"
                        className={`shrink-0 w-9 h-9 flex items-center justify-center transition-colors ${skin.iconBtn}`}
                    >
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {placedOrder ? (
                    <PedidoEnviado
                        placedOrder={placedOrder} store={store} identity={identity}
                        fmt={fmt} baseCur={baseCur} altCur={altCur} waHref={waHref}
                        onClose={onClose} onOpenMyOrders={onOpenMyOrders} skin={skin} keepShoppingLabel={keepShoppingLabel}
                    />
                ) : (
                    <>
                        <div className="flex-1 overflow-y-auto px-4">
                            {cart.length === 0 ? (
                                <div className="py-16 px-4 text-center">
                                    <div className="relative w-20 h-20 mx-auto">
                                        <span className="absolute inset-0 rounded-[28px] bg-brand-500/10 rotate-6" aria-hidden="true" />
                                        <span className="absolute inset-0 rounded-[28px] bg-white ring-1 ring-black/[0.05] flex items-center justify-center text-brand-500">
                                            <IconoBolsa className="w-9 h-9" />
                                        </span>
                                    </div>
                                    <p className={`mt-5 font-display text-[18px] font-semibold ${skin.ink}`}>Tu pedido está vacío</p>
                                    <p className={`text-[13px] ${skin.subtle} mt-1`}>Toca el + de lo que se te antoje y aparecerá aquí.</p>
                                    <button type="button" onClick={onClose}
                                        className={`mt-5 h-11 px-6 inline-flex items-center gap-2 transition-all ${skin.secondary}`}>
                                        Ver la carta
                                    </button>
                                </div>
                            ) : (
                                <ul className="pb-3">
                                    {cart.map((it, i) => {
                                        const fuera = saliendo.has(it.id);
                                        return (
                                        // La fila se cierra con grid-template-rows (1fr → 0fr), que
                                        // anima la altura real sin medirla; el espacio entre líneas va
                                        // DENTRO (pb), para que también se cierre y no quede un hueco.
                                        <li key={it.id}
                                            className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                                            style={{ gridTemplateRows: fuera ? "0fr" : "1fr", transitionDelay: fuera && saliendo.size > 1 ? `${Math.min(i, 8) * 40}ms` : "0ms" }}>
                                        <div className="min-h-0 overflow-hidden">
                                        {/* La entrada (rise-in) va en esta capa y la salida en la de
                                            adentro: una animación con fill fija el transform y taparía
                                            la transición de salida si fueran en el mismo elemento. */}
                                        <div className="pb-2.5 rise-in" style={{ "--i": Math.min(i, 8) }}>
                                        <div style={{ transitionDelay: fuera && saliendo.size > 1 ? `${Math.min(i, 8) * 40}ms` : "0ms" }}
                                            className={`${skin.card} p-3 flex gap-3 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${fuera ? "-translate-x-10 opacity-0 scale-[0.97]" : ""}`}>
                                            <div className="w-[72px] h-[72px] shrink-0 rounded-2xl bg-black/5 overflow-hidden relative">
                                                {it.image_url ? (
                                                    <img src={resolveImageUrl(it.image_url)} alt="" onError={imgRetryOnError}
                                                        className="absolute inset-0 w-full h-full object-cover" />
                                                ) : (
                                                    <div className="absolute inset-0 flex items-center justify-center font-display text-2xl font-bold text-brand-500/50">
                                                        {it.name.charAt(0)}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start gap-2">
                                                    <h3 className={`flex-1 text-[14px] font-semibold ${skin.ink} leading-snug line-clamp-2`}>
                                                        {it.name}
                                                    </h3>
                                                    <button
                                                        type="button"
                                                        onClick={() => quitar(it.id)}
                                                        disabled={fuera}
                                                        aria-label={`Quitar ${it.name}`}
                                                        className="group/trash shrink-0 -mt-1 -mr-1 w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-red-600 hover:bg-red-500/[0.08] active:scale-90 transition-[color,background-color,transform]"
                                                    >
                                                        <IconoPapelera />
                                                    </button>
                                                </div>

                                                {it.options?.length > 0 && (
                                                    <p className={`text-[12px] ${skin.muted} mt-0.5 leading-snug`}>
                                                        {it.options.map(o => (o.price > 0 ? `+ ${o.name}` : o.name)).join(" · ")}
                                                    </p>
                                                )}
                                                {it.note && (
                                                    <p className="text-[12px] text-brand-600 italic mt-0.5 leading-snug">
                                                        "{it.note}"
                                                    </p>
                                                )}
                                                {freeUnitsFor(it) > 0 && (
                                                    <p className="text-[12px] font-semibold text-emerald-700 mt-0.5">
                                                        +{freeUnitsFor(it)} gratis por la promo
                                                    </p>
                                                )}
                                                {!isIntegerUnit(it.unit) && (
                                                    <p className={`text-[12px] ${skin.subtle} mt-0.5`}>{fmtQtyUnit(it.qty || 0, it.unit)}</p>
                                                )}

                                                <div className="flex items-center justify-between gap-2 mt-2">
                                                    <div className="flex items-center rounded-full bg-white ring-1 ring-black/[0.08] p-0.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => restar(it)}
                                                            aria-label="Quitar uno"
                                                            className="w-8 h-8 rounded-full text-neutral-700 hover:bg-black/5 active:scale-90 transition-all flex items-center justify-center"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={3} d="M5 12h14" /></svg>
                                                        </button>
                                                        <input
                                                            type="number"
                                                            inputMode={isIntegerUnit(it.unit) ? "numeric" : "decimal"}
                                                            step={isIntegerUnit(it.unit) ? "1" : "any"}
                                                            min="0"
                                                            value={it.qty}
                                                            onChange={e => setQtyDirect(it.id, e.target.value)}
                                                            onBlur={() => handleQtyBlur(it.id, it.unit)}
                                                            aria-label={`Cantidad de ${it.name}`}
                                                            className="w-9 bg-transparent text-center text-[14px] font-bold border-none outline-none text-neutral-900 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none tabular-nums"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => changeQty(it.id, +1)}
                                                            aria-label="Agregar uno"
                                                            className="w-8 h-8 rounded-full bg-brand-500 text-brand-ink hover:brightness-110 active:scale-90 transition-all flex items-center justify-center"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={3} d="M12 5v14M5 12h14" /></svg>
                                                        </button>
                                                    </div>

                                                    <CountUp value={lineTotalFor(it)} format={(v) => fmt(v, baseCur)} className={`text-[15px] font-bold ${skin.ink}`} />
                                                </div>
                                            </div>
                                        </div>
                                        </div>
                                        </div>
                                        </li>
                                        );
                                    })}
                                </ul>
                            )}

                            {/* Con entrega o pago configurados, la nota va en el paso final. */}
                            {cart.length > 0 && !usesCheckout && (
                                <label className="block pb-4 space-y-1.5">
                                    <span className="flex items-center justify-between">
                                        <span className={skin.label}>Entrega o nota</span>
                                        <span className={`text-[12px] ${skin.subtle}`}>Opcional</span>
                                    </span>
                                    <input
                                        value={delivery}
                                        onChange={e => setDelivery(e.target.value)}
                                        placeholder="Mesa, dirección, retiro en local..."
                                        autoComplete="off"
                                        className={skin.field}
                                    />
                                </label>
                            )}
                        </div>

                        {cart.length > 0 && (
                            <div className={`px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t ${skin.line} bg-white/50 space-y-3`}>
                                <div className="flex items-baseline justify-between">
                                    <span className={`text-[14px] font-semibold ${skin.ink}`}>Subtotal</span>
                                    <div className="text-right">
                                        <CountUp value={cartTotal} format={(v) => fmt(v, baseCur)} className={`block text-[22px] font-bold ${skin.ink} leading-none tracking-tight`} />
                                        {altCur && (
                                            <div className={`text-[12px] ${skin.subtle} tabular-nums mt-1`}>
                                                {fmt(cartTotal, altCur)}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <p className={`text-[12px] ${skin.subtle} leading-relaxed`}>
                                    {canSubmit
                                        ? (usesCheckout ? "En el siguiente paso eliges cómo lo recibes y cómo pagas." : "Al enviarlo, la tienda lo confirma y te contacta para coordinar el pago y la entrega.")
                                        : "Completa cédula, nombre y teléfono para poder enviarlo."}
                                </p>

                                {sendError && (
                                    <p className="text-[13px] font-medium text-red-600 leading-relaxed">{sendError}</p>
                                )}

                                <button
                                    type="button"
                                    onClick={onSubmit}
                                    disabled={!canSubmit || sending}
                                    className={`w-full h-14 flex items-center justify-between px-6 active:scale-[0.99] transition-all disabled:opacity-40 ${skin.primary}`}
                                >
                                    <span className="flex items-center gap-2">
                                        {sending && <Spinner />}
                                        {sending ? "Enviando..." : usesCheckout ? "Continuar" : "Enviar pedido"}
                                    </span>
                                    {!sending && (
                                        <span className="flex items-center gap-2 tabular-nums">
                                            {fmt(cartTotal, baseCur)}
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14m-6-6l6 6-6 6" /></svg>
                                        </span>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={vaciar}
                                    disabled={sending}
                                    className={`w-full h-9 text-[13px] font-medium ${skin.subtle} hover:text-red-600 transition-colors disabled:opacity-40`}
                                >
                                    Vaciar el pedido
                                </button>
                            </div>
                        )}
                    </>
                )}
            </aside>
        </div>
    );
}
