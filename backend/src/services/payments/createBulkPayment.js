const { Payment, Sale, Return, Sequelize, sequelize, Op, getSaleBalance } = require("./shared");
const { PAYMENT_TOLERANCE, RECEIVABLE_STATUSES, resolveSaleStatus } = require("../../utils/saleBalance");
const { Expense, ExpenseCategory, PaymentJournal, Currency } = require("../../models");
const assignInvoiceNumber = require("../sales/assignInvoiceNumber");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { toLocalDate } = require("../../utils/localDate");
const { addCreditMovement } = require("../customers/creditLedger");

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
 * que se cobró y viaja a cada Payment para que el histórico sepa a cuánto entró el dinero.
 */
module.exports = async function createBulkPayment(body, req) {
  const {
    sale_ids,
    amount,
    currency_id,
    exchange_rate,
    payment_journal_id,
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
    surplus_kept,       // sobrante que se queda en la caja
    change_to_credit,   // sobrante que va al crédito del cliente
  } = body;

  const ids = [...new Set((sale_ids || []).map(n => parseInt(n, 10)).filter(Number.isInteger))];
  if (!ids.length) throw err("Debes seleccionar al menos una factura");
  if (!reference_date) throw err("La fecha de referencia es requerida");
  if (!payment_journal_id) throw err("Debes seleccionar el método de pago");

  const totalPay = parseFloat(amount || 0);
  if (!(totalPay > 0)) throw err("El monto es requerido");

  // Un vuelto de una sola caja se expresa igual que uno repartido: una parte.
  const partesVuelto = (Array.isArray(change_parts) && change_parts.length)
    ? change_parts
        .map(p => ({ journal_id: p?.journal_id, amount: parseFloat(p?.amount || 0) }))
        .filter(p => p.amount > 0)
    : (parseFloat(change_given || 0) > 0
        ? [{ journal_id: change_journal_id, amount: parseFloat(change_given) }]
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
    const claves = ids.map(id => `${idempotency_key}-${id}`);
    const pagos = await Payment.findAll({ where: { idempotency_key: { [Op.in]: claves } } });
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
      if (saldo > PAYMENT_TOLERANCE) conSaldo.push({ venta, saldo, cobrado, devuelto });
    }

    if (!conSaldo.length) throw err("Las facturas seleccionadas no tienen saldo por cobrar");

    const deudaTotal = conSaldo.reduce((acc, x) => acc + x.saldo, 0);
    // Lo que el cliente entregó de más tiene que tener destino declarado: se le devuelve, se
    // queda en la caja o se le acredita. Sin eso el dinero entraría a la gaveta sin que nada
    // lo explique, y el arqueo del turno cerraría con un sobrante que nadie sabe de dónde salió.
    const sobrante = parseFloat((totalPay - deudaTotal).toFixed(6));
    const destinado = parseFloat((changeAmt + surplusAmt + creditAmt).toFixed(6));
    if (sobrante > PAYMENT_TOLERANCE && destinado < sobrante - 0.001) {
      throw err(
        `Recibiste ${(sobrante).toFixed(2)} de más sobre la deuda de ${deudaTotal.toFixed(2)}: indica si se devuelve, se queda en caja o va al crédito del cliente`
      );
    }
    if (destinado > sobrante + PAYMENT_TOLERANCE) {
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
    const aImputar = parseFloat((totalPay - destinado).toFixed(6));

    // Plan de reparto, calculado antes de tocar la base para poder cerrar el redondeo al final.
    const plan = [];
    let restante = aImputar;
    for (const item of conSaldo) {
      if (restante <= 0.000001) break;
      const aplicar = parseFloat(Math.min(restante, item.saldo).toFixed(6));
      plan.push({ ...item, aplicar });
      restante = parseFloat((restante - aplicar).toFixed(6));
    }
    // Sobra un resto por debajo de la tolerancia (los céntimos del redondeo al billete): se lo
    // lleva la última factura cubierta, para que la suma de los cobros dé exactamente el
    // dinero que entró. Un excedente mayor no llega hasta acá: lo frena la validación de arriba.
    if (restante > 0.000001 && plan.length) {
      const ultima = plan[plan.length - 1];
      ultima.aplicar = parseFloat((ultima.aplicar + restante).toFixed(6));
      restante = 0;
    }

    const applied = [];

    for (const { venta, saldo, cobrado, devuelto, aplicar } of plan) {
      // Dentro de la tolerancia se salda completa: cobrando en bolívares el saldo en dólares
      // queda a unos céntimos, y esos céntimos no son deuda (mismo criterio que createPayment).
      const salda = (saldo - aplicar) <= PAYMENT_TOLERANCE;

      // Una cuenta que todavía no era factura recibe su correlativo al primer cobro.
      if (["borrador", "espera"].includes(venta.status)) {
        await assignInvoiceNumber(venta, t);
      }

      const pago = await Payment.create({
        sale_id: venta.id,
        customer_id: venta.customer_id,
        amount: aplicar,
        currency_id: currency_id || venta.currency_id || null,
        exchange_rate: parseFloat(exchange_rate) || venta.exchange_rate || 1,
        payment_journal_id,
        employee_id: employee_id || null,
        reference_date,
        reference_number: reference_number?.trim() || null,
        // Deja rastro de que el dinero entró en un solo acto: sin esto, ver tres cobros
        // idénticos el mismo día en tres facturas parece un error de la caja.
        notes: [notes?.trim(), `Cobro conjunto de ${conSaldo.length} facturas`].filter(Boolean).join(" · "),
        idempotency_key: idempotency_key ? `${idempotency_key}-${venta.id}` : null,
        batch_id: batchId,
      }, { transaction: t });

      const nuevoEstado = resolveSaleStatus({
        saleTotal: venta.total,
        paid: cobrado + aplicar,
        returned: devuelto,
        forgiven: venta.forgiven_amount,
        hasInvoice: !!venta.invoice_number,
      });
      await venta.update({ status: nuevoEstado }, { transaction: t });

      applied.push({
        sale_id: venta.id,
        invoice_number: venta.invoice_number || null,
        payment_id: pago.id,
        amount: aplicar,
        balance: salda ? 0 : parseFloat((saldo - aplicar).toFixed(6)),
        sale_status: nuevoEstado,
      });
    }

    // ── Sobrante ──────────────────────────────────────────────────────────────
    // Todo lo que el cliente entregó por encima de la deuda se cuelga del primer cobro del
    // lote, que es el que representa el billete que entró. Va ahí y no repartido entre las
    // facturas a propósito: ese dinero no es de ninguna, y sumárselo las dejaría cobradas de
    // más. Mismo criterio que el cobro de una factura suelta (ver createPayment).
    const primerPago = applied[0];

    if (changeAmt > 0 && primerPago) {
      // El billete entró completo y el vuelto salió: se registran los dos movimientos, para
      // que la gaveta cuadre contra lo que realmente pasó por ella. getSaleBalance descuenta
      // change_given, así que la factura sigue acreditada solo por lo suyo.
      await Payment.update(
        { amount: parseFloat((primerPago.amount + changeAmt).toFixed(6)),
          change_given: changeAmt,
          // Con el vuelto repartido, el pago apunta a la primera caja: es el marcador que hace
          // que el saldo de la factura descuente el vuelto. El detalle de por dónde salió cada
          // tramo vive en los egresos, uno por caja.
          change_journal_id: partesVuelto[0].journal_id },
        { where: { id: primerPago.payment_id }, transaction: t }
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
    if (seQueda > 0 && primerPago) {
      const pago = await Payment.findByPk(primerPago.payment_id, { transaction: t });
      const detalle = [
        surplusAmt > 0 ? `sobrante en caja ${surplusAmt.toFixed(2)}` : null,
        creditAmt  > 0 ? `${creditAmt.toFixed(2)} al crédito del cliente` : null,
      ].filter(Boolean).join(" · ");
      await pago.update({
        amount: parseFloat((parseFloat(pago.amount) + seQueda).toFixed(6)),
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
      leftover: restante > 0.000001 ? restante : 0,
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
