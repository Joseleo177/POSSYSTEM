'use strict';

// Tasa a la que se compró. Los costos de la orden se guardan convertidos a moneda base, así
// que sin esta columna no quedaba registro de a qué tasa se cargó la factura del proveedor:
// al reabrir el borrador los costos en bolívares se recalculaban con la tasa vigente ese día
// y ya no coincidían con el papel del proveedor.
//
// currency_id acompaña a la tasa porque una tasa suelta no dice en qué moneda se facturó;
// null en ambas = orden cargada directamente en moneda base (todas las anteriores a esto).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('purchases', 'currency_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('purchases', 'exchange_rate', {
      type: Sequelize.DECIMAL(12, 6),
      allowNull: false,
      defaultValue: 1.0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('purchases', 'exchange_rate');
    await queryInterface.removeColumn('purchases', 'currency_id');
  },
};
