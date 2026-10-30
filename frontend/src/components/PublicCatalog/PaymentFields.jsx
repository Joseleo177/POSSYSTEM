import { useState } from "react";
import DatePicker from "../ui/DatePicker";
import { resolveImageUrl } from "../../helpers";
import { PAYMENT_TONE } from "./shared";
import { sheetSkin } from "./CatalogSheet";

// Monto de lo adeudado en la moneda de la cuenta elegida: en bolívares, a la tasa publicada.
export const montoEnMoneda = (op, base) =>
    Math.round((parseFloat(base) || 0) * (op?.currency?.is_base ? 1 : (op?.currency?.rate || 1)) * 100) / 100;

const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });

export const pagoVacio = () => ({ option_id: "", amount: "", reference_number: "", reference_date: hoyISO(), payer_bank: "" });

// Qué le falta al formulario para poder enviarse; null = completo.
export function faltaEnPago(pago) {
    if (!pago.option_id) return "Elige cómo pagas";
    if (!(parseFloat(String(pago.amount).replace(",", ".")) > 0)) return "Indica el monto que pagaste";
    if (String(pago.reference_number).replace(/[^0-9a-z]/gi, "").length < 4) return "Escribe la referencia del pago";
    if (!pago.reference_date) return "Indica la fecha del pago";
    return null;
}

// Datos de la cuenta que se muestran para pagar, con su rótulo. El orden es el que el cliente
// teclea en la app de su banco: banco, teléfono o cuenta, documento, titular.
const DATOS = [
    ["telefono", "Teléfono"],
    ["cuenta", "Número de cuenta"],
    ["correo", "Correo"],
    ["documento", "Cédula o RIF"],
    ["titular", "Titular"],
];

async function copiar(texto) {
    try {
        await navigator.clipboard.writeText(texto);
        return true;
    } catch {
        // Sin permiso de portapapeles (http, navegador viejo): el método de siempre.
        const ta = document.createElement("textarea");
        ta.value = texto;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    }
}

function CopyRow({ label, value, strong = false, skin }) {
    const [hecho, setHecho] = useState(false);
    const onCopy = async () => {
        if (await copiar(value)) { setHecho(true); setTimeout(() => setHecho(false), 1500); }
    };
    return (
        <div className="flex items-center gap-3 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
                <div className={`text-[12px] ${skin.subtle}`}>{label}</div>
                <div className={`text-[15px] ${strong ? "font-bold" : "font-medium"} ${skin.ink} break-all tabular-nums`}>{value}</div>
            </div>
            <button type="button" onClick={onCopy}
                className={`shrink-0 h-9 px-3 ${skin.carta ? "rounded-full" : "rounded-lg"} border text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors ${hecho
                    ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                    : skin.carta
                        ? "border-black/10 bg-white text-neutral-700 hover:text-brand-600 hover:border-brand-500/40"
                        : "border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:text-content dark:hover:text-white"}`}>
                {hecho ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2" strokeWidth={2} /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15V6a2 2 0 012-2h9" /></svg>
                )}
                {hecho ? "Copiado" : "Copiar"}
            </button>
        </div>
    );
}

// Tarjeta de una forma de pago. `logo` es el del banco o, si no tiene, el del método.
export function OptionCard({ selected, onClick, logo, title, subtitle, letter, skin = sheetSkin(null) }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={selected}
            className={`w-full text-left flex items-center gap-3 px-3.5 py-3 transition-all ${skin.carta ? "rounded-2xl" : "rounded-xl border"} ${selected ? skin.selected : skin.option}`}>
            <span className={`w-10 h-10 flex items-center justify-center overflow-hidden shrink-0 ${skin.logoBox}`}>
                {logo
                    ? <img src={resolveImageUrl(logo)} alt="" className="w-full h-full object-contain p-1" />
                    : <span className={`text-[15px] font-semibold ${skin.muted}`}>{letter}</span>}
            </span>
            <span className="min-w-0 flex-1">
                <span className={`block text-[14px] font-semibold ${skin.ink} leading-snug`}>{title}</span>
                {subtitle && <span className={`block text-[12px] ${skin.subtle} leading-snug truncate`}>{subtitle}</span>}
            </span>
            {/* En la carta, lo elegido se marca con un visto en el color de la tienda: el
                círculo de radio vacío era lo más "formulario" de toda la hoja. */}
            {skin.carta ? (
                <span className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center transition-all ${selected ? "bg-brand-500 text-brand-ink scale-100" : "ring-2 ring-black/10 scale-90"}`}>
                    {selected && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </span>
            ) : (
                <span className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? "border-brand-500" : "border-content-subtle/40 dark:border-white/25"}`}>
                    {selected && <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />}
                </span>
            )}
        </button>
    );
}

/**
 * Formulario del pago que reporta el cliente: elige la cuenta, ve los datos para pagar (con
 * el monto ya en la moneda de esa cuenta) y escribe la referencia. Lo usan el paso final del
 * pedido y "Reportar pago" de un pedido ya enviado.
 *
 * `later` (opcional): { label, selected, onSelect } para ofrecer "Pagar al recibir" en la misma
 * lista. `owedBase`: lo que se debe en moneda base.
 */
export default function PaymentFields({ options, value, onChange, owedBase, later = null, skin = sheetSkin(null) }) {
    const op = options.find(o => o.id === value.option_id) || null;
    const set = (k, v) => onChange({ ...value, [k]: v });

    const elegir = (o) => {
        // El monto se sugiere en la moneda de la cuenta: es lo que tiene que transferir.
        onChange({ ...value, option_id: o.id, amount: montoEnMoneda(o, owedBase).toFixed(2) });
        later?.onSelect?.(false);
    };

    const monto = op ? montoEnMoneda(op, owedBase) : 0;
    const datos = op ? DATOS.filter(([k]) => op.info?.[k]) : [];

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                {options.map(o => (
                    <OptionCard key={o.id} selected={!later?.selected && value.option_id === o.id} onClick={() => elegir(o)}
                        logo={o.bank_logo || o.method_logo} letter={(o.bank_name || o.method_name || "?").charAt(0)}
                        title={o.method_name} subtitle={[o.bank_name, o.currency?.code].filter(Boolean).join(" · ")} skin={skin} />
                ))}
                {later && (
                    <OptionCard selected={later.selected} onClick={() => { later.onSelect(true); onChange({ ...value, option_id: "" }); }}
                        letter="$" title={later.label} subtitle="La tienda te cobra al entregarte el pedido" skin={skin} />
                )}
            </div>

            {op && !later?.selected && (
                <>
                    <div>
                        <p className={`${skin.section} mb-2`}>Datos para pagar</p>
                        <div className={`${skin.card} divide-y ${skin.divide}`}>
                            <div className="px-3.5 py-2.5">
                                <div className={`text-[12px] ${skin.subtle}`}>Banco</div>
                                <div className={`text-[15px] font-medium ${skin.ink}`}>{op.bank_name}</div>
                            </div>
                            {datos.map(([k, label]) => <CopyRow key={k} label={label} value={op.info[k]} skin={skin} />)}
                            {monto > 0 && <CopyRow label="Monto a pagar" value={`${monto.toFixed(2)}`} strong skin={skin} />}
                        </div>
                        {op.info?.instrucciones && (
                            <p className={`mt-2 text-[13px] ${skin.muted} leading-relaxed`}>{op.info.instrucciones}</p>
                        )}
                        {!op.currency?.is_base && (
                            <p className={`mt-2 text-[12px] ${skin.subtle}`}>
                                Monto en {op.currency?.code === "VES" ? "bolívares" : op.currency?.code} a la tasa de hoy ({op.currency?.rate?.toFixed(2)}).
                            </p>
                        )}
                    </div>

                    <div>
                        <p className={skin.section}>Cuéntanos el pago</p>
                        <p className={`text-[12px] ${skin.subtle} mt-0.5 mb-3`}>Con la referencia la tienda lo encuentra en su banco.</p>
                        <div className="space-y-3">
                            <label className="block">
                                <span className={skin.label}>Número de referencia</span>
                                <input value={value.reference_number} onChange={e => set("reference_number", e.target.value.slice(0, 40))}
                                    inputMode={/zelle/i.test(op.method) ? "text" : "numeric"} autoComplete="off"
                                    placeholder="Ej. 004512345678" className={`${skin.field} mt-1.5 tabular-nums`} />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block min-w-0">
                                    <span className={skin.label}>Monto pagado</span>
                                    <div className="relative mt-1.5">
                                        <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] ${skin.subtle} pointer-events-none`}>{op.currency?.code === "USD" ? "$" : op.currency?.symbol}</span>
                                        <input value={value.amount} onChange={e => set("amount", e.target.value.replace(/[^\d.,]/g, ""))}
                                            inputMode="decimal" autoComplete="off" className={`${skin.field} pl-11 tabular-nums`} />
                                    </div>
                                </label>
                                <div className="block min-w-0">
                                    <span className={skin.label}>Fecha del pago</span>
                                    {/* Misma altura y letra que el monto de al lado (el DatePicker trae h-10 y 12px). */}
                                    <DatePicker value={value.reference_date} onChange={v => set("reference_date", v)} clearable={false}
                                        className={`mt-1.5 [&>div:first-child>span]:text-[14px] ${skin.carta ? "[&>div:first-child]:h-12 [&>div:first-child]:rounded-2xl [&>div:first-child]:bg-white [&>div:first-child]:border-black/10" : "[&>div:first-child]:h-11"}`} />
                                </div>
                            </div>
                            <label className="block">
                                <span className="flex items-center justify-between">
                                    <span className={skin.label}>Banco desde el que pagaste</span>
                                    <span className={`text-[12px] ${skin.subtle}`}>Opcional</span>
                                </span>
                                <input value={value.payer_bank} onChange={e => set("payer_bank", e.target.value.slice(0, 80))}
                                    autoComplete="off" placeholder="Ej. Banesco" className={`${skin.field} mt-1.5`} />
                            </label>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// Un pago reportado, en una fila: método y banco, monto y su estado. Lo usan la confirmación del
// pedido y el detalle en "Mis pedidos".
export function PaymentStatus({ status }) {
    const t = PAYMENT_TONE[status] || PAYMENT_TONE.pendiente;
    return (
        <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap ${t.text}`}>
            {t.check
                ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                : <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />}
            {t.label}
        </span>
    );
}

// Frase para la confirmación del pedido según cómo quedó el pago. `light`: el carrito del tema
// de menú es siempre claro, aunque la página esté en modo oscuro.
export function PlacedPaymentNote({ payment, light = false }) {
    if (!payment) return null;
    const confirmado = payment.status === "confirmado";
    return (
        <div className={`rounded-xl px-4 py-3 text-left flex flex-col gap-1 ${confirmado ? "bg-emerald-500/[0.08]" : "bg-amber-500/[0.08]"}`}>
            <PaymentStatus status={payment.status} />
            <p className={`text-[13px] leading-snug ${light ? "text-neutral-800" : "text-content dark:text-white/85"}`}>
                {confirmado
                    ? "Tu pago ya aparece en el banco de la tienda."
                    : "La tienda verifica tu pago en su banco. Lo verás confirmado en Mis pedidos."}
            </p>
        </div>
    );
}
