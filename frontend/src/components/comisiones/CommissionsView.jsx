import { useCallback, useEffect, useState } from "react";
import DateRangePicker from "../ui/DateRangePicker";
import Money from "../ui/Money";
import { ledgerRow, stopRow, LedgerSkeleton, LedgerEmpty, RowCta, RowIcon } from "../ui/Ledger";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { todayISO, toNameCase, fmtDateShort } from "../../helpers";

const COLS = 6;
const primeroDelMes = () => `${todayISO().slice(0, 8)}01`;

/**
 * Lo que ganó cada vendedor en el período y lo que se le debe hoy. La comisión se gana al
 * cobrar: una venta a crédito no suma hasta que entra el dinero (ver services/commissions).
 */
export default function CommissionsView({ version, onOpen, onPay, onNewSeller }) {
    const { notify, can, baseCurrency, seleccionKey } = useApp();
    const [from, setFrom] = useState(primeroDelMes);
    const [to, setTo] = useState(todayISO);
    const [data, setData] = useState(null);
    const sym = baseCurrency?.symbol || "Ref.";
    const fmt = (n) => `${sym} ${Number(n || 0).toFixed(2)}`;
    const canPay = can("commissions.pay");

    const cargar = useCallback(async () => {
        setData(null);
        try {
            const r = await api.commissions.report({ date_from: from || "", date_to: to || "" });
            setData(r);
        } catch (e) { notify(e.message, "err"); setData({ data: [], totals: {} }); }
    }, [from, to, notify]);

    // seleccionKey: cambiar de sucursal de trabajo recorta las ventas del reporte.
    useEffect(() => { cargar(); }, [cargar, version, seleccionKey]);

    const filas = data?.data || [];
    const t = data?.totals || {};
    const abrir = (s) => onOpen?.(s, { from, to });

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
            <div className="px-4 pt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} className="w-full sm:w-[260px]" />
                <p className="text-[12px] text-content-subtle sm:ml-auto">Se gana al cobrar · sin recargos · las devoluciones restan</p>
            </div>

            {/* Resumen del período */}
            <div className="px-4 pt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
                <Kpi label="Comisión del período" value={fmt(t.comision)} />
                <Kpi label="Por liquidar hoy" value={fmt(t.saldo)} strong />
                <Kpi label="Por cobrar" value={fmt(t.por_cobrar)} sub="La ganan al cobrarse" />
                <Kpi label="Vendido en el período" value={fmt(t.vendido)} sub={`Cobrado ${fmt(t.cobrado)}`} />
            </div>

            {/* Libro (escritorio) */}
            <div className="hidden lg:flex flex-1 min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[860px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Vendedor</th>
                                <th className="w-[150px] text-right">Vendió</th>
                                <th className="w-[150px] text-right">Cobrado</th>
                                <th className="w-[150px] text-right">Comisión</th>
                                <th className="w-[160px] text-right">Por liquidar</th>
                                <th className="w-[130px] pr-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {!data ? <LedgerSkeleton cols={COLS} rows={5} />
                                : filas.length === 0 ? (
                                    <LedgerEmpty cols={COLS} title="Todavía no hay vendedores"
                                        hint="Crea los vendedores en la pestaña Vendedores y elígelos en la caja con F7." />
                                ) : filas.map(s => (
                                    <tr key={s.id} {...ledgerRow(() => abrir(s))}>
                                        <td className="pl-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Codigo s={s} />
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(s.name)}</div>
                                                    <div className="text-[12px] text-content-subtle truncate">
                                                        {s.commission_pct}%{s.active ? "" : " · inactivo"}{s.ultimo_pago ? ` · último pago ${fmtDateShort(s.ultimo_pago)}` : ""}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right">
                                            <Money value={fmt(s.vendido)} className="text-[13px] text-content dark:text-white" />
                                            <div className="text-[12px] text-content-subtle tabular-nums">{s.ventas} {s.ventas === 1 ? "venta" : "ventas"}</div>
                                        </td>
                                        <td className="text-right"><Money value={fmt(s.cobrado)} className="text-[13px] text-content dark:text-white" /></td>
                                        <td className="text-right">
                                            <Money value={fmt(s.comision)} className="text-[13px] font-semibold text-content dark:text-white" />
                                            {s.devuelto < 0 && <div className="text-[12px] text-red-600 dark:text-red-400 tabular-nums">{fmt(s.devuelto)} devol.</div>}
                                        </td>
                                        <td className="text-right">
                                            <Money value={fmt(s.saldo)} className={`text-[13px] font-semibold ${s.saldo < -0.005 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`} />
                                            {s.por_cobrar > 0.005 && <div className="text-[12px] text-content-subtle tabular-nums">+{fmt(s.por_cobrar)} por cobrar</div>}
                                        </td>
                                        <td className="pr-4" onClick={stopRow}>
                                            <div className="flex items-center justify-end">
                                                {canPay && s.saldo > 0.005 && <RowCta onClick={() => onPay?.(s)}>Liquidar</RowCta>}
                                                <RowIcon icon="eye" title="Estado de cuenta" onClick={() => abrir(s)} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Tarjetas (teléfono y tablet) */}
            <div className="lg:hidden px-4 py-3 space-y-2">
                {!data ? (
                    <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                ) : filas.length === 0 ? (
                    <div className="py-14 text-center px-6">
                        <div className="text-[14px] font-semibold text-content dark:text-white">Todavía no hay vendedores</div>
                        <div className="text-[13px] text-content-subtle mt-1">Créalos en la pestaña Vendedores y elígelos en la caja.</div>
                        {onNewSeller && <button onClick={onNewSeller} className="btn-outline h-12 px-5 rounded-lg text-[13px] font-medium mt-4">Nuevo vendedor</button>}
                    </div>
                ) : filas.map(s => (
                    <div key={s.id} role="button" tabIndex={0} onClick={() => abrir(s)} onKeyDown={e => { if (e.key === "Enter") abrir(s); }}
                        className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform">
                        <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 min-w-0">
                                <Codigo s={s} small />
                                <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(s.name)}</span>
                            </span>
                            <Money value={fmt(s.comision)} className="text-[14px] font-semibold text-content dark:text-white shrink-0" />
                        </div>
                        <div className="mt-1.5 flex items-end justify-between gap-3">
                            <div className="min-w-0 text-[12px] text-content-subtle tabular-nums">
                                <div className="truncate">Vendió {fmt(s.vendido)} · {s.commission_pct}%</div>
                                <div className={`truncate ${s.saldo < -0.005 ? "text-red-600 dark:text-red-400" : ""}`}>Por liquidar {fmt(s.saldo)}</div>
                            </div>
                            {canPay && s.saldo > 0.005 && (
                                <button onClick={e => { e.stopPropagation(); onPay?.(s); }}
                                    className="btn-accent h-9 px-4 rounded-lg text-[13px] font-semibold shrink-0 active:scale-95">
                                    Liquidar
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Codigo({ s, small }) {
    return (
        <span className={`${small ? "min-w-[30px] h-7 text-[12px]" : "min-w-[34px] h-8 text-[12px]"} px-1.5 rounded-full bg-surface-3 dark:bg-white/[0.06] font-semibold tabular-nums text-content-muted dark:text-white/70 flex items-center justify-center shrink-0`}>
            {s.code}
        </span>
    );
}

function Kpi({ label, value, sub, strong }) {
    return (
        <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] shadow-card dark:shadow-none px-3.5 py-3 min-w-0">
            <div className="text-[12px] text-content-subtle truncate">{label}</div>
            <Money value={value} className={`block ${strong ? "text-[22px] font-bold" : "text-[18px] font-semibold"} tracking-tight text-content dark:text-white leading-tight mt-0.5`} />
            {sub && <div className="text-[11px] text-content-subtle tabular-nums truncate mt-0.5">{sub}</div>}
        </div>
    );
}
