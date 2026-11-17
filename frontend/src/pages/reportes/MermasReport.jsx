import { useMemo, useState } from "react";
import { api } from "../../services/api";
import SucursalFilter, { useSucursalFilter } from "../../components/ui/SucursalFilter";
import Segmented from "../../components/ui/Segmented";
import { fmtNumber, todayISO, toNameCase } from "../../helpers";
import { buildMermasExcel, MOTIVOS_MERMA } from "../../helpers/excel";
import { fmtCant, unidadCorta, fmtHora } from "../../components/warehouses/movementMeta";
import { useReport, DateRangePicker, SectionHeader, Loading, ExportButton, KpiCard } from "./reportes.utils";

// Mermas del período: lo que el inventario perdió (merma, vencidos, robo, faltantes de conteo,
// ajustes sin motivo y lo perdido en transferencias), con lo que costó. El consumo interno va
// aparte: es mercancía que se usó, no que se perdió. Ver services/reports/mermasReport.js.

const VISTAS = [
    { key: "productos", label: "Por producto" },
    { key: "detalle",   label: "Detalle" },
];
const PERDIDAS = ["merma", "vencimiento", "robo", "conteo", "ajuste", "transferencia"];

function mesEnCurso() {
    const hoy = todayISO();
    return { from: `${hoy.slice(0, 8)}01`, to: hoy };
}

const fmtRef = (n) => `Ref. ${fmtNumber(n || 0, 2)}`;
const fechaCorta = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const cantidad = (q, unit) => `${fmtCant(q, unit)} ${unidadCorta(unit, q)}`;
const documento = (r) => (r.grupo === "transferencia" ? (r.doc || `Transferencia ${r.doc_id}`) : `Sesión ${r.doc_id}`);
// Costo valorado a lo de hoy: el ajuste es anterior a que se guardara el costo de cada línea.
const Estimado = ({ on }) => (on ? <span className="text-content-subtle" title="Costo de hoy: el ajuste es anterior a que se guardara su costo">≈ </span> : null);

const TH = ({ children, right }) => <th className={`px-4 whitespace-nowrap ${right ? "text-right" : ""}`}>{children}</th>;

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

export default function MermasReport() {
    const [range, setRange] = useState(mesEnCurso);
    const [vista, setVista] = useState("productos");
    const [motivo, setMotivo] = useState("");
    const suc = useSucursalFilter();

    const { data, loading, error } = useReport(
        api.reports.mermas,
        { date_from: range.from, date_to: range.to, warehouse_id: suc.warehouseId },
        [range.from, range.to, suc.warehouseId]
    );

    const s = data?.summary;
    const grupos = useMemo(() => new Map((data?.groups || []).map(g => [g.key, g])), [data]);
    const filas = useMemo(() => (data?.rows || []).filter(r => !motivo || r.grupo === motivo), [data, motivo]);
    const totalFilas = filas.reduce((a, r) => a + r.value, 0);
    const conConsumo = (s?.consumo_count || 0) > 0;
    const productos = useMemo(() => (data?.by_product || []).filter(p => p.qty > 0 || (conConsumo && p.consumo_qty > 0)), [data, conConsumo]);
    const motivosDe = (p) => Object.entries(p.by_group || {}).map(([k, q]) => `${MOTIVOS_MERMA[k]} ${fmtCant(q, p.unit)}`).join(" · ");

    // Tarjetas de motivo: tocar una filtra el detalle.
    const tarjetas = [...PERDIDAS, "consumo"].map(k => grupos.get(k)).filter(g => g && g.count > 0);

    return (
        <div className="lg:h-full flex flex-col space-y-4 lg:overflow-hidden">
            <div className="shrink-0 flex flex-wrap items-center gap-2">
                <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
                <SucursalFilter filter={suc} />
                <div className="ml-auto">
                    {data && data.total_rows > 0 && (
                        <ExportButton onClick={() => buildMermasExcel(data, { ...range, warehouse_name: suc.nombre || undefined })} />
                    )}
                </div>
            </div>

            {loading && !data && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
            {error && <div className="p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-semibold">{error}</div>}

            {data && (
                <div className={`lg:flex-1 lg:min-h-0 flex flex-col space-y-3 ${loading ? "opacity-50 pointer-events-none" : ""}`}>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
                        <KpiCard label="Pérdidas" value={fmtRef(s.loss_value)} sub={`${s.loss_count} ${s.loss_count === 1 ? "registro" : "registros"}`} />
                        <KpiCard label="Productos afectados" value={fmtNumber(s.loss_products, 0)} sub="Sin contar el consumo interno" />
                        <KpiCard label="Consumo interno" value={fmtRef(s.consumo_value)} sub={`${s.consumo_count} ${s.consumo_count === 1 ? "registro" : "registros"}`} />
                        <KpiCard label="Valorado al costo de hoy" value={fmtRef(s.estimated_value)}
                            sub={s.estimated_value > 0 ? "Ajustes anteriores a guardar el costo" : "Todo con el costo del día"} />
                    </div>

                    {tarjetas.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-2 shrink-0">
                            {tarjetas.map(g => {
                                const on = motivo === g.key;
                                return (
                                    <button key={g.key} type="button" aria-pressed={on}
                                        onClick={() => { setMotivo(on ? "" : g.key); setVista("detalle"); }}
                                        className={`text-left rounded-xl border px-3 py-2.5 min-w-0 transition-colors ${on
                                            ? "border-brand-500 bg-brand-500/10"
                                            : "border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.03]"}`}>
                                        <div className="text-[12px] text-content-subtle truncate">{MOTIVOS_MERMA[g.key]}</div>
                                        <div className="text-[15px] font-semibold text-content dark:text-white tabular-nums truncate">{fmtRef(g.value)}</div>
                                        <div className="text-[12px] text-content-subtle tabular-nums">{g.count} {g.count === 1 ? "registro" : "registros"}</div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <div className="overflow-x-auto scrollbar-hide">
                            <Segmented value={vista} onChange={setVista} options={VISTAS} />
                        </div>
                        {vista === "detalle" && motivo && (
                            <button type="button" onClick={() => setMotivo("")}
                                className="h-9 px-3 rounded-lg btn-outline text-[13px] font-medium inline-flex items-center gap-1.5">
                                {MOTIVOS_MERMA[motivo]}
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        )}
                    </div>

                    <div className="lg:flex-1 lg:min-h-0 flex flex-col bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none overflow-hidden">
                        {vista === "productos" ? (
                            <>
                                <div className="px-4 pt-4 shrink-0">
                                    <SectionHeader title="Pérdidas por producto"
                                        sub="Lo que más costó arriba. Cantidad y costo sin el consumo interno" />
                                </div>
                                {productos.length === 0 ? (
                                    <div className="px-4 py-16 text-center">
                                        <div className="text-[14px] font-semibold text-content dark:text-white">Sin mermas en el período</div>
                                        <div className="text-[13px] text-content-subtle mt-1">Se registran en Inventario: tarjeta del almacén, Mov. manual, Salida.</div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="lg:hidden divide-y divide-border/60 dark:divide-white/[0.06] border-t border-border/60 dark:border-white/[0.06]">
                                            {productos.map(p => (
                                                <MobileRow key={p.product_id || p.product_name}
                                                    title={toNameCase(p.product_name)}
                                                    sub={motivosDe(p) || (p.category_name ? toNameCase(p.category_name) : null)}
                                                    right={<div className="text-[13px] font-semibold text-content dark:text-white tabular-nums"><Estimado on={p.estimated} />{fmtRef(p.value)}</div>}
                                                    metrics={[
                                                        { label: "Cantidad perdida", value: cantidad(p.qty, p.unit) },
                                                        ...(conConsumo && p.consumo_qty > 0 ? [{ label: "Consumo interno", value: `${cantidad(p.consumo_qty, p.unit)} · ${fmtRef(p.consumo_value)}` }] : []),
                                                    ]} />
                                            ))}
                                        </div>
                                        <div className="hidden lg:block flex-1 min-h-0 overflow-auto">
                                            <table className="table-ledger">
                                                <thead className="sticky top-0 z-10">
                                                    <tr>
                                                        <TH>Producto</TH>
                                                        <TH>Motivos</TH>
                                                        <TH right>Cantidad perdida</TH>
                                                        <TH right>Costo</TH>
                                                        {conConsumo && <TH right>Consumo interno</TH>}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {productos.map(p => (
                                                        <tr key={p.product_id || p.product_name}>
                                                            <td className="px-4 max-w-[280px]">
                                                                <div className="font-semibold truncate">{toNameCase(p.product_name)}</div>
                                                                {p.category_name && <div className="text-[12px] text-content-subtle truncate">{toNameCase(p.category_name)}</div>}
                                                            </td>
                                                            <td className="px-4 text-content-subtle max-w-[320px] truncate" title={motivosDe(p)}>{motivosDe(p) || "—"}</td>
                                                            <td className="px-4 text-right tabular-nums whitespace-nowrap">{p.qty > 0 ? cantidad(p.qty, p.unit) : "—"}</td>
                                                            <td className="px-4 text-right tabular-nums whitespace-nowrap font-semibold"><Estimado on={p.estimated} />{fmtNumber(p.value, 2)}</td>
                                                            {conConsumo && (
                                                                <td className="px-4 text-right tabular-nums whitespace-nowrap text-content-subtle">
                                                                    {p.consumo_qty > 0 ? `${cantidad(p.consumo_qty, p.unit)} · ${fmtNumber(p.consumo_value, 2)}` : "—"}
                                                                </td>
                                                            )}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="sticky bottom-0">
                                                    <tr>
                                                        <td className="px-4 font-semibold" colSpan={3}>Total pérdidas</td>
                                                        <td className="px-4 text-right tabular-nums font-semibold whitespace-nowrap">{fmtNumber(s.loss_value, 2)}</td>
                                                        {conConsumo && <td className="px-4 text-right tabular-nums text-content-subtle whitespace-nowrap">{fmtNumber(s.consumo_value, 2)}</td>}
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="px-4 pt-4 shrink-0">
                                    <SectionHeader
                                        title={motivo ? MOTIVOS_MERMA[motivo] : "Cada pérdida del período"}
                                        sub={data.truncated ? `Se muestran las ${data.rows.length} más recientes de ${data.total_rows}. Achica el período o exporta.` : "Con quién la registró y en qué documento"}
                                        right={<div className="text-right shrink-0">
                                            <div className="text-[15px] font-semibold text-content dark:text-white tabular-nums">{fmtRef(totalFilas)}</div>
                                            <div className="text-[12px] text-content-subtle">{filas.length} {filas.length === 1 ? "registro" : "registros"}</div>
                                        </div>}
                                    />
                                </div>
                                {filas.length === 0 ? (
                                    <div className="px-4 py-16 text-center text-[13px] text-content-subtle">Nada registrado con ese motivo en el período</div>
                                ) : (
                                    <>
                                        <div className="lg:hidden divide-y divide-border/60 dark:divide-white/[0.06] border-t border-border/60 dark:border-white/[0.06]">
                                            {filas.map(r => (
                                                <MobileRow key={r.id}
                                                    title={toNameCase(r.product_name)}
                                                    sub={`${fechaCorta(r.at)} ${fmtHora(r.at)} · ${MOTIVOS_MERMA[r.grupo]}${r.warehouse_name ? ` · ${toNameCase(r.warehouse_name)}` : ""}`}
                                                    right={<>
                                                        <div className="text-[13px] font-semibold text-content dark:text-white tabular-nums"><Estimado on={r.estimated} />{fmtRef(r.value)}</div>
                                                        <div className="text-[12px] text-content-subtle tabular-nums">{cantidad(r.qty, r.unit)}</div>
                                                    </>}
                                                    metrics={[
                                                        { label: "Registró", value: r.employee_name ? toNameCase(r.employee_name) : "—" },
                                                        { label: "Documento", value: documento(r) },
                                                        ...(r.notes ? [{ label: "Nota", value: r.notes }] : []),
                                                    ]} />
                                            ))}
                                        </div>
                                        <div className="hidden lg:block flex-1 min-h-0 overflow-auto">
                                            <table className="table-ledger">
                                                <thead className="sticky top-0 z-10">
                                                    <tr>
                                                        <TH>Fecha</TH>
                                                        <TH>Producto</TH>
                                                        <TH>Motivo</TH>
                                                        <TH>Sucursal</TH>
                                                        <TH right>Cantidad</TH>
                                                        <TH right>Costo unit.</TH>
                                                        <TH right>Costo</TH>
                                                        <TH>Registró</TH>
                                                        <TH>Documento</TH>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filas.map(r => (
                                                        <tr key={r.id}>
                                                            <td className="px-4 tabular-nums whitespace-nowrap">{fechaCorta(r.at)} <span className="text-content-subtle">{fmtHora(r.at)}</span></td>
                                                            <td className="px-4 max-w-[240px]">
                                                                <div className="font-semibold truncate">{toNameCase(r.product_name)}</div>
                                                                {r.notes && <div className="text-[12px] text-content-subtle truncate" title={r.notes}>{r.notes}</div>}
                                                            </td>
                                                            <td className="px-4 whitespace-nowrap">{MOTIVOS_MERMA[r.grupo]}</td>
                                                            <td className="px-4 whitespace-nowrap text-content-subtle">{r.warehouse_name ? toNameCase(r.warehouse_name) : "—"}</td>
                                                            <td className="px-4 text-right tabular-nums whitespace-nowrap">{cantidad(r.qty, r.unit)}</td>
                                                            <td className="px-4 text-right tabular-nums whitespace-nowrap text-content-subtle">{fmtNumber(r.unit_cost, 2)}</td>
                                                            <td className="px-4 text-right tabular-nums whitespace-nowrap font-semibold"><Estimado on={r.estimated} />{fmtNumber(r.value, 2)}</td>
                                                            <td className="px-4 whitespace-nowrap">{r.employee_name ? toNameCase(r.employee_name) : "—"}</td>
                                                            <td className="px-4 whitespace-nowrap text-content-subtle">{documento(r)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="sticky bottom-0">
                                                    <tr>
                                                        <td className="px-4 font-semibold" colSpan={6}>Total {motivo ? MOTIVOS_MERMA[motivo].toLowerCase() : "del período"}</td>
                                                        <td className="px-4 text-right tabular-nums font-semibold whitespace-nowrap">{fmtNumber(totalFilas, 2)}</td>
                                                        <td colSpan={2} />
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                    {s.estimated_value > 0 && (
                        <p className="shrink-0 text-[12px] text-content-subtle">
                            ≈ Costo de hoy: esos ajustes son anteriores a que el sistema guardara el costo de cada merma. Desde ahora cada una queda con el costo del día en que se registró.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
