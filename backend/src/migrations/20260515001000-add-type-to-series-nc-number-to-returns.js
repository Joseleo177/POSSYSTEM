'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('series', 'type', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'factura',
    });

    await queryInterface.addColumn('returns', 'nc_number', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('series', 'type');
    await queryInterface.removeColumn('returns', 'nc_number');
  },
};
