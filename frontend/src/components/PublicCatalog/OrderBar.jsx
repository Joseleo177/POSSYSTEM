// Barra flotante con el resumen del pedido. Solo aparece con carrito lleno y el panel cerrado;
// abrirlo la reemplaza.
export default function OrderBar({ visible, cart, cartTotal, fmt, baseCur, altCur, onOpen }) {
    if (!visible) return null;

    return (
                <div className="fixed bottom-0 inset-x-0 z-30 px-3 pb-3 pt-6 bg-gradient-to-t from-black/30 via-black/10 to-transparent pointer-events-none">
                    <button
                        onClick={() => onOpen()}
                        className="pointer-events-auto max-w-5xl mx-auto w-full h-14 rounded-2xl bg-brand-500 text-black shadow-2xl shadow-black/30 flex items-center gap-3 pl-3 pr-4 active:scale-[0.99] transition-transform"
                    >
                        {/* Carrito con su contador: el número suelto no decía de qué era */}
                        <span className="relative w-10 h-10 rounded-xl bg-black/10 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-black text-brand-500 text-[10px] font-black flex items-center justify-center tabular-nums">
                                {cart.length}
                            </span>
                        </span>

                        <span className="text-left leading-tight min-w-0">
                            <span className="block text-[12px] font-black uppercase tracking-widest">Ver mi pedido</span>
                            <span className="block text-[10px] font-bold opacity-70">
                                {cart.length === 1 ? "1 producto" : `${cart.length} productos`}
                            </span>
                        </span>

                        <span className="ml-auto flex items-center gap-1.5 shrink-0">
                            <span className="text-right leading-tight">
                                <span className="block text-[15px] font-black tabular-nums">{fmt(cartTotal, baseCur)}</span>
                                {altCur && (
                                    <span className="block text-[10px] font-bold tabular-nums opacity-70">{fmt(cartTotal, altCur)}</span>
                                )}
                            </span>
                            <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                        </span>
                    </button>
                </div>
    );
}
