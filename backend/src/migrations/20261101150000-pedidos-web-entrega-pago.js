'use strict';

// Pedidos del catálogo con entrega y pago.
//
// · payment_journal_methods.catalog_visible / catalog_info: qué métodos de cada cuenta publica
//   la empresa en el catálogo y con qué datos (titular, documento, teléfono del pago móvil,
//   número de cuenta, correo de Zelle). El cliente elige uno de estos para pagar.
// · delivery_zones: zonas de reparto con su precio, por sucursal (NULL = todas).
// · sales.fulfillment ('retiro' | 'delivery') y la dirección del delivery con su punto GPS. El
//   costo del delivery va en el recargo de la venta (service_charge), como en la caja.
// · payment_reports: el pago que el cliente dice haber hecho. Nace 'pendiente'; pasa a
//   'confirmado' si ya está en un extracto subido (casa referencia y monto) o si alguien lo
//   confirma; 'aplicado' cuando la caja lo registra como cobro de la factura.
//
// Permiso nuevo accounting.confirm (confirmar pagos reportados): se concede a quien ya
// conciliaba bancos.
//
// companies.pedidos_web_enabled: es un extra que el superusuario enciende por empresa (y que
// requiere el catálogo público). Sin él nada de esto existe para la empresa.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await q(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS pedidos_web_enabled BOOLEAN NOT NULL DEFAULT FALSE`);

      await q(`ALTER TABLE payment_journal_methods ADD COLUMN IF NOT EXISTS catalog_visible BOOLEAN NOT NULL DEFAULT FALSE`);
      await q(`ALTER TABLE payment_journal_methods ADD COLUMN IF NOT EXISTS catalog_info JSONB`);

      await q(`
        CREATE TABLE IF NOT EXISTS delivery_zones (
          id            SERIAL PRIMARY KEY,
          company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          warehouse_id  INTEGER REFERENCES warehouses(id) ON DELETE CASCADE,
          name          VARCHAR(80) NOT NULL,
          price         NUMERIC(14,2) NOT NULL DEFAULT 0,
          active        BOOLEAN NOT NULL DEFAULT TRUE,
          sort_order    INTEGER NOT NULL DEFAULT 0,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await q(`CREATE INDEX IF NOT EXISTS delivery_zones_company ON delivery_zones (company_id)`);

      await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS fulfillment VARCHAR(10)`);
      await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_zone_id INTEGER`);
      await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_address VARCHAR(300)`);
      await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_reference VARCHAR(200)`);
      await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(9,6)`);
      await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(9,6)`);

      await q(`
        CREATE TABLE IF NOT EXISTS payment_reports (
          id                SERIAL PRIMARY KEY,
          company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          sale_id           INTEGER REFERENCES sales(id) ON DELETE SET NULL,
          customer_id       INTEGER,
          journal_id        INTEGER NOT NULL,
          payment_method    VARCHAR(30),
          currency_id       INTEGER,
          amount            NUMERIC(18,2) NOT NULL,
          exchange_rate     NUMERIC(18,6) NOT NULL DEFAULT 1,
          amount_base       NUMERIC(14,6) NOT NULL,
          reference_number  VARCHAR(100) NOT NULL,
          reference_date    DATE NOT NULL,
          payer_bank        VARCHAR(80),
          payer_phone       VARCHAR(30),
          status            VARCHAR(12) NOT NULL DEFAULT 'pendiente'
                            CHECK (status IN ('pendiente', 'confirmado', 'rechazado', 'aplicado')),
          confirmed_via     VARCHAR(10),
          statement_line_id INTEGER,
          payment_id        INTEGER,
          reviewed_by       INTEGER,
          reviewed_at       TIMESTAMPTZ,
          reject_reason     VARCHAR(200),
          created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await q(`CREATE INDEX IF NOT EXISTS payment_reports_sale ON payment_reports (sale_id)`);
      await q(`CREATE INDEX IF NOT EXISTS payment_reports_abiertos ON payment_reports (company_id, journal_id) WHERE status IN ('pendiente', 'confirmado')`);
      // Una línea del banco explica un solo pago reportado.
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS payment_reports_line ON payment_reports (statement_line_id) WHERE statement_line_id IS NOT NULL AND status <> 'rechazado'`);

      await q(`
        UPDATE roles
           SET permissions = permissions || '{"accounting.confirm": true}'::jsonb
         WHERE (permissions->>'accounting.reconcile')::boolean IS TRUE
           AND permissions->'accounting.confirm' IS NULL
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP TABLE IF EXISTS payment_reports`);
      await q(`DROP TABLE IF EXISTS delivery_zones`);
      for (const c of ["fulfillment", "delivery_zone_id", "delivery_address", "delivery_reference", "delivery_lat", "delivery_lng"]) {
        await q(`ALTER TABLE sales DROP COLUMN IF EXISTS ${c}`);
      }
      await q(`ALTER TABLE payment_journal_methods DROP COLUMN IF EXISTS catalog_visible`);
      await q(`ALTER TABLE payment_journal_methods DROP COLUMN IF EXISTS catalog_info`);
      await q(`ALTER TABLE companies DROP COLUMN IF EXISTS pedidos_web_enabled`);
      await q(`UPDATE roles SET permissions = permissions - 'accounting.confirm' WHERE permissions->'accounting.confirm' IS NOT NULL`);
    });
  },
};
