import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import CustomSelect from "../ui/CustomSelect";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase } from "../../helpers";
import { INPUT, QUITAR, CARD, Field } from "../fabrica/shared";
import { medidaTanda, num, aTexto, fmtRinde, UNIDADES_PREP } from "./shared";
import IngredientSearch from "./IngredientSearch";

// Registrar una tanda: "hice una olla de sopa". Arranca con lo que pide la receta (× las tandas)
// y la cocina corrige lo que de verdad usó y los platos que de verdad salieron. Al guardar se
// descuentan los insumos de la sucursal y entra lo que salió, con su costo real.
//
// Se abre desde Recetas (Preparaciones y Producción) y desde la pantalla de Cocina.
// `initial`: la preparación ya elegida ({ product_id }) o null para elegirla aquí.

const r3 = (n) => Math.round(n * 1000) / 1000;
const XIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M6 18L18 6M6 6l12 12" /></svg>
);

export default function BatchFormModal({ open, initial = null, warehouseId = "", warehouses = [], onClose, onSaved }) {
    const { notify, baseCurrency } = useApp();
    const money = (n) => fmtBase(n, baseCurrency);

    const [preps, setPreps] = useState(null);
    const [prepId, setPrepId] = useState("");
    const [prep, setPrep] = useState(null);
    const [loadingPrep, setLoadingPrep] = useState(false);
    const [almacen, setAlmacen] = useState("");
    const [tandas, setTandas] = useState("1");
    const [lines, setLines] = useState([]);       // { product_id, name, unit, unit_cost, receta, usado, tocado }
    const [salio, setSalio] = useState("");
    const [salioTocado, setSalioTocado] = useState(false);
    const [notes, setNotes] = useState("");

    // Al abrir: la sucursal y la lista de preparaciones.
    useEffect(() => {
        if (!open) return;
        setPrep(null); setLines([]); setTandas("1"); setSalio(""); setSalioTocado(false); setNotes("");
        setPrepId(initial?.product_id ? String(initial.product_id) : "");
        setAlmacen(warehouseId ? String(warehouseId) : (warehouses.length === 1 ? String(warehouses[0].id) : ""));
        let vivo = true;
        api.production.preparations(warehouseId ? { warehouse_id: warehouseId } : {})
            .then(r => {
                if (!vivo) return;
                const lista = r.data || [];
                setPreps(lista);
                // Con una sola preparación no hay nada que elegir.
                if (!initial?.product_id && lista.length === 1) setPrepId(String(lista[0].product_id));
            })
            .catch(e => { if (vivo) { setPreps([]); notify(e?.message || "No se pudieron cargar las preparaciones", "err"); } });
        return () => { vivo = false; };
    }, [open]);

    // La receta de la preparación elegida, con los costos de la sucursal.
    useEffect(() => {
        if (!open || !prepId) { setPrep(null); setLines([]); return; }
        let vivo = true;
        setLoadingPrep(true);
        api.production.preparation(prepId, almacen ? { warehouse_id: almacen } : {})
            .then(r => {
                if (!vivo) return;
                const d = r.data;
                setPrep(d);
                const t = num(tandas) || 1;
                setLines((d.lines || []).map(l => ({
                    product_id: l.product_id, name: l.name, unit: l.unit, unit_cost: l.unit_cost,
                    receta: l.quantity, usado: aTexto(r3(l.quantity * t)), tocado: false,
                })));
                if (!salioTocado) setSalio(aTexto(r3(d.batch_yield * t)));
            })
            .catch(e => { if (vivo) notify(e?.message || "No se pudo abrir la preparación", "err"); })
            .finally(() => { if (vivo) setLoadingPrep(false); });
        return () => { vivo = false; };
    }, [open, prepId, almacen]);

    // Cambiar las tandas recalcula lo que nadie corrigió a mano.
    const cambiarTandas = (txt) => {
        setTandas(txt);
        const t = num(txt);
        if (!(t > 0)) return;
        setLines(ls => ls.map(l => (l.tocado || l.receta == null ? l : { ...l, usado: aTexto(r3(l.receta * t)) })));
        if (prep && !salioTocado) setSalio(aTexto(r3(prep.batch_yield * t)));
    };

    const setLine = (i, patch) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch, tocado: true } : l)));
    const agregar = (p) => setLines(ls => (ls.some(l => l.product_id === p.id) ? ls : [...ls, {
        product_id: p.id, name: p.name, unit: p.unit, unit_cost: p.cost, receta: null, usado: "", tocado: true,
    }]));
    const yaEsta = useMemo(() => new Set(lines.map(l => l.product_id)), [lines]);

    const t = num(tandas);
    const costo = lines.reduce((a, l) => a + num(l.usado) * (l.unit_cost || 0), 0);
    const salioN = num(salio);
    const esperado = prep && t > 0 ? r3(prep.batch_yield * t) : null;
    const porUnidad = salioN > 0 ? costo / salioN : null;
    const falto = esperado != null && salioN > 0 ? r3(esperado - salioN) : 0;
    const unit = prep?.unit || "PORCION";
    const suf = (UNIDADES_PREP.find(u => u.key === unit) || UNIDADES_PREP[0]).suf;
    const entera = unit === "PORCION" || unit === "UNIDAD";

    const save = async () => {
        if (!prepId) return notify("Elige qué se preparó", "err");
        if (!almacen) return notify("Elige la sucursal", "err");
        if (!(t > 0)) return notify("Escribe cuántas tandas", "err");
        if (!(salioN > 0)) return notify("Escribe cuánto salió", "err");
        const usadas = lines.filter(l => num(l.usado) > 0);
        if (!usadas.length) return notify("Di qué se usó", "err");
        try {
            const r = await api.production.createBatch({
                product_id: Number(prepId), warehouse_id: Number(almacen), batches: t, actual_yield: salioN, notes,
                lines: usadas.map(l => ({ product_id: l.product_id, actual_qty: num(l.usado) })),
            });
            notify(`${r.data.code} registrada: ${fmtRinde(r.data.actual_yield, r.data.unit)} de ${toNameCase(r.data.product_name)}`);
            onSaved?.(r.data);
        } catch (e) { notify(e?.message || "No se pudo registrar la producción", "err"); }
    };

    const sinPreps = preps && preps.length === 0;

    return (
        <Modal open={open} onClose={onClose} title="Registrar producción" width={720}
            footer={
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="sm:mr-auto text-[13px] min-w-0">
                        {porUnidad != null && lines.length > 0 && (
                            <>
                                <span className="text-content-subtle">Sale a </span>
                                <Money value={money(porUnidad)} className="font-semibold text-content dark:text-white" />
                                <span className="text-content-subtle"> por {unit === "PORCION" ? "porción" : suf}</span>
                            </>
                        )}
                    </div>
                    <div className="flex flex-col-reverse sm:flex-row gap-2">
                        <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                        {!sinPreps && <Button onClick={save} className="h-12 sm:h-10 px-5">Registrar</Button>}
                    </div>
                </div>
            }>
            {!preps ? (
                <div className="py-16 flex justify-center"><Spinner /></div>
            ) : sinPreps ? (
                <div className="py-12 text-center px-6">
                    <div className="text-[14px] font-semibold text-content dark:text-white">No hay preparaciones</div>
                    <div className="text-[13px] text-content-subtle mt-1">Créalas en Recetas → Preparaciones: qué lleva una olla y cuánto rinde.</div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem] gap-3">
                        <Field label="Qué se preparó">
                            <CustomSelect value={prepId} onChange={setPrepId} placeholder="Elegir preparación"
                                options={preps.map(p => ({ value: String(p.product_id), label: toNameCase(p.name) }))} />
                        </Field>
                        <Field label="Tandas">
                            <input className={`${INPUT} text-right tabular-nums`} inputMode="decimal" value={tandas} autoComplete="off"
                                onChange={e => cambiarTandas(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} aria-label="Cuántas tandas" />
                        </Field>
                    </div>
                    {!warehouseId && warehouses.length > 1 && (
                        <Field label="Sucursal">
                            <CustomSelect value={almacen} onChange={setAlmacen} placeholder="Elegir sucursal"
                                options={warehouses.map(w => ({ value: String(w.id), label: w.name }))} />
                        </Field>
                    )}

                    {loadingPrep ? (
                        <div className="py-10 flex justify-center"><Spinner /></div>
                    ) : prep && (
                        <>
                            {/* Lo que salió: el dato que más importa, arriba. */}
                            <div className={`${CARD} px-4 py-3 grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-x-4 gap-y-2 items-center`}>
                                <Field label="Salieron">
                                    <div className="relative">
                                        <input className={`${INPUT} pr-14 text-right tabular-nums font-semibold`} inputMode={entera ? "numeric" : "decimal"} value={salio}
                                            autoComplete="off" aria-label="Cuánto salió"
                                            onChange={e => { setSalioTocado(true); setSalio(entera ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value.replace(/[^\d.,]/g, "").slice(0, 9)); }} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{suf}</span>
                                    </div>
                                </Field>
                                <div className="text-[13px] sm:pt-5">
                                    {esperado != null && (
                                        falto > 0
                                            ? <span className="text-amber-700 dark:text-amber-400">La receta da {fmtRinde(esperado, unit)}: salieron {fmtRinde(falto, unit)} menos.</span>
                                            : <span className="text-content-subtle">La receta da {fmtRinde(esperado, unit)}.</span>
                                    )}
                                </div>
                            </div>

                            <section>
                                <div className="mb-2">
                                    <h3 className="text-[14px] font-semibold text-content dark:text-white">Lo que se usó</h3>
                                    <p className="text-[12px] text-content-subtle">Ya viene lo de la receta. Corrige lo que se echó de más o de menos.</p>
                                </div>
                                <div className="divide-y divide-border/60 dark:divide-white/[0.06] border-y border-border/60 dark:border-white/[0.06]">
                                    {lines.map((l, i) => {
                                        const m = medidaTanda(l.unit);
                                        const distinto = l.receta != null && Math.abs(num(l.usado) - r3(l.receta * (t || 0))) > 0.0005;
                                        return (
                                            <div key={l.product_id} className="py-2 flex items-center gap-2">
                                                <div className="flex-1 min-w-0 px-1">
                                                    <div className="text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(l.name)}</div>
                                                    <div className={`text-[12px] truncate ${distinto ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                                                        {l.receta == null ? "No está en la receta" : `Receta ${aTexto(r3(l.receta * (t || 0)))} ${m.suf}`}
                                                    </div>
                                                </div>
                                                <div className="relative w-28 shrink-0">
                                                    <input className={`${INPUT} pr-10 text-right tabular-nums`} inputMode={m.entero ? "numeric" : "decimal"} value={l.usado} autoComplete="off"
                                                        placeholder="0" aria-label={`Cuánto se usó de ${l.name}`}
                                                        onChange={e => setLine(i, { usado: m.entero ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value.replace(/[^\d.,]/g, "").slice(0, 9) })} />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{m.suf}</span>
                                                </div>
                                                <Money value={money(num(l.usado) * (l.unit_cost || 0))} className="hidden sm:block w-20 text-right text-[13px] text-content dark:text-white shrink-0" />
                                                <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                                                    aria-label={`Quitar ${l.name}`} title={`Quitar ${l.name}`} className={QUITAR}>
                                                    <XIcon />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-3">
                                    <IngredientSearch warehouseId={almacen} onPick={agregar} exclude={yaEsta} excludeId={prep.product_id}
                                        placeholder="¿Le echaste algo más? Búscalo aquí" />
                                </div>
                                <div className="mt-3 flex items-baseline justify-between text-[13px]">
                                    <span className="text-content-subtle">Costo de lo que se usó</span>
                                    <Money value={money(costo)} className="font-semibold text-content dark:text-white" />
                                </div>
                            </section>

                            <Field label="Nota" hint="Opcional">
                                <input className={INPUT} value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} autoComplete="off"
                                    placeholder="Se quemó el fondo, se hizo media olla…" />
                            </Field>
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
}
