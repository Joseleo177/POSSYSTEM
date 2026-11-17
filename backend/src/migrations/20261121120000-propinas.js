'use strict';

// Propinas (17-11-2026), pedidas por un restaurante. Decisiones del dueño:
//  - La propina va en la factura: es el recargo de la caja marcado como propina
//    (sales.service_charge_is_tip). Hace falta la marca porque el delivery de los pedidos web
//    también usa service_charge.
//  - Va a una persona (el mesonero de la cuenta, sales.tip_seller_id) o a un POZO que se reparte
//    al liquidar (sales.tip_pool). El modo es un ajuste de la empresa (settings.propinas_reparto)
//    y se copia en la venta al cobrarla, como el % de la comisión: cambiar el modo mañana no mueve
//    lo ya cobrado.
//  - Las personas son las mismas de Comisiones (sellers): con o sin usuario.
//  - Se gana al COBRAR, como las comisiones (ver services/tips).
//  - Cambiar el mesonero de una propina es un permiso propio y vale aun con la factura cerrada:
//    cada cambio queda en tip_reassignments.
//  - Se paga como las comisiones: un egreso (categoría "Propinas") y tip_payouts que lo apuntan.
//    Un reparto del pozo es UN egreso con varias filas (from_pool). Anular el egreso deshace todo.
// Es un extra por empresa (companies.propinas_enabled), apagado.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS propinas_enabled BOOLEAN NOT NULL DEFAULT false;

      ALTER TABLE sales ADD COLUMN IF NOT EXISTS service_charge_is_tip BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS tip_seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL;
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS tip_pool BOOLEAN NOT NULL DEFAULT false;
      CREATE INDEX IF NOT EXISTS sales_tip ON sales (company_id, created_at) WHERE service_charge_is_tip;

      CREATE TABLE IF NOT EXISTS tip_payouts (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        seller_id   INTEGER NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
        amount      NUMERIC(14, 5) NOT NULL CHECK (amount > 0),
        from_pool   BOOLEAN NOT NULL DEFAULT false,
        expense_id  INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
        paid_at     DATE NOT NULL,
        period_from DATE,
        period_to   DATE,
        notes       VARCHAR(300),
        employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS tip_payouts_seller ON tip_payouts (seller_id, paid_at);
      CREATE INDEX IF NOT EXISTS tip_payouts_expense ON tip_payouts (expense_id);

      CREATE TABLE IF NOT EXISTS tip_reassignments (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        sale_id        INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        from_seller_id INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
        to_seller_id   INTEGER REFERENCES sellers(id) ON DELETE SET NULL,
        from_pool      BOOLEAN NOT NULL DEFAULT false,
        to_pool        BOOLEAN NOT NULL DEFAULT false,
        reason         VARCHAR(300),
        employee_id    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS tip_reassignments_sale ON tip_reassignments (sale_id, created_at);
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS tip_reassignments;
      DROP TABLE IF EXISTS tip_payouts;
      DROP INDEX IF EXISTS sales_tip;
      ALTER TABLE sales DROP COLUMN IF EXISTS tip_pool;
      ALTER TABLE sales DROP COLUMN IF EXISTS tip_seller_id;
      ALTER TABLE sales DROP COLUMN IF EXISTS service_charge_is_tip;
      ALTER TABLE companies DROP COLUMN IF EXISTS propinas_enabled;
    `);
  },
};
