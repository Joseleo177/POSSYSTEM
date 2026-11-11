'use strict';

/**
 * Precio al mayor y contenido del producto (10-11-2026).
 *
 * wholesale_price: precio de venta al mayor, de toda la empresa (no por sucursal). Hoy solo lo
 *   lee el catálogo en PDF para mayoristas; la caja sigue cobrando `price`. Nulo = sin precio
 *   al mayor: el catálogo le aplica el descuento que se elige al generarlo.
 * net_content: lo que trae el envase tal como va impreso ("450 ml", "200 g"). Texto libre: no
 *   es la unidad de venta ni la presentación de compra, que siguen siendo `unit` y `package_*`.
 */
const SQL_UP = `
  ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(14,5);
  ALTER TABLE products ADD COLUMN IF NOT EXISTS net_content VARCHAR(30);
`;

const SQL_DOWN = `
  ALTER TABLE products DROP COLUMN IF EXISTS net_content;
  ALTER TABLE products DROP COLUMN IF EXISTS wholesale_price;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
