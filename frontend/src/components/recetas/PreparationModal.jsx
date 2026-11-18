import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "../../hooks/useDebounce";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import CustomSelect from "../ui/CustomSelect";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase } from "../../helpers";
import { medidaTanda, num, UNIDADES_PREP, fmtRinde } from "./shared";
import IngredientSearch from "./IngredientSearch";
import IngredientLines, { aLinea, calcular } from "./IngredientLines";

// Ficha de una preparación: lo que lleva UNA tanda (la olla) y cuánto rinde.

export default function PreparationModal({ productId, warehouseId, onClose, onSaved, onProduce, onOpenExisting }) {
    const { notify, baseCurrency, can } = useApp();
    const canEdit = can("products.edit") || can("production.manage");
    const money = (n) => fmtBase(n, baseCurrency);
    const open = productId != null;
    const nueva = productId === "new";

    const [loading, setLoading] = useState(false);
    const [prep, setPrep] = useState(null);
    const [name, setName] = useState("");
    const [unit, setUnit] = useState("UNIDAD");
    const [rinde, setRinde] = useState("");
    const [lines, setLines] = useState([]);
    const [instructions, setInstructions] = useState("");
    const [minutos, setMinutos] = useState("");
    const [removing, setRemoving] = useState(false);
    const [base, setBase] = useState(null);
    const [elegido, setElegido] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPrep(null); setName(""); setUnit("UNIDAD"); setRinde(""); setLines([]); setInstructions(""); setMinutos("");
        setBase(null); setElegido(false);
        if (nueva) return;
        let vivo = true;
        setLoading(true);
        api.production.preparation(productId, warehouseId ? { warehouse_id: warehouseId } : {})
            .then(r => {
                if (!vivo) return;
                const d = r.data;
                setPrep(d);
                setName(d.name || "");
                setUnit(d.unit);
                setRinde(String(d.batch_yield).replace(".", ","));
                setLines((d.lines || []).map(l => aLinea(l, medidaTanda)));
                setInstructions(d.instructions || "");
                setMinutos(d.prep_minutes != null ? String(d.prep_minutes) : "");
            })
            .catch(e => { if (vivo) { notify(e?.message || "No se pudo abrir la preparación", "err"); onClose?.(); } })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [productId]);

    const calc = useMemo(() => lines.map(l => calcular(l, medidaTanda)), [lines]);
    const costoTanda = calc.reduce((a, c) => a + c.costo, 0);
    const rindeN = num(rinde);
    const porUnidad = rindeN > 0 && lines.length ? costoTanda / rindeN : null;
    const yaEsta = useMemo(() => new Set(lines.map(l => l.product_id)), [lines]);
    const unidad = UNIDADES_PREP.find(u => u.key === unit) || UNIDADES_PREP[0];
    const entera = unit === "PORCION" || unit === "UNIDAD";

    const handleUnitChange = (nextUnit) => {
        setUnit(nextUnit);
        if ((nextUnit === "PORCION" || nextUnit === "UNIDAD") && rinde) {
            const n = Math.round(num(rinde));
            setRinde(n > 0 ? String(n) : "");
        }
    };

    const agregar = (p) => setLines(ls => (ls.some(l => l.product_id === p.id) ? ls : [...ls, {
        product_id: p.id, name: p.name, unit: p.unit, sellable: p.sellable, unit_cost: p.cost, stock: p.stock, neto: "", merma: "",
    }]));

    const save = async () => {
        if (nueva && !elegido) return notify("Busca el producto o créalo como preparación nueva", "err");
        if (name.trim().length < 2) return notify("Escribe el nombre de la preparación", "err");
        if (!(rindeN > 0)) return notify("Escribe cuánto rinde una tanda", "err");
        if (!lines.length) return notify("Agrega al menos un ingrediente", "err");
        const vacia = lines.find((l, i) => !(calc[i].neto > 0));
        if (vacia) return notify(`Escribe cuánto lleva de "${toNameCase(vacia.name)}"`, "err");
        const body = {
            warehouse_id: warehouseId || undefined,
            name: name.trim(),
            unit,
            batch_yield: rindeN,
            lines: lines.map((l, i) => ({ product_id: l.product_id, net_quantity: calc[i].neto, waste_pct: medidaTanda(l.unit).merma ? num(l.merma) : 0 })),
            instructions,
            prep_minutes: minutos === "" ? null : parseInt(minutos, 10),
        };
        try {
            const r = nueva
                ? await api.production.createPreparation(base ? { ...body, product_id: base.id } : body)
                : await api.production.savePreparation(productId, body);
            notify("Preparación guardada");
            onSaved?.(r.data);
        } catch (e) { notify(e?.message || "No se pudo guardar la preparación", "err"); }
    };

    const dato = (label, children, sub) => (
        <div className="min-w-0">
            <dt className="text-[11px] font-medium text-content-subtle truncate">{label}</dt>
            <dd className="mt-0.5 text-[14px] font-bold text-content dark:text-white truncate tabular-nums">{children}</dd>
            {sub && <dd className="text-[11px] text-content-subtle truncate mt-0.5">{sub}</dd>}
        </div>
    );

    const titulo = nueva ? "Nueva preparación" : prep ? `Editar preparación · ${toNameCase(prep.name)}` : "Preparación";

    const usarProducto = (p) => {
        if (p.is_preparation) { onOpenExisting?.(p.id); return; }
        setBase(p); setName(p.name); setUnit(String(p.unit).toUpperCase()); setElegido(true);
    };
    const crearNuevo = (texto) => { setBase(null); setName(texto); setElegido(true); };
    const cambiar = () => { setBase(null); setElegido(false); };

    return (
        <>
            <Modal open={open} onClose={removing ? () => {} : onClose} title={titulo} width={740}
                footer={
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="sm:mr-auto text-[13px] min-w-0">
                            {porUnidad != null && (
                                <>
                                    <span className="text-content-subtle">Costo estimado por {unit === "PORCION" ? "porción" : unidad.suf}: </span>
                                    <Money value={money(porUnidad)} className="font-bold text-content dark:text-white" />
                                </>
                            )}
                        </div>
                        {canEdit ? (
                            <div className="flex flex-col-reverse sm:flex-row gap-2">
                                {!nueva && prep && (
                                    <button type="button" onClick={() => setRemoving(true)}
                                        className="hidden sm:inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-red-500/25 text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Eliminar
                                    </button>
                                )}
                                <button type="button" onClick={onClose} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-semibold">Cancelar</button>
                                {(!nueva || elegido) && <Button onClick={save} className="h-10 px-5">{nueva ? "Crear preparación" : "Guardar cambios"}</Button>}
                            </div>
                        ) : (
                            <div className="flex flex-col-reverse sm:flex-row gap-2">
                                <button type="button" onClick={onClose} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-semibold">Cerrar</button>
                                {onProduce && prep && <Button onClick={() => onProduce(prep)} className="h-10 px-5">Producir</Button>}
                            </div>
                        )}
                    </div>
                }>
                {loading || (!nueva && !prep) ? (
                    <div className="py-16 flex justify-center"><Spinner /></div>
                ) : (
                    <div className="space-y-4">
                        {nueva && !elegido && (
                            <div>
                                <label className="label">¿Qué vas a preparar?</label>
                                <PrepPicker warehouseId={warehouseId} inicial={name} onUse={usarProducto} onCreate={crearNuevo} />
                            </div>
                        )}

                        {(!nueva || elegido) && (
                            <>
                                {/* ── Datos principales (alineados en grilla de 12 columnas) ── */}
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                                    <div className="sm:col-span-6 min-w-0">
                                        <label className="label flex items-center justify-between gap-2">
                                            <span>Nombre de la preparación</span>
                                            {nueva && (
                                                <button type="button" onClick={cambiar} className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                                                    Cambiar producto
                                                </button>
                                            )}
                                        </label>
                                        <input
                                            className="input"
                                            value={name}
                                            onChange={e => setName(e.target.value)}
                                            maxLength={200}
                                            autoComplete="off"
                                            disabled={!canEdit}
                                            placeholder="Ej. Pollo producción, Sopa de res, Salsa…"
                                            {...(nueva ? { "data-autofocus": true } : {})}
                                        />
                                    </div>
                                    <div className="sm:col-span-3 min-w-0">
                                        <label className="label">Unidad de medida</label>
                                        <CustomSelect
                                            value={unit}
                                            onChange={handleUnitChange}
                                            disabled={!canEdit}
                                            options={UNIDADES_PREP.map(u => ({ value: u.key, label: `${u.label} (${u.suf})` }))}
                                            className="w-full"
                                        />
                                    </div>
                                    <div className="sm:col-span-3 min-w-0">
                                        <label className="label">Una tanda rinde</label>
                                        <div className="relative">
                                            <input
                                                className="input pr-14 text-right tabular-nums font-semibold"
                                                inputMode={entera ? "numeric" : "decimal"}
                                                value={rinde}
                                                disabled={!canEdit}
                                                autoComplete="off"
                                                placeholder="Ej. 20"
                                                aria-label="Lo que rinde una tanda"
                                                onChange={e => setRinde(entera ? e.target.value.replace(/\D/g, "").slice(0, 5) : e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))}
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-content-subtle pointer-events-none">{unidad.suf}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* ── Resumen de costos y existencia (solo lectura, simétrico) ── */}
                                <dl className="rounded-xl border border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02] px-4 py-3 grid grid-cols-3 gap-4">
                                    {dato("Costo de la tanda", lines.length ? <Money value={money(costoTanda)} /> : "—")}
                                    {dato(`Costo por ${unit === "PORCION" ? "porción" : unidad.suf}`, porUnidad != null ? <Money value={money(porUnidad)} /> : "—",
                                        prep?.last_cost != null ? <>Última tanda: <Money value={money(prep.last_cost)} /></> : null)}
                                    {dato("Existencia en sucursal", prep?.stock != null ? fmtRinde(prep.stock, unit) : "—",
                                        prep?.used_in?.length ? `Usada en ${prep.used_in.length === 1 ? "1 plato" : `${prep.used_in.length} platos`}` : null)}
                                </dl>

                                {/* ── Ingredientes de la tanda ── */}
                                <div className="rounded-xl border border-border/70 dark:border-white/[0.08] bg-surface-2/30 dark:bg-white/[0.02] p-3.5 space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                                        <span className="text-[13px] font-semibold text-content dark:text-white">Lo que lleva una tanda</span>
                                        <span className="text-[11px] text-content-subtle">
                                            Al registrar cada producción podrás ajustar lo que se usó de verdad.
                                        </span>
                                    </div>
                                    {canEdit && (
                                        <IngredientSearch
                                            warehouseId={warehouseId}
                                            onPick={agregar}
                                            exclude={yaEsta}
                                            excludeId={prep?.product_id ?? base?.id ?? null}
                                            placeholder="Buscar o crear ingrediente: pollo crudo, carne, papa…"
                                        />
                                    )}
                                    <IngredientLines
                                        lines={lines}
                                        setLines={setLines}
                                        calc={calc}
                                        canEdit={canEdit}
                                        money={money}
                                        medidaDe={medidaTanda}
                                        netoLabel="Lleva"
                                    />
                                    {prep?.used_in?.length > 0 && (
                                        <p className="text-[11px] text-content-subtle pt-1">
                                            Platos que usan esta preparación: <span className="font-medium text-content dark:text-white/80">{prep.used_in.map(u => toNameCase(u.name)).join(", ")}</span>.
                                        </p>
                                    )}
                                </div>

                                {/* ── Instrucciones y Tiempo ── */}
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                                    <div className="sm:col-span-9 min-w-0">
                                        <label className="label flex items-center justify-between">
                                            <span>Instrucciones de preparación</span>
                                            <span className="font-normal text-[11px] text-content-subtle">Opcional</span>
                                        </label>
                                        <textarea
                                            value={instructions}
                                            onChange={e => setInstructions(e.target.value)}
                                            rows={3}
                                            maxLength={4000}
                                            disabled={!canEdit}
                                            placeholder="Sofreír el aliño, agregar la carne y el agua, hervir 2 horas…"
                                            className="input !h-auto py-2 resize-none"
                                        />
                                    </div>
                                    <div className="sm:col-span-3 min-w-0">
                                        <label className="label flex items-center justify-between">
                                            <span>Tiempo</span>
                                            <span className="font-normal text-[11px] text-content-subtle">Opcional</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                className="input pr-12 text-right tabular-nums"
                                                inputMode="numeric"
                                                value={minutos}
                                                autoComplete="off"
                                                disabled={!canEdit}
                                                placeholder="0"
                                                onChange={e => setMinutos(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-content-subtle pointer-events-none">min</span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {canEdit && !nueva && prep && (
                            <button type="button" onClick={() => setRemoving(true)}
                                className="sm:hidden w-full h-10 rounded-lg border border-red-500/25 text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center gap-1.5">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Eliminar preparación
                            </button>
                        )}
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={removing}
                title="Eliminar preparación"
                message="Deja de ser preparación y se borra su ficha de tanda. El producto base y las tandas ya registradas se conservan."
                confirmText="Eliminar"
                onCancel={() => setRemoving(false)}
                onConfirm={async () => {
                    try {
                        await api.production.removePreparation(productId);
                        notify("Preparación eliminada");
                        setRemoving(false);
                        onSaved?.();
                    } catch (e) { notify(e?.message || "No se pudo eliminar la preparación", "err"); }
                }}
            />
        </>
    );
}

// Busca entre los productos que pueden ser preparación (con existencia propia). Cada resultado
// se usa tal cual; uno que ya es preparación se abre; y al final, crear uno nuevo con lo escrito.
function PrepPicker({ warehouseId, inicial = "", onUse, onCreate }) {
    const [q, setQ] = useState(inicial);
    const dq = useDebounce(q, 250);
    const [res, setRes] = useState(null);

    useEffect(() => {
        if (!dq.trim()) { setRes(null); return; }
        let vivo = true;
        api.recipes.ingredients({ search: dq.trim(), ...(warehouseId ? { warehouse_id: warehouseId } : {}) })
            .then(r => { if (vivo) setRes(r.data || []); })
            .catch(() => { if (vivo) setRes([]); });
        return () => { vivo = false; };
    }, [dq, warehouseId]);

    const unidadDe = (p) => UNIDADES_PREP.find(u => u.key === String(p.unit || "").toUpperCase());
    const texto = q.trim();
    const exacto = res?.some(p => p.name.trim().toLowerCase() === texto.toLowerCase());

    return (
        <div className="space-y-2">
            <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input className="input pl-9" value={q} onChange={e => setQ(e.target.value)} maxLength={200} autoComplete="off" spellCheck={false}
                    placeholder="Busca el producto o escribe un nombre: pollo producción, sopa de res…" data-autofocus />
            </div>
            {texto.length >= 2 && res && dq === q && (
                <div className="rounded-lg border border-border dark:border-white/10 bg-white dark:bg-[#161821] divide-y divide-border/60 dark:divide-white/[0.06] overflow-hidden shadow-sm">
                    {res.length > 0 && (
                        <div className="max-h-64 overflow-y-auto divide-y divide-border/60 dark:divide-white/[0.06]">
                            {res.map(p => {
                                const unidad = unidadDe(p);
                                return (
                                    <button key={p.id} type="button" disabled={!unidad} onClick={() => onUse(p)}
                                        className="w-full flex items-center gap-3 px-3 min-h-11 py-2 text-left hover:bg-surface-2 dark:hover:bg-white/[0.04] disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors">
                                        <span className="flex-1 min-w-0">
                                            <span className={`block text-[13px] font-medium truncate ${unidad ? "text-content dark:text-white" : "text-content-subtle"}`}>{toNameCase(p.name)}</span>
                                            <span className="block text-[11px] text-content-subtle truncate">
                                                {p.is_preparation ? "Ya es preparación" : !unidad ? "Se cuenta en otra unidad: no sirve para una tanda"
                                                    : `${p.sellable ? "Producto que se vende" : "Insumo"} · se cuenta en ${unidad.label.toLowerCase()}`}
                                            </span>
                                        </span>
                                        {unidad && <span className="text-[12px] font-semibold text-brand-600 dark:text-brand-400 shrink-0">{p.is_preparation ? "Abrir" : "Usar este"}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {!exacto && (
                        <button type="button" onClick={() => onCreate(texto)}
                            className="w-full flex items-center gap-2 px-3 h-10 text-left text-[13px] font-semibold text-brand-600 dark:text-brand-400 hover:bg-surface-2 dark:hover:bg-white/[0.04] transition-colors">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 5v14M5 12h14" /></svg>
                            <span className="truncate">Crear «{texto}» como preparación nueva</span>
                        </button>
                    )}
                </div>
            )}
            {texto.length < 2 && <p className="text-[11px] text-content-subtle">Si ya existe en el catálogo, se usa ese mismo producto. Si no, lo creas aquí.</p>}
        </div>
    );
}
