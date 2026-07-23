import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import Modal from "./ui/Modal";
import DatePicker from "./ui/DatePicker";

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

  const balanceUsd        = parseFloat(sale?.balance ?? sale?.total ?? 0);
  const creditNum         = parseFloat(String(creditToApply).replace(",", ".")) || 0;
  const creditApplied     = Math.min(Math.max(creditNum, 0), customerCredit, balanceUsd);
  const pendingAfterCredit = Math.max(0, balanceUsd - creditApplied);

  const receivedNum = parseFloat(String(form.received_amount).replace(",", "."));
  const amountNum   = parseFloat(String(form.amount).replace(",", "."));

  const receivedBase = !isNaN(receivedNum) ? receivedNum / payRate : 0;
  const amountBase   = !isNaN(amountNum) ? amountNum / payRate : 0;

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
      if (!isCash && !form.reference_number?.trim()) return notify("El número de referencia es requerido", "err");
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
      (isCash || form.reference_number?.trim()) &&
      (changeBase <= 0 || form.keep_change || form.credit_change || form.change_journal_id))
  );

  // Para mostrar los montos de la factura (Total/Ya pagado/Saldo pendiente):
  // usar SIEMPRE la tasa congelada al crear la venta (sale.exchange_rate), no la tasa vigente hoy.
  // La deuda en USD es fija; su equivalente en Bs no debe fluctuar solo por pagarla otro día
  // con una tasa distinta (misma lógica ya aplicada en ReceiptModal para ventas pendientes/parciales).
  const historicalRate = parseFloat(sale?.exchange_rate) > 1 ? parseFloat(sale.exchange_rate) : defaultRate;

  // Total preciso en Bs: suma línea a línea con redondeo a 2 dec, igual que CartContext.
  // Evita el error de punto flotante donde sale.total (2 dec USD) × tasa ≠ suma de precios Bs.
  const roundBs2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
  const hasBsRate = historicalRate > 1;
  const totalPreciseBs = (hasBsRate && sale?.items?.length)
    ? parseFloat((
        sale.items.reduce(
          (s, i) => s + roundBs2((parseFloat(i.price || 0) - parseFloat(i.discount || 0)) * historicalRate) * parseFloat(i.quantity || 1),
          0
        ) - roundBs2(parseFloat(sale.discount_amount || 0) * historicalRate)
      ).toFixed(2))
    : roundBs2(parseFloat(sale?.total_precise ?? sale?.total ?? 0) * historicalRate);

  // Saldo pendiente preciso en Bs (descuenta pagos y devoluciones ya registrados)
  const paidBs   = roundBs2(parseFloat(sale?.amount_paid   || 0) * historicalRate);
  const retBs    = roundBs2(parseFloat(sale?.total_returned || 0) * historicalRate);
  const pendingPreciseBs = Math.max(0, totalPreciseBs - paidBs - retBs);

  // fmt: conversión genérica USD → moneda de display (para montos que sí son USD: amount_paid, etc.)
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
            value={hasBsRate
              ? `${defaultSym}${Math.max(0, pendingPreciseBs - creditApplied * historicalRate).toFixed(2)}`
              : fmt(pendingAfterCredit)}
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

        <Field label="MÉTODO DE PAGO *">
          <div className="flex flex-wrap gap-1.5">
            {activeJournals.map(j => {
              const active = form.payment_journal_id === j.id;
              return (
                <button key={j.id} type="button"
                  onClick={() => {
                    const newCurId = j.currency_id || baseCurrency?.id;
                    const newCur = activeCurrencies.find(c => c.id === parseInt(newCurId));
                    const newRate = (!newCur || newCur.is_base) ? 1 : parseFloat(newCur.exchange_rate || 1);
                    // Si el diario cobra en moneda no-base (Bs), usar el saldo preciso en Bs
                    // para evitar el error de punto flotante al convertir USD → Bs.
                    const isNonBase = newCur && !newCur.is_base;
                    const creditBs = isNonBase ? creditApplied * historicalRate : creditApplied;
                    const newAmt = (isNonBase && hasBsRate)
                      ? Math.max(0, pendingPreciseBs - creditBs).toFixed(2)
                      : (pendingAfterCredit * newRate).toFixed(2);
                    setForm(p => ({
                      ...p,
                      payment_journal_id: j.id,
                      pay_currency_id: newCurId || p.pay_currency_id,
                      amount: newAmt,
                      received_amount: newAmt,
                      change_journal_id: "",
                      change_amount_override: "",
                    }));
                  }}
                  style={active && j.color ? { borderColor: j.color, backgroundColor: j.color, color: "#000" } : undefined}
                  className={[
                    "px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide border-2 transition-all",
                    active && !j.color
                      ? "border-brand-500 bg-brand-500 text-black"
                      : !active
                      ? "border-border/40 dark:border-white/10 text-content-subtle dark:text-white/40 hover:border-brand-400 dark:hover:border-brand-400/50"
                      : ""
                  ].join(" ")}
                >
                  {j.name}
                </button>
              );
            })}
          </div>
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
              // maxInCur: usar el saldo preciso en Bs cuando el pago es en moneda no-base,
              // evitando que el límite calculado desde USD sea menor al real en Bs.
              const maxInCur = (payCur && !payCur.is_base && hasBsRate)
                ? Math.max(0, pendingPreciseBs - creditApplied * historicalRate)
                : pendingAfterCredit * payRate;
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
                <div className="flex flex-wrap gap-1.5">
                  {activeJournals.map(j => (
                    <button key={j.id} type="button"
                      onClick={() => {
                        const cjCur = j.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : null;
                        const cjRate = (!cjCur || cjCur.is_base) ? 1 : parseFloat(cjCur.exchange_rate || 1);
                        const exact  = parseFloat((changeBase * cjRate).toFixed(2));
                        setForm(p => ({ ...p, change_journal_id: j.id, change_amount_override: String(exact) }));
                      }}
                      className={[
                        "px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide border-2 transition-all",
                        form.change_journal_id === j.id
                          ? "border-warning bg-warning text-black"
                          : "border-border/40 dark:border-white/10 text-content-subtle dark:text-white/40 hover:border-warning/50"
                      ].join(" ")}
                    >
                      {j.name}
                    </button>
                  ))}
                </div>
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

        {/* Abono (readonly) */}
        <Field label="ABONO A LA FACTURA">
          <div className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 flex items-center text-[13px] font-black text-content dark:text-white tabular-nums">
            {paySym}{(amountBase * payRate).toFixed(2)}
          </div>
          {payCur && !payCur.is_base && amountBase > 0 && (
            <p className="text-[10px] font-bold text-success mt-1">
              ≈ {baseCurrency?.symbol}{amountBase.toFixed(2)} {baseCurrency?.code} · tasa {payRate}
            </p>
          )}
        </Field>

        <Field label="FECHA DE REFERENCIA *">
          <DatePicker
            value={form.reference_date}
            onChange={v => setForm(p => ({ ...p, reference_date: v }))}
            className="w-full"
          />
        </Field>

        {/* N° Referencia (oculto si es efectivo) */}
        {!isCash && (
          <Field label="N° REFERENCIA *">
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
