'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tablesToUpdate = [
        'expenses',
        'expense_categories',
        'return_items'
      ];

      for (const table of tablesToUpdate) {
        // 1. Añadir columna company_id si no existe
        await queryInterface.addColumn(table, 'company_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'companies', key: 'id' },
          onDelete: 'CASCADE'
        }, { transaction });

        // 2. Asignar registros huérfanos a la Empresa 1
        await queryInterface.sequelize.query(
          `UPDATE "${table}" SET "company_id" = 1 WHERE "company_id" IS NULL`,
          { transaction }
        );

        // 3. Hacerla obligatoria
        await queryInterface.changeColumn(table, 'company_id', {
          type: Sequelize.INTEGER,
          allowNull: false
        }, { transaction });
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tablesToRemove = ['expenses', 'expense_categories', 'return_items'];
      for (const table of tablesToRemove) {
        await queryInterface.removeColumn(table, 'company_id', { transaction });
      }
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
