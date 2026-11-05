'use strict';

// Avisos al teléfono del cliente (Web Push, 05-11-2026). Primera fase: "Tu pedido está listo"
// desde el QR de la mesa. Ver services/avisosPush.js.
//
// push_subscriptions: una fila por navegador que aceptó los avisos. `endpoint`, `p256dh` y `auth`
// son lo que entrega el navegador (la "dirección" del aviso); `device_hash` es la huella del
// aparato (la misma de customer_devices) y `customer_id` el cliente, si ya se sabe quién es.
// `table_id` / `table_at`: la última mesa que siguió el aparato y cuándo, para saber a quién
// avisar cuando una ronda de esa mesa queda lista. `fails`: envíos fallidos seguidos; si el
// servicio de avisos responde que la dirección ya no existe, la fila se borra.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        endpoint      TEXT NOT NULL,
        p256dh        VARCHAR(200) NOT NULL,
        auth          VARCHAR(100) NOT NULL,
        device_hash   VARCHAR(64),
        customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        table_id      INTEGER,
        table_at      TIMESTAMPTZ,
        fails         INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_ok_at    TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_direccion ON push_subscriptions (company_id, endpoint);
      CREATE INDEX IF NOT EXISTS push_subscriptions_mesa ON push_subscriptions (company_id, table_id, table_at);
      CREATE INDEX IF NOT EXISTS push_subscriptions_aparato ON push_subscriptions (company_id, device_hash) WHERE device_hash IS NOT NULL;
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS push_subscriptions`);
  },
};
