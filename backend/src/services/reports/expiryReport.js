const { ProductLot, Product, Warehouse, Sequelize } = require("../../models");
const { Op } = Sequelize;

async function expiryReport({ allowedWarehouses } = {}) {
  // Los lotes viven en un almacén: fuera del admin solo se muestran los de sus sucursales.
  const where = { qty: { [Op.gt]: 0 } };
  if (Array.isArray(allowedWarehouses)) where.warehouse_id = { [Op.in]: allowedWarehouses };

  const lots = await ProductLot.findAll({
    where,
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
