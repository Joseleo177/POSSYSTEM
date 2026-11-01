'use strict';

// Reconocer al cliente en el QR de la mesa (31-10-2026). Un "aparato" es el navegador de un
// teléfono: la página guarda ahí un código al azar y el servidor solo conoce su huella (sha256),
// nunca el código. Un cliente puede tener varios aparatos; un aparato, un solo cliente.
//
// · customer_devices: qué aparato es de qué cliente. `confirmed` = el cliente dijo "sí, soy yo"
//   o escribió su cédula; sin confirmar es un vínculo deducido (pagó la cuenta de un pedido hecho
//   desde ese aparato) y la página le pregunta "¿Eres José?" antes de usarlo. `declined` = dijo
//   "no soy yo": la fila se queda para no volver a preguntarle por ese mismo cliente.
// · table_orders.device_hash: desde qué aparato se hizo cada pedido del QR, para poder deducir
//   ese vínculo cuando la cuenta se cobra a un cliente.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS customer_devices (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        device_hash   VARCHAR(64) NOT NULL,
        confirmed     BOOLEAN NOT NULL DEFAULT false,
        declined      BOOLEAN NOT NULL DEFAULT false,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS customer_devices_aparato ON customer_devices (company_id, device_hash);
      CREATE INDEX IF NOT EXISTS customer_devices_cliente ON customer_devices (customer_id);
      ALTER TABLE table_orders ADD COLUMN IF NOT EXISTS device_hash VARCHAR(64);
      CREATE INDEX IF NOT EXISTS table_orders_aparato ON table_orders (company_id, device_hash) WHERE device_hash IS NOT NULL;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS table_orders_aparato;
      ALTER TABLE table_orders DROP COLUMN IF EXISTS device_hash;
      DROP TABLE IF EXISTS customer_devices;
    `);
  },
};
