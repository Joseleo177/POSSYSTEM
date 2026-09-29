import React, { useState, useEffect, useCallback } from "react";
import { api } from "../../services/api";
import DateRangePicker from "../ui/DateRangePicker";
import Pagination from "../ui/Pagination";
import { LedgerSkeleton, LedgerEmpty, DayRow } from "../ui/Ledger";
import { useApp } from "../../context/AppContext";
import { toNameCase } from "../../helpers";
import { fmtDayLabel } from "../../helpers/dates";

const LIMIT = 100;
const COLS = 4;

// Estado de cuenta de un diario (caja o banco), leído como un libro: los movimientos se
// agrupan por día y cada fila dice qué documento es, de qué se trata, cuánto movió y cómo
// quedó el saldo. El color se reserva: verde para lo que entra; lo que sale va en tinta con
// su signo (la mayoría de los egresos son vueltos y pagos normales, no alertas), y el rojo
// queda solo para un saldo negativo.

const fmtNum = (n) => Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Monto con el símbolo atenuado, igual que ui/Money.
function Amount({ sym, n, sign = "", className = "" }) {
    return (
        <span className={`tabular-nums whitespace-nowrap ${className}`}>
            {sign}<span className="text-[0.78em] font-medium text-content-subtle mr-1">{sym}</span>{fmtNum(Math.abs(n))}
        </span>
    );
}

const ARROW_IN = "M17 7L7 17m0 0h8m-8 0V9";
const ARROW_OUT = "M7 17L17 7m0 0H9m8 0v8";
const VOID = "M18.364 5.636L5.636 18.364M21 12a9 9 0 11-18 0 9 9 0 0118 0z";

export default function JournalMovementsModal({ journalId, bankId, warehouseId, onClose }) {
    const [movements, setMovements] = useState([]);
    const [journal, setJournal] = useState(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const { baseCurrency } = useApp();
    const sym = journal?.currency_symbol || "Ref.";
    const baseSym = baseCurrency?.symbol || "Ref.";
    // Los montos se guardan en base y se muestran en la moneda del diario. Sin el equivalente
    // no había forma de conciliar este estado de cuenta con los reportes, que suman en base.
    const hasRate = (m) => Math.abs((parseFloat(m?.rate) || 1) - 1) > 1e-6;

    const load = useCallback(async () => {
        if (!journalId && !bankId) return;
        setLoading(true);
        try {
            const params = { limit: LIMIT, offset: (page - 1) * LIMIT };
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo)   params.date_to   = dateTo;
            // La misma cuenta (banco) puede repetirse en varias sucursales sin ser la misma
            // caja real: sin esto, el detalle mezclaba los movimientos de todas.
            if (bankId && warehouseId !== undefined) params.warehouse_id = warehouseId === null ? "null" : warehouseId;
            const r = bankId
                ? await api.journals.getBankMovements(bankId, params)
                : await api.journals.getMovements(journalId, params);
            setMovements(r.data || []);
            setJournal(r.journal || null);
            setTotal(r.total || 0);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [journalId, bankId, warehouseId, page, dateFrom, dateTo]);

    useEffect(() => { setPage(1); }, [dateFrom, dateTo]);
    useEffect(() => { load(); }, [load]);

    if (!journalId && !bankId) return null;

    const totalPages = Math.ceil(total / LIMIT);
    const saldo = parseFloat(journal?.current_balance ?? 0);

    // Resumen de lo que se está viendo. Con más de una página suma solo la actual, y el
    // rótulo lo dice: presentarlo como total del período sería falso.
    const vivos = movements.filter(m => m.status !== "anulado");
    const ingresos = vivos.filter(m => m.type === "ingreso").reduce((a, m) => a + (parseFloat(m.amount_local) || 0), 0);
    const egresos = vivos.filter(m => m.type !== "ingreso").reduce((a, m) => a + (parseFloat(m.amount_local) || 0), 0);
    const neto = ingresos - egresos;
    const alcance = movements.length < total ? "En esta página"
        : (dateFrom || dateTo) ? "En el período" : "Todo el historial";

    // Filas con su rótulo de día intercalado.
    const filas = [];
    let diaActual = null;
    movements.forEach((m, idx) => {
        const dia = fmtDayLabel(m.date);
        if (dia !== diaActual) {
            diaActual = dia;
            filas.push(<DayRow key={`d-${dia}-${idx}`} cols={COLS} label={dia} className="pl-6" />);
        }
        filas.push(<Fila key={`${m.type}-${m.id}-${idx}`} m={m} sym={sym} baseSym={baseSym} hasRate={hasRate(m)} />);
    });

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[80] bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in" onClick={onClose} />

            {/* Panel */}
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="pointer-events-auto w-full max-w-5xl max-h-[90vh] bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] flex flex-col overflow-hidden modal-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* ── Encabezado ── */}
                    <div className="shrink-0 px-6 pt-5 pb-4 flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-[16px] font-semibold tracking-tight text-content dark:text-white">Estado de cuenta</h2>
                                <p className="text-[13px] text-content-subtle truncate mt-0.5 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-content-subtle/40" style={journal?.color ? { backgroundColor: journal.color } : undefined} />
                                    {toNameCase(journal?.name || "Diario")}
                                    {journal?.bank_name && journal.bank_name !== journal.name ? ` · ${toNameCase(journal.bank_name)}` : ""}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 shrink-0">
                            <div className="text-right">
                                <div className="text-[12px] text-content-subtle">Saldo actual</div>
                                <Amount sym={sym} n={saldo} sign={saldo < 0 ? "−" : ""}
                                    className={`block mt-0.5 text-[24px] leading-none font-bold tracking-tight ${saldo < 0 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`} />
                            </div>
                            <button onClick={onClose} className="row-icon" title="Cerrar" aria-label="Cerrar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* ── Resumen ── */}
                    <div className="shrink-0 mx-6 mb-4 grid grid-cols-3 rounded-xl bg-surface-2 dark:bg-white/[0.03] divide-x divide-border/70 dark:divide-white/[0.06]">
                        {[
                            { label: "Entró", node: <Amount sym={sym} n={ingresos} sign="+" className="text-emerald-700 dark:text-emerald-400" /> },
                            { label: "Salió", node: <Amount sym={sym} n={egresos} sign="−" className="text-content dark:text-white" /> },
                            { label: "Neto", node: <Amount sym={sym} n={neto} sign={neto < 0 ? "−" : "+"} className="text-content dark:text-white" /> },
                        ].map(k => (
                            <div key={k.label} className="px-4 py-3 min-w-0">
                                <div className="text-[12px] text-content-subtle">{k.label}</div>
                                <div className="mt-1 text-[16px] font-semibold truncate">{k.node}</div>
                            </div>
                        ))}
                    </div>

                    {/* ── Filtros ── */}
                    <div className="shrink-0 px-6 pb-3 flex items-center gap-3">
                        <DateRangePicker from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} className="flex-1 max-w-sm" />
                        <div className="ml-auto text-[12px] text-content-subtle tabular-nums whitespace-nowrap">
                            {alcance} · <span className="font-semibold text-content dark:text-white">{total}</span> {total === 1 ? "movimiento" : "movimientos"}
                        </div>
                    </div>

                    {/* ── Movimientos ── */}
                    <div className="flex-1 min-h-0 overflow-auto custom-scrollbar border-t border-border dark:border-border-dark">
                        <table className="table-ledger min-w-[720px]">
                            <thead className="sticky top-0 z-10">
                                <tr>
                                    <th className="pl-6 w-[220px]">Documento</th>
                                    <th>Concepto</th>
                                    <th className="text-right w-[190px]">Monto</th>
                                    <th className="text-right w-[160px] pr-6">Saldo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? <LedgerSkeleton cols={COLS} rows={8} />
                                    : movements.length === 0 ? (
                                        <LedgerEmpty cols={COLS} title="Sin movimientos"
                                            hint={dateFrom || dateTo ? "No hay movimientos en esas fechas." : "Este diario todavía no tiene movimientos."}
                                            onClear={dateFrom || dateTo ? () => { setDateFrom(""); setDateTo(""); } : undefined} />
                                    ) : filas}
                            </tbody>
                        </table>
                    </div>

                    <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
                </div>
            </div>
        </>
    );
}

function Fila({ m, sym, baseSym, hasRate }) {
    const anulado = m.status === "anulado";
    const ingreso = m.type === "ingreso";
    const tachado = anulado ? "line-through decoration-1 text-content-subtle" : "";

    return (
        <tr className={anulado ? "opacity-60" : undefined}>
            {/* Documento: dirección del dinero en el icono, el código en tinta. */}
            <td className="pl-6">
                <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        anulado ? "bg-surface-3 dark:bg-white/[0.06] text-content-subtle"
                            : ingreso ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/60"
                    }`} title={anulado ? "Anulado" : ingreso ? "Ingreso" : "Egreso"}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={anulado ? VOID : ingreso ? ARROW_IN : ARROW_OUT} />
                        </svg>
                    </span>
                    <div className="min-w-0">
                        <div className={`text-[13px] font-semibold tabular-nums truncate ${tachado || "text-content dark:text-white"}`}>
                            {m.reference}
                        </div>
                        {/* Un solo monto que saldó varias facturas: la línea es el movimiento de
                            caja, y esto avisa que cubre más de un documento. */}
                        {m.group_count > 1 ? (
                            <div className="text-[12px] text-content-subtle truncate">Cobro conjunto · {m.group_count} facturas</div>
                        ) : m.doc_ref ? (
                            <div className="text-[12px] text-content-subtle truncate">Ref. {m.doc_ref}</div>
                        ) : anulado ? (
                            <div className="text-[12px] text-content-subtle">Anulado</div>
                        ) : null}
                    </div>
                </div>
            </td>

            {/* Concepto: dos líneas antes de cortar; con una sola, "Cambio entregado (parte) —
                Factura A…" perdía justo el número de factura. */}
            <td className="max-w-0">
                <div className={`text-[13px] leading-snug line-clamp-2 ${tachado || "text-content dark:text-white"}`} title={m.concept}>
                    {toNameCase(m.concept)}
                </div>
                {m.notes && (
                    <div className="text-[12px] text-content-subtle truncate mt-0.5" title={m.notes}>{m.notes}</div>
                )}
            </td>

            <td className="text-right">
                <Amount sym={sym} n={m.amount_local} sign={ingreso ? "+" : "−"}
                    className={`text-[14px] font-semibold ${anulado ? "line-through decoration-1 text-content-subtle" : ingreso ? "text-emerald-700 dark:text-emerald-400" : "text-content dark:text-white"}`} />
                {hasRate && (
                    <div className="text-[11px] text-content-subtle tabular-nums mt-0.5 whitespace-nowrap">
                        ≈ {baseSym} {fmtNum(m.amount_base)} · tasa {Number(m.rate).toLocaleString("es-VE", { maximumFractionDigits: 4 })}
                    </div>
                )}
            </td>

            <td className="text-right pr-6">
                <Amount sym={sym} n={m.balance} sign={m.balance < 0 ? "−" : ""}
                    className={`text-[13px] font-medium ${m.balance < 0 ? "text-red-600 dark:text-red-400" : "text-content-muted dark:text-white/75"}`} />
            </td>
        </tr>
    );
}
