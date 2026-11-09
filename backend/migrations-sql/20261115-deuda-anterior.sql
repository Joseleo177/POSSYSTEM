-- Deuda anterior de un cliente (migración 20261115100000-deuda-anterior.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo Sale lee
-- is_prior_debt y prior_debt_note, y sin las columnas falla cualquier consulta de ventas (la
-- caja, los cobros, los reportes). Es idempotente.

BEGIN;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_prior_debt BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS prior_debt_note VARCHAR(300);

INSERT INTO "SequelizeMeta" (name)
SELECT '20261115100000-deuda-anterior.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261115100000-deuda-anterior.js');

COMMIT;
