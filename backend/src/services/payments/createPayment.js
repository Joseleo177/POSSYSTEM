const { Payment, Sale, Sequelize, sequelize, getSaleBalance } = require("./shared");
const { Expense, ExpenseCategory, PaymentJournal, Currency, Serie, SerieRange, Customer } = require("../../models");

module.exports = async function createPayment(body) {
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
      // Crédito de cliente
      credit_amount,      // monto a descontar del credit_balance del cliente
    } = body;

    if (!sale_id) throw new Error("sale_id es requerido");
    if (!reference_date) throw new Error("La fecha de referencia es requerida");

    const creditAmt = parseFloat(credit_amount || 0);
    const hasJournalPayment = parseFloat(amount || 0) > 0;
    if (!hasJournalPayment && creditAmt <= 0) throw new Error("El monto es requerido");

    const sale = await Sale.findByPk(sale_id, { transaction: t, lock: true });
    if (!sale) throw new Error("Factura no encontrada");
    if (sale.status === "pagado") throw new Error("Esta factura ya fue pagada");
    if (sale.status === "anulado") throw new Error("Esta factura está anulada");

    // Asignar correlativo al confirmar el primer pago de un borrador
    if (sale.status === 'borrador' && sale.serie_id) {
      const serie = await Serie.findByPk(sale.serie_id, { transaction: t });
      if (serie && serie.active) {
        const activeRange = await SerieRange.findOne({
          where: {
            serie_id: sale.serie_id,
            active: true,
            current_number: { [Sequelize.Op.lte]: Sequelize.col('end_number') },
          },
          order: [['start_number', 'ASC']],
          lock: true,
          transaction: t,
        });
        if (!activeRange) throw new Error(`Serie "${serie.name}" agotada. Añade un nuevo rango en Contabilidad.`);

        const correlativeNumber = activeRange.current_number;
        const invoiceNumber = `${serie.prefix}-${String(correlativeNumber).padStart(serie.padding, '0')}`;
        const nextNumber = correlativeNumber + 1;
        await activeRange.update(
          nextNumber > activeRange.end_number ? { current_number: nextNumber, active: false } : { current_number: nextNumber },
          { transaction: t }
        );
        await sale.update({ invoice_number: invoiceNumber, correlative_number: correlativeNumber, serie_range_id: activeRange.id }, { transaction: t });
        sale.invoice_number = invoiceNumber;
      }
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
      await Payment.create({
        sale_id,
        customer_id:        sale.customer_id,
        amount:             creditApplied,
        currency_id:        sale.currency_id || null,
        exchange_rate:      sale.exchange_rate || 1,
        payment_journal_id: null,
        employee_id:        employee_id || null,
        reference_date,
        reference_number:   null,
        notes:              `Crédito de cliente aplicado`,
        change_given:       null,
        change_journal_id:  null,
      }, { transaction: t });
    }

    // getSaleBalance ya descuenta change_given de pagos previos.
    // El crédito neto de este pago = lo físicamente recibido menos el cambio entregado.
    const pendingAfterCredit = pendingBalance - creditApplied;
    const netCredit    = hasJournalPayment
      ? Math.min(parseFloat((payAmt - changeAmt).toFixed(6)), pendingAfterCredit)
      : 0;
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
          notes: null,
          status: "activo",
        },
        { transaction: t }
      );
    }

    // Si el cajero se quedó con el sobrante: registrar como ingreso extra en el mismo diario
    const surplusAmt = parseFloat(surplus_kept || 0);
    if (surplusAmt > 0) {
      await Payment.create(
        {
          sale_id,
          customer_id: sale.customer_id,
          amount: surplusAmt,
          currency_id: currency_id || sale.currency_id || null,
          exchange_rate: parseFloat(exchange_rate) || 1,
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

    const newStatus = totalPaidNow >= saleTotal - 0.02 ? "pagado" : "parcial";
    await sale.update({ status: newStatus }, { transaction: t });
    await t.commit();

    const rawBalance = parseFloat((saleTotal - totalPaidNow).toFixed(6));
    const balance = rawBalance <= 0.02 ? 0 : rawBalance;
    return {
      payment,
      sale_status: newStatus,
      amount_paid: totalPaidNow,
      balance: balance < 0 ? 0 : balance,
      change_given: changeAmt > 0 ? changeAmt : 0,
      invoice_number: sale.invoice_number || null,
    };
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
