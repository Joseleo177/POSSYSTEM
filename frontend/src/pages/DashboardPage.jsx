import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { fmtNumber, fmtInt, toNameCase } from "../helpers";
import { useApp } from "../context/AppContext";

import Page from "../components/ui/Page";
import CustomSelect from "../components/ui/CustomSelect";
import { BarChart } from "./reportes/reportes.utils";

const fmt = (n, d = 2) => fmtNumber(n, d);
const fmtN = (n) => fmtInt(n);

// Tarjeta del tablero. Mismo criterio que los reportes: la cifra va en tinta y solo se pinta
// de rojo cuando es negativa (una caja en rojo sí es una alerta). Antes cada tarjeta traía su
// color —azul, verde, turquesa, rojo— más un círculo decorativo en la esquina.
function KpiCard({ label, valueBase, valueLocal, baseSym, localSym, foot, icon }) {
    const negativo = parseFloat(valueBase) < 0;
    const cifra = negativo ? "text-red-600 dark:text-red-400" : "text-content dark:text-white";
    return (
        <div className="bg-white dark:bg-white/[0.03] border border-border/70 dark:border-white/[0.06] rounded-xl p-4 flex flex-col min-w-0">
            <div className="flex items-center gap-2 mb-3 text-content-subtle">
                <span className="w-7 h-7 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">{icon}</span>
                <span className="text-[13px] font-medium truncate">{label}</span>
            </div>
            <div className={`text-[24px] font-bold tabular-nums tracking-[-0.02em] leading-none truncate ${cifra}`}>
                <span className="text-[0.62em] font-semibold text-content-subtle mr-1">{baseSym}</span>{fmt(valueBase)}
            </div>
            {valueLocal !== undefined && localSym !== baseSym && (
                <div className="text-[13px] font-medium tabular-nums text-content-subtle mt-1.5 truncate">{localSym} {fmt(valueLocal)}</div>
            )}
            {foot && (
                <div className="text-[12px] text-content-subtle border-t border-border/60 dark:border-white/[0.06] pt-2.5 mt-3.5 tabular-nums">{foot}</div>
            )}
        </div>
    );
}

const Icon = ({ d }) => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} /></svg>
);

// Cabecera de tarjeta que lleva a su reporte: título en tinta y flecha gris.
const CardLink = ({ title, sub, onClick }) => (
    <button onClick={onClick} className="flex items-start gap-3 mb-4 w-full text-left group/head">
        <div className="min-w-0">
            <div className="text-[14px] font-semibold text-content dark:text-white">{title}</div>
            {sub && <div className="text-[12px] text-content-subtle mt-0.5">{sub}</div>}
        </div>
        <svg className="w-4 h-4 ml-auto mt-0.5 text-content-subtle/60 group-hover/head:text-content group-hover/head:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
    </button>
);

const CARD = "bg-white dark:bg-white/[0.03] rounded-xl border border-border/70 dark:border-white/[0.06] p-5";

export default function DashboardPage() {
    const { baseCurrency, activeCurrencies, triggerAction } = useApp();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const localCur  = activeCurrencies?.find(c => !c.is_base);
    const baseSym   = baseCurrency?.symbol || "Ref.";
    const localSym  = localCur?.symbol     || baseSym;
    const localRate = parseFloat(localCur?.exchange_rate || 1);

    // Sucursal a mirar. "" = todas las que el empleado tiene permitidas (o toda la empresa,
    // si es admin). Con una sola sucursal, mostrar el selector solo insinuaría que hay más.
    const [warehouseId, setWarehouseId] = useState("");
    const [warehouses, setWarehouses] = useState([]);
    useEffect(() => {
        // Un depósito no vende: no aporta nada a un tablero de negocio.
        api.warehouses.getAll().then(r => setWarehouses((r.data || []).filter(w => w.sells !== false))).catch(() => {});
    }, []);
    const todasLabel = warehouses.length === 1 ? warehouses[0].name : "Todas las sucursales";

    const load = useCallback(async () => {
        setLoading(true);
        try { const res = await api.dashboard.get(warehouseId ? { warehouse_id: warehouseId } : {}); setData(res.data); }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }, [warehouseId]);

    useEffect(() => { load(); }, [load]);

    if (loading) return (
        <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-content-subtle/20 border-t-content-subtle animate-spin" />
            <div className="text-[13px] text-content-subtle">Cargando el tablero…</div>
        </div>
    );

    if (error) return (
        <div className="h-full flex items-center justify-center p-6 text-center">
            <div className="max-w-md">
                <div className="text-[15px] font-semibold text-content dark:text-white mb-1">No se pudo cargar el tablero</div>
                <p className="text-[13px] text-content-subtle mb-5">{error}</p>
                <button onClick={load} className="btn-accent h-9 px-4 rounded-lg text-[13px] font-semibold">Reintentar</button>
            </div>
        </div>
    );

    const { kpi, top_products, sales_by_day, pending_bills, low_stock, purchases_month } = data;
    const plural = (n, uno, varios) => `${fmtN(n)} ${n === 1 ? uno : varios}`;

    return (
        <Page module="Panel" title="Inteligencia de negocio" subheader={
            <div className="shrink-0 px-4 py-2 border-b border-border/60 dark:border-white/[0.06] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 min-w-0 text-[13px] text-content-subtle">
                    <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15" />
                    <span className="truncate">En línea · {new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" })}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {warehouses.length > 1 && (
                        <CustomSelect
                            value={warehouseId}
                            onChange={setWarehouseId}
                            placeholder={todasLabel}
                            className="flex-1 min-w-0 sm:flex-none"
                            boxClassName="h-9 w-full sm:min-w-[190px]"
                            options={[
                                { value: "", label: todasLabel },
                                ...warehouses.map(w => ({ value: String(w.id), label: w.name })),
                            ]}
                        />
                    )}
                    <button onClick={load} title="Actualizar métricas" className="btn-outline h-9 px-3 shrink-0 flex items-center gap-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap">
                        <svg className="w-4 h-4 shrink-0 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        Actualizar
                    </button>
                </div>
            </div>
        }>
            <div className="flex-1 min-h-0 overflow-auto p-1 sm:p-2 space-y-4">

                {/* ── Cifras del día ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <KpiCard
                        label="Facturación hoy"
                        valueBase={kpi.today.revenue}
                        valueLocal={kpi.today.revenue * localRate}
                        baseSym={baseSym}
                        localSym={localSym}
                        foot={plural(kpi.today.sales, "venta", "ventas")}
                        icon={<Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
                    />
                    <KpiCard
                        label="Cobranza real hoy"
                        valueBase={kpi.today.income}
                        valueLocal={kpi.today.income * localRate}
                        baseSym={baseSym}
                        localSym={localSym}
                        foot={plural(kpi.today.sales, "venta", "ventas")}
                        icon={<Icon d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                    />
                    <KpiCard
                        label="Saldo disponible en cajas"
                        valueBase={kpi.cash_in_hand}
                        valueLocal={kpi.cash_in_hand * localRate}
                        baseSym={baseSym}
                        localSym={localSym}
                        foot="Fondo total de todas las cajas"
                        icon={<Icon d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />}
                    />
                    <KpiCard
                        label="Cuentas por cobrar"
                        valueBase={pending_bills.balance}
                        valueLocal={pending_bills.balance * localRate}
                        baseSym={baseSym}
                        localSym={localSym}
                        foot={plural(pending_bills.count, "factura", "facturas")}
                        icon={<Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />}
                    />
                </div>

                {/* ── Tendencia y lo más vendido ── */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-3">
                    <div className={CARD}>
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div>
                                <div className="text-[14px] font-semibold text-content dark:text-white">Facturación de los últimos 30 días</div>
                                <div className="text-[12px] text-content-subtle mt-0.5">
                                    {warehouseId ? toNameCase(warehouses.find(w => String(w.id) === warehouseId)?.name) : todasLabel}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[12px] text-content-subtle">Total 30 días</div>
                                <div className="text-[15px] font-bold text-content dark:text-white tabular-nums">{baseSym} {fmt(kpi.month.revenue)}</div>
                            </div>
                        </div>
                        {sales_by_day?.length
                            ? <BarChart data={sales_by_day} xKey="day" yKey="revenue" height={220} format={(v) => `${baseSym} ${fmt(v)}`} />
                            : <div className="h-[220px] flex items-center justify-center text-[13px] text-content-subtle">Sin ventas en el período</div>}
                    </div>

                    <div className={CARD}>
                        {/* La cabecera lleva al reporte de ventas, donde está el detalle por
                            producto: el tablero muestra el top, no lo explica. */}
                        <CardLink title="Lo más vendido" sub="Por unidades, últimos 30 días" onClick={() => triggerAction("Reportes", "reportes:ventas")} />
                        {top_products.length === 0 ? (
                            <div className="py-16 text-center text-[13px] text-content-subtle">Sin movimientos todavía</div>
                        ) : (
                            /* Alto fijo con scroll propio: entran los 15 productos sin que la
                               caja crezca y descuadre la fila del gráfico. */
                            <div className="space-y-3.5 max-h-[268px] overflow-y-auto pr-1.5">
                                {top_products.map((p, i) => {
                                    const pct = Math.round((p.total_qty / (top_products[0]?.total_qty || 1)) * 100);
                                    return (
                                        <div key={p.product_id}>
                                            <div className="flex justify-between items-baseline gap-3 mb-1.5">
                                                <div className="flex items-baseline gap-2 min-w-0">
                                                    <span className="text-[12px] text-content-subtle tabular-nums w-4 shrink-0">{i + 1}</span>
                                                    <span className="text-[13px] font-medium text-content dark:text-white truncate">{p.name}</span>
                                                </div>
                                                <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums shrink-0">{fmt(p.total_qty, 0)} <span className="text-[11px] font-normal text-content-subtle">uds</span></span>
                                            </div>
                                            <div className="h-1.5 ml-6 bg-surface-3 dark:bg-white/[0.06] rounded-full overflow-hidden">
                                                <div className="h-full bg-chart rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Alertas y compras ── */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    <div className={CARD}>
                        <CardLink
                            title={low_stock.length ? `Stock bajo · ${low_stock.length} ${low_stock.length === 1 ? "producto" : "productos"}` : "Stock bajo"}
                            sub="Por debajo del mínimo de su sucursal"
                            onClick={() => triggerAction("Reportes", "reportes:inventario")}
                        />
                        {low_stock.length === 0 ? (
                            <div className="py-10 text-center text-[13px] text-content-subtle">Todo el inventario está sobre su mínimo</div>
                        ) : (
                            /* Mismo criterio que "Lo más vendido": la caja no crece, la lista
                               se desplaza dentro. */
                            <div className="divide-y divide-border/60 dark:divide-white/[0.06] max-h-[268px] overflow-y-auto pr-1.5 -mx-1">
                                {/* El aviso es por sucursal, así que un mismo producto puede
                                    aparecer dos veces: la clave lleva el almacén. */}
                                {low_stock.map(p => (
                                    <div key={`${p.id}-${p.warehouse_id}`} className="flex items-center justify-between gap-3 px-1 py-2.5">
                                        <div className="min-w-0">
                                            <div className="text-[13px] font-medium text-content dark:text-white truncate">{p.name}</div>
                                            <div className="text-[12px] text-content-subtle truncate">{toNameCase(p.warehouse_name)} · mínimo {fmt(p.min_stock, 0)} {String(p.unit || "").toLowerCase()}</div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-[15px] font-semibold text-red-600 dark:text-red-400 tabular-nums">{fmt(p.stock, 0)}</span>
                                            <span className="text-[12px] text-content-subtle ml-1">{String(p.unit || "").toLowerCase()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className={CARD}>
                        <div className="mb-4">
                            <div className="text-[14px] font-semibold text-content dark:text-white">Inversión en mercancía</div>
                            <div className="text-[12px] text-content-subtle mt-0.5">Compras de los últimos 30 días</div>
                        </div>
                        <div className="text-[28px] font-bold text-content dark:text-white tracking-[-0.02em] tabular-nums leading-none">
                            <span className="text-[0.55em] font-semibold text-content-subtle mr-1">{baseSym}</span>{fmt(purchases_month.total)}
                        </div>
                        <div className="text-[13px] text-content-subtle mt-2">{plural(purchases_month.count, "compra registrada", "compras registradas")}</div>
                    </div>
                </div>
            </div>
        </Page>
    );
}
