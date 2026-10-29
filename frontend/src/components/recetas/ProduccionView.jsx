import { useEffect, useState } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import Money from "../ui/Money";
import { LedgerSkeleton, LedgerEmpty, ledgerRow } from "../ui/Ledger";
import { toNameCase, fmtBase, fmtDateShort } from "../../helpers";
import { fmtRinde } from "./shared";

// Recetas → Producción: cada tanda hecha (OP-0001). Lo que se mira de un vistazo es si rindió
// lo que debía: la olla de 30 que dio 28 sale en ámbar, con lo que faltó.

const hora = (d) => new Date(d).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });

// Lo que rindió frente a lo esperado. Ámbar si salió menos; nada si salió igual o más.
export function Rinde({ b, className = "" }) {
    const falto = b.expected_yield != null ? Math.round((b.expected_yield - b.actual_yield) * 1000) / 1000 : 0;
    return (
        <span className={className}>
            <span className="tabular-nums">{fmtRinde(b.actual_yield, b.unit)}</span>
            {b.expected_yield != null && (
                <span className={`block text-[12px] ${falto > 0 ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                    {falto > 0 ? `${fmtRinde(falto, b.unit)} menos de lo esperado` : `Esperaba ${fmtRinde(b.expected_yield, b.unit)}`}
                </span>
            )}
        </span>
    );
}

export default function ProduccionView({ warehouseId, sucursal, version, onOpen, onNew }) {
    const { baseCurrency, notify } = useApp();
    const money = (n) => fmtBase(n, baseCurrency);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        api.production.batches({ ...(warehouseId ? { warehouse_id: warehouseId } : {}), limit: 100 })
            .then(r => { if (vivo) setRows(r.data || []); })
            .catch(e => { if (vivo) notify(e?.message || "No se pudo cargar la producción", "err"); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [warehouseId, version]);

    const vacio = { title: "Sin producción", hint: "Cada olla, salsa o masa que hace la cocina se registra aquí: lo que se gastó y lo que salió." };
    const anulada = (b) => b.status === "anulada";

    return (
        <div className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden -mx-3 sm:-mx-4 -my-2">
            {sucursal && (
                <div className="shrink-0 px-4 py-2 flex flex-wrap items-center gap-2 border-b border-border/20 dark:border-white/5">
                    {sucursal}
                </div>
            )}

            {/* ── Libro (escritorio) ── */}
            <div className="hidden md:flex flex-1 min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[860px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4 w-[210px]">Tanda</th>
                                <th>Preparación</th>
                                <th className="w-[220px]">Salió</th>
                                <th className="w-[130px] text-right">Costo</th>
                                <th className="w-[140px] text-right pr-4">Por unidad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <LedgerSkeleton cols={5} rows={6} />
                                : rows.length === 0 ? <LedgerEmpty cols={5} title={vacio.title} hint={vacio.hint} />
                                : rows.map(b => (
                                    <tr key={b.id} {...ledgerRow(() => onOpen(b))} className={`ledger-row ${anulada(b) ? "opacity-60" : ""}`}>
                                        <td className="pl-4">
                                            <div className="text-[13px] font-semibold text-content dark:text-white tabular-nums">{b.code}</div>
                                            <div className="text-[12px] text-content-subtle tabular-nums whitespace-nowrap">{fmtDateShort(b.created_at)} · {hora(b.created_at)}</div>
                                        </td>
                                        <td className="max-w-0">
                                            <div className={`text-[13px] font-medium text-content dark:text-white truncate ${anulada(b) ? "line-through" : ""}`}>{toNameCase(b.product_name)}</div>
                                            <div className="text-[12px] text-content-subtle truncate">
                                                {anulada(b) ? "Anulada" : `${b.batches === 1 ? "1 tanda" : `${String(b.batches).replace(".", ",")} tandas`}${b.employee_name ? ` · ${toNameCase(b.employee_name)}` : ""}`}
                                            </div>
                                        </td>
                                        <td className="text-[13px] text-content dark:text-white"><Rinde b={b} /></td>
                                        <td className="text-right"><Money value={money(b.total_cost)} className="text-[13px] text-content dark:text-white" /></td>
                                        <td className="text-right pr-4"><Money value={money(b.unit_cost)} className="text-[13px] font-semibold text-content dark:text-white" /></td>
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
                ) : rows.length === 0 ? (
                    <div className="py-16 text-center px-6">
                        <div className="text-[14px] font-semibold text-content dark:text-white">{vacio.title}</div>
                        <div className="text-[13px] text-content-subtle mt-1">{vacio.hint}</div>
                        {onNew && <button onClick={onNew} className="btn-outline h-10 px-4 rounded-lg text-[13px] font-medium mt-4">Registrar producción</button>}
                    </div>
                ) : rows.map(b => (
                    <div key={b.id} role="button" tabIndex={0} onClick={() => onOpen(b)}
                        onKeyDown={e => { if (e.key === "Enter") onOpen(b); }}
                        className={`rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform ${anulada(b) ? "opacity-60" : ""}`}>
                        <div className="flex items-center justify-between gap-3">
                            <span className={`text-[14px] font-semibold text-content dark:text-white truncate ${anulada(b) ? "line-through" : ""}`}>{toNameCase(b.product_name)}</span>
                            <Money value={money(b.unit_cost)} className="text-[14px] font-semibold text-content dark:text-white shrink-0" />
                        </div>
                        <div className="mt-1 flex items-start justify-between gap-3 text-[13px] text-content dark:text-white">
                            <Rinde b={b} />
                            <span className="text-[12px] text-content-subtle shrink-0 tabular-nums">{b.code} · {fmtDateShort(b.created_at)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
