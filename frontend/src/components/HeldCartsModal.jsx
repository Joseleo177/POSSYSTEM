import { fmtMoney } from "../helpers";

export default function HeldCartsModal({ open, onClose, carts, onTake, onRemove, baseCurrency }) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-white dark:bg-[#0c0c0c] rounded-3xl shadow-2xl border border-white/5 overflow-hidden flex flex-col max-h-[70vh]">

                {/* Header */}
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-surface-1 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500 border border-brand-500/20">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2m9-.828l-1.414-1.414M3.707 18.293V21h2.707l14.586-14.586a2 2 0 10-2.828-2.828L3.707 18.293z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-sm font-black tracking-tight text-content dark:text-white uppercase">Ventas en Espera</h2>
                            <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle opacity-40">Recupera o elimina carritos pausados</p>
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
                            const total = c.items.reduce((acc, i) => acc + (parseFloat(i.price) * i.qty), 0);
                            const sym = c.currency?.symbol || baseCurrency?.symbol || "$";

                            return (
                                <div key={c.id} className="bg-surface-1 dark:bg-white/[0.03] px-4 py-3 rounded-2xl border border-black/5 dark:border-white/5 flex items-center gap-4 group hover:border-brand-500/30 transition-all">
                                    <div className="w-10 h-10 rounded-xl bg-surface-2 dark:bg-black/20 flex flex-col items-center justify-center text-center shrink-0">
                                        <span className="text-[9px] font-black leading-none opacity-40">{new Date(c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        <span className="text-xs font-black text-brand-500">{c.items.length}</span>
                                        <span className="text-[7px] font-black uppercase opacity-40">items</span>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="text-[9px] font-black text-brand-500 uppercase tracking-widest opacity-60">
                                            {c.customer?.name || "Cliente General"}
                                        </div>
                                        <div className="text-base font-black tracking-tight text-content dark:text-white truncate tabular-nums">
                                            {fmtMoney(total, sym)}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                                        <button
                                            onClick={() => onRemove(c.id)}
                                            className="w-8 h-8 rounded-lg bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all flex items-center justify-center"
                                            title="Eliminar"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                        <button
                                            onClick={() => onTake(c.id)}
                                            className="px-4 h-8 rounded-lg bg-brand-500 text-brand-900 font-black text-[10px] uppercase tracking-widest hover:bg-brand-600 shadow-lg shadow-brand-500/20 transition-all flex items-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                            Recuperar
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {carts.length > 0 && (
                    <div className="px-5 py-3 bg-surface-1 dark:bg-white/[0.01] border-t border-white/5 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-30 italic">Las cuentas en espera se borran al recargar la página</p>
                    </div>
                )}
            </div>
        </div>
    );
}
