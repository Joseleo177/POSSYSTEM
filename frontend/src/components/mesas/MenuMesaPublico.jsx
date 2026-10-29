import { useEffect, useMemo, useState } from "react";
import { publicApi } from "../../services/api";
import { resolveImageUrl } from "../../helpers/image";
import AddonPicker, { faltante, precioExtras } from "./AddonPicker";

// Pedir desde el QR de la mesa: el menú de la sucursal, la ficha de cada plato con sus
// adicionales (el mismo selector del mesonero) y el carrito. Va a pantalla completa sobre la
// página de la mesa. Al enviar, el servidor lo valida como una ronda del mesonero (ver
// services/mesaPublica.js) y, según el modo, espera al mesonero o sale directo a cocina.
//
// El carrito se guarda en el navegador por mesa: recargar la página no lo pierde.

const dinero = (n, sym) => `${sym}${sym.length > 1 ? " " : ""}${Number(n || 0).toFixed(2)}`;
const claveCarrito = (token) => `mesa_carrito_${token}`;
const leerCarrito = (token) => { try { return JSON.parse(sessionStorage.getItem(claveCarrito(token)) || "[]"); } catch { return []; } };
const guardarCarrito = (token, c) => { try { sessionStorage.setItem(claveCarrito(token), JSON.stringify(c)); } catch { /* sin almacenamiento */ } };

const X = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M6 18L18 6M6 6l12 12" /></svg>;

function Cantidad({ value, onChange, min = 1, max = 20 }) {
    return (
        <div className="inline-flex items-center rounded-xl border border-black/10 bg-white">
            <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="w-11 h-11 text-[20px] text-neutral-700" aria-label="Uno menos">−</button>
            <span className="w-8 text-center text-[16px] font-semibold tabular-nums">{value}</span>
            <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="w-11 h-11 text-[20px] text-neutral-700" aria-label="Uno más">+</button>
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

    useEffect(() => {
        if (!plato.has_addons) return;
        publicApi.mesaPlato(token, plato.id)
            .then(r => setGrupos(r.data || []))
            .catch(e => { setGrupos([]); setError(e?.message || "No se pudieron cargar las opciones"); });
    }, [plato.id]);

    const falta = faltante(grupos, opciones);
    const unitario = plato.price + precioExtras(opciones);

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="w-full sm:max-w-[520px] max-h-[92dvh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col">
                <div className="relative shrink-0 h-[180px] bg-neutral-100">
                    {plato.image_url && <img src={resolveImageUrl(plato.image_url)} alt="" className="w-full h-full object-cover" />}
                    <button onClick={onClose} aria-label="Cerrar" className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/55 text-white flex items-center justify-center"><X /></button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-3 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <h3 className="text-[19px] font-semibold leading-tight text-neutral-900">{plato.name}</h3>
                        <div className="text-[19px] font-bold tabular-nums whitespace-nowrap text-neutral-900">{dinero(plato.price, sym)}</div>
                    </div>
                    {plato.description && <p className="text-[14px] text-neutral-600 leading-relaxed">{plato.description}</p>}
                    {grupos === null ? (
                        <div className="py-4 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                    ) : grupos.length > 0 && (
                        <AddonPicker groups={grupos} value={opciones} onChange={setOpciones} sym={sym} tone="catalog" />
                    )}
                    <div>
                        <div className="text-[13px] text-neutral-500 mb-1.5">Nota para la cocina <span className="text-neutral-400">(opcional)</span></div>
                        <input value={nota} onChange={e => setNota(e.target.value.slice(0, 120))} autoComplete="off" placeholder="Sin cebolla, bien cocido…"
                            className="w-full h-11 px-3 rounded-xl border border-black/10 text-[15px] text-neutral-900 focus:outline-none focus:border-brand-500" />
                    </div>
                    {error && <p className="text-[13px] text-red-600">{error}</p>}
                </div>
                <div className="shrink-0 border-t border-black/10 px-5 py-3 flex items-center gap-3">
                    <Cantidad value={qty} onChange={setQty} />
                    <button disabled={grupos === null || !!falta} onClick={() => onAgregar({ plato, qty, nota, opciones, unitario })}
                        className="btn-accent flex-1 h-12 rounded-xl text-[15px] font-semibold disabled:opacity-50">
                        {falta ? `Elige ${falta.name.toLowerCase()}` : `Agregar · ${dinero(unitario * qty, sym)}`}
                    </button>
                </div>
            </div>
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

    const agregar = ({ plato: p, qty, nota: n, opciones, unitario }) => {
        const ops = opciones.map(o => o.id).sort((a, b) => a - b);
        const key = `${p.id}:${ops.join(".")}:${n}`;
        setCarrito(c => {
            const ya = c.find(l => l.key === key);
            if (ya) return c.map(l => (l.key === key ? { ...l, qty: Math.min(20, l.qty + qty) } : l));
            return [...c, { key, product_id: p.id, name: p.name, qty, note: n || "", options: ops, detalle: opciones.map(o => o.name).join(" · "), unitario }];
        });
        setPlato(null);
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
        <div className="fixed inset-0 z-50 bg-surface-1 flex flex-col">
            <header className="shrink-0 bg-white border-b border-black/10">
                <div className="max-w-[560px] mx-auto px-4 h-14 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[16px] font-semibold text-neutral-900 truncate">Menú</div>
                        <div className="text-[12px] text-neutral-500 truncate">Pedido para {mesa}</div>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar el menú" className="w-10 h-10 rounded-full hover:bg-black/5 flex items-center justify-center text-neutral-700"><X /></button>
                </div>
                {categorias.length > 1 && (
                    <div className="max-w-[560px] mx-auto px-4 pb-2.5 flex gap-2 overflow-x-auto scrollbar-hide">
                        {["", ...categorias].map(c => (
                            <button key={c || "todo"} onClick={() => setCat(c)}
                                className={`h-9 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap border ${cat === c ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-700 border-black/10"}`}>
                                {c || "Todo"}
                            </button>
                        ))}
                    </div>
                )}
            </header>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-[560px] mx-auto px-4 py-3 pb-28 space-y-2">
                    {error ? (
                        <p className="py-16 text-center text-[14px] text-neutral-600">{error}</p>
                    ) : !menu ? (
                        <div className="py-16 flex justify-center"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                    ) : visibles.map(p => (
                        <button key={p.id} onClick={() => !p.agotado && setPlato(p)} disabled={p.agotado}
                            className="w-full text-left rounded-2xl bg-white border border-black/10 p-3 flex gap-3 items-center disabled:opacity-55">
                            <div className="w-20 h-20 rounded-xl bg-neutral-100 overflow-hidden shrink-0">
                                {p.image_url && <img src={resolveImageUrl(p.image_url)} alt="" loading="lazy" className="w-full h-full object-cover" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-[15px] font-semibold text-neutral-900 leading-snug">{p.name}</div>
                                {p.description && <div className="text-[13px] text-neutral-500 line-clamp-2 mt-0.5">{p.description}</div>}
                                <div className="mt-1 text-[14px] font-semibold tabular-nums text-neutral-900">
                                    {p.agotado ? <span className="text-red-600 font-medium">Agotado</span> : dinero(p.price, sym)}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {cuenta > 0 && !revisando && (
                <div className="fixed bottom-0 inset-x-0 p-3 bg-gradient-to-t from-surface-1 via-surface-1 to-transparent">
                    <button onClick={() => setRevisando(true)}
                        className="btn-accent max-w-[560px] mx-auto w-full h-14 rounded-2xl text-[16px] font-semibold flex items-center justify-between px-5">
                        <span>Ver mi pedido · {cuenta}</span>
                        <span className="tabular-nums">{dinero(total, sym)}</span>
                    </button>
                </div>
            )}

            {plato && <Plato token={token} plato={plato} sym={sym} onAgregar={agregar} onClose={() => setPlato(null)} />}

            {revisando && (
                <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setRevisando(false)}>
                    <div onClick={e => e.stopPropagation()} className="w-full sm:max-w-[520px] max-h-[92dvh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col">
                        <div className="shrink-0 px-5 h-14 flex items-center justify-between border-b border-black/10">
                            <h3 className="text-[17px] font-semibold text-neutral-900">Tu pedido</h3>
                            <button onClick={() => setRevisando(false)} aria-label="Cerrar" className="w-10 h-10 rounded-full hover:bg-black/5 flex items-center justify-center text-neutral-700"><X /></button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
                            {carrito.length === 0 ? (
                                <p className="py-8 text-center text-[14px] text-neutral-500">Tu pedido está vacío.</p>
                            ) : (
                                <ul className="divide-y divide-black/10">
                                    {carrito.map(l => (
                                        <li key={l.key} className="py-3 flex items-center gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[15px] font-medium text-neutral-900">{l.name}</div>
                                                {(l.detalle || l.note) && <div className="text-[12px] text-neutral-500">{[l.detalle, l.note].filter(Boolean).join(" · ")}</div>}
                                                <div className="text-[13px] tabular-nums text-neutral-700 mt-0.5">{dinero(l.unitario * l.qty, sym)}</div>
                                            </div>
                                            <Cantidad value={l.qty} min={0} onChange={q => setCarrito(c => (q === 0 ? c.filter(x => x.key !== l.key) : c.map(x => (x.key === l.key ? { ...x, qty: q } : x))))} />
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {carrito.length > 0 && (
                                <input value={nota} onChange={e => setNota(e.target.value.slice(0, 200))} autoComplete="off" placeholder="Algo más para el mesonero (opcional)"
                                    className="mt-3 w-full h-11 px-3 rounded-xl border border-black/10 text-[15px] text-neutral-900 focus:outline-none focus:border-brand-500" />
                            )}
                            {errorEnvio && <p className="mt-3 text-[13px] text-red-600">{errorEnvio}</p>}
                        </div>
                        {carrito.length > 0 && (
                            <div className="shrink-0 border-t border-black/10 px-5 py-3 space-y-2">
                                <div className="flex items-baseline justify-between text-[15px]">
                                    <span className="text-neutral-600">Total del pedido</span>
                                    <span className="font-bold tabular-nums text-neutral-900">{dinero(total, sym)}</span>
                                </div>
                                <p className="text-[12px] text-neutral-500">
                                    {modo === "directo" ? "Sale a la cocina apenas lo envíes." : "El mesonero lo confirma y lo pasa a la cocina."}
                                </p>
                                <button onClick={enviar} disabled={enviando}
                                    className="btn-accent w-full h-12 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                                    {enviando && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                                    Enviar pedido
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
