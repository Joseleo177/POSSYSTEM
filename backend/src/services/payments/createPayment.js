const { Payment, Sale, sequelize, getSaleBalance } = require("./shared");
const { Expense, ExpenseCategory, PaymentJournal, Currency } = require("../../models");

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
    } = body;

    if (!sale_id) throw new Error("sale_id es requerido");
    if (!amount) throw new Error("El monto es requerido");
    if (!reference_date) throw new Error("La fecha de referencia es requerida");

    const sale = await Sale.findByPk(sale_id, { transaction: t, lock: true });
    if (!sale) throw new Error("Factura no encontrada");
    if (sale.status === "pagado") throw new Error("Esta factura ya fue pagada");
    if (sale.status === "anulado") throw new Error("Esta factura está anulada");

    const payAmt = parseFloat(amount);
    if (payAmt <= 0) throw new Error("El monto debe ser mayor a 0");

    const alreadyPaid = await getSaleBalance(sale_id, t);
    const totalPaidNow = parseFloat((alreadyPaid + payAmt).toFixed(2));
    const saleTotal = parseFloat(sale.total);

    if (totalPaidNow > saleTotal + 0.001) {
      throw new Error(`El monto excede el saldo pendiente. Saldo: ${(saleTotal - alreadyPaid).toFixed(2)}`);
    }

    const changeAmt = parseFloat(change_given || 0);

    // Validar que si hay cambio, se indicó de dónde sale
    if (changeAmt > 0 && !change_journal_id) {
      throw new Error("Debes seleccionar el diario del que saldrá el cambio");
    }

    // Registrar el cobro (amount = lo que abona a la factura, en moneda base)
    const payment = await Payment.create(
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

    const newStatus = totalPaidNow >= saleTotal - 0.001 ? "pagado" : "parcial";
    await sale.update({ status: newStatus }, { transaction: t });
    await t.commit();

    const balance = parseFloat((saleTotal - totalPaidNow).toFixed(2));
    return {
      payment,
      sale_status: newStatus,
      amount_paid: totalPaidNow,
      balance: balance < 0 ? 0 : balance,
      change_given: changeAmt > 0 ? changeAmt : 0,
    };
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
