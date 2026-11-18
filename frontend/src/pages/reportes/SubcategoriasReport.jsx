import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import SucursalFilter, { useSucursalFilter } from "../../components/ui/SucursalFilter";
import CustomSelect from "../../components/ui/CustomSelect";
import { fmtMoney, toNameCase } from "../../helpers";
import { fmtNumber } from "../../helpers/numbers";
import { monedaLocal } from "../../helpers/currency";
import {
    fmt$, fmtN,
    useReport, defaultRange, useHourRange,
    DateRangePicker, HourRangePicker, NightShiftNotice, KpiCard, SectionHeader, Card, Loading,
} from "./reportes.utils";

export default function SubcategoriasReport() {
    const [range, setRange] = useState(defaultRange(30));
    const hr = useHourRange();
    const suc = useSucursalFilter({ soloVenden: true });
    const { baseCurrency, activeCurrencies } = useApp();
    const sym = baseCurrency?.symbol || "Ref.";

    const local = monedaLocal(activeCurrencies);
    const tasaLocal = parseFloat(local?.exchange_rate) || 0;
    const localSym = local?.symbol || "Bs.";

    const [categories, setCategories] = useState([]);
    const [categoryId, setCategoryId] = useState("");
    const [subcategory, setSubcategory] = useState("");
    const [q, setQ] = useState("");

    // Calculadora opcional para pago por plato (ej. pagarle al parrillero por cada plato de parrilla).
    const [pagoPorPlato, setPagoPorPlato] = useState("");
    const [monedaPago, setMonedaPago] = useState("base"); // "base" | "local"

    useEffect(() => {
        api.categories.getAll().then(r => setCategories(r.data || [])).catch(() => setCategories([]));
    }, []);

    const params = {
        date_from: range.from,
        date_to: range.to,
        warehouse_id: suc.warehouseId,
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(subcategory ? { subcategory } : {}),
        limit: 1000,
        ...hr.params,
    };

    const { data, loading, error } = useReport(
        api.reports.products,
        params,
        [range, hr.key, suc.warehouseId, categoryId, subcategory]
    );

    const gruposSubcat = data?.by_subcategory || [];
    const subcategoriasDisponibles = useMemo(() => {
        const deCat = categoryId
            ? (categories.find(c => String(c.id) === String(categoryId))?.subcategories || [])
            : categories.flatMap(c => c.subcategories || []);
        const deVentas = gruposSubcat
            .filter(g => !categoryId || String(g.category_id) === String(categoryId))
            .map(g => g.subcategory)
            .filter(Boolean);
        const seen = new Set();
        const out = [];
        for (const s of [...deCat, ...deVentas]) {
            const clean = String(s || "").trim();
            if (!clean) continue;
            const k = clean.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(clean);
        }
        return out.sort((a, b) => a.localeCompare(b, "es"));
    }, [categories, categoryId, gruposSubcat]);

    const platos = useMemo(() => {
        const raw = data?.top_by_qty || [];
        const term = q.trim().toLowerCase();
        if (!term) return raw;
        return raw.filter(p =>
            [p.product_name, p.category_name, p.subcategory]
                .some(c => c && String(c).toLowerCase().includes(term))
        );
    }, [data?.top_by_qty, q]);

    const totalUnidades = useMemo(
        () => platos.reduce((acc, p) => acc + (parseFloat(p.total_qty) || 0), 0),
        [platos]
    );
    const totalIngresos = useMemo(
        () => platos.reduce((acc, p) => acc + (parseFloat(p.total_revenue) || 0), 0),
        [platos]
    );

    const tarifaRaw = Math.max(0, parseFloat(String(pagoPorPlato).replace(",", ".")) || 0);
    const tarifaBase = monedaPago === "local" && tasaLocal > 0 ? tarifaRaw / tasaLocal : tarifaRaw;
    const totalPagoBase = totalUnidades * tarifaBase;
    const totalPagoLocal = tasaLocal > 0 ? totalPagoBase * tasaLocal : 0;

    return (
        <div className="lg:h-full flex flex-col space-y-4 lg:overflow-auto">
            {/* Barra de filtros */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <DateRangePicker from={range.from} to={range.to} onChange={(f, t) => setRange({ from: f, to: t })} />
                    <HourRangePicker from={hr.hours.from} to={hr.hours.to} onChange={hr.setHours} />
                    <SucursalFilter filter={suc} />
                    <CustomSelect
                        value={categoryId}
                        onChange={v => { setCategoryId(v); setSubcategory(""); }}
                        placeholder="Todas las categorías"
                        boxClassName="h-10 min-w-[180px]"
                        options={[
                            { value: "", label: "Todas las categorías" },
                            ...categories.map(c => ({ value: String(c.id), label: toNameCase(c.name) })),
                        ]}
                    />
                    <CustomSelect
                        value={subcategory}
                        onChange={setSubcategory}
                        placeholder="Todas las subcategorías"
                        boxClassName="h-10 min-w-[190px]"
                        options={[
                            { value: "", label: "Todas las subcategorías" },
                            { value: "__any__", label: "Con subcategoría" },
                            { value: "__none__", label: "Sin subcategoría" },
                            ...subcategoriasDisponibles.map(s => ({ value: s, label: s })),
                        ]}
                    />
                    {hr.nocturna && <NightShiftNotice from={hr.hours.from} to={hr.hours.to} dateFrom={range.from} dateTo={range.to} />}
                </div>
            </div>

            {loading && <div className="flex-1 flex items-center justify-center"><Loading /></div>}
            {!loading && error && (
                <div className="flex-1 flex items-center justify-center p-12 text-center bg-danger/5 border border-danger/20 rounded-xl text-danger font-bold">
                    {error}
                </div>
            )}

            {!loading && !error && data && (
                <div className="lg:flex-1 lg:min-h-0 space-y-4 lg:overflow-auto">
                    {/* KPIs + Calculadora de pago por unidad */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <KpiCard
                            label={subcategory && subcategory !== "__any__" && subcategory !== "__none__" ? `Unidades vendidas · ${subcategory}` : "Total unidades vendidas"}
                            value={fmtN(totalUnidades)}
                            sub={`${platos.length} ${platos.length === 1 ? "producto distinto" : "productos distintos"}`}
                        />
                        <KpiCard
                            label="Total facturado"
                            value={fmt$(totalIngresos)}
                            sub={tasaLocal > 0 ? fmtMoney(totalIngresos * tasaLocal, localSym) : "En el período seleccionado"}
                        />

                        {/* Calculadora de pago / comisión por unidad */}
                        <Card className="flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div>
                                    <div className="text-[12px] font-bold text-content dark:text-white">Pago o comisión por unidad</div>
                                    <div className="text-[11px] text-content-subtle">Multiplica las unidades vendidas por este monto</div>
                                </div>
                                {tarifaRaw > 0 && (
                                    <div className="text-right">
                                        <div className="text-[16px] font-extrabold tabular-nums text-brand-700 dark:text-brand-300 leading-none">
                                            {fmtMoney(totalPagoBase, sym)}
                                        </div>
                                        {tasaLocal > 0 && (
                                            <div className="text-[11px] font-semibold text-content-subtle tabular-nums mt-0.5">
                                                ≈ {fmtMoney(totalPagoLocal, localSym)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    value={pagoPorPlato}
                                    onChange={e => setPagoPorPlato(e.target.value)}
                                    placeholder={`Monto por unidad (${monedaPago === "local" && tasaLocal > 0 ? localSym : sym})`}
                                    className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-border dark:border-white/10 bg-surface-2/60 dark:bg-white/[0.04] text-[13px] font-semibold text-content dark:text-white placeholder:text-content-subtle/60 placeholder:font-normal focus:outline-none focus:border-brand-500 tabular-nums"
                                />
                                {tasaLocal > 0 ? (
                                    <div className="flex rounded-lg overflow-hidden border border-border dark:border-white/10 shrink-0 h-9">
                                        {[["base", sym], ["local", localSym]].map(([k, l]) => (
                                            <button
                                                key={k}
                                                type="button"
                                                onClick={() => setMonedaPago(k)}
                                                className={`px-2.5 text-[12px] font-bold transition-all ${monedaPago === k
                                                    ? "bg-brand-500/15 text-brand-700 dark:text-brand-300"
                                                    : "bg-white dark:bg-white/[0.04] text-content-subtle"}`}
                                            >
                                                {l}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="h-9 px-2.5 rounded-lg border border-border dark:border-white/10 bg-surface-2 dark:bg-white/[0.04] text-[12px] font-bold text-content-subtle flex items-center shrink-0">
                                        {sym}
                                    </span>
                                )}
                            </div>
                        </Card>
                    </div>

                    {/* Resumen rápido por Subcategoría */}
                    {gruposSubcat.some(g => g.subcategory) && (
                        <Card>
                            <SectionHeader
                                title="Resumen por subcategoría"
                                sub="Toca una subcategoría para filtrar los productos de abajo"
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                                {gruposSubcat.filter(g => g.subcategory).map((g, idx) => {
                                    const activa = subcategory.toLowerCase() === g.subcategory.toLowerCase()
                                        && (!categoryId || String(categoryId) === String(g.category_id));
                                    return (
                                        <button
                                            key={`${g.category_id}-${g.subcategory}-${idx}`}
                                            type="button"
                                            onClick={() => {
                                                if (activa) {
                                                    setSubcategory("");
                                                } else {
                                                    setSubcategory(g.subcategory);
                                                }
                                            }}
                                            className={`p-3 rounded-xl border text-left transition-all ${activa
                                                ? "border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/20"
                                                : "border-border/60 dark:border-white/[0.06] bg-surface-2/40 dark:bg-white/[0.02] hover:border-brand-500/40"}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] font-semibold uppercase tracking-wide text-content-subtle truncate">
                                                    {toNameCase(g.category_name)}
                                                </span>
                                                <span className="text-[11px] text-content-subtle tabular-nums shrink-0">
                                                    {g.product_count} {g.product_count === 1 ? "prod." : "prods."}
                                                </span>
                                            </div>
                                            <div className="text-[15px] font-bold text-content dark:text-white mt-0.5 truncate">
                                                {g.subcategory}
                                            </div>
                                            <div className="mt-2 flex items-baseline justify-between gap-2 pt-1.5 border-t border-border/40 dark:border-white/[0.05]">
                                                <span className="text-[14px] font-extrabold tabular-nums text-brand-700 dark:text-brand-300">
                                                    {fmtN(g.total_qty)} und.
                                                </span>
                                                <span className="text-[12px] font-semibold tabular-nums text-content-subtle">
                                                    {fmt$(g.total_revenue)}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </Card>
                    )}

                    {/* Tabla de productos vendidos */}
                    <Card className="!p-0 overflow-hidden flex flex-col">
                        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 dark:border-white/[0.06]">
                            <SectionHeader
                                title="Detalle de productos vendidos"
                                sub="Unidades despachadas en el período según los filtros aplicados"
                            />
                            <div className="relative w-full sm:w-64">
                                <svg className="w-4 h-4 text-content-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                                </svg>
                                <input
                                    type="search"
                                    value={q}
                                    onChange={e => setQ(e.target.value)}
                                    placeholder="Buscar producto o subcategoría…"
                                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white placeholder:text-content-subtle/60 focus:outline-none focus:border-brand-500"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="table-ledger min-w-[640px]">
                                <thead>
                                    <tr>
                                        <th className="pl-4 w-12">#</th>
                                        <th>Producto</th>
                                        <th>Categoría</th>
                                        <th>Subcategoría</th>
                                        <th className="text-right">Cant. vendida</th>
                                        <th className="text-right">Facturado</th>
                                        {tarifaRaw > 0 && <th className="text-right pr-4">Pago x und.</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {platos.length === 0 ? (
                                        <tr>
                                            <td colSpan={tarifaRaw > 0 ? 7 : 6} className="py-14 text-center text-[13px] text-content-subtle">
                                                No hay productos vendidos con estos filtros en el período.
                                            </td>
                                        </tr>
                                    ) : platos.map((p, idx) => {
                                        const qty = parseFloat(p.total_qty) || 0;
                                        const pagoFila = qty * tarifaBase;
                                        return (
                                            <tr key={`${p.product_id}-${idx}`}>
                                                <td className="pl-4 text-[12px] text-content-subtle tabular-nums">{idx + 1}</td>
                                                <td className="font-semibold text-[13px] text-content dark:text-white">{p.product_name}</td>
                                                <td className="text-[12px] text-content-subtle">{toNameCase(p.category_name)}</td>
                                                <td>
                                                    {p.subcategory ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-700 dark:text-brand-300 text-[11px] font-semibold">
                                                            {p.subcategory}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[12px] text-content-subtle/50">—</span>
                                                    )}
                                                </td>
                                                <td className="text-right text-[14px] font-bold tabular-nums text-content dark:text-white">
                                                    {fmtNumber(qty, qty % 1 === 0 ? 0 : 2)}
                                                </td>
                                                <td className="text-right text-[13px] font-semibold tabular-nums text-content dark:text-white">
                                                    {fmt$(p.total_revenue)}
                                                </td>
                                                {tarifaRaw > 0 && (
                                                    <td className="text-right pr-4 text-[13px] font-bold tabular-nums text-brand-700 dark:text-brand-300">
                                                        {fmtMoney(pagoFila, sym)}
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                {platos.length > 0 && (
                                    <tfoot>
                                        <tr>
                                            <td colSpan={4} className="pl-4 font-bold text-[13px] text-content dark:text-white">
                                                Total ({platos.length} {platos.length === 1 ? "producto" : "productos"})
                                            </td>
                                            <td className="text-right font-extrabold text-[15px] tabular-nums text-content dark:text-white">
                                                {fmtNumber(totalUnidades, totalUnidades % 1 === 0 ? 0 : 2)}
                                            </td>
                                            <td className="text-right font-bold text-[14px] tabular-nums text-content dark:text-white">
                                                {fmt$(totalIngresos)}
                                            </td>
                                            {tarifaRaw > 0 && (
                                                <td className="text-right pr-4 font-extrabold text-[15px] tabular-nums text-brand-700 dark:text-brand-300">
                                                    {fmtMoney(totalPagoBase, sym)}
                                                </td>
                                            )}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
