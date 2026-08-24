import { Button } from "../ui/Button";
import ReceiptModal, { printReceipt } from "../ReceiptModal";
import PaymentFormModal from "../PaymentFormModal";
import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { saleTotalAtRate } from "../../helpers";
import { useApp } from "../../context/AppContext";

// Número de atajo dentro del botón. Se dibuja como tecla para que se lea como "pulsa el 1"
// y no como parte del texto de la acción.
function KeyHint({ n }) {
    return (
        <span className="mr-1.5 min-w-[14px] h-[14px] px-1 rounded border border-current/30 text-[9px] font-black leading-[13px] text-center opacity-60 shrink-0">
            {n}
        </span>
    );
}

export default function SaleConfirmModal({ receipt, saleBalance, baseCurrency, currentCurrency, onNext, onPay }) {
    const { notify, activeCurrencies, activeJournals, companyInfo, printerWidth } = useApp();
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [showPayModal, setShowPayModal] = useState(false);
    const [creditLoading, setCreditLoading] = useState(false);
    const [printing, setPrinting] = useState(false);

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
                amount_paid: paidBase,
                balance: currentBalance,
            });
        } catch (e) {
            notify(e.message, "err");
        }
        setCreditLoading(false);
    };

    const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

    const receiptRate   = parseFloat(receipt?.exchange_rate || 1);
    const receiptIsBase = !receipt?.currency || receipt.currency.is_base;
    const receiptSym    = receiptIsBase ? (baseCurrency?.symbol || "Ref.") : (receipt?.currency?.symbol || "Ref.");
    const mainRate      = receiptIsBase ? 1 : receiptRate;

    // Equivalente en la otra moneda. El cajero cobra en bolívares pero la factura se lleva en
    // la moneda base (o al revés), y tener que hacer la cuenta aparte con el cliente delante
    // es donde se cuelan los errores. Los montos llegan siempre en base, así que convertir es
    // multiplicar por la tasa cuando el recibo ya está en base, o no hacer nada cuando no.
    const altCurrency = receiptIsBase
        ? activeCurrencies?.find(c => !c.is_base)
        : baseCurrency;
    const altRate = receiptIsBase ? parseFloat(altCurrency?.exchange_rate || 0) : 1;
    // Sin segunda moneda configurada no hay nada que mostrar, y con tasa 1 la línea sería una
    // repetición del monto de arriba.
    const showAlt = !!altCurrency && altRate > 0 && !(receiptIsBase && altRate === 1);

    // Montos sueltos (descuento): son conversiones directas del monto en base.
    const fmt = (n) => `${receiptSym}${round2(Number(n || 0) * mainRate).toFixed(2)}`;

    // El TOTAL no se convierte así: sigue la regla del carrito (round2 del precio de cada
    // línea ya convertido × cantidad). Multiplicarlo desde la moneda base mostraba aquí un
    // total distinto al que pedía después "Registrar pago" sobre la misma factura.
    const totalMain = saleTotalAtRate(receipt, mainRate);
    const totalAlt  = saleTotalAtRate(receipt, altRate);
    const fmtTotal    = (t, sym) => `${sym}${t.toFixed(2)}`;
    // El subtotal se reconstruye desde el total: se le devuelve el descuento y se le quita el
    // recargo, cada uno convertido con el mismo redondeo que usó saleTotalAtRate.
    const fmtSubtotal = (t, rate, sym) => `${sym}${round2(
        t
        + round2(parseFloat(receipt?.discount_amount || 0) * rate)
        - round2(parseFloat(receipt?.service_charge || 0) * rate)
    ).toFixed(2)}`;
    const saleCharge = parseFloat(receipt?.service_charge || 0);
    const saleChargeLabel = receipt?.service_charge_label || "Servicio";

    // Lo ya cobrado y lo devuelto se descuentan del total en la misma pista de moneda, igual
    // que en PaymentFormModal: así "Falta por cobrar" es exactamente el "Saldo pendiente"
    // que el cajero verá al abrir el cobro.
    const paidBase     = saleBalance?.amount_paid ?? parseFloat(receipt?.amount_paid || 0);
    const returnedBase = parseFloat(receipt?.total_returned || 0);
    const pendingAt = (total, rate) => Math.max(0, round2(
        total - round2(paidBase * rate) - round2(returnedBase * rate)
    ));

    // saleBalance solo existe tras cobrar en esta pantalla; al retomar una factura pendiente
    // el saldo viene en el propio recibo, y recién si no hay ninguno se asume el total.
    const currentBalance = saleBalance?.balance ?? parseFloat(receipt?.balance ?? receipt?.total ?? 0);
    const currentStatus  = saleBalance?.status  ?? receipt?.status ?? "pendiente";

    // Cobros de esta venta, con el nombre del diario resuelto: el backend devuelve cada pago
    // con su payment_journal_id pero no con el nombre. Van todos, no solo el último — una
    // venta puede cobrarse parte en divisas y parte por punto de venta, y el ticket debe
    // decir cuánto entró por cada canal.
    const receiptPayments = (saleBalance?.payments || []).map(p => ({
        journal_name: (activeJournals || []).find(j => j.id === p?.payment_journal_id)?.name || null,
        amount: parseFloat(p?.amount || 0),
        exchange_rate: parseFloat(p?.exchange_rate || 1),
        // El vuelto viaja al ticket para que el papel diga cuánto entregó el cliente y cuánto
        // se le devolvió, también en el que se imprime al instante desde la caja.
        change_given: parseFloat(p?.change_given || 0),
    }));
    // Venta creada pero sin desenlace: ni cobrada ni facturada a crédito.
    const isUnresolved   = ["borrador", "espera"].includes(currentStatus);

    // Qué botones se ven depende del estado de la venta: una ya pagada no ofrece cobrar ni
    // fiar, y el crédito solo aplica antes de facturar. La numeración se calcula sobre los
    // visibles para que el 1 sea siempre el primer botón en pantalla y no salte.
    //
    // Va después de currentStatus a propósito: al declararlo antes, el render reventaba con
    // "Cannot access before initialization" — const no se iza como var.
    // Una exonerada tampoco se cobra: su saldo ya se dio por perdido.
    const canSettle     = !["pagado", "exonerado"].includes(currentStatus);
    const canGiveCredit = canSettle && isUnresolved;
    const actionKeys = [
        canSettle && "pay",
        canGiveCredit && "credit",
        "print",
        "ticket",
        "next",
    ].filter(Boolean);
    const numOf = (key) => actionKeys.indexOf(key) + 1;

    // Impresión directa, sin abrir la vista previa: en caja con cola, el cajero no necesita
    // ver el ticket, necesita el papel.
    //
    // Se completa la venta con getOne cuando le faltan ítems o cobros —createSale no los
    // devuelve juntos— porque si no el papel sale sin productos y sin forma de pago. Es la
    // misma preparación que hace ReceiptModal antes de imprimir, para que el comprobante sea
    // idéntico salga por donde salga.
    const printDirect = async () => {
        if (printing) return;
        setPrinting(true);
        try {
            const yaCompleto = receiptPayments.length > 0
                && Array.isArray(receipt?.items) && receipt.items.length > 0;

            let full = receipt;
            if (!yaCompleto && receipt?.id) {
                try {
                    full = (await api.sales.getOne(receipt.id)).data;
                } catch { /* si la consulta falla se imprime con lo que haya: mejor un ticket parcial que ninguno */ }
            }

            // Los cobros de esta pantalla mandan cuando existen (son los más frescos); si no,
            // valen los que trajo la consulta.
            const payments = receiptPayments.length
                ? receiptPayments
                : (full?.payments ?? full?.Payments ?? []);

            printReceipt(
                {
                    ...full,
                    currency:      receipt.currency,
                    exchangeRate:  receipt.exchangeRate,
                    serie:         receipt.serie,
                    status:        currentStatus,
                    amount_paid:   paidBase,
                    balance:       currentBalance,
                    payments,
                },
                companyInfo,
                activeCurrencies?.find(c => !c.is_base) || baseCurrency,
                printerWidth,
                // Cobrado todo en divisas, el papel sale en divisas (ver receiptCurrency).
                baseCurrency,
            );
        } catch {
            notify("No se pudo imprimir el ticket", "err");
        } finally {
            setPrinting(false);
        }
    };

    const runAction = (key) => {
        if (key === "pay")    return setShowPayModal(true);
        if (key === "credit") return creditLoading ? undefined : confirmCredit();
        if (key === "print")  return printDirect();
        if (key === "ticket") return setShowReceiptModal(true);
        if (key === "next")   return onNext();
    };

    useEffect(() => {
        if (showReceiptModal || showPayModal) return; // los sub-modales manejan su propio Escape
        const handler = (e) => {
            // Nunca robar teclas a un campo de texto: si alguien escribe una nota, el "2" es
            // parte de lo que teclea, no un atajo.
            const tag = e.target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;

            if (e.key === "Escape" || e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                onNext();
                return;
            }
            // Los dígitos disparan la acción de esa posición. Se descartan las combinaciones
            // con modificadores para no pisar atajos del navegador.
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            const n = parseInt(e.key, 10);
            if (Number.isInteger(n) && n >= 1 && n <= actionKeys.length) {
                e.preventDefault();
                e.stopPropagation();
                runAction(actionKeys[n - 1]);
            }
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
        // `printing` va en las dependencias: sin él, el handler quedaba capturado con el valor
        // viejo y dos pulsaciones seguidas del atajo lanzaban dos impresiones.
    }, [onNext, showReceiptModal, showPayModal, actionKeys.join(","), creditLoading, printing]);
    // La insignia describe el ESTADO de la factura, no la acción que se acaba de hacer.
    // "Abono parcial" nombraba el movimiento; lo que importa aquí es que queda saldo.
    const STATUS_LABELS = {
        pagado:    "Pagada",
        exonerado: "Exonerada",
        parcial:   "Saldo pendiente",
        borrador:  "Sin cobrar",
        espera:    "En espera",
        pendiente: "Por cobrar",
    };
    const statusLabel = STATUS_LABELS[currentStatus] || "Por cobrar";
    const badgeClass     = currentStatus === "pagado"
        ? "bg-green-500/10 text-green-500 border-green-500/20"
        : currentStatus === "exonerado"
        ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
        : currentStatus === "parcial"
        ? "bg-brand-500/10 text-brand-500 border-brand-500/20"
        : currentStatus === "borrador"
        ? "bg-surface-3 text-content-muted border-border dark:bg-white/5 dark:text-white/40 dark:border-white/10"
        : "bg-danger/10 text-danger border-danger/20";

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white dark:bg-surface-dark-2 border border-border/30 dark:border-white/[0.07] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-3 duration-200 ease-out" onKeyDown={e => e.stopPropagation()}>

                {/* Header */}
                <div className={`px-5 py-4 border-b border-border/20 dark:border-white/5 flex items-center gap-3 ${currentStatus === "pagado" ? "bg-success/5" : currentStatus === "exonerado" ? "bg-violet-500/5" : currentStatus === "borrador" ? "bg-surface-2/50" : "bg-danger/5"}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${badgeClass}`}>
                        {/* Cuenta cerrada —cobrada o exonerada— lleva el visto; el reloj es para
                            la que todavía espera dinero. */}
                        {["pagado", "exonerado"].includes(currentStatus)
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
                    {(parseFloat(receipt.discount_amount) > 0 || saleCharge > 0) && (
                        <>
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 uppercase tracking-wide">Subtotal</span>
                                <span className="text-[11px] font-bold text-content-muted tabular-nums">
                                    {fmtSubtotal(totalMain, mainRate, receiptSym)}
                                </span>
                            </div>
                            {parseFloat(receipt.discount_amount) > 0 && (
                                <div className="flex justify-between items-center">
                                    <span className="text-[11px] font-bold text-danger uppercase tracking-wide">Descuento</span>
                                    <span className="text-[11px] font-bold text-danger tabular-nums">-{fmt(receipt.discount_amount)}</span>
                                </div>
                            )}
                            {saleCharge > 0 && (
                                <div className="flex justify-between items-center">
                                    <span className="text-[11px] font-bold text-content-muted uppercase tracking-wide truncate pr-2">{saleChargeLabel}</span>
                                    <span className="text-[11px] font-bold text-content-muted tabular-nums shrink-0">+{fmt(saleCharge)}</span>
                                </div>
                            )}
                        </>
                    )}
                    <div className="flex justify-between items-center pt-1">
                        <span className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40">
                            {currentStatus === "parcial" ? "Total de la factura" : "Total a Pagar"}
                        </span>
                        <div className="text-right">
                            <div className={`text-xl font-black tabular-nums leading-tight ${currentStatus === "parcial" ? "text-content-muted" : "text-brand-500"}`}>
                                {fmtTotal(totalMain, receiptSym)}
                            </div>
                            {/* Sin dark:text-white/40: ese override daba ~3.2:1 sobre el fondo
                                oscuro. text-content-muted ya cambia con el tema (7.5:1 en claro,
                                11:1 en oscuro) y es un monto que el cajero tiene que leer. */}
                            {showAlt && (
                                <div className="text-sm font-bold tabular-nums text-content-muted mt-0.5">
                                    {fmtTotal(totalAlt, altCurrency?.symbol || "")}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Con un abono parcial, mostrar solo el total contradice la insignia:
                        lo que el cajero necesita ver es cuánto falta por cobrar. */}
                    {currentStatus === "parcial" && (
                        <div className="flex justify-between items-center pt-1 border-t border-border/20 dark:border-white/5 mt-1">
                            <span className="text-[11px] font-black uppercase tracking-wide text-warning">Falta por cobrar</span>
                            <div className="text-right">
                                <div className="text-xl font-black text-warning tabular-nums leading-tight">
                                    {fmtTotal(pendingAt(totalMain, mainRate), receiptSym)}
                                </div>
                                {showAlt && (
                                    <div className="text-sm font-bold tabular-nums text-warning mt-0.5">
                                        {fmtTotal(pendingAt(totalAlt, altRate), altCurrency?.symbol || "")}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Acciones. Cada una lleva su número: en caja se opera con el teclado y sin
                    la etiqueta visible el atajo no existe para quien no lo memorizó. */}
                <div className="px-5 py-4 flex flex-col gap-2">
                    {canSettle && (
                        <div className="flex gap-2">
                            <Button
                                onClick={() => setShowPayModal(true)}
                                className="flex-1 h-9 bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black shadow-none"
                            >
                                <KeyHint n={numOf("pay")} />
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
                                    <KeyHint n={numOf("credit")} />
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    {creditLoading ? "..." : "A Crédito"}
                                </Button>
                            )}
                        </div>
                    )}
                    {/* Imprimir va solo y a ancho completo: es la acción que se repite en cada
                        venta, y compartir fila con "Ver Ticket" invitaba a confundirlas. */}
                    <Button
                        onClick={printDirect}
                        disabled={printing}
                        className="h-9 bg-brand-500/10 text-brand-500 border border-brand-500/30 hover:bg-brand-500 hover:text-black shadow-none disabled:opacity-50"
                        title="Imprime el ticket en la impresora térmica, sin abrir la vista previa"
                    >
                        <KeyHint n={numOf("print")} />
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        {printing ? "Imprimiendo..." : "Imprimir Ticket"}
                    </Button>

                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setShowReceiptModal(true)} className="flex-1 h-9 border border-border/30 dark:border-white/10">
                            <KeyHint n={numOf("ticket")} />
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Ver Ticket
                        </Button>
                        {/* Si la venta sigue sin resolver, el botón dice a dónde va: sin esto
                            el cajero salía sin saber que quedaba un borrador sin factura. */}
                        <Button onClick={onNext} className="flex-1 h-9 shadow-none" title={isUnresolved ? "La venta queda sin cobrar, en Facturas Pendientes" : undefined}>
                            <KeyHint n={numOf("next")} />
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

                    {/* Los atajos se anuncian: el cajero no tiene por qué adivinar que Enter
                        y Esc hacen lo mismo que el botón resaltado. */}
                    <div className="flex items-center justify-center gap-3 pt-1 text-[9px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">
                        <span>1 – {actionKeys.length} elegir</span>
                        <span className="opacity-40">·</span>
                        <span>Enter / Esc {isUnresolved ? "dejar pendiente" : "siguiente"}</span>
                    </div>
                </div>
            </div>

            {/* El recibo se arma con el estado REAL, no con el de `receipt`: createSale deja la
                venta en 'borrador' y el cobro la pasa a 'pagado' después, así que el objeto
                original se queda desactualizado. Esta pantalla ya calculaba el estado bueno
                para su propio distintivo (currentStatus); el ticket usaba el viejo y salía
                impreso como "Crédito · PENDIENTE DE PAGO" una venta recién cobrada. */}
            <ReceiptModal
                open={showReceiptModal}
                onClose={() => setShowReceiptModal(false)}
                sale={{
                    ...receipt,
                    status: currentStatus,
                    amount_paid: paidBase,
                    balance: currentBalance,
                    payments: receiptPayments,
                }}
            />

            {showPayModal && (
                <PaymentFormModal
                    sale={{ ...receipt, balance: currentBalance, amount_paid: paidBase }}
                    onClose={() => setShowPayModal(false)}
                    onSuccess={(res) => { onPay(res); setShowPayModal(false); }}
                />
            )}
        </div>
    );
}
