-- Historial de tasas (migración 20261108100000-historial-tasas.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: cambiar la tasa escribe en
-- currency_rates, y el cobro con fecha anterior la consulta. Es idempotente: el relleno con los
-- cobros ya registrados no pisa días que ya tengan tasa.

BEGIN;
CREATE TABLE IF NOT EXISTS currency_rates (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  currency_id INTEGER NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
  rate_date   DATE NOT NULL,
  rate        DECIMAL(14, 6) NOT NULL CHECK (rate > 0),
  -- 'bcv', 'er-api', 'manual' (Monedas o el aviso del BCV), 'registro' (reconstruida de
  -- ventas y cobros) o 'correccion' (editada después en el historial).
  source      VARCHAR(20) NOT NULL DEFAULT 'manual',
  employee_id INTEGER,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS currency_rates_company_currency_date
  ON currency_rates (company_id, currency_id, rate_date);
-- Como todas las tablas de public: RLS activo y sin políticas (solo entra el backend).
ALTER TABLE currency_rates ENABLE ROW LEVEL SECURITY;

INSERT INTO currency_rates (company_id, currency_id, rate_date, rate, source)
SELECT DISTINCT ON (company_id, currency_id, d) company_id, currency_id, d, r, 'registro'
  FROM (
    SELECT company_id, currency_id, d, r, COUNT(*) AS n, MAX(at) AS ultimo
      FROM (
        SELECT p.company_id, p.currency_id, (p.created_at AT TIME ZONE 'America/Caracas')::date AS d,
               ROUND(p.exchange_rate, 6) AS r, p.created_at AS at
          FROM payments p
          JOIN currencies c ON c.id = p.currency_id AND NOT c.is_base
          JOIN sales s ON s.id = p.sale_id
         WHERE p.exchange_rate > 1 AND COALESCE(s.fx_rate, 0) = 0
        UNION ALL
        SELECT s.company_id, s.currency_id, (s.created_at AT TIME ZONE 'America/Caracas')::date,
               ROUND(s.exchange_rate, 6), s.created_at
          FROM sales s
          JOIN currencies c ON c.id = s.currency_id AND NOT c.is_base
         WHERE s.exchange_rate > 1
      ) usos
     WHERE company_id IS NOT NULL
     GROUP BY company_id, currency_id, d, r
  ) dias
 WHERE d < (NOW() AT TIME ZONE 'America/Caracas')::date
 ORDER BY company_id, currency_id, d, n DESC, ultimo DESC
ON CONFLICT (company_id, currency_id, rate_date) DO NOTHING;

-- Hoy manda la tasa cargada en este momento.
INSERT INTO currency_rates (company_id, currency_id, rate_date, rate, source)
SELECT company_id, id, (NOW() AT TIME ZONE 'America/Caracas')::date, exchange_rate, 'manual'
  FROM currencies
 WHERE NOT is_base AND company_id IS NOT NULL AND exchange_rate > 0
ON CONFLICT (company_id, currency_id, rate_date) DO UPDATE SET rate = EXCLUDED.rate, updated_at = NOW();

INSERT INTO "SequelizeMeta" (name)
SELECT '20261108100000-historial-tasas.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261108100000-historial-tasas.js');

COMMIT;

-- Verificación: rowsecurity = true, y cuántos días quedaron por empresa.
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'currency_rates';
SELECT company_id, COUNT(*) AS dias, MIN(rate_date) AS desde, MAX(rate_date) AS hasta
  FROM currency_rates GROUP BY company_id ORDER BY company_id;
