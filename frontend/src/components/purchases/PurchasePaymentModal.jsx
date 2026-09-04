import { useState } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import Modal from "../ui/Modal";
import CustomSelect from "../ui/CustomSelect";
import DatePicker from "../ui/DatePicker";
import RateField, { resolveRate } from "../ui/RateField";
import { todayISO } from "../../helpers";

const getEmpty = () => ({
  received_amount: "",
  // Vacío = tasa de configuración de la moneda del diario. Lo tecleado vale solo para este pago.
  exchange_rate: "",
  reference_date: todayISO(),
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
  const { notify, baseCurrency, activeCurrencies, activeJournals, outflowJournals } = useApp();
  const [form, setForm] = useState(getEmpty);
  const [loading, setLoading] = useState(false);

  const payCur     = activeCurrencies.find(c => c.id === parseInt(form.pay_currency_id));
  const payCurRate = (!payCur || payCur.is_base) ? 1 : parseFloat(payCur.exchange_rate || 1);
  // La tasa del pago al proveedor se puede escribir a mano: es la del día en que se transfiere,
  // que rara vez coincide con la que quedó cargada en configuración.
  const payRate    = (!payCur || payCur.is_base) ? 1 : resolveRate(form.exchange_rate, payCurRate);
  const paySym     = payCur?.symbol || baseCurrency?.symbol || "Ref.";

  const selectedJournal = activeJournals.find(j => j.id === form.payment_journal_id);
  const isCash = selectedJournal?.type === "efectivo";

  const balanceUsd = parseFloat(purchase?.balance ?? purchase?.total ?? 0);

  const receivedNum = parseFloat(String(form.received_amount).replace(",", "."));
  const amountRaw   = !isNaN(receivedNum) && receivedNum > 0 ? receivedNum / payRate : 0;
  const amountBase  = parseFloat(amountRaw.toFixed(6));
  const isCapped    = amountRaw > balanceUsd + 0.001;

  const submit = async () => {
    if (!form.payment_journal_id) return notify("Selecciona el diario de pago", "err");
    if (!form.received_amount)    return notify("El monto es requerido", "err");
    if (!form.reference_date)     return notify("La fecha de referencia es requerida", "err");
    // La referencia queda opcional, igual que al cobrar una venta: no siempre se tiene el
    // número a mano al registrar el pago.

    setLoading(true);
    try {
      const res = await api.purchases.createPayment(purchase.id, {
        amount:             amountBase,
        currency_id:        payCur?.id || null,
        exchange_rate:      payRate,
        payment_journal_id: parseInt(form.payment_journal_id),
        reference_date:     form.reference_date,
        reference_number:   form.reference_number?.trim() || null,
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
    form.reference_date;

  // Display helpers
  const infoRate = form.pay_currency_id ? payRate : 1;
  const infoSym  = form.pay_currency_id ? paySym  : (baseCurrency?.symbol || "Ref.");
  const fmt = (usd) => `${infoSym}${(Number(usd || 0) * infoRate).toFixed(2)}`;

  return (
    <Modal open={!!purchase} onClose={onClose} title="PAGAR A PROVEEDOR" width={440}>

      {/* Resumen de la compra */}
      <div className="rounded-xl bg-white/[0.02] dark:bg-white/[0.04] border border-border/10 dark:border-white/[0.06] p-4 mb-5 space-y-1.5">
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

        {/* Diario de pago. Desplegable y no botones: con varios diarios cargados la fila se
            desbordaba y empujaba el resto del formulario fuera de la vista. */}
        <Field label="DIARIO DE PAGO *">
          <CustomSelect
            value={form.payment_journal_id === "" ? "" : String(form.payment_journal_id)}
            placeholder="Seleccionar diario..."
            options={outflowJournals.map(j => ({ value: String(j.id), label: j.name }))}
            onChange={(v) => {
              // El id vuelve a número: el resto del formulario compara con j.id sin convertir.
              const id = parseInt(v, 10);
              const j = activeJournals.find(x => x.id === id);
              if (!j) return;
              const newCurId = j.currency_id || baseCurrency?.id;
              const newCur   = activeCurrencies.find(c => c.id === parseInt(newCurId));
              const newRate  = (!newCur || newCur.is_base) ? 1 : parseFloat(newCur.exchange_rate || 1);
              const newAmt   = (balanceUsd * newRate).toFixed(2);
              setForm(p => ({
                ...p,
                payment_journal_id: id,
                pay_currency_id:    newCurId || p.pay_currency_id,
                // Otra moneda, otra tasa: la escrita para la anterior no aplica.
                exchange_rate:      "",
                received_amount:    newAmt,
              }));
            }}
          />
        </Field>

        {/* Tasa del pago. Al cambiarla se rehace el monto propuesto, que sale del saldo en base. */}
        {payCur && !payCur.is_base && (
          <Field label={`TASA DE CAMBIO (${payCur.code})`}>
            <RateField
              value={form.exchange_rate}
              configuredRate={payCurRate}
              currency={payCur}
              onChange={(v) => {
                const nextRate = resolveRate(v, payCurRate);
                const prevProposed = (balanceUsd * payRate).toFixed(2);
                setForm(p => ({
                  ...p,
                  exchange_rate: v,
                  // Igual que al elegir diario: solo se repropone si no lo editaron a mano.
                  received_amount: p.received_amount === prevProposed
                    ? (balanceUsd * nextRate).toFixed(2)
                    : p.received_amount,
                }));
              }}
            />
          </Field>
        )}

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
            className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
          />
          {payCur && !payCur.is_base && amountBase > 0 && (
            <p className="text-[10px] font-bold text-success mt-1">
              ≈ {baseCurrency?.symbol}{amountBase.toFixed(2)} {baseCurrency?.code} · tasa {payRate}
            </p>
          )}
          {isCapped && (
            <p className="text-[10px] font-bold text-warning mt-1">
              Excede el saldo ({baseCurrency?.symbol || "Ref."}{balanceUsd.toFixed(2)}). El excedente quedará como egreso adicional.
            </p>
          )}
        </Field>

        {/* Fecha */}
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
