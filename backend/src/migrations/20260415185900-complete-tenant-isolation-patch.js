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
        // 1. Añadir columna company_id con SQL directo (idempotente)
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "company_id" INTEGER REFERENCES "companies"("id") ON DELETE CASCADE`,
          { transaction }
        );

        // 2. Asignar registros huérfanos a la Empresa 1
        await queryInterface.sequelize.query(
          `UPDATE "${table}" SET "company_id" = 1 WHERE "company_id" IS NULL`,
          { transaction }
        );

        // 3. Hacerla obligatoria
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ALTER COLUMN "company_id" SET NOT NULL`,
          { transaction }
        );
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
