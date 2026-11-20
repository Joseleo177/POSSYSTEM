'use strict';

/**
 * employees.token_version: versión de las sesiones de cada empleado. Viaja dentro del token
 * (`tv`) y el servidor la compara en cada petición (middleware/auth.js) y al renovar
 * (/auth/refresh). Subirla cierra TODAS las sesiones abiertas de esa persona:
 *  - lo hace el sistema al cambiar la contraseña (uno mismo o el admin);
 *  - y se puede hacer a mano para sacar a todos:
 *      UPDATE employees SET token_version = token_version + 1;                  -- todos
 *      UPDATE employees SET token_version = token_version + 1 WHERE company_id = X;  -- una empresa
 * Los tokens anteriores a esta columna no traen versión y se toman como 0: el deploy no saca
 * a nadie.
 */
const SQL_UP = `
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
`;

const SQL_DOWN = `
  ALTER TABLE employees DROP COLUMN IF EXISTS token_version;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
