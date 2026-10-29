import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import Money from "../ui/Money";
import { LedgerSkeleton, LedgerEmpty, ledgerRow, RowCta, stopRow } from "../ui/Ledger";
import { toNameCase, fmtBase } from "../../helpers";
import { fmtRinde } from "./shared";

// Recetas → Preparaciones: lo que la cocina hace por tanda y después sirve por porciones (la
// sopa de la olla, la salsa, el fondo). De cada una: cuánto rinde una tanda, lo que cuesta según
// la receta, lo que costó de verdad la última y cuánto queda en la sucursal.

const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function PreparacionesView({ warehouseId, sucursal, version, onOpen, onProduce }) {
    const { baseCurrency, notify } = useApp();
    const money = (n) => fmtBase(n, baseCurrency);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        api.production.preparations(warehouseId ? { warehouse_id: warehouseId } : {})
            .then(r => { if (vivo) setRows(r.data || []); })
            .catch(e => { if (vivo) notify(e?.message || "No se pudieron cargar las preparaciones", "err"); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [warehouseId, version]);

    const visibles = useMemo(() => {
        const q = sinAcentos(search.trim());
        return rows.filter(r => !q || sinAcentos(r.name).includes(q));
    }, [rows, search]);

    const vacio = search
        ? { title: "Nada coincide", hint: "Prueba con otro nombre." }
        : { title: "Sin preparaciones", hint: "La sopa de la olla, la salsa, el fondo: lo que la cocina hace por tanda y después sirve por porciones." };

    const resumen = (r) => `Rinde ${fmtRinde(r.batch_yield, r.unit)} · ${r.lines === 1 ? "1 ingrediente" : `${r.lines} ingredientes`}`;
    const existencia = (r) => (r.stock == null ? "—" : fmtRinde(r.stock, r.unit));
    const enNegativo = (r) => r.stock != null && r.stock < 0;

    return (
        <div className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden -mx-3 sm:-mx-4 -my-2">
            <div className="shrink-0 px-4 py-2 flex flex-wrap items-center gap-2 border-b border-border/20 dark:border-white/5">
                <div className="relative flex-1 min-w-[180px] max-w-md">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input value={search} onChange={e => setSearch(e.target.value)} className="input h-9 pl-9 text-[13px] w-full"
                        autoComplete="off" spellCheck={false} placeholder="Buscar preparación…" />
                </div>
                {sucursal}
            </div>

            {/* ── Libro (escritorio) ── */}
            <div className="hidden md:flex flex-1 min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[820px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Preparación</th>
                                <th className="w-[150px] text-right">Hay</th>
                                <th className="w-[160px] text-right">Costo por unidad</th>
                                <th className="w-[160px] text-right whitespace-nowrap">Costo de la tanda</th>
                                <th className="w-[120px] pr-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <LedgerSkeleton cols={5} rows={5} />
                                : visibles.length === 0 ? <LedgerEmpty cols={5} title={vacio.title} hint={vacio.hint} onClear={search ? () => setSearch("") : undefined} />
                                : visibles.map(r => (
                                    <tr key={r.product_id} {...ledgerRow(() => onOpen(r), enNegativo(r) ? "#ef4444" : undefined)}>
                                        <td className="pl-4 max-w-0">
                                            <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(r.name)}</div>
                                            <div className="text-[12px] text-content-subtle truncate">{resumen(r)}</div>
                                        </td>
                                        <td className={`text-right text-[13px] tabular-nums whitespace-nowrap ${enNegativo(r) ? "text-red-600 dark:text-red-400 font-semibold" : "text-content dark:text-white"}`}>
                                            {existencia(r)}
                                        </td>
                                        <td className="text-right">
                                            {r.unit_cost != null ? <Money value={money(r.unit_cost)} className="text-[13px] text-content dark:text-white" /> : <span className="text-content-subtle">—</span>}
                                            {r.last_cost != null && (
                                                <div className="text-[12px] text-content-subtle whitespace-nowrap">Última tanda <Money value={money(r.last_cost)} /></div>
                                            )}
                                        </td>
                                        <td className="text-right">
                                            <Money value={money(r.batch_cost)} className="text-[13px] text-content dark:text-white" />
                                            {r.missing_costs > 0 && (
                                                <div className="text-[12px] text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                                    {r.missing_costs === 1 ? "1 insumo sin costo" : `${r.missing_costs} insumos sin costo`}
                                                </div>
                                            )}
                                        </td>
                                        <td className="pr-4" onClick={stopRow}>
                                            <div className="flex justify-end">
                                                {onProduce && <RowCta onClick={() => onProduce(r)}>Producir</RowCta>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Tarjetas (teléfono) ── */}
            <div className="md:hidden px-3 py-3 space-y-2">
                {loading ? (
                    <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : visibles.length === 0 ? (
                    <div className="py-16 text-center px-6">
                        <div className="text-[14px] font-semibold text-content dark:text-white">{vacio.title}</div>
                        <div className="text-[13px] text-content-subtle mt-1">{vacio.hint}</div>
                    </div>
                ) : visibles.map(r => (
                    <div key={r.product_id} role="button" tabIndex={0} onClick={() => onOpen(r)}
                        onKeyDown={e => { if (e.key === "Enter") onOpen(r); }}
                        style={enNegativo(r) ? { boxShadow: "inset 3px 0 0 #ef4444" } : undefined}
                        className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(r.name)}</span>
                            <span className={`text-[13px] tabular-nums shrink-0 ${enNegativo(r) ? "text-red-600 dark:text-red-400 font-semibold" : "text-content dark:text-white"}`}>Hay {existencia(r)}</span>
                        </div>
                        <div className="mt-1 flex items-end justify-between gap-3">
                            <div className="min-w-0 text-[12px] text-content-subtle">
                                <div className="truncate">{resumen(r)}</div>
                                {r.unit_cost != null && <div className="truncate">Por unidad <Money value={money(r.unit_cost)} /></div>}
                            </div>
                            {onProduce && (
                                <button onClick={e => { e.stopPropagation(); onProduce(r); }}
                                    className="btn-accent h-9 px-4 rounded-lg text-[13px] font-semibold shrink-0 active:scale-95">
                                    Producir
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
