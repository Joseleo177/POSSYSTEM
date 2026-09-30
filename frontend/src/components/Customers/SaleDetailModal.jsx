import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { fmtBase, fmtDateShort, todayISO, toNameCase } from "../../helpers";
import DatePicker from "../ui/DatePicker";
import { Spinner } from "../ui/Spinner";
import StatusMark from "../ui/StatusMark";
import Money from "../ui/Money";

/**
 * Props:
 *   saleId    – venta a mostrar
 *   onClose   – cerrar
 *   onChanged – opcional: se cambió el vencimiento (Cuentas por Cobrar recarga su listado)
 */
export default function SaleDetailModal({ saleId, onClose, onChanged }) {
    const { baseCurrency, can, notify } = useApp();
    const [sale, setSale]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [savingDue, setSavingDue] = useState(false);
    // Misma regla que la ruta: quien da crédito o edita ventas.
    const canSetDue = can("sales.credit") || can("sales.edit");

    const fmt = (n) => fmtBase(n, baseCurrency);

    const load = useCallback((quiet = false) => {
        if (!saleId) return Promise.resolve();
        if (!quiet) setLoading(true);
        return api.sales.getOne(saleId)
            .then(d => setSale(d.data ?? d))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [saleId]);

    useEffect(() => { load(); }, [load]);

    // null = volver al plazo de crédito del cliente.
    const saveDueDate = async (value) => {
        if (savingDue) return;
        setSavingDue(true);
        try {
            await api.sales.setDueDate(saleId, value || null);
            notify(value ? "Vencimiento actualizado" : "Vencimiento según el crédito del cliente");
            await load(true);
            onChanged?.();
        } catch (e) { notify(e.message, "err"); }
        finally { setSavingDue(false); }
    };

    if (!saleId) return null;

    const items    = sale?.items   ?? [];
    const payments = sale?.Payments ?? [];
    const balance  = parseFloat(sale?.balance || 0);
    const credit   = parseFloat(sale?.credit_applied || 0);
    const forgiven = parseFloat(sale?.forgiven_amount || 0);
    const discount = parseFloat(sale?.discount_amount || 0);

    // Montos de un cobro en la moneda en que entró. Sin separador de miles, como el resto de
    // la app: "51.473,30" se leía distinto a "Bs. 51473.30" de la caja.
    const fmtCcy = (n, sym) => `${sym} ${Number(n || 0).toFixed(2)}`;

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in"
            onClick={onClose}
        >
            {/* Panel */}
            <div
                className="relative w-full max-w-lg bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] overflow-hidden flex flex-col max-h-[90vh] modal-in"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 pl-5 pr-3 pt-4 pb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/70 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <div className="text-[12px] text-content-subtle">Detalle de venta</div>
                            <div className="text-[16px] font-bold tracking-[-0.01em] text-content dark:text-white tabular-nums truncate">
                                {loading ? "Cargando…" : (sale?.invoice_number ? `Factura ${sale.invoice_number}` : `Orden #${saleId}`)}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {!loading && sale && <StatusMark status={sale.status} />}
                        <button
                            onClick={onClose}
                            aria-label="Cerrar"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:text-content hover:bg-surface-3 dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-20 gap-2.5 text-[13px] text-content-subtle">
                            <Spinner />
                            Cargando…
                        </div>
                    ) : !sale ? (
                        <div className="flex items-center justify-center py-20 text-[13px] font-medium text-red-600 dark:text-red-400">
                            No se pudo cargar la venta
                        </div>
                    ) : (
                        <div className="space-y-5 pt-1">
                            {/* ── Cabecera: a quién y cuánto ── */}
                            <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3.5 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-[12px] text-content-subtle">Cliente</p>
                                    <p className="text-[15px] font-semibold text-content dark:text-white truncate">
                                        {toNameCase(sale.customer_name) || "Sin cliente"}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[12px] text-content-subtle">Total</p>
                                    <Money value={fmt(sale.total)} className="block text-[24px] font-bold tracking-tight leading-tight text-content dark:text-white" />
                                    <p className="text-[12px] mt-0.5 tabular-nums">
                                        {balance > 0
                                            ? <span className="font-medium text-red-600 dark:text-red-400">Debe <Money value={fmt(balance)} /></span>
                                            : sale.status === "exonerado"
                                                ? <span className="text-content-subtle">Saldo exonerado</span>
                                                : <span className="text-content-subtle">Sin saldo pendiente</span>}
                                    </p>
                                </div>
                            </div>

                            {/* ── Datos del documento ── */}
                            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                                {[
                                    ["Fecha",    fmtDateShort(sale.created_at)],
                                    ["Vendedor", toNameCase(sale.employee_name) || "—"],
                                    ["Sucursal", toNameCase(sale.warehouse_name) || "—"],
                                    ["Serie",    sale.serie_name || "—"],
                                ].map(([label, value]) => (
                                    <div key={label} className="min-w-0">
                                        <dt className="text-[12px] text-content-subtle">{label}</dt>
                                        <dd className="text-[13px] font-medium text-content dark:text-white tabular-nums truncate">{value}</dd>
                                    </div>
                                ))}
                            </dl>

                            {/* Vencimiento: solo mientras se debe algo. El pactado para esta factura
                                o, si no hay, el de los días de crédito del cliente — la fecha con la
                                que Cuentas por Cobrar la marca como vencida. */}
                            {["pendiente", "parcial"].includes(sale.status) && sale.effective_due_date && (() => {
                                const due  = sale.effective_due_date;
                                const days = Math.round((new Date(todayISO()) - new Date(due)) / 86400000);
                                const vencida = days > 0;
                                const pronto  = days <= 0 && days >= -7;
                                return (
                                    // Filete de 3px a la izquierda: lo vencido pide atención.
                                    <div className={`rounded-lg border border-border/60 dark:border-white/[0.06] border-l-[3px] px-3.5 py-3 flex flex-wrap items-center justify-between gap-3 ${
                                        vencida ? "border-l-red-500" : pronto ? "border-l-amber-500" : "border-l-border dark:border-l-white/10"
                                    }`}>
                                        <div className="min-w-0">
                                            <p className="text-[12px] text-content-subtle">Vence</p>
                                            <p className="text-[13px] font-medium text-content dark:text-white tabular-nums whitespace-nowrap">
                                                {fmtDateShort(due)}
                                                {vencida && (
                                                    <span className="ml-2 font-medium text-red-600 dark:text-red-400">
                                                        Vencida hace {days} día{days !== 1 ? "s" : ""}
                                                    </span>
                                                )}
                                                {pronto && (
                                                    <span className="ml-2 font-medium text-amber-700 dark:text-amber-400">
                                                        {days === 0 ? "Vence hoy" : `En ${-days} día${days !== -1 ? "s" : ""}`}
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[12px] text-content-subtle mt-0.5">
                                                {sale.due_date
                                                    ? "Fecha pactada para esta factura"
                                                    : sale.customer_credit_is_default
                                                        ? (sale.customer_credit_days
                                                            ? `Plazo general de la empresa: ${sale.customer_credit_days} días`
                                                            : "De contado: la empresa no tiene plazo general de crédito")
                                                        : (sale.customer_credit_days
                                                            ? `Plazo de este cliente: ${sale.customer_credit_days} días`
                                                            : "De contado: este cliente no tiene crédito")}
                                            </p>
                                        </div>
                                        {canSetDue && (
                                            <div className="flex items-center gap-2 shrink-0">
                                                {savingDue && <Spinner />}
                                                <DatePicker value={due} onChange={v => v && v !== due && saveDueDate(v)} clearable={false} className="shrink-0" />
                                                {sale.due_date && (
                                                    <button
                                                        onClick={() => saveDueDate(null)}
                                                        disabled={savingDue}
                                                        className="h-9 px-2.5 rounded-lg text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-3 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                                                        title="Volver al plazo de crédito del cliente"
                                                    >
                                                        Restablecer
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* ── Productos: dos renglones por línea, sin tabla ── */}
                            <div>
                                <p className="text-[13px] font-semibold text-content dark:text-white mb-2">
                                    Productos <span className="font-normal text-content-subtle">· {items.length}</span>
                                </p>
                                <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                                    {items.length === 0 ? (
                                        <p className="px-3.5 py-6 text-center text-[13px] text-content-subtle">Sin productos</p>
                                    ) : items.map((item, idx) => (
                                        <div key={idx} className="px-3.5 py-2.5">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <span className="text-[13px] font-medium text-content dark:text-white min-w-0 truncate">{item.name}</span>
                                                <Money value={fmt(item.subtotal)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                                            </div>
                                            <div className="flex items-baseline justify-between gap-3 mt-0.5 text-[12px] tabular-nums">
                                                <span className="text-content-subtle">{parseFloat(item.quantity)} × {fmt(item.price)}</span>
                                                {item.returned_qty > 0 && (
                                                    <span className="font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                                        {item.returned_qty} devuelto{item.returned_qty > 1 ? "s" : ""}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Totales */}
                                <div className="mt-3 space-y-1 text-[13px]">
                                    {discount > 0 && (
                                        <>
                                            <Fila label="Subtotal" value={fmt(parseFloat(sale.total) + discount)} />
                                            <Fila label="Descuento" value={`-${fmt(discount)}`} />
                                        </>
                                    )}
                                    <Fila label="Total" value={fmt(sale.total)} strong />
                                    <Fila label="Abonado" value={fmt(sale.amount_paid)} />
                                    {forgiven > 0 && <Fila label="Exonerado" value={fmt(forgiven)} tone="text-violet-600 dark:text-violet-400" />}
                                    {balance > 0 && <Fila label="Saldo pendiente" value={fmt(balance)} tone="text-red-600 dark:text-red-400" strong />}
                                </div>
                            </div>

                            {/* Constancia de la exoneración: sin egreso ni nota de crédito, este bloque
                                es el único rastro visible de por qué la factura se cerró sin cobrarse. */}
                            {forgiven > 0 && (
                                <div className="rounded-lg border border-border/60 dark:border-white/[0.06] border-l-[3px] border-l-violet-500 px-3.5 py-3">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-[13px] font-semibold text-content dark:text-white">Saldo exonerado</span>
                                        <Money value={fmt(forgiven)} className="text-[13px] font-semibold text-violet-600 dark:text-violet-400" />
                                    </div>
                                    {sale.forgiven_reason && (
                                        <p className="text-[13px] text-content-muted dark:text-white/70 leading-snug mt-1">{sale.forgiven_reason}</p>
                                    )}
                                    <p className="text-[12px] text-content-subtle mt-1">
                                        {toNameCase(sale.forgiven_by_name) || "—"}
                                        {sale.forgiven_at && ` · ${fmtDateShort(sale.forgiven_at)}`}
                                    </p>
                                </div>
                            )}

                            {/* ── Pagos registrados ── */}
                            {(payments.length > 0 || credit > 0) && (
                                <div>
                                    <p className="text-[13px] font-semibold text-content dark:text-white mb-2">
                                        Pagos <span className="font-normal text-content-subtle">· {payments.length + (credit > 0 ? 1 : 0)}</span>
                                    </p>
                                    <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                                        {/* Saldo a favor del cliente aplicado: no generó cobro, pero es con lo que se pagó. */}
                                        {credit > 0 && (
                                            <div className="px-3.5 py-2.5 flex items-baseline justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-[13px] font-medium text-content dark:text-white">Saldo a favor del cliente</p>
                                                    <p className="text-[12px] text-content-subtle">Aplicado al saldo de la factura</p>
                                                </div>
                                                <Money value={fmt(credit)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                                            </div>
                                        )}
                                        {payments.map((p, idx) => {
                                            const payRate    = p.exchange_rate || 1;
                                            const paySym     = p.journal_sym || baseCurrency?.symbol || "Ref.";
                                            const changeRate = p.change_journal_rate || 1;
                                            const changeSym  = p.change_journal_sym || baseCurrency?.symbol || "Ref.";
                                            const hasChange  = p.change_given > 0 && p.change_journal_name;
                                            const diffCcy    = hasChange && paySym !== changeSym;

                                            const payNative    = p.amount * payRate;
                                            const changeNative = hasChange ? p.change_given * changeRate : null;
                                            // cross equivalences: pago en moneda del cambio / cambio en moneda del pago
                                            const payInChangeCcy  = diffCcy ? p.amount * changeRate   : null;
                                            const changeInPayCcy  = diffCcy ? p.change_given * payRate : null;

                                            return (
                                                <div key={idx} className="px-3.5 py-2.5">
                                                    {/* Cobro */}
                                                    <div className="flex items-baseline justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-[13px] font-medium text-content dark:text-white flex items-center gap-1.5 min-w-0">
                                                                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-content-subtle/40" style={p.journal_color ? { backgroundColor: p.journal_color } : undefined} />
                                                                <span className="truncate">{toNameCase(p.journal_name) || "Pago"}</span>
                                                            </p>
                                                            <p className="text-[12px] text-content-subtle tabular-nums">
                                                                {fmtDateShort(p.created_at)}
                                                                {p.reference_number && ` · Ref. ${p.reference_number}`}
                                                            </p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <Money value={fmtCcy(payNative, paySym)} className="block text-[13px] font-semibold text-content dark:text-white" />
                                                            {diffCcy && (
                                                                <Money value={`≈ ${fmtCcy(payInChangeCcy, changeSym)}`} className="block text-[12px] text-content-subtle" />
                                                            )}
                                                        </div>
                                                    </div>
                                                    {/* Vuelto entregado */}
                                                    {hasChange && changeNative !== null && (
                                                        <div className="flex items-baseline justify-between gap-3 mt-2 pt-2 border-t border-dashed border-border/70 dark:border-white/[0.08]">
                                                            <span className="text-[12px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5 min-w-0">
                                                                {p.change_journal_color && (
                                                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: p.change_journal_color }} />
                                                                )}
                                                                <span className="truncate">Vuelto desde {toNameCase(p.change_journal_name)}</span>
                                                            </span>
                                                            <div className="text-right shrink-0">
                                                                <Money value={`-${fmtCcy(changeNative, changeSym)}`} className="block text-[12px] font-semibold text-amber-700 dark:text-amber-400" />
                                                                {diffCcy && (
                                                                    <Money value={`≈ -${fmtCcy(changeInPayCcy, paySym)}`} className="block text-[12px] text-content-subtle" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Fila de totales: rótulo gris, cifra en tinta; `tone` solo para lo que es señal.
function Fila({ label, value, tone, strong = false }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <span className={tone ? `font-medium ${tone}` : strong ? "font-semibold text-content dark:text-white" : "text-content-subtle"}>{label}</span>
            <Money value={value} className={`${strong ? "font-semibold" : "font-medium"} ${tone || "text-content dark:text-white"}`} />
        </div>
    );
}
