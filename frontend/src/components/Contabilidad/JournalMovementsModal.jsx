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

// Sin separador de miles, como el resto de la app: "379.186,12" aquí y "Bs. 379186.12" en la
// caja y los reportes se leían como dos convenciones distintas para el mismo dinero.
const fmtNum = (n) => Number(n || 0).toFixed(2);

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

    // Filas con su rótulo de día intercalado: tabla en escritorio, tarjetas en el teléfono.
    const filas = [];
    const filasMovil = [];
    let diaActual = null;
    movements.forEach((m, idx) => {
        const dia = fmtDayLabel(m.date);
        if (dia !== diaActual) {
            diaActual = dia;
            filas.push(<DayRow key={`d-${dia}-${idx}`} cols={COLS} label={dia} className="pl-6" />);
            filasMovil.push(
                <div key={`d-${dia}-${idx}`} className="px-4 pt-4 pb-1.5 text-[13px] font-semibold text-content dark:text-white border-b border-border/60 dark:border-white/[0.06]">
                    {dia}
                </div>
            );
        }
        filas.push(<Fila key={`${m.type}-${m.id}-${idx}`} m={m} sym={sym} baseSym={baseSym} hasRate={hasRate(m)} />);
        filasMovil.push(<Tarjeta key={`${m.type}-${m.id}-${idx}`} m={m} sym={sym} baseSym={baseSym} hasRate={hasRate(m)} />);
    });

    const saldoNode = (
        <Amount sym={sym} n={saldo} sign={saldo < 0 ? "−" : ""}
            className={`block mt-0.5 leading-none font-bold tracking-tight ${saldo < 0 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`} />
    );

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-[80] bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in" onClick={onClose} />

            {/* Panel. En el teléfono desplaza el panel entero —un solo scroll—; desde md la
                cabecera queda fija y solo se desplaza la tabla. */}
            <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 pointer-events-none">
                <div
                    className="pointer-events-auto w-full max-w-5xl max-h-[92vh] md:max-h-[90vh] bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] flex flex-col overflow-y-auto md:overflow-hidden modal-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* ── Encabezado ── */}
                    <div className="shrink-0 pl-4 pr-2 md:px-6 pt-4 md:pt-5 pb-3 md:pb-4 flex items-start justify-between gap-3 md:gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/70 flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-[16px] font-semibold tracking-tight text-content dark:text-white whitespace-nowrap">Estado de cuenta</h2>
                                <p className="text-[13px] text-content-subtle mt-0.5 flex items-center gap-1.5 min-w-0">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-content-subtle/40" style={journal?.color ? { backgroundColor: journal.color } : undefined} />
                                    <span className="truncate">
                                        {toNameCase(journal?.name || "Diario")}
                                        {journal?.bank_name && journal.bank_name !== journal.name ? ` · ${toNameCase(journal.bank_name)}` : ""}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-4 shrink-0">
                            {/* En escritorio el saldo va arriba a la derecha; en el teléfono baja
                                a su propia fila para no estrujar el título. */}
                            <div className="hidden md:block text-right">
                                <div className="text-[12px] text-content-subtle">Saldo actual</div>
                                <div className="text-[24px]">{saldoNode}</div>
                            </div>
                            <button onClick={onClose} className="row-icon" title="Cerrar" aria-label="Cerrar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>

                    <div className="md:hidden shrink-0 px-4 pb-3">
                        <div className="text-[12px] text-content-subtle">Saldo actual</div>
                        <div className="text-[26px]">{saldoNode}</div>
                    </div>

                    {/* ── Resumen: tres columnas en escritorio, tres filas en el teléfono ── */}
                    <div className="shrink-0 mx-4 md:mx-6 mb-3 md:mb-4 grid grid-cols-1 md:grid-cols-3 rounded-xl bg-surface-2 dark:bg-white/[0.03] divide-y md:divide-y-0 md:divide-x divide-border/70 dark:divide-white/[0.06]">
                        {[
                            { label: "Entró", node: <Amount sym={sym} n={ingresos} sign="+" className="text-emerald-700 dark:text-emerald-400" /> },
                            { label: "Salió", node: <Amount sym={sym} n={egresos} sign="−" className="text-content dark:text-white" /> },
                            { label: "Neto", node: <Amount sym={sym} n={neto} sign={neto < 0 ? "−" : "+"} className="text-content dark:text-white" /> },
                        ].map(k => (
                            <div key={k.label} className="px-4 py-2.5 md:py-3 min-w-0 flex md:block items-baseline justify-between gap-3">
                                <div className="text-[12px] text-content-subtle">{k.label}</div>
                                <div className="md:mt-1 text-[15px] md:text-[16px] font-semibold md:truncate">{k.node}</div>
                            </div>
                        ))}
                    </div>

                    {/* ── Filtros ── */}
                    <div className="shrink-0 px-4 md:px-6 pb-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                        <DateRangePicker from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo} className="w-full md:flex-1 md:max-w-sm" />
                        <div className="md:ml-auto text-[12px] text-content-subtle tabular-nums md:whitespace-nowrap">
                            {alcance} · <span className="font-semibold text-content dark:text-white">{total}</span> {total === 1 ? "movimiento" : "movimientos"}
                        </div>
                    </div>

                    {/* ── Movimientos (teléfono): tarjetas de dos renglones por día ── */}
                    <div className="md:hidden border-t border-border dark:border-border-dark">
                        {loading ? (
                            <div className="py-14 flex items-center justify-center gap-2.5 text-[13px] text-content-subtle">
                                <span className="w-4 h-4 border-2 border-content-subtle/40 border-t-transparent rounded-full animate-spin" />
                                Cargando…
                            </div>
                        ) : movements.length === 0 ? (
                            <div className="py-14 text-center px-6">
                                <div className="text-[14px] font-semibold text-content dark:text-white">Sin movimientos</div>
                                <div className="text-[13px] text-content-subtle mt-1">
                                    {dateFrom || dateTo ? "No hay movimientos en esas fechas." : "Este diario todavía no tiene movimientos."}
                                </div>
                                {(dateFrom || dateTo) && (
                                    <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="btn-outline mt-4 h-9 px-3 rounded-lg text-[13px] font-medium">
                                        Quitar fechas
                                    </button>
                                )}
                            </div>
                        ) : filasMovil}
                    </div>

                    {/* ── Movimientos (escritorio) ── */}
                    <div className="hidden md:block flex-1 min-h-0 overflow-auto custom-scrollbar border-t border-border dark:border-border-dark">
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

// Dirección del dinero: entra (verde), sale (gris) o anulado.
function Icono({ m }) {
    const anulado = m.status === "anulado";
    const ingreso = m.type === "ingreso";
    return (
        <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
            anulado ? "bg-surface-3 dark:bg-white/[0.06] text-content-subtle"
                : ingreso ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/60"
        }`} title={anulado ? "Anulado" : ingreso ? "Ingreso" : "Egreso"}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={anulado ? VOID : ingreso ? ARROW_IN : ARROW_OUT} />
            </svg>
        </span>
    );
}

// Teléfono: dos renglones que se leen en paralelo. Arriba el documento y el monto; abajo de
// qué se trata y cómo quedó el saldo. La tabla de cuatro columnas no cabía y cortaba montos.
function Tarjeta({ m, sym, baseSym, hasRate }) {
    const anulado = m.status === "anulado";
    const ingreso = m.type === "ingreso";
    const tachado = anulado ? "line-through decoration-1 text-content-subtle" : "";
    const detalle = m.group_count > 1 ? `Cobro conjunto · ${m.group_count} facturas`
        : m.doc_ref ? `Ref. ${m.doc_ref}` : null;

    return (
        <div className={`px-4 py-3 flex gap-3 border-b border-border/60 dark:border-white/[0.06] ${anulado ? "opacity-60" : ""}`}>
            <div className="pt-0.5"><Icono m={m} /></div>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-[14px] font-semibold tabular-nums truncate ${tachado || "text-content dark:text-white"}`}>{m.reference}</span>
                    <Amount sym={sym} n={m.amount_local} sign={ingreso ? "+" : "−"}
                        className={`text-[14px] font-semibold shrink-0 ${anulado ? "line-through decoration-1 text-content-subtle" : ingreso ? "text-emerald-700 dark:text-emerald-400" : "text-content dark:text-white"}`} />
                </div>
                <div className="flex items-start justify-between gap-3 mt-0.5">
                    <div className="min-w-0">
                        <div className={`text-[13px] leading-snug line-clamp-2 ${tachado || "text-content-muted dark:text-white/75"}`}>
                            {toNameCase(m.concept)}
                        </div>
                        {(detalle || m.notes || anulado) && (
                            <div className="text-[12px] text-content-subtle line-clamp-2 mt-0.5">
                                {anulado ? "Anulado" : [detalle, m.notes].filter(Boolean).join(" · ")}
                            </div>
                        )}
                    </div>
                    <div className="shrink-0 text-right text-[12px] text-content-subtle whitespace-nowrap">
                        Saldo{" "}
                        <Amount sym={sym} n={m.balance} sign={m.balance < 0 ? "−" : ""}
                            className={m.balance < 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-content-muted dark:text-white/75"} />
                    </div>
                </div>
                {hasRate && (
                    <div className="text-[11px] text-content-subtle tabular-nums mt-0.5">
                        ≈ {baseSym} {fmtNum(m.amount_base)} · tasa {Number(m.rate).toFixed(4)}
                    </div>
                )}
            </div>
        </div>
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
                    <Icono m={m} />
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
                        ≈ {baseSym} {fmtNum(m.amount_base)} · tasa {Number(m.rate).toFixed(4)}
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
