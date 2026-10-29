import { useEffect, useMemo, useRef, useState } from "react";
import { publicApi } from "../../services/api";
import { resolveImageUrl } from "../../helpers/image";
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
// "Ver mi pedido", que rebota al recibirlo; cada tarjeta tiene su + y muestra cuántos van.

const dinero = (n, sym) => `${sym}${sym.length > 1 ? " " : ""}${Number(n || 0).toFixed(2)}`;
const claveCarrito = (token) => `mesa_carrito_${token}`;
const leerCarrito = (token) => { try { return JSON.parse(sessionStorage.getItem(claveCarrito(token)) || "[]"); } catch { return []; } };
const guardarCarrito = (token, c) => { try { sessionStorage.setItem(claveCarrito(token), JSON.stringify(c)); } catch { /* sin almacenamiento */ } };

const X = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M6 18L18 6M6 6l12 12" /></svg>;
const Mas = ({ className = "w-4 h-4" }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.8} d="M12 5v14M5 12h14" /></svg>;
const Menos = ({ className = "w-4 h-4" }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.8} d="M5 12h14" /></svg>;
const Bolsa = ({ className = "w-5 h-5" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12l-1 12.2a2 2 0 01-2 1.8H9a2 2 0 01-2-1.8L6 7z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 10V6a3 3 0 016 0v4" />
    </svg>
);

function Cantidad({ value, onChange, min = 1, max = 20 }) {
    return (
        <div className="inline-flex items-center rounded-full bg-white ring-1 ring-black/[0.08] p-1">
            <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min && min > 0}
                className="w-9 h-9 rounded-full text-neutral-700 flex items-center justify-center hover:bg-black/5 active:scale-90 transition-all disabled:opacity-30" aria-label="Uno menos"><Menos /></button>
            <span key={value} className="badge-pop w-8 text-center text-[16px] font-bold tabular-nums">{value}</span>
            <button type="button" onClick={() => onChange(Math.min(max, value + 1))}
                className="w-9 h-9 rounded-full bg-brand-500 text-brand-ink flex items-center justify-center hover:brightness-110 active:scale-90 transition-all" aria-label="Uno más"><Mas /></button>
        </div>
    );
}

// Ficha de un plato: foto, adicionales, cantidad y nota.
function Plato({ token, plato, sym, onAgregar, onClose }) {
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
            <div className="relative w-full sm:max-w-[520px] max-h-[92dvh] bg-[#FBFAF8] rounded-t-[28px] sm:rounded-[28px] overflow-hidden flex flex-col shadow-2xl catalog-sheet-in">
                <div ref={fotoRef} className="relative shrink-0 h-[220px] bg-neutral-100">
                    {plato.image_url
                        ? <img src={resolveImageUrl(plato.image_url)} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center font-display text-6xl font-bold text-brand-500/30">{plato.name.charAt(0)}</div>}
                    <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent" aria-hidden="true" />
                    <button onClick={onClose} aria-label="Cerrar" className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/55 backdrop-blur text-white flex items-center justify-center"><X /></button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-3 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <h3 className="font-display text-[22px] font-bold leading-tight text-neutral-900">{plato.name}</h3>
                        <div className="text-[20px] font-bold tabular-nums whitespace-nowrap text-neutral-900">{dinero(plato.price, sym)}</div>
                    </div>
                    {plato.description && <p className="text-[14px] text-neutral-600 leading-relaxed -mt-2">{plato.description}</p>}
                    {grupos === null ? (
                        <div className="py-4 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                    ) : grupos.length > 0 && (
                        <AddonPicker groups={grupos} value={opciones} onChange={setOpciones} sym={sym} tone="catalog" />
                    )}
                    <label className="block">
                        <span className="flex items-center justify-between text-[13px] font-semibold text-neutral-800 mb-1.5">
                            Nota para la cocina <span className="text-[12px] font-normal text-neutral-500">Opcional</span>
                        </span>
                        <input value={nota} onChange={e => setNota(e.target.value.slice(0, 120))} autoComplete="off" placeholder="Sin cebolla, bien cocido…"
                            className="w-full h-12 px-4 rounded-2xl bg-white border border-black/10 text-[16px] sm:text-[15px] text-neutral-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-shadow" />
                    </label>
                    {error && <p className="text-[13px] text-red-600">{error}</p>}
                </div>
                <div className="shrink-0 border-t border-black/[0.06] bg-white/70 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center gap-3">
                    <Cantidad value={qty} onChange={setQty} />
                    <button disabled={grupos === null || !!falta}
                        onClick={() => onAgregar({ plato, qty, nota, opciones, unitario, desde: fotoRef.current?.getBoundingClientRect() })}
                        className="btn-accent flex-1 h-12 rounded-full text-[15px] font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform">
                        {falta ? `Elige ${falta.name.toLowerCase()}` : `Agregar · ${dinero(unitario * qty, sym)}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Barra de "Ver mi pedido": es el destino del plato que vuela (data-cart-target). Al
// recibirlo rebota y el número salta.
function BarraPedido({ cuenta, total, sym, onOpen }) {
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
        <div className="fixed bottom-0 inset-x-0 px-3 pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#F6F4F1] via-[#F6F4F1]/90 to-transparent pointer-events-none">
            <button ref={ref} onClick={onOpen} {...{ [CART_TARGET_ATTR]: "" }}
                className="fab-in pointer-events-auto btn-accent max-w-[560px] mx-auto w-full h-14 rounded-full text-[15px] font-semibold flex items-center gap-3 pl-2 pr-5 shadow-[0_14px_30px_-12px_rgb(var(--c-brand-700)/0.9)]">
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

export default function MenuMesaPublico({ token, mesa, sym, modo, onClose, onEnviado }) {
    const [menu, setMenu] = useState(null);
    const [error, setError] = useState(null);
    const [cat, setCat] = useState("");
    const [plato, setPlato] = useState(null);
    const [carrito, setCarritoState] = useState(() => leerCarrito(token));
    const setCarrito = (fn) => setCarritoState(c => { const n = typeof fn === "function" ? fn(c) : fn; guardarCarrito(token, n); return n; });
    const [revisando, setRevisando] = useState(false);
    const [nota, setNota] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [errorEnvio, setErrorEnvio] = useState(null);

    useEffect(() => {
        publicApi.mesaMenu(token)
            .then(r => setMenu(r.data || []))
            .catch(e => setError(e?.message || "No se pudo cargar el menú"));
    }, [token]);

    const categorias = useMemo(() => [...new Set((menu || []).map(p => p.category))], [menu]);
    const visibles = useMemo(() => (menu || []).filter(p => !cat || p.category === cat), [menu, cat]);
    const cuenta = carrito.reduce((a, l) => a + l.qty, 0);
    const total = carrito.reduce((a, l) => a + l.qty * l.unitario, 0);
    const enCarrito = (id) => carrito.filter(l => l.product_id === id).reduce((a, l) => a + l.qty, 0);

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
            });
            setCarrito([]);
            onEnviado?.(r);
        } catch (e) {
            setErrorEnvio(e?.message || "No se pudo enviar el pedido");
        } finally { setEnviando(false); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-[#F6F4F1] flex flex-col catalog-sheet-in">
            <header className="shrink-0 bg-white/90 backdrop-blur border-b border-black/[0.06]">
                <div className="max-w-[560px] mx-auto px-4 h-16 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className="w-10 h-10 rounded-2xl bg-brand-500 text-brand-ink flex items-center justify-center shrink-0"><Bolsa /></span>
                        <div className="min-w-0">
                            <div className="font-display text-[19px] font-bold text-neutral-900 leading-tight truncate">Menú</div>
                            <div className="text-[12px] text-neutral-500 truncate">Pedido para {mesa}</div>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar el menú" className="w-10 h-10 rounded-full bg-black/[0.05] hover:bg-black/[0.09] flex items-center justify-center text-neutral-700"><X /></button>
                </div>
                {categorias.length > 1 && (
                    <div className="max-w-[560px] mx-auto px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
                        {["", ...categorias].map(c => (
                            <button key={c || "todo"} onClick={() => setCat(c)}
                                className={`h-9 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${cat === c ? "bg-brand-500 text-brand-ink shadow-sm" : "bg-black/[0.05] text-neutral-700 hover:bg-black/[0.08]"}`}>
                                {c || "Todo"}
                            </button>
                        ))}
                    </div>
                )}
            </header>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[560px] mx-auto px-4 py-3 pb-28 space-y-2.5">
                    {error ? (
                        <p className="py-16 text-center text-[14px] text-neutral-600">{error}</p>
                    ) : !menu ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="rounded-[22px] bg-white p-3 flex gap-3 items-center">
                                <div className="w-20 h-20 rounded-2xl bg-black/[0.05] animate-pulse shrink-0" />
                                <div className="flex-1 space-y-2"><div className="h-3.5 w-1/2 rounded-full bg-black/[0.06] animate-pulse" /><div className="h-3 w-3/4 rounded-full bg-black/[0.04] animate-pulse" /></div>
                            </div>
                        ))
                    ) : visibles.map((p, i) => {
                        const n = enCarrito(p.id);
                        return (
                            <button key={`${cat}-${p.id}`} onClick={() => !p.agotado && setPlato(p)} disabled={p.agotado}
                                style={{ "--i": Math.min(i, 10) }}
                                className={`rise-in w-full text-left rounded-[22px] bg-white p-3 flex gap-3 items-center ring-1 transition-all active:scale-[0.99] disabled:opacity-55 ${n > 0 ? "ring-2 ring-brand-500/60" : "ring-black/[0.05] hover:ring-black/[0.1]"}`}>
                                <div className="w-20 h-20 rounded-2xl bg-neutral-100 overflow-hidden shrink-0">
                                    {p.image_url && <img src={resolveImageUrl(p.image_url)} alt="" loading="lazy" className="w-full h-full object-cover" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[15px] font-semibold text-neutral-900 leading-snug">{p.name}</div>
                                    {p.description && <div className="text-[13px] text-neutral-500 line-clamp-2 mt-0.5">{p.description}</div>}
                                    <div className="mt-1 text-[15px] font-bold tabular-nums text-neutral-900">
                                        {p.agotado ? <span className="text-red-600 text-[13px] font-semibold">Agotado</span> : dinero(p.price, sym)}
                                    </div>
                                </div>
                                {!p.agotado && (
                                    <span className={`w-10 h-10 rounded-full shrink-0 flex items-center justify-center ${n > 0 ? "bg-brand-500/15 text-brand-600 ring-1 ring-brand-500/40" : "bg-brand-500 text-brand-ink"}`}>
                                        {n > 0 ? <span key={n} className="badge-pop text-[14px] font-bold tabular-nums">{n}</span> : <Mas className="w-5 h-5" />}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {cuenta > 0 && !revisando && (
                <BarraPedido cuenta={cuenta} total={total} sym={sym} onOpen={() => setRevisando(true)} />
            )}

            {plato && <Plato token={token} plato={plato} sym={sym} onAgregar={agregar} onClose={() => setPlato(null)} />}

            {revisando && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px] catalog-overlay-in" onClick={() => setRevisando(false)} />
                    <div className="relative w-full sm:max-w-[520px] max-h-[92dvh] bg-[#FBFAF8] rounded-t-[28px] sm:rounded-[28px] overflow-hidden flex flex-col shadow-2xl catalog-sheet-in">
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
                                            <div className="w-14 h-14 rounded-2xl bg-neutral-100 overflow-hidden shrink-0 flex items-center justify-center">
                                                {l.image_url
                                                    ? <img src={resolveImageUrl(l.image_url)} alt="" className="w-full h-full object-cover" />
                                                    : <span className="font-display text-[18px] font-bold text-brand-500/50">{l.name.charAt(0)}</span>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[14px] font-semibold text-neutral-900 leading-snug">{l.name}</div>
                                                {(l.detalle || l.note) && <div className="text-[12px] text-neutral-500 leading-snug">{[l.detalle, l.note && `"${l.note}"`].filter(Boolean).join(" · ")}</div>}
                                                <div className="text-[14px] font-bold tabular-nums text-neutral-900 mt-0.5">{dinero(l.unitario * l.qty, sym)}</div>
                                            </div>
                                            <Cantidad value={l.qty} min={0} onChange={q => setCarrito(c => (q === 0 ? c.filter(x => x.key !== l.key) : c.map(x => (x.key === l.key ? { ...x, qty: q } : x))))} />
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
                                        className="w-full h-12 px-4 rounded-2xl bg-white border border-black/10 text-[16px] sm:text-[15px] text-neutral-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition-shadow" />
                                </label>
                            )}
                            {errorEnvio && <p className="mt-3 text-[13px] text-red-600">{errorEnvio}</p>}
                        </div>
                        {carrito.length > 0 && (
                            <div className="shrink-0 border-t border-black/[0.06] bg-white/70 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2.5">
                                <div className="flex items-baseline justify-between">
                                    <span className="text-[14px] font-semibold text-neutral-900">Total del pedido</span>
                                    <span className="font-display text-[22px] font-bold tabular-nums text-neutral-900">{dinero(total, sym)}</span>
                                </div>
                                <p className="text-[12px] text-neutral-500 flex items-center gap-1.5">
                                    <span className={`w-1.5 h-1.5 rounded-full ${modo === "directo" ? "bg-emerald-500" : "bg-amber-500"}`} />
                                    {modo === "directo" ? "Sale a la cocina apenas lo envíes." : "El mesonero lo confirma y lo pasa a la cocina."}
                                </p>
                                <button onClick={enviar} disabled={enviando}
                                    className="btn-accent w-full h-14 rounded-full text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99] transition-transform">
                                    {enviando && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                                    {enviando ? "Enviando..." : "Enviar pedido"}
                                    {!enviando && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14m-6-6l6 6-6 6" /></svg>}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
