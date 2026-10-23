'use strict';

/**
 * El dibujo de cómo se picó una pieza al devolverla: qué zona se usó y dónde quedó cada retazo,
 * en milímetros desde la esquina de la pieza. Se guarda con la devolución para que el historial
 * de la lámina muestre de qué parte salió cada retazo. Es opcional: quien escribe las medidas
 * a mano no deja dibujo.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE fabrication_order_pieces ADD COLUMN IF NOT EXISTS layout JSONB`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE fabrication_order_pieces DROP COLUMN IF EXISTS layout`);
  },
};
