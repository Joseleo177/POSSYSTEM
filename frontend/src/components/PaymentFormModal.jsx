import { useState } from "react";
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
  keep_change: false,
});

export default function PaymentFormModal({ sale, onClose, onSuccess }) {
  const { notify, baseCurrency, activeCurrencies, activeJournals } = useApp();
  const [form, setForm] = useState(getEmpty);
  const [loading, setLoading] = useState(false);

  const displayCur = activeCurrencies.find(c => !c.is_base) || baseCurrency;
  const defaultRate = (!displayCur || displayCur.is_base) ? 1 : parseFloat(displayCur.exchange_rate || 1);
  const defaultSym = displayCur?.symbol || baseCurrency?.symbol || "$";

  const payCur = activeCurrencies.find(c => c.id === parseInt(form.pay_currency_id));
  const payRate = (!payCur || payCur.is_base) ? 1 : parseFloat(payCur.exchange_rate || 1);
  const paySym = payCur?.symbol || baseCurrency?.symbol || "$";

  const balanceUsd = parseFloat(sale?.balance ?? sale?.total ?? 0);

  const receivedNum = parseFloat(String(form.received_amount).replace(",", "."));
  const amountNum   = parseFloat(String(form.amount).replace(",", "."));

  const receivedBase = !isNaN(receivedNum) ? receivedNum / payRate : 0;
  const amountBase   = !isNaN(amountNum) ? amountNum / payRate : 0;

  const changeBase = receivedBase > amountBase && receivedBase > 0
    ? parseFloat((receivedBase - amountBase).toFixed(4))
    : 0;
  const changeDisplay = changeBase * payRate;

  const submit = async () => {
    if (!form.payment_journal_id) return notify("Selecciona el método de pago", "err");
    if (!form.amount) return notify("El monto es requerido", "err");
    if (!form.reference_date) return notify("La fecha de referencia es requerida", "err");
    if (!form.reference_number?.trim()) return notify("El número de referencia es requerido", "err");
    if (changeBase > 0 && !form.keep_change && !form.change_journal_id) return notify("Selecciona el diario del que saldrá el cambio", "err");

    const finalAmountBase = form.keep_change ? Math.min(receivedBase, balanceUsd) : amountBase;

    setLoading(true);
    try {
      const res = await api.payments.create({
        sale_id: sale.id,
        amount: finalAmountBase,
        currency_id: payCur?.id || null,
        exchange_rate: payRate,
        reference_date: form.reference_date,
        reference_number: form.reference_number || null,
        notes: form.notes || null,
        payment_journal_id: form.payment_journal_id || null,
        received_amount: receivedBase > 0 ? receivedBase : undefined,
        change_given: (changeBase > 0 && !form.keep_change) ? changeBase : undefined,
        change_journal_id: (changeBase > 0 && !form.keep_change) ? form.change_journal_id : undefined,
        surplus_kept: (changeBase > 0 && form.keep_change) ? changeBase : undefined,
      });
      if (res.sale_status === "pagado") notify("¡Factura pagada completamente!");
      else notify("Pago parcial registrado");
      setForm(getEmpty());
      onSuccess?.(res);
    } catch (e) { notify(e.message, "err"); }
    setLoading(false);
  };

  const canSubmit = !loading && form.payment_journal_id &&
    !isNaN(amountNum) && amountNum > 0 &&
    form.reference_date && form.reference_number?.trim() &&
    (changeBase <= 0 || form.keep_change || form.change_journal_id);

  // Para mostrar los montos de la factura
  const infoRate = form.pay_currency_id ? payRate : defaultRate;
  const infoSym  = form.pay_currency_id ? paySym : defaultSym;
  const fmt = (usdAmt) => `${infoSym}${(Number(usdAmt || 0) * infoRate).toFixed(2)}`;

  return (
    <Modal open={!!sale} onClose={onClose} title="REGISTRAR PAGO" width={460}>

      {/* Resumen de la factura */}
      <div className="rounded-xl bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/5 p-4 mb-5 space-y-1.5">
        <Row label="Factura" value={sale.invoice_number || `#${sale.id}`} />
        {sale.customer_name && <Row label="Cliente" value={sale.customer_name} />}
        <Row label="Total" value={fmt(sale.total)} />
        {sale.amount_paid > 0 && (
          <Row label="Ya pagado" value={fmt(sale.amount_paid)} valueClass="text-success" />
        )}
        <div className="border-t border-border/20 dark:border-white/5 pt-1.5 mt-1.5">
          <Row label="Saldo pendiente" value={fmt(balanceUsd)} valueClass="text-danger font-black" />
        </div>
      </div>

      <div className="space-y-4">

        {/* Método de pago */}
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
                    const newAmt = (balanceUsd * newRate).toFixed(2);
                    setForm(p => ({
                      ...p,
                      payment_journal_id: j.id,
                      pay_currency_id: newCurId || p.pay_currency_id,
                      amount: newAmt,
                      received_amount: newAmt,
                      change_journal_id: "",
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

        {/* Monto recibido */}
        <Field label="MONTO RECIBIDO DEL CLIENTE *">
          <input
            type="text"
            inputMode="decimal"
            value={form.received_amount}
            onChange={e => {
              const val = e.target.value.replace(/[^\d.,]/g, "");
              const num = parseFloat(val.replace(",", "."));
              const maxInCur = balanceUsd * payRate;
              const abono = !isNaN(num) && num > 0 ? Math.min(num, maxInCur).toFixed(2) : "";
              setForm(p => ({ ...p, received_amount: val, amount: abono }));
            }}
            placeholder={`${paySym}0.00`}
            className="w-full h-10 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
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

            {/* Toggle dar cambio / quedarse */}
            <div className="flex p-1 bg-surface-2 dark:bg-white/5 rounded-xl border border-white/5">
              <button type="button"
                onClick={() => setForm(p => ({ ...p, keep_change: false, change_journal_id: "" }))}
                className={[
                  "flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all",
                  !form.keep_change
                    ? "bg-warning text-black shadow-lg"
                    : "text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                ].join(" ")}
              >
                Dar cambio
              </button>
              <button type="button"
                onClick={() => setForm(p => ({ ...p, keep_change: true, change_journal_id: "" }))}
                className={[
                  "flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all",
                  form.keep_change
                    ? "bg-success text-black shadow-lg"
                    : "text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                ].join(" ")}
              >
                Quedarse
              </button>
            </div>

            {/* Selector de diario de cambio */}
            {!form.keep_change && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-warning/80 mb-1.5">DAR CAMBIO DESDE *</p>
                <div className="flex flex-wrap gap-1.5">
                  {activeJournals.map(j => (
                    <button key={j.id} type="button"
                      onClick={() => setForm(p => ({ ...p, change_journal_id: j.id }))}
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
              </div>
            )}
          </div>
        )}

        {/* Abono (readonly) */}
        <Field label="ABONO A LA FACTURA">
          <div className="w-full h-10 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 flex items-center text-[13px] font-black text-content dark:text-white tabular-nums">
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

        {/* N° Referencia */}
        <Field label="N° REFERENCIA *">
          <input
            type="text"
            value={form.reference_number}
            onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))}
            placeholder="Ej: 000123456"
            className="w-full h-10 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
          />
        </Field>

        {/* Notas */}
        <Field label="NOTAS">
          <input
            type="text"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Observaciones..."
            className="w-full h-10 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
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
