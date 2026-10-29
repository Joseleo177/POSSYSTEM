import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import Segmented from "../ui/Segmented";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase } from "../../helpers";
import { INPUT, CARD, Field } from "../fabrica/shared";
import { medidaTanda, num, UNIDADES_PREP, fmtRinde } from "./shared";
import IngredientSearch from "./IngredientSearch";
import IngredientLines, { aLinea, calcular } from "./IngredientLines";

// Ficha de una preparación: lo que lleva UNA tanda (la olla) y cuánto rinde. Se escribe en kilos
// y litros, como se piensa una olla. El costo por unidad (por porción) es lo que la receta dice
// que debería costar; el real sale de cada tanda que se registra.
//
// `productId`: null cerrado · "new" nueva · id de la preparación.

export default function PreparationModal({ productId, warehouseId, onClose, onSaved, onProduce }) {
    const { notify, baseCurrency, can } = useApp();
    const canEdit = can("products.edit");
    const money = (n) => fmtBase(n, baseCurrency);
    const open = productId != null;
    const nueva = productId === "new";

    const [loading, setLoading] = useState(false);
    const [prep, setPrep] = useState(null);
    const [name, setName] = useState("");
    const [unit, setUnit] = useState("PORCION");
    const [rinde, setRinde] = useState("");
    const [lines, setLines] = useState([]);
    const [instructions, setInstructions] = useState("");
    const [minutos, setMinutos] = useState("");
    const [removing, setRemoving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setPrep(null); setName(""); setUnit("PORCION"); setRinde(""); setLines([]); setInstructions(""); setMinutos("");
        if (nueva) return;
        let vivo = true;
        setLoading(true);
        api.production.preparation(productId, warehouseId ? { warehouse_id: warehouseId } : {})
            .then(r => {
                if (!vivo) return;
                const d = r.data;
                setPrep(d);
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

    const agregar = (p) => setLines(ls => (ls.some(l => l.product_id === p.id) ? ls : [...ls, {
        product_id: p.id, name: p.name, unit: p.unit, sellable: p.sellable, unit_cost: p.cost, stock: p.stock, neto: "", merma: "",
    }]));

    const save = async () => {
        if (nueva && name.trim().length < 2) return notify("Escribe el nombre de la preparación", "err");
        if (!(rindeN > 0)) return notify("Escribe cuánto rinde una tanda", "err");
        if (!lines.length) return notify("Agrega al menos un ingrediente", "err");
        const vacia = lines.find((l, i) => !(calc[i].neto > 0));
        if (vacia) return notify(`Escribe cuánto lleva de "${toNameCase(vacia.name)}"`, "err");
        const body = {
            warehouse_id: warehouseId || undefined,
            batch_yield: rindeN,
            lines: lines.map((l, i) => ({ product_id: l.product_id, net_quantity: calc[i].neto, waste_pct: medidaTanda(l.unit).merma ? num(l.merma) : 0 })),
            instructions,
            prep_minutes: minutos === "" ? null : parseInt(minutos, 10),
        };
        try {
            const r = nueva
                ? await api.production.createPreparation({ ...body, name: name.trim(), unit })
                : await api.production.savePreparation(productId, body);
            notify("Preparación guardada");
            onSaved?.(r.data);
        } catch (e) { notify(e?.message || "No se pudo guardar la preparación", "err"); }
    };

    const dato = (label, children, sub) => (
        <div className="min-w-0">
            <dt className="text-[12px] text-content-subtle">{label}</dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-content dark:text-white truncate">{children}</dd>
            {sub && <dd className="text-[12px] text-content-subtle truncate">{sub}</dd>}
        </div>
    );

    const titulo = nueva ? "Nueva preparación" : prep ? toNameCase(prep.name) : "Preparación";

    return (
        <>
            <Modal open={open} onClose={removing ? () => {} : onClose} title={titulo} width={780}
                footer={
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="sm:mr-auto text-[13px] min-w-0">
                            {porUnidad != null && (
                                <>
                                    <span className="text-content-subtle">Por {unit === "PORCION" ? "porción" : unidad.suf} </span>
                                    <Money value={money(porUnidad)} className="font-semibold text-content dark:text-white" />
                                </>
                            )}
                        </div>
                        {canEdit ? (
                            <div className="flex flex-col-reverse sm:flex-row gap-2">
                                {!nueva && prep && (
                                    <button onClick={() => setRemoving(true)} className="hidden sm:inline-flex items-center h-10 px-3 rounded-lg text-[13px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400">
                                        Quitar ficha
                                    </button>
                                )}
                                <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                                <Button onClick={save} className="h-12 sm:h-10 px-5">{nueva ? "Crear preparación" : "Guardar"}</Button>
                            </div>
                        ) : (
                            <div className="flex flex-col-reverse sm:flex-row gap-2">
                                <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cerrar</button>
                                {onProduce && prep && <Button onClick={() => onProduce(prep)} className="h-12 sm:h-10 px-5">Producir</Button>}
                            </div>
                        )}
                    </div>
                }>
                {loading || (!nueva && !prep) ? (
                    <div className="py-16 flex justify-center"><Spinner /></div>
                ) : (
                    <div className="space-y-6">
                        {nueva && (
                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                                <Field label="Nombre">
                                    <input className={INPUT} value={name} onChange={e => setName(e.target.value)} maxLength={200} autoComplete="off"
                                        placeholder="Sopa de res, salsa de la casa, masa de arepa…" data-autofocus />
                                </Field>
                                <Field label="Se cuenta en">
                                    <Segmented value={unit} onChange={setUnit} options={UNIDADES_PREP.map(u => ({ key: u.key, label: u.label }))} />
                                </Field>
                            </div>
                        )}

                        <dl className={`${CARD} px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3`}>
                            <div className="min-w-0">
                                <dt className="text-[12px] text-content-subtle">Una tanda rinde</dt>
                                <dd className="mt-1 relative">
                                    <input className={`${INPUT} pr-14 text-right tabular-nums font-semibold`} inputMode={entera ? "numeric" : "decimal"} value={rinde}
                                        disabled={!canEdit} autoComplete="off" placeholder="30" aria-label="Lo que rinde una tanda"
                                        onChange={e => setRinde(entera ? e.target.value.replace(/\D/g, "").slice(0, 5) : e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))} />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{unidad.suf}</span>
                                </dd>
                            </div>
                            {dato("Costo de la tanda", lines.length ? <Money value={money(costoTanda)} /> : "—")}
                            {dato(`Por ${unit === "PORCION" ? "porción" : unidad.suf}`, porUnidad != null ? <Money value={money(porUnidad)} /> : "—",
                                prep?.last_cost != null ? <>Última tanda <Money value={money(prep.last_cost)} /></> : null)}
                            {dato("Hay en la sucursal", prep?.stock != null ? fmtRinde(prep.stock, unit) : "—",
                                prep?.used_in?.length ? `En ${prep.used_in.length === 1 ? "1 plato" : `${prep.used_in.length} platos`}` : null)}
                        </dl>

                        <section>
                            <div className="mb-2">
                                <h3 className="text-[14px] font-semibold text-content dark:text-white">Lo que lleva una tanda</h3>
                                <p className="text-[12px] text-content-subtle">
                                    En kilos y litros, como se mide la olla. Al registrar cada tanda se anota lo que se usó de verdad.
                                </p>
                            </div>
                            <IngredientLines lines={lines} setLines={setLines} calc={calc} canEdit={canEdit} money={money}
                                medidaDe={medidaTanda} netoLabel="Lleva" />
                            {canEdit && (
                                <div className="mt-3">
                                    <IngredientSearch warehouseId={warehouseId} onPick={agregar} exclude={yaEsta} excludeId={prep?.product_id ?? null}
                                        placeholder="Agregar ingrediente: carne, papa, auyama…" />
                                </div>
                            )}
                        </section>

                        {prep?.used_in?.length > 0 && (
                            <p className="text-[12px] text-content-subtle">
                                La llevan: {prep.used_in.map(u => toNameCase(u.name)).join(", ")}.
                            </p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-4">
                            <Field label="Cómo se hace" hint="Opcional">
                                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={4} maxLength={4000} disabled={!canEdit}
                                    placeholder="Sofreír el aliño, agregar la carne y el agua, hervir 2 horas…"
                                    className={`${INPUT} h-auto py-2 resize-none`} />
                            </Field>
                            <Field label="Tiempo" hint="Opcional">
                                <div className="relative">
                                    <input className={`${INPUT} pr-12 text-right tabular-nums`} inputMode="numeric" value={minutos} autoComplete="off" disabled={!canEdit}
                                        placeholder="0" onChange={e => setMinutos(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">min</span>
                                </div>
                            </Field>
                        </div>

                        {canEdit && !nueva && prep && (
                            <button onClick={() => setRemoving(true)} className="sm:hidden w-full h-12 rounded-lg text-[13px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400">
                                Quitar ficha
                            </button>
                        )}
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={removing}
                title="Quitar ficha de preparación"
                message="Deja de ser preparación: se borra lo que lleva una tanda. El producto, su existencia y las tandas ya hechas se quedan."
                confirmText="Quitar"
                onCancel={() => setRemoving(false)}
                onConfirm={async () => {
                    try {
                        await api.production.removePreparation(productId);
                        notify("Ficha quitada");
                        setRemoving(false);
                        onSaved?.();
                    } catch (e) { notify(e?.message || "No se pudo quitar la ficha", "err"); }
                }}
            />
        </>
    );
}
