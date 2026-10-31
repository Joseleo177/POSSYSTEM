-- "Aparecer en Google" (migración 20261102100000-company-seo-enabled.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo de empresas ya
-- pide esta columna, y sin ella falla hasta el inicio de sesión. Es idempotente.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS seo_enabled BOOLEAN NOT NULL DEFAULT true;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261102100000-company-seo-enabled.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261102100000-company-seo-enabled.js');

COMMIT;

-- Verificación final: debe devolver UNA fila con seo_enabled.
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'seo_enabled';
