'use strict';

/**
 * Asistente con IA (20-11-2026): un chat que responde "¿cómo hago...?" con el manual del sistema
 * y consulta los datos de la tienda con herramientas fijas (ver services/asistente).
 *
 * Decisiones del dueño:
 *  - Es un extra cobrado por empresa (companies.asistente_enabled), apagado.
 *  - Dos niveles con la MISMA función: IA Básico e IA Full. Solo cambia el tope de preguntas al
 *    mes (300 y 3.000). companies.asistente_limite lo pisa por empresa (NULL = el del nivel).
 *  - Quién ve el chat lo decide la tienda con el permiso assistant.use (fuera de todo LEGACY_MAP:
 *    de entrada solo el admin). Lo que responde depende de los permisos de cada usuario.
 *  - Cada pregunta queda en asistente_mensajes con sus tokens y su costo, para poder cobrar.
 */
const SQL_UP = `
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS asistente_enabled BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS asistente_plan VARCHAR(10) NOT NULL DEFAULT 'basico';
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS asistente_limite INTEGER;

  CREATE TABLE IF NOT EXISTS asistente_mensajes (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    pregunta        TEXT NOT NULL,
    respuesta       TEXT,
    herramientas    JSONB NOT NULL DEFAULT '[]',
    tokens_cache    INTEGER NOT NULL DEFAULT 0,
    tokens_entrada  INTEGER NOT NULL DEFAULT 0,
    tokens_salida   INTEGER NOT NULL DEFAULT 0,
    costo_usd       NUMERIC(12, 6) NOT NULL DEFAULT 0,
    duracion_ms     INTEGER,
    error           VARCHAR(300),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS asistente_mensajes_empresa ON asistente_mensajes (company_id, created_at);
  ALTER TABLE asistente_mensajes ENABLE ROW LEVEL SECURITY;
`;
const SQL_DOWN = `
  DROP TABLE IF EXISTS asistente_mensajes;
  ALTER TABLE companies DROP COLUMN IF EXISTS asistente_limite;
  ALTER TABLE companies DROP COLUMN IF EXISTS asistente_plan;
  ALTER TABLE companies DROP COLUMN IF EXISTS asistente_enabled;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
