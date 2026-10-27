import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import ConfirmModal from "../ui/ConfirmModal";
import CustomSelect from "../ui/CustomSelect";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useDebounce } from "../../hooks/useDebounce";
import { toNameCase, fmtBase } from "../../helpers";
import {
    INPUT, AGREGAR, QUITAR, CARD, Field, PlusIcon, XIcon, SearchPick, fmtDims, fmtSize, errMsg,
} from "./shared";
import RecipeLines, { linesToItems, newCut } from "./RecipeLines";

const NARROW = INPUT.replace("w-full ", "");
const RECIPE_UNITS = [{ key: "m", name: "metros" }, { key: "cm", name: "centímetros" }, { key: "mm", name: "milímetros" }];

const fmtMin = (m) => `${Number(m || 0).toLocaleString("es-VE", { maximumFractionDigits: 1 })} min`;

/**
 * Receta de un producto. Lo que se fabrica siempre igual lleva números fijos; lo que el
 * cliente pide con otras medidas lleva variables (L, A, puertas) y fórmulas: el mesón de
 * L × A lleva un corte de (L + 0,10) × (A + 0,25). Cada orden la calcula con sus valores.
 *
 * Tres tipos de línea, por unidad: cortes de material, accesorios y minutos en una etapa del
 * taller (mano de obra). El cálculo de abajo lo hace el servidor con el mismo intérprete que
 * usará la orden, así que lo que se ve aquí es exactamente lo que va a salir.
 *
 * `productId`: null cerrado · "new" receta nueva · id del producto para editar la suya.
 * `initialProduct`: con "new", el producto ya elegido (la receta se crea desde una orden).
 */
export default function RecipeModal({ productId, initialProduct = null, materials, stages = [], onClose, onSaved }) {
    const { notify, baseCurrency } = useApp();
    const [loading, setLoading] = useState(false);
    const [product, setProduct] = useState(null);
    const [unit, setUnit] = useState("m");
    const [params, setParams] = useState([]);
    const [instructions, setInstructions] = useState("");
    const [lines, setLines] = useState({ cuts: [], accs: [], procs: [] });
    const [deleting, setDeleting] = useState(false);
    const [calc, setCalc] = useState(null);
    const [calcError, setCalcError] = useState(null);
    const open = productId != null;
    const editing = open && productId !== "new";

    useEffect(() => {
        if (!open) return;
        setProduct(null); setInstructions(""); setUnit("m"); setParams([]);
        setLines({ cuts: [], accs: [], procs: [] }); setCalc(null); setCalcError(null);
        if (!editing) {
            setProduct(initialProduct);
            setLines({ cuts: materials[0] ? [newCut(materials)] : [], accs: [], procs: [] });
            return;
        }
        setLoading(true);
        api.factory.recipe(productId)
            .then(r => {
                const d = r.data;
                setProduct({ id: d.product_id, name: d.product_name || "", unit: d.product_unit });
                setUnit(d.unit || "m");
                setParams((d.params || []).map(p => ({ ...p, default: String(p.default).replace(".", ",") })));
                setInstructions(d.instructions || "");
                setLines({
                    cuts: d.items.filter(i => i.kind === "material").map(i => ({
                        material_id: String(i.component_id), w: i.width_expr || "", l: i.length_expr || "", cuts: i.cuts_expr || "1",
                    })),
                    accs: d.items.filter(i => i.kind === "accesorio").map(i => ({
                        product: { id: i.component_id, name: i.name, unit: i.unit }, quantity: i.quantity_expr || "",
                    })),
                    procs: d.items.filter(i => i.kind === "proceso").map(i => ({ stage_id: String(i.stage_id), minutes: i.minutes_expr || "" })),
                });
            })
            .catch(e => notify(errMsg(e, "No se pudo abrir la receta"), "err"))
            .finally(() => setLoading(false));
    }, [productId]);

    const searchProducts = useCallback(async (term) => {
        const r = await api.products.getAll({ search: term, is_combo: false, is_service: false, limit: 20 });
        return (r.data || []).filter(p => !p.piece_mode && !p.is_variant_parent);
    }, []);

    const setParam = (i, patch) => setParams(rows => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const dropParam = (i) => setParams(rows => rows.filter((_, j) => j !== i));

    // El borrador tal como lo recibe el servidor.
    const draft = useMemo(() => ({
        product_id: product?.id,
        unit,
        params: params.map(p => ({ key: p.key.trim(), label: p.label.trim() || p.key.trim(), kind: p.kind, default: String(p.default).replace(",", ".") })),
        instructions: instructions.trim() || null,
        items: linesToItems(lines),
    }), [product, unit, params, instructions, lines]);

    // Cálculo en vivo con los valores por defecto.
    const dDraft = useDebounce(draft, 500);
    useEffect(() => {
        if (!open || loading || !dDraft.items.length) { setCalc(null); setCalcError(null); return; }
        let vivo = true;
        api.factory.evaluateRecipe(dDraft)
            .then(r => { if (vivo) { setCalc(r.data); setCalcError(null); } })
            .catch(e => { if (vivo) { setCalc(null); setCalcError(errMsg(e)); } });
        return () => { vivo = false; };
    }, [dDraft, open, loading]);

    const money = (n) => fmtBase(n, baseCurrency);

    const save = async () => {
        if (!product) return notify("Elige el producto de la receta", "err");
        if (!draft.items.length) return notify("Agrega al menos un corte, accesorio o proceso", "err");
        try {
            await api.factory.saveRecipe(product.id, draft);
            notify("Receta guardada");
            onSaved?.(product);
        } catch (e) { notify(errMsg(e), "err"); }
    };

    const keys = params.map(p => p.key.trim().toUpperCase()).filter(Boolean);

    return (
        <>
            <Modal open={open} onClose={deleting ? () => {} : onClose} title={editing ? "Editar receta" : "Nueva receta"} width={760}
                footer={
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="sm:mr-auto text-[13px] min-w-0">
                            {calc ? (
                                <>
                                    <span className="text-content-subtle">Costo estimado por unidad </span>
                                    <Money value={money(calc.unit_cost)} className="font-semibold text-content dark:text-white" />
                                </>
                            ) : calcError ? (
                                <span className="text-red-600 dark:text-red-400">{calcError}</span>
                            ) : null}
                        </div>
                        <div className="flex flex-col-reverse sm:flex-row gap-2">
                            {editing && (
                                <button onClick={() => setDeleting(true)} className="h-12 sm:h-10 px-3 rounded-lg text-[13px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400">
                                    Borrar receta
                                </button>
                            )}
                            <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                            <Button onClick={save} className="h-12 sm:h-10 px-5">Guardar receta</Button>
                        </div>
                    </div>
                }>
                {loading ? (
                    <div className="py-16 flex justify-center"><Spinner /></div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                            <Field label="Producto que se fabrica">
                                <SearchPick searchFn={searchProducts} value={product} onChange={setProduct} disabled={editing || !!initialProduct}
                                    placeholder="Vaso, mesón, fregadero…" autoFocus={!editing}
                                    renderItem={p => (
                                        <span className="flex items-center justify-between gap-3">
                                            <span className="truncate">{toNameCase(p.name)}</span>
                                            <span className="text-[11px] text-content-subtle shrink-0">{p.unit}</span>
                                        </span>
                                    )} />
                            </Field>
                            {/* El taller mide en metros: las recetas nuevas van en metros sin preguntar. Una
                                receta vieja guardada en cm o mm conserva su unidad (cambiarla sin
                                convertir las fórmulas cambiaría los cortes), y se dice en cuál está. */}
                            {unit !== "m" && (
                                <Field label="Medidas en">
                                    <div className="h-10 flex items-center text-[13px] text-content-subtle">
                                        {RECIPE_UNITS.find(u => u.key === unit)?.name}
                                    </div>
                                </Field>
                            )}
                        </div>

                        {/* Receta vieja en cm o mm: se pasa a metros sin convertir los números, porque muchas
                            se escribieron pensando en metros con el selector en cm (1,62 leído como 1,62 cm).
                            Quien la pasa revisa cada medida, con el cálculo en vivo de abajo. */}
                        {unit !== "m" && (
                            <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                                <p className="flex-1 min-w-0 text-[13px] text-amber-900 dark:text-amber-200">
                                    Esta receta está en {RECIPE_UNITS.find(u => u.key === unit)?.name}. El taller mide en metros: pásala a metros y
                                    revisa que cada medida quede en metros (por ejemplo, 72,5 cm se escribe 0,725).
                                </p>
                                <button type="button" onClick={() => setUnit("m")}
                                    className="btn-outline h-9 px-3 rounded-lg text-[13px] font-medium shrink-0">Pasar a metros</button>
                            </div>
                        )}

                        {/* Variables */}
                        <section>
                            <div className="mb-2">
                                <h3 className="text-[14px] font-semibold text-content dark:text-white">Variables que pide el cliente</h3>
                                <p className="text-[12px] text-content-subtle">Opcional. Para lo hecho a medida: largo, ancho, cantidad de puertas. Se usan en las fórmulas.</p>
                            </div>
                            <div className="space-y-2">
                                {params.map((p, i) => (
                                    <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                                        <input value={p.key} onChange={e => setParam(i, { key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 10) })}
                                            placeholder="L" aria-label="Nombre corto" className={`${NARROW} w-16 shrink-0 text-center font-semibold`} />
                                        <input value={p.label} onChange={e => setParam(i, { label: e.target.value })} maxLength={40}
                                            placeholder="Largo" aria-label="Nombre" className={`${NARROW} flex-1 min-w-[120px]`} />
                                        <CustomSelect className="w-36 shrink-0" value={p.kind} onChange={v => setParam(i, { kind: v })}
                                            options={[{ value: "medida", label: `Medida (${unit})` }, { value: "numero", label: "Número" }]} />
                                        <input value={p.default} onChange={e => setParam(i, { default: e.target.value })} inputMode="decimal"
                                            placeholder="Por defecto" aria-label="Valor por defecto" className={`${NARROW} w-28 shrink-0 tabular-nums`} />
                                        <button onClick={() => dropParam(i)} aria-label="Quitar variable" className={QUITAR}><XIcon /></button>
                                    </div>
                                ))}
                            </div>
                            {params.length < 10 && (
                                <button onClick={() => setParams(ps => [...ps, { key: ["L", "A", "H", "P"].find(k => !ps.some(x => x.key === k)) || "", label: "", kind: "medida", default: "" }])} className={`${AGREGAR} mt-2`}>
                                    <PlusIcon /> Agregar variable
                                </button>
                            )}
                        </section>

                        <RecipeLines materials={materials} stages={stages} unit={unit} keys={keys} lines={lines} setLines={setLines} />

                        <Field label="Instrucciones para el taller" hint="Opcional">
                            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3} maxLength={4000}
                                placeholder="Cortar las caras, doblar a 90° y soldar la base…"
                                className={`${INPUT} h-auto py-2 resize-none`} />
                        </Field>

                        {/* Así queda con los valores por defecto */}
                        {calc && (
                            <section className={`${CARD} px-4 py-3`}>
                                <div className="text-[13px] font-semibold text-content dark:text-white">
                                    Así queda una unidad{calc.params?.length ? ` con ${calc.params.map(p => `${p.key} = ${String(p.value).replace(".", ",")}`).join(", ")}` : ""}
                                </div>
                                <ul className="mt-2 space-y-1">
                                    {calc.lines.map((l, i) => (
                                        <li key={i} className="text-[12px] text-content-muted dark:text-white/70 flex justify-between gap-3">
                                            <span className="truncate">
                                                {l.kind === "material"
                                                    ? `${l.cuts} corte${l.cuts === 1 ? "" : "s"} de ${fmtDims({ width_mm: l.cut_width_mm, length_mm: l.cut_length_mm })} · ${toNameCase(l.name)} · ${fmtSize(l.expected, l.unit)}`
                                                    : l.kind === "proceso"
                                                    ? `${l.name} · ${fmtMin(l.expected)}`
                                                    : `${Number(l.expected).toLocaleString("es-VE")} × ${toNameCase(l.name)}`}
                                            </span>
                                            <Money value={money(l.cost)} className="shrink-0" />
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-[11px] text-content-subtle mt-2">Los cortes y lo que se cuenta por unidades se redondean hacia arriba.</p>
                            </section>
                        )}
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={deleting}
                title="Borrar receta"
                message="Las órdenes que ya se crearon con ella conservan su copia. Las nuevas de este producto saldrán sin receta."
                confirmText="Borrar"
                onCancel={() => setDeleting(false)}
                onConfirm={async () => {
                    try {
                        await api.factory.deleteRecipe(product.id);
                        notify("Receta borrada");
                        setDeleting(false);
                        onSaved?.();
                    } catch (e) { notify(errMsg(e), "err"); }
                }}
            />
        </>
    );
}
