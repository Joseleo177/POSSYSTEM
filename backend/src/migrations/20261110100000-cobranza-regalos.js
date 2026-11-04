'use strict';

// Regalos de la cobranza (04-11-2026). Al saldar su bolsa el cliente gana un obsequio (una
// silla, un espejo, una platera): no hay regla fija, lo decide el cobrador. El cliente pidió
// controlar el inventario de esos regalos.
//
//  - Los regalos son productos de una categoría que se elige en Cobranza → Sectores
//    (setting cobranza_regalos_category_id): se compran y se cargan como cualquier mercancía.
//  - cobranza_regalos: el regalo de un cliente, numerado por empresa (RG-0001), con la bolsa que
//    lo ganó si la hay. "por_entregar" lo aparta: no mueve existencia, pero ya no se le puede
//    prometer a otro. "entregado" lo descuenta de la sucursal del sector con una línea de sesión
//    (motivo 'regalo', notas "RG-0001 · ..."), que es lo que lee el kardex. Anular uno entregado
//    lo devuelve con otra línea.
//
// SUPABASE: aplicar migrations-sql/20261110-cobranza-regalos.sql a mano ANTES del deploy.
const SQL_UP = `
  CREATE TABLE IF NOT EXISTS cobranza_regalos (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    number       INTEGER NOT NULL,
    customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    sale_id      INTEGER REFERENCES sales(id) ON DELETE SET NULL,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    qty          NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (qty > 0),
    status       VARCHAR(15) NOT NULL DEFAULT 'por_entregar'
                 CHECK (status IN ('por_entregar', 'entregado', 'anulado')),
    notes        TEXT,
    assigned_by  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    delivered_at TIMESTAMPTZ,
    voided_by    INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    voided_at    TIMESTAMPTZ,
    void_reason  TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS cobranza_regalos_number ON cobranza_regalos (company_id, number);
  CREATE INDEX IF NOT EXISTS cobranza_regalos_customer ON cobranza_regalos (customer_id);
  CREATE INDEX IF NOT EXISTS cobranza_regalos_pending
    ON cobranza_regalos (company_id, warehouse_id, product_id) WHERE status = 'por_entregar';
  CREATE INDEX IF NOT EXISTS cobranza_regalos_sale ON cobranza_regalos (sale_id) WHERE sale_id IS NOT NULL;

  -- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
  ALTER TABLE cobranza_regalos ENABLE ROW LEVEL SECURITY;
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(SQL_UP);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS cobranza_regalos;`);
  },
};
