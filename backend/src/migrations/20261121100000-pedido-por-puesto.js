'use strict';

/**
 * Pedido por puesto (17-11-2026): cada plato de una mesa puede decir a qué puesto va.
 *
 * sale_items.seat: puesto de la mesa (1, 2, 3…) del que pidió el plato. Null = "Mesa", lo que
 *   se comparte (una jarra, unos tequeños) o la cuenta de una empresa que no pide por puesto.
 *   Sirve para llevar cada plato a quien lo pidió y para dividir la cuenta por puesto.
 * kitchen_ticket_items.seat: el mismo puesto, copiado en la comanda (la cocina rotula "P2").
 *
 * Se enciende por empresa con el ajuste `mesa_por_puesto` (settings), apagado por defecto.
 */
const SQL_UP = `
  ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS seat SMALLINT;
  ALTER TABLE kitchen_ticket_items ADD COLUMN IF NOT EXISTS seat SMALLINT;
`;

const SQL_DOWN = `
  ALTER TABLE kitchen_ticket_items DROP COLUMN IF EXISTS seat;
  ALTER TABLE sale_items DROP COLUMN IF EXISTS seat;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
