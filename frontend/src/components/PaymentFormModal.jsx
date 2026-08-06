import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import Modal from "./ui/Modal";
import DatePicker from "./ui/DatePicker";
import CustomSelect from "./ui/CustomSelect";

const getEmpty = () => ({
  amount: "",
  reference_date: new Date().toISOString().split("T")[0],
  reference_number: "",
  notes: "",
  payment_journal_id: "",
  pay_currency_id: "",
  // Cambio
  received_amount: "",
  change_journal_id: "",
  change_amount_override: "", // monto real a entregar (en moneda del diario de cambio)
  keep_change: false,
  credit_change: false,
});

export default function PaymentFormModal({ sale, onClose, onSuccess }) {
  const { notify, baseCurrency, activeCurrencies, activeJournals } = useApp();
  const [form, setForm] = useState(getEmpty);
  const [loading, setLoading] = useState(false);
  const [customerCredit, setCustomerCredit] = useState(0);
  const [creditToApply, setCreditToApply] = useState("");

  useEffect(() => {
    if (!sale?.customer_id) { setCustomerCredit(0); setCreditToApply(""); return; }
    api.customers.getOne(sale.customer_id)
      .then(r => setCustomerCredit(parseFloat(r.data?.credit_balance || 0)))
      .catch(() => setCustomerCredit(0));
  }, [sale?.customer_id]);

  const displayCur = activeCurrencies.find(c => !c.is_base) || baseCurrency;
  const defaultRate = (!displayCur || displayCur.is_base) ? 1 : parseFloat(displayCur.exchange_rate || 1);
  const defaultSym = displayCur?.symbol || baseCurrency?.symbol || "Ref.";

  const payCur = activeCurrencies.find(c => c.id === parseInt(form.pay_currency_id));
  const payRate = (!payCur || payCur.is_base) ? 1 : parseFloat(payCur.exchange_rate || 1);
  const paySym = payCur?.symbol || baseCurrency?.symbol || "Ref.";

  const selectedJournal = activeJournals.find(j => j.id === form.payment_journal_id);
  const isCash = selectedJournal?.type === "efectivo";

  // $ oficial de la factura: sale.total (createSale ya lo calcula como suma de round2(precio)×qty,
  // p.ej. 3×4.07 = 12.21). Es la fuente de verdad en divisas — NO total_precise, que da 12.20.
  const balanceUsd        = parseFloat(sale?.balance ?? sale?.total ?? 0);
  const creditNum         = parseFloat(String(creditToApply).replace(",", ".")) || 0;
  const creditApplied     = Math.min(Math.max(creditNum, 0), customerCredit, balanceUsd);
  const pendingAfterCredit = Math.max(0, balanceUsd - creditApplied);

  const receivedNum = parseFloat(String(form.received_amount).replace(",", "."));
  const amountNum   = parseFloat(String(form.amount).replace(",", "."));

  const historicalRate = parseFloat(sale?.exchange_rate) > 1 ? parseFloat(sale.exchange_rate) : defaultRate;

  const roundBs2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
  const round2   = n => Math.round((parseFloat(n) || 0) * 100) / 100;
  const bsRate = (displayCur && !displayCur.is_base) ? defaultRate : 0;
  const hasBsRate = bsRate > 1;
  const totalPreciseBs = (sale?.items?.length && hasBsRate)
    ? roundBs2(
        sale.items.reduce((acc, i) =>
          acc + roundBs2((parseFloat(i.price || 0) - parseFloat(i.discount || 0)) * bsRate) * parseFloat(i.quantity || 0)
        , 0) - roundBs2(parseFloat(sale?.discount_amount || 0) * bsRate)
      )
    : roundBs2(parseFloat(sale?.total || 0) * historicalRate);
  const pendingPreciseBs = Math.max(0, roundBs2(totalPreciseBs
    - roundBs2(parseFloat(sale?.amount_paid    || 0) * historicalRate)
    - roundBs2(parseFloat(sale?.total_returned || 0) * historicalRate)
    - roundBs2(creditApplied * historicalRate)));

  const isNonBasePay = payCur && !payCur.is_base;

  const receivedBase = !isNaN(receivedNum)
    ? (isNonBasePay ? receivedNum / payRate : round2(receivedNum / payRate))
    : 0;

  let amountBase = !isNaN(amountNum)
    ? (isNonBasePay ? amountNum / payRate : round2(amountNum / payRate))
    : 0;

  // Ajuste anti-residuo en moneda base (USD):
  // Si el cobro es en USD y se encuentra a ≤$0.10 del saldo oficial, se ajusta al saldo exacto.
  // En Bs (moneda secundaria), se mantiene el monto exacto abonado (amountNum / payRate) para que
  // la base de datos guarde exactamente los bolívares pagados (ej. Bs. 12364.30 y no Bs. 12396.41).
  if (!isNonBasePay && pendingAfterCredit > 0 && Math.abs(amountBase - pendingAfterCredit) < 0.10) {
    amountBase = pendingAfterCredit;
  }
  amountBase = Math.min(amountBase, pendingAfterCredit + 0.0001);

  // Proyección de cómo queda la factura si se registra este pago. Se calcula sobre la
  // misma pista que el resumen de arriba: en Bs cuando hay tasa (pendingPreciseBs), en
  // la moneda base cuando no la hay, para que los números cuadren con "Saldo pendiente".
  const payAmountInBs = isNonBasePay
    ? (isNaN(amountNum) ? 0 : amountNum)
    : roundBs2(amountBase * historicalRate);
  const paidBeforeBase = parseFloat(sale?.amount_paid || 0);
  const paidTotalBase  = paidBeforeBase + amountBase;
  const paidTotalBs    = roundBs2(roundBs2(paidBeforeBase * historicalRate) + payAmountInBs);
  const remainingBase  = Math.max(0, pendingAfterCredit - amountBase);
  const remainingBs    = Math.max(0, roundBs2(pendingPreciseBs - payAmountInBs));
  const settlesInvoice = hasBsRate ? remainingBs < 0.01 : remainingBase < 0.001;

  // Sobrante calculado en la moneda de pago (570 - 561.22 = 8.78 exacto),
  // sin ida-y-vuelta por USD que acumula error de redondeo
  const changeInPayCur = (!isNaN(receivedNum) && receivedNum > 0 && pendingAfterCredit > 0 && receivedNum > (isNaN(amountNum) ? 0 : amountNum))
    ? parseFloat((receivedNum - (isNaN(amountNum) ? 0 : amountNum)).toFixed(2))
    : 0;
  const changeBase = changeInPayCur > 0 ? changeInPayCur / payRate : 0;
  const changeDisplay = changeInPayCur;

  // Moneda del diario de cambio (para mostrar equivalencia en Bs, etc.)
  const changeJournalObj  = form.change_journal_id ? activeJournals.find(j => j.id === form.change_journal_id) : null;
  const changeJournalCur  = changeJournalObj?.currency_id ? activeCurrencies.find(c => c.id === parseInt(changeJournalObj.currency_id)) : null;
  const changeJournalRate = (!changeJournalCur || changeJournalCur.is_base) ? 1 : parseFloat(changeJournalCur.exchange_rate || 1);
  const changeJournalSym  = changeJournalCur?.symbol || baseCurrency?.symbol || "Ref.";
  const exactChangeInJournalCur = parseFloat((changeBase * changeJournalRate).toFixed(2));

  // Monto real que ingresó el cajero (puede redondearlo al billete más cercano)
  const overrideNum   = parseFloat(String(form.change_amount_override || "").replace(",", "."));
  const validOverride = !isNaN(overrideNum) && overrideNum > 0;
  const actualChangeBase = (changeBase > 0 && validOverride)
    ? overrideNum / changeJournalRate
    : changeBase;

  const creditCoversAll = creditApplied >= balanceUsd - 0.001;

  const submit = async () => {
    if (!form.reference_date) return notify("La fecha de referencia es requerida", "err");
    if (!creditCoversAll) {
      if (!form.payment_journal_id) return notify("Selecciona el método de pago", "err");
      if (!form.amount) return notify("El monto es requerido", "err");
      // La referencia es opcional: hay cobros sin número a mano (el cliente no lo tiene
      // todavía, el punto no lo imprime) y exigirla obligaba al cajero a inventarse algo
      // para poder cerrar la venta, que es peor que dejar el campo vacío.
    }
    if (changeBase > 0 && !form.keep_change && !form.credit_change && !form.change_journal_id) return notify("Selecciona el diario del que saldrá el cambio", "err");

    const finalAmountBase = form.keep_change ? Math.min(receivedBase, pendingAfterCredit) : amountBase;
    const payAmountToSend = (changeBase > 0 && !form.keep_change && (form.change_journal_id || form.credit_change))
      ? receivedBase
      : finalAmountBase;

    setLoading(true);
    try {
      const res = await api.payments.create({
        sale_id:            sale.id,
        amount:             creditCoversAll ? 0 : payAmountToSend,
        currency_id:        payCur?.id || null,
        exchange_rate:      payRate,
        reference_date:     form.reference_date,
        reference_number:   form.reference_number || null,
        notes:              form.notes || null,
        payment_journal_id: creditCoversAll ? null : (form.payment_journal_id || null),
        received_amount:    receivedBase > 0 ? receivedBase : undefined,
        change_given:       (changeBase > 0 && !form.keep_change && !form.credit_change) ? actualChangeBase : undefined,
        change_journal_id:  (changeBase > 0 && !form.keep_change && !form.credit_change) ? form.change_journal_id : undefined,
        surplus_kept:       (changeBase > 0 && form.keep_change) ? changeBase : undefined,
        change_to_credit:   (changeBase > 0 && form.credit_change) ? changeBase : undefined,
        credit_amount:      creditApplied > 0 ? creditApplied : undefined,
      });
      if (res.sale_status === "pagado") notify("¡Factura pagada completamente!");
      else notify("Pago parcial registrado");
      setForm(getEmpty());
      setCreditToApply("");
      onSuccess?.(res);
    } catch (e) { notify(e.message, "err"); }
    setLoading(false);
  };

  const canSubmit = !loading && form.reference_date && (
    creditCoversAll ||
    (form.payment_journal_id && !isNaN(amountNum) && amountNum > 0 &&
      (changeBase <= 0 || form.keep_change || form.credit_change || form.change_journal_id))
  );

  const fmt     = (usdAmt) => `${defaultSym}${(Number(usdAmt || 0) * historicalRate).toFixed(2)}`;
  const fmtBase = (usdAmt) => `${baseCurrency?.symbol || "Ref."}${Number(usdAmt || 0).toFixed(2)}`;

  return (
    <Modal open={!!sale} onClose={onClose} title="REGISTRAR PAGO" width={460}>

      {/* Resumen de la factura */}
      <div className="rounded-xl bg-white/[0.02] dark:bg-white/[0.04] border border-border/10 dark:border-white/[0.06] p-4 mb-5 space-y-1.5">
        <Row label="Factura" value={sale.invoice_number || `#${sale.id}`} />
        {sale.customer_name && <Row label="Cliente" value={sale.customer_name} />}
        <Row label="Total" value={hasBsRate ? `${defaultSym}${totalPreciseBs.toFixed(2)}` : fmt(sale.total)} />
        {sale.amount_paid > 0 && (
          <Row label="Ya pagado" value={fmt(sale.amount_paid)} valueClass="text-success" />
        )}
        {creditApplied > 0 && (
          <Row label="Crédito aplicado" value={`−${fmt(creditApplied)}`} valueClass="text-brand-500 font-black" />
        )}
        <div className="border-t border-border/20 dark:border-white/5 pt-1.5 mt-1.5">
          <Row label="Saldo pendiente"
            value={hasBsRate ? `${defaultSym}${pendingPreciseBs.toFixed(2)}` : fmt(pendingAfterCredit)}
            valueClass="text-danger font-black" />
        </div>
      </div>

      <div className="space-y-4">

        {/* Crédito de cliente */}
        {customerCredit > 0.001 && (
          <div className="rounded-xl border-2 border-brand-500/30 bg-brand-500/5 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-500">
                Crédito disponible
              </span>
              <span className="text-sm font-black text-brand-500 tabular-nums">
                {fmtBase(customerCredit)}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                inputMode="decimal"
                value={creditToApply}
                onChange={e => setCreditToApply(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder={fmtBase(Math.min(customerCredit, balanceUsd))}
                className="flex-1 h-9 bg-white/[0.02] dark:bg-white/[0.04] border border-brand-500/30 rounded-xl px-3 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
              />
              <button
                type="button"
                onClick={() => setCreditToApply(String(Math.min(customerCredit, balanceUsd).toFixed(6)))}
                className="px-3 h-9 rounded-xl bg-brand-500 text-black text-[10px] font-black uppercase tracking-wide hover:brightness-110 transition-all"
              >
                Aplicar todo
              </button>
            </div>
            {creditApplied > 0 && creditCoversAll && (
              <p className="text-[10px] font-black text-success">
                ✓ El crédito cubre el saldo completo. No se requiere pago adicional.
              </p>
            )}
          </div>
        )}

        {/* Campos de pago — ocultos si el crédito cubre todo */}
        {!creditCoversAll && (<>

        {/* Un desplegable en vez de una botonera: con siete u ocho diarios los chips se
            desbordaban en cuatro filas y en móvil empujaban el resto del formulario fuera
            de la vista. El desplegable ocupa una línea sin importar cuántos haya. */}
        <Field label="MÉTODO DE PAGO *">
          <CustomSelect
            value={form.payment_journal_id === "" ? "" : String(form.payment_journal_id)}
            placeholder="Seleccionar método..."
            options={activeJournals.map(j => ({ value: String(j.id), label: j.name }))}
            onChange={(v) => {
              // El id vuelve a número: el resto del formulario compara con j.id sin convertir.
              const id = parseInt(v, 10);
              const j = activeJournals.find(x => x.id === id);
              if (!j) return;
              const newCurId = j.currency_id || baseCurrency?.id;
              const newCur = activeCurrencies.find(c => c.id === parseInt(newCurId));
              const isNonBase = newCur && !newCur.is_base;
              // En Bs → saldo calculado línea por línea (Bs.9000). En $ → saldo oficial (12.21).
              const newAmt = isNonBase ? pendingPreciseBs.toFixed(2) : pendingAfterCredit.toFixed(2);
              setForm(p => ({
                ...p,
                payment_journal_id: id,
                pay_currency_id: newCurId || p.pay_currency_id,
                amount: newAmt,
                received_amount: newAmt,
                change_journal_id: "",
                change_amount_override: "",
              }));
            }}
          />
          {payCur && !payCur.is_base && (
            <p className="text-[10px] font-bold text-content-subtle dark:text-white/30 mt-1.5">
              {payCur.symbol} {payCur.code} · tasa {parseFloat(payCur.exchange_rate).toFixed(4)}
            </p>
          )}
        </Field>

        <Field label="MONTO RECIBIDO DEL CLIENTE *">
          <input
            type="text"
            inputMode="decimal"
            value={form.received_amount}
            onChange={e => {
              const val = e.target.value.replace(/[^\d.,]/g, "");
              const num = parseFloat(val.replace(",", "."));
              // Tope en la moneda de pago: en Bs → saldo línea por línea (9000); en $ → saldo
              // oficial (12.21). Coincide con lo mostrado en "Saldo pendiente" y con el auto-relleno.
              const maxInCur = (payCur && !payCur.is_base) ? pendingPreciseBs : pendingAfterCredit;
              const abono = !isNaN(num) && num > 0 ? Math.min(num, maxInCur).toFixed(2) : "";
              setForm(p => ({ ...p, received_amount: val, amount: abono }));
            }}
            placeholder={`${paySym}0.00`}
            className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
          />
        </Field>

        {/* Sobrante */}
        {changeBase > 0 && (
          <div className="rounded-xl border-2 border-warning/30 bg-warning/5 p-4 space-y-3">
            {/* Título + monto */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-warning/80">Sobrante</span>
              <div className="text-right">
                <span className="text-sm font-black text-warning tabular-nums">
                  {paySym}{changeDisplay.toFixed(2)}
                </span>
                {payCur && !payCur.is_base && (
                  <span className="block text-[10px] font-bold text-content-subtle dark:text-white/30 tabular-nums">
                    ≈ {baseCurrency?.symbol}{changeBase.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            {/* Toggle dar cambio / quedarse / crédito */}
            <div className="flex p-1 bg-white/[0.02] dark:bg-white/[0.04] rounded-xl border border-white/[0.06]">
              <button type="button"
                onClick={() => setForm(p => ({ ...p, keep_change: false, credit_change: false, change_journal_id: "", change_amount_override: "" }))}
                className={[
                  "flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all",
                  !form.keep_change && !form.credit_change
                    ? "bg-warning text-black shadow-lg"
                    : "text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                ].join(" ")}
              >
                Dar cambio
              </button>
              <button type="button"
                onClick={() => setForm(p => ({ ...p, keep_change: true, credit_change: false, change_journal_id: "", change_amount_override: "" }))}
                className={[
                  "flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all",
                  form.keep_change
                    ? "bg-success text-black shadow-lg"
                    : "text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                ].join(" ")}
              >
                Quedarse
              </button>
              {sale?.customer_id && (
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, keep_change: false, credit_change: true, change_journal_id: "", change_amount_override: "" }))}
                  className={[
                    "flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all",
                    form.credit_change
                      ? "bg-brand-500 text-black shadow-lg"
                      : "text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                  ].join(" ")}
                >
                  Crédito
                </button>
              )}
            </div>

            {/* Nota de crédito al cliente */}
            {form.credit_change && (
              <p className="text-[10px] font-black text-brand-500">
                ✓ {paySym}{changeDisplay.toFixed(2)} se añadirá al crédito del cliente.
              </p>
            )}

            {/* Selector de diario de cambio */}
            {!form.keep_change && !form.credit_change && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-warning/80 mb-1.5">DAR CAMBIO DESDE *</p>
                {/* Mismo desplegable que el método de pago: son la misma lista de diarios y
                    tenerlos con dos formas distintas en un solo formulario confunde. */}
                <CustomSelect
                  value={form.change_journal_id === "" ? "" : String(form.change_journal_id)}
                  placeholder="Seleccionar diario..."
                  options={activeJournals.map(j => ({ value: String(j.id), label: j.name }))}
                  onChange={(v) => {
                    const id = parseInt(v, 10);
                    const j = activeJournals.find(x => x.id === id);
                    if (!j) return;
                    const cjCur = j.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : null;
                    const cjRate = (!cjCur || cjCur.is_base) ? 1 : parseFloat(cjCur.exchange_rate || 1);
                    const exact  = parseFloat((changeBase * cjRate).toFixed(2));
                    setForm(p => ({ ...p, change_journal_id: id, change_amount_override: String(exact) }));
                  }}
                />
                {!form.change_journal_id && (
                  <p className="text-[10px] font-black text-danger mt-1.5">Selecciona de dónde saldrá el cambio</p>
                )}

                {/* Monto a entregar desde el diario seleccionado */}
                {form.change_journal_id && (
                  <div className="mt-3 pt-3 border-t border-warning/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-warning/70 uppercase tracking-widest">Cambio exacto</span>
                      <span className="text-[12px] font-black text-warning tabular-nums">
                        {changeJournalSym}{exactChangeInJournalCur.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-warning/70 uppercase tracking-widest mb-1.5">
                        Monto real a entregar ({changeJournalSym})
                      </p>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form.change_amount_override}
                        placeholder={exactChangeInJournalCur.toFixed(2)}
                        onChange={e => {
                          const val = e.target.value.replace(/[^\d.,]/g, "");
                          setForm(p => ({ ...p, change_amount_override: val }));
                        }}
                        className="w-full h-9 bg-white/[0.02] dark:bg-white/[0.04] border border-warning/40 rounded-xl px-3 text-[13px] font-bold text-content dark:text-white outline-none focus:border-warning/70 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Monto / Abono (readonly) */}
        <Field label={amountBase >= pendingAfterCredit - 0.001 ? "PAGO COMPLETO A FACTURA" : "ABONO PARCIAL A FACTURA"}>
          <div className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 flex items-center text-[13px] font-black text-content dark:text-white tabular-nums">
            {paySym}{(payCur && !payCur.is_base ? amountNum : amountBase * payRate).toFixed(2)}
          </div>
          {payCur && !payCur.is_base && amountBase > 0 && (
            <p className="text-[10px] font-bold text-success mt-1">
              ≈ {baseCurrency?.symbol}{amountBase.toFixed(2)} {baseCurrency?.code} · tasa {payRate}
            </p>
          )}
        </Field>

        {/* Cómo queda la factura con este pago, para no tener que calcularlo de cabeza. */}
        {amountBase > 0 && (
          <div className={`rounded-xl border p-3.5 space-y-1.5 ${settlesInvoice
            ? "border-success/30 bg-success/5"
            : "border-warning/30 bg-warning/5"}`}>
            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/40">
              Después de este pago
            </div>
            <Row
              label="Total pagado"
              value={hasBsRate ? `${defaultSym}${paidTotalBs.toFixed(2)}` : fmt(paidTotalBase)}
              valueClass="text-success font-black"
            />
            <div className="border-t border-border/20 dark:border-white/5 pt-1.5">
              <Row
                label={settlesInvoice ? "Factura saldada" : "Saldo restante"}
                value={hasBsRate ? `${defaultSym}${remainingBs.toFixed(2)}` : fmt(remainingBase)}
                valueClass={`font-black ${settlesInvoice ? "text-success" : "text-warning"}`}
              />
            </div>
          </div>
        )}

        <Field label="FECHA DE REFERENCIA *">
          <DatePicker
            value={form.reference_date}
            onChange={v => setForm(p => ({ ...p, reference_date: v }))}
            className="w-full"
          />
        </Field>

        {/* N° Referencia (oculto si es efectivo) */}
        {!isCash && (
          <Field label="N° REFERENCIA">
            <input
              type="text"
              value={form.reference_number}
              onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))}
              placeholder="Ej: 000123456"
              className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
            />
          </Field>
        )}
        </>)}

        {/* Notas */}
        <Field label="NOTAS">
          <input
            type="text"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Observaciones..."
            className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
          />
        </Field>
      </div>

      {/* Acciones */}
      <div className="flex gap-2.5 mt-6 pt-4 border-t border-border/20 dark:border-white/5">
        <button onClick={onClose}
          className="flex-1 h-10 rounded-xl border border-border/40 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white hover:border-border dark:hover:border-white/20 transition-all">
          Cancelar
        </button>
        <button onClick={submit} disabled={!canSubmit}
          className="flex-[2] h-10 rounded-xl bg-success text-black text-[11px] font-black uppercase tracking-wide transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed">
          {loading ? "Registrando..." : "Confirmar pago"}
        </button>
      </div>
    </Modal>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
function Row({ label, value, valueClass = "text-content dark:text-white" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-content-subtle dark:text-white/40">{label}</span>
      <span className={`text-[12px] font-black tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">{label}</p>
      {children}
    </div>
  );
}
