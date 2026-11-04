'use strict';

// Cobranza por sectores (04-11-2026). La pidió una empresa de ponques que reparte "bolsas" a
// crédito en pueblos: cada pueblo o zona tiene su cobrador, que pasa a cobrar los abonos y, si el
// cliente salda, le deja otra bolsa. Sirve igual para cualquier venta a crédito por ruta.
//
//  - cobranza_sectors: el pueblo o zona. Pertenece a una sucursal: de ahí sale la mercancía, la
//    serie de las facturas y las cajas donde entra lo cobrado.
//  - cobranza_sector_employees: quién trabaja cada sector (cobrador, vendedor o los dos).
//  - customers.sector_id: el sector del cliente.
//
// Dejar una bolsa es una venta a crédito normal (createSale + confirmCreditSale) y un abono es un
// cobro conjunto de sus facturas (createBulkPayment): no hay dinero ni deuda fuera de sales y
// payments, así que Cuentas por cobrar, el arqueo y los reportes lo ven sin cambios.
//
// Es un extra por empresa (companies.cobranza_enabled), apagado.
//
// SUPABASE: aplicar migrations-sql/20261109-cobranza-sectores.sql a mano ANTES del deploy: el
// modelo Customer ya lee customers.sector_id y sin la columna falla todo lo que toca clientes.
const SQL_UP = `
  ALTER TABLE companies ADD COLUMN IF NOT EXISTS cobranza_enabled BOOLEAN NOT NULL DEFAULT false;

  CREATE TABLE IF NOT EXISTS cobranza_sectors (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    name         VARCHAR(80) NOT NULL,
    notes        TEXT,
    active       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS cobranza_sectors_company_name
    ON cobranza_sectors (company_id, lower(name));

  CREATE TABLE IF NOT EXISTS cobranza_sector_employees (
    sector_id   INTEGER NOT NULL REFERENCES cobranza_sectors(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    PRIMARY KEY (sector_id, employee_id)
  );
  CREATE INDEX IF NOT EXISTS cobranza_sector_employees_employee
    ON cobranza_sector_employees (employee_id);

  ALTER TABLE customers ADD COLUMN IF NOT EXISTS sector_id INTEGER
    REFERENCES cobranza_sectors(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS customers_sector ON customers (sector_id) WHERE sector_id IS NOT NULL;

  -- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
  ALTER TABLE cobranza_sectors ENABLE ROW LEVEL SECURITY;
  ALTER TABLE cobranza_sector_employees ENABLE ROW LEVEL SECURITY;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(SQL_UP);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS customers_sector;
      ALTER TABLE customers DROP COLUMN IF EXISTS sector_id;
      DROP TABLE IF EXISTS cobranza_sector_employees;
      DROP TABLE IF EXISTS cobranza_sectors;
      ALTER TABLE companies DROP COLUMN IF EXISTS cobranza_enabled;
    `);
  },
};
