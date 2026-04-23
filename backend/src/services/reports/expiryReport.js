const { ProductLot, Product, Warehouse, Sequelize } = require("../../models");
const { Op } = Sequelize;

async function expiryReport() {
  const lots = await ProductLot.findAll({
    where: { qty: { [Op.gt]: 0 } },
    include: [
      { model: Product,    as: 'product',   attributes: ['name', 'unit'] },
      { model: Warehouse,  as: 'warehouse', attributes: ['name'] },
    ],
    order: [['expiration_date', 'ASC']],
  });

  return lots.map(l => ({
    id:        l.id,
    product:   l.product?.name    || 'Producto desconocido',
    lot:       l.lot_number,
    expiry:    l.expiration_date,
    stock:     l.qty,
    unit:      l.product?.unit    || 'uds',
    warehouse: l.warehouse?.name  || 'N/A',
  }));
}

module.exports = expiryReport;
