import { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import SaleDetailModal from "../../components/Customers/SaleDetailModal";
import CustomSelect from "../../components/ui/CustomSelect";
import Modal from "../../components/ui/Modal";
import Money from "../../components/ui/Money";
import StatusMark from "../../components/ui/StatusMark";
import CobrosDelTurno from "../../components/CobrosDelTurno";
import { fmtMoney, toNameCase, fmtDateShort, fmtTime, fmtDuracion } from "../../helpers";
import { ledgerRow, LedgerSkeleton, LedgerEmpty, RowIcon, stopRow } from "../../components/ui/Ledger";
import { usePagination, Pagination, DateRangePicker } from "./reportes.utils";

// Historial de cierres de caja y el resumen de cada uno.

const TONO_FALTA  = "#ef4444";
const TONO_SOBRA  = "#f59e0b";
const LOCK = "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z";

// El estado de la venta llega en masculino ("pagado"); los datos viejos pueden traerlo en
// femenino o con mayúscula.
const ESTADO_FEM = { pagada: "pagado", anulada: "anulado" };
const estadoVenta = (st) => { const k = String(st || "").toLowerCase(); return ESTADO_FEM[k] || k; };

// Una diferencia menor a un céntimo es redondeo, no un descuadre (mismo criterio que el cierre).
const descuadra = (n) => Math.abs(parseFloat(n) || 0) >= 0.005;

// Cómo cerró la caja, a partir de lo que se guardó al cerrarla. Lo que falta manda sobre lo
// que sobra: es lo que alguien tiene que explicar.
function cuadreDe(session) {
    const conDif = (session.journals || []).filter(j => descuadra(j.difference));
    if (!conDif.length) return { estado: "ok" };
    const faltan = conDif.filter(j => parseFloat(j.difference) < 0);
    const lista  = faltan.length ? faltan : conDif;
    const j      = lista[0];
    const sym    = j.journal?.Currency?.symbol || "Ref.";
    return {
        estado: faltan.length ? "falta" : "sobra",
        monto:  fmtMoney(Math.abs(parseFloat(j.difference)), sym),
        caja:   toNameCase(j.journal?.name),
        otras:  conDif.length - 1,
    };
}

function Cuadre({ session }) {
    const c = cuadreDe(session);
    if (c.estado === "ok") {
        return (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-content-subtle whitespace-nowrap">
                <svg className="w-3.5 h-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Cuadró
            </span>
        );
    }
    const falta = c.estado === "falta";
    return (
        <div className="min-w-0">
            <div className={`text-[13px] font-semibold whitespace-nowrap ${falta ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                {falta ? "Faltan" : "Sobran"} <Money value={c.monto} />
            </div>
            <div className="text-[12px] text-content-subtle truncate">
                {c.caja}{c.otras > 0 ? ` y ${c.otras} más` : ""}
            </div>
        </div>
    );
}

const tonoDe = (session) => {
    const e = cuadreDe(session).estado;
    return e === "falta" ? TONO_FALTA : e === "sobra" ? TONO_SOBRA : undefined;
};

// "29/09/2026 · 14:18 → 14:28", o con las dos fechas si el turno cruzó de día.
function rango(s) {
    const mismo = fmtDateShort(s.opened_at) === fmtDateShort(s.closed_at);
    return mismo
        ? `${fmtDateShort(s.opened_at)} · ${fmtTime(s.opened_at)} → ${fmtTime(s.closed_at)}`
        : `${fmtDateShort(s.opened_at)} ${fmtTime(s.opened_at)} → ${fmtDateShort(s.closed_at)} ${fmtTime(s.closed_at)}`;
}

// Para la franja del resumen, donde el espacio es un cuarto del modal: "14:18 → 14:28" o,
// si cruzó de día, "07/09 → 29/09".
const diaMes = (d) => fmtDateShort(d, { day: "2-digit", month: "2-digit" });
const rangoCorto = (s) => fmtDateShort(s.opened_at) === fmtDateShort(s.closed_at)
    ? `${fmtTime(s.opened_at)} → ${fmtTime(s.closed_at)}`
    : `${diaMes(s.opened_at)} → ${diaMes(s.closed_at)}`;

export default function CashSessionsReport() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    const [detailSaleId, setDetailSaleId] = useState(null);

    // Filtros
    const [searchTerm, setSearchTerm] = useState("");
    const [filterEmployee, setFilterEmployee] = useState("");
    const [filterWarehouse, setFilterWarehouse] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const employees  = [...new Set(sessions.map(s => s.employee?.full_name).filter(Boolean))];
    // Mismo criterio: derivadas de las sesiones ya cargadas, sin pedir nada aparte al servidor.
    const warehouses = [...new Map(sessions.filter(s => s.warehouse).map(s => [s.warehouse.id, s.warehouse])).values()];

    const filtered = sessions.filter(s => {
        if (filterEmployee && s.employee?.full_name !== filterEmployee) return false;
        if (filterWarehouse && String(s.warehouse?.id) !== filterWarehouse) return false;
        if (dateFrom && new Date(s.closed_at) < new Date(dateFrom + "T00:00:00")) return false;
        if (dateTo && new Date(s.closed_at) > new Date(dateTo + "T23:59:59")) return false;
        if (searchTerm.trim()) {
            const q = searchTerm.trim().toLowerCase();
            const hay = `cierre #${s.id} ${s.employee?.full_name || ""} ${s.warehouse?.name || ""}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    const sessionsPag = usePagination(filtered, 20);

    // Volver a página 1 al cambiar filtros
    useEffect(() => { sessionsPag.setPage(1); }, [searchTerm, filterEmployee, filterWarehouse, dateFrom, dateTo]); // eslint-disable-line

    const hasFilters = !!(searchTerm || filterEmployee || filterWarehouse || dateFrom || dateTo);
    const clearFilters = () => { setSearchTerm(""); setFilterEmployee(""); setFilterWarehouse(""); setDateFrom(""); setDateTo(""); };

    const loadSessions = useCallback(async () => {
        setLoading(true);
        try {
            const r = await api.cashSessions.history({});
            setSessions(r.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadSessions(); }, [loadSessions]);

    const vacio = hasFilters
        ? { title: "Sin cierres con estos filtros", hint: "Prueba con otro cajero, sucursal o fechas." }
        : { title: "Todavía no hay cierres", hint: "Cada turno que se cierra en el punto de venta aparece aquí." };

    return (
        <div className="h-full flex flex-col gap-3 overflow-y-auto lg:overflow-hidden">
            <div className="shrink-0 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        autoComplete="off"
                        placeholder="Buscar por n.º de cierre, cajero o sucursal"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full h-10 pl-9 pr-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white placeholder:text-content-subtle outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors"
                    />
                </div>

                <CustomSelect
                    value={filterEmployee}
                    onChange={setFilterEmployee}
                    placeholder="Todos los cajeros"
                    boxClassName="min-w-[180px]"
                    options={[
                        { value: "", label: "Todos los cajeros" },
                        ...employees.map(name => ({ value: name, label: toNameCase(name) })),
                    ]}
                />

                {/* Sucursal: con una sola no aporta nada elegir entre ella misma. */}
                {warehouses.length > 1 && (
                    <CustomSelect
                        value={filterWarehouse}
                        onChange={setFilterWarehouse}
                        placeholder="Todas las sucursales"
                        boxClassName="min-w-[180px]"
                        options={[
                            { value: "", label: "Todas las sucursales" },
                            ...warehouses.map(w => ({ value: String(w.id), label: toNameCase(w.name) })),
                        ]}
                    />
                )}

                <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />

                {hasFilters && (
                    <button onClick={clearFilters}
                        className="h-10 px-2 text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                        Quitar filtros
                    </button>
                )}

                <button onClick={loadSessions} title="Actualizar" aria-label="Actualizar"
                    className="h-10 w-10 flex items-center justify-center rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                    <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>

            {/* ── Libro (escritorio) ── */}
            <div className="hidden md:flex lg:flex-1 lg:min-h-0 flex-col bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none overflow-hidden">
                <div className="lg:flex-1 lg:min-h-0 overflow-auto">
                    <table className="table-ledger min-w-[820px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Cierre</th>
                                <th>Cajero</th>
                                <th>Sucursal</th>
                                <th>Duración</th>
                                <th>Cuadre</th>
                                <th className="pr-4 w-px"><span className="sr-only">Ver</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && !sessions.length ? <LedgerSkeleton cols={6} rows={8} />
                                : sessionsPag.total === 0 ? (
                                    <LedgerEmpty cols={6} title={vacio.title} hint={vacio.hint} onClear={hasFilters ? clearFilters : undefined} />
                                ) : sessionsPag.paginated.map(s => (
                                    <tr key={s.id} {...ledgerRow(() => setSelected(s), tonoDe(s))}>
                                        <td className="pl-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="w-8 h-8 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/60 flex items-center justify-center shrink-0">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={LOCK} /></svg>
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-semibold text-content dark:text-white tabular-nums">Cierre #{s.id}</div>
                                                    <div className="text-[12px] text-content-subtle tabular-nums whitespace-nowrap">{rango(s)}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-[13px] text-content dark:text-white">{toNameCase(s.employee?.full_name) || "—"}</td>
                                        <td className="text-[13px] text-content-subtle">{toNameCase(s.warehouse?.name) || "—"}</td>
                                        <td className="text-[13px] text-content-subtle tabular-nums whitespace-nowrap">{fmtDuracion(s.opened_at, s.closed_at)}</td>
                                        <td className="max-w-[220px]"><Cuadre session={s} /></td>
                                        <td className="pr-4" onClick={stopRow}>
                                            <RowIcon icon="eye" title="Ver resumen" onClick={() => setSelected(s)} />
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
                <Pagination page={sessionsPag.page} totalPages={sessionsPag.totalPages} total={sessionsPag.total} onPage={sessionsPag.setPage} />
            </div>

            {/* ── Tarjetas (teléfono) ── */}
            <div className="md:hidden space-y-2">
                {loading && !sessions.length ? (
                    <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : sessionsPag.total === 0 ? (
                    <div className="py-16 text-center px-6">
                        <div className="text-[14px] font-semibold text-content dark:text-white">{vacio.title}</div>
                        <div className="text-[13px] text-content-subtle mt-1">{vacio.hint}</div>
                    </div>
                ) : sessionsPag.paginated.map(s => {
                    const tone = tonoDe(s);
                    return (
                        <div key={s.id} role="button" tabIndex={0} onClick={() => setSelected(s)}
                            onKeyDown={e => { if (e.key === "Enter") setSelected(s); }}
                            style={tone ? { boxShadow: `inset 3px 0 0 ${tone}` } : undefined}
                            className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-[14px] font-semibold text-content dark:text-white tabular-nums">Cierre #{s.id}</div>
                                    <div className="text-[12px] text-content-subtle truncate">
                                        {toNameCase(s.employee?.full_name)} · {toNameCase(s.warehouse?.name)}
                                    </div>
                                </div>
                                <div className="shrink-0 text-right"><Cuadre session={s} /></div>
                            </div>
                            <div className="mt-1.5 text-[12px] text-content-subtle tabular-nums">
                                {fmtDateShort(s.closed_at)} · {fmtTime(s.closed_at)} · {fmtDuracion(s.opened_at, s.closed_at)}
                            </div>
                        </div>
                    );
                })}
                {sessionsPag.totalPages > 1 && (
                    <Pagination page={sessionsPag.page} totalPages={sessionsPag.totalPages} total={sessionsPag.total} onPage={sessionsPag.setPage} />
                )}
            </div>

            <ResumenCierre session={selected} onClose={() => setSelected(null)} onOpenSale={setDetailSaleId} />

            {detailSaleId && (
                <SaleDetailModal saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />
            )}
        </div>
    );
}

// Fila etiqueta / monto del desglose de una caja (mismo dibujo que el cierre de turno).
const Linea = ({ label, value, strong, tone }) => (
    <div className={`flex justify-between items-baseline gap-3 ${strong ? "pt-2 mt-1 border-t border-border/70 dark:border-white/[0.06]" : ""}`}>
        <span className={`text-[13px] ${strong ? "font-semibold text-content dark:text-white" : "text-content-subtle"}`}>{label}</span>
        <Money value={value} className={`${strong ? "text-[14px] font-bold" : "text-[13px] font-medium"} ${tone || "text-content dark:text-white"}`} />
    </div>
);

const Seccion = ({ title, count, children }) => (
    <div className="pt-5">
        <div className="flex items-baseline gap-2 mb-2">
            <div className="text-[14px] font-semibold text-content dark:text-white">{title}</div>
            {count != null && <div className="text-[12px] text-content-subtle tabular-nums">{count}</div>}
        </div>
        {children}
    </div>
);

// Resumen de un cierre: lo vendido, cómo cuadró cada gaveta, lo cobrado por cuenta y método,
// y las ventas del turno. Lee el mismo resumen que el cierre de turno, así que las cifras son
// las que vio el cajero al cerrar.
function ResumenCierre({ session, onClose, onOpenSale }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!session) { setData(null); return; }
        let vivo = true;
        setLoading(true); setError(""); setData(null);
        api.cashSessions.summary(session.id)
            .then(r => { if (vivo) setData(r.data); })
            .catch(e => { if (vivo) setError(e.message || "No se pudo cargar el resumen"); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [session]);

    if (!session) return null;

    const ventas  = data?.sales;
    const arqueo  = data?.journal_summary || [];
    const cobros  = data?.payments_by_journal || [];
    const lista   = data?.sales_list || [];
    const enArqueo = new Set(arqueo.map(j => j.journal_id));
    const sinArqueo = new Set(cobros.filter(p => !enArqueo.has(p.id)).map(p => p.id));
    const notas   = data?.session?.notes || session.notes;

    const titulo = (
        <span className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/60 flex items-center justify-center shrink-0">
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={LOCK} /></svg>
            </span>
            <span className="min-w-0">
                <span className="block text-[17px] font-bold tracking-[-0.015em]">Cierre #{session.id}</span>
                <span className="block text-[13px] font-normal text-content-subtle truncate">
                    {toNameCase(session.employee?.full_name)} · {toNameCase(session.warehouse?.name)}
                </span>
            </span>
        </span>
    );

    return (
        <Modal open onClose={onClose} title={titulo} width={720}>
            {loading ? (
                <div className="flex items-center justify-center py-16 gap-3 text-content-subtle">
                    <div className="w-5 h-5 rounded-full border-2 border-content-subtle/20 border-t-content-subtle animate-spin" />
                    <span className="text-[13px]">Cargando el resumen…</span>
                </div>
            ) : error ? (
                <div className="bg-red-500/10 text-red-700 dark:text-red-400 text-[13px] font-medium rounded-lg px-3 py-2.5">{error}</div>
            ) : data && (
                <div className="pb-1">
                    {/* El turno en cuatro datos. */}
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-y-1 rounded-lg bg-surface-2 dark:bg-white/[0.04] sm:divide-x divide-border/70 dark:divide-white/[0.06]">
                        {[
                            { label: "Turno", value: fmtDuracion(session.opened_at, session.closed_at), sub: rangoCorto(session) },
                            { label: "Ventas", value: ventas.sale_count, sub: ventas.sale_count === 1 ? "factura" : "facturas" },
                            { label: "Facturado", value: <Money value={fmtMoney(ventas.total_sales)} />, sub: ventas.total_discounts > 0 ? <>Descuentos <Money value={fmtMoney(ventas.total_discounts)} /></> : null },
                            {
                                label: "Pendiente",
                                value: <Money value={fmtMoney(ventas.total_pending)} />,
                                sub: ventas.pending_count > 0 ? `${ventas.pending_count} por cobrar` : "Nada por cobrar",
                                alerta: ventas.pending_count > 0,
                            },
                        ].map(({ label, value, sub, alerta }) => (
                            <div key={label} className="px-4 py-3 min-w-0">
                                <dt className="text-[12px] text-content-subtle mb-1">{label}</dt>
                                <dd className={`text-[16px] font-bold tabular-nums truncate ${alerta ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`}>{value}</dd>
                                {sub && <dd className="text-[12px] text-content-subtle truncate mt-0.5 tabular-nums">{sub}</dd>}
                            </div>
                        ))}
                    </dl>

                    {/* Cuadre de cada gaveta. Esperado se recalcula; contado y diferencia son lo
                        que se anotó al cerrar. */}
                    {arqueo.length > 0 && (
                        <Seccion title="Cuadre de caja">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {arqueo.map(j => {
                                    const sym  = j.currency_symbol || "Ref.";
                                    const f    = (n) => fmtMoney(parseFloat(n) || 0, sym);
                                    const dif  = parseFloat(j.difference) || 0;
                                    const out  = parseFloat(j.cash_out ?? j.change_out) || 0;
                                    const est  = !descuadra(dif)
                                        ? { txt: "Cuadra exacto", cls: "text-emerald-700 dark:text-emerald-400", icon: "M5 13l4 4L19 7" }
                                        : dif > 0
                                            ? { txt: <>Sobran <Money value={f(dif)} /></>, cls: "text-amber-700 dark:text-amber-400", icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }
                                            : { txt: <>Faltan <Money value={f(-dif)} /></>, cls: "text-red-600 dark:text-red-400", icon: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" };
                                    return (
                                        <div key={j.journal_id} className="rounded-xl border border-border/70 dark:border-white/[0.08] overflow-hidden">
                                            <div className="flex items-center gap-2 px-4 pt-3">
                                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: j.journal_color || "#94a3b8" }} />
                                                <span className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(j.journal_name)}</span>
                                            </div>
                                            <div className="px-4 pt-2 pb-3 space-y-1.5">
                                                <Linea label="Fondo inicial" value={f(j.opening_amount)} />
                                                <Linea label="Cobros en efectivo" value={`+${f(j.cash_in)}`} />
                                                {parseFloat(j.manual_in) > 0 && <Linea label="Ingresos manuales" value={`+${f(j.manual_in)}`} />}
                                                {out > 0 && <Linea label="Egresos y vueltos" value={`-${f(out)}`} />}
                                                <Linea label="Debería haber" value={f(j.expected_amount)} strong />
                                                <Linea label="Contado" value={j.closing_amount != null ? f(j.closing_amount) : "—"} />
                                            </div>
                                            <div className={`px-4 py-2.5 bg-surface-2/70 dark:bg-white/[0.03] border-t border-border/70 dark:border-white/[0.06] flex items-center gap-1.5 text-[13px] font-semibold ${est.cls}`}>
                                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={est.icon} /></svg>
                                                {est.txt}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Seccion>
                    )}

                    {cobros.length > 0 && (
                        <Seccion title="Cobros del turno">
                            <CobrosDelTurno items={cobros} sinArqueo={sinArqueo} />
                        </Seccion>
                    )}

                    {data.returns?.count > 0 && (
                        <div className="mt-4 flex justify-between items-center gap-3 rounded-lg bg-surface-2 dark:bg-white/[0.04] px-3 py-2.5">
                            <span className="text-[13px] text-content-subtle">Devoluciones en el turno · {data.returns.count}</span>
                            <Money value={`-${fmtMoney(data.returns.total)}`} className="text-[13px] font-semibold text-red-600 dark:text-red-400" />
                        </div>
                    )}

                    {notas && (
                        <Seccion title="Notas del cierre">
                            <p className="text-[13px] text-content dark:text-white/85 leading-relaxed whitespace-pre-line rounded-lg bg-surface-2 dark:bg-white/[0.04] px-3 py-2.5">{notas}</p>
                        </Seccion>
                    )}

                    {/* Ventas del turno: dos renglones por venta, sin tabla. Tocar abre la venta. */}
                    <Seccion title="Ventas del turno" count={lista.length || null}>
                        {lista.length === 0 ? (
                            <div className="py-6 text-center">
                                <div className="text-[13px] font-semibold text-content dark:text-white">Sin ventas en este turno</div>
                                <div className="text-[12px] text-content-subtle mt-0.5">El turno se abrió y se cerró sin facturar.</div>
                            </div>
                        ) : (
                            <div className="divide-y divide-border/60 dark:divide-white/[0.06] -mx-2">
                                {lista.map(sale => (
                                    <button key={sale.id} onClick={() => onOpenSale(sale.id)}
                                        className="w-full text-left px-2 py-2.5 rounded-lg hover:bg-surface-2 dark:hover:bg-white/[0.03] transition-colors">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums truncate">{sale.invoice_number || `#${sale.id}`}</span>
                                            <Money value={fmtMoney(sale.total)} className="text-[13px] font-semibold text-content dark:text-white" />
                                        </div>
                                        <div className="mt-0.5 flex items-center justify-between gap-3">
                                            <span className="text-[12px] text-content-subtle truncate">
                                                {toNameCase(sale.customer_name) || "Venta casual"} · {fmtTime(sale.created_at)}
                                            </span>
                                            <StatusMark status={estadoVenta(sale.status)} />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </Seccion>
                </div>
            )}
        </Modal>
    );
}
