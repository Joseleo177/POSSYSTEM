import { useEffect, useRef, useState } from "react";
import { resolveImageUrl } from "../../helpers";
import { CART_BUMP_EVENT, CART_TARGET_ATTR } from "./flyToCart";

// Carrito flotante: la burbuja de abajo a la derecha, como la de WhatsApp, que sigue al cliente
// mientras recorre la carta. Vacío es solo el icono; con algo dentro se estira en una píldora
// con el total, que es lo que el cliente quiere tener a la vista mientras elige.
//
// Recibe los platos que "vuelan" desde la ficha (ver flyToCart): al llegar rebota, el número
// salta y asoma un aviso con la foto y el nombre de lo que entró. Las tres cosas dicen lo
// mismo —"ya está en tu pedido"— a quien mira la burbuja, el número o el aviso.
//
// Va por DEBAJO de los modales (z-30): la ficha del plato la tapa mientras está abierta y, al
// cerrarse, el plato cae sobre ella. Si se ocultara con los modales, el vuelo no tendría a
// dónde llegar.
export default function FloatingCart({ count, total, fmt, baseCur, onOpen }) {
    const btnRef = useRef(null);
    const [aviso, setAviso] = useState(null);
    const timer = useRef(null);

    useEffect(() => {
        const onBump = (e) => {
            const el = btnRef.current;
            if (el) {
                // Quitar y volver a poner la clase reinicia la animación aunque llegue otro
                // plato antes de que termine la anterior.
                el.classList.remove("cart-bump");
                void el.offsetWidth;
                el.classList.add("cart-bump");
            }
            if (e.detail?.name) {
                setAviso({ ...e.detail, key: Date.now() });
                clearTimeout(timer.current);
                timer.current = setTimeout(() => setAviso(null), 2400);
            }
        };
        window.addEventListener(CART_BUMP_EVENT, onBump);
        return () => { window.removeEventListener(CART_BUMP_EVENT, onBump); clearTimeout(timer.current); };
    }, []);

    const lleno = count > 0;

    return (
        <div className="fixed z-30 right-4 sm:right-6 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6 flex items-center gap-2.5 pointer-events-none">
            {aviso && (
                <div key={aviso.key} role="status"
                    className="cart-toast-in pointer-events-auto max-w-[calc(100vw-13rem)] sm:max-w-[280px] min-w-0 flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-2xl bg-white text-neutral-900 shadow-[0_12px_32px_-8px_rgba(0,0,0,.45)]">
                    <span className="w-9 h-9 rounded-xl overflow-hidden bg-brand-500/10 shrink-0 flex items-center justify-center">
                        {aviso.image_url
                            ? <img src={resolveImageUrl(aviso.image_url)} alt="" className="w-full h-full object-cover" />
                            : <svg className="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </span>
                    <span className="min-w-0 leading-tight">
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 whitespace-nowrap">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>
                            Agregado
                        </span>
                        <span className="block text-[13px] font-semibold truncate">
                            {aviso.qty > 1 ? `${aviso.qty} × ` : ""}{aviso.name}
                        </span>
                    </span>
                </div>
            )}

            <button
                ref={btnRef}
                type="button"
                onClick={onOpen}
                {...{ [CART_TARGET_ATTR]: "" }}
                aria-label={lleno ? `Ver mi pedido, ${count} ${count === 1 ? "producto" : "productos"}` : "Ver mi pedido"}
                className={`fab-in pointer-events-auto relative h-14 rounded-full bg-brand-500 text-brand-ink flex items-center ring-1 ring-white/15 shadow-[0_14px_34px_-8px_rgba(0,0,0,.6)] hover:brightness-110 active:scale-95 transition-[filter,transform] ${lleno ? "pl-2 pr-5 gap-3" : "w-14 justify-center"}`}
                style={{ backgroundImage: "linear-gradient(to bottom, rgb(255 255 255 / .18), rgb(255 255 255 / 0))" }}
            >
                <span className={`relative flex items-center justify-center shrink-0 ${lleno ? "w-10 h-10 rounded-full bg-black/15" : ""}`}>
                    <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12l-1 12.2a2 2 0 01-2 1.8H9a2 2 0 01-2-1.8L6 7z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 10V6a3 3 0 016 0v4" />
                    </svg>
                    {lleno && (
                        <span key={count}
                            className="badge-pop absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-brand-600 text-[11px] font-bold flex items-center justify-center tabular-nums shadow">
                            {count}
                        </span>
                    )}
                </span>
                {lleno && (
                    <span className="text-left leading-tight">
                        <span className="block text-[11px] font-medium opacity-85">Ver mi pedido</span>
                        <span className="block text-[16px] font-bold tabular-nums">{fmt(total, baseCur)}</span>
                    </span>
                )}
            </button>
        </div>
    );
}
