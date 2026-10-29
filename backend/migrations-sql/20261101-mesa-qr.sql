-- QR de las mesas (migración 20261101120000-mesa-qr.js). Correr en el editor SQL de Supabase
-- ANTES de desplegar el backend: el modelo DiningTable ya incluye public_token. Es idempotente.

BEGIN;

ALTER TABLE dining_tables ADD COLUMN IF NOT EXISTS public_token VARCHAR(32);
UPDATE dining_tables
   SET public_token = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 20)
 WHERE public_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dining_tables_public_token ON dining_tables (public_token);

INSERT INTO "SequelizeMeta" (name)
SELECT '20261101120000-mesa-qr.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261101120000-mesa-qr.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT 'mesas sin código' AS problema, COUNT(*) FROM dining_tables WHERE public_token IS NULL HAVING COUNT(*) > 0;
