-- Comisiones por vendedor (migración 20261105100000-comisiones.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo Company pide
-- comisiones_enabled y el de Sale pide seller_id, así que sin esto fallan el login y la caja.
-- Es idempotente: se puede correr dos veces sin daño.
--
-- El módulo va con el interruptor «Comisiones por vendedor» de Empresas (apagado).

BEGIN;

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
-- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;

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
ALTER TABLE commission_payouts ENABLE ROW LEVEL SECURITY;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261105100000-comisiones.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261105100000-comisiones.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('companies', 'comisiones_enabled'), ('sellers', 'commission_pct'),
    ('sales', 'seller_id'), ('sales', 'seller_pct'), ('commission_payouts', 'expense_id')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
