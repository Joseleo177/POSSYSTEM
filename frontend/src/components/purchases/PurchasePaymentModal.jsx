import { useState } from "react";
import { Spinner } from "../ui/Spinner";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import Modal from "../ui/Modal";
import DatePicker from "../ui/DatePicker";
import JournalPickerButton from "../cobro/JournalPickerButton";
import RateField, { resolveRate } from "../ui/RateField";
import { todayISO, journalsForWarehouse, fmtDateShort } from "../../helpers";

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
 *   purchases – en lugar de `purchase`: varias compras del mismo proveedor y sucursal para un
 *               pago conjunto (una transferencia, un egreso). Con una sola, es un pago normal.
 *   onClose   – fn para cerrar
 *   onSuccess – fn(res) llamada tras pago exitoso
 */
export default function PurchasePaymentModal({ purchase: single, purchases, onClose, onSuccess }) {
  const { notify, baseCurrency, activeCurrencies, activeJournals: allActiveJournals, outflowJournals: allOutflowJournals } = useApp();
  // Mismo orden en que el servidor imputa: la que vence primero, y a igual vencimiento la más
  // vieja. Así lo que se ve aquí es exactamente lo que va a quedar.
  const list = (purchases?.length ? [...purchases] : [single].filter(Boolean))
    .sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")) || a.id - b.id);
  const isBulk   = list.length > 1;
  const purchase = list[0];
  // Solo los diarios de la sucursal que recibió la compra (más los compartidos): la cuenta de
  // otra tienda no es donde salió este pago.
  const activeJournals  = journalsForWarehouse(allActiveJournals, purchase?.warehouse_id);
  const outflowJournals = journalsForWarehouse(allOutflowJournals, purchase?.warehouse_id);
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

  const balanceOf  = (p) => parseFloat(p?.balance ?? p?.total ?? 0);
  const balanceUsd = parseFloat(list.reduce((acc, p) => acc + balanceOf(p), 0).toFixed(6));

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
      const body = {
        amount:             amountBase,
        currency_id:        payCur?.id || null,
        exchange_rate:      payRate,
        payment_journal_id: parseInt(form.payment_journal_id),
        reference_date:     form.reference_date,
        reference_number:   form.reference_number?.trim() || null,
        notes:              form.notes?.trim() || null,
      };
      let res;
      if (isBulk) {
        res = await api.purchases.createBulkPayment({ ...body, purchase_ids: list.map(p => p.id) });
        const saldadas = (res.data?.applied || []).filter(a => a.payment_status === "pagado").length;
        notify(`Pago conjunto registrado: ${saldadas} de ${list.length} compras saldadas`);
      } else {
        res = await api.purchases.createPayment(purchase.id, body);
        if (res.payment_status === "pagado") notify("¡Compra pagada completamente!");
        else notify("Abono registrado correctamente");
      }
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

  // Cómo queda la compra tras este pago.
  const paidBeforeBase = list.reduce((acc, p) => acc + parseFloat(p?.amount_paid || 0), 0);
  const paidTotalBase  = paidBeforeBase + amountBase;
  const remainingBase  = Math.max(0, balanceUsd - amountBase);
  const settles        = amountBase > 0 && remainingBase <= 0.01;

  // Cómo se reparte el monto entre las compras, en el mismo orden que el servidor.
  let porRepartir = amountBase;
  const reparto = list.map(p => {
    const abono = Math.max(0, Math.min(porRepartir, balanceOf(p)));
    porRepartir -= abono;
    return { p, abono, salda: abono > 0 && balanceOf(p) - abono <= 0.01 };
  });

  // Pago conjunto: cada compra con su saldo y lo que le toca de este pago.
  const resumenCompra = isBulk ? (
    <div className="rounded-xl bg-white/[0.02] dark:bg-white/[0.04] border border-border/10 dark:border-white/[0.06] p-4 space-y-1.5">
      {purchase.supplier_name && <Row label="Proveedor" value={purchase.supplier_name} />}
      <div className="border-t border-border/20 dark:border-white/5 pt-1.5 mt-1.5 space-y-1.5">
        {reparto.map(({ p, abono, salda }) => (
          <div key={p.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[12px] font-bold text-content dark:text-white">#{p.id}</span>
              {p.due_date && <span className="text-[11px] font-semibold text-content-subtle dark:text-white/40 ml-1.5">vence {fmtDateShort(p.due_date)}</span>}
              {amountBase > 0 && (
                <span className={`block text-[11px] font-semibold ${salda ? "text-success" : abono > 0 ? "text-warning" : "text-content-subtle/60"}`}>
                  {salda ? "Se salda" : abono > 0 ? `Abona ${fmt(abono)}` : "No alcanza"}
                </span>
              )}
            </div>
            <span className="text-[12px] font-bold tabular-nums text-content dark:text-white shrink-0">{fmt(balanceOf(p))}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-border/20 dark:border-white/5 pt-1.5 mt-1.5">
        <Row label={`Saldo de ${list.length} compras`} value={fmt(balanceUsd)} valueClass="text-danger font-bold" />
      </div>
    </div>
  ) : (
    <div className="rounded-xl bg-white/[0.02] dark:bg-white/[0.04] border border-border/10 dark:border-white/[0.06] p-4 space-y-1.5">
      {purchase.supplier_name && <Row label="Proveedor" value={purchase.supplier_name} />}
      <Row label="Compra" value={`#${purchase.id}`} />
      <Row label="Total compra" value={fmt(purchase.total)} />
      {purchase.amount_paid > 0 && (
        <Row label="Ya pagado" value={fmt(purchase.amount_paid)} valueClass="text-success" />
      )}
      <div className="border-t border-border/20 dark:border-white/5 pt-1.5 mt-1.5">
        <Row label="Saldo pendiente" value={fmt(balanceUsd)} valueClass="text-danger font-bold" />
      </div>
    </div>
  );

  return (
    <Modal open={!!purchase} onClose={onClose} title={isBulk ? `Pago conjunto · ${list.length} compras` : "Pagar a proveedor"} width={820}>
      <div className="flex flex-col lg:flex-row lg:gap-6">

        {/* ── Columna principal: lo que se teclea ── */}
        <div className="flex-1 min-w-0 space-y-4">

        {/* Botonera método → banco → caja, filtrada a diarios con salidas: al proveedor no se
            le paga por un Punto de Venta. */}
        <Field label="DIARIO DE PAGO *">
          <JournalPickerButton
            value={form.payment_journal_id}
            journals={outflowJournals}
            methodPrompt={{ tag: "Pago a proveedor", title: "¿De qué caja sale el pago?" }}
            onSelect={(j) => {
              const newCurId = j.currency_id || baseCurrency?.id;
              const newCur   = activeCurrencies.find(c => c.id === parseInt(newCurId));
              const newRate  = (!newCur || newCur.is_base) ? 1 : parseFloat(newCur.exchange_rate || 1);
              const newAmt   = (balanceUsd * newRate).toFixed(2);
              setForm(p => ({
                ...p,
                payment_journal_id: j.id,
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
            className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-semibold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
          />
          {payCur && !payCur.is_base && amountBase > 0 && (
            <p className="text-[11px] font-semibold text-success mt-1">
              ≈ {baseCurrency?.symbol}{amountBase.toFixed(2)} {baseCurrency?.code} · tasa {payRate}
            </p>
          )}
          {isCapped && (
            <p className="text-[11px] font-semibold text-warning mt-1">
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
              className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-semibold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
            />
          </Field>
        )}
        </div>
        {/* ── fin columna principal ── */}

        {/* ── Columna lateral: contexto de solo lectura ── */}
        <aside className="lg:w-[290px] shrink-0 space-y-4 mt-5 lg:mt-0 lg:border-l lg:border-border/20 dark:lg:border-white/5 lg:pl-6">

          {resumenCompra}

          {amountBase > 0 && (
            <div className={`rounded-xl border p-3.5 space-y-1.5 ${settles ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`}>
              <div className="text-[12px] font-medium text-content-subtle dark:text-white/40">
                Después de este pago
              </div>
              <Row label="Total pagado" value={fmt(paidTotalBase)} valueClass="text-success font-bold" />
              <div className="border-t border-border/20 dark:border-white/5 pt-1.5">
                <Row
                  label={settles ? (isBulk ? "Compras saldadas" : "Compra saldada") : "Saldo restante"}
                  value={fmt(settles ? 0 : remainingBase)}
                  valueClass={`font-bold ${settles ? "text-success" : "text-warning"}`}
                />
              </div>
            </div>
          )}

          {/* Notas */}
          <Field label="NOTAS">
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Observaciones..."
              className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-semibold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
            />
          </Field>
        </aside>
      </div>

      {/* Acciones */}
      <div className="flex gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
        <button onClick={onClose}
          className="flex-1 h-10 rounded-xl border border-border/40 dark:border-white/10 text-[12px] font-bold text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white hover:border-border dark:hover:border-white/20 transition-all">
          Cancelar
        </button>
        <button onClick={submit} disabled={!canSubmit}
          className="flex-[2] h-10 rounded-xl btn-accent text-[12px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {loading && <Spinner />}
          {loading ? "Registrando..." : "Confirmar pago"}
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, value, valueClass = "text-content dark:text-white" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] font-semibold text-content-subtle dark:text-white/40">{label}</span>
      <span className={`text-[12px] font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[12px] font-medium text-content-subtle dark:text-white/50 mb-1.5">{label}</p>
      {children}
    </div>
  );
}
