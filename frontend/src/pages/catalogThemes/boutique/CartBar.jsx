// Barra flotante del pedido, propia del tema boutique.
//
// La compartida (components/PublicCatalog/OrderBar) es un banner recto de punta a punta con
// texto negro sobre el color de marca — texto negro que se pensó para el rojo del tema
// estándar, y que con un color claro o frío como el turquesa que elige esta tienda pierde
// contraste. Aquí es una píldora flotante y centrada, blanco sobre el color de marca como el
// resto de los botones del tema (el de "Agregar al carrito" ya usa esa combinación), así que
// no desentona con nada más de la vitrina.
export default function CartBar({ visible, cart, cartTotal, fmt, baseCur, altCur, onOpen }) {
    if (!visible) return null;

    return (
        <div className="fixed bottom-0 inset-x-0 z-30 px-4 pb-4 pt-10 bg-gradient-to-t from-black/25 via-black/5 to-transparent pointer-events-none flex justify-center">
            <button
                onClick={onOpen}
                className="pointer-events-auto w-full max-w-md h-14 rounded-full bg-brand-500 text-white shadow-xl shadow-black/20 flex items-center gap-3 pl-3 pr-4 active:scale-[0.98] hover:brightness-110 transition-all"
            >
                <span className="relative w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-white text-brand-500 text-[9px] font-black flex items-center justify-center tabular-nums">
                        {cart.length}
                    </span>
                </span>

                <span className="text-left leading-tight min-w-0">
                    <span className="block text-[11px] font-bold uppercase tracking-widest">Ver pedido</span>
                    <span className="block text-[10px] font-medium opacity-80">
                        {cart.length === 1 ? "1 producto" : `${cart.length} productos`}
                    </span>
                </span>

                <span className="ml-auto flex items-center gap-1.5 shrink-0">
                    <span className="text-right leading-tight">
                        <span className="block text-[15px] font-black tabular-nums">{fmt(cartTotal, baseCur)}</span>
                        {altCur && (
                            <span className="block text-[10px] font-medium tabular-nums opacity-80">{fmt(cartTotal, altCur)}</span>
                        )}
                    </span>
                    <svg className="w-4 h-4 shrink-0 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                </span>
            </button>
        </div>
    );
}
