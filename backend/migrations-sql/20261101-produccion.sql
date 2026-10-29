-- Producción de cocina (migración 20261101110000-produccion.js). Correr en el editor SQL de
-- Supabase DESPUÉS de 20261101-recetas.sql y ANTES de desplegar el backend: el modelo
-- RecipeSheet ya incluye kind y batch_yield. Es idempotente.

BEGIN;

ALTER TABLE recipe_sheets ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'plato';
ALTER TABLE recipe_sheets ADD COLUMN IF NOT EXISTS batch_yield NUMERIC(12,3);

CREATE TABLE IF NOT EXISTS preparation_items (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prep_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity      NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  net_quantity  NUMERIC(12,3),
  waste_pct     NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (waste_pct >= 0 AND waste_pct < 100)
);
CREATE INDEX IF NOT EXISTS preparation_items_prep ON preparation_items (prep_id);
CREATE INDEX IF NOT EXISTS preparation_items_product ON preparation_items (product_id);
ALTER TABLE preparation_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS production_batches (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number          INTEGER NOT NULL,
  warehouse_id    INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batches         NUMERIC(8,2) NOT NULL DEFAULT 1 CHECK (batches > 0),
  expected_yield  NUMERIC(12,3),
  actual_yield    NUMERIC(12,3) NOT NULL CHECK (actual_yield > 0),
  total_cost      NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_cost       NUMERIC(14,4) NOT NULL DEFAULT 0,
  notes           VARCHAR(300),
  status          VARCHAR(10) NOT NULL DEFAULT 'hecha' CHECK (status IN ('hecha', 'anulada')),
  employee_id     INTEGER,
  annulled_at     TIMESTAMPTZ,
  annulled_by     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, number)
);
CREATE INDEX IF NOT EXISTS production_batches_product ON production_batches (product_id);
ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS production_batch_items (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  batch_id      INTEGER NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  expected_qty  NUMERIC(12,3),
  actual_qty    NUMERIC(12,3) NOT NULL CHECK (actual_qty > 0),
  unit_cost     NUMERIC(14,4) NOT NULL DEFAULT 0,
  cost          NUMERIC(14,4) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS production_batch_items_batch ON production_batch_items (batch_id);
ALTER TABLE production_batch_items ENABLE ROW LEVEL SECURITY;

UPDATE roles
   SET permissions = permissions || '{"production.view": true, "production.manage": true}'::jsonb
 WHERE ((permissions->>'kitchen.manage') = 'true' OR (permissions->>'inventory.adjust') = 'true'
        OR (permissions->>'inventory') = 'true')
   AND permissions->>'production.manage' IS NULL;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261101110000-produccion.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261101110000-produccion.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT t AS tabla_faltante FROM (VALUES ('preparation_items'), ('production_batches'), ('production_batch_items')) v(t)
 WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v.t)
UNION ALL
SELECT 'recipe_sheets.batch_yield'
 WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'recipe_sheets' AND column_name = 'batch_yield');
