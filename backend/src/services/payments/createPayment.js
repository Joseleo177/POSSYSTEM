const { Payment, Sale, SaleItem, sequelize, getSaleBalance, Op } = require("./shared");
const { PAYMENT_TOLERANCE } = require("../../utils/saleBalance");
const { Expense, ExpenseCategory, PaymentJournal, Currency, Customer } = require("../../models");
const assignInvoiceNumber = require("../sales/assignInvoiceNumber");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { toLocalDate } = require("../../utils/localDate");
const { creditAvailable, addCreditMovement } = require("../customers/creditLedger");
const { assertJournalsInWarehouse } = require("../../utils/journalWarehouse");

// Respuesta de un cobro que ya estaba registrado. Se rearma desde la base para que el
// reintento reciba exactamente lo mismo que recibió el envío que sí entró: la caja imprime
// su ticket y sigue, sin saber que hubo un duplicado.
async function existingPaymentResult(payment) {
  const sale = await Sale.findByPk(payment.sale_id);
  const saleTotal = parseFloat(sale?.total || 0);
  const alreadyPaid = await getSaleBalance(payment.sale_id);
  const balance = parseFloat((saleTotal - alreadyPaid).toFixed(6));
  return {
    payment,
    sale_status: sale?.status || null,
    amount_paid: alreadyPaid,
    balance: balance <= 0.10 ? 0 : balance,
    change_given: parseFloat(payment.change_given || 0),
    invoice_number: sale?.invoice_number || null,
    duplicated: true,
  };
}

// Un tramo de cobro contra una factura: un diario, un monto, su vuelto/crédito/sobrante.
// El pago combinado (varias formas de pago en un cobro) llama a esto una vez por forma,
// dentro de la misma transacción, así que cada tramo ve el saldo ya reducido por los
// anteriores. La transacción y el commit los maneja `createPayment`.
async function applyOnePayment(body, req, t) {
    const {
      sale_id,
      amount,
      currency_id,
      exchange_rate,
      payment_journal_id,
      employee_id,
      reference_date,
      reference_number,
      notes,
      // Cambio/vuelto
      received_amount,    // lo que físicamente entregó el cliente (en moneda del pago)
      change_given,       // cambio a devolver (en moneda base)
      change_journal_id,  // diario del que sale el cambio
      change_parts,       // vuelto repartido: [{ journal_id, amount }] en moneda base
      surplus_kept,       // sobrante que se queda en caja (en moneda base)
      change_to_credit,   // sobrante que va al crédito del cliente (en moneda base)
      // Crédito de cliente
      credit_amount,      // monto a descontar del credit_balance del cliente
      idempotency_key,    // la genera la caja, una por cobro; se repite en los reintentos
      batch_id,           // marca del acto: ata entre sí los tramos de un pago combinado
    } = body;

    if (!sale_id) throw new Error("sale_id es requerido");
    if (!reference_date) throw new Error("La fecha de referencia es requerida");

    const creditAmt = parseFloat(credit_amount || 0);
    const hasJournalPayment = parseFloat(amount || 0) > 0;
    if (!hasJournalPayment && creditAmt <= 0) throw new Error("El monto es requerido");

    const sale = await Sale.findByPk(sale_id, { transaction: t, lock: true });
    if (!sale) throw new Error("Factura no encontrada");
    // Solo se cobra lo facturado en una sucursal propia.
    await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });
    if (sale.status === "pagado") throw new Error("Esta factura ya fue pagada");
    // El saldo se perdonó: ya no hay deuda que cobrar. Si el cliente igual quiere pagar, se
    // deshace la exoneración primero (DELETE /sales/:id/forgive) y la factura vuelve a deberse.
    if (sale.status === "exonerado") throw new Error("Esta factura fue exonerada: no tiene saldo por cobrar");
    if (sale.status === "anulado") throw new Error("Esta factura está anulada");
    if (sale.status === "devuelto") throw new Error("Esta factura fue devuelta en su totalidad, no tiene saldo por cobrar");

    // Asignar correlativo al primer pago de una venta que aún no lo tiene: borrador
    // (contado) o cuenta en espera. Una venta ya entregada a crédito llega con status
    // 'pendiente' y su número puesto, así que assignInvoiceNumber la deja intacta.
    if (['borrador', 'espera'].includes(sale.status)) {
      await assignInvoiceNumber(sale, t);
    }

    const payAmt   = parseFloat(amount || 0);

    // El vuelto puede repartirse entre varias cajas; una sola es el caso de una parte.
    const partesVuelto = (Array.isArray(change_parts) && change_parts.length)
      ? change_parts
          .map(p => ({ journal_id: p?.journal_id, amount: parseFloat(p?.amount || 0) }))
          .filter(p => p.amount > 0)
      : (parseFloat(change_given || 0) > 0
          ? [{ journal_id: change_journal_id, amount: parseFloat(change_given) }]
          : []);

    const changeAmt = parseFloat(partesVuelto.reduce((acc, p) => acc + p.amount, 0).toFixed(6));

    // Validar que si hay cambio, se indicó de dónde sale
    if (changeAmt > 0 && partesVuelto.some(p => !p.journal_id)) {
      throw new Error("Debes seleccionar el diario del que saldrá el cambio");
    }

    // El diario del cobro y los del vuelto tienen que ser de la sucursal de la factura (o
    // compartidos): un cobro no puede entrar en la caja de otra tienda.
    await assertJournalsInWarehouse(
      [payment_journal_id, ...partesVuelto.map(p => p.journal_id)],
      sale.warehouse_id,
      t,
    );

    const saleTotal   = parseFloat(sale.total);
    const alreadyPaid = await getSaleBalance(sale_id, t);
    const pendingBalance = saleTotal - alreadyPaid;

    // Aplicar crédito de cliente si viene en el body
    let creditApplied = 0;
    if (creditAmt > 0) {
      if (!sale.customer_id) { const e = new Error("La venta no tiene cliente asignado"); e.status = 400; throw e; }
      const customer = await Customer.findByPk(sale.customer_id, { transaction: t, lock: true });
      if (!customer) { const e = new Error("Cliente no encontrado"); e.status = 404; throw e; }
      // Solo cuenta el crédito compartido más el que esta misma sucursal generó: el de otra
      // sucursal no se puede aplicar acá (ver creditLedger.js).
      const available = await creditAvailable(customer.id, sale.warehouse_id, t);
      if (creditAmt > available + 0.001) { const e = new Error(`Crédito insuficiente. Disponible: ${available.toFixed(2)}`); e.status = 400; throw e; }
      creditApplied = parseFloat(Math.min(creditAmt, pendingBalance).toFixed(6));
      await addCreditMovement({
        customer_id:  customer.id,
        warehouse_id: sale.warehouse_id,
        amount:       -creditApplied,
        reason:       'consumo_pago',
        sale_id,
        employee_id:  employee_id || null,
        company_id:   sale.company_id || null,
      }, t);
      await Sale.increment({ credit_applied: creditApplied }, { where: { id: sale_id }, transaction: t });
    }

    // getSaleBalance ya descuenta change_given de pagos previos.
    const pendingAfterCredit = pendingBalance - creditApplied;

    // Evaluación dinámica en la moneda del cobro (Bs):
    // Calcular el total exacto en Bs (suma por línea idéntica al carrito)
    const payRate = parseFloat(exchange_rate) || parseFloat(sale.exchange_rate) || 1;
    const isBsPay = payRate > 1;
    const saleItems = await SaleItem.findAll({ where: { sale_id }, transaction: t });
    const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
    // El recargo (propina/servicio) se convierte y redondea igual que el descuento: es un
    // monto de cabecera, no una línea, así que entra una sola vez al final de la suma.
    const totalBsAt = (rate) => round2(
      saleItems.reduce((acc, i) =>
        acc + round2((parseFloat(i.price || 0) - parseFloat(i.discount || 0)) * rate) * parseFloat(i.quantity || 0)
      , 0)
      - round2(parseFloat(sale.discount_amount || 0) * rate)
      + round2(parseFloat(sale.service_charge || 0) * rate)
    );
    const saleTotalBs = isBsPay ? totalBsAt(payRate) : saleTotal;

    const alreadyPaidBs = isBsPay ? round2(alreadyPaid * payRate) : alreadyPaid;
    const pendingBalanceBs = Math.max(0, saleTotalBs - alreadyPaidBs);
    const payAmtInCur = isBsPay ? round2(payAmt * payRate) : payAmt;
    // En un pago combinado, los tramos que NO son el último nunca "saldan" la factura por
    // tolerancia: el que cierra la cuenta (y lleva el vuelto) es el último. Sin esto un tramo
    // en Bs a menos de Bs.1 del saldo la daba por pagada y el siguiente tramo sobrepagaba.
    const noSettle = body._noSettle === true;
    const isBsFullPay = isBsPay && !noSettle && (payAmtInCur >= pendingBalanceBs - 1.00);

    // Ya no existe la tasa de efectivo: una factura se valora siempre a la tasa del sistema,
    // que es el dato con validez legal. Cobrar divisas por encima de la tasa oficial hacía que
    // la deuda en bolívares y el abono en moneda base se calcularan con tasas distintas, y el
    // resultado era una factura saldada con menos dinero del que decía la pantalla. La tasa
    // manual sigue disponible en ingresos y egresos, que no son documentos fiscales.
    const netCredit = (hasJournalPayment && isBsFullPay)
      ? pendingAfterCredit
      : (hasJournalPayment ? Math.min(parseFloat((payAmt - changeAmt).toFixed(6)), pendingAfterCredit) : 0);

    const totalPaidNow = parseFloat((alreadyPaid + creditApplied + netCredit).toFixed(6));

    if (netCredit < -0.001) {
      throw new Error("El cambio no puede superar el monto recibido");
    }
    if (totalPaidNow > saleTotal + 0.001) {
      throw new Error(`El monto excede el saldo pendiente. Saldo: ${(saleTotal - alreadyPaid).toFixed(2)}`);
    }

    // Registrar el cobro de diario (solo si hay monto de pago regular)
    let payment = null;
    if (hasJournalPayment) {
      payment = await Payment.create(
        {
          sale_id,
          customer_id: sale.customer_id,
          // Tramo intermedio de un combinado: nunca lleva vuelto, así que su `amount` no puede
          // pasar del saldo (si no, getSaleBalance lo cuenta de más).
          amount: noSettle ? Math.min(payAmt, pendingAfterCredit) : payAmt,
          currency_id: currency_id || sale.currency_id || null,
          exchange_rate: parseFloat(exchange_rate) || sale.exchange_rate || 1,
          payment_journal_id: payment_journal_id || sale.payment_journal_id || null,
          employee_id: employee_id || null,
          reference_date,
          reference_number: reference_number?.trim() || null,
          notes: notes?.trim() || null,
          change_given: changeAmt > 0 ? changeAmt : null,
          // Con el vuelto repartido, el pago apunta a la primera caja: es el marcador que hace
          // que getSaleBalance descuente el vuelto. El detalle por caja vive en los egresos.
          change_journal_id: changeAmt > 0 ? partesVuelto[0].journal_id : null,
          idempotency_key: idempotency_key || null,
          batch_id: batch_id || null,
        },
        { transaction: t }
      );
    }

    // Si hay cambio: registrar como egreso en el diario del cambio
    if (changeAmt > 0 && partesVuelto.length) {
      const [changeCat] = await ExpenseCategory.findOrCreate({
        where: { name: "Cambio / Vuelto" },
        defaults: { name: "Cambio / Vuelto", active: true },
        transaction: t,
      });

      // Un egreso por cada caja de la que salió dinero. Devolver parte en divisas y el resto
      // en bolívares es lo corriente cuando no hay sencillo: cargarlo todo a una gaveta la
      // deja corta y la otra larga.
      const variasCajas = partesVuelto.length > 1;
      for (const parte of partesVuelto) {
      const changeJournal = await PaymentJournal.findByPk(parte.journal_id, {
        include: [{ model: Currency, attributes: ["id", "exchange_rate"] }],
        transaction: t,
      });
      const changeRate = parseFloat(changeJournal?.Currency?.exchange_rate || 1);
      const changeCurrencyId = changeJournal?.currency_id || null;

      await Expense.create(
        {
          description: `Cambio entregado${variasCajas ? " (parte)" : ""} — Factura ${sale.invoice_number || "#" + sale_id}`,
          amount: parte.amount,
          rate: changeRate,
          // Misma fecha que el cobro que lo generó. Sin `date`, el egreso se ordenaba por su
          // created_at con hora mientras el cobro iba a medianoche por su reference_date, y en
          // el estado de cuenta el vuelto se despegaba de su propia venta.
          //
          // Va por toLocalDate y no como string: 'YYYY-MM-DD' en una columna TIMESTAMPTZ se
          // ancla a la medianoche de la zona DEL PROCESO. En Docker es Caracas y sale bien,
          // pero en Vercel el runtime corre en UTC y el vuelto quedaría fechado el día anterior.
          date: toLocalDate(reference_date),
          category_id: changeCat.id,
          payment_journal_id: parte.journal_id,
          employee_id: employee_id || null,
          currency_id: changeCurrencyId,
          // El vuelto sale de la caja de la sucursal que cobró.
          warehouse_id: sale.warehouse_id || null,
          notes: variasCajas ? `Vuelto repartido en ${partesVuelto.length} cajas` : null,
          status: "activo",
        },
        { transaction: t }
      );
      }
    }

    // Si el sobrante va al crédito del cliente
    const creditChangeAmt = parseFloat(change_to_credit || 0);
    if (creditChangeAmt > 0) {
      if (!sale.customer_id) throw new Error("La venta no tiene cliente para acreditar el sobrante");
      await addCreditMovement({
        customer_id:  sale.customer_id,
        warehouse_id: sale.warehouse_id,
        amount:       creditChangeAmt,
        reason:       'sobrante_cobro',
        sale_id,
        employee_id:  employee_id || null,
        company_id:   sale.company_id || null,
      }, t);
    }

    // Si el cajero se quedó con el sobrante: sumarlo al mismo cobro
    // (físicamente entró todo junto a la caja — un solo pago, igual que "Dar cambio")
    const surplusAmt = parseFloat(surplus_kept || 0);
    if (surplusAmt > 0) {
      const surplusRate = parseFloat(exchange_rate) || 1;
      const surplusNote = `Incluye sobrante de ${(surplusAmt * surplusRate).toFixed(2)} (no aplicado a factura)`;
      if (payment) {
        await payment.update(
          {
            amount: parseFloat((payAmt + surplusAmt).toFixed(6)),
            notes: [payment.notes, surplusNote].filter(Boolean).join(" · "),
          },
          { transaction: t }
        );
      } else {
        await Payment.create(
          {
            sale_id,
            customer_id: sale.customer_id,
            amount: surplusAmt,
            currency_id: currency_id || sale.currency_id || null,
            exchange_rate: surplusRate,
            payment_journal_id: payment_journal_id || null,
            employee_id: employee_id || null,
            reference_date,
            reference_number: reference_number?.trim() || null,
            notes: `Sobrante — Factura ${sale.invoice_number || "#" + sale_id}`,
            change_given: null,
            change_journal_id: null,
            batch_id: batch_id || null,
          },
          { transaction: t }
        );
      }
    }

    // Vuelto redondeado a la baja: el cajero devuelve 4 de un cambio de 4,70 porque no tiene
    // sencillo. Esos 0,70 entraron a la caja y NO cubren nada de la factura —el abono ya se
    // topó al saldo—, así que quedan anotados en el propio cobro. Sin esto el dinero seguía
    // ahí sin que ningún registro lo explicara, y el pago aparecía por encima de lo facturado
    // sin motivo visible. No se suma al monto: `amount` ya trae todo lo que el cliente entregó.
    const noAplicado = parseFloat(((payAmt - changeAmt) - netCredit).toFixed(6));
    if (payment && surplusAmt <= 0 && noAplicado > PAYMENT_TOLERANCE) {
      const noteRate = parseFloat(exchange_rate) || 1;
      await payment.update(
        {
          notes: [
            payment.notes,
            `Incluye sobrante de ${(noAplicado * noteRate).toFixed(2)} (vuelto redondeado, no aplicado a factura)`,
          ].filter(Boolean).join(" · "),
        },
        { transaction: t }
      );
    }

    // Tolerancia de $0.10 USD (10 céntimos): cubre desfasajes de redondeo por línea acumulados
    // en ventas con múltiples productos al pagar en bolívares.
    // La constante se comparte con quitar un pago y con anular una NC (utils/saleBalance),
    // para que las tres rutas que fijan el estado no se desalineen.
    const isFullPayment = isBsFullPay || totalPaidNow >= saleTotal - PAYMENT_TOLERANCE;
    const newStatus = isFullPayment ? "pagado" : "parcial";
    await sale.update({ status: newStatus }, { transaction: t });

    const rawBalance = parseFloat((saleTotal - totalPaidNow).toFixed(6));
    const balance = (rawBalance <= PAYMENT_TOLERANCE || isFullPayment) ? 0 : rawBalance;
    return {
      payment,
      sale_status: newStatus,
      amount_paid: isFullPayment ? saleTotal : totalPaidNow,
      balance: balance < 0 ? 0 : balance,
      change_given: changeAmt > 0 ? changeAmt : 0,
      invoice_number: sale.invoice_number || null,
    };
}

// Cobro contra una factura. Simple (un diario) o COMBINADO: `pay_parts` con varias formas de
// pago, cada una con su caja/monto/moneda/referencia. El vuelto y el sobrante se calculan
// sobre el total y se cuelgan del último tramo; el crédito de cliente, del primero.
module.exports = async function createPayment(body, req) {
  const parts = (Array.isArray(body.pay_parts) && body.pay_parts.length > 1) ? body.pay_parts : null;

  // Cobro repetido: mismo `idempotency_key` que un pago ya guardado (la respuesta se perdió
  // por red y la caja reintenta). En el combinado la clave lleva sufijo `-0`, `-1`…
  const idemWhere = () => parts
    ? { idempotency_key: { [Op.like]: `${body.idempotency_key}-%` } }
    : { idempotency_key: body.idempotency_key };
  if (body?.idempotency_key) {
    const previo = await Payment.findOne({ where: idemWhere() });
    if (previo) return await existingPaymentResult(previo);
  }

  // Marca del acto: ata entre sí los tramos de un pago combinado. Con ella el historial los
  // muestra como movimientos de un mismo cobro (uno por caja) y eliminarlo lo deshace entero,
  // igual que el cobro conjunto. Se deriva de la clave de idempotencia para que un reintento
  // no invente un lote distinto.
  const batchId = parts
    ? (body.idempotency_key || `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 64)
    : null;

  const t = await sequelize.transaction();
  try {
    let result;
    if (!parts) {
      result = await applyOnePayment(body, req, t);
    } else {
      // Cada tramo necesita su caja y un monto real. Se valida acá también, no solo en la
      // pantalla, para que la regla valga si el cobro llega por API.
      for (const p of parts) {
        if (!p?.journal_id) { const e = new Error("El diario de cada forma de pago es requerido"); e.status = 400; e.isOperational = true; throw e; }
        if (!(parseFloat(p.amount) > 0)) { const e = new Error("El monto de cada forma de pago debe ser mayor a 0"); e.status = 400; e.isOperational = true; throw e; }
      }
      const creados = [];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const primero = i === 0;
        const ultimo  = i === parts.length - 1;
        result = await applyOnePayment({
          sale_id:            body.sale_id,
          reference_date:     body.reference_date,
          notes:             body.notes,
          employee_id:       body.employee_id,
          amount:            p.amount,
          currency_id:       p.currency_id ?? null,
          exchange_rate:     p.exchange_rate ?? null,
          payment_journal_id: p.journal_id,
          reference_number:  p.reference_number ?? null,
          _noSettle:         !ultimo,
          batch_id:          batchId,
          credit_amount:     primero ? body.credit_amount     : undefined,
          received_amount:   ultimo  ? body.received_amount   : undefined,
          change_given:      ultimo  ? body.change_given      : undefined,
          change_journal_id: ultimo  ? body.change_journal_id : undefined,
          change_parts:      ultimo  ? body.change_parts      : undefined,
          surplus_kept:      ultimo  ? body.surplus_kept      : undefined,
          change_to_credit:  ultimo  ? body.change_to_credit  : undefined,
          idempotency_key:   body.idempotency_key ? `${body.idempotency_key}-${i}` : null,
        }, req, t);
        if (result.payment) creados.push(result.payment);
      }
      result = { ...result, payments: creados };
    }
    await t.commit();
    return result;
  } catch (err) {
    await t.rollback();
    // Dos envíos del mismo cobro que cruzaron: la comprobación de arriba no los vio porque
    // corrían a la vez, y el índice único decide. El que pierde devuelve el pago que sí
    // quedó guardado en vez de un error que llevaría al cajero a cobrar otra vez.
    if (body?.idempotency_key && err?.name === "SequelizeUniqueConstraintError") {
      const previo = await Payment.findOne({ where: idemWhere() });
      if (previo) return await existingPaymentResult(previo);
    }
    throw err;
  }
};
