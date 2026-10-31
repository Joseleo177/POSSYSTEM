import { STAGE_TONE, fmtQty } from "./shared";
import { resolveImageUrl, toNameCase } from "../../helpers";
import Money from "../ui/Money";
import { OrderProgress, sheetSkin } from "./CatalogSheet";

// Estado de un pedido: punto (o visto, si está pagado) y el texto en su color. Se exporta para
// que el detalle del pedido lo pinte igual que la lista. `pill`: en la carta va en una
// pastilla de su color, que sobre el papel del panel se lee mejor que el texto suelto.
export function StageMark({ stage, label, pill = false }) {
    const t = STAGE_TONE[stage] || STAGE_TONE.enviado;
    return (
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap ${t.text} ${pill ? `h-6 px-2.5 rounded-full ${t.pill}` : ""}`}>
            {t.check ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            ) : (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot} ${["enviado", "confirmado", "en_camino"].includes(stage) ? "animate-pulse" : ""}`} />
            )}
            {label}
        </span>
    );
}

// Lo que sigue su curso: el cliente todavía espera algo de la tienda (confirmarlo, prepararlo,
// cobrarlo). Lo demás es historial.
export const EN_CURSO = ["enviado", "confirmado", "facturado", "listo", "en_camino"];

export const horaDe = (iso) => new Date(iso).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });

// Hora sola si es de hoy; si no, también el día: en "En curso" puede haber pedidos de antier.
const cuandoDe = (iso) => {
    const d = new Date(iso);
    if (d.toDateString() === new Date().toDateString()) return horaDe(iso);
    return `${d.toLocaleDateString("es-VE", { day: "numeric", month: "short" }).replace(".", "")} · ${horaDe(iso)}`;
};

// Hasta tres fotos de lo pedido, encimadas como fichas. Sin fotos, la inicial del primer
// producto: un pedido nunca queda como un renglón de texto sin cara.
export function Fotos({ items = [], size = 44 }) {
    const conFoto = items.filter(i => i.image_url).slice(0, 3);
    const mas = items.length - conFoto.length;
    if (!conFoto.length) {
        return (
            <span className="shrink-0 rounded-2xl bg-brand-500/10 text-brand-600 flex items-center justify-center font-display text-[18px] font-bold"
                style={{ width: size, height: size }}>
                {(items[0]?.name || "#").charAt(0).toUpperCase()}
            </span>
        );
    }
    return (
        <span className="shrink-0 flex items-center" style={{ height: size }}>
            {conFoto.map((it, i) => (
                <span key={i} className="rounded-2xl overflow-hidden bg-white ring-2 ring-white shadow-sm"
                    style={{ width: size, height: size, marginLeft: i ? -size * 0.45 : 0, zIndex: 3 - i }}>
                    <img src={resolveImageUrl(it.image_url)} alt="" loading="lazy" className="w-full h-full object-cover" />
                </span>
            ))}
            {mas > 0 && conFoto.length === 3 && (
                <span className="rounded-full bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white -ml-3 z-10"
                    style={{ width: 22, height: 22, alignSelf: "flex-end" }}>
                    +{mas}
                </span>
            )}
        </span>
    );
}

// Fila de un pedido en "Mis pedidos": fotos de lo pedido, número y hora, estado, qué se pidió
// y el total. Si sigue en curso, además la barra de cuatro pasos y la frase de en qué va; si lo
// facturaron y falta pagar, cuánto. Lo ya cerrado va compacto: la barra llena no dice nada.
export default function OrderCard({ order, fmt, baseCur, onSelect, skin = sheetSkin(null), index = 0 }) {
    const items = order.items || [];
    const summary = items.map(i => `${fmtQty(i.quantity)} × ${toNameCase(i.name)}`).join(", ");
    const enCurso = EN_CURSO.includes(order.stage);
    const debe = order.owed != null && order.owed > 0.009;
    // Sin abonos, "Falta Ref. 1.02" repetía el total de al lado: se dice "Sin pagar".
    const sinAbono = debe && order.total != null && order.owed >= order.total - 0.009;

    return (
        <button
            type="button"
            onClick={() => onSelect(order)}
            style={{ "--i": Math.min(index, 8) }}
            className={`rise-in w-full text-left transition-all ${skin.carta ? `${skin.card} px-3.5 py-3.5 ${skin.hover}` : `px-4 py-3 ${skin.hover}`}`}
        >
            <div className="flex items-start gap-3">
                <Fotos items={items} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <div className={`text-[14px] font-semibold ${skin.ink} tabular-nums leading-tight`}>Pedido #{order.id}</div>
                            <div className={`text-[12px] ${skin.subtle} tabular-nums mt-0.5`}>
                                {order.created_at ? cuandoDe(order.created_at) : "Sin fecha"}
                                {items.length > 0 ? ` · ${items.length} ${items.length === 1 ? "producto" : "productos"}` : ""}
                            </div>
                        </div>
                        <StageMark stage={order.stage} label={order.stage_label} pill={skin.carta} />
                    </div>
                    {summary && (
                        <p className={`mt-1.5 text-[13px] ${skin.muted} line-clamp-1`}>{summary}</p>
                    )}
                </div>
            </div>

            {enCurso && (
                <div className="mt-3 space-y-1.5">
                    <OrderProgress stage={order.stage} fulfillment={order.fulfillment} skin={skin} compact />
                    {order.stage_detail && !debe && <p className={`text-[12px] ${skin.subtle}`}>{order.stage_detail}</p>}
                </div>
            )}

            <div className={`mt-3 pt-2.5 border-t ${skin.line} flex items-center justify-between gap-3`}>
                {debe ? (
                    <span className="text-[12px] font-semibold text-amber-700 tabular-nums">{sinAbono ? "Sin pagar" : `Falta ${fmt(order.owed, baseCur)}`}</span>
                ) : (
                    <span className={`text-[12px] ${skin.subtle}`}>Ver detalle</span>
                )}
                <span className="flex items-center gap-1.5">
                    {order.total != null
                        ? <Money value={fmt(order.total, baseCur)} className={`text-[15px] font-bold ${skin.ink}`} />
                        : <span className={skin.subtle}>—</span>}
                    <svg className={`w-4 h-4 shrink-0 ${skin.subtle} opacity-60`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </span>
            </div>
        </button>
    );
}
