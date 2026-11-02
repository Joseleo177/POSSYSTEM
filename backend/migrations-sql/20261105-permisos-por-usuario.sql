-- Permisos por usuario (migración 20261105110000-permisos-por-usuario.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el login, la renovación de
-- la sesión y la comprobación de cada petición leen esta columna; sin ella nadie entra.
-- Es idempotente.

BEGIN;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS permission_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261105110000-permisos-por-usuario.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261105110000-permisos-por-usuario.js');

COMMIT;

-- Verificación final: debe devolver UNA fila.
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'permission_overrides';
