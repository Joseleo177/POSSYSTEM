import { Button } from "../ui/Button";
import ReceiptModal from "../ReceiptModal";
import PaymentFormModal from "../PaymentFormModal";
import { useState } from "react";

export default function SaleConfirmModal({ receipt, saleBalance, baseCurrency, currentCurrency, onNext, onPay }) {
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [showPayModal, setShowPayModal] = useState(false);

    const receiptRate   = parseFloat(receipt?.exchange_rate || 1);
    const receiptIsBase = !receipt?.currency || receipt.currency.is_base;
    const receiptSym    = receiptIsBase ? (baseCurrency?.symbol || "$") : (receipt?.currency?.symbol || "$");
    const fmt = (n) => `${receiptSym}${Number(n * (receiptIsBase ? 1 : receiptRate)).toFixed(2)}`;

    const currentBalance = saleBalance?.balance ?? parseFloat(receipt?.total || 0);
    const currentStatus  = saleBalance?.status  ?? "pendiente";
    const statusLabel    = currentStatus === "pagado" ? "Completado" : currentStatus === "parcial" ? "Abono Parcial" : "Pendiente";
    const badgeClass     = currentStatus === "pagado"
        ? "bg-green-500/10 text-green-500 border-green-500/20"
        : currentStatus === "parcial"
        ? "bg-brand-500/10 text-brand-500 border-brand-500/20"
        : "bg-danger/10 text-danger border-danger/20";

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-white dark:bg-surface-dark-2 rounded-xl shadow-2xl border border-border/20 dark:border-white/5 overflow-hidden">

                {/* Header */}
                <div className={`px-5 py-4 border-b border-border/20 dark:border-white/5 flex items-center gap-3 ${currentStatus === "pagado" ? "bg-success/5" : "bg-danger/5"}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${badgeClass}`}>
                        {currentStatus === "pagado"
                            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2" /></svg>
                        }
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Transacción Registrada</div>
                        <div className="text-sm font-black text-content dark:text-white">Orden #{receipt.invoice_number || receipt.id}</div>
                    </div>
                    <div className={`ml-auto text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${badgeClass}`}>
                        {statusLabel}
                    </div>
                </div>

                {/* Totales */}
                <div className="px-5 py-4 space-y-2 border-b border-border/20 dark:border-white/5">
                    {parseFloat(receipt.discount_amount) > 0 && (
                        <>
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 uppercase tracking-wide">Subtotal</span>
                                <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 tabular-nums">
                                    {fmt(parseFloat(receipt.total) + parseFloat(receipt.discount_amount || 0))}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-danger uppercase tracking-wide">Descuento</span>
                                <span className="text-[11px] font-bold text-danger tabular-nums">-{fmt(receipt.discount_amount)}</span>
                            </div>
                        </>
                    )}
                    <div className="flex justify-between items-center pt-1">
                        <span className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40">Total a Pagar</span>
                        <span className="text-xl font-black text-brand-500 tabular-nums">{fmt(receipt.total)}</span>
                    </div>
                </div>

                {/* Acciones */}
                <div className="px-5 py-4 flex flex-col gap-2">
                    {currentStatus !== "pagado" && (
                        <Button
                            onClick={() => setShowPayModal(true)}
                            className="w-full h-9 bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black shadow-none"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                            Registrar Pago Inmediato
                        </Button>
                    )}
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setShowReceiptModal(true)} className="flex-1 h-9 border border-border/30 dark:border-white/10">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Ver Ticket
                        </Button>
                        <Button onClick={onNext} className="flex-1 h-9 shadow-none">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Siguiente
                        </Button>
                    </div>
                </div>
            </div>

            <ReceiptModal open={showReceiptModal} onClose={() => setShowReceiptModal(false)} sale={receipt} />

            {showPayModal && (
                <PaymentFormModal
                    sale={{ ...receipt, balance: currentBalance, amount_paid: saleBalance?.amount_paid ?? 0 }}
                    onClose={() => setShowPayModal(false)}
                    onSuccess={(res) => { onPay(res); setShowPayModal(false); }}
                />
            )}
        </div>
    );
}
