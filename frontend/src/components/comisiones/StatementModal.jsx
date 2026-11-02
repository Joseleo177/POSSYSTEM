import { useCallback, useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import ConfirmModal from "../ui/ConfirmModal";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { fmtDateShort, toNameCase } from "../../helpers";
import { printCommissionStatement } from "../../helpers/printCommissionStatement";

const KIND = { venta: "Saldo a favor", cobro: "Cobro", devolucion: "Devolución", exonerado: "Exonerado" };

/**
 * Estado de cuenta de un vendedor en el período: de dónde sale cada céntimo de su comisión.
 *   seller – fila del reporte (con `saldo` de hoy) · null cerrado
 *   range  – { from, to }
 */
export default function StatementModal({ seller, range, onClose, onPay, onChanged }) {
    const { notify, can, baseCurrency, companyInfo } = useApp();
    const [st, setSt] = useState(null);
    const [loading, setLoading] = useState(false);
    const [anular, setAnular] = useState(null);
    const sym = baseCurrency?.symbol || "Ref.";
    const fmt = (n) => `${sym} ${Number(n || 0).toFixed(2)}`;
    const canPay = can("commissions.pay");

    const cargar = useCallback(async () => {
        if (!seller) return;
        setLoading(true);
        try {
            const r = await api.commissions.statement(seller.id, { date_from: range.from || "", date_to: range.to || "" });
            setSt(r.data);
        } catch (e) { notify(e.message, "err"); }
        setLoading(false);
    }, [seller, range.from, range.to, notify]);

    useEffect(() => { setSt(null); cargar(); }, [cargar]);

    const anularPago = async () => {
        try {
            await api.commissions.voidPayout(anular.id);
            notify("Liquidación anulada: el egreso quedó anulado y la comisión vuelve a deberse");
            setAnular(null);
            await cargar();
            onChanged?.();
        } catch (e) { notify(e.message, "err"); }
    };

    const saldoHoy = parseFloat(seller?.saldo || 0);

    return (
        <Modal open={!!seller} onClose={onClose} title="Estado de cuenta" width={720}>
            {/* Cabecera: quién y cuánto se le debe hoy */}
            <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] px-4 py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="min-w-[40px] h-10 px-2 rounded-full bg-surface-3 dark:bg-white/[0.06] text-[13px] font-semibold tabular-nums text-content dark:text-white flex items-center justify-center shrink-0">{seller?.code}</span>
                    <div className="min-w-0">
                        <p className="text-[17px] font-semibold text-content dark:text-white truncate">{toNameCase(seller?.name)}</p>
                        <p className="text-[12px] text-content-subtle">{seller?.commission_pct}% sobre lo cobrado</p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[12px] text-content-subtle">Por liquidar hoy</p>
                    <Money value={fmt(saldoHoy)} className={`block text-[24px] font-bold tracking-tight leading-tight ${saldoHoy < -0.005 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`} />
                </div>
            </div>
            {saldoHoy < -0.005 && (
                <p className="mt-2 text-[12px] text-red-600 dark:text-red-400">Se le pagó de más: una devolución posterior bajó su comisión. Se descuenta de la próxima.</p>
            )}

            {!st ? (
                <div className="py-16 flex justify-center">{loading && <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />}</div>
            ) : (
                <>
                    <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                        <Dato label="Al empezar" value={fmt(st.opening)} />
                        <Dato label="Ganado" value={fmt(st.earned)} sub={st.returned ? `${fmt(st.returned)} por devoluciones` : null} />
                        <Dato label="Liquidado" value={fmt(st.paid)} />
                        <Dato label="Al cerrar el período" value={fmt(st.closing)} strong />
                    </dl>

                    <Seccion titulo="Movimientos" detalle={`${fmtDateShort(range.from)} al ${fmtDateShort(range.to)}`}>
                        {st.movements.length === 0 ? (
                            <Vacio titulo="Sin comisiones en el período" hint="Se gana al cobrar las ventas en que figura como vendedor." />
                        ) : st.movements.map((m, i) => (
                            <div key={`${m.sale_id}-${m.kind}-${i}`} className="px-3.5 py-2.5">
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums truncate">
                                        {m.invoice_number || `#${m.sale_id}`} <span className="font-normal text-content-subtle">· {toNameCase(m.customer_name) || "Sin cliente"}</span>
                                    </span>
                                    <Money value={fmt(m.commission)} className={`text-[13px] font-semibold shrink-0 ${m.commission < 0 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`} />
                                </div>
                                <div className="text-[12px] text-content-subtle tabular-nums mt-0.5 truncate">
                                    {fmtDateShort(m.day)} · {KIND[m.kind] || m.kind} · {fmt(m.base)} × {m.pct}%
                                </div>
                            </div>
                        ))}
                    </Seccion>

                    <Seccion titulo="Liquidaciones">
                        {st.payouts.length === 0 ? (
                            <Vacio titulo="Sin pagos en el período" />
                        ) : st.payouts.map(p => (
                            <div key={p.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className={`text-[13px] font-semibold tabular-nums ${p.vivo ? "text-content dark:text-white" : "text-content-subtle line-through"}`}>
                                        {fmt(p.amount)}
                                        {p.rate !== 1 && p.vivo && <span className="font-normal text-content-subtle"> · {p.currency_symbol} {Number(p.expense_amount * p.rate).toFixed(2)}</span>}
                                    </div>
                                    <div className="text-[12px] text-content-subtle truncate">
                                        {fmtDateShort(p.paid_at)} · {p.journal_name || "—"}{p.reference ? ` · Ref. ${p.reference}` : ""}{p.vivo ? "" : " · anulada"}
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

            <div className="flex flex-col-reverse sm:flex-row gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                <button onClick={() => st && printCommissionStatement(st, range, companyInfo, sym)} disabled={!st}
                    className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium disabled:opacity-40 inline-flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Imprimir estado de cuenta
                </button>
                {canPay && saldoHoy > 0.005 && (
                    <button onClick={() => onPay?.(seller)}
                        className="btn-accent sm:flex-1 h-12 sm:h-10 rounded-lg text-[14px] font-semibold tabular-nums">
                        Liquidar {fmt(saldoHoy)}
                    </button>
                )}
            </div>

            <ConfirmModal
                isOpen={!!anular}
                title="Anular la liquidación"
                message={anular ? `Se anula el egreso de ${fmt(anular.amount)} del ${fmtDateShort(anular.paid_at)}: el dinero vuelve a la caja en el arqueo y la comisión vuelve a deberse.` : ""}
                confirmText="Anular"
                onConfirm={anularPago}
                onCancel={() => setAnular(null)}
            />
        </Modal>
    );
}

function Dato({ label, value, sub, strong }) {
    return (
        <div className="min-w-0">
            <dt className="text-[12px] text-content-subtle">{label}</dt>
            <dd className={`text-[15px] tabular-nums ${strong ? "font-bold" : "font-semibold"} text-content dark:text-white`}><Money value={value} /></dd>
            {sub && <dd className="text-[11px] text-red-600 dark:text-red-400 tabular-nums truncate">{sub}</dd>}
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
