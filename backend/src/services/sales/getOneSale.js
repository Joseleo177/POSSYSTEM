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

  // Totales financieros
  const { Payment, Return } = require("../../models");
  item.amount_paid = parseFloat(await Payment.sum('amount', { where: { sale_id: id } }) || 0);
  item.total_returned = parseFloat(await Return.sum('total', { where: { sale_id: id } }) || 0);
  item.balance = parseFloat((parseFloat(item.total) - item.total_returned - item.amount_paid).toFixed(2));
  if (item.balance < 0) item.balance = 0;
  
  return item;
};
