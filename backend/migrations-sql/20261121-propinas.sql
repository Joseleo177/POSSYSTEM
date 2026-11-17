-- Propinas (migración 20261121120000-propinas.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: los modelos Company y Sale
-- leen estas columnas. Sin ellas fallan el inicio de sesión y la caja.
-- Requiere que ya exista la tabla sellers (migración de comisiones, 20261105).
-- Es idempotente.

BEGIN;
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
ALTER TABLE tip_payouts ENABLE ROW LEVEL SECURITY;

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
ALTER TABLE tip_reassignments ENABLE ROW LEVEL SECURITY;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261121120000-propinas.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261121120000-propinas.js');

COMMIT;

-- Encender el extra en el restaurante (cambiar el id), o desde Empresas → editar → Propinas:
-- UPDATE companies SET propinas_enabled = true WHERE id = 0000;

-- Verificación final: debe devolver CERO filas.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('companies', 'propinas_enabled'), ('sales', 'service_charge_is_tip'), ('sales', 'tip_seller_id'),
    ('sales', 'tip_pool'), ('tip_payouts', 'from_pool'), ('tip_reassignments', 'to_pool')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
