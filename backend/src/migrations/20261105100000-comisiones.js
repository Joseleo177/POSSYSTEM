'use strict';

// Comisiones por vendedor (02-11-2026). Lo pidió una joyería con 10 vendedores de los que solo
// 2 tienen usuario (los de caja): el vendedor NO puede depender de tener usuario, así que vive
// en su propia tabla y la venta lo apunta aparte del cajero.
//
//  - sellers: el vendedor, con su % de comisión. employee_id lo enlaza a un usuario si lo tiene.
//  - sales.seller_id / seller_pct: quién vendió y con qué %. El % se copia en la venta para que
//    cambiarlo mañana no altere lo ya vendido. employee_id sigue siendo el cajero (el arqueo no
//    cambia), igual que waiter_id en las mesas.
//  - commission_payouts: cada liquidación, con el egreso que la pagó. Anular ese egreso desde
//    Contabilidad deshace la liquidación (se suman solo las de egreso vivo).
//
// La comisión se gana al COBRAR, sobre lo cobrado sin recargos (delivery, servicio); las
// devoluciones la restan (ver services/commissions). Es un extra por empresa, apagado.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS comisiones_enabled BOOLEAN NOT NULL DEFAULT false;

      CREATE TABLE IF NOT EXISTS sellers (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code           VARCHAR(10) NOT NULL,
        name           VARCHAR(120) NOT NULL,
        doc_id         VARCHAR(20),
        phone          VARCHAR(30),
        commission_pct NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (commission_pct BETWEEN 0 AND 100),
        warehouse_id   INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
        employee_id    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        active         BOOLEAN NOT NULL DEFAULT true,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS sellers_company_code ON sellers (company_id, lower(code));

      ALTER TABLE sales ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS seller_pct NUMERIC(5, 2);
      CREATE INDEX IF NOT EXISTS sales_seller ON sales (seller_id) WHERE seller_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS commission_payouts (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        seller_id   INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
        amount      NUMERIC(14, 5) NOT NULL CHECK (amount > 0),
        expense_id  INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
        paid_at     DATE NOT NULL,
        notes       VARCHAR(300),
        employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS commission_payouts_seller ON commission_payouts (seller_id, paid_at);
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS commission_payouts;
      ALTER TABLE sales DROP COLUMN IF EXISTS seller_pct;
      ALTER TABLE sales DROP COLUMN IF EXISTS seller_id;
      DROP TABLE IF EXISTS sellers;
      ALTER TABLE companies DROP COLUMN IF EXISTS comisiones_enabled;
    `);
  },
};
