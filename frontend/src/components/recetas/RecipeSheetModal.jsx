import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase } from "../../helpers";
import { fmtPct, foodCostTone, medida, num } from "./shared";
import IngredientSearch from "./IngredientSearch";
import IngredientLines, { aLinea, calcular } from "./IngredientLines";

// Ficha técnica de un plato: qué lleva, cuánto cuesta y cuánto deja.

export default function RecipeSheetModal({ productId, warehouseId, meta = 35, onClose, onSaved }) {
    const { notify, baseCurrency, can } = useApp();
    const canEdit = can("products.edit") || can("production.manage");
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
    }, [productId, warehouseId]);

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
            <dt className="text-[11px] font-medium text-content-subtle truncate">{label}</dt>
            <dd className="mt-0.5 text-[14px] font-bold text-content dark:text-white truncate tabular-nums">{children}</dd>
            {sub && <dd className="text-[11px] text-content-subtle truncate mt-0.5">{sub}</dd>}
        </div>
    );

    return (
        <>
            <Modal open={open} onClose={removing ? () => {} : onClose} title={plato ? `Ficha técnica · ${toNameCase(plato.name)}` : "Ficha técnica"} width={740}
                footer={
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="sm:mr-auto text-[13px] min-w-0">
                            {lines.length > 0 && (
                                <>
                                    <span className="text-content-subtle">Costo por plato: </span>
                                    <Money value={money(costo)} className="font-bold text-content dark:text-white" />
                                    {fc != null && <span className={`ml-2 font-semibold tabular-nums ${foodCostTone(fc, meta) || "text-content dark:text-white"}`}>({fmtPct(fc)})</span>}
                                </>
                            )}
                        </div>
                        {canEdit ? (
                            <div className="flex flex-col-reverse sm:flex-row gap-2">
                                {plato?.removable && (
                                    <button type="button" onClick={() => setRemoving(true)}
                                        className="hidden sm:inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-red-500/25 text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Eliminar receta
                                    </button>
                                )}
                                <button type="button" onClick={onClose} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-semibold">Cancelar</button>
                                <Button onClick={save} className="h-10 px-5">Guardar receta</Button>
                            </div>
                        ) : (
                            <button type="button" onClick={onClose} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-semibold">Cerrar</button>
                        )}
                    </div>
                }>
                {loading || !plato ? (
                    <div className="py-16 flex justify-center"><Spinner /></div>
                ) : (
                    <div className="space-y-4">
                        <dl className="rounded-xl border border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02] px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {dato("Precio de venta", <Money value={money(precio)} />)}
                            {dato("Costo del plato", lines.length ? <Money value={money(costo)} /> : "—",
                                sinCosto ? <span className="text-amber-700 dark:text-amber-400">{sinCosto === 1 ? "1 insumo sin costo" : `${sinCosto} insumos sin costo`}</span> : null)}
                            {dato("Food cost",
                                fc != null ? <span className={foodCostTone(fc, meta) || ""}>{fmtPct(fc)}</span> : "—",
                                `Meta ${fmtPct(meta)}`)}
                            {dato("Precio sugerido", sugerido != null ? <Money value={money(sugerido)} /> : "—",
                                sugerido != null && precio > 0 ? `Margen actual: ${money(precio - costo)}` : null)}
                        </dl>

                        {!plato.is_combo && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-[12px] text-amber-900 dark:text-amber-200 leading-relaxed">
                                Al guardar esta ficha técnica, cada venta del plato descontará automáticamente estos ingredientes de la sucursal.
                            </div>
                        )}

                        <div className="rounded-xl border border-border/70 dark:border-white/[0.08] bg-surface-2/30 dark:bg-white/[0.02] p-3.5 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                                <span className="text-[13px] font-semibold text-content dark:text-white">Ingredientes por plato</span>
                                <span className="text-[11px] text-content-subtle">
                                    La merma suma lo que se pierde al limpiar o cocinar para descontar el peso bruto real.
                                </span>
                            </div>

                            {canEdit && (
                                <IngredientSearch warehouseId={warehouseId} onPick={agregar} exclude={yaEsta} autoFocus={!lines.length} />
                            )}

                            <IngredientLines lines={lines} setLines={setLines} calc={calc} canEdit={canEdit} money={money} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                            <div className="sm:col-span-9 min-w-0">
                                <label className="label flex items-center justify-between">
                                    <span>Instrucciones de preparación</span>
                                    <span className="font-normal text-[11px] text-content-subtle">Opcional</span>
                                </label>
                                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3} maxLength={4000} disabled={!canEdit}
                                    placeholder="Sellar el lomo a fuego alto, reposar 5 minutos, servir con la salsa…"
                                    className="input !h-auto py-2 resize-none" />
                            </div>
                            <div className="sm:col-span-3 min-w-0">
                                <label className="label flex items-center justify-between">
                                    <span>Tiempo</span>
                                    <span className="font-normal text-[11px] text-content-subtle">Opcional</span>
                                </label>
                                <div className="relative">
                                    <input className="input pr-12 text-right tabular-nums" inputMode="numeric" value={prep} autoComplete="off" disabled={!canEdit}
                                        placeholder="0" onChange={e => setPrep(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-content-subtle pointer-events-none">min</span>
                                </div>
                            </div>
                        </div>

                        {canEdit && plato.removable && (
                            <button type="button" onClick={() => setRemoving(true)}
                                className="sm:hidden w-full h-10 rounded-lg border border-red-500/25 text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center gap-1.5">
                                Eliminar receta
                            </button>
                        )}
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={removing}
                title="Eliminar receta"
                message="El plato deja de descontar ingredientes desde ahora. Las ventas que ya se hicieron conservan lo que descontaron."
                confirmText="Eliminar"
                onCancel={() => setRemoving(false)}
                onConfirm={async () => {
                    try {
                        await api.recipes.remove(productId);
                        notify("Receta eliminada");
                        setRemoving(false);
                        onSaved?.();
                    } catch (e) { notify(e?.message || "No se pudo eliminar la receta", "err"); }
                }}
            />
        </>
    );
}
