import { useCallback } from "react";
import CustomSelect from "../ui/CustomSelect";
import { api } from "../../services/api";
import { toNameCase } from "../../helpers";
import { INPUT, AGREGAR, QUITAR, PlusIcon, XIcon, SearchPick, fromMm } from "./shared";

/**
 * Las líneas de lo que lleva un producto: cortes de material, accesorios y minutos por etapa,
 * todo por unidad. Las comparten la receta (con fórmulas y variables) y la orden a medida que
 * no tiene receta (con números: lo que pidió ese cliente).
 */

// Campo de fórmula: acepta un número ("0,40") o una cuenta con las variables ("L + 0,10").
export function Formula({ value, onChange, placeholder, suffix, className = "" }) {
    return (
        <div className={`relative ${className}`}>
            <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} autoComplete="off"
                className={`${INPUT} ${suffix ? "pr-14" : ""} tabular-nums font-medium`} />
            {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{suffix}</span>}
        </div>
    );
}

export const newCut = (materials) => ({ material_id: materials[0] ? String(materials[0].id) : "", w: "", l: "", cuts: "1" });

// Líneas ya calculadas por unidad (las de una receta o las del plan de una orden) como líneas
// editables en la unidad del taller: para ajustar lo que pidió un cliente partiendo de lo que ya había.
export const planToLines = (calculated = [], unit = "cm") => {
    const num = (n) => Number(n).toLocaleString("es-VE", { maximumFractionDigits: 3, useGrouping: false });
    return {
        cuts: calculated.filter(l => l.kind === "material").map(l => ({
            material_id: String(l.component_id),
            w: l.cut_width_mm ? fromMm(l.cut_width_mm, unit) : "",
            l: fromMm(l.cut_length_mm, unit),
            cuts: String(l.cuts),
        })),
        accs: calculated.filter(l => l.kind === "accesorio").map(l => ({
            product: { id: l.component_id, name: l.name, unit: l.unit }, quantity: num(l.quantity),
        })),
        procs: calculated.filter(l => l.kind === "proceso").map(l => ({ stage_id: String(l.stage_id), minutes: num(l.minutes) })),
    };
};

// Las líneas tal como las recibe el servidor (receta o plan de la orden).
export const linesToItems = ({ cuts, accs, procs }) => [
    ...cuts.map(c => ({ component_id: parseInt(c.material_id) || 0, width_expr: c.w, length_expr: c.l, cuts_expr: c.cuts })),
    ...accs.filter(a => a.product).map(a => ({ component_id: a.product.id, quantity_expr: a.quantity })),
    ...procs.map(p => ({ stage_id: parseInt(p.stage_id) || 0, minutes_expr: p.minutes })),
];

export default function RecipeLines({ materials, stages = [], unit, keys = [], lines, setLines }) {
    const { cuts, accs, procs } = lines;
    const activeStages = stages.filter(s => s.active !== false);
    const ejemplo = keys.length ? `${keys[0]} + 0,10` : "0,40";

    const searchProducts = useCallback(async (term) => {
        const r = await api.products.getAll({ search: term, is_combo: false, is_service: false, limit: 20 });
        return (r.data || []).filter(p => !p.piece_mode && !p.is_variant_parent);
    }, []);

    const matOf = (id) => materials.find(m => String(m.id) === String(id));
    const upd = (k) => (i, patch) => setLines(ls => ({ ...ls, [k]: ls[k].map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
    const add = (k, row) => setLines(ls => ({ ...ls, [k]: [...ls[k], row] }));
    const drop = (k, i) => setLines(ls => ({ ...ls, [k]: ls[k].filter((_, j) => j !== i) }));
    const setCut = upd("cuts"), setAcc = upd("accs"), setProc = upd("procs");

    return (
        <>
            {/* Cortes */}
            <section>
                <h3 className="text-[14px] font-semibold text-content dark:text-white mb-2">Cortes de material por unidad</h3>
                {materials.length === 0 && <p className="text-[13px] text-content-subtle mb-2">No hay materiales con control por piezas todavía.</p>}
                <div className="space-y-2">
                    {cuts.map((c, i) => {
                        const m = matOf(c.material_id);
                        const area = m?.piece_mode !== "length";
                        return (
                            <div key={i} className="rounded-xl border border-border/60 dark:border-white/[0.06] p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <CustomSelect className="flex-1 min-w-0" value={c.material_id} onChange={v => setCut(i, { material_id: v })} placeholder="Material…"
                                        options={materials.map(x => ({ value: String(x.id), label: toNameCase(x.name) }))} />
                                    <button type="button" onClick={() => drop("cuts", i)} aria-label="Quitar corte" className={QUITAR}><XIcon /></button>
                                </div>
                                <div className={`grid gap-2 ${area ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"}`}>
                                    {area && <Formula value={c.w} onChange={v => setCut(i, { w: v })} placeholder={`Ancho: ${ejemplo}`} suffix={unit} />}
                                    <Formula value={c.l} onChange={v => setCut(i, { l: v })} placeholder="Largo" suffix={unit} />
                                    <Formula value={c.cuts} onChange={v => setCut(i, { cuts: v })} placeholder="1" suffix="cortes" />
                                </div>
                            </div>
                        );
                    })}
                </div>
                {materials.length > 0 && (
                    <button type="button" onClick={() => add("cuts", newCut(materials))} className={`${AGREGAR} mt-2`}>
                        <PlusIcon /> Agregar corte
                    </button>
                )}
            </section>

            {/* Accesorios */}
            <section>
                <h3 className="text-[14px] font-semibold text-content dark:text-white mb-2">Accesorios por unidad</h3>
                <div className="space-y-2">
                    {accs.map((a, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                                <SearchPick searchFn={searchProducts} value={a.product} onChange={p => setAcc(i, { product: p })}
                                    placeholder="Tornillos, bisagras…"
                                    renderItem={p => (
                                        <span className="flex items-center justify-between gap-3">
                                            <span className="truncate">{toNameCase(p.name)}</span>
                                            <span className="text-[11px] text-content-subtle shrink-0">{p.unit}</span>
                                        </span>
                                    )} />
                            </div>
                            <Formula value={a.quantity} onChange={v => setAcc(i, { quantity: v })} placeholder={keys.includes("P") ? "P * 2" : "2"} className="w-32 shrink-0" />
                            <button type="button" onClick={() => drop("accs", i)} aria-label="Quitar accesorio" className={QUITAR}><XIcon /></button>
                        </div>
                    ))}
                </div>
                <button type="button" onClick={() => add("accs", { product: null, quantity: "1" })} className={`${AGREGAR} mt-2`}>
                    <PlusIcon /> Agregar accesorio
                </button>
            </section>

            {/* Procesos */}
            <section>
                <h3 className="text-[14px] font-semibold text-content dark:text-white mb-2">Tiempo de taller por unidad</h3>
                {activeStages.length === 0 ? (
                    <p className="text-[13px] text-content-subtle">Define las etapas del taller (pestaña Etapas) para calcular la mano de obra.</p>
                ) : (
                    <>
                        <div className="space-y-2">
                            {procs.map((p, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <CustomSelect className="flex-1 min-w-0" value={p.stage_id} onChange={v => setProc(i, { stage_id: v })} placeholder="Etapa…"
                                        options={activeStages.map(s => ({ value: String(s.id), label: s.name }))} />
                                    <Formula value={p.minutes} onChange={v => setProc(i, { minutes: v })} placeholder={keys.length ? `20 + ${keys[0]} * 10` : "30"} suffix="min" className="w-40 shrink-0" />
                                    <button type="button" onClick={() => drop("procs", i)} aria-label="Quitar proceso" className={QUITAR}><XIcon /></button>
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={() => add("procs", { stage_id: String(activeStages.find(s => !procs.some(x => x.stage_id === String(s.id)))?.id ?? activeStages[0].id), minutes: "" })} className={`${AGREGAR} mt-2`}>
                            <PlusIcon /> Agregar etapa
                        </button>
                    </>
                )}
            </section>
        </>
    );
}
