import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import Segmented from "../ui/Segmented";
import Check from "../ui/Check";
import { Spinner } from "../ui/Spinner";
import { fmtMoney, toNameCase } from "../../helpers";
import { useDebounce } from "../../hooks/useDebounce";
import { marcarPorNombre } from "../mesas/AgotadosModal";
import { isIntegerUnit } from "../../helpers/unitFormatter";

// Adicionales de los platos (restaurante): grupos de opciones que se asignan a los platos.
//   "Término de la carne" — elige 1, obligatorio, sin costo
//   "Extras"              — opcional, hasta 3, con precio
// Una opción con precio sale en la factura como línea aparte ("+ Queso extra"): el servidor
// la crea como producto oculto de los menús (ver services/addons.js). Lo que gasta una opción
// (150 g de papa) es la receta de ese producto; sin precio, va en la factura a 0.

const LABEL   = "text-[12px] font-medium text-content-subtle";
const INPUT   = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";
const AGREGAR = "w-full h-9 rounded-lg border border-dashed border-border dark:border-white/15 text-[12px] font-medium text-content-subtle hover:text-content hover:border-content-subtle/60 dark:hover:text-white dark:hover:border-white/30 transition-colors flex items-center justify-center gap-1.5";
const QUITAR  = "w-10 h-10 shrink-0 rounded-lg border border-border dark:border-white/10 text-content-subtle hover:text-red-600 hover:border-red-500/40 dark:hover:text-red-400 transition-colors flex items-center justify-center";

const Prefijo = ({ children }) => (
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{children}</span>
);

function Field({ label, hint, children }) {
    return (
        <div>
            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className={LABEL}>{label}</span>
                {hint && <span className="text-[11px] text-content-subtle/70">{hint}</span>}
            </p>
            {children}
        </div>
    );
}

// Lo que gasta una opción se escribe como se piensa en la cocina: 150 g de papa, 30 ml de salsa,
// 3 arepitas. Se guarda en la unidad del insumo (0,150 KG); lo contable va entero.
const medida = (unit) => {
    const u = String(unit || "").toUpperCase();
    if (u === "KG" || u === "KILOGRAMO") return { f: 1000, suf: "g", entero: true };
    if (u === "L" || u === "LITRO") return { f: 1000, suf: "ml", entero: true };
    if (isIntegerUnit(u)) return { f: 1, suf: "und", entero: true };
    return { f: 1, suf: u.toLowerCase(), entero: false };
};
const aTexto = (c) => { const m = medida(c.unit); return String(Math.round(c.quantity * m.f * 1000) / 1000).replace(".", ","); };
const aCantidad = (c) => { const m = medida(c.unit); return (parseFloat(String(c.texto).replace(",", ".")) || 0) / m.f; };
const resumen = (consume) => consume.map(c => `${c.texto || "?"} ${medida(c.unit).suf} ${toNameCase(c.name)}`).join(" · ");

// Insumos que gasta una opción. Solo productos con existencia propia: un combo o un servicio
// no se descuenta, y el servidor los rechaza.
function Consumo({ value, onChange, onClose }) {
    const [q, setQ] = useState("");
    const dq = useDebounce(q, 300);
    const [resultados, setResultados] = useState(null);   // null = sin buscar todavía
    useEffect(() => {
        if (!dq.trim()) { setResultados(null); return; }
        let vivo = true;
        api.products.getAll({ search: dq.trim(), limit: 20 })
            .then(r => { if (vivo) setResultados((r.data || r.products || []).filter(p => !p.is_variant_parent)); })
            .catch(() => { if (vivo) setResultados([]); });
        return () => { vivo = false; };
    }, [dq]);

    // Lo que aparece pero no se puede gastar se muestra igual, con el motivo: si no, "no busca".
    const motivo = (p) => (p.is_addon ? "Es un adicional, no un insumo"
        : p.is_combo ? "Combo: no lleva existencia propia"
        : p.is_service ? "Servicio: no lleva existencia"
        : null);

    const poner = (i, texto) => onChange(value.map((c, k) => (k === i ? { ...c, texto } : c)));
    const agregar = (p) => {
        if (!value.some(c => c.product_id === p.id)) onChange([...value, { product_id: p.id, name: p.name, unit: p.unit, texto: "" }]);
        setQ("");
    };

    return (
        <div className="mt-2 ml-1 pl-3 border-l-2 border-border dark:border-white/10 space-y-2">
            <p className="text-[12px] text-content-subtle">Lo que gasta cada plato. Se descuenta de la sucursal al vender y se agota sola cuando no alcanza.</p>
            {value.map((c, i) => {
                const m = medida(c.unit);
                return (
                    <div key={c.product_id} className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-[13px] text-content dark:text-white truncate">{toNameCase(c.name)}</span>
                        <div className="relative w-28 shrink-0">
                            <input className={`${INPUT} pr-11 text-right tabular-nums`} inputMode={m.entero ? "numeric" : "decimal"} value={c.texto} autoComplete="off"
                                placeholder="0" onChange={e => poner(i, m.entero ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value.replace(/[^\d.,]/g, ""))} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{m.suf}</span>
                        </div>
                        <button type="button" className={QUITAR} aria-label={`Quitar ${c.name}`} title={`Quitar ${c.name}`}
                            onClick={() => onChange(value.filter((_, k) => k !== i))}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                );
            })}
            <input className={INPUT} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" placeholder="Buscar insumo: papa, plátano, queso…" />
            {resultados && dq === q && (resultados.length === 0 ? (
                <p className="text-[12px] text-content-subtle">
                    No hay ningún producto con «{q.trim()}». Créalo en Catálogo → Productos como producto normal (no servicio), con su unidad (KG para el queso) y su existencia; puedes marcarlo como insumo para que no se venda suelto.
                </p>
            ) : (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border/70 dark:border-white/10 divide-y divide-border/60 dark:divide-white/[0.06]">
                    {resultados.map(p => {
                        const no = motivo(p);
                        return (
                            <button key={p.id} type="button" onClick={() => agregar(p)} disabled={!!no}
                                className="w-full flex items-center gap-3 px-3 h-11 text-left hover:bg-surface-2 dark:hover:bg-white/[0.04] disabled:hover:bg-transparent disabled:cursor-not-allowed">
                                <span className={`flex-1 min-w-0 text-[13px] truncate ${no ? "text-content-subtle" : "text-content dark:text-white"}`}>{toNameCase(p.name)}</span>
                                <span className="text-[12px] text-content-subtle shrink-0">{no || (medida(p.unit).suf === "und" ? "por unidad" : `en ${medida(p.unit).suf}`)}</span>
                            </button>
                        );
                    })}
                </div>
            ))}
            <button type="button" onClick={onClose} className="btn-outline h-9 px-3 rounded-lg text-[12px] font-medium">Listo</button>
        </div>
    );
}

const vacio = () => ({ name: "", modo: "uno", obligatorio: true, max: "", options: [{ name: "", price: "", consume: [] }], products: [] });

// Del grupo guardado al formulario: "uno" es max 1; "varios", cualquier otro tope (o ninguno).
const aFormulario = (g) => ({
    id: g.id,
    name: g.name,
    modo: g.max_select === 1 ? "uno" : "varios",
    obligatorio: g.min_select > 0,
    max: g.max_select && g.max_select !== 1 ? String(g.max_select) : "",
    options: g.options.map(o => ({
        id: o.id, name: o.name, price: o.price ? Number(o.price).toFixed(2) : "",
        consume: (o.consume || []).map(c => ({ ...c, texto: aTexto(c) })),
        own_stock: !!o.own_stock,
    })),
    products: g.products,
});

function GrupoModal({ data, onClose, onSaved, notify, sym }) {
    const [form, setForm] = useState(() => (data?.id ? aFormulario(data) : vacio()));
    const [q, setQ] = useState("");
    const dq = useDebounce(q, 300);
    const [resultados, setResultados] = useState([]);
    const [borrar, setBorrar] = useState(false);
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setOpcion = (i, patch) => setForm(f => ({ ...f, options: f.options.map((o, k) => (k === i ? { ...o, ...patch } : o)) }));

    useEffect(() => {
        if (!dq.trim()) { setResultados([]); return; }
        let vivo = true;
        api.products.getAll({ search: dq.trim(), limit: 20 })
            .then(r => { if (vivo) setResultados((r.data || r.products || []).filter(p => !p.is_addon && p.sellable !== false && !p.is_variant_parent)); })
            .catch(() => {});
        return () => { vivo = false; };
    }, [dq]);

    const elegido = (id) => form.products.some(p => p.id === id);
    const alternar = (p) => set("products", elegido(p.id) ? form.products.filter(x => x.id !== p.id) : [...form.products, { id: p.id, name: p.name }]);

    const [receta, setReceta] = useState(null);   // índice de la opción cuyo consumo se edita

    const guardar = async () => {
        const conNombre = form.options.filter(o => o.name.trim());
        const sinCantidad = conNombre.find(o => (o.consume || []).some(c => !(aCantidad(c) > 0)));
        if (sinCantidad) return notify(`${sinCantidad.name.trim()}: falta la cantidad de un insumo`, "err");
        const options = conNombre.map(o => ({
            id: o.id, name: o.name.trim(), price: parseFloat(String(o.price).replace(",", ".")) || 0,
            // Lo de existencia propia no manda receta: se sigue descontando solo.
            ...(o.own_stock ? {} : { consume: (o.consume || []).map(c => ({ product_id: c.product_id, quantity: aCantidad(c) })) }),
        }));
        const max = form.modo === "uno" ? 1 : (parseInt(form.max, 10) || null);
        const body = {
            name: form.name,
            min_select: form.obligatorio ? 1 : 0,
            max_select: max,
            options,
            product_ids: form.products.map(p => p.id),
        };
        try {
            if (form.id) await api.addons.update(form.id, body);
            else await api.addons.create(body);
            notify(form.id ? "Grupo guardado" : "Grupo creado");
            onSaved();
        } catch (e) {
            notify(e.message || "No se pudo guardar el grupo", "err");
        }
    };

    const eliminar = async () => {
        try {
            await api.addons.remove(form.id);
            notify("Grupo eliminado");
            onSaved();
        } catch (e) {
            notify(e.message || "No se pudo eliminar", "err");
            setBorrar(false);
        }
    };

    return (
        <Modal open onClose={onClose} title={form.id ? "Editar adicionales" : "Nuevo grupo de adicionales"} width={640}>
            <div className="space-y-5">
                <Field label="Nombre del grupo">
                    <input className={INPUT} data-autofocus value={form.name} maxLength={60} autoComplete="off"
                        placeholder="Término de la carne, Contorno, Extras…" onChange={e => set("name", e.target.value)} />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Cómo se elige">
                        <Segmented value={form.modo} onChange={v => set("modo", v)}
                            options={[{ key: "uno", label: "Una opción" }, { key: "varios", label: "Varias" }]} />
                    </Field>
                    {form.modo === "varios" ? (
                        <Field label="Máximo" hint="Vacío = sin límite">
                            <input className={INPUT} type="number" inputMode="numeric" min={1} max={20} value={form.max}
                                placeholder="Sin límite" onChange={e => set("max", e.target.value.replace(/\D/g, "").slice(0, 2))} />
                        </Field>
                    ) : <div className="hidden sm:block" />}
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                    <Check checked={form.obligatorio} onChange={v => set("obligatorio", v)} />
                    <span>
                        <span className="block text-[13px] font-medium text-content dark:text-white">Obligatorio</span>
                        <span className="block text-[12px] text-content-subtle">No se puede pedir el plato sin elegir aquí (por ejemplo, el término).</span>
                    </span>
                </label>

                <Field label="Opciones" hint="Con precio, sale en la factura como línea aparte">
                    <div className="space-y-3">
                        {form.options.map((o, i) => (
                          <div key={o.id || `n${i}`}>
                            <div className="flex items-center gap-2">
                                <input className={`${INPUT} flex-1 min-w-0`} value={o.name} maxLength={60} autoComplete="off"
                                    placeholder={i === 0 ? "Término medio" : "Nombre de la opción"} onChange={e => setOpcion(i, { name: e.target.value })} />
                                <div className="relative w-32 shrink-0">
                                    <Prefijo>{sym}</Prefijo>
                                    <input className={`${INPUT} pl-11 text-right tabular-nums`} inputMode="decimal" value={o.price} autoComplete="off"
                                        placeholder="Sin costo" onChange={e => setOpcion(i, { price: e.target.value.replace(/[^\d.,]/g, "") })} />
                                </div>
                                <button type="button" className={QUITAR} aria-label="Quitar opción" title="Quitar opción"
                                    onClick={() => { setReceta(null); set("options", form.options.filter((_, k) => k !== i)); }}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            {o.own_stock ? (
                                <p className="mt-1 ml-1 text-[12px] text-content-subtle">Se descuenta de su propia existencia.</p>
                            ) : receta === i ? (
                                <Consumo value={o.consume || []} onChange={v => setOpcion(i, { consume: v })} onClose={() => setReceta(null)} />
                            ) : (
                                <button type="button" onClick={() => setReceta(i)}
                                    className="mt-1 ml-1 inline-flex items-center gap-1.5 min-h-8 text-left text-[12px] text-content-subtle hover:text-content dark:hover:text-white">
                                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                    {o.consume?.length
                                        ? <span>Gasta <span className="text-content dark:text-white font-medium">{resumen(o.consume)}</span> · cambiar</span>
                                        : "No descuenta inventario · indicar qué gasta"}
                                </button>
                            )}
                          </div>
                        ))}
                        <button type="button" className={AGREGAR} onClick={() => set("options", [...form.options, { name: "", price: "", consume: [] }])}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 5v14M5 12h14" /></svg>
                            Agregar opción
                        </button>
                    </div>
                </Field>

                <Field label="Platos que lo llevan" hint={form.products.length ? `${form.products.length} ${form.products.length === 1 ? "plato" : "platos"}` : null}>
                    {form.products.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {form.products.map(p => (
                                <span key={p.id} className="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full bg-surface-2 dark:bg-white/[0.06] text-[12px] font-medium text-content dark:text-white">
                                    {toNameCase(p.name)}
                                    <button type="button" onClick={() => alternar(p)} aria-label={`Quitar ${p.name}`}
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-content-subtle hover:text-red-600">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <input className={INPUT} value={q} onChange={e => setQ(e.target.value)} autoComplete="off" placeholder="Buscar plato para agregarlo…" />
                    {resultados.length > 0 && (
                        <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-border/70 dark:border-white/10 divide-y divide-border/60 dark:divide-white/[0.06]">
                            {resultados.map(p => (
                                <label key={p.id} className="flex items-center gap-3 px-3 h-11 cursor-pointer hover:bg-surface-2 dark:hover:bg-white/[0.04]">
                                    <Check checked={elegido(p.id)} onChange={() => alternar(p)} />
                                    <span className="flex-1 min-w-0 text-[13px] text-content dark:text-white truncate">{toNameCase(p.name)}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </Field>

                <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                    {form.id && (
                        <button type="button" onClick={() => setBorrar(true)} className="h-12 sm:h-10 px-3 rounded-lg text-[13px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 sm:mr-auto">
                            Eliminar grupo
                        </button>
                    )}
                    <button type="button" onClick={onClose} className={`btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium ${form.id ? "" : "sm:ml-auto"}`}>Cancelar</button>
                    <Button className="h-12 sm:h-10 px-5" onClick={guardar}>{form.id ? "Guardar cambios" : "Crear grupo"}</Button>
                </div>
            </div>
            <ConfirmModal isOpen={borrar} title={`Eliminar «${form.name}»`}
                message="Los platos dejan de ofrecer estas opciones. Las ventas que ya las usaron no cambian."
                confirmText="Eliminar" onConfirm={eliminar} onCancel={() => setBorrar(false)} />
        </Modal>
    );
}

export default function AddonsTab({ notify, can, triggerNew }) {
    const { baseCurrency } = useApp();
    const sym = baseCurrency?.symbol || "Ref.";
    const [grupos, setGrupos] = useState(null);
    const [editando, setEditando] = useState(null);   // null · {} nuevo · grupo
    const primera = useRef(true);

    const cargar = useCallback(async () => {
        try {
            const r = await api.addons.list();
            setGrupos(r.data || []);
        } catch (e) {
            notify(e.message || "No se pudieron cargar los adicionales", "err");
            setGrupos([]);
        }
    }, [notify]);
    useEffect(() => { cargar(); }, [cargar]);

    // El botón "+ Nuevo grupo" vive en la barra de la página (CatalogPage) y avisa por aquí.
    useEffect(() => {
        if (primera.current) { primera.current = false; return; }
        if (triggerNew) setEditando({});
    }, [triggerNew]);

    const puedeEditar = can("products.edit");

    // Agotado a mano: se cambia en pantalla al instante y se revierte si el servidor no lo toma.
    const alternarAgotado = async (o) => {
        const valor = !o.sold_out;
        // El servidor la agota en todos los grupos donde se llama igual; aquí también.
        const poner = (v) => setGrupos(gs => marcarPorNombre(gs, o.name, v));
        poner(valor);
        try {
            await api.addons.setSoldOut(o.id, valor);
            notify(valor ? `${o.name}: agotado` : `${o.name}: disponible otra vez`);
        } catch (e) {
            poner(!valor);
            notify(e.message || "No se pudo cambiar", "err");
        }
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto py-3">
            {!grupos ? (
                <div className="py-16 flex justify-center"><Spinner /></div>
            ) : grupos.length === 0 ? (
                <div className="py-16 text-center px-6 flex flex-col items-center">
                    <div className="w-12 h-12 rounded-xl bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v12m6-6H6M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" /></svg>
                    </div>
                    <div className="text-[15px] font-semibold text-content dark:text-white mt-3">Todavía no hay adicionales</div>
                    <div className="text-[13px] text-content-subtle mt-1 max-w-md">
                        Crea grupos como «Término de la carne» o «Extras» y asígnalos a los platos. El mesonero, la caja y el catálogo los ofrecen al pedir.
                    </div>
                    {puedeEditar && <Button className="mt-4" onClick={() => setEditando({})}>+ Nuevo grupo</Button>}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {grupos.map(g => (
                        <article key={g.id} className="bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none p-4 flex flex-col gap-3">
                            <header className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="text-[15px] font-semibold text-content dark:text-white truncate">{g.name}</h3>
                                    <div className="text-[12px] text-content-subtle">{g.rule}</div>
                                </div>
                                {puedeEditar && (
                                    <button onClick={() => setEditando(g)} className="btn-outline h-9 px-3 rounded-lg text-[12px] font-medium shrink-0">Editar</button>
                                )}
                            </header>
                            <div className="flex flex-wrap gap-1.5">
                                {/* Tocar una opción la marca agotada (o la vuelve a ofrecer). */}
                                {g.options.map(o => (
                                    <button key={o.id} type="button" disabled={!puedeEditar} onClick={() => alternarAgotado(o)}
                                        title={o.sold_out ? "Agotada: toca para volver a ofrecerla" : "Toca para marcarla agotada"}
                                        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] border transition-colors disabled:cursor-default ${o.sold_out
                                            ? "border-red-500/30 bg-red-500/[0.06] text-content-subtle"
                                            : "border-transparent bg-surface-2 dark:bg-white/[0.06] text-content dark:text-white"}`}>
                                        <span className={o.sold_out ? "line-through" : ""}>{o.name}</span>
                                        {o.sold_out
                                            ? <span className="text-red-600 dark:text-red-400 font-medium">Agotado</span>
                                            : o.price > 0 && <span className="text-content-subtle tabular-nums">+ {fmtMoney(o.price, sym)}</span>}
                                    </button>
                                ))}
                            </div>
                            {puedeEditar && <p className="text-[11px] text-content-subtle -mt-1">Toca una opción para marcarla agotada.</p>}
                            <div className="text-[12px] text-content-subtle truncate border-t border-border/60 dark:border-white/[0.06] pt-2.5">
                                {g.products.length === 0
                                    ? "Sin platos asignados todavía"
                                    : `En ${g.products.length} ${g.products.length === 1 ? "plato" : "platos"}: ${g.products.map(p => toNameCase(p.name)).join(", ")}`}
                            </div>
                        </article>
                    ))}
                </div>
            )}

            {editando && (
                <GrupoModal data={editando} sym={sym} notify={notify}
                    onClose={() => setEditando(null)}
                    onSaved={() => { setEditando(null); cargar(); }} />
            )}
        </div>
    );
}
