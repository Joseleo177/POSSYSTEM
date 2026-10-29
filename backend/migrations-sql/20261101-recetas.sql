-- Recetas de cocina (migración 20261101100000-recetas.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo SaleItem ya
-- incluye sale_items.components y sin la columna falla cualquier consulta de ventas. Es
-- idempotente.

BEGIN;

ALTER TABLE product_combo_items ADD COLUMN IF NOT EXISTS net_quantity NUMERIC(10,3);
ALTER TABLE product_combo_items ADD COLUMN IF NOT EXISTS waste_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE product_combo_items ADD CONSTRAINT product_combo_items_waste_check CHECK (waste_pct >= 0 AND waste_pct < 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS recipe_sheets (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  instructions  TEXT,
  prep_minutes  INTEGER CHECK (prep_minutes IS NULL OR prep_minutes BETWEEN 0 AND 1440),
  combo_since   TIMESTAMPTZ,
  updated_by    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS recipe_sheets_company ON recipe_sheets (company_id);
ALTER TABLE recipe_sheets ENABLE ROW LEVEL SECURITY;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS components JSONB;
-- Índice parcial: la columna nace vacía, así que se crea al instante aunque sale_items sea grande.
CREATE INDEX IF NOT EXISTS sale_items_components_gin
    ON sale_items USING GIN (components jsonb_path_ops) WHERE components IS NOT NULL;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261101100000-recetas.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261101100000-recetas.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT faltante FROM (VALUES
  ('product_combo_items', 'net_quantity'),
  ('product_combo_items', 'waste_pct'),
  ('recipe_sheets', 'combo_since'),
  ('sale_items', 'components')
) AS v(tabla, columna)
CROSS JOIN LATERAL (SELECT v.tabla || '.' || v.columna AS faltante) f
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = v.tabla AND column_name = v.columna
 );
