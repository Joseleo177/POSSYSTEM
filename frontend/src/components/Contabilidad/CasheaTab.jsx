import { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { fmtDateShort, todayISO, toNameCase } from "../../helpers";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import Check from "../ui/Check";
import Segmented from "../ui/Segmented";
import StatusMark from "../ui/StatusMark";
import DatePicker from "../ui/DatePicker";
import ConfirmModal from "../ui/ConfirmModal";
import RateField, { resolveRate } from "../ui/RateField";
import { Spinner } from "../ui/Spinner";
import { LedgerSkeleton, LedgerEmpty, RowIcon, stopRow } from "../ui/Ledger";
import JournalPickerButton from "../cobro/JournalPickerButton";

/**
 * Cuentas → Cashea: lo que Cashea debe por las ventas que financió y sus depósitos.
 *
 * Cada venta con Cashea dejó un cobro contra el diario Cashea por lo financiado (ver
 * services/cashea). Aquí se marcan las ventas que paga un depósito y se registra lo que llegó:
 * el dinero pasa del diario Cashea al banco y lo que no llegó queda como comisión de Cashea.
 */
export default function CasheaTab({ notify }) {
    const { can, baseCurrency } = useApp();
    const [view, setView] = useState("pendientes");
    const [data, setData] = useState(null);
    const [liqs, setLiqs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState({});
    const [settling, setSettling] = useState(false);
    const [toVoid, setToVoid] = useState(null);

    const canSettle = can("accounting.income");
    const canVoid = can("accounting.void");
    const fmt = (n) => `${baseCurrency?.symbol || "Ref."} ${(parseFloat(n) || 0).toFixed(2)}`;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [p, l] = await Promise.all([api.cashea.pending(), api.cashea.settlements()]);
            setData(p.data);
            setLiqs(l.data || []);
            // Lo marcado que ya no está pendiente (lo liquidó otro) se suelta.
            const vivos = new Set((p.data?.items || []).map(i => i.id));
            setSelected(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => vivos.has(Number(id)))));
        } catch (e) { notify(e.message, "err"); }
        setLoading(false);
    }, [notify]);
    useEffect(() => { load(); }, [load]);

    const items = data?.items || [];
    const s = data?.summary;
    const selList = items.filter(i => selected[i.id]);
    const selTotal = selList.reduce((a, i) => a + i.amount, 0);
    const toggle = (i) => setSelected(prev => {
        const next = { ...prev };
        if (next[i.id]) delete next[i.id]; else next[i.id] = true;
        return next;
    });
    const todas = items.length > 0 && selList.length === items.length;
    const toggleTodas = () => setSelected(todas ? {} : Object.fromEntries(items.map(i => [i.id, true])));

    const anular = async () => {
        try {
            await api.cashea.voidSettlement(toVoid.id);
            notify(`Liquidación #${toVoid.id} anulada: sus ventas vuelven a estar por liquidar`);
            setToVoid(null);
            load();
        } catch (e) { notify(e.message, "err"); }
    };

    const doc = (i) => i.invoice_number || `#${i.sale_id}`;
    const pct = (l) => (l.owed_amount > 0 ? (l.commission / l.owed_amount) * 100 : 0);
    const fmtCuenta = (l) => `${l.is_base ? (baseCurrency?.symbol || "Ref.") : (l.currency_symbol || "")} ${(parseFloat(l.received_amount) || 0).toFixed(2)}`;
    const LIQ_STATUS = { activo: { label: "Registrada", tone: "success", quiet: "check" }, anulado: { label: "Anulada", tone: "neutral" } };

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-3 sm:p-4 space-y-4">
                {/* ── Resumen ── */}
                <div className={`${CARD} grid grid-cols-2 sm:grid-cols-3 [&>*]:border-border/60 dark:[&>*]:border-white/[0.06] [&>*:nth-child(2)]:border-r sm:[&>*:nth-child(-n+2)]:border-r [&>*:first-child]:border-b sm:[&>*:first-child]:border-b-0`}>
                    <div className="col-span-2 sm:col-span-1 px-5 py-4">
                        <p className="text-[12px] text-content-subtle">Cashea te debe</p>
                        <Money value={fmt(s?.owed)} className="block mt-1 text-[24px] font-bold tracking-tight text-content dark:text-white" />
                    </div>
                    <div className="px-5 py-4">
                        <p className="text-[12px] text-content-subtle">Ventas por liquidar</p>
                        <p className="mt-1 text-[20px] font-semibold tabular-nums text-content dark:text-white">{s?.count ?? 0}</p>
                    </div>
                    <div className="px-5 py-4">
                        <p className="text-[12px] text-content-subtle">Comisión de Cashea este mes</p>
                        <Money value={fmt(s?.month_commission)} className="block mt-1 text-[20px] font-semibold text-content dark:text-white" />
                        {s?.month_settled > 0 && (
                            <p className="text-[12px] text-content-subtle tabular-nums">
                                {((s.month_commission / s.month_settled) * 100).toFixed(1)} % de {fmt(s.month_settled)} liquidados
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Segmented value={view} onChange={setView} options={[
                        { key: "pendientes", label: "Por liquidar", count: items.length },
                        { key: "liquidaciones", label: "Depósitos", count: liqs.filter(l => l.status === "activo").length },
                    ]} />
                    <button onClick={load} disabled={loading} title="Actualizar" aria-label="Actualizar"
                        className="h-9 w-9 rounded-lg border border-border dark:border-white/10 flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                        <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                </div>

                {view === "pendientes" ? (
                    <div className={`${CARD} overflow-hidden`}>
                        {/* Móvil: tarjetas de dos renglones. */}
                        <div className="md:hidden divide-y divide-border/60 dark:divide-white/[0.06]">
                            {loading && !data ? (
                                <p className="py-12 text-center text-[13px] text-content-subtle">Cargando…</p>
                            ) : items.length === 0 ? (
                                <Vacio />
                            ) : items.map(i => (
                                <div key={i.id} className="px-4 py-3 flex items-start gap-3" onClick={() => canSettle && toggle(i)}>
                                    {canSettle && <div className="pt-0.5" onClick={stopRow}><Check checked={!!selected[i.id]} onChange={() => toggle(i)} /></div>}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className="text-[14px] font-semibold text-content dark:text-white tabular-nums truncate">{doc(i)}</span>
                                            <Money value={fmt(i.amount)} className="text-[14px] font-semibold text-content dark:text-white shrink-0" />
                                        </div>
                                        <div className="flex items-baseline justify-between gap-3 mt-0.5 text-[12px] text-content-subtle">
                                            <span className="truncate">{toNameCase(i.customer_name) || "Sin cliente"}</span>
                                            <span className="tabular-nums shrink-0">{fmtDateShort(i.created_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Escritorio: tabla. */}
                        <table className="table-ledger hidden md:table">
                            <thead>
                                <tr>
                                    {canSettle && (
                                        <th className="w-10 pl-4">
                                            {items.length > 0 && <Check checked={todas} onChange={toggleTodas} title={todas ? "Quitar todas" : "Marcar todas"} />}
                                        </th>
                                    )}
                                    <th className={canSettle ? "" : "pl-4"}>Factura</th>
                                    <th className="text-left">Cliente</th>
                                    <th className="text-left">Sucursal</th>
                                    <th className="text-left">Fecha</th>
                                    <th className="text-left">Orden Cashea</th>
                                    <th className="text-right pr-4">Te debe</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && !data ? <LedgerSkeleton cols={canSettle ? 7 : 6} rows={5} />
                                    : items.length === 0 ? <LedgerEmpty cols={canSettle ? 7 : 6} title="Cashea no te debe nada" hint="Las ventas con Cashea aparecen aquí hasta que registres su depósito." />
                                    : items.map(i => (
                                        <tr key={i.id} className={`${canSettle ? "ledger-row" : ""} ${selected[i.id] ? "[&>td]:!bg-brand-500/[0.05]" : ""}`} onClick={canSettle ? () => toggle(i) : undefined}>
                                            {canSettle && <td className="pl-4" onClick={stopRow}><Check checked={!!selected[i.id]} onChange={() => toggle(i)} /></td>}
                                            <td className={canSettle ? "" : "pl-4"}><span className="text-[13px] font-semibold text-content dark:text-white tabular-nums whitespace-nowrap">{doc(i)}</span></td>
                                            <td className="max-w-[220px]"><span className="text-[13px] text-content dark:text-white truncate block">{toNameCase(i.customer_name) || "Sin cliente"}</span></td>
                                            <td><span className="text-[12px] text-content-subtle">{toNameCase(i.warehouse_name) || "—"}</span></td>
                                            <td><span className="text-[12px] text-content-subtle tabular-nums">{fmtDateShort(i.created_at)}</span></td>
                                            <td><span className="text-[12px] text-content-subtle tabular-nums">{i.reference_number || "—"}</span></td>
                                            <td className="text-right pr-4"><Money value={fmt(i.amount)} className="text-[14px] font-semibold text-content dark:text-white" /></td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={`${CARD} overflow-hidden`}>
                        <div className="md:hidden divide-y divide-border/60 dark:divide-white/[0.06]">
                            {liqs.length === 0 ? (
                                <div className="py-12 px-6 text-center">
                                    <p className="text-[14px] font-semibold text-content dark:text-white">Todavía no hay depósitos</p>
                                    <p className="text-[12px] text-content-subtle mt-1">Marca las ventas que pagó Cashea y registra el depósito.</p>
                                </div>
                            ) : liqs.map(l => (
                                <div key={l.id} className={`px-4 py-3 ${l.status === "anulado" ? "opacity-60" : ""}`}>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(l.journal_name)}</span>
                                        <Money value={fmtCuenta(l)} className="text-[14px] font-semibold text-content dark:text-white shrink-0" />
                                    </div>
                                    <div className="flex items-center justify-between gap-3 mt-0.5 text-[12px] text-content-subtle">
                                        <span className="tabular-nums">{fmtDateShort(l.date)} · {l.sale_count} {l.sale_count === 1 ? "venta" : "ventas"}</span>
                                        <span className="tabular-nums whitespace-nowrap">Comisión {fmt(l.commission)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 mt-2">
                                        <StatusMark status={l.status} map={LIQ_STATUS} />
                                        {canVoid && l.status === "activo" && (
                                            <button onClick={() => setToVoid(l)} className="text-[12px] font-medium text-content-subtle hover:text-red-600">Anular</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <table className="table-ledger hidden md:table">
                            <thead>
                                <tr>
                                    <th className="pl-4">Fecha</th>
                                    <th className="text-left">Cuenta</th>
                                    <th className="text-left">Referencia</th>
                                    <th className="text-center">Ventas</th>
                                    <th className="text-right">Debía</th>
                                    <th className="text-right">Llegó</th>
                                    <th className="text-right">Comisión</th>
                                    <th className="text-left">Estado</th>
                                    <th className="pr-4 w-px"><span className="sr-only">Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && !liqs.length ? <LedgerSkeleton cols={9} rows={4} />
                                    : liqs.length === 0 ? <LedgerEmpty cols={9} title="Todavía no hay depósitos" hint="Marca las ventas que pagó Cashea y registra el depósito." />
                                    : liqs.map(l => (
                                        <tr key={l.id} className={l.status === "anulado" ? "opacity-60" : ""}>
                                            <td className="pl-4"><span className="text-[13px] text-content dark:text-white tabular-nums">{fmtDateShort(l.date)}</span></td>
                                            <td><span className="text-[13px] text-content dark:text-white">{toNameCase(l.journal_name)}</span></td>
                                            <td><span className="text-[12px] text-content-subtle tabular-nums">{l.reference || "—"}</span></td>
                                            <td className="text-center"><span className="text-[13px] tabular-nums">{l.sale_count}</span></td>
                                            <td className="text-right"><Money value={fmt(l.owed_amount)} className="text-[13px] text-content-subtle" /></td>
                                            <td className="text-right">
                                                <Money value={fmtCuenta(l)} className="block text-[13px] font-semibold text-content dark:text-white" />
                                                {!l.is_base && <Money value={`≈ ${fmt(l.received_base)}`} className="block text-[12px] text-content-subtle" />}
                                            </td>
                                            <td className="text-right">
                                                <Money value={fmt(l.commission)} className="block text-[13px] text-content dark:text-white" />
                                                <span className="block text-[12px] text-content-subtle tabular-nums">{pct(l).toFixed(1)} %</span>
                                            </td>
                                            <td><StatusMark status={l.status} map={LIQ_STATUS} /></td>
                                            <td className="pr-4 whitespace-nowrap">
                                                {canVoid && l.status === "activo" && (
                                                    <RowIcon icon="ban" tone="danger" title="Anular depósito" onClick={() => setToVoid(l)} />
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Barra de la selección: el botón dice cuánto se liquida. */}
            {view === "pendientes" && selList.length > 0 && (
                <div className="sticky bottom-0 z-20 px-3 sm:px-4 pb-3 sm:pb-4">
                    <div className={`${CARD} shadow-2xl shadow-black/10 px-4 py-3 flex items-center gap-3`}>
                        <div className="min-w-0 flex-1">
                            <p className="text-[12px] text-content-subtle">
                                {selList.length} {selList.length === 1 ? "venta marcada" : "ventas marcadas"}
                                <span aria-hidden="true"> · </span>
                                <button onClick={() => setSelected({})} className="font-medium text-content-subtle hover:text-content dark:hover:text-white underline-offset-2 hover:underline">Limpiar</button>
                            </p>
                            <Money value={fmt(selTotal)} className="block text-[18px] font-bold tracking-tight text-content dark:text-white" />
                        </div>
                        {/* En el teléfono el monto ya está a la izquierda: el botón solo lleva el verbo. */}
                        <button onClick={() => setSettling(true)} className="btn-accent shrink-0 h-12 sm:h-10 px-4 sm:px-5 rounded-lg text-[13px] font-semibold tabular-nums">
                            Registrar depósito<span className="hidden sm:inline"> de {fmt(selTotal)}</span>
                        </button>
                    </div>
                </div>
            )}

            {settling && (
                <SettleModal
                    items={selList}
                    onClose={() => setSettling(false)}
                    onDone={(r) => {
                        setSettling(false);
                        setSelected({});
                        notify(r.commission > 0
                            ? `Depósito registrado. Comisión de Cashea: ${fmt(r.commission)}`
                            : "Depósito registrado");
                        load();
                    }}
                />
            )}

            <ConfirmModal
                isOpen={!!toVoid}
                title="Anular depósito de Cashea"
                message={toVoid ? `Se anulan la entrada en ${toNameCase(toVoid.journal_name)} y la comisión. Sus ${toVoid.sale_count} ${toVoid.sale_count === 1 ? "venta vuelve" : "ventas vuelven"} a estar por liquidar.` : ""}
                confirmText="Anular"
                onConfirm={anular}
                onCancel={() => setToVoid(null)}
            />
        </div>
    );
}

function Vacio() {
    return (
        <div className="py-12 px-6 text-center">
            <div className="w-11 h-11 mx-auto mb-3 rounded-xl bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-[14px] font-semibold text-content dark:text-white">Cashea no te debe nada</p>
            <p className="text-[12px] text-content-subtle mt-1">Las ventas con Cashea aparecen aquí hasta que registres su depósito.</p>
        </div>
    );
}

/**
 * Registrar lo que depositó Cashea por las ventas marcadas. Se escribe lo que llegó, en la moneda
 * de la cuenta; la comisión es lo que Cashea debía menos eso, y la calcula el servidor igual.
 */
function SettleModal({ items, onClose, onDone }) {
    const { notify, baseCurrency, activeCurrencies, inflowJournals } = useApp();
    const [form, setForm] = useState({ journal_id: "", payment_method: null, amount: "", rate: "", date: todayISO(), reference: "", notes: "" });
    const [loading, setLoading] = useState(false);

    const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
    const baseSym = baseCurrency?.symbol || "Ref.";
    const fmtB = (n) => `${baseSym} ${round2(n).toFixed(2)}`;
    // Cashea deposita en el banco: las gavetas de efectivo no se ofrecen.
    const cuentas = useMemo(() => (inflowJournals || []).filter(j => j.type !== "efectivo"), [inflowJournals]);
    const cuenta = cuentas.find(j => j.id === form.journal_id);
    const moneda = cuenta?.currency_id ? activeCurrencies.find(c => c.id === parseInt(cuenta.currency_id)) : null;
    const esBase = !moneda || moneda.is_base;
    const tasaConfig = esBase ? 1 : parseFloat(moneda.exchange_rate || 1);
    const tasa = esBase ? 1 : resolveRate(form.rate, tasaConfig);
    const sym = esBase ? baseSym : (moneda?.symbol || "");

    const debia = round2(items.reduce((a, i) => a + i.amount, 0));
    const llego = round2(String(form.amount).replace(",", "."));
    const llegoBase = round2(llego / (tasa || 1));
    const comision = round2(debia - llegoBase);
    const excede = llego > 0 && llegoBase > debia + 0.01;
    const puede = !loading && !!form.journal_id && llego > 0 && !excede && !!form.date;

    const submit = async () => {
        if (!puede) return;
        setLoading(true);
        try {
            const res = await api.cashea.settle({
                payment_ids: items.map(i => i.id),
                journal_id: form.journal_id,
                payment_method: form.payment_method,
                received_amount: llego,
                rate: esBase ? undefined : tasa,
                date: form.date,
                reference: form.reference.trim() || null,
                notes: form.notes.trim() || null,
            });
            onDone(res.data);
        } catch (e) {
            notify(e.message, "err");
            setLoading(false);
        }
    };

    return (
        <Modal open onClose={loading ? () => {} : onClose} title="Depósito de Cashea" width={800}
            footer={
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                    <button onClick={onClose} disabled={loading} className="btn-outline h-12 sm:h-11 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <button onClick={submit} disabled={!puede}
                        className="btn-accent sm:flex-1 h-12 sm:h-11 rounded-lg text-[14px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 tabular-nums">
                        {loading && <Spinner />}
                        {loading ? "Registrando…" : llego > 0 ? `Registrar depósito de ${sym} ${llego.toFixed(2)}` : "Registrar depósito"}
                    </button>
                </div>
            }>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0 space-y-4">
                    <Field label="Cuenta donde depositó Cashea">
                        <JournalPickerButton
                            value={form.journal_id}
                            journals={cuentas}
                            placeholder="Elegir cuenta…"
                            boxClassName="rounded-lg"
                            methodPrompt={{ tag: "Depósito de Cashea", title: "¿Por dónde llegó el dinero?" }}
                            onSelect={(j) => setForm(p => ({ ...p, journal_id: j.id, payment_method: j.payment_method || null, rate: "", amount: "" }))}
                        />
                    </Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Monto que llegó">
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{sym}</span>
                                <input type="text" inputMode="decimal" autoComplete="off" data-autofocus
                                    value={form.amount}
                                    onChange={e => setForm(p => ({ ...p, amount: e.target.value.replace(/[^\d.,]/g, "") }))}
                                    placeholder={round2(debia * tasa).toFixed(2)}
                                    aria-label="Monto que llegó"
                                    className={`${INPUT} pl-11 text-[14px] font-semibold tabular-nums ${excede ? "!border-red-500" : ""}`} />
                            </div>
                            {!esBase && llego > 0 && <p className="text-[12px] text-content-subtle tabular-nums mt-1">≈ {fmtB(llegoBase)}</p>}
                        </Field>
                        <Field label="Fecha del depósito">
                            <DatePicker value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} clearable={false} className="w-full" />
                        </Field>
                    </div>
                    {!esBase && (
                        <Field label="Tasa de cambio">
                            <RateField value={form.rate} onChange={v => setForm(p => ({ ...p, rate: v }))} configuredRate={tasaConfig} currency={moneda} />
                        </Field>
                    )}
                    <Field label="N° de referencia" hint="Opcional">
                        <input type="text" autoComplete="off" maxLength={50} value={form.reference}
                            onChange={e => setForm(p => ({ ...p, reference: e.target.value }))}
                            placeholder="Ej: 000123456" className={INPUT} />
                    </Field>
                    <Field label="Notas" hint="Opcional">
                        <input type="text" autoComplete="off" value={form.notes}
                            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                            placeholder="Observaciones…" className={INPUT} />
                    </Field>
                </div>

                {/* Columna de solo lectura: qué se liquida y cuánto se quedó Cashea. */}
                <aside className="min-w-0 lg:border-l lg:border-border/60 dark:lg:border-white/[0.06] lg:pl-6 space-y-4">
                    <div>
                        <p className="text-[13px] font-semibold text-content dark:text-white">{items.length} {items.length === 1 ? "venta" : "ventas"}</p>
                        <div className="mt-2 rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] lg:max-h-56 lg:overflow-y-auto">
                            {items.map(i => (
                                <div key={i.id} className="px-3.5 py-2.5 flex items-baseline justify-between gap-3">
                                    <span className="min-w-0">
                                        <span className="block text-[13px] font-semibold text-content dark:text-white tabular-nums truncate">{i.invoice_number || `#${i.sale_id}`}</span>
                                        <span className="block text-[12px] text-content-subtle tabular-nums">{fmtDateShort(i.created_at)}</span>
                                    </span>
                                    <Money value={fmtB(i.amount)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <dl className="rounded-xl bg-surface-2 dark:bg-white/[0.03] px-4 py-3 space-y-2 text-[13px]">
                        <div className="flex justify-between gap-3">
                            <dt className="text-content-subtle">Cashea debía</dt>
                            <dd><Money value={fmtB(debia)} className="font-semibold text-content dark:text-white" /></dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-content-subtle">Llegó</dt>
                            <dd><Money value={llego > 0 ? fmtB(llegoBase) : "—"} className="font-semibold text-content dark:text-white" /></dd>
                        </div>
                        <div className="flex justify-between gap-3 pt-2 border-t border-border/70 dark:border-white/[0.06]">
                            <dt className="font-semibold text-content dark:text-white">Comisión de Cashea</dt>
                            <dd className="text-right">
                                {excede ? (
                                    <span className="font-semibold text-red-600 dark:text-red-400">Llegó de más</span>
                                ) : llego > 0 ? (
                                    <>
                                        <Money value={fmtB(Math.max(0, comision))} className="block font-semibold text-content dark:text-white" />
                                        {debia > 0 && <span className="block text-[12px] text-content-subtle tabular-nums">{((Math.max(0, comision) / debia) * 100).toFixed(1)} %</span>}
                                    </>
                                ) : "—"}
                            </dd>
                        </div>
                    </dl>
                    <p className={`text-[12px] leading-snug ${excede ? "text-red-600 dark:text-red-400" : "text-content-subtle"}`}>
                        {excede
                            ? `Llegó más de lo que Cashea debía por estas ventas. Revisa el monto${esBase ? "" : " o la tasa"}, o marca más ventas.`
                            : "La comisión es lo que Cashea debía menos lo que llegó. Queda como egreso de la cuenta Cashea."}
                    </p>
                </aside>
            </div>
        </Modal>
    );
}

function Field({ label, hint, children }) {
    return (
        <div>
            <p className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-medium text-content-subtle">{label}</span>
                {hint && <span className="text-[11px] text-content-subtle/70">{hint}</span>}
            </p>
            {children}
        </div>
    );
}

const CARD = "bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";
