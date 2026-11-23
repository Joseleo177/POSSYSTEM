import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../../../services/api";
import { fmtDateShort, fmtMoney, toNameCase } from "../../../helpers";
import CustomSelect from "../../ui/CustomSelect";
import StatusMark from "../../ui/StatusMark";
import Money from "../../ui/Money";
import { ledgerRow, LedgerSkeleton } from "../../ui/Ledger";
import ImportStatementModal from "./ImportStatementModal";
import StatementView from "./StatementView";
import { plural, accountLabel } from "./reconMeta";

/**
 * Conciliación bancaria: se sube el extracto de una cuenta y cada línea se casa con lo que el
 * sistema tiene —cobros, ingresos, egresos—. Lo que el banco cobró por su cuenta (comisiones,
 * impuestos) se registra desde el mismo extracto.
 *
 * La pantalla tiene dos vistas: la lista de extractos subidos y el extracto abierto.
 *
 * Lista (rediseño 23-11-2026): en escritorio las cuentas son una columna fija a la izquierda,
 * como una bandeja, y a la derecha va la cuenta elegida con su cabecera, cuatro datos y sus
 * extractos. Antes eran tarjetas sueltas sobre la tabla —y un selector que hacía lo mismo—, y
 * la elegida se pintaba de azul entera. En el teléfono queda el selector arriba.
 */

const STATEMENT_STATUS = {
    listo:     { label: "Conciliado", tone: "success", quiet: "check" },
    pendiente: { label: "Por conciliar", tone: "warning" },
};

const BANK_ICON = "M3 10h18M5 10V20m4-10v10m6-10v10m4-10v10M3 20h18M12 3l9 5H3l9-5z";
const UPLOAD_ICON = "M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4";
const CARD = "bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";

const last4 = (n) => String(n || "").replace(/\D/g, "").slice(-4);

// Monograma del banco: "Banco de Venezuela" → "V", "Banco Nacional de Crédito" → "NC".
const STOP = new Set(["banco", "de", "del", "la", "el", "y", "bank"]);
function monogram(name) {
    const words = String(name || "").split(/\s+/).filter(w => w && !STOP.has(w.toLowerCase()));
    if (!words.length) return "B";
    return words.slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function BankMark({ name, on = false, size = "w-9 h-9 text-[13px]", all = false }) {
    return (
        <span className={`${size} rounded-xl flex items-center justify-center shrink-0 font-semibold tracking-tight transition-colors ${on
            ? "bg-content text-white dark:bg-white dark:text-black"
            : "bg-surface-3 text-content-muted dark:bg-white/[0.06] dark:text-white/70"}`}>
            {all
                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={BANK_ICON} /></svg>
                : monogram(name)}
        </span>
    );
}

function Avance({ done, total, wide = false }) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
        <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 text-[12px] tabular-nums">
                <span className="text-content dark:text-white font-medium">{done} de {total}</span>
                <span className="text-content-subtle">{pct} %</span>
            </div>
            <div className={`mt-1 ${wide ? "h-1.5" : "h-1"} rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden`}>
                <div className="h-full rounded-full bg-content-subtle/50 dark:bg-white/40" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

// Una cuenta en la columna de la izquierda.
function AccountItem({ on, onClick, name, bank, symbol, sub, pending, upToDate, all = false }) {
    return (
        <button onClick={onClick}
            className={`w-full text-left rounded-xl px-2.5 py-2 flex items-center gap-3 transition-colors ${on
                ? "bg-surface-2 dark:bg-white/[0.06]"
                : "hover:bg-surface-2/60 dark:hover:bg-white/[0.03]"}`}>
            <BankMark name={bank || name} on={on} all={all} />
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-content dark:text-white truncate">
                    {name}{symbol && <span className="text-content-subtle font-medium"> · {symbol}</span>}
                </div>
                <div className="text-[12px] text-content-subtle truncate">{sub}</div>
            </div>
            {pending > 0 ? (
                <span title={`${pending} por conciliar`} className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-semibold tabular-nums flex items-center justify-center">{pending}</span>
            ) : upToDate ? (
                <svg aria-label="Al día" className="w-4 h-4 shrink-0 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            ) : null}
        </button>
    );
}

// Divisores de la franja: dos por fila en el teléfono, cuatro en una fila desde lg.
const SEP = [
    "border-r border-b lg:border-b-0",
    "border-b lg:border-b-0 lg:border-r",
    "border-r",
    "",
].map(c => `${c} border-border/60 dark:border-white/[0.06]`);

function Dato({ label, children, hint, tone, i }) {
    return (
        <div className={`px-4 py-3 min-w-0 ${SEP[i]}`}>
            <dt className="text-[12px] text-content-subtle">{label}</dt>
            <dd className={`mt-0.5 text-[20px] font-semibold tracking-tight tabular-nums truncate ${tone === "warning" ? "text-amber-600 dark:text-amber-400" : "text-content dark:text-white"}`}>{children}</dd>
            {hint && <div className="text-[12px] text-content-subtle truncate">{hint}</div>}
        </div>
    );
}

// Sin extractos: en vez de una tabla vacía, cómo se empieza.
function Primeros({ account, onUpload }) {
    // El PDF solo se lee del Banco de Venezuela: no se promete para otros bancos.
    const pdf = !account || /venezuela/i.test(account.bank_name || "");
    const steps = [
        { t: "Descarga el extracto", d: `Desde la banca en línea, en Excel o CSV.${pdf ? " Del Banco de Venezuela también sirve el PDF." : ""}` },
        { t: "Súbelo aquí", d: "El sistema lee la fecha, la referencia y el monto de cada movimiento." },
        { t: "Revisa lo que falte", d: "Lo que coincide se casa solo con tus cobros, ingresos y egresos. Tú decides el resto." },
    ];
    return (
        <div className={`${CARD} px-5 py-8 sm:px-10 sm:py-12`}>
            <div className="max-w-[560px] mx-auto text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <div className="mt-3 text-[15px] font-semibold text-content dark:text-white">
                    {account ? `Concilia ${toNameCase(account.journal_name || account.bank_name)}` : "Todavía no hay extractos"}
                </div>
                <div className="mt-1 text-[13px] text-content-subtle">Así verificas que el dinero de cada cobro llegó de verdad al banco.</div>
            </div>
            <ol className="mt-7 max-w-[720px] mx-auto grid grid-cols-1 sm:grid-cols-3 gap-3">
                {steps.map((s, i) => (
                    <li key={s.t} className="rounded-xl bg-surface-2/70 dark:bg-white/[0.03] px-4 py-3.5 flex sm:block gap-3">
                        <span className="w-6 h-6 rounded-full bg-white dark:bg-white/10 border border-border/60 dark:border-white/10 text-[12px] font-semibold text-content dark:text-white flex items-center justify-center shrink-0 tabular-nums">{i + 1}</span>
                        <div className="sm:mt-2.5">
                            <div className="text-[13px] font-semibold text-content dark:text-white">{s.t}</div>
                            <div className="mt-0.5 text-[12px] leading-snug text-content-subtle">{s.d}</div>
                        </div>
                    </li>
                ))}
            </ol>
            <div className="mt-7 flex justify-center">
                <button onClick={onUpload} className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-semibold flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={UPLOAD_ICON} /></svg>
                    Subir el primer extracto
                </button>
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

    // Los cuatro datos de la cabecera. Sin sumar dinero: "todas las cuentas" mezcla monedas.
    const resumen = useMemo(() => {
        const lines = visible.reduce((n, s) => n + (s.line_count || 0), 0);
        const done = visible.reduce((n, s) => n + (s.reconciled_count || 0) + (s.ignored_count || 0), 0);
        const pending = visible.reduce((n, s) => n + (s.pending_count || 0), 0);
        const lastDate = visible.reduce((m, s) => (!m || s.date_to > m ? s.date_to : m), null);
        return { lines, done, pending, lastDate };
    }, [visible]);

    if (openId) {
        return <StatementView id={openId} notify={notify} onBack={() => setOpenId(null)} />;
    }

    const empty = !loading && !visible.length;
    const totalPending = accounts.reduce((n, a) => n + (a.pending_lines || 0), 0);
    const title = account ? toNameCase(account.journal_name || account.bank_name) : "Todas las cuentas";
    const subtitle = account
        ? [account.account_number ? `Cuenta ·· ${last4(account.account_number)}` : null, account.currency_code, plural(account.statements || 0, "extracto", "extractos")].filter(Boolean).join(" · ")
        : `${plural(accounts.length, "cuenta bancaria", "cuentas bancarias")} · ${plural(statements.length, "extracto", "extractos")}`;

    const uploadButton = (
        <button
            onClick={() => setShowImport(true)}
            disabled={!accounts.length}
            className="btn-accent h-9 px-3 sm:px-4 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 shrink-0 active:scale-95 disabled:opacity-50"
        >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={UPLOAD_ICON} /></svg>
            <span className="hidden sm:inline">Subir extracto</span>
            <span className="sm:hidden">Subir</span>
        </button>
    );

    if (!loading && !accounts.length) {
        return (
            <div className="h-full overflow-y-auto p-4">
                <div className={`${CARD} py-16 text-center px-6`}>
                    <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={BANK_ICON} /></svg>
                    </div>
                    <div className="text-[14px] font-semibold text-content dark:text-white">No hay cuentas bancarias para conciliar</div>
                    <div className="text-[13px] text-content-subtle mt-1">Crea un diario de pago móvil, punto o transferencia con su banco en Configuración → Diarios.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto lg:overflow-hidden lg:flex">
            {/* ── Cuentas (escritorio) ─────────────────────────────── */}
            <aside className="hidden lg:flex w-[290px] shrink-0 flex-col bg-white dark:bg-white/[0.02] border-r border-border/60 dark:border-white/[0.06]">
                <div className="px-4 pt-4 pb-2 flex items-baseline justify-between">
                    <span className="text-[14px] font-semibold text-content dark:text-white">Cuentas</span>
                    {totalPending > 0 && <span className="text-[12px] text-content-subtle tabular-nums">{totalPending} por conciliar</span>}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-0.5">
                    {loading && !accounts.length ? (
                        [0, 1, 2].map(i => (
                            <div key={i} className="px-2.5 py-2 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-surface-3 dark:bg-white/[0.06] animate-pulse" />
                                <div className="flex-1 space-y-1.5">
                                    <div className="h-3 w-2/3 rounded bg-surface-3 dark:bg-white/[0.06] animate-pulse" />
                                    <div className="h-2.5 w-1/3 rounded bg-surface-3 dark:bg-white/[0.06] animate-pulse" />
                                </div>
                            </div>
                        ))
                    ) : (
                        <>
                            <AccountItem all on={!accountKey} onClick={() => setAccountKey("")}
                                name="Todas las cuentas"
                                sub={plural(statements.length, "extracto", "extractos")}
                                pending={totalPending} />
                            <div className="my-1.5 mx-2.5 border-t border-border/60 dark:border-white/[0.06]" />
                            {accounts.map(a => (
                                <AccountItem key={a.key} on={a.key === accountKey} onClick={() => setAccountKey(a.key)}
                                    name={toNameCase(a.journal_name || a.bank_name)}
                                    bank={a.bank_name}
                                    symbol={a.currency_symbol}
                                    sub={[a.account_number ? `·· ${last4(a.account_number)}` : null, a.statements ? `Hasta el ${fmtDateShort(a.last_date)}` : "Sin extractos"].filter(Boolean).join(" · ")}
                                    pending={a.pending_lines}
                                    upToDate={a.statements > 0} />
                            ))}
                        </>
                    )}
                </div>
            </aside>

            {/* ── Cuenta elegida ──────────────────────────────────── */}
            <div className="flex-1 min-w-0 flex flex-col lg:min-h-0 lg:overflow-y-auto">
                {/* Teléfono y tablet: la cuenta se elige aquí. */}
                <div className="lg:hidden shrink-0 px-4 py-2.5 flex items-center gap-2 border-b border-border/60 dark:border-white/[0.06]">
                    <div className="flex-1 min-w-0 sm:flex-none sm:w-72">
                        <CustomSelect
                            value={accountKey}
                            onChange={setAccountKey}
                            height="h-9"
                            boxClassName="rounded-lg"
                            placeholder="Todas las cuentas"
                            options={[
                                { value: "", label: "Todas las cuentas" },
                                ...accounts.map(a => ({ value: a.key, label: toNameCase(accountLabel(a)) })),
                            ]}
                        />
                    </div>
                    <div className="ml-auto">{uploadButton}</div>
                </div>

                <div className="px-4 lg:px-6 pt-4 lg:pt-5 pb-6 space-y-4">
                    {/* Cabecera */}
                    <div className="flex items-center gap-3">
                        <BankMark name={account?.bank_name} all={!account} on size="w-11 h-11 text-[15px]" />
                        <div className="min-w-0 flex-1">
                            <h2 className="text-[20px] font-semibold tracking-tight text-content dark:text-white truncate">
                                {title}{account && <span className="text-content-subtle font-medium"> · {account.currency_symbol}</span>}
                            </h2>
                            <div className="text-[13px] text-content-subtle truncate">{subtitle}</div>
                        </div>
                        <div className="hidden lg:block">{uploadButton}</div>
                    </div>

                    {/* Cuatro datos */}
                    {!empty && (
                        <dl className={`${CARD} grid grid-cols-2 lg:grid-cols-4 overflow-hidden`}>
                            <Dato i={0} label="Extractos" hint={resumen.lastDate ? `Hasta el ${fmtDateShort(resumen.lastDate)}` : " "}>
                                {loading ? "—" : visible.length}
                            </Dato>
                            <Dato i={1} label="Movimientos" hint={loading ? " " : `${resumen.done} ya revisados`}>
                                {loading ? "—" : resumen.lines}
                            </Dato>
                            <Dato i={2} label="Por conciliar" tone={resumen.pending > 0 ? "warning" : null}
                                hint={loading ? " " : resumen.pending > 0 ? "Esperan tu revisión" : "Todo al día"}>
                                {loading ? "—" : resumen.pending}
                            </Dato>
                            <div className="px-4 py-3 min-w-0 flex flex-col justify-center">
                                <dt className="text-[12px] text-content-subtle mb-1.5">Avance</dt>
                                <dd><Avance done={resumen.done} total={resumen.lines} wide /></dd>
                            </div>
                        </dl>
                    )}

                    {/* Extractos */}
                    {empty ? (
                        <Primeros account={account} onUpload={() => setShowImport(true)} />
                    ) : (
                        <>
                            <div className="hidden md:block">
                                <div className="flex items-baseline justify-between mb-2 px-1">
                                    <span className="text-[14px] font-semibold text-content dark:text-white">Extractos</span>
                                    {!loading && <span className="text-[12px] text-content-subtle">Toca uno para conciliarlo línea por línea</span>}
                                </div>
                                <div className="card-premium overflow-x-auto">
                                    <table className="table-ledger">
                                        <thead>
                                            <tr>
                                                <th className="pl-4">Extracto</th>
                                                <th className="w-[220px]">Período</th>
                                                <th className="w-[180px]">Avance</th>
                                                <th className="text-right w-[150px]">Abonos</th>
                                                <th className="text-right w-[150px]">Cargos</th>
                                                <th className="pl-6 pr-4 w-[180px]">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loading ? <LedgerSkeleton cols={6} rows={4} />
                                                : visible.map(s => {
                                                    const listo = s.pending_count === 0;
                                                    const sym = s.currency_symbol || "Ref.";
                                                    return (
                                                        <tr key={s.id} {...ledgerRow(() => setOpenId(s.id))}>
                                                            <td className="pl-4 max-w-0">
                                                                <div className="text-[13px] font-semibold text-content dark:text-white truncate">{toNameCase(s.bank_name)} <span className="text-content-subtle font-medium">· {sym}</span></div>
                                                                <div className="text-[12px] text-content-subtle truncate">{s.filename || `Extracto #${s.id}`}{s.warehouse_name ? ` · ${toNameCase(s.warehouse_name)}` : ""}</div>
                                                            </td>
                                                            <td className="whitespace-nowrap tabular-nums text-[13px] text-content dark:text-white">
                                                                {fmtDateShort(s.date_from)} <span className="text-content-subtle">al</span> {fmtDateShort(s.date_to)}
                                                            </td>
                                                            <td><Avance done={s.reconciled_count + s.ignored_count} total={s.line_count} /></td>
                                                            <td className="text-right"><Money value={fmtMoney(s.total_credit, sym)} className="text-[13px] text-content dark:text-white" /></td>
                                                            <td className="text-right">
                                                                {Number(s.total_debit) > 0
                                                                    ? <Money value={`-${fmtMoney(s.total_debit, sym)}`} className="text-[13px] text-content dark:text-white" />
                                                                    : <span className="text-[13px] text-content-subtle">—</span>}
                                                            </td>
                                                            <td className="pl-6 pr-4">
                                                                <StatusMark status={listo ? "listo" : "pendiente"} map={{ ...STATEMENT_STATUS, pendiente: { ...STATEMENT_STATUS.pendiente, label: `${s.pending_count} por conciliar` } }} />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Teléfono: tarjetas de dos renglones */}
                            <div className="md:hidden space-y-2">
                                {loading ? (
                                    <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                                ) : visible.map(s => (
                                    <button key={s.id} onClick={() => setOpenId(s.id)}
                                        className={`w-full text-left ${CARD} px-4 py-3 active:scale-[0.99] transition-transform`}>
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
                                        <div className="mt-2.5"><Avance done={s.reconciled_count + s.ignored_count} total={s.line_count} /></div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

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
