-- Pantalla de cocina (migración 20261031100000-cocina.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend que lo usa. Es
-- idempotente: se puede correr dos veces sin daño.
--
-- El módulo se enciende por empresa en Empresas → «Cocina», y el permiso se da desde Roles
-- (de entrada solo lo tiene el administrador).

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS cocina_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS kitchen_status VARCHAR(12);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS kitchen_status_at TIMESTAMPTZ;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS kitchen_ready_at TIMESTAMPTZ;

-- Sin CONCURRENTLY: el editor envuelve todo en una transacción. La tabla de ventas se bloquea
-- unos instantes mientras se arma; correrlo fuera del horario de ventas.
CREATE INDEX IF NOT EXISTS sales_kitchen_activas
    ON sales (company_id, kitchen_status)
 WHERE kitchen_status IN ('nueva', 'preparando', 'lista');

INSERT INTO "SequelizeMeta" (name)
SELECT '20261031100000-cocina.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261031100000-cocina.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('companies', 'cocina_enabled'), ('sales', 'kitchen_status'),
    ('sales', 'kitchen_status_at'), ('sales', 'kitchen_ready_at')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
