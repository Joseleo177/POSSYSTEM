'use strict';

/**
 * Ajustes de la PLATAFORMA (20-11-2026): lo que no es de ninguna empresa y edita solo el
 * superusuario desde Configuración. `settings` no sirve: su company_id es obligatorio y todo lo
 * que hay ahí es de una tienda.
 *
 * El primer uso es la llave del asistente con IA: guardarla aquí y no en una variable de entorno
 * evita redesplegar Vercel (o reiniciar cada Docker) para cambiarla. Los secretos se guardan
 * cifrados (ver utils/secretos.js), así un pg_dump no los deja a la vista.
 */
const SQL_UP = `
  CREATE TABLE IF NOT EXISTS plataforma_ajustes (
    clave       VARCHAR(100) PRIMARY KEY,
    valor       TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE plataforma_ajustes ENABLE ROW LEVEL SECURITY;
`;
const SQL_DOWN = `DROP TABLE IF EXISTS plataforma_ajustes;`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
