import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../services/api";
import { fmtMoney, fmtTime, resolveImageUrl, imgRetryOnError } from "../../helpers";
import { isIntegerUnit } from "../../helpers/unitFormatter";
import ConfirmModal from "../ui/ConfirmModal";
import { Spinner } from "../ui/Spinner";
import AddonPicker, { faltante, precioExtras } from "./AddonPicker";
import CuentaAcciones from "./CuentaAcciones";

// El menú de cada sucursal se recuerda mientras la sesión esté abierta: el mesonero entra y
// sale de las mesas toda la noche, y el menú no cambia de una mesa a otra.
const menus = new Map();

const ESTADO_RONDA = {
    nueva:      { txt: "En cola",        cls: "text-content-subtle" },
    preparando: { txt: "Preparando",     cls: "text-content-subtle" },
    lista:      { txt: "Lista para llevar", cls: "text-emerald-700 dark:text-emerald-400", check: true },
    entregada:  { txt: "Entregada",      cls: "text-content-subtle" },
};

const fmtQty = (q) => {
    const n = parseFloat(q || 0);
    return n % 1 === 0 ? String(Math.round(n)) : n.toLocaleString("es-VE");
};

// "lomo de res, papa y huevo": como se le dice al cliente en la mesa.
const listaNatural = (nombres) => {
    const xs = nombres.map(n => String(n).trim().toLowerCase()).filter(Boolean);
    return xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}` : (xs[0] || "");
};

const Icono = {
    mas:   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />,
    menos: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" />,
    atras: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />,
    lupa:  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />,
    nota:  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
    plato: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 13h18M5 13a7 7 0 0114 0M12 6V4m-7 13h14" />,
    check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />,
    x:     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />,
    info:  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
};
const Svg = ({ d, className = "w-4 h-4" }) => <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">{d}</svg>;

const esAgotado = (p) => !p.is_service && p.stock !== null && parseFloat(p.stock) <= 0;
const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
// Precio de una unidad del plato con sus extras: es lo que cobra la caja (cada extra es una
// línea aparte, por plato).
const precioLinea = (l) => r2(l.product.price) + (l.options || []).reduce((s, o) => s + r2(o.price), 0);
// Cómo se leen los adicionales elegidos: "Término medio · + Queso extra".
const textoOpciones = (opts) => (opts || []).map(o => (o.price > 0 ? `+ ${o.name}` : o.name)).join(" · ");
// De a uno lo que se cuenta; lo que se pesa o se mide, con el paso del producto.
const pasoDe = (p) => (isIntegerUnit(p.unit) ? 1 : (parseFloat(p.qty_step) || 1));

/**
 * Ficha del plato: lo que el cliente pregunta en la mesa. La foto grande, la descripción y, si
 * es un combo, lo que incluye. Desde aquí también se pide con nota ("sin cebolla").
 */
function FichaPlato({ p, warehouseId, sym, onAdd, onClose }) {
    const [detalle, setDetalle] = useState(null);
    const [qty, setQty] = useState(pasoDe(p));
    const [nota, setNota] = useState("");
    const [opciones, setOpciones] = useState([]);
    const agotado = esAgotado(p);

    useEffect(() => {
        let vivo = true;
        api.tables.dish(p.id, { warehouse_id: warehouseId })
            .then(r => { if (vivo) setDetalle(r.data); })
            .catch(() => { if (vivo) setDetalle({ description: [], incluye: [] }); });
        return () => { vivo = false; };
    }, [p.id, warehouseId]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [onClose]);

    const corta = detalle?.short_description ?? p.short_description;
    const precio = Math.round(parseFloat(p.price) * 100) / 100;
    const falta = faltante(detalle?.groups, opciones);

    return (
        <div className="fixed inset-0 z-[170] flex items-end sm:items-center justify-center bg-black/50 sm:p-6" onClick={onClose}>
            <div onClick={e => e.stopPropagation()}
                className="w-full sm:max-w-[560px] max-h-[92vh] bg-white dark:bg-surface-dark-2 rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-[0_24px_64px_-12px_rgb(0_0_0/0.35)] modal-in">
                {/* Alto fijo y recortado: con aspect-ratio la caja crecía al tamaño de la foto y tapaba la
                    descripción. */}
                <div className="relative shrink-0 h-[200px] sm:h-[260px] overflow-hidden bg-surface-2 dark:bg-white/[0.04]">
                    {p.image_url ? (
                        <img src={resolveImageUrl(p.image_url)} alt={p.name} onError={imgRetryOnError}
                            className={`w-full h-full object-cover ${agotado ? "grayscale opacity-60" : ""}`} />
                    ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-content-subtle/50"><Svg d={Icono.plato} className="w-14 h-14" /></span>
                    )}
                    <button onClick={onClose} aria-label="Cerrar"
                        className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur-sm">
                        <Svg d={Icono.x} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-2 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h3 className="text-[20px] font-semibold tracking-[-0.015em] text-content dark:text-white leading-tight">{p.name}</h3>
                            {p.category_name && <div className="text-[12px] text-content-subtle mt-1">{p.category_name.charAt(0) + p.category_name.slice(1).toLowerCase()}</div>}
                        </div>
                        <div className="text-[22px] font-bold tracking-tight text-content dark:text-white tabular-nums whitespace-nowrap">{fmtMoney(precio, sym)}</div>
                    </div>

                    {corta && <p className="text-[14px] text-content dark:text-white/90 leading-relaxed">{corta}</p>}

                    {!detalle ? (
                        <div className="py-2"><Spinner /></div>
                    ) : (
                        <>
                            {detalle.description?.map((par, i) => (
                                <p key={i} className="text-[14px] text-content-subtle leading-relaxed whitespace-pre-line">{par}</p>
                            ))}
                            {/* Plato con ficha técnica: qué lleva, sin cantidades (sirve para las alergias). */}
                            {detalle.lleva?.length > 0 && (
                                <p className="text-[14px] text-content dark:text-white/90 leading-relaxed">
                                    <span className="text-content-subtle">Lleva </span>{listaNatural(detalle.lleva)}.
                                </p>
                            )}
                            {detalle.incluye?.length > 0 && (
                                <div>
                                    <div className="text-[12px] text-content-subtle mb-1.5">Incluye</div>
                                    <ul className="divide-y divide-border/60 dark:divide-white/[0.06] border-y border-border/60 dark:border-white/[0.06]">
                                        {detalle.incluye.map((it, i) => (
                                            <li key={i} className="py-2 flex gap-3 text-[14px] text-content dark:text-white">
                                                <span className="font-semibold tabular-nums w-6 text-right shrink-0">{fmtQty(it.quantity)}</span>
                                                <span>{it.name}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {!corta && !detalle.description?.length && !detalle.incluye?.length && !detalle.lleva?.length && !detalle.groups?.length && (
                                <p className="text-[13px] text-content-subtle">Este plato todavía no tiene descripción. Se carga en Catálogo, en la ficha del producto.</p>
                            )}
                            {!agotado && detalle.groups?.length > 0 && (
                                <div className="pt-1 border-t border-border/60 dark:border-white/[0.06]">
                                    <div className="pt-4"><AddonPicker groups={detalle.groups} value={opciones} onChange={setOpciones} sym={sym} /></div>
                                </div>
                            )}
                        </>
                    )}

                    {!agotado && (
                        <label className="block space-y-1">
                            <span className="text-[12px] font-medium text-content-subtle">Nota para la cocina <span className="font-normal">· opcional</span></span>
                            <input value={nota} onChange={e => setNota(e.target.value)} maxLength={200} autoComplete="off"
                                placeholder="Sin hielo, bien caliente…"
                                className="w-full h-11 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[14px] text-content dark:text-white placeholder:text-content-subtle/60 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                        </label>
                    )}
                </div>

                <div className="shrink-0 px-5 py-4 border-t border-border/60 dark:border-white/[0.06] flex items-center gap-3">
                    {agotado ? (
                        <div className="w-full h-12 rounded-xl bg-surface-2 dark:bg-white/[0.05] text-[14px] font-semibold text-content-subtle flex items-center justify-center">Agotado en esta sucursal</div>
                    ) : (
                        <>
                            <div className="w-[136px] shrink-0">
                                <Stepper qty={qty} step={pasoDe(p)} onChange={q => setQty(Math.max(pasoDe(p), q))} />
                            </div>
                            {/* Mientras falte algo obligatorio (el término), el botón dice qué falta en
                                vez de quedar gris sin explicación. */}
                            <button onClick={() => { onAdd(p, qty, nota.trim(), opciones); onClose(); }} disabled={!detalle || !!falta}
                                className="btn-accent flex-1 h-12 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60">
                                {falta
                                    ? <span className="truncate">Elige {falta.name.toLowerCase()}</span>
                                    : <>Agregar · <span className="tabular-nums">{fmtMoney((precio + precioExtras(opciones)) * qty, sym)}</span></>}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/** − cantidad +, con botones táctiles de 40px (o 32px en la lista de la ronda). */
function Stepper({ qty, onChange, step = 1, small = false }) {
    const btn = small ? "w-8 h-8" : "w-10 h-10";
    return (
        <div className="flex items-center justify-between gap-1 w-full">
            <button type="button" onClick={() => onChange(Math.max(0, +(qty - step).toFixed(3)))}
                aria-label="Quitar uno"
                className={`${btn} shrink-0 rounded-lg btn-outline flex items-center justify-center active:scale-95`}>
                <Svg d={Icono.menos} />
            </button>
            <span className={`${small ? "text-[14px] min-w-[1.75rem]" : "text-[16px] min-w-[2rem]"} font-bold text-content dark:text-white tabular-nums text-center`}>{fmtQty(qty)}</span>
            <button type="button" onClick={() => onChange(+(qty + step).toFixed(3))}
                aria-label="Sumar uno"
                className={`${btn} shrink-0 rounded-lg btn-accent flex items-center justify-center active:scale-95`}>
                <Svg d={Icono.mas} />
            </button>
        </div>
    );
}

// `qty` es la línea sin nota (la que manejan + y −); `total`, todo lo del plato en la ronda,
// con nota o sin ella: con eso se marca la tarjeta.
// La foto y el nombre abren la ficha del plato (descripción, qué incluye, nota); el botón de
// abajo suma de un toque, que es lo que se hace casi siempre.
function Plato({ p, qty, total = qty, sym, onAdd, onChange, onOpen }) {
    const agotado = esAgotado(p);
    const step = pasoDe(p);
    return (
        <article className={[
            "flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-white/[0.04] border transition-shadow",
            total > 0 ? "border-brand-500 ring-2 ring-brand-500/25 dark:border-brand-400" : "border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none",
        ].join(" ")}>
            <button type="button" onClick={() => onOpen(p)} aria-label={`Ver ${p.name}`}
                className="relative aspect-[4/3] bg-surface-2 dark:bg-white/[0.04] overflow-hidden">
                {p.image_url ? (
                    <img src={resolveImageUrl(p.image_url)} alt={p.name} loading="lazy" onError={imgRetryOnError}
                        className={`w-full h-full object-cover ${agotado ? "grayscale opacity-50" : ""}`} />
                ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-content-subtle/50"><Svg d={Icono.plato} className="w-10 h-10" /></span>
                )}
                {agotado && (
                    <span className="absolute inset-x-0 bottom-0 py-1 bg-black/60 text-white text-[12px] font-semibold">Agotado</span>
                )}
                {/* Siempre visible, sin depender del cursor: en la tablet no hay hover. */}
                <span className="absolute top-2 left-2 h-7 pl-1.5 pr-2.5 rounded-full bg-black/55 text-white text-[12px] font-medium flex items-center gap-1 backdrop-blur-sm">
                    <Svg d={Icono.info} className="w-3.5 h-3.5" /> Ver
                </span>
                {total > 0 && (
                    <span className="absolute top-2 right-2 min-w-[28px] h-7 px-2 rounded-full bg-brand-600 text-white text-[13px] font-bold flex items-center justify-center tabular-nums shadow">
                        {fmtQty(total)}
                    </span>
                )}
            </button>
            <div className="flex-1 flex flex-col p-3 gap-2">
                <button type="button" onClick={() => onOpen(p)} className="flex-1 text-left">
                    <h4 className="text-[14px] font-semibold text-content dark:text-white leading-snug line-clamp-2">{p.name}</h4>
                    {p.short_description && (
                        <p className="text-[12px] text-content-subtle leading-snug line-clamp-2 mt-0.5">{p.short_description}</p>
                    )}
                    <div className="text-[15px] font-bold tracking-tight text-content dark:text-white tabular-nums mt-1">{fmtMoney(p.price, sym)}</div>
                </button>
                {qty > 0 && !p.has_addons ? (
                    <Stepper qty={qty} step={step} onChange={q => onChange(p, q)} />
                ) : (
                    <button type="button" onClick={() => (p.has_addons ? onOpen(p) : onAdd(p))} disabled={agotado}
                        className="btn-outline h-10 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98]">
                        <Svg d={Icono.mas} /> Agregar
                    </button>
                )}
            </div>
        </article>
    );
}

/**
 * Toma de pedido en la mesa. El mesonero arma la ronda con el menú de su sucursal y la manda a
 * cocina: si la mesa no tenía cuenta se abre, y si la tenía se le suma. No cobra: la cuenta la
 * cobra la caja.
 */
export default function WaiterOrder({ table, warehouseId, sym = "Ref.", notify, onClose }) {
    const [menu, setMenu] = useState(() => menus.get(warehouseId) || null);
    const [cuentas, setCuentas] = useState(null);
    const [cuentaSel, setCuentaSel] = useState(null);      // id de la venta, o "new"
    const [ronda, setRonda] = useState([]);                // [{ product, qty, note }]
    const [notaCocina, setNotaCocina] = useState("");
    const [cat, setCat] = useState("todo");
    const [q, setQ] = useState("");
    const [panel, setPanel] = useState("ronda");           // ronda · mesa
    const [hoja, setHoja] = useState(false);               // panel abierto en tablet vertical / teléfono
    const [editNota, setEditNota] = useState(null);        // índice de la línea con la nota abierta
    const [enviando, setEnviando] = useState(false);
    const [salir, setSalir] = useState(false);
    const [ficha, setFicha] = useState(null);             // plato cuya ficha está abierta
    const [tocada, setTocada] = useState(false);          // la cuenta cambió (dividir, mover, pidió la cuenta)
    const buscador = useRef(null);

    useEffect(() => {
        api.warehouses.getProducts(warehouseId, { sellable_only: true, limit: 1000 })
            .then(r => {
                const lista = (r.data || []).filter(p => !p.is_variant_parent);
                menus.set(warehouseId, lista);
                setMenu(lista);
            })
            .catch(e => { notify(e.message || "No se pudo cargar el menú", "err"); setMenu(m => m || []); });
    }, [warehouseId, notify]);

    const cargarCuentas = useCallback(async () => {
        try {
            const r = await api.tables.accounts(table.id);
            const lista = r.data?.accounts || [];
            setCuentas(lista);
            setCuentaSel(sel => (sel && (sel === "new" || lista.some(c => c.id === sel)) ? sel : (lista[0]?.id ?? "new")));
        } catch (e) {
            notify(e.message || "No se pudo abrir la mesa", "err");
            setCuentas([]);
        }
    }, [table.id, notify]);
    useEffect(() => { cargarCuentas(); }, [cargarCuentas]);

    const categorias = useMemo(() => {
        const m = new Map();
        for (const p of menu || []) if (p.category_name) m.set(p.category_name, (m.get(p.category_name) || 0) + 1);
        return [...m.keys()].sort((a, b) => a.localeCompare(b, "es"));
    }, [menu]);

    const visibles = useMemo(() => {
        const t = q.trim().toLowerCase();
        return (menu || []).filter(p => (cat === "todo" || p.category_name === cat) && (!t || p.name.toLowerCase().includes(t)));
    }, [menu, cat, q]);

    // Un plato con nota es otra línea: "sin cebolla" y "normal" van separados a la cocina. Las
    // tarjetas del menú suman sobre la línea SIN nota del producto.
    // Las tarjetas suman sobre la línea "simple" del plato: sin nota y sin adicionales.
    const simple = (l) => !l.note && !l.options?.length;
    const qtyEnMenu = (p) => ronda.filter(l => l.product.id === p.id && simple(l)).reduce((s, l) => s + l.qty, 0);
    const setQtyMenu = (p, qty) => setRonda(r => {
        const i = r.findIndex(l => l.product.id === p.id && simple(l));
        if (qty <= 0) return i < 0 ? r : r.filter((_, k) => k !== i);
        if (i < 0) return [...r, { product: p, qty, note: "" }];
        return r.map((l, k) => (k === i ? { ...l, qty } : l));
    });
    const agregar = (p) => setQtyMenu(p, qtyEnMenu(p) + (isIntegerUnit(p.unit) ? 1 : (parseFloat(p.qty_step) || 1)));
    const setLinea = (i, patch) => setRonda(r => r.map((l, k) => (k === i ? { ...l, ...patch } : l)).filter(l => l.qty > 0));
    // Desde la ficha: sin nota ni adicionales suma a la línea normal del plato; si no, va en su
    // propia línea (o se junta con otra que lleve exactamente la misma nota y las mismas opciones).
    const agregarDesdeFicha = (p, qty, note, options = []) => {
        if (!note && !options.length) return setQtyMenu(p, qtyEnMenu(p) + qty);
        const firma = options.map(o => o.id).sort((a, b) => a - b).join(",");
        setRonda(r => {
            const i = r.findIndex(l => l.product.id === p.id
                && l.note.trim().toLowerCase() === note.toLowerCase()
                && (l.options || []).map(o => o.id).sort((a, b) => a - b).join(",") === firma);
            if (i < 0) return [...r, { product: p, qty, note, options }];
            return r.map((l, k) => (k === i ? { ...l, qty: l.qty + qty } : l));
        });
    };

    const unidades = ronda.reduce((s, l) => s + (isIntegerUnit(l.product.unit) ? l.qty : 1), 0);
    const totalRonda = ronda.reduce((s, l) => s + precioLinea(l) * l.qty, 0);
    const cuenta = cuentas?.find(c => c.id === cuentaSel) || null;
    const bloqueada = cuenta?.held_by_name;

    const enviar = async () => {
        if (!ronda.length || enviando) return;
        setEnviando(true);
        try {
            const r = await api.tables.sendRound(table.id, {
                sale_id: cuentaSel || undefined,
                note: notaCocina.trim() || undefined,
                items: ronda.map(l => ({ product_id: l.product.id, qty: l.qty, note: l.note.trim() || undefined, options: l.options?.map(o => o.id) })),
            });
            notify(`${table.name}: ronda ${r.data?.round_no || ""} enviada a cocina`);
            onClose(true);
        } catch (e) {
            notify(e.message || "No se pudo enviar la ronda", "err");
            // La mesa pudo cambiar (otra cuenta, la caja la tomó): se vuelve a leer sin perder la ronda.
            cargarCuentas();
        } finally {
            setEnviando(false);
        }
    };

    // Si se dividió, se movió o se marcó la cuenta, el mapa tiene que volver a leerse al salir.
    const volver = () => (ronda.length ? setSalir(true) : onClose(tocada));

    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            if (ficha) setFicha(null); else if (hoja) setHoja(false); else volver();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    });

    const lineasMesa = cuenta?.items || [];
    const rondasMesa = cuenta?.rounds || [];
    // Al dividir o juntar, las comandas siguen siendo lo que se mandó a cocina, que ya no es lo que
    // tiene la cuenta: entonces se muestra también lo que tiene ahora.
    const cuentaDistinta = useMemo(() => {
        const suma = (pares) => pares.reduce((m, [k, q]) => m.set(k, (m.get(k) || 0) + (parseFloat(q) || 0)), new Map());
        const enCuenta = suma(lineasMesa.filter(l => !l.is_addon).map(l => [l.name, l.quantity]));
        const enRondas = suma(rondasMesa.flatMap(r => (r.items || []).map(i => [i.name, i.quantity])));
        return enCuenta.size !== enRondas.size || [...enCuenta].some(([k, q]) => Math.abs((enRondas.get(k) || 0) - q) > 0.0005);
    }, [lineasMesa, rondasMesa]);

    // ── Panel: la ronda que se arma y lo que ya está en la mesa ──
    const panelRonda = (
        <div className="flex flex-col h-full min-h-0">
            {cuentas && cuentas.length > 0 && (
                <div className="shrink-0 px-4 pt-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {cuentas.map((c, i) => (
                        <button key={c.id} onClick={() => setCuentaSel(c.id)}
                            className={`h-9 px-3 rounded-lg text-[12px] font-semibold whitespace-nowrap border ${cuentaSel === c.id ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300" : "border-border dark:border-white/10 text-content-subtle"}`}>
                            {cuentas.length > 1 ? `Cuenta ${i + 1}` : "Cuenta"} · <span className="tabular-nums">{fmtMoney(c.total, sym)}</span>
                        </button>
                    ))}
                    <button onClick={() => setCuentaSel("new")}
                        className={`h-9 px-3 rounded-lg text-[12px] font-semibold whitespace-nowrap border border-dashed ${cuentaSel === "new" ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300" : "border-border dark:border-white/15 text-content-subtle"}`}>
                        + Cuenta aparte
                    </button>
                </div>
            )}

            <div className="shrink-0 px-4 pt-3">
                <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-2 dark:bg-white/[0.05]">
                    {[["ronda", `Nueva ronda${ronda.length ? ` · ${fmtQty(unidades)}` : ""}`], ["mesa", `En la mesa${rondasMesa.length ? ` · ${rondasMesa.length}` : ""}`]].map(([k, label]) => (
                        <button key={k} onClick={() => setPanel(k)}
                            className={`h-9 rounded-lg text-[13px] font-semibold ${panel === k ? "bg-white dark:bg-white/10 text-content dark:text-white shadow-sm" : "text-content-subtle"}`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {bloqueada && (
                <div className="shrink-0 mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-500/10 text-[12px] text-amber-800 dark:text-amber-300" style={{ boxShadow: "inset 3px 0 0 #f59e0b" }}>
                    {bloqueada} tiene esta cuenta abierta en la caja. Arma la ronda y envíala cuando la pause.
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                {panel === "ronda" ? (
                    ronda.length === 0 ? (
                        <div className="py-10 text-center">
                            <div className="w-12 h-12 mx-auto rounded-xl bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle"><Svg d={Icono.plato} className="w-6 h-6" /></div>
                            <div className="text-[14px] font-semibold text-content dark:text-white mt-3">La ronda está vacía</div>
                            <div className="text-[13px] text-content-subtle mt-1">Toca los platos del menú para sumarlos.</div>
                        </div>
                    ) : (
                        <ul className="divide-y divide-border/60 dark:divide-white/[0.06]">
                            {ronda.map((l, i) => (
                                <li key={`${l.product.id}-${i}`} className="py-3">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[14px] font-semibold text-content dark:text-white leading-snug">{l.product.name}</div>
                                            {l.options?.length > 0 && (
                                                <div className="text-[12px] text-content dark:text-white/80 leading-snug">{textoOpciones(l.options)}</div>
                                            )}
                                            <div className="text-[12px] text-content-subtle tabular-nums">{fmtMoney(precioLinea(l), sym)} c/u · {fmtMoney(precioLinea(l) * l.qty, sym)}</div>
                                        </div>
                                        <div className="w-[118px] shrink-0">
                                            <Stepper small qty={l.qty} step={isIntegerUnit(l.product.unit) ? 1 : (parseFloat(l.product.qty_step) || 1)} onChange={qty => setLinea(i, { qty })} />
                                        </div>
                                    </div>
                                    {editNota === i ? (
                                        <input autoFocus autoComplete="off" maxLength={200} value={l.note}
                                            placeholder="Sin hielo, bien caliente…"
                                            onChange={e => setLinea(i, { note: e.target.value })}
                                            onBlur={() => setEditNota(null)}
                                            onKeyDown={e => { if (e.key === "Enter") setEditNota(null); }}
                                            className="mt-2 w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                                    ) : (
                                        <button onClick={() => setEditNota(i)}
                                            className={`mt-1.5 inline-flex items-center gap-1.5 text-[13px] min-h-[32px] ${l.note ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                                            <Svg d={Icono.nota} className="w-3.5 h-3.5" />
                                            {l.note || "Agregar nota"}
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )
                ) : (
                    !cuenta ? (
                        <div className="py-10 text-center text-[13px] text-content-subtle">
                            {cuentaSel === "new" ? "La ronda abre una cuenta aparte en esta mesa." : "La mesa todavía no tiene cuenta. La abre la primera ronda."}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-baseline justify-between">
                                <span className="text-[12px] text-content-subtle">Abierta {fmtTime(cuenta.created_at)}{cuenta.waiter_name ? ` · ${cuenta.waiter_name}` : ""}</span>
                                <span className="text-[20px] font-bold tracking-tight text-content dark:text-white tabular-nums">{fmtMoney(cuenta.total, sym)}</span>
                            </div>
                            <CuentaAcciones table={table} cuenta={cuenta} cuentas={cuentas} warehouseId={warehouseId} sym={sym} notify={notify}
                                onChanged={(id) => { setTocada(true); if (id) setCuentaSel(id); cargarCuentas(); }} />
                            {(rondasMesa.length === 0 || cuentaDistinta) && lineasMesa.length > 0 && (
                                <section>
                                    {rondasMesa.length > 0 && <h4 className="text-[13px] font-semibold text-content dark:text-white mb-1">Lo que tiene la cuenta ahora</h4>}
                                    <ul className="space-y-0.5">
                                        {/* Con los adicionales bajo su plato; el contorno incluido (a 0) ya va en la nota. */}
                                        {lineasMesa.filter(it => !(it.is_addon && !(parseFloat(it.price) > 0))).map(it => (it.is_addon
                                            ? <li key={it.id} className="text-[12px] text-content-subtle pl-4">+ {it.name}</li>
                                            : <li key={it.id} className="text-[13px] text-content dark:text-white"><span className="font-semibold tabular-nums">{fmtQty(it.quantity)}</span> {it.name}{it.note ? <span className="block text-[12px] text-content-subtle pl-4">{it.note}</span> : null}</li>
                                        ))}
                                    </ul>
                                    {rondasMesa.length > 0 && <p className="mt-2 text-[12px] text-content-subtle">La cuenta se dividió o se juntó. Abajo, lo que se mandó a cocina.</p>}
                                </section>
                            )}
                            {rondasMesa.map(r => {
                                const e = ESTADO_RONDA[r.status] || ESTADO_RONDA.nueva;
                                return (
                                    <section key={r.id} className="rounded-xl border border-border/60 dark:border-white/[0.06] p-3">
                                        <header className="flex items-center justify-between gap-2">
                                            <span className="text-[13px] font-semibold text-content dark:text-white">Ronda {r.round_no} · {fmtTime(r.created_at)}</span>
                                            <span className={`inline-flex items-center gap-1 text-[12px] font-medium ${e.cls}`}>
                                                {e.check && <Svg d={Icono.check} className="w-3.5 h-3.5" />}{e.txt}
                                            </span>
                                        </header>
                                        <ul className="mt-1.5 space-y-0.5">
                                            {(r.items || []).map((it, k) => (
                                                <li key={k} className="text-[13px] text-content dark:text-white">
                                                    <span className="font-semibold tabular-nums">{fmtQty(it.quantity)}</span> {it.name}
                                                    {it.modifiers && <span className="block text-[12px] text-content-subtle pl-4">{it.modifiers}</span>}
                                                    {it.note && <span className="block text-[12px] text-amber-700 dark:text-amber-400 pl-4">{it.note}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                );
                            })}
                        </div>
                    )
                )}
            </div>

            {panel === "ronda" && ronda.length > 0 && (
                <div className="shrink-0 border-t border-border/60 dark:border-white/[0.06] p-4 space-y-3 bg-white dark:bg-surface-dark-2">
                    <input autoComplete="off" maxLength={300} value={notaCocina} onChange={e => setNotaCocina(e.target.value)}
                        placeholder="Nota para la cocina (opcional)"
                        className="w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white placeholder:text-content-subtle/60 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                    <button onClick={enviar} disabled={enviando}
                        className="btn-accent w-full h-12 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99]">
                        {enviando && <Spinner />}
                        Enviar a cocina · <span className="tabular-nums">{fmtMoney(totalRonda, sym)}</span>
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="fixed inset-0 z-[150] bg-surface-2 dark:bg-surface-dark flex flex-col modal-in">
            {/* Cabecera: volver, la mesa y el buscador. */}
            <header className="shrink-0 h-16 px-3 sm:px-4 flex items-center gap-3 bg-white dark:bg-surface-dark-2 border-b border-border/40 dark:border-white/[0.06]">
                <button onClick={volver} aria-label="Volver al mapa" title="Volver al mapa"
                    className="w-11 h-11 shrink-0 rounded-xl btn-outline flex items-center justify-center">
                    <Svg d={Icono.atras} />
                </button>
                <div className="min-w-0">
                    <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-content dark:text-white leading-tight truncate">{table.name}</h2>
                    <p className="text-[12px] text-content-subtle truncate tabular-nums">
                        {cuenta ? `Cuenta ${fmtMoney(cuenta.total, sym)} · ${rondasMesa.length} ${rondasMesa.length === 1 ? "ronda" : "rondas"}` : `${table.seats} ${table.seats === 1 ? "puesto" : "puestos"} · mesa libre`}
                    </p>
                </div>
                <label className="ml-auto relative w-full max-w-[320px] hidden sm:block">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle"><Svg d={Icono.lupa} /></span>
                    <input ref={buscador} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" type="search"
                        placeholder="Buscar en el menú"
                        className="w-full h-11 pl-10 pr-3 rounded-xl border border-border dark:border-white/10 bg-surface-2 dark:bg-white/[0.04] text-[14px] text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                </label>
            </header>

            <div className="flex-1 min-h-0 flex">
                {/* Menú */}
                <main className="flex-1 min-w-0 flex flex-col">
                    <div className="shrink-0 px-3 sm:px-4 pt-3 space-y-3">
                        <label className="relative block sm:hidden">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle"><Svg d={Icono.lupa} /></span>
                            <input value={q} onChange={e => setQ(e.target.value)} autoComplete="off" type="search" placeholder="Buscar en el menú"
                                className="w-full h-11 pl-10 pr-3 rounded-xl border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[14px] text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                        </label>
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                            {["todo", ...categorias].map(c => (
                                <button key={c} onClick={() => setCat(c)}
                                    className={`h-10 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 border transition-colors ${cat === c
                                        ? "bg-content text-white border-content dark:bg-white dark:text-surface-dark dark:border-white"
                                        : "bg-white dark:bg-white/[0.04] text-content-subtle border-border dark:border-white/10"}`}>
                                    {c === "todo" ? "Todo el menú" : c.charAt(0) + c.slice(1).toLowerCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 pt-2 pb-28 lg:pb-6">
                        {!menu ? (
                            <div className="py-16 flex justify-center"><Spinner /></div>
                        ) : visibles.length === 0 ? (
                            <div className="py-16 text-center text-[13px] text-content-subtle">Nada en el menú con ese nombre.</div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                                {visibles.map(p => (
                                    <Plato key={p.id} p={p} sym={sym} qty={qtyEnMenu(p)} total={ronda.filter(l => l.product.id === p.id).reduce((s, l) => s + l.qty, 0)} onAdd={agregar} onChange={setQtyMenu} onOpen={setFicha} />
                                ))}
                            </div>
                        )}
                    </div>
                </main>

                {/* Ronda: columna fija desde lg. */}
                <aside className="hidden lg:flex w-[380px] shrink-0 flex-col bg-white dark:bg-surface-dark-2 border-l border-border/40 dark:border-white/[0.06]">
                    {panelRonda}
                </aside>
            </div>

            {/* Tablet vertical y teléfono: la ronda se abre desde la barra de abajo. */}
            <div className="lg:hidden fixed inset-x-0 bottom-0 p-3 bg-white/95 dark:bg-surface-dark-2/95 backdrop-blur border-t border-border/40 dark:border-white/[0.06]">
                <button onClick={() => setHoja(true)}
                    className={`w-full h-14 rounded-xl px-4 flex items-center justify-between text-[15px] font-semibold ${ronda.length ? "btn-accent" : "btn-outline"}`}>
                    <span>{ronda.length ? `Ver ronda · ${fmtQty(unidades)} ${unidades === 1 ? "plato" : "platos"}` : "Ver la mesa"}</span>
                    {ronda.length > 0 && <span className="tabular-nums">{fmtMoney(totalRonda, sym)}</span>}
                </button>
            </div>
            {hoja && (
                <div className="lg:hidden fixed inset-0 z-[160] flex flex-col justify-end bg-black/40" onClick={() => setHoja(false)}>
                    <div onClick={e => e.stopPropagation()} className="h-[88%] bg-white dark:bg-surface-dark-2 rounded-t-2xl flex flex-col overflow-hidden">
                        <div className="shrink-0 flex items-center justify-between px-4 pt-3">
                            <span className="text-[15px] font-semibold text-content dark:text-white">{table.name}</span>
                            <button onClick={() => setHoja(false)} aria-label="Cerrar" className="w-10 h-10 rounded-lg btn-outline flex items-center justify-center"><Svg d={Icono.x} /></button>
                        </div>
                        <div className="flex-1 min-h-0">{panelRonda}</div>
                    </div>
                </div>
            )}

            {ficha && (
                <FichaPlato p={ficha} warehouseId={warehouseId} sym={sym} onAdd={agregarDesdeFicha} onClose={() => setFicha(null)} />
            )}

            <ConfirmModal isOpen={salir} title="¿Descartar la ronda?"
                message={`Tienes ${fmtQty(unidades)} ${unidades === 1 ? "plato" : "platos"} sin enviar a cocina.`}
                confirmText="Descartar" cancelText="Seguir pidiendo"
                onConfirm={() => { setSalir(false); onClose(tocada); }} onCancel={() => setSalir(false)} />
        </div>
    );
}
