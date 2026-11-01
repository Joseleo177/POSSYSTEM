import { useEffect, useMemo, useRef, useState } from "react";
import { publicApi } from "../../services/api";
import { resolveImageUrl } from "../../helpers/image";
import { pintarFondo } from "../../helpers/fondoPagina";
import AddonPicker, { faltante, precioExtras } from "./AddonPicker";
import { flyToCart, CART_BUMP_EVENT, CART_TARGET_ATTR } from "../PublicCatalog/flyToCart";

// Pedir desde el QR de la mesa: el menú de la sucursal, la ficha de cada plato con sus
// adicionales (el mismo selector del mesonero) y el carrito. Va a pantalla completa sobre la
// página de la mesa. Al enviar, el servidor lo valida como una ronda del mesonero (ver
// services/mesaPublica.js) y, según el modo, espera al mesonero o sale directo a cocina.
//
// El carrito se guarda en el navegador por mesa: recargar la página no lo pierde.
//
// Como en el catálogo (29-10-2026): el plato agregado vuela desde su foto a la barra de
// "Ver mi pedido", que rebota al recibirlo; cada fila tiene su + y muestra cuántos van.
//
// 31-10-2026, "debe verse como mi local": la carta lleva la identidad que la tienda ya cargó
// para su catálogo —foto de portada, logo, eslogan, fondo ("el mantel") y papel de la carta—.
// Toda la carta va en una sola página por secciones, con la barra de categorías fija que sigue
// al cliente mientras baja, y arriba los favoritos de la casa (lo más vendido de la sucursal).

const dinero = (n, sym) => `${sym}${sym.length > 1 ? " " : ""}${Number(n || 0).toFixed(2)}`;
const claveCarrito = (token) => `mesa_carrito_${token}`;
const leerCarrito = (token) => { try { return JSON.parse(sessionStorage.getItem(claveCarrito(token)) || "[]"); } catch { return []; } };
const guardarCarrito = (token, c) => { try { sessionStorage.setItem(claveCarrito(token), JSON.stringify(c)); } catch { /* sin almacenamiento */ } };
const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const idSeccion = (i) => `seccion-${i}`;

// Fondo de la tienda oscuro o claro: decide si lo que va directo sobre él (títulos de sección,
// píldoras) se escribe en blanco o en negro. Los platos van sobre el papel, siempre claro.
function esOscuro(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
    if (!m) return false;
    const [r, g, b] = m.slice(1).map(x => {
        const c = parseInt(x, 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35;
}

const X = ({ className = "w-5 h-5" }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M6 18L18 6M6 6l12 12" /></svg>;
const Mas = ({ className = "w-4 h-4" }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.8} d="M12 5v14M5 12h14" /></svg>;
const Menos = ({ className = "w-4 h-4" }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.8} d="M5 12h14" /></svg>;
const Lupa = ({ className = "w-[18px] h-[18px]" }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><circle cx="11" cy="11" r="6.5" /><path strokeLinecap="round" d="M16 16l4.5 4.5" /></svg>;
const Atras = ({ className = "w-5 h-5" }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M15 19l-7-7 7-7" /></svg>;
const Nota = ({ className = "w-4 h-4" }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" /><path strokeLinecap="round" d="M13.5 6.5l4 4" /></svg>;
const Estrella = ({ className = "w-3.5 h-3.5" }) => <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" /></svg>;
const Bolsa = ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12l-1 12.2a2 2 0 01-2 1.8H9a2 2 0 01-2-1.8L6 7z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 10V6a3 3 0 016 0v4" />
    </svg>
);
const Plato0 = ({ className = "w-7 h-7" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17h18M5 17a7 7 0 0114 0M12 7V5.5M10.5 5.5h3" />
    </svg>
);

// Foto de un plato, o un marcador sobrio cuando la tienda no le subió una.
function Foto({ src, className = "", agotado = false }) {
    return src ? (
        <img src={resolveImageUrl(src)} alt="" loading="lazy" className={`w-full h-full object-cover ${agotado ? "grayscale" : ""} ${className}`} />
    ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-500/10 to-brand-500/25 text-brand-600/60"><Plato0 /></div>
    );
}

function Cantidad({ value, onChange, min = 1, max = 20 }) {
    return (
        <div className="inline-flex items-center rounded-full bg-white ring-1 ring-black/[0.08] p-1 shrink-0">
            <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min && min > 0}
                className="w-9 h-9 rounded-full text-neutral-700 flex items-center justify-center hover:bg-black/5 active:scale-90 transition-all disabled:opacity-30" aria-label="Uno menos"><Menos /></button>
            <span key={value} className="badge-pop w-8 text-center text-[16px] font-bold tabular-nums text-neutral-900">{value}</span>
            <button type="button" onClick={() => onChange(Math.min(max, value + 1))}
                className="w-9 h-9 rounded-full bg-brand-500 text-brand-ink flex items-center justify-center hover:brightness-110 active:scale-90 transition-all" aria-label="Uno más"><Mas /></button>
        </div>
    );
}

// Ficha de un plato: foto grande, adicionales, cantidad y nota. Va en el papel de la carta.
function Plato({ token, plato, sym, panel, onAgregar, onClose }) {
    const [grupos, setGrupos] = useState(plato.has_addons ? null : []);
    const [opciones, setOpciones] = useState([]);
    const [qty, setQty] = useState(1);
    const [nota, setNota] = useState("");
    const [error, setError] = useState(null);
    const fotoRef = useRef(null);

    useEffect(() => {
        if (!plato.has_addons) return;
        publicApi.mesaPlato(token, plato.id)
            .then(r => setGrupos(r.data || []))
            .catch(e => { setGrupos([]); setError(e?.message || "No se pudieron cargar las opciones"); });
    }, [plato.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const falta = faltante(grupos, opciones);
    const unitario = plato.price + precioExtras(opciones);

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px] catalog-overlay-in" onClick={onClose} />
            <div className="relative w-full sm:max-w-[520px] alto-hoja-92 rounded-t-[28px] sm:rounded-[28px] overflow-hidden flex flex-col shadow-2xl catalog-sheet-in" style={{ backgroundColor: panel }}>
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <div ref={fotoRef} className="relative h-[min(300px,38vh)] bg-neutral-100 overflow-hidden">
                        <Foto src={plato.image_url} className="hero-zoom" />
                        <span className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/35 to-transparent" aria-hidden="true" />
                        <span className="sm:hidden absolute top-2.5 inset-x-0 flex justify-center" aria-hidden="true"><span className="w-10 h-1 rounded-full bg-white/70" /></span>
                        <button onClick={onClose} aria-label="Cerrar" className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/45 backdrop-blur text-white flex items-center justify-center active:scale-90 transition-transform"><X /></button>
                        {plato.favorito && (
                            <span className="absolute left-4 bottom-4 h-7 px-2.5 rounded-full bg-white/95 text-neutral-900 text-[12px] font-semibold flex items-center gap-1.5 shadow">
                                <span className="text-amber-500"><Estrella /></span>Favorito de la casa
                            </span>
                        )}
                    </div>
                    <div className="px-5 pt-5 pb-4 space-y-4">
                        <div>
                            {plato.category && <div className="text-[12px] font-medium text-brand-700 mb-1">{plato.category}</div>}
                            <div className="flex items-start justify-between gap-4">
                                <h3 className="font-display text-[23px] font-bold uppercase tracking-tight leading-[1.1] text-neutral-900">{plato.name}</h3>
                                <div className="text-[21px] font-bold tabular-nums whitespace-nowrap text-neutral-900 leading-[1.15]">{dinero(plato.price, sym)}</div>
                            </div>
                            {plato.description && <p className="text-[14px] text-neutral-600 leading-relaxed mt-2">{plato.description}</p>}
                        </div>
                        {grupos === null ? (
                            <div className="space-y-2.5">
                                <div className="skeleton h-4 w-1/3 rounded-full" />
                                <div className="skeleton h-12 rounded-2xl" />
                                <div className="skeleton h-12 rounded-2xl" />
                            </div>
                        ) : grupos.length > 0 && (
                            <AddonPicker groups={grupos} value={opciones} onChange={setOpciones} sym={sym} tone="catalog" />
                        )}
                        <label className="block">
                            <span className="flex items-center justify-between text-[13px] font-semibold text-neutral-800 mb-1.5">
                                Nota para la cocina <span className="text-[12px] font-normal text-neutral-500">Opcional</span>
                            </span>
                            <span className="relative block">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"><Nota /></span>
                                <input value={nota} onChange={e => setNota(e.target.value.slice(0, 120))} autoComplete="off" placeholder="Sin cebolla, bien cocido…"
                                    className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-black/10 text-[16px] sm:text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-shadow" />
                            </span>
                        </label>
                        {error && <p className="text-[13px] text-red-600">{error}</p>}
                    </div>
                </div>
                <div className="shrink-0 border-t border-black/[0.06] bg-white/60 backdrop-blur px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-3">
                    <Cantidad value={qty} onChange={setQty} />
                    <button disabled={grupos === null || !!falta}
                        onClick={() => onAgregar({ plato, qty, nota, opciones, unitario, desde: fotoRef.current?.getBoundingClientRect() })}
                        className="btn-accent flex-1 min-w-0 h-12 rounded-full text-[15px] font-semibold px-4 flex items-center justify-between gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform">
                        {falta ? <span className="mx-auto truncate">Elige {falta.name.toLowerCase()}</span> : (
                            <>
                                <span>Agregar</span>
                                <span className="tabular-nums">{dinero(unitario * qty, sym)}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Barra de "Ver mi pedido": es el destino del plato que vuela (data-cart-target). Al
// recibirlo rebota y el número salta.
function BarraPedido({ cuenta, total, sym, fondo, onOpen }) {
    const ref = useRef(null);
    useEffect(() => {
        const bump = () => {
            const el = ref.current;
            if (!el) return;
            el.classList.remove("cart-bump");
            void el.offsetWidth;
            el.classList.add("cart-bump");
        };
        window.addEventListener(CART_BUMP_EVENT, bump);
        return () => window.removeEventListener(CART_BUMP_EVENT, bump);
    }, []);
    return (
        <div className="fixed bottom-0 inset-x-0 z-30 px-3 pt-8 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none"
            style={{ backgroundImage: `linear-gradient(to top, ${fondo} 35%, transparent)` }}>
            <button ref={ref} onClick={onOpen} {...{ [CART_TARGET_ATTR]: "" }}
                className="fab-in pointer-events-auto btn-accent max-w-[560px] mx-auto w-full h-14 rounded-full text-[15px] font-semibold flex items-center gap-3 pl-2 pr-5 shadow-[0_10px_24px_-12px_rgba(0,0,0,.5)]">
                <span className="relative w-10 h-10 rounded-full bg-black/15 flex items-center justify-center shrink-0">
                    <Bolsa />
                    <span key={cuenta} className="badge-pop absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-brand-600 text-[11px] font-bold flex items-center justify-center tabular-nums shadow">{cuenta}</span>
                </span>
                <span className="flex-1 text-left">Ver mi pedido</span>
                <span className="tabular-nums font-bold">{dinero(total, sym)}</span>
            </button>
        </div>
    );
}

// Una fila de la carta: nombre, frase y precio a la izquierda; la foto a la derecha.
// 31-10-2026, "más limpio": el + es chico y blanco, DENTRO de la esquina de la foto (antes era
// un círculo de color que se salía de ella con un aro); nada de "· A tu gusto" ni marco en la
// foto; el nombre sigue en mayúscula (identidad de la carta) pero sin negrita apretada.
function Fila({ p, n, sym, onOpen }) {
    return (
        <li>
            <button type="button" onClick={() => !p.agotado && onOpen(p)} disabled={p.agotado}
                className="w-full text-left flex items-center gap-4 py-3.5 active:opacity-70 transition-opacity disabled:cursor-default">
                <div className="flex-1 min-w-0">
                    <h4 className={`text-[14px] font-semibold uppercase tracking-[0.01em] leading-snug ${p.agotado ? "text-neutral-400" : "text-neutral-900"}`}>
                        {p.name}
                        {p.favorito && !p.agotado && <span className="inline-block align-[-2px] ml-1.5 text-amber-500" title="Favorito de la casa"><Estrella className="w-3 h-3" /></span>}
                    </h4>
                    {p.description && <p className="text-[13px] text-neutral-500 leading-snug line-clamp-2 mt-0.5">{p.description}</p>}
                    <div className="mt-1.5 text-[14px] tabular-nums">
                        {p.agotado
                            ? <span className="text-[13px] text-neutral-400">Agotado por hoy</span>
                            : <span className="font-semibold text-neutral-900">{dinero(p.price, sym)}</span>}
                    </div>
                </div>
                <div className="relative shrink-0 w-[84px] h-[84px] rounded-[18px] overflow-hidden bg-black/[0.04]">
                    <Foto src={p.image_url} agotado={p.agotado} />
                    {!p.agotado && (
                        <span className={`absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,.18)] transition-colors ${n > 0 ? "bg-brand-500 text-brand-ink" : "bg-white text-neutral-900"}`}>
                            {n > 0 ? <span key={n} className="badge-pop text-[12px] font-bold tabular-nums">{n}</span> : <Mas className="w-3.5 h-3.5" />}
                        </span>
                    )}
                </div>
            </button>
        </li>
    );
}

// "Lo que ya viene": lo que la mesa pidió y todavía no llega, con su estado. Al pedir algo más
// el cliente ve qué está esperando y no repite un plato por las dudas (31-10-2026). Se
// actualiza solo con el refresco de la página de la mesa.
function EnCurso({ grupos, papel }) {
    if (!grupos.length) return null;
    const total = grupos.reduce((a, g) => a + g.items.reduce((b, it) => b + (Number(it.quantity) || 0), 0), 0);
    return (
        <section className="px-4 pt-5">
            <div className="rounded-[24px] px-4 py-3.5" style={{ backgroundColor: papel }}>
                <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-[15px] font-semibold text-neutral-900">Lo que ya viene</h2>
                    <span className="text-[12px] text-neutral-500 tabular-nums">{total} {total === 1 ? "plato" : "platos"}</span>
                </div>
                <div className="mt-2.5 space-y-3">
                    {grupos.map((g, i) => (
                        <div key={i}>
                            <div className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-600">
                                <span className={`w-1.5 h-1.5 rounded-full ${g.tono} animate-pulse`} />{g.estado}
                            </div>
                            <ul className="mt-1 space-y-0.5">
                                {g.items.map((it, j) => (
                                    <li key={j} className="flex gap-2 text-[13px] text-neutral-900">
                                        <span className="w-4 text-right text-neutral-500 tabular-nums shrink-0">{Number(it.quantity) || ""}</span>
                                        <span className="min-w-0">{it.name}{it.modifiers && <span className="text-neutral-500"> · {it.modifiers}</span>}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// "Los favoritos de la casa": un carril de tarjetas con foto grande.
// También sirve para "Para ti" (31-10-2026): cada tarjeta puede llevar su etiqueta ("Lo de
// siempre", "A esta hora", "Pruébalo").
function Favoritos({ platos, sym, enCarrito, tinta, onOpen, titulo = "Los favoritos de la casa", detalle = "Lo más pedido" }) {
    if (!platos.length) return null;
    return (
        <section className="pt-6">
            <div className="px-4 flex items-baseline justify-between gap-3">
                <h2 className={`font-display text-[20px] font-bold tracking-tight truncate ${tinta.fuerte}`}>{titulo}</h2>
                {detalle && <span className={`shrink-0 text-[12px] ${tinta.suave}`}>{detalle}</span>}
            </div>
            <div className="mt-3 flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-4 pb-2">
                {platos.map((p, i) => {
                    const n = enCarrito(p.id);
                    return (
                        <button key={p.id} type="button" onClick={() => onOpen(p)} style={{ "--i": i }}
                            className="card-in snap-start shrink-0 w-[148px] text-left rounded-[20px] overflow-hidden relative aspect-[4/5] bg-neutral-200 active:scale-[0.98] transition-transform">
                            <Foto src={p.image_url} />
                            <span className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 to-transparent" aria-hidden="true" />
                            {p.etiqueta && <span className="absolute top-2 left-2 max-w-[calc(100%-3.25rem)] truncate leading-6 h-6 px-2 rounded-full bg-black/55 backdrop-blur text-white text-[11px] font-medium">{p.etiqueta}</span>}
                            <span className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,.18)] ${n > 0 ? "bg-brand-500 text-brand-ink" : "bg-white text-neutral-900"}`}>
                                {n > 0 ? <span key={n} className="badge-pop text-[12px] font-bold tabular-nums">{n}</span> : <Mas className="w-3.5 h-3.5" />}
                            </span>
                            <span className="absolute inset-x-3 bottom-3">
                                <span className="block text-[13px] font-semibold uppercase tracking-[0.01em] leading-tight text-white line-clamp-2">{p.name}</span>
                                <span className="block mt-1 text-[13px] font-semibold tabular-nums text-white/90">{dinero(p.price, sym)}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

export default function MenuMesaPublico({ token, mesa, area, store = {}, sym, modo, enCurso = [], cliente = null, saludo = null, extraPedido = null, onClose, onEnviado }) {
    const [menu, setMenu] = useState(null);
    const [secciones, setSecciones] = useState([]);
    const [favIds, setFavIds] = useState([]);
    const [error, setError] = useState(null);
    const [activa, setActiva] = useState(0);
    const [buscando, setBuscando] = useState(false);
    const [q, setQ] = useState("");
    const [compacto, setCompacto] = useState(false);
    const [plato, setPlato] = useState(null);
    const [carrito, setCarritoState] = useState(() => leerCarrito(token));
    const setCarrito = (fn) => setCarritoState(c => { const n = typeof fn === "function" ? fn(c) : fn; guardarCarrito(token, n); return n; });
    const [revisando, setRevisando] = useState(false);
    const [nota, setNota] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [errorEnvio, setErrorEnvio] = useState(null);

    const scrollRef = useRef(null);
    const finPortadaRef = useRef(null);
    const barraRef = useRef(null);
    const pildorasRef = useRef(null);
    const saltando = useRef(false);

    // Identidad de la tienda: el mantel (fondo) y el papel de la carta.
    const fondo = store.bg_color || "#F4F1EC";
    const papel = store.panel_color || "#FFFFFF";
    const oscuro = esOscuro(fondo);
    const tinta = oscuro
        ? { fuerte: "text-white", suave: "text-white/60", pildora: "bg-white/10 text-white/85", borde: "border-white/[0.08]" }
        : { fuerte: "text-neutral-900", suave: "text-neutral-500", pildora: "bg-black/[0.05] text-neutral-700", borde: "border-black/[0.06]" };

    useEffect(() => {
        publicApi.mesaMenu(token)
            .then(r => {
                setMenu(r.data || []);
                setSecciones(r.categories || []);
                setFavIds(r.favorites || []);
            })
            .catch(e => setError(e?.message || "No se pudo cargar el menú"));
    }, [token]);

    const favSet = useMemo(() => new Set(favIds), [favIds]);
    const platos = useMemo(() => (menu || []).map(p => ({ ...p, favorito: favSet.has(p.id) })), [menu, favSet]);
    const grupos = useMemo(() => {
        const nombres = secciones.length ? secciones : [...new Set(platos.map(p => p.category))].map(name => ({ name }));
        return nombres.map(s => ({ ...s, platos: platos.filter(p => p.category === s.name) })).filter(s => s.platos.length);
    }, [platos, secciones]);
    const favoritos = useMemo(() => favIds.map(id => platos.find(p => p.id === id)).filter(Boolean), [favIds, platos]);
    // "Para ti" (cliente reconocido, ver services/mesaClientes.js): lo de siempre, lo que suele
    // pedir a esta hora y los favoritos de la casa que todavía no ha probado. Solo lo que hoy
    // está en la carta de esta sucursal y no se agotó.
    const paraTi = useMemo(() => {
        const s = cliente?.suggestions;
        if (!s) return [];
        const vistos = new Set();
        const out = [];
        const poner = (ids, etiqueta, max) => {
            for (const id of ids || []) {
                if (out.filter(x => x.etiqueta === etiqueta).length >= max) break;
                const p = platos.find(x => x.id === id && !x.agotado);
                if (!p || vistos.has(id)) continue;
                vistos.add(id);
                out.push({ ...p, etiqueta });
            }
        };
        poner(s.usual, "Lo de siempre", 3);
        poner(s.now, "A esta hora", 3);
        const probados = new Set(s.tried || []);
        poner(favIds.filter(id => !probados.has(id)), "Pruébalo", 3);
        return out;
    }, [cliente, platos, favIds]);
    const resultados = useMemo(() => {
        const t = sinAcentos(q.trim());
        if (!t) return null;
        return platos.filter(p => sinAcentos(`${p.name} ${p.description || ""} ${p.category}`).includes(t));
    }, [platos, q]);

    const cuenta = carrito.reduce((a, l) => a + l.qty, 0);
    const total = carrito.reduce((a, l) => a + l.qty * l.unitario, 0);
    const enCarrito = (id) => carrito.filter(l => l.product_id === id).reduce((a, l) => a + l.qty, 0);

    // La barra se compacta (logo y nombre) cuando la portada ya salió de la pantalla.
    useEffect(() => {
        const el = finPortadaRef.current;
        if (!el) return;
        const io = new IntersectionObserver(([e]) => setCompacto(!e.isIntersecting), { root: scrollRef.current, threshold: 0 });
        io.observe(el);
        return () => io.disconnect();
    }, [menu]);

    // La píldora de la sección que se está leyendo se enciende sola al bajar.
    useEffect(() => {
        const root = scrollRef.current;
        if (!root || resultados || !grupos.length) return;
        const alto = (barraRef.current?.offsetHeight || 0) + 16;
        const io = new IntersectionObserver((entries) => {
            if (saltando.current) return;
            const visibles = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            if (visibles[0]) setActiva(Number(visibles[0].target.dataset.i));
        }, { root, rootMargin: `-${alto}px 0px -60% 0px`, threshold: 0 });
        grupos.forEach((_, i) => { const s = document.getElementById(idSeccion(i)); if (s) io.observe(s); });
        return () => io.disconnect();
    }, [grupos, resultados]);

    // Y la píldora encendida se centra en su carril.
    useEffect(() => {
        const fila = pildorasRef.current;
        const p = fila?.querySelector(`[data-pildora="${activa}"]`);
        if (!fila || !p) return;
        fila.scrollTo({ left: p.offsetLeft - fila.clientWidth / 2 + p.offsetWidth / 2, behavior: "smooth" });
    }, [activa]);

    const irA = (i) => {
        const root = scrollRef.current;
        const s = document.getElementById(idSeccion(i));
        if (!root || !s) return;
        setActiva(i);
        saltando.current = true;
        const alto = barraRef.current?.offsetHeight || 0;
        root.scrollTo({ top: s.offsetTop - alto - 8, behavior: "smooth" });
        setTimeout(() => { saltando.current = false; }, 700);
    };

    const agregar = ({ plato: p, qty, nota: n, opciones, unitario, desde }) => {
        const ops = opciones.map(o => o.id).sort((a, b) => a - b);
        const key = `${p.id}:${ops.join(".")}:${n}`;
        setCarrito(c => {
            const ya = c.find(l => l.key === key);
            if (ya) return c.map(l => (l.key === key ? { ...l, qty: Math.min(20, l.qty + qty) } : l));
            return [...c, { key, product_id: p.id, name: p.name, qty, note: n || "", options: ops, detalle: opciones.map(o => o.name).join(" · "), unitario, image_url: p.image_url || null }];
        });
        setPlato(null);
        // Tras pintar: con el primer plato la barra todavía no existía cuando se tocó "Agregar".
        setTimeout(() => flyToCart(desde || null, { image_url: p.image_url, name: p.name, qty }), 40);
    };

    const enviar = async () => {
        setEnviando(true);
        setErrorEnvio(null);
        try {
            const r = await publicApi.mesaPedir(token, {
                items: carrito.map(l => ({ product_id: l.product_id, qty: l.qty, note: l.note || null, options: l.options })),
                note: nota || null,
                ...(extraPedido || {}),
            });
            // Se borra del navegador AQUÍ y no solo por setCarrito: onEnviado cierra la carta en
            // el mismo instante y React descarta la actualización pendiente de un componente que
            // se desmonta, así que el carrito viejo volvía a aparecer al pedir otra cosa.
            guardarCarrito(token, []);
            setCarrito([]);
            setNota("");
            onEnviado?.(r);
        } catch (e) {
            setErrorEnvio(e?.message || "No se pudo enviar el pedido");
        } finally { setEnviando(false); }
    };

    const cerrarBusqueda = () => { setBuscando(false); setQ(""); };

    // Mientras la carta está abierta, el documento y la barra del navegador van en el fondo de la
    // tienda (al cerrarla vuelve el de la página de la mesa). Ver helpers/fondoPagina.js.
    useEffect(() => pintarFondo(fondo), [fondo]);

    // La franja de la hora y la batería: Brave en el iPhone la pinta OPACA con el theme-color de
    // la página, encima de lo que haya debajo. Con el fondo oscuro de la tienda salía una franja
    // negra sobre la portada naranja (31-10-2026). Mientras se ve la portada va en su color; al
    // bajar, con la barra fija arriba, en el del fondo.
    const colorPortada = store.cover_url ? "#171717" : store.brand_color ? `#${String(store.brand_color).replace("#", "")}` : fondo;
    useEffect(() => {
        document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", compacto ? fondo : colorPortada));
    }, [compacto, fondo, colorPortada]);

    // La carta siempre abre desde arriba, con la portada y "Mi mesa" a la vista.
    useEffect(() => { scrollRef.current?.scrollTo(0, 0); }, []);

    return (
        <div ref={scrollRef} className="fixed inset-0 z-50 overflow-y-auto overscroll-contain catalog-sheet-in" style={{ backgroundColor: fondo, "--papel": papel }}>
            {/* Portada: la foto del local (el primer banner de su catálogo) o, sin foto, el color
                de la tienda. Encima, el logo, el nombre y la mesa. */}
            <header className="relative h-[256px] overflow-hidden bg-brand-600">
                {store.cover_url ? (
                    <img src={resolveImageUrl(store.cover_url)} alt="" className="hero-zoom absolute inset-0 w-full h-full object-cover" />
                ) : (
                    <>
                        <span className="absolute inset-0 bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700" aria-hidden="true" />
                        <span className="absolute -right-12 -top-16 w-56 h-56 rounded-full bg-white/10" aria-hidden="true" />
                        <span className="absolute right-10 top-24 w-28 h-28 rounded-full bg-white/[0.07]" aria-hidden="true" />
                    </>
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/30" aria-hidden="true" />
                <div className="absolute inset-x-0 top-0 max-w-[640px] mx-auto px-4 pt-[max(0.875rem,env(safe-area-inset-top))] flex items-center justify-between">
                    <button onClick={onClose} className="h-10 pl-2 pr-3.5 rounded-full bg-black/35 backdrop-blur text-white text-[13px] font-semibold flex items-center gap-1 active:scale-95 transition-transform">
                        <Atras className="w-[18px] h-[18px]" /> Mi mesa
                    </button>
                    <span className="h-8 px-3 rounded-full bg-white/90 text-neutral-900 text-[12px] font-semibold flex items-center">{mesa}</span>
                </div>
                {/* El logo va sobre el fondo de la tienda, que es donde lo muestra su catálogo: un
                    logo claro sobre blanco desaparecía. Ancho libre, porque muchos son apaisados. */}
                <div className="absolute inset-x-0 bottom-0 max-w-[640px] mx-auto px-4 pb-5 rise-in">
                    {store.logo_url && (
                        <span className="inline-flex h-12 max-w-[200px] px-3 mb-3 rounded-2xl shadow-lg items-center" style={{ backgroundColor: store.bg_color || "#FFFFFF" }}>
                            <img src={resolveImageUrl(store.logo_url)} alt="" className="h-9 w-auto max-w-full object-contain" />
                        </span>
                    )}
                    <div className="min-w-0 text-white">
                        <h1 className="font-display text-[26px] font-bold tracking-tight leading-[1.05] truncate">{store.name}</h1>
                        <p className="text-[13px] text-white/80 mt-1 truncate">{store.slogan || (area ? `${area} · Pide desde tu mesa` : "Pide desde tu mesa")}</p>
                    </div>
                </div>
            </header>
            <div ref={finPortadaRef} className="h-px -mt-px" aria-hidden="true" />

            {/* Barra fija: secciones de la carta (con su foto) y la búsqueda. */}
            <div ref={barraRef} className={`sticky top-0 z-20 border-b transition-shadow ${tinta.borde} ${compacto ? "shadow-[0_8px_20px_-14px_rgba(0,0,0,.5)]" : ""}`} style={{ backgroundColor: fondo }}>
                <div className="max-w-[640px] mx-auto">
                    {compacto && !buscando && (
                        <div className="px-4 pt-[max(0.5rem,env(safe-area-inset-top))] h-12 box-content flex items-center gap-2.5 rise-in">
                            {/* El mismo "Mi mesa" de la portada, completo y no solo la flecha (31-10-2026). */}
                            <button onClick={onClose} className={`shrink-0 h-9 pl-2 pr-3.5 rounded-full text-[13px] font-semibold flex items-center gap-1 ${tinta.pildora} active:scale-95 transition-transform`}><Atras className="w-[18px] h-[18px]" /> Mi mesa</button>
                            <span className={`flex-1 min-w-0 truncate text-[15px] font-semibold ${tinta.fuerte}`}>{store.name}</span>
                            <span className={`text-[12px] ${tinta.suave}`}>{mesa}</span>
                        </div>
                    )}
                    {buscando ? (
                        <div className="px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] flex items-center gap-2">
                            <div className="relative flex-1">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"><Lupa /></span>
                                <input autoFocus value={q} onChange={e => setQ(e.target.value)} autoComplete="off" placeholder="Busca un plato o bebida"
                                    className="w-full h-11 pl-10 pr-3 rounded-full bg-white border border-black/10 text-[16px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15" />
                            </div>
                            <button onClick={cerrarBusqueda} className={`h-11 px-3 text-[14px] font-semibold ${tinta.fuerte}`}>Cancelar</button>
                        </div>
                    ) : grupos.length > 0 && (
                        <div ref={pildorasRef} className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-4 py-2.5">
                            <button onClick={() => setBuscando(true)} aria-label="Buscar en la carta" className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${tinta.pildora}`}><Lupa /></button>
                            {grupos.map((g, i) => {
                                const on = i === activa;
                                return (
                                    <button key={g.name} data-pildora={i} onClick={() => irA(i)}
                                        className={`shrink-0 h-10 rounded-full text-[13px] font-semibold whitespace-nowrap flex items-center gap-2 transition-colors ${g.image_url ? "pl-1 pr-3.5" : "px-4"} ${on ? "bg-brand-500 text-brand-ink shadow-sm" : tinta.pildora}`}>
                                        {g.image_url && <img src={resolveImageUrl(g.image_url)} alt="" loading="lazy" className="w-8 h-8 rounded-full object-cover" />}
                                        {g.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-[640px] mx-auto pb-32">
                {error ? (
                    <div className="py-16 px-6 text-center">
                        <p className={`text-[15px] font-semibold ${tinta.fuerte}`}>{error}</p>
                        <p className={`text-[13px] mt-1 ${tinta.suave}`}>Pídele el menú al mesonero.</p>
                    </div>
                ) : !menu ? (
                    <div className="px-4 pt-6 space-y-3">
                        <div className="flex gap-3 overflow-hidden">
                            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton shrink-0 w-[152px] aspect-[4/5] rounded-[22px]" />)}
                        </div>
                        <div className="rounded-[26px] p-4 space-y-4" style={{ backgroundColor: papel }}>
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="flex gap-4 items-center">
                                    <div className="flex-1 space-y-2"><div className="skeleton h-3.5 w-1/2 rounded-full" /><div className="skeleton h-3 w-3/4 rounded-full" /><div className="skeleton h-3.5 w-16 rounded-full" /></div>
                                    <div className="skeleton w-[84px] h-[84px] rounded-[18px] shrink-0" />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : resultados ? (
                    <div className="px-4 pt-4">
                        <p className={`px-1 mb-2.5 text-[13px] ${tinta.suave}`}>
                            {resultados.length ? `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"}` : "Nada con ese nombre en la carta."}
                        </p>
                        {resultados.length > 0 && (
                            <ul className="rounded-[24px] px-4 divide-y divide-black/[0.06]" style={{ backgroundColor: papel }}>
                                {resultados.map(p => <Fila key={p.id} p={p} n={enCarrito(p.id)} sym={sym} onOpen={setPlato} />)}
                            </ul>
                        )}
                    </div>
                ) : platos.length === 0 ? (
                    <div className="py-16 px-6 text-center">
                        <p className={`text-[15px] font-semibold ${tinta.fuerte}`}>La carta está vacía por ahora</p>
                        <p className={`text-[13px] mt-1 ${tinta.suave}`}>Pídele al mesonero lo que quieras.</p>
                    </div>
                ) : (
                    <>
                        <EnCurso grupos={enCurso} papel={papel} />
                        {paraTi.length > 0 && (
                            <Favoritos platos={paraTi} sym={sym} enCarrito={enCarrito} tinta={tinta} onOpen={setPlato}
                                titulo={`Para ti, ${saludo || cliente.customer.name}`}
                                detalle={cliente.suggestions.visits > 1 ? `${cliente.suggestions.visits} visitas` : null} />
                        )}
                        <Favoritos platos={paraTi.length ? favoritos.filter(f => !paraTi.some(x => x.id === f.id)) : favoritos} sym={sym} enCarrito={enCarrito} tinta={tinta} onOpen={setPlato} />
                        {grupos.map((g, i) => (
                            // Sin el banner de foto por sección (31-10-2026, "más limpio"): la foto
                            // de cada categoría ya va en su píldora de la barra.
                            <section key={g.name} id={idSeccion(i)} data-i={i} className="px-4 pt-8">
                                <div className="px-1 pb-3">
                                    <h2 className={`font-display text-[20px] font-bold tracking-tight leading-none ${tinta.fuerte}`}>{g.name}</h2>
                                    {g.description && <p className={`text-[13px] mt-1.5 ${tinta.suave}`}>{g.description}</p>}
                                </div>
                                <ul className="px-4 rounded-[24px] divide-y divide-black/[0.06]" style={{ backgroundColor: papel }}>
                                    {g.platos.map(p => <Fila key={p.id} p={p} n={enCarrito(p.id)} sym={sym} onOpen={setPlato} />)}
                                </ul>
                            </section>
                        ))}
                        <p className={`pt-8 text-center text-[12px] ${tinta.suave}`}>
                            {modo === "directo" ? "Tu pedido sale a la cocina apenas lo envíes." : "El mesonero confirma tu pedido antes de pasarlo a la cocina."}
                        </p>
                    </>
                )}
            </div>

            {cuenta > 0 && !revisando && (
                <BarraPedido cuenta={cuenta} total={total} sym={sym} fondo={fondo} onOpen={() => setRevisando(true)} />
            )}

            {plato && <Plato token={token} plato={plato} sym={sym} panel={papel} onAgregar={agregar} onClose={() => setPlato(null)} />}

            {revisando && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px] catalog-overlay-in" onClick={() => setRevisando(false)} />
                    <div className="relative w-full sm:max-w-[520px] alto-hoja-92 rounded-t-[28px] sm:rounded-[28px] overflow-hidden flex flex-col shadow-2xl catalog-sheet-in" style={{ backgroundColor: papel }}>
                        <div className="sm:hidden pt-2.5 flex justify-center" aria-hidden="true"><span className="w-10 h-1 rounded-full bg-black/15" /></div>
                        <div className="shrink-0 px-5 pt-3 sm:pt-5 pb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <span className="w-11 h-11 rounded-2xl bg-brand-500 text-brand-ink flex items-center justify-center"><Bolsa /></span>
                                <div>
                                    <h3 className="font-display text-[21px] font-bold text-neutral-900 leading-tight">Tu pedido</h3>
                                    <p className="text-[12px] text-neutral-500">{cuenta} {cuenta === 1 ? "plato" : "platos"} · {mesa}</p>
                                </div>
                            </div>
                            <button onClick={() => setRevisando(false)} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-black/[0.05] hover:bg-black/[0.09] flex items-center justify-center text-neutral-700"><X /></button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3">
                            {carrito.length === 0 ? (
                                <p className="py-10 text-center text-[14px] text-neutral-500">Tu pedido está vacío.</p>
                            ) : (
                                <ul className="space-y-2.5">
                                    {carrito.map((l, i) => (
                                        <li key={l.key} style={{ "--i": i }} className="rise-in rounded-[20px] bg-white ring-1 ring-black/[0.05] p-3 flex items-center gap-3">
                                            <div className="w-14 h-14 rounded-2xl bg-neutral-100 overflow-hidden shrink-0">
                                                <Foto src={l.image_url} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[14px] font-bold uppercase tracking-tight text-neutral-900 leading-snug">{l.name}</div>
                                                {(l.detalle || l.note) && <div className="text-[12px] text-neutral-500 leading-snug">{[l.detalle, l.note && `"${l.note}"`].filter(Boolean).join(" · ")}</div>}
                                                <div className="text-[14px] font-bold tabular-nums text-neutral-900 mt-0.5">{dinero(l.unitario * l.qty, sym)}</div>
                                            </div>
                                            <Cantidad value={l.qty} min={0} onChange={q2 => setCarrito(c => (q2 === 0 ? c.filter(x => x.key !== l.key) : c.map(x => (x.key === l.key ? { ...x, qty: q2 } : x))))} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {carrito.length > 0 && (
                                <label className="block mt-4">
                                    <span className="flex items-center justify-between text-[13px] font-semibold text-neutral-800 mb-1.5">
                                        Algo más para el mesonero <span className="text-[12px] font-normal text-neutral-500">Opcional</span>
                                    </span>
                                    <input value={nota} onChange={e => setNota(e.target.value.slice(0, 200))} autoComplete="off" placeholder="Traer servilletas, cubiertos para niño…"
                                        className="w-full h-12 px-4 rounded-2xl bg-white border border-black/10 text-[16px] sm:text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-shadow" />
                                </label>
                            )}
                            {errorEnvio && <p className="mt-3 text-[13px] text-red-600">{errorEnvio}</p>}
                        </div>
                        {carrito.length > 0 && (
                            <div className="shrink-0 border-t border-black/[0.06] bg-white/60 backdrop-blur px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2.5">
                                <div className="flex items-baseline justify-between">
                                    <span className="text-[14px] font-semibold text-neutral-900">Total del pedido</span>
                                    <span className="font-display text-[24px] font-bold tracking-tight tabular-nums text-neutral-900">{dinero(total, sym)}</span>
                                </div>
                                <p className="text-[12px] text-neutral-500 flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${modo === "directo" ? "bg-emerald-500" : "bg-amber-500"}`} />
                                    {modo === "directo" ? "Sale a la cocina apenas lo envíes." : "El mesonero lo confirma y lo pasa a la cocina."}
                                </p>
                                <button onClick={enviar} disabled={enviando}
                                    className="btn-accent w-full h-14 rounded-full text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99] transition-transform">
                                    {enviando && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                                    {enviando ? "Enviando..." : `Enviar pedido · ${dinero(total, sym)}`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
