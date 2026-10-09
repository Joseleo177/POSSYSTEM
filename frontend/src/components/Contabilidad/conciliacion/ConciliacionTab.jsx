import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../../../services/api";
import { fmtDateShort, fmtMoney, toNameCase } from "../../../helpers";
import CustomSelect from "../../ui/CustomSelect";
import StatusMark from "../../ui/StatusMark";
import Money from "../../ui/Money";
import { ledgerRow, LedgerSkeleton, LedgerEmpty } from "../../ui/Ledger";
import ImportStatementModal from "./ImportStatementModal";
import StatementView from "./StatementView";
import { plural, accountLabel } from "./reconMeta";

/**
 * Conciliación bancaria: se sube el extracto de una cuenta y cada línea se casa con lo que el
 * sistema tiene —cobros, ingresos, egresos—. Lo que el banco cobró por su cuenta (comisiones,
 * impuestos) se registra desde el mismo extracto.
 *
 * La pantalla tiene dos vistas: la lista de extractos subidos y el extracto abierto.
 */

const STATEMENT_STATUS = {
    listo:     { label: "Conciliado", tone: "success", quiet: "check" },
    pendiente: { label: "Por conciliar", tone: "warning" },
};

const BANK_ICON = "M3 10h18M5 10V20m4-10v10m6-10v10m4-10v10M3 20h18M12 3l9 5H3l9-5z";

function Avance({ s }) {
    const done = s.reconciled_count + s.ignored_count;
    const pct = s.line_count ? Math.round((done / s.line_count) * 100) : 0;
    return (
        <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-[12px] tabular-nums">
                <span className="text-content dark:text-white font-medium">{done} de {s.line_count}</span>
                <span className="text-content-subtle">{pct} %</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden">
                <div className="h-full rounded-full bg-content-subtle/50 dark:bg-white/40" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default function ConciliacionTab({ notify }) {
    const [accounts, setAccounts]     = useState([]);
    const [statements, setStatements] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [accountKey, setAccountKey] = useState("");
    const [openId, setOpenId]         = useState(null);
    const [showImport, setShowImport] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [a, s] = await Promise.all([api.reconciliation.accounts(), api.reconciliation.getAll()]);
            setAccounts(a.data || []);
            setStatements(s.data || []);
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setLoading(false);
        }
    }, [notify]);

    useEffect(() => { if (!openId) load(); }, [openId, load]);

    const account = accounts.find(a => a.key === accountKey) || null;
    const visible = useMemo(() => statements.filter(s =>
        !account || s.journal_id === account.journal_id
    ), [statements, account]);

    if (openId) {
        return <StatementView id={openId} notify={notify} onBack={() => setOpenId(null)} />;
    }

    const empty = !loading && !visible.length;

    return (
        <div className="h-full flex flex-col overflow-y-auto lg:overflow-hidden">
            {/* Barra: cuenta a la izquierda, la única acción principal a la derecha. */}
            <div className="shrink-0 px-4 py-2.5 flex items-center gap-2 border-b border-border/60 dark:border-white/[0.06]">
                <div className="w-full sm:w-72 min-w-0">
                    <CustomSelect
                        value={accountKey}
                        onChange={setAccountKey}
                        height="h-9"
                        placeholder="Todas las cuentas"
                        options={[
                            { value: "", label: "Todas las cuentas" },
                            ...accounts.map(a => ({ value: a.key, label: toNameCase(accountLabel(a)) })),
                        ]}
                    />
                </div>
                <button
                    onClick={() => setShowImport(true)}
                    disabled={!accounts.length}
                    className="btn-accent h-9 px-3 sm:px-4 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 shrink-0 ml-auto active:scale-95 disabled:opacity-50"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" /></svg>
                    <span className="hidden sm:inline">Subir extracto</span>
                    <span className="sm:hidden">Subir</span>
                </button>
            </div>

            {/* Cuentas con lo que les falta: el punto de partida de cada día. */}
            {!loading && accounts.length > 0 && (
                <div className="shrink-0 px-4 pt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                    {accounts.map(a => {
                        const on = a.key === accountKey;
                        return (
                            <button key={a.key} onClick={() => setAccountKey(on ? "" : a.key)}
                                className={`text-left rounded-2xl border px-3.5 py-3 transition-colors ${on
                                    ? "border-brand-500/40 bg-brand-500/10 ring-1 ring-brand-500/30"
                                    : "bg-white dark:bg-white/[0.04] border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none hover:border-content-subtle/40"}`}>
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="w-8 h-8 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/60 flex items-center justify-center shrink-0">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={BANK_ICON} /></svg>
                                    </span>
                                    <div className="min-w-0">
                                        <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(a.journal_name || a.bank_name)} <span className="text-content-subtle font-medium">· {a.currency_symbol}</span></div>
                                        {a.account_number && <div className="text-[12px] text-content-subtle tabular-nums truncate">Cuenta ·· {String(a.account_number).replace(/D/g, "").slice(-4)}</div>}
                                        <div className="text-[12px] text-content-subtle truncate">
                                            {a.statements ? `Hasta el ${fmtDateShort(a.last_date)}` : "Sin extractos"}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-2 text-[12px]">
                                    {a.pending_lines > 0
                                        ? <StatusMark status="x" map={{ x: { label: `${a.pending_lines} por conciliar`, tone: "warning" } }} />
                                        : a.statements > 0
                                            ? <StatusMark status="x" map={{ x: { label: "Al día", tone: "success", quiet: "check" } }} />
                                            : <span className="text-content-subtle">Sube su primer extracto</span>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {!loading && !accounts.length && (
                <div className="py-20 text-center px-6">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={BANK_ICON} /></svg>
                    </div>
                    <div className="text-[14px] font-semibold text-content dark:text-white">No hay cuentas bancarias para conciliar</div>
                    <div className="text-[13px] text-content-subtle mt-1">Crea un diario de pago móvil, punto o transferencia con su banco en Configuración → Diarios.</div>
                </div>
            )}

            {accounts.length > 0 && (
                <>
                    {/* Escritorio: tabla */}
                    <div className="hidden md:flex lg:flex-1 lg:min-h-0 flex-col py-3 px-4">
                        <div className="card-premium lg:overflow-auto lg:flex-1">
                            <table className="table-ledger">
                                <thead className="sticky top-0 z-10">
                                    <tr>
                                        <th className="pl-4">Extracto</th>
                                        <th>Período</th>
                                        <th className="w-[200px]">Avance</th>
                                        <th className="text-right">Abonos</th>
                                        <th className="text-right">Cargos</th>
                                        <th className="pr-4 w-[170px]">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? <LedgerSkeleton cols={6} rows={5} />
                                        : empty ? <LedgerEmpty cols={6} title="Todavía no hay extractos" hint="Sube el extracto de la cuenta en Excel o CSV y el sistema lo casará con tus cobros." />
                                        : visible.map(s => {
                                            const listo = s.pending_count === 0;
                                            return (
                                                <tr key={s.id} {...ledgerRow(() => setOpenId(s.id))}>
                                                    <td className="pl-4 max-w-0">
                                                        <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(s.bank_name)} <span className="text-content-subtle font-medium">· {s.currency_symbol || "Ref."}</span></div>
                                                        <div className="text-[12px] text-content-subtle truncate">{s.filename || `Extracto #${s.id}`}{s.warehouse_name ? ` · ${toNameCase(s.warehouse_name)}` : ""}</div>
                                                    </td>
                                                    <td className="whitespace-nowrap tabular-nums text-[13px] text-content dark:text-white">
                                                        {fmtDateShort(s.date_from)} <span className="text-content-subtle">al</span> {fmtDateShort(s.date_to)}
                                                    </td>
                                                    <td><Avance s={s} /></td>
                                                    <td className="text-right"><Money value={fmtMoney(s.total_credit, s.currency_symbol || "Ref.")} className="text-[13px] text-content dark:text-white" /></td>
                                                    <td className="text-right"><Money value={`-${fmtMoney(s.total_debit, s.currency_symbol || "Ref.")}`} className="text-[13px] text-content dark:text-white" /></td>
                                                    <td className="pr-4">
                                                        <StatusMark status={listo ? "listo" : "pendiente"} map={{ ...STATEMENT_STATUS, pendiente: { ...STATEMENT_STATUS.pendiente, label: `${s.pending_count} por conciliar` } }} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Móvil: tarjetas de dos renglones */}
                    <div className="md:hidden px-4 py-3 space-y-2">
                        {loading ? (
                            <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                        ) : empty ? (
                            <div className="py-16 text-center px-6">
                                <div className="text-[14px] font-semibold text-content dark:text-white">Todavía no hay extractos</div>
                                <div className="text-[13px] text-content-subtle mt-1">Sube el extracto de la cuenta en Excel o CSV.</div>
                            </div>
                        ) : visible.map(s => (
                            <button key={s.id} onClick={() => setOpenId(s.id)}
                                className="w-full text-left rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(s.bank_name)} <span className="text-content-subtle font-medium">· {s.currency_symbol || "Ref."}</span></span>
                                    <span className="text-[12px] text-content-subtle tabular-nums whitespace-nowrap">{fmtDateShort(s.date_from, { day: "2-digit", month: "2-digit" })} al {fmtDateShort(s.date_to, { day: "2-digit", month: "2-digit" })}</span>
                                </div>
                                <div className="mt-1.5 flex items-center justify-between gap-3">
                                    <span className="text-[12px] text-content-subtle truncate">{plural(s.line_count, "movimiento", "movimientos")}</span>
                                    {s.pending_count === 0
                                        ? <StatusMark status="listo" map={STATEMENT_STATUS} />
                                        : <StatusMark status="x" map={{ x: { label: `${s.pending_count} por conciliar`, tone: "warning" } }} />}
                                </div>
                            </button>
                        ))}
                    </div>
                </>
            )}

            <ImportStatementModal
                open={showImport}
                onClose={() => setShowImport(false)}
                accounts={accounts}
                initialAccountKey={accountKey}
                notify={notify}
                onDone={(id) => { setShowImport(false); setOpenId(id); }}
            />
        </div>
    );
}
