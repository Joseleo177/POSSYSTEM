import { Button } from "../ui/Button";
import ReceiptModal, { printReceipt } from "../ReceiptModal";
import PaymentFormModal from "../PaymentFormModal";
import ImmediatePayPicker from "./ImmediatePayPicker";
import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { saleTotalAtRate } from "../../helpers";
import { useApp } from "../../context/AppContext";
import StatusMark from "../ui/StatusMark";
import Money from "../ui/Money";
import Kbd from "../ui/Kbd";

// Número de atajo dentro del botón. Se dibuja como tecla para que se lea como "pulsa el 1"
// y no como parte del texto de la acción.
function KeyHint({ n }) {
    return (
        <span className="hidden sm:inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-[4px] ring-1 ring-inset ring-current text-[11px] font-semibold tabular-nums opacity-45 shrink-0">
            {n}
        </span>
    );
}

export default function SaleConfirmModal({ receipt, saleBalance, baseCurrency, currentCurrency, onNext, onPay }) {
    const { notify, activeCurrencies, activeJournals, companyInfo, printerWidth } = useApp();
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [showPayModal, setShowPayModal] = useState(false);
    // Cobro inmediato en dos toques: primero la botonera de método/diario (showPicker), y
    // recién con el diario elegido se abre "Registrar pago" con ese diario fijado y sin el
    // desplegable de método.
    const [showPicker, setShowPicker] = useState(false);
    const [lockedJournalId, setLockedJournalId] = useState(null);
    const [creditLoading, setCreditLoading] = useState(false);
    const [printing, setPrinting] = useState(false);

    // Entrega a crédito: el backend asigna el correlativo fiscal y deja la venta en
    // 'pendiente'. Sin esto la venta fiada se quedaba en borrador y no aparecía ni en el
    // reporte de ventas pendientes ni en el cierre de caja.
    // Devuelve si la venta quedó facturada, para que quien la use pueda decidir si cierra.
    const confirmCredit = async () => {
        if (!receipt?.customer_id && !receipt?.customer_name) {
            notify("Una venta a crédito requiere un cliente identificado", "err");
            return false;
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
            return true;
        } catch (e) {
            notify(e.message, "err");
            return false;
        } finally {
            setCreditLoading(false);
        }
    };

    // Salida del modal cuando la venta sigue sin resolver: se factura a crédito y recién
    // entonces se cierra. Si el crédito falla —falta el cliente, se cayó la red— el modal se
    // queda abierto: es preferible que el cajero lo resuelva ahora, con el cliente delante,
    // a que la venta se pierda en Pendientes sin número y sin a quién cobrarle.
    const salirComoCredito = async () => {
        const ok = await confirmCredit();
        if (ok) onNext();
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
    // Saldo a favor del cliente aplicado a esta venta: no genera cobro, pero es con lo que se
    // pagó. Sin él, una factura cubierta con crédito salía "PAGADO" y sin forma de pago.
    const currentCredit  = parseFloat(saleBalance?.credit_applied ?? receipt?.credit_applied ?? 0);

    // Cobros de esta venta. Van todos, no solo el último — una venta puede cobrarse parte en
    // divisas y parte por punto de venta, y el ticket debe decir cuánto entró por cada canal.
    //
    // El nombre de la caja lo trae el propio cobro; la lista de diarios es solo el respaldo
    // para una respuesta vieja. Al revés fallaba: esa lista se carga al iniciar sesión, y un
    // diario que no estuviera en ella dejaba el pago sin nombre, que es como el ticket
    // terminaba diciendo PAGADO con la forma de pago en blanco.
    const receiptPayments = (saleBalance?.payments || []).map(p => ({
        journal_name: p?.journal_name
            || (activeJournals || []).find(j => j.id === p?.payment_journal_id)?.name
            || null,
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
            // Un cobro sin nombre de caja NO cuenta como completo: es justo el dato que falta
            // para que el papel diga la forma de pago, y consultarlo cuesta menos que sacar
            // un ticket que dice PAGADO sin decir con qué.
            const pagosSinCaja = receiptPayments.some(p => !p.journal_name);
            const yaCompleto = receiptPayments.length > 0 && !pagosSinCaja
                && Array.isArray(receipt?.items) && receipt.items.length > 0;

            let full = receipt;
            if (!yaCompleto && receipt?.id) {
                try {
                    full = (await api.sales.getOne(receipt.id)).data;
                } catch { /* si la consulta falla se imprime con lo que haya: mejor un ticket parcial que ninguno */ }
            }

            // Los cobros de esta pantalla mandan cuando están completos (son los más frescos);
            // si les falta la caja, valen los de la consulta, que la traen resuelta desde la
            // base. Y si la consulta no devolvió ninguno, se vuelve a los de pantalla antes
            // que imprimir sin forma de pago.
            const delServidor = full?.Payments ?? full?.payments ?? [];
            const payments = (receiptPayments.length && !pagosSinCaja)
                ? receiptPayments
                : (delServidor.length ? delServidor : receiptPayments);

            printReceipt(
                {
                    ...full,
                    currency:      receipt.currency,
                    exchangeRate:  receipt.exchangeRate,
                    serie:         receipt.serie,
                    status:        currentStatus,
                    amount_paid:   paidBase,
                    balance:       currentBalance,
                    credit_applied: Math.max(currentCredit, parseFloat(full?.credit_applied || 0)),
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
        if (key === "pay")    return setShowPicker(true);
        if (key === "credit") return creditLoading ? undefined : confirmCredit();
        if (key === "print")  return printDirect();
        if (key === "ticket") return setShowReceiptModal(true);
        if (key === "next")   return isUnresolved ? salirComoCredito() : onNext();
    };

    useEffect(() => {
        if (showReceiptModal || showPayModal || showPicker) return; // los sub-modales manejan su propio Escape
        const handler = (e) => {
            // Nunca robar teclas a un campo de texto: si alguien escribe una nota, el "2" es
            // parte de lo que teclea, no un atajo.
            const tag = e.target?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;

            if (e.key === "Escape" || e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                // Mismo destino que el botón: sin resolver, se sale facturando a crédito.
                if (isUnresolved) salirComoCredito(); else onNext();
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
    }, [onNext, showReceiptModal, showPayModal, showPicker, actionKeys.join(","), creditLoading, printing, isUnresolved]);
    // Mismo lenguaje que las tablas (ui/StatusMark): saldada va en gris con su check; lo que
    // aún espera dinero lleva punto de color. Antes toda la cabecera se teñía de rojo, y una
    // venta a crédito —algo normal— se leía como un error.
    const STATUS_MAP = {
        pagado:    { label: "Pagada",          tone: "success", quiet: "check" },
        exonerado: { label: "Exonerada",       tone: "violet" },
        parcial:   { label: "Saldo pendiente", tone: "warning" },
        borrador:  { label: "Sin cobrar",      tone: "neutral" },
        espera:    { label: "En espera",       tone: "info" },
        pendiente: { label: "Por cobrar",      tone: "danger" },
    };
    const saldada = ["pagado", "exonerado"].includes(currentStatus);
    // Un solo botón de tinta: la acción que sigue. Si falta dinero, cobrar; si no, pasar a la
    // siguiente venta. Antes Imprimir y Siguiente iban los dos en negro y competían.
    const principal = canSettle ? "pay" : "next";

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-[2px] overlay-in">
            <div className="w-full max-w-[400px] bg-white dark:bg-surface-dark-2 border border-black/[0.06] dark:border-white/[0.08] rounded-xl shadow-[0_24px_64px_-12px_rgb(0_0_0/0.25)] overflow-hidden modal-in flex flex-col max-h-[90vh]" onKeyDown={e => e.stopPropagation()}>

                {/* Todo el contenido scrollea junto: en un teléfono bajo, con venta parcial o
                    con descuento, el modal crecía más que la pantalla y dejaba botones fuera. */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                {/* Cabecera */}
                <div className="px-6 pt-6">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${saldada
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-surface-3 text-content-muted dark:bg-white/[0.06] dark:text-white/70"}`}>
                                {/* Cuenta cerrada —cobrada o exonerada— lleva el visto; el reloj es
                                    para la que todavía espera dinero. */}
                                {saldada
                                    ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 13l4 4L19 7" /></svg>
                                    : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                }
                            </div>
                            <div className="min-w-0">
                                <div className="text-[12px] font-medium text-content-subtle">Venta registrada</div>
                                <div className="text-[16px] font-bold tracking-[-0.01em] text-content dark:text-white tabular-nums truncate">
                                    {receipt.invoice_number ? `Orden ${receipt.invoice_number}` : `Borrador #${receipt.id}`}
                                </div>
                            </div>
                        </div>
                        <div className="pt-1 shrink-0">
                            <StatusMark status={currentStatus} map={STATUS_MAP} />
                        </div>
                    </div>

                    {/* Totales: un bloque gris con la cifra grande en tinta. El turquesa del
                        total competía con el botón principal por la atención. */}
                    <div className="mt-5 rounded-lg bg-surface-2 dark:bg-white/[0.04] px-4 py-3.5 space-y-1.5">
                        {(parseFloat(receipt.discount_amount) > 0 || saleCharge > 0) && (
                            <div className="space-y-1 pb-2 mb-1 border-b border-border/70 dark:border-white/[0.06]">
                                <div className="flex justify-between items-center text-[13px]">
                                    <span className="text-content-subtle">Subtotal</span>
                                    <Money value={fmtSubtotal(totalMain, mainRate, receiptSym)} className="font-medium text-content-muted" />
                                </div>
                                {parseFloat(receipt.discount_amount) > 0 && (
                                    <div className="flex justify-between items-center text-[13px]">
                                        <span className="text-content-subtle">Descuento</span>
                                        <Money value={`-${fmt(receipt.discount_amount)}`} className="font-medium text-content-muted" />
                                    </div>
                                )}
                                {saleCharge > 0 && (
                                    <div className="flex justify-between items-center text-[13px]">
                                        <span className="text-content-subtle truncate pr-2">{saleChargeLabel}</span>
                                        <Money value={`+${fmt(saleCharge)}`} className="font-medium text-content-muted shrink-0" />
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex items-end justify-between gap-3">
                            <span className="text-[13px] font-medium text-content-muted pb-0.5">
                                {currentStatus === "parcial" ? "Total de la factura" : "Total a pagar"}
                            </span>
                            <div className="text-right">
                                <Money
                                    value={fmtTotal(totalMain, receiptSym)}
                                    className={`block text-[26px] font-bold tracking-[-0.02em] leading-none ${currentStatus === "parcial" ? "text-content-muted" : "text-content dark:text-white"}`}
                                />
                                {showAlt && (
                                    <Money value={fmtTotal(totalAlt, altCurrency?.symbol || "")} className="block mt-1.5 text-[13px] font-medium text-content-subtle" />
                                )}
                            </div>
                        </div>
                        {/* Con un abono parcial, mostrar solo el total contradice el estado: lo
                            que el cajero necesita ver es cuánto falta por cobrar. */}
                        {currentStatus === "parcial" && (
                            <div className="flex items-end justify-between gap-3 pt-2 mt-1 border-t border-border/70 dark:border-white/[0.06]">
                                <span className="text-[13px] font-semibold text-amber-700 dark:text-amber-400 pb-0.5">Falta por cobrar</span>
                                <div className="text-right">
                                    <Money value={fmtTotal(pendingAt(totalMain, mainRate), receiptSym)} className="block text-[22px] font-bold leading-none text-amber-700 dark:text-amber-400" />
                                    {showAlt && (
                                        <Money value={fmtTotal(pendingAt(totalAlt, altRate), altCurrency?.symbol || "")} className="block mt-1.5 text-[13px] font-medium text-amber-700/80 dark:text-amber-400/80" />
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Acciones. Cada una lleva su número: en caja se opera con el teclado y sin
                    la etiqueta visible el atajo no existe para quien no lo memorizó. */}
                <div className="px-6 pt-5 pb-5 flex flex-col gap-2">
                    {/* En teléfono van uno debajo del otro: los botones no se encogen (llevan
                        whitespace-nowrap) y en fila estiraban el modal más allá de la pantalla. */}
                    {canSettle && (
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Button
                                variant={principal === "pay" ? "primary" : "ghost"}
                                onClick={() => setShowPicker(true)}
                                className="flex-1 min-w-0 h-12 sm:h-10"
                            >
                                <KeyHint n={numOf("pay")} />
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                                Cobrar ahora
                            </Button>
                            {/* Solo tiene sentido antes de facturar: una venta ya confirmada
                                (pendiente/parcial) no debe volver a consumir correlativo. */}
                            {["borrador", "espera"].includes(currentStatus) && (
                                <Button
                                    variant="ghost"
                                    onClick={confirmCredit}
                                    disabled={creditLoading}
                                    className="flex-1 min-w-0 h-10"
                                    title="Entregar a crédito: emite la factura y queda por cobrar"
                                >
                                    <KeyHint n={numOf("credit")} />
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    {creditLoading ? "..." : "A crédito"}
                                </Button>
                            )}
                        </div>
                    )}
                    {/* Imprimir va solo y a ancho completo: es la acción que se repite en cada
                        venta, y compartir fila con "Ver ticket" invitaba a confundirlas. */}
                    <Button
                        variant="ghost"
                        onClick={printDirect}
                        disabled={printing}
                        className="h-10"
                        title="Imprime el ticket en la impresora térmica, sin abrir la vista previa"
                    >
                        <KeyHint n={numOf("print")} />
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        {printing ? "Imprimiendo..." : "Imprimir ticket"}
                    </Button>

                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button variant="ghost" onClick={() => setShowReceiptModal(true)} className="flex-1 min-w-0 h-10">
                            <KeyHint n={numOf("ticket")} />
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            Ver ticket
                        </Button>
                        {/* Una venta ya no puede quedarse en borrador: o se cobra, o sale a
                            crédito con su factura. Salir de aquí sin resolver la dejaba sin
                            número, como un documento a medias en Pendientes. Ahora la salida
                            la factura a crédito, que es lo que de hecho ocurrió: la mercancía
                            se entregó y queda por cobrar. */}
                        <Button
                            variant={principal === "next" ? "primary" : "ghost"}
                            onClick={isUnresolved ? salirComoCredito : onNext}
                            disabled={creditLoading}
                            className="flex-1 min-w-0 h-10"
                            title={isUnresolved ? "Emite la factura y la deja por cobrar" : undefined}
                        >
                            <KeyHint n={numOf("next")} />
                            {isUnresolved ? (creditLoading ? "..." : "Dejar a crédito") : "Siguiente venta"}
                            <svg className="w-4 h-4 -mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                        </Button>
                    </div>

                    {isUnresolved && (
                        <p className="text-[12px] text-content-subtle text-center leading-relaxed pt-1">
                            Al salir se emite la factura <span className="font-semibold text-content dark:text-white">a crédito</span>, por cobrar a nombre del cliente.
                        </p>
                    )}
                </div>
                </div>
                {/* ── fin del contenido scrolleable ── */}

                {/* Los atajos se anuncian: el cajero no tiene por qué adivinar que Enter y Esc
                    hacen lo mismo que el último botón. En un teléfono táctil no hay teclado, así
                    que esta fila —y los chips numerados de los botones— no aparecen. */}
                <div className="shrink-0 hidden sm:flex px-6 py-3 border-t border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02] items-center justify-center gap-4 text-[12px] text-content-subtle">
                    <span className="inline-flex items-center gap-1.5"><Kbd>1</Kbd>–<Kbd>{actionKeys.length}</Kbd> elegir</span>
                    <span className="inline-flex items-center gap-1.5"><Kbd>Enter</Kbd><Kbd>Esc</Kbd> {isUnresolved ? "dejar a crédito" : "siguiente venta"}</span>
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
                    credit_applied: currentCredit,
                    payments: receiptPayments,
                }}
            />

            {showPicker && (
                <ImmediatePayPicker
                    warehouseId={receipt?.warehouse_id}
                    onClose={() => setShowPicker(false)}
                    onPick={(journal) => {
                        setLockedJournalId(journal?.id ?? null);
                        setShowPicker(false);
                        setShowPayModal(true);
                    }}
                />
            )}

            {showPayModal && (
                <PaymentFormModal
                    sale={{ ...receipt, balance: currentBalance, amount_paid: paidBase }}
                    lockedJournalId={lockedJournalId}
                    onClose={() => { setShowPayModal(false); setLockedJournalId(null); }}
                    onSuccess={(res) => { onPay(res); setShowPayModal(false); setLockedJournalId(null); }}
                />
            )}
        </div>
    );
}
