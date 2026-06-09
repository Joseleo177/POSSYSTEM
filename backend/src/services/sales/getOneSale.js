const { Sale, SALE_INCLUDE } = require("./shared");

module.exports = async function getOneSale(id) {
  const s = await Sale.findByPk(id, { include: SALE_INCLUDE });
  if (!s) throw new Error("Venta no encontrada");

  const item = s.toJSON();
  item.customer_name = item.Customer?.name ?? null;
  item.customer_rif  = item.Customer?.rif ?? null;
  item.employee_name = item.Employee?.full_name ?? null;
  item.currency_symbol = item.Currency?.symbol ?? null;
  item.currency_code = item.Currency?.code ?? null;
  item.warehouse_name = item.Warehouse?.name ?? null;
  item.serie_name = item.Serie?.name ?? null;
  item.items = item.SaleItems?.map(si => {
    const returned_qty = si.ReturnItems?.reduce((acc, ri) => acc + parseFloat(ri.qty), 0) || 0;
    return {
      ...si,
      name: si.Product?.name || "Producto",
      returned_qty
    };
  }) ?? [];

  const { Payment, PaymentJournal, Currency: CurrencyModel, Return } = require("../../models");
  const { Op } = require("sequelize");

  // Pagos con el diario de cobro (asociación existente)
  const payRows = await Payment.findAll({
    where: { sale_id: id, amount: { [Op.gt]: 0 } },
    include: [
      {
        model: PaymentJournal, foreignKey: 'payment_journal_id', attributes: ['name', 'color'], required: false,
        include: [{ model: CurrencyModel, attributes: ['symbol', 'exchange_rate'], required: false }],
      },
    ],
    order: [['created_at', 'ASC']],
  });

  // Info de los diarios de cambio (consulta separada, no hay asociación definida)
  const changeIds = [...new Set(payRows.map(p => p.change_journal_id).filter(Boolean))];
  const changeJournalMap = {};
  if (changeIds.length > 0) {
    const cjRows = await PaymentJournal.findAll({
      where: { id: changeIds },
      attributes: ['id', 'name', 'color'],
      include: [{ model: CurrencyModel, attributes: ['symbol', 'exchange_rate'], required: false }],
    });
    cjRows.forEach(cj => {
      changeJournalMap[cj.id] = {
        name:  cj.name,
        color: cj.color,
        sym:   cj.Currency?.symbol || null,
        rate:  parseFloat(cj.Currency?.exchange_rate || 1),
      };
    });
  }

  item.Payments = payRows.map(p => {
    const pj = p.toJSON();
    const cj = pj.change_journal_id ? changeJournalMap[pj.change_journal_id] : null;
    return {
      id:               pj.id,
      amount:           parseFloat(pj.amount || 0),
      exchange_rate:    parseFloat(pj.exchange_rate || 1),
      journal_sym:      pj.PaymentJournal?.Currency?.symbol || null,
      change_given:     pj.change_given ? parseFloat(pj.change_given) : null,
      created_at:       pj.created_at,
      reference_number: pj.reference_number || null,
      notes:            pj.notes || null,
      journal_name:     pj.PaymentJournal?.name  || null,
      journal_color:    pj.PaymentJournal?.color || null,
      change_journal_name:  cj?.name  || null,
      change_journal_color: cj?.color || null,
      change_journal_rate:  cj?.rate  || 1,
      change_journal_sym:   cj?.sym   || null,
    };
  });

  // Totales financieros
  const creditApplied = parseFloat(item.credit_applied || 0);
  item.credit_applied = creditApplied;
  item.amount_paid = parseFloat(await Payment.sum('amount', { where: { sale_id: id } }) || 0) + creditApplied;
  item.total_returned = parseFloat(await Return.sum('total', { where: { sale_id: id } }) || 0);
  item.balance = parseFloat((parseFloat(item.total) - item.total_returned - item.amount_paid).toFixed(6));
  if (item.balance < 0 || item.balance <= 0.02) item.balance = 0;

  return item;
};
