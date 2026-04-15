'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Drop old global unique constraints
      const oldConstraints = [
        { table: 'categories', constraint: 'categories_name_key' },
        { table: 'warehouses', constraint: 'warehouses_name_key' },
        { table: 'products', constraint: 'products_barcode_key' },
        { table: 'payment_methods', constraint: 'payment_methods_name_key' },
        { table: 'payment_methods', constraint: 'payment_methods_code_key' },
        { table: 'customers', constraint: 'customers_email_key' },
        { table: 'customers', constraint: 'customers_rif_key' },
        { table: 'banks', constraint: 'banks_name_key' }
      ];

      for (const item of oldConstraints) {
        await queryInterface.sequelize.query(
          `ALTER TABLE "${item.table}" DROP CONSTRAINT IF EXISTS "${item.constraint}"`,
          { transaction }
        );
      }

      // 2. Add composite unique indexes (field + company_id)
      const newIndexes = [
        { table: 'categories', fields: ['name', 'company_id'], name: 'categories_name_company_id_unique' },
        { table: 'warehouses', fields: ['name', 'company_id'], name: 'warehouses_name_company_id_unique' },
        { table: 'products', fields: ['barcode', 'company_id'], name: 'products_barcode_company_id_unique' },
        { table: 'payment_methods', fields: ['name', 'company_id'], name: 'payment_methods_name_company_id_unique' },
        { table: 'payment_methods', fields: ['code', 'company_id'], name: 'payment_methods_code_company_id_unique' },
        { table: 'customers', fields: ['email', 'company_id'], name: 'customers_email_company_id_unique' },
        { table: 'customers', fields: ['rif', 'company_id'], name: 'customers_rif_company_id_unique' },
        { table: 'banks', fields: ['name', 'company_id'], name: 'banks_name_company_id_unique' }
      ];

      for (const idx of newIndexes) {
        await queryInterface.addIndex(idx.table, idx.fields, {
          unique: true,
          name: idx.name,
          transaction
        });
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
      // Revert indexes
      const newIndexes = [
        { table: 'categories', name: 'categories_name_company_id_unique' },
        { table: 'warehouses', name: 'warehouses_name_company_id_unique' },
        { table: 'products', name: 'products_barcode_company_id_unique' },
        { table: 'payment_methods', name: 'payment_methods_name_company_id_unique' },
        { table: 'payment_methods', name: 'payment_methods_code_company_id_unique' },
        { table: 'customers', name: 'customers_email_company_id_unique' },
        { table: 'customers', name: 'customers_rif_company_id_unique' },
        { table: 'banks', name: 'banks_name_company_id_unique' }
      ];

      for (const idx of newIndexes) {
        await queryInterface.removeIndex(idx.table, idx.name, { transaction });
      }

      // We cannot easily recreate the old constraints if there are already duplicates in the DB,
      // so the down migration might fail if data violates global uniqueness. 
      // But we define it for completeness.
      const oldConstraints = [
        { table: 'categories', field: 'name', name: 'categories_name_key' },
        { table: 'warehouses', field: 'name', name: 'warehouses_name_key' },
        { table: 'products', field: 'barcode', name: 'products_barcode_key' },
        { table: 'payment_methods', field: 'name', name: 'payment_methods_name_key' },
        { table: 'payment_methods', field: 'code', name: 'payment_methods_code_key' },
        { table: 'customers', field: 'email', name: 'customers_email_key' },
        { table: 'customers', field: 'rif', name: 'customers_rif_key' },
        { table: 'banks', field: 'name', name: 'banks_name_key' }
      ];

      for (const item of oldConstraints) {
        await queryInterface.addIndex(item.table, [item.field], {
          unique: true,
          name: item.name,
          transaction
        });
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
