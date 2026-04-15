'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn('companies', 'plan_name', {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Básico'
      }, { transaction });

      await queryInterface.addColumn('companies', 'subscription_status', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'Demo'
      }, { transaction });

      await queryInterface.addColumn('companies', 'expires_at', {
        type: Sequelize.DATE,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('companies', 'max_users', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5
      }, { transaction });

      // Actualizar Empresa 1 con plan ilimitado
      await queryInterface.sequelize.query(
        "UPDATE companies SET plan_name = 'Ilimitado', subscription_status = 'Activa', max_users = 0 WHERE id = 1",
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('companies', 'plan_name');
    await queryInterface.removeColumn('companies', 'subscription_status');
    await queryInterface.removeColumn('companies', 'expires_at');
    await queryInterface.removeColumn('companies', 'max_users');
  }
};
