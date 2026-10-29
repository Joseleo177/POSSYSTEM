'use strict';

// Pedidos que el cliente hace desde el QR de su mesa. Se guardan aparte de la venta porque, en
// el modo "confirmar" (el de fábrica), todavía no son nada: ni cuenta, ni inventario, ni cocina.
// Cuando el mesonero lo acepta —o al instante en el modo "directo"— sale por el mismo camino que
// una ronda del mesonero (tables.sendRound) y aquí queda con qué venta y qué comanda generó.
//
// status: pendiente · aceptado · rechazado. `items` es lo que pidió el cliente tal cual:
// [{ product_id, qty, note, options: [ids de adicionales] }].
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS table_orders (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        table_id      INTEGER NOT NULL REFERENCES dining_tables(id) ON DELETE CASCADE,
        warehouse_id  INTEGER NOT NULL,
        items         JSONB NOT NULL,
        summary       VARCHAR(500),
        estimate      NUMERIC(14,2) NOT NULL DEFAULT 0,
        note          VARCHAR(200),
        status        VARCHAR(12) NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aceptado', 'rechazado')),
        reason        VARCHAR(200),
        sale_id       INTEGER,
        ticket_id     INTEGER,
        resolved_by   INTEGER,
        resolved_at   TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS table_orders_mesa ON table_orders (table_id, created_at);
      CREATE INDEX IF NOT EXISTS table_orders_pendientes ON table_orders (company_id, warehouse_id) WHERE status = 'pendiente';
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS table_orders`);
  },
};
