import { useState, useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import Modal from "./ui/Modal";
import { saleTotalAtRate, todayISO, PAYMENT_TOLERANCE } from "../helpers";
import DatePicker from "./ui/DatePicker";
import CustomSelect from "./ui/CustomSelect";
import RateField, { resolveRate } from "./ui/RateField";
import { journalsForWarehouse } from "../helpers";

const getEmpty = () => ({
  amount: "",
  // Vacío = la tasa del sistema de la moneda con la que se cobra. Solo se llena si el cajero
  // la escribe a mano para este pago.
  rate: "",
  reference_date: todayISO(),
  reference_number: "",
  notes: "",
  payment_journal_id: "",
  pay_currency_id: "",
  // Cambio
  received_amount: "",
  // Salidas del vuelto: una por caja. Se agregan las que hagan falta cuando no hay sencillo.
  change_parts: [{ journal_id: "", amount: "" }],
  keep_change: false,
  credit_change: false,
});

export default function PaymentFormModal({ sale, onClose, onSuccess }) {
  const { notify, baseCurrency, activeCurrencies, activeJournals: allActiveJournals, can } = useApp();
  // Solo los diarios de la sucursal de esta venta (más los compartidos): un cajero de la
  // sucursal A no debe poder cobrar contra la caja de la B.
  const activeJournals = journalsForWarehouse(allActiveJournals, sale?.warehouse_id);
  const [form, setForm] = useState(getEmpty);
  const [loading, setLoading] = useState(false);
  // Clave de idempotencia del cobro en curso (ver submit).
  const payKeyRef = useRef(null);
  const [customerCredit, setCustomerCredit] = useState(0);
  const [creditToApply, setCreditToApply] = useState("");
  // Exonerar el saldo: perdonar lo que falta en vez de cobrarlo. Vive en este modal porque es
  // la otra forma de cerrar la misma cuenta, y es acá donde el cajero ya tiene el saldo
  // delante — no en una pantalla aparte a la que habría que ir a buscar la factura.
  const [forgiveMode, setForgiveMode] = useState(false);
  const [forgiveReason, setForgiveReason] = useState("");

  useEffect(() => {
    if (!sale?.customer_id) { setCustomerCredit(0); setCreditToApply(""); return; }
    // Solo lo que esta sucursal puede aplicar: lo compartido más lo que ella misma generó. El
    // crédito de otra sucursal no cuenta acá (ver creditLedger.js en el backend).
    api.customers.getOne(sale.customer_id, sale.warehouse_id ? { warehouse_id: sale.warehouse_id } : {})
      .then(r => setCustomerCredit(parseFloat(r.data?.credit_available ?? r.data?.credit_balance ?? 0)))
      .catch(() => setCustomerCredit(0));
  }, [sale?.customer_id, sale?.warehouse_id]);

  const displayCur = activeCurrencies.find(c => !c.is_base) || baseCurrency;
  const defaultRate = (!displayCur || displayCur.is_base) ? 1 : parseFloat(displayCur.exchange_rate || 1);
  const defaultSym = displayCur?.symbol || baseCurrency?.symbol || "Ref.";

  const payCur = activeCurrencies.find(c => c.id === parseInt(form.pay_currency_id));
  const payCurRate = (!payCur || payCur.is_base) ? 1 : parseFloat(payCur.exchange_rate || 1);
  // Tasa de ESTE cobro. Arranca en la del sistema y se puede escribir a mano: la deuda se pacta
  // en divisas y el cliente paga con la tasa del día en que paga, que no siempre es la que está
  // cargada —una factura vieja se cobra semanas después, o el negocio trabaja con una tasa y el
  // cliente transfiere a la del BCV—. Sin esto había que cambiar la tasa global, a todo el
  // mundo, para poder registrar un solo pago.
  //
  // Vale solo para este pago: se guarda en payments.exchange_rate, que es la tasa con la que el
  // arqueo y los reportes convierten ese movimiento. No toca la tasa del sistema ni el valor
  // fiscal de la factura, que sigue siendo su total en moneda base.
  //
  // Lo que en su momento rompió el cuadre no fue la tasa manual en sí, sino mezclarla: el total
  // se convertía con la tecleada y lo ya pagado con la oficial. Por eso `pendingBsAt` convierte
  // ahora TODOS sus términos con la misma tasa (ver más abajo).
  const payRate = (!payCur || payCur.is_base) ? 1 : resolveRate(form.rate, payCurRate);
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
  // El resumen se muestra a la tasa con la que se va a cobrar: si el cajero la escribe a mano,
  // el saldo en Bs tiene que moverse con ella o el monto prellenado deja de cuadrar con el
  // "Saldo pendiente" de arriba. Cobrando en moneda base manda la de configuración.
  const bsRate = (payCur && !payCur.is_base)
    ? payRate
    : ((displayCur && !displayCur.is_base) ? defaultRate : 0);
  const hasBsRate = bsRate > 1;

  // Misma regla —y mismo helper— que usa SaleConfirmModal para pintar el total de la
  // venta: si cada modal la reimplementa, vuelven a divergir en un céntimo.
  const totalBsAt = (rate) => (sale?.items?.length && rate > 1)
    // El respaldo también respeta la tasa pedida: ignorarla y usar la de la factura hacía que
    // una venta sin líneas cargadas contradijera al resto de la pantalla.
    ? saleTotalAtRate(sale, rate)
    : roundBs2(parseFloat(sale?.total || 0) * (rate > 1 ? rate : historicalRate));
  // Lo exonerado se descuenta igual que lo cobrado y lo devuelto: es saldo que ya no se debe.
  // Sin esta línea, una factura con parte del saldo perdonado pedía en bolívares el importe
  // completo —el saldo en Ref sí lo descontaba— y la pantalla se contradecía consigo misma.
  //
  // Todos los términos se convierten con la MISMA tasa que el total. Restar bolívares
  // calculados a tasas distintas no da bolívares: el total iba a la tasa del cobro y lo ya
  // pagado a la de la factura, y en una factura vieja —o con la tasa escrita a mano— el
  // "Saldo pendiente" salía de una resta entre dos monedas que no eran la misma. La pregunta
  // que responde esta cifra es "a esta tasa, cuántos bolívares faltan", y esa se contesta con
  // una sola tasa.
  const pendingBsAt = (rate) => Math.max(0, roundBs2(totalBsAt(rate)
    - roundBs2(parseFloat(sale?.amount_paid     || 0) * rate)
    - roundBs2(parseFloat(sale?.total_returned  || 0) * rate)
    - roundBs2(parseFloat(sale?.forgiven_amount || 0) * rate)
    - roundBs2(creditApplied * rate)));

  const totalPreciseBs   = totalBsAt(bsRate);
  const pendingPreciseBs = pendingBsAt(bsRate);

  const isNonBasePay = payCur && !payCur.is_base;

  // Tope del cobro en la moneda del pago: en Bs el saldo línea por línea, en divisas el saldo
  // oficial en base. Ambos salen de la misma tasa del sistema, así que lo que pide la pantalla
  // coincide con lo que se registra.
  const maxInPayCur = isNonBasePay ? pendingPreciseBs : pendingAfterCredit;

  const receivedBase = !isNaN(receivedNum)
    ? (isNonBasePay ? receivedNum / payRate : round2(receivedNum / payRate))
    : 0;

  let amountBase = !isNaN(amountNum)
    ? (isNonBasePay ? amountNum / payRate : round2(amountNum / payRate))
    : 0;

  // Se registra el dinero que entró, ni un céntimo más.
  //
  // Antes, cobrando en divisas, un monto a menos de diez céntimos del saldo se subía al saldo
  // exacto: el cliente entregaba 5,00 por una factura de 5,10 y el sistema anotaba 5,10. La
  // gaveta quedaba con diez céntimos menos de los que decía la caja, en cada cobro.
  //
  // No hace falta inflarlo para cerrar la factura: el servidor la da por saldada cuando lo
  // cobrado llega al saldo menos la tolerancia (ver PAYMENT_TOLERANCE en utils/saleBalance),
  // que es justo el desfase de redondeo que este ajuste intentaba tapar. Lo único que se
  // conserva es el tope: no se aplica a la factura más de lo que debe.
  //
  // El tope se aplica en la moneda contra la que se cobró, no siempre en la base. Cobrando en
  // Bs la pantalla pide el saldo línea por línea (Bs.1895,00 = 2,4028 en base) mientras que el
  // saldo oficial es el total de la factura redondeado a dos decimales (2,40 = Bs.1892,79).
  // Recortar ahí el cobro registraba 2,4001 por 1895 bolívares recibidos: la gaveta quedaba con
  // 2,13 más de lo que decía la caja, en cada cobro completo. El input ya está topado contra
  // pendingPreciseBs, que es el tope correcto en esa moneda, y el servidor limita aparte lo que
  // se aplica a la factura (netCredit), así que el sobrante de redondeo no la sobrepaga.
  // Es el mismo criterio que ya usa `finalAmountBase` para el vuelto que se queda la caja.
  if (!isNonBasePay) amountBase = Math.min(amountBase, pendingAfterCredit + 0.0001);

  // Proyección de cómo queda la factura si se registra este pago. Se calcula sobre la
  // misma pista que el resumen de arriba: en Bs cuando hay tasa (pendingPreciseBs), en
  // la moneda base cuando no la hay, para que los números cuadren con "Saldo pendiente".
  //
  // `vistaBsRate` es la tasa con la que se pinta TODA la pista de bolívares: la del cobro
  // cuando se cobra en Bs (incluida la escrita a mano) y la del sistema cuando no. Mezclarla
  // con la de la factura era lo que descuadraba el recuadro "Después de este pago".
  const vistaBsRate = hasBsRate ? bsRate : historicalRate;
  const payAmountInBs = isNonBasePay
    ? (isNaN(amountNum) ? 0 : amountNum)
    : roundBs2(amountBase * vistaBsRate);
  const paidBeforeBase = parseFloat(sale?.amount_paid || 0);
  const paidTotalBase  = paidBeforeBase + amountBase;
  const paidTotalBs    = roundBs2(roundBs2(paidBeforeBase * vistaBsRate) + payAmountInBs);
  const remainingBase  = Math.max(0, pendingAfterCredit - amountBase);
  const remainingBs    = Math.max(0, roundBs2(pendingPreciseBs - payAmountInBs));

  // El saldo que queda se mide en la MISMA pista contra la que se topó el abono, y no siempre
  // en bolívares.
  //
  // Cobrando en divisas el abono se recorta al saldo oficial en base (19,80), mientras que el
  // saldo en Bs se calcula línea por línea (Bs.15.693,20, que son 20,00). Ese desfase de
  // redondeo —el mismo que tolera utils/saleBalance— aparecía como "Saldo restante Bs.156,87"
  // debajo de un campo que decía "PAGO COMPLETO A FACTURA": dos criterios distintos en la
  // misma pantalla, y el que mentía era este, porque el servidor da la factura por saldada.
  // La misma tolerancia que aplica el servidor al decidir si la factura queda saldada. Sin
  // esto la pantalla anunciaba "abono parcial" y un saldo de diez céntimos para un cobro que
  // el servidor iba a cerrar igual: dos veredictos distintos sobre el mismo pago.
  const settlesInvoice = isNonBasePay ? remainingBs < 0.01 : remainingBase <= PAYMENT_TOLERANCE;
  // Lo que se muestra: la cifra de la pista que manda, convertida a la moneda de pantalla. Si
  // la factura queda saldada el resto es cero, no los céntimos que absorbe la tolerancia.
  const remainingShown = settlesInvoice ? 0
    : (isNonBasePay ? remainingBs : roundBs2(remainingBase * vistaBsRate));

  // Sobrante calculado en la moneda de pago (570 - 561.22 = 8.78 exacto),
  // sin ida-y-vuelta por USD que acumula error de redondeo
  const changeInPayCur = (!isNaN(receivedNum) && receivedNum > 0 && pendingAfterCredit > 0 && receivedNum > (isNaN(amountNum) ? 0 : amountNum))
    ? parseFloat((receivedNum - (isNaN(amountNum) ? 0 : amountNum)).toFixed(2))
    : 0;
  const changeBase = changeInPayCur > 0 ? changeInPayCur / payRate : 0;
  const changeDisplay = changeInPayCur;

  // Tasa y símbolo de la caja de una salida de vuelto: cada tramo se escribe en la moneda de
  // SU caja, que es la que el cajero cuenta al entregarlo.
  const datosCaja = (journalId) => {
    const j = journalId ? activeJournals.find(x => x.id === journalId) : null;
    const cur = j?.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : null;
    const r = (!cur || cur.is_base) ? 1 : parseFloat(cur.exchange_rate || 1);
    return { journal: j, rate: r, sym: cur?.symbol || baseCurrency?.symbol || "Ref." };
  };

  // El vuelto puede salir de VARIAS cajas: sin sencillo en divisas se devuelven 2$ en efectivo
  // y los 0,66 restantes en bolívares. Cada tramo sale de la gaveta por la que salió de verdad.
  const salidasCambio = (form.change_parts || []).map(p => {
    const { rate: r, sym: s } = datosCaja(p.journal_id);
    const tecleado = parseFloat(String(p.amount).replace(",", "."));
    const montoPago = !isNaN(tecleado) && tecleado >= 0 ? roundBs2(tecleado) : 0;
    return { ...p, rate: r, sym: s, montoPago, montoBase: parseFloat((montoPago / r).toFixed(6)) };
  });

  const actualChangeBase = parseFloat(salidasCambio.reduce((acc, s) => acc + s.montoBase, 0).toFixed(6));
  const hayCajaDeCambio  = salidasCambio.some(s => s.journal_id && s.montoBase > 0);
  const faltaCajaEnCambio = salidasCambio.some(s => s.montoPago > 0 && !s.journal_id);
  // Lo que el cliente no se llevó porque no había sencillo: se queda en la caja. No se aplica
  // a la factura —el abono ya está topado al saldo— pero el dinero está ahí y hay que decirlo.
  const sobranteRetenido = Math.max(0, parseFloat((changeBase - actualChangeBase).toFixed(6)));

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
    if (changeBase > 0 && !form.keep_change && !form.credit_change && !hayCajaDeCambio) return notify("Selecciona el diario del que saldrá el cambio", "err");

    // Con "Quedarse", el abono aplicado es el que se cobró en la moneda del pago, no el saldo
    // oficial en base: ese saldo vale más bolívares que el precio cobrado (Bs.54383.84 contra
    // los Bs.54381.93 de la factura), así que recortar contra él inflaba el cobro y la caja
    // registraba Bs.54401.91 habiendo recibido Bs.54400. Aplicando el abono tal cual,
    // abono + sobrante suman exactamente lo recibido. En moneda base sí se recorta: ahí no hay
    // dos redondeos y el sobrante es lo que pasa del saldo.
    const finalAmountBase = form.keep_change
      ? (isNonBasePay ? amountBase : Math.min(receivedBase, pendingAfterCredit))
      : amountBase;
    const payAmountToSend = (changeBase > 0 && !form.keep_change && (hayCajaDeCambio || form.credit_change))
      ? receivedBase
      : finalAmountBase;

    setLoading(true);
    // Una clave por cobro, que sobrevive a los reintentos: si la respuesta se pierde por
    // red y el cajero vuelve a darle, el servidor reconoce el cobro y no lo registra dos
    // veces. Se renueva al cerrar el cobro con éxito, para que el siguiente abono a la
    // misma factura sí sea uno nuevo.
    if (!payKeyRef.current) {
      payKeyRef.current = crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    try {
      const res = await api.payments.create({
        idempotency_key:    payKeyRef.current,
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
        // Cada tramo del vuelto con su caja: el servidor registra un egreso por cada una.
        change_parts:       (changeBase > 0 && !form.keep_change && !form.credit_change)
          ? salidasCambio.filter(s => s.journal_id && s.montoBase > 0).map(s => ({ journal_id: s.journal_id, amount: s.montoBase }))
          : undefined,
        surplus_kept:       (changeBase > 0 && form.keep_change) ? changeBase : undefined,
        change_to_credit:   (changeBase > 0 && form.credit_change) ? changeBase : undefined,
        credit_amount:      creditApplied > 0 ? creditApplied : undefined,
      });
      // `duplicated` llega cuando el servidor reconoció un reintento: el cobro ya estaba
      // guardado. Se le dice al cajero para que no crea que se cobró dos veces.
      if (res.duplicated) notify("Ese cobro ya estaba registrado");
      else if (res.sale_status === "pagado") notify("¡Factura pagada completamente!");
      else notify("Pago parcial registrado");
      payKeyRef.current = null; // cobro cerrado: el próximo abono lleva clave nueva
      setForm(getEmpty());
      setCreditToApply("");
      onSuccess?.(res);
    } catch (e) {
      // La clave se conserva a propósito: el reintento debe llevar la misma.
      notify(e.message, "err");
    }
    setLoading(false);
  };

  // Exonerar el saldo pendiente. No pide diario ni fecha: no hay dinero que ubicar en ninguna
  // caja, solo una deuda que se deja de cobrar y el motivo por el que se dejó.
  const canForgive = can("sales.forgive")
    && balanceUsd > 0.10
    && !["pagado", "exonerado", "anulado", "devuelto"].includes(sale?.status);

  const submitForgive = async () => {
    const motivo = forgiveReason.trim();
    if (!motivo || loading) return;
    setLoading(true);
    try {
      const res = await api.sales.forgive(sale.id, motivo);
      notify(`Saldo exonerado: ${fmtBase(res.forgiven_now)}`);
      setForgiveMode(false);
      setForgiveReason("");
      onSuccess?.(res);
    } catch (e) {
      notify(e.message, "err");
    }
    setLoading(false);
  };

  const canSubmit = !loading && form.reference_date && (
    creditCoversAll ||
    (form.payment_journal_id && !isNaN(amountNum) && amountNum > 0 &&
      (changeBase <= 0 || form.keep_change || form.credit_change || (hayCajaDeCambio && !faltaCajaEnCambio)))
  );

  const fmt     = (usdAmt) => `${defaultSym}${(Number(usdAmt || 0) * historicalRate).toFixed(2)}`;
  const fmtBase = (usdAmt) => `${baseCurrency?.symbol || "Ref."}${Number(usdAmt || 0).toFixed(2)}`;

  // Pantalla de exoneración. Ocupa el modal entero en vez de ser un campo más del cobro:
  // perdonar el saldo no es una variante de pagar y no debe poder marcarse de paso.
  if (forgiveMode) return (
    <Modal open={!!sale} onClose={() => { setForgiveMode(false); setForgiveReason(""); }} title="EXONERAR SALDO" width={460}>

      <div className="rounded-xl bg-white/[0.02] dark:bg-white/[0.04] border border-border/10 dark:border-white/[0.06] p-4 mb-5 space-y-1.5">
        <Row label="Factura" value={sale.invoice_number || `#${sale.id}`} />
        {sale.customer_name && <Row label="Cliente" value={sale.customer_name} />}
        <Row label="Total" value={fmtBase(sale.total)} />
        {sale.amount_paid > 0 && <Row label="Ya pagado" value={fmtBase(sale.amount_paid)} valueClass="text-success" />}
        <div className="border-t border-border/20 dark:border-white/5 pt-1.5 mt-1.5">
          <Row label="Se dejará de cobrar" value={fmtBase(balanceUsd)} valueClass="text-violet-500 dark:text-violet-400 font-black" />
        </div>
      </div>

      <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3.5 mb-5">
        <p className="text-[11px] font-bold text-content-subtle dark:text-white/50 leading-relaxed">
          La factura queda cerrada como <span className="font-black text-violet-500 dark:text-violet-400">exonerada</span>: sale de
          cuentas por cobrar sin registrarse como cobrada. No devuelve mercancía al inventario ni genera
          crédito a favor del cliente. Se puede deshacer.
        </p>
      </div>

      <Field label="MOTIVO *">
        <input
          type="text"
          autoFocus
          maxLength={300}
          value={forgiveReason}
          onChange={e => setForgiveReason(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && forgiveReason.trim()) submitForgive(); }}
          placeholder="Ej: consumo del personal, diferencia de redondeo..."
          className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 dark:focus:border-brand-500/50 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
        />
      </Field>

      <div className="flex gap-2.5 mt-6 pt-4 border-t border-border/20 dark:border-white/5">
        <button onClick={() => { setForgiveMode(false); setForgiveReason(""); }}
          className="flex-1 h-10 rounded-xl border border-border/40 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white hover:border-border dark:hover:border-white/20 transition-all">
          Volver
        </button>
        <button onClick={submitForgive} disabled={loading || !forgiveReason.trim()}
          className="flex-[2] h-10 rounded-xl bg-violet-500 text-white text-[11px] font-black uppercase tracking-wide transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed">
          {loading ? "Exonerando..." : `Exonerar ${fmtBase(balanceUsd)}`}
        </button>
      </div>
    </Modal>
  );

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
              // Cambiar de método cambia de moneda: se recalcula con la tasa del sistema de la
              // moneda nueva, que es la única que se usa para valorar la factura.
              const newRate = isNonBase ? parseFloat(newCur.exchange_rate || 1) : 1;
              // En Bs → saldo calculado línea por línea (Bs.9000). En $ → saldo oficial (12.21).
              const newAmt = isNonBase ? pendingBsAt(newRate).toFixed(2) : pendingAfterCredit.toFixed(2);
              setForm(p => ({
                ...p,
                payment_journal_id: id,
                pay_currency_id: newCurId || p.pay_currency_id,
                amount: newAmt,
                received_amount: newAmt,
                // La tasa escrita a mano era de la moneda anterior: se vuelve a la del sistema
                // de la nueva, que es con la que se acaba de recalcular el monto de arriba.
                rate: "",
                // El vuelto se replantea con la moneda nueva: sus montos eran de la anterior.
                change_parts: [{ journal_id: "", amount: "" }],
              }));
            }}
          />
        </Field>

        {/* Arranca en la del sistema y se puede escribir a mano para este cobro: la deuda se
            pacta en divisas y el cliente paga a la tasa del día en que paga —una factura vieja
            se cobra semanas después—. Mismo campo que ya usan ingresos y egresos, así que se
            comporta igual en todo el sistema: al tocarlo se pone en ámbar y ofrece restaurar. */}
        {isNonBasePay && (
          <Field label={`TASA DE CAMBIO (${payCur.code})`}>
            <RateField
              value={form.rate}
              onChange={v => setForm(p => {
                // Cambiar la tasa cambia cuántos bolívares es el saldo, así que el monto
                // prellenado la sigue. Solo mientras nadie lo haya tocado: si el cajero ya
                // escribió un abono parcial, esa cifra es suya y no se pisa.
                const prevPend = pendingBsAt(resolveRate(p.rate, payCurRate));
                const nextRate = resolveRate(v, payCurRate);
                const tecleado = parseFloat(String(p.amount).replace(",", "."));
                const seguiaAlSaldo = !isNaN(tecleado) && Math.abs(tecleado - prevPend) < 0.01;
                if (!seguiaAlSaldo || !(nextRate > 1)) return { ...p, rate: v };
                const nuevo = pendingBsAt(nextRate).toFixed(2);
                return { ...p, rate: v, amount: nuevo, received_amount: nuevo };
              })}
              configuredRate={payCurRate}
              currency={payCur}
            />
          </Field>
        )}

        <Field label="MONTO RECIBIDO DEL CLIENTE *">
          <input
            type="text"
            inputMode="decimal"
            value={form.received_amount}
            onChange={e => {
              const val = e.target.value.replace(/[^\d.,]/g, "");
              const num = parseFloat(val.replace(",", "."));
              // Tope en la moneda de pago: en Bs → saldo línea por línea (9000); en $ → saldo
              // oficial (12.21), o el equivalente a tasa de efectivo cuando se usa.
              // Coincide con lo mostrado en "Saldo pendiente" y con el auto-relleno.
              const abono = !isNaN(num) && num > 0 ? Math.min(num, maxInPayCur).toFixed(2) : "";
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
                onClick={() => setForm(p => ({ ...p, keep_change: false, credit_change: false, change_parts: [{ journal_id: "", amount: "" }] }))}
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
                onClick={() => setForm(p => ({ ...p, keep_change: true, credit_change: false, change_parts: [{ journal_id: "", amount: "" }] }))}
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
                  onClick={() => setForm(p => ({ ...p, keep_change: false, credit_change: true, change_parts: [{ journal_id: "", amount: "" }] }))}
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
                <div className="space-y-2">
                  {salidasCambio.map((salida, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <CustomSelect
                          value={salida.journal_id === "" ? "" : String(salida.journal_id)}
                          placeholder="Seleccionar diario..."
                          options={activeJournals.map(j => ({ value: String(j.id), label: j.name }))}
                          onChange={(v) => setForm(p => {
                            const partes = [...p.change_parts];
                            const id = v === "" ? "" : parseInt(v, 10);
                            const { rate: r } = datosCaja(id);
                            // Al elegir la caja se sugiere lo que falta por devolver, ya
                            // convertido a su moneda: en la primera el vuelto entero, en la
                            // siguiente solo el resto.
                            const yaAsignado = partes.reduce((acc, q, i) => {
                              if (i === idx) return acc;
                              const { rate: rr } = datosCaja(q.journal_id);
                              const n = parseFloat(String(q.amount).replace(",", "."));
                              return acc + (isNaN(n) ? 0 : n / rr);
                            }, 0);
                            const falta = Math.max(0, changeBase - yaAsignado);
                            partes[idx] = { journal_id: id, amount: id === "" ? "" : (Math.round(falta * r * 100) / 100).toFixed(2) };
                            return { ...p, change_parts: partes };
                          })}
                        />
                      </div>
                      <div className="w-28 shrink-0">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={salida.amount}
                          placeholder={salida.sym}
                          onChange={e => setForm(p => {
                            const partes = [...p.change_parts];
                            partes[idx] = { ...partes[idx], amount: e.target.value.replace(/[^\d.,]/g, "") };
                            return { ...p, change_parts: partes };
                          })}
                          className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-warning/40 rounded-xl px-3 text-[13px] font-bold text-content dark:text-white outline-none focus:border-warning/70 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20 tabular-nums"
                        />
                      </div>
                      {salidasCambio.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setForm(p => ({ ...p, change_parts: p.change_parts.filter((_, i) => i !== idx) }))}
                          className="w-10 h-10 shrink-0 rounded-xl border border-warning/30 text-content-subtle hover:text-danger hover:border-danger/40 transition-all flex items-center justify-center"
                          title="Quitar esta salida"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {faltaCajaEnCambio && (
                  <p className="text-[10px] font-black text-danger mt-1.5">Selecciona de dónde saldrá el cambio</p>
                )}

                {/* Sin sencillo en una sola moneda: parte en divisas y el resto en bolívares. */}
                {sobranteRetenido > 0.001 && (
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, change_parts: [...p.change_parts, { journal_id: "", amount: "" }] }))}
                    className="w-full h-9 mt-2 rounded-xl border border-dashed border-warning/50 text-warning text-[10px] font-black uppercase tracking-widest hover:bg-warning/10 transition-all"
                  >
                    Devolver el resto desde otra caja
                  </button>
                )}

                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-warning/20">
                  <span className="text-[10px] font-black text-warning/70 uppercase tracking-widest tabular-nums">
                    Entregado {fmtBase(actualChangeBase)} de {fmtBase(changeBase)}
                  </span>
                  {/* Devolver menos que el cambio exacto deja esa diferencia dentro de la caja.
                      Se avisa acá y queda anotada en el cobro: es dinero que entró y que no
                      cubre nada de la factura. */}
                  {sobranteRetenido > 0.001 && (
                    <span className="text-[10px] font-black text-warning tabular-nums">
                      Quedan {fmtBase(sobranteRetenido)} en caja
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Monto / Abono (readonly) */}
        {/* La etiqueta usa el mismo criterio que el servidor: entregar 5,00 por una factura de
            5,10 la cierra, así que llamarlo "abono parcial" sería anunciar algo que no va a pasar. */}
        <Field label={settlesInvoice ? "PAGO COMPLETO A FACTURA" : "ABONO PARCIAL A FACTURA"}>
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
            {/* En la moneda con la que se está cobrando, no siempre en bolívares.
                Cobrando en divisas, convertir a Bs lo aplicado (5,10 → Bs.4.001,78) mostraba
                un "total pagado" por encima del total de la factura (Bs.4.000,00): el mismo
                desfase de redondeo de siempre, pero puesto donde el cajero lo lee como que
                cobró de más. En divisas el número es el que él tiene en la mano. */}
            <Row
              label="Total pagado"
              value={isNonBasePay ? `${defaultSym}${paidTotalBs.toFixed(2)}` : fmtBase(paidTotalBase)}
              valueClass="text-success font-black"
            />
            <div className="border-t border-border/20 dark:border-white/5 pt-1.5">
              <Row
                label={settlesInvoice ? "Factura saldada" : "Saldo restante"}
                value={isNonBasePay ? `${defaultSym}${remainingShown.toFixed(2)}` : fmtBase(settlesInvoice ? 0 : remainingBase)}
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

      {/* Salida sin dinero. Mismo formato que los botones de arriba, pero en su propia fila y
          en ámbar: es una acción, no un cobro alternativo. */}
      {canForgive && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => setForgiveMode(true)}
            className="w-full h-10 rounded-xl border border-violet-500/40 text-violet-500 dark:text-violet-400 text-[11px] font-black uppercase tracking-wide transition-all hover:bg-violet-500 hover:text-white"
          >
            Exonerar saldo de {fmtBase(balanceUsd)}
          </button>
        </div>
      )}
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
