import { useState, useEffect } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import { Spinner } from "../ui/Spinner";
import JournalPickerButton from "./JournalPickerButton";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { journalsForWarehouse, calcularAvance } from "../../helpers";

const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white tabular-nums focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const LABEL = "mb-1.5 text-[12px] font-medium text-content-subtle";

// Datos de una caja: su moneda y la tasa del sistema, para pasar lo entregado a lo que entra.
export function monedaDeCaja(journal, activeCurrencies, baseCurrency) {
    const cur = journal?.currency_id ? activeCurrencies.find(c => c.id === parseInt(journal.currency_id)) : baseCurrency;
    return {
        id: cur?.id ?? null,
        symbol: cur?.symbol || baseCurrency?.symbol || "Ref.",
        rate: (!cur || cur.is_base) ? 1 : (parseFloat(cur.exchange_rate) || 1),
    };
}

/**
 * Avance de efectivo sin venta: el cliente pide billetes y los paga por el punto (o pago móvil)
 * con la comisión encima. Entrega Bs.1000, se le pasan Bs.1100. Con venta va dentro del cobro
 * (PaymentFormModal). El servidor asienta el egreso de la caja y los dos ingresos
 * (services/cashAdvances), y el arqueo los cuadra solo.
 */
export default function CashAdvanceModal({ open, onClose, warehouseId, customer = null, onDone }) {
    const { notify, settings, activeJournals: todas, activeCurrencies, baseCurrency } = useApp();
    const cajas = journalsForWarehouse(todas, warehouseId);
    const cajasEfectivo = cajas.filter(j => j.type === "efectivo");
    const cuentasCobro = cajas.filter(j => j.type !== "efectivo");

    const vacio = () => ({
        monto: "",
        pct: settings?.cash_advance_pct || "",
        // De entrada la caja de efectivo en bolívares: es la de los avances corrientes.
        cash_journal_id: (cajasEfectivo.find(j => monedaDeCaja(j, activeCurrencies, baseCurrency).rate > 1) || cajasEfectivo[0])?.id || "",
        in_journal_id: "",
        in_method: null,
        reference: "",
    });
    const [form, setForm] = useState(vacio);
    const [enviando, setEnviando] = useState(false);
    useEffect(() => { if (open) setForm(vacio()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const caja = cajasEfectivo.find(j => j.id === form.cash_journal_id) || null;
    const cuenta = cuentasCobro.find(j => j.id === form.in_journal_id) || null;
    const mCaja = monedaDeCaja(caja, activeCurrencies, baseCurrency);
    const mCuenta = monedaDeCaja(cuenta || caja, activeCurrencies, baseCurrency);
    const efectivo = parseFloat(String(form.monto).replace(",", ".")) || 0;
    const pct = parseFloat(String(form.pct).replace(",", ".")) || 0;
    const { comision, total } = calcularAvance({
        efectivo, pct, rateCaja: mCaja.rate, rateCuenta: mCuenta.rate, mismaMoneda: String(mCaja.id) === String(mCuenta.id),
    });
    const listo = efectivo > 0 && caja && cuenta && pct >= 0 && pct <= 100 && !enviando;

    const confirmar = async () => {
        if (!listo) return;
        setEnviando(true);
        try {
            await api.cashAdvances.create({
                cash_amount: efectivo, fee_pct: pct,
                cash_journal_id: caja.id, in_journal_id: cuenta.id, in_method: form.in_method,
                reference: form.reference || null, customer_id: customer?.id || null,
                warehouse_id: warehouseId,
            });
            notify(`Avance registrado: entrega ${mCaja.symbol} ${efectivo.toFixed(2)} en efectivo`);
            onDone?.();
            onClose();
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Avance de efectivo" width={520}
            footer={(
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                    <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 sm:flex-1 rounded-lg text-[13px] font-semibold">Cancelar</button>
                    <button type="button" onClick={confirmar} disabled={!listo}
                        className="btn-accent h-12 sm:h-10 sm:flex-[2] rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                        {enviando && <Spinner />}
                        {total > 0 ? <>Cobrar <Money value={`${mCuenta.symbol} ${total.toFixed(2)}`} /> y entregar <Money value={`${mCaja.symbol} ${efectivo.toFixed(2)}`} /></> : "Registrar avance"}
                    </button>
                </div>
            )}>
            <div className="space-y-4">
                <p className="text-[13px] text-content-subtle leading-snug">
                    El cliente se lleva efectivo de la caja y lo paga por el punto o pago móvil, con la comisión encima.
                    {customer?.name ? <> A nombre de <span className="font-semibold text-content dark:text-white">{customer.name}</span>.</> : null}
                </p>

                <div className="grid grid-cols-[1fr_120px] gap-3">
                    <div>
                        <p className={LABEL}>Efectivo a entregar</p>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{mCaja.symbol}</span>
                            <input type="text" inputMode="decimal" autoComplete="off" autoFocus data-autofocus
                                value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value.replace(",", ".") }))}
                                placeholder="0.00" aria-label="Efectivo a entregar" className={`${INPUT} pl-11 text-right`} />
                        </div>
                    </div>
                    <div>
                        <p className={LABEL}>Comisión</p>
                        <div className="relative">
                            <input type="text" inputMode="decimal" autoComplete="off"
                                value={form.pct} onChange={e => setForm(p => ({ ...p, pct: e.target.value.replace(",", ".") }))}
                                placeholder="0" aria-label="Comisión en porcentaje" className={`${INPUT} pr-8 text-right`} />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">%</span>
                        </div>
                    </div>
                </div>

                <div>
                    <p className={LABEL}>Sale de la caja</p>
                    <JournalPickerButton value={form.cash_journal_id} journals={cajasEfectivo} outflowOnly
                        onSelect={(j) => setForm(p => ({ ...p, cash_journal_id: j.id }))}
                        placeholder="Caja de efectivo…" methodPrompt={{ tag: "Avance", title: "¿De qué caja sale el efectivo?" }} />
                </div>

                <div>
                    <p className={LABEL}>El cliente paga por</p>
                    <JournalPickerButton value={form.in_journal_id} journals={cuentasCobro}
                        onSelect={(j) => setForm(p => ({ ...p, in_journal_id: j.id, in_method: j.payment_method || null }))}
                        placeholder="Punto, pago móvil…" methodPrompt={{ tag: "Avance", title: "¿Cómo paga el cliente?" }} />
                </div>

                <div>
                    <p className="mb-1.5 flex items-baseline justify-between text-[12px] font-medium text-content-subtle">
                        <span>N° de referencia</span><span>Opcional</span>
                    </p>
                    <input type="text" autoComplete="off" maxLength={50} value={form.reference}
                        onChange={e => setForm(p => ({ ...p, reference: e.target.value }))}
                        placeholder="Ej: 000123456" className={INPUT} />
                </div>

                {efectivo > 0 && (
                    <dl className="rounded-xl bg-surface-2 dark:bg-white/[0.04] px-4 py-3 space-y-1.5 text-[13px]">
                        <div className="flex justify-between gap-3 text-content-subtle">
                            <dt>Entregas en efectivo</dt><dd><Money value={`${mCaja.symbol} ${efectivo.toFixed(2)}`} /></dd>
                        </div>
                        <div className="flex justify-between gap-3 text-content-subtle">
                            <dt>Comisión ({pct.toLocaleString("es-VE", { maximumFractionDigits: 3 })} %)</dt><dd>+<Money value={`${mCuenta.symbol} ${comision.toFixed(2)}`} /></dd>
                        </div>
                        <div className="flex justify-between items-baseline gap-3 pt-2 mt-1 border-t border-border/60 dark:border-white/[0.06]">
                            <dt className="font-semibold text-content dark:text-white">Cobrar por {cuenta ? cuenta.name : "el punto"}</dt>
                            <dd><Money value={`${mCuenta.symbol} ${total.toFixed(2)}`} className="text-[18px] font-bold text-content dark:text-white" /></dd>
                        </div>
                    </dl>
                )}
            </div>
        </Modal>
    );
}
