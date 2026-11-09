'use strict';

/**
 * Deuda anterior de un cliente (09-11-2026).
 *
 * Lo que el comercio llevaba fiado en un cuaderno antes de usar el sistema. Se guarda como una
 * venta sin líneas (sales.is_prior_debt) para que se cobre, se abone, se exonere y aparezca en
 * Cuentas por cobrar, Cobranza y la ficha igual que cualquier factura, pero NO es una venta:
 * no consume correlativo fiscal (su referencia es DA-<id>), no mueve inventario y queda fuera
 * de lo vendido, la rentabilidad, el libro de ventas y el turno de caja.
 *
 * prior_debt_note: de dónde salió ("Cuaderno, pág. 12") y, si se anotó en bolívares, el monto
 * y la tasa con que se convirtió.
 */
const SQL_UP = `
  ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_prior_debt BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE sales ADD COLUMN IF NOT EXISTS prior_debt_note VARCHAR(300);
`;

const SQL_DOWN = `
  ALTER TABLE sales DROP COLUMN IF EXISTS prior_debt_note;
  ALTER TABLE sales DROP COLUMN IF EXISTS is_prior_debt;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
