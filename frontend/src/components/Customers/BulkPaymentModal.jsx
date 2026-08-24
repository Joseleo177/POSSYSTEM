import { useState, useMemo, useRef } from "react";
import Modal from "../ui/Modal";
import CustomSelect from "../ui/CustomSelect";
import DatePicker from "../ui/DatePicker";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { fmtBase, todayISO, saleTotalAtRate } from "../../helpers";

/**
 * Cobro de varias facturas del mismo cliente con un solo monto.
 *
 * El cliente paga una vez —trae cuentas viejas y quiere saldar todo junto— pero adentro se
 * registra un cobro por factura: cada una es un documento fiscal con su propio saldo. El
 * reparto va de la más vieja a la más nueva, y esta pantalla lo muestra ANTES de confirmar
 * para que el cajero vea cuáles se cierran y cuál queda con abono.
 *
 * El monto se escribe en la moneda del diario elegido, igual que en la devolución de crédito
 * y en el cobro de una factura suelta; al servidor viaja en moneda base.
 */
export default function BulkPaymentModal({ customer, sales, onClose, onSuccess }) {
  const { notify, baseCurrency, activeJournals, activeCurrencies } = useApp();
  const [form, setForm] = useState({
    amount: "",
    journal_id: "",
    reference_date: todayISO(),
    reference_number: "",
    notes: "",
    // Qué se hace con lo que el cliente entregó de más.
    surplus_mode: "devolver",   // devolver | caja | credito
    change_journal_id: "",
  });
  const [loading, setLoading] = useState(false);
  // Una clave por lote: si la respuesta se pierde y el cajero reintenta, el servidor reconoce
  // el cobro en vez de registrarlo dos veces sobre cada factura.
  const keyRef = useRef(null);

  // De la más vieja a la más nueva: mismo orden con el que el servidor imputa.
  const ordenadas = useMemo(
    () => [...(sales || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [sales]
  );
  const deudaTotal = ordenadas.reduce((acc, s) => acc + parseFloat(s.balance || 0), 0);

  const journal  = activeJournals.find(j => j.id === form.journal_id);
  const currency = journal?.currency_id ? activeCurrencies.find(c => c.id === parseInt(journal.currency_id)) : null;
  const rate     = (!currency || currency.is_base) ? 1 : parseFloat(currency.exchange_rate || 1);
  const sym      = currency?.symbol || baseCurrency?.symbol || "Ref.";

  const amountLocal = parseFloat(String(form.amount).replace(",", ".")) || 0;
  const amountBase  = amountLocal / rate;

  const fmtP = (n) => fmtBase(n, baseCurrency);
  // Montos en la moneda con la que se está cobrando: es la que el cajero cuenta.
  const fmtPago = (n) => `${sym}${(parseFloat(n) || 0).toFixed(2)}`;
  const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

  // Saldo de una factura en la moneda del cobro.
  //
  // No es `saldo en Ref × tasa`: el sistema valora una venta en bolívares redondeando CADA
  // LÍNEA a dos decimales y sumando después (saleTotalAtRate, el mismo helper que usan la caja
  // y el cobro de una factura suelta). Las dos cuentas difieren en céntimos —3 unidades a
  // 4,06569 dan 12,21 por un lado y 12,197 por el otro—, y usar el atajo hacía que este modal
  // pidiera un importe distinto al que muestra el resto del sistema para la misma factura.
  //
  // Lo ya cobrado se convierte a la tasa de su día, no a la de hoy: es el dinero que entró.
  const saldoEnMonedaDePago = (s) => {
    const saldoBase = parseFloat(s.balance || 0);
    if (!(rate > 1)) return round2(saldoBase);

    const hist = parseFloat(s.exchange_rate) > 1 ? parseFloat(s.exchange_rate) : rate;
    const totalBs = saleTotalAtRate(s, rate);
    const cobrado = round2(parseFloat(s.amount_paid || 0) * hist)
      + round2(parseFloat(s.total_returned || 0) * hist)
      + round2(parseFloat(s.forgiven_amount || 0) * hist);
    return Math.max(0, round2(totalBs - cobrado));
  };

  // Lo que hay que pedirle al cliente, en la moneda con la que va a pagar.
  const deudaEnPago = round2(ordenadas.reduce((acc, s) => acc + saldoEnMonedaDePago(s), 0));

  // Lo que el cliente entregó por encima de la deuda y hay que decidir qué hacer con ello.
  //
  // El umbral es la misma tolerancia de diez céntimos que usa el resto del sistema, y no una
  // cifra menor: pagando en bolívares el cajero redondea al billete (Bs.15968 por una deuda de
  // Bs.15967,90) y eso no es un vuelto que declarar, es el redondeo de la moneda. Esos
  // céntimos se registran como parte del cobro —el dinero recibido es el que entró a la caja—
  // y el servidor se los aplica a la última factura del reparto.
  // La resta se hace en la moneda del cobro, que es donde el cajero cuenta el dinero: pasar
  // primero a Ref y restar allá vuelve a meter el error de redondeo que se acaba de evitar.
  const sobrantePago = Math.max(0, round2(amountLocal - deudaEnPago));
  const sobrante     = parseFloat((sobrantePago / rate).toFixed(6));
  const haySobrante  = sobrante > 0.10;

  // Diario del que sale el vuelto: puede ser otro distinto al del cobro (se recibe en divisas
  // y se devuelve en bolívares).
  const changeJournal  = form.change_journal_id ? activeJournals.find(j => j.id === form.change_journal_id) : null;
  const changeCurrency = changeJournal?.currency_id ? activeCurrencies.find(c => c.id === parseInt(changeJournal.currency_id)) : null;
  const changeRate     = (!changeCurrency || changeCurrency.is_base) ? 1 : parseFloat(changeCurrency.exchange_rate || 1);
  const changeSym      = changeCurrency?.symbol || baseCurrency?.symbol || "Ref.";

  // Vista previa del reparto. La cuenta la vuelve a hacer el servidor —es quien manda—, pero
  // el cajero necesita ver a dónde va el dinero antes de aceptar, no después.
  // Todo en la moneda del cobro, para que las cifras de esta lista sean las mismas que el
  // cajero está contando y sumen exactamente el monto recibido.
  const reparto = useMemo(() => {
    let restante = haySobrante ? deudaEnPago : amountLocal;
    return ordenadas.map(s => {
      const saldo = saldoEnMonedaDePago(s);
      const aplica = Math.max(0, Math.min(restante, saldo));
      restante = round2(restante - aplica);
      const queda = round2(saldo - aplica);
      return { sale: s, saldo, aplica, queda, salda: queda <= 0.01 && aplica > 0 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenadas, amountLocal, deudaEnPago, haySobrante, rate]);

  // Devolver el vuelto exige decir de qué caja sale: es dinero que sale de una gaveta concreta.
  const faltaDiarioCambio = haySobrante && form.surplus_mode === "devolver" && !form.change_journal_id;
  const canSubmit = !loading && form.journal_id && form.reference_date && amountBase > 0 && !faltaDiarioCambio;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    if (!keyRef.current) {
      keyRef.current = crypto?.randomUUID?.() ?? `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    try {
      const res = await api.payments.createBulk({
        idempotency_key:    keyRef.current,
        sale_ids:           ordenadas.map(s => s.id),
        amount:             parseFloat(amountBase.toFixed(6)),
        currency_id:        currency?.id || null,
        exchange_rate:      rate,
        payment_journal_id: form.journal_id,
        reference_date:     form.reference_date,
        reference_number:   form.reference_number || null,
        notes:              form.notes || null,
        // El sobrante viaja con su destino declarado; el servidor rechaza el cobro si sobra
        // dinero sin decir a dónde va.
        change_given:      haySobrante && form.surplus_mode === "devolver" ? parseFloat(sobrante.toFixed(6)) : undefined,
        change_journal_id: haySobrante && form.surplus_mode === "devolver" ? form.change_journal_id : undefined,
        surplus_kept:      haySobrante && form.surplus_mode === "caja"     ? parseFloat(sobrante.toFixed(6)) : undefined,
        change_to_credit:  haySobrante && form.surplus_mode === "credito"  ? parseFloat(sobrante.toFixed(6)) : undefined,
      });
      if (res.duplicated) notify("Ese cobro ya estaba registrado");
      else {
        const cerradas = res.settled_count === res.applied.length
          ? `${res.applied.length} ${res.applied.length === 1 ? "factura saldada" : "facturas saldadas"}`
          : `Cobro aplicado a ${res.applied.length} facturas · ${res.settled_count} saldadas`;
        // El vuelto se recuerda en el aviso: es lo que el cajero tiene que entregar ahora.
        const vuelto = res.change_given > 0 ? ` · Entregar ${fmtP(res.change_given)} de vuelto` : "";
        notify(cerradas + vuelto);
      }
      keyRef.current = null;
      onSuccess?.(res);
    } catch (e) {
      // La clave se conserva: el reintento debe llevar la misma.
      notify(e.message, "err");
    }
    setLoading(false);
  };

  return (
    <Modal open={!!sales?.length} onClose={onClose} title="COBRAR VARIAS FACTURAS" width={520}>

      {/* Resumen */}
      <div className="rounded-xl bg-white/[0.02] dark:bg-white/[0.04] border border-border/10 dark:border-white/[0.06] p-4 mb-4 space-y-1.5">
        <Row label="Cliente" value={customer?.name || "—"} />
        <Row label="Facturas" value={String(ordenadas.length)} />
        <div className="border-t border-border/20 dark:border-white/5 pt-1.5 mt-1.5">
          <Row
            label="Deuda seleccionada"
            value={rate > 1 ? `${sym}${deudaEnPago.toFixed(2)}` : fmtP(deudaTotal)}
            valueClass="text-danger font-black"
          />
          {/* Con la caja en bolívares, el equivalente en la moneda base va debajo: el importe
              que se cobra es el de arriba, calculado línea por línea como en el resto del POS. */}
          {rate > 1 && (
            <Row label="Equivalente" value={fmtP(deudaTotal)} valueClass="text-content-subtle dark:text-white/40" />
          )}
        </div>
      </div>

      <div className="space-y-4">

        <Field label="MÉTODO DE PAGO *">
          <CustomSelect
            value={form.journal_id === "" ? "" : String(form.journal_id)}
            placeholder="Seleccionar método..."
            options={activeJournals.map(j => ({ value: String(j.id), label: j.name }))}
            onChange={(v) => setForm(p => ({ ...p, journal_id: v === "" ? "" : parseInt(v, 10), amount: "" }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`MONTO RECIBIDO * (${sym})`}>
            <input
              type="text"
              inputMode="decimal"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value.replace(/[^\d.,]/g, "") }))}
              placeholder={deudaEnPago.toFixed(2)}
              className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
            />
          </Field>
          <Field label="FECHA DE REFERENCIA *">
            <DatePicker
              value={form.reference_date}
              onChange={v => setForm(p => ({ ...p, reference_date: v }))}
              className="w-full"
            />
          </Field>
        </div>

        <button
          type="button"
          onClick={() => setForm(p => ({ ...p, amount: deudaEnPago.toFixed(2) }))}
          disabled={!form.journal_id}
          className="w-full h-9 rounded-xl border border-brand-500/30 text-brand-500 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Pagar todo · {sym}{deudaEnPago.toFixed(2)}
        </button>

        {rate !== 1 && amountLocal > 0 && (
          <p className="text-[10px] font-bold text-content-subtle dark:text-white/30 tabular-nums -mt-1">
            ≈ {fmtP(amountBase)} a la tasa del sistema
          </p>
        )}

        {journal?.type !== "efectivo" && (
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

        {/* Reparto: qué se salda y qué queda debiendo */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">
            Cómo se aplica · de la más antigua a la más reciente
          </p>
          <div className="rounded-xl border border-border/20 dark:border-white/[0.08] divide-y divide-border/10 dark:divide-white/5 max-h-48 overflow-y-auto">
            {reparto.map(({ sale, saldo, aplica, queda, salda }) => (
              <div key={sale.id} className="px-3.5 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-bold text-content dark:text-white truncate">
                    {sale.invoice_number || `#${sale.id}`}
                  </div>
                  <div className="text-[10px] font-bold text-content-subtle dark:text-white/30">
                    {new Date(sale.created_at).toLocaleDateString("es-VE")} · debe {fmtPago(saldo)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[12px] font-black tabular-nums ${aplica > 0 ? "text-success" : "text-content-subtle dark:text-white/20"}`}>
                    {aplica > 0 ? fmtPago(aplica) : "—"}
                  </div>
                  <div className={`text-[9px] font-black uppercase tracking-wide ${salda ? "text-success" : queda > 0 ? "text-warning" : "text-content-subtle dark:text-white/20"}`}>
                    {salda ? "Salda" : aplica > 0 ? `Queda ${fmtPago(queda)}` : "Sin cubrir"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sobrante: el cliente entregó de más y hay que decir qué se hace con eso. */}
        {haySobrante && (
          <div className="rounded-xl border-2 border-warning/30 bg-warning/5 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-warning">Sobrante</span>
              <span className="text-sm font-black text-warning tabular-nums">{fmtP(sobrante)}</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                ["devolver", "Dar vuelto"],
                ["caja",     "Queda en caja"],
                ["credito",  "A su crédito"],
              ].map(([modo, etiqueta]) => (
                <button
                  key={modo}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, surplus_mode: modo }))}
                  className={`h-9 rounded-xl border text-[10px] font-black uppercase tracking-wide transition-all ${
                    form.surplus_mode === modo
                      ? "border-warning bg-warning text-black"
                      : "border-border/30 dark:border-white/10 text-content-subtle dark:text-white/40 hover:border-warning/60"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>

            {form.surplus_mode === "devolver" && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">
                  Sale de *
                </p>
                <CustomSelect
                  value={form.change_journal_id === "" ? "" : String(form.change_journal_id)}
                  placeholder="Caja del vuelto..."
                  options={activeJournals.map(j => ({ value: String(j.id), label: j.name }))}
                  onChange={(v) => setForm(p => ({ ...p, change_journal_id: v === "" ? "" : parseInt(v, 10) }))}
                />
                {form.change_journal_id && changeRate !== 1 && (
                  <p className="text-[10px] font-bold text-content-subtle dark:text-white/30 mt-1 tabular-nums">
                    Entregar {changeSym}{(sobrante * changeRate).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            <p className="text-[10px] font-bold text-content-subtle dark:text-white/40 leading-relaxed">
              {form.surplus_mode === "devolver"
                ? "Entra el monto completo y sale el vuelto: la caja queda con lo que cubre las facturas."
                : form.surplus_mode === "caja"
                ? "El sobrante se queda en la caja junto al cobro. No se aplica a ninguna factura."
                : `Queda como saldo a favor de ${customer?.name || "el cliente"} para su próxima compra.`}
            </p>
          </div>
        )}

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

      <div className="flex gap-2.5 mt-6 pt-4 border-t border-border/20 dark:border-white/5">
        <button onClick={onClose}
          className="flex-1 h-10 rounded-xl border border-border/40 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white hover:border-border dark:hover:border-white/20 transition-all">
          Cancelar
        </button>
        <button onClick={submit} disabled={!canSubmit}
          className="flex-[2] h-10 rounded-xl bg-success text-black text-[11px] font-black uppercase tracking-wide transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed">
          {loading ? "Registrando..." : "Confirmar cobro"}
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
