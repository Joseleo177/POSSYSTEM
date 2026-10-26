import { useState, useEffect } from "react";
import { api } from "../../services/api";
import CustomSelect from "../../components/ui/CustomSelect";
import Segmented from "../../components/ui/Segmented";
import { fmtNumber, todayISO } from "../../helpers";
import { buildFinanceExcel } from "../../helpers/excel";
import { useReport, DateRangePicker, SectionHeader, Loading, ExportButton, KpiCard } from "./reportes.utils";

// Ingresos y egresos del período: el resumen de finanzas mensual que las tiendas llevaban en
// Excel. Ingresos por día y forma de pago (neto del vuelto), egresos uno por uno (compras,
// gastos y devoluciones, sin el vuelto) y la relación entre los dos.

const VISTAS = [
    { key: "ingresos", label: "Ingresos por día" },
    { key: "egresos",  label: "Egresos" },
];

const TIPOS = [
    { key: "",           label: "Todos" },
    { key: "compra",     label: "Compras" },
    { key: "gasto",      label: "Gastos" },
    { key: "devolucion", label: "Devoluciones" },
];
const TIPO_LABEL = { compra: "Compra", gasto: "Gasto", devolucion: "Devolución" };

// Del primero del mes a hoy: el corte con que se arma el resumen mensual.
function mesEnCurso() {
    const hoy = todayISO();
    return { from: `${hoy.slice(0, 8)}01`, to: hoy };
}

const fecha = (iso) => String(iso || "").split("-").reverse().join("/");
const pctFmt = (r) => r == null ? "—" : `${fmtNumber(r * 100, r < 0.001 && r > 0 ? 2 : 1)} %`;

const TH = ({ children, right }) => <th className={`px-4 whitespace-nowrap ${right ? "text-right" : ""}`}>{children}</th>;

// Fila de la vista móvil (mismo patrón que InventoryReport): título a todo el ancho y las
// cifras debajo con su rótulo.
const MobileRow = ({ title, sub, right, metrics }) => (
    <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <div className="text-[13px] font-semibold leading-snug break-words text-content dark:text-white">{title}</div>
                {sub && <div className="text-[12px] text-content-subtle mt-0.5 break-words">{sub}</div>}
            </div>
            {right && <div className="shrink-0 text-right">{right}</div>}
        </div>
        {metrics?.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {metrics.map(m => (
                    <div key={m.label} className="min-w-0">
                        <div className="text-[12px] text-content-subtle truncate">{m.label}</div>
                        <div className="text-[13px] tabular-nums font-semibold text-content dark:text-white truncate">{m.value}</div>
                    </div>
                ))}
            </div>
        )}
    </div>
);

// Total de una forma de pago: lo que se cuenta contra el banco o la gaveta.
function MethodTotals({ items }) {
    if (!items.length) return null;
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
            {items.map(it => (
                <div key={it.id} className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-3 py-2.5 min-w-0">
                    <div className="text-[12px] text-content-subtle truncate">{it.label}</div>
                    <div className="text-[15px] font-semibold text-content dark:text-white tabular-nums truncate">{it.value}</div>
                    {it.sub && <div className="text-[12px] text-content-subtle tabular-nums truncate">{it.sub}</div>}
                </div>
            ))}
        </div>
    );
}

export default function FinanceReport() {
    const [range, setRange] = useState(mesEnCurso);
    const [vista, setVista] = useState("ingresos");
    const [tipo, setTipo] = useState("");
    const [warehouseId, setWarehouseId] = useState("");
    const [warehouses, setWarehouses] = useState([]);

    useEffect(() => {
        api.warehouses.getAll().then(r => setWarehouses((r.data || []).filter(w => w.sells !== false))).catch(() => setWarehouses([]));
    }, []);
    const todasLabel = warehouses.length === 1 ? warehouses[0].name : "Todas las sucursales";

    const { data, loading, error } = useReport(
        api.reports.finance,
        { date_from: range.from, date_to: range.to, warehouse_id: warehouseId },
        [range.from, range.to, warehouseId]
    );

    const baseSym  = data?.base_symbol || "Ref.";
    const localSym = data?.local_symbol || "Bs.";
    const fmtB = (n) => `${baseSym} ${fmtNumber(n || 0, 2)}`;
    const fmtL = (n) => `${localSym} ${fmtNumber(n || 0, 2)}`;
    const fmtC = (n, sym) => `${sym} ${fmtNumber(n || 0, 2)}`;

    const s       = data?.summary;
    const columns = data?.income?.columns ?? [];
    const days    = data?.income?.days ?? [];
    const totals  = data?.income?.totals;
    const hayOtros = (totals?.other?.tx_count || 0) > 0;
    const egresos = (data?.expenses?.rows ?? []).filter(e => !tipo || e.kind === tipo);
    const totalFiltrado = egresos.reduce((a, e) => a + e.amount_base, 0);

    const warehouseName = warehouses.find(w => String(w.id) === warehouseId)?.name;

    const documento = (e) => e.doc_number
        ? `${e.doc_type ? `${e.doc_type} ` : ""}${e.doc_number}`
        : (e.doc_text || "—");
    const caja = (e) => [e.method_name, e.bank_name || e.journal_name].filter(Boolean).join(" · ") || "—";

    return (
        <div className="lg:h-full flex flex-col space-y-4 lg:overflow-hidden">
            <div className="shrink-0 flex flex-wrap items-center gap-2">
                <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
                {warehouses.length > 1 && (
                    <CustomSelect
                        value={warehouseId}
                        onChange={setWarehouseId}
                        placeholder={todasLabel}
                        height="h-9"
                        boxClassName="min-w-[190px]"
                        options={[
                            { value: "", label: todasLabel },
                            ...warehouses.map(w => ({ value: String(w.id), label: w.name })),
                        ]}
                    />
                )}
                <div className="ml-auto">
                    {data && (days.length > 0 || data.expenses.rows.length > 0) && (
                        <ExportButton onClick={() => buildFinanceExcel(data, { ...range, warehouse_name: warehouseName })} />
                    )}
                </div>
            </div>

            {loading && !data && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
            {error && (
                <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-semibold">{error}</div>
            )}

            {data && (
                <div className={`lg:flex-1 lg:min-h-0 flex flex-col space-y-3 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
                        <KpiCard label="Ingresos" value={fmtB(s.income_base)} sub={fmtL(s.income_local)} />
                        <KpiCard label="Egresos" value={fmtB(s.expense_base)} sub={`${data.expenses.rows.length} movimientos`} />
                        <KpiCard label="Egresos sobre ingresos" value={pctFmt(s.expense_ratio)} sub={`Resultado ${fmtB(s.net_base)}`} />
                        <KpiCard label="Tasa promedio" value={s.avg_rate ? fmtNumber(s.avg_rate, 2) : "—"} sub={`${localSym} por cada ${baseSym} de ingreso`} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <div className="overflow-x-auto scrollbar-hide">
                            <Segmented value={vista} onChange={setVista} options={VISTAS} />
                        </div>
                        {vista === "egresos" && (
                            <div className="overflow-x-auto scrollbar-hide">
                                <Segmented value={tipo} onChange={setTipo} options={TIPOS.map(t => ({ ...t, count: t.key ? (data.expenses.by_kind[t.key]?.count || 0) : data.expenses.rows.length }))} />
                            </div>
                        )}
                    </div>

                    {vista === "ingresos" ? (
                        <>
                            <div className="shrink-0">
                                <MethodTotals items={[
                                    ...columns.map(c => {
                                        const t = totals?.cells?.[c.id];
                                        return { id: c.id, label: c.label, value: fmtC(t?.amount_journal, c.is_base ? baseSym : c.currency_symbol), sub: c.is_base ? null : fmtB(t?.amount_base) };
                                    }),
                                    ...(hayOtros ? [{ id: "otros", label: "Otros ingresos", value: fmtB(totals.other.amount_base) }] : []),
                                ]} />
                            </div>

                            <div className="lg:flex-1 lg:min-h-0 flex flex-col bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none overflow-hidden">
                                <div className="px-4 pt-4 shrink-0">
                                    <SectionHeader
                                        title="Ingresos por día y forma de pago"
                                        sub={[
                                            s.change_base > 0
                                                ? `Cobros de ventas menos el vuelto entregado (${fmtB(s.change_base)} en el período)`
                                                : "Cobros de ventas por la fecha en que entró el dinero",
                                            // El avance sale de la columna del efectivo y entra en la del punto con su comisión.
                                            s.advance_out_base > 0
                                                // El que va en una factura entra con su cobro; solo el suelto tiene ingreso propio.
                                                ? `avances de efectivo: ${fmtB(s.advance_out_base)} salieron en billetes${s.advance_in_base > 0 ? ` y ${fmtB(s.advance_in_base)} entraron sin factura` : ""}`
                                                : null,
                                        ].filter(Boolean).join("; ")}
                                    />
                                </div>

                                {days.length === 0 ? (
                                    <div className="px-4 py-16 text-center text-[13px] text-content-subtle">Sin ingresos en el período</div>
                                ) : (
                                    <>
                                        <div className="lg:hidden divide-y divide-border/60 dark:divide-white/[0.06] border-t border-border/60 dark:border-white/[0.06]">
                                            {days.map(d => (
                                                <MobileRow
                                                    key={d.date}
                                                    title={fecha(d.date)}
                                                    sub={d.rate ? `Tasa ${fmtNumber(d.rate, 2)}${d.rate_inferred ? " (del día anterior)" : ""}` : null}
                                                    right={<>
                                                        <div className="text-[13px] font-semibold text-content dark:text-white tabular-nums">{fmtB(d.total_base)}</div>
                                                        <div className="text-[12px] text-content-subtle tabular-nums">{fmtL(d.total_local)}</div>
                                                    </>}
                                                    metrics={[
                                                        ...columns.filter(c => d.cells[c.id]).map(c => ({
                                                            label: c.label,
                                                            value: fmtC(d.cells[c.id].amount_journal, c.is_base ? baseSym : c.currency_symbol),
                                                        })),
                                                        ...(d.other.amount_base ? [{ label: "Otros ingresos", value: fmtB(d.other.amount_base) }] : []),
                                                    ]}
                                                />
                                            ))}
                                        </div>

                                        <div className="hidden lg:block flex-1 min-h-0 overflow-auto">
                                            <table className="table-ledger">
                                                <thead className="sticky top-0 z-10">
                                                    <tr>
                                                        <TH>Fecha</TH>
                                                        <TH right>Tasa</TH>
                                                        {columns.map(c => <TH key={c.id} right>{c.label}</TH>)}
                                                        {hayOtros && <TH right>Otros ingresos</TH>}
                                                        <TH right>Total {localSym}</TH>
                                                        <TH right>Total {baseSym}</TH>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {days.map(d => (
                                                        <tr key={d.date}>
                                                            <td className="px-4 font-semibold tabular-nums whitespace-nowrap">{fecha(d.date)}</td>
                                                            <td className={`px-4 text-right tabular-nums whitespace-nowrap ${d.rate_inferred ? "text-content-subtle" : ""}`} title={d.rate_inferred ? "Sin cobros en Bs ese día: tasa del día anterior" : undefined}>
                                                                {d.rate ? fmtNumber(d.rate, 2) : "—"}
                                                            </td>
                                                            {columns.map(c => {
                                                                const cell = d.cells[c.id];
                                                                return (
                                                                    <td key={c.id} className="px-4 text-right tabular-nums whitespace-nowrap">
                                                                        {cell ? fmtNumber(cell.amount_journal, 2) : <span className="text-content-subtle/50">—</span>}
                                                                    </td>
                                                                );
                                                            })}
                                                            {hayOtros && (
                                                                <td className="px-4 text-right tabular-nums whitespace-nowrap">
                                                                    {d.other.amount_base ? fmtNumber(d.other.amount_base, 2) : <span className="text-content-subtle/50">—</span>}
                                                                </td>
                                                            )}
                                                            <td className="px-4 text-right tabular-nums whitespace-nowrap">{fmtNumber(d.total_local, 2)}</td>
                                                            <td className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">{fmtNumber(d.total_base, 2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="sticky bottom-0">
                                                    <tr>
                                                        <td className="px-4 font-semibold">Total</td>
                                                        <td className="px-4 text-right tabular-nums text-content-subtle">{s.avg_rate ? fmtNumber(s.avg_rate, 2) : ""}</td>
                                                        {columns.map(c => (
                                                            <td key={c.id} className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">
                                                                {fmtNumber(totals?.cells?.[c.id]?.amount_journal, 2)}
                                                            </td>
                                                        ))}
                                                        {hayOtros && <td className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">{fmtNumber(totals.other.amount_base, 2)}</td>}
                                                        <td className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">{fmtNumber(totals?.total_local, 2)}</td>
                                                        <td className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">{fmtNumber(totals?.total_base, 2)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="shrink-0">
                                <MethodTotals items={(data.expenses.by_method || []).map(m => ({
                                    id: m.id,
                                    label: `${m.method_name}${m.is_base ? "" : ` ${m.currency_symbol}`}`,
                                    value: fmtC(m.amount_journal, m.is_base ? baseSym : m.currency_symbol),
                                    sub: m.is_base ? `${m.count} mov.` : fmtB(m.amount_base),
                                }))} />
                            </div>

                            <div className="lg:flex-1 lg:min-h-0 flex flex-col bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none overflow-hidden">
                                <div className="px-4 pt-4 shrink-0">
                                    <SectionHeader
                                        title="Egresos del período"
                                        sub="Pagos a proveedores, gastos y devoluciones. El vuelto no cuenta: ya se restó del ingreso"
                                        right={<div className="text-right shrink-0">
                                            <div className="text-[15px] font-semibold text-content dark:text-white tabular-nums">{fmtB(totalFiltrado)}</div>
                                            <div className="text-[12px] text-content-subtle">{egresos.length} movimientos</div>
                                        </div>}
                                    />
                                </div>

                                {egresos.length === 0 ? (
                                    <div className="px-4 py-16 text-center text-[13px] text-content-subtle">Sin egresos en el período</div>
                                ) : (
                                    <>
                                        <div className="lg:hidden divide-y divide-border/60 dark:divide-white/[0.06] border-t border-border/60 dark:border-white/[0.06]">
                                            {egresos.map(e => (
                                                <MobileRow
                                                    key={e.id}
                                                    title={e.description || TIPO_LABEL[e.kind]}
                                                    sub={`${fecha(e.date)} · ${TIPO_LABEL[e.kind]}${e.rif ? ` · ${e.rif}` : ""}`}
                                                    right={<>
                                                        <div className="text-[13px] font-semibold text-content dark:text-white tabular-nums">{fmtC(e.amount_journal, e.is_base ? baseSym : e.currency_symbol)}</div>
                                                        {!e.is_base && <div className="text-[12px] text-content-subtle tabular-nums">{fmtB(e.amount_base)}</div>}
                                                    </>}
                                                    metrics={[
                                                        { label: "Documento", value: documento(e) },
                                                        { label: "Forma de pago", value: caja(e) },
                                                    ]}
                                                />
                                            ))}
                                        </div>

                                        <div className="hidden lg:block flex-1 min-h-0 overflow-auto">
                                            <table className="table-ledger">
                                                <thead className="sticky top-0 z-10">
                                                    <tr>
                                                        <TH>Fecha</TH>
                                                        <TH>Tipo</TH>
                                                        <TH>RIF</TH>
                                                        <TH>Documento</TH>
                                                        <TH>Descripción</TH>
                                                        <TH right>Importe</TH>
                                                        <TH right>Tasa</TH>
                                                        <TH right>{baseSym}</TH>
                                                        <TH right>% del total</TH>
                                                        <TH>Forma de pago</TH>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {egresos.map(e => (
                                                        <tr key={e.id}>
                                                            <td className="px-4 tabular-nums whitespace-nowrap">{fecha(e.date)}</td>
                                                            <td className="px-4 whitespace-nowrap text-content-subtle">{TIPO_LABEL[e.kind]}</td>
                                                            <td className="px-4 whitespace-nowrap tabular-nums">{e.rif || <span className="text-content-subtle/60">N/A</span>}</td>
                                                            <td className="px-4 max-w-[180px] truncate" title={e.doc_text || undefined}>{documento(e)}</td>
                                                            <td className="px-4 max-w-[260px]">
                                                                <div className="truncate" title={e.description}>{e.description}</div>
                                                                {e.kind === "gasto" && e.category_name && <div className="text-[12px] text-content-subtle truncate">{e.category_name}</div>}
                                                            </td>
                                                            <td className="px-4 text-right tabular-nums whitespace-nowrap">{fmtC(e.amount_journal, e.is_base ? baseSym : e.currency_symbol)}</td>
                                                            <td className="px-4 text-right tabular-nums whitespace-nowrap text-content-subtle">{e.is_base ? "—" : fmtNumber(e.rate, 2)}</td>
                                                            <td className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">{fmtNumber(e.amount_base, 2)}</td>
                                                            <td className="px-4 text-right tabular-nums whitespace-nowrap text-content-subtle">{pctFmt(e.share)}</td>
                                                            <td className="px-4 whitespace-nowrap">{caja(e)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="sticky bottom-0">
                                                    <tr>
                                                        <td className="px-4 font-semibold" colSpan={7}>Total {tipo ? TIPOS.find(t => t.key === tipo)?.label.toLowerCase() : "egresos"}</td>
                                                        <td className="px-4 text-right tabular-nums whitespace-nowrap font-semibold">{fmtNumber(totalFiltrado, 2)}</td>
                                                        <td className="px-4 text-right tabular-nums whitespace-nowrap text-content-subtle">{pctFmt(s.expense_base > 0 ? totalFiltrado / s.expense_base : null)}</td>
                                                        <td />
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
