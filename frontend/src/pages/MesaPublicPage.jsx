import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publicApi } from "../services/api";
import { fmtTime } from "../helpers/dates";
import { resolveImageUrl } from "../helpers/image";
import { applyBrandColor } from "../helpers/brandColor";
import { pintarFondo, fijarDocumento } from "../helpers/fondoPagina";
import MenuMesaPublico from "../components/mesas/MenuMesaPublico";
import MedidorDebug from "../components/mesas/MedidorDebug";
import QuienSoy, { aparato, leerRegistro, guardarRegistro, omitido, nombreDePila } from "../components/mesas/QuienSoy";

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

// 31-10-2026, "más limpio": un icono con el estado y una barra fina de tres tramos, en vez de
// tres círculos con su rótulo, una píldora y un aro verde alrededor de la tarjeta.
function Ronda({ r, index }) {
    const e = ESTADO[r.status] || ESTADO.nueva;
    const servida = r.status === "entregada";
    const lista = r.status === "lista";
    const icono = servida ? null : r.status === "preparando" ? I.llama : lista ? I.campana : I.recibo;
    return (
        <div style={{ "--i": index }} className={`rise-in ${TARJETA} px-4 py-4`}>
            <div className="flex items-center gap-3">
                <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${e.pill} ${e.tono}`}>
                    {servida
                        ? <Check className="w-[18px] h-[18px]" />
                        : <span className={r.status === "preparando" ? "flame-flicker" : lista ? "bell-ring" : ""}><Ico d={icono} className="w-5 h-5" /></span>}
                </span>
                <div className="min-w-0 flex-1">
                    <div className={`text-[15px] font-semibold leading-tight ${servida ? "text-neutral-500" : "text-neutral-900"}`}>{e.txt}</div>
                    <div className="text-[12px] text-neutral-500 tabular-nums mt-0.5">Ronda {r.n} · {fmtTime(r.sent_at)}</div>
                </div>
            </div>

            {/* Recibido → Preparando → Listo. Servido ya no necesita la barra. */}
            {!servida && (
                <div className="mt-3.5 grid grid-cols-3 gap-1.5" aria-label={`Estado: ${e.txt}`}>
                    {PASOS.map((p, i) => {
                        const hecho = i < e.paso;
                        const actual = i === e.paso - 1;
                        return (
                            <span key={p.label} className="relative h-1.5 rounded-full bg-black/[0.07] overflow-hidden" aria-hidden="true">
                                <span className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${lista ? "bg-emerald-500" : "bg-brand-500"} ${hecho ? "w-full" : "w-0"}`} />
                                {actual && !lista && <span className="absolute inset-0 bar-shimmer" />}
                            </span>
                        );
                    })}
                </div>
            )}

            <Lineas items={r.items} apagada={servida} />
        </div>
    );
}

// Lo que lleva una ronda o un pedido: cantidad, plato y debajo sus adicionales.
function Lineas({ items, apagada = false }) {
    return (
        <ul className={`mt-3.5 pt-3 border-t border-black/[0.06] space-y-1.5 ${apagada ? "opacity-60" : ""}`}>
            {items.map((it, i) => (
                <li key={i} className="flex gap-2.5 text-[14px] text-neutral-900">
                    <span className="w-5 text-right text-neutral-500 tabular-nums shrink-0">{cant(it.quantity)}</span>
                    <span className="min-w-0">
                        {it.name}
                        {it.modifiers && <span className="block text-[12px] text-neutral-500 leading-snug">{it.modifiers}</span>}
                    </span>
                </li>
            ))}
        </ul>
    );
}

// "2 × Lomo apanado (Papas fritas), 1 × Café" → líneas. Así arma el resumen el servidor
// (mesaPublica.pedir); se parte solo antes de "N × " para no romper un nombre con coma.
const lineasDe = (summary) => String(summary || "").split(/, (?=\d+(?:[.,]\d+)? × )/).filter(Boolean).map(t => {
    const m = /^(\d+(?:[.,]\d+)?) × (.+?)(?: \(([^()]*)\))?$/.exec(t.trim());
    return m ? { quantity: m[1].replace(",", "."), name: m[2], modifiers: m[3] || null } : { quantity: "", name: t, modifiers: null };
});

// Un pedido hecho desde el QR que todavía no es una ronda: espera al mesonero, o lo rechazó.
// 31-10-2026: antes era una franja con el resumen en una sola línea corrida y no se leía qué
// se estaba esperando; ahora va como una ronda más, con cada plato en su línea.
function PedidoQr({ o, index }) {
    const rechazado = o.status === "rechazado";
    return (
        <div style={{ "--i": index }} className={`rise-in ${TARJETA} px-4 py-4`}>
            <div className="flex items-center gap-3">
                <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${rechazado ? "bg-red-500/10 text-red-600" : "bg-amber-500/15 text-amber-700"}`}>
                    {rechazado
                        ? <Ico d="M6 18L18 6M6 6l12 12" className="w-[18px] h-[18px]" w={2.2} />
                        : <Ico d={I.reloj} className="w-5 h-5 animate-spin [animation-duration:3s]" />}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold leading-tight text-neutral-900">
                        {rechazado ? "El mesonero no pudo tomarlo" : "Esperando al mesonero"}
                    </div>
                    <div className={`text-[12px] mt-0.5 ${rechazado ? "text-red-600" : "text-neutral-500"}`}>
                        {rechazado ? (o.reason || "Pídeselo directamente al mesonero.") : `Enviado a las ${fmtTime(o.created_at)} · lo confirma y pasa a la cocina`}
                    </div>
                </div>
            </div>
            <Lineas items={lineasDe(o.summary)} apagada={rechazado} />
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

    // El botón de actualizar (junto a "En vivo"): la misma consulta de cada 15 s, con la huella,
    // así que si nada cambió cuesta lo mismo de poco. El giro dura al menos medio segundo para
    // que el cliente vea que hizo algo aunque la respuesta sea instantánea.
    const [actualizando, setActualizando] = useState(false);
    const actualizar = async () => {
        setActualizando(true);
        await Promise.all([cargar(), new Promise(r => setTimeout(r, 600))]);
        setActualizando(false);
    };

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

    // El fondo del documento y la barra del navegador, del color de esta página: en un iPhone en
    // modo oscuro quedaba una franja negra sobre la barra de abajo (ver helpers/fondoPagina.js).
    // Y el documento no se desplaza: la página lo hace en su propio contenedor (ver fijarDocumento).
    useEffect(() => {
        const soltarFondo = pintarFondo("#F6F4F1");
        const soltarDocumento = fijarDocumento();
        return () => { soltarDocumento(); soltarFondo(); };
    }, []);
    const contenedorRef = useRef(null);
    // La barra del navegador (la zona de la hora en Safari) en el color de la cabecera, que ahora
    // llega hasta arriba. Al salir, pintarFondo deja las etiquetas como estaban.
    const colorCabecera = d ? (d.store.cover_url ? "#171717" : d.store.brand_color ? `#${String(d.store.brand_color).replace("#", "")}` : null) : null;
    useEffect(() => {
        if (!colorCabecera || menuAbierto) return;
        document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", colorCabecera));
    }, [colorCabecera, menuAbierto]);

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

    // ── Quién es el cliente (31-10-2026, services/mesaClientes.js) ──────────────────────────
    // Solo si la tienda lo encendió. Reconocido sin confirmar → "¿Eres José?". Sin reconocer →
    // se prueba con su identidad del catálogo (mismo dominio) y, si no, "¿Quién eres?" con su
    // cédula. Siempre se puede decir "Ahora no".
    const disp = useMemo(() => aparato(), []);
    const clientesOn = !!d?.customers;
    const tienda = d?.store?.name || token;
    const [yo, setYo] = useState(null);           // { customer: { name, confirmed }, suggestions }
    const [registro, setRegistro] = useState(null);
    const [hoja, setHoja] = useState(null);       // "eres" | "quien" | null
    const yaPregunto = useRef(false);

    useEffect(() => {
        if (!clientesOn || !disp || yaPregunto.current) return;
        yaPregunto.current = true;
        (async () => {
            let y = null;
            try { y = (await publicApi.mesaYo(token, disp)).data; setYo(y); } catch { return; }
            if (y?.customer) { if (!y.customer.confirmed) setHoja("eres"); return; }
            const reg = leerRegistro(tienda);
            if (reg) { setRegistro(reg); return; }
            // Ya se identificó en el catálogo de la tienda desde este teléfono: no se le pregunta.
            const slug = String(d.store.menu_url || "").split("/catalogo/")[1];
            let delCatalogo = null;
            try { delCatalogo = slug ? JSON.parse(localStorage.getItem(`catalog_identity_${slug}`) || "null") : null; } catch { /* nada */ }
            if (delCatalogo?.document) {
                try {
                    const r = await publicApi.mesaIdentificar(token, disp, delCatalogo.document);
                    if (r.data?.found) { setYo(r.data); return; }
                } catch { /* se pregunta */ }
            }
            if (!omitido(tienda)) setHoja("quien");
        })();
    }, [clientesOn, disp]); // eslint-disable-line react-hooks/exhaustive-deps

    const confirmado = yo?.customer?.confirmed ? yo : null;
    const saludo = confirmado ? confirmado.customer.name : registro ? nombreDePila(registro.name) : null;
    const hojaQuien = hoja && (
        <QuienSoy modo={hoja} nombre={yo?.customer?.name} tienda={tienda}
            onSi={async () => setYo((await publicApi.mesaConfirmar(token, disp, true)).data)}
            onNo={async () => setYo((await publicApi.mesaConfirmar(token, disp, false)).data)}
            onCedula={async (doc) => {
                const r = (await publicApi.mesaIdentificar(token, disp, doc)).data;
                if (r.found) { setYo(r); return { found: true, name: r.customer?.name }; }
                return { found: false, document: r.document };
            }}
            onRegistro={(reg) => { guardarRegistro(tienda, reg); setRegistro(reg); }}
            onClose={() => setHoja(null)} />
    );

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

    // Como en la vitrina (30-10-2026): de cara al cliente la moneda base es "$", no "Ref.".
    const base = d.currency?.symbol || "";
    const sym = !base || /^(ref\.?|usd|\$)$/i.test(base) ? "$" : base;
    const enBs = d.currency?.bs_rate && d.currency?.bs_symbol ? d.total * d.currency.bs_rate : null;
    const hayListas = d.rounds.some(r => r.status === "lista");
    const enCocina = d.rounds.filter(r => r.status === "nueva" || r.status === "preparando").length;
    const porConfirmar = (d.qr_orders || []).some(o => o.status === "pendiente");
    const yaPidio = d.open || porConfirmar;
    // Lo que la mesa ya pidió y todavía no llega: se ve también dentro de la carta, para no
    // pedir dos veces lo mismo mientras se espera.
    const enCurso = [
        ...(d.qr_orders || []).filter(o => o.status === "pendiente")
            .map(o => ({ estado: "Esperando al mesonero", tono: "bg-amber-500", items: lineasDe(o.summary) })),
        ...d.rounds.filter(r => r.status !== "entregada")
            .map(r => ({ estado: (ESTADO[r.status] || ESTADO.nueva).txt, tono: r.status === "lista" ? "bg-emerald-500" : r.status === "preparando" ? "bg-amber-500" : "bg-sky-500", items: r.items })),
    ];

    return (
        // La página se desplaza en su propio contenedor, no el documento (ver fijarDocumento): en
        // Brave del iPhone el documento se corría 71 px y la cabecera quedaba bajo la hora. La
        // cabecera va de borde a borde arriba.
        <div ref={contenedorRef} className="fixed inset-0 overflow-y-auto overscroll-contain bg-[#F6F4F1] text-neutral-900 pb-[env(safe-area-inset-bottom)]">
            <div className="max-w-[560px] mx-auto px-4 pb-12">
                {/* Cabecera: la tienda y la mesa, en el color de la tienda, con el "en vivo"
                    que dice que esto se mueve solo. */}
                {/* 31-10-2026, "más limpio": sin círculos de adorno ni el nombre repetido al lado
                    del logo. El logo (o el nombre, si no hay logo) y el "en vivo" arriba; la mesa
                    y cómo va, abajo. */}
                <header className={`rise-in relative -mx-4 mb-4 rounded-b-[28px] overflow-hidden px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-5 ${d.store.cover_url ? "bg-neutral-900 text-white" : "bg-brand-500 text-brand-ink"}`}>
                    {/* Con foto del local (la portada de su catálogo), la cabecera es esa foto. */}
                    {d.store.cover_url ? (
                        <>
                            <img src={resolveImageUrl(d.store.cover_url)} alt="" className="hero-zoom absolute inset-0 w-full h-full object-cover" />
                            <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/25" aria-hidden="true" />
                        </>
                    ) : (
                        <span className="absolute inset-0 bg-gradient-to-b from-white/10 to-black/10" aria-hidden="true" />
                    )}
                    <div className="relative flex items-center justify-between gap-3 min-h-[40px]">
                        {d.store.logo_url ? (
                            <span className="h-10 max-w-[160px] px-2.5 rounded-xl flex items-center" style={{ backgroundColor: d.store.bg_color || "#FFFFFF" }}>
                                <img src={resolveImageUrl(d.store.logo_url)} alt={d.store.name} className="h-7 w-auto object-contain" />
                            </span>
                        ) : (
                            <span className="text-[14px] font-semibold truncate">{d.store.name}</span>
                        )}
                        <span className="shrink-0 flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-black/15 text-[12px] font-medium">
                                <span className="relative flex w-1.5 h-1.5">
                                    <span className="absolute inset-0 rounded-full bg-emerald-300 animate-ping" />
                                    <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-300" />
                                </span>
                                En vivo
                            </span>
                            {/* Actualizar a mano: la página ya no se refresca deslizando hacia abajo
                                (el documento está fijo, ver fijarDocumento). */}
                            <button type="button" onClick={actualizar} disabled={actualizando} aria-label="Actualizar"
                                className="w-8 h-8 rounded-full bg-black/15 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-80">
                                <svg className={`w-4 h-4 ${actualizando ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12a8 8 0 01-14.3 4.9M4 12a8 8 0 0114.3-4.9M18.5 3v4.2h-4.2M5.5 21v-4.2h4.2" />
                                </svg>
                            </button>
                        </span>
                    </div>
                    <div className="relative mt-7">
                        {/* El saludo: tocarlo pregunta "¿Eres José?" (por si el teléfono es de otro).
                            Sin reconocer, la invitación a identificarse. */}
                        {clientesOn && (saludo ? (
                            <button type="button" onClick={() => yo?.customer && setHoja("eres")} className="block mb-1.5 text-[15px] font-medium opacity-90">Hola, {saludo}</button>
                        ) : (
                            <button type="button" onClick={() => setHoja("quien")} className="block mb-1.5 text-[13px] font-medium opacity-85 underline underline-offset-4 decoration-current/40">¿Quién eres? Identifícate</button>
                        ))}
                        <h1 className="font-display text-[36px] font-bold tracking-tight leading-none">{d.table.name}</h1>
                        <div className="mt-2 text-[14px] opacity-85">
                            {d.table.area ? `${d.table.area} · ` : ""}
                            {porConfirmar && !enCocina && !hayListas ? "Pedido por confirmar" : !d.open ? (clientesOn && saludo ? "¿Qué vas a pedir hoy?" : "Bienvenido") : hayListas ? "Tu pedido está listo" : enCocina > 0 ? `${enCocina} ${enCocina === 1 ? "ronda" : "rondas"} en la cocina` : "Todo servido"}
                        </div>
                    </div>
                </header>

                {/* Pedir desde el QR (si el restaurante lo permite) */}
                {d.ordering && (
                    <div className="mb-5">
                        <button onClick={() => { setEnviado(null); setMenuAbierto(true); }}
                            className={`w-full h-14 rounded-[20px] text-[15px] font-semibold flex items-center gap-3 pl-2 pr-5 active:scale-[0.99] transition-all ${yaPidio ? `${TARJETA} hover:ring-black/[0.12]` : "bg-neutral-900 text-white shadow-lg"}`}>
                            <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${yaPidio ? "bg-brand-500 text-brand-ink" : "bg-white/15"}`}>
                                <Ico d={I.mas} className="w-5 h-5" w={2.4} />
                            </span>
                            <span className="flex-1 text-left">{yaPidio ? "Pedir algo más" : "Hacer mi pedido"}</span>
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
                    <section className="mb-6">
                        <h2 className="font-display text-[17px] font-bold mb-2.5 px-1">Por confirmar</h2>
                        <div className="space-y-3">
                            {d.qr_orders.map((o, i) => <PedidoQr key={o.id} o={o} index={i} />)}
                        </div>
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
                            <div className="cart-toast-in rounded-[20px] bg-emerald-600 text-white px-4 py-3.5 flex items-center gap-3">
                                <span className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
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
                            <div className={`${TARJETA} px-4`}>
                                <ul className="pt-3.5 space-y-2">
                                    {d.lines.map((l, i) => (
                                        <li key={i} style={{ "--i": i }} className="rise-in flex items-baseline gap-2.5 text-[14px]">
                                            <span className="w-5 text-right tabular-nums text-neutral-500 shrink-0">{cant(l.quantity)}</span>
                                            <span className="min-w-0 flex-1">{l.name}</span>
                                            <span className="tabular-nums shrink-0">{dinero(l.subtotal, sym)}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-3.5 py-3.5 border-t border-black/[0.06] flex items-baseline justify-between">
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
                <MenuMesaPublico token={token} mesa={d.table.name} area={d.table.area} store={d.store} sym={sym} modo={d.ordering} enCurso={enCurso}
                    cliente={confirmado} saludo={saludo}
                    // Con el pedido va el aparato (para reconocerlo después) y, si se registró en la
                    // mesa, sus datos: su ficha nace con este primer pedido.
                    extraPedido={clientesOn && disp ? { device: disp, ...(registro && !yo?.customer ? { registro } : {}) } : null}
                    onClose={() => setMenuAbierto(false)}
                    onEnviado={(r) => {
                        huella.current = r.v || null;
                        setD(r.data);
                        setMenuAbierto(false);
                        setEnviado(d.ordering === "directo" ? "Tu pedido salió a la cocina." : "Pedido enviado: el mesonero lo confirma en un momento.");
                        contenedorRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                        if (registro && clientesOn) {
                            guardarRegistro(tienda, null);
                            setRegistro(null);
                            publicApi.mesaYo(token, disp).then(x => setYo(x.data)).catch(() => {});
                        }
                    }} />
            )}
            {hojaQuien}
            {/* TEMPORAL: medidor con ?debug=1 (ver MedidorDebug). */}
            {new URLSearchParams(window.location.search).has("debug") && <MedidorDebug />}
        </div>
    );
}
