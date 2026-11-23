'use strict';

/**
 * Cruce de cuentas con proveedores (23-11-2026, pedido de Salón Juárez): hay proveedores que
 * además se llevan mercancía de la tienda, y las dos deudas se cuadran una contra otra.
 *
 * 1. El mismo RIF (y el mismo correo) puede tener DOS fichas en la empresa: una de cliente y una
 *    de proveedor. Antes el índice único era (rif, company_id) y el proveedor no podía
 *    comprarle a la tienda con su propio RIF. Ahora es (rif, company_id, type): sigue sin haber
 *    dos clientes ni dos proveedores con el mismo RIF. Las dos fichas se reconocen por el RIF.
 * 2. cruces_cuentas: cada cruce, con su monto y quién lo hizo. Los pagos que salda (de un lado
 *    purchase_payments, del otro payments) van SIN caja (payment_journal_id NULL, método
 *    'cruce') y con batch_id 'cruce:<id>': saldan deuda sin mover dinero, así que no salen en el
 *    arqueo ni en Ingresos y egresos. Anular el cruce los borra a todos juntos.
 */
const SQL_UP = `
  ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_rif_company_id_unique;
  DROP INDEX IF EXISTS customers_rif_company_id_unique;
  CREATE UNIQUE INDEX IF NOT EXISTS customers_rif_company_type_unique ON customers (rif, company_id, type);

  ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_email_company_id_unique;
  DROP INDEX IF EXISTS customers_email_company_id_unique;
  CREATE UNIQUE INDEX IF NOT EXISTS customers_email_company_type_unique ON customers (email, company_id, type);

  CREATE TABLE IF NOT EXISTS cruces_cuentas (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    proveedor_id  INTEGER NOT NULL REFERENCES customers(id),
    cliente_id    INTEGER NOT NULL REFERENCES customers(id),
    monto         NUMERIC(14, 2) NOT NULL,
    notas         TEXT,
    employee_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    estado        VARCHAR(10) NOT NULL DEFAULT 'activo',
    anulado_por   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    anulado_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS cruces_cuentas_proveedor ON cruces_cuentas (company_id, proveedor_id);
  ALTER TABLE cruces_cuentas ENABLE ROW LEVEL SECURITY;
`;
const SQL_DOWN = `
  DROP TABLE IF EXISTS cruces_cuentas;
  DROP INDEX IF EXISTS customers_email_company_type_unique;
  CREATE UNIQUE INDEX IF NOT EXISTS customers_email_company_id_unique ON customers (email, company_id);
  DROP INDEX IF EXISTS customers_rif_company_type_unique;
  CREATE UNIQUE INDEX IF NOT EXISTS customers_rif_company_id_unique ON customers (rif, company_id);
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_UP, { transaction: t }));
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(t => queryInterface.sequelize.query(SQL_DOWN, { transaction: t }));
  },
};
