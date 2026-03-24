'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS cash_sessions (
        id              SERIAL PRIMARY KEY,
        employee_id     INTEGER REFERENCES employees(id)         ON DELETE SET NULL,
        warehouse_id    INTEGER REFERENCES warehouses(id)        ON DELETE SET NULL,
        journal_id      INTEGER REFERENCES payment_journals(id)  ON DELETE SET NULL,
        opening_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
        closing_amount  NUMERIC(12,2),
        expected_amount NUMERIC(12,2),
        difference      NUMERIC(12,2),
        status          VARCHAR(20)   NOT NULL DEFAULT 'open',
        notes           TEXT,
        opened_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        closed_at       TIMESTAMPTZ
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS cash_sessions;`);
  }
};
