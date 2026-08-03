'use strict';

// El reporte de márgenes calculaba la utilidad de ventas pasadas uniendo con products.cost_price,
// es decir con el costo ACTUAL del producto. Si el costo de reposición cambia (una compra nueva,
// un ajuste de precio), la rentabilidad histórica se recalcula sola y una venta que fue rentable
// puede aparecer en pérdida — o al revés.
//
// La solución es congelar el costo en el momento de la venta, igual que ya se congela el precio
// y el nombre del producto en sale_items. Esta columna es ese snapshot.
//
// Las ventas anteriores a esta migración quedan en NULL: ese dato no existe en ninguna parte y no
// se puede reconstruir. El reporte hace COALESCE(si.cost_price, p.cost_price), así que esas siguen
// comportándose como hasta ahora (costo actual) y las nuevas usan el costo real del momento.
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('sale_items');
    if (!tableInfo.cost_price) {
      await queryInterface.addColumn('sale_items', 'cost_price', {
        // Misma precisión que products.cost_price: DECIMAL(14,5).
        type: Sequelize.DECIMAL(14, 5),
        allowNull: true,
      });
      console.log('--- Migración: añadido cost_price a sale_items ---');
    }
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('sale_items', 'cost_price');
  },
};