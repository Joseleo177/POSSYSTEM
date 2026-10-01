import { fmtQty } from "./shared";
import { StageMark } from "./OrderCard";
import { toNameCase } from "../../helpers";
import Money from "../ui/Money";

// Desglose completo de un pedido ya enviado: estado, factura asociada si la tiene, líneas
// con precio unitario y subtotal, y el total en ambas monedas.
//
// Las líneas van en dos renglones (nombre y subtotal; cantidad × precio) en vez de una tabla
// de cuatro columnas: en el teléfono la tabla cortaba el nombre del producto, que es justo lo
// que el cliente quiere comprobar.
export default function OrderDetailModal({ order, onClose, fmt, baseCur, altCur }) {
    if (!order) return null;
    const fecha = order.created_at
        ? new Date(order.created_at).toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })
        : "Fecha desconocida";
    const items = order.items || [];

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
            <div className="relative w-full sm:max-w-lg max-h-[90vh] bg-surface dark:bg-surface-dark-2 rounded-t-3xl sm:rounded-2xl border-t sm:border border-border/60 dark:border-white/10 overflow-hidden shadow-2xl flex flex-col z-10">
                <div className="sm:hidden pt-2.5 flex justify-center" aria-hidden="true">
                    <span className="w-10 h-1 rounded-full bg-border dark:bg-white/20" />
                </div>

                {/* Encabezado */}
                <div className="px-5 pt-3 sm:pt-5 pb-4 flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-surface-2 dark:bg-white/[0.06] text-content-muted dark:text-white/70 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[12px] text-content-subtle">Detalle del pedido</p>
                            <h2 className="text-[17px] font-semibold tracking-tight text-content dark:text-white tabular-nums truncate">Pedido #{order.id}</h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <StageMark stage={order.stage} label={order.stage_label} />
                        <button onClick={onClose} aria-label="Cerrar"
                            className="w-9 h-9 -mr-2 rounded-lg flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-2 dark:hover:bg-white/[0.06] transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
                    {/* Qué pasa con el pedido, en una frase: es lo primero que el cliente busca. */}
                    {order.stage_detail && (
                        <p className="rounded-xl bg-surface-2 dark:bg-white/[0.04] px-4 py-3 text-[14px] text-content dark:text-white leading-relaxed">
                            {order.stage_detail}
                        </p>
                    )}

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <div className="min-w-0">
                            <dt className="text-[12px] text-content-subtle">Fecha</dt>
                            <dd className="text-[14px] font-medium text-content dark:text-white">{fecha}</dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="text-[12px] text-content-subtle">Factura</dt>
                            <dd className="text-[14px] font-medium text-content dark:text-white tabular-nums truncate">
                                {order.invoice_number || <span className="text-content-subtle font-normal">Todavía sin factura</span>}
                            </dd>
                        </div>
                    </dl>

                    {items.length > 0 && (
                        <div>
                            <p className="text-[14px] font-semibold text-content dark:text-white mb-2">
                                Productos <span className="font-normal text-content-subtle">· {items.length}</span>
                            </p>
                            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                                {items.map((it, idx) => {
                                    const hasPrice = Number.isFinite(it.price);
                                    const subtotal = Number.isFinite(it.subtotal) ? it.subtotal : (hasPrice ? it.price * it.quantity : null);
                                    return (
                                        <div key={idx} className="px-4 py-3">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <span className="text-[14px] font-medium text-content dark:text-white min-w-0">{toNameCase(it.name)}</span>
                                                {subtotal != null
                                                    ? <Money value={fmt(subtotal, baseCur)} className="text-[14px] font-semibold text-content dark:text-white shrink-0" />
                                                    : <span className="text-content-subtle shrink-0">—</span>}
                                            </div>
                                            <div className="mt-0.5 text-[12px] text-content-subtle tabular-nums">
                                                {fmtQty(it.quantity)}{hasPrice ? ` × ${fmt(it.price, baseCur)}` : ""}
                                            </div>
                                            {/* La nota de esta línea ("sin cebolla"), tal como la escribió el
                                                cliente al pedir: para que compruebe que llegó como la dejó. */}
                                            {it.note && (
                                                <div className="mt-0.5 text-[12px] italic text-content-muted dark:text-white/70">"{it.note}"</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Total */}
                <div className="px-5 py-4 border-t border-border/60 dark:border-white/[0.06] flex items-center justify-between gap-3 shrink-0">
                    <span className="text-[14px] font-medium text-content-muted dark:text-white/70">Total del pedido</span>
                    <div className="text-right">
                        {order.total != null
                            ? <Money value={fmt(order.total, baseCur)} className="block text-[20px] font-bold tracking-tight text-content dark:text-white" />
                            : <span className="text-content-subtle">—</span>}
                        {altCur && order.total != null && (
                            <Money value={fmt(order.total, altCur)} className="block text-[12px] text-content-subtle" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
