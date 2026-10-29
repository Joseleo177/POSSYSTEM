import { useCallback, useEffect, useRef, useState } from "react";
import { publicApi } from "../services/api";
import { fmtTime } from "../helpers/dates";
import { resolveImageUrl } from "../helpers/image";
import { applyBrandColor } from "../helpers/brandColor";
import MenuMesaPublico from "../components/mesas/MenuMesaPublico";

// La página del QR de la mesa (/mesa/<código>): el cliente, desde su teléfono, ve cómo va cada
// ronda en la cocina, lo que lleva pedido y cuánto va la cuenta, y la pide sin levantar la
// mano. Va fuera de la sesión del sistema, como el catálogo público (ver App.jsx). Se refresca
// sola cada 15 s: en Vercel no hay conexiones abiertas, así que no hay aviso en vivo.
//
// Segunda vuelta (29-10-2026, "puede ser más animada para que el cliente vea"): la cocina se
// ve trabajar. Cada ronda tiene su paso a paso con iconos —el recibo, la llama que titila
// mientras se prepara, la campana cuando está lista— y la barra brilla mientras avanza. Cuando
// una ronda pasa a lista, el aviso suena (la campana se mueve) y el teléfono vibra. Va en el
// color de la tienda, el mismo de su catálogo: antes salía en el rosa de NXUS.

const CADA = 15000;

// Cómo se le dice al cliente cada estado de la cocina.
const ESTADO = {
    nueva:      { txt: "Recibido",       paso: 1, tono: "text-sky-700",     pill: "bg-sky-500/10" },
    preparando: { txt: "En preparación", paso: 2, tono: "text-amber-700",   pill: "bg-amber-500/15" },
    lista:      { txt: "Listo, ya sale", paso: 3, tono: "text-emerald-700", pill: "bg-emerald-500/15" },
    entregada:  { txt: "Servido",        paso: 4, tono: "text-neutral-500", pill: "bg-black/[0.05]" },
};

const I = {
    recibo: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    llama: "M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z",
    campana: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
    cuenta: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z",
    mas: "M12 5v14M5 12h14",
    reloj: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
};
const PASOS = [
    { label: "Recibido", d: I.recibo },
    { label: "Preparando", d: I.llama },
    { label: "Listo", d: I.campana },
];

const cant = (q) => {
    const n = Number(q || 0);
    return Number.isInteger(n) ? String(n) : n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
};
const dinero = (n, sym) => `${sym}${sym.length > 1 ? " " : ""}${Number(n || 0).toFixed(2)}`;

const Ico = ({ d, className = "w-5 h-5", w = 1.9 }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={w} d={d} /></svg>
);
const Check = ({ className = "w-4 h-4", draw = false }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path className={draw ? "check-draw" : ""} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M5 13l4 4L19 7" /></svg>
);

const TARJETA = "rounded-[22px] bg-white ring-1 ring-black/[0.05] shadow-[0_1px_3px_rgba(0,0,0,0.05)]";

function Ronda({ r, index }) {
    const e = ESTADO[r.status] || ESTADO.nueva;
    const servida = r.status === "entregada";
    const lista = r.status === "lista";
    return (
        <div style={{ "--i": index }}
            className={`rise-in ${TARJETA} px-4 py-4 transition-shadow ${lista ? "ring-2 ring-emerald-500 shadow-[0_10px_28px_-12px_rgba(16,185,129,.7)]" : ""}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="text-[13px] text-neutral-500 tabular-nums">
                    <span className="font-semibold text-neutral-900">Ronda {r.n}</span> · {fmtTime(r.sent_at)}
                </div>
                <span className={`h-7 px-2.5 rounded-full text-[12px] font-semibold flex items-center gap-1.5 ${e.tono} ${e.pill}`}>
                    {r.status === "preparando" && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
                    {r.status === "nueva" && <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />}
                    {(lista || servida) && <Check className="w-3.5 h-3.5" />}
                    {e.txt}
                </span>
            </div>

            {/* Recibido → Preparando → Listo, con icono por paso. Servido ya no necesita la barra. */}
            {!servida && (
                <div className="mt-4 grid grid-cols-3" aria-label={`Estado: ${e.txt}`}>
                    {PASOS.map((p, i) => {
                        const hecho = i < e.paso;
                        const actual = i === e.paso - 1;
                        const color = lista ? "bg-emerald-500" : "bg-brand-500";
                        return (
                            <div key={p.label} className="relative flex flex-col items-center">
                                {i > 0 && (
                                    <span className="absolute top-[17px] right-1/2 w-full h-1 rounded-full bg-black/[0.07] overflow-hidden" aria-hidden="true">
                                        <span className={`block h-full rounded-full transition-all duration-700 ${color} ${hecho ? "w-full" : "w-0"}`} />
                                        {actual && !lista && <span className="absolute inset-0 bar-shimmer" />}
                                    </span>
                                )}
                                <span className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-500 ${hecho ? `${color} text-white` : "bg-black/[0.05] text-neutral-400"} ${actual && !lista ? "ring-4 ring-brand-500/20" : ""}`}>
                                    <span className={actual && i === 1 ? "flame-flicker" : actual && i === 2 ? "bell-ring" : ""}>
                                        <Ico d={p.d} className="w-[18px] h-[18px]" />
                                    </span>
                                </span>
                                <span className={`mt-1.5 text-[11px] ${hecho ? "font-semibold text-neutral-900" : "text-neutral-400"}`}>{p.label}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <ul className={`mt-4 pt-3 border-t border-black/[0.06] space-y-2 ${servida ? "opacity-60" : ""}`}>
                {r.items.map((it, i) => (
                    <li key={i} className="flex gap-3 text-[14px] text-neutral-900">
                        <span className="h-6 min-w-[24px] px-1.5 rounded-lg bg-black/[0.05] text-[12px] font-bold tabular-nums flex items-center justify-center shrink-0">{cant(it.quantity)}</span>
                        <span className="min-w-0 pt-0.5">
                            {it.name}
                            {it.modifiers && <span className="block text-[12px] text-neutral-500 leading-snug mt-0.5">{it.modifiers}</span>}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default function MesaPublicPage({ token }) {
    const [d, setD] = useState(null);
    const [error, setError] = useState(null);
    const [pidiendo, setPidiendo] = useState(false);
    const [avisoError, setAvisoError] = useState(null);
    const [menuAbierto, setMenuAbierto] = useState(false);
    const [enviado, setEnviado] = useState(null);   // aviso tras mandar un pedido

    const yaCargo = useRef(false);
    // Huella de lo que se ve: si nada cambió, el servidor responde con una consulta liviana y
    // aquí no se toca nada (ver utils/huella.js en el backend).
    const huella = useRef(null);
    const cargar = useCallback(async () => {
        try {
            const r = await publicApi.mesa(token, huella.current);
            if (r.unchanged) return;
            huella.current = r.v || null;
            setD(r.data);
            setError(null);
            yaCargo.current = true;
        } catch (e) {
            // Sin conexión un momento no borra lo que ya se ve; un código malo sí.
            if (e?.status === 404) setError(e.message || "Esta mesa no existe");
            else if (!yaCargo.current) setError(e?.message || "No se pudo cargar la mesa");
        }
    }, [token]);

    useEffect(() => {
        cargar();
        const t = setInterval(() => { if (document.visibilityState === "visible") cargar(); }, CADA);
        const alVolver = () => { if (document.visibilityState === "visible") cargar(); };
        document.addEventListener("visibilitychange", alVolver);
        return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); };
    }, [cargar]);

    useEffect(() => {
        if (d?.table?.name) document.title = `${d.table.name} · ${d.store?.name || ""}`;
    }, [d?.table?.name, d?.store?.name]);

    // El color de la tienda, el mismo que pinta su catálogo.
    useEffect(() => {
        if (d?.store?.brand_color) applyBrandColor(d.store.brand_color);
    }, [d?.store?.brand_color]);

    // Una ronda que acaba de pasar a "lista": el teléfono vibra. Solo con el cambio, no al
    // abrir la página con algo ya listo (eso ya lo dice el aviso verde).
    const listasAntes = useRef(null);
    useEffect(() => {
        if (!d) return;
        const ahora = new Set(d.rounds.filter(r => r.status === "lista").map(r => r.n));
        if (listasAntes.current && [...ahora].some(n => !listasAntes.current.has(n))) {
            try { navigator.vibrate?.([120, 80, 120]); } catch { /* sin vibración */ }
        }
        listasAntes.current = ahora;
    }, [d]);

    const pedirCuenta = async () => {
        setPidiendo(true);
        setAvisoError(null);
        try {
            const r = await publicApi.pedirCuenta(token);
            huella.current = r.v || null;
            setD(r.data);
        } catch (e) {
            setAvisoError(e?.message || "No se pudo avisar. Intenta de nuevo.");
        } finally { setPidiendo(false); }
    };

    if (error) {
        return (
            <div className="min-h-[100dvh] bg-[#F6F4F1] flex items-center justify-center px-6 text-center">
                <div>
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/10 text-red-600 flex items-center justify-center mb-4">
                        <Ico d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" className="w-7 h-7" />
                    </div>
                    <div className="text-[16px] font-semibold text-neutral-900">{error}</div>
                    <div className="text-[14px] text-neutral-500 mt-1">Pídele ayuda al mesonero.</div>
                </div>
            </div>
        );
    }
    if (!d) {
        return (
            <div className="min-h-[100dvh] bg-[#F6F4F1] flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const sym = d.currency?.symbol || "Ref.";
    const enBs = d.currency?.bs_rate && d.currency?.bs_symbol ? d.total * d.currency.bs_rate : null;
    const hayListas = d.rounds.some(r => r.status === "lista");
    const enCocina = d.rounds.filter(r => r.status === "nueva" || r.status === "preparando").length;

    return (
        <div className="min-h-[100dvh] bg-[#F6F4F1] text-neutral-900">
            <div className="max-w-[560px] mx-auto px-4 pb-12">
                {/* Cabecera: la tienda y la mesa, en el color de la tienda, con el "en vivo"
                    que dice que esto se mueve solo. */}
                <header className="rise-in relative mt-4 mb-4 rounded-[28px] overflow-hidden bg-brand-500 text-brand-ink px-5 pt-5 pb-5 shadow-[0_18px_40px_-18px_rgb(var(--c-brand-700)/0.9)]">
                    <span className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" aria-hidden="true" />
                    <span className="absolute -right-10 -top-12 w-44 h-44 rounded-full bg-white/10" aria-hidden="true" />
                    <span className="absolute -right-4 top-16 w-24 h-24 rounded-full bg-white/[0.07]" aria-hidden="true" />
                    <div className="relative flex items-center gap-3">
                        {d.store.logo_url && (
                            <span className="h-12 max-w-[120px] px-2 rounded-2xl bg-black/25 backdrop-blur flex items-center">
                                <img src={resolveImageUrl(d.store.logo_url)} alt="" className="h-9 w-auto object-contain" />
                            </span>
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="text-[13px] opacity-85 truncate">{d.store.name}</div>
                            <span className="mt-1 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-black/20 text-[11px] font-semibold">
                                <span className="relative flex w-2 h-2">
                                    <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping" />
                                    <span className="relative w-2 h-2 rounded-full bg-emerald-400" />
                                </span>
                                En vivo
                            </span>
                        </div>
                    </div>
                    <div className="relative mt-5">
                        <h1 className="font-display text-[38px] font-bold tracking-tight leading-none">{d.table.name}</h1>
                        <div className="mt-1.5 text-[14px] opacity-90">
                            {d.table.area ? `${d.table.area} · ` : ""}
                            {!d.open ? "Bienvenido" : enCocina > 0 ? `${enCocina} ${enCocina === 1 ? "ronda" : "rondas"} en la cocina` : "Todo servido"}
                        </div>
                    </div>
                </header>

                {/* Pedir desde el QR (si el restaurante lo permite) */}
                {d.ordering && (
                    <div className="mb-5">
                        <button onClick={() => { setEnviado(null); setMenuAbierto(true); }}
                            className={`w-full h-14 rounded-[20px] text-[15px] font-semibold flex items-center gap-3 pl-2 pr-5 active:scale-[0.99] transition-all ${d.open ? `${TARJETA} hover:ring-black/[0.12]` : "bg-neutral-900 text-white shadow-lg"}`}>
                            <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${d.open ? "bg-brand-500 text-brand-ink" : "bg-white/15"}`}>
                                <Ico d={I.mas} className="w-5 h-5" w={2.4} />
                            </span>
                            <span className="flex-1 text-left">{d.open ? "Pedir algo más" : "Hacer mi pedido"}</span>
                            <Ico d="M9 5l7 7-7 7" className="w-4 h-4 opacity-50" w={2.2} />
                        </button>
                        {enviado && (
                            <div className="cart-toast-in mt-2.5 rounded-[20px] bg-emerald-500 text-white px-4 py-3 text-[14px] font-medium flex items-center gap-3 shadow-[0_10px_24px_-12px_rgba(16,185,129,.9)]">
                                <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0"><Check draw /></span>
                                {enviado}
                            </div>
                        )}
                    </div>
                )}

                {/* Pedidos hechos desde aquí que todavía no son una ronda */}
                {d.qr_orders?.length > 0 && (
                    <section className="mb-5 space-y-2">
                        {d.qr_orders.map((o, i) => (
                            <div key={o.id} style={{ "--i": i }}
                                className={`rise-in rounded-[20px] px-4 py-3.5 flex gap-3 ${o.status === "rechazado" ? "bg-white ring-1 ring-red-500/40" : "bg-amber-50 ring-1 ring-amber-500/40"}`}>
                                <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${o.status === "rechazado" ? "bg-red-500/10 text-red-600" : "bg-amber-500/15 text-amber-700"}`}>
                                    {o.status === "rechazado"
                                        ? <Ico d="M6 18L18 6M6 6l12 12" className="w-4 h-4" w={2.4} />
                                        : <Ico d={I.reloj} className="w-[18px] h-[18px] animate-spin [animation-duration:3s]" />}
                                </span>
                                <div className="min-w-0">
                                    <div className={`text-[13px] font-semibold ${o.status === "rechazado" ? "text-red-700" : "text-amber-800"}`}>
                                        {o.status === "rechazado" ? "El mesonero no pudo tomar este pedido" : "Esperando que el mesonero lo confirme"}
                                    </div>
                                    <div className="text-[14px] text-neutral-900 mt-0.5">{o.summary}</div>
                                    {o.status === "rechazado" && o.reason && <div className="text-[13px] text-neutral-500 mt-0.5">{o.reason}</div>}
                                </div>
                            </div>
                        ))}
                    </section>
                )}

                {!d.open ? (
                    d.qr_orders?.length ? null : (
                        <div className={`rise-in ${TARJETA} px-5 py-9 text-center`}>
                            <div className="relative w-20 h-20 mx-auto">
                                <span className="absolute inset-0 rounded-[28px] bg-brand-500/10 rotate-6" aria-hidden="true" />
                                <span className="absolute inset-0 rounded-[28px] bg-white ring-1 ring-black/[0.06] flex items-center justify-center text-brand-500">
                                    <Ico d={I.llama} className="w-9 h-9" w={1.6} />
                                </span>
                            </div>
                            <div className="mt-5 font-display text-[19px] font-bold">Todavía no hay un pedido en esta mesa</div>
                            <div className="text-[14px] text-neutral-500 mt-1.5 max-w-[320px] mx-auto">
                                {d.ordering
                                    ? "Pide desde aquí o al mesonero: después vas a ver cómo va en la cocina."
                                    : "Cuando el mesonero tome tu pedido, aquí vas a ver cómo va en la cocina."}
                            </div>
                            {!d.ordering && d.store.menu_url && (
                                <a href={d.store.menu_url} className="btn-accent inline-flex items-center justify-center h-12 px-6 rounded-full text-[15px] font-semibold mt-5">Ver el menú</a>
                            )}
                        </div>
                    )
                ) : (
                    <div className="space-y-6">
                        {hayListas && (
                            <div className="cart-toast-in rounded-[20px] bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-4 py-3.5 flex items-center gap-3 shadow-[0_12px_28px_-12px_rgba(16,185,129,.9)]">
                                <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                    <span className="bell-ring"><Ico d={I.campana} className="w-5 h-5" w={2} /></span>
                                </span>
                                <div>
                                    <div className="text-[15px] font-semibold">¡Tu pedido está listo!</div>
                                    <div className="text-[13px] opacity-90">Ya te lo llevan a la mesa.</div>
                                </div>
                            </div>
                        )}

                        <section>
                            <h2 className="font-display text-[17px] font-bold mb-2.5 px-1">Tu pedido</h2>
                            {d.rounds.length === 0 ? (
                                <div className={`${TARJETA} px-4 py-4 text-[14px] text-neutral-500 flex items-center gap-3`}>
                                    <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                                    Tu pedido todavía no llega a la cocina.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {[...d.rounds].reverse().map((r, i) => <Ronda key={r.n} r={r} index={i} />)}
                                </div>
                            )}
                        </section>

                        <section>
                            <h2 className="font-display text-[17px] font-bold mb-2.5 px-1">Tu cuenta</h2>
                            <div className={`${TARJETA} overflow-hidden`}>
                                <ul className="px-4 pt-3.5 space-y-2">
                                    {d.lines.map((l, i) => (
                                        <li key={i} style={{ "--i": i }} className="rise-in flex items-baseline justify-between gap-3 text-[14px]">
                                            <span className="min-w-0"><span className="tabular-nums text-neutral-500">{cant(l.quantity)} × </span>{l.name}</span>
                                            <span className="tabular-nums shrink-0">{dinero(l.subtotal, sym)}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-3.5 px-4 py-3.5 bg-black/[0.03] border-t border-black/[0.05] flex items-baseline justify-between">
                                    <span className="text-[14px] font-semibold">Total</span>
                                    <span className="text-right">
                                        <span className="block font-display text-[26px] font-bold tracking-tight tabular-nums leading-none">{dinero(d.total, sym)}</span>
                                        {enBs != null && <span className="block text-[13px] text-neutral-500 tabular-nums mt-1">{dinero(enBs, d.currency.bs_symbol)}</span>}
                                    </span>
                                </div>
                            </div>
                            <p className="mt-2 px-1 text-[12px] text-neutral-500">El monto final te lo confirma el mesonero al cobrar.</p>
                        </section>

                        {d.bill_requested ? (
                            <div className={`rise-in ${TARJETA} px-4 py-4 flex items-center gap-3`}>
                                <span className="w-11 h-11 rounded-full bg-brand-500 text-brand-ink flex items-center justify-center shrink-0">
                                    <span className="bell-ring"><Ico d={I.campana} className="w-5 h-5" w={2} /></span>
                                </span>
                                <div>
                                    <div className="text-[15px] font-semibold flex items-center gap-1.5">Ya pediste la cuenta <Check className="w-4 h-4 text-emerald-600" /></div>
                                    <div className="text-[13px] text-neutral-500">
                                        El mesonero viene en camino<span className="dot-wave ml-0.5"><span>.</span><span>.</span><span>.</span></span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <button onClick={pedirCuenta} disabled={pidiendo}
                                    className="btn-accent w-full h-14 rounded-full text-[15px] font-semibold flex items-center justify-center gap-2.5 disabled:opacity-60 active:scale-[0.99] transition-transform">
                                    {pidiendo
                                        ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        : <Ico d={I.cuenta} className="w-5 h-5" w={2} />}
                                    Pedir la cuenta
                                </button>
                                {avisoError && <p className="mt-2 text-[13px] text-red-600 text-center">{avisoError}</p>}
                            </div>
                        )}

                        {!d.ordering && d.store.menu_url && (
                            <a href={d.store.menu_url} className="block text-center text-[14px] font-medium text-brand-700 py-2">Ver el menú</a>
                        )}
                    </div>
                )}
            </div>

            {menuAbierto && (
                <MenuMesaPublico token={token} mesa={d.table.name} sym={sym} modo={d.ordering}
                    onClose={() => setMenuAbierto(false)}
                    onEnviado={(r) => {
                        huella.current = r.v || null;
                        setD(r.data);
                        setMenuAbierto(false);
                        setEnviado(d.ordering === "directo" ? "Tu pedido salió a la cocina." : "Pedido enviado: el mesonero lo confirma en un momento.");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                    }} />
            )}
        </div>
    );
}
