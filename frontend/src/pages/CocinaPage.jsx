import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import Page from "../components/ui/Page";
import Segmented from "../components/ui/Segmented";
import CustomSelect from "../components/ui/CustomSelect";
import { Spinner } from "../components/ui/Spinner";
import { fmtTime, printKitchenOrder, toNameCase } from "../helpers";
import AgotadosModal from "../components/mesas/AgotadosModal";

// Pantalla de cocina. Va en una tablet o un TV de la cocina, siempre abierta: las comandas
// son los pedidos que los mesoneros mandan desde el catálogo en sus tablets, y aquí se
// mueven de Nuevas a En preparación y a Listas. La caja ve cuáles están listas.
//
// Se actualiza consultando cada pocos segundos: en Vercel no hay conexiones abiertas (ver
// SSE_ENABLED), y la consulta del tablero es una sola y liviana.
const REFRESCO_MS = 5000;

// Minutos desde que entró la comanda. A partir de aquí la tarjeta pide atención: ámbar
// cuando se está demorando, rojo cuando ya es tarde.
const DEMORA_MIN = 10;
const TARDE_MIN = 20;

const COLUMNAS = [
    { key: "nueva",      label: "Nuevas" },
    { key: "preparando", label: "En preparación" },
    { key: "lista",      label: "Listas" },
];

// Avance y retroceso de cada estado. Retroceder existe porque en una cocina se toca el
// botón equivocado con las manos mojadas; no hay confirmación que valga ahí.
const SIGUIENTE = { nueva: "preparando", preparando: "lista", lista: "entregada" };
const ANTERIOR  = { preparando: "nueva", lista: "preparando" };
const ACCION    = { nueva: "Empezar", preparando: "Marcar lista", lista: "Entregada" };

// Una comanda es de una mesa (ronda del mesonero) o de quien pidió por el catálogo.
const titulo = (o) => o.table_name || toNameCase(o.label) || `Pedido #${o.sale_id}`;
// La comanda impresa sale con el mismo formato de siempre (helpers/printKitchenOrder).
const paraImprimir = (o) => ({
    ...o, id: o.sale_id, web_customer_name: o.round_no > 1 ? `${titulo(o)} · Ronda ${o.round_no}` : titulo(o),
    web_note: o.note, status: o.table_name ? "espera" : "pedido",
});

const fmtQty = (q) => {
    const n = parseFloat(q || 0);
    return n % 1 === 0 ? String(Math.round(n)) : n.toLocaleString("es-VE");
};

const leer = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };

// Aviso de comanda nueva: dos tonos cortos con Web Audio, sin archivos. El navegador no deja
// sonar nada hasta que alguien toca la pantalla, por eso el sonido se enciende con un botón.
function useCampana() {
    const ctxRef = useRef(null);
    const preparar = useCallback(() => {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            if (!ctxRef.current) ctxRef.current = new AC();
            if (ctxRef.current.state === "suspended") ctxRef.current.resume();
        } catch { /* sin audio */ }
    }, []);
    const sonar = useCallback(() => {
        const ctx = ctxRef.current;
        if (!ctx || ctx.state !== "running") return;
        [0, 0.18].forEach((t, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = i === 0 ? 880 : 1175;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
            gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.16);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + t);
            osc.stop(ctx.currentTime + t + 0.18);
        });
    }, []);
    return { preparar, sonar };
}

export default function CocinaPage() {
    const { can, notify, company, companyInfo, printerWidth } = useApp();
    const canManage = can("kitchen.manage");
    const cid = company?.id ?? "x";

    const [warehouses, setWarehouses] = useState([]);
    const [almacen, setAlmacenState] = useState(() => leer(`cocina_almacen_${cid}`, ""));
    const setAlmacen = (v) => { setAlmacenState(v); guardar(`cocina_almacen_${cid}`, v); };

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sinConexion, setSinConexion] = useState(false);
    // Diferencia entre el reloj del servidor y el de esta pantalla.
    const [desfase, setDesfase] = useState(0);
    const [ahora, setAhora] = useState(Date.now());
    const [movil, setMovil] = useState("nueva");
    const [ocupadas, setOcupadas] = useState({});
    const [agotados, setAgotados] = useState(false);

    const [sonido, setSonidoState] = useState(() => leer(`cocina_sonido_${cid}`, "1") === "1");
    const { preparar, sonar } = useCampana();
    const vistasRef = useRef(null);

    useEffect(() => {
        api.warehouses.getAll()
            .then(r => setWarehouses((r.data || []).filter(w => w.active !== false && w.sells !== false)))
            .catch(() => {});
    }, []);

    // El sonido queda encendido de una visita a otra, pero el navegador lo vuelve a trabar al
    // recargar: el primer toque en cualquier parte de la pantalla lo destraba.
    useEffect(() => {
        if (!sonido) return;
        const destrabar = () => preparar();
        window.addEventListener("pointerdown", destrabar, { once: true });
        return () => window.removeEventListener("pointerdown", destrabar);
    }, [sonido, preparar]);

    const toggleSonido = () => {
        const v = !sonido;
        setSonidoState(v);
        guardar(`cocina_sonido_${cid}`, v ? "1" : "0");
        if (v) { preparar(); sonar(); }
    };

    const cargar = useCallback(async () => {
        try {
            const r = await api.kitchen.board(almacen ? { warehouse_id: almacen } : {});
            const data = r.data || [];
            if (r.now) setDesfase(new Date(r.now).getTime() - Date.now());
            // Suena solo por comandas que no estaban en la vuelta anterior; la primera carga
            // no cuenta, o sonaría cada vez que se abre la pantalla.
            const nuevas = data.filter(o => o.kitchen_status === "nueva" && vistasRef.current && !vistasRef.current.has(o.id));
            vistasRef.current = new Set(data.map(o => o.id));
            if (nuevas.length && sonido) sonar();
            setRows(data);
            setSinConexion(false);
        } catch (e) {
            setSinConexion(true);
            if (e?.status === 403) notify(e.message || "No tienes acceso a la cocina", "err");
        } finally {
            setLoading(false);
        }
    }, [almacen, sonido, sonar, notify]);

    useEffect(() => {
        setLoading(true);
        vistasRef.current = null;
        cargar();
    }, [almacen]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const timer = setInterval(() => {
            setAhora(Date.now());
            if (document.visibilityState === "visible") cargar();
        }, REFRESCO_MS);
        const alVolver = () => { if (document.visibilityState === "visible") cargar(); };
        document.addEventListener("visibilitychange", alVolver);
        return () => { clearInterval(timer); document.removeEventListener("visibilitychange", alVolver); };
    }, [cargar]);

    const mover = async (orden, status) => {
        if (ocupadas[orden.id]) return;
        const antes = rows;
        setOcupadas(o => ({ ...o, [orden.id]: true }));
        // Se mueve en pantalla al instante: esperar al servidor con la mano en el aire es lo
        // que hace que se toque dos veces.
        setRows(rs => status === "entregada"
            ? rs.filter(r => r.id !== orden.id)
            : rs.map(r => r.id === orden.id ? { ...r, kitchen_status: status, kitchen_status_at: new Date(Date.now() + desfase).toISOString() } : r));
        try {
            await api.kitchen.setStatus(orden.id, status);
        } catch (e) {
            setRows(antes);
            notify(e.message || "No se pudo actualizar la comanda", "err");
        } finally {
            setOcupadas(o => { const n = { ...o }; delete n[orden.id]; return n; });
        }
    };

    const minutos = (iso) => Math.max(0, Math.floor((ahora + desfase - new Date(iso).getTime()) / 60000));

    const porColumna = useMemo(() => {
        const m = { nueva: [], preparando: [], lista: [] };
        for (const r of rows) m[r.kitchen_status]?.push(r);
        return m;
    }, [rows]);

    const opcionesAlmacen = [{ value: "", label: "Todas las sucursales" }, ...warehouses.map(w => ({ value: String(w.id), label: w.name }))];
    const pantallaCompleta = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

    const actions = (
        <div className="flex items-center gap-2">
            {warehouses.length > 1 && (
                <CustomSelect value={almacen} onChange={setAlmacen} options={opcionesAlmacen} className="w-48" height="h-9" />
            )}
            {canManage && (
                <button onClick={() => setAgotados(true)} title="Marcar lo que se acabó (contornos, extras)"
                    className="btn-outline h-9 px-3 rounded-lg text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                    <span className="hidden sm:inline">Agotados</span>
                </button>
            )}
            <button onClick={toggleSonido} title={sonido ? "Silenciar el aviso de comandas nuevas" : "Avisar con sonido cada comanda nueva"}
                className="btn-outline h-9 px-3 rounded-lg text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {sonido
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5zm4.5 3.5a5 5 0 010 7M18.4 5.6a9 9 0 010 12.8" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5zm6 4l4 4m0-4l-4 4" />}
                </svg>
                <span className="hidden sm:inline">{sonido ? "Sonido" : "Sin sonido"}</span>
            </button>
            {pantallaCompleta && (
                <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
                    title="Pantalla completa" aria-label="Pantalla completa"
                    className="btn-outline h-9 w-9 rounded-lg hidden sm:flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4" />
                    </svg>
                </button>
            )}
        </div>
    );

    const tarjeta = (o) => {
        const espera = minutos(o.created_at);
        const enLista = o.kitchen_status === "lista";
        // En Listas lo que importa es cuánto lleva esperando que la retiren, no cuánto tardó.
        const tono = enLista ? "" : espera >= TARDE_MIN ? "text-red-600 dark:text-red-400" : espera >= DEMORA_MIN ? "text-amber-700 dark:text-amber-400" : "text-content-subtle";
        const filete = enLista ? undefined : espera >= TARDE_MIN ? { boxShadow: "inset 3px 0 0 #ef4444" } : espera >= DEMORA_MIN ? { boxShadow: "inset 3px 0 0 #f59e0b" } : undefined;
        const ocupada = !!ocupadas[o.id];
        const siguiente = SIGUIENTE[o.kitchen_status];
        const anterior = ANTERIOR[o.kitchen_status];

        return (
            <article key={o.id} style={filete}
                className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-surface-dark-2 px-3.5 py-3">
                <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h4 className="text-[16px] font-semibold text-content dark:text-white leading-tight truncate">
                            {titulo(o)}
                        </h4>
                        <div className="text-[12px] text-content-subtle mt-0.5 tabular-nums truncate">
                            {[o.round_no > 1 || o.table_name ? `Ronda ${o.round_no}` : `#${o.sale_id}`, fmtTime(o.created_at), o.waiter_name && toNameCase(o.waiter_name)].filter(Boolean).join(" · ")}
                        </div>
                    </div>
                    <div className={`text-right shrink-0 tabular-nums ${tono}`}>
                        {enLista ? (
                            <span className="text-[12px] text-content-subtle whitespace-nowrap">Lista hace {minutos(o.kitchen_status_at)} min</span>
                        ) : (
                            <>
                                <span className="text-[22px] font-bold tracking-tight leading-none">{espera}</span>
                                <span className="text-[12px] ml-0.5">min</span>
                            </>
                        )}
                    </div>
                </header>

                {o.note && (
                    <p className="mt-2 text-[13px] text-amber-700 dark:text-amber-400 leading-snug">{o.note}</p>
                )}

                <ul className="mt-2.5 divide-y divide-border/60 dark:divide-white/[0.06] border-t border-border/60 dark:border-white/[0.06]">
                    {(o.items || []).map((i, idx) => (
                        <li key={idx} className="py-1.5 flex gap-2.5">
                            <span className="text-[15px] font-bold text-content dark:text-white tabular-nums w-7 shrink-0 text-right">{fmtQty(i.quantity)}</span>
                            <span className="min-w-0">
                                <span className="block text-[15px] text-content dark:text-white leading-snug">{i.name}</span>
                                {i.modifiers && <span className="block text-[13px] text-content dark:text-white/85 leading-snug">{i.modifiers}</span>}
                                {i.note && <span className="block text-[13px] text-amber-700 dark:text-amber-400 leading-snug">{i.note}</span>}
                            </span>
                        </li>
                    ))}
                </ul>

                <div className="mt-3 flex items-center gap-2">
                    {canManage && siguiente && (
                        <button onClick={() => mover(o, siguiente)} disabled={ocupada}
                            className={`${o.kitchen_status === "preparando" ? "btn-accent" : "btn-outline"} flex-1 h-11 rounded-lg text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60`}>
                            {ocupada && <Spinner />}
                            {ACCION[o.kitchen_status]}
                        </button>
                    )}
                    {canManage && anterior && (
                        <button onClick={() => mover(o, anterior)} disabled={ocupada}
                            title="Devolver al paso anterior" aria-label="Devolver al paso anterior"
                            className="btn-outline h-11 w-11 shrink-0 rounded-lg flex items-center justify-center disabled:opacity-60">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3" /></svg>
                        </button>
                    )}
                    <button onClick={() => printKitchenOrder(paraImprimir(o), companyInfo, printerWidth)}
                        title="Imprimir la comanda" aria-label="Imprimir la comanda"
                        className={`btn-outline h-11 w-11 shrink-0 rounded-lg flex items-center justify-center ${canManage ? "" : "ml-auto"}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    </button>
                </div>
            </article>
        );
    };

    const columna = (col) => {
        const cards = porColumna[col.key];
        return (
            <section key={col.key} className={`flex flex-col lg:min-h-0 rounded-2xl bg-surface-2/60 dark:bg-white/[0.03]`}>
                <header className="px-3.5 pt-3 pb-2 hidden lg:flex items-center justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-content dark:text-white">{col.label}</h3>
                    <span className="text-[13px] text-content-subtle tabular-nums">{cards.length}</span>
                </header>
                <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto px-2.5 py-2.5 lg:pt-0 space-y-2.5">
                    {cards.length === 0 && (
                        <div className="text-[13px] text-content-subtle text-center py-8">Nada aquí</div>
                    )}
                    {cards.map(tarjeta)}
                </div>
            </section>
        );
    };

    const sub = sinConexion ? (
        <div className="px-4 py-1.5 text-[12px] text-amber-700 dark:text-amber-400 border-b border-border/30 dark:border-white/5">
            Sin conexión con el servidor. Se reintenta solo cada {REFRESCO_MS / 1000} segundos.
        </div>
    ) : null;

    return (
        <Page module="Cocina" title="Comandas" actions={actions} subheader={sub}>
            {loading ? (
                <div className="py-16 flex justify-center"><Spinner /></div>
            ) : rows.length === 0 ? (
                <div className="py-16 text-center px-6 flex flex-col items-center">
                    <div className="w-12 h-12 rounded-xl bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 14a4 4 0 01-.9-7.9A5 5 0 0112 3a5 5 0 015.9 3.1A4 4 0 0117 14M7 14v5a1 1 0 001 1h8a1 1 0 001-1v-5M7 17h10" /></svg>
                    </div>
                    <div className="text-[15px] font-semibold text-content dark:text-white mt-3">Sin comandas pendientes</div>
                    <div className="text-[13px] text-content-subtle mt-1 max-w-sm">Los pedidos que envíen los mesoneros desde el catálogo aparecen aquí al momento.</div>
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col">
                    {/* En teléfono y tablet vertical, una columna a la vez: tres columnas de 250px
                        no dejan leer un plato completo. */}
                    <div className="lg:hidden pt-1 pb-2.5">
                        <Segmented value={movil} onChange={setMovil}
                            options={COLUMNAS.map(c => ({ key: c.key, label: `${c.label} ${porColumna[c.key].length}` }))} />
                    </div>
                    <div className="lg:hidden pb-3">
                        {columna(COLUMNAS.find(c => c.key === movil))}
                    </div>
                    <div className="hidden lg:grid flex-1 min-h-0 grid-cols-3 gap-3 py-1.5">
                        {COLUMNAS.map(c => columna(c))}
                    </div>
                </div>
            )}
            {agotados && <AgotadosModal notify={notify} onClose={() => setAgotados(false)} />}
        </Page>
    );
}
