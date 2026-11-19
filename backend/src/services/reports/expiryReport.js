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
      { model: Product,   as: 'product',   attributes: ['name', 'unit', 'cost_price', 'active_ingredient', 'shelf_location'] },
      { model: Warehouse, as: 'warehouse', attributes: ['name'] },
    ],
    order: [['expiration_date', 'ASC'], ['id', 'ASC']],
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return lots.map(l => {
    const exp = new Date(`${l.expiration_date}T00:00:00`);
    const days_left = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    const stock = parseFloat(l.qty || 0);
    const cost_price = parseFloat(l.product?.cost_price || 0);
    return {
      id:                l.id,
      product_id:        l.product_id,
      product:           l.product?.name || 'Producto desconocido',
      active_ingredient: l.product?.active_ingredient || null,
      shelf_location:    l.product?.shelf_location || null,
      lot:               l.lot_number,
      expiry:            l.expiration_date,
      days_left,
      stock,
      unit:              l.product?.unit || 'unidad',
      cost_price,
      value_at_risk:     parseFloat((stock * cost_price).toFixed(2)),
      warehouse:         l.warehouse?.name || 'N/A',
    };
  });
}

module.exports = expiryReport;
