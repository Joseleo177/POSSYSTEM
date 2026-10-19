-- VENTAS SIN CONEXIÓN, en SQL para el editor de Supabase.
--
-- Equivale a correr `db:migrate` con 20261019100000-ventas-sin-conexion y la registra en
-- SequelizeMeta. No crea tablas nuevas, así que no hace falta activar RLS.
-- Se puede correr dos veces sin daño (IF NOT EXISTS / ON CONFLICT).

BEGIN;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_at TIMESTAMPTZ;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS offline_ref VARCHAR(40);
CREATE INDEX IF NOT EXISTS sales_offline_at_idx ON sales (offline_at) WHERE offline_at IS NOT NULL;

-- Una venta sin conexión que llega cuando ya no hay existencias entra igual y deja el
-- producto en negativo (la mercancía ya salió). Los caminos en línea siguen validando.
ALTER TABLE product_stock DROP CONSTRAINT IF EXISTS product_stock_qty_check;
ALTER TABLE products      DROP CONSTRAINT IF EXISTS products_stock_check;

INSERT INTO "SequelizeMeta" (name) VALUES ('20261019100000-ventas-sin-conexion.js')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- Comprobación: debe devolver las dos columnas y 0 restricciones de stock.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'sales' AND column_name IN ('offline_at', 'offline_ref');
SELECT count(*) AS restricciones_stock_restantes
  FROM pg_constraint
 WHERE conname IN ('product_stock_qty_check', 'products_stock_check');
