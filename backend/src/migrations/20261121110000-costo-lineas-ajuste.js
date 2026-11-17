'use strict';

/**
 * Reporte de mermas (17-11-2026): cada línea de ajuste de inventario guarda el costo unitario que
 * tenía el producto en esa sucursal al hacerse. Lo llena un hook del modelo (StockSessionLine).
 * Las líneas de antes quedan en null y el reporte las valora al costo de hoy, marcadas como
 * estimadas.
 */
const SQL_UP = `
  ALTER TABLE stock_session_lines ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(14,5);
  CREATE INDEX IF NOT EXISTS idx_stock_session_lines_reason ON stock_session_lines (reason, created_at);
`;

const SQL_DOWN = `
  DROP INDEX IF EXISTS idx_stock_session_lines_reason;
  ALTER TABLE stock_session_lines DROP COLUMN IF EXISTS unit_cost;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
