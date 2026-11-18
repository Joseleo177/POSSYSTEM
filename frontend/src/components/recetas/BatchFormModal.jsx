import { useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import CustomSelect from "../ui/CustomSelect";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase } from "../../helpers";
import { medidaTanda, num, aTexto, fmtRinde, UNIDADES_PREP } from "./shared";
import IngredientSearch from "./IngredientSearch";

// Registrar una tanda: "hice una olla de sopa". Arranca con lo que pide la receta (× las tandas)
// y la cocina corrige lo que de verdad usó y los platos que de verdad salieron.

const r3 = (n) => Math.round(n * 1000) / 1000;
const TrashIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
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
                if (!initial?.product_id && lista.length === 1) setPrepId(String(lista[0].product_id));
            })
            .catch(e => { if (vivo) { setPreps([]); notify(e?.message || "No se pudieron cargar las preparaciones", "err"); } });
        return () => { vivo = false; };
    }, [open]);

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
    const unit = prep?.unit || "UNIDAD";
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
                                <Money value={money(porUnidad)} className="font-bold text-content dark:text-white" />
                                <span className="text-content-subtle"> por {unit === "PORCION" ? "porción" : suf}</span>
                            </>
                        )}
                    </div>
                    <div className="flex flex-col-reverse sm:flex-row gap-2">
                        <button type="button" onClick={onClose} className="btn-outline h-10 px-5 rounded-lg text-[13px] font-semibold">Cancelar</button>
                        {!sinPreps && <Button onClick={save} className="h-10 px-5">Registrar producción</Button>}
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
                <div className="space-y-4">
                    {/* ── Cabecera de campos alineados en grilla de 12 columnas ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                        <div className={prep ? "sm:col-span-6 min-w-0" : "sm:col-span-9 min-w-0"}>
                            <label className="label">¿Qué se preparó?</label>
                            <CustomSelect value={prepId} onChange={setPrepId} placeholder="Elegir preparación"
                                options={preps.map(p => ({ value: String(p.product_id), label: toNameCase(p.name) }))}
                                className="w-full" />
                        </div>
                        <div className="sm:col-span-3 min-w-0">
                            <label className="label">Tandas</label>
                            <input className="input text-right tabular-nums font-semibold" inputMode="decimal" value={tandas} autoComplete="off"
                                onChange={e => cambiarTandas(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))} aria-label="Cuántas tandas" />
                        </div>
                        {prep && (
                            <div className="sm:col-span-3 min-w-0">
                                <label className="label flex items-center justify-between gap-1">
                                    <span>Salieron</span>
                                    {esperado != null && (
                                        <span className={`font-normal text-[11px] truncate ${falto > 0 ? "text-amber-600 dark:text-amber-400" : "text-content-subtle"}`}>
                                            Receta: {aTexto(esperado)} {suf}
                                        </span>
                                    )}
                                </label>
                                <div className="relative">
                                    <input className="input pr-12 text-right tabular-nums font-semibold" inputMode={entera ? "numeric" : "decimal"} value={salio}
                                        autoComplete="off" aria-label="Cuánto salió"
                                        onChange={e => { setSalioTocado(true); setSalio(entera ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value.replace(/[^\d.,]/g, "").slice(0, 9)); }} />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-content-subtle pointer-events-none">{suf}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {!warehouseId && warehouses.length > 1 && (
                        <div>
                            <label className="label">Sucursal</label>
                            <CustomSelect value={almacen} onChange={setAlmacen} placeholder="Elegir sucursal"
                                options={warehouses.map(w => ({ value: String(w.id), label: w.name }))}
                                className="w-full" />
                        </div>
                    )}

                    {loadingPrep ? (
                        <div className="py-10 flex justify-center"><Spinner /></div>
                    ) : prep && (
                        <>
                            {/* ── Insumos usados en la tanda ── */}
                            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] bg-surface-2/30 dark:bg-white/[0.02] p-3.5 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                                    <span className="text-[13px] font-semibold text-content dark:text-white">Lo que se usó</span>
                                    <span className="text-[11px] text-content-subtle">Ya viene lo de la receta. Corrige lo que se usó de más o de menos.</span>
                                </div>

                                <IngredientSearch warehouseId={almacen} onPick={agregar} exclude={yaEsta} excludeId={prep.product_id}
                                    placeholder="¿Usaste algún otro ingrediente? Búscalo aquí…" />

                                <div className="rounded-lg border border-border/70 dark:border-white/[0.07] overflow-hidden bg-white dark:bg-[#12141a]/60">
                                    <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_7rem_8rem_6.5rem_2rem] gap-2.5 items-center px-3 py-2 bg-surface-2 dark:bg-white/[0.03] border-b border-border/60 dark:border-white/[0.06] text-[10px] font-semibold uppercase tracking-[0.06em] text-content-subtle">
                                        <span>Insumo</span>
                                        <span className="text-right">Seg. receta</span>
                                        <span className="text-center">Se usó</span>
                                        <span className="text-right">Costo</span>
                                        <span />
                                    </div>
                                    <div className="divide-y divide-border/50 dark:divide-white/[0.05]">
                                        {lines.map((l, i) => {
                                            const m = medidaTanda(l.unit);
                                            const distinto = l.receta != null && Math.abs(num(l.usado) - r3(l.receta * (t || 0))) > 0.0005;
                                            return (
                                                <div key={l.product_id} className="px-3 py-2.5 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_7rem_8rem_6.5rem_2rem] gap-x-2.5 gap-y-2 items-center">
                                                    <div className="min-w-0">
                                                        <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(l.name)}</div>
                                                        <div className={`sm:hidden text-[11px] truncate ${distinto ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                                                            {l.receta == null ? "Extra fuera de receta" : `Receta: ${aTexto(r3(l.receta * (t || 0)))} ${m.suf}`}
                                                        </div>
                                                    </div>
                                                    <span className={`hidden sm:block text-right text-[12px] tabular-nums ${distinto ? "text-amber-700 dark:text-amber-400 font-medium" : "text-content-subtle"}`}>
                                                        {l.receta == null ? "Extra" : `${aTexto(r3(l.receta * (t || 0)))} ${m.suf}`}
                                                    </span>
                                                    <div className="relative">
                                                        <input className="input !h-9 pr-11 text-right tabular-nums font-semibold" inputMode={m.entero ? "numeric" : "decimal"} value={l.usado} autoComplete="off"
                                                            placeholder="0" aria-label={`Cuánto se usó de ${l.name}`}
                                                            onChange={e => setLine(i, { usado: m.entero ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value.replace(/[^\d.,]/g, "").slice(0, 9) })} />
                                                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-content-subtle pointer-events-none">{m.suf}</span>
                                                    </div>
                                                    <Money value={money(num(l.usado) * (l.unit_cost || 0))} className="hidden sm:block text-right text-[13px] font-semibold text-content dark:text-white tabular-nums" />
                                                    <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                                                        aria-label={`Quitar ${l.name}`} title={`Quitar ${l.name}`}
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:text-red-500 hover:bg-red-500/10 transition-colors">
                                                        <TrashIcon />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="px-3 py-2.5 bg-surface-2/60 dark:bg-white/[0.02] border-t border-border/60 dark:border-white/[0.06] flex items-center justify-between text-[12px]">
                                        <span className="font-medium text-content-subtle">Costo total de lo que se usó</span>
                                        <Money value={money(costo)} className="text-[13px] font-bold text-content dark:text-white tabular-nums" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="label flex items-center justify-between">
                                    <span>Nota de producción</span>
                                    <span className="font-normal text-[11px] text-content-subtle">Opcional</span>
                                </label>
                                <input className="input" value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} autoComplete="off"
                                    placeholder="Ej. Rendimiento mayor por tamaño del lote, merma en cocción…" />
                            </div>
                        </>
                    )}
                </div>
            )}
        </Modal>
    );
}
