'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      -- Recrear cash_sessions sin las columnas de diario (ahora van en tabla aparte)
      DROP TABLE IF EXISTS cash_sessions CASCADE;

      CREATE TABLE cash_sessions (
        id           SERIAL PRIMARY KEY,
        employee_id  INTEGER REFERENCES employees(id)  ON DELETE SET NULL,
        warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
        status       VARCHAR(20)  NOT NULL DEFAULT 'open',
        notes        TEXT,
        opened_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        closed_at    TIMESTAMPTZ
      );

      -- Fondos por diario dentro de cada sesión
      CREATE TABLE IF NOT EXISTS cash_session_journals (
        id              SERIAL PRIMARY KEY,
        session_id      INTEGER REFERENCES cash_sessions(id) ON DELETE CASCADE,
        journal_id      INTEGER REFERENCES payment_journals(id) ON DELETE SET NULL,
        opening_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
        closing_amount  NUMERIC(12,2),
        expected_amount NUMERIC(12,2),
        difference      NUMERIC(12,2)
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS cash_session_journals;
      DROP TABLE IF EXISTS cash_sessions;
    `);
  }
};
