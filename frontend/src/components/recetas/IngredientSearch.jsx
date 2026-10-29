import { useEffect, useState } from "react";
import Money from "../ui/Money";
import Segmented from "../ui/Segmented";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useDebounce } from "../../hooks/useDebounce";
import { toNameCase, fmtBase } from "../../helpers";
import { INPUT, Field, Prefijo } from "../fabrica/shared";
import { medida, num } from "./shared";

// Buscador de insumos de la app Recetas (platos, preparaciones y tandas), con alta rápida del
// insumo cuando no existe: no hay que salir a Catálogo a mitad de la ficha.

const UNIDADES = [
    { key: "KG", label: "Kilo" },
    { key: "LITRO", label: "Litro" },
    { key: "UNIDAD", label: "Unidad" },
];

/**
 * `exclude`: Set de ids que ya están (se muestran, pero no se pueden elegir). `excludeId`: un
 * producto que no se ofrece (la preparación misma). `placeholder` para cambiar el ejemplo.
 */
export default function IngredientSearch({ warehouseId, onPick, exclude, excludeId = null, autoFocus, placeholder = "Agregar ingrediente: lomo, papa, queso…" }) {
    const { notify, baseCurrency, can } = useApp();
    const [q, setQ] = useState("");
    const dq = useDebounce(q, 250);
    const [resultados, setResultados] = useState(null);   // null = sin buscar todavía
    const [nuevo, setNuevo] = useState(null);             // null cerrado · { unit, cost }

    useEffect(() => {
        if (!dq.trim()) { setResultados(null); return; }
        let vivo = true;
        api.recipes.ingredients({ search: dq.trim(), ...(warehouseId ? { warehouse_id: warehouseId } : {}) })
            .then(r => { if (vivo) setResultados((r.data || []).filter(p => p.id !== excludeId)); })
            .catch(() => { if (vivo) setResultados([]); });
        return () => { vivo = false; };
    }, [dq, warehouseId, excludeId]);

    const elegir = (p) => { onPick(p); setQ(""); setResultados(null); setNuevo(null); };

    const crear = async () => {
        try {
            const r = await api.recipes.createIngredient({ name: q.trim(), unit: nuevo.unit, cost: num(nuevo.cost) });
            notify(`Insumo "${r.data.name}" creado`);
            elegir(r.data);
        } catch (e) { notify(e?.message || "No se pudo crear el insumo", "err"); }
    };

    const exacto = resultados?.some(p => p.name.trim().toLowerCase() === q.trim().toLowerCase());
    // Crear un insumo es tocar el catálogo: la cocina, que solo registra ollas, no lo ve.
    const ofrecerAlta = can("products.edit") && !exacto && q.trim().length >= 2 && !nuevo;
    // Sin resultados y con el alta abierta no queda nada que listar: la caja vacía no se dibuja.
    const lista = resultados && dq === q && (resultados.length > 0 || ofrecerAlta);

    return (
        <div className="space-y-2">
            <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input className={`${INPUT} pl-9`} value={q} onChange={e => { setQ(e.target.value); setNuevo(null); }} autoComplete="off" spellCheck={false}
                    placeholder={placeholder} {...(autoFocus ? { "data-autofocus": true } : {})} />
            </div>

            {lista && (
                <div className="rounded-lg border border-border/70 dark:border-white/10 divide-y divide-border/60 dark:divide-white/[0.06] overflow-hidden">
                    {resultados.length > 0 && <div className="max-h-56 overflow-y-auto divide-y divide-border/60 dark:divide-white/[0.06]">
                        {resultados.map(p => {
                            const ya = exclude?.has(p.id);
                            const m = medida(p.unit);
                            return (
                                <button key={p.id} type="button" onClick={() => elegir(p)} disabled={ya}
                                    className="w-full flex items-center gap-3 px-3 min-h-11 py-2 text-left hover:bg-surface-2 dark:hover:bg-white/[0.04] disabled:hover:bg-transparent disabled:cursor-not-allowed">
                                    <span className="flex-1 min-w-0">
                                        <span className={`block text-[13px] truncate ${ya ? "text-content-subtle" : "text-content dark:text-white"}`}>{toNameCase(p.name)}</span>
                                        <span className="block text-[12px] text-content-subtle truncate">
                                            {ya ? "Ya está en la receta" : p.is_preparation ? "Preparación de la cocina" : p.sellable ? "Producto que también se vende" : "Insumo"}
                                        </span>
                                    </span>
                                    <span className="text-[12px] text-content-subtle shrink-0 text-right whitespace-nowrap">
                                        {p.cost > 0 ? <><Money value={fmtBase(p.cost, baseCurrency)} /> / {m.por}</> : <span className="text-amber-700 dark:text-amber-400">Sin costo</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </div>}
                    {ofrecerAlta && (
                        <button type="button" onClick={() => setNuevo({ unit: "KG", cost: "" })}
                            className="w-full flex items-center gap-2 px-3 h-11 text-left text-[13px] font-medium text-brand-700 dark:text-brand-300 hover:bg-surface-2 dark:hover:bg-white/[0.04]">
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 5v14M5 12h14" /></svg>
                            <span className="truncate">Crear «{q.trim()}» como insumo</span>
                        </button>
                    )}
                </div>
            )}

            {nuevo && (
                <div className="rounded-xl border border-border/70 dark:border-white/[0.08] px-3.5 py-3 space-y-3">
                    <div className="text-[13px] font-semibold text-content dark:text-white">Nuevo insumo: {q.trim()}</div>
                    <p className="text-[12px] text-content-subtle -mt-2">No se vende en la caja. Su existencia entra por Compras, como cualquier producto.</p>
                    <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                        <Field label="Se compra por">
                            <Segmented value={nuevo.unit} onChange={u => setNuevo(n => ({ ...n, unit: u }))} options={UNIDADES} />
                        </Field>
                        <div className="sm:w-44">
                            <Field label={`Costo por ${medida(nuevo.unit).por}`} hint="Opcional">
                                <div className="relative">
                                    <Prefijo>{baseCurrency?.symbol || "Ref."}</Prefijo>
                                    <input className={`${INPUT} pl-11 tabular-nums`} inputMode="decimal" value={nuevo.cost} autoComplete="off"
                                        onChange={e => setNuevo(n => ({ ...n, cost: e.target.value.replace(/[^\d.,]/g, "") }))} placeholder="0,00" />
                                </div>
                            </Field>
                        </div>
                        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:ml-auto">
                            <button type="button" onClick={() => setNuevo(null)} className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium">Cancelar</button>
                            <Button onClick={crear} className="h-12 sm:h-10 px-4">Crear insumo</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
