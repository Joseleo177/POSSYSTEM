import { useState, useEffect, useRef } from "react";
import { Spinner } from "./ui/Spinner";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import { agregarCobro } from "../services/offline/outbox";
import Modal from "./ui/Modal";
import { saleTotalAtRate, tasaDeVenta, todayISO, PAYMENT_TOLERANCE, settleTolerance } from "../helpers";
import DatePicker from "./ui/DatePicker";
import RateField, { resolveRate } from "./ui/RateField";
import { journalsForWarehouse, toNameCase, calcularAvance } from "../helpers";
import Money from "./ui/Money";
import ImmediatePayPicker from "./cobro/ImmediatePayPicker";
import JournalPickerButton from "./cobro/JournalPickerButton";

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
  // Pago combinado: varias formas de pago en un solo cobro. Vacío = pago simple (los campos
  // de arriba). Con tramos, cada uno lleva su caja, su monto —en la moneda de esa caja— y su
  // referencia; el vuelto se calcula sobre la suma.
  pay_parts: [],
});

export default function PaymentFormModal({ sale: ventaProp, onClose, onSuccess, onSaleChange, lockedJournalId = null, lockedMethod = null, avanceInicial = null }) {
  const { notify, baseCurrency, activeCurrencies, activeJournals: allActiveJournals, can, settings } = useApp();
  // La venta puede cambiar sin salir del modal: al quitarle la tasa de divisas vuelve del
  // servidor con su precio normal (ver quitarTasa). Se conserva lo que la pantalla le agregó.
  const [ventaActual, setVentaActual] = useState(null);
  const venta = ventaActual ? { ...ventaProp, ...ventaActual } : ventaProp;
  // Solo los diarios de la sucursal de esta venta (más los compartidos): un cajero de la
  // sucursal A no debe poder cobrar contra la caja de la B.
  const activeJournals = journalsForWarehouse(allActiveJournals, venta?.warehouse_id);
  const [form, setForm] = useState(getEmpty);
  const [loading, setLoading] = useState(false);
  // Pago combinado activo. Se necesitan AL MENOS dos formas de pago: con una sola es un pago
  // simple (y el backend también trata `pay_parts` de 1 elemento como simple). Al quitar
  // tramos nunca se baja de dos; para salir del combinado está el botón "Pago simple".
  const combinado = (form.pay_parts?.length || 0) >= 2;
  const round6 = n => Math.round((parseFloat(n) || 0) * 1e6) / 1e6;
  // Clave de idempotencia del cobro en curso (ver submit).
  const payKeyRef = useRef(null);
  const [customerCredit, setCustomerCredit] = useState(0);
  const [creditToApply, setCreditToApply] = useState("");
  // Exonerar el saldo: perdonar lo que falta en vez de cobrarlo. Vive en este modal porque es
  // la otra forma de cerrar la misma cuenta, y es acá donde el cajero ya tiene el saldo
  // delante — no en una pantalla aparte a la que habría que ir a buscar la factura.
  const [forgiveMode, setForgiveMode] = useState(false);
  const [forgiveReason, setForgiveReason] = useState("");
  // Cobro en divisas sobre una factura que no trae tasa (ver más abajo).
  const [fxCobroOn, setFxCobroOn] = useState(false);
  const [fxCobroText, setFxCobroText] = useState("");
  // Avance de efectivo en el mismo pase del punto (ver más abajo). Llega prellenado si se pidió
  // en la revisión del pedido.
  const [avance, setAvance] = useState(() => ({
    on: !!avanceInicial,
    monto: avanceInicial?.cash_amount ? String(avanceInicial.cash_amount) : "",
    pct: avanceInicial ? String(avanceInicial.fee_pct ?? "") : (settings?.cash_advance_pct || ""),
    cash_journal_id: "",
  }));

  useEffect(() => {
    if (!venta?.customer_id) { setCustomerCredit(0); setCreditToApply(""); return; }
    // Solo lo que esta sucursal puede aplicar: lo compartido más lo que ella misma generó. El
    // crédito de otra sucursal no cuenta acá (ver creditLedger.js en el backend).
    api.customers.getOne(venta.customer_id, venta.warehouse_id ? { warehouse_id: venta.warehouse_id } : {})
      .then(r => setCustomerCredit(parseFloat(r.data?.credit_available ?? r.data?.credit_balance ?? 0)))
      .catch(() => setCustomerCredit(0));
  }, [venta?.customer_id, venta?.warehouse_id]);

  // ── Cobro en divisas sobre una factura sin tasa ──────────────────────────────
  // La factura que se fue a crédito pierde la tasa especial (es de contado). Si mañana paga en
  // divisas, se le aplica aquí: su total no se toca —es el documento emitido— y la diferencia
  // se exonera en el mismo cobro (createPayment, `fx_cobro`). Hoy debe Bs.8100 a 810; en
  // divisas, a 1000, paga $8,10 y se perdona el resto. Desde ahí el modal trabaja con la
  // factura como si ya tuviera la tasa: sus bolívares van a esa tasa y pide algo en divisas.
  const monedaBs = activeCurrencies.find(c => !c.is_base) || null;
  const tasaSistemaBs = parseFloat(monedaBs?.exchange_rate) || 0;
  // Opción de la empresa (Configuración → Punto de venta) más el permiso. Las facturas que ya
  // traen tasa se siguen cobrando con ella aunque la opción se apague.
  const puedeFxCobro = settings?.pos_fx_cobro === "true" && can("sales.fx")
    && !(parseFloat(venta?.fx_rate) > 0) && !venta?.offline
    && tasaSistemaBs > 1 && venta?.items?.length > 0
    && parseFloat(venta?.balance ?? venta?.total ?? 0) > 0;
  const fxCobroTasa = parseFloat(String(fxCobroText).replace(",", ".")) || 0;
  const fxCobroActivo = puedeFxCobro && fxCobroOn && fxCobroTasa > tasaSistemaBs;
  const fxPerdon = (() => {
    if (!fxCobroActivo) return 0;
    const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
    const pagado = parseFloat(venta.amount_paid || 0);
    const devuelto = parseFloat(venta.total_returned || 0);
    const perdonado = parseFloat(venta.forgiven_amount || 0);
    const debeHoyBs = Math.max(0, r2(saleTotalAtRate(venta, tasaSistemaBs)
      - r2(pagado * tasaSistemaBs) - r2(devuelto * tasaSistemaBs) - r2(perdonado * tasaSistemaBs)));
    // Lo exonerado a la tasa especial tiene que dejar la deuda en esos mismos bolívares.
    const objetivo = r2(saleTotalAtRate(venta, fxCobroTasa) - r2(pagado * fxCobroTasa) - r2(devuelto * fxCobroTasa) - debeHoyBs);
    // Exacto: en bolívares la deuda queda en los mismos Bs de hoy, al céntimo. En divisas el
    // saldo puede traer medio céntimo (11,0528): se muestra y se cobra en céntimos, y esa
    // fracción la absorbe el margen de redondeo de la factura.
    return Math.max(0, parseFloat((objetivo / fxCobroTasa - perdonado).toFixed(6)));
  })();
  const sale = fxCobroActivo && fxPerdon > 0
    ? {
        ...venta,
        fx_rate: fxCobroTasa,
        fx_currency_id: monedaBs.id,
        forgiven_amount: parseFloat(venta.forgiven_amount || 0) + fxPerdon,
        fx_forgiven: parseFloat(venta.fx_forgiven || 0) + fxPerdon,
        balance: Math.max(0, parseFloat(venta.balance ?? venta.total ?? 0) - fxPerdon),
        // Sin ningún cobro previo seguro que no hay uno en divisas; con cobros, decide el servidor.
        fx_pago_divisas: parseFloat(venta.amount_paid || 0) > 0 ? undefined : false,
      }
    : venta;

  const displayCur = activeCurrencies.find(c => !c.is_base) || baseCurrency;
  // Factura con tasa de divisas (ver services/sales/fxRate.js en el backend): todo lo que se
  // cobre en bolívares va a esa tasa, ahora o en un abono posterior, y no se escribe a mano.
  const tasaFx = parseFloat(sale?.fx_rate) > 0 ? parseFloat(sale.fx_rate) : null;
  const defaultRate = (!displayCur || displayCur.is_base) ? 1 : tasaDeVenta(sale, parseFloat(displayCur.exchange_rate || 1));
  const defaultSym = displayCur?.symbol || baseCurrency?.symbol || "Ref.";

  const payCur = activeCurrencies.find(c => c.id === parseInt(form.pay_currency_id));
  const payCurRate = (!payCur || payCur.is_base) ? 1 : tasaDeVenta(sale, parseFloat(payCur.exchange_rate || 1));
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
  const payRate = (!payCur || payCur.is_base) ? 1 : (tasaFx ? payCurRate : resolveRate(form.rate, payCurRate));
  const baseSym = baseCurrency?.symbol || "Ref.";
  // En pago combinado el resumen (abono, sobrante, "después de este pago") va SIEMPRE en la
  // moneda base: cada tramo tiene su propia moneda, así que no hay una única "moneda del pago".
  const paySym = combinado ? baseSym : (payCur?.symbol || baseSym);

  const selectedJournal = activeJournals.find(j => j.id === form.payment_journal_id);
  const isCash = selectedJournal?.type === "efectivo";

  // $ oficial de la factura: sale.total (createSale ya lo calcula como suma de round2(precio)×qty,
  // p.ej. 3×4.07 = 12.21). Es la fuente de verdad en divisas — NO total_precise, que da 12.20.
  const balanceUsd        = parseFloat(sale?.balance ?? sale?.total ?? 0);
  const creditNum         = parseFloat(String(creditToApply).replace(",", ".")) || 0;
  const creditApplied     = Math.min(Math.max(creditNum, 0), customerCredit, balanceUsd);
  const pendingAfterCredit = Math.max(0, balanceUsd - creditApplied);

  // ── Pago combinado ──────────────────────────────────────────────────────────
  // Cada tramo se teclea en la moneda de SU caja y se convierte a base con la tasa del
  // sistema de esa moneda (sin tasa manual: el combinado es un cobro "de mostrador"). El
  // vuelto se calcula sobre la suma; solo el ÚLTIMO tramo puede exceder el saldo.
  const partesComb = (form.pay_parts || []).map(p => {
    const j = activeJournals.find(x => x.id === p.journal_id);
    const cur = j?.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : baseCurrency;
    const r = (!cur || cur.is_base) ? 1 : tasaDeVenta(sale, parseFloat(cur.exchange_rate || 1));
    const n = parseFloat(String(p.amount).replace(",", "."));
    return {
      ...p, j, cur, rate: r,
      sym: cur?.symbol || baseCurrency?.symbol || "Ref.",
      isCash: j?.type === "efectivo",
      num: n,
      // Base: en la propia moneda base se redondea a 2 (como el pago simple); al convertir
      // desde otra moneda se guardan 6 decimales, que es lo que espera el backend.
      base: !isNaN(n) && n > 0 ? (r === 1 ? Math.round(n * 100) / 100 : round6(n / r)) : 0,
    };
  });
  const recibidoComb   = round6(partesComb.reduce((a, s) => a + s.base, 0));
  const noUltimoComb   = round6(partesComb.slice(0, -1).reduce((a, s) => a + s.base, 0));
  const combParteFalta = partesComb.some(s => !s.journal_id || !(s.base > 0));
  // La referencia de cada tramo es OPCIONAL, igual que en el cobro simple.
  const combNoUltimoExcede = noUltimoComb > pendingAfterCredit + PAYMENT_TOLERANCE;

  // ── Avance de efectivo junto al cobro ──────────────────────────────────────
  // El cliente paga la factura y además se lleva billetes, todo en un pase del punto: se cobra
  // por esta cuenta lo de la factura más el avance con su comisión, y el efectivo sale de una
  // caja de efectivo. El servidor lo registra en la misma transacción que el cobro
  // (createPayment → services/cashAdvances). Solo con una forma de pago que no sea efectivo.
  const cajasEfectivo = activeJournals.filter(j => j.type === "efectivo");
  const puedeAvance = settings?.pos_cash_advance === "true" && can("sales.advance") && !venta?.offline
    && !combinado && !!selectedJournal && selectedJournal.type !== "efectivo";
  const cajaAvance = cajasEfectivo.find(j => j.id === avance.cash_journal_id)
    || cajasEfectivo.find(j => { const c = activeCurrencies.find(x => x.id === parseInt(j.currency_id)); return c && !c.is_base; })
    || cajasEfectivo[0] || null;
  const curCajaAvance = cajaAvance?.currency_id ? activeCurrencies.find(c => c.id === parseInt(cajaAvance.currency_id)) : baseCurrency;
  const avanceEfectivo = parseFloat(String(avance.monto).replace(",", ".")) || 0;
  const avancePct = parseFloat(String(avance.pct).replace(",", ".")) || 0;
  const avanceCalc = calcularAvance({
    efectivo: avanceEfectivo, pct: avancePct,
    rateCaja: (!curCajaAvance || curCajaAvance.is_base) ? 1 : parseFloat(curCajaAvance.exchange_rate || 1),
    rateCuenta: (!payCur || payCur.is_base) ? 1 : parseFloat(payCur.exchange_rate || 1),
    mismaMoneda: String(curCajaAvance?.id ?? "") === String(payCur?.id ?? baseCurrency?.id ?? ""),
  });
  const avanceActivo = puedeAvance && avance.on && avanceEfectivo > 0 && !!cajaAvance;
  const avanceInvalido = puedeAvance && avance.on && avanceEfectivo > 0 && (!cajaAvance || avancePct < 0 || avancePct > 100);
  // Con avance, lo que pasa por el punto trae también el avance y su comisión: esa parte no es
  // de la factura ni sobrante. El "monto recibido" se lee sin ella; el avance va aparte.
  const avanceEnPago = avanceActivo ? avanceCalc.total : 0;

  const recibidoTecleado = parseFloat(String(form.received_amount).replace(",", "."));
  const receivedNum = isNaN(recibidoTecleado) ? NaN : Math.max(0, parseFloat((recibidoTecleado - avanceEnPago).toFixed(2)));
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

  const isNonBasePay = !combinado && payCur && !payCur.is_base;

  // Tope del cobro en la moneda del pago: en Bs el saldo línea por línea, en divisas el saldo
  // oficial en base. Ambos salen de la misma tasa del sistema, así que lo que pide la pantalla
  // coincide con lo que se registra.
  const maxInPayCur = isNonBasePay ? pendingPreciseBs : pendingAfterCredit;

  const receivedBase = combinado
    ? recibidoComb
    : (!isNaN(receivedNum)
        ? (isNonBasePay ? receivedNum / payRate : round2(receivedNum / payRate))
        : 0);

  let amountBase = combinado
    ? Math.min(recibidoComb, pendingAfterCredit)
    : (!isNaN(amountNum)
        ? (isNonBasePay ? amountNum / payRate : round2(amountNum / payRate))
        : 0);

  // Se registra el dinero que entró, ni un céntimo más.
  //
  // Antes, cobrando en divisas, un monto a menos de diez céntimos del saldo se subía al saldo
  // exacto: el cliente entregaba 5,00 por una factura de 5,10 y el sistema anotaba 5,10. La
  // gaveta quedaba con diez céntimos menos de los que decía la caja, en cada cobro.
  //
  // No hace falta inflarlo para cerrar la factura: el servidor la da por saldada cuando lo
  // cobrado llega al saldo menos el desfase de redondeo de la factura (settleTolerance en
  // utils/saleBalance), que es justo lo que este ajuste intentaba tapar. Lo único que se
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
  // El mismo criterio que aplica el servidor al decidir si la factura queda saldada: en Bs,
  // contra el saldo en bolívares; en divisas, con el margen de redondeo de ESTA factura
  // (settleTolerance). Con los diez céntimos fijos de antes se anunciaba "pago completo" a un
  // cobro en divisas al que le faltaban hasta Bs.85.
  const settlesInvoice = isNonBasePay ? remainingBs < 0.01 : remainingBase <= settleTolerance(sale);
  // Lo que se muestra: la cifra de la pista que manda, convertida a la moneda de pantalla. Si
  // la factura queda saldada el resto es cero, no los céntimos que absorbe la tolerancia.
  const remainingShown = settlesInvoice ? 0
    : (isNonBasePay ? remainingBs : roundBs2(remainingBase * vistaBsRate));

  // Sobrante calculado en la moneda de pago (570 - 561.22 = 8.78 exacto),
  // sin ida-y-vuelta por USD que acumula error de redondeo.
  //
  // Hay vuelto mientras quede algo que cobrar EN LA MONEDA DEL PAGO (maxInPayCur), no en la
  // base: A-0007150 debía Bs.7,86 con Ref.0,00 en base, y con el viejo `pendingAfterCredit > 0`
  // el cliente entregaba Bs.100 y el modal no ofrecía devolverle nada.
  const changeInPayCur = (!isNaN(receivedNum) && receivedNum > 0 && maxInPayCur > 0 && receivedNum > (isNaN(amountNum) ? 0 : amountNum))
    ? parseFloat((receivedNum - (isNaN(amountNum) ? 0 : amountNum)).toFixed(2))
    : 0;
  // Tasa y símbolo de una caja: cada tramo (del cobro o del vuelto) se escribe en la moneda de
  // SU caja, que es la que el cajero cuenta.
  const datosCaja = (journalId) => {
    const j = journalId ? activeJournals.find(x => x.id === journalId) : null;
    const cur = j?.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : null;
    const r = (!cur || cur.is_base) ? 1 : tasaDeVenta(sale, parseFloat(cur.exchange_rate || 1));
    return { journal: j, rate: r, sym: cur?.symbol || baseCurrency?.symbol || "Ref." };
  };

  // Lo que falta por cubrir en el pago combinado, en la moneda de una caja de tasa `r` y sin
  // contar el tramo `idx`. En bolívares se mide contra el saldo línea por línea (pendingBsAt),
  // que es el que pide la pantalla y el que usa el servidor para dar por saldado un tramo en
  // Bs; en la base, contra el saldo oficial. Medirlo siempre en la base restaba bolívares de
  // un saldo redondeado (Ref.3,69 contra los Bs.3219,62 = 3,6949 de la factura): sugería
  // Bs.1215,35 donde faltaban Bs.1219,62, y teclear lo correcto disparaba un "sobrante" de
  // 0,0049 que pedía caja para el vuelto.
  const faltaEnMoneda = (partes, idx, r) => {
    const ya = (partes || []).reduce((a, q, i) => {
      if (i === idx) return a;
      const n = parseFloat(String(q.amount).replace(",", "."));
      if (isNaN(n) || n <= 0) return a;
      const rr = datosCaja(q.journal_id).rate;
      if (r > 1) return a + (rr === r ? roundBs2(n) : roundBs2((n / rr) * r));
      return a + (rr === 1 ? round2(n) : n / rr);
    }, 0);
    return r > 1
      ? Math.max(0, roundBs2(pendingBsAt(r) - ya))
      : Math.max(0, round2(pendingAfterCredit - ya));
  };

  // En combinado el sobrante es lo que el ÚLTIMO tramo pone por encima de lo que faltaba,
  // medido en la moneda de ese tramo (el servidor le cuelga el vuelto a él) y pasado a base.
  const ultimoComb = partesComb[partesComb.length - 1];
  const sobranteUltimo = (combinado && ultimoComb?.num > 0)
    ? Math.max(0, roundBs2(ultimoComb.num - faltaEnMoneda(form.pay_parts, partesComb.length - 1, ultimoComb.rate)))
    : 0;
  const changeBase = combinado
    ? (sobranteUltimo > 0 ? round6(sobranteUltimo / ultimoComb.rate) : 0)
    : (changeInPayCur > 0 ? changeInPayCur / payRate : 0);
  const changeDisplay = combinado ? changeBase : changeInPayCur;

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

  // Qué tramo del vuelto está eligiendo caja (abre la misma botonera que "Pago Inmediato",
  // filtrada a cajas con salidas). null = cerrada.
  const [changePickerIdx, setChangePickerIdx] = useState(null);

  // Asigna la caja elegida a un tramo del vuelto y le sugiere el monto que falta por
  // devolver, ya convertido a la moneda de esa caja: en el primer tramo el vuelto entero,
  // en los siguientes solo el resto.
  const asignarCajaCambio = (idx, id, method = null) => setForm(p => {
    const partes = [...p.change_parts];
    const { rate: r } = datosCaja(id);
    const yaAsignado = partes.reduce((acc, q, i) => {
      if (i === idx) return acc;
      const { rate: rr } = datosCaja(q.journal_id);
      const n = parseFloat(String(q.amount).replace(",", "."));
      return acc + (isNaN(n) ? 0 : n / rr);
    }, 0);
    const falta = Math.max(0, changeBase - yaAsignado);
    partes[idx] = { journal_id: id, payment_method: method, amount: (Math.round(falta * r * 100) / 100).toFixed(2) };
    return { ...p, change_parts: partes };
  });

  // Solo si de verdad se aplicó crédito. Con saldo en base 0 —una factura cobrada en Bs puede
  // tener abonado más que su total en Ref y deber todavía bolívares— la comparación sola daba
  // 0 >= -0,001 y el modal escondía las formas de pago: quedaba vacío pidiendo Bs.7,86.
  const creditCoversAll = creditApplied > 0 && creditApplied >= balanceUsd - 0.001;

  // Elegir método/diario: fija el diario, su moneda y prellena el monto con el saldo (línea
  // por línea en Bs, saldo oficial en divisas). Lo usan tanto el desplegable "MÉTODO DE PAGO"
  // como el flujo de "Pago Inmediato", que llega con el diario ya escogido en la botonera y
  // sin desplegable a la vista.
  const selectJournal = (id, method = null) => {
    const j = activeJournals.find(x => x.id === id);
    if (!j) return;
    const newCurId = j.currency_id || baseCurrency?.id;
    const newCur = activeCurrencies.find(c => c.id === parseInt(newCurId));
    const isNonBase = newCur && !newCur.is_base;
    const newRate = isNonBase ? tasaDeVenta(sale, parseFloat(newCur.exchange_rate || 1)) : 1;
    const newAmt = isNonBase ? pendingBsAt(newRate).toFixed(2) : pendingAfterCredit.toFixed(2);
    avanceEnRecibidoRef.current = 0;
    setForm(p => ({
      ...p,
      payment_journal_id: id,
      // Por qué método de la cuenta entra (la cuenta acepta varios).
      payment_method: method,
      pay_currency_id: newCurId || p.pay_currency_id,
      amount: newAmt,
      received_amount: newAmt,
      rate: "",
      change_parts: [{ journal_id: "", amount: "" }],
    }));
  };

  // El monto recibido prellenado incluye el avance: al prenderlo, cambiarlo o quitarlo, se
  // ajusta. Solo si el cajero no lo tocó (recibido = abono + avance anterior): una cifra suya
  // no se pisa.
  const avanceEnRecibidoRef = useRef(0);
  useEffect(() => {
    const previo = avanceEnRecibidoRef.current;
    if (Math.abs(previo - avanceEnPago) < 0.005) return;
    avanceEnRecibidoRef.current = avanceEnPago;
    setForm(p => {
      const rec = parseFloat(String(p.received_amount).replace(",", "."));
      const abono = parseFloat(String(p.amount).replace(",", "."));
      if (isNaN(rec) || isNaN(abono) || Math.abs(rec - previo - abono) > 0.009) return p;
      return { ...p, received_amount: (abono + avanceEnPago).toFixed(2) };
    });
  }, [avanceEnPago, form.payment_journal_id]);

  // Cobro inmediato: el diario ya viene elegido de la botonera. Se aplica una sola vez, al
  // abrir; el campo "MÉTODO DE PAGO" no se muestra (ver más abajo).
  const lockedRef = useRef(false);
  useEffect(() => {
    if (lockedRef.current || !lockedJournalId) return;
    if (!activeJournals.some(j => j.id === lockedJournalId)) return;
    lockedRef.current = true;
    selectJournal(lockedJournalId, lockedMethod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedJournalId, activeJournals]);
  const methodLocked = !!lockedJournalId && form.payment_journal_id === lockedJournalId;

  // Prender, apagar o cambiar la tasa de divisas cambia lo que se debe (y la tasa de los Bs):
  // el monto sugerido se rehace con la caja que ya estaba elegida.
  useEffect(() => {
    if (form.payment_journal_id && !combinado) selectJournal(form.payment_journal_id, form.payment_method || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxCobroActivo, fxPerdon, ventaActual]);

  // Con el diario ya fijado ("Pago Inmediato"), el cajero solo tiene que teclear lo que
  // recibió: se le lleva el foco a ese campo. Doble rAF para pasar por detrás del auto-foco
  // de Modal, que apuntaría al primer interactivo (el botón del método).
  const receivedRef = useRef(null);
  useEffect(() => {
    if (!methodLocked) return;
    let r2;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => receivedRef.current?.focus());
    });
    return () => { cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2); };
  }, [methodLocked]);

  // Cobro de una venta hecha sin conexión: no hay servidor, así que se guarda en la cola del
  // equipo junto con la venta y se envía con ella al volver internet. Devuelve lo mismo que
  // POST /payments para que la caja y el ticket sigan igual. Si queda saldada lo decide la
  // misma cuenta que esta pantalla ya muestra ("Factura saldada"); al sincronizar, el servidor
  // vuelve a decidirlo con sus propias reglas.
  const cobroSinConexion = async (cuerpo) => {
    const nombreCaja = (id) => activeJournals.find(j => j.id === id)?.name || null;
    const ahora = new Date().toISOString();
    const partes = cuerpo.pay_parts?.length
      ? cuerpo.pay_parts.map(p => ({ payment_journal_id: p.journal_id, amount: p.amount, exchange_rate: p.exchange_rate }))
      : (parseFloat(cuerpo.amount) > 0
          ? [{ payment_journal_id: cuerpo.payment_journal_id, amount: cuerpo.amount, exchange_rate: cuerpo.exchange_rate }]
          : []);
    const pagos = partes.map((p, i) => ({
      id: null,
      created_at: ahora,
      payment_journal_id: p.payment_journal_id,
      journal_name: nombreCaja(p.payment_journal_id),
      amount: parseFloat(p.amount) || 0,
      exchange_rate: parseFloat(p.exchange_rate) || 1,
      change_given: i === partes.length - 1 ? (parseFloat(cuerpo.change_given) || 0) : 0,
    }));
    const cierra = combinado
      ? recibidoComb + 1e-6 >= pendingAfterCredit - settleTolerance(sale)
      : settlesInvoice;
    await agregarCobro(sale.offline_key, cuerpo, { cierra });
    return {
      payments: pagos,
      sale_status: cierra ? "pagado" : "parcial",
      amount_paid: cierra ? parseFloat(sale.total) : paidBeforeBase + amountBase,
      balance: cierra ? 0 : remainingBase,
      credit_applied: 0,
      invoice_number: null,
    };
  };

  const submit = async () => {
    if (!form.reference_date) return notify("La fecha de referencia es requerida", "err");
    if (!creditCoversAll && combinado) {
      if (combParteFalta) return notify("Cada forma de pago necesita su caja y su monto", "err");
      if (combNoUltimoExcede) return notify("Solo la última forma de pago puede exceder el saldo: ajusta los montos", "err");
      if (recibidoComb <= 0) return notify("Indica el monto de cada forma de pago", "err");
    } else if (!creditCoversAll) {
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
      const cuerpo = {
        // Pago simple: monto único en base. Combinado: un tramo por forma de pago, cada uno
        // con su monto ya convertido a base y su tasa.
        ...(combinado && !creditCoversAll ? {
          pay_parts: partesComb.map(s => ({
            journal_id:       s.journal_id,
            payment_method:   s.payment_method || null,
            amount:           s.base,
            currency_id:      s.cur?.id || null,
            exchange_rate:    s.rate,
            reference_number: s.reference?.trim() || null,
          })),
        } : {
          amount:             creditCoversAll ? 0 : payAmountToSend,
          currency_id:        payCur?.id || null,
          exchange_rate:      payRate,
          payment_journal_id: creditCoversAll ? null : (form.payment_journal_id || null),
          payment_method:     creditCoversAll ? null : (form.payment_method || null),
        }),
        reference_date:     form.reference_date,
        reference_number:   combinado ? null : (form.reference_number || null),
        notes:              form.notes || null,
        received_amount:    receivedBase > 0 ? receivedBase : undefined,
        change_given:       (changeBase > 0 && !form.keep_change && !form.credit_change) ? actualChangeBase : undefined,
        // Cada tramo del vuelto con su caja: el servidor registra un egreso por cada una.
        change_parts:       (changeBase > 0 && !form.keep_change && !form.credit_change)
          ? salidasCambio.filter(s => s.journal_id && s.montoBase > 0).map(s => ({ journal_id: s.journal_id, payment_method: s.payment_method || null, amount: s.montoBase }))
          : undefined,
        // En combinado los tramos ya suman TODO lo recibido (aplicado + sobrante). No se manda
        // `surplus_kept`: el backend lo reconstruye sumándolo al monto de un tramo, y acá lo
        // duplicaría (el sobrante ya está dentro de `pay_parts`).
        surplus_kept:       (!combinado && changeBase > 0 && form.keep_change) ? changeBase : undefined,
        change_to_credit:   (changeBase > 0 && form.credit_change) ? changeBase : undefined,
        credit_amount:      creditApplied > 0 ? creditApplied : undefined,
        // Tasa de divisas aplicada en este cobro: el servidor exonera la diferencia y fija la tasa
        // en la misma transacción.
        fx_cobro:           sale !== venta ? { rate: fxCobroTasa, forgive: fxPerdon, currency_id: monedaBs.id } : undefined,
        // Avance de efectivo en el mismo pase: entra por la cuenta de este cobro.
        cash_advance:       avanceActivo ? { cash_amount: avanceEfectivo, fee_pct: avancePct, cash_journal_id: cajaAvance.id } : undefined,
      };
      const res = sale.offline
        ? await cobroSinConexion(cuerpo)
        : await api.payments.create({ ...cuerpo, idempotency_key: payKeyRef.current, sale_id: sale.id });
      // `duplicated` llega cuando el servidor reconoció un reintento: el cobro ya estaba
      // guardado. Se le dice al cajero para que no crea que se cobró dos veces.
      if (sale.offline) notify("Cobro guardado en este equipo: se envía solo al volver la conexión");
      else if (res.duplicated) notify("Ese cobro ya estaba registrado");
      else if (res.cash_advance) notify(`Cobro registrado. Entrega ${curCajaAvance?.symbol || ""} ${parseFloat(res.cash_advance.cash_amount || avanceEfectivo).toFixed(2)} en efectivo`);
      else if (res.sale_status === "pagado") notify("¡Factura pagada completamente!");
      else notify("Pago parcial registrado");
      setAvance(p => ({ ...p, on: false, monto: "" }));
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
  // Sin conexión no se exonera: es una decisión sobre una factura que todavía no existe.
  //
  // También cuando el saldo en base ya está dentro del redondeo pero faltan bolívares: una
  // factura cobrada en Bs puede deber Bs.7,86 con Ref.0,00 en base (A-0007150), y sin esto
  // no había forma de cerrarla. Se mide a la tasa del sistema, la misma que manda al servidor.
  const forgiveBs = defaultRate > 1 ? pendingBsAt(defaultRate) : 0;
  const forgiveSoloBs = balanceUsd <= settleTolerance(sale) && forgiveBs >= 0.01;
  const canForgive = can("sales.forgive")
    && !sale?.offline
    // Con la tasa de divisas aplicada en este cobro ya hay un perdón en curso: no se mezclan.
    && sale === venta
    && (balanceUsd > settleTolerance(sale) || forgiveSoloBs)
    && !["pagado", "exonerado", "anulado", "devuelto"].includes(sale?.status);
  // Sin fmtBase: se declara más abajo y acá todavía no existe.
  const forgiveLabel = forgiveSoloBs
    ? `${defaultSym}${forgiveBs.toFixed(2)}`
    : `${baseCurrency?.symbol || "Ref."}${Number(balanceUsd || 0).toFixed(2)}`;

  const submitForgive = async () => {
    const motivo = forgiveReason.trim();
    if (!motivo || loading) return;
    setLoading(true);
    try {
      const res = await api.sales.forgive(sale.id, motivo, defaultRate > 1 ? defaultRate : undefined);
      notify(`Saldo exonerado: ${forgiveSoloBs ? forgiveLabel : fmtBase(res.forgiven_now)}`);
      setForgiveMode(false);
      setForgiveReason("");
      onSuccess?.(res);
    } catch (e) {
      notify(e.message, "err");
    }
    setLoading(false);
  };

  const vueltoResuelto = changeBase <= 0 || form.keep_change || form.credit_change || (hayCajaDeCambio && !faltaCajaEnCambio);
  // Tasa de divisas: al menos un cobro de la factura tiene que entrar en divisas (el servidor lo
  // exige, ver sales/fxRate.js). Se avisa antes solo cuando la venta dice que aún no hubo
  // ninguno; si no trae el dato, decide el servidor.
  const esDeLaTasa = (cur) => !!cur && parseInt(cur.id) === parseInt(sale?.fx_currency_id);
  // Una factura ya emitida a crédito ('pendiente' o 'parcial') con tasa y sin cobros en divisas
  // se fió antes de la regla de contado: se cobra en Bs a su tasa (exentaDeDivisas en el
  // backend). Salvo que la tasa se le esté aplicando en este cobro (sale !== venta).
  const exenta = sale === venta && ["pendiente", "parcial"].includes(venta?.status);

  // Quitar la tasa a una venta de contado (borrador) que al final paga todo en bolívares.
  const [quitandoTasa, setQuitandoTasa] = useState(false);
  const puedeQuitarTasa = sale === venta && venta?.status === "borrador" && !venta?.invoice_number && !venta?.offline;
  const quitarTasa = async () => {
    setQuitandoTasa(true);
    try {
      const res = await api.sales.removeFxRate(venta.id);
      const nueva = res.data ?? res;
      setVentaActual(nueva);
      onSaleChange?.(nueva);
      notify("Venta a precio normal: ya se puede cobrar en bolívares");
    } catch (e) {
      notify(e.message, "err");
    } finally {
      setQuitandoTasa(false);
    }
  };
  const faltaDivisas = !!tasaFx && !exenta && sale?.fx_pago_divisas === false && !creditCoversAll && (combinado
    ? partesComb.every(s => esDeLaTasa(s.cur))
    : esDeLaTasa(payCur));
  const canSubmit = !loading && form.reference_date && !faltaDivisas && !avanceInvalido && (
    creditCoversAll ||
    (combinado
      ? (!combParteFalta && !combNoUltimoExcede && recibidoComb > 0 && vueltoResuelto)
      : (form.payment_journal_id && !isNaN(amountNum) && amountNum > 0 && vueltoResuelto))
  );

  const fmt     = (usdAmt) => `${defaultSym}${(Number(usdAmt || 0) * historicalRate).toFixed(2)}`;
  const fmtBase = (usdAmt) => `${baseCurrency?.symbol || "Ref."}${Number(usdAmt || 0).toFixed(2)}`;

  // Pantalla de exoneración. Ocupa el modal entero en vez de ser un campo más del cobro:
  // perdonar el saldo no es una variante de pagar y no debe poder marcarse de paso.
  if (forgiveMode) return (
    <Modal open={!!sale} onClose={() => { setForgiveMode(false); setForgiveReason(""); }} title="Exonerar saldo" width={460}>

      <div className="rounded-xl bg-white/[0.02] dark:bg-white/[0.04] border border-border/10 dark:border-white/[0.06] p-4 mb-5 space-y-1.5">
        <Row label="Factura" value={sale.invoice_number || sale.offline_ref || `#${sale.id}`} />
        {sale.customer_name && <Row label="Cliente" value={sale.customer_name} />}
        <Row label="Total" value={fmtBase(sale.total)} />
        {sale.amount_paid > 0 && <Row label="Ya pagado" value={fmtBase(sale.amount_paid)} valueClass="text-success" />}
        <div className="border-t border-border/70 dark:border-white/[0.08] pt-2 mt-2">
          <Row label="Se dejará de cobrar" value={forgiveLabel} valueClass="text-violet-500 dark:text-violet-400 font-bold" />
        </div>
      </div>

      <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3.5 mb-5">
        <p className="text-[12px] font-semibold text-content-subtle dark:text-white/50 leading-relaxed">
          La factura queda cerrada como <span className="font-bold text-violet-500 dark:text-violet-400">exonerada</span>: sale de
          cuentas por cobrar sin registrarse como cobrada. No devuelve mercancía al inventario ni genera
          crédito a favor del cliente. Se puede deshacer.
        </p>
      </div>

      <Field label="Motivo *">
        <input
          type="text"
          autoFocus
          maxLength={300}
          value={forgiveReason}
          onChange={e => setForgiveReason(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && forgiveReason.trim()) submitForgive(); }}
          placeholder="Ej: consumo del personal, diferencia de redondeo..."
          className="input h-10"
        />
      </Field>

      <div className="flex gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
        <button onClick={() => { setForgiveMode(false); setForgiveReason(""); }}
          className="flex-1 h-10 rounded-xl border border-border/40 dark:border-white/10 text-[12px] font-bold text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white hover:border-border dark:hover:border-white/20 transition-all">
          Volver
        </button>
        <button onClick={submitForgive} disabled={loading || !forgiveReason.trim()}
          className="flex-[2] h-10 rounded-xl bg-violet-500 text-white text-[12px] font-bold transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed">
          {loading ? "Exonerando..." : `Exonerar ${forgiveLabel}`}
        </button>
      </div>
    </Modal>
  );

  // Resumen de la factura: en el lateral en escritorio, arriba del todo en móvil. Es
  // contexto de solo lectura —qué se cobra y cómo queda—, así que se separa de los campos
  // que el cajero teclea para que no se pierda "entre tanta información".
  //
  // Saldo en la moneda con que se va a cobrar. Sin método elegido todavía no se sabe cuál
  // es, así que van las dos: el cajero le dice al cliente cuánto es en Bs y en Ref sin abrir
  // nada más. Elegido el método, solo la suya, que es la cifra que se va a teclear.
  const saldoBsDia  = defaultRate > 1 ? pendingBsAt(defaultRate) : null;
  const saldoRefTxt = fmtBase(pendingAfterCredit);
  const metodoElegido = combinado || !!form.payment_journal_id;
  let saldoMain, saldoAlt = null;
  if (metodoElegido) {
    saldoMain = isNonBasePay ? `${payCur?.symbol || defaultSym}${pendingPreciseBs.toFixed(2)}`
      : combinado ? (hasBsRate ? `${defaultSym}${pendingPreciseBs.toFixed(2)}` : saldoRefTxt)
      : saldoRefTxt;
  } else if (saldoBsDia !== null) {
    saldoMain = `${defaultSym}${saldoBsDia.toFixed(2)}`;
    // Con Ref.0,00 en base y bolívares por cobrar (ver forgiveSoloBs), el "Ref.0.00" de al
    // lado diría que no se debe nada: en ese caso solo va el monto en Bs.
    saldoAlt = pendingAfterCredit > settleTolerance(sale) ? saldoRefTxt : null;
  } else {
    saldoMain = saldoRefTxt;
  }

  const resumenFactura = (
    <div className="rounded-xl bg-surface-2 dark:bg-white/[0.04] p-4 space-y-2">
      <Row label="Factura" value={sale.invoice_number || sale.offline_ref || `#${sale.id}`} />
      {sale.customer_name && <Row label="Cliente" value={sale.customer_name} />}
      {sale !== venta ? (<>
        {/* Tasa de divisas aplicada en este cobro: en bolívares a la tasa especial el total
            sale inflado, y lo que se lee es la cuenta en la base —total, lo pagado y lo que se
            rebaja por pagar en divisas—. */}
        <Row label="Total" value={fmtBase(venta.total)} />
        {parseFloat(venta.amount_paid || 0) > 0 && <Row label="Ya pagado" value={fmtBase(venta.amount_paid)} />}
        <Row label="Pago en divisas" value={`−${fmtBase(fxPerdon)}`} valueClass="text-brand-700 dark:text-brand-300" />
      </>) : (
      <Row label="Total" value={hasBsRate ? `${defaultSym}${totalPreciseBs.toFixed(2)}` : fmt(sale.total)} />
      )}
      {/* Lo pagado y el crédito van a la MISMA tasa que el total y el saldo (ver pendingBsAt).
          Con fmt salían a la tasa de la factura y la resta no cuadraba: A-0007150 mostraba
          Total Bs.61685,25 (a 887,302), Ya pagado Bs.61500,00 (a 884,75) y Saldo Bs.7,86. */}
      {sale === venta && sale.amount_paid > 0 && (
        <Row label="Ya pagado" value={hasBsRate ? `${defaultSym}${roundBs2(sale.amount_paid * bsRate).toFixed(2)}` : fmt(sale.amount_paid)} />
      )}
      {creditApplied > 0 && (
        <Row label="Crédito aplicado" value={`−${hasBsRate ? `${defaultSym}${roundBs2(creditApplied * bsRate).toFixed(2)}` : fmt(creditApplied)}`} valueClass="text-brand-700 dark:text-brand-300" />
      )}
      <div className="border-t border-border/70 dark:border-white/[0.08] pt-2 mt-2">
        <Row label="Saldo pendiente"
          value={saldoMain}
          valueClass="text-content dark:text-white !text-[15px] !font-bold" />
        {saldoAlt && (
          <div className="text-right text-[12px] font-semibold text-content-subtle tabular-nums">{saldoAlt}</div>
        )}
      </div>
    </div>
  );

  return (
    <Modal open={!!sale} onClose={onClose} title="Registrar pago" width={880}>
      {/* Dos columnas en escritorio: a la izquierda lo que se teclea, a la derecha el
          contexto. En móvil se apila en el mismo orden: primero lo que el cajero teclea
          (método, monto recibido…), después el contexto (resumen, proyección, notas). */}
      <div className="flex flex-col lg:flex-row lg:gap-6">

        {/* ── Columna principal: lo que el cajero teclea ── */}
        <div className="flex-1 min-w-0 space-y-4">

        {/* La factura ya trae tasa de divisas (puesta en la caja al facturar, o en un cobro
            anterior): se dice siempre, no solo al elegir una caja en bolívares. Sin esto el
            interruptor desaparecía y parecía que la factura no tenía tasa. */}
        {parseFloat(venta?.fx_rate) > 0 && (
          <div className="rounded-xl border border-border/70 dark:border-white/[0.08] px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-content dark:text-white">Cobro en divisas</span>
              <span className="text-[13px] font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                Tasa {parseFloat(venta.fx_rate).toFixed(2)}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-content-subtle leading-snug">
              {["pendiente", "parcial"].includes(venta.status)
                ? `Esta factura se fió con tasa de divisas: sus bolívares se cobran a ${parseFloat(venta.fx_rate).toFixed(2)}.`
                : `Esta factura ya tiene tasa de divisas: sus bolívares se cobran a ${parseFloat(venta.fx_rate).toFixed(2)} y al menos una parte del pago va en divisas.`}
            </p>
          </div>
        )}

        {/* Cobro en divisas sobre una factura sin tasa (a crédito, o facturada sin ella). */}
        {puedeFxCobro && (
          <div className="rounded-xl border border-border/70 dark:border-white/[0.08]">
            <label className="flex items-center justify-between gap-3 px-3.5 h-11 cursor-pointer">
              <span className="text-[13px] font-medium text-content dark:text-white">Cobro en divisas</span>
              <span className="relative inline-flex items-center shrink-0">
                <input type="checkbox" className="sr-only peer" checked={fxCobroOn}
                  onChange={() => setFxCobroOn(v => !v)} />
                <span className="block w-10 h-6 rounded-full bg-border dark:bg-white/15 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-checked:bg-brand-600 dark:peer-checked:bg-brand-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
              </span>
            </label>
            {fxCobroOn && (
              <div className="px-3.5 pb-3.5 space-y-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{monedaBs.symbol}</span>
                  <input type="text" inputMode="decimal" autoComplete="off" autoFocus
                    value={fxCobroText}
                    onChange={e => setFxCobroText(e.target.value.replace(",", "."))}
                    placeholder={tasaSistemaBs.toFixed(2)}
                    aria-label="Tasa de divisas"
                    className={`w-full h-10 pl-11 pr-3 rounded-lg border bg-white dark:bg-white/[0.04] text-[13px] text-right tabular-nums text-content dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${fxCobroTasa > 0 && fxCobroTasa <= tasaSistemaBs ? "border-red-500" : "border-border dark:border-white/10 focus:border-brand-500"}`} />
                </div>
                <p className={`text-[12px] leading-snug ${fxCobroTasa > 0 && fxCobroTasa <= tasaSistemaBs ? "text-red-600 dark:text-red-400" : "text-content-subtle"}`}>
                  {fxCobroTasa > 0 && fxCobroTasa <= tasaSistemaBs
                    ? `Tiene que ser mayor que la del sistema (${tasaSistemaBs.toFixed(2)})`
                    : fxCobroActivo
                      ? `En divisas debe ${baseCurrency?.symbol || "Ref."} ${Math.max(0, parseFloat(sale.balance || 0)).toFixed(2)}. Se exoneran ${baseCurrency?.symbol || "Ref."} ${fxPerdon.toFixed(2)} al cobrar.`
                      : `Tasa a la que recibes la divisa. La del sistema es ${monedaBs.symbol} ${tasaSistemaBs.toFixed(2)}.`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Crédito de cliente */}
        {customerCredit > 0.001 && (
          <div className="rounded-xl bg-brand-500/[0.07] ring-1 ring-inset ring-brand-500/25 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-brand-700 dark:text-brand-300">
                Crédito disponible
              </span>
              <span className="text-[15px] font-bold text-brand-700 dark:text-brand-300 tabular-nums">
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
                className="flex-1 h-9 bg-white/[0.02] dark:bg-white/[0.04] border border-brand-500/30 rounded-xl px-3 text-[13px] font-semibold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
              />
              <button
                type="button"
                onClick={() => setCreditToApply(String(Math.min(customerCredit, balanceUsd).toFixed(6)))}
                className="px-3 h-9 rounded-xl btn-accent text-[11px] font-bold transition-all"
              >
                Aplicar todo
              </button>
            </div>
            {creditApplied > 0 && creditCoversAll && (
              <p className="text-[11px] font-bold text-success">
                ✓ El crédito cubre el saldo completo. No se requiere pago adicional.
              </p>
            )}
          </div>
        )}

        {/* Campos de pago — ocultos si el crédito cubre todo */}
        {!creditCoversAll && (<>

        {/* ── Pago combinado: varias formas de pago en un cobro ── */}
        {combinado && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[12px] font-medium text-content-subtle dark:text-white/50">Formas de pago *</p>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, pay_parts: [] }))}
                className="text-[11px] font-bold uppercase tracking-wide text-content-subtle dark:text-white/40 hover:text-danger transition-colors"
              >
                Pago simple
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
                        methodPrompt={{ tag: "Cobro", title: "¿Cómo paga esta parte?" }}
                        onSelect={(j) => setForm(p => {
                          const parts = [...p.pay_parts];
                          const cur = j?.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : baseCurrency;
                          const r = (!cur || cur.is_base) ? 1 : tasaDeVenta(sale, parseFloat(cur.exchange_rate || 1));
                          // Se sugiere lo que falta por cubrir, en la moneda de esta caja.
                          parts[idx] = { ...parts[idx], journal_id: j.id, payment_method: j.payment_method || null, amount: faltaEnMoneda(parts, idx, r).toFixed(2) };
                          return { ...p, pay_parts: parts };
                        })}
                      />
                    </div>
                    <div className="w-28 shrink-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={s.amount}
                        placeholder={s.sym}
                        onChange={e => setForm(p => {
                          const parts = [...p.pay_parts];
                          parts[idx] = { ...parts[idx], amount: e.target.value.replace(/[^\d.,]/g, "") };
                          return { ...p, pay_parts: parts };
                        })}
                        className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3 text-[13px] font-semibold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all tabular-nums"
                      />
                    </div>
                    {partesComb.length >= 2 && (
                      <button
                        type="button"
                        onClick={() => setForm(p => {
                          const rest = p.pay_parts.filter((_, i) => i !== idx);
                          if (rest.length >= 2) return { ...p, pay_parts: rest };
                          // Vuelve a pago simple con el tramo que queda.
                          const only = rest[0] || { journal_id: "", amount: "", reference: "" };
                          const jj = activeJournals.find(x => x.id === only.journal_id);
                          return {
                            ...p,
                            pay_parts: [],
                            payment_journal_id: only.journal_id || "",
                            payment_method: only.payment_method || null,
                            pay_currency_id: jj?.currency_id ? String(jj.currency_id) : "",
                            amount: only.amount || "",
                            received_amount: only.amount || "",
                            reference_number: only.reference || "",
                            rate: "",
                            change_parts: [{ journal_id: "", amount: "" }],
                          };
                        })}
                        className="w-10 h-10 shrink-0 rounded-xl border border-border/30 dark:border-white/10 text-content-subtle hover:text-danger hover:border-danger/40 transition-all flex items-center justify-center"
                        title="Quitar esta forma de pago"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                  {s.cur && !s.cur.is_base && s.base > 0 && (
                    <p className="text-[11px] font-semibold text-success">≈ {baseSym}{s.base.toFixed(2)} {baseCurrency?.code} · tasa {s.rate}</p>
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
                      className="w-full h-9 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3 text-[12px] font-semibold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all"
                    />
                  )}
                </div>
              ))}
            </div>
            {combNoUltimoExcede && (
              <p className="text-[11px] font-bold text-danger mt-1.5">Solo la última forma de pago puede exceder el saldo</p>
            )}
            <button
              type="button"
              onClick={() => setForm(p => ({ ...p, pay_parts: [...p.pay_parts, { journal_id: "", amount: "", reference: "" }] }))}
              className="w-full h-9 mt-2.5 rounded-xl border border-dashed border-border/40 dark:border-white/15 text-content-subtle dark:text-white/40 text-[11px] font-bold hover:border-brand-500/50 hover:text-brand-500 transition-all"
            >
              Otra forma de pago
            </button>
            <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-border/20 dark:border-white/5">
              <span className="text-[12px] font-medium tabular-nums text-content-subtle dark:text-white/40">
                Recibido {baseSym}{recibidoComb.toFixed(2)} de {baseSym}{pendingAfterCredit.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Botonera método → banco → caja, la misma en todo el sistema. Con "Pago Inmediato"
            llega ya elegida (lockedJournalId); desde Clientes / Facturas se elige acá. */}
        {!combinado && (
        <Field label="Método de pago *">
          <JournalPickerButton
            value={form.payment_journal_id}
            journals={activeJournals}
            onSelect={(j) => selectJournal(j.id, j.payment_method || null)}
            placeholder="Seleccionar método..."
            methodPrompt={{ tag: "Cobro", title: "¿Cómo paga el cliente?" }}
          />
        </Field>
        )}

        {/* Arranca en la del sistema y se puede escribir a mano para este cobro: la deuda se
            pacta en divisas y el cliente paga a la tasa del día en que paga —una factura vieja
            se cobra semanas después—. Mismo campo que ya usan ingresos y egresos, así que se
            comporta igual en todo el sistema: al tocarlo se pone en ámbar y ofrece restaurar. */}
        {isNonBasePay && tasaFx && (
          <Field label={`Tasa de cambio (${payCur.code})`}>
            <p className="h-10 px-3 flex items-center rounded-lg bg-surface-2 dark:bg-white/[0.04] text-[13px] text-content dark:text-white tabular-nums">
              {payCur.symbol} {tasaFx.toFixed(2)}
              <span className="ml-2 text-[12px] text-content-subtle">tasa de divisas de esta factura</span>
            </p>
          </Field>
        )}
        {isNonBasePay && !tasaFx && (
          <Field label={`Tasa de cambio (${payCur.code})`}>
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
                return { ...p, rate: v, amount: nuevo, received_amount: (parseFloat(nuevo) + avanceEnPago).toFixed(2) };
              })}
              configuredRate={payCurRate}
              currency={payCur}
            />
          </Field>
        )}

        {!combinado && (<>
        <Field label={avanceEnPago > 0 ? "Monto recibido del cliente, con el avance *" : "Monto recibido del cliente *"}>
          <input
            ref={receivedRef}
            type="text"
            inputMode="decimal"
            value={form.received_amount}
            onChange={e => {
              const val = e.target.value.replace(/[^\d.,]/g, "");
              const num = parseFloat(val.replace(",", "."));
              // Tope en la moneda de pago: en Bs → saldo línea por línea (9000); en $ → saldo
              // oficial (12.21), o el equivalente a tasa de efectivo cuando se usa.
              // Coincide con lo mostrado en "Saldo pendiente" y con el auto-relleno.
              // Con avance, lo recibido trae el avance encima: a la factura va el resto.
              const neto = !isNaN(num) ? num - avanceEnPago : NaN;
              const abono = !isNaN(neto) && neto > 0 ? Math.min(neto, maxInPayCur).toFixed(2) : "";
              setForm(p => ({ ...p, received_amount: val, amount: abono }));
            }}
            placeholder={`${paySym}0.00`}
            onKeyDown={e => {
              // Cobro inmediato: con el diario ya elegido y el monto prellenado, Enter cierra
              // la venta sin tener que buscar el botón. Solo si no hay vuelto que resolver.
              if (e.key === "Enter" && methodLocked && canSubmit && changeBase <= 0) {
                e.preventDefault();
                submit();
              }
            }}
            className="input h-10"
          />
        </Field>

        {/* Pasar a pago combinado: el 1er tramo es lo ya elegido, el 2º queda vacío. */}
        {form.payment_journal_id && (
          <button
            type="button"
            onClick={() => setForm(p => {
              const j = activeJournals.find(x => x.id === p.payment_journal_id);
              const isCashJ = j?.type === "efectivo";
              // El monto del tramo 1 se teclea en la moneda de su caja: si el pago simple
              // estaba en divisas, `form.amount` ya venía en esa moneda; en base, también.
              return {
                ...p,
                payment_journal_id: "", pay_currency_id: "", amount: "", received_amount: "", rate: "",
                pay_parts: [
                  { journal_id: p.payment_journal_id, payment_method: p.payment_method || null, amount: p.amount || "", reference: isCashJ ? "" : (p.reference_number || "") },
                  { journal_id: "", amount: "", reference: "" },
                ],
              };
            })}
            className="w-full h-9 -mt-1 rounded-lg border border-dashed border-border dark:border-white/15 text-content-muted dark:text-white/60 text-[13px] font-medium hover:border-brand-500/50 hover:text-brand-700 dark:hover:text-brand-300 hover:bg-brand-500/5 transition-colors"
          >
            Combinar con otra forma de pago
          </button>
        )}
        </>)}

        {/* Se pidió un avance en la revisión pero se eligió una forma de pago que no lo admite:
            se avisa en vez de perderlo sin decir nada. */}
        {avanceInicial && !puedeAvance && !!selectedJournal && (
          <p className="rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2.5 text-[12px] leading-snug">
            El avance de efectivo va por punto, pago móvil o transferencia, con una sola forma de pago. Con esta no se registra.
          </p>
        )}

        {/* Avance de efectivo en el mismo pase: el punto cobra la factura más el avance y su
            comisión, y los billetes salen de una caja de efectivo. */}
        {puedeAvance && (
          <div className="rounded-xl border border-border/70 dark:border-white/[0.08]">
            <label className="flex items-center justify-between gap-3 px-3.5 h-11 cursor-pointer">
              <span className="text-[13px] font-medium text-content dark:text-white">Avance de efectivo</span>
              <span className="relative inline-flex items-center shrink-0">
                <input type="checkbox" className="sr-only peer" checked={avance.on}
                  onChange={() => setAvance(p => ({ ...p, on: !p.on }))} />
                <span className="block w-10 h-6 rounded-full bg-border dark:bg-white/15 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 peer-checked:bg-brand-600 dark:peer-checked:bg-brand-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
              </span>
            </label>
            {avance.on && (
              <div className="px-3.5 pb-3.5 space-y-3">
                <div className="grid grid-cols-[1fr_96px] gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{curCajaAvance?.symbol || baseCurrency?.symbol}</span>
                    <input type="text" inputMode="decimal" autoComplete="off"
                      value={avance.monto}
                      onChange={e => setAvance(p => ({ ...p, monto: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") }))}
                      placeholder="0.00" aria-label="Efectivo a entregar"
                      className="w-full h-10 pl-11 pr-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-right tabular-nums text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                  </div>
                  <div className="relative">
                    <input type="text" inputMode="decimal" autoComplete="off"
                      value={avance.pct}
                      onChange={e => setAvance(p => ({ ...p, pct: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") }))}
                      placeholder="0" aria-label="Comisión en porcentaje"
                      className="w-full h-10 pl-3 pr-8 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-right tabular-nums text-content dark:text-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">%</span>
                  </div>
                </div>
                {cajasEfectivo.length > 1 && (
                  <JournalPickerButton value={cajaAvance?.id || ""} journals={cajasEfectivo} outflowOnly
                    onSelect={(j) => setAvance(p => ({ ...p, cash_journal_id: j.id }))}
                    placeholder="Caja de efectivo…" methodPrompt={{ tag: "Avance", title: "¿De qué caja sale el efectivo?" }} />
                )}
                {!cajaAvance ? (
                  <p className="text-[12px] text-red-600 dark:text-red-400">No hay una caja de efectivo en esta sucursal de la que sacar el avance.</p>
                ) : avanceEfectivo > 0 ? (
                  <dl className="rounded-lg bg-surface-2 dark:bg-white/[0.04] px-3 py-2.5 space-y-1 text-[12px]">
                    <div className="flex justify-between gap-3 text-content-subtle">
                      <dt>Entregas de {cajaAvance.name}</dt>
                      <dd><Money value={`${curCajaAvance?.symbol || ""} ${avanceEfectivo.toFixed(2)}`} /></dd>
                    </div>
                    <div className="flex justify-between gap-3 text-content-subtle">
                      <dt>Avance más comisión ({avancePct.toLocaleString("es-VE", { maximumFractionDigits: 3 })} %)</dt>
                      <dd><Money value={`${paySym} ${avanceCalc.total.toFixed(2)}`} /></dd>
                    </div>
                    <div className="flex justify-between items-baseline gap-3 pt-1.5 mt-1 border-t border-border/60 dark:border-white/[0.06]">
                      <dt className="font-semibold text-content dark:text-white">Pasar por {selectedJournal?.name || "el punto"}</dt>
                      <dd><Money value={`${paySym} ${((parseFloat(form.amount) || 0) + avanceCalc.total).toFixed(2)}`} className="text-[14px] font-bold text-content dark:text-white" /></dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-[12px] text-content-subtle leading-snug">El cliente pasa por el punto la factura más el avance con su comisión, y se lleva el efectivo de la caja.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sobrante */}
        {changeBase > 0 && (
          <div className="rounded-xl bg-amber-500/[0.07] ring-1 ring-inset ring-amber-500/25 p-4 space-y-3">
            {/* Título + monto */}
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-amber-700 dark:text-amber-400">Sobrante</span>
              <div className="text-right">
                <span className="text-[15px] font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                  {paySym}{changeDisplay.toFixed(2)}
                </span>
                {payCur && !payCur.is_base && (
                  <span className="block text-[11px] font-semibold text-content-subtle dark:text-white/30 tabular-nums">
                    ≈ {baseCurrency?.symbol}{changeBase.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            {/* Toggle dar cambio / quedarse / crédito */}
            <div className="flex p-[3px] gap-[2px] bg-surface-3 dark:bg-white/[0.06] rounded-lg">
              <button type="button"
                onClick={() => setForm(p => ({ ...p, keep_change: false, credit_change: false, change_parts: [{ journal_id: "", amount: "" }] }))}
                className={[
                  "flex-1 h-8 text-[13px] font-medium rounded-md transition-all",
                  !form.keep_change && !form.credit_change
                    ? "bg-white text-brand-700 font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)] dark:bg-white/15 dark:text-brand-300"
                    : "text-content-subtle hover:text-content dark:text-white/55 dark:hover:text-white"
                ].join(" ")}
              >
                Dar cambio
              </button>
              <button type="button"
                onClick={() => setForm(p => ({ ...p, keep_change: true, credit_change: false, change_parts: [{ journal_id: "", amount: "" }] }))}
                className={[
                  "flex-1 h-8 text-[13px] font-medium rounded-md transition-all",
                  form.keep_change
                    ? "bg-white text-brand-700 font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)] dark:bg-white/15 dark:text-brand-300"
                    : "text-content-subtle hover:text-content dark:text-white/55 dark:hover:text-white"
                ].join(" ")}
              >
                Quedarse
              </button>
              {sale?.customer_id && (
                <button type="button"
                  onClick={() => setForm(p => ({ ...p, keep_change: false, credit_change: true, change_parts: [{ journal_id: "", amount: "" }] }))}
                  className={[
                    "flex-1 h-8 text-[13px] font-medium rounded-md transition-all",
                    form.credit_change
                      ? "bg-white text-brand-700 font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.04)] dark:bg-white/15 dark:text-brand-300"
                      : "text-content-subtle hover:text-content dark:text-white/55 dark:hover:text-white"
                  ].join(" ")}
                >
                  Crédito
                </button>
              )}
            </div>

            {/* Nota de crédito al cliente */}
            {form.credit_change && (
              <p className="text-[12px] font-medium text-brand-700 dark:text-brand-300">
                {paySym}{changeDisplay.toFixed(2)} se añadirá al crédito del cliente.
              </p>
            )}

            {/* Selector de diario de cambio */}
            {!form.keep_change && !form.credit_change && (
              <div>
                <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 mb-1.5">Dar cambio desde <span className="text-red-500">*</span></p>
                {/* Misma botonera que "Pago Inmediato" (método → caja), filtrada a cajas con
                    salidas: dar vuelto por un Punto de Venta no tiene sentido. */}
                <div className="space-y-2">
                  {salidasCambio.map((salida, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => setChangePickerIdx(idx)}
                          className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-warning/40 rounded-xl px-3 flex items-center justify-between gap-2 text-[13px] font-semibold outline-none focus:border-warning/70 transition-all"
                        >
                          <span className={`truncate ${salida.journal_id ? "text-content dark:text-white" : "text-content-subtle/60 dark:text-white/25"}`}>
                            {salida.journal_id
                              ? (activeJournals.find(j => j.id === salida.journal_id)?.name || "Caja")
                              : "Elegir caja…"}
                          </span>
                          <svg className="w-4 h-4 shrink-0 text-content-subtle dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </button>
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
                          className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-warning/40 rounded-xl px-3 text-[13px] font-semibold text-content dark:text-white outline-none focus:border-warning/70 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20 tabular-nums"
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

                {changePickerIdx !== null && (
                  <ImmediatePayPicker
                    warehouseId={sale?.warehouse_id}
                    outflowOnly
                    methodPrompt={{ tag: "Dar cambio", title: "¿De qué caja sale el vuelto?" }}
                    onClose={() => setChangePickerIdx(null)}
                    onPick={(journal) => { asignarCajaCambio(changePickerIdx, journal.id, journal.payment_method || null); setChangePickerIdx(null); }}
                  />
                )}

                {faltaCajaEnCambio && (
                  <p className="text-[11px] font-bold text-danger mt-1.5">Selecciona de dónde saldrá el cambio</p>
                )}

                {/* Sin sencillo en una sola moneda: parte en divisas y el resto en bolívares. */}
                {sobranteRetenido > 0.001 && (
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, change_parts: [...p.change_parts, { journal_id: "", amount: "" }] }))}
                    className="w-full h-9 mt-2 rounded-xl border border-dashed border-warning/50 text-warning text-[11px] font-bold hover:bg-warning/10 transition-all"
                  >
                    Devolver el resto desde otra caja
                  </button>
                )}

                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-warning/20">
                  <span className="text-[12px] font-medium text-amber-700/80 dark:text-amber-400/80 tabular-nums">
                    Entregado {fmtBase(actualChangeBase)} de {fmtBase(changeBase)}
                  </span>
                  {/* Devolver menos que el cambio exacto deja esa diferencia dentro de la caja.
                      Se avisa acá y queda anotada en el cobro: es dinero que entró y que no
                      cubre nada de la factura. */}
                  {sobranteRetenido > 0.001 && (
                    <span className="text-[11px] font-bold text-warning tabular-nums">
                      Quedan {fmtBase(sobranteRetenido)} en caja
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <Field label="Fecha de referencia *">
          <DatePicker
            value={form.reference_date}
            onChange={v => setForm(p => ({ ...p, reference_date: v }))}
            className="w-full"
          />
        </Field>

        {/* N° Referencia (oculto si es efectivo) */}
        {!isCash && (
          <Field label="N° de referencia">
            <input
              type="text"
              value={form.reference_number}
              onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))}
              placeholder="Ej: 000123456"
              className="input h-10"
            />
          </Field>
        )}
        </>)}
        </div>
        {/* ── fin columna principal ── */}

        {/* ── Columna lateral: contexto de solo lectura ── */}
        <aside className="lg:w-[300px] shrink-0 space-y-4 mt-5 lg:mt-0 lg:border-l lg:border-border/20 dark:lg:border-white/5 lg:pl-6">

          {resumenFactura}

          {!creditCoversAll && (<>
            {/* Monto / Abono (readonly). La etiqueta usa el mismo criterio que el servidor:
                entregar 5,00 por una factura de 5,10 la cierra, así que llamarlo "abono
                parcial" sería anunciar algo que no va a pasar. */}
            <Field label={settlesInvoice ? "Pago completo a factura" : "Abono parcial a factura"}>
              <div className="w-full h-11 bg-surface-2 dark:bg-white/[0.04] rounded-lg px-3.5 flex items-center text-[17px] font-bold text-content dark:text-white tabular-nums">
                {paySym}{(payCur && !payCur.is_base ? amountNum : amountBase * payRate).toFixed(2)}
              </div>
              {payCur && !payCur.is_base && amountBase > 0 && (
                <p className="text-[12px] text-content-subtle mt-1.5 tabular-nums">
                  ≈ {baseCurrency?.symbol}{amountBase.toFixed(2)} {baseCurrency?.code} · tasa {payRate}
                </p>
              )}
            </Field>

            {/* Cómo queda la factura con este pago, para no tener que calcularlo de cabeza. */}
            {amountBase > 0 && (
              <div className={`rounded-xl p-4 space-y-2 ${settlesInvoice
                ? "bg-emerald-500/10"
                : "bg-surface-2 dark:bg-white/[0.04]"}`}>
                <div className="text-[13px] font-semibold text-content dark:text-white">
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
                  valueClass="text-content dark:text-white"
                />
                <div className="border-t border-border/70 dark:border-white/[0.08] pt-2">
                  <Row
                    label={settlesInvoice ? "Factura saldada" : "Saldo restante"}
                    value={isNonBasePay ? `${defaultSym}${remainingShown.toFixed(2)}` : fmtBase(settlesInvoice ? 0 : remainingBase)}
                    valueClass={`!text-[15px] !font-bold ${settlesInvoice ? "text-emerald-700 dark:text-emerald-400" : "text-content dark:text-white"}`}
                  />
                </div>
              </div>
            )}
          </>)}

          {/* Notas */}
          <Field label="Notas">
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Observaciones..."
              className="input h-10"
            />
          </Field>
        </aside>
      </div>

      {faltaDivisas && (
        <div className="mt-5 flex items-start gap-2 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2.5 text-[12px] leading-snug">
          <svg className="w-4 h-4 shrink-0 mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div className="flex-1 min-w-0">
            <p>Esta factura lleva tasa de divisas: al menos una parte del pago tiene que ser en divisas. Cobra en una caja en divisas o usa un pago combinado.</p>
            {/* Venta de contado que al final paga todo en Bs: vuelve a precio normal. Solo un
                borrador, que aún no tiene número fiscal (removeFxRate en el backend). */}
            {puedeQuitarTasa && (
              <button type="button" onClick={quitarTasa} disabled={quitandoTasa}
                className="mt-2 h-8 px-3 rounded-lg text-[12px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 inline-flex items-center gap-2 disabled:opacity-60">
                {quitandoTasa && <Spinner />}
                Quitar la tasa y cobrar a precio normal
              </button>
            )}
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
        <button onClick={onClose}
          className="btn-outline flex-1 h-10 rounded-lg text-[13px] font-semibold">
          Cancelar
        </button>
        <button onClick={submit} disabled={!canSubmit}
          className="btn-accent flex-[2] h-10 rounded-lg text-[13px] font-semibold active:scale-[0.99] disabled:!bg-surface-3 disabled:!bg-none disabled:!text-content-subtle disabled:!border-transparent disabled:!shadow-none dark:disabled:!bg-white/[0.06] disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {loading && <Spinner />}
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
            className="w-full h-9 rounded-lg text-[13px] font-medium text-content-subtle hover:text-violet-700 dark:hover:text-violet-300 hover:bg-violet-500/10 transition-colors"
          >
            Exonerar saldo de {fmtBase(balanceUsd)}
          </button>
        </div>
      )}
    </Modal>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
// Fila del resumen: etiqueta gris y valor en tinta. Los nombres llegan en mayúsculas desde la
// base y se muestran en caja normal (ver toNameCase).
function Row({ label, value, valueClass = "text-content dark:text-white" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-content-subtle shrink-0">{label}</span>
      <span className={`text-[13px] font-semibold tabular-nums text-right truncate ${valueClass}`}>
        {typeof value !== "string" ? value
          : /^[+\-−]?\s*(Ref\.|Bs\.?|\$|€|USD|VES)\s?\d/.test(value) ? <Money value={value} />
          : toNameCase(value)}
      </span>
    </div>
  );
}

// Etiqueta de campo. Un "*" al final marca el campo obligatorio: se dibuja aparte, en rojo,
// en vez de ir pegado al texto en mayúsculas como antes.
function Field({ label, children }) {
  const obligatorio = typeof label === "string" && /\s*\*$/.test(label);
  const texto = obligatorio ? label.replace(/\s*\*$/, "") : label;
  return (
    <div>
      <p className="text-[12px] font-semibold text-content-muted dark:text-white/70 mb-1.5">
        {texto}{obligatorio && <span className="text-red-500 ml-0.5">*</span>}
      </p>
      {children}
    </div>
  );
}
