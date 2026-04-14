import { useState } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import Modal from "../ui/Modal";
import CustomSelect from "../ui/CustomSelect";

const getEmpty = () => ({
  received_amount: "",
  reference_date: new Date().toISOString().split("T")[0],
  reference_number: "",
  notes: "",
  payment_journal_id: "",
  pay_currency_id: "",
});

/**
 * Modal para registrar pagos a proveedores (cuentas por pagar).
 * Props:
 *   purchase  – objeto de la compra a pagar (con .total, .balance, .amount_paid, .supplier_name)
 *   onClose   – fn para cerrar
 *   onSuccess – fn(res) llamada tras pago exitoso
 */
export default function PurchasePaymentModal({ purchase, onClose, onSuccess }) {
  const { notify, baseCurrency, activeCurrencies, activeJournals } = useApp();
  const [form, setForm] = useState(getEmpty);
  const [loading, setLoading] = useState(false);

  const payCur  = activeCurrencies.find(c => c.id === parseInt(form.pay_currency_id));
  const payRate = (!payCur || payCur.is_base) ? 1 : parseFloat(payCur.exchange_rate || 1);
  const paySym  = payCur?.symbol || baseCurrency?.symbol || "$";

  const balanceUsd = parseFloat(purchase?.balance ?? purchase?.total ?? 0);

  const receivedNum = parseFloat(String(form.received_amount).replace(",", "."));
  const amountBase  = !isNaN(receivedNum) && receivedNum > 0
    ? parseFloat(Math.min(receivedNum / payRate, balanceUsd).toFixed(4))
    : 0;

  const submit = async () => {
    if (!form.payment_journal_id) return notify("Selecciona el diario de pago", "err");
    if (!form.received_amount)    return notify("El monto es requerido", "err");
    if (!form.reference_date)     return notify("La fecha de referencia es requerida", "err");
    if (!form.reference_number?.trim()) return notify("El número de referencia es requerido", "err");

    setLoading(true);
    try {
      const res = await api.purchases.createPayment(purchase.id, {
        amount:             amountBase,
        currency_id:        payCur?.id || null,
        exchange_rate:      payRate,
        payment_journal_id: parseInt(form.payment_journal_id),
        reference_date:     form.reference_date,
        reference_number:   form.reference_number.trim(),
        notes:              form.notes?.trim() || null,
      });
      if (res.payment_status === "pagado") notify("¡Compra pagada completamente!");
      else notify("Abono registrado correctamente");
      setForm(getEmpty());
      onSuccess?.(res);
    } catch (e) { notify(e.message, "err"); }
    setLoading(false);
  };

  const canSubmit = !loading && form.payment_journal_id &&
    !isNaN(receivedNum) && receivedNum > 0 &&
    form.reference_date && form.reference_number?.trim();

  // Display helpers
  const infoRate = form.pay_currency_id ? payRate : 1;
  const infoSym  = form.pay_currency_id ? paySym  : (baseCurrency?.symbol || "$");
  const fmt = (usd) => `${infoSym}${(Number(usd || 0) * infoRate).toFixed(2)}`;

  return (
    <Modal open={!!purchase} onClose={onClose} title="PAGAR A PROVEEDOR" width={440}>

      {/* Resumen de la compra */}
      <div className="rounded-xl bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/5 p-4 mb-5 space-y-1.5">
        {purchase.supplier_name && (
          <Row label="Proveedor" value={purchase.supplier_name} />
        )}
        <Row label="Compra" value={`#${purchase.id}`} />
        <Row label="Total compra" value={fmt(purchase.total)} />
        {purchase.amount_paid > 0 && (
          <Row label="Ya pagado" value={fmt(purchase.amount_paid)} valueClass="text-success" />
        )}
        <div className="border-t border-border/20 dark:border-white/5 pt-1.5 mt-1.5">
          <Row label="Saldo pendiente" value={fmt(balanceUsd)} valueClass="text-danger font-black" />
        </div>
      </div>

      <div className="space-y-4">

        {/* Diario de pago */}
        <Field label="DIARIO DE PAGO *">
          <div className="flex flex-wrap gap-1.5">
            {activeJournals.map(j => {
              const active = form.payment_journal_id === j.id;
              return (
                <button key={j.id} type="button"
                  onClick={() => {
                    const newCurId = j.currency_id || baseCurrency?.id;
                    const newCur   = activeCurrencies.find(c => c.id === parseInt(newCurId));
                    const newRate  = (!newCur || newCur.is_base) ? 1 : parseFloat(newCur.exchange_rate || 1);
                    const newAmt   = (balanceUsd * newRate).toFixed(2);
                    setForm(p => ({
                      ...p,
                      payment_journal_id: j.id,
                      pay_currency_id:    newCurId || p.pay_currency_id,
                      received_amount:    newAmt,
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

        {/* Monto a pagar */}
        <Field label="MONTO A PAGAR *">
          <input
            type="text"
            inputMode="decimal"
            value={form.received_amount}
            onChange={e => {
              const val = e.target.value.replace(/[^\d.,]/g, "");
              setForm(p => ({ ...p, received_amount: val }));
            }}
            placeholder={`${paySym}0.00`}
            className="w-full h-10 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
          />
          {payCur && !payCur.is_base && amountBase > 0 && (
            <p className="text-[10px] font-bold text-success mt-1">
              ≈ {baseCurrency?.symbol}{amountBase.toFixed(2)} {baseCurrency?.code} · tasa {payRate}
            </p>
          )}
        </Field>

        {/* Fecha */}
        <Field label="FECHA DE REFERENCIA *">
          <input
            type="date"
            value={form.reference_date}
            onChange={e => setForm(p => ({ ...p, reference_date: e.target.value }))}
            className="w-full h-10 bg-surface-2 dark:bg-white/5 border border-border/40 dark:border-white/10 rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all"
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
          className="flex-[2] h-10 rounded-xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-wide transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed">
          {loading ? "Registrando..." : "Confirmar pago"}
        </button>
      </div>
    </Modal>
  );
}

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
