import { Button } from "../ui/Button";
import ReceiptModal from "../ReceiptModal";
import PaymentFormModal from "../PaymentFormModal";
import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";

export default function SaleConfirmModal({ receipt, saleBalance, baseCurrency, currentCurrency, onNext, onPay }) {
    const { notify } = useApp();
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [showPayModal, setShowPayModal] = useState(false);
    const [creditLoading, setCreditLoading] = useState(false);

    // Entrega a crédito: el backend asigna el correlativo fiscal y deja la venta en
    // 'pendiente'. Sin esto la venta fiada se quedaba en borrador y no aparecía ni en el
    // reporte de ventas pendientes ni en el cierre de caja.
    const confirmCredit = async () => {
        if (!receipt?.customer_id && !receipt?.customer_name) {
            return notify("Una venta a crédito requiere un cliente identificado", "err");
        }
        setCreditLoading(true);
        try {
            const res = await api.sales.confirmCredit(receipt.id);
            notify(`Factura ${res.data.invoice_number || ""} entregada a crédito`.trim());
            // Se reutiliza onPay: es el canal que ya refresca el saldo y el estado en CobroPage.
            onPay({
                sale_status: "pendiente",
                invoice_number: res.data.invoice_number,
                amount_paid: saleBalance?.amount_paid ?? 0,
                balance: currentBalance,
            });
        } catch (e) {
            notify(e.message, "err");
        }
        setCreditLoading(false);
    };

    useEffect(() => {
        if (showReceiptModal || showPayModal) return; // los sub-modales manejan su propio Escape
        const handler = (e) => {
            if (e.key === "Escape") { e.stopPropagation(); onNext(); }
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [onNext, showReceiptModal, showPayModal]);

    const receiptRate   = parseFloat(receipt?.exchange_rate || 1);
    const receiptIsBase = !receipt?.currency || receipt.currency.is_base;
    const receiptSym    = receiptIsBase ? (baseCurrency?.symbol || "Ref.") : (receipt?.currency?.symbol || "Ref.");
    const fmt = (n) => `${receiptSym}${Number(n * (receiptIsBase ? 1 : receiptRate)).toFixed(2)}`;

    const currentBalance = saleBalance?.balance ?? parseFloat(receipt?.total || 0);
    const currentStatus  = saleBalance?.status  ?? receipt?.status ?? "pendiente";
    // Venta creada pero sin desenlace: ni cobrada ni facturada a crédito.
    const isUnresolved   = ["borrador", "espera"].includes(currentStatus);
    // La insignia describe el ESTADO de la factura, no la acción que se acaba de hacer.
    // "Abono parcial" nombraba el movimiento; lo que importa aquí es que queda saldo.
    const STATUS_LABELS = {
        pagado:    "Pagada",
        parcial:   "Saldo pendiente",
        borrador:  "Sin cobrar",
        espera:    "En espera",
        pendiente: "Por cobrar",
    };
    const statusLabel = STATUS_LABELS[currentStatus] || "Por cobrar";
    const badgeClass     = currentStatus === "pagado"
        ? "bg-green-500/10 text-green-500 border-green-500/20"
        : currentStatus === "parcial"
        ? "bg-brand-500/10 text-brand-500 border-brand-500/20"
        : currentStatus === "borrador"
        ? "bg-surface-3 text-content-muted border-border dark:bg-white/5 dark:text-white/40 dark:border-white/10"
        : "bg-danger/10 text-danger border-danger/20";

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-3 duration-200 ease-out" onKeyDown={e => e.stopPropagation()}>

                {/* Header */}
                <div className={`px-5 py-4 border-b border-border/20 dark:border-white/5 flex items-center gap-3 ${currentStatus === "pagado" ? "bg-success/5" : currentStatus === "borrador" ? "bg-surface-2/50" : "bg-danger/5"}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${badgeClass}`}>
                        {currentStatus === "pagado"
                            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2" /></svg>
                        }
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Transacción Registrada</div>
                        <div className="text-sm font-black text-content dark:text-white">{receipt.invoice_number ? `Orden ${receipt.invoice_number}` : `Borrador #${receipt.id}`}</div>
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
                        <span className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40">
                            {currentStatus === "parcial" ? "Total de la factura" : "Total a Pagar"}
                        </span>
                        <span className={`text-xl font-black tabular-nums ${currentStatus === "parcial" ? "text-content-muted" : "text-brand-500"}`}>
                            {fmt(receipt.total)}
                        </span>
                    </div>
                    {/* Con un abono parcial, mostrar solo el total contradice la insignia:
                        lo que el cajero necesita ver es cuánto falta por cobrar. */}
                    {currentStatus === "parcial" && (
                        <div className="flex justify-between items-center pt-1 border-t border-border/20 dark:border-white/5 mt-1">
                            <span className="text-[11px] font-black uppercase tracking-wide text-warning">Falta por cobrar</span>
                            <span className="text-xl font-black text-warning tabular-nums">{fmt(currentBalance)}</span>
                        </div>
                    )}
                </div>

                {/* Acciones */}
                <div className="px-5 py-4 flex flex-col gap-2">
                    {currentStatus !== "pagado" && (
                        <div className="flex gap-2">
                            <Button
                                onClick={() => setShowPayModal(true)}
                                className="flex-1 h-9 bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black shadow-none"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                                Pago Inmediato
                            </Button>
                            {/* Solo tiene sentido antes de facturar: una venta ya confirmada
                                (pendiente/parcial) no debe volver a consumir correlativo. */}
                            {["borrador", "espera"].includes(currentStatus) && (
                                <Button
                                    onClick={confirmCredit}
                                    disabled={creditLoading}
                                    className="flex-1 h-9 bg-warning/10 text-warning border border-warning/30 hover:bg-warning hover:text-black shadow-none disabled:opacity-50"
                                    title="Entregar a crédito: emite la factura y queda por cobrar"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    {creditLoading ? "..." : "A Crédito"}
                                </Button>
                            )}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setShowReceiptModal(true)} className="flex-1 h-9 border border-border/30 dark:border-white/10">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Ver Ticket
                        </Button>
                        {/* Si la venta sigue sin resolver, el botón dice a dónde va: sin esto
                            el cajero salía sin saber que quedaba un borrador sin factura. */}
                        <Button onClick={onNext} className="flex-1 h-9 shadow-none" title={isUnresolved ? "La venta queda sin cobrar, en Facturas Pendientes" : undefined}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {isUnresolved ? "Dejar Pendiente" : "Siguiente"}
                        </Button>
                    </div>

                    {isUnresolved && (
                        <p className="text-[10px] font-bold text-content-subtle dark:text-white/40 text-center leading-relaxed pt-0.5">
                            Sin cobrar ni entregar a crédito, queda como borrador
                            <span className="text-warning"> sin número de factura</span> en Facturas Pendientes.
                        </p>
                    )}
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
