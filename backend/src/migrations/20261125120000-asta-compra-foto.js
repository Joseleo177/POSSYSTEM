'use strict';

/**
 * Compra desde foto con Asta (23-11-2026).
 *
 * 1. asistente_mensajes.consultas: cuánto pesa cada registro en el cupo del mes. Una pregunta
 *    del chat vale 1; leer el documento de un proveedor vale 5 (cuesta como 5–8 preguntas).
 * 2. compra_alias: cómo llama cada proveedor a un producto de la tienda. El proveedor escribe
 *    "MAIZORITO CRONCH FLAKES 12X300GR" y en el catálogo es "Cereal Maizorito 300 g"; cuando el
 *    usuario los empareja una vez, la próxima factura ya sale emparejada, con su empaque.
 */
const SQL_UP = `
  ALTER TABLE asistente_mensajes ADD COLUMN IF NOT EXISTS consultas SMALLINT NOT NULL DEFAULT 1;

  CREATE TABLE IF NOT EXISTS compra_alias (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    clave         VARCHAR(200) NOT NULL,
    product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    package_unit  VARCHAR(50),
    package_size  NUMERIC(10,3),
    veces         INTEGER NOT NULL DEFAULT 1,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS compra_alias_clave ON compra_alias (company_id, clave);
  ALTER TABLE compra_alias ENABLE ROW LEVEL SECURITY;
`;
const SQL_DOWN = `
  DROP TABLE IF EXISTS compra_alias;
  ALTER TABLE asistente_mensajes DROP COLUMN IF EXISTS consultas;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
