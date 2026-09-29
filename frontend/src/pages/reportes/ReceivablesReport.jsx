import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { buildReceivablesExcel } from "../../helpers/excel";
import { printReceivablesReport } from "../../helpers/printReceivablesReport";
import { useApp } from "../../context/AppContext";
import CustomSelect from "../../components/ui/CustomSelect";
import { toNameCase } from "../../helpers";
import {
    fmt$, fmtN, pct,
    useReport, usePagination, Pagination,
    KpiCard, SectionHeader, Card, Loading, ExportButton,
} from "./reportes.utils";

export default function ReceivablesReport() {
    // Cuánto debe cada cliente es por sucursal: la deuda que arrastra en la A no la puede
    // cobrar ni explicar la B. Mismo criterio que el resto de los reportes.
    const [warehouseId, setWarehouseId] = useState("");
    const [warehouses, setWarehouses] = useState([]);
    useEffect(() => {
        api.warehouses.getAll()
            // Un depósito no vende ni cobra: no arrastra deuda propia.
            .then(r => setWarehouses((r.data || []).filter(w => w.sells !== false)))
            .catch(e => console.error("[ReceivablesReport] no se pudieron cargar los almacenes:", e));
    }, []);
    const todasLabel = warehouses.length === 1 ? warehouses[0].name : "Todas las sucursales";

    const params = { warehouse_id: warehouseId };
    const { data, loading, error } = useReport(api.reports.receivables, params, [warehouseId]);
    const { companyInfo, baseCurrency, activeCurrencies } = useApp();
    const s = data?.summary;
    const a = data?.aging;
    const custPag = usePagination(data?.by_customer ?? []);

    return (
        <div className="h-full flex flex-col space-y-4 overflow-auto">
            <div className="flex items-center shrink-0 gap-2 flex-wrap">
                {/* Con una sola sucursal no hay nada que elegir: mostrar el selector solo
                    insinuaría que hay más, cuando no las hay. */}
                {warehouses.length > 1 && (
                <CustomSelect
                    value={warehouseId}
                    onChange={setWarehouseId}
                    placeholder={todasLabel}
                    boxClassName="h-10 min-w-[190px]"
                    options={[
                        { value: "", label: todasLabel },
                        ...warehouses.map(w => ({ value: String(w.id), label: w.name }))
                    ]}
                />
                )}
                <div className="flex items-center gap-2 ml-auto">
                {data && (
                    <button
                        onClick={() => printReceivablesReport(data, companyInfo, baseCurrency, activeCurrencies)}
                        title="Estado de cuentas por cobrar en PDF, para salir a cobrar"
                        className="btn-outline shrink-0 whitespace-nowrap flex items-center gap-2 h-10 px-3 sm:px-4 text-[13px] font-semibold rounded-lg active:scale-[0.98] disabled:opacity-60"
                    >
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="hidden sm:inline">Reporte PDF</span>
                        <span className="sm:hidden">PDF</span>
                    </button>
                )}
                {data && <ExportButton onClick={() => buildReceivablesExcel(data)} />}
                </div>
            </div>

            {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
            {!loading && error && <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-bold">{error}</div>}

            {!loading && !error && data && (
                <div className="flex-1 min-h-0 space-y-3 overflow-auto">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <KpiCard label="Facturas pendientes" value={fmtN(s.total_invoices || 0)} icon="" color="text-content dark:text-white" />
                        <KpiCard label="Saldo en calle" value={fmt$(s.total_balance || 0)} icon="" color="text-danger" />
                        <KpiCard label="Cartera total" value={fmt$(s.total_billed || 0)} icon="" color="text-content dark:text-white" />
                        <KpiCard label="Recuperación" value={`${pct((s.total_billed || 0) - (s.total_balance || 0), s.total_billed || 1)}%`} icon="" color="text-content dark:text-white" />
                    </div>

                    {/* Antigüedad en tres tramos. Antes eran tres cajas rellenas de verde,
                        turquesa y rojo: el verde decía "bien" de una deuda, y el turquesa no
                        decía nada. Ahora son tarjetas blancas; el color de estado va solo en el
                        punto y en la barra —gris lo reciente, ámbar lo que se atrasa, rojo lo
                        crítico— y la barra muestra qué parte del saldo está en cada tramo. */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {(() => {
                            const tramos = [
                                { label: "0 a 30 días",   amount: a.d0_30_amount,   dot: "bg-content-subtle/50", bar: "bg-content-subtle/40" },
                                { label: "31 a 60 días",  amount: a.d31_60_amount,  dot: "bg-amber-500",         bar: "bg-amber-500" },
                                { label: "Más de 60 días", amount: a.d60_plus_amount, dot: "bg-red-500",          bar: "bg-red-500" },
                            ];
                            const total = tramos.reduce((t, b) => t + parseFloat(b.amount || 0), 0);
                            return tramos.map(b => (
                                <div key={b.label} className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-4 py-3.5">
                                    <div className="flex items-center gap-2 text-[12px] font-medium text-content-subtle">
                                        <span className={`w-2 h-2 rounded-full ${b.dot}`} />{b.label}
                                    </div>
                                    <div className="mt-1.5 flex items-baseline justify-between gap-2">
                                        <span className="text-[18px] font-bold text-content dark:text-white tabular-nums">{fmt$(b.amount || 0)}</span>
                                        <span className="text-[12px] text-content-subtle tabular-nums">{pct(parseFloat(b.amount || 0), total)}%</span>
                                    </div>
                                    <div className="mt-2 h-1.5 rounded-full bg-surface-3 dark:bg-white/[0.06] overflow-hidden">
                                        <div className={`h-full rounded-full ${b.bar}`} style={{ width: `${total > 0 ? (parseFloat(b.amount || 0) / total) * 100 : 0}%` }} />
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>

                    <Card className="!p-0 min-h-0 flex flex-col overflow-hidden">
                        <div className="px-4 pt-4">
                            <SectionHeader title="Antigüedad de cartera" sub="Gestión de cobranza por cliente" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="table-ledger min-w-[600px]">
                                <thead>
                                    <tr>
                                        {["Cliente", "Facturas", "Saldo", "Antigüedad"].map((h, i) => (
                                            <th key={h} className={`px-4 ${i >= 1 ? "text-right" : ""}`}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {custPag.total === 0
                                        ? <tr><td colSpan={4} className="px-4 py-16 text-center text-[12px] font-bold text-content-subtle">Sin cuentas por cobrar pendientes</td></tr>
                                        : custPag.paginated.map((c, i) => {
                                            const daysDiff = Math.floor((Date.now() - new Date(c.oldest_invoice)) / 86400000);
                                            return (
                                                <tr key={i} data-tone={daysDiff > 60 ? "" : undefined} style={daysDiff > 60 ? { "--row-tone": "#ef4444" } : undefined}>
                                                    <td className="px-4">
                                                        <div className="font-semibold text-content dark:text-white">{toNameCase(c.customer_name)}</div>
                                                        <div className="text-[12px] text-content-subtle tabular-nums">{c.phone || "Sin teléfono"}</div>
                                                    </td>
                                                    <td className="px-4 text-right tabular-nums text-[13px] text-content-muted">{c.invoice_count}</td>
                                                    <td className="px-4 text-right tabular-nums text-[14px] font-semibold text-content dark:text-white">{fmt$(c.balance)}</td>
                                                    {/* Los días solo llevan color cuando pesan: ámbar pasado el mes, rojo
                                                        pasados dos. Antes una deuda reciente salía en verde, como si fuera buena. */}
                                                    <td className={`px-4 text-right tabular-nums text-[13px] ${daysDiff > 60 ? "font-semibold text-red-600 dark:text-red-400" : daysDiff > 30 ? "font-semibold text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                                                        {daysDiff} {daysDiff === 1 ? "día" : "días"}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={custPag.page} totalPages={custPag.totalPages} total={custPag.total} onPage={custPag.setPage} />
                    </Card>
                </div>
            )}
        </div>
    );
}
