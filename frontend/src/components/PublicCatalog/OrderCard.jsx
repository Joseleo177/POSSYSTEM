import { STAGE_TONE, fmtQty } from "./shared";
import { toNameCase } from "../../helpers";
import Money from "../ui/Money";

// Estado de un pedido: punto (o visto, si está pagado) y el texto en su color. Se exporta para
// que el detalle del pedido lo pinte igual que la lista.
export function StageMark({ stage, label }) {
    const t = STAGE_TONE[stage] || STAGE_TONE.enviado;
    return (
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap ${t.text}`}>
            {t.check ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            ) : (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />
            )}
            {label}
        </span>
    );
}

// Fila de un pedido en "Mis pedidos": tres renglones que se leen de un vistazo —qué pedido y
// en qué va, qué se pidió, y cuándo y cuánto—. Al tocarla se abre OrderDetailModal con el
// desglose completo.
export default function OrderCard({ order, fmt, baseCur, onSelect }) {
    const itemsCount = order.items?.length || 0;
    const summary = order.items?.map(i => `${fmtQty(i.quantity)} × ${toNameCase(i.name)}`).join(", ");
    const fecha = order.created_at
        ? new Date(order.created_at).toLocaleDateString("es-VE", { day: "numeric", month: "short" }).replace(".", "")
        : "Sin fecha";

    return (
        <button
            type="button"
            onClick={() => onSelect(order)}
            className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-surface-2/70 dark:hover:bg-white/[0.03] active:bg-surface-2 transition-colors"
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-semibold text-content dark:text-white tabular-nums">Pedido #{order.id}</span>
                    <StageMark stage={order.stage} label={order.stage_label} />
                </div>
                {summary && (
                    <p className="mt-0.5 text-[13px] text-content-muted dark:text-white/70 line-clamp-1">{summary}</p>
                )}
                <div className="mt-1 flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-content-subtle tabular-nums">
                        {fecha}{itemsCount > 0 ? ` · ${itemsCount} ${itemsCount === 1 ? "producto" : "productos"}` : ""}
                    </span>
                    {order.total != null
                        ? <Money value={fmt(order.total, baseCur)} className="text-[13px] font-semibold text-content dark:text-white" />
                        : <span className="text-content-subtle">—</span>}
                </div>
            </div>
            <svg className="w-4 h-4 shrink-0 text-content-subtle/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
    );
}
