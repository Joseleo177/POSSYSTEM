import { STAGE_STYLES, fmtQty } from "./shared";

// Tarjeta de un pedido en "Mis pedidos". Resume estado, contenido y total; al tocarla se
// abre OrderDetailModal con el desglose completo.
export default function OrderCard({ order, fmt, baseCur, onSelect }) {
    const style = STAGE_STYLES[order.stage] || STAGE_STYLES.enviado;
    const itemsCount = order.items?.length || 0;
    const summary = order.items?.map(i => `${fmtQty(i.quantity)} × ${i.name}`).join(", ");

    return (
        <div
            onClick={() => onSelect(order)}
            className="w-full text-left p-3.5 rounded-2xl border border-border dark:border-white/10 bg-surface-2 dark:bg-white/[0.03] hover:bg-brand-500/5 hover:border-brand-500/30 transition-all cursor-pointer space-y-2 group"
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-black uppercase tracking-tight text-content dark:text-white group-hover:text-brand-500 transition-colors">
                    Pedido #{order.id}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wide shrink-0 ${style}`}>
                    {order.stage_label}
                </span>
            </div>

            {summary && (
                <p className="text-[11px] font-bold text-content-muted line-clamp-1">
                    {summary}
                </p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 dark:border-white/5 text-[11px]">
                <span className="font-bold text-content-subtle">
                    {order.created_at ? new Date(order.created_at).toLocaleDateString("es-VE", { day: "2-digit", month: "short" }) : "Sin fecha"}
                    {itemsCount > 0 ? ` · ${itemsCount} ${itemsCount === 1 ? 'item' : 'items'}` : ''}
                </span>
                <div className="flex items-center gap-1 font-black text-content dark:text-white tabular-nums">
                    {order.total != null ? fmt(order.total, baseCur) : "-"}
                    <svg className="w-3.5 h-3.5 text-content-subtle group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                </div>
            </div>
        </div>
    );
}

