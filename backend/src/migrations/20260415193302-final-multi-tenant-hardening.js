'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Add company_id to junction tables if not exists
      const tablesToPatch = [
        'product_stock',
        'employee_warehouses',
        'user_series',
        'product_combo_items',
        'cash_session_journals'
      ];

      for (const table of tablesToPatch) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE`,
          { transaction }
        );
        
        // 2. Set default company_id = 1 for existing data (Safe assumption for current state)
        await queryInterface.sequelize.query(
          `UPDATE "${table}" SET company_id = 1 WHERE company_id IS NULL`,
          { transaction }
        );

        // 3. Make it NOT NULL for future safety (only for tables that should ALWAYS belong to a company)
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" ALTER COLUMN company_id SET NOT NULL`,
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
      const tablesToPatch = [
        'product_stock',
        'employee_warehouses',
        'user_series',
        'product_combo_items',
        'cash_session_journals'
      ];

      for (const table of tablesToPatch) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${table}" DROP COLUMN IF EXISTS company_id`,
          { transaction }
        );
      }
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
