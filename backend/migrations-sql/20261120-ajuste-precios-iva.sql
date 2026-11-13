-- Ajuste de precios con IVA (Catálogo → IVA → Precios), migración 20261120100000-ajuste-precios-iva.js.
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend. Es idempotente. Va después de
-- 20261117-declaracion-iva.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS iva_price_adjustments (
  id           SERIAL PRIMARY KEY,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direccion    VARCHAR(6) NOT NULL,
  redondeo     VARCHAR(8) NOT NULL DEFAULT 'exacto',
  alcance      JSONB,
  productos    INTEGER NOT NULL DEFAULT 0,
  cambios      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deshecho_at  TIMESTAMPTZ,
  deshecho_by  INTEGER REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS iva_price_adjustments_company ON iva_price_adjustments (company_id, id DESC);
-- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
ALTER TABLE iva_price_adjustments ENABLE ROW LEVEL SECURITY;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261120100000-ajuste-precios-iva.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261120100000-ajuste-precios-iva.js');

COMMIT;

-- Verificación final: debe devolver UNA fila.
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'iva_price_adjustments';
