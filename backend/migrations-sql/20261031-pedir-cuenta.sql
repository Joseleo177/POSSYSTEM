-- "Pidió la cuenta" en las mesas (migración 20261031150000-pedir-cuenta.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend que lo usa, después de
-- 20261031-agotados.sql. Es idempotente.

BEGIN;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS bill_requested_at TIMESTAMPTZ NULL;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261031150000-pedir-cuenta.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261031150000-pedir-cuenta.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT 'sales.bill_requested_at' AS columna_faltante
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'bill_requested_at'
 );
