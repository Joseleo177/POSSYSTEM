-- "Agotado" manual de las opciones de adicionales (migración 20261031140000-agotados.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend que lo usa, después de
-- 20261031-adicionales.sql. Es idempotente.

BEGIN;

ALTER TABLE modifier_options ADD COLUMN IF NOT EXISTS sold_out BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261031140000-agotados.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261031140000-agotados.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT 'modifier_options.sold_out' AS columna_faltante
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'modifier_options' AND column_name = 'sold_out'
 );
