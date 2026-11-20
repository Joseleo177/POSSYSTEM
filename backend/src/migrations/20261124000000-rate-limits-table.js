'use strict';

/**
 * Rate limiting compartido (Vercel + Supabase).
 *
 * Tabla de contadores para el store PostgresStore (ver middleware/postgresStore.js). Cada key
 * es una IP (prefijada por limiter) y la fila guarda cuántos intentos lleva y cuándo expira el
 * período. El ON CONFLICT del store la va incrementando de forma atómica.
 */
const SQL_UP = `
  CREATE TABLE IF NOT EXISTS rate_limits (
    key      TEXT PRIMARY KEY,
    hits     INTEGER NOT NULL DEFAULT 0,
    reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const SQL_DOWN = `DROP TABLE IF EXISTS rate_limits;`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
