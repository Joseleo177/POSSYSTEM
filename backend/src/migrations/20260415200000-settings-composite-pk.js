'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Drop the old single-column primary key on settings
      await queryInterface.sequelize.query(
        'ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey',
        { transaction }
      );

      // Add composite primary key (key, company_id)
      await queryInterface.sequelize.query(
        'ALTER TABLE settings ADD PRIMARY KEY (key, company_id)',
        { transaction }
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        'ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey',
        { transaction }
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE settings ADD PRIMARY KEY (key)',
        { transaction }
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
