'use strict';

/**
 * employees.must_change_password: la contraseña con que entró no cumple la regla
 * (utils/passwordPolicy.js). Se marca al iniciar sesión y, mientras esté puesta, el servidor solo
 * deja cambiar la contraseña (middleware/auth.js). Se apaga al cambiarla o cuando el admin le
 * pone una que cumple.
 */
const SQL_UP = `
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
`;

const SQL_DOWN = `
  ALTER TABLE employees DROP COLUMN IF EXISTS must_change_password;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
