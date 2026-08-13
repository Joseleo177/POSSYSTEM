import { STAGE_STYLES, fmtQty } from "./shared";

// Desglose completo de un pedido ya enviado: estado, factura asociada si la tiene, líneas
// con precio unitario y subtotal, y el total en ambas monedas.
export default function OrderDetailModal({ order, onClose, fmt, baseCur, altCur }) {
    if (!order) return null;
    const style = STAGE_STYLES[order.stage] || STAGE_STYLES.enviado;
    const formattedDate = order.created_at 
        ? new Date(order.created_at).toLocaleDateString("es-VE", { day: "2-digit", month: "long", year: "numeric" })
        : "Fecha desconocida";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg max-h-[90vh] bg-surface dark:bg-surface-dark-2 rounded-3xl border border-border dark:border-white/10 overflow-hidden shadow-2xl flex flex-col z-10 animate-in fade-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="px-5 pt-5 pb-4 border-b border-border dark:border-white/5 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <div className="min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle block">
                                Detalle de Venta
                            </span>
                            <h2 className="text-base font-black uppercase tracking-tight text-content dark:text-white truncate">
                                Orden #{order.id}
                            </h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${style}`}>
                            {order.stage_label}
                        </span>
                        <button onClick={onClose} className="p-1.5 -mr-1 text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Body / Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Meta info grid */}
                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="bg-surface-2 dark:bg-white/5 border border-border dark:border-white/5 rounded-2xl p-3 space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-content-subtle block">Fecha</span>
                            <span className="text-xs font-bold text-content dark:text-white capitalize block">{formattedDate}</span>
                        </div>
                        <div className="bg-surface-2 dark:bg-white/5 border border-border dark:border-white/5 rounded-2xl p-3 space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-content-subtle block">Factura</span>
                            <span className="text-xs font-bold text-content dark:text-white block">{order.invoice_number ? `Factura ${order.invoice_number}` : "S/F"}</span>
                        </div>
                        <div className="bg-surface-2 dark:bg-white/5 border border-border dark:border-white/5 rounded-2xl p-3 space-y-1 col-span-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-content-subtle block">Estado</span>
                            <span className="text-xs font-bold text-content dark:text-white leading-relaxed block">{order.stage_detail}</span>
                        </div>
                    </div>

                    {/* Table of items */}
                    {order.items && order.items.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-content-subtle px-1">
                                <span>Productos ({order.items.length})</span>
                            </div>
                            <div className="rounded-2xl border border-border dark:border-white/10 bg-surface-2 dark:bg-white/[0.02] overflow-hidden divide-y divide-border/40 dark:divide-white/5">
                                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-content-subtle bg-surface/50 dark:bg-white/5">
                                    <span className="col-span-6">Producto</span>
                                    <span className="col-span-2 text-center">Cant.</span>
                                    <span className="col-span-2 text-right">P. Unit</span>
                                    <span className="col-span-2 text-right">Subtotal</span>
                                </div>
                                {order.items.map((it, idx) => {
                                    const hasPrice = Number.isFinite(it.price);
                                    const subtotal = Number.isFinite(it.subtotal) ? it.subtotal : (hasPrice ? it.price * it.quantity : null);
                                    return (
                                        <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-xs">
                                            <span className="col-span-6 font-black uppercase tracking-tight text-content dark:text-white truncate">
                                                {it.name}
                                            </span>
                                            <span className="col-span-2 font-bold text-center text-content dark:text-white tabular-nums">
                                                {fmtQty(it.quantity)}
                                            </span>
                                            <span className="col-span-2 text-right text-content-subtle tabular-nums font-bold text-[11px]">
                                                {hasPrice ? fmt(it.price, baseCur) : "-"}
                                            </span>
                                            <span className="col-span-2 text-right font-black text-content dark:text-white tabular-nums text-[11px]">
                                                {subtotal != null ? fmt(subtotal, baseCur) : "-"}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Total */}
                <div className="px-5 py-4 border-t border-border dark:border-white/5 bg-surface-2 dark:bg-white/5 flex items-center justify-between shrink-0">
                    <span className="text-[11px] font-black uppercase tracking-widest text-content-subtle">Total del Pedido</span>
                    <div className="text-right">
                        <div className="text-lg font-black text-brand-500 tabular-nums">
                            {order.total != null ? fmt(order.total, baseCur) : "-"}
                        </div>
                        {altCur && order.total != null && (
                            <div className="text-[11px] font-black text-content-muted tabular-nums">
                                {fmt(order.total, altCur)}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

