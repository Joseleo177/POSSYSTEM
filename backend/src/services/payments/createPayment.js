const { Payment, Sale, SaleItem, sequelize, getSaleBalance } = require("./shared");
const { PAYMENT_TOLERANCE } = require("../../utils/saleBalance");
const { Expense, ExpenseCategory, PaymentJournal, Currency, Customer } = require("../../models");
const assignInvoiceNumber = require("../sales/assignInvoiceNumber");
const { assertWarehouseAccess } = require("../../middleware/auth");

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

module.exports = async function createPayment(body, req) {
  // Cobro repetido: mismo `idempotency_key` que un pago ya guardado. Pasa cuando la
  // respuesta se pierde por red y la caja reintenta; sin esto el abono se registraba dos
  // veces (el guardia de estado solo frena la venta ya pagada, no un abono parcial).
  if (body?.idempotency_key) {
    const previo = await Payment.findOne({ where: { idempotency_key: body.idempotency_key } });
    if (previo) return await existingPaymentResult(previo);
  }

  const t = await sequelize.transaction();
  try {
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
      surplus_kept,       // sobrante que se queda en caja (en moneda base)
      change_to_credit,   // sobrante que va al crédito del cliente (en moneda base)
      // Crédito de cliente
      credit_amount,      // monto a descontar del credit_balance del cliente
      idempotency_key,    // la genera la caja, una por cobro; se repite en los reintentos
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
    if (sale.status === "anulado") throw new Error("Esta factura está anulada");
    if (sale.status === "devuelto") throw new Error("Esta factura fue devuelta en su totalidad, no tiene saldo por cobrar");

    // Asignar correlativo al primer pago de una venta que aún no lo tiene: borrador
    // (contado) o cuenta en espera. Una venta ya entregada a crédito llega con status
    // 'pendiente' y su número puesto, así que assignInvoiceNumber la deja intacta.
    if (['borrador', 'espera'].includes(sale.status)) {
      await assignInvoiceNumber(sale, t);
    }

    const payAmt   = parseFloat(amount || 0);
    const changeAmt = parseFloat(change_given || 0);

    // Validar que si hay cambio, se indicó de dónde sale
    if (changeAmt > 0 && !change_journal_id) {
      throw new Error("Debes seleccionar el diario del que saldrá el cambio");
    }

    const saleTotal   = parseFloat(sale.total);
    const alreadyPaid = await getSaleBalance(sale_id, t);
    const pendingBalance = saleTotal - alreadyPaid;

    // Aplicar crédito de cliente si viene en el body
    let creditApplied = 0;
    if (creditAmt > 0) {
      if (!sale.customer_id) { const e = new Error("La venta no tiene cliente asignado"); e.status = 400; throw e; }
      const customer = await Customer.findByPk(sale.customer_id, { transaction: t, lock: true });
      if (!customer) { const e = new Error("Cliente no encontrado"); e.status = 404; throw e; }
      const available = parseFloat(customer.credit_balance || 0);
      if (creditAmt > available + 0.001) { const e = new Error(`Crédito insuficiente. Disponible: ${available.toFixed(2)}`); e.status = 400; throw e; }
      creditApplied = parseFloat(Math.min(creditAmt, pendingBalance).toFixed(6));
      await Customer.decrement({ credit_balance: creditApplied }, { where: { id: customer.id }, transaction: t });
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
    const isBsFullPay = isBsPay && (payAmtInCur >= pendingBalanceBs - 1.00);

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
          amount: payAmt,
          currency_id: currency_id || sale.currency_id || null,
          exchange_rate: parseFloat(exchange_rate) || sale.exchange_rate || 1,
          payment_journal_id: payment_journal_id || sale.payment_journal_id || null,
          employee_id: employee_id || null,
          reference_date,
          reference_number: reference_number?.trim() || null,
          notes: notes?.trim() || null,
          change_given: changeAmt > 0 ? changeAmt : null,
          change_journal_id: changeAmt > 0 ? change_journal_id : null,
          idempotency_key: idempotency_key || null,
        },
        { transaction: t }
      );
    }

    // Si hay cambio: registrar como egreso en el diario del cambio
    if (changeAmt > 0 && change_journal_id) {
      const [changeCat] = await ExpenseCategory.findOrCreate({
        where: { name: "Cambio / Vuelto" },
        defaults: { name: "Cambio / Vuelto", active: true },
        transaction: t,
      });

      // Obtener moneda y tasa del diario de cambio
      const changeJournal = await PaymentJournal.findByPk(change_journal_id, {
        include: [{ model: Currency, attributes: ["id", "exchange_rate"] }],
        transaction: t,
      });
      const changeRate = parseFloat(changeJournal?.Currency?.exchange_rate || 1);
      const changeCurrencyId = changeJournal?.currency_id || null;

      await Expense.create(
        {
          description: `Cambio entregado — Factura ${sale.invoice_number || "#" + sale_id}`,
          amount: changeAmt,
          rate: changeRate,
          category_id: changeCat.id,
          payment_journal_id: change_journal_id,
          employee_id: employee_id || null,
          currency_id: changeCurrencyId,
          // El vuelto sale de la caja de la sucursal que cobró.
          warehouse_id: sale.warehouse_id || null,
          notes: null,
          status: "activo",
        },
        { transaction: t }
      );
    }

    // Si el sobrante va al crédito del cliente
    const creditChangeAmt = parseFloat(change_to_credit || 0);
    if (creditChangeAmt > 0) {
      if (!sale.customer_id) throw new Error("La venta no tiene cliente para acreditar el sobrante");
      await Customer.increment({ credit_balance: creditChangeAmt }, { where: { id: sale.customer_id }, transaction: t });
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
          },
          { transaction: t }
        );
      }
    }

    // Tolerancia de $0.10 USD (10 céntimos): cubre desfasajes de redondeo por línea acumulados
    // en ventas con múltiples productos al pagar en bolívares.
    // La constante se comparte con quitar un pago y con anular una NC (utils/saleBalance),
    // para que las tres rutas que fijan el estado no se desalineen.
    const isFullPayment = isBsFullPay || totalPaidNow >= saleTotal - PAYMENT_TOLERANCE;
    const newStatus = isFullPayment ? "pagado" : "parcial";
    await sale.update({ status: newStatus }, { transaction: t });
    await t.commit();

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
  } catch (err) {
    await t.rollback();
    // Dos envíos del mismo cobro que cruzaron: la comprobación de arriba no los vio porque
    // corrían a la vez, y el índice único decide. El que pierde devuelve el pago que sí
    // quedó guardado en vez de un error que llevaría al cajero a cobrar otra vez.
    if (body?.idempotency_key && err?.name === "SequelizeUniqueConstraintError") {
      const previo = await Payment.findOne({ where: { idempotency_key: body.idempotency_key } });
      if (previo) return await existingPaymentResult(previo);
    }
    throw err;
  }
};
