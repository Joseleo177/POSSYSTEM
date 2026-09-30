'use strict';

// Movimientos por producto (kardex): la consulta arma el historial de UN producto desde las
// líneas de venta, devoluciones, compras, sesiones de ajuste y transferencias. Ninguna de
// esas tablas tenía índice por product_id, así que cada consulta recorría sale_items entera.
const INDICES = [
  ['sale_items',           'idx_sale_items_product'],
  ['return_items',         'idx_return_items_product'],
  ['purchase_items',       'idx_purchase_items_product'],
  ['stock_session_lines',  'idx_stock_session_lines_product'],
  ['stock_transfer_items', 'idx_stock_transfer_items_product'],
  ['product_combo_items',  'idx_combo_items_product'],
];

module.exports = {
  up: async (queryInterface) => {
    for (const [tabla, nombre] of INDICES) {
      await queryInterface.sequelize.query(`CREATE INDEX IF NOT EXISTS ${nombre} ON ${tabla} (product_id)`);
    }
  },

  down: async (queryInterface) => {
    for (const [, nombre] of INDICES) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS ${nombre}`);
    }
  }
};
