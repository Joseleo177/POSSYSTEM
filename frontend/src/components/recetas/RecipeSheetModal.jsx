import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase } from "../../helpers";
import { INPUT, CARD, Field } from "../fabrica/shared";
import { fmtPct, foodCostTone, medida, num } from "./shared";
import IngredientSearch from "./IngredientSearch";
import IngredientLines, { aLinea, calcular } from "./IngredientLines";

// Ficha técnica de un plato: qué lleva, cuánto cuesta y cuánto deja.
//
// Cada ingrediente se escribe como en la cocina: lo que va al plato (250 g de lomo limpio) y
// la merma del insumo (20 %: lo que se bota al limpiarlo o se pierde al cocinarlo). Lo que se
// descuenta del inventario y lo que se cuesta es el bruto, 313 g. El cálculo de aquí es el
// mismo que hace el servidor al guardar (services/recipes.js), así que la cifra no cambia.
// Un ingrediente puede ser una preparación de la cocina: 1 porción de la sopa de la olla.

/**
 * `productId`: null cerrado · id del plato. `warehouseId`: la sucursal de la que salen precio y
 * costos. `meta`: food cost objetivo de la empresa, en %.
 */
export default function RecipeSheetModal({ productId, warehouseId, meta = 35, onClose, onSaved }) {
    const { notify, baseCurrency, can } = useApp();
    const canEdit = can("products.edit");
    const money = (n) => fmtBase(n, baseCurrency);
    const open = productId != null;

    const [loading, setLoading] = useState(false);
    const [plato, setPlato] = useState(null);
    const [lines, setLines] = useState([]);
    const [instructions, setInstructions] = useState("");
    const [prep, setPrep] = useState("");
    const [removing, setRemoving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPlato(null); setLines([]); setInstructions(""); setPrep("");
        let vivo = true;
        setLoading(true);
        api.recipes.get(productId, warehouseId ? { warehouse_id: warehouseId } : {})
            .then(r => {
                if (!vivo) return;
                const d = r.data;
                setPlato(d);
                setLines((d.lines || []).map(l => aLinea(l)));
                setInstructions(d.instructions || "");
                setPrep(d.prep_minutes != null ? String(d.prep_minutes) : "");
            })
            .catch(e => { if (vivo) { notify(e?.message || "No se pudo abrir la receta", "err"); onClose?.(); } })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [productId]);

    const calc = useMemo(() => lines.map(l => calcular(l)), [lines]);
    const costo = calc.reduce((a, c) => a + c.costo, 0);
    const precio = plato?.price || 0;
    const fc = lines.length && precio > 0 ? Math.round((costo / precio) * 1000) / 10 : null;
    const sugerido = lines.length && meta > 0 ? costo / (meta / 100) : null;
    const sinCosto = lines.filter(l => !(l.unit_cost > 0)).length;
    const yaEsta = useMemo(() => new Set(lines.map(l => l.product_id)), [lines]);

    const agregar = (p) => setLines(ls => (ls.some(l => l.product_id === p.id) ? ls : [...ls, {
        product_id: p.id, name: p.name, unit: p.unit, sellable: p.sellable, unit_cost: p.cost, stock: p.stock, neto: "", merma: "",
    }]));

    const save = async () => {
        if (!lines.length) return notify("Agrega al menos un ingrediente", "err");
        const vacia = lines.find((l, i) => !(calc[i].neto > 0));
        if (vacia) return notify(`Escribe cuánto lleva de "${toNameCase(vacia.name)}"`, "err");
        try {
            await api.recipes.save(productId, {
                warehouse_id: warehouseId || undefined,
                lines: lines.map((l, i) => ({ product_id: l.product_id, net_quantity: calc[i].neto, waste_pct: medida(l.unit).merma ? num(l.merma) : 0 })),
                instructions,
                prep_minutes: prep === "" ? null : parseInt(prep, 10),
            });
            notify("Receta guardada");
            onSaved?.();
        } catch (e) { notify(e?.message || "No se pudo guardar la receta", "err"); }
    };

    const dato = (label, children, sub) => (
        <div className="min-w-0">
            <dt className="text-[12px] text-content-subtle">{label}</dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-content dark:text-white truncate">{children}</dd>
            {sub && <dd className="text-[12px] text-content-subtle truncate">{sub}</dd>}
        </div>
    );

    return (
        <>
            <Modal open={open} onClose={removing ? () => {} : onClose} title={plato ? toNameCase(plato.name) : "Receta"} width={780}
                footer={
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="sm:mr-auto text-[13px] min-w-0">
                            {lines.length > 0 && (
                                <>
                                    <span className="text-content-subtle">Costo por plato </span>
                                    <Money value={money(costo)} className="font-semibold text-content dark:text-white" />
                                    {fc != null && <span className={`ml-2 font-semibold tabular-nums ${foodCostTone(fc, meta) || "text-content dark:text-white"}`}>{fmtPct(fc)}</span>}
                                </>
                            )}
                        </div>
                        {canEdit ? (
                            <div className="flex flex-col-reverse sm:flex-row gap-2">
                                {/* En el teléfono va al final del contenido: tres botones apilados se comían el alto. */}
                                {plato?.removable && (
                                    <button onClick={() => setRemoving(true)} className="hidden sm:inline-flex items-center h-10 px-3 rounded-lg text-[13px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400">
                                        Quitar receta
                                    </button>
                                )}
                                <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                                <Button onClick={save} className="h-12 sm:h-10 px-5">Guardar receta</Button>
                            </div>
                        ) : (
                            <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cerrar</button>
                        )}
                    </div>
                }>
                {loading || !plato ? (
                    <div className="py-16 flex justify-center"><Spinner /></div>
                ) : (
                    <div className="space-y-6">
                        {/* Lo que cuesta y lo que deja, con la sucursal elegida */}
                        <dl className={`${CARD} px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3`}>
                            {dato("Precio de venta", <Money value={money(precio)} />)}
                            {dato("Costo del plato", lines.length ? <Money value={money(costo)} /> : "—",
                                sinCosto ? <span className="text-amber-700 dark:text-amber-400">{sinCosto === 1 ? "1 insumo sin costo" : `${sinCosto} insumos sin costo`}</span> : null)}
                            {dato("Food cost",
                                fc != null ? <span className={foodCostTone(fc, meta) || ""}>{fmtPct(fc)}</span> : "—",
                                `Meta ${fmtPct(meta)}`)}
                            {dato("Precio a la meta", sugerido != null ? <Money value={money(sugerido)} /> : "—",
                                sugerido != null && precio > 0 ? `Margen hoy ${money(precio - costo)}` : null)}
                        </dl>

                        {!plato.is_combo && (
                            <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-[13px] text-amber-900 dark:text-amber-200">
                                Hoy este plato no descuenta nada del inventario. Al guardar la receta, cada venta descontará estos ingredientes de la sucursal que lo vende. Las ventas anteriores no cambian.
                            </div>
                        )}

                        {/* Ingredientes */}
                        <section>
                            <div className="mb-2">
                                <h3 className="text-[14px] font-semibold text-content dark:text-white">Ingredientes por plato</h3>
                                <p className="text-[12px] text-content-subtle">
                                    Escribe lo que va al plato. La merma es lo que se pierde al limpiar o cocinar: se descuenta y se cuesta lo que se gasta.
                                </p>
                            </div>

                            <IngredientLines lines={lines} setLines={setLines} calc={calc} canEdit={canEdit} money={money} />

                            {canEdit && (
                                <div className="mt-3">
                                    <IngredientSearch warehouseId={warehouseId} onPick={agregar} exclude={yaEsta} autoFocus={!lines.length} />
                                </div>
                            )}
                            {lines.length === 0 && !canEdit && (
                                <p className="text-[13px] text-content-subtle">Este plato todavía no tiene receta.</p>
                            )}
                        </section>

                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-4">
                            <Field label="Preparación" hint="Opcional">
                                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={4} maxLength={4000} disabled={!canEdit}
                                    placeholder="Sellar el lomo a fuego alto, reposar 5 minutos, servir con la salsa…"
                                    className={`${INPUT} h-auto py-2 resize-none`} />
                            </Field>
                            <Field label="Tiempo" hint="Opcional">
                                <div className="relative">
                                    <input className={`${INPUT} pr-12 text-right tabular-nums`} inputMode="numeric" value={prep} autoComplete="off" disabled={!canEdit}
                                        placeholder="0" onChange={e => setPrep(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">min</span>
                                </div>
                            </Field>
                        </div>

                        {canEdit && plato.removable && (
                            <button onClick={() => setRemoving(true)} className="sm:hidden w-full h-12 rounded-lg text-[13px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400">
                                Quitar receta
                            </button>
                        )}
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={removing}
                title="Quitar receta"
                message="El plato deja de descontar ingredientes desde ahora. Las ventas que ya se hicieron conservan lo que descontaron: si se anulan, se repone lo mismo."
                confirmText="Quitar"
                onCancel={() => setRemoving(false)}
                onConfirm={async () => {
                    try {
                        await api.recipes.remove(productId);
                        notify("Receta quitada");
                        setRemoving(false);
                        onSaved?.();
                    } catch (e) { notify(e?.message || "No se pudo quitar la receta", "err"); }
                }}
            />
        </>
    );
}
