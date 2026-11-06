-- Moneda local explícita y tasas alternas (migración 20261114100000-tasas-alternas.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo Currency lee
-- is_local y rate_of_id, y sin las columnas falla cualquier consulta de monedas (y con ella el
-- login). Es idempotente.

BEGIN;
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS is_local BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS rate_of_id INTEGER REFERENCES currencies(id) ON DELETE CASCADE;
-- Se actualiza sola con "Sincronizar tasas". Apagada en las tasas que pone la tienda (USDT, pesos de frontera).
ALTER TABLE currencies ADD COLUMN IF NOT EXISTS auto_sync BOOLEAN NOT NULL DEFAULT true;

DROP INDEX IF EXISTS currencies_code_company_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS currencies_code_company_id_unique
  ON currencies (code, company_id) WHERE rate_of_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS currencies_alterna_nombre
  ON currencies (rate_of_id, name) WHERE rate_of_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS currencies_una_local
  ON currencies (company_id) WHERE is_local;

UPDATE currencies SET is_local = true
 WHERE id IN (
   SELECT DISTINCT ON (company_id) id FROM currencies
    WHERE NOT is_base AND rate_of_id IS NULL
    ORDER BY company_id, (code <> 'VES'), id
 )
   AND NOT EXISTS (SELECT 1 FROM currencies x WHERE x.company_id = currencies.company_id AND x.is_local);

ALTER TABLE payment_journal_methods ADD COLUMN IF NOT EXISTS rate_currency_id INTEGER
  REFERENCES currencies(id) ON DELETE SET NULL;

INSERT INTO "SequelizeMeta" (name)
SELECT '20261114100000-tasas-alternas.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261114100000-tasas-alternas.js');

COMMIT;
