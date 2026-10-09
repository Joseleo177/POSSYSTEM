import { useState } from "react";
import { Spinner } from "../ui/Spinner";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import Modal from "../ui/Modal";
import DatePicker from "../ui/DatePicker";
import JournalPickerButton from "../cobro/JournalPickerButton";
import RateField, { resolveRate } from "../ui/RateField";
import { todayISO, journalsForWarehouse, fmtDateShort, toNameCase } from "../../helpers";
import Money from "../ui/Money";

const getEmpty = () => ({
  received_amount: "",
  // Vacío = tasa de configuración de la moneda del diario. Lo tecleado vale solo para este pago.
  exchange_rate: "",
  reference_date: todayISO(),
  reference_number: "",
  notes: "",
  payment_journal_id: "",
  payment_method: "",
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
        payment_method:     form.payment_method || null,
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
  const fmt    = (usd) => `${infoSym} ${(Number(usd || 0) * infoRate).toFixed(2)}`;
  const fmtRef = (usd) => `${baseCurrency?.symbol || "Ref."} ${Number(usd || 0).toFixed(2)}`;

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
  const aplicadoTotal = reparto.reduce((a, r) => a + r.abono, 0);

  // El botón dice cuánto sale: es lo último que se lee antes de confirmar.
  const montoBoton = receivedNum > 0 ? `${paySym} ${receivedNum.toFixed(2)}` : "";

  // Pago conjunto: cada compra con su saldo y lo que le toca de este pago.
  const repartoCompras = (
    <div>
      <p className="text-[13px] font-semibold text-content dark:text-white">Cómo se reparte</p>
      <p className="text-[12px] text-content-subtle mb-2">Primero la que vence antes</p>
      <div className="rounded-xl border border-border/70 dark:border-white/[0.08] overflow-hidden">
        <div className="divide-y divide-border/60 dark:divide-white/[0.06] lg:max-h-64 lg:overflow-y-auto">
          {reparto.map(({ p, abono, salda }) => {
            const saldo = balanceOf(p);
            const pct = saldo > 0 ? Math.min(100, (abono / saldo) * 100) : 0;
            return (
              <div key={p.id} className="px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums">Compra #{p.id}</span>
                  <Money value={fmt(saldo)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                </div>
                <div className="flex items-center justify-between gap-3 mt-0.5 text-[12px] tabular-nums">
                  <span className="text-content-subtle whitespace-nowrap">
                    {p.due_date ? `Vence ${fmtDateShort(p.due_date)}` : "Sin vencimiento"}
                  </span>
                  <Resultado salda={salda} abono={abono} queda={saldo - abono} hayMonto={amountBase > 0} fmt={fmt} />
                </div>
                <Barra pct={pct} salda={salda} />
              </div>
            );
          })}
        </div>
        <div className="px-3.5 py-2.5 border-t border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02] flex items-center justify-between text-[12px] tabular-nums">
          <span className="text-content-subtle">Se paga</span>
          <span className="font-semibold text-content dark:text-white">{fmt(aplicadoTotal)} <span className="font-normal text-content-subtle">de {fmt(balanceUsd)}</span></span>
        </div>
      </div>
    </div>
  );

  // Una sola compra: el antes y el después, con la barra de lo pagado sobre el total.
  const totalCompra = parseFloat(purchase?.total || 0) || (paidBeforeBase + balanceUsd);
  const pctAntes    = totalCompra > 0 ? Math.min(100, (paidBeforeBase / totalCompra) * 100) : 0;
  const pctDespues  = totalCompra > 0 ? Math.min(100, (paidTotalBase / totalCompra) * 100) : 0;
  const comoQueda = (
    <div>
      <p className="text-[13px] font-semibold text-content dark:text-white">Cómo queda la compra</p>
      <p className="text-[12px] text-content-subtle mb-2 tabular-nums">
        Compra #{purchase?.id}{purchase?.due_date ? ` · vence ${fmtDateShort(purchase.due_date)}` : ""}
      </p>
      <div className="rounded-xl border border-border/70 dark:border-white/[0.08] px-3.5 py-3">
        <div className="space-y-1.5 text-[13px]">
          <Linea label="Total de la compra" value={fmt(totalCompra)} />
          {paidBeforeBase > 0 && <Linea label="Ya pagado" value={fmt(paidBeforeBase)} />}
          <Linea label="Este pago" value={amountBase > 0 ? fmt(amountBase) : "—"} />
        </div>
        {/* Lo pagado antes va tenue; lo que suma este pago, en su color. */}
        <div className="relative mt-3 h-1.5 rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden">
          <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${settles ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pctDespues}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-content-subtle/50" style={{ width: `${pctAntes}%` }} />
        </div>
        <div className="mt-3 pt-2.5 border-t border-border/60 dark:border-white/[0.06] flex items-baseline justify-between gap-3">
          {amountBase <= 0 ? (
            <>
              <span className="text-[13px] text-content-subtle">Saldo por pagar</span>
              <Money value={fmt(balanceUsd)} className="text-[15px] font-semibold text-content dark:text-white" />
            </>
          ) : settles ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              Queda saldada
            </span>
          ) : (
            <>
              <span className="text-[13px] font-medium text-amber-700 dark:text-amber-400">Queda debiendo</span>
              <Money value={fmt(remainingBase)} className="text-[15px] font-semibold text-amber-700 dark:text-amber-400" />
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Modal open={!!purchase} onClose={onClose} title={isBulk ? `Pagar ${list.length} compras` : "Pagar a proveedor"} width={860}>

      {/* ── Cabecera: a quién y cuánto ── */}
      <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] text-content-subtle">Proveedor</p>
          <p className="text-[15px] font-semibold text-content dark:text-white truncate">{toNameCase(purchase?.supplier_name) || "—"}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[12px] text-content-subtle">{isBulk ? `Saldo de ${list.length} compras` : "Saldo por pagar"}</p>
          <Money value={fmt(balanceUsd)} className="block text-[22px] font-bold tracking-tight text-content dark:text-white leading-tight" />
          {infoRate !== 1 && <Money value={`≈ ${fmtRef(balanceUsd)}`} className="block text-[12px] text-content-subtle" />}
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">

        {/* ── Columna principal: lo que se teclea ── */}
        <div className="min-w-0 space-y-4">

        {/* Botonera método → banco → caja, filtrada a diarios con salidas: al proveedor no se
            le paga por un Punto de Venta. */}
        <Field label="De qué caja sale">
          <JournalPickerButton
            value={form.payment_journal_id}
            journals={outflowJournals}
            outflowOnly
            placeholder="Elegir caja o banco…"
            boxClassName="rounded-lg"
            methodPrompt={{ tag: "Pago a proveedor", title: "¿De qué caja sale el pago?" }}
            onSelect={(j) => {
              const newCurId = j.currency_id || baseCurrency?.id;
              const newCur   = activeCurrencies.find(c => c.id === parseInt(newCurId));
              const newRate  = (!newCur || newCur.is_base) ? 1 : parseFloat(newCur.exchange_rate || 1);
              const newAmt   = (balanceUsd * newRate).toFixed(2);
              setForm(p => ({
                ...p,
                payment_journal_id: j.id,
                payment_method:     j.payment_method || "",
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
          <Field label="Tasa de cambio">
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

        <div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto a pagar">
              <div className="relative">
                <Prefijo>{paySym}</Prefijo>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.received_amount}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d.,]/g, "");
                    setForm(p => ({ ...p, received_amount: val }));
                  }}
                  placeholder="0.00"
                  className={`${INPUT} pl-11 text-[14px] font-semibold tabular-nums`}
                />
              </div>
            </Field>
            <Field label="Fecha del pago">
              <DatePicker
                value={form.reference_date}
                onChange={v => setForm(p => ({ ...p, reference_date: v }))}
                clearable={false}
                className="w-full"
              />
            </Field>
          </div>
          {payCur && !payCur.is_base && amountBase > 0 && (
            <p className="text-[12px] text-content-subtle tabular-nums mt-1">≈ {fmtRef(amountBase)} · tasa {payRate}</p>
          )}
          {isCapped && (
            <p className="text-[12px] font-medium text-amber-700 dark:text-amber-400 mt-1">
              Pasa del saldo ({fmtRef(balanceUsd)}): el excedente sale como un egreso aparte.
            </p>
          )}
        </div>

        {/* N° de referencia (oculto si es efectivo) */}
        {!isCash && (
          <Field label="N° de referencia" hint="Opcional">
            <input
              type="text"
              value={form.reference_number}
              onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))}
              placeholder="Ej: 000123456"
              className={INPUT}
            />
          </Field>
        )}

        <Field label="Notas" hint="Opcional">
          <input
            type="text"
            value={form.notes}
            onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Observaciones…"
            className={INPUT}
          />
        </Field>
        </div>
        {/* ── fin columna principal ── */}

        {/* ── Columna lateral: contexto de solo lectura ── */}
        <aside className="min-w-0 lg:border-l lg:border-border/60 dark:lg:border-white/[0.06] lg:pl-6">
          {isBulk ? repartoCompras : comoQueda}
        </aside>
      </div>

      <div className="flex gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
        <button onClick={onClose} className="btn-outline h-11 px-5 rounded-lg text-[13px] font-medium">
          Cancelar
        </button>
        <button onClick={submit} disabled={!canSubmit}
          className="btn-accent flex-1 h-11 rounded-lg text-[14px] font-semibold active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 tabular-nums">
          {loading && <Spinner />}
          {loading ? "Registrando…" : montoBoton ? `Pagar ${montoBoton}` : "Confirmar pago"}
        </button>
      </div>
    </Modal>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
const LABEL = "text-[12px] font-medium text-content-subtle";
const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";

// Símbolo de la moneda dentro del campo, a la izquierda: la cifra queda sola y se lee mejor.
const Prefijo = ({ children }) => (
  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{children}</span>
);

function Field({ label, hint, children }) {
  return (
    <div>
      <p className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={LABEL}>{label}</span>
        {hint && <span className="text-[11px] text-content-subtle/70">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

function Linea({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-content-subtle">{label}</span>
      <Money value={value} className="font-medium text-content dark:text-white" />
    </div>
  );
}

// Color = señal: verde solo con el visto, ámbar para lo que queda a medias, gris lo demás.
function Resultado({ salda, abono, queda, hayMonto, fmt }) {
  if (salda) return (
    <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
      Queda saldada
    </span>
  );
  if (abono > 0) return <span className="font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">Queda debiendo {fmt(queda)}</span>;
  return <span className="text-content-subtle whitespace-nowrap">{hayMonto ? "No alcanza" : "Sin pagar"}</span>;
}

function Barra({ pct, salda }) {
  return (
    <div className="mt-2 h-1 rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden">
      <div className={`h-full rounded-full transition-all ${salda ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
