import Money from "../ui/Money";
import { toNameCase } from "../../helpers";
import { INPUT, QUITAR } from "../fabrica/shared";
import { medida, num, aTexto, bruto } from "./shared";

// Las líneas de una receta, tal como se editan: lo que va (neto), la merma, lo que se gasta y
// lo que cuesta. Las usan la ficha del plato (en g y ml: lo de UN plato) y la de la preparación
// (en kg y l: lo de UNA olla), por eso la medida llega como `medidaDe`.

const XIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M6 18L18 6M6 6l12 12" /></svg>
);

// Una línea del servidor, en texto y en la unidad de la cocina.
export const aLinea = (l, medidaDe = medida) => {
    const m = medidaDe(l.unit);
    return {
        product_id: l.product_id, name: l.name, unit: l.unit, sellable: l.sellable,
        unit_cost: l.unit_cost ?? l.cost, stock: l.stock,
        neto: l.net_quantity != null ? aTexto(Math.round(l.net_quantity * m.f * 1000) / 1000) : "",
        merma: l.waste_pct ? aTexto(l.waste_pct) : "",
    };
};

// Neto y bruto en la unidad del insumo, y su costo. El bruto se redondea como en el servidor.
export const calcular = (l, medidaDe = medida) => {
    const m = medidaDe(l.unit);
    const neto = num(l.neto) / m.f;
    const gasto = bruto(neto, num(l.merma), l.unit);
    return { neto, gasto, costo: gasto * (l.unit_cost || 0) };
};

const fmtGasto = (q, unit, medidaDe) => {
    const m = medidaDe(unit);
    const v = Math.round(q * m.f * 1000) / 1000;
    return `${v.toLocaleString("es-VE", { maximumFractionDigits: m.entero ? 0 : 3 })} ${m.suf}`;
};

export default function IngredientLines({ lines, setLines, calc, canEdit, money, medidaDe = medida, netoLabel = "Al plato" }) {
    const setLine = (i, patch) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

    return (
        <>
            {lines.length > 0 && (
                <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_7rem_5.5rem_5.5rem_5.5rem_2.5rem] gap-2 px-1 pb-1.5 text-[12px] text-content-subtle">
                    <span>Ingrediente</span>
                    <span className="text-right">{netoLabel}</span>
                    <span className="text-right">Merma</span>
                    <span className="text-right">Se gasta</span>
                    <span className="text-right">Costo</span>
                    <span />
                </div>
            )}
            <div className="divide-y divide-border/60 dark:divide-white/[0.06] border-y border-border/60 dark:border-white/[0.06] sm:border-y-0">
                {lines.map((l, i) => {
                    const m = medidaDe(l.unit);
                    const c = calc[i];
                    return (
                        <div key={l.product_id} className="py-2 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_7rem_5.5rem_5.5rem_5.5rem_2.5rem] gap-x-2 gap-y-2 items-center">
                            <div className="min-w-0 px-1">
                                <div className="text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(l.name)}</div>
                                <div className="text-[12px] text-content-subtle truncate">
                                    {l.unit_cost > 0
                                        ? <><Money value={money(l.unit_cost)} /> / {m.por}</>
                                        : <span className="text-amber-700 dark:text-amber-400">Sin costo: cárgalo con una compra</span>}
                                </div>
                            </div>
                            {/* En el teléfono la X va arriba, junto al nombre; las cifras, en su renglón. */}
                            <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} disabled={!canEdit}
                                aria-label={`Quitar ${l.name}`} title={`Quitar ${l.name}`} className={`${QUITAR} sm:order-last disabled:opacity-40`}>
                                <XIcon />
                            </button>
                            <div className="col-span-2 sm:col-span-1 grid grid-cols-[7rem_5.5rem_minmax(0,1fr)] sm:contents gap-2 items-center">
                                <div className="relative">
                                    <input className={`${INPUT} pr-11 text-right tabular-nums`} inputMode={m.entero ? "numeric" : "decimal"} value={l.neto} autoComplete="off"
                                        placeholder="0" disabled={!canEdit} aria-label={`Cantidad de ${l.name}`}
                                        onChange={e => setLine(i, { neto: m.entero ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value.replace(/[^\d.,]/g, "").slice(0, 9) })} />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{m.suf}</span>
                                </div>
                                {m.merma ? (
                                    <div className="relative">
                                        <input className={`${INPUT} pr-7 text-right tabular-nums`} inputMode="decimal" value={l.merma} autoComplete="off"
                                            placeholder="0" disabled={!canEdit} aria-label={`Merma de ${l.name}`}
                                            onChange={e => setLine(i, { merma: e.target.value.replace(/[^\d.,]/g, "").slice(0, 5) })} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">%</span>
                                    </div>
                                ) : (
                                    <span className="text-right text-[12px] text-content-subtle pr-1">Sin merma</span>
                                )}
                                {/* En el teléfono no caben uno al lado del otro ("5,556 kg  Ref. 44.45"): van apilados. */}
                                <div className="flex flex-col items-end sm:contents min-w-0">
                                    <span className="text-right text-[12px] sm:text-[13px] tabular-nums text-content-muted dark:text-white/70 whitespace-nowrap">
                                        {c.neto > 0 ? fmtGasto(c.gasto, l.unit, medidaDe) : "—"}
                                    </span>
                                    <Money value={money(c.costo)} className="text-right text-[13px] text-content dark:text-white" />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
