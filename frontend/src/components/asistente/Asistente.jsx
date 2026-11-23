// Asistente con IA (extra por empresa, ver services/asistente en el backend).
//
// - Botón flotante con el robot, en el color de la marca de la tienda. Solo aparece si la empresa
//   tiene el extra y el usuario el permiso assistant.use (lo decide la tienda en Roles). En la
//   caja y en Mesas se corre a la izquierda: a la derecha están Cobrar y la cuenta de la mesa.
// - El chat: en escritorio una columna a la derecha; en teléfono y tablet, una hoja inferior. Vive
//   en PosApp, así la conversación sigue al cambiar de pantalla.
//
// La conversación vive en memoria: al recargar empieza de cero. Al servidor se le reenvían los
// últimos mensajes para que entienda "¿y ayer?" después de "¿cuánto vendí hoy?".
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";

const EVENTO = "nxus:asistente";
export const abrirAsistente = () => window.dispatchEvent(new CustomEvent(EVENTO));

// Pantallas de trabajo con el pie ocupado (carrito y Cobrar, cuenta de la mesa y Enviar a
// cocina). En escritorio el botón sube por encima de la barra de atajos; en teléfono y tablet no
// se muestra ahí, porque taparía los botones de la venta.
const PIE_OCUPADO = ["Cobro", "Mesas"];

// Nombre legible de cada consulta del backend (services/asistente/herramientas.js).
const CONSULTAS = {
    resumen_ventas: "Ventas",
    productos_mas_vendidos: "Más vendidos",
    existencia_producto: "Existencias",
    productos_por_agotarse: "Por agotarse",
    cuentas_por_cobrar: "Cuentas por cobrar",
    ingresos_egresos: "Ingresos y egresos",
    margenes: "Márgenes",
    caja_turno: "Caja del turno",
    saldos_cajas_bancos: "Cajas y bancos",
    buscar_cliente: "Cliente",
    buscar_factura: "Factura",
    tasas_de_cambio: "Tasas",
    compras_proveedores: "Compras",
    cuentas_por_pagar: "Cuentas por pagar",
    productos_por_vencer: "Vencimientos",
    mermas: "Mermas",
    analisis_clientes: "Clientes",
    auditoria: "Auditoría",
    mesas_abiertas: "Mesas",
    comandas_cocina: "Cocina",
    comisiones: "Comisiones",
    propinas: "Propinas",
    agenda_citas: "Agenda",
    cobranza_sectores: "Cobranza",
    farmacia_recipes: "Récipes",
};

const PENSANDO = ["Pensando…", "Revisando tus números…", "Armando la respuesta…"];

// ── Robot ──────────────────────────────────────────────────────────────────────
// Dibujado a mano: cabeza redonda con antena, dos ojos que parpadean y una sonrisa. Toma el color
// del texto (currentColor) para ir blanco sobre la marca.
export function Robot({ className = "w-7 h-7", parpadea = true }) {
    return (
        <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <line x1="16" y1="4.5" x2="16" y2="8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="16" cy="3.6" r="1.9" fill="currentColor" />
            <rect x="5.5" y="8" width="21" height="17" rx="7" stroke="currentColor" strokeWidth="1.9" />
            <rect x="2.2" y="13.5" width="3.3" height="6" rx="1.6" fill="currentColor" />
            <rect x="26.5" y="13.5" width="3.3" height="6" rx="1.6" fill="currentColor" />
            <g className={parpadea ? "bot-blink" : ""}>
                <ellipse cx="12" cy="15.6" rx="2" ry="2.4" fill="currentColor" />
                <ellipse cx="20" cy="15.6" rx="2" ry="2.4" fill="currentColor" />
            </g>
            <path d="M12.3 20.6c1 .9 2.2 1.3 3.7 1.3s2.7-.4 3.7-1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

const Avatar = ({ size = "w-8 h-8", icon = "w-5 h-5" }) => (
    <span className={`${size} rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shrink-0`}>
        <Robot className={icon} parpadea={false} />
    </span>
);

function useDisponible() {
    const { company, can } = useApp();
    return !!company?.asistente_enabled && can("assistant.use");
}

// ── Formato de la respuesta ────────────────────────────────────────────────────
// Markdown mínimo: títulos, párrafos, listas, tablas y **negritas**. Se arma con nodos de React,
// nunca con HTML crudo.
function enLinea(texto) {
    return texto.split(/(\*\*[^*]+\*\*)/g).map((t, i) =>
        t.startsWith("**") && t.endsWith("**") && t.length > 4
            ? <strong key={i} className="font-semibold text-content dark:text-white">{t.slice(2, -2)}</strong>
            : <React.Fragment key={i}>{t}</React.Fragment>
    );
}

const celdas = (linea) => linea.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());

function Markdown({ texto }) {
    const lineas = texto.split("\n");
    const bloques = [];
    for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        // Tabla: fila de títulos + separador |---|
        if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1] || "")) {
            const cabeza = celdas(l);
            const filas = [];
            i += 2;
            while (i < lineas.length && /^\s*\|.*\|\s*$/.test(lineas[i])) { filas.push(celdas(lineas[i])); i++; }
            i--;
            bloques.push({ tipo: "tabla", cabeza, filas });
            continue;
        }
        const titulo = l.match(/^\s*#{1,4}\s+(.*)$/);
        if (titulo) { bloques.push({ tipo: "titulo", texto: titulo[1] }); continue; }
        const item = l.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
        if (item) {
            const ordenada = !!item[1];
            const ult = bloques[bloques.length - 1];
            if (ult?.tipo === "lista" && ult.ordenada === ordenada) ult.items.push(item[2]);
            else bloques.push({ tipo: "lista", ordenada, items: [item[2]] });
            continue;
        }
        if (l.trim()) bloques.push({ tipo: "p", texto: l.trim() });
    }
    return (
        <div className="space-y-2">
            {bloques.map((b, i) => {
                if (b.tipo === "titulo") return <p key={i} className="text-[13px] font-semibold text-content dark:text-white pt-1">{enLinea(b.texto.replace(/\*\*/g, ""))}</p>;
                if (b.tipo === "p") return <p key={i}>{enLinea(b.texto)}</p>;
                if (b.tipo === "tabla") return (
                    <div key={i} className="overflow-x-auto -mx-1">
                        <table className="w-full text-[12px] border-collapse">
                            <thead>
                                <tr>{b.cabeza.map((c, j) => <th key={j} className="text-left font-medium text-content-subtle px-2 py-1.5 border-b border-border/60 dark:border-white/10 whitespace-nowrap">{enLinea(c)}</th>)}</tr>
                            </thead>
                            <tbody>
                                {b.filas.map((f, j) => (
                                    <tr key={j} className="border-b border-border/40 dark:border-white/[0.06] last:border-0">
                                        {f.map((c, k) => <td key={k} className={`px-2 py-1.5 ${k > 0 ? "tabular-nums whitespace-nowrap" : ""}`}>{enLinea(c)}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
                return React.createElement(b.ordenada ? "ol" : "ul",
                    { key: i, className: `${b.ordenada ? "list-decimal" : "list-disc"} pl-5 space-y-1 marker:text-brand-500` },
                    b.items.map((it, j) => <li key={j} className="pl-0.5">{enLinea(it)}</li>));
            })}
        </div>
    );
}

// ── Iconos de las sugerencias de inicio ───────────────────────────────────────
const ICONOS = {
    ventas: "M3 3v18h18M7 15l4-4 3 3 5-6",
    ideas: "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0012 3z",
    inventario: "M20 7l-8-4-8 4m16 0v10l-8 4m8-14l-8 4m0 10L4 17V7m8 14V11M4 7l8 4",
    cobranza: "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm0 3h18M7 15h3",
    ayuda: "M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3m.1 4h.01M12 21a9 9 0 110-18 9 9 0 010 18z",
    plato: "M3 12h18M5 12a7 7 0 0114 0M12 5V3m-9 12h18",
};
const Icono = ({ d, className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

// ── Botón flotante ─────────────────────────────────────────────────────────────
function BotonFlotante({ pieOcupado, onClick }) {
    return (
        <button
            onClick={onClick}
            aria-label="Abrir a Asta"
            title="Pregúntale a Asta"
            className={`group fixed z-[55] fab-in right-4 md:right-5
                ${pieOcupado ? "hidden lg:flex lg:bottom-[84px]" : "flex bottom-[calc(env(safe-area-inset-bottom)+76px)] md:bottom-5"}
                h-14 w-14 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white
                shadow-[0_10px_28px_-6px_rgba(0,0,0,0.35)] ring-1 ring-black/5
                items-center justify-center transition-transform hover:scale-105 active:scale-95`}
        >
            <span className="bot-float"><Robot className="w-8 h-8" /></span>
            {/* Punto de "en línea" */}
            <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-surface-dark-2" />
            {/* Rótulo al pasar el mouse (solo escritorio: en táctil no hay hover y no hace falta) */}
            <span className={`hidden lg:block pointer-events-none absolute right-full mr-3 top-1/2 -translate-y-1/2
                whitespace-nowrap rounded-lg bg-content dark:bg-white text-white dark:text-content text-[12px] font-medium px-2.5 py-1.5
                opacity-0 group-hover:opacity-100 transition-opacity`}>
                Pregúntale a Asta
            </span>
        </button>
    );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
export default function AsistentePanel({ safeTab }) {
    const disponible = useDisponible();
    const { can, employee, company, storeName } = useApp();
    const [abierto, setAbierto] = useState(false);
    const [mensajes, setMensajes] = useState([]);
    const [texto, setTexto] = useState("");
    const [esperando, setEsperando] = useState(false);
    const [fase, setFase] = useState(0);
    const [cupo, setCupo] = useState(null);
    const [copiado, setCopiado] = useState(null);
    const finRef = useRef(null);
    const campoRef = useRef(null);

    useEffect(() => {
        const abrir = () => setAbierto(true);
        window.addEventListener(EVENTO, abrir);
        return () => window.removeEventListener(EVENTO, abrir);
    }, []);

    // Otra persona en el mismo navegador no hereda la conversación.
    useEffect(() => { setMensajes([]); setCupo(null); }, [employee?.id]);

    useEffect(() => {
        if (!abierto || !disponible) return;
        api.asistente.estado().then(r => setCupo(r.data)).catch(() => {});
        // En el teléfono no se enfoca: el teclado taparía las sugerencias.
        if (window.matchMedia("(min-width: 1024px)").matches) setTimeout(() => campoRef.current?.focus(), 60);
    }, [abierto, disponible]);

    useEffect(() => { finRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [mensajes, esperando]);

    // Texto de espera que cambia mientras el servidor consulta.
    useEffect(() => {
        if (!esperando) { setFase(0); return; }
        const id = setInterval(() => setFase(f => Math.min(f + 1, PENSANDO.length - 1)), 1800);
        return () => clearInterval(id);
    }, [esperando]);

    useEffect(() => {
        if (!abierto) return;
        const onKey = (e) => { if (e.key === "Escape") setAbierto(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [abierto]);

    // El campo crece con el texto, hasta 5 renglones.
    useEffect(() => {
        const el = campoRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    }, [texto]);

    const enviar = useCallback(async (pregunta) => {
        const q = (pregunta ?? texto).trim();
        if (!q || esperando) return;
        const historial = mensajes.filter(m => !m.error).map(({ role, content }) => ({ role, content }));
        setMensajes(ms => [...ms, { role: "user", content: q }]);
        setTexto("");
        setEsperando(true);
        try {
            const r = await api.asistente.preguntar({ pregunta: q, historial });
            setMensajes(ms => [...ms, { role: "assistant", content: r.data.respuesta, consultas: r.data.consultas || [], sugerencias: r.data.sugerencias || [] }]);
            setCupo(c => (c ? { ...c, restantes: r.data.restantes } : c));
        } catch (err) {
            setMensajes(ms => [...ms, { role: "assistant", content: err.message || "No se pudo obtener respuesta.", error: true }]);
        } finally {
            setEsperando(false);
        }
    }, [texto, esperando, mensajes]);

    const copiar = async (i, contenido) => {
        try { await navigator.clipboard.writeText(contenido.replace(/\*\*/g, "")); setCopiado(i); setTimeout(() => setCopiado(null), 1500); } catch { /* sin permiso de portapapeles */ }
    };

    if (!disponible) return null;
    if (!abierto) return <BotonFlotante pieOcupado={PIE_OCUPADO.includes(safeTab)} onClick={() => setAbierto(true)} />;

    const nombre = (employee?.full_name || "").trim().split(/\s+/)[0] || "";
    const saludo = nombre ? `Hola, ${nombre.charAt(0).toUpperCase()}${nombre.slice(1).toLowerCase()}` : "Hola";
    const verReportes = can("reports.view");
    const verInventario = can("inventory.view") || verReportes;
    // Primero lo propio del rubro (si la tienda tiene el módulo y el usuario el permiso).
    const inicio = [
        company?.citas_enabled && (can("agenda.own") || can("agenda.view") || can("agenda.book")) && { icono: "ventas", titulo: "Agenda", pregunta: "¿Qué citas tengo hoy?" },
        company?.cobranza_enabled && (can("cobranza.view") || can("cobranza.manage")) && { icono: "cobranza", titulo: "Cobranza", pregunta: "¿Cuánto deben en cada sector?" },
        company?.cocina_enabled && (can("tables.view") || can("kitchen.view")) && { icono: "plato", titulo: "Restaurante", pregunta: "¿Qué mesas están abiertas ahora?" },
        company?.comisiones_enabled && can("commissions.view") && { icono: "cobranza", titulo: "Comisiones", pregunta: "¿Cuánto le debo a cada vendedor?" },
        company?.propinas_enabled && can("tips.view") && { icono: "cobranza", titulo: "Propinas", pregunta: "¿Cuánta propina le toca a cada uno?" },
        company?.farmacia_enabled && can("pharmacy.reports") && { icono: "inventario", titulo: "Farmacia", pregunta: "¿Qué controlados se despacharon esta semana?" },
        company?.farmacia_enabled && (can("products.view") || can("inventory.view")) && { icono: "inventario", titulo: "Farmacia", pregunta: "¿Qué equivalentes hay del acetaminofén?" },
        can("sales.cash") && !verReportes && { icono: "cobranza", titulo: "Caja", pregunta: "¿Cuánto debería tener en mi caja?" },
        verReportes && { icono: "ventas", titulo: "Ventas", pregunta: "¿Cuánto vendí hoy y cómo me pagaron?" },
        verReportes && { icono: "ideas", titulo: "Ideas para vender más", pregunta: "¿Qué me recomiendas hacer esta semana?" },
        verInventario && { icono: "inventario", titulo: "Inventario", pregunta: "¿Qué se me está acabando?" },
        verReportes && { icono: "cobranza", titulo: "Cobranza", pregunta: "¿Quién me debe más?" },
        company?.cocina_enabled && { icono: "plato", titulo: "Restaurante", pregunta: "¿Cómo creo un plato con su receta?" },
        { icono: "ayuda", titulo: "Cómo se hace", pregunta: "¿Cómo hago una devolución?" },
        { icono: "ayuda", titulo: "Caja", pregunta: "¿Cómo cierro el turno?" },
    ].filter(Boolean).slice(0, 6);
    const ultimo = mensajes.length - 1;

    return (
        <>
            <div className="fixed inset-0 z-[60] bg-black/30 lg:bg-black/10 overlay-in" onClick={() => setAbierto(false)} aria-hidden="true" />
            <section
                role="dialog"
                aria-label="Asta"
                className="fixed z-[61] inset-x-0 bottom-0 h-[90dvh] rounded-t-3xl overflow-hidden sheet-up
                           lg:inset-y-3 lg:left-auto lg:right-3 lg:h-auto lg:w-[440px] lg:rounded-3xl
                           flex flex-col bg-surface-2 dark:bg-surface-dark shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
            >
                {/* Cabecera en el color de la marca */}
                <header className="relative shrink-0 bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white px-4 pt-3 pb-4">
                    <div className="lg:hidden flex justify-center pb-2"><span className="w-10 h-1 rounded-full bg-white/40" /></div>
                    <div className="flex items-center gap-3">
                        <span className="relative w-11 h-11 rounded-2xl bg-white/15 ring-1 ring-white/25 flex items-center justify-center shrink-0">
                            <Robot className="w-7 h-7" />
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-brand-700" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[15px] font-semibold leading-tight">Asta</h2>
                            <p className="text-[12px] text-white/75 truncate">Asistente de NXUS · {storeName || "tu tienda"}</p>
                        </div>
                        {mensajes.length > 0 && !esperando && (
                            <button onClick={() => setMensajes([])} title="Nueva conversación" aria-label="Nueva conversación"
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-white/85 hover:bg-white/15">
                                <Icono d="M12 5v14M5 12h14" className="w-[18px] h-[18px]" />
                            </button>
                        )}
                        <button onClick={() => setAbierto(false)} aria-label="Cerrar"
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/85 hover:bg-white/15">
                            <Icono d="M6 18L18 6M6 6l12 12" className="w-[18px] h-[18px]" />
                        </button>
                    </div>
                </header>

                {/* Conversación */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4 text-[13px] leading-relaxed text-content dark:text-white/90">
                    {mensajes.length === 0 && (
                        <div className="rise-in">
                            <div className="flex items-start gap-3 mb-4">
                                <Avatar />
                                <div className="rounded-2xl rounded-tl-md bg-white dark:bg-white/[0.06] ring-1 ring-border/60 dark:ring-white/[0.06] px-3.5 py-3">
                                    <p className="text-[15px] font-semibold text-content dark:text-white">{saludo}</p>
                                    <p className="mt-1 text-content-subtle dark:text-white/70">
                                        Soy Asta. Conozco los números de tu tienda y te explico cómo hacer las cosas en el sistema. Pregúntame lo que necesites.
                                    </p>
                                </div>
                            </div>
                            <p className="text-[12px] text-content-subtle mb-2 px-1">Puedes empezar por aquí</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {inicio.map((s, i) => (
                                    <button key={s.pregunta} onClick={() => enviar(s.pregunta)} style={{ "--i": i }}
                                        className="rise-in group text-left rounded-2xl bg-white dark:bg-white/[0.05] ring-1 ring-border/60 dark:ring-white/[0.07] hover:ring-brand-500/50 px-3 py-2.5 flex items-start gap-2.5 transition-shadow">
                                        <span className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300 flex items-center justify-center shrink-0">
                                            <Icono d={ICONOS[s.icono]} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-[11px] text-content-subtle">{s.titulo}</span>
                                            <span className="block text-[13px] font-medium text-content dark:text-white leading-snug">{s.pregunta}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {mensajes.map((m, i) => m.role === "user" ? (
                        <div key={i} className="flex justify-end rise-in">
                            <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md bg-gradient-to-br from-brand-500 to-brand-700 text-white whitespace-pre-wrap break-words">
                                {m.content}
                            </div>
                        </div>
                    ) : (
                        <div key={i} className="flex items-start gap-2.5 rise-in">
                            <Avatar size="w-7 h-7" icon="w-[18px] h-[18px]" />
                            <div className="min-w-0 flex-1">
                                <div className={`rounded-2xl rounded-tl-md px-3.5 py-3 break-words ${m.error
                                    ? "bg-red-50 dark:bg-red-500/10 text-danger ring-1 ring-red-200 dark:ring-red-500/20"
                                    : "bg-white dark:bg-white/[0.06] ring-1 ring-border/60 dark:ring-white/[0.06]"}`}>
                                    {m.error ? m.content : <Markdown texto={m.content} />}
                                </div>
                                {!m.error && (
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
                                        {(m.consultas || []).map(c => (
                                            <span key={c} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-white/70 dark:bg-white/[0.05] ring-1 ring-border/50 dark:ring-white/[0.06] text-[11px] text-content-subtle">
                                                <Icono d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" className="w-3 h-3" />
                                                {CONSULTAS[c] || c}
                                            </span>
                                        ))}
                                        <button onClick={() => copiar(i, m.content)} title="Copiar respuesta" aria-label="Copiar respuesta"
                                            className="ml-auto h-6 px-2 rounded-full inline-flex items-center gap-1 text-[11px] text-content-subtle hover:text-content dark:hover:text-white">
                                            <Icono d={copiado === i ? "M5 13l4 4L19 7" : "M8 8h10v12H8zM6 16H5a1 1 0 01-1-1V5a1 1 0 011-1h10a1 1 0 011 1v1"} className="w-3.5 h-3.5" />
                                            {copiado === i ? "Copiado" : "Copiar"}
                                        </button>
                                    </div>
                                )}
                                {i === ultimo && !esperando && m.sugerencias?.length > 0 && (
                                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                                        {m.sugerencias.map(s => (
                                            <button key={s} onClick={() => enviar(s)}
                                                className="h-9 sm:h-8 px-3 rounded-full bg-brand-500/10 hover:bg-brand-500/15 text-brand-700 dark:text-brand-200 text-[12px] font-medium text-left">
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {esperando && (
                        <div className="flex items-start gap-2.5 rise-in">
                            <Avatar size="w-7 h-7" icon="w-[18px] h-[18px]" />
                            <div className="rounded-2xl rounded-tl-md bg-white dark:bg-white/[0.06] ring-1 ring-border/60 dark:ring-white/[0.06] px-3.5 py-2.5 flex items-center gap-2.5">
                                <span className="dot-wave flex gap-1 text-brand-500" aria-hidden="true">
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                </span>
                                <span className="text-[12px] text-content-subtle">{PENSANDO[fase]}</span>
                            </div>
                        </div>
                    )}
                    <div ref={finRef} />
                </div>

                {/* Escribir */}
                <form onSubmit={(e) => { e.preventDefault(); enviar(); }}
                    className="shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-surface-2 dark:bg-surface-dark">
                    <div className="flex items-end gap-2 rounded-2xl bg-white dark:bg-white/[0.06] ring-1 ring-border dark:ring-white/10 focus-within:ring-2 focus-within:ring-brand-500/50 pl-3.5 pr-1.5 py-1.5 transition-shadow">
                        <textarea
                            ref={campoRef}
                            value={texto}
                            onChange={(e) => setTexto(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                            rows={1}
                            maxLength={1500}
                            autoComplete="off"
                            placeholder="Pregúntale a Asta…"
                            className="flex-1 min-h-[36px] max-h-32 py-2 bg-transparent text-[14px] sm:text-[13px] resize-none focus:outline-none placeholder:text-content-subtle/70"
                        />
                        <button type="submit" disabled={esperando || !texto.trim()} aria-label="Enviar"
                            className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shrink-0 disabled:opacity-35 transition-opacity">
                            <Icono d="M12 19V5m0 0l-6 6m6-6l6 6" className="w-[18px] h-[18px]" />
                        </button>
                    </div>
                    <p className="mt-1.5 px-1 text-[11px] text-content-subtle flex items-center justify-between gap-2">
                        <span>Puede equivocarse: revisa las cifras importantes en Reportes.</span>
                        {cupo && (
                            <span className={`shrink-0 tabular-nums ${cupo.restantes <= Math.max(10, cupo.limite * 0.05) ? "text-amber-600 dark:text-amber-400" : ""}`}>
                                {cupo.restantes > 0 ? `${cupo.restantes} de ${cupo.limite}` : "Sin preguntas este mes"}
                            </span>
                        )}
                    </p>
                </form>
            </section>
        </>
    );
}
