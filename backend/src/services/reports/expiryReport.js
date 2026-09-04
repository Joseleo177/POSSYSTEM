const { ProductLot, Product, Warehouse, Sequelize } = require("../../models");
const { Op } = Sequelize;

async function expiryReport({ allowedWarehouses, warehouse_id } = {}) {
  // Los lotes viven en un almacén: fuera del admin solo se muestran los de sus sucursales.
  // Con una sucursal concreta elegida, se recorta a esa sola en vez de a todas las permitidas.
  const where = { qty: { [Op.gt]: 0 } };
  const wid = warehouse_id ? parseInt(warehouse_id) : null;
  if (wid && Array.isArray(allowedWarehouses) && !allowedWarehouses.includes(wid)) {
    const e = new Error("No tienes acceso a este almacén"); e.status = 403; e.isOperational = true; throw e;
  }
  if (wid) where.warehouse_id = wid;
  else if (Array.isArray(allowedWarehouses)) where.warehouse_id = { [Op.in]: allowedWarehouses };

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
