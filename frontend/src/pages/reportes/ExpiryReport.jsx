import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import SucursalFilter, { useSucursalFilter } from "../../components/ui/SucursalFilter";
import Segmented from "../../components/ui/Segmented";
import StatusMark, { LOT_STATUS } from "../../components/ui/StatusMark";
import { fmtNumber, toNameCase } from "../../helpers";
import { fmtDateShort } from "../../helpers/dates";
import { fmtCant, unidadCorta } from "../../components/warehouses/movementMeta";
import { Loading, ExportButton, KpiCard } from "./reportes.utils";

const FILTERS = [
    { key: "all",     label: "Todos" },
    { key: "expired", label: "Vencidos" },
    { key: "d30",     label: "≤ 30 d" },
    { key: "d90",     label: "≤ 90 d" },
    { key: "d180",    label: "≤ 180 d" },
];

const lotBucket = (days) => {
    if (days < 0) return "expired";
    if (days <= 30) return "d30";
    if (days <= 90) return "d90";
    if (days <= 180) return "d180";
    return "ok";
};

const fmtDays = (d) => {
    if (d < 0) return `Hace ${Math.abs(d)} ${Math.abs(d) === 1 ? "día" : "días"}`;
    if (d === 0) return "Vence hoy";
    return `En ${d} ${d === 1 ? "día" : "días"}`;
};

const fmtRef = (n) => `Ref. ${fmtNumber(n || 0, 2)}`;

export default function ExpiryReport() {
    const [loading, setLoading] = useState(true);
    const [lots, setLots] = useState([]);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const suc = useSucursalFilter();

    useEffect(() => {
        let alive = true;
        setLoading(true);
        api.reports.expiry(suc.warehouseId ? { warehouse_id: suc.warehouseId } : {})
            .then(r => {
                if (!alive) return;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const rows = (r.data || []).map(l => {
                    const days = l.days_left != null
                        ? l.days_left
                        : Math.ceil((new Date(`${l.expiry}T00:00:00`) - today) / (1000 * 60 * 60 * 24));
                    return { ...l, days_left: days, bucket: lotBucket(days) };
                });
                setLots(rows);
            })
            .catch(() => { if (alive) setLots([]); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [suc.warehouseId]);

    const summary = useMemo(() => {
        let expiredCount = 0, expiredVal = 0;
        let d30Count = 0, d30Val = 0;
        let d180Count = 0, d180Val = 0;
        for (const l of lots) {
            const val = parseFloat(l.value_at_risk || 0);
            if (l.days_left < 0) { expiredCount++; expiredVal += val; }
            else if (l.days_left <= 30) { d30Count++; d30Val += val; }
            else if (l.days_left <= 180) { d180Count++; d180Val += val; }
        }
        return { expiredCount, expiredVal, d30Count, d30Val, d180Count, d180Val, total: lots.length };
    }, [lots]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return lots.filter(l => {
            if (filter === "expired" && l.days_left >= 0) return false;
            if (filter === "d30" && (l.days_left < 0 || l.days_left > 30)) return false;
            if (filter === "d90" && (l.days_left < 0 || l.days_left > 90)) return false;
            if (filter === "d180" && (l.days_left < 0 || l.days_left > 180)) return false;
            if (q) {
                const hay = [l.product, l.active_ingredient, l.lot, l.warehouse, l.shelf_location]
                    .filter(Boolean).join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [lots, filter, search]);

    const exportCSV = () => {
        if (!filtered.length) return;
        const headers = ["Producto", "Principio activo", "Lote", "Sucursal", "Anaquel", "Stock", "Unidad", "Vencimiento", "Días", "Estado", "Valor costo (Ref.)"];
        const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [
            headers.map(esc).join(","),
            ...filtered.map(l => [
                l.product,
                l.active_ingredient || "",
                l.lot,
                l.warehouse,
                l.shelf_location || "",
                l.stock,
                l.unit,
                fmtDateShort(l.expiry),
                l.days_left,
                LOT_STATUS[l.bucket]?.label || "",
                Number(l.value_at_risk || 0).toFixed(2),
            ].map(esc).join(","))
        ];
        const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `vencimientos-lotes.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="lg:h-full flex flex-col space-y-4 lg:overflow-hidden">
            {/* Barra de controles */}
            <div className="shrink-0 flex flex-wrap items-center gap-2">
                <Segmented value={filter} onChange={setFilter} options={FILTERS} />
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar producto, lote o principio activo…"
                        className="input h-9 pl-9 text-[12.5px]"
                    />
                </div>
                <SucursalFilter filter={suc} />
                <div className="ml-auto">
                    {filtered.length > 0 && <ExportButton onClick={exportCSV} label="Exportar CSV" />}
                </div>
            </div>

            {/* KPIs */}
            <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard
                    label="Lotes vencidos"
                    value={String(summary.expiredCount)}
                    sub={summary.expiredVal > 0 ? `${fmtRef(summary.expiredVal)} en costo` : "Sin pérdidas vencidas"}
                    tone={summary.expiredCount > 0 ? "danger" : undefined}
                />
                <KpiCard
                    label="Vencen en ≤ 30 días"
                    value={String(summary.d30Count)}
                    sub={summary.d30Val > 0 ? `${fmtRef(summary.d30Val)} en riesgo` : "Sin urgencias"}
                    tone={summary.d30Count > 0 ? "warning" : undefined}
                />
                <KpiCard
                    label="Ventana droguería (31–180 d)"
                    value={String(summary.d180Count)}
                    sub={summary.d180Val > 0 ? `${fmtRef(summary.d180Val)} para devolución` : "Sin lotes próximos"}
                />
                <KpiCard
                    label="Total lotes con stock"
                    value={String(summary.total)}
                    sub={suc.nombre || "Todas las sucursales"}
                />
            </div>

            {/* Contenido */}
            {loading ? (
                <Loading />
            ) : filtered.length === 0 ? (
                <div className="card flex-1 flex flex-col items-center justify-center py-16 text-center px-6">
                    <p className="text-[14px] font-semibold text-content dark:text-white">
                        {lots.length === 0 ? "No hay lotes registrados con existencia" : "Ningún lote coincide con el filtro"}
                    </p>
                    <p className="text-[12.5px] text-content-subtle mt-1 max-w-md">
                        Los lotes se cargan al recibir órdenes de compra y se descuentan automáticamente por orden FEFO (el que vence primero sale primero) al vender o transferir.
                    </p>
                </div>
            ) : (
                <div className="card flex-1 min-h-0 flex flex-col overflow-hidden">
                    {/* Móvil */}
                    <div className="md:hidden divide-y divide-border/50 dark:divide-white/[0.06] overflow-y-auto">
                        {filtered.map(l => (
                            <div key={l.id} className="px-4 py-3 space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(l.product)}</div>
                                        <div className="text-[12px] text-content-subtle">
                                            Lote {l.lot} · {l.warehouse}
                                            {l.shelf_location ? ` · ${l.shelf_location}` : ""}
                                        </div>
                                    </div>
                                    <StatusMark status={l.bucket} map={LOT_STATUS} />
                                </div>
                                <div className="flex items-center justify-between text-[12px] pt-1">
                                    <span className="font-semibold tabular-nums text-content dark:text-white">
                                        {fmtCant(l.stock, l.unit)} {unidadCorta(l.unit, l.stock)}
                                    </span>
                                    <span className="tabular-nums text-content-subtle">
                                        {fmtDateShort(l.expiry)} · {fmtDays(l.days_left)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Escritorio */}
                    <div className="hidden md:block flex-1 overflow-auto">
                        <table className="table-ledger w-full">
                            <thead>
                                <tr>
                                    <th className="pl-5">Producto</th>
                                    <th>Lote</th>
                                    <th>Sucursal</th>
                                    <th className="text-right">Existencia</th>
                                    <th className="text-right">Vencimiento</th>
                                    <th>Estado</th>
                                    <th className="text-right pr-5">Valor costo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(l => (
                                    <tr key={l.id}>
                                        <td className="pl-5">
                                            <div className="text-[13px] font-semibold text-content dark:text-white">{toNameCase(l.product)}</div>
                                            {(l.active_ingredient || l.shelf_location) && (
                                                <div className="text-[12px] text-content-subtle">
                                                    {[l.active_ingredient, l.shelf_location].filter(Boolean).join(" · ")}
                                                </div>
                                            )}
                                        </td>
                                        <td className="text-[13px] font-medium tabular-nums text-content dark:text-white whitespace-nowrap">{l.lot}</td>
                                        <td className="text-[13px] text-content-subtle whitespace-nowrap">{l.warehouse}</td>
                                        <td className="text-right text-[13px] font-semibold tabular-nums text-content dark:text-white whitespace-nowrap">
                                            {fmtCant(l.stock, l.unit)} <span className="text-[11px] font-normal text-content-subtle">{unidadCorta(l.unit, l.stock)}</span>
                                        </td>
                                        <td className="text-right whitespace-nowrap">
                                            <div className="text-[13px] font-medium tabular-nums text-content dark:text-white">{fmtDateShort(l.expiry)}</div>
                                            <div className={`text-[11.5px] tabular-nums ${l.days_left < 0 ? "text-red-600 dark:text-red-400 font-medium" : l.days_left <= 30 ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                                                {fmtDays(l.days_left)}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap">
                                            <StatusMark status={l.bucket} map={LOT_STATUS} />
                                        </td>
                                        <td className="text-right pr-5 text-[13px] font-medium tabular-nums text-content dark:text-white whitespace-nowrap">
                                            {l.value_at_risk > 0 ? fmtRef(l.value_at_risk) : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
