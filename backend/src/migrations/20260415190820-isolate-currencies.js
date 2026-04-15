'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Drop existing global uniqueness constraint on code (usually currencies_code_key)
      await queryInterface.sequelize.query(
        `ALTER TABLE "currencies" DROP CONSTRAINT IF EXISTS "currencies_code_key"`,
        { transaction }
      );

      // 2. Add company_id to currencies
      await queryInterface.sequelize.query(
        `ALTER TABLE "currencies" ADD COLUMN IF NOT EXISTS "company_id" INTEGER REFERENCES "companies"("id") ON DELETE CASCADE`,
        { transaction }
      );

      // 3. Assign existing currencies to company 1
      await queryInterface.sequelize.query(
        `UPDATE "currencies" SET "company_id" = 1 WHERE "company_id" IS NULL`,
        { transaction }
      );

      // 4. Make company_id mandatory
      await queryInterface.sequelize.query(
        `ALTER TABLE "currencies" ALTER COLUMN "company_id" SET NOT NULL`,
        { transaction }
      );

      // 5. Add unique composite index for code + company_id
      await queryInterface.addIndex('currencies', ['code', 'company_id'], {
        unique: true,
        name: 'currencies_code_company_id_unique',
        transaction
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex('currencies', 'currencies_code_company_id_unique', { transaction });
      await queryInterface.removeColumn('currencies', 'company_id', { transaction });
      await queryInterface.addIndex('currencies', ['code'], {
        unique: true,
        name: 'currencies_code_key',
        transaction
      });
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
