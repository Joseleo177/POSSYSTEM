import { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { fmtBase, fmtDateShort, todayISO, toNameCase } from "../../helpers";
import DatePicker from "../ui/DatePicker";
import { Spinner } from "../ui/Spinner";

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

    const items   = sale?.items   ?? [];
    const payments = sale?.Payments ?? [];

    const statusLabel = sale?.status === "pagado"   ? "Pagado"
                      : sale?.status === "exonerado"? "Exonerada"
                      : sale?.status === "parcial"  ? "Parcial"
                      : sale?.status === "pendiente"? "Pendiente"
                      : sale?.status === "borrador" ? "Sin factura"
                      : sale?.status === "anulado"  ? "Anulado"
                      : sale?.status === "devuelto" ? "Devuelto"
                      : sale?.status ?? "—";

    const statusClass = sale?.status === "pagado"   ? "bg-success/10 text-success border-success/20"
                      : sale?.status === "exonerado"? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                      : sale?.status === "parcial"  ? "bg-warning/10 text-warning border-warning/20"
                      : sale?.status === "borrador" ? "bg-surface-3 dark:bg-white/5 text-content-subtle dark:text-white/40 border-border/30 dark:border-white/10"
                      : sale?.status === "anulado"  ? "bg-surface-3 dark:bg-white/5 text-content-subtle dark:text-white/40 border-border/30 dark:border-white/10"
                      : "bg-danger/10 text-danger border-danger/20";

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* Panel */}
            <div
                className="relative w-full max-w-lg bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] overflow-hidden flex flex-col max-h-[90vh] modal-in"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 px-5 py-4 border-b border-border/10 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.03]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-[12px] font-medium text-content-subtle dark:text-white/50">
                                Detalle de venta
                            </div>
                            <div className="text-sm font-bold text-content dark:text-white">
                                {loading ? "Cargando…" : (sale?.invoice_number ? `Factura ${sale.invoice_number}` : `Orden #${saleId}`)}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!loading && sale && (
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${statusClass}`}>
                                {statusLabel}
                            </span>
                        )}
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:bg-surface-2 dark:hover:bg-white/10 transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {loading ? (
                        <div className="flex items-center justify-center py-20 gap-3 text-content-subtle dark:text-white/30">
                            <svg className="w-5 h-5 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-[12px] font-bold animate-pulse">Cargando…</span>
                        </div>
                    ) : !sale ? (
                        <div className="flex items-center justify-center py-20 text-danger text-[12px] font-bold">
                            Error al cargar la venta
                        </div>
                    ) : (
                        <>
                            {/* Meta info */}
                            <div className="px-5 pt-4 pb-3 grid grid-cols-2 gap-3 border-b border-border/10 dark:border-white/5">
                                {[
                                    { label: "Fecha",      value: new Date(sale.created_at).toLocaleDateString("es-VE", { day: "2-digit", month: "long", year: "numeric" }) },
                                    { label: "Empleado",   value: sale.employee_name || "—" },
                                    { label: "Sucursal",   value: sale.warehouse_name || "—" },
                                    { label: "Serie",      value: sale.serie_name || "—" },
                                ].map(({ label, value }) => (
                                    <div key={label} className="bg-surface-2/50 dark:bg-white/[0.03] rounded-xl p-2.5 border border-border/20 dark:border-white/5">
                                        <div className="text-[11px] font-bold text-content-subtle dark:text-white/30 uppercase tracking-wide mb-0.5">{label}</div>
                                        <div className="text-[12px] font-semibold text-content dark:text-white truncate">{value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Vencimiento: solo mientras se debe algo. El pactado para esta factura
                                o, si no hay, el de los días de crédito del cliente — la fecha con la
                                que Cuentas por Cobrar la marca como vencida. */}
                            {["pendiente", "parcial"].includes(sale.status) && sale.effective_due_date && (() => {
                                const due  = sale.effective_due_date;
                                const days = Math.round((new Date(todayISO()) - new Date(due)) / 86400000);
                                return (
                                    <div className="px-5 pt-3 pb-3 border-b border-border/10 dark:border-white/5">
                                        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.03] rounded-xl p-2.5 border border-border/20 dark:border-white/5">
                                            <div className="min-w-0">
                                                <div className="text-[11px] font-bold text-content-subtle dark:text-white/30 uppercase tracking-wide mb-0.5">Vence</div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[12px] font-bold text-content dark:text-white tabular-nums">{fmtDateShort(due)}</span>
                                                    {days > 0 && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-danger/10 text-danger border border-danger/20">
                                                            Vencida hace {days} día{days !== 1 ? "s" : ""}
                                                        </span>
                                                    )}
                                                    {days <= 0 && days >= -7 && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20">
                                                            {days === 0 ? "Vence hoy" : `En ${-days} día${days !== -1 ? "s" : ""}`}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] font-medium text-content-subtle dark:text-white/35 mt-0.5">
                                                    {sale.due_date
                                                        ? "Fecha pactada para esta factura"
                                                        : sale.customer_credit_is_default
                                                            ? (sale.customer_credit_days
                                                                ? `Plazo general de la empresa: ${sale.customer_credit_days} días`
                                                                : "De contado: la empresa no tiene plazo general de crédito")
                                                            : (sale.customer_credit_days
                                                                ? `Plazo de este cliente: ${sale.customer_credit_days} días`
                                                                : "De contado: este cliente no tiene crédito")}
                                                </div>
                                            </div>
                                            {canSetDue && (
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {savingDue && <Spinner />}
                                                    <DatePicker value={due} onChange={v => v && v !== due && saveDueDate(v)} className="w-[150px]" />
                                                    {sale.due_date && (
                                                        <button
                                                            onClick={() => saveDueDate(null)}
                                                            disabled={savingDue}
                                                            className="h-8 px-2.5 rounded-lg text-[11px] font-bold text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-3 dark:hover:bg-white/5 transition-all disabled:opacity-40"
                                                            title="Volver al plazo de crédito del cliente"
                                                        >
                                                            Restablecer
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Tabla de items */}
                            <div className="px-5 pt-4 pb-2">
                                <div className="text-[12px] font-medium text-content-subtle dark:text-white/50 mb-2">
                                    Productos ({items.length})
                                </div>
                                <div className="rounded-xl border border-border/20 dark:border-white/5 overflow-hidden">
                                    {/* Thead */}
                                    <div className="grid grid-cols-12 bg-surface-2 dark:bg-white/[0.03] px-3 py-2">
                                        <span className="col-span-5 text-[11px] font-bold uppercase tracking-wide text-content-subtle dark:text-white/30">Producto</span>
                                        <span className="col-span-2 text-[11px] font-bold uppercase tracking-wide text-content-subtle dark:text-white/30 text-center">Cant.</span>
                                        <span className="col-span-2 text-[11px] font-bold uppercase tracking-wide text-content-subtle dark:text-white/30 text-right">P. Unit</span>
                                        <span className="col-span-3 text-[11px] font-bold uppercase tracking-wide text-content-subtle dark:text-white/30 text-right">Subtotal</span>
                                    </div>

                                    {items.length === 0 ? (
                                        <div className="px-3 py-6 text-center text-[12px] text-content-subtle dark:text-white/20 font-bold">
                                            Sin productos
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-border/10 dark:divide-white/5">
                                            {items.map((item, idx) => (
                                                <div key={idx} className="grid grid-cols-12 items-center px-3 py-2.5 hover:bg-surface-2/30 dark:hover:bg-white/[0.02] transition-colors">
                                                    <div className="col-span-5 min-w-0">
                                                        <div className="text-[12px] font-semibold text-content dark:text-white truncate">{item.name}</div>
                                                        {item.returned_qty > 0 && (
                                                            <div className="text-[11px] text-danger font-bold">
                                                                -{item.returned_qty} devuelto{item.returned_qty > 1 ? "s" : ""}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="col-span-2 text-center text-[12px] font-semibold text-content dark:text-white tabular-nums">
                                                        {parseFloat(item.quantity)}
                                                    </div>
                                                    <div className="col-span-2 text-right text-[12px] font-semibold text-content-subtle dark:text-white/40 tabular-nums">
                                                        {fmt(item.price)}
                                                    </div>
                                                    <div className="col-span-3 text-right text-[12px] font-bold text-content dark:text-white tabular-nums">
                                                        {fmt(item.subtotal)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Totales */}
                            <div className="px-5 pt-2 pb-4 space-y-1.5 border-t border-border/10 dark:border-white/5 mt-2">
                                {parseFloat(sale.discount_amount || 0) > 0 && (
                                    <>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[12px] font-semibold text-content-subtle dark:text-white/40">Subtotal</span>
                                            <span className="text-[12px] font-semibold text-content-subtle dark:text-white/40 tabular-nums">
                                                {fmt(parseFloat(sale.total) + parseFloat(sale.discount_amount))}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[12px] font-semibold text-danger">Descuento</span>
                                            <span className="text-[12px] font-semibold text-danger tabular-nums">-{fmt(sale.discount_amount)}</span>
                                        </div>
                                    </>
                                )}
                                <div className="flex justify-between items-center pt-1 border-t border-border/10 dark:border-white/5">
                                    <span className="text-[12px] font-bold text-content dark:text-white">Total</span>
                                    <span className="text-lg font-bold text-brand-500 tabular-nums">{fmt(sale.total)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[12px] font-semibold text-content-subtle dark:text-white/40">Abonado</span>
                                    <span className="text-[12px] font-semibold text-success tabular-nums">{fmt(sale.amount_paid)}</span>
                                </div>
                                {parseFloat(sale.forgiven_amount || 0) > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-[12px] font-semibold text-violet-500 dark:text-violet-400">Exonerado</span>
                                        <span className="text-[12px] font-bold text-violet-500 dark:text-violet-400 tabular-nums">{fmt(sale.forgiven_amount)}</span>
                                    </div>
                                )}
                                {parseFloat(sale.balance || 0) > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-[12px] font-semibold text-danger">Saldo pendiente</span>
                                        <span className="text-[12px] font-bold text-danger tabular-nums">{fmt(sale.balance)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Constancia de la exoneración: sin egreso ni nota de crédito, este bloque
                                es el único rastro visible de por qué la factura se cerró sin cobrarse. */}
                            {parseFloat(sale.forgiven_amount || 0) > 0 && (
                                <div className="px-5 pb-4">
                                    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3.5">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[11px] font-bold uppercase tracking-widest text-violet-500 dark:text-violet-400">Saldo exonerado</span>
                                            <span className="text-[12px] font-bold text-violet-500 dark:text-violet-400 tabular-nums">{fmt(sale.forgiven_amount)}</span>
                                        </div>
                                        {sale.forgiven_reason && (
                                            <p className="text-[12px] font-semibold text-content dark:text-white/70 leading-snug">{sale.forgiven_reason}</p>
                                        )}
                                        <p className="text-[11px] font-semibold text-content-subtle dark:text-white/30 mt-1">
                                            {sale.forgiven_by_name || "—"}
                                            {sale.forgiven_at && ` · ${new Date(sale.forgiven_at).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}`}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Pagos registrados */}
                            {(payments.length > 0 || parseFloat(sale.credit_applied || 0) > 0) && (
                                <div className="px-5 pb-5 border-t border-border/10 dark:border-white/5">
                                    <div className="text-[12px] font-medium text-content-subtle dark:text-white/50 mb-2 mt-4">
                                        Pagos registrados ({payments.length + (parseFloat(sale.credit_applied || 0) > 0 ? 1 : 0)})
                                    </div>
                                    <div className="space-y-2">
                                        {/* Crédito de cliente aplicado */}
                                        {parseFloat(sale.credit_applied || 0) > 0 && (
                                            <div className="bg-brand-500/5 rounded-xl px-3 py-2.5 border border-brand-500/20">
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <div className="text-[12px] font-semibold text-brand-500 flex items-center gap-1.5">
                                                            <span className="w-2 h-2 rounded-full inline-block shrink-0 bg-brand-500" />
                                                            Crédito de cliente
                                                        </div>
                                                        <div className="text-[11px] text-content-subtle dark:text-white/30">
                                                            Aplicado al saldo de la factura
                                                        </div>
                                                    </div>
                                                    <div className="text-[13px] font-bold text-brand-500 tabular-nums">
                                                        {fmt(parseFloat(sale.credit_applied))}
                                                    </div>
                                                </div>
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

                                            const fmtCcy = (n, sym) =>
                                                `${sym}${Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                                            return (
                                                <div key={idx} className="bg-surface-2/50 dark:bg-white/[0.03] rounded-xl px-3 py-2.5 border border-border/10 dark:border-white/5 space-y-1.5">
                                                    {/* Cobro */}
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <div className="text-[12px] font-semibold text-content dark:text-white flex items-center gap-1.5">
                                                                {p.journal_color && (
                                                                    <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: p.journal_color }} />
                                                                )}
                                                                {toNameCase(p.journal_name) || "Pago"}
                                                            </div>
                                                            <div className="text-[11px] text-content-subtle dark:text-white/30">
                                                                {new Date(p.created_at).toLocaleDateString("es-VE")}
                                                                {p.reference_number && ` · Ref: ${p.reference_number}`}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[13px] font-bold text-success tabular-nums">{fmtCcy(payNative, paySym)}</div>
                                                            {diffCcy && (
                                                                <div className="text-[11px] font-semibold text-content-subtle dark:text-white/30 tabular-nums">
                                                                    ≈ {fmtCcy(payInChangeCcy, changeSym)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {/* Cambio entregado */}
                                                    {hasChange && changeNative !== null && (
                                                        <div className="flex justify-between items-start pt-1.5 border-t border-border/10 dark:border-white/5">
                                                            <div className="flex items-center gap-1.5">
                                                                {p.change_journal_color && (
                                                                    <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: p.change_journal_color }} />
                                                                )}
                                                                <span className="text-[11px] font-semibold text-warning/80 uppercase tracking-wide">
                                                                    Cambio desde {p.change_journal_name}
                                                                </span>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-[12px] font-bold text-warning tabular-nums">-{fmtCcy(changeNative, changeSym)}</div>
                                                                {diffCcy && (
                                                                    <div className="text-[11px] font-semibold text-content-subtle dark:text-white/30 tabular-nums">
                                                                        ≈ -{fmtCcy(changeInPayCcy, paySym)}
                                                                    </div>
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
