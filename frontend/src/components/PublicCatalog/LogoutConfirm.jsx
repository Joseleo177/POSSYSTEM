// Confirmación al cerrar sesión con el carrito lleno.
//
// Salir olvida la identidad y la tienda elegida, y el carrito se va con ellas: lo que había
// dentro era stock de esa sucursal. Como es una pérdida que el cliente no espera, se avisa
// antes en lugar de vaciarlo en silencio. Sin nada en el carrito no aparece: no habría nada
// que perder y sería un paso de más.
export default function LogoutConfirm({ open, itemCount, onConfirm, onCancel }) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative w-full sm:max-w-xs bg-surface dark:bg-surface-dark-2 rounded-t-3xl sm:rounded-3xl border-t sm:border border-border dark:border-white/10 shadow-2xl z-10 p-5 space-y-4 animate-in fade-in slide-in-from-bottom-3 sm:zoom-in-95 duration-200">
                <div className="text-center space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-danger/10 text-danger flex items-center justify-center">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </div>
                    <h2 className="text-[13px] font-black uppercase tracking-tight text-content dark:text-white">
                        ¿Cerrar sesión?
                    </h2>
                    <p className="text-[11px] font-bold text-content-muted leading-relaxed">
                        Tienes {itemCount} producto{itemCount !== 1 ? "s" : ""} en el carrito. Al salir se vacía y
                        vuelves a elegir tienda al entrar.
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="flex-1 h-11 rounded-2xl border border-border dark:border-white/10 text-[11px] font-black uppercase tracking-widest text-content-muted hover:text-content dark:hover:text-white active:scale-95 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-[1.4] h-11 rounded-2xl bg-danger text-white text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all"
                    >
                        Salir igual
                    </button>
                </div>
            </div>
        </div>
    );
}