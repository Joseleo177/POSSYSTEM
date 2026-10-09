import { useState, useMemo, useRef } from "react";
import Modal from "../ui/Modal";
import DatePicker from "../ui/DatePicker";
import JournalPickerButton from "../cobro/JournalPickerButton";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { fmtBase, todayISO, saleTotalAtRate, journalsForSales, fmtDateShort } from "../../helpers";
import Money from "../ui/Money";
import Segmented from "../ui/Segmented";
import RateField, { resolveRate } from "../ui/RateField";
import { Spinner } from "../ui/Spinner";

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
  const { notify, baseCurrency, activeJournals: allActiveJournals, activeCurrencies } = useApp();
  const [form, setForm] = useState({
    amount: "",
    journal_id: "",
    // Vacío = la tasa del sistema de la moneda del diario. Solo se llena si el cajero la
    // escribe a mano para este cobro, igual que en el cobro de una factura suelta.
    rate: "",
    reference_date: todayISO(),
    reference_number: "",
    notes: "",
    // Qué se hace con lo que el cliente entregó de más.
    surplus_mode: "devolver",   // devolver | caja | credito
    // Salidas del vuelto: una por caja. Empieza con una y se agregan las que hagan falta.
    change_parts: [{ journal_id: "", amount: "" }],
    // Pago combinado: >=2 formas de pago para el lote, cada una con su caja/monto (en la
    // moneda de esa caja) /referencia. El sobrante se descuenta del último tramo.
    pay_parts: [],
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

  // Si las facturas son de sucursales distintas, solo caben los diarios compartidos: no hay
  // una sola sucursal contra la que cobrar.
  const activeJournals = journalsForSales(allActiveJournals, ordenadas);

  const journal  = activeJournals.find(j => j.id === form.journal_id);
  const currency = journal?.currency_id ? activeCurrencies.find(c => c.id === parseInt(journal.currency_id)) : null;
  // Tasa de configuración de esa moneda, y la que de verdad rige este cobro.
  //
  // Faltaba poder escribirla, y hace la misma falta que en el cobro de una factura suelta: el
  // cliente que trae tres cuentas viejas paga con la tasa del día en que paga, no con la que
  // estaba cargada cuando se emitieron. Sin esto había que mover la tasa global —a todo el
  // mundo— para registrar un cobro. Vale solo para este lote: viaja en payments.exchange_rate
  // y es la que usan el arqueo y los reportes para convertir ESTOS movimientos.
  const rateConfig = (!currency || currency.is_base) ? 1 : parseFloat(currency.exchange_rate || 1);
  const rate       = (!currency || currency.is_base) ? 1 : resolveRate(form.rate, rateConfig);
  const sym        = currency?.symbol || baseCurrency?.symbol || "Ref.";

  // ── Pago combinado ──────────────────────────────────────────────────────────
  const combinado = (form.pay_parts?.length || 0) >= 2;
  const round6 = (n) => Math.round((parseFloat(n) || 0) * 1e6) / 1e6;
  const partesComb = (form.pay_parts || []).map(p => {
    const j = activeJournals.find(x => x.id === p.journal_id);
    const cur = j?.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : baseCurrency;
    const r = (!cur || cur.is_base) ? 1 : parseFloat(cur.exchange_rate || 1);
    const n = parseFloat(String(p.amount).replace(",", "."));
    return {
      ...p, j, cur, rate: r,
      sym: cur?.symbol || baseCurrency?.symbol || "Ref.",
      isCash: j?.type === "efectivo",
      num: n,
      base: !isNaN(n) && n > 0 ? (r === 1 ? Math.round(n * 100) / 100 : round6(n / r)) : 0,
    };
  });
  const recibidoComb = round6(partesComb.reduce((a, s) => a + s.base, 0));
  const noUltimoComb = round6(partesComb.slice(0, -1).reduce((a, s) => a + s.base, 0));
  const combParteFalta = partesComb.some(s => !s.journal_id || !(s.base > 0));
  // La referencia de cada tramo es OPCIONAL, igual que en el cobro simple.
  const combNoUltimoExcede = noUltimoComb > deudaTotal + 0.10;

  const amountLocal = combinado ? recibidoComb : (parseFloat(String(form.amount).replace(",", ".")) || 0);
  const amountBase  = combinado ? recibidoComb : (amountLocal / rate);

  const fmtP = (n) => fmtBase(n, baseCurrency);
  // Montos en la moneda con la que se está cobrando: es la que el cajero cuenta.
  const fmtPago = (n) => `${sym} ${(parseFloat(n) || 0).toFixed(2)}`;
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
  // Recibe la tasa como parámetro para poder calcular el monto sugerido con la moneda del
  // diario que se acaba de elegir, antes de que el estado del formulario se haya actualizado.
  const saldoEnMonedaDePagoAt = (s, r) => {
    const saldoBase = parseFloat(s.balance || 0);
    if (!(r > 1)) return round2(saldoBase);

    const hist = parseFloat(s.exchange_rate) > 1 ? parseFloat(s.exchange_rate) : r;
    const totalBs = saleTotalAtRate(s, r);
    const cobrado = round2(parseFloat(s.amount_paid || 0) * hist)
      + round2(parseFloat(s.total_returned || 0) * hist)
      + round2(parseFloat(s.forgiven_amount || 0) * hist);
    return Math.max(0, round2(totalBs - cobrado));
  };

  // Lo que hay que pedirle al cliente, en la moneda con la que va a pagar.
  const deudaEnPagoAt = (r) => round2(ordenadas.reduce((acc, s) => acc + saldoEnMonedaDePagoAt(s, r), 0));
  const saldoEnMonedaDePago = (s) => saldoEnMonedaDePagoAt(s, rate);
  const deudaEnPago = deudaEnPagoAt(rate);

  // Lo que falta por cubrir en el pago combinado, en la moneda de una caja de tasa `r` y sin
  // contar el tramo `idx`. En bolívares se resta de la deuda línea por línea (deudaEnPagoAt),
  // la misma que se le pide al cliente; en la base, de la deuda oficial. Restarlo siempre en
  // la base partía de saldos redondeados a dos decimales y sugería unos bolívares de menos
  // (Bs.1215,35 donde faltaban Bs.1219,62).
  const faltaEnMoneda = (partes, idx, r) => {
    const ya = (partes || []).reduce((a, q, i) => {
      if (i === idx) return a;
      const n = parseFloat(String(q.amount).replace(",", "."));
      if (isNaN(n) || n <= 0) return a;
      const jj = activeJournals.find(x => x.id === q.journal_id);
      const cc = jj?.currency_id ? activeCurrencies.find(c => c.id === parseInt(jj.currency_id)) : baseCurrency;
      const rr = (!cc || cc.is_base) ? 1 : parseFloat(cc.exchange_rate || 1);
      if (r > 1) return a + (rr === r ? round2(n) : round2((n / rr) * r));
      return a + (rr === 1 ? round2(n) : n / rr);
    }, 0);
    return r > 1
      ? Math.max(0, round2(deudaEnPagoAt(r) - ya))
      : Math.max(0, round2(deudaTotal - ya));
  };

  // Lo que el cliente entregó por encima de la deuda y hay que decidir qué hacer con ello.
  //
  // El umbral es la misma tolerancia de diez céntimos que usa el resto del sistema, y no una
  // cifra menor: pagando en bolívares el cajero redondea al billete (Bs.15968 por una deuda de
  // Bs.15967,90) y eso no es un vuelto que declarar, es el redondeo de la moneda. Esos
  // céntimos se registran como parte del cobro —el dinero recibido es el que entró a la caja—
  // y el servidor se los aplica a la última factura del reparto.
  // La resta se hace en la moneda del cobro, que es donde el cajero cuenta el dinero: pasar
  // primero a Ref y restar allá vuelve a meter el error de redondeo que se acaba de evitar.
  // En combinado se resta la deuda EXACTA en base (la misma que usa el servidor), sin
  // redondear factura por factura: si no, el `surplus_kept` que se manda no coincide con el
  // sobrante que el servidor calcula y rechaza el cobro por unos milésimos.
  const sobrantePago = combinado
    ? Math.max(0, round6(recibidoComb - deudaTotal))
    : Math.max(0, round2(amountLocal - deudaEnPago));
  const sobrante     = combinado ? sobrantePago : parseFloat((sobrantePago / rate).toFixed(6));
  const haySobrante  = sobrante > 0.10;

  // Tasa y símbolo de la caja de una salida de vuelto: cada tramo se escribe en la moneda de
  // SU caja, que es la que el cajero está contando al entregarlo.
  const datosCaja = (journalId) => {
    const j = journalId ? activeJournals.find(x => x.id === journalId) : null;
    const cur = j?.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : null;
    const r = (!cur || cur.is_base) ? 1 : parseFloat(cur.exchange_rate || 1);
    return { journal: j, rate: r, sym: cur?.symbol || baseCurrency?.symbol || "Ref." };
  };

  // El vuelto puede salir de VARIAS cajas: sin sencillo en divisas se devuelven 5$ en efectivo
  // y el resto en bolívares. Cada tramo sale de la gaveta por la que salió de verdad; cargarlo
  // todo a una dejaría esa corta y la otra larga.
  const salidas = (form.change_parts || []).map(p => {
    const { rate: r, sym: s } = datosCaja(p.journal_id);
    const tecleado = parseFloat(String(p.amount).replace(",", "."));
    const montoPago = Number.isFinite(tecleado) && tecleado >= 0 ? round2(tecleado) : 0;
    return { ...p, rate: r, sym: s, montoPago, montoBase: parseFloat((montoPago / r).toFixed(6)) };
  });

  const vueltoBase = parseFloat(salidas.reduce((acc, s) => acc + s.montoBase, 0).toFixed(6));
  // Lo que el cliente no se llevó: se queda en la caja y se registra como tal en el cobro.
  const restoEnCaja = Math.max(0, parseFloat((sobrante - vueltoBase).toFixed(6)));
  // Devolver más de lo que sobró sería sacar plata de la caja sin motivo: el servidor lo
  // rechaza y acá se avisa antes de intentarlo.
  const vueltoExcedido = vueltoBase > sobrante + 0.10;
  const faltaCajaEnSalida = salidas.some(s => s.montoPago > 0 && !s.journal_id);

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

  // Devolver el vuelto exige decir de qué caja sale cada tramo: es dinero que sale de una
  // gaveta concreta, y sin eso el arqueo de esa caja no cuadra.
  const faltaDiarioCambio = haySobrante && form.surplus_mode === "devolver"
    && (faltaCajaEnSalida || vueltoBase <= 0);
  const canSubmit = !loading && form.reference_date && amountBase > 0
    && !faltaDiarioCambio && !vueltoExcedido
    && (combinado
      ? (!combParteFalta && !combNoUltimoExcede)
      : !!form.journal_id);

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
        // Simple: monto único en base + su diario. Combinado: un tramo por forma de pago.
        ...(combinado ? {
          pay_parts: partesComb.map(s => ({
            journal_id:       s.journal_id,
            payment_method:   s.payment_method || null,
            amount:           s.base,
            currency_id:      s.cur?.id || null,
            exchange_rate:    s.rate,
            reference_number: s.reference?.trim() || null,
          })),
        } : {
          amount:             parseFloat(amountBase.toFixed(6)),
          currency_id:        currency?.id || null,
          exchange_rate:      rate,
          payment_journal_id: form.journal_id,
          payment_method:     form.payment_method || null,
        }),
        reference_date:     form.reference_date,
        reference_number:   combinado ? null : (form.reference_number || null),
        notes:              form.notes || null,
        // El sobrante viaja con su destino declarado; el servidor rechaza el cobro si sobra
        // dinero sin decir a dónde va.
        // Cada tramo del vuelto con su caja: el servidor registra un egreso por cada una.
        change_parts:      haySobrante && form.surplus_mode === "devolver"
          ? salidas.filter(s => s.montoBase > 0).map(s => ({ journal_id: s.journal_id, payment_method: s.payment_method || null, amount: s.montoBase }))
          : undefined,
        // Al devolver, lo que no se entregó se queda en la caja: sin esto el servidor vería un
        // sobrante sin destino y rechazaría el cobro.
        surplus_kept:      haySobrante && form.surplus_mode === "caja"     ? parseFloat(sobrante.toFixed(6))
                         : haySobrante && form.surplus_mode === "devolver" && restoEnCaja > 0.0001 ? restoEnCaja
                         : undefined,
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

  // Lo que ya se va a cubrir con lo tecleado, para el pie del reparto.
  const aplicadoTotal = round2(reparto.reduce((a, r) => a + r.aplica, 0));
  // El botón dice cuánto se cobra: es lo último que el cajero lee antes de confirmar.
  const montoBoton = combinado ? (recibidoComb > 0 ? fmtP(recibidoComb) : "") : (amountLocal > 0 ? fmtPago(amountLocal) : "");

  // Reparto: qué se salda y qué queda debiendo (contexto de solo lectura → lateral).
  const repartoBulk = (
    <div>
      <p className="text-[13px] font-semibold text-content dark:text-white">Cómo se reparte</p>
      <p className="text-[12px] text-content-subtle mb-2">De la más antigua a la más reciente</p>
      <div className="rounded-xl border border-border/70 dark:border-white/[0.08] overflow-hidden">
        <div className="divide-y divide-border/60 dark:divide-white/[0.06] lg:max-h-64 lg:overflow-y-auto">
          {reparto.map(({ sale, saldo, aplica, queda, salda }) => {
            const pct = saldo > 0 ? Math.min(100, (aplica / saldo) * 100) : 0;
            return (
              <div key={sale.id} className="px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums truncate">
                    {sale.invoice_number || `#${sale.id}`}
                  </span>
                  <Money value={fmtPago(saldo)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                </div>
                <div className="flex items-center justify-between gap-3 mt-0.5 text-[12px] tabular-nums">
                  <span className="text-content-subtle">{fmtDateShort(sale.created_at)}</span>
                  {salda ? (
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      Queda saldada
                    </span>
                  ) : aplica > 0 ? (
                    <span className="font-medium text-amber-700 dark:text-amber-400">Queda debiendo {fmtPago(queda)}</span>
                  ) : (
                    <span className="text-content-subtle">Sin cubrir</span>
                  )}
                </div>
                {/* Cuánto de su saldo cubre este cobro. */}
                <div className="mt-2 h-1 rounded-full bg-surface-3 dark:bg-white/[0.08] overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${salda ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-3.5 py-2.5 border-t border-border/60 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02] flex items-center justify-between text-[12px] tabular-nums">
          <span className="text-content-subtle">Se aplica</span>
          <span className="font-semibold text-content dark:text-white">{fmtPago(aplicadoTotal)} <span className="font-normal text-content-subtle">de {fmtPago(deudaEnPago)}</span></span>
        </div>
      </div>
    </div>
  );

  return (
    <Modal open={!!sales?.length} onClose={onClose} title={`Cobrar ${ordenadas.length} ${ordenadas.length === 1 ? "factura" : "facturas"}`} width={880}>

      {/* ── Cabecera: a quién y cuánto ── */}
      <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] text-content-subtle">Cliente</p>
          <p className="text-[15px] font-semibold text-content dark:text-white truncate">{customer?.name || "—"}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[12px] text-content-subtle">Total a cobrar</p>
          <Money value={rate > 1 ? fmtPago(deudaEnPago) : fmtP(deudaTotal)} className="block text-[22px] font-bold tracking-tight text-content dark:text-white leading-tight" />
          {rate > 1 && <Money value={`≈ ${fmtP(deudaTotal)}`} className="block text-[12px] text-content-subtle" />}
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">

        {/* ── Columna principal: lo que se teclea ── */}
        <div className="min-w-0 space-y-4">

        {/* ── Pago combinado: varias formas de pago para el lote ── */}
        {combinado && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className={LABEL}>Formas de pago</p>
              <button type="button" onClick={() => setForm(p => ({ ...p, pay_parts: [] }))}
                className="h-7 px-2 -mr-2 rounded-md text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                Volver a pago simple
              </button>
            </div>
            <div className="space-y-2.5">
              {partesComb.map((s, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <JournalPickerButton
                        value={s.journal_id || ""}
                        journals={activeJournals}
                        placeholder="Forma de pago…"
                        boxClassName="rounded-lg"
                        methodPrompt={{ tag: "Cobro conjunto", title: "¿Cómo paga esta parte?" }}
                        onSelect={(j) => setForm(p => {
                          const parts = [...p.pay_parts];
                          const cur = j?.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : baseCurrency;
                          const r = (!cur || cur.is_base) ? 1 : parseFloat(cur.exchange_rate || 1);
                          // Se sugiere lo que falta por cubrir, en la moneda de esta caja.
                          parts[idx] = { ...parts[idx], journal_id: j.id, payment_method: j.payment_method || null, amount: faltaEnMoneda(parts, idx, r).toFixed(2) };
                          return { ...p, pay_parts: parts };
                        })}
                      />
                    </div>
                    <div className="w-28 sm:w-32 shrink-0 relative">
                      <Prefijo>{s.sym}</Prefijo>
                      <input
                        type="text" inputMode="decimal"
                        value={s.amount}
                        placeholder="0.00"
                        onChange={e => setForm(p => {
                          const parts = [...p.pay_parts];
                          parts[idx] = { ...parts[idx], amount: e.target.value.replace(/[^\d.,]/g, "") };
                          return { ...p, pay_parts: parts };
                        })}
                        className={`${INPUT} pl-11 text-right font-semibold tabular-nums`}
                      />
                    </div>
                    {partesComb.length >= 2 && (
                      <button type="button"
                        onClick={() => setForm(p => {
                          const rest = p.pay_parts.filter((_, i) => i !== idx);
                          if (rest.length >= 2) return { ...p, pay_parts: rest };
                          const only = rest[0] || { journal_id: "", amount: "", reference: "" };
                          return {
                            ...p,
                            pay_parts: [],
                            journal_id: only.journal_id || "",
                            payment_method: only.payment_method || null,
                            amount: only.amount || "",
                            reference_number: only.reference || "",
                            rate: "",
                            change_parts: [{ journal_id: "", amount: "" }],
                          };
                        })}
                        className={QUITAR}
                        title="Quitar esta forma de pago" aria-label="Quitar esta forma de pago">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                  {s.cur && !s.cur.is_base && s.base > 0 && (
                    <p className="text-[12px] text-content-subtle tabular-nums">≈ {fmtP(s.base)} · tasa {s.rate}</p>
                  )}
                  {s.journal_id && !s.isCash && (
                    <input
                      type="text"
                      value={s.reference || ""}
                      onChange={e => setForm(p => {
                        const parts = [...p.pay_parts];
                        parts[idx] = { ...parts[idx], reference: e.target.value };
                        return { ...p, pay_parts: parts };
                      })}
                      placeholder="N° de referencia (opcional)"
                      className={`${INPUT} !h-9`}
                    />
                  )}
                </div>
              ))}
            </div>
            {combNoUltimoExcede && (
              <p className="text-[12px] font-medium text-red-600 dark:text-red-400 mt-1.5">Solo la última forma de pago puede pasarse de la deuda</p>
            )}
            <button type="button"
              onClick={() => setForm(p => ({ ...p, pay_parts: [...p.pay_parts, { journal_id: "", amount: "", reference: "" }] }))}
              className={`${AGREGAR} mt-2.5`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
              Otra forma de pago
            </button>
            <p className="mt-2.5 pt-2.5 border-t border-border/60 dark:border-white/[0.06] text-[12px] text-content-subtle tabular-nums">
              Recibido <span className="font-semibold text-content dark:text-white">{fmtP(recibidoComb)}</span> de {fmtP(deudaTotal)}
            </p>
          </div>
        )}

        {!combinado && (<>
        <Field label="Cómo paga">
          <JournalPickerButton
            value={form.journal_id}
            journals={activeJournals}
            placeholder="Elegir método de pago…"
            boxClassName="rounded-lg"
            methodPrompt={{ tag: "Cobro conjunto", title: "¿Cómo paga el cliente?" }}
            onSelect={(j) => {
              const cur = j?.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : null;
              const r = (!cur || cur.is_base) ? 1 : parseFloat(cur.exchange_rate || 1);
              // Elegir el método deja el monto listo, igual que en el cobro de una factura:
              // el caso corriente es cobrar la deuda completa, y cambiar de diario cambia de
              // moneda, así que la cifra se recalcula con la tasa de la moneda nueva.
              setForm(p => ({
                ...p,
                journal_id: j.id,
                payment_method: j.payment_method || null,
                amount: deudaEnPagoAt(r).toFixed(2),
                // La tasa escrita a mano era de la moneda anterior: arrastrarla convertiría
                // este cobro a un número que no tiene nada que ver.
                rate: "",
                // El vuelto se replantea con la moneda nueva: sus montos eran de la anterior.
                change_parts: [{ journal_id: "", amount: "" }],
              }));
            }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto recibido">
            <div className="relative">
              <Prefijo>{sym}</Prefijo>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value.replace(/[^\d.,]/g, "") }))}
                placeholder={deudaEnPago.toFixed(2)}
                className={`${INPUT} pl-11 text-[14px] font-semibold tabular-nums`}
              />
            </div>
            {rate !== 1 && amountLocal > 0 && (
              <p className="text-[12px] text-content-subtle tabular-nums mt-1">≈ {fmtP(amountBase)}</p>
            )}
          </Field>
          <Field label="Fecha del cobro">
            <DatePicker
              value={form.reference_date}
              onChange={v => setForm(p => ({ ...p, reference_date: v }))}
              clearable={false}
              className="w-full"
            />
          </Field>
        </div>

        {/* Solo cuando se cobra en otra moneda: en la base no hay nada que convertir. */}
        {currency && !currency.is_base && (
          <Field label="Tasa de cambio">
            <RateField
              value={form.rate}
              onChange={v => setForm(p => ({
                ...p,
                rate: v,
                // El monto sigue a la tasa mientras sea la deuda completa: cambiar la tasa sin
                // recalcularlo dejaba en pantalla una cifra que ya no saldaba lo seleccionado.
                amount: p.amount === "" || parseFloat(String(p.amount).replace(",", ".")) === round2(deudaEnPagoAt(rate))
                  ? deudaEnPagoAt(resolveRate(v, rateConfig)).toFixed(2)
                  : p.amount,
              }))}
              configuredRate={rateConfig}
              currency={currency}
            />
          </Field>
        )}

        {journal?.type !== "efectivo" && (
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

        {/* Pasar a pago combinado: el tramo 1 hereda el método elegido. */}
        {form.journal_id && (
          <button
            type="button"
            onClick={() => setForm(p => {
              const j = activeJournals.find(x => x.id === p.journal_id);
              const isCashJ = j?.type === "efectivo";
              return {
                ...p,
                journal_id: "", amount: "", rate: "",
                pay_parts: [
                  { journal_id: p.journal_id, amount: p.amount || "", reference: isCashJ ? "" : (p.reference_number || "") },
                  { journal_id: "", amount: "", reference: "" },
                ],
              };
            })}
            className={AGREGAR}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
            Combinar con otra forma de pago
          </button>
        )}
        </>)}

        {combinado && (
          <Field label="Fecha del cobro">
            <DatePicker
              value={form.reference_date}
              onChange={v => setForm(p => ({ ...p, reference_date: v }))}
              clearable={false}
              className="w-full"
            />
          </Field>
        )}

        {/* Sobrante: el cliente entregó de más y hay que decir qué se hace con eso. */}
        {haySobrante && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-content dark:text-white">Sobran {fmtP(sobrante)}</p>
                <p className="text-[12px] text-content-subtle">El cliente entregó más de lo que debe</p>
              </div>
            </div>

            <Segmented
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              value={form.surplus_mode}
              onChange={modo => setForm(p => ({ ...p, surplus_mode: modo }))}
              options={[
                { key: "devolver", label: "Dar vuelto" },
                { key: "caja",     label: "Queda en caja" },
                { key: "credito",  label: "A su crédito" },
              ]}
            />

            {form.surplus_mode === "devolver" && (
              <div className="space-y-2">
                <p className={LABEL}>Sale de</p>

                {salidas.map((salida, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <JournalPickerButton
                        value={salida.journal_id}
                        journals={activeJournals}
                        outflowOnly
                        boxClassName="rounded-lg"
                        placeholder="Caja del vuelto…"
                        methodPrompt={{ tag: "Dar cambio", title: "¿De qué caja sale el vuelto?" }}
                        onSelect={(j) => setForm(p => {
                          const partes = [...p.change_parts];
                          const id = j.id;
                          const { rate: r } = datosCaja(id);
                          // Al elegir la caja se sugiere lo que falta por devolver, convertido
                          // a su moneda: en la primera es el sobrante entero, en la siguiente
                          // solo el resto.
                          const yaAsignado = partes.reduce((acc, q, i) => {
                            if (i === idx) return acc;
                            const { rate: rr } = datosCaja(q.journal_id);
                            const n = parseFloat(String(q.amount).replace(",", "."));
                            return acc + (Number.isFinite(n) ? n / rr : 0);
                          }, 0);
                          const falta = Math.max(0, sobrante - yaAsignado);
                          partes[idx] = { journal_id: id, payment_method: j.payment_method || null, amount: round2(falta * r).toFixed(2) };
                          return { ...p, change_parts: partes };
                        })}
                      />
                    </div>
                    <div className="w-28 sm:w-32 shrink-0 relative">
                      <Prefijo>{salida.sym}</Prefijo>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={salida.amount}
                        onChange={e => setForm(p => {
                          const partes = [...p.change_parts];
                          partes[idx] = { ...partes[idx], amount: e.target.value.replace(/[^\d.,]/g, "") };
                          return { ...p, change_parts: partes };
                        })}
                        placeholder="0.00"
                        className={`${INPUT} pl-11 text-right font-semibold tabular-nums`}
                      />
                    </div>
                    {salidas.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setForm(p => ({ ...p, change_parts: p.change_parts.filter((_, i) => i !== idx) }))}
                        className={QUITAR}
                        title="Quitar esta salida" aria-label="Quitar esta salida"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}

                {/* Sin sencillo en una sola moneda: parte en divisas y parte en bolívares. */}
                {restoEnCaja > 0.0001 && (
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, change_parts: [...p.change_parts, { journal_id: "", amount: "" }] }))}
                    className={AGREGAR}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 4v16m8-8H4" /></svg>
                    Devolver el resto desde otra caja
                  </button>
                )}

                <div className="flex items-center justify-between gap-2 text-[12px] tabular-nums">
                  <span className="text-content-subtle">Entregado {fmtP(vueltoBase)} de {fmtP(sobrante)}</span>
                  {vueltoExcedido ? (
                    <span className="font-medium text-red-600 dark:text-red-400">Supera el sobrante</span>
                  ) : restoEnCaja > 0.0001 ? (
                    <span className="font-medium text-amber-700 dark:text-amber-400">Quedan {fmtP(restoEnCaja)} en caja</span>
                  ) : null}
                </div>
              </div>
            )}

            <p className="text-[12px] text-content-subtle leading-relaxed">
              {form.surplus_mode === "devolver"
                ? "Entra el monto completo y sale el vuelto: la caja queda con lo que cubre las facturas."
                : form.surplus_mode === "caja"
                ? "El sobrante se queda en la caja junto al cobro. No se aplica a ninguna factura."
                : `Queda como saldo a favor de ${customer?.name || "el cliente"} para su próxima compra.`}
            </p>
          </div>
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
          {repartoBulk}
        </aside>
      </div>

      <div className="flex gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
        <button onClick={onClose} className="btn-outline h-11 px-5 rounded-lg text-[13px] font-medium">
          Cancelar
        </button>
        <button onClick={submit} disabled={!canSubmit}
          className="btn-accent flex-1 h-11 rounded-lg text-[14px] font-semibold active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 tabular-nums">
          {loading && <Spinner />}
          {loading ? "Registrando…" : montoBoton ? `Cobrar ${montoBoton}` : "Confirmar cobro"}
        </button>
      </div>
    </Modal>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
const LABEL   = "text-[12px] font-medium text-content-subtle";
const INPUT   = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";
const AGREGAR = "w-full h-9 rounded-lg border border-dashed border-border dark:border-white/15 text-[12px] font-medium text-content-subtle hover:text-content hover:border-content-subtle/60 dark:hover:text-white dark:hover:border-white/30 transition-colors flex items-center justify-center gap-1.5";
const QUITAR  = "w-10 h-10 shrink-0 rounded-lg border border-border dark:border-white/10 text-content-subtle hover:text-red-600 hover:border-red-500/40 dark:hover:text-red-400 transition-colors flex items-center justify-center";

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
