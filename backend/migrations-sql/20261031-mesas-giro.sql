-- Giro de las mesas en el plano (migración 20261031160000-mesas-giro.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend que lo usa, después de
-- 20261031-pedir-cuenta.sql. Es idempotente.

BEGIN;

ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS rotation SMALLINT NOT NULL DEFAULT 0;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261031160000-mesas-giro.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261031160000-mesas-giro.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT 'dining_tables.rotation' AS columna_faltante
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dining_tables' AND column_name = 'rotation'
 );
