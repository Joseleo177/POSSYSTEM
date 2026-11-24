'use strict';

/**
 * Margen de ganancia de más de 999,99 % (24-11-2026). profit_margin era NUMERIC(5,2) en
 * products, product_stock y purchase_items, y una compra con costo 1 y precio de venta 15
 * (margen 1.400 %, normal en productos que se compran por bulto a precio de remate) fallaba al
 * guardar con "numeric field overflow". NUMERIC(10,2) llega a 99.999.999,99 %: de sobra.
 *
 * En Supabase se corre a mano (Vercel no migra): este mismo SQL + la fila en SequelizeMeta.
 */
const SQL_UP = `
  ALTER TABLE products       ALTER COLUMN profit_margin TYPE NUMERIC(10, 2);
  ALTER TABLE product_stock  ALTER COLUMN profit_margin TYPE NUMERIC(10, 2);
  ALTER TABLE purchase_items ALTER COLUMN profit_margin TYPE NUMERIC(10, 2);
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  // Sin vuelta atrás: volver a (5,2) rompería con los márgenes grandes que ya se guardaron.
  async down() {},
};
