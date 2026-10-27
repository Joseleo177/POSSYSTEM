import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import Check from "../ui/Check";
import Segmented from "../ui/Segmented";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useDebounce } from "../../hooks/useDebounce";
import { toNameCase, fmtBase } from "../../helpers";
import RecipeModal from "./RecipeModal";
import RecipeLines, { linesToItems, newCut } from "./RecipeLines";
import { INPUT, CARD, Field, fmtDims, fmtSize, errMsg } from "./shared";


/**
 * Qué lleva una orden ya creada: la receta del producto (con las medidas del cliente si tiene
 * variables) o, en una orden a medida, lo que se escribe para ella sola. Sirve para las
 * órdenes que se crearon sin plan y para corregirlo antes de entregar material.
 */
export default function OrderPlanModal({ order, materials = [], stages = [], onClose, onDone }) {
    const { notify, baseCurrency } = useApp();
    const open = !!order;
    const estandar = order?.type === "estandar";
    const product = order?.Product || null;
    const [hasRecipe, setHasRecipe] = useState(false);
    const [mode, setMode] = useState("receta");
    const [values, setValues] = useState({});
    const [lines, setLines] = useState({ cuts: [], accs: [], procs: [] });
    const unit = "m";   // el taller mide en metros
    const [saveRecipe, setSaveRecipe] = useState(true);
    const [creatingRecipe, setCreatingRecipe] = useState(false);
    const [calc, setCalc] = useState(null);
    const [calcError, setCalcError] = useState(null);

    useEffect(() => {
        if (!open) return;
        const tiene = !!order.has_recipe && !!product;
        setHasRecipe(tiene);
        setMode(estandar || tiene ? "receta" : "propio");
        setValues({});
        setLines({ cuts: materials[0] ? [newCut(materials)] : [], accs: [], procs: [] });
        setSaveRecipe(true);
        setCalc(null); setCalcError(null);
    }, [open]);

    const items = mode === "propio" ? linesToItems(lines) : [];
    const draft = useDebounce(JSON.stringify({ mode, values, unit, items }), 450);

    // Cómo queda, calculado por el servidor con la cantidad y el almacén de la orden.
    useEffect(() => {
        if (!open) return;
        const d = JSON.parse(draft);
        let vivo = true;
        const base = { quantity: order.quantity, warehouse_id: order.warehouse_id };
        let req;
        if (d.mode === "receta") {
            if (!hasRecipe) { setCalc(null); setCalcError(null); return; }
            const clean = Object.fromEntries(Object.entries(d.values).filter(([, v]) => String(v).trim() !== ""));
            req = api.factory.recipePreview(product.id, { ...base, ...(Object.keys(clean).length ? { params: JSON.stringify(clean) } : {}) });
        } else {
            if (!d.items.length) { setCalc(null); setCalcError(null); return; }
            req = api.factory.evaluateRecipe({ ...base, unit: d.unit, items: d.items, params: [] });
        }
        req.then(r => { if (vivo) { setCalc(r.data); setCalcError(null); } })
            .catch(e => { if (vivo) { setCalc(null); setCalcError(errMsg(e)); } });
        return () => { vivo = false; };
    }, [draft, open, hasRecipe]);

    const save = async () => {
        if (mode === "receta" && !hasRecipe) return notify("Crea primero la receta del producto", "err");
        if (mode === "propio" && !items.length) return notify("Di qué lleva: al menos un corte, un accesorio o una etapa del taller", "err");
        if (calcError) return notify(calcError, "err");
        try {
            await api.factory.setPlan(order.id, mode === "receta"
                ? { params: calc?.params?.length ? Object.fromEntries(calc.params.map(p => [p.key, values[p.key] ?? p.default])) : undefined }
                : { plan: { unit, items, save_recipe: !!product && !hasRecipe && saveRecipe } });
            notify("Listo: la orden ya dice qué lleva");
            onDone?.();
        } catch (e) { notify(errMsg(e), "err"); }
    };

    const money = (n) => fmtBase(n, baseCurrency);

    return (
        <>
            <Modal open={open} onClose={creatingRecipe ? () => {} : onClose} title={order ? `Qué lleva ${order.code}` : "Qué lleva"} width={mode === "propio" ? 680 : 520}
                footer={
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                        {(mode === "propio" || hasRecipe) && (
                            <Button onClick={save} className="h-12 sm:h-10 px-5">{mode === "receta" ? "Aplicar receta" : "Guardar"}</Button>
                        )}
                    </div>
                }>
                {open && (
                    <div className="space-y-4">
                        {/* A medida con receta: elegir entre ella y lo escrito para esta orden. */}
                        {!estandar && hasRecipe && (
                            <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={mode} onChange={setMode}
                                options={[{ key: "receta", label: "Con la receta" }, { key: "propio", label: "Solo para esta orden" }]} />
                        )}

                        {mode === "receta" && !hasRecipe && (
                            <div className={`${CARD} px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3`}>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-semibold text-content dark:text-white">{toNameCase(product?.name || "")} no tiene receta</div>
                                    <p className="text-[12px] text-content-subtle">Una orden estándar se hace con la receta del producto.</p>
                                </div>
                                <button type="button" onClick={() => setCreatingRecipe(true)}
                                    className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium shrink-0">Crear receta</button>
                            </div>
                        )}

                        {mode === "receta" && hasRecipe && calc?.params?.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {calc.params.map(p => (
                                    <Field key={p.key} label={p.label}>
                                        <div className="relative">
                                            <input value={values[p.key] ?? ""} onChange={e => setValues(v => ({ ...v, [p.key]: e.target.value }))}
                                                inputMode="decimal" placeholder={String(p.default).replace(".", ",")}
                                                className={`${INPUT} ${p.unit ? "pr-10" : ""} tabular-nums`} />
                                            {p.unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{p.unit}</span>}
                                        </div>
                                    </Field>
                                ))}
                            </div>
                        )}

                        {mode === "propio" && (
                            <>
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-[12px] text-content-subtle min-w-0">Las medidas y materiales que pidió el cliente, por unidad.</p>
                                </div>
                                <RecipeLines materials={materials} stages={stages} unit={unit} lines={lines} setLines={setLines} />
                                {product && !hasRecipe && (
                                    <label className="flex items-center gap-2.5 cursor-pointer select-none" onClick={() => setSaveRecipe(v => !v)}>
                                        <Check checked={saveRecipe} onChange={setSaveRecipe} title="Guardar como receta" />
                                        <span className="text-[13px] text-content dark:text-white">Guardar como receta de {toNameCase(product.name)}, para la próxima vez</span>
                                    </label>
                                )}
                            </>
                        )}

                        {calcError && <p className="text-[12px] text-red-600 dark:text-red-400">{calcError}</p>}
                        {calc && !calcError && (
                            <div className={`${CARD} px-4 py-3`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="text-[13px] font-semibold text-content dark:text-white">Para {Number(order.quantity).toLocaleString("es-VE")} {Number(order.quantity) === 1 ? "unidad" : "unidades"}</div>
                                    <div className="text-right shrink-0">
                                        <Money value={money(calc.total_cost)} className="text-[14px] font-semibold text-content dark:text-white" />
                                        <div className="text-[11px] text-content-subtle">costo estimado</div>
                                    </div>
                                </div>
                                <ul className="mt-2 space-y-1">
                                    {calc.lines.map((l, i) => (
                                        <li key={i} className="text-[12px] text-content-muted dark:text-white/70 flex justify-between gap-3">
                                            <span className="truncate">
                                                {l.kind === "material"
                                                    ? `${l.total_cuts} corte${l.total_cuts === 1 ? "" : "s"} de ${fmtDims({ width_mm: l.cut_width_mm, length_mm: l.cut_length_mm })} · ${toNameCase(l.name)}`
                                                    : l.kind === "proceso"
                                                    ? `${l.name} · ${Number(l.expected).toLocaleString("es-VE")} min`
                                                    : `${Number(l.expected).toLocaleString("es-VE")} × ${toNameCase(l.name)}`}
                                            </span>
                                            {l.kind === "material" && <span className="tabular-nums shrink-0">{fmtSize(l.expected, l.unit)}</span>}
                                            {l.kind === "proceso" && <span className="tabular-nums shrink-0"><Money value={money(l.cost)} /></span>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <RecipeModal productId={creatingRecipe ? "new" : null} initialProduct={product} materials={materials} stages={stages}
                onClose={() => setCreatingRecipe(false)}
                onSaved={() => { setCreatingRecipe(false); setHasRecipe(true); setMode("receta"); }} />
        </>
    );
}
