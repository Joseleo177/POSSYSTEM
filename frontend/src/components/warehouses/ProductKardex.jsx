import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import Segmented from "../ui/Segmented";
import DateRangePicker from "../ui/DateRangePicker";
import Pagination from "../ui/Pagination";
import { LedgerSkeleton, LedgerEmpty, DayRow } from "../ui/Ledger";
import { resolveImageUrl, imgRetryOnError } from "../../helpers/image";
import { fmtDayLabel, fmtDateShort } from "../../helpers/dates";
import { toNameCase } from "../../helpers";
import { describe, fmtCant, unidadCorta, fmtHora, GROUPS, ICON } from "./movementMeta";

const LIMIT = 50;

const Svg = ({ d, className = "w-4 h-4", sw = 2 }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} d={d} />
    </svg>
);

// Cantidad con signo. Lo que entra va en verde; lo que sale, en tinta con su signo: la mayoría
// de las salidas son ventas normales, no alertas (mismo criterio que el estado de cuenta).
function Qty({ m, unit, className = "" }) {
    const entra = m.qty > 0;
    return (
        <span className={`tabular-nums whitespace-nowrap font-semibold ${m.void
            ? "line-through decoration-1 text-content-subtle"
            : entra ? "text-emerald-700 dark:text-emerald-400" : "text-content dark:text-white"} ${className}`}>
            {entra ? "+" : "−"}{fmtCant(m.qty, unit)}
        </span>
    );
}

function Balance({ m, unit, className = "" }) {
    if (m.void) return <span className={`text-content-subtle ${className}`}>—</span>;
    return (
        <span className={`tabular-nums whitespace-nowrap ${m.balance < 0 ? "text-red-600 dark:text-red-400" : "text-content-muted dark:text-white/75"} ${className}`}>
            {m.balance < 0 ? "−" : ""}{fmtCant(m.balance, unit)}
        </span>
    );
}

function KindIcon({ m, size = "w-8 h-8" }) {
    const d = describe(m);
    const entra = m.qty > 0;
    return (
        <span className={`${size} rounded-full flex items-center justify-center shrink-0 ${m.void
            ? "bg-surface-3 dark:bg-white/[0.06] text-content-subtle"
            : entra ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/60"}`}
            title={entra ? "Entrada" : "Salida"}>
            <Svg d={d.icon} className="w-3.5 h-3.5" sw={1.9} />
        </span>
    );
}

// Historial de un producto (kardex): resumen del período, filtro por tipo de movimiento y el
// libro con la existencia después de cada línea. Lo usan la pestaña Movimientos y la ventana
// que se abre desde Stock y Movimiento manual.
//
// En escritorio el libro se desplaza dentro de su marco con la cabecera fija; en el teléfono
// se desplaza la página entera y las filas pasan a tarjetas.
export default function ProductKardex({ productId, warehouseId = "", actions = null, padX = "px-4 lg:px-6" }) {
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo]     = useState("");
    const [group, setGroup]       = useState("");
    const [page, setPage]         = useState(1);
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState("");

    // Otro producto u otro almacén: se empieza de cero, sin arrastrar filtros del anterior.
    useEffect(() => { setGroup(""); setPage(1); }, [productId, warehouseId]);
    useEffect(() => { setPage(1); }, [dateFrom, dateTo, group]);

    const load = useCallback(async () => {
        if (!productId) return;
        setLoading(true);
        setError("");
        try {
            const params = { product_id: productId, limit: LIMIT, offset: (page - 1) * LIMIT };
            if (warehouseId) params.warehouse_id = warehouseId;
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            if (group) params.group = group;
            const r = await api.warehouses.movements(params);
            setData(r.data);
        } catch (e) {
            setError(e.message || "No se pudo cargar el historial");
        } finally {
            setLoading(false);
        }
    }, [productId, warehouseId, dateFrom, dateTo, group, page]);

    useEffect(() => { load(); }, [load]);

    const product = data?.product;
    const unit = product?.unit;
    const rows = data?.rows || [];
    const total = data?.total || 0;
    const totalPages = Math.ceil(total / LIMIT);
    const s = data?.summary;
    const porAlmacen = warehouseId === "";
    const hayFechas = !!(dateFrom || dateTo);

    const counts = Object.fromEntries((data?.groups || []).map(g => [g.grp, g.n]));
    const totalTodos = (data?.groups || []).reduce((a, g) => a + g.n, 0);
    const opciones = [
        { key: "", label: "Todos", count: totalTodos },
        ...GROUPS.filter(g => counts[g.key] || g.key === group).map(g => ({ ...g, count: counts[g.key] || 0 })),
    ];

    // Última página sin filtro de tipo: cierra el libro con la existencia de partida. Sin
    // fechas, es lo que había antes del primer documento (cargas o retiros sin registro).
    const ultimaPagina = page >= totalPages;
    const filaInicial = !loading && s && !group && ultimaPagina && (rows.length > 0 || s.opening !== 0);

    const COLS = porAlmacen ? 5 : 4;
    const current = data?.current ?? 0;
    const u = unidadCorta(unit, current);

    const filas = [];
    let dia = null;
    rows.forEach((m, i) => {
        const d = fmtDayLabel(m.at);
        if (d !== dia) {
            dia = d;
            filas.push({ day: d, key: `d-${i}` });
        }
        filas.push({ m, key: `m-${i}` });
    });

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
            {/* ── Producto ── */}
            <div className={`shrink-0 ${padX} pt-4 lg:pt-5 flex items-start gap-3 lg:gap-4`}>
                <div className="w-14 h-14 rounded-xl bg-surface-2 dark:bg-white/5 overflow-hidden shrink-0 relative border border-border/60 dark:border-white/[0.06]">
                    {product?.image_url ? (
                        <img src={resolveImageUrl(product.image_url)} alt="" onError={imgRetryOnError}
                            className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-content-subtle/50">
                            <Svg d={ICON.box} className="w-6 h-6" sw={1.5} />
                        </div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-content-subtle">Historial de movimientos</p>
                    <h2 className="text-[16px] lg:text-[17px] font-semibold tracking-tight text-content dark:text-white leading-snug line-clamp-2">
                        {product?.name || (loading ? "Cargando…" : "—")}
                    </h2>
                    <p className="text-[12px] text-content-subtle mt-0.5 truncate">
                        {porAlmacen ? "Todos los almacenes" : `Almacén ${toNameCase(data?.warehouses?.[0]?.name || "")}`}
                        {s?.first_at && <> · desde el {fmtDateShort(s.first_at)}</>}
                        {product?.barcode && <span className="hidden sm:inline"> · Código {product.barcode}</span>}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[12px] text-content-subtle">Existencia</div>
                    <div className={`text-[22px] lg:text-[26px] leading-none font-bold tracking-tight tabular-nums mt-1 ${current <= 0 && data ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`}>
                        {data ? `${current < 0 ? "−" : ""}${fmtCant(current, unit)}` : "—"}
                    </div>
                    <div className="text-[11px] text-content-subtle mt-1">{u}</div>
                </div>
                {actions}
            </div>

            {/* Reparto por almacén: solo cuando se ven todos y hay más de uno. */}
            {porAlmacen && (data?.warehouses?.length || 0) > 1 && (
                <div className={`shrink-0 ${padX} pt-3 flex flex-wrap gap-1.5`}>
                    {data.warehouses.map(w => (
                        <span key={w.id} className="h-7 px-2.5 rounded-lg bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.06] inline-flex items-center gap-1.5 text-[12px]">
                            <span className="text-content-subtle">{toNameCase(w.name)}</span>
                            <span className={`font-semibold tabular-nums ${w.qty <= 0 ? "text-content-subtle" : "text-content dark:text-white"}`}>{fmtCant(w.qty, unit)}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* ── Resumen del período ── */}
            <div className={`shrink-0 ${padX} pt-4`}>
                {/* Las líneas entre celdas son el hueco de 1px sobre el fondo del marco: así sirven igual
                    en 2 columnas (teléfono) que en 4, sin reglas de borde por posición. */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-xl overflow-hidden bg-border/70 dark:bg-white/[0.06] border border-border/70 dark:border-white/[0.06]">
                    {[
                        { label: hayFechas ? "Al inicio del período" : "Existencia inicial", val: s?.opening, cls: "text-content dark:text-white" },
                        { label: "Entradas", val: s?.entradas, sign: "+", cls: "text-emerald-700 dark:text-emerald-400" },
                        { label: "Salidas", val: s?.salidas, sign: "−", cls: "text-content dark:text-white" },
                        { label: hayFechas ? "Al cierre del período" : "Existencia actual", val: s?.closing, cls: "text-content dark:text-white", strong: true },
                    ].map(k => (
                        <div key={k.label} className="px-4 py-3 min-w-0 bg-surface-2 dark:bg-surface-dark">
                            <div className="text-[12px] text-content-subtle truncate">{k.label}</div>
                            <div className={`mt-1 text-[16px] tabular-nums truncate ${k.strong ? "font-bold" : "font-semibold"} ${k.val < 0 ? "text-red-600 dark:text-red-400" : k.cls}`}>
                                {s == null ? <span className="inline-block w-12 h-3 rounded-full bg-surface-3 dark:bg-white/[0.06] animate-pulse" />
                                    : <>{k.sign && k.val ? k.sign : k.val < 0 ? "−" : ""}{fmtCant(k.val, unit)}</>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Filtros ── */}
            <div className={`shrink-0 ${padX} pt-4 pb-3 flex flex-col lg:flex-row lg:items-center gap-2.5`}>
                <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
                    <Segmented options={opciones} value={group} onChange={setGroup} />
                </div>
                <div className="flex items-center gap-2 lg:ml-auto">
                    <DateRangePicker from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} className="flex-1 lg:w-[260px] lg:flex-none" />
                    {hayFechas && (
                        <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="row-icon" title="Quitar fechas" aria-label="Quitar fechas">
                            <Svg d={ICON.close} />
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className={`${padX} pb-3`}>
                    <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-[13px] text-red-700 dark:text-red-300">{error}</div>
                </div>
            )}

            {/* ── Libro (escritorio) ── */}
            <div className="hidden lg:block flex-1 min-h-0 overflow-auto custom-scrollbar border-t border-border dark:border-border-dark">
                <table className="table-ledger min-w-[760px]">
                    <thead className="sticky top-0 z-10">
                        <tr>
                            <th className="pl-6 w-[260px]">Movimiento</th>
                            <th>Detalle</th>
                            {porAlmacen && <th className="w-[140px]">Almacén</th>}
                            <th className="text-right w-[130px]">Cantidad</th>
                            <th className="text-right w-[130px] pr-6">Existencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? <LedgerSkeleton cols={COLS} rows={8} />
                            : rows.length === 0 && !filaInicial ? (
                                <LedgerEmpty cols={COLS} title="Sin movimientos"
                                    hint={hayFechas || group ? "No hay movimientos con esos filtros." : "Este producto todavía no tiene movimientos registrados."}
                                    onClear={hayFechas || group ? () => { setDateFrom(""); setDateTo(""); setGroup(""); } : undefined} />
                            ) : (
                                <>
                                    {filas.map(f => f.day
                                        ? <DayRow key={f.key} cols={COLS} label={f.day} className="pl-6" />
                                        : <FilaTabla key={f.key} m={f.m} unit={unit} porAlmacen={porAlmacen} />)}
                                    {filaInicial && (
                                        <tr>
                                            <td className="pl-6" colSpan={COLS - 1}>
                                                <div className="text-[13px] font-semibold text-content dark:text-white">
                                                    {hayFechas && dateFrom ? `Existencia al ${fmtDateShort(dateFrom)}` : "Existencia inicial"}
                                                </div>
                                                {!hayFechas && s.opening !== 0 && (
                                                    <div className="text-[12px] text-content-subtle">Anterior al primer documento: cargas iniciales, importaciones o retiros sin registro.</div>
                                                )}
                                            </td>
                                            <td className="text-right pr-6">
                                                <span className={`tabular-nums font-semibold ${s.opening < 0 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`}>
                                                    {s.opening < 0 ? "−" : ""}{fmtCant(s.opening, unit)}
                                                </span>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            )}
                    </tbody>
                </table>
            </div>

            {/* ── Tarjetas (teléfono y tablet vertical) ── */}
            <div className="lg:hidden border-t border-border dark:border-border-dark">
                {loading ? (
                    <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : rows.length === 0 && !filaInicial ? (
                    <div className="py-16 text-center px-6">
                        <div className="text-[14px] font-semibold text-content dark:text-white">Sin movimientos</div>
                        <div className="text-[13px] text-content-subtle mt-1">{hayFechas || group ? "No hay movimientos con esos filtros." : "Este producto todavía no tiene movimientos registrados."}</div>
                    </div>
                ) : (
                    <>
                        {filas.map(f => f.day ? (
                            <div key={f.key} className={`${padX} pt-5 pb-2 text-[14px] font-bold text-content dark:text-white border-b border-border dark:border-border-dark`}>{f.day}</div>
                        ) : (
                            <FilaTarjeta key={f.key} m={f.m} unit={unit} porAlmacen={porAlmacen} padX={padX} />
                        ))}
                        {filaInicial && (
                            <div className={`${padX} py-3 flex items-center justify-between gap-3 bg-surface-2/60 dark:bg-white/[0.02]`}>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-semibold text-content dark:text-white">{hayFechas && dateFrom ? `Existencia al ${fmtDateShort(dateFrom)}` : "Existencia inicial"}</div>
                                    {!hayFechas && s.opening !== 0 && <div className="text-[12px] text-content-subtle">Anterior al primer documento</div>}
                                </div>
                                <span className={`tabular-nums font-semibold text-[15px] ${s.opening < 0 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`}>
                                    {s.opening < 0 ? "−" : ""}{fmtCant(s.opening, unit)}
                                </span>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="shrink-0">
                <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
            </div>
        </div>
    );
}

function FilaTabla({ m, unit, porAlmacen }) {
    const d = describe(m);
    const tachado = m.void ? "line-through decoration-1 text-content-subtle" : "";
    return (
        <tr className={m.void ? "opacity-60" : undefined}>
            <td className="pl-6">
                <div className="flex items-center gap-3 min-w-0">
                    <KindIcon m={m} />
                    <div className="min-w-0">
                        <div className={`text-[13px] font-semibold truncate ${tachado || "text-content dark:text-white"}`}>{d.title}</div>
                        <div className="text-[12px] text-content-subtle tabular-nums truncate">
                            {[d.doc, fmtHora(m.at)].filter(Boolean).join(" · ")}
                            {m.void && " · Anulada"}
                        </div>
                    </div>
                </div>
            </td>
            <td className="max-w-0">
                {d.party && <div className={`text-[13px] truncate ${tachado || "text-content dark:text-white"}`} title={d.party}>{d.party}</div>}
                <div className="text-[12px] text-content-subtle truncate" title={[d.extra, m.employee_name].filter(Boolean).join(" · ")}>
                    {[d.extra, m.employee_name && toNameCase(m.employee_name)].filter(Boolean).join(" · ") || (d.party ? "" : "—")}
                </div>
            </td>
            {porAlmacen && <td className="text-[13px] text-content-muted dark:text-white/70 truncate">{toNameCase(m.warehouse_name)}</td>}
            <td className="text-right"><Qty m={m} unit={unit} className="text-[14px]" /></td>
            <td className="text-right pr-6"><Balance m={m} unit={unit} className="text-[13px] font-medium" /></td>
        </tr>
    );
}

function FilaTarjeta({ m, unit, porAlmacen, padX }) {
    const d = describe(m);
    const sub = [d.party, d.extra].filter(Boolean).join(" · ");
    return (
        <div className={`${padX} py-3 flex items-start gap-3 border-b border-border/50 dark:border-white/[0.04] ${m.void ? "opacity-60" : ""}`}>
            <KindIcon m={m} size="w-9 h-9" />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-[14px] font-semibold truncate ${m.void ? "line-through decoration-1 text-content-subtle" : "text-content dark:text-white"}`}>{d.title}</span>
                    <Qty m={m} unit={unit} className="text-[15px]" />
                </div>
                <div className="flex items-baseline justify-between gap-3 mt-0.5">
                    <span className="text-[12px] text-content-subtle tabular-nums truncate">
                        {[d.doc, fmtHora(m.at), porAlmacen && toNameCase(m.warehouse_name)].filter(Boolean).join(" · ")}
                        {m.void && " · Anulada"}
                    </span>
                    <span className="text-[12px] text-content-subtle whitespace-nowrap">
                        quedan <Balance m={m} unit={unit} className="font-semibold" />
                    </span>
                </div>
                {sub && <div className="text-[12px] text-content-subtle truncate mt-0.5">{sub}</div>}
            </div>
        </div>
    );
}

export { KindIcon, Qty };
