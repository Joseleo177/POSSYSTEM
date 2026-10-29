import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import Page from "../components/ui/Page";
import Segmented from "../components/ui/Segmented";
import StatusMark, { SALE_STATUS } from "../components/ui/StatusMark";
import Money from "../components/ui/Money";
import Modal from "../components/ui/Modal";
import CustomSelect from "../components/ui/CustomSelect";
import { Button } from "../components/ui/Button";
import PaymentReportList from "../components/PaymentReports/PaymentReportList";
import MiniMapa from "../components/MiniMapa";
import { toNameCase, printKitchenOrder, resolveImageUrl } from "../helpers";

// Pedidos: la bandeja de los pedidos que llegan del catálogo (extra pedidos web). Antes se
// atendían desde "Ventas en espera" del POS, con piezas pensadas para cuentas pausadas. Aquí se
// ve el pedido completo —productos, entrega con su mapa, pagos reportados—, se le ajusta el
// delivery o se le suma un recargo con su motivo (el cliente lo ve en "Mis pedidos"), y al
// aceptarlo pasa al POS como cuenta en espera, donde se cobra como siempre.
//
// Lista a la izquierda y pedido a la derecha; en el teléfono el pedido sube como hoja (mismo
// patrón que warehouses/AdjustmentsView).

const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white placeholder:text-content-subtle/60 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const LABEL = "text-[12px] font-medium text-content-subtle";
const CARD = "bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06]";
const POLL_MS = 20000;

const PEDIDO_STATUS = { ...SALE_STATUS, pedido: { label: "Por aceptar", tone: "violet", flag: true } };

const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
const ref = (n) => `Ref. ${r2(n).toFixed(2)}`;
const minutosDesde = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
const hace = (d) => {
    const m = minutosDesde(d);
    if (m < 1) return "Ahora";
    if (m < 60) return `Hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Hace ${h} h`;
    return new Date(d).toLocaleDateString("es-VE", { day: "numeric", month: "short" }).replace(".", "");
};
const hora = (d) => new Date(d).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });

const IconoEntrega = ({ delivery, className = "w-[18px] h-[18px]" }) => delivery ? (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /></svg>
) : (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6" /></svg>
);

function PagoMark({ pago }) {
    if (!pago) return null;
    return pago === "confirmado" ? (
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            Pagado
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Pago por confirmar
        </span>
    );
}

// Rótulo de campo con alto fijo: con "Opcional" a la derecha o sin él, todos los campos de una
// fila arrancan a la misma altura (antes el del recargo quedaba más alto que el del motivo).
function Rotulo({ children, opcional = false }) {
    return (
        <span className="flex items-center justify-between gap-2 h-[18px] text-[12px] font-medium text-content-subtle">
            <span className="truncate">{children}</span>
            {opcional && <span className="text-[11px] font-normal text-content-subtle/70 shrink-0">Opcional</span>}
        </span>
    );
}

// ── Piezas visuales ──────────────────────────────────────────────────────

// Inicial del cliente en un círculo neutro: se reconoce la fila sin leer el nombre. Sin
// colores por cliente: en este sistema el color es señal, no adorno.
function Inicial({ nombre, size = "w-10 h-10 text-[15px]" }) {
    const letras = String(nombre || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
    return (
        <span className={`${size} rounded-full bg-surface-3 dark:bg-white/[0.08] text-content-muted dark:text-white/80 font-semibold flex items-center justify-center shrink-0`}>
            {letras || "?"}
        </span>
    );
}

// Foto del producto, o su inicial si no tiene.
function Foto({ src, nombre, className = "w-11 h-11 rounded-lg" }) {
    const [mala, setMala] = useState(false);
    return (
        <span className={`${className} shrink-0 overflow-hidden bg-surface-2 dark:bg-white/[0.06] ring-1 ring-black/[0.04] dark:ring-white/[0.06] flex items-center justify-center`}>
            {src && !mala
                ? <img src={resolveImageUrl(src)} alt="" loading="lazy" onError={() => setMala(true)} className="w-full h-full object-cover" />
                : <span className="text-[12px] font-semibold text-content-subtle">{String(nombre || "?").charAt(0).toUpperCase()}</span>}
        </span>
    );
}

// Por dónde va el pedido. El módulo llega hasta aceptarlo; el cobro lo cierra la caja.
const PASOS = ["Recibido", "Aceptado", "Cobrado"];
function Avance({ status, creado }) {
    const hecho = status === "pedido" ? 1 : ["pagado", "exonerado"].includes(status) ? 3 : status === "anulado" ? 0 : 2;
    return (
        <ol className="flex items-start">
            {PASOS.map((p, i) => {
                const listo = i < hecho;
                const actual = i === hecho;
                return (
                    <li key={p} className="flex-1 min-w-0 flex flex-col items-center text-center relative">
                        {i > 0 && <span className={`absolute top-[11px] right-1/2 w-full h-[2px] ${i < hecho ? "bg-emerald-500" : "bg-border dark:bg-white/10"}`} />}
                        <span className={`relative z-[1] w-6 h-6 rounded-full flex items-center justify-center ${listo
                            ? "bg-emerald-500 text-white"
                            : actual ? "bg-white dark:bg-surface-dark-2 ring-2 ring-brand-500 text-brand-600 dark:text-brand-400" : "bg-surface-3 dark:bg-white/10 text-content-subtle"}`}>
                            {listo
                                ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                : <span className="text-[11px] font-bold">{i + 1}</span>}
                        </span>
                        <span className={`mt-1.5 text-[12px] ${listo || actual ? "font-medium text-content dark:text-white" : "text-content-subtle"}`}>{p}</span>
                        {i === 0 && <span className="text-[11px] text-content-subtle tabular-nums">{hora(creado)}</span>}
                        {actual && i === 1 && <span className="text-[11px] text-brand-600 dark:text-brand-400">Por aceptar</span>}
                        {actual && i === 2 && <span className="text-[11px] text-brand-600 dark:text-brand-400">En la caja</span>}
                    </li>
                );
            })}
        </ol>
    );
}

// ── Lista ────────────────────────────────────────────────────────────────

function Fila({ o, activo, onClick, nuevos }) {
    // Lo que lleva más de 15 minutos sin aceptar pide atención: filete ámbar.
    const atrasado = nuevos && minutosDesde(o.created_at) >= 15;
    const delivery = o.fulfillment === "delivery";
    return (
        <button type="button" onClick={onClick}
            className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors ${activo ? "bg-brand-500/[0.06] dark:bg-white/[0.05]" : "hover:bg-surface-2/70 dark:hover:bg-white/[0.03]"} ${atrasado ? "shadow-[inset_3px_0_0_#f59e0b]" : ""}`}>
            <Inicial nombre={toNameCase(o.customer_name)} />
            <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(o.customer_name) || "Cliente"}</span>
                    <span className={`text-[12px] tabular-nums shrink-0 ${atrasado ? "text-amber-700 dark:text-amber-400 font-medium" : "text-content-subtle"}`}>{hace(o.created_at)}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-content-subtle min-w-0">
                    <IconoEntrega delivery={delivery} className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                        {delivery ? (o.delivery_address || "Delivery") : o.fulfillment === "retiro" ? `Retira en ${toNameCase(o.warehouse_name) || "tienda"}` : (toNameCase(o.warehouse_name) || "Sin entrega indicada")}
                    </span>
                </span>
                <span className="mt-2 flex items-center gap-2 min-w-0">
                    {o.fotos?.length > 0 && (
                        <span className="flex -space-x-2 shrink-0">
                            {o.fotos.map((f, i) => <Foto key={i} src={f} className="w-7 h-7 rounded-md ring-2 ring-white dark:ring-surface-dark-2" />)}
                        </span>
                    )}
                    <span className="text-[12px] text-content-muted dark:text-white/60 truncate">{o.resumen}</span>
                </span>
                <span className="mt-2 flex items-center justify-between gap-3">
                    <Money value={ref(o.total)} className="text-[15px] font-bold tracking-tight text-content dark:text-white" />
                    {nuevos ? <PagoMark pago={o.pago} /> : <StatusMark status={o.status} map={PEDIDO_STATUS} />}
                </span>
            </span>
        </button>
    );
}

// ── Detalle ──────────────────────────────────────────────────────────────

function Seccion({ titulo, aside = null, children }) {
    return (
        <section>
            <div className="flex items-baseline justify-between gap-3 mb-2">
                <h3 className="text-[14px] font-semibold text-content dark:text-white">{titulo}</h3>
                {aside}
            </div>
            {children}
        </section>
    );
}

function Detalle({ id, onChanged, onClose }) {
    const { notify, activeCurrencies, navigateTo, companyInfo, printerWidth } = useApp();
    const [o, setO] = useState(null);
    const [cargo, setCargo] = useState({ zone: "", fee: "", extra: "", reason: "" });
    const [serie, setSerie] = useState("");
    const [rechazar, setRechazar] = useState(false);
    const [motivo, setMotivo] = useState("");
    const [aceptado, setAceptado] = useState(false);

    const cargar = useCallback(async () => {
        try {
            const r = await api.webOrders.get(id);
            setO(r.data);
            setCargo({
                zone: r.data.delivery_zone_id ? String(r.data.delivery_zone_id) : "",
                fee: r.data.fulfillment === "delivery" ? r2(r.data.delivery_fee ?? r.data.service_charge).toFixed(2) : "",
                extra: r.data.extra_charge ? r2(r.data.extra_charge).toFixed(2) : "",
                reason: r.data.extra_charge_reason || "",
            });
            setSerie(r.data.series?.length === 1 ? String(r.data.series[0].id) : "");
        } catch (e) { notify(e.message, "err"); onClose(); }
    }, [id, notify, onClose]);
    useEffect(() => { setO(null); setAceptado(false); cargar(); }, [cargar]);

    if (!o) {
        return (
            <div className="p-5 space-y-3">
                {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-surface-3/60 dark:bg-white/[0.04] animate-pulse" />)}
            </div>
        );
    }

    const nuevo = o.status === "pedido";
    const bs = activeCurrencies.find(c => !c.is_base);
    const enBs = (n) => bs ? `${bs.symbol} ${(r2(n) * parseFloat(bs.exchange_rate)).toFixed(2)}` : null;
    const delivery = o.fulfillment === "delivery";
    const fee = delivery ? r2(String(cargo.fee).replace(",", ".")) : 0;
    const extra = r2(String(cargo.extra).replace(",", "."));
    const totalVista = r2(o.products_total - parseFloat(o.discount_amount || 0) + fee + extra);
    const sucio = nuevo && (
        (delivery && fee !== r2(o.delivery_fee ?? o.service_charge)) ||
        extra !== r2(o.extra_charge || 0) ||
        cargo.reason.trim() !== (o.extra_charge_reason || "") ||
        (cargo.zone || "") !== (o.delivery_zone_id ? String(o.delivery_zone_id) : "")
    );
    const confirmados = (o.payment_reports || []).filter(r => r.status === "confirmado").length;

    const guardarCargo = async () => {
        try {
            await api.webOrders.saveCharges(o.id, {
                delivery_zone_id: cargo.zone || null,
                delivery_fee: delivery ? fee : undefined,
                extra_charge: extra,
                extra_charge_reason: cargo.reason,
            });
            notify("Cobro del pedido actualizado. El cliente ve el total nuevo.");
            await cargar();
            onChanged();
        } catch (e) { notify(e.message, "err"); }
    };

    const aceptar = async () => {
        try {
            if (sucio) await guardarCargo();
            await api.webOrders.accept(o.id, { serie_id: serie || undefined });
            notify("Pedido aceptado: ya está en la caja");
            setAceptado(true);
            await cargar();
            onChanged();
        } catch (e) { notify(e.message, "err"); }
    };

    const confirmarRechazo = async () => {
        try {
            const r = await api.webOrders.reject(o.id, motivo);
            notify(r.data?.refund_pending
                ? "Pedido rechazado. Tenía un pago confirmado: devuélvelo al cliente (queda en Pagos reportados)."
                : "Pedido rechazado. El cliente ve el motivo en su pedido.");
            setRechazar(false);
            onChanged();
            onClose();
        } catch (e) { notify(e.message, "err"); }
    };

    const imprimir = () => printKitchenOrder({
        ...o,
        customer_name: o.customer_name || o.web_customer_name,
        items: o.items.map(i => ({ name: i.name, quantity: i.quantity, note: i.note })),
    }, companyInfo, printerWidth, { titulo: "Pedido" });

    const mapa = o.delivery_lat != null && o.delivery_lng != null ? `https://www.google.com/maps?q=${o.delivery_lat},${o.delivery_lng}` : null;
    const telefono = String(o.web_customer_phone || o.customer_phone || "").replace(/\D/g, "");
    const whatsapp = telefono.length >= 10 ? `https://wa.me/${telefono.startsWith("0") ? `58${telefono.slice(1)}` : telefono}` : null;

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-4 sm:p-6 space-y-5 max-w-[920px] mx-auto">
                {/* Cabecera: quién, qué pedido y cuánto, de un vistazo. */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                        <Inicial nombre={toNameCase(o.customer_name || o.web_customer_name)} size="w-12 h-12 text-[17px]" />
                        <div className="min-w-0">
                            <p className="text-[12px] text-content-subtle tabular-nums">{o.invoice_number || `Pedido #${o.id}`} · {hace(o.created_at).toLowerCase()}</p>
                            <h2 className="text-[20px] font-semibold tracking-tight text-content dark:text-white truncate">{toNameCase(o.customer_name || o.web_customer_name)}</h2>
                            <div className="mt-0.5"><StatusMark status={o.status} map={PEDIDO_STATUS} /></div>
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <Money value={ref(nuevo ? totalVista : o.total)} className="block text-[24px] font-bold tracking-tight leading-none text-content dark:text-white" />
                        {bs && <Money value={enBs(nuevo ? totalVista : o.total)} className="block mt-1.5 text-[12px] text-content-subtle" />}
                    </div>
                </div>

                <div className={`${CARD} px-4 pt-4 pb-3`}>
                    <Avance status={o.status} creado={o.created_at} />
                </div>

                {aceptado && (
                    <div className="rounded-xl bg-emerald-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-[13px] text-emerald-800 dark:text-emerald-300 leading-snug">Aceptado: el pedido está en Venta → En espera para cobrarlo.</p>
                        <Button variant="ghost" className="h-12 sm:h-9 shrink-0" onClick={() => navigateTo("Cobro")}>Ir a la caja</Button>
                    </div>
                )}

                {/* Cliente y entrega */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    <div className={`${CARD} p-4`}>
                        <p className={LABEL}>Cliente</p>
                        <p className="text-[14px] font-medium text-content dark:text-white mt-0.5">{toNameCase(o.customer_name || o.web_customer_name)}</p>
                        <p className="text-[13px] text-content-subtle tabular-nums">{[o.customer_rif, o.web_customer_phone || o.customer_phone].filter(Boolean).join(" · ")}</p>
                        {whatsapp && (
                            <a href={whatsapp} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 mt-2 text-[12px] font-semibold text-brand-600 dark:text-brand-400 hover:underline underline-offset-2">
                                Escribirle por WhatsApp
                            </a>
                        )}
                    </div>
                    <div className={`${CARD} p-4`}>
                        <p className={`${LABEL} flex items-center gap-1.5`}>
                            <IconoEntrega delivery={delivery} className="w-3.5 h-3.5" />
                            {delivery ? `Delivery${o.zone_name ? ` · ${o.zone_name}` : ""}` : o.fulfillment === "retiro" ? "Retiro en tienda" : "Entrega"}
                        </p>
                        {delivery ? (
                            <>
                                <p className="text-[14px] font-medium text-content dark:text-white mt-0.5 break-words">{o.delivery_address}</p>
                                {o.delivery_reference && <p className="text-[13px] text-content-subtle break-words">{o.delivery_reference}</p>}
                                {mapa
                                    ? <MiniMapa lat={parseFloat(o.delivery_lat)} lng={parseFloat(o.delivery_lng)} className="h-32 mt-3" />
                                    : <p className="text-[12px] text-content-subtle mt-2">El cliente no marcó el punto en el mapa</p>}
                            </>
                        ) : (
                            <>
                                <p className="text-[14px] font-medium text-content dark:text-white mt-0.5">{toNameCase(o.requested_warehouse_name) || "Sucursal no indicada"}</p>
                                <p className="text-[13px] text-content-subtle">El cliente lo busca en la tienda.</p>
                            </>
                        )}
                    </div>
                </div>

                {o.web_note && (
                    <div className="rounded-xl bg-amber-500/10 px-4 py-3">
                        <p className="text-[12px] font-medium text-amber-800 dark:text-amber-300">Nota del cliente</p>
                        <p className="text-[13px] text-content dark:text-white mt-0.5 break-words">{o.web_note}</p>
                    </div>
                )}

                {/* Productos */}
                <Seccion titulo="Productos" aside={<span className="text-[12px] text-content-subtle">{o.items.length} {o.items.length === 1 ? "línea" : "líneas"}</span>}>
                    <div className={`${CARD} divide-y divide-border/60 dark:divide-white/[0.06]`}>
                        {o.items.map(i => (
                            <div key={i.id} className="px-4 py-3 flex items-center gap-3">
                                <Foto src={i.image_url} nombre={i.name} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-[14px] font-medium text-content dark:text-white min-w-0">{toNameCase(i.name)}</span>
                                        <Money value={ref(i.subtotal)} className="text-[14px] font-semibold text-content dark:text-white shrink-0" />
                                    </div>
                                    <div className="text-[12px] text-content-subtle tabular-nums">{i.quantity % 1 === 0 ? i.quantity : i.quantity.toFixed(3)} × {ref(i.price)}</div>
                                    {i.note && <div className="text-[12px] italic text-content-muted dark:text-white/70">{i.note}</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </Seccion>

                {/* Lo que se cobra aparte: delivery y recargo. Solo antes de aceptar. */}
                {nuevo && (
                    <Seccion titulo="Cobro aparte">
                        <div className={`${CARD} p-4 space-y-3`}>
                            {delivery && (
                                <div className={`grid gap-3 ${o.zones?.length ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                                    {o.zones?.length > 0 && (
                                        <div className="min-w-0">
                                            <Rotulo>Zona</Rotulo>
                                            <CustomSelect value={cargo.zone} className="mt-1.5" placeholder="Sin zona"
                                                onChange={v => {
                                                    const z = o.zones.find(x => String(x.id) === String(v));
                                                    setCargo(p => ({ ...p, zone: v, fee: z ? r2(z.price).toFixed(2) : p.fee }));
                                                }}
                                                options={o.zones.map(z => ({ value: String(z.id), label: `${z.name} · ${ref(z.price)}` }))} />
                                        </div>
                                    )}
                                    <label className="block min-w-0">
                                        <Rotulo>Delivery</Rotulo>
                                        <div className="relative mt-1.5">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">Ref.</span>
                                            <input value={cargo.fee} onChange={e => setCargo(p => ({ ...p, fee: e.target.value.replace(/[^\d.,]/g, "") }))}
                                                inputMode="decimal" placeholder="0.00" autoComplete="off" className={`${INPUT} pl-11 tabular-nums`} />
                                        </div>
                                    </label>
                                </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-3">
                                <label className="block min-w-0">
                                    <Rotulo opcional>Recargo</Rotulo>
                                    <div className="relative mt-1.5">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">Ref.</span>
                                        <input value={cargo.extra} onChange={e => setCargo(p => ({ ...p, extra: e.target.value.replace(/[^\d.,]/g, "") }))}
                                            inputMode="decimal" placeholder="0.00" autoComplete="off" className={`${INPUT} pl-11 tabular-nums`} />
                                    </div>
                                </label>
                                <label className="block min-w-0">
                                    <Rotulo>Motivo · lo verá el cliente</Rotulo>
                                    <input value={cargo.reason} onChange={e => setCargo(p => ({ ...p, reason: e.target.value.slice(0, 120) }))}
                                        placeholder="Ej. Zona fuera de ruta, empaque especial" autoComplete="off" className={`${INPUT} mt-1.5`} />
                                </label>
                            </div>
                            {sucio && (
                                <div className="flex justify-end">
                                    <Button variant="ghost" className="h-12 sm:h-9 w-full sm:w-auto" onClick={guardarCargo}>Guardar cambios del cobro</Button>
                                </div>
                            )}
                        </div>
                    </Seccion>
                )}

                {/* Pagos que reportó el cliente */}
                {(o.payment_reports || []).length > 0 && (
                    <Seccion titulo="Pagos del cliente">
                        <div className={`${CARD} overflow-hidden`}>
                            <PaymentReportList reports={o.payment_reports} onChanged={() => { cargar(); onChanged(); }} />
                        </div>
                    </Seccion>
                )}

                {/* Totales */}
                <div className="rounded-xl bg-surface-2 dark:bg-white/[0.04] px-4 py-3.5 space-y-1.5">
                    <div className="flex justify-between text-[13px]"><span className="text-content-subtle">Productos</span><Money value={ref(o.products_total)} className="text-content-muted" /></div>
                    {delivery && <div className="flex justify-between text-[13px]"><span className="text-content-subtle">Delivery</span><Money value={fee > 0 ? ref(fee) : "Sin costo"} className="text-content-muted" /></div>}
                    {extra > 0 && <div className="flex justify-between gap-3 text-[13px]"><span className="text-content-subtle truncate">Recargo{cargo.reason.trim() ? ` · ${cargo.reason.trim()}` : ""}</span><Money value={ref(extra)} className="text-content-muted shrink-0" /></div>}
                    <div className="flex items-end justify-between gap-3 pt-1.5 border-t border-border/70 dark:border-white/[0.06]">
                        <span className="text-[13px] font-medium text-content-muted pb-0.5">Total</span>
                        <div className="text-right">
                            <Money value={ref(nuevo ? totalVista : o.total)} className="block text-[24px] font-bold tracking-tight leading-none text-content dark:text-white" />
                            {bs && <Money value={enBs(nuevo ? totalVista : o.total)} className="block mt-1 text-[12px] text-content-subtle" />}
                        </div>
                    </div>
                </div>
            </div>
            </div>

            {/* Acciones */}
            <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-border/60 dark:border-white/[0.06] bg-white dark:bg-surface-dark-2 lg:bg-transparent">
            <div className="max-w-[920px] mx-auto space-y-2.5">
                {nuevo && o.series?.length > 1 && (
                    <CustomSelect value={serie} onChange={setSerie} placeholder="Serie con que se factura"
                        options={o.series.map(s => ({ value: String(s.id), label: `Serie ${s.name}` }))} />
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                    {/* En el teléfono, las dos secundarias comparten fila y la principal va debajo a lo ancho. */}
                    <div className="grid grid-cols-2 gap-2 sm:contents">
                        <Button variant="ghost" className={`h-12 sm:h-10 sm:flex-1 ${nuevo ? "" : "col-span-2"}`} onClick={imprimir}>Imprimir</Button>
                        {nuevo && <Button variant="ghost" className="h-12 sm:h-10 sm:flex-1" onClick={() => { setMotivo(""); setRechazar(true); }}>Rechazar</Button>}
                    </div>
                    {nuevo && (
                        <Button className="h-12 sm:h-10 sm:flex-[1.6]" onClick={aceptar}
                            disabled={o.series?.length > 1 && !serie}>
                            Aceptar · {ref(totalVista)}
                        </Button>
                    )}
                    {!nuevo && ["espera", "borrador"].includes(o.status) && (
                        <Button className="h-12 sm:h-10 sm:flex-[1.6]" onClick={() => navigateTo("Cobro")}>Ir a la caja</Button>
                    )}
                </div>
                {nuevo && <p className="text-[12px] text-content-subtle text-center">Al aceptarlo se descuenta el inventario y pasa a la caja para cobrarlo.</p>}
            </div>
            </div>

            <Modal open={rechazar} onClose={() => setRechazar(false)} title="Rechazar pedido" width={440}
                footer={
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <Button variant="ghost" className="h-12 sm:h-9" onClick={() => setRechazar(false)}>Cancelar</Button>
                        <Button variant="danger" className="h-12 sm:h-9" onClick={confirmarRechazo} disabled={motivo.trim().length < 3}>Rechazar pedido</Button>
                    </div>
                }>
                <p className="text-[13px] text-content-muted dark:text-white/70 leading-relaxed mb-4">
                    El pedido de {toNameCase(o.customer_name || o.web_customer_name)} se elimina y el cliente ve el motivo en "Mis pedidos".
                </p>
                {confirmados > 0 && (
                    <p className="mb-4 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2.5 text-[12px] leading-snug">
                        Este pedido tiene un pago confirmado: ese dinero ya entró y tendrás que devolverlo. Queda en Contabilidad → Pagos reportados.
                    </p>
                )}
                <label className="block">
                    <span className={LABEL}>Motivo</span>
                    <input value={motivo} onChange={e => setMotivo(e.target.value.slice(0, 200))} autoComplete="off" data-autofocus
                        placeholder="Ej. No tenemos repartidor disponible hoy" className={`${INPUT} mt-1.5`} />
                </label>
            </Modal>
        </div>
    );
}

// ── Página ───────────────────────────────────────────────────────────────

export default function PedidosPage() {
    const { notify } = useApp();
    const [tab, setTab] = useState("nuevos");
    const [rows, setRows] = useState(null);
    const [nuevos, setNuevos] = useState(0);
    const [sel, setSel] = useState(null);
    const vistos = useRef(null);

    const load = useCallback(async () => {
        try {
            const r = await api.webOrders.list({ tab });
            setRows(r.data || []);
            setNuevos(r.counts?.nuevos || 0);
            // Aviso de pedido nuevo: los que no estaban en la vuelta anterior. La primera carga calla.
            if (tab === "nuevos") {
                const ids = new Set((r.data || []).map(x => x.id));
                if (vistos.current) {
                    const llegaron = (r.data || []).filter(x => !vistos.current.has(x.id));
                    if (llegaron.length) notify(llegaron.length === 1 ? `Pedido nuevo de ${toNameCase(llegaron[0].customer_name)}` : `${llegaron.length} pedidos nuevos`);
                }
                vistos.current = ids;
            }
        } catch (e) {
            notify(e.message, "err");
            setRows([]);
        }
    }, [tab, notify]);

    useEffect(() => { setRows(null); load(); }, [load]);
    // Mientras la pantalla está a la vista se revisa cada 20 s: una consulta por vuelta.
    useEffect(() => {
        const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, POLL_MS);
        return () => clearInterval(t);
    }, [load]);

    const cerrar = useCallback(() => setSel(null), []);

    const sub = (
        <div className="px-3 sm:px-4 py-2">
            <Segmented value={tab} onChange={(t) => { setTab(t); setSel(null); }}
                options={[{ key: "nuevos", label: "Por aceptar", count: nuevos }, { key: "aceptados", label: "Aceptados" }]} />
        </div>
    );

    return (
        <Page module="Pedidos" title="Pedidos del catálogo" subheader={sub}>
            <div className="flex-1 lg:min-h-0 flex flex-col lg:flex-row lg:overflow-hidden bg-white dark:bg-white/[0.03] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none">
                {/* Lista */}
                <div className="lg:w-[38%] lg:min-w-[320px] lg:shrink-0 lg:min-h-0 lg:overflow-y-auto lg:border-r border-border/60 dark:border-white/[0.06]">
                    {rows === null ? (
                        <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} className="px-4 py-4 space-y-2">
                                    <div className="h-3 w-1/2 rounded bg-surface-3 dark:bg-white/[0.06] animate-pulse" />
                                    <div className="h-3 w-3/4 rounded bg-surface-3 dark:bg-white/[0.06] animate-pulse" />
                                </div>
                            ))}
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="py-16 px-6 text-center">
                            <div className="w-12 h-12 mx-auto rounded-xl bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                                <IconoEntrega delivery className="w-6 h-6" />
                            </div>
                            <p className="mt-3 text-[14px] font-medium text-content dark:text-white">
                                {tab === "nuevos" ? "No hay pedidos por aceptar" : "Nada aceptado en los últimos 3 días"}
                            </p>
                            <p className="text-[12px] text-content-subtle mt-0.5">
                                {tab === "nuevos" ? "Los pedidos que hagan tus clientes desde el catálogo llegan aquí." : "Los pedidos que aceptes se ven aquí con su estado en la caja."}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
                            {rows.map(o => <Fila key={o.id} o={o} nuevos={tab === "nuevos"} activo={sel === o.id} onClick={() => setSel(o.id)} />)}
                        </div>
                    )}
                </div>

                {/* Velo de la hoja móvil */}
                {sel && <div onClick={cerrar} className="lg:hidden fixed inset-0 z-[790] bg-black/50 catalog-overlay-in" />}

                {/* Pedido: columna derecha en escritorio, hoja inferior en el teléfono */}
                <div className={`min-h-0 flex-col lg:flex lg:flex-1 lg:min-w-0 lg:min-h-0 lg:h-auto lg:overflow-hidden lg:static lg:z-auto lg:max-h-none lg:rounded-none lg:border-0 lg:shadow-none lg:bg-surface-2/40 lg:dark:bg-white/[0.01] ${sel
                    ? "flex fixed inset-x-0 bottom-0 z-[800] h-[90vh] rounded-t-3xl border-t border-border/20 dark:border-white/10 bg-white dark:bg-surface-dark-2 shadow-[0_-8px_30px_rgba(0,0,0,0.3)] sheet-up safe-area-bottom"
                    : "hidden"}`}>
                    {sel && (
                        <div className="lg:hidden shrink-0 pt-2.5 pb-1 px-5 flex items-center justify-between border-b border-border/10 dark:border-white/[0.06] relative">
                            <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-border dark:bg-white/20" />
                            <p className="text-[12px] font-medium text-content-subtle mt-2">Pedido</p>
                            <button onClick={cerrar} aria-label="Cerrar" className="mt-2 w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    )}
                    {sel ? (
                        <Detalle key={sel} id={sel} onChanged={load} onClose={cerrar} />
                    ) : (
                        <div className="hidden lg:flex flex-1 items-center justify-center p-8 text-center">
                            <div>
                                <div className="w-12 h-12 mx-auto rounded-xl bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                </div>
                                <p className="mt-3 text-[14px] font-medium text-content dark:text-white">Elige un pedido</p>
                                <p className="text-[12px] text-content-subtle mt-0.5">Lo revisas completo antes de aceptarlo.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Page>
    );
}
