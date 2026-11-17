-- Reporte de mermas: costo en cada línea de ajuste (migración 20261121110000-costo-lineas-ajuste.js).
-- Correr en el editor SQL de Supabase ANTES de desplegar el backend: el modelo StockSessionLine
-- escribe esta columna. Sin ella fallan los ajustes de inventario, las compras y la importación.
-- Es idempotente.

BEGIN;
ALTER TABLE stock_session_lines ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(14,5);
CREATE INDEX IF NOT EXISTS idx_stock_session_lines_reason ON stock_session_lines (reason, created_at);

INSERT INTO "SequelizeMeta" (name)
SELECT '20261121110000-costo-lineas-ajuste.js'
 WHERE NOT EXISTS (SELECT 1 FROM "SequelizeMeta" WHERE name = '20261121110000-costo-lineas-ajuste.js');
COMMIT;
