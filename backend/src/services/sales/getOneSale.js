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
  item.items = item.SaleItems?.map(si => ({
    ...si,
    name: si.Product?.name || "Producto"
  })) ?? [];
  
  return item;
};
