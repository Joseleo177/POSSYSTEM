'use strict';

/**
 * Cobro a tasa de divisas, segunda parte.
 *
 * - `fx_base_rate`: la tasa del sistema con la que se calculó la rebaja (la del BCV ese día).
 *   El ticket en bolívares se imprime a ella: a la tasa especial los precios salían inflados y
 *   con un descuento grande, y el cliente veía un "subtotal" que nunca vio en la caja.
 * - `fx_forgiven`: la parte de `forgiven_amount` que es rebaja por pagar en divisas, aplicada
 *   al cobrar una factura que no traía tasa. No es un perdón de deuda: no debe dejar la factura
 *   'exonerado', "Deshacer exoneración" no la toca, se deshace sola si se borra el cobro que la
 *   trajo, y la nota de crédito la descuenta como un descuento más.
 *
 * Las de prueba que ya tenían la rebaja anotada como exoneración se reconocen por su motivo.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'fx_base_rate', { type: Sequelize.DECIMAL(12, 6), allowNull: true });
    await queryInterface.addColumn('sales', 'fx_forgiven', { type: Sequelize.DECIMAL(14, 6), allowNull: false, defaultValue: 0 });
    await queryInterface.sequelize.query(`
      UPDATE sales SET fx_forgiven = forgiven_amount
       WHERE fx_rate IS NOT NULL AND COALESCE(fx_discount, 0) = 0
         AND forgiven_amount > 0 AND forgiven_reason LIKE 'Pago en divisas a tasa%'
    `);
    // Las facturadas con tasa antes de esta columna: la tasa de la venta, si la pantalla estaba
    // en bolívares (es la del sistema de ese momento).
    await queryInterface.sequelize.query(`
      UPDATE sales SET fx_base_rate = exchange_rate
       WHERE fx_rate IS NOT NULL AND fx_base_rate IS NULL AND exchange_rate > 1
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales', 'fx_forgiven');
    await queryInterface.removeColumn('sales', 'fx_base_rate');
  },
};
