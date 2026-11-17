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
 * Propinas del período: lo que le tocó a cada persona, lo que se le debe hoy y el pozo. Se ganan
 * al cobrar (ver services/tips): una cuenta a crédito no suma hasta que entra el dinero.
 */
export default function TipsView({ version, onOpen, onPay, onPool, onGoSales }) {
    const { notify, can, baseCurrency, seleccionKey } = useApp();
    const [from, setFrom] = useState(primeroDelMes);
    const [to, setTo] = useState(todayISO);
    const [data, setData] = useState(null);
    const sym = baseCurrency?.symbol || "Ref.";
    const fmt = (n) => `${sym} ${Number(n || 0).toFixed(2)}`;
    const canPay = can("tips.pay");

    const cargar = useCallback(async () => {
        setData(null);
        try {
            setData(await api.tips.report({ date_from: from || "", date_to: to || "" }));
        } catch (e) { notify(e.message, "err"); setData({ data: [], totals: {}, pool: {}, sin_persona: {} }); }
    }, [from, to, notify]);

    useEffect(() => { cargar(); }, [cargar, version, seleccionKey]);

    const filas = data?.data || [];
    const t = data?.totals || {};
    const pozo = data?.pool || {};
    const sinPersona = data?.sin_persona || {};
    const enPozo = data?.modo === "pozo" || (pozo.ganado || 0) > 0;
    const abrir = (s) => onOpen?.(s, { from, to });

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
            <div className="px-4 pt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} className="w-full sm:w-[260px]" />
                <p className="text-[12px] text-content-subtle sm:ml-auto">
                    {data?.modo === "pozo" ? "Reparto: pozo para todos" : "Reparto: al mesonero de la cuenta"} · se gana al cobrar
                </p>
            </div>

            <div className="px-4 pt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
                <Kpi label="Propinas del período" value={fmt(t.periodo)} />
                <Kpi label="Por pagar al personal" value={fmt(t.saldo)} strong />
                <Kpi label="En el pozo" value={fmt(pozo.saldo)} sub={pozo.periodo ? `${fmt(pozo.periodo)} en el período` : "Sin repartir"} />
                <Kpi label="Por cobrar" value={fmt(t.por_cobrar)} sub="Se ganan al cobrarse" />
            </div>

            {/* Pozo: lo que se reparte entre todos. */}
            {enPozo && (
                <div className="px-4 pt-3">
                    <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] shadow-card dark:shadow-none px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-semibold text-content dark:text-white">Pozo de propinas</div>
                            <div className="text-[12px] text-content-subtle">
                                Entró {fmt(pozo.ganado)} · repartido {fmt(pozo.repartido)}
                                {pozo.por_cobrar > 0.005 ? ` · ${fmt(pozo.por_cobrar)} por cobrar` : ""}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 sm:justify-end">
                            <Money value={fmt(pozo.saldo)} className="text-[20px] font-bold tracking-tight text-content dark:text-white" />
                            {canPay && pozo.saldo > 0.005 && (
                                <button onClick={() => onPool?.({ saldo: pozo.saldo, from, to, personas: filas })}
                                    className="btn-accent h-12 sm:h-10 px-4 rounded-lg text-[13px] font-semibold shrink-0">
                                    Repartir el pozo
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Propinas que no tienen a quién: la caja no eligió mesonero y no es pozo. */}
            {sinPersona.ganado > 0.005 && (
                <div className="px-4 pt-3">
                    <div className="px-3 py-2 rounded-lg bg-amber-500/10 text-[12px] text-amber-800 dark:text-amber-300 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ boxShadow: "inset 3px 0 0 #f59e0b" }}>
                        <span>{fmt(sinPersona.ganado)} en propinas no tienen mesonero. Asígnalas para poder pagarlas.</span>
                        {onGoSales && <button onClick={onGoSales} className="font-semibold underline underline-offset-2">Ver facturas</button>}
                    </div>
                </div>
            )}

            {/* Libro (escritorio) */}
            <div className="hidden lg:flex flex-1 min-h-0 flex-col py-3 px-4">
                <div className="card-premium overflow-auto flex-1">
                    <table className="table-ledger min-w-[820px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Persona</th>
                                <th className="w-[120px] text-right">Cuentas</th>
                                <th className="w-[150px] text-right">Propina</th>
                                <th className="w-[150px] text-right">Del pozo</th>
                                <th className="w-[160px] text-right">Por pagar</th>
                                <th className="w-[130px] pr-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {!data ? <LedgerSkeleton cols={COLS} rows={5} />
                                : filas.length === 0 ? (
                                    <LedgerEmpty cols={COLS} title="Todavía no hay personal"
                                        hint="Crea a los mesoneros en la pestaña Personal. La caja los elige al cobrar." />
                                ) : filas.map(s => (
                                    <tr key={s.id} {...ledgerRow(() => abrir(s))}>
                                        <td className="pl-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Codigo s={s} />
                                                <div className="min-w-0">
                                                    <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(s.name)}</div>
                                                    <div className="text-[12px] text-content-subtle truncate">
                                                        {s.active ? "" : "Inactivo · "}{s.ultimo_pago ? `Último pago ${fmtDateShort(s.ultimo_pago)}` : "Sin pagos"}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right text-[13px] tabular-nums text-content dark:text-white">{s.cuentas || "—"}</td>
                                        <td className="text-right">
                                            <Money value={fmt(s.periodo)} className="text-[13px] font-semibold text-content dark:text-white" />
                                            {s.por_cobrar > 0.005 && <div className="text-[12px] text-content-subtle tabular-nums">+{fmt(s.por_cobrar)} por cobrar</div>}
                                        </td>
                                        <td className="text-right"><Money value={fmt(s.del_pozo)} className="text-[13px] text-content-subtle" /></td>
                                        <td className="text-right">
                                            <Money value={fmt(s.saldo)} className={`text-[13px] font-semibold ${s.saldo < -0.005 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`} />
                                        </td>
                                        <td className="pr-4" onClick={stopRow}>
                                            <div className="flex items-center justify-end">
                                                {canPay && s.saldo > 0.005 && <RowCta onClick={() => onPay?.(s)}>Pagar</RowCta>}
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
                        <div className="text-[14px] font-semibold text-content dark:text-white">Todavía no hay personal</div>
                        <div className="text-[13px] text-content-subtle mt-1">Créalo en la pestaña Personal y elígelo en la caja al cobrar.</div>
                    </div>
                ) : filas.map(s => (
                    <div key={s.id} role="button" tabIndex={0} onClick={() => abrir(s)} onKeyDown={e => { if (e.key === "Enter") abrir(s); }}
                        className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform">
                        <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 min-w-0">
                                <Codigo s={s} small />
                                <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(s.name)}</span>
                            </span>
                            <Money value={fmt(s.periodo)} className="text-[14px] font-semibold text-content dark:text-white shrink-0" />
                        </div>
                        <div className="mt-1.5 flex items-end justify-between gap-3">
                            <div className="min-w-0 text-[12px] text-content-subtle tabular-nums">
                                <div className="truncate">{s.cuentas || 0} {s.cuentas === 1 ? "cuenta" : "cuentas"}{s.del_pozo ? ` · del pozo ${fmt(s.del_pozo)}` : ""}</div>
                                <div className={`truncate ${s.saldo < -0.005 ? "text-red-600 dark:text-red-400" : ""}`}>Por pagar {fmt(s.saldo)}</div>
                            </div>
                            {canPay && s.saldo > 0.005 && (
                                <button onClick={e => { e.stopPropagation(); onPay?.(s); }}
                                    className="btn-accent h-9 px-4 rounded-lg text-[13px] font-semibold shrink-0 active:scale-95">
                                    Pagar
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
