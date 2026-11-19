'use strict';

/**
 * Lotes FEFO en ventas y transferencias:
 *  - sale_items.lot_allocations: JSONB con los lotes descontados en FEFO al vender
 *    ([{ lot_id, lot_number, expiration_date, qty }]), para reponer al lote exacto al anular/devolver.
 *  - stock_transfer_items.lot_allocations: JSONB con los lotes despachados desde el origen,
 *    para acreditarlos en el almacén destino al recibir o devolverlos al origen al anular.
 */
const SQL_UP = `
  ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS lot_allocations JSONB;
  ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS lot_allocations JSONB;
`;

const SQL_DOWN = `
  ALTER TABLE stock_transfer_items DROP COLUMN IF EXISTS lot_allocations;
  ALTER TABLE sale_items DROP COLUMN IF EXISTS lot_allocations;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
