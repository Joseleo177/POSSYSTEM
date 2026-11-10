'use strict';

// Factura de servicios (10-11-2026): una compra sin mercancía, solo con líneas de gasto
// (purchase_charges). Mano de obra, reparaciones, una ferretería con varios renglones, la luz a
// crédito. `kind`: 'mercancia' (la de siempre: productos que entran al inventario) o 'servicios'
// (no pasa por recibir; queda registrada y por pagar). Ver services/purchases/fiscalCompra.js.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'mercancia';
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE purchases DROP COLUMN IF EXISTS kind;`);
  },
};
