import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../../../services/api";
import { fmtDateShort, fmtMoney, toNameCase } from "../../../helpers";
import { useDebounce } from "../../../hooks/useDebounce";
import { Button } from "../../ui/Button";
import Check from "../../ui/Check";
import CustomSelect from "../../ui/CustomSelect";
import ConfirmModal from "../../ui/ConfirmModal";
import Money from "../../ui/Money";
import StatusMark from "../../ui/StatusMark";
import { JournalDot } from "../../ui/Ledger";
import { LINE_STATUS, KIND_LABEL, MODE_LABEL, SOURCE_LABEL, lineAmount, isCredit, fmtLine, needsWarehouse, journalOptions, plural } from "./reconMeta";

const TOL = 0.01;
const LABEL = "text-[12px] text-content-subtle";
const SECTION = "text-[14px] font-semibold text-content dark:text-white";

// Categoría que usa el servidor si no se elige otra, para las líneas que el banco marcó.
const AUTO_CATEGORY = {
    comision: "Comisiones bancarias (automática)",
    impuesto: "Impuestos bancarios (automática)",
    interes:  "Intereses bancarios (automática)",
};

const CheckIcon = ({ className = "w-3 h-3" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
);

// Documento ya casado con la línea.
// Cuenta y método: desde que el diario es la cuenta, "Banco de Venezuela" solo no dice si el
// dinero entró por pago móvil, punto o biopago.
const withMethod = (journal, method) => (method ? `${journal} · ${method}` : journal);

function MatchRow({ m, symbol }) {
    const conjunto = m.role === "creado" && m.shared_lines > 1;
    return (
        <div className="px-3.5 py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
                <div className="text-[13px] font-medium text-content dark:text-white truncate">{m.title || SOURCE_LABEL[m.source_type]}</div>
                <div className="text-[12px] text-content-subtle truncate">
                    {[m.invoice_count > 1 ? `Cobro conjunto · ${m.invoice_count} facturas` : SOURCE_LABEL[m.source_type], m.sub ? toNameCase(m.sub) : null, m.day ? fmtDateShort(m.day) : null, m.ref ? `Ref. ${m.ref}` : null].filter(Boolean).join(" · ")}
                </div>
                {m.journal_name && <JournalDot name={withMethod(m.journal_name, m.method_name)} className="mt-0.5" />}
                {m.role === "creado" && (
                    <div className="text-[12px] text-content-subtle mt-0.5">
                        {conjunto
                            ? <>Creado desde el extracto · un solo {m.source_type === "income" ? "ingreso" : "egreso"} por <Money value={fmtMoney(m.amount, symbol)} /> para {m.shared_lines} cargos</>
                            : "Creado desde el extracto"}
                    </div>
                )}
            </div>
            {/* En un egreso conjunto, lo que le toca a esta línea; el total va debajo. */}
            <Money value={`${m.source_type === "expense" ? "-" : ""}${fmtMoney(conjunto ? m.share : m.amount, symbol)}`} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
        </div>
    );
}

export default function LinePanel({ statement: st, line, warehouses, notify, onChanged, onUndone }) {
    const symbol = st.currency_symbol || "Ref.";
    const amount = lineAmount(line);
    const credit = isCredit(line);
    const pending = line.status === "pendiente";

    const [cands, setCands]       = useState([]);
    const [lots, setLots]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [query, setQuery]       = useState("");
    const debounced               = useDebounce(query, 300);
    const [wide, setWide]         = useState(false);
    const [selected, setSelected] = useState({});           // key -> unidad
    const [registerCommission, setRegisterCommission] = useState(true);
    // Diario para registrar la línea: de salidas si es un cargo, cualquiera si es un abono.
    const defaultJournal = credit ? st.default_in_journal_id : st.default_journal_id;
    const [journalId, setJournalId] = useState(defaultJournal ? String(defaultJournal) : "");
    const [warehouseId, setWarehouseId] = useState("");
    const [showRegister, setShowRegister] = useState(false);
    const [categories, setCategories] = useState([]);
    const [categoryId, setCategoryId] = useState("");
    const [confirm, setConfirm]   = useState(null);          // "ignore" | "undo"

    const loadCands = useCallback(async () => {
        if (!pending) return;
        setLoading(true);
        try {
            const r = await api.reconciliation.candidates(st.id, line.id, { days: wide ? 30 : 10, ...(debounced ? { q: debounced } : {}) });
            setCands(r.data.candidates || []);
            setLots(r.data.lots || []);
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setLoading(false);
        }
    }, [st.id, line.id, pending, wide, debounced, notify]);

    useEffect(() => { loadCands(); }, [loadCands]);

    // Categorías para registrar el movimiento a mano: de egreso si es un cargo, de ingreso si es
    // un abono. Una línea que el banco ya marcó (comisión, interés) va a la suya sin elegir.
    useEffect(() => {
        if (!showRegister || categories.length) return;
        (credit ? api.incomes.getCategories() : api.expenses.getCategories())
            .then(r => setCategories(r.data || []))
            .catch(() => {});
    }, [showRegister, credit, categories.length]);

    const chosen = Object.values(selected);
    const sum = chosen.reduce((s, u) => s + u.amount, 0);
    // Positivo = lo que se quedó el banco (abonó menos de lo cobrado o cargó más de lo pagado).
    const commission = Math.round((credit ? sum - amount : amount - sum) * 100) / 100;
    const exact = chosen.length > 0 && Math.abs(commission) <= TOL;
    const bankKept = chosen.length > 0 && commission > TOL;
    const missing = chosen.length > 0 && commission < -TOL;
    // La comisión siempre va al diario de salidas por omisión; el registro, al elegido.
    const askWarehouse = showRegister ? needsWarehouse(st, journalId)
        : (bankKept && registerCommission) ? needsWarehouse(st, st.default_journal_id) : false;
    const canMatch = chosen.length > 0 && (exact || (bankKept && registerCommission)) && (!askWarehouse || warehouseId);

    const toggle = (u) => setSelected(s => {
        const n = { ...s };
        if (n[u.key]) delete n[u.key]; else n[u.key] = u;
        return n;
    });
    const applyLot = (lot) => {
        const n = {};
        for (const k of lot.unit_keys) {
            const u = cands.find(c => c.key === k);
            if (u) n[k] = u;
        }
        setSelected(n);
        setRegisterCommission(true);
    };

    const doMatch = async () => {
        try {
            const r = await api.reconciliation.match(st.id, line.id, {
                keys: chosen.map(u => u.key),
                register_commission: bankKept && registerCommission,
                journal_id: null,
                warehouse_id: warehouseId || null,
                currency_symbol: symbol,
            });
            notify(r.commission ? `Conciliada · comisión de ${fmtMoney(r.commission, symbol)} registrada` : "Línea conciliada");
            onChanged();
        } catch (e) { notify(e.message, "err"); }
    };

    const doRegister = async () => {
        try {
            await api.reconciliation.register(st.id, line.id, {
                category_id: categoryId || null,
                journal_id: journalId || null,
                warehouse_id: warehouseId || null,
            });
            notify(credit ? "Ingreso registrado y conciliado" : "Egreso registrado y conciliado");
            onChanged();
        } catch (e) { notify(e.message, "err"); }
    };

    const doIgnore = async () => {
        try {
            await api.reconciliation.ignore(st.id, line.id);
            notify("Línea ignorada");
            setConfirm(null);
            onChanged();
        } catch (e) { notify(e.message, "err"); setConfirm(null); }
    };

    const doUndo = async () => {
        try {
            const r = await api.reconciliation.unmatch(st.id, line.id);
            notify(r.undone > 1 ? `Conciliación deshecha: ${r.undone} líneas vuelven a quedar por conciliar` : "Conciliación deshecha");
            setConfirm(null);
            onUndone();
        } catch (e) { notify(e.message, "err"); setConfirm(null); }
    };

    const createdDocs = line.matches.filter(m => m.role === "creado");
    // Comisiones registradas juntas: deshacer una deshace todas (comparten el egreso).
    const enGrupo = Math.max(0, ...createdDocs.map(m => m.shared_lines || 1));
    const categoryOptions = useMemo(() => [
        ...(KIND_LABEL[line.kind] ? [{ value: "", label: AUTO_CATEGORY[line.kind] }] : []),
        ...categories.map(c => ({ value: String(c.id), label: c.name })),
    ], [categories, credit, line.kind]);
    const registerReady = (categoryId || categoryOptions[0]?.value === "") && journalId && (!askWarehouse || warehouseId);

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* ── La línea del banco ── */}
            <div className="shrink-0 p-4 lg:p-5 border-b border-border/60 dark:border-white/[0.06]">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className={LABEL}>{credit ? "Abono" : "Cargo"} del {fmtDateShort(line.date)}{KIND_LABEL[line.kind] ? ` · ${KIND_LABEL[line.kind]}` : ""}</div>
                        <Money value={fmtLine(line, symbol)} className="text-[24px] font-bold tracking-tight text-content dark:text-white" />
                    </div>
                    <div className="pt-1 shrink-0"><StatusMark status={line.status} map={LINE_STATUS} /></div>
                </div>
                <p className="mt-1 text-[13px] text-content dark:text-white/85 break-words">{line.description || "Sin descripción"}</p>
                {line.reference && <p className="text-[12px] text-content-subtle tabular-nums">Ref. {line.reference}</p>}
            </div>

            {/* ── Resuelta: con qué se casó ── */}
            {!pending && (
                <div className="p-4 lg:p-5 space-y-3">
                    {line.status === "conciliado" ? (
                        <>
                            <div className="flex items-baseline justify-between gap-2">
                                <span className={SECTION}>Casada con</span>
                                <span className={LABEL}>{MODE_LABEL[line.match_mode] || ""}</span>
                            </div>
                            <div className="rounded-xl bg-white dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06]">
                                {line.matches.map(m => <MatchRow key={`${m.source_type}-${m.source_id}`} m={m} symbol={symbol} />)}
                            </div>
                            {line.difference > 0 && (
                                <p className="text-[12px] text-content-subtle">El banco se quedó {fmtMoney(line.difference, symbol)} de comisión, registrada como egreso.</p>
                            )}
                        </>
                    ) : (
                        <p className="text-[13px] text-content-subtle">Se marcó como ajena al sistema{line.note ? `: ${line.note}` : "."}</p>
                    )}
                    <button onClick={() => setConfirm("undo")} className="btn-outline w-full sm:w-auto h-12 sm:h-9 px-4 rounded-lg text-[13px] font-medium">Deshacer</button>
                </div>
            )}

            {/* ── Pendiente: qué puede explicarla ── */}
            {pending && (
                <div className="flex-1 min-h-0 flex flex-col">
                    <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto custom-scrollbar p-4 lg:p-5 space-y-4">
                        {lots.length > 0 && (
                            <div className="space-y-2">
                                <span className={SECTION}>Lote del punto de venta</span>
                                {lots.map(lot => (
                                    <div key={lot.key} className="rounded-xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-3.5 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-[13px] font-medium text-content dark:text-white truncate">{lot.method_name ? `${toNameCase(lot.method_name)} · ` : ""}{toNameCase(lot.journal_name)} del {fmtDateShort(lot.day)}</div>
                                                <div className="text-[12px] text-content-subtle">{plural(lot.count, "cobro", "cobros")} por <Money value={fmtMoney(lot.sum, symbol)} /></div>
                                                <div className="text-[12px] text-content-subtle">
                                                    {lot.commission > 0 ? <>Comisión del banco <Money value={fmtMoney(lot.commission, symbol)} /> ({String(lot.pct).replace(".", ",")} %)</> : "Cuadra exacto"}
                                                </div>
                                            </div>
                                            <button onClick={() => applyLot(lot)} className="btn-outline h-9 px-3 rounded-lg text-[12px] font-medium shrink-0">Usar</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className={SECTION}>{credit ? "Cobros e ingresos" : "Egresos y vueltos"}</span>
                                <button onClick={() => setWide(w => !w)} className="text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white">
                                    {wide ? "± 30 días" : "± 10 días"} · {wide ? "acotar" : "ampliar"}
                                </button>
                            </div>
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Factura, cliente, referencia o monto…"
                                    autoComplete="off" spellCheck={false} className="input h-9 pl-9 text-[13px] w-full" />
                            </div>

                            {loading ? (
                                <div className="py-8 flex justify-center"><div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                            ) : !cands.length ? (
                                <div className="py-6 text-center">
                                    <div className="text-[13px] font-semibold text-content dark:text-white">Nada sin conciliar en esas fechas</div>
                                    <div className="text-[12px] text-content-subtle mt-1">Amplía la ventana, o regístralo si el sistema no lo tiene.</div>
                                </div>
                            ) : (
                                <div className="rounded-xl bg-white dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06]">
                                    {cands.map(u => {
                                        const on = !!selected[u.key];
                                        return (
                                            <div key={u.key} onClick={() => toggle(u)}
                                                className={`px-3.5 py-2.5 flex items-start gap-3 cursor-pointer transition-colors ${on ? "bg-brand-500/[0.06]" : "hover:bg-surface-2/60 dark:hover:bg-white/[0.03]"}`}>
                                                <Check checked={on} onChange={() => toggle(u)} title="Casar con esta línea" className="mt-0.5" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[13px] font-medium text-content dark:text-white truncate">{u.title}</div>
                                                    <div className="text-[12px] text-content-subtle truncate">
                                                        {[u.invoice_count > 1 ? `Cobro conjunto · ${u.invoice_count} facturas` : null, u.sub ? toNameCase(u.sub) : null, fmtDateShort(u.day), u.ref ? `Ref. ${u.ref}` : null].filter(Boolean).join(" · ")}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5 min-w-0">
                                                        <JournalDot name={withMethod(u.journal_name, u.method_name)} />
                                                        {u.ref_match && <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap"><CheckIcon /> Referencia</span>}
                                                        {u.exact && <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap"><CheckIcon /> Monto</span>}
                                                    </div>
                                                </div>
                                                <Money value={fmtMoney(u.amount, symbol)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* ── No está en el sistema ── */}
                        <div className="pt-1 space-y-3">
                            {!showRegister ? (
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <button onClick={() => { setShowRegister(true); setSelected({}); }}
                                        className="h-12 sm:h-9 px-3 rounded-lg border border-dashed border-border dark:border-white/15 text-[12px] font-medium text-content-subtle hover:text-content hover:border-content-subtle/60 dark:hover:text-white dark:hover:border-white/30 transition-colors flex items-center justify-center gap-1.5 sm:flex-1">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M12 5v14M5 12h14" /></svg>
                                        {credit ? "Registrar como ingreso" : "Registrar como egreso"}
                                    </button>
                                    <button onClick={() => setConfirm("ignore")} className="h-12 sm:h-9 px-3 rounded-lg text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white">
                                        Ignorar línea
                                    </button>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-3.5 space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={SECTION}>{credit ? "Registrar ingreso" : "Registrar egreso"}</span>
                                        <button onClick={() => setShowRegister(false)} className="text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white">Cancelar</button>
                                    </div>
                                    <div>
                                        <p className={`${LABEL} mb-1.5`}>Categoría</p>
                                        <CustomSelect value={categoryId} onChange={setCategoryId} options={categoryOptions} placeholder="Elige la categoría" />
                                    </div>
                                    <div>
                                        <p className={`${LABEL} mb-1.5`}>Diario</p>
                                        <CustomSelect value={journalId} onChange={setJournalId} options={journalOptions(st, credit ? "in" : "out")} placeholder="Elige el diario" />
                                    </div>
                                    {askWarehouse && (
                                        <div>
                                            <p className={`${LABEL} mb-1.5`}>Sucursal</p>
                                            <CustomSelect value={warehouseId} onChange={setWarehouseId} placeholder="Elige la sucursal"
                                                options={warehouses.map(w => ({ value: String(w.id), label: toNameCase(w.name) }))} />
                                        </div>
                                    )}
                                    {registerReady && (
                                        <Button onClick={doRegister} variant="ghost" className="w-full h-12 sm:h-10">
                                            Registrar {credit ? "ingreso" : "egreso"} de {fmtMoney(amount, symbol)}
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Selección: cuánto suma y qué falta ── */}
                    {chosen.length > 0 && (
                        <div className="shrink-0 p-4 lg:px-5 border-t border-border/60 dark:border-white/[0.06] bg-white dark:bg-surface-dark-2 lg:bg-transparent space-y-3">
                            <dl className="grid grid-cols-2 gap-3">
                                <div><dt className={LABEL}>Seleccionado · {chosen.length}</dt><dd><Money value={fmtMoney(sum, symbol)} className="text-[15px] font-semibold text-content dark:text-white" /></dd></div>
                                <div>
                                    <dt className={LABEL}>{exact ? "Diferencia" : bankKept ? "Se quedó el banco" : "Falta por explicar"}</dt>
                                    <dd className={`text-[15px] font-semibold ${exact ? "text-emerald-700 dark:text-emerald-400" : bankKept ? "text-amber-700 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                                        {exact ? <span className="inline-flex items-center gap-1"><CheckIcon className="w-3.5 h-3.5" /> Cuadra</span> : <Money value={fmtMoney(Math.abs(commission), symbol)} />}
                                    </dd>
                                </div>
                            </dl>
                            {bankKept && (
                                <div role="presentation" className="flex items-start gap-2.5 cursor-pointer" onClick={() => setRegisterCommission(v => !v)}>
                                    <Check checked={registerCommission} onChange={setRegisterCommission} title="Registrar como comisión" className="mt-0.5" />
                                    <span className="text-[13px] text-content dark:text-white">
                                        Registrar {fmtMoney(commission, symbol)} como comisión del banco
                                        <span className="block text-[12px] text-content-subtle">{sum > 0 ? `${String(Math.round((commission / (credit ? sum : amount)) * 10000) / 100).replace(".", ",")} % · ` : ""}queda como egreso en el diario de la cuenta</span>
                                    </span>
                                </div>
                            )}
                            {missing && (
                                <p className="text-[12px] text-red-600 dark:text-red-400">
                                    {credit ? "El banco abonó más de lo seleccionado: agrega el cobro que falta." : "Lo seleccionado supera el cargo del banco: quita algún movimiento."}
                                </p>
                            )}
                            {bankKept && registerCommission && askWarehouse && (
                                <CustomSelect value={warehouseId} onChange={setWarehouseId} placeholder="Sucursal de la comisión"
                                    options={warehouses.map(w => ({ value: String(w.id), label: toNameCase(w.name) }))} />
                            )}
                            {canMatch && (
                                <Button onClick={doMatch} className="w-full h-12 sm:h-10">Conciliar {fmtMoney(amount, symbol)}</Button>
                            )}
                        </div>
                    )}
                </div>
            )}

            <ConfirmModal
                isOpen={confirm === "ignore"}
                type="primary"
                title="Ignorar línea"
                message="Úsalo para lo que no corresponde a nada del sistema y no debe registrarse, como un traspaso entre cuentas propias. Podrás deshacerlo."
                confirmText="Ignorar"
                onConfirm={doIgnore}
                onCancel={() => setConfirm(null)}
            />
            <ConfirmModal
                isOpen={confirm === "undo"}
                type="warning"
                title="Deshacer conciliación"
                message={enGrupo > 1
                    ? `Estas comisiones se registraron juntas en un solo egreso. Se anula ese egreso y las ${enGrupo} líneas vuelven a quedar por conciliar.`
                    : createdDocs.length
                    ? `La línea vuelve a quedar por conciliar y se anula ${createdDocs.length === 1 ? "el movimiento que se creó" : `los ${createdDocs.length} movimientos que se crearon`} desde el extracto.`
                    : "La línea vuelve a quedar por conciliar. Los cobros y egresos del sistema no se tocan."}
                confirmText="Deshacer"
                onConfirm={doUndo}
                onCancel={() => setConfirm(null)}
            />
        </div>
    );
}
