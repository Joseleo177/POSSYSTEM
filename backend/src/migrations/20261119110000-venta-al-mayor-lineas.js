'use strict';

/**
 * Venta al mayor, fase 3 (12-11-2026): cada línea de venta recuerda si se cobró al mayor.
 *
 * sale_items.wholesale: la línea se cobró al precio al mayor (cliente mayorista o cantidad
 *   mínima). Lo leen los reportes (vendido al mayor contra detal).
 * sale_items.list_price: el precio detal que se dejó de cobrar. Una cuenta en espera vuelve al
 *   carrito con ESTE precio como base: si el cajero baja la cantidad por debajo del mínimo, la
 *   línea regresa al detal en vez de quedarse pegada al precio al mayor.
 */
const SQL_UP = `
  ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS wholesale BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS list_price DECIMAL(14,5);
`;

const SQL_DOWN = `
  ALTER TABLE sale_items DROP COLUMN IF EXISTS list_price;
  ALTER TABLE sale_items DROP COLUMN IF EXISTS wholesale;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
