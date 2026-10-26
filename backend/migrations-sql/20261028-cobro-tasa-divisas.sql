-- Cobro a tasa de divisas (migración 20261028100000-cobro-tasa-divisas.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend que lo usa: sin las
-- columnas, cualquier venta falla con "column fx_rate does not exist".
-- Es idempotente: se puede correr dos veces sin daño.
--
-- El permiso nuevo `sales.fx` no se concede a nadie aquí: lo tiene el administrador y al resto
-- se le da desde Configuración → Roles.

BEGIN;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS fx_rate        DECIMAL(12, 6);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS fx_currency_id INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS fx_discount    DECIMAL(14, 5) NOT NULL DEFAULT 0;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261028100000-cobro-tasa-divisas.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261028100000-cobro-tasa-divisas.js');

-- Segunda parte (migración 20261028110000-tasa-divisas-base-y-rebaja.js): tasa del sistema con
-- que se calculó la rebaja (para el ticket en Bs) y la parte exonerada que es rebaja por tasa.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS fx_base_rate   DECIMAL(12, 6);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS fx_forgiven    DECIMAL(14, 6) NOT NULL DEFAULT 0;
UPDATE sales SET fx_base_rate = exchange_rate
 WHERE fx_rate IS NOT NULL AND fx_base_rate IS NULL AND exchange_rate > 1;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261028110000-tasa-divisas-base-y-rebaja.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261028110000-tasa-divisas-base-y-rebaja.js');

COMMIT;

-- Verificación final: debe devolver CERO filas.
SELECT esperado.t AS tabla, esperado.c AS columna_faltante
  FROM (VALUES
    ('sales', 'fx_rate'), ('sales', 'fx_currency_id'), ('sales', 'fx_discount'),
    ('sales', 'fx_base_rate'), ('sales', 'fx_forgiven')
  ) AS esperado(t, c)
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.columns ic
    WHERE ic.table_schema = 'public' AND ic.table_name = esperado.t AND ic.column_name = esperado.c
 );
