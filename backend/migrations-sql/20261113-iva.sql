-- IVA, fase 1 (migración 20261113100000-iva.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: crear cualquier línea de
-- venta lee products.iva_tipo y escribe sale_items.iva_rate. Es idempotente.

BEGIN;

ALTER TABLE companies  ADD COLUMN IF NOT EXISTS iva_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products   ADD COLUMN IF NOT EXISTS iva_tipo VARCHAR(1) NOT NULL DEFAULT 'G';
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS iva_rate NUMERIC(5, 2);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_iva_tipo_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_iva_tipo_check CHECK (iva_tipo IN ('G', 'R', 'A', 'E'));
  END IF;
END $$;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261113100000-iva.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261113100000-iva.js');

COMMIT;

-- Verificación final: debe devolver TRES filas.
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'companies'  AND column_name = 'iva_enabled')
     OR (table_name = 'products'   AND column_name = 'iva_tipo')
     OR (table_name = 'sale_items' AND column_name = 'iva_rate'));
