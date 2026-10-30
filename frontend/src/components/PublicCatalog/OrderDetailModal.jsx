import { fmtQty, STAGE_TONE } from "./shared";
import { StageMark, horaDe } from "./OrderCard";
import { resolveImageUrl, toNameCase } from "../../helpers";
import Money from "../ui/Money";
import { PaymentStatus } from "./PaymentFields";
import CatalogSheet, { SheetHeader, OrderProgress, sheetSkin } from "./CatalogSheet";

// Desglose completo de un pedido ya enviado. Arriba, en qué va: un icono grande del estado, la
// frase y el paso a paso. Después los datos que el cliente busca (cuándo, factura, cómo se
// entrega, cómo va el pago), lo que pidió con su foto, el desglose del total y los pagos que
// reportó, con el botón para reportar lo que falta.
//
// Las líneas van en dos renglones (nombre y subtotal; cantidad × precio) en vez de una tabla
// de cuatro columnas: en el teléfono la tabla cortaba el nombre del producto, que es justo lo
// que el cliente quiere comprobar.

const D = {
    enviado: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",
    confirmado: "M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z",
    facturado: "M9 14l2 2 4-4m-9 9h12a2 2 0 002-2V5a2 2 0 00-2-2H6a2 2 0 00-2 2v14a2 2 0 002 2z",
    pagado: "M5 13l4 4L19 7",
    anulado: "M6 18L18 6M6 6l12 12",
    rechazado: "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
    reloj: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    factura: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    tienda: "M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6",
    moto: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
    tarjeta: "M3 10h18M7 15h3M5 6h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z",
};
// Fondo sólido del círculo grande del estado (el texto de STAGE_TONE no sirve de relleno).
const CIRCULO = {
    enviado: "bg-sky-500", confirmado: "bg-sky-500", facturado: "bg-amber-500",
    pagado: "bg-emerald-500", anulado: "bg-neutral-400", rechazado: "bg-red-500",
};

const Ico = ({ d, className = "w-4 h-4", w = 1.9 }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={w} d={d} /></svg>
);

function Dato({ icon, label, children, skin }) {
    return (
        <div className={`min-w-0 flex items-start gap-2.5 ${skin.carta ? `${skin.card} px-3 py-2.5` : ""}`}>
            <span className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center ${skin.carta ? "bg-brand-500/10 text-brand-600" : "bg-surface-2 dark:bg-white/[0.06] text-content-muted"}`}>
                <Ico d={icon} />
            </span>
            <div className="min-w-0">
                <div className={`text-[11px] ${skin.subtle}`}>{label}</div>
                <div className={`text-[13px] font-semibold ${skin.ink} leading-snug`}>{children}</div>
            </div>
        </div>
    );
}

export default function OrderDetailModal({ order, onClose, fmt, baseCur, altCur, onReportPayment = null, panel = null, whatsapp = null }) {
    if (!order) return null;
    const skin = sheetSkin(panel);
    const pagos = order.payments || [];
    const debe = order.owed != null && order.owed > 0.009;
    // Sin abonos, lo que falta es el total entero: se dice "Sin pagar" y no se repite la cifra.
    const sinAbono = debe && order.total != null && order.owed >= order.total - 0.009;
    const fecha = order.created_at
        ? new Date(order.created_at).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" }).replace(".", "")
        : "Fecha desconocida";
    const items = order.items || [];
    const productos = items.reduce((a, it) => a + (Number.isFinite(it.subtotal) ? it.subtotal : (Number.isFinite(it.price) ? it.price * it.quantity : 0)), 0);
    const tono = STAGE_TONE[order.stage] || STAGE_TONE.enviado;
    const pagoTxt = order.stage === "pagado" ? "Pagado"
        : debe ? (sinAbono ? "Sin pagar" : `Falta ${fmt(order.owed, baseCur)}`)
            : pagos.some(p => p.status === "pendiente") ? "Por confirmar"
                : order.stage === "facturado" ? "Pendiente" : "Al entregar";
    const waHref = whatsapp
        ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, les escribo por el pedido #${order.id}.`)}`
        : null;

    return (
        <CatalogSheet skin={skin} onClose={onClose} label={`Pedido #${order.id}`}>
            <SheetHeader
                skin={skin}
                eyebrow="Detalle del pedido"
                title={`Pedido #${order.id}`}
                actions={<StageMark stage={order.stage} label={order.stage_label} pill={skin.carta} />}
                onClose={onClose}
            />

            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
                {/* En qué va: lo primero que el cliente busca. */}
                <div className={`${skin.carta ? skin.card : skin.soft} px-4 pt-5 pb-4 text-center`}>
                    <div className="ring-grow relative w-16 h-16 mx-auto">
                        {["enviado", "confirmado"].includes(order.stage) && (
                            <span className={`absolute inset-0 rounded-full ${CIRCULO[order.stage]} opacity-30 animate-ping`} aria-hidden="true" />
                        )}
                        <span className={`relative w-16 h-16 rounded-full ${CIRCULO[order.stage] || "bg-sky-500"} text-white flex items-center justify-center shadow-lg`}>
                            <Ico d={D[order.stage] || D.enviado} className="w-7 h-7" w={order.stage === "pagado" ? 2.6 : 1.9} />
                        </span>
                    </div>
                    <p className={`mt-3 font-display text-[19px] font-bold ${tono.text}`}>{order.stage_label}</p>
                    {order.stage_detail && <p className={`text-[13px] ${skin.muted} mt-0.5`}>{order.stage_detail}</p>}
                    {["enviado", "confirmado", "facturado", "pagado"].includes(order.stage) && (
                        <div className="mt-4">
                            <OrderProgress stage={order.stage} skin={skin} />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                    <Dato icon={D.reloj} label="Fecha" skin={skin}>
                        {fecha}{order.created_at && <span className={`block font-normal ${skin.subtle} tabular-nums`}>{horaDe(order.created_at)}</span>}
                    </Dato>
                    <Dato icon={D.factura} label="Factura" skin={skin}>
                        {order.invoice_number || <span className={`font-normal ${skin.subtle}`}>Todavía sin factura</span>}
                    </Dato>
                    <Dato icon={order.fulfillment === "delivery" ? D.moto : D.tienda} label="Entrega" skin={skin}>
                        {order.fulfillment === "delivery" ? "Delivery" : "Retiro en tienda"}
                        {order.fulfillment !== "delivery" && order.branch && <span className={`block font-normal ${skin.subtle}`}>{toNameCase(order.branch)}</span>}
                    </Dato>
                    <Dato icon={D.tarjeta} label="Pago" skin={skin}>
                        <span className={order.stage === "pagado" ? "text-emerald-700" : debe ? "text-amber-700" : ""}>{pagoTxt}</span>
                    </Dato>
                </div>

                {order.fulfillment === "delivery" && order.delivery_address && (
                    <div className={`${skin.carta ? skin.card : skin.soft} px-4 py-3 flex gap-3`}>
                        <Ico d="M12 21s-7-6.2-7-11.5a7 7 0 1114 0C19 14.8 12 21 12 21z M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" className={`w-5 h-5 shrink-0 mt-0.5 ${skin.subtle}`} />
                        <p className={`text-[14px] ${skin.ink} leading-snug`}>
                            {order.delivery_address}
                            {order.delivery_reference && <span className={`block text-[12px] ${skin.subtle} mt-0.5`}>{order.delivery_reference}</span>}
                        </p>
                    </div>
                )}

                {items.length > 0 && (
                    <div>
                        <p className={`${skin.section} mb-2`}>
                            Lo que pediste <span className={`font-normal ${skin.subtle}`}>· {items.length}</span>
                        </p>
                        <div className={`${skin.card} divide-y ${skin.divide}`}>
                            {items.map((it, idx) => {
                                const hasPrice = Number.isFinite(it.price);
                                const subtotal = Number.isFinite(it.subtotal) ? it.subtotal : (hasPrice ? it.price * it.quantity : null);
                                return (
                                    <div key={idx} className="px-3 py-3 flex gap-3">
                                        <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-black/[0.05] shrink-0 flex items-center justify-center">
                                            {it.image_url
                                                ? <img src={resolveImageUrl(it.image_url)} alt="" loading="lazy" className="w-full h-full object-cover" />
                                                : <span className="font-display text-[16px] font-bold text-brand-500/60">{(it.name || "?").charAt(0)}</span>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <span className={`text-[14px] font-medium ${skin.ink} min-w-0`}>{toNameCase(it.name)}</span>
                                                {subtotal != null
                                                    ? <Money value={fmt(subtotal, baseCur)} className={`text-[14px] font-semibold ${skin.ink} shrink-0`} />
                                                    : <span className={`${skin.subtle} shrink-0`}>—</span>}
                                            </div>
                                            <div className={`mt-0.5 text-[12px] ${skin.subtle} tabular-nums`}>
                                                {fmtQty(it.quantity)}{hasPrice ? ` × ${fmt(it.price, baseCur)}` : ""}
                                            </div>
                                            {/* La nota de esta línea ("sin cebolla"), tal como la escribió el
                                                cliente al pedir: para que compruebe que llegó como la dejó. */}
                                            {it.note && (
                                                <div className={`mt-1 inline-block text-[12px] italic ${skin.muted} ${skin.carta ? "px-2 py-0.5 rounded-lg bg-black/[0.04]" : ""}`}>"{it.note}"</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {(pagos.length > 0 || (debe && onReportPayment)) && (
                    <div>
                        <p className={`${skin.section} mb-2`}>Pagos</p>
                        {pagos.length > 0 && (
                            <div className={`${skin.card} divide-y ${skin.divide} mb-3`}>
                                {pagos.map(p => (
                                    <div key={p.id} className="px-4 py-3">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className={`text-[14px] font-medium ${skin.ink} min-w-0 truncate`}>
                                                {p.method_name}{p.bank_name ? ` · ${p.bank_name}` : ""}
                                            </span>
                                            <Money value={/^ref\.?$/i.test(String(p.currency_symbol || "").trim()) ? `$${p.amount.toFixed(2)}` : `${p.currency_symbol} ${p.amount.toFixed(2)}`} className={`text-[14px] font-semibold ${skin.ink} shrink-0`} />
                                        </div>
                                        <div className="mt-0.5 flex items-center justify-between gap-3">
                                            <span className={`text-[12px] ${skin.subtle} tabular-nums truncate`}>Ref. {p.reference}</span>
                                            <PaymentStatus status={p.status} />
                                        </div>
                                        {p.reject_reason && (
                                            <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">{p.reject_reason}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {debe && onReportPayment && (
                            <button type="button" onClick={() => onReportPayment(order)}
                                className={`w-full h-12 text-[14px] font-medium inline-flex items-center justify-center gap-2 transition-colors ${skin.dashed}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                                Reportar un pago · falta {fmt(order.owed, baseCur)}
                            </button>
                        )}
                    </div>
                )}

                {waHref && (
                    <a href={waHref} target="_blank" rel="noopener noreferrer"
                        className={`flex items-center justify-center gap-2 h-11 text-[13px] font-medium ${skin.subtle} hover:text-emerald-700 transition-colors`}>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 004.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.85 9.85 0 0012.04 2zm5.8 14.06c-.24.68-1.42 1.31-1.96 1.39-.5.07-1.14.1-1.84-.12-.42-.13-.97-.31-1.67-.61-2.93-1.27-4.85-4.22-5-4.42-.14-.19-1.19-1.58-1.19-3.02 0-1.44.75-2.14 1.02-2.43.27-.29.58-.36.78-.36h.56c.18 0 .42-.07.66.5.24.58.83 2.02.9 2.17.07.14.12.31.02.5-.1.2-.14.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.3-.13.59.17.29.74 1.22 1.58 1.97 1.09.97 2 1.27 2.29 1.42.29.14.46.12.63-.07.17-.2.73-.85.92-1.14.2-.29.39-.24.66-.14.27.1 1.71.81 2 .95.29.15.49.22.56.34.07.12.07.7-.17 1.38z" /></svg>
                        ¿Dudas con este pedido? Escríbenos
                    </a>
                )}
            </div>

            {/* Desglose y total */}
            <div className={`px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t ${skin.line} shrink-0 space-y-1 ${skin.carta ? "bg-white/50" : ""}`}>
                {(order.delivery_fee > 0 || order.extra_charge > 0) && (
                    <>
                        <div className="flex justify-between text-[13px]"><span className={skin.subtle}>Productos</span><Money value={fmt(productos, baseCur)} className={skin.ink} /></div>
                        {order.delivery_fee > 0 && (
                            <div className="flex justify-between text-[13px]"><span className={skin.subtle}>Delivery</span><Money value={fmt(order.delivery_fee, baseCur)} className={skin.ink} /></div>
                        )}
                        {/* Lo que sumó la tienda al revisar el pedido, con su motivo. */}
                        {order.extra_charge > 0 && (
                            <div className="flex justify-between gap-3 text-[13px]">
                                <span className={`${skin.subtle} min-w-0`}>Recargo{order.extra_charge_reason ? ` · ${order.extra_charge_reason}` : ""}</span>
                                <Money value={fmt(order.extra_charge, baseCur)} className={`${skin.ink} shrink-0`} />
                            </div>
                        )}
                    </>
                )}
                <div className="flex items-center justify-between gap-3 pt-1">
                    <span className={`text-[14px] font-semibold ${skin.ink}`}>Total del pedido</span>
                    <div className="text-right">
                        {order.total != null
                            ? <Money value={fmt(order.total, baseCur)} className={`block text-[22px] font-bold tracking-tight ${skin.ink}`} />
                            : <span className={skin.subtle}>—</span>}
                        {altCur && order.total != null && (
                            <Money value={fmt(order.total, altCur)} className={`block text-[12px] ${skin.subtle}`} />
                        )}
                    </div>
                </div>
                {debe && !sinAbono && (
                    <div className="flex justify-between text-[13px] font-semibold text-amber-700"><span>Falta por pagar</span><span className="tabular-nums">{fmt(order.owed, baseCur)}</span></div>
                )}
            </div>
        </CatalogSheet>
    );
}
