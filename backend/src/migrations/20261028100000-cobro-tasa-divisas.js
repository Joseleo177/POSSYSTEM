'use strict';

/**
 * Cobro a tasa de divisas.
 *
 * Hay comercios que reciben el dólar (efectivo, Zelle, USDT) por encima de la tasa oficial: la
 * cuenta da Bs.8000 a 800 y en divisas se cobran $8 en vez de $10, porque el dólar se toma a
 * 1000. Esos $2 son un descuento por pagar en divisas y se guardan como tal: suman en
 * `discount_amount`, igual que cualquier descuento de la venta, y así el total en moneda base
 * es lo que de verdad entra a la gaveta.
 *
 * - `fx_rate`: la tasa especial que tecleó la caja. Todo lo que se cobre en bolívares de esta
 *   factura, ahora o después, va a esa tasa (createPayment la impone). Así, quien paga todo en
 *   bolívares paga lo mismo que a precio normal, y quien mezcla paga la parte en Bs a 1000.
 * - `fx_currency_id`: la moneda a la que se aplica (los bolívares).
 * - `fx_discount`: la parte de `discount_amount` que salió de la tasa, en moneda base. Separa
 *   este descuento del que da la caja a mano, que pide otro permiso y tiene tope.
 *
 * Permiso nuevo `sales.fx`. Es una facultad nueva: no se le concede a nadie por migración y
 * solo la tiene el administrador hasta que se dé desde la pantalla de Roles.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'fx_rate', { type: Sequelize.DECIMAL(12, 6), allowNull: true });
    await queryInterface.addColumn('sales', 'fx_currency_id', { type: Sequelize.INTEGER, allowNull: true });
    await queryInterface.addColumn('sales', 'fx_discount', { type: Sequelize.DECIMAL(14, 5), allowNull: false, defaultValue: 0 });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE roles SET permissions = permissions - 'sales.fx'
       WHERE permissions->'sales.fx' IS NOT NULL
    `);
    await queryInterface.removeColumn('sales', 'fx_discount');
    await queryInterface.removeColumn('sales', 'fx_currency_id');
    await queryInterface.removeColumn('sales', 'fx_rate');
  },
};
