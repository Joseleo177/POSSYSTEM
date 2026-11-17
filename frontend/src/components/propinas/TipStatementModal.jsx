import { useCallback, useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import ConfirmModal from "../ui/ConfirmModal";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { fmtDateShort, toNameCase } from "../../helpers";

const KIND = { venta: "Saldo a favor", cobro: "Cobro", devolucion: "Devolución", exonerado: "Exonerado" };

/**
 * Estado de cuenta de propinas de una persona en el período: cada cobro que le sumó propina,
 * cada pago, lo que viene del pozo (aparte: se paga en el acto) y lo que falta por cobrar.
 *   seller – fila del reporte (con `saldo` de hoy) · null cerrado
 *   range  – { from, to }
 */
export default function TipStatementModal({ seller, range, onClose, onPay, onChanged }) {
    const { notify, can, baseCurrency } = useApp();
    const [st, setSt] = useState(null);
    const [loading, setLoading] = useState(false);
    const [anular, setAnular] = useState(null);
    const sym = baseCurrency?.symbol || "Ref.";
    const fmt = (n) => `${sym} ${Number(n || 0).toFixed(2)}`;
    const canPay = can("tips.pay");

    const cargar = useCallback(async () => {
        if (!seller) return;
        setLoading(true);
        try {
            const r = await api.tips.statement(seller.id, { date_from: range.from || "", date_to: range.to || "" });
            setSt(r.data);
        } catch (e) { notify(e.message, "err"); }
        setLoading(false);
    }, [seller, range.from, range.to, notify]);

    useEffect(() => { setSt(null); cargar(); }, [cargar]);

    const anularPago = async () => {
        try {
            await api.tips.voidPayout(anular.id);
            notify(anular.from_pool ? "Reparto anulado: el egreso quedó anulado y el dinero vuelve al pozo" : "Pago anulado: el egreso quedó anulado y la propina vuelve a deberse");
            setAnular(null);
            await cargar();
            onChanged?.();
        } catch (e) { notify(e.message, "err"); }
    };

    const saldoHoy = parseFloat(st?.balance ?? seller?.saldo ?? 0);

    return (
        <Modal open={!!seller} onClose={onClose} title="Estado de cuenta" width={720}>
            <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] px-4 py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="min-w-[40px] h-10 px-2 rounded-full bg-surface-3 dark:bg-white/[0.06] text-[13px] font-semibold tabular-nums text-content dark:text-white flex items-center justify-center shrink-0">{seller?.code}</span>
                    <div className="min-w-0">
                        <p className="text-[17px] font-semibold text-content dark:text-white truncate">{toNameCase(seller?.name)}</p>
                        <p className="text-[12px] text-content-subtle">Propinas de sus cuentas, al cobrarse</p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[12px] text-content-subtle">Por pagar hoy</p>
                    <Money value={fmt(saldoHoy)} className={`block text-[24px] font-bold tracking-tight leading-tight ${saldoHoy < -0.005 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`} />
                </div>
            </div>
            {saldoHoy < -0.005 && (
                <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">Se le pagó de más: una propina se pasó a otra persona o una devolución la bajó. Se descuenta del próximo pago.</p>
            )}

            {!st ? (
                <div className="py-16 flex justify-center">{loading && <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />}</div>
            ) : (
                <>
                    <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                        <Dato label="Al empezar" value={fmt(st.opening)} />
                        <Dato label="Ganado" value={fmt(st.earned)} />
                        <Dato label="Pagado" value={fmt(st.paid)} />
                        <Dato label="Al cerrar el período" value={fmt(st.closing)} strong />
                    </dl>

                    <Seccion titulo="Propinas" detalle={`${fmtDateShort(range.from)} al ${fmtDateShort(range.to)}`}>
                        {st.movements.length === 0 ? (
                            <Vacio titulo="Sin propinas en el período" hint="Se ganan al cobrar las cuentas que atendió." />
                        ) : st.movements.map((m, i) => (
                            <div key={`${m.sale_id}-${m.kind}-${i}`} className="px-3.5 py-2.5">
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums truncate">
                                        {m.invoice_number || `#${m.sale_id}`} <span className="font-normal text-content-subtle">· {m.table_name || toNameCase(m.customer_name) || "Sin cliente"}</span>
                                    </span>
                                    <Money value={fmt(m.tip)} className={`text-[13px] font-semibold shrink-0 ${m.tip < 0 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`} />
                                </div>
                                <div className="text-[12px] text-content-subtle tabular-nums mt-0.5 truncate">
                                    {fmtDateShort(m.day)} · {KIND[m.kind] || m.kind} · propina de la factura {fmt(m.sale_tip)}
                                </div>
                            </div>
                        ))}
                    </Seccion>

                    <Seccion titulo="Pagos" detalle={st.from_pool > 0 ? `Del pozo: ${fmt(st.from_pool)}` : null}>
                        {st.payouts.length === 0 ? (
                            <Vacio titulo="Sin pagos en el período" />
                        ) : st.payouts.map(p => (
                            <div key={p.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className={`text-[13px] font-semibold tabular-nums ${p.vivo ? "text-content dark:text-white" : "text-content-subtle line-through"}`}>
                                        {fmt(p.amount)}
                                        <span className="font-normal text-content-subtle"> · {p.from_pool ? "del pozo" : "sus propinas"}</span>
                                    </div>
                                    <div className="text-[12px] text-content-subtle truncate">
                                        {fmtDateShort(p.paid_at)} · {p.journal_name || "—"}{p.reference ? ` · Ref. ${p.reference}` : ""}{p.vivo ? "" : " · anulado"}
                                    </div>
                                </div>
                                {p.vivo && canPay && (
                                    <button onClick={() => setAnular(p)} className="text-[12px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400 shrink-0 h-9 px-2">Anular</button>
                                )}
                            </div>
                        ))}
                    </Seccion>

                    {st.pending.length > 0 && (
                        <Seccion titulo="Por cobrar" detalle={`${fmt(st.pending_total)} que ganará al cobrarse`}>
                            {st.pending.map(p => (
                                <div key={p.sale_id} className="px-3.5 py-2.5 flex items-baseline justify-between gap-3">
                                    <span className="text-[13px] text-content dark:text-white tabular-nums truncate">
                                        {p.invoice_number || `#${p.sale_id}`} <span className="text-content-subtle">· {toNameCase(p.customer_name) || "Sin cliente"} · {fmtDateShort(p.created_at)}</span>
                                    </span>
                                    <Money value={fmt(p.pend)} className="text-[13px] font-medium text-content-subtle shrink-0" />
                                </div>
                            ))}
                        </Seccion>
                    )}
                </>
            )}

            {canPay && saldoHoy > 0.005 && (
                <div className="flex flex-col-reverse sm:flex-row gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                    <button onClick={() => onPay?.({ ...seller, saldo: saldoHoy })}
                        className="btn-accent sm:flex-1 h-12 sm:h-10 rounded-lg text-[14px] font-semibold tabular-nums">
                        Pagar {fmt(saldoHoy)}
                    </button>
                </div>
            )}

            <ConfirmModal
                isOpen={!!anular}
                title={anular?.from_pool ? "Anular el reparto del pozo" : "Anular el pago"}
                message={anular ? (anular.from_pool
                    ? `Se anula el egreso del reparto del ${fmtDateShort(anular.paid_at)} completo, con todas sus personas: el dinero vuelve a la caja y al pozo.`
                    : `Se anula el egreso de ${fmt(anular.amount)} del ${fmtDateShort(anular.paid_at)}: el dinero vuelve a la caja y la propina vuelve a deberse.`) : ""}
                confirmText="Anular"
                onConfirm={anularPago}
                onCancel={() => setAnular(null)}
            />
        </Modal>
    );
}

function Dato({ label, value, strong }) {
    return (
        <div className="min-w-0">
            <dt className="text-[12px] text-content-subtle">{label}</dt>
            <dd className={`text-[15px] tabular-nums ${strong ? "font-bold" : "font-semibold"} text-content dark:text-white`}><Money value={value} /></dd>
        </div>
    );
}

function Seccion({ titulo, detalle, children }) {
    return (
        <div className="mt-5">
            <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className="text-[14px] font-semibold text-content dark:text-white">{titulo}</p>
                {detalle && <p className="text-[12px] text-content-subtle tabular-nums truncate">{detalle}</p>}
            </div>
            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] lg:max-h-72 lg:overflow-y-auto">
                {children}
            </div>
        </div>
    );
}

function Vacio({ titulo, hint }) {
    return (
        <div className="px-4 py-6 text-center">
            <p className="text-[13px] font-medium text-content dark:text-white">{titulo}</p>
            {hint && <p className="text-[12px] text-content-subtle mt-0.5">{hint}</p>}
        </div>
    );
}
