import { fmtMoney } from "../helpers";

export default function HeldCartsModal({ open, onClose, carts, onTake, onRemove, onAcceptOrder, baseCurrency }) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-in zoom-in-95 slide-in-from-bottom-3 duration-200 ease-out">

                {/* Header */}
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-surface-1 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2m9-.828l-1.414-1.414M3.707 18.293V21h2.707l14.586-14.586a2 2 0 10-2.828-2.828L3.707 18.293z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-sm font-black tracking-tight text-content dark:text-white uppercase">Ventas en Espera</h2>
                            <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Cuentas pausadas y pedidos del catálogo</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-2 dark:bg-white/5 flex items-center justify-center hover:bg-danger hover:text-white transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
                    {carts.length === 0 ? (
                        <div className="h-40 flex flex-col items-center justify-center opacity-20 gap-3">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            <span className="text-xs font-black uppercase tracking-widest text-center">No hay cuentas en espera</span>
                        </div>
                    ) : (
                        carts.map(c => {
                            // Las cuentas vienen del servidor (ventas con status 'espera'),
                            // así que el total ya viene calculado y no hay que rearmarlo.
                            const total = parseFloat(c.total || 0);
                            const sym = c.currency_symbol || baseCurrency?.symbol || "Ref.";
                            // Un pedido del catálogo todavía no descontó inventario: no se puede
                            // llevar al carrito sin aceptarlo primero, porque el cobro daría por
                            // hecho que la mercancía ya salió.
                            const isWebOrder = c.status === "pedido";

                            return (
                                <div key={c.id} className={`px-4 py-3 rounded-2xl border flex items-center gap-4 group transition-all ${
                                    isWebOrder
                                        ? "bg-info/[0.06] border-info/25 hover:border-info/50"
                                        : "bg-surface-1 dark:bg-white/[0.03] border-black/5 dark:border-white/5 hover:border-brand-500/30"
                                }`}>
                                    <div className="w-10 h-10 rounded-xl bg-surface-2 dark:bg-black/20 flex flex-col items-center justify-center text-center shrink-0">
                                        <span className="text-[9px] font-black leading-none opacity-40">{new Date(c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        <span className={`text-xs font-black ${isWebOrder ? "text-info" : "text-brand-500"}`}>{c.items.length}</span>
                                        <span className="text-[7px] font-black uppercase opacity-40">items</span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            {isWebOrder && (
                                                <span className="text-[8px] font-black uppercase tracking-widest bg-info text-white px-1.5 py-0.5 rounded shrink-0">
                                                    Web
                                                </span>
                                            )}
                                            {/* Se muestra el nombre de la ficha, no el que el cliente
                                                tecleó: es el que va a salir en la factura. */}
                                            <span className={`text-[9px] font-black uppercase tracking-widest truncate ${isWebOrder ? "text-info" : "text-brand-500"}`}>
                                                {c.customer_name || c.web_customer_name || "Cliente General"}
                                            </span>
                                        </div>
                                        {/* En un pedido web lo útil es a quién facturar y cómo
                                            contactarlo; en una cuenta de caja, quién la abrió. */}
                                        {isWebOrder ? (
                                            <>
                                                <div className="text-[9px] font-bold text-content-subtle truncate tabular-nums">
                                                    {[c.customer_rif, c.web_customer_phone].filter(Boolean).join(" · ")}
                                                </div>
                                                {c.web_note && (
                                                    <div className="text-[9px] font-bold text-content-subtle truncate" title={c.web_note}>
                                                        {c.web_note}
                                                    </div>
                                                )}
                                            </>
                                        ) : c.employee_name && (
                                            <div className="text-[9px] font-bold text-content-subtle uppercase truncate">
                                                Abrió: {c.employee_name}
                                            </div>
                                        )}
                                        <div className="text-base font-black tracking-tight text-content dark:text-white truncate tabular-nums">
                                            {fmtMoney(total, sym)}
                                        </div>
                                    </div>

                                    {/* Los pedidos web muestran sus acciones siempre: llegan solos y
                                        hay que verlos, no descubrirlos pasando el cursor. */}
                                    <div className={`flex items-center gap-1.5 transition-all ${isWebOrder ? "" : "opacity-0 group-hover:opacity-100"}`}>
                                        <button
                                            onClick={() => onRemove(c.id)}
                                            className="w-8 h-8 rounded-lg bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all flex items-center justify-center"
                                            title={isWebOrder ? "Rechazar pedido" : "Eliminar"}
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                        {isWebOrder ? (
                                            <button
                                                onClick={() => onAcceptOrder(c.id)}
                                                className="px-4 h-8 rounded-lg bg-info text-white font-black text-[10px] uppercase tracking-widest hover:brightness-110 shadow-lg shadow-info/20 transition-all flex items-center gap-1.5"
                                                title="Descuenta el inventario y lo pasa a cuentas en espera"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                Aceptar
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => onTake(c.id)}
                                                className="px-4 h-8 rounded-lg bg-brand-500 text-brand-900 font-black text-[10px] uppercase tracking-widest hover:bg-brand-600 shadow-lg shadow-brand-500/20 transition-all flex items-center gap-1.5"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                Recuperar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {carts.length > 0 && (
                    <div className="px-5 py-3 bg-surface-2 dark:bg-white/[0.01] border-t border-border/20 dark:border-white/5 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-content-subtle">
                            Guardadas en el servidor · visibles desde cualquier caja
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
