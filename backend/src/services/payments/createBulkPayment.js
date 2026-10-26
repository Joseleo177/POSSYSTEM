const { Payment, Sale, Return, Sequelize, sequelize, Op, getSaleBalance } = require("./shared");
const { RECEIVABLE_STATUSES, resolveSaleStatus, saleSettleTolerance } = require("../../utils/saleBalance");
const { Expense, ExpenseCategory, PaymentJournal, Currency } = require("../../models");
const assignInvoiceNumber = require("../sales/assignInvoiceNumber");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { toLocalDate } = require("../../utils/localDate");
const { addCreditMovement } = require("../customers/creditLedger");
const { assertJournalsInWarehouse } = require("../../utils/journalWarehouse");
const { resolveMethod } = require("../../utils/journalMethod");
const { tasaDivisasDeCaja, tienePagoEnDivisas, exentaDeDivisas } = require("../sales/fxRate");
const { netoLineaEnTasa } = require("../sales/lineDiscount");
const { aplicarTasaEnCobro } = require("./createPayment");
const { SaleItem } = require("../../models");

// Margen para el SOBRANTE del cobro (lo entregado de más que obliga a declarar vuelto, caja o
// crédito). Coincide con el que usa BulkPaymentModal para abrir ese paso, y no decide si una
// factura queda saldada: eso lo hace el margen de redondeo de cada una (saleSettleTolerance).
const SOBRANTE_TOLERANCE = 0.10;

const err = (message, status = 400) =>
  Object.assign(new Error(message), { status, isOperational: true });

/**
 * Cobro de varias facturas del mismo cliente con un solo monto.
 *
 * El cliente entrega una sola vez —arrastra cuentas viejas y quiere saldar todo junto—, pero
 * adentro se registra UN COBRO POR FACTURA. Cada factura es un documento fiscal con su
 * correlativo y su saldo: un pago suelto contra "el cliente" dejaría facturas que no saben
 * cómo se saldaron, y descuadraría los reportes que cruzan pagos con ventas.
 *
 * El monto se imputa de la más vieja a la más nueva: se saldan completas mientras alcance y
 * la última queda con abono parcial. Es el criterio contable corriente y evita dejar media
 * docena de facturas a medio pagar que hay que volver a perseguir.
 *
 * `amount` viene en moneda BASE, igual que en createPayment; `exchange_rate` es la tasa con la
 * que se cobró y viaja a cada Payment para que el histórico sepa a cuánto entró el dinero. Una
 * factura con tasa de divisas recibe la suya en vez de esa (ver el reparto más abajo).
 */
module.exports = async function createBulkPayment(body, req) {
  const {
    sale_ids,
    amount,
    currency_id,
    exchange_rate,
    payment_journal_id,
    payment_method,     // por qué método entró: la cuenta acepta varios (ver utils/journalMethod)
    employee_id,
    reference_date,
    reference_number,
    notes,
    idempotency_key,
    // Sobrante cuando el cliente entrega de más. Mismos tres destinos que en el cobro de una
    // factura suelta: se le devuelve, se queda en caja, o se le acredita a su favor.
    change_given,       // vuelto entregado, en moneda base
    change_journal_id,  // de qué caja sale ese vuelto
    // Vuelto repartido entre varias cajas: [{ journal_id, amount }] con el monto en moneda
    // BASE. Devolver 5$ en divisas y el resto en bolívares es lo corriente cuando no hay
    // sencillo, y cada tramo tiene que salir de la caja por la que salió de verdad: cargarlo
    // todo a una deja esa gaveta corta y la otra larga.
    change_parts,
    change_payment_method,
    surplus_kept,       // sobrante que se queda en la caja
    change_to_credit,   // sobrante que va al crédito del cliente
    // Pago combinado: varias formas de pago para el lote, cada una con su caja/monto (ya en
    // base, lo convierte el frontend) /moneda/referencia. El sobrante se descuenta del ÚLTIMO
    // tramo. >1 = combinado.
    pay_parts,
    // Tasa de divisas aplicada al cobrar: { rate, currency_id, forgive: { [sale_id]: base } }.
    fx_cobro,
  } = body;

  const ids = [...new Set((sale_ids || []).map(n => parseInt(n, 10)).filter(Number.isInteger))];
  if (!ids.length) throw err("Debes seleccionar al menos una factura");
  if (!reference_date) throw err("La fecha de referencia es requerida");

  const parts = (Array.isArray(pay_parts) && pay_parts.length > 1) ? pay_parts : null;
  const partsNorm = parts ? pay_parts.map(p => ({
    journal_id: parseInt(p?.journal_id, 10),
    base: parseFloat(p?.amount) || 0,
    currency_id: p?.currency_id ?? null,
    exchange_rate: parseFloat(p?.exchange_rate) || 1,
    reference_number: p?.reference_number?.trim() || null,
    payment_method: p?.payment_method || null,
  })) : null;
  if (parts) {
    for (const p of partsNorm) {
      if (!Number.isInteger(p.journal_id)) throw err("El diario de cada forma de pago es requerido");
      if (!(p.base > 0)) throw err("El monto de cada forma de pago debe ser mayor a 0");
    }
  } else if (!payment_journal_id) {
    throw err("Debes seleccionar el método de pago");
  }

  const totalPay = parts
    ? parseFloat(partsNorm.reduce((a, p) => a + p.base, 0).toFixed(6))
    : parseFloat(amount || 0);
  if (!(totalPay > 0)) throw err("El monto es requerido");

  // Un vuelto de una sola caja se expresa igual que uno repartido: una parte.
  const partesVuelto = (Array.isArray(change_parts) && change_parts.length)
    ? change_parts
        .map(p => ({ journal_id: p?.journal_id, amount: parseFloat(p?.amount || 0), payment_method: p?.payment_method || null }))
        .filter(p => p.amount > 0)
    : (parseFloat(change_given || 0) > 0
        ? [{ journal_id: change_journal_id, amount: parseFloat(change_given), payment_method: change_payment_method || null }]
        : []);

  if (partesVuelto.some(p => !p.journal_id)) throw err("Debes indicar de qué caja sale cada vuelto");

  const changeAmt  = parseFloat(partesVuelto.reduce((acc, p) => acc + p.amount, 0).toFixed(6));
  const surplusAmt = parseFloat(surplus_kept || 0);
  const creditAmt  = parseFloat(change_to_credit || 0);

  // Reintento del mismo lote: la caja reenvía tras perder la respuesta. Las claves por factura
  // se derivan de esta, y se busca CUALQUIERA de ellas, no la de la primera factura de la
  // lista: el monto se imputa por antigüedad y puede agotarse antes de llegar a esa, con lo
  // que sondear solo su clave daba "no registrado" y el reintento volvía a cobrar.
  const loteYaRegistrado = async () => {
    if (!idempotency_key) return null;
    // Simple: una clave por factura (`clave-<id>`). Combinado: además por tramo
    // (`clave-<id>-<m>`). Un LIKE cubre las dos formas.
    const pagos = await Payment.findAll({ where: { idempotency_key: { [Op.like]: `${idempotency_key}-%` } } });
    if (!pagos.length) return null;

    const ventas = await Sale.findAll({ where: { id: { [Op.in]: pagos.map(p => p.sale_id) } } });
    const porId = Object.fromEntries(ventas.map(v => [v.id, v]));
    return {
      applied: pagos.map(p => ({
        sale_id: p.sale_id,
        invoice_number: porId[p.sale_id]?.invoice_number || null,
        payment_id: p.id,
        amount: parseFloat(p.amount),
        sale_status: porId[p.sale_id]?.status || null,
      })),
      total_applied: parseFloat(pagos.reduce((acc, p) => acc + parseFloat(p.amount), 0).toFixed(6)),
      leftover: 0,
      settled_count: pagos.filter(p => porId[p.sale_id]?.status === "pagado").length,
      duplicated: true,
    };
  };

  const yaEntro = await loteYaRegistrado();
  if (yaEntro) return yaEntro;

  // Método de cada forma de pago y de cada caja del vuelto, validado contra su cuenta.
  const metodoSimple = parts ? null : await resolveMethod(payment_journal_id, payment_method, "in");
  if (parts) for (const p of partsNorm) p.payment_method = await resolveMethod(p.journal_id, p.payment_method, "in");
  for (const parte of partesVuelto) parte.payment_method = await resolveMethod(parte.journal_id, parte.payment_method, "out");

  // Marca de lote: ata entre sí los cobros que entraron en un solo acto para que la caja los
  // vea como el único movimiento que fueron. Se deriva de la clave de idempotencia cuando la
  // hay, así el reintento de un lote no inventaría un lote distinto.
  const batchId = (idempotency_key || `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64);

  const t = await sequelize.transaction();
  try {
    const ventas = await Sale.findAll({
      where: { id: { [Op.in]: ids } },
      order: [["created_at", "ASC"]],   // lo más viejo primero
      transaction: t,
      lock: true,
    });
    if (ventas.length !== ids.length) throw err("Alguna de las facturas no existe", 404);

    // Todas del mismo cliente: cobrar de un tirón facturas de dos personas distintas solo puede
    // ser un error de selección, y el dinero terminaría imputado a quien no pagó.
    const clientes = new Set(ventas.map(v => v.customer_id ?? null));
    if (clientes.size > 1) throw err("Las facturas seleccionadas no son del mismo cliente");

    // Todas de la misma sucursal: el cobro genera UN solo movimiento de caja (una sola caja,
    // un solo vuelto), y ese movimiento tiene que poder atribuirse a la sucursal donde de
    // verdad entró el dinero. Mezclarlas dejaría el arqueo de una tienda con un ingreso que no
    // le corresponde, o sin uno que sí — y el vuelto de abajo solo se guarda con la sucursal de
    // la primera factura, así que las demás quedarían mal atribuidas.
    const sucursales = new Set(ventas.map(v => v.warehouse_id ?? null));
    if (sucursales.size > 1) throw err("Las facturas seleccionadas no son de la misma sucursal");

    // El diario del cobro (o los de los tramos) y los del vuelto tienen que ser de esa
    // sucursal (o compartidos).
    await assertJournalsInWarehouse(
      [
        ...(parts ? partsNorm.map(p => p.journal_id) : [payment_journal_id]),
        ...partesVuelto.map(p => p.journal_id),
      ],
      ventas[0].warehouse_id,
      t,
    );

    // Tasa de divisas aplicada en este cobro a las facturas que no la traían: como en el cobro
    // de una factura suelta (aplicarTasaEnCobro), su total no se toca y la diferencia se
    // exonera. `forgive` trae lo de cada una, calculado por la caja y topado aquí. Las que ya
    // tenían tasa conservan la suya. Va dentro de la transacción: si el cobro no entra, no se
    // perdona nada.
    const conTasaEnEsteLote = new Set();
    if (fx_cobro && typeof fx_cobro.forgive === "object") {
      for (const venta of ventas) {
        const perdon = parseFloat(fx_cobro.forgive[venta.id]);
        if (!(perdon > 0)) continue;
        await aplicarTasaEnCobro(venta.id, { rate: fx_cobro.rate, forgive: perdon, currency_id: fx_cobro.currency_id }, req, employee_id, t);
        conTasaEnEsteLote.add(venta.id);
        await venta.reload({ transaction: t });
      }
    }

    const conSaldo = [];
    for (const venta of ventas) {
      await assertWarehouseAccess(req, venta.warehouse_id, { optional: true });

      if (!RECEIVABLE_STATUSES.includes(venta.status)) {
        const etiqueta = venta.invoice_number || `#${venta.id}`;
        if (venta.status === "pagado")    throw err(`La factura ${etiqueta} ya fue pagada`);
        if (venta.status === "exonerado") throw err(`La factura ${etiqueta} fue exonerada: no tiene saldo por cobrar`);
        if (venta.status === "anulado")   throw err(`La factura ${etiqueta} está anulada`);
        if (venta.status === "devuelto")  throw err(`La factura ${etiqueta} fue devuelta en su totalidad`);
        throw err(`La factura ${etiqueta} no está por cobrar`);
      }

      const cobrado = await getSaleBalance(venta.id, t);
      const devuelto = parseFloat(await Return.sum("total", {
        where: { sale_id: venta.id, status: { [Sequelize.Op.ne]: "anulado" } },
        transaction: t,
      }) || 0);
      const saldo = parseFloat((Math.max(0, parseFloat(venta.total) - devuelto) - cobrado).toFixed(6));
      // Margen de redondeo propio de la factura: decide si entra al reparto y si queda saldada.
      const tolerancia = await saleSettleTolerance(venta, t);
      if (saldo > tolerancia) {
        // Las líneas, para valorar la deuda en bolívares como la valora la caja (ver deudaEnTasa).
        const lineas = await SaleItem.findAll({ where: { sale_id: venta.id }, transaction: t, raw: true });
        conSaldo.push({ venta, saldo, cobrado, devuelto, tolerancia, lineas });
      }
    }

    if (!conSaldo.length) throw err("Las facturas seleccionadas no tienen saldo por cobrar");

    const deudaTotal = conSaldo.reduce((acc, x) => acc + x.saldo, 0);

    // ── Formas de pago y la tasa de cada factura en cada una ──────────────────
    // El reparto se hace en la moneda de cada forma de pago, no en la base. Cada factura se
    // convierte a SU tasa: una con tasa de divisas (sales/fxRate.js) cobra sus bolívares a esa
    // tasa, y las demás a la del cobro. Así se pueden saldar juntas la factura de ayer con tasa
    // especial y la de hoy sin ella, y los bolívares registrados (monto × tasa de cada cobro)
    // suman exactamente los que entraron. En divisas todas las tasas son 1 y es el reparto de
    // siempre.
    const formas = parts
      ? partsNorm.map((p, i) => ({ ...p, rate: p.exchange_rate, mIdx: i }))
      : [{
          journal_id: payment_journal_id, base: totalPay, rate: parseFloat(exchange_rate) || 1,
          currency_id: currency_id || null, payment_method: metodoSimple,
          reference_number: reference_number?.trim() || null, mIdx: 0,
        }];
    // Deuda de una factura en bolívares a la tasa `r`, línea por línea: la misma cuenta que hace
    // BulkPaymentModal (saldoEnMonedaDePagoAt) para pedirle el monto al cliente. Repartir con el
    // saldo en base × tasa daba otra cifra —el total en base redondea cada línea en $— y la
    // primera factura se llevaba de más mientras la última quedaba 'parcial' por céntimos, aun
    // pagando exactamente lo pedido.
    //
    // Todo —total, lo cobrado y lo devuelto— a la MISMA tasa, como el cobro de una factura
    // suelta (pendingBsAt) y Facturas pendientes: la deuda es en base y se cobra a la tasa de
    // hoy. Convertir lo ya abonado a la tasa de su día descuadraba: con A-0100 (abono de 2,04 a
    // 877,90) el cobro conjunto pedía Bs.19,17 más que Pendientes por las mismas facturas.
    // `cobrado` (getSaleBalance) ya trae el crédito aplicado y lo exonerado.
    const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
    const deudaEnTasa = ({ venta, cobrado, devuelto, lineas }, r) => {
      const totalBs = round2(
        lineas.reduce((acc, l) => acc + netoLineaEnTasa(l, r), 0)
        - round2(parseFloat(venta.discount_amount || 0) * r)
        + round2(parseFloat(venta.service_charge || 0) * r)
      );
      return Math.max(0, round2(totalBs - round2(cobrado * r) - round2(devuelto * r)));
    };
    for (const f of formas) {
      f.tasas = new Map();
      for (const item of conSaldo) {
        const fx = await tasaDivisasDeCaja(item.venta, f.journal_id, t);
        const rate = fx || f.rate;
        f.tasas.set(item.venta.id, { rate, fx: !!fx, deudaU: rate > 1 && item.lineas.length ? deudaEnTasa(item, rate) : null });
      }
    }

    // Reparto de la más vieja a la más nueva. `destinadoBase` (vuelto + sobrante en caja + al
    // crédito) se descuenta de la ÚLTIMA forma de pago. Devuelve los chunks y lo que sobró de
    // cada forma, en su moneda.
    const repartir = (destinadoBase) => {
      const chunks = [];
      const rest = new Map(conSaldo.map(x => [x.venta.id, x.saldo]));
      const sobraPorForma = [];
      formas.forEach((f, fi) => {
        let u = f.base * f.rate;
        if (fi === formas.length - 1) {
          u -= destinadoBase * f.rate;
          if (u < -SOBRANTE_TOLERANCE * f.rate) throw err("La última forma de pago no alcanza para cubrir el vuelto/sobrante");
        }
        // Un pequeño negativo por redondeo se lleva a 0: esa forma va entera al sobrante.
        u = Math.max(0, parseFloat(u.toFixed(6)));
        for (const item of conSaldo) {
          if (u <= 0.000001) break;
          const restB = rest.get(item.venta.id);
          if (restB <= 0.000001) continue;
          const { rate: r, fx, deudaU } = f.tasas.get(item.venta.id);
          // Lo que se debe en la moneda de esta forma: en bolívares, la deuda línea por línea menos
          // lo que ya cubrieron las formas anteriores de este lote, convertido a la misma tasa
          // (como resta lo ya cobrado el cobro de una factura suelta: 13.224,37 − 12 × 1100);
          // en divisas, el saldo en base.
          const cubierto = item.saldo - restB;
          // En divisas, el saldo en céntimos, que es lo que la caja muestra y le pide al cliente:
          // con la tasa aplicada al cobrar el saldo en base trae más decimales (11,0528), y
          // repartir con ellos le cargaba a la última factura los medios céntimos de todas.
          const deuda = deudaU != null
            ? Math.max(0, round2(deudaU - round2(cubierto * r)))
            : (r === 1 ? round2(restB) : restB * r);
          if (deuda <= 0.000001) { rest.set(item.venta.id, 0); continue; }
          const aplicarU = Math.min(u, deuda);
          const cubre = aplicarU >= deuda - 0.000001;
          // Se registra el dinero que entró (aplicarU a su tasa), no el saldo en base: los
          // céntimos de diferencia los absorbe el margen de redondeo de la factura.
          const aplicar = parseFloat((aplicarU / r).toFixed(6));
          chunks.push({
            item, aplicar, fx, journal_id: f.journal_id, payment_method: f.payment_method,
            currency_id: f.currency_id, exchange_rate: r, reference_number: f.reference_number, mIdx: f.mIdx,
          });
          rest.set(item.venta.id, cubre ? 0 : Math.max(0, parseFloat((restB - aplicar).toFixed(6))));
          u = parseFloat((u - aplicarU).toFixed(6));
        }
        sobraPorForma.push(Math.max(0, u));
      });
      const sobraBase = parseFloat(formas.reduce((a, f, fi) => a + sobraPorForma[fi] / f.rate, 0).toFixed(6));
      return { chunks, sobraPorForma, sobraBase };
    };

    // Lo que el cliente entregó de más tiene que tener destino declarado: se le devuelve, se
    // queda en la caja o se le acredita. Sin eso el dinero entraría a la gaveta sin que nada
    // lo explique, y el arqueo del turno cerraría con un sobrante que nadie sabe de dónde salió.
    // Se mide repartiendo, no restando en la base: los bolívares que van a una factura con tasa
    // de divisas cubren menos base que los que van a una sin ella.
    const sobrante = repartir(0).sobraBase;
    const destinado = parseFloat((changeAmt + surplusAmt + creditAmt).toFixed(6));
    // El destino tiene que cubrir el sobrante SALVO por el desfase de redondeo: el frontend
    // muestra y manda el sobrante a 2 decimales mientras que acá se calcula con la deuda
    // exacta, y esos milésimos no son dinero sin declarar.
    if (sobrante > SOBRANTE_TOLERANCE && destinado < sobrante - SOBRANTE_TOLERANCE) {
      throw err(
        `Recibiste ${(sobrante).toFixed(2)} de más sobre la deuda de ${deudaTotal.toFixed(2)}: indica si se devuelve, se queda en caja o va al crédito del cliente`
      );
    }
    // Con pago parcial `sobrante` es negativo (el cliente entregó menos que la deuda): sin el
    // Math.max, cualquier `destinado` —incluido 0— superaba ese negativo y el cobro se rechazaba
    // aunque no hubiera vuelto que declarar.
    if (destinado > Math.max(0, sobrante) + SOBRANTE_TOLERANCE) {
      throw err(`El vuelto y el sobrante suman más de lo que se recibió por encima de la deuda`);
    }
    if (creditAmt > 0 && !conSaldo[0].venta.customer_id) {
      throw err("La factura no tiene cliente al que acreditarle el sobrante");
    }

    // Lo que va a las facturas es el dinero recibido menos lo que tiene otro destino. NO se
    // recorta al saldo exacto: el cliente paga en bolívares y redondea al billete (Bs.15968
    // por una deuda de Bs.15967,90), y recortar guardaba 15967,90 —diez céntimos menos de los
    // que el cajero tiene en la mano—. Se registra lo recibido, igual que el cobro de una
    // factura suelta, y el céntimo de diferencia lo absorbe la última factura del reparto.
    //
    // Un "chunk" es (una factura, una forma de pago, un monto en base, la tasa de esa factura en
    // esa forma). En pago simple hay uno por factura; en combinado, cada forma cubre facturas de
    // la más vieja a la más nueva con un cursor global.
    const { chunks, sobraPorForma } = repartir(destinado);

    // El resto por debajo de la tolerancia (redondeo al billete) se lo lleva el último chunk de
    // la MISMA forma de pago, convertido a su tasa: es dinero que entró por esa caja.
    let leftover = 0;
    formas.forEach((f, fi) => {
      const sobra = sobraPorForma[fi];
      if (sobra <= 0.000001) return;
      const ultimo = [...chunks].reverse().find(c => c.mIdx === f.mIdx) || chunks[chunks.length - 1];
      if (ultimo) ultimo.aplicar = parseFloat((ultimo.aplicar + sobra / ultimo.exchange_rate).toFixed(6));
      else leftover = parseFloat((leftover + sobra / f.rate).toFixed(6));
    });

    // ── Crear los pagos, agrupados por factura para fijar su estado una sola vez ──
    const porVenta = new Map();
    for (const c of chunks) {
      const id = c.item.venta.id;
      if (!porVenta.has(id)) porVenta.set(id, []);
      porVenta.get(id).push(c);
    }

    // Factura con tasa de divisas que recibe bolívares: tiene que haber dinero en divisas (ver
    // exigirPagoEnDivisas en sales/fxRate.js). En el cobro conjunto basta con que el LOTE traiga
    // una forma de pago en divisas: el reparto va de la más vieja a la más nueva, y exigirlo
    // factura por factura rechazaría "$20 y el resto en Bs" solo porque los dólares se los
    // llevaron las facturas viejas. Sin divisas en el lote, cada una necesita un cobro previo.
    const ventasFx = conSaldo.map(x => x.venta).filter(v => parseFloat(v.fx_rate) > 0);
    if (ventasFx.length) {
      const cajas = await PaymentJournal.findAll({
        where: { id: formas.map(f => f.journal_id) }, attributes: ["id", "currency_id"], transaction: t,
      });
      const monedaFx = parseInt(ventasFx[0].fx_currency_id);
      const loteTraeDivisas = cajas.some(c => parseInt(c.currency_id) !== monedaFx);
      if (!loteTraeDivisas) {
        for (const cs of porVenta.values()) {
          const { venta } = cs[0].item;
          if (!cs.some(c => c.fx)) continue;
          // Fiada con tasa antes de la regla de contado: se cobra en Bs a su tasa (ver
          // exentaDeDivisas). La que recibe la tasa en este lote, no.
          if (exentaDeDivisas(venta, conTasaEnEsteLote.has(venta.id))) continue;
          if (await tienePagoEnDivisas(venta, t)) continue;
          throw err(`La factura ${venta.invoice_number || `#${venta.id}`} lleva tasa de divisas: al menos una parte del pago tiene que ser en divisas. Usa un pago combinado.`);
        }
      }
    }

    const applied = [];
    let ultimoPagoId = null;          // último pago creado (fallback para el sobrante)
    let pagoUltimoMetodoId = null;    // un pago de la ÚLTIMA forma de pago: ahí va el sobrante
    const ultimoMetodoIdx = parts ? partsNorm.length - 1 : -1;

    for (const cs of porVenta.values()) {
      const { venta, saldo, cobrado, devuelto, tolerancia } = cs[0].item;
      if (["borrador", "espera"].includes(venta.status)) {
        await assignInvoiceNumber(venta, t);
      }
      const aplicadoVenta = parseFloat(cs.reduce((a, c) => a + c.aplicar, 0).toFixed(6));
      const paymentIds = [];

      for (const c of cs) {
        const pago = await Payment.create({
          sale_id: venta.id,
          customer_id: venta.customer_id,
          amount: c.aplicar,
          currency_id: c.currency_id || venta.currency_id || null,
          exchange_rate: c.exchange_rate || venta.exchange_rate || 1,
          payment_journal_id: c.journal_id,
          payment_method: c.payment_method,
          employee_id: employee_id || null,
          reference_date,
          reference_number: c.reference_number,
          notes: [notes?.trim(), `Cobro conjunto de ${conSaldo.length} facturas`].filter(Boolean).join(" · "),
          idempotency_key: idempotency_key ? `${idempotency_key}-${venta.id}${parts ? `-${c.mIdx}` : ""}` : null,
          batch_id: batchId,
        }, { transaction: t });
        paymentIds.push(pago.id);
        ultimoPagoId = pago.id;
        if (c.mIdx === ultimoMetodoIdx) pagoUltimoMetodoId = pago.id;
      }

      const salda = (saldo - aplicadoVenta) <= tolerancia;
      // `cobrado` (getSaleBalance) ya incluye lo exonerado: se le quita para no contarlo dos
      // veces, que daba por saldada una factura a la que aún le faltaba lo perdonado. La rebaja
      // por pagar en divisas (fx_forgiven) salda pero no deja la factura 'exonerado'.
      const exonerado = parseFloat(venta.forgiven_amount) || 0;
      const nuevoEstado = resolveSaleStatus({
        saleTotal: venta.total,
        paid: cobrado - exonerado + aplicadoVenta,
        returned: devuelto,
        forgiven: exonerado,
        forgivenFx: venta.fx_forgiven,
        hasInvoice: !!venta.invoice_number,
        tolerance: tolerancia,
      });
      await venta.update({ status: nuevoEstado }, { transaction: t });

      applied.push({
        sale_id: venta.id,
        invoice_number: venta.invoice_number || null,
        payment_id: paymentIds[0],
        payment_ids: paymentIds,
        amount: aplicadoVenta,
        balance: salda ? 0 : parseFloat((saldo - aplicadoVenta).toFixed(6)),
        sale_status: nuevoEstado,
      });
    }

    // ── Sobrante ──────────────────────────────────────────────────────────────
    // Todo lo que el cliente entregó por encima de la deuda se cuelga de UN cobro del lote —el
    // que representa el billete que entró—, no repartido entre las facturas: ese dinero no es
    // de ninguna y sumárselo las dejaría cobradas de más. En pago simple es el primer cobro;
    // en combinado, el último (el sobrante se descontó del último tramo). Mismo criterio que
    // el cobro de una factura suelta (ver createPayment).
    if (parts && !pagoUltimoMetodoId && (changeAmt + surplusAmt + creditAmt) > SOBRANTE_TOLERANCE) {
      throw err("La última forma de pago debe aplicarse a la deuda, no ser solo vuelto/sobrante");
    }
    const pagoSobranteId = parts
      ? (pagoUltimoMetodoId || ultimoPagoId)
      : (applied[0] && applied[0].payment_id);
    const pagoSobrante = pagoSobranteId
      ? await Payment.findByPk(pagoSobranteId, { transaction: t })
      : null;
    // El sobrante llega en base a la tasa de su forma de pago (la última). Si el cobro que lo
    // carga es de una factura con tasa de divisas, se reexpresa a la tasa de ese cobro: así sus
    // bolívares (monto × tasa) siguen siendo los que de verdad entraron.
    const aTasaDelPago = (base) => pagoSobrante
      ? parseFloat((base * formas[formas.length - 1].rate / (parseFloat(pagoSobrante.exchange_rate) || 1)).toFixed(6))
      : base;

    if (changeAmt > 0 && pagoSobrante) {
      // El billete entró completo y el vuelto salió: se registran los dos movimientos, para
      // que la gaveta cuadre contra lo que realmente pasó por ella. getSaleBalance descuenta
      // change_given, así que la factura sigue acreditada solo por lo suyo.
      await pagoSobrante.update(
        { amount: parseFloat((parseFloat(pagoSobrante.amount) + aTasaDelPago(changeAmt)).toFixed(6)),
          change_given: aTasaDelPago(changeAmt),
          // Con el vuelto repartido, el pago apunta a la primera caja: es el marcador que hace
          // que el saldo de la factura descuente el vuelto. El detalle de por dónde salió cada
          // tramo vive en los egresos, uno por caja.
          change_journal_id: partesVuelto[0].journal_id },
        { transaction: t }
      );

      const [catCambio] = await ExpenseCategory.findOrCreate({
        where: { name: "Cambio / Vuelto" },
        defaults: { name: "Cambio / Vuelto", active: true },
        transaction: t,
      });

      const varias = partesVuelto.length > 1;
      for (const parte of partesVuelto) {
        const diarioCambio = await PaymentJournal.findByPk(parte.journal_id, {
          include: [{ model: Currency, attributes: ["id", "exchange_rate"] }],
          transaction: t,
        });
        if (!diarioCambio) throw err("La caja del vuelto no existe", 404);
        await Expense.create({
          description: varias
            ? `Cambio entregado (parte) — cobro conjunto de ${conSaldo.length} facturas`
            : `Cambio entregado — cobro conjunto de ${conSaldo.length} facturas`,
          amount: parte.amount,
          rate: parseFloat(diarioCambio?.Currency?.exchange_rate || 1),
          // La fecha del vuelto es la del cobro, no la del instante en que se grabó: sin esto
          // el egreso caía a su created_at con hora, mientras que los cobros van a medianoche
          // por su reference_date, y el estado de cuenta separaba un cobro de su propio vuelto.
          //
          // Por toLocalDate: el string crudo se ancla a la zona del proceso y en Vercel (UTC)
          // el egreso quedaría un día antes que su cobro.
          date: toLocalDate(reference_date),
          category_id: catCambio.id,
          payment_journal_id: parte.journal_id,
          payment_method: parte.payment_method,
          employee_id: employee_id || null,
          currency_id: diarioCambio?.currency_id || null,
          warehouse_id: conSaldo[0].venta.warehouse_id || null,
          notes: varias ? `Vuelto repartido en ${partesVuelto.length} cajas` : null,
          status: "activo",
        }, { transaction: t });
      }
    }

    // Sobrante que se queda en la caja o que se le acredita al cliente: en los dos casos el
    // dinero SÍ está en la gaveta, así que entra al cobro; lo que cambia es si el cliente
    // conserva un saldo a favor por él.
    const seQueda = parseFloat((surplusAmt + creditAmt).toFixed(6));
    if (seQueda > 0 && pagoSobrante) {
      // Se relee: pudo haber cambiado su `amount` arriba con el vuelto.
      const pago = await Payment.findByPk(pagoSobranteId, { transaction: t });
      const detalle = [
        surplusAmt > 0 ? `sobrante en caja ${surplusAmt.toFixed(2)}` : null,
        creditAmt  > 0 ? `${creditAmt.toFixed(2)} al crédito del cliente` : null,
      ].filter(Boolean).join(" · ");
      await pago.update({
        amount: parseFloat((parseFloat(pago.amount) + aTasaDelPago(seQueda)).toFixed(6)),
        notes: [pago.notes, `Incluye ${detalle}`].filter(Boolean).join(" · "),
      }, { transaction: t });
    }
    if (creditAmt > 0) {
      // Todas las facturas del lote son de la misma sucursal (ver la validación de arriba),
      // así que el crédito queda atado a esa.
      await addCreditMovement({
        customer_id:  conSaldo[0].venta.customer_id,
        warehouse_id: conSaldo[0].venta.warehouse_id,
        amount:       creditAmt,
        reason:       'sobrante_cobro',
        sale_id:      conSaldo[0].venta.id,
        employee_id:  employee_id || null,
        company_id:   conSaldo[0].venta.company_id || null,
      }, t);
    }

    await t.commit();
    return {
      applied,
      total_applied: parseFloat(applied.reduce((acc, a) => acc + a.amount, 0).toFixed(6)),
      // Lo que no alcanzó a cubrir ninguna factura: solo pasa si el monto recibido se quedó
      // corto y ya no quedaban facturas seleccionadas con saldo.
      leftover: leftover > 0.000001 ? leftover : 0,
      settled_count: applied.filter(a => a.balance === 0).length,
      change_given: changeAmt > 0 ? changeAmt : 0,
      surplus_kept: surplusAmt > 0 ? surplusAmt : 0,
      credited: creditAmt > 0 ? creditAmt : 0,
    };
  } catch (e) {
    await t.rollback();
    // Dos envíos del mismo lote que cruzaron: el índice único decide cuál entra y el que
    // pierde devuelve lo que sí quedó guardado, en vez de un error que llevaría a cobrar otra vez.
    if (e?.name === "SequelizeUniqueConstraintError") {
      const previo = await loteYaRegistrado();
      if (previo) return previo;
    }
    throw e;
  }
};
