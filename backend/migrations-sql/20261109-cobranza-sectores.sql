-- Cobranza por sectores (migración 20261109100000-cobranza-sectores.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo Customer ya lee
-- customers.sector_id, y sin la columna falla todo lo que toca clientes (POS incluido).
-- Es idempotente. El módulo queda apagado: se enciende por empresa en Empresas.

BEGIN;
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

INSERT INTO "SequelizeMeta" (name)
SELECT '20261109100000-cobranza-sectores.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261109100000-cobranza-sectores.js');

COMMIT;

-- Verificación: dos filas con rowsecurity = true, y la columna customers.sector_id.
SELECT tablename, rowsecurity FROM pg_tables
 WHERE schemaname = 'public' AND tablename IN ('cobranza_sectors', 'cobranza_sector_employees');
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'sector_id';
